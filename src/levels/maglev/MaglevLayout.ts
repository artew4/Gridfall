import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';
import type { ArenaProfile } from '../../enemies/arena/ArenaCtx';
import { mirrorPads } from '../SpawnManager';

/*
  Maglev Terminal (18.0): a corporate sci-fi Team Deathmatch arena, a white glass-roofed transit hall
  at mid-morning. The contrast map: clean white concrete, polished floors, brushed steel, panoramic
  glass, against the rust, brick and neon of the others. Built for 5v5 round one idea: a maglev train
  standing in the middle of the hall (its interior the close-quarters lane) between wide platforms
  with long sightlines (the rifle lanes). Metres, y up, north = -z. Mirror-symmetric about z = 0
  (authored south, ALPHA's; built again z → -z). The two sides are not alike (x is not mirrored).

     z=-60 ┌──────────────── OMEGA CONCOURSE (spawn yard, three exits) ────────────────┐
     z=-44 │ W'  ╎ TRACK │ PLATFORM W │ ▓ TRAIN ▓ │ PLATFORM E │ TRACK ╎ E' ▒ ESC        │
           │ BAL ╎  W    │  columns,  │ car 3     │  columns,  │  E    ╎ mezzanine 5.0 │
           │ ═══════════ BRIDGE (5.0) over everything ═══════════════════════ ═══════ │
           │ ESC ╎ -1.5  │  kiosks    │ car 2     │  kiosks    │ -1.5  ╎ E' + kiosks   │
     z=  0 │     ╎ stair │            │ (aisle at │            │       ╎ (under the    │
           │     ╎ down  │            │   0.25)   │            │       ╎  mezzanine)   │
           │ ═══════════ BRIDGE (5.0) ════════════════════════════════════════ ═══════ │
           │ W'  ╎       │            │ car 1     │            │       ╎ mezzanine     │
     z=+44 │                     ALPHA APRON (elevator towers before the exits)       │
     z=+60 └──────────────── ALPHA CONCOURSE ───────────────────────────────────────────┘
         x=-30   -22  -12           -1.9  1.9            12    22   30 (glass walls)

  Lane 1, centre (THE TRAIN): a three-car maglev, 54 m, hovering over its guideway in the middle of
  the hall. The cars are open end to end (gangways between them), with six doors a side and a cab
  passage through each nose; inside, an aisle between benches and luggage stacks at the doors:
  corners every few metres, the shotgun's lane. It is the straight way between the yards (the centre
  exit faces the nose's door), and the centre lane's waypoints run down its aisle (bots hunting a
  contact take the waypoint level with it: the fight comes into the train).
  Lane 0, west (THE TRACKS): platform W (columns, kiosks, benches: long sightlines broken every
  20 m), and beside it a sunken track bed (1.5 m) with stairs at its ends and in the middle: the lane
  goes down into it at mid-field, the low road under the platform's guns.
  Lane 2, east (THE MEZZANINE): platform E and the side hall E' under a 5 m mezzanine, reached by
  escalators at its ends and in the middle; the lane runs along the mezzanine (the high road).
  Two pedestrian bridges (5 m) cross the whole hall over the train at z = ±20, from the mezzanine to a
  west balcony (an escalator down to W'), with drop gaps over both platforms.

  The track beds are carved 0.5 m inside their walls' colliders (the 15.0 heightfield rule: a body
  against a wall never samples the platform). Everything walked onto is ≤ 0.28 m above the floor
  beside it, or reached by a stair, an escalator or a ramp. The train's floor is 0.25 above the
  platform (one step).
*/

/** The hall: glass curtain walls at ±X_HALL, the concourse end walls at ±Z_END. */
export const X_HALL = 30;
export const Z_END = 60;
/** ALPHA's spawn yard (the concourse; OMEGA's is the mirror); the apron in front of it starts at COURT. */
export const BASE = { x0: -14, x1: 14, z0: 50, z1: 60 };
export const COURT = 44;
/** The yard's front wall: three exits (west, centre, east), and its height (above a jump). */
export const EXITS = [-9, 0, 9];
export const EXIT_W = 4;
export const YARD_H = 3.2;
/**
 * The train: half-width, the body's half-length and the noses' tips, the floor inside (one step over
 * the platform), the ceiling and the roof. Three cars of CAR m with GAP m gangways between them.
 */
