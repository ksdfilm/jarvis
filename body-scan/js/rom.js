// โหมดองศาข้อต่อ (Range of Motion) — แขน/ขา จากโครงร่าง, คอ จากใบหน้า
import { angle3, deg, mean, saveResult, history, esc } from './util.js';

const SIDE = { L: { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, th: 'ซ้าย' }, R: { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, th: 'ขวา' } };
const JOINTS = [
  { id: 'sh_flex', name: 'ไหล่ยกไปข้างหน้า', normal: 180, how: 'หันข้างให้กล้อง (ข้างที่วัดอยู่ใกล้กล้อง) แขนตรง ยกขึ้นไปข้างหน้าจนสุด', pts: s => [s.hip, s.sh, s.el], calc: (P, s) => angle3(P[s.hip], P[s.sh], P[s.el]) },
  { id: 'sh_abd', name: 'ไหล่กางออกด้านข้าง', normal: 180, how: 'หันหน้าเข้ากล้อง แขนตรง ฝ่ามือหงาย กางแขนขึ้นด้านข้างจนสุด', pts: s => [s.hip, s.sh, s.el], calc: (P, s) => angle3(P[s.hip], P[s.sh], P[s.el]) },
  { id: 'elbow', name: 'ข้อศอกงอ', normal: 150, how: 'หันข้าง ต้นแขนแนบลำตัว งอศอกให้มือแตะไหล่ให้มากที่สุด', pts: s => [s.sh, s.el, s.wr], calc: (P, s) => 180 - angle3(P[s.sh], P[s.el], P[s.wr]) },
  { id: 'knee', name: 'เข่างอ', normal: 135, how: 'หันข้าง จับเก้าอี้ไว้ งอเข่าพับส้นเท้าไปด้านหลังให้มากที่สุด', pts: s => [s.hip, s.kn, s.an], calc: (P, s) => 180 - angle3(P[s.hip], P[s.kn], P[s.an]) },
  { id: 'neck_rot', name: 'คอหมุน (หันซ้าย-ขวา)', normal: 80, face: true, dirs: ['ซ้าย', 'ขวา'], how: 'นั่งหลังตรง มองกล้อง กด "เริ่มวัด" แล้วค่อยๆ หันหน้าไปซ้ายสุด แล้วขวาสุด' },
  { id: 'neck_lat', name: 'คอเอียง (หูเข้าหาไหล่)', normal: 45, face: true, dirs: ['ซ้าย', 'ขวา'], how: 'ไหล่อยู่นิ่ง เอียงหูเข้าหาไหล่ซ้ายสุด แล้วขวาสุด' },
  { id: 'neck_flex', name: 'คอก้ม-เงย', normal: 50, normal2: 60, face: true, dirs: ['ก้ม', 'เงย'], how: 'ก้มคางชิดอกให้สุด แล้วเงยหน้ามองเพดานให้สุด' },
];

// head angles from the face transform matrix (column-major 4x4)
function headPose(m) {
  const R = (i, j) => m[j * 4 + i];
  return { yaw: deg(Math.atan2(R(0, 2), R(2, 2))), pitch: deg(Math.asin(-Math.max(-1, Math.min(1, R(1, 2))))), roll: deg(Math.atan2(R(1, 0), R(1, 1))) };
}
// direction cues from raw (unmirrored) landmarks — independent of matrix sign conventions
function cues(f) {
  const eyeY = (f[33].y + f[263].y) / 2;
  return {
    yaw: (f[1].x - (f[234].x + f[454].x) / 2) / (Math.abs(f[454].x - f[234].x) || 1), // + = subject's left
    roll: f[33].y - f[263].y, // + = right eye lower = tilted to subject's right
    pitch: (f[1].y - eyeY) / ((f[152].y - eyeY) || 1), // grows when looking down
  };
}

let joint = JOINTS[0], side = 'L', cur = null, best = {}, meas = false, base = null, calib = [], results = {}, root, uiT = 0;

