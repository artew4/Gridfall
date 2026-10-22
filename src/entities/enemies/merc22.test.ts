import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARM, OPERATOR_KITS, kitColours, rigStats, setRigGun } from './operators';
import { RIG_GUNS, gripTargets, holdPose } from './rigGuns';
import { solveArm, type ArmChain } from '../../enemies/RigIK';
import type { WeaponId } from '../weapons/armory';

const hsl = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);

describe('22.0: friend or foe on the corporate kit', () => {
  it('the secondary gear is a solid block of pale team colour: ice blue vs sand-orange, base armour white', () => {
    const a = kitColours('corporate', 'alpha'), o = kitColours('corporate', 'omega');
    const ha = hsl(a.team), ho = hsl(o.team);
    expect(ha.h).toBeGreaterThan(0.5); // blue
    expect(ha.h).toBeLessThan(0.65);
    expect(ho.h).toBeGreaterThan(0.05); // orange-sand
    expect(ho.h).toBeLessThan(0.12);
    for (const h of [ha, ho]) {
      expect(h.s).toBeGreaterThan(0.5); // a colour, not a grey
      expect(h.l).toBeGreaterThan(0.6); // pale: the bright hall's values
    }
    expect(hsl(a.armor).s).toBeLessThan(0.15); // the base armour stays white-grey
    // The night kit's blocks are deep (the dark-alley rule): still a hue, but dark.
    expect(hsl(kitColours('night', 'alpha').team).l).toBeLessThan(0.25);
  });
});

describe('22.0: the Cyber-Merc rig', () => {
  const rig = OPERATOR_KITS.corporate.alpha.buildGunner();

  it('is a hierarchy: pelvis → torso → head and arms (upper, fore, hand), pelvis → legs; the gun on the torso', () => {
    expect(rig.torso.parent).toBe(rig.body);
    expect(rig.head.parent).toBe(rig.torso);
    for (const [a, f, h] of [[rig.armL, rig.foreL, rig.handL], [rig.armR, rig.foreR, rig.handR]] as const) {
      expect(a.parent).toBe(rig.torso);
      expect(f.parent).toBe(a);
      expect(h!.parent).toBe(f);
      expect(f.position.y).toBeCloseTo(-ARM.upper);
      expect(h!.position.y).toBeCloseTo(-ARM.lower);
    }
    expect(rig.kneeL.parent).toBe(rig.legL);
    expect(rig.legL.parent).toBe(rig.body);
    expect(rig.weapon!.parent).toBe(rig.torso);
  });

  it('shares its geometry with every rig of its kit and team (a respawn merges nothing), and is ≤ 20 draw calls', () => {
    const before = rigStats.merged;
    const b = OPERATOR_KITS.corporate.alpha.buildGunner();
    expect(rigStats.merged).toBe(before);
    expect((b.head.children[0] as THREE.Mesh).geometry).toBe((rig.head.children[0] as THREE.Mesh).geometry);
    let meshes = 0;
    b.root.traverse((o) => (meshes += (o as THREE.Mesh).isMesh ? 1 : 0));
    expect(meshes).toBeLessThanOrEqual(20);
    // Per-bot materials: the body (hit flash) and the glow; everything else is shared.
    expect(b.root.userData.ownedGeos).toEqual([]);
    expect(b.root.userData.ownedMats).toHaveLength(2);
  });

  it('every gun: both hands reach their grips at the hip and aimed, pitched up or down, and on recoil', () => {
    const chain = (side: 'L' | 'R'): ArmChain => ({
      arm: side === 'L' ? rig.armL : rig.armR,
      fore: side === 'L' ? rig.foreL : rig.foreR,
      hand: (side === 'L' ? rig.handL : rig.handR)!,
      upper: ARM.upper,
      lower: ARM.lower,
      pole: new THREE.Vector3(side === 'L' ? 0.5 : -0.6, -1, side === 'L' ? -0.1 : -0.3),
    });
    const R = chain('R'), L = chain('L');
    const pos = new THREE.Vector3(), rot = new THREE.Euler(), q = new THREE.Quaternion();
    const g = new THREE.Vector3(), f = new THREE.Vector3(), gq = new THREE.Quaternion(), fq = new THREE.Quaternion();
    for (const id of Object.keys(RIG_GUNS) as WeaponId[]) {
      expect(setRigGun(rig, id)).toBe(true);
      for (const e of [0, 0.5, 1]) for (const pitch of [-0.25, 0, 0.25]) for (const kick of [0, 0.07]) {
        holdPose(id, rig.head.position, e, kick, pitch * e, pos, rot);
        gripTargets(id, pos, q.setFromEuler(rot), g, f, gq, fq);
        // Within reach (2 cm of slack at most: the support arm at full stretch on a rifle).
        expect(solveArm(R, g, gq)).toBeLessThan(0.02);
        expect(solveArm(L, f, fq)).toBeLessThan(0.02);
      }
    }
  });
});
