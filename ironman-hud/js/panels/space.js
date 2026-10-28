// แผง SPACE: ดวงจันทร์ 3 มิติ (ข้างขึ้นข้างแรมจริง) · ISS ผ่านฟ้าที่มองเห็นได้ · ปฏิทินดาราศาสตร์ (ฝนดาวตก สุริยุปราคา จันทรุปราคา) · ภาพประจำวัน
// คำนวณทางดาราศาสตร์ด้วย astronomy-engine (ฟรี โอเพนซอร์ส) — ไม่ต้องดึงข้อมูลจากเน็ต ยกเว้น TLE ของ ISS และภาพประจำวัน
import { loadScript, getJSON } from '../lib/load.js';
import { initIss, issPasses, dirTh, ASTRO_JS } from '../lib/iss.js';

let ctx, A, THREE;
let moonR = null; // { ren, scene, cam, mesh, light }
let ready = null, passes = null, passesFor = '';
const DAY = 864e5;
const fmtD = (d) => d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtT = (d) => d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const fmtDT = (d) => `${fmtD(d)} ${fmtT(d)} น.`;
const daysTo = (d) => Math.ceil((d - Date.now()) / DAY);

// ---------- ดวงจันทร์ ----------
function moonInfo(now = new Date()) {
  const phase = A.MoonPhase(now); // 0 = เดือนดับ, 180 = เต็มดวง
  const illum = A.Illumination(A.Body.Moon, now).phase_fraction;
  const age = phase / 360 * 29.530588;
  const day = Math.floor(age) + 1;
  const thai = phase < 180 ? (day >= 15 ? 'ขึ้น 15 ค่ำ (เต็มดวง)' : `ข้างขึ้น ${day} ค่ำ`) : (day - 15 >= 14 ? 'แรม 15 ค่ำ (เดือนดับ)' : `ข้างแรม ${Math.max(1, day - 15)} ค่ำ`);
  const dist = Math.hypot(...['x', 'y', 'z'].map((k) => A.GeoMoon(now)[k])) * 149597870.7;
  const name = phase < 10 || phase > 350 ? 'จันทร์ดับ' : phase < 80 ? 'เสี้ยวข้างขึ้น' : phase < 100 ? 'ครึ่งดวงข้างขึ้น' : phase < 170 ? 'ค่อนดวงข้างขึ้น' : phase < 190 ? 'เต็มดวง' : phase < 260 ? 'ค่อนดวงข้างแรม' : phase < 280 ? 'ครึ่งดวงข้างแรม' : 'เสี้ยวข้างแรม';
  return { phase, illum, thai, name, dist };
}
function nextQuarters(n = 4) {
  const out = [], names = ['จันทร์ดับ', 'ขึ้น 8 ค่ำ (ครึ่งดวง)', 'เพ็ญ ขึ้น 15 ค่ำ', 'แรม 8 ค่ำ (ครึ่งดวง)'];
  let q = A.SearchMoonQuarter(new Date());
  for (let i = 0; i < n; i++) { out.push({ name: names[q.quarter], q: q.quarter, date: q.time.date }); q = A.NextMoonQuarter(q); }
  return out;
}
function riseSet(body, obs) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const r = A.SearchRiseSet(body, obs, +1, start, 1.5), s = A.SearchRiseSet(body, obs, -1, start, 1.5);
  return { rise: r?.date, set: s?.date };
}

