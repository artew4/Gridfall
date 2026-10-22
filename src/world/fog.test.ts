import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HFOG, HFOG_SHAPE, heightFogAt, installHeightFog } from './HeightFog';
import { GROUND_FOG, groundFogBias } from '../levels/neonblock/NeonBlockLayout';
import { MID, TOP } from '../levels/neonblock/NeonBlockLayout';
import { Sensing } from '../enemies/arena/Sensing';
import { ARENA_SEE } from './Visibility';

const G = GROUND_FOG;
const at = (x: number, y: number, z = 0) => ({ x, y, z });
const hid = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => heightFogAt(a, b, G);
const EYE = 1.55, CHEST = 1.3;

describe('34.0: the ground fog (Neon Block): a smog filling the street canyon', () => {
  it('in the street a figure is clear close by and gone (the bots\' edge of sight) by 10.5 m', () => {
    const eye = at(0, EYE);
    expect(hid(eye, at(4, CHEST))).toBeLessThan(0.25);
    expect(hid(eye, at(8, CHEST))).toBeGreaterThan(0.55);
    expect(1 - hid(eye, at(10.5, CHEST))).toBeLessThan(ARENA_SEE + 0.01);
  });
  it('the high ground: from a roof the street is hidden past ~15 m; roof to roof is clear', () => {
    const roof = at(0, TOP + EYE);
    // Right below the roof's edge it still sees down; across the street it doesn't.
    expect(hid(roof, at(5, CHEST))).toBeLessThan(0.5);
    expect(hid(roof, at(10, CHEST))).toBeLessThan(0.7);
    expect(hid(roof, at(15, CHEST))).toBeGreaterThan(1 - ARENA_SEE);
    expect(hid(roof, at(20, CHEST))).toBeGreaterThan(0.93);
    expect(hid(roof, at(40, TOP + CHEST))).toBe(0);
    // 25.0's fog: the same look 15 m down was 14% veiled.
    expect(heightFogAt(roof, at(15, CHEST), { density: 0.256, dense: 0, top: 4.5, ground: 0, opacity: 0.96 })).toBeLessThan(hid(roof, at(15, CHEST)));
  });
  it('the mid level is in it (the footbridge, Block E\'s roofs); crouched, more is hidden', () => {
    expect(hid(at(0, MID + EYE), at(12, MID + CHEST))).toBeGreaterThan(0.75);
    expect(hid(at(0, 1.0), at(8, 0.8))).toBeGreaterThan(hid(at(0, EYE), at(8, CHEST)));
  });
  it('the closed form is the integral of the profile (numerically, any heights)', () => {
    const rho = (y: number) => (y <= G.dense ? 1 + G.ground * (1 - Math.max(0, y) / G.dense) : y < G.top ? (G.top - y) / (G.top - G.dense) : 0);
    for (const [a, b] of [[at(0, 1.5), at(9, 8.8)], [at(0, 0.3), at(5, 6.6)], [at(0, 6.5), at(7, 1)], [at(0, 2), at(12, 2.02)]] as const) {
      const n = 4000;
      let tau = 0;
      for (let i = 0; i < n; i++) tau += rho(a.y + ((b.y - a.y) * (i + 0.5)) / n);
      tau *= (G.density * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)) / n;
      expect(hid(a, b)).toBeCloseTo((1 - Math.exp(-tau * tau)) * G.opacity, 3);
    }
  });
  it('the shader chunks are patched, every built-in fogged shader carries the shared uniforms; HDR fades with the fog', () => {
    installHeightFog();
    expect(THREE.ShaderChunk.fog_fragment).toContain('hFogPhi');
    expect(THREE.ShaderChunk.fog_fragment).toContain('min( gl_FragColor.rgb, vec3( 1.0 ) )');
    expect(THREE.ShaderLib.standard.uniforms.hFog.value).toBe(HFOG);
    expect(THREE.ShaderLib.basic.uniforms.hFogShape.value).toBe(HFOG_SHAPE);
    const u = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
    expect(u.hFog.value).toBe(HFOG);
    expect(u.hFogShape.value).toBe(HFOG_SHAPE);
  });
});

describe('34.0: the bots see the fog as the picture draws it', () => {
  const mk = (uid: number, team: 'alpha' | 'omega', x: number, y: number, crouch = 0) => ({ uid, team, alive: true, pos: new THREE.Vector3(x, y, 0), yaw: Math.PI / 2, crouch, headY: 1.7, chestY: CHEST, hpFrac: 1 }) as never;
  const run = (ay: number, by: number, d: number) => {
    const s = new Sensing(() => true);
    s.fog = (e, c) => hid(e, c);
    const clar: number[] = [];
    const a = { self: mk(1, 'alpha', 0, ay), seen: new Map(), alert: new Map(), target: null, onSight: (_h: unknown, _t: number, c?: number) => void clar.push(c ?? -1) } as never;
    s.update(0, [a], () => [mk(2, 'omega', d, by)], () => false, 200);
    return { vis: (a as { seen: Map<number, { vis: boolean }> }).seen.get(2)!.vis, clarity: clar[0] };
  };
  it('in the street: seen close, not past the edge; from the roof, not down into the street far off; roof to roof always', () => {
    expect(run(0, 0, 6).vis).toBe(true);
    expect(run(0, 0, 14).vis).toBe(false);
    expect(run(TOP, 0, 20).vis).toBe(false);
    expect(run(0, TOP, 20).vis).toBe(false); // the street can't see the roof either: the same line
    expect(run(TOP, TOP, 40).vis).toBe(true);
    // The clarity reaches the brain (its reaction scales with it).
    const c = run(0, 0, 7).clarity;
    expect(c).toBeGreaterThan(ARENA_SEE);
    expect(c).toBeLessThan(0.9);
  });
  it('the route bias: close guns find the fog cheap, the rifle the clear roofs', () => {
    const street = { y: 1 }, mid = { y: MID + 1 }, roof = { y: TOP + 1 };
    expect(groundFogBias(street, street, 'low')).toBeLessThan(1);
    expect(groundFogBias(mid, mid, 'low')).toBeLessThan(1);
    expect(groundFogBias(roof, roof, 'low')).toBeGreaterThan(1);
    expect(groundFogBias(roof, roof, 'high')).toBeLessThan(1);
    expect(groundFogBias(street, street, 'high')).toBeGreaterThan(1);
  });
});
