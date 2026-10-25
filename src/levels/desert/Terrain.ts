import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import { smoothstep } from '../../core/math';
import { BASE, HOUSES } from './ArenaLayout';

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

/**
 * 12.0, the culvert: a concrete drain under the yard from the west gate to the east gate, roofed over
 * the middle (|x| < `roof`) and open where its stairs go down at either end (from the rim at
 * |x| = `top` to the floor at |x| = `roof`). The terrain is carved to its floor (the heightfield is
 * the only ground under the yard, so the floor has to be the terrain's); the visible terrain has a
 * hole cut there (buildTerrainMesh) that the culvert's own roof and paving cover. Point-symmetric.
 */
export const CULVERT = { x: 27.6, z: 2.1, top: 27, roof: 21, floor: -3 };

/**
 * 56.0, the Cistern: the culvert grown into a level under the yard. A hall under the yard's middle
 * (|x| < `hall.x`, |z| < `hall.z`), the culvert running through it, and an arm from the hall to each
 * team's gate (south frame: x `arm.x0`…`arm.x1`, roofed from the hall to `arm.roof`, its stair up to
 * the yard at `arm.top`, open to `arm.end`; the north arm is its rotation). The hall's roof is open
 * over its middle (`hole`: the sinkhole, where the yard fell in), two slabs of it lying as ramps.
 * Point-symmetric like the culvert.
 */
export const CISTERN = {
  hall: { x: 9, z: 8 },
  arm: { x0: -5, x1: -1, roof: 15.5, top: 21.5, end: 22.1 },
  hole: { x: 4, z: 3.5 },
};

/** The culvert's floor under (x, z) (its stairs ramp up to the rim), or null outside it. */
export function culvertFloor(x: number, z: number): number | null {
  const C = CULVERT;
  const ax = Math.abs(x);
  if (ax >= C.x || Math.abs(z) >= C.z) return null;
  if (ax >= C.top) return 0;
  if (ax <= C.roof) return C.floor;
  return (C.floor * (C.top - ax)) / (C.top - C.roof);
}

/** 56.0: the floor of the Cistern's arm (south frame) under (x, z), or null outside it. */
function armFloor(x: number, z: number): number | null {
  const A = CISTERN.arm, F = CULVERT.floor;
  if (x <= A.x0 || x >= A.x1 || z <= CISTERN.hall.z - 0.5 || z >= A.end) return null;
  if (z >= A.top) return 0;
  if (z <= A.roof) return F;
  return (F * (A.top - z)) / (A.top - A.roof);
}

/** 56.0: the floor of anything cut under the yard at (x, z) (the culvert, the hall, the arms), or null. */
export function underFloor(x: number, z: number): number | null {
  const H = CISTERN.hall;
  if (Math.abs(x) < H.x && Math.abs(z) < H.z) return CULVERT.floor;
  return armFloor(x, z) ?? armFloor(-x, -z) ?? culvertFloor(x, z);
}

/**
 * 56.0: is (x, z) open to the sky down to the floor below (the culvert's and the arms' stairs, the
 * sinkhole)? Elsewhere over the cut the yard's paving is the surface.
 */
export function underOpen(x: number, z: number): boolean {
  const ax = Math.abs(x), C = CULVERT, A = CISTERN.arm, O = CISTERN.hole;
  if (ax < O.x && Math.abs(z) < O.z) return true;
  if (Math.abs(z) < C.z && ax > C.roof && ax < C.x) return true;
  for (const [px, pz] of [[x, z], [-x, -z]]) if (px > A.x0 && px < A.x1 && pz > A.roof && pz < A.end) return true;
  return false;
}

/**
 * 28.0, the trench on the outer west flank (south half; its rotation is on the east flank in the north
 * half): `x0..x1` wide, `z0..z1` long, `depth` m down from the dunes, ramped up to the sand over `ramp`
 * m at both ends, with a side notch out to the east (the notch's floor rises to the sand over its
 * length). Its sides are vertical (the terrain is cut, as the culvert is) and lined with revetments
 * (Arena.ts); its floor follows the dunes' own rise and fall. 38.0: it starts 8 m further north (was
 * z 4), where the ruins' south gate opens onto it.
 */
export const TRENCH = { x0: -76.8, x1: -73.2, z0: 12, z1: 50, depth: 1.3, ramp: 6, notch: { z0: 33, z1: 35, x1: -68.5 } };

/** How far the trench cuts the sand at (x, z) (0 outside it), in the south-half frame. */
function trenchCut(x: number, z: number) {
  const T = TRENCH;
  let d = 0;
  if (x > T.x0 && x < T.x1 && z > T.z0 && z < T.z1) d = T.depth * Math.min(1, (z - T.z0) / T.ramp, (T.z1 - z) / T.ramp);
  const N = T.notch;
  if (x >= T.x1 && x < N.x1 && z > N.z0 && z < N.z1) d = Math.max(d, (T.depth * (N.x1 - x)) / (N.x1 - T.x1));
  return d;
}

