// SONAR — plays an ultrasonic chirp loop and listens to its echoes (see dsp.js)
import { bar, gate, mic, toast, wakeLock, store, $, $$ } from '../common/lab.js';
import { Sonar, Tracker, Breath } from './dsp.js';

bar('SONAR', 'โซนาร์อัลตราโซนิก · ใช้ลำโพง+ไมค์ของเครื่องนี้');

// AudioWorklet: TX and RX share one sample counter, so every RX frame is aligned to the chirp period
const WORKLET = `
class SonarIO extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.tx = o.processorOptions.tx; this.N = this.tx.length;
    this.rx = new Float32Array(this.N); this.i = 0; this.g = 0; this.target = 0;
    this.port.onmessage = e => { this.target = e.data.gain; };
  }
  process(inputs, outputs) {
    const inp = inputs[0][0], out = outputs[0][0];
    for (let k = 0; k < out.length; k++) {
      this.g += (this.target - this.g) * 0.0005; // slow ramp → no pop
      out[k] = this.tx[this.i] * this.g;
      this.rx[this.i] = inp ? inp[k] : 0;
      if (++this.i === this.N) { this.port.postMessage(this.rx); this.rx = new Float32Array(this.N); this.i = 0; }
    }
    return true;
  }
}
registerProcessor('sonar-io', SonarIO);`;

let ctx, node, sonar, tracker, breath, fps, release;
let mode = 'watch', sens = +store.get('sonar.sens', 5.5), maxRange = +store.get('sonar.range', 4);
let readyAt = 0, live = [], lastSnr = null, armed = false, armT = null, alarmUntil = 0, presentSince = 0;
const hist = []; // waterfall rows
const logEl = $('#log');
function log(t, cls = '') {
  const d = document.createElement('div');
  d.textContent = `${new Date().toLocaleTimeString('en-GB')}  ${t}`;
  if (cls) d.style.color = `var(--${cls})`;
  logEl.prepend(d);
  while (logEl.children.length > 60) logEl.lastChild.remove();
}

async function start() {
  // iOS 16.4+: play and record at the same time through the loudspeaker
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {}
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  await ctx.resume();
  if (ctx.sampleRate < 44100) throw new Error(`sample rate ${ctx.sampleRate} Hz ต่ำเกินไปสำหรับคลื่น 21 kHz`);
  const { source } = await mic(ctx);
  sonar = new Sonar(ctx.sampleRate, { maxRange });
  fps = ctx.sampleRate / sonar.N;
  tracker = new Tracker(); breath = new Breath(sonar, fps, { r1: Math.min(1.6, maxRange - 0.1) });
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
  node = new AudioWorkletNode(ctx, 'sonar-io', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { tx: sonar.chirp.tx } });
  source.connect(node); node.connect(ctx.destination);
  node.port.onmessage = e => onFrame(e.data);
  node.port.postMessage({ gain: +$('#vol').value });
  release = await wakeLock();
  log(`เริ่มส่งคลื่น ${(sonar.chirp.f0 / 1000).toFixed(1)}–${(sonar.chirp.f1 / 1000).toFixed(1)} kHz · ${ctx.sampleRate} Hz`, 'c');
}

function recalibrate() {
  sonar.setRange(maxRange); sonar.reset();
  tracker = new Tracker(); breath = new Breath(sonar, fps, { r1: Math.min(1.6, maxRange - 0.1) });
  hist.length = 0; readyAt = 0; live = [];
  log('ปรับเทียบใหม่ — วางเครื่องนิ่งๆ');
}

