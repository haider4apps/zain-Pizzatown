# Pizza Town POS - handoff (next chat: read this first)

Stack: Node + Express + better-sqlite3 (WAL), vanilla JS in `public/`, Windows PC server, Chrome on PC and phones (WiFi),
thermal slips (POS-80, 80mm USB, Urdu/English), Admin panel (PIN), one-way Google Sheet sync (Apps Script, append-only, uid dedupe).
Repo: github.com/haider4apps/zain-pizzatown (public). Current version: see package.json (1.7.9 at handoff).
Update flow: Admin -> Software update -> Update (git fetch + ff-only pull; server exits code 3, `run-server.bat` relaunches).

## Rules from the owner
- Replies in Roman Urdu, short. Show a preview (screenshot) BEFORE pushing UI/slip changes; push only when he says so.
- Table no, order note, per-item note and extras print ONLY on the kitchen slip, not the customer bill. Kitchen slip has no prices.
  Priced extras (extras_price) appear on the customer bill as one line. Extras not solid black (ink).
- No personalized financial advice. Sheet is view-only for partners; PC DB is primary.

## Features done
Order edit (cancel + new number, window `edit_window_min`, Admin PIN override), Gift/Free orders (+report), voice multi-add,
Go-Live reset (`/api/admin/golive-reset`, type RESET), cost backfill, tray + autostart (`install-autostart.bat`),
one-click installer `PizzaTown-Install.bat` (Git+Node+clone+npm+firewall 3000+autostart), per-item Extras (+ optional Rs),
slip settings in Admin > Printing: `slip_margin_mm`(6), `slip_top_mm`(0), `slip_bottom_mm`(1), `slip_font_scale`(60-200),
`slip_weight` (thin/normal/bold; default thin - bold text bled on the thermal printer).

## Printer notes (owner's PC)
Driver "POS-80 11.3.0.1" (ZPrinter Paper 80 x 3276mm), queue name POS-80, paper roll 79mm. Windows test page / Chrome kiosk
printing works. Slip was clipped until `slip_margin_mm` was added. If blank: thermal paper side flipped.
Chrome kiosk app: tray "Open POS" or `start.bat` (`--kiosk-printing`). POS has its own "Printer: ON/OFF" toggle.

## Open items
- Clear test rows in the Google Sheet and run Go-Live (RESET) once printer/staff testing is done.
- Zain installs on his PC via the installer link; his PC has its own empty `data/`.
- Later: nightly Drive backup, Sheet restore tool, home-screen icon, stock management (after ~2 weeks of billing).
- Tray/autostart and installer are untested on a clean Windows machine.

## v1.11.0 (Nov 2026) - stock v2 + deal flavour/topping
- `recipes-seed.js`: owner's recipes (grams), Dough prep (1652g batch), packing; runs once at startup (`stock_v2_done`), backup first,
  also renames menu spellings (Oven Baked Wings, Double Decker, Paratha Roll, Lasagna, Lasagna Pizza).
- stock_items: sub_unit/sub_per (recipe in g/ml, stock in kg/litre), pack_size/pack_name, is_prep/prep_yield (Dough -> prep_recipes).
  recipes.away=1 = only takeaway/delivery (boxes, food bags, ketchup). Items never counted show status `unset` (no POS alerts).
- deal_parts: deals parsed from details; pizza slots default Fajita. order_items.pz JSON: chosen flavour/topping; server prices it
  (`pizza_upgrade` setting: M Elite+100 Premium+200, L Elite+100 Premium+300; `pizza_toppings` 100,200,300). Topping has no stock yet.
- Admin > Stock: bulk opening count, pack size, recipe editor in g/ml with 🛵 flag, Dough recipe box.
- Missing: Russian Salad recipe, student deals' 330ml drink, cold drink brand, topping ingredients.
- v1.12.0: stock_items.rate (Rs/unit, set from last "Saman aaya" with Rs, or Rate button); Admin recipe view shows cost per row
  + totals dine-in/takeaway + margin (`/api/admin/recipe-cost/:vid`), Dough cost per batch/kg/size. Stock groups folded
  (Raw saman, Packing first) with red short-count; Saman aaya only Raw saman/Packing; Kharcha page no longer adds stock.
  Pack fixes once (`stock_v2b_done`): Maida 50kg, Nuggets 50, F1/F2 = 1.
