import * as THREE from 'three';
import wavesSrc from '../Waves.ts?raw';
import squadSrc from '../tactics/Squad.ts?raw';
import arcadeSrc from '../../levels/Arcade.ts?raw';
import enemySrc from '../Enemy.ts?raw';
import { describe, expect, it } from 'vitest';
import { ArenaDirector } from './ArenaDirector';
import { Sensing, type Seen, type SenseAgent } from './Sensing';
import { stepAir, vaultAhead, vaultSpeed } from './Locomotion';
import { ARENA } from './ArenaCtx';
import { ARMORY } from '../../entities/weapons/armory';
import { DeathmatchBrain, drawPersona, flankPoint, focusFor, wantsAim, type ArenaBody, type Persona } from './DeathmatchAI';
import { newArenaStats } from './ArenaCtx';
import { ThinkScheduler } from '../tactics/Scheduler';
import { createTac } from '../tactics/Squad';
import { mulberry32 } from '../../core/math';
import type { EnemyCtx } from '../Enemy';
import { CollisionWorld } from '../../world/Collision';
import { Nav } from '../Nav';
import type { Combatant, TeamId } from '../../combat/Team';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
let uid = 1000;

function unit(pos: THREE.Vector3, team: TeamId, opts: { hp?: number; yaw?: number; isPlayer?: boolean } = {}): Combatant & { yaw: number; crouch: number; alive: boolean; hpFrac: number } {
  const yaw = opts.yaw ?? 0;
  return {
    uid: uid++, team, name: `U${uid}`, isPlayer: !!opts.isPlayer, pos, vel: v(0, 0, 0), alive: true, radius: 0.45, headY: 1.7, chestY: 1.3,
    reloading: false, hpFrac: opts.hp ?? 1, pressureT: -Infinity, yaw, crouch: 0,
    facing: (o: THREE.Vector2) => o.set(Math.sin(yaw), Math.cos(yaw)), hurt: () => false,
  };
}

function agent(self: ReturnType<typeof unit>, target: Combatant | null = null): SenseAgent & { sights: number } {
  const a = { self, target, alert: new Map<number, number>(), seen: new Map<number, Seen>(), sights: 0, onSight: () => void a.sights++ };
  return a;
}

/** Desert-like arena: ALPHA spawn south (z = +64), OMEGA north, three straight lanes. */
function director(team: TeamId = 'alpha') {
  const s = team === 'alpha' ? 1 : -1;
  const lane = (x: number) => [56, 40, 20, 0, -20, -40, -56].map((z) => v(x * s, 0, z * s));
  return new ArenaDirector(team, v(0, 0, 64 * s), v(0, 0, -64 * s), [lane(-30), lane(0), lane(30)]);
}

