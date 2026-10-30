// BODY//SCAN — camera, AI models, render loop, mode switching
import posture from './posture.js';
import rom from './rom.js';
import face from './face.js';
import vitals from './vitals.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};
const MODES = [posture, rom, face, vitals];

const $ = s => document.querySelector(s);
const video = $('#video'), cv = $('#fx'), g = cv.getContext('2d');
const stage = $('#stage'), panel = $('#panel');

let stream = null, facing = 'user', mode = null, lastVT = -1, frames = 0, fpsT = performance.now();
const models = {}, loading = {};

// ---------- shared context handed to each mode ----------
export const k = {
  g, video, W: 0, H: 0, mirror: true, facing: () => facing,
  // normalized landmark -> overlay point (mirrored for the selfie camera)
  P: l => ({ x: (k.mirror ? 1 - l.x : l.x) * k.W, y: l.y * k.H, v: l.visibility ?? 1 }),
  guide: t => { $('#guide').textContent = t || ''; },
  count: t => { $('#count').textContent = t ?? ''; },
  line(a, b, c = '#3ce7ff', w = 2, dash) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); },
  dot(p, r = 4, c = '#3ce7ff') { g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0; },
  label(p, t, c = '#3ce7ff', size = 14) {
    g.font = `${size}px "Share Tech Mono", "Sarabun", monospace`;
    const w = g.measureText(t).width;
    g.fillStyle = 'rgba(0,10,16,.75)'; g.fillRect(p.x - 4, p.y - size, w + 8, size + 6);
    g.fillStyle = c; g.fillText(t, p.x, p.y);
  },
  arc(c, r, a0, a1, col = '#3ce7ff') { // short way round from a0 to a1
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    g.beginPath(); g.moveTo(c.x, c.y); g.arc(c.x, c.y, r, a0, a0 + d, d < 0); g.closePath(); g.fillStyle = col + '33'; g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); },
  scanline(t) { // sweeping laser
    const y = (t / 1600 % 1) * k.H;
    const gr = g.createLinearGradient(0, y - 40, 0, y);
    gr.addColorStop(0, 'rgba(60,231,255,0)'); gr.addColorStop(1, 'rgba(60,231,255,.35)');
    g.fillStyle = gr; g.fillRect(0, y - 40, k.W, 40);
    k.line({ x: 0, y }, { x: k.W, y }, 'rgba(168,244,255,.9)', 1.5);
  },
  async need(name) { return loadModel(name); },
};

const SKEL = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30]];
k.skeleton = (lm, col = 'rgba(60,231,255,.75)') => {
  const P = lm.map(k.P);
  for (const [a, b] of SKEL) if (P[a].v > .5 && P[b].v > .5) k.line(P[a], P[b], col, 2.5);
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) if (P[i].v > .5) k.dot(P[i], 3.5, '#a8f4ff');
  return P;
};
k.faceMesh = (lm, every = 3) => {
  g.fillStyle = 'rgba(60,231,255,.55)';
  for (let i = 0; i < lm.length; i += every) { const p = k.P(lm[i]); g.fillRect(p.x - 1, p.y - 1, 2, 2); }
};

// ---------- models ----------
let vision = null;
async function loadModel(name) {
  if (models[name]) return models[name];
  loading[name] ??= (async () => {
    k.guide(`กำลังโหลด AI ${name === 'pose' ? 'จับโครงร่างกาย' : 'จับใบหน้า'} (ครั้งแรก ~${name === 'pose' ? 9 : 4} MB)…`);
    vision ??= await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const make = delegate => name === 'pose'
      ? vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.pose, delegate }, runningMode: 'VIDEO', numPoses: 1 })
      : vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.face, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
    try { models[name] = await make('GPU'); } catch { models[name] = await make('CPU'); }
    k.guide('');
    return models[name];
  })().catch(e => { loading[name] = null; k.guide('โหลด AI ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); throw e; });
  return loading[name];
}

// ---------- camera ----------
async function startCamera() {
  stream?.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  const s = stream.getVideoTracks()[0].getSettings();
  // a laptop webcam has no facingMode; treat it as a selfie camera
  k.mirror = (s.facingMode || 'user') === 'user';
  video.classList.toggle('mirror', k.mirror);
  $('#camInfo').textContent = `${video.videoWidth}×${video.videoHeight} · ${k.mirror ? 'กล้องหน้า' : 'กล้องหลัง'}`;
  layout();
}
function layout() {
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3;
  const box = stage.parentElement.getBoundingClientRect();
  const maxW = box.width - (innerWidth <= 900 ? 32 : 32), maxH = innerWidth <= 900 ? innerHeight * .56 : innerHeight - 150;
  const s = Math.min(maxW / vw, maxH / vh);
  stage.style.width = Math.round(vw * s) + 'px';
  stage.style.height = Math.round(vh * s) + 'px';
  stage.style.aspectRatio = 'auto';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  k.W = vw * s; k.H = vh * s;
  cv.width = k.W * dpr; cv.height = k.H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', layout);

// ---------- modes ----------
$('#modes').innerHTML = MODES.map(m => `<button class="btn" data-m="${m.id}">${m.icon} ${m.title}</button>`).join('');
$('#modes').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
async function setMode(id) {
  mode?.unmount?.();
  mode = MODES.find(m => m.id === id);
  document.querySelectorAll('#modes .btn').forEach(b => b.classList.toggle('on', b.dataset.m === id));
  $('#hudMode').textContent = mode.hud;
  k.guide(''); k.count('');
  panel.innerHTML = '';
  mode.mount(panel, k);
  try { history.replaceState(null, '', '#' + id); } catch {}
}

// ---------- render loop ----------
function loop(now) {
  requestAnimationFrame(loop);
  if (!mode || video.readyState < 2 || !k.W) return;
  if (video.currentTime === lastVT) return;
  lastVT = video.currentTime;
  const need = mode.needs?.() || 'pose';
  const res = {};
  const m = models[need];
  if (!m) { loadModel(need).catch(() => {}); }
  else {
    try {
      const out = m.detectForVideo(video, now);
      if (need === 'pose') res.pose = out.landmarks?.[0];
      else { res.face = out.faceLandmarks?.[0]; res.matrix = out.facialTransformationMatrixes?.[0]?.data; }
    } catch (e) { console.warn(e); }
  }
  g.clearRect(0, 0, k.W, k.H);
  // corner brackets
  const c = 22;
  for (const [x, y, dx, dy] of [[8, 8, 1, 1], [k.W - 8, 8, -1, 1], [k.W - 8, k.H - 8, -1, -1], [8, k.H - 8, 1, -1]]) {
    g.beginPath(); g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y);
    g.strokeStyle = 'rgba(60,231,255,.7)'; g.lineWidth = 2; g.stroke();
  }
  mode.frame(res, k, now);
  frames++;
  if (now - fpsT > 1000) { $('#hudFps').textContent = `${frames} FPS`; frames = 0; fpsT = now; }
}

// ---------- start ----------
$('#btnFlip').onclick = async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  try { await startCamera(); } catch { facing = 'user'; }
};
$('#btnStart').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#startErr').textContent = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องเปิดผ่าน https หรือ localhost)';
    return;
  }
  try {
    await startCamera();
    $('#start').hidden = true;
    setMode(MODES.find(m => '#' + m.id === location.hash)?.id || 'posture');
    requestAnimationFrame(loop);
  } catch (e) {
    $('#startErr').textContent = 'เปิดกล้องไม่ได้: ' + (e.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาต — กดอนุญาตกล้องในการตั้งค่าเบราว์เซอร์' : e.message);
  }
};
