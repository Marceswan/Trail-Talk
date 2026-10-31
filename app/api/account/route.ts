import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { siteSettings } from '@/lib/site-settings';
import { account, digest, endSession, failure, hashPassword, HttpError, passwordField, payload, rateLimit, recoveryCodes, startSession, textField, transaction, verifyPassword, type Account } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request: Request) {
  try {
    const p=await payload(request); const d=db();
    if (p.action==='logout') { await endSession(); return Response.json({ok:true}); }
    if (p.action==='changePassword' || p.action==='regenerateCodes') {
      const user=await account(); if(!user) throw new HttpError('Sign in to continue.',401);
      (await rateLimit(`credentials:${user.id}`,10));
      if(!await verifyPassword(passwordField(p.currentPassword),user.password_hash)) throw new HttpError('Current password is incorrect.',401);
      const nextHash=p.action==='changePassword'?await hashPassword(passwordField(p.password)):null;
      const codes=(await transaction(async ()=>{
        // Recheck after asynchronous hashing so concurrent recovery cannot be undone.
        if(!((await d.prepare('SELECT id FROM profiles WHERE id=? AND password_hash=?').get(user.id,user.password_hash)))) throw new HttpError('Your account changed. Sign in again.',401);
        if(nextHash) (await d.prepare('UPDATE profiles SET password_hash=? WHERE id=?').run(nextHash,user.id));
        (await d.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id));
        return (await recoveryCodes(user.id));
      }));
      await endSession();
      return Response.json({codes, message:'All sessions have been signed out. Save your replacement recovery codes, then sign in again.'},{headers:{'Cache-Control':'no-store'}});
    }
    if(!['register','login','recover'].includes(p.action)) throw new HttpError('Unknown action.');
    const email=textField(p.email,'Email',3,254).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError('Enter a valid email address.');
    const password=passwordField(p.password);
    (await rateLimit(`auth:${p.action}:${email}`,10));
    (await rateLimit('auth:global',150,60000));
    const user=(await d.prepare('SELECT * FROM profiles WHERE email=?').get(email)) as Account|undefined;
    if(p.action==='register') {
      if (!(await siteSettings()).registrationOpen) throw new HttpError('New account registration is currently closed. Existing members can still sign in.',403);
      const name=textField(p.name,'Display name',2,40);
      const hash=await hashPassword(password);
      const id=randomUUID();
      const codes=(await transaction(async ()=>{
        if (!(await siteSettings()).registrationOpen) throw new HttpError('New account registration is currently closed. Existing members can still sign in.',403);
        if((await d.prepare('SELECT id FROM profiles WHERE email=?').get(email))) throw new HttpError('Unable to create this account. Try signing in or recovering your account.');
        (await d.prepare('INSERT INTO profiles (id,name,email,password_hash) VALUES (?,?,?,?)').run(id,name,email,hash));
        return (await recoveryCodes(id));
      }));
      await startSession(id,hash);
      return Response.json({codes,message:'Save these codes somewhere private. Each code can recover your account once.'},{status:201,headers:{'Cache-Control':'no-store'}});
    }
    if(p.action==='login') {
      if(!await verifyPassword(password,user?.password_hash)) throw new HttpError('Email or password is incorrect.',401);
      // Password might have changed while scrypt was running.
      if(!(await d.prepare('SELECT id FROM profiles WHERE id=? AND password_hash=?').get(user!.id,user!.password_hash))) throw new HttpError('Email or password is incorrect.',401);
      await startSession(user!.id,user!.password_hash);
      return Response.json({ok:true});
    }
    const code=textField(p.code,'Recovery code',1,80).replaceAll('-','').toLowerCase();
    const hash=await hashPassword(password); // same work for valid and invalid accounts
    const codes=(await transaction(async ()=>{
      if(!user || (await d.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?').run(user.id,digest(code))).changes!==1) throw new HttpError('Email or recovery code is incorrect.',401);
      (await d.prepare('UPDATE profiles SET password_hash=? WHERE id=?').run(hash,user.id));
      (await d.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id));
      return (await recoveryCodes(user.id));
    }));
    await endSession();
    return Response.json({codes,message:'Password reset. All old sessions and recovery codes are invalid. Save these replacement codes, then sign in.'},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
