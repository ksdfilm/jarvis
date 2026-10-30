// FACTORY//TWIN — stylised 3D factory with live LAN / clinic / weather overlays
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bar, store, toast, onLan, $, isPhone } from '../common/lab.js';

const TYPES = {
  self:    { icon: '🖥', th: 'เครื่องนี้ (XAMPP)',    c: '#3ce7ff' },
  router:  { icon: '🛰', th: 'เราเตอร์ / เกตเวย์',   c: '#ffc845' },
  pc:      { icon: '💻', th: 'คอมพิวเตอร์',          c: '#00ff8c' },
  phone:   { icon: '📱', th: 'มือถือ / แท็บเล็ต',     c: '#ff7ad9' },
  printer: { icon: '🖨', th: 'เครื่องพิมพ์',          c: '#b48cff' },
  camera:  { icon: '📷', th: 'กล้องวงจรปิด',         c: '#ff6b3d' },
  network: { icon: '🔀', th: 'สวิตช์ / AP',          c: '#f5a623' },
  iot:     { icon: '💡', th: 'อุปกรณ์ IoT',          c: '#ffe66b' },
  vm:      { icon: '🧊', th: 'เครื่องเสมือน (VM)',    c: '#6bd0ff' },
  unknown: { icon: '❔', th: 'ไม่ทราบประเภท',        c: '#8a9a92' },
};
const KINDS = {
  office: { th: 'สำนักงาน', icon: '🗂' }, line: { th: 'ไลน์ผลิต', icon: '⚙️' }, warehouse: { th: 'คลังสินค้า', icon: '📦' },
  nurse: { th: 'ห้องพยาบาล', icon: '⛑' }, server: { th: 'ห้อง Server', icon: '🗄' }, other: { th: 'อื่นๆ', icon: '▫️' },
};
const DEFAULT = {
  zones: [
    { name: 'ไลน์ผลิต A', kind: 'line', floor: 1, color: '#ffc845', types: ['camera', 'iot'] },
    { name: 'คลังสินค้า', kind: 'warehouse', floor: 1, color: '#b48cff', types: ['unknown'] },
    { name: 'สำนักงาน', kind: 'office', floor: 2, color: '#3dff9a', types: ['pc', 'printer', 'phone'] },
    { name: 'ห้องพยาบาล', kind: 'nurse', floor: 2, color: '#ff7ad9', types: [] },
    { name: 'ห้อง Server', kind: 'server', floor: 3, color: '#3ce7ff', types: ['router', 'network', 'self', 'vm'] },
    { name: 'ห้องประชุม', kind: 'office', floor: 3, color: '#6bd0ff', types: [] },
  ],
  loc: { name: 'กรุงเทพฯ', lat: 13.7563, lon: 100.5018 },
};
const clone = o => JSON.parse(JSON.stringify(o));
let cfg = store.get('twin.cfg', null) || clone(DEFAULT);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- header ----------
bar('FACTORY//TWIN', 'Digital Twin โรงงาน · เครือข่าย · ห้องพยาบาล · อากาศ',
  `<span id="clock"></span><button class="btn" id="btnSettings" title="ตั้งค่า">⚙</button>`);
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
function tick() {
  const d = new Date();
  $('#clock').innerHTML = `${d.toLocaleTimeString('en-GB')}<small>${DAYS[d.getDay()]} ${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</small>`;
}
tick(); setInterval(tick, 1000);

// ---------- three.js scene ----------
const host = $('#scene');
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.appendChild(renderer.domElement);
const scene = new T.Scene();
scene.fog = new T.Fog(0x01070c, 60, 140);
const cam = new T.PerspectiveCamera(42, 1, 0.1, 500);
const controls = new OrbitControls(cam, renderer.domElement);
controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 10; controls.maxDistance = 110;
scene.add(new T.AmbientLight(0x88ccff, 0.7));
const sun = new T.DirectionalLight(0xffffff, 1.1); sun.position.set(20, 40, 25); scene.add(sun);
const grid = new T.GridHelper(120, 60, 0x0b4b5c, 0x072a35); grid.position.y = -0.02; scene.add(grid);

const W = 26, D = 14, FH = 4, GAP = 0.35;
let world = new T.Group(); scene.add(world);
let zoneObjs = [], floorGroups = [], nodes = [], blinkers = [], links = [];
let explode = 1, explodeTarget = 1, selected = -1;

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
})();

const box = (w, h, d, color, opacity = 1) => new T.Mesh(new T.BoxGeometry(w, h, d),
  new T.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.6, metalness: 0.2 }));
const edges = (w, h, d, color, opacity) => new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)),
  new T.LineBasicMaterial({ color, transparent: true, opacity }));

