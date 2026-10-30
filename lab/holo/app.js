// HOLO//HAND — hand-controlled hologram of a code-built turbofan engine
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bar, gate, toast, permMsg, clamp, lerp, $ } from '../common/lab.js';
import { handTracker, pip, PIP_CSS, GESTURE_TH } from './hand.js';

bar('HOLO//HAND', 'โฮโลแกรมคุมด้วยมือ · เครื่องยนต์ไอพ่น');
document.head.insertAdjacentHTML('beforeend', `<style>${PIP_CSS}</style>`);

const view = $('#view'), labelsEl = $('#labels'), hud = $('#hud');
const CYAN = new THREE.Color(0x3ce7ff), GOLD = new THREE.Color(0xffc845), PINK = new THREE.Color(0xff7ad9);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x01070c);
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x01070c, 14, 40);
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

// ---------- hologram materials ----------
const holoVS = `varying vec3 vN; varying vec3 vV; varying float vY;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vY = wp.y; vec4 mv = viewMatrix * wp; vV = -mv.xyz;
  vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`;
const holoFS = `uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float scan = 0.65 + 0.35 * sin(vY * 28.0 - uTime * 3.0);
  float a = (0.05 + f * 0.8) * scan * uAlpha;
  gl_FragColor = vec4(uColor * a, a); }`;
const holoMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: CYAN.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 } },
  vertexShader: holoVS, fragmentShader: holoFS,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const lineMat = () => new THREE.LineBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

// ---------- geometry helpers (engine axis = x, intake at +x) ----------
const M4 = () => new THREE.Matrix4();
const place = (geo, ...mats) => { const m = M4(); mats.forEach(x => m.multiply(x)); return geo.applyMatrix4(m); };
const T = (x, y = 0, z = 0) => M4().makeTranslation(x, y, z);
const Rx = a => M4().makeRotationX(a), Ry = a => M4().makeRotationY(a), Rz = a => M4().makeRotationZ(a);
// cylinder along x; rFront is the +x end
const cylX = (rFront, rBack, len, x, seg = 32, open = false) =>
  place(new THREE.CylinderGeometry(rFront, rBack, len, seg, 1, open), T(x), Rz(-Math.PI / 2));
// ring of blades around the axis at x
function blades(x, n, r0, r1, chord, twist = 0.5, thick = 0.025) {
  const out = [], span = r1 - r0;
  for (let i = 0; i < n; i++) out.push(place(new THREE.BoxGeometry(thick, span, chord), T(x), Rx(i / n * Math.PI * 2), T(0, r0 + span / 2, 0), Ry(twist)));
  return out;
}
const stage = (x, r, n, hub = 0.55) => [cylX(r * hub, r * hub, 0.05, x, 24), ...blades(x, n, r * hub, r, 0.1, 0.6, 0.02)];

