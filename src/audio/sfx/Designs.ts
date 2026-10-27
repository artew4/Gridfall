import { env, filter, finish, grains, mix, modes, noise, reflect, Rng, sat, secs, sweep } from './Dsp';

/*
  63.0, the recipes: every sound effect the game plays from a buffer (SfxBank), each a stack of layers
  rendered with Dsp.ts. A design takes a seeded Rng (its variant) and the sample rate and returns mono
  samples peaking at 0.9. The playtest asked for "proper sounds for all of it": the 3.x–46.0 sounds
  were 2–5 oscillators and noise bursts patched together live on every shot; these are layered the
  way a sound designer layers a recorded effect.

  Guns: a transient crack, a body (noise through a falling lowpass, driven), a low thump (a pitch
  drop), the mechanism (a few metal modes, the bolt or slide), a tail with early reflections. `far`:
  the same gun heard at range (the crack and the thump softened, the top rolled off, more tail).
  Reloads: clicks (struck modes and a tick), slides (a band of noise gliding), thunks. Impacts: a crack
  and the material's own voice (concrete chips, a metal ping, a wood thock, glass shards, a sand puff,
  a body's thud). Footsteps: a heel and a toe (or a scuff), per surface.
*/

export type Design = (rng: Rng, sr: number) => Float32Array;

// ------------------------------------------------------------------ building blocks
/** A noise layer: `dur` s of noise through a filter (gliding), enveloped, mixed into `out` at `at`. */
function nz(out: Float32Array, rng: Rng, sr: number, at: number, dur: number, amp: number, f: { type: 'lowpass' | 'highpass' | 'bandpass'; f: number; q?: number; to?: number }, e: { a?: number; t60: number; hold?: number }, color: 'white' | 'pink' | 'brown' = 'white', drive = 0) {
  const x = noise(Math.ceil(dur * sr), rng, color);
  filter(x, f.type, f.f, f.q ?? 0.7, sr, f.to, dur);
  env(x, e.a ?? 0.0005, e.t60, sr, e.hold ?? 0);
  if (drive) sat(x, drive);
  return mix(out, x, at, amp, sr);
}

/** A pitch drop (a thump, a boom), enveloped and lightly driven. */
function thump(out: Float32Array, sr: number, at: number, f0: number, f1: number, t60: number, amp: number, drive = 1.4) {
  const x = sweep(Math.ceil(t60 * 1.1 * sr), f0, f1, t60 * 0.45, sr);
  env(x, 0.0015, t60, sr);
  sat(x, drive);
  return mix(out, x, at, amp, sr);
}

/** Struck metal or wood: modes (×ratios of `f`), each a share of `amp`, ringing `t60` (higher ones shorter). */
function ring(out: Float32Array, rng: Rng, sr: number, at: number, f: number, ratios: readonly number[], amp: number, t60: number) {
  const p = ratios.map((r, i) => [f * r, 1 / (1 + i * 0.7), t60 / (1 + i * 0.45)] as [number, number, number]);
  const x = modes(Math.ceil(t60 * 1.2 * sr), p, sr, rng);
  return mix(out, x, at, amp, sr);
}

/** A mechanical click: a tick of noise and a short metal ring. */
function click(out: Float32Array, rng: Rng, sr: number, at: number, f: number, amp: number, t60 = 0.035) {
  nz(out, rng, sr, at, 0.012, amp * 0.9, { type: 'bandpass', f: f * 1.3, q: 1.2 }, { t60: 0.008 });
  return ring(out, rng, sr, at, f, [1, 1.62, 2.71, 3.93], amp * 0.55, t60);
}

/** A slide: a band of noise gliding from `f0` to `f1` over `dur` (a magazine, a slide, a bolt). */
function slide(out: Float32Array, rng: Rng, sr: number, at: number, dur: number, f0: number, f1: number, amp: number) {
  return nz(out, rng, sr, at, dur, amp, { type: 'bandpass', f: f0, q: 1.6, to: f1 }, { a: dur * 0.3, t60: dur }, 'white');
}

