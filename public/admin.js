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
function show() { document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === tab)); view.onchange = view.onclick = null; ({ menu: viewMenu, sales: viewSales, exp: viewExpenses, stock: viewStock, set: viewSettings })[tab](); }

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
async function viewSales() {
  const r = await A(`/report?from=${from}&to=${to}`);
  from = r.from; to = r.to;
  const t = r.totals;
  const tbl = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" style="color:var(--mute)">—</td></tr>`}</table>`;
  view.innerHTML = `
  <div class="box"><div class="r"><button class="btn s" id="dPrev" title="Pichla din / pichli muddat">◀</button><div class="f"><label>From</label><input type="date" id="dFrom" value="${from}"></div><div class="f"><label>To</label><input type="date" id="dTo" value="${to}"></div><button class="btn s" id="dNext" title="Agla din / agli muddat">▶</button>
    <button class="btn gold s" id="go">Show</button>
    <button class="btn s" data-rng="0">Aaj</button><button class="btn s" data-rng="7">7 din</button><button class="btn s" data-rng="30">30 din</button></div></div>
  <div class="cards">
    <div class="stat"><small>Orders</small><b>${t.n}</b></div><div class="stat"><small>Total sale</small><b>${money(t.total)}</b></div>
    <div class="stat"><small>Discount</small><b>${money(t.discount)}</b></div><div class="stat"><small>Delivery charges</small><b>${money(t.delivery)}</b></div>
    <div class="stat"><small>Service charges</small><b>${money(t.service)}</b></div>
    <div class="stat"><small>Cost (lagat)</small><b>${money(t.cost)}</b></div><div class="stat"><small>Profit (items)</small><b>${money(t.profit)}</b></div>
    <div class="stat"><small>Kharcha</small><b>${money(t.expenses)}</b></div><div class="stat"><small>Net profit</small><b style="color:${t.net < 0 ? 'var(--red)' : 'var(--gold)'}">${money(t.net)}</b></div></div>
  ${r.missing_cost ? `<div class="box" style="border-color:var(--red)">⚠ ${r.missing_cost} items/sizes saman ka rate abhi nahi - un ki lagat 0 ginti hai aur profit zyada dikhega. Stock mein "Saman aaya" ke saath Rs likhein ya Rate daalein.</div>` : ''}
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
    (o.status === 'done' && o.cancel_left > 0 ? `<button class="btn red" data-act="cx" data-id="${o.id}">Cancel</button>` : '')]))}</div>`;
  const span = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1;
  $('#dPrev').onclick = () => { from = shiftDay(from, -span); to = shiftDay(to, -span); viewSales(); };
  $('#dNext').onclick = () => { from = shiftDay(from, span); to = shiftDay(to, span); viewSales(); };
  $('#go').onclick = () => { from = $('#dFrom').value; to = $('#dTo').value || from; viewSales(); };
  view.onclick = e => guard(async () => {
    const rg = e.target.closest('[data-rng]');
    if (rg) { const n = +rg.dataset.rng; to = r.now; from = shiftDay(r.now, n ? -(n - 1) : 0); viewSales(); return; }
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
      <input type="date" id="vDate" class="n" value="${day}"><button class="btn s${mode === 'day' ? ' gold' : ''}" id="vDay">Sirf yeh din</button><button class="btn s${mode === 'month' ? ' gold' : ''}" id="vMon">Poora mahina</button></div><table><tr><th>Date</th><th>Category</th><th>Note</th><th>Rs</th><th></th></tr>
    ${list.map(x => `<tr><td>${x.date}</td><td>${esc(x.category)}</td><td>${esc(x.note)}</td><td>${money(x.amount)}</td><td><button class="btn red" data-act="dx" data-id="${x.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--mute)">—</td></tr>'}</table></div>`;
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
    ${groups.map(g => `<details class="sg" data-g="${esc(g)}"${window._open[g] ? ' open' : ''}><summary><span class="chev">▸</span><span>${esc(g)}</span> <small style="color:var(--mute)">(${items.filter(i => (i.grp || 'Dusra') === g).length} items)</small><small class="tap">tap karke kholein</small>${cnt(g, 'low') ? `<span class="redc yel" title="Kam">${cnt(g, 'low')}</span>` : ''}${cnt(g, 'out') ? `<span class="redc" title="Khatam">${cnt(g, 'out')}</span>` : ''}</summary>
    <table><tr><th>Item</th><th>Bacha</th><th>Roz ki khapat</th><th>Kitne din</th><th>Halat</th><th></th></tr>` + items.filter(i => (i.grp || 'Dusra') === g).map(i => { const t = ST_TXT[i.status]; return `<tr class="st-${i.status}"><td>${esc(i.name)}</td><td><b>${qtyTxt(i, i.bal)}</b></td><td>${i.per_day ? fmtQ(i, i.per_day) : '—'}</td><td>${i.days === null ? '—' : '~' + Math.floor(i.days) + ' din'}</td>
      <td><span style="background:${t[2]};color:${t[1]};border-radius:99px;padding:2px 10px;font-weight:700;font-size:13px">${t[0]}</span></td>
      <td style="white-space:nowrap"><button class="btn s" data-act="cnt" data-id="${i.id}" data-n="${esc(i.name)}" data-b="${i.bal}" data-u="${i.unit}">Ginti</button> <button class="btn s" data-act="min" data-id="${i.id}" data-m="${i.min_level}" data-n="${esc(i.name)}" data-u="${i.unit}">Kam-az-kam: ${i.min_level} ${i.unit}</button> <button class="btn s" data-act="pack" data-id="${i.id}" data-n="${esc(i.name)}" data-u="${i.unit}" data-p="${i.pack_size || ''}" data-pn="${esc(i.pack_name || '')}">${esc(packTxt(i))}</button> <button class="btn s" data-act="rate" data-id="${i.id}" data-n="${esc(i.name)}" data-u="${i.unit}" data-p="${i.pack_size || 0}" data-pn="${esc(i.pack_name || 'pack')}" data-r="${i.rate || 0}">${esc(rateTxt(i))}</button></td></tr>`; }).join('') + '</table></details>').join('') || '<div style="color:var(--mute)">Abhi koi item nahi.</div>'}
    <small style="color:var(--mute)">"Kitne din" pichle 7 din ki sale se nikalta hai. "Ginti" = asal bacha hua likhein, farq khud theek ho jata hai. Dabba, food bag aur ketchup sirf Takeaway/Delivery par minus hote hain. Butter paper, foil aur pasta packing har order par.</small></div>
  <div class="box"><b style="color:var(--gold)">Demand slip (bazaar se kya lana hai)</b>
    <div class="r"><span>Kitne din ka saman?</span><select id="dmDays" class="n">${[3, 4, 5, 6, 7, 10, 14].map(d => `<option value="${d}">${d} din</option>`).join('')}</select><button class="btn gold s" id="dmGo">🧾 Demand banao</button></div>
    <small style="color:var(--mute)">Pichle 7 din ki asal sale se roz ki khapat nikal kar, jitne din chunein utna saman minus jo bacha hai. Pack mein gol kar ke.</small>
    <div id="dmBox"></div></div>
  <div class="box"><b style="color:var(--gold)">Saman aaya (+)</b>
    <div class="r"><select id="iGrp"><option value="">Kya aaya?</option>${GORD.map(g => `<option>${esc(g)}</option>`).join('')}</select><select id="iItem" disabled><option value="">Pehle group chunein</option></select><input id="iPacks" type="number" step="any" min="0" placeholder="Kitne pack"><input id="iQty" type="number" step="any" min="0" placeholder="ya kul miqdar"><input id="iAmt" type="number" min="0" placeholder="Kitne Rs (zaroori)"><input id="iDate" type="date" value="${new Date().toISOString().slice(0, 10)}"><button class="btn gold s" id="iAdd">+ Add</button></div>
    <small style="color:var(--mute)" id="iHint">Pack size set ho to sirf "Kitne pack" likhein (maslan 3), kg khud ban jayenge. Rs likhna zaroori hai, ye Kharcha mein bhi khud darj ho jata hai aur saman ka rate bhi update hota hai.</small></div>
  <div class="box"><b style="color:var(--gold)">Shuru ka stock / sab ki ginti (aik saath)</b>
    <small style="color:var(--mute)">Jo saman abhi dukaan mein hai us ki miqdar likhein (kg / litre / piece). Khali chhorein to wo item nahi badlega.</small>
    <table><tr><th>Item</th><th>System mein</th><th>Asal mein</th></tr>
    ${groups.map(g => `<tr><td colspan="3" style="color:var(--gold);font-weight:700;padding-top:10px">${esc(g)}</td></tr>` + items.filter(i => (i.grp || 'Dusra') === g).map(i => `<tr><td>${esc(i.name)}</td><td>${+i.bal.toFixed(3)} ${i.unit}</td><td><input class="n bulk" data-id="${i.id}" type="number" step="any" min="0" placeholder="${i.unit}" style="max-width:130px"> <small class="bq" style="color:var(--gold)"></small></td></tr>`).join('')).join('')}</table>
    <div class="r"><button class="btn gold s" id="bSave">Sab save karein</button></div></div>
  ${preps.map(p => `<div class="box"><b style="color:var(--gold)">${esc(p.name)} ki recipe (1 batch)</b>
    <small style="color:var(--mute)">Pizza ki recipe mein ${esc(p.name)} gram mein likha hai. Jitna ${esc(p.name)} lagta hai, usi hisaab se neeche wala saman minus hota hai.</small>
    <div class="r"><span>1 batch ka kul wazan: <b>${p.prep_yield} g</b></span></div>
    <div id="pBox${p.id}"></div></div>`).join('')}
  <div class="box"><b style="color:var(--gold)">Recipe (kis item mein kitna saman lagta hai)</b>
    <small style="color:var(--mute)">Recipes final hain, yahan sirf dekh sakte hain. Badalni ho to developer se kahein.</small>
    <select id="rGrp"><option value="">Group chunein...</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    <select id="rSel" disabled><option value="">Pehle group chunein</option></select>
    <div id="rBox"></div></div>
  ${items.length ? `<div class="box"><b style="color:var(--mute)">Item hatayein</b>
    <div class="r"><select id="dItem"><option value="">Kaunsa item hatana hai?</option>${opt}</select><button class="btn red s" id="dGo">Hatayein</button></div>
    <small style="color:var(--mute)">Sirf woh item hatayein jo ab dukaan mein nahi rakhte.</small></div>` : ''}
  <div class="box"><b>Akhri entries</b><table>${d.moves.map(m => `<tr><td>${m.date}</td><td>${esc(m.name)}</td><td>${m.qty > 0 ? '+' : ''}${+(+m.qty).toFixed(3)} ${m.unit}</td><td style="color:var(--mute)">${m.kind === 'in' ? 'Aaya' : 'Ginti'} ${esc(m.note)}</td></tr>`).join('') || '<tr><td style="color:var(--mute)">—</td></tr>'}</table></div>`;

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

  view.querySelectorAll('details.sg').forEach(d => d.addEventListener('toggle', () => { window._open[d.dataset.g] = d.open; }));
  $('#dmGo').onclick = () => guard(async () => {
    const d = await A('/stock/demand?days=' + $('#dmDays').value);
    const q = (r, v) => (r.sub_per && v < 1 ? Math.round(v * r.sub_per) + ' ' + r.sub_unit : +(+v).toFixed(2) + ' ' + r.unit);
    const buyTxt = r => (r.packs ? `${r.packs} ${r.pack_name || 'pack'}` : q(r, r.buy));
    const grps = [...new Set(d.rows.map(r => r.grp))];
    $('#dmBox').innerHTML = !d.rows.length ? '<div style="color:#8fd19e;margin-top:8px">✓ Is waqt kuch mangwane ki zarurat nahi.</div>' :
      `<table style="margin-top:8px"><tr><th>Saman</th><th>Mangwana</th><th>Bacha</th><th>Roz ki khapat</th><th>Andazan Rs</th></tr>${grps.map(g => `<tr><td colspan="5" style="color:var(--gold);font-weight:700;padding-top:10px">${esc(g)}</td></tr>` + d.rows.filter(r => r.grp === g).map(r => `<tr class="st-${r.status}"><td>${esc(r.name)}</td><td><b>${buyTxt(r)}</b>${r.packs ? ` <small style="color:var(--mute)">(${q(r, r.buy)})</small>` : ''}</td><td>${q(r, r.bal)}</td><td>${r.per_day ? q(r, r.per_day) : '—'}</td><td>${r.cost ? money(r.cost) : '—'}</td></tr>`).join('')).join('')}</table>
      <div class="r" style="margin-top:8px"><b style="flex:1">${d.rows.length} cheezein${d.total ? " · andazan " + money(d.total) : ""}</b><button class="btn gold s" id="dmPrint">🖨 Slip print karein</button></div>
      <small style="color:var(--mute)">${d.days} din ke liye, pichle ${d.based_on} din ki sale ke hisaab se.</small>`;
    const pb = $('#dmPrint'); if (pb) pb.onclick = () => {
      const w = window.open('', '_blank', 'width=420,height=700');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Demand slip</title><style>
        @page{size:80mm auto;margin:0} body{font-family:'Segoe UI',Arial,sans-serif;width:72mm;margin:0 auto;padding:3mm 0;color:#000;font-size:13px}
        h1{font-size:18px;text-align:center;margin:0} .c{text-align:center} hr{border:0;border-top:1px dashed #000;margin:6px 0}
        table{width:100%;border-collapse:collapse} td{padding:3px 0;vertical-align:top} td.r{text-align:right;white-space:nowrap;font-weight:600}
        .g{font-weight:700;padding-top:6px;text-decoration:underline} .tick{display:inline-block;width:11px;height:11px;border:1px solid #000;margin-right:4px;vertical-align:-1px}
      </style></head><body><h1>${esc(d.shop || 'Pizza Town')}</h1><div class="c"><b>DEMAND SLIP</b></div>
        <div class="c">${d.date} · ${d.days} din ka saman</div><hr>
        <table>${grps.map(g => `<tr><td colspan="2" class="g">${esc(g)}</td></tr>` + d.rows.filter(r => r.grp === g).map(r => `<tr><td><span class="tick"></span>${esc(r.name)}</td><td class="r">${buyTxt(r)}</td></tr>`).join('')).join('')}</table>
        <hr><div><b>${d.rows.length} cheezein</b>${d.total ? ` · andazan Rs ${Math.round(d.total).toLocaleString('en-PK')}` : ''}</div>
        <div style="font-size:11px;margin-top:4px">Pichle ${d.based_on} din ki sale ke hisaab se</div><br><br></body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };
  });
  $('#iGrp').onchange = () => { const g = $('#iGrp').value; $('#iItem').disabled = !g; $('#iItem').innerHTML = g ? grpItems(items, g, []) : '<option value="">Pehle group chunein</option>'; };
  const iHint = () => { const it = byId[$('#iItem').value], n = +$('#iPacks').value, q = +$('#iQty').value;
    $('#iHint').textContent = !it ? '' : n > 0 && it.pack_size ? `${n} ${it.pack_name || 'pack'} = ${qtyTxt(it, n * it.pack_size)} stock mein judega`
      : q > 0 ? `${qtyTxt(it, q)} stock mein judega` : it.pack_size ? `1 ${it.pack_name || 'pack'} = ${qtyTxt(it, it.pack_size)}. "Kitne pack" likhein, ya kul ${it.unit} likhein.` : `Is ka pack size nahi. Kul ${it.unit} likhein.`;
    $('#iPacks').hidden = !!it && !it.pack_size; $('#iQty').placeholder = it ? `ya kul ${it.unit}` : 'ya kul miqdar'; };
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
  view.querySelectorAll('.bulk').forEach(x => (x.oninput = () => { const it = byId[x.dataset.id]; x.nextElementSibling.textContent = x.value === '' ? '' : '= ' + qtyTxt(it, x.value); }));
  $('#bSave').onclick = () => guard(async () => {
    const rows = [...view.querySelectorAll('.bulk')].filter(x => x.value !== '').map(x => ({ item_id: x.dataset.id, count: x.value }));
    if (!rows.length) throw new Error('Kisi item mein miqdar likhein');
    const r = await A('/stock/count-bulk', 'POST', { rows }); toast(`${r.changed} items ka stock save ✓`); viewStock();
  });
  $('#rGrp').onchange = () => { const g = $('#rGrp').value, sel = $('#rSel'); sel.disabled = !g; sel.innerHTML = g ? '<option value="">Item chunein...</option>' + rc.variants.filter(v => v.cat === g).map(v => { const has = v.recipe.length || v.parts.length; return `<option value="${v.id}">${has ? '✓' : '○'} ${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}${has ? '' : ' (Recipe nahi)'}</option>`; }).join('') : '<option value="">Pehle group chunein</option>'; $('#rBox').innerHTML = ''; };
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
  view.onclick = e => guard(async () => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'cnt') { countDialog(items.find(x => String(x.id) === b.dataset.id), viewStock); return; }
    if (b.dataset.act === 'min') { const c = prompt(`${b.dataset.n}: kam-az-kam kitna hona chahiye? (${b.dataset.u} mein. Isse kam ho to alert aayega)`, b.dataset.m); if (c === null) return; await A('/stock/items/' + b.dataset.id, 'PUT', { min_level: c }); viewStock(); }
    if (b.dataset.act === 'rate') {
      const per = +b.dataset.p ? b.dataset.pn : b.dataset.u, cur = Math.round(+b.dataset.r * (+b.dataset.p || 1));
      const c = prompt(`${b.dataset.n}: 1 ${per} kitne Rs ka aata hai?`, cur || ''); if (c === null || c === '') return;
      await A('/stock/items/' + b.dataset.id, 'PUT', { rate: +c / (+b.dataset.p || 1) }); toast('Rate save ✓'); viewStock(); return;
    }
    if (b.dataset.act === 'pack') {
      const c = prompt(`${b.dataset.n}: 1 pack mein kitne ${b.dataset.u}? (maslan 2)`, b.dataset.p); if (c === null) return;
      const n = prompt('Pack ka naam (maslan Packet, Dabba, Gallon, Carton)', b.dataset.pn || 'Pack'); if (n === null) return;
      await A('/stock/items/' + b.dataset.id, 'PUT', { pack_size: c, pack_name: n }); toast('Pack size save ✓'); viewStock();
    }
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
