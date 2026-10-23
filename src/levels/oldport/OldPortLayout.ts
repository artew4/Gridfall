import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';
import type { ArenaProfile } from '../../enemies/arena/ArenaCtx';
import { mirrorPads } from '../SpawnManager';

/*
  Old Port (17.1): a daytime Team Deathmatch arena, an old brick-and-concrete harbour on a clear
  morning. Built from scratch for 5v5 and deliberately unlike Neon Docks (8.0–15.0): there the centre
  is a warehouse and the flanks are flat; here the warehouse is a two-storey flank, the centre is an
  open yard with raised stacks, and the east lane has four levels (dock floor, quay, deck, bridge).
  Metres, y up, north = -z. Mirror-symmetric about z = 0 (authored south, ALPHA's; built again z → -z).

     z=-62 ┌──────────────────── OMEGA YARD (brick walls, side exits) ────────────────────┐ brick
     z=-42 │                         OMEGA APRON                                           │ facades
           │ BRICK      │ A │  THE STACKS (5.2) ═══ walkway ═══ STACK B  │W│ DRY │ ~~~~ │E│
           │ WAREHOUSE  │ L │      ▲ stair                    stair ▶    │Q│ DOCK│ ship │Q│ ~sea~
           │ ground 0   │ L │                                            │U│ -4.5│ deck │U│
     z=  0 │ upper 4.4  │ E │   THE YARD  (cover, the reach stacker)     │A│     │ 1.0  │A│
           │ skylights  │ Y │                                            │Y│     │bridge│Y│
           │ atrium hole│   │  THE STACKS ═══ walkway ═══ STACK B        │ │     │ 3.6  │ │
     z=+42 │                         ALPHA APRON                                           │
     z=+62 └──────────────────── ALPHA YARD ─────────────────────────────────────────────────┘
         x=-46        -27  -22                                        18  24   36     44 fence

  Lane 1, west (THE WAREHOUSE): an 1890s brick warehouse, 68 m long. The ground floor is a pillared
  hall (close range); the upper floor (4.4 m) is lit through broken skylights and has a hole in its
  middle to drop through. Its east windows look over the yard; fire stairs outside join the alley.
  Lane 2, centre (THE YARD): open ground with low cover at mid-field, and near each team's side a
  2-high container block (THE STACKS, 5.2 m) joined by a steel walkway over the yard to STACK B on
  the quay side: high ground that is close to home, not a mid-field fortress (the docks' lesson).
  Lane 3, east (THE DRY DOCK): a 4.5 m-deep basin, its floor the low road; a coaster on keel blocks
  in the middle, its deck (1.0) reached by gangways from both quays, its bridge roof (3.6) the high
  point over the east; the sea quay beyond, under a container crane.

  The dock is carved into a flat terrain, and the drop lies inside the dock walls' colliders (the
  15.0 heightfield rule: a body against a wall never samples the quay). Everything walked onto is
  ≤ 0.3 m above the floor beside it, or reached by a stair or a ramp.
*/

/** West boundary (the warehouse's outer west wall) and the sea fence's line. */
export const X_W = -46;
export const QUAY_X = 44;
export const Z_END = 62;
/** ALPHA's yard (OMEGA's is the mirror); the apron in front of it starts at COURT. */
export const BASE = { x0: -16, x1: 16, z0: 52, z1: 62 };
export const COURT = 42;
/** The warehouse: outer walls x0–x1, |z| ≤ z; the upper floor at UP; walls to the eaves. */
export const WH = { x0: -46, x1: -27, z: 34, t: 0.5, up: 4.4, eave: 9, slab: 0.3 };
/** Inner faces. */
export const WHI = { x0: WH.x0 + WH.t, x1: WH.x1 - WH.t, z: WH.z - WH.t };
/**
 * The interior stairs: along the west wall, rising towards the middle, the foot 3.5 m short of the end
 * wall (walk in at the end door, turn onto it); the slab is open over them.
 */