const PARTS = [
  { id: 'spinner', th: 'กรวยหัว', en: 'NOSE SPINNER', dir: [1.7, 0, 0],
    tx: 'กรวยหัวหมุนไปพร้อมใบพัด ช่วยเบี่ยงอากาศให้ไหลเข้าใบพัดอย่างราบรื่น และกันน้ำแข็งเกาะตรงกลาง',
    geo: () => [place(new THREE.ConeGeometry(0.33, 0.55, 28), T(2.38), Rz(-Math.PI / 2))] },
  { id: 'fan', th: 'ใบพัดหน้า', en: 'FAN BLADES', dir: [1.2, 0, 0],
    tx: 'ใบพัดขนาดใหญ่ดูดอากาศเข้า ราว 80–90% ของอากาศไหลอ้อมแกนเครื่อง (bypass) และให้แรงขับส่วนใหญ่',
    geo: () => [cylX(0.34, 0.34, 0.26, 2.0, 28), ...blades(2.0, 18, 0.34, 1.07, 0.3, 0.55, 0.03)] },
  { id: 'nacelle', th: 'ฝาครอบเครื่อง', en: 'NACELLE COWLING', dir: [0.4, 1.9, 0],
    tx: 'เปลือกนอกที่ห่อเครื่องยนต์ ลดแรงต้านอากาศ ลดเสียง และเป็นช่องทางให้อากาศ bypass ไหลผ่าน',
    geo: () => [cylX(1.17, 1.12, 1.75, 1.45, 48, true), place(new THREE.TorusGeometry(1.18, 0.05, 8, 48), T(2.33), Ry(Math.PI / 2))] },
  { id: 'lpc', th: 'คอมเพรสเซอร์แรงดันต่ำ', en: 'LP COMPRESSOR', dir: [0.75, 0, 0],
    tx: 'อัดอากาศขั้นแรก หมุนด้วยเพลาเดียวกับใบพัดหน้า (เพลาแรงดันต่ำ)',
    geo: () => [1.6, 1.45, 1.3].flatMap(x => stage(x, 0.6, 20)) },
  { id: 'hpc', th: 'คอมเพรสเซอร์แรงดันสูง', en: 'HP COMPRESSOR', dir: [0.3, 0, 0],
    tx: 'ใบพัดหลายชั้นที่เล็กลงเรื่อยๆ อัดอากาศจนแรงดันสูงถึง 30–40 เท่าของบรรยากาศ ก่อนส่งเข้าห้องเผาไหม้',
    geo: () => [1.1, 0.98, 0.86, 0.74, 0.62, 0.5].flatMap((x, i) => stage(x, 0.5 - i * 0.025, 16, 0.6)) },
  { id: 'combustor', th: 'ห้องเผาไหม้', en: 'COMBUSTION CHAMBER', dir: [0, 0, 0.9],
    tx: 'ฉีดเชื้อเพลิงผสมอากาศอัดแล้วจุดระเบิดต่อเนื่อง อุณหภูมิสูงกว่า 1,500°C',
    geo: () => {
      const g = [place(new THREE.TorusGeometry(0.42, 0.13, 12, 36), T(0.18), Ry(Math.PI / 2))];
      for (let i = 0; i < 10; i++) g.push(place(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), T(0.38), Rx(i / 10 * Math.PI * 2), T(0, 0.42, 0), Rz(Math.PI / 2)));
      return g;
    } },
  { id: 'hpt', th: 'กังหันแรงดันสูง', en: 'HP TURBINE', dir: [-0.35, 0, 0],
    tx: 'รับแก๊สร้อนจากห้องเผาไหม้มาหมุน แล้วส่งกำลังกลับไปขับคอมเพรสเซอร์แรงดันสูง',
    geo: () => [-0.18, -0.32].flatMap(x => stage(x, 0.47, 22, 0.6)) },
  { id: 'lpt', th: 'กังหันแรงดันต่ำ', en: 'LP TURBINE', dir: [-0.8, 0, 0],
    tx: 'กังหันหลายชั้นที่ใหญ่ขึ้นตามทางไหล ดึงพลังงานที่เหลือมาขับใบพัดหน้าผ่านเพลาแรงดันต่ำ',
    geo: () => [-0.55, -0.7, -0.85, -1.0].flatMap((x, i) => stage(x, 0.52 + i * 0.03, 24, 0.55)) },
  { id: 'shaft', th: 'เพลาหลัก', en: 'MAIN SHAFT', dir: [0, 0, -1.4],
    tx: 'เพลาซ้อนกัน 2 ชั้น เชื่อมกังหันด้านหลังกับคอมเพรสเซอร์และใบพัดด้านหน้า หมุนกว่า 10,000 รอบ/นาที',
    geo: () => [cylX(0.07, 0.07, 3.7, 0.4, 16), cylX(0.12, 0.12, 1.6, 0.15, 16)] },
  { id: 'core', th: 'เปลือกแกนเครื่อง', en: 'CORE CASING', dir: [0, -1.7, 0],
    tx: 'ท่อโลหะทนความร้อนที่ห่อคอมเพรสเซอร์ ห้องเผาไหม้ และกังหันไว้ แยกอากาศแกนกลางออกจากอากาศ bypass',
    geo: () => [cylX(0.62, 0.7, 2.3, 0.05, 40, true)] },
  { id: 'nozzle', th: 'ท่อไอพ่น', en: 'EXHAUST NOZZLE', dir: [-1.4, 0, 0],
    tx: 'เร่งไอเสียความเร็วสูงพุ่งออกด้านหลัง สร้างแรงขับดันส่วนที่เหลือ มีกรวยด้านในช่วยจัดการไหล',
    geo: () => [cylX(0.72, 0.42, 0.9, -1.6, 40, true), place(new THREE.ConeGeometry(0.28, 0.7, 24), T(-1.75), Rz(Math.PI / 2))] },
  { id: 'gearbox', th: 'กล่องเกียร์อุปกรณ์', en: 'ACCESSORY GEARBOX', dir: [0, -2.8, 0],
    tx: 'ดึงกำลังจากเพลาไปขับปั๊มเชื้อเพลิง ปั๊มไฮดรอลิก และเครื่องกำเนิดไฟฟ้าของเครื่องบิน',
    geo: () => [place(new THREE.BoxGeometry(0.7, 0.28, 0.4), T(0.3, -0.92, 0)), cylX(0.09, 0.09, 0.3, 0.75, -0.92), place(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), T(0.3, -0.7, 0))] },
];

