import { bar, gate, camera, wakeLock, store, toast, isIOS, askMotion, permMsg, $, $$, clamp } from '../common/lab.js';
import * as A from 'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/esm/astronomy.js';
import * as SAT from 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.1/dist/satellite.es.js';

const DATA = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/';
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const wrap180 = d => ((d + 540) % 360) - 180;
// ENU unit vector (x=East, y=North, z=Up) from azimuth/altitude in degrees
const enu = (az, alt) => { const a = az * D2R, h = alt * D2R; return [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)]; };
const azalt = v => { let az = Math.atan2(v[0], v[1]) * R2D; if (az < 0) az += 360; return [az, Math.asin(clamp(v[2], -1, 1)) * R2D]; };
const hm = d => d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—';
const DIRS = ['เหนือ', 'ตอ.เฉียงเหนือ', 'ตะวันออก', 'ตอ.เฉียงใต้', 'ใต้', 'ตต.เฉียงใต้', 'ตะวันตก', 'ตต.เฉียงเหนือ'];
const DIRS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirName = az => DIRS[Math.round(az / 45) % 8];

const CITIES = [
  ['กรุงเทพฯ', 13.7563, 100.5018], ['เชียงใหม่', 18.7883, 98.9853], ['ขอนแก่น', 16.4419, 102.836], ['นครราชสีมา', 14.9799, 102.0978],
  ['ชลบุรี', 13.3611, 100.9847], ['ระยอง', 12.6814, 101.2816], ['ภูเก็ต', 7.8804, 98.3923], ['หาดใหญ่', 7.0084, 100.4747], ['อุบลราชธานี', 15.2287, 104.8564],
];
const CON_TH = { Ori: 'นายพราน (ดาวไถ)', UMa: 'หมีใหญ่ (ดาวจระเข้)', UMi: 'หมีเล็ก', Sco: 'แมงป่อง', Cas: 'แคสซิโอเปีย', Cyg: 'หงส์', Leo: 'สิงโต', Tau: 'วัว', Gem: 'คนคู่', Cnc: 'ปู', Vir: 'หญิงสาว', Lib: 'คันชั่ง', Sgr: 'คนยิงธนู', Cap: 'แพะทะเล', Aqr: 'คนแบกหม้อน้ำ', Psc: 'ปลา', Ari: 'แกะ', Cru: 'กางเขนใต้', CMa: 'หมาใหญ่', CMi: 'หมาเล็ก', Lyr: 'พิณ', Aql: 'นกอินทรี', Peg: 'ม้าบิน', And: 'แอนดรอเมดา', Per: 'เพอร์ซิอุส', Aur: 'สารถี', Boo: 'คนเลี้ยงสัตว์', Cen: 'คนครึ่งม้า', Dra: 'มังกร', Hya: 'งูไฟ', Car: 'กระดูกงูเรือ', Eri: 'แม่น้ำ', Oph: 'คนแบกงู', Her: 'เฮอร์คิวลีส', Crv: 'อีกา', Lep: 'กระต่าย', Col: 'นกพิราบ', Cep: 'ซีฟิอัส', CrB: 'มงกุฎเหนือ', Del: 'ปลาโลมา', Tri: 'สามเหลี่ยม', Sge: 'ลูกศร', Ser: 'งู', Pup: 'ท้ายเรือ', Vel: 'ใบเรือ', Gru: 'นกกระเรียน', PsA: 'ปลาใต้', Cet: 'ปลาวาฬ', Lup: 'หมาป่า', CrA: 'มงกุฎใต้', Mon: 'ยูนิคอร์น', Crt: 'ถ้วย', Pav: 'นกยูง', Phe: 'นกฟีนิกซ์', TrA: 'สามเหลี่ยมใต้' };
const STAR_TH = { Sirius: 'ซิริอุส', Canopus: 'คาโนปุส', Arcturus: 'อาร์คตุรุส', Vega: 'เวกา', Capella: 'คาเพลลา', Rigel: 'ไรเจล', Procyon: 'โปรซีออน', Betelgeuse: 'บีเทลจุส', Altair: 'อัลแตร์', Aldebaran: 'อัลเดบารัน', Antares: 'แอนทาเรส', Spica: 'สไปกา', Pollux: 'พอลลักซ์', Fomalhaut: 'โฟมัลฮอต', Deneb: 'เดเนบ', Regulus: 'เรกูลัส', Polaris: 'ดาวเหนือ (Polaris)', Achernar: 'อะเคอร์นาร์', Acrux: 'อะครักซ์', Hadar: 'ฮาดาร์', 'Rigil Kentaurus': 'แอลฟาเซนทอรี', Castor: 'แคสเตอร์', Mimosa: 'มิโมซา', Shaula: 'ชอลา', Bellatrix: 'เบลลาทริกซ์', Alnilam: 'อัลนิแลม (ดาวไถ)', Alnitak: 'อัลนิตัก (ดาวไถ)', Mintaka: 'มินทากา (ดาวไถ)', Dubhe: 'ดูเบ', Mizar: 'มิซาร์', Alioth: 'อลิโอธ' };
// d3-celestial HIP ids → proper names (mag ≤ 2.6), saves fetching the 675 kB starnames.json
const STAR_NAMES = { 677: 'Alpheratz', 746: 'Caph', 2081: 'Ankaa', 3179: 'Shedar', 3419: 'Diphda', 4427: 'Navi', 5447: 'Mirach', 7588: 'Achernar', 9640: 'Almach', 9884: 'Hamal', 11767: 'Polaris', 14135: 'Menkar', 14576: 'Algol', 15863: 'Mirfak', 21421: 'Aldebaran', 24436: 'Rigel', 24608: 'Capella', 25336: 'Bellatrix', 25428: 'Elnath', 25930: 'Mintaka', 25985: 'Arneb', 26311: 'Alnilam', 26727: 'Alnitak', 27366: 'Saiph', 27989: 'Betelgeuse', 28360: 'Menkalinan', 30324: 'Mirzam', 30438: 'Canopus', 31681: 'Alhena', 32349: 'Sirius', 33579: 'Adhara', 34444: 'Wezen', 35904: 'Aludra', 36850: 'Castor', 37279: 'Procyon', 37826: 'Pollux', 39429: 'Naos', 39953: 'Regor', 41037: 'Avior', 42913: 'Alsephina', 44816: 'Suhail', 45238: 'Miaplacidus', 45556: 'Aspidiske', 45941: 'Markeb', 46390: 'Alphard', 49669: 'Regulus', 50583: 'Algieba', 53910: 'Merak', 54061: 'Dubhe', 54872: 'Zosma', 57632: 'Denebola', 58001: 'Phecda', 59803: 'Gienah', 60718: 'Acrux', 61084: 'Gacrux', 61932: 'Muhlifain', 62434: 'Mimosa', 62956: 'Alioth', 65378: 'Mizar', 65474: 'Spica', 67301: 'Alkaid', 68002: 'Alnair', 68702: 'Hadar', 68933: 'Menkent', 69673: 'Arcturus', 71681: 'Toliman', 71683: 'Rigil Kentaurus', 72105: 'Izar', 72607: 'Kochab', 76267: 'Alphecca', 78401: 'Dschubba', 78820: 'Acrab', 80763: 'Antares', 82273: 'Atria', 84012: 'Sabik', 85927: 'Shaula', 86032: 'Rasalhague', 86228: 'Sargas', 87833: 'Eltanin', 90185: 'Kaus Australis', 91262: 'Vega', 92855: 'Nunki', 93506: 'Ascella', 97649: 'Altair', 100453: 'Sadr', 100751: 'Peacock', 102098: 'Deneb', 102488: 'Aljanah', 105199: 'Alderamin', 107315: 'Enif', 109268: 'Alnair', 113368: 'Fomalhaut', 113881: 'Scheat', 113963: 'Markab' };
const BODIES = [
  ['Sun', 'ดวงอาทิตย์', '#ffd76a', '☀'], ['Moon', 'ดวงจันทร์', '#f2f2e6', '☾'], ['Mercury', 'ดาวพุธ', '#d9c7a8', '☿'], ['Venus', 'ดาวศุกร์', '#fff2c4', '♀'],
  ['Mars', 'ดาวอังคาร', '#ff8a5c', '♂'], ['Jupiter', 'ดาวพฤหัสบดี', '#ffd9a0', '♃'], ['Saturn', 'ดาวเสาร์', '#f0dc9a', '♄'], ['Uranus', 'ดาวยูเรนัส', '#9fe8ff', '⛢'], ['Neptune', 'ดาวเนปจูน', '#7fa8ff', '♆'],
];
const SAT_KNOWN = { 25544: 'สถานีอวกาศนานาชาติ (ISS)', 48274: 'สถานีอวกาศจีน เทียนกง (CSS)', 20580: 'กล้องโทรทรรศน์ฮับเบิล (HST)' };

