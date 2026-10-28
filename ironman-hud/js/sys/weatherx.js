// อากาศเพิ่มเติม (เสียบเข้าแผงเดิม):
//  • แผง 02 ฝน: เรดาร์ฝนสด 2 ชม.ล่าสุด (RainViewer ฟรี) + "ฝนจะมาในอีกกี่นาที" (Open-Meteo รายงานทุก 15 นาที)
//  • แผง 03 ฝุ่น: PM2.5 หลายจังหวัดเทียบกัน
//  • แผง 04 พยากรณ์: ดัชนีความร้อน + UV + ช่วงเวลาที่เหมาะออกไปข้างนอก
import { loadScript, loadCss, getJSON, MAPLIBRE_JS, MAPLIBRE_CSS, darkMapStyle } from '../lib/load.js';

let ctx;
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (iso) => iso.slice(11, 16);

// ---------- ฝนจะมาเมื่อไหร่ (ราย 15 นาที) ----------
let nowcast = null; // { t[], p[], uv[], at[], ht[], at: ms }
async function loadNowcast() {
  const { lat, lon } = ctx.place();
  try {
    const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Asia%2FBangkok&minutely_15=precipitation&forecast_minutely_15=12&hourly=uv_index,apparent_temperature&forecast_hours=24`);
    nowcast = { t: d.minutely_15.time, p: d.minutely_15.precipitation, ht: d.hourly.time, uv: d.hourly.uv_index, feel: d.hourly.apparent_temperature, fetched: Date.now() };
    renderArrival(); renderHeat(); checkAlert();
  } catch { /* ไม่มีเน็ต: ใช้ค่าเดิม */ }
}

/** วิเคราะห์ฝน 3 ชม.ข้างหน้า: { raining, minutes, until, text } */
function arrival() {
  if (!nowcast) return null;
  const WET = 0.1; // มม. ต่อ 15 นาที
  const { t, p } = nowcast;
  const now = Date.now();
  const at = (i) => new Date(`${t[i]}:00+07:00`).getTime();
  const raining = (p[0] || 0) >= WET;
  if (raining) {
    const stop = p.findIndex((v) => (v || 0) < WET);
    if (stop < 0) return { raining, text: 'ฝนกำลังตก และน่าจะตกต่อเนื่องอีกอย่างน้อย 3 ชั่วโมง' };
    const m = Math.max(15, Math.round((at(stop) - now) / 60000));
    return { raining, minutes: m, text: `ฝนกำลังตก คาดว่าจะหยุดในอีกราว ${m} นาที (ประมาณ ${hhmm(t[stop])} น.)` };
  }
  const s = p.findIndex((v) => (v || 0) >= WET);
  if (s < 0) return { raining, text: '3 ชั่วโมงข้างหน้าไม่น่ามีฝนตกตรงตำแหน่งนี้' };
  const m = Math.max(5, Math.round((at(s) - now) / 60000));
  const heavy = Math.max(...p.slice(s)) >= 2.5;
  return { raining, minutes: m, text: `ฝน${heavy ? 'หนัก' : ''}อาจเริ่มตกในอีกราว ${m} นาที (ประมาณ ${hhmm(t[s])} น.)` };
}
function renderArrival() {
  const a = arrival(), box = document.getElementById('wx-arrival');
  if (!box || !a) return;
  box.querySelector('.ar-text').textContent = a.text;
  box.classList.toggle('hot', a.raining || (a.minutes !== undefined && a.minutes <= 45));
  const max = Math.max(1, ...nowcast.p);
  box.querySelector('.ar-bars').innerHTML = nowcast.p.map((v, i) => `<span title="${hhmm(nowcast.t[i])} ${v} มม." style="height:${Math.max(3, (v || 0) / max * 100)}%;${(v || 0) >= 0.1 ? '' : 'opacity:.25'}"></span>`).join('');
  box.querySelector('.ar-axis').innerHTML = nowcast.t.map((x, i) => `<span>${i % 4 ? '' : i === 0 ? 'ตอนนี้' : hhmm(x)}</span>`).join('');
}
// เตือนในแอปเมื่อฝนจะมาภายใน 30 นาที (ครั้งเดียวต่อช่วงฝน)
let alerted = 0;
function checkAlert() {
  const a = arrival();
  if (!a || a.raining || a.minutes === undefined || a.minutes > 30) return;
  if (Date.now() - alerted < 90 * 60000) return;
  alerted = Date.now();
  ctx.toast(`☔ ${a.text}`);
  ctx.fx.play('alarm');
}

// ---------- เรดาร์ฝน ----------
let radar = null; // { map, frames[], idx, timer }
async function initRadar() {
  if (radar) return;
  radar = { frames: [], idx: 0, timer: 0, playing: true };
  const el = document.getElementById('wx-radar-map');
  try {
    await Promise.all([loadCss(MAPLIBRE_CSS), loadScript(MAPLIBRE_JS)]);
    const { lat, lon } = ctx.place();
    const map = new maplibregl.Map({
      container: el, style: darkMapStyle(), center: [lon, lat], zoom: 5.4, maxZoom: 10, minZoom: 3,
      attributionControl: { compact: true, customAttribution: '<a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a>' },
      dragRotate: false, pitchWithRotate: false, cooperativeGestures: false,
    });
    radar.map = map;
    const dot = document.createElement('div');
    dot.className = 'radar-me';
    new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(map);
    map.on('load', () => {
      // พับเครดิตแผนที่เป็นปุ่ม (i) ไม่ให้บังแผนที่เล็ก — แตะเพื่อดูได้
      el.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      loadFrames();
    });
  } catch {
    el.innerHTML = '<p class="hint">โหลดแผนที่เรดาร์ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)</p>';
  }
}
async function loadFrames() {
  const { map } = radar;
  try {
    const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json');
    const frames = d.radar.past.slice(-12);
    // ลบเฟรมเก่า แล้วเพิ่มเฟรมใหม่ทุกเฟรม (ซ่อนไว้ก่อน แล้วสลับความทึบเพื่อเล่นภาพเคลื่อนไหว)
    radar.frames.forEach((f) => { if (map.getLayer(f.id)) map.removeLayer(f.id); if (map.getSource(f.id)) map.removeSource(f.id); });
    radar.frames = frames.map((f) => ({ id: `rv-${f.time}`, time: f.time }));
    frames.forEach((f, i) => {
      const id = radar.frames[i].id;
      map.addSource(id, { type: 'raster', tiles: [`${d.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7 });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, 'places');
    });
    radar.idx = radar.frames.length - 1;
    showFrame();
    play(radar.playing);
  } catch {
    document.getElementById('wx-radar-time').textContent = 'ดึงข้อมูลเรดาร์ไม่สำเร็จ';
  }
}
function showFrame() {
  const { map, frames, idx } = radar;
  frames.forEach((f, i) => map.setPaintProperty(f.id, 'raster-opacity', i === idx ? 0.85 : 0));
  const t = new Date(frames[idx].time * 1000);
  const ago = Math.round((Date.now() - t) / 60000);
  document.getElementById('wx-radar-time').textContent = `${pad(t.getHours())}:${pad(t.getMinutes())} น. · ${ago <= 10 ? 'ล่าสุด' : `${ago} นาทีที่แล้ว`}`;
  document.getElementById('wx-radar-seek').value = idx;
  document.getElementById('wx-radar-seek').max = frames.length - 1;
}
function play(on) {
  radar.playing = on;
  clearInterval(radar.timer);
  document.getElementById('wx-radar-play').textContent = on ? '⏸' : '▶';
  if (!on || !radar.frames.length) return;
  radar.timer = setInterval(() => {
    // วนเฟรม แล้วค้างที่เฟรมล่าสุดนานขึ้นนิดนึง
    radar.idx = radar.idx >= radar.frames.length - 1 ? 0 : radar.idx + 1;
    showFrame();
  }, 650);
}

