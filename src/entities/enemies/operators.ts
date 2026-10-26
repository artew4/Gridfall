import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rig } from '../../enemies/Models';
import type { WeaponId } from '../weapons/armory';
import { RIG_GUNS, rigGunGeo, rigMuzzle } from './rigGuns';
import { gunModelsGen, mercModel } from '../weapons/models';
import type { EnemyLook } from '../types';
import type { TeamId } from '../../combat/Team';

/*
  14.0, Team Deathmatch operators: the "cyberpunk mercenary" skin both teams wear on every TDM map.

  The readability rule (Knowledge_Gamedev: character-readability-in-the-dark): a body in a dark
  alley must be found by its accents and read by its silhouette, and must not light itself up.
   - Gear is matte and dark: charcoal and graphite cloth and plates, roughness ~0.9, almost no metal
     and a low environment response. The neon-wet world doesn't mirror off them, and nothing on them
     glows except the accents.
   - Accents are small, emissive and in the team colour: a visor strip (where the eyes go: the
     target), two shoulder patches (the width of the body, seen from the front or behind), and a
     spine rig down the back plate (seen running away). They total about 4% of the body's area, over
     the bloom threshold, so they catch the eye in the dark without lighting anything. Sized for
     20–30 m: the first cut (2 cm strips) went sub-pixel at 20 m in an unlit alley stretch.
   - Silhouette first: helmet and shoulder plates are broad and square, so a figure reads as a
     person against neon even where the accents are hidden.
  The team colour is the accent: ALPHA cyan-blue, OMEGA red-orange (the HUD's colours).

  The skeleton is the gunner/runner rig's (the pivots the animation drives); per-enemy armour, cloth
  and glow materials are clones the Enemy flashes on hits and disposes. Everything else is shared.
*/

/**
 * 20.0: the kit an operator wears, chosen by the map (TdmData.kit):
 *  - 'night' (14.0, every map until 20.0): charcoal and graphite, matte; the dark-alley rule above.
 *  - 'corporate' (Maglev Terminal): the same cut in off-white and pale grey synthetics, satin rather
 *    than matte (polished panels, like the hall), grey webbing, a light grey rifle. In a white, sunlit
 *    hall the night kit was a black figure on a white floor, found at any range without looking; this
 *    one sits within the hall's own values, so a body is found by its silhouette and its team accents.
 *
 * 22.0, friend or foe at a glance: the glowing accents alone were not enough on the white kit (the
 * owner couldn't tell the teams apart). The secondary gear (chest rig, shoulder pads, helmet) is now a
 * solid block of pale team colour: ice blue for ALPHA, pale sand-orange for OMEGA, the base armour
 * still white. On the night kit the same blocks are deep and muted (the dark-alley rule holds).
 */
export type OperatorKit = 'night' | 'corporate';

interface KitSpec {
  armor: number;
  cloth: number;
  webbing: number;
  boots: number;
  team: Record<TeamId, number>;
  gun: number;
  visor: number;
  /** The one body material: roughness, metalness, environment response. */
  surface: { roughness: number; metalness: number; env: number };
  /** Accent brightness (× OPERATOR_ACCENT). */
  glow: number;
}

const KITS: Record<OperatorKit, KitSpec> = {
  night: {
    armor: 0x33363c,
    cloth: 0x1c1d21,
    webbing: 0x24262b,
    boots: 0x121316,
    team: { alpha: 0x1f3a52, omega: 0x50301f },
    gun: 0x1a1b1e,
    visor: 0x08090c,
    surface: { roughness: 0.88, metalness: 0.06, env: 0.22 },
    glow: 1,
  },
  corporate: {
    armor: 0xd6dadd,
    cloth: 0xb9bfc4,
    webbing: 0x8e969d,
    boots: 0x6b737a,
    team: { alpha: 0x86c3ec, omega: 0xe8ac72 },
    gun: 0x8a9298,
    visor: 0x2a3138,
    surface: { roughness: 0.55, metalness: 0.08, env: 0.6 },
    glow: 0.8,
  },
};

/** 22.0 (tests, docs): a kit's colour blocks (sRGB hex) for a team. */
export function kitColours(kit: OperatorKit, team: TeamId) {
  const k = KITS[kit];
  return { armor: k.armor, cloth: k.cloth, webbing: k.webbing, boots: k.boots, team: k.team[team] };
}