// ---------------- state ----------------
const opt = Object.assign({ lines: true, conNames: true, starNames: true, sats: true, grid: false, below: true, mag: 4.5, fov: 63, nudge: 0 }, store.get('sky.opt', {}));
const saveOpt = () => store.set('sky.opt', opt);
let obs = store.get('sky.loc', { name: 'กรุงเทพฯ (ค่าเริ่มต้น)', lat: 13.7563, lon: 100.5018, h: 10, src: 'default' });
let timeOff = 0;               // minutes
const now = () => new Date(Date.now() + timeOff * 60000);
let mode = 'drag';             // 'sensor' | 'drag'
let hasCam = false;
const view = { az: 135, alt: 35, fovV: 70 };   // virtual camera (drag mode)
let F = enu(135, 35), U = [0, 0, 1], RT = [1, 0, 0];   // camera frame in ENU
let stars = [], lines = [], cons = [], bodies = [], sats = [];
let target = null;          // object to find
let hits = [];
let pleiades = { type: 'star', id: 'M45', name: 'ดาวลูกไก่ (Pleiades, M45)', mag: 1.6, eq: radec(56.75, 24.12), v: [0, 0, 1], con: 'Tau' };

function radec(raDeg, decDeg) { const r = raDeg * D2R, d = decDeg * D2R; return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]; }

