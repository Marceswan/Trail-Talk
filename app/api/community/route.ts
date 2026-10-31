import {validateProfileVisibility} from '@/lib/profile-visibility';
import { normalizePostTags } from '@/lib/post-tags';
import { account, requireAccount, HttpError, payload as readPayload, rateLimit, transaction, failure } from '@/lib/auth';
import { commentsForPost, db, feed } from '@/lib/db';
import { topics } from '@/lib/feed-navigation';
import { canPublishPost } from '@/lib/post-permissions';
import {savePostImages,validateImages} from '@/lib/post-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = (await account())?.id || '';
  const post = new URL(request.url).searchParams.get('post');
  if (post) {
    if (!(await db().prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(Number(post)))) return Response.json({error:'Post not found.'},{status:404});
    return Response.json({ comments: (await commentsForPost(Number(post), user)) },{headers:{'Cache-Control':'private, no-store'}});
  }
  return Response.json((await feed(user)),{headers:{'Cache-Control':'private, no-store'}});
}

function field(value: unknown, name: string, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(`${name} must be ${min}–${max} characters.`);
  return value.trim();
}
async function saveTags(postId:number,value:unknown) {
  let tags:string[];
  try {tags=normalizePostTags(value);} catch(error) {throw new HttpError((error as Error).message);}
  await db().prepare('DELETE FROM post_tags WHERE post_id=?').run(postId);
  for (const tag of tags) await db().prepare('INSERT INTO post_tags (post_id,label) VALUES (?,?)').run(postId,tag);
}
export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    return await transaction(async () => {
    const current = await requireAccount();
    const user = current.id;
    (await rateLimit(`community:${user}`,120,60000));
    const d = db();
    const profile = (await d.prepare('SELECT name FROM profiles WHERE id=?').get(user)) as { name: string };
    const { action } = payload;
    if (['vote', 'save', 'comment'].includes(action)) {
      if (!Number.isSafeInteger(payload.postId) || !(await d.prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(payload.postId))) return Response.json({ error: 'Post not found.' }, { status: 404 });
    }
    if (action === 'acceptAnswer') {
      (await transaction(async ()=>{
        if(!Number.isSafeInteger(payload.postId))throw new HttpError('Question not found.',404);
        const post=(await d.prepare('SELECT owner,tag,locked,removed,answer_revision FROM posts WHERE id=?').get(payload.postId));
        if(!post||post.removed)throw new HttpError('Question not found.',404);
        if(post.owner!==user)throw new HttpError('Only the question author can choose an accepted answer.',403);
        if(post.tag!=='Question')throw new HttpError('Accepted answers are only available on questions.');
        if(post.locked)throw new HttpError('This conversation is locked by moderators.',403);
        if(!Number.isSafeInteger(payload.revision)||payload.revision<0)throw new HttpError('An answer revision is required.');
        if(post.answer_revision!==payload.revision)throw new HttpError('The accepted answer changed in another tab. Reload before choosing again.',409);
        if(payload.commentId!==null){
          if(!Number.isSafeInteger(payload.commentId))throw new HttpError('Choose a valid answer.');
          if(!(await d.prepare('SELECT id FROM comments WHERE id=? AND post_id=? AND removed=0').get(payload.commentId,payload.postId)))throw new HttpError('That answer is no longer available in this question.',404);
        }
        (await d.prepare('UPDATE posts SET accepted_comment_id=?,answer_revision=answer_revision+1 WHERE id=?').run(payload.commentId, payload.postId));
      }));
    } else if (action === 'editPost' || action === 'editComment') {
      const isPost=action==='editPost';
      const id=isPost?payload.postId:payload.commentId;
      if (!Number.isSafeInteger(id)) throw new HttpError('Content not found.',404);
      const row=(isPost
        ? (await d.prepare('SELECT owner,removed,locked,revision,community,tag FROM posts WHERE id=?').get(id))
        : (await d.prepare('SELECT c.owner,c.removed,c.revision,p.locked,p.removed AS post_removed FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?').get(id)));
      if (!row || row.removed || row.post_removed) throw new HttpError('Content not found.',404);
      if (row.owner!==user) throw new HttpError('You can only edit your own content.',403);
      if (isPost && !canPublishPost(current.role, String(row.community), String(row.tag))) throw new HttpError('Only admins and moderators can publish or edit announcements.',403);
      if (row.locked) throw new HttpError('This conversation is locked by moderators.',403);
      if (!Number.isSafeInteger(payload.revision)||payload.revision<0) throw new HttpError('A content revision is required.');
      if (row.revision!==payload.revision) throw new HttpError('This content changed in another tab. Copy your draft, reload, and try again.',409);
      const hasImages=isPost&&(payload.images===undefined
        ? Boolean(await d.prepare('SELECT id FROM post_images WHERE post_id=? LIMIT 1').get(id))
        : validateImages(payload.images).length>0);
      const body=field(payload.body,isPost?'Post':'Comment',isPost?10000:4000,isPost?(hasImages?0:10):1);
      if(isPost) {
        const title=field(payload.title,'Title',180,5);
        (await d.prepare('UPDATE posts SET title=?,body=?,edited_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').run(title,body,Date.now(),id,user,payload.revision));
        if(payload.tags!==undefined) await saveTags(id,payload.tags);
        if(payload.images!==undefined) await savePostImages(id,user,payload.images);
      } else {
        (await d.prepare('UPDATE comments SET body=?,edited_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').run(body,Date.now(),id,user,payload.revision));
        const postId=(await d.prepare('SELECT post_id FROM comments WHERE id=?').get(id))!.post_id as number;
        return Response.json({comments:(await commentsForPost(postId,user))});
      }
    } else if (action === 'commentVote') {
      if (!Number.isSafeInteger(payload.commentId)) return Response.json({ error: 'Comment not found.' }, { status: 404 });
      const comment = (await d.prepare('SELECT c.post_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.removed=0 AND p.removed=0').get(payload.commentId)) as { post_id: number } | undefined;
      if (!comment) return Response.json({ error: 'Comment not found.' }, { status: 404 });
      if (![0, 1, -1].includes(payload.value)) throw new HttpError('Invalid vote.');
      if (payload.value === 0) (await d.prepare('DELETE FROM comment_votes WHERE user_id=? AND comment_id=?').run(user, payload.commentId));
      else (await d.prepare('INSERT INTO comment_votes (user_id, comment_id, value) VALUES (?, ?, ?) ON CONFLICT(user_id, comment_id) DO UPDATE SET value=excluded.value').run(user, payload.commentId, payload.value));
      return Response.json({ comments: (await commentsForPost(comment.post_id, user)) });
    } else if (action === 'vote') {
      if (![0, 1, -1].includes(payload.value)) throw new HttpError('Invalid vote.');
      if (!payload.value) (await d.prepare('DELETE FROM votes WHERE user_id=? AND post_id=?').run(user, payload.postId));
      else (await d.prepare('INSERT INTO votes VALUES (?, ?, ?) ON CONFLICT(user_id, post_id) DO UPDATE SET value=excluded.value').run(user, payload.postId, payload.value));
    } else if (action === 'save') {
      if (typeof payload.value !== 'boolean') throw new HttpError('Invalid bookmark.');
      if (payload.value) (await d.prepare('INSERT INTO saves VALUES (?, ?) ON CONFLICT DO NOTHING').run(user, payload.postId));
      else (await d.prepare('DELETE FROM saves WHERE user_id=? AND post_id=?').run(user, payload.postId));
    } else if (action === 'join') {
      if (typeof payload.community !== 'string' || !(await d.prepare('SELECT id FROM communities WHERE id=?').get(payload.community))) throw new HttpError('Choose a community.');
      if (typeof payload.value !== 'boolean') throw new HttpError('Invalid membership.');
      if (payload.value) (await d.prepare('INSERT INTO memberships VALUES (?, ?) ON CONFLICT DO NOTHING').run(user, payload.community));
      else (await d.prepare('DELETE FROM memberships WHERE user_id=? AND community=?').run(user, payload.community));
    } else if (action === 'post') {
      if (payload.expectedAccount !== undefined && payload.expectedAccount !== current.email) throw new HttpError('Your signed-in account changed. Close this draft and refresh before publishing.',409);
      const title = field(payload.title, 'Title', 180, 5);
      const images=validateImages(payload.images);
      const body = field(payload.body, 'Post', 10000, images.length?0:10);
      const community = field(payload.community, 'Community', 40);
      if (!(await d.prepare('SELECT id FROM communities WHERE id=?').get(community))) throw new HttpError('Choose a community.');
      const tag = field(payload.tag, 'Topic', 30);
      if (!topics.slice(1).includes(tag)) throw new HttpError('Choose a valid topic.');
      if (!canPublishPost(current.role, community, tag)) throw new HttpError('Only admins and moderators can publish or edit announcements.',403);
      const initials = profile.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
      const result = (await d.prepare('INSERT INTO posts (community, author, initials, title, body, tag, created_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').run(community, profile.name, initials, title, body, tag, Date.now(), user));
      await saveTags(Number(result.lastInsertRowid),payload.tags);
      await savePostImages(Number(result.lastInsertRowid),user,images);
      return Response.json({ ...(await feed(user)), createdId: Number(result.lastInsertRowid) });
    } else if (action === 'comment') {
      if ((await d.prepare('SELECT locked FROM posts WHERE id=?').get(payload.postId))?.locked) throw new HttpError('This conversation is locked by moderators.',403);
      const body = field(payload.body, 'Comment', 4000);
      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        if (!Number.isSafeInteger(parentId)) throw new HttpError('Choose a valid comment to reply to.');
        const parent = (await d.prepare('SELECT id FROM comments WHERE id=? AND post_id=? AND removed=0').get(parentId,payload.postId));
        if (!parent) throw new HttpError('This comment is no longer available for replies.',404);
        const ancestry = (await d.prepare(`WITH RECURSIVE ancestors(id,parent_id,depth) AS (
          SELECT id,parent_id,1 FROM comments WHERE id=?
          UNION ALL SELECT c.id,c.parent_id,a.depth+1 FROM comments c JOIN ancestors a ON c.id=a.parent_id WHERE a.depth<=5
        ) SELECT MAX(depth) AS depth FROM ancestors`).get(parentId)) as {depth:number};
        if (ancestry.depth > 5) throw new HttpError('This reply thread is full. Add a new comment to continue.');
      }
      (await transaction(async ()=>{
        const now=Date.now();
        const result=(await d.prepare('INSERT INTO comments (post_id, author, body, created_at, owner, parent_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').run(payload.postId, profile.name, body, now, user,parentId));
        const recipients=new Map<string,'comment'|'reply'>();
        const postOwner=(await d.prepare('SELECT owner FROM posts WHERE id=?').get(payload.postId))?.owner;
        if(typeof postOwner==='string'&&postOwner!==user) recipients.set(postOwner,'comment');
        const parentOwner=parentId===null?null:(await d.prepare('SELECT owner FROM comments WHERE id=?').get(parentId))?.owner;
        if(typeof parentOwner==='string'&&parentOwner!==user) recipients.set(parentOwner,'reply');
        for(const [recipient,kind] of recipients) (await d.prepare('INSERT INTO notifications (recipient,comment_id,kind,created_at) VALUES (?,?,?,?)').run(recipient,result.lastInsertRowid,kind,now));
      }));
    } else if (action === 'profile') {
      const name = field(payload.name, 'Name', 40, 2);
      const bio = field(payload.bio ?? '', 'Bio', 1000, 0);
      const previous = (await d.prepare('SELECT profile_visibility,employer,job_title,years_experience,location,skills,certifications,website,trailhead_url FROM profiles WHERE id=?').get(user))!;
      let visibility=String(previous.profile_visibility||'{}');
      if(payload.visibility!==undefined){try{visibility=JSON.stringify(validateProfileVisibility(payload.visibility,previous.profile_visibility));}catch(error){throw new HttpError((error as Error).message);}}
      const details = Object.fromEntries(['employer','job_title','location','skills','certifications'].map(key=>[key,field(payload[key]??previous[key]??'',key.replaceAll('_',' '),['skills','certifications'].includes(key)?300:100,0)]));
      const yearsInput=payload.years_experience===undefined?previous.years_experience:payload.years_experience;
      if(yearsInput!==null&&typeof yearsInput!=='string'&&typeof yearsInput!=='number')throw new HttpError('Enter years of experience as a whole number.');
      const years=yearsInput===''||yearsInput===null?null:Number(yearsInput);
      if(years!==null&&(!Number.isInteger(years)||years<0||years>80))throw new HttpError('Years of experience must be a whole number from 0 to 80.');
      const links:Record<string,string>={};
      for(const key of ['website','trailhead_url']) {
        const value=field(payload[key]??previous[key]??'',key==='website'?'Website':'Trailhead URL',500,0);
        if(value){let url:URL;try{url=new URL(value);}catch{throw new HttpError('Enter a complete website URL starting with https:// or http://.');}
          if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new HttpError('Profile links must use https:// or http:// without embedded credentials.');}
        links[key]=value;
      }
      await transaction(async () => {
        (await d.prepare('UPDATE profiles SET name=?,bio=?,employer=?,job_title=?,years_experience=?,location=?,skills=?,certifications=?,website=?,trailhead_url=?,profile_visibility=? WHERE id=?').run(name,bio,details.employer,details.job_title,years,details.location,details.skills,details.certifications,links.website,links.trailhead_url,visibility,user));
        (await d.prepare('UPDATE posts SET author=?, initials=? WHERE owner=?').run(name, name.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase(), user));
        (await d.prepare('UPDATE comments SET author=? WHERE owner=?').run(name, user));
      });
    } else return Response.json({ error: 'Unknown action.' }, { status: 400 });
    return Response.json((await feed(user)),{headers:{'Cache-Control':'private, no-store'}});
    });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
    return failure(error);
  }
}
