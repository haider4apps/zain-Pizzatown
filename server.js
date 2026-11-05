const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
try { os.setPriority(0, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch (e) {}   // PC busy ho tab bhi POS aage
const crypto = require('crypto');
const { execFile } = require('child_process');
const PKG = require('./package.json');
const journal = require('./journal');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const BACKUPS = path.join(__dirname, 'backups');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BACKUPS, { recursive: true });

const db = new Database(path.join(DATA, process.env.DB_FILE || 'pizzatown.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
create table if not exists categories(
  id integer primary key, name text not null, name_ur text, sort integer default 0, active integer default 1);
create table if not exists items(
  id integer primary key, category_id integer not null references categories(id) on delete cascade,
  name text not null, name_ur text, grp text default '', details text default '',
  sort integer default 0, active integer default 1);
create table if not exists variants(
  id integer primary key, item_id integer not null references items(id) on delete cascade,
  label text default '', price integer not null default 0, sort integer default 0, active integer default 1);
create table if not exists orders(
  id integer primary key, order_no integer not null, business_date text not null,
  type text not null, table_no text default '', customer_name text default '', phone text default '',
  address text default '', rider text default '',
  subtotal integer, discount integer default 0, delivery_charge integer default 0, service_charge integer default 0,
  total integer, payment text default 'Cash', status text default 'done', note text default '',
  printed integer default 0, print_at text, created_at text);
create table if not exists order_items(
  id integer primary key, order_id integer not null references orders(id) on delete cascade,
  item_name text, variant_label text default '', details text default '',
  price integer, qty integer, note text default '');
create table if not exists settings(key text primary key, value text);
create index if not exists idx_orders_date on orders(business_date);
`);

// ---------- migrations (purane database ko bhi naye feature mil jate hain, data nahi mitta) ----------
function addCol(table, col, def) {
  const cols = db.prepare(`pragma table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`alter table ${table} add column ${col} ${def}`);
}
addCol('variants', 'cost', 'integer default 0');
addCol('order_items', 'cost', 'integer default 0');
addCol('order_items', 'variant_id', 'integer');
addCol('orders', 'uid', 'text');
addCol('orders', 'replaces', 'integer');
addCol('orders', 'gift_by', 'text');
addCol('order_items', 'extras', "text default ''");
addCol('order_items', 'extras_price', 'integer default 0');
addCol('orders', 'cost', 'integer default 0');
addCol('orders', 'profit', 'integer default 0');
addCol('orders', 'queued', 'integer default 0');
addCol('orders', 'slip_lang', "text default ''");
db.exec(`
create table if not exists expenses(
  id integer primary key, uid text, date text, category text, note text, amount integer,
  deleted integer default 0, queued integer default 0, created_at text);
create table if not exists events(id integer primary key, uid text, ts text, kind text, detail text);
create table if not exists outbox(
  id integer primary key, kind text, uid text, payload text, created_at text, synced_at text,
  attempts integer default 0, last_error text);
create index if not exists idx_outbox_pending on outbox(synced_at);
create table if not exists stock_items(
  id integer primary key, name text not null, unit text default 'piece', min_level real default 0,
  active integer default 1, created_at text);

create table if not exists stock_moves(
  id integer primary key, item_id integer not null, qty real not null, kind text not null,
  ref integer, expense_id integer, date text, note text default '', created_at text);
create table if not exists recipes(
  variant_id integer not null, item_id integer not null, qty real not null, primary key(variant_id,item_id));
create index if not exists idx_moves_item on stock_moves(item_id);
create index if not exists idx_moves_ref on stock_moves(ref);
`);
addCol('stock_items', 'grp', "text default ''");
// Stock v2: gram/ml mein recipe, pack size, Dough jaisi khud banai cheez (prep), takeaway/delivery packing, deal ke hisse
addCol('stock_items', 'sub_unit', "text default ''");   // g / ml (recipe isi mein likhi jati hai)
addCol('stock_items', 'sub_per', 'real default 0');      // 1 unit (kg/litre) mein kitne g/ml
addCol('stock_items', 'pack_size', 'real default 0');    // 1 pack = itni unit (maslan 2 kg)
addCol('stock_items', 'pack_name', "text default ''");
addCol('stock_items', 'is_prep', 'integer default 0');   // Dough: apna stock nahi, is ka saman minus hota hai
addCol('stock_items', 'prep_yield', 'real default 0');   // 1 batch ka wazan (g)
addCol('recipes', 'away', 'integer default 0');
addCol('stock_items', 'rate', 'real default 0');
addCol('stock_items', 'alert_state', "text default ''");  // aakhri dafa Sheet ko kya bataya (low/out)         // Rs per unit (kg/litre/piece), aakhri "Saman aaya" se          // 1 = sirf takeaway/delivery par (packing)
addCol('order_items', 'pz', "text default ''");
addCol('expenses', 'batch', "text default ''");          // ikattha kharcha: kai din par baanta hua, aik hi batch
// Fryer ka oil + fried cheezein (Oven Baked Wings oven mein, fried nahi)
const OIL_NAME = 'Oil';   // aik hi oil stock: dough bhi, fryer bhi (fryer badalne par 16 minus)
const FRY_ITEMS = ['Wings', 'Boneless Thai', 'Fries', 'Nuggets', 'Zestful Chicken Strips', 'Hot Shot', 'Chicken Patty', 'Chapli Patty'];
let FRIED = null;
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
addCol('stock_items', 'daily_use', 'real default 0');     // roz ka tay kharch (sabzi): recipe nahi, har din khud minus
db.exec('create table if not exists oil_changes(id integer primary key, date text not null, litres real default 16, note text default \'\', created_at text)');
addCol('oil_changes', 'expense_id', 'integer');
addCol('stock_items', 'alert_days', 'real default 0');    // 0 = automatic (Settings wale din, kam se kam 3); warna is item ke apne din          // deal ke pizza flavour + topping
db.exec(`
create table if not exists prep_recipes(prep_id integer not null, item_id integer not null, qty real not null, primary key(prep_id,item_id));
create table if not exists deal_parts(id integer primary key, variant_id integer not null, part_vid integer not null, qty real not null default 1, slot text default '');
create index if not exists idx_deal_parts on deal_parts(variant_id);
`);
// Menu delete ab "chhupana" hai (deleted=1), taake ghalti se delete hua wapas aa sake
addCol('categories', 'deleted', 'integer default 0');
addCol('items', 'deleted', 'integer default 0');
addCol('variants', 'deleted', 'integer default 0');
const uuid = () => crypto.randomUUID();
db.prepare('select id from orders where uid is null').all().forEach(r => db.prepare('update orders set uid=? where id=?').run(uuid(), r.id));

const DEFAULTS = {
  shop_name: 'Pizza Town',
  shop_tagline: 'Good Pizza  Happy Mood',
  shop_address: 'Mukdi Adda, 75 Wala Road, Yazman',
  shop_phone: '0321-7809035',
  bill_footer: 'شکریہ! دوبارہ تشریف لائیں',
  bill_footer_en: 'Thank you! Please visit again',
  gift_needs_pin: '1',              // Gift/Free order ke liye Admin PIN zaroori (1) ya cashier khud de sakta hai (0)
  edit_window_min: '2',            // order dene ke itne minute tak cashier badal sakta hai (uske baad Admin PIN)
  slip_lang_default: 'ur',        // ur = اردو slip, en = English slip (checkout par badal sakte hain)
  admin_pin: '1234',
  delivery_charge_enabled: '1',   // 1 = delivery order par charges ka option puchha jaye
  delivery_charge_default: '0',
  service_charge_enabled: '0',    // 1 = dine-in par service charge ka option puchha jaye
  service_charge_type: 'percent', // percent ya fixed
  service_charge_value: '5',
  paper_mm: '80',
  slip_margin_mm: '6',
  slip_weight: 'thin',
  slip_top_mm: '0',
  slip_bottom_mm: '1',
  slip_font_scale: '130',         // slip ka size percent mein (100 = chhota, 200 = bohat bara)
  print_bill: '1',
  print_kitchen: '1',
  print_delivery: '1',
  day_start_hour: '5',            // raat 12 ke baad bhi din 5 baje tak wohi din shumar hota hai
  sheet_url: '',                  // Google Apps Script web app ka URL
  sheet_key: '',                  // Apps Script ki secret key
  sync_since: '',                 // (internal) sync kab shuru hua
  last_sync_ok: '',               // (internal)
  last_sync_error: '',            // (internal)
  golive_done: '',                // (internal) Go-Live aik hi baar
  last_alive: '',                 // (internal) POS aakhri baar kab chal raha tha
  purge_fake_done: '',            // (internal) purane test orders aik baar saaf hue
  restore_1850_done: '',          // (internal) ghalti se delete hui Deal Rs 1850 aik baar wapas
  pizza_upgrade: '{"M":{"Elite Flavours":100,"Premium Flavours":200},"L":{"Elite Flavours":100,"Premium Flavours":300}}', // deal mein flavour badalne ke paise
  pizza_toppings: '100,200,300',  // extra topping ke button (Rs)
  pizza_topping_rules: '{"Pure Flavours":{"S":100,"M":100,"L":100},"Elite Flavours":{"M":200,"L":200},"Premium Flavours":{"M":200,"L":300}}', // kis pizza par kitne ki topping
  dine_tables: '6',
  stock_alert_days: '3',          // itne din ya kam ka stock bache to peela alert
  fun_enabled: '1',               // order ke baad cartoon / sale ka jashn
  fun_small: '1000',              // itne tak chhota order
  fun_big: '3000',                // is se upar bara order               // checkout par table number ke button
  delivery_cost_assumed: '200',   // recipe ki lagat: delivery = takeaway + itna (rider/petrol)
  stock_v2_done: '',
  stock_v2b_done: '',
  stock_v2c_done: '',
  opening_nov4_done: '',
  coat_maida_done: '',            // (internal) wings/thai coating maida aik baar          // (internal) 4 Nov wala shuru ka stock aik baar             // (internal) Nuggets pack 35 wapas             // (internal) pack size theek (Maida, Nuggets, F1/F2)              // (internal) recipes/stock v2 aik baar
};
const INTERNAL = new Set(['oil_merge_done', 'sabzi_oil_done', 'sync_since', 'last_sync_ok', 'last_sync_error', 'golive_done', 'last_alive', 'purge_fake_done', 'restore_1850_done', 'stock_v2_done', 'stock_v2b_done', 'stock_v2c_done', 'opening_nov4_done', 'coat_maida_done']);
const SECRET = new Set(['oil_merge_done', 'sabzi_oil_done', 'admin_pin', 'sheet_key', 'sheet_url', 'sync_since', 'last_sync_ok', 'last_sync_error', 'golive_done', 'last_alive', 'purge_fake_done', 'restore_1850_done', 'stock_v2_done', 'stock_v2b_done', 'stock_v2c_done', 'opening_nov4_done', 'coat_maida_done']);
const insSetting = db.prepare('insert or ignore into settings(key,value) values(?,?)');
Object.entries(DEFAULTS).forEach(([k, v]) => insSetting.run(k, v));
const setSetting = (k, v) =>
  db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(k, String(v));

if (db.prepare('select count(*) n from categories').get().n === 0) require('./seed')(db);

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const fmtDT = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const getSettings = () => Object.fromEntries(db.prepare('select key,value from settings').all().map(r => [r.key, r.value]));
function businessDate() {
  const h = parseInt(getSettings().day_start_hour) || 0;
  const d = new Date(Date.now() - h * 3600e3);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const int = (v, def = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : def; };
const nextSort = (table, col, val) =>
  (db.prepare(`select coalesce(max(sort),-1)+1 n from ${table} where ${col}=?`).get(val).n);

function fullMenu(admin) {
  const cats = db.prepare(`select * from categories where deleted=0 ${admin ? '' : 'and active=1'} order by sort,id`).all();
  const items = db.prepare(`select * from items where deleted=0 ${admin ? '' : 'and active=1'} order by sort,id`).all();
  const vars = db.prepare(`select * from variants where deleted=0 ${admin ? '' : 'and active=1'} order by sort,id`).all();
  const vByItem = {}, slots = {};
  db.prepare("select variant_id v, part_vid d, slot from deal_parts where slot!='' order by id").all().forEach(r => (slots[r.v] = slots[r.v] || []).push({ size: r.slot, def: r.d }));
  vars.forEach(v => { if (!admin) delete v.cost; if (slots[v.id]) v.slots = slots[v.id]; (vByItem[v.item_id] = vByItem[v.item_id] || []).push(v); });
  const iByCat = {};
  items.forEach(i => {
    i.variants = vByItem[i.id] || [];
    if (admin || i.variants.length) (iByCat[i.category_id] = iByCat[i.category_id] || []).push(i);
  });
  return cats.map(c => ({ ...c, items: iByCat[c.id] || [] }));
}

function updateRow(table, id, body, allowed) {
  const sets = [], vals = [];
  allowed.forEach(f => { if (body[f] !== undefined) { sets.push(`${f}=?`); vals.push(body[f]); } });
  if (!sets.length) return;
  db.prepare(`update ${table} set ${sets.join(',')} where id=?`).run(...vals, id);
}

function loadOrder(id) {
  const o = db.prepare('select * from orders where id=?').get(id);
  if (!o) return null;
  o.items = db.prepare('select * from order_items where order_id=? order by id').all(id);
  return o;
}
// Cashier/mobile ko cost aur profit kabhi nahi dikhna chahiye
function publicOrder(o) {
  if (!o) return o;
  const c = { ...o }; delete c.cost; delete c.profit; delete c.queued; delete c.uid;
  c.items = o.items.map(i => { const x = { ...i }; delete x.cost; return x; });
  return c;
}

// ---------- activity log + Google Sheet outbox ----------
const syncOn = () => { const S = getSettings(); return !!(S.sheet_url && S.sheet_key && S.sync_since); };
function enqueue(kind, uid, row) {
  db.prepare('insert into outbox(kind,uid,payload,created_at) values(?,?,?,?)').run(kind, uid, JSON.stringify(row), fmtDT(new Date()));
  journal.add(kind, uid, row);      // chhupi copy (app folder se bahar)
}
function logEvent(kind, detail) {
  const uid = uuid(), ts = fmtDT(new Date());
  db.prepare('insert into events(uid,ts,kind,detail) values(?,?,?,?)').run(uid, ts, kind, detail);
  if (syncOn()) enqueue('events', uid, [uid, ts, kind, detail]);
}
function orderSheetRow(o, rev, fix) {   // fix = cost sudhaar: ulti entry purani tareekh par hi lagti hai
  const m = rev ? -1 : 1, now = fmtDT(new Date());
  return [rev ? o.uid + ':X' : o.uid, o.order_no, rev && !fix ? businessDate() : o.business_date, (rev && !fix ? now : o.created_at).slice(11, 16),
    o.type, o.table_no || '', o.customer_name || '', o.phone || '', o.address || '', o.rider || '',
    m * o.subtotal, m * o.discount, m * o.delivery_charge, m * o.service_charge, m * o.total, m * o.cost, m * o.profit,
    o.payment + (o.gift_by ? ' - ' + o.gift_by : ''), rev ? (fix ? 'cost-fix' : 'cancel') : 'done', rev && !fix ? now : o.created_at];
}
function itemSheetRows(o, rev, fix) {
  const m = rev ? -1 : 1, ouid = rev ? o.uid + ':X' : o.uid, date = rev && !fix ? businessDate() : o.business_date;
  return o.items.map((i, idx) => [ouid + ':' + (idx + 1), ouid, o.order_no, date, i.item_name, i.variant_label || '',
    m * i.qty, i.price, i.cost || 0, m * (i.qty * i.price + (i.extras_price || 0)), m * i.qty * (i.cost || 0), m * (i.qty * (i.price - (i.cost || 0)) + (i.extras_price || 0)), [i.extras ? 'Extra: ' + i.extras + (i.extras_price ? ' (Rs ' + i.extras_price + ')' : '') : '', i.note || ''].filter(Boolean).join(' | ')]);
}
function enqueueOrder(o, rev, fix) {
  const row = orderSheetRow(o, rev, fix);
  enqueue('orders', row[0], row);
  itemSheetRows(o, rev, fix).forEach(r => enqueue('items', r[0], r));
}

// ---------- Printer ko pehli bari: order ke baad ka bhaari kaam (Sheet sync, stock hisaab) slip nikalne ke baad ----------
// Slip print hote hi ("printed") chal jata hai; printer band ho ya slip na nikle to zyada se zyada 15 sec baad
let AFTER = [], afterTimer = null;
function afterPrint(fn) { if (!AFTER.includes(fn)) AFTER.push(fn); if (!afterTimer) afterTimer = setTimeout(runAfterPrint, 15000); }
function runAfterPrint() { clearTimeout(afterTimer); afterTimer = null; const l = AFTER; AFTER = []; setTimeout(() => l.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 500); }

// ---------- Google Sheet sync (offline-first: internet aaye to khud chala jata hai) ----------
let syncing = false;
async function syncOnce() {
  const S = getSettings();
  if (!S.sheet_url || !S.sheet_key || !S.sync_since) return { skipped: true };
  if (syncing) return { busy: true };
  syncing = true;
  let total = 0;
  try {
    for (;;) {
      const rows = db.prepare('select id,kind,uid,payload from outbox where synced_at is null order by id limit 40').all();
      if (!rows.length) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(S.sheet_url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctrl.signal,
        body: JSON.stringify({ key: S.sheet_key, rows: rows.map(r => ({ kind: r.kind, uid: r.uid, row: JSON.parse(r.payload) })) }),
      });
      clearTimeout(timer);
      const text = await res.text();
      let j; try { j = JSON.parse(text); } catch (e) { throw new Error('Script ka jawab samajh nahi aaya. Web app URL aur deploy check karein.'); }
      if (!j.ok) throw new Error(j.error || 'Sheet ne mana kar diya');
      const now = fmtDT(new Date());
      const mark = db.prepare('update outbox set synced_at=? where id=?');
      db.transaction(() => rows.forEach(r => mark.run(now, r.id)))();
      total += rows.length;
      setSetting('last_sync_ok', now);
      if (rows.length < 40) break;
    }
    setSetting('last_sync_error', '');
    return { sent: total };
  } catch (e) {
    const msg = (e.name === 'AbortError' ? 'Internet/Google se jawab nahi aaya' : e.message).slice(0, 200);
    db.prepare('update outbox set attempts=attempts+1,last_error=? where synced_at is null').run(msg);
    setSetting('last_sync_error', fmtDT(new Date()) + ' - ' + msg);
    return { error: msg };
  } finally { syncing = false; }
}
setInterval(() => { if (!afterTimer) syncOnce().catch(() => {}); }, 20000);   // slip nikal rahi ho to sync baad mein
let syncTimer;
const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncOnce().catch(() => {}), 1500); };

