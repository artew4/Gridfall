import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThinkScheduler, thinkInterval, type Thinker } from './Scheduler';
import { band, choose } from './Utility';
import { COVER, CoverCache, evaluateCover, isProtected, preScore } from './Cover';
import { BarkGate } from './Barks';
import { SQUAD, Squad, createTac, type SquadCtx, type TacAgent } from './Squad';
import { CollisionWorld } from '../../world/Collision';
import { Nav } from '../Nav';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('ThinkScheduler (time-slicing)', () => {
  const agents = (n: number, due: number[]): Thinker[] => Array.from({ length: n }, (_, i) => ({ nextThink: due[i] ?? 0, urgent: false }));

  it('starts at most maxPerFrame decides, most overdue first, urgent ahead of everyone', () => {
    const s = new ThinkScheduler();
    const a = agents(6, [0.5, 0.1, 0.3, 0.2, 0.4, 2]);
    a[4].urgent = true;
    const picked = s.pick(a, 1);
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe(a[4]);
    expect(picked.slice(1)).toEqual([a[1], a[3]]);
    expect(a[4].urgent).toBe(false);
  });

  it('never picks an agent that is not due', () => {
    const s = new ThinkScheduler();
    expect(s.pick(agents(4, [2, 3, 4, 5]), 1)).toHaveLength(0);
  });

  it('defers a cover search past the per-frame cap or the ray budget, and resets per frame', () => {
    const s = new ThinkScheduler();
    expect(s.tryCoverSearch(8)).toBe(true);
    expect(s.tryCoverSearch(8)).toBe(false);
    s.pick([], 0);
    s.spend(s.rayBudget - 4);
    expect(s.tryCoverSearch(8)).toBe(false);
    expect(s.stats.deferred).toBe(2);
    s.pick([], 0);
    expect(s.canAfford(8)).toBe(true);
  });

  it('thinks faster in a close fight than when calm', () => {
    expect(thinkInterval(true, 8, 0.5)).toBeLessThan(thinkInterval(true, 40, 0.5));
    expect(thinkInterval(true, 40, 0.5)).toBeLessThan(thinkInterval(false, 8, 0.5));
  });
});

describe('Utility selection', () => {
  it('picks the best score, with stickiness for the current action', () => {
    expect(choose([{ action: 'a', score: 0.5 }, { action: 'b', score: 0.55 }], 'a', false)).toBe('a');
    expect(choose([{ action: 'a', score: 0.5 }, { action: 'b', score: 0.7 }], 'a', false)).toBe('b');
  });

  it('a committed action is only replaced by an interrupt', () => {
    expect(choose([{ action: 'fight', score: 0.1 }, { action: 'hunt', score: 0.9 }], 'fight', true)).toBe('fight');
    expect(choose([{ action: 'fight', score: 0.1 }, { action: 'pinned', score: 1, interrupt: true }], 'fight', true)).toBe('pinned');
  });

  it('band is 1 inside and falls off outside', () => {
    expect(band(15, 10, 20, 5)).toBe(1);
    expect(band(7.5, 10, 20, 5)).toBeCloseTo(0.5);
    expect(band(30, 10, 20, 5)).toBe(0);
  });
});

/** A 1.1 m high, 3 m wide crate row along x at z = 0 (cover spot at z = -0.8). */
function crateWorld() {
  const col = new CollisionWorld();
  col.add(-1.5, 0, -0.4, 1.5, 1.1, 0.4);
  // A 3 m wall with an end at x = 6 (cover spot behind its end).
  col.add(4, 0, -0.3, 6, 3, 0.3);
  return col;
}
const losOf = (col: CollisionWorld) => (a: THREE.Vector3, b: THREE.Vector3) => col.lineOfSight(a, b);
const freeOf = (col: CollisionWorld) => (p: THREE.Vector3) => !col.blocked(p, 0.35);

