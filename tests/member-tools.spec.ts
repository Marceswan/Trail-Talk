import {test,expect,register} from './fixtures';
import {DatabaseSync} from 'node:sqlite';
import type {APIRequestContext} from '@playwright/test';
import type {Comment,Post,InboxData} from '@/lib/types';
const change=(r:APIRequestContext,data:Record<string,unknown>)=>r.post('/api/community',{data});
async function create(r:APIRequestContext,title='A member-owned conversation'){
  const response=await change(r,{action:'post',community:'salesforce',tag:'Discussion',title,body:'A useful conversation with enough context to discuss.'});expect(response.ok()).toBe(true);return (await response.json()).createdId as number;
}
async function comments(r:APIRequestContext,id:number):Promise<Comment[]>{return(await(await r.get(`/api/community?post=${id}`)).json()).comments;}
async function inbox(r:APIRequestContext,query=''):Promise<InboxData>{return(await(await r.get(`/api/notifications${query}`)).json());}

test('edits enforce ownership, revisions and moderation without losing votes or replies',async({request,playwright})=>{
  const other=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});const identity=await register(other,'Other Member');
  const id=await create(request);await change(request,{action:'comment',postId:id,body:'Original comment.'});const c=(await comments(request,id))[0];
  const edit={action:'editPost',postId:id,revision:0,title:'A clarified conversation',body:'Updated context that keeps the conversation intact.'};
  const editComment={action:'editComment',commentId:c.id,revision:0,body:'A clarified comment.'};
  expect((await change(other,edit)).status()).toBe(403);expect((await change(other,editComment)).status()).toBe(403);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare("UPDATE profiles SET role='moderator' WHERE email=?").run(identity.email);
  expect((await change(other,edit)).status()).toBe(403);
  expect((await change(request,{...edit,revision:undefined})).status()).toBe(400);
  expect((await change(request,{...edit,body:'short'})).status()).toBe(400);
  await change(other,{action:'vote',postId:id,value:1});await change(other,{action:'commentVote',commentId:c.id,value:1});
  await change(other,{action:'comment',postId:id,parentId:c.id,body:'A reply that survives edits.'});
  expect((await change(request,edit)).status()).toBe(200);expect((await change(request,editComment)).status()).toBe(200);
  expect((await change(request,{...edit,title:'A stale draft should not replace this'})).status()).toBe(409);
  expect((await change(request,{...editComment,body:'A stale comment draft.'})).status()).toBe(409);
  const post=(await(await request.get('/api/community')).json()).posts.find((p:Post)=>p.id===id);
  expect(post).toMatchObject({owned:1,revision:1,title:edit.title,comment_count:2,score:1});expect(post.edited_at).toBeGreaterThan(0);expect(post).not.toHaveProperty('owner');
  expect((await comments(request,id)).find(row=>row.id===c.id)).toMatchObject({body:editComment.body,owned:1,revision:1,score:1});
  expect((await comments(other,id)).find(row=>row.id===c.id)?.owned).toBe(0);
  d.prepare('UPDATE posts SET locked=1 WHERE id=?').run(id);
  expect((await change(request,{...edit,revision:1})).status()).toBe(403);expect((await change(request,{...editComment,revision:1})).status()).toBe(403);
  d.prepare('UPDATE posts SET locked=0,removed=1 WHERE id=?').run(id);
  expect((await change(request,{...edit,revision:1})).status()).toBe(404);expect((await change(request,{...editComment,revision:1})).status()).toBe(404);
  d.prepare('UPDATE posts SET removed=0 WHERE id=?').run(id);d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(c.id);
  expect((await change(request,{...editComment,revision:1})).status()).toBe(404);
  const email=(await(await request.get('/api/community')).json()).profile.email;d.prepare('UPDATE profiles SET suspended=1 WHERE email=?').run(email);
  expect((await change(request,{...edit,revision:1})).status()).toBe(403);
  d.close();await other.dispose();
});

