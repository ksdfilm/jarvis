// เรดาร์เครื่องบินเหนือหัว — ADS-B จาก adsb.fi (ผ่าน proxy ของ XAMPP เมื่อเปิดในวง LAN)
import { bar, store, toast, $, proxyURL, viaWorker, clamp } from '../common/lab.js';

const RAD = Math.PI / 180, R_E = 6371e3, FT = 0.3048, KT = 1.852;
bar('OVERHEAD', 'เรดาร์เครื่องบินเหนือหัว · ADS-B สด', '<span class="mono" id="clock" style="color:var(--dim);font-size:13px"></span>');

// ---------- ตำแหน่ง ----------
const CITIES = [
  ['กรุงเทพฯ (สยาม)', 13.7466, 100.5393], ['สุวรรณภูมิ (BKK)', 13.69, 100.7501], ['ดอนเมือง (DMK)', 13.9126, 100.6068],
  ['สมุทรปราการ', 13.5991, 100.5998], ['นนทบุรี', 13.8621, 100.5144], ['ปทุมธานี', 14.0208, 100.525], ['อยุธยา', 14.3532, 100.5689],
  ['ชลบุรี', 13.3611, 100.9847], ['พัทยา / อู่ตะเภา', 12.9236, 100.8825], ['ระยอง', 12.6814, 101.2816], ['นครราชสีมา', 14.9799, 102.0978],
  ['ขอนแก่น', 16.4419, 102.836], ['อุดรธานี', 17.4138, 102.7872], ['เชียงใหม่ (CNX)', 18.7668, 98.9626], ['เชียงราย', 19.9105, 99.8406],
  ['พิษณุโลก', 16.8211, 100.2659], ['ภูเก็ต (HKT)', 8.1132, 98.3169], ['กระบี่', 8.0863, 98.9063], ['หาดใหญ่', 7.0084, 100.4747],
  ['สุราษฎร์ธานี / สมุย', 9.1382, 99.3215], ['หัวหิน', 12.5684, 99.9577],
];
const RANGES = [25, 50, 110, 200]; // km
let loc = store.get('overhead.loc', { name: CITIES[0][0], lat: CITIES[0][1], lon: CITIES[0][2] });
let range = store.get('overhead.range', 110);

function renderCtl() {
  const geo = isSecureContext && 'geolocation' in navigator;
  $('#ctl').innerHTML = `
    <select id="city" aria-label="เลือกเมือง">${CITIES.map(([n], i) => `<option value="${i}" ${n === loc.name ? 'selected' : ''}>${n}</option>`).join('')}<option value="-1" ${CITIES.some(c => c[0] === loc.name) ? '' : 'selected'}>📍 กำหนดเอง</option></select>
    <input type="number" id="lat" step="0.0001" value="${loc.lat.toFixed(4)}" aria-label="ละติจูด"><input type="number" id="lon" step="0.0001" value="${loc.lon.toFixed(4)}" aria-label="ลองจิจูด">
    <button class="btn" id="setLL">ตั้ง</button>
    ${geo ? '<button class="btn" id="gps">◎ GPS</button>' : ''}
    <span class="sp"></span>
    <span class="seg">${RANGES.map(r => `<button class="btn ${r === range ? 'on' : ''}" data-r="${r}">${r} กม.</button>`).join('')}</span>`;
  $('#city').onchange = e => { const c = CITIES[+e.target.value]; if (c) setLoc({ name: c[0], lat: c[1], lon: c[2] }); };
  $('#setLL').onclick = () => {
    const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return toast('พิกัดไม่ถูกต้อง');
    setLoc({ name: 'กำหนดเอง', lat, lon });
  };
  $('#gps')?.addEventListener('click', useGps);
  $('#ctl').querySelectorAll('[data-r]').forEach(b => b.onclick = () => { range = +b.dataset.r; store.set('overhead.range', range); renderCtl(); poll(true); });
}
function setLoc(l) { loc = l; store.set('overhead.loc', loc); planes.clear(); renderCtl(); poll(true); }
function useGps() {
  navigator.geolocation.getCurrentPosition(p => {
    setLoc({ name: 'GPS', lat: p.coords.latitude, lon: p.coords.longitude });
    toast(`ใช้ตำแหน่ง GPS (±${Math.round(p.coords.accuracy)} ม.)`);
  }, e => toast('ไม่ได้รับตำแหน่ง: ' + (e.code === 1 ? 'ไม่ได้รับอนุญาต' : e.message)), { enableHighAccuracy: true, timeout: 10000 });
}

