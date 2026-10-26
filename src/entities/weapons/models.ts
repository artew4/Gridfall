import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponBuild } from '../types';
import type { GunMats } from './theme';
import type { WeaponId } from './armory';

/*
  66.0, the guns' models: made in Blender (tools/blender/guns.py, from code), loaded once as GLBs
  (public/models/guns/<id>.glb) and dressed in the map's finish.

  A GLB has three nodes in gun space (the old box models' numbers: +Y up, -Z down the barrel):
  `body`, `slide` (what cycles) and `mag` (what drops on a reload). Each node's primitives carry a
  material named by its role (frame, steel, polymer, furniture, trim, glow): the build gives each
  part the theme's material for that role (theme.ts), the glow parts are the viewmodel's strips.

  Until the files are in (or if one fails) a gun builds its 21.0 boxes: `dressGun` returns false.
  The geometry is cloned for each build (the viewmodel and the menu stage free what they built).

  The bots carry `<id>_lod.glb` (the same model collapsed to about 2,500 triangles): merged once into
  one geometry in their gun space (rigGuns.ts: +Z down the barrel, the origin at the trigger hand's
  palm), each role a shade of the theme's gun colour in a vertex colour (one draw a bot), the glow
  parts a second geometry for the theme's accent; shared by every bot, never freed.
*/

type Role = 'frame' | 'steel' | 'polymer' | 'furniture' | 'trim' | 'glow';
type Group = 'body' | 'slide' | 'mag';
type Part = { geo: THREE.BufferGeometry; role: Role };

const ROLES: readonly Role[] = ['frame', 'steel', 'polymer', 'furniture', 'trim', 'glow'];
export const GUN_MODEL_IDS = ['kitsune9', 'hornet', 'jackal', 'shotgun'] as const;
export type GunModelId = (typeof GUN_MODEL_IDS)[number];

const models = new Map<string, Record<Group, Part[]>>();
const lods = new Map<string, Record<Group, Part[]>>();
let loading: Promise<void> | null = null;
/** Bumped when models arrive: a build cached before that is stale (Weapon, MenuStage). */
let gen = 0;
/** DEV: what loaded, and how long it took. */
export const gunModelStats = { loaded: [] as string[], failed: [] as string[], ms: 0 };

export function gunModelsGen() {
  return gen;
}

/** Parts of a loaded GLB scene by node and role (in gun space: nodes' transforms baked). */
function partsOf(root: THREE.Object3D): Record<Group, Part[]> {
  const out: Record<Group, Part[]> = { body: [], slide: [], mag: [] };
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // The node is the mesh itself or (several primitives) its parent group.
    let n: THREE.Object3D | null = m;
    while (n && !(n.name in out)) n = n.parent;
    if (!n) return;
    const mat = m.material as THREE.Material;
    const role = (ROLES as readonly string[]).includes(mat.name) ? (mat.name as Role) : 'frame';
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    mat.dispose();
    m.geometry.dispose();
    out[n.name as Group].push({ geo, role });
  });
  return out;
}

/** Load every gun's GLB (once; the promise is shared). Never rejects: a gun that fails keeps its boxes. */
export function loadGunModels(base: string = import.meta.env.BASE_URL): Promise<void> {
  if (loading) return loading;
  const t0 = performance.now();
  const loader = new GLTFLoader();
  const one = (file: string, into: Map<string, Record<Group, Part[]>>, id: string) =>
    loader
      .loadAsync(`${base}models/guns/${file}.glb`)
      .then((g) => {
        into.set(id, partsOf(g.scene));
        gunModelStats.loaded.push(file);
      })
      .catch((e) => {
        gunModelStats.failed.push(file);
        console.warn(`[guns] ${file}.glb did not load; that gun keeps its box model`, e);
      });
  loading = Promise.all(GUN_MODEL_IDS.flatMap((id) => [one(id, models, id), one(`${id}_lod`, lods, id)])).then(() => {
    gunModelStats.ms = performance.now() - t0;
    if (models.size || lods.size) gen++;
  });
  return loading;
}

export function hasGunModel(id: string) {
  return models.has(id);
}

/** The material a role takes in this build: the theme's (theme.ts). */
function matFor(role: Role, mats: GunMats): THREE.Material {
  return role === 'glow' ? mats.glow : mats[role];
}

/**
 * Put gun `id`'s model into a build: the body on `gun`, the cycling part on `slide`, the magazine on
 * `mag` (where the build has already set its rest position: its parts are moved into its frame).
 * False: no model (the caller builds its boxes).
 */