function key() { return joint.face ? joint.id : joint.id + side; }
function renderLive() {
  const el = root.querySelector('#rLive');
  const bestTxt = joint.face
    ? joint.dirs.map(d => `${d} ${best[d] != null ? Math.round(best[d]) + '°' : '--'}`).join(' · ')
    : `สูงสุด ${best.v != null ? Math.round(best.v) + '°' : '--'}`;
  const pct = !joint.face && best.v != null ? Math.min(100, best.v / joint.normal * 100) : null;
  el.innerHTML = `<div class="big-num">${cur != null ? Math.round(cur) : '--'}°<small>${meas ? 'กำลังวัด' : 'สด'}</small></div>
    <div style="margin-top:6px">${bestTxt} <span class="sub">(ปกติ ~${joint.normal}°${joint.normal2 ? ' / ' + joint.normal2 + '°' : ''})</span></div>
    ${pct != null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}`;
}
function renderTable() {
  const rows = [];
  for (const j of JOINTS) {
    if (j.face) {
      const r = results[j.id]; if (!r) continue;
      const vals = j.dirs.map((d, i) => r[d]);
      const pct = vals.map((v, i) => v == null ? null : Math.round(v / (i && j.normal2 ? j.normal2 : j.normal) * 100));
      rows.push(`<tr><td>${j.name}</td>${vals.map((v, i) => `<td class="n">${v == null ? '--' : Math.round(v) + '° ' + pct[i] + '%'}</td>`).join('')}<td>${flag(vals[0], vals[1])}</td></tr>`);
    } else {
      const l = results[j.id + 'L'], r = results[j.id + 'R'];
      if (l == null && r == null) continue;
      const f = v => v == null ? '--' : `${Math.round(v)}° ${Math.round(v / j.normal * 100)}%`;
      rows.push(`<tr><td>${j.name}</td><td class="n">${f(l)}</td><td class="n">${f(r)}</td><td>${flag(l, r)}${[l, r].some(v => v != null && v / j.normal < .75) ? ' <span style="color:var(--warn)">ต่ำกว่าปกติ</span>' : ''}</td></tr>`);
    }
  }
  root.querySelector('#rTable').innerHTML = rows.length
    ? `<table class="rom-table"><tr><th>ข้อต่อ</th><th>ซ้าย/ก้ม</th><th>ขวา/เงย</th><th></th></tr>${rows.join('')}</table>
       <p class="note">% = เทียบค่าปกติผู้ใหญ่ (AAOS) · ต่างกันเกิน 15% ระหว่างซ้าย-ขวา ควรสังเกตอาการ ถ้ามีปวด/ข้อติดควรพบแพทย์หรือนักกายภาพ</p>` : '';
}
const flag = (a, b) => a != null && b != null && Math.abs(a - b) / Math.max(a, b) > .15 ? '<span style="color:var(--bad)">⚠ ไม่สมดุล</span>' : '';

function renderHist() {
  const h = history('rom').slice(0, 6);
  root.querySelector('#rHist').innerHTML = h.length ? `<h4>ประวัติ</h4>` + h.map(r => `<div><time>${new Date(r.t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</time>${esc(r.title)} ${r.lines.map(esc).join(' · ')}</div>`).join('') : '';
}

function setup() {
  root.querySelector('#rSide').style.display = joint.face ? 'none' : '';
  root.querySelector('#rHow').textContent = joint.how;
  best = {}; cur = null; meas = false; base = null;
  root.querySelector('#rGo').textContent = '▶ เริ่มวัด';
  renderLive();
}

