// AIR//DRAW — draw glowing neon tubes in 3D with your fingertips
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bar, gate, toast, permMsg, clamp, $, $$, store } from '../common/lab.js';
import { handTracker, pip, PIP_CSS, OneEuroPt, OneEuro, GESTURE_TH } from './hand.js';

bar('AIR//DRAW', 'วาดกลางอากาศ 3D · เส้นแสงนีออน');
document.head.insertAdjacentHTML('beforeend', `<style>${PIP_CSS}</style>`);

const view = $('#view'), stateEl = $('#state');
const COLORS = ['#3ce7ff', '#ff7ad9', '#3dff9a', '#ffc845', '#ff4d6d', '#b48cff', '#ffffff'];
let color = store.get('airdraw.color', COLORS[0]);
let radius = +$('#thick').value;

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x01070c);
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x01070c, 12, 30);
const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
cam.position.set(0, 0, 8);
const controls = new OrbitControls(cam, renderer.domElement);
controls.enableDamping = true; controls.autoRotateSpeed = 1.6;
controls.minDistance = 3; controls.maxDistance = 20;

const grid = new THREE.GridHelper(16, 32, 0x3ce7ff, 0x0d3a48);
grid.position.y = -3;
grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);
{ // faint star dust for depth cues
  const n = 400, p = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - 0.5) * 30;
  scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3)),
    new THREE.PointsMaterial({ color: 0x3ce7ff, size: 0.04, transparent: true, opacity: 0.5 })));
}

// pen cursor
const pen = new THREE.Group();
const penCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
const penGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
pen.add(penCore, penGlow);
pen.visible = false;
scene.add(pen);

