import { join } from 'node:path';
const email=process.argv[2]?.trim().toLowerCase();
if(!email){console.error('Usage: npm run admin -- your-account@example.com');process.exit(1);}
if(process.env.DATABASE_URL&&!process.env.DATABASE_PATH){
  const {default:pg}=await import('pg');const d=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL});await d.connect();
  try{
    await d.query('BEGIN');await d.query('SELECT pg_advisory_xact_lock(716284103)');
    const user=(await d.query('SELECT id FROM profiles WHERE email=$1 AND password_hash IS NOT NULL',[email])).rows[0];
    if(!user)throw new Error('Register this account in TrailTalk first.');
    await d.query("UPDATE profiles SET role='admin',suspended=0 WHERE id=$1",[user.id]);
    await d.query("INSERT INTO moderation_log (actor,action,target_type,target_id,reason,created_at) VALUES ($1,'role:admin','account',$2,'Granted by database administrator',$3)",[user.id,user.id,Date.now()]);
    await d.query('COMMIT');
  }catch(error){await d.query('ROLLBACK');throw error;}finally{await d.end();}
}else{
  const {DatabaseSync}=await import('node:sqlite');
  const d=new DatabaseSync(process.env.DATABASE_PATH||join(process.cwd(),'data','trailtalk.sqlite'));d.exec('PRAGMA busy_timeout=5000');
  const user=d.prepare('SELECT id FROM profiles WHERE email=? AND password_hash IS NOT NULL').get(email);
  if(!user){d.close();throw new Error('Register this account in TrailTalk first.');}
  d.exec('BEGIN IMMEDIATE');
  try{
    d.prepare("UPDATE profiles SET role='admin',suspended=0 WHERE id=?").run(user.id);
    d.prepare("INSERT INTO moderation_log (actor,action,target_type,target_id,reason,created_at) VALUES (?,'role:admin','account',?,'Granted by local database administrator',?)").run(user.id,user.id,Date.now());d.exec('COMMIT');
  }catch(error){d.exec('ROLLBACK');throw error;}finally{d.close();}
}
console.log(`Administrator access granted to ${email}. Refresh TrailTalk to open Moderation.`);
