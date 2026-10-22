import { describe, expect, it } from 'vitest';
import { BULK, CARS, MAGLEV_AI, PLATFORM_BLOCKERS, TRACK, TRAIN, forwardOf, inBase } from './MaglevLayout';
import { ARENA, applyProfile } from '../../enemies/arena/ArenaCtx';

describe('20.0: Maglev Terminal overhaul', () => {
  it("the platform's blockers cover its whole width (no line along it from apron to apron)", () => {
    // From beside the train to the track bed's edge (the wall's top is walked too): every x, no gap.
    const lo = TRAIN.x + 0.1, hi = TRACK.x0 - 0.1;
    const xs = PLATFORM_BLOCKERS.filter((b) => b.h >= 1.8).map((b) => b.x).sort((a, c) => a[0] - c[0]);
    let cur = lo;
    for (const [a, c] of xs) {
      if (a > cur) break;
      cur = Math.max(cur, c);
    }
    expect(cur).toBeGreaterThanOrEqual(hi);
  });

  it('the bulkheads stagger: car 2 opens to +x, cars 1 and 3 to -x, so the aisle has no straight line', () => {
    const [o0, o1] = BULK.open;
    expect(o0).toBeGreaterThan(0);
    // A straight line along the aisle at any x must hit car 2's bulkhead or the others'.
    for (let x = -1.1; x <= 1.1; x += 0.05) {
      const throughCar2 = x > o0 && x < o1;
      const throughOthers = x > -o1 && x < -o0;
      expect(throughCar2 && throughOthers).toBe(false);
    }
    expect(CARS.length).toBe(3);
    expect(o1 - o0).toBeGreaterThan(0.75);
  });

  it('forward respawns sit on each team\'s own approach, mirrored, never in a yard', () => {
    const a = forwardOf('alpha'), o = forwardOf('omega');
    expect(o.map((p) => [p.x, -p.z])).toEqual(a.map((p) => [p.x, p.z]));
    for (const p of a) {
      expect(p.z).toBeGreaterThan(25);
      expect(inBase(p, 'alpha') || inBase(p, 'omega')).toBe(false);
    }
  });

  it('the hall\'s AI profile turns on the under-fire reaction (off everywhere else) and keeps riflemen moving', () => {
    expect(ARENA.underFire.on).toBe(false);
    const undo = applyProfile(MAGLEV_AI);
    expect(ARENA.underFire.on).toBe(true);
    expect(ARENA.ads.focusMove).toBeGreaterThan(0.12);
    undo();
    expect(ARENA.underFire.on).toBe(false);
  });
});

describe('20.0: the corporate kit (22.0: colour blocks)', () => {
  it("light gear in the hall's own values (the night kit is near black), team accents kept", async () => {
    const { OPERATOR_KITS, kitColours } = await import('../../entities/enemies/operators');
    const { Color } = await import('three');
    const luma = (hex: number) => {
      const c = new Color(hex);
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    };
    expect(luma(kitColours('night', 'alpha').armor)).toBeLessThan(0.05);
    expect(luma(kitColours('corporate', 'alpha').armor)).toBeGreaterThan(0.5);
    expect(luma(kitColours('corporate', 'alpha').cloth)).toBeGreaterThan(0.4);
    // Both teams keep their accent hue (cyan-blue for ALPHA, red-orange for OMEGA).
    const a = (OPERATOR_KITS.corporate.alpha.buildGunner().glowMat as { color: { r: number; b: number } }).color;
    const o = (OPERATOR_KITS.corporate.omega.buildGunner().glowMat as { color: { r: number; b: number } }).color;
    expect(a.b).toBeGreaterThan(a.r);
    expect(o.r).toBeGreaterThan(o.b);
  });
});
