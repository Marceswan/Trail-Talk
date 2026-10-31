# Search and discovery

Replace exact-phrase client filtering with a database-backed search of visible posts and replies. Keep SQLite and the single application.

- Match all query terms in a post's title/body/author/community or in one visible reply; quoted phrases remain together. Bind search terms and escape SQL wildcard characters. Limit query length and term count.
- Rank title matches above post matches above reply-only matches. Preserve newest/top/best sorting and existing community/topic/view/question-status filters, including account-specific Saved, Following, and My posts.
- Return 20 conversations per page with totals and at most one matching reply excerpt per conversation. Removed posts and replies never participate. Keep original post actions and layout.
- Highlight matches with React text nodes, show excerpts near the matching text, and link reply matches directly to their comment. Preserve feed return URLs.
- Debounce requests, cancel stale requests, and hide results that belong to an old query. Keep loaded results on pagination failure with an explicit retry. Make empty/loading/failure states distinct.
- Maintain the existing navy/blue styling with subtle yellow highlights and a quiet reply excerpt beneath the post. No new service or schema migration.

Verify query literals, multi-term/phrase matching, ordering, pagination, private view isolation, removed-content exclusion, rapid typing, failures/retries, permalink navigation, and mobile layout.

## Validation completed

- `npm run typecheck` passed; `npm run build` passed with the new `/api/search` route.
- Full Playwright suite: 41 tests passed, including four search tests covering query semantics, pagination, private filters, moderation visibility, stale requests, retry behavior, and mobile reply navigation.
- Inspected the mobile search screenshot. Production preview smoke check confirmed `keyboard navigation` finds Jordan Lee's reply, highlights both terms, opens comment 4, and returns to the preserved search URL. No horizontal overflow at mobile or desktop widths.
- Restarted the production preview on port 3000. No schema changes or external services were added.
