import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPAWN, SpawnManager, ZoneSpawner, deployZones, laneNeed, mirrorPads, rotatePads, sideOf, spread, type SpawnPad } from './SpawnManager';

const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const pad = (id: number, x: number, z: number, side: SpawnPad['side'] = null): SpawnPad => ({ id, pos: v(x, z), yaw: 0, side });
const open = () => true;
const fixed = () => 0.5;
/** A wall along x = 0 for |z| < 40: blocks any ray that crosses it there. */
const wall = (a: THREE.Vector3, b: THREE.Vector3) => {
  if (Math.sign(a.x) === Math.sign(b.x) || a.x === b.x) return true;
  const t = a.x / (a.x - b.x);
  return Math.abs(a.z + (b.z - a.z) * t) >= 40;
};

describe('27.0 spawn scoring', () => {
  it('never spawns within the hard minimum of a hostile', () => {
    const m = new SpawnManager([pad(0, 0, 0), pad(1, 100, 0)], open, fixed);
    const r = m.pick('alpha', [{ pos: v(5, 0) }], [], 0);
    expect(r.pad.id).toBe(1);
    expect(r.nearest).toBeGreaterThan(SPAWN.hardMin);
  });

  it('a pad a hostile can see is never taken while a hidden one exists, however close the hidden one', () => {
    // Pad 0 at 60 m in the open; pad 1 at 25 m but behind the wall.
    const m = new SpawnManager([pad(0, -60, 0), pad(1, 25, 0)], wall, fixed);
    const r = m.pick('alpha', [{ pos: v(-1, 0) }], [], 0);
    expect(r.pad.id).toBe(1);
    expect(r.fallback).toBe(false);
  });

  it('rays are spent only down the ranked list, and stop at the first clear pad', () => {
    let rays = 0;
    // True: in sight (a los callback's "nothing blocks").
    const counting = (_a: THREE.Vector3, _b: THREE.Vector3) => (rays++, open());
    const pads = Array.from({ length: 15 }, (_, i) => pad(i, 30 + i * 10, 0));
    const m = new SpawnManager(pads, (a, b) => counting(a, b), fixed);
    // Every pad is in sight of the hostile: the cap holds.
    const r = m.pick('alpha', [{ pos: v(0, 0) }, { pos: v(0, 5) }], [], 0);
    expect(r.rays).toBeLessThanOrEqual(SPAWN.maxRays);
    // Nothing in sight: one pad tried, one ray per hostile in range.
    rays = 0;
    const m2 = new SpawnManager(pads, (a, b) => !counting(a, b), fixed);
    const r2 = m2.pick('alpha', [{ pos: v(0, 0) }, { pos: v(0, 5) }], [], 0);
    expect(r2.rays).toBeLessThanOrEqual(2);
    expect(rays).toBe(r2.rays);
  });

  it('all pads in sight: the fallback is the one furthest from its nearest hostile', () => {
    const m = new SpawnManager([pad(0, 20, 0), pad(1, 65, 0), pad(2, 40, 0)], () => true, fixed);
    const r = m.pick('alpha', [{ pos: v(0, 0) }], [], 0);
    expect(r.fallback).toBe(true);
    expect(r.pad.id).toBe(1);
  });

  it('with the enemy far away, it spawns near its allies (a squad), not alone', () => {
    const m = new SpawnManager([pad(0, 0, 0), pad(1, 0, 100)], open, fixed);
    const r = m.pick('alpha', [{ pos: v(300, 50) }], [{ pos: v(2, 88) }, { pos: v(-3, 90) }], 0);
    expect(r.pad.id).toBe(1);
  });

  it('enemy pressure outweighs a nearby ally', () => {
    const m = new SpawnManager([pad(0, 0, 0), pad(1, 0, 100)], open, fixed);
    // Pad 1 has an ally 12 m off but a hostile at 18 m; pad 0 is quiet and alone.
    const r = m.pick('alpha', [{ pos: v(0, 118) }], [{ pos: v(0, 88) }], 0);
    expect(r.pad.id).toBe(0);
  });

  it('a hostile facing the pad counts against it; one facing away does not', () => {
    const m = new SpawnManager([pad(0, 0, 0)], open, fixed);
    const at = { pos: v(0, 25) };
    const facing = m.cheap(m.pads[0], 'alpha', [{ ...at, face: { x: 0, y: -1 } }], [], 0).s;
    const away = m.cheap(m.pads[0], 'alpha', [{ ...at, face: { x: 0, y: 1 } }], [], 0).s;
    expect(away - facing).toBeCloseTo(SPAWN.wFace);
  });

  it('a pad just used, or where someone just died, scores lower for a while', () => {
    const m = new SpawnManager([pad(0, 0, 0), pad(1, 0, 60)], open, fixed);
    const r1 = m.pick('alpha', [], [], 0);
    const r2 = m.pick('alpha', [], [], 1);
    expect(r2.pad.id).not.toBe(r1.pad.id);
    m.noteDeath(v(0, 62), 10);
    const s1 = m.cheap(m.pads[1], 'alpha', [], [], 11).s, s0 = m.cheap(m.pads[0], 'alpha', [], [], 11).s;
    expect(s1).toBeLessThan(s0);
  });

  it('a pair spawning on one pad stands side by side, not on top of each other', () => {
    const m = new SpawnManager([pad(0, 0, 0)], open, fixed);
    const taken: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) taken.push(m.slot(m.pads[0], (p) => taken.some((t) => t.distanceTo(p) < 1)));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(taken[i].distanceTo(taken[j])).toBeGreaterThan(1);
  });
});

