import { Instruments, TrackBus } from './Instruments';
import { mulberry32 } from '../../core/math';

/*
  Procedural placeholder themes (9.0): one per setting plus the menu, each a layered loop that
  follows the combat intensity like the Tokyo score (5.x): calm layers always play, the others come
  in at bar lines as the fight heats up (with hysteresis) and ramp over a bar. They are stand-ins for
  real tracks: drop `<id>.mp3` (or .ogg/.m4a/.wav) into public/audio/music/ and the MusicManager
  plays the file instead (see MusicManager.ts).

  A theme is data (tempo, chords, layers that play on steps); `PatternTheme` schedules it with a
  25 ms timer and a 140 ms lookahead, the Web Audio way. Nothing here allocates per note beyond the
  short-lived nodes the instruments create.
*/

export type BusPart = 'drums' | 'bass' | 'synth' | 'lead';

/** What a layer's player gets on each 16th step it may sound on. */
export interface StepCtx {
  I: Instruments;
  bus: TrackBus;
  t: number;
  /** 0..15 within the bar; bar count since the start. */
  step: number;
  bar: number;
  chord: Chord;
  /** Seconds per 16th note. */
  s16: number;
  intensity: number;
  rnd: () => number;
}

export interface Chord {
  root: number;
  pad: number[];
}

export interface ThemeLayer {
  id: string;
  /** Intensity it comes in at, and goes out below (≤ 0: always on). */
  on: number;
  off: number;
  level: number;
  part: BusPart;
  play(c: StepCtx): void;
}

export interface ThemeDef {
  id: string;
  bpm: number;
  /** One chord per `barsPerChord` bars, cycling. */
  chords: Chord[];
  barsPerChord: number;
  /** Scale notes (MIDI) for melodies. */
  scale: number[];
  layers: ThemeLayer[];
  /** Master level of the theme (0..1). */
  gain: number;
}

const LOOKAHEAD = 0.14;

interface LiveLayer {
  def: ThemeLayer;
  gain: GainNode;
  bus: TrackBus;
  active: boolean;
  target: number;
}

/** Plays a ThemeDef into `out`. Disposable: the timer stops and every node it made is disconnected. */
export class PatternTheme {
  readonly id: string;
  private bus: TrackBus;
  private mix: GainNode;
  private limiter: DynamicsCompressorNode;
  private layers: LiveLayer[];
  private s16: number;
  private bar: number;
  private start = 0;
  private stepN = 0;
  private timer = 0;
  private started = false;
  private disposed = false;
  private rnd = mulberry32(9);
  intensity = 0;
  private target = 0;

