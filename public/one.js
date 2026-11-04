// POS sirf AIK window/tab mein chale (PC ki RAM kam hai; do windows se printer late aur stock ghalat ho sakta hai).
// Har khuli POS window har 2 second "main zinda hoon" likhti hai. Nayi window ko zinda wali mil jaye to woh ruk jati hai.
(function () {
  const K = 'posLock', TAKE = 'posTake', now = () => Date.now();
  let ID = '';
  try { ID = sessionStorage.getItem('posId') || Math.random().toString(36).slice(2); sessionStorage.setItem('posId', ID); } catch (e) { return; }
  const read = () => { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { return null; } };
  const mine = () => { try { localStorage.setItem(K, JSON.stringify({ id: ID, t: now() })); } catch (e) {} };

  // Is window ke saare timer band (printer/stock ki polling ruk jaye)
  function stopAll() {
    window.POS_BLOCKED = true;
    const last = setTimeout(() => {}, 0);
    for (let i = 0; i <= last; i++) { clearInterval(i); clearTimeout(i); }
  }
  function block(taken) {
    stopAll();
    const d = document.createElement('div');
    d.id = 'oneBlock';
    d.innerHTML = `<div class="ob-card"><div class="ob-em">🪟</div>
      <h2>POS pehle se doosri window mein khula hai</h2>
      <p>${taken ? 'POS ab doosri window mein chal raha hai.' : 'Aik waqt mein POS sirf aik window mein chalta hai, taake PC tez rahe aur printer late na ho.'}<br>
      Is window ko upar <b>✕</b> se band kar dein.</p>
      <div id="obAuto" style="color:#8fe39b;font-weight:700;margin-top:6px"></div>
      <button id="obHere">Nahi, POS isi window mein chalayein</button>
      <small>Ye dabane se doosri window ka POS ruk jayega.</small></div>`;
    document.body.appendChild(d);
    // Nayi khuli window (tray / icon se) khud band ho jaye, taake RAM na khaye. Purani window chalti rahe.
    let left = 4, auto = null;
    if (!taken && history.length <= 1) {
      const tick = () => { const a = d.querySelector('#obAuto'); if (!a) return;
        if (left <= 0) { clearInterval(auto); a.textContent = 'Band ho rahi hai...'; window.close(); setTimeout(() => { a.textContent = 'Khud band nahi hui, upar ✕ se band kar dein.'; }, 800); return; }
        a.textContent = `Ye window ${left} second mein khud band ho jayegi`; left--; };
      tick(); auto = setInterval(tick, 1000);
    }
    d.querySelector('#obHere').onclick = () => {
      if (auto) clearInterval(auto);
      try { localStorage.setItem(TAKE, JSON.stringify({ id: ID, t: now() })); } catch (e) {}
      mine(); setTimeout(() => location.reload(), 400);
    };
  }

  const l = read();
  if (l && l.id !== ID && now() - l.t < 5000) { block(false); return; }
  mine();
  const hb = setInterval(mine, 2000);
  addEventListener('pagehide', () => { const x = read(); if (x && x.id === ID) try { localStorage.removeItem(K); } catch (e) {} });
  addEventListener('storage', e => {
    if (e.key !== TAKE || !e.newValue) return;
    try { if (JSON.parse(e.newValue).id === ID) return; } catch (x) { return; }
    clearInterval(hb); block(true);
  });
})();
