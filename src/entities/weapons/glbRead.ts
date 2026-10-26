// 67.0: shared by the model tests: a GLB read without three (its nodes, their primitives' roles and
// triangles), and a ray against a triangle.
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

export type Tri = [number[], number[], number[]];
export interface Glb {
  nodes: Record<string, { role: string; tris: Tri[] }[]>;
  tris: number;
}

export function readGlb(file: string): Glb {
  const buf: Uint8Array = readFileSync(new URL(`../../../public/models/${file}.glb`, import.meta.url));
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
export function hit(o: number[], d: number[], [a, b, c]: Tri): number | null {
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

