// Order ke baad mazedaar animation (sirf POS ki screen par, 3-5 second, kaam nahi rokti).
// funShow('small' | 'medium' | 'big' | 30000 | 40000 | 50000)
(function () {
  const css = `
  .fun-ov{position:fixed;inset:0;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .fun-card{background:rgba(15,17,22,.88);border:2px solid #e8b94c;border-radius:24px;padding:22px 34px;text-align:center;color:#fff;
    font:700 26px/1.3 'Segoe UI',Arial,sans-serif;animation:funIn .35s ease-out, funOut .4s ease-in forwards;animation-delay:0s,var(--life);max-width:90vw}
  .fun-card .big{font-size:120px;line-height:1.1;display:inline-block}
  .fun-card small{display:block;color:#e8b94c;font-size:18px;margin-top:6px}
  @keyframes funIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes funOut{to{transform:scale(.8);opacity:0}}
  @keyframes shrug{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg) translateY(-6px)}50%{transform:rotate(0)}75%{transform:rotate(12deg) translateY(-6px)}}
  @keyframes lick{0%,100%{transform:scale(1)}30%{transform:scale(1.15) rotate(-6deg)}60%{transform:scale(1.05) rotate(6deg)}}
  @keyframes jump{0%,100%{transform:translateY(0)}40%{transform:translateY(-40px) rotate(-8deg)}60%{transform:translateY(-40px) rotate(8deg)}}
  @keyframes dance{0%{transform:rotate(-15deg) translateX(-20px)}25%{transform:rotate(15deg) translateY(-25px)}50%{transform:rotate(-15deg) translateX(20px)}75%{transform:rotate(15deg) translateY(-25px)}100%{transform:rotate(-15deg) translateX(-20px)}}
  @keyframes rise{from{transform:translateY(0) rotate(0)}to{transform:translateY(-120vh) rotate(var(--r))}}
  @keyframes fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(120vh) rotate(var(--r))}}
  @keyframes burst{0%{transform:translate(0,0) scale(.3);opacity:1}100%{transform:translate(var(--x),var(--y)) scale(1);opacity:0}}
  .fun-p{position:absolute;font-size:46px}
  .fun-c{position:absolute;width:12px;height:18px;border-radius:3px}`;
  let styled = false;
  const R = (a, b) => a + Math.random() * (b - a);
  function layer(ov, n, make) { for (let i = 0; i < n; i++) ov.appendChild(make(i)); }
  function piece(txt, x, y, anim, dur, delay) {
    const e = document.createElement('div'); e.className = 'fun-p'; e.textContent = txt;
    e.style.left = x + 'vw'; e.style.top = y + 'vh'; e.style.setProperty('--r', R(-60, 60) + 'deg');
    e.style.animation = `${anim} ${dur}s ease-in ${delay}s forwards`; return e;
  }
  const SHOW = {
    small: { life: 2.6, html: '<span class="big" style="animation:shrug 1s ease-in-out 2">🍕😐</span><div>Bas itna? Maza nahi aaya</div><small>Agli dafa kuch bara mangwayen 😉</small>' },
    medium: { life: 2.8, html: '<span class="big" style="animation:lick .8s ease-in-out 3">😋</span><div>Mazay aane wale hain!</div><small>Khushboo abhi se aa rahi hai 🍕</small>',
      fx: ov => layer(ov, 8, () => piece('🍕', R(5, 95), -10, 'fall', R(2, 3), R(0, 1))) },
    big: { life: 3.4, html: '<span class="big" style="animation:jump .7s ease-in-out 4">🤤</span><div>Ye to khaate khaate thak jayenge!</div><small>Bara order, bari khushi 🎉</small>',
      fx: ov => layer(ov, 22, () => piece(['🍕', '🍔', '🍟', '🍗'][Math.floor(R(0, 4))], R(2, 98), -15, 'fall', R(2, 3.4), R(0, 1.2))) },
    30000: { life: 4.2, html: '<span class="big">🎈🎉</span><div>Aaj ki sale Rs 30,000!</div><small>Wah ji wah 👏</small>',
      fx: ov => layer(ov, 24, () => piece('🎈', R(2, 98), 105, 'rise', R(3, 4.5), R(0, 1.5))) },
    40000: { life: 4.5, html: '<span class="big">🎆🥳</span><div>Rs 40,000! Kamaal ho gaya!</div><small>Aatishbazi! 🎇</small>',
      fx: ov => {
        layer(ov, 70, () => { const e = document.createElement('div'); e.className = 'fun-c'; const a = R(0, 6.28), d = R(25, 55);
          e.style.left = '50vw'; e.style.top = '45vh'; e.style.background = `hsl(${R(0, 360)},90%,60%)`;
          e.style.setProperty('--x', Math.cos(a) * d + 'vw'); e.style.setProperty('--y', Math.sin(a) * d + 'vh');
          e.style.animation = `burst ${R(1.2, 2.2)}s ease-out ${R(0, .8)}s forwards`; return e; });
        layer(ov, 10, () => piece(['🎆', '🎇', '✨'][Math.floor(R(0, 3))], R(5, 95), R(5, 60), 'shrug', 1, R(0, 1.5)));
      } },
    50000: { life: 5, html: '<span class="big" style="animation:dance .9s ease-in-out infinite">👳🏽‍♂️🕺</span><div>Balle Balle! Rs 50,000! 🥁</div><small>Aaj to bhangra banta hai! 🎊</small>',
      fx: ov => {
        layer(ov, 6, i => { const e = piece(['👳🏽‍♂️', '🕺', '🥁', '💃'][i % 4], 6 + i * 16, R(65, 80), 'dance', .9, 0); e.style.animation = 'dance .9s ease-in-out infinite'; e.style.fontSize = '64px'; return e; });
        layer(ov, 20, () => piece(['🎊', '🎉', '✨'][Math.floor(R(0, 3))], R(2, 98), -10, 'fall', R(2.5, 4), R(0, 2)));
      } },
  };
  window.funShow = function (kind) {
    const s = SHOW[kind]; if (!s) return;
    if (!styled) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); styled = true; }
    document.querySelectorAll('.fun-ov').forEach(x => x.remove());
    const ov = document.createElement('div'); ov.className = 'fun-ov';
    const card = document.createElement('div'); card.className = 'fun-card'; card.style.setProperty('--life', s.life + 's'); card.innerHTML = s.html;
    ov.appendChild(card); if (s.fx) s.fx(ov); document.body.appendChild(ov);
    setTimeout(() => ov.remove(), (s.life + 0.6) * 1000);
  };
  // order ke baad: pehle sale ka jashn (agar hadd paar hui), warna order ke size wala cartoon
  window.funAfterOrder = function (o, settings) {
    if (!o || (settings && settings.fun_enabled === '0')) return;
    if (o.celebrate) return funShow(o.celebrate);
    const small = +(settings && settings.fun_small) || 1000, big = +(settings && settings.fun_big) || 3000;
    funShow(o.total <= small ? 'small' : o.total <= big ? 'medium' : 'big');
  };
})();
