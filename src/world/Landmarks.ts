import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { propKits, type MercPart } from '../entities/weapons/models';
import { applyWear } from './Wear';
import { applyWet } from './Ground';
import { planarInto } from './StoreSigns';
import type { Mats } from './City';
import type { Glows } from './Glows';
import type { SpillPool } from './Spill';

/*
  83.0, Night Tokyo's landmarks (docs/TOKYO_PLAN.md, step 5), from tools/blender/props_landmark.py:

    the overpass   riveted plate girders along the deck's two faces (3 m modules, under its top), the
                   piers (chamfered, capped, on bearings), the catenary masts with their cantilevers
                   (City.overpass)
    the train      each car's curved roof with its air conditioners, single-arm pantographs on every
                   other car, bellows between the cars, a cab at each end (Train.ts: merged into one
                   mesh per material, riding with the train's group)
    the metro      entrance A's canopy: steel arches on its six posts, the curved glass, its lit sign box
                   (Metro.ts)

  The colliders are the map's (the deck, the piers' boxes); what the kit adds stands where the boxes
  stood or overhead. Without the kit the boxes as before.

  84.0 (step 6, light): sodium lamps on brackets under the girders' faces (overpassLamps): their pools
  on the street (Spill.ts), their glow, and their light on the steel over them (the girders read at
  night: evaluated in the steel's shader only, not as THREE lights).
*/

export function landmarkKit(): Record<string, readonly MercPart[]> | null {
  const k = propKits();
  return k && k.girder ? (k as Record<string, readonly MercPart[]>) : null;
}

/** The overpass's materials: painted steel (grey-green, worn), the city's concrete, porcelain insulators. */
export function overpassMats(m: Mats): Record<string, THREE.Material> {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.8, ...o });
  // (A light grey-green: the girders read against the night, their rivets and stiffeners in the street's light.)
  const steel = applyWear(std({ color: 0x8a988f, metalness: 0.45, roughness: 0.5, envMapIntensity: 1.1 }), 'paint');
  return {
    steel,
    rivet: steel,
    concrete: m.concrete,
    bearing: std({ color: 0x2a2c30, metalness: 0.8, roughness: 0.4 }),
    insul: std({ color: 0x8a4a2a, roughness: 0.25, envMapIntensity: 1.2 }),
    gutter: applyWear(std({ color: 0x5a5e62, metalness: 0.6, roughness: 0.45 }), 'metal'),
  };
}

/**
 * The train's detail for `cars` cars `pitch` apart (each `len` long, its body's middle at y): one merged
 * geometry per material, in the train group's space; null without the kit.
 */
export function trainDetail(cars: number, pitch: number, len: number, y: number, mats: { body: THREE.Material; dark: THREE.Material }) {
  const kit = landmarkKit();
  if (!kit) return null;
  const lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const own = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0c0f14, metalness: 0.4, roughness: 0.08, envMapIntensity: 1.6 }),
    insul: new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.25 }),
    sign: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.3) }),
  };
  const matOf = (role: string): THREE.Material | null => (role === 'body' ? mats.body : role === 'dark' ? mats.dark : (own as Record<string, THREE.Material>)[role] ?? null);
  const add = (node: string, x: number, ry = 0) => {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    for (const p of kit[node]) {
      const mat = matOf(p.role);
      if (!mat) continue;
      const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(M);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      (lists.get(mat) ?? lists.set(mat, []).get(mat)!).push(g);
    }
  };
  for (let i = 0; i < cars; i++) {
    const x = i * pitch;
    add('roof', x);
    if (i % 2 === 0) add('panto', x);
    if (i < cars - 1) add('gangway', x + pitch / 2);
  }
  add('cab', -len / 2 - 0.02);
  add('cab', (cars - 1) * pitch + len / 2 + 0.02, Math.PI);
  const meshes: THREE.Mesh[] = [];
  for (const [mat, list] of lists) {
    const g = mergeGeometries(list)!;
    list.forEach((x) => x.dispose());
    meshes.push(new THREE.Mesh(g, mat));
  }
  return meshes;
}

/**
 * Entrance A's canopy at (x, z) (its length along Z, its open end at -Z): the models' parts into the
 * builder, the sign's face in `signMat` (its texture mapped over it); false without the kit.
 */
