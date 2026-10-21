import * as THREE from 'three';
import type { WeaponBuild, WeaponSpec } from '../types';

/**
 * The "Kitsune-9" plasma-assisted pistol (TokyoNight, the default): gunmetal slide with cyan strips
 * that show the remaining rounds, an ammo counter on the back, a glowing barrel ring.
 * Numbers and geometry are exactly the pre-3.5 Weapon.ts.
 */
export const KITSUNE_9: WeaponSpec = {
  id: 'kitsune9',
  name: 'KITSUNE-9',
  jp: '狐',
  mag: 12,
  fireInterval: 0.14,
  reloadTime: 1.35,
  damage: 34,
  spread: 0.003,
  bloomPerShot: 0.3,
  kick: { z: 2.4, rot: 14, rotJitter: 2, side: 3, slide: 0.032 },
  camera: { climb: 0.007, yaw: 0.002, pitchKick: 5, yawKick: 1.5, roll: 1, fov: 1.6, trauma: 0.08 },
  rest: [0.15, -0.145, -0.36],
  muzzle: [0.15, -0.1, -0.55],
  shell: [0.18, -0.08, -0.35],
  flash: { color: [6, 4.2, 2.6], size: 1, at: [0, 0.02, -0.15], light: 0xffa860 },
  tracer: [1.0, 0.75, 0.4],
  ballistic: 'energy',
  sound: 'plasma',
  ammoGlow: true,
  build({ gun, slide, mag, display }: WeaponBuild) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x6a6e78, metalness: 0.8, roughness: 0.32, envMapIntensity: 1.4 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x2c2e35, metalness: 0.25, roughness: 0.5, envMapIntensity: 1.0 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xb0b5bf, metalness: 0.9, roughness: 0.18, envMapIntensity: 2 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.65, metalness: 0.1 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.8 });
    const strip = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      parent.add(mesh);
      return mesh;
    };
    // Slide (moves on recoil).
    gun.add(slide);
    box(0.034, 0.03, 0.2, metal, 0, 0.022, -0.005, slide);
    box(0.026, 0.008, 0.18, accent, 0, 0.04, -0.01, slide);
    for (let i = 0; i < 6; i++) box(0.036, 0.022, 0.003, polymer, 0, 0.022, 0.06 + i * 0.006, slide); // serrations
    for (const s of [-1, 1]) {
      const st = box(0.002, 0.004, 0.13, strip, s * 0.0175, 0.016, -0.03, slide);
      st.userData.strip = true;
    }
    // Sights.
    box(0.006, 0.008, 0.006, metal, 0, 0.044, -0.098, slide);
    const dot = box(0.003, 0.003, 0.002, strip, 0, 0.048, -0.098, slide);
    dot.userData.strip = true;
    box(0.026, 0.009, 0.008, metal, 0, 0.042, 0.088, slide);
    // Ammo display on the back of the slide.
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.011), new THREE.MeshBasicMaterial({ map: display, color: new THREE.Color(1.6, 1.6, 1.6) }));
    disp.position.set(0, 0.024, 0.0955);
    slide.add(disp);

    // Frame, rail, barrel shroud with an emissive ring.
    box(0.03, 0.022, 0.17, polymer, 0, -0.004, -0.012, gun);
    box(0.02, 0.01, 0.06, polymer, 0, -0.018, -0.07, gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.115);
    gun.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0018, 6, 16), strip);
    ring.userData.strip = true;
    ring.position.set(0, 0.02, -0.12);
    gun.add(ring);
    // Trigger guard and trigger.
    box(0.006, 0.004, 0.05, polymer, 0, -0.034, -0.01, gun);
    box(0.006, 0.02, 0.004, polymer, 0, -0.025, -0.035, gun);
    box(0.004, 0.016, 0.004, accent, 0, -0.02, -0.005, gun, 0.3);
    // Grip with the magazine inside.
    box(0.028, 0.095, 0.042, polymer, 0, -0.058, 0.055, gun, 0.22);
    mag.position.set(0, -0.06, 0.057);
    mag.rotation.x = 0.22;
    gun.add(mag);
    box(0.02, 0.09, 0.03, metal, 0, -0.012, 0, mag);
    box(0.03, 0.01, 0.046, accent, 0, -0.058, 0, mag);

    // Gloved hands and sleeve so the gun feels held, not floating.
    const hand = new THREE.Group();
    gun.add(hand);
    box(0.04, 0.07, 0.06, glove, 0.006, -0.06, 0.06, hand, 0.22);
    box(0.016, 0.016, 0.05, glove, 0.02, -0.02, 0.03, hand); // thumb
    box(0.038, 0.06, 0.05, glove, -0.024, -0.07, 0.04, hand, 0.4); // support hand
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 10), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.rotation.z = 0.2;
    arm.position.set(0.035, -0.12, 0.24);
    hand.add(arm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.012, 10), strip);
    cuff.userData.strip = true;
    cuff.rotation.copy(arm.rotation);
    cuff.position.set(0.02, -0.09, 0.105);
    hand.add(cuff);
    const arm2 = arm.clone();
    arm2.rotation.z = -0.6;
    arm2.position.set(-0.11, -0.13, 0.22);
    hand.add(arm2);
  },
};
