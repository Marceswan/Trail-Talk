# UI spacing sweep

The user's account screenshot exposed a shared layout problem: dialog children owned their padding independently. Post forms had insets, but account and report forms touched the dialog edges. This UI sweep takes priority over the proposed draft feature; no draft implementation was started.

## Changes

- Let the scrollable dialog body own the same responsive inset as its heading. Remove duplicate post, directory, and about insets, and keep footer actions inside that boundary.
- Align account tabs in three equal columns; normalize form spacing, profile/security separation, and recovery-code controls.
- Give secondary buttons a shared border, padding, and minimum height, including download, moderation, and inbox actions.
- Correct inbox heading typography and spacing around sign-in descriptions and error actions.

## Validation

Exercise account modes, recovery codes, post/profile/report/directory/about dialogs, feed, search, questions, threads, inbox, and moderation. Check alignment, control containment, document overflow, and reachable controls at 320, 390, 768, and 1440 CSS pixels. Also run the existing responsive suite through 2560 pixels and short landscape viewports. Test accounts and moderation changes use an isolated temporary SQLite database.

Initial targeted suite: three spacing checks passed. Reviewed screenshots of account forms, recovery, profile security, post composition, reports, community directory, feed, questions, threads, search, inbox sign-in, and moderation review.

Final verification: all 44 Playwright tests passed (1.3 minutes), and the production build passed including TypeScript. Reviewed populated inbox screenshots on mobile and desktop. Restarted the local production preview on port 3000 and reproduced the user's account screen: left, right, and bottom insets are each 24.04px at a 1440px viewport, with the tabs aligned to the heading and the dialog body scrollable. No production accounts or content were created for this sweep.