// ---------- per chirp (~23 /s) ----------
let lastCount = 0, gestT = 0;
function onFrame(frame) {
  const out = sonar.process(frame);
  const t = performance.now() / 1000;
  if (!out.ready) { setState(`ปรับเทียบ… ${Math.round(out.progress * 100)}% (อย่าขยับเครื่อง)`, ''); return; }
  if (!readyAt) {
    readyAt = t;
    const q = sonar.direct / sonar.floor;
    $('#sig').textContent = `สัญญาณตรง ${q.toFixed(0)}×`;
    if (q < 6) { toast('ได้ยินเสียงสะท้อนน้อยมาก — ลำโพงอาจส่งคลื่นความถี่สูงไม่ได้ ลองเพิ่มความดังหรือใช้มือถือ', 6000); log('สัญญาณอ่อน: ลำโพง/ไมค์อาจตัดความถี่สูง', 'warn'); }
  }
  breath.push();
  lastSnr = out.snr;
  hist.unshift(out.snr); if (hist.length > 160) hist.pop();
  const warm = t - readyAt < 4; // noise floor still settling
  live = warm ? [] : tracker.update(sonar.targets(out.snr, sens), t);

  // presence / alarm
  if (warm) setState('กำลังเรียนรู้ห้อง… (ไม่ต้องขยับ)', '');
  else if (live.length) {
    if (!presentSince) { presentSince = t; log(`ตรวจพบการเคลื่อนไหวที่ ${live[0].r.toFixed(1)} ม.`, 'warn'); }
    if (mode === 'guard' && armed && t > alarmUntil) { alarmUntil = t + 5; alarm(live[0].r); }
    setState(t < alarmUntil ? `🚨 บุกรุก! ระยะ ${live[0].r.toFixed(1)} ม.` : `มีการเคลื่อนไหว ${live.length} จุด`, t < alarmUntil ? 'alarm' : 'move');
  } else {
    if (presentSince && t - presentSince > 1) log('ไม่มีการเคลื่อนไหวแล้ว');
    presentSince = 0;
    setState(mode === 'guard' ? (armed ? '🛡 เฝ้าระวังอยู่ — ห้องว่าง' : 'กด "กันขโมย" อีกครั้งเพื่อเริ่มเฝ้า') : 'ห้องนิ่ง ไม่มีการเคลื่อนไหว', '');
  }
  if (live.length !== lastCount) { lastCount = live.length; if (live.length > 1) log(`นับได้ ${live.length} จุดเคลื่อนไหว (${live.map(l => l.r.toFixed(1)).join(', ')} ม.)`); }

  // hand gestures: nearest mover within 60 cm moving fast toward/away
  if (mode === 'gesture' && t - gestT > 1) {
    const h = live.find(l => l.r < 0.6);
    if (h && h.hist.length > 4) {
      const recent = h.hist.filter(x => t - x[0] < 0.5), dr = recent.at(-1)[1] - recent[0][1];
      if (Math.abs(dr) > 0.12) { gestT = t; gesture(dr < 0 ? 'push' : 'pull'); }
    }
  }
}

function setState(txt, cls) { const s = $('#state'); s.textContent = txt; s.className = cls; }

function alarm(r) {
  log(`🚨 แจ้งเตือนบุกรุก ระยะ ${r.toFixed(1)} ม.`, 'bad');
  navigator.vibrate?.([300, 100, 300]);
  // audible beep mixed with the sonar (short, so tracking keeps working)
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = 1400; o.type = 'square'; g.gain.value = 0.15;
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
}
const GEST = { push: ['✋→ ดันเข้า', '▶ ถัดไป'], pull: ['✋← ดึงออก', '◀ ก่อนหน้า'] };
let slide = 0;
function gesture(kind) {
  slide += kind === 'push' ? 1 : -1;
  toast(`${GEST[kind][0]}  ·  ${GEST[kind][1]} (ตัวอย่างคำสั่ง #${slide})`, 1200);
  log(`ท่าทาง: ${GEST[kind][0]}`, 'c');
}

// ---------- breathing (every 2 s) ----------
let lastBreath = null;
setInterval(() => {
  if (!breath || !readyAt) return;
  // breathing only makes sense when nobody is walking around
  const r = live.some(l => l.r > 0.25 && l.s > sens * 2.5) ? null : breath.estimate();
  lastBreath = r?.rpm ? r : null;
  $('#rpm').innerHTML = `${lastBreath ? Math.round(lastBreath.rpm) : '--'}<small> /นาที</small>`;
  $('#breathR').innerHTML = `${lastBreath ? lastBreath.range.toFixed(2) : '--'}<small> ม.</small>`;
}, 2000);

