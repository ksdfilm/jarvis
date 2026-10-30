// Live Earth from Space — ภาพดาวเทียม NASA GIBS รายวัน + เส้นกลางวัน/กลางคืนสด + จุดดวงอาทิตย์ตั้งฉาก
import { bar, store, toast, $, isPhone } from '../common/lab.js';

const L = window.L;
const RAD = Math.PI / 180;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const ATTR = 'ภาพ: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · เหตุการณ์: NASA EONET';

bar('LIVE EARTH', 'ภาพดาวเทียมรายวัน + กลางวัน/กลางคืนสด', '<span class="mono" id="utc" style="color:var(--dim);font-size:13px"></span>');

// ---------- ดวงอาทิตย์ (สูตร NOAA) ----------
function sunInfo(d) {
  const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const g = 2 * Math.PI / 365 * (N - 1 + (d.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lon = -(utcMin + eot - 720) / 4;
  return { decl, eot, lat: decl / RAD, lon: ((lon + 540) % 360 + 360) % 360 - 180 };
}
// มุมเงยดวงอาทิตย์ (องศา) ที่ lat/lon
function sunElev(lat, lon, s) {
  const H = (lon - s.lon) * RAD;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(s.decl) + Math.cos(lat * RAD) * Math.cos(s.decl) * Math.cos(H)) / RAD;
}
// ละติจูดที่ดวงอาทิตย์อยู่ที่มุมเงย h องศา สำหรับลองจิจูด lon
function latAtElev(lon, h, s) {
  const A = Math.sin(s.decl), B = Math.cos(s.decl) * Math.cos((lon - s.lon) * RAD);
  const R = Math.hypot(A, B), a = Math.atan2(B, A), x = Math.sin(h * RAD) / R;
  if (x > 1 || x < -1) return null;
  const norm = v => Math.atan2(Math.sin(v), Math.cos(v));
  for (const v of [norm(Math.asin(x) - a), norm(Math.PI - Math.asin(x) - a)]) if (Math.abs(v) <= Math.PI / 2 + 1e-9) return v / RAD;
  return null;
}
// โพลีกอนฝั่งที่ดวงอาทิตย์ต่ำกว่า h องศา (วาด 3 รอบโลกให้ลากแผนที่ได้)
function nightPoly(h, s) {
  const pole = s.decl >= 0 ? -85 : 85; // ขั้วที่มืดกว่า
  const pts = [];
  let last = 0;
  for (let lon = -540; lon <= 540; lon += 2) {
    let lat = latAtElev(lon, h, s);
    if (lat === null) lat = sunElev(0, lon, s) < h ? -pole : pole; // ทั้งเส้นลองจิจูดมืด/สว่าง
    lat = Math.max(-85, Math.min(85, lat));
    last = lat;
    pts.push([lat, lon]);
  }
  return [[pole, -540], ...pts, [pole, 540]];
}
// เวลาขึ้น/ตก (UTC ms) ของวันที่ d ที่ lat/lon
function riseSet(lat, lon, d) {
  const noonGuess = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12) - lon / 15 * 3600e3);
  const s = sunInfo(noonGuess);
  const noon = Date.UTC(noonGuess.getUTCFullYear(), noonGuess.getUTCMonth(), noonGuess.getUTCDate()) + (720 - 4 * lon - s.eot) * 60e3;
  const c = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(s.decl)) / (Math.cos(lat * RAD) * Math.cos(s.decl));
  if (c > 1) return { noon, polar: 'night' };
  if (c < -1) return { noon, polar: 'day' };
  const H = Math.acos(c) / RAD * 4 * 60e3;
  return { noon, rise: noon - H, set: noon + H };
}

// ---------- แผนที่ ----------
const saved = store.get('earth.view', { lat: 13.75, lon: 100.5, z: isPhone() ? 3 : 4 });
const map = L.map('map', { worldCopyJump: true, minZoom: 2, maxZoom: 9, zoomSnap: 0.5, attributionControl: true, preferCanvas: false })
  .setView([saved.lat, saved.lon], saved.z);
map.attributionControl.setPrefix(false);
map.on('moveend', () => { const c = map.getCenter(); store.set('earth.view', { lat: c.lat, lon: c.wrap().lng, z: map.getZoom() }); renderCard(); });

const iso = d => d.toISOString().slice(0, 10);
const dayDate = () => { const v = +$('#day').value; return new Date(Date.now() - (30 - v) * 864e5); };

