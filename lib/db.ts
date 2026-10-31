import { database, useSQLite } from './database';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Comment, FeedData } from './types';

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
  `);
  // Additive migrations preserve existing posts, comments, and browser profiles.
  const addColumn = (table: string, name: string, definition: string) => {
    if (!connection.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
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
  return await db().prepare(`SELECT c.id, CASE WHEN c.removed=1 THEN 'Moderator' ELSE c.author END AS author, CASE WHEN c.removed=1 THEN '[Removed by moderators]' ELSE c.body END AS body, c.created_at, c.removed, c.parent_id, c.edited_at, c.revision, CASE WHEN c.owner=? AND c.removed=0 THEN 1 ELSE 0 END AS owned,
    COALESCE((SELECT SUM(v.value) FROM comment_votes v WHERE v.comment_id=c.id), 0) AS score,
    COALESCE((SELECT v.value FROM comment_votes v WHERE v.comment_id=c.id AND v.user_id=?), 0) AS vote
    FROM comments c WHERE c.post_id=? ORDER BY c.created_at DESC, c.id DESC`).all(user, user, postId) as Comment[];
}

function seed(d: DatabaseSync) {
  if (d.prepare('SELECT id FROM communities LIMIT 1').get()) return;
  const communities = [
    ['salesforce', 'Salesforce', 'The home for everything Salesforce. Share ideas, ask questions, and build together.', '#0b96e8', 'cloud', 24800],
    ['admins', 'Salesforce Admins', 'Clicks, not code. Make your org work better with fellow admins.', '#7460ce', 'shield', 18200],
    ['developers', 'Salesforce Developers', 'Apex, Lightning Web Components, and the people who build them.', '#0c9b88', 'code', 15600],
    ['agentforce', 'Agentforce', 'Explore agents, share experiments, and build the next wave of Salesforce.', '#cf71af', 'sparkles', 8400],
    ['careers', 'Careers & Certifications', 'Your next badge, your next role, and your people along the way.', '#e6a02d', 'award', 12300],
    ['flow', 'Flow Builders', 'Automate the everyday. Get help with flows and share what works.', '#e57855', 'workflow', 9700],
  ];
  const now = Date.now();
  const posts = [
    ['salesforce', 'Sarah Chen', 'SC', 'The little Salesforce things that made a big difference this week', 'A cleaner page layout. A flow that saved someone an hour. That one formula finally working. Let’s celebrate the small wins — what’s yours this week?', 'Discussion', null, now - 1000 * 60 * 48, 128],
    ['developers', 'Marcus Johnson', 'MJ', 'I built a free LWC component library. Here’s a first look 👀', 'After rebuilding the same components across projects, I finally put them in one place. Accessible, customizable, and made for the way we actually build on Salesforce. Would love your feedback!', 'Show & tell', 'components', now - 1000 * 60 * 120, 246],
    ['admins', 'Emily Parker', 'EP', 'What’s one Flow best practice you wish you’d learned sooner?', 'Mine: stop putting everything in a single record-triggered flow. Moving reusable logic into subflows has made debugging so much easier. What would you tell your past self?', 'Question', null, now - 1000 * 60 * 195, 89],
    ['agentforce', 'Daniel Kim', 'DK', 'From my first agent to an actually useful service assistant', 'I spent the weekend building an agent that looks up case history and suggests next steps. The biggest lesson? Clear topic boundaries matter more than a clever prompt. Here’s what worked, what didn’t, and what I’d try next.', 'Show & tell', null, now - 1000 * 60 * 240, 72],
    ['careers', 'Priya Patel', 'PP', 'Passed my Platform Developer I exam! My study notes and honest advice', 'Three months of early mornings, plenty of practice questions, and a lot of Trailhead. Today it all paid off. My advice: build something small every week. Reading Apex and writing Apex are very different things.', 'Career wins', 'certification', now - 1000 * 60 * 300, 184],
    ['flow', 'Alex Rivera', 'AR', 'A simple pattern for handling errors in screen flows', 'Every screen flow deserves a useful error message. I’ve been using a shared error-handling subflow that logs the details and gives the user a clear next step. How does your team handle this?', 'Tips & tricks', null, now - 1000 * 60 * 340, 63],
  ];
  const replies = [
    ['Jordan Lee', 'Replaced a spreadsheet handoff with a screen flow. Our service team finally has one place to work!'],
    ['Taylor Brooks', 'The small wins add up. Mine was documenting the automations nobody wanted to touch.'],
    ['Sam Wilson', 'This is why I love this community. Always something practical to take back to work.'],
  ];
  d.exec('BEGIN');
  try {
    const addCommunity = d.prepare('INSERT INTO communities VALUES (?, ?, ?, ?, ?, ?)');
    communities.forEach(c => addCommunity.run(...c));
    const addPost = d.prepare('INSERT INTO posts (community, author, initials, title, body, tag, visual, created_at, base_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    posts.forEach((p, i) => {
      const result = addPost.run(...p);
      const addComment = d.prepare('INSERT INTO comments (post_id, author, body, created_at) VALUES (?, ?, ?, ?)');
      if (i === 0) replies.forEach(([author, body], n) => addComment.run(result.lastInsertRowid, author, body, now - (30 - n * 6) * 60000));
      else addComment.run(result.lastInsertRowid, 'Jordan Lee', ['','Would love to see how you handled keyboard navigation in the combobox.', 'Write the fault paths first. Future you will be grateful.', 'Testing with real case examples helped me narrow the topics too.', 'Congratulations! Building small projects made everything click for me.', 'We use a shared error handler too. It makes support so much easier.'][i], now - 25 * 60000);
    });
    d.exec('COMMIT');
  } catch (error) { d.exec('ROLLBACK'); throw error; }
}

// Binds the current user three times: ownership, vote, and bookmark.
export const publicPostColumns=`p.id,p.community,p.author,p.initials,p.title,p.body,p.tag,p.visual,p.created_at,p.locked,p.edited_at,p.revision,p.answer_revision,
      (SELECT c.id FROM comments c WHERE c.id=p.accepted_comment_id AND c.post_id=p.id AND c.removed=0 AND p.tag='Question') AS accepted_comment_id,CASE WHEN p.owner=? THEN 1 ELSE 0 END AS owned, p.base_score + COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.post_id=p.id),0) AS score,
      COALESCE((SELECT v.value FROM votes v WHERE v.post_id=p.id AND v.user_id=?),0) AS vote,
      EXISTS(SELECT 1 FROM saves s WHERE s.post_id=p.id AND s.user_id=?) AS saved,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS comment_count`;

export async function feed(user: string): Promise<FeedData> {
  const d = db();
  return {
    communities: await d.prepare(`SELECT c.*, EXISTS(SELECT 1 FROM memberships m WHERE m.community=c.id AND m.user_id=?) AS joined,
      c.members + (SELECT COUNT(*) FROM memberships m WHERE m.community=c.id) AS members FROM communities c`).all(user),
    posts: await d.prepare(`SELECT ${publicPostColumns} FROM posts p WHERE p.removed=0 ORDER BY p.created_at DESC`).all(user, user, user),
    profile: await d.prepare('SELECT name,bio,email,role,suspended,(password_hash IS NOT NULL) AS registered FROM profiles WHERE id=?').get(user) || { name: 'Guest', bio: '', email: null, role: 'user', suspended: 0, registered: 0 },
  } as unknown as FeedData;
}
