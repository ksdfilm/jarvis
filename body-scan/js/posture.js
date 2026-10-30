// โหมดท่าทาง — วัดความเอียงของไหล่/สะโพก/ศีรษะ, แนวเข่า, คอยื่น จากโครงร่าง 33 จุด
import { tilt, lean, angle3, mid, dist, median, LV, LVTH, saveResult, history, esc } from './util.js';

const COL = { ok: '#3dff9a', warn: '#ffc845', bad: '#ff4d6d' };
const vis = (P, ids) => ids.every(i => P[i] && P[i].v > .5);
const lv = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);

// knee deviation from straight, signed: + = knee towards the midline (X / valgus), - = outwards (O / varus)
function knee(P, hip, kn, ank, midX) {
  const dev = 180 - angle3(P[hip], P[kn], P[ank]);
  const t = (P[kn].y - P[hip].y) / ((P[ank].y - P[hip].y) || 1);
  const lineX = P[hip].x + (P[ank].x - P[hip].x) * t;
  const inward = Math.abs(P[kn].x - midX) < Math.abs(lineX - midX);
  return inward ? dev : -dev;
}

const FRONT = [
  { key: 'shoulder', name: 'ไหล่เอียง', unit: '°', ids: [11, 12], calc: P => Math.abs(tilt(P[11], P[12])), lv: v => lv(v, 2, 5),
    tip: 'ไหล่สองข้างสูงไม่เท่ากัน มักเกิดจากสะพายกระเป๋า/ถือของข้างเดียว หรือกล้ามเนื้อไม่สมดุล ถ้าเกิน 5° ควรให้นักกายภาพตรวจกระดูกสันหลัง' },
  { key: 'hip', name: 'สะโพกเอียง', unit: '°', ids: [23, 24], calc: P => Math.abs(tilt(P[23], P[24])), lv: v => lv(v, 2, 5),
    tip: 'เชิงกรานเอียง อาจมาจากยืนลงน้ำหนักขาข้างเดียวจนชิน หรือขายาวไม่เท่ากัน' },
  { key: 'head', name: 'ศีรษะเอียง', unit: '°', ids: [7, 8], calc: P => Math.abs(tilt(P[7], P[8])), lv: v => lv(v, 3, 7),
    tip: 'ศีรษะเอียงข้าง ลองตรวจท่านั่งทำงาน ตำแหน่งจอ และการหนีบโทรศัพท์ไว้กับไหล่' },
  { key: 'trunk', name: 'ลำตัวเอียงข้าง', unit: '°', ids: [11, 12, 23, 24], calc: P => lean(mid(P[23], P[24]), mid(P[11], P[12])), lv: v => lv(v, 2, 5),
    tip: 'ลำตัวเอียงไปข้างหนึ่ง ร่วมกับไหล่/สะโพกเอียง อาจเป็นสัญญาณกระดูกสันหลังคด (scoliosis) ควรตรวจ Adam\'s forward bend test กับแพทย์' },
  { key: 'kneeL', name: 'แนวเข่าซ้าย', unit: '°', ids: [23, 25, 27, 24], calc: P => knee(P, 23, 25, 27, mid(P[23], P[24]).x), lv: v => lv(Math.abs(v), 6, 12), fmt: v => `${Math.abs(v).toFixed(1)}° ${Math.abs(v) < 3 ? '' : v > 0 ? 'X' : 'O'}`,
    tip: 'เข่าซ้ายไม่ตรงแนว: X = เข่าชิด (valgus) / O = ขาโก่ง (varus) เพิ่มแรงกดที่ข้อเข่า ควรเสริมกล้ามเนื้อสะโพกและต้นขา' },
  { key: 'kneeR', name: 'แนวเข่าขวา', unit: '°', ids: [24, 26, 28, 23], calc: P => knee(P, 24, 26, 28, mid(P[23], P[24]).x), lv: v => lv(Math.abs(v), 6, 12), fmt: v => `${Math.abs(v).toFixed(1)}° ${Math.abs(v) < 3 ? '' : v > 0 ? 'X' : 'O'}`,
    tip: 'เข่าขวาไม่ตรงแนว: X = เข่าชิด (valgus) / O = ขาโก่ง (varus)' },
];

