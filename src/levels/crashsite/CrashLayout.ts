import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';
import { smoothstep } from '../../core/math';
import { noise } from '../jungle/Terrain';

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
/** The wreck: the dropship's hull across the middle (floor 0.4, roof 3.9) and its wings (ramps to the roof). */
export const WRECK = { x0: -10, x1: 10, z: 2.8, floor: STEP, roof: 3.9, wing: { x0: 2.4, x1: 6.6, z1: 10 }, doors: [-7.8, 7.8], breach: 2 };
/** ALPHA's landing zone (OMEGA's is the mirror): a sandbag yard, two exits. */
export const BASE = { x0: -16, x1: 16, z0: 54, z1: 63 };
/** The approaches (in front of the yards) start here. */
export const COURT = 44;
/** Mud trenches (south half, mirrored): polylines and their profile. */
/** Banks 5.5 m: a smoothstep's steepest point is 1.5× its mean, so 1.4 m over 5.5 m peaks at 21°. */
export const TRENCH = { depth: 1.4, floor: 1.3, bank: 5.5, endFade: 6 };
export const TRENCHES: [number, number][][] = [
  [[-12, 47], [-17, 35], [-11, 23], [-9, 12.5]],
  [[11, 46], [16, 34], [10, 22], [9, 12.5]],
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
  const wreck = smoothstep(14, 20, Math.hypot(x / 1.4, z));
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

/** Lanes, as ALPHA faces north: the ridge (west), the wreck (centre), the ravine (east). */
const LANES_ALPHA: [number, number, number?][][] = [
  [[-18, 57.2], [-26, 52], [-39, 47], [-39, 30, RIDGE.top], [-39, 15, RIDGE.top], [-39, 0, RIDGE.top], [-39, -15, RIDGE.top], [-39, -30, RIDGE.top], [-39, -47], [-26, -52]],
  [[-18, 57.2], [-12, 48], [-12, 44], [-16, 34], [-11, 22], [-3.5, 8.5], [-3.5, 0, WRECK.floor], [-3.5, -8.5], [-11, -22], [-16, -34], [-12, -44], [-12, -48]],
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
export const ZONES = {
  ridge: Z('ridge', 'THE RIDGE', 'สันเขา', [[-X_OUT, -COURT - 2, -29, COURT + 2]]),
  wreckRoof: Z('wreckRoof', 'WRECK ROOF', 'หลังคาซากเครื่อง', [[WRECK.x0 - 1, -WRECK.wing.z1, WRECK.x1 + 1, WRECK.wing.z1]]),
  ravine: Z('ravine', 'THE RAVINE', 'หุบเหว', [[RAVINE.x0, -RAVINE.end, RAVINE.x1, RAVINE.end]]),
  alphaSpawn: Z('alphaSpawn', 'ALPHA LZ', 'จุดลงจอดอัลฟา', [[BASE.x0, BASE.z0, BASE.x1, Z_END]]),
  omegaSpawn: Z('omegaSpawn', 'OMEGA LZ', 'จุดลงจอดโอเมกา', [[BASE.x0, -Z_END, BASE.x1, -BASE.z0]]),
  alphaCourt: Z('alphaCourt', 'ALPHA APPROACH', 'ทางเข้าอัลฟา', [[-X_OUT, COURT, X_OUT, Z_END]]),
  omegaCourt: Z('omegaCourt', 'OMEGA APPROACH', 'ทางเข้าโอเมกา', [[-X_OUT, -Z_END, X_OUT, -COURT]]),
  wreck: Z('wreck', 'THE WRECK', 'ซากเครื่องบิน', [[-15, -11, 15, 11]]),
  westTrench: Z('westTrench', 'WEST TRENCH', 'สนามเพลาะตะวันตก', [[-24, -COURT, -2, COURT]]),
  eastTrench: Z('eastTrench', 'EAST TRENCH', 'สนามเพลาะตะวันออก', [[-2, -COURT, RAVINE.x0, COURT]]),
  eastBank: Z('eastBank', 'EAST BANK', 'ฝั่งตะวันออก', [[RAVINE.x1, -COURT, X_OUT, COURT]]),
  ridgeFoot: Z('ridgeFoot', 'RIDGE FOOT', 'เชิงสันเขา', [[-29, -COURT, -24, COURT]]),
};

export function zoneAt(x: number, y: number, z: number): Zone | null {
  const inR = (r: [number, number, number, number]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  if (y > 1.5 && ZONES.ridge.rects.some(inR) && x < -29.5) return ZONES.ridge;
  if (y > 2.2 && ZONES.wreckRoof.rects.some(inR)) return ZONES.wreckRoof;
  if (y < -0.6 && ZONES.ravine.rects.some(inR)) return ZONES.ravine;
  for (const zone of [ZONES.alphaSpawn, ZONES.omegaSpawn, ZONES.alphaCourt, ZONES.omegaCourt, ZONES.wreck, ZONES.ravine, ZONES.ridge, ZONES.eastBank, ZONES.ridgeFoot, ZONES.westTrench, ZONES.eastTrench]) {
    if (zone.rects.some(inR)) return zone;
  }
  return null;
}