// ---------- journal se dobara bhejna + offline / POS-band ka hisab ----------
function reconcileJournal() {
  try {
    if (!syncOn()) return;
    const { rows, broken } = journal.pending();
    const have = new Set(db.prepare('select kind||\'|\'||uid k from outbox').all().map(r => r.k));
    const ins = db.prepare('insert into outbox(kind,uid,payload,created_at) values(?,?,?,?)');
    let n = 0;
    db.transaction(() => rows.forEach(e => {
      if (have.has(e.k + '|' + e.u)) return;
      ins.run(e.k, e.u, JSON.stringify(e.p), fmtDT(new Date())); n++;
    }))();
    if (n) { logEvent('setting', `Journal se ${n} records dobara queue mein daale gaye`); syncSoon(); }
    if (broken && !reconcileJournal.warned) { reconcileJournal.warned = true; logEvent('setting', `Journal mein ${broken} kharab/badli hui lines mili`); }
  } catch (e) { console.error('journal:', e.message); }
}
const minsBetween = (a, b) => Math.round((new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / 60000);
let online = true, offlineSince = null;
async function monitorTick() {
  const now = fmtDT(new Date());
  setSetting('last_alive', now);
  const S = getSettings();
  if (!S.sheet_url || !S.sync_since) return;
  let ok = false;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(S.sheet_url, { redirect: 'follow', signal: ctrl.signal }); clearTimeout(t);
    ok = r.status < 500;
  } catch (e) { ok = false; }
  if (!ok && online) { online = false; offlineSince = now; }
  else if (ok && !online) {
    const m = minsBetween(offlineSince, now);
    online = true;
    logEvent('offline', `Internet band raha: ${offlineSince.slice(11, 16)} se ${now.slice(11, 16)} (${m} minute)`);
    offlineSince = null; syncSoon();
  }
}
function startupCheck() {
  const S = getSettings(), now = fmtDT(new Date());
  if (S.last_alive && syncOn()) {
    const m = minsBetween(S.last_alive, now);
    if (m >= 3) logEvent('offline', `POS band tha: ${S.last_alive.slice(11, 16)} se ${now.slice(11, 16)} (${m} minute)`);
  }
  setSetting('last_alive', now);
  reconcileJournal();
}
setInterval(() => monitorTick().catch(() => {}), 60000);
setInterval(reconcileJournal, 5 * 60000);

// ---------- daily backup ----------
async function dailyBackup() {
  try {
    const file = path.join(BACKUPS, `pizzatown-${businessDate()}.db`);
    if (!fs.existsSync(file)) await db.backup(file);
    const old = fs.readdirSync(BACKUPS).filter(f => f.endsWith('.db')).sort();
    while (old.length > 30) fs.unlinkSync(path.join(BACKUPS, old.shift()));
  } catch (e) { console.error('Backup error:', e.message); }
}
dailyBackup();
setInterval(dailyBackup, 6 * 3600e3);

// ---------- git helpers (Software update) ----------
function run(cmd, args, opts = {}) {
  if (cmd === 'git') args = ['-c', 'safe.directory=*', ...args];   // "dubious ownership" error se bachne ke liye
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: __dirname, timeout: 150000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().slice(0, 400)));
      resolve(String(stdout).trim());
    });
  });
}
const hasGit = () => fs.existsSync(path.join(__dirname, '.git'));
async function versionInfo() {
  const info = { version: PKG.version, commit: null, date: null, git: hasGit() };
  if (info.git) {
    try { info.commit = await run('git', ['rev-parse', '--short', 'HEAD']); info.date = await run('git', ['log', '-1', '--format=%cd', '--date=short']); } catch (e) { info.git_error = e.message; }
  }
  return info;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '30d', immutable: true }));   // font badalta nahi: browser yaad rakhe
app.use(express.static(path.join(__dirname, 'public')));


// ---------- stock ----------
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
// 1 line (1 qty) ki lagat Rs: saman x rate. Dine-in mein ketchup bottle ka kharcha sachet jitna
function lineCost(vid, pz, type) {
  try {
    const rate = Object.fromEntries(db.prepare('select id,rate,name from stock_items').all().map(i => [i.id, i]));
    const sum = tot => Object.entries(tot).reduce((t, [id, q]) => t + q * ((rate[id] || {}).rate || 0), 0);
    let c = sum(stockNeed([{ vid, qty: 1, pz }], type));
    if (type === 'dinein') { const k = Object.values(rate).find(i => i.name === 'Ketchup Sachet'); const a = stockNeed([{ vid, qty: 1, pz }], 'takeaway'); if (k && a[k.id]) c += a[k.id] * (k.rate || 0); }
    return Math.round(c);
  } catch (e) { return 0; }
}
// Kis order line se kaunsa saman kitna minus ho (deal ke hisse, pizza flavour, Dough ka saman, takeaway packing)
function stockNeed(lines, type, direct) {
  const Q = {
    rec: db.prepare('select item_id,qty,away from recipes where variant_id=?'),
    parts: db.prepare('select part_vid,qty,slot from deal_parts where variant_id=? order by id'),
    item: db.prepare('select id,is_prep,prep_yield,sub_per from stock_items where id=?'),
    prep: db.prepare('select item_id,qty from prep_recipes where prep_id=?'),
  };
  const away = type !== 'dinein', tot = {};
  const addItem = (id, q) => {
    const it = Q.item.get(id); if (!it) return;
    if (it.is_prep) { if (it.prep_yield > 0) { const f = q * (it.sub_per || 1) / it.prep_yield; Q.prep.all(id).forEach(r => { tot[r.item_id] = (tot[r.item_id] || 0) + r.qty * f; }); } return; }
    tot[id] = (tot[id] || 0) + q;
  };
  const addVariant = (vid, mult, slots, depth) => {
    if (depth > 3) return;
    Q.rec.all(vid).forEach(r => { if (!r.away || away) addItem(r.item_id, r.qty * mult); });
    let si = 0;
    Q.parts.all(vid).forEach(p => { let pv = p.part_vid; if (p.slot) { const c = slots && slots[si++]; if (c && c.vid) pv = c.vid; } addVariant(pv, p.qty * mult, null, depth + 1); });
  };
  // extra topping ka saman (recipes-seed.js TOPPING)
  const TOP = require('./recipes-seed').TOPPING, byName = db.prepare('select id,sub_per from stock_items where active=1 and is_prep=0 and lower(name)=lower(?)');
  const addTop = (rs, mult) => Object.entries(TOP[rs] || {}).forEach(([n, g]) => { const it = byName.get(n); if (it) tot[it.id] = (tot[it.id] || 0) + (it.sub_per ? g / it.sub_per : g) * mult; });
  if (direct) Object.entries(direct).forEach(([id, q]) => addItem(int(id), q));
  lines.forEach(l => { if (l.vid) { const z = parsePz(l.pz); addVariant(l.vid, l.qty, z && z.s, 0); if (z && z.s) z.s.forEach(x => { if (x.top) addTop(x.top, l.qty); }); } });
  return tot;
}
function stockOut(orderId, lines, bd, type) {
  const ins = db.prepare("insert into stock_moves(item_id,qty,kind,ref,date,created_at) values(?,?,'out',?,?,?)");
  const now = fmtDT(new Date()), tot = stockNeed(lines, type);
  Object.entries(tot).forEach(([id, q]) => ins.run(id, -Math.round(q * 10000) / 10000, orderId, bd, now));
}
// balance = aaya/ginti + (becha hua, sirf 'done' orders; cancel/edit ki hui sale wapas ho jati hai)
const BAL_SQL = `coalesce(sum(case when m.kind='out' then (case when o.status='done' then m.qty else 0 end) else m.qty end),0)`;
// Roz ki khapat: pichle 7 din ke asal orders x recipes (stock shuru hone se pehle ke orders bhi). 10 min cache
let USAGE = { key: '', at: 0, map: {}, days: 1 };
function dailyUsage() {
  const bd = businessDate();
  if (USAGE.key === bd && Date.now() - USAGE.at < 10 * 60 * 1000) return USAGE;
  const d0 = new Date(bd + 'T00:00:00Z'); d0.setUTCDate(d0.getUTCDate() - 7);
  const since = d0.toISOString().slice(0, 10);
  const orders = db.prepare("select id,type from orders where status='done' and business_date>=? and business_date<?").all(since, bd);
  const days = Math.max(1, db.prepare("select count(distinct business_date) n from orders where status='done' and business_date>=? and business_date<?").get(since, bd).n);
  const li = db.prepare('select variant_id vid,qty,pz from order_items where order_id=?'), map = {};
  orders.forEach(o => Object.entries(stockNeed(li.all(o.id).filter(l => l.vid), o.type)).forEach(([id, q]) => { map[id] = (map[id] || 0) + q; }));
  Object.keys(map).forEach(k => { map[k] = map[k] / days; });
  db.prepare('select id,daily_use from stock_items where daily_use>0 and active=1').all().forEach(r => { map[r.id] = (map[r.id] || 0) + r.daily_use; });
  USAGE = { key: bd, at: Date.now(), map, days };
  return USAGE;
}
function stockList() {
  const items = db.prepare('select * from stock_items where active=1 and coalesce(is_prep,0)=0 order by grp,name').all();
  const alertDays = Math.max(3, parseFloat(getSettings().stock_alert_days) || 3);   // itne din ya kam ka stock = peela
  const bal = Object.fromEntries(db.prepare(`select m.item_id id, ${BAL_SQL} b from stock_moves m left join orders o on o.id=m.ref and m.kind='out' group by m.item_id`).all().map(r => [r.id, r.b]));
  const use = dailyUsage().map;
  // jis saman ka stock kabhi likha hi nahi gaya us par alert nahi (warna naye items par har order par "khatam" aata)
  const known = new Set(db.prepare("select distinct item_id i from stock_moves where kind!='out'").all().map(r => r.i));
  return items.map(i => {
    const b = r2(bal[i.id] || 0), perDay = Math.round((use[i.id] || 0) * 1000) / 1000;
    const days = perDay > 0 ? r2(Math.max(0, b) / perDay) : null;   // minus stock par din 0 (minus din nahi)
    let status = 'ok';
    if (!known.has(i.id)) status = 'unset';
    else if (b <= 0) status = 'out';
    const aDays = i.alert_days > 0 ? i.alert_days : alertDays;   // is item ka alert: apne din ya automatic
    if (status === 'ok' && ((i.min_level > 0 && b <= i.min_level) || (days !== null && days <= aDays))) status = 'low';   // itne din ya kam ka stock = peela
    if (i.daily_use > 0) status = 'ok';   // sabzi roz aati hai, us par alert nahi (demand mein khud aati hai)
    let oil = null;
    if (i.name === OIL_NAME) {   // fryer: badalne ka din qareeb ho aur stock mein 16 na hon to alert
      oil = oilStatus();
      if (oil.remain <= 1 && b < oil.litres + (perDay || 0) && status !== 'out' && status !== 'unset') status = 'low';
    }
    return { id: i.id, name: i.name, grp: i.grp || '', unit: i.unit, min_level: i.min_level, bal: b, per_day: perDay, days, status,
      alert_days: aDays, alert_auto: !(i.alert_days > 0), auto_days: alertDays, daily_use: i.daily_use || 0, oil,
      sub_unit: i.sub_unit || '', sub_per: i.sub_per || 0, pack_size: i.pack_size || 0, pack_name: i.pack_name || '', rate: i.rate || 0 };
  });
}
// Stock kam / khatam / wapas theek hua: Events mein line (Google Sheet ke "Stock Alerts" tab mein laal / peela / hara)
function stockAlertCheck() {
  try {
    const set = db.prepare('update stock_items set alert_state=? where id=?'); let changed = false;
    stockList().forEach(i => {
      const was = db.prepare('select alert_state a from stock_items where id=?').get(i.id).a || '';
      const now = i.status === 'out' || i.status === 'low' ? i.status : '';
      if (now === was) return;
      set.run(now, i.id);
      const q = qtyTxtSrv(i);
      if (now === 'out') logEvent('stock', `KHATAM: ${i.name} - stock khatam (${q})`);
      else if (now === 'low') logEvent('stock', `KAM: ${i.name} - sirf ${q} bacha${i.days !== null ? ' (~' + Math.max(0, Math.floor(i.days)) + ' din)' : ''}`);
      else if (i.status === 'ok' && was) logEvent('stock', `THEEK: ${i.name} - stock aa gaya (${q})`);
      changed = true;
    });
    if (changed) setTimeout(() => demandToSheet(true), 3000);
  } catch (e) { console.error('stock alert', e.message); }
}
// ---------- zaroori saman: khatam ho to order nahi lagta (Admin PIN ke baghair) ----------
const ESSENTIAL = new Set(['Maida', 'Pizza Chicken', 'Burger Bun', 'Boneless Thai', 'Chicken Patty', 'Chapli Patty', 'Zestful Chicken Strips',
  'Tortilla Bread', 'Seekh Kabab', 'Hot Shot', 'Shawarma Bread', 'Plain Paratha', 'Fries', 'Wings', 'Nuggets', 'Macaroni', 'Lazania Strip']);