async function buildMoon() {
  THREE = await import('three');
  const wrap = document.getElementById('moon3d');
  const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  ren.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  wrap.prepend(ren.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 0, 4.2);
  const tex = await new THREE.TextureLoader().loadAsync('tex/2k_moon.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  mesh.rotation.y = -Math.PI / 2; // หันด้านที่เราเห็นจากโลกเข้าหากล้อง
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0x3fd8ff, 0.05));
  const light = new THREE.DirectionalLight(0xffffff, 3.2);
  scene.add(light);
  moonR = { ren, scene, cam, mesh, light, wrap };
  const size = () => { const w = wrap.clientWidth; ren.setSize(w, w, false); };
  size(); new ResizeObserver(size).observe(wrap);
  renderMoon();
  wrap.classList.add('ready');
}
function renderMoon() {
  if (!moonR) return;
  const { phase } = moonInfo();
  const a = phase * Math.PI / 180;
  // ข้างขึ้นสว่างด้านขวา, เต็มดวงแสงมาจากด้านหน้า, ข้างแรมสว่างด้านซ้าย
  moonR.light.position.set(Math.sin(a) * 5, 0.4, -Math.cos(a) * 5);
  moonR.ren.render(moonR.scene, moonR.cam);
}

function renderMoonInfo() {
  const m = moonInfo(), q = nextQuarters(4);
  const { lat, lon } = ctx.place();
  const rs = riseSet(A.Body.Moon, new A.Observer(lat, lon, 0));
  document.getElementById('moon-info').innerHTML = `
    <div class="mi-name">${m.name}</div><div class="mi-thai">${m.thai}</div>
    <div class="mi-grid"><span><small>ส่วนที่สว่าง</small>${Math.round(m.illum * 100)}%</span><span><small>ระยะห่าง</small>${Math.round(m.dist).toLocaleString()} กม.</span>
      <span><small>ขึ้น</small>${rs.rise ? fmtT(rs.rise) : '—'}</span><span><small>ตก</small>${rs.set ? fmtT(rs.set) : '—'}</span></div>
    <div class="mi-q">${q.map((x) => `<span${x.q === 2 ? ' class="full"' : ''}><small>${x.name}</small>${fmtD(x.date)}</span>`).join('')}</div>`;
}

