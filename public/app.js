if (window.POS_BLOCKED) throw new Error('POS doosri window mein khula hai');   // one.js: sirf aik window
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const TYPES = { dinein: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };

async function api(url, opt) {
  const o = opt && { method: opt.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opt.body || {}) };
  if (o && opt.headers) Object.assign(o.headers, opt.headers);
  const r = await fetch(url, o);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || ('Error ' + r.status)); e.data = j; throw e; }
  return j;
}
let toastT;
function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastT); toastT = setTimeout(() => (t.style.display = 'none'), ms);
}

let menu = [], settings = {}, cart = [], cur = null, query = '';
let co = null; // checkout state
let editing = null; // { id, order_no, pin } jab purana order badla ja raha ho

// ---------------- menu ----------------
const GRPCOL = ['#f08a4b', '#5fb3e8', '#b88cf0', '#7bd88f', '#f06292', '#e8b94c'];
const PALETTE = ['#f5c542', '#ef5350', '#ff9800', '#26a69a', '#8bc34a', '#ba68c8', '#42a5f5', '#26c6da', '#f06292', '#a1887f'];
const catColor = id => { const i = menu.findIndex(c => c.id === id); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; };
// ---------------- stock alerts ----------------
let STOCK = { alerts: [], variants: {} };
async function loadStock() {
  try { STOCK = await api('/api/stock/alerts'); } catch (e) { return; }
  // Upar 2 button: laal = khatam, peela = kam (gin ke). Dabane par list popup mein
  const al = STOCK.alerts, out = al.filter(s => s.status === 'out'), low = al.filter(s => s.status !== 'out');
  [['#btnOut', out], ['#btnLow', low]].forEach(([id, l]) => { const b = $(id); if (!b) return; b.hidden = !l.length; b.querySelector('b').textContent = l.length; });
  const ob = $('#btnOil'); if (ob) { ob.hidden = !STOCK.oil; if (STOCK.oil) ob.classList.toggle('due', STOCK.oil.remain <= 0); }
  if (typeof renderMenu === 'function' && menu && menu.length) renderMenu();
}
function stockConfirm(item, v, s, ok) {
  const m = document.createElement('div'); m.className = 'modal on';
  m.innerHTML = `<div class="sheet" style="max-width:440px"><h3 style="color:#ffb4a8">⚠ Stock khatam hai</h3>
    <div style="font-size:16px;line-height:1.5"><b>${esc(item.name)}${v.label ? ' ' + esc(v.label) : ''}</b> ke liye <b>${esc(s.name)}</b> khatam nazar aa raha hai (bacha: ${s.bal} ${esc(s.unit)}).<br>Phir bhi order mein daalna hai?</div>
    <div style="color:var(--mute);font-size:13px">Shayad stock ki entry baqi ho. Order dene se kuch rukta nahi, bas pata rahe.</div>
    <div class="two"><button class="btn" id="scNo">Nahi, wapas</button><button class="btn gold" id="scYes">Haan, phir bhi daalein</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('#scNo').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelector('#scYes').onclick = () => { m.remove(); ok(); fetch('/api/stock/override', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${item.name} ${v.label || ''} (${s.name} khatam)` }) }).catch(() => {}); };
}
setInterval(loadStock, 60000);
function stockPopup(kind) {
  const out = kind === 'out', list = STOCK.alerts.filter(s => (s.status === 'out') === out);
  const q = s => (s.sub_per && Math.abs(s.bal) < 1 ? Math.round(s.bal * s.sub_per) + ' ' + esc(s.sub_unit) : +(+s.bal).toFixed(2) + ' ' + esc(s.unit));
  const m = document.createElement('div'); m.className = 'modal on';
  m.innerHTML = `<div class="sheet" style="max-width:480px"><h3 style="color:${out ? '#ff8a80' : '#f5c04a'}">${out ? '⛔ Khatam saman' : '⚠ Kam saman'} (${list.length})</h3>
    <div class="stklist">${list.map(s => `<div class="stkrow ${out ? 'out' : 'low'}"><b>${esc(s.name)}</b><span>${out ? 'khatam' : 'bacha ' + q(s) + (s.days !== null ? ' · ~' + Math.max(0, Math.floor(s.days)) + ' din' : '')}</span></div>`).join('') || '<div class="empty">Kuch nahi</div>'}</div>
    <div class="two"><button class="btn" id="spNo">Band</button><a class="btn gold toAdmin" href="/admin.html#stock" style="text-decoration:none;text-align:center">➕ Stock daalein</a></div></div>`;
  document.body.appendChild(m);
  m.querySelector('#spNo').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
}
$('#btnOut').onclick = () => stockPopup('out');
// POS se Admin mein jayen to har dafa Admin PIN dobara poocha jaye (purana khula session band)
document.addEventListener('click', e => { if (e.target.closest('.toAdmin')) try { sessionStorage.removeItem('pin'); } catch (x) {} }, true);
$('#btnLow').onclick = () => stockPopup('low');
// Fryer ka oil: badalne se 1 din pehle POS mein alert. "Badal diya" Admin PIN se (tab hi Oil stock se minus)
$('#btnOil').onclick = () => {
  const o = STOCK.oil; if (!o) return;
  const due = o.remain <= 0, m = document.createElement('div'); m.className = 'modal on';
  m.innerHTML = `<div class="sheet" style="max-width:440px"><h3 style="color:${due ? '#ff8a80' : '#f5c04a'}">🛢 Fryer ka oil ${due ? 'badalne ka waqt ho gaya' : 'kal tak badalna hai'}</h3>
    <div style="font-size:16px;line-height:1.6">Abhi wala oil <b>${o.day}va din</b> se chal raha hai (badla tha ${esc(o.last)}), is baari <b>${o.fried}</b> fried cheezein bik chuki hain.<br>Andaza: badalna <b>~${esc(o.next)}</b>.</div>
    <div style="color:var(--mute);font-size:13px">Oil badal dein to neeche dabayein. Admin PIN lagega aur ${o.litres} ${esc(o.unit)} Oil stock se minus ho jayega.</div>
    ${o.bal < o.litres ? `<div style="color:#ffb4a8;font-size:14px">⚠ Stock mein abhi sirf ${+(+o.bal).toFixed(2)} ${esc(o.unit)} oil hai. Naya oil aaya hai to pehle Admin mein "Naya saman daalein" se daal dein.</div>` : ''}
    <div class="two"><button class="btn" id="foNo">Band</button><button class="btn gold" id="foYes">✅ Oil badal diya</button></div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove(); m.querySelector('#foNo').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  m.querySelector('#foYes').onclick = async () => {
    const pin = prompt('Admin PIN'); if (!pin) return;
    try { const r = await fetch('/api/admin/stock/oil-change', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: JSON.stringify({ litres: o.litres }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Masla'); close(); toast('Fryer ka oil badalna likh liya ✓'); loadStock();
    } catch (e) { toast(e.message === 'Unauthorized' ? 'PIN ghalat' : e.message, 3500); }
  };
};
async function load() {
  [menu, settings] = await Promise.all([api('/api/menu'), api('/api/settings')]);
  if (!menu.find(c => c.id === cur)) cur = menu.length ? menu[0].id : null;
  renderTabs(); renderMenu(); renderCart();
  loadStock();
}
// ---------------- section icons (ek rang ki line drawings) ----------------
const ICONS = {
  deals: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/><path d="M12 13l3-3M11 16l5-5"/>',
  pizza: '<path d="M2.5 7Q12 1.5 21.5 7L12 22z"/><path d="M4.5 9.2Q12 5.2 19.5 9.2"/><circle cx="9.5" cy="10.5" r="1.3"/><circle cx="14.5" cy="11" r="1.3"/><circle cx="12" cy="15.5" r="1.2"/>',
  burger: '<path d="M4 11a8 6 0 0 1 16 0H4z"/><path d="M8 7.5h.01M12 6.5h.01M16 7.5h.01"/><path d="M3 14h18"/><path d="M4 17h16v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1z"/>',
  wrap: '<path d="M5 16L16 5a3 3 0 0 1 4 4L9 20a3 3 0 0 1-4-4z"/><path d="M13 8l3 3M8 13l3 3"/>',
  fries: '<path d="M6 12h12l-1.5 9h-9L6 12z"/><path d="M8 12V4M11 12V2.5M14 12V4M17 11.5V5.5"/>',
  bites: '<circle cx="15" cy="9" r="5.5"/><path d="M11 13L5.5 18.5"/><circle cx="4.3" cy="18" r="1.5"/><circle cx="6" cy="20" r="1.5"/><path d="M13 7.5a3 3 0 0 1 2.5-.8"/>',
  pasta: '<path d="M3 12h18a9 8 0 0 1-18 0z"/><path d="M7 12c0-3 2-3 2-6.5M12 12c0-3 2-3 2-7M16.5 12c0-2.2 1.5-2.2 1.5-4.5"/>',
  drink: '<path d="M6 8h12l-1.5 13h-9L6 8z"/><path d="M5 8h14"/><path d="M13 8l1.8-5H18"/><path d="M7.3 13h9.4"/>',
  other: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
};
function iconId(name) {
  const n = String(name || '').toLowerCase();
  if (/deal/.test(n)) return 'deals'; if (/pizza/.test(n)) return 'pizza'; if (/burger/.test(n)) return 'burger';
  if (/wrap|roll|shawarma/.test(n)) return 'wrap'; if (/fries|fry/.test(n)) return 'fries'; if (/bite|wing|nugget/.test(n)) return 'bites';
  if (/pasta|salad/.test(n)) return 'pasta'; if (/drink|water|juice|shake/.test(n)) return 'drink';
  return 'other';
}
const icon = (id, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24">${ICONS[id] || ICONS.other}</svg>`;
const wmUrl = id => 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="rgba(232,185,76,.08)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ICONS.other}</svg>`) + '")';

