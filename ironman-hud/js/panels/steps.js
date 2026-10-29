// แผง STEPS: นับก้าวจากเซนเซอร์ความเร่งของมือถือ · เป้าต่อวัน · ระยะทาง · แคลอรี่ · กราฟ 7 วัน
// ข้อจำกัด: เว็บอ่านข้อมูลก้าวจากแอปสุขภาพ (Health) ไม่ได้ และ iPhone หยุดเว็บเมื่อล็อกจอ/สลับแอป
// → นับเฉพาะตอนเปิดแผงนี้ค้างไว้ (เปิดกันจอดับให้อัตโนมัติถ้าเครื่องรองรับ)
let ctx, counting = false, wake = null;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- ตัวตรวจจับก้าว ----------
// ขนาดความเร่งรวม → กรองความถี่ต่ำ (ลดสั่น) → ลบค่าเฉลี่ยช้า (แรงโน้มถ่วง) → นับเมื่อพุ่งเกินเกณฑ์แล้วตกกลับ
const det = { smooth: 9.81, base: 9.81, armed: true, last: 0, walkMs: 0, lastT: 0 };
const TH_UP = 1.15, TH_DOWN = 0.35, MIN_GAP = 260, MAX_GAP = 2000;
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const t = e.timeStamp || performance.now();
  const mag = Math.hypot(a.x, a.y, a.z);
  det.smooth = det.smooth * 0.75 + mag * 0.25;
  det.base = det.base * 0.985 + det.smooth * 0.015;
  const dyn = det.smooth - det.base;
  if (det.armed && dyn > TH_UP && t - det.last > MIN_GAP) {
    det.armed = false;
    if (t - det.last < MAX_GAP) det.walkMs += t - det.last; // นับเวลาเดินเฉพาะช่วงที่ก้าวต่อเนื่อง
    det.last = t;
    addStep();
  } else if (!det.armed && dyn < TH_DOWN) det.armed = true;
}

// ---------- ข้อมูล ----------
let S; // { days: {key:{steps, walkMs}}, goal, stride(m), weight(kg) }
function loadS() { S = ctx.store.get('steps', null) || { days: {}, goal: 6000, stride: 0.7, weight: 65 }; }
let dirty = 0;
function addStep() {
  const k = dayKey();
  const d = (S.days[k] ||= { steps: 0, walkMs: 0 });
  d.steps++; // เวลาเดินไปบวกตอน save()
  if (++dirty >= 5) save();
  if (d.steps === S.goal) { ctx.fx.play('ok'); ctx.toast(`🎉 ครบเป้า ${S.goal.toLocaleString()} ก้าวแล้ว!`); ctx.speak?.(`เยี่ยมมากค่ะ เดินครบ ${S.goal} ก้าวแล้ว`); }
  render();
}
function save() {
  const k = dayKey();
  if (S.days[k]) S.days[k].walkMs = (S.days[k].walkMs || 0) + det.walkMs;
  det.walkMs = 0; dirty = 0;
  // เก็บไว้ 60 วันพอ
  const keys = Object.keys(S.days).sort();
  while (keys.length > 60) delete S.days[keys.shift()];
  ctx.store.set('steps', S);
}
const today = () => S.days[dayKey()] || { steps: 0, walkMs: 0 };

// ---------- เริ่ม/หยุดนับ ----------
async function start() {
  const D = window.DeviceMotionEvent;
  if (!D) { ctx.toast('อุปกรณ์นี้ไม่มีเซนเซอร์ความเร่ง'); return; }
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') { ctx.toast('ยังไม่อนุญาตเซนเซอร์การเคลื่อนไหว'); return; }
  } catch { ctx.toast('ขออนุญาตไม่สำเร็จ (ต้องเปิดผ่าน https)'); return; }
  addEventListener('devicemotion', onMotion);
  counting = true;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
  ctx.store.set('stepsOn', true);
  render();
}
function stop() {
  removeEventListener('devicemotion', onMotion);
  counting = false;
  save();
  wake?.release?.().catch(() => {}); wake = null;
  ctx.store.set('stepsOn', false);
  render();
}

