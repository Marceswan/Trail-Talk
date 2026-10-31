import {test,expect,register} from './fixtures';

const source=['## A repeatable Apex pattern','','Use **small methods** and `Database.SaveResult` to keep failures clear.','','- Validate inputs','- Handle the fault path','','> Keep the original error message.','','[Salesforce docs](https://developer.salesforce.com/docs)','','```apex','List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 10];','System.debug(accounts);','```','','| Step | Outcome |','| --- | --- |','| Validate | Clear feedback |'].join('\n');
async function create(request:import('@playwright/test').APIRequestContext,body=source){const r=await request.post('/api/community',{data:{action:'post',title:'Writing with formatting and code',body,community:'developers',tag:'Discussion'}});expect(r.ok()).toBe(true);return (await r.json()).createdId;}

test('post preview publishes Markdown, edits the original source, and keeps clean excerpts',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Create post',exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill('Formatting a real technical discussion');
  await page.getByRole('textbox',{name:'Your post',exact:true}).fill(source);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const preview=page.getByRole('region',{name:'Your post preview',exact:true});
  await expect(preview.locator('strong')).toHaveText('small methods');await expect(preview.locator('li')).toHaveCount(2);await expect(preview.locator('table')).toHaveCount(1);
  await page.getByRole('button',{name:'Publish post',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const card=page.locator('.post-card').filter({hasText:'Formatting a real technical discussion'});
  await expect(card.locator('.post-excerpt')).toContainText('Use small methods');await expect(card.locator('.post-excerpt')).not.toContainText('**');await expect(card.locator('.post-excerpt')).not.toContainText('```');
  await card.locator('.post-title-button').click();await expect(page.locator('.thread-body strong')).toHaveText('small methods');
  await page.getByRole('button',{name:'Edit Formatting a real technical discussion',exact:true}).click();await expect(page.getByRole('textbox',{name:'Your post',exact:true})).toHaveValue(source);
  await page.getByRole('textbox',{name:'Your post',exact:true}).fill(source+'\n\nAn **updated** explanation.');await page.getByRole('dialog').getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.reload();await expect(page.locator('.thread-body')).toContainText('An updated explanation.');
});

test('comment and reply formatting uses selected text, previews, and preserves failed drafts',async({page})=>{
  const id=await create(page.request);await page.goto(`/posts/${id}`);
  const editor=page.locator('.new-comment-form');const input=editor.getByRole('textbox',{name:'Your comment',exact:true});
  await input.fill('Keep this practical.');await input.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(5,9);});
  await editor.getByRole('button',{name:'Bold',exact:true}).click();await expect(input).toHaveValue('Keep **this** practical.');
  await input.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(el.value.length,el.value.length));await input.press('ControlOrMeta+i');await expect(input).toHaveValue('Keep **this** practical.*text*');
  await input.fill('A **useful** comment with `Apex`.');await editor.getByRole('button',{name:'Preview',exact:true}).click();await expect(editor.locator('.editor-preview strong')).toHaveText('useful');
  await page.route('**/api/community',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='comment')await route.fulfill({status:500,json:{error:'Could not save this comment.'}});else await route.continue();});
  await editor.getByRole('button',{name:'Comment',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Could not save');
  await editor.getByRole('button',{name:'Write',exact:true}).click();await expect(input).toHaveValue('A **useful** comment with `Apex`.');
  await page.unroute('**/api/community');await editor.getByRole('button',{name:'Comment',exact:true}).click();await expect(page.locator('.comment-body strong')).toHaveText('useful');await expect(input).toHaveValue('');
  await page.getByRole('button',{name:'Reply to Test Trailblazer',exact:true}).click();const reply=page.locator('.reply-form');await reply.getByRole('textbox').fill('> Quoted context\n\nMy **reply**.');await reply.getByRole('button',{name:'Preview',exact:true}).click();await reply.getByRole('button',{name:'Post reply',exact:true}).click();await expect(page.locator('.comment-replies blockquote')).toHaveText('Quoted context');
  const original=page.locator('.comments-list>.comment-branch>.comment');await original.getByRole('button',{name:'Edit your comment',exact:true}).click();await expect(page.getByRole('textbox',{name:'Edit your comment',exact:true})).toHaveValue('A **useful** comment with `Apex`.');
  await page.getByRole('textbox',{name:'Edit your comment',exact:true}).fill('An **edited** comment.');await page.locator('.edit-comment-form').getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(original.locator('.comment-body strong')).toHaveText('edited');
});

test('untrusted Markdown cannot execute HTML, load tracking images, or create unsafe links',async({page,playwright})=>{
  const body=['Text before.','','<script>window.markdownExecuted=true</script>','','<img src="https://tracker.example/raw.png" onerror="window.markdownExecuted=true">','','![Tracking image](https://tracker.example/pixel.png)','','[Bad script](javascript:alert%281%29) [Data link](data:text/html,test) [Relative host](//tracker.example/) [Safe docs](https://developer.salesforce.com/docs)','','```html','<script>window.markdownExecuted=true</script>','```'].join('\n');
  let remoteRequests=0;await page.route('**://tracker.example/**',route=>{remoteRequests++;return route.abort();});const id=await create(page.request,body);await page.goto(`/posts/${id}`);
  const rendered=page.locator('.thread-body');await expect(rendered).toContainText('Tracking image');await expect(rendered.locator('img,script,iframe')).toHaveCount(0);await expect(rendered.locator('a')).toHaveCount(1);
  await expect(rendered.getByRole('link',{name:'Safe docs'})).toHaveAttribute('rel','noopener noreferrer nofollow ugc');expect(await page.evaluate(()=>(window as unknown as {markdownExecuted?:boolean}).markdownExecuted)).toBeUndefined();expect(remoteRequests).toBe(0);
  const sender=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100'});await register(sender,'Formatting Friend');
  await sender.post('/api/community',{data:{action:'comment',postId:id,body:'A **formatted** reply with [docs](https://developer.salesforce.com/docs).'}});
  const inbox=await(await page.request.get('/api/notifications')).json();expect(inbox.items[0].body).toBe('A formatted reply with docs.');await sender.dispose();
});

test('long code and tables scroll locally, copy feedback works, and preview validation stays usable',async({page,context})=>{
  const longLine='System.debug(\''+'long_field_value_'.repeat(35)+'\');';
  const id=await create(page.request,source+`\n\n\`\`\`apex\n${longLine}\n\`\`\`\n`);
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto(`/posts/${id}`);
  const code=page.locator('.thread-body .code-block').first();await code.getByRole('button',{name:'Copy code',exact:true}).click();await expect(code.getByRole('status')).toHaveText('Copied');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 10];\nSystem.debug(accounts);');
  await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('denied'))});});await code.getByRole('button',{name:'Copy code',exact:true}).click();await expect(code.getByRole('status')).toHaveText('Select the code to copy it.');await expect(code.locator('pre')).toBeFocused();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const last=page.locator('.thread-body .code-block pre').last();expect(await last.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await page.screenshot({path:`test-results/formatting-${width}.png`,fullPage:true,animations:'disabled'});}
  await page.getByRole('button',{name:'Create post',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Preview validation check');await page.getByRole('dialog').getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Publish post',exact:true}).click();await expect(page.getByRole('textbox',{name:'Your post',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Your post',exact:true})).toBeFocused();
  const input=page.getByRole('textbox',{name:'Your post',exact:true});await input.fill('x'.repeat(10000));await page.getByRole('dialog').getByRole('button',{name:'Bold',exact:true}).click();await expect(page.locator('.editor-message')).toContainText('character limit');await expect(input).toHaveValue('x'.repeat(10000));
});
