import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from './Collision';
import { Destruction, breachDamage, greedyRects, unsupported } from './Destruction';
import { FRAG_BLAST, ROCKET_BLAST } from '../combat/Explosives';

/* 91.0: destructible walls: the cells, their colliders, what holds them up, rounds and blasts. */

const grid = (rows: string[]) => {
  // Rows top first ('#' standing), as drawn.
  const nv = rows.length, nu = rows[0].length;
  const a = new Uint8Array(nu * nv);
  rows.forEach((r, k) => [...r].forEach((ch, u) => (a[u + (nv - 1 - k) * nu] = ch === '#' ? 1 : 0)));
  return { a, nu, nv };
};

function world(hangs = false, w = 4) {
  const col = new CollisionWorld();
  const broke: boolean[] = [];
  const d = new Destruction(new THREE.Scene(), col, { broke: (_p, _k, _s, falling) => broke.push(falling), changed() {} });
  // A brick wall 4 m along x, 3 m up, 0.5 thick (8 × 6 cells).
  d.add(0, 0, 0, w, 3, 0.5, new THREE.MeshStandardMaterial(), 'brick', 'concrete', { hangs });
  d.build();
  const through = (x: number, y: number) => !col.raycast(new THREE.Vector3(x, y, -3), new THREE.Vector3(0, 0, 1), 6);
  return { col, d, broke, through };
}

describe('91.0: the cells', () => {
  it('the fewest boxes over what stands', () => {
    const g = grid(['####', '#..#', '####']);
    const r = greedyRects(g.a, g.nu, g.nv);
    expect(r.length).toBe(4);
    let n = 0;
    for (const [u0, v0, u1, v1] of r) n += (u1 - u0) * (v1 - v0);
    expect(n).toBe(10);
    expect(greedyRects(grid(['####', '####']).a, 4, 2)).toEqual([[0, 0, 4, 2]]);
  });
  it('what a hole cuts off falls (held from the bottom row, and the top one when it hangs)', () => {
    const g = grid(['.##.', '.##.', '#..#']);
    expect(unsupported(g.a, g.nu, g.nv, false).sort((x, y) => x - y)).toEqual([5, 6, 9, 10]);
    expect(unsupported(g.a, g.nu, g.nv, true)).toEqual([]);
    expect(unsupported(grid(['#..#', '#..#']).a, 4, 2, false)).toEqual([]);
  });
  it("a blast's bite: all within its breach, less to its crack, none past", () => {
    const s = ROCKET_BLAST.breach!;
    expect(breachDamage(s.breach, s)).toBe(Infinity);
    expect(breachDamage((s.breach + s.crack) / 2, s)).toBeGreaterThan(0);
    expect(breachDamage(s.crack, s)).toBe(0);
    expect(FRAG_BLAST.breach!.breach).toBeLessThan(s.breach);
  });
});

describe('91.0: a brick wall', () => {
  it('rounds on one spot open it in about a dozen; a chip shows nothing until a cell crumbles', () => {
    const { col, d, through } = world();
    const at = new THREE.Vector3(2.1, 1.6, 0);
    const hit = () => col.raycast(new THREE.Vector3(2.1, 1.6, -3), new THREE.Vector3(0, 0, 1), 6, { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' });
    hit()!.collider!.wreck!(hit()!, new THREE.Vector3(0, 0, 1), 21);
    expect(d.debug().opened).toBe(0);
    let n = 1;
    while (!through(at.x, at.y) && n < 60) {
      const h = hit()!;
      h.collider!.wreck!(h, new THREE.Vector3(0, 0, 1), 21);
      n++;
    }
    expect(n).toBeGreaterThan(6);
    expect(n).toBeLessThan(16);
    expect(d.debug().opened).toBe(1);
    // Next to it, still a wall.
    expect(through(0.3, 0.3)).toBe(false);
  });
  it("a rocket's blast at its face holes it through, the rest still stops rounds", () => {
    const { d, through } = world(true);
    d.blast(new THREE.Vector3(2, 1.5, -0.1), ROCKET_BLAST.breach!);
    expect(through(2, 1.5)).toBe(true);
    expect(through(0.2, 2.8)).toBe(false);
    expect(d.debug().cells).toBeGreaterThan(8);
  });
  it("a hole across a pier drops what stood on it (when it doesn't hang from the eaves)", () => {
    // A pier 1 m wide: a frag a metre up cuts it through; the top falls.
    const a = world(false, 1);
    a.d.blast(new THREE.Vector3(0.5, 1.0, -0.1), FRAG_BLAST.breach!);
    expect(a.broke.some((f) => f)).toBe(true);
    expect(a.d.debug().fell).toBeGreaterThan(0);
    expect(a.through(0.5, 2.7)).toBe(true);
    // Hung from the eaves, its top stays.
    const b = world(true, 1);
    b.d.blast(new THREE.Vector3(0.5, 1.0, -0.1), FRAG_BLAST.breach!);
    expect(b.d.debug().fell).toBe(0);
    expect(b.through(0.5, 2.7)).toBe(false);
  });
  it('a reset puts it back whole: one box, stops rounds again', () => {
    const { col, d, through } = world(true);
    const n0 = col.colliders.length;
    d.blast(new THREE.Vector3(2, 1.5, -0.1), ROCKET_BLAST.breach!);
    expect(col.colliders.length).toBeGreaterThan(n0);
    d.reset();
    expect(col.colliders.length).toBe(n0);
    expect(through(2, 1.5)).toBe(false);
    expect(d.debug().cells).toBe(0);
  });
});