// side view: use whichever side faces the camera
const sideIds = P => {
  const s = ids => ids.reduce((a, i) => a + (P[i]?.v || 0), 0);
  return s([7, 11, 23, 25, 27]) >= s([8, 12, 24, 26, 28]) ? { ear: 7, sh: 11, hip: 23, kn: 25, ank: 27 } : { ear: 8, sh: 12, hip: 24, kn: 26, ank: 28 };
};
const SIDE = [
  { key: 'cva', name: 'มุมคอ (CVA)', unit: '°', calc: (P, s) => (180 / Math.PI) * Math.atan2(P[s.sh].y - P[s.ear].y, Math.abs(P[s.ear].x - P[s.sh].x) || 1e-3), lv: v => (v >= 50 ? 0 : v >= 44 ? 1 : 2), need: s => [s.ear, s.sh],
    tip: 'มุมคอต่ำ = ศีรษะยื่นไปหน้า (Forward head posture) พบบ่อยในคนใช้คอม/มือถือนาน ทุก 2.5 ซม.ที่หัวยื่น คอต้องรับน้ำหนักเพิ่ม ~4.5 กก. ฝึก chin tuck วันละ 3 รอบ × 10 ครั้ง และยกจอให้อยู่ระดับสายตา' },
  { key: 'round', name: 'ลำตัวโน้มหน้า', unit: '°', calc: (P, s) => lean(P[s.hip], P[s.sh]), lv: v => lv(v, 6, 12), need: s => [s.sh, s.hip],
    tip: 'ลำตัวโน้มไปหน้า/หลังค่อม ฝึกยืดอกเปิดไหล่ (doorway stretch) และเสริมกล้ามเนื้อหลังส่วนบน' },
  { key: 'sway', name: 'แนวดิ่ง หู→ข้อเท้า', unit: '%', calc: (P, s) => Math.abs(P[s.ear].x - P[s.ank].x) / (dist(P[s.ear], P[s.ank]) || 1) * 100, lv: v => lv(v, 6, 11), need: s => [s.ear, s.ank],
    tip: 'ศูนย์ถ่วงไม่ตรงแนวดิ่ง (หู-ไหล่-สะโพก-ข้อเท้าควรอยู่ในเส้นเดียวกัน) อาจทำให้ปวดหลังส่วนล่าง' },
];

let view = 'front', live = {}, capture = null, report = null, uiT = 0, root;

function metricHtml(m, v) {
  if (v == null || Number.isNaN(v)) return `<div class="m na"><b>${m.name}</b><span class="v">--</span><span class="d">ยังมองไม่เห็นจุดที่ต้องใช้</span></div>`;
  const l = m.lv(v);
  return `<div class="m ${LV[l]}"><b>${m.name}</b><span class="v">${m.fmt ? m.fmt(v) : v.toFixed(1) + m.unit}</span><span class="d">${LVTH[l]}</span></div>`;
}

function render() {
  const list = view === 'front' ? FRONT : SIDE;
  root.querySelector('#pMetrics').innerHTML = list.map(m => metricHtml(m, live[m.key])).join('');
}

function renderReport() {
  const el = root.querySelector('#pReport');
  if (!report) { el.innerHTML = ''; return; }
  const bad = report.items.filter(i => i.l > 0);
  el.innerHTML = `<div class="report"><h3>ผลสแกน${view === 'front' ? 'ด้านหน้า' : 'ด้านข้าง'} · คะแนนท่าทาง ${report.score}/100</h3>
    ${report.items.map(i => `<div class="m ${LV[i.l]}"><b>${i.name}</b><span class="v">${i.txt}</span><span class="d">${LVTH[i.l]}${i.l ? ' — ' + i.tip : ''}</span></div>`).join('')}
    ${bad.length ? '' : '<p class="note">ท่าทางอยู่ในเกณฑ์ดี 👍</p>'}</div>`;
  renderHist();
}
function renderHist() {
  const h = history('posture').slice(0, 5);
  root.querySelector('#pHist').innerHTML = h.length ? `<h4>ประวัติ</h4>` + h.map(r => `<div><time>${new Date(r.t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</time>${esc(r.title)}<br>${r.lines.map(esc).join(' · ')}</div>`).join('') : '';
}

function startScan() {
  if (capture) return;
  report = null; renderReport();
  const btn = root.querySelector('#pScan'); btn.disabled = true;
  let n = 3;
  k_.count(n);
  const t = setInterval(() => {
    n--;
    if (n > 0) return k_.count(n);
    clearInterval(t); k_.count('');
    capture = { until: performance.now() + 2500, vals: {} };
  }, 800);
}
function finishScan() {
  const list = view === 'front' ? FRONT : SIDE;
  const items = [];
  for (const m of list) {
    const arr = capture.vals[m.key] || [];
    if (arr.length < 5) continue;
    const v = median(arr), l = m.lv(v);
    items.push({ name: m.name, txt: m.fmt ? m.fmt(v) : v.toFixed(1) + m.unit, l, tip: m.tip });
  }
  capture = null;
  root.querySelector('#pScan').disabled = false;
  if (!items.length) { k_.guide('สแกนไม่สำเร็จ — ให้เห็นทั้งตัวในกรอบแล้วลองใหม่'); return; }
  const score = Math.max(0, 100 - items.reduce((s, i) => s + [0, 10, 22][i.l], 0));
  report = { items, score };
  saveResult('posture', `ท่าทาง${view === 'front' ? 'หน้า' : 'ข้าง'} ${score}/100`, items.map(i => `${i.name} ${i.txt}`));
  renderReport();
}