describe('Arena director', () => {
  it('progress runs from -1 at our spawn to +1 at theirs, for either team', () => {
    const a = director('alpha'), o = director('omega');
    expect(a.progress(v(0, 0, 64))).toBeCloseTo(-1);
    expect(a.progress(v(0, 0, -64))).toBeCloseTo(1);
    expect(o.progress(v(0, 0, -64))).toBeCloseTo(-1);
    expect(a.progress(v(20, 0, 0))).toBeCloseTo(0);
  });

  it('momentum: numbers up pushes, numbers down regroups, even holds', () => {
    const d = director();
    const bots = [v(0, 0, 20), v(5, 0, 22), v(-5, 0, 25), v(10, 0, 30), v(-10, 0, 30)].map((p) => unit(p, 'alpha'));
    d.update(0, bots, 2, { own: 25, theirs: 25 });
    expect(d.stance).toBe('push');
    for (const b of bots.slice(2)) b.alive = false;
    d.update(1, bots, 5, { own: 25, theirs: 25 });
    expect(d.stance).toBe('regroup');
    for (const b of bots) b.alive = true;
    d.update(2, bots, 5, { own: 25, theirs: 25 });
    expect(d.stance).toBe('hold');
  });

  it('push aims at the enemy front, regroup behind our median but never back into the spawn', () => {
    const d = director();
    const bots = [v(0, 0, 10), v(0, 0, 12), v(0, 0, 14)].map((p) => unit(p, 'alpha'));
    const h = unit(v(0, 0, -10), 'omega');
    d.sighting(h, 0);
    d.update(0, bots, 0, { own: 25, theirs: 25 });
    expect(d.stance).toBe('push');
    expect(d.desiredProgress()).toBeCloseTo(d.progress(h.pos) + 0.05);
    d.stance = 'regroup';
    d.ownFront = -0.9;
    expect(d.desiredProgress()).toBe(-0.5);
  });

  it('the board: a sighting beats a sound; gunfire is heard within 45 m only; the dead drop off', () => {
    const d = director();
    const me = unit(v(0, 0, 0), 'alpha');
    const h = unit(v(10, 0, 0), 'omega');
    expect(d.heard(v(80, 0, 0), h, 0, [me])).toBe(false);
    expect(d.heard(v(10, 0, 0), h, 0, [me])).toBe(true);
    expect(d.contacts.get(h.uid)!.src).toBe('gunfire');
    expect(d.isHot(h.uid, 1)).toBe(true);
    d.sighting(h, 2);
    h.pos.set(12, 0, 0);
    d.heard(v(30, 0, 0), h, 2.1, [me]);
    expect(d.contacts.get(h.uid)!.src).toBe('sight');
    expect(d.contacts.get(h.uid)!.pos.x).toBe(10);
    d.hostileDied(h, 3);
    expect(d.contacts.has(h.uid)).toBe(false);
  });

  it('freshest prefers near and new, and forgets contacts after 4 s', () => {
    const d = director();
    const a = unit(v(0, 0, -30), 'omega'), b = unit(v(0, 0, -8), 'omega');
    d.sighting(a, 0);
    d.sighting(b, 0);
    expect(d.freshest(v(0, 0, 0), 0.5)!.who).toBe(b);
    expect(d.freshest(v(0, 0, 0), 0.5 + ARENA.contactTtl + 0.1)).toBe(null);
  });

  it('push claims: two per victim, a runner may make a third, released on death', () => {
    const d = director();
    expect(d.claimPush(1, 99, 0)).toBe(true);
    expect(d.claimPush(2, 99, 0)).toBe(true);
    expect(d.claimPush(3, 99, 0)).toBe(false);
    expect(d.claimPush(4, 99, 0, true)).toBe(true);
    expect(d.claimPush(1, 99, 0)).toBe(true);
    d.friendDied(unit(v(0, 0, 0), 'alpha'), 0);
    d.releasePush(1);
    expect(d.pushersOn(99)).toBe(2);
    // Claims expire with the push.
    expect(d.claimPush(5, 99, ARENA.pushMax + 1)).toBe(true);
    expect(d.pushersOn(99)).toBe(1);
  });

  it('lanes: no lane left empty, the human counts on his own lane', () => {
    const d = director();
    const bots = [v(0, 0, 50), v(1, 0, 50), v(2, 0, 50), v(-1, 0, 50)].map((p) => unit(p, 'alpha'));
    const human = unit(v(30, 0, 40), 'alpha', { isPlayer: true });
    d.update(0, [...bots, human], 5, { own: 25, theirs: 25 });
    const count = [0, 0, 0];
    for (const b of bots) count[d.laneOf.get(b.uid)!]++;
    count[d.nearestLane(human.pos)]++;
    expect(Math.min(...count)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...count)).toBeLessThanOrEqual(2);
  });
});

