// EDIT HUD: แผง 01–05 สลับด้วยหน้าปัดหมุน · อากาศ/ฝน/ฝุ่นจริงจาก Open-Meteo (ฟรี ไม่ต้องใช้คีย์) · ทางลัดเปิดแอป
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- เก็บค่าในเครื่อง (Safari โหมดส่วนตัวอาจใช้ไม่ได้ → ไม่พัง) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('hud:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hud:' + k, JSON.stringify(v)); } catch { /* ไม่เป็นไร */ } },
};

// iPhone ผ่าน http ในวง LAN ขอตำแหน่ง GPS ไม่ได้ (ต้อง https) จึงให้เลือกเมืองเอง
const CITIES = [
  ['กรุงเทพฯ', 13.7563, 100.5018], ['นนทบุรี', 13.8621, 100.5144], ['ปทุมธานี', 14.0208, 100.5250],
  ['สมุทรปราการ', 13.5991, 100.5998], ['สมุทรสาคร', 13.5475, 100.2744], ['นครปฐม', 13.8199, 100.0621],
  ['ชลบุรี', 13.3611, 100.9847], ['ระยอง', 12.6814, 101.2816], ['อยุธยา', 14.3532, 100.5689],
  ['นครราชสีมา', 14.9799, 102.0978], ['ขอนแก่น', 16.4419, 102.8360], ['อุดรธานี', 17.4138, 102.7872],
  ['เชียงใหม่', 18.7883, 98.9853], ['เชียงราย', 19.9105, 99.8406], ['พิษณุโลก', 16.8211, 100.2659],
  ['หาดใหญ่', 7.0084, 100.4747], ['ภูเก็ต', 7.8804, 98.3923], ['สุราษฎร์ธานี', 9.1382, 99.3215],
];

// ---------- ธีม / ชื่อ / เมือง ----------
const body = document.body;
body.dataset.theme = store.get('theme', 'jarvis');
$('#reactor').addEventListener('click', () => {
  body.dataset.theme = body.dataset.theme === 'jarvis' ? 'mark' : 'jarvis';
  store.set('theme', body.dataset.theme);
  renderWeather();
});

let userName = store.get('name', 'SIR');
$('#name').textContent = userName;
$('#name-btn').addEventListener('click', () => {
  const v = prompt('ให้ EDIT เรียกคุณว่าอะไร?', userName);
  if (v && v.trim()) { userName = v.trim().slice(0, 18).toUpperCase(); $('#name').textContent = userName; store.set('name', userName); }
});

// GPS ใช้ได้เฉพาะเปิดผ่าน https (เช่นบน GitHub Pages) — เปิดผ่าน http ในวง LAN จะไม่มีตัวเลือกนี้
const CAN_GPS = window.isSecureContext && 'geolocation' in navigator;
const citySel = $('#city');
citySel.innerHTML = (CAN_GPS ? '<option value="gps">📍 ตำแหน่งปัจจุบัน</option>' : '')
  + CITIES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('');
{
  const saved = String(store.get('city', CAN_GPS ? 'gps' : 0));
  citySel.value = [...citySel.options].some((o) => o.value === saved) ? saved : '0';
}
citySel.addEventListener('change', () => { store.set('city', citySel.value); loadWeather(); });

/** ข้อความแจ้งเตือนสั้นๆ ที่หายไปเอง */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 7000);
}

/** ตำแหน่งที่จะดึงอากาศ: [ชื่อ, lat, lon] */
function getPlace() {
  if (citySel.value !== 'gps') return Promise.resolve(CITIES[+citySel.value]);
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => resolve(['ตำแหน่งปัจจุบัน', +p.coords.latitude.toFixed(3), +p.coords.longitude.toFixed(3)]),
    () => {
      // ไม่อนุญาต/หาไม่เจอ → กลับไปใช้กรุงเทพฯ (แจ้งแบบไม่บล็อกหน้าจอ ไม่ใช้ alert)
      toast('ใช้ตำแหน่งไม่ได้ จึงเปลี่ยนเป็นกรุงเทพฯ ให้ก่อน · เปิดได้ที่ ตั้งค่า → ความเป็นส่วนตัว → บริการหาตำแหน่ง → Safari');
      citySel.value = '0'; store.set('city', '0');
      resolve(CITIES[0]);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
  ));
}

