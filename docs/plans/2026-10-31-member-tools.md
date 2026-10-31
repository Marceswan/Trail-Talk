# Member ownership and reply inbox

Keep the existing app + SQLite deployment. Improve return visits and everyday content management without new services.

- Add My posts as a URL-backed feed view, using server-derived ownership flags.
- Allow owners to edit title/body and comments. Enforce ownership, suspension, removal, and conversation locks on the server. Require a revision to prevent stale drafts replacing newer content. Show edited timestamps and preserve failed drafts.
- Generate notifications transactionally with new comments: notify the post owner and direct parent comment owner, excluding the author and combining duplicate recipients.
- Expose a private paginated inbox, unread summary, and idempotent read actions. Derive text from current visible content so removed text is not exposed. Refresh the header summary on focus and every minute; provide explicit refresh in the inbox.
- Verify API isolation, stale revisions, moderation boundaries, pagination, read state, full-page navigation, and responsive editing/inbox UI against a temporary database.

Additive migrations preserve existing content. No email delivery and no historical notification backfill.
