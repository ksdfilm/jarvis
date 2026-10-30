// geometry + signal helpers shared by every mode
export const deg = r => r * 180 / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// interior angle at b (degrees)
export function angle3(a, b, c) {
  const v1 = Math.atan2(a.y - b.y, a.x - b.x), v2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(deg(v1 - v2));
  return d > 180 ? 360 - d : d;
}
// tilt of line a-b against horizontal, -90..90
export function tilt(a, b) {
  let t = deg(Math.atan2(b.y - a.y, b.x - a.x));
  if (t > 90) t -= 180;
  if (t < -90) t += 180;
  return t;
}
// lean of line a->b against vertical, degrees
export const lean = (a, b) => deg(Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));

export const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
export const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
export const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

// uniform resample of (t[], v[]) at fs Hz
export function resample(t, v, fs) {
  const out = [], t0 = t[0], n = Math.floor((t[t.length - 1] - t0) * fs);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = t0 + i / fs;
    while (j < t.length - 2 && t[j + 1] < x) j++;
    const f = (x - t[j]) / ((t[j + 1] - t[j]) || 1);
    out.push(v[j] + (v[j + 1] - v[j]) * clamp(f, 0, 1));
  }
  return out;
}
// remove slow drift with a moving average of `w` samples
export function detrend(s, w) {
  const out = new Array(s.length);
  let acc = 0, q = [];
  for (let i = 0; i < s.length; i++) {
    q.push(s[i]); acc += s[i];
    if (q.length > w) acc -= q.shift();
    out[i] = s[i] - acc / q.length;
  }
  return out;
}
export function smooth(s, w) {
  return s.map((_, i) => { let a = 0, n = 0; for (let k = Math.max(0, i - w); k <= Math.min(s.length - 1, i + w); k++) { a += s[k]; n++; } return a / n; });
}
// strongest frequency in [fmin,fmax] via a Hann-windowed DFT; snr = peak / mean power in band
export function peakFreq(s, fs, fmin, fmax, step = 0.005) {
  const N = s.length, m = mean(s);
  const x = s.map((v, i) => (v - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))));
  let best = 0, bf = 0, total = 0, cnt = 0;
  const spec = [];
  for (let f = fmin; f <= fmax; f += step) {
    let re = 0, im = 0;
    const w = 2 * Math.PI * f / fs;
    for (let i = 0; i < N; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); }
    const p = re * re + im * im;
    spec.push(p); total += p; cnt++;
    if (p > best) { best = p; bf = f; }
  }
  return { freq: bf, snr: best / (total / cnt || 1), spec };
}

// localStorage that never throws
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export function saveResult(mode, title, lines) {
  const h = store.get('bodyscan.history', []);
  h.unshift({ t: Date.now(), mode, title, lines });
  store.set('bodyscan.history', h.slice(0, 60));
}
export const history = mode => store.get('bodyscan.history', []).filter(r => r.mode === mode);

// status helpers: 0 ok, 1 watch, 2 abnormal
export const LV = ['ok', 'warn', 'bad'];
export const LVTH = ['ปกติ', 'เฝ้าระวัง', 'ผิดปกติ'];
export const level = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
