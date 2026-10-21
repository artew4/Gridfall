import * as THREE from 'three';
import { boxGeo, cylGeo, mergeRig, pivot, type Rig } from '../../enemies/Models';
import type { EnemyLook } from '../types';

/*
  Deep Jungle (3.7): the garrison of Firebase Viper, a paramilitary guard force on the shared
  skeleton. Disciplined palette: olive drab fatigues in a dark tiger-stripe, black plate carriers,
  helmets, gloves and boots. Breachers (runners): a black balaclava under the helmet, amber
  goggles, knee pads, a short black machete and a sidearm on the thigh. Riflemen (gunners): a
  helmet with a night-vision mount and a headset, a radio with a whip antenna, a black rifle with an
  optic and a laser. Per-enemy armour, cloth and glow materials are clones the Enemy flashes on hits
  and disposes; everything else is shared below.
*/

/** Dark tiger stripe on olive drab (tiled; freed with the level, re-uploaded on use). */
function stripes(base: string, bands: [string, number, number][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  let seed = 47;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [col, n, w] of bands) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      // A horizontal brush stroke that tapers at both ends, wrapped across the tile edges.
      const x = rnd() * 128, y = rnd() * 128, len = 26 + rnd() * 40, th = w * (0.5 + rnd() * 0.6), tilt = (rnd() - 0.5) * 0.5;
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.quadraticCurveTo(x + dx + len / 2, y + dy - th + tilt * len, x + dx + len, y + dy + tilt * len);
        g.quadraticCurveTo(x + dx + len / 2, y + dy + th + tilt * len, x + dx, y + dy);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CAMO = stripes('#4a4f33', [['#1c1f17', 22, 5], ['#2f3524', 14, 6], ['#5c5a3e', 8, 3]]);

const shared = {
  skin: new THREE.MeshStandardMaterial({ color: 0x7a5640, roughness: 0.7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.8 }),
  carrier: new THREE.MeshStandardMaterial({ color: 0x1f2120, roughness: 0.85 }),
  webbing: new THREE.MeshStandardMaterial({ color: 0x353a28, roughness: 0.9 }),
  boots: new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 0.85 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x141516, metalness: 0.5, roughness: 0.5 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x232524, roughness: 0.65 }),
  blade: new THREE.MeshStandardMaterial({ color: 0x2b2d2e, metalness: 0.7, roughness: 0.45 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x0c1410, metalness: 0.4, roughness: 0.2 }),
  patch: new THREE.MeshStandardMaterial({ color: 0x8a7a3a, roughness: 0.8 }),
};
for (const m of Object.values(shared)) m.userData.shared = true;

const RUNNER_BLOOD = new THREE.Color(0.5, 0.12, 0.08);
const GUNNER_BLOOD = new THREE.Color(0.42, 0.14, 0.08);

/** The helmet's dome (half sphere), shared. */
let domeGeo: THREE.BufferGeometry | null = null;
function dome() {
  if (domeGeo) return domeGeo;
  domeGeo = new THREE.SphereGeometry(0.155, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.userData.shared = true;
  return domeGeo;
}

function base(armor: number, glow: THREE.Color) {
  // The helmet shell and plates take the armour material (it flashes on hits); fatigues are the cloth.
  const armorMat = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.7, metalness: 0.1 });
  const clothMat = new THREE.MeshStandardMaterial({ map: CAMO, color: 0xffffff, roughness: 0.92 });
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
  /** Helmet: dome, brim band, side rails. */
  const helmet = (head: THREE.Object3D, y: number) => {
    add(head, dome(), armorMat, 0, y, 0);
    add(head, cylGeo(0.158, 0.162, 0.05, 12), armorMat, 0, y - 0.005, 0);
    for (const s of [-1, 1]) add(head, boxGeo(0.015, 0.035, 0.12), shared.black, s * 0.158, y + 0.02, 0);
  };
  /** Plate carrier: front and back plates, cummerbund, three mag pouches up front. */
  const carrier = (torso: THREE.Object3D, w: number, y: number, z: number) => {
    add(torso, boxGeo(w, 0.36, 0.08), shared.carrier, 0, y, z);
    add(torso, boxGeo(w, 0.38, 0.07), shared.carrier, 0, y + 0.01, -z);
    add(torso, boxGeo(w + 0.04, 0.14, z * 2 - 0.02), shared.carrier, 0, y - 0.1, 0);
    for (const x of [-0.12, 0, 0.12]) add(torso, boxGeo(0.1, 0.13, 0.06), shared.webbing, x, y - 0.06, z + 0.06);
    add(torso, boxGeo(0.12, 0.05, 0.01), shared.patch, -0.1, y + 0.12, z + 0.045); // unit patch
  };
  return { armorMat, clothMat, glowMat, parts, add, helmet, carrier };
}

