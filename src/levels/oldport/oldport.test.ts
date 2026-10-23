import { describe, expect, it } from 'vitest';
import { BASE, DOCK, QUAY_X, SHIP, STACKS, STACK_B, WALK, WH, X_W, Z_END, inBase, laneOf, lanesOf, portHeight, spawnsOf, zoneAt } from './OldPortLayout';
import { carve } from './OldPort';

describe('Old Port layout', () => {
  it('three lanes per team (warehouse, yard, dock); OMEGA\'s are ALPHA\'s mirrored and reversed', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    expect(a.length).toBe(3);
    for (let i = 0; i < 3; i++) expect(o[i].map((p) => [p.x, -p.z, p.y])).toEqual(a[2 - i].map((p) => [p.x, p.z, p.y]));
    const mid = (L: { x: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < 30);
    expect(mid(a[0]).every((p) => laneOf(p.x, 0, p.z) === 0)).toBe(true);
    expect(mid(a[1]).every((p) => laneOf(p.x, 0, p.z) === 1)).toBe(true);
    expect(mid(a[2]).every((p) => laneOf(p.x, 0, p.z) === 2)).toBe(true);
  });

  it('every lane has its own level: the warehouse\'s upper floor, the stacks and the walk, the dock floor under the hull', () => {
    const [w, y, d] = lanesOf('alpha');
    expect(w.filter((p) => p.y === WH.up).length).toBeGreaterThanOrEqual(4);
    expect(y.filter((p) => p.y === STACKS.top).length).toBeGreaterThanOrEqual(3);
    // 37.0: the dock lane runs the length of UNDER THE HULL (was up over the ship's bridge).
    const under = d.filter((p) => p.y === DOCK.floor && Math.abs(p.z) < SHIP.z && p.x > SHIP.x0 - 1 && p.x < SHIP.x1 + 1);
    expect(under.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...under.map((p) => p.z))).toBeLessThan(-8);
    expect(Math.max(...under.map((p) => p.z))).toBeGreaterThan(8);
    // The walk joins the stacks to STACK B at their height.
    expect(WALK.x0).toBe(STACKS.x1);
    expect(WALK.x1).toBe(STACK_B.x0);
  });

  it('lanes start at the team\'s own exits, end short of the other yard, and stay inside the map', () => {
    for (const t of ['alpha', 'omega'] as const) {
      const own = t === 'alpha' ? 1 : -1;
      for (const L of lanesOf(t)) {
        expect(L[0].z * own).toBeGreaterThan(40);
        expect(L[L.length - 1].z * own).toBeLessThan(-37);
        for (const p of L) {
          expect(inBase(p, t === 'alpha' ? 'omega' : 'alpha')).toBe(false);
          expect(p.x).toBeGreaterThan(X_W);
          expect(p.x).toBeLessThan(QUAY_X);
          expect(Math.abs(p.z)).toBeLessThan(Z_END);
        }
      }
    }
  });

  it('eight spawns per team in its own yard, mirrored', () => {
    const a = spawnsOf('alpha'), o = spawnsOf('omega');
    expect(a.length).toBe(8);
    expect(a.every((p) => inBase(p, 'alpha') && !inBase(p, 'omega'))).toBe(true);
    expect(o.map((p) => [p.x, p.z])).toEqual(a.map((p) => [p.x, -p.z]));
    expect(a.every((p) => p.z > BASE.z0 && p.z < BASE.z1)).toBe(true);
  });

  it('the dry dock is carved inside its walls\' colliders (a body against a wall never reads the quay)', () => {
    // A body against a wall's inner face stands 0.35 m out and samples 0.21 m round its centre.
    for (const z of [-30, 0, 20]) {
      expect(portHeight(DOCK.x0 + 0.35 - 0.21, z)).toBe(DOCK.floor);
      expect(portHeight(DOCK.x1 - 0.35 + 0.21, z)).toBe(DOCK.floor);
      // And outside the walls, on the quays: flat.
      expect(portHeight(DOCK.x0 - DOCK.wall - 0.01, z)).toBe(0);
      expect(portHeight(DOCK.x1 + DOCK.wall + 0.01, z)).toBe(0);
    }
    expect(portHeight(30, DOCK.z - 0.35 + 0.21)).toBe(DOCK.floor);
    expect(portHeight(30, DOCK.z + DOCK.wall + 0.01)).toBe(0);
    expect(portHeight(30, -DOCK.z + 0.3)).toBe(DOCK.floor);
  });

  it('zones: callouts by floor (upper floor, stacks, deck, bridge, dock), every lane point named', () => {
    expect(zoneAt(-36, WH.up, 10)?.name).toBe('UPPER FLOOR');
    expect(zoneAt(-36, 0, 10)?.name).toBe('BRICK WAREHOUSE');
    expect(zoneAt(-14, STACKS.top, 20.4)?.name).toBe('THE STACKS');
    expect(zoneAt(30, SHIP.house.roof, 0)?.name).toBe('THE BRIDGE');
    expect(zoneAt(28, SHIP.deck, 10)?.name).toBe('THE DECK');
    expect(zoneAt(25.8, DOCK.floor, 20)?.name).toBe('DRY DOCK');
    expect(zoneAt(40, 0, 0)?.name).toBe('SEA QUAY');
    expect(zoneAt(0, 0, 57)?.name).toBe('ALPHA YARD');
    expect(zoneAt(0, 0, -57)?.name).toBe('OMEGA YARD');
    for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) expect(zoneAt(p.x, p.y, p.z)).not.toBeNull();
  });

  it('carve: a slab minus its holes covers exactly the rest', () => {
    const r: [number, number, number, number] = [0, 0, 10, 10];
    const holes: [number, number, number, number][] = [[2, 2, 4, 6], [6, 0, 8, 3]];
    const parts = carve(r, holes);
    const area = (q: [number, number, number, number]) => (q[2] - q[0]) * (q[3] - q[1]);
    expect(parts.reduce((s, q) => s + area(q), 0)).toBeCloseTo(100 - 8 - 6, 6);
    for (const q of parts) for (const h of holes) {
      const overlap = Math.max(0, Math.min(q[2], h[2]) - Math.max(q[0], h[0])) * Math.max(0, Math.min(q[3], h[3]) - Math.max(q[1], h[1]));
      expect(overlap).toBe(0);
    }
  });
});
