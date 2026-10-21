import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glow, Glows } from '../../world/Glows';
import type { BuildCtx, Mats } from '../../world/City';
import { addSign, type SignSpec } from '../../world/Signs';
import { applyWet } from '../../world/Ground';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import type { RainAreas } from '../../world/Rain';
import { chainLinkTexture, concreteTexture as pavedTexture, perforatedTexture } from '../../world/Textures';
import { concreteTexture, steelTexture } from '../jungle/textures';
import { corrugatedTexture, crateTexture } from '../desert/textures';
import { BASE, CONT, DECK, END_Z, MAZE, QUAY_X, WEST_X, WH, lanesOf, mz, spawnsOf, stackColor, zoneAt } from './DocksLayout';
import type { Zone } from '../Level';

/*
  Builds Neon Docks (see DocksLayout.ts for the plan). Rules applied (3.3, docs/LEVELS.md):
   - every box is drawn and collided with the same bounds (StaticBuilder + col.add);
   - stairs are visible steps over a smooth ramp with stepped fill underneath, side plates 1.05 m;
   - boundaries are physical and beat the best jump: a 7 m wall west, 4 m closures, the yards' 3.4 m
     walls, and a 1.6 m chain-link fence at the water (feet + step reach 1.07 m from the floor; the
     only things near it are lower than 1 m or ≥ 6 m away). A drown volume backs it up (DocksLevel);
   - gaps are under 0.3 m or over 1 m;
   - low cover that may be vaulted (jersey barriers, pallets, crates ≤ 1.05 m) is flagged `vault`.
*/

