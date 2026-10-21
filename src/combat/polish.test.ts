import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CASING_LIFE, Casings } from './Casings';
import { ARENA_SEE, ARENA_SIGHT_SHARE, contrastAt, densityOfSightRange, fogRange } from '../world/Visibility';
import { fitStairWidth, stairWallOverlaps } from '../world/StairFit';
import { CollisionWorld } from '../world/Collision';

const step = (c: Casings, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) c.update(dt);
};
// Read back one instance's position (the only public view of a casing).
const posOf = (c: Casings, i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(c.mesh.instanceMatrix.array, i * 16));

describe('Casings (8.1): a fixed instanced pool', () => {
  it('is a ring: when full, the oldest slot is reused, never more than capacity alive', () => {
    const c = new Casings(new THREE.Scene(), 4);
    for (let i = 0; i < 6; i++) c.spawn(0, 1, 0, 1, 0, 0, 0, 1, 0, 0);
    expect(c.count).toBe(4);
    expect(c.stats).toMatchObject({ spawned: 6, recycled: 2, maxAlive: 4 });
    c.update(1 / 60);
    expect(c.mesh.count).toBe(4);
  });

  it('falls, bounces on the floor it was fired over (a catwalk, not y = 0), and comes to rest there', () => {
    const c = new Casings(new THREE.Scene(), 8);
    let bounces = 0;
    c.onBounce = () => bounces++;
    c.spawn(0, 5.9, 0, 1, 0, 0, 0, 1, 0, 4.5, true);
    step(c, 2);
    const p = posOf(c, 0);
    expect(p.y).toBeCloseTo(4.506, 2);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(bounces).toBeLessThanOrEqual(3);
    // At rest: it doesn't move any more.
    step(c, 0.5);
    expect(posOf(c, 0).distanceTo(p)).toBeLessThan(1e-6);
  });

  it('shrinks away and is gone after its life; a silent casing never calls the bounce sound', () => {
    const c = new Casings(new THREE.Scene(), 8);
    let bounces = 0;
    c.onBounce = () => bounces++;
    c.spawn(0, 1, 0, 1, 0, 0, 0, 1, 0, 0, false);
    step(c, CASING_LIFE - 0.4);
    const s = new THREE.Vector3().setFromMatrixScale(new THREE.Matrix4().fromArray(c.mesh.instanceMatrix.array, 0));
    expect(s.x).toBeLessThan(1);
    step(c, 0.6);
    expect(c.count).toBe(0);
    expect(c.mesh.count).toBe(0);
    expect(bounces).toBe(0);
  });
});

describe('Visibility through fog (8.1)', () => {
  it('range(c) is where exactly c of the contrast is left; the sight range round-trips its density', () => {
    for (const rho of [0.004, 0.016, 0.06]) {
      for (const c of [0.1, ARENA_SEE, 0.5]) expect(contrastAt(rho, fogRange(rho, c))).toBeCloseTo(c, 6);
      expect(densityOfSightRange(fogRange(rho))).toBeCloseTo(rho, 9);
    }
  });

  it('the arena sees less far than the 90% fog distance, by a fixed share', () => {
    expect(ARENA_SIGHT_SHARE).toBeGreaterThan(0.8);
    expect(ARENA_SIGHT_SHARE).toBeLessThan(0.9);
    const rho = 0.06; // a sandstorm
    expect(fogRange(rho, ARENA_SEE)).toBeCloseTo(fogRange(rho) * ARENA_SIGHT_SHARE, 6);
  });
});

describe('Stair fit (8.1)', () => {
  it('a wall intruding into a stair\'s width narrows it to the wall face; one across its run is reported', () => {
    const col = new CollisionWorld();
    col.add(0, 0, 0, 0.6, 4, 10); // a wall along z, 0.6 thick, overlapping the stair's west 0.3 m
    const fit = fitStairWidth(col.colliders, { x0: 0.3, z0: 2, x1: 2.7, z1: 8 }, 'z', 0, 4.5);
    expect(fit.rect.x0).toBeCloseTo(0.6);
    expect(fit.clipped).toEqual([{ side: 'lo', by: 0.3 }]);
    const block = new CollisionWorld();
    block.add(0, 0, 4, 3, 3, 4.6); // straight across the run
    expect(fitStairWidth(block.colliders, { x0: 0.3, z0: 2, x1: 2.7, z1: 8 }, 'z', 0, 4.5).blocked.length).toBe(1);
  });

  it('a support under a raised stair, or a building above an underground one, only touches: no finding', () => {
    const col = new CollisionWorld();
    col.add(0, 0, 0, 3, 4.5, 6); // the block a 4.5 → 8.5 stair stands on
    col.addRamp(0, 0, 3, 6, 'z', 4.5, 8.5);
    expect(stairWallOverlaps(col.colliders)).toEqual([]);
    col.add(0, 0.6, 0, 0.5, 9, 6).floor = true; // a real wall beside it, at its heights
    expect(stairWallOverlaps(col.colliders).length).toBe(1);
  });
});
