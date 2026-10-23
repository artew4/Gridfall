import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';

/**
 * "Jackal" assault rifle: receiver, furniture, a curved magazine, a red-dot sight, a vented handguard
 * and a muzzle brake. The finish is the map's (theme.ts): black and camo on the military maps, gunmetal
 * with a neon rail on the blaster ones, white with carbon furniture on Maglev.
 * Full-auto at ~650 rpm, 30 rounds; less kick per shot than the pistol but a steady climb.
 *
 * 21.0, the baseline: the versatile mid-to-long range gun. Its hip fire is the arsenal's widest (2×,
 * the SMG's 0.55×), its close-range time to kill slower than the shotgun's one shell; it keeps full
 * damage to 35 m (70% from 60 m), and the 11.0 handling (aiming at 62% speed, 0.2 s sights).
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
  // 39.0: a heavy, even kick (little spread shot to shot), a moderate bounce sideways, and a slow way
  // back: at 0.092 s a shot only 28% returns between rounds, so a burst stacks to ~3.5° up (1.6° with
  // the sights up) unless the mouse pulls it down. A noticeable punch.
  recoil: { kick: 0.018, kickVar: 0.08, yaw: 0.007, recovery: 3.5, fov: 1.5, fovRecovery: 14 },
  camera: { roll: 0.6, trauma: 0.05 },
  handling: { move: 0.95, adsMove: 0.62, adsIn: 0.2, adsOut: 0.16, raise: 10 },
  hip: 2.0,
  falloff: { near: 35, far: 60, min: 0.7 },
  rest: [0.18, -0.2, -0.36],
  // Through the red-dot tube to the dot on its lens; eye 15 cm behind the sight.
  ads: { sight: [0, 0.086, -0.083], z: -0.13, zoom: 0.72 },
  muzzle: [0.14, -0.18, -0.98],
  shell: [0.2, -0.18, -0.4],
  flash: { color: [7, 4.4, 1.6], size: 1.35, at: [0, 0.018, -0.62], light: 0xffb24a },
  tracer: [1.0, 0.6, 0.2],
  ballistic: 'kinetic',
  sound: 'rifle',
  ammoGlow: false,
  build({ gun, slide, mag, mats }: WeaponBuild) {
    const { frame: black, steel: worn, furniture: tan } = mats;
    // 11.0: you look through it now, so the lens is a faint tinted pane, not an opaque block.
    const glass = new THREE.MeshStandardMaterial({ color: 0x3a6a60, metalness: 0.2, roughness: 0.05, envMapIntensity: 1.6, transparent: true, opacity: 0.18, depthWrite: false });
    const reddot = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15) });
    const { glove, sleeve } = mats;
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
    // Red-dot sight: an open tube (four walls round a 26 mm window, so the eye sees through it when
    // aiming), a base, the tinted lens at the front and the dot on it.
    box(0.032, 0.005, 0.064, black, 0, 0.1015, -0.05, gun);
    box(0.032, 0.005, 0.064, black, 0, 0.0705, -0.05, gun);
    for (const s of [-1, 1]) box(0.003, 0.036, 0.064, black, s * 0.0145, 0.086, -0.05, gun);
    box(0.026, 0.008, 0.05, black, 0, 0.064, -0.05, gun);
    box(0.026, 0.026, 0.002, glass, 0, 0.086, -0.082, gun);
    // Faces +z: back at the eye.
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0006, 10), reddot);
    dot.position.set(0, 0.086, -0.0805);
    gun.add(dot);
    // Bolt carrier and charging handle on the right: the part that cycles.
    gun.add(slide);
    box(0.006, 0.02, 0.07, worn, 0.025, 0.012, -0.02, slide);
    box(0.016, 0.01, 0.014, black, 0.034, 0.018, 0.008, slide);
    // Handguard with vents, barrel, front sight, muzzle brake.
    box(0.054, 0.058, 0.23, tan, 0, 0.01, -0.31, gun);
    for (let i = 0; i < 5; i++) {
      box(0.056, 0.012, 0.026, black, 0, 0.012, -0.25 - i * 0.03, gun);
    }
    // 21.0: an accent line down each side of the handguard (neon, an LED, or a plain steel strip).
    for (const s of [-1, 1]) box(0.002, 0.004, 0.2, mats.glow, s * 0.028, 0.026, -0.31, gun);
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
    hand.userData.hands = true;
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
