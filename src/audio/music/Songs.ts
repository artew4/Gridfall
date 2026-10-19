import type { Instruments, TrackBus } from './Instruments';

export type MusicState = 'exploration' | 'combat' | 'intense';

/** One sixteenth-note step of a song, already placed on the audio clock. */
export interface Step {
  t: number;
  /** Seconds per sixteenth. */
  dt: number;
  /** Bar within the 32-bar loop. */
  bar: number;
  /** 0..15 */
  step: number;
  /** Bar within the 8-bar phrase. */
  pb: number;
  /** 0 = A, 1 = B, 2 = A′ (stripped), 3 = B′ (full). */
  section: number;
  /** A fill was requested for the end of this bar. */
  fill: boolean;
  /** Bars since this track started (0 = entry bar). */
  age: number;
}

export interface Song {
  state: MusicState;
  bpm: number;
  play(I: Instruments, bus: TrackBus, s: Step): void;
}

/** Shared drum fill for the last beat(s) of a phrase. */
function fill(I: Instruments, bus: TrackBus, s: Step, from = 12, toms = false) {
  if (s.step < from) return;
  const k = (s.step - from + 1) / (16 - from);
  if (toms) I.tom(bus, s.t, [196, 165, 131, 110][s.step % 4], 0.5 + k * 0.5);
  else I.snare(bus, s.t, 0.3 + k * 0.6, 200, 0.15);
}

// =================================================================== Exploration — 90 BPM, A minor
const EX_A = [
  [57, 60, 64, 67, 71], // Am9
  [53, 57, 60, 64], // Fmaj7
  [50, 53, 57, 60, 64], // Dm9
  [52, 57, 59, 64], // Esus4 (→ E7 in the second bar)
];
const EX_A_E7 = [52, 56, 59, 62];
const EX_B = [
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 64], // G6
  [52, 55, 59, 62], // Em7
  [57, 60, 64, 69], // Am
];
const EX_ROOT_A = [33, 29, 38, 40];
const EX_ROOT_B = [29, 31, 40, 33];
// Lead motifs: [bar in phrase, step, note, length in steps]
const EX_MOTIF_A: [number, number, number, number][] = [
  [4, 0, 76, 6], [4, 6, 74, 2], [4, 8, 72, 8],
  [5, 0, 71, 8], [5, 8, 69, 4], [5, 12, 72, 4],
  [6, 0, 76, 12], [6, 12, 79, 4],
  [7, 0, 76, 10],
];
const EX_MOTIF_B: [number, number, number, number][] = [
  [4, 0, 72, 4], [4, 4, 74, 4], [4, 8, 76, 8],
  [5, 0, 79, 8], [5, 8, 76, 8],
  [6, 0, 74, 12], [6, 12, 72, 4],
  [7, 0, 69, 12],
];

export const EXPLORATION: Song = {
  state: 'exploration',
  bpm: 90,
  play(I, bus, s) {
    const B = s.section % 2 === 1;
    const chords = B ? EX_B : EX_A;
    const ci = Math.floor(s.pb / 2);
    let chord = chords[ci];
    if (!B && ci === 3 && s.pb % 2 === 1) chord = EX_A_E7;
    const root = (B ? EX_ROOT_B : EX_ROOT_A)[ci];
    const bar = 16 * s.dt;
    const stripped = s.section === 2 && s.pb < 4;

    // Pads: one chord per two bars (the sus4 → 7 resolution gets a bar each).
    if (s.step === 0) {
      if (!B && ci === 3) I.pad(bus, s.t, chord, bar - 0.2, s.pb % 2 ? 0.8 : 1.1, 1300);
      else if (s.pb % 2 === 0) I.pad(bus, s.t, chord, bar * 2 - 0.2, 1.1, B ? 1800 : 1300);
    }
    // Bass: whole notes with an octave pickup.
    if (!stripped) {
      if (s.step === 0) I.bass(bus, s.t, root, bar * 0.85, 0.85, { cutoff: 260, env: 300 });
      if (s.step === 14) I.bass(bus, s.t, root + 12, s.dt * 1.6, 0.5, { cutoff: 400, env: 600 });
    }
    // Half-time drums.
    if (!stripped && (s.step === 0 || (B && s.step === 11))) I.kick(bus, s.t, s.step === 0 ? 0.75 : 0.45, { pump: 0.35, release: 0.4 });
    if (s.step === 8) I.rim(bus, s.t, 0.9);
    if (s.step % 2 === 1) I.shaker(bus, s.t, s.step % 4 === 3 ? 0.9 : 0.5);
    if (s.step === 14 && s.pb % 2 === 1) I.hat(bus, s.t, 0.5, true);
    // Arp: eighths climbing through the chord, an octave higher every other bar.
    if (s.step % 2 === 0 && !(s.section === 0 && s.age < 2)) {
      const i = (s.step / 2) % chord.length;
      I.pluck(bus, s.t, chord[i] + 12 + (s.pb % 2) * 12 * (i > 2 ? 0 : 1), 0.55, { type: 'triangle', cutoff: 2400, decay: 0.3, delay: 0.6 });
    }
    // Lead motif once per phrase.
    for (const [pb, st, n, len] of B ? EX_MOTIF_B : EX_MOTIF_A) {
      if (pb === s.pb && st === s.step) I.lead(bus, s.t, n, len * s.dt, 0.7, { type: 'triangle', cutoff: 1800, vibrato: 0.8 });
    }
    if (s.pb === 7 && (s.fill || s.section % 2 === 1)) fill(I, bus, s, 12);
  },
};