// ---------- สายการบินจากรหัส ICAO 3 ตัวแรกของ callsign ----------
const AIRLINES = {
  THA: 'การบินไทย', THD: 'ไทยสมายล์', AIQ: 'ไทยแอร์เอเชีย', TAX: 'ไทยแอร์เอเชีย X', NOK: 'นกแอร์', TLM: 'ไทยไลอ้อนแอร์', BKP: 'บางกอกแอร์เวย์ส',
  TVJ: 'ไทยเวียตเจ็ท', KMI: 'K-Mile Air (ขนส่งสินค้า)', SFT: 'สยามแลนด์ฟลายอิ้ง', RTA: 'ทอ. ไทย',
  AXM: 'AirAsia', XAX: 'AirAsia X', AWQ: 'Indonesia AirAsia', APG: 'Philippines AirAsia', MAS: 'Malaysia Airlines', MXD: 'Batik Air Malaysia', FFM: 'Firefly',
  SIA: 'Singapore Airlines', TGW: 'Scoot', JSA: 'Jetstar Asia', GIA: 'Garuda Indonesia', LNI: 'Lion Air', BTK: 'Batik Air', CTV: 'Citilink',
  PAL: 'Philippine Airlines', CEB: 'Cebu Pacific', RBA: 'Royal Brunei', HVN: 'Vietnam Airlines', VJC: 'VietJet Air', BAV: 'Bamboo Airways', VAG: 'Vietravel Airlines',
  MMA: 'Myanmar Airways Intl', UBA: 'Myanmar National', LAO: 'Lao Airlines', KME: 'Cambodia Airways', AMU: 'Air Macau',
  CPA: 'Cathay Pacific', HKE: 'HK Express', CRK: 'Hong Kong Airlines', HGB: 'Greater Bay Airlines',
  CCA: 'Air China', CES: 'China Eastern', CSN: 'China Southern', CHH: 'Hainan Airlines', CXA: 'Xiamen Airlines', CSC: 'Sichuan Airlines', CSZ: 'Shenzhen Airlines',
  CDG: 'Shandong Airlines', CQH: 'Spring Airlines', DKH: 'Juneyao Air', KNA: 'Kunming Airlines', LKE: 'Lucky Air', CDC: 'Loong Air', TBA: 'Tibet Airlines', CSS: 'SF Airlines',
  CAL: 'China Airlines', EVA: 'EVA Air', SJX: 'Starlux', TTW: 'Tigerair Taiwan',
  JAL: 'Japan Airlines', ANA: 'ANA', APJ: 'Peach', TZP: 'ZIPAIR', KAL: 'Korean Air', AAR: 'Asiana', JNA: 'Jin Air', TWB: "T'way Air", JJA: 'Jeju Air', ABL: 'Air Busan', ESR: 'Eastar Jet', APZ: 'Air Premia',
  AIC: 'Air India', AXB: 'Air India Express', IGO: 'IndiGo', SEJ: 'SpiceJet', AKJ: 'Akasa Air', ALK: 'SriLankan', BBC: 'Biman Bangladesh', UBG: 'US-Bangla', RNA: 'Nepal Airlines',
  UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', FDB: 'flydubai', ABY: 'Air Arabia', GFA: 'Gulf Air', OMA: 'Oman Air', SVA: 'Saudia', KAC: 'Kuwait Airways', ELY: 'El Al',
  THY: 'Turkish Airlines', KZR: 'Air Astana', UZB: 'Uzbekistan Airways', AFL: 'Aeroflot', ETH: 'Ethiopian', MSR: 'EgyptAir',
  DLH: 'Lufthansa', BAW: 'British Airways', AFR: 'Air France', KLM: 'KLM', FIN: 'Finnair', SWR: 'Swiss', AUA: 'Austrian', EDW: 'Edelweiss', CFG: 'Condor', SAS: 'SAS',
  QFA: 'Qantas', JST: 'Jetstar', VOZ: 'Virgin Australia', ANZ: 'Air New Zealand', UAL: 'United', DAL: 'Delta', AAL: 'American',
  FDX: 'FedEx', UPS: 'UPS', DHK: 'DHL', DHX: 'DHL', BCS: 'DHL', CLX: 'Cargolux', GTI: 'Atlas Air', CKS: 'Kalitta Air', CAO: 'Air China Cargo', CKK: 'China Cargo',
};
function airline(cs) {
  if (!cs) return '';
  const m = /^([A-Z]{3})\d/.exec(cs);
  if (m) return AIRLINES[m[1]] || m[1];
  if (/^HS/.test(cs)) return 'ทะเบียนไทย (ส่วนบุคคล/ราชการ)';
  return '';
}