const CHEESE = ['Top Cow Cheese', 'Shredded 70/30 Cheese'];          // dono mila kar (aik khatam ho to doosri se chal jata hai)
// in categories mein ye saman sirf "side" hai, us ke baghair bhi item ban jata hai
const SIDE = { pizza: ['Seekh Kabab', 'Fries'], wrap: ['Fries'], pasta: ['Seekh Kabab'] };
function catKey(name) { const n = String(name || '').toLowerCase(); return /pizza/.test(n) ? 'pizza' : /wrap|roll/.test(n) ? 'wrap' : /pasta|salad/.test(n) ? 'pasta' : ''; }
// cart lines -> { saman ka naam: kitna chahiye } sirf zaroori cheezein (deal ke hisse + pizza flavour samet)
function essentialNeed(lines) {
  const items = Object.fromEntries(db.prepare('select id,name,is_prep from stock_items where active=1').all().map(i => [i.id, i]));
  const rec = db.prepare('select item_id,qty,away from recipes where variant_id=?');
  const prep = db.prepare('select item_id,qty from prep_recipes where prep_id=?');
  const pyield = db.prepare('select prep_yield,sub_per from stock_items where id=?');
  const parts = db.prepare('select part_vid,qty,slot from deal_parts where variant_id=? order by id');
  const cat = db.prepare('select c.name from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id where v.id=?');
  const need = {}, add = (n, q) => { need[n] = (need[n] || 0) + q; };
  const walk = (vid, mult, slots, depth) => {
    if (depth > 3) return;
    const side = SIDE[catKey((cat.get(vid) || {}).name)] || [];
    rec.all(vid).forEach(r => {
      const it = items[r.item_id]; if (!it) return;
      if (it.is_prep) { const y = pyield.get(it.id); if (y && y.prep_yield > 0) { const f = r.qty * mult * (y.sub_per || 1) / y.prep_yield;
        prep.all(it.id).forEach(p => { const pi = items[p.item_id]; if (pi && ESSENTIAL.has(pi.name)) add(pi.name, p.qty * f); }); } return; }
      if (side.includes(it.name)) return;
      if (CHEESE.includes(it.name)) add('Cheese', r.qty * mult);
      else if (ESSENTIAL.has(it.name)) add(it.name, r.qty * mult);
    });
    let si = 0;
    parts.all(vid).forEach(p => { let pv = p.part_vid; if (p.slot) { const c = slots && slots[si++]; if (c && c.vid) pv = c.vid; } walk(pv, p.qty * mult, null, depth + 1); });
  };
  lines.forEach(l => { if (l.vid) { const z = parsePz(l.pz); walk(l.vid, l.qty, z && z.s, 0); } });
  return need;
}
// kaunsa zaroori saman kam pare ga? (sirf woh saman jis ka stock kabhi likha gaya ho)
function stockBlockers(lines) {
  const list = stockList(), by = Object.fromEntries(list.map(i => [i.name, i])), out = [];
  const need = essentialNeed(lines);
  Object.entries(need).forEach(([n, q]) => {
    if (n === 'Cheese') {
      const cs = CHEESE.map(c => by[c]).filter(Boolean); if (!cs.length || cs.every(c => c.status === 'unset')) return;
      const bal = cs.reduce((t, c) => t + Math.max(0, c.bal), 0);
      if (bal + 1e-9 < q) out.push({ name: 'Cheese (Top Cow + Shredded)', bal: r2(bal * 1000), need: r2(q * 1000), unit: 'g' });
      return;
    }
    const i = by[n]; if (!i || i.status === 'unset') return;
    if (Math.max(0, i.bal) + 1e-9 < q) out.push({ name: i.name, bal: i.sub_per ? r2(i.bal * i.sub_per) : r2(i.bal), need: i.sub_per ? r2(q * i.sub_per) : r2(q), unit: i.sub_per ? i.sub_unit : i.unit });
  });
  return out;
}
const qtyTxtSrv = i => (i.sub_per && Math.abs(i.bal) < 1 ? `${Math.round(i.bal * i.sub_per)} ${i.sub_unit}` : `${+(+i.bal).toFixed(2)} ${i.unit}`);
app.get('/api/stock/alerts', (req, res) => {
  try {
    const list = stockList(), by = Object.fromEntries(list.map(i => [i.id, i]));
    const alerts = list.filter(i => (i.status === 'out' || i.status === 'low') && i.grp !== 'Sabzi').sort((a, b) => (a.status === 'out' ? 0 : 1) - (b.status === 'out' ? 0 : 1));
    const variants = {}, byName = Object.fromEntries(list.map(i => [i.name, i]));
    db.prepare('select v.id from variants v where v.active=1 and v.deleted=0').all().forEach(({ id }) => {
      const bl = stockBlockers([{ vid: id, qty: 1 }]);
      if (bl.length) { variants[id] = { status: 'out', name: bl[0].name, bal: bl[0].bal, unit: bl[0].unit, days: null, block: true }; return; }
      const need = Object.keys(essentialNeed([{ vid: id, qty: 1 }]));
      const low = need.flatMap(n => (n === 'Cheese' ? CHEESE : [n])).map(n => byName[n]).find(i => i && i.status === 'low');
      if (low) variants[id] = { status: 'low', name: low.name, bal: low.bal, unit: low.unit, days: low.days };
    });
    const os = oilStatus(); const oilIt = list.find(i => i.name === OIL_NAME) || {};
    const oil = os.last && os.remain <= 1 ? { remain: os.remain, next: os.next, day: os.day, fried: os.fried, litres: os.litres, last: os.last, bal: oilIt.bal || 0, unit: oilIt.unit || '' } : null;
    res.json({ alerts, variants, oil });
  } catch (e) { res.json({ alerts: [], variants: {} }); }
});
app.post('/api/stock/override', (req, res) => {
  logEvent('stock', `Khatam stock par bhi order liya: ${String((req.body || {}).name || '').slice(0, 120)}`);
  res.json({ ok: true });
});

app.get('/api/menu', (req, res) => res.json(fullMenu(false)));
// POS header ke liye (admin PIN ke baghair, sirf ginti)
app.get('/api/sync/pending', (req, res) => {
  const S = getSettings();
  res.json({ on: !!(S.sheet_url && S.sheet_key && S.sync_since), online, pending: db.prepare('select count(*) n from outbox where synced_at is null').get().n, last_ok: S.last_sync_ok || '' });
});

app.get('/api/settings', (req, res) => {
  const s = getSettings(); SECRET.forEach(k => delete s[k]); res.json(s);
});
app.get('/api/version', async (req, res) => res.json(await versionInfo()));
app.get('/api/riders', (req, res) =>
  res.json(db.prepare("select distinct rider from orders where type='delivery' and rider!='' order by id desc limit 20").all().map(r => r.rider)));


