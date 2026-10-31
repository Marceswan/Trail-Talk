import { db } from '@/lib/db';
import { failure, HttpError, payload, rateLimit, requireAccount, textField, transaction } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reasons=['Spam','Harassment','Private information','Off topic','Other'];
async function moderator() {
  const user=await requireAccount();
  if(!['admin','moderator'].includes(user.role)) throw new HttpError('Moderator access is required.',403);
  return user;
}
export async function GET(request: Request) {
  try {
    const user=await moderator(); const d=db();
    const search=new URL(request.url).searchParams.get('q')?.slice(0,100)||'';
    const like=`%${search}%`;
    return Response.json({
      role:user.role,
      reports:d.prepare(`SELECT r.*,p.name AS reporter_name,
        CASE WHEN r.target_type='post' THEN (SELECT title FROM posts WHERE id=r.target_id) ELSE (SELECT body FROM comments WHERE id=r.target_id) END AS content
        FROM reports r JOIN profiles p ON p.id=r.reporter ORDER BY (r.status='open') DESC,r.created_at DESC LIMIT 100`).all(),
      posts:d.prepare('SELECT id,title AS content,author,owner,removed,locked FROM posts WHERE title LIKE ? OR author LIKE ? ORDER BY id DESC LIMIT 100').all(like,like),
      comments:d.prepare('SELECT id,post_id,body AS content,author,owner,removed FROM comments WHERE body LIKE ? OR author LIKE ? ORDER BY id DESC LIMIT 100').all(like,like),
      users:d.prepare('SELECT id,name,role,suspended FROM profiles WHERE password_hash IS NOT NULL AND name LIKE ? ORDER BY name LIMIT 100').all(like),
      log:d.prepare('SELECT l.*,p.name AS actor_name FROM moderation_log l JOIN profiles p ON p.id=l.actor ORDER BY l.id DESC LIMIT 100').all(),
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request: Request) {
  try {
    const p=await payload(request); const d=db();
    const user=p.action==='report'?await requireAccount():await moderator();
    rateLimit(`moderation:${user.id}`,60,60000);
    if(p.action==='report') {
      if(!['post','comment'].includes(p.targetType) || !Number.isSafeInteger(p.targetId)) throw new HttpError('Choose a valid report target.');
      const target=p.targetType==='post'?d.prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(p.targetId):d.prepare('SELECT c.id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.removed=0 AND p.removed=0').get(p.targetId);
      if(!target) throw new HttpError('Content not found.',404);
      if(!reasons.includes(p.reason)) throw new HttpError('Choose a report reason.');
      const details=textField(p.details??'','Details',0,1000);
      d.prepare('INSERT OR IGNORE INTO reports (reporter,target_type,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?)').run(user.id,p.targetType,p.targetId,p.reason,details,Date.now());
      return Response.json({ok:true});
    }
    const reason=textField(p.reason,'Moderation reason',3,500);
    transaction(()=>{
      if(p.action==='dismiss') {
        if(!Number.isSafeInteger(p.reportId)||!d.prepare("SELECT id FROM reports WHERE id=? AND status='open'").get(p.reportId)) throw new HttpError('Open report not found.',404);
        d.prepare("UPDATE reports SET status='dismissed' WHERE id=?").run(p.reportId);
        audit('dismiss','report',String(p.reportId));
      } else if(['remove','restore','lock','unlock'].includes(p.action)) {
        if(!['post','comment'].includes(p.targetType)||!Number.isSafeInteger(p.targetId)) throw new HttpError('Invalid target.');
        const table=p.targetType==='post'?'posts':'comments';
        if(!d.prepare(`SELECT id FROM ${table} WHERE id=?`).get(p.targetId)) throw new HttpError('Content not found.',404);
        if(['lock','unlock'].includes(p.action) && table!=='posts') throw new HttpError('Only conversations can be locked.');
        const column=['lock','unlock'].includes(p.action)?'locked':'removed';
        const value=['remove','lock'].includes(p.action)?1:0;
        d.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(value,p.targetId);
        if(p.action==='remove') d.prepare("UPDATE reports SET status='actioned' WHERE target_type=? AND target_id=? AND status='open'").run(p.targetType,p.targetId);
        audit(p.action,p.targetType,String(p.targetId));
      } else if(['suspend','unsuspend','role'].includes(p.action)) {
        const id=textField(p.userId,'Account',1,100);
        const target=d.prepare('SELECT role FROM profiles WHERE id=? AND password_hash IS NOT NULL').get(id);
        if(!target) throw new HttpError('Account not found.',404);
        if(id===user.id || target.role==='admin') throw new HttpError('This account cannot be changed here.',403);
        if(p.action==='role') {
          if(user.role!=='admin') throw new HttpError('Administrator access is required.',403);
          if(!['moderator','user'].includes(p.role)) throw new HttpError('Choose a valid role.');
          d.prepare('UPDATE profiles SET role=? WHERE id=?').run(p.role,id);
          audit(`role:${p.role}`,'account',id);
        } else {
          if(target.role==='moderator'&&user.role!=='admin') throw new HttpError('Only an administrator can suspend a moderator.',403);
          d.prepare('UPDATE profiles SET suspended=? WHERE id=?').run(p.action==='suspend'?1:0,id);
          audit(p.action,'account',id);
        }
      } else throw new HttpError('Unknown moderation action.');
    });
    return Response.json({ok:true});
    function audit(action:string,type:string,id:string) {d.prepare('INSERT INTO moderation_log (actor,action,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)').run(user.id,action,type,id,reason,Date.now());}
  }catch(error){return failure(error);}
}