// ------------------------------------------------------------------ guns
interface Gun {
  crack: number; crackHp: number;
  body: number; bodyF: number; bodyT: number;
  thump: number; thumpF0: number; thumpF1: number; thumpT: number;
  mech: number; mechF: number; mechAt: number;
  tail: number; tailT: number; tailLp: number;
  drive: number; len: number;
}
const GUNS: Record<'pistol' | 'smg' | 'rifle' | 'shotgun', Gun> = {
  pistol: { crack: 1.2, crackHp: 2200, body: 1.1, bodyF: 3200, bodyT: 0.08, thump: 0.45, thumpF0: 165, thumpF1: 60, thumpT: 0.1, mech: 0.35, mechF: 2300, mechAt: 0.028, tail: 0.55, tailT: 0.5, tailLp: 2400, drive: 2.4, len: 0.7 },
  smg: { crack: 1.1, crackHp: 2800, body: 0.9, bodyF: 3800, bodyT: 0.05, thump: 0.28, thumpF0: 210, thumpF1: 85, thumpT: 0.055, mech: 0.25, mechF: 2900, mechAt: 0.018, tail: 0.4, tailT: 0.3, tailLp: 2800, drive: 2.2, len: 0.45 },
  rifle: { crack: 1.3, crackHp: 2400, body: 1.25, bodyF: 2600, bodyT: 0.11, thump: 0.55, thumpF0: 135, thumpF1: 48, thumpT: 0.15, mech: 0.3, mechF: 1850, mechAt: 0.03, tail: 0.75, tailT: 0.8, tailLp: 2000, drive: 2.8, len: 1.0 },
  shotgun: { crack: 1.1, crackHp: 1800, body: 1.5, bodyF: 1900, bodyT: 0.24, thump: 0.8, thumpF0: 95, thumpF1: 32, thumpT: 0.38, mech: 0, mechF: 0, mechAt: 0, tail: 0.9, tailT: 1.2, tailLp: 1500, drive: 3, len: 1.45 },
};
function gunshot(kind: keyof typeof GUNS, far: boolean): Design {
  return (rng, sr) => {
    const g = GUNS[kind];
    const out = secs(g.len * (far ? 1.3 : 1), sr);
    const p = rng.range(0.94, 1.06);
    const k = far ? 0.45 : 1;
    // The crack: a few ms of bright noise and a mid snap.
    nz(out, rng, sr, 0, 0.014, g.crack * k, { type: 'highpass', f: g.crackHp * p, q: 0.7 }, { a: 0.0002, t60: 0.012 }, 'white', 1.6);
    nz(out, rng, sr, 0, 0.05, g.crack * 0.8 * k, { type: 'bandpass', f: 1700 * p, q: 0.8 }, { a: 0.0003, t60: 0.04 }, 'white', 1.4);
    // The body: the blast itself, its top falling away, driven.
    nz(out, rng, sr, 0.0005, g.bodyT * 1.5, g.body, { type: 'lowpass', f: g.bodyF * p, q: 0.8, to: g.bodyF * 0.3 }, { a: 0.0008, t60: g.bodyT }, 'white', g.drive);
    // The thump: the pressure in the chest.
    thump(out, sr, 0, g.thumpF0 * p, g.thumpF1 * p, g.thumpT * (far ? 1.3 : 1), g.thump * (far ? 0.55 : 1), 1.6);
    // The mechanism: the slide or the bolt (not heard at range).
    if (g.mech && !far) {
      ring(out, rng, sr, g.mechAt, g.mechF * rng.range(0.95, 1.05), [1, 1.59, 2.31, 3.4], g.mech, 0.05);
      nz(out, rng, sr, g.mechAt, 0.015, g.mech * 0.8, { type: 'bandpass', f: 4200, q: 1.5 }, { t60: 0.01 });
    }
    // The tail: the shot coming back off the surroundings.
    const tail = secs(g.tailT * 1.2, sr);
    nz(tail, rng, sr, 0, g.tailT * 1.2, 1, { type: 'lowpass', f: g.tailLp * (far ? 0.8 : 1), q: 0.6, to: g.tailLp * 0.35 }, { a: 0.012, t60: g.tailT }, 'pink');
    mix(out, tail, 0.008, g.tail * (far ? 1.7 : 1), sr);
    reflect(out, sr, [[0.031 + rng.range(0, 0.01), 0.22], [0.067 + rng.range(0, 0.015), 0.14], [0.12 + rng.range(0, 0.02), 0.08]], far ? 1600 : 2600);
    if (far) filter(out, 'lowpass', 3200, 0.7, sr);
    sat(out, 1.25);
    return finish(out, sr, 0.92);
  };
}

