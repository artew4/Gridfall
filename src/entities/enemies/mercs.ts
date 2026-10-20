import * as THREE from 'three';
import { boxGeo, cylGeo, mergeRig, pivot, type Rig } from '../../enemies/Models';
import type { EnemyLook } from '../types';

/*
  Desert Outpost: scavengers (runners) and contractors (gunners). Same skeleton as the neon rigs (the
  pivots the animation drives), human gear instead of glowing armour: sand-dusted cloth, plate
  carriers, helmets and goggles, a machete and a rifle. The per-enemy materials (armour, cloth, glow)
  are clones the Enemy flashes on hits and disposes; everything else is shared below.
*/

const shared = {
  leather: new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.85 }),
  boots: new THREE.MeshStandardMaterial({ color: 0x3b3024, roughness: 0.9 }),
  wrap: new THREE.MeshStandardMaterial({ color: 0xc8b48c, roughness: 0.95 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x7a6e52, roughness: 0.92 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x1e1f21, metalness: 0.6, roughness: 0.45 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9a9894, metalness: 0.85, roughness: 0.35 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x1a2421, metalness: 0.3, roughness: 0.08, envMapIntensity: 1.6 }),
  pads: new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.8 }),
};

for (const m of Object.values(shared)) m.userData.shared = true;

const RUNNER_DUST = new THREE.Color(0.55, 0.42, 0.28);
const GUNNER_DUST = new THREE.Color(0.48, 0.4, 0.3);

function base(armor: number, cloth: number, glow: THREE.Color) {
  const armorMat = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.8, metalness: 0.05 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.92 });
  const glowMat = new THREE.MeshBasicMaterial({ color: glow });
  const parts: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    parts.push(m);
    return m;
  };
  return { armorMat, clothMat, glowMat, parts, add };
}

/** Scavenger: fast and light, head wrapped against the sand, goggles, a machete. Faces +z. */
function buildScavenger(): Rig {
  // Goggle lenses catch the light: a dim warm glint, not a glow.
  const { armorMat, clothMat, glowMat, parts, add } = base(0x4f3f2b, 0x8a7556, new THREE.Color(0.32, 0.2, 0.08));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 0.95, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, cylGeo(0.2, 0.15, 0.58, 7), clothMat, 0, 0.3, 0);
  add(torso, boxGeo(0.3, 0.24, 0.09), armorMat, 0, 0.4, 0.1); // chest rig
  add(torso, boxGeo(0.06, 0.6, 0.03), shared.leather, 0, 0.32, 0.14, 0, 0, 0.6); // bandolier
  add(torso, boxGeo(0.34, 0.06, 0.26), shared.leather, 0, 0.04, 0); // belt
  const head = pivot(torso, 0, 0.62, 0.02);
  // Shemagh: a rounded wrap over the head, a face covering, a tail of cloth down the back.
  add(head, new THREE.SphereGeometry(0.135, 9, 7), shared.wrap, 0, 0.12, 0.0);
  add(head, boxGeo(0.22, 0.11, 0.22), shared.wrap, 0, 0.02, 0.02);
  add(head, boxGeo(0.16, 0.2, 0.03), shared.wrap, 0, -0.04, -0.12, 0.2);
  add(head, boxGeo(0.2, 0.06, 0.05), shared.lens, 0, 0.11, 0.13); // goggles
  add(head, boxGeo(0.07, 0.035, 0.01), glowMat, -0.05, 0.11, 0.157);
  add(head, boxGeo(0.07, 0.035, 0.01), glowMat, 0.05, 0.11, 0.157);
  add(head, boxGeo(0.23, 0.02, 0.2), shared.leather, 0, 0.11, 0.03); // strap
  const armL = pivot(torso, 0.24, 0.5, 0);
  const armR = pivot(torso, -0.24, 0.5, 0);
  const foreL = pivot(armL, 0, -0.32, 0);
  const foreR = pivot(armR, 0, -0.32, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.09, 0.32, 0.09), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.08, 0.3, 0.08), shared.wrap, 0, -0.15, 0);
  }
  // Machete in the right hand, a short blade in the left.
  add(foreR, boxGeo(0.03, 0.1, 0.04), shared.leather, 0, -0.32, 0.02);
  add(foreR, boxGeo(0.012, 0.5, 0.06), shared.steel, 0, -0.6, 0.04);
  add(foreL, boxGeo(0.012, 0.24, 0.04), shared.steel, 0, -0.42, 0.03);
  const legL = pivot(body, 0.11, 0, 0);
  const legR = pivot(body, -0.11, 0, 0);
  const kneeL = pivot(legL, 0, -0.46, 0);
  const kneeR = pivot(legR, 0, -0.46, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.13, 0.46, 0.14), shared.pants, 0, -0.23, 0);
    add(k, boxGeo(0.105, 0.42, 0.11), shared.pants, 0, -0.21, 0);
    add(k, boxGeo(0.12, 0.12, 0.24), shared.boots, 0, -0.43, 0.04);
  }
  // A long scarf streaming behind (sways like the runner's cloak).
  const tail = pivot(body, 0, 0.62, -0.12);
  add(tail, boxGeo(0.2, 0.75, 0.02), shared.wrap, 0, -0.37, 0);
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, tail, armorMat, clothMat, glowMat, parts });
}

