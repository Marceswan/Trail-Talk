import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const email=process.argv[2]?.trim().toLowerCase();
if(!email){console.error('Usage: npm run admin -- your-account@example.com');process.exit(1);}
const d=new DatabaseSync(process.env.DATABASE_PATH||join(process.cwd(),'data','trailtalk.sqlite'));
d.exec('PRAGMA busy_timeout=5000');
const user=d.prepare('SELECT id FROM profiles WHERE email=? AND password_hash IS NOT NULL').get(email);
if(!user){console.error('Register this account in TrailTalk first.');process.exit(1);}
d.exec('BEGIN IMMEDIATE');
try{
  d.prepare("UPDATE profiles SET role='admin',suspended=0 WHERE id=?").run(user.id);
  d.prepare("INSERT INTO moderation_log (actor,action,target_type,target_id,reason,created_at) VALUES (?,'role:admin','account',?,'Granted by local database administrator',?)").run(user.id,user.id,Date.now());
  d.exec('COMMIT');
}catch(error){d.exec('ROLLBACK');throw error;}
d.close();
console.log(`Administrator access granted to ${email}. Refresh TrailTalk to open Moderation.`);
