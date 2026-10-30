// SAFETY//CAM — PPE colour heuristic (hard hat / hi-vis vest) + fall detection on PoseLandmarker
import { bar, gate, camera, vision, MODELS, store, toast, $, $$, isPhone, clamp, wakeLock } from '../common/lab.js';

bar('SAFETY//CAM', 'กล้องตรวจหมวกนิรภัย · เสื้อสะท้อนแสง · คนล้ม', `<span class="mono" id="stat" style="font-size:12px;color:var(--dim)"></span>`);

const DEF = {
  needHat: true, needVest: true, fall: true, sound: true, debug: false,
  hatThr: 0.30, vestThr: 0.15, fallAngle: 60, fallSec: 2, holdSec: 1.5, cooldown: 20,
  hatColors: { yellow: true, orange: true, red: true, blue: true, white: true, green: false },
};
let S = { ...DEF, ...store.get('safety.cfg', {}) };
S.hatColors = { ...DEF.hatColors, ...S.hatColors };
const save = () => store.set('safety.cfg', S);

// ---------- colour classification ----------
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
const HAT = {
  yellow: { th: 'เหลือง', c: '#ffd400', f: (h, s, v) => h >= 40 && h < 70 && s > 0.5 && v > 0.5 },
  orange: { th: 'ส้ม', c: '#ff8a00', f: (h, s, v) => h >= 15 && h < 40 && s > 0.65 && v > 0.55 },
  red: { th: 'แดง', c: '#ff2a2a', f: (h, s, v) => (h < 12 || h >= 340) && s > 0.6 && v > 0.4 },
  blue: { th: 'น้ำเงิน', c: '#2a6bff', f: (h, s, v) => h >= 195 && h < 245 && s > 0.5 && v > 0.35 },
  white: { th: 'ขาว', c: '#ffffff', f: (h, s, v) => s < 0.16 && v > 0.8 },
  green: { th: 'เขียว', c: '#22c55e', f: (h, s, v) => h >= 85 && h < 160 && s > 0.5 && v > 0.4 },
};
// fluorescent yellow-green / orange (hi-vis)
const VEST = (h, s, v) => (h >= 52 && h < 100 && s > 0.55 && v > 0.6) || (h >= 8 && h < 35 && s > 0.7 && v > 0.7);

// ---------- DOM / state ----------
const video = $('#video'), cv = $('#cv'), ctx = cv.getContext('2d');
const smp = document.createElement('canvas'), sctx = smp.getContext('2d', { willReadFrequently: true });
let pose, mirror = false, facing = isPhone() ? 'environment' : 'user', paused = false, audio;
let tracks = [], nextId = 1;
const events = [];
let fps = 0, lastT = 0, lastVT = -1;

// ---------- settings UI ----------
const SL = [
  ['hatThr', 'สัดส่วนสีหมวกขั้นต่ำ', 0.05, 0.8, 0.01, v => Math.round(v * 100) + '%', 'สูง = เข้มงวด (ต้องเห็นสีหมวกเต็มกว่า)'],
  ['vestThr', 'สัดส่วนสีสะท้อนแสงที่ลำตัว', 0.03, 0.6, 0.01, v => Math.round(v * 100) + '%', 'เสื้อกั๊กแถบเล็กใช้ค่าต่ำ ~8–12%'],
  ['fallAngle', 'มุมลำตัวที่ถือว่า "นอน"', 35, 85, 1, v => v + '°', '0° = ยืนตรง, 90° = นอนราบ'],
  ['fallSec', 'อยู่ในท่านอนนานเกิน', 0.5, 6, 0.5, v => v + ' วิ', 'ก่อนแจ้งเตือนคนล้ม'],
  ['holdSec', 'ไม่สวม PPE ต่อเนื่องนาน', 0.5, 6, 0.5, v => v + ' วิ', 'กันเตือนผิดจากภาพกระพริบ'],
  ['cooldown', 'เตือนซ้ำคนเดิมได้ทุก', 5, 120, 5, v => v + ' วิ', ''],
];
function renderSettings() {
  $$('[data-k]').forEach(el => { el.checked = !!S[el.dataset.k]; el.onchange = () => { S[el.dataset.k] = el.checked; save(); renderPeople(); }; });
  $('#hatColors').innerHTML = Object.entries(HAT).map(([k, v]) => `<label><input type="checkbox" data-hc="${k}"${S.hatColors[k] ? ' checked' : ''}><span class="sw" style="background:${v.c}"></span>${v.th}</label>`).join('');
  $$('[data-hc]').forEach(el => el.onchange = () => { S.hatColors[el.dataset.hc] = el.checked; save(); });
  $('#sliders').innerHTML = SL.map(([k, l, mn, mx, st, f, n]) => `<label class="sl"><span>${l}</span><output id="o-${k}">${f(S[k])}</output><input type="range" min="${mn}" max="${mx}" step="${st}" value="${S[k]}" data-s="${k}">${n ? `<small>${n}</small>` : ''}</label>`).join('');
  $$('[data-s]').forEach(el => el.oninput = () => {
    const k = el.dataset.s; S[k] = +el.value; $('#o-' + k).textContent = SL.find(s => s[0] === k)[5](S[k]); save();
  });
}
renderSettings();
$('#reset').onclick = () => { S = JSON.parse(JSON.stringify(DEF)); save(); renderSettings(); toast('คืนค่าเริ่มต้นแล้ว'); };
$$('[data-tab]').forEach(b => b.onclick = () => {
  $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
  $('#tab-log').hidden = b.dataset.tab !== 'log'; $('#tab-set').hidden = b.dataset.tab !== 'set';
});

