import { describe, expect, it } from 'vitest';
import { BASE, CG, EXITS, QG, QUAY_X, WEST_X, WH, inBase, lanesOf, spawnsOf, stackColor, zoneAt } from './DocksLayout';

describe('Neon Docks layout', () => {
  it('three lanes per team: containers (over the gantry), warehouse, waterfront (the quay, through the crane nest); OMEGA\'s mirrored and reversed', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    expect(a.length).toBe(3);
    const mid = (L: { x: number; y: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < 40);
    expect(Math.max(...mid(a[0]).map((p) => p.x))).toBeLessThan(-30);
    expect(mid(a[1]).every((p) => Math.abs(p.x) < 14)).toBe(true);
    expect(Math.min(...mid(a[2]).map((p) => p.x))).toBeGreaterThan(17);
    // 15.0: the flank lanes run raised (the gantries).
    expect(mid(a[0]).filter((p) => p.y > 2).length).toBeGreaterThanOrEqual(4);
    expect(mid(a[2]).filter((p) => p.y > 6).length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 3; i++) expect(o[i].map((p) => [p.x, p.z, p.y])).toEqual(a[2 - i].map((p) => [p.x, -p.z, p.y]));
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
          expect(p.x).toBeLessThan(QUAY_X);
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