// ---------- strokes ----------
const strokes = [];
let cur = null;
function newStroke() {
  const c = new THREE.Color(color);
  cur = {
    pts: [], color, radius,
    core: new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.55) })),
    glow: new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })),
    glow2: new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })),
  };
  cur.core.visible = cur.glow.visible = cur.glow2.visible = false;
  scene.add(cur.core, cur.glow, cur.glow2);
}
function rebuild(s) {
  if (s.pts.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(s.pts, false, 'centripetal');
  const segs = Math.min(s.pts.length * 4, 900);
  for (const [m, r, rs] of [[s.core, s.radius, 8], [s.glow, s.radius * 2.2, 8], [s.glow2, s.radius * 4, 6]]) {
    m.geometry?.dispose();
    m.geometry = new THREE.TubeGeometry(curve, segs, r, rs, false);
    m.visible = true;
  }
}
function addPoint(p) {
  if (!cur) newStroke();
  const last = cur.pts[cur.pts.length - 1];
  if (last && last.distanceTo(p) < 0.035) return;
  cur.pts.push(p.clone());
  rebuild(cur);
}
function endStroke() {
  if (!cur) return;
  if (cur.pts.length < 2) disposeStroke(cur); else strokes.push(cur);
  cur = null;
}
function disposeStroke(s) { for (const m of [s.core, s.glow, s.glow2]) { scene.remove(m); m.geometry?.dispose(); m.material.dispose(); } }
function undo() { endStroke(); const s = strokes.pop(); if (s) disposeStroke(s); }
function clearAll() { endStroke(); strokes.splice(0).forEach(disposeStroke); toast('ล้างภาพแล้ว'); }

// ---------- toolbar ----------
$('#pal').innerHTML = COLORS.map(c => `<button style="background:${c};color:${c}" data-c="${c}" aria-label="สี ${c}"></button>`).join('');
const setColor = c => { color = c; store.set('airdraw.color', c); penGlow.material.color.set(c); $$('#pal button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
$('#pal').onclick = e => { const b = e.target.closest('[data-c]'); if (b) setColor(b.dataset.c); };
setColor(color);
$('#thick').oninput = e => (radius = +e.target.value);
$('#btnUndo').onclick = undo;
$('#btnClear').onclick = clearAll;
$('#btnSpin').onclick = () => { controls.autoRotate = !controls.autoRotate; $('#btnSpin').classList.toggle('on', controls.autoRotate); };
$('#howX').onclick = () => $('#how').remove();
let mouseDraw = false;
$('#btnMouse').onclick = () => {
  mouseDraw = !mouseDraw; controls.enabled = !mouseDraw;
  $('#btnMouse').classList.toggle('on', mouseDraw);
  toast(mouseDraw ? 'โหมดวาดด้วยนิ้ว/เมาส์ — ลากบนจอเพื่อวาด (กดอีกครั้งเพื่อกลับไปหมุนดู)' : 'โหมดหมุนดู — ลากจอเพื่อหมุนรอบภาพ');
};
$('#btnPng').onclick = exportPNG;

// ---------- screen point + depth → world point (relative to the current view) ----------
const ray = new THREE.Raycaster(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
function worldAt(ndcX, ndcY, depth) {
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
  cam.getWorldDirection(fwd);
  const dist = cam.position.distanceTo(controls.target) - depth;   // depth > 0 = toward the viewer
  return tmp.copy(ray.ray.origin).addScaledVector(ray.ray.direction, dist / ray.ray.direction.dot(fwd));
}

// mouse / touch drawing
renderer.domElement.addEventListener('pointerdown', e => {
  if (!mouseDraw) return;
  renderer.domElement.setPointerCapture(e.pointerId);
  newStroke(); mouseDraw = 'down';
  mouseAdd(e);
});
renderer.domElement.addEventListener('pointermove', e => { if (mouseDraw === 'down') mouseAdd(e); });
const mouseUp = () => { if (mouseDraw === 'down') { mouseDraw = true; endStroke(); } };
renderer.domElement.addEventListener('pointerup', mouseUp);
renderer.domElement.addEventListener('pointercancel', mouseUp);
function mouseAdd(e) {
  const r = renderer.domElement.getBoundingClientRect();
  addPoint(worldAt((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0));
}

// ---------- hand ----------
let tracker = null, pipView = null;
const fPen = new OneEuroPt(1.4, 0.6), fPalm = new OneEuro(0.8, 0.5);
let drawing = false, openSince = 0, depthNow = 0;
const PALM_REF = 0.2;   // typical wrist→middle-knuckle length (in frame heights) at arm's length

async function startCamera() {
  if (tracker) return;
  const t = handTracker({ numHands: 1 });
  try { await t.start(); } catch (e) { t.stop(); throw e; }
  tracker = t;
  pipView = pip(view, t);
  $('#depth').style.display = 'block';
  $('#btnCam').classList.add('on'); $('#btnCam').textContent = '📷 ปิดกล้อง';
  toast('ยกมือขึ้น จีบนิ้วโป้ง+นิ้วชี้ค้างไว้เพื่อวาด', 4000);
}
function stopCamera() {
  endStroke(); drawing = false;
  tracker?.stop(); tracker = null; pipView?.box.remove(); pipView = null;
  pen.visible = false; $('#depth').style.display = 'none';
  $('#btnCam').classList.remove('on'); $('#btnCam').textContent = '📷 กล้อง';
}
$('#btnCam').onclick = async () => {
  if (tracker) return stopCamera();
  try { await startCamera(); } catch (e) { console.error(e); toast(permMsg(e)); }
};

function handFrame(hands, now) {
  pipView?.draw(hands);
  const h = hands[0];
  if (!h) {
    pen.visible = false;
    if (drawing) { drawing = false; endStroke(); }
    openSince = 0; showClear(0);
    stateEl.innerHTML = 'ยกมือให้กล้องเห็น';
    fPen.reset(); fPalm.reset();
    return;
  }
  const t = now / 1000;
  const p = fPen.filter(h.pinch ? h.pinchPt : { x: (h.tip.x + h.thumb.x) / 2, y: (h.tip.y + h.thumb.y) / 2 }, t);
  const palm = fPalm.filter(h.palm, t);
  depthNow = clamp((palm - PALM_REF) * 18, -3, 3);            // bigger hand = closer = toward the viewer
  const ndcX = clamp((p.x - 0.5) * 2.4, -1.1, 1.1), ndcY = clamp(-(p.y - 0.5) * 2.4, -1.1, 1.1);
  const wp = worldAt(ndcX, ndcY, depthNow);
  pen.position.copy(wp); pen.visible = true;
  pen.scale.setScalar(h.pinch ? 1.4 : 0.8);
  $('#depth i').style.top = `${(1 - (depthNow + 3) / 6) * 112}px`;

  // open palm held = clear
  if (h.gesture === 'open' && !h.pinch) {
    openSince ||= now;
    const k = (now - openSince) / 1500;
    showClear(k);
    if (k >= 1) { if (strokes.length || cur) clearAll(); openSince = now + 1e9; }
  } else { openSince = 0; showClear(0); }

  if (h.pinch) {
    if (!drawing) { drawing = true; newStroke(); }
    addPoint(wp);
  } else if (drawing) { drawing = false; endStroke(); }
  stateEl.innerHTML = drawing ? '<span class="big">✍ กำลังวาด</span>' : `${GESTURE_TH[h.gesture]} · จีบนิ้วเพื่อวาด`;
  stateEl.innerHTML += `<br>ความลึก ${depthNow >= 0 ? '+' : ''}${depthNow.toFixed(1)} · ${strokes.length + (cur ? 1 : 0)} เส้น`;
}
function showClear(k) {
  const on = k > 0.08 && k < 1.5;
  $('#clearRing').style.display = on ? 'grid' : 'none';
  $('#clearTxt').style.display = on ? 'block' : 'none';
  $('#clearRing').style.setProperty('--p', clamp(k, 0, 1));
}

// ---------- export ----------
function exportPNG() {
  renderer.render(scene, cam);                       // render + read in the same task (no preserveDrawingBuffer needed)
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const s = c.height / 900;
  g.font = `${Math.round(22 * s)}px "Share Tech Mono", monospace`;
  g.fillStyle = 'rgba(60,231,255,.7)';
  g.fillText('KSD//LAB · AIR DRAW', 20 * s, c.height - 20 * s);
  c.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `airdraw-${Date.now()}.png` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('บันทึกภาพ PNG แล้ว (iPhone: ดูในแอป Files › ดาวน์โหลด)');
  }, 'image/png');
}

// ---------- loop ----------
function resize() {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  cam.aspect = r.width / r.height;
  cam.fov = cam.aspect < 0.8 ? 68 : 50;              // portrait phones see more vertically
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
function loop(now) {
  requestAnimationFrame(loop);
  if (tracker) { const hands = tracker.detect(now); if (hands) handFrame(hands, now); }
  else stateEl.innerHTML = mouseDraw ? 'โหมดวาดด้วยนิ้ว/เมาส์' : `${strokes.length} เส้น · ลากจอเพื่อหมุนดู`;
  penGlow.material.opacity = 0.25 + 0.1 * Math.sin(now / 150);
  controls.update();
  renderer.render(scene, cam);
}
requestAnimationFrame(loop);

// a little demo signature so the scene isn't empty before you draw
(function demo() {
  const pts = [];
  for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 1.6, Math.sin(a * 2) * 0.5, Math.sin(a) * 1.6)); }
  const keep = color; color = '#3ce7ff'; radius = 0.05;
  newStroke(); pts.forEach(p => addPoint(p)); endStroke();
  color = keep; radius = +$('#thick').value;
})();

gate({
  title: 'AIR//DRAW',
  lines: [
    'วาดเส้นแสงนีออนลอยในอากาศ 3 มิติด้วยปลายนิ้ว ผ่านกล้อง',
    '<b>จีบนิ้วโป้ง+นิ้วชี้ค้างไว้</b> = วาด · ยื่นมือใกล้/ไกลกล้อง = เส้นลอยหน้า/หลัง',
    '<b>แบมือค้าง 1.5 วิ</b> = ล้าง · วาดเสร็จแล้วลากจอเพื่อหมุนดูรอบทิศ · บันทึก PNG ได้',
    'ภาพจากกล้องประมวลผลในเครื่องนี้ ไม่มีการอัปโหลด',
    '<a href="#" class="alt" id="noCam">ใช้แบบไม่เปิดกล้อง (วาดด้วยนิ้ว/เมาส์) ▸</a>',
  ],
  needs: ['camera'],
  button: '▶ เปิดกล้องและเริ่ม',
  onStart: startCamera,
}).catch(() => {});
$('#noCam').onclick = e => { e.preventDefault(); $('.lab-gate')?.remove(); if (!mouseDraw) $('#btnMouse').click(); };

window.__lab = {
  get strokes() { return strokes.length; }, get pen() { return pen.visible && pen.position.toArray().map(v => +v.toFixed(2)); },
  get depth() { return depthNow; }, get hands() { return tracker?.hands.map(h => ({ g: h.gesture, palm: +h.palm.toFixed(3) })) ?? null; },
  feed: (h, now = performance.now()) => handFrame(h ? [h] : [], now),
};