describe('Dynamic cover', () => {
  const col = crateWorld();
  const los = losOf(col);

  it('a low crate protects a crouched body from the front and gives a stand-up peek', () => {
    const spot = v(0, 0, -0.9);
    const ev = evaluateCover(spot, v(0, 0, 14), los, freeOf(col));
    expect(ev.protected).toBe(true);
    expect(ev.kind).toBe('stand');
    expect(ev.rays).toBeLessThanOrEqual(7);
  });

  it('the same spot is compromised once the threat walks round the side (flanked)', () => {
    const spot = v(0, 0, -0.9);
    expect(isProtected(spot, v(0, 0, 14), los).ok).toBe(true);
    expect(isProtected(spot, v(12, 0, 3), los).ok).toBe(false);
    expect(evaluateCover(spot, v(12, 0, 3), los, freeOf(col)).protected).toBe(false);
  });

  it('a tall wall end needs a lean, on the side of the open end', () => {
    const spot = v(5.4, 0, -0.9);
    const ev = evaluateCover(spot, v(5, 0, 15), los, freeOf(col));
    expect(ev.protected).toBe(true);
    expect(ev.kind === 'left' || ev.kind === 'right').toBe(true);
    // The lean position is past the wall end (x > 6 - body radius), where the threat's chest is in sight.
    expect(ev.peek!.x).toBeGreaterThan(5.6);
  });

  it('crouched test heights match the crouched hitboxes (gunner drop 0.78)', () => {
    const drop = 0.78;
    const hit = (y: number) => y - drop * Math.min(1, y / 1.2);
    // Head centre after the crouch must be covered by the head test point.
    expect(Math.abs(hit(1.86) - COVER.crouchHead)).toBeLessThan(0.1);
    expect(Math.abs(hit(1.32) - COVER.crouchChest)).toBeLessThan(0.1);
  });

  it('the cache answers for a nearby threat and expires on movement or age', () => {
    const c = new CoverCache();
    const ev = evaluateCover(v(0, 0, -0.9), v(0, 0, 14), los, freeOf(col));
    c.put(1, v(0, 0, 14), 0, ev);
    expect(c.get(1, v(0.5, 0, 14), 0.3)).toBe(ev);
    expect(c.get(1, v(3, 0, 14), 0.3)).toBeNull();
    expect(c.get(1, v(0, 0, 14), 5)).toBeNull();
  });

  it('a flanker prefers spots 90° off the front on its own side', () => {
    const front = new THREE.Vector2(0, 1); // squad is at +z of the player
    const threat = v(0, 0, 0);
    const self = v(0, 0, 12);
    const wish = { idealMin: 6, idealMax: 18, side: 1 };
    // Positive cross(front, spot) is the left side as the squad faces the player: (-x).
    const left = preScore(v(-12, 0, 0), self, threat, front, wish, 0);
    const right = preScore(v(12, 0, 0), self, threat, front, wish, 0);
    const ahead = preScore(v(0, 0, 12), self, threat, front, wish, 0);
    expect(left).toBeLessThan(right);
    expect(left).toBeLessThan(ahead);
  });
});

describe('Bark gate', () => {
  it('one line at a time, per-kind cooldown, priority cuts the gap', () => {
    const g = new BarkGate<string>();
    expect(g.say('a', 'suppress', 'human', 0)).not.toBeNull();
    expect(g.say('b', 'reload', 'human', 0.5)).toBeNull(); // global gap
    expect(g.say('b', 'contact', 'human', 0.6)).not.toBeNull(); // priority 3 after 0.5 s
    expect(g.say('c', 'suppress', 'human', 3)).toBeNull(); // kind cooldown 7 s
    expect(g.say('c', 'reload', 'human', 3)).not.toBeNull();
    expect(g.say('c', 'pinned', 'human', 4.5)).toBeNull(); // same speaker within 2.5 s
    expect(g.log.map((e) => e.kind)).toEqual(['suppress', 'contact', 'reload']);
  });

  it('synths and humans have their own lines', () => {
    const g = new BarkGate<string>();
    expect(g.say('a', 'lost', 'synth', 0)).toMatch(/^[A-Z .]+$/);
  });
});

// ---------------------------------------------------------------------- director
function agent(kind: 'runner' | 'gunner', pos: THREE.Vector3): TacAgent {
  const a = { kind, pos, alive: true, perch: null, look: { voice: 'human' as const }, decided: 0 } as unknown as TacAgent & { decided: number };
  a.tac = createTac(a);
  a.decide = () => {
    a.decided++;
  };
  return a;
}

