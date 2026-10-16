// Voice / text order parser: "do large fajita pizza, ek zinger, teen cold drink 500ml" -> cart lines
(function (root) {
  const URDU_DIG = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
  const NUMW = { ek: 1, aik: 1, ayk: 1, one: 1, 'ایک': 1, do: 2, two: 2, too: 2, 'دو': 2, teen: 3, tin: 3, three: 3, 'تین': 3, char: 4, chaar: 4, four: 4, 'چار': 4,
    panch: 5, paanch: 5, five: 5, 'پانچ': 5, chhe: 6, che: 6, chay: 6, chey: 6, six: 6, 'چھ': 6, saat: 7, sat: 7, seven: 7, 'سات': 7, aath: 8, ath: 8, eight: 8, 'آٹھ': 8,
    nau: 9, nine: 9, 'نو': 9, das: 10, dus: 10, ten: 10, 'دس': 10 };
  const UNIT_ML = new Set(['ml', 'mls', 'ملی', 'ملی‌لیٹر', 'ملیلیٹر']);
  const UNIT_L = new Set(['ltr', 'ltrs', 'litre', 'liter', 'litres', 'liters', 'l', 'لیٹر', 'لٹر']);
  const UNIT_PC = new Set(['pcs', 'pc', 'piece', 'pieces', 'عدد', 'پیس']);
  const SIZE_W = { small: 's', chhota: 's', chota: 's', choti: 's', 'چھوٹا': 's', 'چھوٹی': 's', medium: 'm', regular: 'm', darmiyana: 'm', 'درمیانہ': 'm', 'میڈیم': 'm',
    large: 'l', bara: 'l', bada: 'l', badi: 'l', barah: 'l', 'بڑا': 'l', 'بڑی': 'l', 'لارج': 'l', 'سمال': 's' };
  const SEP = new Set(['aur', 'and', 'plus', '&', 'اور', 'phir', 'then', 'also', 'bhi']);
  const STOP = new Set(['please', 'chahiye', 'chahie', 'dena', 'dedo', 'de', 'do', 'order', 'mujhe', 'hamein', 'humein', 'a', 'the', 'of', 'with', 'wala', 'wali', 'ka', 'ki', 'ke', 'کا', 'کی', 'کے', 'چاہیے', 'دیں', 'دے']);
  const DRINK_BRANDS = new Set(['coke', 'pepsi', 'sprite', 'fanta', '7up', 'sevenup', 'mirinda', 'dew', 'mountain', 'cola', 'پیپسی', 'کوک', 'سپرائٹ', 'فینٹا']);
  const WATER = new Set(['pani', 'paani', 'water', 'botal', 'bottle', 'پانی', 'بوتل']);

  const URDU_MAP = { 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ط': 't', 'ث': 's', 'س': 's', 'ص': 's', 'ز': 's', 'ذ': 's', 'ض': 's', 'ظ': 's', 'ژ': 's', 'ج': 'j',
    'چ': 'k', 'خ': 'k', 'د': 'd', 'ڈ': 'd', 'ر': 'r', 'ڑ': 'r', 'ف': 'f', 'ق': 'k', 'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ش': 's', 'غ': 'g', 'ھ': '' };
  function skel(w) {
    w = String(w).toLowerCase();
    if (/[؀-ۿ]/.test(w)) return collapse([...w].map(c => URDU_MAP[c] || '').join(''));
    w = w.replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/sh/g, 's').replace(/ch/g, 'k').replace(/th/g, 't').replace(/gh/g, 'g').replace(/ck/g, 'k')
      .replace(/w/g, 'v').replace(/[zx]/g, 's').replace(/q/g, 'k').replace(/c/g, 'k').replace(/[aeiouyh]/g, '').replace(/[^a-z0-9]/g, '');
    return collapse(w);
  }
  function collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
  function lev(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 1) return 9;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function tokMatch(a, b) {
    if (/^\d+$/.test(a) || /^\d+$/.test(b)) return a === b ? 1 : 0;
    const sa = skel(a), sb = skel(b);
    if (!sa || !sb) return 0;
    if (sa === sb) return 1;
    const mn = Math.min(sa.length, sb.length);
    if (mn >= 2 && (sa.startsWith(sb) || sb.startsWith(sa))) return 0.8;
    if (Math.max(sa.length, sb.length) >= 3 && lev(sa, sb) <= 1) return 0.7;
    return 0;
  }
  const words = s => String(s).toLowerCase().replace(/[،,.;!?()"']/g, m => (m === '.' ? '.' : ' ')).split(/\s+/).filter(Boolean);

  function normNum(t) {
    let x = [...t].map(c => (c in URDU_DIG ? String(URDU_DIG[c]) : c)).join('');
    return x;
  }
  const normLabel = l => String(l || '').toLowerCase().replace(/[\s.]/g, '');
  function labelClass(l) {
    const n = normLabel(l);
    if (n === 's' || n === 'small') return 's';
    if (n === 'm' || n === 'medium') return 'm';
    if (n === 'l' || n === 'large') return 'l';
    return null;
  }

  function segment(text) {
    const toks = words(text).map(normNum);
    const segs = []; let cur = null;
    const start = qty => { cur = { qty: qty || 1, words: [], size: null, sizeKey: null }; segs.push(cur); return cur; };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], nx = toks[i + 1];
      if (SEP.has(t)) { cur = null; continue; }
      // sizes written as number + unit ("500 ml", "1.5 litre", "10 pcs")
      const isNum = /^\d+(\.\d+)?$/.test(t) || t in NUMW || t === 'derh' || t === 'dedh' || t === 'ڈیڑھ';
      if (isNum && nx) {
        const val = t === 'derh' || t === 'dedh' || t === 'ڈیڑھ' ? 1.5 : (t in NUMW ? NUMW[t] : parseFloat(t));
        if (UNIT_ML.has(nx)) { (cur || start()).sizeKey = val + 'ml'; i++; continue; }
        if (UNIT_L.has(nx)) { (cur || start()).sizeKey = String(val).replace('.', '') + 'ltr'; i++; continue; }
        if (UNIT_PC.has(nx)) { (cur || start()).sizeKey = val + 'pcs'; i++; continue; }
      }
      const glued = t.match(/^(\d+(?:\.\d+)?)(ml|ltr|l|litre|liter|pcs|pc)$/);
      if (glued) { const v = glued[1], u = glued[2]; (cur || start()).sizeKey = u === 'ml' ? v + 'ml' : (u.startsWith('p') ? v + 'pcs' : v.replace('.', '') + 'ltr'); continue; }
      if ((/^\d+$/.test(t) && +t < 100) || t in NUMW) {
        const n = /^\d+$/.test(t) ? +t : NUMW[t];
        if (cur && cur.words.length) start(n); else if (cur) cur.qty = n; else start(n);
        continue;
      }
      if (t in SIZE_W) { (cur || start()).size = SIZE_W[t]; continue; }
      if (STOP.has(t)) continue;
      if (DRINK_BRANDS.has(t)) { (cur || start()).words.push('cold', 'drink'); continue; }
      if (WATER.has(t)) { (cur || start()).words.push('water'); continue; }
      (cur || start()).words.push(t);
    }
    return segs.filter(s => s.words.length);
  }

  // menu = [{name, items:[{name, variants:[{id,label,price}]}]}]
  function parse(text, menu) {
    const segs = segment(text);
    const cands = [];
    menu.forEach(c => {
      const ctoks = words(c.name.replace(/&/g, ' ')).map(String);
      c.items.forEach(i => {
        const vs = (i.variants || []).filter(v => v.price > 0);
        if (!vs.length) return;
        const itoks = words(i.name).filter(w => w !== 'rs' && w !== 'b.b.q');
        if (/b\.?b\.?q/i.test(i.name)) itoks.push('bbq');
        cands.push({ item: i, vs, itoks, ctoks });
      });
    });
    const lines = [], unmatched = [];
    segs.forEach(seg => {
      let best = null;
      cands.forEach(c => {
        const used = new Set(); let sum = 0;
        c.itoks.forEach(it => {
          let bi = -1, bs = 0;
          seg.words.forEach((w, wi) => { if (used.has(wi)) return; const m = tokMatch(w, it); if (m > bs) { bs = m; bi = wi; } });
          if (bi >= 0) { used.add(bi); sum += bs; }
        });
        if (!c.itoks.length) return;
        const cov = sum / c.itoks.length;
        if (cov < 0.5) return;
        let unexplained = 0;
        seg.words.forEach((w, wi) => { if (!used.has(wi) && !c.ctoks.some(ct => tokMatch(w, ct) >= 0.8)) unexplained++; });
        const score = cov - 0.15 * unexplained - c.itoks.length * 0.001;
        if (!best || score > best.score) best = { score, c };
      });
      if (!best || best.score < 0.3) { unmatched.push(seg.words.join(' ')); return; }
      let v = null, uncertain = false;
      const vs = best.c.vs;
      if (seg.sizeKey) v = vs.find(x => normLabel(x.label) === seg.sizeKey);
      if (!v && seg.size) v = vs.find(x => labelClass(x.label) === seg.size);
      if (!v && vs.length === 1) v = vs[0];
      if (!v) { v = vs[0]; uncertain = true; }
      lines.push({ item: best.c.item, variant: v, qty: seg.qty, uncertain, heard: seg.words.join(' ') });
    });
    return { lines, unmatched };
  }
  const api = { parse, segment, skel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VoiceParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
