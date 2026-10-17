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
