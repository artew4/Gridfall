import * as THREE from 'three';
import type { Zone } from '../Level';
import { mirrorPads } from '../SpawnManager';

/*
  Neon Docks (8.0): a Team Deathmatch arena on a rainy harbour at night. Metres, y up, north = -z.
  Mirror-symmetric about z = 0: everything is authored in the south half (ALPHA's) and built again
  with z → -z, so each lane keeps its identity the whole length of the map (the water stays east).
  Colours are deliberately NOT symmetric: they are callouts ("enemy at the red stacks").

      z=-78 ┌──────── OMEGA SPAWN (walled yard, three exits behind blast walls) ────────┐
      z=-58 ═══════════╡   OMEGA FORECOURT                                   ╞══ rail ══ water
            RED STACKS │ alley │                                  │ NORTH QUAY  (crane legs,
      z=-12  (maze)    │ ░ ░ ░ │      WAREHOUSE 7  (catwalks 4.5 m, │  long sightlines, an
            YELLOW     │ doors │   stairs, cross bridge at z=0)   │  exterior stair to the
      z=+12 STACKS     │ ░ ░ ░ │                                  │  catwalk door)
            BLUE STACKS│       │                                  │ SOUTH QUAY
      z=+58 ═══════════╡   ALPHA FORECOURT                                   ╞══ rail ══ water
      z=+78 └──────── ALPHA SPAWN ───────────────────────────────────────────────────┘
          x=-54      -17  -14                                  14  20                   46

  28.0: wider at both edges. West of the maze (x -68 … -54, the old wall moved out) the OLD DEPOT: two
  broken lines of containers along the wall, cross pieces that close corridors into dead ends, a
  two-high sniper stack reached by a steel stair. East of the quay (x 49 … 56) the BARGES: two moored
  per half, gangways through the fence, pontoons joining them into one route along the water from end
  to end; the harbour between is water (holes in the ground: fall in and you drown).

  Lane 1 (x < -17): a maze of shipping containers on an 8 m grid — tight corners, short sightlines.
  Lane 2 (|x| < 14): the warehouse, the meat grinder — floor fights under catwalks you can reach.
  Lane 3 (x > 14): the open quay along the water — long sightlines for rifles, little cover.
  Transitions: the maze divider's gaps and the warehouse's west doors (lanes 1-2), the east doors and
  the exterior stair to the catwalk (lanes 2-3), and the forecourts at both ends (all three).
*/

/** The quay: the water starts here (a barrier stands just inside it). */
export const QUAY_X = 46;
/** The west boundary wall (inner face). 28.0: moved out from -54 (the old depot between). */
export const WEST_X = -68;
/** 28.0: the old west wall's line: the depot lies west of it, the maze east. */
export const MAZE_WEST = -54;
/**
 * 28.0, the old depot (south half; mirrored): containers [cx, cz, along, tiers]; the sniper stack (a
 * two-high container's top, `top` m) and the stair onto it.
 */
export const DEPOT = {
  boxes: [
    [-64, 6, 'z', 1], [-64, 18, 'z', 2], [-64, 36, 'z', 2], [-64, 48, 'z', 1],
    [-58, 12, 'z', 1], [-58, 27, 'z', 2], [-58, 42, 'z', 1],
    [-64.95, 30.5, 'x', 1], [-59.7, 18, 'x', 1],
  ] as [number, number, 'x' | 'z', 1 | 2][],
  stack: { x0: -65.22, x1: -62.78, z0: 14.97, z1: 21.03, top: 5.2 },
  stair: { x0: -65.22, z0: 21.03, x1: -62.78, z1: 27.5 },
};
/**
 * 28.0, the barges (south half; mirrored): decks (top `deck`), the gangways from the quay through the
 * fence, the pontoons joining them (top `pontoon`; the middle one, z -8 … 8, is shared).
 */