/** The rifle (the gun's base, before the map's finish) and the visor glass: shared per kit. */
function sharedOf(kit: KitSpec) {
  const m = {
    gun: new THREE.MeshStandardMaterial({ color: kit.gun, roughness: 0.6, metalness: 0.45, envMapIntensity: 0.35 }),
    // The visor glass itself is dark: only its strip glows.
    visor: new THREE.MeshStandardMaterial({ color: kit.visor, roughness: 0.25, metalness: 0.2, envMapIntensity: 0.6 }),
  };
  for (const x of Object.values(m)) x.userData.shared = true;
  return m;
}
const SHARED: Record<OperatorKit, ReturnType<typeof sharedOf>> = { night: sharedOf(KITS.night), corporate: sharedOf(KITS.corporate) };

/** Accent colours (HDR: over the 1.0 bloom threshold, a small halo, not a lamp). */
export const OPERATOR_ACCENT: Record<TeamId, THREE.Color> = {
  alpha: new THREE.Color(0.45, 1.6, 3.3),
  omega: new THREE.Color(3.3, 0.7, 0.28),
};
/** Hit sparks and death bursts in the team colour (dim). */
const SPARK: Record<TeamId, THREE.Color> = { alpha: new THREE.Color(0.35, 0.6, 0.9), omega: new THREE.Color(0.9, 0.4, 0.25) };

/*
  22.0, the procedural Cyber-Merc rig (a hierarchy of pivots, low-poly armour on each):

    root
    └ body (pelvis, 1.0 m up: hips, belt, groin plate)
      ├ torso (abdomen, trapezoid chest and plates, chest rig, collar, pack, spine accents)
      │ ├ head (neck, balaclava, angular helmet, visor and its strip, respirator)
      │ ├ armL / armR (shoulder joints; upper arm, angular shoulder pad with the team patch)
      │ │ └ foreL / foreR (elbows; forearm, bracer)
      │ │   └ handL / handR (palms; glove)  ← the IK's end effectors
      │ └ weapon (the gun; its muzzle)       ← the hands' targets
      └ legL / legR (hips; thigh, plate, pouch)
        └ kneeL / kneeR (knees; shin, knee pad, shin guard, boot)

  One body material per bot (vertex colours carry armour, cloth, team blocks, webbing and boots; the
  hit flash lights it all) plus its glow, the kit's visor glass and the gun: each pivot is one to three
  draw calls (the 14.0 operator: up to five per pivot). Each pivot's merged geometry depends only on
  the kit, the team and the frame, so it is built once and shared by every bot that wears it: a
  respawn builds pivots and meshes, never geometry.
*/

/** Arm bones (m): shoulder → elbow, elbow → palm. */
export const ARM = { upper: 0.32, lower: 0.37 };

type Layer = 'armor' | 'cloth' | 'team' | 'webbing' | 'boots' | 'glow' | 'visor';
const BODY_LAYERS: Layer[] = ['armor', 'cloth', 'team', 'webbing', 'boots'];

const shapeCache = new Map<string, THREE.BufferGeometry>();
/** A box whose top face is resized to `tw` × `td` (a trapezoid prism: plates, pads, helmets). Flat-shaded. */
function taper(w: number, h: number, d: number, tw = w, td = d, shiftZ = 0) {
  const k = `t${w},${h},${d},${tw},${td},${shiftZ}`;
  let g = shapeCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) p.setXYZ(i, (p.getX(i) * tw) / w, p.getY(i), (p.getZ(i) * td) / d + shiftZ);
    }
    g.computeVertexNormals();
    shapeCache.set(k, g);
  }
  return g;
}
function cyl(rt: number, rb: number, h: number, seg = 6) {
  const k = `c${rt},${rb},${h},${seg}`;
  let g = shapeCache.get(k);
  if (!g) shapeCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed()));
  return g;
}

/** Merged geometry per (frame, kit, team, pivot, layer group), shared by every rig built from it. */
const templates = new Map<string, Map<string, { body?: THREE.BufferGeometry; glow?: THREE.BufferGeometry; visor?: THREE.BufferGeometry }>>();
/** DEV: rigs built, and how many of them had to merge geometry (the first of each kit and team). */
export const rigStats = { built: 0, merged: 0 };

const _e = new THREE.Euler();
const _col = new THREE.Color();

