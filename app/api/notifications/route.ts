import { account, failure, HttpError, payload, rateLimit } from '@/lib/auth';
import { markdownExcerpt } from '@/lib/markdown';
import { db } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const visible=`FROM notifications n JOIN comments c ON c.id=n.comment_id JOIN posts p ON p.id=c.post_id WHERE n.recipient=? AND c.removed=0 AND p.removed=0`;
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
  try {
    const user=await account();if(!user)throw new HttpError('Sign in to see your inbox.',401);
    const d=db();const params=new URL(request.url).searchParams;
    const unread=(await d.prepare(`SELECT COUNT(*) AS count ${visible} AND n.read_at IS NULL`).get(user.id))!.count;
    if(params.get('summary')==='1')return Response.json({unread},{headers});
    const before=params.has('before')?Number(params.get('before')):Number.MAX_SAFE_INTEGER;
    if(!Number.isSafeInteger(before)||before<1)throw new HttpError('Invalid inbox page.');
    const rows=(await d.prepare(`SELECT n.id,n.comment_id,c.post_id,n.kind,c.author,p.title,c.body,n.created_at,n.read_at ${visible} AND CAST(n.id AS BIGINT)<? ${params.get('unread')==='1'?'AND n.read_at IS NULL':''} ORDER BY n.id DESC LIMIT 21`).all(user.id,before));
    const more=rows.length>20;const items=rows.slice(0,20).map(row=>({...row,id:Number(row.id),body:markdownExcerpt(String(row.body),300)}));
    return Response.json({items,unread,nextCursor:more?items[items.length-1].id:null},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  try{
    const p=await payload(request);const user=await account();if(!user)throw new HttpError('Sign in to continue.',401);
    (await rateLimit(`inbox:${user.id}`,120,60000));
    if(p.action==='readAll')(await db().prepare('UPDATE notifications SET read_at=? WHERE recipient=? AND read_at IS NULL').run(Date.now(),user.id));
    else if(p.action==='read'){
      if(!Number.isSafeInteger(p.id)||!(await db().prepare('SELECT id FROM notifications WHERE id=? AND recipient=?').get(p.id,user.id)))throw new HttpError('Notification not found.',404);
      (await db().prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient=?').run(Date.now(),p.id,user.id));
    }else throw new HttpError('Unknown inbox action.');
    return Response.json({ok:true},{headers});
  }catch(error){return failure(error);}
}