// ---------- sound ----------
function beep(kind) {
  if (!S.sound || !audio) return;
  const t0 = audio.currentTime;
  const o = audio.createOscillator(), g = audio.createGain();
  o.connect(g); g.connect(audio.destination);
  if (kind === 'fall') {           // siren
    o.type = 'sawtooth';
    for (let i = 0; i < 6; i++) { o.frequency.setValueAtTime(700, t0 + i * 0.35); o.frequency.linearRampToValueAtTime(1300, t0 + i * 0.35 + 0.3); }
    g.gain.setValueAtTime(0.18, t0); g.gain.setValueAtTime(0, t0 + 2.1);
    o.start(t0); o.stop(t0 + 2.2);
  } else {                         // double beep
    o.type = 'square'; o.frequency.value = 880;
    g.gain.setValueAtTime(0, t0);
    [0, 0.25].forEach(d => { g.gain.setValueAtTime(0.15, t0 + d); g.gain.setValueAtTime(0, t0 + d + 0.15); });
    o.start(t0); o.stop(t0 + 0.45);
  }
}
let alarmT;
function alarm(text, kind) {
  const el = $('#alarm');
  el.hidden = false; el.className = kind === 'fall' ? 'fall' : ''; el.innerHTML = `<div>${text}</div>`;
  clearTimeout(alarmT); alarmT = setTimeout(() => { el.hidden = true; }, kind === 'fall' ? 6000 : 3500);
}

// ---------- geometry helpers ----------
const P = (lm, i, W, H) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 1 });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// sample a grid of points; returns { n, hits, cols:[...], dom, pts }
function sampleGrid(img, sw, sh, pointAt, nu, nv, test) {
  const pts = []; let n = 0, hits = 0; const colHits = new Array(nu).fill(0); const dom = {};
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const p = pointAt((i + 0.5) / nu, (j + 0.5) / nv);
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
    const o = (y * sw + x) * 4; n++;
    const [h, s, v] = hsv(img[o], img[o + 1], img[o + 2]);
    const k = test(h, s, v);
    if (k) { hits++; colHits[i]++; dom[k] = (dom[k] || 0) + 1; }
    pts.push([p.x, p.y, k]);
  }
  const best = Object.entries(dom).sort((a, b) => b[1] - a[1])[0];
  return { n, hits, ratio: n ? hits / n : 0, cover: colHits.filter(c => c >= 2).length / nu, dom: best?.[0], pts, inFrame: n / (nu * nv) };
}