  constructor(private ctx: AudioContext, out: AudioNode, private I: Instruments, reverb: AudioNode, private def: ThemeDef) {
    this.id = def.id;
    this.s16 = 60 / def.bpm / 4;
    this.bar = this.s16 * 16;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -16;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.25;
    this.mix = ctx.createGain();
    this.mix.gain.value = def.gain;
    this.mix.connect(this.limiter).connect(out);
    this.bus = new TrackBus(ctx, this.mix, reverb, def.bpm);
    this.bus.out.gain.value = 1;
    this.layers = def.layers.map((l) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.bus[l.part]);
      // A bus whose every part plays into this layer's gain (the instruments pick a part by name).
      const bus = { ...this.bus, drums: gain, synth: gain, bass: gain, lead: gain, side: gain, duck: (t: number, d: number, r: number) => this.bus.duck(t, d, r) } as unknown as TrackBus;
      return { def: l, gain, bus, active: false, target: 0 };
    });
  }

  begin(at = this.ctx.currentTime + 0.1) {
    if (this.started || this.disposed) return;
    this.started = true;
    this.start = at;
    this.stepN = 0;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Desired intensity 0..1 (smoothed per frame: fast up, slow down). */
  set(x: number) {
    this.target = Math.max(0, Math.min(1, x));
  }

  update(dt: number) {
    const k = this.target > this.intensity ? 1 - Math.exp(-dt / 1.5) : 1 - Math.exp(-dt / 10);
    this.intensity += (this.target - this.intensity) * k;
  }

  /** Hidden tab: no timer at all; back: catch up from the clock (missed steps are skipped). */
  setSuspended(on: boolean) {
    if (!this.started || this.disposed) return;
    window.clearInterval(this.timer);
    if (!on) this.timer = window.setInterval(() => this.tick(), 25);
  }

  audible() {
    return this.layers.filter((l) => l.target > 0.01).map((l) => l.def.id);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    for (const l of this.layers) l.gain.disconnect();
    this.bus.disconnect();
    this.mix.disconnect();
    this.limiter.disconnect();
  }

  private tick() {
    const now = this.ctx.currentTime;
    // After a long gap (suspended), jump to now instead of replaying the backlog.
    if (this.start + this.stepN * this.s16 < now - 1) this.stepN = Math.ceil((now - this.start) / this.s16);
    while (this.start + this.stepN * this.s16 < now + LOOKAHEAD) {
      const t = this.start + this.stepN * this.s16;
      if (t > now - 0.05) this.play(this.stepN, t);
      this.stepN++;
    }
  }

  private barLayers(t: number) {
    const x = this.intensity;
    for (const l of this.layers) {
      const d = l.def;
      if (d.on <= 0) l.active = true;
      else if (!l.active && x >= d.on) l.active = true;
      else if (l.active && x < d.off) l.active = false;
      const want = l.active ? d.level : 0;
      if (Math.abs(want - l.target) < 0.01) continue;
      l.target = want;
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setValueAtTime(l.gain.gain.value, t);
      l.gain.gain.linearRampToValueAtTime(want, t + this.bar);
    }
  }

  private play(n: number, t: number) {
    const step = n % 16;
    const bar = Math.floor(n / 16);
    if (step === 0) this.barLayers(t);
    const chord = this.def.chords[Math.floor(bar / this.def.barsPerChord) % this.def.chords.length];
    for (const l of this.layers) {
      if (l.target <= 0.01 && l.gain.gain.value <= 0.01) continue;
      l.def.play({ I: this.I, bus: l.bus, t, step, bar, chord, s16: this.s16, intensity: this.intensity, rnd: this.rnd });
    }
  }
}

// ---------------------------------------------------------------------------------------------- themes

/** Title and menus: slow, wide, D minor; nothing that implies a fight. */
export const MENU_THEME: ThemeDef = {
  id: 'menu_theme',
  bpm: 72,
  gain: 0.8,
  barsPerChord: 2,
  chords: [
    { root: 38, pad: [50, 53, 57, 60, 64] },
    { root: 34, pad: [46, 53, 57, 62] },
    { root: 41, pad: [53, 57, 60, 64, 67] },
    { root: 36, pad: [48, 55, 57, 64] },
  ],
  scale: [62, 64, 65, 67, 69, 72, 74, 76],
  layers: [
    { id: 'pad', on: 0, off: 0, level: 0.85, part: 'synth', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.pad(c.bus, c.t, c.chord.pad, c.s16 * 32 - 0.2, 0.8, 1100); } },
    { id: 'drone', on: 0, off: 0, level: 0.55, part: 'bass', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.bass(c.bus, c.t, c.chord.root - 12, c.s16 * 32 - 0.3, 0.5, { cutoff: 150, env: 40, detune: 5 }); } },
    {
      id: 'arp', on: 0, off: 0, level: 0.5, part: 'lead',
      play: (c) => {
        if (c.step % 3 !== 0) return;
        const notes = c.chord.pad.map((p) => p + 12);
        c.I.pluck(c.bus, c.t, notes[(c.step / 3 + c.bar) % notes.length], 0.35 + c.rnd() * 0.2, { type: 'triangle', cutoff: 2200, decay: 0.9, delay: 0.9 });
      },
    },
  ],
};

