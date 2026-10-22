import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';
import { smoothstep } from '../../core/math';
import { noise } from '../jungle/Terrain';
import type { ArenaProfile } from '../../enemies/arena/ArenaCtx';
import { mirrorPads } from '../SpawnManager';

/*
  Jungle: Crash Site (15.0): a Team Deathmatch arena built for 5v5 in Deep Jungle's biome, not a
  converted assault map (Firebase Viper keeps its survival and its 9.0 TDM). Metres, y up, north = -z.
  Mirror-symmetric about z = 0 (ALPHA south), so each lane keeps its identity end to end.

     z=-64 ┌────────────── OMEGA LZ (sandbag yard, two exits) ─────────────────────┐ cliff
     z=-44 │ ramp ╲                    OMEGA APPROACH                     ╱ ramp      │
           │ THE   │     W trench ╲            ╱ E trench      │  THE     │ EAST     │
           │ RIDGE │  (mud, 1.4 m) ╲  THE WRECK  ╱              │ RAVINE   │ BANK     │
     z=  0 │ 3.6 m ├─ log ramp ─────  dropship  ───────────────┤ -4 m     ├ log      │
           │ rock  │  (fallen tree)  (hull CQB, wing ramps to  │ floor    │ bridges  │
           │ lip   │                  the roof 3.9 m)          │ rock rims│          │
     z=+44 │ ramp ╱                    ALPHA APPROACH                     ╲ ramp      │
     z=+64 └────────────── ALPHA LZ ─────────────────────────────────────────────────┘
         x=-48  -30                  0                       24     33         48

  Lane 1, west (THE RIDGE): a rock plateau 3.6 m up along the cliff, long sightlines down its length
  and over the clearing (rifles); up by the stone steps at both ends, the steps at z ±22 and the
  fallen tree at mid-field; a rock lip along its edge with gaps to drop into the clearing.
  Lane 2, centre (THE WRECK): a crashed dropship across the middle (walk through its hull, climb a
  broken wing onto its roof), approached down mud trenches 1.4 m deep from both ends (close range).
  Lane 3, east (THE RAVINE): a rock-lined ravine 4 m deep, its floor the low road end to end (close
  quarters), and the east bank above it (open jungle); fallen giant trees bridge it at z 0 and ±18.

  19.0, Crash Site 2.0 (played 7v7): the wreck now lies across an overgrown stepped temple (T1, T2,
  the gate, the undercroft under the hull, the shrine and its lintel to the hull's roof); the trenches
  end short of the temple's front stairs; the forest is denser. See docs/LEVELS.md.

  Rules that keep a heightfield honest (the terrain is always floor: the foot circle stands on its
  highest point, so a steep face of terrain would be walked straight up):
   - the trenches' banks are gentle (1.4 m over 4 m: 19°): walked in and out anywhere;
   - the ridge is rock blocks on flat ground (faces are walls, tops are floors);
   - the ravine is carved, and its two edges are covered end to end by rock rims whose faces lie
     clear of any foot sample on either side (a body never reads the bank from the floor).
*/

/** The boundary cliffs' inner faces. */
export const X_OUT = 48;
export const Z_END = 64;
/** The ridge: a rock plateau along the west cliff, its stone-step ramps at both ends. */
export const RIDGE = { x0: -48, x1: -30, z: 34, top: 3.6, ramp: { x0: -44, x1: -34, z1: 44 } };
/** The ravine: carved floor between rock rims; ramps out at both ends. */
/** Rim tops, trunk decks and the hull's deck are all ≤ 0.3 m: a box is walked onto only up to that (more must be jumped). */
export const STEP = 0.28;
export const RAVINE = { x0: 24, x1: 33, z: 40, end: 51, floor: -4, rim: 1.5, rimTop: STEP };
/**
 * 33.0, THE OUTPOST (replaces 19.0's temple, wreck and shrine): an abandoned research lab raised on
 * stilts over the clearing. Three levels and a fourth below:
 *  - the ground floor, open under the deck (columns, the hub's stairwell railed in its middle);
 *  - the deck (`deck.y`), a walkway round the lab, up the deck stairs (along x outside its long sides,
 *    from the ground at `stair.x1` to a landing at `stair.x0`), railed at its edges;
 *  - the lab on the deck (walls `lab`, doors and windows), its stair (`roofStair`, along x through the
 *    middle) up to the roof (`roof`), parapets round it and the comms mast;
 *  - under it all the tunnels' hub (TUNNEL).
 */