export const WH_STAIR = { x0: WHI.x0 + 0.05, x1: WHI.x0 + 2.45, zFoot: 30, zTop: 21.2 };
/** The hole in the upper floor's middle (a drop to the hall). */
export const ATRIUM = { x0: -38.5, x1: -32.5, z: 5 };
/** The alley between the warehouse and the yard, and the fire stairs in it (foot at ±zFoot, door at ±zDoor). */
export const ALLEY = { x0: WH.x1, x1: -22 };
export const FIRE = { x0: -26.9, x1: -24.6, zFoot: 3.6, zTop: 12.2, zDoor: 13.4 };
/** A 20 ft container: long side, short side, height (33.0: shared, world/Containers). */
export { CONT } from '../../world/Containers';
import { CONT } from '../../world/Containers';
/** THE STACKS (2-high block, top 5.2) and STACK B, joined by a walkway at the same height. */
export const STACKS = { x0: -20, x1: -20 + 2 * CONT.L, z0: 18, z1: 18 + 2 * CONT.W, top: 2 * CONT.H };
export const STACK_B = { x0: 2, x1: 2 + CONT.L, z0: STACKS.z0, z1: STACKS.z1 };
export const WALK = { x0: STACKS.x1, x1: STACK_B.x0, z0: 19.6, z1: 21.2 };
/** The dry dock: inner faces, its walls' colliders (1 m, top at quay level), its floor; the carve line lies inside the walls. */
export const DOCK = { x0: 24.5, x1: 35.5, z: 38, wall: 1, floor: -4.5 };
/**
 * The coaster in the dock: hull, deck, the bridge house and its roof, gangways at ±gz. 37.0: her keel
 * (the hull's underside) at -0.9, raised on shipwright's stands: 3.6 m of headroom over the dock floor.
 */
export const SHIP = { x0: 27, x1: 33, z: 15, deck: 1.0, keel: -0.9, house: { x0: 28.5, x1: 31.5, z: 2.5, roof: 3.6 }, gz: 7, gw: 1.6 };
/*
  37.0, UNDER THE HULL: the dock floor under the coaster, a close-quarters room roofed by her keel
  (x 24.5–35.5, |z| < 15; the hull over x 27–33, the channels either side open to the sky). Mirrored
  like the map. Every gap between two pieces of cover is 0 or ≥ 1.3 m (a body is 0.9 m: a slot between
  stalls bots), nothing stands within 1.1 m of a dock wall (the carve line: L-144), and nothing in an
  open channel is taller than waist height (a stack's top under the sky would be a perch reached from
  the quay). Full-height pieces stand under the hull, floor to keel: nothing to climb.

     z=15 ─┬─ scaffold stair to the deck (x 29.2–30.8, z 15–26)
           │ [CRATES]                 [CRATES]          2.2 m stacks flanking the stair's top
     10.5  │      (o)  ═══ cradle ═══  (o)               stands, a beam over them
      7    │ [c]             [TOWER]                     a waist-high crate (west channel), a scaffold tower
      4    │      (o)  ═══ cradle ═══  (o)
      1.6  │                          [c]                a waist-high crate (east channel)
      0    │           [ KEEL BLOCK ]                    waist-high, the room's centre
         x=24.5  27   28    30     32  33        35.5
*/
/** The stands (steel columns, floor to keel), south half (mirrored); radius. */
export const STANDS: [number, number][] = [[28, 4], [32, 4], [28, 10.5], [32, 10.5]];
export const STAND_R = 0.35;
/** The cradle beams over each pair of stands (under the keel, so the headroom there is keel − depth). */
export const CRADLE = { x0: 27.2, x1: 32.8, depth: 0.35, w: 0.5 };
/**
 * The room's cover, south half (mirrored; `mid` once, on z = 0): waist-high crates and the keel block
 * (h ≤ 1.05: vaulted), full stacks and a scaffold tower (floor to keel or 2.2 m, under the hull).
 */