// ---------- ความร้อน + UV ----------
const HEAT = [ // ดัชนีความร้อน (°C ที่รู้สึกจริง) ตามเกณฑ์กรมอนามัย
  { max: 27, name: 'ปกติ', color: '#2ee6a6', advice: 'อากาศสบาย' },
  { max: 32, name: 'เฝ้าระวัง', color: '#ffd23f', advice: 'อาจอ่อนเพลียถ้าอยู่กลางแดดนาน ดื่มน้ำบ่อยๆ' },
  { max: 41, name: 'เตือนภัย', color: '#ff8a3d', advice: 'เสี่ยงตะคริวแดดและเพลียแดด เลี่ยงงานหนักกลางแจ้ง' },
  { max: 54, name: 'อันตราย', color: '#ff3b5c', advice: 'เสี่ยงโรคลมแดด งดกิจกรรมกลางแจ้ง' },
  { max: 999, name: 'อันตรายมาก', color: '#b06bff', advice: 'อันตรายถึงชีวิต อยู่ในที่ร่มที่เย็น' },
];
const UVL = [
  { max: 2, name: 'ต่ำ', color: '#2ee6a6' }, { max: 5, name: 'ปานกลาง', color: '#ffd23f' }, { max: 7, name: 'สูง', color: '#ff8a3d' },
  { max: 10, name: 'สูงมาก', color: '#ff3b5c' }, { max: 99, name: 'อันตรายสุด', color: '#b06bff' },
];
const lv = (arr, v) => arr.find((l) => v <= l.max);
function heatInfo() {
  if (!nowcast) return null;
  const { ht, uv, feel } = nowcast;
  const today = ht[0].slice(0, 10);
  const idx = ht.map((t, i) => i).filter((i) => ht[i].slice(0, 10) === today || i < 12);
  const nowFeel = feel[0], nowUv = uv[0] ?? 0;
  const maxFeel = Math.max(...idx.map((i) => feel[i])), maxUv = Math.max(...idx.map((i) => uv[i] ?? 0));
  const strong = idx.filter((i) => (uv[i] ?? 0) >= 8).map((i) => ht[i]);
  // ช่วงเหมาะออกข้างนอก: กลางวัน (6–19 น.) ที่รู้สึก < 32°C และ UV < 6
  const good = idx.filter((i) => { const h = +ht[i].slice(11, 13); return h >= 6 && h <= 19 && feel[i] < 32 && (uv[i] ?? 0) < 6; }).map((i) => ht[i]);
  return { nowFeel, nowUv, maxFeel, maxUv, strong, good };
}
function rangeText(times) {
  if (!times.length) return null;
  return `${hhmm(times[0])}–${pad((+times[times.length - 1].slice(11, 13) + 1) % 24)}:00 น.`;
}
function renderHeat() {
  const box = document.getElementById('wx-heat'), h = heatInfo();
  if (!box || !h) return;
  const hl = lv(HEAT, h.nowFeel), ul = lv(UVL, h.nowUv), hm = lv(HEAT, h.maxFeel), um = lv(UVL, h.maxUv);
  box.innerHTML = `<div class="p-lbl">HEAT &amp; UV · ความร้อนและรังสียูวี</div>
    <div class="hu-grid">
      <div style="--c:${hl.color}"><small>รู้สึกเหมือน</small><b>${Math.round(h.nowFeel)}°</b><span>${hl.name}</span></div>
      <div style="--c:${ul.color}"><small>UV ตอนนี้</small><b>${Math.round(h.nowUv)}</b><span>${ul.name}</span></div>
      <div style="--c:${hm.color}"><small>ร้อนสุด (ที่เหลือวันนี้)</small><b>${Math.round(h.maxFeel)}°</b><span>${hm.name}</span></div>
      <div style="--c:${um.color}"><small>UV สูงสุด (ที่เหลือ)</small><b>${Math.round(h.maxUv)}</b><span>${um.name}</span></div>
    </div>
    <p class="hu-adv">${hm.advice}${h.strong.length ? ` · แดดแรงมาก (UV 8+) ช่วง <b>${rangeText(h.strong)}</b> ทาครีมกันแดด SPF30+` : ''}</p>
    <p class="hu-adv">${h.good.length ? `🚶 เวลาที่เหมาะออกไปข้างนอก: <b>${h.good.map(hhmm).slice(0, 6).join(', ')}${h.good.length > 6 ? '…' : ''}</b>` : '🚶 วันนี้ไม่มีช่วงกลางวันที่อากาศสบาย เลือกช่วงเช้าตรู่หรือหลังพระอาทิตย์ตก'}</p>`;
}

