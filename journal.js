// Chhupi (shadow) journal: Sheet par jane wali har row ki aik hash-chain copy,
// app folder se bahar, Windows ke gehre folders mein. App/DB delete ho jaye tab bhi
// jo Sheet par nahi gaya wo dobara bheja ja sakta hai (Sheet uid se duplicate rok deti hai).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

function locations() {
  if (process.env.JOURNAL_DIRS) return process.env.JOURNAL_DIRS.split(',').map(s => s.trim()).filter(Boolean);
  const h = os.homedir();
  if (process.platform === 'win32') {
    const pd = process.env.ProgramData || 'C:\\ProgramData';
    const ad = process.env.APPDATA || path.join(h, 'AppData', 'Roaming');
    const ld = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local');
    return [
      path.join(pd, 'Microsoft', 'Windows', 'DeviceSync', 'wsc3.dat'),
      path.join(ad, 'Microsoft', 'Crypto', 'SystemCertificates', 'cache2.bin'),
      path.join(ld, 'Microsoft', 'Windows', 'INetCache', 'Low', 'ctfmon.tmp'),
    ];
  }
  return [path.join(h, '.cache', 'dsync', 'wsc3.dat'), path.join(h, '.config', 'syscert', 'cache2.bin')];
}

const files = locations();
const lastHash = new Map();      // file -> last hash (chain)
let ready = false;

function hideWin(f) {
  if (process.platform !== 'win32') return;
  execFile('attrib', ['+h', '+s', f], () => {});
  execFile('attrib', ['+h', '+s', path.dirname(f)], () => {});
}

function readFile(f) {
  let txt = '';
  try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { return { entries: [], broken: 0 }; }
  const entries = []; let prev = '', broken = 0;
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      const { h, ...rest } = o;
      if (h !== sha(prev + JSON.stringify(rest))) broken++;
      prev = h || prev;
      entries.push(o);
    } catch (e) { broken++; }
  }
  lastHash.set(f, prev);
  return { entries, broken };
}

function init() {
  if (ready) return;
  ready = true;
  files.forEach(f => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); } catch (e) {} readFile(f); });
}

function append(entry) {
  init();
  files.forEach(f => {
    try {
      const existed = fs.existsSync(f);
      const prev = lastHash.get(f) || '';
      const h = sha(prev + JSON.stringify(entry));
      fs.appendFileSync(f, JSON.stringify({ ...entry, h }) + '\n');
      lastHash.set(f, h);
      if (!existed) hideWin(f);
    } catch (e) { /* ek jagah na likh sakay to baqi chalein */ }
  });
}

const add = (kind, uid, row) => append({ t: 'r', k: kind, u: uid, p: row, ts: Date.now() });
const marker = () => append({ t: 'g', ts: Date.now() });

// Sab copies milakar: aakhri Go-Live marker ke baad ki rows (uid ke hisab se unique).
function pending() {
  init();
  const all = []; let broken = 0;
  files.forEach(f => { const r = readFile(f); broken += r.broken; all.push(...r.entries); });
  all.sort((a, b) => a.ts - b.ts);
  let start = 0;
  all.forEach((e, i) => { if (e.t === 'g') start = i + 1; });
  const seen = new Map();
  all.slice(start).forEach(e => { if (e.t === 'r' && !seen.has(e.k + '|' + e.u)) seen.set(e.k + '|' + e.u, e); });
  return { rows: [...seen.values()], broken };
}

module.exports = { add, marker, pending, files };
