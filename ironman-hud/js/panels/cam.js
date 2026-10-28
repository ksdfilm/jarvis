// แผง CAMERA: กล้องหลังพร้อม HUD เป้าเล็งแบบไอรอนแมน (ถ่ายรูปเก็บได้) · สแกน QR · สร้าง QR
// ต้องเปิดผ่าน https และกดอนุญาตกล้อง · ปิดกล้องอัตโนมัติเมื่อออกจากแผง
import { loadScript } from '../lib/load.js';

const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
const QRGEN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
let ctx, stream = null, mode = 'hud', raf = 0, lastScan = 0, orient = { h: null, b: 0, g: 0 };
const $ = (id) => document.getElementById(id);

async function startCam() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) { $('cam-msg').textContent = 'ใช้กล้องไม่ได้ (ต้องเปิดผ่าน https เช่นลิงก์ GitHub)'; return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const v = $('cam-video');
    v.srcObject = stream;
    await v.play();
    $('cam-msg').textContent = '';
    $('cam-start').hidden = true;
    $('cam-view').classList.add('live');
    raf = requestAnimationFrame(loop);
  } catch { $('cam-msg').textContent = 'ยังไม่อนุญาตกล้อง · เปิดได้ที่ ตั้งค่า → Safari → กล้อง'; }
}
function stopCam() {
  cancelAnimationFrame(raf); raf = 0;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('cam-video').srcObject = null;
  $('cam-view').classList.remove('live');
  $('cam-start').hidden = false;
}
addEventListener('deviceorientation', (e) => {
  if (e.webkitCompassHeading != null) orient.h = e.webkitCompassHeading; else if (e.absolute && e.alpha != null) orient.h = (360 - e.alpha) % 360;
  orient.b = e.beta || 0; orient.g = e.gamma || 0;
});

// ---------- HUD ทับภาพกล้อง ----------
function drawHud(g, w, h, t) {
  const hud = getComputedStyle(document.body).getPropertyValue('--hud').trim() || '#3fd8ff';
  const acc = getComputedStyle(document.body).getPropertyValue('--acc').trim() || '#ff3b5c';
  g.save();
  g.strokeStyle = hud; g.fillStyle = hud; g.lineWidth = 2; g.font = `${Math.round(w / 36)}px "Share Tech Mono", monospace`;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.16;
  // เป้าเล็ง: วงหมุน + มุมเล็ง
  g.globalAlpha = 0.9;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.setLineDash([6, 10]); g.lineDashOffset = -t / 30;
  g.beginPath(); g.arc(cx, cy, r * 1.35, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const a = t / 1500 + i * Math.PI / 2;
    g.beginPath(); g.arc(cx, cy, r * 1.6, a, a + 0.5); g.stroke();
  }
  g.strokeStyle = acc;
  g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14); g.stroke();
  const m = Math.min(w, h) * 0.06, bx = w * 0.06, by = h * 0.08;
  g.strokeStyle = hud;
  [[bx, by, 1, 1], [w - bx, by, -1, 1], [bx, h - by, 1, -1], [w - bx, h - by, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x, y + m * sy); g.lineTo(x, y); g.lineTo(x + m * sx, y); g.stroke(); });
  // เส้นขอบฟ้าเอียงตามมือถือ (pitch ladder)
  const roll = (orient.g || 0) * Math.PI / 180, pitch = ((orient.b || 90) - 90) * (h / 90);
  g.save(); g.translate(cx, cy + pitch); g.rotate(-roll);
  g.globalAlpha = 0.6;
  g.beginPath(); g.moveTo(-w * 0.35, 0); g.lineTo(-r * 1.8, 0); g.moveTo(r * 1.8, 0); g.lineTo(w * 0.35, 0); g.stroke();
  g.restore();
  // แถบเข็มทิศด้านบน
  if (orient.h != null) {
    g.globalAlpha = 0.9; g.textAlign = 'center';
    for (let d = -40; d <= 40; d += 5) {
      const deg = Math.round(orient.h / 5) * 5 + d, x = cx + (deg - orient.h) * (w / 100);
      g.beginPath(); g.moveTo(x, by + 4); g.lineTo(x, by + (deg % 15 === 0 ? 18 : 10)); g.stroke();
      if (deg % 15 === 0) { const n = ((deg % 360) + 360) % 360; g.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' })[n] ?? n, x, by + 34); }
    }
    g.fillStyle = acc; g.fillText(`${Math.round(orient.h)}°`, cx, by + 56);
  }
  // ข้อมูลมุมจอ
  g.fillStyle = '#fff'; g.textAlign = 'left';
  const now = new Date(), wx = ctx.wx(), p = ctx.place();
  const lines = [`E.D.I.T · ${now.toLocaleTimeString('th-TH')}`, `${p.lat.toFixed(4)}°N ${p.lon.toFixed(4)}°E`];
  if (wx) lines.push(`${Math.round(wx.f.current.temperature_2m)}°C · RAIN ${wx.f.hourly.precipitation_probability[0] ?? 0}%`, wx.a ? `PM2.5 ${Math.round(wx.a.current.pm2_5)}` : '');
  lines.forEach((s, i) => g.fillText(s, bx + 6, h - by - 10 - (lines.length - 1 - i) * (w / 30)));
  g.textAlign = 'right'; g.fillStyle = hud;
  g.fillText(`TILT ${Math.round(orient.g || 0)}°  PITCH ${Math.round((orient.b || 0) - 90)}°`, w - bx - 6, h - by - 10);
  if (mode === 'qr') { g.fillStyle = acc; g.fillText('QR SCAN MODE', w - bx - 6, h - by - 10 - w / 30); }
  g.restore();
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  const v = $('cam-video'), cv = $('cam-hud');
  if (!v.videoWidth) return;
  const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  drawHud(g, w, h, t);
  if (mode === 'qr' && t - lastScan > 250 && window.jsQR) { lastScan = t; scanQr(v); }
}

