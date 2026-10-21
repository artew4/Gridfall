import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import type { Breakable, CabinetSpot } from '../../gameplay/Interactives';
import { mulberry32 } from '../../core/math';
import type { Zone } from '../Level';
import { CLIFF, CLIFF_RECESS, DESERT_EXTENT, desertHeight } from './Terrain';
import * as T from './textures';
import { buildArena, type ArenaResult } from './Arena';
import { arenaKeepOut } from './ArenaLayout';

/*
  Desert Outpost "Kestrel" (metres, y up, north = -z). The flat pad (y = 0) holds the compound inside
  a HESCO barrier (x ±30, z ±27) with four gates; dunes roll out to sandstone mesas at x/z ±90.

            z=-27  ════════ HESCO ═══ N gate (x 3..9) ═══════════════
                   GENERATOR (-5..-1, -24..-20)
     BARRACKS (-26..-10, -18..-11)        tents      MOTOR POOL (10..26, -20..-8)
   W gate                 flag + sandbag ring (0,0)                          E gate
   (z -6..0)    TRADING POST L (-24..-10, 8..15 + -24..-17, 15..24)          (z -4..2)
                porch on its north side      CLINIC (6..14, 10..17)   WATCHTOWER (22..27, 10..15)
                                         water tower (2, 22)          + stair on its east side
            z=27   ════════ HESCO ═══ S gate (x -10..-4) ═════════════
*/

/** Interior volumes: storm particles stay out, wind is muffled, zones name them. */
export interface Interior {
  name: string;
  jp: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Ceiling height (inside means below it). */
  h: number;
}

export interface OutpostResult {
  interiors: Interior[];
  /** Rooftops people can stand on (zones). */
  roofs: Interior[];
  start: { x: number; z: number; yaw: number };
  spawns: THREE.Vector3[];
  perches: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  cabinets: CabinetSpot[];
  medkits: THREE.Vector3[];
  breakables: Breakable[];
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; slope: number };
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Everything that moves with the wind (flag, tarps): updated each frame. */
  update(t: number, wind: number): void;
  /** 6.0: the Team Deathmatch arena (bases, spawns, lanes); its cover and nav are already merged in. */
  arena: ArenaResult;
  /**
   * 4.1: metals that catch the sun (barrels, vehicles, poles, roofing, equipment cases), with their
   * 3.7 and 4.1 surface values, so the level can switch them for the F8 comparison.
   */
  gloss: Gloss[];
}

export interface Gloss {
  mat: THREE.MeshStandardMaterial;
  legacy: { roughness: number; metalness: number };
  v4: { roughness: number; metalness: number };
}

const WALL_T = 0.3;
const SLAB = 0.12;
const DOOR_H = 2.3;
const WIN_Y0 = 1.15;
const WIN_Y1 = 2.0;

type Side = 'n' | 's' | 'w' | 'e';
interface Opening {
  side: Side;
  /** Centre along the wall (x for n/s walls, z for w/e walls). */
  at: number;
  w: number;
  /** Bottom and top of the opening (doors start at the floor). */
  y0?: number;
  y1?: number;
}

