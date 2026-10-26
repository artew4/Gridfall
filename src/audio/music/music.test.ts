import { describe, expect, it } from 'vitest';
import { TRACKS, fadeCurve } from './MusicManager';
import { PATTERN_THEMES } from './Themes';

describe('music manager', () => {
  it('the crossfade is equal-power: the two curves sum to unit power at every point', () => {
    const up = fadeCurve(true), down = fadeCurve(false);
    expect(up[0]).toBe(0);
    expect(up[up.length - 1]).toBeCloseTo(1, 9);
    for (let i = 0; i < up.length; i++) expect(up[i] ** 2 + down[i] ** 2).toBeCloseTo(1, 6);
  });

  it('every track but Tokyo and Maglev (the Score) has a procedural placeholder', () => {
    for (const id of TRACKS) expect(id === 'tokyo_theme' || id === 'maglev_theme' || id in PATTERN_THEMES).toBe(true);
  });
});

import { FS_PHRYGIAN, DESERT_THEME, HIJAZ, HIJAZ_KAR, JUNGLE_THEME, makePhrase, type ThemeDef } from './Themes';
import { mulberry32 } from '../../core/math';

/** Play a theme's every layer for `bars` bars at `intensity`, recording each instrument call. */
function record(def: ThemeDef, bars: number, intensity = 1) {
  const calls: { fn: string; layer: string; args: unknown[] }[] = [];
  let layer = '';
  const I = new Proxy({}, { get: (_t, fn: string) => (...args: unknown[]) => void calls.push({ fn, layer, args: args.slice(2) }) }) as never;
  const rnd = mulberry32(5);
  for (let bar = 0; bar < bars; bar++) for (let step = 0; step < 16; step++) {
    const chord = def.chords[Math.floor(bar / def.barsPerChord) % def.chords.length];
    for (const l of def.layers) {
      // (A layer plays only from its intensity up, as PatternTheme brings it in.)
      if (l.on > 0 && intensity < l.on) continue;
      layer = l.id;
      l.play({ I, bus: {} as never, t: 0, step, bar, chord, s16: 60 / def.bpm / 4, intensity, rnd });
    }
  }
  return calls;
}
const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);

describe('25.0: the jungle theme is drums and bass only', () => {
  const calls = record(JUNGLE_THEME, 16);
  it('no lead, pluck, rimshot, hats, pads or stabs (the "siren and beeping")', () => {
    const used = new Set(calls.map((c) => c.fn));
    for (const f of ['lead', 'pluck', 'rim', 'hat', 'pad', 'stab', 'riser', 'metal']) expect(used.has(f), f).toBe(false);
    expect(used.has('tribal') && used.has('drone') && used.has('bass')).toBe(true);
  });
  it('every pitched note is low: tonal notes at or under A3 (220 Hz; the old lead sat at 440–880), drums under 100 Hz', () => {
    for (const c of calls) {
      if (c.fn === 'bass' || c.fn === 'drone') expect(c.args[0] as number).toBeLessThanOrEqual(57);
      if (c.fn === 'tribal') expect(c.args[0] as number).toBeLessThan(100);
    }
  });
});

describe('59.0: the desert theme is an industrial combat score (F♯ Phrygian, half-time)', () => {
  it('from the first bar (no fight): the half-time kick and the snare on three, sixteenth ticks, the growl riff, a bed', () => {
    const calm = record(DESERT_THEME, 4, 0);
    const at = (fn: string) => calm.filter((c) => c.fn === fn);
    expect(at('slam').length).toBe(10);
    expect(at('crack').length).toBeGreaterThanOrEqual(4);
    expect(at('tick').length).toBe(64);
    expect(at('growl').length).toBe(32);
    expect(at('pad').length).toBeGreaterThan(0);
    for (const f of ['power', 'scream', 'glitch', 'pluck']) expect(at(f).length, f).toBe(0);
  });
  it('in a fight: the chugs, the arp, the hook, glitches, impacts, the riser and the kick on every beat', () => {
    const hot = record(DESERT_THEME, 16, 1);
    for (const f of ['power', 'pluck', 'scream', 'glitch', 'impact', 'riser', 'crash']) expect(hot.some((c) => c.fn === f), f).toBe(true);
    expect(hot.filter((c) => c.fn === 'slam').length).toBeGreaterThan(record(DESERT_THEME, 16, 0).filter((c) => c.fn === 'slam').length);
  });
  it('the hook and the arp are in F♯ Phrygian, and the hook is the same every time round', () => {
    const ph = new Set(FS_PHRYGIAN.map((n) => n % 12));
    expect([...ph].sort((a, b) => a - b)).toEqual([1, 2, 4, 6, 7, 9, 11]);
    const hot = record(DESERT_THEME, 16, 1);
    for (const c of hot) if (c.fn === 'scream' || c.fn === 'pluck') expect(ph.has((c.args[0] as number) % 12), String(c.args[0])).toBe(true);
    const hook = hot.filter((c) => c.fn === 'scream').map((c) => c.args[0]);
    expect(hook.slice(0, hook.length / 4)).toEqual(hook.slice(hook.length / 4, hook.length / 2));
  });
  it('phrases walk by step and end on the tonic or the fifth', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const p = makePhrase(r, 4, 0, 11);
      for (let j = 1; j < p.length - 1; j++) expect(Math.abs(p[j][1] - p[j - 1][1])).toBeLessThanOrEqual(2);
      expect([0, 4, 7, 11]).toContain(p[p.length - 1][1]);
    }
  });
  it('the Hijaz scales stay as data (the 25.0 maqam): its augmented second', () => {
    expect([...new Set(HIJAZ.map((n) => n % 12))].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 8, 9, 11]);
    expect(HIJAZ_KAR.some((n) => n % 12 === 3)).toBe(true);
  });
});
void midiHz;