// ---------- ถ่ายรูป (ภาพกล้อง + HUD) ----------
async function snap() {
  const v = $('cam-video');
  if (!v.videoWidth) return;
  const w = v.videoWidth, h = v.videoHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, w, h);
  drawHud(g, w, h, performance.now());
  ctx.fx.play('ok');
  $('cam-view').classList.add('flash'); setTimeout(() => $('cam-view').classList.remove('flash'), 250);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  const file = new File([blob], `EDIT-${Date.now()}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'EDIT HUD' }); return; } catch { /* ยกเลิก */ } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- QR ----------
const qrCanvas = document.createElement('canvas');
function scanQr(v) {
  const s = 480, k = Math.min(1, s / Math.max(v.videoWidth, v.videoHeight));
  qrCanvas.width = Math.round(v.videoWidth * k); qrCanvas.height = Math.round(v.videoHeight * k);
  const g = qrCanvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(v, 0, 0, qrCanvas.width, qrCanvas.height);
  const img = g.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (code?.data && code.data !== $('qr-out').dataset.v) showQr(code.data);
}
function showQr(text) {
  const out = $('qr-out');
  out.dataset.v = text;
  ctx.fx.play('ok');
  const isUrl = /^https?:\/\//i.test(text);
  out.innerHTML = `<div class="p-lbl">พบ QR CODE</div><div class="qr-text">${ctx.esc(text)}</div>
    <div class="chips">${isUrl ? `<a class="set-btn" href="${ctx.esc(text)}" target="_blank" rel="noopener">เปิดลิงก์ →</a>` : ''}<button type="button" class="set-btn" data-copy>คัดลอก</button></div>
    ${isUrl ? '<p class="hint left">ตรวจดูลิงก์ก่อนเปิดทุกครั้ง QR ปลอมอาจพาไปเว็บหลอกลวงได้</p>' : ''}`;
  out.hidden = false;
}
async function makeQr() {
  await loadScript(QRGEN);
  const text = $('qr-in').value.trim();
  const box = $('qr-make');
  if (!text) { box.innerHTML = ''; return; }
  const q = window.qrcode(0, 'M');
  q.addData(unescape(encodeURIComponent(text))); // รองรับภาษาไทย (UTF-8)
  q.make();
  box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '<button type="button" class="set-btn" data-dl>บันทึกเป็นรูป</button>';
}
function downloadQr() {
  const svg = $('qr-make').querySelector('svg');
  const img = new Image(), s = 720;
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); g.drawImage(img, 0, 0, s, s);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'qrcode.png'; a.click();
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
}

export default {
  id: 'p-cam', en: 'CAMERA', th: 'กล้อง', sub: 'กล้อง HUD · สแกน / สร้าง QR',
  html: `<div class="cam-view no-swipe" id="cam-view"><video id="cam-video" playsinline muted></video><canvas id="cam-hud"></canvas>
      <button type="button" class="set-btn cam-start" id="cam-start">📷 เปิดกล้อง</button><p class="cam-msg" id="cam-msg"></p></div>
    <div class="chips cam-ctl"><button type="button" data-mode="hud" class="on">🎯 HUD</button><button type="button" data-mode="qr">▣ สแกน QR</button><button type="button" id="cam-snap">📸 ถ่ายรูป</button><button type="button" id="cam-stop">⏹ ปิดกล้อง</button></div>
    <div class="box" id="qr-out" hidden></div>
    <div class="box"><div class="p-lbl">MAKE QR · สร้าง QR Code</div>
      <input id="qr-in" class="qr-in" type="text" placeholder="พิมพ์ข้อความหรือลิงก์ เช่น https://ksdfilm.github.io/jarvis/" autocomplete="off">
      <div class="chips"><button type="button" data-preset="app">ลิงก์แอปนี้</button><button type="button" data-preset="wifi">Wi-Fi</button><button type="button" data-preset="tel">เบอร์โทร</button></div>
      <div id="qr-make" class="qr-make"></div></div>`,
  init(c) {
    ctx = c;
    const panel = $('p-cam');
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'cam-start') startCam();
      if (b.id === 'cam-stop') stopCam();
      if (b.id === 'cam-snap') { if (!stream) await startCam(); snap(); }
      if (b.dataset.mode) {
        mode = b.dataset.mode;
        panel.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        if (mode === 'qr') { loadScript(JSQR); if (!stream) startCam(); }
      }
      if ('copy' in b.dataset) { navigator.clipboard?.writeText($('qr-out').dataset.v).then(() => ctx.toast('คัดลอกแล้ว')); }
      if ('dl' in b.dataset) downloadQr();
      if (b.dataset.preset) {
        const inp = $('qr-in');
        if (b.dataset.preset === 'app') inp.value = location.href.split('?')[0];
        if (b.dataset.preset === 'wifi') { const s = prompt('ชื่อ Wi-Fi (SSID)'); if (!s) return; const p = prompt('รหัสผ่าน Wi-Fi (เว้นว่างถ้าไม่มี)') || ''; inp.value = `WIFI:T:${p ? 'WPA' : 'nopass'};S:${s};P:${p};;`; }
        if (b.dataset.preset === 'tel') { const t = prompt('เบอร์โทร'); if (!t) return; inp.value = `tel:${t.replace(/[^\d+]/g, '')}`; }
        makeQr();
      }
    });
    let tmr; $('qr-in').addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(makeQr, 300); });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-cam');
    ctx.addIntent(/สแกน|qr|คิวอาร์/, () => ({ text: 'เปิดหน้าสแกนคิวอาร์ให้แล้วค่ะ แตะปุ่มสแกน QR ได้เลย', go: go() }));
    ctx.addIntent(/กล้อง|ถ่ายรูป|camera/, () => ({ text: 'เปิดกล้องเอชยูดีให้แล้วค่ะ', go: go() }));
  },
  hide: stopCam,
};
