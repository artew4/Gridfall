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
const pick = <T>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];

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

/** Desert Outpost: E phrygian dominant, a frame-drum pulse, a plucked oud-like line; a fight adds drums. */
const PHRYG_DOM = [52, 53, 56, 57, 59, 60, 62, 64, 65, 68, 69, 71];
export const DESERT_THEME: ThemeDef = {
  id: 'desert_theme',
  bpm: 96,
  gain: 0.85,
  barsPerChord: 2,
  chords: [
    { root: 40, pad: [52, 59, 64] },
    { root: 41, pad: [53, 57, 60] },
    { root: 40, pad: [52, 56, 59, 64] },
    { root: 38, pad: [50, 57, 62] },
  ],
  scale: PHRYG_DOM,
  layers: [
    { id: 'drone', on: 0, off: 0, level: 0.6, part: 'bass', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.bass(c.bus, c.t, 28, c.s16 * 32 - 0.2, 0.55, { cutoff: 140, env: 30, detune: 7 }); } },
    { id: 'pad', on: 0, off: 0, level: 0.45, part: 'synth', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.pad(c.bus, c.t, c.chord.pad, c.s16 * 32 - 0.2, 0.6, 900); } },
    { id: 'frame', on: 0, off: 0, level: 0.55, part: 'drums', play: (c) => { if ([0, 6, 10].includes(c.step)) c.I.tom(c.bus, c.t, c.step === 0 ? 92 : 128, c.step === 0 ? 0.6 : 0.35); } },
    {
      id: 'oud', on: 0, off: 0, level: 0.55, part: 'lead',
      play: (c) => {
        if (c.step % 2 || c.rnd() > 0.32 - c.intensity * 0.12) return;
        c.I.pluck(c.bus, c.t, pick(PHRYG_DOM, c.rnd) + 12, 0.45 + c.rnd() * 0.3, { type: 'sawtooth', cutoff: 1800, decay: 0.35, delay: 0.35 });
      },
    },
    { id: 'shaker', on: 0.3, off: 0.2, level: 0.5, part: 'drums', play: (c) => { if (c.step % 2 === 0) c.I.shaker(c.bus, c.t, c.step % 4 === 0 ? 0.5 : 0.3); } },
    {
      id: 'bass', on: 0.45, off: 0.35, level: 0.8, part: 'bass',
      play: (c) => {
        const motif: [number, number][] = [[0, 0], [3, 0], [6, 1], [8, 0], [11, 4], [14, 3]];
        for (const [s, iv] of motif) if (s === c.step) c.I.bass(c.bus, c.t, 40 + iv, c.s16 * 1.6, s === 0 ? 0.9 : 0.7, { cutoff: 380, env: 900 });
      },
    },
    {
      id: 'drums', on: 0.65, off: 0.52, level: 0.8, part: 'drums',
      play: (c) => {
        if (c.step === 0 || c.step === 8 || (c.bar % 2 && c.step === 11)) c.I.kick(c.bus, c.t, c.step === 0 ? 0.9 : 0.7, { pump: 0.2 });
        if (c.step === 4 || c.step === 12) c.I.snare(c.bus, c.t, 0.55, 210, 0.3);
        if (c.bar % 4 === 3 && c.step >= 12) c.I.tom(c.bus, c.t, [180, 150, 120, 100][c.step - 12], 0.5);
      },
    },
    {
      id: 'lead', on: 0.8, off: 0.66, level: 0.6, part: 'lead',
      play: (c) => {
        if (c.bar % 2 || c.step % 4) return;
        c.I.lead(c.bus, c.t, pick([64, 65, 68, 69, 71, 72], c.rnd) + 12, c.s16 * 3.5, 0.5, { glide: 0.06, cutoff: 2600, vibrato: 1.2, type: 'sawtooth' });
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

/** Deep Jungle: A minor pentatonic, tribal toms in three against four, a breathy lead in a fight. */
export const JUNGLE_THEME: ThemeDef = {
  id: 'jungle_theme',
  bpm: 104,
  gain: 0.85,
  barsPerChord: 2,
  chords: [
    { root: 33, pad: [57, 60, 64, 67] },
    { root: 31, pad: [55, 59, 62, 67] },
    { root: 29, pad: [53, 57, 60, 64] },
    { root: 28, pad: [52, 55, 59, 64] },
  ],
  scale: [57, 60, 62, 64, 67, 69, 72, 74, 76],
  layers: [
    { id: 'drone', on: 0, off: 0, level: 0.55, part: 'bass', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.bass(c.bus, c.t, c.chord.root, c.s16 * 32 - 0.2, 0.5, { cutoff: 130, env: 30, detune: 6 }); } },
    { id: 'pad', on: 0, off: 0, level: 0.4, part: 'synth', play: (c) => { if (c.step === 0 && c.bar % 2 === 0) c.I.pad(c.bus, c.t, c.chord.pad, c.s16 * 32 - 0.2, 0.55, 700); } },
    {
      id: 'toms', on: 0, off: 0, level: 0.65, part: 'drums',
      play: (c) => {
        // Three against four: a dotted pattern of low toms over the bar.
        if (c.step % 3 === 0) c.I.tom(c.bus, c.t, c.step % 6 === 0 ? 86 : 110, c.step === 0 ? 0.7 : 0.45);
        if (c.step === 14) c.I.tom(c.bus, c.t, 140, 0.4);
      },
    },
    { id: 'shaker', on: 0, off: 0, level: 0.4, part: 'drums', play: (c) => { if (c.step % 2 === 0) c.I.shaker(c.bus, c.t, c.step % 4 === 0 ? 0.45 : 0.25); } },
    { id: 'rims', on: 0.3, off: 0.2, level: 0.55, part: 'drums', play: (c) => { if ([2, 5, 10, 13].includes(c.step)) c.I.rim(c.bus, c.t, 0.5); } },
    {
      id: 'bass', on: 0.45, off: 0.35, level: 0.8, part: 'bass',
      play: (c) => {
        const motif: [number, number][] = [[0, 0], [3, 7], [6, 0], [8, 10], [11, 7], [14, 3]];
        for (const [s, iv] of motif) if (s === c.step) c.I.bass(c.bus, c.t, c.chord.root + 12 + iv, c.s16 * 1.5, s === 0 ? 0.9 : 0.7, { cutoff: 420, env: 900 });
      },
    },
    {
      id: 'drums', on: 0.65, off: 0.52, level: 0.8, part: 'drums',
      play: (c) => {
        if ([0, 7, 10].includes(c.step)) c.I.kick(c.bus, c.t, c.step === 0 ? 0.9 : 0.65, { pump: 0.25 });
        if (c.step === 4 || c.step === 12) c.I.snare(c.bus, c.t, 0.55, 230, 0.3);
      },
    },
    {
      id: 'flute', on: 0.8, off: 0.66, level: 0.55, part: 'lead',
      play: (c) => {
        if (c.bar % 2 || c.step % 4) return;
        c.I.lead(c.bus, c.t, pick([69, 72, 74, 76, 79, 81], c.rnd), c.s16 * 3.5, 0.45, { glide: 0.08, cutoff: 3000, vibrato: 2, type: 'triangle' });
      },
    },
  ],
};

export const PATTERN_THEMES: Record<string, ThemeDef> = { menu_theme: MENU_THEME, desert_theme: DESERT_THEME, docks_theme: DOCKS_THEME, jungle_theme: JUNGLE_THEME };
