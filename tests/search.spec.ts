import {test,expect,register} from './fixtures';
import {DatabaseSync} from 'node:sqlite';
import type {APIRequestContext} from '@playwright/test';
import type {SearchData,Comment} from '@/lib/types';
const change=(r:APIRequestContext,data:Record<string,unknown>)=>r.post('/api/community',{data});
async function create(r:APIRequestContext,title:string,body='A useful discussion with context for the community.',tag='Discussion',community='developers'){const response=await change(r,{action:'post',title,body,tag,community});expect(response.ok()).toBe(true);return (await response.json()).createdId as number;}
async function search(r:APIRequestContext,q:string,extra:Record<string,string>={}):Promise<SearchData>{const result=await r.get(`/api/search?${new URLSearchParams({q,...extra})}`);expect(result.ok()).toBe(true);return result.json();}
async function comment(r:APIRequestContext,postId:number,body:string){await change(r,{action:'comment',postId,body});return ((await(await r.get(`/api/community?post=${postId}`)).json()).comments as Comment[]).find(c=>c.body===body)!;}

test('search matches terms and phrases, ranks titles, treats wildcards literally, and excludes removed content',async({request})=>{
  const title=await create(request,'Nebulacode reliable patterns');
  const body=await create(request,'A body match','Nebulacode has patterns that keep services reliable.');
  const reply=await create(request,'A reply match');const c=await comment(request,reply,'Reliable retry logic for Nebulacode.');
  const result=await search(request,'reliable nebulacode');expect(result.posts.map(p=>p.id)).toEqual([title,body,reply]);expect(result.posts[2].match_comment).toMatchObject({id:c.id,excerpt:'Reliable retry logic for Nebulacode.'});expect(result.posts[0]).not.toHaveProperty('owner');
  expect((await search(request,'"nebulacode reliable"')).posts.map(p=>p.id)).toEqual([title]);
  expect((await search(request,'"reliable nebulacode"')).posts).toHaveLength(0);
  const literal=await create(request,'Literal symbol example','The exact marker is discount_50% for this test.');expect((await search(request,'discount_50%')).posts.map(p=>p.id)).toEqual([literal]);expect((await search(request,'discountX50Y')).total).toBe(0);
  expect((await search(request,"' OR 1=1 --")).total).toBe(0);
  expect((await request.get('/api/search?q=a+b+c+d+e+f+g+h+i')).status()).toBe(400);expect((await request.get(`/api/search?q=${'x'.repeat(251)}`)).status()).toBe(400);expect((await request.get('/api/search?q=flow&page=-1')).status()).toBe(400);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(c.id);expect((await search(request,'nebulacode reliable')).posts.map(p=>p.id)).toEqual([title,body]);
  d.prepare('UPDATE posts SET removed=1 WHERE id=?').run(title);expect((await search(request,'nebulacode reliable')).posts.map(p=>p.id)).toEqual([body]);
  await change(request,{action:'editPost',postId:body,revision:0,title:'A body match',body:'An edited discussion with unrelated content.'});expect((await search(request,'nebulacode reliable')).total).toBe(0);d.close();
});

test('search paginates deterministically and scopes saved, following, mine, and question filters',async({request,playwright})=>{
  const peer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(peer,'Search Peer');const guest=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  const ids:number[]=[];for(let i=0;i<23;i++)ids.push(await create(request,`Orbitfind conversation ${i}`));
  const peerId=await create(peer,'Orbitfind peer question','A useful question with enough context.','Question','admins');const answer=await comment(request,peerId,'A documented solution.');await change(peer,{action:'acceptAnswer',postId:peerId,commentId:answer.id,revision:0});
  const first=await search(request,'Orbitfind',{sort:'new'});const second=await search(request,'Orbitfind',{sort:'new',page:'2'});expect(first.posts).toHaveLength(20);expect(first.total).toBe(24);expect(first.hasMore).toBe(true);expect(second.posts).toHaveLength(4);expect(second.hasMore).toBe(false);expect(new Set([...first.posts,...second.posts].map(p=>p.id)).size).toBe(24);
  expect((await search(request,'Orbitfind',{view:'mine'})).total).toBe(23);expect((await search(peer,'Orbitfind',{view:'mine'})).posts.map(p=>p.id)).toEqual([peerId]);expect((await search(guest,'Orbitfind',{view:'mine'})).total).toBe(0);
  await change(request,{action:'save',postId:peerId,value:true});expect((await search(request,'Orbitfind',{view:'saved'})).posts.map(p=>p.id)).toEqual([peerId]);expect((await search(peer,'Orbitfind',{view:'saved'})).total).toBe(0);
  await change(request,{action:'join',community:'admins',value:true});expect((await search(request,'Orbitfind',{view:'following'})).posts.map(p=>p.id)).toEqual([peerId]);
  expect((await search(request,'Orbitfind',{view:'questions',status:'solved'})).posts.map(p=>p.id)).toEqual([peerId]);expect((await search(request,'Orbitfind',{view:'questions',status:'open'})).total).toBe(0);expect((await search(request,'Orbitfind',{community:'developers'})).total).toBe(23);
  const d=new DatabaseSync(process.env.TEST_DATABASE_PATH!);d.prepare('UPDATE comments SET removed=1 WHERE id=?').run(answer.id);expect((await search(request,'Orbitfind',{view:'questions',status:'solved'})).total).toBe(0);expect((await search(request,'Orbitfind',{view:'questions',status:'open'})).total).toBe(1);d.close();
  expect((await search(request,'Orbitfind',{page:'100'})).posts).toHaveLength(0);await peer.dispose();await guest.dispose();
});

