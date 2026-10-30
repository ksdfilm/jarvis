// Sonar DSP — FMCW ultrasonic echo ranging (no DOM, testable in node)
// TX: phase-continuous triangular chirp f0→f1→f0, one period = N samples, played on loop.
// RX: each frame of N mic samples (aligned to the TX period) is matched-filtered against the
// chirp in the frequency domain → complex echo profile over delay. Delay → distance.
export const C = 343; // speed of sound m/s

// in-place radix-2 complex FFT
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function makeChirp(fs, N = 2048, f0 = 18000, f1 = 21000) {
  // up-sweep only (an up-down sweep has a range ambiguity ghost at ~N/4). The frequency jump at the
  // loop point happens under a short cosine fade, so it doesn't click.
  const k = (f1 - f0) / N, F = 48;
  const phase = u => 2 * Math.PI / fs * (f0 * u + k * u * u / 2);
  const env = u => (u < F ? 0.5 - 0.5 * Math.cos(Math.PI * u / F) : u > N - F ? 0.5 - 0.5 * Math.cos(Math.PI * (N - u) / F) : 1);
  const at = u => { u = ((u % N) + N) % N; return env(u) * Math.sin(phase(u)); };
  const tx = new Float32Array(N);
  for (let i = 0; i < N; i++) tx[i] = at(i);
  return { tx, f0, f1, N, fs, at };
}

export class Sonar {
  constructor(fs, { N = 2048, f0 = 18000, f1 = 21000, maxRange = 4 } = {}) {
    this.fs = fs; this.N = N;
    this.chirp = makeChirp(fs, N, f0, f1);
    this.perMeter = 2 * fs / C; // delay samples per metre of range
    this.setRange(maxRange);
    // matched filter, analytic (positive band only) → complex output whose phase tracks tiny motion
    const re = Float64Array.from(this.chirp.tx), im = new Float64Array(N);
    fft(re, im);
    this.hr = new Float64Array(N); this.hi = new Float64Array(N);
    const lo = Math.floor((this.chirp.f0 - 500) * N / fs), hi = Math.ceil((this.chirp.f1 + 500) * N / fs);
    for (let k = lo; k <= hi && k < N / 2; k++) { this.hr[k] = 2 * re[k]; this.hi[k] = -2 * im[k]; }
    this.re = new Float64Array(N); this.im = new Float64Array(N);
    this.L = null; // delay index of the direct speaker→mic path (range 0)
    this.calib = { n: 0, sum: new Float64Array(N) };
    this.prevR = null; this.prevI = null;
    this.noise = null; this.motion = null; this.mag = null;
    this.frame = 0;
  }
  setRange(m) {
    this.maxRange = m;
    this.D = Math.min(this.N - 64, Math.round(m * this.perMeter)); // usable delays
    this.cell = Math.max(1, Math.round(0.025 * this.perMeter)); // 2.5 cm cells
    this.cells = Math.floor(this.D / this.cell);
    this.noise = null; this.motion = null;
  }
  rangeOf(cell) { return (cell + 0.5) * this.cell / this.perMeter; }
  reset() { this.L = null; this.calib = { n: 0, sum: new Float64Array(this.N) }; this.noise = null; this.motion = null; this.prevR = null; }

