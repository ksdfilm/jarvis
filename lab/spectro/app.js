// SPECTRO — 3D spectrogram + YAMNet sound classification (MediaPipe tasks-audio)
import { bar, gate, mic, toast, store, MP_AUDIO, MODELS, $, $$ } from '../common/lab.js';

bar('SPECTRO', 'มองเห็นเสียง + AI จำแนกเสียง');

// YAMNet display names → Thai (anything not listed is shown in English)
const TH = {
  'Speech': 'เสียงพูด', 'Child speech, kid speaking': 'เด็กพูด', 'Conversation': 'คนคุยกัน', 'Narration, monologue': 'การบรรยาย', 'Laughter': 'เสียงหัวเราะ',
  'Baby cry, infant cry': 'เด็กทารกร้อง', 'Crying, sobbing': 'ร้องไห้', 'Shout': 'ตะโกน', 'Screaming': 'กรีดร้อง', 'Whispering': 'กระซิบ', 'Whistling': 'ผิวปาก',
  'Cough': 'ไอ', 'Sneeze': 'จาม', 'Snoring': 'กรน', 'Breathing': 'หายใจ', 'Footsteps': 'เสียงเดิน', 'Clapping': 'ปรบมือ', 'Applause': 'เสียงปรบมือ', 'Cheering': 'เชียร์',
  'Music': 'เพลง', 'Singing': 'ร้องเพลง', 'Guitar': 'กีตาร์', 'Piano': 'เปียโน', 'Drum': 'กลอง', 'Musical instrument': 'เครื่องดนตรี',
  'Dog': 'สุนัข', 'Bark': 'หมาเห่า', 'Cat': 'แมว', 'Meow': 'แมวร้อง', 'Bird': 'นก', 'Bird vocalization, bird call, bird song': 'นกร้อง', 'Rooster, cock': 'ไก่ขัน', 'Chicken, rooster': 'ไก่',
  'Insect': 'แมลง', 'Cricket': 'จิ้งหรีด', 'Mosquito': 'ยุง', 'Frog': 'กบ', 'Animal': 'สัตว์',
  'Rain': 'ฝนตก', 'Raindrop': 'เม็ดฝน', 'Thunder': 'ฟ้าร้อง', 'Thunderstorm': 'พายุฝนฟ้าคะนอง', 'Wind': 'ลม', 'Water': 'น้ำ', 'Water tap, faucet': 'ก๊อกน้ำ', 'Toilet flush': 'กดชักโครก',
  'Vehicle': 'ยานพาหนะ', 'Car': 'รถยนต์', 'Car alarm': 'สัญญาณกันขโมยรถ', 'Motorcycle': 'มอเตอร์ไซค์', 'Truck': 'รถบรรทุก', 'Bus': 'รถบัส', 'Train': 'รถไฟ', 'Vehicle horn, car horn, honking': 'แตรรถ',
  'Aircraft': 'เครื่องบิน', 'Helicopter': 'เฮลิคอปเตอร์', 'Siren': 'ไซเรน', 'Ambulance (siren)': 'ไซเรนรถพยาบาล', 'Police car (siren)': 'ไซเรนรถตำรวจ', 'Fire engine, fire truck (siren)': 'ไซเรนรถดับเพลิง', 'Civil defense siren': 'ไซเรนเตือนภัย',
  'Alarm': 'สัญญาณเตือน', 'Smoke detector, smoke alarm': 'เครื่องตรวจควันดัง', 'Fire alarm': 'สัญญาณไฟไหม้', 'Alarm clock': 'นาฬิกาปลุก', 'Telephone': 'โทรศัพท์', 'Ringtone': 'เสียงเรียกเข้า', 'Telephone bell ringing': 'โทรศัพท์ดัง',
  'Doorbell': 'กริ่งประตู', 'Knock': 'เคาะประตู', 'Door': 'ประตู', 'Slam': 'ปิดประตูดังปัง', 'Glass': 'แก้ว', 'Shatter': 'กระจกแตก', 'Breaking': 'ของแตก',
  'Explosion': 'ระเบิด', 'Gunshot, gunfire': 'เสียงปืน', 'Fireworks': 'พลุ/ประทัด', 'Firecracker': 'ประทัด',
  'Engine': 'เครื่องยนต์', 'Tools': 'เครื่องมือช่าง', 'Hammer': 'ค้อน', 'Drill': 'สว่าน', 'Sawing': 'เลื่อย', 'Power tool': 'เครื่องมือไฟฟ้า', 'Jackhammer': 'สว่านเจาะถนน',
  'Vacuum cleaner': 'เครื่องดูดฝุ่น', 'Air conditioning': 'แอร์', 'Mechanical fan': 'พัดลม', 'Typing': 'พิมพ์', 'Computer keyboard': 'คีย์บอร์ด', 'Silence': 'เงียบ',
  'Clock': 'นาฬิกา', 'Tick': 'ติ๊กต๊อก', 'Beep, bleep': 'เสียงบี๊บ', 'Microwave oven': 'ไมโครเวฟ', 'Television': 'โทรทัศน์', 'Speech synthesizer': 'เสียงสังเคราะห์',
  'White noise': 'สัญญาณรบกวน', 'Noise': 'เสียงรบกวน', 'Inside, small room': 'ในห้องเล็ก', 'Inside, large room or hall': 'ในห้องโถง', 'Outside, urban or manmade': 'นอกอาคาร (เมือง)',
  'Chewing, mastication': 'เคี้ยว', 'Dishes, pots, and pans': 'จานชาม', 'Cutlery, silverware': 'ช้อนส้อม', 'Frying (food)': 'ทอดอาหาร', 'Writing': 'เขียน', 'Rustle': 'เสียงกรอบแกรบ',
};
const ALERT = /siren|alarm|smoke|shatter|breaking|baby cry|scream|gunshot|explosion|glass|car alarm|crying/i;

