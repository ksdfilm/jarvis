// ฉากบูตระบบตอนเปิดแอป: วงแหวนประกอบตัว + ข้อความรันทีละบรรทัด + (เลือกได้) EDIT ทักทายด้วยเสียง
// โหมด: ปิด / วันละครั้ง (ค่าเริ่มต้น) / ทุกครั้ง · แตะเพื่อข้ามได้
let ctx;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lines() {
  const name = ctx.userName();
  return [
    ['E.D.I.T SYSTEM v7.0', ''],
    ['INITIALIZING CORE', 'OK'],
    ['LINKING SATELLITE FEED', 'OK'],
    ['WEATHER MODULE', 'ONLINE'],
    ['AIR QUALITY SENSOR', 'ONLINE'],
    ['FLOOD WATCH · BANGKOK', 'ONLINE'],
    ['ORBITAL TRACKING', 'ONLINE'],
    [`WELCOME BACK, ${name}`, ''],
  ];
}

function build() {
  const el = document.createElement('section');
  el.className = 'boot';
  el.setAttribute('aria-label', 'กำลังเริ่มระบบ');
  const rings = [140, 118, 96, 74].map((r, i) => {
    const c = 2 * Math.PI * r;
    return `<circle cx="160" cy="160" r="${r}" fill="none" stroke="var(${i % 2 ? '--acc' : '--hud'})" stroke-width="${i === 0 ? 2 : 4}" stroke-dasharray="${i === 1 ? '14 10' : c}" stroke-dashoffset="${c}" style="--len:${c};animation-delay:${i * 0.18}s" class="b-ring"/>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 320 320" class="b-svg" aria-hidden="true">${rings}
      <circle cx="160" cy="160" r="40" class="b-core"/></svg>
    <div class="b-title">E.D.I.T</div>
    <pre class="b-log" aria-live="polite"></pre>
    <div class="b-bar"><span></span></div>
    <button type="button" class="b-enter" hidden>แตะเพื่อเข้าสู่ระบบ</button>
    <p class="b-skip">แตะเพื่อข้าม</p>`;
  return el;
}

/** เริ่มฉากบูต (force = เรียกจากตั้งค่า) คืน Promise เมื่อจบ */
async function run(force = false) {
  const mode = ctx.store.get('bootMode', 'daily');
  const today = new Date().toDateString();
  if (!force && (mode === 'off' || (mode === 'daily' && ctx.store.get('bootDay', '') === today))) return;
  ctx.store.set('bootDay', today);
  const el = build();
  document.body.append(el);
  let skip = false;
  el.addEventListener('click', () => { skip = true; });
  ctx.fx.play('boot');
  const log = el.querySelector('.b-log'), bar = el.querySelector('.b-bar span');
  const L = lines();
  for (let i = 0; i < L.length && !skip; i++) {
    const [txt, st] = L[i];
    const row = document.createElement('div');
    log.append(row);
    for (let k = 1; k <= txt.length && !skip; k += 2) { row.textContent = txt.slice(0, k); await sleep(14); }
    row.textContent = txt + (st ? ` ${'.'.repeat(Math.max(2, 26 - txt.length))} ${st}` : '');
    if (st) row.classList.add('ok');
    bar.style.width = `${((i + 1) / L.length) * 100}%`;
    await sleep(skip ? 0 : 150);
  }
  if (ctx.store.get('bootVoice', false) && !skip) {
    // iPhone ให้พูดได้หลังผู้ใช้แตะเท่านั้น → ปุ่มเข้าสู่ระบบ
    const btn = el.querySelector('.b-enter');
    btn.hidden = false;
    el.querySelector('.b-skip').hidden = true;
    await new Promise((r) => btn.addEventListener('click', r, { once: true }));
    ctx.speak(`${ctx.greetTh()} ${ctx.nameTh()} ระบบพร้อมใช้งานค่ะ`);
  } else if (!skip) await sleep(450);
  el.classList.add('out');
  await sleep(450);
  el.remove();
}

export default {
  init(c) { ctx = c; },
  run,
};
