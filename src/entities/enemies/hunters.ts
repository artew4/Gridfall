import * as THREE from 'three';
import { boxGeo, cylGeo, mergeRig, pivot, type Rig } from '../../enemies/Models';
import type { EnemyLook } from '../types';

/*
  Deep Jungle: guerrilla hunters on the shared skeleton. Stalkers (runners): bare-armed, a red
  bandana, face paint, a machete. Trackers (gunners): a boonie hat, a chest rig, a rifle with a
  laser. Both wear woodland camo with tufts of leaves sewn onto the shoulders and back (a partial
  ghillie): opaque low-poly leaf clusters, no alpha. Per-enemy armour, cloth and glow materials are
  clones the Enemy flashes on hits and disposes; everything else is shared below.
*/

/** Woodland camo shared by every hunter's cloth (tiled; freed with the level, re-uploaded on use). */
function camo(base: string, blots: [string, number, number][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [col, n, r] of blots) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 128, y = rnd() * 128, rx = r * (0.6 + rnd() * 0.8), ry = r * (0.35 + rnd() * 0.5), a = rnd() * Math.PI;
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CAMO = camo('#4f5a35', [['#2a3420', 16, 14], ['#5f4a2e', 10, 12], ['#78784e', 8, 9], ['#1b2016', 10, 7]]);

const shared = {
  skin: new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.7 }),
  paint: new THREE.MeshStandardMaterial({ color: 0x1f2a18, roughness: 0.8 }),
  bandana: new THREE.MeshStandardMaterial({ color: 0x8e2219, roughness: 0.9 }),
  boots: new THREE.MeshStandardMaterial({ color: 0x2b2419, roughness: 0.9 }),
  webbing: new THREE.MeshStandardMaterial({ color: 0x3f4029, roughness: 0.9 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x1c1d1c, metalness: 0.6, roughness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8f918c, metalness: 0.85, roughness: 0.4 }),
  stock: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.75 }),
  leafA: new THREE.MeshStandardMaterial({ color: 0x3d5a22, roughness: 0.85, flatShading: true }),
  leafB: new THREE.MeshStandardMaterial({ color: 0x5a6b2a, roughness: 0.85, flatShading: true }),
};
for (const m of Object.values(shared)) m.userData.shared = true;

/** A tuft of leaves: a few flattened, splayed pyramids (opaque, flat-shaded) around a point. */
let tuftGeo: THREE.BufferGeometry | null = null;
function tuft() {
  if (tuftGeo) return tuftGeo;
  const leaf = new THREE.ConeGeometry(0.05, 0.2, 3);
  leaf.scale(1, 1, 0.35);
  leaf.translate(0, 0.1, 0);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.4;
    m.makeRotationFromEuler(new THREE.Euler(Math.cos(a) * 0.9, a, Math.sin(a) * 0.9));
    parts.push(leaf.clone().applyMatrix4(m));
  }
  leaf.dispose();
  // Non-indexed so it merges with the rig's other parts.
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const p of parts) {
    const n = p.index ? p.toNonIndexed() : p;
    pos.push(...(n.attributes.position.array as Float32Array));
    if (n !== p) n.dispose();
    p.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  merged.userData.shared = true;
  tuftGeo = merged;
  return merged;
}

const RUNNER_BLOOD = new THREE.Color(0.5, 0.12, 0.08);
const GUNNER_BLOOD = new THREE.Color(0.42, 0.14, 0.08);

function base(armor: number, glow: THREE.Color) {
  const armorMat = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.85, metalness: 0.05 });
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
  /** Leaf tufts along a shoulder or a back (scaled, alternating greens). */
  const leaves = (parent: THREE.Object3D, pts: [number, number, number, number][]) => {
    pts.forEach(([x, y, z, s], i) => {
      const m = add(parent, tuft(), i % 2 ? shared.leafA : shared.leafB, x, y, z, 0, i * 1.3, 0);
      m.scale.setScalar(s);
    });
  };
  return { armorMat, clothMat, glowMat, parts, add, leaves };
}