export const OUTPOST = {
  deck: { x0: -11, x1: 11, z: 7, y: 3.6, slab: 0.3 },
  lab: { x0: -8.5, x1: 8.5, z: 5, t: 0.3, h: 3.3 },
  roof: 7.2,
  stair: { x0: 1.7, x1: 11.3, z0: 7.25, z1: 9.7, landing: -1 },
  roofStair: { x0: -6.2, x1: 3.4, z: 1.2, open: -3 },
  mast: { x: 5.8, z: 0, r: 0.45, top: 19 },
};
/**
 * 33.0, the tunnels: passages 4 m under the jungle floor (`floor`), roofed at `roof` (the slabs over
 * them are the ground above), their walls `wall` thick. A hub under the outpost (its stair up to the
 * ground floor, along x through the middle, |z| < `stair.z`), and per half (mirrored) two L-shaped
 * branches: east to the ravine (opening through its west rim: the east depression), west to a sunken
 * stair pit at the ridge's foot (the west depression; the pit's stair runs down along x from the
 * ground at `pit.x0` to the floor at `pit.x1`, open to the sky until `roofFrom`).
 */
export const TUNNEL = {
  floor: -4,
  roof: -0.4,
  wall: 1.2,
  hub: { x0: -8, x1: 8, z0: -5, z1: 5, stair: { x0: -5.5, x1: 4.1, z: 1.25 } },
  /** ALPHA's half; OMEGA's is the mirror (z → -z). */
  runs: [
    { name: 'eastConnector', x0: 4, x1: 7, z0: 5, z1: 15 },
    { name: 'eastRun', x0: 4, x1: RAVINE.x0, z0: 12, z1: 15 },
    { name: 'westConnector', x0: -7, x1: -4, z0: 5, z1: 15 },
    { name: 'westRun', x0: -15.4, x1: -4, z0: 12, z1: 15 },
  ],
  pit: { x0: -25, x1: -15.4, z0: 12, z1: 15 },
  roofFrom: -17,
};
type Rect = { x0: number; x1: number; z0: number; z1: number };
const mirrorRect = (r: Rect): Rect => ({ x0: r.x0, x1: r.x1, z0: -r.z1, z1: -r.z0 });
/** Every space of the tunnels, both halves: the hub, the runs, the pits (floor rects, inside the walls). */
export function tunnelRects(): (Rect & { kind: 'hub' | 'run' | 'pit' })[] {
  const out: (Rect & { kind: 'hub' | 'run' | 'pit' })[] = [{ ...TUNNEL.hub, kind: 'hub' }];
  for (const r of TUNNEL.runs) out.push({ ...r, kind: 'run' }, { ...mirrorRect(r), kind: 'run' });
  out.push({ ...TUNNEL.pit, kind: 'pit' }, { ...mirrorRect(TUNNEL.pit), kind: 'pit' });
  return out;
}
const TR = tunnelRects();
/** Signed distance to a rect (negative inside: the distance to its nearest edge). */
function rectDist(x: number, z: number, r: Rect) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
}
/** The pit's floor: its stair's slope (5 cm under the steps), level with the ground at its head. */
export function pitFloor(x: number) {
  const P = TUNNEL.pit;
  return TUNNEL.floor * THREE.MathUtils.clamp((x - P.x0) / (P.x1 - P.x0), 0, 1) - 0.05;
}
/** Distance to the nearest tunnel space (negative inside one). */
export function tunnelDist(x: number, z: number) {
  let d = Infinity;
  for (const r of TR) d = Math.min(d, rectDist(x, z, r));
  return d;
}
/**
 * The terrain carved for the tunnels at (x, z) given the surface there, or the surface: each space's
 * floor flat to 0.8 m into its walls, rising to the surface over their last 0.35 m (the ravine's rule:
 * no foot sample, on either side, ever reads the slope). Flat that far under the wall, the terrain
 * mesh's 0.9 m triangles never draw the rise out past the wall's face (the first builds showed a curb,
 * then a sloped band, along every wall).
 */
