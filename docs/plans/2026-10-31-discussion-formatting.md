# Discussion formatting

Improve the existing writing/reading loop without adding services or database changes.

- Use one safe Markdown renderer for thread bodies, comments, and previews. Support emphasis, lists, quotes, links, tables, and fenced code. Ignore raw HTML, restrict link protocols, and render image descriptions rather than requesting remote images.
- Add a reusable editor to post creation/editing and comment/reply creation/editing. Keep plain textarea accessibility and names, add selection-aware formatting controls, Write/Preview modes, character counts, and short formatting help. Preserve existing failed-save drafts and validation.
- Present code in navy panels with language labels, horizontal scrolling, and a copy button. Give tables their own horizontal scroll area. Keep the document within narrow phone widths.
- Derive plain-text feed and inbox excerpts from the same Markdown grammar. Original Markdown stays in SQLite; no migration.
- Keep Inter body / Plus Jakarta headings, white surfaces, #f6f8fb background, #192b42 ink, #087bdf actions, #536b83 secondary text. Left-aligned reading with restrained toolbar controls. No new hero or decorative panels.

Verify publishing from preview, editing source, selection formatting, failed saves, unsafe HTML/links, no remote image requests, copy success/failure, clean excerpts, and mobile overflow. Run the existing regression suite and production build.

## Validation

The 29 existing regression checks and four new writing checks pass. New coverage verifies preview publishing, original Markdown on edit, failed-save retention, code copy success/failure, link/HTML/image safety, clean notification excerpts, and viewport containment at 320/390/1440px. Formatting restores text selection in a layout effect so a deferred selection cannot override a subsequent caret move. Existing SQLite data requires no migration.