export const TRAIN = { x: 1.9, wall: 0.25, z: 27, nose: 30, floor: 0.25, ceil: 2.55, roof: 3.2 };
export const CAR = 17.4;
export const GAP = 0.9;
/** Car centres along z. */
export const CARS = [-(CAR + GAP), 0, CAR + GAP];
/** Doors: car-local ±DOOR_AT, DOOR_W wide, DOOR_H tall over the floor; both sides. */
export const DOOR_AT = 5;
export const DOOR_W = 1.6;
export const DOOR_H = 2.1;
/** Door centres along z (six per side). */
export const DOORS = CARS.flatMap((c) => [c - DOOR_AT, c + DOOR_AT]).sort((a, b) => a - b);
/** 20.0: the bulkhead across each car's middle: thickness, its doorway's x range (car 2: +x; cars 1, 3: -x). */
export const BULK = { t: 0.12, open: [0.1, 1.1] as [number, number] };
/** The gangways' passage half-width. */
export const GANGWAY = 0.7;
/** Inside the cars: the aisle between the benches (|x| < AISLE). */
export const AISLE = 1.15;
/**
 * The track beds, east and west: inner faces x0–x1 (as |x|), |z| ≤ z, floor; walls 1 m thick, their
 * tops at the platform. The carve line lies 0.5 m inside the walls.
 */
export const TRACK = { x0: 13, x1: 21, z: 44, wall: 1, floor: -1.5 };
/** Stairs in the track beds: at the ends (against the end walls) and the mid stairs (inner wall). */
export const TRACK_STAIR = { w: 2.45, endFoot: 38.5, midFoot: 8, midTop: 14 };
/** The upper level: the east mezzanine over E', the west balconies, the bridges. */
export const UP = 5;
export const MEZ = { x0: 23, x1: X_HALL, z: 34 };
export const BAL = { x0: -X_HALL, x1: -24, z0: 14, z1: 26 };
export const BRIDGE = { x0: BAL.x1, x1: MEZ.x0, z0: 18.5, z1: 21.5 };
/** Drop gaps in the bridges' rails (over platform W and E), as x ranges. */
export const BRIDGE_DROPS: [number, number][] = [[-7, -5.4], [5.4, 7]];
/** Escalators: 2 m wide, rising UP over `run` m. End ones from the apron to the mezzanine, mid ones from E', west ones from W'. */
export const ESC = { w: 2, run: 10 };
export const ESC_E = { x0: 24, x1: 26, foot: 44, top: 34 };
export const ESC_MID = { x0: 27.8, x1: 29.8, foot: 12, top: 2 };
export const ESC_W = { x0: -28, x1: -26, foot: 36, top: 26 };
/** Drop gaps in the mezzanine's rail (z ranges, both halves). */
export const MEZ_DROP: [number, number] = [5.5, 7];
/** The glass elevators: towers on the aprons in front of the yard's side exits, and on W'. */
export const ELEVATORS: [number, number][] = [[-9, 44], [9, 44], [-26, 6]];
export const ELEV = { half: 1.2, base: 2.6, top: 7.2 };
/** Walked onto from the floor beside it: at most this (more must be jumped). */
export const STEP = 0.28;

/** z → -z for the north half. */
export const mz = (z: number, flip: boolean) => (flip ? -z : z);

/** The ground: flat, the track beds carved 0.5 m inside their walls' colliders. */
export function hallHeight(x: number, z: number): number {
  const c = TRACK.wall / 2;
  const ax = Math.abs(x);
  return ax > TRACK.x0 - c && ax < TRACK.x1 + c && Math.abs(z) < TRACK.z + c ? TRACK.floor : 0;
}
export const HALL_TERRAIN: Terrain = { height: hallHeight, maxHeight: 0, surface: 'concrete' };

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return p.x > BASE.x0 && p.x < BASE.x1 && z > BASE.z0 && z < BASE.z1;
}