// ---------- คำนวณตำแหน่งสัมพัทธ์ ----------
function rel(lat, lon, altFt) {
  const p1 = loc.lat * RAD, p2 = lat * RAD, dl = (lon - loc.lon) * RAD;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R_E * Math.asin(Math.sqrt(a)); // ระยะบนพื้น (ม.)
  const brg = (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
  const h = (altFt || 0) * FT;
  const elev = Math.atan2(h - d * d / (2 * R_E), d) / RAD; // รวมความโค้งโลก
  return { d, brg, elev, slant: Math.hypot(d, h) };
}
const DIRS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
const DIRS_S = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirTh = b => DIRS[Math.round(b / 45) % 8];
const altColor = ft => {
  if (ft == null) return '#888';
  const t = clamp(ft / 40000, 0, 1);
  const stops = [[0, [255, 122, 61]], [0.15, [255, 200, 69]], [0.35, [61, 255, 154]], [0.65, [60, 231, 255]], [1, [180, 140, 255]]];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = (t - a) / (b - a);
    return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(',')})`;
  }
  return 'rgb(180,140,255)';
};

// ---------- ดึงข้อมูล ----------
const planes = new Map(); // hex → { ...data, t0, trail: [[lat,lon]] }
let lastOk = 0, lastErr = '', selHex = null, busy = false, src = '';
async function fetchJSON(u) {
  // API ไม่มี CORS → ผ่าน Cloudflare Worker หรือ proxy ของ XAMPP / ไม่มีทั้งคู่ ลองตรงๆ เผื่ออนาคตเปิด CORS
  const r = await fetch(proxyURL(u) || u, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function poll(force) {
  if (busy && !force) return;
  busy = true;
  const nm = Math.ceil(range / KT) + 3, la = loc.lat.toFixed(4), lo = loc.lon.toFixed(4);
  const srcs = [
    ['adsb.fi', `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${nm}`],
    ['adsb.lol', `https://api.adsb.lol/v2/lat/${la}/lon/${lo}/dist/${nm}`],
  ];
  if (viaWorker()) srcs.reverse(); // adsb.fi บล็อก Cloudflare → ผ่าน Worker ลอง adsb.lol ก่อน
  for (const [name, u] of srcs) {
    try {
      const j = await fetchJSON(u);
      ingest(j.aircraft || j.ac || []);
      lastOk = Date.now(); lastErr = ''; src = name;
      break;
    } catch (e) { lastErr = e.message; }
  }
  busy = false;
  renderList();
}
function ingest(list) {
  const now = Date.now(), seen = new Set();
  for (const a of list) {
    if (a.lat == null || a.lon == null) continue;
    const old = planes.get(a.hex);
    const alt = a.alt_baro === 'ground' ? 0 : (a.alt_geom ?? a.alt_baro);
    const p = {
      hex: a.hex, cs: (a.flight || '').trim(), reg: a.r || '', type: a.t || '', desc: a.desc || '', alt, ground: a.alt_baro === 'ground',
      gs: a.gs, track: a.track ?? a.true_heading ?? old?.track ?? 0, vr: a.baro_rate ?? a.geom_rate ?? 0, sq: a.squawk || '', cat: a.category || '',
      lat: a.lat, lon: a.lon, t0: now - (a.seen_pos || 0) * 1000, trail: old?.trail || [],
    };
    if (!old || old.lat !== p.lat || old.lon !== p.lon) { p.trail.push([p.lat, p.lon]); if (p.trail.length > 40) p.trail.shift(); }
    planes.set(a.hex, p); seen.add(a.hex);
  }
  for (const k of planes.keys()) if (!seen.has(k)) planes.delete(k);
}
// ประมาณตำแหน่งปัจจุบันจากความเร็ว+ทิศ (เครื่องบินเคลื่อนนุ่มระหว่างรอบดึง)
function nowPos(p, now = Date.now()) {
  const dt = clamp((now - p.t0) / 1000, 0, 30);
  if (!p.gs || p.ground) return [p.lat, p.lon];
  const dist = p.gs * KT * 1000 / 3600 * dt;
  const dLat = dist * Math.cos(p.track * RAD) / R_E / RAD;
  const dLon = dist * Math.sin(p.track * RAD) / (R_E * Math.cos(p.lat * RAD)) / RAD;
  return [p.lat + dLat, p.lon + dLon];
}

