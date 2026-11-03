const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const TYPES = { dinein: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };
let PIN = sessionStorage.getItem('pin') || '', catId = null, tab = location.hash === '#stock' ? 'stock' : 'menu';
const view = $('#view');

let toastT;
function toast(m, ms = 1800) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => (t.style.display = 'none'), ms); }
async function A(url, method, body) {
  const r = await fetch('/api/admin' + url, { method: method || 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-pin': PIN }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
async function guard(fn) { try { return await fn(); } catch (e) { toast(e.message, 3500); } }

// ---------- login ----------
async function login(pin) {
  PIN = pin;
  try { await A('/login'); sessionStorage.setItem('pin', pin); $('#login').style.display = 'none'; $('#main').style.display = 'flex'; show(); }
  catch (e) { PIN = ''; sessionStorage.removeItem('pin'); $('#login').style.display = ''; $('#main').style.display = 'none'; if (pin) toast('PIN ghalat hai'); }
}
$('#pinOk').onclick = () => login($('#pin').value);
$('#pin').onkeydown = e => { if (e.key === 'Enter') login($('#pin').value); };
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); show(); };
// Har button par mouse rakhne se us ka maqsad (title)
const TIPS = {
  '[data-act="cnt"]': 'Ginti: dukaan mein asal kitna pada hai gin kar likhein (pack + khula). Stock seedha us par set ho jata hai.',
  '[data-act="min"]': 'Kam-az-kam: is se kam stock reh jaye to peela alert. (3 din wala alert is ke ilawa khud bhi chalta hai)',
  '[data-act="pack"]': 'Pack size: 1 pack mein kitna aata hai. Sirf tab badlein jab company pack badle (Admin PIN).',
  '[data-act="rate"]': 'Rate: 1 pack kitne Rs ka. "Saman aaya" mein Rs likhne se khud update hota hai.',
  '[data-act="cx"]': 'Order cancel: sale se nikal jaye ga (Sheet mein ulti entry).',
  '[data-act="pv"]': 'Slip dekhein (print nahi hogi)', '[data-act="rp"]': 'Slip dobara print karein',
  '[data-act="dx"]': 'Ye kharcha delete karein', '[data-act="addvar"]': 'Is item ka naya size / qeemat jorein',
  '[data-act="additem"]': 'Is section mein naya item jorein', '[data-act="restore"]': 'Delete kiya hua wapas laayein',
  '#iAdd': 'Saman stock mein jorein (Rs zaroori, kharcha bhi khud banta hai)', '#iPacks': 'Kitne pack aaye (pack size se kg/piece khud banenge)',
  '#iQty': 'Ya kul miqdar (kg / litre / piece)', '#iAmt': 'Kul kitne Rs diye (zaroori)', '#iItem': 'Kaunsa saman aaya (kam/khatam wala upar)',
  '#bSave': 'Neeche likhi sab miqdar aik saath stock par set karein', '#dmGo': 'Chune hue din ke hisaab se kya mangwana hai',
  '#dmDays': 'Kitne din ka saman mangwana hai', '#dmPrint': 'Demand slip thermal printer par', '#dmAdd': 'List mein koi aur saman haath se jorein',
  '#go': 'Upar chuni dates ki report', '[data-rng="0"]': 'Aaj ki sale', '[data-rng="7"]': 'Pichle 7 din', '[data-rng="30"]': 'Pichle 30 din',
  '#eAdd': 'Kharcha likhein', '#saveS': 'Settings save karein', '#updCheck': 'GitHub par naya version hai ya nahi', '#updGo': 'Naya version lagayein',
  '#syncNow': 'Abhi Google Sheet par bhej dein', '#pvS': 'Aakhri order ki slip ka preview',
  '#tabs [data-t="menu"]': 'Menu ke items aur qeematein', '#tabs [data-t="sales"]': 'Sale, profit aur orders', '#tabs [data-t="exp"]': 'Roz ke kharche',
  '#tabs [data-t="stock"]': 'Stock, saman aaya, demand slip, recipes', '#tabs [data-t="set"]': 'Shop, printer, Sheet aur update ki settings',
};
function applyTips(root) { Object.entries(TIPS).forEach(([q, t]) => root.querySelectorAll(q).forEach(e => { if (!e.title) e.title = t; })); }
new MutationObserver(() => applyTips(document)).observe(document.body, { childList: true, subtree: true });
function show() { document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === tab)); view.onchange = view.onclick = null; ({ menu: viewMenu, sales: viewSales, exp: viewExpenses, stock: viewStock, set: viewSettings })[tab](); }

// ---------- live search: likhte hi list chhoti hoti jaye ----------
// Likha hua page dobara banne par bhi yaad rehta hai (Ginti/Rate ke baad search na mite)
window._q = window._q || {};
const sNorm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
// "L" likha ho to "large" se bhi mile (M = medium, S = small)
const sSize = t => { t = ' ' + sNorm(t).replace(/[()·,]/g, ' ') + ' '; return t + (/ l /.test(t) ? ' large' : '') + (/ m /.test(t) ? ' medium' : '') + (/ s /.test(t) ? ' small' : ''); };
const sBar = (id, ph) => `<div class="sbar"><input type="search" id="${id}" placeholder="🔍 ${esc(ph)}" autocomplete="off" value="${esc(window._q[id] || '')}"><small class="sc"></small></div>`;
// rows: function jo filter hone wali rows de. textOf: kis text mein dhoondna hai (default pehla khana)
// Group heading rows (class "gh") khud chhup jati hain agar un ke neeche kuch na bache
function liveFilter(id, rows, { textOf, after } = {}) {
  const inp = $('#' + id); if (!inp) return () => {};
  const tx = textOf || (r => r.dataset.s !== undefined ? r.dataset.s : r.cells ? (r.cells[0] || {}).textContent : r.textContent);
  const run = () => {
    window._q[id] = inp.value;
    const words = sNorm(inp.value).split(' ').filter(Boolean); let shown = 0, total = 0;
    const list = rows();
    list.forEach(r => {
      if (r.classList.contains('gh')) return;
      total++; const t = sSize(tx(r)); const ok = !words.length || words.every(w => t.includes(w));
      r.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    list.filter(r => r.classList.contains('gh')).forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('gh')) { if (n.style.display !== 'none') { any = true; break; } n = n.nextElementSibling; }
      h.style.display = !words.length || any ? '' : 'none';
    });
    const sc = inp.parentElement.querySelector('.sc');
    if (sc) sc.textContent = words.length ? (shown ? `${shown} / ${total} mile` : 'Kuch nahi mila') : '';
    if (after) after(words.length > 0);
  };
  inp.oninput = run; run();
  return run;
}

