import * as THREE from 'three';
import type { Terrain } from '../../world/Collision';
import type { Zone } from '../Level';
import type { ArenaProfile } from '../../enemies/arena/ArenaCtx';
import { mulberry32 } from '../../core/math';

/*
  Favelas (40.0): a Team Deathmatch arena on a Rio hillside, sunny and dusty, built for height. Metres,
  y up, north = -z. Mirror-symmetric about z = 0: authored for z ≥ 0 (ALPHA's half), built again
  z → -z; both teams start at the same heights.

  The hill is five terraces across x, each BAND.w wide and BAND.rise higher than the one below:

     x = -50        -30         -10          10          30          50
         │  A RUA   │  band 1   │  band 2   │  band 3   │ O MIRANTE │ cliff
   y =   0          3           6           9           12   (roofs one storey up)
         street     W alley E   W alley E   W alley E   W alley E

  On each terrace an alley runs along z between two rows of one-storey houses (W downhill, E uphill).
  A house is BAND.rise tall, so every roof is level with the terrace above: the roofs of band k and
  the alleys of band k+1 are one walking layer, the alleys of band k a trench in it. You go up by the
  stairs (the escadarias through the rows, outside stairs onto the roofs), across by plank bridges
  over the alleys and gaps through the rows, and down anywhere by dropping off a roof's edge.

  Along z (ALPHA's half; OMEGA's is the mirror):
      0 … 1.5   the central escadaria (both halves: 3 m wide), up the whole hill
    1.5 … 10    segment S0      10 … 14   a little square (both tracks open)
     14 … 30    segment S1      30 … 34   a little square
     34 … 45    segment S2      45 … 48   the side escadaria (the rows' ends)
     48 … 58    the team's terraces (yards: the deployment zones), the boundary at 58

  In each segment an alley keeps to one of two tracks (west or east, 4 m apart) and changes track at
  the squares: no straight line down an alley longer than a segment. Rule kept everywhere: two solids
  a body walks between are touching or ≥ 1.3 m apart.
*/

export const BAND = { n: 5, w: 20, x0: -50, rise: 3 };
/** A terrace's west edge and its floor. */
export const bandX = (k: number) => BAND.x0 + BAND.w * k;
export const bandY = (k: number) => BAND.rise * k;
export const X_E = bandX(BAND.n);
export const Z_END = 58;
/** The rows end here; the side escadaria (3 m) to the yards, from YARD the team's terraces. */
export const ROW_END = 45;
export const YARD = 48;
export const ALLEY_W = 4;
/** Band 0: the street (x0 … x1), the row of houses up against band 1. */
export const STREET = { x0: -50, x1: -36 };
/** The central escadaria's half width; the squares; the segments (south half). */
export const CORE = 1.5;
export const SQUARES: [number, number][] = [
  [10, 14],
  [30, 34],
];
export const SEGMENTS: [number, number][] = [
  [CORE, 10],
  [14, 30],
  [34, ROW_END],
];
/** Through the W rows (band ≥ 1) at ground: from an alley onto the roofs below it. */
export const CROSS_GAP: [number, number] = [19, 21];
/**
 * Plank bridges over the alleys, roof W to roof E (band ≥ 1): one on each side of the cross gap (it
 * splits the W roof in two: the piece nearer the middle had no way up, only drops off it).
 */
export const BRIDGES: [number, number][] = [
  [15.5, 17.5],
  [22, 24],
];
/**
 * Outside stairs onto the roofs, up a row's alley face: E rising +z, W rising −z; the sloped part, then
 * a flat landing (LANDING m) at the top, where you step across onto the roof (stepping off the roof onto
 * the slope part way down, a body overlapped the house: a parapet runs the slope's length instead).
 * The W stairs' landings meet the near bridge's end.
 */
export const STAIR_E: [number, number] = [35, 39.8];
export const STAIR_W: [number, number] = [25.2, 30.5];
export const LANDING = 1.2;
export const STAIR_W_WIDTH = 1.4;
/** A storey more on part of a roof (breaks the roofs' long lines): W rows, E rows (z ranges). */
export const TOWER_W: [number, number] = [CORE, 6.5];
export const TOWER_E: [number, number] = [25.5, 29.5];
export const TOWER_H = 2.8;

export type Track = 'west' | 'east';
/** The alley's track in band k's segment s (0, 1, 2). */
export const trackOf = (k: number, s: number): Track => ((k + s) % 2 === 0 ? 'west' : 'east');
/** How far the W row reaches into the band on a track (the alley starts there). */
export const rowW = (t: Track) => (t === 'west' ? 6 : 10);

