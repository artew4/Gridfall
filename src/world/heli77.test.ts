import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 77.0: the helicopter's tail made out from the clearing (its markings) and placed by its own points. */

describe('77.0: the tail', () => {
  const g = readGlb('props/ruin');
  it('red and white bands on its boom and fin', () => {
    const roles = new Set(g.nodes.heli_tail.map((p) => p.role));
    expect(roles.has('red')).toBe(true);
    expect(roles.has('white')).toBe(true);
  });
  it("Dresser.local: a point of a model where place() puts it (from its base centre)", () => {
    const box = new THREE.BoxGeometry(2, 1, 4).translate(5, 0.5, -3);
    const d = new Dresser(new StaticBuilder(), { thing: [{ geo: box, role: 'metal' }] }, {});
    // Bounds x 4..6, y 0..1, z -5..-1: the base centre (5, 0, -3) goes to the origin.
    expect(d.local('thing', new THREE.Vector3(5, 0, -3))!.toArray()).toEqual([0, 0, 0]);
    expect(d.local('thing', new THREE.Vector3(0, 0, 0))!.toArray()).toEqual([-5, 0, 3]);
    expect(d.local('none', new THREE.Vector3())).toBeNull();
  });
});