export function buildOutpost(scene: THREE.Scene, col: CollisionWorld, glows: Glows): OutpostResult {
  const b = new StaticBuilder();
  const rnd = mulberry32(1987);
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.9, metal = 0, env = 0.3) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const m = {
    plaster: std(T.plasterTexture(), 0xffffff),
    whitewash: std(T.plasterTexture('#e9e1cf'), 0xffffff),
    mud: std(T.plasterTexture('#b8946a'), 0xffffff),
    concrete: std(T.plasterTexture('#a7a29a'), 0xcfcac2, 0.92),
    roof: std(T.plasterTexture('#8e8475'), 0xb0a89c, 0.95),
    metal: std(T.corrugatedTexture(), 0xd8d0c4, 0.55, 0.45, 0.6),
    darkMetal: std(null, 0x3b3a37, 0.5, 0.7, 0.5),
    wood: std(T.woodTexture(), 0xffffff, 0.85),
    awning: new THREE.MeshStandardMaterial({ map: T.canvasTexture('#b9652e'), roughness: 0.95, side: THREE.DoubleSide }),
    tent: std(T.canvasTexture('#6f7048'), 0xffffff, 0.95),
    sandbag: std(T.sandbagTexture(), 0xffffff, 0.98),
    hesco: std(T.hescoTexture(), 0xffffff, 0.95),
    rock: std(T.rockTexture(), 0xffffff, 0.95, 0, 0.15),
    rust: std(T.corrugatedTexture(), 0x9a6a48, 0.7, 0.4, 0.4),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.4) }),
    palm: new THREE.MeshStandardMaterial({ color: 0x5b6a2e, roughness: 0.9, side: THREE.DoubleSide }),
    trunk: std(T.woodTexture(), 0x9c8466, 0.95),
  };

  /** A box that is both seen and solid, with the same bounds. */
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 1.5) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };

  /**
   * A straight wall with openings. Along x (n/s sides) it spans [a0, a1] in x at z ∈ [c0, c1];
   * along z it spans [a0, a1] in z at x ∈ [c0, c1]. Each solid stretch and each piece above/below an
   * opening is one box, seen and collided alike.
   */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, h: number, mat: THREE.Material, openings: Opening[], lintelMat = mat) => {
    const ops = openings.slice().sort((p, q) => p.at - q.at);
    const piece = (p0: number, p1: number, y0: number, y1: number, mt: THREE.Material) => {
      if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
      if (alongX) solid(p0, y0, c0, p1, y1, c1, mt);
      else solid(c0, y0, p0, c1, y1, p1, mt);
    };
    let cur = a0;
    for (const o of ops) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, 0, h, mat);
      const y0 = o.y0 ?? 0, y1 = o.y1 ?? DOOR_H;
      piece(o0, o1, 0, y0, mat);
      piece(o0, o1, y1, y1 + 0.18, lintelMat);
      piece(o0, o1, y1 + 0.18, h, mat);
      cur = o1;
    }
    piece(cur, a1, 0, h, mat);
  };

  const interiors: Interior[] = [];
  const roofs: Interior[] = [];

  /**
   * A rectangular building: walls inside the footprint (n/s walls run the full width), a floor slab,
   * a roof slab and a parapet. `parapetGap` leaves a stair opening in the parapet.
   */
  const building = (o: {
    name: string; jp: string; x0: number; z0: number; x1: number; z1: number; h: number; mat: THREE.Material;
    openings: Opening[]; parapet?: number; parapetGap?: { side: Side; a: number; b: number }; roofWalk?: boolean; roofMat?: THREE.Material;
  }) => {
    const t = WALL_T;
    const on = (s: Side) => o.openings.filter((p) => p.side === s);
    wall(true, o.x0, o.x1, o.z0, o.z0 + t, o.h, o.mat, on('n'), m.wood);
    wall(true, o.x0, o.x1, o.z1 - t, o.z1, o.h, o.mat, on('s'), m.wood);
    wall(false, o.z0 + t, o.z1 - t, o.x0, o.x0 + t, o.h, o.mat, on('w'), m.wood);
    wall(false, o.z0 + t, o.z1 - t, o.x1 - t, o.x1, o.h, o.mat, on('e'), m.wood);
    solid(o.x0 + t, 0, o.z0 + t, o.x1 - t, SLAB, o.z1 - t, m.concrete);
    const rt = o.h + 0.25;
    solid(o.x0, o.h, o.z0, o.x1, rt, o.z1, o.roofMat ?? m.roof);
    const ph = o.parapet ?? 0.5;
    if (ph > 0) parapet(o.x0, o.z0, o.x1, o.z1, rt, ph, o.mat, o.parapetGap);
    interiors.push({ name: o.name, jp: o.jp, x0: o.x0 + t, z0: o.z0 + t, x1: o.x1 - t, z1: o.z1 - t, h: o.h });
    if (o.roofWalk) roofs.push({ name: o.name + ' ROOF', jp: o.jp + ' 屋上', x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, h: rt });
  };

  /** Parapet ring on a roof, with an optional gap for a stair. */
  const parapet = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material, gap?: { side: Side; a: number; b: number }) => {
    const pt = 0.25;
    const run = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, side: Side) => {
      const segs: [number, number][] = gap && gap.side === side ? [[a0, gap.a], [gap.b, a1]] : [[a0, a1]];
      for (const [p0, p1] of segs) {
        if (p1 - p0 < 0.01) continue;
        if (alongX) solid(p0, y, c0, p1, y + h, c1, mat);
        else solid(c0, y, p0, c1, y + h, p1, mat);
      }
    };
    run(true, x0, x1, z0, z0 + pt, 'n');
    run(true, x0, x1, z1 - pt, z1, 's');
    run(false, z0 + pt, z1 - pt, x0, x0 + pt, 'w');
    run(false, z0 + pt, z1 - pt, x1 - pt, x1, 'e');
  };

  /**
   * Stair = visual steps over a smooth ramp (3.3 rules): stepped fill underneath for bullets and so
   * nobody walks under it, a railing collider on the open side.
   */
  const stair = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, top: number, openSide: Side | null) => {
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const steps = Math.round(top / 0.25);
    const run = L / steps;
    for (let i = 0; i < steps; i++) {
      const hTop = ((i + 1) * top) / steps;
      const a = rise > 0 ? i * run : L - (i + 1) * run;
      const p0 = (along ? x0 : z0) + a;
      // Each tread is a block to the floor: seen as a solid stair, collides only as the ramp below.
      if (along) b.add(worldBox(run, hTop, z1 - z0, 1), m.concrete, p0 + run / 2, hTop / 2, (z0 + z1) / 2);
      else b.add(worldBox(x1 - x0, hTop, run, 1), m.concrete, (x0 + x1) / 2, hTop / 2, p0 + run / 2);
    }
    col.addRamp(x0, z0, x1, z1, axis, rise > 0 ? 0 : top, rise > 0 ? top : 0);
    const seg = 8;
    for (let i = 1; i < seg; i++) {
      const h = (top * i) / seg;
      const a = (L * i) / seg, a2 = (L * (i + 1)) / seg;
      const c = along
        ? col.add(rise > 0 ? x0 + a : x1 - a2, 0, z0, (rise > 0 ? x0 + a : x1 - a2) + (a2 - a), h, z1, 'concrete')
        : col.add(x0, 0, rise > 0 ? z0 + a : z1 - a2, x1, h, (rise > 0 ? z0 + a : z1 - a2) + (a2 - a), 'concrete');
      c.floor = false;
    }
    if (openSide) {
      // Railing: posts and a rail you can see, a collider the same height (not vaultable: long drop).
      const t = 0.08;
      const RH = 1.05;
      const f = openSide === 'e' ? x1 - t : openSide === 'w' ? x0 : openSide === 's' ? z1 - t : z0;
      if (along) {
        solid(x0 + 0.8 * (rise > 0 ? 1 : 0), 0, f, x1 - 0.8 * (rise > 0 ? 0 : 1), top + RH, f + t, m.darkMetal, 'metal');
      } else {
        solid(f, 0, z0 + (rise > 0 ? 0.8 : 0), f + t, top + RH, z1 - (rise > 0 ? 0 : 0.8), m.darkMetal, 'metal');
      }
    }
  };

  const cylinder = (x: number, z: number, r: number, h: number, mat: THREE.Material) => {
    b.add(new THREE.CylinderGeometry(r, r, h, 12), mat, x, h / 2, z);
    return col.addCylinder(x, z, r, 0, h, 'metal');
  };
  const crateStack = (x: number, z: number, n: number) => {
    const c = 1.2;
    for (let i = 0; i < n; i++) solid(x - c / 2, i * c, z - c / 2, x + c / 2, (i + 1) * c, z + c / 2, m.wood, 'wood', 1.2);
  };

  /**
   * A rough boulder inside a vertical cylinder of radius r (its collider): a tapered prism whose
   * vertices are only ever pulled inwards and its top tilted, so the rock never pokes outside.
   */
  const boulder = (r: number, h: number) => {
    const g = new THREE.CylinderGeometry(r * 0.74, r, h, 8, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const jitter = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let k = jitter.get(key);
      if (k === undefined) jitter.set(key, (k = 0.88 + rnd() * 0.12));
      const top = y > h / 2 - 1e-3;
      p.setXYZ(i, x * k, y - (top ? rnd() * h * 0.18 + (x / r) * h * 0.08 : 0), z * k);
    }
    g.computeVertexNormals();
    return g;
  };

  // ======================================================================= Buildings
  // Barracks: two rooms (partition at x = -18 with a doorway), three outside doors, windows.
  building({
    name: 'BARRACKS', jp: '兵舎', x0: -26, z0: -18, x1: -10, z1: -11, h: 3.3, mat: m.plaster,
    openings: [
      { side: 's', at: -22.8, w: 1.4 }, { side: 's', at: -13.3, w: 1.4 }, { side: 'e', at: -14.5, w: 1.4 },
      { side: 'n', at: -23.4, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -20.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      { side: 'n', at: -15.8, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -12.6, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      { side: 's', at: -19.6, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: -14.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ],
  });
  wall(false, -17.7, -11.3, -18.15, -17.85, 3.3, m.plaster, [{ side: 'w', at: -14.5, w: 1.4 }], m.wood);
  // Bunks along the north wall (low boxes you can see over) and lockers.
  for (const x of [-25, -22.4, -16.2, -13.6]) solid(x - 0.45, SLAB, -17.7, x + 0.45, 1.25, -15.7, m.darkMetal, 'metal');
  for (const x of [-25.3, -10.7]) solid(x - 0.4, SLAB, -13.0, x + 0.4, 1.95, -11.3, m.darkMetal, 'metal');

  // Motor pool: tall hangar, a 7 m door to the yard, a side door, high windows.
  building({
    name: 'MOTOR POOL', jp: '車両整備場', x0: 10, z0: -20, x1: 26, z1: -8, h: 5, mat: m.metal, roofMat: m.metal,
    openings: [
      { side: 's', at: 16.5, w: 7, y1: 4.2 }, { side: 'e', at: -13.3, w: 1.4 },
      { side: 'w', at: -16, w: 2.4, y0: 2.8, y1: 3.8 }, { side: 'w', at: -12, w: 2.4, y0: 2.8, y1: 3.8 },
      { side: 'n', at: 14, w: 2.4, y0: 2.8, y1: 3.8 }, { side: 'n', at: 21, w: 2.4, y0: 2.8, y1: 3.8 },
    ],
    parapet: 0.3,
  });
  solid(10.3, 0, -8, 25.7, 0.05, -2, m.concrete); // apron
  // Truck: cab and covered bed (cover inside the hangar).
  solid(19.6, SLAB, -18.6, 22.0, 2.3, -16.6, m.rust, 'metal');
  solid(19.6, SLAB, -16.6, 22.0, 1.3, -11.4, m.rust, 'metal');
  solid(19.6, 1.3, -16.4, 22.0, 2.75, -11.6, m.tent, 'wood');
  solid(10.3, SLAB, -19.7, 11.2, 0.95, -15.0, m.wood, 'wood'); // workbench
  for (const [x, z] of [[24.6, -19.35], [25.25, -19.35], [24.4, -8.65]]) cylinder(x, z, 0.32, 0.95, m.rust);
  crateStack(13.0, -19.1, 2);

  // Trading post: an L with an arcade along its north side and a walkable roof (stair on the east of the south wing).
  {
    const h = 3.3, mat = m.mud, t = WALL_T;
    wall(true, -24, -10, 8, 8 + t, h, mat, [{ side: 'n', at: -15.3, w: 1.4 }, { side: 'n', at: -21, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -12, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }], m.wood);
    wall(false, 8 + t, 15 - t, -10 - t, -10, h, mat, [{ side: 'e', at: 11.5, w: 1.4 }], m.wood);
    wall(true, -17 - t, -10, 15 - t, 15, h, mat, [{ side: 's', at: -13.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }]);
    wall(false, 15, 24 - t, -17 - t, -17, h, mat, []); // no window: the outside stair runs along this wall
    wall(true, -24, -17, 24 - t, 24, h, mat, [{ side: 's', at: -20.7, w: 1.4 }], m.wood);
    wall(false, 8 + t, 24 - t, -24, -24 + t, h, mat, [{ side: 'w', at: 12, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: 19.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }]);
    solid(-24 + t, 0, 8 + t, -10 - t, SLAB, 15 - t, m.concrete);
    solid(-24 + t, 0, 15 - t, -17 - t, SLAB, 24 - t, m.concrete);
    const rt = h + 0.25;
    solid(-24, h, 8, -10, rt, 15, m.roof);
    solid(-24, h, 15, -17, rt, 24, m.roof);
    // Parapet around the L, open where the stair lands (east edge of the south wing, z 15.4..17.0).
    const ph = 1.0, pt = 0.25;
    solid(-24, rt, 8, -10, rt + ph, 8 + pt, mat);
    solid(-10 - pt, rt, 8 + pt, -10, rt + ph, 15, mat);
    solid(-17, rt, 15 - pt, -10 - pt, rt + ph, 15, mat);
    solid(-17 - pt, rt, 17.0, -17, rt + ph, 24, mat);
    solid(-24, rt, 24 - pt, -17 - pt, rt + ph, 24, mat);
    solid(-24, rt, 8 + pt, -24 + pt, rt + ph, 24 - pt, mat);
    interiors.push({ name: 'TRADING POST', jp: '交易所', x0: -24 + t, z0: 8 + t, x1: -10 - t, z1: 15 - t, h });
    interiors.push({ name: 'TRADING POST', jp: '交易所', x0: -24 + t, z0: 15 - t, x1: -17 - t, z1: 24 - t, h });
    roofs.push({ name: 'TRADING POST ROOF', jp: '交易所 屋上', x0: -24, z0: 8, x1: -10, z1: 15, h: rt });
    roofs.push({ name: 'TRADING POST ROOF', jp: '交易所 屋上', x0: -24, z0: 15, x1: -17, z1: 24, h: rt });
    // Landing (solid to the ground) and the stair down to the south.
    solid(-17, 0, 15, -15.6, rt, 17.4, m.concrete);
    stair(-17, 17.4, -15.6, 23.6, 'z', -1, rt, 'e');
    // Arcade: posts and a canvas awning along the north wall (above any jump).
    for (let x = -23.6; x <= -10.3; x += 3.3) solid(x - 0.13, 0, 5.75, x + 0.13, 2.95, 6.01, m.wood, 'wood');
    b.add(worldBox(14, 0.06, 2.3, 2), m.awning, -17, 3.0, 6.85);
    col.add(-24, 2.97, 5.7, -10, 3.03, 8, 'wood', false).ray = true;
    // Stalls inside.
    solid(-23.7, SLAB, 10.2, -21.3, 0.95, 11.0, m.wood, 'wood');
    solid(-15.0, SLAB, 13.9, -12.2, 0.95, 14.7, m.wood, 'wood');
    solid(-23.6, SLAB, 18.0, -22.8, 2.0, 22.4, m.wood, 'wood'); // shelves
  }

  // Clinic: whitewashed, a sign, beds inside.
  building({
    name: 'CLINIC', jp: '診療所', x0: 6, z0: 10, x1: 14, z1: 17, h: 3.1, mat: m.whitewash,
    openings: [
      { side: 'w', at: 13.5, w: 1.4 }, { side: 'n', at: 9.7, w: 1.4 },
      { side: 'e', at: 12.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'e', at: 15.0, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 's', at: 10, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ],
  });
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: T.clinicSignTexture(), roughness: 0.8 }));
    sign.position.set(11.6, 2.55, 9.98);
    sign.rotation.y = Math.PI;
    scene.add(sign);
    for (const x of [10.85, 13.05]) solid(x - 0.45, SLAB, 14.6, x + 0.45, 0.7, 16.6, m.whitewash);
  }

  // Watchtower: a ground room, an outside stair to its roof platform, posts and a shade canopy above.
  building({
    name: 'WATCHTOWER', jp: '監視塔', x0: 22, z0: 10, x1: 27, z1: 15, h: 3.0, mat: m.concrete,
    openings: [{ side: 'w', at: 12.5, w: 1.4 }, { side: 'n', at: 24.5, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 }, { side: 's', at: 24.5, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 }],
    parapet: 1.1, parapetGap: { side: 'e', a: 10.2, b: 11.6 }, roofWalk: true,
  });
  solid(27, 0, 10, 28.4, 3.25, 11.6, m.concrete); // landing
  stair(27, 11.6, 28.4, 16.6, 'z', -1, 3.25, 'e');
  for (const [x, z] of [[22.3, 10.3], [26.55, 10.3], [22.3, 14.55], [26.55, 14.55]]) solid(x, 3.25, z, x + 0.15, 5.6, z + 0.15, m.wood, 'wood');
  solid(21.8, 5.6, 9.8, 27.2, 5.75, 15.2, m.metal, 'metal');

  // Generator shed: open front to the south, a generator inside, a cabinet on its east wall.
  building({
    name: 'GENERATOR SHED', jp: '発電小屋', x0: -5, z0: -24, x1: -1, z1: -20, h: 2.6, mat: m.concrete,
    openings: [{ side: 's', at: -3, w: 2.0 }], parapet: 0,
  });
  solid(-4.7, SLAB, -23.7, -2.9, 1.2, -22.5, m.darkMetal, 'metal');
  const cab = (x: number, z: number, face: CabinetSpot['face']): CabinetSpot => {
    const alongX = face === 'n' || face === 's';
    const w = 1.2, d = 0.5, h = 1.9;
    const c = alongX ? solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, m.darkMetal, 'metal') : solid(x - d / 2, 0, z - w / 2, x + d / 2, h, z + w / 2, m.darkMetal, 'metal');
    return { pos: new THREE.Vector3(x, 0, z), face, collider: c };
  };
  const cabinets = [cab(-0.75, -22, 'e'), cab(10.55, -11.2, 'e')];

  // Water tower (legs collide; the tank is far above anyone's head).
  for (const [x, z] of [[0.6, 20.6], [3.1, 20.6], [0.6, 23.1], [3.1, 23.1]]) solid(x, 0, z, x + 0.3, 6.1, z + 0.3, m.darkMetal, 'metal');
  {
    const tank = new THREE.CylinderGeometry(2.0, 2.0, 3, 16);
    b.add(tank, m.rust, 2, 7.6, 22);
    col.addCylinder(2, 22, 2.0, 6.1, 9.1, 'metal');
    b.add(new THREE.ConeGeometry(2.1, 0.8, 16), m.rust, 2, 9.5, 22);
  }

  // ======================================================================= Yard
  // Sandbag ring around the flagpole (waist high: cover you can vault).
  const bags = (x0: number, z0: number, x1: number, z1: number, h = 1.05) => {
    const c = solid(x0, 0, z0, x1, h, z1, m.sandbag, 'sand', 1);
    c.vault = true;
    return c;
  };
  bags(-3, -4.3, 3, -3.7);
  bags(-4.3, -3.7, -3.7, 1.5);
  bags(3.7, -3.7, 4.3, 1.5);
  cylinder(0, 0, 0.09, 9, m.darkMetal);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), new THREE.MeshStandardMaterial({ map: T.canvasTexture('#2f5d7c'), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.geometry.translate(0.9, 0, 0);
  flag.position.set(0.09, 8.3, 0);
  flag.castShadow = true;
  scene.add(flag);
  const flagBase = (flag.geometry.attributes.position as THREE.BufferAttribute).array.slice();

  // Wrecked car, crates, barrels, barriers, tents, fuel tanks.
  solid(-8.1, 0, -6.9, -3.9, 1.0, -5.1, m.rust, 'metal');
  solid(-6.9, 1.0, -6.8, -4.9, 1.6, -5.2, m.rust, 'metal');
  crateStack(6.5, -3.5, 2);
  crateStack(-9.0, 3.0, 1);
  crateStack(16.0, 2.5, 2);
  crateStack(-14.5, -6.5, 1);
  crateStack(24.0, -1.0, 1);
  crateStack(-24.0, -3.0, 2);
  cylinder(8.8, -2.0, 0.32, 0.95, m.rust);
  const jersey = (x0: number, z0: number, x1: number, z1: number) => {
    const c = solid(x0, 0, z0, x1, 0.9, z1, m.concrete);
    c.vault = true;
  };
  jersey(3.2, -24.0, 8.8, -23.4);
  jersey(-10.4, 23.4, -4.6, 24.0);
  jersey(-26.6, -6.4, -26.0, -0.6);
  jersey(26.0, -4.4, 26.6, 1.6);
  // Tents: canvas walls with a ridge roof (all within the walls' footprint).
  const tent = (x0: number, z0: number, x1: number, z1: number) => {
    solid(x0, 0, z0, x1, 2.0, z1, m.tent, 'wood');
    solid(x0, 2.0, z0 + 0.7, x1, 2.55, z1 - 0.7, m.tent, 'wood');
  };
  tent(2.0, -16.5, 6.4, -13.2);
  tent(-8.6, -16.5, -4.2, -13.2);
  for (const z of [-22.6, -19.4]) cylinder(-8.6, z, 0.9, 2.4, m.whitewash);

  // ======================================================================= Clutter (3.5)
  // Every piece collides as exactly what you see, and sits either flush against a wall or a
  // neighbour or at least 1 m clear of everything (no body-width slots).
  const crateMats = {
    ammo: new THREE.MeshStandardMaterial({ map: T.crateTexture('5.56 × 900', '弾薬 · AMMO'), roughness: 0.85 }),
    gear: new THREE.MeshStandardMaterial({ map: T.crateTexture('KESTREL', '補給 · SUPPLY', '#6a5a3c', '#efe2b8'), roughness: 0.85 }),
    med: new THREE.MeshStandardMaterial({ map: T.crateTexture('MEDICAL', '医療 · ＋', '#d8d2c4', '#a8231f'), roughness: 0.8 }),
    case: new THREE.MeshStandardMaterial({ map: T.crateTexture('', 'CASE · 器材', '#3d3f34', '#bdb79a'), roughness: 0.6, metalness: 0.2 }),
  };
  const rubber = std(T.rubberTexture(), 0xffffff, 0.95);
  /** A box that shows its texture once per face (crates), seen and solid alike. */
  const crate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material) => {
    b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, 'wood');
  };
  /** Barrels standing in a touching row along x (or z), rims and a painted band. */
  const barrels = (x: number, z: number, n: number, alongX = true, y = 0) => {
    for (let i = 0; i < n; i++) {
      const cx = alongX ? x + i * 0.62 : x, cz = alongX ? z : z + i * 0.62;
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 14), m.rust, cx, y + 0.46, cz);
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), i % 2 ? m.darkMetal : crateMats.ammo, cx, y + 0.62, cz);
      col.addCylinder(cx, cz, 0.3, y, y + 0.92, 'metal');
    }
  };
  /** A cable spool: an upright drum with flanges (the flange radius is the collider). */
  const spool = (x: number, z: number) => {
    b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12), m.wood, x, 0.45, z);
    for (const y of [0.05, 0.9]) b.add(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), m.wood, x, y, z);
    col.addCylinder(x, z, 0.7, 0, 0.95, 'wood');
  };
  /** Stack of tyres. */
  const tyres = (x: number, z: number, n: number) => {
    for (let i = 0; i < n; i++) b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14), rubber, x, 0.13 + i * 0.27, z);
    col.addCylinder(x, z, 0.42, 0, n * 0.27, 'wood');
  };
  /** Scrap pile: rusted plates, an engine block, a sheet of roofing on top (axis-aligned, stacked). */
  const scrap = (x: number, z: number, y = 0) => {
    solid(x - 0.8, y, z - 0.6, x + 0.8, y + 0.3, z + 0.6, m.rust, 'metal');
    solid(x - 0.55, y + 0.3, z - 0.45, x + 0.45, y + 0.82, z + 0.35, m.darkMetal, 'metal');
    solid(x - 0.75, y + 0.82, z - 0.55, x + 0.7, y + 0.86, z + 0.5, m.metal, 'metal');
  };

  // Motor pool apron: barrels along the hangar wall, cable spools.
  barrels(22.5, -7.7, 3);
  spool(11.6, -4.0);
  spool(19.6, -4.4);
  // Barracks: ammo crates against the south wall, weapon cases by the east door.
  crate(-17.5, 0, -11.0, -16.5, 0.6, -10.4, crateMats.ammo);
  crate(-17.4, 0.6, -10.95, -16.6, 1.2, -10.45, crateMats.ammo);
  crate(-16.5, 0, -11.0, -15.5, 0.6, -10.4, crateMats.gear);
  crate(-10.0, 0, -17.6, -9.5, 0.45, -16.0, crateMats.case);
  crate(-10.0, 0.45, -17.5, -9.55, 0.9, -16.1, crateMats.case);
  // Generator: scrap pile, a stack of tyres against the barrier, ground cables to the buildings.
  scrap(1.6, -20.0);
  tyres(-6.8, -26.03, 3);
  // Trading post: sacks and crates by the east door; barrels in the back of the south wing.
  crate(-10.0, 0, 13.0, -9.4, 0.5, 14.4, m.tent);
  crate(-10.0, 0.5, 13.1, -9.45, 0.9, 14.0, m.tent);
  barrels(-17.6, 23.4, 2, false);
  // Clinic: medical crates under the sign.
  crate(11.0, 0, 9.4, 12.0, 0.6, 10.0, crateMats.med);
  crate(12.0, 0, 9.5, 12.8, 0.5, 10.0, crateMats.med);
  // Watchtower: supply crates at its base.
  crate(22.2, 0, 15.0, 23.2, 0.6, 15.6, crateMats.gear);
  crate(22.3, 0.6, 15.05, 23.1, 1.2, 15.55, crateMats.ammo);
  // A parked pickup ("technical") in the yard: cab and bed, wheels inside its footprint.
  {
    const x0 = 14.5, x1 = 16.5, z0 = 4.5, z1 = 9.1;
    solid(x0, 0, z0, x1, 1.65, z0 + 1.8, m.rust, 'metal');
    // Windshield: drawn on the cab's front face; the cab box is its collider (no thin wall of its own).
    b.add(worldBox(x1 - x0 - 0.2, 0.45, 0.02, 1), crateMats.case, (x0 + x1) / 2, 1.28, z0);
    solid(x0, 0, z0 + 1.8, x1, 0.9, z1, m.rust, 'metal');
    for (const sx of [x0 + 0.02, x1 - 0.24]) for (const zz of [z0 + 0.9, z1 - 0.9]) {
      const w = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14);
      w.rotateZ(Math.PI / 2);
      b.add(w, rubber, sx + 0.11, 0.38, zz);
    }
  }
  // Power poles with wires sagging between them (wires far overhead), cables along the ground.
  const poles: [number, number][] = [[-6.5, -9.5], [4.5, -9.5], [26.8, 3.2]];
  for (const [x, z] of poles) {
    cylinder(x, z, 0.13, 7.2, m.trunk);
    b.add(worldBox(1.4, 0.1, 0.1, 1), m.trunk, x, 6.8, z);
  }
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const wire = (pts: THREE.Vector3[], r: number) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5), wireMat);
    mesh.userData.soft = true;
    scene.add(mesh);
  };
  const [p0, p1, p2] = poles;
  for (const off of [-0.6, 0.6]) {
    wire([new THREE.Vector3(p0[0] + off, 6.8, p0[1]), new THREE.Vector3((p0[0] + p1[0]) / 2 + off, 6.1, (p0[1] + p1[1]) / 2), new THREE.Vector3(p1[0] + off, 6.8, p1[1])], 0.012);
    wire([new THREE.Vector3(p1[0] + off, 6.8, p1[1]), new THREE.Vector3((p1[0] + p2[0]) / 2 + off, 6.0, (p1[1] + p2[1]) / 2), new THREE.Vector3(p2[0] + off, 6.8, p2[1])], 0.012);
  }
  wire([new THREE.Vector3(-6.5, 6.6, -9.5), new THREE.Vector3(-8, 4.5, -10.6), new THREE.Vector3(-10.2, 3.4, -11.2)], 0.014);
  wire([new THREE.Vector3(-1.0, 0.25, -21.2), new THREE.Vector3(-0.2, 0.03, -18), new THREE.Vector3(1.5, 0.03, -12), new THREE.Vector3(9.0, 0.03, -8.4)], 0.03);
  wire([new THREE.Vector3(-3.4, 0.03, -19.8), new THREE.Vector3(-7, 0.03, -14), new THREE.Vector3(-9.4, 0.03, -12.2)], 0.03);

  // Interior lights: bare bulbs (shoot them out); halos in the dark rooms.
  const breakables: Breakable[] = [];
  const bulb = (x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), m.bulb.clone());
    mesh.position.set(x, y, z);
    scene.add(mesh);
    b.add(worldBox(0.02, 0.4, 0.02, 1), m.darkMetal, x, y + 0.25, z);
    const glow = glows.add({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(1, 0.72, 0.4), radius: 5, base: 0.9, haloSize: 1.1, haloStrength: 0.35, mode: 'steady' });
    const c = col.add(x - 0.12, y - 0.12, z - 0.12, x + 0.12, y + 0.12, z + 0.12, 'glass', false);
    c.ray = true;
    breakables.push({ glow, collider: c, pos: new THREE.Vector3(x, y, z), extra: [mesh.material as THREE.MeshBasicMaterial] });
  };
  bulb(-21.6, 2.85, -14.5);
  bulb(-14, 2.85, -14.5);
  bulb(18, 4.5, -14);
  bulb(-17, 2.85, 11.5);
  bulb(-20.5, 2.85, 20);
  bulb(10, 2.65, 13.5);
  bulb(24.5, 2.7, 12.5);

  // ======================================================================= Perimeter (HESCO, four gates)
  const hesco = (x0: number, z0: number, x1: number, z1: number) => solid(x0, 0, z0, x1, 1.5, z1, m.hesco, 'sand', 1.2);
  const H = 0.55;
  const lineX = (z: number, gaps: [number, number][]) => {
    let cur = -30 - H;
    for (const [g0, g1] of gaps) {
      hesco(cur, z - H, g0, z + H);
      cur = g1;
    }
    hesco(cur, z - H, 30 + H, z + H);
  };
  const lineZ = (x: number, gaps: [number, number][]) => {
    let cur = -27 + H;
    for (const [g0, g1] of gaps) {
      hesco(x - H, cur, x + H, g0);
      cur = g1;
    }
    hesco(x - H, cur, x + H, 27 - H);
  };
  lineX(-27, [[3, 9]]);
  lineX(27, [[-10, -4]]);
  lineZ(-30, [[-6, 0]]);
  lineZ(30, [[-4, 2]]);

  // ======================================================================= Dune field
  // Boulders, a burnt-out truck, low ruins: cover out in the storm.
  // 6.0: scattered in the south half and repeated rotated 180° (the arena is point-symmetric), clear
  // of the arena's structures.
  const rocks: [number, number, number][] = [];
  for (let i = 0; i < 120 && rocks.length < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 40 + rnd() * 42;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rad = 0.8 + rnd() * 1.6;
    const h = 1.2 + rnd() * 2.2;
    const spin = rnd() * Math.PI;
    if (z <= 2 || (Math.abs(x) < 34 && Math.abs(z) < 31) || arenaKeepOut(x, z, rad + 2)) continue;
    // Never closer than 2 m to another rock (no body-wide slots between them), its twin included.
    if (rocks.some(([rx, rz, rr]) => Math.hypot(rx - x, rz - z) < rr + rad + 2 || Math.hypot(rx + x, rz + z) < rr + rad + 2)) continue;
    for (const [px, pz] of [[x, z], [-x, -z]]) {
      rocks.push([px, pz, rad]);
      const y0 = desertHeight(px, pz) - 0.6;
      b.add(boulder(rad, h + 0.6), m.rock, px, y0 + (h + 0.6) / 2, pz, 0, spin, 0);
      col.addCylinder(px, pz, rad, y0, y0 + h + 0.6, 'concrete');
    }
  }
  // (The 3.4 ruins, burnt truck and salvage dumps stood where the arena's hamlet and wadi are now:
  // their cover is the arena's.)
  const dumps: THREE.Vector3[] = [];

  // Dry brush: crossed alpha-cut cards of twigs (cloth-soft: you brush through them). One merged
  // mesh for all of them; outside the collision world and the static registry.
  {
    const card = new THREE.PlaneGeometry(1.1, 0.75);
    card.translate(0, 0.36, 0);
    const parts: THREE.BufferGeometry[] = [];
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {
      const x = (rnd() - 0.5) * 172, z = (rnd() - 0.5) * 172;
      if ((Math.abs(x) < 32 && Math.abs(z) < 29) || arenaKeepOut(x, z, 1)) continue;
      const sc = 0.6 + rnd() * 0.9;
      const yaw = rnd() * Math.PI;
      for (let k = 0; k < 3; k++) {
        mtx.compose(new THREE.Vector3(x, desertHeight(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (k * Math.PI) / 3, 0)), new THREE.Vector3(sc, sc, sc));
        parts.push(card.clone().applyMatrix4(mtx));
      }
    }
    const brushMat = new THREE.MeshStandardMaterial({ map: T.brushTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xd8c8a8 });
    const brush = new THREE.Mesh(mergeGeometries(parts)!, brushMat);
    for (const p of parts) p.dispose();
    card.dispose();
    brush.userData.soft = true;
    brush.castShadow = true;
    scene.add(brush);
  }
  // Palms by the clinic and the trading post (trunks collide; fronds far above).
  for (const [x, z] of [[16.4, 18.6], [4.2, 16.5], [-8.6, 18.0]]) {
    cylinder(x, z, 0.22, 6.5, m.trunk);
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.PlaneGeometry(0.7, 3.2);
      leaf.translate(0, 1.6, 0);
      const a = (k / 7) * Math.PI * 2;
      b.add(leaf, m.palm, x, 6.4, z, -1.05, a, 0);
    }
  }

  // ======================================================================= Boundary: sandstone mesas
  // Continuous walls of stacked strata, far taller than any sand bank against them.
  const talus: [number, number, number][] = [];
  // Rocks and salvage dumps keep the talus clear of them as well.
  for (const [x, z, r] of rocks) talus.push([x, z, r]);
  const mesaSide = (axis: 'x' | 'z', sign: 1 | -1) => {
    let a = -CLIFF - 14;
    while (a < CLIFF + 14) {
      const len = 9 + rnd() * 13;
      const inner = CLIFF - 0.66 + rnd() * (CLIFF_RECESS + 0.66);
      const depth = 8 + rnd() * 6;
      const h1 = 14 + rnd() * 6;
      const h2 = h1 + 3 + rnd() * 6;
      const tiers: [number, number, number][] = [[inner, -3, h1], [inner + 1.5 + rnd() * 2, h1, h2]];
      for (const [c0, y0, y1] of tiers) {
        const c1 = inner + depth;
        if (axis === 'x') solid(sign > 0 ? c0 : -c1, y0, a, sign > 0 ? c1 : -c0, y1, a + len + 1, m.rock, 'concrete', 6);
        else solid(a, y0, sign > 0 ? c0 : -c1, a + len + 1, y1, sign > 0 ? c1 : -c0, m.rock, 'concrete', 6);
      }
      // Talus at the foot: boulders sunk into the cliff face (always overlapping it, so no slot
      // opens between rock and cliff), and either overlapping or ≥ 2 m apart from each other.
      if (rnd() < 0.7) {
        const r = 1.6 + rnd() * 2.2;
        const along = a + 1 + rnd() * (len - 1);
        const across = (inner - r * 0.45) * sign;
        const x = axis === 'x' ? across : along, z = axis === 'x' ? along : across;
        const near = talus.find(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 2);
        if (!near || Math.hypot(near[0] - x, near[1] - z) < near[2] + r - 0.6) {
          talus.push([x, z, r]);
          const y0 = desertHeight(x, z) - 1;
          const h = 1.8 + rnd() * 3.5;
          b.add(boulder(r, h + 1), m.rock, x, y0 + (h + 1) / 2, z, 0, rnd() * Math.PI, 0);
          col.addCylinder(x, z, r, y0, y0 + h + 1, 'concrete');
        }
      }
      a += len;
    }
  };
  mesaSide('x', 1);
  mesaSide('x', -1);
  mesaSide('z', 1);
  mesaSide('z', -1);

  const arena = buildArena({
    b, col, scene, rnd, boulder,
    mats: { mud: m.mud, hesco: m.hesco, concrete: m.concrete, sandbag: m.sandbag, rock: m.rock, rust: m.rust, darkMetal: m.darkMetal, tent: m.tent, wood: m.wood, crate: crateMats.gear },
    flag: (c) => T.canvasTexture(c),
  });

  b.build(scene);
  scene.traverse((o) => {
    if (o.userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ======================================================================= Gameplay data
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const medkits = [v(-12.0, SLAB, -13.6), v(9.0, SLAB, 15.6)];
  const perches = [v(24.5, 3.25, 12.5), v(-20.5, 3.55, 20.5), v(-12.0, 3.55, 11.5)];
  const coverPoints: THREE.Vector3[] = [];
  for (const [x, z] of [
    [0, -5.4], [-5.4, -1], [5.4, -1], [-6, -8.4], [-2.4, -6], [6.5, -1.6], [6.5, -5.4], [-9, 1], [-9, 5],
    [16, 0.5], [16, 4.5], [24, 1], [-14.5, -4.5], [-26, -1], [-26, -5], [8.2, -4], [-28.4, -3], [28.4, -1],
    [6, -25.6], [-7, 25.6], [-31.6, -3], [31.6, -1], [6, -28.6], [-7, 28.6],
    [20.5, -10], [12.5, -10], [-17, 4.5], [-12, 4.5], [4.8, 13], [15.5, 12], [21, 17.5], [-15, 26],
    // 3.5 clutter.
    [24.2, -6.6], [12.9, -3.9], [-17, -9.6], [-8.8, -16.8], [1.6, -18.6], [-8.6, 13.7], [17.6, 7], [13.4, 7], [22.7, 16.6],
  ]) {
    const p = v(x, desertHeight(x, z), z);
    if (!col.blocked(p, 0.45)) coverPoints.push(p);
  }
  for (const p of dumps) if (!col.blocked(p, 0.45)) coverPoints.push(p);
  for (const p of arena.coverPoints) if (!col.blocked(p, 0.45)) coverPoints.push(p);

  // Survival spawns: out in the dune field, all round, beyond the barrier.
  const spawns: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.07;
    const r = 66 + (i % 3) * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    spawns.push(v(x, desertHeight(x, z), z));
  }

  // ======================================================================= Navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const N = (x: number, y: number, z: number) => nodes.push(v(x, y, z)) - 1;
  const insideBuilding = (x: number, z: number, pad: number) =>
    interiors.some((r) => x > r.x0 - pad - WALL_T && x < r.x1 + pad + WALL_T && z > r.z0 - pad - WALL_T && z < r.z1 + pad + WALL_T) ||
    (x > 26.5 && x < 29 && z > 9.5 && z < 17.2) || (x > -17.5 && x < -15 && z > 14.5 && z < 24.2);
  const probe = new THREE.Vector3();
  for (let x = -81; x <= 81; x += 9) {
    for (let z = -81; z <= 81; z += 9) {
      if (insideBuilding(x, z, 1.2)) continue;
      const y = desertHeight(x, z);
      if (col.blocked(probe.set(x, y, z), 0.6)) continue;
      N(x, y, z);
    }
  }
  // Gates (both sides) and the yard between the buildings.
  for (const [x, z] of [[6, -29.5], [6, -24.5], [-7, 29.5], [-7, 24.5], [-32.5, -3], [-27.5, -3], [32.5, -1], [27.5, -1],
    [0, -8], [-7, -9], [7, -6], [12, -5], [20, -4], [-6, 5], [3, 6], [-12, 1], [-20, 1], [-27, 5], [-27, -20], [-20, -22], [-12, -22], [-6, -26],
    [5, -18], [9, -24], [16, -24], [27, -22], [28, -8], [28, 7], [20, 8], [15, 7.5], [3, 9], [-3, 13], [-6, 20], [-12, 25], [-26, 25.5], [-27, 12],
    [16, 13], [19, 18.5], [10, 19], [3, 18], [28.5, 19], [-8, 9]]) {
    const y = desertHeight(x, z);
    if (!col.blocked(probe.set(x, y, z), 0.5)) N(x, y, z);
  }
  // Inside: room centres and both sides of every door, linked by hand through the doorway.
  const door = (ox: number, oz: number, ix: number, iz: number) => {
    const a = N(ox, 0, oz), c = N(ix, SLAB, iz);
    links.push([a, c]);
    return c;
  };
  const room = (x: number, z: number) => N(x, SLAB, z);
  // Barracks.
  const bW = room(-22, -14.5), bE = room(-14, -14.5);
  links.push([door(-22.8, -9.8, -22.8, -12.4), bW], [door(-13.3, -9.8, -13.3, -12.4), bE], [door(-8.8, -14.5, -11.2, -14.5), bE]);
  const pa = N(-19.2, SLAB, -14.5), pb = N(-16.8, SLAB, -14.5);
  links.push([bW, pa], [pa, pb], [pb, bE]);
  // Motor pool.
  const mp = room(15, -14), mp2 = room(23.5, -10.2);
  const mi = door(16.5, -6.5, 16.5, -9.5);
  links.push([mi, mp], [mi, mp2], [door(27.5, -13.3, 24.8, -13.3), mp2]);
  // Trading post.
  const tA = room(-17, 11.5), tA2 = room(-21.5, 12.5), tB = room(-20.5, 19.5);
  links.push([door(-15.3, 6.6, -15.3, 9.4), tA], [door(-8.6, 11.5, -11.4, 11.5), tA], [door(-20.7, 25.4, -20.7, 22.6), tB], [tA, tA2], [tA2, tB]);
  // Trading post stair and roof.
  const tsb = N(-16.3, 0, 24.6), tsm = N(-16.3, 1.75, 20.5), tst = N(-16.3, 3.55, 16.2), tr1 = N(-19, 3.55, 16.4), tr2 = N(-20.5, 3.55, 20.5), tr3 = N(-17, 3.55, 11.5), tr4 = N(-12, 3.55, 11.5);
  links.push([tsb, tsm], [tsm, tst], [tst, tr1], [tr1, tr2], [tr1, tr3], [tr3, tr4]);
  // Clinic.
  const cl = room(10, 13.5);
  links.push([door(4.6, 13.5, 7.4, 13.5), cl], [door(9.7, 8.6, 9.7, 11.4), cl]);
  // Watchtower room, stair and platform.
  const wt = room(24.5, 12.5);
  links.push([door(20.6, 12.5, 23.4, 12.5), wt]);
  const wsb = N(27.7, 0, 17.6), wsm = N(27.7, 1.6, 14.1), wst = N(27.7, 3.25, 10.8), wp = N(24.5, 3.25, 12.5);
  links.push([wsb, wsm], [wsm, wst], [wst, wp]);
  // Generator shed.
  const gs = room(-3, -21.4);
  links.push([door(-3, -18.6, -3, -20.6), gs]);
  // The arena: bases, chicanes, hamlet doorways, pump houses, lanes (hand links where auto ones can't
  // see round a corner). A node a wall swallowed is dropped (and its links with it).
  {
    const idx = arena.nodes.map((p) => (col.blocked(probe.set(p.x, p.y, p.z), 0.45) ? -1 : N(p.x, p.y, p.z)));
    for (const [i, j] of arena.links) if (idx[i] >= 0 && idx[j] >= 0) links.push([idx[i], idx[j]]);
  }

  // ======================================================================= Zones
  const yard: Zone = { id: 'yard', name: 'OUTPOST YARD', jp: '基地構内', rects: [[-30, -27, 30, 27]] };
  const dunes: Zone = { id: 'dunes', name: 'DUNE FIELD', jp: '砂丘', rects: [[-DESERT_EXTENT, -DESERT_EXTENT, DESERT_EXTENT, DESERT_EXTENT]] };
  const zoneOf = new Map<string, Zone>();
  const zoneFor = (r: Interior) => {
    let z = zoneOf.get(r.name);
    if (!z) zoneOf.set(r.name, (z = { id: r.name.toLowerCase().replace(/\s+/g, '-'), name: r.name, jp: r.jp, rects: [] }));
    z.rects.push([r.x0, r.z0, r.x1, r.z1]);
    return z;
  };
  const inside = [...roofs.map((r) => ({ r, z: zoneFor(r) })), ...interiors.map((r) => ({ r, z: zoneFor(r) }))];
  for (const a of arena.zones) a.zone.rects.push(a.rect);
  const zoneAt = (x: number, y: number, z: number): Zone | null => {
    for (const { r, z: zn } of inside) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && (r.name.endsWith('ROOF') ? y > r.h - 0.5 : y < r.h)) return zn;
    for (const a of arena.zones) if (x >= a.rect[0] && x <= a.rect[2] && z >= a.rect[1] && z <= a.rect[3]) return a.zone;
    if (x >= -30 && x <= 30 && z >= -27 && z <= 27) return yard;
    if (Math.abs(x) <= DESERT_EXTENT && Math.abs(z) <= DESERT_EXTENT) return dunes;
    return null;
  };

  // 4.1: the debris and vehicles get glossier and more metallic, so the blazing sun leaves specular
  // glints bright enough to bloom; sand, rock and plaster stay matte (roughness 0.9-0.95).
  const gloss: Gloss[] = [
    [m.darkMetal, 0.28, 0.8],
    [m.rust, 0.42, 0.6],
    [m.metal, 0.33, 0.62],
    [crateMats.case, 0.34, 0.5],
  ].map(([mat, roughness, metalness]) => {
    const mm = mat as THREE.MeshStandardMaterial;
    return { mat: mm, legacy: { roughness: mm.roughness, metalness: mm.metalness }, v4: { roughness: roughness as number, metalness: metalness as number } };
  });

  return {
    arena,
    gloss,
    interiors,
    roofs,
    start: { x: 0, z: 8, yaw: 0 },
    spawns,
    perches,
    coverPoints,
    cabinets,
    medkits,
    breakables,
    nav: { nodes, links, slope: 0.32 },
    zoneAt,
    update(t: number, wind: number) {
      // The flag ripples harder in the storm.
      const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3];
        const k = x / 1.8;
        pos.setZ(i, Math.sin(t * (4 + wind * 6) - x * 3) * 0.12 * k * (0.4 + wind));
      }
      pos.needsUpdate = true;
      flag.rotation.y = -0.4 - wind * 0.3;
    },
  };
}
