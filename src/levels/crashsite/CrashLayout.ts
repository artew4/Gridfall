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
 * 19.0: the wreck lies across the temple's upper terrace: its belly from `belly`, its deck (`floor`)
 * level with the terrace, its roof; the wings are ramps from the terrace to the roof; a hole in the
 * deck (`hole`) drops into the undercroft below. Side doors at x ±7.8, the breach x ±2 (full height).
 */
export const WRECK = { x0: -10, x1: 10, z: 2.8, belly: 2.2, floor: 2.8, roof: 6.4, wing: { x0: 2.4, x1: 6.6, z1: 9 }, doors: [-7.8, 7.8], breach: 2, hole: 1.2 };
/**
 * 19.0, the temple (mirrored, ALPHA's half authored): the outer terrace T1 (a band in front of the
 * upper one), the upper terrace T2 (from the hull's side to T1), both cut by the gate (|x| < GATE) at
 * ground level: open between T1's halves, roofed by T2's bridge slab, then under the hull (the
 * undercroft: ground level, ceiling the hull's belly).
 */
export const T1 = { x0: -16, x1: 16, zIn: 9, zOut: 15, y: 1.3 };
export const T2 = { x0: -12, x1: 12, zIn: WRECK.z, zOut: 9, y: WRECK.floor, slab: 0.4 };
export const GATE = 2;
/** The shrine (a ruined prang) west of the wreck, its stairs up both flanks, the fallen lintel to the wreck's roof. */
export const SHRINE = { x0: -20, x1: -13.2, z: 4, top: 7.2, stair: { x0: -20, x1: -17.6, foot: 17 }, lintel: 1.0 };
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
 * Height of the jungle floor. Flat on the yards, the approaches' middle, the wreck's clearing and
 * under the ridge (its blocks stand on y = 0); gentle hummocks elsewhere; the trenches carved with
 * gentle banks; the ravine carved between its rims (the drop lies under the rim rocks).
 */
