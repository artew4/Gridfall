import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import { chainLinkTexture } from '../../world/Textures';
import { plankTexture } from '../jungle/textures';
import { crateTexture } from '../desert/textures';
import type { Shaft } from '../jungle/GodRays';
import {
  ATRIUM, BAFFLES, BARRELS, BARRIERS, BASE, BLOCKERS, CONT, COURT, DOCK, FIRE, GATES, QUAY_X, SHIP, PASSAGES, SPINE, SPINE_SEGMENTS, SPINE_STAIR, STACKS, STACK_B, WALK, WH, WHI, WH_STAIR, X_W, Z_END, lanesOf, spawnsOf, zoneAt,
} from './OldPortLayout';
import { boardsTexture, brickTexture, containerTexture, dockWallTexture, quayTexture, stencilSign } from './textures';
import type { Zone } from '../Level';

/*
  Builds Old Port (the plan is in OldPortLayout.ts). The 3.3 rules hold:
   - every box is drawn and collided with the same bounds (StaticBuilder + col.add);
   - stairs are visible steps over a smooth ramp, stepped fill underneath, plated sides, fitted clear
     of walls (StairFit);
   - the boundary beats the best jump: 11–14 m brick buildings on three sides, a 2.4 m fence at the
     sea (nothing near it is over 1 m); the highest floors (the stacks, 5.2 m; the warehouse's upper floor, 4.4 m) are far below;
   - gaps are under 0.3 m or over 1 m; low cover that may be vaulted (≤ 1.05 m) is flagged `vault`;
   - nothing here glows: it is lit by the sun (one static shadow map) and the sky.
*/

export interface OldPortResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  /** Survival spawns spread over the map (the yards excluded). */
  survival: THREE.Vector3[];
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Light shafts through the broken skylights (feet on the upper floor). */
  shafts: Shaft[];
  /** Under a roof or the upper floor (rooms the viewmodel is shaded in). */
  covered: { x0: number; z0: number; x1: number; z1: number; y0: number; h: number }[];
  water: THREE.Mesh;
  laneProblems: string[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type R = [number, number, number, number];

/** A rectangle minus holes, as rectangles (a grid cut on every edge, cells kept and merged along x). */
export function carve(r: R, holes: R[]): R[] {
  const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]])])].filter((x) => x >= r[0] && x <= r[2]).sort((a, b) => a - b);
  const zs = [...new Set([r[1], r[3], ...holes.flatMap((h) => [h[1], h[3]])])].filter((z) => z >= r[1] && z <= r[3]).sort((a, b) => a - b);
  const out: R[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run: R | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const inHole = holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]);
      if (inHole) {
        if (run) out.push(run);
        run = null;
      } else if (run) run[2] = xs[i + 1];
      else run = [xs[i], zs[j], xs[i + 1], zs[j + 1]];
    }
    if (run) out.push(run);
  }
  return out;
}

