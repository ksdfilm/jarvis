// โหมดชีพจร + การหายใจ — rPPG (วิธี POS, Wang 2017) จากสีผิวหน้าผาก/แก้ม, หายใจจากการขยับของศีรษะ
import { dist, mean, std, median, resample, detrend, smooth, peakFreq, LV, LVTH, saveResult, history, esc } from './util.js';

const FS = 30, SESSION = 30;
const oc = document.createElement('canvas');
const og = oc.getContext('2d', { willReadFrequently: true });

let root, buf, est, resp, session = null, uiT = 0, calcT = 0, wave = [], bpm = null, rpm = null, quality = 0, warn = '';

function reset() { buf = { t: [], rgb: [], head: [], move: [] }; est = []; resp = []; bpm = rpm = null; wave = []; quality = 0; }

function pos(rgb) {
  const N = rgb.length, l = Math.round(1.6 * FS), H = new Array(N).fill(0);
  for (let n = 0; n + l <= N; n++) {
    const w = rgb.slice(n, n + l);
    const m = [0, 1, 2].map(c => mean(w.map(p => p[c])) || 1);
    const s1 = w.map(p => p[1] / m[1] - p[2] / m[2]);
    const s2 = w.map(p => p[1] / m[1] + p[2] / m[2] - 2 * p[0] / m[0]);
    const a = std(s1) / (std(s2) || 1);
    const h = s1.map((v, i) => v + a * s2[i]), hm = mean(h);
    for (let i = 0; i < l; i++) H[n + i] += h[i] - hm;
  }
  return H;
}

function sampleBox(cx, cy, w, h) {
  const x = Math.max(0, Math.round(cx - w / 2)), y = Math.max(0, Math.round(cy - h / 2));
  const W = Math.min(oc.width - x, Math.round(w)), Hh = Math.min(oc.height - y, Math.round(h));
  if (W < 2 || Hh < 2) return null;
  const d = og.getImageData(x, y, W, Hh).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [r / n, g / n, b / n, n];
}

function compute() {
  const t = buf.t, dur = t.length ? t[t.length - 1] - t[0] : 0;
  if (dur < 8) return;
  // heart: last 12 s
  const i0 = t.findIndex(x => x > t[t.length - 1] - 12);
  const tt = t.slice(i0);
  const rgb = [0, 1, 2].map(c => resample(tt, buf.rgb.slice(i0).map(p => p[c]), FS));
  const sig = pos(rgb[0].map((_, i) => [rgb[0][i], rgb[1][i], rgb[2][i]]));
  const clean = smooth(detrend(sig, FS), 2);
  const pk = peakFreq(clean, FS, 0.75, 3.0, 0.01);
  quality = pk.snr;
  wave = clean.slice(-FS * 6);
  if (pk.snr > 4) { est.push(pk.freq * 60); if (est.length > 12) est.shift(); }
  bpm = est.length >= 2 ? median(est.slice(-6)) : null;
  // breathing: head bob over the last 30 s, needs ≥ 15 s
  if (dur >= 15) {
    const j0 = t.findIndex(x => x > t[t.length - 1] - 30);
    const hs = resample(t.slice(j0), buf.head.slice(j0), 10);
    const rp = peakFreq(detrend(hs, 80), 10, 0.1, 0.6, 0.005);
    if (rp.snr > 3) { resp.push(rp.freq * 60); if (resp.length > 8) resp.shift(); }
    rpm = resp.length ? median(resp) : null;
  }
}

const hrLv = v => (v >= 60 && v <= 100 ? 0 : v >= 50 && v <= 110 ? 1 : 2);
const rrLv = v => (v >= 12 && v <= 20 ? 0 : v >= 10 && v <= 24 ? 1 : 2);