export function dressGun(id: string, { gun, slide, mag, mats }: WeaponBuild): boolean {
  const m = models.get(id);
  if (!m) return false;
  const add = (parts: Part[], parent: THREE.Object3D, to?: THREE.Matrix4) => {
    for (const p of parts) {
      const geo = p.geo.clone();
      if (to) geo.applyMatrix4(to);
      const mesh = new THREE.Mesh(geo, matFor(p.role, mats));
      // The glow parts are the viewmodel's ammo strips (lit where the theme glows).
      if (p.role === 'glow') mesh.userData.strip = true;
      mesh.userData.gunModel = true;
      parent.add(mesh);
    }
  };
  add(m.body, gun);
  // The slide group sits at the gun's origin (its parts are in gun space as they are).
  slide.updateMatrix();
  add(m.slide, slide, slide.matrix.clone().invert());
  mag.updateMatrix();
  add(m.mag, mag, mag.matrix.clone().invert());
  return true;
}

// ------------------------------------------------------------------ the bots' guns
/** The armory's guns and their models. */
const MODEL_OF: Record<WeaponId, GunModelId> = { pistol: 'kitsune9', smg: 'hornet', ar: 'jackal', shotgun: 'shotgun' };

/**
 * How a model sits in a bot's hands (viewmodel gun space): the bore's height (the rig's bore sits
 * `rigBore` over the palm), the palm's z on the grip, the muzzle, the support hand's spot (null: the
 * rig's own, the pistol's cupping hand).
 */
const FIT: Record<WeaponId, { bore: number; rigBore: number; palmZ: number; muzzle: [number, number, number]; fore: [number, number, number] | null }> = {
  pistol: { bore: 0.0205, rigBore: 0.058, palmZ: 0.05, muzzle: [0, 0.0205, -0.1255], fore: null },
  smg: { bore: 0.012, rigBore: 0.05, palmZ: 0.036, muzzle: [0, 0.012, -0.446], fore: [0, -0.052, -0.29] },
  ar: { bore: 0.018, rigBore: 0.05, palmZ: 0.032, muzzle: [0, 0.018, -0.618], fore: [0, -0.026, -0.31] },
  shotgun: { bore: 0.03, rigBore: 0.065, palmZ: 0.08, muzzle: [0, 0.03, -0.673], fore: [0, -0.036, -0.32] },
};
/** The bots' guns a touch over life size (their bodies are; the box guns were bigger still). */
const BOT_SCALE = 1.05;
/** Each role's shade of the theme's gun colour (a vertex colour: one material a theme). */
const SHADE: Record<Role, [number, number, number]> = {
  frame: [1, 1, 1],
  steel: [0.72, 0.72, 0.74],
  polymer: [1.2, 1.2, 1.16],
  furniture: [1.5, 1.45, 1.35],
  trim: [1.7, 1.7, 1.7],
  glow: [1, 1, 1],
};

export interface BotGun {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  muzzle: [number, number, number];
  fore: [number, number, number] | null;
}
const botGuns = new Map<WeaponId, { gen: number; gun: BotGun }>();

/** Viewmodel gun space to the bot's (rigGuns.ts). */
function botMatrix(id: WeaponId) {
  const f = FIT[id], k = BOT_SCALE;
  const palmY = f.bore - f.rigBore / k;
  return new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeTranslation(0, -palmY, -f.palmZ));
}

/** Gun `id` for a bot (merged, shaded, in its gun space; shared), or null: no model (its boxes). */
export function botGun(id: WeaponId): BotGun | null {
  const m = lods.get(MODEL_OF[id]);
  if (!m) return null;
  const had = botGuns.get(id);
  if (had && had.gen === gen) return had.gun;
  const M = botMatrix(id);
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  for (const g of ['body', 'slide', 'mag'] as const)
    for (const p of m[g]) {
      const geo = p.geo.clone().applyMatrix4(M);
      geo.deleteAttribute('uv');
      const n = geo.getAttribute('position').count, c = new Float32Array(n * 3), [r, gg, b] = SHADE[p.role];
      for (let i = 0; i < n; i++) c.set([r, gg, b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      (p.role === 'glow' ? glow : body).push(geo);
    }
  const merged = mergeGeometries(body)!;
  const lit = glow.length ? mergeGeometries(glow) : null;
  for (const g of [...body, ...glow]) g.dispose();
  merged.userData.shared = true;
  if (lit) lit.userData.shared = true;
  const at = (v: [number, number, number]) => new THREE.Vector3(...v).applyMatrix4(M).toArray() as [number, number, number];
  const gun: BotGun = { body: merged, glow: lit, muzzle: at(FIT[id].muzzle), fore: FIT[id].fore ? at(FIT[id].fore!) : null };
  had?.gun.body.dispose();
  had?.gun.glow?.dispose();
  botGuns.set(id, { gen, gun });
  return gun;
}
