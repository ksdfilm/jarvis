// ศูนย์บัญชาการโลก — ลูกโลก 3D: เครื่องบิน (OpenSky) · ดาวเทียม (CelesTrak + satellite.js) · แผ่นดินไหว (USGS) · ไฟป่า/พายุ (NASA EONET)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SAT from 'satellite.js';
import { bar, store, toast, $, proxyURL, viaWorker, isPhone } from '../common/lab.js';

const RAD = Math.PI / 180, RE = 6371;
const PHONE = isPhone();
const CAP = { flights: PHONE ? 2500 : 12000, starlink: PHONE ? 1200 : 10000 };
const TEX = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/';
bar('GOD VIEW', 'ศูนย์บัญชาการโลก · ข้อมูลสดทั้งโลก', '');

// ---------- คณิตศาสตร์ ----------
function v3(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * RAD, th = (lon + 180) * RAD;
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
function subsolar(d) {
  const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const g = 2 * Math.PI / 365 * (N - 1 + (d.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  return { lat: decl / RAD, lon: (((-(utcMin + eot - 720) / 4) + 540) % 360 + 360) % 360 - 180 };
}
// ECF (กม.) → พิกัดฉาก: x→ลองจิจูด 0, y→90E, z→เหนือ
const ecf2w = (p, out = new THREE.Vector3()) => out.set(p.x / RE, p.z / RE, -p.y / RE);
const fmt = (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// ---------- ฉาก ----------
const stage = $('#stage');
const ren = new THREE.WebGLRenderer({ antialias: !PHONE, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(PHONE ? 1.75 : 2, devicePixelRatio || 1));
ren.outputColorSpace = THREE.LinearSRGBColorSpace;
stage.prepend(ren.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
cam.position.copy(v3(18, 101, PHONE ? 3.6 : 3.0));
const ctrl = new OrbitControls(cam, ren.domElement);
ctrl.enablePan = false; ctrl.enableDamping = true; ctrl.dampingFactor = 0.08; ctrl.rotateSpeed = 0.45;
ctrl.minDistance = 1.15; ctrl.maxDistance = 14; ctrl.zoomSpeed = 0.8;
ctrl.autoRotateSpeed = 0.4; ctrl.autoRotate = store.get('god.rotate', true);
ctrl.addEventListener('change', () => { const d = cam.position.length(); ctrl.rotateSpeed = 0.45 * Math.min(1, (d - 1) / 2); });

// ลูกโลก กลางวัน/กลางคืนตามดวงอาทิตย์จริง
const sunDir = new THREE.Vector3(1, 0, 0);
const globeMat = new THREE.ShaderMaterial({
  uniforms: { day: { value: null }, night: { value: null }, sunDir: { value: sunDir } },
  vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;
    void main(){
      float d = dot(normalize(vN), sunDir);
      float k = smoothstep(-0.1, 0.12, d);
      vec3 dayC = texture2D(day, vUv).rgb * (0.35 + 0.8 * max(d, 0.0));
      vec3 nightC = texture2D(night, vUv).rgb * vec3(1.15, 1.05, 0.95) * smoothstep(0.0, 0.5, dot(texture2D(night, vUv).rgb, vec3(0.6))) * 1.4 + vec3(0.0, 0.012, 0.022);
      vec3 col = mix(nightC, dayC, k);
      col += vec3(1.0, 0.5, 0.2) * 0.18 * exp(-pow(d * 9.0, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const globe = new THREE.Mesh(new THREE.SphereGeometry(1, PHONE ? 72 : 128, PHONE ? 48 : 96), globeMat);
scene.add(globe);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.7 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(0.24, 0.8, 1.0, 1.0) * i; }',
})));
// กริดละติจูด/ลองจิจูด
{
  const pts = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 3) pts.push(v3(lat, lon, 1.001), v3(lat, lon + 3, 1.001));
  for (let lon = -180; lon < 180; lon += 30) for (let lat = -87; lat < 87; lat += 3) pts.push(v3(lat, lon, 1.001), v3(lat + 3, lon, 1.001));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3ce7ff, transparent: true, opacity: 0.07, depthWrite: false })));
}
// ดาวพื้นหลัง
{
  const n = 1500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 40); p.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fdfff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.6 })));
}
const BKK = v3(13.75, 100.5, 1.002);
const dot = (() => { // ภาพจุดกลมสำหรับ Points
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const pointsMat = (size, opacity = 1) => new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, opacity, depthWrite: false, alphaTest: 0.05 });

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- สถานะชั้นข้อมูล ----------
const show = Object.assign({ flights: true, stations: true, visual: true, 'gps-ops': true, starlink: false, quakes: true, events: true }, store.get('god.show', {}));
const counts = { flights: 0, stations: 0, visual: 0, 'gps-ops': 0, starlink: 0, quakes: 0, events: 0 };
const msgs = {};
let selected = null; // { kind, ref }

