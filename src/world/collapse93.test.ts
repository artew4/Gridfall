import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from './Collision';
import { RUBBLE, Rubble, spreadShares } from './Rubble';
import { Collapse, TOWER } from './Collapse';
import { Destruction, SLUMP } from './Destruction';
import { Nav } from '../enemies/Nav';
import { FRAG_BLAST, ROCKET_BLAST } from '../combat/Explosives';

/* 93.0: the big set pieces: rubble heaps, scaffold towers going over, a wall's span coming down. */

describe('93.0: rubble', () => {
  it("a pour's shares: all of it, most in its own cell", () => {
    for (const [fx, fz] of [[0.5, 0.5], [0.1, 0.9], [0.95, 0.05]]) {
      const s = spreadShares(fx, fz);
      expect(s.reduce((a, [, , w]) => a + w, 0)).toBeCloseTo(1, 6);
      expect(s[0][2]).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('heaps grow with what is poured, to a cap; low ones are vaulted, tall ones stop a body', () => {
    const col = new CollisionWorld();
    const r = new Rubble(new THREE.Scene(), col);
    const p = new THREE.Vector3(1.1, 0, 1.1);
    r.pour(p, 0.2, 0x888888);
    expect(r.flush().length).toBe(1);
    const c0 = col.colliders.length;
    expect(col.colliders[c0 - 1].vault).toBe(true);
    for (let i = 0; i < 30; i++) r.pour(p, 0.3, 0x888888);
    r.flush();
    expect(r.stats.tallest).toBeLessThanOrEqual(RUBBLE.max);
    expect(col.colliders.some((c) => c.max.y > 1.1 && !c.vault)).toBe(true);
    r.clear();
    expect(col.colliders.length).toBe(0);
  });
  it('never inside a wall', () => {
    const col = new CollisionWorld();
    col.add(0, 0, 0, 3, 3, 3);
    const r = new Rubble(new THREE.Scene(), col);
    r.pour(new THREE.Vector3(1.5, 0, 1.5), 1, 0x888888);
    expect(r.stats.heaps).toBe(0);
  });
});

describe('93.0: a scaffold tower', () => {
  function tower() {
    const col = new CollisionWorld();
    const ev: string[] = [];
    let land: [THREE.Vector3, THREE.Vector3] | null = null;
    const c = new Collapse(new THREE.Scene(), col, {
      falling: () => ev.push('falling'),
      shed: () => ev.push('shed'),
      landed: (a, b) => {
        land = [a, b];
        ev.push('landed');
      },
      changed() {},
    });
    const m = new THREE.MeshStandardMaterial();
    c.add(0, 0, 0, 2.8, 6, 1.4, m, m);
    return { col, c, ev, land: () => land };
  }
  it('a frag beside it wears it; a rocket at it brings it down away from the blast', () => {
    const t = tower();
    t.c.blast(new THREE.Vector3(1.4, 0.3, 2.4), FRAG_BLAST.breach!);
    expect(t.c.towers[0].state).toBe('up');
    expect(t.c.towers[0].hp).toBeLessThan(TOWER.hp);
    t.c.blast(new THREE.Vector3(1.4, 1, 1.5), ROCKET_BLAST.breach!);
    expect(t.c.towers[0].state).toBe('falling');
    // Its collider leaves as it starts to fall.
    expect(t.col.colliders.length).toBe(0);
    for (let s = 0; s < TOWER.fall + 0.1; s += 1 / 30) t.c.update(1 / 30);
    expect(t.ev).toContain('shed');
    expect(t.ev[t.ev.length - 1]).toBe('landed');
    const [a, b] = t.land()!;
    // Away from the blast (it stood on its +z side): towards -z, its height long.
    expect(b.z).toBeLessThan(a.z - 4);
  });
  it('a reset stands it up again', () => {
    const t = tower();
    t.c.blast(new THREE.Vector3(1.4, 1, 1.5), ROCKET_BLAST.breach!);
    t.c.reset();
    expect(t.c.towers[0].state).toBe('up');
    expect(t.col.colliders.length).toBe(1);
  });
});

describe("93.0: a wall's span", () => {
  it('a wide span hung from the eaves comes down when most of its foot is gone, row by row', () => {
    const col = new CollisionWorld();
    let slumped = 0;
    const d = new Destruction(new THREE.Scene(), col, { broke() {}, slumped: () => slumped++, changed() {} });
    d.add(0, 0, 0, 6, 4, 0.5, new THREE.MeshStandardMaterial(), 'brick', 'concrete', { hangs: true });
    d.build();
    expect(6).toBeGreaterThanOrEqual(SLUMP.wide);
    // Rockets along its foot.
    for (const x of [0.8, 3, 5.2]) d.blast(new THREE.Vector3(x, 0.3, -0.1), ROCKET_BLAST.breach!);
    expect(slumped).toBe(1);
    expect(col.colliders.length).toBeGreaterThan(0);
    for (let s = 0; s < SLUMP.time + 0.1; s += 1 / 30) d.update(1 / 30);
    expect(col.colliders.length).toBe(0);
    expect(d.debug().slumps).toBe(1);
  });
  it('a narrow one, or one hung from nothing, does not', () => {
    const col = new CollisionWorld();
    let slumped = 0;
    const d = new Destruction(new THREE.Scene(), col, { broke() {}, slumped: () => slumped++, changed() {} });
    d.add(0, 0, 0, 2, 4, 0.5, new THREE.MeshStandardMaterial(), 'brick', 'concrete', { hangs: true });
    d.build();
    d.blast(new THREE.Vector3(1, 0.3, -0.1), ROCKET_BLAST.breach!);
    expect(slumped).toBe(0);
  });
});

describe('93.0: a heap across a way', () => {
  it('cuts the link it blocks (kept as a vault if it can be vaulted)', () => {
    const col = new CollisionWorld();
    const nav = new Nav(col, { nodes: [new THREE.Vector3(0, 0, -4), new THREE.Vector3(0, 0, 4)], links: [] });
    nav.ensureVaultLinks();
    expect(nav.edges[0]).toContain(1);
    // A tall heap across the way.
    const r = new Rubble(new THREE.Scene(), col);
    for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) for (let i = 0; i < 10; i++) r.pour(new THREE.Vector3(x, 0, 0.3), 0.3, 0x888888);
    r.flush();
    expect(nav.recheckNear(new THREE.Vector3(0, 0, 0.3), 2.5).closed).toBe(1);
    expect(nav.edges[0]).not.toContain(1);
  });
});
