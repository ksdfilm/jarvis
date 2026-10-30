// LAB shared helpers — import what you need:  import { bar, gate, camera, ... } from '../common/lab.js';
export const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const MP_AUDIO = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.14';
export const THREE = 'https://cdn.jsdelivr.net/npm/three@0.169.0';
export const MODELS = {
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  poseLite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  objects: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
  selfieSeg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  yamnet: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
};

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const isPhone = () => matchMedia('(max-width: 700px)').matches || /iPhone|Android/.test(navigator.userAgent);
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// served by XAMPP — PC localhost, office LAN, or remotely through Tailscale (100.64.0.0/10 or *.ts.net)
// — PHP endpoints are only reachable then
export const onLan = () => /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(location.hostname) || /\.ts\.net$/.test(location.hostname);

// free Cloudflare Worker proxy (see ../remote/) — set once in config.js for everyone, or per device on the remote page
import { WORKER } from './config.js';
export const workerURL = () => store.get('worker', '') || WORKER;
// URL that fetches `u` through a proxy: the XAMPP proxy on LAN (reaches every API, incl. OpenSky/adsb.fi which
// block Cloudflare), else the Worker (works anywhere); null if neither
export function proxyURL(u) {
  if (onLan()) return `${new URL('./proxy.php', import.meta.url)}?u=${encodeURIComponent(u)}`;
  const w = workerURL();
  if (w) return `${w.replace(/\/?$/, '/')}?u=${encodeURIComponent(u)}`;
  return null;
}
// true when requests go through the Cloudflare Worker (adsb.lol only — adsb.fi/OpenSky refuse Cloudflare)
export const viaWorker = () => !onLan() && !!workerURL();

// localStorage that never throws
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('lab.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lab.' + k, JSON.stringify(v)); } catch {} },
};

// inside an EDIT HUD panel (iframe): the HUD draws the frame and navigation → app goes frameless (lab.css html.embedded)
export const embedded = window.self !== window.top;
if (embedded) document.documentElement.classList.add('embedded');
const slug = location.pathname.split('/').filter(Boolean).at(-1);

// header bar with a link back to the LAB hub — or back to the EDIT panel when opened full-page from the HUD (?from=edit)
export function bar(title, sub = '', right = '') {
  const el = document.createElement('header');
  el.className = 'lab-bar';
  const fromEdit = new URLSearchParams(location.search).get('from') === 'edit';
  const back = embedded ? '' : fromEdit ? `<a class="back" href="../../ironman-hud/#p-x-${slug}">◂ EDIT</a>` : '<a class="back" href="../">◂ LAB</a>';
  el.innerHTML = `${back}<h1>${title}<small>${sub}</small></h1><div class="right">${right}</div>`;
  if (embedded && !right.trim()) el.hidden = true; // nothing but a title → the HUD already shows it
  document.body.prepend(el);
  return el;
}

// camera already allowed for this site? (Safari 16+/Chrome) → apps can start without another tap
export async function cameraGranted() {
  try { if ((await navigator.permissions.query({ name: 'camera' })).state === 'granted') return true; } catch {}
  return store.get('granted.camera', false);
}

let toastT;
export function toast(msg, ms = 3000) {
  document.querySelector('.lab-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'lab-toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastT); toastT = setTimeout(() => el.remove(), ms);
}

/**
 * Full-screen start overlay. iOS only grants camera/mic/motion from inside a tap, so every
 * permission request happens in the button handler. needs: 'camera' | 'mic' | 'motion' | 'orientation'
 * onStart() runs inside the tap; throw to show the error on the gate.
 */