const BASES = {
  viirs: { name: 'VIIRS SNPP สีจริง', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', lvl: 9, ext: 'jpg', daily: true },
  noaa20: { name: 'VIIRS NOAA-20 สีจริง', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', lvl: 9, ext: 'jpg', daily: true },
  modis: { name: 'MODIS Terra สีจริง', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', lvl: 9, ext: 'jpg', daily: true },
  dnb: { name: 'กลางคืนรายวัน (VIIRS DNB)', layer: 'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance', lvl: 8, ext: 'png', daily: true },
  marble: { name: 'Black Marble แสงไฟเมือง', layer: 'VIIRS_Black_Marble', lvl: 8, ext: 'png', fixed: '2016-01-01' },
  relief: { name: 'Blue Marble ภูมิประเทศ', layer: 'BlueMarble_ShadedRelief_Bathymetry', lvl: 8, ext: 'jpeg', fixed: '2004-08-01' },
};
const OVER = {
  clouds: { name: 'อุณหภูมิยอดเมฆ (MODIS)', layer: 'MODIS_Terra_Cloud_Top_Temp_Day', lvl: 6, ext: 'png', daily: true, opacity: 0.55 },
  coast: { name: 'เส้นชายฝั่ง/พรมแดน', layer: 'Coastlines_15m', lvl: 13, ext: 'png', fixed: '2020-01-01', opacity: 0.8 },
  labels: { name: 'ชื่อสถานที่', layer: 'Reference_Labels_15m', lvl: 13, ext: 'png', fixed: '2020-01-01' },
};
const gibsUrl = (o, date) => `${GIBS}/${o.layer}/default/${o.fixed || date}/GoogleMapsCompatible_Level${o.lvl}/{z}/{y}/{x}.${o.ext}`;
const mk = (o, date) => L.tileLayer(gibsUrl(o, date), { maxNativeZoom: o.lvl, maxZoom: 9, tileSize: 256, opacity: o.opacity ?? 1, attribution: ATTR, bounds: [[-85.0511, -1e4], [85.0511, 1e4]], crossOrigin: true });

const st = store.get('earth.layers', { base: 'viirs', clouds: false, coast: true, labels: true, night: true, sun: true, events: true });
let baseLayer = null; const overLayers = {};

function applyLayers() {
  const date = iso(dayDate());
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = mk(BASES[st.base], date).addTo(map);
  baseLayer.bringToBack();
  for (const k in OVER) {
    if (overLayers[k]) { map.removeLayer(overLayers[k]); overLayers[k] = null; }
    if (st[k]) overLayers[k] = mk(OVER[k], date).addTo(map);
  }
  nightGroup[st.night ? 'addTo' : 'remove'](map);
  sunMarker[st.sun ? 'addTo' : 'remove'](map);
  eventsGroup[st.events ? 'addTo' : 'remove'](map);
  store.set('earth.layers', st);
  const b = BASES[st.base];
  $('#dayLbl').textContent = b.fixed ? `ภาพปี ${b.fixed.slice(0, 4)}` : fmtDay(dayDate());
  $('#day').disabled = !!b.fixed;
}
const fmtDay = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

// ---------- กลางวัน/กลางคืน ----------
const nightGroup = L.layerGroup();
const SHADES = [[0, 0.35], [-6, 0.2], [-12, 0.2], [-18, 0.2]]; // ทับซ้อนกัน: ยิ่งลึกยิ่งมืด
const nightPolys = SHADES.map(([, op]) => L.polygon([], { stroke: false, fillColor: '#000814', fillOpacity: op, interactive: false }).addTo(nightGroup));
const termLine = L.polyline([], { color: '#ffc845', weight: 1.2, opacity: 0.8, dashArray: '4 4', interactive: false }).addTo(nightGroup);
const sunMarker = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="sun-ic"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }), title: 'จุดดวงอาทิตย์ตั้งฉาก' })
  .bindPopup('');

function updateSun() {
  const now = new Date(), s = sunInfo(now);
  SHADES.forEach(([h], i) => nightPolys[i].setLatLngs(nightPoly(h, s)));
  const line = [];
  for (let lon = -540; lon <= 540; lon += 2) { const la = latAtElev(lon, 0, s); if (la !== null) line.push([Math.max(-85, Math.min(85, la)), lon]); }
  termLine.setLatLngs(line);
  // ให้จุดดวงอาทิตย์อยู่ใกล้ฝั่งที่กำลังดู
  const c = map.getCenter().lng; let lon = s.lon; while (lon - c > 180) lon -= 360; while (c - lon > 180) lon += 360;
  sunMarker.setLatLng([s.lat, lon]);
  sunMarker.setPopupContent(`<b>☀ จุดดวงอาทิตย์ตั้งฉาก</b><br>ละติจูด ${s.lat.toFixed(2)}° · ลองจิจูด ${s.lon.toFixed(2)}°<br><span style="color:var(--dim)">ตรงนี้ดวงอาทิตย์อยู่กลางหัวพอดี (มุมเงย 90°)</span>`);
  renderCard();
}

