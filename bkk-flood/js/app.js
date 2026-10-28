import { mapStyle } from './mapstyle.js';
import { STATIONS, LEVELS, CENTER, levelOf } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ฝังในแอป JARVIS HUD (?embed): จัดหน้าให้พอดีจอเล็ก และหยุดทำงานเมื่อแอปแม่ซ่อนแผงนี้ (ประหยัดแบต)
const EMBED = new URLSearchParams(location.search).has('embed');
if (EMBED) document.body.classList.add('embed');
let hiddenByHost = false;
addEventListener('message', (e) => {
  if (e.origin !== location.origin || typeof e.data?.floodVisible !== 'boolean') return;
  hiddenByHost = !e.data.floodVisible;
  if (hiddenByHost) stopTour();
});

// ---------- เรขาคณิต ----------
/** วงกลม (polygon) รัศมีเป็นเมตร รอบจุด [lng, lat] */
function circle([lng, lat], meters, steps = 48) {
  const dLat = meters / 111320, dLng = meters / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return ring;
}
/** รูปพัดของเรดาร์ จากมุม a0 ถึง a1 (เรเดียน) */
function sector([lng, lat], meters, a0, a1, steps = 24) {
  const dLat = meters / 111320, dLng = meters / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = [[lng, lat]];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    ring.push([lng + Math.sin(a) * dLng, lat + Math.cos(a) * dLat]);
  }
  ring.push([lng, lat]);
  return ring;
}
const kmBetween = (a, b) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos(a[1] * Math.PI / 180), dy = (a[1] - b[1]) * 111.32;
  return Math.hypot(dx, dy);
};

// ---------- การจำลองฝนและระดับน้ำ ----------
// 1 วินาทีจริง = 2 นาทีในระบบจำลอง; กลุ่มฝนเคลื่อนผ่านเมือง ฝนตกหนักตรงไหนน้ำขึ้นตรงนั้น
const SIM_MIN_PER_TICK = 2;
const sim = {
  time: new Date(),
  paused: false,
  storms: [],
  history: [], // ค่าเฉลี่ย/สูงสุดของระดับน้ำ เพื่อวาดกราฟ
  log: [],
};
sim.time.setSeconds(0, 0);

const state = STATIONS.map((s) => ({ ...s, level: 0, rain: 0, trend: 0, lvl: 0 }));
// เริ่มต้นให้บางย่านมีน้ำขังอยู่แล้ว จะได้ไม่ว่างตอนเปิด
const preset = { dindaeng: 34, asok: 22, ladprao: 17, latkrabang: 26, bangkapi: 12, minburi: 9, pratunam: 7 };
state.forEach((s) => { s.level = preset[s.id] ?? Math.random() * 3; s.lvl = levelOf(s.level); });

function spawnStorm(initial = false) {
  // เกิดทางตะวันตก/ตะวันตกเฉียงใต้แล้วเคลื่อนไปทางตะวันออก (ทิศทางพายุฝนฟ้าคะนองที่พบบ่อย)
  const lat = 13.66 + Math.random() * 0.26;
  return {
    pos: initial ? [100.53 + Math.random() * 0.06, 13.75 + Math.random() * 0.04] : [100.36, lat],
    vel: [0.0045 + Math.random() * 0.003, (Math.random() - 0.4) * 0.002], // องศาต่อ tick
    radiusKm: 3 + Math.random() * 3.5,
    peak: 35 + Math.random() * 50, // มม./ชม. ที่ใจกลาง
  };
}
sim.storms = [spawnStorm(true), spawnStorm()];

function pushLog(text, lvl) {
  sim.log.unshift({ t: fmtTime(sim.time), text, lvl });
  sim.log.length = Math.min(sim.log.length, 30);
}

