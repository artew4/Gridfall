import * as THREE from 'three';
import { boxGeo, cylGeo, mergeRig, pivot, type Rig } from '../../enemies/Models';
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
 *    The accents stay (the team must read at a glance), a touch dimmer: a white hall needs less glow.
 */
export type OperatorKit = 'night' | 'corporate';

interface KitSpec {
  armor: { color: number; roughness: number; metalness: number; env: number };
  cloth: { color: number; roughness: number; metalness: number; env: number };
  webbing: number;
  boots: number;
  gun: number;
  visor: number;
  /** Accent brightness (× OPERATOR_ACCENT). */
  glow: number;
}

const KITS: Record<OperatorKit, KitSpec> = {
  night: {
    armor: { color: 0x33363c, roughness: 0.88, metalness: 0.08, env: 0.25 },
    cloth: { color: 0x1c1d21, roughness: 0.95, metalness: 0.02, env: 0.15 },
    webbing: 0x24262b,
    boots: 0x121316,
    gun: 0x1a1b1e,
    visor: 0x08090c,
    glow: 1,
  },
  corporate: {
    armor: { color: 0xd6dadd, roughness: 0.45, metalness: 0.1, env: 0.7 },
    cloth: { color: 0xb9bfc4, roughness: 0.75, metalness: 0.02, env: 0.45 },
    webbing: 0x8e969d,
    boots: 0x6b737a,
    gun: 0x8a9298,
    visor: 0x2a3138,
    glow: 0.8,
  },
};

/** Webbing, boots, the rifle and the visor glass: shared by every operator of a kit. */
function sharedOf(kit: KitSpec) {
  const m = {
    webbing: new THREE.MeshStandardMaterial({ color: kit.webbing, roughness: 0.95, metalness: 0.02, envMapIntensity: kit === KITS.night ? 0.15 : 0.4 }),
    boots: new THREE.MeshStandardMaterial({ color: kit.boots, roughness: 0.9, metalness: 0.05, envMapIntensity: kit === KITS.night ? 0.15 : 0.4 }),
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

function base(team: TeamId, kitId: OperatorKit) {
  const kit = KITS[kitId];
  // Plates a shade off the cloth (shape inside the silhouette).
  const armorMat = new THREE.MeshStandardMaterial({ color: kit.armor.color, roughness: kit.armor.roughness, metalness: kit.armor.metalness, envMapIntensity: kit.armor.env });
  const clothMat = new THREE.MeshStandardMaterial({ color: kit.cloth.color, roughness: kit.cloth.roughness, metalness: kit.cloth.metalness, envMapIntensity: kit.cloth.env });
  const glowMat = new THREE.MeshBasicMaterial({ color: OPERATOR_ACCENT[team].clone().multiplyScalar(kit.glow) });
  const shared = SHARED[kitId];
  const parts: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    parts.push(m);
    return m;
  };
  return { armorMat, clothMat, glowMat, parts, add, shared };
}

/** The accents every operator wears: shoulder patches and the spine rig (the visor is per head). */
function accents(add: ReturnType<typeof base>['add'], torso: THREE.Object3D, glow: THREE.Material, shoulderX: number, shoulderY: number, backZ: number) {
  for (const s of [-1, 1]) {
    // Patch on the outer face of each shoulder plate, readable front, back and side.
    add(torso, boxGeo(0.02, 0.1, 0.17), glow, s * (shoulderX + 0.115), shoulderY, 0.02);
  }
  // Spine rig: a segmented strip down the back plate.
  for (const y of [0.57, 0.44, 0.31]) add(torso, boxGeo(0.055, 0.1, 0.012), glow, 0, y, backZ - 0.006);
}

/** Rifleman operator: plate carrier, square helmet with a visor strip, the rifle. Faces +z. */
function buildOperator(team: TeamId, kit: OperatorKit): Rig {
  const { armorMat, clothMat, glowMat, parts, add, shared } = base(team, kit);
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 1.0, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, boxGeo(0.48, 0.6, 0.32), clothMat, 0, 0.34, 0);
  add(torso, boxGeo(0.46, 0.4, 0.1), armorMat, 0, 0.42, 0.18); // front plate
  add(torso, boxGeo(0.44, 0.42, 0.09), armorMat, 0, 0.42, -0.18); // back plate
  for (const x of [-0.13, 0, 0.13]) add(torso, boxGeo(0.11, 0.13, 0.07), shared.webbing, x, 0.24, 0.25); // mag pouches
  add(torso, boxGeo(0.16, 0.24, 0.1), shared.webbing, 0, 0.42, -0.27); // back pack
  for (const sx of [-1, 1]) add(torso, boxGeo(0.22, 0.13, 0.3), armorMat, sx * 0.33, 0.6, 0, 0, 0, sx * -0.22); // shoulder plates
  add(torso, boxGeo(0.5, 0.07, 0.34), shared.webbing, 0, 0.06, 0); // belt
  accents(add, torso, glowMat, 0.33, 0.6, -0.315);
  const head = pivot(torso, 0, 0.72, 0.02);
  add(head, boxGeo(0.22, 0.22, 0.24), clothMat, 0, 0.06, 0.0); // balaclava
  add(head, boxGeo(0.3, 0.17, 0.32), armorMat, 0, 0.2, -0.01); // square helmet
  add(head, boxGeo(0.25, 0.075, 0.05), shared.visor, 0, 0.12, 0.135); // visor glass
  add(head, boxGeo(0.22, 0.035, 0.012), glowMat, 0, 0.125, 0.162); // visor strip
  const armL = pivot(torso, 0.32, 0.55, 0);
  const armR = pivot(torso, -0.32, 0.55, 0);
  const foreL = pivot(armL, 0, -0.34, 0);
  const foreR = pivot(armR, 0, -0.34, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.13, 0.34, 0.13), clothMat, 0, -0.17, 0);
    add(f, boxGeo(0.11, 0.32, 0.11), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.1, 0.08, 0.1), shared.boots, 0, -0.33, 0); // gloves
  }
  armL.rotation.set(-0.9, 0, 0.2);
  foreL.rotation.set(-0.7, 0, 0);
  armR.rotation.set(-0.6, 0, -0.1);
  foreR.rotation.set(-1.1, 0, 0);
  const weapon = pivot(torso, 0.05, 0.3, 0.42);
  add(weapon, boxGeo(0.07, 0.11, 0.62), shared.gun, 0, 0, 0);
  add(weapon, cylGeo(0.018, 0.018, 0.26, 6), shared.gun, 0, 0.02, 0.44, Math.PI / 2);
  add(weapon, boxGeo(0.06, 0.18, 0.08), shared.gun, 0, -0.14, 0.12, 0.25);
  add(weapon, boxGeo(0.06, 0.1, 0.2), shared.gun, 0, -0.02, -0.36);
  const muzzle = pivot(weapon, 0, 0.02, 0.58);
  const legL = pivot(body, 0.15, 0, 0);
  const legR = pivot(body, -0.15, 0, 0);
  const kneeL = pivot(legL, 0, -0.48, 0);
  const kneeR = pivot(legR, 0, -0.48, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.17, 0.48, 0.19), clothMat, 0, -0.24, 0);
    add(l, boxGeo(0.1, 0.12, 0.05), shared.webbing, 0.06, -0.26, 0.1); // thigh pouch
    add(k, boxGeo(0.15, 0.46, 0.17), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.14, 0.12, 0.06), armorMat, 0, -0.04, 0.09); // knee pad
    add(k, boxGeo(0.16, 0.1, 0.28), shared.boots, 0, -0.47, 0.05);
  }
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, weapon, muzzle, armorMat, clothMat, glowMat, parts });
}