export const UNDER_COVER: { name: string; x: [number, number]; z: [number, number]; h: number | 'keel'; kind: 'crate' | 'stack' | 'tower' | 'keel'; mid?: boolean }[] = [
  { name: 'keel block', x: [29.25, 30.75], z: [-1.6, 1.6], h: 1.0, kind: 'keel', mid: true },
  { name: 'east crate', x: [33.2, 34.4], z: [1.0, 2.2], h: 1.0, kind: 'crate' },
  { name: 'west crate', x: [25.6, 26.8], z: [6.4, 7.6], h: 1.0, kind: 'crate' },
  { name: 'tower', x: [30.4, 31.9], z: [6.2, 7.6], h: 'keel', kind: 'tower' },
  { name: 'west stack', x: [27.3, 28.5], z: [12.2, 13.6], h: 2.2, kind: 'stack' },
  { name: 'east stack', x: [31.5, 32.7], z: [12.2, 13.6], h: 2.2, kind: 'stack' },
];
/** Hanging work lamps under the keel: [x, z] (south half and the middle), and which carry a real light. */
export const LAMPS: { x: number; z: number; light?: boolean }[] = [
  { x: 29.6, z: 0, light: true },
  { x: 29.4, z: 7.3, light: true },
  { x: 30.2, z: 13.8 },
  { x: 27.6, z: 2.2 },
  { x: 32.4, z: 8.8 },
];
/**
 * 37.0: places in the room the patrols search between fights (TdmData.hvas), both halves: its corners
 * behind the cover, not the lane's line through it (6 matches without them: 3.8% of bot time in it).
 */
export const UNDER_HVAS: [number, number, number][] = [[26.2, DOCK.floor, 9.8], [33.8, DOCK.floor, 5.4], [29.6, DOCK.floor, 4.6]].flatMap(([x, y, z]): [number, number, number][] => [[x, y, z], [x, y, -z]]);
/**
 * 37.1: the ship's high ground. 37.0 moved the dock lane under the hull and the bridge emptied (0.0% of
 * bot time, 0 kills from it in 6 matches).
 *  - `points`: kept watch on (TdmData.highGround, ArenaDirector.setWatch): the bridge roof (3.6). A
 *    patrol weight alone didn't bring it back: a patrol rarely arrives anywhere in a 7v7 (a radar contact
 *    pulls it off: 7–18 arrivals a match), so a team posts one bot at a time instead. Posts on the deck
 *    too drew bots out of UNDER THE HULL (its time 4.0 → 2.6%): the bridge alone.
 *  - GANGWAY_HEADS: the deck at the head of each west gangway (1.0, mirrored): patrol areas.
 */
export const GANGWAY_HEADS: [number, number, number][] = [[28, SHIP.deck, SHIP.gz], [28, SHIP.deck, -SHIP.gz]];
export const HIGH_GROUND = {
  points: [[30, SHIP.house.roof, 0]] as [number, number, number][],
  hold: [10, 16] as [number, number],
  every: 10,
  reach: 35,
};
/** Where the lamps hang to (the cable from the keel), and their light. */
export const LAMP = { drop: 0.9, color: 0xffb066, intensity: 9, range: 13 };
/*
  23.0, the overhaul (the 17.1 port played like 18.0's Maglev: 5% of spawn-side to spawn-side pairs in
  sight, the longest 129 m down the west quay; bots never on the stacks). Blockers by the width they
  cover (the 20.0 rule), a container maze across the yard you go through or over, micro-cover.
*/
/**
 * THE SPINE: a row of 1-high containers across the yard's middle (z ±1.22, x −22 … 18), two ground
 * passages through it (GATES), each baffled by a container on both sides (no line through a gate), and
 * its top a walk (2.6) joined over the gates by plank bridges and reached by a stair from each side.
 */
