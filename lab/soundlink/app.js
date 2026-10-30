// SOUND LINK — send text/links between devices with sound
import { bar, mic, toast, store, permMsg, $, $$ } from '../common/lab.js';
import { MODES, tones, encode, Decoder } from './modem.js';

bar('SOUND LINK', 'ส่งข้อความ/ลิงก์ระหว่างเครื่องด้วยเสียง');

let ctx, decoder, listening = false, worklet, micStream, analyser;
let modeKey = store.get('sl.mode', 'audible'), sym = +store.get('sl.sym', 0.06);
const enc = new TextEncoder(), dec = new TextDecoder();

function audio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  return ctx.resume().then(() => ctx);
}

// ---------- send ----------
$('#text').value = store.get('sl.text', '');
const updInfo = () => {
  const n = enc.encode($('#text').value).length;
  $('#info').textContent = `${n} ไบต์ · ใช้เวลาส่ง ~${((n * 2 + 8) * sym).toFixed(1)} วินาที`;
};
$('#text').oninput = () => { store.set('sl.text', $('#text').value); updInfo(); };
let sending = false;
$('#send').onclick = async () => {
  const bytes = enc.encode($('#text').value.trim());
  if (!bytes.length || sending) return;
  try {
    const c = await audio();
    const pcm = encode(bytes, { mode: MODES[modeKey], fs: c.sampleRate, sym });
    const buf = c.createBuffer(1, pcm.length, c.sampleRate); buf.copyToChannel(pcm, 0);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
    sending = true; const b = $('#send'); b.disabled = true; b.textContent = '📡 กำลังส่ง…';
    src.onended = () => { sending = false; b.disabled = false; b.textContent = '📡 ส่งผ่านเสียง'; };
    src.start();
    if (listening) toast('เครื่องนี้กำลังฟังอยู่ด้วย — จะได้ยินข้อความตัวเอง');
  } catch (e) { toast(e.message); }
};

// ---------- receive ----------
const WORKLET = `class Tap extends AudioWorkletProcessor { process(i) { const x = i[0][0]; if (x) this.port.postMessage(x.slice(0)); return true; } } registerProcessor('tap', Tap);`;
function newDecoder() {
  decoder = new Decoder({
    mode: MODES[modeKey], fs: ctx.sampleRate, sym,
    onMessage: b => addMsg(dec.decode(b)),
    onError: e => addMsg(e, true),
  });
}
$('#listen').onclick = async () => {
  if (listening) return stopListen();
  try {
    const c = await audio();
    const m = await mic(c); micStream = m.stream;
    if (!worklet) await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
    worklet = new AudioWorkletNode(c, 'tap');
    analyser = c.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.3;
    m.source.connect(worklet); m.source.connect(analyser);
    // a worklet only runs while connected to the output; route it through a muted gain
    const mute = c.createGain(); mute.gain.value = 0; worklet.connect(mute).connect(c.destination);
    newDecoder();
    worklet.port.onmessage = e => decoder.feed(e.data);
    listening = true;
    $('#listen').textContent = '⏹ หยุดฟัง'; $('#listen').classList.add('on');
    $('#listenState').textContent = `กำลังฟัง · ${MODES[modeKey].name} · ${c.sampleRate} Hz`;
    if (modeKey === 'ultra' && c.sampleRate < 44100) toast('อัตราสุ่มต่ำเกินไปสำหรับโหมดเงียบ');
  } catch (e) { toast(permMsg(e)); }
};
function stopListen() {
  listening = false;
  micStream?.getTracks().forEach(t => t.stop());
  worklet?.disconnect();
  $('#listen').textContent = '🎤 เริ่มฟัง'; $('#listen').classList.remove('on');
  $('#listenState').textContent = '';
}

function addMsg(text, err) {
  const el = document.createElement('div');
  el.className = 'msg' + (err ? ' err' : '');
  const url = !err && text.match(/https?:\/\/\S+/)?.[0];
  el.innerHTML = `<time>${new Date().toLocaleTimeString('en-GB')}</time><div></div>${err ? '' : `<div class="acts"><button class="btn" data-copy>📋 คัดลอก</button>${url ? '<button class="btn primary" data-open>🔗 เปิดลิงก์</button>' : ''}</div>`}`;
  el.children[1].textContent = text;
  el.querySelector('[data-copy]')?.addEventListener('click', () => navigator.clipboard?.writeText(text).then(() => toast('คัดลอกแล้ว')));
  el.querySelector('[data-open]')?.addEventListener('click', () => open(url, '_blank', 'noopener'));
  $('#msgs').prepend(el);
  if (!err) { navigator.vibrate?.(80); toast('📥 ได้รับข้อความ'); }
}

// ---------- tone bars ----------
const cv = $('#bars'), g = cv.getContext('2d');
let fbuf;
function draw() {
  requestAnimationFrame(draw);
  const d = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
  const m = MODES[modeKey], fs = [m.A, ...tones(m), m.B];
  const n = fs.length, bw = W / n;
  let vals = new Array(n).fill(0);
  if (analyser && listening) {
    fbuf ??= new Float32Array(analyser.frequencyBinCount);
    if (fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fbuf);
    const hz = ctx.sampleRate / analyser.fftSize;
    vals = fs.map(f => Math.max(0, Math.min(1, (fbuf[Math.round(f / hz)] + 100) / 70)));
  }
  vals.forEach((v, i) => {
    const marker = i === 0 || i === n - 1;
    g.fillStyle = marker ? 'rgba(255,200,69,.85)' : `rgba(60,231,255,${0.3 + v * 0.7})`;
    g.fillRect(i * bw + 2, H - 14 - v * (H - 24), bw - 4, Math.max(2, v * (H - 24)));
  });
  g.fillStyle = 'rgba(91,143,158,.9)'; g.font = '10px "Share Tech Mono", monospace';
  g.fillText(`${(fs[0] / 1000).toFixed(1)} kHz`, 2, H - 2);
  g.textAlign = 'right'; g.fillText(`${(fs[n - 1] / 1000).toFixed(1)} kHz`, W - 2, H - 2); g.textAlign = 'left';
}
requestAnimationFrame(draw);

// ---------- settings ----------
function seg(id, val, set) {
  $$(`#${id} .btn`).forEach(b => {
    b.classList.toggle('on', b.dataset.v === String(val));
    b.onclick = () => { set(b.dataset.v); $$(`#${id} .btn`).forEach(x => x.classList.toggle('on', x === b)); if (listening) { newDecoder(); $('#listenState').textContent = `กำลังฟัง · ${MODES[modeKey].name}`; } updInfo(); };
  });
}
seg('mode', modeKey, v => { modeKey = v; store.set('sl.mode', v); });
seg('speed', sym, v => { sym = +v; store.set('sl.sym', sym); });
updInfo();
