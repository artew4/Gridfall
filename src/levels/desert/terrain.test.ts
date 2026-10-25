import { describe, expect, it } from 'vitest';
import { BARRIER_X, BARRIER_Z, CISTERN, CULVERT, DESERT_EXTENT, DESERT_TERRAIN, TRENCH, desertHeight, trenchDepth, underFloor } from './Terrain';

describe('desert terrain', () => {
  it('the compound inside the barrier is exactly flat (12.0: but for the culvert cut into it)', () => {
    for (let x = -BARRIER_X + 0.01; x < BARRIER_X; x += 0.7) for (let z = -BARRIER_Z + 0.01; z < BARRIER_Z; z += 0.7) expect(desertHeight(x, z)).toBe(underFloor(x, z) ?? 0);
  });

  it('the culvert: floor 3 m down under its roof, stairs up to the rim at either end, point-symmetric', () => {
    expect(desertHeight(0, 0)).toBe(CULVERT.floor);
    expect(desertHeight(CULVERT.roof - 0.1, 1)).toBe(CULVERT.floor);
    expect(desertHeight(-(CULVERT.top + CULVERT.roof) / 2, 0)).toBeCloseTo(CULVERT.floor / 2);
    expect(desertHeight(CULVERT.top + 0.2, 0)).toBe(0);
    expect(desertHeight(12, CULVERT.z + 0.01)).toBe(0);
    // 56.0: the Cistern: the hall under the middle, each arm's stair up to the yard by its gate.
    expect(desertHeight(0, CISTERN.hall.z - 0.1)).toBe(CULVERT.floor);
    expect(desertHeight(-3, CISTERN.arm.roof - 0.1)).toBe(CULVERT.floor);
    expect(desertHeight(-3, (CISTERN.arm.roof + CISTERN.arm.top) / 2)).toBeCloseTo(CULVERT.floor / 2);
    expect(desertHeight(3, -(CISTERN.arm.roof + CISTERN.arm.top) / 2)).toBeCloseTo(CULVERT.floor / 2);
    expect(desertHeight(-3, CISTERN.arm.end + 0.1)).toBe(0);
    expect(desertHeight(3, 12)).toBe(0);
    for (const [x, z] of [[24, 1], [-23, -1.5], [10, 0.5]]) expect(desertHeight(x, z)).toBe(desertHeight(-x, -z));
  });

  it('slopes stay walkable everywhere players and enemies go (< 22°), and under maxHeight', () => {
    let worst = 0;
    let top = 0;
    const e = 0.25;
    for (let x = -DESERT_EXTENT; x <= DESERT_EXTENT; x += 0.5) {
      for (let z = -DESERT_EXTENT; z <= DESERT_EXTENT; z += 0.5) {
        // The culvert's walls are concrete, not dune: skip its cut.
        if (underFloor(x, z) !== null || underFloor(x + e, z) !== null || underFloor(x - e, z) !== null || underFloor(x, z + e) !== null || underFloor(x, z - e) !== null) continue;
        // 28.0: nor the trenches' (their sides are revetments; their floor is tested below).
        if ([[0, 0], [e, 0], [-e, 0], [0, e], [0, -e]].some(([a, c]) => trenchDepth(x + a, z + c) > 0)) continue;
        const gx = (desertHeight(x + e, z) - desertHeight(x - e, z)) / (2 * e);
        const gz = (desertHeight(x, z + e) - desertHeight(x, z - e)) / (2 * e);
        worst = Math.max(worst, Math.hypot(gx, gz));
        top = Math.max(top, desertHeight(x, z));
      }
    }
    expect(worst).toBeLessThan(0.4);
    expect(top).toBeLessThan(DESERT_TERRAIN.maxHeight);
  });

  it('28.0, the trenches: point-symmetric, 1.3 m down at full depth, ramped out at both ends, a walkable floor', () => {
    const T = TRENCH;
    const mid = ((T.x0 + T.x1) / 2), zm = (T.z0 + T.z1) / 2;
    expect(trenchDepth(mid, zm)).toBe(T.depth);
    expect(trenchDepth(-mid, -zm)).toBe(T.depth);
    expect(trenchDepth(mid, T.z0 + 0.01)).toBeLessThan(0.01);
    expect(trenchDepth(T.x0 - 0.1, zm)).toBe(0);
    for (const [x, z] of [[mid, 20], [-74, 34], [mid, 47]]) expect(desertHeight(x, z)).toBeCloseTo(desertHeight(-x, -z), 6);
    // Its floor (away from the vertical sides), the ramps and the notch included: no steeper than a stair's run (0.55).
    let worst = 0;
    const e = 0.25;
    for (let x = T.x0 + 0.5; x <= T.notch.x1 - 0.5; x += 0.25)
      for (let z = T.z0 + 0.5; z <= T.z1 - 0.5; z += 0.25) {
        const inside = (a: number, c: number) => trenchDepth(a, c) > 0 && (a < T.x1 - e || (c > T.notch.z0 + e && c < T.notch.z1 - e));
        if (![[0, 0], [e, 0], [-e, 0], [0, e], [0, -e]].every(([a, c]) => inside(x + a, z + c))) continue;
        const gx = (desertHeight(x + e, z) - desertHeight(x - e, z)) / (2 * e), gz = (desertHeight(x, z + e) - desertHeight(x, z - e)) / (2 * e);
        worst = Math.max(worst, Math.hypot(gx, gz));
      }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.55);
  });
});
