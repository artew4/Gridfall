import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 76.0: Favelas and wreckage (tools/blender/props_ruin.py): seen only, nothing past the colliders. */

const g = readGlb('props/ruin');
const kits = Object.fromEntries(
  Object.entries(g.nodes).map(([name, parts]) => [
    name,
    parts.map((p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.tris.flat(2), 3));
      geo.computeVertexNormals();
      return { geo, role: p.role };
    }),
  ]),
);
vi.mock('../entities/weapons/models', () => ({ propKits: () => kits }));
const { fitted } = await import('./Nature');

const verts = (name: string) => g.nodes[name].flatMap((p) => p.tris.flat());
const bounds = (name: string) => {
  const b = new THREE.Box3();
  for (const v of verts(name)) b.expandByPoint(new THREE.Vector3(v[0], v[1], v[2]));
  return b;
};

describe('76.0: the ruin kit', () => {
  it('its pieces, in roles the maps paint, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['fdish', 'fdoor', 'fgrille', 'fstall', 'ftank', 'fusca', 'heli_blade', 'heli_tail', 'kombi', 'panel', 'rebar', 'zinc']);
    const roles = ['plastic', 'paint', 'metal', 'rust', 'glass', 'chrome', 'rubber', 'dark', 'light', 'white', 'wood', 'canvas', 'fruit'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(20000);
  });
  it("a stall: its fruit at the counter's top, nothing from it to head height (1.9 m) but the map's two posts", () => {
    const b = bounds('fstall');
    const X = b.max.x - b.min.x, Z = b.max.z - b.min.z, H = b.max.y - b.min.y;
    const stray: number[][] = [];
    for (const v of verts('fstall')) {
      const y = ((v[1] - b.min.y) / H) * 2.3;
      if (y < 1.02 || y > 1.9) continue;
      // A post: in the corner (x0, z0) or (x1, z1), as the map's colliders.
      const u = (v[0] - b.min.x) / X, w = (v[2] - b.min.z) / Z;
      if (!((u < 0.08 && w < 0.08) || (u > 0.92 && w > 0.92))) stray.push(v);
    }
    expect(stray.slice(0, 3)).toEqual([]);
  });
  it('a Beetle: its cabin over the middle of its length (the collider over the body is a box that wide)', () => {
    const b = bounds('fusca');
    const L = b.max.z - b.min.z, H = b.max.y - b.min.y, cz = (b.min.z + b.max.z) / 2;
    for (const v of verts('fusca')) if (v[1] - b.min.y > 0.62 * H) expect(Math.abs(v[2] - cz)).toBeLessThan(0.3 * L);
  });
  it('wreckage on the ground lies under 0.2 m (walked over: no cover the colliders lack)', () => {
    for (const n of ['panel', 'heli_blade']) {
      const b = bounds(n);
      expect(b.max.y - Math.max(b.min.y, 0)).toBeLessThan(0.2);
    }
  });
  it("a grille's bars run its whole depth (they stand out of the window's glass)", () => {
    const b = bounds('fgrille');
    const depth = b.max.x - b.min.x;
    const mid = verts('fgrille').filter((v) => Math.abs(v[2]) < 0.05 && Math.abs(v[1] - (b.min.y + b.max.y) / 2) < 0.3);
    expect(Math.max(...mid.map((v) => Math.abs(v[0])))).toBeGreaterThan(depth * 0.45);
  });
});

describe('76.0: fitted to the instances they replace', () => {
  it('a model fills the unit box exactly (doors, tanks, tin roofs keep their bounds)', () => {
    for (const [n, r] of [['fdoor', 0.5], ['ftank', 1], ['zinc', 0.5]] as const) {
      const geo = fitted(n, [-r, -0.5, -r], [r, 0.5, r])!;
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      for (const [a, e] of [[b.min.x, -r], [b.max.x, r], [b.min.y, -0.5], [b.max.y, 0.5], [b.min.z, -r], [b.max.z, r]]) expect(a).toBeCloseTo(e, 4);
      const n0 = geo.attributes.normal;
      for (let i = 0; i < n0.count; i += 7) expect(Math.hypot(n0.getX(i), n0.getY(i), n0.getZ(i))).toBeCloseTo(1, 3);
    }
  });
  it('as authored without a box (a dish, the rebar)', () => {
    const geo = fitted('rebar')!;
    geo.computeBoundingBox();
    expect(geo.boundingBox!.max.y).toBeCloseTo(bounds('rebar').max.y, 4);
  });
});
