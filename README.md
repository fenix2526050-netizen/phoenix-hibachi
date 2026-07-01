# Phoenix Hibachi V141 — Pricing, Content, Booking Cleanup

This version builds on V140 and removes the public Arrival Notice card plus customer-facing Request Chef controls.

## V141 changes

### Admin pricing center
- Adds **Pricing / Menu Settings** in Admin / Manager dashboard.
- Allows editing package prices, add-on prices, premium protein upcharge, deposit, coupons, minimum guests, chef payout, default travel fee, tax rate, and estimated food cost rate.
- Pricing is read from a single V140 browser storage source and applied to homepage package cards, booking package cards, add-on data-price values, protein upcharge text, booking calculations, invoice/payment calculations, and footer package display.

> Current V140 pricing sync is browser-local. For full multi-device production sync, connect these settings to a Supabase `pricing_settings` table.

### Public navigation
Adds three separate navigation sections:
- **RECIPES** — sauce recipes, fried rice, steak doneness, cooking tips.
- **STORIES** — chef training, prep work, party stories, behind-the-scenes articles.
- **SHOP** — merch, gift cards, sauces, party kits, and external ecommerce links.

### Admin content managers
Adds Admin / Manager dashboard controls:
- **Recipes Manager**
- **Stories Manager**
- **Shop Products**
- **Hero Videos**

These managers can create, edit, publish/unpublish, and delete local content items without changing code.

### Hero video controls
- Admin can set up to 3 homepage hero video sources and posters.
- Homepage hero text changed to: **Hibachi Live Show — Fire · Food · Performance**.
- Removed “Backyard setup” from the video overlay.

### Booking cleanup
- Removed the visible Arrival Notice card from the public booking calendar side panel.
- Removed the customer-facing Request Chef / Chef team selector from the booking form. Chef count and assignment remain staff-controlled.

### Stability
- Does not touch Supabase SQL.
- Does not reintroduce old Route Planner takeover logic.
- Keeps V139 availability truth logic: no random/demo Full dates; partial full means Limited; full day only when all time slots are Full/Closed.

## Files changed
- `index.html`
- `script.js`
- `style.css`
- `src/phoenix-v140-admin-content.js`
- `README.md`

## Test checklist
1. Homepage loads and video plays on desktop and mobile.
2. Navigation shows RECIPES, STORIES, SHOP.
3. Recipes / Stories / Shop sections render cards.
4. Admin login works.
5. Admin Dashboard shows Pricing / Menu Settings, Recipes Manager, Stories Manager, Shop Products, Hero Videos.
6. Save pricing and confirm homepage package prices and booking totals update in that browser.
7. Save Hero Videos and confirm homepage video overlay updates.
8. Book Now still works.
9. V139 availability behavior still works.
10. Member, Chef, Customer Service dashboards still open.

## GitHub Pages upload
Upload the entire extracted folder, or at minimum replace:

```text
index.html
script.js
style.css
README.md
src/phoenix-v140-admin-content.js
```

Use a cache-busting URL after deploy:

```text
https://fenix2526050-netizen.github.io/phoenix-hibachi/?v=141
```


## V141 cleanup

- Removed the public Arrival Notice card from the booking calendar side panel while preserving hidden selected-time logic for order calculation.
- Removed the customer-facing Request Chef / Chef team selector from the booking form. Chef count and chef assignment remain staff-controlled in admin tools.
- No Supabase SQL changes required.

## V142 profile and booking hotfix

- Fixed dynamically rebuilt Profile & Member Wallet close button.
- Profile photo now refreshes the top account chip avatar after upload/remove.
- Removed Demo Only badge and prototype warning from the Book Your Event modal.
- No Supabase SQL required.