function renderLive() {
  const q = quality > 12 ? ['ดี', 'ok'] : quality > 5 ? ['พอใช้', 'warn'] : ['อ่อน', 'bad'];
  const prog = session ? Math.min(100, (performance.now() - session.start) / (SESSION * 1000) * 100) : 0;
  root.querySelector('#vLive').innerHTML = `
    <div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap">
      <div><div class="sub" style="margin:0">ชีพจร</div><div class="big-num">${bpm ? Math.round(bpm) : '--'}<small>bpm</small></div></div>
      <div><div class="sub" style="margin:0">หายใจ</div><div class="big-num" style="font-size:40px">${rpm ? Math.round(rpm) : '--'}<small>/นาที</small></div></div>
    </div>
    <div class="sub" style="margin-top:6px">คุณภาพสัญญาณ: <span style="color:var(--${q[1]})">${q[0]}</span>${warn ? ' · <span style="color:var(--warn)">' + warn + '</span>' : ''}</div>
    ${session ? `<div class="bar"><i style="width:${prog}%"></i></div>` : ''}`;
  drawWave();
}
function drawWave() {
  const c = root.querySelector('#vWave'); if (!c) return;
  const w = c.clientWidth, h = c.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
  if (c.width !== w * d) { c.width = w * d; c.height = h * d; }
  const g = c.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  if (wave.length < 10) return;
  const m = Math.max(...wave.map(Math.abs)) || 1;
  g.beginPath();
  wave.forEach((v, i) => { const x = i / (wave.length - 1) * w, y = h / 2 - v / m * h * .42; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = '#ff4d6d'; g.lineWidth = 2; g.shadowColor = '#ff4d6d'; g.shadowBlur = 8; g.stroke();
}
function renderReport(r) {
  const el = root.querySelector('#vReport');
  if (!r) { el.innerHTML = ''; return; }
  const row = (name, v, unit, l, d) => `<div class="m ${v == null ? 'na' : LV[l]}"><b>${name}</b><span class="v">${v == null ? 'วัดไม่ได้' : Math.round(v) + ' ' + unit}</span><span class="d">${v == null ? 'สัญญาณไม่พอ — นั่งนิ่งในที่สว่างแล้ววัดใหม่' : LVTH[l] + ' · ' + d}</span></div>`;
  el.innerHTML = `<div class="report"><h3>ผลวัด ${SESSION} วินาที</h3>
    ${row('ชีพจรขณะพัก', r.hr, 'bpm', hrLv(r.hr), 'ผู้ใหญ่ปกติ 60–100 (นักกีฬาอาจต่ำกว่า 60)')}
    ${row('อัตราการหายใจ', r.rr, 'ครั้ง/นาที', rrLv(r.rr), 'ผู้ใหญ่ปกติ 12–20')}
    ${r.hr && hrLv(r.hr) === 2 ? '<div class="alert">ชีพจรอยู่นอกช่วงปกติ — วัดซ้ำด้วยเครื่องวัดความดัน/oximeter ถ้ามีใจสั่น เหนื่อย เจ็บหน้าอก หน้ามืด ควรพบแพทย์</div>' : ''}
    <p class="note">ค่าประมาณจากกล้อง คลาดเคลื่อนได้ ±5–10 bpm โดยเฉพาะแสงน้อย ขยับตัว หรือผิวคล้ำมาก ไม่ใช้แทนเครื่องวัดทางการแพทย์</p></div>`;
  renderHist();
}
function renderHist() {
  const h = history('vitals').slice(0, 6);
  root.querySelector('#vHist').innerHTML = h.length ? `<h4>ประวัติ</h4>` + h.map(r => `<div><time>${new Date(r.t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</time>${esc(r.title)}</div>`).join('') : '';
}

export default {
  id: 'vitals', icon: '❤', title: 'ชีพจร', hud: 'VITALS // rPPG',
  needs: () => 'face',
  mount(el, k) {
    root = el; reset(); session = null;
    el.innerHTML = `<h2>❤ ชีพจรและการหายใจจากใบหน้า</h2>
      <p class="sub">นั่งนิ่ง หน้าตรงเข้ากล้อง ห่าง ~50 ซม. แสงสว่างสม่ำเสมอ (ไม่ย้อนแสง) ไม่พูดระหว่างวัด</p>
      <div id="vLive"></div>
      <canvas class="wave" id="vWave"></canvas>
      <button class="btn primary big" id="vGo" style="width:100%">◉ เริ่มวัด ${SESSION} วินาที</button>
      <div id="vReport"></div>
      <p class="note">หลักการ: ทุกครั้งที่หัวใจบีบ เลือดที่ไหลเข้าผิวหน้าทำให้สีผิวเปลี่ยนเล็กน้อย (มองด้วยตาไม่เห็น) กล้องจับการเปลี่ยนแปลงนี้แล้วหาความถี่ = ชีพจร</p>
      <div class="hist" id="vHist"></div>`;
    el.querySelector('#vGo').onclick = () => {
      reset(); renderReport(null);
      session = { start: performance.now() };
      el.querySelector('#vGo').disabled = true;
    };
    renderLive(); renderHist();
  },
  unmount() { session = null; },
  frame(res, k, now) {
    const f = res.face, v = k.video;
    if (!f) { k.guide('ยังไม่เห็นใบหน้า'); return; }
    // sample at reduced resolution
    const ow = 320, oh = Math.round(320 * v.videoHeight / v.videoWidth);
    if (oc.width !== ow) { oc.width = ow; oc.height = oh; }
    og.drawImage(v, 0, 0, ow, oh);
    const px = i => ({ x: f[i].x * ow, y: f[i].y * oh });
    const fw = dist(px(234), px(454)), fh = dist(px(10), px(152));
    const fore = px(151), cheekR = px(205), cheekL = px(425);
    const boxes = [[fore.x, fore.y, fw * .38, fh * .12], [cheekR.x, cheekR.y, fw * .16, fw * .16], [cheekL.x, cheekL.y, fw * .16, fw * .16]];
    let acc = [0, 0, 0], n = 0;
    for (const b of boxes) { const s = sampleBox(...b); if (s) { for (let c = 0; c < 3; c++) acc[c] += s[c] * s[3]; n += s[3]; } }
    if (!n) return;
    const rgb = acc.map(x => x / n);
    const t = now / 1000;
    const nose = px(1);
    const lastNose = buf.move[buf.move.length - 1];
    buf.t.push(t); buf.rgb.push(rgb); buf.head.push((px(10).y + px(152).y) / 2 / fh); buf.move.push(nose);
    while (buf.t.length && buf.t[0] < t - 32) { buf.t.shift(); buf.rgb.shift(); buf.head.shift(); buf.move.shift(); }

    const moved = lastNose ? dist(nose, lastNose) / fw : 0;
    const bright = (rgb[0] + rgb[1] + rgb[2]) / 3;
    warn = bright < 60 ? 'แสงน้อยเกินไป' : moved > .03 ? 'ขยับมากไป อยู่นิ่งๆ' : fw < ow * .18 ? 'เข้าใกล้กล้องอีกนิด' : '';

    // overlay: sampling boxes + pulsing heart
    const g = k.g;
    for (const [cx, cy, w, h] of boxes) {
      const p = k.P({ x: cx / ow, y: cy / oh }), sx = w / ow * k.W, sy = h / oh * k.H;
      g.strokeStyle = 'rgba(255,77,109,.9)'; g.lineWidth = 1.5; g.strokeRect(p.x - sx / 2, p.y - sy / 2, sx, sy);
    }
    k.faceMesh(f, 6);
    if (bpm) {
      const beat = Math.pow(Math.max(0, Math.sin(now / 1000 * Math.PI * bpm / 60)), 8);
      const p = k.P(f[454]);
      k.label({ x: p.x + (k.mirror ? -110 : 16), y: p.y }, `♥ ${Math.round(bpm)}`, `rgba(255,77,109,${.5 + beat * .5})`, 22 + beat * 6);
    }
    if (session) k.scanline(now);
    k.guide(session ? `กำลังวัด… ${Math.max(0, Math.ceil(SESSION - (now - session.start) / 1000))} วิ${warn ? ' · ' + warn : ''}` : warn || 'กด "เริ่มวัด" (แสดงค่าสดหลัง ~8 วินาที)');

    if (now - calcT > 1000) { calcT = now; compute(); }
    if (session && now - session.start > SESSION * 1000) {
      const r = { hr: est.length >= 3 ? median(est) : null, rr: rpm };
      session = null;
      root.querySelector('#vGo').disabled = false;
      saveResult('vitals', `ชีพจร ${r.hr ? Math.round(r.hr) : '--'} bpm · หายใจ ${r.rr ? Math.round(r.rr) : '--'}/นาที`, []);
      renderReport(r);
    }
    if (now - uiT > 250) { uiT = now; renderLive(); }
  },
};