describe('27.0 the opening spawn', () => {
  const pads = [
    pad(0, -30, 60, 'alpha'), pad(1, 0, 60, 'alpha'), pad(2, 30, 60, 'alpha'), pad(3, -30, 30, 'alpha'), pad(4, 30, 30, 'alpha'),
    pad(5, -30, -60, 'omega'), pad(6, 0, -60, 'omega'), pad(7, 30, -60, 'omega'), pad(8, -30, -30, 'omega'), pad(9, 30, -30, 'omega'),
    pad(10, 0, 0, null),
  ];
  it('squads of two on 3-4 pads of each side, never the same pad twice', () => {
    const m = new SpawnManager(pads, open, Math.random);
    const o = m.opening({ alpha: 7, omega: 7 });
    expect(o.alpha).toHaveLength(4);
    expect(o.omega).toHaveLength(4);
    expect(new Set(o.alpha).size).toBe(4);
    expect(o.alpha.every((p) => p.side === 'alpha')).toBe(true);
    expect(o.omega.every((p) => p.side === 'omega')).toBe(true);
    expect(m.opening({ alpha: 5, omega: 5 }).alpha).toHaveLength(3);
  });

  it('no OMEGA pad in sight of an ALPHA one, nor within the gap', () => {
    // Line of sight only along x = -30 (pads 0, 3, 5, 8 see each other down that side).
    const sight = (a: THREE.Vector3, b: THREE.Vector3) => Math.abs(a.x + 30) < 1 && Math.abs(b.x + 30) < 1;
    for (let k = 0; k < 20; k++) {
      const m = new SpawnManager(pads, sight, Math.random);
      const o = m.opening({ alpha: 7, omega: 7 });
      for (const a of o.alpha) for (const b of o.omega) {
        expect(sight(a.pos, b.pos)).toBe(false);
        expect(a.pos.distanceTo(b.pos)).toBeGreaterThanOrEqual(SPAWN.openGap);
      }
    }
  });

  it('spread: farthest-point, so squads start apart', () => {
    const s = spread(pads.slice(0, 5), 3, () => 0);
    const d = Math.min(s[0].pos.distanceTo(s[1].pos), s[0].pos.distanceTo(s[2].pos), s[1].pos.distanceTo(s[2].pos));
    expect(d).toBeGreaterThanOrEqual(30);
  });

  it('a side by progress between the old yards: the middle fifth is nobody\'s', () => {
    const a = { x: 0, z: 60 }, o = { x: 0, z: -60 };
    expect(sideOf({ x: 0, z: 40 }, a, o)).toBe('alpha');
    expect(sideOf({ x: 10, z: -40 }, a, o)).toBe('omega');
    expect(sideOf({ x: 20, z: 5 }, a, o)).toBe(null);
  });
});

describe('27.0 lanes and mirrored pads', () => {
  it('lane need: a lane short of its weighted share wants a spawn, an overfull one does not', () => {
    // Weights 1, 1.6, 1 (a centre of gravity); five on the team: three in the left lane, two in the centre.
    const need = laneNeed([0, 0, 0, 1, 1], [1, 1.6, 1]);
    expect(need[2]).toBeGreaterThan(need[1]);
    expect(need[0]).toBeLessThan(0);
    // At the weighted share exactly, nothing is needed.
    expect(laneNeed([], [1, 1, 1]).every((x) => Math.abs(x) < 1e-9)).toBe(true);
  });

  it("mirrorPads: ALPHA's half and its mirror across z = 0, facing mirrored", () => {
    const all = mirrorPads([[3, 0, 20, 0.5]]);
    expect(all).toHaveLength(2);
    expect(all[1].slice(0, 3)).toEqual([3, 0, -20]);
    // Facing (sin a, cos a) mirrors to (sin a, −cos a).
    expect(Math.sin(all[1][3])).toBeCloseTo(Math.sin(0.5), 2);
    expect(Math.cos(all[1][3])).toBeCloseTo(-Math.cos(0.5), 2);
  });

  it('the lane term lifts a pad in a lane the team is short of', () => {
    const pads = [{ ...pad(0, 0, 0), lane: 0 }, { ...pad(1, 0, 100), lane: 2 }];
    const m = new SpawnManager(pads, open, fixed);
    expect(m.pick('alpha', [], [], 0, undefined, [-1, 0, 1]).pad.id).toBe(1);
    expect(m.pick('alpha', [], [], 100, undefined, [1, 0, -1]).pad.id).toBe(0);
  });
});