function tick() {
  if (sim.paused) return;
  sim.time = new Date(sim.time.getTime() + SIM_MIN_PER_TICK * 60000);
  sim.storms.forEach((st, i) => {
    st.pos[0] += st.vel[0]; st.pos[1] += st.vel[1];
    st.peak *= 0.997;
    if (st.pos[0] > 100.86 || st.pos[1] < 13.55 || st.pos[1] > 14.0 || st.peak < 15) {
      sim.storms[i] = spawnStorm();
      pushLog('ตรวจพบกลุ่มฝนใหม่ ทางตะวันตกของกรุงเทพฯ', 1);
    }
  });
  for (const s of state) {
    let rain = 0;
    for (const st of sim.storms) {
      const d = kmBetween([s.lng, s.lat], st.pos);
      rain += st.peak * Math.exp(-(d * d) / (2 * st.radiusKm * st.radiusKm));
    }
    rain = Math.max(0, rain + (Math.random() - 0.5) * 3);
    const before = s.level;
    // น้ำเพิ่มตามฝน × ความต่ำของพื้นที่, ลดตามการระบาย (ยิ่งน้ำสูงยิ่งระบายเร็วขึ้นเล็กน้อย)
    // จุดสมดุล: ฝนราว 15–20 มม./ชม. ขึ้นไปน้ำเริ่มสะสม; ปรับค่าแล้วได้สัดส่วนเวลา ปกติ~67% เฝ้าระวัง~15% เตือนภัย~11% วิกฤต~7%
    const delta = (rain * s.sens * 0.02 - s.drain * (1 + s.level / 50)) * SIM_MIN_PER_TICK;
    s.level = Math.max(0, Math.min(60, s.level + delta));
    s.rain = rain;
    s.trend = s.level - before;
    const lvl = levelOf(s.level);
    if (lvl !== s.lvl) {
      const up = lvl > s.lvl;
      if (up || lvl <= 1) pushLog(`${s.name} ${Math.round(s.level)} ซม. ${up ? '▲' : '▼'} ${LEVELS[lvl].name}`, lvl);
      s.lvl = lvl;
    }
  }
  const avg = state.reduce((a, s) => a + s.level, 0) / state.length;
  const max = Math.max(...state.map((s) => s.level));
  sim.history.push({ avg, max });
  if (sim.history.length > 90) sim.history.shift();
}

// ---------- แผนที่ ----------
const map = new maplibregl.Map({
  container: 'map',
  style: mapStyle,
  center: CENTER,
  zoom: 9.6,
  pitch: 0,
  bearing: 0,
  maxPitch: 78,
  antialias: true,
  attributionControl: false,
});
// เครดิตแผนที่ (OpenFreeMap / OpenMapTiles / OpenStreetMap) มากับแหล่งข้อมูลเอง — ต้องแสดงตามสัญญาอนุญาต
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

// มุมมองทั้งเมือง: ป้ายชื่อแสดงเฉพาะจุดวิกฤต ซูมเข้าแล้วค่อยแสดงจุดเตือนภัยด้วย (กันป้ายทับกัน)
const syncZoomClass = () => document.body.classList.toggle('far', map.getZoom() < 13.2);
map.on('zoom', syncZoomClass);
syncZoomClass();

const fc = (features) => ({ type: 'FeatureCollection', features });
const poly = (ring, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });

function floodData() {
  // ผืนน้ำท่วมรอบจุดเตือน: ยิ่งน้ำสูงยิ่งกว้างและยกสูงขึ้น (ขยายความสูงให้เห็นชัด)
  return fc(state.filter((s) => s.level >= 3).map((s) => poly(circle([s.lng, s.lat], 110 + s.level * 7), {
    h: 1.5 + s.level * 0.3, color: LEVELS[s.lvl].color,
  })));
}
function stormData() {
  return fc(sim.storms.map((st) => poly(circle(st.pos, st.radiusKm * 1000 * 1.1, 64), { peak: st.peak })));
}
const RADAR_KM = [5, 10, 15, 20];
function radarRings() {
  return fc(RADAR_KM.map((km) => ({ type: 'Feature', properties: { km }, geometry: { type: 'LineString', coordinates: circle(CENTER, km * 1000, 128) } })));
}