/** The alley's x range in band k at |z| (a square: both tracks), or null where there is none (the yards). */
export function alleyAt(k: number, z: number): [number, number] | null {
  const az = Math.abs(z);
  if (k === 0) return [STREET.x0, STREET.x1];
  const X = bandX(k);
  if (az >= YARD) return null;
  if (az >= ROW_END) return [X, X + BAND.w];
  // The central escadaria: the W row's gap and the alley beside it (the stair east of it isn't alley).
  if (az < CORE) return [X, X + rowW(trackOf(k, 0)) + ALLEY_W];
  if (SQUARES.some(([a, b]) => az >= a && az < b)) return [X + 6, X + 14];
  const s = SEGMENTS.findIndex(([a, b]) => az >= a && az < b);
  const a = rowW(trackOf(k, s));
  return [X + a, X + a + ALLEY_W];
}

export interface HouseBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Floor and roof. */
  y0: number;
  y1: number;
  band: number;
  row: 'W' | 'E';
  /** Paint (0 … PASTELS.length-1) or bare brick. */
  tone: number;
  brick: boolean;
}

/** Faded pastels (sRGB). */
export const PASTELS = ['#e8b4b0', '#f1d48a', '#a9cbe0', '#b6dcc0', '#f0c6a0', '#d7c2e4', '#f4e7c8', '#9fd1cf', '#ecb98f', '#c9dca0'];

export interface StairPlan {
  /** Footprint, the axis it climbs along, which way, its foot and top. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  axis: 'x' | 'z';
  rise: 1 | -1;
  base: number;
  top: number;
  kind: 'escadaria' | 'roof';
  /** A roof stair: the side its house (the roof it climbs to) is on, and its landing (z range). */
  house?: 'east' | 'west';
  landing?: [number, number];
}

export interface Plan {
  houses: HouseBox[];
  towers: HouseBox[];
  stairs: StairPlan[];
  /** Plank bridges: x range, z range, top. */
  bridges: { x0: number; x1: number; z0: number; z1: number; y: number }[];
  /** Water tanks on roofs: x, y (the roof), z. */
  tanks: [number, number, number][];
  /** Street furniture: cars, the kombi, stalls (x range, z range, height, kind). */
  props: { x0: number; x1: number; z0: number; z1: number; h: number; kind: 'car' | 'van' | 'stall' | 'crate' }[];
}

/** Split [a, b] into houses 3.5–6.5 m long (the last takes the rest); deterministic per key. */
function splitRow(a: number, b: number, key: number) {
  const rnd = mulberry32(9100 + key);
  const out: [number, number][] = [];
  let z = a;
  while (b - z > 7.5) {
    const L = 3.5 + rnd() * 3;
    out.push([z, z + L]);
    z += L;
  }
  if (b - z > 0.01) out.push([z, b]);
  return out;
}

/** Removes the z ranges `gaps` from [a, b]. */
function minus(a: number, b: number, gaps: [number, number][]) {
  let parts: [number, number][] = [[a, b]];
  for (const [g0, g1] of gaps) parts = parts.flatMap(([p0, p1]): [number, number][] => (g1 <= p0 || g0 >= p1 ? [[p0, p1]] : [[p0, g0], [g1, p1]].filter(([q0, q1]) => q1 - q0 > 0.01) as [number, number][]));
  return parts;
}

/**
 * The whole plan, both halves: every house, tower, stair, bridge, tank and prop, mirrored. Pure (the
 * builder draws and collides it; the nav, the lanes and the tests read it).
 */
