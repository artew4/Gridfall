import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import type { Breakable, CabinetSpot } from '../../gameplay/Interactives';
import { mulberry32 } from '../../core/math';
import type { Zone } from '../Level';
import { CLIFF, CLIFF_RECESS, JUNGLE_EXTENT, OUTLIERS, PAD_IN, jungleHeight } from './Terrain';
import * as T from './textures';

/*
  Deep Jungle, "the Temple of the Seventh Rain" (metres, y up, north = -z). A flat clearing (r < 21)
  holds a stepped stone temple; rolling forest floor runs out to dark rock walls at x/z ±66.

                        N stair (x ±2.5, z -17..-12)
            NW wall ┐                                      DIG CAMP (13.6..17.6, -11..-7)
                    ┌────────── T1 terrace, top 1.5 m (x/z ±12) ───────────┐
       W log ramp ══│   ┌──── T2 terrace, top 3.0 (x/z ±7) ────┐           │══ E log ramp
     (x -18..-12,   │   │    SHRINE (±4.5, walls to 6.4 m)    ├═ E stair   │   (x 12..18, z 3.4..4.6)
      z -4.6..-3.4) │   └──────── S stair (z 7..11) ──────────┘ (x 7..11)  │
                    └──────────────────────────────────────────────────────┘
                              S stair (x ±2.5, z 12..17)
                                  archway (z 20)
   Outlying ruins: two watch platforms out in the forest (perches), see OUTLIERS in Terrain.ts.
*/

export interface Interior {
  name: string;
  jp: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Floor and ceiling: inside means between them. */
  y0: number;
  h: number;
}

/** A giant tree, for the foliage pass (vines, crowns) and the intro. */
export interface TreeInfo {
  x: number;
  z: number;
  /** Trunk radius, root-flare collider radius, ground height at the trunk, trunk height. */
  r: number;
  flare: number;
  y: number;
  h: number;
  giant: boolean;
}

export interface RuinsResult {
  interiors: Interior[];
  trees: TreeInfo[];
  /** Footprints foliage must stay out of (paths, stairs, ramps, terraces, camp), as XZ rects. */
  keepClear: [number, number, number, number][];
  start: { x: number; z: number; yaw: number };
  spawns: THREE.Vector3[];
  perches: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  cabinets: CabinetSpot[];
  medkits: THREE.Vector3[];
  breakables: Breakable[];
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; slope: number };
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Points the DEV AI check sends enemies to. */
  testGoals: THREE.Vector3[];
}

export const T1 = 12;
export const T1_TOP = 1.5;
export const T2 = 7;
export const T2_TOP = 3.0;
const SHRINE = 4.5;
const SHRINE_TOP = 6.4;
const WALL = 0.5;

