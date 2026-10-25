const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
};
const INTERNAL = new Set(['sync_since', 'last_sync_ok', 'last_sync_error', 'golive_done', 'last_alive', 'purge_fake_done']);
const SECRET = new Set(['admin_pin', 'sheet_key', 'sheet_url', 'sync_since', 'last_sync_ok', 'last_sync_error', 'golive_done', 'last_alive', 'purge_fake_done']);
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
  const cats = db.prepare(`select * from categories ${admin ? '' : 'where active=1'} order by sort,id`).all();
  const items = db.prepare(`select * from items ${admin ? '' : 'where active=1'} order by sort,id`).all();
  const vars = db.prepare(`select * from variants ${admin ? '' : 'where active=1'} order by sort,id`).all();
  const vByItem = {};
  vars.forEach(v => { if (!admin) delete v.cost; (vByItem[v.item_id] = vByItem[v.item_id] || []).push(v); });
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
setInterval(() => syncOnce().catch(() => {}), 20000);
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
app.use(express.static(path.join(__dirname, 'public')));


// ---------- stock ----------
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
function stockOut(orderId, lines, bd) {
  const rec = db.prepare('select item_id,qty from recipes where variant_id=?');
  const ins = db.prepare("insert into stock_moves(item_id,qty,kind,ref,date,created_at) values(?,?,'out',?,?,?)");
  const now = fmtDT(new Date()), tot = {};
  lines.forEach(l => { if (l.vid) rec.all(l.vid).forEach(r => { tot[r.item_id] = (tot[r.item_id] || 0) + r.qty * l.qty; }); });
  Object.entries(tot).forEach(([id, q]) => ins.run(id, -q, orderId, bd, now));
}
// balance = aaya/ginti + (becha hua, sirf 'done' orders; cancel/edit ki hui sale wapas ho jati hai)
const BAL_SQL = `coalesce(sum(case when m.kind='out' then (case when o.status='done' then m.qty else 0 end) else m.qty end),0)`;
function stockList() {
  const bd = businessDate();
  const d = new Date(bd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6);
  const since = d.toISOString().slice(0, 10);
  const items = db.prepare('select * from stock_items where active=1 order by name').all();
  const bal = Object.fromEntries(db.prepare(`select m.item_id id, ${BAL_SQL} b from stock_moves m left join orders o on o.id=m.ref and m.kind='out' group by m.item_id`).all().map(r => [r.id, r.b]));
  const use = Object.fromEntries(db.prepare(`select m.item_id id, -sum(m.qty) u from stock_moves m join orders o on o.id=m.ref where m.kind='out' and o.status='done' and m.date>=? group by m.item_id`).all(since).map(r => [r.id, r.u]));
  return items.map(i => {
    const b = r2(bal[i.id] || 0), perDay = r2((use[i.id] || 0) / 7);
    const days = perDay > 0 ? r2(b / perDay) : null;
    let status = 'ok';
    if (b <= 0) status = 'out';
    else if ((i.min_level > 0 && b <= i.min_level) || (days !== null && days <= 2)) status = 'low';
    return { id: i.id, name: i.name, grp: i.grp || '', unit: i.unit, min_level: i.min_level, bal: b, per_day: perDay, days, status };
  });
}
app.get('/api/stock/alerts', (req, res) => {
  try {
    const list = stockList(), by = Object.fromEntries(list.map(i => [i.id, i]));
    const alerts = list.filter(i => i.status !== 'ok').sort((a, b) => (a.status === 'out' ? 0 : 1) - (b.status === 'out' ? 0 : 1));
    const variants = {};
    db.prepare('select variant_id v, item_id i from recipes').all().forEach(r => {
      const it = by[r.i]; if (!it || it.status === 'ok') return;
      const cur = variants[r.v];
      if (!cur || (it.status === 'out' && cur.status !== 'out')) variants[r.v] = { status: it.status, name: it.name, bal: it.bal, unit: it.unit, days: it.days };
    });
    res.json({ alerts, variants });
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
  const getV = db.prepare(`select v.id,v.label,v.price,v.cost,i.name,i.details from variants v join items i on i.id=v.item_id where v.id=? and v.active=1 and i.active=1`);
  const lines = [];
  for (const it of b.items) {
    const qty = Math.min(99, Math.max(1, int(it.qty, 1)));
    const note = String(it.note || '').slice(0, 200);
    const extras = String(it.extras || '').slice(0, 200);
    const ep = Math.min(1000000, Math.max(0, int(it.extras_price, 0)));
    if (it.keep && keepItems) {
      const k = keepItems.find(x => x.id === int(it.keep));
      if (!k) return { err: 'Purani line nahi mili' };
      lines.push({ name: k.item_name, label: k.variant_label, details: k.details || '', price: k.price, cost: k.cost || 0, qty, note, extras, ep, vid: k.variant_id || null });
      continue;
    }
    const v = getV.get(it.variant_id);
    if (!v) return { err: 'Item menu mein nahi mila' };
    if (v.price <= 0) return { err: `${v.name} ${v.label} ki price set nahi hai (Admin se price daalein)` };
    lines.push({ name: v.name, label: v.label, details: v.details || '', price: v.price, cost: v.cost || 0, qty, note, extras, ep, vid: v.id });
  }
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
  const ins = db.prepare('insert into order_items(order_id,item_name,variant_label,details,price,cost,qty,note,extras,extras_price,variant_id) values(?,?,?,?,?,?,?,?,?,?,?)');
  lines.forEach(l => ins.run(oid, l.name, l.label, l.details, l.price, l.cost, l.qty, l.note, l.extras, l.ep, l.vid || null));
  try { stockOut(oid, lines, bd); } catch (e) { console.error('stock', e.message); }
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
    const sync = syncOn();
    const id = db.transaction(() => insertOrder(b, calc, S, null))();
    if (sync) syncSoon();
    res.json(publicOrder(loadOrder(id)));
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
      db.prepare("update orders set status='cancelled' where id=?").run(o.id);
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
  db.prepare('delete from categories where id=?').run(req.params.id);
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
  db.prepare('delete from items where id=?').run(req.params.id);
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
  db.prepare('delete from variants where id=?').run(req.params.id);
  if (o) logEvent('menu', `Size delete: ${o.item_name} (${o.label || '-'})`);
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
  res.json({ items: list, moves });
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
  res.json({ ok: true });
});
admin.delete('/stock/items/:id', (req, res) => {
  db.prepare('update stock_items set active=0 where id=?').run(req.params.id);
  db.prepare('delete from recipes where item_id=?').run(req.params.id);
  res.json({ ok: true });
});
// Aaya hua saman. amount ho to Kharcha mein bhi likha jata hai (dono jagah se same cheez)
admin.post('/stock/in', (req, res) => {
  const b = req.body || {}, it = db.prepare('select * from stock_items where id=? and active=1').get(b.item_id);
  if (!it) return res.status(400).json({ error: 'Item chunein' });
  const qty = num(b.qty); if (qty <= 0) return res.status(400).json({ error: 'Miqdar likhein' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : businessDate(), now = fmtDT(new Date());
  const amount = int(b.amount);
  db.transaction(() => {
    let eid = null;
    if (amount > 0) {
      const uidv = uuid(), sync = syncOn(), note = String(b.note || '').trim() || `${it.name} ${qty} ${it.unit}`;
      eid = db.prepare('insert into expenses(uid,date,category,note,amount,queued,created_at) values(?,?,?,?,?,?,?)').run(uidv, date, 'Saman (stock)', note.slice(0, 200), amount, sync ? 1 : 0, now).lastInsertRowid;
      if (sync) enqueue('expenses', uidv, [uidv, date, 'Saman (stock)', note.slice(0, 200), amount, now]);
      logEvent('expense', `${date} Saman (stock): Rs ${amount} (${note})`);
    }
    db.prepare("insert into stock_moves(item_id,qty,kind,expense_id,date,note,created_at) values(?,?,'in',?,?,?,?)").run(it.id, qty, eid, date, amount > 0 ? `Rs ${amount}` : '', now);
  })();
  syncSoon();
  res.json({ ok: true });
});
// Ginti: asal bacha hua likhein, farq khud adjust ho jata hai
admin.post('/stock/count', (req, res) => {
  const b = req.body || {}, it = db.prepare('select * from stock_items where id=? and active=1').get(b.item_id);
  if (!it) return res.status(400).json({ error: 'Item chunein' });
  if (b.count === '' || b.count == null || num(b.count) < 0) return res.status(400).json({ error: 'Bacha hua likhein' });
  const cur = stockList().find(x => x.id === it.id).bal, diff = r2(num(b.count) - cur);
  if (diff !== 0) db.prepare("insert into stock_moves(item_id,qty,kind,date,note,created_at) values(?,?,'adjust',?,?,?)").run(it.id, diff, businessDate(), `Ginti: ${cur} -> ${num(b.count)}`, fmtDT(new Date()));
  res.json({ ok: true });
});
admin.get('/recipes', (req, res) => {
  const vs = db.prepare(`select v.id,v.label,i.name,c.name cat from variants v join items i on i.id=v.item_id join categories c on c.id=i.category_id where v.active=1 and i.active=1 order by c.sort,c.id,i.sort,i.id,v.sort,v.id`).all();
  const rec = db.prepare('select r.variant_id v,r.item_id i,r.qty q from recipes r').all();
  res.json({ variants: vs.map(v => ({ ...v, recipe: rec.filter(r => r.v === v.id).map(r => ({ item_id: r.i, qty: r.q })) })) });
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
admin.put('/recipes/:vid', (req, res) => {
  const rows = (Array.isArray((req.body || {}).rows) ? req.body.rows : []).filter(r => r.item_id && num(r.qty) > 0);
  db.transaction(() => {
    db.prepare('delete from recipes where variant_id=?').run(req.params.vid);
    const ins = db.prepare('insert or replace into recipes(variant_id,item_id,qty) values(?,?,?)');
    rows.forEach(r => ins.run(req.params.vid, r.item_id, num(r.qty)));
  })();
  res.json({ ok: true });
});

// ----- expenses -----
admin.get('/expenses', (req, res) => {
  const from = req.query.from || businessDate(), to = req.query.to || from;
  res.json(db.prepare('select id,date,category,note,amount,created_at from expenses where deleted=0 and date between ? and ? order by date desc,id desc').all(from, to));
});
admin.post('/expenses', (req, res) => {
  const b = req.body || {};
  const amount = int(b.amount);
  if (amount <= 0) return res.status(400).json({ error: 'Amount likhein' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : businessDate();
  const uidv = uuid(), now = fmtDT(new Date()), category = String(b.category || 'Other').slice(0, 40), note = String(b.note || '').slice(0, 200);
  const sync = syncOn();
  const id = db.prepare('insert into expenses(uid,date,category,note,amount,queued,created_at) values(?,?,?,?,?,?,?)')
    .run(uidv, date, category, note, amount, sync ? 1 : 0, now).lastInsertRowid;
  if (sync) enqueue('expenses', uidv, [uidv, date, category, note, amount, now]);
  logEvent('expense', `${date} ${category}: Rs ${amount}${note ? ' (' + note + ')' : ''}`);
  syncSoon();
  res.json({ id });
});
admin.delete('/expenses/:id', (req, res) => {
  const e = db.prepare('select * from expenses where id=? and deleted=0').get(req.params.id);
  if (!e) return res.json({ ok: true });
  db.prepare('update expenses set deleted=1 where id=?').run(e.id);
  db.prepare('delete from stock_moves where expense_id=?').run(e.id);
  if (e.queued) enqueue('expenses', e.uid + ':X', [e.uid + ':X', e.date, e.category, (e.note || '') + ' (deleted)', -e.amount, fmtDT(new Date())]);
  logEvent('expense', `Kharcha delete: ${e.date} ${e.category} Rs ${e.amount}`);
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
  const expByDay = Object.fromEntries(db.prepare('select date d, sum(amount) s from expenses where deleted=0 and date between ? and ? group by date').all(...A).map(r => [r.d, r.s]));
  const days = {};
  dayRows.forEach(r => (days[r.d] = { ...r, expenses: 0 }));
  Object.entries(expByDay).forEach(([d, s]) => { days[d] = days[d] || { d, n: 0, subtotal: 0, total: 0, cost: 0, profit: 0, expenses: 0 }; days[d].expenses = s; });
  const dayList = Object.values(days).sort((a, b) => (a.d < b.d ? 1 : -1)).map(x => ({ ...x, net: x.profit - x.expenses }));
  res.json({
    from, to, now: businessDate(), totals, days: dayList,
    missing_cost: db.prepare('select count(*) n from variants v join items i on i.id=v.item_id where v.active=1 and i.active=1 and v.price>0 and v.cost<=0').get().n,
    by_type: db.prepare(`select type, count(*) n, sum(total) total, sum(profit) profit from orders where ${W} group by type`).all(...A),
    gifts: db.prepare(`select coalesce(gift_by,'-') by_whom, count(*) n, sum(subtotal) value, sum(cost) cost from orders where ${W} and payment='Gift' group by gift_by`).all(...A),
    by_payment: db.prepare(`select payment, count(*) n, sum(total) total from orders where ${W} group by payment`).all(...A),
    riders: db.prepare(`select rider, count(*) n, sum(total) total, sum(delivery_charge) delivery from orders where ${W} and type='delivery' group by rider`).all(...A),
    top: db.prepare(`select oi.item_name, oi.variant_label, sum(oi.qty) qty, sum(oi.qty*oi.price) amount, sum(oi.qty*(oi.price-oi.cost)) profit
      from order_items oi join orders o on o.id=oi.order_id where o.business_date between ? and ? and o.status='done'
      group by oi.item_name, oi.variant_label order by qty desc limit 15`).all(...A),
    orders: db.prepare(`select id,order_no,business_date,type,table_no,customer_name,rider,total,profit,payment,gift_by,status,printed,created_at
      from orders where business_date between ? and ? order by id desc limit 300`).all(...A).map(o => ({ ...o, cancel_left: o.status === 'done' ? editLeft(o) : 0 })),
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
