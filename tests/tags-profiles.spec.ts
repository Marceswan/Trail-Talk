import {test,expect,register} from './fixtures';

test('tags validate atomically, persist through edits, filter search, and respect ownership',async({request,playwright})=>{
  const make=(tags:unknown)=>request.post('/api/community',{data:{action:'post',title:'A tagged showcase build',body:'A reusable component built for our customer team.',community:'flow-n-tell',tag:'Show & tell',tags}});
  const r=await make(['Health Cloud','FLOW','flow']);expect(r.status()).toBe(200);const result=await r.json();const id=result.createdId;
  expect(result.posts.find((p:{id:number})=>p.id===id).tags).toEqual(['flow','health-cloud']);
  const count=result.posts.length;expect((await make(['one','two','three','four','five','six'])).status()).toBe(400);expect((await make(['<script>'])).status()).toBe(400);
  expect((await(await request.get('/api/community')).json()).posts).toHaveLength(count);
  expect((await(await request.get('/api/search?q=health-cloud&label=flow')).json()).posts.some((p:{id:number})=>p.id===id)).toBe(true);
  expect((await(await request.get('/api/search?q=showcase&label=other')).json()).posts).toHaveLength(0);
  const other=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(other);
  expect((await other.post('/api/community',{data:{action:'editPost',postId:id,revision:0,title:'Unauthorized edit',body:'This must never be allowed to overwrite the tags.',tags:['bad']}})).status()).toBe(403);await other.dispose();
  const edit=await request.post('/api/community',{data:{action:'editPost',postId:id,revision:0,title:'An updated showcase build',body:'The updated component and implementation details.',tags:['apex']}});expect(edit.status()).toBe(200);expect((await edit.json()).posts.find((p:{id:number})=>p.id===id).tags).toEqual(['apex']);
  expect((await request.post('/api/community',{data:{action:'editPost',postId:id,revision:0,title:'Stale edit',body:'This is a stale edit that should fail.',tags:['old']}})).status()).toBe(409);
});

test('profile fields persist while public pages enforce field visibility and email consent',async({request})=>{
  const me=(await(await request.get('/api/community')).json()).profile;
  const details={action:'profile',name:'Profile Privacy Tester',bio:'A detailed professional background.',employer:'Private Employer Example',job_title:'Solution Architect',years_experience:12,location:'Austin',skills:'Flow, Apex, LWC',certifications:'Platform Developer I',website:'https://example.com/profile',trailhead_url:'https://www.salesforce.com/trailblazer/example'};
  expect((await request.post('/api/community',{data:details})).status()).toBe(200);
  let html=await(await request.get(`/members/${me.id}`)).text();expect(html).toContain('Solution Architect');expect(html).toContain('Private Employer Example');expect(html).not.toContain(me.email);
  expect((await request.post('/api/community',{data:{...details,visibility:{email:true,employer:false,years_experience:false,website:false}}})).status()).toBe(200);
  html=await(await request.get(`/members/${me.id}`)).text();expect(html).toContain(me.email);expect(html).not.toContain('Private Employer Example');expect(html).not.toContain('https://example.com/profile');expect(html).not.toContain('12 years');
  const privateState=(await(await request.get('/api/community')).json()).profile;expect(privateState.employer).toBe('Private Employer Example');expect(privateState.years_experience).toBe(12);
  expect((await request.post('/api/community',{data:{...details,visibility:{email:false}}})).status()).toBe(200);html=await(await request.get(`/members/${me.id}`)).text();expect(html).not.toContain(me.email);expect(html).not.toContain('Private Employer Example');
  for(const patch of [{years_experience:-1},{years_experience:1.5},{website:'javascript:alert(1)'},{visibility:{email:'true'}}])expect((await request.post('/api/community',{data:{...details,...patch}})).status()).toBe(400);
  expect((await request.get('/members/no-such-member')).status()).toBe(404);
});

test('showcase discovery, draft tags, tag navigation, and profile controls work on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:850});await page.goto('/');await expect(page.getByRole('button',{name:'Edit your profile',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Find your community',exact:true}).click();await page.getByRole('searchbox',{name:'Find a community',exact:true}).fill("Flow 'n Tell");await page.locator('.directory-card h3').getByRole('button',{name:"Flow 'n Tell"}).click();
  await page.getByRole('button',{name:'Create post',exact:true}).click();await expect(page.getByRole('combobox',{name:'Topic',exact:true})).toHaveValue('Show & tell');
  await page.getByLabel('Title',{exact:true}).fill('Sharing a healthcare flow');await page.getByRole('textbox',{name:'Your post',exact:true}).fill('A walkthrough of the flow and the lessons learned.');await page.getByLabel('Tags',{exact:true}).fill('flow, health-cloud');
  await page.getByLabel('Close dialog').click();await page.getByRole('button',{name:'Create post',exact:true}).click();await expect(page.getByLabel('Tags',{exact:true})).toHaveValue('flow, health-cloud');await page.getByRole('button',{name:'Publish post',exact:true}).click();
  const card=page.locator('.post-card').filter({hasText:'Sharing a healthcare flow'});await card.getByRole('link',{name:'#health-cloud',exact:true}).click();await expect(page).toHaveURL(/label=health-cloud/);await expect(page.locator('.tag-filter')).toContainText('#health-cloud');await page.reload();await expect(page.locator('.post-card')).toHaveCount(1);await page.getByRole('button',{name:'Clear tag filter'}).click();
  await page.getByRole('button',{name:'Edit your profile',exact:true}).click();await page.getByLabel('Employer',{exact:true}).fill('Example Company');await page.getByLabel('Job title',{exact:true}).fill('Salesforce Architect');await page.getByLabel('Years of experience',{exact:true}).fill('9');await page.getByLabel('Skills',{exact:true}).fill('Flow, Apex');
  await expect(page.getByRole('checkbox',{name:'Show email address',exact:true})).not.toBeChecked();await page.getByRole('checkbox',{name:'Show employer',exact:true}).uncheck();await page.getByRole('button',{name:'Save profile',exact:true}).click();
  const me=(await(await page.request.get('/api/community')).json()).profile;await page.goto(`/members/${me.id}`);await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByText('Salesforce Architect',{exact:true})).toBeVisible();await expect(page.getByText('Example Company',{exact:true})).toHaveCount(0);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:850});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/member-profile-${width}.png`,fullPage:true});}
});