// Order ke lines/totals server par dobara hisab hote hain (client par bharosa nahi).
// keepItems: edit ke waqt purani lines (price/cost wahi rehti hain jo order dete waqt thi)
const GIFT_BY = ['Owner', 'Partner 1', 'Partner 2', 'Staff', 'Customer'];
function calcOrder(b, S, keepItems) {
  const type = ['dinein', 'takeaway', 'delivery'].includes(b.type) ? b.type : 'takeaway';
  if (!Array.isArray(b.items) || !b.items.length) return { err: 'Cart khali hai' };
  if (type === 'delivery' && !String(b.address || '').trim()) return { err: 'Delivery ke liye address likhein' };
  const getV = db.prepare(`select v.id,v.label,v.price,v.cost,i.name,i.details from variants v join items i on i.id=v.item_id where v.id=? and v.active=1 and i.active=1 and v.deleted=0 and i.deleted=0`);
  const PZ = pzContext(S);
  const lines = [];
  for (const it of b.items) {
    const qty = Math.min(99, Math.max(1, int(it.qty, 1)));
    const note = String(it.note || '').slice(0, 200);
    const extras = String(it.extras || '').slice(0, 200);
    const ep = Math.min(1000000, Math.max(0, int(it.extras_price, 0)));
    if (it.keep && keepItems) {
      const k = keepItems.find(x => x.id === int(it.keep));
      if (!k) return { err: 'Purani line nahi mili' };
      const old = parsePz(k.pz);
      const z = pzApply(PZ, k.variant_id, it.pz !== undefined ? it.pz : (old ? old.s : null), qty);
      if (z.err) return z;
      const mx = it.pz !== undefined ? extras : (old ? old.mx : extras), mp = it.pz !== undefined ? ep : (old ? old.mp : ep);
      lines.push({ name: k.item_name, label: k.variant_label, details: k.details || '', price: k.price, cost: k.cost || 0, qty, note, ...pzMerge(z, mx, mp), vid: k.variant_id || null, kept: true });
      continue;
    }
    const v = getV.get(it.variant_id);
    if (!v) return { err: 'Item menu mein nahi mila' };
    if (v.price <= 0) return { err: `${v.name} ${v.label} ki price set nahi hai (Admin se price daalein)` };
    const z = pzApply(PZ, v.id, it.pz, qty);
    if (z.err) return z;
    lines.push({ name: v.name, label: v.label, details: v.details || '', price: v.price, cost: v.cost || 0, qty, note, ...pzMerge(z, extras, ep), vid: v.id });
  }
  // Lagat recipe + stock rate se (naye items); recipe/rate na ho to purani menu cost
  lines.forEach(l => { if (l.vid && !l.kept) { const c = lineCost(l.vid, l.pz, type); if (c > 0) l.cost = c; } });
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty + l.ep, 0);
  const cost = lines.reduce((s, l) => s + l.cost * l.qty, 0);
  const discount = Math.min(int(b.discount), subtotal);
  const profit = subtotal - discount - cost;
  let delivery = 0, service = 0;
  if (type === 'delivery' && S.delivery_charge_enabled === '1') delivery = int(b.delivery_charge);
  if (type === 'dinein' && S.service_charge_enabled === '1' && b.service) {
    const val = Number(S.service_charge_value) || 0;
    service = S.service_charge_type === 'percent' ? Math.round((subtotal - discount) * val / 100) : Math.round(val);
  }
  if (b.payment === 'Gift') {   // gift: bill Rs 0, lagat nuqsan ban kar profit mein ayegi
    const by = GIFT_BY.includes(b.gift_by) ? b.gift_by : 'Owner';
    return { type, lines, subtotal, cost, discount: subtotal, profit: -cost, delivery: 0, service: 0, total: 0, gift: true, gift_by: by };
  }
  return { type, lines, subtotal, cost, discount, profit, delivery, service, total: subtotal - discount + delivery + service };
}
// ---------- pizza flavour (deal) + extra topping ----------
const SZ_NAME = { L: 'Large', M: 'Medium', S: 'Small' };
function parsePz(t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function pzContext(S) {
  let up = {}; try { up = JSON.parse(S.pizza_upgrade || '{}'); } catch (e) {}
  const tops = String(S.pizza_toppings || '').split(',').map(x => int(x)).filter(x => x > 0);
  let rules = {}; try { rules = JSON.parse(S.pizza_topping_rules || '{}'); } catch (e) {}
  const pizzas = {};   // variant id -> {name,size,grp}
  db.prepare(`select v.id,v.label,i.name,i.grp from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id
    where lower(c.name) like '%pizza%' and c.deleted=0 and i.deleted=0 and v.deleted=0 and i.active=1 and v.active=1`).all()
    .forEach(r => (pizzas[r.id] = { name: r.name, size: r.label, grp: r.grp }));
  return { up, tops, rules, pizzas, slots: db.prepare("select part_vid d, slot from deal_parts where variant_id=? and slot!='' order by id") };
}
// pz = [{vid, top}] (deal ke har pizza ke liye) ya [{top}] (akela pizza). Paise server khud ginta hai.
function pzApply(C, vid, pz, qty) {
  const none = { s: null, text: '', charge: 0 };
  if (!vid || !Array.isArray(pz)) return none;
  // topping: har pizza par sirf us ki apni qeemat (Pure 100, Elite 200, Premium M 200 / L 300)
  const top = (t, p) => { if (!int(t) || !p) return 0; const a = int(((C.rules[p.grp] || {})[p.size]) || 0); return a || (C.tops.includes(int(t)) ? int(t) : 0); };
  const slots = C.slots.all(vid);
  let charge = 0; const s = [], txt = [];
  if (slots.length) {
    slots.forEach((sl, i) => {
      const want = pz[i] || {}, p = C.pizzas[int(want.vid)];
      const pv = p && p.size === sl.slot ? int(want.vid) : sl.d, pp = C.pizzas[pv] || { name: '?', grp: '' };
      const up = int(((C.up[sl.slot] || {})[pp.grp]) || 0), t = top(want.top, { grp: pp.grp, size: sl.slot });
      charge += up + t; s.push({ vid: pv, size: sl.slot, name: pp.name, up, top: t });
      txt.push(`${SZ_NAME[sl.slot] || sl.slot}: ${pp.name}${up ? ' (+' + up + ')' : ''}${t ? ' + Topping (+' + t + ')' : ''}`);
    });
  } else if (C.pizzas[vid]) {
    const t = top((pz[0] || {}).top, C.pizzas[vid]);
    if (!t) return none;
    charge = t; s.push({ top: t }); txt.push('Extra Topping (+' + t + ')');
  } else return none;
  return { s, text: txt.join(' | '), charge: charge * qty };
}
function pzMerge(z, mx, mp) {
  if (!z.s) return { extras: mx, ep: mp, pz: '' };
  return { extras: [z.text, mx].filter(Boolean).join(' | ').slice(0, 300), ep: mp + z.charge, pz: JSON.stringify({ s: z.s, mx, mp }) };
}
const editLeft = o => Math.max(0, Math.round((Number(S_editMin()) * 60) - (Date.now() - new Date(o.created_at.replace(' ', 'T')).getTime()) / 1000));
function S_editMin() { const m = parseFloat(getSettings().edit_window_min); return isNaN(m) ? 2 : Math.max(0, m); }

function insertOrder(b, calc, S, replaces) {
  const { type, lines, subtotal, cost, discount, profit, delivery, service, total } = calc;
  const now = new Date(), bd = businessDate(), sync = syncOn();
  const no = db.prepare('select coalesce(max(order_no),0)+1 n from orders where business_date=?').get(bd).n;
  const oid = db.prepare(`insert into orders(uid,order_no,business_date,type,table_no,customer_name,phone,address,rider,
    subtotal,discount,delivery_charge,service_charge,total,cost,profit,payment,note,printed,print_at,created_at,queued,replaces,gift_by)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`).run(
    uuid(), no, bd, type, String(b.table_no || '').slice(0, 20), String(b.customer_name || '').slice(0, 80),
    String(b.phone || '').slice(0, 30), String(b.address || '').slice(0, 300), String(b.rider || '').slice(0, 60),
    subtotal, discount, delivery, service, total, cost, profit,
    calc.gift ? 'Gift' : (['Cash', 'Online', 'Card'].includes(b.payment) ? b.payment : 'Cash'),
    String(b.note || '').slice(0, 300), fmtDT(now), fmtDT(now), sync ? 1 : 0, replaces || null, calc.gift ? calc.gift_by : null).lastInsertRowid;
  const ins = db.prepare('insert into order_items(order_id,item_name,variant_label,details,price,cost,qty,note,extras,extras_price,variant_id,pz) values(?,?,?,?,?,?,?,?,?,?,?,?)');
  lines.forEach(l => ins.run(oid, l.name, l.label, l.details, l.price, l.cost, l.qty, l.note, l.extras, l.ep, l.vid || null, l.pz || ''));
  try { stockOut(oid, lines, bd, type); } catch (e) { console.error('stock', e.message); }
  afterPrint(stockAlertCheck);   // print pehle; stock ka hisaab slip nikalne ke baad
  const lang = ['ur', 'en'].includes(b.slip_lang) ? b.slip_lang : (S.slip_lang_default === 'en' ? 'en' : 'ur');
  db.prepare('update orders set slip_lang=? where id=?').run(lang, oid);
  if (b.no_print) db.prepare('update orders set printed=1 where id=?').run(oid);   // is order ki slip nahi nikalni
  if (sync) enqueueOrder(loadOrder(oid), false);
  return oid;
}
app.post('/api/orders', (req, res) => {
  try {
    const b = req.body || {};
    const S = getSettings();
    const calc = calcOrder(b, S, null);
    if (calc.err) return res.status(400).json({ error: calc.err });
    if (calc.gift && S.gift_needs_pin === '1' && req.get('x-admin-pin') !== S.admin_pin) return res.status(403).json({ error: 'Gift ke liye Admin PIN chahiye', code: 'GIFT_PIN' });
    // zaroori saman khatam: order nahi lagta, sirf Admin PIN se (har dafa)
    const bl = stockBlockers(calc.lines);
    if (bl.length) {
      if (req.get('x-stock-pin') !== S.admin_pin) return res.status(409).json({ error: 'Zaroori saman khatam hai', code: 'STOCK_BLOCK', blockers: bl, wrong_pin: !!req.get('x-stock-pin') });
      logEvent('stock', `Admin PIN se khatam stock par order liya: ${bl.map(b => b.name).join(', ')}`);
    }
    const sync = syncOn();
    const id = db.transaction(() => insertOrder(b, calc, S, null))();
    if (sync) afterPrint(syncSoon);   // Sheet ko bhejna slip nikalne ke baad (printer ko pehli bari)
    const out = publicOrder(loadOrder(id));
    // aaj ki sale ne 30k/40k/50k paar kiya? (sirf hadd ka number bhejte hain, kul sale nahi)
    try {
      const sum = db.prepare("select coalesce(sum(total),0) t from orders where business_date=? and status='done'").get(out.business_date).t;
      const hit = [50000, 40000, 30000].find(m => sum >= m && sum - out.total < m);
      if (hit) out.celebrate = hit;
    } catch (e) {}
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});


// Order badalna: waqt (edit_window_min) ke andar cashier, uske baad sirf Admin PIN ke saath
app.put('/api/orders/:id', (req, res) => {
  try {
    const b = req.body || {}, S = getSettings();
    const o = loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order nahi mila' });
    if (o.status !== 'done') return res.status(400).json({ error: 'Cancelled order badla nahi ja sakta' });
    const pinOk = req.get('x-admin-pin') === S.admin_pin;
    if (!pinOk && editLeft(o) <= 0) return res.status(403).json({ error: 'Change ka waqt khatam. Admin PIN chahiye.', code: 'LOCKED' });
    const calc = calcOrder(b, S, o.items);
    if (calc.err) return res.status(400).json({ error: calc.err });
    if (calc.gift && S.gift_needs_pin === '1' && !pinOk) return res.status(403).json({ error: 'Gift ke liye Admin PIN chahiye', code: 'GIFT_PIN' });
    const late = editLeft(o) <= 0;
    const nid = db.transaction(() => {
      db.prepare("update orders set status='cancelled' where id=?").run(o.id); setImmediate(stockAlertCheck); setImmediate(stockAlertCheck);
      if (o.queued) enqueueOrder(o, true);            // purani entry ki ulti (reversal) Sheet mein
      const id = insertOrder(b, calc, S, o.order_no);  // naya order, naya number
      const n = loadOrder(id);
      logEvent('edit', `Order #${o.order_no} (${o.business_date}) cancel, naya order #${n.order_no}${late ? ' (Admin PIN)' : ''}: Rs ${o.total} -> Rs ${n.total}`);
      return id;
    })();
    syncSoon();
    res.json(publicOrder(loadOrder(nid)));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/recent', (req, res) =>
  res.json(db.prepare(`select id,order_no,type,table_no,customer_name,total,status,printed,created_at from orders
    where business_date=? order by id desc limit 50`).all(businessDate()).map(o => ({ ...o, edit_left: editLeft(o) }))));

// Printer-station PC yahan se naye (na-print hue) orders poochta hai
// Printer ON karte waqt: jama hue purane orders na nikalein
app.post('/api/print/skip-old', (req, res) => { db.prepare('update orders set printed=1 where printed=0').run(); res.json({ ok: true }); });
app.get('/api/print/pending', (req, res) => {
  const since = fmtDT(new Date(Date.now() - 2 * 3600e3));
  res.json(db.prepare("select id from orders where printed=0 and status='done' and print_at>=? order by id").all(since).map(r => r.id));
});
app.get('/api/orders/:id', (req, res) => {
  const o = loadOrder(req.params.id);
  o ? res.json(publicOrder(o)) : res.status(404).json({ error: 'Order nahi mila' });
});
app.post('/api/orders/:id/printed', (req, res) => {
  db.prepare('update orders set printed=1 where id=?').run(req.params.id); res.json({ ok: true });
  // Slip ka waqt: order (ya reprint) se print tak. 5 sec se zyada ho to Events mein (net chalu/band ke saath) taake asal wajah pata chale
  try {
    const o = db.prepare('select order_no,print_at,created_at from orders where id=?').get(req.params.id), b = req.body || {};
    const from = o && (o.print_at || o.created_at), secs = from ? Math.round((Date.now() - new Date(from.replace(' ', 'T'))) / 1000) : 0;
    if (secs >= 5 && secs < 3600) logEvent('print', `Slip der se: #${o.order_no} ${secs} sec (${online ? 'net chalu' : 'net band'}; slip banana ${Math.round((+b.load || 0) / 100) / 10}s, print ${Math.round((+b.print || 0) / 100) / 10}s)`);
  } catch (e) {}
  runAfterPrint();
});
app.post('/api/orders/:id/reprint', (req, res) => {
  const lang = (req.body || {}).lang;
  if (['ur', 'en'].includes(lang)) db.prepare('update orders set slip_lang=? where id=?').run(lang, req.params.id);
  db.prepare('update orders set printed=0, print_at=? where id=?').run(fmtDT(new Date()), req.params.id); res.json({ ok: true });
});

// ---------- admin ----------
const admin = express.Router();
admin.use((req, res, next) => {
  if (req.get('x-admin-pin') !== getSettings().admin_pin) return res.status(401).json({ error: 'PIN ghalat hai' });
  next();
});
admin.get('/login', (req, res) => res.json({ ok: true }));
admin.get('/menu', (req, res) => res.json(fullMenu(true)));
admin.get('/settings', (req, res) => res.json(getSettings()));
admin.put('/settings', (req, res) => {
  const old = getSettings();
  const up = db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value');
  db.transaction(() => {
    Object.entries(req.body || {}).forEach(([k, v]) => {
      if (!(k in DEFAULTS) || INTERNAL.has(k)) return;
      v = String(v);
      if (k === 'admin_pin' && !v.trim()) return;
      if (v === old[k]) return;
      up.run(k, v);
      if (k === 'admin_pin') logEvent('setting', 'Admin PIN badla gaya');
      else if (k === 'sheet_key') logEvent('setting', 'Sheet key badli gayi');
      else if (k === 'sheet_url') logEvent('setting', 'Sheet URL badla gaya');
      else logEvent('setting', `${k}: ${old[k]} -> ${v}`);
    });
  })();
  const S = getSettings();
  if (S.sheet_url && S.sheet_key && !S.sync_since) {
    setSetting('sync_since', fmtDT(new Date()));
    logEvent('setting', 'Google Sheet sync shuru');
  }
  res.json({ ok: true });
  if (S.sheet_url && S.sheet_key) { reconcileJournal(); syncSoon(); }
});

admin.post('/categories', (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Naam likhein' });
  const id = db.prepare('insert into categories(name,name_ur,sort) values(?,?,?)')
    .run(b.name.trim(), b.name_ur || '', db.prepare('select coalesce(max(sort),-1)+1 n from categories').get().n).lastInsertRowid;
  logEvent('menu', `Naya section: ${b.name.trim()}`);
  res.json({ id });
});
admin.put('/categories/:id', (req, res) => {
  const o = db.prepare('select * from categories where id=?').get(req.params.id);
  updateRow('categories', req.params.id, req.body || {}, ['name', 'name_ur', 'sort', 'active']);
  const n = db.prepare('select * from categories where id=?').get(req.params.id);
  if (o && n) ['name', 'active'].forEach(f => { if (o[f] !== n[f]) logEvent('menu', `Section "${o.name}": ${f} ${o[f]} -> ${n[f]}`); });
  res.json({ ok: true });
});
admin.delete('/categories/:id', (req, res) => {
  const o = db.prepare('select * from categories where id=?').get(req.params.id);
  db.prepare('update categories set deleted=1 where id=?').run(req.params.id);
  if (o) logEvent('menu', `Section delete: ${o.name}`);
  res.json({ ok: true });
});

admin.post('/items', (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim() || !b.category_id) return res.status(400).json({ error: 'Item ka naam likhein' });
  db.transaction(() => {
    const id = db.prepare('insert into items(category_id,name,grp,details,sort) values(?,?,?,?,?)')
      .run(b.category_id, b.name.trim(), b.grp || '', b.details || '', nextSort('items', 'category_id', b.category_id)).lastInsertRowid;
    const vs = Array.isArray(b.variants) && b.variants.length ? b.variants : [{ label: '', price: 0 }];
    vs.forEach((v, i) => db.prepare('insert into variants(item_id,label,price,cost,sort) values(?,?,?,?,?)').run(id, v.label || '', int(v.price), int(v.cost), i));
    logEvent('menu', `Naya item: ${b.name.trim()} (${vs.map(v => `${v.label || '-'} Rs${int(v.price)}`).join(', ')})`);
    res.json({ id });
  })();
});
admin.put('/items/:id', (req, res) => {
  const o = db.prepare('select * from items where id=?').get(req.params.id);
  updateRow('items', req.params.id, req.body || {}, ['name', 'grp', 'details', 'sort', 'active', 'category_id']);
  const n = db.prepare('select * from items where id=?').get(req.params.id);
  if (o && n) ['name', 'grp', 'details', 'active'].forEach(f => { if (o[f] !== n[f]) logEvent('menu', `Item "${o.name}": ${f} ${o[f]} -> ${n[f]}`); });
  res.json({ ok: true });
});
admin.delete('/items/:id', (req, res) => {
  const o = db.prepare('select * from items where id=?').get(req.params.id);
  db.prepare('update items set deleted=1 where id=?').run(req.params.id);
  if (o) logEvent('menu', `Item delete: ${o.name}`);
  res.json({ ok: true });
});

admin.post('/items/:id/variants', (req, res) => {
  const b = req.body || {};
  const it = db.prepare('select name from items where id=?').get(req.params.id);
  const id = db.prepare('insert into variants(item_id,label,price,cost,sort) values(?,?,?,?,?)')
    .run(req.params.id, b.label || '', int(b.price), int(b.cost), nextSort('variants', 'item_id', req.params.id)).lastInsertRowid;
  logEvent('menu', `Naya size: ${it ? it.name : '?'} (${b.label || '-'}) Rs${int(b.price)}`);
  res.json({ id });
});

// Cost baad mein daalne par: jin purani lines ki cost 0 thi wahi bharte hain (jo pehle se cost ke sath thin wo nahi chhedte)
function backfillCost(v) {
  const rows = db.prepare(`select oi.id, oi.order_id from order_items oi join orders o on o.id=oi.order_id
    where oi.item_name=? and oi.variant_label=? and coalesce(oi.cost,0)=0 and o.status='done'`).all(v.item_name, v.label || '');
  if (!rows.length) return 0;
  const ids = [...new Set(rows.map(r => r.order_id))];
  db.transaction(() => {
    ids.forEach(oid => {
      const old = loadOrder(oid);
      if (old.queued) enqueueOrder(old, true, true);
      db.prepare('update order_items set cost=? where id in (' + rows.filter(r => r.order_id === oid).map(r => r.id).join(',') + ')').run(v.cost);
      const items = db.prepare('select qty,cost from order_items where order_id=?').all(oid);
      const cost = items.reduce((a, i) => a + i.qty * (i.cost || 0), 0);
      db.prepare('update orders set cost=?, profit=subtotal-discount-?, uid=? where id=?').run(cost, cost, uuid(), oid);
      if (old.queued) enqueueOrder(loadOrder(oid), false);
    });
  })();
  syncSoon();
  return ids.length;
}
admin.put('/variants/:id', (req, res) => {
  const b = { ...req.body };
  if (b.price !== undefined) b.price = int(b.price);
  if (b.cost !== undefined) b.cost = int(b.cost);
  const q = 'select v.*, i.name item_name from variants v join items i on i.id=v.item_id where v.id=?';
  const o = db.prepare(q).get(req.params.id);
  updateRow('variants', req.params.id, b, ['label', 'price', 'cost', 'sort', 'active']);
  const n = db.prepare(q).get(req.params.id);
  if (o && n) {
    const ch = ['label', 'price', 'cost', 'active'].filter(f => o[f] !== n[f]).map(f => `${f} ${o[f]} -> ${n[f]}`);
    if (ch.length) logEvent(ch.some(c => c.startsWith('price') || c.startsWith('cost')) ? 'price_cost' : 'menu', `${o.item_name} (${o.label || '-'}): ${ch.join(', ')}`);
  }
  if (n && n.cost > 0) { const k = backfillCost(n); if (k) logEvent('price_cost', `${n.item_name} (${n.label || '-'}): ${k} purane orders ki cost (0 thi) ab Rs ${n.cost} se update`); }
  res.json({ ok: true });
});
admin.delete('/variants/:id', (req, res) => {
  const o = db.prepare('select v.*, i.name item_name from variants v join items i on i.id=v.item_id where v.id=?').get(req.params.id);
  db.prepare('update variants set deleted=1 where id=?').run(req.params.id);
  if (o) logEvent('menu', `Size delete: ${o.item_name} (${o.label || '-'})`);
  res.json({ ok: true });
});

// Delete kiye hue menu (wapas lane ke liye)
admin.get('/trash', (req, res) => {
  res.json({
    categories: db.prepare('select id,name from categories where deleted=1 order by name').all(),
    items: db.prepare('select i.id,i.name,i.grp,c.name cat from items i join categories c on c.id=i.category_id where i.deleted=1 and c.deleted=0 order by c.sort,i.name').all(),
    variants: db.prepare('select v.id,v.label,v.price,i.name from variants v join items i on i.id=v.item_id where v.deleted=1 and i.deleted=0 order by i.name').all(),
  });
});
admin.post('/restore/:kind/:id', (req, res) => {
  const t = { categories: 'categories', items: 'items', variants: 'variants' }[req.params.kind];
  if (!t) return res.status(400).json({ error: 'Ghalat' });
  db.prepare(`update ${t} set deleted=0 where id=?`).run(req.params.id);
  const r = db.prepare(`select * from ${t} where id=?`).get(req.params.id);
  if (r) logEvent('menu', `Wapas laya: ${r.name || r.label || r.id}`);
  res.json({ ok: true });
});

admin.post('/orders/:id/cancel', (req, res) => {
  const o = loadOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order nahi mila' });
  if (o.status === 'cancelled') return res.json({ ok: true });
  if (editLeft(o) <= 0) return res.status(403).json({ error: `Cancel sirf order ke ${S_editMin()} minute tak ho sakta hai. Ab nahi ho sakta.` });
  db.transaction(() => {
    db.prepare("update orders set status='cancelled' where id=?").run(o.id);
    if (o.queued) enqueueOrder(o, true);   // Sheet mein ulti (negative) entry, purani row nahi badalti
    logEvent('cancel', `Order #${o.order_no} (${o.business_date}) cancel, Rs ${o.total}`);
  })();
  syncSoon();
  res.json({ ok: true });
});


// ----- stock (admin) -----
admin.get('/stock', (req, res) => {
  const list = stockList();
  const moves = db.prepare(`select m.id,m.item_id,i.name,i.unit,m.qty,m.kind,m.date,m.note from stock_moves m join stock_items i on i.id=m.item_id where m.kind!='out' order by m.id desc limit 20`).all();
  const preps = db.prepare('select id,name,unit,sub_unit,sub_per,prep_yield from stock_items where active=1 and is_prep=1').all()
    .map(p => ({ ...p, rows: db.prepare('select item_id,qty from prep_recipes where prep_id=?').all(p.id) }));
  res.json({ items: list, moves, preps });
});
// Shuru ka stock / ginti: sab items aik saath (sirf jin mein number likha ho)
admin.post('/stock/count-bulk', (req, res) => {
  const rows = Array.isArray((req.body || {}).rows) ? req.body.rows : [];
  const cur = Object.fromEntries(stockList().map(i => [i.id, i.bal])), now = fmtDT(new Date()), bd = businessDate();
  let n = 0;
  db.transaction(() => rows.forEach(r => {
    if (r.count === '' || r.count == null || !(int(r.item_id) in cur) || num(r.count) < 0) return;
    const diff = r2(num(r.count) - cur[int(r.item_id)]);
    if (diff !== 0) { db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,?,?)").run(int(r.item_id), diff, bd, `Ginti: ${cur[int(r.item_id)]} -> ${num(r.count)}`, now); n++; }
  }))();
  stockAlertCheck(); syncSoon();
  res.json({ ok: true, changed: n });
});
admin.post('/stock/items', (req, res) => {
  const b = req.body || {}, name = String(b.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Naam likhein' });
  const ex = db.prepare('select id from stock_items where active=1 and lower(name)=lower(?)').get(name);
  if (ex) return res.status(400).json({ error: 'Ye item pehle se hai' });
  const unit = String(b.unit || 'piece').slice(0, 12), now = fmtDT(new Date());
  const id = db.prepare('insert into stock_items(name,unit,min_level,grp,created_at) values(?,?,?,?,?)').run(name, unit, Math.max(0, num(b.min_level)), String(b.grp || '').slice(0, 40), now).lastInsertRowid;
  const open = num(b.opening);
  if (open > 0) db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,'Shuru ka stock',?)").run(id, open, businessDate(), now);
  res.json({ id });
});
admin.put('/stock/items/:id', (req, res) => {
  const b = req.body || {};
  if (b.min_level !== undefined) db.prepare('update stock_items set min_level=? where id=?').run(Math.max(0, num(b.min_level)), req.params.id);
  if (b.unit) db.prepare('update stock_items set unit=? where id=?').run(String(b.unit).slice(0, 12), req.params.id);
  if (b.alert_days !== undefined) db.prepare('update stock_items set alert_days=? where id=?').run(Math.min(60, Math.max(0, num(b.alert_days))), req.params.id);
  if (b.min_level !== undefined || b.alert_days !== undefined) setImmediate(stockAlertCheck);
  if (b.rate !== undefined) db.prepare('update stock_items set rate=? where id=?').run(Math.max(0, num(b.rate)), req.params.id);
  if (b.pack_size !== undefined && String(b.confirm_pin || '') !== getSettings().admin_pin) return res.status(403).json({ error: 'Pack size badalne ke liye Admin PIN ghalat hai' });
  if (b.pack_size !== undefined) db.prepare('update stock_items set pack_size=?, pack_name=? where id=?').run(Math.max(0, num(b.pack_size)), String(b.pack_name || '').slice(0, 30), req.params.id);
  res.json({ ok: true });
});
admin.delete('/stock/items/:id', (req, res) => {
  const used = db.prepare('select (select count(*) from recipes where item_id=?) + (select count(*) from prep_recipes where item_id=?) n').get(req.params.id, req.params.id).n;
  if (used) return res.status(400).json({ error: 'Ye saman recipes mein istemal hota hai, hataya nahi ja sakta' });
  db.prepare('update stock_items set active=0 where id=?').run(req.params.id);
  db.prepare('delete from recipes where item_id=?').run(req.params.id);
  res.json({ ok: true });
});
// Aaya hua saman. amount ho to Kharcha mein bhi likha jata hai (dono jagah se same cheez)
// Menu item (variant) se stock item dhoondo, na ho to khud bana do (recipe: 1 sale = 1 piece)
function stockForVariant(vid) {
  const v = db.prepare('select v.id,v.label,i.name,c.name cat from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id where v.id=?').get(vid);
  if (!v) return { err: 'Menu item nahi mila' };
  const rec = db.prepare('select r.item_id from recipes r join stock_items s on s.id=r.item_id and s.active=1 and s.is_prep=0 where r.variant_id=? and r.away=0').all(v.id);
  if (rec.length > 1) return { err: 'Is item ki recipe mein kai cheezein hain. Un ka stock "Raw saman" se alag daalein.' };
  if (rec.length === 1) return { id: rec[0].item_id };
  const nm = (v.name + (v.label ? ' ' + v.label : '')).slice(0, 60);
  let it = db.prepare('select id from stock_items where active=1 and lower(name)=lower(?)').get(nm);
  if (!it) it = { id: db.prepare("insert into stock_items(name,unit,grp,created_at) values(?,'piece',?,?)").run(nm, v.cat, fmtDT(new Date())).lastInsertRowid };
  db.prepare('delete from recipes where variant_id=?').run(v.id);
  db.prepare('insert into recipes(variant_id,item_id,qty) values(?,?,1)').run(v.id, it.id);
  return { id: it.id };
}
admin.post('/stock/in', (req, res) => {
  const b = req.body || {};
  if (b.variant_id) { const r = stockForVariant(b.variant_id); if (r.err) return res.status(400).json({ error: r.err }); b.item_id = r.id; }
  const it = db.prepare('select * from stock_items where id=? and active=1').get(b.item_id);
  if (!it) return res.status(400).json({ error: 'Item chunein' });
  const qty = num(b.packs) > 0 && it.pack_size > 0 ? r2(num(b.packs) * it.pack_size) : num(b.qty);
  if (qty <= 0) return res.status(400).json({ error: 'Miqdar likhein' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : businessDate(), now = fmtDT(new Date());
  const amount = int(b.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'Kitne Rs ka aaya, ye likhna zaroori hai' });
  db.transaction(() => {
    let eid = null;
    if (amount > 0) {
      const uidv = uuid(), sync = syncOn(), note = String(b.note || '').trim() || `${it.name} ${qty} ${it.unit}`;
      eid = db.prepare('insert into expenses(uid,date,category,note,amount,queued,created_at) values(?,?,?,?,?,?,?)').run(uidv, date, 'Saman (stock)', note.slice(0, 200), amount, sync ? 1 : 0, now).lastInsertRowid;
      if (sync) enqueue('expenses', uidv, [uidv, date, 'Saman (stock)', note.slice(0, 200), amount, now]);
      logEvent('expense', `${date} Saman (stock): Rs ${amount} (${note})`);
    }
    db.prepare("insert into stock_moves(item_id,qty,kind,expense_id,date,note,created_at) values(?,?,'in',?,?,?,?)").run(it.id, qty, eid, date, amount > 0 ? `Rs ${amount}` : '', now);
    if (amount > 0) db.prepare('update stock_items set rate=? where id=?').run(amount / qty, it.id);   // nayi qeemat
  })();
  syncSoon(); stockAlertCheck();
  res.json({ ok: true });
});
// Ginti: asal bacha hua likhein, farq khud adjust ho jata hai
admin.post('/stock/count', (req, res) => {
  const b = req.body || {}, it = db.prepare('select * from stock_items where id=? and active=1').get(b.item_id);
  if (!it) return res.status(400).json({ error: 'Item chunein' });
  if (b.count === '' || b.count == null || num(b.count) < 0) return res.status(400).json({ error: 'Bacha hua likhein' });
  const cur = stockList().find(x => x.id === it.id).bal, diff = r2(num(b.count) - cur);
  if (diff !== 0) db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,?,?)").run(it.id, diff, businessDate(), `Ginti: ${cur} -> ${num(b.count)}`, fmtDT(new Date()));
  stockAlertCheck(); syncSoon();
  res.json({ ok: true });
});
admin.get('/recipes', (req, res) => {
  const vs = db.prepare(`select v.id,v.label,i.name,c.name cat from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id where v.active=1 and i.active=1 and v.deleted=0 and i.deleted=0 and c.deleted=0 order by c.sort,c.id,i.sort,i.id,v.sort,v.id`).all();
  const rec = db.prepare('select r.variant_id v,r.item_id i,r.qty q,r.away a from recipes r').all();
  const parts = db.prepare('select d.variant_id v,d.qty,d.slot,i.name,v.label from deal_parts d join variants v on v.id=d.part_vid join items i on i.id=v.item_id order by d.id').all();
  res.json({ variants: vs.map(v => ({ ...v, recipe: rec.filter(r => r.v === v.id).map(r => ({ item_id: r.i, qty: r.q, away: r.a })),
    parts: parts.filter(p => p.v === v.id).map(p => (p.slot ? `${p.slot} Pizza (shuru: ${p.name})` : `${p.qty} × ${p.name}${p.label ? ' ' + p.label : ''}`)) })) });
});
// Menu ki category se stock items + recipe (1 sale = 1 piece) ek click mein bana do (cold drinks wagera ke liye)
admin.post('/stock/from-menu', (req, res) => {
  const c = db.prepare('select * from categories where id=?').get((req.body || {}).category_id);
  if (!c) return res.status(400).json({ error: 'Category chunein' });
  const vs = db.prepare('select v.id,v.label,i.name from variants v join items i on i.id=v.item_id where i.category_id=? and v.active=1 and i.active=1 order by i.sort,i.id,v.sort,v.id').all(c.id);
  let made = 0, linked = 0; const now = fmtDT(new Date());
  db.transaction(() => vs.forEach(v => {
    const nm = (v.name + (v.label ? ' ' + v.label : '')).slice(0, 60);
    let it = db.prepare('select id from stock_items where active=1 and lower(name)=lower(?)').get(nm);
    if (!it) { it = { id: db.prepare("insert into stock_items(name,unit,grp,created_at) values(?,'piece',?,?)").run(nm, c.name, now).lastInsertRowid }; made++; }
    if (!db.prepare('select 1 from recipes where variant_id=?').get(v.id)) { db.prepare('insert into recipes(variant_id,item_id,qty) values(?,?,1)').run(v.id, it.id); linked++; }
  }))();
  res.json({ made, linked });
});
// Demand slip: pichle 7 din ki asal sale (orders + recipes) se roz ki khapat, N din ka saman - bacha hua = mangwana (pack mein)
function computeDemand(days) {
  const bd = businessDate(), U = dailyUsage(), nDays = U.days, rows = [];
  stockList().forEach(i => {
    const perDay = U.map[i.id] || 0, bal = Math.max(0, i.bal);
    let need = perDay * days - bal;
    if (i.oil && i.oil.remain <= days) need += i.oil.litres;   // fryer badalna in dinon mein: 16 aur chahiye
    if (i.daily_use > 0) need = i.daily_use;   // sabzi: roz aati hai, hamesha aik din ki tay miqdar
    if (perDay === 0 && (i.status === 'out' || i.status === 'low')) need = Math.max(need, i.pack_size || 1, i.min_level - bal);
    if (i.min_level > 0) need = Math.max(need, i.min_level + perDay * days - bal);
    if (need <= 1e-9) return;
    const packs = i.pack_size > 0 ? Math.ceil(need / i.pack_size - 1e-9) : null;
    rows.push({ name: i.name, grp: i.grp || 'Dusra', unit: i.unit, sub_unit: i.sub_unit, sub_per: i.sub_per, bal: r2(bal), per_day: Math.round(perDay * 1000) / 1000,
      need: Math.round(need * 1000) / 1000, packs, pack_size: i.pack_size, pack_name: i.pack_name, buy: packs ? r2(packs * i.pack_size) : Math.round(need * 100) / 100,
      cost: i.rate ? Math.round((packs ? packs * i.pack_size : need) * i.rate) : null, status: i.status, days_left: perDay > 0 ? Math.round(bal / perDay * 10) / 10 : null, id: i.id, rate: i.rate || 0,
      alert_days: i.alert_days, urg: i.daily_use > 0 ? 2 : bal <= 0 || i.status === 'out' ? 0 : i.status === 'low' ? 1 : 2,
      daily: (i.daily_use || 0) > 0, oil_note: i.oil && i.oil.remain <= days ? `+${i.oil.litres} fryer ke liye (badalna ~${i.oil.next})` : '' });   // 0 khatam, 1 zaroori, 2 kam zaroori
  });
  // Tarteeb: pehle khatam, phir zaroori (alert ke din se kam), phir kam zaroori; har hisse mein jo pehle khatam ho wo upar
  rows.sort((a, b) => a.urg - b.urg || (a.days_left ?? -1) - (b.days_left ?? -1) || a.name.localeCompare(b.name));
  return { days, based_on: nDays, date: bd, rows, total: rows.reduce((t, r) => t + (r.cost || 0), 0), no_rate: rows.filter(r => !r.rate).map(r => r.name), shop: getSettings().shop_name };
}
admin.get('/stock/demand', (req, res) => res.json(computeDemand(Math.min(30, Math.max(1, int(req.query.days, 3))))));
// Google Sheet ke liye khulasa (Events mein kind 'demand'): 3 din ke saman ka cash + kam/khatam saman kitne din ka
let lastDemandLine = '', lastDemandAt = 0;
function demandToSheet(force) {
  try {
    const d = computeDemand(3), fmt = n => 'Rs ' + Math.round(n).toLocaleString('en-PK');
    // Har saman aik line: HALAT ; Naam ; Kitne din ka bacha ; Price per pack ; Roz ki khapat  (Sheet mein alag columns)
    const ORD = { out: 0, low: 1, ok: 2, unset: 3 }, HAL = { out: 'KHATAM', low: 'KAM', ok: 'THEEK', unset: 'STOCK NAHI LIKHA' };
    const all = stockList().sort((a, b) => ORD[a.status] - ORD[b.status] || (a.days ?? 1e9) - (b.days ?? 1e9) || a.name.localeCompare(b.name));
    const amt = (i, v) => (i.sub_per && Math.abs(v) < 1 ? Math.round(v * i.sub_per) + ' ' + i.sub_unit : (Math.round(v * 100) / 100) + ' ' + i.unit);
    const cell = x => String(x).replace(/[;|]/g, ' ');
    const line = [`${fmt(d.total)} (3 din ka saman, ${d.rows.length} cheezein${d.no_rate.length ? ', ' + d.no_rate.length + ' ka rate nahi' : ''})`]
      .concat(all.map(i => [HAL[i.status], i.name,
        i.status === 'out' ? 'khatam (0)' : (i.days !== null ? '~' + (Math.round(i.days * 10) / 10) + ' din' : '—') + ' (' + amt(i, i.bal) + ' bacha)',
        i.rate ? fmt(i.rate * (i.pack_size || 1)) + ' / ' + (i.pack_size ? (i.pack_name || 'pack') : i.unit) : 'rate nahi',
        i.per_day ? amt(i, i.per_day) + ' / din' : '—'].map(cell).join(' ; '))).join(' || ');
    const sig = all.map(i => i.status + ':' + i.name).join(',');   // halat badle to foran, warna ghante mein aik dafa
    if (!force && sig === lastDemandLine && Date.now() - lastDemandAt < 60 * 60 * 1000) return;
    lastDemandLine = sig; lastDemandAt = Date.now();
    logEvent('demand', line.slice(0, 8000));
  } catch (e) { console.error('demand sheet', e.message); }
}
setTimeout(() => demandToSheet(true), 20000);
setInterval(() => demandToSheet(false), 30 * 60 * 1000);
// Recipes final hain (recipes-seed.js); admin se badli nahi ja saktin
// Recipe ki lagat: har saman ki qeemat (aakhri khareed ke rate se) + kul (Dine-in / Takeaway)
admin.get('/recipe-cost/:vid', (req, res) => {
  const vid = int(req.params.vid), v = db.prepare('select v.price,v.label,i.name from variants v join items i on i.id=v.item_id where v.id=?').get(vid);
  if (!v) return res.status(404).json({ error: 'Nahi mila' });
  const items = Object.fromEntries(db.prepare('select * from stock_items').all().map(i => [i.id, i]));
  const missing = new Set();
  const costOf = tot => Object.entries(tot).reduce((t, [id, q]) => { const it = items[id]; if (!it || !(it.rate > 0)) { if (it && q > 0) missing.add(it.name); return t; } return t + q * it.rate; }, 0);
  const one = (id, q) => { const it = items[id]; if (!it) return 0; if (!it.is_prep) return costOf({ [id]: q }); return costOf(stockNeed([], 'dinein', { [id]: q })); };
  const rows = db.prepare('select item_id,qty,away from recipes where variant_id=?').all(vid).map(r => {
    const it = items[r.item_id] || {};
    return { name: it.name || '?', qty: r.qty, unit: it.unit, sub_unit: it.sub_unit, sub_per: it.sub_per, rate: it.rate || 0, prep: !!it.is_prep, away: r.away, cost: Math.round(one(r.item_id, r.qty) * 100) / 100 };
  });
  db.prepare('select d.part_vid,d.qty,d.slot,i.name,v.label from deal_parts d join variants v on v.id=d.part_vid join items i on i.id=v.item_id where d.variant_id=? order by d.id').all(vid).forEach(p => {
    const l = [{ vid: p.part_vid, qty: p.qty }];
    rows.push({ name: `${p.slot ? p.slot + ' Pizza (' + p.name + ')' : p.name + (p.label ? ' ' + p.label : '')}`, qty: p.qty, unit: 'deal', part: true,
      cost: Math.round(costOf(stockNeed(l, 'dinein')) * 100) / 100, away_cost: Math.round(costOf(stockNeed(l, 'takeaway')) * 100) / 100 });
  });
  const awayTot = stockNeed([{ vid, qty: 1 }], 'takeaway');
  // Dine-in mein bottle ki ketchup: kharcha utne hi sachet jitna (stock se minus nahi hota)
  const ks = Object.values(items).find(i => i.name === 'Ketchup Sachet');
  const ketchup = ks && awayTot[ks.id] ? costOf({ [ks.id]: awayTot[ks.id] }) : 0;
  const dine = costOf(stockNeed([{ vid, qty: 1 }], 'dinein')) + ketchup, away = costOf(awayTot);
  const dcost = int(getSettings().delivery_cost_assumed, 200);
  res.json({ name: v.name, label: v.label, price: v.price, rows, dine: Math.round(dine), away: Math.round(away), deliv: Math.round(away + dcost),
    ketchup: Math.round(ketchup), dcost, missing: [...missing] });
});

// ----- expenses -----
admin.get('/expenses', (req, res) => {
  const from = req.query.from || businessDate(), to = req.query.to || from;
  res.json(db.prepare('select id,date,category,note,amount,created_at,batch from expenses where deleted=0 and date between ? and ? order by date desc,id desc').all(from, to));
});
admin.post('/expenses', (req, res) => {
  const b = req.body || {};
  const amount = int(b.amount);
  if (amount <= 0) return res.status(400).json({ error: 'Amount likhein' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : businessDate();
  const now = fmtDT(new Date()), category = String(b.category || 'Other').slice(0, 40), note = String(b.note || '').slice(0, 200);
  const sync = syncOn(), days = Math.min(30, Math.max(1, int(b.days, 1)));
  // Ikattha kharcha: kul raqam chuni date TAK pichle itne din par barabar baant di jati hai (jin dinon kharcha alag se nahi likha gaya)
  const batch = days > 1 ? uuid() : '', each = Math.floor(amount / days), extra = amount - each * days;
  const ins = db.prepare('insert into expenses(uid,date,category,note,amount,queued,created_at,batch) values(?,?,?,?,?,?,?,?)');
  let id = 0;
  db.transaction(() => { for (let k = 0; k < days; k++) {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - (days - 1) + k);
    const dt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const amt = each + (k === 0 ? extra : 0), nt = days > 1 ? `${note ? note + ' · ' : ''}${({ Salary: 'Salary', Rent: 'Rent', 'Bijli/Pani': 'Bill' })[category] || 'Ikattha kharcha'} ka hissa: ${days} din ka Rs ${amount} (${k + 1}/${days})`.slice(0, 200) : note, uidv = uuid();
    const r = ins.run(uidv, dt, category, nt, amt, sync ? 1 : 0, now, batch).lastInsertRowid; if (!id) id = r;
    if (sync) enqueue('expenses', uidv, [uidv, dt, category, nt, amt, now]);
  } })();
  logEvent('expense', `${date} ${category}: Rs ${amount}${days > 1 ? ` (${days} din par baanta)` : ''}${note ? ' (' + note + ')' : ''}`);
  syncSoon();
  res.json({ id, days });
});
admin.delete('/expenses/:id', (req, res) => {
  const e0 = db.prepare('select * from expenses where id=? and deleted=0').get(req.params.id);
  if (!e0) return res.json({ ok: true });
  // Ikattha kharcha ho to us ke saare din aik saath hatte hain
  const list = e0.batch ? db.prepare('select * from expenses where batch=? and deleted=0').all(e0.batch) : [e0];
  list.forEach(e => {
    db.prepare('update expenses set deleted=1 where id=?').run(e.id);
    db.prepare('delete from stock_moves where expense_id=?').run(e.id);
    db.prepare('delete from oil_changes where expense_id=?').run(e.id);   // oil wali entry hati to woh "oil badla" bhi
    if (e.queued) enqueue('expenses', e.uid + ':X', [e.uid + ':X', e.date, e.category, (e.note || '') + ' (deleted)', -e.amount, fmtDT(new Date())]);
  });
  const e = e0;
  logEvent('expense', `Kharcha delete: ${e.date} ${e.category} Rs ${list.reduce((t, x) => t + x.amount, 0)}${list.length > 1 ? ` (${list.length} din)` : ''}`);
  syncSoon();
  res.json({ ok: true });
});

// ----- reports -----
admin.get('/report', (req, res) => {
  const from = req.query.from || businessDate();
  const to = req.query.to || from;
  const A = [from, to];
  const W = "business_date between ? and ? and status='done'";
  const totals = db.prepare(`select count(*) n, coalesce(sum(total),0) total, coalesce(sum(subtotal),0) subtotal,
    coalesce(sum(discount),0) discount, coalesce(sum(delivery_charge),0) delivery, coalesce(sum(service_charge),0) service,
    coalesce(sum(cost),0) cost, coalesce(sum(profit),0) profit
    from orders where ${W}`).get(...A);
  totals.expenses = db.prepare('select coalesce(sum(amount),0) s from expenses where deleted=0 and date between ? and ?').get(...A).s;
  totals.net = totals.profit - totals.expenses;
  const dayRows = db.prepare(`select business_date d, count(*) n, sum(subtotal) subtotal, sum(total) total, sum(cost) cost, sum(profit) profit
    from orders where ${W} group by business_date`).all(...A);
  const ikByDay = {}; db.prepare("select date d, category c, sum(amount) s from expenses where deleted=0 and batch!='' and date between ? and ? group by date,category").all(...A).forEach(r => ((ikByDay[r.d] = ikByDay[r.d] || {})[r.c] = r.s));
  const expByDay = Object.fromEntries(db.prepare('select date d, sum(amount) s from expenses where deleted=0 and date between ? and ? group by date').all(...A).map(r => [r.d, r.s]));
  const days = {};
  dayRows.forEach(r => (days[r.d] = { ...r, expenses: 0 }));
  Object.entries(expByDay).forEach(([d, s]) => { days[d] = days[d] || { d, n: 0, subtotal: 0, total: 0, cost: 0, profit: 0, expenses: 0 }; days[d].expenses = s; days[d].split = ikByDay[d] || null; });
  const dayList = Object.values(days).sort((a, b) => (a.d < b.d ? 1 : -1)).map(x => ({ ...x, net: x.profit - x.expenses }));
  res.json({
    from, to, now: businessDate(), totals, days: dayList,
    missing_cost: db.prepare('select count(*) n from stock_items s where s.active=1 and s.is_prep=0 and coalesce(s.rate,0)<=0 and (s.id in (select item_id from recipes) or s.id in (select item_id from prep_recipes))').get().n,
    by_type: db.prepare(`select type, count(*) n, sum(total) total, sum(profit) profit from orders where ${W} group by type`).all(...A),
    gifts: db.prepare(`select coalesce(gift_by,'-') by_whom, count(*) n, sum(subtotal) value, sum(cost) cost from orders where ${W} and payment='Gift' group by gift_by`).all(...A),
    by_payment: db.prepare(`select payment, count(*) n, sum(total) total from orders where ${W} group by payment`).all(...A),
    riders: db.prepare(`select rider, count(*) n, sum(total) total, sum(delivery_charge) delivery from orders where ${W} and type='delivery' group by rider`).all(...A),
    top: db.prepare(`select oi.item_name, oi.variant_label, sum(oi.qty) qty, sum(oi.qty*oi.price) amount, sum(oi.qty*oi.cost) cost, sum(oi.qty*(oi.price-oi.cost)) profit
      from order_items oi join orders o on o.id=oi.order_id where o.business_date between ? and ? and o.status='done'
      group by oi.item_name, oi.variant_label order by qty desc`).all(...A),
    // Orders ki list: sirf aik business din (5 baje counter reset tak aik din). Default: is muddat ka aakhri din jis mein orders hon
    ...(() => {
      const order_days = db.prepare('select distinct business_date d from orders where business_date between ? and ? order by d desc').all(...A).map(x => x.d);
      const ord_day = order_days.includes(req.query.ord_day) ? req.query.ord_day : (order_days[0] || to);
      return { order_days, ord_day, orders: db.prepare(`select id,order_no,business_date,type,table_no,customer_name,rider,total,profit,payment,gift_by,status,printed,created_at
        from orders where business_date=? order by id desc`).all(ord_day).map(o => ({ ...o, cancel_left: o.status === 'done' ? editLeft(o) : 0 })) };
    })(),
  });
});
admin.get('/events', (req, res) =>
  res.json(db.prepare('select ts,kind,detail from events order by id desc limit 200').all()));

// ----- Google Sheet sync status -----
admin.get('/sync', (req, res) => {
  const S = getSettings();
  res.json({
    configured: !!(S.sheet_url && S.sheet_key), since: S.sync_since, last_ok: S.last_sync_ok, last_error: S.last_sync_error,
    pending: db.prepare('select count(*) n from outbox where synced_at is null').get().n, golive_done: S.golive_done || '',
  });
});
admin.post('/sync/now', async (req, res) => res.json(await syncOnce()));

// ----- Software update (GitHub se) -----
admin.get('/update/check', async (req, res) => {
  try {
    if (!hasGit()) return res.status(400).json({ error: 'Is folder ka GitHub se link nahi hai. setup.bat chalayen.' });
    const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    await run('git', ['fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`, '--quiet']);   // refspec khud dete hain, config par bharosa nahi
    const behind = parseInt(await run('git', ['rev-list', '--count', `HEAD..origin/${branch}`])) || 0;
    const changes = behind ? (await run('git', ['log', `HEAD..origin/${branch}`, '--pretty=%s', '-n', '10'])).split('\n') : [];
    res.json({ ...(await versionInfo()), behind, changes });
  } catch (e) { res.status(500).json({ error: friendlyGitError(e.message) }); }
});
admin.post('/update', async (req, res) => {
  try {
    if (!hasGit()) return res.status(400).json({ error: 'Is folder ka GitHub se link nahi hai. setup.bat chalayen.' });
    const dirty = (await run('git', ['status', '--porcelain', '--untracked-files=no'])).split('\n').filter(l => l && !/package-lock\.json$/.test(l)).join('\n');
    if (dirty) return res.status(400).json({ error: 'Is PC par code files mein local tabdeeli hai, update nahi ho sakta:\n' + dirty.slice(0, 200) });
    await run('git', ['checkout', '--', 'package-lock.json']).catch(() => {});   // npm install ise badal deta hai
    const before = await run('git', ['rev-parse', 'HEAD']);
    await dailyBackup();
    const br = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    const out = await run('git', ['pull', '--ff-only', 'origin', br]);
    const after = await run('git', ['rev-parse', 'HEAD']);
    if (before === after) return res.json({ ok: true, updated: false, message: 'Pehle se naya version hai.' });
    const changed = (await run('git', ['diff', '--name-only', before, after])).split('\n');
    let npmNote = '';
    if (changed.some(f => f === 'package.json' || f === 'package-lock.json')) {
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-package-lock'], { shell: process.platform === 'win32', timeout: 170000 });
      npmNote = ' (packages bhi update hue)';
    }
    logEvent('update', `Software update: ${before.slice(0, 7)} -> ${after.slice(0, 7)}`);
    res.json({ ok: true, updated: true, message: 'Update ho gaya' + npmNote + '. Software dobara chal raha hai, 5 second baad page refresh karein.' });
    setTimeout(() => process.exit(3), 1000);   // run-server.bat dobara chala deta hai
  } catch (e) { res.status(500).json({ error: friendlyGitError(e.message) }); }
});
function friendlyGitError(m) {
  if (/ENOENT|not recognized|spawn git/i.test(m)) return 'Git install nahi hai. setup.bat chalayen.';
  if (/could not resolve|unable to access|network|timed out|Failed to connect/i.test(m)) return 'Internet nahi hai ya GitHub tak nahi pohnch raha.';
  if (/authentication|403|401|denied|not found/i.test(m)) return 'GitHub login/permission ka masla. Repo ka access check karein.';
  return m;
}

app.use('/api/admin', admin);

// Aik baar: 18 Oct 2026 se pehle ke test (fake) orders, kharche aur log saaf. Pehle backup banta hai.
function purgeOldTestData() {
  try {
    if (getSettings().purge_fake_done) return;
    const CUT = '2026-10-18', now = fmtDT(new Date());
    const n = db.prepare('select count(*) n from orders where business_date<?').get(CUT).n
      + db.prepare('select count(*) n from expenses where date<?').get(CUT).n + db.prepare('select count(*) n from events where ts<?').get(CUT).n;
    if (n) {
      fs.mkdirSync(BACKUPS, { recursive: true });
      db.prepare('VACUUM INTO ?').run(path.join(BACKUPS, `before-purge-${now.replace(/[: ]/g, '-')}.db`));
      db.transaction(() => {
        // jo Sheet par nahi gaya wo bhi na jaye (journal dobara na bheje)
        db.prepare("update outbox set synced_at=? where synced_at is null and kind in ('orders','items') and substr(uid,1,36) in (select uid from orders where business_date<?)").run(now, CUT);
        db.prepare("update outbox set synced_at=? where synced_at is null and kind='expenses' and substr(uid,1,36) in (select uid from expenses where date<?)").run(now, CUT);
        db.prepare("update outbox set synced_at=? where synced_at is null and kind='events' and uid in (select uid from events where ts<?)").run(now, CUT);
        db.prepare('delete from order_items where order_id in (select id from orders where business_date<?)').run(CUT);
        db.prepare('delete from orders where business_date<?').run(CUT);
        db.prepare('delete from expenses where date<?').run(CUT);
        db.prepare('delete from events where ts<?').run(CUT);
      })();
      logEvent('setting', `Purane test records saaf kiye gaye (${n}), backup bana liya gaya`);
    }
    setSetting('purge_fake_done', now);
  } catch (e) { console.error('purge:', e.message); }
}
purgeOldTestData();
startupCheck();
// Ghalti se (purane hard-delete se) gayi "Deal Rs 1850" aik baar wapas daalna
try {
  if (!getSettings().restore_1850_done) {
    if (!db.prepare("select 1 from items where name='Deal Rs 1850'").get()) {
      const c = db.prepare("select id from categories where lower(name) like '%deal%' and deleted=0 order by sort,id").get();
      if (c) {
        const id = db.prepare("insert into items(category_id,name,grp,details,sort) values(?,?,?,?,?)").run(c.id, 'Deal Rs 1850', 'Deal Bar', '1 Large Pizza, 1 Small Pizza, 1 Ltr Drink', -1).lastInsertRowid;
        db.prepare("insert into variants(item_id,label,price,cost,sort) values(?,'',1850,0,0)").run(id);
        logEvent('menu', 'Deal Rs 1850 wapas daali gayi (update se)');
      }
    }
    setSetting('restore_1850_done', fmtDT(new Date()));
  }
} catch (e) { console.error('restore1850', e.message); }

// Stock v2 aik baar: menu ki spelling, saman ki list, Dough, sab recipes aur deals ke hisse. Pehle backup.
function seedStockV2() {
  try {
    if (getSettings().stock_v2_done) return;
    const R = require('./recipes-seed'), now = fmtDT(new Date()), miss = [];
    if (db.prepare('select count(*) n from variants').get().n === 0) return;
    fs.mkdirSync(BACKUPS, { recursive: true });
    db.prepare('VACUUM INTO ?').run(path.join(BACKUPS, `before-stock-v2-${now.replace(/[: ]/g, '-')}.db`));
    db.transaction(() => {
      R.RENAMES.forEach(([a, b]) => db.prepare('update items set name=? where name=?').run(b, a));
      // Cold drink: sab se choti 350ml (250ml ab nahi). Qeemat wahi rehti hai, admin se check kar lein
      db.prepare(`select v.id,v.item_id from variants v join items i on i.id=v.item_id where lower(i.name) like '%drink%' and replace(lower(v.label),' ','') in ('250ml','330ml') and v.deleted=0`).all().forEach(v => {
        if (!db.prepare("select 1 from variants where item_id=? and replace(lower(label),' ','')='350ml' and deleted=0").get(v.item_id)) db.prepare("update variants set label='350ml' where id=?").run(v.id);
        else db.prepare('update variants set deleted=1 where id=?').run(v.id);
      });
      db.prepare("update stock_items set name=replace(replace(name,'250ml','350ml'),'250 ml','350ml') where lower(name) like '%drink%250%ml%'").run();
      db.prepare("update items set details=replace(details,'330ml Drink','350ml Drink') where details like '%330ml Drink%'").run();
      const ids = {};
      const findItem = n => db.prepare('select * from stock_items where active=1 and lower(name)=lower(?)').get(n);
      R.ITEMS.forEach(([name, unit, su, sp, grp, pk, pkn]) => {
        const ex = findItem(name);
        if (ex && ex.unit === unit) { db.prepare('update stock_items set sub_unit=?, sub_per=?, pack_size=?, pack_name=? where id=?').run(su, sp, pk || 0, pkn || '', ex.id); ids[name] = { id: ex.id, sp }; return; }
        const nm = ex ? `${name} (${unit})` : name;
        ids[name] = { id: db.prepare('insert into stock_items(name,unit,grp,sub_unit,sub_per,pack_size,pack_name,created_at) values(?,?,?,?,?,?,?,?)').run(nm, unit, grp, su, sp, pk || 0, pkn || '', now).lastInsertRowid, sp };
      });
      const dEx = findItem(R.DOUGH.name);
      const dId = dEx ? dEx.id : db.prepare("insert into stock_items(name,unit,grp,sub_unit,sub_per,is_prep,prep_yield,created_at) values(?,'kg','Raw saman','g',1000,1,?,?)").run(R.DOUGH.name, R.DOUGH.yield, now).lastInsertRowid;
      db.prepare('update stock_items set is_prep=1, prep_yield=?, sub_unit=?, sub_per=? where id=?').run(R.DOUGH.yield, 'g', 1000, dId);
      ids[R.DOUGH.name] = { id: dId, sp: 1000 };
      const conv = (n, q) => (ids[n].sp ? q / ids[n].sp : q);
      db.prepare('delete from prep_recipes where prep_id=?').run(dId);
      Object.entries(R.DOUGH.rows).forEach(([n, q]) => db.prepare('insert into prep_recipes(prep_id,item_id,qty) values(?,?,?)').run(dId, ids[n].id, conv(n, q)));
      const findV = (name, label) => db.prepare(`select v.id from variants v join items i on i.id=v.item_id where lower(i.name)=lower(?) and v.label=? and v.deleted=0 and i.deleted=0`).get(name, label);
      R.recipes().forEach(r => {
        const v = findV(r.name, r.label); if (!v) { miss.push(r.name + (r.label ? ' ' + r.label : '')); return; }
        db.prepare('delete from recipes where variant_id=?').run(v.id);
        const ins = db.prepare('insert or replace into recipes(variant_id,item_id,qty,away) values(?,?,?,?)');
        Object.entries(r.rows).forEach(([n, q]) => { if (q) ins.run(v.id, ids[n].id, conv(n, q), 0); });
        Object.entries(r.away).forEach(([n, q]) => { if (q) ins.run(v.id, ids[n].id, conv(n, q), 1); });
      });
      // Deals: details ("1 Large Pizza, 2 Zinger Burger, 1 Ltr Drink") se hisse
      const SZ = { large: 'L', medium: 'M', small: 'S' };
      db.prepare(`select v.id, i.name, i.details from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id
        where lower(c.name) like '%deal%' and v.deleted=0 and i.deleted=0`).all().forEach(d => {
        db.prepare('delete from deal_parts where variant_id=?').run(d.id);
        const ins = db.prepare('insert into deal_parts(variant_id,part_vid,qty,slot) values(?,?,?,?)');
        (d.details || '').split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
          const m = part.match(/^(\d+(?:\.\d+)?)\s*(.*)$/); if (!m) { miss.push(`${d.name}: ${part}`); return; }
          const n = Number(m[1]), rest = m[2].trim();
          const pm = rest.match(/^(large|medium|small)\s+pizza/i);
          if (pm) { const sz = SZ[pm[1].toLowerCase()], f = findV('Fajita', sz); if (!f) { miss.push(`${d.name}: ${part}`); return; } for (let k = 0; k < n; k++) ins.run(d.id, f.id, 1, sz); return; }
          const dm = rest.match(/^(ltr|ml)\s*drink/i);
          if (dm) {
            const want = (m[1] + (dm[1].toLowerCase() === 'ltr' ? ' ltr' : 'ml')).replace(/\s+/g, '').toLowerCase();
            const v = db.prepare(`select v.id,v.label from variants v join items i on i.id=v.item_id where lower(i.name) like '%drink%' and v.deleted=0 and i.deleted=0`).all().find(x => x.label.replace(/\s+/g, '').toLowerCase() === want);
            if (v) ins.run(d.id, v.id, 1, ''); else miss.push(`${d.name}: ${part}`);
            return;
          }
          const names = [rest, rest.replace(/\s+burger$/i, '')];
          for (const nm of names) {
            const pc = findV(nm, `${n} pcs`); if (pc) { ins.run(d.id, pc.id, 1, ''); return; }
            const one = findV(nm, ''); if (one) { ins.run(d.id, one.id, n, ''); return; }
          }
          miss.push(`${d.name}: ${part}`);
        });
      });
    })();
    logEvent('setting', 'Stock v2: recipes, Dough aur deals ke hisse lag gaye' + (miss.length ? '. Nahi mile: ' + miss.join(', ') : ''));
    if (miss.length) console.log('Stock v2 - nahi mile:', miss.join(' ; '));
    setSetting('stock_v2_done', now);
    setSetting('coat_maida_done', now);   // naye database ki recipes mein coating pehle se hai
  } catch (e) { console.error('stock v2:', e.message); }
}
seedStockV2();
// Pack size theek (owner, 3 Nov): Maida thela 50kg, Nuggets 50, F1/F2 aik aik. Sirf purani default value ho to badlo
try {
  if (!getSettings().stock_v2b_done) {
    const up = db.prepare('update stock_items set pack_size=?, pack_name=? where name=? and pack_size=?');
    up.run(50, 'Thela 50kg', 'Maida', 0); 
    up.run(1, 'Piece', 'F1 Packing', 0); up.run(1, 'Piece', 'F2 Packing', 0);
    setSetting('stock_v2b_done', fmtDT(new Date()));
  }
} catch (e) { console.error('stock v2b', e.message); }
// Shuru ka stock (owner ki ginti, 4 Nov 2026 raat). Aik hi baar: har item ka stock is ginti par set (farq "Ginti" ki tarah)
try {
  if (!getSettings().opening_nov4_done) {
    const OPEN = { "Young's Creme Mayo": 4.75, Sugar: 1, 'Butter Paper': 400, 'Burger Bun': 34, 'Eka Powder': 0.08, 'Saf Instant': 0,
      'Everyday Milk Powder': 0, 'Iodine Salt': 0.1, 'Vanilla Powder': 0.29, Macaroni: 0.3, 'Olper Milk': 0.68, 'Sweet Corn': 0, Olive: 0.5,
      'Boneless Thai': 44, Wings: 0, 'F1 Packing': 10, 'F2 Packing': 20, 'Ketchup Sachet': 400, 'Plain Paratha': 26, 'Real Wardha': 0,
      'Tortilla Bread': 0, 'Shawarma Bread': 0, Maida: 10, Oil: 2, Anda: 20, Sausage: 0.39, 'Top Cow Cheese': 6.48, 'Shredded 70/30 Cheese': 0.6,
      'Seekh Kabab': 40, Nuggets: 115, 'Hot Shot': 40, 'Burger Cheese Slice': 30, 'Pizza Chicken': 8.55, 'Chicken Patty': 14, 'Chapli Patty': 6,
      Fries: 2.65, 'Food Bag': 450, 'Pizza Box S': 18, 'Pizza Box M': 36, 'Pizza Box L': 50, 'Lazania Strip': 8, Foil: 0, 'Zestful Chicken Strips': 0 };
    const cur = Object.fromEntries(stockList().map(i => [i.name, i])), now = fmtDT(new Date()), bd = businessDate();
    db.transaction(() => Object.entries(OPEN).forEach(([n, q]) => {
      const it = cur[n]; if (!it) return;
      db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,?,?)").run(it.id, r2(q - it.bal), bd, 'Shuru ka stock (4 Nov ginti)', now);
    }))();
    setSetting('opening_nov4_done', now);
    logEvent('setting', 'Shuru ka stock (4 Nov ginti) daal diya gaya');
    setImmediate(stockAlertCheck);
  }
} catch (e) { console.error('opening stock', e.message); }
// Coating maida (wings 100 g, boneless thai 250 g har piece) purane database ki recipes mein aik baar
try {
  if (!getSettings().coat_maida_done) {
    const COAT = require('./recipes-seed').COAT, id = n => (db.prepare('select id,sub_per from stock_items where name=? and active=1').get(n) || {});
    const maida = id('Maida');
    if (maida.id) db.transaction(() => Object.entries(COAT).forEach(([n, g]) => {
      const it = id(n); if (!it.id) return;
      db.prepare('select variant_id v,qty from recipes where item_id=? and away=0').all(it.id).forEach(r => {
        const add = r.qty * g / (maida.sub_per || 1000);
        const ex = db.prepare('select qty from recipes where variant_id=? and item_id=? and away=0').get(r.v, maida.id);
        if (ex) db.prepare('update recipes set qty=? where variant_id=? and item_id=? and away=0').run(ex.qty + add, r.v, maida.id);
        else db.prepare('insert into recipes(variant_id,item_id,qty,away) values(?,?,?,0)').run(r.v, maida.id, add);
      });
    }))();
    setSetting('coat_maida_done', fmtDT(new Date()));
  }
} catch (e) { console.error('coat maida', e.message); }
// Nuggets ka pack 35 hi hai (owner ki copy ke mutabiq). v1.12-1.15 ne 50 kar diya tha, wapas
try {
  if (!getSettings().stock_v2c_done) {
    db.prepare("update stock_items set pack_size=35 where name='Nuggets' and pack_size=50").run();
    setSetting('stock_v2c_done', fmtDT(new Date()));
  }
} catch (e) { console.error('stock v2c', e.message); }
// Owner: menu card wala naam "Lazania" hi sahi hai (v1.11.0 ne Lasagna kar diya tha, wapas)
try {
  db.prepare("update items set name='Lazania' where name='Lasagna'").run();
  db.prepare("update items set name='Lazania Pizza' where name='Lasagna Pizza'").run();
  db.prepare("update stock_items set name='Lazania Strip' where name='Lasagna Strip'").run();
} catch (e) { console.error('lazania', e.message); }

// ---------- Fryer ka oil (poora badalta hai) + roz ki sabzi ----------
function friedMap() {
  if (FRIED && Date.now() - FRIED.at < 10 * 60 * 1000) return FRIED.map;
  const map = {}, ids = db.prepare(`select id from stock_items where name in (${FRY_ITEMS.map(() => '?').join(',')})`).all(...FRY_ITEMS).map(r => r.id);
  if (ids.length) db.prepare(`select distinct r.variant_id v from recipes r join variants va on va.id=r.variant_id join items it on it.id=va.item_id where it.name!='Oven Baked Wings' and r.item_id in (${ids.join(',')})`).all().forEach(r => (map[r.v] = 1));
  // Deal: jitne fried hisse (maslan Student Deal: zinger + wings + nuggets = 3)
  const deal = {}; db.prepare('select variant_id v, part_vid p, qty from deal_parts').all().forEach(r => { if (map[r.p]) deal[r.v] = (deal[r.v] || 0) + r.qty; });
  Object.entries(deal).forEach(([v, n]) => (map[v] = n));
  FRIED = { at: Date.now(), map }; return map;
}
// from (shamil) se to (shamil) tak kitni fried cheezein biken
function friedCount(from, to) {
  const m = friedMap(); let n = 0;
  db.prepare("select oi.variant_id v, oi.qty from order_items oi join orders o on o.id=oi.order_id where o.status='done' and o.business_date between ? and ?").all(from, to)
    .forEach(r => { if (m[r.v]) n += r.qty * m[r.v]; });
  return n;
}
// Pichli baariyon (din + fried ginti) se seekh kar agla badalna: jo pehle aaye — andaze ke din, ya andaze ki fried ginti
function oilStatus() {
  const bd = businessDate(), ch = db.prepare('select date,litres from oil_changes order by date').all();
  const cyc = []; for (let k = 1; k < ch.length; k++) cyc.push({ from: ch[k - 1].date, to: ch[k].date, days: dayDiff(ch[k - 1].date, ch[k].date), fried: friedCount(ch[k - 1].date, addDays(ch[k].date, -1)) });
  const last = ch.length ? ch[ch.length - 1] : null, litres = last ? last.litres || 16 : 16;
  const use = cyc.slice(-4), avgD = use.length ? use.reduce((t, c) => t + c.days, 0) / use.length : 6.5, avgF = use.length ? use.reduce((t, c) => t + c.fried, 0) / use.length : 175;
  const rate = Math.max(1, friedCount(addDays(bd, -7), addDays(bd, -1)) / 7);   // roz ki fried (pichle 7 din)
  if (!last) return { litres, avgD, avgF, rate, cycles: cyc, last: null, day: 0, fried: 0, remain: 99, next: null };
  const gone = dayDiff(last.date, bd), fried = friedCount(last.date, bd);
  const remain = Math.round(Math.min(avgD - gone, (avgF - fried) / rate) * 10) / 10;
  return { lastNote: (db.prepare('select note from oil_changes order by date desc, id desc limit 1').get() || {}).note || '', litres, avgD: Math.round(avgD * 10) / 10, avgF: Math.round(avgF), rate: Math.round(rate * 10) / 10, cycles: cyc, last: last.date, day: gone + 1, fried, remain, next: addDays(bd, Math.max(0, Math.ceil(remain))) };
}
admin.post('/stock/oil-change', (req, res) => {
  const b = req.body || {}, date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : businessDate(), now = fmtDT(new Date());
  const it = db.prepare('select id from stock_items where name=? and active=1').get(OIL_NAME); if (!it) return res.status(400).json({ error: 'Oil item nahi mila' });
  if (db.prepare('select 1 from oil_changes where date=?').get(date)) return res.status(400).json({ error: 'Is din oil badalna pehle se likha hai' });
  const lit = Math.max(1, num(b.litres) || 16);
  db.transaction(() => {
    db.prepare('insert into oil_changes(date,litres,note,created_at) values(?,?,?,?)').run(date, lit, 'Admin se', now);
    db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,?,?)").run(it.id, -lit, date, `Fryer ka oil badla (${lit})`, now);
  })();
  logEvent('stock', `Fryer ka oil badla: ${date}, ${lit} litre`);
  stockAlertCheck(); res.json({ ok: true, status: oilStatus() });
});
// Ghalti se "oil badla" likha gaya ho to aakhri baari hatao (stock ki minus entry bhi; Naya saman wali ho to us ka kharcha bhi)
admin.delete('/stock/oil-change/last', (req, res) => {
  const last = db.prepare('select * from oil_changes order by date desc, id desc limit 1').get();
  if (!last) return res.status(400).json({ error: 'Koi oil badalna likha hi nahi' });
  if (last.note === 'Owner ka bataya pattern') return res.status(400).json({ error: 'Ye shuru ki purani baari hai, ise nahi hata sakte' });
  const it = db.prepare('select id from stock_items where name=?').get(OIL_NAME);
  db.transaction(() => {
    if (last.expense_id) {   // Naya saman se: kharcha + stock entries + baari sab hatao
      const e = db.prepare('select * from expenses where id=? and deleted=0').get(last.expense_id);
      if (e) { db.prepare('update expenses set deleted=1 where id=?').run(e.id); if (e.queued) enqueue('expenses', e.uid + ':X', [e.uid + ':X', e.date, e.category, (e.note || '') + ' (deleted)', -e.amount, fmtDT(new Date())]); }
      db.prepare('delete from stock_moves where expense_id=?').run(last.expense_id);
    } else if (it) db.prepare("delete from stock_moves where item_id=? and date=? and kind='adjust' and note like 'Fryer%'").run(it.id, last.date);
    db.prepare('delete from oil_changes where id=?').run(last.id);
  })();
  logEvent('stock', `Oil badalna ghalti tha, hata diya: ${last.date}`);
  syncSoon(); stockAlertCheck(); res.json({ ok: true });
});
// Sabzi: har guzra hua din apna roz ka kharch minus karta hai (aaj ki sabzi aaj stock mein dikhe, kal subah ghate). Sirf jab stock aik dafa daala ja chuka ho. PC band raha to pichle din bhi (max 10)
function sabziDaily() {
  try {
    const bd = businessDate(), now = fmtDT(new Date());
    db.prepare('select id,name,daily_use from stock_items where daily_use>0 and active=1').all().forEach(i => {
      const first = db.prepare("select min(date) d from stock_moves where item_id=? and kind not in ('out','daily')").get(i.id).d; if (!first) return;
      const last = db.prepare("select max(date) d from stock_moves where item_id=? and kind='daily'").get(i.id).d;
      let d = last ? addDays(last, 1) : first; if (dayDiff(d, bd) > 10) d = addDays(bd, -10);
      for (; d < bd; d = addDays(d, 1)) db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'daily',?,?,?)").run(i.id, -i.daily_use, d, 'Roz ki sabzi', now);
    });
  } catch (e) { console.error('sabzi', e.message); }
}
// Aik baar: Sabzi (4 cheezein, roz ka kharch) + Frying Oil (khula litre, alert 1 din) + oil ki pichli baariyan (owner: aaj 4 Nov teesra din; pehle 7 din, us se pehle 6 din)
try {
  if (!getSettings().sabzi_oil_done) {
    const now = fmtDT(new Date()), has = n => db.prepare('select id from stock_items where name=? and active=1').get(n);
    const ins = db.prepare("insert into stock_items(name,unit,grp,sub_unit,sub_per,pack_size,pack_name,daily_use,alert_days,created_at) values(?,?,?,?,?,?,?,?,?,?)");
    db.transaction(() => {
      [['Shimla Mirch', 1], ['Tamatar', 1], ['Piyaz', 0.3], ['Band Gobhi', 1]].forEach(([n, d]) => { if (!has(n)) ins.run(n, 'kg', 'Raw saman', 'g', 1000, 0, '', d, 0, now); });
      if (!db.prepare('select count(*) n from oil_changes').get().n) ['2026-10-20', '2026-10-26', '2026-11-02'].forEach(d => db.prepare('insert into oil_changes(date,litres,note,created_at) values(?,16,?,?)').run(d, 'Owner ka bataya pattern', now));
    })();
    setSetting('sabzi_oil_done', now);
    logEvent('setting', 'Sabzi (roz ka kharch) aur Frying Oil (badalne ka hisaab) stock mein lag gaye');
  }
} catch (e) { console.error('sabzi/oil', e.message); }
// Aik baar (owner 4 Nov): alag "Frying Oil" nahi, wohi purana Oil; sabzi ka alag group nahi, Raw saman mein
try {
  if (!getSettings().oil_merge_done) {
    db.prepare("update stock_items set active=0 where name='Frying Oil'").run();
    db.prepare("update stock_items set grp='Raw saman', alert_days=0 where daily_use>0").run();
    setSetting('oil_merge_done', fmtDT(new Date()));
  }
} catch (e) { console.error('oil merge', e.message); }
sabziDaily(); setInterval(sabziDaily, 10 * 60 * 1000);

// Windows: desktop par "Pizza Town" icon na ho to bana do (tray se chalne wale PCs ke liye)
if (process.platform === 'win32') setTimeout(() => { try { execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'make-icon.ps1')], { windowsHide: true, timeout: 30000 }, () => {}); } catch (e) {} }, 5000);
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Pizza Town POS v${PKG.version} chal gaya.`);
  console.log(`  Is PC par : http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Mobile par: http://${ip}:${PORT}   (wahi WiFi)`));
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log('Server pehle se chal raha hai (port band nahi hua).'); process.exit(2); }
  console.error(e);
  process.exit(1);
});