// ---------- ISS ผ่านฟ้า ----------
async function loadPasses(force) {
  const p = ctx.place(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (!force && passes && passesFor === key && Date.now() - passes.at < 3600e3) return renderPasses();
  document.getElementById('iss-passes').innerHTML = '<p class="hint left">กำลังคำนวณวงโคจร 3 วันข้างหน้า…</p>';
  try {
    await initIss(ctx.store);
    const list = await issPasses({ lat: p.lat, lon: p.lon }, 72);
    passes = { list, at: Date.now() }; passesFor = key;
  } catch { document.getElementById('iss-passes').innerHTML = '<p class="hint left">คำนวณไม่สำเร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรกเพื่อโหลดข้อมูลวงโคจร)</p>'; return; }
  renderPasses();
}
function renderPasses() {
  const vis = passes.list.filter((x) => x.visible && x.end > Date.now());
  const all = passes.list.filter((x) => x.end > Date.now());
  const row = (x) => `<div class="e-row" style="--c:${x.visible ? '#2ee6a6' : 'var(--muted)'}"><b>${Math.round(x.maxEl)}°</b>
    <span>${fmtD(x.start)} ${fmtT(x.start)}–${fmtT(x.end)} น.${x.visible ? ' · <em class="ok">มองเห็นได้ ✓</em>' : ''}
    <small>ขึ้นทาง${dirTh(x.azStart)} → ลงทาง${dirTh(x.azEnd)} · ${Math.max(1, Math.round((x.end - x.start) / 60000))} นาที · สูงสุด ${fmtT(x.peak)} น.</small></span></div>`;
  document.getElementById('iss-passes').innerHTML = vis.length
    ? `${vis.slice(0, 5).map(row).join('')}<p class="hint left">มองหาจุดสว่างเคลื่อนที่เร็ว ไม่กะพริบ (ต่างจากเครื่องบิน) · องศา = ความสูงจากขอบฟ้า 90° คือตรงหัว</p>`
    : `<p class="hint left">3 วันนี้ไม่มีรอบที่มองเห็นด้วยตาเปล่า (ISS ต้องผ่านตอนหัวค่ำ/เช้ามืด) · รอบที่ผ่านแต่มองไม่เห็น:</p>${all.slice(0, 3).map(row).join('')}`;
}
function nextVisiblePass() { return passes?.list.find((x) => x.visible && x.end > Date.now()) || null; }

// ---------- ปฏิทินดาราศาสตร์ ----------
const SHOWERS = [ // วันพีคโดยประมาณ (เดือน 1-12, วัน) และอัตราสูงสุดต่อชั่วโมง
  ['ฝนดาวตกควอดแดรนต์', 1, 4, 110], ['ฝนดาวตกไลริด', 4, 22, 18], ['ฝนดาวตกอีตาอควอริด', 5, 6, 50], ['ฝนดาวตกเพอร์เซอิด', 8, 13, 100],
  ['ฝนดาวตกโอไรโอนิด', 10, 21, 20], ['ฝนดาวตกลีโอนิด', 11, 17, 15], ['ฝนดาวตกเจมินิด', 12, 14, 150],
];
function astroEvents() {
  const now = new Date(), y = now.getFullYear(), ev = [];
  const { lat, lon } = ctx.place(), obs = new A.Observer(lat, lon, 0);
  for (const [name, m, d, zhr] of SHOWERS) {
    let dt = new Date(y, m - 1, d, 3);
    if (dt < now - DAY) dt = new Date(y + 1, m - 1, d, 3);
    const moon = A.Illumination(A.Body.Moon, dt).phase_fraction;
    ev.push({ date: dt, icon: '☄', title: name, sub: `สูงสุด ~${zhr} ดวง/ชม. (ฟ้ามืดสนิท) · ${moon > 0.6 ? 'แสงจันทร์รบกวนมาก' : moon > 0.3 ? 'แสงจันทร์รบกวนบ้าง' : 'แสงจันทร์น้อย ดูง่าย'}` });
  }
  // จันทรุปราคา: เห็นในไทยถ้าดวงจันทร์อยู่เหนือขอบฟ้าตอนบังมากสุด
  let le = A.SearchLunarEclipse(now);
  for (let i = 0; i < 3; i++) {
    const eq = A.Equator(A.Body.Moon, le.peak, obs, true, true);
    const alt = A.Horizon(le.peak, obs, eq.ra, eq.dec, 'normal').altitude;
    const kind = { total: 'จันทรุปราคาเต็มดวง', partial: 'จันทรุปราคาบางส่วน', penumbral: 'จันทรุปราคาเงามัว' }[le.kind] || 'จันทรุปราคา';
    ev.push({ date: le.peak.date, icon: '🌘', title: kind, sub: alt > 0 ? `เห็นได้จากตำแหน่งคุณ · บังมากสุด ${fmtT(le.peak.date)} น.` : 'ไม่เห็นจากประเทศไทย (ดวงจันทร์อยู่ใต้ขอบฟ้า)', seen: alt > 0 });
    le = A.NextLunarEclipse(le.peak);
  }
  // สุริยุปราคาที่เห็นจากตำแหน่งเรา (ค้นถัดไป 1 ครั้ง)
  try {
    const se = A.SearchLocalSolarEclipse(now, obs);
    const kind = { total: 'สุริยุปราคาเต็มดวง', annular: 'สุริยุปราคาวงแหวน', partial: 'สุริยุปราคาบางส่วน' }[se.kind] || 'สุริยุปราคา';
    ev.push({ date: se.peak.time.date, icon: '🌞', title: kind, sub: `เห็นจากตำแหน่งคุณ · บัง ${Math.round(se.obscuration * 100)}% · ห้ามมองด้วยตาเปล่า ใช้แว่นกรองแสงเท่านั้น`, seen: true });
  } catch { /* ไม่พบในช่วงที่ค้น */ }
  const s = A.Seasons(y), s2 = A.Seasons(y + 1);
  [[s.mar_equinox, 'วิษุวัต (กลางวัน=กลางคืน)'], [s.jun_solstice, 'ครีษมายัน (กลางวันยาวสุด)'], [s.sep_equinox, 'ศารทวิษุวัต (กลางวัน=กลางคืน)'], [s.dec_solstice, 'เหมายัน (กลางคืนยาวสุด)'], [s2.mar_equinox, 'วิษุวัต (กลางวัน=กลางคืน)']]
    .forEach(([t, n]) => ev.push({ date: t.date, icon: '🌍', title: n, sub: 'จุดเปลี่ยนฤดูทางดาราศาสตร์' }));
  // ซูเปอร์มูน: จันทร์เต็มดวงที่ใกล้โลก < 360,000 กม.
  let q = A.SearchMoonQuarter(now);
  for (let i = 0; i < 52 && ev.filter((e) => e.super).length < 1; i++) {
    if (q.quarter === 2) { const d = Math.hypot(...['x', 'y', 'z'].map((k) => A.GeoMoon(q.time)[k])) * 149597870.7; if (d < 360000) ev.push({ date: q.time.date, icon: '🌕', title: 'ซูเปอร์มูน', sub: `จันทร์เต็มดวงใกล้โลก ${Math.round(d).toLocaleString()} กม. ดูใหญ่และสว่างกว่าปกติ`, super: true }); }
    q = A.NextMoonQuarter(q);
  }
  return ev.filter((e) => e.date > now - DAY / 2).sort((a, b) => a.date - b.date);
}
function renderAstro() {
  const ev = astroEvents().slice(0, 8);
  document.getElementById('astro-cal').innerHTML = ev.map((e) => `<div class="e-row" style="--c:${e.seen === false ? 'var(--muted)' : 'var(--hud)'}"><b>${e.icon}</b>
    <span>${e.title} <em class="when">${fmtD(e.date)} · อีก ${Math.max(0, daysTo(e.date))} วัน</em><small>${e.sub}</small></span></div>`).join('');
}

// ---------- ภาพประจำวัน (Wikimedia Commons Picture of the Day) ----------
async function loadPotd() {
  const box = document.getElementById('potd');
  const d = new Date(), key = d.toISOString().slice(0, 10);
  let p = ctx.store.get('potd', null);
  if (!p || p.day !== key) {
    try {
      const j = await getJSON(`https://api.wikimedia.org/feed/v1/wikipedia/th/featured/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`);
      const im = j.image;
      if (!im) throw new Error('no image');
      p = { day: key, src: (im.thumbnail || im.image).source, title: im.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), desc: im.description?.text || '', url: im.file_page, credit: (im.artist?.text || '').slice(0, 80), license: im.license?.type || '' };
      ctx.store.set('potd', p);
    } catch { box.innerHTML = '<p class="hint left">โหลดภาพประจำวันไม่สำเร็จ</p>'; return; }
  }
  box.innerHTML = `<a href="${p.url}" target="_blank" rel="noopener" class="potd-img"><img src="${p.src}" alt="${ctx.esc(p.desc || p.title)}" loading="lazy"></a>
    <div class="potd-cap">${ctx.esc(p.desc || p.title)}<small>${ctx.esc(p.credit)}${p.license ? ` · ${ctx.esc(p.license)}` : ''} · Wikimedia Commons</small></div>`;
}