describe('Arena sensing', () => {
  /** An open field with one wall between x = -1 and 1 at z = 10..12 (blocks sight along x = 0). */
  const world = () => {
    const col = new CollisionWorld();
    col.add(-1, 0, 10, 1, 3, 12);
    return col;
  };

  it('looks first at its target, then whoever alerted it; the budget defers the rest to the next frame', () => {
    const col = world();
    let rays = 0;
    const s = new Sensing((a, b) => (rays++, col.lineOfSight(a, b)));
    s.rays = 2;
    const me = unit(v(30, 0, 0), 'alpha');
    const hs = [unit(v(30, 0, 20), 'omega'), unit(v(35, 0, 20), 'omega'), unit(v(25, 0, 20), 'omega'), unit(v(40, 0, 25), 'omega')];
    const a = agent(me, hs[2]);
    a.alert.set(hs[3].uid, 0);
    s.update(0, [a], () => hs, () => false);
    expect(rays).toBe(2);
    expect(a.seen.get(hs[2].uid)!.vis).toBe(true);
    expect(a.seen.get(hs[3].uid)!.vis).toBe(true);
    expect(a.seen.get(hs[0].uid)!.at).toBe(-Infinity);
    expect(s.stats.deferred).toBe(2);
    s.update(0.016, [a], () => hs, () => false);
    expect(a.seen.get(hs[0].uid)!.vis).toBe(true);
    expect(a.sights).toBe(4);
  });

  it('no ray beyond range or behind its back (unless alerted)', () => {
    const col = world();
    let rays = 0;
    const s = new Sensing((a, b) => (rays++, col.lineOfSight(a, b)));
    const me = unit(v(30, 0, 0), 'alpha', { yaw: 0 }); // faces +z
    const far = unit(v(30, 0, 90), 'omega'), behind = unit(v(30, 0, -15), 'omega');
    const a = agent(me);
    s.update(0, [a], () => [far, behind], () => false);
    expect(rays).toBe(0);
    a.alert.set(behind.uid, 0.5);
    s.update(0.5, [a], () => [far, behind], () => false);
    expect(rays).toBe(1);
    expect(a.seen.get(behind.uid)!.vis).toBe(true);
  });

  it('one ray answers a pair for both bots (symmetric cache), a wall hides both ways', () => {
    const col = world();
    let rays = 0;
    const s = new Sensing((a, b) => (rays++, col.lineOfSight(a, b)));
    const x = unit(v(0, 0, 0), 'alpha', { yaw: 0 }), y = unit(v(0, 0, 20), 'omega', { yaw: Math.PI });
    const p = unit(v(20, 0, 0), 'alpha', { yaw: 0 }), q = unit(v(20, 0, 20), 'omega', { yaw: Math.PI });
    const ax = agent(x, y), ay = agent(y, x), ap = agent(p, q), aq = agent(q, p);
    s.update(0, [ax, ay, ap, aq], (a) => (a.self.team === 'alpha' ? [y, q] : [x, p]), () => false);
    expect(ax.seen.get(y.uid)!.vis).toBe(false);
    expect(ay.seen.get(x.uid)!.vis).toBe(false);
    expect(ap.seen.get(q.uid)!.vis).toBe(true);
    expect(aq.seen.get(p.uid)!.vis).toBe(true);
    expect(s.stats.cacheHits).toBeGreaterThanOrEqual(2);
    // Moving half a metre or waiting past the cache age costs a fresh ray.
    const before = rays;
    q.pos.x += 0.6;
    s.update(ARENA.sense.targetEvery, [ap], () => [q], () => false);
    expect(rays).toBeGreaterThan(before);
  });

  it('re-checks the target every 0.05 s, a cone contact every 0.3 s', () => {
    const col = new CollisionWorld();
    const s = new Sensing((a, b) => col.lineOfSight(a, b));
    const me = unit(v(0, 0, 0), 'alpha');
    const t = unit(v(0, 0, 20), 'omega'), o = unit(v(5, 0, 20), 'omega');
    const a = agent(me, t);
    s.update(0, [a], () => [t, o], () => false);
    expect(a.seen.get(t.uid)!.next).toBeCloseTo(ARENA.sense.targetEvery);
    expect(a.seen.get(o.uid)!.next).toBeCloseTo(ARENA.sense.coneEvery);
  });
});