let k_;
export default {
  id: 'posture', icon: '🧍', title: 'ท่าทาง', hud: 'POSTURE // FULL BODY',
  needs: () => 'pose',
  mount(el, k) {
    k_ = k; root = el; live = {}; report = null; capture = null;
    el.innerHTML = `<h2>🧍 สแกนท่าทางทั้งตัว</h2>
      <p class="sub">ยืนตรงตามสบาย ห่างกล้อง 2–3 เมตร ให้เห็นตั้งแต่หัวถึงเท้า</p>
      <div class="seg"><button class="btn on" data-v="front">หันหน้าเข้ากล้อง</button><button class="btn" data-v="side">หันข้าง</button></div>
      <button class="btn primary big" id="pScan" style="width:100%">◉ เริ่มสแกน (นับ 3 วิ)</button>
      <div class="metrics" id="pMetrics"></div>
      <div id="pReport"></div>
      <p class="note">วัดจากภาพ 2 มิติ ค่าคลาดเคลื่อนได้ตามมุมกล้อง — วางกล้องระดับเอว ตั้งตรง ไม่เอียง ใส่เสื้อผ้าไม่หลวมมาก<br>ผลนี้ใช้คัดกรอง ไม่ใช่การวินิจฉัย</p>
      <div class="hist" id="pHist"></div>`;
    el.querySelector('.seg').onclick = e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      view = b.dataset.v; report = null; renderReport();
      el.querySelectorAll('.seg .btn').forEach(x => x.classList.toggle('on', x === b));
      render();
    };
    el.querySelector('#pScan').onclick = startScan;
    render(); renderHist();
  },
  unmount() { capture = null; },
  frame(res, k, now) {
    if (!res.pose) { k.guide('ยังไม่เห็นร่างกาย — ถอยออกให้เห็นทั้งตัว'); live = {}; if (now - uiT > 300) { uiT = now; render(); } return; }
    const P = k.skeleton(res.pose);
    const full = vis(P, [0, 11, 12, 23, 24, 27, 28]) || (view === 'side' && P[27].v + P[28].v > .5);
    k.guide(capture ? 'นิ่งไว้… กำลังสแกน' : full ? '' : 'ถอยออกอีกนิด ให้เห็นถึงข้อเท้า');

    live = {};
    if (view === 'front') {
      for (const m of FRONT) if (vis(P, m.ids)) live[m.key] = m.calc(P);
      // guide lines coloured by status
      const drawLevel = (a, b, key) => {
        if (live[key] == null) return;
        const m = FRONT.find(x => x.key === key), c = COL[LV[m.lv(live[key])]];
        const dx = b.x - a.x, dy = b.y - a.y, e = .35;
        k.line({ x: a.x - dx * e, y: a.y - dy * e }, { x: b.x + dx * e, y: b.y + dy * e }, c, 2.5);
        const ref = Math.min(a.y, b.y) === a.y ? a : b;
        k.line({ x: Math.min(a.x, b.x) - Math.abs(dx) * e, y: ref.y }, { x: Math.max(a.x, b.x) + Math.abs(dx) * e, y: ref.y }, 'rgba(255,255,255,.35)', 1, [4, 4]);
        k.label({ x: Math.max(a.x, b.x) + Math.abs(dx) * e + 6, y: (a.y + b.y) / 2 + 5 }, `${live[key].toFixed(1)}°`, c);
      };
      drawLevel(P[11], P[12], 'shoulder');
      drawLevel(P[23], P[24], 'hip');
      drawLevel(P[7], P[8], 'head');
      if (vis(P, [27, 28])) { // plumb line from between the ankles
        const a = mid(P[27], P[28]);
        k.line({ x: a.x, y: a.y }, { x: a.x, y: 0 }, 'rgba(168,244,255,.5)', 1, [6, 6]);
      }
      if (live.trunk != null) k.line(mid(P[23], P[24]), mid(P[11], P[12]), COL[LV[FRONT[3].lv(live.trunk)]], 3);
    } else {
      const s = sideIds(P);
      for (const m of SIDE) if (vis(P, m.need(s))) live[m.key] = m.calc(P, s);
      if (vis(P, [s.ank])) k.line(P[s.ank], { x: P[s.ank].x, y: 0 }, 'rgba(168,244,255,.5)', 1, [6, 6]);
      if (live.cva != null) {
        const c = COL[LV[SIDE[0].lv(live.cva)]];
        k.line(P[s.sh], P[s.ear], c, 3);
        k.line(P[s.sh], { x: P[s.sh].x + (P[s.ear].x > P[s.sh].x ? 60 : -60), y: P[s.sh].y }, 'rgba(255,255,255,.4)', 1, [4, 4]);
        k.label({ x: P[s.ear].x + 12, y: P[s.ear].y }, `CVA ${live.cva.toFixed(0)}°`, c);
      }
      if (live.round != null) k.line(P[s.hip], P[s.sh], COL[LV[SIDE[1].lv(live.round)]], 3);
    }

    if (capture) {
      k.scanline(now);
      for (const key in live) (capture.vals[key] ??= []).push(live[key]);
      if (now > capture.until) finishScan();
    }
    if (now - uiT > 250) { uiT = now; render(); }
  },
};