  // one frame of N mic samples → { ready, mag[cells], motion[cells], snr[cells], re/im at delay d via this.P(d) }
  process(frame) {
    const { N, re, im, hr, hi } = this;
    for (let i = 0; i < N; i++) { re[i] = frame[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N; k++) { const a = re[k], b = im[k]; re[k] = a * hr[k] - b * hi[k]; im[k] = a * hi[k] + b * hr[k]; }
    fft(re, im, true);
    this.frame++;

    if (this.L == null) { // calibrate: strongest average peak = direct path
      for (let i = 0; i < N; i++) this.calib.sum[i] += Math.hypot(re[i], im[i]);
      if (++this.calib.n >= 24) {
        let best = 0;
        for (let i = 1; i < N; i++) if (this.calib.sum[i] > this.calib.sum[best]) best = i;
        this.L = best;
        this.direct = this.calib.sum[best] / this.calib.n;
        this.floor = this.calib.sum.reduce((a, b) => a + b, 0) / N / this.calib.n;
      }
      return { ready: false, progress: this.calib.n / 24 };
    }

    // speaker and mic clocks drift apart slowly (different devices, or resampling): follow the direct
    // path's peak, and rotate every echo by the direct path's phase so static things stay static
    let best = this.L, bm = 0;
    for (let o = -12; o <= 12; o++) { const j = (this.L + o + N) % N, m = re[j] * re[j] + im[j] * im[j]; if (m > bm) { bm = m; best = j; } }
    if (best !== this.L) { this.L = best; this.prevR = null; }
    const { D, cell, cells, L } = this;
    const m0 = Math.sqrt(bm) || 1, cr = re[L] / m0, ci = -im[L] / m0;
    const pr = new Float32Array(D), pi = new Float32Array(D);
    for (let d = 0; d < D; d++) { const j = (L + d) % N; pr[d] = re[j] * cr - im[j] * ci; pi[d] = re[j] * ci + im[j] * cr; }
    const mag = new Float32Array(cells), mot = new Float32Array(cells);
    for (let c = 0; c < cells; c++) {
      let m = 0, v = 0;
      const comp = Math.pow(this.rangeOf(c) + 0.15, 1.5); // echoes fade with distance
      for (let d = c * cell; d < (c + 1) * cell; d++) {
        m = Math.max(m, Math.hypot(pr[d], pi[d]));
        if (this.prevR) v = Math.max(v, Math.hypot(pr[d] - this.prevR[d], pi[d] - this.prevI[d]));
      }
      mag[c] = m; mot[c] = v * comp;
    }
    this.prevR = pr; this.prevI = pi;
    this.pr = pr; this.pi = pi;
    if (!this.noise) {
      if (this.frame - this.calib.n < 3) return { ready: false, progress: 1 }; // need a previous frame for motion
      this.noise = Float32Array.from(mot, v => v || 1e-6); this.motion = new Float32Array(cells);
    }
    const snr = new Float32Array(cells);
    for (let c = 0; c < cells; c++) {
      const n = this.noise[c], m = mot[c];
      // noise floor follows quiet frames quickly, loud frames very slowly
      this.noise[c] = n + (m < 2.5 * n ? 0.02 : 0.0008) * (m - n);
      this.motion[c] = this.motion[c] * 0.55 + m * 0.45;
      snr[c] = this.motion[c] / (this.noise[c] || 1e-9);
    }
    this.mag = mag;
    return { ready: true, mag, snr };
  }

  // contiguous cells above threshold → targets [{r, s}]
  targets(snr, thr = 4, minR = 0.18) {
    const out = [];
    let cur = null, gap = 0;
    for (let c = 0; c < snr.length; c++) {
      const r = this.rangeOf(c);
      if (r < minR) continue;
      if (snr[c] > thr) {
        if (!cur) cur = { r, s: snr[c], c0: c };
        else if (snr[c] > cur.s) { cur.s = snr[c]; cur.r = r; }
        gap = 0;
      } else if (cur && ++gap > 3) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    // merge echoes closer than 35 cm (one body gives several reflections)
    const merged = [];
    for (const t of out) {
      const m = merged[merged.length - 1];
      if (m && t.r - m.r < 0.35) { if (t.s > m.s) { m.r = t.r; m.s = t.s; } }
      else merged.push({ r: t.r, s: t.s });
    }
    // range sidelobes of a strong mover look like weak movers nearby — keep echoes ≥ 15% of the strongest
    const top = Math.max(0, ...merged.map(m => m.s));
    return merged.filter(m => m.s >= top * 0.15);
  }
}

// keeps targets alive across frames so a person who pauses briefly isn't dropped
export class Tracker {
  constructor() { this.tracks = []; this.next = 1; }
  update(targets, t) {
    for (const tr of this.tracks) tr.hit = false;
    for (const g of [...targets].sort((a, b) => b.s - a.s)) {
      let best = null, bd = 0.3;
      for (const tr of this.tracks) { const d = Math.abs(tr.r - g.r); if (!tr.hit && d < bd) { bd = d; best = tr; } }
      if (best) { best.r = best.r * 0.6 + g.r * 0.4; best.s = g.s; best.last = t; best.hit = true; best.hist.push([t, g.r]); }
      else this.tracks.push({ id: this.next++, r: g.r, s: g.s, born: t, last: t, hit: true, hist: [[t, g.r]] });
    }
    for (const tr of this.tracks) tr.hist = tr.hist.filter(h => t - h[0] < 1.5);
    this.tracks = this.tracks.filter(tr => t - tr.last < 1.6);
    return this.tracks.filter(tr => t - tr.born > 0.35 && t - tr.last < 1.2).sort((a, b) => a.r - b.r);
  }
}

// breathing: keep the complex echo of near cells over time; the cell whose echo moves back and forth
// at 0.1–0.6 Hz is the chest (phase change = 4π·displacement/λ).
export class Breath {
  constructor(sonar, fps, { r0 = 0.2, r1 = 1.6, seconds = 24 } = {}) {
    this.s = sonar; this.fps = fps; this.len = Math.round(fps * seconds);
    const d0 = Math.round(r0 * sonar.perMeter), d1 = Math.min(sonar.D - 1, Math.round(r1 * sonar.perMeter));
    this.ds = []; for (let d = d0; d <= d1; d += 3) this.ds.push(d);
    this.re = this.ds.map(() => new Float32Array(this.len));
    this.im = this.ds.map(() => new Float32Array(this.len));
    this.n = 0;
  }
  push() {
    const i = this.n % this.len;
    this.ds.forEach((d, k) => { this.re[k][i] = this.s.pr[d]; this.im[k][i] = this.s.pi[d]; });
    this.n++;
  }
  series(k) { // chronological unwrapped echo phase for one delay (∝ displacement)
    const L = Math.min(this.n, this.len), start = this.n - L;
    const x = new Float64Array(L), y = new Float64Array(L);
    for (let j = 0; j < L; j++) { const i = (start + j) % this.len; x[j] = this.re[k][i]; y[j] = this.im[k][i]; }
    const out = new Float64Array(L);
    let prev = 0, acc = 0;
    for (let j = 0; j < L; j++) {
      const p = Math.atan2(y[j], x[j]);
      let d = j ? p - prev : 0;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      acc += d; prev = p; out[j] = acc;
    }
    return out;
  }
  // → { rpm, range, quality, wave } or null
  estimate() {
    if (this.n < this.fps * 12) return null;
    const dec = Math.max(1, Math.round(this.fps / 5)), fs = this.fps / dec; // ~5 Hz is plenty
    let best = null;
    this.ds.forEach((d, k) => {
      const raw = this.series(k), m = Math.floor(raw.length / dec), s = new Float64Array(m);
      for (let j = 0; j < m; j++) { let a = 0; for (let q = 0; q < dec; q++) a += raw[j * dec + q]; s[j] = a / dec; }
      // spectrum 0.05–2 Hz; breathing band 0.1–0.6 Hz must dominate
      let bandP = 0, bandF = 0, total = 0;
      for (let f = 0.05; f <= 2; f += 0.01) {
        let re = 0, im = 0; const w = 2 * Math.PI * f / fs;
        for (let j = 0; j < m; j++) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (m - 1)); re += s[j] * h * Math.cos(w * j); im -= s[j] * h * Math.sin(w * j); }
        const p = re * re + im * im; total += p;
        if (f >= 0.1 && f <= 0.6 && p > bandP) { bandP = p; bandF = f; }
      }
      const q = bandP / (total / 196 || 1);
      if (!best || q > best.q) best = { q, f: bandF, d, wave: s };
    });
    if (!best || best.q < 8) return { rpm: null, quality: best?.q || 0 };
    return { rpm: best.f * 60, range: best.d / this.s.perMeter, quality: best.q, wave: best.wave };
  }
}