/** Eight spawn points in a team's yard. */
export function spawnsOf(team: 'alpha' | 'omega') {
  const out: THREE.Vector3[] = [];
  for (const x of [-10.5, -3.5, 3.5, 10.5]) for (const z of [54, 57.5]) out.push(new THREE.Vector3(x, 0, team === 'alpha' ? z : -z));
  return out;
}

/** The door's outside and inside points on one side (sx = ±1) at door z. */
export const doorOut = (sx: number) => sx * (TRAIN.x + 1.1);
export const doorIn = (sx: number) => sx * 0.5;

/**
 * Lanes from ALPHA's yard, as ALPHA faces north: the tracks (platform W, down the mid stair into the
 * track bed, up the far one), the train (in at car 3's east door, down the aisle through the
 * gangways, out at car 1's west door), the mezzanine (up the end escalator, along the mezzanine, down
 * the far one). Each lane climbs (or sinks to) its own level on its own path (15.0, L-109; 17.1: high
 * ground off a lane's path stays empty).
 */
const F = TRAIN.floor;
const TF = TRACK.floor;
const TX = TRACK.x0 + TRACK_STAIR.w / 2;
/** The cab passage through the nose (ALPHA's way in) and the gangway's centre. */
const CAB = (TRAIN.z + TRAIN.nose) / 2;
const GW = CAR / 2 + GAP / 2;
const LANES_ALPHA: [number, number, number?][][] = [
  // [x, z, y?] (y absent: the floor there).
  [
    [-9, 52.5], [-9, 47.5], [-7, 34], [-7, 24], [-12.3, 15],
    [-12.3, 13.6, 0], [-TX, 13.4, -0.1], [-TX, 11, TF / 2], [-TX, 7, TF], [-TX - 0.4, 0, TF], [-TX, -7, TF], [-TX, -11, TF / 2], [-TX, -13.4, -0.1], [-12.3, -13.6, 0],
    [-12.3, -15], [-7, -24], [-7, -34], [-9, -46],
  ],
  [
    [0, 52.5], [0, 47.5], [0, 34], [0, CAB, F], [0, 24, F], [0, 16, F], [0, GW, F], [0, 2, F],
    [0, -2, F], [0, -GW, F], [0, -16, F], [0, -24, F], [0, -CAB, F], [0, -34], [0, -46],
  ],
  [
    [9, 52.5], [9, 47.5], [25, 45.5], [25, 39, UP / 2], [25, 32.6, UP], [26.5, 22, UP], [26.5, 10, UP], [26.5, 0, UP],
    [26.5, -10, UP], [26.5, -22, UP], [25, -32.6, UP], [25, -39, UP / 2], [25, -45.5, 0], [9, -47.5],
  ],
];

/** Lanes per team, as that team faces: OMEGA's left is the east. */
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  const v = (x: number, z: number, y?: number) => new THREE.Vector3(x, y ?? hallHeight(x, z), z);
  if (team === 'alpha') return LANES_ALPHA.map((L) => L.map(([x, z, y]) => v(x, z, y)));
  return LANES_ALPHA.slice()
    .reverse()
    .map((L) => L.map(([x, z, y]) => v(x, -z, y)));
}

/** Inside the train (its body, noses excluded). */
export function inTrain(x: number, y: number, z: number) {
  return Math.abs(x) < TRAIN.x && Math.abs(z) < TRAIN.z && y > -0.5 && y < TRAIN.roof;
}

/** The lanes for the flow reports and the bots' lane pressure: the tracks side, the train, the mezzanine side. */
export function laneOf(x: number, y: number, z: number): 0 | 1 | 2 | null {
  if (Math.abs(z) > BASE.z0 - 2) return null;
  if (inTrain(x, y, z)) return 1;
  // Round the train's ends (between the noses and the aprons) it is the centre too.
  if (Math.abs(x) < 4 && Math.abs(z) >= TRAIN.z) return 1;
  return x < 0 ? 0 : 2;
}

/**
 * 18.0 → 20.0: how many bots each lane is worth to the director. 18.0 put two of five on the train
 * (1.6, its lane strict) to pull the fight into it; with the platforms covered (20.0) the flanks are
 * worth more (1.3) and the train lane is no longer strict, so bots flank the train instead of queueing
 * into it (self-play: docs/BENCH-20.0.json). The nav cost below still makes the aisle a cheap route.
 */
