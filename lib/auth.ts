import { cookies } from 'next/headers';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { db } from './db';

export type Account = { id: string; name: string; email: string; password_hash: string; role: 'user' | 'moderator' | 'admin'; suspended: number };
export class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', path: '/' };
export async function account(): Promise<Account | undefined> {
  const token = (await cookies()).get('trailtalk_session')?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return db().prepare('SELECT p.* FROM profiles p JOIN sessions s ON s.user_id=p.id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now()) as Account | undefined;
}
export async function requireAccount() {
  const user = await account();
  if (!user) throw new HttpError('Sign in to continue.', 401);
  if (user.suspended) throw new HttpError('Your account is suspended. You can still browse the community.', 403);
  return user;
}
export async function startSession(id: string, expectedHash: string) {
  const jar = await cookies();
  const previous = jar.get('trailtalk_session')?.value;
  const token = randomBytes(32).toString('hex');
  transaction(() => {
    const d = db();
    // Verification and session creation must be atomic with password recovery.
    if (!d.prepare('SELECT id FROM profiles WHERE id=? AND password_hash=?').get(id,expectedHash)) throw new HttpError('Your credentials changed. Sign in again.',401);
    if (previous) d.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
    d.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    d.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), id, Date.now() + 30 * 86400000);
  });
  jar.set('trailtalk_session', token, { ...cookieOptions, maxAge: 30 * 86400 });
  jar.delete('trailtalk_visitor');
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get('trailtalk_session')?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
  jar.set('trailtalk_session', '', { ...cookieOptions, maxAge: 0 });
}
export function textField(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(`${label} must be ${min}–${max} characters.`);
  return value.trim();
}
export function passwordField(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new HttpError('Password must be 12–128 characters.');
  return value;
}
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve,reject) => scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored?: string) {
  const [salt,key] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = await derive(password,salt);
  return timingSafeEqual(actual,Buffer.from(key,'hex')) && Boolean(stored);
}
export function recoveryCodes(id: string) {
  const codes = Array.from({length:5},()=>randomBytes(16).toString('hex').match(/.{1,4}/g)!.join('-'));
  db().prepare('DELETE FROM recovery_codes WHERE user_id=?').run(id);
  for (const code of codes) db().prepare('INSERT INTO recovery_codes VALUES (?,?)').run(digest(code.replaceAll('-','')),id);
  return codes;
}
export function rateLimit(key: string, max: number, windowMs = 15*60000) {
  const d = db(); const now = Date.now();
  d.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
  const row = d.prepare(`INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).get(digest(key),now+windowMs) as {attempts:number};
  if (row.attempts > max) throw new HttpError('Too many attempts. Please try again later.',429);
}
export async function payload(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== request.headers.get('host'))) throw new HttpError('Request origin is not allowed.',403);
  const raw = await request.text();
  if (raw.length > 25000) throw new HttpError('Request is too large.',413);
  let value;
  try { value = JSON.parse(raw); } catch { throw new HttpError('Invalid request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('Invalid request.');
  return value;
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
  console.error('Request failed', error instanceof Error ? error.name : 'Unknown error');
  return Response.json({error:'Could not save your changes. Please try again.'},{status:500});
}
export function transaction<T>(run:()=>T): T {
  const d=db();d.exec('BEGIN IMMEDIATE');
  try { const result=run();d.exec('COMMIT');return result; } catch(error){d.exec('ROLLBACK');throw error;}
}