let ctx, analyser, clf, ring, ringN = 0, ringPos = 0;
let view = store.get('sp.view', '3d'), band = +store.get('sp.band', 8000);
const rows = []; // spectra history (Float32 0..1)
const lastAlert = {};

async function start() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const m = await mic(ctx);
  analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.4;
  analyser.minDecibels = -110; analyser.maxDecibels = -20;
  m.source.connect(analyser);
  // raw samples for the classifier
  const code = `class Tap extends AudioWorkletProcessor { process(i) { const x = i[0][0]; if (x) this.port.postMessage(x.slice(0)); return true; } } registerProcessor('tap', Tap);`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
  const tap = new AudioWorkletNode(ctx, 'tap');
  const mute = ctx.createGain(); mute.gain.value = 0;
  m.source.connect(tap); tap.connect(mute).connect(ctx.destination);
  ring = new Float32Array(ctx.sampleRate); // last 1 s
  tap.port.onmessage = e => { const x = e.data; for (let i = 0; i < x.length; i++) { ring[ringPos] = x[i]; ringPos = (ringPos + 1) % ring.length; } ringN += x.length; };
  loadClassifier();
}

async function loadClassifier() {
  try {
    const audio = await import(`${MP_AUDIO}/audio_bundle.mjs`);
    const files = await audio.FilesetResolver.forAudioTasks(`${MP_AUDIO}/wasm`);
    clf = await audio.AudioClassifier.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.yamnet }, maxResults: 6, scoreThreshold: 0.05 });
    $('#cls').textContent = 'กำลังฟัง…';
    setInterval(classify, 500);
  } catch (e) { console.error(e); $('#cls').textContent = 'โหลดโมเดล AI ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต'; }
}

function classify() {
  if (!clf || ringN < ring.length) return;
  const x = new Float32Array(ring.length);
  x.set(ring.subarray(ringPos)); x.set(ring.subarray(0, ringPos), ring.length - ringPos);
  let res;
  try { res = clf.classify(x, ctx.sampleRate); } catch (e) { console.warn(e); return; }
  // average the per-chunk results
  const acc = {};
  for (const r of res) for (const c of r.classifications[0].categories) acc[c.categoryName] = (acc[c.categoryName] || 0) + c.score / res.length;
  const top = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('#cls').innerHTML = top.map(([n, s]) => `<div class="cls${ALERT.test(n) && s > .3 ? ' alert' : ''}"><b>${TH[n] || n}</b><span class="mono">${Math.round(s * 100)}%</span>${TH[n] ? `<small>${n}</small>` : ''}<div class="bar"><i style="width:${s * 100}%"></i></div></div>`).join('') || 'เงียบ';
  // log notable sounds (not speech/silence spam): once per 10 s per label
  const now = Date.now();
  for (const [n, s] of top) {
    if (s < 0.45 || /^(Silence|Speech|Inside|Outside|Noise|White noise)/.test(n)) continue;
    if (now - (lastAlert[n] || 0) < 10000) continue;
    lastAlert[n] = now;
    const alert = ALERT.test(n);
    const log = $('#log');
    if (log.textContent === 'ยังไม่มี') log.innerHTML = '';
    const d = document.createElement('div');
    if (alert) d.className = 'alert';
    d.innerHTML = `<time>${new Date().toLocaleTimeString('en-GB')}</time>${alert ? '⚠ ' : ''}${TH[n] || n} (${Math.round(s * 100)}%)`;
    log.prepend(d);
    if (alert) { toast(`⚠ ได้ยิน: ${TH[n] || n}`); navigator.vibrate?.([200, 100, 200]); }
  }
}

