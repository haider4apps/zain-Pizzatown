const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const TYPES = { dinein: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };
let PIN = sessionStorage.getItem('pin') || '', catId = null, tab = 'menu';
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
function show() { view.onchange = view.onclick = null; ({ menu: viewMenu, sales: viewSales, exp: viewExpenses, set: viewSettings })[tab](); }

// ---------- menu ----------
async function viewMenu() {
  const menu = await A('/menu');
  if (!menu.find(c => c.id === catId)) catId = menu[0] && menu[0].id;
  const c = menu.find(x => x.id === catId);
  const inp = (k, id, f, val, ph = '') => `<input data-k="${k}" data-id="${id}" data-f="${f}" value="${esc(val)}" placeholder="${ph}">`;
  view.innerHTML = `
  <div class="box">
    <div class="r"><select id="catSel">${menu.map(m => `<option value="${m.id}" ${m.id === catId ? 'selected' : ''}>${esc(m.name)}${m.active ? '' : ' (hidden)'}</option>`).join('')}</select>
      <button class="btn s" data-act="addcat">+ New section</button></div>
    <div style="color:var(--mute);font-size:13px">Har size ki 2 rakmain: pehli = <b>Price</b> (customer se), doosri = <b>Cost</b> (lagat). Cost sirf admin ko nazar aati hai. Laal box = cost abhi nahi daali.</div>
    ${c ? `<div class="r">${inp('categories', c.id, 'name', c.name, 'Section name')}${inp('categories', c.id, 'name_ur', c.name_ur, 'Urdu name')}
      <label class="s"><input type="checkbox" data-k="categories" data-id="${c.id}" data-f="active" ${c.active ? 'checked' : ''}> Show</label>
      <button class="btn red s" data-act="delcat" data-id="${c.id}">Delete section</button></div>` : ''}
  </div>
  ${c ? `<div class="box"><b style="color:var(--gold)">Naya item add karein (${esc(c.name)})</b>
    <div class="r"><input id="nName" placeholder="Item name (e.g. Pepsi)"><input id="nGrp" placeholder="Group (optional)"><input id="nDet" placeholder="Details (optional)"></div>
    <div class="r"><input id="nLabel" placeholder="Size label (e.g. 500ml, L)"><input id="nPrice" type="number" min="0" placeholder="Price"><input id="nCost" type="number" min="0" placeholder="Cost (lagat)"><button class="btn gold s" data-act="additem">+ Add item</button></div></div>
  ${c.items.map(i => `<div class="item ${i.active ? '' : 'off'}">
    <div class="r">${inp('items', i.id, 'name', i.name, 'Name')}${inp('items', i.id, 'grp', i.grp, 'Group')}${inp('items', i.id, 'details', i.details, 'Details')}
      <label class="s"><input type="checkbox" data-k="items" data-id="${i.id}" data-f="active" ${i.active ? 'checked' : ''}> Available</label>
      <button class="btn red s" data-act="delitem" data-id="${i.id}">Delete</button></div>
    ${i.variants.map(v => `<div class="vrow">
      <input type="text" data-k="variants" data-id="${v.id}" data-f="label" value="${esc(v.label)}" placeholder="Size (S / M / L / 500ml)">
      <input type="number" min="0" title="Sale price" data-k="variants" data-id="${v.id}" data-f="price" value="${v.price}" placeholder="Price">
      <input type="number" min="0" title="Cost (lagat)" data-k="variants" data-id="${v.id}" data-f="cost" value="${v.cost || 0}" placeholder="Cost" style="${v.price > 0 && !v.cost ? 'outline:2px solid var(--red)' : ''}">
      <label><input type="checkbox" data-k="variants" data-id="${v.id}" data-f="active" ${v.active ? 'checked' : ''}> On</label>
      <button class="btn red" data-act="delvar" data-id="${v.id}">✕</button></div>`).join('')}
    <div><button class="btn" data-act="addvar" data-id="${i.id}">+ Size / price</button></div></div>`).join('') || '<div class="box">Is section mein abhi koi item nahi</div>'}` : ''}`;

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
    if (a === 'delcat' && confirm('Poora section aur is ke saare items delete karein? (Purane bills ka hisaab nahi bigre ga)')) { await A('/categories/' + id, 'DELETE'); catId = null; viewMenu(); }
    if (a === 'delitem' && confirm('Ye item delete karein? (Sirf chhupana ho to "Available" untick karein)')) { await A('/items/' + id, 'DELETE'); viewMenu(); }
    if (a === 'delvar' && confirm('Ye size/price delete karein?')) { await A('/variants/' + id, 'DELETE'); viewMenu(); }
    if (a === 'addvar') { await A(`/items/${id}/variants`, 'POST', { label: '', price: 0 }); viewMenu(); }
    if (a === 'additem') {
      const name = $('#nName').value.trim(); if (!name) return toast('Item ka naam likhein');
      await A('/items', 'POST', { category_id: catId, name, grp: $('#nGrp').value, details: $('#nDet').value, variants: [{ label: $('#nLabel').value, price: $('#nPrice').value || 0, cost: $('#nCost').value || 0 }] });
      toast('Item add ho gaya ✓'); viewMenu();
    }
  });
}

