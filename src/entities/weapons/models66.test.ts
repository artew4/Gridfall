import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { KITSUNE_9 } from './kitsune9';
import { HORNET_SMG } from './hornet';
import { JACKAL_AR } from './jackal';
import { BOAR_SHOTGUN } from './shotgun';
import type { WeaponSpec } from '../types';

/*
  66.0: the Blender guns (tools/blender/guns.py) as the game reads them: the GLB's nodes, roles,
  size, and the sight line through each.
*/

type Tri = [number[], number[], number[]];
interface Glb {
  nodes: Record<string, { role: string; tris: Tri[] }[]>;
  tris: number;
}

function readGlb(file: string): Glb {
  const buf: Uint8Array = readFileSync(new URL(`../../../public/models/guns/${file}.glb`, import.meta.url));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  const binAt = 20 + jsonLen + 8;
  const view = (acc: number) => {
    const a = j.accessors[acc], bv = j.bufferViews[a.bufferView];
    const off = binAt + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (a.componentType === 5126) return new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * 12));
    if (a.componentType === 5123) return new Uint16Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * 2));
    return new Uint32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * 4));
  };
  const out: Glb = { nodes: {}, tris: 0 };
  for (const n of j.nodes) {
    if (n.mesh === undefined) continue;
    expect(n.translation ?? [0, 0, 0]).toEqual([0, 0, 0]);
    expect(n.rotation ?? [0, 0, 0, 1]).toEqual([0, 0, 0, 1]);
    out.nodes[n.name] = j.meshes[n.mesh].primitives.map((p: { attributes: { POSITION: number }; indices: number; material: number }) => {
      const pos = view(p.attributes.POSITION) as Float32Array, idx = view(p.indices);
      const tris: Tri[] = [];
      const v = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      for (let i = 0; i < idx.length; i += 3) tris.push([v(idx[i]), v(idx[i + 1]), v(idx[i + 2])]);
      out.tris += tris.length;
      return { role: j.materials[p.material].name, tris };
    });
  }
  return out;
}

/** Möller–Trumbore: the distance along `d` from `o` to the triangle, or null. */
function hit(o: number[], d: number[], [a, b, c]: Tri): number | null {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const t = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) / det;
  if (u < 0 || u > 1) return null;
  const q = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
  const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
  if (w < 0 || u + w > 1) return null;
  const s = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
  return s > 0 ? s : null;
}

const GUNS: [string, WeaponSpec][] = [
  ['kitsune9', KITSUNE_9],
  ['hornet', HORNET_SMG],
  ['jackal', JACKAL_AR],
  ['shotgun', BOAR_SHOTGUN],
];
const ROLES = ['frame', 'steel', 'polymer', 'furniture', 'trim', 'glow'];

describe('66.0: the guns made in Blender', () => {
  for (const [id, spec] of GUNS) {
    it(`${id}: body, slide and magazine nodes in gun space, every part a role, in budget`, () => {
      const g = readGlb(id);
      expect(Object.keys(g.nodes)).toContain('body');
      expect(Object.keys(g.nodes)).toContain('slide');
      for (const parts of Object.values(g.nodes)) for (const p of parts) expect(ROLES).toContain(p.role);
      expect(g.tris).toBeLessThan(40000);
      // The muzzle flash sits just past the barrel's end; the model reaches it, not past.
      let minZ = Infinity;
      for (const parts of Object.values(g.nodes)) for (const p of parts) for (const t of p.tris) for (const v of t) minZ = Math.min(minZ, v[2]);
      expect(minZ).toBeLessThan(spec.flash.at[2] + 0.04);
      expect(minZ).toBeGreaterThan(spec.flash.at[2] - 0.03);
      const lod = readGlb(`${id}_lod`);
      expect(lod.tris).toBeLessThan(3200);
    });

    it(`${id}: the sight line is clear from the eye to past the muzzle`, () => {
      const g = readGlb(id);
      const [, sy, sz] = spec.ads.sight;
      // From 10 cm behind the sight point straight down the barrel (the glow is the pistol's dot).
      const o = [0, sy, sz + 0.1], d = [0, 0, -1];
      const blocked: string[] = [];
      for (const [node, parts] of Object.entries(g.nodes))
        for (const p of parts) {
          if (p.role === 'glow') continue;
          for (const t of p.tris) {
            const s = hit(o, d, t);
            if (s !== null) blocked.push(`${node}/${p.role} at z ${(o[2] - s).toFixed(3)}`);
          }
        }
      expect(blocked).toEqual([]);
      // (And the test sees a gun: the same line through the receiver is blocked.)
      expect(g.nodes.body.some((p) => p.tris.some((t) => hit([0, 0.0, sz + 0.1], d, t) !== null))).toBe(true);
    });
  }
});