function squadCtx(): SquadCtx {
  const col = new CollisionWorld();
  // A flat 60×60 arena with a grid of nav nodes every 6 m.
  const nodes: THREE.Vector3[] = [];
  for (let x = -24; x <= 24; x += 6) for (let z = -24; z <= 24; z += 6) nodes.push(v(x, 0, z));
  const nav = new Nav(col, { nodes, links: [] });
  return { time: 0, col, nav, coverPoints: [v(10, 0, 0), v(-10, 0, 0)], bounds: new THREE.Box2(new THREE.Vector2(-30, -30), new THREE.Vector2(30, 30)), difficulty: 0 };
}

describe('Squad director', () => {
  it('only a sighting brings the live position in; losing sight hunts the predicted LKP, then searches', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const g = agent('gunner', v(0, 0, 15));
    sq.update(ctx, [g]);
    expect(sq.mode).toBe('idle');
    sq.sighting(g, v(0, 0, 0), v(4, 0, 0));
    expect(sq.mode).toBe('engage');
    // Hunkered and not looking: not lost yet.
    ctx.time = SQUAD.loseSight + 0.1;
    sq.update(ctx, [g]);
    expect(sq.mode).toBe('engage');
    // Someone looks and he isn't there: lost.
    sq.missedLook();
    sq.update(ctx, [g]);
    expect(sq.mode).toBe('hunt');
    // Predicted along his last velocity (4 m/s × 1 s), not wherever he really is now.
    expect(sq.huntGoal.x).toBeCloseTo(4, 1);
    expect(sq.lkp!.x).toBe(0);
    // A hunter reaching the goal starts the search: points round the LKP, spread by claims.
    g.pos.set(4, 0, 0.5);
    ctx.time += 0.1;
    sq.update(ctx, [g]);
    expect(sq.mode).toBe('search');
    expect(sq.searchPts.length).toBeGreaterThan(4);
    const g2 = agent('gunner', v(1, 0, 0));
    sq.update(ctx, [g, g2]);
    const p1 = sq.claimSearch(g), p2 = sq.claimSearch(g2);
    expect(p1).not.toBe(p2);
    // Out of time: give up.
    ctx.time += SQUAD.searchTime + 1;
    sq.update(ctx, [g, g2]);
    expect(sq.mode).toBe('idle');
  });

  it('a heard shot gives a noisy position and a hunt, never a sighting', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const g = agent('gunner', v(0, 0, 20));
    sq.update(ctx, [g]);
    sq.hearShot(v(0, 0, 0));
    expect(sq.mode).toBe('hunt');
    expect(sq.lkpSource).toBe('sound');
    expect(sq.seenT).toBe(-Infinity);
    expect(sq.lkp!.distanceTo(v(0, 0, 0))).toBeLessThan(1.5 + 0.08 * 20 + 1e-6);
  });

  it('roles: 1–2 suppressors, flankers balanced left/right, rushers on separate slots', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const gs = [v(0, 0, 15), v(2, 0, 16), v(-3, 0, 14), v(5, 0, 18), v(1, 0, 20)].map((p) => agent('gunner', p));
    const rs = [v(-6, 0, 12), v(6, 0, 12), v(0, 0, 13)].map((p) => agent('runner', p));
    const all = [...gs, ...rs];
    for (const g of gs.slice(0, 2)) g.tac.seenT = 0;
    sq.update(ctx, all);
    sq.sighting(gs[0], v(0, 0, 0), v(0, 0, 0));
    sq.assignRoles(ctx);
    const supp = gs.filter((g) => g.tac.role === 'suppressor');
    const flank = gs.filter((g) => g.tac.role === 'flanker');
    expect(supp).toHaveLength(2);
    expect(flank).toHaveLength(3);
    const L = flank.filter((g) => g.tac.side > 0).length;
    expect(Math.abs(L - (flank.length - L))).toBeLessThanOrEqual(1);
    const slots = rs.map((r) => r.tac.slot);
    expect(new Set(slots.map((s) => s.toFixed(2))).size).toBe(3);
    // Roles stick: a second pass changes nothing.
    const before = all.map((a) => `${a.tac.role}${a.tac.side}`);
    sq.assignRoles(ctx);
    expect(all.map((a) => `${a.tac.role}${a.tac.side}`)).toEqual(before);
  });

  it('rushers go together on an opening, not before', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const rs = [v(-11, 0, 0), v(11, 0, 0), v(0, 0, 11)].map((p) => agent('runner', p));
    sq.update(ctx, rs);
    sq.sighting(rs[0], v(0, 0, 0), v(0, 0, 0));
    ctx.time = 0.5;
    sq.seenT = 0.5;
    sq.update(ctx, rs);
    // Arrived at its slot (after the slots were handed out: a new slot clears staging).
    rs[0].tac.staged = true;
    rs[0].tac.stagedSince = 0.5;
    ctx.time = 0.55;
    sq.update(ctx, rs);
    expect(rs.some((r) => r.tac.go)).toBe(false);
    // He reloads in plain view: the staged rusher (and anyone near its slot) goes.
    sq.player.reloading = true;
    ctx.time = 0.6;
    sq.update(ctx, rs);
    expect(rs[0].tac.go).toBe(true);
    expect(sq.log.some(([, what, d]) => what === 'rush' && d.includes('reload'))).toBe(true);
  });

  it('shot tokens cap how many aim at once (suppressors may exceed by one)', () => {
    const sq = new Squad();
    const gs = [0, 1, 2, 3].map((i) => agent('gunner', v(i, 0, 10)));
    expect(sq.requestShot(gs[0], 0)).toBe(true);
    expect(sq.requestShot(gs[1], 0)).toBe(true);
    expect(sq.requestShot(gs[2], 0)).toBe(false);
    gs[3].tac.role = 'suppressor';
    expect(sq.requestShot(gs[3], 0)).toBe(true);
    // Full for riflemen (two plus the suppressor's extra seat): someone must finish first.
    sq.releaseShot(gs[0]);
    expect(sq.requestShot(gs[2], 0)).toBe(false);
    sq.releaseShot(gs[1]);
    expect(sq.requestShot(gs[2], 0)).toBe(true);
  });

  it('the director time-slices the decides', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const gs = Array.from({ length: 10 }, (_, i) => agent('gunner', v(i * 2 - 10, 0, 10))) as (TacAgent & { decided: number })[];
    let maxPerFrame = 0;
    for (let f = 0; f < 120; f++) {
      ctx.time = f / 60;
      const before = gs.reduce((s, g) => s + g.decided, 0);
      sq.update(ctx, gs);
      maxPerFrame = Math.max(maxPerFrame, gs.reduce((s, g) => s + g.decided, 0) - before);
    }
    expect(maxPerFrame).toBeLessThanOrEqual(sq.sched.maxPerFrame);
    // Everyone still thinks a few times a second (calm interval ≈ 0.45 s over 2 s).
    for (const g of gs) expect(g.decided).toBeGreaterThanOrEqual(3);
  });
});

