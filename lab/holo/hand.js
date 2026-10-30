// hand.js — HandLandmarker + gesture helpers (identical copy in holo/, airmouse/, airdraw/)
import { vision, MODELS, camera } from '../common/lab.js';

export const EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export const GESTURE_TH = { pinch: 'จีบนิ้ว', open: 'แบมือ', fist: 'กำมือ', point: 'ชี้นิ้ว', other: 'มือ', none: 'ไม่เห็นมือ' };
export const GESTURE_COLOR = { pinch: '#ffc845', open: '#3dff9a', fist: '#ff4d6d', point: '#ff7ad9', other: '#3ce7ff' };

// One-Euro filter (Casiez et al.) — low jitter when still, low lag when moving. t in seconds.
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = this.dx = this.t = null; }
  static a(cut, dt) { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.dx = 0; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.a(this.dCutoff, dt) * (dx - this.dx);
    const cut = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cut, dt) * (x - this.x);
    return this.x;
  }
}
// filters an {x, y[, z]} point
export class OneEuroPt {
  constructor(...a) { this.f = [new OneEuro(...a), new OneEuro(...a), new OneEuro(...a)]; }
  reset() { this.f.forEach(f => f.reset()); }
  filter(p, t) { return { x: this.f[0].filter(p.x, t), y: this.f[1].filter(p.y, t), z: this.f[2].filter(p.z ?? 0, t) }; }
}

/**
 * Camera + HandLandmarker. detect(now) returns an array of analysed hands for each NEW video frame,
 * or null when the frame hasn't changed. All x coordinates returned are already mirrored for display.
 */
export function handTracker({ numHands = 1 } = {}) {
  const video = document.createElement('video');
  video.setAttribute('playsinline', ''); video.muted = true;
  const t = { video, mirror: true, model: null, aspect: 16 / 9, hands: [], lastVT: -1, state: {} };
  t.start = async () => {
    const cam = await camera(video, { w: 960, h: 540 });
    t.mirror = cam.mirror; t.aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    t.model = await vision('HandLandmarker', {
      baseOptions: { modelAssetPath: MODELS.hand }, runningMode: 'VIDEO', numHands,
      minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    return t;
  };
  t.stop = () => { video.srcObject?.getTracks().forEach(tr => tr.stop()); video.srcObject = null; t.model = null; };
  t.detect = now => {
    if (!t.model || video.readyState < 2 || video.currentTime === t.lastVT) return null;
    t.lastVT = video.currentTime;
    t.aspect = video.videoWidth / video.videoHeight;
    let res;
    try { res = t.model.detectForVideo(video, now); } catch (e) { console.warn(e); return null; }
    const seen = new Set();
    t.hands = (res.landmarks || []).map((lm, i) => {
      let key = res.handednesses?.[i]?.[0]?.categoryName || 'H';
      if (seen.has(key)) key += i; seen.add(key);
      return analyse(lm, t, (t.state[key] ??= {}), key);
    });
    for (const k in t.state) if (!seen.has(k)) delete t.state[k];
    return t.hands;
  };
  return t;
}

function analyse(lm, t, st, key) {
  const A = t.aspect;
  const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * A, lm[a].y - lm[b].y, (lm[a].z - lm[b].z) * A);
  const palm = d(0, 9) || 1e-3;
  const ext = {
    index: d(0, 8) > d(0, 6) * 1.12, middle: d(0, 12) > d(0, 10) * 1.12,
    ring: d(0, 16) > d(0, 14) * 1.12, pinky: d(0, 20) > d(0, 18) * 1.12,
    thumb: d(4, 17) > d(3, 17) * 1.05 && d(4, 5) > palm * 0.45,
  };
  const pinchR = d(4, 8) / palm;
  // pinch with hysteresis so it doesn't flicker on the threshold
  st.pinch = st.pinch ? pinchR < 0.5 : pinchR < 0.33;
  const nExt = ext.index + ext.middle + ext.ring + ext.pinky;
  let g;
  if (!ext.middle && !ext.ring && !ext.pinky && d(0, 8) < palm * 1.2 && !st.pinch) g = 'fist';
  else if (st.pinch) g = 'pinch';
  else if (nExt === 4) g = 'open';
  else if (ext.index && !ext.middle && !ext.ring && !ext.pinky) g = 'point';
  else if (nExt === 0) g = 'fist';
  else g = 'other';
  // non-pinch gestures must hold for 2 frames before they count
  if (g !== 'pinch' && g !== st.g) { if (st.cand === g) st.n++; else { st.cand = g; st.n = 1; } if (st.n >= 2) st.g = g; }
  else { st.g = g; st.cand = g; st.n = 0; }
  const M = p => ({ x: t.mirror ? 1 - p.x : p.x, y: p.y, z: p.z });
  return {
    key, lm, palm, pinchR, ext, gesture: st.g || g, pinch: st.pinch,
    spread: d(8, 20) / palm,
    tip: M(lm[8]), thumb: M(lm[4]), wrist: M(lm[0]),
    pinchPt: M({ x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2, z: (lm[4].z + lm[8].z) / 2 }),
    center: M(lm[9]),
  };
}

// small camera picture-in-picture with the hand skeleton on top
export function pip(parent, tracker) {
  const box = document.createElement('div');
  box.className = 'pip';
  const cv = document.createElement('canvas');
  tracker.video.classList.toggle('mirror', tracker.mirror);
  box.append(tracker.video, cv);
  parent.appendChild(box);
  const g = cv.getContext('2d');
  const fit = () => {
    const v = tracker.video;
    box.style.aspectRatio = `${v.videoWidth || 4} / ${v.videoHeight || 3}`;
    const r = box.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  };
  let size = fit();
  tracker.video.addEventListener('loadedmetadata', () => (size = fit()));
  addEventListener('resize', () => (size = fit()));
  return {
    box,
    draw(hands) {
      if (!size.width) size = fit();
      const W = size.width, H = size.height;
      g.clearRect(0, 0, W, H);
      for (const h of hands) {
        const P = h.lm.map(l => ({ x: (tracker.mirror ? 1 - l.x : l.x) * W, y: l.y * H }));
        const c = GESTURE_COLOR[h.gesture] || '#3ce7ff';
        g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath();
        for (const [a, b] of EDGES) { g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); }
        g.stroke();
        g.fillStyle = '#a8f4ff';
        for (const p of P) g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        g.fillStyle = c; g.font = '11px "Share Tech Mono", Sarabun, monospace';
        g.fillText(GESTURE_TH[h.gesture] || '', P[0].x + 4, P[0].y + 12);
      }
    },
  };
}

export const PIP_CSS = `
.pip { position: absolute; width: min(30vw, 220px); background: #000; border: 1px solid var(--line); overflow: hidden; box-shadow: 0 0 14px rgba(60,231,255,.2); }
.pip video, .pip canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
.pip video { opacity: .55; }
`;
