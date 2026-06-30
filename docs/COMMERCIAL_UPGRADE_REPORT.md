# Phoenix Hibachi Commercial Upgrade Report

## What was changed in this package

This package keeps the current UI and the existing `script.js` runtime so the site can still load the same way, but it adds commercial-grade hardening around the most dangerous parts of the booking flow.

### 1. Booking source of truth changed

Before: the booking form saved to `localStorage` first, then attempted Supabase. This could create fake-success orders visible only in one browser.

Now: the booking must insert into Supabase first. If Supabase rejects the booking, the customer sees a clear failure message and no fake success screen is shown.

### 2. Email/PDF hook added

After a booking is successfully inserted, the front-end calls a Supabase Edge Function:

`booking-created`

This function is non-blocking. The booking remains valid even if email/PDF temporarily fails.

### 3. PDF fields added

The booking row mapper now supports:

- `pdf_url`
- `pdf_path`

Dashboard order objects now expose `order.pdfUrl`.

### 4. Dashboard Download PDF button added

Dashboard cards now include a `Download PDF` button.

If `pdfUrl` exists, it opens the generated PDF.
If no PDF exists yet, it opens the printable invoice as a fallback and tells the admin to deploy the Edge Function.

### 5. Business backend files added

Added:

- `supabase/functions/booking-created/index.ts`
- `supabase/migrations/001_phoenix_business.sql`
- `docs/COMMERCIAL_UPGRADE_REPORT.md`
- `docs/DEPLOYMENT_STEPS.md`
- `docs/QA_CHECKLIST.md`

## Still intentionally not fully migrated

The full 6000+ line `script.js` has not been destructively split in this version. That is intentional.

A full split should be done in a second branch after this package is tested, because a one-shot rewrite of the entire front-end risks breaking hidden UI behavior.

Recommended next branch:

- Move order functions to `bookingService.js`
- Move dashboard rendering to `dashboardService.js` and `ui.js`
- Move all click/change listeners to `events.js`
- Keep `main.js` as the single entry point

## Current commercial readiness

| Area | Status |
|---|---|
| Frontend display | Good |
| Booking insert | Hardened |
| Fake local order success | Fixed for booking form |
| Dashboard Supabase read | Existing |
| Email notification | Edge Function added, deploy required |
| Customer confirmation email | Edge Function added, deploy required |
| PDF generation | Edge Function added, deploy required |
| PDF Storage | SQL + Edge Function added, deploy required |
| RLS | SQL policy draft added, must verify against live profiles schema |
| Full modular architecture | Scaffold/plan provided, not destructively migrated yet |

## Critical warning

Do not run the RLS SQL blindly if your live `profiles.role` values are different from `Admin`, `Manager`, `Chef`, `Member`. Adjust roles first.