describe('Nav field (heap Dijkstra, memoised)', () => {
  it('matches the reference O(n²) Dijkstra on a random graph, and serves repeats from the memo', () => {
    const col = new CollisionWorld();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 60; i++) nodes.push(v(rnd() * 80 - 40, 0, rnd() * 80 - 40));
    // A few walls so the graph isn't complete.
    col.add(-20, 0, -1, 20, 3, 1);
    col.add(-1, 0, 5, 1, 3, 30);
    const nav = new Nav(col, { nodes, links: [] });
    const len = (p: number[]) => p.reduce((s, n, i) => (i ? s + nav.nodes[p[i - 1]].distanceTo(nav.nodes[n]) : 0), 0);
    const field = (nav as unknown as { toward(g: number): { dist: Float64Array } }).toward.bind(nav);
    for (let k = 0; k < 40; k++) {
      const a = Math.floor(rnd() * 60), b = Math.floor(rnd() * 60);
      const ref = nav.path(a, b);
      const d = field(b).dist[a];
      if (!ref.length) expect(d).toBe(Infinity);
      else expect(d).toBeCloseTo(len(ref), 6);
    }
    const before = nav.stats.computed;
    field(3);
    field(3);
    expect(nav.stats.computed - before).toBeLessThanOrEqual(1);
    expect(nav.stats.cached).toBeGreaterThan(0);
  });
});

describe('Route budget', () => {
  it('caps re-plans per frame and resets on the next frame', () => {
    const s = new ThinkScheduler();
    expect(s.tryRoute(1)).toBe(true);
    expect(s.tryRoute(1)).toBe(true);
    expect(s.tryRoute(1)).toBe(false);
    expect(s.tryRoute(1.016)).toBe(true);
    expect(s.stats.deferredRoutes).toBe(1);
  });
});
