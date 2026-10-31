# Browser post drafts

Preserve one unfinished new post per signed-in account in this browser, without adding a service or changing the database schema. Keep the current compact composer and shared dialog insets.

- Persist title, Markdown source, community, and topic synchronously on changes. Restore when reopening or refreshing, validating stored data before use. Explain that drafts stay in this browser and are not encrypted or synced.
- Scope storage to the account, preserve failed publications, and clear only the submitted saved version after successful publication. Refuse publication under a different account if the browser session changes.
- Detect changes to the same saved draft in another tab. Preserve on-screen text and let the writer choose the browser version or explicitly keep their version. Report storage failures; warn before leaving unsaved text.
- Offer explicit discard confirmation. Keep the existing field validation and Markdown preview, with controls disabled during publication.
- Verify restore, discard, publish cleanup, failed requests, account isolation, stale sessions, multiple tabs, unavailable storage, and mobile spacing. Run the complete regression suite and production build.

External initiative capture was previously rejected for this same feature; this plan stays local.
