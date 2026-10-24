import { describe, expect, it } from 'vitest';
import { BE, KONBINI, MACHINE_ROOM, PACHINKO, RAMEN, SPAWN_ZONES, TOP, X_OUT, ZONES, lanesOf, zoneAt } from './NeonBlockLayout';

describe('47.0: Neon Block, the flanks bent and the roofs filled', () => {
  const rooms = [
    { name: 'pachinko', r: [-X_OUT, PACHINKO.z0, PACHINKO.x1, PACHINKO.z1], y: 1, zone: ZONES.pachinko },
    { name: 'konbini', r: [BE.x1, KONBINI.z0, KONBINI.x1, KONBINI.z1], y: 1, zone: ZONES.konbini },
    { name: 'ramen', r: [RAMEN.x0, RAMEN.z0, X_OUT, RAMEN.z1], y: 1, zone: ZONES.ramen },
    { name: 'machine room', r: [MACHINE_ROOM.x0, MACHINE_ROOM.z0, MACHINE_ROOM.x1, MACHINE_ROOM.z1], y: TOP + 1, zone: ZONES.machineRoom },
  ];
  it('each room is a zone of its own, in both halves', () => {
    for (const { r, y, zone } of rooms)
      for (const s of [1, -1]) expect(zoneAt((r[0] + r[2]) / 2, y, (s * (r[1] + r[3])) / 2)).toBe(zone);
  });

  it("the low flank lanes keep clear of the rooms' walls (a waypoint inside one is in its aisle)", () => {
    for (const L of lanesOf('alpha'))
      for (const p of L) {
        if (p.y > 1) continue;
        for (const { name, r } of rooms.slice(0, 3))
          for (const s of [1, -1]) {
            const z0 = s > 0 ? r[1] : -r[3], z1 = s > 0 ? r[3] : -r[1];
            const inside = p.x > r[0] && p.x < r[2] && p.z > z0 && p.z < z1;
            if (inside) expect(name).toBe('pachinko');
            else expect(Math.hypot(Math.max(r[0] - p.x, 0, p.x - r[2]), Math.max(z0 - p.z, 0, p.z - z1)), `${name} ${p.x},${p.z}`).toBeGreaterThan(0.6);
          }
      }
  });

  it('the spawn zones A and C stay clear of the rooms', () => {
    for (const z of SPAWN_ZONES.half)
      for (const { r } of rooms.slice(0, 3)) {
        const d = Math.hypot(Math.max(r[0] - z.x, 0, z.x - r[2]), Math.max(r[1] - z.z, 0, z.z - r[3]));
        expect(d).toBeGreaterThan(z.r - 0.5);
      }
  });
});
