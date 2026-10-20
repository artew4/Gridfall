import { describe, expect, it } from 'vitest';
import { BASE, JUNGLE_EXTENT, JUNGLE_TERRAIN, ROAD, STRIP, jungleHeight, roadX } from './Terrain';

describe('jungle terrain', () => {
  it('the compound and the cleared strip round its walls are exactly flat', () => {
    for (let x = BASE.x0 - STRIP + 0.01; x <= BASE.x1 + STRIP; x += 0.7) {
      for (let z = BASE.z0 - STRIP + 0.01; z <= BASE.z1 + STRIP; z += 0.7) {
        // Only the box and the square-ish strip (rounded corners are blended).
        const inX = x >= BASE.x0 && x <= BASE.x1, inZ = z >= BASE.z0 && z <= BASE.z1;
        if (inX || inZ) expect(jungleHeight(x, z)).toBe(0);
      }
    }
  });

  it('the approach road is flat across its width up to where the cliff bank starts', () => {
    for (let z = ROAD.z0; z <= 48; z += 0.5) for (let k = -1; k <= 1; k += 0.25) expect(jungleHeight(roadX(z) + k * ROAD.half, z)).toBe(0);
  });

  it('the road meets the gate on its axis', () => {
    expect(Math.abs(roadX(ROAD.z0))).toBeLessThan(1e-9);
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
