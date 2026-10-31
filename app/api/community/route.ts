import { account, requireAccount, HttpError, payload as readPayload, rateLimit, transaction } from '@/lib/auth';
import { commentsForPost, db, feed } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = (await account())?.id || '';
  const post = new URL(request.url).searchParams.get('post');
  if (post) {
    if (!db().prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(Number(post))) return Response.json({error:'Post not found.'},{status:404});
    return Response.json({ comments: commentsForPost(Number(post), user) },{headers:{'Cache-Control':'private, no-store'}});
  }
  return Response.json(feed(user),{headers:{'Cache-Control':'private, no-store'}});
}

function field(value: unknown, name: string, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`${name} must be ${min}–${max} characters.`);
  return value.trim();
}
export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    const current = await requireAccount();
    const user = current.id;
    rateLimit(`community:${user}`,120,60000);
    const d = db();
    const profile = d.prepare('SELECT name FROM profiles WHERE id=?').get(user) as { name: string };
    const { action } = payload;
    if (['vote', 'save', 'comment'].includes(action)) {
      if (!Number.isSafeInteger(payload.postId) || !d.prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(payload.postId)) return Response.json({ error: 'Post not found.' }, { status: 404 });
    }
    if (action === 'acceptAnswer') {
      transaction(()=>{
        if(!Number.isSafeInteger(payload.postId))throw new HttpError('Question not found.',404);
        const post=d.prepare('SELECT owner,tag,locked,removed,answer_revision FROM posts WHERE id=?').get(payload.postId);
        if(!post||post.removed)throw new HttpError('Question not found.',404);
        if(post.owner!==user)throw new HttpError('Only the question author can choose an accepted answer.',403);
        if(post.tag!=='Question')throw new HttpError('Accepted answers are only available on questions.');
        if(post.locked)throw new HttpError('This conversation is locked by moderators.',403);
        if(!Number.isSafeInteger(payload.revision)||payload.revision<0)throw new HttpError('An answer revision is required.');
        if(post.answer_revision!==payload.revision)throw new HttpError('The accepted answer changed in another tab. Reload before choosing again.',409);
        if(payload.commentId!==null){
          if(!Number.isSafeInteger(payload.commentId))throw new HttpError('Choose a valid answer.');
          if(!d.prepare('SELECT id FROM comments WHERE id=? AND post_id=? AND removed=0').get(payload.commentId,payload.postId))throw new HttpError('That answer is no longer available in this question.',404);
        }
        d.prepare('UPDATE posts SET accepted_comment_id=?,answer_revision=answer_revision+1 WHERE id=?').run(payload.commentId, payload.postId);
      });
    } else if (action === 'editPost' || action === 'editComment') {
      const isPost=action==='editPost';
      const id=isPost?payload.postId:payload.commentId;
      if (!Number.isSafeInteger(id)) throw new HttpError('Content not found.',404);
      const row=(isPost
        ? d.prepare('SELECT owner,removed,locked,revision FROM posts WHERE id=?').get(id)
        : d.prepare('SELECT c.owner,c.removed,c.revision,p.locked,p.removed AS post_removed FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?').get(id));
      if (!row || row.removed || row.post_removed) throw new HttpError('Content not found.',404);
      if (row.owner!==user) throw new HttpError('You can only edit your own content.',403);
      if (row.locked) throw new HttpError('This conversation is locked by moderators.',403);
      if (!Number.isSafeInteger(payload.revision)||payload.revision<0) throw new HttpError('A content revision is required.');
      if (row.revision!==payload.revision) throw new HttpError('This content changed in another tab. Copy your draft, reload, and try again.',409);
      const body=field(payload.body,isPost?'Post':'Comment',isPost?10000:4000,isPost?10:1);
      if(isPost) {
        const title=field(payload.title,'Title',180,5);
        d.prepare('UPDATE posts SET title=?,body=?,edited_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').run(title,body,Date.now(),id,user,payload.revision);
      } else {
        d.prepare('UPDATE comments SET body=?,edited_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').run(body,Date.now(),id,user,payload.revision);
        const postId=d.prepare('SELECT post_id FROM comments WHERE id=?').get(id)!.post_id as number;
        return Response.json({comments:commentsForPost(postId,user)});
      }
    } else if (action === 'commentVote') {
      if (!Number.isSafeInteger(payload.commentId)) return Response.json({ error: 'Comment not found.' }, { status: 404 });
      const comment = d.prepare('SELECT c.post_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.removed=0 AND p.removed=0').get(payload.commentId) as { post_id: number } | undefined;
      if (!comment) return Response.json({ error: 'Comment not found.' }, { status: 404 });
      if (![0, 1, -1].includes(payload.value)) throw new Error('Invalid vote.');
      if (payload.value === 0) d.prepare('DELETE FROM comment_votes WHERE user_id=? AND comment_id=?').run(user, payload.commentId);
      else d.prepare('INSERT INTO comment_votes (user_id, comment_id, value) VALUES (?, ?, ?) ON CONFLICT(user_id, comment_id) DO UPDATE SET value=excluded.value').run(user, payload.commentId, payload.value);
      return Response.json({ comments: commentsForPost(comment.post_id, user) });
    } else if (action === 'vote') {
      if (![0, 1, -1].includes(payload.value)) throw new Error('Invalid vote.');
      if (!payload.value) d.prepare('DELETE FROM votes WHERE user_id=? AND post_id=?').run(user, payload.postId);
      else d.prepare('INSERT INTO votes VALUES (?, ?, ?) ON CONFLICT(user_id, post_id) DO UPDATE SET value=excluded.value').run(user, payload.postId, payload.value);
    } else if (action === 'save') {
      if (typeof payload.value !== 'boolean') throw new Error('Invalid bookmark.');
      if (payload.value) d.prepare('INSERT OR IGNORE INTO saves VALUES (?, ?)').run(user, payload.postId);
      else d.prepare('DELETE FROM saves WHERE user_id=? AND post_id=?').run(user, payload.postId);
    } else if (action === 'join') {
      if (typeof payload.community !== 'string' || !d.prepare('SELECT id FROM communities WHERE id=?').get(payload.community)) throw new Error('Choose a community.');
      if (typeof payload.value !== 'boolean') throw new Error('Invalid membership.');
      if (payload.value) d.prepare('INSERT OR IGNORE INTO memberships VALUES (?, ?)').run(user, payload.community);
      else d.prepare('DELETE FROM memberships WHERE user_id=? AND community=?').run(user, payload.community);
    } else if (action === 'post') {
      const title = field(payload.title, 'Title', 180, 5);
      const body = field(payload.body, 'Post', 10000, 10);
      const community = field(payload.community, 'Community', 40);
      if (!d.prepare('SELECT id FROM communities WHERE id=?').get(community)) throw new Error('Choose a community.');
      const tag = field(payload.tag, 'Topic', 30);
      if (!['Discussion','Question','Show & tell','Tips & tricks','Career wins'].includes(tag)) throw new Error('Choose a valid topic.');
      const initials = profile.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
      const result = d.prepare('INSERT INTO posts (community, author, initials, title, body, tag, created_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(community, profile.name, initials, title, body, tag, Date.now(), user);
      return Response.json({ ...feed(user), createdId: Number(result.lastInsertRowid) });
    } else if (action === 'comment') {
      if (d.prepare('SELECT locked FROM posts WHERE id=?').get(payload.postId)?.locked) throw new HttpError('This conversation is locked by moderators.',403);
      const body = field(payload.body, 'Comment', 4000);
      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        if (!Number.isSafeInteger(parentId)) throw new HttpError('Choose a valid comment to reply to.');
        const parent = d.prepare('SELECT id FROM comments WHERE id=? AND post_id=? AND removed=0').get(parentId,payload.postId);
        if (!parent) throw new HttpError('This comment is no longer available for replies.',404);
        const ancestry = d.prepare(`WITH RECURSIVE ancestors(id,parent_id,depth) AS (
          SELECT id,parent_id,1 FROM comments WHERE id=?
          UNION ALL SELECT c.id,c.parent_id,a.depth+1 FROM comments c JOIN ancestors a ON c.id=a.parent_id WHERE a.depth<=5
        ) SELECT MAX(depth) AS depth FROM ancestors`).get(parentId) as {depth:number};
        if (ancestry.depth > 5) throw new HttpError('This reply thread is full. Add a new comment to continue.');
      }
      transaction(()=>{
        const now=Date.now();
        const result=d.prepare('INSERT INTO comments (post_id, author, body, created_at, owner, parent_id) VALUES (?, ?, ?, ?, ?, ?)').run(payload.postId, profile.name, body, now, user,parentId);
        const recipients=new Map<string,'comment'|'reply'>();
        const postOwner=d.prepare('SELECT owner FROM posts WHERE id=?').get(payload.postId)?.owner;
        if(typeof postOwner==='string'&&postOwner!==user) recipients.set(postOwner,'comment');
        const parentOwner=parentId===null?null:d.prepare('SELECT owner FROM comments WHERE id=?').get(parentId)?.owner;
        if(typeof parentOwner==='string'&&parentOwner!==user) recipients.set(parentOwner,'reply');
        for(const [recipient,kind] of recipients) d.prepare('INSERT INTO notifications (recipient,comment_id,kind,created_at) VALUES (?,?,?,?)').run(recipient,result.lastInsertRowid,kind,now);
      });
    } else if (action === 'profile') {
      const name = field(payload.name, 'Name', 40, 2);
      const bio = field(payload.bio ?? '', 'Bio', 160, 0);
      d.exec('BEGIN');
      try {
        d.prepare('UPDATE profiles SET name=?, bio=? WHERE id=?').run(name, bio, user);
        d.prepare('UPDATE posts SET author=?, initials=? WHERE owner=?').run(name, name.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase(), user);
        d.prepare('UPDATE comments SET author=? WHERE owner=?').run(name, user);
        d.exec('COMMIT');
      } catch (error) { d.exec('ROLLBACK'); throw error; }
    } else return Response.json({ error: 'Unknown action.' }, { status: 400 });
    return Response.json(feed(user),{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    if (error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    if (message.includes('SQLITE') || message.includes('constraint') || message.includes('database')) {
      console.error(error);
      return Response.json({ error: 'Could not save your changes. Please try again.' }, { status: 500 });
    }
    return Response.json({ error: message }, { status: 400 });
  }
}