// ------------------------------------------------------------------ the weapons' handling
const RELOADS: Record<string, Design> = {
  pistol_out: (r, sr) => { const o = secs(0.16, sr); click(o, r, sr, 0, 2600, 0.8); slide(o, r, sr, 0.012, 0.07, 1900, 900, 0.5); return finish(o, sr, 0.8); },
  pistol_in: (r, sr) => { const o = secs(0.2, sr); slide(o, r, sr, 0, 0.06, 900, 2100, 0.5); click(o, r, sr, 0.06, 2150, 1); thump(o, sr, 0.06, 240, 120, 0.05, 0.35); return finish(o, sr, 0.85); },
  pistol_rack: (r, sr) => { const o = secs(0.3, sr); slide(o, r, sr, 0, 0.045, 3000, 1500, 0.55); click(o, r, sr, 0.045, 2400, 1); click(o, r, sr, 0.05, 3600, 0.4); ring(o, r, sr, 0.05, 5200, [1, 1.4], 0.06, 0.15); return finish(o, sr, 0.85); },
  smg_out: (r, sr) => { const o = secs(0.16, sr); click(o, r, sr, 0, 1900, 0.8, 0.025); slide(o, r, sr, 0.01, 0.08, 1500, 700, 0.55); return finish(o, sr, 0.8); },
  smg_in: (r, sr) => { const o = secs(0.2, sr); slide(o, r, sr, 0, 0.07, 800, 1900, 0.5); click(o, r, sr, 0.07, 1750, 1, 0.03); thump(o, sr, 0.07, 220, 110, 0.05, 0.3); return finish(o, sr, 0.85); },
  smg_rack: (r, sr) => { const o = secs(0.32, sr); click(o, r, sr, 0, 2300, 0.7, 0.03); slide(o, r, sr, 0.01, 0.05, 2600, 1300, 0.4); click(o, r, sr, 0.11, 2000, 1, 0.04); return finish(o, sr, 0.85); },
  rifle_out: (r, sr) => { const o = secs(0.22, sr); click(o, r, sr, 0, 2050, 0.9, 0.04); slide(o, r, sr, 0.015, 0.1, 1500, 650, 0.6); return finish(o, sr, 0.85); },
  rifle_in: (r, sr) => { const o = secs(0.25, sr); slide(o, r, sr, 0, 0.08, 700, 1800, 0.55); click(o, r, sr, 0.08, 1800, 1, 0.05); thump(o, sr, 0.08, 170, 85, 0.07, 0.45); return finish(o, sr, 0.9); },
  rifle_rack: (r, sr) => { const o = secs(0.42, sr); slide(o, r, sr, 0, 0.07, 2600, 1200, 0.5); click(o, r, sr, 0.07, 2200, 0.7, 0.04); slide(o, r, sr, 0.15, 0.04, 1200, 2600, 0.45); click(o, r, sr, 0.19, 1650, 1, 0.06); thump(o, sr, 0.19, 160, 80, 0.06, 0.4); return finish(o, sr, 0.9); },
  shotgun_in: (r, sr) => { const o = secs(0.18, sr); slide(o, r, sr, 0, 0.05, 1200, 2600, 0.5); click(o, r, sr, 0.05, 2800, 0.8, 0.03); ring(o, r, sr, 0.05, 4300, [1, 1.47], 0.12, 0.06); return finish(o, sr, 0.8); },
  shotgun_pump: (r, sr) => {
    const o = secs(0.45, sr);
    // Cha: the fore-end back; chunk: forward, home.
    nz(o, r, sr, 0, 0.1, 0.7, { type: 'bandpass', f: 1600, q: 1.3, to: 750 }, { a: 0.01, t60: 0.08 });
    click(o, r, sr, 0.02, 1250, 0.7, 0.05);
    nz(o, r, sr, 0.16, 0.08, 0.6, { type: 'bandpass', f: 800, q: 1.3, to: 1700 }, { a: 0.01, t60: 0.06 });
    click(o, r, sr, 0.22, 1500, 1, 0.06);
    thump(o, sr, 0.22, 150, 70, 0.08, 0.55);
    return finish(o, sr, 0.9);
  },
  dry: (r, sr) => { const o = secs(0.12, sr); click(o, r, sr, 0, 3000, 1, 0.025); ring(o, r, sr, 0.005, 5600, [1], 0.08, 0.06); return finish(o, sr, 0.6); },
  draw: (r, sr) => { const o = secs(0.3, sr); nz(o, r, sr, 0, 0.16, 0.5, { type: 'bandpass', f: 1500, q: 0.8, to: 2600 }, { a: 0.04, t60: 0.1 }, 'pink'); click(o, r, sr, 0.14, 2200, 0.9, 0.05); return finish(o, sr, 0.7); },
  casing: (r, sr) => {
    const o = secs(0.55, sr);
    const f = r.range(3900, 5200);
    // Brass on the ground: three bounces, each softer.
    for (const [at, a] of [[0, 1], [0.11 + r.range(0, 0.04), 0.55], [0.21 + r.range(0, 0.05), 0.3]] as [number, number][]) ring(o, r, sr, at, f * r.range(0.98, 1.02), [1, 1.43, 2.08, 2.9], a, 0.18);
    return finish(o, sr, 0.5);
  },
};

