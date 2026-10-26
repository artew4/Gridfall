import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';
import { roomUV } from './Interiors';
import { planarInto } from './StoreSigns';

/* 78.0: Night Tokyo's storefronts (tools/blender/props_store.py), their rooms and signs. */

const g = readGlb('props/store');
const verts = (name: string, role?: string) => g.nodes[name].filter((p) => !role || p.role === role).flatMap((p) => p.tris.flat());

describe('78.0: the storefront kit', () => {
  it('its fronts and the awning, in the roles the city paints, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['sf_awning', 'sf_door', 'sf_izakaya', 'sf_shop', 'sf_shutter']);
    const roles = ['metal', 'dark', 'sign', 'signface', 'wood', 'noren', 'lantern', 'tile', 'paper', 'wtile', 'dir', 'light', 'shutter', 'canvas'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(6000);
  });
  it('under head height a front keeps within 0.17 m of the wall (its handles; the block is the collider: nothing to walk into)', () => {
    for (const n of ['sf_shop', 'sf_izakaya', 'sf_shutter', 'sf_door']) {
      const stray = verts(n).filter((v) => v[1] < 2.25 && v[2] > 0.17);
      expect(stray.slice(0, 2)).toEqual([]);
      // And nothing behind the wall or past the slot (4 m) or over it (3.8 m).
      for (const v of verts(n)) {
        expect(v[2]).toBeGreaterThan(-1e-3);
        expect(Math.abs(v[0])).toBeLessThan(2.0);
        expect(v[1]).toBeLessThan(3.81);
      }
    }
  });
  it('the awning and the lanterns hang above head height', () => {
    expect(Math.min(...verts('sf_awning').map((v) => v[1]))).toBeGreaterThan(2.25);
    expect(Math.min(...verts('sf_izakaya', 'lantern').map((v) => v[1]))).toBeGreaterThan(2.2);
  });
  it('every front carries a sign face (its own sign per shop)', () => {
    for (const n of ['sf_shop', 'sf_izakaya', 'sf_shutter', 'sf_door']) expect(verts(n, 'signface').length).toBeGreaterThan(0);
  });
});

describe('78.0: rooms and signs mapped', () => {
  it("a glass plane's u spans its room's [k, k + 1], v the slot's height over 3.8 m", () => {
    const p = roomUV(new THREE.PlaneGeometry(4, 2.9), 5, 2.9);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      expect(Math.floor(uv.getX(i))).toBe(5);
      expect(uv.getY(i)).toBeLessThanOrEqual(2.9 / 3.8 + 1e-6);
    }
  });
  it("a face's UVs fill exactly its cell", () => {
    const geo = new THREE.PlaneGeometry(3.4, 0.5).translate(0.2, 3.3, 0.21);
    const m = planarInto(geo, [0.25, 0.5, 0.5, 0.55]);
    const uv = m.attributes.uv;
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i)), vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...us)).toBeCloseTo(0.25, 6);
    expect(Math.max(...us)).toBeCloseTo(0.5, 6);
    expect(Math.min(...vs)).toBeCloseTo(0.5, 6);
    expect(Math.max(...vs)).toBeCloseTo(0.55, 6);
  });
});
