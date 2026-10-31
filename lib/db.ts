import seedData from '../scripts/seed-data.json';
import communityAdditions from './community-additions.json';
import { database, useSQLite } from './database';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Comment, FeedData } from './types';
import { siteSettings } from './site-settings';

const globalDb = globalThis as unknown as { trailtalkDb?: DatabaseSync };
function sqliteDb() {
  if (globalDb.trailtalkDb) return globalDb.trailtalkDb;
  const path = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'trailtalk.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const connection = new DatabaseSync(path);
  connection.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO site_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      color TEXT NOT NULL, icon TEXT NOT NULL, members INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, community TEXT NOT NULL REFERENCES communities(id),
      author TEXT NOT NULL, initials TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      tag TEXT NOT NULL, visual TEXT, created_at INTEGER NOT NULL, base_score INTEGER NOT NULL DEFAULT 0,
      owner TEXT REFERENCES profiles(id)
    );
    CREATE TABLE IF NOT EXISTS votes (
      user_id TEXT NOT NULL REFERENCES profiles(id), post_id INTEGER NOT NULL REFERENCES posts(id),
      value INTEGER NOT NULL CHECK(value IN (-1, 1)), PRIMARY KEY(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS saves (
      user_id TEXT NOT NULL REFERENCES profiles(id), post_id INTEGER NOT NULL REFERENCES posts(id), PRIMARY KEY(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES profiles(id), community TEXT NOT NULL REFERENCES communities(id), PRIMARY KEY(user_id, community)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id),
      author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, owner TEXT REFERENCES profiles(id)
    );
    CREATE TABLE IF NOT EXISTS comment_votes (
      user_id TEXT NOT NULL REFERENCES profiles(id),
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      value INTEGER NOT NULL CHECK(value IN (-1, 1)),
      PRIMARY KEY(user_id, comment_id)
    );
    CREATE INDEX IF NOT EXISTS comment_votes_comment ON comment_votes(comment_id);
    CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);
    CREATE INDEX IF NOT EXISTS votes_post ON votes(post_id);
    CREATE INDEX IF NOT EXISTS posts_community ON posts(community);
    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      label TEXT NOT NULL, PRIMARY KEY(post_id,label)
    );
    CREATE INDEX IF NOT EXISTS post_tags_label ON post_tags(label,post_id);

  `);
  // Additive migrations preserve existing posts, comments, and browser profiles.
  const addColumn = (table: string, name: string, definition: string) => {
    if (!connection.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  for (const column of ['employer','job_title','location','skills','certifications','website','trailhead_url']) addColumn('profiles',column,"TEXT NOT NULL DEFAULT ''");
  addColumn('profiles','profile_visibility',"TEXT NOT NULL DEFAULT '{}'");
  addColumn('profiles','years_experience','INTEGER CHECK(years_experience BETWEEN 0 AND 80)');
  addColumn('profiles', 'email', 'TEXT');
  addColumn('profiles', 'password_hash', 'TEXT');
  addColumn('profiles', 'role', "TEXT NOT NULL DEFAULT 'user'");
  addColumn('profiles', 'suspended', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('posts', 'removed', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('posts', 'locked', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('comments', 'removed', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('comments', 'parent_id', 'INTEGER REFERENCES comments(id)');
  addColumn('posts', 'accepted_comment_id', 'INTEGER REFERENCES comments(id)');
  addColumn('posts', 'answer_revision', 'INTEGER NOT NULL DEFAULT 0');
  for (const table of ['posts','comments']) {
    addColumn(table,'edited_at','INTEGER');
    addColumn(table,'revision','INTEGER NOT NULL DEFAULT 0');
  }
  connection.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL REFERENCES profiles(id),
      comment_id INTEGER NOT NULL REFERENCES comments(id),
      kind TEXT NOT NULL CHECK(kind IN ('reply','comment')),
      created_at INTEGER NOT NULL, read_at INTEGER,
      UNIQUE(recipient,comment_id)
    );
    CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient,id DESC);
    CREATE INDEX IF NOT EXISTS comments_parent ON comments(parent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_email ON profiles(email);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS recovery_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id));
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL REFERENCES profiles(id),
      target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')), target_id INTEGER NOT NULL,
      reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS reports_open ON reports(reporter,target_type,target_id) WHERE status='open';
    CREATE TABLE IF NOT EXISTS moderation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL REFERENCES profiles(id), action TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  globalDb.trailtalkDb = connection;
  seed(connection);
  return connection;
}

useSQLite(sqliteDb);
export const db = () => database;

export async function commentsForPost(postId: number, user: string): Promise<Comment[]> {
  return await db().prepare(`SELECT c.id,CASE WHEN c.removed=0 THEN c.owner ELSE NULL END AS author_id, CASE WHEN c.removed=1 THEN 'Moderator' ELSE c.author END AS author, CASE WHEN c.removed=1 THEN '[Removed by moderators]' ELSE c.body END AS body, c.created_at, c.removed, c.parent_id, c.edited_at, c.revision, CASE WHEN c.owner=? AND c.removed=0 THEN 1 ELSE 0 END AS owned,
    COALESCE((SELECT SUM(v.value) FROM comment_votes v WHERE v.comment_id=c.id), 0) AS score,
    COALESCE((SELECT v.value FROM comment_votes v WHERE v.comment_id=c.id AND v.user_id=?), 0) AS vote
    FROM comments c WHERE c.post_id=? ORDER BY c.created_at DESC, c.id DESC`).all(user, user, postId) as Comment[];
}

function seed(d: DatabaseSync) {
  const demo = process.env.TRAILTALK_DEMO_DATA === 'true' && !process.env.VERCEL;
  d.exec('BEGIN');
  try {
    if (!d.prepare('SELECT id FROM communities LIMIT 1').get()) {
      const fixtures = demo ? seedData : { communities: seedData.communities, posts: [], comments: [] };
      for (const table of ['communities', 'posts', 'comments'] as const) {
        for (const row of fixtures[table]) {
          const columns = Object.keys(row);
          d.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
        }
      }
    }
    for (const community of communityAdditions) {
      d.prepare('INSERT INTO communities (id,name,description,color,icon,members) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(community.id,community.name,community.description,community.color,community.icon,community.members);
    }
    if (!demo) {
      // Retire only known, unowned demonstration posts; preserve member activity.
      for (const post of seedData.posts) d.prepare('UPDATE posts SET removed=1 WHERE owner IS NULL AND title=? AND author=? AND community=?').run(post.title,post.author,post.community);
    }
    d.exec('COMMIT');
  } catch (error) { d.exec('ROLLBACK'); throw error; }
}

// Binds the current user three times: ownership, vote, and bookmark.
export const publicPostColumns=`p.id,p.owner AS author_id,p.community,p.author,p.initials,p.title,p.body,p.tag,p.visual,p.created_at,p.locked,p.edited_at,p.revision,p.answer_revision,
      (SELECT c.id FROM comments c WHERE c.id=p.accepted_comment_id AND c.post_id=p.id AND c.removed=0 AND p.tag='Question') AS accepted_comment_id,CASE WHEN p.owner=? THEN 1 ELSE 0 END AS owned, p.base_score + COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.post_id=p.id),0) AS score,
      COALESCE((SELECT v.value FROM votes v WHERE v.post_id=p.id AND v.user_id=?),0) AS vote,
      EXISTS(SELECT 1 FROM saves s WHERE s.post_id=p.id AND s.user_id=?) AS saved,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS comment_count`;

export async function feed(user: string): Promise<FeedData> {
  const d = db();
  const posts = await d.prepare(`SELECT ${publicPostColumns} FROM posts p WHERE p.removed=0 ORDER BY p.created_at DESC`).all(user,user,user);
  return {
    settings: await siteSettings(),
    communities: await d.prepare(`SELECT c.*, EXISTS(SELECT 1 FROM memberships m WHERE m.community=c.id AND m.user_id=?) AS joined,
      c.members + (SELECT COUNT(*) FROM memberships m WHERE m.community=c.id) AS members FROM communities c`).all(user),
    posts: await withPostTags(posts as unknown as {id:number}[]),
    profile: await d.prepare('SELECT id,name,bio,email,role,suspended,profile_visibility,employer,job_title,years_experience,location,skills,certifications,website,trailhead_url,(password_hash IS NOT NULL) AS registered FROM profiles WHERE id=?').get(user) || { name: 'Guest', bio: '', email: null, role: 'user', suspended: 0, registered: 0 },
  } as unknown as FeedData;
}

export async function withPostTags<T extends {id:number}>(posts:T[]):Promise<(T & {tags:string[]})[]> {
  if (!posts.length) return [];
  const labels = await db().prepare(`SELECT post_id,label FROM post_tags WHERE post_id IN (${posts.map(()=>'?').join(',')}) ORDER BY label`).all(...posts.map(post=>post.id));
  const byPost = new Map<number,string[]>();
  for (const row of labels) { const id=Number(row.post_id); const tags=byPost.get(id)||[]; tags.push(String(row.label)); byPost.set(id,tags); }
  return posts.map(post=>({...post,tags:byPost.get(post.id)||[]}));
}
