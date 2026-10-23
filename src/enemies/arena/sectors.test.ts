import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { ArenaDirector, type ArenaMember } from './ArenaDirector';
import { ARENA } from './ArenaCtx';
import { clumps, countNear } from './Density';
import { SPAWN, SpawnManager, ZoneSpawner, deployZones, fireteamScore, type SpawnPad } from '../../levels/SpawnManager';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';

const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const member = (uid: number, pos: THREE.Vector3): ArenaMember => ({ uid, pos, alive: true, isPlayer: false });
const fixed = () => 0;
/** Three lanes 30 m apart running from our spawn (z 50) to theirs (z -50). */
const LANES = [[v(-30, 40), v(-30, -40)], [v(0, 40), v(0, -40)], [v(30, 40), v(30, -40)]];
const tick = (d: ArenaDirector, ms: ArenaMember[], now: number) => d.update(now, ms, 5, { own: 25, theirs: 25 });

describe('41.0 density', () => {
  it('clumps: single linkage within r (a chain is one group); the sizes add up', () => {
    const { of, sizes } = clumps([0, 8, 16, 60, 64, 200], [0, 0, 0, 0, 0, 0], 10);
    expect(sizes.slice().sort()).toEqual([1, 2, 3]);
    expect(of[0]).toBe(of[2]);
    expect(of[3]).toBe(of[4]);
    expect(of[5]).not.toBe(of[0]);
  });

  it('countNear: within r on the ground, and within dy of a height when given', () => {
    const pts = [v(0, 0), v(3, 4), v(0, 6), v(1, 0, 5)];
    expect(countNear(pts, 0, 0, 5)).toBe(3);
    expect(countNear(pts, 0, 0, 5, 0, 1)).toBe(2);
  });
});

