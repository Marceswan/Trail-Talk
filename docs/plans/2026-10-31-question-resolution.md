# Questions and accepted answers

Make Salesforce troubleshooting conversations easier to resolve and revisit. Keep the app and SQLite deployment.

- Add a Questions navigation view with All/Open/Solved filters stored in the URL. Open means no currently visible accepted answer, regardless of reply count. Search and sort work inside this view. Creating a post from Questions defaults to the Question topic.
- Question authors can choose one existing comment or nested reply as the accepted answer, replace it, or remove acceptance. Moderators do not gain author privileges. Auth, ownership, question topic, conversation locks, suspension, same-post membership, and comment visibility are checked on the server. A separate answer revision rejects stale changes without interfering with body edits.
- Show solved badges in feeds, an accepted-answer summary in the thread, and a compact badge/action on the chosen comment. Preserve the comment's original position. Jumping to the accepted answer opens its ancestor branches and focuses the comment.
- Store a nullable accepted comment reference plus answer revision using additive migration. Public queries expose only visible accepted answers. Removing the answer or its post hides resolution; restoration restores the original selection unless the author chose another answer in the meantime.
- Preserve the existing typography and blue controls, using restrained green for solved status. Keep mobile controls compact and wrapped naturally.

Verify ownership, cross-thread attempts, stale revisions, moderation/lock/suspension rules, replace/unaccept behavior, nested answer navigation, filters/history, failed-save state, and responsive layout with a temporary test database.

## Validation

All 37 browser/API regression tests pass; production build and TypeScript pass. Four new tests cover author ownership, cross-question attempts, revisions, locks/suspension/removal, replacement/reopening, collapsed nested-answer navigation, failed saves, community/search/status URL history, and question-topic creation defaults. Reviewed answer summaries at phone widths and verified the production Questions view. Existing content is preserved by the additive migration; SQLite integrity check passes.
