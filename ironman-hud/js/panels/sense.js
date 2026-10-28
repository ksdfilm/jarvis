// แผง SENSORS: ใช้เซนเซอร์จริงของมือถือ — เข็มทิศ (บอกทางไปบ้าน/ที่ทำงาน) · ระดับน้ำ · วัดเสียงดัง · วงเต้นตามเพลง · ไฟจอ
// iPhone ต้องกด "เปิดเซนเซอร์" (ขออนุญาตจากการแตะ) และต้องเปิดผ่าน https
let ctx;
const RAD = Math.PI / 180;
const sensor = { heading: null, beta: 0, gamma: 0, on: false, abs: false };
let mic = null; // { stream, ac, an, buf, fbuf, raf, peak, sum, n }

// ---------- เซนเซอร์การเอียง/ทิศ ----------
function onOrient(e) {
  if (e.webkitCompassHeading != null) { sensor.heading = e.webkitCompassHeading; sensor.abs = true; } // iPhone: ทิศเหนือแม่เหล็ก
  else if (e.absolute && e.alpha != null) { sensor.heading = (360 - e.alpha) % 360; sensor.abs = true; }
  sensor.beta = e.beta || 0; sensor.gamma = e.gamma || 0;
}
async function enableOrientation() {
  const D = window.DeviceOrientationEvent;
  if (!D) { ctx.toast('อุปกรณ์นี้ไม่มีเซนเซอร์ทิศทาง'); return false; }
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') { ctx.toast('ยังไม่อนุญาตให้ใช้เซนเซอร์'); return false; }
  } catch { ctx.toast('ขออนุญาตไม่สำเร็จ (ต้องเปิดผ่าน https)'); return false; }
  addEventListener('deviceorientationabsolute', onOrient);
  addEventListener('deviceorientation', onOrient);
  sensor.on = true;
  document.getElementById('sn-perm').hidden = true;
  return true;
}

