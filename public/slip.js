const P = new URLSearchParams(location.search);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE_UR = { dinein: 'ڈائن اِن', takeaway: 'ٹیک اوے', delivery: 'ڈیلیوری' };
const rs = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const row = (label, val, cls = '') => `<div class="row ${cls}"><span>${label}</span><span class="v">${val}</span></div>`;
function when(s) { // "YYYY-MM-DD HH:MM:SS" -> "16-10-2026 09:48 PM"
  const [d, t] = s.split(' '); const [y, m, dd] = d.split('-'); let [h, mi] = t.split(':'); h = +h;
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${dd}-${m}-${y} ${String(h).padStart(2, '0')}:${mi} ${ap}`;
}
const lineName = i => esc(i.item_name) + (i.variant_label ? ` (${esc(i.variant_label)})` : '');

function bill(o, S) {
  const items = o.items.map(i => `<div class="it"><span>${lineName(i)}${i.note ? `<br><span style="font-size:calc(11 * var(--f))">* ${esc(i.note)}</span>` : ''}</span><span class="q">${i.qty}</span><span class="a">${i.price * i.qty}</span></div>`).join('');
  return `<div class="slip">
    <div class="c shop">${esc(S.shop_name)}</div>
    <div class="c small">${esc(S.shop_tagline)}</div>
    <div class="c small">${esc(S.shop_address)}</div>
    <div class="c small" style="direction:ltr">${esc(S.shop_phone)}</div>
    <hr>
    ${row('آرڈر نمبر', '#' + o.order_no, 'grand')}
    ${row('قسم', TYPE_UR[o.type] + (o.table_no ? ' - ' + esc(o.table_no) : ''))}
    ${row('وقت', when(o.created_at))}
    ${o.customer_name ? row('نام', esc(o.customer_name)) : ''}
    ${o.phone ? row('فون', esc(o.phone)) : ''}
    ${o.type === 'delivery' ? `<div class="row"><span>پتہ</span></div><div class="addr">${esc(o.address)}</div>` : ''}
    <hr>
    <div class="items"><div class="it h"><span>Item</span><span class="q">Qty</span><span class="a">Rs</span></div>${items}</div>
    <hr>
    ${row('ذیلی رقم', rs(o.subtotal))}
    ${o.discount ? row('رعایت', '- ' + rs(o.discount)) : ''}
    ${o.delivery_charge ? row('ڈیلیوری چارجز', rs(o.delivery_charge)) : ''}
    ${o.service_charge ? row('سروس چارجز', rs(o.service_charge)) : ''}
    ${row('کل رقم', rs(o.total), 'grand')}
    ${row('ادائیگی', o.payment)}
    <hr>
    <div class="c">${esc(S.bill_footer)}</div>
  </div>`;
}

function kitchen(o) {
  const items = o.items.map(i => `<div class="k"><span class="q">${i.qty} ×</span> ${lineName(i)}
    ${i.details ? `<small>${esc(i.details)}</small>` : ''}${i.note ? `<div class="note">نوٹ: ${esc(i.note)}</div>` : ''}</div>`).join('');
  return `<div class="slip">
    <div class="c title">کچن سلپ</div>
    <div class="c big">#${o.order_no}</div>
    <div class="c" style="font-size:calc(20 * var(--f));font-weight:800">${TYPE_UR[o.type]}${o.table_no ? ' - ' + esc(o.table_no) : ''}</div>
    <div class="c small">${when(o.created_at)}</div>
    <hr>${items}
    ${o.note ? `<div class="note" style="margin-top:6px">آرڈر نوٹ: ${esc(o.note)}</div>` : ''}
  </div>`;
}

function delivery(o) {
  const items = o.items.map(i => `<div style="direction:ltr;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:calc(13 * var(--f))">${i.qty} × ${lineName(i)}</div>`).join('');
  const paid = o.payment !== 'Cash';
  return `<div class="slip">
    <div class="c title">ڈیلیوری سلپ</div>
    <div class="c big">#${o.order_no}</div>
    <div class="c small">${when(o.created_at)}</div>
    <hr>
    ${row('نام', esc(o.customer_name) || '-')}
    ${row('فون', esc(o.phone) || '-')}
    <div class="row"><span>پتہ</span></div><div class="addr" style="font-size:calc(16 * var(--f));font-weight:800">${esc(o.address)}</div>
    ${row('رائیڈر', esc(o.rider) || '-')}
    <hr>${items}<hr>
    <div class="box">${paid ? `<div style="font-size:calc(22 * var(--f));font-weight:800">ادا شدہ (${esc(o.payment)})</div><div class="small">رقم وصول نہیں کرنی</div>`
      : `<div style="font-size:calc(16 * var(--f))">وصولی کریں</div><div style="font-size:calc(30 * var(--f));font-weight:800;direction:ltr">${rs(o.total)}</div>`}</div>
    ${o.delivery_charge ? `<div class="c small">(ڈیلیوری چارجز شامل: ${rs(o.delivery_charge)})</div>` : ''}
  </div>`;
}

(async () => {
  try {
    const id = P.get('id');
    const [o, S] = await Promise.all([fetch('/api/orders/' + id).then(r => r.json()), fetch('/api/settings').then(r => r.json())]);
    const w = parseInt(S.paper_mm) || 80;
    const st = document.createElement('style');
    st.textContent = `@page{size:${w}mm auto;margin:0}body{width:${w - 8}mm}`;
    document.head.appendChild(st);
    const scale = Math.min(250, Math.max(70, parseInt(S.slip_font_scale) || 130)) / 100;
    document.documentElement.style.setProperty('--s', scale);
    let html = '';
    if (S.print_bill === '1') html += bill(o, S);
    if (S.print_kitchen === '1') html += kitchen(o);
    if (o.type === 'delivery' && S.print_delivery === '1') html += delivery(o);
    document.getElementById('root').innerHTML = html;
    if (!P.get('preview')) {
      window.onafterprint = () => parent.postMessage({ slipDone: id }, '*');
      try { await document.fonts.load('20px Gulzar', 'آرڈر'); } catch (e) {}
      await document.fonts.ready;
      setTimeout(() => window.print(), 300);
    }
  } catch (e) {
    document.getElementById('root').textContent = 'Slip load nahi hui: ' + e.message;
    if (!P.get('preview')) parent.postMessage({ slipDone: P.get('id') }, '*');
  }
})();