// =================================================================== Combat — 135 BPM, D minor
const CB_A = [
  [50, 53, 57], // Dm
  [46, 50, 53], // B♭
  [48, 52, 55], // C
  [45, 48, 52], // Am
];
const CB_B = [
  [43, 46, 50], // Gm
  [46, 50, 53], // B♭
  [48, 52, 55], // C
  [50, 53, 57], // Dm
];
const CB_ROOT_A = [38, 34, 36, 33];
const CB_ROOT_B = [31, 34, 36, 38];
// Two-bar hook over the B section.
const CB_HOOK: [number, number, number, number][] = [
  [0, 0, 69, 3], [0, 3, 74, 3], [0, 6, 77, 2], [0, 8, 76, 4], [0, 12, 74, 2], [0, 14, 72, 2],
  [1, 0, 74, 6], [1, 6, 69, 2], [1, 8, 72, 4], [1, 12, 70, 2], [1, 14, 69, 2],
];

export const COMBAT: Song = {
  state: 'combat',
  bpm: 135,
  play(I, bus, s) {
    const B = s.section % 2 === 1;
    const ci = Math.floor(s.pb / 2);
    const chord = (B ? CB_B : CB_A)[ci];
    const root = (B ? CB_ROOT_B : CB_ROOT_A)[ci];
    const breakdown = s.section === 2 && s.pb < 2;
    const st = s.step;

    if (st === 0 && s.pb === 0) I.crash(bus, s.t, 0.8);
    // Four on the floor, snare+clap on 2 and 4, ghosts.
    if (!breakdown && st % 4 === 0) I.kick(bus, s.t, 1, { pump: 0.55, release: 0.2 });
    if (st === 4 || st === 12) {
      I.snare(bus, s.t, breakdown ? 0.5 : 0.9);
      if (!breakdown) I.clap(bus, s.t, 0.7);
    }
    if (!breakdown && (st === 7 || st === 15) && s.pb !== 7) I.snare(bus, s.t, 0.18, 210, 0);
    // Hats: 16ths, accents on the off-beat eighths, open on the "and".
    if (st % 4 === 2) I.hat(bus, s.t, 0.8, true);
    else I.hat(bus, s.t, st % 2 === 1 ? 0.45 : 0.75);
    // Galloping bass ostinato (8th + two 16ths per beat), octave kicks on 2 and 4.
    if (st % 4 !== 1) {
      const up = st % 8 === 7;
      I.bass(bus, s.t, root + (up ? 12 : 0), s.dt * (st % 4 === 0 ? 1.8 : 0.9), st % 4 === 0 ? 1 : 0.75, {
        cutoff: breakdown ? 220 : 340,
        env: breakdown ? 300 : 1400,
      });
    }
    // 16th arp over two octaves, up then down.
    if (!(s.section === 2 && s.pb < 4)) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12];
      const seq = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3];
      I.pluck(bus, s.t, tones[seq[st]] + 12, st % 4 === 0 ? 0.75 : 0.5, { type: 'sawtooth', cutoff: 2600 + (s.pb % 4) * 500, decay: 0.12, delay: 0.35 });
    }
    // B: syncopated stabs and the lead hook.
    if (B) {
      if (st === 3 || st === 6 || st === 11) I.stab(bus, s.t, chord.map((n) => n + 12), 0.9);
      for (const [b, ss, n, len] of CB_HOOK) {
        if (b === s.pb % 2 && ss === st) I.lead(bus, s.t, n + (s.section === 3 ? 12 : 0), len * s.dt, s.section === 3 ? 0.75 : 0.9, { glide: 0.05, from: ss > 0 ? n - 2 : undefined });
      }
    } else if (st === 0 && s.pb % 2 === 0) {
      I.pad(bus, s.t, chord.map((n) => n + 12), 32 * s.dt - 0.1, 0.6, 1100);
    }
    if (s.pb === 7) fill(I, bus, s, s.fill ? 8 : 12, s.section === 3);
  },
};

