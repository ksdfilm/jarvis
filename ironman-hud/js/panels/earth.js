// แผง EARTH: ลูกโลก 3 มิติ กลางวัน-กลางคืนตามเวลาจริง + ISS สด + แผ่นดินไหว (USGS) + พายุ (GDACS) + ไฟป่า (NASA FIRMS)
// ลูกโลกโหลดเมื่อเปิดแผงครั้งแรก และหยุดวาดเมื่อออกจากแผง (ประหยัดแบต)
import { getJSON } from '../lib/load.js';
import { initIss, issAt, issTrack } from '../lib/iss.js';

let ctx, THREE, OrbitControls;
let ren, scene, cam, ctrl, mat, labelsEl, raf = 0, building = null, visible = false;
const layers = { iss: null, quakes: null, storms: null, fires: null, me: null };
const show = { iss: true, quakes: true, storms: true, fires: true };
const data = { quakes: [], storms: [], fires: [], firesAt: '', stormsAt: '', loaded: { quakes: false, storms: false, fires: false } };
const WAIT = 'กำลังโหลดข้อมูลค่ะ ถามอีกครั้งในไม่กี่วินาทีนะคะ';
const labels = []; // { el, pos: Vector3 }
const R = 1, RAD = Math.PI / 180;

// ---------- ภูมิศาสตร์ ----------
function v3(lat, lon, r = R) {
  const phi = (90 - lat) * RAD, th = (lon + 180) * RAD;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
export function km(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** จุดที่ดวงอาทิตย์อยู่ตรงหัว (สูตร NOAA) */
function subsolar(d) {
  const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const g = 2 * Math.PI / 365 * (N - 1 + (d.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lon = -(utcMin + eot - 720) / 4;
  return { lat: decl / RAD, lon: ((lon + 540) % 360) - 180 };
}
const inThai = (lat, lon) => lat >= 5.6 && lat <= 20.5 && lon >= 97.3 && lon <= 105.7;

// ---------- สร้างฉาก ----------
async function build() {
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  const wrap = document.getElementById('earth-globe');
  ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  ren.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  ren.outputColorSpace = THREE.LinearSRGBColorSpace; // ส่งค่าสีจากภาพตรงๆ ไม่แปลงซ้ำ
  wrap.prepend(ren.domElement);
  labelsEl = wrap.querySelector('.g-labels');
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  const me = ctx.place();
  cam.position.copy(v3(me.lat + 8, me.lon, 3.1));
  ctrl = new OrbitControls(cam, ren.domElement);
  ctrl.enablePan = false; ctrl.enableDamping = true; ctrl.dampingFactor = 0.08;
  ctrl.minDistance = 1.45; ctrl.maxDistance = 5; ctrl.rotateSpeed = 0.5;
  ctrl.autoRotate = !ctx.reduceMotion; ctrl.autoRotateSpeed = 0.35;
  let idle = 0;
  ctrl.addEventListener('start', () => { ctrl.autoRotate = false; clearTimeout(idle); });
  ctrl.addEventListener('end', () => { idle = setTimeout(() => { ctrl.autoRotate = !ctx.reduceMotion; }, 15000); });

  const tl = new THREE.TextureLoader();
  const [day, night] = await Promise.all(['tex/2k_earth_daymap.jpg', 'tex/2k_earth_nightmap.jpg'].map((u) => tl.loadAsync(u)));
  mat = new THREE.ShaderMaterial({
    uniforms: { day: { value: day }, night: { value: night }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, tint: { value: new THREE.Color(0x3fd8ff) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform vec3 sunDir; uniform vec3 tint; varying vec2 vUv; varying vec3 vN;
      void main(){
        float d = dot(normalize(vN), sunDir);
        float k = smoothstep(-0.12, 0.18, d);
        vec3 dayC = texture2D(day, vUv).rgb * (0.30 + 0.85 * max(d, 0.0));
        vec3 nightC = texture2D(night, vUv).rgb * 1.5 + tint * 0.035;
        vec3 col = mix(nightC, dayC, k);
        col += vec3(1.0, 0.55, 0.25) * 0.22 * exp(-pow(d * 10.0, 2.0)); // แสงเส้นแบ่งกลางวัน-กลางคืน
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat));
  // บรรยากาศเรืองแสง
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 64, 48), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(0x3fd8ff) } }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(c, 1.0) * i; }',
  })));
  // เส้นละติจูด/ลองจิจูด
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 4) grid.push(v3(lat, lon, R * 1.001), v3(lat, lon + 4, R * 1.001));
  for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 4) grid.push(v3(lat, lon, R * 1.001), v3(lat + 4, lon, R * 1.001));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), new THREE.LineBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.08 })));
  // ตำแหน่งเรา
  layers.me = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2ee6a6 }));
  layers.me.position.copy(v3(me.lat, me.lon, R * 1.004));
  scene.add(layers.me);
  addLabel('คุณ', layers.me.position, 'me');

  resize();
  new ResizeObserver(resize).observe(wrap);
  await Promise.all([loadQuakes(), loadStorms(), loadFires(), loadIss()]);
  wrap.classList.add('ready');
}
function resize() {
  const wrap = document.getElementById('earth-globe');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h || !ren) return;
  ren.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
}