// ------------------------------------------------------------------ impacts
function impact(kind: 'concrete' | 'metal' | 'wood' | 'glass' | 'sand' | 'body'): Design {
  return (r, sr) => {
    const o = secs(kind === 'glass' ? 0.8 : kind === 'metal' ? 0.6 : 0.45, sr);
    if (kind !== 'body' && kind !== 'sand') nz(o, r, sr, 0, 0.006, 0.9, { type: 'highpass', f: 2200, q: 0.7 }, { a: 0.0002, t60: 0.005 });
    if (kind === 'concrete') {
      nz(o, r, sr, 0, 0.08, 0.8, { type: 'bandpass', f: r.range(1000, 1500), q: 0.9 }, { t60: 0.05 }, 'white', 1.5);
      thump(o, sr, 0, 200, 85, 0.05, 0.4);
      grains(o, r, sr, { n: 45, at: 0.004, spread: 0.25, fLo: 1500, fHi: 6500, amp: 0.25 });
      nz(o, r, sr, 0.01, 0.35, 0.07, { type: 'highpass', f: 3000 }, { a: 0.02, t60: 0.28 }, 'pink');
    } else if (kind === 'metal') {
      const f = r.range(850, 1450);
      ring(o, r, sr, 0, f, [1, 2.76, 5.4, 8.9], 0.85, 0.45);
      ring(o, r, sr, 0, f * r.range(1.3, 1.6), [1, 2.4], 0.3, 0.3);
      nz(o, r, sr, 0, 0.05, 0.4, { type: 'highpass', f: 3500 }, { t60: 0.04 });
    } else if (kind === 'wood') {
      ring(o, r, sr, 0, r.range(240, 380), [1, 2.31, 4.1, 6.2], 0.9, 0.14);
      nz(o, r, sr, 0, 0.03, 0.45, { type: 'bandpass', f: 2000, q: 1 }, { t60: 0.02 });
      grains(o, r, sr, { n: 22, at: 0.005, spread: 0.12, fLo: 1800, fHi: 6000, amp: 0.18, len: 4 });
    } else if (kind === 'glass') {
      ring(o, r, sr, 0, r.range(3000, 4200), [1, 1.71, 2.53], 0.35, 0.3);
      grains(o, r, sr, { n: 70, at: 0.003, spread: 0.6, fLo: 2800, fHi: 9500, amp: 0.3, len: 14, q: 8 });
    } else if (kind === 'sand') {
      nz(o, r, sr, 0, 0.18, 0.9, { type: 'lowpass', f: 650, q: 0.7 }, { a: 0.002, t60: 0.12 }, 'brown');
      thump(o, sr, 0, 130, 60, 0.08, 0.4);
      grains(o, r, sr, { n: 90, at: 0.01, spread: 0.35, fLo: 2000, fHi: 7500, amp: 0.13, len: 3 });
    } else {
      // A body (armoured): a dull thud, a fabric slap, a plate's tick; nothing gory.
      thump(o, sr, 0, 150, 60, 0.12, 1, 2);
      nz(o, r, sr, 0, 0.08, 0.6, { type: 'lowpass', f: 1500, q: 0.7 }, { a: 0.001, t60: 0.06 });
      nz(o, r, sr, 0.004, 0.1, 0.3, { type: 'bandpass', f: 900, q: 1.1 }, { a: 0.003, t60: 0.08 }, 'pink');
      ring(o, r, sr, 0.002, r.range(1600, 2100), [1, 2.2], 0.15, 0.04);
    }
    return finish(o, sr, 0.9);
  };
}

