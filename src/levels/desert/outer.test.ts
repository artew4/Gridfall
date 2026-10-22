import { describe, expect, it } from 'vitest';
import { OUTER, OUTER_LANES_NORTH, OUTER_LANES_SOUTH, rot } from './ArenaLayout';
import { TRENCH } from './Terrain';

describe('28.0: the desert\'s outer flanks', () => {
  it('two outer lanes per team, past the hamlet and the wadi, the north pair the rotation of the south', () => {
    expect(OUTER_LANES_SOUTH).toHaveLength(2);
    // Each runs the whole length out by the cliffs (|x| ≥ 70 somewhere in both halves).
    for (const L of OUTER_LANES_SOUTH) {
      expect(L.some(([x, z]) => Math.abs(x) >= 70 && z > 0)).toBe(true);
      expect(L.some(([x, z]) => Math.abs(x) >= 70 && z < 0)).toBe(true);
    }
    OUTER_LANES_NORTH.forEach((L, i) => expect(L).toEqual(OUTER_LANES_SOUTH[i].map(([x, z]) => rot(x, z))));
  });

  it('the trench\'s traverses leave a body\'s gap on alternate sides and together block the straight shot down it', () => {
    const [a, b, c] = OUTER.traverses;
    for (const t of OUTER.traverses) {
      const gap = t.x0 <= TRENCH.x0 + 0.01 ? TRENCH.x1 - t.x1 : t.x0 - TRENCH.x0;
      expect(gap).toBeGreaterThanOrEqual(1.79);
    }
    // West-side and east-side traverses meet: any line along the trench hits one of them.
    expect(a.x0).toBeCloseTo(TRENCH.x0);
    expect(b.x1).toBeCloseTo(TRENCH.x1);
    expect(Math.max(a.x1, c.x1)).toBeGreaterThanOrEqual(b.x0);
  });
});