function props(g, kind, w, d, color) {
  const col = new T.Color(color);
  const dark = col.clone().multiplyScalar(0.35);
  if (kind === 'line') {
    const belt = box(w * 0.8, 0.35, 1.1, 0x1a2a33); belt.position.set(0, 0.45, 0); g.add(belt);
    const n = Math.max(2, Math.round(w / 3));
    for (let i = 0; i < n; i++) {
      const m = box(1.2, 1.4, 1.6, dark); m.position.set(-w * 0.35 + i * (w * 0.7 / (n - 1)), 0.85, -2.6); g.add(m);
      const led = new T.Mesh(new T.SphereGeometry(0.12), new T.MeshBasicMaterial({ color })); led.position.set(m.position.x, 1.7, -2.6); g.add(led); blinkers.push(led);
    }
  } else if (kind === 'warehouse') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < Math.max(1, Math.floor(w / 2.4)); i++) {
      const rack = box(1.8, 2.2, 0.9, dark); rack.position.set(-w / 2 + 1.4 + i * 2.4, 1.15, -3.5 + r * 3.2); g.add(rack);
    }
  } else if (kind === 'server') {
    for (let i = 0; i < Math.max(2, Math.floor(w / 1.5)); i++) {
      const rack = box(0.9, 2.4, 1.2, 0x0a1820); rack.position.set(-w / 2 + 1.1 + i * 1.4, 1.25, -3.6); g.add(rack);
      for (let k = 0; k < 4; k++) {
        const led = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.02), new T.MeshBasicMaterial({ color: k % 2 ? 0x3dff9a : color }));
        led.position.set(rack.position.x, 0.6 + k * 0.45, -2.99); g.add(led); blinkers.push(led);
      }
    }
  } else if (kind === 'nurse') {
    for (let i = 0; i < 2; i++) { const bed = box(1.1, 0.5, 2.2, 0xd9f6ff, 0.8); bed.position.set(-w / 2 + 1.5 + i * 1.8, 0.4, -3); g.add(bed); }
    const crossM = new T.MeshBasicMaterial({ color: 0xff4d6d });
    const a = new T.Mesh(new T.BoxGeometry(1.2, 0.35, 0.1), crossM), b = new T.Mesh(new T.BoxGeometry(0.35, 1.2, 0.1), crossM);
    a.position.set(w / 2 - 1.6, 2.4, -d / 2 + 0.2); b.position.copy(a.position); g.add(a, b); blinkers.push(a, b);
  } else if (kind === 'office') {
    for (let i = 0; i < Math.max(1, Math.floor(w / 2.6)); i++) for (let r = 0; r < 2; r++) {
      const desk = box(1.6, 0.75, 0.9, dark); desk.position.set(-w / 2 + 1.5 + i * 2.6, 0.45, -3.4 + r * 2.4); g.add(desk);
      const mon = new T.Mesh(new T.BoxGeometry(0.7, 0.45, 0.05), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
      mon.position.set(desk.position.x, 1.1, desk.position.z - 0.2); g.add(mon);
    }
  }
}

function build() {
  scene.remove(world); world = new T.Group(); scene.add(world);
  zoneObjs = []; floorGroups = []; blinkers = []; nodes = []; links = [];
  $('#labels').innerHTML = '';
  const floors = Math.max(1, ...cfg.zones.map(z => z.floor));
  for (let f = 1; f <= floors; f++) {
    const fg = new T.Group(); fg.userData.base = (f - 1) * FH; fg.userData.f = f; world.add(fg); floorGroups.push(fg);
    const slab = box(W + 1, 0.25, D + 1, 0x06202b, 0.92); slab.position.y = -0.13; fg.add(slab);
    const se = edges(W + 1, 0.25, D + 1, 0x3ce7ff, 0.35); se.position.y = -0.13; fg.add(se);
    const zs = cfg.zones.map((z, i) => ({ z, i })).filter(o => o.z.floor === f);
    const n = Math.max(1, zs.length), zw = (W - GAP * (n + 1)) / n, zd = D - GAP * 2;
    zs.forEach(({ z, i }, k) => {
      const g = new T.Group(); g.position.x = -W / 2 + GAP + zw / 2 + k * (zw + GAP); fg.add(g);
      const plate = box(zw, 0.06, zd, z.color, 0.22); plate.position.y = 0.03; g.add(plate);
      const ed = edges(zw, FH - 0.35, zd, z.color, 0.45); ed.position.y = (FH - 0.35) / 2; g.add(ed);
      const pick = new T.Mesh(new T.BoxGeometry(zw, FH - 0.35, zd), new T.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.035, depthWrite: false }));
      pick.position.y = (FH - 0.35) / 2; pick.userData.zone = i; g.add(pick);
      props(g, z.kind, zw, zd, z.color);
      const label = document.createElement('div');
      label.className = 'zl'; label.style.setProperty('--zc', z.color);
      label.onclick = () => select(i);
      $('#labels').appendChild(label);
      zoneObjs[i] = { g, ed, pick, plate, label, w: zw, d: zd, floor: f };
    });
  }
  placeNodes();
  fitCamera();
}