const WHIZ: Design = (r, sr) => {
  const o = secs(0.25, sr);
  // Doppler: the band falls as it passes, the crack at the closest point.
  nz(o, r, sr, 0, 0.22, 0.8, { type: 'bandpass', f: r.range(3400, 4400), q: 2.5, to: r.range(1300, 1800) }, { a: 0.04, t60: 0.14 });
  nz(o, r, sr, 0.04, 0.004, 0.9, { type: 'highpass', f: 4000 }, { a: 0.0002, t60: 0.003 });
  return finish(o, sr, 0.8);
};

// ------------------------------------------------------------------ the body moving
export type StepSurface = 'concrete' | 'metal' | 'wood' | 'sand' | 'wet' | 'gravel';

function step(s: StepSurface): Design {
  return (r, sr) => {
    const o = secs(s === 'metal' ? 0.5 : 0.3, sr);
    const toe = r.range(0.045, 0.07);
    if (s === 'concrete' || s === 'wet') {
      nz(o, r, sr, 0, 0.06, 0.7, { type: 'bandpass', f: r.range(900, 1400), q: 0.9 }, { a: 0.001, t60: 0.045 });
      thump(o, sr, 0, 115, 60, 0.04, 0.3);
      nz(o, r, sr, toe, 0.05, 0.45, { type: 'highpass', f: 2200 }, { a: 0.002, t60: 0.04 });
      grains(o, r, sr, { n: 10, at: toe, spread: 0.04, fLo: 3000, fHi: 7000, amp: 0.18, len: 2 });
      if (s === 'wet') {
        nz(o, r, sr, 0.004, 0.16, 0.5, { type: 'highpass', f: 1500, q: 0.7 }, { a: 0.005, t60: 0.12 }, 'white');
        for (let i = 0; i < 10; i++) ring(o, r, sr, r.range(0.005, 0.12), r.range(1400, 4200), [1], 0.06, 0.02);
      }
    } else if (s === 'metal') {
      thump(o, sr, 0, 140, 70, 0.04, 0.5);
      ring(o, r, sr, 0, r.range(300, 520), [1, 2.43, 3.91, 5.13], 0.55, 0.28);
      grains(o, r, sr, { n: 8, at: 0.01, spread: 0.06, fLo: 2000, fHi: 5000, amp: 0.15, len: 4 });
      ring(o, r, sr, toe, r.range(600, 900), [1, 2.6], 0.2, 0.12);
    } else if (s === 'wood') {
      ring(o, r, sr, 0, r.range(150, 230), [1, 2.1, 3.3], 0.8, 0.09);
      nz(o, r, sr, 0, 0.05, 0.4, { type: 'bandpass', f: 700, q: 1 }, { a: 0.001, t60: 0.04 });
      nz(o, r, sr, toe, 0.04, 0.25, { type: 'bandpass', f: 1600, q: 1 }, { a: 0.002, t60: 0.03 });
      if (r.next() < 0.3) {
        const c = sweep(Math.ceil(0.16 * sr), r.range(520, 650), r.range(450, 520), 0.15, sr);
        env(c, 0.03, 0.15, sr);
        filter(c, 'bandpass', 900, 3, sr);
        mix(o, sat(c, 3), 0.02, 0.12, sr);
      }
    } else if (s === 'sand') {
      nz(o, r, sr, 0, 0.1, 0.55, { type: 'lowpass', f: 420, q: 0.7 }, { a: 0.004, t60: 0.08 }, 'brown');
      grains(o, r, sr, { n: 110, at: 0, spread: 0.12, fLo: 1500, fHi: 6000, amp: 0.22, len: 3 });
      grains(o, r, sr, { n: 55, at: toe, spread: 0.08, fLo: 2500, fHi: 7000, amp: 0.15, len: 3 });
    } else {
      thump(o, sr, 0, 120, 60, 0.035, 0.2);
      grains(o, r, sr, { n: 90, at: 0, spread: 0.14, fLo: 1000, fHi: 5000, amp: 0.55, len: 8, q: 1.5 });
      grains(o, r, sr, { n: 40, at: toe, spread: 0.08, fLo: 1500, fHi: 6000, amp: 0.35, len: 6, q: 1.5 });
    }
    return finish(o, sr, 0.8);
  };
}