/** Stalker: fast, bare forearms, red bandana, painted face, machete; leaves on the shoulders. Faces +z. */
function buildStalker(): Rig {
  // The eyes catch the light through the paint: a faint warm glint.
  const { armorMat, clothMat, glowMat, parts, add, leaves } = base(0x3a3a26, new THREE.Color(0.3, 0.22, 0.1));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 0.95, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, cylGeo(0.2, 0.15, 0.58, 7), clothMat, 0, 0.3, 0);
  add(torso, boxGeo(0.06, 0.62, 0.03), shared.webbing, 0.08, 0.32, 0.13, 0, 0, -0.5); // sling
  add(torso, boxGeo(0.34, 0.06, 0.26), shared.webbing, 0, 0.04, 0); // belt
  add(torso, boxGeo(0.12, 0.12, 0.08), armorMat, -0.13, 0.06, 0.13); // pouch
  leaves(torso, [[0.2, 0.58, 0, 1.1], [-0.2, 0.58, 0, 1.1], [0.1, 0.62, -0.1, 0.9], [-0.1, 0.62, -0.1, 0.9], [0, 0.5, -0.17, 1]]);
  const head = pivot(torso, 0, 0.62, 0.02);
  add(head, new THREE.SphereGeometry(0.12, 9, 7), shared.skin, 0, 0.1, 0.0);
  add(head, boxGeo(0.2, 0.06, 0.06), shared.paint, 0, 0.11, 0.09); // face paint band across the eyes
  add(head, boxGeo(0.05, 0.02, 0.01), glowMat, -0.045, 0.12, 0.122);
  add(head, boxGeo(0.05, 0.02, 0.01), glowMat, 0.045, 0.12, 0.122);
  add(head, boxGeo(0.26, 0.05, 0.25), shared.bandana, 0, 0.17, 0); // bandana
  add(head, boxGeo(0.04, 0.16, 0.012), shared.bandana, 0.03, 0.08, -0.13, 0.3, 0, 0.2); // knot tails
  add(head, boxGeo(0.04, 0.14, 0.012), shared.bandana, -0.03, 0.09, -0.13, 0.25, 0, -0.25);
  const armL = pivot(torso, 0.24, 0.5, 0);
  const armR = pivot(torso, -0.24, 0.5, 0);
  const foreL = pivot(armL, 0, -0.32, 0);
  const foreR = pivot(armR, 0, -0.32, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.09, 0.32, 0.09), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.075, 0.3, 0.075), shared.skin, 0, -0.15, 0);
  }
  add(foreR, boxGeo(0.03, 0.1, 0.04), shared.stock, 0, -0.32, 0.02);
  add(foreR, boxGeo(0.012, 0.52, 0.065), shared.steel, 0, -0.62, 0.045);
  const legL = pivot(body, 0.11, 0, 0);
  const legR = pivot(body, -0.11, 0, 0);
  const kneeL = pivot(legL, 0, -0.46, 0);
  const kneeR = pivot(legR, 0, -0.46, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.13, 0.46, 0.14), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.105, 0.42, 0.11), clothMat, 0, -0.21, 0);
    add(k, boxGeo(0.12, 0.16, 0.24), shared.boots, 0, -0.41, 0.04);
  }
  // A strip of camo netting with leaves hanging down the back (sways like the runner's cloak).
  const tail = pivot(body, 0, 0.6, -0.15);
  add(tail, boxGeo(0.22, 0.6, 0.02), clothMat, 0, -0.3, 0);
  leaves(tail, [[0.05, -0.15, -0.03, 0.8], [-0.06, -0.38, -0.03, 0.75]]);
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, tail, armorMat, clothMat, glowMat, parts });
}

