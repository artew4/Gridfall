import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import type { Breakable, CabinetSpot } from '../../gameplay/Interactives';
import { mulberry32 } from '../../core/math';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import type { Zone } from '../Level';
import { BASE, CLIFF, CLIFF_RECESS, JUNGLE_EXTENT, ROAD, STRIP, TDM_YARD, baseDist, jungleHeight, roadX } from './Terrain';
import * as T from './textures';
import { Dresser, militaryMats } from '../../world/Dress';
import { propKits } from '../../entities/weapons/models';
import { crateTexture, hescoTexture, rubberTexture, sandbagTexture, stencilTexture } from '../desert/textures';

/*
  Deep Jungle, "Firebase Viper" (metres, y up, north = -z). A walled compound sits in the north half
  of the map; the player starts on the road at the south edge and fights up it to the gate.

     z=-38 ══════ T-wall ═══ postern (x -3.2..-0.8) ═══════════════════════════════
           BARRACKS (-24..-8, -35..-27)  gen  COMMS CENTER (8..22, -35..-25) + roof stair (x 22..23.4)
     W     MOTOR POOL carport (-25..-10.5, -21..-11)  flag   SUPPLY DEPOT containers (9..23, -21..-12)
   breach  HELIPAD (-18, 0)            MG nest (0, -8)            WATCHTOWER (15..19, 1..5), stair from x 8.4
   z -24..-20.5                       inner road
     z=10  ════════ T-wall ══ [tower] GATE (x ±3.5) [tower] ══ T-wall ════════════
           concertina (x ±11..27, z 15)   chicane   MG nest
                                   road (roadX(z)) south to the outer checkpoint (z ~30) and the start (z 53)

  Assault flow: jungle → road and checkpoint → cleared strip → the gate (or the west breach / north
  postern) → the yard → the buildings. The cleared strip (STRIP m of flat bare ground round the wall)
  is the kill zone; concertina wire along the south strip funnels a frontal approach to the gate.
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

export interface BaseResult {
  /** Enclosed rooms (mist and sun stay out, zones name them). */
  interiors: Interior[];
  /** Roofed or netted places the sun doesn't reach (interiors, carport, watchtower roof, depot net). */
  shade: Interior[];
  trees: TreeInfo[];
  /** Footprints foliage must stay out of (compound, road, stairs, checkpoint), as XZ rects. */
  keepClear: [number, number, number, number][];
  start: { x: number; z: number; yaw: number };
  /** Survival spawns: out in the jungle, then inside the barracks (the defenders). */
  spawns: THREE.Vector3[];
  barracksSpawns: THREE.Vector3[];
  perches: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  cabinets: CabinetSpot[];
  medkits: THREE.Vector3[];
  breakables: Breakable[];
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; slope: number };
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Points the DEV AI check sends enemies to. */
  testGoals: THREE.Vector3[];
  /** 9.0, Team Deathmatch: spawns in each yard, lanes per team (as it faces), and where the player starts. */
  tdm: { spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] }; lanes: { alpha: THREE.Vector3[][]; omega: THREE.Vector3[][] }; start: { x: number; z: number; yaw: number } };
  /** Lane points or nav nodes found inside geometry when built (must be empty). */
  layoutProblems: string[];
  /** The flag ripples. */
  update(t: number): void;
}

/** Perimeter T-wall: height (well above jump reach) and thickness (inside BASE). */
export const WALL_H = 3.4;
const WALL_T = 0.6;
/** Building walls, floor slab, door height. */
const BT = 0.3;
const SLAB = 0.12;
const DOOR_H = 2.3;
const WIN_Y0 = 1.15;
const WIN_Y1 = 2.0;
/** 9.0: the drainage culvert through the south wall (x span, clear height, length outside the wall). */
const CULVERT = { x0: -21.2, x1: -18.8, h: 2.2, len: 3.4 };
/** 9.0: the blown section of the east wall (z span). */
const EAST_BREACH = { z0: -8.5, z1: -5 };

/** Comms center roof top and the watchtower platform. */
export const COMMS_ROOF = 3.65;
export const TOWER_TOP = 4.5;

type Side = 'n' | 's' | 'w' | 'e';
interface Opening {
  side: Side;
  /** Centre along the wall (x for n/s walls, z for w/e walls). */
  at: number;
  w: number;
  y0?: number;
  y1?: number;
}

