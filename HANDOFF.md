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
- v1.13.0: checkout table buttons (`dine_tables`, default 6); recipe cost: dine-in adds ketchup cost (bottle, not stock), delivery = takeaway + `delivery_cost_assumed` (200); Update button hidden when latest (auto check on Settings); 'Naya saman' box removed.
- v1.14.0/1.15.0: topping per pizza (`pizza_topping_rules`: Pure 100, Elite 200, Premium M200/L300); cart Extras box removed; menu cost inputs removed, order line cost = recipe x stock rate (lineCost); public/fun.js order cartoons (fun_small/fun_big) + daily sale celebration 30k/40k/50k (server returns `celebrate`), Admin Settings has Animation test buttons.
- v1.17/1.18: essential stock block (ESSENTIAL set, cheese combined, SIDE exceptions) -> 409 STOCK_BLOCK, Admin PIN every time (x-stock-pin); red/yellow bar + chips; coating maida wings 100g / thai 250g; demand slip (/api/admin/stock/demand?days=N, last 7 days orders x recipes, packs rounded up, 80mm print); Saman aaya requires Rs; yellow at <=3 days.
- v1.19.0: usage = last 7 days orders x recipes (dailyUsage cache), pack size change needs confirm_pin each time, demand slip editable/auto-refresh/colored, Admin Settings import of real orders JSON for test PC (/api/admin/import-orders, uid dedupe, not synced, no stock out).
- v1.20.0: Sales page range buttons (✓ active, busy), orders one business day with ◀ ▶ (order_days/ord_day), demand slip Rs per item + total cash, Sheet demand events 5 columns (computeDemand/demandToSheet).
- v1.21.0: live search bars in Admin (sBar/liveFilter, remembered in window._q): Menu (all sections, jump buttons), Sales top items (now ALL items, first 15 + 'Saare dikhao') and orders, Kharcha, Stock halat (auto-open matching groups), Saman aaya select, bulk ginti, demand slip, recipe (all groups), akhri entries. S/M/L also match small/medium/large.
- v1.21.1: removed the test-PC 'Purane orders ki copy' import (Admin box + /api/admin/import-orders) - no longer needed.
- v1.22.0: Stock page order = Demand, Stock ki halat (group tiles instead of folds, separate titled columns Ginti / Alert kab / Pack size / Rate), Naya saman daalein; bulk opening-count box removed; per-item stock_items.alert_days (0 = auto stock_alert_days) shown as 'N din (auto)'; demand rows sorted urg 0 khatam / 1 zaroori / 2 kam zaroori (print too); Sales item table shows recipe lagat (1 ki + kul, from order_items.cost); search boxes white and cleared on tab change.
- v1.23.0: fix recipe viewer (rOpt lost in v1.22), stock halat rows sorted out/low/ok/unset then days, demand slip '✕ Band karein', Kharcha page category tiles + orange 'Ikattha kharcha' with 'Kitne din ka' 1-30 (POST /expenses days -> split equally forward from date, expenses.batch; delete removes whole batch).
- v1.24.0: POS header: voice button/function and voice.js removed; stock bar removed; red 'Khatam' + yellow 'Kam' buttons with count in corner circle (popup list on click, mobile shows icon only) ; 'Stock daalein' only inside the popup; any POS -> Admin link (.toAdmin) clears sessionStorage pin so Admin PIN is asked again. Ikattha kharcha save shows 4s sloth overlay (sustiShow). Kharcha tiles added: Cigarette, Chai, Sabzi, Doodh (fast food ke ilawa), Khana.
- v1.25.0: one POS window only: public/one.js (localStorage heartbeat posLock, takeover via posTake; blocked tab stops all timers, app.js aborts on POS_BLOCKED). Launchers (open-pos.vbs, tray.ps1 Open-Pos) first run focus-pos.ps1 (EnumWindows title 'Pizza Town*', restore + foreground; exit 0 = found). open-pos.vbs now same as tray (--kiosk-printing, chrome-profile). Server on Windows runs make-icon.ps1 5s after start: creates Desktop 'Pizza Town.lnk' if missing. reliefShow() after Naya saman add / Ginti save.
  v1.25.0 also: start.bat runs focus-pos.ps1 first (exit if POS window found); duplicate POS window with history.length<=1 auto-closes after 4s countdown (window.close, fallback text); relief messages rotate via localStorage reliefN. NOTE: tray.ps1 changes apply only after tray restarts (PC restart), server update does not reload tray.
- v1.26.0: Naya saman = draft list (localStorage stockDraft, editable rows, Sab hatao, '✅ Haan, sab save karein' posts /stock/in one by one, removes each saved row); relief emoji only after that save (not per item, not on Ginti). Stock ki halat groups closed by default; tile toggles, '▲ Band karein' at top and bottom of group.
  v1.26.0 also: draft header shows remaining khatam (red circle) / kam (yellow) items not yet in list (hover = names); packs input auto-fills kul miqdar from pack_size (form + draft rows); editing kul miqdar clears packs.
- v1.27.0: (recipe 'shakk' alerts dropped - owner said not needed.) Sabzi group (Shimla Mirch 1, Tamatar 1, Piyaz 0.3, Band Gobhi 1 kg/day; stock_items.daily_use; sabziDaily() inserts kind 'daily' moves for each finished business day after first stock entry, catch-up max 10; excluded from POS Khatam/Kam). Frying Oil (litre, pack 1, alert 1 day): oil_changes table (seed 2026-10-20, 10-26, 11-02 = owner pattern), oilStatus() learns avg days + fried count (FRY_ITEMS recipes, Oven Baked Wings excluded, deal parts counted), remain = min(avgD - days gone, (avgF - fried)/rate); stockList/demand use it; POST /stock/oil-change (Admin 'Aaj oil badla') logs change and minus litres. Ikattha kharcha now spreads BACKWARD ending on chosen date; expense rows and Sales day rows show '🧾 ikattha' badge (report days[].ikattha).
  v1.27.0 also: Salary/Rent/Bijli-Pani split like Ikattha (days asked, required; SPLIT map, badges 👷/🏠/💡/🧾; report days[].split by category); Sabzi removed from Kharcha tiles; demand colors khatam red / kam yellow / theek green; daily (sabzi) rows always grouped in own section '🥬 Roz ki sabzi' (computeDemand row.daily), print too; sloth only for Ikattha.