const root = new THREE.Group();          // user rotation + scale
const model = new THREE.Group();         // the engine (parts)
root.add(model); scene.add(root);
for (const p of PARTS) {
  const geo = mergeGeometries(p.geo());
  geo.computeBoundingSphere();
  p.center = geo.boundingSphere.center.clone();
  p.mat = holoMat(); p.lmat = lineMat();
  p.obj = new THREE.Group();
  const mesh = new THREE.Mesh(geo, p.mat);
  mesh.userData.part = p;
  p.obj.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), p.lmat));
  p.mesh = mesh;
  p.dirV = new THREE.Vector3(...p.dir);
  model.add(p.obj);
  p.lbl = Object.assign(document.createElement('div'), { className: 'lbl', textContent: p.th });
  labelsEl.appendChild(p.lbl);
}
const pickables = PARTS.map(p => p.mesh);

// projector base: rings, light cone and rising particles
const base = new THREE.Group();
base.position.y = -2.2;
scene.add(base);
for (const [r, o] of [[2.2, 0.7], [1.7, 0.4], [1.2, 0.6]]) {
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * 6.283) * r, 0, Math.sin(i / 96 * 6.283) * r))),
    new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: o, blending: THREE.AdditiveBlending }));
  base.add(ring);
}
const tick = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 120 }, (_, i) => {
  const a = Math.floor(i / 2) / 60 * 6.283, r = i % 2 ? 2.35 : 2.25; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
})), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
base.add(tick);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.2, 4.4, 48, 1, true), new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform float uTime; void main(){ float a = (1.0 - vUv.y) * 0.10 * (0.8 + 0.2 * sin(vUv.x * 60.0 + uTime)); gl_FragColor = vec4(vec3(0.24, 0.9, 1.0) * a, a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
}));
beam.position.y = 2.2;
base.add(beam);
const NP = 260, pPos = new Float32Array(NP * 3);
for (let i = 0; i < NP; i++) { const a = Math.random() * 6.283, r = Math.random() * 2.2; pPos.set([Math.cos(a) * r, Math.random() * 4.4, Math.sin(a) * r], i * 3); }
const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3)),
  new THREE.PointsMaterial({ color: CYAN, size: 0.035, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
base.add(dust);

// ---------- state ----------
const S = { rx: 0.3, ry: -0.7, scale: 1, explode: 0 };          // targets
const cur = { rx: 0.3, ry: -0.7, scale: 1, explode: 0 };        // smoothed
let selected = null, hovered = null, lastInput = 0, action = '';
const slider = $('#explode');
slider.oninput = () => { S.explode = +slider.value; lastInput = performance.now(); };

function select(p) {
  selected = p;
  $('#info').classList.toggle('show', !!p);
  document.querySelectorAll('#chips .btn').forEach(b => b.classList.toggle('on', b.dataset.id === p?.id));
  if (!p) return;
  $('#infoTh').textContent = p.th; $('#infoEn').textContent = p.en; $('#infoTx').textContent = p.tx;
  if (S.explode < 0.35) S.explode = 0.5;
}
$('#infoX').onclick = () => select(null);
$('#chips').innerHTML = PARTS.map(p => `<button class="btn" data-id="${p.id}">${p.th}</button>`).join('');
$('#chips').onclick = e => { const b = e.target.closest('[data-id]'); if (b) select(PARTS.find(p => p.id === b.dataset.id)); };
$('#btnReset').onclick = () => { Object.assign(S, { rx: 0.3, ry: -0.7, scale: 1, explode: 0 }); select(null); };
$('#btnHelp').onclick = () => $('#help').classList.toggle('show');

// ---------- layout ----------
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let W = 1, H = 1;
function resize() {
  const r = view.getBoundingClientRect();
  W = r.width; H = r.height;
  renderer.setSize(W, H, false);
  cam.aspect = W / H;
  // fit a sphere of radius R in both directions
  const R = 3.4, half = THREE.MathUtils.degToRad(cam.fov / 2);
  const hHalf = Math.atan(Math.tan(half) * cam.aspect);
  const dist = R / Math.sin(Math.min(half, hHalf));
  cam.position.set(0, dist * 0.18, dist);
  cam.lookAt(0, -0.2, 0);
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function pick(sx, sy) {
  ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  return raycaster.intersectObjects(pickables, false)[0]?.object.userData.part || null;
}

// ---------- mouse / touch ----------
const ptrs = new Map();
let drag = null, pinch0 = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  drag = ptrs.size === 1 ? { x: e.offsetX, y: e.offsetY, rx: S.rx, ry: S.ry, t: performance.now(), moved: 0 } : null;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.scale }; }
  lastInput = performance.now();
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) { hovered = pick(e.offsetX, e.offsetY); return; }
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  lastInput = performance.now();
  if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; S.scale = clamp(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d, 0.4, 2.6); return; }
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    S.ry = drag.ry + dx * 0.008; S.rx = clamp(drag.rx + dy * 0.006, -1.3, 1.3);
  }
});
const up = e => {
  if (drag && ptrs.size === 1 && drag.moved < 6 && performance.now() - drag.t < 400) select(pick(e.offsetX, e.offsetY));
  ptrs.delete(e.pointerId);
  drag = null; if (ptrs.size < 2) pinch0 = null;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch0 = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); S.scale = clamp(S.scale * Math.exp(-e.deltaY * 0.001), 0.4, 2.6); lastInput = performance.now(); }, { passive: false });

