import { describe, expect, it } from 'vitest';
import { BAFFLES, BARRELS, BARRIERS, BLOCKERS, CONT, DOCK, GATES, OLDPORT_AI, SPINE, SPINE_SEGMENTS, forwardOf, lanesOf, navCost } from './OldPortLayout';

const by = (name: string) => BLOCKERS.find((b) => b.name === name)!;
/** Do these x ranges, together, cover [lo, hi] without a gap? */
function covers(ranges: [number, number][], lo: number, hi: number) {
  let cur = lo;
  for (const [a, b] of ranges.slice().sort((p, q) => p[0] - q[0])) {
    if (a > cur + 1e-6) return false;
    cur = Math.max(cur, b);
  }
  return cur >= hi - 1e-6;
}

describe('23.0: Old Port overhaul, the long lines cut by width', () => {
  it('the west quay (yard edge to the dock wall\'s far face) is covered: bulldozer, cargo stack, the scaffold over the wall', () => {
    expect(covers([by('bulldozer').x, by('cargo stack').x, by('scaffold west outer').x], 17.9, DOCK.x0)).toBe(true);
  });
  it('each dry dock channel is covered by its two staggered scaffold towers (and they rise over the quay)', () => {
    expect(covers([by('scaffold west outer').x, by('scaffold west inner').x], DOCK.x0, 27.6)).toBe(true);
    expect(covers([by('scaffold east inner').x, by('scaffold east outer').x], 32.4, DOCK.x1)).toBe(true);
    for (const n of ['scaffold west outer', 'scaffold west inner', 'scaffold east outer', 'scaffold east inner']) expect(by(n).h).toBeGreaterThan(1.65);
    // Staggered with room to turn between them (bots jammed in a 2 m zig-zag), and well clear of the dock-end stairs (28.5).
    expect(by('scaffold west outer').z[0] - by('scaffold west inner').z[1]).toBeGreaterThanOrEqual(3);
    expect(28.5 - by('scaffold west outer').z[1]).toBeGreaterThanOrEqual(4);
  });
  it('the sea quay, the alley and the hall\'s door-to-door line are covered', () => {
    expect(covers([by('scaffold east outer').x, by('sea cargo').x, by('sea cargo 2').x], DOCK.x1, 43.88)).toBe(true);
    expect(covers([by('alley pallets').x, by('alley pallets 2').x], -27, -22)).toBe(true);
    expect(covers([by('hall cargo').x], -37.5, -33.5)).toBe(true);
  });
});

describe('23.0: the container maze (THE SPINE)', () => {
  it('spans the yard: its containers and gates cover x −22 … 18; every gate is 3.5 m and baffled on its full width', () => {
    expect(covers([...SPINE_SEGMENTS, ...GATES], SPINE.x0, SPINE.x1)).toBe(true);
    for (const [g0, g1] of GATES) {
      expect(g1 - g0).toBeCloseTo(3.5, 2);
      expect(BAFFLES.some((b) => b.x[0] <= g0 && b.x[1] >= g1)).toBe(true);
    }
    expect(SPINE.top).toBe(CONT.H);
  });
  it('the yard lane goes over it (its top at mid-field), and the high ground is the cheap way across', () => {
    const yard = lanesOf('alpha')[1];
    expect(yard.some((p) => p.y === SPINE.top && Math.abs(p.z) < 0.01)).toBe(true);
    expect(navCost({ x: 0, y: 3.6, z: 0 }, { x: 2.5, y: 3.6, z: 0 })).toBeLessThan(1);
    expect(navCost({ x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 10 })).toBe(1);
    // The warehouse's upper floor (4.4) is not the yard's high ground.
    expect(navCost({ x: -36, y: 5.4, z: 0 }, { x: -36, y: 5.4, z: 3 })).toBe(1);
  });
});

describe('23.0: density and flow', () => {
  it('forward points are level (a respawn takes the most forward safe one) and mirrored, one per lane mouth', () => {
    const a = forwardOf('alpha'), o = forwardOf('omega');
    expect(new Set(a.map((p) => p.z)).size).toBe(1);
    expect(o.map((p) => [p.x, -p.z])).toEqual(a.map((p) => [p.x, p.z]));
    expect(a.some((p) => p.x < -27)).toBe(true); // warehouse
    expect(a.some((p) => p.x > 18)).toBe(true); // dock side
  });
  it('the port\'s AI: under fire, flankers, cover-hop pushes, and no straight walk at a goal far above', () => {
    expect(OLDPORT_AI.underFire?.on).toBe(true);
    expect(OLDPORT_AI.coverPush?.on).toBe(true);
    expect(OLDPORT_AI.directRise).toBe(1);
  });
  it('micro-cover is waist-high and never against a dock wall (a stand-on step out of the dock)', () => {
    for (const [x, , along, y = 0] of BARRIERS) if (y === DOCK.floor) expect(Math.min(Math.abs(x - DOCK.x0), Math.abs(x - DOCK.x1))).toBeGreaterThan((along === 'z' ? 0.3 : 1.1) + 0.8);
    for (const [x, , y = 0] of BARRELS) if (y === DOCK.floor) expect(Math.min(Math.abs(x - DOCK.x0), Math.abs(x - DOCK.x1))).toBeGreaterThan(1.1);
    expect(BARRIERS.length + BARRELS.length).toBeGreaterThanOrEqual(20);
  });
});