const SECCOL = { deals: '#e8b94c', pizza: '#f08a4b', burger: '#ef5350', wrap: '#2fb9a8', fries: '#f5c542', bites: '#d98a5b', pasta: '#8bc34a', drink: '#42a5f5', other: '#e8b94c' };
function shade(hex, i, n) { // ek hi group/section ke items ka rang thora thora alag (hue ghuma kar)
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = (mx + mn) / 2;
  const S = mx === mn ? 0 : (L > .5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
  let H = 0;
  if (mx !== mn) { H = mx === r ? (g - b) / (mx - mn) + (g < b ? 6 : 0) : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; H *= 60; }
  return `hsl(${Math.round((H + (i - (n - 1) / 2) * (n > 1 ? Math.min(14, 36 / (n - 1)) : 0) + 360) % 360)},${Math.round(S * 100)}%,${Math.round(L * 100)}%)`;
}
function renderTabs() {
  const box = $('#tabs'); box.innerHTML = '';
  menu.forEach(c => {
    const b = el('button', c.id === cur && !query ? 'on' : '', icon(iconId(c.name)) + `<span>${esc(c.name)}</span>`);
    b.onclick = () => { cur = c.id; query = ''; $('#search').value = ''; renderTabs(); renderMenu(); $('#menu').scrollTop = 0; };
    box.appendChild(b);
  });
}
function renderMenu() {
  const box = $('#menu'); box.innerHTML = '';
  let list = [];
  if (query) {
    menu.forEach(c => c.items.forEach(i => {
      if ((i.name + ' ' + (i.details || '') + ' ' + (i.grp || '')).toLowerCase().includes(query))
        list.push({ ...i, grp: c.name + (i.grp ? ' · ' + i.grp : '') });
    }));
  } else {
    const c = menu.find(c => c.id === cur); list = c ? c.items : [];
  }
  box.style.backgroundImage = '';
  if (!query) {
    const c = menu.find(c => c.id === cur);
    if (c) {
      const id = iconId(c.name);
      box.style.backgroundImage = wmUrl(id);
      box.appendChild(el('div', 'hdr', `${icon(id)}<div><b>${esc(c.name)}</b><small>${list.length} items</small></div>`));
    }
  }
  if (!list.length) box.innerHTML += '<div class="empty" style="grid-column:1/-1">Koi item nahi mila</div>';
  let last = null, gbox = null, gi = -1, gcol = null;
  const sizes = {}, seen = {};
  list.forEach(i => { const k = i.grp || ''; sizes[k] = (sizes[k] || 0) + 1; });
  list.forEach(i => {
    if (i.grp && i.grp !== last) {
      gi++; gcol = GRPCOL[gi % GRPCOL.length]; gbox = el('div', 'gbox'); gbox.style.setProperty('--c', gcol);
      gbox.appendChild(el('h3', 'grp', esc(i.grp))); box.appendChild(gbox);
    }
    if (!i.grp) { gbox = null; gcol = null; }
    last = i.grp;
    const key = i.grp || '', cname = (menu.find(c => c.id === i.category_id) || {}).name;
    const base = i.grp && gcol ? gcol : SECCOL[iconId(cname)] || SECCOL.other;
    const card = el('div', 'card');
    card.style.setProperty('--c', shade(base, seen[key] = (seen[key] || 0), sizes[key]));
    seen[key]++;
    card.innerHTML = `<div class="nm">${esc(i.name)}</div>` + (i.details ? `<div class="det">${esc(i.details)}</div>` : '');
    const chips = el('div', 'chips');
    i.variants.forEach(v => {
      const b = el('button', 'chip' + (v.price > 0 ? '' : ' na'),
        (v.label ? `<small>${esc(v.label)}</small>` : '') + (v.price > 0 ? `<b>${v.price}</b>` : 'price?'));
      const sv = STOCK.variants[v.id];
      if (sv) { b.classList.add(sv.status === 'out' ? 'stout' : 'stlow'); b.insertAdjacentHTML('beforeend', `<span class="stb">${sv.status === 'out' ? '⛔ ' + esc(sv.name) + ' khatam' : sv.days !== null && sv.days <= (+settings.stock_alert_days || 3) ? '~' + Math.max(0, Math.floor(sv.days)) + ' din' : 'kam hai'}</span>`); }
      const add = () => { addToCart(i, v); b.classList.remove('hit'); card.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); card.classList.add('hit'); };
      b.onclick = () => {
        if (!(v.price > 0)) return toast('Is ki price set nahi. Admin se price daalein.');
        const s = STOCK.variants[v.id];
        add();   // khatam saman wala item cart mein ja sakta hai, lekin order Admin PIN ke baghair nahi lagega
      };
      chips.appendChild(b);
    });
    card.appendChild(chips); (gbox || box).appendChild(card);
  });
}

