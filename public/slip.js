const P = new URLSearchParams(location.search);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANG = {
  ur: { type: { dinein: 'ڈائن اِن', takeaway: 'ٹیک اوے', delivery: 'ڈیلیوری' }, orderNo: 'آرڈر نمبر', kind: 'قسم', time: 'وقت', name: 'نام', phone: 'فون',
    addr: 'پتہ', sub: 'ذیلی رقم', disc: 'رعایت', del: 'ڈیلیوری چارجز', svc: 'سروس چارجز', total: 'کل رقم', pay: 'ادائیگی',
    tbl: 'ٹیبل / ٹوکن', extra: 'ایکسٹرا: ', xtra: 'ایکسٹرا', kitchen: 'کچن سلپ', note: 'نوٹ: ', onote: 'آرڈر نوٹ: ', dslip: 'ڈیلیوری سلپ', rider: 'رائیڈر', paid: 'ادا شدہ', nocollect: 'رقم وصول نہیں کرنی',
    collect: 'وصولی کریں', gift: 'تحفہ / مفت', cxl: 'آرڈر نمبر', cxl2: 'کینسل - نیا نمبر', delIncl: 'ڈیلیوری چارجز شامل: ', cls: '' },
  en: { type: { dinein: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' }, orderNo: 'Order No', kind: 'Type', time: 'Time', name: 'Name', phone: 'Phone',
    addr: 'Address', sub: 'Subtotal', disc: 'Discount', del: 'Delivery charges', svc: 'Service charges', total: 'TOTAL', pay: 'Payment',
    tbl: 'Table / Token', extra: 'EXTRA: ', xtra: 'Extra', kitchen: 'KITCHEN SLIP', note: 'Note: ', onote: 'Order note: ', dslip: 'DELIVERY SLIP', rider: 'Rider', paid: 'PAID', nocollect: 'Do not collect cash',
    collect: 'COLLECT', gift: 'GIFT / FREE', cxl: 'Order #', cxl2: 'CANCELLED - new no.', delIncl: 'Delivery charges included: ', cls: ' en' },
};
const chg = (o, L) => o.replaces ? `<div class="c" style="border:3px solid #000;font-weight:var(--wh);font-size:calc(16 * var(--f));padding:3px;margin:4px 0">${L.cls ? L.cxl + o.replaces + ' ' + L.cxl2 + ' #' + o.order_no : L.cxl + ' ' + o.replaces + ' ' + L.cxl2 + ' ' + o.order_no}</div>` : '';
const rs = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const row = (label, val, cls = '') => `<div class="row ${cls}"><span>${label}</span><span class="v">${val}</span></div>`;
function when(s) { // "YYYY-MM-DD HH:MM:SS" -> "16-10-2026 09:48 PM"
  const [d, t] = s.split(' '); const [y, m, dd] = d.split('-'); let [h, mi] = t.split(':'); h = +h;
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${dd}-${m}-${y} ${String(h).padStart(2, '0')}:${mi} ${ap}`;
}
const lineName = i => esc(i.item_name) + (i.variant_label ? ` (${esc(i.variant_label)})` : '');

function bill(o, S, L) {
  const items = o.items.map(i => `<div class="it"><span>${lineName(i)}</span><span class="q">${i.qty}</span><span class="a">${i.price * i.qty}</span></div>${i.extras_price ? `<div class="it x"><span>+ ${esc(i.extras || L.xtra)}</span><span class="q"></span><span class="a">${i.extras_price}</span></div>` : ''}`).join('');
  return `<div class="slip${L.cls}">
    <div class="c shop">${esc(S.shop_name)}</div>
    <div class="c small">${esc(S.shop_tagline)}</div>
    <div class="c small">${esc(S.shop_address)}</div>
    <div class="c small" style="direction:ltr">${esc(S.shop_phone)}</div>
    <hr>
    ${chg(o, L)}
    ${row(L.orderNo, '#' + o.order_no, 'grand')}
    ${row(L.kind, L.type[o.type])}
    ${row(L.time, when(o.created_at))}
    ${o.customer_name ? row(L.name, esc(o.customer_name)) : ''}
    ${o.phone ? row(L.phone, esc(o.phone)) : ''}
    ${o.type === 'delivery' ? `<div class="row"><span>${L.addr}</span></div><div class="addr">${esc(o.address)}</div>` : ''}
    <hr>
    <div class="items"><div class="it h"><span>Item</span><span class="q">Qty</span><span class="a">Rs</span></div>${items}</div>
    <hr>
    ${row(L.sub, rs(o.subtotal))}
    ${o.discount ? row(L.disc, '- ' + rs(o.discount)) : ''}
    ${o.delivery_charge ? row(L.del, rs(o.delivery_charge)) : ''}
    ${o.service_charge ? row(L.svc, rs(o.service_charge)) : ''}
    ${row(L.total, rs(o.total), 'grand')}
    ${row(L.pay, o.payment === 'Gift' ? L.gift + (o.gift_by ? ' (' + esc(o.gift_by) + ')' : '') : o.payment)}
    <hr>
    <div class="c">${esc(L.cls ? (S.bill_footer_en || 'Thank you! Please visit again') : S.bill_footer)}</div>
  </div>`;
}

function kitchen(o, L) {
  const items = o.items.map(i => `<div class="k"><span class="q">${i.qty} ×</span> ${lineName(i)}
    ${i.details ? `<small>${esc(i.details)}</small>` : ''}${i.extras ? `<div class="extra">+ ${L.extra}${esc(i.extras)}</div>` : ''}${i.note ? `<div class="note">${L.note}${esc(i.note)}</div>` : ''}</div>`).join('');
  return `<div class="slip${L.cls}">
    ${chg(o, L)}<div class="c title">${L.kitchen}</div>
    <div class="c big">#${o.order_no}</div>
    <div class="c" style="font-size:calc(20 * var(--f));font-weight:var(--wh)">${L.type[o.type]}</div>
    ${o.table_no ? `<div class="c" style="font-size:calc(26 * var(--f));font-weight:var(--wh);border:2px solid #000;margin:2px 0">${L.tbl}: ${esc(o.table_no)}</div>` : ''}
    <div class="c small">${when(o.created_at)}</div>
    <hr>${items}
    ${o.note ? `<div class="note" style="margin-top:6px">${L.onote}${esc(o.note)}</div>` : ''}
  </div>`;
}

function delivery(o, L) {
  const items = o.items.map(i => `<div style="direction:ltr;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:calc(13 * var(--f))">${i.qty} × ${lineName(i)}</div>`).join('');
  const paid = o.payment !== 'Cash' || o.total === 0;
  return `<div class="slip${L.cls}">
    ${chg(o, L)}<div class="c title">${L.dslip}</div>
    <div class="c big">#${o.order_no}</div>
    <div class="c small">${when(o.created_at)}</div>
    <hr>
    ${row(L.name, esc(o.customer_name) || '-')}
    ${row(L.phone, esc(o.phone) || '-')}
    <div class="row"><span>${L.addr}</span></div><div class="addr" style="font-size:calc(16 * var(--f));font-weight:var(--wh)">${esc(o.address)}</div>
    ${row(L.rider, esc(o.rider) || '-')}
    <hr>${items}<hr>
    <div class="box">${paid ? `<div style="font-size:calc(22 * var(--f));font-weight:var(--wh)">${L.paid} (${esc(o.payment)})</div><div class="small">${L.nocollect}</div>`
      : `<div style="font-size:calc(16 * var(--f))">${L.collect}</div><div style="font-size:calc(30 * var(--f));font-weight:var(--wh);direction:ltr">${rs(o.total)}</div>`}</div>
    ${o.delivery_charge ? `<div class="c small">(${L.delIncl}${rs(o.delivery_charge)})</div>` : ''}
  </div>`;
}

(async () => {
  try {
    const id = P.get('id');
    const [o, S] = await Promise.all([fetch('/api/orders/' + id).then(r => r.json()), fetch('/api/settings').then(r => r.json())]);
    const w = parseInt(S.paper_mm) || 80;
    const st = document.createElement('style');
    const tp = Math.min(20, Math.max(0, parseFloat(S.slip_top_mm) || 0)), bt = Math.min(30, Math.max(0, S.slip_bottom_mm === undefined || S.slip_bottom_mm === '' ? 1 : parseFloat(S.slip_bottom_mm) || 0));
    const mg = Math.min(15, Math.max(0, parseFloat(S.slip_margin_mm) || 6));
    st.textContent = `@page{size:${w}mm auto;margin:0}html,body{box-sizing:border-box}body{width:${w - 2 * mg}mm;margin-left:auto;margin-right:auto;padding-top:${tp}mm}.slip{padding-bottom:${bt}mm}`;
    document.head.appendChild(st);
    const scale = Math.min(250, Math.max(50, parseInt(S.slip_font_scale) || 130)) / 100;
    document.documentElement.style.setProperty('--s', scale);
    const wt = { thin: ['400', '600'], normal: ['600', '700'], bold: ['700', '800'] }[P.get('w') || S.slip_weight] || ['400', '600'];
    document.documentElement.style.setProperty('--wb', wt[0]); document.documentElement.style.setProperty('--wh', wt[1]);
    const lang = ['ur', 'en'].includes(P.get('lang')) ? P.get('lang') : (['ur', 'en'].includes(o.slip_lang) ? o.slip_lang : (S.slip_lang_default === 'en' ? 'en' : 'ur'));
    const L = LANG[lang];
    let html = '';
    if (S.print_bill === '1') html += bill(o, S, L);
    if (S.print_kitchen === '1') html += kitchen(o, L);
    if (o.type === 'delivery' && S.print_delivery === '1') html += delivery(o, L);
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
