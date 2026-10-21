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
];

export function arenaKeepOut(x: number, z: number, r = 0) {
  const hit = (px: number, pz: number) => KEEP_OUT_SOUTH.some(([x0, z0, x1, z1]) => px > x0 - r && px < x1 + r && pz > z0 - r && pz < z1 + r);
  return hit(x, z) || hit(-x, -z);
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
