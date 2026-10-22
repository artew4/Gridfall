import * as THREE from 'three';

/*
  22.0, analytic two-bone IK for a bot's arm: the hand onto the weapon's grip, every frame, in closed
  form (no iterations, no allocations).

  The chain is shoulder → elbow → palm. Each bone hangs along its pivot's local −Y; the upper arm turns
  freely (a quaternion), the elbow is a hinge about the upper arm's local X (the forearm bends toward
  local +Z, as the 14.0 rig's FK poses did). Everything is solved in the space of the arm's parent (the
  torso), where the weapon lives too: no world matrices are read.

    d     = |T − S|, clamped to [|a − b|, a + b]      (T the palm target, S the shoulder)
    cos α = (a² + d² − b²) / 2ad                      (law of cosines: the angle at the shoulder)
    n     = pole ⟂ dir                                (the elbow points toward the pole)
    E     = S + dir·a·cos α + n·a·sin α               (the elbow)
    upper: local +Y = (S − E)/a, local +Z = the forearm's direction ⟂ +Y, X = Y × Z
    elbow: θ = atan2(−f·Z, −f·Y) about X              (f = the forearm's direction, (W − E)/b)
    hand:  q_hand = (q_upper · q_fore)⁻¹ · q_target   (the fist takes the grip's orientation)

  Out of reach, the arm straightens toward the target and the palm stops short (the clamp).
*/

export interface ArmChain {
  /** Shoulder pivot (child of the torso); its position is the shoulder joint. */
  arm: THREE.Object3D;
  /** Elbow pivot, at (0, −upper, 0) in the arm. */
  fore: THREE.Object3D;
  /** Palm pivot, at (0, −lower, 0) in the forearm. */
  hand: THREE.Object3D;
  upper: number;
  lower: number;
  /** Where the elbow points (torso space, any length): down and out. */
  pole: THREE.Vector3;
}

const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _f = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** DEV counter: solves run (the cache in the body skips most frames). */
export const ikStats = { solves: 0 };

/**
 * Put the chain's palm on `target` (torso space). With `handQ`, the hand turns to that orientation
 * (torso space). Returns the distance the palm is left short of the target (0 when in reach).
 */
export function solveArm(c: ArmChain, target: THREE.Vector3, handQ: THREE.Quaternion | null = null): number {
  ikStats.solves++;
  const a = c.upper, b = c.lower;
  const S = c.arm.position;
  _dir.subVectors(target, S);
  const raw = _dir.length();
  if (raw < 1e-6) _dir.set(0, -1, 0);
  else _dir.multiplyScalar(1 / raw);
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, raw));
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  // The elbow's side: the pole, made perpendicular to the reach.
  _n.copy(c.pole).addScaledVector(_dir, -c.pole.dot(_dir));
  if (_n.lengthSq() < 1e-10) _n.set(0, -1, 0).addScaledVector(_dir, -_dir.y);
  _n.normalize();
  _e.copy(S).addScaledVector(_dir, a * cosA).addScaledVector(_n, a * sinA);
  _w.copy(S).addScaledVector(_dir, d);
  // Upper arm basis: +Y from the elbow up to the shoulder; +Z the way the forearm bends.
  _y.subVectors(S, _e).multiplyScalar(1 / a);
  _f.subVectors(_w, _e).multiplyScalar(1 / b);
  _z.copy(_f).addScaledVector(_y, -_f.dot(_y));
  if (_z.lengthSq() < 1e-10) _z.copy(_n).negate().addScaledVector(_y, _n.dot(_y));
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  c.arm.quaternion.setFromRotationMatrix(_m);
  // Elbow hinge about the upper arm's X.
  c.fore.rotation.set(Math.atan2(-_f.dot(_z), -_f.dot(_y)), 0, 0);
  if (handQ) {
    _q.copy(c.arm.quaternion).multiply(c.fore.quaternion).invert();
    c.hand.quaternion.copy(_q).multiply(handQ);
  }
  return Math.max(0, raw - d);
}
