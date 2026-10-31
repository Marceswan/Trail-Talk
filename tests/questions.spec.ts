import {test,expect,register} from './fixtures';
import {DatabaseSync} from 'node:sqlite';
import type {APIRequestContext} from '@playwright/test';
import type {Post,Comment} from '@/lib/types';
const change=(r:APIRequestContext,data:Record<string,unknown>)=>r.post('/api/community',{data});
async function question(r:APIRequestContext,title='Question workflow checks',tag='Question') {const result=await change(r,{action:'post',title,tag,community:'developers',body:'How can I make this Apex implementation easier to maintain?'});expect(result.ok()).toBe(true);return (await result.json()).createdId as number;}
async function reply(r:APIRequestContext,postId:number,body:string,parentId:number|null=null){expect((await change(r,{action:'comment',postId,body,parentId})).ok()).toBe(true);const all=(await(await r.get(`/api/community?post=${postId}`)).json()).comments as Comment[];return all.find(c=>c.body===body)!;}
async function post(r:APIRequestContext,id:number):Promise<Post>{return (await(await r.get('/api/community')).json()).posts.find((p:Post)=>p.id===id);}

test('answer choices enforce ownership, same-question membership, revisions, and moderation',async({request,playwright})=>{
  const peer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});const identity=await register(peer,'Answer Helper');
  const guest=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  const id=await question(request);const a=await reply(peer,id,'Extract a small reusable service.');const b=await reply(request,id,'Add a fault path.',a.id);
  const choose=(r:APIRequestContext,commentId:unknown,revision=0)=>change(r,{action:'acceptAnswer',postId:id,commentId,revision});
  expect((await choose(guest,a.id)).status()).toBe(401);expect((await choose(peer,a.id)).status()).toBe(403);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare("UPDATE profiles SET role='moderator' WHERE email=?").run(identity.email);expect((await choose(peer,a.id)).status()).toBe(403);
  expect((await choose(request,'1')).status()).toBe(400);expect((await choose(request,undefined)).status()).toBe(400);expect((await choose(request,a.id,-1)).status()).toBe(400);
  const other=await question(request,'Another unrelated question');const elsewhere=await reply(peer,other,'A different answer.');expect((await choose(request,elsewhere.id)).status()).toBe(404);
  expect((await choose(request,a.id)).status()).toBe(200);expect(await post(request,id)).toMatchObject({accepted_comment_id:a.id,answer_revision:1,revision:0});
  expect((await choose(request,b.id,0)).status()).toBe(409);expect((await post(request,id)).accepted_comment_id).toBe(a.id);
  expect((await choose(request,b.id,1)).status()).toBe(200);expect((await post(request,id)).accepted_comment_id).toBe(b.id);
  expect((await choose(request,null,2)).status()).toBe(200);expect((await post(request,id)).accepted_comment_id).toBeNull();
  d.prepare('UPDATE posts SET locked=1 WHERE id=?').run(id);expect((await choose(request,a.id,3)).status()).toBe(403);d.prepare('UPDATE posts SET locked=0 WHERE id=?').run(id);
  d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(a.id);expect((await choose(request,a.id,3)).status()).toBe(404);d.prepare('UPDATE comments SET removed=0 WHERE id=?').run(a.id);
  expect((await choose(request,a.id,3)).status()).toBe(200);
  d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(a.id);expect((await post(request,id)).accepted_comment_id).toBeNull();d.prepare('UPDATE comments SET removed=0 WHERE id=?').run(a.id);expect((await post(request,id)).accepted_comment_id).toBe(a.id);
  d.prepare('UPDATE posts SET removed=1 WHERE id=?').run(id);expect((await choose(request,null,4)).status()).toBe(404);d.prepare('UPDATE posts SET removed=0 WHERE id=?').run(id);
  const ordinary=await question(request,'A normal discussion','Discussion');const ordinaryComment=await reply(peer,ordinary,'An ordinary comment.');expect((await change(request,{action:'acceptAnswer',postId:ordinary,commentId:ordinaryComment.id,revision:0})).status()).toBe(400);
  const email=(await(await request.get('/api/community')).json()).profile.email;d.prepare('UPDATE profiles SET suspended=1 WHERE email=?').run(email);expect((await choose(request,null,4)).status()).toBe(403);
  d.close();await peer.dispose();await guest.dispose();
});