// ---------- pakki tasdeeq (ghalti se delete na ho) ----------
function sureDelete(title, what) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal on';
    m.innerHTML = `<div class="sheet" style="max-width:440px"><h3 style="color:#ffb4a8">⚠ ${esc(title)}</h3>
      <div style="font-size:16px;line-height:1.5"><b>${esc(what)}</b> menu se hat jayega.<br>Pakka karne ke liye neeche <b>HATAO</b> likhein.</div>
      <input id="sdIn" placeholder="HATAO" autocomplete="off" style="text-transform:uppercase">
      <div style="color:var(--mute);font-size:13px">Ghalti ho jaye to neeche "Delete kiye hue" se wapas laa sakte hain.</div>
      <div class="two"><button class="btn" id="sdNo">Nahi, wapas</button><button class="btn red" id="sdYes" disabled>Haan, hatao</button></div></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector('#sdIn'), yes = m.querySelector('#sdYes');
    inp.oninput = () => { yes.disabled = inp.value.trim().toUpperCase() !== 'HATAO'; };
    const done = v => { m.remove(); res(v); };
    m.querySelector('#sdNo').onclick = () => done(false);
    yes.onclick = () => done(true);
    m.onclick = e => { if (e.target === m) done(false); };
    inp.focus();
  });
}

// ---------- menu ----------
async function viewMenu() {
  const [menu, trash] = await Promise.all([A('/menu'), A('/trash')]);
  const tn = trash.categories.length + trash.items.length + trash.variants.length;
  if (!menu.find(c => c.id === catId)) catId = menu[0] && menu[0].id;
  const c = menu.find(x => x.id === catId);
  const inp = (k, id, f, val, ph = '') => `<input data-k="${k}" data-id="${id}" data-f="${f}" value="${esc(val)}" placeholder="${ph}">`;
  view.innerHTML = `
  <div class="box">
    <div class="r"><select id="catSel">${menu.map(m => `<option value="${m.id}" ${m.id === catId ? 'selected' : ''}>${esc(m.name)}${m.active ? '' : ' (hidden)'}</option>`).join('')}</select>
      <button class="btn s" data-act="addcat">+ New section</button></div>
    <div style="color:var(--mute);font-size:13px">Har size ki <b>Price</b> (customer se). Lagat (cost) recipe aur stock ke rate se khud nikalti hai (Stock → Recipe).</div>
    ${c ? `<div class="r">${inp('categories', c.id, 'name', c.name, 'Section name')}${inp('categories', c.id, 'name_ur', c.name_ur, 'Urdu name')}
      <label class="s"><input type="checkbox" data-k="categories" data-id="${c.id}" data-f="active" ${c.active ? 'checked' : ''}> Show</label></div>` : ''}
  </div>
  ${c ? `<div class="box"><b style="color:var(--gold)">Naya item add karein (${esc(c.name)})</b>
    <div class="r"><input id="nName" placeholder="Item name (e.g. Pepsi)"><input id="nGrp" placeholder="Group (optional)"><input id="nDet" placeholder="Details (optional)"></div>
    <div class="r"><input id="nLabel" placeholder="Size label (e.g. 500ml, L)"><input id="nPrice" type="number" min="0" placeholder="Price"><button class="btn gold s" data-act="additem">+ Add item</button></div></div>
  <div class="box">${sBar('qMenu', 'Menu mein item dhoondein (saare sections)')}<div id="mHits" class="r" style="flex-wrap:wrap"></div></div>
  ${c.items.map(i => `<div class="item ${i.active ? '' : 'off'}">
    <div class="r">${inp('items', i.id, 'name', i.name, 'Name')}${inp('items', i.id, 'grp', i.grp, 'Group')}${inp('items', i.id, 'details', i.details, 'Details')}
      <label class="s"><input type="checkbox" data-k="items" data-id="${i.id}" data-f="active" ${i.active ? 'checked' : ''}> Available</label></div>
    ${i.variants.map(v => `<div class="vrow">
      <input type="text" data-k="variants" data-id="${v.id}" data-f="label" value="${esc(v.label)}" placeholder="Size (S / M / L / 500ml)">
      <input type="number" min="0" title="Sale price" data-k="variants" data-id="${v.id}" data-f="price" value="${v.price}" placeholder="Price">
      <label><input type="checkbox" data-k="variants" data-id="${v.id}" data-f="active" ${v.active ? 'checked' : ''}> On</label></div>`).join('')}
    <div><button class="btn" data-act="addvar" data-id="${i.id}">+ Size / price</button></div></div>`).join('') || '<div class="box">Is section mein abhi koi item nahi</div>'}` : ''}
  ${tn ? '' : '<!--'}<div class="box"><b style="color:var(--mute)">Delete kiye hue (${tn})</b>
    ${tn ? `<table>${trash.categories.map(x => `<tr><td>Section</td><td><b>${esc(x.name)}</b></td><td><button class="btn gold s" data-act="restore" data-k="categories" data-rid="${x.id}">Wapas lao</button></td></tr>`).join('')}
      ${trash.items.map(x => `<tr><td>${esc(x.cat)}${x.grp ? ' · ' + esc(x.grp) : ''}</td><td><b>${esc(x.name)}</b></td><td><button class="btn gold s" data-act="restore" data-k="items" data-rid="${x.id}">Wapas lao</button></td></tr>`).join('')}
      ${trash.variants.map(x => `<tr><td>Size</td><td><b>${esc(x.name)}</b> ${esc(x.label || '')} Rs ${x.price}</td><td><button class="btn gold s" data-act="restore" data-k="variants" data-rid="${x.id}">Wapas lao</button></td></tr>`).join('')}</table>`
      : ''}</div>${tn ? '' : '-->'}
  <div style="color:var(--mute);font-size:13px">Koi item band karna ho to "Available" ka tick hata dein. Mitana ho to developer se kahein.</div>`;

  // Is section mein filter + doosre sections mein jo mile un ke button (dabane se wahan chale jayein)
  liveFilter('qMenu', () => [...view.querySelectorAll('.item')], { textOf: d => [...d.querySelectorAll('input:not([type=checkbox])')].map(x => x.value).join(' '), after: on => {
    const words = sNorm($('#qMenu').value).split(' ').filter(Boolean), hb = $('#mHits');
    const hits = on ? menu.filter(m => m.id !== catId).flatMap(m => m.items.filter(i => { const t = sSize(m.name + ' ' + i.name + ' ' + (i.grp || '') + ' ' + i.variants.map(v => v.label).join(' ')); return words.every(w => t.includes(w)); }).map(i => ({ m, i }))) : [];
    hb.innerHTML = hits.length ? `<small style="color:var(--mute);width:100%">Doosre sections mein bhi mila (dabayein):</small>` + hits.slice(0, 30).map(h => `<button class="btn s" data-goc="${h.m.id}">${esc(h.m.name)} › ${esc(h.i.name)}</button>`).join('') : '';
    const sc = $('#qMenu').parentElement.querySelector('.sc'); if (hits.length && sc.textContent === 'Kuch nahi mila') sc.textContent = 'Is section mein nahi';
    hb.style.justifyContent = 'flex-start';
    hb.querySelectorAll('[data-goc]').forEach(b => (b.onclick = () => { catId = +b.dataset.goc; viewMenu(); }));
  } });
  $('#catSel').onchange = e => { catId = +e.target.value; viewMenu(); };
  view.onchange = e => guard(async () => {
    const t = e.target; const k = t.dataset.k; if (!k) return;
    const val = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value;
    await A(`/${k}/${t.dataset.id}`, 'PUT', { [t.dataset.f]: val });
    toast('Saved ✓');
    if (t.dataset.f === 'active' && k !== 'variants') viewMenu();
  });
  view.onclick = e => guard(async () => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'addcat') { const name = prompt('Naye section ka naam:'); if (name) { const r = await A('/categories', 'POST', { name }); catId = r.id; viewMenu(); } }
    if (a === 'delcat' && await sureDelete('Poora section delete', c.name + ' (saare items samet)')) { await A('/categories/' + id, 'DELETE'); catId = null; toast('Section hata diya'); viewMenu(); }
    if (a === 'delitem') { const it = c.items.find(x => x.id == id); if (await sureDelete('Item delete', it ? it.name : 'Item')) { await A('/items/' + id, 'DELETE'); toast('Item hata diya'); viewMenu(); } }
    if (a === 'delvar') { const it = c.items.find(x => x.variants.some(v => v.id == id)), v = it && it.variants.find(v => v.id == id); if (await sureDelete('Size delete', (it ? it.name : '') + (v && v.label ? ' ' + v.label : '') + (v ? ' Rs ' + v.price : ''))) { await A('/variants/' + id, 'DELETE'); toast('Size hata diya'); viewMenu(); } }
    if (a === 'restore') { await A(`/restore/${b.dataset.k}/${b.dataset.rid}`, 'POST'); toast('Wapas aa gaya ✓'); viewMenu(); }
    if (a === 'addvar') { await A(`/items/${id}/variants`, 'POST', { label: '', price: 0 }); viewMenu(); }
    if (a === 'additem') {
      const name = $('#nName').value.trim(); if (!name) return toast('Item ka naam likhein');
      await A('/items', 'POST', { category_id: catId, name, grp: $('#nGrp').value, details: $('#nDet').value, variants: [{ label: $('#nLabel').value, price: $('#nPrice').value || 0, cost: 0 }] });
      toast('Item add ho gaya ✓'); viewMenu();
    }
  });
}

// ---------- sales ----------
let from = '', to = '';
const shiftDay = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
let ordDay = '';
async function viewSales() {
  const r = await A(`/report?from=${from}&to=${to}&ord_day=${ordDay}`);
  ordDay = r.ord_day;
  from = r.from; to = r.to;
  const t = r.totals;
  const tbl = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" style="color:var(--mute)">—</td></tr>`}</table>`;
  view.innerHTML = `
  <div class="box"><div class="r"><button class="btn s" id="dPrev" title="Pichla din / pichli muddat">◀</button><div class="f"><label>From</label><input type="date" id="dFrom" value="${from}"></div><div class="f"><label>To</label><input type="date" id="dTo" value="${to}"></div><button class="btn s" id="dNext" title="Agla din / agli muddat">▶</button>
    <button class="btn gold s" id="go">Show</button>
    ${[[0, 'Aaj'], [7, '7 din'], [30, '30 din']].map(([n, t]) => { const on = to === r.now && from === shiftDay(r.now, n ? -(n - 1) : 0); return `<button class="btn s rng${on ? ' on' : ''}" data-rng="${n}">${on ? '✓ ' : ''}${t}</button>`; }).join('')}</div>
    <small style="color:var(--mute)">Dikh raha hai: <b style="color:var(--gold)">${from === to ? from : from + ' se ' + to}</b> (${Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1} din)</small></div>
  <div class="cards">
    <div class="stat"><small>Orders</small><b>${t.n}</b></div><div class="stat"><small>Total sale</small><b>${money(t.total)}</b></div>
    <div class="stat"><small>Discount</small><b>${money(t.discount)}</b></div><div class="stat"><small>Delivery charges</small><b>${money(t.delivery)}</b></div>
    <div class="stat"><small>Service charges</small><b>${money(t.service)}</b></div>
    <div class="stat"><small>Cost (lagat)</small><b>${money(t.cost)}</b></div><div class="stat"><small>Profit (items)</small><b>${money(t.profit)}</b></div>
    <div class="stat"><small>Kharcha</small><b>${money(t.expenses)}</b></div><div class="stat"><small>Net profit</small><b style="color:${t.net < 0 ? 'var(--red)' : 'var(--gold)'}">${money(t.net)}</b></div></div>
  ${r.missing_cost ? `<div class="box" style="border-color:var(--red)">⚠ ${r.missing_cost} items/sizes saman ka rate abhi nahi - un ki lagat 0 ginti hai aur profit zyada dikhega. Stock mein "Saman aaya" ke saath Rs likhein ya Rate daalein.</div>` : ''}
  <div class="box" id="dayBox"><b>Din ba din</b>${tbl(['Date', 'Orders', 'Sale', 'Cost', 'Profit', 'Kharcha', 'Net'], r.days.map(d => [d.d, d.n, money(d.total), money(d.cost), money(d.profit), money(d.expenses), money(d.net)]))}</div>
  <div class="box"><b>Order type</b>${tbl(['Type', 'Orders', 'Amount'], r.by_type.map(x => [TYPES[x.type], x.n, money(x.total)]))}
    <b>Payment</b>${tbl(['Method', 'Orders', 'Amount'], r.by_payment.map(x => [x.payment === 'Gift' ? 'Gift / Free' : x.payment, x.n, money(x.total)]))}
    ${r.gifts.length ? `<b>Gift / Free orders (kis ne diye)</b>${tbl(['Kis ki taraf se', 'Orders', 'Bill value', 'Lagat (nuqsan)'], r.gifts.map(g => [esc(g.by_whom), g.n, money(g.value), money(g.cost)]))}` : ''}
    <b>Delivery riders</b>${tbl(['Rider', 'Orders', 'Total collected', 'Delivery charges'], r.riders.map(x => [esc(x.rider || '(no name)'), x.n, money(x.total), money(x.delivery)]))}</div>
  <div class="box" id="topBox"><div class="r"><b style="flex:1">Har item ki sale aur profit <small style="color:var(--mute);font-weight:400">(${r.top.length} items, zyada bikne wale upar)</small></b>${r.top.length > 15 ? '<button class="btn s" id="topAll"></button>' : ''}</div>${r.top.length > 5 ? sBar('qTop', 'Item dhoondein (maslan zinger, large, deal)') : ''}${tbl(['Item', 'Qty', 'Amount', 'Profit'], r.top.map(x => [esc(x.item_name + (x.variant_label ? ' (' + x.variant_label + ')' : '')), x.qty, money(x.amount), money(x.profit)]))}</div>
  <div class="box" id="ordBox"><div class="r"><b style="flex:1">Orders</b>${(() => { const i = r.order_days.indexOf(r.ord_day);
      return `<button class="btn s" id="oPrev" ${i < 0 || i >= r.order_days.length - 1 ? 'disabled' : ''} title="Pichla din (jis mein orders thay)">◀</button><b style="color:var(--gold);min-width:110px;text-align:center">${r.ord_day}</b><button class="btn s" id="oNext" ${i <= 0 ? 'disabled' : ''} title="Agla din">▶</button>`; })()}</div>
    ${r.orders.length > 5 ? sBar('qOrd', 'Order dhoondein (number, naam, table, rider, Rs)') : ''}<small style="color:var(--mute)">Sirf aik din ke orders (subah ${'5'} baje counter reset tak aik din). ◀ ▶ se doosre din. ${r.orders.length} orders.</small>${tbl(['#', 'Date', 'Time', 'Type', 'Who', 'Total', ''], r.orders.map(o => [
    o.order_no, o.business_date, o.created_at.slice(11, 16), TYPES[o.type], esc(o.customer_name || o.table_no || o.rider || ''),
    o.status === 'cancelled' ? '<s style="color:var(--red)">' + money(o.total) + '</s>' : money(o.total),
    `<button class="btn" data-act="pv" data-id="${o.id}">View</button> <button class="btn" data-act="rp" data-lang="ur" data-id="${o.id}">Reprint اردو</button> <button class="btn" data-act="rp" data-lang="en" data-id="${o.id}">Reprint EN</button> ` +
    (o.status === 'done' && o.cancel_left > 0 ? `<button class="btn red" data-act="cx" data-id="${o.id}">Cancel</button>` : '')]))}</div>`;
  // Pehle 15 dikhte hain; search karein ya "Saare dikhao" to sab
  const topRows = () => [...$('#topBox').querySelectorAll('tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD');
  const topCut = on => { const all = window._topAll || on; topRows().forEach((x, i) => { if (i >= 15 && !all) x.style.display = 'none'; });
    if ($('#topAll')) { $('#topAll').hidden = on; $('#topAll').textContent = window._topAll ? 'Sirf top 15' : `Saare dikhao (${r.top.length})`; } };
  const topRun = liveFilter('qTop', topRows, { after: topCut });
  if (!$('#qTop')) topCut(false);
  if ($('#topAll')) $('#topAll').onclick = () => { window._topAll = !window._topAll; topRun(); };
  liveFilter('qOrd', () => [...view.querySelectorAll('#ordBox tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD'), { textOf: x => [...x.cells].slice(0, 6).map(c => c.textContent).join(' ') });
  const oi = r.order_days.indexOf(r.ord_day);
  if ($('#oPrev')) $('#oPrev').onclick = () => { ordDay = r.order_days[oi + 1]; viewSales(); };
  if ($('#oNext')) $('#oNext').onclick = () => { ordDay = r.order_days[oi - 1]; viewSales(); };
  const busy = b => { if (b) { b.disabled = true; b.textContent = '⏳ ' + b.textContent.replace('✓ ', ''); } };
  const span = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1;
  $('#dPrev').onclick = () => { busy($('#dPrev')); ordDay = ''; from = shiftDay(from, -span); to = shiftDay(to, -span); viewSales(); };
  $('#dNext').onclick = () => { busy($('#dNext')); ordDay = ''; from = shiftDay(from, span); to = shiftDay(to, span); viewSales(); };
  $('#go').onclick = () => { busy($('#go')); ordDay = ''; from = $('#dFrom').value; to = $('#dTo').value || from; viewSales(); };
  view.onclick = e => guard(async () => {
    const rg = e.target.closest('[data-rng]');
    if (rg) { busy(rg); ordDay = ''; const n = +rg.dataset.rng; to = r.now; from = shiftDay(r.now, n ? -(n - 1) : 0); viewSales(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'pv') window.open('/slip.html?preview=1&id=' + id, '_blank');
    if (b.dataset.act === 'rp') { await fetch(`/api/orders/${id}/reprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: b.dataset.lang }) }); toast('Reprint queue mein gaya (Printer ON wale PC par niklegi)', 3000); }
    if (b.dataset.act === 'cx' && confirm('Ye order cancel karein? Sale se nikal jaye ga.')) { await A(`/orders/${id}/cancel`, 'POST'); viewSales(); }
  });
}

