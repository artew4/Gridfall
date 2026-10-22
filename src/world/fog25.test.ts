import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HFOG, heightFogAt, installHeightFog } from './HeightFog';
import { GROUND_FOG, groundFogBias } from '../levels/neonblock/NeonBlockLayout';
import { Sensing } from '../enemies/arena/Sensing';

const G = GROUND_FOG;
const at = (x: number, y: number, z = 0) => ({ x, y, z });
const hid = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => heightFogAt(a, b, G.density, G.top, G.opacity);

describe('25.0: the ground fog (Neon Block)', () => {
  it('in the street a figure is clear close by and gone at the cap range', () => {
    const eye = at(0, 1.65);
    expect(hid(eye, at(4, 1.3))).toBeLessThan(0.2);
    expect(hid(eye, at(9, 1.3))).toBeGreaterThan(0.45);
    expect(hid(eye, at(G.cap.range, 1.3))).toBeGreaterThan(0.8);
  });
  it('gone by the top: roof to roof is clear, and from the roofs the street is only veiled', () => {
    expect(hid(at(0, 7.2 + 1.65), at(40, 7.2 + 1.3))).toBe(0);
    expect(hid(at(0, 4.5 + 1.65), at(30, 4.5 + 1.3))).toBe(0);
    expect(hid(at(0, 8.85), at(15, 1.3))).toBeLessThan(0.25);
  });
  it('the shader chunks are patched and every built-in fogged shader carries the shared uniforms', () => {
    installHeightFog();
    expect(THREE.ShaderChunk.fog_fragment).toContain('hFog');
    expect(THREE.ShaderLib.standard.uniforms.hFog.value).toBe(HFOG);
    expect(THREE.ShaderLib.basic.uniforms.hFog.value).toBe(HFOG);
    // A material clones its uniforms: the plain object stays shared, so one setHeightFog reaches all.
    const u = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
    expect(u.hFog.value).toBe(HFOG);
  });
});

describe('25.0: sight and routes in the fog', () => {
  it('Sensing: both in the fog beyond its range is not seen; either above it is', () => {
    const s = new Sensing(() => true);
    s.fog = G.cap;
    const mk = (uid: number, team: 'alpha' | 'omega', x: number, y: number) => ({ uid, team, alive: true, pos: new THREE.Vector3(x, y, 0), yaw: Math.PI / 2, crouch: 0, headY: 1.7, chestY: 1.3, hpFrac: 1 }) as never;
    const agent = (self: unknown) => ({ self, seen: new Map(), alert: new Map(), target: null, onSight: () => {} }) as never;
    const run = (ay: number, by: number, d: number) => {
      const a = agent(mk(1, 'alpha', 0, ay));
      const h = mk(2, 'omega', d, by);
      s.update(0, [a], () => [h], () => false, 200);
      return (a as { seen: Map<number, { vis: boolean }> }).seen.get(2)!.vis;
    };
    expect(run(0, 0, 20)).toBe(false); // both in the street, 20 m
    expect(run(0, 0, 10)).toBe(true); // inside the cap
    expect(run(7.2, 0, 20)).toBe(true); // from the roof
    expect(run(0, 4.5, 20)).toBe(true); // at a landing
  });
  it('the route bias: close guns find the fog cheap, the rifle the clear', () => {
    const street = { y: 1 }, landing = { y: 5.5 };
    expect(groundFogBias(street, street, 'low')).toBeLessThan(1);
    expect(groundFogBias(landing, landing, 'low')).toBeGreaterThan(1);
    expect(groundFogBias(landing, landing, 'high')).toBeLessThan(1);
    expect(groundFogBias(street, street, 'high')).toBeGreaterThan(1);
  });
});