export function favelaPlan(): Plan {
  const plan: Plan = { houses: [], towers: [], stairs: [], bridges: [], tanks: [], props: [] };
  // (A stair climbing along z climbs the other way in the mirror: a north stair kept its south rise.)
  const mirror = <T extends { z0: number; z1: number; axis?: 'x' | 'z'; rise?: 1 | -1; landing?: [number, number] }>(o: T): T => ({
    ...o,
    z0: -o.z1,
    z1: -o.z0,
    ...(o.axis === 'z' ? { rise: -o.rise! as 1 | -1 } : {}),
    ...(o.landing ? { landing: [-o.landing[1], -o.landing[0]] as [number, number] } : {}),
  });
  const both = <T extends { z0: number; z1: number }>(list: T[], o: T) => list.push(o, mirror(o));
  let key = 0;
  for (let k = 0; k < BAND.n; k++) {
    const X = bandX(k), y0 = bandY(k), y1 = bandY(k + 1);
    // The row spans per z range: segments and squares, each with its W and E x ranges.
    const spans: { z0: number; z1: number; w: [number, number] | null; e: [number, number] }[] = [];
    if (k === 0) spans.push({ z0: CORE, z1: ROW_END, w: null, e: [STREET.x1, bandX(1)] });
    else {
      SEGMENTS.forEach(([a, b], s) => {
        const w = rowW(trackOf(k, s));
        spans.push({ z0: a, z1: b, w: [X, X + w], e: [X + w + ALLEY_W, X + BAND.w] });
      });
      for (const [a, b] of SQUARES) spans.push({ z0: a, z1: b, w: [X, X + 6], e: [X + 14, X + BAND.w] });
    }
    // Where the rows open: the escadarias (the spans start past the central one and end before the
    // side ones), the cross gap through the W rows; band 4's E row runs through z = 0 (nothing above
    // it to climb to).
    const eGaps: [number, number][] = [];
    const wGaps: [number, number][] = [CROSS_GAP];
    for (const sp of spans) {
      const zStart = k === BAND.n - 1 && sp.z0 === CORE ? 0 : sp.z0;
      for (const [row, xr, gaps] of [['W', sp.w, wGaps], ['E', sp.e, eGaps]] as const) {
        if (!xr) continue;
        const z0 = row === 'E' && k === BAND.n - 1 ? zStart : sp.z0;
        for (const [a, b] of minus(z0, sp.z1, gaps)) {
          for (const [h0, h1] of splitRow(a, b, key++)) {
            const rnd = mulberry32(4400 + key * 7);
            both(plan.houses, { x0: xr[0], x1: xr[1], z0: h0, z1: h1, y0, y1, band: k, row, tone: Math.floor(rnd() * PASTELS.length), brick: rnd() < 0.28 });
          }
        }
      }
    }
    // The escadarias up through the E row (not from the top band): central (straddling z = 0, built
    // once) and the side ones at the rows' ends (mirrored); x from the E row's alley face (the
    // S0 track at the centre, the yard's x at the side) to the band's east edge.
    if (k < BAND.n - 1) {
      const ex = k === 0 ? STREET.x1 : X + rowW(trackOf(k, 0)) + ALLEY_W;
      plan.stairs.push({ x0: ex, z0: -CORE, x1: X + BAND.w, z1: CORE, axis: 'x', rise: 1, base: y0, top: y1, kind: 'escadaria' });
      const sx = k === 0 ? STREET.x1 : X + 14;
      both(plan.stairs, { x0: sx, z0: ROW_END, x1: X + BAND.w, z1: YARD, axis: 'x', rise: 1, base: y0, top: y1, kind: 'escadaria' });
    }
    // Outside stairs onto the roofs, up a row's alley face: E (all bands), W (band ≥ 1).
    {
      const eFace = k === 0 ? STREET.x1 : X + rowW(trackOf(k, 2)) + ALLEY_W;
      both(plan.stairs, { x0: eFace - STAIR_W_WIDTH, z0: STAIR_E[0], x1: eFace, z1: STAIR_E[1], axis: 'z', rise: 1, base: y0, top: y1, kind: 'roof', house: 'east', landing: [STAIR_E[1], STAIR_E[1] + LANDING] });
      if (k > 0) {
        const wFace = X + rowW(trackOf(k, 1));
        both(plan.stairs, { x0: wFace, z0: STAIR_W[0], x1: wFace + STAIR_W_WIDTH, z1: STAIR_W[1], axis: 'z', rise: -1, base: y0, top: y1, kind: 'roof', house: 'west', landing: [STAIR_W[0] - LANDING, STAIR_W[0]] });
      }
    }
    // Bridges over the alley (band ≥ 1): roof W to roof E.
    if (k > 0) {
      const w = rowW(trackOf(k, 1));
      for (const [z0, z1] of BRIDGES) both(plan.bridges, { x0: X + w, x1: X + w + ALLEY_W, z0, z1, y: y1 });
    }
    // Towers: a storey more over the W row's first span (beside the escadaria) and the E row by S1's end.
    const tower = (xr: [number, number], z: [number, number], row: 'W' | 'E') => both(plan.towers, { x0: xr[0], x1: xr[1], z0: z[0], z1: z[1], y0: y1, y1: y1 + TOWER_H, band: k, row, tone: (k * 3 + (row === 'W' ? 1 : 5)) % PASTELS.length, brick: false });
    if (k > 0) tower([X, X + rowW(trackOf(k, 0))], TOWER_W, 'W');
    tower(k === 0 ? [STREET.x1, bandX(1)] : [X + rowW(trackOf(k, 1)) + ALLEY_W, X + BAND.w], TOWER_E, 'E');
    // Water tanks: on roof E in S1 (z 16), on roof W in S2 (z 38), in the middle of the roof.
    {
      const e = k === 0 ? [STREET.x1, bandX(1)] : [X + rowW(trackOf(k, 1)) + ALLEY_W, X + BAND.w];
      for (const s of [1, -1]) plan.tanks.push([(e[0] + e[1]) / 2, y1, 16 * s]);
      if (k > 0) {
        const w = rowW(trackOf(k, 2));
        for (const s of [1, -1]) plan.tanks.push([X + w / 2, y1, 38 * s]);
      }
    }
  }
  // The street: parked cars, the kombi, a market stall; staggered across it (≥ 1.3 m from the kerbs).
  for (const p of [
    { x0: -48.4, x1: -46.6, z0: 6, z1: 10.2, h: 1.45, kind: 'car' as const },
    { x0: -41.2, x1: -39.2, z0: 19, z1: 23.6, h: 2.2, kind: 'van' as const },
    { x0: -47.8, x1: -46, z0: 29, z1: 33.2, h: 1.45, kind: 'car' as const },
    { x0: -41.6, x1: -38.8, z0: 38.5, z1: 41, h: 2.3, kind: 'stall' as const },
  ])
    both(plan.props, p);
  // Crates in the squares (waist high), 1.4 m off the houses (against a wall, a sprint-jump off one
  // ended in the wall: stress).
  for (let k = 1; k < BAND.n; k++) {
    const X = bandX(k);
    both(plan.props, { x0: X + 7.4, x1: X + 8.5, z0: SQUARES[0][0] + 1.4, z1: SQUARES[0][0] + 2.5, h: 1.0, kind: 'crate' });
    // (The second across the square from the W roof stair's foot, which is on the S1 track's side:
    // beside it, 1 m off the foot.)
    const cx = trackOf(k, 1) === 'west' ? X + 11.5 : X + 7.4;
    both(plan.props, { x0: cx, x1: cx + 1.1, z0: SQUARES[1][1] - 2.5, z1: SQUARES[1][1] - 1.4, h: 1.0, kind: 'crate' });
  }
  return plan;
}