export function buildBase(scene: THREE.Scene, col: CollisionWorld, glows: Glows): BaseResult {
  const b = new StaticBuilder();
  const rnd = mulberry32(2037);
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.9, metal = 0, env = 0.3) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const m = {
    twall: std(T.concreteTexture('#7a7c72', 2), 0xffffff, 0.92),
    concrete: std(T.concreteTexture('#8a8a80', 1), 0xffffff, 0.92),
    bunker: std(T.concreteTexture('#6d7066', 1), 0xffffff, 0.95),
    olive: std(T.steelTexture('#4b5235', 8), 0xffffff, 0.6, 0.35, 0.5),
    black: std(T.steelTexture('#26282a', 4), 0xffffff, 0.55, 0.4, 0.5),
    container: std(T.steelTexture('#3f4a33', 12), 0xffffff, 0.6, 0.35, 0.4),
    rust: std(T.steelTexture('#5a3a26', 10), 0xffffff, 0.75, 0.3, 0.3),
    roof: std(T.steelTexture('#545a4a', 16), 0xffffff, 0.6, 0.4, 0.4),
    darkMetal: std(null, 0x2c2e2b, 0.5, 0.7, 0.5),
    sandbag: std(sandbagTexture(), 0x9a9a78, 0.98),
    hesco: std(hescoTexture(), 0x8a8c70, 0.95),
    canvas: std(T.tarpTexture('#47502f'), 0xffffff, 0.95),
    bark: std(T.barkTexture(), 0xffffff, 0.95, 0, 0.15),
    barkPale: std(T.barkTexture('#6f6a58'), 0xffffff, 0.95, 0, 0.15),
    rock: std(T.rockTexture(), 0xffffff, 0.95, 0, 0.15),
    moss: std(T.stoneTexture(1, '#5d6248'), 0xffffff, 0.95),
    plank: std(T.plankTexture(), 0xffffff, 0.85),
    rubber: std(rubberTexture(), 0xffffff, 0.95),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.9, 2.2) }),
    stripes: std(null, 0xb8b2a0, 0.6),
    red: std(null, 0x8a1f17, 0.6),
    net: new THREE.MeshStandardMaterial({ map: T.tarpTexture('#3c4628'), roughness: 0.95, side: THREE.DoubleSide }),
  };
  const crates = {
    ammo: std(crateTexture('7.62 × 440', 'กระสุน · AMMO', '#3f4a2c', '#d0caa0'), 0xffffff, 0.85),
    rifle: std(crateTexture('RIFLES', 'ปืนเล็กยาว · ×6', '#33392a', '#c9c39b'), 0xffffff, 0.8),
    explosive: std(crateTexture('DANGER', 'วัตถุระเบิด · HE', '#4a4630', '#e0c060'), 0xffffff, 0.85),
    med: std(crateTexture('MEDICAL', 'แพทย์ · ＋', '#c8c2b4', '#8a1f17'), 0xffffff, 0.8),
  };
  const keepClear: [number, number, number, number][] = [];
  const clear = (x0: number, z0: number, x1: number, z1: number, pad = 0.8) => keepClear.push([x0 - pad, z0 - pad, x1 + pad, z1 + pad]);

  /** A box that is both seen and solid, with the same bounds. */
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  // 69.0: the military kit (Dress.ts; docs/ENVIRONMENT_PLAN.md step 2): the sandbags, the HESCO, the
  // crates with their stencils, the jersey barriers, the drums. Without the kit, boxes.
  const kit = propKits();
  const dress = kit ? new Dresser(b, kit, militaryMats({ liner: 0xc8cbb0, canvas: 0xc4c4a6, wood: 0xd8d0c0 })) : null;
  dress?.rule(m.sandbag, 'sandbag');
  dress?.rule(m.hesco, 'hesco');
  for (const c of Object.values(crates)) dress?.rule(c, 'crate', { label: c });
  /** The jersey barriers' own material (the concrete is the buildings' too). */
  const jerseyMat = m.concrete.clone();
  dress?.rule(jerseyMat, 'jersey', { concrete: m.concrete });
  // 70.0: the containers (the moss-grown paint).
  dress?.rule(m.container, 'container', { paint: m.container });

  /** A box with its texture once per face (crates, containers). */
  const crate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'wood') => {
    b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** Waist-high cover you can vault (sandbags, jersey barriers): ≤ 1.05 m. */
  const vaultable = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', y0 = 0) => {
    const c = solid(x0, y0, z0, x1, y0 + h, z1, mat, surface, 1);
    c.vault = h <= 1.05;
    return c;
  };
  const bags = (x0: number, z0: number, x1: number, z1: number, h = 1.05, y0 = 0) => vaultable(x0, z0, x1, z1, h, m.sandbag, 'sand', y0);
  const jersey = (x0: number, z0: number, x1: number, z1: number) => vaultable(x0, z0, x1, z1, 0.95, jerseyMat);
  /** Something standing on the forest floor: from under the lowest corner to h above the highest. */
  const onGround = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
    const ys = [jungleHeight(x0, z0), jungleHeight(x1, z0), jungleHeight(x0, z1), jungleHeight(x1, z1), jungleHeight((x0 + x1) / 2, (z0 + z1) / 2)];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const c = solid(x0, lo - 0.3, z0, x1, hi + h, z1, mat, surface, 1);
    c.vault = hi + h - lo <= 1.05;
    return c;
  };
  const cylinder = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'metal', seg = 12) => {
    b.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y0 + h / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + h, surface);
  };

  /**
   * Stair = visual steps over a smooth ramp (3.3 rules), from `base` up to `top`: every tread is a
   * block down to the base, the stepped fill underneath collides for bullets and so nobody walks
   * under or through it, and the ramp is the floor. `rails` puts a stepped steel side plate on those
   * sides (each segment 1.05 m above its highest tread: not vaultable, it's a fall).
   */
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: Side[] = []) => {
    // 8.1: never into a wall (StairFit): narrowed to the face of a wall intruding into its width;
    // 9.1: and never flush with one (STAIR_GAP clear of any wall beside it).
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const steps = Math.round(H / 0.25);
    const run = L / steps;
    // 9.1: the treads stop STAIR_GAP short of a side plate. A plate overlapping the steps put its outer
    // face in the plane of every step's side face, facing the same way: they z-fought across the side.
    const w0 = (along ? z0 : x0) + (rails.includes(along ? 'n' : 'w') ? STAIR_GAP : 0);
    const w1 = (along ? z1 : x1) - (rails.includes(along ? 's' : 'e') ? STAIR_GAP : 0);
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
    // Side plates: stepped, starting where the tread is 0.5 m up (below that you just step off).
    const t = 0.08, n = 6;
    for (const side of rails) {
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n;
        if (H * k1 < 0.5) continue;
        const hi = base + H * k1 + 1.05;
        // Along the stair, k measured from the low end.
        const lo0 = rise > 0 ? (along ? x0 : z0) + L * k0 : (along ? x1 : z1) - L * k1;
        const lo1 = lo0 + L * (k1 - k0);
        if (along) {
          const f = side === 'n' ? z0 : z1 - t;
          solid(lo0, base, f, lo1, hi, f + t, m.darkMetal, 'metal', 1);
        } else {
          const f = side === 'w' ? x0 : x1 - t;
          solid(f, base, lo0, f + t, hi, lo1, m.darkMetal, 'metal', 1);
        }
      }
    }
    clear(x0, z0, x1, z1, 1.2);
  };

  /**
   * A straight wall with openings. Along x (n/s sides) it spans [a0, a1] in x at z ∈ [c0, c1];
   * along z it spans [a0, a1] in z at x ∈ [c0, c1]. Each solid stretch and each piece above/below an
   * opening is one box, seen and collided alike.
   */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, h: number, mat: THREE.Material, openings: Opening[], lintel = m.black) => {
    const ops = openings.slice().sort((p, q) => p.at - q.at);
    const piece = (p0: number, p1: number, y0: number, y1: number, mt: THREE.Material) => {
      if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
      if (alongX) solid(p0, y0, c0, p1, y1, c1, mt, 'concrete', 3);
      else solid(c0, y0, p0, c1, y1, p1, mt, 'concrete', 3);
    };
    let cur = a0;
    for (const o of ops) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, 0, h, mat);
      const y0 = o.y0 ?? 0, y1 = o.y1 ?? DOOR_H;
      piece(o0, o1, 0, y0, mat);
      piece(o0, o1, y1, y1 + 0.18, lintel);
      piece(o0, o1, y1 + 0.18, h, mat);
      cur = o1;
    }
    piece(cur, a1, 0, h, mat);
  };

  const interiors: Interior[] = [];
  const shade: Interior[] = [];

  /** Parapet ring on a roof, with an optional gap for a stair. */
  const parapet = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material, gap?: { side: Side; a: number; b: number }) => {
    const pt = 0.25;
    const run = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, side: Side) => {
      const segs: [number, number][] = gap && gap.side === side ? [[a0, gap.a], [gap.b, a1]] : [[a0, a1]];
      for (const [p0, p1] of segs) {
        if (p1 - p0 < 0.01) continue;
        if (alongX) solid(p0, y, c0, p1, y + h, c1, mat, 'concrete', 1);
        else solid(c0, y, p0, c1, y + h, p1, mat, 'concrete', 1);
      }
    };
    run(true, x0, x1, z0, z0 + pt, 'n');
    run(true, x0, x1, z1 - pt, z1, 's');
    run(false, z0 + pt, z1 - pt, x0, x0 + pt, 'w');
    run(false, z0 + pt, z1 - pt, x1 - pt, x1, 'e');
  };

  /** A rectangular concrete building: walls inside the footprint, floor slab, roof slab, parapet. */
  const building = (o: { name: string; jp: string; x0: number; z0: number; x1: number; z1: number; h: number; openings: Opening[]; parapet?: number; parapetGap?: { side: Side; a: number; b: number } }) => {
    const t = BT;
    const on = (s: Side) => o.openings.filter((p) => p.side === s);
    wall(true, o.x0, o.x1, o.z0, o.z0 + t, o.h, m.concrete, on('n'));
    wall(true, o.x0, o.x1, o.z1 - t, o.z1, o.h, m.concrete, on('s'));
    wall(false, o.z0 + t, o.z1 - t, o.x0, o.x0 + t, o.h, m.concrete, on('w'));
    wall(false, o.z0 + t, o.z1 - t, o.x1 - t, o.x1, o.h, m.concrete, on('e'));
    solid(o.x0 + t, 0, o.z0 + t, o.x1 - t, SLAB, o.z1 - t, m.bunker, 'concrete', 3);
    const rt = o.h + 0.25;
    solid(o.x0, o.h, o.z0, o.x1, rt, o.z1, m.roof, 'metal', 3);
    parapet(o.x0, o.z0, o.x1, o.z1, rt, o.parapet ?? 0.5, m.concrete, o.parapetGap);
    const room = { name: o.name, jp: o.jp, x0: o.x0 + t, z0: o.z0 + t, x1: o.x1 - t, z1: o.z1 - t, y0: 0, h: o.h };
    interiors.push(room);
    shade.push(room);
    clear(o.x0, o.z0, o.x1, o.z1, 1.0);
  };

  // ======================================================================= Perimeter
  // Precast T-walls, one continuous collider per run; the gate between two bunker towers in the
  // south, a narrow postern in the north, a breach blown in the west wall.
  const { x0: BX0, z0: BZ0, x1: BX1, z1: BZ1 } = BASE;
  const runX = (z0: number, z1: number, spans: [number, number][]) => { for (const [a, c] of spans) solid(a, 0, z0, c, WALL_H, z1, m.twall, 'concrete', WALL_H); };
  const runZ = (x0: number, x1: number, spans: [number, number][]) => { for (const [a, c] of spans) solid(x0, 0, a, x1, WALL_H, c, m.twall, 'concrete', WALL_H); };
  const GATE = 3.5, TOWER = 7.5;
  // 9.0: the south wall west of the gate is pierced by a drainage culvert (CULVERT), and the east
  // wall has a blown section (EAST_BREACH): two more ways in that don't go through the gate.
  runX(BZ1 - WALL_T, BZ1, [[BX0, CULVERT.x0], [CULVERT.x1, -TOWER], [TOWER, BX1]]);
  solid(CULVERT.x0, CULVERT.h, BZ1 - WALL_T, CULVERT.x1, WALL_H, BZ1, m.twall, 'concrete', WALL_H);
  runX(BZ0, BZ0 + WALL_T, [[BX0, -3.2], [-0.8, BX1]]);
  runZ(BX0, BX0 + WALL_T, [[BZ0 + WALL_T, -24], [-20.5, BZ1 - WALL_T]]);
  runZ(BX1 - WALL_T, BX1, [[BZ0 + WALL_T, EAST_BREACH.z0], [EAST_BREACH.z1, BZ1 - WALL_T]]);
  clear(BX0, BZ0, BX1, BZ1, STRIP - 1.5);

  // Concertina along the top of every wall run: rings of razor wire on a coil (InstancedMesh, opaque,
  // far above anyone's reach).
  const coilRings: THREE.Matrix4[] = [];
  const coil = (ax: number, az: number, bx: number, bz: number, y: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 0.28);
    const yaw = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -yaw + Math.PI / 2, 0.35 * (i % 2 ? 1 : -1), 'YXZ'));
      coilRings.push(new THREE.Matrix4().compose(new THREE.Vector3(ax + (bx - ax) * k, y, az + (bz - az) * k), q, new THREE.Vector3(1, 1, 1)));
    }
  };
  const top = WALL_H + 0.36;
  coil(BX0, BZ1 - 0.3, -TOWER, BZ1 - 0.3, top);
  coil(TOWER, BZ1 - 0.3, BX1, BZ1 - 0.3, top);
  coil(BX0, BZ0 + 0.3, -3.2, BZ0 + 0.3, top);
  coil(-0.8, BZ0 + 0.3, BX1, BZ0 + 0.3, top);
  coil(BX0 + 0.3, BZ0, BX0 + 0.3, -24, top);
  coil(BX0 + 0.3, -20.5, BX0 + 0.3, BZ1, top);
  coil(BX1 - 0.3, BZ0, BX1 - 0.3, EAST_BREACH.z0, top);
  coil(BX1 - 0.3, EAST_BREACH.z1, BX1 - 0.3, BZ1, top);
  // Ground runs of wire across the south strip, either side of the gate approach: a frontal
  // assault funnels to the gate. Tall enough not to be stepped on, solid (you go round).
  const wireRun = (x0: number, x1: number, z: number) => {
    coil(x0, z, x1, z, 0.45);
    // It stops sight too: the nav graph's corridor test must see it, or enemies would path through.
    col.add(x0, 0, z - 0.45, x1, 1.15, z + 0.45, 'metal');
  };
  wireRun(-27, -11, 15.5);
  wireRun(11, 27, 15.5);
  {
    const g = new THREE.TorusGeometry(0.42, 0.014, 3, 10);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x6d6f6a, metalness: 0.8, roughness: 0.45 }), coilRings.length);
    coilRings.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'concertina';
    mesh.userData.soft = true;
    scene.add(mesh);
  }

  // The gate: two bunker towers (solid concrete, firing slits, sandbagged tops for the snipers),
  // a gantry sign across, the steel leaves rolled open along the inside of the wall, a raised boom.
  const perches: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -TOWER : GATE, x1 = s < 0 ? -GATE : TOWER;
    solid(x0, 0, 8, x1, 4.2, 12, m.bunker, 'concrete', 4.2);
    for (const [a, c] of [[x0, x1]]) {
      // Sandbag crown (out of reach), slits on the outer and gate-side faces.
      b.add(worldBox(c - a, 0.9, 0.4, 1), m.sandbag, (a + c) / 2, 4.65, 8.2);
      b.add(worldBox(c - a, 0.9, 0.4, 1), m.sandbag, (a + c) / 2, 4.65, 11.8);
      b.add(worldBox(0.4, 0.9, 3.2, 1), m.sandbag, a + 0.2, 4.65, 10);
      b.add(worldBox(0.4, 0.9, 3.2, 1), m.sandbag, c - 0.2, 4.65, 10);
      b.add(worldBox(2.2, 0.16, 0.03), m.black, (a + c) / 2, 2.2, 12.01);
      b.add(worldBox(0.03, 0.16, 2.2), m.black, s < 0 ? c + 0.01 : a - 0.01, 2.2, 10);
    }
    perches.push(new THREE.Vector3(s * 5.5, 4.2, 10));
    // Steel gate leaf, rolled open against the inside of the wall, and its rail.
    const lx0 = s < 0 ? -TOWER - 7.2 : TOWER, lx1 = s < 0 ? -TOWER : TOWER + 7.2;
    solid(lx0, 0, BZ1 - WALL_T - 0.45, lx1, 3.0, BZ1 - WALL_T, m.olive, 'metal', 3);
    b.add(worldBox(7.2, 0.04, 0.12), m.darkMetal, (lx0 + lx1) / 2 - s * 3.6, 0.02, BZ1 - WALL_T - 0.22);
  }
  solid(-GATE, 4.2, 9.4, GATE, 4.9, 10.6, m.black, 'metal', 1);
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.62), new THREE.MeshStandardMaterial({ map: stencilTexture('FIREBASE VIPER', 'กองพันที่ ๗ · เขตหวงห้าม', '#2f3426', '#d6cfa8'), roughness: 0.8 }));
    sign.position.set(0, 4.55, 10.61);
    scene.add(sign);
  }
  // Boom barrier: post against the west tower's outer corner, the arm raised (inside the post's collider).
  col.add(-GATE, 0, 12, -GATE + 0.3, 5.3, 12.3, 'metal');
  b.add(worldBox(0.3, 1.1, 0.3), m.stripes, -GATE + 0.15, 0.55, 12.15);
  for (let i = 0; i < 8; i++) b.add(worldBox(0.12, 0.5, 0.12), i % 2 ? m.red : m.stripes, -GATE + 0.15, 1.35 + i * 0.5, 12.15);
  clear(-TOWER, 8, TOWER, 12, 1.5);

  // ======================================================================= Outside the gate
  // A chicane of jersey barriers on the road, an MG nest beside it facing south.
  jersey(-4.5, 18.6, 0.8, 19.2);
  jersey(-0.8, 22.6, 4.5, 23.2);
  bags(5.6, 17.0, 9.2, 17.6);
  bags(5.6, 17.6, 6.2, 19.8);
  bags(8.6, 17.6, 9.2, 19.8);
  clear(-5, 12, 10, 24, 0.5);
  // Warning sign at the edge of the strip.
  solid(-7.6, 0, 22.4, -7.45, 1.9, 22.55, m.darkMetal, 'metal', 1);
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), new THREE.MeshStandardMaterial({ map: stencilTexture('RESTRICTED', 'เขตหวงห้าม · ยิงได้ทันที', '#c9b45a', '#1d1c16'), roughness: 0.8, side: THREE.DoubleSide }));
    sign.position.set(-7.52, 2.2, 22.48);
    sign.rotation.y = 0.25;
    sign.userData.soft = true;
    scene.add(sign);
  }

  // The outer checkpoint up the road: a sandbag bunker west of it, a burnt-out jeep east, a barrier
  // half across the road (cover on the way in).
  {
    onGround(-9.2, 35.0, -5.2, 35.6, 1.05, m.sandbag, 'sand');
    onGround(-9.2, 32.2, -8.6, 35.0, 1.05, m.sandbag, 'sand');
    onGround(-5.8, 32.2, -5.2, 35.0, 1.05, m.sandbag, 'sand');
    const jx = roadX(26);
    jersey(jx - 2.6, 26.0, jx + 0.6, 26.6);
    // Wreck: hull and the burnt cab frame (all inside its collider).
    const wx = roadX(31) + 4.4;
    onGround(wx, 29, wx + 1.9, 33.4, 1.15, m.rust, 'metal');
    clear(-10, 25, wx + 2.5, 36.5, 0.5);
  }
  // The road itself: a mud track drawn on the ground, foliage kept off it.
  {
    const pts: number[] = [], uvs: number[] = [], idx: number[] = [];
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const z = ROAD.z0 - 3 + ((ROAD.z1 - ROAD.z0 + 3) * i) / n;
      const x = roadX(z);
      for (const k of [-1, 1]) {
        const px = x + k * (ROAD.half + 0.4);
        pts.push(px, jungleHeight(px, z) + 0.025, z);
        uvs.push(k < 0 ? 0 : 1, z / 6);
      }
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.roadTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    mesh.userData.soft = true;
    mesh.name = 'road';
    scene.add(mesh);
    for (let z = ROAD.z0; z < ROAD.z1; z += 3) clear(roadX(z + 1.5) - ROAD.half, z, roadX(z + 1.5) + ROAD.half, z + 3, 0.3);
  }

  // ======================================================================= Compound ground
  {
    const w = BX1 - BX0, d = BZ1 - BZ0;
    const g = new THREE.PlaneGeometry(w + 4, d + 4);
    g.rotateX(-Math.PI / 2);
    const tex = T.gravelTexture();
    tex.repeat.set((w + 4) / 7, (d + 4) / 7);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.position.set((BX0 + BX1) / 2, 0.01, (BZ0 + BZ1) / 2);
    mesh.receiveShadow = true;
    mesh.userData.soft = true;
    mesh.name = 'yard';
    scene.add(mesh);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: T.helipadTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-18, 0.02, 0);
    pad.receiveShadow = true;
    pad.userData.soft = true;
    scene.add(pad);
  }

  // ======================================================================= Barracks (the defenders turn out of here)
  building({
    name: 'BARRACKS', jp: 'โรงนอนทหาร', x0: -24, z0: -35, x1: -8, z1: -27, h: 3.3,
    openings: [
      { side: 's', at: -19.5, w: 1.6 }, { side: 's', at: -12.5, w: 1.6 }, { side: 'e', at: -31, w: 1.6 },
      { side: 'n', at: -21.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -17.4, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -13.6, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      { side: 's', at: -16, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: -31, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ],
  });
  // Double bunks against the north wall (gaps ≥ 2.2 m), lockers on the west wall, a table, a rifle rack.
  for (const [x0, x1] of [[-23.7, -22.8], [-20.6, -19.7], [-15.1, -14.2], [-12.0, -11.1]]) {
    solid(x0, SLAB, -34.7, x1, 1.45, -32.7, m.olive, 'metal', 1);
    b.add(worldBox(x1 - x0 - 0.06, 0.12, 1.9), m.canvas, (x0 + x1) / 2, 0.62, -33.7);
    b.add(worldBox(x1 - x0 - 0.06, 0.12, 1.9), m.canvas, (x0 + x1) / 2, 1.5, -33.7);
  }
  solid(-23.7, SLAB, -31.6, -23.15, 1.95, -28.6, m.olive, 'metal', 1);
  solid(-18.2, SLAB, -31.2, -16.2, 0.8, -30.0, m.plank, 'wood', 1);
  solid(-8.85, SLAB, -29.4, -8.3, 1.6, -27.3, m.black, 'metal', 1);
  const barracksSpawns = [[-21.2, -29.6], [-12.9, -29.4], [-17.4, -33.0]].map(([x, z]) => new THREE.Vector3(x, SLAB, z));
  // Crates of rifles by the doors, a jersey line in front (cover for the turn-out).
  crate(-23.6, 0, -26.6, -22.4, 0.6, -26.0, crates.rifle);
  crate(-23.5, 0.6, -26.55, -22.5, 1.2, -26.05, crates.ammo);
  jersey(-20.5, -23.6, -15.5, -23.0);

  // ======================================================================= Comms center (roof walk)
  building({
    name: 'COMMS CENTER', jp: 'ศูนย์สื่อสาร', x0: 8, z0: -35, x1: 22, z1: -25, h: 3.4,
    openings: [
      { side: 's', at: 12, w: 1.6 }, { side: 'w', at: -30, w: 1.6 },
      { side: 's', at: 16.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 's', at: 19.6, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: -33.2, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 },
    ],
    parapet: 1.0, parapetGap: { side: 'e', a: -34.75, b: -33.0 },
  });
  // Consoles along the north wall (monitor shelf flush behind), server racks on the east, a map table.
  solid(9.5, SLAB, -34.7, 21.0, 0.85, -33.9, m.black, 'metal', 1);
  solid(9.5, 0.85, -34.7, 21.0, 1.4, -34.4, m.darkMetal, 'metal', 1);
  solid(21.0, SLAB, -34.7, 21.7, 2.1, -29.0, m.black, 'metal', 1);
  solid(13.8, SLAB, -30.6, 16.6, 0.9, -29.0, m.olive, 'metal', 1);
  {
    // Screens: emissive strips on the shelf face (on the collider, no thickness of their own).
    const scr = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 0.55) });
    for (let x = 10.2; x < 20.5; x += 1.6) b.add(worldBox(1.1, 0.4, 0.01), scr, x, 1.12, -34.395);
    for (let z = -33.6; z < -29.4; z += 0.9) b.add(worldBox(0.01, 0.05, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.3, 0.2) }), 20.995, 1.7, z);
  }
  // Landing and the outside stair up the east wall to the roof (railing on the open east side).
  solid(22, 0, -35, 23.4, COMMS_ROOF, -33, m.concrete, 'concrete', 2);
  stair(22, -33, 23.4, -26.4, 'z', -1, 0, COMMS_ROOF, m.concrete, ['e']);
  // A steel screen on the parapet above the stair (2.2 m over the roof). Without it a runner halfway up
  // sees a target on the roof over the parapet, chases straight at it and walks into the building
  // wall (the AI check caught 20–54 s stalls there); it is cover for the roof as well.
  solid(22 - 0.25, COMMS_ROOF + 1.0, -33.0, 22, COMMS_ROOF + 2.2, -25.0, m.olive, 'metal', 1.2);
  // Roof: a radio mast and a satellite dish (each inside its own collider), aerials.
  cylinder(19.4, -27.6, 0.18, COMMS_ROOF, 11, m.darkMetal);
  for (let k = 0; k < 4; k++) b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), m.red, 19.4, COMMS_ROOF + 3 + k * 2.4, -27.6);
  solid(10.3, COMMS_ROOF, -32.9, 12.1, COMMS_ROOF + 2.4, -31.1, m.darkMetal, 'metal', 1).ray = true;
  {
    const dish = new THREE.SphereGeometry(0.95, 14, 6, 0, Math.PI * 2, 0, 0.9);
    b.add(dish, m.stripes, 11.2, COMMS_ROOF + 1.25, -32.0, -0.9, 0.5, 0);
  }
  perches.push(new THREE.Vector3(15.5, COMMS_ROOF, -29.5));

  // Generator and the electrical cabinets (shoot them to discharge into whoever stands near).
  const cabinets: CabinetSpot[] = [];
  const cab = (x: number, z: number, face: CabinetSpot['face']) => {
    const alongX = face === 'n' || face === 's';
    const w = 1.2, d = 0.5, h = 1.9;
    const c = alongX ? solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, m.olive, 'metal', 1) : solid(x - d / 2, 0, z - w / 2, x + d / 2, h, z + w / 2, m.olive, 'metal', 1);
    cabinets.push({ pos: new THREE.Vector3(x, 0, z), face, collider: c });
  };
  dress?.replace('generator', [3.0, 0, BZ0 + WALL_T], [5.6, 1.3, -35.8], { rotY: Math.PI / 2, over: { paint: m.olive }, margin: 0.05 });
  solid(3.0, 0, BZ0 + WALL_T, 5.6, 1.3, -35.8, m.olive, 'metal', 1);
  cab(7.75, -33.8, 'w');
  cab(-7.75, -34.0, 'e');
  cab(-GATE - 0.25, 7.4, 'e');

  // ======================================================================= Watchtower (by the gate, inside)
  {
    const x0 = 15, x1 = 19, z0 = 1, z1 = 5, p = 0.3, y = TOWER_TOP;
    for (const [x, z] of [[x0, z0], [x1 - p, z0], [x0, z1 - p], [x1 - p, z1 - p]]) solid(x, 0, z, x + p, y - 0.2, z + p, m.plank, 'wood', 1);
    solid(x0, y - 0.2, z0, x1, y, z1, m.plank, 'wood', 2);
    // Sandbag breastwork round the platform, open where the stair arrives (west, z 2.3..3.7). Not
    // vaultable: the far side is a 4.5 m drop.
    for (const [a0, b0, a1, b1] of [[x0, z0, x1, z0 + 0.4], [x0, z1 - 0.4, x1, z1], [x1 - 0.4, z0 + 0.4, x1, z1 - 0.4], [x0, z0 + 0.4, x0 + 0.4, 2.3], [x0, 3.7, x0 + 0.4, z1 - 0.4]]) {
      bags(a0, b0, a1, b1, 1.05, y).vault = false;
    }
    // Roof on four posts (head room 2.5 m).
    for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.2, z0 + 0.05], [x0 + 0.05, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) solid(x, y + 1.05, z, x + 0.15, y + 2.5, z + 0.15, m.plank, 'wood', 1);
    solid(x0 - 0.3, y + 2.5, z0 - 0.3, x1 + 0.3, y + 2.65, z1 + 0.3, m.roof, 'metal', 2);
    stair(7.8, 2.3, x0, 3.7, 'x', 1, 0, y, m.plank, ['n', 's']);
    perches.push(new THREE.Vector3(17.2, y, 3.2));
    shade.push({ name: 'WATCHTOWER', jp: 'หอสังเกตการณ์', x0, z0, x1, z1, y0: y - 0.5, h: y + 2.5 });
    clear(x0, z0, x1, z1, 1.0);
  }

  // ======================================================================= Motor pool (carport, vehicles)
  {
    for (const [x, z] of [[-25, -21], [-17.9, -21], [-10.75, -21], [-25, -11.25], [-17.9, -11.25], [-10.75, -11.25]]) solid(x, 0, z, x + 0.25, 4.0, z + 0.25, m.darkMetal, 'metal', 1);
    b.add(worldBox(14.8, 0.08, 10.3, 3), m.roof, -17.87, 4.04, -16.0);
    col.add(-25.2, 4.0, -21.2, -10.3, 4.08, -10.8, 'metal', false).ray = true;
    shade.push({ name: 'MOTOR POOL', jp: 'โรงซ่อมยานยนต์', x0: -25.2, z0: -21.2, x1: -10.3, z1: -10.8, y0: -1, h: 4 });
    const wheels = (x0: number, x1: number, zs: number[], r = 0.5) => {
      for (const sx of [x0 + 0.13, x1 - 0.13]) for (const z of zs) {
        const w = new THREE.CylinderGeometry(r, r, 0.26, 14);
        w.rotateZ(Math.PI / 2);
        b.add(w, m.rubber, sx, r, z);
      }
    };
    // Six-wheel truck: cab, covered bed (canvas over hoops). Wheels inside the footprint.
    // 70.0: the kit's (the truck, the jeep, the bowser over their boxes; the colliders as they were).
    dress?.replace('truck', [-23.4, 0, -19.5], [-21.0, 3.0, -12.0], { rotY: Math.PI, over: { paint: m.olive, canvas: m.canvas } });
    dress?.replace('jeep', [-18.6, 0, -18.5], [-16.8, 1.85, -14.2], { rotY: Math.PI, over: { paint: m.olive } });
    dress?.replace('bowser', [-14.4, 0, -19.5], [-12.6, 2.33, -13.5], { over: { paint: m.olive } });
    solid(-23.4, 0, -19.5, -21.0, 2.5, -17.3, m.olive, 'metal', 1.5);
    b.add(worldBox(2.2, 0.55, 0.02), m.black, -22.2, 1.95, -19.51);
    solid(-23.4, 0, -17.3, -21.0, 1.3, -12.0, m.olive, 'metal', 1.5);
    solid(-23.4, 1.3, -17.2, -21.0, 3.0, -12.0, m.canvas, 'wood', 2);
    wheels(-23.4, -21.0, [-18.5, -15.2, -13.4], 0.55);
    // Jeep (body too high to stand on; the MG on its pintle sits inside the footprint).
    solid(-18.6, 0, -18.5, -16.8, 1.15, -14.2, m.olive, 'metal', 1.5);
    b.add(worldBox(1.7, 0.45, 0.06), m.black, -17.7, 1.38, -16.9);
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), m.darkMetal, -17.7, 1.45, -15.4);
    b.add(worldBox(0.16, 0.2, 0.8), m.black, -17.7, 1.8, -15.4);
    wheels(-18.6, -16.8, [-17.7, -15.0], 0.45);
    // Fuel bowser: a tank on a trailer.
    solid(-14.4, 0, -19.5, -12.6, 0.9, -13.5, m.darkMetal, 'metal', 1);
    {
      const tank = new THREE.CylinderGeometry(0.88, 0.88, 5.8, 16);
      tank.rotateX(Math.PI / 2);
      b.add(tank, m.olive, -13.5, 1.45, -16.5);
      col.add(-14.4, 0.9, -19.4, -12.6, 2.33, -13.6, 'metal');
    }
    wheels(-14.4, -12.6, [-17.6, -15.4], 0.42);
    clear(-25.5, -21.5, -10, -10.5, 0.5);
  }

  // ======================================================================= Supply depot (containers under a camo net)
  {
    crate(9, 0, -20, 15.1, 2.6, -17.56, m.container, 'metal');
    crate(9, 0, -17.56, 15.1, 2.6, -15.12, m.container, 'metal');
    crate(9.2, 2.6, -19.9, 15.0, 5.2, -17.6, m.container, 'metal');
    crate(20.5, 0, -21, 22.94, 2.6, -14.9, m.container, 'metal');
    for (const [x, z] of [[8.5, -22], [23.35, -22], [8.5, -12.15], [23.35, -12.15]]) solid(x, 0, z, x + 0.15, 5.45, z + 0.15, m.darkMetal, 'metal', 1);
    b.add(worldBox(15.0, 0.04, 10.0, 4), m.net, 15.93, 5.47, -17.07);
    col.add(8.5, 5.45, -22, 23.5, 5.5, -12, 'wood', false).ray = true;
    shade.push({ name: 'SUPPLY DEPOT', jp: 'คลังเสบียง', x0: 8.5, z0: -22, x1: 23.5, z1: -12, y0: -1, h: 5.4 });
    // Crates: ammo on pallets, rifle crates, explosives (each stack flush or ≥ 1.4 m from the rest).
    crate(9.4, 0, -14.7, 10.6, 0.6, -13.5, crates.ammo);
    crate(9.5, 0.6, -14.6, 10.5, 1.2, -13.6, crates.ammo);
    crate(10.6, 0, -14.7, 11.8, 0.6, -13.5, crates.explosive);
    crate(16.6, 0, -12.0, 18.6, 0.5, -11.4, crates.rifle);
    crate(16.7, 0.5, -11.95, 18.5, 1.0, -11.45, crates.rifle);
    crate(23.0, 0, -13.6, 24.2, 1.2, -12.4, crates.explosive);
    clear(8.5, -22, 24.5, -11, 0.5);
  }

  // ======================================================================= Yard
  // MG nest in the middle, facing the gate; the flag; jersey lines along the inner road; drums.
  bags(-2.4, -6.6, 2.4, -6.0);
  bags(-2.4, -9.4, -1.8, -6.6);
  bags(1.8, -9.4, 2.4, -6.6);
  b.add(worldBox(0.14, 0.18, 1.0), m.black, 0, 1.16, -6.75);
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), m.darkMetal, 0, 1.2, -6.45, Math.PI / 2, 0, 0);
  col.add(-0.1, 1.05, -7.3, 0.1, 1.32, -6.0, 'metal');
  cylinder(0, -22, 0.09, 0, 9.5, m.darkMetal);
  solid(-0.7, 0, -22.7, 0.7, 0.3, -21.3, m.concrete, 'concrete', 1);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.15, 10, 1), new THREE.MeshStandardMaterial({ map: stencilTexture('◆', 'กองพันที่ ๗', '#2e3a26', '#c8b45a'), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.geometry.translate(0.95, 0, 0);
  flag.position.set(0.09, 8.8, -22);
  flag.castShadow = true;
  flag.userData.soft = true;
  scene.add(flag);
  const flagBase = (flag.geometry.attributes.position as THREE.BufferAttribute).array.slice();
  jersey(-6.0, 1.6, -2.4, 2.2);
  jersey(2.4, -2.6, 6.0, -2.0);
  jersey(-7.5, -14.6, -4.0, -14.0);
  jersey(4.0, -14.6, 7.5, -14.0);
  // Drums: rows against walls (flush, nothing to squeeze into).
  const barrels = (x: number, z: number, n: number, alongX = true) => {
    for (let i = 0; i < n; i++) {
      const cx = alongX ? x + i * 0.62 : x, cz = alongX ? z : z + i * 0.62;
      // 69.0: oil drums (each turned its own way), in the olive and rust steel.
      const at = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (cx * 7.3 + cz * 3.1) % (Math.PI * 2)), new THREE.Vector3(1, 0.92 / 0.88, 1));
      if (!dress?.place('drum', at, { paint: i % 3 === 1 ? m.rust : m.olive })) b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 14), i % 3 === 1 ? m.rust : m.olive, cx, 0.46, cz);
      col.addCylinder(cx, cz, 0.3, 0, 0.92, 'metal');
    }
  };
  barrels(BX0 + WALL_T + 0.3, 3.2, 3, false);
  barrels(18.2, BZ1 - WALL_T - 0.3, 3);
  barrels(-6.9, BZ0 + WALL_T + 0.3, 2);
  // HESCO blast walls by the barracks and in front of the comms door.
  const hesco = (x0: number, z0: number, x1: number, z1: number) => solid(x0, 0, z0, x1, 1.4, z1, m.hesco, 'sand', 1.2);
  hesco(9.6, -23.0, 14.4, -22.0); // 2 m lane in front of the comms door
  hesco(-27.4, -9.6, -24.4, -8.6);
  crate(-10.2, 0, 4.4, -9.0, 1.2, 5.6, crates.ammo);
  crate(10.6, 0, 5.4, 11.8, 0.6, 6.6, crates.med);

  // Lamps: floodlights on poles round the yard (shoot them out), bare bulbs indoors.
  const breakables: Breakable[] = [];
  const bulb = (x: number, y: number, z: number, radius = 6, warm = false) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), m.bulb.clone());
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const glow = glows.add({ pos: new THREE.Vector3(x, y, z), color: warm ? new THREE.Color(1, 0.75, 0.45) : new THREE.Color(0.9, 0.95, 1), radius, base: 0.9, haloSize: 1.2, haloStrength: 0.3, mode: 'steady' });
    const c = col.add(x - 0.14, y - 0.14, z - 0.14, x + 0.14, y + 0.14, z + 0.14, 'glass', false);
    c.ray = true;
    breakables.push({ glow, collider: c, pos: new THREE.Vector3(x, y, z), extra: [mesh.material as THREE.MeshBasicMaterial] });
  };
  const flood = (x: number, z: number, dx: number, dz: number, y0 = 0, h = 5.2) => {
    solid(x - 0.09, y0, z - 0.09, x + 0.09, y0 + h, z + 0.09, m.darkMetal, 'metal', 1);
    b.add(worldBox(0.4, 0.3, 0.25), m.black, x + dx * 0.25, y0 + h, z + dz * 0.25);
    bulb(x + dx * 0.4, y0 + h - 0.05, z + dz * 0.4, 8);
  };
  flood(-26.9, -25.4, 1, 0);
  flood(26.9, -22.4, -1, 0);
  flood(-26.9, 8.9, 1, -1);
  flood(26.9, 8.9, -1, -1);
  flood(-6.9, -21.6, 1, 0);
  flood(-GATE - 1.5, 9.0, 0, -1, 4.2, 1.6);
  flood(GATE + 1.5, 9.0, 0, -1, 4.2, 1.6);
  bulb(-20.0, 2.85, -31, 5, true);
  bulb(-12.5, 2.85, -31, 5, true);
  bulb(12.0, 2.95, -28.5, 5, true);
  bulb(18.5, 2.95, -31.5, 5, true);
  for (const [x, z] of [[-20.0, -31], [-12.5, -31], [12.0, -28.5], [18.5, -31.5]]) b.add(worldBox(0.02, 0.35, 0.02), m.darkMetal, x, 3.12, z);

  // West breach: the blown section's slabs lying outside, flush against the wall either side of the
  // gap. Plain solids, not vault rails: the vault rule ignores a rail while airborne above top - 0.62,
  // which for a slab this low is the whole jump (the stress test landed a body in one's corner).
  solid(BX0 - 2.2, 0, -26.0, BX0, 0.7, -24.0, m.twall, 'concrete', 1);
  solid(BX0 - 1.6, 0, -20.5, BX0, 0.5, -18.8, m.twall, 'concrete', 1);
  clear(BX0 - 4, -26.5, BX0 + 1, -18, 0.5);

  // 9.0, east breach: the same blown look, its slabs outside.
  solid(BX1, 0, EAST_BREACH.z0 - 2.0, BX1 + 2.2, 0.7, EAST_BREACH.z0, m.twall, 'concrete', 1);
  solid(BX1, 0, EAST_BREACH.z1, BX1 + 1.6, 0.5, EAST_BREACH.z1 + 1.7, m.twall, 'concrete', 1);
  clear(BX1 - 1, EAST_BREACH.z0 - 2.5, BX1 + 4, EAST_BREACH.z1 + 2.2, 0.5);

  // 9.0, drainage culvert: a concrete box culvert through the south wall west of the gate, its mouth
  // between the wall and the wire. A flank that skips the gate's kill zone (and the wire) entirely.
  {
    const { x0, x1, h, len } = CULVERT;
    const z0 = BZ1, z1 = BZ1 + len;
    solid(x0 - 0.4, 0, z0, x0, h + 0.4, z1, m.bunker, 'concrete', 1.5);
    solid(x1, 0, z0, x1 + 0.4, h + 0.4, z1, m.bunker, 'concrete', 1.5);
    solid(x0, h, z0, x1, h + 0.4, z1, m.bunker, 'concrete', 1.5);
    // A rusted grate frame at the mouth (above head height: decoration).
    solid(x0, h - 0.15, z1 - 0.12, x1, h, z1, m.rust, 'metal', 1);
    clear(x0 - 1, z0, x1 + 1, z1 + 1, 0.3);
  }

  // ======================================================================= TDM yards (9.0)
  // HESCO bastions 2.4 m high (well above jump reach), one exit per lane, each behind a blast wall:
  // nobody shoots into a spawn. LZ ALPHA (south, round the road's end) has three exits; LZ NORTH
  // (behind the compound, much nearer its postern) has only the two side exits, so the way from either
  // yard to the compound's middle is about as long (see the 9.0 notes).
  const YH = 2.4, YT = 0.8;
  const hescoWall = (x0: number, z0: number, x1: number, z1: number) => solid(x0, 0, z0, x1, YH, z1, m.hesco, 'sand', 1.2);
  const blast = (x0: number, z0: number, x1: number, z1: number) => solid(x0, 0, z0, x1, 2.6, z1, m.twall, 'concrete', 1.3);
  const lzYard = (r: { x0: number; z0: number; x1: number; z1: number }, frontZ: number, frontExit: number | null, sideZ: number) => {
    const back = frontZ === r.z0 ? r.z1 : r.z0;
    const fz0 = frontZ === r.z0 ? r.z0 : r.z1 - YT, bz0 = back === r.z1 ? r.z1 - YT : r.z0;
    // Front wall (towards the compound), with or without an exit.
    if (frontExit === null) hescoWall(r.x0, fz0, r.x1, fz0 + YT);
    else {
      hescoWall(r.x0, fz0, frontExit - 2, fz0 + YT);
      hescoWall(frontExit + 2, fz0, r.x1, fz0 + YT);
      const bz = frontZ === r.z0 ? fz0 - 3.8 : fz0 + YT + 3.2;
      blast(frontExit - 3.5, bz, frontExit + 3.5, bz + 0.6);
    }
    hescoWall(r.x0, bz0, r.x1, bz0 + YT);
    // Side walls with an exit each, blast walls outside them.
    const iz0 = Math.min(fz0, bz0) + YT, iz1 = Math.max(fz0, bz0);
    for (const [wx0, wx1, bx0] of [[r.x0, r.x0 + YT, r.x0 - 3.6], [r.x1 - YT, r.x1, r.x1 + 3.0]] as const) {
      solid(wx0, 0, iz0, wx1, YH, sideZ - 2, m.hesco, 'sand', 1.2);
      solid(wx0, 0, sideZ + 2, wx1, YH, iz1, m.hesco, 'sand', 1.2);
      blast(bx0, sideZ - 3.5, bx0 + 0.6, sideZ + 3.5);
    }
    clear(r.x0 - 4.5, r.z0 - 4.5, r.x1 + 4.5, r.z1 + 4.5, 0.5);
  };
  const A = TDM_YARD.alpha, Bn = TDM_YARD.omega;
  const exitA = roadX(A.z0);
  lzYard(A, A.z0, exitA, 50);
  lzYard(Bn, Bn.z1, null, -54.5);
  // Cover inside the yards (against the side walls: never in front of an exit).
  crate(-10.8, 0, 44.2, -9.6, 1.2, 45.4, crates.ammo);
  crate(9.6, 0, 55.4, 10.8, 1.2, 56.6, crates.rifle);
  crate(-10.8, 0, -49.2, -9.6, 1.2, -48.0, crates.ammo);
  crate(9.6, 0, -60.2, 10.8, 1.2, -59.0, crates.med);
  {
    // LZ NORTH is a helipad: the H in the middle of the yard.
    const h = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: T.helipadTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, (Bn.z0 + Bn.z1) / 2);
    h.receiveShadow = true;
    h.userData.soft = true;
    scene.add(h);
  }

  // ======================================================================= Forest
  /** Obstacles so far for spacing (XZ circles). */
  const taken: [number, number, number][] = [];
  const footprintFree = (x: number, z: number, r: number, gap: number) => {
    if (keepClear.some(([a0, b0, a1, b1]) => x + r + gap > a0 && x - r - gap < a1 && z + r + gap > b0 && z - r - gap < b1)) return false;
    return !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + gap);
  };
  const inForest = (x: number, z: number, margin: number) => baseDist(x, z) > STRIP + margin && Math.max(Math.abs(x), Math.abs(z)) < CLIFF - 3;
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
  const ext = CLIFF - 4;
  // The trees nearest the strip frame the kill zone; the approach road gets a pair either side.
  for (let i = 0; i < 900 && trees.filter((t) => t.giant).length < 34; i++) {
    const x = (rnd() * 2 - 1) * ext, z = (rnd() * 2 - 1) * ext, r = 0.8 + rnd() * 0.55;
    if (inForest(x, z, 2) && footprintFree(x, z, r * 1.95, 3.2)) giant(x, z, r);
  }
  for (let i = 0; i < 1200 && trees.filter((t) => !t.giant).length < 80; i++) {
    const x = (rnd() * 2 - 1) * ext, z = (rnd() * 2 - 1) * ext, r = 0.26 + rnd() * 0.2;
    if (inForest(x, z, 0.5) && footprintFree(x, z, r, 1.3)) slim(x, z, r);
  }

  // Fallen logs on the forest floor (along x or z: box colliders are axis-aligned), only where the
  // ground under them is nearly level, so they lie on it.
  const logs: [number, number, number, number, number][] = [];
  for (let i = 0; i < 500 && logs.length < 14; i++) {
    const x = (rnd() * 2 - 1) * ext, z = (rnd() * 2 - 1) * ext;
    if (!inForest(x, z, 1)) continue;
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
    const c = col.add(x - hx, lo - 0.3, z - hz, x + hx, cy + r, z + hz, 'wood');
    c.vault = true;
    taken.push([x, z, Math.max(hx, hz)]);
    logs.push([x, z, alongX ? 1 : 0, len, cy + r]);
  }

  // Mossy boulders (cover on the way in): some placed by hand along the road, the rest scattered.
  const blocks: THREE.Vector3[] = [];
  const boulder = (x: number, z: number, w: number, dd: number) => {
    const ys = [jungleHeight(x - w / 2, z - dd / 2), jungleHeight(x + w / 2, z - dd / 2), jungleHeight(x - w / 2, z + dd / 2), jungleHeight(x + w / 2, z + dd / 2)];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const h = hi - lo + 1.0 + rnd() * 0.9;
    solid(x - w / 2, lo - 0.3, z - dd / 2, x + w / 2, lo + h, z + dd / 2, rnd() < 0.5 ? m.moss : m.rock, 'concrete', 1.5);
    taken.push([x, z, Math.max(w, dd) * 0.75]);
    blocks.push(new THREE.Vector3(x + (w / 2 + 0.8) * (x > roadX(z) ? -1 : 1), 0, z));
  };
  for (const [z, side, w, dd] of [[44, -1, 2.2, 1.6], [40, 1, 1.8, 2.0], [21, -1, 2.0, 1.4], [28, -1, 1.6, 1.6], [49, 1, 2.2, 1.4]] as const) {
    const x = roadX(z) + side * (ROAD.half + 1.6 + w / 2);
    if (footprintFree(x, z, Math.max(w, dd) * 0.75, 1.5)) boulder(x, z, w, dd);
  }
  for (let i = 0; i < 400 && blocks.length < 26; i++) {
    const x = (rnd() * 2 - 1) * ext, z = (rnd() * 2 - 1) * ext;
    const w = 1.2 + rnd() * 1.3, dd = 1.0 + rnd() * 1.2;
    if (!inForest(x, z, 1) || !footprintFree(x, z, Math.max(w, dd) * 0.75, 1.5)) continue;
    boulder(x, z, w, dd);
  }

  // ======================================================================= Boundary: rock walls
  const talus: [number, number, number][] = [];
  /** Rock-wall boxes (XZ) so far: a talus rock either overlaps them or stands ≥ 0.8 m clear (no wedge). */
  const cliffBoxes: [number, number, number, number][] = [];
  const wedge = (x: number, z: number, r: number) =>
    cliffBoxes.some(([a0, b0, a1, b1]) => {
      const gap = Math.hypot(Math.max(a0 - x, 0, x - a1), Math.max(b0 - z, 0, z - b1)) - r;
      return gap > 0 && gap < 0.8;
    });
  const talusRolls: ['x' | 'z', 1 | -1, number, number, number][] = [];
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
        const c = axis === 'x'
          ? solid(sign > 0 ? c0 : -c1, y0, a, sign > 0 ? c1 : -c0, y1, a + len + 1, m.rock, 'concrete', 6)
          : solid(a, y0, sign > 0 ? c0 : -c1, a + len + 1, y1, sign > 0 ? c1 : -c0, m.rock, 'concrete', 6);
        cliffBoxes.push([c.min.x, c.min.z, c.max.x, c.max.z]);
      }
      talusRolls.push([axis, sign, a, len, inner]);
      a += len;
    }
  };
  wallSide('x', 1);
  wallSide('x', -1);
  wallSide('z', 1);
  wallSide('z', -1);
  // Talus at the foot, once every wall segment exists (so the wedge test sees the neighbours too).
  for (const [axis, sign, a, len, inner] of talusRolls) {
    if (rnd() < 0.6) {
      const r = 1.4 + rnd() * 1.8;
      const along = a + 1 + rnd() * (len - 1);
      const across = (inner - r * 0.45) * sign;
      const x = axis === 'x' ? across : along, z = axis === 'x' ? along : across;
      const near = talus.find(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 2);
      const clearOfTrees = !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 2);
      const offRoad = !(axis === 'z' && sign > 0 && Math.abs(x - roadX(z)) < ROAD.half + r + 2);
      if ((!near || Math.hypot(near[0] - x, near[1] - z) < near[2] + r - 0.6) && clearOfTrees && offRoad && !wedge(x, z, r)) {
        talus.push([x, z, r]);
        const y0 = jungleHeight(x, z) - 1;
        const h = 1.6 + rnd() * 2.6;
        b.add(new THREE.CylinderGeometry(r * 0.8, r, h + 1, 8), m.rock, x, y0 + (h + 1) / 2, z, 0, rnd() * Math.PI, 0);
        col.addCylinder(x, z, r, y0, y0 + h + 1, 'concrete');
      }
    }
  }

  dress?.finish(scene);
  if (dress) (globalThis as unknown as { __dress?: unknown }).__dress = dress.stats;
  b.build(scene);
  dress?.afterBuild(scene);
  dress?.dispose();
  scene.traverse((o) => {
    if (o.userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ======================================================================= Gameplay data
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const medkits = [v(10.2, SLAB, -26.3), v(18.3, TOWER_TOP, 1.9)];
  const coverPoints: THREE.Vector3[] = [];
  const tryCover = (p: THREE.Vector3) => {
    if (!col.blocked(p, 0.45)) coverPoints.push(p);
  };
  // Compound: behind the nest, jersey lines, HESCO, vehicles, containers, crates, building corners.
  for (const [x, z] of [[0, -10.2], [-4.2, 0.9], [4.2, -3.3], [-5.8, -15.4], [5.8, -15.4], [-18, -22.3], [12, -21.2], [-25.9, -7.6], [-24.6, -16], [-15.6, -19.8], [-11.6, -12.2],
    [12, -13.0], [17.6, -13.0], [17.6, -22.3], [24.2, -18], [-8.2, 4.0], [11.2, 4.6], [-6.5, -24.6], [6.6, -24.6], [16.6, -0.6], [21, 4], [-2, 6.5], [2, 6.5]]) tryCover(v(x, 0, z));
  for (const [x, z] of [[16, 4.2], [18.2, 2.6]]) tryCover(v(x, TOWER_TOP, z));
  for (const [x, z] of [[12.5, -26.5], [17, -28.0], [21, -26.5]]) tryCover(v(x, COMMS_ROOF, z));
  // Outside: the chicane, the MG nest, the checkpoint, the breach slabs.
  for (const [x, z] of [[-2, 17.6], [2, 24.2], [7.4, 16.2], [-7.2, 36.6], [-4, 27.4], [-30.6, -25], [-30, -19.6]]) tryCover(v(x, jungleHeight(x, z), z));
  for (const t of trees) {
    if (!t.giant) continue;
    // Behind the flare, toward the compound and to either side.
    const a = Math.atan2(t.z + 14, t.x);
    for (const da of [0, 1.4, -1.4]) {
      const d = t.flare + 0.8;
      const x = t.x - Math.cos(a + da) * d, z = t.z - Math.sin(a + da) * d;
      tryCover(v(x, jungleHeight(x, z), z));
    }
  }
  for (const [x, z, ax, , top] of logs) {
    for (const s of [-1, 1]) {
      const px = ax ? x : x + s * 1.1, pz = ax ? z + s * 1.1 : z;
      if (top - jungleHeight(px, pz) > 0.5) tryCover(v(px, jungleHeight(px, pz), pz));
    }
  }
  for (const p of blocks) tryCover(p.setY(jungleHeight(p.x, p.z)));

  // Survival spawns in the jungle: a ring 16–26 m out from the wall, all round (the road included:
  // once the player is up near the gate, those come from behind), plus a few at the south edge.
  const spawns: THREE.Vector3[] = [];
  const cx = (BX0 + BX1) / 2, cz = (BZ0 + BZ1) / 2;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2 + 0.09;
    const want = 16 + (i % 3) * 5;
    let r = 10;
    while (r < 90 && baseDist(cx + Math.cos(a) * r, cz + Math.sin(a) * r) < want) r += 0.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) > CLIFF - 6) continue;
    // Standing height as the controller sees it (the highest ground under the feet on a slope).
    const p = v(x, col.groundHeightAt(x, z, 0.3, jungleHeight(x, z) + 0.6), z);
    if (!col.blocked(p, 0.6)) spawns.push(p);
  }
  for (const x of [-34, -18, 20, 36]) {
    const p = v(x, col.groundHeightAt(x, 56, 0.3, jungleHeight(x, 56) + 0.6), 56);
    if (!col.blocked(p, 0.6)) spawns.push(p);
  }

  // ======================================================================= TDM (9.0)
  const tdmSpawns = {
    alpha: [[-8, 49], [-3, 54], [4, 49], [8, 54], [-8, 54], [-3, 49.5], [4, 54], [8, 49.5]].map(([x, z]) => v(x, 0, z)),
    omega: [[-8, -57.5], [-3, -51.5], [4, -57.5], [8, -51.5], [-8, -51.5], [-3, -57.5], [4, -51.5], [8, -57.5]].map(([x, z]) => v(x, 0, z)),
  };
  // Lane points through the forest snap to the nearest open ground (trees and rocks are scattered).
  const P = (x: number, z: number) => freeNear(x, z);
  const lane = (pts: [number, number][]) => pts.map(([x, z]) => P(x, z));
  // ALPHA's lanes as it faces north (left = west); OMEGA's as it faces south (left = east). LZ NORTH
  // has no front exit: its centre lane goes out of the west exit and round to the postern.
  const westA: [number, number][] = [[-13.6, 50], [-18, 45], [-30, 40], [-42, 24], [-46, 4], [-44, -18], [-40, -38], [-26, -50]];
  const eastA: [number, number][] = westA.map(([x, z]) => [-x, z]);
  // Each team also has a fourth lane, a flank through a way in the other team doesn't start next to:
  // ALPHA's goes out of its west exit, along the strip behind the wire and in by the drainage culvert,
  // across the motor pool and out of the west breach; OMEGA's goes out of its east exit and in by the
  // east breach, past the watchtower and out of the gate. (With three lanes and shortest-path hunting
  // the bots never used the culvert: 0% of their time in the first matches.)
  const culX = (CULVERT.x0 + CULVERT.x1) / 2, ebz = (EAST_BREACH.z0 + EAST_BREACH.z1) / 2;
  const tdmLanes = {
    alpha: [
      lane(westA),
      lane([[-13.6, 50], [-18, 45], [-29, 30], [-29, BZ1 + CULVERT.len + 0.9], [culX, BZ1 + CULVERT.len + 0.9], [culX, 6.5], [-20, -9], [-25.4, -22.25], [BX0 - 3, -22.25], [-36, -40], [-24, -48]]),
      lane([[exitA, 40.4], [0, 30], [0, 21], [0, 14], [0, 6.5], [0, -4], [-4.5, -26], [-2, BZ0 + 2.2], [-2, BZ0 - 2.6], [-2, -43.4]]),
      lane(eastA),
    ],
    omega: [
      lane([[13.6, -54.5], [26, -50], [40, -38], [44, -18], [46, 4], [42, 24], [30, 38]]),
      lane([[13.6, -54.5], [26, -48], [36, -28], [BX1 + 3, ebz], [BX1 - 2.6, ebz], [20.5, -3], [12, 0], [0, 6.5], [0, 14], [0, 21], [0, 32]]),
      lane([[-13.6, -54.5], [-14, -45], [-6, -42.6], [-2, BZ0 - 2.6], [-2, BZ0 + 2.2], [-4.5, -26], [0, -4], [0, 6.5], [0, 14], [0, 21], [0, 32]]),
      lane([[-13.6, -54.5], [-26, -50], [-40, -38], [-44, -18], [-46, 4], [-42, 24], [-30, 38]]),
    ],
  };

  // ======================================================================= Navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const N = (x: number, y: number, z: number) => nodes.push(v(x, y, z)) - 1;
  const probe = new THREE.Vector3();
  // Outside: a 6 m grid over the forest and the strip.
  for (let x = -60; x <= 60; x += 6) {
    for (let z = -60; z <= 60; z += 6) {
      if (baseDist(x, z) < 1.4) continue;
      const y = jungleHeight(x, z);
      if (col.blocked(probe.set(x, y, z), 0.6)) continue;
      N(x, y, z);
    }
  }
  // Inside: a 5 m grid over the yard (buildings and props drop out as blocked; the floor slabs too).
  const yard: number[] = [];
  for (let x = -25; x <= 25; x += 5) {
    for (let z = -35; z <= 7; z += 5) {
      if (col.blocked(probe.set(x, 0, z), 0.6)) continue;
      yard.push(N(x, 0, z));
    }
  }
  // The gateway, the breach, the postern, round the wire and the chicane, lanes round the buildings.
  for (const [x, z] of [[0, 6.5], [0, 10], [0, 14], [-9.5, 14], [9.5, 14], [-9.5, 17.5], [9.5, 17.5], [0, 21], [-2.4, 25], [3, 20], [-6.5, 15.5],
    [BX0 + 2.6, -22.25], [BX0 - 3, -22.25], [-2, BZ0 + 2.2], [-2, BZ0 - 2.6],
    [-4.5, -26], [-4.5, -31], [-4.5, -36], [5.5, -27], [6.4, -31], [24.8, -24], [8.6, -24.0], [15.4, -24.0], [25.2, -30], [25.2, -36], [-26, -24.5], [-16, -25.2], [-26, -36],
    [-9, -16], [-9.4, -22.5], [7, -16], [17.8, -16], [24.8, -12], [-26.2, -15], [-20, -9], [12, 0], [12, 8], [21.5, 7], [20.5, -3], [-12, 8], [-26, 6], [7, -10],
    // 9.0: the east breach, the culvert (inside, in it, its mouth, along the strip to the wire's end),
    // and every TDM yard exit (inside, between wall and blast wall, round the blast wall's ends).
    [BX1 - 2.6, (EAST_BREACH.z0 + EAST_BREACH.z1) / 2], [BX1 + 3, (EAST_BREACH.z0 + EAST_BREACH.z1) / 2],
    [(CULVERT.x0 + CULVERT.x1) / 2, 6.5], [(CULVERT.x0 + CULVERT.x1) / 2, BZ1 + CULVERT.len / 2], [(CULVERT.x0 + CULVERT.x1) / 2, BZ1 + CULVERT.len + 0.9], [-24.5, BZ1 + CULVERT.len + 0.9], [-29, BZ1 + CULVERT.len + 0.9],
    [exitA, 44.6], [exitA, 40.4], [exitA - 5, 38.9], [exitA + 5, 38.9],
    [-9.5, 50], [-13.6, 50], [-13.6, 45.4], [-13.6, 54.6], [-17.2, 45.4], [-17.2, 54.6],
    [9.5, 50], [13.6, 50], [13.6, 45.4], [13.6, 54.6], [17.2, 45.4], [17.2, 54.6],
    [-9.5, -54.5], [-13.6, -54.5], [-13.6, -50], [-13.6, -59], [-17.2, -50], [-17.2, -59],
    [9.5, -54.5], [13.6, -54.5], [13.6, -50], [13.6, -59], [17.2, -50], [17.2, -59],
    ...tdmLanes.alpha.flat().map((p) => [p.x, p.z]), ...tdmLanes.omega.flat().map((p) => [p.x, p.z])]) {
    const y = jungleHeight(x, z);
    if (!col.blocked(probe.set(x, y, z), 0.5)) N(x, y, z);
  }
  // Inside the buildings: both sides of every door, linked by hand through the doorway, and rooms.
  const door = (ox: number, oz: number, ix: number, iz: number) => {
    const a = N(ox, 0, oz), c = N(ix, SLAB, iz);
    links.push([a, c]);
    return c;
  };
  const room = (x: number, z: number) => N(x, SLAB, z);
  const bA = room(-21.4, -29.6), bB = room(-17.3, -29.0), bC = room(-13, -29.6), bD = room(-17.4, -33.0), bE = room(-10.2, -31);
  links.push([door(-19.5, -25.6, -19.5, -28.6), bA], [door(-12.5, -25.6, -12.5, -28.6), bC], [door(-6.6, -31, -9.6, -31), bE], [bA, bB], [bB, bC], [bB, bD], [bC, bE]);
  const cA = room(12, -28.4), cB = room(18.6, -27.2), cC = room(18.6, -31.6), cD = room(11.2, -32.4);
  links.push([door(12, -24.0, 12, -26.6), cA], [door(6.6, -30, 9.6, -30), cD], [cA, cB], [cB, cC], [cA, cD], [cD, cC]);
  // Comms stair and roof; watchtower stair and platform. These stairs are long (3.65 and 4.5 m up):
  // without a node halfway, re-planning from mid-stair picks the bottom node (height weighs heavily)
  // and the runner walks back down, over and over (the AI check caught it). Both are walled in on
  // both sides (building wall or railing), so a mid node can't auto-link to the ground beside them.
  const chain = (...pts: [number, number, number][]) => {
    const ids = pts.map(([x, y, z]) => N(x, y, z));
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
    return ids;
  };
  const cs = chain([22.7, 0, -25.3], [22.7, COMMS_ROOF / 2, -29.7], [22.7, COMMS_ROOF, -34.0], [20.6, COMMS_ROOF, -34.0]);
  for (const [x, z] of [[15.5, -29.5], [10.6, -27.2], [20.4, -26.6], [14.6, -33.4]]) links.push([cs[3], N(x, COMMS_ROOF, z)]);
  chain([6.6, 0, 3.0], [11.4, TOWER_TOP / 2, 3.0], [15.6, TOWER_TOP, 3.0], [17.4, TOWER_TOP, 3.0]);
  void yard;

  // ======================================================================= Zones
  const zone = (id: string, name: string, jp: string, rects: [number, number, number, number][] = []): Zone => ({ id, name, jp, rects });
  const zBarracks = zone('barracks', 'BARRACKS', 'โรงนอนทหาร', [[-23.7, -34.7, -8.3, -27.3]]);
  const zComms = zone('comms', 'COMMS CENTER', 'ศูนย์สื่อสาร', [[8.3, -34.7, 21.7, -25.3]]);
  const zRoof = zone('comms-roof', 'COMMS ROOF', 'ดาดฟ้าศูนย์สื่อสาร', [[8, -35, 23.4, -25]]);
  const zTower = zone('watchtower', 'WATCHTOWER', 'หอสังเกตการณ์', [[15, 1, 19, 5]]);
  const zGate = zone('gate', 'MAIN GATE', 'ประตูหลัก', [[-TOWER, 6, TOWER, 16]]);
  const zMotor = zone('motor-pool', 'MOTOR POOL', 'โรงซ่อมยานยนต์', [[BX0, -22, -10, -10]]);
  const zDepot = zone('depot', 'SUPPLY DEPOT', 'คลังเสบียง', [[8, -22.5, BX1, -11.5]]);
  const zPad = zone('helipad', 'HELIPAD', 'ลานจอดเฮลิคอปเตอร์', [[BX0, -8, -12, 8]]);
  const zYard = zone('compound', 'FIREBASE VIPER', 'ภายในฐาน', [[BX0, BZ0, BX1, BZ1]]);
  const zLzA = zone('lz-alpha', 'LZ ALPHA', 'จุดลงจอดอัลฟา', [[TDM_YARD.alpha.x0, TDM_YARD.alpha.z0, TDM_YARD.alpha.x1, TDM_YARD.alpha.z1]]);
  const zLzN = zone('lz-north', 'LZ NORTH', 'ลานจอดเหนือ', [[TDM_YARD.omega.x0, TDM_YARD.omega.z0, TDM_YARD.omega.x1, TDM_YARD.omega.z1]]);
  const zCulvert = zone('culvert', 'DRAIN CULVERT', 'ท่อระบายน้ำ', [[CULVERT.x0, BZ1 - 1, CULVERT.x1, BZ1 + CULVERT.len]]);
  const zEastBreach = zone('east-breach', 'EAST BREACH', 'ช่องทะลวงตะวันออก', [[BX1 - 3, EAST_BREACH.z0 - 2, BX1 + 4, EAST_BREACH.z1 + 2]]);
  const zStrip = zone('perimeter', 'PERIMETER', 'แนวรอบนอก', []);
  const zRoad = zone('road', 'APPROACH ROAD', 'ถนนทางเข้า', []);
  const zForest = zone('forest', 'DEEP JUNGLE', 'ป่าลึก', [[-JUNGLE_EXTENT, -JUNGLE_EXTENT, JUNGLE_EXTENT, JUNGLE_EXTENT]]);
  const inRect = (r: [number, number, number, number], x: number, z: number) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  const zoneAt = (x: number, y: number, z: number): Zone | null => {
    if (inRect(zBarracks.rects[0], x, z) && y < 3.3) return zBarracks;
    if (inRect(zComms.rects[0], x, z) && y < 3.4) return zComms;
    if (inRect(zRoof.rects[0], x, z) && y > COMMS_ROOF - 0.5) return zRoof;
    if (inRect(zTower.rects[0], x, z) && y > TOWER_TOP - 0.5) return zTower;
    if (inRect(zCulvert.rects[0], x, z)) return zCulvert;
    if (inRect(zEastBreach.rects[0], x, z)) return zEastBreach;
    if (inRect(zGate.rects[0], x, z)) return zGate;
    if (inRect(zMotor.rects[0], x, z)) return zMotor;
    if (inRect(zDepot.rects[0], x, z)) return zDepot;
    if (inRect(zPad.rects[0], x, z)) return zPad;
    if (inRect(zYard.rects[0], x, z)) return zYard;
    if (inRect(zLzA.rects[0], x, z)) return zLzA;
    if (inRect(zLzN.rects[0], x, z)) return zLzN;
    if (z > ROAD.z0 && Math.abs(x - roadX(z)) < ROAD.half + 1.5) return zRoad;
    if (baseDist(x, z) < STRIP) return zStrip;
    if (Math.abs(x) <= JUNGLE_EXTENT && Math.abs(z) <= JUNGLE_EXTENT) return zForest;
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
    v(-17.3, SLAB, -29.0), v(-10.2, SLAB, -31), v(18.6, SLAB, -31.6), v(11.2, SLAB, -32.4), v(15.5, COMMS_ROOF, -29.5), v(17.4, TOWER_TOP, 3.0),
    v(-17.9, 0, -9.5), v(17.8, 0, -13.2), v(0, 0, -11), v(0, 0, 10), v(-2, 0, BZ0 - 2.6), v(BX0 - 3, 0, -22.25), v(-6.6, 0, -24.5),
    ...[[40, -20], [-35, 30], [-20, -50], [30, 50], [0, 52]].map(([x, z]) => freeNear(x, z)),
    // 9.0: into LZ NORTH, through the culvert, through the east breach.
    v(0, 0, -55), v((CULVERT.x0 + CULVERT.x1) / 2, 0, 6.5), v(BX1 - 2.6, 0, (EAST_BREACH.z0 + EAST_BREACH.z1) / 2),
  ];

  // Every lane point on open ground, no nav node inside geometry.
  const layoutProblems: string[] = [];
  for (const [t, L] of Object.entries(tdmLanes)) for (const p of L.flat()) if (col.blocked(p, 0.6)) layoutProblems.push(`${t} lane ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  for (const [t, S] of Object.entries(tdmSpawns)) for (const p of S) if (col.blocked(p, 0.6)) layoutProblems.push(`${t} spawn ${p.x},${p.z}`);
  nodes.forEach((p, i) => {
    if (col.blocked(v(p.x, p.y, p.z), 0.35)) layoutProblems.push(`node ${i} @${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  });

  const sx = roadX(53);
  return {
    interiors,
    shade,
    trees,
    keepClear,
    start: { x: sx, z: 53, yaw: Math.atan2(sx - roadX(40), 13) },
    spawns,
    barracksSpawns,
    perches,
    coverPoints,
    cabinets,
    medkits,
    breakables,
    nav: { nodes, links, slope: 0.42 },
    zoneAt,
    testGoals,
    tdm: { spawns: tdmSpawns, lanes: tdmLanes, start: { x: 0, z: 52, yaw: 0 } },
    layoutProblems,
    update(t: number) {
      const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3];
        pos.setZ(i, Math.sin(t * 2.2 - x * 2.6) * 0.09 * (x / 1.9));
      }
      pos.needsUpdate = true;
    },
  };
}