function placeNodes() {
  for (const n of nodes) n.parent?.remove(n);
  for (const l of links) l.parent?.remove(l);
  nodes = []; links = [];
  world.updateMatrixWorld(true);
  const assign = zoneHosts();
  const serverIdx = cfg.zones.findIndex(z => z.kind === 'server');
  assign.forEach((hosts, i) => {
    const zo = zoneObjs[i]; if (!zo) return;
    const show = hosts.slice(0, 80);
    const cols = Math.max(1, Math.ceil(Math.sqrt(show.length * zo.w / zo.d)));
    const rows = Math.ceil(show.length / cols) || 1;
    show.forEach((h, k) => {
      const t = TYPES[h.type] || TYPES.unknown;
      const isNew = h.is_new && !acked.has(key(h));
      const c = new T.Color(isNew ? '#ff4d6d' : t.c);
      const m = new T.Mesh(new T.SphereGeometry(0.17, 12, 10), new T.MeshBasicMaterial({ color: c }));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(isNew ? 1.6 : 0.9); m.add(sp);
      const cx = (k % cols) - (cols - 1) / 2, cz = Math.floor(k / cols) - (rows - 1) / 2;
      m.position.set(cx * Math.min(1.1, (zo.w - 1) / cols), 2.3 + (k % 3) * 0.12, 1.2 + cz * Math.min(1.1, (zo.d - 4) / rows));
      m.userData = { host: h, isNew, phase: Math.random() * 6, sp };
      zo.g.add(m); nodes.push(m);
      const stem = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, -2.2, 0)]),
        new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.18 }));
      m.add(stem);
    });
    // backbone link zone → server room
    if (serverIdx >= 0 && i !== serverIdx && hosts.length && zoneObjs[serverIdx]) {
      const a = new T.Vector3(), b = new T.Vector3();
      zo.g.getWorldPosition(a); zoneObjs[serverIdx].g.getWorldPosition(b);
      const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 3.4, -D / 2 + 0.6), new T.Vector3(0, 3.4, -D / 2 + 0.6).add(b.sub(a))]),
        new T.LineDashedMaterial({ color: 0x3ce7ff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.5 }));
      line.computeLineDistances(); line.userData.from = i; zo.g.add(line); links.push(line);
    }
  });
}

function fitCamera() {
  const floors = floorGroups.length;
  const r = host.clientWidth / Math.max(1, host.clientHeight);
  const dist = r < 0.8 ? 66 : r < 1.3 ? 50 : 40, cy = floors * FH * 0.85;
  controls.target.set(0, cy, 0);
  cam.position.set(dist * 0.62, cy + dist * 0.45, dist * 0.78);
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

// picking
const ray = new T.Raycaster(), ptr = new T.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const rc = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  ray.setFromCamera(ptr, cam);
  const hit = ray.intersectObjects(zoneObjs.filter(Boolean).map(z => z.pick))[0];
  if (hit) select(hit.object.userData.zone);
});

const tmp = new T.Vector3();
const clockT = new T.Clock();
function frame() {
  requestAnimationFrame(frame);
  const t = clockT.getElapsedTime();
  explode += (explodeTarget - explode) * 0.08;
  floorGroups.forEach(fg => { fg.position.y = fg.userData.base * (1 + explode * 0.9); });
  if (Math.abs(explodeTarget - explode) > 0.001) placeLinks();
  for (const n of nodes) {
    const u = n.userData;
    const s = u.isNew ? 1 + 0.45 * Math.abs(Math.sin(t * 4 + u.phase)) : 1 + 0.12 * Math.sin(t * 2 + u.phase);
    n.scale.setScalar(s);
  }
  blinkers.forEach((b, i) => { b.visible = Math.sin(t * (2 + (i % 5)) + i) > -0.6; });
  links.forEach(l => { l.material.opacity = 0.3 + 0.25 * Math.sin(t * 3 + l.userData.from); });
  controls.update();
  renderer.render(scene, cam);
  // labels
  const w = host.clientWidth, h = host.clientHeight;
  zoneObjs.forEach((zo, i) => {
    if (!zo) return;
    zo.g.getWorldPosition(tmp); tmp.y += FH - 0.2;
    tmp.project(cam);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    zo.label.style.display = vis ? '' : 'none';
    if (vis) zo.label.style.left = ((tmp.x + 1) / 2 * w) + 'px', zo.label.style.top = ((1 - tmp.y) / 2 * h) + 'px';
    const sel = i === selected;
    zo.ed.material.opacity = sel ? 1 : 0.45;
    zo.pick.material.opacity = sel ? 0.12 + 0.05 * Math.sin(t * 4) : 0.035;
  });
}
function placeLinks() {
  // links depend on floor offsets — rebuild cheaply while exploding
  const serverIdx = cfg.zones.findIndex(z => z.kind === 'server');
  if (serverIdx < 0 || !zoneObjs[serverIdx]) return;
  const b = new T.Vector3(); zoneObjs[serverIdx].g.getWorldPosition(b);
  for (const l of links) {
    const a = new T.Vector3(); zoneObjs[l.userData.from].g.getWorldPosition(a);
    const p0 = new T.Vector3(0, 3.4, -D / 2 + 0.6);
    l.geometry.setFromPoints([p0, p0.clone().add(b.clone().sub(a))]);
    l.computeLineDistances();
  }
}