// ---------- drawing ----------
const cv = $('#spec'), g = cv.getContext('2d');
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const color = v => `hsl(${190 - v * 190},100%,${20 + v * 50}%)`; // blue → cyan → green → yellow → red
let fbuf, tbuf, img;
function draw() {
  requestAnimationFrame(draw);
  const d = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); img = null; }
  g.setTransform(d, 0, 0, d, 0, 0);
  if (!analyser) return;
  fbuf ??= new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(fbuf);
  const hz = ctx.sampleRate / analyser.fftSize, nb = Math.min(fbuf.length, Math.ceil(band / hz));
  // log-ish compression of bins into 160 columns (more detail at low frequencies)
  const cols = 160, row = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(Math.pow(c / cols, 1.6) * nb), b = Math.max(a + 1, Math.floor(Math.pow((c + 1) / cols, 1.6) * nb));
    let m = -200; for (let k = a; k < b; k++) m = Math.max(m, fbuf[k]);
    row[c] = Math.max(0, Math.min(1, (m + 105) / 80));
  }
  rows.unshift(row); if (rows.length > 120) rows.pop();

  // meters
  tbuf ??= new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(tbuf);
  let rms = 0; for (const v of tbuf) rms += v * v; rms = Math.sqrt(rms / tbuf.length);
  $('#db').textContent = rms > 0 ? (20 * Math.log10(rms)).toFixed(0) + ' dB' : '--';
  let pk = 1; for (let k = 2; k < fbuf.length; k++) if (fbuf[k] > fbuf[pk]) pk = k;
  const f = pk * hz;
  if (fbuf[pk] > -75 && f > 40) {
    const n = Math.round(12 * Math.log2(f / 440)) + 57;
    $('#pitch').textContent = `${f < 1000 ? Math.round(f) + ' Hz' : (f / 1000).toFixed(1) + 'k'} ${f < 5000 ? NOTES[(n % 12 + 12) % 12] + Math.floor(n / 12) : ''}`;
  } else $('#pitch').textContent = '--';

  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (view === '2d') {
    // scrolling spectrogram: time → right edge, frequency ↑
    const cw = W / 120, rh = H / cols;
    rows.forEach((r, t) => { for (let c = 0; c < cols; c++) { if (r[c] < 0.05) continue; g.fillStyle = color(r[c]); g.fillRect(W - (t + 1) * cw, H - (c + 1) * rh, cw + .5, rh + .5); } });
  } else {
    // 3D terrain: newest row in front, older rows recede and rise
    const depth = 60;
    for (let t = Math.min(depth, rows.length) - 1; t >= 0; t--) {
      const r = rows[t], z = t / depth, sc = 1 - z * 0.55;
      const x0 = W / 2 - (W * 0.46) * sc, w = W * 0.92 * sc, base = H * 0.92 - z * H * 0.62, amp = H * 0.42 * sc;
      g.beginPath(); g.moveTo(x0, base);
      for (let c = 0; c < cols; c++) g.lineTo(x0 + c / (cols - 1) * w, base - r[c] * amp);
      g.lineTo(x0 + w, base); g.closePath();
      g.fillStyle = 'rgba(0,6,10,.92)'; g.fill();
      const grad = g.createLinearGradient(0, base - amp, 0, base);
      grad.addColorStop(0, `rgba(255,120,200,${1 - z})`); grad.addColorStop(1, `rgba(60,231,255,${1 - z})`);
      g.strokeStyle = grad; g.lineWidth = t === 0 ? 2 : 1; g.stroke();
    }
  }
  // frequency labels
  g.fillStyle = 'rgba(91,143,158,.9)'; g.font = '11px "Share Tech Mono", monospace';
  for (const fr of band > 8000 ? [100, 1000, 5000, 10000, 18000, 22000] : [100, 500, 1000, 2000, 4000, 8000]) {
    const p = Math.pow(fr / band, 1 / 1.6);
    if (p > 1) continue;
    const lbl = fr >= 1000 ? fr / 1000 + 'k' : fr;
    if (view === '2d') g.fillText(lbl, 4, H - p * H);
    else g.fillText(lbl, W / 2 - W * 0.46 + p * W * 0.92 - 8, H - 4);
  }
}

function seg(id, val, set) {
  $$(`#${id} .btn`).forEach(b => {
    b.classList.toggle('on', b.dataset.v === String(val));
    b.onclick = () => { set(b.dataset.v); $$(`#${id} .btn`).forEach(x => x.classList.toggle('on', x === b)); rows.length = 0; };
  });
}
seg('view', view, v => { view = v; store.set('sp.view', v); });
seg('band', band, v => { band = +v; store.set('sp.band', band); });

await gate({
  title: 'SPECTRO',
  needs: ['mic'],
  lines: ['แสดงเสียงรอบตัวเป็นภาพ 3D แบบเรียลไทม์', 'AI (YAMNet) ฟังแล้วบอกว่าเป็นเสียงอะไร 521 ประเภท เช่น หมาเห่า ไซเรน เด็กร้อง', 'เสียงเตือนภัย (ไซเรน, สัญญาณไฟไหม้, กระจกแตก, กรีดร้อง) จะแจ้งเตือนทันที', 'ใช้ไมโครโฟน · ประมวลผลในเครื่อง'],
  button: '🎤 เริ่มฟัง',
  onStart: start,
});
requestAnimationFrame(draw);