// ---------- ฝุ่นหลายจังหวัด ----------
const PM_CITIES = [['กรุงเทพฯ', 13.7563, 100.5018], ['เชียงใหม่', 18.7883, 98.9853], ['เชียงราย', 19.9105, 99.8406], ['พิษณุโลก', 16.8211, 100.2659],
  ['ขอนแก่น', 16.4419, 102.836], ['อุดรธานี', 17.4138, 102.7872], ['นครราชสีมา', 14.9799, 102.0978], ['ชลบุรี', 13.3611, 100.9847],
  ['ระยอง', 12.6814, 101.2816], ['สุราษฎร์ธานี', 9.1382, 99.3215], ['ภูเก็ต', 7.8804, 98.3923], ['หาดใหญ่', 7.0084, 100.4747]];
let cityPm = null, cityAt = 0;
async function loadCityPm() {
  if (cityPm && Date.now() - cityAt < 30 * 60000) return renderCityPm();
  try {
    const d = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${PM_CITIES.map((c) => c[1]).join(',')}&longitude=${PM_CITIES.map((c) => c[2]).join(',')}&current=pm2_5,us_aqi&timezone=Asia%2FBangkok`);
    cityPm = (Array.isArray(d) ? d : [d]).map((x, i) => ({ name: PM_CITIES[i][0], pm: x.current?.pm2_5 ?? null })).filter((x) => x.pm != null).sort((a, b) => b.pm - a.pm);
    cityAt = Date.now();
    renderCityPm();
  } catch { /* ไม่มีเน็ต */ }
}
function renderCityPm() {
  const box = document.getElementById('wx-cities');
  if (!box || !cityPm) return;
  const max = Math.max(40, ...cityPm.map((c) => c.pm));
  box.querySelector('.rows').innerHTML = cityPm.map((c, i) => {
    const l = ctx.pmLevel(c.pm);
    return `<div class="row${i === 0 ? ' today' : ''}"><span class="rd">${c.name}</span><span class="rt"><span style="width:${c.pm / max * 100}%;--c:${l.color}"></span></span><span class="rv">${Math.round(c.pm)} <small>${l.name}</small></span></div>`;
  }).join('');
}

// ---------- ใส่กล่องลงแผงเดิม ----------
function inject() {
  const rain = document.getElementById('p-rain');
  const sum = rain.querySelector('.summary');
  sum.insertAdjacentHTML('afterend', `
    <div class="box" id="wx-arrival"><div class="p-lbl">NEXT 3H · ฝนราย 15 นาที ตรงตำแหน่งนี้</div>
      <p class="ar-text">กำลังโหลด…</p><div class="ar-bars"></div><div class="ar-axis"></div></div>
    <div class="box radar-box"><div class="p-lbl">RAIN RADAR · เรดาร์ฝน 2 ชม. ล่าสุด <span id="wx-radar-time" class="radar-time"></span></div>
      <div id="wx-radar-map" class="radar-map"></div>
      <div class="radar-ctl"><button type="button" id="wx-radar-play" aria-label="เล่น/หยุด">⏸</button><input type="range" id="wx-radar-seek" min="0" max="11" value="11" aria-label="เลื่อนเวลาเรดาร์"></div></div>`);
  document.getElementById('p-week').querySelector('.facts').insertAdjacentHTML('beforebegin', '<div class="box" id="wx-heat"><div class="p-lbl">HEAT &amp; UV · ความร้อนและรังสียูวี</div><p class="hint">กำลังโหลด…</p></div>');
  document.getElementById('p-air').insertAdjacentHTML('beforeend', '<div class="box" id="wx-cities"><div class="p-lbl">THAILAND · PM2.5 รายจังหวัด (มาก → น้อย)</div><div class="rows"></div></div>');
  document.getElementById('wx-radar-play').addEventListener('click', () => play(!radar?.playing));
  document.getElementById('wx-radar-seek').addEventListener('input', (e) => { if (!radar?.frames.length) return; play(false); radar.idx = +e.target.value; showFrame(); });
}

// แผงฝน/ฝุ่นเปิดเมื่อไหร่ค่อยโหลดของหนัก (แผนที่เรดาร์, ฝุ่นหลายเมือง)
function watchPanels() {
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) { if (en.target.id === 'p-rain' && radar?.timer) clearInterval(radar.timer); return; }
    if (en.target.id === 'p-rain') { initRadar(); if (radar?.frames.length) play(radar.playing); setTimeout(() => radar?.map?.resize(), 50); }
    if (en.target.id === 'p-air') loadCityPm();
  }), { threshold: 0.05 });
  ['p-rain', 'p-air'].forEach((id) => io.observe(document.getElementById(id)));
}

export default {
  init(c) {
    ctx = c;
    inject();
    watchPanels();
    loadNowcast();
    setInterval(loadNowcast, 10 * 60000);
    setInterval(() => { if (radar?.map) loadFrames(); }, 10 * 60000);
    addEventListener('hud:wx', () => { // เปลี่ยนเมือง → โหลดใหม่และย้ายแผนที่
      const { lat, lon } = ctx.place();
      if (nowcast && Date.now() - nowcast.fetched < 60000) return;
      loadNowcast();
      radar?.map?.flyTo({ center: [lon, lat], zoom: 5.4 });
    });
    ctx.addReporter(() => [arrival()?.text, (() => { const h = heatInfo(); if (!h) return null; const hm = lv(HEAT, h.maxFeel), um = lv(UVL, h.maxUv); return `วันนี้ร้อนสุดรู้สึกเหมือน ${Math.round(h.maxFeel)} องศา ระดับ${hm.name} ยูวีสูงสุด ${Math.round(h.maxUv)} ระดับ${um.name}`; })()]);
    ctx.addIntent(/อีกกี่นาที|ฝนจะมา|ฝนมาเมื่อไหร่|ฝนจะหยุด|เรดาร์|radar/, () => {
      const a = arrival();
      return { text: a ? a.text : 'กำลังโหลดข้อมูลฝนค่ะ ลองถามใหม่อีกครั้งนะคะ', go: 1 };
    }, 'ฝนจะมาอีกกี่นาที');
    ctx.addIntent(/uv|ยูวี|แดด|ร้อนไหม|ความร้อน|ลมแดด|ครีมกันแดด/, () => {
      const h = heatInfo();
      if (!h) return { text: 'กำลังโหลดข้อมูลความร้อนค่ะ' };
      const hl = lv(HEAT, h.nowFeel), um = lv(UVL, h.maxUv);
      return { text: `ตอนนี้รู้สึกเหมือน ${Math.round(h.nowFeel)} องศา ระดับ${hl.name} ${hl.advice} ยูวีสูงสุดวันนี้ ${Math.round(h.maxUv)} ระดับ${um.name}${h.strong.length ? ` แดดแรงช่วง ${rangeText(h.strong)} ทาครีมกันแดดด้วยนะคะ` : ''}`, go: 3 };
    }, 'แดดแรงไหม');
    ctx.addIntent(/จังหวัด|เมืองไหน|ทั่วประเทศ|เชียงใหม่|ภาคเหนือ/, (q) => {
      if (!/ฝุ่น|pm|พีเอ็ม/.test(q) && !/ฝุ่น/.test(q)) return null;
      loadCityPm();
      if (!cityPm) return { text: 'กำลังโหลดค่าฝุ่นรายจังหวัดค่ะ', go: 2 };
      const top = cityPm[0], low = cityPm[cityPm.length - 1];
      return { text: `ฝุ่นหนักสุดตอนนี้คือ${top.name} ${Math.round(top.pm)} ไมโครกรัม ส่วน${low.name}น้อยสุด ${Math.round(low.pm)} ไมโครกรัมค่ะ`, go: 2 };
    });
  },
};
