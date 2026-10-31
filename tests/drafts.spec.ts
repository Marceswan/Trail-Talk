import {test,expect,register} from './fixtures';

async function open(page:import('@playwright/test').Page){await expect(page.getByRole('button',{name:'Edit your profile',exact:true})).toBeVisible();await page.getByRole('button',{name:'Create post',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toBeVisible();}
test('draft survives close, reload and failed publishing; successful publish clears it',async({page})=>{
  await page.goto('/');await open(page);
  await page.getByLabel('Title',{exact:true}).fill('A durable browser draft');await page.getByRole('textbox',{name:'Your post',exact:true}).fill('Context that should survive closing and reloading.');
  await page.getByRole('combobox',{name:'Community',exact:true}).selectOption('developers');
  await page.getByLabel('Close dialog').click();await page.reload();await open(page);
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('A durable browser draft');await expect(page.getByRole('combobox',{name:'Community',exact:true})).toHaveValue('developers');
  await page.route('**/api/community',async route=>{if(route.request().method()==='POST')await route.fulfill({status:500,json:{error:'Test save failure'}});else await route.continue();});
  await page.getByRole('button',{name:'Publish post',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Test save failure');
  await page.getByLabel('Close dialog').click();await open(page);await expect(page.getByLabel('Title',{exact:true})).toHaveValue('A durable browser draft');
  await page.unroute('**/api/community');await page.getByRole('button',{name:'Publish post',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await open(page);await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
});
test('draft conflicts preserve both tabs until an explicit choice; discard requires confirmation',async({page,context})=>{
  await page.goto('/');await open(page);await page.getByLabel('Title',{exact:true}).fill('Original draft');
  const other=await context.newPage();await other.goto('/');await open(other);await other.getByLabel('Title',{exact:true}).fill('Newer draft from another tab');
  await expect(page.locator('.draft-status')).toContainText('changed in another tab');await expect(page.getByRole('button',{name:'Publish post',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Original draft');await page.getByRole('button',{name:'Load saved version',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Newer draft from another tab');
  await other.close();await page.getByRole('button',{name:'Discard draft',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).not.toHaveValue('');
  await page.getByRole('button',{name:'Keep writing',exact:true}).click();await page.getByRole('button',{name:'Discard draft',exact:true}).click();
  await page.locator('.draft-confirm').getByRole('button',{name:'Discard draft',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
});
test('unavailable storage warns before closing; drafts are isolated when accounts change',async({page})=>{
  await page.goto('/');await open(page);await page.getByLabel('Title',{exact:true}).fill('Account A private draft');await page.getByLabel('Close dialog').click();
  await register(page.request,'Second account');await page.reload();await open(page);await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};});
  await page.getByLabel('Title',{exact:true}).fill('Unsaved text');await expect(page.locator('.draft-status')).toContainText('not saved');
  await page.getByLabel('Close dialog').click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.draft-confirm')).toContainText('Closing will lose');await page.getByRole('button',{name:'Keep writing',exact:true}).click();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Unsaved text');await page.getByLabel('Close dialog').click();await page.getByRole('button',{name:'Close without saving',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});
