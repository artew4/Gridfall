import { describe, expect, it } from 'vitest';
import { KNEE as NAV_KNEE } from '../../enemies/Nav';
import { BASE, COURT, OUTPOST, RAVINE, STEP, TRENCH, TRENCHES, TUNNEL, X_OUT, Z_END, crashHeight, crashSurface, inBase, laneOf, lanesOf, pitFloor, ravineFloor, spawnsOf, trenchDist, tunnelDist, tunnelRects, tunnelRoofs, tunnelWalls, zoneAt } from './CrashLayout';

describe('Jungle: Crash Site layout', () => {
  it('walkable slopes everywhere a body stands (< 22°): the only steep ground is under the ravine rims', () => {
    const e = 0.25;
    let worst = 0;
    const underRim = (x: number, z: number) =>
      Math.abs(z) < RAVINE.end + 0.5 && ((x > RAVINE.x0 - RAVINE.rim - 0.3 && x < RAVINE.x0 + 0.3) || (x > RAVINE.x1 - 0.3 && x < RAVINE.x1 + RAVINE.rim + 0.3));
    // 33.0: and under the tunnels' walls (their drop lies there, like the rims').
    const underWall = (x: number, z: number) => tunnelDist(x, z) > -0.3 && tunnelDist(x, z) < TUNNEL.wall + 0.3;
    // (The pits' floors follow their stairs: 4 m over 9.6 m, under the steps.)
    const inPit = (x: number, z: number) => x > TUNNEL.pit.x0 - 0.3 && x < TUNNEL.pit.x1 + 0.3 && Math.abs(z) > TUNNEL.pit.z0 - 0.3 && Math.abs(z) < TUNNEL.pit.z1 + 0.3;
    for (let x = -X_OUT; x <= X_OUT; x += 0.5) {
      for (let z = -Z_END; z <= Z_END; z += 0.5) {
        if (underRim(x, z) || underWall(x, z) || inPit(x, z)) continue;
        const gx = (crashHeight(x + e, z) - crashHeight(x - e, z)) / (2 * e);
        const gz = (crashHeight(x, z + e) - crashHeight(x, z - e)) / (2 * e);
        worst = Math.max(worst, Math.hypot(gx, gz));
      }
    }
    expect(worst).toBeLessThan(Math.tan((22 * Math.PI) / 180));
  });

  it('the ravine: its floor between the rims, level with the bank outside them, and the drop is clear of every foot sample', () => {
    // A body against a rim's inner face stands at face + 0.35 and samples ±0.21: all floor.
    for (const z of [-30, 0, 18, 39]) {
      for (const x of [RAVINE.x0 + 0.35 - 0.21, RAVINE.x0 + 1, (RAVINE.x0 + RAVINE.x1) / 2, RAVINE.x1 - 0.35 + 0.21]) expect(crashHeight(x, z)).toBeCloseTo(RAVINE.floor, 1);
      // And against the outer faces: all bank.
      for (const x of [RAVINE.x0 - RAVINE.rim - 0.35 + 0.21, RAVINE.x1 + RAVINE.rim + 0.35 - 0.21]) expect(Math.abs(crashHeight(x, z))).toBeLessThan(0.05);
    }
    expect(ravineFloor(0)).toBe(RAVINE.floor);
    expect(ravineFloor(RAVINE.end)).toBe(0);
    expect(ravineFloor(-45)).toBeCloseTo(ravineFloor(45));
  });

  it('33.1, the ravine\'s end ramps: rims a wall above the knee ray beside them; the ramps level with the ground at the ends', () => {
    // A rim lower than the knee ray over the bank, beside a floor more than a step under it, was a ledge.
    expect(RAVINE.rampRim).toBeGreaterThan(NAV_KNEE + 0.05);
    // Not a step up from the low rims either (a body steps 0.3 m), nor a level the world check walks up to (0.5 m).
    expect(RAVINE.rampRim - RAVINE.rimTop).toBeGreaterThan(0.3);
    expect(RAVINE.rampRim).toBeGreaterThan(0.5);
    expect(RAVINE.rampRim - ravineFloor(RAVINE.end - 0.5)).toBeGreaterThan(0.3);
    // The way out: level with the ground at the end, and beyond it.
    for (const sz of [1, -1]) {
      expect(crashHeight(28.5, sz * RAVINE.end)).toBeCloseTo(0, 5);
      for (const x of [RAVINE.x0 + 0.5, 28.5, RAVINE.x1 - 0.5]) expect(Math.abs(crashHeight(x, sz * (RAVINE.end + 0.5)))).toBeLessThan(0.02);
    }
  });

  it('trenches are 1.4 m down along their lines and fade out at their ends (no step out of them)', () => {
    for (const L of TRENCHES) {
      // 19.0: at the bend (the trenches are shorter: two legs, faded at both ends).
      const [mx, mz] = L[1];
      expect(crashHeight(mx, mz)).toBeLessThan(-TRENCH.depth + 0.2);
      expect(crashHeight(mx, -mz)).toBeCloseTo(crashHeight(mx, mz), 5);
      expect(trenchDist(L[0][0], L[0][1])).toBe(0);
      expect(crashHeight(L[0][0], L[0][1])).toBeGreaterThan(-0.2);
    }
  });

  it('flat yards and approaches; steps a body walks onto are ≤ 0.3 m', () => {
    for (const x of [-12, 0, 12]) for (const z of [BASE.z0 + 1, BASE.z1 - 1, -BASE.z0 - 2]) expect(crashHeight(x, z)).toBe(0);
    expect(STEP).toBeLessThanOrEqual(0.3);
    expect(RAVINE.rimTop).toBeLessThanOrEqual(0.3);
    // 19.0: the hull's deck is level with the upper terrace its doors open onto.
  });

  it('33.0, the tunnels: 4 m down in every space, the pits following their stairs, the surface beyond the walls', () => {
    for (const r of tunnelRects()) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      if (r.kind === 'pit') {
        expect(crashHeight(r.x1 - 0.3, cz)).toBeLessThan(-3.7);
        expect(crashHeight(r.x0 + 0.05, cz)).toBeGreaterThan(-0.3);
        for (const x of [r.x0 + 1, cx, r.x1 - 1]) expect(crashHeight(x, cz)).toBeCloseTo(pitFloor(x), 5);
      } else expect(crashHeight(cx, cz)).toBe(TUNNEL.floor);
    }
    // Beyond the walls the ground is the surface (the slabs lie level with it).
    for (const [x, z] of [[0, 17], [12, 9.4], [-12, 9.4], [20, 17], [-20, 17], [0, -17]]) expect(crashHeight(x, z)).toBeCloseTo(crashSurface(x, z), 6);
    expect(Math.abs(crashSurface(10, 13.5))).toBeLessThan(0.01);
  });

  it('33.0, the walls: a body against one reads only floor, from either side; they cover every point within their thickness, never a space', () => {
    // Inside: against a face a body stands at face + 0.35 and samples ±0.21 (all floor).
    const E = TUNNEL.runs.find((r) => r.name === 'eastRun')!;
    for (const x of [10, 14, 20]) {
      for (const z of [E.z0 + 0.14, E.z1 - 0.14]) expect(crashHeight(x, z)).toBe(TUNNEL.floor);
      // Outside: against the outer face, all surface.
      for (const z of [E.z0 - TUNNEL.wall - 0.14, E.z1 + TUNNEL.wall + 0.14]) expect(crashHeight(x, z)).toBeCloseTo(crashSurface(x, z), 6);
    }
    const walls = tunnelWalls();
    const inBox = (x: number, z: number, b: number[]) => x >= b[0] - 1e-6 && x <= b[2] + 1e-6 && z >= b[1] - 1e-6 && z <= b[3] + 1e-6;
    for (const r of tunnelRects()) for (const b of walls) expect(b[0] < r.x1 - 1e-6 && b[2] > r.x0 + 1e-6 && b[1] < r.z1 - 1e-6 && b[3] > r.z0 + 1e-6).toBe(false);
    // Sample round the spaces: within the thickness, outside them all, not at the ravine (its rim is the
    // wall) nor at a pit's head (its stair comes up there): covered.
    let missing = 0;
    for (let x = TUNNEL.pit.x0 - 1.1; x < RAVINE.x0 - RAVINE.rim; x += 0.37)
      for (let z = -16.1; z <= 16.1; z += 0.37) {
        const d = tunnelDist(x, z);
        const head = x < TUNNEL.pit.x0 && Math.abs(z) > TUNNEL.pit.z0 && Math.abs(z) < TUNNEL.pit.z1;
        if (d > 0.05 && d < TUNNEL.wall - 0.05 && !head && !walls.some((b) => inBox(x, z, b))) missing++;
      }
    expect(missing).toBe(0);
  });

  it('33.0, the roofs: 3.6 m of headroom, over every space but the pits and the hub\'s stairwell', () => {
    expect(TUNNEL.roof - TUNNEL.floor).toBeGreaterThanOrEqual(3.5);
    const roofs = tunnelRoofs();
    const covered = (x: number, z: number) => roofs.some((b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]);
    const S = TUNNEL.hub.stair;
    expect(covered(0, 0)).toBe(false);
    expect(covered(0, 3)).toBe(true);
    expect(covered(5.5, 10)).toBe(true);
    expect(covered(-10, -13.5)).toBe(true);
    expect(covered(-22, 13.5)).toBe(false);
    expect(covered(S.x1 - 0.5, S.z - 0.5)).toBe(false);
    // The pits' stairs reach the floor under the roof's start: headroom over the steps there.
    expect(pitFloor(TUNNEL.roofFrom) + 2.2).toBeLessThan(TUNNEL.roof);
  });

  it('33.0, the outpost: the deck, the lab and its roof step up; the deck stairs land on the deck', () => {
    const O = OUTPOST;
    expect(O.deck.y - O.deck.slab).toBeGreaterThanOrEqual(3.2);
    expect(O.deck.y + O.lab.h + 0.3).toBeCloseTo(O.roof, 5);
    expect(O.stair.z0 - O.deck.z).toBeLessThan(0.3);
    expect(O.stair.x0).toBeLessThan(O.deck.x1);
    // The roof's stairwell opens where a body on the stair would hit the slab (head 1.9 m over the step).
    const stairY = (x: number) => O.deck.y + ((x - O.roofStair.x0) / (O.roofStair.x1 - O.roofStair.x0)) * (O.roof - O.deck.y);
    expect(stairY(O.roofStair.open) + 1.9).toBeLessThan(O.deck.y + O.lab.h);
    // The ground floor stands on the hub's slab (y = 0 at its top); the hub is 4 m under it.
    expect(crashSurface(-8.5, 3)).toBe(0);
  });

  it('mirrored: spawns, lanes (OMEGA\'s are ALPHA\'s reversed and mirrored), zones by height', () => {
    const a = spawnsOf('alpha'), o = spawnsOf('omega');
    expect(a.every((p) => inBase(p, 'alpha'))).toBe(true);
    expect(o.map((p) => [p.x, p.z])).toEqual(a.map((p) => [p.x, -p.z]));
    const la = lanesOf('alpha'), lo = lanesOf('omega');
    expect(la.length).toBe(3);
    for (let i = 0; i < 3; i++) expect(lo[i].map((p) => [p.x, -p.z, +p.y.toFixed(4)])).toEqual(la[2 - i].map((p) => [p.x, p.z, +p.y.toFixed(4)]));
    // The middle of each lane is in its own band.
    const mid = (L: { x: number; y: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < COURT - 4);
    expect(mid(la[0]).every((p) => laneOf(p.x, 0, p.z) === 0)).toBe(true);
    expect(mid(la[1]).every((p) => laneOf(p.x, p.y, p.z) === 1)).toBe(true);
    expect(mid(la[2]).every((p) => laneOf(p.x, 0, p.z) === 2)).toBe(true);
    expect(zoneAt(-39, 3.6, 0)?.name).toBe('THE RIDGE');
    expect(zoneAt(28.5, RAVINE.floor, 0)?.name).toBe('THE RAVINE');
    // 33.0: the outpost's levels and the tunnels, by height.
    expect(zoneAt(-4, OUTPOST.roof, 3)?.name).toBe('LAB ROOF');
    expect(zoneAt(-4, OUTPOST.deck.y, 3)?.name).toBe('THE LAB');
    expect(zoneAt(-10, OUTPOST.deck.y, 3)?.name).toBe('LAB DECK');
    expect(zoneAt(-8, 0, 3)?.name).toBe('UNDER THE LAB');
    expect(zoneAt(-6, TUNNEL.floor, 3)?.name).toBe('TUNNEL HUB');
    expect(zoneAt(15, TUNNEL.floor, 13.5)?.name).toBe('THE TUNNELS');
    expect(zoneAt(15, 0, 13.5)?.name).not.toBe('THE TUNNELS');
    expect(laneOf(15, TUNNEL.floor, 13.5)).toBe(3);
    for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) expect(zoneAt(p.x, p.y, p.z)).not.toBeNull();
    expect(zoneAt(0, 0, 60)?.name).toBe('ALPHA LZ');
  });
});