const MOVES: Record<string, Design> = {
  // 90.0: a frag's throw: the arm's swish, the spoon flying off.
  throw: (r, sr) => { const o = secs(0.32, sr); nz(o, r, sr, 0, 0.22, 0.7, { type: 'bandpass', f: 500, q: 1.2, to: 1900 }, { a: 0.012, t60: 0.18 }, 'pink'); ring(o, r, sr, 0.12, 3300, [1, 1.9, 2.8], 0.25, 0.08); return finish(o, sr, 0.7); },
  land: (r, sr) => { const o = secs(0.45, sr); thump(o, sr, 0, 95, 40, 0.18, 1, 1.8); nz(o, r, sr, 0, 0.2, 0.6, { type: 'lowpass', f: 900, q: 0.7 }, { a: 0.003, t60: 0.15 }, 'brown'); grains(o, r, sr, { n: 16, at: 0.01, spread: 0.15, fLo: 2000, fHi: 6000, amp: 0.15, len: 5 }); return finish(o, sr, 0.85); },
  jump: (r, sr) => { const o = secs(0.3, sr); nz(o, r, sr, 0, 0.2, 0.6, { type: 'bandpass', f: 1500, q: 0.8 }, { a: 0.02, t60: 0.14 }, 'pink'); nz(o, r, sr, 0, 0.04, 0.4, { type: 'highpass', f: 2200 }, { a: 0.002, t60: 0.03 }); return finish(o, sr, 0.6); },
  slide: (r, sr) => { const o = secs(1.0, sr); nz(o, r, sr, 0, 1.0, 1, { type: 'lowpass', f: 1500, q: 0.7, to: 450 }, { a: 0.03, t60: 0.9 }, 'pink'); grains(o, r, sr, { n: 160, at: 0, spread: 0.8, fLo: 1500, fHi: 5500, amp: 0.18, len: 4 }); return finish(o, sr, 0.85); },
  mantle: (r, sr) => { const o = secs(0.4, sr); nz(o, r, sr, 0, 0.04, 0.8, { type: 'bandpass', f: 1200, q: 1 }, { a: 0.001, t60: 0.03 }); nz(o, r, sr, 0.07, 0.04, 0.7, { type: 'bandpass', f: 1050, q: 1 }, { a: 0.001, t60: 0.03 }); nz(o, r, sr, 0.03, 0.3, 0.4, { type: 'bandpass', f: 1800, q: 0.8 }, { a: 0.03, t60: 0.22 }, 'pink'); return finish(o, sr, 0.7); },
  hit: (r, sr) => { const o = secs(0.08, sr); ring(o, r, sr, 0, 2900, [1, 2], 1, 0.045); nz(o, r, sr, 0, 0.006, 0.6, { type: 'highpass', f: 6000 }, { t60: 0.005 }); return finish(o, sr, 0.7); },
  kill: (r, sr) => { const o = secs(0.35, sr); ring(o, r, sr, 0, 2900, [1, 2], 0.8, 0.045); ring(o, r, sr, 0.045, 1100, [1, 1.5, 2], 1, 0.22); return finish(o, sr, 0.75); },
};

// ------------------------------------------------------------------ 90.0: explosives
/**
 * A frag going off: the crack of the charge, the blast's body (brown noise, its top falling fast,
 * driven hard), the pressure wave (a sub thump), fragments and grit raining down for a second and a
 * half, the rolling tail off the buildings. `far`: past ~45 m the crack and the top gone, a low
 * rumble and a longer roll.
 */
