import { describe, expect, it } from 'vitest';
import { subtract, subtractAll, uncovered } from './Rects';

const area = (rs: { x0: number; z0: number; x1: number; z1: number }[]) => rs.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

describe('Rects', () => {
  it('subtracts a hole from the middle', () => {
    const out = subtract({ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 4, z0: 4, x1: 6, z1: 6 });
    expect(area(out)).toBeCloseTo(96);
  });
  it('ignores disjoint holes', () => {
    expect(subtract({ x0: 0, z0: 0, x1: 1, z1: 1 }, { x0: 2, z0: 2, x1: 3, z1: 3 })).toHaveLength(1);
  });
  it('handles holes crossing the edge and several holes', () => {
    const out = subtractAll([{ x0: 0, z0: 0, x1: 10, z1: 10 }], [{ x0: -1, z0: 2, x1: 3, z1: 4 }, { x0: 8, z0: 8, x1: 12, z1: 12 }]);
    expect(area(out)).toBeCloseTo(100 - 6 - 4);
  });
  it('finds uncovered parts of an edge', () => {
    expect(uncovered(0, 10, [[2, 4], [3, 5], [8, 12]])).toEqual([[0, 2], [5, 8]]);
    expect(uncovered(0, 10, [])).toEqual([[0, 10]]);
  });
});