export const SPINE = { x0: -22, x1: 18, z: CONT.W / 2, top: CONT.H };
export const GATES: [number, number][] = [
  [-15.94, -12.44],
  [5.74, 9.24],
];
/** The containers (x ranges) along the spine, between and round the gates; the last a crate stack. */
export const SPINE_SEGMENTS: [number, number][] = [
  [-22, -15.94],
  [-12.44, -6.38],
  [-6.38, -0.32],
  [-0.32, 5.74],
  [9.24, 15.3],
  [15.3, 18],
];
/** The baffle in front of each gate (both halves): x range, z range (south half). */
export const BAFFLES: { x: [number, number]; z: [number, number] }[] = [
  { x: [-18, -11.94], z: [6, 8.44] },
  { x: [4.45, 10.51], z: [4, 6.44] },
];
/** The stair onto the spine (south half; the north is its mirror). */
export const SPINE_STAIR = { x0: -2.4, x1: 0, z0: SPINE.z, z1: SPINE.z + 5.2 };
/**
 * Full-height pieces breaking the long lines (south half, mirrored), with what they stand for:
 * on the west quay (x 18 … 23.5) the bulldozer covers the yard side and the cargo stack the dock side;
 * the hall's cargo stacks sit across its door-to-door line; the alley's pallet stack and skip.
 */
export const BLOCKERS: { name: string; x: [number, number]; z: [number, number]; h: number; y0?: number }[] = [
  { name: 'bulldozer', x: [17.9, 21.6], z: [8, 11], h: 3.0 },
  { name: 'cargo stack', x: [20.6, 23.5], z: [14.2, 17], h: 3.0 },
  { name: 'hall cargo', x: [-38.6, -33.4], z: [10, 11.6], h: 2.6 },
  { name: 'hall cargo 2', x: [-34.2, -32], z: [17.4, 18.8], h: 2.6 },
  { name: 'alley pallets', x: [-27, -24.6], z: [17.5, 19], h: 2.4 },
  { name: 'alley pallets 2', x: [-24.8, -22], z: [21, 22.4], h: 2.4 },
  // The dry dock: shipwright scaffold towers from its floor to over the quay (2.2), staggered across
  // each channel (the outer over the dock wall's top too): they cut the lines along the dock both at
  // floor height (under the hull's overhang included) and at quay height.
  { name: 'scaffold west outer', x: [23.4, 26.2], z: [21.2, 22.6], h: 2.2, y0: DOCK.floor },
  { name: 'scaffold west inner', x: [25.9, 27.6], z: [16, 17.4], h: 2.2, y0: DOCK.floor },
  { name: 'scaffold east outer', x: [33.8, 36.4], z: [21.2, 22.6], h: 2.2, y0: DOCK.floor },
  { name: 'scaffold east inner', x: [32.4, 34.1], z: [16, 17.4], h: 2.2, y0: DOCK.floor },
  // The sea quay: cargo stacks staggered across it.
  { name: 'sea cargo', x: [35.6, 39.8], z: [12, 14.4], h: 3 },
  { name: 'sea cargo 2', x: [39.6, 43.88], z: [21, 23], h: 3 },
];
/** 23.0: nav nodes in the passages the blockers leave (narrower than the 4 m lattice samples), south half. */
export const PASSAGES: [number, number, number][] = [
  [42.6, 0, 13.2], [38.2, 0, 22], [37.2, 0, 17.2], [39, 0, 10.8],
  [25.0, DOCK.floor, 16.7], [26.9, DOCK.floor, 21.9], [34.8, DOCK.floor, 16.7], [33.1, DOCK.floor, 21.9], [26, DOCK.floor, 19.3], [34, DOCK.floor, 19.3],
  // 37.0: either side of the scaffold stair's foot and top, into UNDER THE HULL.
  [28.4, DOCK.floor, 16.7], [31.6, DOCK.floor, 16.7], [28.4, DOCK.floor, 21.9], [31.6, DOCK.floor, 21.9],
  [22.3, 0, 12.6], [19, 0, 15.6], [-23.3, 0, 18.2], [-25.9, 0, 21.7],
];

