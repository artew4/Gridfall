import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import { carve } from '../oldport/OldPort';
import {
  AISLE, BAL, BASE, BRIDGE, BRIDGE_DROPS, CAR, CARS, DOORS, DOOR_H, DOOR_W, ELEV, ELEVATORS, ESC_E, ESC_MID, ESC_W, EXITS, EXIT_W, GANGWAY, GAP,
  MEZ, MEZ_DROP, TRACK, TRACK_STAIR, TRAIN, UP, X_HALL, YARD_H, Z_END, doorIn, doorOut, lanesOf, spawnsOf, zoneAt,
} from './MaglevLayout';
import { concretePanelTexture, departuresTexture, floorTileTexture, ribbedTexture, towerTexture, trackBedTexture, wayfindingSign } from './textures';
import type { Zone } from '../Level';

/*
  Builds Maglev Terminal (the plan is in MaglevLayout.ts). The 3.3 rules hold:
   - every box is drawn and collided with the same bounds (StaticBuilder + col.add);
   - stairs and escalators are a smooth ramp over stepped fill, plated sides, fitted clear of walls;
   - the boundary beats the best jump: 16 m glass curtain walls (solid), 16 m end walls, 3.2 m yard
     walls; the highest floors (the mezzanine, balconies and bridges, 5 m) are railed;
   - gaps are under 0.3 m or over 1 m; low cover that may be vaulted (≤ 1.05 m) is flagged `vault`.

  The glass (18.0, the thermal limits): no transmission, no refraction, no MeshPhysicalMaterial. Every
  pane is a MeshStandardMaterial with transparent: true, opacity 0.18–0.45, depthWrite off, its
  "reflection" the scene's static environment map (one PMREM of the sky, made once at load). The
  panes are merged per material (the whole roof is one draw call, the curtain walls one more), cast no
  shadow (the sun comes through them; the steel frames cast the hall's shadows), and the windows of
  the train are opaque tinted glass (no transparency at all: nothing is sorted, and nobody is seen
  through a pane a bullet can't pass).
*/