// ---------------- DOM ----------------
bar('SKY//AR', 'ส่องท้องฟ้า · ดาว ดาวเคราะห์ ISS', '<span class="mono" id="clock" style="font-size:13px;color:var(--dim)"></span>');
const stage = $('#stage'), video = $('#vid'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let dockH = 70;
function resize() {
  dockH = (document.getElementById('dock')?.offsetHeight || 60) - (stage.getBoundingClientRect().bottom < innerHeight - 2 ? innerHeight - stage.getBoundingClientRect().bottom : 0);
  document.getElementById('readout').style.bottom = (dockH + 52) + 'px';
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
}
addEventListener('resize', resize); resize();

// focal length in CSS px
function focal() {
  if (mode === 'sensor' && hasCam && video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight, long = Math.max(vw, vh);
    const fv = (long / 2) / Math.tan(opt.fov * D2R / 2);
    return fv * Math.max(W / vw, H / vh);
  }
  if (mode === 'sensor') {   // no camera: assume a typical phone camera view of the screen's long side
    return (Math.max(W, H) / 2) / Math.tan(opt.fov * D2R / 2);
  }
  return (H / 2) / Math.tan(view.fovV * D2R / 2);
}

// ---------------- data ----------------
async function loadData() {
  const [st, li, co] = await Promise.all(['stars.6', 'constellations.lines', 'constellations'].map(f => fetch(DATA + f + '.json').then(r => { if (!r.ok) throw new Error(f); return r.json(); })));
  stars = st.features.filter(f => f.properties.mag <= 5).map(f => {
    const [lon, lat] = f.geometry.coordinates; const name = STAR_NAMES[f.id];
    return { type: 'star', id: f.id, mag: f.properties.mag, bv: +f.properties.bv || 0.6, eq: radec(lon < 0 ? lon + 360 : lon, lat), v: [0, 0, 1], en: name, name: name ? (STAR_TH[name] || name) : null };
  }).sort((a, b) => a.mag - b.mag);
  lines = [];
  for (const f of li.features) for (const pl of f.geometry.coordinates) {
    lines.push({ con: f.id, pts: pl.map(([lon, lat]) => ({ eq: radec(lon < 0 ? lon + 360 : lon, lat), v: [0, 0, 1] })) });
  }
  cons = co.features.map(f => { const [lon, lat] = f.geometry.coordinates; return { type: 'con', id: f.id, la: f.properties.name, name: CON_TH[f.id] || f.properties.name, rank: +f.properties.rank, eq: radec(lon < 0 ? lon + 360 : lon, lat), v: [0, 0, 1] }; });
  for (const s of stars) if (s.en) { const c = conOf(s); s.con = c; }
}
function conOf(s) { // star that is a vertex of a stick figure → that constellation; else nearest label
  for (const l of lines) for (const p of l.pts) if (dot(p.eq, s.eq) > 0.999999) return l.con;
  let best = null, bd = -2; for (const c of cons) { const d = dot(c.eq, s.eq); if (d > bd) { bd = d; best = c.id; } } return best;
}

// ---------------- astronomy ----------------
let observer, lastAstro = 0, rot;
function astro(force) {
  const t = Date.now();
  if (!force && t - lastAstro < 1000) return;
  lastAstro = t;
  const date = now(), time = A.MakeTime(date);
  observer = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  rot = A.Rotation_EQJ_HOR(time, observer).rot;
  const toEnu = (e, out) => {   // astronomy-engine HOR: x=north, y=west, z=zenith → ENU
    const x = rot[0][0] * e[0] + rot[1][0] * e[1] + rot[2][0] * e[2];
    const y = rot[0][1] * e[0] + rot[1][1] * e[1] + rot[2][1] * e[2];
    const z = rot[0][2] * e[0] + rot[1][2] * e[1] + rot[2][2] * e[2];
    out[0] = -y; out[1] = x; out[2] = z;
  };
  for (const s of stars) toEnu(s.eq, s.v);
  for (const l of lines) for (const p of l.pts) toEnu(p.eq, p.v);
  for (const c of cons) toEnu(c.eq, c.v);
  toEnu(pleiades.eq, pleiades.v);
  bodies = BODIES.map(([key, th, color, sym]) => {
    const eq = A.Equator(key, time, observer, true, true);
    const hz = A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    let mag = null; try { mag = A.Illumination(key, time).mag; } catch {}
    return { type: 'planet', id: key, name: th, color, sym, mag, dist: eq.dist, az: hz.azimuth, alt: hz.altitude, v: enu(hz.azimuth, hz.altitude) };
  });
  sunAlt = bodies[0].alt;
  $('#clock').textContent = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + (timeOff ? ` (${timeOff > 0 ? '+' : ''}${(timeOff / 60).toFixed(1)} ชม.)` : '');
}
let sunAlt = 0;

// ---------------- satellites ----------------
async function gp(group) {
  const key = 'sky.gp.' + group, c = store.get(key);
  if (c && Date.now() - c.t < 2 * 3600e3) return c.d;
  try {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`);
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) throw new Error('bad');
    const slim = d.map(o => ({ OBJECT_NAME: o.OBJECT_NAME, OBJECT_ID: o.OBJECT_ID, EPOCH: o.EPOCH, MEAN_MOTION: o.MEAN_MOTION, ECCENTRICITY: o.ECCENTRICITY, INCLINATION: o.INCLINATION, RA_OF_ASC_NODE: o.RA_OF_ASC_NODE, ARG_OF_PERICENTER: o.ARG_OF_PERICENTER, MEAN_ANOMALY: o.MEAN_ANOMALY, NORAD_CAT_ID: o.NORAD_CAT_ID, BSTAR: o.BSTAR, MEAN_MOTION_DOT: o.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: o.MEAN_MOTION_DDOT, ELEMENT_SET_NO: o.ELEMENT_SET_NO, REV_AT_EPOCH: o.REV_AT_EPOCH, CLASSIFICATION_TYPE: o.CLASSIFICATION_TYPE, EPHEMERIS_TYPE: o.EPHEMERIS_TYPE }));
    store.set(key, { t: Date.now(), d: slim });
    return slim;
  } catch (e) {
    console.warn('celestrak', group, e);
    return c?.d || null;   // stale cache is still far better than nothing (TLEs stay usable for days)
  }
}
async function issFallback() {
  try {
    const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles?format=json');
    const d = await r.json();
    return { name: 'ISS (ZARYA)', rec: SAT.twoline2satrec(d.line1, d.line2), id: 25544 };
  } catch { return null; }
}
async function loadSats() {
  const out = new Map();
  const add = (o, bright) => {
    if (out.has(o.NORAD_CAT_ID)) return;
    try { out.set(o.NORAD_CAT_ID, { type: 'sat', id: o.NORAD_CAT_ID, en: o.OBJECT_NAME, name: SAT_KNOWN[o.NORAD_CAT_ID] || o.OBJECT_NAME, key: !!SAT_KNOWN[o.NORAD_CAT_ID], rec: SAT.json2satrec(o), bright }); } catch (e) { console.warn(e); }
  };
  const st = await gp('stations');
  st?.filter(o => SAT_KNOWN[o.NORAD_CAT_ID]).forEach(o => add(o, true));
  const vis = await gp('visual');
  vis?.forEach(o => add(o, !!SAT_KNOWN[o.NORAD_CAT_ID]));
  if (!out.has(25544)) { const f = await issFallback(); if (f) out.set(25544, { type: 'sat', id: 25544, en: f.name, name: SAT_KNOWN[25544], key: true, rec: f.rec, bright: true }); }
  sats = [...out.values()];
  if (!sats.length) { $('#chipSat').hidden = false; $('#chipSat').textContent = '🛰 โหลดข้อมูลดาวเทียมไม่ได้ (ออฟไลน์?)'; return; }
  predictPasses();
  setInterval(predictPasses, 5 * 60e3);
}
function satLook(s, date) {
  const pv = SAT.propagate(s.rec, date);
  if (!pv || !pv.position || typeof pv.position !== 'object') return null;
  const gmst = SAT.gstime(date);
  const ecf = SAT.eciToEcf(pv.position, gmst);
  const la = SAT.ecfToLookAngles({ latitude: obs.lat * D2R, longitude: obs.lon * D2R, height: (obs.h || 0) / 1000 }, ecf);
  const geo = SAT.eciToGeodetic(pv.position, gmst);
  return { az: la.azimuth * R2D, alt: la.elevation * R2D, range: la.rangeSat, height: geo.height, eci: pv.position };
}
function sunlit(eci, date) {   // cylindrical Earth shadow
  const s = A.GeoVector('Sun', A.MakeTime(date), false); const l = Math.hypot(s.x, s.y, s.z);
  const u = [s.x / l, s.y / l, s.z / l], p = [eci.x, eci.y, eci.z], d = dot(p, u);
  if (d > 0) return true;
  return Math.hypot(p[0] - d * u[0], p[1] - d * u[1], p[2] - d * u[2]) > 6371;
}
function predictPasses() {
  if (!observer) astro(true);
  const t0 = now().getTime();
  for (const s of sats.filter(s => s.key)) {
    s.pass = null;
    let inPass = false, best = null, start = null;
    for (let k = 0; k <= 2880; k++) {   // 24 h in 30 s steps
      const d = new Date(t0 + k * 30e3), L = satLook(s, d);
      if (!L) break;
      if (L.alt > 10) {
        if (!inPass) { inPass = true; start = d; best = { ...L, d }; }
        else if (L.alt > best.alt) best = { ...L, d };
      } else if (inPass) {
        const sunAltAt = A.Horizon(A.MakeTime(best.d), observer, ...(e => [e.ra, e.dec])(A.Equator('Sun', A.MakeTime(best.d), observer, true, true))).altitude;
        s.pass = { start, end: d, max: best.alt, maxAt: best.d, nowUp: k === 1 || start.getTime() === t0, visible: sunAltAt < -6 && sunlit(best.eci, best.d) };
        break;
      }
    }
  }
  updateSatChip();
}
function passText(s) {
  const p = s.pass; if (!p) return 'ไม่มีรอบผ่านใน 24 ชม.';
  const mins = Math.round((p.start - now()) / 60000);
  const when = mins <= 0 ? 'กำลังผ่านเหนือหัวตอนนี้!' : mins < 90 ? `ผ่านเหนือหัวในอีก ${mins} นาที` : `ผ่านครั้งถัดไป ${hm(p.start)} น.`;
  return `${when} · สูงสุด ${p.max.toFixed(0)}° เวลา ${hm(p.maxAt)} · ${p.visible ? 'มองเห็นด้วยตาเปล่า ✨' : 'มองไม่เห็น (ฟ้าสว่าง/อยู่ในเงาโลก)'}`;
}
function updateSatChip() {
  const iss = sats.find(s => s.id === 25544); const c = $('#chipSat');
  if (!iss) return;
  c.hidden = false; c.className = 'chip' + (iss.pass?.visible ? ' ok' : '');
  c.textContent = '🛰 ISS: ' + passText(iss).split(' · ')[0];
}
let lastSat = 0;
function satUpdate() {
  if (!opt.sats || !sats.length || !observer) return;
  const t = Date.now(); if (t - lastSat < 250) return; lastSat = t;
  const d = now();
  for (const s of sats) {
    if (!s.key && s.v && t - (s.t || 0) < 1000) continue;   // the dim ones only once a second
    s.t = t;
    const L = satLook(s, d); if (!L) { s.v = null; continue; }
    Object.assign(s, L); s.v = enu(L.az, L.alt);
  }
}

// ---------------- sensors ----------------
let ori = null, absolute = false, gotOri = false, hdgOff = null, compassAcc = null;
const screenAngle = () => (screen.orientation?.angle ?? window.orientation ?? 0) * D2R;
function rotM(a, b, g) {   // W3C Z-X'-Y'' → device→earth(ENU) rotation, as columns
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  return [
    [cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB],
    [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
    [-cB * sG, sB, cB * cG],
  ];
}
const mul = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
function onOri(e, isAbs) {
  if (e.beta == null) return;
  if (isAbs) absolute = true; else if (absolute && !('webkitCompassHeading' in e)) return; // prefer absolute stream on Android
  gotOri = true; ori = { a: e.alpha || 0, b: e.beta, g: e.gamma || 0 };
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    // iOS: alpha is relative to an arbitrary start; learn the offset to true heading
    compassAcc = e.webkitCompassAccuracy;
    const R = rotM(ori.a * D2R, ori.b * D2R, ori.g * D2R);
    const top = [R[0][1], R[1][1], R[2][1]], back = [-R[0][2], -R[1][2], -R[2][2]];
    const ref = Math.abs(R[2][2]) > 0.7 ? top : back;   // flat → top edge, upright → rear camera
    if (Math.hypot(ref[0], ref[1]) > 0.3) {
      const azRel = Math.atan2(ref[0], ref[1]) * R2D;
      const tgt = wrap180(e.webkitCompassHeading - azRel);
      hdgOff = hdgOff == null ? tgt : hdgOff + 0.04 * wrap180(tgt - hdgOff);
    }
  }
}
addEventListener('deviceorientationabsolute', e => onOri(e, true));
addEventListener('deviceorientation', e => onOri(e, false));

function frameFromSensors() {
  if (!ori) return;
  const R = rotM(ori.a * D2R, ori.b * D2R, ori.g * D2R);
  const sa = screenAngle();
  const upD = [Math.sin(sa), Math.cos(sa), 0], rtD = [Math.cos(sa), -Math.sin(sa), 0];
  let f = mul(R, [0, 0, -1]), u = mul(R, upD);
  // azimuth correction: iOS compass offset + manual nudge (rotate about the zenith)
  const off = ((hdgOff ?? 0) + opt.nudge) * D2R;
  const rz = v => { const c = Math.cos(off), s = Math.sin(off); return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]; };
  f = rz(f); u = rz(u);
  // light smoothing, then re-orthonormalise
  const k = 0.35;
  F = norm(F.map((x, i) => x + k * (f[i] - x)));
  U = norm(U.map((x, i) => x + k * (u[i] - x)));
  RT = norm(cross(F, U)); U = cross(RT, F);
}
function frameFromView() {
  const a = view.az * D2R, h = view.alt * D2R;
  F = [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)];
  U = [-Math.sin(a) * Math.sin(h), -Math.cos(a) * Math.sin(h), Math.cos(h)];
  RT = cross(F, U);
}

// drag / zoom (virtual sky)
let drag = null, pinch = null; const ptrs = new Map();
stage.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, e); drag = { x: e.clientX, y: e.clientY, moved: 0 }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, e);
  if (ptrs.size === 2 && mode === 'drag') {
    const [p, q] = [...ptrs.values()], d = Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY);
    if (pinch) view.fovV = clamp(view.fovV * pinch / d, 10, 110); pinch = d; drag.moved = 99; return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (mode === 'drag') { const s = view.fovV / H; view.az = (view.az - dx * s + 360) % 360; view.alt = clamp(view.alt + dy * s, -89, 89.9); }
});
const up = e => { ptrs.delete(e.pointerId); pinch = null; if (drag && drag.moved < 8 && ptrs.size === 0) tap(e); if (!ptrs.size) drag = null; };
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
stage.addEventListener('wheel', e => { if (mode === 'drag') { e.preventDefault(); view.fovV = clamp(view.fovV * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 10, 110); } }, { passive: false });

// ---------------- render ----------------
const bvColor = bv => bv < 0 ? '#b5c8ff' : bv < 0.3 ? '#dfe7ff' : bv < 0.6 ? '#fffbef' : bv < 1.0 ? '#ffe9b8' : bv < 1.4 ? '#ffd29a' : '#ffb27a';
function draw() {
  requestAnimationFrame(draw);
  if (mode === 'sensor') frameFromSensors(); else frameFromView();
  astro(); satUpdate();
  const f = focal(), cx = W / 2, cy = H / 2;
  const P = v => { const z = dot(v, F); if (z <= 0.02) return null; const x = cx + f * dot(v, RT) / z, y = cy - f * dot(v, U) / z; return (x < -200 || x > W + 200 || y < -200 || y > H + 200) ? null : [x, y]; };
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!(mode === 'sensor' && hasCam)) {  // virtual sky tint by sun altitude
    const day = clamp((sunAlt + 12) / 18, 0, 1);
    c.fillStyle = `rgba(${20 + 40 * day | 0},${50 + 90 * day | 0},${80 + 120 * day | 0},${0.15 + 0.5 * day})`;
    c.fillRect(0, 0, W, H);
  }
  hits = []; const labels = [];
  const label = (txt, x, y, color, size = 12, prio = 0) => labels.push({ txt, x, y, color, size, prio });
  const dimBelow = v => v[2] < 0 ? 0.3 : 1;
  // ground: screen half-plane where the view ray points below the horizon (great circle → straight line)
  if (!(mode === 'sensor' && hasCam)) {
    const g = (x, y) => F[2] + (x - cx) / f * RT[2] - (y - cy) / f * U[2];
    const poly = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
    for (let i = 0; i < 4; i++) {
      const a = poly[i], b = poly[(i + 1) % 4], ga = g(...a), gb = g(...b);
      if (ga < 0) out.push(a);
      if ((ga < 0) !== (gb < 0)) { const t = ga / (ga - gb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    if (out.length > 2) { c.fillStyle = 'rgba(3,18,10,.72)'; c.beginPath(); out.forEach((q, i) => i ? c.lineTo(...q) : c.moveTo(...q)); c.closePath(); c.fill(); }
  }
  // alt grid
  if (opt.grid) {
    c.strokeStyle = 'rgba(60,231,255,.12)'; c.lineWidth = 1;
    for (let alt = 15; alt < 90; alt += 15) { c.beginPath(); let pen = false; for (let az = 0; az <= 360; az += 3) { const p = P(enu(az, alt)); if (p) { pen ? c.lineTo(...p) : c.moveTo(...p); pen = true; } else pen = false; } c.stroke(); }
    for (let az = 0; az < 360; az += 30) { c.beginPath(); let pen = false; for (let alt = 0; alt <= 90; alt += 3) { const p = P(enu(az, alt)); if (p) { pen ? c.lineTo(...p) : c.moveTo(...p); pen = true; } else pen = false; } c.stroke(); }
  }
  // horizon + cardinal points
  c.strokeStyle = 'rgba(61,255,154,.55)'; c.lineWidth = 1.5; c.beginPath(); { let pen = false; for (let az = 0; az <= 360; az += 2) { const p = P(enu(az, 0)); if (p) { pen ? c.lineTo(...p) : c.moveTo(...p); pen = true; } else pen = false; } } c.stroke();
  for (let i = 0; i < 8; i++) { const p = P(enu(i * 45, 0)); if (p) { c.fillStyle = i % 2 ? 'rgba(61,255,154,.7)' : '#3dff9a'; c.font = (i % 2 ? '12px ' : 'bold 15px ') + 'Sarabun'; c.textAlign = 'center'; c.fillText(DIRS_EN[i], p[0], p[1] - 6); if (i % 2 === 0) { c.font = '11px Sarabun'; c.fillText(DIRS[i], p[0], p[1] + 14); } } }
  // zenith marker
  { const p = P([0, 0, 1]); if (p) { c.strokeStyle = 'rgba(60,231,255,.4)'; c.beginPath(); c.arc(p[0], p[1], 6, 0, 7); c.stroke(); c.fillStyle = 'rgba(60,231,255,.6)'; c.font = '11px Sarabun'; c.textAlign = 'center'; c.fillText('จุดเหนือศีรษะ', p[0], p[1] - 10); } }
  // constellation lines
  if (opt.lines) {
    c.lineWidth = 1; c.strokeStyle = 'rgba(60,231,255,.38)'; c.beginPath();
    for (const l of lines) {
      let prev = null;
      for (const pt of l.pts) {
        const p = (opt.below || pt.v[2] > -0.05) ? P(pt.v) : null;
        if (p && prev) { c.moveTo(prev[0], prev[1]); c.lineTo(p[0], p[1]); }
        prev = p;
      }
    }
    c.stroke();
  }
  if (opt.conNames) for (const k of cons) {
    if (!opt.below && k.v[2] < 0) continue;
    const p = P(k.v); if (!p) continue;
    label(k.name, p[0], p[1], `rgba(168,244,255,${0.75 * dimBelow(k.v)})`, CON_TH[k.id] ? 13 : 11, CON_TH[k.id] ? 2 : 0);
    hits.push({ x: p[0], y: p[1], r: 22, o: k });
  }
  // stars
  const magLim = opt.mag + (mode === 'drag' ? Math.max(0, (60 - view.fovV) / 40) : 0);
  for (const s of stars) {
    if (s.mag > magLim) break;
    if (!opt.below && s.v[2] < 0) continue;
    const p = P(s.v); if (!p) continue;
    const r = Math.max(0.7, 3.4 - 0.62 * s.mag);
    c.globalAlpha = dimBelow(s.v) * clamp(1.25 - s.mag * 0.13, 0.35, 1);
    if (s.mag < 1.5) { const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r * 4, 0, 7); c.fill(); }
    c.fillStyle = bvColor(s.bv); c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill();
    c.globalAlpha = 1;
    if (s.name) { if (opt.starNames && s.mag < 2.3) label(s.name, p[0] + r + 4, p[1] + 4, 'rgba(255,240,200,.9)', 12, s.mag < 1 ? 3 : 1); hits.push({ x: p[0], y: p[1], r: 18, o: s }); }
  }
  { const p = P(pleiades.v); if (p && (opt.below || pleiades.v[2] > 0)) { c.strokeStyle = 'rgba(180,200,255,.6)'; c.beginPath(); c.arc(p[0], p[1], 9, 0, 7); c.stroke(); if (opt.starNames) label('ดาวลูกไก่', p[0] + 12, p[1] + 4, 'rgba(200,215,255,.9)', 12, 2); hits.push({ x: p[0], y: p[1], r: 20, o: pleiades }); } }
  // planets, sun, moon
  for (const b of bodies) {
    if (!opt.below && b.alt < 0) continue;
    const p = P(b.v); if (!p) continue;
    c.globalAlpha = dimBelow(b.v);
    const r = b.id === 'Sun' || b.id === 'Moon' ? Math.max(7, f * 0.0045) : 4;
    c.fillStyle = b.color; c.shadowColor = b.color; c.shadowBlur = 14;
    c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill(); c.shadowBlur = 0;
    if (b.id === 'Moon') drawMoonPhase(p, r);
    c.globalAlpha = 1;
    label(b.sym + ' ' + b.name, p[0] + r + 5, p[1] - r - 2, b.color, 14, 5);
    hits.push({ x: p[0], y: p[1], r: 26, o: b });
  }
  // satellites
  if (opt.sats) for (const s of sats) {
    if (!s.v || s.alt < (opt.below ? -90 : 0)) continue;
    const p = P(s.v); if (!p) continue;
    c.globalAlpha = dimBelow(s.v);
    c.fillStyle = s.key ? '#ff7ad9' : 'rgba(255,122,217,.6)';
    c.fillRect(p[0] - (s.key ? 3 : 1.5), p[1] - (s.key ? 3 : 1.5), s.key ? 6 : 3, s.key ? 6 : 3);
    if (s.key) { c.strokeStyle = '#ff7ad9'; c.strokeRect(p[0] - 7, p[1] - 7, 14, 14); label('🛰 ' + (s.id === 25544 ? 'ISS' : s.id === 48274 ? 'เทียนกง' : 'ฮับเบิล'), p[0] + 10, p[1] - 8, '#ff7ad9', 13, 4); }
    c.globalAlpha = 1;
    hits.push({ x: p[0], y: p[1], r: s.key ? 22 : 12, o: s });
  }
  // labels with simple collision avoidance
  labels.sort((a, b) => b.prio - a.prio);
  const placed = [];
  c.textAlign = 'left';
  for (const L of labels) {
    c.font = `${L.size}px Sarabun`;
    const w = c.measureText(L.txt).width, box = [L.x, L.y - L.size, w, L.size + 3];
    if (placed.some(q => box[0] < q[0] + q[2] && q[0] < box[0] + box[2] && box[1] < q[1] + q[3] && q[1] < box[1] + box[3])) continue;
    placed.push(box);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillText(L.txt, L.x + 1, L.y + 1);
    c.fillStyle = L.color; c.fillText(L.txt, L.x, L.y);
  }
  drawTarget(P, cx, cy);
  drawTapes(f);
  drawCrosshair(cx, cy);
}
function drawMoonPhase(p, r) {
  const ph = A.MoonPhase(A.MakeTime(now()));   // 0 new · 90 first quarter · 180 full
  const k = Math.cos(ph * D2R), side = ph < 180 ? 1 : -1;   // waxing: lit limb on the right
  const c = ctx; c.save();
  c.fillStyle = '#20242c'; c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill();
  c.fillStyle = '#f2f2e6'; c.beginPath();
  for (let i = 0; i <= 24; i++) { const t = -Math.PI / 2 + Math.PI * i / 24; c.lineTo(p[0] + side * r * Math.cos(t), p[1] + r * Math.sin(t)); }   // lit limb
  for (let i = 0; i <= 24; i++) { const t = Math.PI / 2 - Math.PI * i / 24; c.lineTo(p[0] + side * k * r * Math.cos(t), p[1] + r * Math.sin(t)); } // terminator
  c.fill(); c.restore();
}
function drawCrosshair(cx, cy) {
  const c = ctx; c.strokeStyle = 'rgba(60,231,255,.5)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(cx - 14, cy); c.lineTo(cx - 5, cy); c.moveTo(cx + 5, cy); c.lineTo(cx + 14, cy); c.moveTo(cx, cy - 14); c.lineTo(cx, cy - 5); c.moveTo(cx, cy + 5); c.lineTo(cx, cy + 14); c.stroke();
  const [az, alt] = camAzAlt();
  $('#readout').textContent = `ทิศ ${az.toFixed(0).padStart(3, '0')}° ${dirName(az)} · มุมเงย ${alt >= 0 ? '+' : ''}${alt.toFixed(0)}°`;
}
function camAzAlt() {
  const [, alt] = azalt(F);
  const ref = Math.abs(F[2]) > 0.97 ? U.map(x => x * Math.sign(F[2]) * -1) : F;  // straight up: use screen-top direction
  const [az] = azalt([ref[0], ref[1], 0]);
  return [az, alt];
}
function drawTapes(f) {
  const c = ctx, [az, alt] = camAzAlt();
  // compass tape (bottom)
  const y0 = H - dockH - 26, w = Math.min(W - 40, 520), x0 = (W - w) / 2, span = 90, pxd = w / span;
  c.fillStyle = 'rgba(0,10,18,.55)'; c.fillRect(x0, y0 - 18, w, 30);
  c.save(); c.beginPath(); c.rect(x0, y0 - 18, w, 30); c.clip();
  c.strokeStyle = 'rgba(60,231,255,.7)'; c.fillStyle = '#a8f4ff'; c.textAlign = 'center'; c.lineWidth = 1;
  for (let d = Math.floor((az - span / 2) / 5) * 5; d <= az + span / 2; d += 5) {
    const x = x0 + w / 2 + (d - az) * pxd, dd = ((d % 360) + 360) % 360;
    c.beginPath(); c.moveTo(x, y0 + 12); c.lineTo(x, y0 + 12 - (dd % 45 === 0 ? 12 : dd % 15 === 0 ? 7 : 4)); c.stroke();
    if (dd % 45 === 0) { c.font = 'bold 13px Sarabun'; c.fillStyle = dd % 90 === 0 ? '#3dff9a' : '#a8f4ff'; c.fillText(DIRS_EN[dd / 45], x, y0 - 4); }
    else if (dd % 15 === 0) { c.font = '10px "Share Tech Mono"'; c.fillStyle = 'rgba(168,244,255,.7)'; c.fillText(dd, x, y0 - 4); }
  }
  c.restore();
  c.fillStyle = '#ffc845'; c.beginPath(); c.moveTo(W / 2, y0 + 14); c.lineTo(W / 2 - 6, y0 + 22); c.lineTo(W / 2 + 6, y0 + 22); c.fill();
  // altitude scale (right)
  const xr = W - 14, hgt = Math.min(H * 0.5, 300), yc = H / 2;
  c.fillStyle = 'rgba(0,10,18,.45)'; c.fillRect(xr - 34, yc - hgt / 2, 34, hgt);
  c.save(); c.beginPath(); c.rect(xr - 34, yc - hgt / 2, 34, hgt); c.clip();
  const pa = hgt / 60;  // ±30° visible
  c.textAlign = 'right'; c.font = '10px "Share Tech Mono"';
  for (let a = Math.floor((alt - 30) / 5) * 5; a <= alt + 30; a += 5) {
    if (a < -90 || a > 90) continue;
    const y = yc - (a - alt) * pa;
    c.strokeStyle = a === 0 ? '#3dff9a' : 'rgba(60,231,255,.7)'; c.beginPath(); c.moveTo(xr, y); c.lineTo(xr - (a % 15 === 0 ? 10 : 5), y); c.stroke();
    if (a % 15 === 0) { c.fillStyle = a === 0 ? '#3dff9a' : '#a8f4ff'; c.fillText(a + '°', xr - 12, y + 3); }
  }
  c.restore();
  c.fillStyle = '#ffc845'; c.beginPath(); c.moveTo(xr - 36, yc); c.lineTo(xr - 44, yc - 6); c.lineTo(xr - 44, yc + 6); c.fill();
}
function drawTarget(P, cx, cy) {
  if (!target) return;
  const v = target.v; if (!v) return;
  const c = ctx, p = P(v), t = performance.now() / 1000;
  const inside = p && p[0] > 20 && p[0] < W - 20 && p[1] > 20 && p[1] < H - 20;
  const [taz, talt] = azalt(v);
  if (inside) {
    c.strokeStyle = '#ffc845'; c.lineWidth = 2; const r = 20 + 5 * Math.sin(t * 5);
    c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.stroke();
    c.fillStyle = '#ffc845'; c.font = '600 14px Sarabun'; c.textAlign = 'center'; c.fillText('🎯 ' + target.name, p[0], p[1] + r + 18);
    if (talt < 0) { c.font = '12px Sarabun'; c.fillText('(อยู่ใต้ขอบฟ้า — มองไม่เห็นตอนนี้)', p[0], p[1] + r + 34); }
    return;
  }
  const dx = dot(v, RT), dy = dot(v, U);
  let ang = Math.atan2(-dy, dx); if (Math.hypot(dx, dy) < 1e-3) ang = Math.PI / 2;
  const R = Math.min(W, H) / 2 - 70, x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = '#ffc845'; c.shadowColor = '#ffc845'; c.shadowBlur = 12;
  c.beginPath(); c.moveTo(24, 0); c.lineTo(-6, -14); c.lineTo(0, 0); c.lineTo(-6, 14); c.closePath(); c.fill();
  c.restore();
  const sep = Math.acos(clamp(dot(v, F), -1, 1)) * R2D;
  const hint = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'หันขวา' : 'หันซ้าย') : (dy > 0 ? 'เงยขึ้น' : 'ก้มลง');
  c.font = '600 13px Sarabun'; c.textAlign = 'center'; c.fillStyle = '#ffc845';
  const tx = clamp(cx + Math.cos(ang) * (R - 40), 80, W - 80), ty = clamp(cy + Math.sin(ang) * (R - 40), 70, H - 90);
  c.fillText(`${target.name}`, tx, ty); c.font = '12px Sarabun';
  c.fillText(`${hint} · ห่าง ${sep.toFixed(0)}° · ทิศ ${taz.toFixed(0)}° เงย ${talt.toFixed(0)}°`, tx, ty + 16);
}

// ---------------- interaction ----------------
function tap(e) {
  const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 1e9;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.o; } }
  if (best) showInfo(best);
}
function close(sel) { $(sel).hidden = true; }
$$('[data-close]').forEach(b => b.onclick = () => b.closest('.sheet').hidden = true);
function openSheet(id) { $$('.sheet').forEach(s => s.hidden = s.id !== id); }

function showInfo(o) {
  const v = o.v, [az, alt] = v ? azalt(v) : [0, 0];
  const rows = [];
  let title = o.name, kind = '';
  const pos = () => rows.push(['ตำแหน่งตอนนี้', `ทิศ ${az.toFixed(1)}° (${dirName(az)}) · มุมเงย ${alt.toFixed(1)}°${alt < 0 ? ' — ใต้ขอบฟ้า' : ''}`]);
  if (o.type === 'planet') {
    kind = o.id === 'Sun' ? 'ดาวฤกษ์ของระบบสุริยะ' : o.id === 'Moon' ? 'ดาวบริวารของโลก' : 'ดาวเคราะห์';
    pos();
    if (o.mag != null) rows.push(['ความสว่าง (แมกนิจูด)', o.mag.toFixed(1)]);
    rows.push(['ระยะห่างจากโลก', o.id === 'Moon' ? `${Math.round(o.dist * 149597870.7).toLocaleString()} กม.` : `${o.dist.toFixed(3)} AU (${(o.dist * 149.6).toFixed(0)} ล้านกม.)`]);
    try {
      const t = A.MakeTime(now());
      const rise = A.SearchRiseSet(o.id, observer, +1, t, 1), set = A.SearchRiseSet(o.id, observer, -1, t, 1);
      rows.push(['ขึ้นครั้งถัดไป', hm(rise?.date) + ' น.'], ['ตกครั้งถัดไป', hm(set?.date) + ' น.']);
    } catch {}
    if (o.id === 'Moon') {
      const ph = A.MoonPhase(A.MakeTime(now())), ill = A.Illumination('Moon', A.MakeTime(now())).phase_fraction;
      const day = Math.round(ph / 12.19);
      const name = ph < 8 || ph > 352 ? 'เดือนดับ' : Math.abs(ph - 180) < 8 ? 'เต็มดวง (วันเพ็ญ)' : ph < 180 ? `ข้างขึ้น ~${day} ค่ำ` : `ข้างแรม ~${day - 15} ค่ำ`;
      rows.push(['ข้างขึ้น-ข้างแรม', `${name} · สว่าง ${(ill * 100).toFixed(0)}%`]);
    }
    if (o.id === 'Sun') rows.push(['⚠ คำเตือน', 'ห้ามมองดวงอาทิตย์ตรงๆ หรือส่องกล้องนานๆ']);
  } else if (o.type === 'star') {
    kind = 'ดาวฤกษ์' + (o.con ? ` · กลุ่มดาว${CON_TH[o.con] || o.con}` : '');
    if (o.en && o.en !== o.name) title += ` <small class="mono" style="color:var(--dim)">${o.en}</small>`;
    pos(); rows.push(['ความสว่าง (แมกนิจูด)', o.mag.toFixed(2) + (o.mag < 1 ? ' — สว่างมาก' : '')]);
    if (o.bv != null && o.id !== 'M45') rows.push(['สี', o.bv < 0.3 ? 'ขาวอมฟ้า (ร้อนมาก)' : o.bv < 0.8 ? 'ขาว-เหลือง' : o.bv < 1.3 ? 'ส้ม' : 'แดงส้ม (ค่อนข้างเย็น)']);
  } else if (o.type === 'con') {
    kind = 'กลุ่มดาว'; title += ` <small class="mono" style="color:var(--dim)">${o.la}</small>`; pos();
  } else if (o.type === 'sat') {
    kind = 'ดาวเทียม · NORAD ' + o.id;
    pos();
    if (o.height) rows.push(['ความสูงจากพื้นโลก', `${o.height.toFixed(0)} กม.`], ['ระยะห่างจากเรา', `${o.range.toFixed(0)} กม.`]);
    if (o.eci) rows.push(['ได้รับแสงอาทิตย์', sunlit(o.eci, now()) ? 'ใช่' : 'ไม่ (อยู่ในเงาโลก)']);
    if (o.key) rows.push(['รอบผ่านถัดไป', passText(o)]);
  }
  $('#infoBody').innerHTML = `<div class="kind">${kind}</div><h3>${title}</h3><table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <div class="acts"><button class="btn primary" id="bTgt">🎯 ชี้ทางไปหา</button></div>`;
  $('#bTgt').onclick = () => setTarget(o);
  openSheet('info');
}
function setTarget(o) {
  target = o; $$('.sheet').forEach(s => s.hidden = true);
  $('#bClearTarget').hidden = false;
  if (mode === 'drag' && o.v) { const [az, alt] = azalt(o.v); animateView(az, alt); }
  else toast('ทำตามลูกศรสีเหลืองเพื่อหา ' + o.name);
}
function animateView(az, alt) {
  const a0 = view.az, h0 = view.alt, da = wrap180(az - a0), t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 700), e = 1 - Math.pow(1 - k, 3); view.az = (a0 + da * e + 360) % 360; view.alt = h0 + (clamp(alt, -89, 89.9) - h0) * e; if (k < 1) requestAnimationFrame(step); };
  step();
}

// finder
let ftab = 'all';
function catalog() {
  const L = [];
  bodies.forEach(b => L.push(b));
  sats.filter(s => s.key || s.v && s.alt > 0).forEach(s => L.push(s));
  stars.filter(s => s.name).forEach(s => L.push(s));
  L.push(pleiades);
  cons.forEach(c => L.push(c));
  return L;
}
const ICON = { planet: '🪐', sat: '🛰', star: '✦', con: '✧' };
function renderFinder() {
  const q = $('#q').value.trim().toLowerCase();
  const list = catalog().filter(o => (ftab === 'all' || o.type === ftab) && (!q || (o.name + ' ' + (o.en || '') + ' ' + (o.la || '')).toLowerCase().includes(q)));
  const upv = o => o.v && o.v[2] > 0 ? 0 : 1;
  list.sort((a, b) => upv(a) - upv(b));
  $('#flist').innerHTML = list.slice(0, 120).map((o, i) => {
    const [, alt] = o.v ? azalt(o.v) : [0, -99];
    return `<button class="btn fi${alt > 0 ? ' up' : ''}" data-i="${i}"><span class="ic">${o.sym || ICON[o.type]}</span><b>${o.name}</b><small>${alt > -90 ? (alt > 0 ? `เหนือขอบฟ้า ${alt.toFixed(0)}°` : 'ใต้ขอบฟ้า') : ''}</small></button>`;
  }).join('') || '<p class="note">ไม่พบ</p>';
  $$('#flist .fi').forEach(b => b.onclick = () => showInfo(list[+b.dataset.i]));
}
$('#bFind').onclick = () => { openSheet('finder'); renderFinder(); };
$('#q').oninput = renderFinder;
$$('#ftabs .btn').forEach(b => b.onclick = () => { ftab = b.dataset.t; $$('#ftabs .btn').forEach(x => x.classList.toggle('on', x === b)); renderFinder(); });
$('#bClearTarget').onclick = () => { target = null; $('#bClearTarget').hidden = true; close('#finder'); };

// settings
$$('[data-opt]').forEach(i => { i.checked = !!opt[i.dataset.opt]; i.onchange = () => { opt[i.dataset.opt] = i.checked; saveOpt(); }; });
const bindRange = (id, key, fmt, fn) => { const s = $(id), v = $(id.replace('#s', '#v')); s.value = key ? opt[key] : 0; const upd = () => { if (key) { opt[key] = +s.value; saveOpt(); } v.textContent = fmt(+s.value); fn?.(+s.value); }; s.oninput = upd; upd(); };
bindRange('#sMag', 'mag', v => v.toFixed(1));
bindRange('#sFov', 'fov', v => v + '°');
bindRange('#sNudge', 'nudge', v => (v > 0 ? '+' : '') + v + '°');
bindRange('#sTime', null, v => v === 0 ? 'ตอนนี้' : `${v > 0 ? '+' : ''}${(v / 60).toFixed(1)} ชม.`, v => { timeOff = v; astro(true); lastSat = 0; });
$('#sTime').onchange = () => predictPasses();
function fillLoc() {
  $('#selLoc').innerHTML = `<option value="gps">📡 ใช้ GPS ของเครื่อง</option>` + CITIES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('') + `<option value="cur" selected>ปัจจุบัน: ${obs.name}</option>`;
}
fillLoc();
$('#selLoc').onchange = e => {
  const v = e.target.value;
  if (v === 'gps') return locate(true);
  if (v === 'cur') return;
  const [n, lat, lon] = CITIES[+v]; setLoc({ name: n, lat, lon, h: 10, src: 'city' });
};
$('#bSet').onclick = () => openSheet('settings');
$('#bMode').onclick = () => setMode(mode === 'sensor' ? 'drag' : 'sensor', true);

function setLoc(l) {
  obs = l; store.set('sky.loc', l); fillLoc(); astro(true); lastSat = 0;
  $('#chipLoc').textContent = `📍 ${l.name} ${l.lat.toFixed(2)}°, ${l.lon.toFixed(2)}°`;
  if (sats.length) predictPasses();
}
function locate(explicit) {
  if (!navigator.geolocation) { if (explicit) toast('เครื่องนี้ไม่มี GPS — ใช้ตำแหน่งจากรายการเมืองแทน'); return; }
  navigator.geolocation.getCurrentPosition(
    p => setLoc({ name: 'GPS', lat: p.coords.latitude, lon: p.coords.longitude, h: p.coords.altitude || 0, src: 'gps' }),
    e => { toast(e.code === 1 ? 'ไม่ได้รับอนุญาตใช้ตำแหน่ง — ใช้ ' + obs.name + ' แทน (เปลี่ยนได้ในตั้งค่า)' : 'หาตำแหน่งไม่ได้ — ใช้ ' + obs.name + ' แทน'); fillLoc(); },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 });
}

function setMode(m, user) {
  if (m === 'sensor' && !gotOri) { toast('ไม่พบเซนเซอร์ทิศทาง/เข็มทิศ — ใช้โหมดลากดูเอง'); m = 'drag'; }
  mode = m;
  if (m === 'drag') { const [az, alt] = camAzAlt(); view.az = az; view.alt = clamp(alt, -60, 89); }
  video.style.display = m === 'sensor' && hasCam ? '' : 'none';
  $('#bMode').textContent = m === 'sensor' ? '🧭 เซนเซอร์' : '✋ ลากดูเอง';
  $('#bMode').classList.toggle('on', m === 'sensor');
  if (user) toast(m === 'sensor' ? 'โหมด AR: ยกมือถือส่องฟ้า' : 'โหมดลากดูเอง: ลากนิ้ว/เมาส์เพื่อมองรอบๆ · หมุนล้อ/บีบนิ้วเพื่อซูม');
}
setInterval(() => {   // compass calibration hint
  const ch = $('#chipCal');
  if (mode !== 'sensor') { ch.hidden = true; return; }
  if (hdgOff == null && !absolute) { ch.hidden = false; ch.textContent = isIOS() ? '🧭 กำลังรอเข็มทิศ…' : '🧭 ไม่มีทิศจริง — ใช้ “ปรับทิศเอง” ในตั้งค่า'; }
  else if (compassAcc != null && (compassAcc < 0 || compassAcc > 25)) { ch.hidden = false; ch.textContent = `🧭 เข็มทิศคลาด ±${compassAcc < 0 ? '?' : compassAcc.toFixed(0)}° — โบกมือถือเป็นเลข 8`; }
  else ch.hidden = true;
}, 1000);

// ---------------- start ----------------
const touchy = isIOS() || /Android/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('ar');
$('#chipLoc').textContent = `📍 ${obs.name} ${obs.lat.toFixed(2)}°, ${obs.lon.toFixed(2)}°`;
const dataP = loadData().then(() => astro(true)).catch(e => { console.error(e); toast('โหลดแคตตาล็อกดาวไม่สำเร็จ — ตรวจอินเทอร์เน็ต', 6000); });
requestAnimationFrame(draw);

await gate({
  title: 'SKY//AR',
  lines: [
    'ยกมือถือขึ้นส่องท้องฟ้า ระบบจะบอกชื่อดาว กลุ่มดาว ดาวเคราะห์ ดวงจันทร์ และสถานีอวกาศ ISS',
    'ต้องอนุญาต: กล้องหลัง · เซนเซอร์ทิศทาง/เข็มทิศ · ตำแหน่ง (คำนวณในเครื่อง ไม่ส่งออก)',
    'ถ้าไม่อนุญาตหรือเปิดบนคอม → ใช้โหมด “ลากดูเอง” ได้ (ลากเมาส์ · หมุนล้อซูม)',
    'แตะชื่อดาวเพื่อดูรายละเอียด · ปุ่ม 🔍 ค้นหา จะมีลูกศรชี้ทางไปหา',
  ],
  needs: touchy ? ['camera', 'orientation'] : [], // orientation → always via the tap (iOS)
  button: touchy ? '▶ เปิดกล้องส่องฟ้า' : '▶ เริ่ม (โหมดลากดูเอง)',
  async onStart() {
    if (touchy) {
      // motion permission must be requested first, while still inside the tap
      let motionOK = true;
      try { await askMotion(); } catch (e) { motionOK = false; toast('ไม่ได้รับอนุญาตเซนเซอร์ทิศทาง — ใช้โหมดลากดูเองแทน (เปิดสิทธิ์: ตั้งค่า › Safari › การเคลื่อนไหวและการวางแนว)', 7000); }
      try { await camera(video, { facing: 'environment' }); hasCam = true; }
      catch (e) { toast('เปิดกล้องไม่ได้ — ' + permMsg(e) + ' · แสดงท้องฟ้าจำลองแทน', 6000); }
      wakeLock();
      setMode('drag');
      if (motionOK) setTimeout(() => { setMode(gotOri ? 'sensor' : 'drag', false); if (!gotOri) toast('ไม่พบเซนเซอร์ทิศทาง — ใช้โหมดลากดูเอง'); }, 1500);
    }
    if (obs.src !== 'city') locate(false);
  },
});
resize();
if (!touchy) setMode('drag');
await dataP;
loadSats();

// expose for testing
window.__sky = { get F() { return F; }, get U() { return U; }, get RT() { return RT; }, view, opt, get bodies() { return bodies; }, get stars() { return stars; }, get sats() { return sats; }, setMode, setLoc, focal, set timeOff(v) { timeOff = v; astro(true); }, get mode() { return mode; }, A, astro, frameFromSensors, get W() { return W; }, get H() { return H; } };