// ---------- เครื่องบิน ----------
const flightGeo = new THREE.BufferGeometry();
flightGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0.62, -0.8, 0, 0, -0.4, 0, 0, 1, 0, 0, -0.4, 0, -0.62, -0.8, 0], 3));
const flightMesh = new THREE.InstancedMesh(flightGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 }), CAP.flights);
flightMesh.count = 0; flightMesh.frustumCulled = false;
flightMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP.flights * 3), 3);
scene.add(flightMesh);
let flights = []; // { id, cs, country, lat, lon, alt, gs, trk, vr, sq, ground, t }
let flightAt = 0, flightSrc = '', openskyBlockedUntil = 0;
const altCol = (m, c = new THREE.Color()) => {
  const t = Math.min(1, Math.max(0, (m || 0) / 12500));
  return c.setHSL(0.08 + t * 0.62, 1, 0.55 + 0.1 * t);
};
const proxy = proxyURL; // Cloudflare Worker or the XAMPP proxy
async function loadFlights() {
  if (!show.flights || document.hidden) return;
  if (!proxyURL('x')) { msgs.flights = 'เครื่องบินต้องมีตัวกลาง: ตั้ง Cloudflare Worker (ฟรี) ในหน้า "ใช้จากนอกบริษัท" หรือเปิดผ่าน XAMPP/Tailscale — ชั้นอื่นใช้งานได้ปกติ'; renderLayers(); return; }
  const now = Date.now();
  try {
    if (viaWorker()) throw new Error('opensky refuses Cloudflare'); // นอกบริษัท: OpenSky ไม่ตอบ Cloudflare → ไปใช้ข้อมูลรอบจุดกลางจอ
    if (now > openskyBlockedUntil) {
      const r = await fetch(proxy('https://opensky-network.org/api/states/all'), { cache: 'no-store' });
      if (!r.ok) throw new Error('opensky ' + r.status);
      const j = await r.json();
      flights = (j.states || []).filter(s => s[5] != null && s[6] != null).map(s => ({
        id: s[0], cs: (s[1] || '').trim(), country: s[2], lon: s[5], lat: s[6], alt: s[13] ?? s[7] ?? 0, ground: s[8], gs: s[9], trk: s[10] || 0, vr: s[11], sq: s[14], t: (s[3] || j.time) * 1000,
      }));
      flightSrc = 'OpenSky (ทั้งโลก)';
      msgs.flights = '';
    } else throw new Error('opensky backoff');
  } catch (e) {
    // OpenSky จำกัดโควตาผู้ใช้ไม่ลงทะเบียน → ใช้ adsb.fi รัศมี 250 nm รอบจุดกลางจอแทน
    const worker = viaWorker();
    if (!worker && now > openskyBlockedUntil) openskyBlockedUntil = now + 10 * 60e3;
    const c = camLatLon();
    // adsb.fi บล็อก Cloudflare → ผ่าน Worker ใช้ adsb.lol (รูปแบบข้อมูลเดียวกัน แต่อยู่ใน key "ac")
    const host = worker ? 'https://api.adsb.lol/v2' : 'https://opendata.adsb.fi/api/v2', name = worker ? 'adsb.lol' : 'adsb.fi';
    try {
      const r = await fetch(proxy(`${host}/lat/${c.lat.toFixed(2)}/lon/${c.lon.toFixed(2)}/dist/250`), { cache: 'no-store' });
      if (!r.ok) throw new Error(name + ' ' + r.status);
      const j = await r.json();
      flights = (j.aircraft || j.ac || []).filter(a => a.lat != null).map(a => ({
        id: a.hex, cs: (a.flight || '').trim(), country: a.r || '', lon: a.lon, lat: a.lat, alt: a.alt_baro === 'ground' ? 0 : (a.alt_geom ?? a.alt_baro ?? 0) * 0.3048, ground: a.alt_baro === 'ground',
        gs: a.gs != null ? a.gs * 0.5144 : null, trk: a.track ?? 0, vr: a.baro_rate != null ? a.baro_rate * 0.00508 : null, sq: a.squawk, t: now - (a.seen_pos || 0) * 1000, type: a.t, desc: a.desc,
      }));
      flightSrc = `${name} (รัศมี 460 กม. รอบจุดกลางจอ)`;
      msgs.flights = worker ? 'นอกบริษัท: แสดงเครื่องบินรอบจุดกลางจอ (หมุนลูกโลกเพื่อดูที่อื่น) — ทั้งโลกดูได้เมื่อเปิดในบริษัท' : 'OpenSky เกินโควตา — ใช้ข้อมูลรอบจุดกลางจอแทน (ลองทั้งโลกใหม่ทุก 10 นาที)';
    } catch (e2) { msgs.flights = 'โหลดเครื่องบินไม่สำเร็จ — จะลองใหม่'; console.warn(e, e2); }
  }
  if (flights.length > CAP.flights) { // มือถือ: เลือกลำที่ใกล้จุดกลางจอก่อน
    const c = v3(camLatLon().lat, camLatLon().lon);
    const tmp = new THREE.Vector3();
    flights.forEach(f => f._d = v3(f.lat, f.lon, 1, tmp).distanceToSquared(c));
    flights.sort((a, b) => a._d - b._d).length = CAP.flights;
  }
  flightAt = Date.now();
  counts.flights = flights.length;
  flightMesh.count = flights.length;
  const col = new THREE.Color();
  flights.forEach((f, i) => flightMesh.setColorAt(i, altCol(f.ground ? 0 : f.alt, col)));
  flightMesh.instanceColor.needsUpdate = true;
  placeFlights();
  renderLayers();
}
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _e = new THREE.Vector3(), _no = new THREE.Vector3(), _h = new THREE.Vector3(), _x = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function flightNow(f, now) { // ประมาณตำแหน่งปัจจุบันด้วยความเร็ว+ทิศ
  if (!f.gs || f.ground) return [f.lat, f.lon];
  const dt = Math.min(120, Math.max(0, (now - f.t) / 1000)), d = f.gs * dt / 6371e3;
  return [f.lat + d * Math.cos(f.trk * RAD) / RAD, f.lon + d * Math.sin(f.trk * RAD) / Math.cos(f.lat * RAD) / RAD];
}
function placeFlights() {
  const now = Date.now(), dist = cam.position.length();
  const s = Math.min(0.012, Math.max(0.0016, (dist - 1) * 0.0042)) * (PHONE ? 1.25 : 1);
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i], [lat, lon] = flightNow(f, now);
    f.pos = v3(lat, lon, 1.003 + Math.max(0, f.alt) / 6371e3 * 4, f.pos || new THREE.Vector3());
    _n.copy(f.pos).normalize();
    _e.crossVectors(_Y, _n).normalize(); _no.crossVectors(_n, _e);
    _h.copy(_no).multiplyScalar(Math.cos(f.trk * RAD)).addScaledVector(_e, Math.sin(f.trk * RAD));
    _x.crossVectors(_h, _n);
    _m.makeBasis(_x, _h, _n).scale(_p.set(s, s, s)).setPosition(f.pos);
    flightMesh.setMatrixAt(i, _m);
  }
  flightMesh.instanceMatrix.needsUpdate = true;
}

