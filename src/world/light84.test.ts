import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 84.0: Tokyo's light and wet: the shops' light baked on the street (Spill.ts), the overpass's lamps, sign reflections from a pool, new flickers. */

const store = readGlb('props/store');
const kits = Object.fromEntries(
  Object.entries(store.nodes).map(([name, parts]) => [
    name,
    parts.map((p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.tris.flat(2), 3));
      return { geo, role: p.role };
    }),
  ]),
);
vi.mock('../entities/weapons/models', () => ({ propKits: () => kits }));
// (No canvases in the test runner.)
vi.mock('./StoreSigns', () => ({
  awningTexture: () => null, directoryTexture: () => null, norenTexture: () => null, shutterTexture: () => null, signs: () => null,
  signCell: () => [0, 0, 1, 1], signColour: () => new THREE.Color(1, 0.2, 0.1), planarInto: (g: THREE.BufferGeometry) => g.clone(),
}));
vi.mock('./Interiors', () => ({ ROOMS: ['konbini', 'drugstore', 'electronics', 'boutique', 'cafe', 'books', 'izakaya', 'ramen', 'lobby'], interiorMaterial: () => new THREE.MeshBasicMaterial(), roomUV: (g: THREE.BufferGeometry) => g.clone() }));
vi.mock('../levels/desert/textures', () => ({ woodTexture: () => new THREE.Texture() }));
const { bakeSpill, frontLight, poolLight, ROOM_LIGHT, SPILL_SCALE } = await import('./Spill');
const { Storefronts } = await import('./Storefronts');
const { Glows } = await import('./Glows');
const { ReflectionCatchers } = await import('./ReflectionCatchers');
const { CATCHERS, MAX_CATCHERS } = await import('./Ground');
const { overpassLamps } = await import('./Landmarks');

const shop = { kind: 'front' as const, x: 0, z: 0, ry: 0, width: 3.5, colour: new THREE.Color(1, 1, 1), power: 1, mullions: [-0.6, 0.6] };

describe("84.0: a window's light on the pavement", () => {
  it('none behind the wall; brightest within a metre of the glass; falling off past it', () => {
    expect(frontLight(shop, -0.5, 0)).toBe(0);
    const at = [0.05, 0.6, 1, 2, 4].map((d) => frontLight(shop, d, 0));
    expect(Math.max(...at)).toBe(Math.max(at[1], at[2]));
    expect(at[0]).toBeLessThan(at[1]);
    expect(at[3]).toBeLessThan(at[2]);
    expect(at[4]).toBeLessThan(at[3] / 2);
    // Past its side, dark.
    expect(frontLight(shop, 1, 4)).toBeLessThan(0.01);
  });
  it("each mullion's shadow, fanning out from the room behind (further across further out)", () => {
    const dip = (d: number) => {
      let best = 0, k = 1e9;
      for (let s = 0.1; s < 1.6; s += 0.01) {
        const v = frontLight(shop, d, s);
        if (v < k) (k = v), (best = s);
      }
      return { s: best, depth: 1 - k / frontLight(shop, d, best + 0.4) };
    };
    const near = dip(0.5), far = dip(2);
    expect(near.s).toBeGreaterThan(0.6);
    expect(far.s).toBeGreaterThan(near.s);
    expect(near.depth).toBeGreaterThan(0.2);
  });
  it("a lamp's pool: its power under it, nothing past its radius", () => {
    const p = { kind: 'pool' as const, x: 0, z: 0, h: 5.9, radius: 7.5, colour: new THREE.Color(1, 0.5, 0.1), power: 0.35 };
    expect(poolLight(p, 0)).toBeCloseTo(0.35, 5);
    expect(poolLight(p, 7.6)).toBe(0);
  });
  it('the bake: lit out in front of a west-facing front only, decoded as baked', () => {
    const f = { ...shop, x: 5, z: 0, ry: -Math.PI / 2 };
    const m = bakeSpill([f], -10, -10, 10, 10);
    const at = (x: number, z: number) => m.data[(Math.floor((z - m.z0) * 8) * m.w + Math.floor((x - m.x0) * 8)) * 4] / 255;
    expect(at(4.2, 0)).toBeGreaterThan(0.2);
    expect(at(5.5, 0)).toBe(0);
    expect(at(-8, 0)).toBe(0);
    // The texel's centre: (4.1875, 0.0625), 0.8125 m out, 0.0625 across.
    expect(at(4.2, 0) ** 2 * SPILL_SCALE).toBeCloseTo(frontLight(f, 0.8125, 0.0625), 1);
  });
  it('every room has its light', () => {
    for (const r of ['konbini', 'drugstore', 'electronics', 'boutique', 'cafe', 'books', 'izakaya', 'ramen', 'lobby'] as const) expect(ROOM_LIGHT[r][1]).toBeGreaterThan(0);
  });
});