function buildMerc(team: TeamId, kitId: OperatorKit, frame: 'gunner' | 'light'): Rig {
  rigStats.built++;
  const kit = KITS[kitId];
  // 67.0: the Blender operator (models.ts) once it's loaded, else the 22.0 boxes.
  const model = mercModel();
  const key = `${frame}/${kitId}/${team}/${model ? `m${gunModelsGen()}` : 'boxes'}`;
  const cached = templates.get(key);
  const parts = new Map<string, { layer: Layer; geo: THREE.BufferGeometry; m: THREE.Matrix4 }[]>();
  const pivots = new Map<string, THREE.Group>();
  const pv = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.name = name;
    parent.add(g);
    pivots.set(name, g);
    return g;
  };
  // Records a part on a pivot (only the first rig of a template needs them).
  const add = (on: string, geo: THREE.BufferGeometry, layer: Layer, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, always = false) => {
    if (cached || (model && !always)) return;
    const list = parts.get(on) ?? [];
    parts.set(on, list);
    list.push({ layer, geo, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)) });
  };
  const box = (w: number, h: number, d: number) => taper(w, h, d);
  const light = frame === 'light';
  const W = light ? 0.85 : 1; // the light frame is slimmer

  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pv('body', root, 0, light ? 0.95 : 1.0, 0);
  // Pelvis: hips, belt, a groin plate.
  add('body', taper(0.34 * W, 0.18, 0.23, 0.38 * W, 0.25), 'cloth', 0, 0.02, 0);
  add('body', box(0.4 * W, 0.06, 0.27), 'webbing', 0, 0.1, 0);
  add('body', taper(0.13, 0.14, 0.04, 0.18, 0.04), 'armor', 0, -0.02, 0.13);
  for (const sx of [-1, 1]) add('body', box(0.07, 0.09, 0.08), 'webbing', sx * 0.17 * W, 0.04, 0.06);

  const torso = pv('torso', body, 0, 0, 0);
  add('torso', box(0.3 * W, 0.22, 0.21), 'cloth', 0, 0.13, 0);
  add('torso', taper(0.38 * W, 0.32, 0.25, 0.48 * W, 0.27), 'cloth', 0, 0.4, 0);
  // Trapezoid plates, the front one angled out at the top.
  add('torso', taper(0.34 * W, 0.3, 0.05, 0.44 * W, 0.05, 0.02), 'armor', 0, 0.42, 0.14, -0.06);
  add('torso', taper(0.38 * W, 0.32, 0.05, 0.44 * W, 0.05), 'armor', 0, 0.42, -0.15);
  // The chest rig in the team's colour: a band across the plate and three pouches.
  add('torso', box(0.36 * W, 0.1, 0.05), 'team', 0, 0.29, 0.18);
  if (!light) for (const x of [-0.11, 0, 0.11]) add('torso', taper(0.09, 0.11, 0.05, 0.08, 0.045), 'team', x, 0.3, 0.215);
  add('torso', taper(0.3 * W, 0.07, 0.22, 0.22 * W, 0.18), 'armor', 0, 0.6, 0);
  if (!light) add('torso', taper(0.26, 0.3, 0.11, 0.22, 0.1), 'webbing', 0, 0.4, -0.22);
  // Spine rig accents down the back plate.
  for (const y of [0.53, 0.42, 0.31]) add('torso', box(0.055, 0.08, 0.012), 'glow', 0, y, -0.18);

  const head = pv('head', torso, 0, light ? 0.66 : 0.72, 0.02);
  add('head', cyl(0.06, 0.07, 0.12), 'cloth', 0, -0.03, 0);
  add('head', box(0.18, 0.2, 0.2), 'cloth', 0, 0.08, 0);
  // The angular helmet (team colour), its side plates, the visor and its strip, a respirator.
  add('head', taper(0.29, 0.15, 0.31, 0.22, 0.26, -0.01), 'team', 0, 0.2, -0.01);
  for (const sx of [-1, 1]) add('head', taper(0.04, 0.12, 0.14, 0.03, 0.1), 'armor', sx * 0.135, 0.11, -0.01);
  add('head', taper(0.22, 0.075, 0.05, 0.25, 0.05), 'visor', 0, 0.12, 0.12, -0.12);
  add('head', box(0.2, 0.026, 0.012), 'glow', 0, 0.125, 0.148);
  add('head', taper(0.12, 0.07, 0.07, 0.16, 0.05), 'armor', 0, 0.02, 0.11);

  const sh = light ? 0.17 : 0.19;
  const arms: Record<'L' | 'R', [THREE.Group, THREE.Group, THREE.Group]> = { L: null!, R: null! };
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    const arm = pv(`arm${side}`, torso, sx * sh, light ? 0.52 : 0.57, 0.03);
    add(`arm${side}`, taper(0.1, 0.3, 0.1, 0.11, 0.11), 'cloth', 0, -0.15, 0);
    // The angular shoulder pad (team colour) and its patch, readable front, back and side.
    add(`arm${side}`, taper(0.2 * W, 0.08, 0.2, 0.13 * W, 0.15), 'team', sx * 0.03, 0.01, 0, 0, 0, sx * -0.35);
    add(`arm${side}`, box(0.012, 0.07, 0.12), 'glow', sx * 0.12 * W, -0.02, 0, 0, 0, sx * -0.35);
    const fore = pv(`fore${side}`, arm, 0, -ARM.upper, 0);
    add(`fore${side}`, taper(0.085, 0.3, 0.085, 0.1, 0.1), 'cloth', 0, -0.16, 0);
    add(`fore${side}`, taper(0.1, 0.17, 0.1, 0.105, 0.11), 'armor', 0, -0.2, 0);
    if (light) add(`fore${side}`, box(0.012, 0.45, 0.05), 'boots', 0, -0.42, 0.03, 0, 0, 0, true); // the blade
    const hand = pv(`hand${side}`, fore, 0, -ARM.lower, 0);
    add(`hand${side}`, box(0.06, 0.085, 0.08), 'boots', sx * 0.012, 0, 0);
    arms[side] = [arm, fore, hand];
  }

  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    pv(`leg${side}`, body, sx * 0.11 * W, -0.02, 0);
    add(`leg${side}`, taper(0.15, 0.44, 0.17, 0.17, 0.19), 'cloth', 0, -0.22, 0);
    add(`leg${side}`, box(0.12, 0.2, 0.04), 'armor', 0, -0.2, 0.1);
    add(`leg${side}`, box(0.05, 0.12, 0.1), 'webbing', sx * 0.09, -0.24, 0.02);
    pv(`knee${side}`, pivots.get(`leg${side}`)!, 0, -0.46, 0);
    add(`knee${side}`, taper(0.12, 0.42, 0.14, 0.14, 0.15), 'cloth', 0, -0.21, 0);
    add(`knee${side}`, taper(0.13, 0.12, 0.06, 0.1, 0.05), 'armor', 0, -0.03, 0.09);
    add(`knee${side}`, box(0.1, 0.22, 0.04), 'armor', 0, -0.22, 0.08);
    add(`knee${side}`, taper(0.13, 0.1, 0.26, 0.12, 0.18, -0.02), 'boots', 0, -0.45, 0.04);
  }

  // 67.0: the model's parts, each pivot's in its own space (the light frame narrower, its torso shorter).
  if (model && !cached) {
    const slim = (name: string) =>
      !light ? null : name === 'body' ? new THREE.Matrix4().makeScale(0.85, 1, 1) : name === 'torso' ? new THREE.Matrix4().makeScale(0.85, 0.917, 1) : name.startsWith('arm') ? new THREE.Matrix4().makeScale(0.9, 1, 1) : null;
    for (const [name, list] of Object.entries(model)) {
      const into = parts.get(name) ?? [];
      parts.set(name, into);
      for (const p of list) into.push({ layer: p.role as Layer, geo: p.geo, m: slim(name) ?? new THREE.Matrix4() });
    }
  }

  // Merge each pivot's parts once per template: body layers with vertex colours, glow and visor apart.
  let tpl = cached;
  if (!tpl) {
    rigStats.merged++;
    tpl = new Map();
    const colourOf = (l: Layer) => (l === 'team' ? kit.team[team] : (kit as unknown as Record<string, number>)[l]);
    for (const [name, list] of parts) {
      const out: { body?: THREE.BufferGeometry; glow?: THREE.BufferGeometry; visor?: THREE.BufferGeometry } = {};
      for (const group of ['body', 'glow', 'visor'] as const) {
        const sel = list.filter((p) => (group === 'body' ? BODY_LAYERS.includes(p.layer) : p.layer === group));
        if (!sel.length) continue;
        const geos = sel.map((p) => {
          // (The model's parts are indexed, the boxes not: all of them unindexed to merge.)
          const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
          if (g.getAttribute('uv')) g.deleteAttribute('uv');
          if (group === 'body') {
            _col.setHex(colourOf(p.layer));
            const n = g.attributes.position.count, c = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) c.set([_col.r, _col.g, _col.b], i * 3);
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          }
          return g;
        });
        const merged = mergeGeometries(geos)!;
        for (const g of geos) g.dispose();
        merged.userData.shared = true;
        out[group] = merged;
      }
      tpl.set(name, out);
    }
    templates.set(key, tpl);
  }

  // The per-bot materials: the body (flashes on hits) and the glow (the team accents).
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kit.surface.roughness, metalness: kit.surface.metalness, envMapIntensity: kit.surface.env });
  const glowMat = new THREE.MeshBasicMaterial({ color: OPERATOR_ACCENT[team].clone().multiplyScalar(kit.glow) });
  const meshes: THREE.Mesh[] = [];
  for (const [name, g] of tpl) {
    const p = pivots.get(name)!;
    if (g.body) meshes.push(p.add(new THREE.Mesh(g.body, bodyMat)).children.at(-1) as THREE.Mesh);
    if (g.glow) meshes.push(p.add(new THREE.Mesh(g.glow, glowMat)).children.at(-1) as THREE.Mesh);
    if (g.visor) meshes.push(p.add(new THREE.Mesh(g.visor, SHARED[kitId].visor)).children.at(-1) as THREE.Mesh);
  }

  const [armL, foreL, handL] = arms.L, [armR, foreR, handR] = arms.R;
  let weapon: THREE.Group | undefined, muzzle: THREE.Object3D | undefined;
  if (!light) {
    // The gun (the rifle until the armory deals another: setRigGun); the hands find it (RigIK).
    weapon = pv('weapon', torso, ...RIG_GUNS.ar.hip);
    weapon.rotation.order = 'YXZ';
    const gun = new THREE.Mesh(rigGunGeo('ar'), SHARED[kitId].gun);
    gun.userData.gunBody = true;
    weapon.add(gun);
    weapon.userData.gunId = 'ar';
    muzzle = pv('muzzle', weapon, ...RIG_GUNS.ar.muzzle);
    root.userData.ik = true;
  } else {
    // The light frame's FK pose (the runner animates its arms).
    armL.rotation.set(-0.9, 0, 0.2);
    armR.rotation.set(-0.6, 0, -0.1);
    foreL.rotation.set(-0.7, 0, 0);
    foreR.rotation.set(-1.1, 0, 0);
  }
  const P = (n: string) => pivots.get(n)!;
  const rig: Rig = {
    root, body, torso, head, armL, armR, foreL, foreR, handL, handR,
    legL: P('legL'), legR: P('legR'), kneeL: P('kneeL'), kneeR: P('kneeR'),
    weapon, muzzle,
    armorMat: bodyMat, clothMat: bodyMat, glowMat, parts: meshes,
  };
  // Nothing geometric is the rig's own (shared templates); the per-bot materials are.
  root.userData.ownedGeos = [];
  root.userData.ownedMats = [bodyMat, glowMat];
  return rig;
}

