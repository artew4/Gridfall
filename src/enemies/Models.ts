import * as THREE from 'three';

export interface Rig {
  root: THREE.Group;
  body: THREE.Group; // lean / hit reaction pivot at hips
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  tail?: THREE.Group;
  weapon?: THREE.Group;
  muzzle?: THREE.Object3D;
  armorMat: THREE.MeshStandardMaterial;
  clothMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
  parts: THREE.Mesh[];
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number) {
  const k = `b${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}
function cylGeo(rt: number, rb: number, h: number, seg: number) {
  const k = `c${rt},${rb},${h},${seg}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg)));
  return g;
}

const sharedArmor = {
  runner: new THREE.MeshStandardMaterial({ color: 0x1b1c22, metalness: 0.7, roughness: 0.35, envMapIntensity: 1.2 }),
  gunner: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.75, roughness: 0.3, envMapIntensity: 1.3 }),
};
const sharedCloth = {
  runner: new THREE.MeshStandardMaterial({ color: 0x0e0d12, roughness: 0.85, metalness: 0.05 }),
  gunner: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.8, metalness: 0.1 }),
};
export const RUNNER_ACCENT = new THREE.Color(1.0, 0.08, 0.15);
export const GUNNER_ACCENT = new THREE.Color(1.0, 0.55, 0.08);

function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function makeRigBase(kind: 'runner' | 'gunner') {
  const armorMat = sharedArmor[kind].clone();
  const clothMat = sharedCloth[kind].clone();
  const accent = kind === 'runner' ? RUNNER_ACCENT : GUNNER_ACCENT;
  const glowMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(4) });
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

/** Lean hooded blade-runner: fast, low, red slit visor and glowing forearm blades. Faces +z. */
export function buildRunner(): Rig {
  const { armorMat, clothMat, glowMat, parts, add } = makeRigBase('runner');
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.95, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, cylGeo(0.2, 0.14, 0.58, 6), clothMat, 0, 0.3, 0);
  add(torso, boxGeo(0.3, 0.22, 0.1), armorMat, 0, 0.42, 0.1);
  add(torso, boxGeo(0.04, 0.3, 0.02), glowMat, 0, 0.3, 0.155); // spine light seen from front
  const head = pivot(torso, 0, 0.62, 0.02);
  add(head, cylGeo(0.07, 0.2, 0.38, 7), clothMat, 0, 0.1, -0.02); // hood
  add(head, new THREE.SphereGeometry(0.12, 8, 6), armorMat, 0, 0.06, 0.04);
  add(head, boxGeo(0.17, 0.026, 0.03), glowMat, 0, 0.07, 0.15);
  const armL = pivot(torso, 0.24, 0.5, 0);
  const armR = pivot(torso, -0.24, 0.5, 0);
  const foreL = pivot(armL, 0, -0.32, 0);
  const foreR = pivot(armR, 0, -0.32, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.085, 0.32, 0.085), clothMat, 0, -0.16, 0);
    add(f, boxGeo(0.075, 0.3, 0.075), armorMat, 0, -0.15, 0);
    add(f, boxGeo(0.014, 0.55, 0.055), glowMat, 0, -0.42, 0.02); // blade
  }
  const legL = pivot(body, 0.11, 0, 0);
  const legR = pivot(body, -0.11, 0, 0);
  const kneeL = pivot(legL, 0, -0.46, 0);
  const kneeR = pivot(legR, 0, -0.46, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.12, 0.46, 0.13), clothMat, 0, -0.23, 0);
    add(k, boxGeo(0.095, 0.46, 0.1), armorMat, 0, -0.23, 0);
    add(k, boxGeo(0.02, 0.2, 0.02), glowMat, 0, -0.2, 0.055);
    add(k, boxGeo(0.1, 0.06, 0.22), armorMat, 0, -0.47, 0.05);
  }
  const tail = pivot(body, 0, 0.05, -0.13);
  add(tail, boxGeo(0.42, 0.7, 0.02), clothMat, 0, -0.35, 0);
  return { root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, tail, armorMat, clothMat, glowMat, parts };
}