// ---------- จุดหมาย (บ้าน/ที่ทำงาน) ----------
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
function dist(a, b) {
  const h = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
let here = null, watching = false;
function locate() {
  if (watching || !navigator.geolocation || !window.isSecureContext) return;
  watching = true;
  navigator.geolocation.watchPosition((p) => { here = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
}
function saveTarget(key, label) {
  if (!here) { ctx.toast('ยังหาตำแหน่งไม่ได้ (ต้องอนุญาตตำแหน่ง และเปิดผ่าน https)'); return; }
  const t = ctx.store.get('targets', {});
  t[key] = { lat: here.lat, lon: here.lon, label };
  ctx.store.set('targets', t);
  ctx.toast(`บันทึกตำแหน่ง${label}แล้ว`);
  ctx.fx.play('ok');
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DIRS_TH = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
const dirIdx = (deg) => Math.round(((deg % 360) + 360) % 360 / 45) % 8;

function buildCompass() {
  const svg = document.getElementById('sn-rose');
  let s = '';
  for (let i = 0; i < 72; i++) {
    const a = i * 5, long = a % 45 === 0, r0 = long ? 78 : 84;
    const x0 = 100 + r0 * Math.sin(a * RAD), y0 = 100 - r0 * Math.cos(a * RAD), x1 = 100 + 92 * Math.sin(a * RAD), y1 = 100 - 92 * Math.cos(a * RAD);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${a === 0 ? 'var(--acc)' : 'var(--hud)'}" stroke-width="${long ? 2 : 1}" stroke-opacity="${long ? 1 : 0.5}"/>`;
  }
  DIRS.forEach((d, i) => {
    const a = i * 45, x = 100 + 64 * Math.sin(a * RAD), y = 100 - 64 * Math.cos(a * RAD) + 4;
    s += `<text x="${x}" y="${y}" text-anchor="middle" font-size="${i % 2 ? 9 : 13}" fill="${i === 0 ? 'var(--acc)' : '#fff'}" font-family="Share Tech Mono, monospace">${d}</text>`;
  });
  svg.querySelector('.rose').innerHTML = s;
}

// ---------- ไมโครโฟน: เสียงดัง + สเปกตรัม ----------
async function startMic() {
  if (mic) return true;
  if (!navigator.mediaDevices?.getUserMedia) { ctx.toast('ใช้ไมโครโฟนไม่ได้ (ต้องเปิดผ่าน https)'); return false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
    ac.createMediaStreamSource(stream).connect(an);
    mic = { stream, ac, an, buf: new Float32Array(an.fftSize), fbuf: new Uint8Array(an.frequencyBinCount), peak: 0, sum: 0, n: 0, hist: [] };
    document.getElementById('sn-mic').textContent = '⏹ หยุดไมค์';
    document.getElementById('sn-viz').closest('.sn-card').classList.add('mic-on');
    return true;
  } catch { ctx.toast('ยังไม่อนุญาตไมโครโฟน · เปิดได้ที่ ตั้งค่า → Safari → ไมโครโฟน'); return false; }
}
function stopMic() {
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.ac.close();
  mic = null;
  document.getElementById('sn-mic').textContent = '🎙 เปิดไมค์ (วัดเสียง + วงเต้นตามเพลง)';
  document.getElementById('sn-viz').closest('.sn-card').classList.remove('mic-on');
}
// dBFS → ประมาณ dB(A) แบบหยาบ (มือถือไม่ได้สอบเทียบ: บวกค่าชดเชยให้ใกล้เครื่องวัดทั่วไป)
const CAL = 100;
function readDb() {
  mic.an.getFloatTimeDomainData(mic.buf);
  let s = 0; for (const v of mic.buf) s += v * v;
  const rms = Math.sqrt(s / mic.buf.length);
  return Math.max(20, Math.min(120, 20 * Math.log10(rms || 1e-8) + CAL));
}
const DB_LV = [[40, 'เงียบ', '#2ee6a6'], [60, 'พูดคุยปกติ', '#2ee6a6'], [75, 'ค่อนข้างดัง', '#ffd23f'], [85, 'ดัง', '#ff8a3d'], [200, 'ดังมาก เสี่ยงต่อการได้ยิน', '#ff3b5c']];

// ---------- วาดทุกเฟรม ----------
let raf = 0, visible = false, last = 0;
function loop(t) {
  raf = requestAnimationFrame(loop);
  if (t - last < 33) return;
  last = t;
  // เข็มทิศ
  const h = sensor.heading;
  const rose = document.querySelector('#sn-rose .rose');
  if (h != null) {
    rose.setAttribute('transform', `rotate(${-h} 100 100)`);
    document.getElementById('sn-head').innerHTML = `${Math.round(h)}°<small>${DIRS_TH[dirIdx(h)]}</small>`;
  }
  const tg = ctx.store.get('targets', {});
  const tgtEl = document.getElementById('sn-targets');
  const me = here || ctx.place();
  let marks = '';
  tgtEl.innerHTML = Object.values(tg).map((x) => {
    const b = bearing(me, x), d = dist(me, x);
    if (h != null) { const a = (b - h) * RAD; marks += `<g transform="translate(${100 + 96 * Math.sin(a)} ${100 - 96 * Math.cos(a)})"><circle r="7" fill="var(--acc)"/><text y="3.5" text-anchor="middle" font-size="9" fill="#02070d">${x.label === 'บ้าน' ? 'H' : 'W'}</text></g>`; }
    return `<span><b>${x.label}</b> ${d < 1 ? `${Math.round(d * 1000)} ม.` : `${d.toFixed(1)} กม.`} · ทิศ${DIRS_TH[dirIdx(b)]} (${Math.round(b)}°)</span>`;
  }).join('') || '<span class="muted">ยังไม่ได้บันทึกบ้าน/ที่ทำงาน</span>';
  document.querySelector('#sn-rose .marks').innerHTML = marks;
  // ระดับน้ำ
  const bx = Math.max(-1, Math.min(1, sensor.gamma / 30)), by = Math.max(-1, Math.min(1, (sensor.beta - (Math.abs(sensor.beta) > 60 ? 90 * Math.sign(sensor.beta) : 0)) / 30));
  const flat = Math.abs(sensor.beta) < 60;
  const tilt = flat ? Math.hypot(sensor.beta, sensor.gamma) : Math.abs(sensor.gamma);
  document.getElementById('sn-bubble').style.transform = `translate(${-bx * 70}px, ${-by * 70}px)`;
  const lvl = document.getElementById('sn-level');
  lvl.classList.toggle('flat', tilt < 1);
  document.getElementById('sn-tilt').innerHTML = sensor.on ? `${tilt.toFixed(1)}°<small>${tilt < 1 ? 'ได้ระดับ ✓' : flat ? `หน้า-หลัง ${sensor.beta.toFixed(1)}° · ซ้าย-ขวา ${sensor.gamma.toFixed(1)}°` : 'วางตั้ง: วัดซ้าย-ขวา'}</small>` : '—';
  // เสียง
  if (mic) {
    const db = readDb();
    mic.peak = Math.max(mic.peak, db); mic.sum += db; mic.n++;
    const lv = DB_LV.find((x) => db < x[0]);
    document.getElementById('sn-db').innerHTML = `${Math.round(db)}<small>dB · ${lv[1]}</small>`;
    const bar = document.getElementById('sn-dbbar');
    bar.style.width = `${(db - 20) / 100 * 100}%`; bar.style.background = lv[2];
    document.getElementById('sn-dbstat').textContent = `สูงสุด ${Math.round(mic.peak)} · เฉลี่ย ${Math.round(mic.sum / mic.n)} dB`;
    drawViz();
  }
}
function drawViz() {
  const cv = document.getElementById('sn-viz'), g = cv.getContext('2d');
  const w = cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = w * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, w);
  mic.an.getByteFrequencyData(mic.fbuf);
  const hud = getComputedStyle(document.body).getPropertyValue('--hud').trim(), acc = getComputedStyle(document.body).getPropertyValue('--acc').trim();
  const c = w / 2, r0 = w * 0.2, N = 96;
  let energy = 0;
  for (let i = 0; i < N; i++) {
    const v = mic.fbuf[Math.floor(Math.pow(i / N, 1.7) * mic.fbuf.length * 0.6)] / 255;
    energy += v;
    const a = (i / N) * Math.PI * 2 - Math.PI / 2, len = r0 * 0.15 + v * w * 0.27;
    g.strokeStyle = i % 8 === 0 ? acc : hud; g.lineWidth = 2.2; g.globalAlpha = 0.35 + v * 0.65;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * (r0 + len), c + Math.sin(a) * (r0 + len)); g.stroke();
  }
  g.globalAlpha = 1;
  const k = energy / N;
  const grd = g.createRadialGradient(c, c, 0, c, c, r0 * (0.9 + k * 0.6));
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, hud); grd.addColorStop(1, 'transparent');
  g.fillStyle = grd; g.beginPath(); g.arc(c, c, r0 * (0.9 + k * 0.6), 0, Math.PI * 2); g.fill();
}

// ---------- ไฟจอ ----------
function screenLight() {
  const el = document.createElement('div');
  el.className = 'screenlight';
  el.innerHTML = '<div class="sl-ctl"><button type="button" data-c="#ffffff">ขาว</button><button type="button" data-c="#ffd8a8">อุ่น</button><button type="button" data-c="#ff2a2a">แดง (ถนอมสายตา)</button><button type="button" data-x>ปิด</button></div><p>แตะปุ่มด้านบนเพื่อเปลี่ยนสี · เพิ่มความสว่างจอเต็มที่จากศูนย์ควบคุม</p>';
  document.body.append(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('x' in b.dataset) el.remove(); else el.style.background = b.dataset.c;
  });
}