// ---------- expenses ----------
// Group list: menu ki categories + Raw saman (+ purane items ke group)
const grpList = (cats, items) => [...new Set(cats.concat(['Raw saman'], items.map(i => i.grp || 'Dusra')))];
// Menu group -> us group ke menu items seedhe (stock khud banta hai). Raw saman -> banaye hue stock items
function grpItems(items, g, vars) {
  const mv = (vars || []).filter(v => v.cat === g);
  if (mv.length) {
    const bal = Object.fromEntries(items.map(i => [i.id, i]));
    return '<option value="">Item chunein</option>' + mv.map(v => { const one = v.recipe.length === 1 ? bal[v.recipe[0].item_id] : null;
      return `<option value="v${v.id}">${esc(v.name)}${v.label ? ' ' + esc(v.label) : ''}${one ? ` (bacha ${one.bal})` : ''}</option>`; }).join('');
  }
  const l = items.filter(i => (i.grp || 'Dusra') === g);
  return l.length ? '<option value="">Item chunein</option>' + l.map(i => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('') : '<option value="">Koi item nahi (neeche "Naya stock item" se banayen)</option>';
}
const pickBody = val => String(val).startsWith('v') ? { variant_id: String(val).slice(1) } : { item_id: val };
const EXP_CATS = ['Gas', 'Petrol', 'Salary', 'Rent', 'Bijli/Pani', 'Rider', 'Repair', 'Other'];
async function viewExpenses() {
  const r = await A('/report'); // sirf aaj ki date lene ke liye
  const day = window._expDay || r.from;
  const month = day.slice(0, 7), mode = window._expMode || 'day';
  const list = mode === 'day' ? await A(`/expenses?from=${day}&to=${day}`) : await A(`/expenses?from=${month}-01&to=${month}-31`);
  const [st, rcv] = await Promise.all([A('/stock').then(x => x.items), A('/recipes').then(x => x.variants)]);
  const mcats = [...new Set(rcv.map(v => v.cat))];
  const sum = list.reduce((s, x) => s + x.amount, 0);
  view.innerHTML = `<div class="box"><b style="color:var(--gold)">Kharcha likhein</b>
    <div class="r"><input type="date" id="eDate" value="${day}"><select id="eCat"><option value="">Kharcha kis cheez ka? (chunein)</option>
      ${EXP_CATS.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
    <div class="r" id="eStockRow" hidden><select id="eStock"><option value="">Item chunein</option></select><input id="eQty" type="number" step="any" min="0" placeholder="Kitne aaye (tadaad)"></div>
    <div class="r"><input id="eAmt" type="number" min="1" placeholder="Kul kitne Rs diye"><input id="eNote" placeholder="Note (zaroori nahi)"><button class="btn gold s" id="eAdd">+ Add</button></div>
    <small style="color:var(--mute)">Ek entry = ek kharcha. Saman (cheese, dabbe wagera) <b>Stock → Saman aaya</b> se likhein, wahan se kharcha bhi khud ban jata hai.</small></div>
    <div class="box"><div class="r"><b style="flex:1 1 auto">${mode === 'day' ? day + ' ka' : month + ' ka'} kharcha: ${money(sum)}</b>
      <input type="date" id="vDate" class="n" value="${day}"><button class="btn s${mode === 'day' ? ' gold' : ''}" id="vDay">Sirf yeh din</button><button class="btn s${mode === 'month' ? ' gold' : ''}" id="vMon">Poora mahina</button></div>${list.length > 5 ? sBar('qExp', 'Kharcha dhoondein (category, note, Rs)') : ''}<table><tr><th>Date</th><th>Category</th><th>Note</th><th>Rs</th><th></th></tr>
    ${list.map(x => `<tr><td>${x.date}</td><td>${esc(x.category)}</td><td>${esc(x.note)}</td><td>${money(x.amount)}</td><td><button class="btn red" data-act="dx" data-id="${x.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--mute)">—</td></tr>'}</table></div>`;
  liveFilter('qExp', () => [...view.querySelectorAll('tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD' && x.cells.length > 1), { textOf: x => [...x.cells].slice(0, 4).map(c => c.textContent).join(' ') });
  $('#eDate').onchange = e => { window._expDay = e.target.value; viewExpenses(); };
  $('#vDate').onchange = e => { if (e.target.value) { window._expDay = e.target.value; viewExpenses(); } };
  $('#vDay').onclick = () => { window._expMode = 'day'; viewExpenses(); };
  $('#vMon').onclick = () => { window._expMode = 'month'; viewExpenses(); };
  $('#eCat').onchange = () => {
    const v = $('#eCat').value, g = v.startsWith('g:') ? v.slice(2) : '';
    $('#eStockRow').hidden = !g;
    if (g) $('#eStock').innerHTML = grpItems(st, g, rcv);
  };
  $('#eAdd').onclick = () => guard(async () => {
    if (!$('#eCat').value) throw new Error('Pehle chunein: kharcha kis cheez ka hai');
    if ($('#eCat').value.startsWith('g:')) {
      if (!$('#eStock').value) throw new Error('Item chunein');
      if (!(+$('#eAmt').value > 0)) throw new Error('Kul kitne Rs diye, likhein');
      await A('/stock/in', 'POST', { ...pickBody($('#eStock').value), qty: $('#eQty').value, amount: $('#eAmt').value, date: $('#eDate').value, note: $('#eNote').value });
      toast('Kharcha + stock likh liya ✓'); viewExpenses(); return;
    }
    await A('/expenses', 'POST', { date: $('#eDate').value, category: $('#eCat').value, note: $('#eNote').value, amount: $('#eAmt').value });
    toast('Kharcha likh liya ✓'); viewExpenses();
  });
  view.onclick = e => guard(async () => {
    const b = e.target.closest('[data-act="dx"]'); if (!b) return;
    if (confirm('Ye kharcha delete karein?')) { await A('/expenses/' + b.dataset.id, 'DELETE'); viewExpenses(); }
  });
}


// ---------- stock ----------
const UNITS = ['kg', 'gram', 'litre', 'piece', 'packet', 'dozen', 'carton', 'bottle'];
const ST_TXT = { out: ['khatam', '#ffb4a8', '#5a2020'], low: ['kam hai', '#f5c04a', '#4a3a14'], ok: ['theek', '#8fd19e', '#1d3a26'], unset: ['stock nahi likha', '#c9c9c9', '#33363d'] };
// g/ml mein dikhana (kg/litre wale saman ki recipe gram mein likhi jati hai)
const subOf = i => (i && i.sub_per > 0 ? i.sub_per : 0);
const fmtQ = (i, q) => { const sp = subOf(i); return sp ? `${+(q * sp).toFixed(1)} ${i.sub_unit}` : `${+(+q).toFixed(2)} ${i ? i.unit : ''}`; };
// miqdar dono tarah: kg aur gram (ya piece)
const qtyTxt = (i, q) => { q = +q || 0; return i.sub_per ? `${+q.toFixed(3)} ${i.unit} (${Math.round(q * i.sub_per)} ${i.sub_unit})` : `${+q.toFixed(2)} ${i.unit}`; };
// Ginti / stock theek karna: pack ya kul miqdar likhein, saath saath dikhta hai kitna banega
function countDialog(it, done) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:60;padding:12px';
  ov.innerHTML = `<div class="box" style="max-width:440px;width:100%">
    <b style="color:var(--gold);font-size:18px">${esc(it.name)}: stock theek karein</b>
    <div>System mein abhi: <b>${qtyTxt(it, it.bal)}</b></div>
    ${it.pack_size ? `<label>Kitne pack hain? <small style="color:var(--mute)">(1 ${esc(it.pack_name || 'pack')} = ${qtyTxt(it, it.pack_size)})</small><input id="cdP" type="number" step="any" min="0" placeholder="pack"></label>` : ''}
    <label>${it.pack_size ? 'Aur khula' : 'Asal mein kitna hai'} (${it.sub_per ? it.sub_unit : it.unit})<input id="cdQ" type="number" step="any" min="0" placeholder="${it.sub_per ? 'gram' : it.unit}"></label>
    <div id="cdOut" style="font-size:17px;color:var(--gold);font-weight:700">—</div>
    <div class="r"><button class="btn gold" id="cdOk">Save</button><button class="btn" id="cdNo">Band karein</button></div></div>`;
  document.body.appendChild(ov);
  const val = () => { const p = +((ov.querySelector('#cdP') || {}).value || 0), q = +ov.querySelector('#cdQ').value || 0; return p * (it.pack_size || 0) + (it.sub_per ? q / it.sub_per : q); };
  const any = () => ((ov.querySelector('#cdP') || {}).value || '') !== '' || ov.querySelector('#cdQ').value !== '';
  const upd = () => { ov.querySelector('#cdOut').textContent = any() ? `Naya stock: ${qtyTxt(it, val())}` : '—'; };
  ov.querySelectorAll('input').forEach(x => (x.oninput = upd));
  ov.querySelector('#cdNo').onclick = () => ov.remove();
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#cdOk').onclick = () => guard(async () => {
    if (!any()) throw new Error('Pack ya miqdar likhein');
    await A('/stock/count', 'POST', { item_id: it.id, count: +val().toFixed(4) }); ov.remove(); toast('Stock theek ho gaya ✓'); done();
  });
  (ov.querySelector('#cdP') || ov.querySelector('#cdQ')).focus();
}
// Pack size badalna khatarnak hai (stock ka hisaab bigar jata hai): bara warning + har dafa Admin PIN
function packDialog(ds) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:60;padding:12px';
  ov.innerHTML = `<div class="box" style="max-width:460px;width:100%;border:3px solid #e53935">
    <div style="background:#e53935;color:#fff;font-weight:900;font-size:20px;text-align:center;padding:10px;border-radius:8px">⚠ PACK SIZE BADAL RAHE HAIN</div>
    <div style="font-size:16px;line-height:1.5"><b>Stock daalna hai?</b> To ye button nahi, item ke aage <b>"Ginti"</b> par click karein, ya <b>"Saman aaya"</b> se daalein.<br>
    Pack size badalne se <b>${esc(ds.n)}</b> ka hisaab (pack mein kitna aata hai) <b style="color:#ff8a80">kharab ho jayega</b>. Sirf tab badlein jab company ne pack hi badal diya ho.</div>
    <div>Abhi: <b>1 ${esc(ds.pn || 'Pack')} = ${ds.p || '?'} ${esc(ds.u)}</b></div>
    <label>1 pack mein kitne ${esc(ds.u)}?<input id="pkS" type="number" step="any" min="0" value="${ds.p}"></label>
    <label>Pack ka naam<input id="pkN" value="${esc(ds.pn || 'Pack')}"></label>
    <label>Admin PIN (har dafa zaroori)<input id="pkP" type="password" inputmode="numeric"></label>
    <div class="r"><button class="btn" id="pkNo">Nahi, wapas</button><button class="btn red s" id="pkOk" style="background:#c62828;color:#fff">Haan, pack size badlein</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#pkNo').onclick = () => ov.remove();
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#pkOk').onclick = () => guard(async () => {
    const pin = ov.querySelector('#pkP').value.trim(); if (!pin) throw new Error('Admin PIN likhein');
    await A('/stock/items/' + ds.id, 'PUT', { pack_size: ov.querySelector('#pkS').value, pack_name: ov.querySelector('#pkN').value, confirm_pin: pin });
    ov.remove(); toast('Pack size badal diya ✓'); viewStock();
  });
}
async function viewStock() {
  const [d, rc] = await Promise.all([A('/stock'), A('/recipes')]);
  const items = d.items, preps = d.preps || [], all = items.concat(preps), byId = Object.fromEntries(all.map(i => [String(i.id), i]));
  const opt = items.map(i => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('');
  const cats = [...new Set(rc.variants.map(v => v.cat))];
  const grpOpts = ['Raw saman', 'Packing'].concat(cats).map(c => `<option>${esc(c)}</option>`).join('');
  const GORD = ['Raw saman', 'Packing'];
  const groups = [...new Set(GORD.concat(items.map(i => i.grp || 'Dusra')))].filter(g => items.some(i => (i.grp || 'Dusra') === g));
  const cnt = (g, st) => items.filter(i => (i.grp || 'Dusra') === g && i.status === st).length;
  const rateTxt = i => (i.rate ? `Rs ${Math.round(i.rate * (i.pack_size || 1))}/${i.pack_size ? (i.pack_name || 'pack') : i.unit}` : 'Rate?');
  window._open = window._open || {};
  const packTxt = i => (i.pack_size ? `${i.pack_name || 'Pack'} = ${i.pack_size} ${i.unit}` : 'Pack size?');
  view.innerHTML = `
  <div class="box"><b style="color:var(--gold)">Stock ki halat</b>
    ${sBar('qSt', 'Stock item dhoondein (maslan cheese, dabba, maida)')}
    ${groups.map(g => `<details class="sg" data-g="${esc(g)}"${window._open[g] ? ' open' : ''}><summary><span class="chev">▸</span><span>${esc(g)}</span> <small style="color:var(--mute)">(${items.filter(i => (i.grp || 'Dusra') === g).length} items)</small><small class="tap">tap karke kholein</small>${cnt(g, 'low') ? `<span class="redc yel" title="Kam">${cnt(g, 'low')}</span>` : ''}${cnt(g, 'out') ? `<span class="redc" title="Khatam">${cnt(g, 'out')}</span>` : ''}</summary>
    <table><tr><th>Item</th><th>Bacha</th><th>Roz ki khapat</th><th>Kitne din</th><th>Halat</th><th></th></tr>` + items.filter(i => (i.grp || 'Dusra') === g).map(i => { const t = ST_TXT[i.status]; return `<tr class="st-${i.status}"><td>${esc(i.name)}</td><td><b>${qtyTxt(i, i.bal)}</b></td><td>${i.per_day ? fmtQ(i, i.per_day) : '—'}</td><td>${i.days === null ? '—' : '~' + Math.floor(i.days) + ' din'}</td>
      <td><span style="background:${t[2]};color:${t[1]};border-radius:99px;padding:2px 10px;font-weight:700;font-size:13px">${t[0]}</span></td>
      <td style="white-space:nowrap"><button class="btn s" data-act="cnt" data-id="${i.id}" data-n="${esc(i.name)}" data-b="${i.bal}" data-u="${i.unit}">Ginti</button> <button class="btn s" data-act="min" data-id="${i.id}" data-m="${i.min_level}" data-n="${esc(i.name)}" data-u="${i.unit}">Kam-az-kam: ${i.min_level} ${i.unit}</button> <button class="btn s" data-act="pack" data-id="${i.id}" data-n="${esc(i.name)}" data-u="${i.unit}" data-p="${i.pack_size || ''}" data-pn="${esc(i.pack_name || '')}">${esc(packTxt(i))}</button> <button class="btn s" data-act="rate" data-id="${i.id}" data-n="${esc(i.name)}" data-u="${i.unit}" data-p="${i.pack_size || 0}" data-pn="${esc(i.pack_name || 'pack')}" data-r="${i.rate || 0}">${esc(rateTxt(i))}</button></td></tr>`; }).join('') + '</table></details>').join('') || '<div style="color:var(--mute)">Abhi koi item nahi.</div>'}
    <small style="color:var(--mute)">"Kitne din" pichle 7 din ki sale se nikalta hai. "Ginti" = asal bacha hua likhein, farq khud theek ho jata hai. Dabba, food bag aur ketchup sirf Takeaway/Delivery par minus hote hain. Butter paper, foil aur pasta packing har order par.</small></div>
  <div class="box"><b style="color:var(--gold)">Demand slip (bazaar se kya lana hai)</b>
    <div class="r"><span>Kitne din ka saman?</span><select id="dmDays" class="n">${[3, 4, 5, 6, 7, 10, 14].map(d => `<option value="${d}">${d} din</option>`).join('')}</select><button class="btn gold s" id="dmGo">🧾 Demand banao</button></div>
    <small style="color:var(--mute)">Pichle 7 din ki asal sale se roz ki khapat nikal kar, jitne din chunein utna saman minus jo bacha hai. Pack mein gol kar ke.</small>
    <div id="dmSearch" hidden>${sBar('qDm', 'Demand mein item dhoondein')}</div>
    <div id="dmBox"></div></div>
  <div class="box"><b style="color:var(--gold)">Saman aaya (+)</b>
    ${sBar('qIn', 'Kya aaya? Naam likhein, list chhoti ho jayegi')}
    <div class="r"><select id="iItem"><option value="">Kya aaya? (chunein)</option>${(() => {
      const st = { out: '⛔ khatam', low: '⚠ kam' }, short = items.filter(i => i.status === 'out' || i.status === 'low').sort((a, b) => (a.status === 'out' ? 0 : 1) - (b.status === 'out' ? 0 : 1) || a.name.localeCompare(b.name));
      const o = i => `<option value="${i.id}">${esc(i.name)} (${i.unit})${st[i.status] ? ' · ' + st[i.status] : ''}</option>`;
      return (short.length ? `<optgroup label="⚠ Pehle ye: kam / khatam (${short.length})">${short.map(o).join('')}</optgroup>` : '')
        + GORD.map(g => `<optgroup label="${esc(g)}">${items.filter(i => (i.grp || 'Dusra') === g && !st[i.status]).map(o).join('')}</optgroup>`).join('');
    })()}</select><input id="iPacks" type="number" step="any" min="0" placeholder="Kitne pack"><input id="iQty" type="number" step="any" min="0" placeholder="ya kul miqdar"><input id="iAmt" type="number" min="0" placeholder="Kitne Rs (zaroori)"><input id="iDate" type="date" value="${new Date().toISOString().slice(0, 10)}"><button class="btn gold s" id="iAdd">+ Add</button></div>
    <small style="color:var(--mute)" id="iHint">Pack size set ho to sirf "Kitne pack" likhein (maslan 3), kg khud ban jayenge. Rs likhna zaroori hai, ye Kharcha mein bhi khud darj ho jata hai aur saman ka rate bhi update hota hai.</small></div>
  <div class="box"><b style="color:var(--gold)">Shuru ka stock / sab ki ginti (aik saath)</b>
    <small style="color:var(--mute)">Jo saman abhi dukaan mein hai us ki miqdar likhein (kg / litre / piece). Khali chhorein to wo item nahi badlega.</small>
    ${sBar('qBulk', 'Ginti ke liye item dhoondein')}
    <table id="bulkT"><tr><th>Item</th><th>System mein</th><th>Asal mein</th></tr>
    ${groups.map(g => `<tr class="gh"><td colspan="3" style="color:var(--gold);font-weight:700;padding-top:10px">${esc(g)}</td></tr>` + items.filter(i => (i.grp || 'Dusra') === g).map(i => `<tr><td>${esc(i.name)}</td><td>${+i.bal.toFixed(3)} ${i.unit}</td><td><input class="n bulk" data-id="${i.id}" type="number" step="any" min="0" placeholder="${i.unit}" style="max-width:130px"> <small class="bq" style="color:var(--gold)"></small></td></tr>`).join('')).join('')}</table>
    <div class="r"><button class="btn gold s" id="bSave">Sab save karein</button></div></div>
  ${preps.map(p => `<div class="box"><b style="color:var(--gold)">${esc(p.name)} ki recipe (1 batch)</b>
    <small style="color:var(--mute)">Pizza ki recipe mein ${esc(p.name)} gram mein likha hai. Jitna ${esc(p.name)} lagta hai, usi hisaab se neeche wala saman minus hota hai.</small>
    <div class="r"><span>1 batch ka kul wazan: <b>${p.prep_yield} g</b></span></div>
    <div id="pBox${p.id}"></div></div>`).join('')}
  <div class="box"><b style="color:var(--gold)">Recipe (kis item mein kitna saman lagta hai)</b>
    <small style="color:var(--mute)">Recipes final hain, yahan sirf dekh sakte hain. Badalni ho to developer se kahein.</small>
    ${sBar('qRc', 'Recipe dhoondein (maslan crown crust large) ya neeche group chunein')}
    <select id="rGrp"><option value="">Group chunein...</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    <select id="rSel" disabled><option value="">Pehle group chunein</option></select>
    <div id="rBox"></div></div>
  ${items.length ? `<div class="box"><b style="color:var(--mute)">Item hatayein</b>
    <div class="r"><select id="dItem"><option value="">Kaunsa item hatana hai?</option>${opt}</select><button class="btn red s" id="dGo">Hatayein</button></div>
    <small style="color:var(--mute)">Sirf woh item hatayein jo ab dukaan mein nahi rakhte.</small></div>` : ''}
  <div class="box" id="mvBox"><b>Akhri entries</b>${d.moves.length > 5 ? sBar('qMv', 'Entry dhoondein (item, date, note)') : ''}<table>${d.moves.map(m => `<tr><td>${m.date}</td><td>${esc(m.name)}</td><td>${m.qty > 0 ? '+' : ''}${+(+m.qty).toFixed(3)} ${m.unit}</td><td style="color:var(--mute)">${m.kind === 'in' ? 'Aaya' : 'Ginti'} ${esc(m.note)}</td></tr>`).join('') || '<tr><td style="color:var(--mute)">—</td></tr>'}</table></div>`;

  // Recipes final hain: sirf dekh sakte hain, badal nahi sakte (ghalti se chhed-chhaad na ho)
  const showRows = (box, rows, withAway) => {
    box.innerHTML = rows.length ? `<table><tr><th>Saman</th><th>Miqdar</th>${withAway ? '<th></th>' : ''}</tr>${rows.map(r => { const it = byId[String(r.item_id)]; const sp = subOf(it);
      return `<tr><td>${esc(it ? it.name : '?')}</td><td><b>${+(r.qty * (sp || 1)).toFixed(2)}</b> ${it ? (it.sub_unit || it.unit) : ''}</td>${withAway ? `<td style="color:var(--mute)">${r.away ? '🛵 sirf Takeaway/Delivery' : 'har order'}</td>` : ''}</tr>`; }).join('')}</table>`
      : '<small style="color:var(--mute)">Is ki recipe nahi hai.</small>';
  };
  // Dough: har saman ki qeemat (aakhri "Saman aaya" ke rate se) + 1 batch, 1 kg aur har size ka kharcha
  preps.forEach(p => {
    let tot = 0; const miss = [];
    const rows = p.rows.map(r => { const it = byId[String(r.item_id)] || {}, sp = subOf(it), c = it.rate ? r.qty * it.rate : null; if (c === null) miss.push(it.name); else tot += c;
      return `<tr><td>${esc(it.name || '?')}</td><td><b>${+(r.qty * (sp || 1)).toFixed(2)}</b> ${it.sub_unit || it.unit || ''}</td><td>${c === null ? '<span style="color:var(--mute)">rate?</span>' : 'Rs ' + c.toFixed(1)}</td></tr>`; }).join('');
    const perG = p.prep_yield ? tot / p.prep_yield : 0, sz = [['Large', 480], ['Medium', 280], ['Small', 160], ['Behari Roll', 120]];
    $('#pBox' + p.id).innerHTML = `<table><tr><th>Saman</th><th>Miqdar</th><th>Qeemat</th></tr>${rows}</table>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px">
        <div class="box" style="padding:10px"><small style="color:var(--mute)">1 batch (${p.prep_yield} g)</small><b style="font-size:20px">Rs ${Math.round(tot)}</b></div>
        <div class="box" style="padding:10px"><small style="color:var(--mute)">1 kg dough</small><b style="font-size:20px">Rs ${Math.round(perG * 1000)}</b></div>
        ${sz.map(([n, g]) => `<div class="box" style="padding:10px"><small style="color:var(--mute)">${n} (${g} g)</small><b style="font-size:20px">Rs ${(perG * g).toFixed(1)}</b></div>`).join('')}</div>
      ${miss.length ? `<small style="color:#f5c04a">⚠ In ka rate abhi nahi (kharcha pura nahi): ${miss.map(esc).join(', ')}</small>` : ''}`;
  });

  liveFilter('qMv', () => [...$('#mvBox').querySelectorAll('tr')].filter(x => x.cells.length > 1), { textOf: x => x.textContent });
  let stSearching = false;
  view.querySelectorAll('details.sg').forEach(d => d.addEventListener('toggle', () => { if (!stSearching) window._open[d.dataset.g] = d.open; }));
  // Search: jis group mein mila wo khud khul jaye, baaki chhup jayein. Mita dein to pehle jaisa
  liveFilter('qSt', () => [...view.querySelectorAll('details.sg tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD'), { after: on => {
    stSearching = true;
    view.querySelectorAll('details.sg').forEach(d => {
      const any = [...d.querySelectorAll('tr')].some(x => x.cells[0] && x.cells[0].tagName === 'TD' && x.style.display !== 'none');
      d.style.display = on && !any ? 'none' : ''; d.open = on ? any : !!window._open[d.dataset.g];
    });
    setTimeout(() => { stSearching = false; }, 0);
  } });
  // Demand slip: din badalte hi khud dobara banti hai; har line ki miqdar haath se badal sakte hain, hata sakte hain, nayi jor sakte hain
  let DM = null;
  const dmQ = (r, v) => (r.sub_per && v < 1 ? Math.round(v * r.sub_per) + ' ' + r.sub_unit : +(+v).toFixed(2) + ' ' + r.unit);
  const dmUnit = r => (r.pack_size ? (r.pack_name || 'pack') : r.unit);
  const dmBuy = r => `${+(+r.n).toFixed(2)} ${dmUnit(r)}`;
  const dmCost = r => (r.rate ? r.n * (r.pack_size || 1) * r.rate : 0);
  const dmAlertDays = 3;
  const dmCls = r => (r.bal <= 0 || r.status === 'out' ? 'dm-red' : r.days_left !== null && r.days_left <= dmAlertDays ? 'dm-red' : r.manual ? '' : 'dm-yel');
  function dmDraw() {
    const d = DM, rows = d.rows.filter(r => !r.del), grps = [...new Set(rows.map(r => r.grp))];
    const tot = rows.reduce((t, r) => t + dmCost(r), 0);
    const left = items.filter(i => !d.rows.some(r => r.id === i.id && !r.del));
    $('#dmBox').innerHTML = `<table style="margin-top:8px"><tr><th>Saman</th><th>Mangwana (badal sakte hain)</th><th>Bacha</th><th>Kitne din ka bacha</th><th>Roz ki khapat</th><th>Andazan Rs</th><th></th></tr>
      ${grps.map(g => `<tr class="gh"><td colspan="7" style="color:var(--gold);font-weight:700;padding-top:10px">${esc(g)}</td></tr>` + rows.filter(r => r.grp === g).map(r => { const k = d.rows.indexOf(r);
        return `<tr class="${dmCls(r)}"><td>${esc(r.name)}${r.manual ? ' <small style="color:var(--mute)">(haath se)</small>' : ''}</td>
        <td style="white-space:nowrap"><input class="n dmn" data-k="${k}" type="number" step="any" min="0" value="${+(+r.n).toFixed(2)}" style="max-width:90px"> ${esc(dmUnit(r))}${r.pack_size ? ` <small style="color:var(--mute)">= ${dmQ(r, r.n * r.pack_size)}</small>` : ''}</td>
        <td>${dmQ(r, r.bal)}</td><td>${r.bal <= 0 ? '<b style="color:#ff8a80">khatam</b>' : r.days_left === null ? '—' : '~' + r.days_left + ' din'}</td><td>${r.per_day ? dmQ(r, r.per_day) : '—'}</td>
        <td>${r.rate ? money(Math.round(dmCost(r))) + `<br><small style="color:var(--mute)">${money(Math.round(r.rate * (r.pack_size || 1)))}/${esc(dmUnit(r))}</small>` : '<span style="color:#f5c04a">rate?</span>'}</td>
        <td><button class="btn red s" data-dmdel="${k}">✕</button></td></tr>`; }).join('')).join('') || '<tr><td colspan="7" style="color:#8fd19e">✓ Is waqt kuch mangwane ki zarurat nahi.</td></tr>'}</table>
      <div class="r" style="margin-top:8px"><select id="dmAdd"><option value="">+ Aur saman jorein (list se)...</option>${left.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div>
      <div class="r" style="margin-top:8px"><div style="flex:1"><div style="font-size:13px;color:var(--mute)">${rows.length} cheezein · andazan cash (aakhri khareed ke rate se)</div><b style="font-size:26px;color:var(--gold)">${money(Math.round(tot))}</b>${(() => { const nr = rows.filter(r => !r.rate).length; return nr ? `<div style="color:#f5c04a;font-size:13px">⚠ ${nr} cheezon ka rate nahi (in ke paise is mein shamil nahi). "Saman aaya" mein Rs likhne se rate khud lag jata hai.</div>` : ''; })()}</div><button class="btn gold s" id="dmPrint">🖨 Slip print karein</button></div>
      <small style="color:var(--mute)">Laal = khatam ya ${dmAlertDays} din se kam ka bacha. Peela = ${d.days} din ke andar khatam ho jayega. ${d.days} din ke liye, pichle ${d.based_on} din ki sale ke hisaab se.</small>`;
    $('#dmSearch').hidden = rows.length < 6;
    liveFilter('qDm', () => [...$('#dmBox').querySelectorAll('tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD' && x.cells.length > 1 || x.classList.contains('gh')));
    $('#dmBox').querySelectorAll('.dmn').forEach(x => (x.onchange = () => { DM.rows[+x.dataset.k].n = Math.max(0, +x.value || 0); dmDraw(); }));
    $('#dmBox').querySelectorAll('[data-dmdel]').forEach(x => (x.onclick = () => { DM.rows[+x.dataset.dmdel].del = true; dmDraw(); }));
    $('#dmAdd').onchange = () => { const i = items.find(x => String(x.id) === $('#dmAdd').value); if (!i) return;
      DM.rows.push({ id: i.id, name: i.name, grp: i.grp || 'Dusra', unit: i.unit, sub_unit: i.sub_unit, sub_per: i.sub_per, pack_size: i.pack_size, pack_name: i.pack_name, bal: Math.max(0, i.bal), per_day: i.per_day, days_left: i.days, status: i.status, rate: i.rate || 0, n: 1, manual: true });
      DM.rows.sort((a, b) => (a.grp === b.grp ? a.name.localeCompare(b.name) : a.grp === 'Raw saman' ? -1 : b.grp === 'Raw saman' ? 1 : a.grp.localeCompare(b.grp))); dmDraw(); };
    $('#dmPrint').onclick = () => {
      const pr = DM.rows.filter(r => !r.del && r.n > 0), pg = [...new Set(pr.map(r => r.grp))];
      const w = window.open('', '_blank', 'width=420,height=700');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Demand slip</title><style>
        @page{size:80mm auto;margin:0} body{font-family:'Segoe UI',Arial,sans-serif;width:72mm;margin:0 auto;padding:3mm 0;color:#000;font-size:13px}
        h1{font-size:18px;text-align:center;margin:0} .c{text-align:center} hr{border:0;border-top:1px dashed #000;margin:6px 0}
        table{width:100%;border-collapse:collapse} td{padding:3px 0;vertical-align:top} td.r{text-align:right;white-space:nowrap;font-weight:600}
        .g{font-weight:700;padding-top:6px;text-decoration:underline} .tick{display:inline-block;width:11px;height:11px;border:1px solid #000;margin-right:4px;vertical-align:-1px}
      </style></head><body><h1>${esc(DM.shop || 'Pizza Town')}</h1><div class="c"><b>DEMAND SLIP</b></div>
        <div class="c">${DM.date} · ${DM.days} din ka saman</div><hr>
        <table>${pg.map(g => `<tr><td colspan="2" class="g">${esc(g)}</td></tr>` + pr.filter(r => r.grp === g).map(r => `<tr><td><span class="tick"></span>${esc(r.name)}<br><small style="margin-left:15px">${dmBuy(r)}</small></td><td class="r">${r.rate ? Math.round(dmCost(r)).toLocaleString('en-PK') : 'rate?'}</td></tr>`).join('')).join('')}</table>
        <hr><div style="font-size:15px"><b>Andazan cash: Rs ${Math.round(pr.reduce((t, r) => t + dmCost(r), 0)).toLocaleString('en-PK')}</b></div><div>${pr.length} cheezein${pr.some(r => !r.rate) ? ` · ${pr.filter(r => !r.rate).length} ka rate nahi` : ''}</div>
        <div style="font-size:11px;margin-top:4px">Pichle ${DM.based_on} din ki sale ke hisaab se</div><br><br></body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };
  }
  const dmLoad = () => guard(async () => {
    const d = await A('/stock/demand?days=' + $('#dmDays').value);
    d.rows.forEach(r => { r.n = r.packs || r.buy; });
    DM = d; dmDraw();
  });
  $('#dmGo').onclick = dmLoad;
  $('#dmDays').onchange = () => { if (DM) dmLoad(); };   // din badalte hi list khud nayi
  const iHint = () => { const it = byId[$('#iItem').value], n = +$('#iPacks').value, q = +$('#iQty').value;
    $('#iHint').textContent = !it ? '' : n > 0 && it.pack_size ? `${n} ${it.pack_name || 'pack'} = ${qtyTxt(it, n * it.pack_size)} stock mein judega`
      : q > 0 ? `${qtyTxt(it, q)} stock mein judega` : it.pack_size ? `1 ${it.pack_name || 'pack'} = ${qtyTxt(it, it.pack_size)}. "Kitne pack" likhein, ya kul ${it.unit} likhein.` : `Is ka pack size nahi. Kul ${it.unit} likhein.`;
    $('#iPacks').hidden = !!it && !it.pack_size; $('#iQty').placeholder = it ? `ya kul ${it.unit}` : 'ya kul miqdar'; };
  liveFilter('qIn', () => [...$('#iItem').options].filter(o => o.value), { textOf: o => o.textContent, after: on => {
    $('#iItem').querySelectorAll('optgroup').forEach(g => { g.hidden = on && ![...g.children].some(o => o.style.display !== 'none'); });
    const vis = [...$('#iItem').options].filter(o => o.value && o.style.display !== 'none');
    if (on && vis.length === 1 && $('#iItem').value !== vis[0].value) { $('#iItem').value = vis[0].value; iHint(); }
    else if (on && $('#iItem').value && !vis.some(o => o.value === $('#iItem').value)) { $('#iItem').value = ''; iHint(); }
  } });
  $('#iItem').onchange = iHint; $('#iPacks').oninput = iHint; $('#iQty').oninput = iHint;
  if ($('#dGo')) $('#dGo').onclick = () => guard(async () => {
    const id = $('#dItem').value; if (!id) throw new Error('Pehle item chunein');
    const it = items.find(x => String(x.id) === id);
    if (confirm(`${it.name} (bacha ${it.bal} ${it.unit}) stock list se hata dein?`)) { await A('/stock/items/' + id, 'DELETE'); toast('Hata diya'); viewStock(); }
  });
  $('#iAdd').onclick = () => guard(async () => {
    await A('/stock/in', 'POST', { ...pickBody($('#iItem').value), packs: $('#iPacks').value, qty: $('#iQty').value, amount: $('#iAmt').value, date: $('#iDate').value });
    toast('Stock mein add ho gaya ✓'); viewStock();
  });
  liveFilter('qBulk', () => [...$('#bulkT').querySelectorAll('tr')].filter(x => x.cells[0] && x.cells[0].tagName === 'TD'));
  view.querySelectorAll('.bulk').forEach(x => (x.oninput = () => { const it = byId[x.dataset.id]; x.nextElementSibling.textContent = x.value === '' ? '' : '= ' + qtyTxt(it, x.value); }));
  $('#bSave').onclick = () => guard(async () => {
    const rows = [...view.querySelectorAll('.bulk')].filter(x => x.value !== '').map(x => ({ item_id: x.dataset.id, count: x.value }));
    if (!rows.length) throw new Error('Kisi item mein miqdar likhein');
    const r = await A('/stock/count-bulk', 'POST', { rows }); toast(`${r.changed} items ka stock save ✓`); viewStock();
  });
  const rOpt = (v, withCat) => { const has = v.recipe.length || v.parts.length; return `<option value="${v.id}">${has ? '✓' : '○'} ${withCat ? esc(v.cat) + ' › ' : ''}${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}${has ? '' : ' (Recipe nahi)'}</option>`; };
  $('#rGrp').onchange = () => { const g = $('#rGrp').value, sel = $('#rSel'); if (g && $('#qRc').value) { $('#qRc').value = ''; window._q.qRc = ''; $('#qRc').parentElement.querySelector('.sc').textContent = ''; } sel.disabled = !g; sel.innerHTML = g ? '<option value="">Item chunein...</option>' + rc.variants.filter(v => v.cat === g).map(v => rOpt(v)).join('') : '<option value="">Pehle group chunein</option>'; $('#rBox').innerHTML = ''; };
  // Recipe search: saare groups mein se milte items list mein; aik hi mile to seedha khul jaye
  const rFind = () => {
    const words = sNorm($('#qRc').value).split(' ').filter(Boolean); window._q.qRc = $('#qRc').value;
    const sc = $('#qRc').parentElement.querySelector('.sc'), sel = $('#rSel');
    if (!words.length) { sc.textContent = ''; if (!$('#rGrp').value) { sel.disabled = true; sel.innerHTML = '<option value="">Pehle group chunein</option>'; $('#rBox').innerHTML = ''; } return; }
    const hit = rc.variants.filter(v => words.every(w => sSize(v.cat + ' ' + v.name + ' ' + (v.label || '')).includes(w)));
    $('#rGrp').value = ''; sc.textContent = hit.length ? hit.length + ' mile' : 'Kuch nahi mila';
    sel.disabled = !hit.length; sel.innerHTML = hit.length ? `<option value="">${hit.length} mile, chunein...</option>` + hit.map(v => rOpt(v, true)).join('') : '<option value="">Kuch nahi mila</option>';
    if (hit.length === 1) { sel.value = hit[0].id; sel.onchange(); } else $('#rBox').innerHTML = '';
  };
  $('#qRc').oninput = rFind;
  $('#rSel').onchange = () => {
    const v = rc.variants.find(x => String(x.id) === $('#rSel').value), box = $('#rBox'); box.innerHTML = '';
    if (!v) return;
    if (v.parts.length) box.insertAdjacentHTML('beforeend', `<div style="margin:8px 0;padding:8px 10px;border-left:3px solid var(--gold)"><b>Is deal mein:</b> ${v.parts.map(esc).join(' · ')}<br><small style="color:var(--mute)">In ka saman un ki apni recipe se minus hota hai. Pizza ka flavour order ke waqt badla ja sakta hai.</small></div>`);
    const eb = document.createElement('div'); box.appendChild(eb);
    guard(async () => {
      const c = await A('/recipe-cost/' + v.id), rs = n => 'Rs ' + (+n).toFixed(n < 10 ? 1 : 0);
      const q = r => (r.part ? `${+r.qty}` : r.sub_per ? `${+(r.qty * r.sub_per).toFixed(1)} ${r.sub_unit}` : `${+(+r.qty).toFixed(2)} ${r.unit}`);
      eb.innerHTML = c.rows.length ? `<table><tr><th>Saman</th><th>Miqdar</th><th>Qeemat</th><th></th></tr>${c.rows.map(r => `<tr><td>${esc(r.name)}</td><td><b>${q(r)}</b></td>
        <td>${r.cost || r.part ? rs(r.cost) + (r.part && r.away_cost !== r.cost ? ` <small style="color:var(--mute)">(🛵 ${rs(r.away_cost)})</small>` : '') : '<span style="color:var(--mute)">rate?</span>'}</td>
        <td style="color:var(--mute)">${r.part ? 'deal ka hissa' : r.away ? '🛵 sirf Takeaway/Delivery' : 'har order'}</td></tr>`).join('')}</table>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:8px">
          <div class="box" style="padding:10px"><small style="color:var(--mute)">Kul kharcha · Dine-in</small><b style="font-size:20px">Rs ${c.dine}</b><small>Bachat Rs ${c.price - c.dine}</small></div>
          <div class="box" style="padding:10px"><small style="color:var(--mute)">Kul kharcha · Takeaway</small><b style="font-size:20px">Rs ${c.away}</b><small>Bachat Rs ${c.price - c.away}</small></div>
          <div class="box" style="padding:10px"><small style="color:var(--mute)">Kul kharcha · Delivery</small><b style="font-size:20px">Rs ${c.deliv}</b><small>Bachat Rs ${c.price - c.deliv}</small></div>
          <div class="box" style="padding:10px"><small style="color:var(--mute)">Menu qeemat</small><b style="font-size:20px">Rs ${c.price}</b></div></div>
        <small style="color:var(--mute)">Note: Dine-in mein bottle wali ketchup lagti hai, us ka kharcha Takeaway jitne sachet ke barabar farz kiya gaya hai (Rs ${c.ketchup}). Delivery = Takeaway + rider ka kharcha Rs ${c.dcost} farz (Settings se badal sakte hain).</small>
        ${c.missing.length ? `<small style="color:#f5c04a">⚠ In ka rate abhi nahi (kul kharcha pura nahi): ${c.missing.map(esc).join(', ')}. Rate "Saman aaya" mein Rs likhne se khud lag jata hai, ya upar table se "Rate?" dabayein.</small>` : ''}`
        : '<small style="color:var(--mute)">Is ki recipe nahi hai.</small>';
    });
  };
  if ($('#qRc').value) rFind();
  view.onclick = e => guard(async () => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'cnt') { countDialog(items.find(x => String(x.id) === b.dataset.id), viewStock); return; }
    if (b.dataset.act === 'min') { const c = prompt(`${b.dataset.n}: kam-az-kam kitna hona chahiye? (${b.dataset.u} mein. Isse kam ho to alert aayega)`, b.dataset.m); if (c === null) return; await A('/stock/items/' + b.dataset.id, 'PUT', { min_level: c }); viewStock(); }
    if (b.dataset.act === 'rate') {
      const per = +b.dataset.p ? b.dataset.pn : b.dataset.u, cur = Math.round(+b.dataset.r * (+b.dataset.p || 1));
      const c = prompt(`${b.dataset.n}: 1 ${per} kitne Rs ka aata hai?`, cur || ''); if (c === null || c === '') return;
      await A('/stock/items/' + b.dataset.id, 'PUT', { rate: +c / (+b.dataset.p || 1) }); toast('Rate save ✓'); viewStock(); return;
    }
    if (b.dataset.act === 'pack') { packDialog(b.dataset); return; }
  });
}

// ---------- settings ----------
const FIELDS = [
  ['Shop (bill par)', null],
  ['shop_name', 'Shop name'], ['shop_tagline', 'Tagline'], ['shop_address', 'Address'], ['shop_phone', 'Phone'], ['bill_footer', 'Bill footer (Urdu)'], ['bill_footer_en', 'Bill footer (English)'],
  ['slip_lang_default', 'Slip ki default zaban', 'select', [['ur', 'اردو'], ['en', 'English']]],
  ['gift_needs_pin', 'Gift / Free order ke liye Admin PIN zaroori', 'check'],
  ['edit_window_min', 'Order badalne ka waqt (minute). Uske baad sirf Admin PIN se', 'number'],
  ['Charges', null],
  ['delivery_charge_enabled', 'Delivery charges ka option (order lete waqt puchna)', 'check'],
  ['delivery_charge_default', 'Delivery charges default (Rs)', 'number'],
  ['service_charge_enabled', 'Dine-in par service charges ka option', 'check'],
  ['service_charge_type', 'Service charge type', 'select', [['percent', 'Percent %'], ['fixed', 'Fixed Rs']]],
  ['service_charge_value', 'Service charge value', 'number'],
  ['stock_alert_days', 'Stock alert: itne din ya kam ka saman bache to peela (kam se kam 3)', 'number'],
  ['dine_tables', 'Dine-in tables kitne hain (order par table number ke button)', 'number'],
  ['delivery_cost_assumed', 'Delivery ka kharcha farz (Rs) · recipe ki lagat mein', 'number'],
  ['Order ke baad cartoon', null],
  ['fun_enabled', 'Order ke baad cartoon aur sale ka jashn (30k / 40k / 50k)', 'check'],
  ['fun_small', 'Chhota order: itne Rs tak', 'number'],
  ['fun_big', 'Bara order: is Rs se upar (beech wala darmiyana)', 'number'],
  ['Printing', null],
  ['paper_mm', 'Paper width', 'select', [['80', '80 mm'], ['58', '58 mm']]],
  ['slip_weight', 'Slip ke likhai ki motai (ink phail rahi ho to Patla)', 'select', [['thin', 'Patla (default)'], ['normal', 'Darmiyana'], ['bold', 'Mota (purana)']]],
  ['slip_top_mm', 'Slip ke OPAR ki khali jagah (mm, 0 = bilkul nahi)', 'number'],
  ['slip_bottom_mm', 'Slip ke NICHAY ki khali jagah (mm, kam karna ho to 0-1)', 'number'],
  ['slip_margin_mm', 'Slip margin (har side, mm) - slip kate to barhayen', 'number'],
  ['slip_font_scale', 'Slip font size (print chhota aaye to barhayen)', 'select', [['60', '60% (bohat chhota)'], ['70', '70%'], ['80', '80%'], ['90', '90%'], ['100', '100%'], ['115', '115%'], ['130', '130% (default)'], ['150', '150%'], ['170', '170%'], ['200', '200% (bohat bara)']]],
  ['print_bill', 'Customer bill print karein', 'check'], ['print_kitchen', 'Kitchen slip print karein', 'check'], ['print_delivery', 'Delivery slip print karein (delivery orders)', 'check'],
  ['Google Sheet (malik/partners ke dekhne ke liye)', null],
  ['sheet_url', 'Apps Script Web App URL'],
  ['sheet_key', 'Secret key (wahi jo Script Properties mein SECRET hai)', 'password'],
  ['Other', null],
  ['day_start_hour', 'Naya din kis ghante se shuru (0-23, raat ke orders pichle din mein jayein)', 'number'],
  ['admin_pin', 'Naya admin PIN (khali = wahi purana)', 'password'],
];
async function viewSettings() {
  const S = await A('/settings');
  const sheetSet = !!(S.sheet_url && S.sheet_key);   // juri hui ho to URL/key chhupa dein (galti se na chhidein)
  view.innerHTML = '<div class="box">' + FIELDS.filter(([k, label]) => !(sheetSet && (k === 'sheet_url' || k === 'sheet_key' || String(k).startsWith('Google Sheet')))).map(([k, label, type, opts]) => {
    if (label === null) return `<b style="color:var(--gold);margin-top:8px">${k}</b>`;
    if (!type) return `<div class="f"><label>${label}</label><input data-s="${k}" value="${esc(S[k])}"></div>`;
    if (type === 'check') return `<label class="chk"><input type="checkbox" data-s="${k}" ${S[k] === '1' ? 'checked' : ''}> ${label}</label>`;
    if (type === 'select') return `<div class="f"><label>${label}</label><select data-s="${k}">${opts.map(([v, t]) => `<option value="${v}" ${S[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    return `<div class="f"><label>${label}</label><input type="${type}" data-s="${k}" value="${k === 'admin_pin' ? '' : esc(S[k])}"></div>`;
  }).join('') + `<button class="btn gold" id="saveS">Save settings</button>
  <button class="btn" id="pvS">Slip preview (aakhri order ki)</button>
  <div class="box" id="syncBox" style="background:var(--panel2)">Sheet sync check ho raha hai...</div>
  <div class="box" id="updBox" style="background:var(--panel2)"><b style="color:var(--gold)">Software update (GitHub)</b><div id="updInfo">...</div>
    <div class="r"><button class="btn s" id="updCheck">Check for update</button><button class="btn gold s" id="updGo" style="display:none">Update karein</button></div></div>
  <div style="color:var(--mute);font-size:13px">Mobile se order lene ke liye PC aur mobile aik hi WiFi par hon, aur mobile ke browser mein PC ka address kholen (server ki black window mein "Mobile par:" ke aage likha hota hai).</div></div>`;
  guard(async () => {
    const y = await A('/sync');
    $('#syncBox').innerHTML = !y.configured ? '<b>Google Sheet:</b> abhi link nahi (URL aur key daal kar Save karein).'
      : `<b>Google Sheet:</b> ${y.pending ? '⏳ ' + y.pending + ' records bhejne baqi' : '✓ sab bhej diya'}<br>Aakhri kamyab sync: ${y.last_ok || '-'}${y.last_error ? `<br><span style="color:var(--red)">Masla: ${esc(y.last_error)}</span>` : ''}
         <div class="r" style="margin-top:6px"><button class="btn s" id="syncNow">Abhi sync karein</button></div>`;
    const sn = $('#syncNow'); if (sn) sn.onclick = () => guard(async () => { const x = await A('/sync/now', 'POST'); toast(x.error ? x.error : 'Sync ho gaya ✓', 3500); viewSettings(); });
  });
  const ver = await (await fetch('/api/version')).json();
  $('#updInfo').textContent = `Version ${ver.version}${ver.commit ? ' (' + ver.commit + ', ' + ver.date + ')' : ''}${ver.git ? '' : ' - GitHub se link nahi (setup.bat chalayen)'}`;
  const verTxt = `Version ${ver.version}${ver.commit ? ' (' + ver.commit + ', ' + ver.date + ')' : ''}`;
  const check = async quiet => {
    if (!ver.git) return;
    $('#updInfo').textContent = 'Check ho raha hai...';
    try {
      const u = await A('/update/check');
      $('#updInfo').innerHTML = u.behind ? `Naya version maujood (${u.behind} tabdeeliyan):<br>• ${u.changes.map(esc).join('<br>• ')}` : `${verTxt} · Aap ke paas latest version hai ✓`;
      $('#updGo').style.display = u.behind ? '' : 'none';   // latest ho to Update ka button gaib
    } catch (e) { $('#updInfo').textContent = verTxt + (quiet ? '' : ' · ' + e.message); }
  };
  $('#updCheck').onclick = () => guard(() => check(false));
  check(true);   // Settings khulte hi khud check
  $('#updGo').onclick = () => guard(async () => {
    if (!confirm('Update karein? Software 5 second ke liye band ho kar dobara chalega. Data safe rahta hai.')) return;
    $('#updGo').style.display = 'none';
    const u = await A('/update', 'POST'); toast(u.message, 6000); $('#updInfo').textContent = u.message;
    setTimeout(() => location.reload(), 9000);   // naya version chalne ke baad khud dobara check
  });
  $('#pvS').onclick = () => guard(async () => {
    const list = await (await fetch('/api/orders/recent')).json();
    if (!list.length) return toast('Pehle aik test order banayen, phir preview dekhein', 3000);
    window.open('/slip.html?preview=1&id=' + list[0].id, '_blank');
  });
  $('#saveS').onclick = () => guard(async () => {
    const body = {};
    view.querySelectorAll('[data-s]').forEach(i => body[i.dataset.s] = i.type === 'checkbox' ? (i.checked ? '1' : '0') : i.value);
    await A('/settings', 'PUT', body);
    if (body.admin_pin && body.admin_pin.trim()) { PIN = body.admin_pin.trim(); sessionStorage.setItem('pin', PIN); }
    toast('Settings save ho gayi ✓'); viewSettings();
  });
}

if (PIN) login(PIN);
