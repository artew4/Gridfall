import { describe, expect, it } from 'vitest';
import { BARGES, BASE, CG, CONT, DEPOT, EXITS, MAZE_WEST, QG, QUAY_X, WEST_X, WH, inBase, lanesOf, spawnsOf, stackColor, zoneAt } from './DocksLayout';

describe('Neon Docks layout', () => {
  it('three lanes per team: containers (over the gantry), warehouse, waterfront (the quay, through the crane nest); OMEGA\'s mirrored and reversed', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    // 28.0: and the two edges after them (the old depot, the barges).
    expect(a.length).toBe(5);
    const mid = (L: { x: number; y: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < 40);
    expect(Math.max(...mid(a[0]).map((p) => p.x))).toBeLessThan(-30);
    expect(mid(a[1]).every((p) => Math.abs(p.x) < 14)).toBe(true);
    expect(Math.min(...mid(a[2]).map((p) => p.x))).toBeGreaterThan(17);
    // 15.0: the flank lanes run raised (the gantries).
    expect(mid(a[0]).filter((p) => p.y > 2).length).toBeGreaterThanOrEqual(4);
    expect(mid(a[2]).filter((p) => p.y > 6).length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 3; i++) expect(o[i].map((p) => [p.x, p.z, p.y])).toEqual(a[2 - i].map((p) => [p.x, -p.z, p.y]));
    for (let i = 3; i < 5; i++) expect(o[i].map((p) => [p.x, p.z, p.y])).toEqual(a[7 - i].map((p) => [p.x, -p.z, p.y]));
    // 28.0: the edges run outside the old map: west of the maze, out on the water.
    expect(Math.max(...mid(a[3]).map((p) => p.x))).toBeLessThan(MAZE_WEST);
    expect(Math.min(...mid(a[4]).map((p) => p.x))).toBeGreaterThan(QUAY_X + 2);
  });

  it('15.0: the yards open only to the flanks (no centre exit), the warehouse is roofless and 7 m', () => {
    expect(EXITS).toEqual([-17, 17]);
    expect(WH.h).toBe(7);
    expect(zoneAt(19.2, QG.y, 10)?.name).toBe('QUAY GANTRY');
    expect(zoneAt(21.3, QG.y, 0)?.name).toBe('CRANE NEST');
    expect(zoneAt(-45, CG.y, 10)?.name).toBe('CONTAINER GANTRY');
    expect(zoneAt(-45, 0, 10)?.name).not.toBe('CONTAINER GANTRY');
  });

  it('lanes start at the team\'s own exits, end short of the other yard, and stay inside the map', () => {
    for (const t of ['alpha', 'omega'] as const) {
      for (const L of lanesOf(t)) {
        const own = t === 'alpha' ? 1 : -1;
        expect(L[0].z * own).toBeGreaterThan(50);
        expect(L[L.length - 1].z * own).toBeLessThan(-45);
        for (const p of L) {
          expect(inBase(p, t === 'alpha' ? 'omega' : 'alpha')).toBe(false);
          expect(p.x).toBeGreaterThan(WEST_X);
          // 28.0: the barges' lane runs past the quay, on the decks.
          expect(p.x).toBeLessThan(BARGES.hulls[0].x1);
        }
      }
    }
  });

  it('eight spawns per team, all inside its own yard, mirrored', () => {
    const a = spawnsOf('alpha'), o = spawnsOf('omega');
    expect(a.length).toBe(8);
    expect(a.every((p) => inBase(p, 'alpha') && !inBase(p, 'omega'))).toBe(true);
    expect(o.map((p) => [p.x, p.z])).toEqual(a.map((p) => [p.x, -p.z]));
    expect(a.every((p) => p.z > BASE.z0 && p.z < BASE.z1)).toBe(true);
  });

  it('zones: callouts by colour (blue on ALPHA\'s side, red on OMEGA\'s), catwalks by height, every lane named', () => {
    expect(stackColor(30)).toBe('blue');
    expect(stackColor(0)).toBe('yellow');
    expect(stackColor(-30)).toBe('red');
    expect(zoneAt(-37, 0, 30)?.name).toBe('BLUE STACKS');
    expect(zoneAt(-37, 0, -30)?.name).toBe('RED STACKS');
    expect(zoneAt(-37, 2.6, 0)?.name).toBe('YELLOW STACKS');
    expect(zoneAt(0, 0, 10)?.name).toBe('WAREHOUSE 7');
    expect(zoneAt(-12, 4.5, 10)?.name).toBe('CATWALKS');
    expect(zoneAt(32, 0, 0)?.name).toBe('THE CRANE');
    expect(zoneAt(32, 0, 30)?.name).toBe('SOUTH QUAY');
    expect(zoneAt(0, 0, 70)?.name).toBe('ALPHA SPAWN');
    expect(zoneAt(0, 0, -70)?.name).toBe('OMEGA SPAWN');
    for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) expect(zoneAt(p.x, 0, p.z)).not.toBeNull();
  });
});

describe('28.0: the wider docks', () => {
  it('the barges make one route on the water: hull, pontoon, hull … end to end, below the quay', () => {
    const spans: [number, number][] = [];
    for (const h of BARGES.hulls) spans.push([h.z0, h.z1], [-h.z1, -h.z0]);
    for (const p of BARGES.pontoons) spans.push([p.z0, p.z1], [-p.z1, -p.z0]);
    spans.push([BARGES.middle.z0, BARGES.middle.z1]);
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeCloseTo(spans[i - 1][1], 5);
    expect(BARGES.deck).toBeLessThan(0);
    expect(BARGES.hulls.every((h) => h.x0 > QUAY_X + 2)).toBe(true);
    // Every hull has a gangway to the quay inside its length.
    for (const h of BARGES.hulls) expect(BARGES.gangways.some((g) => g.z0 > h.z0 && g.z1 < h.z1)).toBe(true);
  });

  it("the old depot lies west of the maze's old wall; the sniper stack is two containers up", () => {
    expect(WEST_X).toBeLessThan(MAZE_WEST - 10);
    for (const [cx] of DEPOT.boxes) expect(cx).toBeLessThan(MAZE_WEST);
    expect(DEPOT.stack.top).toBeCloseTo(2 * CONT.H);
    expect(zoneAt(-66.6, 0, 12)?.name).toBe('OLD DEPOT');
    expect(zoneAt(-64, DEPOT.stack.top, 18)?.name).toBe('SNIPER STACK');
    expect(zoneAt(-64, 0, 18)?.name).toBe('OLD DEPOT');
    expect(zoneAt(52, BARGES.deck, 20)?.name).toBe('THE BARGES');
  });
});