describe('41.0 spawns: fireteams, not deathballs', () => {
  it('the curve: 1-2 allies near is a fireteam to join, 3 nothing, 4+ a deathball (worse per ally)', () => {
    expect(fireteamScore(0, 10, 25)).toBe(0);
    expect(fireteamScore(1, 10, 25)).toBe(10);
    expect(fireteamScore(2, 10, 25)).toBe(10);
    expect(fireteamScore(3, 10, 25)).toBe(0);
    expect(fireteamScore(4, 10, 25)).toBe(-25);
    expect(fireteamScore(6, 10, 25)).toBe(-75);
  });

  const half = [
    { id: 'A' as const, x: -30, y: 0, z: 40, r: 6, yaw: Math.PI },
    { id: 'B' as const, x: 0, y: 0, z: 55, r: 6, yaw: Math.PI },
    { id: 'C' as const, x: 30, y: 0, z: 40, r: 6, yaw: Math.PI },
  ];
  const ring = (c: THREE.Vector3) => [0, 1, 2, 3].map((k) => c.clone().add(v(Math.cos(k) * 2, Math.sin(k) * 2)));
  const zoner = (tuning = {}) => {
    const z = new ZoneSpawner(deployZones(half, 'mirror', ring), () => true, () => 0.5, tuning);
    z.fireteam = true;
    return z;
  };
  const near = (x: number, z: number, n: number) => Array.from({ length: n }, (_, i) => ({ pos: v(x + i, z) }));

  it('a zone with one or two allies near it comes first among the equally used', () => {
    const zs = zoner();
    expect(zs.pick('alpha', [], near(30, 42, 1), 0).zone.id).toBe('C');
    // Off: the 31.0 round-robin (A first).
    const off = zoner();
    off.fireteam = false;
    expect(off.pick('alpha', [], near(30, 42, 1), 0).zone.id).toBe('A');
  });

  it('a zone with four or more allies near it comes last, even used less than the others', () => {
    const zs = zoner();
    // B and C used once already; A not at all, but five of the team stand by it.
    for (const id of ['B', 'C']) zs.zonesOf('alpha').find((z) => z.id === id)!.uses = 1;
    expect(zs.pick('alpha', [], near(-30, 40, 5), 0).zone.id).not.toBe('A');
    // Two by it: A (least used and a fireteam to join).
    const zs2 = zoner();
    for (const id of ['B', 'C']) zs2.zonesOf('alpha').find((z) => z.id === id)!.uses = 1;
    expect(zs2.pick('alpha', [], near(-30, 40, 2), 0).zone.id).toBe('A');
  });

  it('the local area scales with the map: allies 10 m off count on a wide map (18), not a narrow one (7)', () => {
    const allies = near(-30, 50, 1);
    expect(zoner({ densityR: 18 }).pick('alpha', [], allies, 0).zone.id).toBe('A');
    const narrow = zoner({ densityR: 7 });
    // Nobody within 7 m of any zone: plain round-robin, which starts at A too: put A's turn last.
    narrow.zonesOf('alpha').find((z) => z.id === 'A')!.lastUse = 5;
    narrow.zonesOf('alpha').find((z) => z.id === 'B')!.lastUse = 1;
    narrow.zonesOf('alpha').find((z) => z.id === 'C')!.lastUse = 2;
    expect(narrow.pick('alpha', [], allies, 10).zone.id).toBe('B');
  });

  it('pads: the fireteam term replaces the squad count (two near beats five near)', () => {
    const pad = (id: number, x: number, z: number): SpawnPad => ({ id, pos: v(x, z), yaw: 0, side: null });
    const pads = [pad(0, 0, 0), pad(1, 100, 0)];
    const allies = [...near(0, 3, 5), ...near(100, 3, 2)];
    const m = new SpawnManager(pads, () => true, () => 0, { jitter: 0 });
    m.fireteam = true;
    expect(m.cheap(pads[1], 'alpha', [], allies, 0).s).toBeGreaterThan(m.cheap(pads[0], 'alpha', [], allies, 0).s + SPAWN.wCrowd);
    // Off: five near was better (the 27.0 squad term, capped at three).
    m.fireteam = false;
    expect(m.cheap(pads[0], 'alpha', [], allies, 0).s).toBeGreaterThan(m.cheap(pads[1], 'alpha', [], allies, 0).s);
  });

  it('every TDM map with zones sets its local area: wide maps 14-20 m, narrow ones 5-8', () => {
    const r = (f: string) => Number(/densityR: (\d+)/.exec(readFileSync(new URL(`../../levels/${f}`, import.meta.url), 'utf8'))?.[1]);
    for (const f of ['desert/DesertLevel.ts', 'favelas/FavelaLevel.ts', 'docks/DocksLevel.ts']) expect(r(f)).toBeGreaterThanOrEqual(14);
    for (const f of ['oldport/OldPortLevel.ts', 'maglev/MaglevLevel.ts']) {
      expect(r(f)).toBeGreaterThanOrEqual(5);
      expect(r(f)).toBeLessThanOrEqual(8);
    }
  });
});

