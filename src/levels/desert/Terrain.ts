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

/** 0 on the outpost pad, rising to 1 out in the dune field. */
function duneWeight(x: number, z: number) {
  const r = Math.hypot(x / PAD_RX, z / PAD_RZ);
  return smoothstep(1, 1.45, r);
}

/**
 * Height of the desert floor. Dunes are long, low and walkable (slopes under ~14°) so the controller,
 * the AI and the nav graph treat them as continuous ground; sand banks up against the cliffs.
 */
export function desertHeight(x: number, z: number): number {
  const w = duneWeight(x, z);
  if (w <= 0) return 0;
  // Long dunes across the prevailing wind (from the west), with a cross ripple and a slow swell.
  const a = Math.sin(x * 0.055 + Math.sin(z * 0.031) * 1.6) * 1.35;
  const b = Math.sin((x * 0.6 + z * 0.8) * 0.083 + 1.7) * 0.55;
  const c = Math.sin(z * 0.047 - x * 0.012 + 0.6) * 0.65;
  const dunes = (a + b + c + 1.5) * w;
  // Banks against the cliffs (the cliff foot is never a sheer drop into sand).
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const bank = smoothstep(CLIFF - 14, CLIFF, edge) * 3.2;
  return dunes + bank;
}

export const DESERT_TERRAIN: Terrain = {
  height: desertHeight,
  maxHeight: 7.6,
  surface: 'sand',
};

/** The visible ground: one mesh following the same function, darker in the troughs. */
export function buildTerrainMesh(map: THREE.Texture, size = 230, segs = 176) {
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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