export const LANE_WEIGHTS: [number, number, number] = [1.3, 1, 1.3];
/** 18.0: the train's lane was strict; 20.0: no lane is. */
export const LANE_STRICT: [boolean, boolean, boolean] = [false, false, false];
/**
 * 18.0: the nav cost of a link (a multiple of its length): the aisle is cheap, so the graph's shortest
 * ways along the hall go through the cars (the train is the attractive route, not a detour behind doors).
 */
export const TRAIN_COST = 0.55;
export function navCost(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return inTrain(a.x, a.y, a.z) && inTrain(b.x, b.y, b.z) ? TRAIN_COST : 1;
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
const cars = CARS.map((c, i): Zone => Z(`car${i + 1}`, `CAR ${i + 1}`, `${i + 1}号車`, [[-TRAIN.x, i === 0 ? -TRAIN.nose : c - CAR / 2, TRAIN.x, i === 2 ? TRAIN.nose : c + CAR / 2]]));
export const ZONES = {
  // Car 1 is OMEGA's end, car 3 ALPHA's (ALPHA's callouts read north to south… the plates say so).
  car1: cars[0],
  car2: cars[1],
  car3: cars[2],
  gangway: Z('gangway', 'GANGWAY', '連結部', [[-TRAIN.x, CAR / 2, TRAIN.x, CAR / 2 + GAP], [-TRAIN.x, -CAR / 2 - GAP, TRAIN.x, -CAR / 2]]),
  bridges: Z('bridges', 'SKYBRIDGE', '連絡橋', [[BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1], [BRIDGE.x0, -BRIDGE.z1, BRIDGE.x1, -BRIDGE.z0]]),
  mezzanine: Z('mezzanine', 'MEZZANINE', '中二階', [[MEZ.x0, -MEZ.z, MEZ.x1, MEZ.z]]),
  balcony: Z('balcony', 'WEST BALCONY', '西バルコニー', [[BAL.x0, BAL.z0, BAL.x1, BAL.z1], [BAL.x0, -BAL.z1, BAL.x1, -BAL.z0]]),
  trackW: Z('trackW', 'WEST TRACK', '西線路', [[-TRACK.x1, -TRACK.z, -TRACK.x0, TRACK.z]]),
  trackE: Z('trackE', 'EAST TRACK', '東線路', [[TRACK.x0, -TRACK.z, TRACK.x1, TRACK.z]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA CONCOURSE', 'アルファ・コンコース', [[BASE.x0, BASE.z0, BASE.x1, Z_END]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA CONCOURSE', 'オメガ・コンコース', [[BASE.x0, -Z_END, BASE.x1, -BASE.z0]]),
  // The aprons begin at the noses' roots (beside the tapering noses is the apron, not a platform).
  alphaApron: Z('alphaApron', 'ALPHA APRON', 'アルファ前広場', [[-X_HALL, TRAIN.nose, X_HALL, Z_END], [-TRAIN.x - 0.5, TRAIN.z, TRAIN.x + 0.5, TRAIN.nose]]),
  omegaApron: Z('omegaApron', 'OMEGA APRON', 'オメガ前広場', [[-X_HALL, -Z_END, X_HALL, -TRAIN.nose], [-TRAIN.x - 0.5, -TRAIN.nose, TRAIN.x + 0.5, -TRAIN.z]]),
  platformW: Z('platformW', 'PLATFORM 1', '1番線', [[-TRACK.x0, -TRAIN.nose, -TRAIN.x, TRAIN.nose]]),
  platformE: Z('platformE', 'PLATFORM 2', '2番線', [[TRAIN.x, -TRAIN.nose, TRACK.x0, TRAIN.nose]]),
  sideW: Z('sideW', 'WEST HALL', '西ホール', [[-X_HALL, -TRAIN.nose, -TRACK.x1, TRAIN.nose]]),
  sideE: Z('sideE', 'EAST HALL', '東ホール', [[TRACK.x1, -TRAIN.nose, X_HALL, TRAIN.nose]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > UP - 1) {
    for (const zone of [ZONES.bridges, ZONES.mezzanine, ZONES.balcony]) if (zone.rects.some(inR)) return zone;
  }
  // In a car, or in a cab passage through a nose (car 1's or car 3's).
  if (Math.abs(x) < TRAIN.x && Math.abs(z) < TRAIN.nose && y > -0.5 && y < TRAIN.roof) {
    for (const zone of [ZONES.gangway, ZONES.car1, ZONES.car2, ZONES.car3]) if (zone.rects.some(inR)) return zone;
  }
  if (y < -0.7) {
    for (const zone of [ZONES.trackW, ZONES.trackE]) if (zone.rects.some(inR)) return zone;
  }
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaApron, ZONES.omegaApron, ZONES.platformW, ZONES.platformE, ZONES.sideW, ZONES.sideE, ZONES.trackW, ZONES.trackE]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}

/**
 * 20.0: the arena AI on Maglev Terminal (it was "too easy" on its long white platforms):
 *  - under long-range fire (a hit or a near miss from 22 m or more) a bot breaks for cover from that
 *    shooter at once, diving or sliding into it, or sidesteps out of the line (ARENA.underFire);
 *  - a rifleman focusing an aimed shot keeps moving (35% of its run, was 12%) and walks its aimed
 *    fire at 45% (was 32%): no more statues on a platform.
 */
export const MAGLEV_AI: ArenaProfile = {
  underFire: { on: true },
  ads: { focusMove: 0.35, walk: 0.45 },
  // Three on a contact, from 10 m: round the train and the platforms' cover, not into a queue.
  flank: { per: 3, min: 10 },
};

/** 20.0: the team size here (self-play: 7v7 is the knee, as in the jungle) and the tickets (~3 min). */
export const MAGLEV_TEAM_SIZE = 7;
export const MAGLEV_TICKETS = 50;

/**
 * 20.0: forward respawn points (TdmData.forward), on each team's approach about 30 m short of mid-field:
 * W' by the escalator, platform 1, in front of the train's nose, platform 2, E' by the glass.
 */
export function forwardOf(team: 'alpha' | 'omega') {
  const s = team === 'alpha' ? 1 : -1;
  return ([[-27.2, 38], [-8.5, 36.5], [0, 34], [8.5, 36.5], [28, 38]] as const).map(([x, z]) => new THREE.Vector3(x, 0, z * s));
}

/**
 * 20.0: the full-height pieces that break each platform's length (as x ranges on platform 2; platform
 * 1 is the mirror in x), and their z bands (both halves): together they cover the platform's width,
 * so no line runs along it from one apron to the other (a unit test checks the cover).
 */
export const PLATFORM_BLOCKERS: { name: string; x: [number, number]; z: [number, number]; h: number }[] = [
  { name: 'billboard', x: [6.4, 11.4], z: [26.6, 27.2], h: 3.2 },
  { name: 'transit map kiosk', x: [2.0, 4.6], z: [17, 19.5], h: 2.6 },
  { name: 'art monolith', x: [4.0, 6.4], z: [32, 33.4], h: 3.4 },
  { name: 'kiosk (18.0)', x: [6, 9], z: [-1.6, 1.6], h: 2.6 },
  { name: 'elevator (18.0)', x: [7.8, 10.2], z: [42.8, 45.2], h: 7.2 },
  { name: 'roof column (18.0)', x: [9.95, 11.05], z: [5.45, 6.55], h: 15.8 },
  { name: 'signal cabinet', x: [11, 12.9], z: [39.6, 41], h: 2.0 },
];

/**
 * 27.0: the spawn pads (TdmData.pads), ALPHA's half mirrored for OMEGA: [x, floor y, z, yaw]. The first
 * is in the old yard (a safe rear pad); the rest cover the contested map, proposed by
 * __dev.spawnPads (farthest-point, then Lloyd relaxation over the nav, sheltered spots first).
 */
export const SPAWN_PADS = mirrorPads([[0, 0, 55.8, 3.14], [22.4, 0, 17, 3.53], [-22.4, 0, 17, 2.75], [28, 0, 38, 3.14], [-24, 0, 38, 1.57], [-4, 0, 30, 3.53], [-4, 0, 6, 4.32]]);
