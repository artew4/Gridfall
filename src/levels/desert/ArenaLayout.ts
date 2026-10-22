import * as THREE from 'three';

/*
  Desert Outpost arena (6.0, Team Deathmatch). Metres, north = -z. The map is point-symmetric about the
  flagpole at the origin: everything authored for the south half is built again rotated 180°
  ((x, z) → (-x, -z)), and the dunes themselves are symmetrised (Terrain.ts), so both teams get the
  same ground, the same cover at the same distances, the same routes.

        z=-64  OMEGA BASE (red)            three exits: centre chicane, east and west corridors
                 │            │            │
      wadi (N)   │      centre lane         │   hamlet (N)
     x≈-50..-60  │   N gate → yard → S gate │   x≈45..60
     pump house ─┤        (compound)        ├─ pump house      ← each flank's midpoint, at x = ±60
      hamlet (S) │                          │   wadi (S)
                 │            │            │
        z=+64  ALPHA BASE (blue, the player's)

  Lanes (from each team's base): left, centre, right. The centre runs through the compound (open yard,
  roofs and windows over it: high risk, the shortest way). The flanks run out at |x| ≈ 45–60: one
  half through a ruined hamlet (walls, doorways, a building to cut through), the other half along a
  dry wadi (sand berms, rocks, a wrecked APC). Each team's left flank starts in the hamlet and its
  right flank in the wadi.

  12.0: two more lanes per team: the culvert under the compound (3, point-symmetric) and the rooftops
  on the team's own side of the compound (4, one per team: the compound isn't symmetric).
*/

/** Bases: centre z (±), the flat floor height, the walled yard. */
export const BASE = {
  z: 64,
  y: 1.2,
  /** Walled yard (south base; the north one is its rotation). */
  x0: -15,
  x1: 15,
  z0: 56,
  z1: 72,
  wallH: 2.4,
  /** The flat pad under the base and its chicanes; terrain blends back to dunes over `fall` m. */
  pad: { x: 23, z0: 46, z1: 78, fall: 18 },
};

/** Spawn protection: hits on anyone who (re)spawned less than this ago do nothing. */
export const SPAWN_PROTECT = 2;

/** Rotate a point 180° about the origin (the arena's symmetry). */
export const rot = (x: number, z: number): [number, number] => [-x, -z];

/** Is (x, z) inside a team's walled base yard (spawn zone)? South = ALPHA, north = OMEGA. */
export function inBase(x: number, z: number, side: 'south' | 'north', pad = 0) {
  const zz = side === 'south' ? z : -z, xx = side === 'south' ? x : -x;
  return xx > BASE.x0 - pad && xx < BASE.x1 + pad && zz > BASE.z0 - pad && zz < BASE.z1 + pad;
}

/**
 * Lanes from the south base, as waypoint (x, z) lists ending short of the other base's chicane
 * (bots never walk into a spawn on their own). 0 = left (west), 1 = centre, 2 = right (east).
 */
export const LANES_SOUTH: [number, number][][] = [
  [[-17, 53], [-30, 50], [-43, 47], [-50, 40], [-53, 27], [-58, 14], [-60, 0], [-58, -14], [-53, -27], [-50, -40], [-43, -47], [-30, -50]],
  [[0, 48.5], [-3, 40], [-7, 31], [-7, 24.5], [-5, 14], [-2, 6], [2, -6], [5, -14], [7, -24.5], [7, -31], [3, -40], [0, -46]],
  [[17, 53], [30, 50], [43, 47], [50, 40], [53, 27], [58, 14], [60, 0], [58, -14], [53, -27], [50, -40], [43, -47], [30, -50]],
];

/** The same lanes as seen from the north base (left is east for a team facing south). */
export const LANES_NORTH: [number, number][][] = LANES_SOUTH.map((l) => l.map(([x, z]) => rot(x, z)));

/** A lane waypoint off the ground: x, z and its floor height (12.0). */
export type Way3 = [number, number, number];

/**
 * 12.0, the culvert lane (3; point-symmetric like lanes 0–2, so the north one is its rotation): out of
 * the base's east exit, round the compound's east side, in at the east gate, down into the culvert,
 * under the yard, up at the west gate and on up the west flank: a crossing nobody on a roof sees.
 * Floor heights given (the culvert's stairs and floor; the dunes are filled in from the terrain).
 */
export const CULVERT_LANE_SOUTH: (Way3 | [number, number])[] = [
  [17, 53], [27, 44], [35, 30], [35, 12], [33.5, -1], [28.6, 0, 0], [24, 0, -1.5], [18, 0, -3], [0, 0, -3], [-18, 0, -3], [-24, 0, -1.5], [-28.6, 0, 0],
  [-33.5, -3], [-40, -20], [-48, -38], [-43, -47], [-30, -50],
];