// ---------- hands ----------
let tracker = null, pipView = null;
const cursors = {};
let grab = null, scale0 = null, lastPoint = null;
const toScreen = p => ({ x: ((p.x - 0.5) * 1.35 + 0.5) * W, y: ((p.y - 0.5) * 1.35 + 0.5) * H });

async function startCamera() {
  if (tracker) return;
  hud.innerHTML = 'กำลังเปิดกล้อง…';
  const t = handTracker({ numHands: 2 });
  try { await t.start(); } catch (e) { t.stop(); hud.innerHTML = ''; throw e; }
  tracker = t;
  pipView = pip(view, t);
  $('#btnCam').classList.add('on'); $('#btnCam').textContent = '📷 ปิดกล้อง';
  toast('ยกมือให้กล้องเห็น — กด "? ท่ามือ" เพื่อดูวิธีควบคุม', 4000);
}
function stopCamera() {
  tracker?.stop(); tracker = null;
  pipView?.box.remove(); pipView = null;
  Object.values(cursors).forEach(c => c.remove());
  for (const k in cursors) delete cursors[k];
  $('#btnCam').classList.remove('on'); $('#btnCam').textContent = '📷 กล้อง';
}
$('#btnCam').onclick = async () => {
  if (tracker) return stopCamera();
  try { await startCamera(); } catch (e) { console.error(e); toast(permMsg(e)); stopCamera(); }
};