// ---------------- cart ----------------
function addToCart(item, v) {
  const pz = pzNew(v);
  const l = cart.find(x => x.variant_id === v.id && !x.keep && pzSame(x.pz, pz));
  if (l) l.qty++; else cart.push({ variant_id: v.id, name: item.name, label: v.label, price: v.price, qty: 1, note: '', extras: '', extras_price: 0, pz });
  renderCart();
}
const lineAmt = l => (l.price + pzCharge(l)) * l.qty + (+l.extras_price || 0);

// ---------- pizza: deal ka flavour + extra topping ----------
const SZN = { L: 'Large', M: 'Medium', S: 'Small' };
function pzIndex() {   // pizza variant id -> {name,size,grp}
  const ix = {}; menu.filter(c => /pizza/i.test(c.name)).forEach(c => c.items.forEach(i => i.variants.forEach(v => (ix[v.id] = { name: i.name, size: v.label, grp: i.grp || '' }))));
  return ix;
}
const pzCfg = () => { try { return JSON.parse(settings.pizza_upgrade || '{}'); } catch (e) { return {}; } };
// har pizza par sirf us ki apni topping: Pure 100, Elite 200, Premium M 200 / L 300
const pzRule = (grp, size) => { try { return +((JSON.parse(settings.pizza_topping_rules || '{}')[grp] || {})[size]) || 0; } catch (e) { return 0; } };
function pzNew(v) {
  if (v.slots && v.slots.length) return { deal: true, s: v.slots.map(x => ({ size: x.size, vid: x.def, top: 0 })) };
  if (pzIndex()[v.id]) return { deal: false, s: [{ top: 0 }] };
  return null;
}
const pzSame = (a, b) => JSON.stringify(a ? a.s : null) === JSON.stringify(b ? b.s : null);
const pzUp = s => { const p = pzIndex()[s.vid]; return p ? +((pzCfg()[s.size] || {})[p.grp] || 0) : 0; };
const pzCharge = l => (l.pz ? l.pz.s.reduce((t, s) => t + (l.pz.deal ? pzUp(s) : 0) + (+s.top || 0), 0) : 0);
function pzDecorate(d, l) {
  if (!l.pz) return;
  const ix = pzIndex(), box = el('div', 'pzbox');
  const tops = (s, p) => { const r = el('div', 'pztops'), v = p ? pzRule(p.grp, p.size) : 0; if (!v) return r;
    const t = el('button', 'pztp' + (s.top ? ' on' : ''), `${s.top ? '✓ ' : ''}Extra topping +${v}`); t.onclick = () => { s.top = s.top ? 0 : v; renderCart(); }; r.appendChild(t); return r; };
  if (!l.pz.deal) {
    const row = el('div', 'pzrow'); row.appendChild(tops(l.pz.s[0], ix[l.variant_id])); box.appendChild(row);
  } else {
    const sum = l.pz.s.map(s => `${SZN[s.size] || s.size}: <b>${esc((ix[s.vid] || {}).name || '?')}</b>${pzUp(s) ? ' <i>+' + pzUp(s) + '</i>' : ''}${s.top ? ' <i>Topping +' + s.top + '</i>' : ''}`).join(' · ');
    const head = el('button', 'pzhead' + (l.pzOpen ? ' open' : ''), `<span>🍕 ${sum}</span><span class="pzbtn">${l.pzOpen ? 'Band ▴' : 'Flavour / Topping ▾'}</span>`);
    head.onclick = () => { l.pzOpen = !l.pzOpen; renderCart(); };
    box.appendChild(head);
    if (l.pzOpen) l.pz.s.forEach(s => {
      const row = el('div', 'pzslot'), up = pzUp(s);
      const fb = el('button', 'pzfl' + (up ? ' up' : ''), `<small>${SZN[s.size] || s.size} Pizza</small> <b>${esc((ix[s.vid] || {}).name || '?')}</b>${up ? ' <i>+' + up + '</i>' : ''} ▾`);
      fb.onclick = () => pzPick(l, s); row.appendChild(fb); row.appendChild(tops(s, ix[s.vid])); box.appendChild(row);
    });
  }
  d.appendChild(box);
}
function pzPick(l, s) {
  const ix = pzIndex(), cfg = pzCfg()[s.size] || {}, groups = {};
  Object.entries(ix).forEach(([vid, p]) => { if (p.size === s.size) (groups[p.grp] = groups[p.grp] || []).push({ vid: +vid, name: p.name }); });
  const m = el('div', 'modal on'), sh = el('div', 'sheet pzsheet');
  sh.innerHTML = `<h3>${SZN[s.size] || s.size} Pizza ka flavour</h3>` + Object.entries(groups).map(([g, list]) => `<div class="pzg">${esc(g)} ${cfg[g] ? '<span>+Rs ' + cfg[g] + '</span>' : '<span class="f">same price</span>'}</div>
    <div class="pzgrid">${list.map(x => `<button class="pzopt${x.vid === s.vid ? ' on' : ''}" data-v="${x.vid}">${esc(x.name)}</button>`).join('')}</div>`).join('') + '<button class="btn pzclose">Band karein</button>';
  sh.onclick = e => { const b = e.target.closest('.pzopt'); if (b) { s.vid = +b.dataset.v; if (s.top) { const p = pzIndex()[s.vid]; s.top = p ? pzRule(p.grp, p.size) : 0; } m.remove(); renderCart(); } else if (e.target.closest('.pzclose')) m.remove(); };
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.appendChild(sh); document.body.appendChild(m);
}
const pzSend = l => (l.pz ? l.pz.s.map(s => (l.pz.deal ? { vid: s.vid, top: s.top || 0 } : { top: s.top || 0 })) : undefined);
const cartTotal = () => cart.reduce((s, l) => s + lineAmt(l), 0);
function renderCart() {
  const body = $('#cartBody'); body.innerHTML = '';
  if (editing) {
    const eb = el('div', 'editbar', `<b>Order #${editing.order_no} badla ja raha hai</b><small>(naya number milega)</small><button class="btn" id="editStop">Chhor do</button>`);
    eb.querySelector('#editStop').onclick = stopEdit; body.appendChild(eb);
  }
  if (!cart.length) body.appendChild(el('div', 'empty', 'Cart khali hai.<br>Item ke size/price button par tap karein.'));
  cart.forEach((l, idx) => {
    const d = el('div', 'line');
    d.innerHTML = `<div class="l1"><span>${esc(l.name)}${l.label ? ' <small style="color:var(--mute)">(' + esc(l.label) + ')</small>' : ''}</span><span>${money(lineAmt(l))}</span></div>
      <div class="l2"><div class="qty"><button data-a="-">−</button><span>${l.qty}</span><button data-a="+">+</button></div>
      <input class="note" placeholder="Note (kam mirch, bina pyaaz...)" value="${esc(l.note)}"></div>`;
    d.querySelectorAll('button').forEach(b => b.onclick = () => {
      l.qty += b.dataset.a === '+' ? 1 : -1;
      if (l.qty <= 0) cart.splice(idx, 1);
      renderCart();
    });
    d.querySelector('.note').oninput = e => (l.note = e.target.value);

    pzDecorate(d, l);
    body.appendChild(d);
  });
  const n = cart.reduce((s, l) => s + l.qty, 0);
  $('#cartCount').textContent = n ? `(${n} items)` : '';
  $('#cartTotal').textContent = money(cartTotal());
  $('#barCount').textContent = n ? `View Cart · ${n} items` : 'Cart khali';
  $('#barTotal').textContent = money(cartTotal());
  $('#checkoutBtn').disabled = !cart.length;
  $('#checkoutBtn').textContent = editing ? 'Save change' : 'Checkout';
}

