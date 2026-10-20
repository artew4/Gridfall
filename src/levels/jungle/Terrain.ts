import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import { smoothstep } from '../../core/math';

/**
 * Firebase Viper: the compound's perimeter wall (outer faces), north = -z. The gate is in the south
 * wall; the assault comes up the road from the south edge of the map.
 */
export const BASE = { x0: -28, z0: -38, x1: 28, z1: 10 };
/** Ground is exactly flat (y = 0) inside the compound and a cleared strip this wide round it... */
export const STRIP = 7;
/** ...and blends into the forest hills over this distance beyond the strip. */
const BLEND = 10;
/** Inner faces of the boundary rock walls (segments vary from CLIFF - 0.6 to CLIFF + CLIFF_RECESS). */
export const CLIFF = 66;
export const CLIFF_RECESS = 1.4;
/** Everything reachable lies inside this (wall foot at its deepest recess, plus the body radius). */
export const JUNGLE_EXTENT = CLIFF + CLIFF_RECESS + 0.5;
/** The approach road: from the south edge of the map up to the gate (x of its centre line at z). */
export const ROAD = { z0: 10, z1: 62, half: 2.6 };
export function roadX(z: number) {
  return Math.sin(z * 0.07) * 3 - Math.sin(10 * 0.07) * 3 * Math.max(0, 1 - (z - 10) / 12);
}

/** Distance outside the compound's walls (negative inside). */
export function baseDist(x: number, z: number) {
  const dx = Math.max(BASE.x0 - x, x - BASE.x1), dz = Math.max(BASE.z0 - z, z - BASE.z1);
  if (dx <= 0 && dz <= 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}

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
 * Height of the forest floor: rolling hummocks and gullies out of two octaves of value noise, flat
 * over the compound and its cleared strip and along the approach road, rising into banks at the
 * foot of the rock walls. Slopes stay walkable (a unit test holds them under 22°) so the controller,
 * the AI and the nav graph treat it as continuous ground.
 */
export function jungleHeight(x: number, z: number): number {
  const d = baseDist(x, z);
  if (d < STRIP) return 0;
  let w = smoothstep(STRIP, STRIP + BLEND, d);
  if (z > ROAD.z0 - 4) w *= smoothstep(ROAD.half + 0.4, ROAD.half + 11, Math.abs(x - roadX(z)));
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
