import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';
import { RAIL } from './City';

/* 83.0: Tokyo's landmarks (props_landmark.py, Landmarks.ts): inside the map's colliders, at their heights. */

const g = readGlb('props/landmark');
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
vi.mock('./StoreSigns', () => ({ planarInto: (geo: THREE.BufferGeometry) => geo.clone() }));
const { trainDetail } = await import('./Landmarks');

const verts = (name: string, role?: string) => g.nodes[name].filter((p) => !role || p.role === role).flatMap((p) => p.tris.flat());
const range = (vs: number[][], i: number) => [Math.min(...vs.map((v) => v[i])), Math.max(...vs.map((v) => v[i]))];

describe('83.0: the landmark kit', () => {
  it('its pieces, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['cab', 'cmast', 'gangway', 'girder', 'mcanopy', 'panto', 'pier', 'roof']);
    expect(g.tris).toBeLessThan(6000);
  });
  it("a girder (laid at 6.2 m) stays under the deck's top (the catwalk on it), 0.3 m out", () => {
    expect(6.2 + range(verts('girder'), 1)[1]).toBeLessThan(RAIL.deckTop);
    expect(range(verts('girder'), 2)[1]).toBeLessThanOrEqual(0.31);
  });
  it("a pier keeps within its collider (1.2 x 1.8) below its cap's 5.5 m (its pipe 2 cm out)", () => {
    for (const v of verts('pier')) if (v[1] < 5.5) {
      expect(Math.abs(v[0])).toBeLessThanOrEqual(0.62 + 1e-4);
      expect(Math.abs(v[2])).toBeLessThanOrEqual(0.9 + 1e-4);
    }
    expect(range(verts('pier'), 1)[1]).toBeLessThan(6.45);
  });
  it('the pantograph meets the contact wire (11.2 m), the masts hold it there', () => {
    expect(9.15 + range(verts('panto'), 1)[1]).toBeCloseTo(11.2, 1);
    expect(range(verts('cmast'), 1)[1]).toBeLessThan(3.6);
  });
  it("the canopy: its posts where the old ones stood, its roof over head height", () => {
    const glass = verts('mcanopy', 'glass');
    expect(range(glass, 1)[0]).toBeGreaterThan(2.9);
    const posts = verts('mcanopy', 'steel').filter((v) => v[1] < 2.0);
    for (const v of posts) {
      expect(Math.abs(Math.abs(v[0]) - 1.6)).toBeLessThan(0.06);
      expect([-4.9, 0, 4.9].some((z) => Math.abs(v[2] - z) < 0.06)).toBe(true);
    }
  });
});

describe('83.0: the train', () => {
  it("its detail: one mesh per material, the cabs at the train's two ends", () => {
    const body = new THREE.MeshStandardMaterial(), dark = new THREE.MeshStandardMaterial();
    const meshes = trainDetail(8, 19.6, 19, 9.15, { body, dark })!;
    expect(meshes.length).toBeGreaterThan(2);
    expect(new Set(meshes.map((m) => m.material)).size).toBe(meshes.length);
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    expect(box.min.x).toBeLessThan(-9.5);
    expect(box.max.x).toBeGreaterThan(7 * 19.6 + 9.5);
  });
});
