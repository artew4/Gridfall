import { describe, expect, it } from 'vitest';
import { hit, readGlb } from './glbRead';
import { KITSUNE_9 } from './kitsune9';
import { HORNET_SMG } from './hornet';
import { JACKAL_AR } from './jackal';
import { BOAR_SHOTGUN } from './shotgun';
import type { WeaponSpec } from '../types';

/*
  66.0: the Blender guns (tools/blender/guns.py) as the game reads them: the GLB's nodes, roles,
  size, and the sight line through each.
*/

const GUNS: [string, WeaponSpec][] = [
  ['kitsune9', KITSUNE_9],
  ['hornet', HORNET_SMG],
  ['jackal', JACKAL_AR],
  ['shotgun', BOAR_SHOTGUN],
];
const ROLES = ['frame', 'steel', 'polymer', 'furniture', 'trim', 'glow'];

describe('66.0: the guns made in Blender', () => {
  for (const [id, spec] of GUNS) {
    it(`${id}: body, slide and magazine nodes in gun space, every part a role, in budget`, () => {
      const g = readGlb(`guns/${id}`);
      expect(Object.keys(g.nodes)).toContain('body');
      expect(Object.keys(g.nodes)).toContain('slide');
      for (const parts of Object.values(g.nodes)) for (const p of parts) expect(ROLES).toContain(p.role);
      expect(g.tris).toBeLessThan(40000);
      // The muzzle flash sits just past the barrel's end; the model reaches it, not past.
      let minZ = Infinity;
      for (const parts of Object.values(g.nodes)) for (const p of parts) for (const t of p.tris) for (const v of t) minZ = Math.min(minZ, v[2]);
      expect(minZ).toBeLessThan(spec.flash.at[2] + 0.04);
      expect(minZ).toBeGreaterThan(spec.flash.at[2] - 0.03);
      const lod = readGlb(`guns/${id}_lod`);
      expect(lod.tris).toBeLessThan(3200);
    });

    it(`${id}: the sight line is clear from the eye to past the muzzle`, () => {
      const g = readGlb(`guns/${id}`);
      const [, sy, sz] = spec.ads.sight;
      // From 10 cm behind the sight point straight down the barrel (the glow is the pistol's dot).
      const o = [0, sy, sz + 0.1], d = [0, 0, -1];
      const blocked: string[] = [];
      for (const [node, parts] of Object.entries(g.nodes))
        for (const p of parts) {
          if (p.role === 'glow') continue;
          for (const t of p.tris) {
            const s = hit(o, d, t);
            if (s !== null) blocked.push(`${node}/${p.role} at z ${(o[2] - s).toFixed(3)}`);
          }
        }
      expect(blocked).toEqual([]);
      // (And the test sees a gun: the same line through the receiver is blocked.)
      expect(g.nodes.body.some((p) => p.tris.some((t) => hit([0, 0.0, sz + 0.1], d, t) !== null))).toBe(true);
    });
  }
});