// ---------- data ----------
const live = onLan();
let net = null, netNote = '', clinic = null, clinicNote = '', wx = null, aq = null;
const acked = new Set(store.get('twin.ack', []));
const toasted = new Set();
const key = h => h.mac || h.ip;

function demoNet() {
  const mk = (n, type, vendor, extra = {}) => Array.from({ length: n }, (_, i) => ({ type, vendor, ip: '', mac: '', rtt: 1 + (i * 7) % 20, name: null, nick: null, is_new: false, ...extra }));
  const hosts = [
    ...mk(1, 'router', 'Cisco Systems'), ...mk(3, 'network', 'TP-Link'), ...mk(1, 'self', 'Dell Inc.'), ...mk(2, 'vm', 'VMware'),
    ...mk(12, 'pc', 'Lenovo'), ...mk(3, 'printer', 'Ricoh'), ...mk(7, 'phone', null), ...mk(6, 'camera', 'Hikvision'),
    ...mk(4, 'iot', 'Espressif'), ...mk(3, 'unknown', null),
  ];
  hosts.forEach((h, i) => { h.ip = '192.168.1.' + (10 + i); h.mac = 'de:mo:00:00:' + String(i).padStart(2, '0'); });
  hosts[hosts.length - 5].is_new = true; hosts[hosts.length - 5].vendor = 'Espressif (ใหม่)';
  hosts[24].is_new = true; hosts[24].name = 'unknown-phone';
  return { hosts, offline: mk(2, 'pc', 'Lenovo'), subnet: '192.168.1.0/24', gateway: '192.168.1.1', self: '192.168.1.13', time: Date.now() / 1000, demo: true };
}
const demoClinic = () => ({ clinic: 'ห้องพยาบาล (ตัวอย่าง)', visits_today: 7, in_room: 1, injury_today: 1, visits_month: 96, pending_notify: 0, drug_alerts: [{ name: 'Paracetamol 500 mg', available: 40, unit: 'เม็ด', flags: ['low'] }], demo: true });

async function loadData() {
  if (live) {
    try {
      const r = await fetch('../../net-radar/api/scan.php?a=cached', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!Array.isArray(j.hosts)) throw new Error('no hosts');
      net = j; netNote = j.hosts.length ? '' : 'ยังไม่มีผลสแกน — เปิด NET//RADAR แล้วกดสแกนก่อน';
    } catch (e) { net = demoNet(); netNote = 'ต่อ NET//RADAR ไม่ได้ — แสดงข้อมูลจำลอง'; }
    try {
      const r = await fetch('../../clinic/api/summary.php', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || r.status);
      clinic = j; clinicNote = '';
    } catch (e) { clinic = null; clinicNote = 'ระบบห้องพยาบาลไม่พร้อม'; }
  } else {
    net = demoNet(); clinic = demoClinic();
  }
  const demo = !live || net.demo;
  $('#demo').hidden = !demo && !netNote;
  $('#demo').textContent = !live ? '⚠ โหมดสาธิต — ข้อมูลเครือข่าย/ห้องพยาบาลเป็นข้อมูลจำลอง · เปิดจาก XAMPP (http://localhost/ksd/lab/twin/) เพื่อดูข้อมูลจริง' : '⚠ ' + netNote;
  const fresh = net.hosts.filter(h => h.is_new && !acked.has(key(h)) && !toasted.has(key(h)));
  fresh.forEach(h => toasted.add(key(h)));
  if (fresh.length) toast(`🚨 พบอุปกรณ์ใหม่ ${fresh.length} เครื่อง: ${fresh.slice(0, 3).map(h => h.nick || h.name || h.vendor || h.ip).join(', ')}${fresh.length > 3 ? ' …' : ''}`, 6000);
  placeNodes(); renderKpis(); renderSide();
}

