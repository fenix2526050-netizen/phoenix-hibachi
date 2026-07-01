# Phoenix Hibachi 2.0 Final V135 — Dispatch weekday route + availability sync

Built on V134 / 2.0 final line.

## Changes

- Calendar grid date click is now for availability management only.
  - Clicking a calendar date opens/updates the Availability / 接单时段 panel.
  - It no longer forces the route map to appear.
- Monday–Sunday day cards now control routing.
  - Clicking Wednesday 7/1, Thursday 7/2, etc. selects that exact day for routing.
  - Route map only appears when the selected weekday/date has orders.
- Admin availability slots now match the public booking time windows:
  - 11:00 AM - 1:00 PM
  - 2:00 PM - 4:00 PM
  - 4:00 PM - 6:00 PM
  - 7:00 PM - 9:00 PM
- Marking a slot Full / Closed in Admin immediately syncs to the public booking calendar in the same browser.
  - The public slot becomes disabled.
  - The date becomes limited/full depending on blocked slots.
- Backward compatibility for older saved slot labels such as 11:00 AM, 2:00 PM, 4:00 PM, 6:00 PM, and 8:00 PM.

## Notes

This version still uses local browser storage for availability status. For all visitors and all devices to see the same Full / Closed status, the next production step is a Supabase `availability` table and RLS policy.


## V136 — Feedback order number field

- Guest Feedback form now includes an optional Order number / 订单号 field.
- Customer Service complaint cards show the submitted order number clearly.
- AI reply draft includes the order number when provided.
- Added Copy order # action for staff follow-up.
- No Supabase SQL required.


## V137 homepage arrival notice cleanup

- Removed the visible preferred arrival time from the homepage selected-date notice block.
- Replaced it with a professional bilingual arrival-timing notice explaining weather, traffic, parking, road conditions, and real-time route changes.
- Booking time selection and submitted event time remain unchanged.


## V138 — Admin blessing title and English dispatch copy

- Changed the Orders Dispatch Board heading to a gold calligraphy blessing: 风生水起.
- Removed the bilingual Month/Week/Weekday heading in the admin dispatch board and replaced it with clean English copy.
- Cleaned the homepage arrival notice to English-only text.
- No Supabase SQL changes required.


## V139 availability truth fix

- Public booking calendar no longer uses demo/random full dates.
- Dates become red/full only when every booking window is manually Full/Closed.
- If only one time window is Full or Closed, the date remains selectable and shows limited/partial instead of full.
- Admin calendar now labels partial availability as slot-level full, not whole-day full.
