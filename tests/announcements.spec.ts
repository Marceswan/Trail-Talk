import {test,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {register} from './fixtures';

function role(email:string,value:'user'|'moderator'|'admin') {
  const db=new DatabaseSync(process.env.TEST_DATABASE_PATH!);
  try { db.prepare('UPDATE profiles SET role=? WHERE email=?').run(value,email); }
  finally { db.close(); }
}
const announcement={action:'post',community:'announcements',tag:'Announcements',title:'Welcome from the TrailTalk team',body:'Community updates from your TrailTalk team.'};

test('announcements enforce current roles on creation and edits while allowing public reading and member replies',async({request,playwright})=>{
  expect((await request.post('/api/community',{data:announcement})).status()).toBe(401);
  const identity=await register(request,'Announcement Author');
  expect((await request.post('/api/community',{data:{...announcement,role:'admin'}})).status()).toBe(403);
  expect((await request.post('/api/community',{data:{...announcement,tag:'Discussion'}})).status()).toBe(403);
  expect((await request.post('/api/community',{data:{...announcement,community:'salesforce'}})).status()).toBe(403);
  const reader=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    for(const staffRole of ['admin','moderator'] as const) {
      role(identity.email,staffRole);
      const created=await request.post('/api/community',{data:announcement});
      expect(created.status()).toBe(200);
      const id=(await created.json()).createdId;
      expect((await reader.get(`/posts/${id}`)).status()).toBe(200);
      const edit={action:'editPost',postId:id,revision:0,title:announcement.title,body:'Updated announcement from the team.'};
      expect((await request.post('/api/community',{data:edit})).status()).toBe(200);
      role(identity.email,'user');
      expect((await request.post('/api/community',{data:{...edit,revision:1}})).status()).toBe(403);
      expect((await request.post('/api/community',{data:{action:'comment',postId:id,body:'Thanks for the update!'}})).status()).toBe(200);
      expect((await request.post('/api/community',{data:{...announcement,community:'salesforce',tag:'Discussion'}})).status()).toBe(200);
    }
  } finally { await reader.dispose(); }
});

test('composer hides restricted choices from members and preserves restricted drafts after demotion',async({page})=>{
  const identity=await register(page.request,'Announcement Composer');
  await page.goto('/?community=announcements');
  await expect(page.locator('.account-banner')).toContainText('Only admins and moderators');
  await page.getByRole('button',{name:'Create post',exact:true}).click();
  await expect(page.getByLabel('Community',{exact:true}).locator('option[value="announcements"]')).toHaveCount(0);
  await expect(page.getByLabel('Topic',{exact:true}).locator('option[value="Announcements"]')).toHaveCount(0);
  role(identity.email,'moderator');
  await page.reload();
  await page.getByRole('button',{name:'Create post',exact:true}).click();
  await expect(page.getByLabel('Community',{exact:true})).toHaveValue('announcements');
  await expect(page.getByLabel('Topic',{exact:true})).toHaveValue('Announcements');
  await page.getByLabel('Title',{exact:true}).fill('Draft announcement to preserve');
  await page.getByLabel('Your post',{exact:true}).fill('This draft must survive a change in permissions.');
  await expect(page.getByRole('status').filter({hasText:'Draft saved'})).toBeVisible();
  role(identity.email,'user');
  await page.reload();
  await page.getByRole('button',{name:'Create post',exact:true}).click();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Draft announcement to preserve');
  await expect(page.getByRole('button',{name:'Publish post'})).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Only admins and moderators');
  await page.getByLabel('Community',{exact:true}).selectOption('salesforce');
  await page.getByLabel('Topic',{exact:true}).selectOption('Discussion');
  await expect(page.getByRole('button',{name:'Publish post'})).toBeEnabled();
});