async function loadWeather() {
  const { lat, lon } = cfg.loc;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto`);
    wx = (await r.json()).current;
  } catch { wx = null; }
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi&timezone=auto`);
    aq = (await r.json()).current;
  } catch { aq = null; }
  renderKpis();
}

const WMO = c => c === 0 ? '☀️ ท้องฟ้าแจ่มใส' : c <= 2 ? '🌤 มีเมฆบางส่วน' : c === 3 ? '☁️ เมฆมาก' : c <= 48 ? '🌫 หมอก' : c <= 57 ? '🌦 ฝนปรอย'
  : c <= 67 ? '🌧 ฝนตก' : c <= 77 ? '❄️ หิมะ' : c <= 82 ? '🌧 ฝนซู่' : c <= 99 ? '⛈ พายุฝนฟ้าคะนอง' : '—';
// Thai PCD PM2.5 bands (µg/m³)
const pmLevel = v => v <= 15 ? ['ดีมาก', '#3ce7ff'] : v <= 25 ? ['ดี', '#3dff9a'] : v <= 37.5 ? ['ปานกลาง', '#ffe66b']
  : v <= 75 ? ['เริ่มมีผลต่อสุขภาพ', '#ff9f43'] : ['มีผลต่อสุขภาพ', '#ff4d6d'];

function zoneHosts() {
  const typeZone = {};
  cfg.zones.forEach((z, i) => z.types.forEach(t => { if (!(t in typeZone)) typeZone[t] = i; }));
  const out = cfg.zones.map(() => []);
  unassigned = [];
  for (const h of net?.hosts || []) {
    const i = typeZone[h.type] ?? typeZone.unknown;
    (i === undefined ? unassigned : out[i]).push(h);
  }
  return out;
}
let unassigned = [];

function renderKpis() {
  if (!net) return;
  const hosts = net.hosts, fresh = hosts.filter(h => h.is_new && !acked.has(key(h)));
  const byType = {}; hosts.forEach(h => byType[h.type] = (byType[h.type] || 0) + 1);
  const dots = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([t, n]) => `<span style="--d:${(TYPES[t] || TYPES.unknown).c}">${(TYPES[t] || TYPES.unknown).icon}${n}</span>`).join('');
  const nurseIdx = cfg.zones.findIndex(z => z.kind === 'nurse');
  let html = `<div class="kpi click" data-go="overview"><div class="k"><span>อุปกรณ์ออนไลน์</span><span>${net.demo ? 'DEMO' : 'LAN'}</span></div>
    <div class="v">${hosts.length}<small>ออฟไลน์ ${(net.offline || []).length}</small></div><div class="dots">${dots}</div></div>
    <div class="kpi click${fresh.length ? ' alert' : ''}" data-go="overview"><div class="k"><span>อุปกรณ์ใหม่ (ยังไม่รับทราบ)</span></div>
    <div class="v">${fresh.length}</div><div class="s">${fresh.length ? esc(fresh.slice(0, 2).map(h => h.nick || h.name || h.vendor || h.ip).join(', ')) : 'ไม่มีอุปกรณ์แปลกปลอม'}</div></div>`;
  html += clinic ? `<div class="kpi click" data-go="${nurseIdx}"><div class="k"><span>${esc(clinic.clinic || 'ห้องพยาบาล')}</span><span>วันนี้</span></div>
    <div class="v">${clinic.visits_today}<small>ครั้ง</small></div><div class="s">อยู่ในห้อง ${clinic.in_room} · บาดเจ็บจากงาน ${clinic.injury_today}${clinic.drug_alerts?.length ? ` · <span style="color:var(--warn)">ยาต้องดู ${clinic.drug_alerts.length}</span>` : ''}</div></div>`
    : `<div class="kpi"><div class="k"><span>ห้องพยาบาล</span></div><div class="v">—</div><div class="s">${esc(clinicNote)}</div></div>`;
  html += wx ? `<div class="kpi"><div class="k"><span>อากาศ · ${esc(cfg.loc.name)}</span></div><div class="v">${wx.temperature_2m.toFixed(1)}<small>°C</small></div>
    <div class="s">${WMO(wx.weather_code)}<br>รู้สึก ${Math.round(wx.apparent_temperature)}° · ชื้น ${wx.relative_humidity_2m}% · ลม ${Math.round(wx.wind_speed_10m)} กม./ชม.</div></div>`
    : `<div class="kpi"><div class="k"><span>อากาศ</span></div><div class="v">—</div><div class="s">กำลังโหลด / ออฟไลน์</div></div>`;
  if (aq && aq.pm2_5 != null) {
    const [lv, col] = pmLevel(aq.pm2_5);
    html += `<div class="kpi" style="border-color:${col}55"><div class="k"><span>PM2.5</span><span>US AQI ${aq.us_aqi ?? '—'}</span></div>
      <div class="v" style="color:${col};text-shadow:0 0 10px ${col}">${aq.pm2_5.toFixed(0)}<small>µg/m³</small></div><div class="s" style="color:${col}">${lv}</div></div>`;
  } else html += `<div class="kpi"><div class="k"><span>PM2.5</span></div><div class="v">—</div><div class="s">กำลังโหลด</div></div>`;
  $('#kpis').innerHTML = html;
  $('#kpis').querySelectorAll('[data-go]').forEach(el => el.onclick = () => el.dataset.go === 'overview' ? select(-1, true) : select(+el.dataset.go));
  // zone labels
  const assign = zoneHosts();
  cfg.zones.forEach((z, i) => {
    const zo = zoneObjs[i]; if (!zo) return;
    const n = assign[i].length, nw = assign[i].filter(h => h.is_new && !acked.has(key(h))).length;
    zo.label.className = 'zl' + (nw ? ' new' : '') + (i === selected ? ' sel' : '');
    zo.label.innerHTML = `${KINDS[z.kind]?.icon || ''} <b>${esc(z.name)}</b><i>${z.kind === 'nurse' && clinic ? '⛑' + clinic.in_room : n}</i>${nw ? ' 🚨' : ''}`;
  });
}