export interface MaglevResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Under a roof (rooms the viewmodel is shaded in): the cars, under the mezzanine and balconies. */
  covered: { x0: number; z0: number; x1: number; z1: number; y0: number; h: number }[];
  /** The point lights (the cars' ceilings): pooled with the rest by the engine. */
  lights: THREE.PointLight[];
  /** Transparent panes (for the DEV glass check and the 4.0/F8 toggle). */
  glass: THREE.Material[];
  laneProblems: string[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type R = [number, number, number, number];

export function buildMaglev(scene: THREE.Scene, col: CollisionWorld): MaglevResult {
  const b = new StaticBuilder();
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.6, metal = 0, env = 0.6) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  /** A pane: standard material, transparent, no depth write; the environment map is its reflection. */
  const pane = (color: number, opacity: number, env = 1.1) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.15, transparent: true, opacity, depthWrite: false, envMapIntensity: env, side: THREE.DoubleSide });
  const panel = concretePanelTexture();
  // The palette (the header of MaglevLayout and docs/LEVELS.md): white concrete, pale polished stone,
  // white gloss plastic, brushed steel, one corporate teal; dark tinted glass on the train.
  const m = {
    concrete: std(panel, 0xffffff, 0.75, 0, 0.4),
    floor: std(floorTileTexture('light'), 0xffffff, 0.32, 0, 0.7),
    floorGrey: std(floorTileTexture('grey'), 0xffffff, 0.36, 0, 0.6),
    track: std(trackBedTexture(), 0xffffff, 0.9, 0, 0.25),
    trackWall: std(panel, 0xb9bab8, 0.8, 0, 0.3),
    beam: std(null, 0x5d6267, 0.5, 0.5, 0.5),
    steel: std(null, 0xa7aeb5, 0.32, 0.85, 0.9),
    steelDark: std(null, 0x50565c, 0.4, 0.7, 0.6),
    white: std(null, 0xf1f1ef, 0.22, 0.05, 0.8),
    offWhite: std(null, 0xdcdcd8, 0.4, 0.02, 0.6),
    teal: std(null, 0x1f9fb0, 0.35, 0.1, 0.6),
    rubber: std(null, 0x2a2d30, 0.85, 0, 0.2),
    tint: std(null, 0x1d262e, 0.06, 0.6, 1.4),
    escalator: std(ribbedTexture(), 0xffffff, 0.4, 0.6, 0.6),
    planter: std(null, 0xcfd0cc, 0.6, 0, 0.4),
    leaves: std(null, 0x5f7f52, 0.85, 0, 0.2),
    tower0: std(towerTexture(0), 0xffffff, 0.3, 0.3, 1.0),
    tower1: std(towerTexture(1), 0xffffff, 0.3, 0.3, 1.0),
    plaza: std(floorTileTexture('grey'), 0xd8d8d4, 0.5, 0, 0.4),
  };
  // Light strips and the boards light themselves (emissive, no light source).
  const strip = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f8ff, emissiveIntensity: 1.6, roughness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x5fe4f0, emissive: 0x3fd6e6, emissiveIntensity: 2.2, roughness: 0.4 });
  const cabinStrip = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f8ff, emissiveIntensity: 0.55, roughness: 0.4 });
  const board = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: departuresTexture(), emissiveIntensity: 1.1, roughness: 0.3 });
  // Inside the cars: the white plastic carries a faint cool emissive, the light the ceiling strips and
  // the pale floor throw round a small bright room (ADR-0054: bounce for daylight interiors).
  const cabin = m.white.clone();
  cabin.emissive.setHex(0xe8eef4);
  cabin.emissiveIntensity = 0.32;
  const cabinFloor = m.floorGrey.clone();
  cabinFloor.emissive.setHex(0x8f969c);
  cabinFloor.emissiveIntensity = 0.3;
  cabinFloor.emissiveMap = cabinFloor.map;
  const seat = std(null, 0x2f6f7a, 0.7, 0, 0.3);
  seat.emissive.setHex(0x1c4a52);
  seat.emissiveIntensity = 0.25;
  const glassRoof = pane(0xd4e6ee, 0.18, 1.0);
  const glassWall = pane(0xcfe2ea, 0.3, 1.2);
  const glassFrost = pane(0xe6eef2, 0.45, 0.8);
  const glassMats = [glassRoof, glassWall, glassFrost];

  // ---------------------------------------------------------------- helpers
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** Both halves (z → -z). */
  const solid2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => [
    solid(x0, y0, z0, x1, y1, z1, mat, surface, tile),
    solid(x0, y0, -z1, x1, y1, -z0, mat, surface, tile),
  ];
  /** Something only seen (inside a collider, or out of reach). */
  const deco = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2) =>
    b.add(worldBox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const deco2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2) => {
    deco(x0, y0, z0, x1, y1, z1, mat, tile);
    deco(x0, y0, -z1, x1, y1, -z0, mat, tile);
  };
  /** Waist-high cover (vault it if ≤ 1.05 m), both halves. */
  const low2 = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', y = 0) => {
    for (const c of solid2(x0, y, z0, x1, y + h, z1, mat, surface, 1)) c.vault = h <= 1.05;
  };
  const cyl = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', seg = 20) => {
    b.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y0 + h / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + h, surface);
  };
  /**
   * A stair or a non-functioning escalator: the walked surface is a smooth ramp over stepped fill;
   * drawn as steps (`ribbed` false) or as one ribbed incline between steel balustrades (`ribbed`).
   * Side plates (rails) on 'lo'/'hi' across the run.
   */
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = [], ribbed = false) => {
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[maglev stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const w0 = (along ? z0 : x0) + (rails.includes('lo') ? STAIR_GAP : 0);
    const w1 = (along ? z1 : x1) - (rails.includes('hi') ? STAIR_GAP : 0);
    if (ribbed) {
      // The incline (the treads, ribbed along the run), a white skirt under it to the floor.
      const len = Math.hypot(L, H), ang = Math.atan2(H, L) * rise;
      const g = worldBox(along ? len : w1 - w0, 0.1, along ? w1 - w0 : len, 1);
      const cx = along ? (x0 + x1) / 2 : (w0 + w1) / 2, cz = along ? (w0 + w1) / 2 : (z0 + z1) / 2;
      if (along) b.add(g, m.escalator, cx, base + H / 2 - 0.05, cz, 0, 0, ang);
      else b.add(g, m.escalator, cx, base + H / 2 - 0.05, cz, -ang, 0, 0);
      g.dispose();
      // The skirt: stepped white panels under the incline (seen; the stepped fill collides).
      const n = 8;
      for (let i = 0; i < n; i++) {
        const h = (H * (i + 0.5)) / n - 0.1;
        if (h <= 0.05) continue;
        const a = rise > 0 ? (L * i) / n : L - (L * (i + 1)) / n;
        const p0 = (along ? x0 : z0) + a;
        if (along) deco(p0, base, w0, p0 + L / n, base + h, w1, m.offWhite, 2);
        else deco(w0, base, p0, w1, base + h, p0 + L / n, m.offWhite, 2);
      }
    } else {
      const steps = Math.max(2, Math.round(H / 0.25));
      const run = L / steps;
      for (let i = 0; i < steps; i++) {
        const hTop = ((i + 1) * H) / steps;
        const a = rise > 0 ? i * run : L - (i + 1) * run;
        const p0 = (along ? x0 : z0) + a;
        if (along) b.add(worldBox(run, hTop, w1 - w0, 1), mat, p0 + run / 2, base + hTop / 2, (w0 + w1) / 2);
        else b.add(worldBox(w1 - w0, hTop, run, 1), mat, (w0 + w1) / 2, base + hTop / 2, p0 + run / 2);
      }
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
    // Side plates (an escalator's balustrade: steel, frosted glass over it is drawn on the plate).
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
          solid(lo0, base, f, lo1, hi, f + t, ribbed ? m.steel : m.steelDark, 'metal', 1);
        } else {
          const f = side === 'lo' ? x0 : x1 - t;
          solid(f, base, lo0, f + t, hi, lo1, ribbed ? m.steel : m.steelDark, 'metal', 1);
        }
      }
    }
  };
  /** A stair and its mirror (a z-axis stair rises the other way in the north half). */
  const stair2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = [], ribbed = false) => {
    stair(x0, z0, x1, z1, axis, rise, base, top, mat, rails, ribbed);
    stair(x0, -z1, x1, -z0, axis, axis === 'z' ? (-rise as 1 | -1) : rise, base, top, mat, rails, ribbed);
  };
  /**
   * A 1.05 m balustrade on a floor at `y` (a fall: not vaultable): a steel plate collides; frosted
   * glass is drawn over its upper part, with a steel cap.
   */
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const c = col.add(x0, y, z0, x1, y + 1.05, z1, 'metal');
    c.vault = false;
    deco(x0, y, z0, x1, y + 0.12, z1, m.steelDark, 1);
    deco(x0, y + 0.12, z0, x1, y + 0.98, z1, glassFrost, 1);
    deco(x0 - 0.01, y + 0.98, z0 - 0.01, x1 + 0.01, y + 1.05, z1 + 0.01, m.steel, 1);
    return c;
  };
  const rail2 = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    rail(x0, z0, x1, z1, y);
    rail(x0, -z1, x1, -z0, y);
  };
  /** A rail along x at z (thickness 0.08 towards +z), with gaps (x ranges) left open. */
  const railX = (x0: number, x1: number, z: number, y: number, gaps: [number, number][] = []) => {
    let cur = x0;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      if (g0 > cur) rail(cur, z, g0, z + 0.08, y);
      cur = Math.max(cur, g1);
    }
    if (x1 > cur) rail(cur, z, x1, z + 0.08, y);
  };
  /** A rail along z at x (thickness 0.08 towards +x), with gaps (z ranges) left open. */
  const railZ = (z0: number, z1: number, x: number, y: number, gaps: [number, number][] = []) => {
    let cur = z0;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      if (g0 > cur) rail(x, cur, x + 0.08, g0, y);
      cur = Math.max(cur, g1);
    }
    if (z1 > cur) rail(x, cur, x + 0.08, z1, y);
  };
  interface Opening { at: number; w: number; y0: number; y1: number }
  /** A wall with openings (as Old Port's): along x it spans [a0, a1] at z ∈ [c0, c1]; along z, [a0, a1] in z at x ∈ [c0, c1]. */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, y0: number, h: number, mat: THREE.Material, openings: Opening[], surface: Collider['surface'] = 'concrete') => {
    const piece = (p0: number, p1: number, ya: number, yb: number) => {
      if (p1 - p0 < 0.01 || yb - ya < 0.01) return;
      if (alongX) solid(p0, ya, c0, p1, yb, c1, mat, surface, 2);
      else solid(c0, ya, p0, c1, yb, p1, mat, surface, 2);
    };
    let cur = a0;
    for (const o of openings.slice().sort((p, q) => p.at - q.at)) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, y0, y0 + h);
      piece(o0, o1, y0, o.y0);
      piece(o0, o1, o.y1, y0 + h);
      cur = o1;
    }
    piece(cur, a1, y0, y0 + h);
  };
  /** A slab of floor (top at y) over a rectangle minus holes. */
  const slab = (r: R, holes: R[], y: number, th: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
    for (const [x0, z0, x1, z1] of carve(r, holes)) solid(x0, y - th, z0, x1, y, z1, mat, surface, 4);
  };
  /** Paving (seen only: the floor is the terrain). */
  const pave = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0, tile = 4.8) => deco(x0, y - 0.3, z0, x1, y, z1, mat, tile);
  const paint = new THREE.MeshStandardMaterial({ color: 0xbfc4c6, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  const paintTeal = new THREE.MeshStandardMaterial({ color: 0x1f9fb0, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });

  const TX0 = TRACK.x0 - TRACK.wall, TX1 = TRACK.x1 + TRACK.wall, TZ = TRACK.z + TRACK.wall;
  const F = TRAIN.floor;

  // ---------------------------------------------------------------- the floor
  for (const [x0, x1] of [[-X_HALL, -TX1], [-TX0, TX0], [TX1, X_HALL]] as const) pave(x0, -Z_END, x1, Z_END, m.floor);
  for (const s of [1, -1]) {
    pave(-TX1, s > 0 ? TZ : -Z_END, -TX0, s > 0 ? Z_END : -TZ, m.floor);
    pave(TX0, s > 0 ? TZ : -Z_END, TX1, s > 0 ? Z_END : -TZ, m.floor);
  }
  // The guideway under the train: a dark channel and a cyan line (paint on the floor), the platform
  // edges' tactile lines, the walking lines to the escalators.
  deco(-2.1, 0, -TRAIN.nose - 1, 2.1, 0.004, TRAIN.nose + 1, m.rubber, 2);
  for (const x of [-1.2, 1.15]) deco(x, 0.004, -TRAIN.nose - 1, x + 0.05, 0.008, TRAIN.nose + 1, glow, 1);
  for (const sx of [1, -1]) {
    deco(sx > 0 ? 2.5 : -2.8, 0, -TRAIN.nose - 2, sx > 0 ? 2.8 : -2.5, 0.006, TRAIN.nose + 2, paint, 2);
    deco(sx > 0 ? TX0 - 0.7 : -TX0 + 0.4, 0, -TZ, sx > 0 ? TX0 - 0.4 : -TX0 + 0.7, 0.006, TZ, paint, 2);
    deco(sx > 0 ? TX1 + 0.4 : -TX1 - 0.7, 0, -TZ, sx > 0 ? TX1 + 0.7 : -TX1 - 0.4, 0.006, TZ, paint, 2);
  }
  for (const s of [1, -1]) deco(-0.15, 0, s > 0 ? TRAIN.nose + 1 : -BASE.z0, 0.15, 0.006, s > 0 ? BASE.z0 : -TRAIN.nose - 1, paintTeal, 2);

  // ---------------------------------------------------------------- the hall: glass walls, end walls, roof
  const ROOF = 16;
  // The curtain walls (solid: a body never passes; drawn as glass between steel mullions every 3 m
  // and transoms every 4 m, a white concrete plinth).
  for (const sx of [1, -1]) {
    const [c0, c1] = sx > 0 ? [X_HALL - 0.1, X_HALL + 0.4] : [-X_HALL - 0.4, -X_HALL + 0.1];
    col.add(c0, 0, -Z_END, c1, ROOF, Z_END, 'metal').vault = false;
    const xf = sx * (X_HALL + 0.15);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * Z_END, ROOF - 0.5), glassWall);
    g.rotation.y = Math.PI / 2;
    g.position.set(xf, 0.5 + (ROOF - 0.5) / 2, 0);
    g.name = 'glass-wall';
    scene.add(g);
    deco(c0, 0, -Z_END, c1, 0.5, Z_END, m.concrete, 2);
    for (let z = -Z_END; z <= Z_END + 0.01; z += 3) deco(xf - 0.08, 0.5, z - 0.08, xf + 0.08, ROOF, z + 0.08, m.steel, 1);
    for (const y of [4, 8, 12, ROOF - 0.15]) deco(xf - 0.1, y - 0.08, -Z_END, xf + 0.1, y + 0.08, Z_END, m.steel, 2);
  }
  // End walls: white concrete, the departures boards over the yards, the platform signs.
  for (const s of [1, -1]) {
    const [z0, z1] = s > 0 ? [Z_END, Z_END + 0.5] : [-Z_END - 0.5, -Z_END];
    solid(-X_HALL - 0.4, 0, z0, X_HALL + 0.4, ROOF + 0.5, z1, m.concrete, 'concrete', 4);
    // The board in front of its steel frame, the frame on the wall.
    const brd = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), board);
    brd.position.set(0, 9.5, s * (Z_END - 0.12));
    brd.rotation.y = s > 0 ? Math.PI : 0;
    scene.add(brd);
    deco(-6.2, 6.3, s * (Z_END - 0.1), 6.2, 12.7, s * Z_END, m.steelDark, 1);
  }
  // The roof: one glass plane (one draw call) on a steel grid: trusses across every 12 m, purlins
  // every 4 m, three spines along. The grid is what the sun draws on the floor (the hall's shadows).
  {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * X_HALL + 1, 2 * Z_END + 1), glassRoof);
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, ROOF + 0.9, 0);
    g.name = 'glass-roof';
    scene.add(g);
    for (let z = -Z_END; z <= Z_END + 0.01; z += 12) deco(-X_HALL - 0.4, ROOF - 0.2, z - 0.25, X_HALL + 0.4, ROOF + 0.85, z + 0.25, m.white, 2);
    for (let z = -Z_END + 4; z < Z_END; z += 4) if (Math.round(z) % 12) deco(-X_HALL, ROOF + 0.55, z - 0.08, X_HALL, ROOF + 0.85, z + 0.08, m.steel, 2);
    for (const x of [-X_HALL + 0.2, -10, 0, 10, X_HALL - 0.2]) deco(x - 0.2, ROOF + 0.3, -Z_END, x + 0.2, ROOF + 0.85, Z_END, m.white, 2);
  }
  // The columns carrying the roof: on the platforms by the track walls, white, steel bases.
  for (const sx of [1, -1]) for (const z of [6, 34]) for (const s of [1, -1]) {
    const x = sx * 10.5;
    cyl(x, s * z, 0.55, 0, ROOF - 0.2, m.white, 'concrete');
    deco(x - 0.65, 0, s * z - 0.65, x + 0.65, 0.35, s * z + 0.65, m.steel, 1);
    col.add(x - 0.65, 0, s * z - 0.65, x + 0.65, 0.35, s * z + 0.65, 'metal');
  }

  // ---------------------------------------------------------------- the yards (spawns)
  // White concourse walls 3.2 m (above a jump), three exits at the front; service blocks either
  // side of the yard to the glass walls (closed: the yard is the only way out).
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const [w0, w1] = zr(BASE.z0, BASE.z0 + 0.6);
    wall(true, BASE.x0 - 0.6, BASE.x1 + 0.6, w0, w1, 0, YARD_H, m.concrete, EXITS.map((x) => ({ at: x, w: EXIT_W, y0: 0, y1: 2.8 })));
    for (const [x0, x1] of [[BASE.x0 - 0.6, BASE.x0], [BASE.x1, BASE.x1 + 0.6]] as const) {
      const [a, c] = zr(BASE.z0 + 0.6, Z_END);
      solid(x0, 0, a, x1, YARD_H, c, m.concrete, 'concrete', 4);
    }
    // Service blocks (the station offices): solid to 6 m, a teal band and a strip light.
    for (const [x0, x1] of [[-X_HALL - 0.1, BASE.x0 - 0.6], [BASE.x1 + 0.6, X_HALL + 0.1]] as const) {
      const [a, c] = zr(BASE.z0, Z_END);
      solid(x0, 0, a, x1, 6, c, m.concrete, 'concrete', 4);
      const zf = s > 0 ? BASE.z0 - 0.02 : -BASE.z0 + 0.02;
      deco(x0, 3.0, Math.min(zf, zf + s * 0.04), x1, 3.4, Math.max(zf, zf + s * 0.04), m.teal, 1);
    }
    // A sign over each exit (the platform numbers), out of reach.
    for (const [x, num, en, jp] of [[-9, '1', 'PLATFORM 1 · TRACKS', '1番線'], [0, 'M', 'MAGLEV · ALL CARS', 'リニア 全車両'], [9, '2', 'PLATFORM 2 · MEZZANINE', '2番線・中二階']] as const) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: wayfindingSign(num, en, jp), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.35, emissiveMap: null }));
      (sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map;
      sign.position.set(x, 4.2, s > 0 ? BASE.z0 - 0.05 : -BASE.z0 + 0.05);
      sign.rotation.y = s > 0 ? Math.PI : 0;
      scene.add(sign);
      deco(x - 2.05, 3.65, s > 0 ? BASE.z0 - 0.04 : -BASE.z0 + 0.04, x + 2.05, 4.75, s > 0 ? BASE.z0 : -BASE.z0, m.steelDark, 1);
    }
  }
  // The yard's inner benches (low; the spawns stand clear of them).
  // (Against the end wall: a bench 0.6 m off it left a slot a body stuck in.)
  low2(-1.5, 59.3, 1.5, Z_END, 0.5, m.offWhite);

  // ---------------------------------------------------------------- the track beds (east and west)
  for (const sx of [1, -1]) {
    const X = (a: number, c: number): [number, number] => (sx > 0 ? [a, c] : [-c, -a]);
    // Walls (their tops are the platform; the carve lies inside them), end walls, the bed.
    for (const [a, c] of [[TX0, TRACK.x0], [TRACK.x1, TX1]] as const) {
      const [x0, x1] = X(a, c);
      solid(x0, TRACK.floor - 0.1, -TRACK.z, x1, 0, TRACK.z, m.trackWall, 'concrete', 4);
    }
    const [ex0, ex1] = X(TX0, TX1);
    solid2(ex0, TRACK.floor - 0.1, TRACK.z, ex1, 0, TZ, m.trackWall, 'concrete', 4);
    const [bx0, bx1] = X(TRACK.x0, TRACK.x1);
    deco(bx0, TRACK.floor - 0.3, -TRACK.z, bx1, TRACK.floor, TRACK.z, m.track, 4);
    // Coping on the edges (seen, flush).
    for (const a of [TX0, TRACK.x0 - 0.3, TRACK.x1, TX1 - 0.3]) {
      const [x0, x1] = X(a, a + 0.3);
      deco(x0, -0.02, -TZ, x1, 0.003, TZ, m.white, 2);
    }
    // The guideway beam down the middle (0.25: a step, walked over; the bed's nav runs along it).
    // (No buffer stops: one 0.3 m under the end wall's top was a ledge a body slipped onto and
    // couldn't step back up from: levelAI.)
    const [gx0, gx1] = X(16.2, 17.8);
    solid(gx0, TRACK.floor, -TRACK.z, gx1, TRACK.floor + 0.25, TRACK.z, m.beam, 'metal', 2);
    for (const x of [16.25, 17.7]) {
      const [a, c] = X(x, x + 0.05);
      deco(a, TRACK.floor + 0.25, -TRACK.z, c, TRACK.floor + 0.27, TRACK.z, glow, 1);
    }
    // Stairs: at both ends (inner and outer side, against the end walls) and the mid stairs on the
    // inner wall (the lane's way down and up), plated on the open side.
    const [i0, i1] = X(TRACK.x0 + 0.03, TRACK.x0 + TRACK_STAIR.w);
    const [o0, o1] = X(TRACK.x1 - TRACK_STAIR.w, TRACK.x1 - 0.03);
    stair2(i0, TRACK_STAIR.endFoot, i1, TRACK.z - 0.03, 'z', 1, TRACK.floor, 0, m.concrete, [sx > 0 ? 'hi' : 'lo']);
    stair2(o0, TRACK_STAIR.endFoot, o1, TRACK.z - 0.03, 'z', 1, TRACK.floor, 0, m.concrete, [sx > 0 ? 'lo' : 'hi']);
    stair2(i0, TRACK_STAIR.midFoot, i1, TRACK_STAIR.midTop, 'z', 1, TRACK.floor, 0, m.concrete, [sx > 0 ? 'hi' : 'lo']);
    // Railings on the walls' tops beside the stairs, open only where each stair arrives (its top end).
    // The bed is 1.5 m deep: a body on a stair sees over the wall and took a shortcut to a node beyond
    // it, then pushed into the wall's face (levelAI); and a platform walker can't step onto a stair's
    // side halfway up.
    for (const [a, c] of [[TX0, TRACK.x0], [TRACK.x1, TX1]] as const) {
      const [x0, x1] = X(a === TX0 ? c - 0.08 : a, a === TX0 ? c : a + 0.08);
      rail2(x0, TRACK_STAIR.endFoot, x1, TRACK.z - 0.5, 0);
    }
    {
      const [x0, x1] = X(TRACK.x0 - 0.08, TRACK.x0);
      rail2(x0, TRACK_STAIR.midFoot, x1, TRACK_STAIR.midTop - 1.4, 0);
    }
    // Cover in the bed: maintenance carts (vaulted), clear of the walls by over a metre (the 3.3 gap
    // rule: a cart 0.4 m off a wall left a slot a crouched body ended in; flush, it was a step out of
    // the bed onto the wall's top: both the stress test). Beside the guideway beam, which is walked on.
    {
      const [a, c] = X(18.2, 19.9);
      low2(a, 22, c, 25.2, 1.0, m.steelDark, 'metal', TRACK.floor);
      const [d, e] = X(14.1, 15.6);
      low2(d, 26, e, 28.6, 1.0, m.offWhite, 'metal', TRACK.floor);
      const [p, q] = X(18.2, 19.9);
      low2(p, 1.2, q, 4.2, 1.0, m.offWhite, 'metal', TRACK.floor);
    }
  }

  // ---------------------------------------------------------------- the platforms
  for (const sx of [1, -1]) {
    const X = (a: number, c: number): [number, number] => (sx > 0 ? [a, c] : [-c, -a]);
    // The kiosk at mid-field (full height cover: the platform's long sightline breaks here).
    {
      const [x0, x1] = X(6, 9);
      solid(x0, 0, -1.6, x1, 2.6, 1.6, m.white, 'concrete', 2);
      deco(x0 - 0.15, 2.6, -1.8, x1 + 0.15, 2.85, 1.8, m.teal, 1);
      deco(x0 - 0.15, 2.85, -1.8, x1 + 0.15, 2.95, 1.8, strip, 1);
    }
    // Planters (waist-high cover, vaulted), info totems, the bridge's columns.
    {
      const [x0, x1] = X(4.4, 6.6);
      low2(x0, 11.6, x1, 13, 0.95, m.planter);
      deco2(x0 + 0.15, 0.95, 11.75, x1 - 0.15, 1.0, 12.85, m.leaves, 1);
      const [p0, p1] = X(8, 10.2);
      low2(p0, 26.4, p1, 27.8, 0.95, m.planter);
      deco2(p0 + 0.15, 0.95, 26.55, p1 - 0.15, 1.0, 27.65, m.leaves, 1);
      const [t0, t1] = X(4.7, 5.3);
      solid2(t0, 0, 32.2, t1, 2.4, 33.4, m.white, 'concrete', 1);
      deco2(sx > 0 ? t0 - 0.01 : t1, 1.0, 32.3, sx > 0 ? t0 : t1 + 0.01, 2.2, 33.3, m.teal, 1);
      for (const s of [1, -1]) cyl(sx * 10.5, s * 20, 0.4, 0, UP - 0.3, m.white, 'concrete');
    }
    // Hanging platform signs (out of reach, seen only).
    for (const s of [1, -1]) {
      const [num, en, jp] = sx < 0 ? ['1', 'PLATFORM 1', '1番線 のりば'] : ['2', 'PLATFORM 2', '2番線 のりば'];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: wayfindingSign(num, en, jp), roughness: 0.5, side: THREE.DoubleSide }));
      sign.position.set(sx * 7, 4.1, s * 38);
      scene.add(sign);
      deco(sx * 7 - 0.03, 4.6, s * 38 - 0.03, sx * 7 + 0.03, ROOF, s * 38 + 0.03, m.steel, 1);
    }
  }
  // The aprons: low barriers at the gate line, benches.
  low2(-5.6, 38, -3.2, 38.6, 1.0, m.offWhite);
  low2(3.2, 38, 5.6, 38.6, 1.0, m.offWhite);
  low2(-18.6, 47, -15.6, 47.8, 0.95, m.planter);
  low2(15.6, 47, 18.6, 47.8, 0.95, m.planter);
  deco2(-18.45, 0.95, 47.1, -15.75, 1.0, 47.7, m.leaves, 1);
  deco2(15.75, 0.95, 47.1, 18.45, 1.0, 47.7, m.leaves, 1);

  // ---------------------------------------------------------------- the glass elevators
  // Static: an opaque base (doors shut) to 2.6 m, then a glass shaft with the car parked at the top
  // and a steel cap; one collider for the whole tower (it is cover, not a room).
  for (const [ex, ez] of ELEVATORS) for (const s of [1, -1]) {
    const z = s * ez, h = ELEV.half;
    col.add(ex - h, 0, z - h, ex + h, ELEV.top, z + h, 'metal').vault = false;
    deco(ex - h, 0, z - h, ex + h, ELEV.base, z + h, m.white, 2);
    deco(ex - h + 0.25, 0.1, z - h - 0.01, ex + h - 0.25, 2.3, z - h, m.steel, 1);
    deco(ex - h + 0.25, 0.1, z + h, ex + h - 0.25, 2.3, z + h + 0.01, m.steel, 1);
    deco(ex - h, ELEV.base, z - h, ex + h, ELEV.top - 0.2, z + h, glassFrost, 1);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) deco(ex + cx * h - (cx > 0 ? 0.12 : 0), ELEV.base, z + cz * h - (cz > 0 ? 0.12 : 0), ex + cx * h + (cx < 0 ? 0.12 : 0), ELEV.top - 0.2, z + cz * h + (cz < 0 ? 0.12 : 0), m.steel, 1);
    deco(ex - h + 0.15, 4.4, z - h + 0.15, ex + h - 0.15, 6.6, z + h - 0.15, m.offWhite, 1);
    deco(ex - h, ELEV.top - 0.2, z - h, ex + h, ELEV.top, z + h, m.steelDark, 1);
  }

  // ---------------------------------------------------------------- the east side: E', the mezzanine
  // The holes over the mid escalators run to the glass wall (a 10 cm sliver of slab left between them
  // caught a head walking down: the stress test).
  const midHoles: R[] = [[ESC_MID.x0, ESC_MID.top, MEZ.x1 - 0.1, ESC_MID.foot], [ESC_MID.x0, -ESC_MID.foot, MEZ.x1 - 0.1, -ESC_MID.top]];
  slab([MEZ.x0, -MEZ.z, MEZ.x1 - 0.1, MEZ.z], midHoles, UP, 0.3, m.concrete);
  // Its fascia (a white band with a strip light), its columns.
  // A downstand beam under the edge, flush with it (a thin fascia below the edge was a wall a body
  // dropping off the mezzanine could cross: the stress test); its white face and strip light drawn on it.
  solid(MEZ.x0, UP - 0.7, -MEZ.z, MEZ.x0 + 0.4, UP - 0.3, MEZ.z, m.concrete, 'concrete', 2);
  deco(MEZ.x0 - 0.012, UP - 0.7, -MEZ.z, MEZ.x0, UP - 0.3, MEZ.z, m.white, 2);
  deco(MEZ.x0 - 0.024, UP - 0.62, -MEZ.z, MEZ.x0 - 0.012, UP - 0.56, MEZ.z, strip, 2);
  for (const z of [12, 28]) for (const s of [1, -1]) cyl(23.5, s * z, 0.3, 0, UP - 0.3, m.steel, 'metal', 14);
  // The rails: the inner edge (open at the bridges and the drop gaps), the ends (open at the
  // escalators), round the mid escalators' holes.
  railZ(-MEZ.z, MEZ.z, MEZ.x0, UP, [[-BRIDGE.z1, -BRIDGE.z0], [-MEZ_DROP[1], -MEZ_DROP[0]], [MEZ_DROP[0], MEZ_DROP[1]], [BRIDGE.z0, BRIDGE.z1]]);
  for (const s of [1, -1]) {
    const z = s > 0 ? MEZ.z - 0.08 : -MEZ.z;
    railX(MEZ.x0, MEZ.x1 - 0.1, z, UP, [[ESC_E.x0, ESC_E.x1]]);
    // Round each hole: the long side towards the hall, the end over the escalator's foot.
    const [a, c] = s > 0 ? [ESC_MID.top, ESC_MID.foot] : [-ESC_MID.foot, -ESC_MID.top];
    rail(ESC_MID.x0 - 0.08, a, ESC_MID.x0, c, UP);
    const e = s > 0 ? ESC_MID.foot : -ESC_MID.foot - 0.08;
    rail(ESC_MID.x0, e, MEZ.x1 - 0.1, e + 0.08, UP);
  }
  // The escalators: the end ones from the aprons (rising towards mid-field), the mid ones from E'
  // along the glass wall (rising towards the middle). Ribbed treads, steel balustrades both sides.
  stair2(ESC_E.x0, ESC_E.top, ESC_E.x1, ESC_E.foot, 'z', -1, 0, UP, m.escalator, ['lo', 'hi'], true);
  stair2(ESC_MID.x0, ESC_MID.top, ESC_MID.x1, ESC_MID.foot, 'z', -1, 0, UP, m.escalator, ['lo'], true);
  // E' under the mezzanine: a café kiosk, vending machines, benches (cover), a strip light overhead.
  solid2(26, 0, 19.5, 29, 2.6, 24, m.white, 'concrete', 2);
  deco2(25.85, 2.6, 19.35, 29.15, 2.85, 24.15, m.teal, 1);
  solid2(29.1, 0, 26.5, 29.85, 1.9, 29.5, m.steelDark, 'metal', 1);
  deco2(29.08, 0.6, 26.6, 29.1, 1.8, 27.9, glow, 1);
  low2(24.4, 14.5, 26.8, 15.3, 0.95, m.planter);
  deco2(24.55, 0.95, 14.6, 26.65, 1.0, 15.2, m.leaves, 1);
  for (const s of [1, -1]) deco(26.4, UP - 0.32, s > 0 ? 0 : -MEZ.z, 26.6, UP - 0.3, s > 0 ? MEZ.z : 0, strip, 2);

  // ---------------------------------------------------------------- the west balconies and the bridges
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const [bz0, bz1] = zr(BAL.z0, BAL.z1);
    solid(BAL.x0 + 0.1, UP - 0.3, bz0, BAL.x1, UP, bz1, m.concrete, 'concrete', 4);
    for (const [x, z] of [[BAL.x1 - 0.4, BAL.z0 + 0.4], [BAL.x1 - 0.4, BAL.z1 - 0.4]]) cyl(x, s * z, 0.3, 0, UP - 0.3, m.steel, 'metal', 14);
    // Rails: the hall side (open at the bridge), the mid-field end, the far end (open at the escalator).
    railZ(bz0, bz1, BAL.x1 - 0.08, UP, [zr(BRIDGE.z0, BRIDGE.z1)]);
    railX(BAL.x0 + 0.1, BAL.x1, s > 0 ? BAL.z0 : -BAL.z0 - 0.08, UP);
    railX(BAL.x0 + 0.1, BAL.x1, s > 0 ? BAL.z1 - 0.08 : -BAL.z1, UP, [[ESC_W.x0, ESC_W.x1]]);
    // The bridge: deck, white fascias with strip lights, balustrades; drop gaps on the mid-field side
    // over the platforms.
    const [z0, z1] = zr(BRIDGE.z0, BRIDGE.z1);
    // One box, deck and fascias (a thin fascia under the deck's edge was a wall a body falling through
    // a drop gap could cross: the stress test); white fascia faces with strip lights drawn on it.
    solid(BRIDGE.x0, UP - 0.75, z0, BRIDGE.x1, UP, z1, m.concrete, 'concrete', 4);
    for (const [z, out] of [[z0, -1], [z1, 1]] as const) {
      deco(BRIDGE.x0, UP - 0.75, z, BRIDGE.x1, UP - 0.3, z + out * 0.012, m.white, 2);
      deco(BRIDGE.x0, UP - 0.7, z + out * 0.012, BRIDGE.x1, UP - 0.64, z + out * 0.024, strip, 2);
    }
    const midSide = s > 0 ? z0 : z1 - 0.08;
    const farSide = s > 0 ? z1 - 0.08 : z0;
    railX(BRIDGE.x0, BRIDGE.x1, midSide, UP, BRIDGE_DROPS);
    railX(BRIDGE.x0, BRIDGE.x1, farSide, UP);
  }
  stair2(ESC_W.x0, ESC_W.top, ESC_W.x1, ESC_W.foot, 'z', -1, 0, UP, m.escalator, ['lo', 'hi'], true);
  // W': ticket machines, a bench row (cover).
  solid2(-29.85, 0, 10, -29.1, 1.9, 13, m.steelDark, 'metal', 1);
  deco2(-29.1, 0.6, 10.1, -29.08, 1.8, 12.9, glow, 1);
  low2(-26.6, 40, -24, 41, 0.95, m.planter);
  deco2(-26.45, 0.95, 40.1, -24.15, 1.0, 40.9, m.leaves, 1);

  // ---------------------------------------------------------------- the train
  // Three cars on one guideway, hovering 12 cm over it (the body is drawn from 0.12; its collider
  // starts at the floor, so nothing passes under). Faceted noses at both ends. Inside: one aisle
  // through all three cars and the two gangways; benches between the doors, luggage stacks at the
  // car ends (corners); ceiling light strips and one point light per car.
  const T = TRAIN;
  const HOVER = 0.12;
  const lights: THREE.PointLight[] = [];
  // The floor (one collider, the whole train; drawn per car, the underframe skirt outside).
  col.add(-T.x, 0, -T.z, T.x, F, T.z, 'metal');
  // The cab passages' floor through both noses (18.0: the train is entered at its ends too).
  for (const s of [1, -1]) col.add(-GANGWAY, 0, s > 0 ? T.z : -T.nose, GANGWAY, F, s > 0 ? T.nose : -T.z, 'metal');
  deco(-T.x + 0.08, HOVER, -T.z, T.x - 0.08, F - 0.02, T.z, m.steelDark, 2);
  deco(-T.x + T.wall, F - 0.02, -T.z, T.x - T.wall, F, T.z, cabinFloor, 4.8);
  for (const sx of [1, -1]) deco(sx > 0 ? T.x - 0.01 : -T.x - 0.03, HOVER, -T.z, sx > 0 ? T.x + 0.03 : -T.x + 0.01, HOVER + 0.07, T.z, glow, 2);
  // The ceiling (one collider) and the roof's crown (seen).
  col.add(-T.x, T.ceil, -T.z, T.x, T.roof, T.z, 'metal');
  deco(-T.x, T.ceil, -T.z, T.x, T.roof, T.z, m.offWhite, 2);
  deco(-T.x + 0.35, T.roof, -T.z + 0.5, T.x - 0.35, T.roof + 0.14, T.z - 0.5, m.offWhite, 2);
  for (const c of CARS) {
    const z0 = c - CAR / 2, z1 = c + CAR / 2;
    // Side walls with the doors (and the dark window band and teal stripe drawn on them).
    for (const sx of [1, -1]) {
      const [x0, x1] = sx > 0 ? [T.x - T.wall, T.x] : [-T.x, -T.x + T.wall];
      wall(false, z0, z1, x0, x1, F, T.ceil - F, m.white, [c - 5, c + 5].map((at) => ({ at, w: DOOR_W, y0: F, y1: F + DOOR_H })), 'metal');
      // Below the floor line the body is its skirt (between the hover gap and the floor).
      deco(x0, HOVER, z0, x1, F, z1, m.white, 2);
      const xo = sx > 0 ? T.x : -T.x - 0.012, xi = sx > 0 ? T.x - T.wall - 0.012 : -T.x + T.wall;
      for (const [a, e] of [[z0 + 0.3, c - 5 - DOOR_W / 2 - 0.15], [c - 5 + DOOR_W / 2 + 0.15, c + 5 - DOOR_W / 2 - 0.15], [c + 5 + DOOR_W / 2 + 0.15, z1 - 0.3]]) {
        deco(xo, 1.25, a, xo + 0.012, 2.2, e, m.tint, 1);
        deco(xo, 0.6, a, xo + 0.012, 0.82, e, m.teal, 1);
        deco(xi, 1.25, a, xi + 0.012, 2.2, e, m.tint, 1);
      }
      // Door frames: a teal edge round each door (outside), a strip light over it (inside).
      for (const at of [c - 5, c + 5]) {
        deco(xo, F, at - DOOR_W / 2 - 0.08, xo + 0.012, F + DOOR_H + 0.08, at - DOOR_W / 2, m.teal, 1);
        deco(xo, F, at + DOOR_W / 2, xo + 0.012, F + DOOR_H + 0.08, at + DOOR_W / 2 + 0.08, m.teal, 1);
        deco(xi, F + DOOR_H + 0.05, at - DOOR_W / 2, xi + 0.012, F + DOOR_H + 0.12, at + DOOR_W / 2, strip, 1);
      }
    }
    // End walls: a door in each (to the gangway, or at the train's ends to the cab passage).
    for (const [a, e] of [[z0, z0 + 0.2], [z1 - 0.2, z1]] as const) {
      wall(true, -T.x + T.wall, T.x - T.wall, a, e, F, T.ceil - F, cabin, [{ at: 0, w: 2 * GANGWAY, y0: F, y1: F + 2.1 }], 'metal');
    }
    // Inside: benches between the doors (seat 0.48, a backrest on the wall), luggage stacks from the
    // end doors to the end walls (the aisle narrows to 1.2 m there), the ceiling strips.
    for (const sx of [1, -1]) {
      const [a0, a1] = sx > 0 ? [AISLE, T.x - T.wall] : [-T.x + T.wall, -AISLE];
      const bz0 = c - 5 + DOOR_W / 2 + 0.7, bz1 = c + 5 - DOOR_W / 2 - 0.7;
      solid(a0, F, bz0, a1, F + 0.48, bz1, seat, 'wood', 1).vault = true;
      const [r0, r1] = sx > 0 ? [T.x - T.wall - 0.12, T.x - T.wall] : [-T.x + T.wall, -T.x + T.wall + 0.12];
      solid(r0, F + 0.48, bz0, r1, F + 1.05, bz1, seat, 'wood', 1);
      const [l0, l1] = sx > 0 ? [0.6, T.x - T.wall] : [-T.x + T.wall, -0.6];
      for (const [e0, e1] of [[z0 + 0.2, c - 5 - DOOR_W / 2 - 0.5], [c + 5 + DOOR_W / 2 + 0.5, z1 - 0.2]]) {
        solid(l0, F, e0, l1, T.ceil, e1, cabin, 'metal', 1);
        deco(sx > 0 ? l0 - 0.01 : l1, 0.9, e0 + 0.15, sx > 0 ? l0 : l1 + 0.01, 1.0, e1 - 0.15, m.teal, 1);
      }
      deco(sx * 0.62 - 0.06, T.ceil - 0.02, z0 + 0.4, sx * 0.62 + 0.06, T.ceil, z1 - 0.4, cabinStrip, 2);
    }
    const l = new THREE.PointLight(0xeef4ff, 2.6, 12, 1);
    l.position.set(0, 1.7, c);
    scene.add(l);
    lights.push(l);
  }
  // The gangways: black bellows walls from the passage to the body's sides (nothing gets in between
  // the cars), a floor plate.
  for (const s of [1, -1]) {
    const g0 = CAR / 2, g1 = CAR / 2 + GAP;
    const [za, zb] = s > 0 ? [g0, g1] : [-g1, -g0];
    for (const sx of [1, -1]) {
      const [x0, x1] = sx > 0 ? [GANGWAY, T.x] : [-T.x, -GANGWAY];
      solid(x0, F, za, x1, T.ceil, zb, m.rubber, 'metal', 1);
      deco(x0, HOVER, za, x1, F, zb, m.rubber, 1);
    }
    deco(-GANGWAY, F - 0.01, za, GANGWAY, F + 0.005, zb, m.steel, 1);
  }
  // The noses: two steps narrowing to the tip (collider = drawn), each split by the cab passage (a
  // door in the tip: the straight way into the train from the apron), a dark windscreen band over it,
  // the headlights either side of the door.
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const PH = F + 2.1;
    const steps: [number, number, number, number][] = [[T.z, T.z + 1.5, T.x, T.roof], [T.z + 1.5, T.nose, T.x - 0.5, 2.7]];
    for (const [a, e, hw, h] of steps) {
      const [za, zb] = zr(a, e);
      // Either side of the passage, full height; over it, the lintel.
      for (const [x0, x1] of [[-hw, -GANGWAY], [GANGWAY, hw]] as const) {
        col.add(x0, 0, za, x1, h, zb, 'metal').vault = false;
        deco(x0, HOVER, za, x1, h, zb, m.white, 2);
      }
      col.add(-GANGWAY, PH, za, GANGWAY, h, zb, 'metal');
      deco(-GANGWAY, PH, za, GANGWAY, h, zb, m.white, 2);
      deco(-hw + 0.06, 0, za, hw - 0.06, HOVER, zb, m.steelDark, 1);
      deco(-GANGWAY, HOVER, za, GANGWAY, F, zb, m.steelDark, 1);
    }
    // The passage: floor plate, a strip light over it, teal jambs at the tip.
    const [pa, pb] = zr(T.z, T.nose);
    deco(-GANGWAY, F - 0.01, pa, GANGWAY, F + 0.005, pb, m.steel, 1);
    deco(-0.3, PH - 0.02, pa, 0.3, PH, pb, cabinStrip, 1);
    // On step 1's front face, over step 2 (the face is open above 2.7 m).
    const [wa, wb] = zr(T.z + 1.5, T.z + 1.512);
    deco(-T.x + 0.2, 2.75, wa, T.x - 0.2, T.roof - 0.12, wb, m.tint, 1);
    const [ta, tb] = zr(T.nose, T.nose + 0.012);
    for (const jx of [-GANGWAY - 0.1, GANGWAY]) deco(jx, F, ta, jx + 0.1, PH + 0.1, tb, m.teal, 1);
    for (const hx of [-1.05, 1.05]) deco(hx - 0.2, 0.55, ta, hx + 0.2, 0.72, tb, strip, 1);
  }

  // ---------------------------------------------------------------- the city beyond the glass
  // A pale plaza and office towers in curtain-wall glass (seen only), a low skyline in the haze.
  deco(-400, -0.31, -400, -X_HALL - 0.4, -0.01, 400, m.plaza, 8);
  deco(X_HALL + 0.4, -0.31, -400, 400, -0.01, 400, m.plaza, 8);
  {
    const rnd = (() => {
      let k = 9187;
      return () => ((k = (k * 16807) % 2147483647) / 2147483647);
    })();
    for (const sx of [1, -1]) for (let i = 0; i < 14; i++) {
      const x = sx * (70 + rnd() * 220), z = -260 + i * 40 + rnd() * 20;
      const w = 22 + rnd() * 26, d = 22 + rnd() * 26, h = 40 + rnd() * 120;
      deco(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, rnd() < 0.5 ? m.tower0 : m.tower1, 12);
      deco(x - w / 2 - 0.3, h, z - d / 2 - 0.3, x + w / 2 + 0.3, h + 1.2, z + d / 2 + 0.3, m.white, 4);
    }
  }

  b.build(scene);
  // The steel, concrete and the train cast the hall's shadows; the glass doesn't (the sun comes through).
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.staticMerged) {
      const transparent = (mesh.material as THREE.Material).transparent;
      mesh.castShadow = !transparent;
      mesh.receiveShadow = !transparent;
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
  const TF = TRACK.floor;
  const IX = TRACK.x0 + TRACK_STAIR.w / 2, OX = TRACK.x1 - TRACK_STAIR.w / 2;
  for (const s of [1, -1]) {
    const Z = (z: number) => z * s;
    // Yard exits (inside and outside each).
    for (const x of EXITS) {
      N(x, 0, Z(BASE.z0 + 1.6));
      N(x, 0, Z(BASE.z0 - 1.2));
    }
    // The train's doors: outside, inside (each door, both sides), the aisle (2 m), the gangways.
    for (const zd of DOORS) for (const sx of [1, -1]) chain(N(doorOut(sx), 0, Z(zd)), N(doorIn(sx), F, Z(zd)));
    for (let z = 0; z <= T.z - 0.8; z += 2) N(0, F, Z(z));
    for (const zg of [CAR / 2 - 0.6, CAR / 2 + GAP / 2, CAR / 2 + GAP + 0.6]) N(0, F, Z(zg));
    // The cab passage through the nose: the apron outside, the passage, the car's end.
    chain(N(0, 0, Z(T.nose + 1.3)), N(0, F, Z((T.z + T.nose) / 2)), N(0, F, Z(T.z - 1.2)));
    chain(N(0, F, Z(CAR / 2 - 0.6)), N(0, F, Z(CAR / 2 + GAP / 2)), N(0, F, Z(CAR / 2 + GAP + 0.6)));
    for (const sx of [1, -1]) {
      // The track beds: the end stairs (top on the end wall, middle, foot), the mid stair (from the
      // inner wall's top, onto the stair, middle, foot); drops off both edges.
      for (const x of [IX, OX]) chain(N(sx * x, 0, Z(TRACK.z + 0.6)), N(sx * x, TF / 2, Z(41.2)), N(sx * x, TF, Z(TRACK_STAIR.endFoot - 1.2)));
      chain(N(sx * (TRACK.x0 - 0.7), 0, Z(TRACK_STAIR.midTop - 0.4)), N(sx * IX, -0.1, Z(TRACK_STAIR.midTop - 0.6)), N(sx * IX, TF / 2, Z(11)), N(sx * IX, TF, Z(TRACK_STAIR.midFoot - 1.1)));
      for (const z of [20, 30]) drops.push([N(sx * (TRACK.x0 - 1.4), 0, Z(z)), N(sx * (TRACK.x0 + 1.4), TF, Z(z))]);
      for (const z of [17, 36]) drops.push([N(sx * (TRACK.x1 + 1.4), 0, Z(z)), N(sx * (TRACK.x1 - 1.4), TF, Z(z))]);
    }
    // The escalators: foot, middle, top.
    chain(N((ESC_E.x0 + ESC_E.x1) / 2, 0, Z(ESC_E.foot + 1.2)), N((ESC_E.x0 + ESC_E.x1) / 2, UP / 2, Z((ESC_E.foot + ESC_E.top) / 2)), N((ESC_E.x0 + ESC_E.x1) / 2, UP, Z(ESC_E.top - 1.2)));
    chain(N((ESC_MID.x0 + ESC_MID.x1) / 2, 0, Z(ESC_MID.foot + 1.2)), N((ESC_MID.x0 + ESC_MID.x1) / 2, UP / 2, Z((ESC_MID.foot + ESC_MID.top) / 2)), N((ESC_MID.x0 + ESC_MID.x1) / 2, UP, Z(ESC_MID.top - 1.4)));
    chain(N((ESC_W.x0 + ESC_W.x1) / 2, 0, Z(ESC_W.foot + 1.2)), N((ESC_W.x0 + ESC_W.x1) / 2, UP / 2, Z((ESC_W.foot + ESC_W.top) / 2)), N((ESC_W.x0 + ESC_W.x1) / 2, UP, Z(ESC_W.top - 1.2)));
    // The bridge (every 2.5 m), its drop gaps onto the platforms; the mezzanine's drop gap.
    for (let x = BRIDGE.x0 + 0.8; x <= BRIDGE.x1 - 0.8; x += 2.5) N(x, UP, Z((BRIDGE.z0 + BRIDGE.z1) / 2));
    for (const [g0, g1] of BRIDGE_DROPS) {
      const x = (g0 + g1) / 2;
      drops.push([N(x, UP, Z(BRIDGE.z0 + 0.7)), N(x, 0, Z(BRIDGE.z0 - 2.2))]);
    }
    drops.push([N(MEZ.x0 + 0.7, UP, Z((MEZ_DROP[0] + MEZ_DROP[1]) / 2)), N(MEZ.x0 - 0.8, 0, Z((MEZ_DROP[0] + MEZ_DROP[1]) / 2))]);
    // The balcony.
    for (const x of [BAL.x0 + 1.2, (BAL.x0 + BAL.x1) / 2, BAL.x1 - 0.9]) for (let z = BAL.z0 + 1; z <= BAL.z1 - 0.9; z += 2.5) N(x, UP, Z(z));
  }
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Lattices: the ground (4 m), the track beds (2.5 m), the mezzanine (3 m).
  for (let x = -X_HALL + 2; x <= X_HALL - 2; x += 4) {
    for (let z = -Z_END + 2; z <= Z_END - 2; z += 4) {
      const ax = Math.abs(x);
      if (ax > TX0 - 0.6 && ax < TX1 + 0.6 && Math.abs(z) < TZ + 0.6) continue;
      if (ax < T.x + 0.6 && Math.abs(z) < T.nose + 0.6) continue;
      if (open(x, 0, z)) N(x, 0, z);
    }
  }
  // The beds: along the guideway beam (clear of the carts, which stand beside it) and by both walls.
  for (const sx of [1, -1]) {
    for (let z = -TRACK.z + 2; z <= TRACK.z - 2; z += 2.5) {
      N(sx * 17, TF + 0.25, z);
      for (const x of [TRACK.x0 + 0.7, TRACK.x1 - 0.7]) if (open(sx * x, TF, z)) N(sx * x, TF, z);
    }
  }
  for (let x = MEZ.x0 + 1; x < MEZ.x1 - 0.5; x += 3) {
    for (let z = -MEZ.z + 1; z < MEZ.z - 0.5; z += 3) {
      const inHole = midHoles.some((h) => x > h[0] - 0.6 && x < h[2] + 0.6 && z > h[1] - 0.6 && z < h[3] + 0.6);
      if (!inHole && open(x, UP, z)) N(x, UP, z);
    }
  }

  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!open(p.x, p.y, p.z)) laneProblems.push(`${t} ${p.x},${p.y},${p.z}`);

  const testGoals = [
    v(0, F, 0), v(0, F, 18.3), v(0, F, -18.3), v(0, F, 9.15), v(0, F, -25),
    v(-17, TF, 0), v(19.6, TF, -30), v(-14.2, TF, 40),
    v(26.5, UP, 0), v(26.5, UP, -30), v(0, UP, 20), v(-20, UP, -20), v(-27, UP, 20),
    v(-7, 0, 20), v(7, 0, -30), v(26, 0, 0), v(-26, 0, -30), v(20, 0, 40), v(-20, 0, -48),
  ];

  return {
    nav: { nodes, links, drops, slope: 0 },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    testGoals,
    zoneAt,
    covered: [
      { x0: -T.x, z0: -T.z, x1: T.x, z1: T.z, y0: -0.5, h: T.ceil },
      { x0: MEZ.x0, z0: -MEZ.z, x1: MEZ.x1, z1: MEZ.z, y0: -1, h: UP - 0.3 },
      { x0: BAL.x0, z0: BAL.z0, x1: BAL.x1, z1: BAL.z1, y0: -1, h: UP - 0.3 },
      { x0: BAL.x0, z0: -BAL.z1, x1: BAL.x1, z1: -BAL.z0, y0: -1, h: UP - 0.3 },
    ],
    lights,
    glass: glassMats,
    laneProblems,
  };
}
