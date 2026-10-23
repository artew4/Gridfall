import { describe, expect, it } from 'vitest';
import { CRADLE, DOCK, LAMP, LAMPS, SHIP, SPAWN_ZONES, STANDS, STAND_R, UNDER_COVER, UNDER_HVAS, lanesOf, zoneAt } from './OldPortLayout';

type Box = { name: string; x: [number, number]; z: [number, number] };
/** Every piece on the room's floor as a box, both halves (the stands as their squares). */
function pieces(): Box[] {
  const out: Box[] = [];
  for (const c of UNDER_COVER) {
    out.push({ name: c.name, x: c.x, z: c.z });
    if (!c.mid) out.push({ name: c.name + ' (N)', x: c.x, z: [-c.z[1], -c.z[0]] });
  }
  for (const [x, z] of STANDS) for (const s of [1, -1]) out.push({ name: `stand ${x},${s * z}`, x: [x - STAND_R, x + STAND_R], z: [s * z - STAND_R, s * z + STAND_R] });
  return out;
}
/** The clear distance between two boxes (0 when they touch or overlap). */
function gap(a: Box, b: Box) {
  const dx = Math.max(0, a.x[0] - b.x[1], b.x[0] - a.x[1]);
  const dz = Math.max(0, a.z[0] - b.z[1], b.z[0] - a.z[1]);
  return Math.hypot(dx, dz);
}

describe('37.0: UNDER THE HULL', () => {
  it('the hull is raised: 3.6 m over the dock floor, 3.25 m under the cradle beams, the deck where the gangways meet it', () => {
    expect(SHIP.keel - DOCK.floor).toBeCloseTo(3.6, 5);
    expect(SHIP.keel - CRADLE.depth - DOCK.floor).toBeGreaterThan(3.2);
    expect(SHIP.deck).toBe(1.0);
    // A bot's jump (5 m/s up, gravity 15: 0.83 m) and its 1.9 m head stay under the beams.
    expect(1.9 + (5 * 5) / (2 * 15)).toBeLessThan(SHIP.keel - CRADLE.depth - DOCK.floor);
  });

  it('no slot a body sticks in: every gap between two pieces is 0 or at least 1.3 m (a body is 0.9 m)', () => {
    const ps = pieces();
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const g = gap(ps[i], ps[j]);
        expect(g === 0 || g >= 1.3, `${ps[i].name} – ${ps[j].name}: ${g.toFixed(2)} m`).toBe(true);
      }
  });

  it('nothing within 1.1 m of a dock wall (the carve line), and the room keeps 1.3 m passages along both walls', () => {
    for (const p of pieces()) {
      expect(p.x[0] - DOCK.x0, p.name).toBeGreaterThanOrEqual(1.1);
      expect(DOCK.x1 - p.x[1], p.name).toBeGreaterThanOrEqual(1.1);
    }
  });

  it('full-height pieces stand under the hull; in the open channels only waist-high cover (no perch reached from the quay)', () => {
    for (const c of UNDER_COVER) {
      const underHull = c.x[0] >= SHIP.x0 && c.x[1] <= SHIP.x1;
      if (!underHull) expect(c.h !== 'keel' && c.h <= 1.05, c.name).toBe(true);
      if (c.h !== 'keel' && c.h <= 1.05) continue;
      expect(underHull, c.name).toBe(true);
    }
    for (const [x, z] of STANDS) {
      expect(x - STAND_R).toBeGreaterThan(SHIP.x0);
      expect(x + STAND_R).toBeLessThan(SHIP.x1);
      expect(z).toBeLessThan(SHIP.z);
    }
  });

  it('the lamps hang under the hull, over head height; three real lights in all (the light budget)', () => {
    for (const L of LAMPS) {
      expect(L.x).toBeGreaterThan(SHIP.x0);
      expect(L.x).toBeLessThan(SHIP.x1);
      expect(SHIP.keel - LAMP.drop - DOCK.floor).toBeGreaterThan(2.4);
    }
    // The middle's once, the rest mirrored: nine lamps, three lights.
    expect(LAMPS.reduce((n, l) => n + (l.z === 0 ? 1 : 2), 0)).toBe(9);
    expect(LAMPS.filter((l) => l.light).reduce((n, l) => n + (l.z === 0 ? 1 : 2), 0)).toBe(3);
  });

  it('is its own zone (the room, below the deck), and the dock lane runs through it', () => {
    expect(zoneAt(30, DOCK.floor, 5)?.id).toBe('underHull');
    expect(zoneAt(25.5, DOCK.floor, -10)?.id).toBe('underHull');
    expect(zoneAt(30, DOCK.floor, 25)?.id).toBe('dryDock');
    expect(zoneAt(30, SHIP.deck, 5)?.id).toBe('deck');
    const dock = lanesOf('alpha')[2];
    expect(dock.filter((p) => zoneAt(p.x, p.y, p.z)?.id === 'underHull').length).toBeGreaterThanOrEqual(4);
  });

  it('the patrols search its corners, both halves, clear of every piece of cover', () => {
    expect(UNDER_HVAS.length).toBe(6);
    for (const [x, y, z] of UNDER_HVAS) {
      expect(zoneAt(x, y, z)?.id).toBe('underHull');
      for (const p of pieces()) expect(gap({ name: 'hva', x: [x - 0.45, x + 0.45], z: [z - 0.45, z + 0.45] }, p), p.name).toBeGreaterThan(0.4);
    }
  });

  it('zone B is on its own dock head floor, mirrored: both teams as far from the room, neither in it', () => {
    const b = SPAWN_ZONES.half.find((z) => z.id === 'B')!;
    expect(b.y).toBe(DOCK.floor);
    expect(SPAWN_ZONES.symmetry).toBe('mirror');
    expect(b.z - b.r).toBeGreaterThan(SHIP.z + 10);
    expect(b.z + b.r).toBeLessThan(DOCK.z);
    expect(b.x - b.r).toBeGreaterThan(DOCK.x0);
    expect(b.x + b.r).toBeLessThan(DOCK.x1);
  });
});