// ---------- drawing ----------
const fan = $('#fan'), fg = fan.getContext('2d'), water = $('#water'), wg = water.getContext('2d'), bc = $('#breath'), bg = bc.getContext('2d');
function fit(c) {
  const d = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return [w, h];
}
const heat = v => { // 0..1 → dark blue → cyan → white
  v = Math.max(0, Math.min(1, v));
  return v < .5 ? `rgb(0,${Math.round(40 + 380 * v)},${Math.round(60 + 300 * v)})` : `rgb(${Math.round((v - .5) * 500)},${Math.round(230 + 50 * (v - .5))},255)`;
};

function draw(now) {
  requestAnimationFrame(draw);
  const [W, H] = fit(fan), cx = W / 2, cy = H - 8, R = Math.min(W / 2 - 10, H - 20);
  fg.clearRect(0, 0, W, H);
  const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
  // range rings
  fg.font = '11px "Share Tech Mono", monospace'; fg.textAlign = 'center';
  for (let m = 0.5; m <= maxRange + 1e-6; m += 0.5) {
    const r = m / maxRange * R;
    fg.beginPath(); fg.arc(cx, cy, r, a0, a1);
    fg.strokeStyle = m % 1 ? 'rgba(60,231,255,.12)' : 'rgba(60,231,255,.3)'; fg.lineWidth = 1; fg.stroke();
    if (!(m % 1)) { fg.fillStyle = 'rgba(60,231,255,.6)'; fg.fillText(m + ' ม.', cx + Math.cos(a1) * r + 14, cy + Math.sin(a1) * r + 4); }
  }
  // live motion energy as glowing arcs (no angle info → full-width arcs)
  if (lastSnr && sonar) {
    for (let c = 0; c < lastSnr.length; c++) {
      const v = Math.min(1, Math.max(0, (lastSnr[c] - 1.5) / (sens * 2.5)));
      if (v < 0.05) continue;
      const r = sonar.rangeOf(c) / maxRange * R;
      fg.beginPath(); fg.arc(cx, cy, r, a0, a1);
      fg.strokeStyle = `rgba(60,231,255,${v * 0.6})`; fg.lineWidth = Math.max(1.5, R / lastSnr.length * 1.2); fg.stroke();
    }
  }
  // sonar ping wave
  const p = (now / 1200) % 1;
  fg.beginPath(); fg.arc(cx, cy, p * R, a0, a1); fg.strokeStyle = `rgba(168,244,255,${0.5 * (1 - p)})`; fg.lineWidth = 2; fg.stroke();
  // targets
  live.forEach((l, i) => {
    const r = l.r / maxRange * R, pulse = (Math.sin(now / 150 + i) + 1) / 2;
    fg.beginPath(); fg.arc(cx, cy, r, a0, a1);
    fg.strokeStyle = mode === 'guard' && armed ? '#ff4d6d' : '#ffc845'; fg.lineWidth = 4 + pulse * 3;
    fg.shadowColor = fg.strokeStyle; fg.shadowBlur = 18; fg.stroke(); fg.shadowBlur = 0;
    fg.fillStyle = '#fff'; fg.font = '14px "Share Tech Mono", monospace';
    fg.fillText(`#${l.id}  ${l.r.toFixed(2)} ม.`, cx, cy - r - 8);
  });
  if (lastBreath) {
    const r = lastBreath.range / maxRange * R;
    fg.setLineDash([4, 6]); fg.beginPath(); fg.arc(cx, cy, r, a0, a1);
    fg.strokeStyle = 'rgba(61,255,154,.8)'; fg.lineWidth = 2; fg.stroke(); fg.setLineDash([]);
    fg.fillStyle = '#3dff9a'; fg.fillText(`หายใจ ${Math.round(lastBreath.rpm)}/นาที`, cx, cy - r + 16);
  }
  // the device
  fg.fillStyle = '#3ce7ff'; fg.fillRect(cx - 14, cy - 4, 28, 8);
  fg.fillStyle = 'rgba(60,231,255,.7)'; fg.font = '11px "Share Tech Mono", monospace'; fg.fillText('YOU / DEVICE', cx, cy - 10);

  $('#count').textContent = sonar && readyAt ? live.length : '--';
  $('#near').innerHTML = `${live.length ? live[0].r.toFixed(2) : '--'}<small> ม.</small>`;

  // waterfall
  const [ww, wh] = fit(water);
  wg.fillStyle = '#000'; wg.fillRect(0, 0, ww, wh);
  if (hist.length) {
    const cells = hist[0].length, cw = ww / cells, rh = wh / 160;
    for (let y = 0; y < hist.length; y++) for (let c = 0; c < cells; c++) {
      const v = (hist[y][c] - 1.5) / (sens * 2.5);
      if (v > 0.04) { wg.fillStyle = heat(v); wg.fillRect(c * cw, y * rh, cw + 0.6, rh + 0.6); }
    }
    wg.fillStyle = 'rgba(60,231,255,.6)'; wg.font = '10px "Share Tech Mono", monospace';
    for (let m = 1; m <= maxRange; m++) { const x = m / maxRange * ww; wg.fillRect(x, 0, 1, 6); wg.fillText(m + 'm', x - 16, 14); }
  }

  // breathing wave
  const [bw, bh] = fit(bc);
  bg.clearRect(0, 0, bw, bh);
  if (lastBreath?.wave) {
    const w = lastBreath.wave, mn = Math.min(...w), mx = Math.max(...w);
    bg.beginPath();
    w.forEach((v, i) => { const x = i / (w.length - 1) * bw, y = bh - 6 - (v - mn) / ((mx - mn) || 1) * (bh - 12); i ? bg.lineTo(x, y) : bg.moveTo(x, y); });
    bg.strokeStyle = '#3dff9a'; bg.lineWidth = 2; bg.stroke();
  } else { bg.fillStyle = 'rgba(91,143,158,.8)'; bg.font = '13px Sarabun'; bg.fillText('นั่งนิ่งห่างเครื่อง 0.3–1.5 ม. ~15 วินาที เพื่อวัดการหายใจ', 8, bh / 2 + 5); }
}

