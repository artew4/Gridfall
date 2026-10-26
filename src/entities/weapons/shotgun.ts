import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';
import { dressGun } from './models';

/**
 * "Boar" pump-action shotgun: receiver and barrel, stock and fore-end, a magazine tube under the
 * barrel, a bead sight. The finish is the map's (theme.ts): parkerized steel and woodland camo on the
 * military maps, gunmetal with a neon rib on the blaster ones, white and carbon on Maglev. One pump
 * between shells; six in the tube, loaded one at a time (a pull of the trigger stops loading).
 *
 * 21.0, the close-quarters monster: eight pellets of 22 in a wide cone (~4.3°): a full shell is 176,
 * past a bot's 150, inside 8 m; by 15 m each pellet is down to 8% and the cone has opened past a
 * body. Every hit shoves and staggers. Heavier to carry (85% speed) and slow to the sights.
 */
export const BOAR_SHOTGUN: WeaponSpec = {
  id: 'boar',
  name: 'BOAR M12',
  jp: '猪',
  mag: 6,
  fireInterval: 0.82,
  reloadTime: 0.5,
  damage: 22,
  spread: 0.004,
  bloomPerShot: 0.35,
  kick: { z: 4.2, rot: 22, rotJitter: 3, side: 3.5, slide: 0 },
  // The cannon: the hardest punch, the widest FOV kick and the most screen shake in the arsenal.
  // 39.0: the biggest kick by far (~5°), the biggest punch, the slowest way back (2.2/s: 0.45 s to
  // lose 63%; most of it gone by the next shell 0.82 s on).
  recoil: { kick: 0.09, kickVar: 0.12, yaw: 0.014, recovery: 2.2, fov: 3.5, fovRecovery: 7 },
  camera: { roll: 2.6, trauma: 0.32 },
  handling: { move: 0.85, adsMove: 0.55, adsIn: 0.25, adsOut: 0.18, raise: 7 },
  hip: 1.0,
  knock: { push: 3.2, stagger: 0.35 },
  rest: [0.17, -0.2, -0.36],
  // Down the vent rib (top 0.049) to the brass bead (0.052), cheek on the stock.
  ads: { sight: [0, 0.053, -0.655], z: -0.12, zoom: 0.85 },
  muzzle: [0.15, -0.17, -1.0],
  shell: [0.2, -0.17, -0.42],
  flash: { color: [8, 5, 1.8], size: 2.1, at: [0, 0.028, -0.66], light: 0xffb050 },
  tracer: [1.0, 0.72, 0.38],
  ballistic: 'kinetic',
  sound: 'shotgun',
  pellets: { count: 8, spread: 0.075, falloff: { near: 8, far: 15, min: 0.08 } },
  cycle: { start: 0.2, back: 0.13, forward: 0.15, travel: 0.1 },
  perRound: { open: 0.38, each: 0.5 },
  ammoGlow: false,
  build(b: WeaponBuild) {
    const { gun, slide, mag, mats } = b;
    const { frame: park, steel, furniture: wood } = mats;
    const bead = new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.9, roughness: 0.25 });
    const hull = new THREE.MeshStandardMaterial({ color: 0x8c1d17, roughness: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.9, roughness: 0.3 });
    const { glove, sleeve } = mats;
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      parent.add(mesh);
      return mesh;
    };
    const cyl = (r: number, len: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, seg = 14) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    slide.position.set(0, 0, 0);
    gun.add(slide);
    mag.position.set(0, -0.04, -0.09);
    gun.add(mag);
    // The brass bead the sights line up on (the model leaves it to the build: its own gold).
    const b0 = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), bead);
    b0.position.set(0, 0.052, -0.655);
    gun.add(b0);
    // 66.0: the Blender model (models.ts); until it's loaded, the 21.0 boxes.
    const model = dressGun('shotgun', b);
    if (!model) boxes();
    function boxes() {
      // Receiver (bevelled top, a lighter side plate) with the ejection port on the right, a loading port underneath.
      box(0.05, 0.062, 0.24, park, 0, 0.006, -0.06, gun);
      box(0.036, 0.012, 0.24, steel, 0, 0.043, -0.06, gun);
      box(0.052, 0.03, 0.18, steel, 0, -0.008, -0.07, gun);
      box(0.002, 0.03, 0.07, steel, 0.026, 0.02, -0.05, gun);
      box(0.03, 0.006, 0.08, steel, 0, -0.026, -0.06, gun);
      // Barrel with a vent rib and a brass bead; the magazine tube below it, a cap at the end.
      cyl(0.013, 0.5, park, 0, 0.03, -0.42, gun);
      box(0.012, 0.006, 0.48, steel, 0, 0.046, -0.42, gun);
      // 21.0: an accent line down each side of the rib (neon, an LED, or plain steel on a military finish).
      for (const s of [-1, 1]) box(0.002, 0.003, 0.4, mats.glow, s * 0.0068, 0.045, -0.42, gun);
      cyl(0.012, 0.42, steel, 0, -0.004, -0.38, gun);
      cyl(0.014, 0.022, park, 0, -0.004, -0.6, gun);
      box(0.01, 0.028, 0.012, park, 0, 0.014, -0.585, gun); // barrel clamp
      // Trigger guard and trigger, pistol-grip stock in camo.
      box(0.008, 0.005, 0.06, park, 0, -0.045, 0.0, gun);
      box(0.004, 0.022, 0.004, steel, 0, -0.03, 0.008, gun, 0.3);
      box(0.034, 0.09, 0.046, wood, 0, -0.06, 0.07, gun, 0.32);
      box(0.042, 0.06, 0.2, wood, 0, -0.015, 0.2, gun, -0.06);
      box(0.046, 0.08, 0.02, glove, 0, -0.022, 0.305, gun); // recoil pad

      // Pump fore-end (the part that cycles).
      const fe = cyl(0.024, 0.16, wood, 0, -0.004, -0.32, slide, 10);
      fe.scale.set(1, 1, 1.05);
      for (let i = 0; i < 5; i++) box(0.05, 0.004, 0.006, park, 0, -0.03, -0.27 - i * 0.025, slide); // grip grooves
      box(0.008, 0.008, 0.16, steel, 0.018, 0.01, -0.21, slide); // action bars
      box(0.008, 0.008, 0.16, steel, -0.018, 0.01, -0.21, slide);
    }
    // The support hand on the pump, so the hand racks it too.
    box(0.052, 0.05, 0.085, glove, -0.008, -0.03, -0.32, slide, 0.1);
    box(0.02, 0.016, 0.06, glove, 0.03, 0.006, -0.32, slide);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.34, 10), sleeve);
    fore.rotation.x = Math.PI / 2 - 0.2;
    fore.rotation.z = -0.7;
    fore.position.set(-0.1, -0.13, -0.17);
    slide.add(fore);

    // The shell being loaded (the reload pushes it up into the loading port, one at a time).
    cyl(0.0105, 0.06, hull, 0, 0, 0, mag, 10);
    cyl(0.011, 0.012, brass, 0, 0, 0.034, mag, 10);

    // Right hand on the grip, sleeve.
    const hand = new THREE.Group();
    hand.userData.hands = true;
    gun.add(hand);
    // (The model's grip rakes back, the boxes' forward: the fist follows it.)
    box(0.044, 0.074, 0.062, glove, 0.006, -0.064, model ? 0.085 : 0.075, hand, model ? -0.2 : 0.3);
    box(0.016, 0.016, 0.05, glove, 0.022, -0.02, 0.035, hand);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.052, 0.36, 10), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.rotation.z = 0.2;
    arm.position.set(0.035, -0.13, 0.25);
    hand.add(arm);
  },
};
