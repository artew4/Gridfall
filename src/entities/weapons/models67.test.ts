import { describe, expect, it } from 'vitest';
import { readGlb } from './glbRead';
import { HAND_POSES, MERC_PIVOTS } from './models';
import HAND_FIT from './handFit.json';

/* 67.0: the hands and the operator made in Blender (tools/blender/hands.py, merc.py), as the game reads them. */

const bounds = (tris: number[][][]) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], v[k])), (hi[k] = Math.max(hi[k], v[k]));
  return { lo, hi };
};

describe('67.0: the gloved hands', () => {
  const g = readGlb('hands');
  it('a node per pose, each a glove, its armour, a cuff and a sleeve', () => {
    expect(Object.keys(g.nodes).sort()).toEqual([...HAND_POSES].sort());
    for (const parts of Object.values(g.nodes)) expect(new Set(parts.map((p) => p.role))).toEqual(new Set(['glove', 'pad', 'sleeve', 'cuff']));
    expect(g.tris).toBeLessThan(25000);
  });
  it('each gun places poses that exist; the sleeve runs back towards the eye (+Z)', () => {
    for (const fits of Object.values(HAND_FIT)) for (const f of fits) expect(HAND_POSES).toContain(f.pose);
    for (const parts of Object.values(g.nodes)) {
      const s = bounds(parts.filter((p) => p.role === 'sleeve').flatMap((p) => p.tris));
      expect(s.hi[2]).toBeGreaterThan(0.2);
    }
  });
});

describe('67.0: the operator', () => {
  const g = readGlb('merc');
  it("a node per pivot of the merc rig, every part one of the rig's layers, in budget", () => {
    expect(Object.keys(g.nodes).sort()).toEqual([...MERC_PIVOTS].sort());
    const layers = ['armor', 'cloth', 'team', 'webbing', 'boots', 'glow', 'visor'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(layers).toContain(p.role);
    expect(g.tris).toBeLessThan(14000);
  });
  it('the accents are where the rig had them: the visor strip, the shoulder patches, the spine', () => {
    const glow = (n: string) => g.nodes[n].some((p) => p.role === 'glow');
    expect(['head', 'armL', 'armR', 'torso'].every(glow)).toBe(true);
    expect(g.nodes.head.some((p) => p.role === 'visor')).toBe(true);
  });
  it('the soles reach the ground from the hip (1.0 - 0.02 - 0.46 below), the helmet tops out at 1.9 m', () => {
    const shin = bounds(g.nodes.kneeL.flatMap((p) => p.tris));
    expect(1.0 - 0.02 - 0.46 + shin.lo[1]).toBeCloseTo(0.02, 1);
    const head = bounds(g.nodes.head.flatMap((p) => p.tris));
    expect(1.0 + 0.72 + head.hi[1]).toBeGreaterThan(1.9);
    expect(1.0 + 0.72 + head.hi[1]).toBeLessThan(2.05);
  });
});
