import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 75.0: nature (tools/blender/props_nature.py) and its fitting (Nature.ts): inside the colliders. */

const g = readGlb('props/nature');
// The kit as the game loads it: each node's parts as geometries.
const kits = Object.fromEntries(
  Object.entries(g.nodes).map(([name, parts]) => [
    name,
    parts.map((p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.tris.flat(2), 3));
      return { geo, role: p.role };
    }),
  ]),
);
vi.mock('../entities/weapons/models', () => ({ propKits: () => kits }));
const { plant, rock, trunk } = await import('./Nature');

const each = (geo: THREE.BufferGeometry, f: (x: number, y: number, z: number) => void) => {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) f(p.getX(i), p.getY(i), p.getZ(i));
};

describe('75.0: the nature kit', () => {
  it('its plants, trunks and rocks, in roles the maps paint, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['bigleaf', 'bush', 'buttress', 'crown', 'fern', 'rock_a', 'rock_b', 'rock_c', 'slim', 'trunk']);
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(['leaf', 'bark', 'rock']).toContain(p.role);
    expect(g.tris).toBeLessThan(6000);
  });
  it('the undergrowth stays light (thousands of instances)', () => {
    const tris = (n: string) => g.nodes[n].reduce((s, p) => s + p.tris.length, 0);
    expect(tris('fern')).toBeLessThan(400);
    expect(tris('bush')).toBeLessThan(400);
    expect(tris('bigleaf')).toBeLessThan(300);
  });
});

describe('75.0: fitted to what they replace', () => {
  it('trunks, root flares and rocks never stand out of their collider cylinders', () => {
    for (const [r, h] of [[1.3, 50], [0.4, 20], [2.6, 3]]) {
      for (const n of ['trunk', 'buttress', 'slim'] as const) {
        each(trunk(n, r, h)!, (x, y, z) => {
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(r + 1e-4);
          expect(y).toBeGreaterThanOrEqual(-1e-4);
          expect(y).toBeLessThanOrEqual(h + 1e-4);
        });
      }
      for (let s = 0; s < 3; s++) {
        each(rock(r, h, s)!, (x, y, z) => {
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(r + 1e-4);
          expect(Math.abs(y)).toBeLessThanOrEqual(h / 2 + 1e-4);
        });
      }
    }
  });
  it('a trunk fills its collider (its foot reaches near the radius: no air rounds stop in)', () => {
    const t = trunk('trunk', 1, 40)!;
    let foot = 0;
    each(t, (x, y, z) => {
      if (y < 2) foot = Math.max(foot, Math.hypot(x, z));
    });
    expect(foot).toBeGreaterThan(0.9);
  });
  it('a plant takes the bounds of the primitive it replaces', () => {
    const like = new THREE.IcosahedronGeometry(1, 1);
    like.scale(1, 0.65, 1);
    like.computeBoundingBox();
    const p = plant('crown', like)!;
    p.computeBoundingBox();
    expect(p.boundingBox!.min.y).toBeCloseTo(like.boundingBox!.min.y, 4);
    expect(p.boundingBox!.max.y).toBeCloseTo(like.boundingBox!.max.y, 4);
    const span = (b: THREE.Box3) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    expect(span(p.boundingBox!)).toBeCloseTo(span(like.boundingBox!), 4);
  });
  it('trunk UVs run round it and up it (v 0..1 over the height, no seam smear)', () => {
    const t = trunk('slim', 0.4, 20)!;
    const uv = t.attributes.uv;
    for (let i = 0; i < uv.count; i += 3) {
      const us = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)];
      expect(Math.max(...us) - Math.min(...us)).toBeLessThan(0.5);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-4);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-4);
    }
  });
});