// ---------- การ์ด "ตอนนี้" ----------
const tm = ms => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
function renderCard() {
  const now = new Date(), s = sunInfo(now);
  const c = map.getCenter().wrap(), lat = c.lat, lon = c.lng;
  const el = sunElev(lat, lon, s);
  const rs = riseSet(lat, lon, now);
  const solarMin = ((now.getUTCHours() * 60 + now.getUTCMinutes() + lon * 4 + s.eot) % 1440 + 1440) % 1440;
  const phase = el > 0 ? '☀ กลางวัน' : el > -6 ? '🌇 สนธยา (civil)' : el > -12 ? '🌆 สนธยาเดินเรือ' : el > -18 ? '🌌 สนธยาดาราศาสตร์' : '🌙 กลางคืน';
  const len = rs.rise ? (rs.set - rs.rise) / 3600e3 : rs.polar === 'day' ? 24 : 0;
  $('#card').innerHTML = `<h3>◉ ตอนนี้ ณ กลางแผนที่</h3>
    <div class="row"><span class="clock">${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span style="align-self:center">${phase}</span></div>
    <div class="grid2">
      <div class="row"><span>พิกัด</span><b>${lat.toFixed(2)}, ${lon.toFixed(2)}</b></div>
      <div class="row"><span>มุมเงยดวงอาทิตย์</span><b>${el.toFixed(1)}°</b></div>
      <div class="row"><span>🌅 ขึ้น</span><b>${rs.rise ? tm(rs.rise) : rs.polar === 'day' ? 'ไม่ตก' : 'ไม่ขึ้น'}</b></div>
      <div class="row"><span>🌇 ตก</span><b>${rs.set ? tm(rs.set) : '—'}</b></div>
      <div class="row more"><span>เที่ยงสุริยะ</span><b>${tm(rs.noon)}</b></div>
      <div class="row more"><span>ความยาวกลางวัน</span><b>${Math.floor(len)} ชม. ${Math.round(len % 1 * 60)} น.</b></div>
      <div class="row more"><span>เวลาสุริยะท้องถิ่น</span><b>${String(Math.floor(solarMin / 60)).padStart(2, '0')}:${String(Math.floor(solarMin % 60)).padStart(2, '0')}</b></div>
      <div class="row more"><span>ดวงอาทิตย์ตั้งฉาก</span><b>${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°</b></div>
    </div>
    <div class="note more" style="margin-top:4px">เวลาแสดงตามเขตเวลาของเครื่องคุณ · ลากแผนที่เพื่อดูที่อื่น</div>`;
}