test('reply matches highlight text and navigate to the exact comment with the search preserved',async({page})=>{
  const id=await create(page.request,'A discussion with a hidden gem');const c=await comment(page.request,id,'The **quartzneedle** solution needs a separate retry policy.');
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByLabel('Search TrailTalk').fill('retry quartzneedle');
  await expect(page.locator('.post-card')).toHaveCount(1);await expect(page.locator('.search-comment-match')).toContainText('quartzneedle solution');await expect(page.locator('.search-comment-match mark')).toHaveCount(2);await expect(page.getByLabel('Sort posts')).toHaveValue('relevance');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/search-mobile.png',animations:'disabled'});
  const feedUrl=page.url();await page.locator('.search-comment-match').click();await expect(page).toHaveURL(new RegExp(`#comment-${c.id}$`));await expect(page.locator('.comment.is-linked')).toContainText('quartzneedle');await expect(page.locator('.comment.is-linked')).toBeInViewport();
  await page.getByRole('link',{name:'Back to feed',exact:true}).click();await expect(page).toHaveURL(feedUrl);await expect(page.locator('.search-comment-match')).toBeVisible();await page.reload();await expect(page.locator('.post-card')).toHaveCount(1);
  await page.getByLabel('Search TrailTalk').fill('no-such-needle-exists');await expect(page.getByRole('heading',{name:'No matching conversations.'})).toBeVisible();await page.getByRole('button',{name:'Clear search',exact:true}).first().click();await expect(page.locator('.post-card').first()).toBeVisible();
});

test('stale searches cannot replace current results; failed first and later pages can retry',async({page})=>{
  const old=await create(page.request,'Slowneedle older result');const fresh=await create(page.request,'Fastneedle current result');
  let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
  await page.route('**/api/search?**',async route=>{if(new URL(route.request().url()).searchParams.get('q')==='Slowneedle'){requested=true;const result=await route.fetch();await held;try{await route.fulfill({response:result});}catch{/* The request may already be aborted. */}}else await route.continue();});
  await page.goto('/');await page.getByLabel('Search TrailTalk').fill('Slowneedle');await expect.poll(()=>requested).toBe(true);await page.getByLabel('Search TrailTalk').fill('Fastneedle');await expect(page.locator('.post-card')).toContainText('Fastneedle current result');release();await expect(page.locator('.post-card')).not.toContainText('Slowneedle');await page.unroute('**/api/search?**');
  await page.route('**/api/search?**',route=>route.fulfill({status:500,json:{error:'Search temporarily unavailable.'}}));await page.getByLabel('Search TrailTalk').fill('Fastneedle current');await expect(page.locator('.search-error')).toContainText('Search temporarily unavailable.');await expect(page.locator('.post-card')).toHaveCount(0);await page.unroute('**/api/search?**');await page.getByRole('button',{name:'Retry search'}).click();await expect(page.locator('.post-card')).toHaveCount(1);
  for(let i=0;i<21;i++)await create(page.request,`Pagefind result ${i}`);await page.getByLabel('Search TrailTalk').fill('Pagefind');await expect(page.locator('.post-card')).toHaveCount(20);
  await page.route('**/api/search?**',async route=>{if(new URL(route.request().url()).searchParams.get('page')==='2')await route.fulfill({status:500,json:{error:'More results unavailable.'}});else await route.continue();});await page.getByRole('button',{name:'Load more results'}).click();await expect(page.locator('.search-error')).toContainText('More results unavailable.');await expect(page.locator('.post-card')).toHaveCount(20);
  await page.unroute('**/api/search?**');await page.getByRole('button',{name:'Retry search'}).click();await expect(page.locator('.post-card')).toHaveCount(21);await expect(page.getByRole('button',{name:'Load more results'})).toHaveCount(0);
  expect(old).not.toBe(fresh);
});