/** Heavy armoured gunner: broad shoulders, amber visor, shoulder lamp and a long rifle. Faces +z. */
export function buildGunner(): Rig {
  const { armorMat, clothMat, glowMat, parts, add } = makeRigBase('gunner');
  const root = new THREE.Group();
  const body = pivot(root, 0, 1.0, 0);
  const torso = pivot(body, 0, 0, 0);
  add(torso, boxGeo(0.52, 0.62, 0.36), clothMat, 0, 0.34, 0);
  add(torso, boxGeo(0.5, 0.36, 0.1), armorMat, 0, 0.44, 0.2);
  add(torso, boxGeo(0.4, 0.46, 0.22), armorMat, 0, 0.4, -0.27);
  add(torso, cylGeo(0.008, 0.008, 0.6, 4), armorMat, 0.14, 0.85, -0.3);
  add(torso, boxGeo(0.06, 0.04, 0.02), glowMat, 0.14, 1.15, -0.3);
  for (const s of [-1, 1]) add(torso, boxGeo(0.24, 0.13, 0.32), armorMat, s * 0.37, 0.64, 0, 0, 0, s * -0.25);
  add(torso, new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.5, 3.5) }), 0.38, 0.74, 0.12);
  add(torso, boxGeo(0.3, 0.05, 0.02), glowMat, 0, 0.22, 0.255); // belt light
  const head = pivot(torso, 0, 0.72, 0.02);
  add(head, boxGeo(0.27, 0.3, 0.31), armorMat, 0, 0.14, 0);
  add(head, boxGeo(0.25, 0.055, 0.02), glowMat, 0, 0.15, 0.16);
  add(head, boxGeo(0.2, 0.06, 0.14), armorMat, 0, 0.0, 0.12);
  const armL = pivot(torso, 0.34, 0.55, 0);
  const armR = pivot(torso, -0.34, 0.55, 0);
  const foreL = pivot(armL, 0, -0.34, 0);
  const foreR = pivot(armR, 0, -0.34, 0);
  for (const [a, f] of [[armL, foreL], [armR, foreR]] as const) {
    add(a, boxGeo(0.14, 0.34, 0.14), clothMat, 0, -0.17, 0);
    add(f, boxGeo(0.12, 0.32, 0.12), armorMat, 0, -0.16, 0);
  }
  // Arms posed to hold the rifle.
  armL.rotation.set(-0.9, 0, 0.2);
  foreL.rotation.set(-0.7, 0, 0);
  armR.rotation.set(-0.6, 0, -0.1);
  foreR.rotation.set(-1.1, 0, 0);
  const weapon = pivot(torso, 0.05, 0.3, 0.42);
  add(weapon, boxGeo(0.09, 0.13, 0.72), armorMat, 0, 0, 0);
  add(weapon, cylGeo(0.022, 0.022, 0.3, 6), armorMat, 0, 0.02, 0.5, Math.PI / 2);
  add(weapon, boxGeo(0.02, 0.02, 0.5), glowMat, 0.05, 0.02, 0.05);
  add(weapon, boxGeo(0.06, 0.16, 0.08), clothMat, 0, -0.12, -0.05);
  const muzzle = pivot(weapon, 0, 0.02, 0.68);
  const legL = pivot(body, 0.15, 0, 0);
  const legR = pivot(body, -0.15, 0, 0);
  const kneeL = pivot(legL, 0, -0.48, 0);
  const kneeR = pivot(legR, 0, -0.48, 0);
  for (const [l, k] of [[legL, kneeL], [legR, kneeR]] as const) {
    add(l, boxGeo(0.18, 0.48, 0.2), clothMat, 0, -0.24, 0);
    add(l, boxGeo(0.19, 0.18, 0.08), armorMat, 0, -0.18, 0.1);
    add(k, boxGeo(0.16, 0.48, 0.18), armorMat, 0, -0.24, 0);
    add(k, boxGeo(0.18, 0.1, 0.3), armorMat, 0, -0.48, 0.05);
  }
  return { root, body, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, weapon, muzzle, armorMat, clothMat, glowMat, parts };
}
