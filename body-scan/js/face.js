// โหมดใบหน้า — ศีรษะเอียง, อัตรากะพริบตา, ตาปิดนาน (ง่วง), ทดสอบความสมมาตรใบหน้าแบบ FAST
import { dist, tilt, median, LV, LVTH, saveResult, history, esc } from './util.js';

const STEPS = [
  { key: 'neutral', th: 'หน้าตรง ผ่อนคลาย', ms: 2000 },
  { key: 'smile', th: 'ยิ้มกว้างให้เห็นฟัน', ms: 2500 },
  { key: 'brow', th: 'เลิกคิ้วขึ้นสูงสุด', ms: 2500 },
  { key: 'eyes', th: 'หลับตาแน่นที่สุด', ms: 2500 },
];
const lv = v => (v < 15 ? 0 : v < 30 ? 1 : 2);

let root, uiT = 0, t0 = 0;
let blink = { n: 0, closed: false, ears: [], closedMs: [], lastT: 0 };
let live = {}, test = null, report = null;

// work in video pixels so distances aren't squashed by the aspect ratio
let VW = 1, VH = 1;
const R = l => ({ x: l.x * VW, y: l.y * VH });
function ear(f, top, bot, a, b) { return dist(R(f[top]), R(f[bot])) / (dist(R(f[a]), R(f[b])) || 1); }
function features(f) {
  const D = dist(R(f[33]), R(f[263])), nose = R(f[1]);
  const rel = i => { const p = R(f[i]); return { x: (p.x - nose.x) / D, y: (p.y - nose.y) / D }; };
  const browH = (brow, lid) => (R(f[lid]).y - R(f[brow]).y) / D;
  return {
    mouthR: rel(61), mouthL: rel(291), // subject's right / left corner
    browR: browH(105, 159), browL: browH(334, 386),
    earR: ear(f, 159, 145, 33, 133), earL: ear(f, 386, 374, 263, 362),
  };
}
const asym = (a, b) => (Math.max(a, b) < 1e-3 ? 0 : Math.abs(a - b) / Math.max(a, b) * 100);

function renderLive() {
  const mins = (performance.now() - t0) / 60000;
  const rate = mins > .33 ? blink.n / mins : null;
  const now = performance.now();
  const recent = blink.closedMs.filter(([t]) => now - t < 60000);
  const perclos = recent.length > 30 ? recent.filter(x => x[1]).length / recent.length * 100 : null;
  const m = (name, v, txt, l, d) => `<div class="m ${v == null ? 'na' : LV[l]}"><b>${name}</b><span class="v">${v == null ? '--' : txt}</span><span class="d">${v == null ? d : LVTH[l] + ' · ' + d}</span></div>`;
  root.querySelector('#fLive').innerHTML =
    m('ศีรษะเอียง', live.roll, `${Math.abs(live.roll ?? 0).toFixed(1)}°`, Math.abs(live.roll) < 3 ? 0 : Math.abs(live.roll) < 7 ? 1 : 2, 'เกณฑ์ < 3°') +
    m('กะพริบตา', rate, `${Math.round(rate)}/นาที`, rate >= 10 && rate <= 25 ? 0 : rate >= 6 && rate <= 35 ? 1 : 2, rate != null && rate < 10 ? 'น้อยเกินไป — ตาล้าจากจอ ลองกฎ 20-20-20' : 'ปกติ 10–25 ครั้ง/นาที (วัดหลัง 20 วิ)') +
    m('เวลาที่ตาปิด (ง่วง)', perclos, `${(perclos ?? 0).toFixed(0)}%`, perclos < 8 ? 0 : perclos < 15 ? 1 : 2, 'ใน 1 นาทีล่าสุด เกิน 15% = ง่วง ควรพัก') +
    m('ตาเปิดซ้าย/ขวา', live.earL, `${((live.earL ?? 0) * 100).toFixed(0)} / ${((live.earR ?? 0) * 100).toFixed(0)}`, asym(live.earL ?? 0, live.earR ?? 0) < 20 ? 0 : 1, 'หนังตาตกข้างเดียวจะต่างกันชัด');
}