// ---------- เครื่องมือวาด SVG ----------
const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };
const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// ---------- 01 วงเตาปฏิกรณ์ ----------
const svg = $('#reactor-svg');
const C = 160;
const stroke = (w, o = 1, extra = {}) => ({ fill: 'none', stroke: 'var(--hud)', 'stroke-width': w, 'stroke-opacity': o, ...extra });
const gOuter = mk('g', {}, svg);
for (let i = 0; i < 120; i++) {
  const long = i % 10 === 0;
  const [x0, y0] = polar(C, C, 156, i * 3), [x1, y1] = polar(C, C, long ? 145 : 150, i * 3);
  mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, ...stroke(long ? 1.6 : 0.8, long ? 0.9 : 0.45) }, gOuter);
}
const secTicks = [];
for (let i = 0; i < 60; i++) {
  const [x0, y0] = polar(C, C, 138, i * 6), [x1, y1] = polar(C, C, 128, i * 6);
  secTicks.push(mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, ...stroke(2.4, 0.15), 'stroke-linecap': 'round' }, svg));
}
mk('circle', { cx: C, cy: C, r: 118, ...stroke(5, 0.1) }, svg);
const dayArc = mk('path', { ...stroke(5, 0.95), 'stroke-linecap': 'round' }, svg);
mk('circle', { cx: C, cy: C, r: 110, ...stroke(1.5, 0.12) }, svg);
const yearArc = mk('path', { fill: 'none', stroke: 'var(--acc)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, svg);
const gMid = mk('g', {}, svg);
[[0, 70], [90, 150], [180, 250], [270, 330]].forEach(([a, b]) => mk('path', { d: arc(C, C, 100, a, b), ...stroke(3, 0.75) }, gMid));
[[20, 40], [200, 220]].forEach(([a, b]) => mk('path', { d: arc(C, C, 94, a, b), fill: 'none', stroke: 'var(--acc)', 'stroke-width': 3 }, gMid));
const gInner = mk('g', {}, svg);
mk('circle', { cx: C, cy: C, r: 86, ...stroke(1, 0.6), 'stroke-dasharray': '2 6' }, gInner);
[[0, 30], [120, 150], [240, 270]].forEach(([a, b]) => mk('path', { d: arc(C, C, 80, a, b), ...stroke(1.5, 0.9) }, gInner));
const secHand = mk('path', { d: 'M160 14 L155 4 L165 4 Z', fill: 'var(--acc)' }, svg);
const glow = mk('radialGradient', { id: 'glow' }, mk('defs', {}, svg));
mk('stop', { offset: '0', 'stop-color': 'var(--hud)', 'stop-opacity': '0.28' }, glow);
mk('stop', { offset: '1', 'stop-color': 'var(--hud)', 'stop-opacity': '0' }, glow);
mk('circle', { cx: C, cy: C, r: 76, fill: 'url(#glow)' }, svg);

// ---------- นาฬิกา ----------
const thDate = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');
let lastSec = -1;
function greet(h) {
  if (h < 5) return ['GOOD NIGHT', 'ดึกแล้ว พักผ่อนบ้างนะ'];
  if (h < 12) return ['GOOD MORNING', 'สวัสดีตอนเช้า'];
  if (h < 17) return ['GOOD AFTERNOON', 'สวัสดีตอนบ่าย'];
  if (h < 21) return ['GOOD EVENING', 'สวัสดีตอนเย็น'];
  return ['GOOD NIGHT', 'สวัสดีตอนค่ำ'];
}
function tickClock(now) {
  const s = now.getSeconds();
  if (s === lastSec) return;
  lastSec = s;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  $('#hhmm').textContent = hhmm;
  $('#apps-time').textContent = hhmm;
  $('#ss').textContent = pad(s);
  $('#date').textContent = thDate.format(now);
  secTicks.forEach((t, i) => t.setAttribute('stroke-opacity', i <= s ? 0.95 : 0.15));
  const [en, th] = greet(now.getHours());
  $('#name-btn').firstChild.textContent = `${en}, `;
  $('#greet-th').textContent = th;
  const dayFrac = (now.getHours() * 3600 + now.getMinutes() * 60 + s) / 86400;
  const y0 = new Date(now.getFullYear(), 0, 1), y1 = new Date(now.getFullYear() + 1, 0, 1);
  const yearFrac = (now - y0) / (y1 - y0);
  dayArc.setAttribute('d', arc(C, C, 118, 0, Math.max(0.5, dayFrac * 359.9)));
  yearArc.setAttribute('d', arc(C, C, 110, 0, Math.max(0.5, yearFrac * 359.9)));
  $('#day-pct').textContent = `${(dayFrac * 100).toFixed(0)}%`;
  $('#year-pct').textContent = `${(yearFrac * 100).toFixed(1)}%`;
}

const t0 = performance.now();
function frame(t) {
  const now = new Date();
  tickClock(now);
  if (current === 0 || DESKTOP.matches) { // วงหมุนเฉพาะตอนเห็นหน้าหลัก ประหยัดแบต
    if (!reduceMotion) {
      const k = (t - t0) / 1000;
      gOuter.setAttribute('transform', `rotate(${(k * 3) % 360} ${C} ${C})`);
      gMid.setAttribute('transform', `rotate(${(-k * 9) % 360} ${C} ${C})`);
      gInner.setAttribute('transform', `rotate(${(k * 24) % 360} ${C} ${C})`);
    }
    secHand.setAttribute('transform', `rotate(${(now.getSeconds() + now.getMilliseconds() / 1000) * 6} ${C} ${C})`);
  }
  requestAnimationFrame(frame);
}

// ---------- แผง + หน้าปัดหมุน ----------
const PANELS = [
  { id: 'p-home', en: 'HOME', th: 'หน้าหลัก' },
  { id: 'p-rain', en: 'RAIN', th: 'ฝน' },
  { id: 'p-air', en: 'AIR', th: 'ฝุ่น' },
  { id: 'p-week', en: 'FCST', th: 'พยากรณ์' },
  { id: 'p-apps', en: 'APPS', th: 'แอป' },
  { id: 'p-flood', en: 'FLOOD', th: 'น้ำท่วม' },
];
const FLOOD_IDX = 5;
const STEP = 22;           // องศาระหว่างหมายเลขบนหน้าปัด
const PX_PER_ITEM = 260 * STEP * Math.PI / 180; // ลากนิ้วเท่านี้ = เลื่อน 1 ช่อง
let current = 0, dialPos = 0, tween = null;
// คอม/จอกว้าง = แดชบอร์ดเห็นทุกแผง · มือถือแนวนอน = หน้าปัดตั้งด้านขวา (ต้องตรงกับ @media ใน hud.css)
const DESKTOP = matchMedia('(min-width: 1100px) and (min-height: 600px)');
const LANDSCAPE = matchMedia('(orientation: landscape) and (max-height: 520px)');
const dialItems = $('#dial-items'), dialRing = $('#dial-ring');
dialItems.innerHTML = PANELS.map((p, i) => `<button type="button" class="dial-item" data-i="${i}" aria-label="${p.th}"><span class="dl"><b>${pad(i + 1)}</b><small>${p.th}</small></span></button>`).join('');
const dialBtns = $$('.dial-item');

function renderDial() {
  // แนวนอนกลับทิศ เพื่อให้แผงถัดไปอยู่ "ด้านล่าง" (หน้าปัดถูกหมุน -90°)
  const dir = LANDSCAPE.matches ? -1 : 1;
  dialBtns.forEach((b, i) => {
    const d = i - dialPos;
    b.style.setProperty('--a', `${d * STEP * dir}deg`);
    b.style.opacity = Math.max(0, 1 - Math.abs(d) * 0.3);
    b.classList.toggle('on', Math.round(dialPos) === i);
  });
  dialRing.style.transform = `rotate(${-dialPos * STEP * dir}deg)`;
}
LANDSCAPE.addEventListener('change', renderDial);
DESKTOP.addEventListener('change', () => { syncFlood(current === FLOOD_IDX); drawHourly(); });
function animateDial(to) {
  cancelAnimationFrame(tween);
  const from = dialPos, start = performance.now(), dur = reduceMotion ? 0 : 260;
  const step = (t) => {
    const k = dur ? Math.min(1, (t - start) / dur) : 1;
    dialPos = from + (to - from) * (1 - Math.pow(1 - k, 3));
    renderDial();
    if (k < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}
function go(i) {
  i = Math.max(0, Math.min(PANELS.length - 1, i));
  if (DESKTOP.matches && current !== i && PANELS[i]) { // คอม: ทุกแผงแสดงอยู่แล้ว แค่เลื่อนไปหา
    document.getElementById(PANELS[i].id).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const back = i < current;
  current = i;
  PANELS.forEach((p, k) => {
    const el = document.getElementById(p.id);
    el.classList.toggle('on', k === i);
    el.classList.toggle('from-left', k === i && back);
  });
  animateDial(i);
  window.scrollTo({ top: 0 });
  if (i === 3) drawHourly(); // ต้องวัดขนาดตอนแผงแสดงอยู่
  syncFlood(i === FLOOD_IDX);
}

// แผนที่น้ำท่วม: โหลดครั้งแรกเมื่อเปิดแผง (ประหยัดเน็ต/แบต) และสั่งให้หยุดเมื่อออกจากแผง
const floodFrame = $('#flood-frame');
function syncFlood(visible) {
  visible = visible || DESKTOP.matches; // คอมเห็นแผนที่ตลอด
  if (visible && !floodFrame.src) floodFrame.src = '../bkk-flood/?embed=1';
  if (floodFrame.src) floodFrame.contentWindow?.postMessage({ floodVisible: visible }, location.origin);
}
floodFrame.addEventListener('load', () => syncFlood(current === FLOOD_IDX)); // เผื่อออกจากแผงก่อนโหลดเสร็จ

// ลากหน้าปัด
const dial = $('#dial');
let drag = null;
dial.addEventListener('pointerdown', (e) => {
  cancelAnimationFrame(tween);
  drag = { x: e.clientX, y: e.clientY, pos: dialPos, moved: 0, target: e.target.closest('.dial-item') };
  dial.setPointerCapture(e.pointerId);
});
dial.addEventListener('pointermove', (e) => {
  if (!drag) return;
  // แนวตั้ง: ลากซ้าย = ถัดไป · แนวนอน (หน้าปัดด้านขวา): ลากขึ้น = ถัดไป
  const delta = LANDSCAPE.matches ? e.clientY - drag.y : e.clientX - drag.x;
  drag.moved = Math.max(drag.moved, Math.abs(delta));
  dialPos = Math.max(-0.4, Math.min(PANELS.length - 0.6, drag.pos - delta / PX_PER_ITEM));
  renderDial();
});
const endDrag = () => {
  if (!drag) return;
  if (drag.moved < 6) go(drag.target ? +drag.target.dataset.i : current); // แตะ
  else go(Math.round(dialPos));                                          // ลากแล้วปล่อย → ไปช่องที่ใกล้สุด
  drag = null;
};
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);

// ปัดซ้าย-ขวาบนเนื้อหาเพื่อเปลี่ยนแผง
let sw = null;
$('#stage').addEventListener('touchstart', (e) => { const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY }; }, { passive: true });
$('#stage').addEventListener('touchend', (e) => {
  if (!sw) return;
  const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
  sw = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
}, { passive: true });
addEventListener('keydown', (e) => {
  if (DESKTOP.matches || (e.target instanceof Element && e.target.closest('input, select, textarea'))) return;
  if (e.key === 'ArrowRight') go(current + 1);
  if (e.key === 'ArrowLeft') go(current - 1);
});
$$('[data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));

// ---------- ไอคอน ----------
const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  partly: '<path d="M8 4v1.5M3.5 8H2M4.6 4.6l1 1M13 6.5A4 4 0 0 0 5 8"/><path d="M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.2 3.2 0 0 0 7 19z"/>',
  cloud: '<path d="M6.5 19h11a4.5 4.5 0 0 0 .3-9A6.5 6.5 0 0 0 5.4 11.6 3.8 3.8 0 0 0 6.5 19z"/>',
  fog: '<path d="M4 9h16M2 13h20M5 17h14"/>',
  rain: '<path d="M6.5 15h11a4.5 4.5 0 0 0 .3-9A6.5 6.5 0 0 0 5.4 7.6 3.8 3.8 0 0 0 6.5 15z"/><path class="accent" d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  storm: '<path d="M6.5 14h11a4.5 4.5 0 0 0 .3-9A6.5 6.5 0 0 0 5.4 6.6 3.8 3.8 0 0 0 6.5 14z"/><path class="accent" d="M12.5 15l-2.5 4h3l-2 4"/>',
  // ไอคอนแอป
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path class="accent" d="M10 9l5 3-5 3z"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path class="accent" d="M21 16l-5-5-8 8"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path class="accent" d="M8 14h3v3H8z"/>',
  bolt: '<path class="accent" d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 11h8M8 15h8"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path class="accent" d="M16 5a3 3 0 0 1 0 6M18 20a5 5 0 0 0-2-4"/>',
  msg: '<path d="M4 5h16v11H8l-4 4z"/><path class="accent" d="M8 10h.01M12 10h.01M16 10h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${ICON[k] || ICON.star}</svg>`;

function wmo(code, isDay = 1) {
  if (code === 0) return ['ท้องฟ้าแจ่มใส', isDay ? 'sun' : 'moon'];
  if (code === 1) return ['ค่อนข้างแจ่มใส', isDay ? 'sun' : 'moon'];
  if (code === 2) return ['มีเมฆบางส่วน', 'partly'];
  if (code === 3) return ['เมฆมาก', 'cloud'];
  if (code === 45 || code === 48) return ['มีหมอก', 'fog'];
  if (code >= 51 && code <= 57) return ['ฝนปรอย', 'rain'];
  if (code === 61 || code === 80) return ['ฝนเล็กน้อย', 'rain'];
  if (code === 63 || code === 81) return ['ฝนปานกลาง', 'rain'];
  if (code === 65 || code === 82 || code === 66 || code === 67) return ['ฝนตกหนัก', 'rain'];
  if (code >= 95) return ['พายุฝนฟ้าคะนอง', 'storm'];
  return ['มีเมฆ', 'cloud'];
}

// ระดับฝุ่นจากค่า PM2.5 (µg/m³) ตามเกณฑ์ US AQI ปี 2024 + คำแนะนำภาษาไทย
const PM_LEVELS = [
  { max: 9,   name: 'ดี',                    color: '#2ee6a6', advice: 'อากาศดี ทำกิจกรรมกลางแจ้งได้ตามปกติ' },
  { max: 35.4, name: 'ปานกลาง',               color: '#ffd23f', advice: 'คนทั่วไปทำกิจกรรมได้ปกติ ผู้ที่แพ้ง่ายควรสังเกตอาการ' },
  { max: 55.4, name: 'เริ่มมีผลต่อกลุ่มเสี่ยง', color: '#ff8a3d', advice: 'เด็ก ผู้สูงอายุ ผู้มีโรคระบบหายใจ ควรลดเวลากลางแจ้ง และสวมหน้ากาก N95' },
  { max: 125.4, name: 'มีผลต่อสุขภาพ',         color: '#ff3b5c', advice: 'ทุกคนควรสวมหน้ากาก N95 เมื่อออกนอกอาคาร และงดออกกำลังกายกลางแจ้ง' },
  { max: Infinity, name: 'อันตราย',            color: '#b06bff', advice: 'งดออกนอกอาคาร ปิดประตูหน้าต่าง เปิดเครื่องฟอกอากาศถ้ามี' },
];
const pmLevel = (pm) => PM_LEVELS.find((l) => pm <= l.max);
const TH_PM_STD = 37.5; // มาตรฐานไทย PM2.5 เฉลี่ย 24 ชม. (ปรับใหม่ปี 2566)

function moonPhase(d) {
  const age = ((d - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588853;
  const a = age < 0 ? age + 29.530588853 : age;
  const day = Math.floor(a);
  if (a < 1 || a > 28.5) return 'เดือนมืด (จันทร์ดับ)';
  if (Math.abs(a - 14.77) < 1) return 'จันทร์เต็มดวง (ขึ้น 15 ค่ำ)';
  return a < 14.77 ? `ข้างขึ้น ${day} ค่ำ` : `ข้างแรม ${Math.max(1, day - 14)} ค่ำ`;
}

// ---------- วงเกจ (ใช้ทั้งแผงฝนและฝุ่น) ----------
const GAUGE_SPAN = 270, G0 = -135;
function drawGauge(svgEl, frac, color, bands) {
  svgEl.innerHTML = '';
  const cx = 100, cy = 100;
  if (bands) bands.forEach(([a, b, c]) => mk('path', { d: arc(cx, cy, 84, G0 + a * GAUGE_SPAN, G0 + b * GAUGE_SPAN), fill: 'none', stroke: c, 'stroke-width': 4, 'stroke-opacity': 0.35 }, svgEl));
  else mk('path', { d: arc(cx, cy, 84, G0, G0 + GAUGE_SPAN), fill: 'none', stroke: 'var(--hud)', 'stroke-width': 4, 'stroke-opacity': 0.15 }, svgEl);
  const f = Math.max(0.004, Math.min(1, frac));
  mk('path', { d: arc(cx, cy, 84, G0, G0 + f * GAUGE_SPAN), fill: 'none', stroke: color, 'stroke-width': 8, 'stroke-linecap': 'round' }, svgEl);
  const [mx, my] = polar(cx, cy, 84, G0 + f * GAUGE_SPAN);
  mk('circle', { cx: mx, cy: my, r: 6, fill: '#fff' }, svgEl);
  for (let i = 0; i <= 54; i++) { // ขีดสเกลด้านใน
    const a = G0 + (i / 54) * GAUGE_SPAN, long = i % 9 === 0;
    const [x0, y0] = polar(cx, cy, 72, a), [x1, y1] = polar(cx, cy, long ? 64 : 68, a);
    mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'var(--hud)', 'stroke-width': long ? 1.4 : 0.7, 'stroke-opacity': long ? 0.8 : 0.4 }, svgEl);
  }
  mk('circle', { cx, cy, r: 92, fill: 'none', stroke: 'var(--hud)', 'stroke-width': 0.8, 'stroke-opacity': 0.4, 'stroke-dasharray': '1 5' }, svgEl);
}

// ---------- ดึงข้อมูล ----------
let wx = store.get('wx2', null);
const hm = (iso) => (iso ? iso.slice(11, 16) : '--:--');
const dayName = new Intl.DateTimeFormat('th-TH', { weekday: 'short' });

async function loadWeather() {
  const [place, lat, lon] = await getPlace();
  const q = `latitude=${lat}&longitude=${lon}&timezone=Asia%2FBangkok`;
  try {
    const [f, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,precipitation_hours&forecast_days=7&forecast_hours=24`).then((r) => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5,us_aqi&hourly=pm2_5&past_days=1&forecast_days=5`).then((r) => r.json()).catch(() => null),
    ]);
    if (!f.current) throw new Error(f.reason || 'no data');
    wx = { f, a: a && a.current ? a : null, city: citySel.value, place, at: Date.now() };
    store.set('wx2', wx);
    $('#net').textContent = 'ONLINE';
  } catch {
    $('#net').textContent = 'OFFLINE';
  }
  renderWeather();
}

function renderWeather() {
  if (!wx || String(wx.city) !== citySel.value) { $('#updated').textContent = 'ยังไม่มีข้อมูลอากาศ (ต้องต่ออินเทอร์เน็ต)'; return; }
  renderHome(); renderRain(); renderAir(); renderWeek(); drawHourly();
  const ago = Math.round((Date.now() - wx.at) / 60000);
  $('#updated').textContent = `${wx.place || CITIES[+wx.city]?.[0] || ''} · อัปเดต ${new Date(wx.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}${ago > 30 ? ` (${ago} นาทีที่แล้ว)` : ''}`;
}

function renderHome() {
  const c = wx.f.current;
  $('#temp').textContent = Math.round(c.temperature_2m);
  $('#feels').textContent = `รู้สึกเหมือน ${Math.round(c.apparent_temperature)}°`;
  $('#cond-mini').textContent = `${wmo(c.weather_code, c.is_day)[0]} · ${Math.round(c.temperature_2m)}°C`;
  const rp = wx.f.hourly.precipitation_probability[0] ?? 0;
  $('#rain-now').textContent = rp;
  $('#rain-now-bar').style.width = `${rp}%`;
  if (wx.a) {
    const pm = wx.a.current.pm2_5, lv = pmLevel(pm);
    body.style.setProperty('--aq', lv.color);
    $('#pm').textContent = Math.round(pm);
    $('#aqi-txt').textContent = lv.name;
  }
}

// ---------- 02 ฝน ----------
const rainColor = (p) => (p >= 60 ? 'var(--acc)' : p >= 30 ? 'var(--hud)' : 'rgba(var(--hud-rgb), 0.35)');
function renderRain() {
  const h = wx.f.hourly, probs = h.precipitation_probability.slice(0, 24), mm = h.precipitation.slice(0, 24), times = h.time.slice(0, 24);
  const now = probs[0] ?? 0;
  $('#rain-big').textContent = now;
  drawGauge($('#rain-ring'), now / 100, now >= 60 ? 'var(--acc)' : 'var(--hud)');

  // สรุปช่วงที่ฝนน่าจะตก: หาช่วงต่อเนื่องแรกที่โอกาส ≥ 60%
  const max = Math.max(...probs), iMax = probs.indexOf(max);
  const total = mm.reduce((s, v) => s + (v || 0), 0);
  let text;
  const s = probs.findIndex((p) => p >= 60);
  if (s >= 0) {
    let e = s; while (e + 1 < probs.length && probs[e + 1] >= 60) e++;
    const endT = new Date(new Date(times[e]).getTime() + 3600000);
    text = `ช่วงเสี่ยงฝนตก <b>${s === 0 ? 'ตอนนี้' : hm(times[s])}–${pad(endT.getHours())}:00</b> โอกาสสูงสุด <b>${max}%</b>`;
    if (s <= 3) text += '<br>☂ ออกจากบ้านพกร่มด้วยนะ';
  } else if (max >= 40) {
    text = `อาจมีฝนช่วง <b>${hm(times[iMax])}</b> (โอกาส ${max}%)`;
  } else {
    text = '24 ชม. ข้างหน้าโอกาสฝนต่ำ ไม่ต้องพกร่ม';
  }
  text += `<br><small style="color:var(--muted)">ปริมาณฝนรวม 24 ชม. ประมาณ ${total.toFixed(1)} มม.</small>`;
  $('#rain-summary').innerHTML = text;

  $('#rain-bars').innerHTML = probs.map((p, i) => `<span class="${i === 0 ? 'now' : ''}" style="height:${Math.max(2, p)}%;--c:${rainColor(p)}" title="${hm(times[i])} ${p}%"></span>`).join('');
  $('#rain-axis').innerHTML = times.map((t, i) => `<span>${i % 6 ? '' : i === 0 ? 'NOW' : hm(t)}</span>`).join('');

  const d = wx.f.daily;
  $('#rain-days').innerHTML = d.time.map((t, i) => {
    const p = d.precipitation_probability_max[i] ?? 0;
    return `<div class="row${i === 0 ? ' today' : ''}"><span class="rd">${i === 0 ? 'วันนี้' : dayName.format(new Date(t + 'T12:00'))}</span>
      <span class="rt"><span style="width:${p}%;--c:${rainColor(p)}"></span></span>
      <span class="rv">${p}% <small>${(d.precipitation_sum[i] ?? 0).toFixed(1)} มม.</small></span></div>`;
  }).join('');
}

// ---------- 03 ฝุ่น ----------
function renderAir() {
  if (!wx.a) { $('#air-advice').textContent = 'ดึงข้อมูลฝุ่นไม่สำเร็จ ลองใหม่ภายหลัง'; return; }
  const cur = wx.a.current, pm = cur.pm2_5, lv = pmLevel(pm);
  body.style.setProperty('--aq', lv.color);
  $('#pm-big').textContent = Math.round(pm);
  $('#aqi-big').textContent = `${lv.name} · AQI ${cur.us_aqi}`;
  const bands = [[0, 9 / 150, '#2ee6a6'], [9 / 150, 35.4 / 150, '#ffd23f'], [35.4 / 150, 55.4 / 150, '#ff8a3d'], [55.4 / 150, 125.4 / 150, '#ff3b5c'], [125.4 / 150, 1, '#b06bff']];
  drawGauge($('#air-ring'), pm / 150, lv.color, bands);
  $('#air-advice').innerHTML = `<b>${lv.name}</b><br>${lv.advice}`;

  // ค่าเฉลี่ย 24 ชม. ย้อนหลัง (เทียบมาตรฐานไทยซึ่งเป็นค่าเฉลี่ย 24 ชม.)
  const h = wx.a.hourly;
  const nowIdx = Math.max(0, h.time.indexOf(cur.time.slice(0, 13) + ':00'));
  const past = h.pm2_5.slice(Math.max(0, nowIdx - 23), nowIdx + 1).filter((v) => v != null);
  const avg24 = past.reduce((s, v) => s + v, 0) / (past.length || 1);
  $('#std-bar').style.width = `${Math.min(100, avg24 / (TH_PM_STD * 2) * 100)}%`;
  $('#std-txt').innerHTML = `เฉลี่ย 24 ชม. ที่ผ่านมา <b>${avg24.toFixed(1)}</b> µg/m³ · ${avg24 <= TH_PM_STD ? 'ไม่เกินมาตรฐาน ✓' : `<b>เกินมาตรฐาน ${(avg24 / TH_PM_STD * 100 - 100).toFixed(0)}%</b>`}`;

  // 24 ชม. ข้างหน้า
  const next = h.pm2_5.slice(nowIdx, nowIdx + 24), nt = h.time.slice(nowIdx, nowIdx + 24);
  const top = Math.max(40, ...next.filter((v) => v != null)) * 1.1;
  $('#air-bars').innerHTML = next.map((v, i) => v == null ? '<span style="height:2%"></span>'
    : `<span class="${i === 0 ? 'now' : ''}" style="height:${Math.max(2, v / top * 100)}%;--c:${pmLevel(v).color}" title="${hm(nt[i])} ${v}"></span>`).join('');
  $('#air-axis').innerHTML = nt.map((t, i) => `<span>${i % 6 ? '' : i === 0 ? 'NOW' : hm(t)}</span>`).join('');

  // รายวัน (วันนี้เป็นต้นไป)
  const today = cur.time.slice(0, 10), byDay = new Map();
  h.time.forEach((t, i) => { const d = t.slice(0, 10); if (d >= today && h.pm2_5[i] != null) (byDay.get(d) || byDay.set(d, []).get(d)).push(h.pm2_5[i]); });
  const maxAll = Math.max(40, ...[...byDay.values()].flat());
  $('#air-days').innerHTML = [...byDay].slice(0, 5).map(([d, vals], i) => {
    const av = vals.reduce((s, v) => s + v, 0) / vals.length, mx = Math.max(...vals);
    return `<div class="row${i === 0 ? ' today' : ''}"><span class="rd">${i === 0 ? 'วันนี้' : dayName.format(new Date(d + 'T12:00'))}</span>
      <span class="rt"><span style="width:${av / maxAll * 100}%;--c:${pmLevel(av).color}"></span></span>
      <span class="rv">${av.toFixed(0)} <small>สูงสุด ${mx.toFixed(0)}</small></span></div>`;
  }).join('');
}

// ---------- 04 พยากรณ์ ----------
function renderWeek() {
  const c = wx.f.current, d = wx.f.daily;
  $('#humid').textContent = `${Math.round(c.relative_humidity_2m)}%`;
  $('#wind').textContent = `${Math.round(c.wind_speed_10m)} กม./ชม.`;
  $('#sunrise').textContent = hm(d.sunrise[0]);
  $('#sunset').textContent = hm(d.sunset[0]);
  $('#uv').textContent = d.uv_index_max[0] != null ? d.uv_index_max[0].toFixed(0) : '--';
  $('#days').innerHTML = d.time.map((t, i) => {
    const [txtD, ic] = wmo(d.weather_code[i], 1);
    return `<div class="day${i === 0 ? ' today' : ''}" title="${txtD}">
      <span class="dn">${i === 0 ? 'วันนี้' : dayName.format(new Date(t + 'T12:00'))}</span>${icon(ic)}
      <span class="hi">${Math.round(d.temperature_2m_max[i])}°</span><span class="lo">${Math.round(d.temperature_2m_min[i])}°</span>
      <span class="rp">${d.precipitation_probability_max[i] ?? 0}%</span></div>`;
  }).join('');
}
function drawHourly() {
  const g = $('#hourly');
  if (!wx || String(wx.city) !== citySel.value) return;
  const h = wx.f.hourly;
  const temps = h.temperature_2m.slice(0, 13), rain = h.precipitation_probability.slice(0, 13), times = h.time.slice(0, 13);
  const W = 360, H = 96, top = 14, bottom = 78;
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const x = (i) => W * (i + 0.5) / temps.length;
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const bars = rain.map((p, i) => `<rect x="${x(i) - 5}" y="${H - (p / 100) * 30}" width="10" height="${(p / 100) * 30}" fill="var(--acc)" opacity="0.35"/>`).join('');
  const pts = temps.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const labels = temps.map((v, i) => (i % 3 === 0 ? `<text x="${x(i)}" y="${y(v) - 6}" text-anchor="middle" font-size="10" fill="#fff" font-family="Share Tech Mono, monospace">${Math.round(v)}°</text>` : '')).join('');
  const dots = temps.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === 0 ? 3.5 : 2}" fill="${i === 0 ? '#fff' : 'var(--hud)'}"/>`).join('');
  g.innerHTML = `${bars}<polyline points="${pts}" fill="none" stroke="var(--hud)" stroke-width="1.8"/>${dots}${labels}`;
  $('#hours').style.gridTemplateColumns = `repeat(${times.length}, 1fr)`;
  $('#hours').innerHTML = times.map((t, i) => `<span>${i % 3 ? '' : i === 0 ? 'NOW' : hm(t)}</span>`).join('');
}

// ---------- 05 ทางลัดแอป ----------
// ลิงก์เปิดแอปบน iPhone (URL scheme) — แก้ไขเองได้ในแอป
const DEFAULT_APPS = [
  { name: 'LINE', url: 'line://', icon: 'chat' },
  { name: 'YouTube', url: 'youtube://', icon: 'play' },
  { name: 'แผนที่', url: 'maps://', icon: 'map' },
  { name: 'รูปภาพ', url: 'photos-redirect://', icon: 'photo' },
  { name: 'ปฏิทิน', url: 'calshow://', icon: 'cal' },
  { name: 'Shortcuts', url: 'shortcuts://', icon: 'bolt' },
  { name: 'โน้ต', url: 'mobilenotes://', icon: 'note' },
  { name: 'Facebook', url: 'fb://', icon: 'people' },
  { name: 'ข้อความ', url: 'sms:', icon: 'msg' },
  { name: 'Google', url: 'https://www.google.com', icon: 'globe' },
];
let apps = store.get('apps', DEFAULT_APPS);
let editing = false;
const SAFE_URL = /^(?!javascript:|data:|vbscript:)[a-z][a-z0-9+.-]*:/i;

function renderApps() {
  const box = $('#apps');
  box.querySelectorAll('.app').forEach((a) => a.remove());
  const n = apps.length;
  apps.forEach((a, i) => {
    const ang = (i / n) * 360;
    const [x, y] = polar(50, 50, 41, ang); // เปอร์เซ็นต์ของกล่อง
    const el = document.createElement('a');
    el.className = 'app';
    el.href = SAFE_URL.test(a.url) ? a.url : '#';
    if (/^https?:/i.test(a.url)) { el.target = '_blank'; el.rel = 'noopener'; }
    el.style.left = `${x}%`; el.style.top = `${y}%`;
    el.innerHTML = `<i>${icon(a.icon)}</i><b>${esc(a.name)}</b>`;
    el.addEventListener('click', (e) => { if (editing) { e.preventDefault(); editApp(i); } });
    box.append(el);
  });
  box.classList.toggle('editing', editing);
}
function editApp(i) {
  const a = apps[i];
  const name = prompt('ชื่อทางลัด (เว้นว่างเพื่อลบ)', a.name);
  if (name === null) return;
  if (!name.trim()) { if (confirm(`ลบ "${a.name}"?`)) { apps.splice(i, 1); save(); } return; }
  const url = prompt('ลิงก์เปิดแอป เช่น line:// youtube:// tel:0812345678 หรือ https://...', a.url);
  if (url === null) return;
  if (!SAFE_URL.test(url.trim())) { alert('ลิงก์ต้องขึ้นต้นด้วยชื่อแอปแล้วตามด้วย : เช่น line:// หรือ https://'); return; }
  apps[i] = { ...a, name: name.trim().slice(0, 14), url: url.trim() };
  save();
}
function save() { store.set('apps', apps); renderApps(); }
$('#apps-edit').addEventListener('click', (e) => {
  editing = !editing;
  e.currentTarget.setAttribute('aria-pressed', String(editing));
  e.currentTarget.textContent = editing ? '✓ เสร็จ' : '✎ แก้ไขทางลัด';
  $('#apps-hint').innerHTML = editing
    ? 'แตะไอคอนเพื่อเปลี่ยนชื่อ/ลิงก์ หรือลบ · ' + (apps.length < 12 ? '<a href="#" id="apps-add">+ เพิ่มทางลัด</a>' : 'ครบ 12 อันแล้ว')
    : 'ครั้งแรก iPhone จะถามว่า "เปิดในแอป…?" ให้กด <b>เปิด</b> · แอปที่ไม่ได้ติดตั้งจะเปิดไม่ได้';
  $('#apps-add')?.addEventListener('click', (ev) => { ev.preventDefault(); apps.push({ name: 'ใหม่', url: 'https://', icon: 'star' }); save(); editApp(apps.length - 1); });
  renderApps();
});
$('#apps-reset').addEventListener('click', () => { if (confirm('คืนทางลัดเป็นค่าเริ่มต้น?')) { apps = DEFAULT_APPS.map((a) => ({ ...a })); save(); } });

// ---------- เริ่มทำงาน ----------
$('#moon').textContent = moonPhase(Date.now());
renderApps();
go(0);
renderDial();
requestAnimationFrame(frame);
renderWeather();
loadWeather();
setInterval(loadWeather, 15 * 60 * 1000);
// เปิดได้แม้ไม่มีเน็ต (เฉพาะ https เช่นบน GitHub Pages)
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!wx || Date.now() - wx.at > 10 * 60 * 1000) loadWeather();
  $('#moon').textContent = moonPhase(Date.now());
});