export const BARGES = {
  deck: -0.2,
  pontoon: -0.35,
  hulls: [{ x0: 49, x1: 56, z0: 8, z1: 28 }, { x0: 49, x1: 56, z0: 34, z1: 52 }],
  gangways: [{ z0: 17, z1: 19 }, { z0: 42, z1: 44 }],
  pontoons: [{ x0: 50, x1: 53, z0: 28, z1: 34 }],
  middle: { x0: 50, x1: 53, z0: -8, z1: 8 },
};
/** The forecourts end here; behind it only the spawn yards. */
export const END_Z = 58;
/** ALPHA's spawn yard (OMEGA's is the mirror). */
export const BASE = { x0: -22, x1: 22, z0: 60, z1: 78 };
/**
 * The warehouse's outer walls. 15.0: roofless and 7 m (was a 10 m box with a roof): the gantries
 * outside see in, and holding it costs. 7 m: from a catwalk rail (5.55) a jump reaches 6.55.
 */
export const WH = { x0: -14, x1: 14, z0: -26, z1: 26, h: 7 };
/** 15.0: the container gantry (a steel walk at container-top height over the maze's x = -45 corridor). */
export const CG = { x0: -45.9, x1: -44.1, z: 35, y: 2.6 };
/** 15.0: the quay gantry beside the warehouse (deck 6.5), the crane nest off it, and its reach. */
export const QG = { x0: 18, x1: 20.4, z: 30, y: 6.5, nest: { x1: 22.2, z: 4 } };
/** 15.0: the yards' two exits (the centre one is walled up), angled out to the flanks. */
export const EXITS = [-17, 17];
/** Catwalk and bridge deck top. */
export const DECK = 4.5;
/** A shipping container (20 ft): long side, short side, height. */
export const CONT = { L: 6.06, W: 2.44, H: 2.6 };
/** The maze grid (cell centres), south half; corridors run along every cell boundary. */
export const MAZE = { xs: [-49, -41, -33, -25], zs: [4, 12, 20, 28], cell: 8 };

/** z → -z for the north half. */
export const mz = (z: number, flip: boolean) => (flip ? -z : z);

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return p.x > BASE.x0 && p.x < BASE.x1 && z > BASE.z0 && z < BASE.z1;
}

/** Eight spawn points in a team's yard (floor y = 0). */
export function spawnsOf(team: 'alpha' | 'omega') {
  const out: THREE.Vector3[] = [];
  for (const x of [-14, -5, 5, 14]) for (const z of [67, 73]) out.push(new THREE.Vector3(x, 0, team === 'alpha' ? z : -z));
  return out;
}

/**
 * Lanes from ALPHA's base to OMEGA's, left (the maze, west), centre (the warehouse), right (the quay),
 * ending short of OMEGA's yard. Every point is on open floor (checked when the level builds).
 */