// ---------- เหตุการณ์ธรรมชาติ (NASA EONET) ----------
const eventsGroup = L.layerGroup();
const EV = { wildfires: ['🔥', 'ไฟป่า', ''], severeStorms: ['🌀', 'พายุ', 'storm'], volcanoes: ['🌋', 'ภูเขาไฟ', 'volc'], seaLakeIce: ['🧊', 'น้ำแข็ง', 'storm'], floods: ['🌊', 'น้ำท่วม', 'storm'] };
let evCount = 0;
async function loadEvents() {
  try {
    const r = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=600');
    const d = await r.json();
    eventsGroup.clearLayers(); evCount = 0;
    const cap = isPhone() ? 250 : 800;
    for (const e of d.events) {
      if (evCount >= cap) break;
      const cat = e.categories[0]?.id; const meta = EV[cat] || ['⚠', e.categories[0]?.title || 'เหตุการณ์', ''];
      const g = e.geometry[e.geometry.length - 1];
      if (!g || g.type !== 'Point') continue;
      const [lon, lat] = g.coordinates;
      if (cat === 'severeStorms' && e.geometry.length > 1) {
        L.polyline(e.geometry.filter(x => x.type === 'Point').map(x => [x.coordinates[1], x.coordinates[0]]), { color: '#3ce7ff', weight: 1.5, opacity: 0.7, interactive: false }).addTo(eventsGroup);
      }
      const mag = g.magnitudeValue ? ` · ${g.magnitudeValue.toLocaleString()} ${g.magnitudeUnit || ''}` : '';
      L.marker([lat, lon], { icon: L.divIcon({ className: '', html: `<div class="ev-ic ${meta[2]}">${meta[0]}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindPopup(`<b>${meta[0]} ${meta[1]}</b><br>${e.title}<br><span style="color:var(--dim)">อัปเดต ${new Date(g.date).toLocaleString('th-TH')}${mag}</span><br><a href="${e.sources?.[0]?.url || e.link}" target="_blank" rel="noopener">แหล่งข้อมูล ↗</a>`)
        .addTo(eventsGroup);
      evCount++;
    }
    renderLayers();
  } catch (e) { console.warn('EONET', e); toast('โหลดเหตุการณ์จาก NASA EONET ไม่สำเร็จ'); }
}

// ---------- ตำแหน่งฉัน ----------
let meMarker = null;
function locate() {
  if (!isSecureContext || !navigator.geolocation) { map.flyTo([13.75, 100.5], 6); toast('ใช้ตำแหน่งได้เฉพาะ https/localhost — ไปที่กรุงเทพฯ แทน'); return; }
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.latitude, p.coords.longitude];
    meMarker?.remove();
    meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-ic"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map).bindPopup('คุณอยู่ที่นี่');
    map.flyTo(ll, 6);
  }, () => { map.flyTo([13.75, 100.5], 6); toast('ไม่ได้รับสิทธิ์ตำแหน่ง — ไปที่กรุงเทพฯ แทน'); }, { timeout: 8000 });
}

// ---------- แผงเลือกชั้นภาพ ----------
function renderLayers() {
  const box = $('#layers');
  box.innerHTML = `<h3>ภาพพื้นหลัง</h3>${Object.entries(BASES).map(([k, b]) => `<label><input type="radio" name="base" value="${k}" ${st.base === k ? 'checked' : ''}>${b.name}${b.fixed ? `<span class="x">${b.fixed.slice(0, 4)}</span>` : ''}</label>`).join('')}
    <h3>ซ้อนทับ</h3>
    <label><input type="checkbox" data-k="night" ${st.night ? 'checked' : ''}>เงากลางคืน + เส้นแบ่งสด</label>
    <label><input type="checkbox" data-k="sun" ${st.sun ? 'checked' : ''}>☀ จุดดวงอาทิตย์ตั้งฉาก</label>
    <label><input type="checkbox" data-k="events" ${st.events ? 'checked' : ''}>ไฟป่า/พายุ/ภูเขาไฟ<span class="x">${evCount}</span></label>
    ${Object.entries(OVER).map(([k, o]) => `<label><input type="checkbox" data-k="${k}" ${st[k] ? 'checked' : ''}>${o.name}</label>`).join('')}
    <div class="seg" style="margin-top:8px"><button class="btn" id="goTh">🇹🇭 ไทย</button><button class="btn" id="goMe">◎ ตำแหน่งฉัน</button><button class="btn" id="goWorld">🌐 ทั้งโลก</button></div>`;
  box.querySelectorAll('input[name=base]').forEach(i => i.onchange = () => { st.base = i.value; applyLayers(); });
  box.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { st[i.dataset.k] = i.checked; applyLayers(); });
  $('#goTh').onclick = () => map.flyTo([13.2, 101], 5.5);
  $('#goWorld').onclick = () => map.flyTo([15, 100], 2);
  $('#goMe').onclick = locate;
}
$('#layersBtn').onclick = () => $('#layers').classList.toggle('open');
map.on('click', () => $('#layers').classList.remove('open'));
$('#card').onclick = () => { if (isPhone()) $('#card').classList.toggle('mini'); };
if (isPhone()) $('#card').classList.add('mini');

// ---------- แถบวันที่ ----------
const day = $('#day');
day.value = 29; // เมื่อวาน = ภาพเต็มล่าสุด (วันนี้ดาวเทียมยังถ่ายไม่ครบ)
let slideT;
day.oninput = () => { $('#dayLbl').textContent = fmtDay(dayDate()); clearTimeout(slideT); slideT = setTimeout(applyLayers, 250); };
$('#prev').onclick = () => { day.value = Math.max(0, +day.value - 1); applyLayers(); };
$('#next').onclick = () => { day.value = Math.min(30, +day.value + 1); applyLayers(); if (+day.value === 30) toast('ภาพวันนี้ยังถ่ายไม่ครบ บางส่วนจะว่าง'); };

// ---------- เริ่ม ----------
renderLayers();
applyLayers();
updateSun();
loadEvents();
setInterval(updateSun, 60e3);
setInterval(loadEvents, 30 * 60e3);
setInterval(() => {
  $('#utc').textContent = new Date().toISOString().slice(11, 19) + ' UTC';
  const clk = $('#card .clock'); if (clk) clk.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);
window.__earth = { map, sunInfo, evCount: () => evCount };
