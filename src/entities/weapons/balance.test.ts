import { describe, expect, it } from 'vitest';
import { ARMORY, ARMORY_ORDER } from './armory';
import { falloffAt } from '../../enemies/Projectiles';
import { gunThemeFor, themedArm } from './theme';

/*
  21.0: the asymmetric balance, as arithmetic. A bot has 150 hp; the hitbox multipliers are head 2,
  body 1. Every gun has to win somewhere and lose somewhere.
*/
const HP = 150;
const fall = (f: { near: number; far: number; min: number } | undefined, d: number) => falloffAt(f, d);
/** The player's time to kill a bot at `d` m (every round on the body, or the head). */
function ttk(id: keyof typeof ARMORY, d: number, head = false) {
  const w = ARMORY[id].spec;
  const per = (w.pellets ? w.pellets.count : 1) * w.damage * (head ? 2 * (w.headMul ?? 1) : 1) * fall(w.pellets?.falloff ?? w.falloff, d);
  const shots = Math.ceil(HP / per);
  return { shots, t: (shots - 1) * w.fireInterval };
}

describe('21.0: the asymmetric arsenal (player)', () => {
  it('the shotgun kills in one shell inside 8 m, and is useless past 15 m', () => {
    expect(ttk('shotgun', 5).shots).toBe(1);
    expect(ttk('shotgun', 10).shots).toBeLessThanOrEqual(2);
    expect(ttk('shotgun', 16).shots).toBeGreaterThanOrEqual(10);
  });

  it('the rifle is slower to kill up close than the shotgun, the best past 30 m', () => {
    expect(ttk('ar', 5).t).toBeGreaterThan(ttk('shotgun', 5).t);
    for (const id of ['pistol', 'smg'] as const) expect(ttk('ar', 40).t).toBeLessThan(ttk(id, 40).t);
  });

  it('the SMG out-trades the rifle up close and loses to it far', () => {
    expect(ttk('smg', 8).t).toBeLessThan(ttk('ar', 8).t);
    expect(ttk('smg', 35).t).toBeGreaterThan(ttk('ar', 35).t);
    const s = ARMORY.smg.spec;
    for (const id of ARMORY_ORDER) if (id !== 'smg') expect(s.fireInterval).toBeLessThan(ARMORY[id].spec.fireInterval);
    for (const id of ARMORY_ORDER) if (id !== 'smg') expect(s.damage).toBeLessThanOrEqual(ARMORY[id].spec.damage);
    // Great from the hip, the rifle bad. (39.0: the least kick a shot, many a second: was the steepest
    // per-shot climb; recoil.test.ts holds the four profiles.)
    expect(s.hip).toBeLessThan(1);
    expect(ARMORY.ar.spec.hip).toBeGreaterThanOrEqual(2 * s.hip * 1.5);
    for (const id of ARMORY_ORDER) if (id !== 'smg') expect(s.recoil.kick).toBeLessThan(ARMORY[id].spec.recoil.kick);
  });

  it('the pistol: the fastest sights and draw, full speed aimed, the head the fastest kill in its band', () => {
    const p = ARMORY.pistol.spec;
    expect(p.handling.adsIn).toBe(0.1);
    expect(p.handling.adsMove).toBe(1);
    for (const id of ARMORY_ORDER) if (id !== 'pistol') {
      expect(p.handling.adsIn).toBeLessThan(ARMORY[id].spec.handling.adsIn);
      expect(p.handling.raise).toBeGreaterThan(ARMORY[id].spec.handling.raise);
      expect(p.handling.move).toBeGreaterThan(ARMORY[id].spec.handling.move);
    }
    expect(ttk('pistol', 15, true).t).toBeLessThan(ttk('ar', 15, true).t);
    // Low body damage, falling off past 25 m.
    expect(ttk('pistol', 15).t).toBeGreaterThanOrEqual(ttk('smg', 15).t);
    expect(fall(p.falloff, 25)).toBe(1);
    expect(fall(p.falloff, 40)).toBeLessThan(0.5);
  });

  it('the shotgun is the slowest to carry and to aim, and shoves what it hits', () => {
    const g = ARMORY.shotgun.spec;
    for (const id of ARMORY_ORDER) if (id !== 'shotgun') expect(g.handling.move).toBeLessThan(ARMORY[id].spec.handling.move);
    expect(g.knock!.push).toBeGreaterThan(0);
    // The cannon: the biggest screen shake and FOV kick.
    for (const id of ARMORY_ORDER) if (id !== 'shotgun') {
      expect(g.camera.trauma).toBeGreaterThan(ARMORY[id].spec.camera.trauma);
      expect(g.recoil.fov).toBeGreaterThan(ARMORY[id].spec.recoil.fov);
    }
  });
});

describe('21.0: the bots carry the same shapes', () => {
  const bot = (id: keyof typeof ARMORY, d: number, head = false) => {
    const a = ARMORY[id].bot;
    return Math.ceil(HP / (a.pellets * 20 * a.damage * (head ? 2 * (a.headMul ?? 1) : 1) * falloffAt(a.falloff, d)));
  };
  it('a shotgun shell drops a bot inside 8 m; three pistol head hits do; the SMG needs the most rounds', () => {
    expect(bot('shotgun', 6)).toBe(1);
    expect(bot('pistol', 10, true)).toBe(3);
    for (const id of ['pistol', 'ar'] as const) expect(bot('smg', 10)).toBeGreaterThan(bot(id, 10));
  });
  it('the pistol runs fastest and keeps it while aiming; the shotgun slides most', () => {
    const p = ARMORY.pistol.bot.agility, g = ARMORY.shotgun.bot.agility;
    expect(p.aimMove).toBe(1);
    for (const id of ARMORY_ORDER) if (id !== 'pistol') expect(p.run).toBeGreaterThan(ARMORY[id].bot.agility.run);
    for (const id of ARMORY_ORDER) if (id !== 'shotgun') expect(g.slide).toBeGreaterThan(ARMORY[id].bot.agility.slide);
  });
});

describe('21.0: weapon themes', () => {
  it('maps to themes: Maglev corporate, the neon maps blaster, the rest military', () => {
    expect(gunThemeFor('maglev')).toBe('corporate');
    for (const s of ['tokyo', 'neonblock', 'docks']) expect(gunThemeFor(s)).toBe('blaster');
    for (const s of ['desert', 'jungle', 'oldport', 'firebase']) expect(gunThemeFor(s)).toBe('military');
  });
  it('46.0: every gun fires bullets on every map, the player\'s and the bots\'; a themed bot gun is a copy', () => {
    for (const id of ARMORY_ORDER) {
      expect(ARMORY[id].spec.ballistic).toBe('kinetic');
      expect(ARMORY[id].bot.ballistic).toBe('kinetic');
      for (const t of ['blaster', 'military', 'corporate'] as const) {
        const a = themedArm(ARMORY[id].bot, t);
        expect(a.ballistic).toBe('kinetic');
        expect(a).not.toBe(ARMORY[id].bot);
      }
      // A warm tracer (red over blue): no cyan or magenta plasma.
      const [r, , b] = ARMORY[id].bot.bolt.core;
      expect(r).toBeGreaterThan(b);
    }
  });
});
