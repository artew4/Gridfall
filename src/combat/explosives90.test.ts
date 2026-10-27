import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from '../world/Collision';
import { FRAG, FRAG_BLAST, blastShare, exposure, markBlast, planThrow, recentBlast, simulateThrow, stepBody, throwVelocity, type Body } from './Explosives';
import { BARK_KIND_COOLDOWN, BARK_LINES, BARK_PRIORITY } from '../enemies/tactics/Barks';
import type { Combatant } from './Team';

/* 90.0: explosives: the frag's blast, its body in flight, the bots' throws. */

const body = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Body => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), grounded: false });
const run = (col: CollisionWorld, b: Body, secs: number, onHit?: (k: number) => void) => {
  for (let t = 0; t < secs; t += 1 / 60) {
    const k = stepBody(col, b, 1 / 60, FRAG);
    if (k > 0) onHit?.(k);
  }
};
const unit = (x: number, z: number): Combatant => ({ pos: new THREE.Vector3(x, 0, z), chestY: 1.25, headY: 1.6 }) as unknown as Combatant;

describe('90.0: the blast', () => {
  it('lethal within its kill radius, nothing past its reach, less with every metre between', () => {
    expect(blastShare(0, FRAG_BLAST)).toBeGreaterThan(1);
    expect(blastShare(FRAG_BLAST.kill, FRAG_BLAST)).toBeGreaterThan(1);
    expect(blastShare(FRAG_BLAST.radius, FRAG_BLAST)).toBe(0);
    let last = Infinity;
    for (let d = FRAG_BLAST.kill; d < FRAG_BLAST.radius; d += 0.5) {
      const v = blastShare(d, FRAG_BLAST);
      expect(v).toBeLessThan(last);
      last = v;
    }
    // Hurt but alive at 5 m.
    expect(blastShare(5, FRAG_BLAST)).toBeGreaterThan(0.2);
    expect(blastShare(5, FRAG_BLAST)).toBeLessThan(0.6);
  });
  it('a wall between keeps it off (but not right round its corner)', () => {
    const col = new CollisionWorld();
    col.add(1.5, 0, -3, 1.8, 3, 3);
    const at = new THREE.Vector3(0, 0.3, 0);
    expect(exposure(col, at, unit(4, 0), FRAG_BLAST)).toBe(0);
    expect(exposure(col, at, unit(-4, 0), FRAG_BLAST)).toBe(1);
    expect(exposure(col, at, unit(1, 0), FRAG_BLAST)).toBe(1);
  });
  it("the feed's tag: the last blast's for a moment", () => {
    const c = unit(0, 0);
    markBlast(c, 'FRAG', 10);
    expect(recentBlast(c, 10.1)).toBe('FRAG');
    expect(recentBlast(c, 11)).toBeUndefined();
  });
});

describe('90.0: a frag in flight', () => {
  it('dropped, it bounces lower each time and comes to rest on the floor', () => {
    const col = new CollisionWorld();
    const b = body(0, 2, 0);
    const hits: number[] = [];
    run(col, b, 3, (k) => hits.push(k));
    expect(b.grounded).toBe(true);
    expect(b.pos.y).toBeCloseTo(FRAG.r, 2);
    expect(b.vel.length()).toBe(0);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[1]).toBeLessThan(hits[0] * 0.5);
  });
  it('off a wall it comes back, and never through it', () => {
    const col = new CollisionWorld();
    col.add(3, 0, -5, 3.3, 4, 5);
    const b = body(0, 1.2, 0, 15, 2, 0);
    run(col, b, 3);
    expect(b.pos.x).toBeLessThan(3 - FRAG.r + 1e-3);
    expect(b.pos.x).toBeLessThan(2.5);
  });
  it('rests on a deck it lands on, rolls off its edge', () => {
    const col = new CollisionWorld();
    col.add(-2, 0, -2, 2, 1, 2);
    const b = body(0, 3, 0);
    run(col, b, 3);
    expect(b.pos.y).toBeCloseTo(1 + FRAG.r, 2);
    const r = body(1.5, 1.1, 0, 3, 0, 0);
    run(col, r, 3);
    expect(r.pos.y).toBeLessThan(0.2);
  });
});

describe("90.0: the bots' throws", () => {
  it('the low arc and the lob both land on the point (in the open, at the speed asked)', () => {
    const col = new CollisionWorld();
    const from = new THREE.Vector3(0, 1.55, 0), to = new THREE.Vector3(18, 0, 6);
    for (const high of [false, true]) {
      const v = throwVelocity(from, to, FRAG.speed, FRAG.gravity, high)!;
      expect(v.length()).toBeCloseTo(FRAG.speed, 3);
      // Where it first comes down (before it rolls): the air time from the arc.
      const b = body(from.x, from.y, from.z, v.x, v.y, v.z);
      for (let t = 0; t < 4 && b.pos.y > FRAG.r + 0.02; t += 1 / 240) stepBody(col, b, 1 / 240, FRAG);
      expect(Math.hypot(b.pos.x - to.x, b.pos.z - to.z)).toBeLessThan(0.6);
    }
    expect(throwVelocity(from, new THREE.Vector3(60, 0, 0), FRAG.speed, FRAG.gravity, false)).toBeNull();
  });
  it('over a wall the lob, not the low arc into it; under a roof none', () => {
    const col = new CollisionWorld();
    col.add(6, 0, -10, 6.4, 3.2, 10);
    const from = new THREE.Vector3(0, 1.55, 0), to = new THREE.Vector3(12, 0, 0);
    const v = planThrow(col, from, to, FRAG, 3.2)!;
    expect(v).not.toBeNull();
    const low = throwVelocity(from, to, FRAG.speed, FRAG.gravity, false)!;
    expect(v.y).toBeGreaterThan(low.y);
    expect(simulateThrow(col, from, v, FRAG.fuse, FRAG).x).toBeGreaterThan(6.4);
    // A low ceiling over both: nothing gets there.
    col.add(-2, 3.4, -10, 14, 3.6, 10);
    expect(planThrow(col, from, to, FRAG, 3.2)).toBeNull();
  });
  it('the barks: "frag out" and "grenade!" in both voices, heard first', () => {
    for (const k of ['frag', 'nade'] as const) {
      expect(BARK_LINES.human[k].length).toBeGreaterThan(0);
      expect(BARK_LINES.synth[k].length).toBeGreaterThan(0);
      expect(BARK_PRIORITY[k]).toBe(3);
      expect(BARK_KIND_COOLDOWN[k]).toBeLessThanOrEqual(3);
    }
  });
});
