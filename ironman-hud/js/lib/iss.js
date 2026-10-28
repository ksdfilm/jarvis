// สถานีอวกาศนานาชาติ (ISS): คำนวณตำแหน่งจากข้อมูลวงโคจร TLE (CelesTrak ฟรี) ด้วย satellite.js
// + หารอบที่ "มองเห็นด้วยตาเปล่า" จากตำแหน่งเรา: ISS อยู่สูง ≥10°, ท้องฟ้าเรามืดแล้ว (ดวงอาทิตย์ต่ำกว่า -6°), และ ISS ยังโดนแสงอาทิตย์
import { loadScript, getJSON } from './load.js';

export const SAT_JS = 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js';
export const ASTRO_JS = 'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js';
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const TLE_FALLBACK = 'https://api.wheretheiss.at/v1/satellites/25544/tles';
const DEG = 180 / Math.PI;

let satrec = null;

/** โหลด TLE (เก็บไว้ในเครื่อง 12 ชม. — CelesTrak ขอให้ไม่ดึงถี่) */
export async function initIss(store) {
  await loadScript(SAT_JS);
  let tle = store.get('issTle', null);
  if (!tle || Date.now() - tle.at > 12 * 3600e3) {
    let fresh = null;
    try {
      const txt = await (await fetch(TLE_URL)).text();
      const lines = txt.trim().split(/\r?\n/).map((l) => l.trim());
      if (lines.length >= 3 && lines[1].startsWith('1 ')) fresh = { l1: lines[1], l2: lines[2] };
    } catch { /* ลองแหล่งสำรอง */ }
    // แหล่งสำรอง: CelesTrak บล็อก IP ชั่วคราวถ้าดึงถี่ (คนในบริษัทใช้ IP เดียวกัน) → wheretheiss.at ฟรีเหมือนกัน
    if (!fresh) {
      try { const j = await getJSON(TLE_FALLBACK); if (j.line1?.startsWith('1 ')) fresh = { l1: j.line1, l2: j.line2 }; } catch { /* ใช้ของเดิม */ }
    }
    if (fresh) { tle = { ...fresh, at: Date.now() }; store.set('issTle', tle); }
  }
  if (!tle) throw new Error('no TLE');
  satrec = satellite.twoline2satrec(tle.l1, tle.l2);
  return tle;
}

/** ตำแหน่ง ISS ณ เวลา d → { lat, lon, alt(km), speed(km/h), eci } */
export function issAt(d = new Date()) {
  const pv = satellite.propagate(satrec, d);
  if (!pv.position) return null;
  const gmst = satellite.gstime(d);
  const g = satellite.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return { lat: g.latitude * DEG, lon: satellite.degreesLong(g.longitude), alt: g.height, speed: Math.hypot(v.x, v.y, v.z) * 3600, eci: pv.position, gmst };
}

/** เส้นทางโคจร (ใช้วาดเส้นบนลูกโลก) */
export function issTrack(fromMin = -45, toMin = 95, stepMin = 1) {
  const out = [], now = Date.now();
  for (let m = fromMin; m <= toMin; m += stepMin) { const p = issAt(new Date(now + m * 60000)); if (p) out.push(p); }
  return out;
}

/** มุมเงยของ ISS จากผู้สังเกต (องศา) */
function lookAngle(d, obs) {
  const pv = satellite.propagate(satrec, d);
  if (!pv.position) return null;
  const gmst = satellite.gstime(d);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const la = satellite.ecfToLookAngles({ latitude: obs.lat / DEG, longitude: obs.lon / DEG, height: 0.01 }, ecf);
  return { el: la.elevation * DEG, az: la.azimuth * DEG, eci: pv.position };
}

/** ISS โดนแสงอาทิตย์ไหม (เงาโลกแบบทรงกระบอก — แม่นพอสำหรับดูด้วยตา) */
function sunlit(eci, d) {
  const s = Astronomy.GeoVector(Astronomy.Body.Sun, d, true); // AU, J2000 (ต่างจาก TEME เล็กน้อย ไม่มีผล)
  const sl = Math.hypot(s.x, s.y, s.z), sx = s.x / sl, sy = s.y / sl, sz = s.z / sl;
  const dot = eci.x * sx + eci.y * sy + eci.z * sz;
  if (dot > 0) return true; // อยู่ฝั่งเดียวกับดวงอาทิตย์
  const perp = Math.hypot(eci.x - dot * sx, eci.y - dot * sy, eci.z - dot * sz);
  return perp > 6371;
}
function sunAlt(d, obs) {
  const ob = new Astronomy.Observer(obs.lat, obs.lon, 0);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, d, ob, true, true);
  return Astronomy.Horizon(d, ob, eq.ra, eq.dec, 'normal').altitude;
}
const COMPASS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
export const dirTh = (az) => COMPASS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

/** หารอบที่ ISS ผ่านฟ้าตำแหน่ง obs ใน hours ชม.ข้างหน้า → [{ start, peak, end, maxEl, azStart, azEnd, visible }] */
export async function issPasses(obs, hours = 72) {
  await loadScript(ASTRO_JS);
  const out = [], step = 30e3, t0 = Date.now(), t1 = t0 + hours * 3600e3;
  let cur = null;
  for (let t = t0; t <= t1; t += step) {
    const d = new Date(t), a = lookAngle(d, obs);
    if (!a) continue;
    if (a.el >= 10) {
      if (!cur) cur = { start: d, maxEl: a.el, peak: d, azStart: a.az, visible: false };
      if (a.el > cur.maxEl) { cur.maxEl = a.el; cur.peak = d; }
      // มองเห็นได้ถ้ามีช่วงใดช่วงหนึ่งที่ฟ้ามืดและ ISS โดนแดด
      if (!cur.visible && sunAlt(d, obs) < -6 && sunlit(a.eci, d)) cur.visible = true;
      cur.end = d; cur.azEnd = a.az;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