/** Breacher: fast; helmet over a black balaclava, amber goggles, plate carrier, a black machete. Faces +z. */
function buildBreacher(): Rig {
  // The goggles catch the light: a dim amber glint.
  const { armorMat, clothMat, glowMat, parts, add, helmet, carrier } = base(0x2f3324, new THREE.Color(0.55, 0.32, 0.06));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 0.95, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, cylGeo(0.2, 0.16, 0.58, 8), clothMat, 0, 0.3, 0);
  carrier(torso, 0.36, 0.36, 0.15);
  add(torso, boxGeo(0.36, 0.06, 0.28), shared.webbing, 0, 0.04, 0); // belt
  const head = pivot(torso, 0, 0.62, 0.02);
  add(head, new THREE.SphereGeometry(0.12, 9, 7), shared.black, 0, 0.1, 0); // balaclava
  add(head, boxGeo(0.2, 0.05, 0.05), shared.black, 0, 0.115, 0.095); // goggle strap and frame
  add(head, boxGeo(0.07, 0.035, 0.012), glowMat, -0.045, 0.118, 0.122);
  add(head, boxGeo(0.07, 0.035, 0.012), glowMat, 0.045, 0.118, 0.122);
  helmet(head, 0.15);
  const armL = pivot(torso, 0.24, 0.5, 0);
  const armR = pivot(torso, -0.24, 0.5, 0);
  const foreL = pivot(armL, 0, -0.32, 0);
  const foreR = pivot(armR, 0, -0.32, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.1, 0.32, 0.1), clothMat, 0, -0.16, 0);
    add(a, boxGeo(0.11, 0.1, 0.11), shared.carrier, 0, -0.06, 0); // shoulder pad
    add(f, boxGeo(0.085, 0.3, 0.085), clothMat, 0, -0.15, 0);
    add(f, boxGeo(0.09, 0.08, 0.09), shared.black, 0, -0.31, 0); // glove
  }
  add(foreR, boxGeo(0.03, 0.1, 0.04), shared.black, 0, -0.33, 0.02);
  add(foreR, boxGeo(0.012, 0.46, 0.06), shared.blade, 0, -0.6, 0.045);
  const legL = pivot(body, 0.11, 0, 0);
  const legR = pivot(body, -0.11, 0, 0);
  const kneeL = pivot(legL, 0, -0.46, 0);
  const kneeR = pivot(legR, 0, -0.46, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.14, 0.46, 0.15), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.11, 0.42, 0.115), clothMat, 0, -0.21, 0);
    add(k, boxGeo(0.12, 0.12, 0.05), armorMat, 0, -0.04, 0.07); // knee pad
    add(k, boxGeo(0.12, 0.16, 0.24), shared.boots, 0, -0.41, 0.04);
  }
  add(legR, boxGeo(0.06, 0.18, 0.12), shared.black, -0.09, -0.2, 0); // thigh holster
  // A short dump pouch / admin flap down the back (sways like a cloak tail).
  const tail = pivot(body, 0, 0.36, -0.17);
  add(tail, boxGeo(0.2, 0.26, 0.04), shared.carrier, 0, -0.13, 0);
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, tail, armorMat, clothMat, glowMat, parts });
}

