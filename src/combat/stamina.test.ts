import { describe, expect, it } from 'vitest';
import { STAMINA, Stamina, WEIGHT, weightOf } from './Stamina';

/** Sprint flat out from full until it may not: seconds. */
function sprintTime(s: Stamina) {
  let t = 0;
  while (s.step(1 / 60, true, false) && t < 60) t += 1 / 60;
  return t;
}

describe('30.0 stamina', () => {
  it('a full pool lasts the weight class\'s sprint: pistol 9 s, SMG 5.5 s, rifle and shotgun 3.5 s', () => {
    expect(sprintTime(new Stamina(WEIGHT.pistol))).toBeCloseTo(9, 0);
    expect(sprintTime(new Stamina(WEIGHT.smg))).toBeCloseTo(5.5, 0);
    expect(sprintTime(new Stamina(WEIGHT.rifle))).toBeCloseTo(3.5, 0);
    expect(sprintTime(new Stamina(WEIGHT.shotgun))).toBeCloseTo(3.5, 0);
  });

  it('run dry: forced to walk until the pool is back to the resume threshold', () => {
    const s = new Stamina(WEIGHT.rifle);
    sprintTime(s);
    expect(s.exhausted).toBe(true);
    expect(s.canSprint).toBe(false);
    let t = 0;
    while (!s.canSprint) {
      s.step(1 / 60, true, false); // still holding sprint: no sprint, but it recovers
      t += 1 / 60;
    }
    expect(s.value).toBeGreaterThanOrEqual(STAMINA.resume);
    // 0.6 s delay, then 20% of a 10 s recovery: ~2.6 s.
    expect(t).toBeGreaterThan(2.3);
    expect(t).toBeLessThan(3);
  });

  it('recovery: the pistol fastest, standing still faster than walking, nothing during the first 0.6 s', () => {
    const rec = (p: typeof WEIGHT.pistol, still: boolean) => {
      const s = new Stamina(p);
      s.value = 0;
      for (let i = 0; i < 120; i++) s.step(1 / 60, false, still);
      return s.value;
    };
    expect(rec(WEIGHT.pistol, false)).toBeGreaterThan(rec(WEIGHT.smg, false));
    expect(rec(WEIGHT.smg, false)).toBeGreaterThan(rec(WEIGHT.rifle, false));
    expect(rec(WEIGHT.rifle, true)).toBeGreaterThan(rec(WEIGHT.rifle, false));
    const s = new Stamina(WEIGHT.pistol);
    s.value = 50;
    s.step(1 / 60, true, false);
    for (let i = 0; i < 30; i++) s.step(1 / 60, false, true);
    expect(s.value).toBeLessThan(50);
  });

  it('a slide needs the sprint and pays its cost; not from an empty pool', () => {
    const s = new Stamina(WEIGHT.smg);
    expect(s.slide()).toBe(true);
    expect(s.value).toBe(STAMINA.max - STAMINA.slideCost);
    s.value = STAMINA.slideCost - 1;
    expect(s.slide()).toBe(false);
  });

  it('weight classes by the player\'s sound family or a bot\'s armory id', () => {
    expect(weightOf('plasma')).toBe('pistol');
    expect(weightOf('pistol')).toBe('pistol');
    expect(weightOf('smg')).toBe('smg');
    expect(weightOf('ar')).toBe('rifle');
    expect(weightOf('rifle')).toBe('rifle');
    expect(weightOf('shotgun')).toBe('shotgun');
  });

  it('off: an endless sprint (the A/B)', () => {
    STAMINA.on = false;
    try {
      const s = new Stamina(WEIGHT.rifle);
      for (let i = 0; i < 6000; i++) expect(s.step(1 / 60, true, false)).toBe(true);
    } finally {
      STAMINA.on = true;
    }
  });
});