// ---------- รายการ ----------
const fmtAlt = p => p.ground ? 'บนพื้น' : p.alt == null ? '—' : `${Math.round(p.alt).toLocaleString()} ft`;
const fmtAltM = p => p.ground || p.alt == null ? '' : `${Math.round(p.alt * FT).toLocaleString()} ม.`;
const kmh = p => p.gs == null ? '—' : `${Math.round(p.gs * KT)} กม./ชม.`;
function computed() {
  const now = Date.now();
  return [...planes.values()].map(p => {
    const [lat, lon] = nowPos(p, now);
    return { ...p, lat, lon, ...rel(lat, lon, p.alt) };
  }).filter(p => p.d <= range * 1000).sort((a, b) => a.d - b.d);
}
function renderList() {
  const st = $('#status');
  const ps = computed();
  if (!lastOk) {
    st.className = 'err';
    st.innerHTML = lastErr ? '<b>● ไม่มีข้อมูล</b>' : 'กำลังโหลด…';
    if (lastErr) $('#list').innerHTML = `<div class="msg">${proxyURL('x')
      ? `ดึงข้อมูลเครื่องบินไม่สำเร็จ (${lastErr}) — จะลองใหม่อัตโนมัติ`
      : '✈ ข้อมูลเครื่องบิน (adsb.fi) ไม่อนุญาตให้เว็บภายนอกดึงโดยตรง<br>ตั้งค่าตัวกลางฟรีในหน้า <a href="../remote/">ใช้จากนอกบริษัท</a> (Cloudflare Worker) หรือเปิดผ่าน XAMPP/Tailscale'}</div>`;
    renderTop(null);
    return;
  }
  const age = Math.round((Date.now() - lastOk) / 1000);
  st.className = age > 20 ? 'err' : '';
  st.innerHTML = `<b>● สด</b> ${src} · ${ps.length} ลำ · ${age}s`;
  const best = pickTop(ps);
  renderTop(ps.find(p => p.hex === selHex) || best, best);
  $('#list').innerHTML = `<div class="hdr"><span>เรียงตามระยะ · ${loc.name}</span><span>${ps.length} ลำในรัศมี ${range} กม.</span></div>` + (ps.length ? ps.map(p => `
    <div class="row ${p.hex === selHex ? 'sel' : ''}" data-hex="${p.hex}">
      <div><span class="cs"><i style="background:${altColor(p.alt)}"></i>${p.cs || p.reg || p.hex.toUpperCase()}</span> <span class="al">${airline(p.cs)}</span>
        <div class="ty">${p.type}${p.desc ? ' · ' + p.desc : ''}${p.reg ? ' · ' + p.reg : ''}</div></div>
      <div class="d">${(p.d / 1000).toFixed(1)}<small style="font-size:11px;color:var(--dim)"> กม.</small></div>
      <div class="r" style="text-align:left">${fmtAlt(p)} <span style="color:var(--dim)">${fmtAltM(p)}</span> ${p.vr > 300 ? '↗' : p.vr < -300 ? '↘' : ''} · ${kmh(p)}</div>
      <div class="r">มอง <b>${DIRS_S[Math.round(p.brg / 45) % 8]} ${Math.round(p.brg)}°</b> เงย <b>${Math.max(0, p.elev).toFixed(0)}°</b></div>
    </div>`).join('') : '<div class="msg" style="color:var(--dim)">ไม่มีเครื่องบินในรัศมีนี้ตอนนี้ ลองขยายระยะ</div>');
  $('#list').querySelectorAll('.row').forEach(r => r.onclick = () => { selHex = selHex === r.dataset.hex ? null : r.dataset.hex; renderList(); });
}
// ลำที่ "อยู่เหนือหัว" ที่สุด = มุมเงยสูงสุด (ที่ยังบินอยู่)
const pickTop = ps => ps.filter(p => !p.ground).sort((a, b) => b.elev - a.elev)[0] || ps[0] || null;
function renderTop(p, best) {
  const el = $('#top');
  if (!p) { el.innerHTML = '<div class="k">ลำที่อยู่เหนือหัวคุณที่สุด</div><div class="note">ยังไม่มีข้อมูล</div>'; return; }
  const isBest = !best || p.hex === best.hex;
  el.innerHTML = `<div class="k">${isBest ? '▲ ลำที่อยู่เหนือหัวคุณที่สุดตอนนี้' : '◆ ลำที่เลือก'}</div>
    <div class="cs">${p.cs || p.reg || p.hex.toUpperCase()}</div>
    <div class="al">${airline(p.cs) || 'ไม่ทราบสายการบิน'} · ${p.desc || p.type || 'ไม่ทราบรุ่น'}${p.reg ? ' · ' + p.reg : ''}</div>
    <div class="look"><canvas id="lookC" width="96" height="96" style="width:96px;height:96px"></canvas>
      <div class="t">มองไปทาง <b>${dirTh(p.brg)}</b><br>ทิศ <b>${Math.round(p.brg)}°</b> · เงยขึ้น <b>${Math.max(0, p.elev).toFixed(0)}°</b><br>
      <span class="note">${p.elev > 60 ? 'เกือบตรงหัว! แหงนมองขึ้นไปเลย' : p.elev > 25 ? 'สูงกลางฟ้า' : p.elev > 5 ? 'ค่อนไปทางขอบฟ้า' : 'ต่ำใกล้ขอบฟ้า อาจถูกตึกบัง'}</span></div></div>
    <div class="g"><div><small>ความสูง</small><span>${p.ground ? 'พื้น' : p.alt == null ? '—' : Math.round(p.alt).toLocaleString()}</span><small>${p.ground ? '' : fmtAltM(p)}</small></div>
      <div><small>ความเร็ว</small><span>${p.gs == null ? '—' : Math.round(p.gs * KT)}</span><small>กม./ชม.</small></div>
      <div><small>ระยะพื้น</small><span>${(p.d / 1000).toFixed(1)}</span><small>กม.</small></div>
      <div><small>ระยะตรง</small><span>${(p.slant / 1000).toFixed(1)}</span><small>กม.</small></div></div>
    <div style="margin-top:6px"><a href="https://globe.adsb.fi/?icao=${p.hex}" target="_blank" rel="noopener">ดูเส้นทางบน adsb.fi ↗</a>${p.sq ? ` <span class="note">· squawk ${p.sq}</span>` : ''}</div>`;
  drawLook($('#lookC'), p);
}
// ภาพ "ท้องฟ้า" เล็กๆ: วงนอก = ขอบฟ้า, กลาง = ตรงหัว
function drawLook(c, p) {
  const g = c.getContext('2d'), s = 48;
  g.strokeStyle = 'rgba(60,231,255,.35)'; g.lineWidth = 1;
  for (const r of [44, 29, 14]) { g.beginPath(); g.arc(s, s, r, 0, 7); g.stroke(); }
  g.fillStyle = '#5b8f9e'; g.font = '10px Share Tech Mono'; g.textAlign = 'center'; g.fillText('N', s, 9);
  const r = 44 * (1 - clamp(p.elev, 0, 90) / 90), a = (p.brg - 90) * RAD;
  g.fillStyle = '#ffc845'; g.shadowColor = '#ffc845'; g.shadowBlur = 8;
  g.beginPath(); g.arc(s + Math.cos(a) * r, s + Math.sin(a) * r, 4.5, 0, 7); g.fill();
}

