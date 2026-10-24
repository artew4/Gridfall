import { describe, expect, it } from 'vitest';
import { ARENA, PRESSURE, pressureScale } from './ArenaCtx';
import { Pressure } from './Pressure';
import { wantsAim } from './DeathmatchAI';
import { ARMORY } from '../../entities/weapons/armory';

describe('50.0: the fight with the human', () => {
  it('his form: kills less 1.5 × deaths over the window, scaled and clamped; old events drop out', () => {
    const p = new Pressure();
    p.reset();
    expect(p.update(0)).toBe(0);
    for (let i = 0; i < 4; i++) p.kill(i);
    expect(p.update(5)).toBeCloseTo(4 / ARENA.pressure.scale, 6);
    expect(PRESSURE.form).toBeCloseTo(4 / ARENA.pressure.scale, 6);
    for (let i = 0; i < 20; i++) p.kill(10 + i);
    expect(p.update(31)).toBe(1);
    // A window later it is all forgotten.
    expect(p.update(31 + ARENA.pressure.window + 1)).toBe(0);
    for (let i = 0; i < 6; i++) p.death(200 + i);
    expect(p.update(210)).toBe(-ARENA.pressure.ease);
    p.reset();
    expect(PRESSURE.form).toBe(0);
  });

  it('in form the other team reacts faster and shoots tighter; struggling, slower and wider; even, as before', () => {
    expect(pressureScale(0.3, 0)).toBe(1);
    expect(pressureScale(0.3, 1)).toBeCloseTo(0.7, 6);
    expect(pressureScale(0.3, -0.6)).toBeGreaterThan(1.2);
    expect(pressureScale(0.3, -0.6)).toBeLessThan(1.3);
  });

  it('return fire: a rifle aims past its range only when told to (the reach), never past it on its own', () => {
    const ar = ARMORY.ar.bot;
    expect(wantsAim(50, false, ar)).toBe(false);
    expect(wantsAim(50, false, ar, ar.maxRange * ARENA.longFire.mult.ar)).toBe(true);
    expect(wantsAim(80, false, ar, ar.maxRange * ARENA.longFire.mult.ar)).toBe(false);
    // The shotgun never fires long.
    expect(ARENA.longFire.mult.shotgun).toBe(1);
  });
});
