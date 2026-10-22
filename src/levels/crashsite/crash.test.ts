import { describe, expect, it } from 'vitest';
import { BASE, COURT, GATE, RAVINE, SHRINE, STEP, T1, T2, TRENCH, TRENCHES, WRECK, X_OUT, Z_END, crashHeight, inBase, laneOf, lanesOf, ravineFloor, spawnsOf, trenchDist, zoneAt } from './CrashLayout';

describe('Jungle: Crash Site layout', () => {
  it('walkable slopes everywhere a body stands (< 22°): the only steep ground is under the ravine rims', () => {
    const e = 0.25;
    let worst = 0;
    const underRim = (x: number, z: number) =>
      Math.abs(z) < RAVINE.end + 0.5 && ((x > RAVINE.x0 - RAVINE.rim - 0.3 && x < RAVINE.x0 + 0.3) || (x > RAVINE.x1 - 0.3 && x < RAVINE.x1 + RAVINE.rim + 0.3));
    for (let x = -X_OUT; x <= X_OUT; x += 0.5) {
      for (let z = -Z_END; z <= Z_END; z += 0.5) {
        if (underRim(x, z)) continue;
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
    expect(WRECK.floor).toBe(T2.y);
  });

  it('19.0, the temple: the gate and the undercroft are ground level with headroom; the levels step up to the shrine', () => {
    for (const [x, z] of [[0, T1.zOut - 1], [0, T2.zOut - 1], [0, 0], [-8, 0], [8, -1.5]]) expect(crashHeight(x, z)).toBe(0);
    expect(WRECK.belly).toBeGreaterThanOrEqual(2.1);
    expect(T2.y - T2.slab).toBeGreaterThanOrEqual(2.1);
    expect(GATE * 2).toBeGreaterThanOrEqual(3);
    expect(T1.y).toBeLessThan(T2.y);
    expect(T2.y).toBeLessThan(WRECK.roof);
    expect(WRECK.roof).toBeLessThan(SHRINE.top);
    // The flat ground round the temple and its front stairs (they stand on y = 0).
    for (const x of [-11, -7, 7, 11]) expect(Math.abs(crashHeight(x, T1.zOut + 4.6))).toBeLessThan(0.02);
  });

  it('mirrored: spawns, lanes (OMEGA\'s are ALPHA\'s reversed and mirrored), zones by height', () => {
    const a = spawnsOf('alpha'), o = spawnsOf('omega');
    expect(a.every((p) => inBase(p, 'alpha'))).toBe(true);
    expect(o.map((p) => [p.x, p.z])).toEqual(a.map((p) => [p.x, -p.z]));
    const la = lanesOf('alpha'), lo = lanesOf('omega');
    expect(la.length).toBe(3);
    for (let i = 0; i < 3; i++) expect(lo[i].map((p) => [p.x, -p.z, +p.y.toFixed(4)])).toEqual(la[2 - i].map((p) => [p.x, p.z, +p.y.toFixed(4)]));
    // The middle of each lane is in its own band.
    const mid = (L: { x: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < COURT - 4);
    expect(mid(la[0]).every((p) => laneOf(p.x, 0, p.z) === 0)).toBe(true);
    expect(mid(la[1]).every((p) => laneOf(p.x, 0, p.z) === 1)).toBe(true);
    expect(mid(la[2]).every((p) => laneOf(p.x, 0, p.z) === 2)).toBe(true);
    expect(zoneAt(-39, 3.6, 0)?.name).toBe('THE RIDGE');
    expect(zoneAt(28.5, RAVINE.floor, 0)?.name).toBe('THE RAVINE');
    expect(zoneAt(-4, WRECK.roof, 0)?.name).toBe('WRECK ROOF');
    expect(zoneAt(-4, WRECK.floor, 0)?.name).toBe('THE HULL');
    expect(zoneAt(-4, 0, 0)?.name).toBe('UNDERCROFT');
    expect(zoneAt(0, 0, 12)?.name).toBe('UNDERCROFT');
    expect(zoneAt(-8, T1.y, 12)?.name).toBe('TEMPLE TERRACE');
    expect(zoneAt(-8, T2.y, 6)?.name).toBe('UPPER TERRACE');
    expect(zoneAt(-16, SHRINE.top, 2)?.name).toBe('THE SHRINE');
    for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) expect(zoneAt(p.x, p.y, p.z)).not.toBeNull();
    expect(zoneAt(0, 0, 60)?.name).toBe('ALPHA LZ');
  });
});