/** Rifleman: helmet with an NVG mount and headset, plate carrier, radio, black rifle with optic and laser. Faces +z. */
function buildRifleman(): Rig {
  // The glow is the rifle's laser module: small and red.
  const { armorMat, clothMat, glowMat, parts, add, helmet, carrier } = base(0x30352a, new THREE.Color(1.6, 0.18, 0.1));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 1.0, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, boxGeo(0.46, 0.6, 0.3), clothMat, 0, 0.34, 0);
  carrier(torso, 0.48, 0.4, 0.18);
  add(torso, boxGeo(0.14, 0.24, 0.1), shared.webbing, 0.12, 0.42, -0.26); // radio
  add(torso, cylGeo(0.006, 0.006, 0.55, 4), shared.black, 0.16, 0.8, -0.27); // whip antenna
  add(torso, boxGeo(0.5, 0.07, 0.34), shared.webbing, 0, 0.06, 0); // belt
  const head = pivot(torso, 0, 0.72, 0.02);
  add(head, boxGeo(0.2, 0.23, 0.22), shared.skin, 0, 0.07, 0.01);
  add(head, boxGeo(0.21, 0.12, 0.02), shared.black, 0, 0.02, 0.12); // face mask (lower)
  helmet(head, 0.16);
  add(head, boxGeo(0.06, 0.05, 0.05), shared.black, 0, 0.21, 0.15); // NVG mount
  add(head, boxGeo(0.09, 0.04, 0.07), shared.lens, 0, 0.255, 0.16); // flipped-up tubes
  for (const s of [-1, 1]) add(head, cylGeo(0.045, 0.045, 0.04, 8), shared.black, s * 0.12, 0.08, 0, 0, 0, Math.PI / 2); // headset cups
  const armL = pivot(torso, 0.31, 0.55, 0);
  const armR = pivot(torso, -0.31, 0.55, 0);
  const foreL = pivot(armL, 0, -0.34, 0);
  const foreR = pivot(armR, 0, -0.34, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.13, 0.34, 0.13), clothMat, 0, -0.17, 0);
    add(f, boxGeo(0.11, 0.32, 0.11), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.1, 0.08, 0.1), shared.black, 0, -0.33, 0); // glove
  }
  armL.rotation.set(-0.9, 0, 0.2);
  foreL.rotation.set(-0.7, 0, 0);
  armR.rotation.set(-0.6, 0, -0.1);
  foreR.rotation.set(-1.1, 0, 0);
  const weapon = pivot(torso, 0.05, 0.3, 0.42);
  add(weapon, boxGeo(0.07, 0.1, 0.5), shared.gunMetal, 0, 0, 0);
  add(weapon, cylGeo(0.018, 0.018, 0.3, 6), shared.gunMetal, 0, 0.02, 0.4, Math.PI / 2);
  add(weapon, boxGeo(0.055, 0.17, 0.07), shared.polymer, 0, -0.12, 0.08, 0.15); // straight magazine
  add(weapon, boxGeo(0.07, 0.07, 0.26), shared.polymer, 0, 0, 0.22); // rail handguard
  add(weapon, boxGeo(0.06, 0.1, 0.22), shared.polymer, 0, -0.02, -0.34); // stock
  add(weapon, boxGeo(0.045, 0.05, 0.12), shared.black, 0, 0.08, -0.02); // optic
  add(weapon, boxGeo(0.035, 0.035, 0.01), shared.lens, 0, 0.08, 0.041);
  add(weapon, boxGeo(0.04, 0.04, 0.07), shared.black, 0.05, 0.02, 0.22);
  add(weapon, boxGeo(0.012, 0.012, 0.012), glowMat, 0.05, 0.02, 0.26); // laser emitter
  const muzzle = pivot(weapon, 0, 0.02, 0.56);
  const legL = pivot(body, 0.15, 0, 0);
  const legR = pivot(body, -0.15, 0, 0);
  const kneeL = pivot(legL, 0, -0.48, 0);
  const kneeR = pivot(legR, 0, -0.48, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.17, 0.48, 0.19), clothMat, 0, -0.24, 0);
    add(l, boxGeo(0.1, 0.12, 0.05), clothMat, 0.06, -0.26, 0.1); // cargo pocket
    add(k, boxGeo(0.15, 0.46, 0.17), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.15, 0.13, 0.05), armorMat, 0, -0.04, 0.09); // knee pad
    add(k, boxGeo(0.16, 0.18, 0.28), shared.boots, 0, -0.44, 0.05);
  }
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, weapon, muzzle, armorMat, clothMat, glowMat, parts });
}

/** Deep Jungle survival enemies: the Firebase Viper garrison. */
export const JUNGLE_GUARDS: EnemyLook = {
  id: 'guards',
  buildRunner: buildBreacher,
  buildGunner: buildRifleman,
  runnerAccent: RUNNER_BLOOD,
  gunnerAccent: GUNNER_BLOOD,
  organic: true,
  // Rifle tracers: thin, yellow-orange.
  bolt: { core: [6.5, 4, 1.2], trail: [1.2, 0.8, 0.2], size: 0.5 },
  ballistic: 'kinetic',
  voice: 'human',
};