/** The ground is flat at 0 (band 0, the street); the terraces above are solid fill (Favela.ts). */
export const FAVELA_TERRAIN: Terrain = { height: () => 0, maxHeight: 0, surface: 'concrete' };

/** Which terrace x is on (0 … 4). */
export const bandOf = (x: number) => Math.max(0, Math.min(BAND.n - 1, Math.floor((x - BAND.x0) / BAND.w)));

export function inBase(p: { x: number; z: number }, team: 'alpha' | 'omega') {
  const z = team === 'alpha' ? p.z : -p.z;
  return z > YARD && z < Z_END && p.x > BAND.x0 && p.x < X_E;
}

/** Eight spawn points across a team's terraces (the 'bases' A/B mode). */
export function spawnsOf(team: 'alpha' | 'omega') {
  const s = team === 'alpha' ? 1 : -1;
  const out: THREE.Vector3[] = [];
  for (let k = 0; k < BAND.n; k++) for (const z of k % 2 ? [53.5] : [51.5, 55.5]) if (out.length < 8) out.push(new THREE.Vector3(bandX(k) + 6, bandY(k), z * s));
  return out;
}

/**
 * The lanes (ALPHA's, as ALPHA faces north: band 0 on its left), one per terrace: up the alley from
 * the team's yard, through the squares, past the central escadaria, to the far end. OMEGA's are the
 * mirror, listed from its own left (band 4).
 */
function laneAlpha(k: number): THREE.Vector3[] {
  const y = bandY(k), X = bandX(k);
  const mid = (z: number) => {
    const a = alleyAt(k, z)!;
    return (a[0] + a[1]) / 2;
  };
  if (k === 0) return [52, 40, 28, 16, 4, -4, -16, -28, -40, -52].map((z) => new THREE.Vector3(-43, y, z));
  const zs = [42, 37, 32, 26, 18, 12, 6, 0, -6, -12, -18, -26, -32, -37, -42];
  return [new THREE.Vector3(X + 10, y, 52), ...zs.map((z) => new THREE.Vector3(mid(z), y, z)), new THREE.Vector3(X + 10, y, -52)];
}
export function lanesOf(team: 'alpha' | 'omega'): THREE.Vector3[][] {
  const L = Array.from({ length: BAND.n }, (_, k) => laneAlpha(k));
  if (team === 'alpha') return L;
  return L.reverse().map((l) => l.map((p) => new THREE.Vector3(p.x, p.y, -p.z)));
}

