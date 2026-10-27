import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 85.0: the storefronts' light shared by the maps (Storefronts.light: Tokyo's, now Neon Block's). */

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
const { Storefronts } = await import('./Storefronts');
const { Glows } = await import('./Glows');
const { frontLight } = await import('./Spill');

describe('85.0: Storefronts.light', () => {
  const laid = () => {
    const f = new Storefronts({ addMatrix: () => {} } as never);
    const kinds = ['shop', 'izakaya', 'door', 'shutter'] as const;
    // Neon Block's arcade: 3.4 m fronts facing +Z and -Z, Main Street's facing -X.
    for (let i = 0; i < 24; i++) f.lay(kinds[i % 4], new THREE.Vector3(i * 4.4, 0, i % 2 ? 24 : 28), i % 2 ? 0 : Math.PI, 3.4, false);
    for (let i = 0; i < 8; i++) f.lay(kinds[i % 2], new THREE.Vector3(13, 0, i * 4), -Math.PI / 2, 3.8, true);
    return f;
  };
  it("a window's light and a sign for each lit slot, the sign 0.3 m out in front of it", () => {
    const f = laid(), glows = new Glows();
    const { spill, signs } = f.light(glows);
    expect(spill.length).toBe(f.lit.length);
    expect(signs.length).toBe(f.lit.length);
    f.lit.forEach((s, i) => {
      const src = spill[i];
      if (src.kind !== 'front') throw new Error('a front');
      // Lit out in front of the glass, none behind it.
      expect(frontLight(src, 1, 0)).toBeGreaterThan(0);
      const out = new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry));
      expect(signs[i].pos.clone().sub(s.signAt).dot(out)).toBeCloseTo(0.3, 5);
    });
  });
  it('a 3.4 m front (under the arcade) has its sign scaled under its slab', () => {
    const f = laid();
    const arc = f.lit.filter((s) => s.x !== 13);
    for (const s of arc) expect(s.signAt.y).toBeCloseTo(3.05 * (3.4 / 3.8), 2);
  });
  it("each flickering sign gets a glow (mode, its material's light following it), its puddle reflection that glow", () => {
    const f = laid(), glows = new Glows();
    const { signs } = f.light(glows);
    expect(f.flickers.length).toBeGreaterThan(0);
    expect(glows.list.length).toBe(f.flickers.length);
    glows.list.forEach((g, i) => {
      expect(g.mode).toBe(f.flickers[i].mode);
      g.onChange!(0.5);
      expect(f.flickers[i].mat.emissiveIntensity).toBeCloseTo(0.55, 5);
      expect(signs.some((s) => s.glow === g)).toBe(true);
    });
  });
});
