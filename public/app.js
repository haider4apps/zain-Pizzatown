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
  if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
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
async function load() {
  [menu, settings] = await Promise.all([api('/api/menu'), api('/api/settings')]);
  if (!menu.find(c => c.id === cur)) cur = menu.length ? menu[0].id : null;
  renderTabs(); renderMenu(); renderCart();
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
      b.onclick = () => { if (v.price > 0) { addToCart(i, v); b.classList.remove('hit'); card.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); card.classList.add('hit'); } else toast('Is ki price set nahi. Admin se price daalein.'); };
      chips.appendChild(b);
    });
    card.appendChild(chips); (gbox || box).appendChild(card);
  });
}

// ---------------- cart ----------------
function addToCart(item, v) {
  const l = cart.find(x => x.variant_id === v.id);
  if (l) l.qty++; else cart.push({ variant_id: v.id, name: item.name, label: v.label, price: v.price, qty: 1, note: '', extras: '' });
  renderCart();
}
const cartTotal = () => cart.reduce((s, l) => s + l.price * l.qty, 0);
function renderCart() {
  const body = $('#cartBody'); body.innerHTML = '';
  if (editing) {
    const eb = el('div', 'editbar', `<b>Order #${editing.order_no} badla ja raha hai</b><small>(naya number milega)</small><button class="btn" id="editStop">Chhor do</button>`);
    eb.querySelector('#editStop').onclick = stopEdit; body.appendChild(eb);
  }
  if (!cart.length) body.appendChild(el('div', 'empty', 'Cart khali hai.<br>Item ke size/price button par tap karein.'));
  cart.forEach((l, idx) => {
    const d = el('div', 'line');
    d.innerHTML = `<div class="l1"><span>${esc(l.name)}${l.label ? ' <small style="color:var(--mute)">(' + esc(l.label) + ')</small>' : ''}</span><span>${money(l.price * l.qty)}</span></div>
      <div class="l2"><div class="qty"><button data-a="-">−</button><span>${l.qty}</span><button data-a="+">+</button></div>
      <input class="note" placeholder="Note (kam mirch, bina pyaaz...)" value="${esc(l.note)}"></div>
      <div class="l3"><input class="extra" placeholder="+ Extras (extra cheese, extra drink...)" value="${esc(l.extras || '')}"></div>`;
    d.querySelectorAll('button').forEach(b => b.onclick = () => {
      l.qty += b.dataset.a === '+' ? 1 : -1;
      if (l.qty <= 0) cart.splice(idx, 1);
      renderCart();
    });
    d.querySelector('.note').oninput = e => (l.note = e.target.value);
    d.querySelector('.extra').oninput = e => (l.extras = e.target.value);
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
  ${co.type === 'dinein' ? `<div class="f"><label>Table / Token no. (optional)</label><input id="f_table" value="${esc(co.table_no)}"></div>` : ''}
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
  <div class="sum" id="sum"></div>
  <div class="two"><button class="btn" id="coCancel">Back</button><button class="btn gold" id="coOk">${editing ? 'Save change &amp; Print' : 'Save &amp; Print'}</button></div>`;
  sh.querySelectorAll('#typeSeg button').forEach(b => b.onclick = () => { readForm(); co.type = b.dataset.t; renderCheckout(); });
  sh.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => { readForm(); co.slip_lang = b.dataset.l; renderCheckout(); });
  sh.querySelectorAll('input,textarea,select').forEach(i => i.oninput = () => { readForm(); updSum(); });
  const fp = $('#f_pay'); if (fp) fp.onchange = () => { readForm(); renderCheckout(); };
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
}
function updSum() {
  const c = calc();
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
    const o = await api(editing ? '/api/orders/' + editing.id : '/api/orders', { method: editing ? 'PUT' : 'POST', headers: (giftPin || (editing && editing.pin)) ? { 'x-admin-pin': giftPin || editing.pin } : undefined, body: {
      type: co.type, table_no: co.table_no, customer_name: co.customer_name, phone: co.phone, address: co.address,
      rider: co.rider, discount: +co.discount || 0, delivery_charge: +co.delivery_charge || 0, service: co.service,
      payment: co.payment, gift_by: co.gift_by, note: co.note, slip_lang: co.slip_lang,
      items: cart.map(l => l.keep ? { keep: l.keep, qty: l.qty, note: l.note, extras: l.extras } : { variant_id: l.variant_id, qty: l.qty, note: l.note, extras: l.extras }) } });
    const wasEdit = editing ? editing.order_no : 0;
    cart = []; co = null; editing = null;
    $('#coModal').classList.remove('on'); $('#cart').classList.remove('open');
    renderCart();
    toast(wasEdit ? `#${wasEdit} cancel, naya order #${o.order_no} · ${money(o.total)}` : `Order #${o.order_no} save ho gaya · ${money(o.total)}` + (isStation() ? '' : ' · Print PC par hoga'), 3500);
    if (isStation()) pollPrint();
    loadRiders();
  } catch (e) { toast(e.message, 4000); }
  placing = false; const ok = $('#coOk'); if (ok) ok.disabled = false;
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
    cart = f.items.map(i => ({ keep: i.id, name: i.item_name, label: i.variant_label, price: i.price, qty: i.qty, note: i.note || '', extras: i.extras || '' }));
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
function updStation() { const b = $('#btnStation'); b.textContent = 'Printer: ' + (isStation() ? 'ON' : 'OFF'); b.classList.toggle('stn', isStation()); }
function printOne(id) {
  return new Promise(resolve => {
    const f = $('#printFrame'); let done = false;
    const fin = () => { if (done) return; done = true; window.removeEventListener('message', on); resolve(); };
    const on = e => { if (e.data && e.data.slipDone == id) fin(); };
    window.addEventListener('message', on);
    setTimeout(fin, 12000);
    f.src = '/slip.html?id=' + id + '&t=' + Date.now();
  });
}
async function pollPrint() {
  if (!isStation() || printing) return;
  printing = true;
  try {
    const ids = await api('/api/print/pending');
    for (const id of ids) { await printOne(id); await api(`/api/orders/${id}/printed`, {}); }
  } catch (e) { /* server band ho to agli dafa try hoga */ }
  printing = false;
}
setInterval(pollPrint, 3000);

async function loadRiders() {
  try { const r = await api('/api/riders'); $('#riders').innerHTML = r.map(x => `<option value="${esc(x)}">`).join(''); } catch (e) {}
}

// ---------------- voice order ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let vo = { lang: 'en-IN', text: '', res: null, rec: null, listening: false };
function addQty(item, v, qty) {
  const l = cart.find(x => x.variant_id === v.id);
  if (l) l.qty += qty; else cart.push({ variant_id: v.id, name: item.name, label: v.label, price: v.price, qty, note: '', extras: '' });
}
function openVoice() {
  vo.res = null; vo.text = '';
  let m = $('#voiceModal');
  if (!m) { m = el('div', 'modal'); m.id = 'voiceModal'; m.innerHTML = '<div class="sheet" id="voiceSheet"></div>'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) closeVoice(); }); }
  m.classList.add('on'); renderVoice();
}
function closeVoice() { try { vo.rec && vo.rec.stop(); } catch (e) {} vo.listening = false; $('#voiceModal').classList.remove('on'); }
function renderVoice() {
  const sh = $('#voiceSheet');
  const canMic = SR && window.isSecureContext;
  const lines = vo.res ? vo.res.lines : [];
  sh.innerHTML = `<h3>Voice order</h3>
  ${canMic ? `<div class="seg two-seg" id="vLang"><button data-l="en-IN" class="${vo.lang === 'en-IN' ? 'on' : ''}">Roman / English</button><button data-l="ur-PK" class="${vo.lang === 'ur-PK' ? 'on' : ''}">اردو</button></div>
  <button class="btn ${vo.listening ? 'red' : 'gold'}" id="vMic" style="padding:16px;font-size:18px">${vo.listening ? '■ Ruk jao (sun raha hoon...)' : '🎤 Bolna shuru karein'}</button>`
    : `<div style="color:var(--mute);font-size:13px">${SR ? 'Is device par mic band hai (http address). Keyboard ke mic 🎤 se bol kar niche likhwayein.' : 'Is browser mein voice nahi. Keyboard ke mic 🎤 se bol kar niche likhwayein.'}</div>`}
  <div class="f"><label>Abhi jo bola / likha (har baar bolne par list mein judta jata hai)</label><textarea id="vText" rows="2" placeholder="e.g. do large fajita pizza, ek zinger, teen cold drink 500ml">${esc(vo.text)}</textarea></div>
  <button class="btn" id="vParse">Samjho aur list mein jodo</button>
  <div id="vRes">${vo.res ? (lines.length ? lines.map((l, i) => `<div class="vline ${l.uncertain ? 'unsure' : ''}">
      <div class="qty"><button data-i="${i}" data-a="-">−</button><span>${l.qty}</span><button data-i="${i}" data-a="+">+</button></div>
      <div style="flex:1"><b>${esc(l.item.name)}</b><br><select data-i="${i}" data-a="v">${l.item.variants.filter(v => v.price > 0).map(v => `<option value="${v.id}" ${v.id === l.variant.id ? 'selected' : ''}>${esc(v.label || 'Regular')} · Rs ${v.price}</option>`).join('')}</select></div>
      <button class="btn red" data-i="${i}" data-a="x">✕</button></div>`).join('') : '<div class="empty" style="margin:6px">Koi item nahi samjha</div>') +
      vo.res.unmatched.map(u => `<div style="color:var(--red);font-size:13px">Samajh nahi aaya (ya price set nahi): ${esc(u)}</div>`).join('') : ''}</div>
  <div class="two"><button class="btn" id="vClose">Band</button><button class="btn gold" id="vAdd" ${lines.length ? '' : 'disabled'}>Cart mein daalo</button></div>`;
  const mic = $('#vMic'); if (mic) mic.onclick = toggleMic;
  sh.querySelectorAll('#vLang button').forEach(b => b.onclick = () => { vo.lang = b.dataset.l; renderVoice(); });
  $('#vText').oninput = e => (vo.text = e.target.value);
  $('#vParse').onclick = () => { vo.text = $('#vText').value; doParse(); };
  $('#vClose').onclick = closeVoice;
  $('#vAdd').onclick = () => { vo.res.lines.forEach(l => addQty(l.item, l.variant, l.qty)); renderCart(); vo.res = null; vo.text = ''; renderVoice(); toast('Cart mein daal diya. Aur bolna ho to bolte rahein, warna Band dabayein', 3500); };
  sh.querySelectorAll('#vRes [data-a]').forEach(b => {
    const l = vo.res.lines[+b.dataset.i], a = b.dataset.a;
    if (a === 'v') b.onchange = () => { l.variant = l.item.variants.find(v => v.id === +b.value); l.uncertain = false; renderVoice(); };
    else b.onclick = () => { if (a === '+') l.qty++; if (a === '-') l.qty = Math.max(1, l.qty - 1); if (a === 'x') vo.res.lines.splice(+b.dataset.i, 1); renderVoice(); };
  });
}
function doParse() {
  // Har nayi baat purani list mein judti hai (purane items nahi urte)
  const r = VoiceParse.parse(vo.text, menu);
  if (!vo.res) vo.res = { lines: [], unmatched: [] };
  r.lines.forEach(n => {
    const ex = vo.res.lines.find(l => l.item.id === n.item.id && l.variant.id === n.variant.id);
    if (ex) ex.qty += n.qty; else vo.res.lines.push(n);
  });
  vo.res.unmatched = vo.res.unmatched.concat(r.unmatched || []);
  vo.text = '';
  renderVoice();
}
function toggleMic() {
  if (vo.listening) { try { vo.rec.stop(); } catch (e) {} return; }
  const r = new SR(); vo.rec = r; r.lang = vo.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onstart = () => { vo.listening = true; renderVoice(); };
  r.onresult = e => { vo.text = [...e.results].map(x => x[0].transcript).join(' '); const t = $('#vText'); if (t) t.value = vo.text; };
  r.onerror = e => { vo.listening = false; toast(e.error === 'not-allowed' ? 'Mic ki ijazat nahi. Chrome ke address bar mein mic Allow karein' : e.error === 'network' ? 'Voice ke liye internet chahiye' : e.error === 'no-speech' ? 'Awaaz nahi aayi, dobara bolein' : 'Voice error: ' + e.error, 4000); renderVoice(); };
  r.onend = () => { vo.listening = false; if (vo.text.trim()) doParse(); else renderVoice(); };
  try { r.start(); } catch (e) { toast('Mic start nahi hua'); }
}

// ---------------- wiring ----------------
$('#search').oninput = e => { query = e.target.value.trim().toLowerCase(); renderTabs(); renderMenu(); };
$('#checkoutBtn').onclick = openCheckout;
$('#clearCart').onclick = () => { if (cart.length && confirm('Cart khali kar dein?')) { cart = []; editing = null; co = null; renderCart(); } };
$('#btnOrders').onclick = openOrders;
$('#btnVoice').onclick = openVoice;
$('#btnStation').onclick = () => { localStorage.setItem('station', isStation() ? '0' : '1'); updStation(); if (isStation()) toast('Is device se ab slips print hongi'); };
$('#cartbar').onclick = () => $('#cart').classList.add('open');
$('#closeCart').onclick = () => $('#cart').classList.remove('open');
[$('#coModal'), $('#ordModal')].forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }));

updStation(); loadRiders();
load().catch(e => toast('Server se rabta nahi: ' + e.message, 6000));
