import { Dresser } from '../../world/Dress';
import { propKits } from '../../entities/weapons/models';
import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import type { Breakable, CabinetSpot } from '../../gameplay/Interactives';
import { mulberry32 } from '../../core/math';
import type { Zone } from '../Level';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import { CISTERN, CLIFF, CLIFF_RECESS, CULVERT, DESERT_EXTENT, desertHeight, underFloor, underOpen } from './Terrain';
import * as T from './textures';
import { buildArena, type ArenaResult } from './Arena';
import { rock } from '../../world/Nature';
import { arenaKeepOut, inRuins } from './ArenaLayout';

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

  12.0 (Desert 2.0): the barracks, motor pool and clinic roofs are walkable (stairs, crates), joined by
  a skybridge (north) and two bridges (south); the culvert runs under the yard from the west gate to
  the east gate (Terrain.ts CULVERT); every side of the HESCO has a breach and a vaultable slump.
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
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; slope: number; windows: [number, number][] };
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
/** A gap in a parapet: on `side`, from `a` to `b` along it. */
interface Gap {
  side: Side;
  a: number;
  b: number;
}
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
    // 38.0: the ruins' masonry: a pale weathered face each block tints (InstancedMesh colours).
    sandstone: std(T.plasterTexture('#ece2d0'), 0xffffff, 0.95, 0, 0.2),
    // 70.0: the convoy's burnt paint (mottled, not ribbed) and the APC's faded desert tan.
    burnt: std(T.plasterTexture('#5e4232'), 0x9a8a80, 0.85, 0.3, 0.35),
    tan: std(T.plasterTexture('#a08a64'), 0xb8ab90, 0.75, 0.25, 0.4),
    // 46.0: the flank Block's warm ochre plaster.
    housePlaster: std(T.plasterTexture('#d6b98e'), 0xffffff),
    // 56.0: the Cistern's concrete: faintly self-lit (no sun reaches it, and a point light more a
    // slot costs every lit pixel on the map), so its walls read in the dark.
    cistern: (() => {
      const map = T.plasterTexture('#9d978b');
      const mat = std(map, 0xcfc8bb, 0.92);
      mat.emissive.set(0x5a5246);
      mat.emissiveMap = map;
      mat.emissiveIntensity = 0.85;
      return mat;
    })(),
  };

  // 68.0: the military cover kit (Dress.ts): the sandbags, the HESCO, the crates and cases, the drums,
  // modelled in Blender, drawn where their boxes were (the boxes stay solid). Without the kit, boxes.
  const kit = propKits();
  const dress = kit
    ? new Dresser(b, kit, {
        wood: m.wood,
        metal: m.darkMetal,
        rope: std(T.canvasTexture('#7a6646'), 0xffffff, 0.95),
        label: m.wood,
        plastic: std(null, 0x3d3f34, 0.55, 0.05, 0.5),
        paint: std(null, 0x4a5232, 0.6, 0.3, 0.5),
        canvas: std(T.canvasTexture('#ad9670'), 0xffffff, 0.97),
        liner: (() => {
          const t = (m.hesco.map as THREE.Texture).clone();
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(1.7, 1.7);
          t.needsUpdate = true;
          return std(t, 0xffffff, 0.95);
        })(),
        wire: std(null, 0x3a3b38, 0.5, 0.6, 0.5),
        rubber: std(T.rubberTexture(), 0xffffff, 0.9, 0, 0.2),
        cable: std(null, 0x1b1c1e, 0.6, 0.1, 0.3),
        glass: std(null, 0x101418, 0.15, 0.3, 1.0),
        rust: m.rust,
        light: new THREE.MeshStandardMaterial({ color: 0xe8e0c8, emissive: 0x332e22, roughness: 0.2, metalness: 0.1 }),
        dark: std(null, 0x1c1d1f, 0.75, 0.25, 0.3),
        chrome: std(null, 0xb8bcc0, 0.25, 0.9, 1.0),
        // 71.0: the architecture's.
        trim: std(T.woodTexture(), 0xa08060, 0.85),
        bark: m.trunk,
        frond: m.palm,
        enamel: std(null, 0x3d6a58, 0.35, 0.2, 0.6),
      })
    : null;
  dress?.rule(m.sandbag, 'sandbag');
  dress?.rule(m.hesco, 'hesco');
  /** The drums' paints (olive, blue, rust red). */
  const drumPaint = [std(null, 0x4a5232, 0.6, 0.3, 0.5), std(null, 0x2e4560, 0.55, 0.35, 0.5), std(null, 0x7a3b22, 0.65, 0.3, 0.45)];

  /** A box that is both seen and solid, with the same bounds. */
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 1.5) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };

  // 71.0: the architecture's dressing (props_desert.py): a frame round every opening (both faces),
  // on the outside the shutters folded back flat to the wall beside a window, a door leaf open flat
  // beside a door, now and then an air conditioner over the head height. Seen only: nothing is solid,
  // nothing stands off the wall more than a hand (the AC is over the heads).
  const seg = (a: THREE.Vector3, c: THREE.Vector3, k = 1) => {
    const d = c.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
    return new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), q, new THREE.Vector3(d.length() * k, 1, 1));
  };
  /** A piece on a wall's face: `p` along the wall, `y` up, `c` the face's plane; its +Z out of the wall. */
  const onFace = (alongX: boolean, p: number, y: number, c: number, sgn: 1 | -1, sx = 1, sy = 1, sz = 1) => {
    const rot = alongX ? (sgn > 0 ? 0 : Math.PI) : sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
    const at = alongX ? new THREE.Vector3(p, y, c) : new THREE.Vector3(c, y, p);
    return new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(sx, sy, sz));
  };
  const dressStats = { frames: 0, shutters: 0, doors: 0, acs: 0 };
  const dressWall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, h: number, ops: Opening[], out?: 1 | -1) => {
    if (!dress?.size('jamb')) return;
    const J = 0.14;
    const busy: [number, number][] = ops.map((o) => [o.at - o.w / 2 - J, o.at + o.w / 2 + J]);
    const free = (p0: number, p1: number) => p0 >= a0 + 0.05 && p1 <= a1 - 0.05 && busy.every(([q0, q1]) => p1 <= q0 || p0 >= q1);
    for (const o of ops) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      const y0 = o.y0 ?? 0, y1 = o.y1 ?? DOOR_H, isDoor = y0 <= 0;
      for (const [c, sgn] of [[c0, -1], [c1, 1]] as [number, 1 | -1][]) {
        for (const p of [o0 - J / 2, o1 + J / 2]) dress.place('jamb', onFace(alongX, p, y0, c, sgn, 1, y1 - y0 + (isDoor ? 0 : 0.06), 1));
        dress.place('head', onFace(alongX, o.at, y1, c, sgn, o.w + 2 * J));
        if (!isDoor) dress.place('sill', onFace(alongX, o.at, y0 - 0.11, c, sgn, o.w + 0.2));
        dressStats.frames++;
      }
      if (!out) continue;
      const c = out > 0 ? c1 : c0;
      if (isDoor) {
        // The leaf open flat beside the door, on whichever side has the wall for it.
        const w = o.w, hd = y1 - 0.08;
        const side = free(o1 + J, o1 + J + w) ? 1 : free(o0 - J - w, o0 - J) ? -1 : 0;
        if (side) {
          dress.place('door', onFace(alongX, side > 0 ? o1 + J + w / 2 : o0 - J - w / 2, 0.02, c, out, w, hd / 2.1, 1));
          busy.push(side > 0 ? [o1 + J, o1 + J + w] : [o0 - J - w, o0 - J]);
          dressStats.doors++;
        }
      } else if (free(o0 - J - o.w / 2, o0 - J) && free(o1 + J, o1 + J + o.w / 2)) {
        for (const p of [o0 - J - o.w / 4, o1 + J + o.w / 4]) dress.place('shutter', onFace(alongX, p, y0, c, out, o.w, (y1 - y0) / 1.0, 1));
        busy.push([o0 - J - o.w / 2, o0 - J], [o1 + J, o1 + J + o.w / 2]);
        dressStats.shutters += 2;
      }
    }
    // An air conditioner on a tall enough outside wall, over a door's head, where the wall is free.
    if (out && h >= 3.2 && a1 - a0 >= 4 && (Math.round(a0 * 7 + c0 * 3) & 1) === 0) {
      for (let p = a0 + 1.2; p < a1 - 1.2; p += 0.5) {
        if (!free(p - 0.5, p + 0.5)) continue;
        // (Its drain pipe hangs 0.65 m under the box: the box from 2.45 m, under the roof.)
        dress.place('ac', onFace(alongX, p, Math.min(h - 1.45, 1.8), out > 0 ? c1 : c0, out));
        dressStats.acs++;
        break;
      }
    }
  };

  /**
   * A straight wall with openings. Along x (n/s sides) it spans [a0, a1] in x at z ∈ [c0, c1];
   * along z it spans [a0, a1] in z at x ∈ [c0, c1]. Each solid stretch and each piece above/below an
   * opening is one box, seen and collided alike.
   */
  const wall = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, h: number, mat: THREE.Material, openings: Opening[], lintelMat = mat, out?: 1 | -1) => {
    const ops = openings.slice().sort((p, q) => p.at - q.at);
    dressWall(alongX, a0, a1, c0, c1, h, ops, out);
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
    openings: Opening[]; parapet?: number; parapetGaps?: Gap[]; roofWalk?: boolean; roofMat?: THREE.Material;
    /** 57.0: its walls let this share of a round through (sheet metal). */
    pierce?: number;
  }) => {
    const t = WALL_T;
    const on = (s: Side) => o.openings.filter((p) => p.side === s);
    const n0 = col.colliders.length;
    wall(true, o.x0, o.x1, o.z0, o.z0 + t, o.h, o.mat, on('n'), m.wood, -1);
    wall(true, o.x0, o.x1, o.z1 - t, o.z1, o.h, o.mat, on('s'), m.wood, 1);
    wall(false, o.z0 + t, o.z1 - t, o.x0, o.x0 + t, o.h, o.mat, on('w'), m.wood, -1);
    wall(false, o.z0 + t, o.z1 - t, o.x1 - t, o.x1, o.h, o.mat, on('e'), m.wood, 1);
    if (o.pierce) for (let i = n0; i < col.colliders.length; i++) col.colliders[i].pierce = o.pierce;
    solid(o.x0 + t, 0, o.z0 + t, o.x1 - t, SLAB, o.z1 - t, m.concrete);
    const rt = o.h + 0.25;
    solid(o.x0, o.h, o.z0, o.x1, rt, o.z1, o.roofMat ?? m.roof);
    const ph = o.parapet ?? 0.5;
    if (ph > 0) parapet(o.x0, o.z0, o.x1, o.z1, rt, ph, o.mat, o.parapetGaps);
    interiors.push({ name: o.name, jp: o.jp, x0: o.x0 + t, z0: o.z0 + t, x1: o.x1 - t, z1: o.z1 - t, h: o.h });
    if (o.roofWalk) roofs.push({ name: o.name + ' ROOF', jp: 'سطح ' + o.jp, x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, h: rt });
  };

  /** Parapet ring on a roof, with gaps where stairs and (12.0) bridges arrive. */
  const parapet = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material, gaps: Gap[] = []) => {
    const pt = 0.25;
    const run = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, side: Side) => {
      const segs: [number, number][] = [];
      let cur = a0;
      for (const g of gaps.filter((q) => q.side === side).sort((p, q) => p.a - q.a)) {
        segs.push([cur, g.a]);
        cur = g.b;
      }
      segs.push([cur, a1]);
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
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, top: number, openSide: Side | null, open = false) => {
    // 9.1: fitted like every other stair (StairFit): never into a wall, never flush with one.
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, 0, top);
    if (fit.blocked.length) console.warn('[stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const steps = Math.round(top / 0.25);
    const run = L / steps;
    // The treads stop STAIR_GAP short of the railing plate (an overlapping plate z-fought with them).
    const w0 = (along ? z0 : x0) + (openSide === (along ? 'n' : 'w') ? STAIR_GAP : 0);
    const w1 = (along ? z1 : x1) - (openSide === (along ? 's' : 'e') ? STAIR_GAP : 0);
    for (let i = 0; i < steps; i++) {
      const hTop = ((i + 1) * top) / steps;
      const a = rise > 0 ? i * run : L - (i + 1) * run;
      const p0 = (along ? x0 : z0) + a;
      // Each tread is a block to the floor: seen as a solid stair, collides only as the ramp below.
      if (along) b.add(worldBox(run, hTop, w1 - w0, 1), m.concrete, p0 + run / 2, hTop / 2, (w0 + w1) / 2);
      else b.add(worldBox(w1 - w0, hTop, run, 1), m.concrete, (w0 + w1) / 2, hTop / 2, p0 + run / 2);
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
      // 12.0, `open`: the same plate as a collider only (rounds and sight pass the bars), drawn as
      // posts and a sloping handrail.
      const plate = open ? (a0: number, y0: number, b0: number, a1: number, y1: number, b1: number) => (col.add(a0, y0, b0, a1, y1, b1, 'metal').ray = false) : (a0: number, y0: number, b0: number, a1: number, y1: number, b1: number) => solid(a0, y0, b0, a1, y1, b1, m.darkMetal, 'metal');
      if (along) {
        plate(x0 + 0.8 * (rise > 0 ? 1 : 0), 0, f, x1 - 0.8 * (rise > 0 ? 0 : 1), top + RH, f + t);
      } else {
        plate(f, 0, z0 + (rise > 0 ? 0.8 : 0), f + t, top + RH, z1 - (rise > 0 ? 0 : 0.8));
      }
      if (open) {
        const n = Math.max(2, Math.ceil(L / 1.2));
        const ang = Math.atan2(top, L) * (rise > 0 ? 1 : -1);
        const c = f + t / 2;
        for (let i = 0; i <= n; i++) {
          const a = (L * i) / n;
          const y = (top * (rise > 0 ? a : L - a)) / L;
          if (along) b.add(worldBox(0.06, RH, 0.06, 1), m.darkMetal, x0 + a, y + RH / 2, c);
          else b.add(worldBox(0.06, RH, 0.06, 1), m.darkMetal, c, y + RH / 2, z0 + a);
        }
        const len = Math.hypot(L, top);
        if (along) b.add(worldBox(len, 0.06, 0.06, 1), m.darkMetal, (x0 + x1) / 2, top / 2 + RH, c, 0, 0, ang);
        else b.add(worldBox(0.06, 0.06, len, 1), m.darkMetal, c, top / 2 + RH, (z0 + z1) / 2, -ang, 0, 0);
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
    // 75.0: a sandstone boulder (props_nature.py) in the same cylinder, if the kit is loaded (the
    // prism is still made: the seed stream the rest of the map is laid out from stays the same).
    const model = rock(r, h, boulders++);
    if (!model) return g;
    g.dispose();
    return model;
  };
  let boulders = 0;

  // ======================================================================= Buildings
  // Barracks: two rooms (partition at x = -18 with a doorway), three outside doors, windows.
  building({
    name: 'BARRACKS', jp: 'الثكنة', x0: -26, z0: -18, x1: -10, z1: -11, h: 3.3, mat: m.plaster,
    openings: [
      { side: 's', at: -22.8, w: 1.4 }, { side: 's', at: -13.3, w: 1.4 }, { side: 'e', at: -14.5, w: 1.4 },
      { side: 'n', at: -23.4, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -20.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      { side: 'n', at: -15.8, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      { side: 's', at: -19.6, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: -14.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ],
    // 12.0: a walkable roof: the stair up its north side lands in the north gap (where the fourth
    // window was), the skybridge to the motor pool in the east gap.
    roofWalk: true, parapetGaps: [{ side: 'n', a: -14, b: -12.6 }, { side: 'e', a: -16, b: -14.4 }],
  });
  wall(false, -17.7, -11.3, -18.15, -17.85, 3.3, m.plaster, [{ side: 'w', at: -14.5, w: 1.4 }], m.wood);
  // Bunks along the north wall (low boxes you can see over) and lockers.
  for (const x of [-25, -22.4, -16.2, -13.6]) solid(x - 0.45, SLAB, -17.7, x + 0.45, 1.25, -15.7, m.darkMetal, 'metal');
  for (const x of [-25.3, -10.7]) solid(x - 0.4, SLAB, -13.0, x + 0.4, 1.95, -11.3, m.darkMetal, 'metal');

  // Motor pool: tall hangar, a 7 m door to the yard, a side door, high windows.
  building({
    name: 'MOTOR POOL', jp: 'ورشة المركبات', x0: 10, z0: -20, x1: 26, z1: -8, h: 5, mat: m.metal, roofMat: m.metal,
    // 57.0: its corrugated walls take a round through at 45% (a wallbang into or out of the hangar).
    pierce: 0.45,
    openings: [
      { side: 's', at: 16.5, w: 7, y1: 4.2 }, { side: 'e', at: -13.3, w: 1.4 },
      { side: 'w', at: -16, w: 2.4, y0: 2.8, y1: 3.8 }, { side: 'w', at: -12, w: 2.4, y0: 2.8, y1: 3.8 },
      { side: 'n', at: 14, w: 2.4, y0: 2.8, y1: 3.8 }, { side: 'n', at: 24, w: 2.4, y0: 2.8, y1: 3.8 },
    ],
    // 12.0: the high roof (5.25 m), with a parapet to fight behind (was 0.3 m): its stair runs up the
    // north wall to the north gap (the second window moved east of it), the skybridge lands in the west gap.
    parapet: 1.0, roofWalk: true, parapetGaps: [{ side: 'n', a: 20.6, b: 22 }, { side: 'w', a: -16, b: -14.4 }],
  });
  solid(10.3, 0, -8, 25.7, 0.05, -2, m.concrete); // apron
  // Truck: cab and covered bed (cover inside the hangar). 70.0: the kit's army truck (its cab north).
  dress?.replace('truck', [19.6, SLAB, -18.6], [22.0, 2.75, -11.4], { rotY: Math.PI, over: { paint: drumPaint[0], canvas: m.tent } });
  solid(19.6, SLAB, -18.6, 22.0, 2.3, -16.6, m.rust, 'metal');
  solid(19.6, SLAB, -16.6, 22.0, 1.3, -11.4, m.rust, 'metal');
  solid(19.6, 1.3, -16.4, 22.0, 2.75, -11.6, m.tent, 'wood');
  solid(10.3, SLAB, -19.7, 11.2, 0.95, -15.0, m.wood, 'wood'); // workbench
  for (const [x, z] of [[24.6, -19.35], [25.25, -19.35], [24.4, -8.65]]) cylinder(x, z, 0.32, 0.95, m.rust);
  crateStack(13.0, -19.1, 2);

  // Trading post: an L with an arcade along its north side and a walkable roof (stair on the east of the south wing).
  {
    const h = 3.3, mat = m.mud, t = WALL_T;
    wall(true, -24, -10, 8, 8 + t, h, mat, [{ side: 'n', at: -15.3, w: 1.4 }, { side: 'n', at: -21, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'n', at: -12, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }], m.wood, -1);
    wall(false, 8 + t, 15 - t, -10 - t, -10, h, mat, [{ side: 'e', at: 11.5, w: 1.4 }], m.wood, 1);
    wall(true, -17 - t, -10, 15 - t, 15, h, mat, [{ side: 's', at: -13.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }], mat, 1);
    wall(false, 15, 24 - t, -17 - t, -17, h, mat, []); // no window: the outside stair runs along this wall
    wall(true, -24, -17, 24 - t, 24, h, mat, [{ side: 's', at: -20.7, w: 1.4 }], m.wood, 1);
    wall(false, 8 + t, 24 - t, -24, -24 + t, h, mat, [{ side: 'w', at: 12, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: 19.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }], m.wood, -1);
    solid(-24 + t, 0, 8 + t, -10 - t, SLAB, 15 - t, m.concrete);
    solid(-24 + t, 0, 15 - t, -17 - t, SLAB, 24 - t, m.concrete);
    const rt = h + 0.25;
    solid(-24, h, 8, -10, rt, 15, m.roof);
    solid(-24, h, 15, -17, rt, 24, m.roof);
    // Parapet around the L, open where the stair lands (east edge of the south wing, z 15.4..17.0).
    const ph = 1.0, pt = 0.25;
    solid(-24, rt, 8, -10, rt + ph, 8 + pt, mat);
    // (12.0: open at z 11..12.6, where the bridge to the clinic roof leaves.)
    solid(-10 - pt, rt, 8 + pt, -10, rt + ph, 11, mat);
    solid(-10 - pt, rt, 12.6, -10, rt + ph, 15, mat);
    solid(-17, rt, 15 - pt, -10 - pt, rt + ph, 15, mat);
    solid(-17 - pt, rt, 17.0, -17, rt + ph, 24, mat);
    solid(-24, rt, 24 - pt, -17 - pt, rt + ph, 24, mat);
    solid(-24, rt, 8 + pt, -24 + pt, rt + ph, 24 - pt, mat);
    interiors.push({ name: 'TRADING POST', jp: 'السوق', x0: -24 + t, z0: 8 + t, x1: -10 - t, z1: 15 - t, h });
    interiors.push({ name: 'TRADING POST', jp: 'السوق', x0: -24 + t, z0: 15 - t, x1: -17 - t, z1: 24 - t, h });
    roofs.push({ name: 'TRADING POST ROOF', jp: 'سطح السوق', x0: -24, z0: 8, x1: -10, z1: 15, h: rt });
    roofs.push({ name: 'TRADING POST ROOF', jp: 'سطح السوق', x0: -24, z0: 15, x1: -17, z1: 24, h: rt });
    // Landing (solid to the ground) and the stair down to the south.
    solid(-17, 0, 15, -15.6, rt, 17.4, m.concrete);
    stair(-17, 17.4, -15.6, 23.6, 'z', -1, rt, 'e');
    // Arcade: posts and a canvas awning along the north wall (above any jump).
    for (let x = -23.6; x <= -10.3; x += 3.3) solid(x - 0.13, 0, 5.75, x + 0.13, 2.95, 6.01, m.wood, 'wood');
    // 71.0: the kit's awning, four bays on their rods (high on the wall).
    if (dress?.size('awning')) for (let i = 0; i < 4; i++) dress.place('awning', new THREE.Matrix4().makeTranslation(-24 + 1.75 + i * 3.5, 2.86, 6.85), { canvas: m.awning });
    else b.add(worldBox(14, 0.06, 2.3, 2), m.awning, -17, 3.0, 6.85);
    col.add(-24, 2.97, 5.7, -10, 3.03, 8, 'wood', false).ray = true;
    // Stalls inside.
    solid(-23.7, SLAB, 10.2, -21.3, 0.95, 11.0, m.wood, 'wood');
    solid(-15.0, SLAB, 13.9, -12.2, 0.95, 14.7, m.wood, 'wood');
    solid(-23.6, SLAB, 18.0, -22.8, 2.0, 22.4, m.wood, 'wood'); // shelves
  }

  // Clinic: whitewashed, a sign, beds inside.
  building({
    name: 'CLINIC', jp: 'العيادة', x0: 6, z0: 10, x1: 14, z1: 17, h: 3.1, mat: m.whitewash,
    openings: [
      { side: 'w', at: 13.5, w: 1.4 }, { side: 'n', at: 9.7, w: 1.4 },
      { side: 'e', at: 12.2, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'e', at: 15.0, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 's', at: 12.8, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ],
    // 12.0: a walkable roof, the middle of ALPHA's rooftop route: bridges from the trading post (west)
    // and to the watchtower (east), and a climb of crates up its south wall (the window moved off it).
    roofWalk: true, parapetGaps: [{ side: 'w', a: 11, b: 12.6 }, { side: 'e', a: 11.5, b: 13 }, { side: 's', a: 6.8, b: 8.0 }],
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
    name: 'WATCHTOWER', jp: 'برج المراقبة', x0: 22, z0: 10, x1: 27, z1: 15, h: 3.0, mat: m.concrete,
    openings: [{ side: 'w', at: 12.5, w: 1.4 }, { side: 'n', at: 24.5, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 }, { side: 's', at: 24.5, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 }],
    // 12.0: a second gap on the west, where the bridge from the clinic roof lands.
    parapet: 1.1, parapetGaps: [{ side: 'e', a: 10.2, b: 11.6 }, { side: 'w', a: 11.5, b: 13 }], roofWalk: true,
  });
  solid(27, 0, 10, 28.4, 3.25, 11.6, m.concrete); // landing
  stair(27, 11.6, 28.4, 16.6, 'z', -1, 3.25, 'e');
  for (const [x, z] of [[22.3, 10.3], [26.55, 10.3], [22.3, 14.55], [26.55, 14.55]]) solid(x, 3.25, z, x + 0.15, 5.6, z + 0.15, m.wood, 'wood');
  solid(21.8, 5.6, 9.8, 27.2, 5.75, 15.2, m.metal, 'metal');

  // Generator shed: open front to the south, a generator inside, a cabinet on its east wall.
  building({
    name: 'GENERATOR SHED', jp: 'غرفة المولّد', x0: -5, z0: -24, x1: -1, z1: -20, h: 2.6, mat: m.concrete,
    openings: [{ side: 's', at: -3, w: 2.0 }], parapet: 0,
  });
  // 70.0: the kit's genset (its radiator east).
  dress?.replace('generator', [-4.7, SLAB, -23.7], [-2.9, 1.2, -22.5], { rotY: Math.PI / 2, over: { paint: drumPaint[0] }, margin: 0.05 });
  solid(-4.7, SLAB, -23.7, -2.9, 1.2, -22.5, m.darkMetal, 'metal');
  const cab = (x: number, z: number, face: CabinetSpot['face']): CabinetSpot => {
    const alongX = face === 'n' || face === 's';
    const w = 1.2, d = 0.5, h = 1.9;
    // 72.0: the street kit's cabinet (doors, vents, a hazard plate) over its box, its doors out.
    const ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
    dress?.replace('ecab', alongX ? [x - w / 2, 0, z - d / 2] : [x - d / 2, 0, z - w / 2], alongX ? [x + w / 2, h + 0.08, z + d / 2] : [x + d / 2, h + 0.08, z + w / 2], { rotY: ry, over: { paint: m.darkMetal }, margin: 0.05 });
    const c = alongX ? solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, m.darkMetal, 'metal') : solid(x - d / 2, 0, z - w / 2, x + d / 2, h, z + w / 2, m.darkMetal, 'metal');
    return { pos: new THREE.Vector3(x, 0, z), face, collider: c };
  };
  const cabinets = [cab(-0.75, -22, 'e'), cab(10.55, -11.2, 'e')];

  // Water tower (legs collide; the tank is far above anyone's head).
  for (const [x, z] of [[0.6, 20.6], [3.1, 20.6], [0.6, 23.1], [3.1, 23.1]]) solid(x, 0, z, x + 0.3, 6.1, z + 0.3, m.darkMetal, 'metal');
  {
    // 71.0: the kit's riveted tank (its walkway, ladder and roof vent), X braces between the legs over
    // the heads.
    if (dress?.place('tower_tank', new THREE.Matrix4().compose(new THREE.Vector3(2, 6.1, 22), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1)), { metal: m.rust })) {
      const legs: [number, number][] = [[0.75, 20.75], [3.25, 20.75], [3.25, 23.25], [0.75, 23.25]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [cx, cz] = legs[(i + 1) % 4];
        dress.place('brace', seg(new THREE.Vector3(ax, 3.2, az), new THREE.Vector3(cx, 5.95, cz)));
        dress.place('brace', seg(new THREE.Vector3(ax, 5.95, az), new THREE.Vector3(cx, 3.2, cz)));
      }
    } else {
      const tank = new THREE.CylinderGeometry(2.0, 2.0, 3, 16);
      b.add(tank, m.rust, 2, 7.6, 22);
      b.add(new THREE.ConeGeometry(2.1, 0.8, 16), m.rust, 2, 9.5, 22);
    }
    col.addCylinder(2, 22, 2.0, 6.1, 9.1, 'metal');
  }

  // ======================================================================= Yard
  // Sandbag ring around the flagpole (waist high: cover you can vault).
  const FLAG = { x: -6.6, z: 10.4 };
  const bags = (x0: number, z0: number, x1: number, z1: number, h = 1.05) => {
    const c = solid(x0, 0, z0, x1, h, z1, m.sandbag, 'sand', 1);
    c.vault = true;
    return c;
  };
  // (56.0: the ring and the pole stood where the sinkhole is: the flag flies by the south arm's roof.)
  void bags;
  cylinder(FLAG.x, FLAG.z, 0.09, 9, m.darkMetal);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), new THREE.MeshStandardMaterial({ map: T.canvasTexture('#2f5d7c'), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.geometry.translate(0.9, 0, 0);
  flag.position.set(FLAG.x + 0.09, 8.3, FLAG.z);
  flag.castShadow = true;
  scene.add(flag);
  const flagBase = (flag.geometry.attributes.position as THREE.BufferAttribute).array.slice();

  // Wrecked car, crates, barrels, barriers, tents, fuel tanks. 70.0: the kit's burnt-out saloon.
  dress?.replace('car', [-8.1, 0, -6.9], [-3.9, 1.6, -5.1], { rotY: -Math.PI / 2, margin: 0.05 });
  solid(-8.1, 0, -6.9, -3.9, 1.0, -5.1, m.rust, 'metal');
  solid(-6.9, 1.0, -6.8, -4.9, 1.6, -5.2, m.rust, 'metal');
  crateStack(7.4, -5.6, 2);
  crateStack(-9.0, 3.0, 1);
  crateStack(16.0, 2.5, 2);
  crateStack(-14.5, -6.5, 1);
  crateStack(23.0, -5.5, 1); // 12.0: off the culvert's east stair
  crateStack(-24.0, -4.6, 2); // 12.0: clear of the culvert parapet
  cylinder(8.8, -2.0, 0.32, 0.95, m.rust);
  const jersey = (x0: number, z0: number, x1: number, z1: number) => {
    const c = solid(x0, 0, z0, x1, 0.9, z1, m.concrete);
    c.vault = true;
  };
  // (56.0: the barriers inside the north and south gates gave way to the Cistern's stairs.)
  void jersey;
  // (12.0: the barriers inside the west and east gates gave way to the culvert's stairs and parapets.)
  // Tents: canvas walls with a ridge roof (all within the walls' footprint).
  const tent = (x0: number, z0: number, x1: number, z1: number) => {
    // 71.0: the kit's tent over its boxes (its door east).
    dress?.replace('tent', [x0, 0, z0], [x1, 2.55, z1], { over: { canvas: m.tent }, margin: 0.05 });
    solid(x0, 0, z0, x1, 2.0, z1, m.tent, 'wood');
    solid(x0, 2.0, z0 + 0.7, x1, 2.55, z1 - 0.7, m.tent, 'wood');
  };
  tent(5.6, -13.8, 9.0, -10.5);
  tent(-8.6, -16.5, -4.2, -13.2);
  for (const z of [-22.6, -19.4]) cylinder(-8.6, z, 0.9, 2.4, m.whitewash);

  // ======================================================================= Clutter (3.5)
  // Every piece collides as exactly what you see, and sits either flush against a wall or a
  // neighbour or at least 1 m clear of everything (no body-width slots).
  const crateMats = {
    ammo: new THREE.MeshStandardMaterial({ map: T.crateTexture('5.56 × 900', 'ذخيرة · AMMO'), roughness: 0.85 }),
    gear: new THREE.MeshStandardMaterial({ map: T.crateTexture('KESTREL', 'إمداد · SUPPLY', '#6a5a3c', '#efe2b8'), roughness: 0.85 }),
    med: new THREE.MeshStandardMaterial({ map: T.crateTexture('MEDICAL', 'طبي · ＋', '#d8d2c4', '#a8231f'), roughness: 0.8 }),
    case: new THREE.MeshStandardMaterial({ map: T.crateTexture('', 'CASE · معدات', '#3d3f34', '#bdb79a'), roughness: 0.6, metalness: 0.2 }),
  };
  const rubber = std(T.rubberTexture(), 0xffffff, 0.95);
  // 68.0: the crates are wooden supply crates with their stencil on the panels, the cases hard cases.
  for (const k of ['ammo', 'gear', 'med'] as const) dress?.rule(crateMats[k], 'crate', { label: crateMats[k] });
  dress?.rule(crateMats.case, 'case');

  /** A box that shows its texture once per face (crates), seen and solid alike. */
  const crate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material) => {
    b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, 'wood');
  };
  /** Barrels standing in a touching row along x (or z), rims and a painted band. */
  const barrels = (x: number, z: number, n: number, alongX = true, y = 0) => {
    for (let i = 0; i < n; i++) {
      const cx = alongX ? x + i * 0.62 : x, cz = alongX ? z : z + i * 0.62;
      // 68.0: oil drums (each turned its own way, a paint of three; no draw on the map's random stream).
      const at = new THREE.Matrix4().compose(new THREE.Vector3(cx, y, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (cx * 7.3 + cz * 3.1) % (Math.PI * 2)), new THREE.Vector3(1, 0.92 / 0.88, 1));
      if (!dress?.place('drum', at, { paint: drumPaint[(i + Math.round(cx + cz)) % 3] })) {
        b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 14), m.rust, cx, y + 0.46, cz);
        b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), i % 2 ? m.darkMetal : crateMats.ammo, cx, y + 0.62, cz);
      }
      col.addCylinder(cx, cz, 0.3, y, y + 0.92, 'metal');
    }
  };
  /** A cable spool: an upright drum with flanges (the flange radius is the collider). */
  const spool = (x: number, z: number) => {
    // 69.0: the kit's spool (bolted flanges, the cable wound on).
    if (!dress?.place('spool', new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x), new THREE.Vector3(1, 1, 1)))) {
      b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12), m.wood, x, 0.45, z);
      for (const y of [0.05, 0.9]) b.add(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), m.wood, x, y, z);
    }
    col.addCylinder(x, z, 0.7, 0, 0.95, 'wood');
  };
  /** Stack of tyres. */
  const tyres = (x: number, z: number, n: number) => {
    // 69.0: the kit's tyres (0.84 across: the collider's), each turned and a little off the one under it.
    for (let i = 0; i < n; i++) {
      const at = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.sin(i * 2.1) * 0.02, i * 0.27, z + Math.cos(i * 1.7) * 0.02), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3), new THREE.Vector3(0.84 / 0.92, 0.27 / 0.28, 0.84 / 0.92));
      if (!dress?.place('tyre', at)) b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14), rubber, x, 0.13 + i * 0.27, z);
    }
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
  scrap(8.0, -19.0);
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
    // 71.0: the kit's pole (crossarm, insulators, a transformer can) over the trunk and its bar.
    dress?.replace('pole', [x - 0.15, 0, z - 0.15], [x + 0.15, 7.3, z + 0.15], { fit: false, margin: 0.3 });
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
    // 71.0: an enamel shade over it, its cord up to the ceiling.
    dress?.place('lamp', new THREE.Matrix4().makeTranslation(x, y - 0.02, z));
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

  // ======================================================================= 56.0: cover on the roofs
  // The roofs were open to the flank Blocks' windows end to end (from their faces every roof point was
  // in sight). On the flank side of each walkable roof: a stair head or a shed (2.4 m, over a head), a
  // water tank, plant (a waist-high box), the low parapets raised to 1 m there; clear of the stairs,
  // the bridges and the routes across each roof.
  {
    const shed = (x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material) => {
      solid(x0, y, z0, x1, y + 2.4, z1, mat);
      solid(x0 - 0.12, y + 2.4, z0 - 0.12, x1 + 0.12, y + 2.55, z1 + 0.12, m.roof);
      // A steel door on its long inner face (drawn only).
      const alongZ = z1 - z0 > x1 - x0;
      if (alongZ) b.add(worldBox(0.03, 2.0, 0.9, 1), m.darkMetal, x1 + 0.015, y + 1.0, (z0 + z1) / 2);
      else b.add(worldBox(0.9, 2.0, 0.03, 1), m.darkMetal, (x0 + x1) / 2, y + 1.0, z1 + 0.015);
    };
    const tank = (x: number, z: number, y: number, r: number, h: number) => {
      // 71.0: the kit's ribbed tank on its stand (the collider as it was).
      const at = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x + z), new THREE.Vector3(r / 0.8, h / 1.86, r / 0.8));
      if (!dress?.place('roof_tank', at, { plastic: m.whitewash })) {
        b.add(new THREE.CylinderGeometry(r, r, h, 14), m.whitewash, x, y + h / 2, z);
        b.add(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.2, 10), m.darkMetal, x, y + h + 0.1, z);
      }
      col.addCylinder(x, z, r, y, y + h, 'metal');
    };
    const plant = (x0: number, z0: number, x1: number, z1: number, y: number, h: number) => {
      solid(x0, y, z0, x1, y + h, z1, m.darkMetal, 'metal');
      b.add(worldBox((x1 - x0) * 0.7, 0.05, (z1 - z0) * 0.7, 1), m.metal, (x0 + x1) / 2, y + h + 0.025, (z0 + z1) / 2);
    };
    // 71.0: a radio mast on the motor pool's shed, dishes on the barracks' and the trading post's.
    dress?.place('antenna', new THREE.Matrix4().makeTranslation(24.3, 5.25 + 2.55, -18.6));
    dress?.place('dish', new THREE.Matrix4().compose(new THREE.Vector3(-24.4, 3.55 + 2.55, -16.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.4), new THREE.Vector3(1, 1, 1)));
    dress?.place('dish', new THREE.Matrix4().compose(new THREE.Vector3(-22.7, 3.55 + 2.55, 22.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9), new THREE.Vector3(1, 1, 1)));
    // Barracks (3.55): a shed on its west end, a tank, plant; its west parapet to 1 m.
    shed(-25.75, -17.75, -23.0, -13.0, 3.55, m.plaster);
    tank(-19.6, -16.9, 3.55, 0.8, 1.8);
    plant(-21.0, -12.35, -19.4, -11.25, 3.55, 1.0);
    solid(-26, 4.05, -18, -25.75, 4.55, -11, m.plaster);
    // Trading post (3.55): a stair head on each wing's west end, a tank between them.
    shed(-23.75, 18.5, -21.6, 23.75, 3.55, m.mud);
    shed(-23.75, 12.0, -22.0, 14.75, 3.55, m.mud);
    tank(-21.8, 10.2, 3.55, 0.8, 1.8);
    // Motor pool (5.25): a shed in its north-east corner, plant on the east edge, a tank on the west.
    shed(23.0, -19.75, 25.75, -15.6, 5.25, m.metal);
    plant(24.6, -13.2, 25.75, -11.6, 5.25, 1.3);
    tank(13.5, -10.5, 5.25, 0.8, 1.8);
    // Shades: corrugated sheets on posts (or off a shed's top), 2.4 m over the roof: from a Block's top
    // floor the roof below a parapet or behind a shed was still in sight; under a shade it is not.
    const shade = (x0: number, z0: number, x1: number, z1: number, y: number, posts: [number, number][]) => {
      b.add(worldBox(x1 - x0, 0.06, z1 - z0, 2), m.metal, (x0 + x1) / 2, y + 0.03, (z0 + z1) / 2);
      const c = col.add(x0, y, z0, x1, y + 0.06, z1, 'metal');
      c.solid = false;
      c.floor = false;
      for (const [px, pz] of posts) solid(px - 0.08, y - 2.4, pz - 0.08, px + 0.08, y, pz + 0.08, m.darkMetal, 'metal');
    };
    // (Most of each roof: the Blocks' top-floor slits, 9.5 m up, saw 86% of the roofs on their side
    // even to a body crouched behind the parapet; the strip along the yard side stays open.)
    // Each reaches 2 m out past the flank-side edge (a slit's line ran in under a shade's edge).
    shade(-28, -17.75, -11.5, -11.25, 5.95, [[-11.6, -17.6], [-11.6, -11.4]]);
    shade(-26, 15.25, -17.25, 23.75, 5.95, [[-17.5, 23.5]]);
    shade(-26, 8.25, -12, 14.75, 5.95, [[-12.1, 8.4], [-12.1, 14.6]]);
    shade(12, -19.75, 28, -8.25, 7.65, [[12.1, -19.6], [12.1, -8.4]]);
    shade(6.25, 10.25, 16, 16.75, 5.75, [[6.4, 10.4], [6.4, 16.2]]);
    // Clinic (3.35): a tank and plant; its east parapet to 1 m.
    tank(12.4, 15.4, 3.35, 0.7, 1.6);
    plant(6.25, 14.2, 7.5, 15.2, 3.35, 1.0);
    solid(13.75, 3.85, 10, 14, 4.35, 11.5, m.whitewash);
    solid(13.75, 3.85, 13, 14, 4.35, 17, m.whitewash);
  }

  // ======================================================================= 12.0: Desert 2.0
  // The compound in three levels instead of one open yard, and open on every side:
  //  - OMEGA's side (north): stairs to the barracks roof and to the motor pool's high roof (5.25 m),
  //    and a skybridge between them over the north yard.
  //  - ALPHA's side (south): the trading post roof (its own stair) — a bridge to the clinic roof
  //    (crates climb its south wall) — a bridge on to the watchtower (its own stair).
  //  - Under the yard: the culvert (Terrain.ts CULVERT), from inside the west gate to inside the east
  //    gate, roofed over the middle: the way across that nobody sees from the roofs.
  //  - The HESCO (below): a breach and a collapsed, vaultable stretch in every side, point-symmetric.
  // Free-standing: railed with posts and a handrail (`open`), not the plate a stair against a wall
  // gets (on an open stair it reads as a blank wall). The rail's collider is still the full plate:
  // a jump onto the low steps from the side would otherwise be pushed out of the step fill, through
  // the motor pool's wall behind them.
  stair(-14, -24.2, -12.6, -18, 'z', 1, 3.55, 'w', true);
  stair(11, -21.45, 20.6, -20.03, 'x', 1, 5.25, 'n', true);
  // The motor pool stair's landing (solid to the ground) beside the roof's north gap, railed.
  solid(20.6, 0, -21.45, 22, 5.25, -20.03, m.concrete);
  solid(20.6, 5.25, -21.45, 22, 6.3, -21.37, m.darkMetal, 'metal');
  solid(21.92, 5.25, -21.37, 22, 6.3, -20.03, m.darkMetal, 'metal');

  /**
   * A footbridge along x between two roofs: deck from height h0 at x0 to h1 at x1 (a ramp to walk,
   * thin ray-only slabs under it so rounds and sight stop at the planks), railings both sides (they
   * keep bodies on the deck; rounds and sight pass between the bars), piers at the given x.
   */
  const bridge = (x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, piers: number[]) => {
    const L = x1 - x0, dh = h1 - h0, T = 0.14;
    const ang = Math.atan2(dh, L), len = Math.hypot(L, dh);
    b.add(worldBox(len, T, z1 - z0, 1), m.wood, (x0 + x1) / 2, (h0 + h1) / 2 - T / 2, (z0 + z1) / 2, 0, 0, ang);
    col.addRamp(x0, z0, x1, z1, 'x', h0, h1);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let i = 0; i < n; i++) {
      const xa = x0 + (L * i) / n, xb = x0 + (L * (i + 1)) / n;
      const ya = h0 + (dh * i) / n, yb = h0 + (dh * (i + 1)) / n;
      col.add(xa, Math.min(ya, yb) - T, z0, xb, Math.max(ya, yb) - 0.02, z1, 'wood', false).ray = true;
      for (const zr of [z0, z1 - 0.06]) col.add(xa, Math.min(ya, yb), zr, xb, Math.max(ya, yb) + 1.0, zr + 0.06, 'metal').ray = false;
    }
    for (const zr of [z0 + 0.03, z1 - 0.03]) {
      b.add(worldBox(len, 0.06, 0.06, 1), m.darkMetal, (x0 + x1) / 2, (h0 + h1) / 2 + 1.0, zr, 0, 0, ang);
      for (let i = 0; i <= n; i++) b.add(worldBox(0.06, 1.0, 0.06, 1), m.darkMetal, x0 + (L * i) / n, h0 + (dh * i) / n + 0.5, zr);
    }
    for (const px of piers) {
      const y = h0 + (dh * (px - x0)) / L;
      solid(px - 0.2, 0, (z0 + z1) / 2 - 0.2, px + 0.2, y - T, (z0 + z1) / 2 + 0.2, m.concrete);
    }
  };
  bridge(-10, 10, -16, -14.4, 3.55, 5.25, [-2, 8.5]); // the skybridge: barracks roof → motor pool roof
  bridge(-10, 6, 11, 12.6, 3.55, 3.35, [-2]); // trading post roof → clinic roof
  bridge(14, 22, 11.5, 13, 3.35, 3.25, []); // clinic roof → watchtower
  roofs.push({ name: 'SKYBRIDGE', jp: 'الجسر المعلّق', x0: -10, z0: -16, x1: 10, z1: -14.4, h: 3.55 });
  roofs.push({ name: 'ROOF BRIDGE', jp: 'جسر السطح', x0: -10, z0: 11, x1: 6, z1: 12.6, h: 3.35 });
  roofs.push({ name: 'ROOF BRIDGE', jp: 'جسر السطح', x0: 14, z0: 11.5, x1: 22, z1: 13, h: 3.25 });

  // Crates up the clinic's south wall, a jump each (0.6 m), to the roof's south gap: the player's way
  // up (the bots take the bridges).
  for (let k = 0; k < 5; k++) {
    const x0 = 11.6 - k * 1.2;
    for (let i = 0; i <= k; i++) crate(x0, i * 0.6, 17.0, x0 + 1.2, (i + 1) * 0.6, 18.2, i % 2 ? crateMats.ammo : crateMats.gear);
  }

  // 56.0, the Cistern (Terrain.ts CISTERN): the culvert runs into a hall under the yard's middle, an
  // arm from the hall up to the yard inside each team's gate, and the sinkhole over the hall: the
  // middle is fought on two levels. Walls the whole length below ground (parapets above it round
  // every opening), the yard's paving as the roof, stairs down at every end, paving round every
  // opening (1.45 m past the cut: the terrain mesh's hole is at most a cell, 1.3 m, beyond it).
  {
    const C = CULVERT, F = C.floor, W = 0.5, inner = C.z - W, PAVE = 1.45;
    const H = CISTERN.hall, A = CISTERN.arm, O = CISTERN.hole;
    /** A box in the south frame and its rotation (the Cistern is point-symmetric). */
    const twin = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
      const c = solid(x0, y0, z0, x1, y1, z1, mat, surface);
      return [c, solid(-x1, y0, -z1, -x0, y1, -z0, mat, surface)];
    };
    // ---- The culvert, outside the hall: walls, parapets over its open ends, paving, the roof.
    for (const sz of [-1, 1]) {
      const z0 = sz < 0 ? -C.z : inner, z1 = sz < 0 ? -inner : C.z;
      for (const sx of [-1, 1]) {
        const xa = sx < 0 ? -C.x : H.x, xb = sx < 0 ? -H.x : C.x;
        solid(xa, F, z0, xb, 0, z1, m.cistern);
        const pa = sx < 0 ? -C.x : C.roof, pb = sx < 0 ? -C.roof : C.x;
        solid(pa, 0, z0, pb, 1.0, z1, m.concrete);
        const pz0 = sz < 0 ? -C.z - PAVE : C.z, pz1 = sz < 0 ? -C.z : C.z + PAVE;
        solid(pa, -0.3, pz0, pb, 0.04, pz1, m.concrete);
      }
    }
    for (const sx of [-1, 1]) {
      solid(sx < 0 ? -C.x - PAVE : C.x, -0.3, -C.z - PAVE, sx < 0 ? -C.x : C.x + PAVE, 0.04, C.z + PAVE, m.concrete);
      solid(sx < 0 ? -C.x : C.top, -0.3, -inner, sx < 0 ? -C.top : C.x, 0.04, inner, m.concrete);
      // Its roof between the hall and its stair (the yard's paving there).
      solid(sx < 0 ? -C.roof : H.x + PAVE, -0.3, -C.z - PAVE, sx < 0 ? -H.x - PAVE : C.roof, 0.04, C.z + PAVE, m.concrete);
      // The floor you see (the terrain is the floor you stand on; its mesh has a hole here).
      solid(sx < 0 ? -C.x : H.x, F - 0.3, -inner, sx < 0 ? -H.x : C.x, F, inner, m.cistern);
    }
    const steps = Math.round(-F / 0.25);
    {
      const run = (C.top - C.roof) / steps;
      for (const sx of [-1, 1]) for (let i = 0; i < steps; i++) {
        const top = F + ((i + 1) * -F) / steps;
        b.add(worldBox(run, top - F, 2 * (inner - STAIR_GAP), 1), m.cistern, sx * (C.roof + i * run + run / 2), (top + F) / 2, 0);
      }
    }
    // Down the culvert: a crate against each wall, staggered (0.8 m: on top of one a body fits under the roof).
    crate(-15, F, -inner, -13.8, F + 0.8, -inner + 1.1, crateMats.case);
    crate(13.8, F, inner - 1.1, 15, F + 0.8, inner, crateMats.case);

    // ---- The hall: its floor, its walls (open where the culvert and the arms come in), pillars.
    solid(-H.x, F - 0.3, -H.z, H.x, F, H.z, m.cistern);
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -H.x : H.x - W, x1 = x0 + W;
      solid(x0, F, -H.z, x1, 0, -inner, m.cistern);
      solid(x0, F, inner, x1, 0, H.z, m.cistern);
    }
    // The north wall (and its rotation, the south one): open where the arm comes in.
    twin(-H.x + W, F, -H.z, -A.x1 + W, 0, -H.z + W, m.cistern);
    twin(-A.x0 - W, F, -H.z, H.x - W, 0, -H.z + W, m.cistern);
    for (const [x, z] of [[-6, 4.6], [6, -4.6], [6, 4.6], [-6, -4.6]]) solid(x - 0.4, F, z - 0.4, x + 0.4, -0.3, z + 0.4, m.cistern);
    // Cover down there: crates by the culvert's mouths, the pumps by the arms (point-symmetric).
    twin(5.0, F, 1.4, 6.2, F + 1.2, 2.6, m.wood, 'wood');
    twin(-1.0, F, -7.5, 1.0, F + 1.8, -6.6, m.darkMetal, 'metal');
    // The roof: the yard's paving, open over the sinkhole.
    const R = { x: H.x + PAVE, z: H.z + PAVE };
    solid(-R.x, -0.3, -R.z, R.x, 0.04, -O.z, m.concrete);
    solid(-R.x, -0.3, O.z, R.x, 0.04, R.z, m.concrete);
    solid(-R.x, -0.3, -O.z, -O.x, 0.04, O.z, m.concrete);
    solid(O.x, -0.3, -O.z, R.x, 0.04, O.z, m.concrete);

    // ---- The arms (south frame, built again rotated): walls, the roof, the stair, its parapets.
    {
      const x0 = A.x0, x1 = A.x1;
      twin(x0, F, H.z - W, x0 + W, 0, A.end, m.cistern);
      twin(x1 - W, F, H.z - W, x1, 0, A.end, m.cistern);
      twin(x0, 0, A.roof, x0 + W, 1.0, A.end, m.concrete);
      twin(x1 - W, 0, A.roof, x1, 1.0, A.end, m.concrete);
      // Across the far end of the opening (no walking off the roof into the stairwell).
      twin(x0 + W, 0, A.roof - W, x1 - W, 1.0, A.roof, m.concrete);
      twin(x0 - PAVE, -0.3, R.z, x1 + PAVE, 0.04, A.roof, m.concrete);
      twin(x0 - PAVE, -0.3, A.roof, x0, 0.04, A.end + PAVE, m.concrete);
      twin(x1, -0.3, A.roof, x1 + PAVE, 0.04, A.end + PAVE, m.concrete);
      twin(x0, -0.3, A.top, x1, 0.04, A.end + PAVE, m.concrete);
      twin(x0 + W, F - 0.3, H.z, x1 - W, F, A.top, m.cistern);
      const run = (A.top - A.roof) / steps;
      for (let i = 0; i < steps; i++) {
        const top = F + ((i + 1) * -F) / steps;
        const zc = A.roof + i * run + run / 2, w = x1 - x0 - 2 * (W + STAIR_GAP);
        b.add(worldBox(w, top - F, run, 1), m.cistern, (x0 + x1) / 2, (top + F) / 2, zc);
        b.add(worldBox(w, top - F, run, 1), m.cistern, -(x0 + x1) / 2, (top + F) / 2, -zc);
      }
    }

    // ---- The sinkhole: where the yard fell into the hall, two slabs of it lying as ramps (one from
    // each side, point-symmetric), the rest a 3 m drop. A ramp's underside is filled (nobody walks
    // under it; rounds stop at it).
    const slab = (xTop: number, xLow: number, z0: number, z1: number) => {
      const L = Math.abs(xTop - xLow), T = 0.3, ang = Math.atan2(-F, xTop - xLow);
      b.add(worldBox(Math.hypot(L, F), T, z1 - z0, 1.5), m.concrete, (xTop + xLow) / 2, F / 2 - T / 2, (z0 + z1) / 2, 0, 0, ang);
      const xa = Math.min(xTop, xLow), xb = Math.max(xTop, xLow);
      col.addRamp(xa, z0, xb, z1, 'x', xTop > xLow ? F : 0, xTop > xLow ? 0 : F);
      const seg = 6;
      for (let i = 0; i < seg; i++) {
        const a0 = xa + (L * i) / seg, a1 = xa + (L * (i + 1)) / seg;
        const under = xTop > xLow ? F + (-F * (a0 - xa)) / L : F + (-F * (xb - a1)) / L;
        // Its open side, the hall's side, is a face for rounds, sight and the graph's links (a link ran
        // in under its low end, where no body fits)...
        // (a plate on each side, thin across the slab, so a body that jumps at its side is put back out
        // the way it came, not along the slab into the fill: the stairs' side plates, the same rule)...
        for (const zs of [z0, z1 - 0.08]) {
          if (under - F < 0.1) continue;
          b.add(worldBox(a1 - a0, under - 0.05 - F, 0.08, 1), m.cistern, (a0 + a1) / 2, (under - 0.05 + F) / 2, zs + 0.04);
          const r = col.add(a0, F, zs, a1, under - 0.05, zs + 0.08, 'concrete');
          r.floor = false;
        }
        // ...and bodies stop at a fill 0.3 m under it (a body on the slab over its edge stays clear of it).
        const h = under - 0.3;
        if (h - F < 0.15) continue;
        const c = col.add(a0, F, z0 + 0.08, a1, h, z1 - 0.08, 'concrete');
        c.floor = false;
      }
    };
    // Each slab 0.5 m short of the hole's side (a body on its rim keeps its head out from under the
    // hall's roof), a crack between them down to the floor (no stepping off one onto the other's
    // underside: a broken beam there wedged the bots against it).
    slab(O.x, -2, -O.z + 0.5, -0.6);
    slab(-O.x, 2, 0.6, O.z - 0.5);
    // Broken edges round the drop: a lip of rubble you can vault, sandbags where the yard's ring was.
    const rubble = (x0: number, z0: number, x1: number, z1: number, h: number) => {
      for (const [a0, b0, a1, b1] of [[x0, z0, x1, z1], [-x1, -z1, -x0, -z0]]) {
        const c = solid(a0, 0, b0, a1, h, b1, m.concrete);
        c.vault = true;
      }
    };
    rubble(-O.x - 0.9, -3.0, -O.x, -0.4, 0.6);
    for (const [x0, z0, x1, z1] of [[-2.4, -5.1, 1.4, -4.5], [-6.2, 0.6, -5.6, 3.6]]) {
      const c = solid(x0, 0, z0, x1, 1.05, z1, m.sandbag, 'sand', 1);
      c.vault = true;
      const d = solid(-x1, 0, -z1, -x0, 1.05, -z0, m.sandbag, 'sand', 1);
      d.vault = true;
    }
    // Rebar out of the broken edges (drawn only).
    for (const [x, z, a] of [[-1.5, -3.5, 0.5], [0.8, -3.5, -0.4], [-4, 1.6, 0.6], [4, -1.2, -0.5], [1.5, 3.5, 0.4], [-0.8, 3.5, -0.6]]) b.add(worldBox(0.04, 1.4, 0.04, 1), m.rust, x, -0.2, z, a, 0, a * 0.7);

    // The roofs' undersides, seen from below (drawn only, in the Cistern's self-lit concrete).
    const ceil = (x0: number, z0: number, x1: number, z1: number) => b.add(worldBox(x1 - x0, 0.02, z1 - z0, 1.5), m.cistern, (x0 + x1) / 2, -0.315, (z0 + z1) / 2);
    ceil(-H.x, -H.z, H.x, -O.z);
    ceil(-H.x, O.z, H.x, H.z);
    ceil(-H.x, -O.z, -O.x, O.z);
    ceil(O.x, -O.z, H.x, O.z);
    for (const sx of [-1, 1]) ceil(sx < 0 ? -C.roof : H.x, -inner, sx < 0 ? -H.x : C.roof, inner);
    ceil(A.x0 + W, H.z, A.x1 - W, A.roof);
    ceil(-A.x1 + W, -A.roof, -A.x0 - W, -H.z);
    // Strip lamps along the hall's walls and down each arm (drawn; the bulbs are what you shoot out).
    const strip = (x: number, z: number, alongX: boolean, len: number) => b.add(alongX ? worldBox(len, 0.08, 0.08, 1) : worldBox(0.08, 0.08, len, 1), m.bulb, x, -0.6, z);
    for (const sz of [-1, 1]) {
      strip(-6, sz * (H.z - W - 0.05), true, 3);
      strip(6, sz * (H.z - W - 0.05), true, 3);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) strip(sx * (H.x - W - 0.05), sz * 5, false, 3);
    strip(A.x0 + W + 0.05, 12, false, 4);
    strip(-A.x0 - W - 0.05, -12, false, 4);

    // ---- Over the sinkhole: the salvage crew's hoist (three steel legs, a chain, a pallet of the
    // pump's parts hung high over the drop) and a work light on it: the middle's landmark, seen from
    // every roof and gate.
    {
      const apex = new THREE.Vector3(0, 7.2, 0);
      const feet: [number, number][] = [[-5.6, -3.9], [5.2, -4.6], [1.0, 6.6]];
      for (const [fx, fz] of feet) {
        const foot = new THREE.Vector3(fx, 0, fz);
        const len = foot.distanceTo(apex);
        const g = new THREE.CylinderGeometry(0.09, 0.12, len, 8);
        g.translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), apex.clone().sub(foot).normalize());
        const e = new THREE.Euler().setFromQuaternion(q);
        b.add(g, m.rust, fx, 0, fz, e.x, e.y, e.z);
        col.addCylinder(fx, fz, 0.16, 0, 1.6, 'metal');
        b.add(worldBox(0.7, 0.12, 0.7, 1), m.darkMetal, fx, 0.06, fz);
      }
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), m.darkMetal, 0, 5.5, 0);
      solid(-0.75, 3.2, -0.6, 0.75, 3.8, 0.6, crateMats.case, 'wood');
      b.add(worldBox(1.6, 0.08, 1.3, 1), m.wood, 0, 3.16, 0);
      // The work light under the apex, aimed down the hole.
      b.add(worldBox(0.5, 0.25, 0.35, 1), m.darkMetal, 0, 6.85, 0);
      b.add(worldBox(0.42, 0.02, 0.28, 1), m.bulb, 0, 6.72, 0);
      glows.add({ pos: new THREE.Vector3(0, 6.6, 0), color: new THREE.Color(1, 0.86, 0.6), radius: 9, base: 1, haloSize: 1.6, haloStrength: 0.3, mode: 'steady' });
    }
    interiors.push({ name: 'CULVERT', jp: 'العبّارة', x0: -C.x, z0: -inner, x1: C.x, z1: inner, h: -0.3 });
    interiors.push({ name: 'CISTERN', jp: 'الصهريج', x0: -H.x, z0: -H.z, x1: H.x, z1: H.z, h: -0.3 });
    interiors.push({ name: 'CISTERN STAIRS', jp: 'درج الصهريج', x0: A.x0, z0: H.z, x1: A.x1, z1: A.top, h: -0.3 });
    interiors.push({ name: 'CISTERN STAIRS', jp: 'درج الصهريج', x0: -A.x1, z0: -A.top, x1: -A.x0, z1: -H.z, h: -0.3 });
    for (const x of [-14, 14]) bulb(x, -0.75, 0);
    for (const [x, z] of [[-6.5, -6.6], [6.5, 6.6], [-6.5, 2.4], [6.5, -2.4], [-3, 12], [3, -12]]) bulb(x, -0.75, z);
  }

  // ======================================================================= Perimeter (HESCO, four gates)
  // 56.0: two baskets high (2.5 m, was one, 1.5): from the dunes a body no longer sees, or is seen,
  // over it into the yard (the playtest: "waist-high boxes between the middle and the flanks, boring,
  // and a long field of fire"); the yard is seen through its gates, breaches and slumps.
  const hesco = (x0: number, z0: number, x1: number, z1: number) => {
    solid(x0, 0, z0, x1, 1.5, z1, m.hesco, 'sand', 1.2);
    const ix = x1 - x0 > z1 - z0 ? 0 : 0.08, iz = ix ? 0 : 0.08;
    solid(x0 + ix, 1.5, z0 + iz, x1 - ix, 2.5, z1 - iz, m.hesco, 'sand', 1.2);
  };
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
  // 12.0: each side also has a breach (open) and a collapsed stretch (knee-high, vaultable), placed
  // point-symmetrically so both teams get the same ways in.
  lineX(-27, [[-18, -14.5], [3, 9], [18, 24]]);
  lineX(27, [[-24, -18], [-10, -4], [14.5, 18]]);
  lineZ(-30, [[-24, -18], [-6, 0], [14, 17.5]]);
  lineZ(30, [[-17.5, -14], [-4, 2], [18, 24]]);
  // A slump stands free of the full-height HESCO either side (1.1 m open): one that abutted it
  // pushed a body vaulting along the tall wall's end, as it dropped below the vault, into that wall.
  const slump = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = x1 - x0 > z1 - z0, g = 1.1;
    const c = alongX ? solid(x0 + g, 0, z0, x1 - g, 0.95, z1, m.hesco, 'sand', 1.2) : solid(x0, 0, z0 + g, x1, 0.95, z1 - g, m.hesco, 'sand', 1.2);
    c.vault = true;
  };
  slump(18, -27 - H, 24, -27 + H);
  slump(-24, 27 - H, -18, 27 + H);
  slump(-30 - H, -24, -30 + H, -18);
  slump(30 - H, 18, 30 + H, 24);

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
      // 38.0: none in the ruins (skipped after its draws: the scatter and the cliffs after it stay as they were).
      if (inRuins(x, z, 1)) continue;
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
    // 71.0: the kit's date palm (a ringed trunk leaning a little, arching fronds) over the trunk and leaves.
    dress?.replace('palm', [x - 0.25, 0, z - 0.25], [x + 0.25, 6.6, z + 0.25], { fit: false, rotY: x * 1.7, margin: 0.3 });
    cylinder(x, z, 0.22, 6.5, m.trunk);
    for (let k = 0; k < 7 && !dress?.size('palm'); k++) {
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
    dress,
    mats: { burnt: m.burnt, tan: m.tan, mud: m.mud, hesco: m.hesco, concrete: m.concrete, sandbag: m.sandbag, rock: m.rock, rust: m.rust, darkMetal: m.darkMetal, tent: m.tent, wood: m.wood, crate: crateMats.gear, sandstone: m.sandstone, plaster: m.housePlaster, whitewash: m.whitewash, roof: m.roof, bulb: m.bulb },
    flag: (c) => T.canvasTexture(c),
  });
  // 46.0: the flank houses are interiors too (the storm stays out, "indoors", their zone, no grid nodes in them).
  interiors.push(...arena.houses.interiors);

  // DEV: what the dresser laid (__dress in the console).
  dress?.finish(scene);
  if (dress) (globalThis as unknown as { __dress?: unknown }).__dress = { ...dress.stats, walls: dressStats };
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
  /** 56.0: the surface at (x, z): the yard's paving over the Cistern's roofed parts, else the ground. */
  const yardY = (x: number, z: number) => (underFloor(x, z) !== null && !underOpen(x, z) ? 0 : desertHeight(x, z));
  const medkits = [v(-12.0, SLAB, -13.6), v(9.0, SLAB, 15.6)];
  const perches = [v(24.5, 3.25, 12.5), v(-20.5, 3.55, 20.5), v(-12.0, 3.55, 11.5), v(-20, 3.55, -14.5), v(18, 5.25, -14), v(10, 3.35, 13.5)];
  const coverPoints: THREE.Vector3[] = [];
  for (const [x, z] of [
    [0, -5.4], [-5.4, -1], [5.4, -1], [-6, -8.4], [-2.4, -6], [6.5, -1.6], [6.5, -5.4], [-9, 1], [-9, 5],
    [16, 0.5], [16, 4.5], [24, 1], [-14.5, -4.5], [-26, -1], [-26, -5], [8.2, -4], [-28.4, -3], [28.4, -1],
    [6, -25.6], [-7, 25.6], [-31.6, -3], [31.6, -1], [6, -28.6], [-7, 28.6],
    [20.5, -10], [12.5, -10], [-17, 4.5], [-12, 4.5], [4.8, 13], [15.5, 12], [21, 17.5], [-15, 26],
    // 3.5 clutter.
    [24.2, -6.6], [12.9, -3.9], [-17, -9.6], [-8.8, -16.8], [1.6, -18.6], [-8.6, 13.7], [17.6, 7], [13.4, 7], [22.7, 16.6],
  ]) {
    // (12.0: the yard's cover over the culvert's line is the culvert's now. 56.0: on the Cistern's
    // roof the cover stands on the paving; over its openings there is none.)
    if (underOpen(x, z)) continue;
    const p = v(x, yardY(x, z), z);
    if (!col.blocked(p, 0.45)) coverPoints.push(p);
  }
  // 12.0: down in the culvert (behind its crates) and behind the parapets on the new roofs. 56.0: and in the Cistern.
  for (const [x, y, z] of [[-13.2, -3, -0.9], [13.2, -3, 0.9], [6.8, -3, 1.6], [-6.8, -3, -1.6], [-6.8, -3, -5.4], [6.8, -3, 5.4], [-4.6, -3, 4.6], [4.6, -3, -4.6], [6.4, -3, -6.1], [-6.4, -3, 6.1], [-12.6, 3.55, -17.3], [-25.3, 3.55, -11.7], [12, 5.25, -19.3], [24.3, 5.25, -8.8], [6.8, 3.35, 16.3], [13.3, 3.35, 10.7]]) {
    const p = v(x, y, z);
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
    interiors.some((r) => r.h > 0 && x > r.x0 - pad - WALL_T && x < r.x1 + pad + WALL_T && z > r.z0 - pad - WALL_T && z < r.z1 + pad + WALL_T) ||
    (x > 26.5 && x < 29 && z > 9.5 && z < 17.2) || (x > -17.5 && x < -15 && z > 14.5 && z < 24.2) ||
    // 12.0: the barracks and motor pool stairs, the clinic's crates.
    (x > -14.5 && x < -12.1 && z > -24.7 && z < -17.5) || (x > 10.5 && x < 22.5 && z > -22 && z < -19.5) || (x > 6.3 && x < 13.3 && z > 16.5 && z < 18.7);
  const probe = new THREE.Vector3();
  for (let x = -81; x <= 81; x += 9) {
    for (let z = -81; z <= 81; z += 9) {
      if (insideBuilding(x, z, 1.2)) continue;
      const y = desertHeight(x, z);
      if (col.blocked(probe.set(x, y, z), 0.6)) continue;
      N(x, y, z);
    }
  }
  // Gates (both sides) and the yard between the buildings. (56.0: not (-12, -22) by the barracks stair: no link reached it.)
  for (const [x, z] of [[6, -29.5], [6, -24.5], [-7, 29.5], [-7, 24.5], [-32.5, -3], [-27.5, -3], [32.5, -1], [27.5, -1],
    [0, -8], [-7, -9], [7, -6], [12, -5], [20, -4], [-6, 5], [3, 6], [-12, 1], [-20, 1], [-27, 5], [-27, -20], [-20, -22], [-6, -26],
    [5, -18], [9, -24], [16, -24], [27, -22], [28, -8], [28, 7], [20, 8], [15, 7.5], [3, 9], [-3, 13], [-6, 20], [-12, 25], [-26, 25.5], [-27, 12],
    [16, 13], [19, 18.5], [10, 19], [3, 18], [28.5, 19], [-8, 9],
    // 56.0: the yard over the Cistern (on its roof), round the sinkhole.
    [-7, -6.5], [7, 6.5], [-7, 6.5], [7, -6.5], [0, -6.2], [0, 6.2], [-6.5, 0], [6.5, 0], [5.5, -2], [-5.5, 2], [-3, 18], [3, -18]]) {
    const y = yardY(x, z);
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
  // 12.0: the rooftop routes and the culvert, linked by hand along stairs and bridges (auto links
  // join each level's own nodes).
  {
    const chain = (...ids: number[]) => {
      for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
    };
    // OMEGA's side: barracks stair → roof → skybridge → motor pool roof ← its stair.
    const bRoofE = N(-11.6, 3.55, -15.2), bRoofM = N(-17, 3.55, -14.5);
    chain(N(-13.3, 0, -25.0), N(-13.3, 1.78, -21.1), N(-13.3, 3.55, -17.0), bRoofM, bRoofE);
    chain(N(-22, 3.55, -14.5), bRoofM);
    const mRoofW = N(11.6, 5.25, -15.2), mRoofC = N(18, 5.25, -14);
    chain(bRoofE, N(0, 4.4, -15.2), mRoofW, mRoofC);
    chain(N(10.2, 0, -20.74), N(15.8, 2.73, -20.74), N(21.3, 5.25, -20.74), N(21.3, 5.25, -18.6), mRoofC);
    chain(mRoofC, N(24, 5.25, -10));
    // ALPHA's side: trading post roof → bridge → clinic roof → bridge → watchtower platform.
    const cRoof = N(10, 3.35, 13.5);
    chain(tr4, N(-11.4, 3.55, 11.8), N(-2, 3.45, 11.8), N(7.2, 3.35, 11.8), cRoof, N(12.8, 3.35, 12.25), N(18, 3.3, 12.25), wp);
    // The culvert: rim, half way down, the floor under the roof's edge, at either end; its floor.
    const C = CULVERT;
    const west = [N(-C.x - 0.6, 0, 0), N(-(C.top + C.roof) / 2, C.floor / 2, 0), N(-C.roof + 1, C.floor, 0)];
    const east = [N(C.x + 0.6, 0, 0), N((C.top + C.roof) / 2, C.floor / 2, 0), N(C.roof - 1, C.floor, 0)];
    // 56.0: through the hall round the sinkhole's slabs (they fill its middle), either side.
    const wIn = N(-10, C.floor, 0.6), eIn = N(10, C.floor, -0.6);
    chain(...west, wIn);
    chain(eIn, east[2], east[1], east[0]);
    const wIn2 = N(-7.6, C.floor, 0), eIn2 = N(7.6, C.floor, 0);
    chain(wIn, wIn2);
    chain(eIn2, eIn);
    for (const k of [1, -1]) chain(wIn2, N(-7.6, C.floor, k * 3.2), N(-4.6, C.floor, k * 3.8), N(-3, C.floor, k * 5.8), N(3, C.floor, k * 5.8), N(4.6, C.floor, k * 3.8), N(7.6, C.floor, k * 3.2), eIn2);
    // 56.0: the Cistern: the hall's floor, each arm from the yard by its gate down to the hall, each
    // slab of the sinkhole from the yard down (south frame, then rotated).
    const F = C.floor, A = CISTERN.arm;
    for (const [x, z] of [[-6.8, -6.6], [6.8, 6.6], [-6.8, 6.6], [6.8, -6.6], [-2.4, -6.4], [2.4, 6.4], [-3, 5.4], [3, -5.4], [-7.6, -3.2], [7.6, 3.2]]) N(x, F, z);
    for (const k of [1, -1]) {
      const ax = k * (A.x0 + A.x1) / 2;
      chain(N(ax, 0, k * (A.end + 1)), N(ax, 0, k * (A.top + 0.2)), N(ax, F / 2, k * (A.top + A.roof) / 2), N(ax, F, k * (A.roof - 0.6)), N(ax, F, k * 11.5), N(ax, F, k * 8.6), N(k * -3, F, k * 5.4));
      // Walked node by node (a bot halfway down, between two far ends, turned back and forth).
      chain(N(k * 5.2, 0, k * -1.8), N(k * 3, -0.5, k * -1.8), N(k * 0.6, -1.7, k * -1.8), N(k * -1.4, -2.7, k * -1.8), N(k * -3.2, F, k * -1.8));
    }
  }
  // 58.0: through windows (the arena bots dive; each side its own way: Mantle.findWindow found these,
  // approach and landing on the floor): into the barracks and the trading post from the yard, through
  // the hamlet's hut (both ways, and the rotated hut's).
  const windows: [number, number][] = [];
  for (const [a, b] of [
    [[-26.6, 0, -14.6], [-25.13, 0.12, -14.6]], [[-24.6, 0, 11.9], [-23.13, 0.12, 11.9]], [[-23.35, 0, -18.6], [-23.35, 0.12, -17.13]],
    [[-21.1, 0, 7.4], [-21.1, 0.12, 8.87]], [[-20.35, 0, -18.6], [-20.35, 0.12, -17.13]], [[-19.6, 0, -10.35], [-19.6, 0.12, -11.87]], [[-12.1, 0, 7.4], [-12.1, 0.12, 8.87]],
    [[-52.6, 2.22, 46.4], [-51.05, 2.22, 46.4]], [[-51.1, 2.22, 46.4], [-52.6, 2.22, 46.4]], [[-48.6, 2.27, 48.9], [-48.6, 2.31, 50.6]], [[-48.6, 2.31, 50.65], [-48.6, 2.28, 49.05]],
    [[48.4, 2.31, -50.6], [48.4, 2.28, -49.05]], [[48.4, 2.28, -49.1], [48.4, 2.31, -50.6]], [[50.9, 2.22, -46.6], [52.6, 2.21, -46.6]], [[52.65, 2.21, -46.6], [51.05, 2.22, -46.6]],
  ] as [number, number, number][][]) windows.push([N(a[0], a[1], a[2]), N(b[0], b[1], b[2])]);
  // The arena: bases, chicanes, hamlet doorways, pump houses, lanes (hand links where auto ones can't
  // see round a corner). A node a wall swallowed is dropped (and its links with it).
  {
    const idx = arena.nodes.map((p) => (col.blocked(probe.set(p.x, p.y, p.z), 0.45) ? -1 : N(p.x, p.y, p.z)));
    for (const [i, j] of arena.links) if (idx[i] >= 0 && idx[j] >= 0) links.push([idx[i], idx[j]]);
  }

  // ======================================================================= Zones
  const yard: Zone = { id: 'yard', name: 'OUTPOST YARD', jp: 'ساحة الموقع', rects: [[-30, -27, 30, 27]] };
  const dunes: Zone = { id: 'dunes', name: 'DUNE FIELD', jp: 'الكثبان', rects: [[-DESERT_EXTENT, -DESERT_EXTENT, DESERT_EXTENT, DESERT_EXTENT]] };
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
    nav: { nodes, links, slope: 0.32, windows },
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
