# Phoenix Hibachi V128 — Customer Service Ticket History Fix

Builds on V127.

## Changes
- Customer Service statistic cards remain visible.
- Support ticket count now means **active unresolved tickets only**.
- Clicking Resolve / 已解决 marks the ticket as resolved, but does **not** delete or hide the record.
- Resolved tickets remain in Complaints & Suggestions as history with a Resolved badge.
- Resolved tickets no longer count in the top Support tickets number.
- Chef assigned support tickets should only show active unresolved tickets in future Supabase-backed ticket table; current version is local/test mode.

## Test
1. Login as Customer Service.
2. Open Complaints & Suggestions.
3. Click Resolve on a ticket.
4. Confirm the ticket remains visible as Resolved history.
5. Confirm the top Support tickets stat decreases.


## V129 — Member profile scroll + portal stability cleanup

This version is based on V128 and keeps the existing order, payment, dispatch, customer import, chef dashboard, and ticket history features.

Changes:

- Added a visible **Profile** action inside every portal dashboard toolbar so customers/members can edit their profile without relying on the homepage account menu.
- Fixed the Profile & Member Wallet dialog so it can scroll all the way to the bottom on desktop and mobile.
- Cleaned modal clipping/scroll behavior to reduce corner shadows, ghost edges, and double-scroll issues.
- Added a light dashboard render debounce to reduce the repeated flash/flicker when logging into a portal role.
- Kept Customer Service ticket history behavior from V128: resolving a ticket reduces the active count but keeps the record.

Upload to GitHub after local testing: `script.js`, `style.css`, and `README.md`.


## V130 dashboard logout overlap hotfix

- Hide the floating dashboard `×` close button in portal/dashboard mode.
- Keep `Logout` as the only dashboard exit action.
- Does not affect Login, Booking, Profile, Invoice, Notice, or other modal close buttons.
- Preserves V129 member profile stability cleanup.