/** Light operator (the runner frame; a TDM roster substitutes gunners, so it is rarely seen). Faces +z. */
function buildLightOperator(team: TeamId, kit: OperatorKit): Rig {
  const { armorMat, clothMat, glowMat, parts, add, shared } = base(team, kit);
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 0.95, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, cylGeo(0.2, 0.15, 0.58, 7), clothMat, 0, 0.3, 0);
  add(torso, boxGeo(0.3, 0.24, 0.09), armorMat, 0, 0.4, 0.1);
  add(torso, boxGeo(0.28, 0.3, 0.08), armorMat, 0, 0.4, -0.13);
  for (const sx of [-1, 1]) add(torso, boxGeo(0.14, 0.1, 0.22), armorMat, sx * 0.24, 0.55, 0, 0, 0, sx * -0.25);
  accents(add, torso, glowMat, 0.22, 0.55, -0.17);
  const head = pivot(torso, 0, 0.62, 0.02);
  add(head, boxGeo(0.24, 0.24, 0.26), armorMat, 0, 0.1, 0);
  add(head, boxGeo(0.2, 0.035, 0.012), glowMat, 0, 0.1, 0.136);
  const armL = pivot(torso, 0.24, 0.5, 0);
  const armR = pivot(torso, -0.24, 0.5, 0);
  const foreL = pivot(armL, 0, -0.32, 0);
  const foreR = pivot(armR, 0, -0.32, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.09, 0.32, 0.09), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.08, 0.3, 0.08), clothMat, 0, -0.15, 0);
    add(f, boxGeo(0.012, 0.45, 0.05), shared.gun, 0, -0.42, 0.03); // blade (dark steel, not lit)
  }
  const legL = pivot(body, 0.11, 0, 0);
  const legR = pivot(body, -0.11, 0, 0);
  const kneeL = pivot(legL, 0, -0.46, 0);
  const kneeR = pivot(legR, 0, -0.46, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.13, 0.46, 0.14), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.105, 0.42, 0.11), clothMat, 0, -0.21, 0);
    add(k, boxGeo(0.12, 0.12, 0.24), shared.boots, 0, -0.43, 0.04);
  }
  const tail = pivot(body, 0, 0.6, -0.12);
  add(tail, boxGeo(0.18, 0.5, 0.02), shared.webbing, 0, -0.25, 0);
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, tail, armorMat, clothMat, glowMat, parts });
}

function operators(team: TeamId, kit: OperatorKit): EnemyLook {
  return {
    id: kit === 'night' ? `operator-${team}` : `operator-${kit}-${team}`,
    buildRunner: () => buildLightOperator(team, kit),
    buildGunner: () => buildOperator(team, kit),
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
