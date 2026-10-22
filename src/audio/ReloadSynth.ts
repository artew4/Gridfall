import type { GunSound } from '../entities/types';

/*
  26.0, the reload, synthesised per gun. Each stage of a reload is a recipe: a few layers on the audio
  clock, every one an envelope (attack, exponential decay) on one of three voices:

    tone   an oscillator gliding f0 -> f1                 (thumps: a sine falling through 60-200 Hz)
    noise  filtered noise, its cutoff gliding f -> fEnd    (slides, scrapes, zips, the crack of a hit)
    metal  inharmonic sine partials over a base            (clicks, latches, the ring of a slammed part)

  Recipes are plain data, so the engine only builds nodes and schedules them (no timers, no work after
  the call: everything plays on the audio thread), and the tests can read their spectrum and length.

    pistol   high and short: a button click, a click-clack of the mag, the slide back and slammed
    smg      a ratchet zip (clicks speeding up and rising) on the way out, a mag slap in, a snap
    rifle    heavier, three stages: mag out (release, slide, drop), mag in (scrape, seated thud),
             bolt release (spring, then a low slam that rings)
    shotgun  low: one shell pushed into the tube per `in`, then the pump racked at the end (cha-chunk)
*/

export type ReloadStage = 'out' | 'in' | 'rack';
export type ReloadKind = 'pistol' | 'smg' | 'rifle' | 'shotgun';

export type Layer =
  | { v: 'tone'; at: number; wave: OscillatorType; f0: number; f1: number; peak: number; attack: number; decay: number }
  | { v: 'noise'; at: number; color: 'white' | 'pink' | 'brown'; filter: BiquadFilterType; f: number; q: number; peak: number; attack: number; decay: number; fEnd?: number }
  | { v: 'metal'; at: number; base: number; peak: number; decay: number; ratios: number[] };

/** The neon pistol's 'plasma' is still a pistol in the hand. */
export function reloadKind(sound: GunSound): ReloadKind {
  return sound === 'plasma' ? 'pistol' : sound;
}

const tone = (at: number, wave: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number): Layer => ({ v: 'tone', at, wave, f0, f1, peak, attack, decay });
const noise = (at: number, color: 'white' | 'pink' | 'brown', filter: BiquadFilterType, f: number, q: number, peak: number, attack: number, decay: number, fEnd?: number): Layer => ({ v: 'noise', at, color, filter, f, q, peak, attack, decay, fEnd });
const metal = (at: number, base: number, peak: number, decay: number, ratios: number[]): Layer => ({ v: 'metal', at, base, peak, decay, ratios });

/** A ratchet: `n` clicks over `dur` s, each closer to the last (speeding up) and higher. */
function ratchet(at: number, n: number, dur: number, f0: number, f1: number, peak: number): Layer[] {
  const out: Layer[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    // Times on a square root: wide gaps first, then a blur, like a zip pulled faster.
    out.push(noise(at + dur * Math.sqrt(u), 'white', 'bandpass', f0 + (f1 - f0) * u, 6, peak * (0.7 + 0.3 * u), 0.0008, 0.012));
  }
  return out;
}

