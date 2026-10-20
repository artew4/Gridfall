import { describe, expect, it } from 'vitest';
import { JUNGLE_EXTENT, JUNGLE_TERRAIN, OUTLIERS, PAD_IN, jungleHeight } from './Terrain';

describe('jungle terrain', () => {
  it('the temple clearing is exactly flat', () => {
    for (let x = -PAD_IN; x <= PAD_IN; x += 0.7) for (let z = -PAD_IN; z <= PAD_IN; z += 0.7) if (Math.hypot(x, z) < PAD_IN - 0.01) expect(jungleHeight(x, z)).toBe(0);
  });

  it('the outlying watch platforms and their stairs stand on flat ground', () => {
    for (const o of OUTLIERS) for (let x = -9; x <= 9; x += 0.5) for (let z = -9; z <= 9; z += 0.5) if (Math.hypot(x, z) <= 9.5) expect(jungleHeight(o.x + x, o.z + z)).toBe(0);
  });

  it('slopes stay walkable everywhere players and enemies go (< 22°), and under maxHeight', () => {
    let worst = 0;
    let top = 0;
    const e = 0.25;
    for (let x = -JUNGLE_EXTENT; x <= JUNGLE_EXTENT; x += 0.5) {
      for (let z = -JUNGLE_EXTENT; z <= JUNGLE_EXTENT; z += 0.5) {
        const gx = (jungleHeight(x + e, z) - jungleHeight(x - e, z)) / (2 * e);
        const gz = (jungleHeight(x, z + e) - jungleHeight(x, z - e)) / (2 * e);
        worst = Math.max(worst, Math.hypot(gx, gz));
        top = Math.max(top, jungleHeight(x, z));
      }
    }
    expect(worst).toBeLessThan(0.4);
    expect(top).toBeLessThan(JUNGLE_TERRAIN.maxHeight);
  });
});