const devRow = h => {
  const t = TYPES[h.type] || TYPES.unknown, nw = h.is_new && !acked.has(key(h));
  return `<div class="dev${nw ? ' isnew' : ''}"><span class="ic">${t.icon}</span><span class="n">${esc(h.nick || h.name || h.vendor || t.th)}${nw ? '<span class="tag-new">NEW</span>' : ''}<small>${esc(t.th)}${h.rtt != null ? ` · ${h.rtt} ms` : ''}</small></span><span class="ip">${esc(h.ip)}</span></div>`;
};

function renderSide() {
  if (!net) return;
  const side = $('#side'), body = $('#sideBody');
  const assign = zoneHosts();
  if (selected < 0) {
    $('#sideTitle').textContent = 'ภาพรวมโรงงาน';
    const fresh = net.hosts.filter(h => h.is_new && !acked.has(key(h)));
    const scanAt = net.time ? new Date(net.time * 1000).toLocaleString('th-TH') : '—';
    body.innerHTML = `<div class="stat"><div><b>${net.hosts.length}</b><span>ออนไลน์</span></div><div><b style="color:${fresh.length ? 'var(--bad)' : ''}">${fresh.length}</b><span>อุปกรณ์ใหม่</span></div><div><b>${(net.offline || []).length}</b><span>ออฟไลน์</span></div></div>
      <p class="note">แหล่งข้อมูล: ${net.demo ? 'ข้อมูลจำลอง' : 'NET//RADAR ' + esc(net.subnet || '')} · สแกนล่าสุด ${scanAt}${netNote ? '<br>' + esc(netNote) : ''}</p>
      ${fresh.length ? `<h4>🚨 อุปกรณ์ใหม่ที่ยังไม่รับทราบ</h4>${fresh.map(devRow).join('')}<p><button class="btn" id="ackAll">✓ รับทราบทั้งหมด</button></p>` : ''}
      <h4>โซน</h4>${cfg.zones.map((z, i) => `<div class="zrow" data-z="${i}"><span>${KINDS[z.kind]?.icon || ''} ${esc(z.name)} <small class="note">ชั้น ${z.floor}</small></span><i>${z.kind === 'nurse' ? (clinic ? 'ในห้อง ' + clinic.in_room : '—') : assign[i].length + ' เครื่อง'}</i></div>`).join('')}
      ${unassigned.length ? `<h4>ยังไม่ได้จัดโซน (${unassigned.length})</h4><p class="note">ไปที่ ⚙ ตั้งค่า แล้วเลือกชนิดอุปกรณ์ให้โซน</p>${unassigned.map(devRow).join('')}` : ''}
      <p class="note" style="margin-top:14px">คลิก/แตะห้องในโมเดล 3D เพื่อดูรายละเอียด · ลากเพื่อหมุน · หนีบ/สกอลล์เพื่อซูม</p>`;
    body.querySelectorAll('[data-z]').forEach(el => el.onclick = () => select(+el.dataset.z));
    $('#ackAll')?.addEventListener('click', () => {
      fresh.forEach(h => acked.add(key(h))); store.set('twin.ack', [...acked]);
      toast('รับทราบอุปกรณ์ใหม่แล้ว'); placeNodes(); renderKpis(); renderSide();
    });
    return;
  }
  const z = cfg.zones[selected], hs = assign[selected] || [];
  $('#sideTitle').textContent = `${KINDS[z.kind]?.icon || ''} ${z.name}`;
  const byType = {}; hs.forEach(h => byType[h.type] = (byType[h.type] || 0) + 1);
  let html = `<p class="note">ชั้น ${z.floor} · ${KINDS[z.kind]?.th || ''} · <a href="#" id="back">◂ ภาพรวม</a></p>`;
  if (z.kind === 'nurse') {
    html += clinic ? `<h4>ห้องพยาบาลวันนี้ ${clinic.demo ? '(ตัวอย่าง)' : ''}</h4>
      <div class="stat"><div><b>${clinic.visits_today}</b><span>มารับบริการ</span></div><div><b>${clinic.in_room}</b><span>อยู่ในห้อง</span></div><div><b style="color:${clinic.injury_today ? 'var(--bad)' : ''}">${clinic.injury_today}</b><span>บาดเจ็บจากงาน</span></div></div>
      <div class="stat" style="margin-top:6px"><div><b>${clinic.visits_month}</b><span>เดือนนี้</span></div><div><b>${clinic.pending_notify}</b><span>แจ้งเตือนค้าง</span></div><div><b>${clinic.drug_alerts?.length || 0}</b><span>ยาต้องดู</span></div></div>
      ${clinic.drug_alerts?.length ? `<h4>ยาใกล้หมด / ใกล้หมดอายุ</h4>${clinic.drug_alerts.map(d => `<div class="alert-row">💊 ${esc(d.name)} — คงเหลือ ${d.available} ${esc(d.unit || '')}</div>`).join('')}` : ''}
      <p class="note">แสดงเฉพาะตัวเลขรวม ไม่มีข้อมูลส่วนบุคคล${live && !clinic.demo ? ' · <a href="../../clinic/">เปิดระบบห้องพยาบาล</a>' : ''}</p>`
      : `<p class="note">${esc(clinicNote || 'ไม่มีข้อมูล')}</p>`;
  }
  if (z.kind === 'server') html += `<h4>เครือข่าย</h4><p class="note mono">subnet ${esc(net.subnet || '—')}<br>gateway ${esc(net.gateway || '—')}<br>XAMPP ${esc(net.self || '—')}</p>`;
  html += `<h4>อุปกรณ์ในโซน (${hs.length})</h4>`;
  html += Object.keys(byType).length ? `<div class="dots" style="margin-bottom:6px">${Object.entries(byType).map(([t, n]) => `<span style="--d:${(TYPES[t] || TYPES.unknown).c}">${(TYPES[t] || TYPES.unknown).th} ${n}</span>`).join('')}</div>` : '';
  html += hs.length ? hs.sort((a, b) => (b.is_new && !acked.has(key(b))) - (a.is_new && !acked.has(key(a)))).map(devRow).join('') : '<p class="note">ไม่มีอุปกรณ์ — กำหนดชนิดอุปกรณ์ของโซนได้ใน ⚙ ตั้งค่า</p>';
  if (live && !net.demo) html += `<p style="margin-top:12px"><a class="btn" href="../../net-radar/">เปิด NET//RADAR ▸</a></p>`;
  body.innerHTML = html;
  $('#back').onclick = e => { e.preventDefault(); select(-1, true); };
}