/*
  25.0, the desert: maqam Hijaz on E (the Phrygian dominant: E F G♯ A B C D, the augmented second F–G♯
  that makes it read as Arabic), over a tanpura-like drone of E and B. A darbuka plays the Egyptian
  maqsum (dum tek · tek dum · tek ·); an oud plucks the phrase; a ney (breathy flute) takes it up as
  the fight grows; at the top a bowed string ensemble plays it in the double harmonic (D♯ for D: Hijaz
  Kar), doubled an octave. The melodies are phrases, not random notes: they walk the scale mostly by
  step, end on the tonic or the fifth, and slide into notes (the maqam's ornament).
*/
/** E Hijaz from E3, two octaves; the double harmonic swaps D for D♯. */
export const HIJAZ = [52, 53, 56, 57, 59, 60, 62, 64, 65, 68, 69, 71, 72, 74, 76];
export const HIJAZ_KAR = HIJAZ.map((n) => (n % 12 === 2 ? n + 1 : n));

/** A phrase over `bars` bars: [step from the phrase's start, scale degree, length in steps]. */
export type Phrase = [number, number, number][];
const RHYTHMS: [number, number][][] = [
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 2], [2, 2], [4, 4], [8, 3], [11, 1], [12, 4]],
  [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 8]],
];
/**
 * 25.0: a melodic phrase over two bars: a walk on scale degrees, by step (70%), by a third (20%) or
 * held (10%), inside `lo`…`hi`; the last note lands on the tonic or the fifth of the octave it is in.
 */
export function makePhrase(rnd: () => number, start: number, lo: number, hi: number): Phrase {
  const out: Phrase = [];
  let d = start;
  for (let bar = 0; bar < 2; bar++) {
    const rh = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)];
    for (const [s, len] of rh) {
      const r = rnd();
      const move = r < 0.7 ? (rnd() < 0.5 ? -1 : 1) : r < 0.9 ? (rnd() < 0.5 ? -2 : 2) : 0;
      d = Math.max(lo, Math.min(hi, d + move));
      out.push([bar * 16 + s, d, len]);
    }
  }
  // Cadence: the tonic (degree 0 or 7) or the fifth (4 or 11), whichever is nearest.
  const last = out[out.length - 1];
  last[1] = [0, 4, 7, 11].reduce((a, b) => (Math.abs(b - last[1]) < Math.abs(a - last[1]) ? b : a));
  return out;
}

/** The phrase each melodic layer is playing (made at the start of every second bar). */
const desertPhrase: Record<string, Phrase> = {};
function phraseStep(key: string, c: StepCtx, lo: number, hi: number, startDeg: number) {
  const pos = (c.bar % 2) * 16 + c.step;
  if (pos === 0 || !desertPhrase[key]) desertPhrase[key] = makePhrase(c.rnd, startDeg, lo, hi);
  return desertPhrase[key].find(([s]) => s === pos) ?? null;
}