// ---------- sales ----------
let from = '', to = '';
async function viewSales() {
  const r = await A(`/report?from=${from}&to=${to}`);
  from = r.from; to = r.to;
  const t = r.totals;
  const tbl = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" style="color:var(--mute)">—</td></tr>`}</table>`;
  view.innerHTML = `
  <div class="box"><div class="r"><div class="f"><label>From</label><input type="date" id="dFrom" value="${from}"></div><div class="f"><label>To</label><input type="date" id="dTo" value="${to}"></div>
    <button class="btn gold s" id="go">Show</button>
    <button class="btn s" data-rng="0">Aaj</button><button class="btn s" data-rng="7">7 din</button><button class="btn s" data-rng="30">30 din</button></div></div>
  <div class="cards">
    <div class="stat"><small>Orders</small><b>${t.n}</b></div><div class="stat"><small>Total sale</small><b>${money(t.total)}</b></div>
    <div class="stat"><small>Discount</small><b>${money(t.discount)}</b></div><div class="stat"><small>Delivery charges</small><b>${money(t.delivery)}</b></div>
    <div class="stat"><small>Service charges</small><b>${money(t.service)}</b></div>
    <div class="stat"><small>Cost (lagat)</small><b>${money(t.cost)}</b></div><div class="stat"><small>Profit (items)</small><b>${money(t.profit)}</b></div>
    <div class="stat"><small>Kharcha</small><b>${money(t.expenses)}</b></div><div class="stat"><small>Net profit</small><b style="color:${t.net < 0 ? 'var(--red)' : 'var(--gold)'}">${money(t.net)}</b></div></div>
  ${r.missing_cost ? `<div class="box" style="border-color:var(--red)">⚠ ${r.missing_cost} items/sizes ki cost 0 hai - un ka profit galat (zyada) dikhega. Menu &amp; Prices mein cost daalein.</div>` : ''}
  <div class="box"><b>Din ba din</b>${tbl(['Date', 'Orders', 'Sale', 'Cost', 'Profit', 'Kharcha', 'Net'], r.days.map(d => [d.d, d.n, money(d.total), money(d.cost), money(d.profit), money(d.expenses), money(d.net)]))}</div>
  <div class="box"><b>Order type</b>${tbl(['Type', 'Orders', 'Amount'], r.by_type.map(x => [TYPES[x.type], x.n, money(x.total)]))}
    <b>Payment</b>${tbl(['Method', 'Orders', 'Amount'], r.by_payment.map(x => [x.payment === 'Gift' ? 'Gift / Free' : x.payment, x.n, money(x.total)]))}
    ${r.gifts.length ? `<b>Gift / Free orders (kis ne diye)</b>${tbl(['Kis ki taraf se', 'Orders', 'Bill value', 'Lagat (nuqsan)'], r.gifts.map(g => [esc(g.by_whom), g.n, money(g.value), money(g.cost)]))}` : ''}
    <b>Delivery riders</b>${tbl(['Rider', 'Orders', 'Total collected', 'Delivery charges'], r.riders.map(x => [esc(x.rider || '(no name)'), x.n, money(x.total), money(x.delivery)]))}</div>
  <div class="box"><b>Top items</b>${tbl(['Item', 'Qty', 'Amount', 'Profit'], r.top.map(x => [esc(x.item_name + (x.variant_label ? ' (' + x.variant_label + ')' : '')), x.qty, money(x.amount), money(x.profit)]))}</div>
  <div class="box"><b>Orders</b>${tbl(['#', 'Date', 'Time', 'Type', 'Who', 'Total', ''], r.orders.map(o => [
    o.order_no, o.business_date, o.created_at.slice(11, 16), TYPES[o.type], esc(o.customer_name || o.table_no || o.rider || ''),
    o.status === 'cancelled' ? '<s style="color:var(--red)">' + money(o.total) + '</s>' : money(o.total),
    `<button class="btn" data-act="pv" data-id="${o.id}">View</button> <button class="btn" data-act="rp" data-lang="ur" data-id="${o.id}">Reprint اردو</button> <button class="btn" data-act="rp" data-lang="en" data-id="${o.id}">Reprint EN</button> ` +
    (o.status === 'done' ? `<button class="btn red" data-act="cx" data-id="${o.id}">Cancel</button>` : '')]))}</div>`;
  $('#go').onclick = () => { from = $('#dFrom').value; to = $('#dTo').value || from; viewSales(); };
  view.onclick = e => guard(async () => {
    const rg = e.target.closest('[data-rng]');
    if (rg) { const n = +rg.dataset.rng, d = new Date(to ? to + 'T12:00:00' : Date.now()); d.setDate(d.getDate() - (n ? n - 1 : 0)); const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); from = n ? f(d) : to; viewSales(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'pv') window.open('/slip.html?preview=1&id=' + id, '_blank');
    if (b.dataset.act === 'rp') { await fetch(`/api/orders/${id}/reprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: b.dataset.lang }) }); toast('Reprint queue mein gaya (Printer ON wale PC par niklegi)', 3000); }
    if (b.dataset.act === 'cx' && confirm('Ye order cancel karein? Sale se nikal jaye ga.')) { await A(`/orders/${id}/cancel`, 'POST'); viewSales(); }
  });
}

// ---------- expenses ----------
const EXP_CATS = ['Gas', 'Salary', 'Rent', 'Bijli/Pani', 'Saman (stock)', 'Rider', 'Repair', 'Other'];
async function viewExpenses() {
  const r = await A('/report'); // sirf aaj ki date lene ke liye
  const day = window._expDay || r.from;
  const month = day.slice(0, 7);
  const list = await A(`/expenses?from=${month}-01&to=${month}-31`);
  const sum = list.reduce((s, x) => s + x.amount, 0);
  view.innerHTML = `<div class="box"><b style="color:var(--gold)">Kharcha likhein</b>
    <div class="r"><input type="date" id="eDate" value="${day}"><select id="eCat">${EXP_CATS.map(c => `<option>${c}</option>`).join('')}</select>
      <input id="eNote" placeholder="Note (optional)"><input id="eAmt" type="number" min="1" placeholder="Rs"><button class="btn gold s" id="eAdd">+ Add</button></div></div>
    <div class="box"><b>${month} ka kharcha: ${money(sum)}</b><table><tr><th>Date</th><th>Category</th><th>Note</th><th>Rs</th><th></th></tr>
    ${list.map(x => `<tr><td>${x.date}</td><td>${esc(x.category)}</td><td>${esc(x.note)}</td><td>${money(x.amount)}</td><td><button class="btn red" data-act="dx" data-id="${x.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--mute)">—</td></tr>'}</table></div>`;
  $('#eDate').onchange = e => { window._expDay = e.target.value; viewExpenses(); };
  $('#eAdd').onclick = () => guard(async () => {
    await A('/expenses', 'POST', { date: $('#eDate').value, category: $('#eCat').value, note: $('#eNote').value, amount: $('#eAmt').value });
    toast('Kharcha likh liya ✓'); viewExpenses();
  });
  view.onclick = e => guard(async () => {
    const b = e.target.closest('[data-act="dx"]'); if (!b) return;
    if (confirm('Ye kharcha delete karein?')) { await A('/expenses/' + b.dataset.id, 'DELETE'); viewExpenses(); }
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
  view.innerHTML = '<div class="box">' + FIELDS.map(([k, label, type, opts]) => {
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
  <div class="box" style="background:var(--panel2)"><b style="color:var(--red)">Go-Live: test data saaf</b><div style="color:var(--mute);font-size:13px">Saray test orders, kharche aur log delete hon ge (pehle backup banta hai). Menu, prices aur settings wahi rahen ge. Sheet ke purane rows haath se delete karni hon gi. Ye sirf dukan mein asli kaam shuru karne se pehle dabayen.</div>
    <div class="r"><button class="btn red s" id="goLive">Test data saaf karein</button></div></div>
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
  $('#updCheck').onclick = () => guard(async () => {
    $('#updInfo').textContent = 'Check ho raha hai...';
    const u = await A('/update/check');
    $('#updInfo').innerHTML = u.behind ? `Naya version maujood (${u.behind} tabdeeliyan):<br>• ${u.changes.map(esc).join('<br>• ')}` : 'Aap ke paas latest version hai ✓';
    $('#updGo').style.display = u.behind ? '' : 'none';
  });
  $('#updGo').onclick = () => guard(async () => {
    if (!confirm('Update karein? Software 5 second ke liye band ho kar dobara chalega. Data safe rahta hai.')) return;
    const u = await A('/update', 'POST'); toast(u.message, 6000); $('#updInfo').textContent = u.message;
  });
  $('#goLive').onclick = () => guard(async () => {
    const w = prompt('Saray orders/kharche/log delete ho jayen ge. Pakka? Confirm ke liye RESET likhein:');
    if (w !== 'RESET') return toast('Cancel kiya, kuch delete nahi hua', 3000);
    const x = await A('/golive-reset', 'POST', { confirm: 'RESET' });
    toast('Saaf ho gaya. Backup: ' + x.backup, 6000); viewSettings();
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
