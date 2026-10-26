/*
  63.0, the sound effects' workbench: plain sample-level DSP on Float32Arrays (no Web Audio, no
  allocation per sample), so a sound is designed as layers the way a sound designer stacks them
  (a transient, a body, a low thump, a mechanism, a tail, resonances, debris) and rendered once into a
  buffer (SfxBank) instead of being patched together from oscillators on every shot. Deterministic for
  a seed: the same variant sounds the same; the variants differ.
*/

/** A small seeded generator (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  /** -1 … 1. */
  bi() {
    return this.next() * 2 - 1;
  }
}

export const secs = (s: number, sr: number) => new Float32Array(Math.max(1, Math.ceil(s * sr)));

/** White, pink (Paul Kellet's filter) or brown noise. */
export function noise(len: number, rng: Rng, color: 'white' | 'pink' | 'brown' = 'white') {
  const x = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < len; i++) {
    const w = rng.bi();
    if (color === 'white') x[i] = w;
    else if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      br = (br + 0.02 * w) / 1.02;
      x[i] = br * 3.5;
    }
  }
  return x;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peak';

/**
 * A biquad (RBJ cookbook) over `x` in place; the cutoff glides exponentially from `f` to `fEnd` over
 * `glide` s (coefficients updated every 32 samples). `gainDb` for the peaking type.
 */
export function filter(x: Float32Array, type: FilterType, f: number, q: number, sr: number, fEnd?: number, glide?: number, gainDb = 0) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  const T = glide ?? x.length / sr;
  const coef = (fc: number) => {
    const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), alpha = sn / (2 * q);
    let n0, n1, n2, d0, d1, d2;
    if (type === 'lowpass') {
      n0 = (1 - cs) / 2; n1 = 1 - cs; n2 = (1 - cs) / 2; d0 = 1 + alpha; d1 = -2 * cs; d2 = 1 - alpha;
    } else if (type === 'highpass') {
      n0 = (1 + cs) / 2; n1 = -(1 + cs); n2 = (1 + cs) / 2; d0 = 1 + alpha; d1 = -2 * cs; d2 = 1 - alpha;
    } else if (type === 'bandpass') {
      n0 = alpha; n1 = 0; n2 = -alpha; d0 = 1 + alpha; d1 = -2 * cs; d2 = 1 - alpha;
    } else {
      const A = Math.pow(10, gainDb / 40);
      n0 = 1 + alpha * A; n1 = -2 * cs; n2 = 1 - alpha * A; d0 = 1 + alpha / A; d1 = -2 * cs; d2 = 1 - alpha / A;
    }
    b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = d1 / d0; a2 = d2 / d0;
  };
  coef(f);
  for (let i = 0; i < x.length; i++) {
    if (fEnd && (i & 31) === 0) coef(f * Math.pow(fEnd / f, Math.min(1, i / sr / T)));
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/**
 * An amplitude envelope in place: a linear rise over `attack` s, then an exponential fall reaching
 * -60 dB at `t60` s after the peak; `hold` s at the peak between them.
 */
export function env(x: Float32Array, attack: number, t60: number, sr: number, hold = 0) {
  const k = 6.9078 / Math.max(1e-4, t60);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const g = t < attack ? t / attack : t < attack + hold ? 1 : Math.exp(-k * (t - attack - hold));
    x[i] *= g;
  }
  return x;
}

/** A sine whose pitch glides exponentially from `f0` to `f1` over `glide` s. */
export function sweep(len: number, f0: number, f1: number, glide: number, sr: number) {
  const x = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, t / glide));
    ph += (2 * Math.PI * f) / sr;
    x[i] = Math.sin(ph);
  }
  return x;
}

/** Damped modes (frequency Hz, amplitude, -60 dB time s): a struck object's ring. */
export function modes(len: number, partials: readonly [number, number, number][], sr: number, rng?: Rng) {
  const x = new Float32Array(len);
  for (const [f0, a, t60] of partials) {
    const f = rng ? f0 * rng.range(0.97, 1.03) : f0;
    const k = 6.9078 / t60, ph0 = rng ? rng.range(0, 6.28) : 0;
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const e = Math.exp(-k * t);
      if (e < 1e-4) break;
      x[i] += a * e * Math.sin(ph0 + w * i);
    }
  }
  return x;
}

/** Soft clip (tanh), normalised so full scale stays full scale. */
export function sat(x: Float32Array, drive: number) {
  const n = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / n;
  return x;
}

/** Adds `x` × `gain` into `out` from `at` s. */
export function mix(out: Float32Array, x: Float32Array, at: number, gain: number, sr: number) {
  const o = Math.round(at * sr);
  const n = Math.min(x.length, out.length - o);
  for (let i = 0; i < n; i++) out[o + i] += x[i] * gain;
  return out;
}

/**
 * Debris: `n` grains (tiny noise bursts through a band at a random frequency in `fLo`…`fHi`, each
 * 1.5–`len` ms) scattered over `spread` s from `at`, thinning out; sand, grit, chips, splinters, shards.
 */
export function grains(out: Float32Array, rng: Rng, sr: number, o: { n: number; at: number; spread: number; fLo: number; fHi: number; amp: number; len?: number; q?: number }) {
  const maxLen = (o.len ?? 6) / 1000;
  for (let g = 0; g < o.n; g++) {
    const u = rng.next();
    const t = o.at + o.spread * u * u;
    const L = Math.max(0.0015, maxLen * rng.range(0.25, 1));
    const x = noise(Math.ceil(L * sr), rng);
    filter(x, 'bandpass', rng.range(o.fLo, o.fHi), o.q ?? 2.5, sr);
    env(x, 0.0004, L, sr);
    mix(out, x, t, o.amp * rng.range(0.4, 1) * (1 - 0.6 * u), sr);
  }
  return out;
}

/** Early reflections: `taps` delayed, filtered copies (a hint of a place, before the engine's reverb). */
export function reflect(out: Float32Array, sr: number, taps: readonly [number, number][], lp = 2500) {
  const src = Float32Array.from(out);
  for (const [d, g] of taps) {
    const y = Float32Array.from(src);
    filter(y, 'lowpass', lp, 0.7, sr);
    mix(out, y, d, g, sr);
  }
  return out;
}

/** The finish: DC out (a 25 Hz highpass), the last 8 ms faded, the peak to `peak`. */
export function finish(x: Float32Array, sr: number, peak = 0.9) {
  filter(x, 'highpass', 25, 0.7, sr);
  const f = Math.min(x.length, Math.round(0.008 * sr));
  for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}