describe('84.0: the storefronts', () => {
  it('record their lit slots on the street (not the shutters), and at most three flickering signs, each its own material', () => {
    const b = { addMatrix: () => {} } as never;
    const f = new Storefronts(b);
    const kinds = ['shop', 'izakaya', 'door', 'shutter'] as const;
    for (let i = 0; i < 40; i++) f.lay(kinds[i % 4], new THREE.Vector3(i * 4, 0, 0), 0, 3.8, false);
    f.lay('shop', new THREE.Vector3(0, 4.55, 9), 0, 2.9, false);
    expect(f.lit.length).toBe(30);
    expect(f.lit.every((s) => s.kind !== 'shutter')).toBe(true);
    expect(f.flickers.length).toBeGreaterThan(0);
    expect(f.flickers.length).toBeLessThanOrEqual(3);
    expect(new Set(f.flickers.map((x) => x.mat)).size).toBe(f.flickers.length);
    // The sign over the glass, 3 m up.
    for (const s of f.lit) expect(s.signAt.y).toBeCloseTo(3.05, 2);
  });
});

describe('84.0: flickers', () => {
  const jumps = (mode: 'dying' | 'starter', hz: number) => {
    const g = { mode, seed: 4.2 } as never;
    let last = Glows.prototype.flickerValue.call(null, g, 0), n = 0;
    for (let t = 1 / hz; t < 120; t += 1 / hz) {
      const v = Glows.prototype.flickerValue.call(null, g, t);
      if (Math.abs(v - last) > 0.3) n++;
      last = v;
    }
    return n / 120;
  };
  it('dying and starter jump as often at 120 FPS as at 60', () => {
    for (const m of ['dying', 'starter'] as const) {
      const a = jumps(m, 60), b = jumps(m, 120);
      expect(a).toBeGreaterThan(0);
      expect(Math.abs(b - a) / a).toBeLessThan(0.1);
    }
  });
  it('a dying tube never reaches full; a starter is steady most of the time', () => {
    const g = (mode: string) => ({ mode, seed: 1.7 }) as never;
    let max = 0, steady = 0;
    for (let t = 0; t < 60; t += 0.05) {
      max = Math.max(max, Glows.prototype.flickerValue.call(null, g('dying'), t));
      if (Glows.prototype.flickerValue.call(null, g('starter'), t) > 0.9) steady++;
    }
    expect(max).toBeLessThan(0.9);
    expect(steady / (60 / 0.05)).toBeGreaterThan(0.8);
  });
});

describe('84.0: signs in the puddles', () => {
  it("lights the eight nearest of the pool, the furthest fading as the next comes near; a flickering sign's with its glow", () => {
    const glow = { value: 0.5 } as never;
    const more = Array.from({ length: 12 }, (_, i) => ({ pos: new THREE.Vector3(i * 2, 3, 0), colour: new THREE.Color(1, 1, 1), intensity: 10, glow: i === 0 ? glow : undefined }));
    const c = new ReflectionCatchers([], [], { intensity: 9, distance: 11, height: 2.2 }, more);
    c.update(new THREE.Vector3(-1, 1.6, 0));
    const lit = CATCHERS.pos.value.slice(0, MAX_CATCHERS).map((p) => p.x);
    expect(lit.sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(CATCHERS.pos.value[0].y).toBe(2.2);
    // The nearest (its glow at half) at half; the eighth 1 m nearer than the ninth: a third.
    const by = (x: number) => CATCHERS.col.value[CATCHERS.pos.value.findIndex((p) => p.x === x)].x;
    expect(by(0)).toBeCloseTo(5, 5);
    expect(by(2)).toBeCloseTo(10, 5);
    expect(by(14)).toBeLessThan(10);
    c.dispose();
  });
});

describe('84.0: the overpass lamps', () => {
  it('overhead (5.8 m and up) by the girder face, a pool and a glow each', () => {
    const at: THREE.Vector3[] = [];
    const b = { add: (g: THREE.BufferGeometry, _m: THREE.Material, x: number, y: number, z: number) => {
      g.computeBoundingBox();
      at.push(new THREE.Vector3(x, y + g.boundingBox!.min.y, z));
    } };
    const glows = new Glows();
    const pools = overpassLamps(b, glows, null, new THREE.MeshStandardMaterial(), [[0, -20.69, 1], [5, -26.31, -1]]);
    expect(pools.length).toBe(2);
    expect(glows.list.length).toBe(2);
    for (const p of at) expect(p.y).toBeGreaterThan(5.8);
    expect(Math.max(...at.filter((p) => p.z > -23).map((p) => p.z))).toBeLessThan(-20.69 + 0.6);
  });
});
