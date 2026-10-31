import {test,expect,type APIRequestContext} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {register,password} from './fixtures';

function setRole(email:string,role:string) {
  const db=new DatabaseSync(process.env.TEST_DATABASE_PATH!);
  try {db.prepare('UPDATE profiles SET role=? WHERE email=?').run(role,email);}
  finally {db.close();}
}
const change=(request:APIRequestContext,data:Record<string,unknown>)=>request.post('/api/admin',{data:{reason:'Admin integration test',...data}});

test('admin API protects user details and supports roles, suspension, sign-out and audited changes',async({request,playwright})=>{
  expect((await request.get('/api/admin')).status()).toBe(401);
  expect((await change(request,{action:'role',userId:'anything',role:'admin'})).status()).toBe(401);
  const identity=await register(request,'Panel Admin');
  expect((await request.get('/api/admin')).status()).toBe(403);
  setRole(identity.email,'moderator');
  expect((await request.get('/api/admin')).status()).toBe(403);
  expect((await change(request,{action:'settings'})).status()).toBe(403);
  setRole(identity.email,'admin');
  const reader=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    const member=await register(reader,'Admin Managed Member');
    const initial=await request.get(`/api/admin?q=${encodeURIComponent(member.email)}`);
    expect(initial.headers()['cache-control']).toContain('no-store');
    const state=await initial.json();expect(state.users).toHaveLength(1);
    const id=state.users[0].id;
    expect(state.users[0]).not.toHaveProperty('password_hash');
    expect(state.users[0]).not.toHaveProperty('profile_visibility');
    expect((await change(request,{action:'role',userId:state.viewerId,role:'user'})).status()).toBe(403);
    expect((await change(request,{action:'suspend',userId:state.viewerId})).status()).toBe(403);
    expect((await change(request,{action:'role',userId:id,role:'owner'})).status()).toBe(400);
    expect((await change(request,{action:'role',userId:id,role:'moderator',reason:''})).status()).toBe(400);
    for(const role of ['moderator','admin','user'])expect((await change(request,{action:'role',userId:id,role})).status()).toBe(200);
    expect((await change(request,{action:'suspend',userId:id})).status()).toBe(200);
    expect((await reader.post('/api/community',{data:{action:'join',community:'salesforce',value:true}})).status()).toBe(401);
    await reader.post('/api/account',{data:{action:'login',email:member.email,password}});
    expect((await reader.post('/api/community',{data:{action:'join',community:'salesforce',value:true}})).status()).toBe(403);
    expect((await change(request,{action:'unsuspend',userId:id})).status()).toBe(200);
    expect((await reader.post('/api/community',{data:{action:'join',community:'salesforce',value:true}})).status()).toBe(200);
    expect((await change(request,{action:'signOut',userId:id})).status()).toBe(200);
    expect((await reader.post('/api/community',{data:{action:'join',community:'salesforce',value:false}})).status()).toBe(401);
    const log=(await(await request.get('/api/admin')).json()).log;
    for(const action of ['role:moderator','role:admin','suspend','unsuspend','signOut']) expect(log.some((entry:{action:string;target_id:string})=>entry.action===action&&entry.target_id===id)).toBe(true);
    const denied=await reader.get('/admin');expect(await denied.text()).toContain('Admin access required');
    expect(await denied.text()).not.toContain(member.email);
  } finally {await reader.dispose();}
});