describe('41.0 director: fireteams', () => {
  const on0 = ARENA.sectors.on;
  afterEach(() => {
    ARENA.sectors.on = on0;
  });

  it('a fireteam is the team over the sectors, 1 to 3 (5 bots, 3 sectors: 2; 12 and 5: 3; 3 and 5: 1)', () => {
    expect(new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES).fireteamSize(5)).toBe(2);
    const five = [...LANES, ...LANES.slice(0, 2)];
    expect(new ArenaDirector('alpha', v(0, 50), v(0, -50), five).fireteamSize(12)).toBe(3);
    // 42.0: with roles the fireteams are the frontliners' (half the team): pairs at least.
    expect(new ArenaDirector('alpha', v(0, 50), v(0, -50), five).fireteamSize(3)).toBe(ARENA.roles.on ? 2 : 1);
    const roles0 = ARENA.roles.on;
    ARENA.roles.on = false;
    expect(new ArenaDirector('alpha', v(0, 50), v(0, -50), five).fireteamSize(3)).toBe(1);
    ARENA.roles.on = roles0;
  });

  it('bots spawning together form fireteams; a member keeps its leader (lowest uid) and its sector', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    const ms = [1, 2, 3, 4, 5, 6].map((u) => member(u, v(u, 50)));
    tick(d, ms, 1);
    for (const ft of d.fireteams.values()) {
      expect(ft.length).toBeLessThanOrEqual(2);
      for (const u of ft) expect(d.laneOf.get(u)).toBe(d.laneOf.get(ft[0]));
    }
    expect(d.fireteams.size).toBe(3);
    expect(new Set(d.laneOf.values()).size).toBe(3);
    expect(d.leaderOf(2)?.uid).toBe(1);
    expect(d.leaderOf(1)).toBe(null);
  });

  it('the join radius scales with the map (densityR × join): 15 m apart is one fireteam at 18, two at 7', () => {
    // Six bots on three sectors: fireteams of two; four of them alone far off.
    const far = [3, 4, 5, 6].map((u) => member(u, v(-200 + u * 80, -100)));
    const run = (r: number) => {
      const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
      d.densityR = r;
      tick(d, [member(1, v(0, 50)), member(2, v(15, 50)), ...far], 1);
      return d.fireteamOf(1)!.includes(2);
    };
    expect(run(18)).toBe(true);
    expect(run(7)).toBe(false);
  });

  it('the dead leave their fireteam; the next lowest uid leads', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    // Nine bots on three sectors: fireteams of three; 1-3 together, the rest alone far off.
    const ms = [member(1, v(0, 50)), member(2, v(1, 50)), member(3, v(2, 50)), ...[4, 5, 6, 7, 8, 9].map((u) => member(u, v(-300 + u * 60, -100)))];
    tick(d, ms, 1);
    expect(d.fireteamOf(1)).toEqual([1, 2, 3]);
    tick(d, ms.slice(1), 2);
    expect(d.fireteamOf(2)).toEqual([2, 3]);
    expect(d.leaderOf(3)?.uid).toBe(2);
  });

  it('off: no fireteams (40.0)', () => {
    ARENA.sectors.on = false;
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    tick(d, [member(1, v(0, 50)), member(2, v(1, 50))], 1);
    expect(d.fireteams.size).toBe(0);
    expect(d.leaderOf(2)).toBe(null);
  });
});

describe('41.0 director: the engagement cap', () => {
  const on0 = ARENA.sectors.on;
  afterEach(() => {
    ARENA.sectors.on = on0;
  });

  it('at most `commit` of the team chase one hostile, fireteam mates included; a commitment lapses', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    // Three fireteams far apart (one bot each at a time of three sectors' worth: no merging).
    const ms = [member(1, v(-60, 0)), member(2, v(0, 0)), member(3, v(60, 0)), member(4, v(0, 90)), member(5, v(61, 0))];
    tick(d, ms, 1);
    const C = ARENA.sectors.commit;
    for (let u = 1; u <= C; u++) d.commit(u, 99, 1);
    expect(d.committedOn(99, 4, 1)).toBe(C);
    expect(d.overCommitted(99, 4, 1)).toBe(true);
    // Bot 5 stands by bot 3 (its fireteam): the cap holds for it too.
    expect(d.fireteamOf(5)).toContain(3);
    expect(d.overCommitted(99, 5, 1)).toBe(true);
    // One of the three itself is not over (it is one of them).
    expect(d.overCommitted(99, 3, 1)).toBe(false);
    // A second later nobody renewed: free again.
    expect(d.overCommitted(99, 4, 1 + ARENA.sectors.commitTtl + 0.01)).toBe(false);
    ARENA.sectors.on = false;
    expect(d.overCommitted(99, 4, 1)).toBe(false);
  });

  it('the fight site: at most `site` of the team after hostiles within the density radius of each other', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    d.densityR = 12;
    const ms = [1, 2, 3, 4, 5].map((u) => member(u, v(-100 + u * 40, 0)));
    tick(d, ms, 1);
    // Four bots, each on a different hostile of one group (within 12 m of each other).
    [[1, 91, 0], [2, 92, 4], [3, 93, 8], [4, 94, -4]].forEach(([u, h, x]) => d.commit(u, h, 1, v(x, -20)));
    expect(d.committedNear(v(2, -20), 5, 1)).toBe(4);
    // A fifth hostile in that group: nobody on it, but the fight is full.
    expect(d.overCommitted(95, 5, 1, v(2, -22))).toBe(ARENA.sectors.site > 0);
    // One 40 m off is another fight.
    expect(d.overCommitted(96, 5, 1, v(40, -20))).toBe(false);
  });

  it("the radar (freshest) passes over a contact the team already chases in force", () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    const ms = [member(1, v(-60, 0)), member(2, v(0, 0)), member(3, v(60, 0)), member(4, v(0, 90))];
    tick(d, ms, 1);
    const hostile = (uid: number, p: THREE.Vector3) => ({ uid, pos: p, vel: v(0, 0), alive: true, team: 'omega' }) as never;
    d.sighting(hostile(99, v(0, 80)), 1);
    d.sighting(hostile(98, v(-40, 80)), 1);
    expect(d.freshest(v(0, 90), 1, 4)?.who.uid).toBe(99);
    for (const u of [1, 2, 3]) d.commit(u, 99, 1);
    expect(d.freshest(v(0, 90), 1, 4)?.who.uid).toBe(98);
    // Without a uid (facing, watching): every contact, as before.
    expect(d.freshest(v(0, 90), 1)?.who.uid).toBe(99);
  });
});