export function tunnelCarve(x: number, z: number, surface: number) {
  let h = surface;
  const W = TUNNEL.wall;
  for (const r of TR) {
    const d = rectDist(x, z, r);
    if (d > W) continue;
    const floor = r.kind === 'pit' ? pitFloor(x) : TUNNEL.floor;
    const k = smoothstep(W - 0.4, W - 0.05, d);
    h = Math.min(h, floor + (surface - floor) * k);
  }
  return h;
}

/**
 * Boxes [x0, z0, x1, z1] covering a mask on a 0.2 m grid (row runs, merged down while identical): the
 * tunnels' walls and roofs are made from masks of the spaces above, so no corner is missed.
 */
function boxesOf(mask: (x: number, z: number) => boolean, x0: number, z0: number, x1: number, z1: number) {
  const G = 0.2;
  const nx = Math.round((x1 - x0) / G), nz = Math.round((z1 - z0) / G);
  const runsOf = (j: number) => {
    const out: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= nx; i++) {
      const on = i < nx && mask(x0 + (i + 0.5) * G, z0 + (j + 0.5) * G);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push([start, i]);
        start = -1;
      }
    }
    return out;
  };
  const boxes: [number, number, number, number][] = [];
  let open = new Map<string, number>();
  for (let j = 0; j <= nz; j++) {
    const runs = j < nz ? runsOf(j) : [];
    const next = new Map<string, number>();
    for (const [a, b] of runs) next.set(`${a},${b}`, open.get(`${a},${b}`) ?? j);
    for (const [k, j0] of open) {
      if (next.get(k) === j0) continue;
      const [a, b] = k.split(',').map(Number);
      boxes.push([+(x0 + a * G).toFixed(2), +(z0 + j0 * G).toFixed(2), +(x0 + b * G).toFixed(2), +(z0 + j * G).toFixed(2)]);
    }
    open = next;
  }
  return boxes;
}
const inside = (x: number, z: number) => TR.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
/** Within the wall's thickness of a space (L∞, so corners are square). */
const near = (x: number, z: number) => TR.some((r) => x > r.x0 - TUNNEL.wall && x < r.x1 + TUNNEL.wall && z > r.z0 - TUNNEL.wall && z < r.z1 + TUNNEL.wall);
/** The ravine's rim stands there (it is the wall), and the pits' heads are open (the stairs come up there). */
const noWall = (x: number, z: number) => x > RAVINE.x0 - RAVINE.rim || (x < TUNNEL.pit.x0 && Math.abs(z) > TUNNEL.pit.z0 && Math.abs(z) < TUNNEL.pit.z1);
const BX = [TUNNEL.pit.x0 - 2, -16.4, RAVINE.x0 + 0.2, 16.4] as const;
/** The tunnels' walls [x0, z0, x1, z1]: everything within the wall's thickness of a space, outside them all. */
export function tunnelWalls() {
  return boxesOf((x, z) => near(x, z) && !inside(x, z) && !noWall(x, z), ...BX);
}
/**
 * The roof slabs [x0, z0, x1, z1] (top at the ground, underside at TUNNEL.roof): over the spaces and
 * their walls from `roofFrom` east, except the hub's stairwell (open to the outpost's ground floor) and
 * the rim's width at the ravine (a lintel there, level with the rim's top).
 */