describe('28.0 point-symmetric pads and per-map weights', () => {
  it('rotatePads: ALPHA\'s half and its 180° rotation, facing turned round', () => {
    const all = rotatePads([[10, 1, 20, 0.5]]);
    expect(all[1].slice(0, 3)).toEqual([-10, 1, -20]);
    expect(Math.sin(all[1][3])).toBeCloseTo(-Math.sin(0.5), 2);
    expect(Math.cos(all[1][3])).toBeCloseTo(-Math.cos(0.5), 2);
  });

  it('a map\'s tuning overrides the weights: a pad 20 m off is fine by default, too close on the dunes', () => {
    const pads = [pad(0, 0, 0), pad(1, 0, 200)];
    expect(new SpawnManager(pads, open, fixed).cheap(pads[0], 'alpha', [{ pos: v(0, 20) }], [], 0).s).toBeGreaterThan(-Infinity);
    const dunes = new SpawnManager(pads, open, fixed, { hardMin: 24 });
    expect(dunes.S.hardMin).toBe(24);
    expect(dunes.cheap(pads[0], 'alpha', [{ pos: v(0, 20) }], [], 0).s).toBe(-Infinity);
  });
});


describe('31.0 deployment zones', () => {
  const half = [
    { id: 'A' as const, x: -30, y: 0, z: 40, r: 6, yaw: Math.PI },
    { id: 'B' as const, x: 0, y: 0, z: 55, r: 6, yaw: Math.PI },
    { id: 'C' as const, x: 30, y: 0, z: 40, r: 6, yaw: Math.PI },
  ];
  const ring = (c: THREE.Vector3) => [0, 1, 2, 3].map((k) => c.clone().add(v(Math.cos(k) * 2, Math.sin(k) * 2)));
  const make = (los: (a: THREE.Vector3, b: THREE.Vector3) => boolean = open) => new ZoneSpawner(deployZones(half, 'mirror', ring), los, fixed);

  it("zones per team in its own half, lettered from its own left (a mirror swaps OMEGA's)", () => {
    const z = deployZones(half, 'mirror', ring);
    const a = z.filter((q) => q.team === 'alpha'), o = z.filter((q) => q.team === 'omega');
    expect(a.every((q) => q.centre.z > 0)).toBe(true);
    expect(o.every((q) => q.centre.z < 0)).toBe(true);
    // ALPHA faces -z: its left is -x. OMEGA faces +z: its left is +x.
    expect(a.find((q) => q.id === 'A')!.centre.x).toBeLessThan(0);
    expect(o.find((q) => q.id === 'A')!.centre.x).toBeGreaterThan(0);
    const r = deployZones(half, 'rotate', ring).filter((q) => q.team === 'omega');
    expect(r.find((q) => q.id === 'A')!.centre.x).toBeGreaterThan(0);
  });

  it('round-robin: with every zone safe, respawns cycle A, B, C (least used, then least recent)', () => {
    const zs = make();
    const ids = Array.from({ length: 6 }, (_, i) => zs.pick('alpha', [], [], i).zone.id);
    expect(ids).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
  });

  it("a zone with a hostile too close, or in a hostile's sight, is skipped", () => {
    const zs = make();
    // A hostile 10 m from zone A's centre (inside r + hardMin).
    expect(zs.pick('alpha', [{ pos: v(-30, 30) }], [], 0).zone.id).not.toBe('A');
    // Sight: only zone B's centre is visible (a callback that sees x = 0 only).
    const seen = make((a, b) => Math.abs(b.x) < 1);
    // A hostile on the centre line, within sight range of all three (B's centre the one it sees).
    const picks = Array.from({ length: 4 }, (_, i) => seen.pick('alpha', [{ pos: v(0, 5) }], [], i).zone.id);
    expect(picks).not.toContain('B');
  });

  it('no zone safe: the one whose nearest hostile is furthest, counted', () => {
    const zs = make(() => true);
    // Within sight of every zone (A 25 m, B 16 m, C 35 m off), all seen: C is the furthest.
    const p = zs.pick('alpha', [{ pos: v(-5, 40) }], [], 0);
    expect(p.unsafeZone).toBe(true);
    expect(p.zone.id).toBe('C');
    expect(zs.stats.noSafeZone).toBe(1);
  });

  it("the spot is inside the chosen zone's radius", () => {
    const zs = make();
    for (let i = 0; i < 6; i++) {
      const p = zs.pick('omega', [], [], i);
      expect(p.at.distanceTo(p.zone.centre)).toBeLessThanOrEqual(p.zone.r + 1.3);
      expect(p.zone.team).toBe('omega');
    }
  });

  it('the opening: squads of two dealt round-robin over the zones', () => {
    const zs = make();
    const o = zs.opening({ alpha: 7, omega: 5 });
    expect(o.alpha.map((z) => z.id)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'A']);
    expect(o.omega).toHaveLength(5);
  });
});
