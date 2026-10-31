// Real Postgres integration checks in a disposable schema, never public data.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {request} from '@playwright/test';
import sharp from 'sharp';
const schema=`trailtalk_test_${randomUUID().replaceAll('-','')}`;
const connection=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!connection)throw new Error('Set DATABASE_URL to run Postgres integration tests.');
const admin=new pg.Client({connectionString:connection});await admin.connect();
let server;const contexts=[];
try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(connection);url.searchParams.set('options',`-c search_path=${schema}`);
  const env={...process.env,DATABASE_PATH:'',DATABASE_URL:url.href,DATABASE_URL_UNPOOLED:url.href,COOKIE_SECURE:'false',VERCEL:'',TRAILTALK_DEMO_DATA:'true'};
  const migrated=spawnSync(process.execPath,['scripts/migrate-postgres.mjs'],{env,encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
  // Idempotent migration must preserve content and identity sequences.
  assert.equal(spawnSync(process.execPath,['scripts/migrate-postgres.mjs'],{env,encoding:'utf8'}).status,0);
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3200'],{env,stdio:'ignore'});
  const baseURL='http://127.0.0.1:3200';
  for(let i=0;i<80;i++){try{if((await fetch(baseURL+'/api/community')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  const a=await request.newContext({baseURL}),b=await request.newContext({baseURL});contexts.push(a,b);
  async function json(client,path,data,status=200){const r=data?await client.post(path,{data}):await client.get(path);assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json();}
  const password='Postgres test passphrase 492!';
  const email=`postgres-${randomUUID()}@example.com`;
  const registered=await json(a,'/api/account',{action:'register',email,name:'PG Author',password},201);assert.equal(registered.codes.length,5);
  await json(b,'/api/account',{action:'register',email:`other-${email}`,name:'PG Reader',password},201);
  const feed=await json(a,'/api/community');assert.equal(feed.posts.length,6);assert.ok(feed.communities.some(c=>c.id==='flow-n-tell'&&c.name==="Flow 'n Tell"));assert.equal(feed.profile.registered,1);for(const community of ['slack','claudeforce-siforce','health-cloud','financial-services','education'])assert.ok(feed.communities.some(c=>c.id===community));
  await json(a,'/api/community',{action:'profile',name:'PG Author',bio:'Postgres profile',employer:'Hidden Employer',job_title:'Architect',years_experience:7,visibility:{employer:false,email:false}});
  let publicPage=await (await a.get(`/members/${feed.profile.id}`)).text();assert.ok(publicPage.includes('Architect'));assert.ok(!publicPage.includes('Hidden Employer'));assert.ok(!publicPage.includes(email));
  await json(a,'/api/community',{action:'profile',name:'PG Author',bio:'Postgres profile',visibility:{email:true,employer:false}});
  publicPage=await (await a.get(`/members/${feed.profile.id}`)).text();assert.ok(publicPage.includes(email));assert.ok(!publicPage.includes('Hidden Employer'));
  const imageBytes=await sharp({create:{width:200,height:100,channels:3,background:'#087bdf'}}).png().toBuffer();
  const uploaded=await a.post('/api/images',{multipart:{image:{name:'postgres-image.png',mimeType:'image/png',buffer:imageBytes}}});assert.equal(uploaded.status(),201);
  const attachment={...await uploaded.json(),alt:'Postgres attachment test'};
  const imageUrl=`/api/images/${attachment.id}`;
  assert.equal((await b.get(imageUrl)).status(),404);
  const created=await json(a,'/api/community',{action:'post',title:'Postgres SEARCH 50%_literal?',body:'A durable PostgreSQL question for integration verification.',community:'salesforce',tag:'Question',tags:['Health Cloud','Flow'],images:[attachment]});const id=created.createdId;assert.ok(id>6);assert.deepEqual(created.posts.find(p=>p.id===id).tags,['flow','health-cloud']);
  assert.deepEqual(created.posts.find(p=>p.id===id).images,[attachment]);
  const storedImage=await b.get(imageUrl);assert.equal(storedImage.status(),200);assert.equal((await sharp(await storedImage.body()).metadata()).format,'webp');
  await json(b,'/api/community',{action:'comment',postId:id,body:'A useful persisted answer.'});
  const comments=await json(a,`/api/community?post=${id}`);const commentId=comments.comments[0].id;assert.ok(commentId>8);
  await json(a,'/api/community',{action:'commentVote',commentId,value:1});
  assert.equal((await json(b,`/api/community?post=${id}`)).comments[0].score,1);
  await json(a,'/api/community',{action:'acceptAnswer',postId:id,commentId,revision:0});
  const edits=await Promise.all([1,2].map(n=>a.post('/api/community',{data:{action:'editPost',postId:id,title:'Postgres SEARCH 50%_literal?',body:`Updated durable PostgreSQL question version ${n}.`,revision:0}})));
  assert.deepEqual(edits.map(r=>r.status()).sort(),[200,409]);
  for(const sort of ['relevance','new','top','best'])assert.equal((await json(a,`/api/search?q=postgres&sort=${sort}`)).posts[0].id,id);
  assert.equal((await json(a,'/api/search?q=50%25_literal%3F')).posts[0].id,id);
  for(const action of ['save','join'])for(let i=0;i<2;i++)await json(a,'/api/community',{action,postId:id,community:'salesforce',value:true});
  assert.equal((await json(a,'/api/search?q=health-cloud')).posts[0].id,id);
  assert.equal((await json(a,'/api/search?q=postgres&label=other')).posts.length,0);
  const inbox=await json(a,'/api/notifications');assert.equal(inbox.unread,1);
  await json(a,'/api/notifications',{action:'readAll'});assert.equal((await json(a,'/api/notifications')).unread,0);
  await admin.query(`UPDATE ${schema}.profiles SET role='admin' WHERE email=$1`,[email]);
  const adminPanel=await json(a,'/api/admin?q=PG');
  assert.equal(adminPanel.total,2);assert.ok(adminPanel.users.every(u=>!('password_hash' in u)));
  assert.equal((await b.get('/api/admin')).status(),403);
  const readerId=adminPanel.users.find(u=>u.email===`other-${email}`).id;
  for(const role of ['moderator','admin','user'])await json(a,'/api/admin',{action:'role',userId:readerId,role,reason:'Verify PostgreSQL role management'});
  await json(a,'/api/admin',{action:'role',userId:adminPanel.viewerId,role:'user',reason:'Prevent self-demotion'},403);
  const settingsChange={action:'settings',...adminPanel.settings,headline:'Postgres community headline',registrationOpen:false,reason:'Verify persistent site settings'};
  await json(a,'/api/admin',settingsChange);
  await json(a,'/api/admin',settingsChange,409);
  assert.equal((await json(b,'/api/community')).settings.headline,settingsChange.headline);
  await json(b,'/api/account',{action:'register',email:`closed-${email}`,name:'Blocked Signup',password},403);
  await json(a,'/api/admin',{...settingsChange,...adminPanel.settings,revision:adminPanel.settings.revision+1});
  for(let i=0;i<2;i++)await json(b,'/api/moderation',{action:'report',targetType:'post',targetId:id,reason:'Other'});
  const moderation=await json(a,'/api/moderation?q=postgres');assert.equal(moderation.reports.length,1);assert.ok(moderation.posts.length);
  await json(a,'/api/moderation',{action:'lock',targetType:'post',targetId:id,reason:'Integration test lock'});
  await json(b,'/api/community',{action:'comment',postId:id,body:'Blocked by lock.'},403);
  await json(a,'/api/moderation',{action:'remove',targetType:'post',targetId:id,reason:'Integration test removal'});
  assert.equal((await b.get(imageUrl)).status(),404);
  assert.equal((await b.get(`/posts/${id}`)).status(),404);
  await json(a,'/api/moderation',{action:'restore',targetType:'post',targetId:id,reason:'Integration test restoration'});
  assert.equal((await b.get(imageUrl)).status(),200);
  const resets=await Promise.all([a,b].map(c=>c.post('/api/account',{data:{action:'recover',email,code:registered.codes[0],password:password+'new'}})));
  assert.deepEqual(resets.map(r=>r.status()).sort(),[200,401]);
  await json(a,'/api/community',{action:'vote',postId:id,value:1},401);
  await json(a,'/api/account',{action:'login',email,password:password+'new'});
  await json(a,'/api/account',{action:'recover',email,code:registered.codes[1],password},401);
  assert.equal(spawnSync(process.execPath,['scripts/migrate-postgres.mjs'],{env:{...env,TRAILTALK_DEMO_DATA:'false'},encoding:'utf8'}).status,0);
  const cleaned=await json(a,'/api/community');assert.equal(cleaned.posts.length,1);assert.equal(cleaned.posts[0].id,id);
  assert.equal((await b.get('/posts/1')).status(),404);
  console.log('Postgres integration passed: migration, accounts, posts, image uploads/privacy, comments, votes, edits, search, inbox, moderation, admin roles, site settings, concurrent recovery.');
}finally{
  for(const c of contexts)await c.dispose();
  if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  // This random schema was created by this run; no public tables are touched.
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
