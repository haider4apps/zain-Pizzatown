/**
 * Pizza Town - Google Sheet receiver
 * Sheet mein: Extensions > Apps Script > is code ko paste karein.
 * Project Settings > Script properties > SECRET = (koi lambi random key)
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
 * POS Admin > Settings mein Web App URL aur wahi SECRET key daalen.
 * Sirf rows add hoti hain (append-only); purani rows kabhi change nahi hotin.
 */
var SHEETS = { orders: 'Orders', items: 'OrderItems', expenses: 'Expenses', events: 'Events' };
var TEXT_COLS = { Orders: [3, 4, 6, 8], OrderItems: [4], Expenses: [2], Events: [2] };

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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss');
    var cache = {}, added = 0, dup = 0;
    (body.rows || []).forEach(function (r) {
      var name = SHEETS[r.kind];
      if (!name) return;
      var sh = ss.getSheetByName(name);
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
    return out({ ok: true, added: added, dup: dup });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