describe('Arena locomotion', () => {
  it('a sandbag wall ahead is vaultable; a tall wall is not; a jump clears 1.1 m and lands', () => {
    const col = new CollisionWorld();
    col.add(-2, 0, 2, 2, 1.1, 2.6).vault = true;
    col.add(-2, 0, -2.6, 2, 2.8, -2);
    const pos = v(0, 0, 1.2);
    expect(vaultAhead(col, pos, 0, 1, 0.45)).toBeCloseTo(1.1);
    expect(vaultAhead(col, v(0, 0, -1.2), 0, -1, 0.45)).toBe(0);
    expect(vaultAhead(col, pos, 1, 0, 0.45)).toBe(0);
    const air = { up: true, vy: vaultSpeed(1.1), t: 0 };
    let top = 0;
    for (let i = 0; i < 200 && air.up; i++) {
      stepAir(air, pos, col, 0.45, 1 / 60);
      top = Math.max(top, pos.y);
    }
    expect(top).toBeGreaterThan(1.1);
    expect(air.up).toBe(false);
  });

  it('vault links cross low vaultable walls only (never tall walls), and survival routes ignore them', () => {
    const col = new CollisionWorld();
    // A long 1.1 m sandbag line between z = -0.3 and 0.3 (vaultable), and a 3 m wall further east.
    col.add(-30, 0, -0.3, 10, 1.1, 0.3).vault = true;
    col.add(10, 0, -0.3, 40, 3, 0.3);
    const nav = new Nav(col, { nodes: [v(0, 0, -5), v(0, 0, 5), v(25, 0, -5), v(25, 0, 5)], links: [] });
    expect(nav.edges[0].includes(1)).toBe(false);
    const ve = nav.ensureVaultLinks();
    expect(ve[0].includes(1)).toBe(true);
    expect(ve[2].includes(3)).toBe(false);
    expect(nav.route(v(0, 1, -6), v(0, 1, 6))).toEqual([]);
    expect(nav.route(v(0, 1, -6), v(0, 1, 6), { vault: true }).length).toBeGreaterThan(0);
  });
  it('14.0: drop-downs are one-way and only arena routes take them; the roof still has its stair', () => {
    const col = new CollisionWorld();
    // A 4.5 m building (x 0–10, z -10–10) with a stair (ramp) up to its east edge at z 2–4.
    col.add(0, 0, -10, 10, 4.5, 10);
    col.addRamp(10, 2, 19, 4, 'x', 4.5, 0);
    // Nodes: roof edge (0), street below the edge (1), stair foot (2), roof at the stair top (3), street (4).
    const nodes = [v(9, 4.5, -6), v(13.5, 0, -6), v(19.5, 0, 3), v(9, 4.5, 3), v(19.5, 0, -6)];
    const nav = new Nav(col, { nodes, links: [[2, 3]], drops: [[0, 1]] });
    nav.ensureVaultLinks();
    expect(nav.edges[0].includes(1)).toBe(false);
    const roof = v(8, 5.5, -6), street = v(13.5, 1, -6);
    // Down: the arena route walks off the edge (roof → street node), survival takes the stair.
    const down = nav.route(roof, street, { vault: true });
    expect(down.slice(-2)).toEqual([0, 1]);
    const slow = nav.route(roof, street);
    expect(slow).toContain(2);
    expect(slow).not.toEqual([0, 1]);
    // Up: a drop is never climbed back; the route goes by the stair.
    const up = nav.route(street, roof, { vault: true });
    expect(up).toContain(2);
    expect(up).toContain(3);
    expect(nav.reachable(1).has(0)).toBe(true);
    expect(nav.reachable(0, true).has(1)).toBe(true);
  });
});

describe('15.0: lane pressure', () => {
  const lanes = [[v(-30, 0, 40), v(-30, 0, -40)], [v(0, 0, 40), v(0, 0, -40)], [v(30, 0, 40), v(30, 0, -40)]];
  const mk = () => new ArenaDirector('alpha', v(0, 0, 50), v(0, 0, -50), lanes);
  const bot = (uid: number, x: number) => ({ uid, alive: true, isPlayer: false, pos: v(x, 0, 30), team: 'alpha' as TeamId });

  it('deaths and gunfire heat the lane they happen in; the heat halves every halfLife', () => {
    const d = mk();
    d.addHeat({ x: 1, z: 0 }, 2, 10);
    expect(d.heat[1]).toBeCloseTo(2);
    expect(d.heat[0]).toBe(0);
    d.addHeat({ x: -29, z: 5 }, 0, 10 + ARENA.lanePressure.halfLife);
    expect(d.heat[1]).toBeCloseTo(1, 5);
  });

  it('new bots avoid a hot lane; a hot lane with two on it gives one up to the coolest', () => {
    const d = mk();
    d.addHeat({ x: 0, z: 0 }, 6, 1);
    const bots = [bot(1, 0), bot(2, 0), bot(3, 0)];
    d.update(1, bots as never, 5, { own: 25, theirs: 25 });
    expect([...d.laneOf.values()].filter((l) => l === 1).length).toBe(0);
    // Everyone forced onto the centre, which is still hot: one moves off.
    for (const b of bots) d.laneOf.set(b.uid, 1);
    d.addHeat({ x: 0, z: 0 }, 6, 30);
    d.update(30, bots as never, 5, { own: 25, theirs: 25 });
    const onCentre = [...d.laneOf.values()].filter((l) => l === 1).length;
    expect(d.laneMoves).toBeGreaterThan(0);
    expect(onCentre).toBeLessThan(3);
  });
});