// ---------- ดาวเทียม ----------
const GROUPS = {
  stations: { name: 'สถานีอวกาศ (ISS/เทียนกง)', color: 0xffffff, size: 7 },
  visual: { name: 'ดวงสว่างมองเห็นด้วยตา', color: 0xffc845, size: 4 },
  'gps-ops': { name: 'GPS', color: 0x3dff9a, size: 5 },
  starlink: { name: 'Starlink', color: 0xb48cff, size: 2.5 },
};
const sats = {}; // group → { list:[{name,id,rec,pos}], points }
const idb = (() => {
  let p;
  const open = () => p ??= new Promise((res, rej) => { const r = indexedDB.open('lab-godview', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise(res => { const q = fn(db.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); };
  return { get: k => tx('readonly', s => s.get(k)).catch(() => undefined), set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}) };
})();
const isTLE = t => /^1 \d{5}/m.test(t) && /^2 \d{5}/m.test(t);
async function getTLE(group) {
  const key = 'tle.' + group, cached = await idb.get(key);
  if (cached && Date.now() - cached.at < 3 * 3600e3) return cached.text; // CelesTrak บล็อก IP ที่ดึงถี่ → แคช 3 ชม.
  try {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`);
    const t = await r.text();
    if (r.ok && isTLE(t)) { idb.set(key, { at: Date.now(), text: t }); return t; }
    throw new Error(t.slice(0, 80));
  } catch (e) {
    if (cached) return cached.text;
    throw e;
  }
}
async function loadSats(group) {
  if (sats[group]?.list.length || sats[group]?.loading) return;
  sats[group] = { list: [], loading: true };
  msgs[group] = 'กำลังโหลด…'; renderLayers();
  let list = [];
  try {
    const lines = (await getTLE(group)).split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    for (let i = 0; i + 2 < lines.length + 1; i++) {
      if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
        try { list.push({ name: lines[i].trim(), id: lines[i + 1].slice(2, 7).trim(), rec: SAT.twoline2satrec(lines[i + 1], lines[i + 2]), pos: new THREE.Vector3(), ok: false }); } catch {}
        i += 2;
      }
    }
    if (group === 'starlink' && list.length > CAP.starlink) list = list.filter((_, i) => i % Math.ceil(list.length / CAP.starlink) === 0);
    msgs[group] = '';
  } catch (e) {
    console.warn('CelesTrak', group, e);
    if (group === 'stations') { list = []; msgs[group] = 'CelesTrak ไม่ตอบ — แสดง ISS จาก wheretheiss.at'; issFallback(); }
    else msgs[group] = 'CelesTrak ไม่ตอบ (อาจถูกจำกัดการดึง) — ลองใหม่ภายหลัง';
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, list.length) * 3), 3));
  const c = new THREE.Color(GROUPS[group].color), cols = new Float32Array(Math.max(1, list.length) * 3);
  for (let i = 0; i < list.length; i++) cols.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setDrawRange(0, list.length);
  const points = new THREE.Points(geo, pointsMat(GROUPS[group].size * (PHONE ? 1.3 : 1)));
  points.frustumCulled = false; points.visible = show[group];
  scene.add(points);
  sats[group] = { list, points, cursor: 0 };
  counts[group] = list.length;
  // คำนวณตำแหน่งครั้งแรกทั้งหมด
  propagateSome(group, list.length, new Date());
  renderLayers();
}
const issFb = { pos: new THREE.Vector3(), data: null, mesh: null };
async function issFallback() {
  try {
    const d = await (await fetch('https://api.wheretheiss.at/v1/satellites/25544')).json();
    issFb.data = d;
    v3(d.latitude, d.longitude, 1 + d.altitude / RE, issFb.pos);
    if (!issFb.mesh) { issFb.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(issFb.mesh); }
    issFb.mesh.position.copy(issFb.pos); issFb.mesh.visible = show.stations;
    counts.stations = 1; renderLayers();
  } catch {}
  setTimeout(issFallback, 10e3);
}
function propagateSat(s, date, gmst) {
  const pv = SAT.propagate(s.rec, date);
  const p = pv && pv.position;
  if (!p || typeof p === 'boolean' || isNaN(p.x)) { s.ok = false; return null; }
  ecf2w(SAT.eciToEcf(p, gmst), s.pos); s.ok = true; s.vel = pv.velocity; return p;
}
function propagateSome(group, n, date) {
  const g = sats[group]; if (!g?.list.length) return;
  const gmst = SAT.gstime(date), arr = g.points.geometry.attributes.position.array;
  for (let k = 0; k < n && k < g.list.length; k++) {
    const i = g.cursor = (g.cursor + 1) % g.list.length, s = g.list[i];
    propagateSat(s, date, gmst);
    if (s.ok) { arr[i * 3] = s.pos.x; arr[i * 3 + 1] = s.pos.y; arr[i * 3 + 2] = s.pos.z; } else { arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = 0; }
  }
  g.points.geometry.attributes.position.needsUpdate = true;
}
// เส้นวงโคจรของดวงที่เลือก (ในกรอบ ECI ณ เวลาปัจจุบัน → เป็นวงปิด)
const orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffc845, transparent: true, opacity: 0.85 }));
orbitLine.frustumCulled = false; orbitLine.visible = false; scene.add(orbitLine);
function drawOrbit(s) {
  const periodMin = 2 * Math.PI / s.rec.no, now = Date.now(), gmst = SAT.gstime(new Date(now)), pts = [];
  for (let i = 0; i <= 240; i++) {
    const pv = SAT.propagate(s.rec, new Date(now + (i / 240) * periodMin * 60e3));
    if (pv?.position && typeof pv.position !== 'boolean') pts.push(ecf2w(SAT.eciToEcf(pv.position, gmst)));
  }
  orbitLine.geometry.dispose();
  orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  orbitLine.visible = true;
}

// ---------- แผ่นดินไหว ----------
const quakeGroup = new THREE.Group(); scene.add(quakeGroup);
let quakes = [];
const qCol = m => m >= 6 ? 0xff3b5c : m >= 5 ? 0xff7a3d : m >= 4 ? 0xffc845 : m >= 2.5 ? 0xffe9a0 : 0x9fe8ff;
async function loadQuakes() {
  try {
    const d = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson')).json();
    quakeGroup.clear();
    const sph = new THREE.SphereGeometry(1, 10, 8), ring = new THREE.RingGeometry(0.85, 1, 40);
    quakes = d.features.filter(f => f.properties.mag != null).map(f => {
      const [lon, lat, depth] = f.geometry.coordinates, mag = f.properties.mag;
      const q = { id: f.id, mag, place: f.properties.place, time: f.properties.time, url: f.properties.url, tsunami: f.properties.tsunami, lat, lon, depth, pos: v3(lat, lon, 1.002) };
      const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: qCol(mag), transparent: true, opacity: 0.9 }));
      m.userData.base = 0.0025 + Math.max(0, mag) ** 1.6 * 0.0011; m.scale.setScalar(m.userData.base);
      m.position.copy(q.pos); quakeGroup.add(m);
      const ageH = (Date.now() - q.time) / 3600e3;
      if (mag >= 4.5 || (ageH < 3 && mag >= 2.5)) {
        const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: qCol(mag), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        r.position.copy(q.pos); r.lookAt(0, 0, 0); r.userData.pulse = 0.015 + mag * 0.007; r.userData.ph = Math.random();
        quakeGroup.add(r);
      }
      return q;
    });
    counts.quakes = quakes.length; renderLayers();
  } catch (e) { msgs.quakes = 'โหลด USGS ไม่สำเร็จ'; console.warn(e); renderLayers(); }
}

// ---------- ไฟป่า / พายุ / ภูเขาไฟ (EONET) ----------
const EV = { wildfires: ['🔥', 'ไฟป่า', 0xff7a3d], severeStorms: ['🌀', 'พายุ', 0x3ce7ff], volcanoes: ['🌋', 'ภูเขาไฟ', 0xff3b5c], seaLakeIce: ['🧊', 'น้ำแข็งทะเล', 0xa8f4ff], floods: ['🌊', 'น้ำท่วม', 0x4d8dff], dustHaze: ['🌫', 'ฝุ่น/หมอกควัน', 0xc8a070] };
const evGroup = new THREE.Group(); scene.add(evGroup);
let events = [];
async function loadEvents() {
  try {
    const d = await (await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=500')).json();
    evGroup.clear(); events = [];
    const pos = [], cols = [], c = new THREE.Color();
    for (const e of d.events) {
      const cat = e.categories[0]?.id, meta = EV[cat] || ['⚠', e.categories[0]?.title || 'เหตุการณ์', 0xffffff];
      const pts = e.geometry.filter(g => g.type === 'Point');
      const g = pts[pts.length - 1]; if (!g) continue;
      const ev = { id: e.id, title: e.title, cat, meta, lat: g.coordinates[1], lon: g.coordinates[0], date: g.date, mag: g.magnitudeValue, unit: g.magnitudeUnit, link: e.sources?.[0]?.url || e.link, pos: v3(g.coordinates[1], g.coordinates[0], 1.004) };
      events.push(ev);
      pos.push(ev.pos.x, ev.pos.y, ev.pos.z); c.set(meta[2]); cols.push(c.r, c.g, c.b);
      if (cat === 'severeStorms') {
        if (pts.length > 1) evGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => v3(p.coordinates[1], p.coordinates[0], 1.004))), new THREE.LineBasicMaterial({ color: 0x3ce7ff, transparent: true, opacity: 0.6 })));
        const sw = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.022, 24, 1, 0, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: 0x3ce7ff, side: THREE.DoubleSide, transparent: true }));
        sw.position.copy(ev.pos); sw.lookAt(0, 0, 0); sw.userData.spin = true; evGroup.add(sw);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pts = new THREE.Points(geo, pointsMat(PHONE ? 9 : 8)); pts.frustumCulled = false;
    evGroup.add(pts);
    counts.events = events.length; renderLayers();
  } catch (e) { msgs.events = 'โหลด NASA EONET ไม่สำเร็จ'; console.warn(e); renderLayers(); }
}

// ---------- เลือกวัตถุ (หาจุดที่ใกล้นิ้ว/เมาส์ที่สุดบนจอ ซึ่งไม่ถูกโลกบัง) ----------
const _v = new THREE.Vector3();
function occluded(p) {
  const o = cam.position, d = _v.copy(p).sub(o), L = d.length(); d.divideScalar(L);
  const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < L - 1e-4;
}
function pick(cx, cy) {
  const W = stage.clientWidth, H = stage.clientHeight, R = PHONE ? 22 : 14;
  let best = null, bd = R * R;
  const test = (p, kind, ref) => {
    if (!p) return;
    _v.copy(p).project(cam);
    if (_v.z > 1) return;
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H, d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd && !occluded(p)) { bd = d; best = { kind, ref }; }
  };
  if (show.events) events.forEach(e => test(e.pos, 'event', e));
  if (show.quakes) quakes.forEach(q => test(q.pos, 'quake', q));
  for (const g in sats) if (show[g]) sats[g].list?.forEach(s => s.ok && test(s.pos, 'sat', s));
  if (show.stations && issFb.data) test(issFb.pos, 'iss', issFb);
  if (show.flights) flights.forEach(f => test(f.pos, 'flight', f));
  select(best);
}
let down = null;
ren.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
ren.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const b = ren.domElement.getBoundingClientRect(); pick(e.clientX - b.left, e.clientY - b.top);
});
ctrl.addEventListener('start', () => { if (ctrl.autoRotate) { ctrl.autoRotate = false; resumeRot = true; } });
let resumeRot = false, rotT;
ctrl.addEventListener('end', () => { clearTimeout(rotT); if (resumeRot) rotT = setTimeout(() => { ctrl.autoRotate = store.get('god.rotate', true); renderLayers(); }, 20000); });

function select(s) {
  selected = s; orbitLine.visible = false;
  if (s?.kind === 'sat') drawOrbit(s.ref);
  renderInfo();
}
function selPos() {
  if (!selected) return null;
  const r = selected.ref;
  return r.pos;
}
const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว` : `${Math.floor(m / 1440)} วันที่แล้ว`; };
const tr = rows => `<table>${rows.filter(Boolean).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
function renderInfo() {
  const el = $('#info');
  if (!selected) { el.classList.remove('on'); $('#tag').style.display = 'none'; return; }
  const { kind, ref: r } = selected;
  let h = '', tag = '';
  if (kind === 'flight') {
    const [lat, lon] = flightNow(r, Date.now());
    tag = r.cs || r.id;
    h = `<h2>✈ ${r.cs || r.id.toUpperCase()}</h2><div class="k">${r.desc || 'เครื่องบิน'} · ${r.country || ''}</div>` + tr([
      ['ความสูง', r.ground ? 'บนพื้น' : `${fmt(r.alt)} ม. (${fmt(r.alt / 0.3048)} ft)`],
      ['ความเร็ว', r.gs != null ? `${fmt(r.gs * 3.6)} กม./ชม.` : '—'],
      ['ทิศทาง', `${fmt(r.trk)}°`],
      ['อัตราไต่/ร่อน', r.vr != null ? `${fmt(r.vr * 196.85)} ft/นาที` : '—'],
      ['ตำแหน่ง', `${lat.toFixed(3)}, ${lon.toFixed(3)}`],
      r.sq && ['Squawk', r.sq], ['ICAO hex', r.id],
    ]) + `<div style="margin-top:6px"><a href="https://globe.adsb.fi/?icao=${r.id}" target="_blank" rel="noopener">ดูเส้นทางบน adsb.fi ↗</a></div><div class="note">แหล่ง: ${flightSrc}</div>`;
  } else if (kind === 'sat') {
    const g = SAT.eciToGeodetic(SAT.propagate(r.rec, new Date()).position, SAT.gstime(new Date()));
    const v = r.vel ? Math.hypot(r.vel.x, r.vel.y, r.vel.z) : null;
    tag = r.name;
    h = `<h2>🛰 ${r.name}</h2><div class="k">NORAD ${r.id} · เส้นสีเหลือง = วงโคจร 1 รอบ</div>` + tr([
      ['ความสูง', `${fmt(g.height)} กม.`], ['ความเร็ว', v ? `${fmt(v * 3600)} กม./ชม.` : '—'],
      ['ตำแหน่งใต้ดาวเทียม', `${(g.latitude / RAD).toFixed(2)}, ${(g.longitude / RAD).toFixed(2)}`],
      ['คาบโคจร', `${fmt(2 * Math.PI / r.rec.no, 1)} นาที`], ['ความเอียงวงโคจร', `${fmt(r.rec.inclo / RAD, 1)}°`],
    ]) + `<div style="margin-top:6px"><a href="https://www.n2yo.com/satellite/?s=${+r.id}" target="_blank" rel="noopener">ข้อมูลเพิ่มเติม (N2YO) ↗</a></div>`;
  } else if (kind === 'iss') {
    const d = r.data; tag = 'ISS';
    h = `<h2>🛰 ISS</h2><div class="k">จาก wheretheiss.at</div>` + tr([['ความสูง', `${fmt(d.altitude)} กม.`], ['ความเร็ว', `${fmt(d.velocity)} กม./ชม.`], ['ตำแหน่ง', `${d.latitude.toFixed(2)}, ${d.longitude.toFixed(2)}`], ['ช่วง', d.visibility === 'daylight' ? 'โดนแดด' : 'ในเงาโลก']]);
  } else if (kind === 'quake') {
    tag = `M${r.mag.toFixed(1)}`;
    h = `<h2>〰 M ${r.mag.toFixed(1)}</h2><div class="k">${r.place || ''}</div>` + tr([
      ['เวลา', `${new Date(r.time).toLocaleString('th-TH')}<br><small style="color:var(--dim)">${ago(r.time)}</small>`], ['ความลึก', `${fmt(r.depth, 1)} กม.`],
      ['พิกัด', `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`], r.tsunami && ['สึนามิ', '⚠ มีประกาศ'],
    ]) + `<div style="margin-top:6px"><a href="${r.url}" target="_blank" rel="noopener">รายละเอียด USGS ↗</a></div>`;
  } else if (kind === 'event') {
    tag = r.meta[0] + ' ' + r.meta[1];
    h = `<h2>${r.meta[0]} ${r.meta[1]}</h2><div class="k">${r.title}</div>` + tr([
      ['อัปเดตล่าสุด', new Date(r.date).toLocaleString('th-TH')], ['พิกัด', `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`],
      r.mag && ['ขนาด', `${fmt(r.mag)} ${r.unit || ''}`],
    ]) + `<div style="margin-top:6px"><a href="${r.link}" target="_blank" rel="noopener">แหล่งข้อมูล ↗</a></div>`;
  }
  el.innerHTML = `<button class="x" aria-label="ปิด">×</button>${h}<div class="row" style="margin-top:8px"><button class="btn" id="goSel">◎ ซูมไปที่นี่</button></div>`;
  el.classList.add('on');
  el.querySelector('.x').onclick = () => select(null);
  $('#goSel').onclick = () => { const p = selPos(); if (p) flyTo(p.clone().normalize(), Math.max(1.6, p.length() + 0.9)); };
  $('#tag span').textContent = tag;
}

// ---------- กล้อง ----------
function camLatLon() {
  const p = cam.position.clone().normalize();
  return { lat: Math.asin(p.y) / RAD, lon: Math.atan2(p.z, -p.x) / RAD - 180 + (Math.atan2(p.z, -p.x) / RAD - 180 < -180 ? 360 : 0) };
}
let fly = null;
function flyTo(dir, dist) {
  fly = { from: cam.position.clone(), toDir: dir.clone().normalize(), dist, t0: performance.now(), d0: cam.position.length() };
  ctrl.autoRotate = false;
}
function stepFly(now) {
  if (!fly) return;
  const t = Math.min(1, (now - fly.t0) / 1600), k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const dir = fly.from.clone().normalize().lerp(fly.toDir, k).normalize();
  cam.position.copy(dir.multiplyScalar(fly.d0 + (fly.dist - fly.d0) * k));
  if (t >= 1) fly = null;
}

// ---------- แผง UI ----------
function renderLayers() {
  const row = (k, name, color) => `<label><input type="checkbox" data-k="${k}" ${show[k] ? 'checked' : ''}><i style="background:${color}"></i>${name}<span class="n">${counts[k] ? fmt(counts[k]) : ''}</span></label>${msgs[k] ? `<div class="msg">${msgs[k]}</div>` : ''}`;
  $('#layers').innerHTML = `<h3><span>ชั้นข้อมูล</span><span>${flightAt ? '✈ ' + new Date(flightAt).toLocaleTimeString('th-TH') : ''}</span></h3>
    ${row('flights', 'เครื่องบินสด', 'linear-gradient(90deg,#ff8a1f,#3dff9a,#3ce7ff,#7a5cff)')}
    ${Object.entries(GROUPS).map(([k, g]) => row(k, g.name, '#' + new THREE.Color(g.color).getHexString())).join('')}
    ${row('quakes', 'แผ่นดินไหว 24 ชม. (USGS)', '#ffc845')}
    ${row('events', 'ไฟป่า/พายุ/ภูเขาไฟ (EONET)', '#ff7a3d')}
    <div class="row"><button class="btn ${ctrl.autoRotate ? 'on' : ''}" id="rot">⟳ หมุนเอง</button><button class="btn" id="th">🇹🇭 โฟกัสไทย</button></div>`;
  $('#layers').querySelectorAll('input[data-k]').forEach(i => i.onchange = () => {
    const k = i.dataset.k; show[k] = i.checked; store.set('god.show', show); applyShow();
    if (k === 'flights' && show.flights) loadFlights();
    if (GROUPS[k] && show[k]) loadSats(k);
  });
  $('#rot').onclick = () => { ctrl.autoRotate = !ctrl.autoRotate; store.set('god.rotate', ctrl.autoRotate); resumeRot = false; renderLayers(); };
  $('#th').onclick = () => { flyTo(v3(13, 101), PHONE ? 2.0 : 1.75); store.set('god.rotate', false); renderLayers(); $('#layers').classList.remove('open'); };
}
function applyShow() {
  flightMesh.visible = show.flights;
  for (const g in sats) if (sats[g].points) sats[g].points.visible = show[g];
  if (issFb.mesh) issFb.mesh.visible = show.stations;
  quakeGroup.visible = show.quakes; evGroup.visible = show.events;
  if (selected && !isShown(selected.kind)) select(null);
}
const isShown = k => k === 'flight' ? show.flights : k === 'quake' ? show.quakes : k === 'event' ? show.events : true;
$('#layersBtn').onclick = () => $('#layers').classList.toggle('open');
function renderCounters() {
  const now = new Date();
  const satN = Object.keys(GROUPS).reduce((a, k) => a + (show[k] ? counts[k] : 0), 0);
  $('#counters').innerHTML = `<div class="utc">${now.toISOString().slice(11, 19)} UTC</div>
    <span>✈ เครื่องบิน</span><b>${show.flights ? fmt(counts.flights) : '—'}</b>
    <span>🛰 ดาวเทียม</span><b>${fmt(satN)}</b>
    <span>〰 แผ่นดินไหว</span><b>${show.quakes ? fmt(counts.quakes) : '—'}</b>
    <span>🔥 เหตุการณ์</span><b>${show.events ? fmt(counts.events) : '—'}</b>`;
}

// ---------- วงรอบเรนเดอร์ ----------
const _s = new THREE.Vector3();
let lastFlightPlace = 0, lastSun = 0, frames = 0, fpsT = performance.now(), fps = 60;
function loop(t) {
  requestAnimationFrame(loop);
  if (document.hidden) return;
  stepFly(t);
  ctrl.update();
  const now = new Date();
  if (t - lastSun > 5000) { const s = subsolar(now); v3(s.lat, s.lon, 1, sunDir).normalize(); lastSun = t; }
  // ดาวเทียม: คำนวณทีละส่วนในแต่ละเฟรม
  const budget = PHONE ? 500 : 1500;
  const active = Object.keys(sats).filter(g => show[g] && sats[g].list?.length);
  for (const g of active) propagateSome(g, Math.min(sats[g].list.length, Math.ceil(budget / active.length)), now);
  if (show.flights && flights.length && t - lastFlightPlace > (PHONE ? 1000 : 400)) { placeFlights(); lastFlightPlace = t; }
  // พัลส์แผ่นดินไหว / หมุนพายุ
  const zf = Math.min(1, Math.max(0.3, (cam.position.length() - 1) / 1.8)); // ซูมใกล้ → จุดเล็กลง
  for (const m of quakeGroup.children) {
    if (m.userData.pulse) { const k = ((t / 1600 + m.userData.ph) % 1); m.scale.setScalar(m.userData.pulse * zf * (0.3 + k)); m.material.opacity = 1 - k; }
    else m.scale.setScalar(m.userData.base * zf);
  }
  for (const m of evGroup.children) if (m.userData.spin) m.rotateZ(-0.03);
  ren.render(scene, cam);
  // ป้ายวัตถุที่เลือก + กรุงเทพฯ
  const W = stage.clientWidth, H = stage.clientHeight;
  const place = (el, p) => {
    if (!p || occluded(p)) { el.style.display = 'none'; return; }
    _s.copy(p).project(cam);
    if (_s.z > 1) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.transform = `translate(${(_s.x * 0.5 + 0.5) * W}px, ${(-_s.y * 0.5 + 0.5) * H}px)`;
  };
  place($('#tag'), selected ? (selected.kind === 'flight' ? selected.ref.pos : selected.ref.pos) : null);
  place($('#bkk'), cam.position.length() < 4 ? BKK : null);
  // ปรับลดภาระอัตโนมัติถ้าเฟรมเรตต่ำ
  frames++;
  if (t - fpsT > 2000) { fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; if (fps < 28 && ren.getPixelRatio() > 1) { ren.setPixelRatio(Math.max(1, ren.getPixelRatio() - 0.25)); resize(); } }
}

// ---------- เริ่ม ----------
renderLayers(); renderCounters();
setInterval(renderCounters, 1000);
setInterval(() => { if (selected && ['flight', 'sat', 'iss'].includes(selected.kind)) renderInfoLight(); }, 2000);
function renderInfoLight() { const sc = $('#info').scrollTop; renderInfo(); $('#info').scrollTop = sc; }
(async () => {
  const tl = new THREE.TextureLoader();
  try {
    const [day, night] = await Promise.all([tl.loadAsync(TEX + 'earth-blue-marble.jpg'), tl.loadAsync(TEX + 'earth-night.jpg')]);
    for (const t of [day, night]) { t.anisotropy = 4; }
    globeMat.uniforms.day.value = day; globeMat.uniforms.night.value = night;
  } catch (e) { toast('โหลดภาพพื้นผิวโลกไม่สำเร็จ'); console.warn(e); }
  $('#loading').remove();
  requestAnimationFrame(loop);
})();
loadQuakes(); loadEvents();
for (const g of Object.keys(GROUPS)) if (show[g]) loadSats(g);
loadFlights();
setInterval(loadFlights, 30e3);           // OpenSky แบบไม่ลงทะเบียนมีโควตาจำกัด → ทุก 30 วินาที
setInterval(loadQuakes, 5 * 60e3);
setInterval(loadEvents, 30 * 60e3);
applyShow();
window.__god = { flights: () => flights.length, counts, sats, select, pick, cam, flyTo, v3 };