export function tunnelRoofs() {
  const S = TUNNEL.hub.stair;
  return boxesOf((x, z) => near(x, z) && x > TUNNEL.roofFrom && x < RAVINE.x0 - RAVINE.rim && !(x > S.x0 && x < S.x1 && Math.abs(z) < S.z), ...BX);
}
/** ALPHA's landing zone (OMEGA's is the mirror): a sandbag yard, two exits. */
export const BASE = { x0: -16, x1: 16, z0: 54, z1: 63 };
/** The approaches (in front of the yards) start here. */
export const COURT = 44;
/** Mud trenches (south half, mirrored): polylines and their profile. */
/** Banks 5.5 m: a smoothstep's steepest point is 1.5× its mean, so 1.4 m over 5.5 m peaks at 21°. */
// 19.0: endFade 6 → 7 (the trenches' new ends, short of the temple, peaked at 22.2° with 6).
export const TRENCH = { depth: 1.4, floor: 1.3, bank: 5.5, endFade: 7 };
export const TRENCHES: [number, number][][] = [
  // 19.0: they end short of the temple's front stairs (they ran into the old wreck's clearing).
  [[-12, 47], [-17, 35], [-14, 25.5]],
  [[11, 46], [16, 34], [14, 25.5]],
];
/** Fallen giant trees across the ravine (z of each). */
export const BRIDGES = [0, 18, -18];

/** z → -z for the north half. */
export const mz = (z: number, flip: boolean) => (flip ? -z : z);

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from a point to the nearest trench's centre line (either half). */
export function trenchDist(x: number, z: number) {
  let d = Infinity;
  const az = Math.abs(z);
  for (const L of TRENCHES) for (let i = 1; i < L.length; i++) d = Math.min(d, segDist(x, az, L[i - 1][0], L[i - 1][1], L[i][0], L[i][1]));
  return d;
}

/** The ravine floor along z (the ramps out at both ends). */
export function ravineFloor(z: number) {
  const az = Math.abs(z);
  if (az <= RAVINE.z) return RAVINE.floor;
  if (az >= RAVINE.end) return 0;
  return RAVINE.floor * (1 - (az - RAVINE.z) / (RAVINE.end - RAVINE.z));
}

/**
 * 33.0: the walkable heightfield: the jungle floor (crashSurface) with the tunnels carved into it (their
 * slabs, built over them, are the ground above).
 */
export function crashHeight(x: number, z: number): number {
  const s = crashSurface(x, z);
  return tunnelDist(x, z) < TUNNEL.wall ? tunnelCarve(x, z, s) : s;
}

/**
 * Height of the jungle floor. Flat on the yards, the approaches' middle, the outpost's clearing and
 * under the ridge (its blocks stand on y = 0); gentle hummocks elsewhere (33.0: none near the tunnels:
 * their slabs lie level); the trenches carved with gentle banks; the ravine carved between its rims
 * (the drop lies under the rim rocks). The plants and the mist follow this (never down a tunnel).
 */