test('inbox isolates recipients, deduplicates replies, hides removed content and paginates',async({request,playwright})=>{
  const sender=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(sender,'Reply Author');
  const third=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(third,'Third Member');
  const guest=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  expect((await guest.get('/api/notifications')).status()).toBe(401);await guest.dispose();
  const id=await create(request);await change(request,{action:'comment',postId:id,body:'My own comment makes no alert.'});
  expect((await inbox(request)).unread).toBe(0);const root=(await comments(request,id))[0];
  await change(sender,{action:'comment',postId:id,parentId:root.id,body:'One reply, even when you own both post and comment.'});
  let list=await inbox(request);expect(list.items).toHaveLength(1);expect(list.unread).toBe(1);expect(list.items[0].kind).toBe('reply');
  expect((await inbox(sender)).unread).toBe(0);expect((await inbox(third)).items).toHaveLength(0);
  expect((await third.post('/api/notifications',{data:{action:'read',id:list.items[0].id}})).status()).toBe(404);
  const child=(await comments(sender,id))[0];
  await change(sender,{action:'editComment',commentId:child.id,revision:0,body:'Updated notification text without a second alert.'});
  list=await inbox(request);expect(list.items).toHaveLength(1);expect(list.items[0].body).toContain('Updated notification text');
  await change(third,{action:'comment',postId:id,parentId:child.id,body:'A reply for both the post owner and parent author.'});
  expect((await inbox(request)).unread).toBe(2);expect((await inbox(sender)).items[0].kind).toBe('reply');expect((await inbox(third)).unread).toBe(0);
  for(let n=0;n<2;n++)expect((await request.post('/api/notifications',{data:{action:'read',id:list.items[0].id}})).status()).toBe(200);
  expect((await inbox(request,'?unread=1')).items).toHaveLength(1);
  await request.post('/api/notifications',{data:{action:'readAll'}});expect((await inbox(request)).unread).toBe(0);
  for(let n=0;n<22;n++)await change(sender,{action:'comment',postId:id,body:`Pagination comment ${n}.`});
  const first=await inbox(request);expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();expect(first.unread).toBe(22);
  const second=await inbox(request,`?before=${first.nextCursor}`);expect(second.items).toHaveLength(4);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(n=>n.id)).size).toBe(24);
  expect((await request.get('/api/notifications?before=bad')).status()).toBe(400);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(first.items[0].comment_id);
  expect((await inbox(request)).unread).toBe(21);expect((await inbox(request)).items.some(n=>n.comment_id===first.items[0].comment_id)).toBe(false);
  d.prepare('UPDATE posts SET removed=1 WHERE id=?').run(id);expect((await inbox(request)).items).toHaveLength(0);expect((await inbox(request)).unread).toBe(0);
  d.close();await sender.dispose();await third.dispose();
});

test('My posts and inline editing persist, retain failed drafts and fit mobile',async({page})=>{
  const id=await create(page.request,'My editable member conversation');await change(page.request,{action:'comment',postId:id,body:'My first editable comment.'});
  await page.goto('/?view=mine');await expect(page.locator('.post-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Edit My editable member conversation',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Title',{exact:true}).fill('My updated member conversation');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.post-title-button').click();await expect(page.locator('.thread-post h1')).toHaveText('My updated member conversation');
  await page.setViewportSize({width:320,height:740});await page.getByRole('button',{name:'Edit your comment',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit your comment',exact:true}).fill('My updated comment draft.');
  await page.route('**/api/community',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='editComment')await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'This content changed in another tab. Copy your draft, reload, and try again.'})});else await route.continue();});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('.edit-comment-form [role=alert]')).toContainText('changed in another tab');
  await expect(page.getByRole('textbox',{name:'Edit your comment',exact:true})).toHaveValue('My updated comment draft.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.unroute('**/api/community');await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.comment')).toContainText('My updated comment draft.');await page.reload();await expect(page.locator('.comment')).toContainText('My updated comment draft.');
  await expect(page.locator('.comment .edited-label')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('inbox UI counts unread, marks activity read, opens comment permalinks and supports signed-out access',async({page,playwright})=>{
  const id=await create(page.request,'Your inbox conversation');const sender=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(sender,'Inbox Friend');
  await change(sender,{action:'comment',postId:id,body:'Your first real notification.'});
  await page.goto('/');await expect(page.getByRole('link',{name:'Notifications, 1 unread',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Notifications, 1 unread',exact:true}).click();await expect(page.locator('.inbox-item')).toHaveCount(1);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:850});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/inbox-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'Mark read',exact:true}).click();await expect(page.locator('.inbox-item.is-unread')).toHaveCount(0);
  await page.getByRole('button',{name:'Unread',exact:true}).click();await expect(page.getByRole('heading',{name:'You’re all caught up.'})).toBeVisible();
  await page.getByRole('button',{name:'All activity',exact:true}).click();await page.getByRole('link',{name:'Your inbox conversation',exact:true}).click();
  await expect(page.locator('.comment.is-linked')).toContainText('Your first real notification.');await expect(page.locator('.comment.is-linked')).toBeInViewport();
  await change(sender,{action:'comment',postId:id,body:'Another notification to mark all read.'});await page.goto('/notifications');await page.getByRole('button',{name:'Mark all read',exact:true}).click();
  await expect(page.locator('.inbox-item.is-unread')).toHaveCount(0);await page.reload();await expect(page.locator('.inbox-item')).toHaveCount(2);
  await page.request.post('/api/account',{data:{action:'logout'}});await page.reload();await expect(page.getByRole('heading',{name:'Your conversations, in one place.'})).toBeVisible();await expect(page.locator('.inbox-item')).toHaveCount(0);
  await sender.dispose();
});
