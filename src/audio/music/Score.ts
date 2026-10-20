import { Instruments, TrackBus } from './Instruments';
import { mulberry32 } from '../../core/math';

/**
 * NEON RAIN score: one continuous piece (100 BPM, D minor / dorian colour) built from layers that
 * come and go with an intensity value 0..1. Nothing ever switches tracks: the city's quiet pads are
 * always there; suspicion adds a muted pulse; pursuit adds hats and a syncopated bass motif; combat
 * adds controlled drums and a lead motif, with breaks. Layer changes land on bar lines and ramp over a
 * bar; intensity rises fast and falls slowly, so recovering from a chase peels the layers away.
 */

export const BPM = 100;
const STEP = 60 / BPM / 4;
const BAR = STEP * 16;
const LOOKAHEAD = 0.14;

type LayerId = 'pad' | 'drone' | 'frag' | 'pulse' | 'hats' | 'bass' | 'drums' | 'lead';

interface Layer {
  id: LayerId;
  on: number;
  off: number;
  level: number;
  active: boolean;
  gain: GainNode;
  /** Last scheduled gain target (to avoid re-ramping). */
  target: number;
}

// Harmony: two 8-bar progressions, one chord per two bars.
const PROG_A = [
  { root: 38, pad: [50, 53, 57, 60, 64] }, // Dm9
  { root: 34, pad: [46, 53, 57, 62] }, // B♭maj7
  { root: 43, pad: [43, 50, 53, 57, 58] }, // Gm9
  { root: 45, pad: [45, 52, 57, 62], last: [45, 52, 55, 61] }, // Asus4 → A7
];
const PROG_B = [
  { root: 41, pad: [53, 57, 60, 64, 67] }, // Fmaj9
  { root: 36, pad: [48, 55, 57, 64] }, // C6
  { root: 38, pad: [50, 53, 57, 60, 64] }, // Dm9
  { root: 34, pad: [46, 53, 57, 62], last: [45, 52, 55, 61] }, // B♭maj7 → A7
];
const DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];
// Bass motif (step, interval from root): the recognisable chase figure.
const MOTIF_A: [number, number][] = [[0, 0], [3, 0], [6, 7], [8, 12], [11, 0], [14, 10]];
const MOTIF_B: [number, number][] = [[0, 0], [3, 12], [6, 0], [8, 7], [10, 0], [13, 3], [14, 5]];
// Lead motifs (two bars; [bar, step, semitones above D5=74, len in steps]).
const LEADS: [number, number, number, number][][] = [
  [[0, 0, -5, 3], [0, 3, -2, 3], [0, 6, 0, 2], [0, 8, 2, 6], [0, 14, 0, 2], [1, 0, 3, 6], [1, 8, 2, 4], [1, 12, 0, 4]],
  [[0, 0, 3, 4], [0, 4, 2, 4], [0, 8, 0, 4], [0, 12, -2, 2], [0, 14, -5, 2], [1, 0, -2, 8], [1, 10, 0, 6]],
  [[0, 0, 7, 2], [0, 2, 5, 2], [0, 4, 3, 4], [0, 8, 2, 2], [0, 10, 0, 2], [0, 12, -2, 4], [1, 0, 0, 12]],
];

