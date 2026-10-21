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