/**
 * Micro-cover (instanced): Jersey barriers (2.2 × 1.0 × 0.6, along x or z) and barrel clusters, on
 * the lanes' approaches; all vaultable. South half, mirrored. Never against a wall: on the dock floor a
 * barrier against the dock wall let a sprint-jump land on the quay 4.5 m up (the body, stood on it,
 * crossed the carve line), and drums beside the fire stair a jump over its rail (stress test).
 */
export const BARRIERS: [number, number, 'x' | 'z', number?][] = [
  [-4.5, 12, 'x'], [12.5, 10, 'x'], [-15.5, 30.5, 'x'], [5, 27, 'x'], [19.5, 25, 'z'], [21.5, 5, 'x'],
  [-23.3, 28.5, 'z'], [39.3, 5, 'z'], [37.2, 26.5, 'z'], [-6, 40, 'x'], [9, 39.5, 'x'],
];
export const BARRELS: [number, number, number?][] = [
  [-6.4, 16.2], [-5.8, 16.9], [-6.6, 17.4], [15.8, 24.5], [16.5, 25], [15.9, 25.6],
  [40.2, 9.4], [40.8, 9.9], [-23.5, 15.4], [-22.9, 16],
  // 37.0: the drums on the dock floor (its channels by the hull, its head) made way for UNDER THE
  // HULL's cover and the deployment zone at the dock's head.
];

/** Walked onto from the floor beside it: at most this (more must be jumped). */
export const STEP = 0.28;

/** z → -z for the north half. */
export const mz = (z: number, flip: boolean) => (flip ? -z : z);

/** The ground: flat, the dry dock carved 0.5 m inside its walls' colliders. */
export function portHeight(x: number, z: number): number {
  const c = DOCK.wall / 2;
  return x > DOCK.x0 - c && x < DOCK.x1 + c && Math.abs(z) < DOCK.z + c ? DOCK.floor : 0;
}
export const PORT_TERRAIN: Terrain = { height: portHeight, maxHeight: 0, surface: 'concrete' };

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return p.x > BASE.x0 && p.x < BASE.x1 && z > BASE.z0 && z < BASE.z1;
}

/** Eight spawn points in a team's yard. */
export function spawnsOf(team: 'alpha' | 'omega') {
  const out: THREE.Vector3[] = [];
  for (const x of [-11, -4, 4, 11]) for (const z of [55.6, 59.2]) out.push(new THREE.Vector3(x, 0, team === 'alpha' ? z : -z));
  return out;
}

/**
 * Lanes from ALPHA's yard, as ALPHA faces north: the warehouse (in at the south door, up the stair,
 * along the upper floor west of the hole, down the north stair), the yard (over the team's own stacks
 * and the walk, then the middle), the dry dock (down the end stair, aboard the ship by the scaffold,
 * over the bridge). Each lane climbs its own high ground: a raised spot off a lane's path stays
 * empty (15.0, L-109).
 */
