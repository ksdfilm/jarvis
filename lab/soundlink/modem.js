// 16-FSK acoustic modem (no DOM, testable in node)
// frame: [A A B B] preamble · len · payload bytes · crc8   — every byte = 2 symbols (hi, lo nibble)
export const MODES = {
  audible: { name: 'R2-D2 (ได้ยิน)', base: 1875, step: 187.5, A: 1500, B: 5250 },
  ultra: { name: 'เงียบ (17–20 kHz)', base: 17062.5, step: 187.5, A: 16687.5, B: 20250 },
};
export const tones = m => Array.from({ length: 16 }, (_, i) => m.base + i * m.step);

export function crc8(bytes) {
  let c = 0;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; }
  return c;
}

// bytes → audio samples
export function encode(bytes, { mode = MODES.audible, fs = 48000, sym = 0.06, gain = 0.6 } = {}) {
  if (bytes.length > 200) throw new Error('ข้อความยาวเกินไป (สูงสุด 200 ไบต์)');
  const data = [bytes.length, ...bytes, crc8(bytes)];
  const T = tones(mode), seq = [mode.A, mode.A, mode.B, mode.B];
  for (const b of data) seq.push(T[b >> 4], T[b & 15]);
  const S = Math.round(sym * fs), ramp = Math.round(0.006 * fs);
  const out = new Float32Array(seq.length * S + fs * 0.1);
  let ph = 0;
  seq.forEach((f, k) => {
    for (let i = 0; i < S; i++) {
      const env = i < ramp ? 0.5 - 0.5 * Math.cos(Math.PI * i / ramp) : i > S - ramp ? 0.5 - 0.5 * Math.cos(Math.PI * (S - i) / ramp) : 1;
      ph += 2 * Math.PI * f / fs;
      out[k * S + i] = gain * env * Math.sin(ph);
    }
  });
  return out;
}

export function goertzel(x, start, len, f, fs) {
  const w = 2 * Math.PI * f / fs, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = start; i < start + len; i++) {
    // Hann window keeps neighbouring tones apart
    const s0 = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - start) / (len - 1))) + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

// streaming decoder: feed(samples) → emits onMessage(bytes) / onError(reason)
export class Decoder {
  constructor({ mode = MODES.audible, fs = 48000, sym = 0.06, onMessage, onError, onLevel } = {}) {
    Object.assign(this, { mode, fs, onMessage, onError, onLevel });
    this.T = tones(mode);
    this.S = Math.round(sym * fs); this.H = Math.round(this.S / 6); this.W = Math.round(this.S / 2);
    this.buf = new Float32Array(fs * 30); this.n = 0; // rolling buffer (absolute sample index = this.off + i)
    this.off = 0; this.pos = 0; // next hop end (absolute)
    this.state = 'idle'; this.runA = 0; this.sync = 0;
  }
  at(abs) { return abs - this.off; }
  feed(chunk) {
    if (this.n + chunk.length > this.buf.length) { // drop old samples
      const keep = this.state === 'idle' ? this.W * 2 : this.n - Math.max(0, this.at(this.sync) - this.S * 3);
      const drop = this.n - Math.min(keep, this.n);
      this.buf.copyWithin(0, drop, this.n); this.n -= drop; this.off += drop;
    }
    this.buf.set(chunk, this.n); this.n += chunk.length;
    if (!this.pos) this.pos = this.off + this.W;
    while (this.at(this.pos) <= this.n) { this.hop(); this.pos += this.H; }
  }
  power(absStart, len, f) { return goertzel(this.buf, this.at(absStart), len, f, this.fs); }
  hop() {
    const { W, S, fs, mode } = this, st = this.pos - W;
    if (this.state === 'data') return this.tryData();
    const pa = this.power(st, W, mode.A), pb = this.power(st, W, mode.B);
    let pd = 0; for (const f of [this.T[0], this.T[5], this.T[10], this.T[15]]) pd += this.power(st, W, f) / 4;
    this.onLevel?.({ a: pa, b: pb, d: pd });
    const strong = p => p > 6 * (pd + 1e-9) && p > 1e-6 * W * W;
    if (strong(pa) && pa > 4 * pb) this.runA += this.H;
    else if (strong(pb) && pb > 4 * pa && this.runA >= 0.9 * S) {
      // first hop whose window is mostly B → B started about half a window ago
      this.sync = this.pos - W / 2; this.state = 'data'; this.runA = 0;
      this.data = null; this.need = 2;
    } else if (!strong(pa)) this.runA = 0;
  }
  symbol(k) { // k-th data symbol after the preamble → nibble
    const { S } = this, c = this.sync + 2 * S + k * S + S / 2, len = Math.round(S * 0.6);
    let best = 0, bp = -1;
    this.T.forEach((f, i) => { const p = this.power(Math.round(c - len / 2), len, f); if (p > bp) { bp = p; best = i; } });
    return best;
  }
  tryData() {
    const avail = this.n + this.off - (this.sync + 2 * this.S);
    if (avail < this.need * this.S) return;
    const nib = [];
    for (let k = 0; k < this.need; k++) nib.push(this.symbol(k));
    const bytes = []; for (let k = 0; k < nib.length; k += 2) bytes.push(nib[k] * 16 + nib[k + 1]);
    if (this.need === 2) { this.need = 2 * (bytes[0] + 2); if (bytes[0] === 0) return this.reset('ความยาวผิด'); return; }
    const len = bytes[0], payload = bytes.slice(1, 1 + len), crc = bytes[1 + len];
    if (crc8(payload) === crc) this.onMessage?.(new Uint8Array(payload));
    else this.onError?.('ข้อมูลเสีย (CRC ไม่ตรง) — ลองส่งใหม่/เข้าใกล้ขึ้น');
    this.reset();
  }
  reset(err) { if (err) this.onError?.(err); this.state = 'idle'; this.runA = 0; this.pos = this.off + this.n; }
}
