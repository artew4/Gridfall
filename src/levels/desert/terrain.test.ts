import { describe, expect, it } from 'vitest';
import { BARRIER_X, BARRIER_Z, CULVERT, DESERT_EXTENT, DESERT_TERRAIN, culvertFloor, desertHeight } from './Terrain';

describe('desert terrain', () => {
  it('the compound inside the barrier is exactly flat (12.0: but for the culvert cut into it)', () => {
    for (let x = -BARRIER_X + 0.01; x < BARRIER_X; x += 0.7) for (let z = -BARRIER_Z + 0.01; z < BARRIER_Z; z += 0.7) expect(desertHeight(x, z)).toBe(culvertFloor(x, z) ?? 0);
  });

  it('the culvert: floor 3 m down under its roof, stairs up to the rim at either end, point-symmetric', () => {
    expect(desertHeight(0, 0)).toBe(CULVERT.floor);
    expect(desertHeight(CULVERT.roof - 0.1, 1)).toBe(CULVERT.floor);
    expect(desertHeight(-(CULVERT.top + CULVERT.roof) / 2, 0)).toBeCloseTo(CULVERT.floor / 2);
    expect(desertHeight(CULVERT.top + 0.2, 0)).toBe(0);
    expect(desertHeight(0, CULVERT.z + 0.01)).toBe(0);
    for (const [x, z] of [[24, 1], [-23, -1.5], [10, 0.5]]) expect(desertHeight(x, z)).toBe(desertHeight(-x, -z));
  });

  it('slopes stay walkable everywhere players and enemies go (< 22°), and under maxHeight', () => {
    let worst = 0;
    let top = 0;
    const e = 0.25;
    for (let x = -DESERT_EXTENT; x <= DESERT_EXTENT; x += 0.5) {
      for (let z = -DESERT_EXTENT; z <= DESERT_EXTENT; z += 0.5) {
        // The culvert's walls are concrete, not dune: skip its cut.
        if (culvertFloor(x, z) !== null || culvertFloor(x + e, z) !== null || culvertFloor(x - e, z) !== null || culvertFloor(x, z + e) !== null || culvertFloor(x, z - e) !== null) continue;
        const gx = (desertHeight(x + e, z) - desertHeight(x - e, z)) / (2 * e);
        const gz = (desertHeight(x, z + e) - desertHeight(x, z - e)) / (2 * e);
        worst = Math.max(worst, Math.hypot(gx, gz));
        top = Math.max(top, desertHeight(x, z));
      }
    }
    expect(worst).toBeLessThan(0.4);
    expect(top).toBeLessThan(DESERT_TERRAIN.maxHeight);
  });
});
