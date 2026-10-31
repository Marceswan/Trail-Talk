import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { isPostgres } from '@/lib/database';
import { failure, HttpError, payload, rateLimit, textField, transaction } from '@/lib/auth';
import { siteSettings } from '@/lib/site-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const viewer = await requireAdmin();
    const params = new URL(request.url).searchParams;
    const search = (params.get('q') || '').trim().slice(0,100);
    const role = params.get('role') || '';
    const status = params.get('status') || '';
    const page = Number(params.get('page') || 1);
    if (!Number.isSafeInteger(page) || page<1 || page>100000) throw new HttpError('Choose a valid page.');
    if (!['','user','moderator','admin'].includes(role) || !['','active','suspended'].includes(status)) throw new HttpError('Choose a valid user filter.');
    const match = isPostgres() ? 'ILIKE' : 'LIKE';
    const where = [`password_hash IS NOT NULL`];
    const values:(string|number)[] = [];
    if (search) {
      const escaped = `%${search.replace(/[!%_]/g,c=>'!'+c)}%`;
      where.push(`(name ${match} ? ESCAPE '!' OR email ${match} ? ESCAPE '!')`);
      values.push(escaped,escaped);
    }
    if (role) { where.push('role=?'); values.push(role); }
    if (status) { where.push('suspended=?'); values.push(status==='suspended'?1:0); }
    const condition = where.join(' AND '), d=db();
    const total = Number((await d.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE ${condition}`).get(...values))?.count || 0);
    const users = await d.prepare(`SELECT id,name,email,role,suspended FROM profiles WHERE ${condition} ORDER BY LOWER(name),id LIMIT 20 OFFSET ?`).all(...values,(page-1)*20);
    const counts = await d.prepare(`SELECT
      (SELECT COUNT(*) FROM profiles WHERE password_hash IS NOT NULL) AS users,
      (SELECT COUNT(*) FROM profiles WHERE password_hash IS NOT NULL AND role IN ('admin','moderator') AND suspended=0) AS staff,
      (SELECT COUNT(*) FROM profiles WHERE password_hash IS NOT NULL AND suspended=1) AS suspended,
      (SELECT COUNT(*) FROM reports WHERE status='open') AS open_reports`).get();
    return Response.json({viewerId:viewer.id,users,total,page,pageSize:20,
      counts:{users:Number(counts?.users),staff:Number(counts?.staff),suspended:Number(counts?.suspended),openReports:Number(counts?.open_reports)},
      settings:await siteSettings(),
      log:await d.prepare('SELECT l.*,p.name AS actor_name FROM moderation_log l JOIN profiles p ON p.id=l.actor ORDER BY l.id DESC LIMIT 50').all(),
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const p=await payload(request);
    return await transaction(async()=>{
      // Recheck the role under the same write lock used for role changes.
      const viewer=await requireAdmin(), d=db();
      await rateLimit(`admin:${viewer.id}`,60,60000);
      const reason=textField(p.reason,'Reason for change',3,500);
      let target='site', targetId='1', action=String(p.action);
      if (p.action==='settings') {
        if (!Number.isSafeInteger(p.revision) || p.revision<0) throw new HttpError('A settings revision is required.');
        if ((await siteSettings()).revision!==p.revision) throw new HttpError('Site settings changed in another tab. Reload settings before saving.',409);
        if (typeof p.registrationOpen!=='boolean') throw new HttpError('Choose whether registration is open.');
        const settings={headline:textField(p.headline,'Homepage headline',3,100),description:textField(p.description,'Homepage description',3,300),notice:textField(p.notice,'Site notice',0,500),registrationOpen:p.registrationOpen};
        await d.prepare('UPDATE site_settings SET value=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(settings),p.revision);
        action='settings:update';
      } else if (['role','suspend','unsuspend','signOut'].includes(p.action)) {
        target='account'; targetId=textField(p.userId,'Account',1,100);
        const user=await d.prepare('SELECT role,suspended FROM profiles WHERE id=? AND password_hash IS NOT NULL').get(targetId);
        if (!user) throw new HttpError('Account not found.',404);
        if (targetId===viewer.id) throw new HttpError('You cannot change your own access from the admin panel.',403);
        if (p.action==='role') {
          if (!['user','moderator','admin'].includes(p.role)) throw new HttpError('Choose a valid role.');
          await d.prepare('UPDATE profiles SET role=? WHERE id=?').run(p.role,targetId);
          action=`role:${p.role}`;
        } else if (p.action!=='signOut') {
          await d.prepare('UPDATE profiles SET suspended=? WHERE id=?').run(p.action==='suspend'?1:0,targetId);
        }
        // Every access change is atomic with this guard and its audit record.
        const activeAdmins=Number((await d.prepare("SELECT COUNT(*) AS count FROM profiles WHERE role='admin' AND suspended=0 AND password_hash IS NOT NULL").get())?.count);
        if (!activeAdmins) throw new HttpError('At least one active administrator is required.',409);
        if (p.action==='suspend' || p.action==='signOut') await d.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
      } else throw new HttpError('Unknown admin action.');
      await d.prepare('INSERT INTO moderation_log (actor,action,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)').run(viewer.id,action,target,targetId,reason,Date.now());
      return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    });
  } catch(error) { return failure(error); }
}
