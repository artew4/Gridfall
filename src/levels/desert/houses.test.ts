import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../world/Collision';
import { StaticBuilder } from '../../world/Builder';
import { Nav } from '../../enemies/Nav';
import { BLOCK_SPEC, HOUSE_SPEC, buildHouse, rectMinus, type HouseSpec } from './Houses';
import { HOUSES, LANES_SOUTH } from './ArenaLayout';
import { desertHeight, housePadY } from './Terrain';
import { shuffle } from '../Tdm';
import { mulberry32 } from '../../core/math';

const mat = () => new THREE.MeshStandardMaterial();
function house(spec: HouseSpec, su: 1 | -1 = 1, sv: 1 | -1 = 1) {
  const col = new CollisionWorld();
  const scene = new THREE.Scene();
  const b = new StaticBuilder();
  const at = { cx: 0, cz: 0, y0: 1, su, sv };
  const r = buildHouse({ b, col, scene, mats: { wall: mat(), trim: mat(), floor: mat(), rail: mat(), crate: mat(), wood: mat(), dark: mat(), lamp: mat() } }, spec, at);
  return { col, scene, r, at };
}
const area = (rs: [number, number, number, number][]) => rs.reduce((a, [u0, v0, u1, v1]) => a + (u1 - u0) * (v1 - v0), 0);

describe('46.0: the flank houses', () => {
  it('a slab minus its holes: the area left, no overlaps, nothing in a hole', () => {
    const outer: [number, number, number, number] = [-10, -12, 10, 12];
    const holes: [number, number, number, number][] = [[-9.7, 4.8, -7.6, 10.3], [-9.7, -10.3, -7.6, -4.8], [-2.4, -2.4, 2.4, 2.4]];
    const rs = rectMinus(outer, holes);
    expect(area(rs)).toBeCloseTo(area([outer]) - area(holes), 6);
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const [a, b] = [rs[i], rs[j]];
        const ov = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
        expect(ov).toBe(0);
      }
    for (const [u0, v0, u1, v1] of rs) for (const [a, b, c, d] of holes) expect((u0 + u1) / 2 > a && (u0 + u1) / 2 < c && (v0 + v1) / 2 > b && (v0 + v1) / 2 < d).toBe(false);
  });

  it('the Block: three storeys and a roof, a stair at each end (six runs), the roof 10.2 m up', () => {
    const { col, r, at } = house(BLOCK_SPEC);
    const ramps = col.colliders.filter((c) => c.kind === 'ramp');
    expect(ramps.length).toBe(6);
    // Each run climbs one storey.
    for (const c of ramps) expect(Math.abs(c.h1! - c.h0!)).toBeCloseTo(BLOCK_SPEC.storey, 5);
    expect(r.interior.h).toBeCloseTo(at.y0 + 3 * BLOCK_SPEC.storey, 5);
    // Mirror-symmetric about v = 0 (z here): every solid has its twin across.
    const key = (c: { min: THREE.Vector3; max: THREE.Vector3 }, s: number) => [c.min.x, c.max.x, ...[s * c.min.z, s * c.max.z].sort((p, q) => p - q), c.min.y, c.max.y].map((n) => n.toFixed(2)).join(',');
    const all = new Set(col.colliders.map((c) => key(c, 1)));
    for (const c of col.colliders) expect(all.has(key(c, -1)), key(c, 1)).toBe(true);
  });

  it('every level of a house is on its graph and one graph: the stairs, the doors, the roof', () => {
    for (const spec of [BLOCK_SPEC, HOUSE_SPEC]) {
      const { col, r } = house(spec);
      // Doors' outside nodes stand on the ground (the test's flat world: the floor of level 0).
      const nodes = r.nodes.map((p) => (Number.isNaN(p.y) ? p.clone().setY(1) : p)).filter((p) => !col.blocked(p, 0.45));
      expect(nodes.length).toBeGreaterThan(spec.nodes.flat().length);
      const idx = new Map(r.nodes.map((p, i) => [p, i]));
      const keep = r.nodes.map((p) => (Number.isNaN(p.y) || !col.blocked(p, 0.45) ? idx.get(p)! : -1));
      const remap = new Map<number, number>();
      const kept = r.nodes.filter((_, i) => keep[i] >= 0).map((p) => (Number.isNaN(p.y) ? p.clone().setY(1) : p));
      r.nodes.forEach((_, i) => keep[i] >= 0 && remap.set(i, remap.size));
      const links = r.links.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
      // (A floor under the doors: the ground the test world lacks.)
      col.add(-40, 0.5, -40, 40, 1, 40, 'sand');
      const nav = new Nav(col, { nodes: kept, links });
      const reach = nav.reachable(0);
      expect(reach.size, spec.name).toBe(kept.length);
      // And the roof is among them.
      expect(kept.some((p) => p.y > r.interior.h - 0.01)).toBe(spec.roofAccess);
    }
  });

  it('railings stop bodies but not rounds or sight (a fight across the atrium)', () => {
    const { col } = house(BLOCK_SPEC);
    const rails = col.colliders.filter((c) => c.surface === 'metal' && c.kind === 'box' && c.max.y - c.min.y < 1.1 && !c.ray);
    expect(rails.length).toBeGreaterThan(8);
    for (const c of rails) expect(c.solid).toBe(true);
    // Across the atrium on floor 1: in sight.
    const y = 1 + BLOCK_SPEC.storey + 1.5;
    expect(col.lineOfSight(new THREE.Vector3(-3, y, 0), new THREE.Vector3(3, y, 0))).toBe(true);
    // Floor 1 to the ground floor through the atrium.
    expect(col.lineOfSight(new THREE.Vector3(0, 1 + BLOCK_SPEC.storey + 1.5, 0), new THREE.Vector3(0, 2.5, 1))).toBe(true);
  });

  it('every house stands on a flat pad at its own dune height, both halves', () => {
    const all = [HOUSES.block, ...HOUSES.houses];
    for (const h of all)
      for (const s of [1, -1]) {
        const cx = s * h.cx, cz = s * h.cz;
        const y = housePadY(cx, cz);
        for (const [du, dv] of [[0, 0], [h.hw, h.hd], [-h.hw, h.hd], [h.hw, -h.hd], [-h.hw, -h.hd], [h.hw + 1, 0]]) expect(desertHeight(cx + du, cz + dv)).toBeCloseTo(y, 6);
      }
  });

  it('the main flank lanes go through the Block, door to door (both flanks, the same way)', () => {
    const west = LANES_SOUTH[0], east = LANES_SOUTH[2];
    const B = HOUSES.block;
    const inside = (l: number[][], cx: number) => l.filter(([x, z]) => Math.abs(x - cx) < B.hw && Math.abs(z) < B.hd).length;
    expect(inside(west, B.cx)).toBeGreaterThanOrEqual(5);
    expect(inside(east, -B.cx)).toBe(inside(west, B.cx));
    for (const [x, z] of west) expect(east.some(([x2, z2]) => Math.abs(x2 + x) < 1e-9 && Math.abs(z2 - z) < 1e-9)).toBe(true);
  });

  it('the opening is shuffled: he is not always first (the same flank every match)', () => {
    const rand = mulberry32(7);
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) firsts.add(shuffle(['player', 'a', 'b', 'c', 'd', 'e'], rand).indexOf('player') < 2 ? 'zoneA' : 'other');
    expect(firsts.size).toBe(2);
    const a = [1, 2, 3, 4, 5];
    expect(shuffle(a.slice(), rand).sort()).toEqual(a);
  });
});