export default {
  id: 'rom', icon: '💪', title: 'ข้อต่อ', hud: 'RANGE OF MOTION // JOINT',
  needs: () => (joint.face ? 'face' : 'pose'),
  mount(el, k) {
    root = el;
    el.innerHTML = `<h2>💪 วัดองศาการเคลื่อนไหวข้อต่อ</h2>
      <p class="sub">ใช้ติดตามการฟื้นฟูหลังบาดเจ็บ หรือตรวจข้อติด เปรียบเทียบซ้าย-ขวา</p>
      <div class="seg" id="rJoint">${JOINTS.map(j => `<button class="btn${j === joint ? ' on' : ''}" data-j="${j.id}">${j.name}</button>`).join('')}</div>
      <div class="seg" id="rSide"><button class="btn on" data-s="L">ข้างซ้าย</button><button class="btn" data-s="R">ข้างขวา</button></div>
      <p class="sub" id="rHow"></p>
      <div id="rLive"></div>
      <div class="seg" style="margin-top:12px"><button class="btn primary" id="rGo">▶ เริ่มวัด</button><button class="btn" id="rSave">💾 บันทึกผล</button></div>
      <div id="rTable"></div>
      <div class="hist" id="rHist"></div>`;
    el.querySelector('#rJoint').onclick = e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      joint = JOINTS.find(j => j.id === b.dataset.j);
      el.querySelectorAll('#rJoint .btn').forEach(x => x.classList.toggle('on', x === b));
      setup();
    };
    el.querySelector('#rSide').onclick = e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      side = b.dataset.s;
      el.querySelectorAll('#rSide .btn').forEach(x => x.classList.toggle('on', x === b));
      setup();
    };
    el.querySelector('#rGo').onclick = () => {
      best = {}; meas = true; base = null; calib = [];
      el.querySelector('#rGo').textContent = '↺ วัดใหม่';
      if (joint.face) k.guide('มองตรงที่กล้องนิ่งๆ ครู่หนึ่ง…');
    };
    el.querySelector('#rSave').onclick = () => {
      if (joint.face) {
        if (!joint.dirs.some(d => best[d] != null)) return;
        results[joint.id] = { ...best };
        saveResult('rom', joint.name, joint.dirs.map(d => `${d} ${best[d] != null ? Math.round(best[d]) + '°' : '--'}`));
      } else {
        if (best.v == null) return;
        results[key()] = best.v;
        saveResult('rom', `${joint.name} ${SIDE[side].th}`, [`${Math.round(best.v)}° (${Math.round(best.v / joint.normal * 100)}% ของปกติ)`]);
      }
      renderTable(); renderHist();
    };
    setup(); renderTable(); renderHist();
  },
  unmount() {},
  frame(res, k, now) {
    if (joint.face) {
      if (!res.face || !res.matrix) { k.guide('ยังไม่เห็นใบหน้า — หันหน้าเข้ากล้อง'); cur = null; }
      else {
        k.faceMesh(res.face, 4);
        const hp = headPose(res.matrix), c = cues(res.face);
        const ax = joint.id === 'neck_rot' ? 'yaw' : joint.id === 'neck_lat' ? 'roll' : 'pitch';
        if (meas && !base) {
          calib.push({ hp, c });
          if (calib.length >= 15) {
            base = { v: mean(calib.map(x => x.hp[ax])), c: mean(calib.map(x => x.c[ax])) };
            k.guide(`เริ่มได้ — ${joint.how.split('แล้ว').slice(-1)[0] || 'ขยับช้าๆ จนสุด'}`);
          }
        }
        const v0 = base?.v ?? 0, c0 = base?.c ?? (ax === 'pitch' ? c.pitch : 0);
        cur = Math.abs(hp[ax] - v0);
        const dirIdx = ax === 'yaw' ? (c.yaw - c0 > 0 ? 0 : 1) : ax === 'roll' ? (c.roll - c0 > 0 ? 1 : 0) : (c.pitch - c0 > 0 ? 0 : 1);
        const dir = joint.dirs[dirIdx];
        if (meas && base && cur > 3) best[dir] = Math.max(best[dir] ?? 0, cur);
        const n = k.P(res.face[1]);
        k.label({ x: n.x + 20, y: n.y - 20 }, `${dir} ${Math.round(cur)}°`, '#3ce7ff', 18);
        // axis guide through the face
        const a = k.P(res.face[10]), b = k.P(res.face[152]);
        k.line(a, b, 'rgba(255,200,69,.8)', 2);
        if (!meas) k.guide('กด "เริ่มวัด" เมื่อพร้อม');
      }
    } else {
      const s = SIDE[side];
      if (!res.pose) { k.guide('ยังไม่เห็นร่างกาย'); cur = null; }
      else {
        const P = k.skeleton(res.pose, 'rgba(60,231,255,.35)');
        const [a, b, c] = joint.pts(s);
        if ([a, b, c].every(i => P[i].v > .55)) {
          cur = joint.calc(P, s);
          k.line(P[a], P[b], '#ffc845', 4); k.line(P[b], P[c], '#ffc845', 4);
          k.arc(P[b], 42, Math.atan2(P[a].y - P[b].y, P[a].x - P[b].x), Math.atan2(P[c].y - P[b].y, P[c].x - P[b].x), '#ffc845');
          k.label({ x: P[b].x + 50, y: P[b].y - 10 }, `${Math.round(cur)}°`, '#ffc845', 22);
          if (meas) best.v = Math.max(best.v ?? 0, cur);
          k.guide(meas ? 'ขยับช้าๆ จนสุด แล้วค้างไว้ 1 วินาที' : 'กด "เริ่มวัด" เมื่อพร้อม');
        } else { cur = null; k.guide(`ยังเห็นแขน/ขา${s.th}ไม่ชัด — ปรับตำแหน่งให้อยู่ในกรอบ`); }
      }
    }
    if (now - uiT > 150) { uiT = now; renderLive(); }
  },
};
