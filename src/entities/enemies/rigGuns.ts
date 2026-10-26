import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponId } from '../weapons/armory';
import { botGun } from '../weapons/models';

/*
  22.0, the guns a bot holds: one low-poly model per armory gun, and where the hands go on it.

  Gun space: +Z down the barrel, +Y up, the origin at the trigger hand's palm on the grip (so a hold
  pose places the grip itself). Each gun is a few boxes and a barrel merged into one geometry, made
  once and shared by every bot (the theme's material colours it; theme.ts adds the accent strips).

  The hands (RigIK targets, gun space):
   - `grip`: the trigger hand on the pistol grip, its fist raked back with the grip (`rake`);
   - `fore`: the support hand on the fore-end (the handguard, the SMG's vertical grip, the shotgun's
     pump), or cupping the trigger hand on the pistol.

  Holds (torso space): `hip`, the low ready (the gun under the arm, muzzle forward); the aimed hold is
  found from the eye: the sight line (`sightY` over the grip) through the eye, the grip `relief` m in
  front of it along the barrel. Long guns are held bladed: the torso turns `blade` rad to its right
  (the support shoulder forward) and the gun the same back, so it still points where the body does
  and the support hand reaches the fore-end.
*/

type Box = [w: number, h: number, d: number, x: number, y: number, z: number, rx?: number];

export interface RigGun {
  boxes: Box[];
  /** Barrel: radius, length, centre. */
  barrel: [r: number, len: number, x: number, y: number, z: number];
  muzzle: [number, number, number];
  grip: [number, number, number];
  fore: [number, number, number];
  /** The pistol grip's rake (rad, about X): the trigger hand's fist follows it. */
  rake: number;
  /** The support hand's tilt (rad, about X): 0 on a handguard; the rake on a vertical grip. */
  foreRake: number;
  sightY: number;
  relief: number;
  hip: [number, number, number];
  blade: number;
  /** Accent strips (x mirrored): side offset, height, centre z, length. */
  accent: [number, number, number, number];
}

export const RIG_GUNS: Record<WeaponId, RigGun> = {
  pistol: {
    boxes: [
      [0.034, 0.034, 0.19, 0, 0.058, 0.07], // slide
      [0.03, 0.028, 0.16, 0, 0.03, 0.06], // frame
      [0.03, 0.1, 0.044, 0, -0.022, -0.004, 0.25], // grip
      [0.008, 0.02, 0.04, 0, 0.005, 0.03], // trigger guard
    ],
    barrel: [0.008, 0.03, 0, 0.058, 0.175],
    muzzle: [0, 0.058, 0.19],
    grip: [0, -0.035, 0],
    fore: [0.032, -0.05, 0.012],
    rake: 0.25,
    foreRake: 0.25,
    sightY: 0.08,
    relief: 0.5,
    hip: [-0.1, 0.42, 0.34],
    blade: 0.08,
    accent: [0.0175, 0.058, 0.07, 0.14],
  },
  smg: {
    boxes: [
      [0.055, 0.085, 0.26, 0, 0.05, 0.04], // receiver
      [0.04, 0.05, 0.14, 0, 0.045, -0.15], // stock strut
      [0.045, 0.085, 0.02, 0, 0.03, -0.225], // butt
      [0.05, 0.055, 0.14, 0, 0.05, 0.24], // shroud
      [0.03, 0.08, 0.034, 0, -0.022, 0.22], // vertical foregrip
      [0.028, 0.14, 0.038, 0, -0.06, 0.1, 0.06], // magazine
      [0.034, 0.09, 0.044, 0, -0.035, -0.008, 0.3], // grip
      [0.03, 0.04, 0.06, 0, 0.11, 0.04], // holo sight
    ],
    barrel: [0.012, 0.08, 0, 0.05, 0.35],
    muzzle: [0, 0.05, 0.39],
    grip: [0, -0.045, 0],
    fore: [0, -0.045, 0.22],
    rake: 0.3,
    foreRake: 0.05,
    sightY: 0.13,
    relief: 0.24,
    hip: [-0.18, 0.38, 0.3],
    blade: 0.3,
    accent: [0.026, 0.05, 0.24, 0.12],
  },
  ar: {
    boxes: [
      [0.058, 0.085, 0.4, 0, 0.05, 0.07], // receiver
      [0.05, 0.085, 0.17, 0, 0.035, -0.2], // stock
      [0.055, 0.1, 0.03, 0, 0.03, -0.29], // butt pad
      [0.064, 0.064, 0.24, 0, 0.045, 0.38], // handguard
      [0.03, 0.045, 0.08, 0, 0.115, 0.08], // optic
      [0.034, 0.1, 0.044, 0, -0.035, -0.006, 0.3], // grip
      [0.03, 0.13, 0.06, 0, -0.045, 0.13, 0.18], // magazine
    ],
    barrel: [0.013, 0.2, 0, 0.05, 0.6],
    muzzle: [0, 0.05, 0.71],
    grip: [0, -0.045, 0],
    fore: [0, 0, 0.29],
    rake: 0.3,
    foreRake: 0,
    sightY: 0.13,
    relief: 0.24,
    hip: [-0.2, 0.36, 0.28],
    blade: 0.35,
    accent: [0.033, 0.05, 0.38, 0.2],
  },
  shotgun: {
    boxes: [
      [0.06, 0.08, 0.24, 0, 0.045, 0.06], // receiver
      [0.05, 0.085, 0.24, 0, 0.025, -0.18, -0.05], // stock
      [0.034, 0.1, 0.044, 0, -0.035, -0.006, 0.35], // grip
      [0.062, 0.058, 0.16, 0, 0.03, 0.31], // pump
    ],
    barrel: [0.017, 0.5, 0, 0.065, 0.42],
    muzzle: [0, 0.065, 0.67],
    grip: [0, -0.045, 0],
    fore: [0, -0.002, 0.3],
    rake: 0.35,
    foreRake: 0,
    sightY: 0.09,
    relief: 0.24,
    hip: [-0.2, 0.36, 0.28],
    blade: 0.35,
    accent: [0.031, 0.045, 0.08, 0.16],
  },
};

