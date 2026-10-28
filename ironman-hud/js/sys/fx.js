// เอฟเฟกต์: เสียง HUD (สร้างด้วย Web Audio ไม่ใช้ไฟล์เสียง) + พื้นหลังอนุภาคโฮโลแกรม (ขยับตามการเอียงมือถือ/เมาส์)
let ctx, ac = null, master = null;

// ---------- เสียง ----------
function audio() {
  if (!ctx.store.get('sfx', true)) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.09;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
/** เสียงสั้นหนึ่งเสียง: ความถี่เริ่ม→จบ, ระยะเวลา, รูปคลื่น */
function tone(f0, f1, dur, type = 'sine', when = 0, vol = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const SOUNDS = {
  tap:    () => tone(1800, 1400, 0.05, 'triangle', 0, 0.6),
  tick:   () => tone(2600, 2400, 0.025, 'square', 0, 0.15),
  panel:  () => { tone(500, 1200, 0.12, 'sine'); tone(1200, 1800, 0.08, 'triangle', 0.06, 0.5); },
  open:   () => { tone(660, 660, 0.12, 'sine', 0, 0.7); tone(990, 990, 0.12, 'sine', 0.07, 0.6); tone(1320, 1320, 0.16, 'sine', 0.14, 0.5); },
  close:  () => tone(900, 300, 0.14, 'sine', 0, 0.6),
  ok:     () => { tone(880, 880, 0.08, 'sine'); tone(1320, 1320, 0.14, 'sine', 0.08); },
  error:  () => { tone(220, 180, 0.15, 'sawtooth', 0, 0.5); tone(180, 140, 0.18, 'sawtooth', 0.12, 0.5); },
  boot:   () => { for (let i = 0; i < 6; i++) tone(300 + i * 160, 320 + i * 170, 0.09, 'triangle', i * 0.11, 0.45); tone(1400, 2200, 0.5, 'sine', 0.7, 0.5); },
  alarm:  () => { for (let i = 0; i < 6; i++) tone(i % 2 ? 1046 : 1318, i % 2 ? 1046 : 1318, 0.18, 'square', i * 0.22, 0.5); },
};
export function play(name) { try { SOUNDS[name]?.(); } catch { /* เสียงไม่ใช่เรื่องสำคัญ */ } }

// ---------- พื้นหลังอนุภาค ----------
const cv = document.createElement('canvas');
cv.className = 'fx-particles';
cv.setAttribute('aria-hidden', 'true');
let g2, W = 0, H = 0, pts = [], color = '63, 216, 255', tilt = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 }, raf = 0, last = 0;

function size() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.round(Math.min(70, (W * H) / 16000));
  pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15 }));
}
function draw(t) {
  raf = requestAnimationFrame(draw);
  if (t - last < 33 || document.hidden) return; // ~30fps
  last = t;
  tilt.x += (tiltT.x - tilt.x) * 0.08; tilt.y += (tiltT.y - tilt.y) * 0.08;
  g2.clearRect(0, 0, W, H);
  for (const p of pts) {
    p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H;
    p.sx = p.x + tilt.x * 40 * p.z; p.sy = p.y + tilt.y * 40 * p.z;
  }
  g2.lineWidth = 0.6;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    for (let j = i + 1; j < pts.length; j++) {
      const b = pts[j], d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      if (d < 110) { g2.strokeStyle = `rgba(${color}, ${0.16 * (1 - d / 110)})`; g2.beginPath(); g2.moveTo(a.sx, a.sy); g2.lineTo(b.sx, b.sy); g2.stroke(); }
    }
    g2.fillStyle = `rgba(${color}, ${0.25 + a.z * 0.45})`;
    g2.beginPath(); g2.arc(a.sx, a.sy, 0.6 + a.z * 1.4, 0, Math.PI * 2); g2.fill();
  }
}
function syncColor() { color = getComputedStyle(document.body).getPropertyValue('--hud-rgb').trim() || color; }
export function setParticles(on) {
  ctx.store.set('particles', on);
  cancelAnimationFrame(raf);
  cv.hidden = !on;
  if (on && !ctx.reduceMotion) { size(); raf = requestAnimationFrame(draw); }
}

// เอียงมือถือ → พื้นหลังขยับ (iPhone ต้องขออนุญาตจากการแตะของผู้ใช้)
function onOrient(e) {
  if (e.gamma == null) return;
  tiltT.x = Math.max(-1, Math.min(1, e.gamma / 30));
  tiltT.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
}
export async function enableTilt() {
  const D = window.DeviceOrientationEvent;
  if (!D) return false;
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
  } catch { return false; }
  addEventListener('deviceorientation', onOrient);
  ctx.store.set('tilt', true);
  return true;
}

export default {
  init(c) {
    ctx = c;
    g2 = cv.getContext('2d');
    document.body.prepend(cv);
    addEventListener('resize', () => { if (!cv.hidden) size(); });
    addEventListener('hud:theme', syncColor);
    addEventListener('mousemove', (e) => { tiltT.x = (e.clientX / innerWidth - 0.5) * 1.2; tiltT.y = (e.clientY / innerHeight - 0.5) * 1.2; });
    syncColor();
    setParticles(ctx.store.get('particles', true));
    // เคยอนุญาตแล้ว: Android/คอมฟังได้เลย, iPhone ต้องขอใหม่ทุกครั้งที่เปิดแอป (ทำจากปุ่มในตั้งค่า)
    if (ctx.store.get('tilt', false) && typeof window.DeviceOrientationEvent?.requestPermission !== 'function') addEventListener('deviceorientation', onOrient);
    // เปิดเสียงได้หลังผู้ใช้แตะครั้งแรก (นโยบายเบราว์เซอร์) + เสียงคลิกทุกปุ่ม
    addEventListener('pointerdown', () => audio(), { once: true, capture: true });
    document.addEventListener('click', (e) => { if (e.target.closest('button, a, select, .dial-item')) play('tap'); }, true);
  },
};