// ---------- controls ----------
$('#modes').onclick = e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  if (b.dataset.m === 'guard' && mode === 'guard') {
    if (armed || armT) { clearTimeout(armT); armT = null; armed = false; log('หยุดเฝ้า', 'warn'); }
    else { log('🛡 จะเริ่มเฝ้าใน 10 วินาที — ออกจากห้องได้เลย', 'warn'); armT = setTimeout(() => { armT = null; armed = true; log('🛡 เฝ้าแล้ว', 'warn'); }, 10000); }
  }
  mode = b.dataset.m;
  $$('#modes .btn').forEach(x => x.classList.toggle('on', x === b));
  if (mode === 'gesture') toast('โบกมือ ดันเข้า/ดึงออก จากเครื่องในระยะ 10–60 ซม.', 3000);
  if (mode === 'guard' && !armed) toast('กด "กันขโมย" อีกครั้งเพื่อเริ่มเฝ้า', 2500);
};
$('#range').value = maxRange;
$('#range').onchange = e => { maxRange = +e.target.value; store.set('sonar.range', maxRange); if (sonar) recalibrate(); };
$('#sens').value = sens;
$('#sens').oninput = e => { sens = +e.target.value; store.set('sonar.sens', sens); };
$('#sens').title = 'ค่าน้อย = ไวขึ้น';
$('#vol').oninput = e => node?.port.postMessage({ gain: +e.target.value });
$('#recal').onclick = () => sonar && recalibrate();
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else { ctx.resume(); recalibrate(); }
});
addEventListener('pagehide', () => release?.());

await gate({
  title: 'SONAR',
  needs: ['mic'],
  lines: [
    'มือถือ/คอมจะส่งเสียงความถี่สูง 18–21 kHz แล้วฟังเสียงสะท้อน — ใช้ <b>ไมโครโฟน</b>',
    'รู้ได้: มีการเคลื่อนไหวไหม · ห่างกี่เมตร · กี่จุด · อัตราการหายใจ (ระยะใกล้)',
    'รู้ไม่ได้: เป็นใคร · อยู่ซ้ายหรือขวา · หลังกำแพง',
    'วางเครื่องนิ่งบนโต๊ะ เปิดหน้าจอค้างไว้ · iPhone: ปิดโหมดเงียบ (สวิตช์/ปุ่มข้างเครื่อง) และเปิดเสียงขึ้นเกินครึ่ง',
  ],
  button: '▶ เริ่มโซนาร์',
  onStart: start,
});
requestAnimationFrame(draw);