export const DESERT_THEME: ThemeDef = {
  id: 'desert_theme',
  bpm: 92,
  gain: 0.85,
  barsPerChord: 4,
  chords: [
    { root: 40, pad: [52, 59, 64] },
    { root: 41, pad: [53, 56, 60] },
    { root: 40, pad: [52, 56, 59, 64] },
    { root: 38, pad: [50, 57, 62] },
  ],
  scale: HIJAZ,
  layers: [
    // The tanpura: E and B, breathing, every four bars.
    { id: 'drone', on: 0, off: 0, level: 0.6, part: 'bass', play: (c) => { if (c.step === 0 && c.bar % 4 === 0) { c.I.drone(c.bus, c.t, 28, c.s16 * 64 - 0.5, 0.8, { cutoff: 260, rate: 0.09 }); c.I.drone(c.bus, c.t, 35, c.s16 * 64 - 0.5, 0.45, { cutoff: 320, rate: 0.13 }); } } },
    {
      // Maqsum: dum tek · tek dum · tek · (eighths), ka ghosts between.
      id: 'darbuka', on: 0, off: 0, level: 0.6, part: 'drums',
      play: (c) => {
        const hit: Record<number, 'dum' | 'tek' | 'ka'> = { 0: 'dum', 2: 'tek', 6: 'tek', 8: 'dum', 12: 'tek' };
        const k = hit[c.step];
        if (k) c.I.darbuka(c.bus, c.t, k, k === 'dum' ? 0.85 : 0.6);
        else if (c.step % 2 && c.rnd() < 0.25 + c.intensity * 0.3) c.I.darbuka(c.bus, c.t, 'ka', 0.35);
      },
    },
    {
      // The oud: the phrase plucked, low register.
      id: 'oud', on: 0, off: 0, level: 0.55, part: 'lead',
      play: (c) => {
        const n = phraseStep('oud', c, 0, 9, 4);
        if (n) c.I.pluck(c.bus, c.t, HIJAZ[n[1]], 0.6, { type: 'sawtooth', cutoff: 1500, decay: 0.32, delay: 0.3 });
      },
    },
    {
      // The ney, an octave up, long notes sliding in from the note below.
      id: 'ney', on: 0.3, off: 0.2, level: 0.6, part: 'lead',
      play: (c) => {
        const n = phraseStep('ney', c, 4, 12, 7);
        if (!n || n[2] < 2) return;
        const note = HIJAZ[n[1]] + 12;
        c.I.flute(c.bus, c.t, note, c.s16 * n[2] * 0.95, 0.75, c.rnd() < 0.4 ? { from: note - 1, glide: 0.1 } : {});
      },
    },
    { id: 'riq', on: 0.45, off: 0.35, level: 0.45, part: 'drums', play: (c) => { if (c.step % 2 === 0) c.I.shaker(c.bus, c.t, c.step % 4 === 0 ? 0.5 : 0.3); if (c.step === 4 || c.step === 12) c.I.hat(c.bus, c.t, 0.35); } },
    {
      id: 'bass', on: 0.45, off: 0.35, level: 0.8, part: 'bass',
      play: (c) => {
        const motif: [number, number][] = [[0, 0], [3, 0], [6, 1], [8, 0], [11, 4], [14, 3]];
        for (const [s, iv] of motif) if (s === c.step) c.I.bass(c.bus, c.t, 40 + iv, c.s16 * 1.6, s === 0 ? 0.9 : 0.7, { cutoff: 380, env: 700 });
      },
    },
    {
      // Baladi on the big drums: dum dum · tek dum · tek ·, a roll into every fourth bar.
      id: 'drums', on: 0.65, off: 0.52, level: 0.8, part: 'drums',
      play: (c) => {
        if (c.step === 0 || c.step === 2 || c.step === 8) c.I.kick(c.bus, c.t, c.step === 0 ? 0.9 : 0.7, { pump: 0.2 });
        if (c.step === 6 || c.step === 12) c.I.darbuka(c.bus, c.t, 'tek', 0.8);
        if (c.bar % 4 === 3 && c.step >= 12) c.I.darbuka(c.bus, c.t, c.step % 2 ? 'ka' : 'tek', 0.7);
      },
    },
    {
      // The string ensemble in the double harmonic, doubled at the octave.
      id: 'strings', on: 0.8, off: 0.66, level: 0.55, part: 'lead',
      play: (c) => {
        const n = phraseStep('strings', c, 4, 11, 7);
        if (!n || n[2] < 2) return;
        const note = HIJAZ_KAR[n[1]] + 12;
        const slide = c.rnd() < 0.5 ? { from: HIJAZ_KAR[Math.max(0, n[1] - 1)] + 12, glide: 0.14 } : {};
        c.I.bowed(c.bus, c.t, note, c.s16 * n[2] * 0.95, 0.7, slide);
        c.I.bowed(c.bus, c.t, note - 12, c.s16 * n[2] * 0.95, 0.45, { ...slide, ...(slide.from ? { from: slide.from - 12 } : {}), voices: 2 });
      },
    },
  ],
};