/** 22.0: give a merc rig the armory gun it was dealt (its model, its muzzle; the hands follow). */
export function setRigGun(rig: Rig, id: WeaponId) {
  const w = rig.weapon;
  if (!w || !rig.root.userData.ik) return false;
  const gun = w.children.find((c) => c.userData.gunBody) as THREE.Mesh | undefined;
  if (gun) gun.geometry = rigGunGeo(id);
  for (const c of [...w.children]) if (c.userData.gunAccent) w.remove(c);
  w.userData.gunId = id;
  w.scale.setScalar(1);
  rig.muzzle?.position.set(...rigMuzzle(id));
  w.position.set(...RIG_GUNS[id].hip);
  return true;
}

function operators(team: TeamId, kit: OperatorKit): EnemyLook {
  return {
    id: kit === 'night' ? `operator-${team}` : `operator-${kit}-${team}`,
    buildRunner: () => buildMerc(team, kit, 'light'),
    buildGunner: () => buildMerc(team, kit, 'gunner'),
    runnerAccent: SPARK[team],
    gunnerAccent: SPARK[team],
    organic: true,
    // Rounds take their look from the gun (13.0 armory); this is only the fallback.
    bolt: team === 'alpha' ? { core: [3.2, 4.6, 7], trail: [0.5, 0.75, 1.3], size: 0.55 } : { core: [7, 3.2, 0.9], trail: [1.4, 0.6, 0.15], size: 0.55 },
    ballistic: 'kinetic',
    voice: 'human',
  };
}

/** 14.0: the TDM skins, per team (the night kit, every map's default). */
export const OPERATORS: Record<TeamId, EnemyLook> = { alpha: operators('alpha', 'night'), omega: operators('omega', 'night') };
/** 20.0: the TDM skins by kit and team (TdmData.kit picks the kit). */
export const OPERATOR_KITS: Record<OperatorKit, Record<TeamId, EnemyLook>> = {
  night: OPERATORS,
  corporate: { alpha: operators('alpha', 'corporate'), omega: operators('omega', 'corporate') },
};