/** Contractor: plate carrier, helmet with goggles, face wrap, a black rifle with a laser module. Faces +z. */
function buildContractor(): Rig {
  // The glow is the rifle's laser module and the helmet's IR strobe: small and red.
  const { armorMat, clothMat, glowMat, parts, add } = base(0x7d6a4a, 0x6b6748, new THREE.Color(1.6, 0.18, 0.1));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 1.0, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, boxGeo(0.48, 0.6, 0.32), clothMat, 0, 0.34, 0);
  add(torso, boxGeo(0.46, 0.4, 0.1), armorMat, 0, 0.42, 0.18); // front plate
  add(torso, boxGeo(0.44, 0.42, 0.09), armorMat, 0, 0.42, -0.18); // back plate
  for (const x of [-0.13, 0, 0.13]) add(torso, boxGeo(0.11, 0.13, 0.07), armorMat, x, 0.24, 0.25); // mag pouches
  add(torso, boxGeo(0.12, 0.18, 0.08), shared.pads, 0.17, 0.48, -0.25); // radio
  add(torso, cylGeo(0.006, 0.006, 0.45, 4), shared.gunMetal, 0.17, 0.78, -0.25);
  for (const sx of [-1, 1]) add(torso, boxGeo(0.2, 0.12, 0.28), clothMat, sx * 0.33, 0.6, 0, 0, 0, sx * -0.25);
  add(torso, boxGeo(0.5, 0.07, 0.34), shared.leather, 0, 0.06, 0); // belt
  const head = pivot(torso, 0, 0.72, 0.02);
  add(head, boxGeo(0.22, 0.24, 0.24), shared.wrap, 0, 0.08, 0.01); // face wrap
  add(head, new THREE.SphereGeometry(0.16, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), armorMat, 0, 0.17, 0); // helmet
  add(head, boxGeo(0.33, 0.04, 0.33), armorMat, 0, 0.17, 0);
  add(head, boxGeo(0.21, 0.065, 0.06), shared.lens, 0, 0.13, 0.14); // goggles
  add(head, boxGeo(0.04, 0.03, 0.03), glowMat, 0, 0.3, -0.12); // IR strobe
  const armL = pivot(torso, 0.32, 0.55, 0);
  const armR = pivot(torso, -0.32, 0.55, 0);
  const foreL = pivot(armL, 0, -0.34, 0);
  const foreR = pivot(armR, 0, -0.34, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.13, 0.34, 0.13), clothMat, 0, -0.17, 0);
    add(f, boxGeo(0.11, 0.32, 0.11), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.1, 0.08, 0.1), shared.pads, 0, -0.33, 0); // gloves
  }
  armL.rotation.set(-0.9, 0, 0.2);
  foreL.rotation.set(-0.7, 0, 0);
  armR.rotation.set(-0.6, 0, -0.1);
  foreR.rotation.set(-1.1, 0, 0);
  const weapon = pivot(torso, 0.05, 0.3, 0.42);
  add(weapon, boxGeo(0.07, 0.11, 0.62), shared.gunMetal, 0, 0, 0);
  add(weapon, cylGeo(0.018, 0.018, 0.26, 6), shared.gunMetal, 0, 0.02, 0.44, Math.PI / 2);
  add(weapon, boxGeo(0.06, 0.18, 0.08), shared.gunMetal, 0, -0.14, 0.12, 0.25); // magazine
  add(weapon, boxGeo(0.06, 0.1, 0.2), armorMat, 0, -0.02, -0.36); // stock
  add(weapon, boxGeo(0.04, 0.04, 0.08), shared.pads, 0.05, 0.03, 0.2);
  add(weapon, boxGeo(0.012, 0.012, 0.012), glowMat, 0.05, 0.03, 0.245); // laser emitter
  const muzzle = pivot(weapon, 0, 0.02, 0.58);
  const legL = pivot(body, 0.15, 0, 0);
  const legR = pivot(body, -0.15, 0, 0);
  const kneeL = pivot(legL, 0, -0.48, 0);
  const kneeR = pivot(legR, 0, -0.48, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.17, 0.48, 0.19), shared.pants, 0, -0.24, 0);
    add(l, boxGeo(0.1, 0.12, 0.05), shared.pants, 0.06, -0.26, 0.1); // cargo pocket
    add(k, boxGeo(0.15, 0.46, 0.17), shared.pants, 0, -0.23, 0);
    add(k, boxGeo(0.14, 0.12, 0.06), shared.pads, 0, -0.04, 0.09); // knee pad
    add(k, boxGeo(0.16, 0.1, 0.28), shared.boots, 0, -0.47, 0.05);
  }
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, weapon, muzzle, armorMat, clothMat, glowMat, parts });
}

/** Desert Outpost survival enemies. */
export const DESERT_MERCS: EnemyLook = {
  id: 'mercs',
  buildRunner: buildScavenger,
  buildGunner: buildContractor,
  runnerAccent: RUNNER_DUST,
  gunnerAccent: GUNNER_DUST,
  organic: true,
  // Rifle tracers: thin, hot orange, no plasma glow trail.
  bolt: { core: [7, 3.2, 0.9], trail: [1.4, 0.6, 0.15], size: 0.55 },
  voice: 'human',
};