export function buildRuins(scene: THREE.Scene, col: CollisionWorld, glows: Glows): RuinsResult {
  const b = new StaticBuilder();
  const rnd = mulberry32(2026);
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.9, metal = 0, env = 0.3) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const m = {
    stone: std(T.stoneTexture(0.45), 0xffffff, 0.92),
    moss: std(T.stoneTexture(1, '#5d6248'), 0xffffff, 0.95),
    dark: std(T.stoneTexture(0.7, '#5a5648'), 0xd8d8d0, 0.95),
    bark: std(T.barkTexture(), 0xffffff, 0.95, 0, 0.15),
    barkPale: std(T.barkTexture('#6f6a58'), 0xffffff, 0.95, 0, 0.15),
    rock: std(T.rockTexture(), 0xffffff, 0.95, 0, 0.15),
    plank: std(T.plankTexture(), 0xffffff, 0.85),
    tarp: new THREE.MeshStandardMaterial({ map: T.tarpTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    crate: std(T.tarpTexture('#5b5a3a'), 0xffffff, 0.9),
    metal: std(null, 0x3a3f36, 0.55, 0.6, 0.5),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.6) }),
  };
  const keepClear: [number, number, number, number][] = [];
  const clear = (x0: number, z0: number, x1: number, z1: number, pad = 0.8) => keepClear.push([x0 - pad, z0 - pad, x1 + pad, z1 + pad]);

  /** A box that is both seen and solid, with the same bounds. */
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** A low wall you can jump over mid-jump (≤ 1.05 m above its floor). */
  const lowWall = (x0: number, y0: number, z0: number, x1: number, h: number, z1: number, mat = m.moss) => {
    const c = solid(x0, y0, z0, x1, y0 + h, z1, mat);
    c.vault = h <= 1.05;
    return c;
  };

  /**
   * Stair = visual steps over a smooth ramp (3.3 rules), from `base` up to `top`: every tread is a
   * block down to the base (seen as a solid stair), the stepped fill underneath collides for bullets
   * and so nobody walks under or through it, and the ramp is the floor.
   */
  const stair = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat = m.stone) => {
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const steps = Math.round(H / 0.25);
    const run = L / steps;
    for (let i = 0; i < steps; i++) {
      const hTop = ((i + 1) * H) / steps;
      const a = rise > 0 ? i * run : L - (i + 1) * run;
      const p0 = (along ? x0 : z0) + a;
      if (along) b.add(worldBox(run, hTop, z1 - z0, 1), mat, p0 + run / 2, base + hTop / 2, (z0 + z1) / 2);
      else b.add(worldBox(x1 - x0, hTop, run, 1), mat, (x0 + x1) / 2, base + hTop / 2, p0 + run / 2);
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
    clear(x0, z0, x1, z1, 1.2);
  };

  const cylinder = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, seg = 12) => {
    b.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y0 + h / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + h, 'concrete');
  };

  const interiors: Interior[] = [];

  // ======================================================================= Temple
  // T1: the great platform. One solid block (its sides are the walls you see).
  solid(-T1, 0, -T1, T1, T1_TOP, T1, m.stone, 'concrete', 3);
  clear(-T1, -T1, T1, T1, 0.6);
  // T2 on top of it.
  solid(-T2, T1_TOP, -T2, T2, T2_TOP, T2, m.dark, 'concrete', 3);
  // Stairs: up to T1 from the south and north, up to T2 from T1 on the south and east.
  stair(-2.5, T1, 2.5, 17, 'z', -1, 0, T1_TOP);
  stair(-2.5, -17, 2.5, -T1, 'z', 1, 0, T1_TOP);
  stair(-2, T2, 2, 11, 'z', -1, T1_TOP, T2_TOP, m.dark);
  stair(T2, -2, 10, 2, 'x', -1, T1_TOP, T2_TOP, m.dark);
  // Stair cheeks: low balustrades along both sides of the ground stairs (the stair's own blocks to the
  // side; walls down to the ground, so nothing gets under). Low enough to vault, high enough for cover.
  // Stepped down with the stair, 0.6 m above the treads at every point.
  for (const s of [-1, 1]) {
    for (const north of [false, true]) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        // i = 0 at the terrace, n - 1 at the foot.
        const a = T1 + i, b2 = T1 + i + 1;
        // The top block is flush with the rim wall it meets (no ledge-against-wall pinch).
        const h = i === 0 ? T1_TOP + 0.95 : T1_TOP * (1 - i / n) + 0.6;
        const z0 = north ? -b2 : a, z1 = north ? -a : b2;
        lowWall(s > 0 ? 2.5 : -3.1, 0, z0, s > 0 ? 3.1 : -2.5, h, z1, m.moss).vault = false;
      }
    }
  }

  // Cheeks on the T2 stairs too (stepped, 0.6 m above the treads). They stop short of the foot so
  // the lane between the stair foot and the rim stays ≥ 1 m; the last 0.6 m of stair is open at the
  // sides but only a kerb high there.
  const cheeks2 = (alongX: boolean, end: number) => {
    const n = 4;
    const L = end - T2;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const a = T2 + (L * i) / n, b2 = T2 + (L * (i + 1)) / n;
        const top = T2_TOP - ((T2_TOP - T1_TOP) * (a - T2)) / 4 + 0.6;
        const c0 = sgn > 0 ? 2 : -2.6, c1 = sgn > 0 ? 2.6 : -2;
        if (alongX) lowWall(a, T1_TOP, c0, b2, top - T1_TOP, c1, m.moss).vault = false;
        else lowWall(c0, T1_TOP, a, c1, top - T1_TOP, b2, m.moss).vault = false;
      }
    }
  };
  cheeks2(false, 10.4);
  cheeks2(true, 9.4);

  // Rim walls on T1: broken low walls (cover), gaps ≥ 1.4 m, open where the stairs and logs land.
  const rimY = T1_TOP;
  const rim = (alongX: boolean, c0: number, c1: number, segs: [number, number][], h = 0.95) => {
    for (const [a0, a1] of segs) {
      if (alongX) lowWall(a0, rimY, c0, a1, h, c1);
      else lowWall(c0, rimY, a0, c1, h, a1);
    }
  };
  rim(true, T1 - WALL, T1, [[-T1, -8], [-6.5, -3.1], [3.1, 7], [8.5, T1]]);
  rim(true, -T1, -T1 + WALL, [[-T1, -8.5], [-7, -3.1], [3.1, 6.5], [8, T1]]);
  // East and west: the gap is exactly the log's width (nobody steps off the edge beside the log).
  rim(false, T1 - WALL, T1, [[-T1 + WALL, -6], [-4.5, 3.1], [4.9, T1 - WALL]]);
  rim(false, -T1, -T1 + WALL, [[-T1 + WALL, -4.9], [-3.1, 4.5], [6, T1 - WALL]]);

  // Pillars on T1 (some broken off), and at the corners of T2.
  const pillar = (x: number, z: number, y0: number, h: number) => {
    cylinder(x, z, 0.45, y0, h, m.stone, 10);
    b.add(worldBox(1.1, 0.25, 1.1, 1), m.moss, x, y0 + h + 0.125, z);
    col.add(x - 0.55, y0 + h, z - 0.55, x + 0.55, y0 + h + 0.25, z + 0.55, 'concrete');
  };
  for (const [x, z, h] of [[-9.9, -9.9, 3.6], [9.9, -9.9, 2.1], [-9.9, 9.9, 3.6], [9.9, 9.9, 3.6], [-9.9, 1.6, 1.7], [9.9, -6.8, 3.6]] as const) pillar(x, z, T1_TOP, h);
  for (const [x, z] of [[-6.1, -6.1], [6.1, -6.1], [-6.1, 6.1], [6.1, 6.1]]) pillar(x, z, T2_TOP, 4.2);

  // The shrine on T2: thick walls, a doorway north and south, windows east and west, a roof slab.
  {
    const y0 = T2_TOP, y1 = SHRINE_TOP, s = SHRINE, d = 0.8, dh = 2.5;
    // North and south walls with a doorway, lintel above.
    for (const [z0, z1] of [[-s, -s + WALL], [s - WALL, s]] as const) {
      solid(-s, y0, z0, -d, y1, z1, m.dark);
      solid(d, y0, z0, s, y1, z1, m.dark);
      solid(-d, y0 + dh, z0, d, y1, z1, m.moss);
    }
    // East and west walls with a window (sill 1.1, head 2.1).
    for (const [x0, x1] of [[-s, -s + WALL], [s - WALL, s]] as const) {
      solid(x0, y0, -s + WALL, x1, y1, -0.7, m.dark);
      solid(x0, y0, 0.7, x1, y1, s - WALL, m.dark);
      solid(x0, y0, -0.7, x1, y0 + 1.1, 0.7, m.dark);
      solid(x0, y0 + 2.1, -0.7, x1, y1, 0.7, m.dark);
    }
    solid(-s - 0.3, y1, -s - 0.3, s + 0.3, y1 + 0.45, s + 0.3, m.moss, 'concrete', 3);
    // A stepped crown on the roof (out of reach).
    solid(-2.6, y1 + 0.45, -2.6, 2.6, y1 + 1.2, 2.6, m.dark);
    solid(-1.4, y1 + 1.2, -1.4, 1.4, y1 + 2.2, 1.4, m.stone);
    // Altar.
    solid(-1.1, y0, -2.6, 1.1, y0 + 1.0, -1.4, m.stone);
    solid(-1.3, y0 + 1.0, -2.7, 1.3, y0 + 1.15, -1.3, m.moss);
    interiors.push({ name: 'SHRINE', jp: '祠', x0: -s + WALL, z0: -s + WALL, x1: s - WALL, z1: s - WALL, y0, h: y1 });
  }

  // ======================================================================= Climbable logs
  /**
   * A fallen giant leaning on the terrace: its top is a smooth ramp; it lies in a bank of stacked
   * stone blocks that rise to just under the walking surface (seen and solid alike, like the treads
   * under a stair). The bank never sits more than 0.31 m below the ramp, so there is no ledge
   * beside the trunk you could step onto and sink from: that pocket is what the 3.3 stress test caught.
   */
  const logRamp = (xLow: number, xHigh: number, zc: number) => {
    const r = 0.6, w = 1.3;
    const x0 = Math.min(xLow, xHigh), x1 = Math.max(xLow, xHigh);
    const dir = Math.sign(xHigh - xLow);
    col.addRamp(x0, zc - r, x1, zc + r, 'x', dir > 0 ? 0 : T1_TOP, dir > 0 ? T1_TOP : 0);
    const n = 8;
    const L = x1 - x0;
    for (let i = 1; i < n; i++) {
      // Block i (counted from the low end): up to the ramp height at its low edge.
      const lo = dir > 0 ? x0 + (L * i) / n : x1 - (L * (i + 1)) / n;
      const h = (T1_TOP * i) / n - 0.12;
      // A floor too: its top is never more than 0.31 m under the log, so stepping onto it from the
      // side is stepping onto the log; the low blocks stay under a kerb's height (0.35 m).
      solid(lo, 0, zc - w / 2, lo + L / n, h, zc + w / 2, m.moss, 'concrete', 1);
    }
    // The trunk: centre line r below the walking surface, overshooting the low end into the ground.
    const len = L + 2.5;
    const ang = Math.atan2(T1_TOP, L);
    const g = new THREE.CylinderGeometry(r, r * 1.1, len / Math.cos(ang), 12, 1, false);
    g.rotateZ(Math.PI / 2);
    const cx = dir > 0 ? x1 - (len / 2) * 1 : x0 + len / 2;
    const cyAt = (x: number) => (T1_TOP * (dir > 0 ? x - x0 : x1 - x)) / L - r;
    b.add(g, m.bark, cx, cyAt(cx), zc, 0, 0, dir * ang);
    // A broken-off root plate at the low end.
    b.add(new THREE.CylinderGeometry(1.3, 1.3, 0.35, 10), m.bark, dir > 0 ? x0 - 2.35 : x1 + 2.35, 0.3, zc, 0, 0, Math.PI / 2);
    clear(x0 - 3, zc - 1.4, x1, zc + 1.4, 0.6);
  };
  logRamp(18, T1, 4);
  logRamp(-18, -T1, -4);
  // The root plates are solid (seen as a disc standing on edge).
  col.add(18 + 2.35 - 0.175, 0, 4 - 1.3, 18 + 2.35 + 0.175, 1.6, 4 + 1.3, 'wood');
  col.add(-18 - 2.35 - 0.175, 0, -4 - 1.3, -18 - 2.35 + 0.175, 1.6, -4 + 1.3, 'wood');

  // ======================================================================= Ground ruins in the clearing
  lowWall(-19, 0, 2, -18.5, 1.8, 9);
  lowWall(-18.5, 0, 9, -15, 1.0, 9.5);
  lowWall(14, 0, 10, 14.5, 2.0, 16);
  lowWall(14.5, 0, 15.5, 18, 1.0, 16);
  lowWall(-17, 0, -17.5, -12.5, 1.6, -17);
  lowWall(-17.5, 0, -17.5, -17, 2.2, -12);
  // Toppled column drums (cover you can vault onto: 0.9 m).
  const drum = (x0: number, z0: number, x1: number, z1: number) => {
    const c = solid(x0, 0, z0, x1, 0.9, z1, m.moss, 'concrete', 1);
    c.vault = true;
  };
  drum(-9.6, 15.5, -6.6, 16.5);
  drum(6.5, 15, 7.5, 16);
  drum(15.5, 0.5, 16.5, 1.5);
  drum(-15.5, 11, -14.5, 12);
  drum(-8.5, -16.5, -5.5, -15.5);
  drum(7, -16.8, 8, -14.8);
  // The archway on the south approach.
  solid(-4.4, 0, 19.4, -3.2, 3.6, 20.6, m.stone);
  solid(3.2, 0, 19.4, 4.4, 3.6, 20.6, m.stone);
  solid(-4.6, 3.6, 19.3, 4.6, 4.3, 20.7, m.moss);
  clear(-4.6, 17, 4.6, 24, 0.4);

  // ======================================================================= Dig camp (NE)
  const breakables: Breakable[] = [];
  const bulb = (x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), m.bulb.clone());
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const glow = glows.add({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(1, 0.78, 0.48), radius: 6, base: 0.9, haloSize: 1.1, haloStrength: 0.3, mode: 'steady' });
    const c = col.add(x - 0.12, y - 0.12, z - 0.12, x + 0.12, y + 0.12, z + 0.12, 'glass', false);
    c.ray = true;
    breakables.push({ glow, collider: c, pos: new THREE.Vector3(x, y, z), extra: [mesh.material as THREE.MeshBasicMaterial] });
  };
  /** A work lamp on a post (the post collides; the lamp is shootable). */
  const lampPost = (x: number, z: number, y0 = 0, h = 2.6) => {
    solid(x - 0.07, y0, z - 0.07, x + 0.07, y0 + h, z + 0.07, m.metal, 'metal', 1);
    b.add(worldBox(0.5, 0.05, 0.05, 1), m.metal, x + 0.2, y0 + h, z);
    bulb(x + 0.4, y0 + h - 0.12, z);
  };
  {
    const x0 = 13.6, x1 = 17.6, z0 = -11, z1 = -7, y = 2.5;
    for (const [x, z] of [[x0, z0], [x1 - 0.14, z0], [x0, z1 - 0.14], [x1 - 0.14, z1 - 0.14]]) solid(x, 0, z, x + 0.14, y, z + 0.14, m.plank, 'wood', 1);
    b.add(worldBox(x1 - x0 + 0.6, 0.04, z1 - z0 + 0.6, 2), m.tarp, (x0 + x1) / 2, y + 0.02, (z0 + z1) / 2, 0, 0, 0.06);
    col.add(x0 - 0.3, y - 0.12, z0 - 0.3, x1 + 0.3, y + 0.16, z1 + 0.3, 'wood', false).ray = true;
    // Finds table, crates against the back, the generator and its electrical cabinet.
    solid(14.9, 0, -10.6, 16.4, 0.9, -9.6, m.plank, 'wood', 1);
    solid(17.6, 0, -10.6, 18.6, 0.8, -9.6, m.crate, 'wood', 1);
    solid(17.65, 0.8, -10.5, 18.5, 1.5, -9.7, m.crate, 'wood', 1);
    solid(13.4, 0, -4.6, 14.6, 1.0, -3.6, m.metal, 'metal', 1); // generator
    clear(12.4, -11.6, 19, -5, 0.5);
  }
  const cabinets: CabinetSpot[] = [];
  {
    const x = 16.4, z = -5.6, w = 1.0, d = 0.5, h = 1.8;
    const c = solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, m.metal, 'metal', 1);
    cabinets.push({ pos: new THREE.Vector3(x, 0, z), face: 's', collider: c });
  }
  lampPost(13.0, -13.0);
  lampPost(18.6, -6.2);
  // Lamps strung around the temple by the diggers.
  lampPost(-6, 18);
  lampPost(6, -18.2);
  lampPost(-10.2, -8.0, T1_TOP, 2.2);
  lampPost(10.4, 7.2, T1_TOP, 2.2);
  bulb(0, T2_TOP + 2.25, 0); // hanging inside the shrine
  b.add(worldBox(0.02, 0.9, 0.02, 1), m.metal, 0, T2_TOP + 2.85, 0);

  // ======================================================================= Outlying watch platforms
  const perches: THREE.Vector3[] = [];
  const outlierNodes: { top: THREE.Vector3; bottom: THREE.Vector3 }[] = [];
  for (const o of OUTLIERS) {
    const top = 2.5;
    const s = 3.2;
    solid(o.x - s, -0.6, o.z - s, o.x + s, top, o.z + s, m.stone, 'concrete', 3);
    // Parapet with a gap where the stair arrives (stair on the side facing the temple).
    const toward = Math.abs(o.x) > Math.abs(o.z) ? (o.x > 0 ? 'w' : 'e') : o.z > 0 ? 'n' : 's';
    const pw = 0.4, ph = 0.95;
    const segs: [string, number, number, number, number][] = [
      ['n', o.x - s, o.z - s, o.x + s, o.z - s + pw],
      ['s', o.x - s, o.z + s - pw, o.x + s, o.z + s],
      ['w', o.x - s, o.z - s + pw, o.x - s + pw, o.z + s - pw],
      ['e', o.x + s - pw, o.z - s + pw, o.x + s, o.z + s - pw],
    ];
    for (const [side, a0, b0, a1, b1] of segs) {
      if (side !== toward) {
        lowWall(a0, top, b0, a1, ph, b1);
        continue;
      }
      // Split around a 2 m opening in the middle.
      if (side === 'n' || side === 's') {
        lowWall(a0, top, b0, o.x - 1, ph, b1);
        lowWall(o.x + 1, top, b0, a1, ph, b1);
      } else {
        lowWall(a0, top, b0, a1, ph, o.z - 1);
        lowWall(a0, top, o.z + 1, a1, ph, b1);
      }
    }
    const L = 4.5;
    let bottom: THREE.Vector3;
    if (toward === 'w') {
      stair(o.x - s - L, o.z - 1, o.x - s, o.z + 1, 'x', 1, 0, top);
      bottom = new THREE.Vector3(o.x - s - L - 1, 0, o.z);
    } else if (toward === 'e') {
      stair(o.x + s, o.z - 1, o.x + s + L, o.z + 1, 'x', -1, 0, top);
      bottom = new THREE.Vector3(o.x + s + L + 1, 0, o.z);
    } else if (toward === 'n') {
      stair(o.x - 1, o.z - s - L, o.x + 1, o.z - s, 'z', 1, 0, top);
      bottom = new THREE.Vector3(o.x, 0, o.z - s - L - 1);
    } else {
      stair(o.x - 1, o.z + s, o.x + 1, o.z + s + L, 'z', -1, 0, top);
      bottom = new THREE.Vector3(o.x, 0, o.z + s + L + 1);
    }
    clear(o.x - s, o.z - s, o.x + s, o.z + s, 1.2);
    perches.push(new THREE.Vector3(o.x, top, o.z));
    outlierNodes.push({ top: new THREE.Vector3(o.x, top, o.z), bottom });
    interiors.push({ name: o.name, jp: o.jp, x0: o.x - s, z0: o.z - s, x1: o.x + s, z1: o.z + s, y0: top - 0.1, h: top + 4 });
  }

  // ======================================================================= Trees
  /** Obstacles so far for spacing (XZ circles). */
  const taken: [number, number, number][] = [];
  const footprintFree = (x: number, z: number, r: number, gap: number) => {
    if (keepClear.some(([a0, b0, a1, b1]) => x + r + gap > a0 && x - r - gap < a1 && z + r + gap > b0 && z - r - gap < b1)) return false;
    return !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + gap);
  };
  const trees: TreeInfo[] = [];
  /**
   * Buttress root: a plate standing on edge, out from the trunk to the flare radius at knee height
   * and up the trunk. It never leaves the flare cylinder (the collider), so the V-shaped pockets
   * between roots are inside it: nothing can wedge itself into them.
   */
  const rootShape = (r: number, R: number, H: number) => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.4);
    s.lineTo(R - 0.04, -0.4);
    s.lineTo(R - 0.04, 0.3);
    s.quadraticCurveTo(R * 0.72, 0.85, R * 0.6, 1.15);
    s.quadraticCurveTo(r * 1.4, 1.6, r * 0.9, H);
    s.lineTo(0, H);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -0.11);
    return g;
  };
  const giant = (x: number, z: number, r: number) => {
    const R = r * 1.95;
    const ys = [jungleHeight(x, z), jungleHeight(x + R, z), jungleHeight(x - R, z), jungleHeight(x, z + R), jungleHeight(x, z - R)];
    const gMin = Math.min(...ys), gMax = Math.max(...ys);
    const y0 = gMin - 0.4;
    const h = 46 + rnd() * 10;
    // Trunk: a gentle taper into the mist, a few big limbs high up.
    b.add(new THREE.CylinderGeometry(r * 0.62, r, h, 12), rnd() < 0.3 ? m.barkPale : m.bark, x, y0 + h / 2, z, 0, rnd() * Math.PI, 0);
    const n = 6 + Math.floor(rnd() * 3);
    const a0 = rnd() * Math.PI * 2;
    const Hr = gMax - y0 + 1.2 + r * 1.6;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const g = rootShape(r, R - (gMax - gMin) * 0.2, Hr);
      b.add(g, m.bark, x, gMin, z, 0, -a, 0);
      g.dispose();
    }
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2, y = y0 + h * (0.6 + rnd() * 0.3), len = 6 + rnd() * 6;
      const limb = new THREE.CylinderGeometry(r * 0.18, r * 0.32, len, 7);
      limb.translate(0, len / 2, 0);
      b.add(limb, m.bark, x, y, z, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
      limb.dispose();
    }
    // Collision: the root flare up to above jump reach (no ledge to stand on), then the trunk.
    col.addCylinder(x, z, R, y0, gMax + 1.1, 'wood');
    col.addCylinder(x, z, r, y0, y0 + h, 'wood');
    taken.push([x, z, R]);
    trees.push({ x, z, r, flare: R, y: gMin, h, giant: true });
  };
  const slim = (x: number, z: number, r: number) => {
    const y0 = jungleHeight(x, z) - 0.3;
    const h = 16 + rnd() * 10;
    b.add(new THREE.CylinderGeometry(r * 0.7, r * 1.08, h, 8), m.barkPale, x, y0 + h / 2, z, 0, rnd() * Math.PI, 0);
    col.addCylinder(x, z, r * 1.08, y0, y0 + h, 'wood');
    taken.push([x, z, r * 1.08]);
    trees.push({ x, z, r, flare: r * 1.08, y: y0 + 0.3, h, giant: false });
  };
  // Outliers and other solids keep trees at a distance.
  for (const o of OUTLIERS) taken.push([o.x, o.z, 9]);
  for (let i = 0; i < 400 && trees.filter((t) => t.giant).length < 34; i++) {
    const a = rnd() * Math.PI * 2, d = 25 + rnd() * 36;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, r = 0.8 + rnd() * 0.55;
    if (footprintFree(x, z, r * 1.95, 3.2)) giant(x, z, r);
  }
  for (let i = 0; i < 600 && trees.filter((t) => !t.giant).length < 80; i++) {
    const a = rnd() * Math.PI * 2, d = PAD_IN + 1 + rnd() * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, r = 0.26 + rnd() * 0.2;
    if (footprintFree(x, z, r, 1.3)) slim(x, z, r);
  }

  // Fallen logs on the forest floor (along x or z: box colliders are axis-aligned), only where the
  // ground under them is nearly level, so they lie on it.
  const logs: [number, number, number, number, number][] = [];
  for (let i = 0; i < 300 && logs.length < 14; i++) {
    const a = rnd() * Math.PI * 2, d = 23 + rnd() * 36;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const alongX = rnd() < 0.5, len = 4.5 + rnd() * 3.5, r = 0.42;
    const hx = alongX ? len / 2 : r, hz = alongX ? r : len / 2;
    const hs = [-1, -0.5, 0, 0.5, 1].map((k) => jungleHeight(x + (alongX ? k * hx : 0), z + (alongX ? 0 : k * hz)));
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 0.28) continue;
    if (!footprintFree(x, z, Math.max(hx, hz), 1.4)) continue;
    const cy = hi + r - 0.14;
    const g = new THREE.CylinderGeometry(r, r * 1.05, len, 10);
    if (alongX) g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    b.add(g, m.bark, x, cy, z);
    g.dispose();
    // Collider: the log's bounding box down into the ground (top at the log's top: 0.7–0.8 m).
    const c = col.add(x - hx, lo - 0.3, z - hz, x + hx, cy + r, z + hz, 'wood');
    c.vault = true;
    taken.push([x, z, Math.max(hx, hz)]);
    logs.push([x, z, alongX ? 1 : 0, len, cy + r]);
  }

  // Mossy boulders and fallen temple blocks out in the forest (cover on the way in).
  const blocks: THREE.Vector3[] = [];
  for (let i = 0; i < 300 && blocks.length < 22; i++) {
    const a = rnd() * Math.PI * 2, d = 24 + rnd() * 36;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = 1.2 + rnd() * 1.3, dd = 1.0 + rnd() * 1.2;
    if (!footprintFree(x, z, Math.max(w, dd) * 0.75, 1.5)) continue;
    const ys = [jungleHeight(x - w / 2, z - dd / 2), jungleHeight(x + w / 2, z - dd / 2), jungleHeight(x - w / 2, z + dd / 2), jungleHeight(x + w / 2, z + dd / 2)];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const h = hi - lo + 1.0 + rnd() * 0.9;
    solid(x - w / 2, lo - 0.3, z - dd / 2, x + w / 2, lo + h, z + dd / 2, rnd() < 0.5 ? m.moss : m.dark, 'concrete', 1.5);
    taken.push([x, z, Math.max(w, dd) * 0.75]);
    blocks.push(new THREE.Vector3(x + (w / 2 + 0.8) * (x > 0 ? -1 : 1), 0, z));
  }

  // ======================================================================= Boundary: rock walls
  // Continuous walls of dark rock (two tiers, far taller than any bank against them), overgrown
  // talus at their foot (always overlapping the wall, so no slot opens behind it).
  const talus: [number, number, number][] = [];
  const wallSide = (axis: 'x' | 'z', sign: 1 | -1) => {
    let a = -CLIFF - 14;
    while (a < CLIFF + 14) {
      const len = 8 + rnd() * 10;
      const inner = CLIFF - 0.6 + rnd() * (CLIFF_RECESS + 0.6);
      const depth = 8 + rnd() * 5;
      const h1 = 11 + rnd() * 5;
      const h2 = h1 + 3 + rnd() * 6;
      const tiers: [number, number, number][] = [[inner, -3, h1], [inner + 1.5 + rnd() * 2, h1, h2]];
      for (const [c0, y0, y1] of tiers) {
        const c1 = inner + depth;
        if (axis === 'x') solid(sign > 0 ? c0 : -c1, y0, a, sign > 0 ? c1 : -c0, y1, a + len + 1, m.rock, 'concrete', 6);
        else solid(a, y0, sign > 0 ? c0 : -c1, a + len + 1, y1, sign > 0 ? c1 : -c0, m.rock, 'concrete', 6);
      }
      if (rnd() < 0.6) {
        const r = 1.4 + rnd() * 1.8;
        const along = a + 1 + rnd() * (len - 1);
        const across = (inner - r * 0.45) * sign;
        const x = axis === 'x' ? across : along, z = axis === 'x' ? along : across;
        const near = talus.find(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 2);
        const clearOfTrees = !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 2);
        if ((!near || Math.hypot(near[0] - x, near[1] - z) < near[2] + r - 0.6) && clearOfTrees) {
          talus.push([x, z, r]);
          const y0 = jungleHeight(x, z) - 1;
          const h = 1.6 + rnd() * 2.6;
          b.add(new THREE.CylinderGeometry(r * 0.8, r, h + 1, 8), m.rock, x, y0 + (h + 1) / 2, z, 0, rnd() * Math.PI, 0);
          col.addCylinder(x, z, r, y0, y0 + h + 1, 'concrete');
        }
      }
      a += len;
    }
  };
  wallSide('x', 1);
  wallSide('x', -1);
  wallSide('z', 1);
  wallSide('z', -1);

  b.build(scene);
  scene.traverse((o) => {
    if (o.userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ======================================================================= Gameplay data
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const medkits = [v(0, T2_TOP, 2.6), v(16.6, 0, -8.2)];
  const coverPoints: THREE.Vector3[] = [];
  const tryCover = (p: THREE.Vector3) => {
    if (!col.blocked(p, 0.45)) coverPoints.push(p);
  };
  // Behind the rim walls and pillars on T1, the shrine's corners on T2, the ruins in the clearing.
  for (const [x, z] of [[-6, 10.8], [5, 10.8], [10, 10.8], [-10, -10.8], [-5, -10.8], [5, -10.8], [10.8, -8], [10.8, -2], [10.8, 9], [-10.8, -9], [-10.8, 2], [-10.8, 8],
    [-8.5, 8.6], [8.6, -8.4], [-8.6, -8.6]]) tryCover(v(x, T1_TOP, z));
  for (const [x, z] of [[-5.5, 5.5], [5.5, 5.5], [-5.5, -5.5], [5.5, -5.5], [0, -3.5]]) tryCover(v(x, T2_TOP, z));
  for (const [x, z] of [[-8, 17.4], [7, 17], [-17.6, 6], [13.4, 13], [-14.5, -15.5], [-7, -14.6], [17, 2.5], [-15, 13.2], [-4.5, 21.6], [4.5, 21.6], [15.6, -12.4], [19.5, -8.5]]) tryCover(v(x, 0, z));
  for (const t of trees) {
    if (!t.giant) continue;
    // Behind the flare, toward the temple and to either side.
    const a = Math.atan2(t.z, t.x);
    for (const da of [0, 1.4, -1.4]) {
      const d = t.flare + 0.8;
      const x = t.x - Math.cos(a + da) * d, z = t.z - Math.sin(a + da) * d;
      tryCover(v(x, jungleHeight(x, z), z));
    }
  }
  for (const [x, z, ax, , top] of logs) {
    // Either side of each log, at its middle.
    for (const s of [-1, 1]) {
      const px = ax ? x : x + s * 1.1, pz = ax ? z + s * 1.1 : z;
      if (top - jungleHeight(px, pz) > 0.5) tryCover(v(px, jungleHeight(px, pz), pz));
    }
  }
  for (const p of blocks) tryCover(p.setY(jungleHeight(p.x, p.z)));
  for (const o of outlierNodes) tryCover(o.top.clone().add(v(1.4, 0, 1.4)));

  // Survival spawns: deep in the forest all round, among the undergrowth (the foliage pass packs
  // bushes around them).
  const spawns: THREE.Vector3[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + 0.11;
    const r = 50 + (i % 3) * 3.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const p = v(x, jungleHeight(x, z), z);
    if (!col.blocked(p, 0.6)) spawns.push(p);
  }

  // ======================================================================= Navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const N = (x: number, y: number, z: number) => nodes.push(v(x, y, z)) - 1;
  const probe = new THREE.Vector3();
  const inTemple = (x: number, z: number) => Math.abs(x) < T1 + 1.4 && Math.abs(z) < T1 + 1.4;
  for (let x = -60; x <= 60; x += 6) {
    for (let z = -60; z <= 60; z += 6) {
      if (inTemple(x, z)) continue;
      const y = jungleHeight(x, z);
      if (col.blocked(probe.set(x, y, z), 0.6)) continue;
      N(x, y, z);
    }
  }
  // Round the temple foot, between the ruins.
  for (const [x, z] of [[-14.5, -14.5], [14.5, -14.5], [-14.5, 14.5], [14.5, 14.5], [0, 19], [0, -19], [-6, 18.5], [6, 18.5], [-14.5, 0], [14.5, 0], [-14.8, 7], [11, -13.8],
    [-6, -19], [6, -19], [0, 23], [20.5, 7], [20.5, -2], [-20.5, -7], [-20.5, 1], [18.5, 12.5], [11.5, -4.6]]) {
    const y = jungleHeight(x, z);
    if (!col.blocked(probe.set(x, y, z), 0.5)) N(x, y, z);
  }
  // Into the dig camp (under the tarp, between the table and the cabinet) and round it.
  for (const [x, z] of [[15.4, -8.0], [15.2, -6.6], [19.8, -8.4], [12.6, -8.6]]) N(x, 0, z);
  // T1 surface, T2 surface (ring round the shrine), inside the shrine.
  const t1 = [[-5, 9.5], [5, 9.5], [9.5, 5.6], [9.5, -5.4], [5, -9.5], [-5, -9.5], [-9.5, -5.6], [-9.5, 5], [-8.6, 8.6], [8.6, 8.6], [8.6, -8.6], [-8.6, -8.6], [0, 11.6], [0, -11.6], [11.4, 4], [-11.4, -4], [-9.5, 0], [-8.2, 1.6], [-3.6, 10.95], [3.6, 10.95]]
    .map(([x, z]) => N(x, T1_TOP, z));
  const t2 = [[-5.75, 5.75], [5.75, 5.75], [5.75, -5.75], [-5.75, -5.75], [0, 5.75], [0, -5.75], [5.75, 0], [-5.75, 0]].map(([x, z]) => N(x, T2_TOP, z));
  // Inside: through the doorways by hand, round the altar automatically (same level, clear corridors).
  const inS = N(0, T2_TOP, 3.2), inN = N(0, T2_TOP, -3.4);
  for (const [x, z] of [[0, 0.6], [2.7, 0], [-2.7, 0], [2.7, -3.0], [-2.7, -3.0]]) N(x, T2_TOP, z);
  links.push([t2[4], inS], [t2[5], inN]);
  // Stairs and logs, by hand, end to end. No node in the middle: auto links (same level, clear
  // corridor) would join a mid-stair or mid-log node to the ground beside it, a step nobody can take.
  const chain = (...pts: [number, number, number][]) => {
    const ids = pts.map(([x, y, z]) => N(x, y, z));
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
    return ids;
  };
  const sS = chain([0, 0, 18.4], [0, T1_TOP, 11.6]);
  links.push([sS[1], t1[12]]);
  const sN = chain([0, 0, -18.4], [0, T1_TOP, -11.6]);
  links.push([sN[1], t1[13]]);
  const s2S = chain([0, T1_TOP, 11.6], [0, T2_TOP, 6.3]);
  links.push([s2S[1], t2[4]]);
  // The east stair lands in a 1.5 m lane between its foot and the rim: out along the lane, then round.
  const s2E = chain([10.75, T1_TOP, 0], [6.3, T2_TOP, 0]);
  links.push([s2E[1], t2[6]]);
  for (const sz of [-1, 1]) {
    const lane = N(10.75, T1_TOP, sz * 2.9);
    links.push([s2E[0], lane], [lane, t1[sz > 0 ? 2 : 3]]);
  }
  // The climbable logs are the player's: 1.2 m wide, too narrow for a pack to path along. Enemies
  // take the stairs (they still walk up a log when they chase straight at you).
  for (const o of outlierNodes) chain([o.bottom.x, jungleHeight(o.bottom.x, o.bottom.z), o.bottom.z], [o.top.x, o.top.y, o.top.z]);

  // ======================================================================= Zones
  const zone = (id: string, name: string, jp: string, rects: [number, number, number, number][] = []): Zone => ({ id, name, jp, rects });
  const shrine = zone('shrine', 'SHRINE', '祠', [[-SHRINE, -SHRINE, SHRINE, SHRINE]]);
  const upper = zone('upper-terrace', 'UPPER TERRACE', '上段', [[-T2, -T2, T2, T2]]);
  const temple = zone('temple', 'TEMPLE TERRACE', '神殿の基壇', [[-T1, -T1, T1, T1]]);
  const camp = zone('camp', 'DIG CAMP', '発掘キャンプ', [[12.4, -12.5, 19.5, -5]]);
  const clearing = zone('clearing', 'TEMPLE CLEARING', '神殿の空き地', [[-PAD_IN, -PAD_IN, PAD_IN, PAD_IN]]);
  const forest = zone('forest', 'DEEP JUNGLE', '密林', [[-JUNGLE_EXTENT, -JUNGLE_EXTENT, JUNGLE_EXTENT, JUNGLE_EXTENT]]);
  const watch = OUTLIERS.map((o) => ({ o, z: zone(o.name.toLowerCase().replace(/\s+/g, '-'), o.name, o.jp, [[o.x - 3.2, o.z - 3.2, o.x + 3.2, o.z + 3.2]]) }));
  const zoneAt = (x: number, y: number, z: number): Zone | null => {
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax <= SHRINE && az <= SHRINE && y > T2_TOP - 0.5 && y < SHRINE_TOP) return shrine;
    if (ax <= T2 && az <= T2 && y > T2_TOP - 0.5) return upper;
    if (ax <= T1 && az <= T1 && y > T1_TOP - 0.5) return temple;
    for (const w of watch) if (Math.abs(x - w.o.x) <= 3.2 && Math.abs(z - w.o.z) <= 3.2 && y > 1.5) return w.z;
    if (x >= 12.4 && x <= 19.5 && z >= -12.5 && z <= -5) return camp;
    if (Math.hypot(x, z) <= PAD_IN) return clearing;
    if (ax <= JUNGLE_EXTENT && az <= JUNGLE_EXTENT) return forest;
    return null;
  };

  /** The nearest open ground to a point (test goals in the forest must not sit inside a tree). */
  function freeNear(x: number, z: number) {
    for (let d = 0; d < 12; d += 0.5) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        const p = v(px, jungleHeight(px, pz), pz);
        if (!col.blocked(p, 0.7)) return p;
      }
    }
    return v(x, jungleHeight(x, z), z);
  }
  const testGoals = [
    v(0, T2_TOP, 0.6), v(0, T2_TOP, 5.75), v(-8.6, T1_TOP, 8.6), v(8.6, T1_TOP, -8.6), v(11.4, T1_TOP, 4), v(-11.4, T1_TOP, -4),
    v(0, 0, 19), v(15.6, 0, -8.2), v(-14.5, 0, -14.5), ...outlierNodes.map((o) => o.top.clone()),
    ...[[40, -20], [-35, 30], [-20, -45], [30, 50]].map(([x, z]) => freeNear(x, z)),
  ];

  return {
    interiors,
    trees,
    keepClear,
    start: { x: 0, z: 18.6, yaw: 0 },
    spawns,
    perches,
    coverPoints,
    cabinets,
    medkits,
    breakables,
    nav: { nodes, links, slope: 0.42 },
    zoneAt,
    testGoals,
  };
}
