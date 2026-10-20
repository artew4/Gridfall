import { describe, expect, it } from 'vitest';
import { BARRIER_X, BARRIER_Z, DESERT_EXTENT, DESERT_TERRAIN, desertHeight } from './Terrain';

describe('desert terrain', () => {
  it('the compound inside the barrier is exactly flat', () => {
    for (let x = -BARRIER_X + 0.01; x < BARRIER_X; x += 0.7) for (let z = -BARRIER_Z + 0.01; z < BARRIER_Z; z += 0.7) expect(desertHeight(x, z)).toBe(0);
  });

  it('slopes stay walkable everywhere players and enemies go (< 22°), and under maxHeight', () => {
    let worst = 0;
    let top = 0;
    const e = 0.25;
    for (let x = -DESERT_EXTENT; x <= DESERT_EXTENT; x += 0.5) {
      for (let z = -DESERT_EXTENT; z <= DESERT_EXTENT; z += 0.5) {
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
