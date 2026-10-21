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