// ---------- เปิดแผง ----------
async function prepare() {
  if (!ready) ready = loadScript(ASTRO_JS).then(() => { A = window.Astronomy; });
  return ready;
}
async function start() {
  await prepare();
  renderMoonInfo(); renderAstro();
  if (!moonR) buildMoon().catch(() => { document.getElementById('moon3d').innerHTML = '<p class="hint">โหลดดวงจันทร์ 3 มิติไม่สำเร็จ</p>'; });
  else renderMoon();
  loadPasses();
  loadPotd();
}

export default {
  id: 'p-space', en: 'SPACE', th: 'อวกาศ', sub: 'ดวงจันทร์ · ISS ผ่านฟ้า · ดาราศาสตร์',
  html: `<div class="moon-wrap"><div id="moon3d" class="moon3d"><p class="g-loading">กำลังโหลด…</p></div><div id="moon-info" class="moon-info"></div></div>
    <div class="box"><div class="p-lbl">ISS PASSES · สถานีอวกาศผ่านฟ้าคุณ 3 วัน</div><div id="iss-passes"></div></div>
    <div class="box"><div class="p-lbl">SKY CALENDAR · ปฏิทินดาราศาสตร์</div><div id="astro-cal"></div></div>
    <div class="box"><div class="p-lbl">PICTURE OF THE DAY · ภาพประจำวัน</div><div id="potd"></div></div>`,
  init(c) {
    ctx = c;
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-space');
    setTimeout(() => prepare().then(() => loadPasses()).catch(() => {}), 15000); // คำนวณรอบ ISS ล่วงหน้า
    addEventListener('hud:wx', () => { if (A && document.getElementById('p-space').classList.contains('on')) { renderMoonInfo(); loadPasses(); } });
    ctx.addReporter(async () => {
      await prepare();
      const out = [], m = moonInfo();
      if (m.phase > 170 && m.phase < 190) out.push(`คืนนี้พระจันทร์เต็มดวง ${m.thai}`);
      try { await loadPasses(); } catch { /* ไม่เป็นไร */ }
      const p = nextVisiblePass();
      if (p && p.start - Date.now() < DAY) out.push(`สถานีอวกาศจะผ่านให้เห็นด้วยตาเปล่า ${fmtT(p.start)} นาฬิกา ทาง${dirTh(p.azStart)} สูง ${Math.round(p.maxEl)} องศา`);
      const ev = astroEvents().find((e) => daysTo(e.date) <= 2 && e.seen !== false);
      if (ev) out.push(`${ev.title}${daysTo(ev.date) <= 0 ? 'วันนี้' : `อีก ${daysTo(ev.date)} วัน`}`);
      return out;
    });
    ctx.addIntent(/ดวงจันทร์|พระจันทร์|ข้างขึ้น|ข้างแรม|จันทร์เต็มดวง|moon/, () => {
      if (!A) { prepare(); return { text: 'กำลังคำนวณค่ะ ถามอีกครั้งนะคะ', go: go() }; }
      const m = moonInfo(), full = nextQuarters(4).find((x) => x.q === 2);
      return { text: `วันนี้${m.thai} ดวงจันทร์สว่าง ${Math.round(m.illum * 100)} เปอร์เซ็นต์ จันทร์เต็มดวงครั้งถัดไป${fmtD(full.date)}ค่ะ`, go: go() };
    }, 'คืนนี้ข้างขึ้นกี่ค่ำ');
    ctx.addIntent(/(iss|สถานีอวกาศ).*(ผ่าน|เห็น|เมื่อไหร่)|(เห็น|ดู).*(iss|สถานีอวกาศ)/, () => {
      const p = nextVisiblePass();
      if (!p) { start(); return { text: passes ? 'สามวันนี้ไม่มีรอบที่มองเห็นด้วยตาเปล่าค่ะ' : 'กำลังคำนวณรอบที่ผ่านค่ะ ดูได้ที่แผงอวกาศ', go: go() }; }
      return { text: `สถานีอวกาศจะผ่านให้เห็น${fmtD(p.start)} เวลา ${fmtT(p.start)} นาฬิกา ขึ้นทาง${dirTh(p.azStart)} สูงสุด ${Math.round(p.maxEl)} องศาค่ะ`, go: go() };
    }, 'จะเห็นสถานีอวกาศเมื่อไหร่');
    ctx.addIntent(/ฝนดาวตก|ดาวตก|สุริยุปราคา|จันทรุปราคา|ดาราศาสตร์|ซูเปอร์มูน/, () => {
      if (!A) { prepare(); return { text: 'กำลังคำนวณค่ะ', go: go() }; }
      const e = astroEvents()[0];
      return { text: `เหตุการณ์ท้องฟ้าถัดไปคือ ${e.title} ${fmtD(e.date)} อีก ${daysTo(e.date)} วันค่ะ`, go: go() };
    });
  },
  show: start,
};