const LANES_ALPHA: [number, number, number?][][] = [
  // 15.0: the containers, over the gantry (the maze below is the hunts' and flanks').
  [[-21, 54], [-38, 46], [-41.5, 40], [-45, 28, CG.y], [-45, 14, CG.y], [-45, 0, CG.y], [-45, -14, CG.y], [-45, -28, CG.y], [-41.5, -40], [-29, -48]],
  // The centre is the high route: in at the main door, up the west stair, along the catwalk and over
  // the bridge's end, down the far stair, out of the far door (the floor fight happens round it).
  [[0, 57.8], [0, 40], [0, 28], [-12.1, 16, 4.5], [-12.1, 6, 4.5], [-12.1, -6, 4.5], [-12.1, -16, 4.5], [0, -28], [0, -40], [0, -52]],
  // 15.0: the waterfront: out along the quay (x 31–33, far enough from the warehouse that a contact
  // inside it doesn't pull the lane in), up through the crane nest at mid-field.
  [[21, 54], [24, 46], [31, 30], [33, 14], [21, 0, QG.y], [33, -14], [31, -30], [24, -46], [15, -52]],
  // 28.0, the edges: the old depot (east corridor, the middle one, round the cross pieces) and the
  // barges (over the gangways, along the decks and pontoons, end to end on the water).
  [[-21, 54], [-40, 54], [-55.4, 50], [-55.4, 40], [-60.5, 34], [-60.5, 24], [-55.4, 20], [-55.4, 8], [-61, 0], [-55.4, -8], [-55.4, -20], [-60.5, -24], [-60.5, -34], [-55.4, -40], [-55.4, -50], [-40, -54], [-29, -50]],
  [[21, 54], [40, 53], [45.2, 43], [50.4, 43], [51.9, 36], [51.5, 31, BARGES.pontoon], [51.9, 26, BARGES.deck], [51.9, 20, BARGES.deck], [51.9, 10, BARGES.deck], [51.5, 0, BARGES.pontoon], [51.9, -10, BARGES.deck], [51.9, -20, BARGES.deck], [51.9, -26, BARGES.deck], [51.5, -31, BARGES.pontoon], [51.9, -36, BARGES.deck], [50.4, -43, BARGES.deck], [45.2, -43], [40, -53], [24, -50]],
];

/**
 * Lanes per team, as that team faces: OMEGA's left is the quay (east). 28.0: the three main lanes, then
 * the two edges (left, right), each group mirrored for OMEGA.
 */
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
  if (team === 'alpha') return LANES_ALPHA.map((L) => L.map(([x, z, y]) => v(x, z, y)));
  return [...LANES_ALPHA.slice(0, 3).reverse(), ...LANES_ALPHA.slice(3).reverse()].map((L) => L.map(([x, z, y]) => v(x, -z, y)));
}