export function metroCanopy(b: { addMatrix(g: THREE.BufferGeometry, m: THREE.Material, M: THREE.Matrix4): void }, x: number, z: number, signMat: THREE.Material, time: { value: number }) {
  const kit = landmarkKit();
  if (!kit) return false;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, envMapIntensity: 1.0, ...o });
  const steel = std({ color: 0x3a4046, metalness: 0.7, roughness: 0.4 });
  applyWear(steel, 'metal');
  const glass = std({ color: 0x9fb4c0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.32, envMapIntensity: 1.5, depthWrite: false });
  const gutter = applyWear(std({ color: 0x5a5e62, metalness: 0.6, roughness: 0.45 }), 'metal');
  applyWet(steel, time, { puddles: false, wet: 0.6 });
  const mats: Record<string, THREE.Material> = { steel, glass, gutter };
  const M = new THREE.Matrix4().makeTranslation(x, 0, z);
  for (const p of kit.mcanopy) {
    if (p.role === 'sign') {
      // The face looks out at -Z: its texture read from there (u across it the right way round).
      const g = planarInto(p.geo, [1, 0, 0, 1]);
      b.addMatrix(g, signMat, M);
      g.dispose();
    } else if (mats[p.role]) b.addMatrix(p.geo, mats[p.role], M);
  }
  return true;
}

/** The overpass's lamps: sodium, on brackets 0.45 m out from the girders' faces, 5.9 m up. */
export const SODIUM = new THREE.Color(1.0, 0.52, 0.16);
const MAX_LAMPS = 8;

/**
 * Lamps under the overpass at `at` ([x, z of the girder face, the side out: ±1]): the brackets and heads
 * into the builder, a glow each, their light on `steel`; their pools on the ground for the bake.
 */
export function overpassLamps(
  b: { add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): void },
  glows: Glows,
  steel: THREE.Material | null,
  dark: THREE.Material,
  at: [number, number, number][],
): SpillPool[] {
  const lens = new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(3.2) });
  const arm = new THREE.BoxGeometry(0.06, 0.06, 0.5), head = new THREE.BoxGeometry(0.5, 0.14, 0.26), face = new THREE.BoxGeometry(0.42, 0.02, 0.2);
  const pos: THREE.Vector3[] = [];
  const pools: SpillPool[] = [];
  for (const [x, z, side] of at.slice(0, MAX_LAMPS)) {
    const zz = z + side * 0.45;
    b.add(arm, dark, x, 6.08, z + side * 0.25);
    b.add(head, dark, x, 5.98, zz);
    b.add(face, lens, x, 5.9, zz);
    const p = new THREE.Vector3(x, 5.8, zz);
    pos.push(p);
    glows.add({ pos: p.clone(), color: SODIUM.clone(), radius: 7, base: 1.0, haloSize: 3.2, haloStrength: 0.2, mode: 'buzz' });
    pools.push({ kind: 'pool', x, z: zz + side * 0.6, h: 5.9, radius: 7.5, colour: SODIUM, power: 0.35 });
  }
  if (steel instanceof THREE.MeshStandardMaterial) lampLit(steel, pos, SODIUM.clone().multiplyScalar(9));
  return pools;
}

/** Patches `mat` to take diffuse light from `lamps` (each `colour`, decay 2, 9 m cutoff). */
function lampLit(mat: THREE.MeshStandardMaterial, lamps: THREE.Vector3[], colour: THREE.Color) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const P = Array.from({ length: MAX_LAMPS }, (_, i) => lamps[i]?.clone() ?? new THREE.Vector3(0, -1e4, 0));
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uLampP = { value: P };
    sh.uniforms.uLampC = { value: colour };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uLampP[${MAX_LAMPS}];\nuniform vec3 uLampC;`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          vec3 lv = (viewMatrix * vec4(uLampP[i], 1.0)).xyz - geometryPosition;
          float d = length(lv);
          if (d > 9.0) continue;
          float k = saturate(dot(geometryNormal, lv / d)) * getDistanceAttenuation(d, 9.0, 2.0);
          reflectedLight.directDiffuse += k * uLampC * BRDF_Lambert(diffuseColor.rgb);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|lamps`;
}
