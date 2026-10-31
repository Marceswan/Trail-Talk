import {test,expect} from './fixtures';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {register} from './fixtures';
const image=()=>sharp({create:{width:800,height:450,channels:3,background:'#0785d2'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'Private camera owner'}}}).toBuffer();

test('uploads are validated, privately staged, ownership checked and hidden with moderated posts',async({request,playwright})=>{
  const anonymous=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  const other=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    await register(other,'Other Image Author');
    const bytes=await image(), multipart={image:{name:'screenshot.jpg',mimeType:'image/jpeg',buffer:bytes}};
    expect((await anonymous.post('/api/images',{multipart})).status()).toBe(401);
    expect((await request.post('/api/images',{headers:{Origin:'https://evil.example'},multipart})).status()).toBe(403);
    expect((await request.post('/api/images',{multipart:{image:{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')}}})).status()).toBe(400);
    expect((await request.post('/api/images',{multipart:{image:{name:'large.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(4*1024*1024+1)}}})).status()).toBe(413);
    const uploaded=await request.post('/api/images',{multipart});expect(uploaded.status()).toBe(201);
    const attachment={...await uploaded.json(),alt:'Flow builder screenshot'};
    const url=`/api/images/${attachment.id}`;
    const privateImage=await request.get(url);expect(privateImage.status()).toBe(200);
    expect(privateImage.headers()['content-type']).toBe('image/webp');
    expect(privateImage.headers()['cache-control']).toContain('no-store');
    const metadata=await sharp(await privateImage.body()).metadata();
    expect(metadata.exif).toBeUndefined();expect(metadata.width).toBe(800);
    expect((await anonymous.get(url)).status()).toBe(404);expect((await other.get(url)).status()).toBe(404);
    const post={action:'post',title:'An image-only showcase',body:'',community:'flow-n-tell',tag:'Show & tell',images:[attachment]};
    expect((await other.post('/api/community',{data:post})).status()).toBe(400);
    expect((await other.delete(url,{data:{}})).status()).toBe(404);
    expect((await request.post('/api/community',{data:{...post,images:[attachment,attachment]}})).status()).toBe(400);
    const response=await request.post('/api/community',{data:post});expect(response.status()).toBe(200);
    const result=await response.json(),id=result.createdId;
    expect(result.posts.find((p:{id:number})=>p.id===id).images).toEqual([attachment]);
    expect((await anonymous.get(url)).status()).toBe(200);
    expect((await request.delete(url,{data:{}})).status()).toBe(409);
    expect((await request.post('/api/community',{data:post})).status()).toBe(400);
    const account=(await(await request.get('/api/community')).json()).profile;
    execFileSync(process.execPath,['scripts/admin.mjs',account.email],{env:{...process.env,DATABASE_PATH:process.env.TEST_DATABASE_PATH},stdio:'pipe'});
    for(const [action,status] of [['remove',404],['restore',200]] as const) {
      expect((await request.post('/api/moderation',{data:{action,targetType:'post',targetId:id,reason:'Verify image moderation'}})).status()).toBe(200);
      expect((await anonymous.get(url)).status()).toBe(status);
    }
    const edit={action:'editPost',postId:id,revision:0,title:post.title,body:'',images:[]};
    expect((await request.post('/api/community',{data:edit})).status()).toBe(400);
    expect((await request.post('/api/community',{data:{...edit,body:'A text update without the screenshot.'}})).status()).toBe(200);
    expect((await anonymous.get(url)).status()).toBe(404);
    const expired=await(await request.post('/api/images',{multipart})).json();
    const db=new DatabaseSync(process.env.TEST_DATABASE_PATH!);
    try{db.prepare('UPDATE post_images SET created_at=0 WHERE id=?').run(expired.id);}finally{db.close();}
    expect((await request.get(`/api/images/${expired.id}`)).status()).toBe(404);
    expect((await request.post('/api/community',{data:{...post,images:[expired]}})).status()).toBe(400);
  } finally {await anonymous.dispose();await other.dispose();}
});

test('mobile image drafts survive reload, publish and support post editing',async({page})=>{
  const bytes=await image();
  await page.setViewportSize({width:390,height:844});await page.goto('/?community=flow-n-tell');
  await page.getByRole('button',{name:'Create post',exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill('My flow showcase with an image');
  await page.getByLabel('Upload post images').setInputFiles({name:'flow.jpg',mimeType:'image/jpeg',buffer:bytes});
  await expect(page.getByLabel('Description for image 1')).toBeVisible();
  await page.getByLabel('Description for image 1').fill('A flow that automates follow-up');
  await expect(page.getByRole('button',{name:'Publish post'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/image-composer-mobile.png',fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Create post',exact:true}).click();
  await expect(page.getByLabel('Description for image 1')).toHaveValue('A flow that automates follow-up');
  await page.getByRole('button',{name:'Publish post'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.post-images-feed img').first()).toBeVisible();
  await page.getByRole('link',{name:'My flow showcase with an image',exact:true}).click();
  await expect(page.locator('.post-images-thread').getByRole('img',{name:'A flow that automates follow-up'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/image-thread-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Edit My flow showcase with an image',exact:true}).click();
  await page.getByLabel('Your post',{exact:true}).fill('An updated description for this showcase.');
  await page.getByLabel('Description for image 1').fill('Updated flow description');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.locator('.post-images-thread').getByRole('img',{name:'Updated flow description'})).toBeVisible();
  await page.getByRole('button',{name:'Edit My flow showcase with an image',exact:true}).click();
  await page.getByRole('button',{name:'Remove image 1'}).click();
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.locator('.post-images-thread')).toHaveCount(0);
});