const RECIPES: Record<ReloadKind, Record<ReloadStage, Layer[]>> = {
  pistol: {
    // The release button, the mag sliding free.
    out: [tone(0, 'square', 3400, 3200, 0.05, 0.0005, 0.008), noise(0.01, 'white', 'highpass', 4200, 0.8, 0.12, 0.004, 0.05, 7000)],
    // Click-clack: the mag's lips catch, then it latches 45 ms later.
    in: [metal(0, 3300, 0.06, 0.035, [1, 2.6, 4.1]), noise(0, 'white', 'highpass', 5200, 0.7, 0.16, 0.0005, 0.018), metal(0.045, 2600, 0.08, 0.04, [1, 2.3, 3.9]), noise(0.045, 'white', 'bandpass', 4200, 1.8, 0.2, 0.0005, 0.02)],
    // The slide back (a bright rasp), then slammed home.
    rack: [noise(0, 'white', 'bandpass', 3800, 2, 0.12, 0.004, 0.04, 6200), metal(0.05, 2900, 0.1, 0.05, [1, 2.4, 4.4]), noise(0.05, 'white', 'highpass', 4800, 0.7, 0.22, 0.0005, 0.025)],
  },
  smg: {
    // A click, then the ratchet zip as the mag is stripped out.
    out: [tone(0, 'square', 2600, 2500, 0.05, 0.0005, 0.01), ...ratchet(0.03, 7, 0.13, 1800, 4200, 0.6), noise(0.03, 'white', 'bandpass', 1500, 1.4, 0.12, 0.03, 0.1, 5000)],
    // The mag slap: a palm on polymer (a soft low thump and a broad crack), then the catch.
    in: [tone(0, 'sine', 190, 85, 0.3, 0.002, 0.07), noise(0, 'pink', 'bandpass', 1300, 0.9, 0.45, 0.001, 0.06, 700), noise(0, 'white', 'highpass', 2600, 0.7, 0.2, 0.0005, 0.02), metal(0.03, 2200, 0.06, 0.04, [1, 2.5])],
    // The charging handle: a short ratchet back, a snap forward.
    rack: [...ratchet(0, 5, 0.07, 3600, 2200, 0.45), metal(0.1, 2000, 0.1, 0.06, [1, 2.2, 3.7]), noise(0.1, 'white', 'highpass', 3200, 0.7, 0.2, 0.0005, 0.03)],
  },
  rifle: {
    // Mag out: the release (a hard click), the mag sliding down the well, then it hits the hand.
    out: [tone(0, 'square', 1500, 1400, 0.07, 0.0005, 0.012), metal(0, 1700, 0.05, 0.04, [1, 2.3]), noise(0.02, 'white', 'bandpass', 900, 1.3, 0.16, 0.01, 0.13, 500), tone(0.2, 'sine', 140, 70, 0.22, 0.002, 0.08), noise(0.2, 'brown', 'lowpass', 500, 0.7, 0.4, 0.002, 0.07)],
    // Mag in: a scrape up the well, then seated with a thud and a latch.
    in: [noise(0, 'white', 'bandpass', 700, 1.4, 0.13, 0.01, 0.07, 1600), tone(0.08, 'sine', 120, 58, 0.42, 0.002, 0.13), noise(0.08, 'brown', 'lowpass', 650, 0.7, 0.4, 0.001, 0.08), metal(0.08, 1150, 0.09, 0.07, [1, 2.2, 3.6]), noise(0.08, 'white', 'highpass', 2400, 0.7, 0.18, 0.0005, 0.025)],
    // Bolt release: the spring's rasp, then the carrier slams home low and rings.
    rack: [noise(0, 'white', 'bandpass', 1100, 1.5, 0.12, 0.004, 0.05, 2600), tone(0.06, 'sine', 95, 44, 0.4, 0.002, 0.16), noise(0.06, 'brown', 'lowpass', 900, 0.7, 0.4, 0.001, 0.09, 200), metal(0.06, 880, 0.12, 0.14, [1, 2.1, 3.6, 5.2]), noise(0.06, 'white', 'highpass', 3000, 0.7, 0.24, 0.0005, 0.03)],
  },
  shotgun: {
    // (A tube gun has no mag out: the reload opens on the first shell.)
    out: [],
    // One shell thumbed into the tube: a low push, a dull click, the follower spring's tick.
    in: [noise(0, 'pink', 'bandpass', 1300, 1.2, 0.2, 0.003, 0.04, 800), tone(0.012, 'sine', 230, 140, 0.25, 0.002, 0.05), metal(0.015, 1050, 0.08, 0.05, [1, 1.9, 3.1]), metal(0.07, 1900, 0.025, 0.03, [1, 2.4])],
    // The pump: racked back (cha-) and slammed forward (-chunk), low and resonant.
    rack: pumpLayers(),
  },
};

/** The heavy pump cha-chunk: also every pump between shots. */
export function pumpLayers(): Layer[] {
  return [
    // Cha: the fore-end dragged back, the bolt unlocking.
    noise(0, 'white', 'bandpass', 750, 1.2, 0.2, 0.006, 0.08, 1800),
    metal(0.01, 520, 0.09, 0.09, [1, 2.2, 3.4]),
    // Chunk: slammed forward, a low thump and the receiver ringing.
    tone(0.17, 'sine', 92, 40, 0.55, 0.002, 0.18),
    noise(0.17, 'brown', 'lowpass', 1000, 0.7, 0.6, 0.001, 0.1, 220),
    noise(0.17, 'white', 'bandpass', 1500, 1.4, 0.24, 0.001, 0.035),
    metal(0.17, 690, 0.13, 0.22, [1, 2.05, 3.3, 4.9]),
  ];
}

/** The recipe for a stage of a gun's reload (shared arrays: read only). */
export function reloadRecipe(kind: ReloadKind, stage: ReloadStage): readonly Layer[] {
  return RECIPES[kind][stage];
}

/** Audio nodes a recipe builds (osc + gain, noise + filter + gain, a sine and gain per partial). */
export function layerNodes(l: Layer) {
  return l.v === 'tone' ? 2 : l.v === 'noise' ? 3 : l.ratios.length * 2;
}

/** How long a recipe sounds (s). */
export function recipeLength(r: readonly Layer[]) {
  let end = 0;
  for (const l of r) end = Math.max(end, l.at + (l.v === 'metal' ? 0.002 + l.decay : l.attack + l.decay));
  return end;
}

/**
 * Where a recipe's energy sits (Hz): each layer's centre weighted by peak x length. A tone counts its
 * mean pitch, noise its filter (a lowpass by half its cutoff), metal its partials falling 1/i.
 */
export function recipeCentroid(r: readonly Layer[]) {
  let sum = 0, w = 0;
  for (const l of r) {
    if (l.v === 'metal') {
      l.ratios.forEach((k, i) => {
        const e = (l.peak / (i + 1)) * (l.decay / (1 + i * 0.5));
        sum += e * l.base * k;
        w += e;
      });
      continue;
    }
    const e = l.peak * (l.attack + l.decay);
    const f = l.v === 'tone' ? Math.sqrt(l.f0 * l.f1) : Math.sqrt(l.f * (l.fEnd ?? l.f)) * (l.filter === 'lowpass' ? 0.5 : l.filter === 'highpass' ? 1.6 : 1);
    sum += e * f;
    w += e;
  }
  return w ? sum / w : 0;
}
