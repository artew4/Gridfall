import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solveArm, type ArmChain } from './RigIK';

function chain(side: 1 | -1): { torso: THREE.Group; c: ArmChain } {
  const torso = new THREE.Group();
  const arm = new THREE.Group();
  arm.position.set(side * 0.19, 0.57, 0.03);
  const fore = new THREE.Group();
  fore.position.set(0, -0.32, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.37, 0);
  torso.add(arm);
  arm.add(fore);
  fore.add(hand);
  return { torso, c: { arm, fore, hand, upper: 0.32, lower: 0.37, pole: new THREE.Vector3(side * 0.7, -1, -0.2) } };
}
const palm = (t: THREE.Group, c: ArmChain) => {
  t.updateMatrixWorld(true);
  return c.hand.getWorldPosition(new THREE.Vector3());
};

describe('22.0: two-bone IK', () => {
  it('puts the palm on any target in reach (to 0.1 mm), elbow toward the pole', () => {
    let rnd = 7;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    for (const side of [1, -1] as const) {
      const { torso, c } = chain(side);
      for (let i = 0; i < 400; i++) {
        // Random targets in front of the body, 0.15–0.66 m from the shoulder.
        const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 1.2 - 0.2).normalize();
        const d = 0.15 + r() * 0.51;
        const target = c.arm.position.clone().addScaledVector(dir, d);
        expect(solveArm(c, target)).toBe(0);
        expect(palm(torso, c).distanceTo(target)).toBeLessThan(1e-4);
        // The bone lengths are kept (rotations only).
        const elbow = c.fore.getWorldPosition(new THREE.Vector3());
        expect(elbow.distanceTo(c.arm.position)).toBeCloseTo(0.32, 5);
      }
    }
  });

  it('out of reach: the arm straightens toward the target and reports how short it falls', () => {
    const { torso, c } = chain(1);
    const target = c.arm.position.clone().add(new THREE.Vector3(0, 0, 0.9));
    const short = solveArm(c, target);
    expect(short).toBeCloseTo(0.9 - 0.69, 3);
    const p = palm(torso, c);
    expect(p.distanceTo(target)).toBeCloseTo(short, 3);
  });

  it('turns the hand to the grip\'s orientation (torso space)', () => {
    const { torso, c } = chain(-1);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.35, 0, 'YXZ'));
    solveArm(c, new THREE.Vector3(-0.1, 0.4, 0.4), q);
    torso.updateMatrixWorld(true);
    const got = c.hand.getWorldQuaternion(new THREE.Quaternion());
    expect(Math.abs(got.dot(q))).toBeGreaterThan(0.99999);
  });
});
