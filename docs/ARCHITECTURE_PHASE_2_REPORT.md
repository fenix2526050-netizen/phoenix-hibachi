# Phoenix Hibachi V88 Architecture Foundation

## What changed

This package adds a clean modular layer without removing the legacy `script.js` yet. That is deliberate. The site already opens and has many patched production behaviors, so the safest commercial-grade path is progressive migration, not one-shot replacement.

## New module structure

- `src/config/appConfig.js` — business constants, table names, storage bucket names.
- `src/services/supabaseClient.js` — single Supabase client accessor for all new modules.
- `src/services/bookingService.js` — create/list/update bookings and attach `pdf_url`.
- `src/services/storageService.js` — Supabase Storage upload and signed URL helpers.
- `src/services/emailService.js` — calls the `booking-created` Edge Function only; no secret keys in frontend.
- `src/services/pdfService.js` — PDF naming and safe legacy invoice bridge.
- `src/services/authService.js` — role/permission helpers.
- `src/ui/toast.js` — shared toast helper.
- `src/utils/format.js` — shared formatting helpers.
- `src/app/events.js` — centralized new event binding with one-time guard.
- `src/app/main.js` — clean app entry point and `window.PhoenixApp` service registry.

## Why legacy `script.js` still exists

`script.js` contains the current working UI, booking flow, dashboard, theme behavior, modal logic, and many V60-V87 fixes. Removing it in one pass would risk breaking the site. V88 adds a clean service layer first, then future versions can migrate one feature at a time.

## Duplicate event-listener prevention

New modules use:

- `window.__PHOENIX_APP_READY__`
- internal `eventsBound` guard
- centralized `src/app/events.js`

This prevents new code from repeating the old problem. Existing legacy listeners remain untouched until each feature is migrated and verified.

## Data-source rule going forward

- Supabase `bookings` is the source of truth for real orders.
- `localStorage` may only be used for drafts, UI preferences, or temporary fallback notes.
- A booking should not display as successful unless Supabase insert succeeds.

## Next migration order

1. Move booking form submit logic from `script.js` to `src/services/bookingService.js` + a dedicated controller.
2. Move dashboard order rendering to a clean `dashboardController.js`.
3. Move invoice/settlement HTML into `src/services/pdfService.js`.
4. Move contact settings from localStorage to Supabase.
5. Move staff/people management from localStorage to Supabase.
6. Remove deprecated V60-V87 patch blocks only after each corresponding module passes QA.

## Testing required

After uploading this version:

1. Open homepage.
2. Confirm browser console shows `V88_ARCHITECTURE_FOUNDATION loaded`.
3. Test day/night mode.
4. Submit one booking.
5. Confirm booking appears in Supabase and Dashboard.
6. Confirm Download PDF button still behaves correctly.
7. Test login/dashboard roles.
8. Test mobile layout.

