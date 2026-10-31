# Conversation experience

Keep the Salesforce identity and simple Next.js plus SQLite architecture. Improve browsing density, continuity between feed and threads, and direct conversation between members.

Palette: cloud blue #087bdf, navy #192b42, mist #f6f8fb, white #ffffff, readable slate #536b83. Retain Plus Jakarta Sans headings and Inter text. Keep content left-aligned, the original landscape as the home/community welcome, and replace the banner with a short contextual heading in saved, following, search, and filtered views.

Layout: navigation | conversation feed | community rail. Comfortable cards retain previews; Compact shows more titles in a continuous list. Keep font sizes readable and make density a browser preference. Keep small vote arrows and larger touch hit areas.

The URL owns view, community, topic, sort, and search. Browser history restores them; conversation links carry a validated local return URL. Search replaces the current entry so each keystroke does not create a history item.

Comments gain a nullable parent_id via an additive migration. Replies must target an existing visible comment in the same post; locked posts and suspended accounts remain blocked. Limit replies to five nesting levels; flatten visual indentation on phones. Sort roots and siblings by newest, oldest, or score. Moderator removal preserves the reply tree and withholds removed text. Replies can collapse; direct comment anchors highlight their destination. Failed submissions retain drafts in component memory.

Verify navigation/refresh/history, density persistence and responsive layouts, replies and sorting, collapse/expand, removal/restoration boundaries, invalid parents, nesting limits, and failed-write draft retention. Existing auth, recovery, moderation, and voting regressions continue to pass.
