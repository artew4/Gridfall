import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';

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
/** Container dimensions. */
export const CONT = { L: 6.06, W: 2.44, H: 2.6 };
/** THE STACKS (2-high block, top 5.2) and STACK B, joined by a walkway at the same height. */
export const STACKS = { x0: -20, x1: -20 + 2 * CONT.L, z0: 18, z1: 18 + 2 * CONT.W, top: 2 * CONT.H };
export const STACK_B = { x0: 2, x1: 2 + CONT.L, z0: STACKS.z0, z1: STACKS.z1 };
export const WALK = { x0: STACKS.x1, x1: STACK_B.x0, z0: 19.6, z1: 21.2 };
/** The dry dock: inner faces, its walls' colliders (1 m, top at quay level), its floor; the carve line lies inside the walls. */
export const DOCK = { x0: 24.5, x1: 35.5, z: 38, wall: 1, floor: -4.5 };
/** The coaster in the dock: hull, deck, the bridge house and its roof, gangways at ±gz. */
export const SHIP = { x0: 27, x1: 33, z: 15, deck: 1.0, house: { x0: 28.5, x1: 31.5, z: 2.5, roof: 3.6 }, gz: 7, gw: 1.6 };
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
  [[-18, 56.4], [-14, 46], [-18.8, 33.6], [-18.8, 21.5, ST], [-12, 20.4, ST], [-4, 20.4, ST], [4, 20.4, ST], [5, 16], [0, 8], [0, 0], [0, -12], [-3, -26], [-4, -38]],
  // Down into the dock, up the scaffold onto the ship, over the bridge, down the far end.
  [[18, 56.4], [22, 48], [25.8, 41], [25.8, 38.5, 0], [25.8, 28, DOCK.floor], [30, 28, DOCK.floor], [30, 13, SHIP.deck], [30, 10, SHIP.deck], [30, 0, SHIP.house.roof], [30, -10, SHIP.deck], [30, -13, SHIP.deck], [30, -28, DOCK.floor], [25.8, -28, DOCK.floor], [25.8, -38.5, 0], [25.8, -41]],
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
  stackTops: Z('stackTops', 'THE STACKS', 'ШТАБЕЛЯ', [[STACKS.x0, STACKS.z0, STACK_B.x1, STACKS.z1], [STACKS.x0, -STACKS.z1, STACK_B.x1, -STACKS.z0]]),
  bridge: Z('bridge', 'THE BRIDGE', 'РУБКА', [[SHIP.house.x0 - 0.5, -SHIP.house.z - 0.5, SHIP.house.x1 + 0.5, SHIP.house.z + 0.5]]),
  deck: Z('deck', 'THE DECK', 'ПАЛУБА', [[SHIP.x0, -SHIP.z, SHIP.x1, SHIP.z]]),
  dryDock: Z('dryDock', 'DRY DOCK', 'СУХОЙ ДОК', [[DOCK.x0, -DOCK.z, DOCK.x1, DOCK.z]]),
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
  if (y > SHIP.house.roof - 0.8 && ZONES.bridge.rects.some(inR)) return ZONES.bridge;
  if (y > 0.5 && ZONES.deck.rects.some(inR)) return ZONES.deck;
  if (y > 1.5 && ZONES.fireStairs.rects.some(inR)) return ZONES.fireStairs;
  if (y < -1 && ZONES.dryDock.rects.some(inR)) return ZONES.dryDock;
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.warehouse, ZONES.warehouseEnds, ZONES.dockHead, ZONES.alley, ZONES.yard, ZONES.westQuay, ZONES.dryDock, ZONES.seaQuay]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}
