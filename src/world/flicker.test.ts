import { describe, expect, it } from 'vitest';
import { Glows, type Glow } from './Glows';
import { heldNoise } from '../core/math';

/** On/off jumps per second of a glow sampled at `hz` for 120 s (what the player sees at that frame rate). */
function jumps(mode: Glow['mode'], hz: number, seed = 12.3) {
  const g = { mode, seed } as Glow;
  const f = Glows.prototype.flickerValue;
  let last = f.call(null, g, 0);
  let n = 0;
  for (let t = 1 / hz; t < 120; t += 1 / hz) {
    const v = f.call(null, g, t);
    if (Math.abs(v - last) > 0.3) n++;
    last = v;
  }
  return n / 120;
}

describe('light flicker is frame-rate independent (4.1 High preset bug)', () => {
  it('heldNoise holds within a 1/60 s step and is in [0, 1)', () => {
    expect(heldNoise(1.0001, 3)).toBe(heldNoise(1.0099, 3));
    for (let t = 0; t < 5; t += 0.013) {
      const v = heldNoise(t, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('flicker and broken signs jump as often at 120 FPS as at 60 FPS', () => {
    for (const mode of ['flicker', 'broken'] as const) {
      const a = jumps(mode, 60), b = jumps(mode, 120);
      expect(a).toBeGreaterThan(0);
      // Same visible rate within 10% (it doubled before the fix).
      expect(Math.abs(b - a) / a).toBeLessThan(0.1);
    }
  });
});