describe('18.0: lane weights', () => {
  const lanes = [[v(-30, 0, 40), v(-30, 0, -40)], [v(0, 0, 40), v(0, 0, -40)], [v(30, 0, 40), v(30, 0, -40)]];
  const bot = (uid: number) => ({ uid, alive: true, isPlayer: false, pos: v(0, 0, 50), team: 'alpha' as TeamId });
  const share = (weights?: number[], n = 5, runs = 40) => {
    const centre: number[] = [];
    for (let r = 0; r < runs; r++) {
      const d = new ArenaDirector('alpha', v(0, 0, 50), v(0, 0, -50), lanes, weights);
      const bots = Array.from({ length: n }, (_, i) => bot(100 + i));
      d.update(1, bots as never, n, { own: 25, theirs: 25 });
      const count = [0, 0, 0];
      for (const l of d.laneOf.values()) count[l]++;
      expect(Math.min(...count)).toBeGreaterThanOrEqual(1);
      centre.push(count[1]);
    }
    return centre;
  };

  it('a centre worth 1.6 always holds two of five bots (and never leaves a flank empty)', () => {
    expect(share([1, 1.6, 1]).every((c) => c === 2)).toBe(true);
    // Unweighted, the centre gets one or two (the 7.0–17.1 balance: whichever lane the dealt fifth bot lands in).
    const plain = share();
    expect(plain.every((c) => c === 1 || c === 2)).toBe(true);
    expect(plain.some((c) => c === 1)).toBe(true);
  });

  it('weights of 1 change nothing (absent and explicit give the same lanes)', () => {
    const run = (weights?: number[]) => {
      const rnd = mulberry32(7);
      const r0 = Math.random;
      Math.random = rnd;
      try {
        const d = new ArenaDirector('alpha', v(0, 0, 50), v(0, 0, -50), lanes, weights);
        d.addHeat({ x: 0, z: 0 }, 2, 1);
        d.update(1, [bot(1), bot(2), bot(3), bot(4)] as never, 4, { own: 25, theirs: 25 });
        return [...d.laneOf.entries()];
      } finally {
        Math.random = r0;
      }
    };
    expect(run([1, 1, 1])).toEqual(run());
  });
});

