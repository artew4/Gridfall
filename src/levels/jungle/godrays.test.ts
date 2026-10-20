import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGodRays } from './GodRays';

describe('jungle light shafts', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.Vector3(28, 150, 46);
  const rays = buildGodRays(scene, sun, [{ x: 0, y: 0, z: 0, r: 3, k: 1 }, { x: 10, y: 0, z: -5, r: 2, k: 0.8 }], new THREE.Color(1, 1, 1));

  it('are never hit by a three.js raycast (bullets, picks, anything that walks the scene graph)', () => {
    scene.updateMatrixWorld(true);
    // Straight through the first shaft's core at chest height, and down its axis.
    const hits = [
      new THREE.Raycaster(new THREE.Vector3(-20, 1.5, 0), new THREE.Vector3(1, 0, 0)).intersectObject(scene, true),
      new THREE.Raycaster(new THREE.Vector3(14, 75, 23), new THREE.Vector3(-14, -75, -23).normalize()).intersectObject(scene, true),
    ];
    expect(hits.every((h) => h.length === 0)).toBe(true);
  });

  it('are soft, cast no shadows and write no depth', () => {
    expect(rays.group.userData.soft).toBe(true);
    for (const m of rays.group.children as THREE.Mesh[]) {
      expect(m.userData.soft).toBe(true);
      expect(m.castShadow).toBe(false);
    }
    expect(rays.mat.depthWrite).toBe(false);
    expect(rays.mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('lean toward the sun from where they land', () => {
    const m = rays.group.children[0] as THREE.Mesh;
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
    expect(axis.angleTo(sun.clone().normalize())).toBeLessThan(1e-4);
  });
});
