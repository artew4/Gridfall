import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';

/**
 * "Jackal" assault rifle (Desert Outpost): black receiver, coyote-tan furniture, a curved magazine, a
 * red-dot sight, a vented handguard and a muzzle brake. No glowing parts: a working tool, not a toy.
 * Full-auto at ~650 rpm, 30 rounds; less kick per shot than the pistol but a steady climb.
 */
export const JACKAL_AR: WeaponSpec = {
  id: 'jackal',
  name: 'JACKAL AR',
  jp: '豺',
  mag: 30,
  fireInterval: 0.092,
  reloadTime: 2.05,
  damage: 21,
  spread: 0.0035,
  bloomPerShot: 0.11,
  kick: { z: 1.5, rot: 6.5, rotJitter: 2.5, side: 2.4, slide: 0.05 },
  camera: { climb: 0.0042, yaw: 0.0035, pitchKick: 3, yawKick: 1.2, roll: 0.6, fov: 0.8, trauma: 0.05 },
  rest: [0.18, -0.2, -0.36],
  muzzle: [0.14, -0.18, -0.98],
  shell: [0.2, -0.18, -0.4],
  flash: { color: [7, 4.4, 1.6], size: 1.35, at: [0, 0.018, -0.62], light: 0xffb24a },
  tracer: [1.0, 0.6, 0.2],
  ballistic: 'kinetic',
  sound: 'rifle',
  ammoGlow: false,
  build({ gun, slide, mag }: WeaponBuild) {
    const black = new THREE.MeshStandardMaterial({ color: 0x1f2022, metalness: 0.6, roughness: 0.45, envMapIntensity: 0.9 });
    const worn = new THREE.MeshStandardMaterial({ color: 0x3a3a38, metalness: 0.75, roughness: 0.35, envMapIntensity: 1.1 });
    const tan = new THREE.MeshStandardMaterial({ color: 0x8c7552, metalness: 0.05, roughness: 0.8, envMapIntensity: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223330, metalness: 0.2, roughness: 0.1, envMapIntensity: 1.6 });
    const reddot = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15) });
    const glove = new THREE.MeshStandardMaterial({ color: 0x7a6447, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x8f8463, roughness: 0.9 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      parent.add(mesh);
      return mesh;
    };
    const cyl = (r: number, len: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    // Receiver, dust cover, top rail.
    box(0.046, 0.066, 0.27, black, 0, 0.008, -0.06, gun);
    box(0.04, 0.012, 0.2, worn, 0, 0.046, -0.05, gun);
    box(0.022, 0.008, 0.26, black, 0, 0.056, -0.09, gun);
    for (let i = 0; i < 9; i++) box(0.026, 0.004, 0.008, worn, 0, 0.061, -0.2 + i * 0.026, gun);
    // Red-dot sight: housing, front lens, the dot.
    box(0.032, 0.036, 0.064, black, 0, 0.083, -0.05, gun);
    box(0.026, 0.026, 0.004, glass, 0, 0.086, -0.083, gun);
    box(0.002, 0.002, 0.001, reddot, 0, 0.086, -0.0175, gun);
    // Bolt carrier and charging handle on the right: the part that cycles.
    gun.add(slide);
    box(0.006, 0.02, 0.07, worn, 0.025, 0.012, -0.02, slide);
    box(0.016, 0.01, 0.014, black, 0.034, 0.018, 0.008, slide);
    // Handguard with vents, barrel, front sight, muzzle brake.
    box(0.054, 0.058, 0.23, tan, 0, 0.01, -0.31, gun);
    for (let i = 0; i < 5; i++) {
      box(0.056, 0.012, 0.026, black, 0, 0.012, -0.25 - i * 0.03, gun);
    }
    cyl(0.009, 0.17, worn, 0, 0.018, -0.5, gun);
    box(0.008, 0.032, 0.008, black, 0, 0.05, -0.41, gun);
    cyl(0.013, 0.055, black, 0, 0.018, -0.59, gun);
    for (const s of [-1, 1]) box(0.004, 0.012, 0.02, worn, s * 0.012, 0.018, -0.592, gun);
    // Pistol grip, trigger guard, trigger.
    box(0.03, 0.09, 0.042, tan, 0, -0.062, 0.03, gun, 0.32);
    box(0.008, 0.005, 0.06, black, 0, -0.04, -0.03, gun);
    box(0.004, 0.02, 0.004, worn, 0, -0.028, -0.02, gun, 0.3);
    // Buffer tube and stock.
    cyl(0.014, 0.12, black, 0, 0.0, 0.12, gun);
    box(0.044, 0.07, 0.17, tan, 0, -0.012, 0.21, gun);
    box(0.046, 0.08, 0.02, black, 0, -0.016, 0.3, gun);
    // Curved magazine (drops on reload).
    mag.position.set(0, -0.045, -0.13);
    gun.add(mag);
    box(0.028, 0.08, 0.064, worn, 0, -0.035, 0, mag, 0.12);
    box(0.028, 0.08, 0.06, worn, 0, -0.108, -0.022, mag, 0.32);
    box(0.032, 0.012, 0.066, black, 0, -0.15, -0.038, mag, 0.36);

    // Hands: right on the grip, left out on the handguard; khaki sleeves.
    const hand = new THREE.Group();
    gun.add(hand);
    box(0.042, 0.072, 0.06, glove, 0.006, -0.062, 0.04, hand, 0.3);
    box(0.016, 0.016, 0.05, glove, 0.022, -0.018, 0.0, hand);
    box(0.05, 0.05, 0.08, glove, -0.012, -0.03, -0.31, hand, 0.1);
    box(0.02, 0.016, 0.06, glove, 0.028, 0.012, -0.31, hand);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.052, 0.36, 10), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.rotation.z = 0.2;
    arm.position.set(0.035, -0.13, 0.22);
    hand.add(arm);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.34, 10), sleeve);
    fore.rotation.x = Math.PI / 2 - 0.2;
    fore.rotation.z = -0.7;
    fore.position.set(-0.1, -0.13, -0.17);
    hand.add(fore);
  },
};
