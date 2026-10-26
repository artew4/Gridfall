import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponBuild } from '../types';
import type { GunMats } from './theme';
import type { WeaponId } from './armory';
import HAND_FIT from './handFit.json';

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

type Role = 'frame' | 'steel' | 'polymer' | 'furniture' | 'trim' | 'glow' | HandRole;
type HandRole = 'glove' | 'pad' | 'sleeve' | 'cuff';
type Group = 'body' | 'slide' | 'mag';
type Part = { geo: THREE.BufferGeometry; role: Role };
/** 67.0: a part of the merc (its role is a rig layer: armor, cloth, team, webbing, boots, glow, visor). */
export type MercPart = { geo: THREE.BufferGeometry; role: string };

const ROLES: readonly Role[] = ['frame', 'steel', 'polymer', 'furniture', 'trim', 'glow', 'glove', 'pad', 'sleeve', 'cuff'];
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
function partsOf<N extends string = Group>(root: THREE.Object3D, names: readonly N[] = ['body', 'slide', 'mag'] as unknown as N[], anyRole = false): Record<N, Part[]> {
  const out = Object.fromEntries(names.map((n) => [n, []])) as unknown as Record<N, Part[]>;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // The node is the mesh itself or (several primitives) its parent group.
    let n: THREE.Object3D | null = m;
    while (n && !(n.name in out)) n = n.parent;
    if (!n) return;
    const mat = m.material as THREE.Material;
    // (The merc's parts keep their layer names: operators.ts reads them.)
    const role = ((ROLES as readonly string[]).includes(mat.name) || anyRole ? mat.name : 'frame') as Role;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    mat.dispose();
    m.geometry.dispose();
    out[n.name as N].push({ geo, role });
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
  const handsIn = loader
    .loadAsync(`${base}models/hands.glb`)
    .then((g) => {
      hands = partsOf(g.scene, HAND_POSES);
      gunModelStats.loaded.push('hands');
    })
    .catch((e) => {
      gunModelStats.failed.push('hands');
      console.warn('[guns] hands.glb did not load; the hands stay boxes', e);
    });
  const mercIn = loader
    .loadAsync(`${base}models/merc.glb`)
    .then((g) => {
      merc = partsOf(g.scene, MERC_PIVOTS, true);
      gunModelStats.loaded.push('merc');
    })
    .catch((e) => {
      gunModelStats.failed.push('merc');
      console.warn('[models] merc.glb did not load; the operators stay boxes', e);
    });
  const kitsIn = Object.entries(PROP_KITS).map(([name, nodes]) =>
    loader
      .loadAsync(`${base}models/props/${name}.glb`)
      .then((g) => {
        propKits_.set(name, partsOf(g.scene, nodes, true));
        gunModelStats.loaded.push(`props/${name}`);
      })
      .catch((e) => {
        gunModelStats.failed.push(`props/${name}`);
        console.warn(`[models] props/${name}.glb did not load; its boxes stay boxes`, e);
      }),
  );
  loading = Promise.all([...GUN_MODEL_IDS.flatMap((id) => [one(id, models, id), one(`${id}_lod`, lods, id)]), handsIn, mercIn, ...kitsIn]).then(() => {
    gunModelStats.ms = performance.now() - t0;
    if (models.size || lods.size || hands || merc || propKits_.size) gen++;
  });
  return loading;
}

export function hasGunModel(id: string) {
  return models.has(id);
}

/** The material a role takes in this build: the theme's (theme.ts). The knuckle armour is the polymer. */
function matFor(role: Role, mats: GunMats): THREE.Material {
  return role === 'glow' ? mats.glow : role === 'pad' ? mats.polymer : mats[role];
}

// ------------------------------------------------------------------ 67.0: the hands
/** The hands' poses (tools/blender/hands.py): the right hand on a pistol grip, the left round a vertical grip, under a fore-end. */
export const HAND_POSES = ['grip_R', 'grip_L', 'cup_L'] as const;
export type HandPose = (typeof HAND_POSES)[number];
let hands: Record<HandPose, Part[]> | null = null;