export interface DocksResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; slope: number };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  coverPoints: THREE.Vector3[];
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  rain: RainAreas;
  /** Glows (sign and lamp positions) the wet ground reflects as catchers. */
  catcherPicks: [number, number, number][];
  /** The warehouse interior (rain shelter, viewmodel shade). */
  indoor: { x0: number; z0: number; x1: number; z1: number; y0: number; h: number };
  /** Lane waypoints that were found blocked when built (must be empty). */
  laneProblems: string[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildDocks(scene: THREE.Scene, col: CollisionWorld, glows: Glows, time: { value: number }, fog: THREE.FogExp2): DocksResult {
  const b = new StaticBuilder();
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.8, metal = 0, env = 0.6) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const hdr = (r: number, g: number, bl: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bl) });

  const ground = std(pavedTexture(), 0x8a8e94, 0.7, 0, 1.15);
  applyWet(ground, time, { puddles: true, wet: 0.88 });
  const whFloor = std(concreteTexture('#5d605c', 1), 0xffffff, 0.6, 0, 0.9);
  applyWet(whFloor, time, { puddles: false, wet: 0.3 });
  const steel = (paint: string) => std(steelTexture(paint, 14), 0xffffff, 0.55, 0.35, 0.7);
  const m = {
    blue: steel('#22508f'),
    yellow: steel('#c49416'),
    red: steel('#922a20'),
    rust: steel('#6a4632'),
    green: steel('#2d5a43'),
    wall: std(corrugatedTexture(), 0x8c939b, 0.65, 0.5, 0.6),
    roof: std(steelTexture('#2b3036', 16), 0xffffff, 0.6, 0.5, 0.4),
    concrete: std(concreteTexture('#6c6f6c', 2), 0xffffff, 0.85, 0, 0.6),
    jersey: std(concreteTexture('#9a9a92', 1), 0xffffff, 0.8, 0, 0.6),
    darkMetal: std(null, 0x2a2d31, 0.5, 0.7, 0.7),
    paint: std(null, 0xd0a21c, 0.45, 0.45, 0.7),
    deck: std(perforatedTexture(), 0x9aa0a6, 0.55, 0.6, 0.7),
    crate: std(crateTexture('DOCK 7', '第七埠頭 · CARGO', '#3b4a5a', '#d6d2c4'), 0xffffff, 0.8, 0, 0.5),
    pallet: std(crateTexture('PALLET', '輸出 · EXPORT', '#5a4a36', '#d9cfae'), 0xffffff, 0.85, 0, 0.4),
    fence: new THREE.MeshStandardMaterial({ map: chainLinkTexture(), color: 0xb8c0c8, roughness: 0.5, metalness: 0.6, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    water: std(null, 0x05090f, 0.05, 0.25, 1.4),
    hull: std(steelTexture('#1d2430', 20), 0xffffff, 0.7, 0.4, 0.3),
    amber: hdr(5.5, 3.6, 1.4),
    white: hdr(4.2, 4.5, 5.0),
    warm: hdr(5.5, 4.4, 2.4),
    alphaLamp: hdr(1.6, 3.4, 6.0),
    omegaLamp: hdr(6.0, 1.2, 1.0),
    magenta: hdr(4.5, 0.6, 3.8),
    cyan: hdr(0.5, 3.8, 4.5),
  };
  const stacks = { blue: m.blue, yellow: m.yellow, red: m.red };

  // ---------------------------------------------------------------- helpers
  /** A box that is seen and solid with the same bounds. */
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** The same, in the south half and mirrored (z → -z) in the north half. */
  const solid2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    const a = solid(x0, y0, z0, x1, y1, z1, mat, surface, tile);
    const c = solid(x0, y0, -z1, x1, y1, -z0, mat, surface, tile);
    return [a, c];
  };
  /** Waist-high cover a body can vault (≤ 1.05 m). */
  const vault2 = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
    for (const c of solid2(x0, 0, z0, x1, h, z1, mat, surface, 1)) c.vault = h <= 1.05;
  };
  const cyl = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'metal', seg = 14) => {
    b.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y0 + h / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + h, surface);
  };
  /**
   * A shipping container (or a stack of `n`) centred at (cx, cz), long side along x or z, coloured by
   * where it stands unless a material is given. One box per tier (seen) and one collider per tier.
   */
  const container = (cx: number, cz: number, along: 'x' | 'z', n: 1 | 2, mat?: THREE.Material) => {
    const hx = (along === 'x' ? CONT.L : CONT.W) / 2, hz = (along === 'x' ? CONT.W : CONT.L) / 2;
    const mt = mat ?? stacks[stackColor(cz)];
    for (let i = 0; i < n; i++) solid(cx - hx, i * CONT.H, cz - hz, cx + hx, (i + 1) * CONT.H, cz + hz, mt, 'metal', CONT.H);
  };
  const container2 = (cx: number, cz: number, along: 'x' | 'z', n: 1 | 2, mat?: THREE.Material) => {
    container(cx, cz, along, n, mat);
    container(cx, -cz, along, n, mat);
  };

  /**
   * Stair = visual steps over a smooth ramp, from `base` to `top`, rising towards +axis (rise 1) or
   * -axis (-1); stepped fill underneath (bullets, and nobody walks under or through it); stepped steel
   * side plates 1.05 m above the treads on the `rails` sides ('lo'/'hi': the -/+ side across the run).
   */
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    // 8.1: never into a wall (StairFit): narrowed to the face of a wall intruding into its width;
    // 9.1: and never flush with one (STAIR_GAP clear of any wall beside it).
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const steps = Math.max(2, Math.round(H / 0.25));
    const run = L / steps;
    // 9.1: the treads stop STAIR_GAP short of a side plate. A plate overlapping the steps put its outer
    // face in the plane of every step's side face, facing the same way: they z-fought across the side.
    const w0 = (along ? z0 : x0) + (rails.includes('lo') ? STAIR_GAP : 0);
    const w1 = (along ? z1 : x1) - (rails.includes('hi') ? STAIR_GAP : 0);
    for (let i = 0; i < steps; i++) {
      const hTop = ((i + 1) * H) / steps;
      const a = rise > 0 ? i * run : L - (i + 1) * run;
      const p0 = (along ? x0 : z0) + a;
      if (along) b.add(worldBox(run, hTop, w1 - w0, 1), mat, p0 + run / 2, base + hTop / 2, (w0 + w1) / 2);
      else b.add(worldBox(w1 - w0, hTop, run, 1), mat, (w0 + w1) / 2, base + hTop / 2, p0 + run / 2);
    }
    col.addRamp(x0, z0, x1, z1, axis, rise > 0 ? base : top, rise > 0 ? top : base);
    const seg = 8;
    for (let i = 1; i < seg; i++) {
      const h = (H * i) / seg;
      const a = (L * i) / seg, a2 = (L * (i + 1)) / seg;
      const c = along
        ? col.add(rise > 0 ? x0 + a : x1 - a2, base, z0, (rise > 0 ? x0 + a : x1 - a2) + (a2 - a), base + h, z1, 'concrete')
        : col.add(x0, base, rise > 0 ? z0 + a : z1 - a2, x1, base + h, (rise > 0 ? z0 + a : z1 - a2) + (a2 - a), 'concrete');
      c.floor = false;
    }
    const t = 0.08, n = 6;
    for (const side of rails) {
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n;
        if (H * k1 < 0.5) continue;
        const hi = base + H * k1 + 1.05;
        const lo0 = rise > 0 ? (along ? x0 : z0) + L * k0 : (along ? x1 : z1) - L * k1;
        const lo1 = lo0 + L * (k1 - k0);
        if (along) {
          const f = side === 'lo' ? z0 : z1 - t;
          solid(lo0, base, f, lo1, hi, f + t, m.paint, 'metal', 1);
        } else {
          const f = side === 'lo' ? x0 : x1 - t;
          solid(f, base, lo0, f + t, hi, lo1, m.paint, 'metal', 1);
        }
      }
    }
  };
  /** A stair in the south half and its mirror (a z-axis stair rises the other way up north). */
  const stair2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    stair(x0, z0, x1, z1, axis, rise, base, top, mat, rails);
    stair(x0, -z1, x1, -z0, axis, axis === 'z' ? (-rise as 1 | -1) : rise, base, top, mat, rails);
  };
  /** A handrail plate on a deck (1.05 m, not vaultable: it's a fall). */
  const rail2 = (x0: number, z0: number, x1: number, z1: number, y: number) => solid2(x0, y, z0, x1, y + 1.05, z1, m.paint, 'metal', 1);

  interface Opening { at: number; w: number; y0?: number; y1: number }
  /**
   * A straight wall with openings: along x it spans [a0, a1] in x at z ∈ [c0, c1]; along z, [a0, a1]
   * in z at x ∈ [c0, c1]. Every solid stretch and every piece above or below an opening is one box.
   */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, h: number, mat: THREE.Material, openings: Opening[]) => {
    const piece = (p0: number, p1: number, y0: number, y1: number, mt: THREE.Material) => {
      if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
      if (alongX) solid(p0, y0, c0, p1, y1, c1, mt, 'metal', 3);
      else solid(c0, y0, p0, c1, y1, p1, mt, 'metal', 3);
    };
    let cur = a0;
    for (const o of openings.slice().sort((p, q) => p.at - q.at)) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, 0, h, mat);
      piece(o0, o1, 0, o.y0 ?? 0, mat);
      piece(o0, o1, o.y1, o.y1 + 0.2, m.darkMetal);
      piece(o0, o1, o.y1 + 0.2, h, mat);
      cur = o1;
    }
    piece(cur, a1, 0, h, mat);
  };

  // ---------------------------------------------------------------- ground, water, boundaries
  // The quay apron (outdoors, puddles) in four slabs round the warehouse; the warehouse floor apart.
  const slab = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material) => b.add(worldBox(x1 - x0, 0.2, z1 - z0, 4), mat, (x0 + x1) / 2, -0.1, (z0 + z1) / 2);
  const GX0 = WEST_X - 1, GX1 = QUAY_X + 0.6, GZ = BASE.z1 + 1;
  slab(GX0, -GZ, GX1, WH.z0, ground);
  slab(GX0, WH.z1, GX1, GZ, ground);
  slab(GX0, WH.z0, WH.x0, WH.z1, ground);
  slab(WH.x1, WH.z0, GX1, WH.z1, ground);
  slab(WH.x0, WH.z0, WH.x1, WH.z1, whFloor);
  // Quay edge face down to the water, and the harbour itself (black, glossy, never reached).
  solid(GX1, -1.8, -END_Z - 0.6, GX1 + 0.5, 0, END_Z + 0.6, m.concrete, 'concrete', 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), m.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(GX1 + 200, -1.3, 0);
  scene.add(water);
  // Water barrier: a 1.6 m chain-link fence (you see and shoot through it, you can't climb it).
  const fence = solid(QUAY_X - 0.1, 0, -END_Z, QUAY_X + 0.1, 1.6, END_Z, m.fence, 'metal', 1.6);
  fence.ray = false;
  for (let z = -END_Z; z <= END_Z + 0.01; z += 6) b.add(new THREE.BoxGeometry(0.1, 1.6, 0.1), m.darkMetal, QUAY_X, 0.8, z);
  b.add(new THREE.BoxGeometry(0.08, 0.08, 2 * END_Z), m.darkMetal, QUAY_X, 1.55, 0);
  // West: the back of the next warehouse row (7 m); the forecourts' closures (4 m) either side of the yards.
  solid(WEST_X - 1, 0, -END_Z - 0.6, WEST_X, 7, END_Z + 0.6, m.wall, 'metal', 3);
  for (const s of [1, -1]) {
    const z0 = s > 0 ? END_Z : -END_Z - 0.6, z1 = z0 + 0.6;
    solid(WEST_X, 0, z0, BASE.x0, 4, z1, m.concrete, 'concrete', 2);
    solid(BASE.x1, 0, z0, QUAY_X - 0.1, 4, z1, m.concrete, 'concrete', 2);
  }

  // ---------------------------------------------------------------- spawn yards (south, mirrored)
  const BW = 3.4;
  const exits = [-15, 0, 15];
  for (const flip of [false, true]) {
    const Z = (z: number) => mz(z, flip);
    const zr = (a: number, c: number): [number, number] => (flip ? [-c, -a] : [a, c]);
    // North wall with three exits, back wall, side walls down to the closures.
    let cur = BASE.x0;
    for (const x of exits) {
      const [z0, z1] = zr(BASE.z0, BASE.z0 + 0.6);
      solid(cur, 0, z0, x - 2, BW, z1, m.concrete, 'concrete', 2);
      cur = x + 2;
    }
    {
      const [z0, z1] = zr(BASE.z0, BASE.z0 + 0.6);
      solid(cur, 0, z0, BASE.x1, BW, z1, m.concrete, 'concrete', 2);
      const [b0, b1] = zr(BASE.z1 - 0.6, BASE.z1);
      solid(BASE.x0, 0, b0, BASE.x1, BW, b1, m.concrete, 'concrete', 2);
      const [s0, s1] = zr(END_Z, BASE.z1 - 0.6);
      solid(BASE.x0, 0, s0, BASE.x0 + 0.6, BW, s1, m.concrete, 'concrete', 2);
      solid(BASE.x1 - 0.6, 0, s0, BASE.x1, BW, s1, m.concrete, 'concrete', 2);
      // Blast walls in front of each exit: no line of fire into the yard.
      for (const x of exits) {
        const [w0, w1] = zr(55, 55.6);
        solid(x - 3.5, 0, w0, x + 3.5, 2.6, w1, m.jersey, 'concrete', 1);
      }
    }
    // Yard props: a generator and crates against the side walls (cover from the exits, not traps).
    const [g0, g1] = zr(70, 72.4);
    solid(BASE.x0 + 0.6, 0, g0, BASE.x0 + 2.4, 1.9, g1, m.darkMetal, 'metal', 1);
    solid(BASE.x1 - 2.4, 0, g0, BASE.x1 - 0.6, 1.9, g1, m.darkMetal, 'metal', 1);
    // A mast against the back wall: team light.
    mast(0, Z(BASE.z1 - 0.8), 9, flip ? m.omegaLamp : m.alphaLamp, flip ? 0xff3a30 : 0x58a8ff, 220, 30);
  }

  // ---------------------------------------------------------------- lane 1: the container maze
  // An 8 m grid; each cell holds one container, along x (H) or z (V), one or two high. Corridors run
  // on every cell boundary: 1.9 m where two long sides face each other, 3.7 m elsewhere.
  const PATTERN: [('x' | 'z'), 1 | 2][][] = [
    [['z', 1], ['x', 2], ['z', 1], ['x', 1]],
    [['x', 1], ['z', 2], ['x', 1], ['z', 1]],
    [['z', 2], ['x', 1], ['z', 1], ['x', 2]],
    [['x', 1], ['z', 1], ['x', 2], ['z', 1]],
  ];
  MAZE.zs.forEach((cz, j) => MAZE.xs.forEach((cx, i) => container2(cx, cz, PATTERN[j][i][0], PATTERN[j][i][1])));
  // Steel stairs onto two containers (a look over the maze). R1 runs along the east side of cell
  // (2,2), foot open to the z = 24 corridor, top beside the container (step across onto its roof);
  // the corridor keeps 1.3 m beside it. R2 climbs the south side of cell (0,3).
  stair2(-31.78, 17.2, -29.38, 20.7, 'z', -1, 0, CONT.H, m.darkMetal, ['hi']);
  stair2(-50.25, 29.22, -47.75, 32.72, 'z', -1, 0, CONT.H, m.darkMetal, ['lo', 'hi']);
  // Jersey barriers across two corridors (vault them, or go round).
  vault2(-45.95, 11.7, -42.22, 12.3, 0.95, m.jersey);
  vault2(-47.3, 23.06, -46.7, 26.78, 0.95, m.jersey);
  // The divider between the maze and the warehouse alley: double stacks with two gaps per half
  // (z 6–16 at the warehouse's west door, and beyond z 28 into the forecourt).
  for (const cz of [3.03, 18.97, 25.03]) container2(-18.22, cz, 'z', 2);
  // Forecourt side: a double stack and a single, a barrier.
  container2(-44, 46, 'x', 2);
  container2(-24, 44, 'z', 1);
  vault2(-40, 52, -36, 52.6, 0.95, m.jersey);

  // ---------------------------------------------------------------- lane 2: the warehouse
  const T = 0.4;
  for (const flip of [false, true]) {
    const zr = (a: number, c: number): [number, number] => (flip ? [-c, -a] : [a, c]);
    const [e0, e1] = zr(WH.z1 - T, WH.z1);
    wall(true, WH.x0, WH.x1, e0, e1, WH.h, m.wall, [{ at: 0, w: 8, y1: 6 }, { at: -12, w: 1.6, y1: 2.3 }, { at: 12, w: 1.6, y1: 2.3 }]);
  }
  const sideOpen = (zs: number[], w: number, y0: number, y1: number): Opening[] => zs.flatMap((z) => [{ at: z, w, y0, y1 }, { at: -z, w, y0, y1 }]);
  wall(false, WH.z0 + T, WH.z1 - T, WH.x0, WH.x0 + T, WH.h, m.wall, sideOpen([12], 3, 0, 2.6));
  wall(false, WH.z0 + T, WH.z1 - T, WH.x1 - T, WH.x1, WH.h, m.wall, [...sideOpen([6.5], 3, 0, 2.6), ...sideOpen([20.3], 2.4, DECK, 6.8)]);
  solid(WH.x0, WH.h, WH.z0, WH.x1, WH.h + 0.4, WH.z1, m.roof, 'metal', 4);
  // Catwalks along both long walls, landings at the ends, a bridge across the middle.
  const DT = DECK - 0.25;
  for (const sx of [-1, 1]) {
    const X = (a: number, c: number): [number, number] => (sx < 0 ? [a, c] : [-c, -a]);
    const [cx0, cx1] = X(-13.6, -10.6);
    solid(cx0, DT, -24, cx1, DECK, 24, m.deck, 'metal', 1);
    const [lx0, lx1] = X(-13.6, -8.2);
    solid2(lx0, DT, 24, lx1, DECK, WH.z1 - T, m.deck, 'metal', 1);
    // Inner handrail, broken where the bridge joins and where the stair's mid landing joins.
    const [rx0, rx1] = X(-10.68, -10.6);
    rail2(rx0, 1.5, rx1, 11.2, DECK);
    rail2(rx0, 13.6, rx1, 24, DECK);
    const [ox0, ox1] = X(-8.28, -8.2);
    rail2(ox0, 24, ox1, WH.z1 - T, DECK);
    // Columns under the catwalk edge (before the stair: it fits itself STAIR_GAP clear of them, 9.1).
    const [kx0, kx1] = X(-10.9, -10.6);
    for (const z of [6, 18]) solid2(kx0, 0, z - 0.15, kx1, DT, z + 0.15, m.darkMetal, 'metal', 1);
    // Stairs from just inside the end doors up towards the middle, onto a small landing that joins
    // the catwalk sideways: walking in at a main door leads straight up (8.0: with the stairs rising
    // the other way, bots heading for the catwalk crossed half the floor first and never got there).
    // Both sides plated: the floor runs along both, and an unplated side let a jump land inside the
    // stepped fill (stress test).
    const [sx0, sx1] = X(-10.6, -8.2);
    stair2(sx0, 13.6, sx1, 24, 'z', -1, 0, DECK, m.darkMetal, ['lo', 'hi']);
    solid2(sx0, DT, 11.2, sx1, DECK, 13.6, m.deck, 'metal', 1);
    const [px0, px1] = X(-8.28, -8.2);
    rail2(px0, 11.2, px1, 13.6, DECK);
    rail2(sx0, 11.2, sx1, 11.28, DECK);
  }
  solid(-10.6, DT, -1.5, 10.6, DECK, 1.5, m.deck, 'metal', 1);
  solid(-10.6, DECK, -1.5, 10.6, DECK + 1.05, -1.42, m.paint, 'metal', 1);
  solid(-10.6, DECK, 1.42, 10.6, DECK + 1.05, 1.5, m.paint, 'metal', 1);
  for (const x of [-5, 5]) solid(x - 0.15, 0, -0.15, x + 0.15, DT, 0.15, m.darkMetal, 'metal', 1);
  // Floor cover: crate stacks, a container, a jersey line, pallets (south half, mirrored).
  solid2(-6, 0, 14, -3, 2.4, 16.4, m.crate, 'wood', 1.2);
  solid2(3, 0, 7, 6, 2.4, 9.4, m.crate, 'wood', 1.2);
  container2(5, 17, 'x', 1, m.yellow);
  vault2(-8, 5, -4, 5.6, 0.95, m.jersey);
  vault2(-2, 20, 2, 21.2, 1.0, m.pallet, 'wood');
  // Under the bridge: a crate stack (2.4 m) that breaks the floor-level line through both main doors
  // (eye height). Without it the forecourts saw each other down the whole warehouse and the fights
  // stayed on the floor; from the catwalks and the bridge you still see over it (8.0 bot matches).
  solid(-2.2, 0, -1.2, 2.2, 2.4, 1.2, m.crate, 'wood', 1.2);
  // Exterior stair on the quay side up to the catwalk door (lanes 2–3, and a way up from the water).
  stair2(14.2, 10.9, 16.6, 19.0, 'z', 1, 0, DECK, m.darkMetal, ['hi']);
  solid2(14.0, 0, 19.0, 16.6, DECK, 21.6, m.concrete, 'concrete', 1.5);
  rail2(16.52, 19.0, 16.6, 21.6, DECK);
  rail2(14.0, 21.52, 16.52, 21.6, DECK);
  // Forecourt (centre): a truck with a container on its trailer, a forklift, pallets, a barrier.
  solid2(-9.22, 0, 36, -6.78, 1.3, 48.2, m.darkMetal, 'metal', 1);
  solid2(-9.22, 1.3, 36, -6.78, 3.9, 48.2, m.rust, 'metal', CONT.H);
  solid2(-9.4, 0, 48.2, -6.6, 3.2, 51, m.blue, 'metal', 1.6);
  solid2(8, 0, 48, 10, 2.2, 51, m.paint, 'metal', 1);
  vault2(3, 44, 6, 45.2, 1.0, m.pallet, 'wood');
  vault2(5, 34, 10, 34.6, 0.95, m.jersey);

  // ---------------------------------------------------------------- lane 3: the quay
  // A raised loading platform with steps (a low perch over the long lane).
  solid2(28, 0, 40, 40, 1.2, 48, m.concrete, 'concrete', 2);
  stair2(32, 48, 35, 51.6, 'z', -1, 0, 1.2, m.concrete, ['lo', 'hi']);
  vault2(24, 32, 29, 32.6, 0.95, m.jersey);
  vault2(26, 14, 31, 14.6, 0.95, m.jersey);
  container2(35, 24, 'z', 1, m.green);
  for (const s of [1, -1]) cyl(28, 26 * s, 0.9, 0, 1.6, m.rust, 'wood');
  vault2(38, 8, 40, 10, 1.0, m.crate, 'wood');
  // The gantry crane straddling the quay at mid-field: four legs, sill beams, girders over the water,
  // a cab, and a container hanging from the spreader. All of it collides (none of it can be reached).
  const CY = 22;
  for (const x of [23, 42]) for (const z of [-6, 6]) solid(x - 0.6, 0, z - 0.6, x + 0.6, CY, z + 0.6, m.paint, 'metal', 2);
  for (const x of [23, 42]) solid(x - 0.6, CY - 2, -6.6, x + 0.6, CY, 6.6, m.paint, 'metal', 2);
  for (const z of [-6, 6]) solid(18, CY, z - 0.6, 74, CY + 2, z + 0.6, m.paint, 'metal', 2);
  solid(30, CY - 3.4, -1.6, 33.4, CY, 1.6, m.darkMetal, 'metal', 1);
  solid(32, 9, -CONT.W / 2, 32 + CONT.L, 9 + CONT.H, CONT.W / 2, m.red, 'metal', CONT.H);
  for (const [x, z] of [[33, -1], [33, 1], [37, -1], [37, 1]]) b.add(new THREE.BoxGeometry(0.05, CY - 11.6, 0.05), m.darkMetal, x, (11.6 + CY) / 2, z);
  // The container ship across the water (silhouette, deck stacks, lights): scenery only.
  b.add(worldBox(20, 12, 190, 4), m.hull, 92, 3, 0);
  for (let z = -84; z <= 84; z += 7) {
    const k = Math.abs(Math.sin(z * 0.37));
    b.add(worldBox(14, 2.6 * (1 + Math.round(k * 3)), 6, 2.6), [m.blue, m.red, m.yellow, m.rust, m.green][Math.abs(Math.round(z / 7)) % 5], 92, 9 + 1.3 * (1 + Math.round(k * 3)), z);
  }
  b.add(worldBox(10, 16, 10, 4), m.hull, 92, 17, 74);

  // ---------------------------------------------------------------- light: masts, lamps, neon
  /** A floodlight mast: pole, head (HDR emissive), a real light and a glow (halo, rain, wet reflection). */
  function mast(x: number, z: number, h: number, head: THREE.MeshBasicMaterial, color: number, intensity: number, dist: number) {
    cyl(x, z, 0.18, 0, h, m.darkMetal, 'metal', 10);
    b.add(new THREE.BoxGeometry(1.4, 0.35, 0.7), m.darkMetal, x, h + 0.2, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.55), head);
    lamp.position.set(x, h, z);
    scene.add(lamp);
    const pos = v(x, h - 0.3, z);
    const light = new THREE.PointLight(color, intensity, dist, 2);
    light.position.copy(pos);
    scene.add(light);
    const g = glows.add({ pos, color: new THREE.Color(color), radius: 14, base: 1.1, light, lightBase: intensity, haloSize: 4.5, haloStrength: 0.4, reflect: { width: 2.2, anchor: v(x, 0, z), length: 12, map: null } });
    g.materials.push({ mat: head, base: head.color.clone() });
    return g;
  }
  const lamps: Glow[] = [];
  // Quay: amber sodium floods; maze: cold white LED floods against the west wall.
  // 8.1, "too dark for competitive play": warm light over every lane, measured as illuminance at
  // chest height on the floor nav nodes of each zone (I / d², the shader's own falloff) — mean and
  // the darkest 10%. The sky, the water and the distance stay dark: lights only where people fight.
  // (Intensities in candela with physical decay: a head 11–13 m up needs ~600 to light the ground.)
  for (const z of [18, 46]) for (const s of [1, -1]) lamps.push(mast(44, z * s, 13, m.amber, 0xffa040, 650, 48));
  // West wall floods: warm white now (8.0: cold LED), stronger.
  for (const z of [24, 48]) for (const s of [1, -1]) lamps.push(mast(WEST_X + 0.2, z * s, 11, m.warm, 0xffd9a0, 520, 44));
  // Quay, warehouse side: two more sodium masts (the quay's middle was lit only from the water's edge).
  for (const s of [1, -1]) mast(18.5, 32 * s, 12, m.amber, 0xffa040, 560, 44);
  // Forecourts: one mast each (8.0: unlit, the darkest 10% at zero).
  for (const s of [1, -1]) mast(-3, 46 * s, 12, m.warm, 0xffc880, 600, 44);
  // Work lights strung over the maze's crossings, warm (the stacks' colours are the callouts).
  const work = (x: number, z: number) => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), m.warm);
    head.position.set(x, 7, z);
    scene.add(head);
    b.add(new THREE.BoxGeometry(0.03, 3, 0.03), m.darkMetal, x, 8.5, z);
    const light = new THREE.PointLight(0xffd090, 200, 26, 2);
    light.position.set(x, 6.8, z);
    scene.add(light);
    const g = glows.add({ pos: v(x, 6.8, z), color: new THREE.Color(1, 0.8, 0.5), radius: 10, base: 1, light, lightBase: 200, haloSize: 2.6, haloStrength: 0.35, mode: 'steady', reflect: { width: 1.4, anchor: v(x, 0, z), length: 6, map: null } });
    g.materials.push({ mat: m.warm, base: m.warm.color.clone() });
  };
  work(-37, 0);
  for (const s of [1, -1]) {
    work(-45, 14 * s);
    work(-29, 14 * s);
    work(-37, 30 * s);
  }
  // Under the crane's hanging container: a work light over the quay's middle.
  {
    const light = new THREE.PointLight(0xffc070, 320, 30, 2);
    light.position.set(35, 8.5, 0);
    scene.add(light);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.6), m.warm);
    head.position.set(35, 8.9, 0);
    scene.add(head);
    const g = glows.add({ pos: v(35, 8.5, 0), color: new THREE.Color(1, 0.75, 0.42), radius: 12, base: 1, light, lightBase: 320, haloSize: 3, haloStrength: 0.35, reflect: { width: 2, anchor: v(35, 0, 0), length: 8, map: null } });
    g.materials.push({ mat: m.warm, base: m.warm.color.clone() });
  }
  // Warehouse: sodium lamps hung from the roof trusses (two real lights, the rest glow only).
  const hang = (x: number, z: number, real: boolean) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.35, 12), m.amber);
    lamp.position.set(x, 8.6, z);
    scene.add(lamp);
    let light: THREE.PointLight | undefined;
    if (real) {
      light = new THREE.PointLight(0xffb060, 150, 28, 2);
      light.position.set(x, 8.2, z);
      scene.add(light);
    }
    b.add(new THREE.BoxGeometry(0.04, WH.h - 8.8, 0.04), m.darkMetal, x, (WH.h + 8.8) / 2, z);
    const g = glows.add({ pos: v(x, 8.3, z), color: new THREE.Color(1, 0.62, 0.3), radius: 9, base: 1, light, lightBase: real ? 150 : 0, haloSize: 2.4, haloStrength: 0.3, mode: real ? 'steady' : 'flicker' });
    g.materials.push({ mat: m.amber, base: m.amber.color.clone() });
  };
  // Four real lamps on the floor fight (8.0: two), the rest glow only.
  for (const z of [-14, 14]) hang(0, z, true);
  hang(-6, 6, true);
  hang(6, -6, true);
  hang(6, 6, false);
  hang(-6, -6, false);
  for (const z of [-20, 20]) for (const x of [-6, 6]) hang(x, z, false);
  // Neon tubes on the warehouse corners and along the end walls (no lights: halos and the rain).
  const tube = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.MeshBasicMaterial, color: THREE.Color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.08, x1 - x0), Math.max(0.08, y1 - y0), Math.max(0.08, z1 - z0)), mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    glows.add({ pos: mesh.position.clone(), color, radius: 6, base: 0.8, mode: 'buzz', haloSize: 1.6, haloStrength: 0.25 });
  };
  for (const s of [1, -1]) {
    tube(-12, 9.4, s * (WH.z1 + 0.06), 12, 9.48, s * (WH.z1 + 0.14), s > 0 ? m.magenta : m.cyan, s > 0 ? new THREE.Color(1, 0.15, 0.85) : new THREE.Color(0.1, 0.85, 1));
    for (const x of [WH.x0 - 0.1, WH.x1 + 0.1]) tube(x - 0.04, 0.4, s * (WH.z1 + 0.1) - 0.04, x + 0.04, 9.4, s * (WH.z1 + 0.1) + 0.04, s > 0 ? m.magenta : m.cyan, s > 0 ? new THREE.Color(1, 0.15, 0.85) : new THREE.Color(0.1, 0.85, 1));
  }
  // Ship lights (glows only): masthead whites and port reds.
  for (const z of [-80, -40, 0, 40, 80]) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), z % 80 === 0 ? m.white : m.omegaLamp);
    g.position.set(82, 10, z);
    scene.add(g);
  }

  // Neon signs (canvas textures, HDR, wet streaks): the callouts you can see from each lane.
  const ctx: BuildCtx = { scene, builder: b, col, glows, time, mats: { darkMetal: m.darkMetal } as unknown as Mats, fog };
  const signs: SignSpec[] = [
    { text: 'NEON DOCKS', color: '#ff2bd6', style: 'neon', vertical: false, mount: 'wall', face: 's', wall: WH.z1, x: 0, y: 7.6, z: WH.z1 + 0.12, size: 9, floorY: 0, light: 40, lightDist: 18 },
    { text: '第七埠頭', color: '#19e6ff', style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: WH.z0, x: 0, y: 7.6, z: WH.z0 - 0.12, size: 8, floorY: 0, light: 40, lightDist: 18 },
    { text: '港湾', color: '#ffb000', style: 'neon', vertical: true, mount: 'wall', face: 'w', wall: WH.x0, x: WH.x0 - 0.12, y: 6.2, z: 19, size: 4, floorY: 0, mode: 'flicker' },
    { text: '倉庫', color: '#ffb000', style: 'neon', vertical: true, mount: 'wall', face: 'w', wall: WH.x0, x: WH.x0 - 0.12, y: 6.2, z: -19, size: 4, floorY: 0, mode: 'flicker' },
    { text: 'CARGO', color: '#39ff88', style: 'box', vertical: false, mount: 'wall', face: 'e', wall: WH.x1, x: WH.x1 + 0.12, y: 8, z: 0, size: 6, floorY: 0 },
    { text: 'ALPHA', color: '#3aa0ff', style: 'box', vertical: false, mount: 'wall', face: 'n', wall: BASE.z0, x: 0, y: 2.6, z: BASE.z0 - 0.12, size: 3.2, floorY: 0 },
    { text: 'OMEGA', color: '#ff3040', style: 'box', vertical: false, mount: 'wall', face: 's', wall: -BASE.z0, x: 0, y: 2.6, z: -BASE.z0 + 0.12, size: 3.2, floorY: 0 },
  ];
  for (const s of signs) addSign(ctx, s);
  b.build(scene);

  // ---------------------------------------------------------------- navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const open = (x: number, y: number, z: number) => !col.blocked(v(x, y, z), 0.6);
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.2 * 1.2) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  const N2 = (x: number, y: number, z: number) => [N(x, y, z), N(x, y, -z)];
  const chain = (...ids: number[]) => {
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
  };
  // Explicit nodes first (doors, decks, stairs, tops), so the lattice doesn't crowd them out.
  // Warehouse doors (both sides of each), base exits, the maze's corridor crossings.
  for (const [x, z] of [[-15.6, 12], [-12.2, 12], [15.6, 6.5], [12.2, 6.5], [0, 27.6], [0, 24.4], [-12, 27.4], [-12, 24.8], [12, 27.4], [12, 24.8]]) N2(x, 0, z);
  for (const x of exits) {
    N2(x, 0, 61.6);
    N2(x, 0, 57.6);
  }
  for (const x of [-53, -45, -37, -29, -20.7]) for (const z of [0, 8, 16, 24, 32]) if (open(x, 0, z)) N2(x, 0, z);
  // Catwalks, bridge, landings (deck level).
  for (const x of [-12.1, 12.1]) for (const z of [0, 5, 10, 16, 22]) N2(x, DECK, z);
  for (const x of [-6, 0, 6]) N(x, DECK, 0);
  for (const x of [-11, 11]) N2(x, DECK, 24.8);
  // Interior stairs: foot by the end wall, middle, top on the mid landing, onto the catwalk.
  for (const x of [-9.4, 9.4]) for (const s of [1, -1]) chain(N(x, 0, 24.7 * s), N(x, DECK / 2, 18.8 * s), N(x, DECK, 12.4 * s), N(Math.sign(x) * 12.1, DECK, 12.4 * s));
  // Exterior stair to the catwalk door: foot, middle, landing; the door's inside on the catwalk.
  for (const s of [1, -1]) {
    chain(N(15.4, 0, 9.9 * s), N(15.4, DECK / 2, 14.95 * s), N(15.3, DECK, 20.3 * s));
    N(12.1, DECK, 20.3 * s);
  }
  // Container stairs and tops; the loading platform.
  for (const s of [1, -1]) {
    chain(N(-30.6, 0, 21.6 * s), N(-30.6, CONT.H / 2, 19 * s), N(-30.6, CONT.H, 17.7 * s), N(-33, CONT.H, 20 * s));
    chain(N(-49, 0, 33.4 * s), N(-49, CONT.H / 2, 31 * s), N(-49, CONT.H, 28 * s));
    chain(N(33.5, 0, 52.3 * s), N(33.5, 0.6, 49.8 * s), N(33.5, 1.2, 46.8 * s));
    for (const [x, z] of [[30, 42], [38, 42], [34, 44]]) N(x, 1.2, z * s);
  }
  // Lane waypoints are nodes too.
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Floor lattice: 4 m in the maze, 6 m elsewhere; only where a body fits.
  const inside = (x: number, z: number) => (x > WEST_X + 0.6 && x < QUAY_X - 0.6 && Math.abs(z) < END_Z - 0.6) || (Math.abs(x) < BASE.x1 - 1 && Math.abs(z) < BASE.z1 - 1);
  const lattice = (xs: number[], step: number) => {
    for (const x of xs) for (let z = -BASE.z1 + 2; z <= BASE.z1 - 2; z += step) if (inside(x, z) && open(x, 0, z)) N(x, 0, z);
  };
  lattice([-53, -49, -45, -41, -37, -33, -29, -25, -21, -17], 4);
  lattice([-11, -5, 1, 7, 13, 19, 25, 31, 37, 43], 6);

  // Lanes must run over open floor, and no nav node may sit inside geometry.
  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x},${p.y},${p.z} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!open(p.x, p.y, p.z)) laneProblems.push(`${t} ${p.x},${p.y},${p.z}`);

  const spawns = { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') };
  // Authored cover spots: the engine adds spots round every waist-high solid at load.
  const coverPoints: THREE.Vector3[] = [];
  const testGoals = [
    v(-12.1, DECK, -10),
    v(0, DECK, 0),
    v(12.1, DECK, 16),
    v(15.3, DECK, -20.3),
    v(-33, CONT.H, 20),
    v(-49, CONT.H, -28),
    v(34, 1.2, -44),
    v(-45, 0, -8),
    v(-37, 0, 24),
    v(32, 0, 0),
    v(0, 0, -12),
    v(-12, 0, 24.8),
    v(0, 0, 40),
    v(31, 0, -30),
    v(-37, 0, -24),
    v(0, 0, -40),
  ];

  const rain: RainAreas = {
    open: [
      [GX0, -GZ, GX1, WH.z0],
      [GX0, WH.z1, GX1, GZ],
      [GX0, WH.z0, WH.x0, WH.z1],
      [WH.x1, WH.z0, GX1, WH.z1],
    ],
    surfaces: [
      { x0: 28, z0: 40, x1: 40, z1: 48, y: 1.2 },
      { x0: 28, z0: -48, x1: 40, z1: -40, y: 1.2 },
      { x0: 14, z0: 19, x1: 16.6, z1: 21.6, y: DECK },
      { x0: 14, z0: -21.6, x1: 16.6, z1: -19, y: DECK },
    ],
    shelters: [{ x0: WH.x0, z0: WH.z0, x1: WH.x1, z1: WH.z1, y: WH.h }],
  };

  return {
    nav: { nodes, links, slope: 0 },
    spawns,
    coverPoints,
    testGoals,
    zoneAt,
    rain,
    catcherPicks: [
      ...lamps.slice(0, 4).map((g) => [g.pos.x, g.pos.y, g.pos.z] as [number, number, number]),
    ],
    indoor: { x0: WH.x0, z0: WH.z0, x1: WH.x1, z1: WH.z1, y0: 0, h: WH.h },
    laneProblems,
  };
}
