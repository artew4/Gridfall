import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';
import { dressGun, dressHand } from './models';

/**
 * 21.0, the "Hornet" SMG: a short boxy receiver, a shrouded barrel with a compensator, a vertical
 * foregrip, a stick magazine ahead of the grip, a stubby stock and a compact holo sight. The finish
 * is the map's (theme.ts); the strips down the shroud show the magazine like the pistol's.
 *
 * The buzzsaw: the highest rate in the arsenal (~1090 rpm) of the weakest rounds (15), tight from the
 * hip (0.55× the cone) and slow to bloom, but it climbs hard (the steepest per-shot climb) and its
 * rounds fall to 55% between 12 and 30 m. Light: full speed held, 70% aimed, sights in 0.15 s.
 */
export const HORNET_SMG: WeaponSpec = {
  id: 'hornet',
  name: 'HORNET SMG',
  jp: '蜂',
  mag: 40,
  fireInterval: 0.055,
  reloadTime: 1.7,
  damage: 15,
  spread: 0.003,
  bloomPerShot: 0.06,
  // Small, fast kicks (a buzz, not a punch), but a steep climb: the burst walks up the target.
  kick: { z: 1.0, rot: 4, rotJitter: 1.6, side: 1.6, slide: 0.035 },
  // 39.0: the least kick a shot, but 18 a second: the yaw shakes side to side (as much as the kick
  // up), the view settles at ~1.2° up while the trigger is held; the FOV flutters with every round.
  recoil: { kick: 0.009, kickVar: 0.3, yaw: 0.009, recovery: 8, fov: 0.7, fovRecovery: 30 },
  camera: { roll: 0.35, trauma: 0.025 },
  handling: { move: 1.0, adsMove: 0.7, adsIn: 0.15, adsOut: 0.12, raise: 14 },
  hip: 0.55,
  falloff: { near: 12, far: 30, min: 0.55 },
  rest: [0.17, -0.19, -0.36],
  // Through the holo's window to the dot; eye 14 cm behind it.
  ads: { sight: [0, 0.078, -0.06], z: -0.14, zoom: 0.8 },
  muzzle: [0.15, -0.17, -0.8],
  shell: [0.2, -0.17, -0.4],
  flash: { color: [6, 4, 1.8], size: 1.0, at: [0, 0.012, -0.445], light: 0xffb050 },
  tracer: [1.0, 0.65, 0.3],
  ballistic: 'kinetic',
  sound: 'smg',
  ammoGlow: true,
  build(b: WeaponBuild) {
    const { gun, slide, mag, mats } = b;
    const { frame, steel, polymer, furniture, trim, glove, sleeve } = mats;
    const glass = new THREE.MeshStandardMaterial({ color: 0x3a6a60, metalness: 0.2, roughness: 0.05, envMapIntensity: 1.6, transparent: true, opacity: 0.18, depthWrite: false });
    const reddot = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15) });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
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
    gun.add(slide);
    mag.position.set(0, -0.04, -0.09);
    gun.add(mag);
    // Holo sight's tinted pane at the front of its window, the dot on it.
    box(0.026, 0.026, 0.002, glass, 0, 0.078, -0.084, gun);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0006, 10), reddot);
    dot.position.set(0, 0.078, -0.0825);
    gun.add(dot);
    // 66.0: the Blender model (models.ts); until it's loaded, the 21.0 boxes.
    const model = dressGun('hornet', b);
    if (!model) boxes();
    function boxes() {
      // Receiver, its lower half, the top rail.
      box(0.044, 0.05, 0.26, frame, 0, 0.015, -0.08, gun);
      box(0.04, 0.03, 0.22, polymer, 0, -0.022, -0.07, gun);
      box(0.022, 0.008, 0.24, steel, 0, 0.044, -0.09, gun);
      for (let i = 0; i < 7; i++) box(0.026, 0.004, 0.008, steel, 0, 0.049, -0.18 + i * 0.026, gun);
      // Holo sight: an open box round a 26 mm window, a tinted pane at the front and the dot on it.
      box(0.03, 0.004, 0.05, frame, 0, 0.0925, -0.06, gun);
      box(0.026, 0.01, 0.05, frame, 0, 0.0565, -0.06, gun);
      for (const s of [-1, 1]) box(0.003, 0.034, 0.05, frame, s * 0.0145, 0.077, -0.06, gun);
      // Charging handle on top at the back: the part that cycles.
      box(0.014, 0.01, 0.03, trim, 0, 0.032, 0.035, slide);
      box(0.03, 0.006, 0.01, trim, 0, 0.034, 0.05, slide);
      // Barrel shroud with the ammo strips down its sides, the barrel, a compensator.
      box(0.04, 0.046, 0.15, furniture, 0, 0.01, -0.285, gun);
      for (let i = 0; i < 4; i++) box(0.042, 0.008, 0.016, steel, 0, 0.022, -0.235 - i * 0.03, gun);
      for (const s of [-1, 1]) {
        const st = box(0.002, 0.004, 0.12, mats.glow, s * 0.0205, -0.004, -0.285, gun);
        st.userData.strip = true;
      }
      cyl(0.008, 0.07, steel, 0, 0.012, -0.39, gun);
      cyl(0.012, 0.04, frame, 0, 0.012, -0.425, gun);
      for (const s of [-1, 1]) box(0.004, 0.008, 0.016, steel, s * 0.011, 0.016, -0.428, gun);
      box(0.006, 0.02, 0.006, frame, 0, 0.044, -0.345, gun); // front post
      // Vertical foregrip.
      box(0.024, 0.07, 0.028, polymer, 0, -0.05, -0.29, gun, -0.08);
      // Pistol grip, trigger guard, trigger.
      box(0.03, 0.085, 0.04, polymer, 0, -0.07, 0.03, gun, 0.3);
      box(0.008, 0.005, 0.05, frame, 0, -0.045, -0.02, gun);
      box(0.004, 0.018, 0.004, trim, 0, -0.032, -0.01, gun, 0.3);
      // Stubby stock: a strut and a butt plate.
      cyl(0.01, 0.13, steel, 0, 0.0, 0.11, gun);
      box(0.036, 0.062, 0.03, furniture, 0, -0.01, 0.185, gun);
      box(0.04, 0.068, 0.012, glove, 0, -0.01, 0.204, gun);
      // Stick magazine ahead of the grip (drops on reload).
      box(0.024, 0.13, 0.034, steel, 0, -0.06, 0, mag, 0.06);
      box(0.028, 0.01, 0.038, trim, 0, -0.128, -0.004, mag, 0.06);
    }

    // Hands: right on the grip, left on the foregrip; sleeves.
    const hand = new THREE.Group();
    hand.userData.hands = true;
    gun.add(hand);
    // 67.0: the gloved hands from Blender (models.ts); until they're in, the boxes.
    if (!model || !(dressHand('hornet', 'grip_R', hand, mats) && dressHand('hornet', 'grip_L', hand, mats))) handBoxes();
    function handBoxes() {
      // (The model's grip rakes back, the boxes' forward: the fist follows it.)
      box(0.042, 0.072, 0.06, glove, 0.006, -0.07, 0.04, hand, model ? -0.25 : 0.3);
      box(0.016, 0.016, 0.05, glove, 0.022, -0.024, 0.0, hand);
      box(0.044, 0.06, 0.05, glove, -0.004, -0.06, -0.29, hand, -0.08);
      box(0.02, 0.016, 0.05, glove, 0.024, -0.03, -0.29, hand);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.052, 0.36, 10), sleeve);
      arm.rotation.x = Math.PI / 2 - 0.35;
      arm.rotation.z = 0.2;
      arm.position.set(0.035, -0.135, 0.22);
      hand.add(arm);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.34, 10), sleeve);
      fore.rotation.x = Math.PI / 2 - 0.2;
      fore.rotation.z = -0.7;
      fore.position.set(-0.1, -0.15, -0.16);
      hand.add(fore);
    }
  },
};
