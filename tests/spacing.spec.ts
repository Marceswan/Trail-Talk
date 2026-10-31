import {test,expect,password,register} from './fixtures';
import type {Page} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

async function dialogSpacing(page:Page){
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const sizes=await dialog.evaluate(el=>{
    const box=el.getBoundingClientRect(),body=el.querySelector('.dialog-body')!,heading=el.querySelector('.dialog-heading h2')!;
    const content=body.firstElementChild!;const first=content.getBoundingClientRect();
    const fields=Array.from(body.querySelectorAll('input:not([type=checkbox]),select,textarea:not([hidden]),.markdown-editor,.account-tabs,.directory-card'));
    return {left:first.left-box.left,right:box.right-first.right,aligned:Math.abs(first.left-heading.getBoundingClientRect().left),top:box.top,bottom:box.bottom,height:innerHeight,
      overflow:body.scrollWidth>body.clientWidth+1,
      edgeFields:fields.filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.left<box.left+15||b.right>box.right-15);}).map(e=>e.tagName)};
  });
  expect(sizes.left).toBeGreaterThanOrEqual(16);expect(sizes.right).toBeGreaterThanOrEqual(16);expect(sizes.aligned).toBeLessThanOrEqual(1);
  expect(sizes.top).toBeGreaterThanOrEqual(0);expect(sizes.bottom).toBeLessThanOrEqual(sizes.height);expect(sizes.overflow).toBe(false);expect(sizes.edgeFields).toEqual([]);
  await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeInViewport();
}
async function screenshot(page:Page,name:string){await page.screenshot({path:`test-results/spacing-${name}.png`,animations:'disabled'});}

test('account forms and recovery sheet have aligned insets and reachable controls across screen sizes',async({page})=>{
  await page.request.post('/api/account',{data:{action:'logout'}});await page.goto('/');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:800});
    for(const mode of ['Sign in','Create account','Recover account']){
      await page.locator('.account-tabs').getByRole('button',{name:mode,exact:true}).click();
      await page.locator('.dialog-body').evaluate(e=>e.scrollTop=0);await dialogSpacing(page);
      const tabs=await page.locator('.account-tabs button').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().height));
      expect(Math.max(...tabs)-Math.min(...tabs)).toBeLessThan(1);
      await page.locator('.stack-form .primary-button').scrollIntoViewIfNeeded();await expect(page.locator('.stack-form .primary-button')).toBeInViewport();
      if(mode==='Sign in'||width===390){await page.locator('.dialog-body').evaluate(e=>e.scrollTop=0);await screenshot(page,`account-${mode.replaceAll(' ','-')}-${width}`);}
    }
  }
  await page.setViewportSize({width:320,height:640});await page.locator('.account-tabs').getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Display name',{exact:true}).fill('Spacing Tester');await page.getByLabel('Email',{exact:true}).fill(`spacing-${randomUUID()}@example.com`);
  await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);
  await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();await expect(page.locator('.recovery-sheet')).toBeVisible();
  await dialogSpacing(page);await page.getByLabel('I saved my recovery codes').check();await page.getByRole('button',{name:'Continue',exact:true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeInViewport();await screenshot(page,'recovery-320');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
});

test('post, profile, report, directory and about dialogs share consistent spacing without clipping',async({page})=>{
  test.setTimeout(90000);
  const created=await page.request.post('/api/community',{data:{action:'post',title:'A conversation for the spacing review',body:'A short discussion to check editing and form spacing.',community:'salesforce',tag:'Discussion'}});expect(created.ok()).toBe(true);
  await page.goto('/');
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:800});
    await page.getByRole('button',{name:'Create post',exact:true}).click();await dialogSpacing(page);
    await page.getByRole('button',{name:'Publish post',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Publish post',exact:true})).toBeInViewport();
    await page.locator('.dialog-body').evaluate(e=>e.scrollTop=0);await screenshot(page,`post-${width}`);await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Edit A conversation for the spacing review',exact:true}).click();await dialogSpacing(page);await page.getByRole('button',{name:'Save changes',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Edit your profile',exact:true}).click();await dialogSpacing(page);
    await page.getByRole('button',{name:'Sign out',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeInViewport();await screenshot(page,`security-${width}`);await page.getByRole('button',{name:'Close dialog'}).click();
    await page.locator('.post-card').first().getByRole('button',{name:/^Report /}).click();await dialogSpacing(page);await screenshot(page,`report-${width}`);await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Find your community',exact:true}).click();await dialogSpacing(page);await screenshot(page,`directory-${width}`);await page.getByRole('button',{name:'Close dialog'}).click();
    if(width<1024)await page.getByRole('button',{name:'Open navigation'}).click();
    await page.getByRole('button',{name:'About TrailTalk',exact:true}).click();await dialogSpacing(page);await page.getByRole('button',{name:'Close dialog'}).click();
  }
});

test('feed, question filters, inbox and moderation keep controls inside their panels',async({page,playwright})=>{
  test.setTimeout(90000);
  await page.goto('/notifications');await expect(page.locator('.inbox-empty')).toBeVisible();
  const created=await page.request.post('/api/community',{data:{action:'post',title:'A conversation with replies in the inbox',body:'Share a practical improvement that helped your team.',community:'salesforce',tag:'Discussion'}});expect(created.ok()).toBe(true);
  const postId=(await created.json()).createdId;
  const sender=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(sender,'A fellow Trailblazer');
  expect((await sender.post('/api/community',{data:{action:'comment',postId,body:'Documenting the fault paths made our screen flows easier to support.'}})).ok()).toBe(true);await sender.dispose();
  const profile=(await (await page.request.get('/api/community')).json()).profile;
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare("UPDATE profiles SET role='admin' WHERE email=?").run(profile.email);d.close();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const [name,path,ready] of [['feed','/','.post-card'],['questions','/?view=questions','.question-filters'],['search','/?q=keyboard%20navigation','.search-comment-match'],['thread','/posts/1','.comments-list'],['inbox','/notifications','.inbox-item'],['moderation','/moderation','.moderation-tabs']]){
      await page.goto(path);await expect(page.locator(ready).first()).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const overflow=await page.locator('.feed-toolbar,.inbox-toolbar,.moderation-tabs,.question-filters,.comment-submit').evaluateAll(els=>els.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className));expect(overflow).toEqual([]);
      if(width===390||width===1440)await screenshot(page,`${name}-${width}`);
    }
    await page.getByRole('button',{name:'Posts',exact:true}).click();await page.locator('.moderation-card').first().getByRole('button',{name:'Remove',exact:true}).click();
    await expect(page.getByLabel('Moderation reason')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await screenshot(page,`moderation-review-${width}`);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  await page.request.post('/api/account',{data:{action:'logout'}});await page.setViewportSize({width:320,height:900});await page.goto('/notifications');await expect(page.locator('.inbox-signin')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await screenshot(page,'inbox-signin-320');
});
