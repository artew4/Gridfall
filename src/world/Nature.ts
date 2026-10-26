import * as THREE from 'three';
import { propKits } from '../entities/weapons/models';

/*
  75.0, nature (docs/ENVIRONMENT_PLAN.md, step 8): the jungle's plants and trees and the Desert's rocks
  drawn from tools/blender/props_nature.py instead of primitives. Each helper returns null while the kit
  isn't loaded (the map keeps its own geometry), so a missing GLB costs nothing but looks.

    plant(node, like)   a plant's geometry fitted to the bounds of the one it replaces (`like`): the
                        instanced undergrowth keeps its counts, scales, colours and sway
    trunk(node, r, h)   a trunk (or root flare) inside the cylinder of radius r and height h from y = 0:
                        the collider the map adds; UVs round it (u) and up it (v), as a cylinder's
    rock(r, h, seed)    a boulder inside the radius r cylinder, h tall, centred on y = 0 (as the Desert's
                        boulder() was); box-projected UVs every ROCK_UV metres

  Every model is pulled inside its unit cylinder at load (its widest ring scaled to radius 1): what is
  drawn never stands out of the collider it dresses.
*/

export type PlantNode = 'bush' | 'fern' | 'bigleaf' | 'crown';
export type TrunkNode = 'trunk' | 'buttress' | 'slim';
const ROCKS = ['rock_a', 'rock_b', 'rock_c'] as const;
const ROCK_UV = 3;

const cache = new Map<string, THREE.BufferGeometry>();
let cacheGen: object | null = null;

/** A node's parts merged into one non-indexed geometry (position, normal, uv), or null: no kit. */
function node(name: string): THREE.BufferGeometry | null {
  const kits = propKits();
  if (!kits) return null;
  if (cacheGen !== kits.bush) {
    cache.forEach((g) => g.dispose());
    cache.clear();
    cacheGen = kits.bush ?? null;
  }
  const hit = cache.get(name);
  if (hit) return hit;
  const parts = kits[name];
  if (!parts?.length) return null;
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    pos.push(...(g.attributes.position.array as Float32Array));
    if (g !== p.geo) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cache.set(name, out);
  return out;
}

/** The widest radius of a geometry off its Y axis. */
function radial(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  return r;
}

/** A plant fitted to the bounds of `like` (its XZ extent uniformly, its height apart), or null. */
export function plant(name: PlantNode, like: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const src = node(name);
  if (!src) return null;
  const g = src.clone();
  g.computeBoundingBox();
  like.computeBoundingBox();
  const a = g.boundingBox!, b = like.boundingBox!;
  const k = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / Math.max(a.max.x - a.min.x, a.max.z - a.min.z);
  const ky = (b.max.y - b.min.y) / (a.max.y - a.min.y);
  g.translate(-(a.min.x + a.max.x) / 2, -a.min.y, -(a.min.z + a.max.z) / 2);
  g.scale(k, ky, k);
  g.translate((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  g.computeVertexNormals();
  return g;
}

/** A trunk or root flare inside the cylinder (r, h) standing on y = 0, UVs round and up it; or null. */
export function trunk(name: TrunkNode, r: number, h: number): THREE.BufferGeometry | null {
  const g = fit(name, r, h);
  if (g) smooth(g);
  return g;
}

function fit(name: string, r: number, h: number): THREE.BufferGeometry | null {
  const src = node(name);
  if (!src) return null;
  const g = src.clone();
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y, y1 = g.boundingBox!.max.y;
  const k = r / radial(g);
  g.translate(0, -y0, 0);
  g.scale(k, h / (y1 - y0), k);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    const us = [0, 1, 2].map((i) => Math.atan2(p.getZ(t + i), p.getX(t + i)) / (Math.PI * 2) + 0.5);
    // A triangle across the seam: its low side continues past 1 (the texture repeats).
    const wrap = Math.max(...us) - Math.min(...us) > 0.5;
    const u = us.map((v) => (wrap && v < 0.5 ? v + 1 : v));
    // A cap's centre (on the axis, no angle) takes its edge's middle.
    const axis = [0, 1, 2].findIndex((i) => Math.hypot(p.getX(t + i), p.getZ(t + i)) < r * 0.05);
    if (axis >= 0) u[axis] = (u[(axis + 1) % 3] + u[(axis + 2) % 3]) / 2;
    for (let i = 0; i < 3; i++) {
      uv[(t + i) * 2] = u[i];
      uv[(t + i) * 2 + 1] = p.getY(t + i) / h;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Smooth normals over a non-indexed, flat-normalled geometry: each corner the sum of the faces at its
 *  point within 60 degrees of its own (a root plate's edges stay sharp). */
function smooth(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal as THREE.BufferAttribute;
  const at = new Map<string, THREE.Vector3[]>();
  const key = (i: number) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  const face: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    face.push(new THREE.Vector3().fromBufferAttribute(n, i));
    const k = key(i);
    (at.get(k) ?? at.set(k, []).get(k)!).push(face[i]);
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(0, 0, 0);
    for (const f of at.get(key(i))!) if (f.dot(face[i]) > 0.5) v.add(f);
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** A boulder inside the cylinder (r, h) centred on y = 0, one of three by `seed`; or null. */
export function rock(r: number, h: number, seed: number): THREE.BufferGeometry | null {
  const g = fit(ROCKS[Math.abs(Math.floor(seed)) % ROCKS.length], r, h);
  if (!g) return null;
  g.translate(0, -h / 2, 0);
  // Box-projected UVs (each face by its dominant axis), the rock texture every ROCK_UV metres.
  const p = g.attributes.position, uv = g.attributes.uv as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t);
    b.fromBufferAttribute(p, t + 1);
    c.fromBufferAttribute(p, t + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let i = 0; i < 3; i++) {
      const v = [a, b, c][i];
      const [u, w] = ay >= ax && ay >= az ? [v.x, v.z] : ax >= az ? [v.z, v.y] : [v.x, v.y];
      uv.setXY(t + i, u / ROCK_UV, w / ROCK_UV);
    }
  }
  return g;
}
