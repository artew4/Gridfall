import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import { smoothstep } from '../../core/math';

/** The temple clearing: exactly flat (y = 0) inside this radius, blending into the hills by PAD_OUT. */
export const PAD_IN = 21;
export const PAD_OUT = 30;
/** Inner faces of the boundary rock walls (segments vary from CLIFF - 0.6 to CLIFF + CLIFF_RECESS). */
export const CLIFF = 66;
export const CLIFF_RECESS = 1.4;
/** Everything reachable lies inside this (wall foot at its deepest recess, plus the body radius). */
export const JUNGLE_EXTENT = CLIFF + CLIFF_RECESS + 0.5;

/** Outlying ruins (watch platforms) out in the forest: the ground is levelled round them. */
export const OUTLIERS = [
  { x: -40, z: -30, name: 'WEST WATCH', jp: '西の見張り台' },
  { x: 41, z: 31, name: 'EAST WATCH', jp: '東の見張り台' },
];
const OUT_IN = 10;
const OUT_OUT = 17;

/** Smooth, deterministic 2D value noise in 0..1. */
function hash(ix: number, iz: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1013;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Height of the forest floor: rolling hummocks and gullies out of two octaves of value noise, flat in
 * the temple clearing, rising into banks at the foot of the rock walls. Slopes stay walkable (a unit
 * test holds them under 22°) so the controller, the AI and the nav graph treat it as continuous ground.
 */
export function jungleHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < PAD_IN) return 0;
  let w = smoothstep(PAD_IN, PAD_OUT, r);
  for (const o of OUTLIERS) w *= smoothstep(OUT_IN, OUT_OUT, Math.hypot(x - o.x, z - o.z));
  const hills = (noise(x * 0.045 + 11, z * 0.045 - 4) - 0.35) * 3.0 + (noise(x * 0.11 - 7, z * 0.11 + 2) - 0.5) * 0.8;
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const bank = smoothstep(CLIFF - 16, CLIFF, edge) * 2;
  return Math.max(0, hills) * w + bank;
}

export const JUNGLE_TERRAIN: Terrain = {
  height: jungleHeight,
  maxHeight: 6.5,
  surface: 'sand',
};

/**
 * The visible ground: one mesh following the same function, with vertex colours (darker, wetter in
 * the hollows, mossier on the rises) over a tiled leaf-litter texture.
 */
export function buildTerrainMesh(map: THREE.Texture, size = 160, segs = 150) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = jungleHeight(x, z);
    pos.setY(i, h);
    uv.setXY(i, x / 5, z / 5);
    const moss = noise(x * 0.09 + 50, z * 0.09);
    const k = THREE.MathUtils.clamp(0.78 + h * 0.06, 0.7, 1.05);
    colors[i * 3] = k * (0.95 - moss * 0.2);
    colors[i * 3 + 1] = k * (0.95 + moss * 0.12);
    colors[i * 3 + 2] = k * (0.9 - moss * 0.15);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