/** Container colour by where it stands: ALPHA's half blue, the middle yellow, OMEGA's half red. */
export function stackColor(z: number): 'blue' | 'yellow' | 'red' {
  return z > 12 ? 'blue' : z < -12 ? 'red' : 'yellow';
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
/** Rects x0, z0, x1, z1; the first match wins (the catwalks are tested by height first). */
export const ZONES = {
  // 28.0: the sniper stack (by height), the old depot, the barges.
  sniperStack: Z('sniperStack', 'SNIPER STACK', 'СНАЙПЕРСКИЙ ШТАБЕЛЬ', [[DEPOT.stack.x0 - 0.5, DEPOT.stack.z0 - 0.5, DEPOT.stack.x1 + 0.5, DEPOT.stack.z1 + 0.5], [DEPOT.stack.x0 - 0.5, -DEPOT.stack.z1 - 0.5, DEPOT.stack.x1 + 0.5, -DEPOT.stack.z0 + 0.5]]),
  depot: Z('depot', 'OLD DEPOT', 'СТАРОЕ ДЕПО', [[WEST_X - 2, -BASE.z0, MAZE_WEST, BASE.z0]]),
  barges: Z('barges', 'THE BARGES', 'БАРЖИ', [[QUAY_X + 0.6, -BASE.z0, QUAY_X + 14, BASE.z0]]),
  catwalks: Z('catwalks', 'CATWALKS', 'МОСТКИ', [[WH.x0, WH.z0, WH.x1, WH.z1]]),
  // 15.0: the raised walks outside the warehouse.
  nest: Z('nest', 'CRANE NEST', 'КАБИНА КРАНА', [[QG.x0 - 0.5, -QG.nest.z, QG.nest.x1 + 0.5, QG.nest.z]]),
  quayGantry: Z('quayGantry', 'QUAY GANTRY', 'ПРИЧАЛЬНАЯ ЭСТАКАДА', [[QG.x0 - 0.5, -QG.z - 14, QG.x1 + 0.5, QG.z + 14]]),
  containerGantry: Z('containerGantry', 'CONTAINER GANTRY', 'КОНТЕЙНЕРНАЯ ЭСТАКАДА', [[CG.x0 - 0.5, -CG.z - 9, CG.x1 + 0.5, CG.z + 9]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA SPAWN', 'ПОЗИЦИЯ «АЛЬФА»', [[BASE.x0, BASE.z0, BASE.x1, BASE.z1]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA SPAWN', 'ПОЗИЦИЯ «ОМЕГА»', [[BASE.x0, -BASE.z1, BASE.x1, -BASE.z0]]),
  warehouse: Z('warehouse', 'WAREHOUSE 7', 'СКЛАД №7', [[WH.x0, WH.z0, WH.x1, WH.z1]]),
  crane: Z('crane', 'THE CRANE', 'ПОРТАЛЬНЫЙ КРАН', [[WH.x1, -10, QUAY_X + 2, 10]]),
  southQuay: Z('southQuay', 'SOUTH QUAY', 'ЮЖНЫЙ ПРИЧАЛ', [[WH.x1, 10, QUAY_X + 2, BASE.z0]]),
  northQuay: Z('northQuay', 'NORTH QUAY', 'СЕВЕРНЫЙ ПРИЧАЛ', [[WH.x1, -BASE.z0, QUAY_X + 2, -10]]),
  alphaCourt: Z('alphaCourt', 'ALPHA FORECOURT', 'ПЛОЩАДКА «АЛЬФА»', [[-17, WH.z1, WH.x1, BASE.z0]]),
  omegaCourt: Z('omegaCourt', 'OMEGA FORECOURT', 'ПЛОЩАДКА «ОМЕГА»', [[-17, -BASE.z0, WH.x1, WH.z0]]),
  blue: Z('blue', 'BLUE STACKS', 'СИНИЙ ШТАБЕЛЬ', [[WEST_X - 2, 12, -17, BASE.z0], [-17, 12, WH.x0, WH.z1]]),
  yellow: Z('yellow', 'YELLOW STACKS', 'ЖЁЛТЫЙ ШТАБЕЛЬ', [[WEST_X - 2, -12, WH.x0, 12]]),
  red: Z('red', 'RED STACKS', 'КРАСНЫЙ ШТАБЕЛЬ', [[WEST_X - 2, -BASE.z0, -17, -12], [-17, WH.z0, WH.x0, -12]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > 4 && ZONES.sniperStack.rects.some(inR)) return ZONES.sniperStack;
  if (y > 3 && ZONES.catwalks.rects.some(inR)) return ZONES.catwalks;
  if (y > 5 && ZONES.nest.rects.some(inR)) return ZONES.nest;
  if (y > 1 && ZONES.quayGantry.rects.some(inR)) return ZONES.quayGantry;
  if (y > 1.5 && ZONES.containerGantry.rects.some(inR) && x > CG.x0 - 0.3 && x < CG.x1 + 0.3) return ZONES.containerGantry;
  for (const zone of Object.values(ZONES)) {
    if (zone === ZONES.catwalks || zone === ZONES.nest || zone === ZONES.quayGantry || zone === ZONES.containerGantry || zone === ZONES.sniperStack) continue;
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}

/**
 * 28.0: the spawn pads (TdmData.pads), ALPHA's half mirrored for OMEGA: [x, floor y, z, yaw]. The yard;
 * the old depot's middle corridor; a barge's deck; the depot's west alley (was the maze's west column:
 * self-play put too little of the fight in the new edges); the west forecourt; the
 * quay; the warehouse floor. Proposed by __dev.spawnPads and placed by hand where the edges needed one
 * (the tool's picks, sheltered first, left the depot and the barges without).
 */
export const SPAWN_PADS = mirrorPads([
  [0, 0, 70, 3.14], [-61, 0, 24, 1.57], [51.2, BARGES.deck, 16, 4.71], [-66.6, 0, 40, 1.57], [-17, 0, 40, 3.14], [31, 0, 32, 3.14], [1, 0, 14, 3.14],
]);