// ---------- วาด ----------
const C = 2 * Math.PI * 88;
function render() {
  const el = document.getElementById('st-ring');
  if (!el || !S) return;
  const d = today(), frac = Math.min(1, d.steps / S.goal);
  el.querySelector('.st-arc').style.strokeDashoffset = C * (1 - frac);
  el.classList.toggle('done', d.steps >= S.goal);
  document.getElementById('st-num').textContent = d.steps.toLocaleString();
  document.getElementById('st-goal').textContent = `เป้า ${S.goal.toLocaleString()} ก้าว · ${Math.round(frac * 100)}%`;
  // พลังงาน ≈ 0.0005 kcal ต่อก้าวต่อน้ำหนัก 1 กก. (หนัก 65 กก. ≈ 0.033 kcal/ก้าว) — ค่าเฉลี่ยคร่าวๆ
  const km = d.steps * S.stride / 1000, kcal = d.steps * 0.0005 * S.weight;
  const min = Math.round(((d.walkMs || 0) + (counting ? det.walkMs : 0)) / 60000);
  document.getElementById('st-stats').innerHTML = `<span><small>ระยะทาง</small>${km.toFixed(2)} กม.</span><span><small>พลังงาน</small>${Math.round(kcal)} kcal</span><span><small>เวลาเดิน</small>${min} นาที</span>`;
  const btn = document.getElementById('st-toggle');
  btn.textContent = counting ? '⏸ หยุดนับ' : '▶ เริ่มนับก้าว';
  btn.classList.toggle('on', counting);
  document.getElementById('st-live').hidden = !counting;
  // กราฟ 7 วัน
  const days = [...Array(7)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 6 + i); return { dt, n: S.days[dayKey(dt)]?.steps || 0 }; });
  const max = Math.max(S.goal, ...days.map((x) => x.n));
  document.getElementById('st-week').innerHTML = days.map((x, i) => `<div class="st-bar${x.n >= S.goal ? ' hit' : ''}${i === 6 ? ' now' : ''}"><em>${x.n ? (x.n >= 1000 ? `${(x.n / 1000).toFixed(1)}k` : x.n) : ''}</em><span style="height:${Math.max(2, x.n / max * 100)}%"></span><small>${i === 6 ? 'วันนี้' : x.dt.toLocaleDateString('th-TH', { weekday: 'short' })}</small></div>`).join('')
    + `<i class="st-goal-line" style="bottom:calc(${S.goal / max * 100}% * 0.78 + 22px)"></i>`;
  const tot = days.reduce((s, x) => s + x.n, 0), hit = days.filter((x) => x.n >= S.goal).length;
  document.getElementById('st-sum').textContent = `7 วัน: เฉลี่ย ${Math.round(tot / 7).toLocaleString()} ก้าว/วัน · ถึงเป้า ${hit} วัน`;
}

export default {
  id: 'p-steps', en: 'STEPS', th: 'ก้าวเดิน', sub: 'นับก้าว · เป้าต่อวัน · ระยะทาง · 7 วัน',
  html: `<div class="box st-main"><div class="st-ring" id="st-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" class="tm-bg"/><circle cx="100" cy="100" r="88" class="st-arc" stroke-dasharray="${C.toFixed(1)}"/></svg>
        <div class="tm-core"><div class="st-num" id="st-num">0</div><div class="tm-sub">ก้าววันนี้</div><div class="st-goal" id="st-goal"></div></div></div>
      <div class="e-iss st-stats" id="st-stats"></div>
      <p class="st-live" id="st-live" hidden><i></i> กำลังนับ… ถือมือถือหรือใส่กระเป๋ากางเกงแล้วเดินได้เลย (อย่าล็อกจอ)</p>
      <div class="chips"><button type="button" id="st-toggle" class="on">▶ เริ่มนับก้าว</button><button type="button" data-set="goal">🎯 ตั้งเป้า</button><button type="button" data-set="body">⚙ ส่วนสูง/น้ำหนัก</button></div></div>
    <div class="box"><div class="p-lbl">LAST 7 DAYS · 7 วันล่าสุด</div><div class="st-week" id="st-week"></div><p class="hint left" id="st-sum"></p></div>
    <p class="hint">iPhone ไม่ให้เว็บอ่านจำนวนก้าวจากแอปสุขภาพ (Health) และหยุดนับเมื่อล็อกจอหรือสลับแอป · ตัวเลขเป็นค่าประมาณ</p>`,
  init(c) {
    ctx = c;
    loadS();
    const panel = document.getElementById('p-steps');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'st-toggle') { if (counting) stop(); else start(); }
      if (b.dataset.set === 'goal') {
        const v = parseInt(prompt('เป้าหมายกี่ก้าวต่อวัน?', S.goal), 10);
        if (v >= 100 && v <= 100000) { S.goal = v; save(); render(); }
      }
      if (b.dataset.set === 'body') {
        const h = parseFloat(prompt('ส่วนสูง (ซม.) — ใช้คำนวณความยาวก้าว', Math.round(S.stride / 0.415 * 100)));
        const w = parseFloat(prompt('น้ำหนัก (กก.) — ใช้คำนวณพลังงาน', S.weight));
        if (h > 80 && h < 230) S.stride = +(h / 100 * 0.415).toFixed(2);
        if (w > 20 && w < 250) S.weight = w;
        save(); render();
      }
    });
    setInterval(() => { if (counting) save(); }, 30000); // บันทึกเวลาเดินทุก 30 วินาที
    addEventListener('pagehide', () => { if (counting) save(); });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-steps');
    ctx.addIntent(/ก้าว|เดินไปเท่าไหร่|เดินไปกี่|นับก้าว|steps/, (q) => {
      if (/เริ่ม/.test(q) && !counting) { setTimeout(start, 50); }
      const d = today();
      return { text: `วันนี้เดินไป ${d.steps.toLocaleString()} ก้าว ${d.steps >= S.goal ? 'ครบเป้าแล้วค่ะ เก่งมาก' : `อีก ${(S.goal - d.steps).toLocaleString()} ก้าวถึงเป้าค่ะ`}`, go: go() };
    }, 'วันนี้เดินไปกี่ก้าว');
    ctx.addReporter(() => {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const ys = S.days[dayKey(y)]?.steps || 0, d = today();
      if (!ys && !d.steps) return null;
      return `${ys ? `เมื่อวานเดิน ${ys.toLocaleString()} ก้าว ` : ''}เป้าวันนี้ ${S.goal.toLocaleString()} ก้าว${d.steps ? ` ตอนนี้ได้ ${d.steps.toLocaleString()} ก้าวแล้ว` : ''}`;
    });
  },
  show() { render(); },
};