describe('41.0 director: sectors', () => {
  it('a patrol avoids a crowded sector for an area in an empty one, a little further off', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    d.setPatrol([v(0, 0), v(-30, 0)]);
    // Four of the team in the centre sector (the crowd line), the patrolling bot among them.
    const ms = [1, 2, 3, 4].map((u) => member(u, v(u * 20 - 50 > 0 ? 2 : -2, u * 10 - 20)));
    ms.push(member(9, v(-8, 20)));
    tick(d, ms, 1);
    const sec = d.sectorTerms(9)!;
    expect(sec[1]).toBeLessThan(sec[0]);
    expect(d.hvas[d.patrolPick(9, v(-8, 20), 1, fixed)].x).toBe(-30);
  });

  it('a crowded sector sends its newest fireteam out of any fight to the sector fewest are sent to', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    d.setPatrol([v(0, 0), v(-30, 0), v(30, 0)]);
    const ms = [1, 2, 3, 4, 5, 6].map((u) => member(u, v(u - 3, u * 9 - 30)));
    // All in the centre and sent there.
    tick(d, ms, 1);
    for (const m of ms) d.laneOf.set(m.uid, 1);
    d.patrolPick(6, ms[5].pos, 1, fixed);
    tick(d, ms, 1 + ARENA.sectors.peelCd);
    expect(d.sectorStats.peels).toBe(1);
    expect([...d.laneOf.values()].filter((l) => l === 1).length).toBeLessThan(6);
    // Its claim was dropped: it picks again.
    const moved = [...d.laneOf.entries()].filter(([, l]) => l !== 1).map(([u]) => u);
    expect(moved.length).toBeGreaterThan(0);
  });

  it("a fireteam leader's patrol claim counts its whole fireteam", () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    // Two areas 20 m apart (inside space.patrolR of each other).
    d.setPatrol([v(-10, 0), v(10, 0)]);
    // Six on three sectors: fireteams of two. 1+2 together; 3-6 alone far off.
    const ms = [member(1, v(-30, 30)), member(2, v(-29, 30)), ...[3, 4, 5, 6].map((u) => member(u, v(-200 + u * 70, 90)))];
    tick(d, ms, 1);
    expect(d.fireteamOf(1)).toEqual([1, 2]);
    const i = d.patrolPick(1, ms[0].pos, 1, fixed);
    expect(d.claimOf(1)).toBe(i);
    // Two bodies: twice what one bot's claim 20 m off crowds.
    expect(d.crowd(1 - i, 9)).toBeCloseTo(2 * (1 - 20 / ARENA.space.patrolR), 5);
  });

  it('nobody is sent out of a fight', () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    const ms = [1, 2, 3, 4, 5, 6].map((u) => member(u, v(u - 3, u * 9 - 30)));
    tick(d, ms, 1);
    for (const m of ms) {
      d.laneOf.set(m.uid, 1);
      d.commit(m.uid, 99, 1 + ARENA.sectors.peelCd);
    }
    tick(d, ms, 1 + ARENA.sectors.peelCd);
    expect(d.sectorStats.peels).toBe(0);
  });
});