/**
 * 12.0, the rooftop lanes (4): the compound isn't point-symmetric, so each team has its own, over its
 * own side's roofs, ending as overwatch on the yard. ALPHA (south): in at the south gate, up the
 * trading post's stair, across its roof and the bridges to the clinic and the watchtower. OMEGA
 * (north): in at the north gate, up the motor pool's stair to its high roof, over the skybridge to
 * the barracks roof.
 */
export const ROOF_LANE: { south: (Way3 | [number, number])[]; north: (Way3 | [number, number])[] } = {
  south: [[0, 48.5], [-6, 34], [-7, 29], [-12, 25.4], [-16.3, 24.6, 0], [-16.3, 16.2, 3.55], [-12, 11.5, 3.55], [-2, 11.8, 3.45], [10, 13.5, 3.35], [18, 12.25, 3.3], [24.5, 12.5, 3.25]],
  north: [[0, -48.5], [6, -34], [7, -29], [7, -24.5], [10.2, -20.74, 0], [21.3, -20.74, 5.25], [18, -14, 5.25], [0, -15.2, 4.4], [-17, -14.5, 3.55], [-22, -14.5, 3.55]],
};

/**
 * 28.0, the outer flanks' lanes (5, 6), past the hamlet and the wadi, near the cliffs. The west one
 * (south frame): out of the west exit, along the outer dunes into the trench's north ramp, down the
 * trench (round its traverses), out at its south ramp, past the wrecked convoy (the rotated east-side
 * convoy) and back in towards the other base. The east one is its rotation, walked the other way.
 */
const OUTER_WEST: [number, number][] = [
  [-17, 53], [-32, 55], [-48, 56], [-63, 53], [-74.8, 52], [-75, 46], [-74.1, 39], [-75, 33], [-75.9, 27], [-75, 21], [-74.1, 15], [-75, 9],
  [-76, -4], [-71, -12], [-71, -26], [-71, -40], [-64, -52], [-48, -56], [-30, -50],
];
export const OUTER_LANES_SOUTH: [number, number][][] = [OUTER_WEST, OUTER_WEST.map(([x, z]) => rot(x, z)).reverse()];
export const OUTER_LANES_NORTH: [number, number][][] = OUTER_LANES_SOUTH.map((l) => l.map(([x, z]) => rot(x, z)));

/**
 * 28.0, the outer flanks' pieces (south half; each is built again rotated): the trench's traverses,
 * the two rock outcrops (top `h` m over the highest sand under them, a ramp up one end), the convoy.
 */
export const OUTER = {
  traverses: [{ z: 15, x0: -76.8, x1: -75 }, { z: 27, x0: -75, x1: -73.2 }, { z: 39, x0: -76.8, x1: -75 }],
  anvil: { x0: -84, z0: 22, x1: -78, z1: 31, h: 3.8, ramp: { x0: -83, x1: -79.5, z1: 38 } },
  spine: { x0: 77, z0: 46, x1: 83, z1: 53, h: 3.4, ramp: { x0: 78, x1: 81.5, z1: 39 } },
  truck: { x0: 74, x1: 76.4, cab: [8, 10.4], bed: [10.4, 16.4] },
  apc: { x0: 77, z0: 22, x1: 80, z1: 28 },
  bus: { x0: 73.5, z0: 31, x1: 76.1, z1: 41, h: 2.9 },
};

/**
 * Places the old random dune scatter (rocks, brush) must keep clear of: the arena's structures
 * (south half; the check rotates the point). Rects x0, z0, x1, z1.
 */
const KEEP_OUT_SOUTH: [number, number, number, number][] = [
  [-BASE.pad.x - 3, BASE.pad.z0 - 3, BASE.pad.x + 3, BASE.pad.z1 + 3],
  // Hamlet (west) and wadi (east).
  [-68, 4, -38, 56],
  [37, 4, 67, 56],
  // Centre approach.
  [-16, 29, 13, 50],
  // The pump houses on the flanks (both, since x is its own pair).
  [-66, -6, -54, 6],
  // 28.0: the outer flanks (the trench and the anvil west, the convoy and the spine east).
  [-89, 2, -64, 54],
  [64, 2, 89, 56],
];

export function arenaKeepOut(x: number, z: number, r = 0) {
  const hit = (px: number, pz: number) => KEEP_OUT_SOUTH.some(([x0, z0, x1, z1]) => px > x0 - r && px < x1 + r && pz > z0 - r && pz < z1 + r);
  return hit(x, z) || hit(-x, -z);
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
