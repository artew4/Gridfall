import { describe, expect, it } from 'vitest';
import { BASE, QUAY_X, WEST_X, inBase, lanesOf, spawnsOf, stackColor, zoneAt } from './DocksLayout';

describe('Neon Docks layout', () => {
  it('three lanes per team: maze, warehouse, quay; OMEGA\'s are ALPHA\'s mirrored, its left being the quay', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    expect(a.length).toBe(3);
    expect(Math.max(...a[0].map((p) => p.x))).toBeLessThan(-14);
    expect(a[1].every((p) => Math.abs(p.x) < 14)).toBe(true);
    expect(Math.min(...a[2].map((p) => p.x))).toBeGreaterThan(14);
    // OMEGA's left (index 0) is the quay, mirrored in z.
    expect(o[0].map((p) => [p.x, p.z])).toEqual(a[2].map((p) => [p.x, -p.z]));
    expect(o[2].map((p) => [p.x, p.z])).toEqual(a[0].map((p) => [p.x, -p.z]));
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