/** The lanes for the reports: low (the street and band 1), middle (band 2), high (bands 3–4). */
export function laneOf(x: number, _y: number, z: number): 0 | 1 | 2 | null {
  if (Math.abs(z) > YARD) return null;
  const k = bandOf(x);
  return k <= 1 ? 0 : k === 2 ? 1 : 2;
}

const Zn = (id: string, name: string, jp: string, rects: [number, number, number, number][]): Zone => ({ id, name, jp, rects });
const bandRect = (k: number, z0 = -YARD, z1 = YARD): [number, number, number, number] => [bandX(k), z0, bandX(k + 1), z1];
export const ZONES = {
  rua: Zn('rua', 'A RUA', 'A RUA DE BAIXO', [bandRect(0)]),
  beco1: Zn('beco1', 'BECO DAS LAVADEIRAS', 'BECO DAS LAVADEIRAS', [bandRect(1)]),
  beco2: Zn('beco2', 'BECO DO MEIO', 'BECO DO MEIO', [bandRect(2)]),
  beco3: Zn('beco3', 'BECO DAS PIPAS', 'BECO DAS PIPAS', [bandRect(3)]),
  mirante: Zn('mirante', 'O MIRANTE', 'O MIRANTE', [bandRect(4)]),
  lajes: Zn('lajes', 'THE ROOFTOPS', 'AS LAJES', [[BAND.x0, -YARD, X_E, YARD]]),
  escadaria: Zn('escadaria', 'THE ESCADARIA', 'A ESCADARIA', [[BAND.x0, -CORE, X_E, CORE]]),
  pracinha: Zn('pracinha', 'THE LITTLE SQUARES', 'AS PRACINHAS', SQUARES.flatMap(([a, b]): [number, number, number, number][] => [[bandX(1), a, X_E, b], [bandX(1), -b, X_E, -a]])),
  alphaYard: Zn('alphaYard', 'ALPHA TERRACES', 'BASE ALFA', [[BAND.x0, YARD, X_E, Z_END]]),
  omegaYard: Zn('omegaYard', 'OMEGA TERRACES', 'BASE ÔMEGA', [[BAND.x0, -Z_END, X_E, -YARD]]),
};
const BECOS = [ZONES.rua, ZONES.beco1, ZONES.beco2, ZONES.beco3, ZONES.mirante];

/** A place's zone: the yards, the escadaria, the squares, a roof (over its band's floor), the band's alley. */
export function zoneAt(x: number, y: number, z: number): Zone | null {
  if (x < BAND.x0 - 1 || x > X_E + 1 || Math.abs(z) > Z_END + 1) return null;
  if (z >= YARD) return ZONES.alphaYard;
  if (z <= -YARD) return ZONES.omegaYard;
  if (Math.abs(z) < CORE) return ZONES.escadaria;
  const k = bandOf(x);
  if (y > bandY(k) + 1.5) return ZONES.lajes;
  if (k > 0 && ZONES.pracinha.rects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return ZONES.pracinha;
  return BECOS[k];
}

/**
 * The deployment zones (TdmData.zones): ALPHA's, A to C from its left; OMEGA's the mirror. One on the
 * street, one half way up, one on the crest: every team starts low, middle and high, the same.
 */
export const SPAWN_ZONES = {
  symmetry: 'mirror' as const,
  theme: 'desert' as const,
  half: [
    { id: 'A' as const, x: -42, y: 0, z: 52.5, r: 4.5, yaw: Math.PI },
    { id: 'B' as const, x: 0, y: bandY(2), z: 52.5, r: 4.5, yaw: Math.PI },
    { id: 'C' as const, x: 40, y: bandY(4), z: 52.5, r: 4.5, yaw: Math.PI },
  ],
};

/**
 * The AI here: stairs everywhere (never straight up at a goal more than 1 m higher: Old Port's rule),
 * and close quarters (three flankers on a contact, the cover-hop push).
 */
export const FAVELA_AI: ArenaProfile = {
  directRise: 1,
  flank: { per: 3, min: 9 },
  coverPush: { on: true },
};
/**
 * Players a team: self-play 6–12 a side (docs/BENCH-40.0.json): the seconds nobody fired before the
 * endgame fell from 27% at 8v8 to 15% at 10v10, and 12v12 kept 15%: 10 is the knee.
 */
export const FAVELA_TEAM_SIZE = 10;
export const FAVELA_TICKETS = 50;