function handFrame(hands, now) {
  pipView?.draw(hands);
  // screen cursors for pointing / pinching hands
  const keep = new Set();
  for (const h of hands) {
    if (h.gesture !== 'point' && h.gesture !== 'pinch') continue;
    keep.add(h.key);
    const c = cursors[h.key] ??= view.appendChild(Object.assign(document.createElement('div'), { className: 'cur' }));
    const s = toScreen(h.gesture === 'pinch' ? h.pinchPt : h.tip);
    c.style.left = s.x + 'px'; c.style.top = s.y + 'px';
    c.classList.toggle('pinch', h.gesture === 'pinch');
  }
  for (const k in cursors) if (!keep.has(k)) { cursors[k].remove(); delete cursors[k]; }
  if (!hands.length) { grab = null; scale0 = null; action = ''; return; }
  lastInput = now;

  const pinching = hands.filter(h => h.gesture === 'pinch');
  action = '';
  if (pinching.length >= 2) {                              // two-hand pinch = scale
    grab = null;
    const [a, b] = pinching, d = Math.hypot(a.pinchPt.x - b.pinchPt.x, a.pinchPt.y - b.pinchPt.y);
    scale0 ??= { d, s: S.scale };
    S.scale = clamp(scale0.s * d / scale0.d, 0.4, 2.6);
    action = `ย่อ/ขยาย ×${S.scale.toFixed(2)}`;
  } else {
    scale0 = null;
    const h = pinching[0];
    if (h) {
      if (!grab || grab.key !== h.key) {
        // a pinch right after pointing at a part = select it
        if (lastPoint && lastPoint.key === h.key && now - lastPoint.t < 700 && lastPoint.part) { select(lastPoint.part); grab = { key: h.key, select: true }; }
        else grab = { key: h.key, x: h.pinchPt.x, y: h.pinchPt.y, rx: S.rx, ry: S.ry };
      } else if (!grab.select) {
        S.ry = grab.ry + (h.pinchPt.x - grab.x) * 6;
        S.rx = clamp(grab.rx + (h.pinchPt.y - grab.y) * 4, -1.3, 1.3);
      }
      action = grab.select ? `เลือก: ${selected?.th || ''}` : 'หยิบหมุนโมเดล';
    } else grab = null;
  }
  for (const h of hands) {
    if (h.gesture === 'open' && !pinching.length) {
      S.explode = clamp((h.spread - 0.75) / 0.7, 0, 1);  // fingers together ≈0.7, wide ≈1.5
      action = `แยกชิ้นส่วน ${Math.round(S.explode * 100)}%`;
    } else if (h.gesture === 'fist' && !pinching.length) {
      S.explode = Math.max(0, S.explode - 0.04);
      action = 'ประกอบกลับ';
    } else if (h.gesture === 'point') {
      const s = toScreen(h.tip);
      const part = pick(s.x, s.y);
      hovered = part;
      lastPoint = { key: h.key, t: now, part };
      if (!action) action = part ? `เล็ง: ${part.th} → จีบเพื่อเลือก` : 'ชี้เล็งชิ้นส่วน';
    }
  }
  slider.value = S.explode;
}