export default {
  id: 'p-sense', en: 'SENSORS', th: 'เซนเซอร์', sub: 'เข็มทิศ · ระดับน้ำ · วัดเสียง · ไฟจอ',
  html: `<button type="button" class="set-btn wide-btn" id="sn-perm">📡 เปิดเซนเซอร์ (เข็มทิศ / ระดับน้ำ)</button>
    <div class="sn-grid">
      <div class="box sn-card"><div class="p-lbl">COMPASS · เข็มทิศ</div>
        <svg id="sn-rose" class="sn-rose no-swipe" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(var(--hud-rgb),.3)"/><g class="rose"></g><g class="marks"></g><path d="M100 2 L94 16 L106 16 Z" fill="var(--acc)"/></svg>
        <div class="sn-val" id="sn-head">—<small>แตะ "เปิดเซนเซอร์"</small></div>
        <div class="sn-targets" id="sn-targets"></div>
        <div class="chips"><button type="button" data-save="home">🏠 บันทึกตรงนี้เป็นบ้าน</button><button type="button" data-save="work">🏭 บันทึกเป็นที่ทำงาน</button></div></div>
      <div class="box sn-card"><div class="p-lbl">LEVEL · ระดับน้ำ</div>
        <div class="sn-level no-swipe" id="sn-level"><i class="lv-ring r1"></i><i class="lv-ring r2"></i><i class="cross"></i><b id="sn-bubble"></b></div>
        <div class="sn-val" id="sn-tilt">—</div><p class="hint left">วางมือถือราบบนพื้นผิว: ฟองอยู่กลางวง = ได้ระดับ</p></div>
      <div class="box sn-card"><div class="p-lbl">SOUND · วัดเสียงดัง + วงเต้นตามเพลง</div>
        <canvas id="sn-viz" class="sn-viz" aria-hidden="true"></canvas>
        <div class="sn-val" id="sn-db">—<small>dB</small></div>
        <div class="meter"><span id="sn-dbbar"></span></div><div class="sub" id="sn-dbstat"></div>
        <button type="button" class="set-btn" id="sn-mic">🎙 เปิดไมค์ (วัดเสียง + วงเต้นตามเพลง)</button>
        <p class="hint left">ค่าโดยประมาณ ไม่ใช่เครื่องวัดมาตรฐาน · ที่ทำงานไม่ควรเกิน 85 dB(A) ต่อเนื่อง 8 ชม.</p></div>
      <div class="box sn-card"><div class="p-lbl">LIGHT · ไฟจอ</div>
        <p class="hint left">เว็บสั่งเปิดแฟลชกล้องบน iPhone ไม่ได้ จึงใช้จอสว่างเต็มเป็นไฟส่องแทน (เปิดไฟฉายจริง: ปัดศูนย์ควบคุม)</p>
        <button type="button" class="set-btn" id="sn-light">💡 เปิดไฟจอ</button></div>
    </div>`,
  init(c) {
    ctx = c;
    buildCompass();
    const panel = document.getElementById('p-sense');
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'sn-perm') enableOrientation();
      if (b.id === 'sn-mic') { if (mic) stopMic(); else await startMic(); }
      if (b.id === 'sn-light') screenLight();
      if (b.dataset.save) saveTarget(b.dataset.save, b.dataset.save === 'home' ? 'บ้าน' : 'ที่ทำงาน');
    });
    // Android/คอมไม่ต้องขออนุญาต → ฟังได้เลย
    if (typeof window.DeviceOrientationEvent?.requestPermission !== 'function' && 'DeviceOrientationEvent' in window) {
      addEventListener('deviceorientationabsolute', onOrient); addEventListener('deviceorientation', onOrient); sensor.on = true;
    }
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-sense');
    ctx.addIntent(/เข็มทิศ|ทิศเหนือ|หันไปทาง|compass/, () => ({ text: sensor.heading != null ? `ตอนนี้หันไปทาง${DIRS_TH[dirIdx(sensor.heading)]} ${Math.round(sensor.heading)} องศาค่ะ` : 'เปิดเข็มทิศให้แล้วค่ะ แตะปุ่มเปิดเซนเซอร์ก่อนนะคะ', go: go() }));
    ctx.addIntent(/ทางไปบ้าน|บ้านอยู่ทางไหน|ไปบ้าน/, () => {
      const t = ctx.store.get('targets', {}).home;
      if (!t) return { text: 'ยังไม่ได้บันทึกตำแหน่งบ้านค่ะ บันทึกได้ที่แผงเซนเซอร์', go: go() };
      const me = here || ctx.place(), b = bearing(me, t);
      return { text: `บ้านอยู่ทาง${DIRS_TH[dirIdx(b)]} ห่าง ${dist(me, t).toFixed(1)} กิโลเมตรค่ะ`, go: go() };
    });
    ctx.addIntent(/เสียงดัง|วัดเสียง|เดซิเบล|db/, () => ({ text: 'เปิดเครื่องวัดเสียงให้แล้วค่ะ แตะปุ่มเปิดไมค์ได้เลย', go: go() }));
    ctx.addIntent(/ไฟฉาย|ไฟจอ|ส่องไฟ|flash/, () => { setTimeout(screenLight, 800); return { text: 'เปิดไฟจอให้ค่ะ' }; });
    ctx.addIntent(/ระดับน้ำ|วัดระดับ|เอียง|level/, (q) => (/ท่วม/.test(q) ? null : { text: 'เปิดเครื่องวัดระดับให้แล้วค่ะ วางมือถือราบบนพื้นผิวได้เลย', go: go() }));
  },
  show() { visible = true; locate(); if (!raf) raf = requestAnimationFrame(loop); },
  hide() { visible = false; cancelAnimationFrame(raf); raf = 0; stopMic(); },
};