const UP = WH.up;
const ST = 2 * CONT.H;
const LANES_ALPHA: [number, number, number?][][] = [
  [[-18, 56.4], [-28, 48], [-36, 40], [-36, 31.5], [-44.25, 31.8], [-44.25, 19, UP], [-41.5, 10, UP], [-41.5, 0, UP], [-41.5, -10, UP], [-44.25, -19, UP], [-44.25, -31.8], [-36, -31.5], [-36, -40]],
  // Up the team's own stacks, along the walk to STACK B, off its edge into the yard.
  // 23.0: then over the spine (the maze's top) by its stairs, not round it.
  [[-18, 56.4], [-14, 46], [-18.8, 33.6], [-18.8, 21.5, ST], [-12, 20.4, ST], [-4, 20.4, ST], [4, 20.4, ST], [5, 16], [-1.2, 8.2], [-1.2, 4.2, CONT.H / 2], [-1.2, 0, CONT.H], [-1.2, -4.2, CONT.H / 2], [-1.2, -8.2], [-3, -26], [-4, -38]],
  // Down into the dock, past the scaffold stair's foot, UNDER THE HULL (37.0: was up onto the deck and
  // over the bridge: the room is the lane now; the deck and the bridge are the climb off it), out past
  // the far stair and up the far end.
  [[18, 56.4], [22, 48], [25.8, 41], [25.8, 38.5, 0], [25.8, 28, DOCK.floor], [28.4, 21.9, DOCK.floor], [28.4, 16.7, DOCK.floor], [30, 14.2, DOCK.floor], [30, 9, DOCK.floor], [27.6, 0, DOCK.floor], [30, -9, DOCK.floor], [30, -14.2, DOCK.floor], [31.6, -16.7, DOCK.floor], [31.6, -21.9, DOCK.floor], [34.2, -28, DOCK.floor], [34.2, -38.5, 0], [34.2, -41]],
];

/** Lanes per team, as that team faces: OMEGA's left is the east. */
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  const v = (x: number, z: number, y?: number) => new THREE.Vector3(x, y ?? portHeight(x, z), z);
  if (team === 'alpha') return LANES_ALPHA.map((L) => L.map(([x, z, y]) => v(x, z, y)));
  return LANES_ALPHA.slice()
    .reverse()
    .map((L) => L.map(([x, z, y]) => v(x, -z, y)));
}