function renderReport() {
  const el = root.querySelector('#fReport');
  if (!report) { el.innerHTML = ''; return; }
  const worst = Math.max(...report.items.map(i => i.l));
  el.innerHTML = `<div class="report"><h3>ผลทดสอบความสมมาตรใบหน้า</h3>
    ${report.items.map(i => `<div class="m ${LV[i.l]}"><b>${i.name}</b><span class="v">${i.v == null ? "--" : i.v.toFixed(0) + "%"}</span><span class="d">${LVTH[i.l]} · ${i.d}</span></div>`).join('')}
    ${worst === 2 ? `<div class="alert"><b>⚠ ใบหน้าขยับไม่เท่ากันชัดเจน</b><br>ถ้าเพิ่งเกิดขึ้น<b>ทันที</b> ร่วมกับแขนขาอ่อนแรง หรือพูดไม่ชัด อาจเป็นโรคหลอดเลือดสมอง → <b>โทร 1669 ทันที</b> (ยิ่งเร็วยิ่งดี ภายใน 4.5 ชม.)<br>ถ้าเป็นมานานแล้ว หรือเพิ่งเป็นแต่ไม่มีอาการอื่น อาจเป็นอัมพาตเบลล์ ควรพบแพทย์</div>` : ''}
    <p class="note">ค่า % = ความต่างของการขยับซ้าย-ขวา · คนปกติก็ไม่สมมาตร 100% · แสงด้านเดียว/หน้าเอียงทำให้ค่าเพี้ยนได้</p></div>`;
  renderHist();
}
function renderHist() {
  const h = history('face').slice(0, 5);
  root.querySelector('#fHist').innerHTML = h.length ? `<h4>ประวัติ</h4>` + h.map(r => `<div><time>${new Date(r.t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</time>${esc(r.title)}<br>${r.lines.map(esc).join(' · ')}</div>`).join('') : '';
}
function renderSteps() {
  root.querySelector('#fSteps').innerHTML = STEPS.map((s, i) => `<span class="${test && i < test.i ? 'done' : test && i === test.i ? 'on' : ''}">${i + 1}. ${s.th.split(' ')[0]}</span>`).join('');
}

function finishTest() {
  const s = test.samples;
  const med = (arr, f) => median(arr.map(f));
  const n = s.neutral;
  if (!n.length || !s.smile.length) { test = null; renderSteps(); return; }
  const base = { mRx: med(n, x => x.mouthR.x), mRy: med(n, x => x.mouthR.y), mLx: med(n, x => x.mouthL.x), mLy: med(n, x => x.mouthL.y), bR: med(n, x => x.browR), bL: med(n, x => x.browL), eR: med(n, x => x.earR), eL: med(n, x => x.earL) };
  const peak = (arr, f) => { const v = arr.map(f).sort((a, b) => b - a); return v[Math.floor(v.length * .1)] ?? 0; }; // 90th percentile
  const smR = peak(s.smile, x => Math.hypot(x.mouthR.x - base.mRx, x.mouthR.y - base.mRy));
  const smL = peak(s.smile, x => Math.hypot(x.mouthL.x - base.mLx, x.mouthL.y - base.mLy));
  const brR = peak(s.brow, x => x.browR - base.bR), brL = peak(s.brow, x => x.browL - base.bL);
  const eyR = peak(s.eyes, x => 1 - x.earR / base.eR), eyL = peak(s.eyes, x => 1 - x.earL / base.eL);
  const side = (l, r) => (l < r ? 'ข้างซ้ายขยับน้อยกว่า' : 'ข้างขวาขยับน้อยกว่า');
  const item = (name, l, r, min) => {
    if (Math.max(l, r) < min) return { name, v: null, l: 1, d: 'ขยับน้อยเกินไปจนวัดไม่ได้ ลองทำใหม่ให้ชัดขึ้น' };
    const v = asym(l, r);
    return { name, v, l: lv(v), d: v < 15 ? 'สองข้างเท่ากันดี' : side(l, r) };
  };
  const items = [item('ยิ้ม (มุมปาก)', smL, smR, .05), item('เลิกคิ้ว', brL, brR, .03), item('หลับตาแน่น', eyL, eyR, .25)];
  report = { items };
  test = null;
  k_.count(''); k_.guide('');
  saveResult('face', 'สมมาตรใบหน้า ' + LVTH[Math.max(...items.map(i => i.l))], items.map(i => `${i.name} ${i.v == null ? "--" : i.v.toFixed(0) + "%"}`));
  renderSteps(); renderReport();
}

