import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import { smoothstep } from '../../core/math';

/** Flat pad of the outpost (y = 0 exactly inside it, so buildings sit on level ground). */
const PAD_RX = 44;
const PAD_RZ = 40;
/** Inner faces of the boundary cliffs (segments vary from CLIFF - 0.66 to CLIFF + CLIFF_RECESS). */
export const CLIFF = 90;
export const CLIFF_RECESS = 1.6;
/** Everything reachable lies inside this (cliff foot at its deepest recess, plus the body radius). */
export const DESERT_EXTENT = CLIFF + CLIFF_RECESS + 0.5;

/** Outer faces of the HESCO barrier: the compound inside is exactly flat. */
export const BARRIER_X = 30.55;
export const BARRIER_Z = 27.55;

/** Smooth, deterministic 2D value noise in 0..1. */
function hash(ix: number, iz: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 0 on the outpost pad, rising to 1 out in the dune field; the edge of the pad wanders. */
function duneWeight(x: number, z: number) {
  const r = Math.hypot(x / PAD_RX, z / PAD_RZ) * (1 + (noise(x * 0.05 + 40, z * 0.05) - 0.5) * 0.16);
  return smoothstep(1, 1.45, r);
}

/** Wind-blown banks against the outside of the barrier: rising over 2.5 m from its foot, tailing off by 9 m. */
function drift(x: number, z: number) {
  const dx = Math.max(Math.abs(x) - BARRIER_X, 0);
  const dz = Math.max(Math.abs(z) - BARRIER_Z, 0);
  const d = Math.hypot(dx, dz);
  if (d <= 0 || d > 9) return 0;
  return 0.4 * smoothstep(0, 2.5, d) * (1 - smoothstep(2.5, 9, d)) * (0.8 + 0.4 * noise(x * 0.15, z * 0.15));
}

/**
 * Height of the desert floor. Dunes run across the prevailing (west) wind with skewed crests (gentle
 * windward face, steeper lee), their lines bent by a slow domain warp, roughened by value noise.
 * Slopes stay walkable (a unit test holds them under 22°) so the controller, the AI and the nav graph
 * treat them as continuous ground. The compound inside the barrier is exactly flat.
 */
export function desertHeight(x: number, z: number): number {
  if (Math.abs(x) < BARRIER_X && Math.abs(z) < BARRIER_Z) return 0;
  const w = duneWeight(x, z);
  let dunes = 0;
  if (w > 0) {
    const wx = x + (noise(x * 0.02 + 7, z * 0.02) - 0.5) * 22;
    const wz = z + (noise(x * 0.02, z * 0.02 + 13) - 0.5) * 22;
    const u = wx * 0.052 + Math.sin(wz * 0.031) * 1.5;
    const crest = Math.sin(u) + 0.3 * Math.sin(2 * u - 0.9);
    const a = crest * 1.15;
    const b = Math.sin((wx * 0.6 + wz * 0.8) * 0.08 + 1.7) * 0.45;
    const c = Math.sin(wz * 0.045 - wx * 0.012 + 0.6) * 0.55;
    const n = (noise(x * 0.07, z * 0.07) - 0.5) * 0.8 + (noise(x * 0.19 + 3, z * 0.19) - 0.5) * 0.2;
    dunes = Math.max(0, a + b + c + n + 1.75) * w;
  }
  // Banks against the cliffs (the cliff foot is never a sheer drop into sand).
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const bank = smoothstep(CLIFF - 18, CLIFF, edge) * 2.6;
  return dunes + bank + drift(x, z);
}

export const DESERT_TERRAIN: Terrain = {
  height: desertHeight,
  maxHeight: 7.6,
  surface: 'sand',
};

/** The visible ground: one mesh following the same function, darker in the troughs, with a detail map. */
export function buildTerrainMesh(map: THREE.Texture, detail: THREE.Texture, size = 230, segs = 176) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = desertHeight(x, z);
    pos.setY(i, h);
    // Texture in world metres (one tile = 6 m).
    uv.setXY(i, x / 6, z / 6);
    // Slight shading: troughs a little darker and redder, crests paler.
    const k = THREE.MathUtils.clamp(0.9 + h * 0.035, 0.84, 1.06);
    colors[i * 3] = k;
    colors[i * 3 + 1] = k * (0.97 + h * 0.004);
    colors[i * 3 + 2] = k * (0.93 + h * 0.008);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });
  // The detail map spans the whole terrain once (world-mapped): multiplied into the sand colour.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDetailUv;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvDetailUv = position.xz / ${size.toFixed(1)} + 0.5;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nvarying vec2 vDetailUv;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(tDetail, vDetailUv).rgb;');
  };
  mat.userData.detail = detail;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
