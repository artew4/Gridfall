import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 82.0: Tokyo's street level (props_street.py, StreetKit.ts) and the storefronts laid shallow by a pole. */

const street = readGlb('props/street');
const store = readGlb('props/store');
const asKit = (g: ReturnType<typeof readGlb>) =>
  Object.fromEntries(
    Object.entries(g.nodes).map(([name, parts]) => [
      name,
      parts.map((p) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(p.tris.flat(2), 3));
        return { geo, role: p.role };
      }),
    ]),
  );
const kits = { ...asKit(street), ...asKit(store) };
vi.mock('../entities/weapons/models', () => ({ propKits: () => kits }));
// (No canvases in the test runner.)
vi.mock('./StoreSigns', () => ({
  awningTexture: () => null, directoryTexture: () => null, norenTexture: () => null, shutterTexture: () => null, signs: () => null,
  signCell: () => [0, 0, 1, 1], planarInto: (g: THREE.BufferGeometry) => g.clone(),
}));
vi.mock('./Interiors', () => ({ ROOMS: ['konbini'], interiorMaterial: () => new THREE.MeshBasicMaterial(), roomUV: (g: THREE.BufferGeometry) => g.clone() }));
vi.mock('../levels/desert/textures', () => ({ woodTexture: () => new THREE.Texture() }));
const { signalAt, SIGNAL_CYCLE } = await import('./StreetKit');
const { Storefronts } = await import('./Storefronts');

const verts = (name: string) => street.nodes[name].flatMap((p) => p.tris.flat());

describe('82.0: the street kit', () => {
  it('its pieces, in budget', () => {
    expect(Object.keys(street.nodes).sort()).toEqual(['grate', 'manhole', 'mirror', 'sigarm', 'tactile', 'walk']);
    expect(street.tris).toBeLessThan(4000);
  });
  it('what lies in the road is flush (under 2.5 cm: walked over)', () => {
    for (const n of ['manhole', 'grate', 'tactile']) expect(Math.max(...verts(n).map((v) => v[1]))).toBeLessThan(0.025);
  });
  it('the mirror (hung at 2.9 m) and the walk signal (its foot at 2.65 m) stay over the head; only the button comes lower, flat on its mount', () => {
    expect(2.9 + Math.min(...verts('mirror').map((v) => v[1]))).toBeGreaterThan(2.2);
    for (const v of verts('walk')) if (2.65 + v[1] < 2.2) expect(v[0]).toBeLessThan(0.17);
  });
});

describe('82.0: the signals', () => {
  it('cycle: go, amber, stop; the walk signal green only while the cars stop, blinking out at the end', () => {
    const { go, amber, stop, blink } = SIGNAL_CYCLE;
    expect(signalAt(1).car).toBe('G');
    expect(signalAt(go + 1).car).toBe('Y');
    expect(signalAt(go + amber + 1)).toEqual({ car: 'R', walk: 'G' });
    for (let t = 0; t < go + amber + stop; t += 0.25) {
      const s = signalAt(t);
      if (s.walk === 'G' || s.walk === 'off') expect(s.car).toBe('R');
    }
    const end = go + amber + stop - blink;
    const seen = new Set(Array.from({ length: 16 }, (_, i) => signalAt(end + i * 0.25).walk));
    expect(seen.has('off')).toBe(true);
  });
});

describe('82.0: a storefront by a pole', () => {
  it('is laid shallow: nothing past 0.25 m from the wall, no awning', () => {
    const at: THREE.Vector3[] = [];
    const b = { addMatrix: (g: THREE.BufferGeometry, _m: THREE.Material, m: THREE.Matrix4) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) at.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
    } } as never;
    const f = new Storefronts(b);
    // An east-facing slot (its front towards +X: Lantern Street) on the wall at x = -5, a pole 0.4 m out in front of it.
    f.keepOut = [[-4.6, 19]];
    f.lay('izakaya', new THREE.Vector3(-5, 0, 17.5), Math.PI / 2, 3.8, false);
    expect(f.stats.shallow).toBe(1);
    expect(Math.max(...at.map((v) => v.x))).toBeLessThan(-4.74);
    // The same slot with no pole: its eave and lanterns stand out.
    at.length = 0;
    const g = new Storefronts(b);
    g.lay('izakaya', new THREE.Vector3(-5, 0, 17.5), Math.PI / 2, 3.8, false);
    expect(g.stats.shallow).toBe(0);
    expect(Math.max(...at.map((v) => v.x))).toBeGreaterThan(-4.4);
  });
});