/** 28.0: the trench's cut at (x, z), point-symmetric (0 outside both trenches). */
export function trenchDepth(x: number, z: number) {
  return trenchCut(x, z) || trenchCut(-x, -z);
}

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
  if (Math.abs(x) < BARRIER_X && Math.abs(z) < BARRIER_Z) return underFloor(x, z) ?? 0;
  // 6.0: the arena is point-symmetric (Team Deathmatch: neither base gets better ground): the dunes
  // are the mean of the field and its 180° rotation. A mean of two fields is never steeper than the
  // steeper of them, so every slope bound below still holds.
  let h = 0.5 * (rawHeight(x, z) + rawHeight(-x, -z));
  // Each base stands on a flat pad that blends back into the dunes.
  const k = basePad(x, z);
  if (k > 0) h += (BASE.y - h) * k;
  // 46.0: the flank houses' pads (each house on level ground at its centre's own dune height), blended
  // in one after another (continuous where two pads' falls meet).
  h = housePads(x, z, h);
  // 28.0: the outer flanks' trenches.
  return h - trenchDepth(x, z);
}

/**
 * 46.0: the flank houses' footprints (both halves: the south-half placements and their rotations). A
 * flank's pads share one height, its Block's (they overlap where their falls meet: two heights there
 * left the sand 0.1 m over a house's floor at its edge).
 */
const HOUSE_RECTS = (() => {
  // 50.0: the huts first, each on its own centre's dunes and blended over `hutFall` m (short of the
  // flank's houses, whose pads are applied after them).
  const own = HOUSES.huts.map((h) => ({ cx: h.cx, cz: h.cz, hw: h.hw, hd: h.hd, own: !('flank' in h && h.flank), fall: HOUSES.hutFall }));
  own.push(...[HOUSES.block, ...HOUSES.houses].map((h) => ({ cx: h.cx, cz: h.cz, hw: h.hw, hd: h.hd, own: false, fall: HOUSES.fall })));
  return [...own, ...own.map((h) => ({ ...h, cx: -h.cx, cz: -h.cz }))].map((h) => ({ ...h, y: NaN }));
})();

/** The dunes alone (no pads, no trench) at (x, z): what a pad levels. */
function dunes(x: number, z: number) {
  let h = 0.5 * (rawHeight(x, z) + rawHeight(-x, -z));
  const k = basePad(x, z);
  if (k > 0) h += (BASE.y - h) * k;
  return h;
}

/** 46.0: `h` levelled by every pad whose fall reaches (x, z). */
function housePads(x: number, z: number, h: number) {
  for (const r of HOUSE_RECTS) {
    const k = padWeight(r, x, z);
    if (k <= 0) continue;
    h += (padY(r) - h) * k;
  }
  return h;
}

function padWeight(r: { cx: number; cz: number; hw: number; hd: number; fall: number }, x: number, z: number) {
  const dx = Math.max(Math.abs(x - r.cx) - r.hw - HOUSES.pad, 0), dz = Math.max(Math.abs(z - r.cz) - r.hd - HOUSES.pad, 0);
  const d = Math.hypot(dx, dz);
  return d >= r.fall ? 0 : 1 - smoothstep(0, r.fall, d);
}

/** 46.0: a flank house's floor (its pad's height) under (x, z) (its centre). */
export function housePadY(x: number, z: number) {
  const r = HOUSE_RECTS.find((p) => Math.abs(p.cx - x) < 0.5 && Math.abs(p.cz - z) < 0.5);
  if (!r) return desertHeight(x, z);
  return padY(r);
}

/** A pad's height: its flank's Block's centre's dunes (50.0: a hut's, its own centre's), computed once. */
function padY(r: { cx: number; cz: number; y: number; own: boolean }) {
  if (Number.isNaN(r.y)) r.y = r.own ? dunes(r.cx, r.cz) : dunes(Math.sign(r.cx) * Math.abs(HOUSES.block.cx), 0);
  return r.y;
}

/** 1 on a base's pad, falling to 0 over BASE.pad.fall metres outside it. */
function basePad(x: number, z: number) {
  const p = BASE.pad;
  const ax = Math.abs(x), az = Math.abs(z);
  const dx = Math.max(ax - p.x, 0);
  const dz = Math.max(p.z0 - az, az - p.z1, 0);
  const d = Math.hypot(dx, dz);
  return d >= p.fall ? 0 : 1 - smoothstep(0, p.fall, d);
}

function rawHeight(x: number, z: number): number {
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
  // 12.0: a hole where the culvert is cut (every triangle with a corner inside it). Its edge runs at
  // most one cell (1.3 m) outside the cut; the culvert's roof and paving reach 1.45 m out over it.
  const idx = geo.index!;
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    let cut = false;
    for (let k = 0; k < 3; k++) {
      const v = idx.getX(t + k);
      if (underFloor(pos.getX(v), pos.getZ(v)) !== null) cut = true;
    }
    if (!cut) keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  }
  geo.setIndex(keep);
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
