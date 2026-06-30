# Phoenix Hibachi V97 — Chef Profile & History

This version builds on V96 and keeps the single-entry `index.html` portal flow.

## V97 changes

- Chef dashboard now has a **Profile** action.
- Chef can update:
  - full name
  - phone
  - display name used on orders
  - base / service area
  - payout preference
  - payout note
  - password
- Chef dashboard now includes **My orders & earnings**.
- Chef can filter assigned order history by:
  - day
  - week
  - month
- Chef dashboard shows estimated earnings before tips, including weekly total.
- Member dashboard cleanup from V96 remains unchanged.
- Admin / Manager / Customer Service dashboards remain unchanged.

## Important launch note

For strict production privacy, bind `profiles.chef_id` to `bookings.assigned_chef_id` in Supabase RLS/policies. V97 attempts to match chef orders by chef ID, display name, full name, or email; if the account is not linked yet, it falls back to assigned chef orders so the dashboard remains usable during testing.

## Test checklist

1. Open `index.html` in an incognito window.
2. Login as Chef.
3. Confirm the top action says **Profile**.
4. Click Profile and update chef information.
5. Change password only after Supabase Auth is connected.
6. Confirm the dispatch page shows **My orders & earnings**.
7. Test day/week/month filters.
8. Login as Admin and confirm Build Route Plan still appears.
9. Login as Member and confirm Route Planner/Route Map remain hidden.
