# TrailTalk

A Salesforce-themed community app with a custom, responsive Reddit-style interface. Built with Next.js, React, TypeScript, and Postgres (or SQLite for local development). **One app, one database, no other services.**

## Run locally

Requires Node.js 22.13 or newer (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app creates `data/trailtalk.sqlite` and community categories on the first request. New installations start with an empty feed.

## Included

- Responsive home feed, community feeds, following feed, topic filters, text search, and best/newest/top sorting. Fluid typography and spacing adapt from phones to wide displays; tablets use a navigation drawer, mobile search gets its own row, and secondary content hides before the feed becomes cramped.
- Post drafts automatically save per account in this browser, survive closing/reloading, and remain after failed publishing. Conflicting tabs require a choice before publishing; unavailable browser storage warns before discarding unsaved text. Drafts are local and are not encrypted or synced. Successful publishing clears the matching saved draft.
- Posts support up to five tags alongside their post type. Tags normalize to lowercase hyphenated names, appear as clickable feed filters, and are included in search. Authors can edit tags with the same ownership and revision checks as post edits. Browser drafts retain tags.
- Create posts, upvote/downvote posts and comments, comment, bookmark, and copy a direct link to a conversation. Comment votes persist per account; choosing the opposite direction switches your vote, and clicking the selected direction removes it. Threads open as full pages at `/posts/:id`, with normal document scrolling, browser history, and a back-to-feed link. Older `/?post=:id` links redirect to the thread page.
- Threaded replies (up to five levels), newest/top/oldest comment sorting, collapsible reply branches, and direct comment links. Removed comments keep their replies visible; locked conversations reject new replies. Failed comment saves keep the typed draft on screen.
- Comfortable and Compact feed layouts, with the selected density remembered in this browser. Search, community, topic, view, and sorting stay in the URL; threads link back to the filtered feed. The home/community welcome is shorter, and Saved, Following, search, and topic views use concise headings.
- Markdown writing and preview for posts, comments, replies, and edits. Compact formatting controls support emphasis, links, lists, quotes, and code blocks, with keyboard shortcuts for bold/italic. Published discussions support tables and copyable code; wide tables/code scroll inside their own panels. Feed and inbox excerpts omit Markdown syntax. Raw HTML is ignored, unsafe link schemes are blocked, and remote images display their descriptions without loading.
- Search visible posts and replies using multiple terms in any order, or quotes for an exact phrase. All terms must match the same post (including author/community) or the same reply. Relevance ranks title matches first; newest/top/best sorting and existing filters still work. Matching reply excerpts link to the exact comment, search terms are highlighted, and results load 20 conversations at a time. Queries support up to eight terms/phrases and 250 characters. Removed content is excluded and private views remain account-scoped.
- **Questions** collects Question-topic posts with URL-backed All/Open/Solved and community filters. Open means no visible accepted answer. Question authors can accept any visible comment or nested reply, replace their choice, or remove it to reopen the question. Feeds show solved badges; a thread summary links directly to the answer and opens any collapsed ancestors. Ownership, locks, suspension, same-question membership, and stale answer revisions are enforced on the server.
- **My posts** collects your own conversations. Edit your posts and comments with visible edited labels; concurrent edits return a conflict and preserve your draft. Ownership is checked on the server, and locked or removed content cannot be edited.
- A private **Inbox** shows comments on your posts and replies to your comments, with unread counts, All/Unread filters, mark-read controls, and paginated history. Self-replies do not notify you; overlapping recipients get one notification. Removed content is withheld. The header count refreshes on focus and every minute while visible; the inbox has a manual refresh button.
- Join and leave communities. Profiles include a longer bio, employer, job title, years of Salesforce experience, location, skills, certifications, website, and Trailhead URL. Authors link to public profiles at `/members/:id`. Each profile detail has a public visibility checkbox; email is hidden by default and only shown after explicit opt-in. Hidden fields are omitted server-side from public pages, while the owner can still edit them. Passwords, roles, and recovery data never appear on public profiles.
- Persistent database-backed state, validated writes, parameterized queries, same-origin checks, accessible native dialogs, and reduced-motion support. All dialogs share responsive content insets aligned with their headings, with scrollable bodies and reachable close controls. Account tabs, recovery controls, and secondary actions use consistent spacing.

Flow 'n Tell is a dedicated showcase community for sharing builds, demos, and feedback; its composer defaults to Show & tell. Slack, Claudeforce/SIForce, and 13 industry areas also have dedicated communities, covering financial services, healthcare, education, nonprofit, manufacturing, energy and utilities, public sector, automotive, consumer goods, communications, media, life sciences, and retail. Find them using the searchable community directory. Industry groupings follow [Salesforce for Industries](https://www.salesforce.com/industries/). Historical member counts are demonstration data. Seed conversations are disabled in normal environments and the original demo posts are retired from public feeds. Tests explicitly enable demo fixtures with `TRAILTALK_DEMO_DATA=true` (ignored on Vercel). New content and interactions are stored in the configured database. Accounts use email and password sign-in with saved recovery codes. These are TrailTalk accounts, not Salesforce accounts. Email is an identifier only; no verification or recovery email is sent. There is no external auth, email, or notification delivery service. In-app notifications are generated for new comments and replies, in the same database transaction as the comment. Older activity is not backfilled.

## Accounts and recovery

1. Choose **Sign in → Create account**. Use a password with 12–128 characters.
2. Download or save the five recovery codes in a private password manager. They are shown once.
3. To regain access, choose **Recover account**, enter your email, one saved code, and a new password.

Recovery replaces all recovery codes and signs out every device. Sign in with the new password afterward. Profile settings can change your password or replace codes after checking your current password; both actions revoke existing sessions. If both your password and saved codes are lost, there is no self-service recovery. Keep the codes somewhere you can access independently of this browser.

Passwords use salted scrypt (`N=32768, r=8, p=3`). Random session tokens and 128-bit recovery codes are stored as SHA-256 hashes. Sessions last 30 days; sign-out revokes the current session. Recovery codes remain valid until used or replaced; consuming one replaces the entire set. Sign-in and recovery return generic credential errors and enforce per-account and global attempt limits. Existing browser-profile content is preserved, but legacy visitor cookies cannot authenticate accounts. Registration starts a new account; legacy anonymous activity is not claimed automatically.

Browsing is public. Posting, comments, votes, saves, memberships, profile edits, and reports require sign-in. Suspended accounts can browse and manage credentials, but cannot change community content or submit reports. New accounts always start as regular members.

## Moderation

Register your own account first, then grant administrator access using the database command:

```sh
npm run admin -- your-account@example.com
```

The command loads `.env.local` and uses Neon when `DATABASE_URL` is set. An explicit `DATABASE_PATH` selects local SQLite instead. This command is intended for the host administrator and requires database credentials. There is no first-user admin shortcut or public role-grant endpoint. Refresh the app to see **Moderation** in the navigation.

The moderation workspace includes reports, posts, comments, accounts, and action history. Members can report posts and comments; duplicate open reports are combined. Moderators can remove/restore content, lock/unlock conversations, dismiss reports, and suspend/restore member access. Administrators can also appoint/remove moderators and suspend moderators. Administrator accounts are protected from these web actions; users cannot suspend themselves.

Removed posts disappear from public feeds and direct URLs. Removed comments become tombstones with their original text withheld from public responses. Original content remains available to moderators for restoration. Locks prevent new comments, member edits, and accepted-answer changes while allowing voting. Removing an accepted comment hides its solved status and summary. Restoring it restores the selection, unless the question author has chosen another answer in the meantime. Reports and the latest 100 audit actions are private to moderators; every action requires a reason. Content and account lists show up to 100 matches and support filtering. Older records remain in the database.

## Production

```sh
npm run build
npm start
```

Run a single app instance on a host with **persistent disk**. The SQLite database runs inside the app process; no database server or Docker Compose is necessary. To select a mounted disk location:

```sh
DATABASE_PATH=/persistent-data/trailtalk.sqlite COOKIE_SECURE=true npm start
```

Set `COOKIE_SECURE=true` behind HTTPS. Back up the database with SQLite's backup API or a consistent filesystem snapshot; remember that an active WAL database may have `-wal` and `-shm` sidecars. Do not deploy this local SQLite build to an ephemeral filesystem. Configure your reverse proxy with request-size and connection limits before public deployment. In-app rate limits are stored in SQLite; authentication also has a global CPU-abuse limit.

### Vercel + Neon

The production app uses **one Vercel app and one Neon Postgres database**. Account recovery and notifications stay in that database; no email or external auth service is used.

1. Connect Neon to the Vercel project, supplying `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Keep SSL enabled. Do not set `DATABASE_PATH` on Vercel.
2. Put the same connection strings in ignored `.env.local`, then run `npm run db:migrate`. The migration adds TrailTalk tables and initializes community categories in an empty database; it never drops existing tables or changes Neon Auth tables. Run migrations before deploying schema changes, rather than during builds.
3. Deploy the repository root with the Next.js framework. `vercel.json` clears the incorrect static `public` output-directory override. HTTPS session cookies are enabled automatically on Vercel.

The runtime uses asynchronous Postgres queries and a small connection pool. Transactions reserve one connection and serialize related writes across instances, preserving recovery-code replay protection, edit conflicts, and moderation consistency. Local SQLite remains available when no `DATABASE_URL` is set; an explicit `DATABASE_PATH` takes precedence for isolated tests.

To import an existing local SQLite database into an **empty** Postgres destination, first back it up, then run `npm run db:migrate -- --import-sqlite=/absolute/path/trailtalk.sqlite`. Import is transactional and refuses to merge into nonempty TrailTalk tables. Without that flag, migration initializes community categories only. It also adds Flow 'n Tell and retires known unowned demo posts without deleting member activity. Never commit connection strings; `.env.local` and `.vercel/` are ignored.

Installing the Vercel CLI with `npm i -g vercel` is strongly recommended for `vercel env pull`, `vercel deploy`, and `vercel logs`; `npx vercel` also works. Production secrets marked sensitive may appear as `[SENSITIVE]` when pulled locally—supply real local values before running migrations. See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json) and [node-postgres SSL](https://node-postgres.com/features/ssl).

## Verify

```sh
npm run typecheck
npm run build
npm test
```

Browser tests use installed Google Chrome and start a separate app on port 3100 with a fresh database in the OS temporary directory. They cover account isolation, durable votes/saves/memberships, input validation, origin rejection, publishing, commenting, profile changes, search, and mobile navigation. Comment-vote tests cover persistence, vote switching/removal, account isolation, invalid input, and failed-save recovery. They also cover full-page thread navigation, legacy links, browser history, long conversation scrolling, and dialog scrolling on small screens. Responsive checks cover 320, 390, 768, 1024, 1280, 1440, 1920, and 2560px widths, plus short landscape screens. Account and moderation tests cover hashed credentials, session revocation, concurrent recovery/replay rejection, throttling, role boundaries, report deduplication, removal/restoration, locking, suspensions, audit history, and the mobile recovery/moderation flows. Conversation experience checks cover nested replies, parent validation, depth limits, moderator restrictions, failed-save drafts, comment sorting/collapse/permalinks, URL history, filtered return links, and persistent Compact layouts. Member-tool checks cover ownership, edit conflicts, moderation restrictions, private notification recipients, deduplication, pagination, read state, removed-content filtering, and mobile editing/inbox flows. Writing checks cover preview publishing, source-preserving edits, selection formatting, failed-save drafts, unsafe content, clean excerpts, code-copy feedback, validation from preview, character limits, and contained scrolling at 320–1440px. Question checks cover accept/replace/reopen, ownership and moderator boundaries, stale changes, removed-content handling, nested answer navigation, filtered return URLs, question creation defaults, save failures, and mobile layouts. Search tests cover terms/phrases, literal SQL wildcard characters, ranking, pagination, private view boundaries, removed content, rapid query changes, loading failures/retries, reply links, and mobile layouts. Spacing checks cover account modes and recovery sheets, create/edit/profile/report/directory/about dialogs, feed and question toolbars, inbox states, and moderation review at 320–1440px. They do not modify your development database.

Run `npm run test:postgres` with `.env.local` configured to verify real Postgres persistence, search, moderation, edit conflicts, and concurrent recovery. It creates and removes only a randomly named temporary schema; production tables are untouched.

## Structure

- `components/trailtalk.tsx`: feed, community navigation, dialogs, and interactions.
- `components/comment-thread.tsx`: threaded comment rendering, sorting, collapse, reply forms, and permalinks.
- `components/inbox.tsx` and `app/api/notifications/route.ts`: private in-app activity and read state.
- `lib/feed-navigation.ts`: allowed feed URL fields and local return links.
- `components/markdown-editor.tsx`, `components/rich-text.tsx`, and `lib/markdown.ts`: formatting controls, safe discussion rendering, and plain-text excerpts.
- `components/landscape.tsx`: original SVG landscape illustration.
- `app/globals.css`: responsive visual system; fonts are bundled locally.
- `app/api/search/route.ts`, `components/search-results.tsx`, and `lib/search-text.ts`: filtered search, cancellation/pagination, safe highlighting, and matching excerpts.
- `app/api/community/route.ts`: same-origin JSON API and authenticated community actions.
- `lib/db.ts`: local SQLite setup, seed data, and asynchronous public queries.
- `lib/database.ts`: Postgres/SQLite query adapter and transaction isolation.
- `scripts/migrate-postgres.mjs`: additive Postgres setup and optional SQLite import.
- `lib/auth.ts` and `app/api/account/route.ts`: password authentication, sessions, recovery, and rate limits.
- `app/api/moderation/route.ts` and `components/moderation-workspace.tsx`: moderation permissions and review UI.
- `scripts/admin.mjs`: local administrator bootstrap.

Markdown implementation references: [react-markdown](https://github.com/remarkjs/react-markdown) and [remark-gfm](https://github.com/remarkjs/remark-gfm).

Implementation references: [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers) and [Node.js SQLite](https://nodejs.org/api/sqlite.html).

Security references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [OWASP account recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

Independent project. Not affiliated with or endorsed by Salesforce.