function analyse(lm, img, sw, sh) {
  const g = i => P(lm, i, sw, sh);
  const nose = g(0), le = g(2), re = g(5), lear = g(7), rear = g(8), ls = g(11), rs = g(12), lh = g(23), rh = g(24);
  const sh_ = mid(ls, rs), hp = mid(lh, rh), eye = mid(le, re);
  const r = {};
  // --- hard hat: region above the eyes, oriented along the neck→head axis
  const faceVis = Math.min(nose.v, Math.max(le.v, re.v)) > 0.5;
  const s = Math.max(dist(lear, rear), dist(ls, rs) * 0.42, dist(le, re) * 2.4, 4);
  let up = { x: eye.x - sh_.x, y: eye.y - sh_.y }; const ul = Math.hypot(up.x, up.y) || 1; up = { x: up.x / ul, y: up.y / ul };
  const perp = { x: -up.y, y: up.x };
  const hc = (lear.v > 0.4 && rear.v > 0.4) ? mid(mid(lear, rear), eye) : eye;
  const allowed = Object.keys(HAT).filter(k => S.hatColors[k]);
  r.hat = sampleGrid(img, sw, sh, (u, v) => {
    const a = (u - 0.5) * 1.25 * s, t = (0.4 + (1 - v) * 0.95) * s;
    return { x: hc.x + up.x * t + perp.x * a, y: hc.y + up.y * t + perp.y * a };
  }, 14, 10, (h, s2, v) => allowed.find(k => HAT[k].f(h, s2, v)));
  r.hat.visible = faceVis && r.hat.inFrame > 0.7;
  r.hat.ok = r.hat.ratio >= S.hatThr && r.hat.cover >= 0.5;
  // --- vest: torso quad (shoulders→hips), shrunk toward the centre
  const torsoVis = Math.min(ls.v, rs.v) > 0.5 && Math.min(lh.v, rh.v) > 0.3;
  const L = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  r.vest = sampleGrid(img, sw, sh, (u, v) => {
    const uu = 0.12 + u * 0.76, vv = 0.08 + v * 0.8;
    return L(L(ls, rs, uu), L(lh, rh, uu), vv);
  }, 14, 14, (h, s2, v) => VEST(h, s2, v) ? 'v' : null);
  r.vest.visible = torsoVis && r.vest.inFrame > 0.6;
  r.vest.ok = r.vest.ratio >= S.vestThr;
  // --- posture: torso angle from vertical (aspect-correct pixel space)
  r.angle = Math.atan2(Math.abs(sh_.x - hp.x), Math.abs(sh_.y - hp.y)) * 180 / Math.PI;
  if (sh_.y > hp.y + dist(sh_, hp) * 0.3) r.angle = Math.max(r.angle, 90); // upside down / head below hips
  r.torso = dist(sh_, hp); r.hipY = hp.y; r.center = mid(sh_, hp);
  const xs = lm.filter(p => (p.visibility ?? 1) > 0.5).map(p => p.x * sw), ys = lm.filter(p => (p.visibility ?? 1) > 0.5).map(p => p.y * sh);
  r.box = xs.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : null;
  r.wide = r.box && (r.box.x1 - r.box.x0) > 1.3 * (r.box.y1 - r.box.y0) && lm[27].visibility > 0.5 && lm[28].visibility > 0.5;
  return r;
}

// ---------- tracking + rules ----------
function update(results, img, sw, sh, now) {
  const seen = [];
  for (const lm of results) {
    const a = analyse(lm, img, sw, sh);
    let best = null, bd = Infinity;
    for (const t of tracks) {
      if (seen.includes(t)) continue;
      const d = Math.hypot(t.cx - a.center.x / sw, t.cy - a.center.y / sh);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best || bd > 0.22) {
      best = { id: nextId++, hatE: 0.5, vestE: 0.5, hist: [], downSince: null, fallen: false, dropAt: 0, viol: {}, last: {} };
      tracks.push(best);
    }
    const t = best; seen.push(t);
    t.cx = a.center.x / sw; t.cy = a.center.y / sh; t.seen = now; t.lm = lm; t.a = a;
    if (a.hat.visible) t.hatE += ((a.hat.ok ? 1 : 0) - t.hatE) * 0.2;
    if (a.vest.visible) t.vestE += ((a.vest.ok ? 1 : 0) - t.vestE) * 0.2;
    // fall: fast hip drop + staying horizontal
    t.hist.push([now, a.hipY / sh, a.torso / sh]); t.hist = t.hist.filter(h => now - h[0] < 900);
    const minY = Math.min(...t.hist.map(h => h[1])), torsoAvg = t.hist.reduce((s, h) => s + h[2], 0) / t.hist.length;
    if (torsoAvg > 0 && (a.hipY / sh - minY) / torsoAvg > 1.0) t.dropAt = now;
    const down = a.angle > S.fallAngle || a.wide;
    t.down = down;
    if (down) t.downSince ??= now; else { t.downSince = null; t.fallen = false; }
    const wasFallen = t.fallen;
    t.fallen = S.fall && down && now - t.downSince >= S.fallSec * 1000;
    t.sudden = now - t.dropAt < 3000;
    if (t.fallen && !wasFallen) fire(t, 'fall', `คน #${t.id} ล้ม/นอนนิ่ง ${S.fallSec} วิ+ · มุมลำตัว ${Math.round(a.angle)}°${t.sudden ? ' · สะโพกตกเร็ว' : ''}`, now, true);
    // PPE (skip while lying down — the geometry is unreliable)
    const checks = [['nohat', S.needHat, a.hat.visible, t.hatE < 0.5, `คน #${t.id} ไม่สวมหมวกนิรภัย (สีหมวก ${Math.round(a.hat.ratio * 100)}%)`],
      ['novest', S.needVest, a.vest.visible, t.vestE < 0.5, `คน #${t.id} ไม่สวมเสื้อสะท้อนแสง (สีสะท้อนแสง ${Math.round(a.vest.ratio * 100)}%)`]];
    for (const [k, need, vis, missing, msg] of checks) {
      if (need && vis && missing && !down) {
        t.viol[k] ??= now;
        if (now - t.viol[k] >= S.holdSec * 1000) fire(t, k, msg, now);
      } else if (vis || !need) t.viol[k] = null;
    }
  }
  tracks = tracks.filter(t => now - t.seen < 1500);
}

