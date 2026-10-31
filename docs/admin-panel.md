# TrailTalk administration

Open `/admin` with an active admin account, or choose **Admin panel** in the sidebar. Moderators use `/moderation` for reports and content decisions.

- Search registered users by name or email, filter by role/status, and paginate through results.
- Grant or remove member, moderator, and admin roles; suspend/restore access; or sign out all devices. Every action requires a reason and creates an audit entry.
- Admins cannot change their own access. Current permissions, role changes, active-admin protection, and audit entries share one database transaction.
- Edit the homepage headline and description, a plain-text site notice, and whether new accounts can register. Existing login and recovery continue when registration closes. Settings use revision checks to prevent overwriting another admin's changes.
- Email addresses in the admin user directory are for account management. Public profile visibility remains unchanged. Passwords, recovery codes, and session tokens are never included.

Settings persist in the singleton `site_settings` table. Apply `npm run db:migrate` before deploying this version to PostgreSQL; SQLite initializes the same table automatically. No extra services are required.

The History section shows the 50 most recent admin and moderation actions. Content removal/restoration and reports remain in the moderation workspace.