function blast(far: boolean): Design {
  return (rng, sr) => {
    const len = far ? 3.2 : 2.8;
    const out = secs(len, sr);
    const p = rng.range(0.92, 1.08);
    if (!far) {
      nz(out, rng, sr, 0, 0.02, 1.4, { type: 'highpass', f: 1800 * p }, { a: 0.0002, t60: 0.02 }, 'white', 2.2);
      nz(out, rng, sr, 0, 0.5, 1.6, { type: 'lowpass', f: 5200 * p, q: 0.8, to: 420 }, { a: 0.0006, t60: 0.38 }, 'brown', 4);
    } else nz(out, rng, sr, 0.004, 0.8, 1.3, { type: 'lowpass', f: 900 * p, q: 0.8, to: 160 }, { a: 0.006, t60: 0.6 }, 'brown', 2.5);
    thump(out, sr, 0, 78 * p, 26, far ? 1.1 : 0.85, far ? 1.1 : 1.5, 2.2);
    if (!far) {
      // Fragments and grit: the first ones sharp, then the patter of what was thrown up landing.
      grains(out, rng, sr, { n: 70, at: 0.01, spread: 0.25, fLo: 2500, fHi: 7000, amp: 0.32, len: 3 });
      grains(out, rng, sr, { n: 120, at: 0.35, spread: 1.4, fLo: 1200, fHi: 5000, amp: 0.16, len: 6 });
    }
    // The tail: the bang rolling back off the walls and away.
    const tail = secs(len, sr);
    nz(tail, rng, sr, 0, len, 1, { type: 'lowpass', f: far ? 600 : 1300, q: 0.6, to: 140 }, { a: 0.05, t60: far ? 2.4 : 1.9 }, 'brown');
    mix(out, tail, 0.02, far ? 0.9 : 0.7, sr);
    reflect(out, sr, [[0.07 + rng.range(0, 0.03), 0.3], [0.16 + rng.range(0, 0.05), 0.22], [0.31 + rng.range(0, 0.08), 0.14]], far ? 700 : 1600);
    sat(out, 1.4);
    return finish(out, sr, 0.92);
  };
}

/** 90.1: a rocket leaving the tube: the launch charge's whump, the backblast's roar, the motor lighting. */
const ROCKET_LAUNCH: Design = (r, sr) => {
  const o = secs(1.2, sr);
  thump(o, sr, 0, 125 * r.range(0.95, 1.05), 42, 0.35, 1.2, 2);
  nz(o, r, sr, 0, 0.45, 1.3, { type: 'lowpass', f: 2600, q: 0.8, to: 350 }, { a: 0.002, t60: 0.32 }, 'brown', 3);
  nz(o, r, sr, 0.03, 0.9, 0.55, { type: 'bandpass', f: 1800, q: 0.7, to: 900 }, { a: 0.04, t60: 0.7 }, 'white', 1.5);
  reflect(o, sr, [[0.05, 0.25], [0.12, 0.15]], 2000);
  return finish(o, sr, 0.9);
};

/** A grenade's body hitting the ground or a wall: a dull steel clink and a knock. */
const NADE_BOUNCE: Design = (r, sr) => {
  const o = secs(0.3, sr);
  ring(o, r, sr, 0, r.range(1500, 2100), [1, 2.32, 3.7, 5.1], 0.7, 0.12);
  nz(o, r, sr, 0, 0.03, 0.8, { type: 'bandpass', f: 900, q: 1 }, { t60: 0.025 });
  thump(o, sr, 0, 260, 140, 0.05, 0.35);
  return finish(o, sr, 0.8);
};

/** Every buffer the bank renders: its key, how many variants, the design. */
export const DESIGNS: [string, number, Design][] = [
  ...(['pistol', 'smg', 'rifle', 'shotgun'] as const).flatMap((k) => [[`shot_${k}`, 6, gunshot(k, false)], [`far_${k}`, 4, gunshot(k, true)]] as [string, number, Design][]),
  ...Object.entries(RELOADS).map(([k, d]) => [k, k === 'casing' ? 6 : k === 'shotgun_in' ? 5 : 3, d] as [string, number, Design]),
  ...(['concrete', 'metal', 'wood', 'glass', 'sand', 'body'] as const).map((k) => [`impact_${k}`, 6, impact(k)] as [string, number, Design]),
  ['whiz', 5, WHIZ],
  ...(['concrete', 'metal', 'wood', 'sand', 'wet', 'gravel'] as const).map((k) => [`step_${k}`, 8, step(k)] as [string, number, Design]),
  ...Object.entries(MOVES).map(([k, d]) => [k, k === 'slide' ? 2 : 3, d] as [string, number, Design]),
  ['blast', 4, blast(false)],
  ['far_blast', 3, blast(true)],
  ['nade_bounce', 4, NADE_BOUNCE],
  ['rocket_launch', 3, ROCKET_LAUNCH],
];