map.on('load', () => {
  map.addSource('storm', { type: 'geojson', data: stormData() });
  map.addLayer({ id: 'storm', type: 'fill', source: 'storm', paint: { 'fill-color': '#7b5cff', 'fill-opacity': 0.13 } }, 'buildings');
  map.addLayer({ id: 'storm-edge', type: 'line', source: 'storm', paint: { 'line-color': '#a68bff', 'line-width': 1.2, 'line-dasharray': [3, 3], 'line-opacity': 0.6 } }, 'buildings');

  map.addSource('radar-rings', { type: 'geojson', data: radarRings() });
  map.addLayer({ id: 'radar-rings', type: 'line', source: 'radar-rings', paint: { 'line-color': '#39d5ff', 'line-width': 1, 'line-opacity': 0.35, 'line-dasharray': [1, 2] } }, 'buildings');
  map.addSource('radar-sweep', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'radar-sweep', type: 'fill', source: 'radar-sweep', paint: { 'fill-color': '#39d5ff', 'fill-opacity': ['get', 'o'] } }, 'buildings');

  map.addSource('flood', { type: 'geojson', data: floodData() });
  map.addLayer({ id: 'flood', type: 'fill-extrusion', source: 'flood', paint: {
    'fill-extrusion-color': ['get', 'color'],
    'fill-extrusion-height': ['get', 'h'],
    'fill-extrusion-base': 0,
    'fill-extrusion-opacity': 0.38,
  } });
  map.addLayer({ id: 'flood-edge', type: 'line', source: 'flood', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-blur': 1, 'line-opacity': 0.8 } }, 'flood');

  buildMarkers();
  renderAll();
  intro();
});

// ---------- หมุดเตือน ----------
const markers = new Map();
function buildMarkers() {
  for (const s of state) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin';
    el.setAttribute('aria-label', s.name);
    el.innerHTML = '<span class="ring"></span><span class="ring r2"></span><span class="core">!</span><span class="tag"><b></b><i></i></span>';
    el.addEventListener('click', (e) => { e.stopPropagation(); stopTour(); select(s.id, true); });
    const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map);
    markers.set(s.id, { el, m });
  }
}
function renderMarkers() {
  if (!markers.size) return; // ยังโหลดแผนที่ไม่เสร็จ
  for (const s of state) {
    const { el } = markers.get(s.id);
    el.dataset.lvl = s.lvl;
    el.style.setProperty('--c', LEVELS[s.lvl].color);
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = `${Math.round(s.level)} ซม.`;
    el.classList.toggle('sel', s.id === selected);
  }
}

// ---------- HUD ----------
const thaiDate = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
function fmtTime(d) { return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }); }

function renderStats() {
  const counts = LEVELS.map(() => 0);
  state.forEach((s) => counts[s.lvl]++);
  $('#stats').innerHTML = LEVELS.map((l, i) => `<div class="stat" style="--c:${l.color}"><span>${l.name}</span><b>${counts[i]}</b><em>${l.en}</em></div>`).slice().reverse().join('');
  const avgRain = state.reduce((a, s) => a + s.rain, 0) / state.length;
  const top = state.reduce((a, s) => (s.rain > a.rain ? s : a), state[0]);
  $('#rain-avg').textContent = avgRain.toFixed(1);
  $('#rain-max').textContent = `${top.name} ${top.rain.toFixed(0)} มม./ชม.`;
  $('#rain-bar').style.width = `${Math.min(100, (top.rain / 100) * 100)}%`;
  const crit = counts[3], warn = counts[2];
  const banner = $('#banner');
  banner.dataset.lvl = crit ? 3 : warn ? 2 : counts[1] ? 1 : 0;
  banner.textContent = crit ? `⚠ วิกฤต ${crit} จุด · เตือนภัย ${warn} จุด` : warn ? `⚠ เตือนภัย ${warn} จุด` : counts[1] ? 'เฝ้าระวังน้ำขังบางจุด' : 'สถานการณ์ปกติ';
}

function renderClock() {
  $('#clock').textContent = fmtTime(sim.time);
  $('#date').textContent = thaiDate.format(sim.time);
}

function renderList() {
  const rows = [...state].sort((a, b) => b.level - a.level);
  $('#list').innerHTML = rows.map((s) => {
    const l = LEVELS[s.lvl];
    const arrow = s.trend > 0.3 ? '▲' : s.trend < -0.3 ? '▼' : '•';
    return `<li><button type="button" data-id="${s.id}" class="${s.id === selected ? 'sel' : ''}" style="--c:${l.color}">
      <span class="dot"></span>
      <span class="nm">${esc(s.name)}<small>${esc(s.en)}</small></span>
      <span class="lv">${Math.round(s.level)}<small>ซม. ${arrow}</small></span>
      <span class="bar"><span style="width:${Math.min(100, s.level / 50 * 100)}%"></span></span>
    </button></li>`;
  }).join('');
}

function renderLog() {
  $('#log').innerHTML = sim.log.slice(0, 9).map((e) => `<li style="--c:${LEVELS[e.lvl].color}"><time>${e.t}</time>${esc(e.text)}</li>`).join('') || '<li class="muted">ยังไม่มีเหตุการณ์</li>';
}

