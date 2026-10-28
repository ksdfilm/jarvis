// โหมดตั้งโต๊ะ (Standby): นาฬิกา HUD ใหญ่เต็มจอ ตอนวางมือถือชาร์จแนวนอน
// กันจอดับด้วย Wake Lock (ถ้าเครื่องรองรับ) · 22:00–06:00 หรี่เป็นสีแดงไม่แสบตา · แตะเพื่อออก
let ctx, el = null, timer = 0, lockSentinel = null;
const pad = (n) => String(n).padStart(2, '0');

async function keepAwake() {
  try { lockSentinel = await navigator.wakeLock?.request('screen'); } catch { lockSentinel = null; }
}
function onVis() { if (el && !document.hidden) keepAwake(); }

function tick() {
  if (!el) return;
  const now = new Date(), h = now.getHours();
  el.classList.toggle('night', h >= 22 || h < 6);
  el.querySelector('.sb-time').innerHTML = `${pad(h)}<i>:</i>${pad(now.getMinutes())}`;
  el.querySelector('.sb-date').textContent = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const s = ctx.summary();
  el.querySelector('.sb-info').innerHTML = s.map(([k, v]) => `<span><small>${k}</small>${ctx.esc(v)}</span>`).join('');
  const sec = now.getSeconds() + now.getMilliseconds() / 1000;
  el.querySelector('.sb-sec').style.transform = `rotate(${sec * 6}deg)`;
}

function open() {
  if (el) return;
  el = document.createElement('section');
  el.className = 'standby';
  el.setAttribute('aria-label', 'โหมดตั้งโต๊ะ');
  el.innerHTML = `<div class="sb-ring" aria-hidden="true"><i class="sb-sec"></i></div>
    <div class="sb-main"><div class="sb-time"></div><div class="sb-date"></div><div class="sb-info"></div></div>
    <button type="button" class="sb-exit">ออกจากโหมดตั้งโต๊ะ</button>`;
  document.body.append(el);
  document.documentElement.classList.add('no-scroll');
  el.addEventListener('click', (e) => {
    if (e.target.closest('.sb-exit')) return close();
    el.classList.add('show-exit');
    clearTimeout(el._t); el._t = setTimeout(() => el?.classList.remove('show-exit'), 3000);
  });
  keepAwake();
  document.addEventListener('visibilitychange', onVis);
  tick();
  timer = setInterval(tick, 250);
  if (!navigator.wakeLock) ctx.toast('เครื่องนี้กันจอดับอัตโนมัติไม่ได้ · ตั้งได้ที่ ตั้งค่า → จอภาพและความสว่าง → ล็อกอัตโนมัติ → ไม่ใช้');
}
function close() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVis);
  lockSentinel?.release?.().catch(() => {});
  lockSentinel = null;
  el?.remove();
  el = null;
  document.documentElement.classList.remove('no-scroll');
}

export default {
  init(c) {
    ctx = c;
    ctx.addIntent(/ตั้งโต๊ะ|standby|นาฬิกาใหญ่|โหมดชาร์จ/, () => { setTimeout(open, 1200); return { text: 'เข้าโหมดตั้งโต๊ะค่ะ แตะหน้าจอเพื่อออก' }; });
  },
  open,
  close,
};