// ---------- ป้ายชื่อ (HTML ซ้อนบนลูกโลก ซ่อนเมื่ออยู่หลังโลก) ----------
function addLabel(text, pos, cls) {
  const el = document.createElement('span');
  el.className = `gl-tag ${cls || ''}`;
  el.textContent = text;
  labelsEl.append(el);
  const l = { el, pos: pos.clone() };
  labels.push(l);
  return l;
}
function clearLabels(cls) {
  for (let i = labels.length - 1; i >= 0; i--) if (labels[i].el.classList.contains(cls)) { labels[i].el.remove(); labels.splice(i, 1); }
}
const tmp = () => new THREE.Vector3();
function placeLabels() {
  const w = ren.domElement.clientWidth, h = ren.domElement.clientHeight;
  const camDir = cam.position.clone().normalize();
  for (const l of labels) {
    const front = l.pos.clone().normalize().dot(camDir) > 0.15;
    const p = tmp().copy(l.pos).project(cam);
    l.el.style.display = front && !l.el.classList.contains('off') ? '' : 'none';
    l.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px)`;
  }
}

// ---------- ชั้นข้อมูล ----------
function group(name) {
  if (layers[name]) scene.remove(layers[name]);
  layers[name] = new THREE.Group();
  layers[name].visible = show[name];
  scene.add(layers[name]);
  return layers[name];
}
const magColor = (m) => (m >= 7 ? 0xb06bff : m >= 6 ? 0xff3b5c : m >= 5 ? 0xff8a3d : m >= 4 ? 0xffd23f : 0x9fe8ff);
async function loadQuakes() {
  try {
    const [week, day] = await Promise.all([
      getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'),
      getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'),
    ]);
    const seen = new Set();
    data.quakes = [...day.features, ...week.features].filter((f) => !seen.has(f.id) && seen.add(f.id)).map((f) => ({
      id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url,
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2],
    }));
    data.loaded.quakes = true;
  } catch { /* ไม่มีเน็ต */ }
  drawQuakes();
  renderInfo();
}
function drawQuakes() {
  if (!scene) return;
  const g = group('quakes');
  const now = Date.now();
  for (const q of data.quakes) {
    const fresh = now - q.time < 24 * 3600e3;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.004 + Math.max(0, q.mag - 2) * 0.0035, 10, 8), new THREE.MeshBasicMaterial({ color: magColor(q.mag) }));
    m.position.copy(v3(q.lat, q.lon, R * 1.003));
    g.add(m);
    if (fresh && q.mag >= 4) { // แผ่นดินไหวใน 24 ชม. → วงกระเพื่อม
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: magColor(q.mag), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(m.position); ring.lookAt(0, 0, 0); ring.userData.pulse = 0.02 + q.mag * 0.006;
      g.add(ring);
    }
  }
}
async function loadStorms() {
  try {
    const d = await getJSON(`data/storms.json?h=${Math.floor(Date.now() / 3600e3)}`);
    data.storms = d.items; data.stormsAt = d.updated; data.loaded.storms = true;
  } catch { /* ยังไม่มีไฟล์ */ }
  if (!scene) return;
  const g = group('storms');
  clearLabels('storm');
  const col = { Red: 0xff3b5c, Orange: 0xff8a3d, Green: 0x2ee6a6 };
  for (const s of data.storms) {
    const p = v3(s.lat, s.lon, R * 1.006);
    const c = col[s.level] || 0x2ee6a6;
    const swirl = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.032, 24, 1, 0, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    swirl.position.copy(p); swirl.lookAt(0, 0, 0); swirl.userData.spin = true;
    g.add(swirl);
    addLabel(`🌀 ${s.name}`, p, 'storm');
  }
  labels.filter((l) => l.el.classList.contains('storm')).forEach((l) => l.el.classList.toggle('off', !show.storms));
  renderInfo();
}
async function loadFires() {
  try {
    const d = await getJSON(`data/fires.json?h=${Math.floor(Date.now() / 3600e3)}`);
    data.fires = d.items; data.firesAt = d.updated; data.loaded.fires = true;
  } catch { /* ยังไม่มีไฟล์ */ }
  if (!scene) return;
  const g = group('fires');
  if (!data.fires.length) return renderInfo();
  const pos = new Float32Array(data.fires.length * 3);
  data.fires.forEach((f, i) => { const v = v3(f[0], f[1], R * 1.002); pos.set([v.x, v.y, v.z], i * 3); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff7a1a, size: 0.012, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })));
  renderInfo();
}
let issMesh, issLine, issLabel, issReady = false;
async function loadIss() {
  try { await initIss(ctx.store); } catch { return; }
  const g = group('iss');
  issMesh = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.35, depthWrite: false }));
  issMesh.add(halo);
  g.add(issMesh);
  issLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x3fd8ff, dashSize: 0.02, gapSize: 0.012, transparent: true, opacity: 0.8 }));
  g.add(issLine);
  issLabel = addLabel('ISS', new THREE.Vector3(), 'iss');
  updateIss(true);
}
let issTrackAt = 0;
function updateIss(force) {
  if (!issMesh) return;
  const p = issAt();
  if (!p) return;
  const r = R * (1 + p.alt / 6371);
  issMesh.position.copy(v3(p.lat, p.lon, r));
  issLabel.pos.copy(issMesh.position);
  if (force || Date.now() - issTrackAt > 60000) { // เส้นทางโคจร: อัปเดตนาทีละครั้ง
    issTrackAt = Date.now();
    const pts = issTrack(-45, 95, 1).map((t) => v3(t.lat, t.lon, R * (1 + t.alt / 6371)));
    issLine.geometry.dispose();
    issLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    issLine.computeLineDistances();
  }
  data.iss = p;
}

// ---------- วาดต่อเนื่อง ----------
let lastInfo = 0;
function loop(t) {
  raf = requestAnimationFrame(loop);
  const s = subsolar(new Date());
  mat.uniforms.sunDir.value.copy(v3(s.lat, s.lon, 1).normalize());
  updateIss();
  layers.quakes?.children.forEach((m) => { if (m.userData.pulse) { const k = (t / 1600) % 1; m.scale.setScalar(m.userData.pulse * (0.3 + k * 2.2)); m.material.opacity = 1 - k; } });
  layers.storms?.children.forEach((m) => { if (m.userData.spin) m.rotateZ(-0.03); });
  ctrl.update();
  ren.render(scene, cam);
  placeLabels();
  if (t - lastInfo > 2000) { lastInfo = t; renderIssInfo(); }
}

// ---------- ข้อมูลด้านล่างลูกโลก ----------
const fmtTime = (ms) => new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function renderIssInfo() {
  const box = document.getElementById('earth-iss');
  const p = data.iss;
  if (!box || !p) return;
  const me = ctx.place();
  box.innerHTML = `<span><small>ละติจูด</small>${p.lat.toFixed(2)}°</span><span><small>ลองจิจูด</small>${p.lon.toFixed(2)}°</span>
    <span><small>ความสูง</small>${Math.round(p.alt)} กม.</span><span><small>ความเร็ว</small>${Math.round(p.speed).toLocaleString()} กม./ชม.</span>
    <span class="wide"><small>ห่างจากคุณ</small>${Math.round(km(me, p)).toLocaleString()} กม.</span>`;
}
function nearMe() {
  const me = ctx.place();
  return data.quakes.map((q) => ({ ...q, dist: km(me, q) })).filter((q) => q.dist <= 1500).sort((a, b) => b.time - a.time);
}
function renderInfo() {
  const me = ctx.place();
  const near = nearMe();
  const big = [...data.quakes].sort((a, b) => b.mag - a.mag).slice(0, 4);
  const q = document.getElementById('earth-quakes');
  if (q) q.innerHTML = `<div class="p-lbl">EARTHQUAKES · แผ่นดินไหว (USGS)</div>
    <div class="e-sub">ใกล้คุณ ≤1,500 กม.</div>
    ${near.length ? near.slice(0, 5).map((x) => qRow(x, true)).join('') : '<p class="hint left">ไม่มีแผ่นดินไหวใกล้คุณที่ตรวจพบ (M2.5+ 24 ชม. / M4.5+ 7 วัน)</p>'}
    <div class="e-sub">แรงสุดทั่วโลก 7 วัน</div>${big.map((x) => qRow({ ...x, dist: km(me, x) })).join('')}`;
  const st = document.getElementById('earth-storms');
  if (st) st.innerHTML = `<div class="p-lbl">STORMS · พายุหมุนเขตร้อน (GDACS)${data.stormsAt ? ` · อัปเดต ${fmtTime(data.stormsAt)}` : ''}</div>
    ${data.storms.length ? data.storms.map((s) => ({ ...s, dist: km(me, s) })).sort((a, b) => a.dist - b.dist).map((s) => `<div class="e-row" style="--c:${s.level === 'Red' ? '#ff3b5c' : s.level === 'Orange' ? '#ff8a3d' : '#2ee6a6'}">
      <b>🌀 ${ctx.esc(s.name)}</b><span>${s.wind ? `ลม ${Math.round(s.wind)} กม./ชม.` : ''} · ห่าง ${Math.round(s.dist).toLocaleString()} กม.</span></div>`).join('') : '<p class="hint left">ไม่มีพายุที่กำลังเกิดอยู่ (หรือยังไม่มีข้อมูล)</p>'}`;
  const fi = document.getElementById('earth-fires');
  if (fi) {
    const th = data.fires.filter((f) => inThai(f[0], f[1])).length;
    fi.innerHTML = `<div class="p-lbl">HOTSPOTS · จุดความร้อน/ไฟป่า 24 ชม. (NASA FIRMS)</div>
      <div class="e-big"><b>${th.toLocaleString()}</b> จุด บริเวณประเทศไทย <small>(ทั้งภูมิภาค ${data.fires.length.toLocaleString()} จุด)</small></div>
      <p class="hint left">${th > 300 ? '🔥 จุดความร้อนเยอะ มีผลต่อฝุ่น PM2.5 ช่วงนี้' : 'จุดความร้อนน้อย'}${data.firesAt ? ` · อัปเดต ${fmtTime(data.firesAt)}` : ''}</p>`;
  }
}
function qRow(x, near) {
  const c = '#' + magColor(x.mag).toString(16).padStart(6, '0');
  return `<a class="e-row" style="--c:${c}" href="${x.url}" target="_blank" rel="noopener"><b>M${x.mag.toFixed(1)}</b>
    <span>${ctx.esc(x.place || '')}<small>${fmtTime(x.time)}${near || x.dist < 3000 ? ` · ห่าง ${Math.round(x.dist).toLocaleString()} กม.` : ''}</small></span></a>`;
}

// ---------- เปิด/ปิดแผง ----------
function start() {
  visible = true;
  if (!building) building = build().catch((e) => { document.getElementById('earth-globe').innerHTML = `<p class="hint">โหลดลูกโลกไม่สำเร็จ (${ctx.esc(e.message)})</p>`; });
  building.then(() => { if (visible && ren && !raf) raf = requestAnimationFrame(loop); });
}
function stop() { visible = false; cancelAnimationFrame(raf); raf = 0; }

export default {
  id: 'p-earth', en: 'EARTH', th: 'โลก', sub: 'ลูกโลก · ISS · แผ่นดินไหว · พายุ · ไฟป่า', span: 2,
  html: `<div id="earth-globe" class="globe no-swipe"><div class="g-labels"></div><p class="g-loading">กำลังโหลดลูกโลก…</p></div>
    <div class="chips" id="earth-layers">
      <button type="button" data-l="iss" class="on">🛰 ISS</button><button type="button" data-l="quakes" class="on">〰 แผ่นดินไหว</button>
      <button type="button" data-l="storms" class="on">🌀 พายุ</button><button type="button" data-l="fires" class="on">🔥 ไฟป่า</button>
      <button type="button" data-act="iss">⌖ ไปหา ISS</button><button type="button" data-act="me">⌖ ตำแหน่งฉัน</button></div>
    <div class="box"><div class="p-lbl">ISS · สถานีอวกาศนานาชาติ ตอนนี้</div><div class="e-iss" id="earth-iss"><span>กำลังคำนวณวงโคจร…</span></div></div>
    <div class="box" id="earth-quakes"></div><div class="box" id="earth-storms"></div><div class="box" id="earth-fires"></div>`,
  init(c) {
    ctx = c;
    document.getElementById('earth-layers').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.l) {
        const k = b.dataset.l;
        show[k] = !show[k];
        b.classList.toggle('on', show[k]);
        if (layers[k]) layers[k].visible = show[k];
        labels.filter((l) => l.el.classList.contains(k === 'storms' ? 'storm' : k)).forEach((l) => l.el.classList.toggle('off', !show[k]));
      }
      if (b.dataset.act && cam) {
        const t = b.dataset.act === 'iss' ? data.iss : ctx.place();
        if (t) { ctrl.autoRotate = false; cam.position.copy(v3(t.lat, t.lon, cam.position.length())); }
      }
    });
    setInterval(() => { if (visible) { loadQuakes(); loadStorms(); } }, 15 * 60000);
    // โหลดข้อมูลเบาๆ ล่วงหน้า (ไม่สร้างลูกโลก) เพื่อให้รายงานประจำวันและคำสั่งเสียงตอบได้ทันที
    setTimeout(() => { loadQuakes(); loadStorms(); loadFires(); initIss(ctx.store).then(() => { issReady = true; }).catch(() => {}); }, 8000);
    ctx.addReporter(() => {
      const out = [];
      const near = nearMe().filter((q) => Date.now() - q.time < 24 * 3600e3 && q.mag >= 4);
      if (near.length) out.push(`มีแผ่นดินไหวใกล้คุณใน 24 ชั่วโมง ${near.length} ครั้ง แรงสุดขนาด ${Math.max(...near.map((q) => q.mag)).toFixed(1)}`);
      const me = ctx.place(), close = data.storms.filter((s) => km(me, s) < 2500);
      if (close.length) out.push(`มีพายุ ${close.map((s) => s.name).join(' และ ')} อยู่ห่างไม่ถึง 2,500 กิโลเมตร ติดตามข่าวด้วยนะคะ`);
      return out;
    });
    ctx.addIntent(/แผ่นดินไหว|earthquake/, () => {
      loadQuakes();
      if (!data.loaded.quakes) return { text: WAIT, go: ctx.panels.findIndex((p) => p.id === 'p-earth') };
      const near = nearMe();
      if (near.length) { const q = near[0]; return { text: `แผ่นดินไหวล่าสุดใกล้คุณ ขนาด ${q.mag.toFixed(1)} ที่ ${q.place} ห่าง ${Math.round(q.dist)} กิโลเมตรค่ะ`, go: ctx.panels.findIndex((p) => p.id === 'p-earth') }; }
      return { text: 'ไม่มีแผ่นดินไหวที่ตรวจพบใกล้คุณช่วงนี้ค่ะ', go: ctx.panels.findIndex((p) => p.id === 'p-earth') };
    }, 'แผ่นดินไหวไหม');
    ctx.addIntent(/พายุ|ไต้ฝุ่น|ไซโคลน|storm|typhoon/, () => {
      const me = ctx.place();
      const list = data.storms.map((s) => ({ ...s, dist: km(me, s) })).sort((a, b) => a.dist - b.dist);
      const go = ctx.panels.findIndex((p) => p.id === 'p-earth');
      if (!data.loaded.storms) { loadStorms(); return { text: WAIT, go }; }
      if (!list.length) return { text: 'ตอนนี้ไม่มีพายุหมุนเขตร้อนที่ติดตามอยู่ค่ะ', go };
      return { text: `ตอนนี้มีพายุ ${list.length} ลูก ใกล้สุดคือ ${list[0].name} ห่าง ${Math.round(list[0].dist).toLocaleString()} กิโลเมตรค่ะ`, go };
    });
    ctx.addIntent(/ไฟป่า|จุดความร้อน|hotspot|เผา/, () => {
      if (!data.loaded.fires) { loadFires(); return { text: WAIT, go: ctx.panels.findIndex((p) => p.id === 'p-earth') }; }
      const th = data.fires.filter((f) => inThai(f[0], f[1])).length;
      return { text: `24 ชั่วโมงที่ผ่านมา ดาวเทียมพบจุดความร้อนบริเวณประเทศไทย ${th} จุดค่ะ`, go: ctx.panels.findIndex((p) => p.id === 'p-earth') };
    });
    ctx.addIntent(/iss|ไอเอสเอส|สถานีอวกาศ/, (q) => {
      if (/ผ่าน|เห็น|มองเห็น|เมื่อไหร่/.test(q)) return null; // ให้แผงอวกาศตอบเรื่องรอบที่มองเห็น
      const p = issReady ? issAt() : data.iss;
      if (!p) initIss(ctx.store).then(() => { issReady = true; }).catch(() => {});
      return { text: p ? `ตอนนี้สถานีอวกาศอยู่ที่ละติจูด ${p.lat.toFixed(0)} ลองจิจูด ${p.lon.toFixed(0)} สูง ${Math.round(p.alt)} กิโลเมตร เคลื่อนที่ ${Math.round(p.speed).toLocaleString()} กิโลเมตรต่อชั่วโมงค่ะ` : 'กำลังคำนวณตำแหน่งสถานีอวกาศค่ะ', go: ctx.panels.findIndex((x) => x.id === 'p-earth') };
    });
  },
  show: start,
  hide: stop,
};