const chart = $('#chart');
function renderChart() {
  const dpr = devicePixelRatio || 1;
  const w = chart.clientWidth, h = chart.clientHeight;
  if (!w) return;
  if (chart.width !== w * dpr) { chart.width = w * dpr; chart.height = h * dpr; }
  const g = chart.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const top = 50;
  // เส้นระดับเตือนภัย
  g.font = '9px "JetBrains Mono", monospace';
  LEVELS.slice(1).forEach((l) => {
    const y = h - (l.min / top) * h;
    g.strokeStyle = l.color + '55'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    g.fillStyle = l.color + 'aa'; g.fillText(`${l.min}`, w - 16, y - 2);
  });
  g.setLineDash([]);
  const hist = sim.history, n = 90;
  const line = (key, color, fill) => {
    g.beginPath();
    hist.forEach((p, i) => {
      const x = (i + n - hist.length) / (n - 1) * w, y = h - Math.min(1, p[key] / top) * h;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = color; g.lineWidth = 1.6; g.stroke();
    if (fill && hist.length) {
      g.lineTo(w, h); g.lineTo((n - hist.length) / (n - 1) * w, h); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, color + '55'); gr.addColorStop(1, color + '00');
      g.fillStyle = gr; g.fill();
    }
  };
  line('avg', '#39d5ff', true);
  line('max', '#ff3b5c', false);
}

// ---------- เลือกจุด / การ์ดรายละเอียด ----------
let selected = null;
function select(id, fly) {
  selected = id;
  const s = state.find((x) => x.id === id);
  if (!s) { $('#detail').hidden = true; renderMarkers(); renderList(); return; }
  if (fly) {
    map.flyTo({ center: [s.lng, s.lat], zoom: 15.3, pitch: 64, bearing: map.getBearing() + 40, duration: reduceMotion ? 0 : 3500, essential: true });
  }
  renderDetail();
  renderMarkers();
  renderList();
}
function renderDetail() {
  const s = state.find((x) => x.id === selected);
  const card = $('#detail');
  if (!s) { card.hidden = true; return; }
  const l = LEVELS[s.lvl];
  card.hidden = false;
  card.style.setProperty('--c', l.color);
  card.querySelector('.d-name').textContent = s.name;
  card.querySelector('.d-en').textContent = `${s.en} · ${s.lat.toFixed(4)}°N ${s.lng.toFixed(4)}°E`;
  card.querySelector('.d-status').textContent = `${l.name} · ${l.en}`;
  card.querySelector('.d-level').textContent = s.level.toFixed(1);
  card.querySelector('.d-rain').textContent = s.rain.toFixed(1);
  const perHr = s.trend * (60 / SIM_MIN_PER_TICK);
  card.querySelector('.d-trend').textContent = `${perHr > 0 ? '+' : ''}${perHr.toFixed(1)}`;
  card.querySelector('.d-advice').textContent = l.advice;
  card.querySelector('.d-gauge span').style.height = `${Math.min(100, s.level / 50 * 100)}%`;
}

function renderAll() {
  renderClock(); renderStats(); renderList(); renderLog(); renderChart(); renderMarkers(); renderDetail();
  if (map.getSource('flood')) map.getSource('flood').setData(floodData());
  if (map.getSource('storm')) map.getSource('storm').setData(stormData());
}

// ---------- เรดาร์หมุน ----------
let sweepAngle = 0, lastFrame = 0;
function animate(t) {
  requestAnimationFrame(animate);
  if (hiddenByHost || t - lastFrame < 33) return; // ~30 fps พอ
  const dt = Math.min(100, t - lastFrame); lastFrame = t;
  if (!reduceMotion) sweepAngle = (sweepAngle + dt * 0.0012) % (Math.PI * 2);
  const src = map.getSource('radar-sweep');
  if (!src) return;
  // หางเรดาร์ไล่ความจางเป็นหลายชิ้น
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a1 = sweepAngle - i * 0.09, a0 = a1 - 0.09;
    parts.push(poly(sector(CENTER, 21000, a0, a1, 6), { o: 0.16 * (1 - i / 6) }));
  }
  src.setData(fc(parts));
}
requestAnimationFrame(animate);

// ---------- กล้อง: เปิดตัว + ทัวร์อัตโนมัติ ----------
const CITY_VIEW = { center: [100.556, 13.748], zoom: 12.4, pitch: 58, bearing: -28 };
let touring = false, tourTimer = null, tourIdx = 0, orbitRaf = null;
let userTookOver = false; // ผู้ใช้คลิก/ลากเองระหว่างฉากเปิด → ไม่เริ่มทัวร์อัตโนมัติ