export function crashSurface(x: number, z: number): number {
  // The ravine: the floor inside the rims; the drop happens under the rim rocks, clear of foot samples.
  // The drop ends 0.1 m inside each rim's face: a body against it stands at +0.35 and samples ±0.21.
  const r0 = RAVINE.x0 + 0.1, r1 = RAVINE.x1 - 0.1;
  if (x > RAVINE.x0 - RAVINE.rim + 0.25 && x < RAVINE.x1 + RAVINE.rim - 0.25 && Math.abs(z) < RAVINE.end) {
    const f = ravineFloor(z);
    if (x >= r0 && x <= r1) return f;
    // Under the rims: blend (never stood on: the rim rock covers it).
    const k = x < r0 ? smoothstep(RAVINE.x0 - RAVINE.rim + 0.25, r0, x) : 1 - smoothstep(r1, RAVINE.x1 + RAVINE.rim - 0.25, x);
    return f * k;
  }
  // Hummocks, faded out where the arena needs flat ground.
  const yard = Math.abs(z) > COURT - 2 ? smoothstep(COURT + 2, COURT - 2, Math.abs(z)) : 1;
  // 19.0: flat round the centre (33.0: the outpost and its stairs stand on y = 0), and round the tunnels.
  const wreck = smoothstep(22, 28, Math.hypot(x / 1.3, z)) * smoothstep(TUNNEL.wall + 0.3, TUNNEL.wall + 4, tunnelDist(x, z));
  const ridge = smoothstep(-31, -26, x);
  const bank = x > RAVINE.x1 ? smoothstep(RAVINE.x1 + RAVINE.rim, RAVINE.x1 + RAVINE.rim + 4, x) : x < RAVINE.x0 ? smoothstep(RAVINE.x0 - RAVINE.rim, RAVINE.x0 - RAVINE.rim - 4, x) : 0;
  // |z|: mirror-symmetric, like everything else on the map.
  const hills = Math.max(0, (noise(x * 0.07 + 31, Math.abs(z) * 0.07 - 9) - 0.4) * 1.2) * yard * wreck * ridge * bank;
  // The trenches: a flat floor, gentle banks; no hummocks on the banks or 3 m beyond them (a hummock
  // sliding into a bank added its slope to the bank's: 25° at the bends).
  const td = trenchDist(x, z);
  const carve = td < TRENCH.floor ? 1 : td < TRENCH.floor + TRENCH.bank ? 1 - smoothstep(TRENCH.floor, TRENCH.floor + TRENCH.bank, td) : 0;
  // The trenches end in ramps out (no step at their ends): fade the depth near each end point.
  let endFade = 1;
  for (const L of TRENCHES) for (const p of [L[0], L[L.length - 1]]) endFade = Math.min(endFade, smoothstep(0, TRENCH.endFade, Math.hypot(x - p[0], Math.abs(z) - p[1])));
  const k = carve * endFade;
  const away = smoothstep(TRENCH.floor + TRENCH.bank, TRENCH.floor + TRENCH.bank + 3, td);
  return hills * Math.max(away, 1 - endFade) - TRENCH.depth * k;
}

export const CRASH_TERRAIN: Terrain = { height: crashHeight, maxHeight: 2, surface: 'sand' };

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return p.x > BASE.x0 && p.x < BASE.x1 && z > BASE.z0 && z < BASE.z1;
}

/** Eight spawns in a team's yard. */
export function spawnsOf(team: 'alpha' | 'omega') {
  const out: THREE.Vector3[] = [];
  for (const x of [-11, -4, 4, 11]) for (const z of [57.5, 60.5]) out.push(new THREE.Vector3(x, 0, team === 'alpha' ? z : -z));
  return out;
}

/**
 * 19.0: forward respawn points (TdmData.forward), on the team's own approach about 20 m short of the
 * temple: one behind each lane's mouth (the ridge's foot, the trenches' starts, the ravine's bank).
 */
export function forwardOf(team: 'alpha' | 'omega') {
  const s = team === 'alpha' ? 1 : -1;
  return ([[-26, 40], [-8, 43], [3, 43], [12.5, 40.5], [19.5, 41]] as const).map(([x, z]) => new THREE.Vector3(x, crashHeight(x, z * s), z * s));
}

/** Lanes, as ALPHA faces north: the ridge (west), the wreck (centre), the ravine (east). */
const LANES_ALPHA: [number, number, number?][][] = [
  [[-18, 57.2], [-26, 52], [-39, 47], [-39, 30, RIDGE.top], [-39, 15, RIDGE.top], [-39, 0, RIDGE.top], [-39, -15, RIDGE.top], [-39, -30, RIDGE.top], [-39, -47], [-26, -52]],
  // 33.0: down the west trench and across the outpost's ground floor, under the lab's deck.
  [[-18, 57.2], [-12, 48], [-12, 44], [-16, 34], [-12, 26], [-9.5, 18], [-9.5, 8], [-9.5, 0], [-9.5, -8], [-9.5, -18], [-12, -26], [-16, -34], [-12, -44], [-12, -48]],
  [[18, 57.2], [24, 54], [28.5, 52.5], [28.5, 30, RAVINE.floor], [28.5, 12, RAVINE.floor], [28.5, -6, RAVINE.floor], [28.5, -24, RAVINE.floor], [28.5, -40, RAVINE.floor], [28.5, -52.5], [24, -54]],
];