describe('Survival keeps the 5.0 brain', () => {
  // The split is structural: nothing on the survival path may reach the arena AI.
  it('Waves, Squad, Arcade and the Gunner/Runner classes never import the arena modules', () => {
    for (const f of [wavesSrc, squadSrc, arcadeSrc]) expect(f).not.toMatch(/arena\//);
    // Enemy.ts may only name the arena context's type (EnemyCtx.arena), never construct anything.
    expect(enemySrc.match(/from '\.\/arena\/[^']+'/g)).toEqual(["from './arena/ArenaCtx'"]);
    expect(enemySrc).toMatch(/import type \{ ArenaCtx \}/);
    expect(wavesSrc).toMatch(/new Runner\(at, this\.difficulty, this\.look\) : new Gunner\(/);
  });

  it('the survival scheduler defaults are untouched', async () => {
    const { ThinkScheduler } = await import('../tactics/Scheduler');
    const s = new ThinkScheduler();
    expect([s.maxPerFrame, s.rayBudget, s.coverPerFrame, s.routesPerFrame]).toEqual([3, 30, 1, 2]);
  });
});

describe('11.0: hip fire or an aimed shot, by range', () => {
  it('hip fire up close, an aimed shot at range, with hysteresis round 12 m', () => {
    expect(wantsAim(8, false)).toBe(false);
    expect(wantsAim(12, false)).toBe(false); // not yet: it starts aiming over 13 m
    expect(wantsAim(14, false)).toBe(true);
    expect(wantsAim(12, true)).toBe(true); // already aiming: it holds down to 11 m
    expect(wantsAim(10.5, true)).toBe(false);
  });

  it('beyond its effective range it does not aim (it moves up)', () => {
    expect(wantsAim(ARENA.ads.maxRange - 1, false)).toBe(true);
    expect(wantsAim(ARENA.ads.maxRange + 1, true)).toBe(false);
  });

  it('focus takes longer further out, within its bounds', () => {
    expect(focusFor(ARENA.ads.enter)).toBeCloseTo(ARENA.ads.focus[0]);
    expect(focusFor(30)).toBeGreaterThan(focusFor(15));
    expect(focusFor(1000)).toBe(ARENA.ads.focus[1]);
  });
});


describe('12.0: shared team spotting', () => {
  it('a sighting is spotted for the whole team, fades out after ARENA.spot.fade s; gunfire heard is not a dot', () => {
    const d = director();
    const me = unit(v(0, 0, 0), 'alpha');
    const h = unit(v(10, 0, -20), 'omega'), g = unit(v(-10, 0, -20), 'omega');
    d.sighting(h, 5, 'sight', me);
    d.heard(g.pos, g, 5, [me]);
    expect(d.spotted(5).map((s) => s.who)).toEqual([h]);
    expect(d.contacts.get(h.uid)!.by).toBe(me.uid);
    expect(d.spotted(5 + ARENA.spot.fade - 0.1).length).toBe(1);
    expect(d.spotted(5 + ARENA.spot.fade + 0.1).length).toBe(0);
  });

  it("the human's field of view: nothing outside it, alerted or not; inside it, seen", () => {
    const col = new CollisionWorld();
    let rays = 0;
    const s = new Sensing((a, b) => (rays++, col.lineOfSight(a, b)));
    const me = unit(v(0, 0, 0), 'alpha', { yaw: 0, isPlayer: true });
    const side = unit(v(20, 0, 2), 'omega'), ahead = unit(v(3, 0, 25), 'omega');
    const a = { ...agent(me), view: { cos: ARENA.spot.viewCos, every: ARENA.spot.every } };
    a.alert.set(side.uid, 0);
    s.update(0, [a], () => [side, ahead], () => false);
    expect(a.seen.get(side.uid)!.vis).toBe(false);
    expect(a.seen.get(ahead.uid)!.vis).toBe(true);
    expect(rays).toBe(1);
    expect(a.seen.get(ahead.uid)!.next).toBeCloseTo(ARENA.spot.every);
  });

  it("a hostile bot's check of its line to him answers his own check (one ray for the pair)", () => {
    const col = new CollisionWorld();
    let rays = 0;
    const s = new Sensing((a, b) => (rays++, col.lineOfSight(a, b)));
    const me = unit(v(0, 0, 0), 'alpha', { yaw: 0, isPlayer: true });
    const bot = unit(v(0, 0, 30), 'omega', { yaw: Math.PI });
    const pa = { ...agent(me), view: { cos: ARENA.spot.viewCos, every: ARENA.spot.every } };
    const ba = agent(bot, me);
    s.update(0, [ba, pa], (x) => (x.self.team === 'alpha' ? [bot] : [me]), () => false);
    expect(rays).toBe(1);
    expect(pa.seen.get(bot.uid)!.vis).toBe(true);
    expect(s.stats.cacheHits).toBe(1);
  });
});

describe('12.0: flanks', () => {
  it('the flank point is dist m from the contact, angle off the line to the spotter, either side', () => {
    const c = v(0, 0, 0), from = v(0, 0, 20);
    const l = flankPoint(c, from, 1, v(0, 0, 0)), r = flankPoint(c, from, -1, v(0, 0, 0));
    expect(Math.hypot(l.x, l.z)).toBeCloseTo(ARENA.flank.dist);
    const ang = (p: THREE.Vector3) => Math.acos((p.x * from.x + p.z * from.z) / (Math.hypot(p.x, p.z) * 20));
    expect(ang(l)).toBeCloseTo(ARENA.flank.angle);
    expect(ang(r)).toBeCloseTo(ARENA.flank.angle);
    expect(Math.sign(l.x)).toBe(-Math.sign(r.x));
  });

  it('flank claims: two per hostile, the second takes the other side (a pincer), released on death', () => {
    const d = director();
    const a = d.claimFlank(1, 50, 0, 1), b = d.claimFlank(2, 50, 0, 1);
    expect(a).toBe(1);
    expect(b).toBe(-1);
    expect(d.claimFlank(3, 50, 0, 1)).toBe(0);
    expect(d.claimFlank(1, 50, 0.5, -1)).toBe(1); // its claim stands
    d.friendDied(unit(v(0, 0, 0), 'alpha'), 1);
    d.releaseFlank(2);
    expect(d.flankersOn(50)).toBe(1);
    expect(d.claimFlank(4, 50, ARENA.flank.maxT + 1, 1)).not.toBe(0);
  });
});

/** A brain on a test body in an open field, with a director, a nav grid and the given hostiles and friends. */
function rig(at: THREE.Vector3, opts: { hostiles?: Combatant[]; friends?: Combatant[]; persona?: Partial<Persona> } = {}) {
  const d = director();
  const col = new CollisionWorld();
  const nodes: THREE.Vector3[] = [];
  for (let x = -60; x <= 60; x += 4) for (let z = -60; z <= 60; z += 4) nodes.push(v(x, 1, z));
  const me = Object.assign(unit(at, 'alpha'), {
    kind: 'gunner' as const, speed: 3.3, look: { voice: 'human' as const }, arm: ARMORY.ar.bot, isAiming: false, airborne: false, sliding: false, slides: 0,
    steer: () => 0, face: () => {}, jump: () => true, fireRound: () => 'none' as const, strike: () => {}, wallAhead: () => 0, open: () => true, bark: () => {},
    slide() { this.slides++; return true; },
  }) as unknown as ArenaBody & { slides: number; hpFrac: number };
  (me as unknown as { tac: unknown }).tac = createTac(me as never);
  const stats = newArenaStats();
  const friends = [me, ...(opts.friends ?? [])];
  const ctx = {
    time: 0, arena: { director: d, sched: new ThinkScheduler(), stats }, hostiles: opts.hostiles ?? [], friends, lanes: d.lanes,
    nav: { nodes }, col, coverPoints: [], avoid: () => false,
  } as unknown as EnemyCtx;
  const brain = new DeathmatchBrain(me, { ...drawPersona(mulberry32(7)), flank: 1, ...opts.persona });
  brain.state = 'advance';
  brain.stateT = 1;
  return { d, me, ctx, brain, stats };
}

const see = (brain: DeathmatchBrain, h: Combatant, vis: boolean, now = 0) => brain.seen.set(h.uid, { vis, since: now, last: now, at: now, next: now + 1 });

describe('12.0: a bot with a temperament', () => {
  it('reaction times differ per bot, mostly 0.1–0.25 s, never outside the clamp', () => {
    const rng = mulberry32(3);
    const r = Array.from({ length: 2000 }, () => drawPersona(rng).react);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    expect(mean).toBeGreaterThan(0.15);
    expect(mean).toBeLessThan(0.19);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(ARENA.persona.reactClamp[0]);
    expect(Math.max(...r)).toBeLessThanOrEqual(ARENA.persona.reactClamp[1]);
    expect(new Set(r.map((x) => x.toFixed(3))).size).toBeGreaterThan(100);
  });

  it('a face in view is decided after its own reaction time, not on the same frame', () => {
    const { brain } = rig(v(0, 0, 0), { persona: { react: 0.2 } });
    brain.nextThink = 100;
    brain.urgent = false;
    brain.onSight(unit(v(0, 0, -20), 'omega'), 5);
    expect(brain.urgent).toBe(false);
    expect(brain.nextThink).toBeGreaterThanOrEqual(5 + 0.2 * 0.8);
    expect(brain.nextThink).toBeLessThanOrEqual(5 + 0.2 * 1.25);
  });
});

describe('12.0: retreat and regroup', () => {
  it('hurt badly by someone it cannot see: it breaks off towards a friend behind it', () => {
    const h = unit(v(0, 0, -25), 'omega');
    const friend = unit(v(0, 0, 20), 'alpha');
    const { brain, me, ctx, stats } = rig(v(0, 0, 0), { hostiles: [h], friends: [friend] });
    see(brain, h, false);
    brain.decide(ctx);
    me.hpFrac = 0.55;
    brain.alert.set(h.uid, 0.4);
    (ctx as { time: number }).time = 0.5;
    brain.decide(ctx);
    expect(brain.state).toBe('retreat');
    expect(stats.retreatWhy.unseen).toBe(1);
    expect(brain.goal!.z).toBeCloseTo(20);
  });

  it('outnumbered and hurt: it breaks off; with friends at its side it fights on', () => {
    const hs = [unit(v(-4, 0, -18), 'omega'), unit(v(4, 0, -18), 'omega'), unit(v(0, 0, -22), 'omega')];
    const a = rig(v(0, 0, 0), { hostiles: hs, friends: [unit(v(0, 0, 30), 'alpha')] });
    a.me.hpFrac = 0.5;
    for (const h of hs) see(a.brain, h, true);
    a.brain.decide(a.ctx);
    expect(a.brain.state).toBe('retreat');
    expect(a.stats.retreatWhy.outnumbered).toBe(1);
    const b = rig(v(0, 0, 0), { hostiles: hs, friends: [unit(v(3, 0, 2), 'alpha'), unit(v(-3, 0, 2), 'alpha')] });
    b.me.hpFrac = 0.5;
    for (const h of hs) see(b.brain, h, true);
    b.brain.decide(b.ctx);
    expect(b.brain.state).toBe('engage');
  });

  it('a nearly dead target in sight close by is finished, not run from', () => {
    const h = Object.assign(unit(v(0, 0, -10), 'omega'), { hpFrac: 0.15 });
    const { brain, me, ctx } = rig(v(0, 0, 0), { hostiles: [h, unit(v(5, 0, -12), 'omega')] });
    me.hpFrac = 0.5;
    for (const x of ctx.hostiles!) see(brain, x, true);
    brain.decide(ctx);
    expect(brain.state).not.toBe('retreat');
  });
});

describe('12.0: flanking a contact a teammate is fighting', () => {
  it('out of its sight but in a teammate\'s: it goes round to the flank point, a second bot to the other side', () => {
    const h = unit(v(0, 0, -30), 'omega');
    const spotter = unit(v(0, 0, -5), 'alpha');
    const a = rig(v(-20, 0, 0), { hostiles: [h], friends: [spotter] });
    const b = rig(v(20, 0, 0), { hostiles: [h], friends: [spotter] });
    // Both bots share one director (one team).
    (b.ctx as { arena: { director: ArenaDirector } }).arena.director = a.d;
    a.d.sighting(h, 0, 'sight', spotter);
    see(a.brain, h, false);
    see(b.brain, h, false);
    a.brain.decide(a.ctx);
    b.brain.decide(b.ctx);
    expect(a.brain.state).toBe('flank');
    expect(b.brain.state).toBe('flank');
    const ga = a.brain.goal!, gb = b.brain.goal!;
    // Each on its own side of the contact, about dist m from it.
    expect(Math.sign(ga.x)).toBe(-1);
    expect(Math.sign(gb.x)).toBe(1);
    expect(Math.hypot(ga.x - h.pos.x, ga.z - h.pos.z)).toBeLessThan(ARENA.flank.dist + 3);
    expect(a.stats.flanks + b.stats.flanks).toBe(2);
  });

  it('a contact only heard (nobody has eyes on it) is hunted, not flanked', () => {
    const h = unit(v(0, 0, -30), 'omega');
    const a = rig(v(-20, 0, 0), { hostiles: [h] });
    a.d.heard(h.pos, h, 0, [a.me]);
    see(a.brain, h, false);
    a.brain.decide(a.ctx);
    expect(a.brain.state).toBe('hunt');
  });
});