let k_;
export default {
  id: 'face', icon: '🙂', title: 'ใบหน้า', hud: 'HEAD // FACE ANALYSIS',
  needs: () => 'face',
  mount(el, k) {
    k_ = k; root = el; t0 = performance.now(); blink = { n: 0, closed: false, ears: [], closedMs: [] }; live = {}; report = null; test = null;
    el.innerHTML = `<h2>🙂 สแกนศีรษะและใบหน้า</h2>
      <p class="sub">หันหน้าตรงเข้ากล้อง ห่าง 40–60 ซม. แสงส่องหน้าสม่ำเสมอ</p>
      <div class="metrics" id="fLive"></div>
      <h2 style="margin-top:16px;font-size:16px">ทดสอบความสมมาตรใบหน้า (FAST)</h2>
      <p class="sub">คัดกรองอาการหน้าเบี้ยว: ทำตามคำสั่ง 4 ขั้น ใช้เวลา ~10 วินาที</p>
      <div class="steps" id="fSteps"></div>
      <button class="btn primary big" id="fTest" style="width:100%">◉ เริ่มทดสอบ</button>
      <div id="fReport"></div>
      <div class="hist" id="fHist"></div>`;
    el.querySelector('#fTest').onclick = () => {
      report = null; renderReport();
      test = { i: 0, start: performance.now() + 900, samples: { neutral: [], smile: [], brow: [], eyes: [] } };
      k.count('●'); renderSteps();
    };
    renderSteps(); renderLive(); renderHist();
  },
  unmount() { test = null; },
  frame(res, k, now) {
    VW = k.video.videoWidth; VH = k.video.videoHeight;
    const f = res.face;
    if (!f) { k.guide('ยังไม่เห็นใบหน้า'); live = {}; if (now - uiT > 400) { uiT = now; renderLive(); } return; }
    k.faceMesh(f, 3);
    const ft = features(f);
    live.earL = ft.earL; live.earR = ft.earR;
    // head roll from the outer eye corners, raw image (+ = tilted to subject's right)
    live.roll = -tilt(R(f[33]), R(f[263]));

    // blink: eye "openness" against a rolling open-eye baseline
    const e = (ft.earL + ft.earR) / 2;
    blink.ears.push(e); if (blink.ears.length > 90) blink.ears.shift();
    const open = [...blink.ears].sort((a, b) => a - b)[Math.floor(blink.ears.length * .8)];
    const closed = e < open * .55;
    if (!test) {
      if (blink.closed && !closed) blink.n++;
      blink.closedMs.push([now, closed]);
      if (blink.closedMs.length > 4000) blink.closedMs.splice(0, 1000);
    }
    blink.closed = closed;

    // highlight the points the test measures
    for (const [i, c] of [[61, '#ff7ad9'], [291, '#ff7ad9'], [105, '#ffc845'], [334, '#ffc845'], [159, '#3dff9a'], [145, '#3dff9a'], [386, '#3dff9a'], [374, '#3dff9a']]) k.dot(k.P(f[i]), 3.5, c);
    const a = k.P(f[33]), b = k.P(f[263]);
    k.line(a, b, Math.abs(live.roll) < 3 ? '#3dff9a' : '#ffc845', 1.5, [5, 4]);

    if (test) {
      k.scanline(now);
      const st = STEPS[test.i];
      if (now >= test.start) {
        k.guide(st.th);
        k.count(Math.ceil((test.start + st.ms - now) / 1000));
        if (now > test.start + 300) test.samples[st.key].push(ft); // skip reaction time
        if (now > test.start + st.ms) {
          test.i++;
          if (test.i >= STEPS.length) return finishTest();
          test.start = now + 600;
          k.count('●');
          renderSteps();
        }
      } else k.guide('ถัดไป: ' + st.th);
    } else k.guide('');
    if (now - uiT > 300) { uiT = now; renderLive(); }
  },
};