/** Tracker: boonie hat, chest rig, a wooden-stocked rifle with a laser; leafy shoulders. Faces +z. */
function buildTracker(): Rig {
  // The glow is the rifle's laser module: small and red.
  const { armorMat, clothMat, glowMat, parts, add, leaves } = base(0x46472c, new THREE.Color(1.6, 0.18, 0.1));
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const body = pivot(root, 0, 1.0, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, boxGeo(0.48, 0.6, 0.32), clothMat, 0, 0.34, 0);
  add(torso, boxGeo(0.46, 0.34, 0.1), armorMat, 0, 0.38, 0.18); // chest rig
  for (const x of [-0.13, 0, 0.13]) add(torso, boxGeo(0.11, 0.13, 0.07), shared.webbing, x, 0.26, 0.25); // mag pouches
  add(torso, boxGeo(0.3, 0.36, 0.14), shared.webbing, 0, 0.42, -0.23); // pack
  add(torso, boxGeo(0.5, 0.07, 0.34), shared.webbing, 0, 0.06, 0); // belt
  leaves(torso, [[0.27, 0.66, 0, 1.25], [-0.27, 0.66, 0, 1.25], [0.15, 0.7, -0.12, 1], [-0.15, 0.7, -0.12, 1], [0, 0.62, -0.3, 1.1], [0.22, 0.5, -0.2, 0.9]]);
  const head = pivot(torso, 0, 0.72, 0.02);
  add(head, boxGeo(0.21, 0.24, 0.23), shared.skin, 0, 0.07, 0.01);
  add(head, boxGeo(0.22, 0.07, 0.04), shared.paint, 0, 0.1, 0.12); // face paint
  add(head, cylGeo(0.13, 0.14, 0.11, 10), clothMat, 0, 0.22, 0); // boonie crown
  add(head, cylGeo(0.24, 0.24, 0.02, 12), clothMat, 0, 0.17, 0); // brim
  leaves(head, [[0.12, 0.24, 0.02, 0.6], [-0.1, 0.25, -0.06, 0.55]]);
  const armL = pivot(torso, 0.32, 0.55, 0);
  const armR = pivot(torso, -0.32, 0.55, 0);
  const foreL = pivot(armL, 0, -0.34, 0);
  const foreR = pivot(armR, 0, -0.34, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.13, 0.34, 0.13), clothMat, 0, -0.17, 0);
    add(f, boxGeo(0.11, 0.32, 0.11), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.1, 0.08, 0.1), shared.skin, 0, -0.33, 0);
  }
  armL.rotation.set(-0.9, 0, 0.2);
  foreL.rotation.set(-0.7, 0, 0);
  armR.rotation.set(-0.6, 0, -0.1);
  foreR.rotation.set(-1.1, 0, 0);
  const weapon = pivot(torso, 0.05, 0.3, 0.42);
  add(weapon, boxGeo(0.07, 0.1, 0.5), shared.gunMetal, 0, 0, 0);
  add(weapon, cylGeo(0.018, 0.018, 0.3, 6), shared.gunMetal, 0, 0.02, 0.4, Math.PI / 2);
  add(weapon, boxGeo(0.06, 0.2, 0.08), shared.gunMetal, 0, -0.14, 0.1, 0.4); // curved magazine
  add(weapon, boxGeo(0.06, 0.06, 0.24), shared.stock, 0, -0.01, 0.2); // wooden handguard
  add(weapon, boxGeo(0.06, 0.11, 0.24), shared.stock, 0, -0.03, -0.34); // wooden stock
  add(weapon, boxGeo(0.04, 0.04, 0.07), shared.webbing, 0.05, 0.03, 0.2);
  add(weapon, boxGeo(0.012, 0.012, 0.012), glowMat, 0.05, 0.03, 0.24); // laser emitter
  const muzzle = pivot(weapon, 0, 0.02, 0.56);
  const legL = pivot(body, 0.15, 0, 0);
  const legR = pivot(body, -0.15, 0, 0);
  const kneeL = pivot(legL, 0, -0.48, 0);
  const kneeR = pivot(legR, 0, -0.48, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.17, 0.48, 0.19), clothMat, 0, -0.24, 0);
    add(l, boxGeo(0.1, 0.12, 0.05), clothMat, 0.06, -0.26, 0.1); // cargo pocket
    add(k, boxGeo(0.15, 0.46, 0.17), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.16, 0.18, 0.28), shared.boots, 0, -0.44, 0.05);
  }
  return mergeRig({ root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, weapon, muzzle, armorMat, clothMat, glowMat, parts });
}

/** Deep Jungle survival enemies. */
export const JUNGLE_HUNTERS: EnemyLook = {
  id: 'hunters',
  buildRunner: buildStalker,
  buildGunner: buildTracker,
  runnerAccent: RUNNER_BLOOD,
  gunnerAccent: GUNNER_BLOOD,
  organic: true,
  // Rifle tracers: thin, yellow-orange.
  bolt: { core: [6.5, 4, 1.2], trail: [1.2, 0.8, 0.2], size: 0.5 },
  voice: 'human',
};
