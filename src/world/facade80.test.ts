import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readGlb } from '../entities/weapons/glbRead';

/* 80.0: Tokyo's facades: the windows' rooms (Windows.ts), balconies, tanks, sign stacks (FacadeDress.ts). */

const g = readGlb('props/facade');
const kits = Object.fromEntries(
  Object.entries(g.nodes).map(([name, parts]) => [
    name,
    parts.map((p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.tris.flat(2), 3));
      return { geo, role: p.role };
    }),
  ]),
);
vi.mock('../entities/weapons/models', () => ({ propKits: () => kits }));
// (The canvases: none in the test runner.)
vi.mock('./StoreSigns', () => ({
  futonTexture: () => null,
  laundryTexture: () => null,
  verticalSigns: () => null,
  planarInto: (geo: THREE.BufferGeometry) => geo.clone(),
  verticalCell: () => [0, 0, 1, 1],
}));
vi.mock('./Interiors', () => ({ COLS: 3, label: () => {}, paintAtlas: () => new THREE.Texture(), shelves: () => {}, books: () => '#000' }));
const { FacadeDress } = await import('./FacadeDress');
const { applyWindows, windowTable } = await import('./Windows');

const verts = (name: string) => g.nodes[name].flatMap((p) => p.tris.flat());
const at = (n: number) => Array.from({ length: n }, () => ({ wf: 0.8, light: 'warm' as const, intensity: 1, blinds: false, curtain: false }));

/** A builder that records where pieces go. */
function recorder() {
  const placed: THREE.Vector3[] = [];
  return { placed, b: { addMatrix: (_g: THREE.BufferGeometry, _m: THREE.Material, m: THREE.Matrix4) => placed.push(new THREE.Vector3().setFromMatrixPosition(m)) } as never };
}

describe('80.0: the facade kit', () => {
  it('balconies, the roof tank, the sign stack, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['balc_a', 'balc_b', 'rtank', 'tatekan']);
    expect(g.tris).toBeLessThan(4000);
  });
  it('a balcony stands at most 1.05 m out; the sign stack 1.1 m', () => {
    for (const n of ['balc_a', 'balc_b']) expect(Math.max(...verts(n).map((v) => v[2]))).toBeLessThan(1.06);
    expect(Math.max(...verts('tatekan').map((v) => v[2]))).toBeLessThan(1.1);
    expect(Math.min(...verts('tatekan').map((v) => v[2]))).toBeGreaterThan(-0.01);
  });
});

describe('80.0: placed', () => {
  it('balconies only from 12.8 m (over a roof at 8.5 m and a jump), centred on the tile\'s window columns', () => {
    expect(FacadeDress.MIN_Y).toBeGreaterThan(8.5 + 3.3);
    const { placed, b } = recorder();
    const d = new FacadeDress(b);
    // A south face 0..32 m along x, 26 m high, the tile unshifted: columns of 4 m centred at 2, 6, 10...
    d.balconies('s', 10, 0, 32, { x0: 0, x1: 32, z0: 0, z1: 10, y0: 0, h: 26 }, 0, { cols: 4, hFrac: 0.42, at: at(20) });
    expect(d.stats.balconies).toBeGreaterThan(0);
    for (const p of placed) {
      expect(p.y).toBeGreaterThanOrEqual(12.8 - 0.15 - 1e-6);
      expect((((p.x - 2) % 4) + 4) % 4).toBeCloseTo(0, 6);
      expect(p.x).toBeGreaterThan(1.5);
      expect(p.x).toBeLessThan(30.5);
      expect(p.z).toBe(10);
    }
  });
  it("a north face runs the tile backwards (BoxGeometry's -z face): its columns from x1", () => {
    const { placed, b } = recorder();
    new FacadeDress(b).balconies('n', 0, 0, 30, { x0: 0, x1: 30, z0: 0, z1: 10, y0: 0, h: 26 }, 0.25, { cols: 4, hFrac: 0.42, at: at(20) });
    // u = 0.25 + (30 − x)/16 at a column centre (n + 0.125, + 0.375, ...): x = 30 − 16(u − 0.25).
    for (const p of placed) expect((((30 - p.x) / 16 + 0.25 - 0.125) * 4) % 1).toBeCloseTo(0, 5);
  });
});

describe('80.0: windows', () => {
  it("the table holds each window's width, light, blinds, curtain and room", () => {
    const t = windowTable({ cols: 2, hFrac: 0.5, at: [
      { wf: 0.5, light: 'off', intensity: 0, blinds: false, curtain: true },
      { wf: 1, light: 'cool', intensity: 1, blinds: true, curtain: false },
    ] });
    const d = t.image.data as Uint8Array;
    expect(d[0]).toBe(128);
    expect(d[1]).toBe(8);
    expect(d[4]).toBe(255);
    expect(d[5]).toBe(2 * 64 + 16);
    expect(d[6]).toBe(3);
    expect(d[7]).toBe(255);
  });
  it('patches the facade material: the room in the glass, its light as the emissive', () => {
    const m = applyWindows(new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), { cols: 8, hFrac: 0.5, at: at(40) }, 1);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(sh.vertexShader).toContain('vWinP');
    expect(sh.fragmentShader).toContain('texelFetch(uWinTab');
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance = winEmit');
    expect(m.customProgramCacheKey()).toContain('windows8');
  });
});
