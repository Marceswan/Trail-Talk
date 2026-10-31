import {test,expect} from './fixtures';
import {DatabaseSync} from 'node:sqlite';

test('filters survive refresh, thread navigation and browser history; density persists',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Compact view',exact:true}).click();
  await expect(page.locator('.post-list')).toHaveAttribute('data-density','compact');
  await page.getByRole('button',{name:'Popular',exact:true}).click();
  await expect(page).toHaveURL(/view=popular/);
  await expect(page.locator('.hero')).toHaveCount(0);
  await page.getByRole('button',{name:'Show & tell',exact:true}).click();
  await page.getByLabel('Sort posts').selectOption('new');
  await page.getByLabel('Search TrailTalk').fill('component');
  await expect(page.locator('.post-card')).toHaveCount(1);
  const feedUrl=page.url();
  await page.reload();
  await expect(page.getByLabel('Search TrailTalk')).toHaveValue('component');
  await expect(page.getByLabel('Sort posts')).toHaveValue('new');
  await expect(page.getByRole('button',{name:'Show & tell',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.post-list')).toHaveAttribute('data-density','compact');
  await page.locator('.post-title-button').click();
  await expect(page.locator('.thread-post h1')).toContainText('component library');
  await page.reload();
  await page.getByRole('link',{name:'Back to feed',exact:true}).click();
  await expect(page).toHaveURL(feedUrl);
  await expect(page.locator('.post-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await page.goBack();
  await expect(page).toHaveURL(feedUrl);
  await expect(page.getByLabel('Search TrailTalk')).toHaveValue('component');
  await page.goForward();
  await expect(page.getByLabel('Search TrailTalk')).toHaveValue('');
  await page.getByRole('button',{name:'Career wins',exact:true}).click();
  await expect(page.locator('.post-card')).toHaveCount(1);
  await expect(page.locator('.post-card')).toContainText('Passed my Platform Developer I exam');
  await page.goto('/posts/1?from=https%3A%2F%2Fevil.example');
  await expect(page.getByRole('link',{name:'Back to feed',exact:true})).toHaveAttribute('href','/');
});

test('replies validate their parent, nesting depth, moderation and account restrictions',async({request,playwright})=>{
  const publish=await request.post('/api/community',{data:{action:'post',community:'salesforce',tag:'Discussion',title:'Reply boundary checks',body:'A dedicated conversation for validating threaded replies.'}});
  const postId=(await publish.json()).createdId;
  const reply=(parentId:unknown,body='A useful reply to the conversation.')=>request.post('/api/community',{data:{action:'comment',postId,parentId,body}});
  const comments=async()=> (await(await request.get(`/api/community?post=${postId}`)).json()).comments;
  expect((await reply(null,'The original comment.')).status()).toBe(200);
  const root=(await comments())[0];
  expect(root.parent_id).toBeNull();
  const other=(await(await request.get('/api/community?post=1')).json()).comments[0];
  expect((await reply(other.id)).status()).toBe(404);
  expect((await reply('1')).status()).toBe(400);
  expect((await reply(9999999)).status()).toBe(404);
  let parent=root.id;
  for(let depth=1;depth<=5;depth++){
    expect((await reply(parent,`Reply depth ${depth}.`)).status()).toBe(200);
    const child=(await comments())[0];expect(child.parent_id).toBe(parent);parent=child.id;
  }
  expect((await reply(parent)).status()).toBe(400);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);
  d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(root.id);
  expect((await reply(root.id)).status()).toBe(404);
  const visible=await comments();expect(visible).toHaveLength(6);
  expect(visible.find((c:{id:number})=>c.id===root.id).body).toBe('[Removed by moderators]');
  d.prepare('UPDATE posts SET locked=1 WHERE id=?').run(postId);
  expect((await reply(parent)).status()).toBe(403);
  d.prepare('UPDATE posts SET locked=0 WHERE id=?').run(postId);
  const email=(await(await request.get('/api/community')).json()).profile.email;
  d.prepare('UPDATE profiles SET suspended=1 WHERE email=?').run(email);
  expect((await reply(null)).status()).toBe(403);
  d.close();
  const guest=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  expect((await guest.post('/api/community',{data:{action:'comment',postId,parentId:root.id,body:'Cannot reply without an account.'}})).status()).toBe(401);await guest.dispose();
});

test('mobile replies, vote sorting, collapse, permalinks and failed-save drafts work',async({page})=>{
  const response=await page.request.post('/api/community',{data:{action:'post',community:'salesforce',tag:'Discussion',title:'A conversation with real replies',body:'Share a useful suggestion and reply to someone else in the conversation.'}});
  const id=(await response.json()).createdId;
  await page.request.post('/api/community',{data:{action:'comment',postId:id,body:'First root comment.'}});
  const root=(await(await page.request.get(`/api/community?post=${id}`)).json()).comments[0];
  await page.request.post('/api/community',{data:{action:'comment',postId:id,body:'Second root comment.'}});
  await page.setViewportSize({width:390,height:844});await page.goto(`/posts/${id}`);
  await expect(page.locator('.comment')).toHaveCount(2);
  const rootBranch=page.locator(`[data-comment-id="${root.id}"]`);
  await rootBranch.getByRole('button',{name:'Reply to Test Trailblazer',exact:true}).click();
  const reply=page.getByRole('textbox',{name:'Your reply to Test Trailblazer',exact:true});
  await reply.fill('A reply worth keeping if the network fails.');
  await page.route('**/api/community',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='comment')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Could not save your reply. Try again.'})});else await route.continue();});
  await page.getByRole('button',{name:'Post reply',exact:true}).click();
  await expect(page.locator('.reply-form [role=alert]')).toContainText('Could not save your reply');
  await expect(reply).toHaveValue('A reply worth keeping if the network fails.');
  await page.unroute('**/api/community');await page.getByRole('button',{name:'Post reply',exact:true}).click();
  await expect(rootBranch.locator('.comment-replies')).toContainText('A reply worth keeping');
  await expect(page.locator('.comment')).toHaveCount(3);
  await rootBranch.getByRole('button',{name:'Collapse replies to Test Trailblazer',exact:true}).click();
  await expect(page.locator('.comment')).toHaveCount(2);
  await rootBranch.getByRole('button',{name:'Expand replies to Test Trailblazer',exact:true}).click();
  await expect(page.locator('.comment')).toHaveCount(3);
  await page.getByLabel('Sort comments').selectOption('old');
  await expect(page.locator('.comments-list>.comment-branch').first()).toHaveAttribute('data-comment-id',String(root.id));
  await rootBranch.locator('>.comment').getByRole('button',{name:'Upvote comment by Test Trailblazer',exact:true}).click();
  await page.getByLabel('Sort comments').selectOption('top');
  await expect(page.locator('.comments-list>.comment-branch').first()).toHaveAttribute('data-comment-id',String(root.id));
  const child=rootBranch.locator('.comment-replies .comment').first();
  await child.getByRole('link',{name:'Link to comment by Test Trailblazer',exact:true}).click();
  await page.reload();await expect(page.locator('.comment.is-linked')).toContainText('A reply worth keeping');
  await expect(page.locator('.comment.is-linked')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/replies-mobile.png',fullPage:true,animations:'disabled'});
  // Deep replies stay readable at the smallest supported viewport.
  let parent=Number(await child.getAttribute('id').then(id=>id!.replace('comment-','')));
  for(let n=0;n<4;n++){
    await page.request.post('/api/community',{data:{action:'comment',postId:id,parentId:parent,body:`Nested follow-up ${n}.`}});
    parent=(await(await page.request.get(`/api/community?post=${id}`)).json()).comments[0].id;
  }
  await page.setViewportSize({width:320,height:700});await page.reload();
  await expect(page.locator('.comment')).toHaveCount(7);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.comment').filter({hasText:'Nested follow-up 3.'})).not.toContainText('Reply');
});

test('compact feed stays readable and fits narrow and wide screens',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Compact view',exact:true}).click();
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.post-list')).toHaveAttribute('data-density','compact');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.post-title-button h2').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({path:`test-results/compact-${width}.png`,animations:'disabled'});
  }
});
