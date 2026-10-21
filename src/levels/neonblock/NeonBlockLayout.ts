import * as THREE from 'three';
import type { Zone } from '../Level';

/*
  Tokyo: Neon Block (14.0): a Team Deathmatch arena in Tokyo Night's biome, built for 5v5 rather than
  exploration. Metres, y up, north = -z. Mirror-symmetric about z = 0 (everything authored in the
  south half, ALPHA's, and built again with z → -z), so each lane keeps its identity end to end.

  Three levels everywhere: the street (y 0), the mid level MID (4.5: fire-escape landings, the
  footbridge, Block E's roofs, the plank bridge) and the top TOP (7.2: Block W's roofs and the
  skybridge). Every elevated floor has a stair back down (no traps) and the drop-downs are one-way.

     z=-66 ┌────────────── OMEGA SPAWN (walled yard, three exits, blast walls) ──────────────┐
     z=-46 │  OMEGA FORECOURT                                                             │
           │LANTERN│   BLOCK W (roof 7.2)  │   MAIN STREET   │  BLOCK E (roofs 4.5) │SERVICE│
           │ ALLEY │  fire escape ▸ roof   │  footbridge 4.5 │  E2 · gap · E1        │ ALLEY │
     z= -8 ├───────┴──── SKYBRIDGE 7.2 ───┴── THE CROSSING (cross street) ── PLANK 4.5 ──┴───────┤
     z= +8 │                         (all three lanes meet at street level)              │
           │ ALLEY │ W1 · ARCADE · W2      │  footbridge, H  │  E1 · GAP ALLEY · E2  │ ALLEY │
     z=+46 │  ALPHA FORECOURT                                                             │
     z=+66 └────────────── ALPHA SPAWN ─────────────────────────────────────────────────────┘
         x=-38   -31                  -13       0       13                   30      38

  Lane 1, west (Lantern Alley + Block W's roofs): a 4–7 m alley with vending machines and lanterns
  under a fire escape; the escape climbs to a landing (MID) and on to the roof (TOP); the roofs of
  both halves join over the crossing by the skybridge. Long sightlines along the roofs, tight ones
  in the alley: the high lane.
  Lane 2, centre (Main Street): the widest space, parked cover, and the footbridge over it (MID)
  whose arms join Block W's street landing (and its stair to the roof) and Block E's roofs.
  Lane 3, east (Block E + Service Alley): low roofs (MID) with AC units and tanks as cover, joined
  across the gap alley and over the crossing by a plank bridge; the service alley below.
  Transitions: the arcade through Block W (west ↔ centre, street level), the gap alley through
  Block E (centre ↔ east), the footbridge arms (centre ↔ both, mid level), the crossing (all three),
  the forecourts (all three).
  Drop-downs (one-way, through gaps in the parapets and rails): Block W's roof onto the fire-escape
  landing (2.7 m), the landing into the alley (4.5 m), Block E's roofs into the service alley, the
  gap alley and the street (4.5 m).
*/

/** The boundary facades' inner faces (14 m buildings that close every side). */
export const X_OUT = 38;
export const Z_END = 66;
/** Floor heights: fire-escape landings, footbridge, Block E's roofs; Block W's roofs and the skybridge. */
export const MID = 4.5;
export const TOP = 7.2;
/** The cross street ("the crossing") runs |z| < CROSS; the blocks from CROSS to COURT; the forecourt to BASE.z0. */
export const CROSS = 8;
export const COURT = 46;
/** ALPHA's spawn yard (OMEGA's is the mirror). */
export const BASE = { x0: -22, x1: 22, z0: 54, z1: 66 };
/** Block W: two buildings with an arcade between them (z 24–28) under a shared roof. */
export const BW = { x0: -31, x1: -13, arcade: [24, 28] as [number, number] };
/** Block E: two buildings either side of the gap alley (z 22–30), roofs at MID. */
export const BE = { x0: 13, x1: 30, gap: [22, 30] as [number, number] };
/** The footbridge deck along the street (x), its arms (z), and how far it reaches (|z| ≤ end). */
export const FOOT = { x0: -2, x1: 2, end: 15.6, arm: [13, 15.6] as [number, number] };
/** Skybridge (TOP) and plank bridge (MID) over the crossing. */
export const SKY = { x0: -25, x1: -19 };
export const PLANK = { x0: 22, x1: 26 };

/** z → -z for the north half. */
export const mz = (z: number, flip: boolean) => (flip ? -z : z);

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return p.x > BASE.x0 && p.x < BASE.x1 && z > BASE.z0 && z < BASE.z1;
}

/** Eight spawn points in a team's yard. */
export function spawnsOf(team: 'alpha' | 'omega') {
  const out: THREE.Vector3[] = [];
  for (const x of [-15, -5, 5, 15]) for (const z of [59, 63]) out.push(new THREE.Vector3(x, 0, team === 'alpha' ? z : -z));
  return out;
}

/**
 * Lanes from ALPHA's base towards OMEGA's, as ALPHA faces north: west high (the roofs), west low (the
 * alley), centre (the footbridge), east low (the service alley), east high (Block E's roofs). Waypoints carry
 * their floor height; the nav graph finds the stairs between them.
 */
