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

  it('every track but Tokyo (its Score) has a procedural placeholder', () => {
    for (const id of TRACKS) expect(id === 'tokyo_theme' || id in PATTERN_THEMES).toBe(true);
  });
});

import { D_MINOR, DESERT_THEME, HIJAZ, HIJAZ_KAR, JUNGLE_THEME, makePhrase, type ThemeDef } from './Themes';
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

describe('58.0: the desert theme drives (darksynth in D minor)', () => {
  it('from the first bar (no fight): four on the floor, rolling sixteenths of bass, hats and a pad', () => {
    const calm = record(DESERT_THEME, 4, 0);
    const kicks = calm.filter((c) => c.fn === 'kick').length, bass = calm.filter((c) => c.fn === 'bass').length;
    expect(kicks).toBe(16);
    expect(bass).toBe(64);
    for (const f of ['hat', 'pad']) expect(calm.some((c) => c.fn === f), f).toBe(true);
    expect(DESERT_THEME.bpm).toBeGreaterThanOrEqual(120);
  });
  it('in a fight: the arp, the snare and clap, the saw lead, stabs and the riser', () => {
    const used = new Set(record(DESERT_THEME, 16, 1).map((c) => c.fn));
    for (const f of ['pluck', 'snare', 'clap', 'lead', 'stab', 'riser', 'crash']) expect(used.has(f), f).toBe(true);
  });
  it('every melodic note is in D minor, the maqam gone', () => {
    const dm = new Set(D_MINOR.map((n) => n % 12));
    expect([...dm].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 10]);
    for (const c of record(DESERT_THEME, 16, 1)) if (c.fn === 'lead' || c.fn === 'pluck') expect(dm.has((c.args[0] as number) % 12), String(c.args[0])).toBe(true);
    expect(record(DESERT_THEME, 16, 1).some((c) => c.fn === 'darbuka' || c.fn === 'flute' || c.fn === 'bowed')).toBe(false);
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
