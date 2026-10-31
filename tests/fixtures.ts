import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export const password='A unique test passphrase 42!';
export async function register(request:APIRequestContext,name='Test Trailblazer') {
  const email=`test-${randomUUID()}@example.com`;
  const response=await request.post('/api/account',{data:{action:'register',email,password,name}});
  expect(response.status()).toBe(201);
  return {email,password,codes:(await response.json()).codes as string[]};
}
export const test=base.extend({
  page:async({page},use)=>{await register(page.request);await use(page);},
  request:async({request},use)=>{await register(request);await use(request);},
});
export {expect};