/** The lanes for the flow reports: the warehouse side, the yard, the dock side. */
export function laneOf(x: number, _y: number, z: number): 0 | 1 | 2 | null {
  if (Math.abs(z) > BASE.z0 - 2) return null;
  return x < ALLEY.x1 ? 0 : x > 18 ? 2 : 1;
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
export const ZONES = {
  upper: Z('upper', 'UPPER FLOOR', 'ВТОРОЙ ЭТАЖ', [[WHI.x0, -WHI.z, WHI.x1, WHI.z]]),
  warehouse: Z('warehouse', 'BRICK WAREHOUSE', 'КИРПИЧНЫЙ СКЛАД', [[WHI.x0, -WHI.z, WH.x1, WHI.z]]),
  warehouseEnds: Z('warehouseEnds', 'WAREHOUSE DOORS', 'ВОРОТА СКЛАДА', [[X_W, WHI.z, WH.x1, COURT], [X_W, -COURT, WH.x1, -WHI.z]]),
  dockHead: Z('dockHead', 'DOCK HEAD', 'ГОЛОВА ДОКА', [[DOCK.x0, DOCK.z, DOCK.x1, COURT], [DOCK.x0, -COURT, DOCK.x1, -DOCK.z]]),
  fireStairs: Z('fireStairs', 'FIRE STAIRS', 'ПОЖАРНАЯ ЛЕСТНИЦА', [[ALLEY.x0, FIRE.zFoot - 1, ALLEY.x1, FIRE.zDoor + 1.5], [ALLEY.x0, -FIRE.zDoor - 1.5, ALLEY.x1, -FIRE.zFoot + 1]]),
  // 23.0: the maze across the yard: its top, and the gates through it.
  spine: Z('spine', 'THE SPINE', 'ХРЕБЕТ', [[SPINE.x0, -SPINE.z - 0.5, SPINE.x1, SPINE.z + 0.5]]),
  gates: Z('gates', 'SPINE GATES', 'ВОРОТА', GATES.map(([g0, g1]): [number, number, number, number] => [g0, -6, g1, 6])),
  stackTops: Z('stackTops', 'THE STACKS', 'ШТАБЕЛЯ', [[STACKS.x0, STACKS.z0, STACK_B.x1, STACKS.z1], [STACKS.x0, -STACKS.z1, STACK_B.x1, -STACKS.z0]]),
  bridge: Z('bridge', 'THE BRIDGE', 'РУБКА', [[SHIP.house.x0 - 0.5, -SHIP.house.z - 0.5, SHIP.house.x1 + 0.5, SHIP.house.z + 0.5]]),
  deck: Z('deck', 'THE DECK', 'ПАЛУБА', [[SHIP.x0, -SHIP.z, SHIP.x1, SHIP.z]]),
  dryDock: Z('dryDock', 'DRY DOCK', 'СУХОЙ ДОК', [[DOCK.x0, -DOCK.z, DOCK.x1, DOCK.z]]),
  // 37.0: the dock floor under the raised coaster (its channels included: one room).
  underHull: Z('underHull', 'UNDER THE HULL', 'ПОД КОРПУСОМ', [[DOCK.x0, -SHIP.z, DOCK.x1, SHIP.z]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA YARD', 'ПОЗИЦИЯ «АЛЬФА»', [[BASE.x0, BASE.z0, BASE.x1, Z_END]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA YARD', 'ПОЗИЦИЯ «ОМЕГА»', [[BASE.x0, -Z_END, BASE.x1, -BASE.z0]]),
  alphaCourt: Z('alphaCourt', 'ALPHA APRON', 'ПЛОЩАДКА «АЛЬФА»', [[X_W, COURT, QUAY_X, Z_END]]),
  omegaCourt: Z('omegaCourt', 'OMEGA APRON', 'ПЛОЩАДКА «ОМЕГА»', [[X_W, -Z_END, QUAY_X, -COURT]]),
  alley: Z('alley', 'THE ALLEY', 'ПРОХОД', [[ALLEY.x0, -COURT, ALLEY.x1, COURT]]),
  yard: Z('yard', 'CONTAINER YARD', 'КОНТЕЙНЕРНЫЙ ДВОР', [[ALLEY.x1, -COURT, 18, COURT]]),
  westQuay: Z('westQuay', 'WEST QUAY', 'ЗАПАДНЫЙ ПРИЧАЛ', [[18, -COURT, DOCK.x0, COURT]]),
  seaQuay: Z('seaQuay', 'SEA QUAY', 'МОРСКОЙ ПРИЧАЛ', [[DOCK.x1, -COURT, QUAY_X, COURT]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > WH.up - 1 && ZONES.upper.rects.some(inR)) return ZONES.upper;
  if (y > STACKS.top - 1 && ZONES.stackTops.rects.some(inR)) return ZONES.stackTops;
  if (y > SPINE.top - 0.8 && ZONES.spine.rects.some(inR)) return ZONES.spine;
  if (ZONES.gates.rects.some(inR)) return ZONES.gates;
  if (y > SHIP.house.roof - 0.8 && ZONES.bridge.rects.some(inR)) return ZONES.bridge;
  if (y > 0.5 && ZONES.deck.rects.some(inR)) return ZONES.deck;
  if (y > 1.5 && ZONES.fireStairs.rects.some(inR)) return ZONES.fireStairs;
  if (y < -1 && ZONES.underHull.rects.some(inR)) return ZONES.underHull;
  if (y < -1 && ZONES.dryDock.rects.some(inR)) return ZONES.dryDock;
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.warehouse, ZONES.warehouseEnds, ZONES.dockHead, ZONES.alley, ZONES.yard, ZONES.westQuay, ZONES.dryDock, ZONES.seaQuay]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}

/*
  23.0, the port's AI and density (self-play: docs/BENCH-23.0.json). 5v5 on the overhauled map was
  quiet a third to a half of every match (first engagement 16–17 s): the arena is 124 m long. 7v7 with
  50 tickets and forward respawns (as Maglev and the jungle); Maglev's under-fire reaction (a bot
  sniped from 16 m+ breaks for cover); three flankers on a contact; and the jungle's cover-hop push,
  so SMGs and shotguns close from the new micro-cover instead of running the open quay.
*/
export const OLDPORT_AI: ArenaProfile = {
  underFire: { on: true },
  flank: { per: 3, min: 10 },
  coverPush: { on: true },
  // Steep high ground (stacks 5.2, the spine 2.6) reached only by stairs: never straight up at a goal.
  directRise: 1,
};
export const OLDPORT_TEAM_SIZE = 7;
export const OLDPORT_TICKETS = 50;

/**
 * 23.0: forward respawn points on each team's approach, 37.5 m out (all level: a respawn takes the most
 * forward safe point, and a first cut with the alley's 6 m further forward sent most respawns there and
 * on into the yard: the dock lane fell to 12% of bot time). One per lane's mouth: the warehouse door,
 * the alley, the yard, the west quay, the sea quay.
 */
export function forwardOf(team: 'alpha' | 'omega') {
  const s = team === 'alpha' ? 1 : -1;
  return ([[-36, 37.5], [-24.5, 37.5], [-9, 37.5], [21, 37.5], [39.5, 37.5]] as const).map(([x, z]) => new THREE.Vector3(x, 0, z * s));
}

/**
 * 23.0: the yard's high ground is a cheap route (a multiple of a link's length): the stacks, their walk
 * and the spine's top, so a bot crossing the yard goes over the maze, not round it (the 17.1 bots
 * never climbed: 0.3–0.5% of their time up there).
 */
export const HIGH_COST = 0.4;
export function navCost(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const high = (p: { x: number; y: number; z: number }) => p.y > 2.4 && p.x > SPINE.x0 - 0.5 && p.x < SPINE.x1 + 0.5 && Math.abs(p.z) < STACKS.z1 + 1;
  return high(a) && high(b) ? HIGH_COST : 1;
}

/**
 * 23.0: how many bots each lane is worth to the director (warehouse, yard, dock). With the yard's high
 * ground cheap and two forward points on it, the yard drew 56–60% of bot time and the dock 10–16%;
 * the flanks are weighted up.
 */
export const LANE_WEIGHTS: [number, number, number] = [1.15, 0.8, 1.4];
/** 23.0: the flanks' bots keep to their lanes when the radar has a contact (else they cut into the yard). */
export const LANE_STRICT: [boolean, boolean, boolean] = [true, false, true];

/**
 * 27.0: the spawn pads (TdmData.pads), ALPHA's half mirrored for OMEGA: [x, floor y, z, yaw]. The first
 * is in the old yard (a safe rear pad); the rest cover the contested map, proposed by
 * __dev.spawnPads (farthest-point, then Lloyd relaxation over the nav, sheltered spots first). Moved by
 * hand: the fifth, from the container yard (two pads in one lane) to the warehouse's ground floor.
 */
export const SPAWN_PADS = mirrorPads([[0, 0, 57.4, 3.14], [-35, 4.4, 16, 1.96], [24.3, 0.56, 7, 0.39], [-32, 0, 40, 1.96], [32, 0, 44, 4.71], [-38, 0, 24, 1.57], [16, 0, 28, 0.79]]);

/**
 * 31.0: the deployment zones (TdmData.zones): ALPHA's, A to C from its left; OMEGA's by the map's
 * symmetry (mirror). Old Port: two, left and right flanks behind the container clusters. 37.0: B moved
 * from the dock apron (32, 0, 44) down onto the floor of its own dock head, where the dry dock opens
 * onto UNDER THE HULL: half the team's spawns walk straight into the room. Mirrored, so OMEGA's B is
 * as far from the room as ALPHA's (16 m to the hull's end, 31 m to its middle): neither owns it.
 */
export const SPAWN_ZONES = {
  symmetry: 'mirror' as const,
  theme: 'industrial' as const,
  half: [
    // Two, behind the container clusters on the flanks: the warehouse doors (west), the dock apron
    // (east). No zone in the yard: the containers between are the front.
    { id: 'A' as const, x: -32, y: 0, z: 40, r: 6, yaw: Math.PI },
    { id: 'B' as const, x: 30, y: DOCK.floor, z: 31, r: 4.5, yaw: Math.PI },
  ],
};