export function gate({ title, lines = [], needs = [], button = '▶ เริ่ม', onStart }) {
  const el = document.createElement('div');
  el.className = 'lab-gate';
  // camera-only apps: once the site has camera permission, start straight away (no gate, no extra tap).
  // mic/motion apps keep the tap — iOS only starts audio / grants motion from inside a tap.
  // The gate is built synchronously (hidden while we check) so apps can still wire up links inside it.
  const auto = needs.length && needs.every(n => n === 'camera');
  el.hidden = auto;
  const secureNeeded = needs.length && !isSecureContext;
  el.innerHTML = `<div class="box"><h2>${title}</h2><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
    ${secureNeeded ? `<p class="err">หน้านี้ต้องเปิดผ่าน https หรือ localhost จึงจะใช้${needs.map(n => ({ camera: 'กล้อง', mic: 'ไมโครโฟน', motion: 'เซนเซอร์การเคลื่อนไหว', orientation: 'เข็มทิศ/เซนเซอร์ทิศทาง' })[n]).join(', ')}ได้</p>` : ''}
    <button class="btn primary big">${button}</button><p class="err" data-err></p></div>`;
  document.body.appendChild(el);
  return new Promise(resolve => {
    if (auto) (async () => {
      try {
        if (!await cameraGranted()) throw new Error('not granted yet');
        const r = await onStart?.();
        el.remove(); resolve(r);
      } catch (e) { console.info('showing start gate:', e.message); el.hidden = false; }
    })();
    el.querySelector('button').onclick = async () => {
      const err = el.querySelector('[data-err]');
      err.textContent = '';
      try {
        if (needs.includes('motion') || needs.includes('orientation')) await askMotion();
        const r = await onStart?.();
        if (needs.includes('camera')) store.set('granted.camera', true);
        el.remove();
        resolve(r);
      } catch (e) {
        console.error(e);
        err.textContent = permMsg(e);
      }
    };
  });
}
export function permMsg(e) {
  if (e?.name === 'NotAllowedError') return 'ไม่ได้รับอนุญาต — เปิดสิทธิ์ในการตั้งค่าเบราว์เซอร์แล้วลองใหม่';
  if (e?.name === 'NotFoundError') return 'ไม่พบอุปกรณ์ (กล้อง/ไมค์) ในเครื่องนี้';
  if (e?.name === 'NotReadableError') return 'อุปกรณ์ถูกแอปอื่นใช้อยู่';
  return 'เริ่มไม่สำเร็จ: ' + (e?.message || e);
}
// iOS 13+: DeviceMotion/Orientation need an explicit permission from a tap
export async function askMotion() {
  for (const E of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
    if (E && typeof E.requestPermission === 'function') {
      const r = await E.requestPermission();
      if (r !== 'granted') throw Object.assign(new Error('motion denied'), { name: 'NotAllowedError' });
    }
  }
}

// camera into a <video>; returns { stream, mirror, w, h }
export async function camera(video, { facing = 'user', w = 1280, h = 720 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('เบราว์เซอร์นี้ใช้กล้องไม่ได้ (ต้องเป็น https)');
  video.srcObject?.getTracks?.().forEach(t => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h } }, audio: false });
  video.setAttribute('playsinline', ''); video.muted = true;
  video.srcObject = stream;
  await video.play();
  const mode = stream.getVideoTracks()[0].getSettings().facingMode || 'user';
  return { stream, mirror: mode === 'user', w: video.videoWidth, h: video.videoHeight };
}

// raw microphone (no echo cancel / noise suppression / AGC — they wreck ultrasonic & measurement)
export async function mic(ctx) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('เบราว์เซอร์นี้ใช้ไมโครโฟนไม่ได้ (ต้องเป็น https)');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  return { stream, source: ctx ? ctx.createMediaStreamSource(stream) : null };
}

// MediaPipe vision task with GPU→CPU fallback.  task: 'HandLandmarker' | 'PoseLandmarker' | 'FaceLandmarker' | 'ObjectDetector' | 'ImageSegmenter' ...
let visionMod, visionFiles;
export async function vision(task, options) {
  visionMod ??= await import(`${MP}/vision_bundle.mjs`);
  visionFiles ??= await visionMod.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = delegate => visionMod[task].createFromOptions(visionFiles, { ...options, baseOptions: { ...options.baseOptions, delegate } });
  try { return await make('GPU'); } catch (e) { console.warn('GPU delegate failed, using CPU', e); return make('CPU'); }
}
export const visionModule = async () => (visionMod ??= await import(`${MP}/vision_bundle.mjs`));

// keep the screen on where supported (https only); returns release()
export async function wakeLock() {
  try { const l = await navigator.wakeLock?.request('screen'); return () => l?.release(); } catch { return () => {}; }
}

// fetch JSON from a CORS-less API: direct first, then via the Worker / XAMPP proxy
export async function getJSON(url, { proxy = true } = {}) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.json();
  } catch {}
  const p = proxy && proxyURL(url);
  if (p) {
    const r = await fetch(p);
    if (r.ok) return r.json();
  }
  throw new Error('fetch failed: ' + url);
}

export const fmtTime = (d = new Date()) => d.toLocaleTimeString('en-GB');