function fire(t, kind, msg, now, force = false) {
  if (!force && t.last[kind] && now - t.last[kind] < S.cooldown * 1000) return;
  t.last[kind] = now;
  const label = { fall: '🚨 คนล้ม', nohat: '⛑ ไม่สวมหมวก', novest: '🦺 ไม่สวมเสื้อสะท้อนแสง' }[kind];
  alarm(`${label}<br><small style="font-size:.6em;font-weight:400">${msg}</small>`, kind);
  beep(kind);
  const snap = document.createElement('canvas'); const sc = Math.min(1, 640 / cv.width);
  snap.width = cv.width * sc; snap.height = cv.height * sc;
  snap.getContext('2d').drawImage(cv, 0, 0, snap.width, snap.height);
  events.unshift({ at: new Date(), kind, label, person: t.id, msg, img: snap.toDataURL('image/jpeg', 0.75) });
  if (events.length > 300) events.length = 300;
  renderLog();
}

// ---------- drawing ----------
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
function draw(sw, sh) {
  const W = cv.width, H = cv.height, k = W / sw;
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
  const X = x => mirror ? W - x * k : x * k, Y = y => y * k;
  const lw = Math.max(2, W / 400);
  for (const t of tracks) {
    if (!t.lm || !t.a) continue;
    const a = t.a, lm = t.lm;
    const bad = (S.needHat && a.hat.visible && t.hatE < 0.5) || (S.needVest && a.vest.visible && t.vestE < 0.5);
    const col = t.fallen ? '#ff7ad9' : t.down ? '#ffc845' : bad ? '#ff4d6d' : '#3dff9a';
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [i, j] of BONES) {
      if ((lm[i].visibility ?? 1) < 0.4 || (lm[j].visibility ?? 1) < 0.4) continue;
      ctx.moveTo(X(lm[i].x * sw), Y(lm[i].y * sh)); ctx.lineTo(X(lm[j].x * sw), Y(lm[j].y * sh));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (S.debug) for (const g of [a.hat, a.vest]) for (const [x, y, hit] of g.pts) {
      ctx.fillStyle = hit ? (HAT[hit]?.c || '#c8ff00') : 'rgba(255,255,255,.35)';
      ctx.fillRect(X(x) - lw, Y(y) - lw, lw * 2, lw * 2);
    }
    if (a.box) {
      const x0 = Math.min(X(a.box.x0), X(a.box.x1)), x1 = Math.max(X(a.box.x0), X(a.box.x1));
      const y0 = Y(a.box.y0) - 0.12 * (Y(a.box.y1) - Y(a.box.y0)), y1 = Y(a.box.y1);
      ctx.setLineDash([lw * 4, lw * 3]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
      const fs = Math.max(13, W / 55);
      ctx.font = `600 ${fs}px Sarabun, sans-serif`;
      const txt = `#${t.id} ${S.needHat ? (a.hat.visible ? (t.hatE >= 0.5 ? '⛑✓' : '⛑✗') : '⛑?') : ''} ${S.needVest ? (a.vest.visible ? (t.vestE >= 0.5 ? '🦺✓' : '🦺✗') : '🦺?') : ''} ${t.fallen ? 'ล้ม!' : t.down ? 'นอน' : ''}`;
      const tw = ctx.measureText(txt).width + 12;
      ctx.fillStyle = col; ctx.fillRect(x0, Math.max(0, y0 - fs - 8), tw, fs + 8);
      ctx.fillStyle = '#001018'; ctx.fillText(txt, x0 + 6, Math.max(fs, y0 - 6));
    }
  }
}

function renderPeople() {
  const now = performance.now();
  $('#hudN').textContent = `คน ${tracks.length}`;
  $('#people').innerHTML = tracks.map(t => {
    const a = t.a; if (!a) return '';
    const hatTxt = !S.needHat ? '<span class="unk">ไม่บังคับ</span>' : !a.hat.visible ? '<span class="unk">ไม่เห็นศีรษะ</span>' : t.hatE >= 0.5 ? `<span class="ok">✓ ${HAT[a.hat.dom]?.th || ''}</span>` : '<span class="bad">✗ ไม่พบ</span>';
    const vestTxt = !S.needVest ? '<span class="unk">ไม่บังคับ</span>' : !a.vest.visible ? '<span class="unk">ไม่เห็นลำตัว</span>' : t.vestE >= 0.5 ? '<span class="ok">✓ พบ</span>' : '<span class="bad">✗ ไม่พบ</span>';
    const pos = t.fallen ? '<span class="pk">🚨 ล้ม!</span>' : t.down ? `<span style="color:var(--warn)">นอน/ก้ม ${((now - t.downSince) / 1000).toFixed(1)} วิ</span>` : '<span class="ok">ยืน/นั่ง</span>';
    const bad = (S.needHat && a.hat.visible && t.hatE < 0.5) || (S.needVest && a.vest.visible && t.vestE < 0.5);
    return `<div class="person ${t.fallen ? 'fall' : bad ? 'bad' : ''}"><b>คน #${t.id}</b>
      <div class="chk"><span>⛑ หมวก ${hatTxt}</span><span>${Math.round(a.hat.ratio * 100)}%</span></div>
      <div class="chk"><span>🦺 เสื้อ ${vestTxt}</span><span>${Math.round(a.vest.ratio * 100)}%</span></div>
      <div class="chk"><span>🧍 ${pos}</span><span>${Math.round(a.angle)}°</span></div></div>`;
  }).join('');
}

// ---------- log + downloads ----------
const fmt = d => d.toLocaleString('th-TH', { hour12: false });
const p2 = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
function renderLog() {
  $('#logN').textContent = events.length;
  $('#log').innerHTML = events.length ? events.map((e, i) => `<div class="ev ${e.kind}"><img src="${e.img}" data-i="${i}" alt=""><div><div class="t">${fmt(e.at)}</div><div class="w">${e.label}</div><div>${e.msg}</div></div></div>`).join('')
    : '<div class="empty">ยังไม่มีเหตุการณ์</div>';
  $$('#log img').forEach(im => im.onclick = () => {
    const d = document.createElement('dialog'); d.className = 'zoom';
    d.innerHTML = `<img src="${im.src}">`; d.onclick = () => d.remove(); document.body.appendChild(d); d.showModal();
  });
}
renderLog();
function csv() {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  return '﻿' + [['เวลา', 'เหตุการณ์', 'คน', 'รายละเอียด', 'ไฟล์รูป'].join(','),
    ...events.slice().reverse().map((e, i) => [fmt(e.at), e.label.replace(/^\S+ /, ''), '#' + e.person, e.msg, `${String(i + 1).padStart(3, '0')}_${e.kind}_${stamp(e.at)}.jpg`].map(q).join(','))].join('\r\n');
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#dlCsv').onclick = () => events.length ? download(new Blob([csv()], { type: 'text/csv' }), `safety_${stamp(new Date())}.csv`) : toast('ยังไม่มีเหตุการณ์');
$('#dlZip').onclick = () => {
  if (!events.length) return toast('ยังไม่มีเหตุการณ์');
  const files = events.slice().reverse().map((e, i) => [`${String(i + 1).padStart(3, '0')}_${e.kind}_${stamp(e.at)}.jpg`, b64(e.img.split(',')[1])]);
  files.push(['events.csv', new TextEncoder().encode(csv())]);
  download(zip(files), `safety_${stamp(new Date())}.zip`);
};
$('#clearLog').onclick = () => { if (events.length && confirm('ล้างบันทึกเหตุการณ์ทั้งหมด?')) { events.length = 0; renderLog(); } };
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// minimal "stored" (no compression) ZIP writer — JPEGs are already compressed
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = ~0; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  const enc = new TextEncoder();
  for (const [name, data] of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(h, nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(c, nb);
    off += 30 + nb.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e], { type: 'application/zip' });
}

// ---------- main loop ----------
function fitStage() {
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  $('#stage').style.aspectRatio = `${vw} / ${vh}`;
  const maxH = innerWidth > 1000 ? innerHeight - 190 : innerHeight * 0.62;
  $('#stage').style.maxWidth = Math.max(240, maxH * vw / vh) + 'px';
}
addEventListener('resize', fitStage);

function loop() {
  requestAnimationFrame(loop);
  if (!pose || !video.videoWidth || paused) return;
  if (video.currentTime === lastVT && !video.srcObject) return;
  lastVT = video.currentTime;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (cv.width !== Math.min(vw, 1280)) { cv.width = Math.min(vw, 1280); cv.height = Math.round(cv.width * vh / vw); fitStage(); }
  const sw = 320, sh = Math.round(320 * vh / vw);
  if (smp.width !== sw || smp.height !== sh) { smp.width = sw; smp.height = sh; }
  sctx.drawImage(video, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh).data;
  const now = performance.now();
  let res;
  try { res = pose.detectForVideo(video, now); } catch (e) { console.warn(e); return; }
  update(res.landmarks || [], img, sw, sh, now);
  draw(sw, sh);
  if (now - lastT > 0) fps = fps * 0.9 + 100 / (now - lastT); lastT = now;
  if (Math.round(now / 250) !== Math.round((now - 16) / 250)) { renderPeople(); $('#hudFps').textContent = fps.toFixed(0) + ' fps'; }
}

async function startCam() {
  video.removeAttribute('src'); video.loop = false;
  const r = await camera(video, { facing, w: 1280, h: 720 });
  mirror = r.mirror; tracks = []; fitStage();
}
$('#btnFlip').onclick = async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  try { await startCam(); } catch (e) { toast('สลับกล้องไม่ได้: ' + e.message); }
};
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  video.srcObject?.getTracks().forEach(t => t.stop()); video.srcObject = null;
  video.src = URL.createObjectURL(f); video.loop = true; mirror = false; tracks = [];
  video.play().then(fitStage).catch(err => toast('เล่นไฟล์ไม่ได้: ' + err.message));
  $('#btnFlip').textContent = '📷 กลับไปใช้กล้อง';
  $('#btnFlip').onclick = async () => { await startCam(); $('#btnFlip').textContent = '⟲ สลับกล้อง'; location.reload(); };
};
$('#btnPause').onclick = e => { paused = !paused; e.currentTarget.textContent = paused ? '▶ ทำงานต่อ' : '⏸ หยุด'; paused ? video.pause() : video.play(); };
const muteBtn = () => { $('#btnMute').textContent = S.sound ? '🔊 เสียง' : '🔇 ปิดเสียง'; $('#btnMute').classList.toggle('on', S.sound); };
$('#btnMute').onclick = () => { S.sound = !S.sound; save(); muteBtn(); renderSettings(); audio?.resume(); };
muteBtn();

