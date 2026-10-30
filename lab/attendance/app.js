// FACE//TIME — face attendance with face-api (128-d descriptors), simple liveness, PHP JSON storage on LAN
import { bar, gate, camera, store, toast, onLan, $, $$, sleep } from '../common/lab.js';
import * as faceapi from 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';

bar('FACE//TIME', 'ลงเวลาเข้า-ออกงานด้วยใบหน้า · ประมวลผลในเครื่อง', `<span class="badge" id="storeBadge">…</span>`);

const S = { thr: 0.5, cooldown: 60, liveness: true, sound: true, mode: 'auto', ...store.get('att.cfg', {}) };
const saveS = () => store.set('att.cfg', S);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date().toLocaleDateString('sv-SE');
const hm = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------- storage: PHP on LAN, localStorage otherwise ----------
async function api(a, body, qs = '') {
  const r = await fetch(`api.php?a=${a}${qs}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  let j; try { j = await r.json(); } catch { throw new Error('เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (' + r.status + ')'); }
  if (!r.ok || j.error) throw new Error(j.error || r.status);
  return j;
}
const LS = {
  list: () => store.get('att.emps', []),
  logs: d => store.get('att.logs.' + d, []),
};
const db = {
  php: false,
  async init() {
    if (onLan()) { try { await api('ping'); this.php = true; } catch (e) { console.warn('api unavailable', e); } }
    $('#storeBadge').textContent = this.php ? 'XAMPP' : 'LOCAL';
    $('#storeInfo').innerHTML = this.php
      ? 'เก็บที่เซิร์ฟเวอร์ XAMPP เครื่องนี้: <span class="mono">lab/attendance/data/</span> (ไฟล์ JSON, เปิดตรงจากเว็บไม่ได้, API รับเฉพาะในวง LAN) — ไม่เก็บรูปภาพ เก็บเฉพาะตัวเลขใบหน้า 128 ค่า'
      : '⚠ เก็บใน localStorage ของเบราว์เซอร์นี้เท่านั้น (ไม่ได้เปิดผ่าน XAMPP หรือ API ใช้ไม่ได้) — ล้างข้อมูลเบราว์เซอร์แล้วจะหาย · แนะนำเปิดที่ http://localhost/ksd/lab/attendance/';
  },
  async list() { return this.php ? (await api('list')).employees : LS.list(); },
  async enrol(e) {
    if (this.php) return api('enrol', e);
    const emps = LS.list().filter(x => x.id !== e.id);
    const now = new Date().toISOString();
    emps.push({ id: e.id, name: e.name, dept: e.dept, desc: e.desc, samples: e.samples, consent_at: now, created: now, updated: now });
    store.set('att.emps', emps); return { ok: true };
  },
  async remove(id, logs) {
    if (this.php) return api('delete', { id, logs });
    store.set('att.emps', LS.list().filter(x => x.id !== id));
    if (logs) for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('lab.att.logs.')) { const d = k.slice(13); store.set('att.logs.' + d, LS.logs(d).filter(r => r.id !== id)); }
    }
    return { ok: true };
  },
  async log(emp, type, dist, live) {
    if (this.php) return (await api('log', { id: emp.id, type, dist, live })).row;
    const row = { id: emp.id, name: emp.name, dept: emp.dept, type, at: new Date().toISOString(), dist: +dist.toFixed(3), live };
    store.set('att.logs.' + today(), [...LS.logs(today()), row]); return row;
  },
  async logs(d) { return this.php ? (await api('logs', null, '&date=' + d)).rows : LS.logs(d); },
};

// ---------- state ----------
const video = $('#video'), cv = $('#cv'), ctx = cv.getContext('2d');
let emps = [], rows = [], rowsDate = today();
let state = 'idle', cand = null, chal = null, resultUntil = 0, frame = 0;
let enrolSamples = [], enrolDesc = null, lastSampleAt = 0, enrolStart = 0;
let audio, opts, ready = false;

const dist = (a, b) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
function best(desc) {
  let m = null, md = Infinity;
  for (const e of emps) { const d = dist(desc, e.desc); if (d < md) { md = d; m = e; } }
  return m ? { emp: m, d: md } : null;
}
const prompt = (html, cls = '') => { const p = $('#prompt'); if (p.innerHTML !== html) p.innerHTML = html; p.className = cls; };

function tone(ok) {
  if (!S.sound || !audio) return;
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.connect(g); g.connect(audio.destination); o.type = 'sine';
  if (ok) { o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.12); } else o.frequency.setValueAtTime(220, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.start(t); o.stop(t + 0.4);
}

// ---------- liveness helpers (68-point landmarks) ----------
const P = (pts, i) => pts[i];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function ear(pts) {
  const e = o => (d2(P(pts, o + 1), P(pts, o + 5)) + d2(P(pts, o + 2), P(pts, o + 4))) / (2 * d2(P(pts, o), P(pts, o + 3)));
  return (e(36) + e(42)) / 2;
}
const yaw = pts => (pts[30].x - pts[0].x) / ((pts[16].x - pts[0].x) || 1); // ~0.5 frontal

function startChallenge(m) {
  const kind = Math.random() < 0.5 ? 'blink' : 'turn';
  chal = { kind, emp: m.emp, start: performance.now(), lastSeen: performance.now(), phase: 0, ears: [], base: 0 };
  state = 'challenge';
}
function failChallenge(msg) {
  state = 'result'; chal = null; cand = null; resultUntil = performance.now() + 2500;
  showResult(`<div class="card err"><div class="n">✗ ${msg}</div><div class="s">ลองใหม่อีกครั้ง</div></div>`);
  tone(false);
}

// ---------- main detection loop ----------
async function loop() {
  for (;;) {
    if (!ready || !video.videoWidth) { await sleep(150); continue; }
    const t0 = performance.now();
    frame++;
    const wantDesc = state === 'enrol' || state === 'idle' || (state === 'challenge' && (chal.phase === 2 || frame % 4 === 0));
    let det;
    try {
      const q = faceapi.detectSingleFace(video, opts).withFaceLandmarks();
      det = wantDesc ? await q.withFaceDescriptor() : await q;
    } catch (e) { console.warn(e); await sleep(300); continue; }
    try { handle(det, performance.now()); } catch (e) { console.error(e); }
    draw(det);
    await sleep(Math.max(0, (state === 'challenge' ? 20 : 90) - (performance.now() - t0)));
  }
}

function handle(det, now) {
  if (state === 'result') {
    if (now < resultUntil) return;
    state = 'idle'; $('#result').hidden = true; cand = null;
  }
  if (state === 'enrol') return enrolStep(det, now);
  if (state === 'challenge') return challengeStep(det, now);
  // idle
  if (!emps.length) return prompt('ยังไม่มีพนักงานในระบบ — ไปที่แท็บ <b>ลงทะเบียน</b>');
  if (!det) { cand = null; return prompt('🙂 มองกล้องเพื่อลงเวลา'); }
  const box = det.detection.box;
  if (box.width < video.videoWidth * 0.12) { cand = null; return prompt('เข้ามาใกล้กล้องอีกนิด'); }
  if (!det.descriptor) return;
  const m = best(det.descriptor);
  if (!m || m.d >= S.thr) { cand = null; return prompt(`ไม่รู้จักใบหน้านี้ <span class="note mono">(${m ? m.d.toFixed(2) : '-'})</span>`); }
  cand = cand?.id === m.emp.id ? { ...cand, n: cand.n + 1 } : { id: m.emp.id, n: 1 };
  prompt(`กำลังยืนยัน <b>${esc(m.emp.name)}</b>…`);
  if (cand.n < 3) return;
  const last = rows.filter(r => r.id === m.emp.id).at(-1);
  if (last && Date.now() - new Date(last.at).getTime() < S.cooldown * 1000) {
    state = 'result'; resultUntil = now + 2500;
    showResult(`<div class="card ${last.type === 'out' ? 'out' : ''}"><div class="n">${esc(m.emp.name)}</div><div class="k">ลง${last.type === 'in' ? 'เข้า' : 'ออก'}งานไปแล้วเมื่อ ${hm(last.at)}</div><div class="s">กันลงซ้ำภายใน ${S.cooldown} วินาที</div></div>`);
    return;
  }
  if (S.liveness) startChallenge(m); else commit(m.emp, m.d, false);
}

function challengeStep(det, now) {
  const c = chal, left = 7000 - (now - c.start);
  if (left <= 0) return failChallenge('หมดเวลาตรวจคนจริง');
  if (!det) { if (now - c.lastSeen > 1500) failChallenge('ไม่พบใบหน้าระหว่างตรวจ'); return; }
  c.lastSeen = now;
  const pts = det.landmarks.positions;
  const pct = Math.max(0, left / 7000 * 100);
  const name = `<b>${esc(c.emp.name)}</b> — `;
  if (c.phase === 2) {          // final identity check on a frontal frame
    if (!det.descriptor) return;
    const d = dist(det.descriptor, c.emp.desc);
    if (d < S.thr) return commit(c.emp, d, true);
    return failChallenge('ใบหน้าไม่ตรงกับตอนเริ่ม');
  }
  if (c.kind === 'blink') {
    const e = ear(pts);
    if (c.phase === 0) {
      c.ears.push(e);
      if (c.ears.length >= 4) { c.base = c.ears.slice().sort((a, b) => a - b)[Math.floor(c.ears.length / 2)]; c.phase = 0.5; }
    } else if (c.phase === 0.5 && e < c.base * 0.72) c.phase = 1;
    else if (c.phase === 1 && e > c.base * 0.88) c.phase = 2;
    prompt(`${name}👁 <b>หลับตาแล้วลืมตา</b> 1 ครั้ง${c.phase === 1 ? ' ✓ ลืมตาได้' : ''}<div class="bar" style="width:${pct}%"></div>`, 'chal');
  } else {
    const y = yaw(pts);
    if (c.phase === 0 && Math.abs(y - 0.5) > 0.14) c.phase = 1;
    else if (c.phase === 1 && Math.abs(y - 0.5) < 0.08) c.phase = 2;
    prompt(`${name}${c.phase === 0 ? '↔ <b>หันหน้าไปด้านข้าง</b> (ซ้ายหรือขวา)' : '✓ ดีมาก <b>หันกลับมามองตรง</b>'}<div class="bar" style="width:${pct}%"></div>`, 'chal');
  }
}

async function commit(emp, d, live) {
  state = 'result'; resultUntil = performance.now() + 60000; chal = null; cand = null;
  const mine = rows.filter(r => r.id === emp.id);
  const type = S.mode === 'auto' ? (mine.at(-1)?.type === 'in' ? 'out' : 'in') : S.mode;
  prompt('');
  try {
    const row = await db.log(emp, type, d, live);
    rows.push(row); renderToday();
    showResult(`<div class="card ${type}"><div class="t">${hm(row.at)}</div><div class="n">${esc(emp.name)}</div>
      <div class="k ${type}">${type === 'in' ? '✓ ลงเวลาเข้างาน' : '✓ ลงเวลาออกงาน'}</div><div class="s">${esc(emp.dept || '')} · รหัส ${esc(emp.id)} · ความต่าง ${d.toFixed(2)}${live ? ' · ผ่านตรวจคนจริง' : ''}</div></div>`);
    tone(true);
  } catch (e) {
    showResult(`<div class="card err"><div class="n">บันทึกไม่สำเร็จ</div><div class="s">${esc(e.message)}</div></div>`); tone(false);
  }
  resultUntil = performance.now() + 3200;
}
function fitStage() {
  const W = video.videoWidth || 4, H = video.videoHeight || 3;
  $('#stage').style.aspectRatio = `${W} / ${H}`;
  const maxH = innerWidth > 1000 ? innerHeight - 150 : innerHeight * 0.6;
  $('#stage').style.maxWidth = Math.max(240, maxH * W / H) + 'px';
}
addEventListener('resize', fitStage);
function showResult(html) { prompt(''); $('#result').innerHTML = html; $('#result').hidden = false; }

function draw(det) {
  const W = video.videoWidth, H = video.videoHeight;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; fitStage(); }
  ctx.clearRect(0, 0, W, H);
  if (!det) return;
  const b = det.detection.box, x = W - b.x - b.width; // mirrored display
  const col = state === 'challenge' ? '#ffc845' : state === 'enrol' ? '#3ce7ff' : cand ? '#3dff9a' : '#ff4d6d';
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, W / 320);
  const k = b.width * 0.22;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, b.y, 1, 1], [x + b.width, b.y, -1, 1], [x, b.y + b.height, 1, -1], [x + b.width, b.y + b.height, -1, -1]]) {
    ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k);
  }
  ctx.stroke();
  if (state === 'challenge') {
    ctx.fillStyle = col;
    for (const i of [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 30]) { const p = det.landmarks.positions[i]; ctx.fillRect(W - p.x - 2, p.y - 2, 4, 4); }
  }
}

// ---------- enrolment ----------
function enrolStep(det, now) {
  if (now - enrolStart > 20000) { state = 'idle'; prompt(''); $('#enrolMsg').textContent = 'หมดเวลา ไม่พบใบหน้าชัดพอ — ลองใหม่'; return; }
  prompt(`📸 เก็บภาพ ${enrolSamples.length}/5 — มองกล้อง แล้วขยับหน้าเล็กน้อย`);
  if (!det?.descriptor || det.detection.score < 0.6 || det.detection.box.width < video.videoWidth * 0.15 || now - lastSampleAt < 450) return;
  lastSampleAt = now;
  enrolSamples.push(det.descriptor);
  const b = det.detection.box, c = document.createElement('canvas'); c.width = c.height = 96;
  const cx = c.getContext('2d'); cx.translate(96, 0); cx.scale(-1, 1);
  cx.drawImage(video, b.x - b.width * 0.15, b.y - b.height * 0.15, b.width * 1.3, b.height * 1.3, 0, 0, 96, 96);
  $('#samples').appendChild(c); // shown only on this screen, never stored
  if (enrolSamples.length >= 5) finishEnrol();
}
function finishEnrol() {
  state = 'idle'; prompt('');
  const mean = new Float32Array(128);
  for (const s of enrolSamples) for (let i = 0; i < 128; i++) mean[i] += s[i] / enrolSamples.length;
  const spread = Math.max(...enrolSamples.map(s => dist(s, mean)));
  enrolDesc = mean;
  $('#btnSave').disabled = false;
  $('#enrolMsg').innerHTML = spread > 0.4
    ? `<span style="color:var(--warn)">⚠ ภาพแต่ละภาพต่างกันมาก (${spread.toFixed(2)}) — อาจมีคนอื่นเข้าเฟรม แนะนำเก็บใหม่</span>`
    : `✓ เก็บครบ ${enrolSamples.length} ภาพ (ความสม่ำเสมอ ${spread.toFixed(2)}) — กดบันทึก`;
}
function enrolFields() {
  const id = $('#eId').value.trim(), name = $('#eName').value.trim(), dept = $('#eDept').value.trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) { toast('รหัสพนักงานใช้ได้เฉพาะ A-Z 0-9 - _'); return null; }
  if (!name) { toast('กรุณาใส่ชื่อ-สกุล'); return null; }
  if (!$('#eConsent').checked) { toast('ต้องติ๊กยินยอม (PDPA) ก่อนเก็บข้อมูลใบหน้า'); return null; }
  return { id, name, dept };
}
$('#btnCapture').onclick = () => {
  if (!ready) return toast('กำลังโหลดโมเดล…');
  if (!enrolFields()) return;
  enrolSamples = []; enrolDesc = null; $('#samples').innerHTML = ''; $('#btnSave').disabled = true;
  $('#result').hidden = true; chal = null; cand = null;
  state = 'enrol'; enrolStart = performance.now(); lastSampleAt = 0;
  $('#enrolMsg').textContent = 'กำลังเก็บภาพ…';
};
$('#enrolForm').onsubmit = async e => {
  e.preventDefault();
  const f = enrolFields(); if (!f || !enrolDesc) return;
  const dup = emps.filter(x => x.id !== f.id).map(x => ({ x, d: dist(enrolDesc, x.desc) })).sort((a, b) => a.d - b.d)[0];
  if (dup && dup.d < S.thr && !confirm(`ใบหน้านี้คล้ายกับ "${dup.x.name}" (${dup.x.id}) ความต่าง ${dup.d.toFixed(2)}\nอาจเป็นคนเดียวกัน — ยืนยันลงทะเบียนต่อ?`)) return;
  if (emps.some(x => x.id === f.id) && !confirm(`รหัส ${f.id} มีอยู่แล้ว — เขียนทับข้อมูลใบหน้าเดิม?`)) return;
  try {
    await db.enrol({ ...f, desc: Array.from(enrolDesc, v => +v.toFixed(6)), samples: enrolSamples.length, consent: true });
    toast(`✓ ลงทะเบียน ${f.name} แล้ว`);
    $('#enrolForm').reset(); $('#samples').innerHTML = ''; $('#btnSave').disabled = true; enrolDesc = null; enrolSamples = [];
    $('#enrolMsg').textContent = 'บันทึกแล้ว — ลงทะเบียนคนต่อไปได้';
    await loadEmps();
  } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 5000); }
};

// ---------- lists ----------
async function loadEmps() {
  try { emps = (await db.list()).map(e => ({ ...e, desc: Float32Array.from(e.desc) })); } catch (e) { toast('โหลดรายชื่อไม่ได้: ' + e.message); }
  $('#depts').innerHTML = [...new Set(emps.map(e => e.dept).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('');
  renderEmps(); renderToday();
}
async function loadRows() {
  rowsDate = today();
  try { rows = await db.logs(rowsDate); } catch (e) { console.warn(e); }
  renderToday();
}
function summary(list) {
  const m = new Map();
  for (const r of list) {
    const s = m.get(r.id) || { id: r.id, name: r.name, dept: r.dept, in: null, out: null, last: null, n: 0 };
    if (r.type === 'in' && !s.in) s.in = r.at;
    if (r.type === 'out') s.out = r.at;
    s.last = r; s.n++; m.set(r.id, s);
  }
  return [...m.values()];
}
function renderToday() {
  const sm = summary(rows);
  $('#nIn').textContent = sm.filter(s => s.last.type === 'in').length;
  $('#nOut').textContent = sm.filter(s => s.last.type === 'out').length;
  $('#nAll').textContent = emps.length;
  $('#todayList').innerHTML = rows.length ? `<div class="list">${rows.slice().reverse().map(r => `<div class="it"><span class="n"><b>${esc(r.name)}</b><small>${esc(r.id)}${r.dept ? ' · ' + esc(r.dept) : ''}</small></span>
    <span class="tm"><span class="${r.type}">${r.type === 'in' ? '▶ เข้า' : '◀ ออก'}</span><br>${hm(r.at)}</span></div>`).join('')}</div>` : '<div class="empty">ยังไม่มีการลงเวลาวันนี้</div>';
}
function renderEmps() {
  const q = $('#empQ').value.trim().toLowerCase();
  const list = emps.filter(e => !q || `${e.id} ${e.name} ${e.dept}`.toLowerCase().includes(q));
  $('#empN').textContent = `${list.length}/${emps.length} คน`;
  $('#empList').innerHTML = list.length ? list.map(e => `<div class="emp" data-id="${esc(e.id)}"><span><b>${esc(e.name)}</b><small>${esc(e.id)}${e.dept ? ' · ' + esc(e.dept) : ''} · ${e.samples} ภาพ · ยินยอม ${new Date(e.consent_at).toLocaleDateString('th-TH')}</small></span>
    <button class="btn danger" data-del>ลบ</button></div>`).join('') : '<div class="empty">ไม่มีพนักงาน</div>';
  $$('#empList [data-del]').forEach(b => b.onclick = () => {
    const row = b.closest('.emp'); if (row.querySelector('.del')) return;
    const id = row.dataset.id, e = emps.find(x => x.id === id);
    row.insertAdjacentHTML('beforeend', `<div class="del">ลบข้อมูลใบหน้าของ <b>${esc(e.name)}</b>? <label><input type="checkbox" data-logs> ลบประวัติลงเวลาด้วย</label>
      <button class="btn danger" data-yes>ยืนยันลบ</button><button class="btn" data-no>ยกเลิก</button></div>`);
    row.querySelector('[data-no]').onclick = () => row.querySelector('.del').remove();
    row.querySelector('[data-yes]').onclick = async () => {
      try {
        await db.remove(id, row.querySelector('[data-logs]').checked);
        toast(`ลบข้อมูลใบหน้าของ ${e.name} แล้ว`); await loadEmps(); await loadRows();
      } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message); }
    };
  });
}
$('#empQ').oninput = renderEmps;

// report
let repRows = [];
async function renderReport() {
  const d = $('#rDate').value || today();
  try { repRows = await db.logs(d); } catch (e) { repRows = []; toast(e.message); }
  const sm = summary(repRows);
  const hrs = s => s.in && s.out && s.out > s.in ? ((new Date(s.out) - new Date(s.in)) / 3600000).toFixed(2) : '';
  $('#report').innerHTML = sm.length ? `<table><tr><th>รหัส / ชื่อ</th><th>เข้า</th><th>ออก</th><th>ชม.</th></tr>${sm.map(s => `<tr><td>${esc(s.name)}<br><small class="note">${esc(s.id)}${s.dept ? ' · ' + esc(s.dept) : ''}</small></td>
    <td class="m in">${s.in ? hm(s.in).slice(0, 5) : '—'}</td><td class="m out">${s.out ? hm(s.out).slice(0, 5) : '—'}</td><td class="m">${hrs(s)}</td></tr>`).join('')}</table>
    <p class="note">${repRows.length} รายการ · ${sm.length} คน</p>` : '<div class="empty">ไม่มีข้อมูลวันนี้</div>';
  report.hrs = hrs; report.sm = sm;
}
const report = {};
$('#rDate').value = today();
$('#rDate').onchange = renderReport;
const dl = (text, name) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
};
const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
$('#rCsv').onclick = () => {
  if (!report.sm?.length) return toast('ไม่มีข้อมูล');
  dl([['วันที่', 'รหัส', 'ชื่อ', 'แผนก', 'เข้างาน', 'ออกงาน', 'ชั่วโมง', 'จำนวนครั้ง'].join(','),
    ...report.sm.map(s => [$('#rDate').value, s.id, s.name, s.dept, s.in ? hm(s.in) : '', s.out ? hm(s.out) : '', report.hrs(s), s.n].map(q).join(','))].join('\r\n'), `attendance_${$('#rDate').value}.csv`);
};
$('#rCsvRaw').onclick = () => {
  if (!repRows.length) return toast('ไม่มีข้อมูล');
  dl([['วันที่', 'เวลา', 'รหัส', 'ชื่อ', 'แผนก', 'ประเภท', 'ความต่าง', 'ตรวจคนจริง'].join(','),
    ...repRows.map(r => [$('#rDate').value, hm(r.at), r.id, r.name, r.dept, r.type === 'in' ? 'เข้า' : 'ออก', r.dist, r.live ? 'ผ่าน' : '-'].map(q).join(','))].join('\r\n'), `attendance_${$('#rDate').value}_all.csv`);
};

// tabs
$$('[data-tab]').forEach(b => b.onclick = () => {
  $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
  $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  if (state === 'enrol' && b.dataset.tab !== 'enrol') { state = 'idle'; prompt(''); }
  if (b.dataset.tab === 'report') renderReport();
});
// mode
const setMode = m => { S.mode = m; saveS(); $$('#mode [data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === m)); };
$$('#mode [data-m]').forEach(b => b.onclick = () => setMode(b.dataset.m));
setMode(S.mode);
// settings
const bindRange = (el, out, k, f) => { el.value = S[k]; out.textContent = f(S[k]); el.oninput = () => { S[k] = +el.value; out.textContent = f(S[k]); saveS(); }; };
bindRange($('#sThr'), $('#oThr'), 'thr', v => v.toFixed(2));
bindRange($('#sCool'), $('#oCool'), 'cooldown', v => v + ' วิ');
for (const [id, k] of [['#sLive', 'liveness'], ['#sSound', 'sound']]) { $(id).checked = S[k]; $(id).onchange = () => { S[k] = $(id).checked; saveS(); }; }
// clock + day rollover
setInterval(() => {
  $('#clock').textContent = new Date().toLocaleTimeString('en-GB');
  if (rowsDate !== today()) loadRows();
}, 1000);
setInterval(() => { if (state === 'idle') loadRows(); }, 60000);

// ---------- start ----------
await db.init();
loadEmps(); loadRows();
await gate({
  title: 'FACE//TIME',
  lines: ['สแกนใบหน้าเพื่อลงเวลาเข้า-ออกงาน (อัตโนมัติสลับ เข้า/ออก)',
    'ตรวจว่าเป็นคนจริงด้วยการกะพริบตาหรือหันหน้า เพื่อกันใช้รูปถ่าย',
    'เก็บเฉพาะ "ตัวเลขลักษณะใบหน้า" 128 ค่า ไม่เก็บรูปภาพ · ต้องได้รับความยินยอมก่อนลงทะเบียน (PDPA)',
    db.php ? 'ข้อมูลเก็บที่เครื่อง XAMPP นี้ (lab/attendance/data/)' : '⚠ ไม่ได้เปิดผ่าน XAMPP — ข้อมูลจะเก็บในเบราว์เซอร์นี้เท่านั้น',
    'ครั้งแรกต้องดาวน์โหลดโมเดล AI ~7 MB'],
  needs: ['camera'],
  button: '▶ เปิดกล้อง',
  onStart: async () => {
    audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    await camera(video, { facing: 'user', w: 640, h: 480 });
  },
});
prompt('กำลังโหลดโมเดลจดจำใบหน้า…');
try {
  await faceapi.tf.setBackend('webgl').catch(() => faceapi.tf.setBackend('cpu'));
  await faceapi.tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  ready = true; prompt('');
} catch (e) {
  console.error(e); prompt('โหลดโมเดลไม่สำเร็จ: ' + esc(e.message));
}
loop();
window.__att = { S, db, get emps() { return emps; }, get rows() { return rows; }, get state() { return state; } };