export function hasHands() {
  return !!hands;
}

/**
 * Gun `gun`'s gloved hand in `pose` on `parent` (its hand group, in gun space or the slide's), where
 * handFit.json puts it (shared with tools/blender/viewmodel.py's previews). False: not loaded (the
 * build keeps its boxes).
 */
export function dressHand(gun: GunModelId, pose: HandPose, parent: THREE.Object3D, mats: GunMats): boolean {
  const h = hands?.[pose];
  const fit = (HAND_FIT as Record<string, { pose: string; at: number[]; rx: number; rz: number }[]>)[gun]?.find((f) => f.pose === pose);
  if (!h || !fit) return false;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...fit.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(fit.rx, 0, fit.rz)), new THREE.Vector3(1, 1, 1));
  for (const p of h) {
    const mesh = new THREE.Mesh(p.geo.clone().applyMatrix4(m), matFor(p.role, mats));
    // The wrist band is the sleeve's stripe (lit where the theme glows), as the cuff was.
    if (p.role === 'cuff') mesh.userData.strip = true;
    parent.add(mesh);
  }
  return true;
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
const SHADE: Partial<Record<Role, [number, number, number]>> = {
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
      const n = geo.getAttribute('position').count, c = new Float32Array(n * 3), [r, gg, b] = SHADE[p.role] ?? [1, 1, 1];
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

// ------------------------------------------------------------------ 67.0: the operators
/** The merc rig's pivots (operators.ts): the model has a node for each, in that pivot's space. */
export const MERC_PIVOTS = ['body', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'legL', 'legR', 'kneeL', 'kneeR'] as const;
let merc: Record<(typeof MERC_PIVOTS)[number], MercPart[]> | null = null;

/** The operator's parts by pivot (tools/blender/merc.py), or null: not loaded (the rig's boxes). */
export function mercModel(): Readonly<Record<string, readonly MercPart[]>> | null {
  return merc;
}

// ------------------------------------------------------------------ 68.0: the environment's kits
/** The prop kits (tools/blender/props_*.py) and their nodes (docs/ENVIRONMENT_PLAN.md). */
const PROP_KITS: Record<string, readonly string[]> = {
  nature: ['bush', 'fern', 'bigleaf', 'crown', 'trunk', 'buttress', 'slim', 'rock_a', 'rock_b', 'rock_c'],
  military: ['bag', 'hesco', 'crate', 'case', 'drum', 'pallet', 'jersey', 'tyre', 'spool'],
  corp: ['cplanter', 'kiosk', 'ticket', 'cbench', 'tgate', 'lcart', 'mcart', 'tdoor'],
  port: ['crane_leg', 'crane_girder', 'crane_house', 'trolley', 'bogie', 'rail_panel', 'rack_frame', 'rack_beam', 'bitt'],
  neon: ['vending', 'ac_roof', 'ac_wall', 'garbage', 'dumpster', 'planter', 'lantern_caps', 'ecab', 'bike', 'bench', 'bollard', 'upole', 'yatai'],
  desert: ['jamb', 'head', 'sill', 'shutter', 'door', 'ac', 'roof_tank', 'tower_tank', 'brace', 'antenna', 'dish', 'tent', 'awning', 'palm', 'lamp', 'pole'],
  heavy: ['container', 'container40', 'truck', 'truck_open', 'apc', 'bus', 'generator', 'car', 'jeep', 'bowser', 'semi', 'forklift'],
};
const propKits_ = new Map<string, Record<string, MercPart[]>>();

/** A kit's parts by node (real size, base at y = 0, centred), or null: not loaded (the boxes stay). */
export function propKit(name: string): Readonly<Record<string, readonly MercPart[]>> | null {
  return propKits_.get(name) ?? null;
}

/** 70.0: every prop kit's nodes in one (the dresser takes them all), or null: none loaded. */
export function propKits(): Readonly<Record<string, readonly MercPart[]>> | null {
  if (!propKits_.size) return null;
  return Object.assign({}, ...propKits_.values());
}
