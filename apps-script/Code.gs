/**
 * Pizza Town - Google Sheet receiver
 * Sheet mein: Extensions > Apps Script > is code ko paste karein.
 * Project Settings > Script properties > SECRET = (koi lambi random key)
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
 * POS Admin > Settings mein Web App URL aur wahi SECRET key daalen.
 * Sirf rows add hoti hain (append-only); purani rows kabhi change nahi hotin.
 * Settings backup: POS menu/qeematein/recipes/settings ki file email kar deta hai (Sheet mein kuch nahi likhta).
 * Pehli dafa: editor mein testBackupMail chala kar email ki ijazat (Allow) dein, phir
 * Deploy > Manage deployments > Edit > Version: New version > Deploy (URL wahi rehta hai).
 */
var SHEETS = { orders: 'Orders', items: 'OrderItems', expenses: 'Expenses', events: 'Events', stockinfo: 'StockInfo' };
var TEXT_COLS = { Orders: [3, 4, 6, 8], OrderItems: [4], Expenses: [2], Events: [2], StockInfo: [2, 9] };
// StockInfo = "Saman aaya" ki tafseel (chhupa tab). "Daily Stock Entry" tab isi se banta hai.
var NEW_HEAD = { StockInfo: ['uid', 'date', 'saman', 'miqdar', 'unit', 'pack', 'rs', 'din_ka_dala', 'entry_time', 'synced_at'] };

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'PizzaTown' })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.key !== secret) return out({ ok: false, error: 'Key ghalat hai' });
    if (body.backup) return out(mailBackup(body.backup));
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss');
    var cache = {}, added = 0, dup = 0;
    (body.rows || []).forEach(function (r) {
      var name = SHEETS[r.kind];
      if (!name) return;
      var sh = ss.getSheetByName(name);
      if (!sh && NEW_HEAD[name]) { sh = ss.insertSheet(name); sh.appendRow(NEW_HEAD[name]); sh.setFrozenRows(1); sh.hideSheet(); }
      if (!sh) return;
      if (!cache[name]) {
        var n = sh.getLastRow();
        var vals = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues() : [];
        var set = {};
        vals.forEach(function (v) { set[String(v[0])] = 1; });
        cache[name] = { set: set, rows: [] };
      }
      var c = cache[name];
      if (c.set[String(r.uid)]) { dup++; return; }
      c.set[String(r.uid)] = 1;
      c.rows.push(r.row.concat([now]));
      added++;
    });
    Object.keys(cache).forEach(function (name) {
      var c = cache[name];
      if (!c.rows.length) return;
      var sh = ss.getSheetByName(name);
      var start = sh.getLastRow() + 1;
      var width = c.rows[0].length;
      (TEXT_COLS[name] || []).forEach(function (col) { sh.getRange(start, col, c.rows.length, 1).setNumberFormat('@'); });
      sh.getRange(start, 1, c.rows.length, width).setValues(c.rows);
    });
    return out({ ok: true, added: added, dup: dup, kinds: Object.keys(SHEETS) });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// POS ki settings backup file email par (attachment). Sheet ka koi data nahi chhehrta.
function mailBackup(b) {
  var to = String(b.to || '').split(/[,; ]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); }).slice(0, 5).join(',');
  if (!to) return { ok: false, error: 'Email ghalat hai' };
  var name = String(b.name || 'PizzaTown-settings.json').replace(/[^\w.\-]/g, '_');
  var blob = Utilities.newBlob(String(b.json || ''), 'application/json', name);
  MailApp.sendEmail({
    to: to,
    subject: (b.shop || 'Pizza Town') + ' POS settings backup ' + (b.created || ''),
    body: 'Pizza Town POS ki settings ka backup saath laga hai (menu, qeematein, deals, recipes, stock list, settings).\n' +
      'Orders, stock aur kharcha is mein nahi (wo Google Sheet mein hain). Admin PIN bhi nahi.\n\n' +
      'Naye PC par: POS install karein > Admin > Settings > "Backup file se wapas laayen" > ye file chunein.\n' +
      'Is file ko sambhal kar rakhein, kisi ko forward na karein.',
    attachments: [blob],
  });
  return { ok: true, mailed: true };
}

// Aik dafa editor se chalayen (email bhejne ki ijazat ke liye). Apne account par test email aaye gi.
function testBackupMail() {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Pizza Town backup test', 'Email ki ijazat mil gayi. Ab naya version deploy karein.');
}