// =================================================================== Intense — 150 BPM, E Phrygian
const IN_CH = [
  [52, 55, 59], // Em
  [53, 57, 60], // F
  [52, 55, 59], // Em
  [50, 54, 57], // D
];
const IN_ROOT = [40, 41, 40, 38];
const IN_ARP = [64, 65, 67, 71, 72, 71, 67, 65]; // E F G B C B G F
const IN_BASS = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 0, 12, 0];

export const INTENSE: Song = {
  state: 'intense',
  bpm: 150,
  play(I, bus, s) {
    const B = s.section % 2 === 1;
    const ci = Math.floor(s.pb / 2);
    const chord = IN_CH[ci];
    const root = IN_ROOT[ci];
    const st = s.step;
    const breakdown = s.section === 2 && s.pb < 2;

    if (st === 0 && s.pb % 4 === 0) I.crash(bus, s.t, 0.9);
    if (!breakdown && (st % 4 === 0 || (B && st === 14) || st === 10 && s.pb % 2 === 1)) I.kick(bus, s.t, 1, { drive: 2.2, pump: 0.6, release: 0.16 });
    if (st === 4 || st === 12) {
      I.snare(bus, s.t, 0.9, 170, 0.3);
      I.metal(bus, s.t, B ? 1 : 0.7, st === 4 ? 210 : 185);
    }
    if (B && (st === 7 || st === 15)) I.metal(bus, s.t, 0.45, 260);
    // Hats with 32nd rolls at the end of every fourth bar.
    I.hat(bus, s.t, st % 2 ? 0.5 : 0.85, st % 8 === 6);
    if (s.pb % 4 === 3 && st >= 12) I.hat(bus, s.t + s.dt / 2, 0.6);
    // Distorted reese bass pulsing in 16ths.
    if (!breakdown || st % 4 === 0) {
      const off = IN_BASS[st];
      I.bass(bus, s.t, root + off, s.dt * 0.95, off === 12 ? 0.8 : 1, { cutoff: 520, env: 1800, drive: 3.5, detune: 22 });
    }
    // A: fast Phrygian arp. B: the semitone siren.
    if (!B) {
      if (!(s.section === 2 && s.pb < 4)) I.pluck(bus, s.t, IN_ARP[st % 8] + (s.pb % 2) * 12, 0.55, { type: 'sawtooth', cutoff: 3600, decay: 0.1, delay: 0.3 });
    } else {
      if (st === 0) I.lead(bus, s.t, 77, 8 * s.dt, 0.95, { from: 76, glide: 0.25, cutoff: 3200, vibrato: 2 });
      if (st === 8) I.lead(bus, s.t, 76, 8 * s.dt, 0.95, { from: 77, glide: 0.25, cutoff: 3200, vibrato: 2 });
      if (st === 0 && s.pb % 2 === 0) I.pad(bus, s.t, chord, 32 * s.dt - 0.1, 0.7, 900);
    }
    if (breakdown && st === 0 && s.pb === 0) I.pad(bus, s.t, [40, 47, 52], 32 * s.dt, 1, 700);
    if (s.pb === 7) fill(I, bus, s, s.fill ? 8 : 12, true);
  },
};

export const SONGS: Record<MusicState, Song> = { exploration: EXPLORATION, combat: COMBAT, intense: INTENSE };
