import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';

/**
 * 90.1: "Ram" rocket launcher, a pickup on the map (not in the loadout): an RPG-style tube on the
 * shoulder, its grips and an iron sight; the warhead sits in the muzzle (the "magazine": a reload
 * drops it out of view and brings the next one up). One rocket loaded, the rest carried (Game keeps
 * the count). It fires Rockets (combat/Rockets.ts), not rounds: the Game routes the trigger there.
 */
export const RAM_LAUNCHER: WeaponSpec = {
  id: 'ram',
  name: 'RAM RPG',
  jp: 'ロケット',
  mag: 1,
  fireInterval: 0.6,
  reloadTime: 2.4,
  damage: 0,
  spread: 0.003,
  bloomPerShot: 0,
  kick: { z: 7, rot: 12, rotJitter: 2, side: 2.5, slide: 0 },
  // The tube shoves the shoulder back and the view up; a wide punch, slow to settle.
  recoil: { kick: 0.06, kickVar: 0.15, yaw: 0.012, recovery: 2.6, fov: 5, fovRecovery: 4.5 },
  camera: { roll: 2.2, trauma: 0.5 },
  handling: { move: 0.82, adsMove: 0.5, adsIn: 0.3, adsOut: 0.2, raise: 4.5 },
  hip: 1,
  rest: [0.21, -0.16, -0.52],
  // Down the rear sight's notch (top 0.082) to the front post.
  ads: { sight: [-0.062, 0.084, -0.12], z: -0.06, zoom: 0.8 },
  muzzle: [0.2, -0.1, -1.05],
  shell: [0.2, -0.1, -0.3],
  flash: { color: [9, 5.5, 2], size: 3.2, at: [0, 0, -0.58], light: 0xffa040 },
  tracer: [1, 0.7, 0.35],
  ballistic: 'kinetic',
  // (Its reload's clicks and slides: the rifle's; its launch is its own, Rockets'.)
  sound: 'rifle',
  launcher: true,
  ammoGlow: false,
  build(b: WeaponBuild) {
    const { gun, mag, mats } = b;
    const { frame, steel, furniture, glove, sleeve } = mats;
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7, metalness: 0.2 });
    const head = new THREE.MeshStandardMaterial({ color: 0x5c6142, roughness: 0.55, metalness: 0.3 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      parent.add(mesh);
      return mesh;
    };
    const cyl = (r0: number, r1: number, len: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, seg = 16) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    // The tube: front half steel, the wooden heat guard in the middle, the flared venturi at the back.
    cyl(0.037, 0.037, 0.5, steel, 0, 0, -0.3, gun);
    cyl(0.044, 0.044, 0.34, furniture, 0, 0, 0.0, gun);
    cyl(0.037, 0.037, 0.2, frame, 0, 0, 0.26, gun);
    cyl(0.04, 0.062, 0.12, frame, 0, 0, 0.42, gun);
    cyl(0.041, 0.041, 0.02, frame, 0, 0, -0.55, gun);
    // The grips (front one forward of the trigger), the trigger guard.
    box(0.03, 0.09, 0.04, frame, 0, -0.075, -0.12, gun, 0.2);
    box(0.03, 0.095, 0.042, frame, 0, -0.078, 0.06, gun, 0.25);
    box(0.008, 0.006, 0.07, frame, 0, -0.06, 0.1, gun);
    // The iron sight on the left: a rear notch, a front post.
    box(0.012, 0.035, 0.012, steel, -0.062, 0.062, -0.12, gun);
    box(0.012, 0.03, 0.012, steel, -0.062, 0.06, -0.42, gun);
    box(0.03, 0.006, 0.32, steel, -0.046, 0.042, -0.27, gun);
    // The warhead in the muzzle: its cone and body (the reload's "magazine").
    mag.position.set(0, 0, -0.6);
    gun.add(mag);
    cyl(0.032, 0.032, 0.05, olive, 0, 0, 0.0, mag);
    cyl(0.012, 0.06, 0.18, head, 0, 0, -0.12, mag);
    cyl(0.06, 0.06, 0.04, head, 0, 0, -0.03, mag);
    cyl(0.004, 0.012, 0.03, steel, 0, 0, -0.225, mag, 8);
    // The hands: the right on the back grip, the left on the front.
    const hand = new THREE.Group();
    hand.userData.hands = true;
    gun.add(hand);
    box(0.046, 0.075, 0.064, glove, 0.006, -0.085, 0.07, hand, 0.25);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.052, 0.36, 10), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.rotation.z = 0.2;
    arm.position.set(0.035, -0.17, 0.26);
    hand.add(arm);
    box(0.046, 0.07, 0.064, glove, -0.004, -0.082, -0.12, hand, 0.2);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.36, 10), sleeve);
    fore.rotation.x = Math.PI / 2 - 0.25;
    fore.rotation.z = -0.65;
    fore.position.set(-0.12, -0.18, -0.02);
    hand.add(fore);
  },
};

/** The launcher as it lies on the map (the pickup): the same tube, world scale, one mesh per material. */
export function launcherProp(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.45, metalness: 0.75 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.7 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.65, metalness: 0.2 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, z: number) => {
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.z = z;
    g.add(mesh);
  };
  add(new THREE.CylinderGeometry(0.037, 0.037, 0.5, 14), steel, -0.3);
  add(new THREE.CylinderGeometry(0.044, 0.044, 0.34, 14), wood, 0);
  add(new THREE.CylinderGeometry(0.037, 0.037, 0.2, 14), steel, 0.26);
  add(new THREE.CylinderGeometry(0.04, 0.062, 0.12, 14), steel, 0.42);
  add(new THREE.CylinderGeometry(0.012, 0.06, 0.18, 12), olive, -0.72);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), olive, -0.63);
  return g;
}