const LANES_ALPHA: [number, number, number?][][] = [
  [[-22, 47.6], [-34.5, 44], [-22, 30, TOP], [-22, 14, TOP], [-22, 0, TOP], [-22, -14, TOP], [-22, -30, TOP], [-34.5, -44], [-22, -47.6]],
  [[-14, 47.5], [-35, 30], [-35.5, 12], [-35.5, 2.5], [-35.5, -12], [-35, -30], [-14, -47.5]],
  [[0, 52], [0, 30], [0, 10, MID], [0, 0, MID], [0, -10, MID], [0, -30], [0, -52]],
  // East low: the service alley (14.0: was a second street lane; the street drew every fight).
  [[24, 50], [34.5, 40], [34.5, 26], [34.5, 12], [35.5, 2], [34.5, -12], [34.5, -26], [34.5, -40], [24, -50]],
  [[20, 47.6], [34, 42], [24, 36, MID], [20, 26, MID], [24, 14, MID], [24, 0, MID], [24, -14, MID], [20, -26, MID], [24, -36, MID], [34, -42], [20, -47.6]],
];

/** Lanes per team, as that team faces: OMEGA's left is the east. */
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
  if (team === 'alpha') return LANES_ALPHA.map((L) => L.map(([x, z, y]) => v(x, z, y)));
  return LANES_ALPHA.slice()
    .reverse()
    .map((L) => L.map(([x, z, y]) => v(x, -z, y)));
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
/** Rects x0, z0, x1, z1. Raised zones are tested first (by height), then the street-level ones. */
export const ZONES = {
  skybridge: Z('skybridge', 'SKYBRIDGE', 'スカイブリッジ', [[SKY.x0, -CROSS, SKY.x1, CROSS]]),
  roofsW: Z('roofsW', 'WEST ROOFS', '西の屋上', [[-X_OUT, -COURT, BW.x1 + 2.6, COURT]]),
  footbridge: Z('footbridge', 'FOOTBRIDGE', '歩道橋', [[BW.x1, -26, BE.x0 + 0.2, 26]]),
  roofsE: Z('roofsE', 'EAST ROOFS', '東の屋上', [[BE.x0, -COURT, X_OUT, COURT]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA SPAWN', 'アルファ陣地', [[BASE.x0, BASE.z0, BASE.x1, BASE.z1]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA SPAWN', 'オメガ陣地', [[BASE.x0, -BASE.z1, BASE.x1, -BASE.z0]]),
  alphaCourt: Z('alphaCourt', 'ALPHA FORECOURT', 'アルファ前庭', [[-X_OUT, COURT, X_OUT, BASE.z0]]),
  omegaCourt: Z('omegaCourt', 'OMEGA FORECOURT', 'オメガ前庭', [[-X_OUT, -BASE.z0, X_OUT, -COURT]]),
  crossing: Z('crossing', 'THE CROSSING', 'スクランブル交差点', [[-X_OUT, -CROSS, X_OUT, CROSS]]),
  arcade: Z('arcade', 'ARCADE', 'アーケード', [[BW.x0, BW.arcade[0], BW.x1, BW.arcade[1]], [BW.x0, -BW.arcade[1], BW.x1, -BW.arcade[0]]]),
  gapAlley: Z('gapAlley', 'NOODLE GAP', 'ラーメン横丁', [[BE.x0, BE.gap[0], BE.x1, BE.gap[1]], [BE.x0, -BE.gap[1], BE.x1, -BE.gap[0]]]),
  lanternAlley: Z('lanternAlley', 'LANTERN ALLEY', '提灯横丁', [[-X_OUT, -COURT, BW.x0, COURT]]),
  street: Z('street', 'MAIN STREET', '本通り', [[BW.x1, -COURT, BE.x0, COURT]]),
  serviceAlley: Z('serviceAlley', 'SERVICE ALLEY', '裏路地', [[BE.x1, -COURT, X_OUT, COURT]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > TOP - 1 && ZONES.skybridge.rects.some(inR)) return ZONES.skybridge;
  if (y > MID + 1.5 && ZONES.roofsW.rects.some(inR)) return ZONES.roofsW;
  if (y > 2.5) {
    // The mid level: the fire escape and street landing belong to the west roofs' climb, the
    // footbridge to the street, Block E's roofs and the plank bridge to the east.
    if (x < BW.x0) return ZONES.roofsW;
    if (x < BW.x1 + 2.6 && x > BW.x1 - 0.5) return ZONES.roofsW;
    if (ZONES.footbridge.rects.some(inR) && x < BE.x0) return ZONES.footbridge;
    if (ZONES.roofsE.rects.some(inR)) return ZONES.roofsE;
    if (x > PLANK.x0 - 1 && x < PLANK.x1 + 1) return ZONES.roofsE;
  }
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.crossing, ZONES.arcade, ZONES.gapAlley, ZONES.lanternAlley, ZONES.street, ZONES.serviceAlley]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}