export function crashHeight(x: number, z: number): number {
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
  // 19.0: flat round the temple and its stairs (they stand on y = 0).
  const wreck = smoothstep(22, 28, Math.hypot(x / 1.3, z));
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
  // 19.0: up the temple's front stair, the terrace stair, through the hull by its side doors, down the far side.
  [[-18, 57.2], [-12, 48], [-12, 44], [-16, 34], [-12, 26], [-9, 20.5], [-9, 14, T1.y], [-9.25, 11.5, (T1.y + T2.y) / 2], [-8.5, 7, T2.y], [-7.8, 4.2, T2.y], [-7.8, 0, WRECK.floor],
    [-7.8, -4.2, T2.y], [-8.5, -7, T2.y], [-9.25, -11.5, (T1.y + T2.y) / 2], [-9, -14, T1.y], [-9, -20.5], [-12, -26], [-16, -34], [-12, -44], [-12, -48]],
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

/** The lanes for the flow reports: the ridge side, the wreck, the ravine side. */
export function laneOf(x: number, _y: number, z: number): 0 | 1 | 2 | null {
  if (Math.abs(z) > BASE.z0 - 2) return null;
  return x < -24 ? 0 : x > 20 ? 2 : 1;
}

const Z = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
const both = (x0: number, z0: number, x1: number, z1: number): [number, number, number, number][] => [[x0, z0, x1, z1], [x0, -z1, x1, -z0]];
export const ZONES = {
  hull: Z('hull', 'THE HULL', 'ในลำเรือ', [[WRECK.x0, -WRECK.z, WRECK.x1, WRECK.z]]),
  undercroft: Z('undercroft', 'UNDERCROFT', 'ใต้ซากเครื่อง', [[WRECK.x0 - 3.2, -WRECK.z, WRECK.x1 + 2, WRECK.z], ...both(-GATE, WRECK.z, GATE, T1.zOut)]),
  terrace: Z('terrace', 'TEMPLE TERRACE', 'ลานวิหาร', [...both(T1.x0, T1.zIn, T1.x1, T1.zOut), ...both(SHRINE.stair.x1, WRECK.z, T2.x0, T1.zIn)]),
  upperTerrace: Z('upperTerrace', 'UPPER TERRACE', 'ลานบน', both(T2.x0, T2.zIn, T2.x1, T2.zOut)),
  shrine: Z('shrine', 'THE SHRINE', 'ปรางค์', [[SHRINE.x0, -SHRINE.z, SHRINE.x1, SHRINE.z]]),
  ridge: Z('ridge', 'THE RIDGE', 'สันเขา', [[-X_OUT, -COURT - 2, -29, COURT + 2]]),
  wreckRoof: Z('wreckRoof', 'WRECK ROOF', 'หลังคาซากเครื่อง', [[WRECK.x0 - 3.2, -WRECK.wing.z1, WRECK.x1 + 1, WRECK.wing.z1]]),
  ravine: Z('ravine', 'THE RAVINE', 'หุบเหว', [[RAVINE.x0, -RAVINE.end, RAVINE.x1, RAVINE.end]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA LZ', 'จุดลงจอดอัลฟา', [[BASE.x0, BASE.z0, BASE.x1, Z_END]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA LZ', 'จุดลงจอดโอเมกา', [[BASE.x0, -Z_END, BASE.x1, -BASE.z0]]),
  alphaCourt: Z('alphaCourt', 'ALPHA APPROACH', 'ทางเข้าอัลฟา', [[-X_OUT, COURT, X_OUT, Z_END]]),
  omegaCourt: Z('omegaCourt', 'OMEGA APPROACH', 'ทางเข้าโอเมกา', [[-X_OUT, -Z_END, X_OUT, -COURT]]),
  wreck: Z('wreck', 'THE TEMPLE', 'วิหาร', [[-21, -T1.zOut - 4, 18, T1.zOut + 4]]),
  westTrench: Z('westTrench', 'WEST TRENCH', 'สนามเพลาะตะวันตก', [[-24, -COURT, -2, COURT]]),
  eastTrench: Z('eastTrench', 'EAST TRENCH', 'สนามเพลาะตะวันออก', [[-2, -COURT, RAVINE.x0, COURT]]),
  eastBank: Z('eastBank', 'EAST BANK', 'ฝั่งตะวันออก', [[RAVINE.x1, -COURT, X_OUT, COURT]]),
  ridgeFoot: Z('ridgeFoot', 'RIDGE FOOT', 'เชิงสันเขา', [[-29, -COURT, -24, COURT]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > 1.5 && ZONES.ridge.rects.some(inR) && x < -29.5) return ZONES.ridge;
  // 19.0: the temple's levels, top down: the shrine, the wreck's roof, the hull, the terraces, the undercroft.
  if (y > SHRINE.top - 0.8 && ZONES.shrine.rects.some(inR)) return ZONES.shrine;
  if (y > WRECK.roof - 0.8 && ZONES.wreckRoof.rects.some(inR)) return ZONES.wreckRoof;
  if (y > WRECK.floor - 0.3 && ZONES.hull.rects.some(inR)) return ZONES.hull;
  if (y > T2.y - 0.4 && ZONES.upperTerrace.rects.some(inR)) return ZONES.upperTerrace;
  if (y > T1.y - 0.4 && y < T2.y - 0.4 && ZONES.terrace.rects.some(inR)) return ZONES.terrace;
  if (y < WRECK.belly && ZONES.undercroft.rects.some(inR)) return ZONES.undercroft;
  if (y < -0.6 && ZONES.ravine.rects.some(inR)) return ZONES.ravine;
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.wreck, ZONES.ravine, ZONES.ridge, ZONES.eastBank, ZONES.ridgeFoot, ZONES.westTrench, ZONES.eastTrench]) {
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