function intro() {
  if (userTookOver) return; // ผู้ใช้เลือกจุดไปแล้วก่อนแผนที่โหลดเสร็จ — ไม่ดึงกล้องกลับ
  map.flyTo({ ...CITY_VIEW, duration: reduceMotion ? 0 : 5000, essential: true });
  map.once('moveend', () => { if (!reduceMotion && !userTookOver) startTour(); });
}
function cityView() {
  stopTour(); select(null);
  map.flyTo({ ...CITY_VIEW, duration: reduceMotion ? 0 : 2500, essential: true });
}
function nextTourStop() {
  // ไปจุดที่น้ำสูงก่อน (เตือนภัยขึ้นไป) ถ้าไม่มีให้วนจุดที่น้ำสูงสุด 5 อันดับ
  let pool = state.filter((s) => s.lvl >= 2).sort((a, b) => b.level - a.level);
  if (!pool.length) pool = [...state].sort((a, b) => b.level - a.level).slice(0, 5);
  // ทุก 4 จุด ถอยกลับไปมุมมองทั้งเมืองหนึ่งรอบ
  if (tourIdx % 5 === 4) {
    select(null);
    map.flyTo({ ...CITY_VIEW, bearing: map.getBearing() + 60, duration: 4500, essential: true });
  } else {
    const s = pool[tourIdx % pool.length];
    select(s.id, true);
  }
  tourIdx++;
  map.once('moveend', () => { if (touring) orbit(); });
}
function orbit() {
  // หมุนกล้องรอบจุดช้าๆ ระหว่างรอไปจุดถัดไป
  cancelAnimationFrame(orbitRaf);
  let last = performance.now();
  const step = (now) => {
    if (!touring) return;
    map.setBearing(map.getBearing() + (now - last) * 0.006);
    last = now;
    orbitRaf = requestAnimationFrame(step);
  };
  orbitRaf = requestAnimationFrame(step);
  clearTimeout(tourTimer);
  tourTimer = setTimeout(() => { cancelAnimationFrame(orbitRaf); if (touring) nextTourStop(); }, 7000);
}
function startTour() {
  touring = true;
  $('#btn-tour').classList.add('on');
  $('#btn-tour').setAttribute('aria-pressed', 'true');
  nextTourStop();
}
function stopTour() {
  userTookOver = true;
  if (!touring) return;
  touring = false;
  clearTimeout(tourTimer); cancelAnimationFrame(orbitRaf);
  $('#btn-tour').classList.remove('on');
  $('#btn-tour').setAttribute('aria-pressed', 'false');
}
// ผู้ใช้ลาก/ซูมเอง = หยุดทัวร์
['mousedown', 'touchstart', 'wheel'].forEach((ev) => map.getCanvas().addEventListener(ev, stopTour, { passive: true }));

// ---------- ปุ่มควบคุม ----------
$('#btn-tour').addEventListener('click', () => (touring ? stopTour() : (userTookOver = false, startTour())));
$('#btn-city').addEventListener('click', cityView);
$('#btn-3d').addEventListener('click', (e) => {
  stopTour();
  const flat = map.getPitch() > 5;
  map.easeTo({ pitch: flat ? 0 : 60, bearing: flat ? 0 : map.getBearing(), duration: 1200 });
  e.currentTarget.textContent = flat ? '3D' : '2D';
});
$('#btn-pause').addEventListener('click', (e) => {
  sim.paused = !sim.paused;
  e.currentTarget.textContent = sim.paused ? '▶ เล่นต่อ' : '⏸ หยุดจำลอง';
  e.currentTarget.classList.toggle('on', sim.paused);
});
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  stopTour(); select(b.dataset.id, true);
  document.body.classList.remove('show-right');
});
$('#detail .d-close').addEventListener('click', () => select(null));
map.on('click', () => { if (selected) select(null); });

// มือถือ: เปิด/ปิดแผงข้าง
document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
  const cls = b.dataset.toggle;
  const other = cls === 'show-left' ? 'show-right' : 'show-left';
  document.body.classList.remove(other);
  document.body.classList.toggle(cls);
}));

// ---------- วนการจำลอง ----------
pushLog('เริ่มระบบเฝ้าระวัง · เชื่อมต่อสถานีวัด 18 จุด', 0);
setInterval(() => { if (!hiddenByHost) { tick(); renderAll(); } }, 1000);
addEventListener('resize', renderChart);