test('site settings persist, reject stale writes and close signup without blocking existing accounts',async({request,playwright})=>{
  const identity=await register(request,'Settings Admin');setRole(identity.email,'admin');
  const initial=(await(await request.get('/api/admin')).json()).settings;
  const visitor=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    const update={action:'settings',...initial,headline:'A home for Salesforce builders',description:'Learn and share with your community.',notice:'Welcome to the community!',registrationOpen:false};
    expect((await change(request,{...update,registrationOpen:'false'})).status()).toBe(400);
    expect((await change(request,{...update,headline:''})).status()).toBe(400);
    expect((await change(request,update)).status()).toBe(200);
    expect((await change(request,update)).status()).toBe(409);
    const publicSettings=(await(await visitor.get('/api/community')).json()).settings;
    expect(publicSettings).toMatchObject({headline:update.headline,notice:update.notice,registrationOpen:false,revision:initial.revision+1});
    expect((await visitor.post('/api/account',{data:{action:'register',email:`closed-${randomUUID()}@example.com`,password,name:'Closed Signup'}})).status()).toBe(403);
    expect((await visitor.post('/api/account',{data:{action:'login',email:identity.email,password}})).status()).toBe(200);
  } finally {
    const current=(await(await request.get('/api/admin')).json()).settings;
    expect((await change(request,{action:'settings',...initial,revision:current.revision})).status()).toBe(200);
    await visitor.dispose();
  }
});

test('concurrent admin demotions preserve an active administrator and revoke privileged access',async({request,playwright})=>{
  const a=await register(request,'Concurrent Admin A');setRole(a.email,'admin');
  const other=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    const b=await register(other,'Concurrent Admin B');setRole(b.email,'admin');
    const aId=(await(await request.get('/api/admin')).json()).viewerId;
    const bId=(await(await other.get('/api/admin')).json()).viewerId;
    const responses=await Promise.all([change(request,{action:'role',userId:bId,role:'user'}),change(other,{action:'role',userId:aId,role:'user'})]);
    expect(responses.map(r=>r.status()).sort()).toEqual([200,403]);
    expect((await Promise.all([request,other].map(r=>r.get('/api/admin')))).map(r=>r.status()).sort()).toEqual([200,403]);
  } finally {await other.dispose();}
});

test('admin panel works on mobile: find a user, grant moderator access and save visible site settings',async({page,playwright})=>{
  const identity=await register(page.request,'Mobile Administrator');setRole(identity.email,'admin');
  const memberRequest=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  const member=await register(memberRequest,'Mobile Managed Member');await memberRequest.dispose();
  const initial=(await(await page.request.get('/api/admin')).json()).settings;
  try {
    await page.setViewportSize({width:390,height:844});await page.goto('/admin');
    await expect(page.getByRole('heading',{name:'Admin panel',exact:true})).toBeVisible();
    await page.getByLabel('Search users').fill(member.email);await page.getByRole('button',{name:'Search',exact:true}).click();
    const row=page.getByRole('article',{name:'Manage Mobile Managed Member'});
    await expect(row).toBeVisible();
    await row.getByLabel('Role for Mobile Managed Member').selectOption('moderator');
    await page.getByLabel('Reason for change').fill('Helping manage community conversations');
    await page.getByRole('button',{name:'Confirm change'}).click();
    await expect(row.getByLabel('Role for Mobile Managed Member')).toHaveValue('moderator');
    await page.getByRole('button',{name:'Site settings',exact:true}).click();
    await page.getByLabel('Homepage headline').fill('Build better, together.');
    await page.getByLabel('Site notice').fill('A community built on sharing.');
    await page.getByLabel('Allow new account registration').uncheck();
    await page.getByRole('button',{name:'Save settings'}).click();
    await page.getByLabel('Reason for change').fill('Update the welcome experience');
    await page.getByRole('button',{name:'Confirm change'}).click();
    await expect(page.getByRole('status')).toContainText('Site settings saved.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/admin-settings-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Users',exact:true}).click();
    await page.screenshot({path:'test-results/admin-users-desktop.png',fullPage:true});
    await page.goto('/');await expect(page.getByRole('heading',{name:'Build better, together.',exact:true})).toBeVisible();
    await expect(page.locator('.site-notice')).toContainText('A community built on sharing.');
    await page.request.post('/api/account',{data:{action:'logout'}});await page.reload();
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('New account registration is currently closed');
    await expect(page.getByRole('dialog').getByRole('button',{name:'Create account',exact:true})).toHaveCount(0);
  } finally {
    await page.request.post('/api/account',{data:{action:'login',email:identity.email,password}});
    const current=(await(await page.request.get('/api/admin')).json()).settings;
    await change(page.request,{action:'settings',...initial,revision:current.revision});
  }
});