export class Score {
  private I: Instruments;
  private bus: TrackBus;
  private mix: GainNode;
  private duckGain: GainNode;
  private duckFilter: BiquadFilterNode;
  private limiter: DynamicsCompressorNode;
  private layers: Record<LayerId, Layer>;
  private start = 0;
  private stepN = 0;
  private timer = 0;
  private started = false;
  /** Smoothed intensity actually driving the layers. */
  intensity = 0;
  private target = 0;
  private rnd = mulberry32(2024);
  private padFilter: BiquadFilterNode;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.I = new Instruments(ctx);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -16;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.25;
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.duckGain = ctx.createGain();
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.85;
    this.mix.connect(this.limiter).connect(this.duckFilter).connect(this.duckGain).connect(out);
    const reverb = this.I.makeReverb(this.mix);
    this.bus = new TrackBus(ctx, this.mix, reverb, BPM);
    this.bus.out.gain.value = 1;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1200;
    const mk = (id: LayerId, on: number, off: number, level: number): Layer => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      return { id, on, off, level, active: false, gain, target: 0 };
    };
    this.layers = {
      pad: mk('pad', -1, -2, 1),
      drone: mk('drone', -1, -2, 0.7),
      frag: mk('frag', -1, -2, 0.9),
      pulse: mk('pulse', 0.26, 0.17, 0.8),
      hats: mk('hats', 0.5, 0.38, 0.7),
      bass: mk('bass', 0.56, 0.44, 0.85),
      drums: mk('drums', 0.72, 0.58, 0.8),
      lead: mk('lead', 0.82, 0.68, 0.75),
    };
    // Each layer's instruments route through its own gain into the right part of the strip.
    this.layers.pad.gain.connect(this.padFilter).connect(this.bus.synth);
    this.layers.drone.gain.connect(this.bus.bass);
    this.layers.frag.gain.connect(this.bus.lead);
    this.layers.pulse.gain.connect(this.bus.bass);
    this.layers.hats.gain.connect(this.bus.drums);
    this.layers.bass.gain.connect(this.bus.bass);
    this.layers.drums.gain.connect(this.bus.drums);
    this.layers.lead.gain.connect(this.bus.lead);
  }

  /** Fake buses so instruments built for TrackBus play into a layer gain. */
  private sub(layer: LayerId): TrackBus {
    const g = this.layers[layer].gain;
    return { ...this.bus, drums: g, synth: g, bass: g, lead: g, side: g, duck: (t: number, d: number, r: number) => this.bus.duck(t, d, r) } as unknown as TrackBus;
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.start = this.ctx.currentTime + 0.15;
    this.stepN = 0;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Stops / restarts the note scheduler (hidden tab: no timer at all). */
  setSuspended(on: boolean) {
    if (!this.started) return;
    window.clearInterval(this.timer);
    if (!on) this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Desired intensity (0..1); smoothing happens per frame in `update`. */
  set(target: number) {
    this.target = Math.max(0, Math.min(1, target));
  }

  /** Called every frame: fast rise, slow fall. */
  update(dt: number) {
    const k = this.target > this.intensity ? 1 - Math.exp(-dt / 1.5) : 1 - Math.exp(-dt / 10);
    this.intensity += (this.target - this.intensity) * k;
  }

  setDuck(on: boolean) {
    const t = this.ctx.currentTime;
    this.duckGain.gain.setTargetAtTime(on ? 0.32 : 1, t, 0.12);
    this.duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, t, 0.12);
  }

  /** Layers currently audible. */
  audible(): LayerId[] {
    return (Object.values(this.layers) as Layer[]).filter((l) => l.target > 0.01).map((l) => l.id);
  }

  private tick() {
    const now = this.ctx.currentTime;
    while (this.start + this.stepN * STEP < now + LOOKAHEAD) {
      const t = this.start + this.stepN * STEP;
      if (t > now - 0.05) this.play(this.stepN, t);
      this.stepN++;
    }
  }

  /** Layer on/off with hysteresis, applied at bar lines with a one-bar ramp. */
  private barLayers(t: number) {
    const x = this.intensity;
    for (const l of Object.values(this.layers) as Layer[]) {
      if (l.on < 0) l.active = true;
      else if (!l.active && x >= l.on) l.active = true;
      else if (l.active && x < l.off) l.active = false;
      let want = l.active ? l.level : 0;
      // Calm layers recede under a full fight (they never vanish entirely, the city is still there).
      if (l.id === 'frag') want = l.level * (1 - smooth(0.3, 0.6, x)) * 0.9 + 0.08;
      if (l.id === 'pad') want = l.level * (0.75 + 0.25 * (1 - x));
      if (l.id === 'drone') want = l.level * (0.35 + 0.65 * smooth(0.15, 0.6, x));
      if (Math.abs(want - l.target) < 0.01) continue;
      l.target = want;
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setValueAtTime(l.gain.gain.value, t);
      l.gain.gain.linearRampToValueAtTime(want, t + BAR);
    }
    this.padFilter.frequency.setTargetAtTime(700 + 1700 * x, t, BAR);
  }

  private play(n: number, t: number) {
    const step = n % 16;
    const barN = Math.floor(n / 16);
    const bar16 = barN % 16;
    const prog = bar16 < 8 ? PROG_A : PROG_B;
    const ci = Math.floor((bar16 % 8) / 2);
    const chordInfo = prog[ci];
    const lastBar = bar16 % 2 === 1 && ci === 3;
    const chord = lastBar && chordInfo.last ? chordInfo.last : chordInfo.pad;
    const root = chordInfo.root;
    const I = this.I;
    const L = this.layers;
    if (step === 0) this.barLayers(t);
    const on = (id: LayerId) => L[id].target > 0.01 || L[id].gain.gain.value > 0.01;

    // Pad: one chord per two bars (the A→A7 turn gets its own bar).
    if (step === 0 && (bar16 % 2 === 0 || lastBar)) I.pad(this.sub('pad'), t, chord, (lastBar || ci === 3 ? BAR : BAR * 2) - 0.15, 0.9, 1600);
    // Drone: low root, long.
    if (step === 0 && bar16 % 2 === 0 && on('drone')) I.bass(this.sub('drone'), t, root - 12, BAR * 2 - 0.2, 0.55, { cutoff: 160, env: 60, detune: 4 });
    // Fragments: a few notes now and then, from the scale and the chord, through the long delay.
    if (on('frag') && step % 2 === 0) {
      const r = this.rnd();
      const busy = 0.1 + 0.08 * (1 - this.intensity);
      if (r < busy) {
        const pool = r < busy * 0.5 ? chord.map((c) => c + 12) : DORIAN;
        const note = pool[Math.floor(this.rnd() * pool.length)];
        I.pluck(this.sub('frag'), t, note, 0.55 + this.rnd() * 0.3, { type: 'triangle', cutoff: 2600, decay: 0.6, delay: 0.85 });
      }
    }
    // Suspicion pulse: muted eighths on the root, accent on the bar.
    if (on('pulse') && step % 2 === 0) {
      I.bass(this.sub('pulse'), t, root, STEP * 1.2, step === 0 ? 0.65 : 0.4, { cutoff: 240, env: 220, detune: 6 });
    }
    // Pursuit: hats and the bass motif.
    const breakBar = bar16 % 8 === 7 && step >= 8;
    if (on('hats') && !breakBar) {
      const accent = step % 4 === 2;
      I.hat(this.sub('hats'), t, accent ? 0.7 : step % 2 ? 0.32 : 0.48, step === 14 && barN % 2 === 1);
      if (step % 8 === 4) I.shaker(this.sub('hats'), t, 0.6);
    }
    if (on('bass')) {
      const motif = barN % 4 < 2 ? MOTIF_A : MOTIF_B;
      for (const [s, iv] of motif) if (s === step) I.bass(this.sub('bass'), t, root + iv, STEP * (s === 0 ? 2.2 : 1.4), s === 0 ? 0.95 : 0.75, { cutoff: 360, env: 1100 });
    }
    // Combat drums: kick/snare with variation and a break every eight bars.
    if (on('drums')) {
      const pattern = barN % 2 === 0 ? [0, 7, 10] : [0, 8, 11];
      const drumBreak = bar16 % 8 === 7;
      if (!drumBreak && pattern.includes(step)) {
        const busB = this.sub('drums');
        I.kick(busB, t, step === 0 ? 0.9 : 0.65, { pump: 0.25, release: 0.25 });
      }
      if (!drumBreak && (step === 4 || step === 12)) {
        I.snare(this.sub('drums'), t, 0.62, 190, 0.2);
        if (this.intensity > 0.88) I.clap(this.sub('drums'), t, 0.4);
      }
      if (drumBreak && step >= 12) I.tom(this.sub('drums'), t, [196, 165, 131, 110][step - 12], 0.5);
      if (bar16 % 8 === 0 && step === 0) I.crash(this.sub('drums'), t, 0.55);
    }
    // Lead: a two-bar motif every other phrase, varied each time.
    if (on('lead') && barN % 4 < 2) {
      const v = LEADS[Math.floor(barN / 4) % LEADS.length];
      const shift = root === 34 || root === 41 ? -2 : root === 43 || root === 45 ? 0 : 0;
      for (const [b, s, iv, len] of v) {
        if (b === barN % 2 && s === step) I.lead(this.sub('lead'), t, 74 + iv + shift, len * STEP, 0.6, { glide: 0.05, cutoff: 2400, vibrato: 0.8 });
      }
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