const geos = new Map<WeaponId, THREE.BufferGeometry>();
/** The gun's model, merged once and shared (never disposed with a rig). */
export function rigGunGeo(id: WeaponId) {
  // 66.0: the gun's Blender model once it's loaded (models.ts).
  const model = botGun(id);
  if (model) return model.body;
  let g = geos.get(id);
  if (!g) {
    const s = RIG_GUNS[id];
    const parts = s.boxes.map(([w, h, d, x, y, z, rx = 0]) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      b.rotateX(rx);
      b.translate(x, y, z);
      return b;
    });
    const [r, len, x, y, z] = s.barrel;
    const c = new THREE.CylinderGeometry(r, r, len, 6).toNonIndexed();
    c.rotateX(Math.PI / 2);
    c.translate(x, y, z);
    parts.push(c);
    g = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    // (A plain colour: the theme's gun material reads the models' role shades from it.)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
    g.userData.shared = true;
    geos.set(id, g);
  }
  return g;
}

/** 66.0: the glow parts of the gun's model (the theme's accent), or null. */
export function rigGunGlow(id: WeaponId) {
  return botGun(id)?.glow ?? null;
}

/** 66.0: where the gun's rounds leave it (its model's muzzle once loaded). */
export function rigMuzzle(id: WeaponId): readonly [number, number, number] {
  return botGun(id)?.muzzle ?? RIG_GUNS[id].muzzle;
}

const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();
/**
 * The gun's pose in torso space (Gunner.holdGun, the tests): `head`, the head pivot's position;
 * `e`, how far it is raised (0 the hip hold, 1 the aimed hold); `kick`, recoil back along the barrel
 * (m); `pitch`, the aim's pitch the torso hasn't taken (rad). The rotation is in 'YXZ' order: the
 * blade (the gun turned back to the left), then the pitch.
 */
export function holdPose(id: WeaponId, head: THREE.Vector3, e: number, kick: number, pitch: number, pos: THREE.Vector3, rot: THREE.Euler) {
  const s = RIG_GUNS[id];
  const cb = Math.cos(s.blade), sb = Math.sin(s.blade);
  // The right eye, the head turned back by the blade.
  _eye.set(head.x - 0.035 * cb + 0.13 * sb, head.y + 0.11, head.z + 0.035 * sb + 0.13 * cb);
  eyeHold(id, _eye, _aim);
  pos.set(s.hip[0], s.hip[1], s.hip[2]).lerp(_aim, e);
  pos.x -= sb * kick;
  pos.z -= cb * kick;
  rot.set(pitch, s.blade, 0, 'YXZ');
}

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
/** Where the hands go (torso space) for a gun at `pos`/`q`, and how the fists turn (`gripQ`, `foreQ`). */
export function gripTargets(id: WeaponId, pos: THREE.Vector3, q: THREE.Quaternion, grip: THREE.Vector3, fore: THREE.Vector3, gripQ: THREE.Quaternion, foreQ: THREE.Quaternion) {
  const s = RIG_GUNS[id];
  _q.copy(q);
  grip.set(s.grip[0], s.grip[1], s.grip[2]).applyQuaternion(_q).add(pos);
  // 66.0: on a model, its fore-end's spot.
  const f = botGun(id)?.fore ?? s.fore;
  fore.set(f[0], f[1], f[2]).applyQuaternion(_q).add(pos);
  gripQ.copy(_q).multiply(_r.setFromAxisAngle(X, s.rake));
  foreQ.copy(_q).multiply(_r.setFromAxisAngle(X, s.foreRake));
}

/** The aimed hold's grip position (torso space) for an eye at `eye` (torso space). */
export function eyeHold(id: WeaponId, eye: THREE.Vector3, out: THREE.Vector3) {
  const s = RIG_GUNS[id];
  // Along the barrel (the gun turned `blade` back to the left inside the bladed torso).
  return out.set(eye.x + Math.sin(s.blade) * s.relief, eye.y - s.sightY, eye.z + Math.cos(s.blade) * s.relief);
}