/** Neon Docks: F minor, heavy distorted bass, industrial metal hits; four-on-the-floor in a fight. */
export const DOCKS_THEME: ThemeDef = {
  id: 'docks_theme',
  bpm: 124,
  gain: 0.8,
  barsPerChord: 2,
  chords: [
    { root: 29, pad: [53, 56, 60, 63] },
    { root: 25, pad: [49, 53, 56, 60] },
    { root: 32, pad: [56, 60, 63, 67] },
    { root: 27, pad: [51, 55, 58, 62] },
  ],
  scale: [65, 67, 68, 70, 72, 73, 75, 77],
  layers: [
    { id: 'pad', on: 0, off: 0, level: 0.5, part: 'synth', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.pad(c.bus, c.t, c.chord.pad, c.s16 * 32 - 0.2, 0.7, 800); } },
    { id: 'sub', on: 0, off: 0, level: 0.75, part: 'bass', play: (c) => { if (c.step === 0) c.I.bass(c.bus, c.t, c.chord.root, c.s16 * 14, 0.7, { cutoff: 110, env: 40, detune: 3 }); } },
    {
      id: 'grind', on: 0.2, off: 0.12, level: 0.75, part: 'bass',
      play: (c) => {
        if (c.step % 2) return;
        const oct = c.step % 8 === 6 ? 12 : 0;
        c.I.bass(c.bus, c.t, c.chord.root + 12 + oct, c.s16 * 1.3, c.step % 4 === 0 ? 0.8 : 0.55, { cutoff: 520, env: 1600, drive: 2.5, detune: 9 });
      },
    },
    { id: 'metal', on: 0.35, off: 0.25, level: 0.55, part: 'drums', play: (c) => { if (c.step === 6 || (c.step === 14 && c.bar % 2)) c.I.metal(c.bus, c.t, 0.55, c.step === 6 ? 210 : 160); } },
    { id: 'hats', on: 0.5, off: 0.38, level: 0.55, part: 'drums', play: (c) => { if (c.step % 2 === 0) c.I.hat(c.bus, c.t, c.step % 4 === 2 ? 0.6 : 0.3, c.step === 14); } },
    {
      id: 'kick', on: 0.6, off: 0.48, level: 0.85, part: 'drums',
      play: (c) => {
        if (c.step % 4 === 0) c.I.kick(c.bus, c.t, 0.95, { pump: 0.4, release: 0.2, drive: 1.5 });
        if (c.step === 4 || c.step === 12) c.I.clap(c.bus, c.t, 0.5);
        if (c.bar % 8 === 0 && c.step === 0) c.I.crash(c.bus, c.t, 0.45);
      },
    },
    { id: 'stabs', on: 0.8, off: 0.66, level: 0.55, part: 'lead', play: (c) => { if (c.step === 3 || c.step === 11) c.I.stab(c.bus, c.t, c.chord.pad.map((p) => p + 12), 0.5); } },
  ],
};