// ---------- render loop ----------
const tmp = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  const t = now / 1000;
  let hands = null;
  if (tracker) {
    hands = tracker.detect(now);
    if (hands) handFrame(hands, now);
  }
  // idle: slow auto-rotate
  if (now - lastInput > 6000) S.ry += 0.003;
  const k = 0.15;
  cur.rx = lerp(cur.rx, S.rx, k); cur.ry = lerp(cur.ry, S.ry, k);
  cur.scale = lerp(cur.scale, S.scale, k); cur.explode = lerp(cur.explode, S.explode, 0.12);
  if (Math.abs(+slider.value - S.explode) > 0.01 && document.activeElement !== slider) slider.value = S.explode;
  root.rotation.set(cur.rx, cur.ry, 0);
  root.scale.setScalar(cur.scale);
  const e = cur.explode * cur.explode * (3 - 2 * cur.explode);  // smoothstep
  const flick = 0.92 + 0.08 * Math.sin(t * 37) * Math.sin(t * 13);
  for (const p of PARTS) {
    p.obj.position.copy(p.dirV).multiplyScalar(e);
    const col = p === selected ? GOLD : p === hovered ? PINK : CYAN;
    p.mat.uniforms.uColor.value.lerp(col, 0.2);
    p.mat.uniforms.uTime.value = t;
    p.mat.uniforms.uAlpha.value = (selected && p !== selected ? 0.45 : 1) * flick;
    p.lmat.color.lerp(col, 0.2);
    p.lmat.opacity = selected && p !== selected ? 0.2 : 0.55;
  }
  // spinning parts
  const spin = t * 2.2;
  for (const id of ['fan', 'spinner', 'lpc', 'lpt']) PARTS.find(p => p.id === id).mesh.rotation.x = spin;
  beam.material.uniforms.uTime.value = t;
  base.rotation.y = t * 0.15; tick.rotation.y = -t * 0.4;
  const pa = dust.geometry.attributes.position;
  for (let i = 0; i < NP; i++) { let y = pa.getY(i) + 0.006; if (y > 4.4) y = 0; pa.setY(i, y); }
  pa.needsUpdate = true;
  renderer.render(scene, cam);

  // floating labels
  const showAll = cur.explode > 0.3;
  for (const p of PARTS) {
    const vis = showAll || p === selected || p === hovered;
    p.lbl.style.opacity = vis ? 1 : 0;
    if (!vis) continue;
    tmp.copy(p.center).applyMatrix4(p.mesh.matrixWorld).project(cam);
    p.lbl.style.left = ((tmp.x + 1) / 2 * W) + 'px';
    p.lbl.style.top = ((1 - tmp.y) / 2 * H) + 'px';
    p.lbl.classList.toggle('sel', p === selected);
  }
  const n = hands ? hands.length : tracker?.hands.length;
  hud.innerHTML = tracker
    ? `มือ ${n ?? 0}${tracker.hands.length ? ' · ' + tracker.hands.map(h => GESTURE_TH[h.gesture]).join(' + ') : ''}<br><span class="st">${action || (n ? '' : 'ยกมือให้กล้องเห็น')}</span>`
    : `โหมดเมาส์/สัมผัส<br><span class="st">ลากหมุน · ซูม · แตะชิ้นส่วน</span>`;
}
requestAnimationFrame(loop);

// ---------- start gate ----------
gate({
  title: 'HOLO//HAND',
  lines: [
    'โฮโลแกรมเครื่องยนต์ไอพ่น 12 ชิ้นส่วน ควบคุมด้วยท่ามือผ่านกล้อง',
    '<b>จีบนิ้ว</b> หมุน · <b>จีบ 2 มือ</b> ย่อ/ขยาย · <b>แบมือ</b> แยกชิ้นส่วน · <b>กำมือ</b> ประกอบกลับ · <b>ชี้+จีบ</b> เลือกชิ้นส่วน',
    'ภาพจากกล้องประมวลผลในเครื่องนี้ ไม่มีการอัปโหลด',
    '<a href="#" class="alt" id="noCam">หรือใช้แบบไม่เปิดกล้อง (เมาส์/นิ้วแตะ) ▸</a>',
  ],
  needs: ['camera'],
  button: '▶ เปิดกล้องและเริ่ม',
  onStart: startCamera,
}).catch(() => {});
$('#noCam').onclick = e => { e.preventDefault(); $('.lab-gate')?.remove(); };

// debug hook for automated tests
window.__lab = { S, get hands() { return tracker?.hands.map(h => ({ g: h.gesture, pinchR: +h.pinchR.toFixed(2), spread: +h.spread.toFixed(2) })) ?? null; }, select: id => select(PARTS.find(p => p.id === id)) };