function select(i, open = true) {
  selected = i;
  document.body.classList.toggle('sheet', open);
  $('#side').classList.toggle('hide', !open);
  if (i >= 0 && zoneObjs[i]) {
    const p = new T.Vector3(); zoneObjs[i].g.getWorldPosition(p);
    controls.target.set(p.x * 0.6, p.y + FH / 2, 0);
    controls.autoRotate = false; $('#btnRotate').classList.remove('on');
  }
  renderSide(); renderKpis();
}
$('#sideClose').onclick = () => { document.body.classList.remove('sheet'); $('#side').classList.add('hide'); selected = -1; renderKpis(); };

// tools
$('#btnRotate').classList.add('on'); $('#btnExplode').classList.add('on');
$('#btnRotate').onclick = e => { controls.autoRotate = !controls.autoRotate; e.currentTarget.classList.toggle('on', controls.autoRotate); };
$('#btnExplode').onclick = e => { explodeTarget = explodeTarget ? 0 : 1; e.currentTarget.classList.toggle('on', !!explodeTarget); };
$('#btnRefresh').onclick = () => { loadData(); loadWeather(); toast('กำลังโหลดข้อมูลใหม่…', 1500); };

// ---------- settings ----------
const dlg = $('#settings');
let draft;
function renderZoneEd() {
  $('#zoneList').innerHTML = draft.zones.map((z, i) => `<div class="zone-ed" style="--zc:${z.color}" data-i="${i}">
    <div class="top"><input type="text" data-f="name" value="${esc(z.name)}" maxlength="30">
      <select data-f="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === z.kind ? ' selected' : ''}>${v.icon} ${v.th}</option>`).join('')}</select>
      <select data-f="floor">${[1, 2, 3, 4].map(f => `<option value="${f}"${f === z.floor ? ' selected' : ''}>ชั้น ${f}</option>`).join('')}</select>
      <input type="color" data-f="color" value="${z.color}"><button type="button" class="btn" data-del title="ลบโซน">🗑</button></div>
    <div class="chips">${Object.entries(TYPES).map(([t, v]) => `<label><input type="checkbox" data-t="${t}"${z.types.includes(t) ? ' checked' : ''}>${v.icon} ${v.th}</label>`).join('')}</div></div>`).join('');
  $('#zoneList').querySelectorAll('.zone-ed').forEach(el => {
    const z = draft.zones[+el.dataset.i];
    el.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
      z[inp.dataset.f] = inp.dataset.f === 'floor' ? +inp.value : inp.value;
      if (inp.dataset.f === 'color') el.style.setProperty('--zc', inp.value);
    });
    el.querySelectorAll('[data-t]').forEach(cb => cb.onchange = () => {
      z.types = z.types.filter(t => t !== cb.dataset.t); if (cb.checked) z.types.push(cb.dataset.t);
    });
    el.querySelector('[data-del]').onclick = () => {
      if (draft.zones.length <= 1) return toast('ต้องมีอย่างน้อย 1 โซน');
      draft.zones.splice(+el.dataset.i, 1); renderZoneEd();
    };
  });
}
$('#btnSettings').onclick = () => {
  draft = clone(cfg); renderZoneEd();
  $('#locName').value = draft.loc.name; $('#locLat').value = draft.loc.lat; $('#locLon').value = draft.loc.lon; $('#locResults').innerHTML = '';
  dlg.showModal();
};
$('#addZone').onclick = () => { draft.zones.push({ name: 'โซนใหม่', kind: 'other', floor: 1, color: '#3ce7ff', types: [] }); renderZoneEd(); };
$('#locFind').onclick = async () => {
  const q = $('#locQ').value.trim(); if (!q) return;
  try {
    const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=th`)).json();
    $('#locResults').innerHTML = (r.results || []).map((p, i) => `<button type="button" class="btn" data-i="${i}">${esc(p.name)}${p.admin1 ? ', ' + esc(p.admin1) : ''} ${esc(p.country_code || '')}</button>`).join('') || '<span class="note">ไม่พบ</span>';
    $('#locResults').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const p = r.results[+b.dataset.i];
      $('#locName').value = p.name; $('#locLat').value = p.latitude.toFixed(4); $('#locLon').value = p.longitude.toFixed(4);
    });
  } catch { $('#locResults').innerHTML = '<span class="note">ค้นหาไม่ได้ (ออฟไลน์?)</span>'; }
};
$('#resetCfg').onclick = () => { draft = clone(DEFAULT); renderZoneEd(); $('#locName').value = draft.loc.name; $('#locLat').value = draft.loc.lat; $('#locLon').value = draft.loc.lon; };
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok') return;
  draft.zones.forEach(z => { z.name = z.name.trim() || 'โซน'; });
  const lat = parseFloat($('#locLat').value), lon = parseFloat($('#locLon').value);
  draft.loc = { name: $('#locName').value.trim() || 'ตำแหน่ง', lat: isFinite(lat) ? lat : DEFAULT.loc.lat, lon: isFinite(lon) ? lon : DEFAULT.loc.lon };
  const locChanged = draft.loc.lat !== cfg.loc.lat || draft.loc.lon !== cfg.loc.lon || draft.loc.name !== cfg.loc.name;
  cfg = draft; store.set('twin.cfg', cfg);
  selected = -1; build(); renderKpis(); renderSide();
  if (locChanged) { wx = aq = null; renderKpis(); loadWeather(); }
  toast('บันทึกการตั้งค่าแล้ว');
});

// ---------- start ----------
resize(); build(); frame();
if (isPhone()) { $('#side').classList.add('hide'); } else select(-1, true);
loadData(); loadWeather();
setInterval(loadData, 30000);
setInterval(loadWeather, 10 * 60000);
window.__twin = { get net() { return net; }, get clinic() { return clinic; }, get wx() { return wx; }, get aq() { return aq; }, select };