// ---------------- checkout ----------------
function openCheckout() {
  if (!cart.length) return;
  co = co || { type: 'dinein', table_no: '', customer_name: '', phone: '', address: '', rider: '', discount: 0,
    payment: 'Cash', delivery_charge: settings.delivery_charge_default || 0, service: true, note: '', slip_lang: settings.slip_lang_default === 'en' ? 'en' : 'ur' };
  co.delivery_charge = co.delivery_charge ?? 0;
  renderCheckout();
  $('#coModal').classList.add('on');
}
function calc() {
  const sub = cartTotal();
  if (co.payment === 'Gift') return { sub, disc: sub, del: 0, svc: 0, total: 0 };
  const disc = Math.min(Math.max(+co.discount || 0, 0), sub);
  let del = 0, svc = 0;
  if (co.type === 'delivery' && settings.delivery_charge_enabled === '1') del = Math.max(+co.delivery_charge || 0, 0);
  if (co.type === 'dinein' && settings.service_charge_enabled === '1' && co.service) {
    const v = +settings.service_charge_value || 0;
    svc = settings.service_charge_type === 'percent' ? Math.round((sub - disc) * v / 100) : Math.round(v);
  }
  return { sub, disc, del, svc, total: sub - disc + del + svc };
}
function renderCheckout() {
  const sh = $('#coSheet');
  const dEn = settings.delivery_charge_enabled === '1', sEn = settings.service_charge_enabled === '1';
  const svcLabel = settings.service_charge_type === 'percent' ? `${settings.service_charge_value}%` : `Rs ${settings.service_charge_value}`;
  sh.innerHTML = `<h3>${editing ? 'Order #' + editing.order_no + ' badlein' : 'Checkout'}</h3>
  <div class="seg" id="typeSeg">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}" class="${co.type === k ? 'on' : ''}">${v}</button>`).join('')}</div>
  ${co.type === 'dinein' ? `<div class="f"><label>Table number</label><div class="tbls" id="tbls">${Array.from({ length: Math.min(40, Math.max(1, parseInt(settings.dine_tables) || 6)) }, (_, i) => `<button type="button" data-tb="${i + 1}" class="${String(co.table_no) === String(i + 1) ? 'on' : ''}">${i + 1}</button>`).join('')}</div></div>` : ''}
  ${co.type === 'delivery' ? `
    <div class="two"><div class="f"><label>Customer name</label><input id="f_name" value="${esc(co.customer_name)}"></div>
    <div class="f"><label>Phone</label><input id="f_phone" type="tel" value="${esc(co.phone)}"></div></div>
    <div class="f"><label>Address *</label><textarea id="f_addr" rows="2">${esc(co.address)}</textarea></div>
    <div class="f"><label>Rider (delivery boy)</label><input id="f_rider" list="riders" value="${esc(co.rider)}"></div>` : ''}
  ${co.type === 'takeaway' ? `<div class="two"><div class="f"><label>Customer name (optional)</label><input id="f_name" value="${esc(co.customer_name)}"></div>
    <div class="f"><label>Phone (optional)</label><input id="f_phone" type="tel" value="${esc(co.phone)}"></div></div>` : ''}
  <div class="two">
    <div class="f"><label>Discount (Rs)</label><input id="f_disc" type="number" min="0" inputmode="numeric" value="${co.discount || ''}"></div>
    ${co.type === 'delivery' && dEn ? `<div class="f"><label>Delivery charges (Rs)</label><input id="f_del" type="number" min="0" inputmode="numeric" value="${co.delivery_charge || ''}" placeholder="0 = free"></div>` : '<div></div>'}
  </div>
  ${co.type === 'dinein' && sEn ? `<label class="chk"><input type="checkbox" id="f_svc" ${co.service ? 'checked' : ''}> Service charges lagayein (${svcLabel})</label>` : ''}
  <div class="f"><label>Payment</label><select id="f_pay">${['Cash', 'Online', 'Card', 'Gift'].map(p => `<option value="${p}" ${co.payment === p ? 'selected' : ''}>${p === 'Gift' ? 'Gift / Free' : p}</option>`).join('')}</select></div>
  ${co.payment === 'Gift' ? `<div class="f"><label>Gift kis ki taraf se?</label><select id="f_gby">${['Owner', 'Partner 1', 'Partner 2', 'Staff', 'Customer'].map(p => `<option ${co.gift_by === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>` : ''}
  <div class="f"><label>Order note (optional)</label><input id="f_note" value="${esc(co.note)}"></div>
  <div class="f"><label>Slip ki zaban</label><div class="seg two-seg" id="langSeg"><button data-l="ur" class="${co.slip_lang === 'ur' ? 'on' : ''}">اردو</button><button data-l="en" class="${co.slip_lang === 'en' ? 'on' : ''}">English</button></div></div>
  <label class="chk"><input type="checkbox" id="f_np" ${co.no_print ? 'checked' : ''}> Is order ki slip na nikalein (sirf save karein)</label>
  <div class="sum" id="sum"></div>
  <div class="two"><button class="btn" id="coCancel">Back</button><button class="btn gold" id="coOk">${editing ? 'Save change &amp; Print' : 'Save &amp; Print'}</button></div>`;
  sh.querySelectorAll('#typeSeg button').forEach(b => b.onclick = () => { readForm(); co.type = b.dataset.t; renderCheckout(); });
  sh.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => { readForm(); co.slip_lang = b.dataset.l; renderCheckout(); });
  sh.querySelectorAll('input,textarea,select').forEach(i => i.oninput = () => { readForm(); updSum(); });
  const fp = $('#f_pay'); if (fp) fp.onchange = () => { readForm(); renderCheckout(); };
  const tb = $('#tbls'); if (tb) tb.onclick = e => { const b = e.target.closest('[data-tb]'); if (!b) return; readForm(); co.table_no = co.table_no === b.dataset.tb ? '' : b.dataset.tb; renderCheckout(); };
  $('#coCancel').onclick = () => $('#coModal').classList.remove('on');
  $('#coOk').onclick = placeOrder;
  updSum();
}
function readForm() {
  const g = id => { const e = $('#' + id); return e ? e.value : undefined; };
  const set = (k, id) => { const v = g(id); if (v !== undefined) co[k] = v; };
  set('table_no', 'f_table'); set('customer_name', 'f_name'); set('phone', 'f_phone'); set('address', 'f_addr');
  set('rider', 'f_rider'); set('discount', 'f_disc'); set('delivery_charge', 'f_del'); set('payment', 'f_pay'); set('note', 'f_note'); set('gift_by', 'f_gby');
  const s = $('#f_svc'); if (s) co.service = s.checked;
  const np = $('#f_np'); if (np) co.no_print = np.checked;
}
function updSum() {
  const c = calc();
  const ok = $('#coOk'); if (ok) ok.innerHTML = (editing ? 'Save change' : 'Save') + (co.no_print ? ' (bina print)' : ' &amp; Print');
  $('#sum').innerHTML = `<div><span>Subtotal</span><span>${money(c.sub)}</span></div>` +
    (c.disc ? `<div><span>Discount</span><span>- ${money(c.disc)}</span></div>` : '') +
    (c.del ? `<div><span>Delivery</span><span>${money(c.del)}</span></div>` : '') +
    (c.svc ? `<div><span>Service charges</span><span>${money(c.svc)}</span></div>` : '') +
    `<div class="big"><span>Total</span><span>${money(c.total)}</span></div>`;
}
let placing = false;
async function placeOrder() {
  if (placing) return;
  readForm();
  if (co.type === 'delivery' && !co.address.trim()) { toast('Delivery ke liye address likhein'); return; }
  let giftPin = '';
  if (co.payment === 'Gift' && settings.gift_needs_pin === '1') {
    giftPin = (editing && editing.pin) || prompt('Gift/Free order ke liye Admin PIN daalein:');
    if (!giftPin) return;
    const r = await fetch('/api/admin/login', { headers: { 'x-admin-pin': giftPin } });
    if (!r.ok) { toast('PIN ghalat hai', 3000); return; }
  }
  placing = true; $('#coOk').disabled = true;
  try {
    const hdr = {};
    if (giftPin || (editing && editing.pin)) hdr['x-admin-pin'] = giftPin || editing.pin;
    if (stockPin) hdr['x-stock-pin'] = stockPin;
    const o = await api(editing ? '/api/orders/' + editing.id : '/api/orders', { method: editing ? 'PUT' : 'POST', headers: hdr, body: {
      type: co.type, table_no: co.table_no, customer_name: co.customer_name, phone: co.phone, address: co.address,
      rider: co.rider, discount: +co.discount || 0, delivery_charge: +co.delivery_charge || 0, service: co.service,
      payment: co.payment, gift_by: co.gift_by, note: co.note, slip_lang: co.slip_lang, no_print: !!co.no_print,
      items: cart.map(l => l.keep ? { keep: l.keep, qty: l.qty, note: l.note, extras: l.extras, extras_price: l.extras_price || 0, pz: pzSend(l) } : { variant_id: l.variant_id, qty: l.qty, note: l.note, extras: l.extras, extras_price: l.extras_price || 0, pz: pzSend(l) }) } });
    const wasEdit = editing ? editing.order_no : 0;
    if (!wasEdit && window.funAfterOrder) try { funAfterOrder(o, settings); } catch (e) {}
    cart = []; co = null; editing = null;
    $('#coModal').classList.remove('on'); $('#cart').classList.remove('open');
    renderCart();
    toast(wasEdit ? `#${wasEdit} cancel, naya order #${o.order_no} · ${money(o.total)}` : `Order #${o.order_no} save ho gaya · ${money(o.total)}` + (isStation() ? '' : ' · Print PC par hoga'), 3500);
    if (isStation()) pollPrint();
    loadRiders(); loadStock();
  } catch (e) {
    placing = false; const ok0 = $('#coOk'); if (ok0) ok0.disabled = false;
    if (e.data && e.data.code === 'STOCK_BLOCK') return stockBlock(e.data, placeOrder);
    toast(e.message, 4000);
  }
  placing = false; stockPin = ''; const ok = $('#coOk'); if (ok) ok.disabled = false;
}
// Zaroori saman khatam: bara laal paigham. Order sirf Admin PIN se (har dafa), taake stock daala jaye
let stockPin = '';
function stockBlock(d, retry) {
  stockPin = '';
  const m = document.createElement('div'); m.className = 'modal on';
  m.innerHTML = `<div class="sheet blk"><div class="blkhead">⛔ STOCK KHATAM HAI</div>
    <div style="font-size:17px;line-height:1.5">Ye order nahi lag sakta. Is ka zaroori saman khatam hai:</div>
    <div class="blklist">${d.blockers.map(b => `<div><b>${esc(b.name)}</b><span>chahiye ${b.need} ${esc(b.unit)} · bacha ${Math.max(0, b.bal)} ${esc(b.unit)}</span></div>`).join('')}</div>
    <div style="color:#ffd2cc;font-size:14px">Saman aa gaya hai to Admin pehle <b>Stock → Naya saman daalein</b> mein daale. Abhi zaroori ho to Admin PIN se order lag sakta hai (har dafa PIN mangega).</div>
    ${d.wrong_pin ? '<div style="color:#ff8a80;font-weight:800">PIN ghalat tha</div>' : ''}
    <input id="blkPin" type="password" inputmode="numeric" placeholder="Admin PIN" style="font-size:20px;text-align:center">
    <div class="two"><button class="btn" id="blkNo">Wapas</button><button class="btn red" id="blkYes">PIN se order lagayein</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('#blkNo').onclick = () => m.remove();
  m.querySelector('#blkYes').onclick = () => { const p = m.querySelector('#blkPin').value.trim(); if (!p) return toast('Admin PIN likhein'); stockPin = p; m.remove(); retry(); };
  m.querySelector('#blkPin').focus();
}

// ---------------- recent orders ----------------
async function openOrders() {
  const sh = $('#ordSheet'); sh.innerHTML = '<h3>Aaj ke orders</h3><div class="empty">Loading...</div>';
  $('#ordModal').classList.add('on');
  const list = await api('/api/orders/recent'); const t0 = Date.now();
  sh.innerHTML = '<h3>Aaj ke orders</h3>' + (list.length ? '' : '<div class="empty">Abhi koi order nahi</div>');
  list.forEach(o => {
    const d = el('div', 'ord');
    d.innerHTML = `<div class="i"><b>#${o.order_no}</b> <span class="tag">${TYPES[o.type]}</span>${o.status === 'cancelled' ? '<span class="tag" style="color:var(--red)">cancelled</span>' : ''}${o.printed ? '' : '<span class="tag">print pending</span>'}<br>
      <small>${o.created_at.slice(11, 16)} · ${esc(o.customer_name || o.table_no || '')}</small></div><b>${money(o.total)}</b>
      <button class="btn" data-a="ed"></button><button class="btn" data-a="pv">View</button><button class="btn" data-a="rp-ur">Reprint اردو</button><button class="btn" data-a="rp-en">Reprint EN</button>`;
    const eb = d.querySelector('[data-a=ed]');
    if (o.status !== 'done') eb.remove();
    else {
      const upd = () => { const left = Math.max(0, o.edit_left - Math.floor((Date.now() - t0) / 1000)); eb.textContent = left > 0 ? `Edit (${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})` : 'Edit (PIN)'; eb.classList.toggle('gold', left > 0); return left; };
      upd(); const iv = setInterval(() => { if (!document.body.contains(eb)) return clearInterval(iv); upd(); }, 1000);
      eb.onclick = () => startEdit(o, upd());
    }
    d.querySelector('[data-a=pv]').onclick = () => window.open('/slip.html?preview=1&id=' + o.id, '_blank');
    ['ur', 'en'].forEach(l => (d.querySelector(`[data-a=rp-${l}]`).onclick = async () => { await api(`/api/orders/${o.id}/reprint`, { body: { lang: l } }); toast('Reprint queue mein gaya'); if (isStation()) pollPrint(); }));
    sh.appendChild(d);
  });
  const c = el('button', 'btn', 'Close'); c.onclick = () => $('#ordModal').classList.remove('on'); sh.appendChild(c);
}

// ---------------- order edit ----------------
function stopEdit() { editing = null; cart = []; co = null; renderCart(); }
async function startEdit(o, left) {
  let pin = '';
  try {
    if (left <= 0) {
      pin = prompt('Change ka waqt khatam ho gaya. Admin PIN daalein:');
      if (!pin) return;
      const r = await fetch('/api/admin/login', { headers: { 'x-admin-pin': pin } });
      if (!r.ok) { toast('PIN ghalat hai', 3000); return; }
    }
    if (cart.length && !editing && !confirm('Maujooda cart khali hokar is order ka edit khulega. Theek hai?')) return;
    const f = await api('/api/orders/' + o.id);
    cart = f.items.map(i => {
      const l = { keep: i.id, variant_id: i.variant_id, name: i.item_name, label: i.variant_label, price: i.price, qty: i.qty, note: i.note || '', extras: i.extras || '', extras_price: i.extras_price || 0 };
      let z = null; try { z = i.pz ? JSON.parse(i.pz) : null; } catch (e) {}
      if (z && z.s) { l.extras = z.mx || ''; l.extras_price = z.mp || 0; l.pz = { deal: !!z.s[0].vid, s: z.s.map(x => ({ size: x.size, vid: x.vid, top: x.top || 0 })) }; }
      return l;
    });
    co = { type: f.type, table_no: f.table_no || '', customer_name: f.customer_name || '', phone: f.phone || '', address: f.address || '', rider: f.rider || '',
      discount: f.discount || 0, payment: f.payment || 'Cash', gift_by: f.gift_by || 'Owner', delivery_charge: f.delivery_charge || 0, service: !!f.service_charge, note: f.note || '',
      slip_lang: f.slip_lang || (settings.slip_lang_default === 'en' ? 'en' : 'ur') };
    editing = { id: o.id, order_no: o.order_no, pin };
    $('#ordModal').classList.remove('on'); $('#cart').classList.add('open');
    renderCart(); toast('Item badlein, phir "Save change" dabayein', 3500);
  } catch (e) { toast(e.message, 4000); }
}

// ---------------- printer station ----------------
// Jis device (PC) se print karna ho wahan "Printer" button ON karein. Mobile se aaye orders bhi yahan print honge.
const isStation = () => localStorage.getItem('station') === '1';
let printing = false;
async function updSync() {
  const el = $('#syncPill');
  try {
    const j = await (await fetch('/api/sync/pending')).json();
    if (!j.on) { el.hidden = true; return; }
    el.hidden = false;
    const bad = !j.online;
    el.className = 'syncpill ' + (bad ? 'bad' : j.pending ? 'wait' : 'ok');
    el.textContent = bad ? `⚠ Net band${j.pending ? ' · ' + j.pending + ' baqi' : ''}` : j.pending ? `⏳ ${j.pending} sync baqi` : '✓ Sheet sync';
    el.title = 'Aakhri kamyab sync: ' + (j.last_ok || '-');
  } catch (e) { el.hidden = true; }
}
setInterval(updSync, 15000); updSync();
function updStation() { const b = $('#btnStation'); b.textContent = 'Printer: ' + (isStation() ? 'ON' : 'OFF'); b.classList.toggle('stn', isStation()); }
// Slip ka frame pehle se tayyar (page + Urdu font aik dafa load). Har order par sirf order ka number bheja jata hai
let slipReady = false;
window.addEventListener('message', e => { if (e.data && e.data.slipReady) slipReady = true; });
function warmSlip() { if (!isStation()) return; slipReady = false; $('#printFrame').src = '/slip.html?warm=1&t=' + Date.now(); }
function printOne(id) {
  return new Promise(resolve => {
    const f = $('#printFrame'); let done = false, info = {};
    const fin = () => { if (done) return; done = true; window.removeEventListener('message', on); resolve(info); };
    const on = e => { if (e.data && e.data.slipDone == id) { info = { load: e.data.load, print: e.data.print }; fin(); } };
    window.addEventListener('message', on);
    setTimeout(fin, 12000);
    if (slipReady) f.contentWindow.postMessage({ slip: id }, '*');   // tez rasta
    else f.src = '/slip.html?id=' + id + '&t=' + Date.now();          // frame tayyar na ho to purana tareeqa
  });
}
async function pollPrint() {
  if (!isStation() || printing) return;
  printing = true;
  try {
    const ids = await api('/api/print/pending');
    for (const id of ids) { const t = await printOne(id); await api(`/api/orders/${id}/printed`, { body: t }); }
    if (ids.length && !slipReady) warmSlip();   // purane tareeqe se nikli ho to frame dobara tayyar
  } catch (e) { /* server band ho to agli dafa try hoga */ }
  printing = false;
}
setInterval(pollPrint, 3000);
setTimeout(warmSlip, 1500);

async function loadRiders() {
  try { const r = await api('/api/riders'); $('#riders').innerHTML = r.map(x => `<option value="${esc(x)}">`).join(''); } catch (e) {}
}

// ---------------- wiring ----------------
$('#search').oninput = e => { query = e.target.value.trim().toLowerCase(); renderTabs(); renderMenu(); };
$('#checkoutBtn').onclick = openCheckout;
$('#clearCart').onclick = () => { if (cart.length && confirm('Cart khali kar dein?')) { cart = []; editing = null; co = null; renderCart(); } };
$('#btnOrders').onclick = openOrders;
$('#btnStation').onclick = async () => {
  const turnOn = !isStation();
  if (turnOn) { try { await api('/api/print/skip-old', {}); } catch (e) {} }   // purane jama orders ab nahi nikalenge
  localStorage.setItem('station', turnOn ? '1' : '0'); updStation(); if (turnOn) warmSlip();
  if (turnOn) toast('Printer ON: ab sirf naye orders ki slips nikalen gi'); };
$('#cartbar').onclick = () => $('#cart').classList.add('open');
$('#closeCart').onclick = () => $('#cart').classList.remove('open');
[$('#coModal'), $('#ordModal')].forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }));

updStation(); loadRiders();
load().catch(e => toast('Server se rabta nahi: ' + e.message, 6000));