/*
  25.0, the jungle (Deep Jungle, Firebase Viper): drums and bass only. The 9.0 theme's high triangle
  lead with its glide and vibrato, its rimshots and its mid toms read as a siren and beeping. Now
  nothing sounds above A3 (220 Hz; the old lead sat at 440–880) but the skin of a drum: a slow heartbeat on a deep tribal drum (55 Hz), hand
  drums in three against four under it (65–90 Hz), a breathing drone (A1 and E2), a low ostinato as
  the fight starts, war drums and a surdo roll at its height.
*/
export const JUNGLE_THEME: ThemeDef = {
  id: 'jungle_theme',
  bpm: 88,
  // Measured (DEV musicSpectrum, all layers in): at 0.9 it was 2.7 dB over the 24.0 theme and peaked over
  // full scale before the limiter; 0.62 sits with the others.
  gain: 0.62,
  barsPerChord: 4,
  chords: [
    { root: 33, pad: [45, 52, 57] },
    { root: 31, pad: [43, 50, 55] },
    { root: 29, pad: [41, 48, 53] },
    { root: 28, pad: [40, 47, 52] },
  ],
  scale: [33, 36, 38, 40, 43, 45, 48],
  layers: [
    // The floor: a drone on the root and its fifth, breathing slowly, every four bars.
    { id: 'drone', on: 0, off: 0, level: 0.7, part: 'bass', play: (c) => { if (c.step === 0 && c.bar % 4 === 0) { c.I.drone(c.bus, c.t, c.chord.root, c.s16 * 64 - 0.5, 0.85, { cutoff: 150, rate: 0.07, depth: 0.6 }); c.I.drone(c.bus, c.t, c.chord.root + 7, c.s16 * 64 - 0.5, 0.4, { cutoff: 170, rate: 0.11 }); } } },
    // The heartbeat: a deep drum on one and its echo, a ghost before three.
    { id: 'pulse', on: 0, off: 0, level: 0.75, part: 'drums', play: (c) => { if (c.step === 0) c.I.tribal(c.bus, c.t, 52, 0.9, { decay: 0.8, slap: 0.1 }); else if (c.step === 3) c.I.tribal(c.bus, c.t, 52, 0.5, { decay: 0.6, slap: 0.05 }); else if (c.step === 7 && c.bar % 2) c.I.tribal(c.bus, c.t, 58, 0.35, { decay: 0.4 }); } },
    {
      // Hand drums in three against four, low; the accent moves round the bar.
      id: 'hands', on: 0, off: 0, level: 0.55, part: 'drums',
      play: (c) => {
        if (c.step % 3 !== 0) return;
        const accent = (c.step / 3 + c.bar) % 4 === 0;
        c.I.tribal(c.bus, c.t, accent ? 72 : 88, accent ? 0.6 : 0.32, { decay: 0.28, slap: accent ? 0.35 : 0.2 });
      },
    },
    { id: 'shaker', on: 0.2, off: 0.12, level: 0.25, part: 'drums', play: (c) => { if (c.step % 2 === 0) c.I.shaker(c.bus, c.t, c.step % 4 === 0 ? 0.4 : 0.22); } },
    {
      // A low ostinato on the root, its fifth and flat seventh, dark (no filter sweep).
      id: 'bass', on: 0.4, off: 0.3, level: 0.85, part: 'bass',
      play: (c) => {
        const motif: [number, number][] = [[0, 0], [3, 0], [6, 7], [8, 0], [11, 10], [14, 7]];
        for (const [s, iv] of motif) if (s === c.step) c.I.bass(c.bus, c.t, c.chord.root + 12 + iv, c.s16 * 1.8, s === 0 ? 0.95 : 0.7, { cutoff: 210, env: 160, detune: 5 });
      },
    },
    {
      // War drums: a big drum on one, the and of two and three; a tribal roll into every second bar.
      id: 'war', on: 0.6, off: 0.48, level: 0.85, part: 'drums',
      play: (c) => {
        if ([0, 6, 8].includes(c.step)) c.I.kick(c.bus, c.t, c.step === 0 ? 0.95 : 0.75, { pump: 0.25, tune: 0.8 });
        if (c.step === 4 || c.step === 12) c.I.tribal(c.bus, c.t, 64, 0.85, { decay: 0.35, slap: 0.5 });
        if (c.bar % 2 && c.step >= 12) c.I.tribal(c.bus, c.t, [96, 86, 76, 66][c.step - 12], 0.7, { decay: 0.22, slap: 0.4 });
      },
    },
    {
      // The surdo: a deep open boom answering the war drums, and sixteenths on low drums at the peak.
      id: 'surdo', on: 0.8, off: 0.66, level: 0.75, part: 'drums',
      play: (c) => {
        if (c.step === 10) c.I.tribal(c.bus, c.t, 46, 1, { decay: 1.0, slap: 0.15 });
        if (c.step % 2 && c.rnd() < 0.5) c.I.tribal(c.bus, c.t, 78 + c.rnd() * 14, 0.3, { decay: 0.16, slap: 0.3 });
      },
    },
  ],
};

export const PATTERN_THEMES: Record<string, ThemeDef> = { menu_theme: MENU_THEME, desert_theme: DESERT_THEME, docks_theme: DOCKS_THEME, jungle_theme: JUNGLE_THEME };