test('authors accept, replace, and reopen questions; readers jump into collapsed answer branches',async({page,playwright})=>{
  const id=await question(page.request,'How do we resolve this nested question?');const peer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(peer,'Helpful Member');
  const root=await reply(peer,id,'Start with a focused service class.');const child=await reply(peer,id,'Use **dependency injection** to test the service.',root.id);
  await page.setViewportSize({width:390,height:844});await page.goto(`/posts/${id}`);const branch=page.locator(`[data-comment-id="${root.id}"]`);const childArticle=page.locator(`#comment-${child.id}`);
  await childArticle.getByRole('button',{name:'Accept answer by Helpful Member',exact:true}).click();await expect(page.locator('.accepted-summary')).toContainText('dependency injection');await expect(childArticle.locator('.accepted-badge')).toHaveText('Accepted answer');
  await branch.locator('>.comment').getByRole('button',{name:'Collapse replies to Helpful Member',exact:true}).click();await expect(childArticle).toHaveCount(0);
  await page.getByRole('link',{name:'Jump to answer',exact:true}).click();await expect(childArticle).toBeVisible();await expect(childArticle).toBeFocused();await expect(childArticle).toBeInViewport();await expect(page).toHaveURL(new RegExp(`#comment-${child.id}$`));
  await page.reload();await expect(page.locator('.accepted-summary')).toBeVisible();await expect(childArticle).toBeInViewport();
  await branch.locator('>.comment').getByRole('button',{name:'Accept answer by Helpful Member',exact:true}).click();await expect(page.locator('.accepted-summary')).toContainText('focused service class');await expect(page.locator('.accepted-badge')).toHaveCount(1);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`test-results/accepted-answer-${width}.png`,fullPage:true,animations:'disabled'});}
  await branch.locator('>.comment').getByRole('button',{name:'Remove accepted answer by Helpful Member',exact:true}).click();await expect(page.locator('.accepted-summary')).toHaveCount(0);await expect(page.locator('.thread-post .solved-badge')).toHaveCount(0);
  await page.request.post('/api/account',{data:{action:'logout'}});await page.reload();await expect(page.getByRole('button',{name:'Accept answer by Helpful Member',exact:true})).toHaveCount(0);await peer.dispose();
});

test('question filters compose with search, community, history, and question creation defaults',async({page})=>{
  const solved=await question(page.request,'Discoverability solved question');const open=await question(page.request,'Discoverability open question');const answer=await reply(page.request,solved,'A documented solution.');await change(page.request,{action:'acceptAnswer',postId:solved,commentId:answer.id,revision:0});
  await page.goto('/');await page.getByRole('button',{name:'Questions',exact:true}).click();await expect(page).toHaveURL(/view=questions/);
  await page.getByLabel('Search TrailTalk').fill('Discoverability');await page.getByLabel('Filter question community').selectOption('developers');await expect(page.locator('.post-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Solved',exact:true}).click();await expect(page.locator('.post-card')).toHaveCount(1);await expect(page.locator('.post-card .solved-badge')).toHaveText('Solved');const filteredUrl=page.url();
  await page.reload();await expect(page.getByRole('button',{name:'Solved',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('Filter question community')).toHaveValue('developers');
  await page.locator('.post-title-button').click();await page.getByRole('link',{name:'Back to feed',exact:true}).click();await expect(page).toHaveURL(filteredUrl);
  await page.getByRole('button',{name:'Open',exact:true}).click();await expect(page.locator('.post-card')).toContainText('Discoverability open question');await page.goBack();await expect(page.getByRole('button',{name:'Solved',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Create post',exact:true}).click();await expect(page.getByLabel('Topic',{exact:true})).toHaveValue('Question');await page.getByLabel('Title',{exact:true}).fill('A new question from Questions');await page.getByRole('textbox',{name:'Your post',exact:true}).fill('A new question with enough details to help someone answer.');await page.getByRole('button',{name:'Publish post',exact:true}).click();await expect(page).toHaveURL(/view=questions/);await expect(page.locator('.post-card').filter({hasText:'A new question from Questions'})).toBeVisible();
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/questions-320.png',fullPage:true,animations:'disabled'});
  expect((await post(page.request,open)).accepted_comment_id).toBeNull();
});

test('failed answer selection preserves current solution and exposes a retryable error',async({page})=>{
  const id=await question(page.request);const a=await reply(page.request,id,'Keep this accepted answer.');const b=await reply(page.request,id,'A possible replacement.');await change(page.request,{action:'acceptAnswer',postId:id,commentId:a.id,revision:0});await page.goto(`/posts/${id}`);
  await page.route('**/api/community',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='acceptAnswer')await route.fulfill({status:409,json:{error:'The accepted answer changed in another tab. Reload before choosing again.'}});else await route.continue();});
  await page.locator(`#comment-${b.id}`).getByRole('button',{name:'Accept answer by Test Trailblazer',exact:true}).click();await expect(page.locator('.answer-error')).toContainText('changed in another tab');await expect(page.locator('.accepted-summary')).toContainText('Keep this accepted answer.');
  await page.unroute('**/api/community');await page.locator(`#comment-${b.id}`).getByRole('button',{name:'Accept answer by Test Trailblazer',exact:true}).click();await expect(page.locator('.accepted-summary')).toContainText('A possible replacement.');await expect(page.locator('.answer-error')).toHaveCount(0);
});