export function buildOldPort(scene: THREE.Scene, col: CollisionWorld, sunDir: THREE.Vector3): OldPortResult {
  const b = new StaticBuilder();
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.85, metal = 0, env = 0.5) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  // The palette (see the header of OldPortLayout and docs/LEVELS.md): warm brick and pale concrete,
  // sun-faded container paint, steel in soft greys and a pale steel blue; no saturated colour.
  const m = {
    brick: std(brickTexture('#8b5a43'), 0xffffff, 0.92, 0, 0.35),
    brickB: std(brickTexture('#7d5442', 0.4), 0xffffff, 0.92, 0, 0.35),
    brickC: std(brickTexture('#96684d', 0.2), 0xffffff, 0.92, 0, 0.35),
    stone: std(dockWallTexture(), 0xd8d2c6, 0.9, 0, 0.35),
    quay: std(quayTexture(), 0xffffff, 0.88, 0, 0.4),
    dockWall: std(dockWallTexture(), 0xffffff, 0.9, 0, 0.35),
    boards: std(boardsTexture(), 0xffffff, 0.82, 0, 0.3),
    plank: std(plankTexture(), 0xc8b8a0, 0.85, 0, 0.3),
    steel: std(null, 0x6d7275, 0.55, 0.55, 0.6),
    steelDark: std(null, 0x45494c, 0.6, 0.5, 0.5),
    roof: std(null, 0x55524e, 0.95, 0, 0.2),
    crane: std(null, 0x8fa3b2, 0.55, 0.35, 0.6),
    rail: std(null, 0x7a837f, 0.6, 0.4, 0.5),
    sea: std(containerTexture('#6f8f88', 1), 0xffffff, 0.75, 0.2, 0.45),
    rust: std(containerTexture('#a66450', 2), 0xffffff, 0.75, 0.2, 0.45),
    mustard: std(containerTexture('#c4a35e', 3), 0xffffff, 0.75, 0.2, 0.45),
    slate: std(containerTexture('#7a8b9c', 4), 0xffffff, 0.75, 0.2, 0.45),
    cream: std(containerTexture('#c3bba8', 5), 0xffffff, 0.75, 0.2, 0.45),
    umber: std(containerTexture('#8c7462', 6), 0xffffff, 0.75, 0.2, 0.45),
    hull: std(containerTexture('#4d5d6b', 7), 0xffffff, 0.7, 0.3, 0.5),
    antifoul: std(containerTexture('#8a4a3a', 8), 0xffffff, 0.8, 0.15, 0.4),
    paintWhite: std(null, 0xe4ded0, 0.6, 0.1, 0.5),
    house: std(null, 0xd9d2c1, 0.7, 0.05, 0.5),
    window: std(null, 0x40505c, 0.15, 0.4, 1.2),
    timber: std(plankTexture(), 0x9a7a58, 0.9, 0, 0.25),
    crate: std(crateTexture('PORT 3', 'СКЛАД · CARGO', '#7a6248', '#e6dcc8'), 0xffffff, 0.85, 0, 0.35),
    sacks: std(null, 0xbdae8e, 0.95, 0, 0.2),
    tyre: std(null, 0x2a2a2a, 0.9, 0, 0.2),
    fence: new THREE.MeshStandardMaterial({ map: chainLinkTexture(), color: 0xc4c8cc, roughness: 0.5, metalness: 0.6, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd2d8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, envMapIntensity: 1.2, depthWrite: false }),
  };
  // The warehouse's own materials carry a faint warm emissive: the bounce light of a sunlit room (the
  // sky light alone left its inside near black against the sun outside; real rooms are lit by their
  // floors and walls). Outside, in the sun, it is lost in the direct light.
  const bounce = (mat: THREE.MeshStandardMaterial, hex: number) => {
    const c = mat.clone();
    c.emissive.setHex(hex);
    c.emissiveMap = c.map;
    return c;
  };
  const wh = { brick: bounce(m.brick, 0x9a8070), boards: bounce(m.boards, 0xa08870), timber: bounce(m.timber, 0x8a7460), pier: bounce(m.brickB, 0x8a7060) };
  for (const x of Object.values(wh)) x.emissiveIntensity = 0.45;
  const boxes = [m.sea, m.rust, m.mustard, m.slate, m.cream, m.umber];
  let pick = 0;
  /** The next container paint (a fixed cycle, so both halves get the same colours). */
  const paint = () => boxes[pick++ % boxes.length];

  // ---------------------------------------------------------------- helpers
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  const solid2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => [
    solid(x0, y0, z0, x1, y1, z1, mat, surface, tile),
    solid(x0, y0, -z1, x1, y1, -z0, mat, surface, tile),
  ];
  /** Something only seen (inside a collider, or out of reach). */
  const deco = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2) =>
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  /** Waist-high cover on the ground (vault it if ≤ 1.05 m), both halves. */
  const low2 = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', y = 0) => {
    for (const c of solid2(x0, y, z0, x1, y + h, z1, mat, surface, 1)) c.vault = h <= 1.05;
  };
  const cyl = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'metal', seg = 14) => {
    b.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y0 + h / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + h, surface);
  };
  /** A container (or `n` high) with its long side along x or z, one box and collider per tier. */
  const container = (x0: number, z0: number, along: 'x' | 'z', n: number, mat: THREE.Material, y = 0) => {
    const x1 = x0 + (along === 'x' ? CONT.L : CONT.W), z1 = z0 + (along === 'x' ? CONT.W : CONT.L);
    for (let i = 0; i < n; i++) solid(x0, y + i * CONT.H, z0, x1, y + (i + 1) * CONT.H, z1, mat, 'metal', CONT.H);
  };
  const container2 = (x0: number, z0: number, along: 'x' | 'z', n: number) => {
    const mat = paint();
    container(x0, z0, along, n, mat);
    container(x0, -(z0 + (along === 'x' ? CONT.W : CONT.L)), along, n, mat);
  };
  /** Stair: visual steps over a ramp, stepped fill under it, side plates on `rails` ('lo'/'hi' across the run). */
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[oldport stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const steps = Math.max(2, Math.round(H / 0.25));
    const run = L / steps;
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
          solid(lo0, base, f, lo1, hi, f + t, m.rail, 'metal', 1);
        } else {
          const f = side === 'lo' ? x0 : x1 - t;
          solid(f, base, lo0, f + t, hi, lo1, m.rail, 'metal', 1);
        }
      }
    }
  };
  /** A stair and its mirror (a z-axis stair rises the other way in the north half). */
  const stair2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    stair(x0, z0, x1, z1, axis, rise, base, top, mat, rails);
    stair(x0, -z1, x1, -z0, axis, axis === 'z' ? (-rise as 1 | -1) : rise, base, top, mat, rails);
  };
  /** A 1.05 m handrail plate on a floor at `y` (a fall: not vaultable). */
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number) => solid(x0, y, z0, x1, y + 1.05, z1, m.rail, 'metal', 1);
  const rail2 = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    rail(x0, z0, x1, z1, y);
    rail(x0, -z1, x1, -z0, y);
  };

  interface Opening { at: number; w: number; y0: number; y1: number }
  /**
   * A wall with openings: along x it spans [a0, a1] at z ∈ [c0, c1]; along z, [a0, a1] in z at
   * x ∈ [c0, c1]. Solid stretches, and the pieces under and over each opening (a stone lintel), are
   * one box each. Openings must not overlap along the wall.
   */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, y0: number, h: number, mat: THREE.Material, openings: Opening[]) => {
    const piece = (p0: number, p1: number, ya: number, yb: number, mt: THREE.Material) => {
      if (p1 - p0 < 0.01 || yb - ya < 0.01) return;
      if (alongX) solid(p0, ya, c0, p1, yb, c1, mt, 'concrete', 2);
      else solid(c0, ya, p0, c1, yb, p1, mt, 'concrete', 2);
    };
    let cur = a0;
    for (const o of openings.slice().sort((p, q) => p.at - q.at)) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, y0, y0 + h, mat);
      piece(o0, o1, y0, o.y0, mat);
      piece(o0, o1, o.y1, o.y1 + 0.25, m.stone);
      piece(o0, o1, o.y1 + 0.25, y0 + h, mat);
      cur = o1;
    }
    piece(cur, a1, y0, y0 + h, mat);
  };
  /** A slab of floor (top at y) over a rectangle minus holes. */
  const slab = (r: R, holes: R[], y: number, th: number, mat: THREE.Material, surface: Collider['surface'] = 'wood') => {
    for (const [x0, z0, x1, z1] of carve(r, holes)) solid(x0, y - th, z0, x1, y, z1, mat, surface, 2);
  };
  /** Ground paving (seen only: the floor is the terrain). */
  const pave = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0, tile = 8) => deco(x0, y - 0.3, z0, x1, y, z1, mat, tile);

  // ---------------------------------------------------------------- the ground
  const DX0 = DOCK.x0 - DOCK.wall, DX1 = DOCK.x1 + DOCK.wall, DZ = DOCK.z + DOCK.wall;
  pave(X_W - 12, -Z_END - 12, DX0, Z_END + 12, m.quay);
  pave(DX1, -Z_END - 12, QUAY_X, Z_END + 12, m.quay);
  pave(DX0, DZ, DX1, Z_END + 12, m.quay);
  pave(DX0, -Z_END - 12, DX1, -DZ, m.quay);
  // A faded yellow line along the quay edges and the yard lanes (paint on the paving).
  const line = new THREE.MeshStandardMaterial({ color: 0xc9b26a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x0, z0, x1, z1] of [[DX0 - 1.2, -DZ, DX0 - 1.0, DZ], [DX1 + 1.0, -DZ, DX1 + 1.2, DZ], [-22.1, -COURT, -21.9, COURT], [17.9, -COURT, 18.1, COURT]] as R[]) deco(x0, 0, z0, x1, 0.005, z1, line, 4);

  // ---------------------------------------------------------------- boundary: brick buildings
  // West behind the warehouse ends, south and north behind the yards: 11–14 m, in three brick tones,
  // with stone string courses and window bays drawn as recessed dark panels.
  const building = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material) => {
    solid(x0, 0, z0, x1, h, z1, mat, 'concrete', 2);
    deco(x0 - 0.05, h - 0.4, z0 - 0.05, x1 + 0.05, h, z1 + 0.05, m.stone, 2);
    deco(x0 + 0.3, h, z0 + 0.3, x1 - 0.3, h + 0.12, z1 - 0.3, m.roof, 4);
    deco(x0 - 0.05, 3.2, z0 - 0.05, x1 + 0.05, 3.45, z1 + 0.05, m.stone, 2);
  };
  const tones = [m.brick, m.brickB, m.brickC];
  for (const s of [1, -1]) {
    let k = 0;
    for (let x = X_W - 10; x < QUAY_X; x += 14) {
      const x1 = Math.min(QUAY_X, x + 14);
      const [z0, z1] = s > 0 ? [Z_END, Z_END + 12] : [-Z_END - 12, -Z_END];
      building(x, z0, x1, z1, [12, 14, 11, 13][k % 4], tones[k % 3]);
      k++;
    }
    const [a, c] = s > 0 ? [WH.z, Z_END] : [-Z_END, -WH.z];
    building(X_W - 10, a, X_W, c, 12.5, m.brickB);
  }
  // Windows on the boundary facades facing in (dark recessed panels, two rows).
  for (const s of [1, -1]) {
    const zf = s * Z_END - s * 0.06;
    for (let x = X_W - 6; x < QUAY_X - 2; x += 4.6) {
      for (const y of [5.2, 8.6]) deco(x, y, Math.min(zf, zf + s * 0.02), x + 1.6, y + 2.2, Math.max(zf, zf + s * 0.02), m.window, 1);
    }
  }

  // ---------------------------------------------------------------- the brick warehouse (west lane)
  const UP = WH.up;
  // Long walls. The east wall: on the ground the loading bay (z 0), the side doors (±22) and two
  // windows a side; upstairs the fire doors (±13.4) and the windows over the yard.
  wall(false, -WH.z, WH.z, WH.x0, WH.x0 + WH.t, 0, WH.eave, wh.brick, []);
  const eastOpenings: Opening[] = [{ at: 0, w: 6, y0: 0, y1: 3.6 }];
  for (const s of [1, -1]) {
    eastOpenings.push(
      { at: 22 * s, w: 2.4, y0: 0, y1: 2.6 },
      { at: 11 * s, w: 1.6, y0: 1.1, y1: 2.5 },
      { at: 29 * s, w: 1.6, y0: 1.1, y1: 2.5 },
      { at: 7 * s, w: 1.8, y0: UP + 1.0, y1: UP + 2.6 },
      { at: FIRE.zDoor * s, w: 1.6, y0: UP, y1: UP + 2.3 },
      { at: 19 * s, w: 1.8, y0: UP + 1.0, y1: UP + 2.6 },
      { at: 25 * s, w: 1.8, y0: UP + 1.0, y1: UP + 2.6 },
      { at: 31 * s, w: 1.8, y0: UP + 1.0, y1: UP + 2.6 },
    );
  }
  wall(false, -WH.z, WH.z, WH.x1 - WH.t, WH.x1, 0, WH.eave, wh.brick, eastOpenings);
  // End walls: the main door (x -35.5) and two windows upstairs over the aprons.
  for (const s of [1, -1]) {
    const [c0, c1] = s > 0 ? [WH.z - WH.t, WH.z] : [-WH.z, -WH.z + WH.t];
    wall(true, WH.x0 + WH.t, WH.x1 - WH.t, c0, c1, 0, WH.eave, wh.brick, [
      { at: -35.5, w: 4, y0: 0, y1: 3.6 },
      { at: -41.5, w: 2, y0: UP + 1.0, y1: UP + 2.6 },
      { at: -30.5, w: 2, y0: UP + 1.0, y1: UP + 2.6 },
    ]);
  }
  // A stone plinth and string course outside (seen), the painted name on the east wall.
  // (The plinth stops at the doors: a 3.3 rule, nothing seen where you walk without being solid.)
  for (const [a, c] of [[-WH.z, -23.2], [-20.8, -3], [3, 20.8], [23.2, WH.z]]) deco(WH.x1, 0, a, WH.x1 + 0.08, 0.6, c, m.stone, 2);
  deco(WH.x1, UP - 0.25, -WH.z, WH.x1 + 0.08, UP, WH.z, m.stone, 2);
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshStandardMaterial({ map: stencilSign('WAREHOUSE 3', 'СКЛАД № 3 · 1894', '#d9cfba', '#5a4636'), roughness: 0.9, transparent: true, opacity: 0.88 }));
    sign.position.set(WH.x1 + 0.1, 7.6, 0);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);
  }
  // The upper floor: old boards on a slab, open over the stairs and the middle (the drop).
  const stairHoles: R[] = [[WH_STAIR.x0 - 0.05, WH_STAIR.zTop, WH_STAIR.x1 + 0.05, WH_STAIR.zFoot], [WH_STAIR.x0 - 0.05, -WH_STAIR.zFoot, WH_STAIR.x1 + 0.05, -WH_STAIR.zTop]];
  const atrium: R = [ATRIUM.x0, -ATRIUM.z, ATRIUM.x1, ATRIUM.z];
  slab([WHI.x0, -WHI.z, WHI.x1, WHI.z], [...stairHoles, atrium], UP, WH.slab, wh.boards, 'wood');
  // Brick piers carrying it (clear of the stairs, the hole and the doors).
  for (const x of [-39.5, -31.5]) for (const z of [0, 8, 16, 24, 31]) for (const s of z ? [1, -1] : [1]) solid(x - 0.35, 0, s * z - 0.35, x + 0.35, UP - WH.slab, s * z + 0.35, wh.pier, 'concrete', 1);
  // Beams under the slab (seen).
  for (let z = -32; z <= 32; z += 4) deco(WHI.x0, UP - WH.slab - 0.35, z - 0.12, WHI.x1, UP - WH.slab, z + 0.12, wh.timber, 2);
  // The stairs: foot 3.5 m short of the end walls, rising towards the middle, plated on the hall side.
  stair2(WH_STAIR.x0, WH_STAIR.zTop, WH_STAIR.x1, WH_STAIR.zFoot, 'z', -1, 0, UP, wh.timber, ['hi']);
  // Rails round the stair holes (upstairs) and round the hole in the middle, except its two drop gaps
  // on the long sides (z ±1.5 … ±3.5: walk off, land in the hall).
  for (const s of [1, -1]) {
    const [a, c] = s > 0 ? [WH_STAIR.zTop, WH_STAIR.zFoot] : [-WH_STAIR.zFoot, -WH_STAIR.zTop];
    rail(WH_STAIR.x1 + 0.05, a, WH_STAIR.x1 + 0.13, c, UP);
    const e = s > 0 ? WH_STAIR.zFoot : -WH_STAIR.zFoot - 0.08;
    rail(WHI.x0, e, WH_STAIR.x1 + 0.13, e + 0.08, UP);
  }
  rail(ATRIUM.x0, -ATRIUM.z - 0.08, ATRIUM.x1, -ATRIUM.z, UP);
  rail(ATRIUM.x0, ATRIUM.z, ATRIUM.x1, ATRIUM.z + 0.08, UP);
  for (const x of [ATRIUM.x0 - 0.08, ATRIUM.x1]) {
    rail(x, -ATRIUM.z, x + 0.08, -3.5, UP);
    rail(x, -1.5, x + 0.08, 1.5, UP);
    rail(x, 3.5, x + 0.08, ATRIUM.z, UP);
  }
  // The roof: a flat roof on the eaves with skylight lanterns along the ridge; four are broken open
  // (the sun comes through: light patches and shafts on the boards), the rest glazed.
  const sky: R[] = [];
  const broken = [4, 12, 28];
  for (const z of [4, 12, 20, 28]) for (const s of [1, -1]) sky.push([-38.2, s * z - 1.7, -34.8, s * z + 1.7]);
  slab([WH.x0, -WH.z, WH.x1, WH.z], sky, WH.eave + 0.3, 0.3, wh.timber, 'wood');
  for (const [x0, z0, x1, z1] of sky) {
    // The lantern frame (seen) and, where intact, its glass.
    deco(x0 - 0.15, WH.eave + 0.3, z0 - 0.15, x1 + 0.15, WH.eave + 0.75, z0, m.steel, 1);
    deco(x0 - 0.15, WH.eave + 0.3, z1, x1 + 0.15, WH.eave + 0.75, z1 + 0.15, m.steel, 1);
    deco(x0 - 0.15, WH.eave + 0.3, z0, x0, WH.eave + 0.75, z1, m.steel, 1);
    deco(x1, WH.eave + 0.3, z0, x1 + 0.15, WH.eave + 0.75, z1, m.steel, 1);
    const zc = (z0 + z1) / 2;
    if (!broken.includes(Math.abs(Math.round(zc)))) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m.glass);
      g.rotation.x = -Math.PI / 2;
      g.position.set((x0 + x1) / 2, WH.eave + 0.7, zc);
      scene.add(g);
    } else {
      // Two mullions left standing, a few panes hanging on.
      deco((x0 + x1) / 2 - 0.05, WH.eave + 0.6, z0, (x0 + x1) / 2 + 0.05, WH.eave + 0.7, z1, m.steelDark, 1);
    }
  }
  // Light shafts through the broken skylights, landing where the sun line meets the boards.
  const shafts: Shaft[] = [];
  for (const z of broken) for (const s of [1, -1]) {
    const k = (WH.eave - UP) / sunDir.y;
    const fx = -36.5 - sunDir.x * k, fz = s * z - sunDir.z * k;
    if (fx > WHI.x0 + 1.5 && fx < WHI.x1 - 1 && Math.abs(fz) < WHI.z - 1) shafts.push({ x: fx, y: UP, z: fz, r: 1.55, k: z === 12 ? 1 : 0.8 });
  }
  // Fill: the light the sunlit boards and the bay door throw round the rooms (no shadows, soft falloff):
  // warm upstairs under the skylights, cool and dimmer in the hall. Five lights for 68 m of building.
  for (const z of [-20, 0, 20]) {
    const l = new THREE.PointLight(0xffe4c4, 7, 30, 1);
    l.position.set(-36, UP + 3.4, z);
    scene.add(l);
  }
  for (const z of [-12, 12]) {
    const l = new THREE.PointLight(0xdde6ee, 5, 26, 1);
    l.position.set(-36, UP - 1.2, z);
    scene.add(l);
  }
  // Inside: pallets and crates on the ground floor (cover), sacks and an old press upstairs.
  for (const [x0, z0, x1, z1, h] of [[-44.6, 12, -42.8, 14.2, 1.0], [-36.6, 19, -34.4, 20.2, 1.0], [-30.2, 4, -28.6, 6.6, 1.0], [-38.8, 27.2, -36.6, 28.4, 1.0], [-42, 4.5, -40.6, 6.5, 1.25]] as const) {
    low2(x0, z0, x1, z1, h, h > 1.05 ? m.crate : m.crate, 'wood');
  }
  low2(-31, 14, -28.8, 15.4, 0.95, m.sacks, 'sand', UP);
  low2(-44.8, 8, -43, 10.4, 1.0, m.crate, 'wood', UP);
  low2(-37.4, 24.6, -34.6, 25.6, 1.0, m.crate, 'wood', UP);
  solid2(-31.2, UP, 22, -29, UP + 1.8, 23.6, m.steelDark, 'metal', 1);

  // ---------------------------------------------------------------- the alley and the fire stairs
  stair2(FIRE.x0, FIRE.zFoot, FIRE.x1, FIRE.zTop, 'z', 1, 0, UP, m.steel, ['hi']);
  for (const s of [1, -1]) {
    const [a, c] = s > 0 ? [FIRE.zTop, FIRE.zDoor + 1.2] : [-FIRE.zDoor - 1.2, -FIRE.zTop];
    solid(WH.x1, UP - 0.25, a, FIRE.x1, UP, c, m.steel, 'metal', 1);
    rail(FIRE.x1 - 0.08, a, FIRE.x1, c, UP);
    const e = s > 0 ? FIRE.zDoor + 1.2 - 0.08 : -FIRE.zDoor - 1.2;
    rail(WH.x1, e, FIRE.x1, e + 0.08, UP);
    // Posts under the landing.
    solid(FIRE.x1 - 0.3, 0, s * (FIRE.zDoor + 0.9) - 0.12, FIRE.x1 - 0.06, UP - 0.25, s * (FIRE.zDoor + 0.9) + 0.12, m.steelDark, 'metal', 1);
  }
  // Bins and a skip in the alley (cover), a row of containers at the yard's edge (two gaps a side).
  low2(-24.8, 24, -23.2, 25.6, 1.05, m.steelDark, 'metal');
  // 23.0: the skip moved 1.6 m west (it left a 0.4 m slot to the container a bot jammed in, beside the
  // alley's forward point).
  solid2(-26.8, 0, 33, -24, 1.5, 36.2, m.slate, 'metal', 1);
  container2(-22, 36, 'z', 1);
  container2(-22, 7.4, 'z', 1);

  // ---------------------------------------------------------------- the container yard (centre)
  // THE STACKS: two high, two wide, two long; a stair up from the apron; STACK B over the yard,
  // joined by a steel walk at the same height; B's stair down to the west quay.
  for (const s of [1, -1]) {
    const mats = [paint(), paint(), paint(), paint()];
    const zr = (z0: number) => (s > 0 ? z0 : -(z0 + CONT.W));
    let i = 0;
    for (const x of [STACKS.x0, STACKS.x0 + CONT.L]) for (const z of [STACKS.z0, STACKS.z0 + CONT.W]) container(x, zr(z), 'x', 2, mats[i++ % 4]);
    for (const z of [STACK_B.z0, STACK_B.z0 + CONT.W]) container(STACK_B.x0, zr(z), 'x', 2, mats[i++ % 4]);
  }
  stair2(STACKS.x0, STACKS.z1, STACKS.x0 + 2.4, STACKS.z1 + 9.5, 'z', -1, 0, STACKS.top, m.steel, ['lo', 'hi']);
  // A second stair up from the mid-field side: the stacks are near home, and the fights are in the
  // middle (bots hunting a contact take the waypoint level with it); now they can be contested.
  stair2(STACKS.x1 - 2.4, STACKS.z0 - 9.5, STACKS.x1, STACKS.z0, 'z', 1, 0, STACKS.top, m.steel, ['lo', 'hi']);
  stair2(STACK_B.x1 + 0.03, WALK.z0, STACK_B.x1 + 9.5, WALK.z1 + 0.8, 'x', -1, 0, STACKS.top, m.steel, ['lo', 'hi']);
  // The walk: deck, rails both sides, two posts.
  solid2(WALK.x0, STACKS.top - 0.22, WALK.z0, WALK.x1, STACKS.top, WALK.z1, m.steel, 'metal', 1);
  rail2(WALK.x0, WALK.z0, WALK.x1, WALK.z0 + 0.08, STACKS.top);
  rail2(WALK.x0, WALK.z1 - 0.08, WALK.x1, WALK.z1, STACKS.top);
  for (const x of [-5.5, -0.5]) solid2(x - 0.15, 0, 20.25, x + 0.15, STACKS.top - 0.22, 20.55, m.steelDark, 'metal', 1);
  // Mid-field: low and single-high cover. 23.0: the reach stacker that sat across the middle gave way
  // to THE SPINE (below); the containers by its gates are its baffles.
  container2(BAFFLES[0].x[0], BAFFLES[0].z[0], 'x', 1);
  container2(BAFFLES[1].x[0], BAFFLES[1].z[0], 'x', 1);
  container2(-4, 30, 'z', 1);
  container2(10.5, 32, 'x', 1);
  low2(-16.5, 12.2, -13.5, 12.8, 0.95, m.stone);
  low2(3, 11, 6, 11.6, 0.95, m.stone);
  low2(13, 15.5, 15.2, 17.5, 1.0, m.crate, 'wood');
  low2(-15.5, 34, -12.5, 35.2, 1.0, m.crate, 'wood');
  // 23.0, THE SPINE: a row of 1-high containers across the middle (z ±1.22), two gates through it
  // (baffled), its top a walk joined over the gates by plank bridges and reached by a stair a side.
  for (const [x0, x1] of SPINE_SEGMENTS) {
    if (x1 - x0 > CONT.L - 0.01) container(x0, -SPINE.z, 'x', 1, paint());
    else {
      solid(x0, 0, -SPINE.z, x1, 1.3, SPINE.z, m.crate, 'wood', 1.3);
      solid(x0, 1.3, -SPINE.z, x1, SPINE.top, SPINE.z, m.crate, 'wood', 1.3);
    }
  }
  for (const [g0, g1] of GATES) {
    solid(g0, SPINE.top - 0.22, -0.8, g1, SPINE.top, 0.8, m.plank, 'wood', 1);
    rail(g0, -0.88, g1, -0.8, SPINE.top);
    rail(g0, 0.8, g1, 0.88, SPINE.top);
  }
  stair2(SPINE_STAIR.x0, SPINE_STAIR.z0, SPINE_STAIR.x1, SPINE_STAIR.z1, 'z', -1, 0, SPINE.top, m.steel, ['lo', 'hi']);
  // 23.0: the long lines' blockers (OldPortLayout.BLOCKERS): a bulldozer and a cargo stack across the
  // west quay, cargo stacks across the hall's door-to-door line, pallets in the alley.
  {
    const [bd, cs, hc, hc2, ap, ap2] = BLOCKERS;
    solid2(bd.x[0], 0, bd.z[0], bd.x[1], 1.8, bd.z[1], m.mustard, 'metal', 1.8);
    solid2(bd.x[0] + 1.7, 1.8, bd.z[0] + 0.6, bd.x[1] - 0.4, bd.h, bd.z[1] - 0.6, m.window, 'metal', 1);
    solid2(bd.x[0] - 0.35, 0, bd.z[0] - 0.2, bd.x[0], 1.2, bd.z[1] + 0.2, m.steelDark, 'metal', 1);
    solid2(cs.x[0], 0, cs.z[0], cs.x[1], cs.h / 2, cs.z[1], m.crate, 'wood', 1.5);
    solid2(cs.x[0] + 0.1, cs.h / 2, cs.z[0] + 0.1, cs.x[1] - 0.1, cs.h, cs.z[1] - 0.1, m.crate, 'wood', 1.5);
    for (const c of [hc, hc2]) solid2(c.x[0], 0, c.z[0], c.x[1], c.h, c.z[1], m.crate, 'wood', 1.3);
    for (const a of [ap, ap2]) solid2(a.x[0], 0, a.z[0], a.x[1], a.h, a.z[1], m.timber, 'wood', 1.2);
    for (const c of BLOCKERS.slice(6)) {
      if (c.y0 !== undefined) {
        // A scaffold tower: a steel frame round a stack of staging boards (solid: cover, not a climb).
        solid2(c.x[0], c.y0, c.z[0], c.x[1], c.h, c.z[1], m.rail, 'metal', 1.5);
        for (let y = c.y0 + 1.5; y < c.h; y += 1.5) deco(c.x[0] - 0.04, y, c.z[0] - 0.04, c.x[1] + 0.04, y + 0.12, c.z[1] + 0.04, m.plank, 1);
        for (let y = c.y0 + 1.5; y < c.h; y += 1.5) deco(c.x[0] - 0.04, y, -c.z[1] - 0.04, c.x[1] + 0.04, y + 0.12, -c.z[0] + 0.04, m.plank, 1);
      } else {
        solid2(c.x[0], 0, c.z[0], c.x[1], c.h / 2, c.z[1], m.crate, 'wood', 1.5);
        solid2(c.x[0] + 0.1, c.h / 2, c.z[0] + 0.1, c.x[1] - 0.1, c.h, c.z[1] - 0.1, m.crate, 'wood', 1.5);
      }
    }
  }
  // A truck chassis on the dock side of the apron.
  solid2(13, 0, 38, 15.4, 1.3, 47, m.steelDark, 'metal', 1);
  solid2(13, 1.3, 44.5, 15.4, 3.2, 47, m.cream, 'metal', 1);

  // ---------------------------------------------------------------- the dry dock (east lane)
  // Walls (their tops are the quay; the carve lies inside them), end walls, the floor.
  for (const [x0, x1] of [[DX0, DOCK.x0], [DOCK.x1, DX1]] as const) solid(x0, DOCK.floor - 0.1, -DOCK.z, x1, 0, DOCK.z, m.dockWall, 'concrete', 4.5);
  solid2(DX0, DOCK.floor - 0.1, DOCK.z, DX1, 0, DZ, m.dockWall, 'concrete', 4.5);
  deco(DOCK.x0, DOCK.floor - 0.3, -DOCK.z, DOCK.x1, DOCK.floor, DOCK.z, m.stone, 4);
  // Coping stones on the dock's edge (seen, flush with the quay).
  for (const x of [DOCK.x0 - 0.3, DOCK.x1]) deco(x, -0.02, -DOCK.z, x + 0.3, 0.01, DOCK.z, m.stone, 2);
  // Stairs down the dock walls at both ends (each end, both sides).
  stair2(DOCK.x0 + 0.03, 28.5, DOCK.x0 + 2.5, DOCK.z - 0.03, 'z', 1, DOCK.floor, 0, m.stone, ['hi']);
  stair2(DOCK.x1 - 2.5, 28.5, DOCK.x1 - 0.03, DOCK.z - 0.03, 'z', 1, DOCK.floor, 0, m.stone, ['lo']);
  // Scaffold stairs from the dock floor up to the ship's deck at both ends (the dock lane climbs
  // aboard, crosses over the bridge and goes back down: the ship's heights on the lane's own path, the
  // 15.0 lesson L-109); a timber keel block beyond each foot (cover on the floor).
  stair2(29.2, SHIP.z, 30.8, SHIP.z + 11, 'z', -1, DOCK.floor, SHIP.deck, m.steel, ['lo', 'hi']);
  low2(29.2, 31.4, 30.8, 33, 1.05, m.timber, 'wood', DOCK.floor);

  // The coaster on her blocks: hull (a box, with a narrower bilge and continuous cribbing under it),
  // the deck at 1.0 with bulwarks, the bridge house amidships and its roof (3.6), stairs up to it
  // from both sides, gangways from both quays.
  const S = SHIP;
  solid(S.x0, -2.4, -S.z, S.x1, S.deck, S.z, m.hull, 'metal', 3);
  // The bilge and the cribbing run flush to the hull's ends (an overhang there left a 0.6 m slot a
  // body fitted in, against the scaffold stair's foot: the stress test).
  solid(S.x0 + 0.6, -3.8, -S.z, S.x1 - 0.6, -2.4, S.z, m.antifoul, 'metal', 2);
  solid(S.x0 + 1.6, DOCK.floor, -S.z, S.x1 - 1.6, -3.8, S.z, m.timber, 'wood', 1);
  deco(S.x0 - 0.02, -2.5, -S.z - 0.02, S.x1 + 0.02, -2.32, S.z + 0.02, m.paintWhite, 2);
  // Blunt ends (an old coaster), a rubbing strake along the hull.
  for (const x of [S.x0 - 0.12, S.x1]) deco(x, 0.2, -S.z, x + 0.12, 0.45, S.z, m.timber, 2);
  const BW = 1.0;
  for (const [x0, x1] of [[S.x0, S.x0 + 0.15], [S.x1 - 0.15, S.x1]] as const) {
    for (const s of [1, -1]) {
      const segs: [number, number][] = [[0, S.gz - S.gw / 2], [S.gz + S.gw / 2, S.z]];
      for (const [a, c] of segs) {
        const [za, zb] = s > 0 ? [a, c] : [-c, -a];
        solid(x0, S.deck, za, x1, S.deck + BW, zb, m.hull, 'metal', 1).vault = false;
      }
    }
  }
  // End bulwarks, open where the scaffold stairs arrive.
  solid2(S.x0 + 0.15, S.deck, S.z - 0.15, 29.2, S.deck + BW, S.z, m.hull, 'metal', 1);
  solid2(30.8, S.deck, S.z - 0.15, S.x1 - 0.15, S.deck + BW, S.z, m.hull, 'metal', 1);
  const H = S.house;
  solid(H.x0, S.deck, -H.z, H.x1, H.roof - 0.25, H.z, m.house, 'metal', 2);
  solid(H.x0 - 0.2, H.roof - 0.25, -H.z, H.x1 + 0.2, H.roof, H.z, m.paintWhite, 'metal', 1);
  for (const x of [H.x0 - 0.02, H.x1 + 0.02]) deco(Math.min(x, x + 0.01), 2.2, -1.6, Math.max(x, x + 0.01) + 0.01, 3.0, 1.6, m.window, 1);
  stair2(29.2, H.z, 30.8, 9, 'z', -1, S.deck, H.roof, m.steel, ['lo', 'hi']);
  // Roof rails, open where the stairs arrive; the mast (out of reach) with a faded pennant.
  rail(H.x0 - 0.2, -H.z, H.x0 - 0.12, H.z, H.roof);
  rail(H.x1 + 0.12, -H.z, H.x1 + 0.2, H.z, H.roof);
  for (const s of [1, -1]) {
    const [a, c] = s > 0 ? [H.z - 0.08, H.z] : [-H.z, -H.z + 0.08];
    rail(H.x0 - 0.12, a, 29.2, c, H.roof);
    rail(30.8, a, H.x1 + 0.12, c, H.roof);
  }
  cyl(31.15, 0, 0.12, H.roof, 6, m.paintWhite, 'metal', 8);
  // Gangways: ramps from each quay up to the deck gaps (bridges over the passages; nothing under them).
  for (const s of [1, -1]) {
    const za = s * S.gz - S.gw / 2, zb = s * S.gz + S.gw / 2;
    for (const [x0, x1, h0, h1] of [[21.6, S.x0, 0, S.deck], [S.x1, 38.4, S.deck, 0]] as const) {
      col.addRamp(x0, za, x1, zb, 'x', h0, h1);
      const len = Math.hypot(x1 - x0, h1 - h0), ang = Math.atan2(h1 - h0, x1 - x0);
      b.add(worldBox(len, 0.12, S.gw, 1), m.timber, (x0 + x1) / 2, (h0 + h1) / 2 - 0.06, s * S.gz, 0, 0, ang);
    }
  }

  // ---------------------------------------------------------------- the quays
  // West quay: bollards, drums; the sea quay: bollards, net piles, the harbour office, the crane.
  const bollard = (x: number, z: number) => {
    for (const s of [1, -1]) {
      cyl(x, s * z, 0.32, 0, 0.75, m.steelDark, 'metal', 12).vault = true;
    }
  };
  for (const z of [3.5, 18, 30]) bollard(21.2, z);
  for (const z of [10, 24, 36]) bollard(42.6, z);
  for (const s of [1, -1]) {
    // 23.0: moved from z 12–14 (beside the bulldozer they left a 0.5 m slot runners stalled in).
    for (const [x, z] of [[19.3, 2.2], [20.0, 2.8], [19.4, 3.4]]) cyl(x, s * z, 0.3, 0, 0.9, m.rust, 'metal', 12).vault = true;
  }
  low2(38, 16, 40.4, 18.4, 0.9, m.sacks, 'sand');
  // The harbour office (a brick hut with a door you can't open: cover on the sea quay).
  solid2(38.4, 0, 28, 42.2, 3.1, 32.5, m.brickC, 'concrete', 2);
  solid2(38.2, 3.1, 27.8, 42.4, 3.35, 32.7, m.steelDark, 'metal', 1);
  // The sea fence (2.4 m: a sprint-jump off the 0.9 m sacks cleared the first, 1.6 m one in the
  // stress test) and the quay's face.
  const FH = 2.4;
  for (const s of [1, -1]) {
    const c = col.add(QUAY_X - 0.12, 0, s > 0 ? 0 : -Z_END, QUAY_X, FH, s > 0 ? Z_END : 0, 'metal');
    c.vault = false;
  }
  {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2 * Z_END, FH), m.fence);
    (m.fence.map as THREE.Texture).repeat.set(2 * Z_END / 2, FH / 2);
    (m.fence.map as THREE.Texture).wrapS = (m.fence.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
    f.rotation.y = Math.PI / 2;
    f.position.set(QUAY_X - 0.06, FH / 2, 0);
    scene.add(f);
    for (let z = -Z_END; z <= Z_END; z += 3) b.add(new THREE.CylinderGeometry(0.04, 0.04, FH + 0.05, 6), m.steelDark, QUAY_X - 0.06, FH / 2 + 0.02, z);
    b.add(worldBox(0.06, 0.06, 2 * Z_END, 2), m.steelDark, QUAY_X - 0.06, FH + 0.02, 0);
  }
  deco(QUAY_X, -2.4, -Z_END - 12, QUAY_X + 0.6, 0, Z_END + 12, m.dockWall, 2.4);
  // The ship-to-shore crane on the sea quay at mid-field: legs (they collide), portal beams and the
  // boom out over the water (out of reach), the trolley and a container hung from it.
  const CR = 26;
  for (const x of [37.2, 43.2]) for (const z of [-9, 9]) solid(x - 0.5, 0, z - 0.5, x + 0.5, CR, z + 0.5, m.crane, 'metal', 2);
  for (const x of [37.2, 43.2]) deco(x - 0.5, 3.2, -9, x + 0.5, 4, 9, m.crane, 2);
  for (const z of [-9, 9]) deco(30, CR, z - 0.6, 110, CR + 1.8, z + 0.6, m.crane, 2);
  deco(36, CR + 1.8, -9.6, 44.4, CR + 5, 9.6, m.crane, 2);
  deco(52, CR - 2.2, -2, 56, CR, 2, m.steelDark, 1);
  deco(51, CR - 9.5, -CONT.W / 2, 51 + CONT.L, CR - 6.9, CONT.W / 2, m.rust, CONT.H);
  for (const [x, z] of [[52, -0.9], [52, 0.9], [56, -0.9], [56, 0.9]]) b.add(new THREE.BoxGeometry(0.05, 4.4, 0.05), m.steelDark, x, CR - 4.5, z);
  // Rails for the crane along the sea quay.
  for (const x of [37.2, 43.2]) deco(x - 0.08, 0, -Z_END, x + 0.08, 0.02, Z_END, m.steelDark, 2);

  // ---------------------------------------------------------------- the yards (spawns)
  // Brick walls 2.4 m; exits only at the sides (z 54.2–57.8), the apron's cover in front of each.
  const YW = 2.4;
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const [w0, w1] = zr(BASE.z0, BASE.z0 + 0.9);
    solid(BASE.x0 - 0.9, 0, w0, BASE.x1 + 0.9, YW, w1, m.brick, 'concrete', 2);
    for (const [x0, x1] of [[BASE.x0 - 0.9, BASE.x0], [BASE.x1, BASE.x1 + 0.9]] as const) {
      let [a, c] = zr(BASE.z0 + 0.9, 54.2);
      solid(x0, 0, a, x1, YW, c, m.brick, 'concrete', 2);
      [a, c] = zr(57.8, Z_END);
      solid(x0, 0, a, x1, YW, c, m.brick, 'concrete', 2);
    }
    deco(BASE.x0 - 0.95, YW, w0 - 0.05, BASE.x1 + 0.95, YW + 0.12, w1 + 0.05, m.stone, 1);
  }
  low2(-22, 45, -19, 46.2, 1.0, m.crate, 'wood');
  low2(-30, 50, -27.6, 51, 0.95, m.stone);
  low2(20.4, 44, 23, 45.2, 1.0, m.crate, 'wood');
  low2(-8, 44.6, -4, 45.2, 0.95, m.stone);
  low2(4, 47.6, 8, 48.2, 0.95, m.stone);

  // ---------------------------------------------------------------- scenery beyond the fence
  // The sea, a breakwater with a lighthouse, a far shore in the haze, a ship at anchor.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x3e5a66, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(QUAY_X + 700.6, -1.5, 0);
  water.receiveShadow = true;
  water.name = 'water';
  scene.add(water);
  deco(150, -2, -260, 160, 2.2, 140, m.stone, 6);
  b.add(new THREE.CylinderGeometry(2.2, 3, 16, 16), m.paintWhite, 155, 10, 146);
  b.add(new THREE.CylinderGeometry(2.6, 2.6, 2.4, 16), m.rust, 155, 19, 146);
  for (let i = 0; i < 9; i++) deco(520 + i * 30, -2, -500 + i * 110, 600 + i * 30, 18 + ((i * 37) % 30), -390 + i * 110, m.stone, 20);
  deco(260, -1.5, 60, 272, 6, 150, m.hull, 6);
  deco(262, 6, 64, 270, 14, 74, m.house, 4);
  for (let z = 80; z < 146; z += 6.5) deco(261, 6, z, 271, 6 + 2.6 * (1 + ((z * 7) % 3)), z + 6, boxes[Math.round(z) % boxes.length], CONT.H);
  // Chimneys and roofs beyond the boundary buildings (south, north, west).
  for (const s of [1, -1]) for (const [x, h] of [[-30, 26], [8, 22], [30, 30]]) b.add(new THREE.CylinderGeometry(1.1, 1.5, h, 12), m.brickB, x, h / 2, s * (Z_END + 24));
  for (const s of [1, -1]) for (let x = -60; x < 40; x += 18) deco(x, 0, s > 0 ? Z_END + 14 : -Z_END - 34, x + 16, 15 + ((x + 60) % 7), s > 0 ? Z_END + 34 : -Z_END - 14, tones[Math.abs(x) % 3], 2);
  for (let z = -60; z < 60; z += 20) deco(X_W - 32, 0, z, X_W - 12, 16 + (Math.abs(z) % 6), z + 18, tones[Math.abs(z / 20) % 3], 2);

  // 23.0: micro-cover, instanced (one mesh per prop for the whole map): Jersey barriers and drums,
  // waist-high and vaultable, on the lanes' approaches (OldPortLayout.BARRIERS, BARRELS; both halves).
  {
    const barrier = new THREE.BoxGeometry(2.2, 1.0, 0.6).toNonIndexed();
    const p = barrier.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.37);
    barrier.computeVertexNormals();
    barrier.translate(0, 0.5, 0);
    const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12);
    drum.translate(0, 0.45, 0);
    const bm: THREE.Matrix4[] = [], dm: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), yAxis = v(0, 1, 0), one = v(1, 1, 1);
    for (const [x, z0, along, y = 0] of BARRIERS) for (const z of [z0, -z0]) {
      bm.push(new THREE.Matrix4().compose(v(x, y, z), q.setFromAxisAngle(yAxis, along === 'x' ? 0 : Math.PI / 2), one));
      const [hx, hz] = along === 'x' ? [1.1, 0.3] : [0.3, 1.1];
      col.add(x - hx, y, z - hz, x + hx, y + 1.0, z + hz, 'concrete').vault = true;
    }
    for (const [x, z0, y = 0] of BARRELS) for (const z of [z0, -z0]) {
      dm.push(new THREE.Matrix4().compose(v(x, y, z), q.set(0, 0, 0, 1), one));
      col.addCylinder(x, z, 0.3, y, y + 0.9, 'metal').vault = true;
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(geo, mat, ms.length);
      ms.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = true;
      im.name = 'microCover';
      scene.add(im);
    };
    inst(barrier, std(null, 0xc9c3b6, 0.92, 0, 0.35), bm);
    inst(drum, std(null, 0x5f7f86, 0.6, 0.35, 0.5), dm);
  }

  b.build(scene);
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---------------------------------------------------------------- navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const drops: [number, number][] = [];
  const open = (x: number, y: number, z: number) => !col.blocked(v(x, y, z), 0.6);
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.2 * 1.2) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  const chain = (...ids: number[]) => {
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
  };
  const SX = (WH_STAIR.x0 + WH_STAIR.x1) / 2;
  for (const s of [1, -1]) {
    const Z = (z: number) => z * s;
    // Yard exits.
    for (const sx of [-1, 1]) {
      N(sx * (BASE.x1 - 1.6), 0, Z(56));
      N(sx * (BASE.x1 + 2), 0, Z(56));
    }
    // Warehouse doors (both sides of each), the bay, the end doors.
    for (const z of [0, 22]) {
      N(WH.x1 + 1.2, 0, Z(z));
      N(WH.x1 - 1.4, 0, Z(z));
    }
    N(-35.5, 0, Z(WH.z + 1.4));
    N(-35.5, 0, Z(WH.z - 1.6));
    // The interior stair: in front of the foot, the middle, the top.
    chain(N(SX, 0, Z(WH_STAIR.zFoot + 1.4)), N(SX, UP / 2, Z((WH_STAIR.zFoot + WH_STAIR.zTop) / 2)), N(SX, UP, Z(WH_STAIR.zTop - 1.2)));
    // The fire stair: foot, middle, landing, the door inside.
    chain(N((FIRE.x0 + FIRE.x1) / 2, 0, Z(FIRE.zFoot - 1.3)), N((FIRE.x0 + FIRE.x1) / 2, UP / 2, Z((FIRE.zFoot + FIRE.zTop) / 2)), N((FIRE.x0 + FIRE.x1) / 2, UP, Z(FIRE.zDoor)), N(WH.x1 - 1.3, UP, Z(FIRE.zDoor)));
    // Drops through the hole in the middle (from both long sides) into the hall.
    for (const x of [ATRIUM.x0 - 1, ATRIUM.x1 + 1]) drops.push([N(x, UP, Z(2.5)), N(x + (x < ATRIUM.x0 ? 3 : -3), 0, Z(2.5))]);
    // THE STACKS: their stair; STACK B's stair; drops off their mid-field edges.
    chain(N(STACKS.x0 + 1.2, 0, Z(STACKS.z1 + 10.3)), N(STACKS.x0 + 1.2, STACKS.top / 2, Z(STACKS.z1 + 4.75)), N(STACKS.x0 + 1.2, STACKS.top, Z(STACKS.z1 - 1)));
    chain(N(STACK_B.x1 + 10.3, 0, Z(20.8)), N(STACK_B.x1 + 4.8, STACKS.top / 2, Z(20.8)), N(STACK_B.x1 - 1, STACKS.top, Z(20.8)));
    for (const x of [-17, -13.5]) drops.push([N(x, STACKS.top, Z(STACKS.z0 + 0.8)), N(x, 0, Z(STACKS.z0 - 1.6))]);
    chain(N(STACKS.x1 - 1.2, 0, Z(STACKS.z0 - 10.7)), N(STACKS.x1 - 1.2, STACKS.top / 2, Z(STACKS.z0 - 4.75)), N(STACKS.x1 - 1.2, STACKS.top, Z(STACKS.z0 + 1.2)));
    drops.push([N(STACK_B.x0 + 3, STACKS.top, Z(STACKS.z0 + 0.8)), N(STACK_B.x0 + 3, 0, Z(STACKS.z0 - 1.6))]);
    for (let x = STACKS.x0 + 1; x <= STACKS.x1 - 1; x += 2.5) for (const z of [STACKS.z0 + 1.2, STACKS.z1 - 1.2]) N(x, STACKS.top, Z(z));
    for (let x = WALK.x0 + 1; x < WALK.x1; x += 2.6) N(x, STACKS.top, Z(20.4));
    for (const z of [STACKS.z0 + 1.2, STACKS.z1 - 1.2]) N(STACK_B.x0 + 3, STACKS.top, Z(z));
    // The dry dock: the end stairs (top on the end wall, middle, foot), drops off both quays.
    for (const x of [DOCK.x0 + 1.27, DOCK.x1 - 1.27]) chain(N(x, 0, Z(DOCK.z + 0.6)), N(x, DOCK.floor / 2, Z(33.2)), N(x, DOCK.floor, Z(27.2)));
    // (23.0: the drops moved from 18 and 24 to 11 and 19.3: between the scaffold towers, clear of the
    // crane legs, the cargo stacks and the sacks.)
    for (const z of [11, 19.3]) {
      drops.push([N(DX0 - 0.6, 0, Z(z)), N(DOCK.x0 + 1.4, DOCK.floor, Z(z))]);
      drops.push([N(DX1 + 0.6, 0, Z(z)), N(DOCK.x1 - 1.4, DOCK.floor, Z(z))]);
    }
    // The ship: gangways (quay, mid, deck), the bridge stairs (foot, middle, roof).
    const gz = Z(S.gz);
    chain(N(20.6, 0, gz), N(24.3, 0.5, gz), N(S.x0 + 1, S.deck, gz));
    chain(N(39.4, 0, gz), N(35.7, 0.5, gz), N(S.x1 - 1, S.deck, gz));
    chain(N(30, S.deck, Z(10)), N(30, (S.deck + H.roof) / 2, Z(5.75)), N(30, H.roof, Z(H.z - 1)));
    chain(N(30, DOCK.floor, Z(S.z + 12)), N(30, (DOCK.floor + S.deck) / 2, Z(S.z + 5.5)), N(30, S.deck, Z(S.z - 1)));
    // 23.0, THE SPINE: through its gates, up its stair, drops off its top.
    for (const [g0, g1] of GATES) for (const z of [1.5, 3]) N((g0 + g1) / 2, 0, Z(z));
    const sx = (SPINE_STAIR.x0 + SPINE_STAIR.x1) / 2;
    chain(N(sx, 0, Z(SPINE_STAIR.z1 + 0.9)), N(sx, SPINE.top / 2, Z((SPINE_STAIR.z0 + SPINE_STAIR.z1) / 2)), N(sx, SPINE.top, Z(0.3)));
    for (const x of [-19, -9.5, 2.5, 12]) drops.push([N(x, SPINE.top, Z(0.6)), N(x, 0, Z(SPINE.z + 1.4))]);
    // Round the keel block into the pocket at the dock's head (the lattice steps over the gap).
    for (const x of [28.1, 31.9]) for (const z of [29.5, 32.2, 35]) N(x, DOCK.floor, Z(z));
  }
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // The spine's top (the bridges over the gates included).
  for (let x = SPINE.x0 + 1; x <= SPINE.x1 - 1; x += 2.5) N(x, SPINE.top, 0);
  for (const [g0, g1] of GATES) N((g0 + g1) / 2, 0, 0);
  // Lattices: the ground (4 m), the upper floor (3 m), the dock floor and the deck (2.5 m).
  for (let x = X_W + 2; x <= QUAY_X - 1.5; x += 4) {
    for (let z = -Z_END + 2; z <= Z_END - 2; z += 4) {
      if (x > DX0 - 0.6 && x < DX1 + 0.6 && Math.abs(z) < DZ + 0.6) continue;
      if (open(x, 0, z)) N(x, 0, z);
    }
  }
  for (let x = WHI.x0 + 1.5; x < WHI.x1 - 1; x += 3) {
    for (let z = -WHI.z + 1.5; z < WHI.z - 1; z += 3) {
      const inHole = [...stairHoles, atrium].some((h) => x > h[0] - 0.6 && x < h[2] + 0.6 && z > h[1] - 0.6 && z < h[3] + 0.6);
      if (!inHole && open(x, UP, z)) N(x, UP, z);
    }
  }
  for (const x of [DOCK.x0 + 1.3, 30, DOCK.x1 - 1.3]) for (let z = -DOCK.z + 2; z <= DOCK.z - 2; z += 2.5) if (open(x, DOCK.floor, z)) N(x, DOCK.floor, z);
  // 23.0: the passages round the new blockers (the lattices step over them).
  for (const [x, y, z] of PASSAGES) for (const sz of [z, -z]) N(x, y, sz);
  for (const x of [S.x0 + 0.9, S.x1 - 0.9]) for (let z = -S.z + 1; z <= S.z - 1; z += 2.5) if (open(x, S.deck, z)) N(x, S.deck, z);
  for (const x of [H.x0 + 0.5, 30, H.x1 - 0.5]) for (const z of [-1.5, 0, 1.5]) N(x, H.roof, z);

  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!open(p.x, p.y, p.z)) laneProblems.push(`${t} ${p.x},${p.y},${p.z}`);

  const testGoals = [
    v(-41.5, UP, 0), v(-36, UP, 18), v(-30, UP, -26), v(-36, 0, 12), v(-36, 0, -16), v(-24.5, 0, 18),
    v(-14, STACKS.top, 20.4), v(-2, STACKS.top, -20.4), v(5, STACKS.top, 20.4), v(7.5, 0, 0), v(-14.2, 0, 0), v(-4, SPINE.top, 0), v(-12, 0, -26),
    v(25.8, DOCK.floor, 0), v(34.2, DOCK.floor, -20), v(30, S.deck, 12), v(30, H.roof, 0), v(40, 0, 0), v(40, 0, -22), v(21, 0, -40),
  ];
  const survival: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    for (const [x, y, z] of [[-36, 0, 18], [-41.5, UP, 10], [-24.5, 0, 30], [-14, 0, 28], [6, 0, 26], [12, 0, 6], [21, 0, 26], [34, DOCK.floor, 22], [40, 0, 20], [-30, 0, 44], [30, 0, 46]] as const) {
      survival.push(v(x, y, s * z));
    }
  }

  return {
    nav: { nodes, links, drops, slope: 0 },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    survival,
    testGoals,
    zoneAt,
    shafts,
    covered: [
      { x0: WHI.x0, z0: -WHI.z, x1: WHI.x1, z1: WHI.z, y0: -1, h: UP - WH.slab },
      { x0: WHI.x0, z0: -WHI.z, x1: WHI.x1, z1: WHI.z, y0: UP - 0.5, h: WH.eave },
    ],
    water,
    laneProblems,
  };
}