await gate({
  title: 'SAFETY//CAM',
  lines: ['ตรวจ ⛑ หมวกนิรภัย และ 🦺 เสื้อสะท้อนแสง จากสีบริเวณศีรษะ/ลำตัว (สูงสุด 4 คนพร้อมกัน)',
    'ตรวจจับ 🚨 คนล้ม — ลำตัวเอียงเกือบแนวนอนค้างนานเกิน 2 วินาที',
    'มีเสียงเตือน + บันทึกเหตุการณ์พร้อมรูป ดาวน์โหลดเป็น CSV/ZIP ได้',
    'ตั้งกล้องให้เห็นทั้งตัว ระดับสูงกว่าศีรษะเล็กน้อย แสงสว่างพอ',
    'ประมวลผลในเครื่อง ไม่ส่งภาพออก · เป็นระบบช่วยเตือน ไม่ใช่ระบบความปลอดภัยหลัก'],
  needs: ['camera'],
  button: '▶ เปิดกล้องและเริ่มตรวจ',
  onStart: async () => {
    audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    await startCam();
    $('#stat').textContent = 'กำลังโหลดโมเดล…';
    pose = await vision('PoseLandmarker', {
      baseOptions: { modelAssetPath: MODELS.poseLite }, runningMode: 'VIDEO', numPoses: 4,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    $('#stat').textContent = 'POSE LITE · 4 คน';
  },
});
wakeLock();
loop();
window.__safety = { get tracks() { return tracks; }, events, S };