/** Lanes per team, as that team faces: OMEGA's left is the east. */
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  // Ground points stand on the terrain (the trenches are 1.4 m down).
  const v = (x: number, z: number, y?: number) => new THREE.Vector3(x, y ?? crashHeight(x, z), z);
  if (team === 'alpha') return LANES_ALPHA.map((L) => L.map(([x, z, y]) => v(x, z, y)));
  return LANES_ALPHA.slice()
    .reverse()
    .map((L) => L.map(([x, z, y]) => v(x, -z, y)));
}

/** The lanes for the flow reports: the ridge side, the outpost, the ravine side; 33.0: and the tunnels. */
export function laneOf(x: number, y: number, z: number): 0 | 1 | 2 | 3 | null {
  if (Math.abs(z) > BASE.z0 - 2) return null;
  if (y < -1 && tunnelDist(x, z) < 0.5) return 3;
  return x < -24 ? 0 : x > 20 ? 2 : 1;
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });

const O = OUTPOST;
export const ZONES = {
  // 33.0, the outpost's levels and the tunnels.
  labRoof: Z('labRoof', 'LAB ROOF', 'หลังคาแล็บ', [[O.lab.x0, -O.lab.z, O.lab.x1, O.lab.z]]),
  lab: Z('lab', 'THE LAB', 'ห้องแล็บ', [[O.lab.x0, -O.lab.z, O.lab.x1, O.lab.z]]),
  deck: Z('deck', 'LAB DECK', 'ระเบียงแล็บ', [[O.deck.x0, -O.stair.z1, O.deck.x1, O.stair.z1]]),
  underLab: Z('underLab', 'UNDER THE LAB', 'ใต้ถุนแล็บ', [[O.deck.x0, -O.deck.z, O.deck.x1, O.deck.z]]),
  hub: Z('hub', 'TUNNEL HUB', 'ชุมทางอุโมงค์', [[TUNNEL.hub.x0, TUNNEL.hub.z0, TUNNEL.hub.x1, TUNNEL.hub.z1]]),
  tunnels: Z('tunnels', 'THE TUNNELS', 'อุโมงค์', [[TUNNEL.pit.x0, -TUNNEL.pit.z1 - 1, RAVINE.x0 + 0.5, TUNNEL.pit.z1 + 1]]),
  ridge: Z('ridge', 'THE RIDGE', 'สันเขา', [[-X_OUT, -COURT - 2, -29, COURT + 2]]),
  ravine: Z('ravine', 'THE RAVINE', 'หุบเหว', [[RAVINE.x0, -RAVINE.end, RAVINE.x1, RAVINE.end]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA LZ', 'จุดลงจอดอัลฟา', [[BASE.x0, BASE.z0, BASE.x1, Z_END]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA LZ', 'จุดลงจอดโอเมกา', [[BASE.x0, -Z_END, BASE.x1, -BASE.z0]]),
  alphaCourt: Z('alphaCourt', 'ALPHA APPROACH', 'ทางเข้าอัลฟา', [[-X_OUT, COURT, X_OUT, Z_END]]),
  omegaCourt: Z('omegaCourt', 'OMEGA APPROACH', 'ทางเข้าโอเมกา', [[-X_OUT, -Z_END, X_OUT, -COURT]]),
  outpost: Z('outpost', 'THE OUTPOST', 'ฐานวิจัย', [[-21, -19, 18, 19]]),
  westTrench: Z('westTrench', 'WEST TRENCH', 'สนามเพลาะตะวันตก', [[-24, -COURT, -2, COURT]]),
  eastTrench: Z('eastTrench', 'EAST TRENCH', 'สนามเพลาะตะวันออก', [[-2, -COURT, RAVINE.x0, COURT]]),
  eastBank: Z('eastBank', 'EAST BANK', 'ฝั่งตะวันออก', [[RAVINE.x1, -COURT, X_OUT, COURT]]),
  ridgeFoot: Z('ridgeFoot', 'RIDGE FOOT', 'เชิงสันเขา', [[-29, -COURT, -24, COURT]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > 1.5 && ZONES.ridge.rects.some(inR) && x < -29.5) return ZONES.ridge;
  // 33.0: the outpost's levels top down, then under the ground: the hub, the tunnels.
  if (y > O.roof - 0.8 && ZONES.labRoof.rects.some(inR)) return ZONES.labRoof;
  if (y > O.deck.y - 0.4 && ZONES.lab.rects.some(inR)) return ZONES.lab;
  if (y > O.deck.y - 0.4 && ZONES.deck.rects.some(inR)) return ZONES.deck;
  if (y < -1 && ZONES.hub.rects.some(inR)) return ZONES.hub;
  if (y < -1 && tunnelDist(x, z) < 0.5) return ZONES.tunnels;
  if (y < -0.6 && ZONES.ravine.rects.some(inR)) return ZONES.ravine;
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.underLab, ZONES.outpost, ZONES.ravine, ZONES.ridge, ZONES.eastBank, ZONES.ridgeFoot, ZONES.westTrench, ZONES.eastTrench]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}

/** 19.0: the team size here (self-play: docs/BENCH-19.0.json). */
export const CRASH_TEAM_SIZE = 7;

/**
 * 19.0: the arena AI in the jungle. Long-range play fails here (fog, trunks, undergrowth): fight
 * closer (the range band, rifles moving up beyond 26 m), push sooner and from further, flank more
 * (three on a contact, from 9 m), hunt along the lane only from 16 m, shrug off a little more unseen
 * damage before retreating, and close-range guns hop cover to cover when they push.
 */
export const JUNGLE_AI: ArenaProfile = {
  band: [5, 13],
  ads: { maxRange: 26 },
  pushRange: 30,
  pushHp: 0.55,
  pushDamage: 30,
  flank: { per: 3, min: 9, dist: 8, maxT: 10 },
  laneLeave: 16,
  retreat: { unseenDmg: 0.45 },
  coverPush: { on: true },
  // 33.0: never straight at a goal more than half a metre up (the terraces, the ravine's bank from its
  // floor): the graph knows the stairs and ramps (Old Port's 23.0 rule, tighter: trenches and hummocks).
  directRise: 0.5,
  // 33.0: feel along the tunnels' walls (round their bends on the centre line).
  corridor: { on: true, near: 1.1, gain: 1 },
};

/**
 * 27.0: the spawn pads (TdmData.pads), ALPHA's half mirrored for OMEGA: [x, floor y, z, yaw]. The first
 * is in the old yard (a safe rear pad); the rest cover the contested map, proposed by
 * __dev.spawnPads (farthest-point, then Lloyd relaxation over the nav, sheltered spots first).
 */
export const SPAWN_PADS = mirrorPads([[0, 0, 59, 3.14], [26, -4, 21, 3.14], [-39, 3.6, 15, 0.79], [-38, 0, 46, 1.57], [28.5, -1.89, 45.5, 3.14], [0, 0, 15.6, 0.79], [-18, -1.27, 38, 5.89]]);

/**
 * 31.0: the deployment zones (TdmData.zones): ALPHA's, A to C from its left; OMEGA's by the map's
 * symmetry (mirror). Deep Jungle: three (97 m wide, three lanes).
 */
export const SPAWN_ZONES = {
  symmetry: 'mirror' as const,
  theme: 'jungle' as const,
  half: [
    // Spread over the width under the canopy: the ridge approach (west), the LZ, the ravine (east).
    { id: 'A' as const, x: -30, y: 0.04, z: 36, r: 6, yaw: Math.PI },
    { id: 'B' as const, x: 0, y: 0, z: 59, r: 6, yaw: Math.PI },
    { id: 'C' as const, x: 28.5, y: -4, z: 36, r: 5, yaw: Math.PI },
  ],
};
