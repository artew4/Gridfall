import { describe, expect, it } from 'vitest';
import { BARGES, BASE, CAB, CONT, CRANE_STAIR, DEPOT, DRAINS, EXITS, HALL, MAZE, MAZE_WEST, QG, QUAY_WALLS, QUAY_X, TOWER, WEST_X, WH, inBase, lanesOf, spawnsOf, stackColor, zoneAt } from './DocksLayout';

describe('Neon Docks layout', () => {
  it('three lanes per team: containers (through the maze), warehouse, waterfront (the quay, through the crane nest); OMEGA\'s mirrored and reversed', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    // 28.0: and the two edges after them (the old depot, the barges).
    expect(a.length).toBe(5);
    const mid = (L: { x: number; y: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < 40);
    expect(Math.max(...mid(a[0]).map((p) => p.x))).toBeLessThan(-30);
    expect(mid(a[1]).every((p) => Math.abs(p.x) < 14)).toBe(true);
    expect(Math.min(...mid(a[2]).map((p) => p.x))).toBeGreaterThan(17);
    // 49.0: the containers' lane on the ground (the gantry over the maze is gone), the waterfront's up
    // the crane stair and through the cab.
    expect(mid(a[0]).every((p) => p.y === 0)).toBe(true);
    expect(mid(a[2]).filter((p) => p.y > 6).length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 3; i++) expect(o[i].map((p) => [p.x, p.z, p.y])).toEqual(a[2 - i].map((p) => [p.x, -p.z, p.y]));
    for (let i = 3; i < 5; i++) expect(o[i].map((p) => [p.x, p.z, p.y])).toEqual(a[7 - i].map((p) => [p.x, -p.z, p.y]));
    // 28.0: the edges run outside the old map: west of the maze, out on the water.
    expect(Math.max(...mid(a[3]).map((p) => p.x))).toBeLessThan(MAZE_WEST);
    expect(Math.min(...mid(a[4]).map((p) => p.x))).toBeGreaterThan(QUAY_X + 2);
  });

  it('15.0: the yards open only to the flanks (no centre exit); 32.0: the 7 m warehouse roofed, its parapet out of reach', () => {
    expect(EXITS).toEqual([-17, 17]);
    expect(WH.h).toBe(7);
    expect(WH.roof).toBeGreaterThan(WH.h);
    // The highest stand near it: the quay gantry's armoured rail (deck + 1.1 m); a jump adds 1 m.
    expect(WH.parapet).toBeGreaterThan(QG.y + 1.1 + 1 + 0.3);
    expect(zoneAt(19.2, QG.y, 10)?.name).toBe('QUAY GANTRY');
    expect(zoneAt(21.3, QG.y, 0)?.name).toBe('CRANE NEST');
    expect(zoneAt(17, TOWER.z0 > 0 ? 4.5 : 0, 25)?.name).toBe('STAIR TOWER');
    expect(zoneAt(17, 0, 25)?.name).not.toBe('STAIR TOWER');
    expect(zoneAt(23, CRANE_STAIR.mid, -16.75)?.name).toBe('CRANE STAIR');
    expect(zoneAt(0, 0, 0)?.name).toBe("FOREMAN'S OFFICE");
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

describe('32.0: the docks overhaul', () => {
  it('9v9; the spread (ARENA.space) on through the docks profile only; never straight up at a goal', async () => {
    const { DOCKS_AI, DOCKS_TEAM_SIZE } = await import('./DocksLayout');
    const { ARENA, applyProfile } = await import('../../enemies/arena/ArenaCtx');
    expect(DOCKS_TEAM_SIZE).toBe(9);
    expect(ARENA.space.on).toBe(false);
    const undo = applyProfile(DOCKS_AI);
    expect(ARENA.space.on).toBe(true);
    expect(ARENA.directRise).toBe(1);
    undo();
    expect(ARENA.space.on).toBe(false);
  });

  it('the centre zone is forward on the forecourt, off the main door\'s axis; the flanks kept', async () => {
    const { SPAWN_ZONES } = await import('./DocksLayout');
    const [a, b, c] = SPAWN_ZONES.half;
    expect(b.z).toBeLessThan(BASE.z0);
    expect(b.z).toBeGreaterThan(WH.z1);
    // The main doors (x -2 … 2) line up: a centre on that line sees its mirror's through both.
    expect(Math.abs(b.x)).toBeGreaterThan(2);
    expect(a.x).toBeLessThan(MAZE_WEST);
    expect(c.x).toBeGreaterThan(WH.x1);
  });
});

describe('49.0: the docks reworked', () => {
  const cover = (spans: [number, number][], a: number, b: number) => {
    // Is [a, b] covered by the union of spans (a seam under 0.3 m passes no body, nor most of a sightline)?
    let at = a;
    for (const [s0, s1] of spans.slice().sort((p, q) => p[0] - q[0])) if (s0 <= at + 0.25 && s1 > at) at = s1;
    return at >= b - 1e-6;
  };
  it('the maze is brick-bond: every line along z through it meets a container', () => {
    const PATTERN: ('x' | 'z')[][] = [['x', 'x', 'z', 'x'], ['z', 'x', 'z', 'x'], ['z', 'x', 'z', 'x'], ['z', 'z', 'x', 'z']];
    const spans: [number, number][] = [];
    MAZE.zs.forEach((_, j) => MAZE.xs.forEach((cx, i) => {
      const x = cx + (j % 2 ? MAZE.shift : 0), h = (PATTERN[j][i] === 'x' ? CONT.L : CONT.W) / 2;
      spans.push([x - h, x + h]);
    }));
    // From the depot's corridor (its east boxes end at -56.78; the new wall closes -56.5 … -50.5 at z ±20) to the alley stack at x -20.7.
    spans.push([-56.53, -50.47], [-21.92, -19.48]);
    expect(cover(spans, -56.5, -19.5)).toBe(true);
  });

  it('the quay: its two walls close every line along it, each open at the other end (a zig-zag)', () => {
    const [w1, w2] = QUAY_WALLS;
    const end1 = w1.x0 + w1.n * CONT.L, end2 = w2.x0 + w2.n * CONT.L;
    // The first open by the water, the second at its west end (past the crane stair).
    expect(QUAY_X - end1).toBeGreaterThan(3);
    expect(w2.x0 - CRANE_STAIR.foot).toBeGreaterThan(1.3);
    expect(cover([[TOWER.flight.x0, TOWER.flight.x1], [w1.x0, end1], [w2.x0, end2]], TOWER.flight.x0, QUAY_X - 0.1)).toBe(true);
    // Across the middle: the second wall, the crane stair, the block under the gantry, the stack under the crane.
    expect(cover([[w2.x0, end2], [QG.x1, CRANE_STAIR.foot], [TOWER.x0, QG.x1], [29, 29 + CONT.L]], TOWER.x0, QUAY_X - 0.1)).toBe(true);
    // The second wall meets the fence, and leaves the barges' gangways clear.
    expect(w2.x0 + w2.n * CONT.L).toBeCloseTo(QUAY_X - 0.1, 2);
    for (const g of BARGES.gangways) expect(g.z0).toBeGreaterThan(w2.z + CONT.W / 2);
  });

  it('the warehouse floor: no line along it from door to door; the stair towers open on the catwalks', () => {
    const spans: [number, number][] = [[HALL.block.cx - CONT.L / 2, HALL.block.cx + CONT.L / 2], ...HALL.racks.map((r) => [r.x0, r.x1] as [number, number]), [HALL.office.x0, HALL.office.x1]];
    expect(cover(spans, WH.x0 + 0.4, WH.x1 - 0.4)).toBe(true);
    // The towers' doors are at catwalk height, inside the warehouse's length.
    expect(TOWER.door).toBeLessThan(WH.z1);
    expect(TOWER.z0).toBe(QG.z);
  });

  it('the barges: cargo from alternate rails, a way past each (≥ 1.3 m), no line down the decks', () => {
    const [h] = BARGES.hulls;
    const inner: [number, number] = [h.x0 + 0.3, h.x1 - 0.3];
    for (const [x0, , x1] of BARGES.cargo) {
      expect(Math.max(x0 - inner[0], inner[1] - x1)).toBeGreaterThanOrEqual(1.3);
      expect(Math.min(Math.abs(x0 - inner[0]), Math.abs(inner[1] - x1))).toBeLessThan(0.01);
    }
    const [a, b] = BARGES.cargo;
    expect(cover([[a[0], a[2]], [b[0], b[2]]], inner[0], inner[1])).toBe(true);
  });

  it('the cab closes the gantry: its doors both by the west wall, behind the column', () => {
    expect(CAB.x0).toBe(QG.x0);
    expect(CAB.x1).toBe(QG.nest.x1);
    expect(DEPOT.wall.top).toBeCloseTo(3 * CONT.H);
    expect(DEPOT.wall.top).toBeGreaterThan(DEPOT.stack.top + 1.6);
    expect(zoneAt(-64, DEPOT.stack.top, 18)?.name).toBe('SNIPER STACK');
    expect(MAZE_WEST).toBeGreaterThan(WEST_X);
  });
});

describe('86.0: the apron drains', () => {
  it('lids on the apron: outside the warehouse, on this side of the quay fence, inside the yards; some steaming', () => {
    for (const [x, z] of DRAINS.manholes) {
      expect(x > WH.x0 - 0.5 && x < WH.x1 + 0.5 && z < WH.z1 + 0.5).toBe(false);
      expect(x).toBeLessThan(QUAY_X - 0.5);
      expect(x).toBeGreaterThan(WEST_X + 0.5);
      expect(z).toBeLessThan(BASE.z1);
    }
    expect(DRAINS.manholes.filter((m) => m[2]).length).toBeGreaterThanOrEqual(2);
  });
  it("the grates along the warehouse's long walls, inside its length", () => {
    for (const z of DRAINS.grates) expect(z + 0.45).toBeLessThan(WH.z1);
  });
});