// ---------- เรดาร์ ----------
const cv = $('#radar'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, hits = [];
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
}
new ResizeObserver(resize).observe(cv);
function draw(t) {
  requestAnimationFrame(draw);
  if (!W) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, Rpx = Math.min(W, H) / 2 - 18, k = Rpx / (range * 1000);
  // พื้นหลัง + วงระยะ
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rpx);
  bg.addColorStop(0, 'rgba(6,40,56,.9)'); bg.addColorStop(1, 'rgba(1,10,16,.95)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(60,231,255,.55)'; ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, 7); ctx.stroke();
  const step = range <= 25 ? 5 : range <= 50 ? 10 : range <= 110 ? 25 : 50;
  ctx.font = '11px Share Tech Mono'; ctx.textAlign = 'left';
  for (let r = step; r < range - 0.1; r += step) {
    ctx.strokeStyle = r === range ? 'rgba(60,231,255,.55)' : 'rgba(60,231,255,.18)';
    ctx.beginPath(); ctx.arc(cx, cy, r * 1000 * k, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(91,143,158,.9)'; ctx.fillText(`${r} กม.`, cx + 3, cy - r * 1000 * k + 12);
  }
  ctx.strokeStyle = 'rgba(60,231,255,.12)';
  for (let a = 0; a < 360; a += 30) { const q = (a - 90) * RAD; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(q) * Rpx, cy + Math.sin(q) * Rpx); ctx.stroke(); }
  ctx.fillStyle = '#3ce7ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px Share Tech Mono';
  ['N', 'E', 'S', 'W'].forEach((l, i) => { const q = (i * 90 - 90) * RAD; ctx.fillText(l, cx + Math.cos(q) * (Rpx + 10), cy + Math.sin(q) * (Rpx + 10)); });
  // เส้นกวาด
  const sw = (t / 1000 * 0.9) % (Math.PI * 2);
  const grad = ctx.createConicGradient ? ctx.createConicGradient(sw - Math.PI / 2 - 0.6, cx, cy) : null;
  if (grad) { grad.addColorStop(0, 'rgba(60,231,255,0)'); grad.addColorStop(0.095, 'rgba(60,231,255,.22)'); grad.addColorStop(0.0955, 'rgba(60,231,255,0)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, 7); ctx.fill(); }
  // ตัวเรา
  ctx.fillStyle = '#3dff9a'; ctx.shadowColor = '#3dff9a'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  // เครื่องบิน
  const ps = computed(), best = pickTop(ps);
  const toXY = (lat, lon) => { const r = rel(lat, lon, 0), q = (r.brg - 90) * RAD; return [cx + Math.cos(q) * r.d * k, cy + Math.sin(q) * r.d * k]; };
  hits = [];
  const labels = [];
  ctx.textBaseline = 'alphabetic';
  for (const p of [...ps].reverse()) {
    const col = altColor(p.ground ? 0 : p.alt);
    if (p.trail.length > 1) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2; ctx.beginPath();
      p.trail.forEach(([la, lo], i) => { const [x, y] = toXY(la, lo); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      const [x1, y1] = toXY(p.lat, p.lon); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const q = (p.brg - 90) * RAD, x = cx + Math.cos(q) * p.d * k, y = cy + Math.sin(q) * p.d * k;
    hits.push([x, y, p.hex]);
    const sel = p.hex === selHex, top = best && p.hex === best.hex;
    if (top || sel) {
      const pulse = 10 + 4 * Math.sin(t / 220);
      ctx.strokeStyle = sel ? '#fff' : '#ffc845'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, 7); ctx.stroke();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.track * RAD);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
    if (p.ground) { ctx.globalAlpha = .55; ctx.scale(.6, .6); }
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    if (p.gs) { ctx.strokeStyle = col; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -8 - clamp(p.gs / 25, 2, 22)); ctx.stroke(); }
    ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    labels.push({ p, x, y, pri: sel ? 0 : top ? 1 : p.ground ? 3 : 2 });
  }
  // ป้ายชื่อ: เลือก/เหนือหัวก่อน แล้วใกล้→ไกล ข้ามป้ายที่ทับกัน (บนพื้นไม่แสดงยกเว้นเลือก)
  const boxes = [];
  ctx.font = '11px Share Tech Mono'; ctx.textAlign = 'left';
  for (const { p, x, y, pri } of labels.sort((a, b) => a.pri - b.pri || a.p.d - b.p.d)) {
    if (pri === 3) continue;
    const b = [x + 8, y - 12, x + 8 + 58, y + 13];
    if (pri > 1 && boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    boxes.push(b);
    ctx.fillStyle = pri < 2 ? '#fff' : 'rgba(168,244,255,.9)';
    ctx.fillText(p.cs || p.hex.toUpperCase(), x + 9, y - 2);
    ctx.fillStyle = 'rgba(91,143,158,.95)';
    ctx.fillText(p.ground ? 'GND' : p.alt != null ? `FL${String(Math.round(p.alt / 100)).padStart(3, '0')}` : '', x + 9, y + 10);
  }
}
requestAnimationFrame(draw);
cv.addEventListener('click', e => {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  let bestD = 26, hex = null;
  for (const [hx, hy, h] of hits) { const d = Math.hypot(hx - x, hy - y); if (d < bestD) { bestD = d; hex = h; } }
  selHex = hex; renderList();
  if (hex) document.querySelector(`.row[data-hex="${hex}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

// ---------- เริ่ม ----------
renderCtl();
poll();
setInterval(() => { if (!document.hidden) poll(); }, 5000);
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('th-TH'); if (lastOk) renderListThrottled(); }, 1000);
let lt = 0; function renderListThrottled() { if (Date.now() - lt > 2500) { lt = Date.now(); renderList(); } }
window.__oh = { planes, computed };
