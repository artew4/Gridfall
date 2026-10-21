import * as THREE from 'three';
import { worldBox, type StaticBuilder } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { desertHeight } from './Terrain';
import { BASE, CULVERT_LANE_SOUTH, LANES_NORTH, LANES_SOUTH, ROOF_LANE, rot } from './ArenaLayout';
import type { Zone } from '../Level';

/*
  The arena's structures (6.0; layout and reasoning in ArenaLayout.ts). Everything is authored once in
  south-half coordinates and built twice, the second time rotated 180° about the origin, so both teams
  meet the same cover at the same distances. Things on the dunes stand on the terrain: each piece is
  sunk to the lowest ground under it and topped from the structure's own floor height, so walls,
  berms and rocks never float and their cover height is what it says.
*/

type Side = 'n' | 's' | 'w' | 'e';
interface Opening {
  side: Side;
  /** Centre along the wall (x for n/s walls, z for w/e walls), south-half coordinates. */
  at: number;
  w: number;
  /** Bottom and top above the floor (doors start at the floor). */
  y0?: number;
  y1?: number;
}

export interface ArenaKit {
  b: StaticBuilder;
  col: CollisionWorld;
  scene: THREE.Scene;
  mats: {
    mud: THREE.Material;
    hesco: THREE.Material;
    concrete: THREE.Material;
    sandbag: THREE.Material;
    rock: THREE.Material;
    rust: THREE.Material;
    darkMetal: THREE.Material;
    tent: THREE.Material;
    wood: THREE.Material;
    crate: THREE.Material;
  };
  boulder(r: number, h: number): THREE.BufferGeometry;
  rnd(): number;
  /** Team flag canvases (blue ALPHA, red OMEGA). */
  flag(color: string): THREE.Texture;
}

export interface ArenaResult {
  spawns: { south: THREE.Vector3[]; north: THREE.Vector3[] };
  coverPoints: THREE.Vector3[];
  nodes: THREE.Vector3[];
  /** Pairs of indices into `nodes` (doorways, chicanes), linked by hand. */
  links: [number, number][];
  lanes: { south: THREE.Vector3[][]; north: THREE.Vector3[][] };
  zones: { zone: Zone; rect: [number, number, number, number] }[];
  testGoals: THREE.Vector3[];
}

const DOOR_H = 2.3;
const WIN_Y0 = 1.15;
const WIN_Y1 = 2.0;
const FLIP_SIDE: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' };

export function buildArena(k: ArenaKit): ArenaResult {
  const { b, col, mats: m } = k;
  // Fresh zone objects per build (the outpost appends their rects).
  const zone = (id: string, name: string, jp: string): Zone => ({ id, name, jp, rects: [] });
  const ALPHA_BASE = zone('alpha-base', 'ALPHA BASE', 'قاعدة الحلفاء'), OMEGA_BASE = zone('omega-base', 'OMEGA BASE', 'قاعدة العدو');
  const HAMLET_S = zone('hamlet-s', 'SOUTH HAMLET', 'القرية الجنوبية'), HAMLET_N = zone('hamlet-n', 'NORTH HAMLET', 'القرية الشمالية');
  const WADI_S = zone('wadi-s', 'SOUTH WADI', 'الوادي الجنوبي'), WADI_N = zone('wadi-n', 'NORTH WADI', 'الوادي الشمالي');
  const out: ArenaResult = { spawns: { south: [], north: [] }, coverPoints: [], nodes: [], links: [], lanes: { south: [], north: [] }, zones: [], testGoals: [] };

  /** Lowest terrain under a rect (corners and middle). */
  const low = (x0: number, z0: number, x1: number, z1: number) =>
    Math.min(desertHeight(x0, z0), desertHeight(x1, z0), desertHeight(x0, z1), desertHeight(x1, z1), desertHeight((x0 + x1) / 2, (z0 + z1) / 2));
  /** A rect in south coordinates, in the half being built. */
  const R = (flip: boolean, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] => (flip ? [-x1, -z1, -x0, -z0] : [x0, z0, x1, z1]);
  const P = (flip: boolean, x: number, z: number): [number, number] => (flip ? rot(x, z) : [x, z]);
  const node = (x: number, z: number) => out.nodes.push(new THREE.Vector3(x, desertHeight(x, z), z)) - 1;
  const cover = (x: number, z: number) => out.coverPoints.push(new THREE.Vector3(x, desertHeight(x, z), z));
  const goal = (x: number, z: number) => out.testGoals.push(new THREE.Vector3(x, desertHeight(x, z), z));

  /** A seen-and-solid box from the ground under it up to `top` (world y). */
  const solid = (x0: number, z0: number, x1: number, z1: number, top: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', bottom?: number) => {
    const y0 = bottom ?? low(x0, z0, x1, z1) - 0.3;
    b.add(worldBox(x1 - x0, top - y0, z1 - z0, 1.5), mat, (x0 + x1) / 2, (top + y0) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, top, z1, surface);
  };

  /**
   * Walls of a roofless (ruin) or open structure, `h` above its floor `fy`, with openings. Rect and
   * openings in south coordinates; built in the half `flip` selects.
   */
  const walls = (flip: boolean, rect: [number, number, number, number], fy: number, h: number, t: number, mat: THREE.Material, openings: Opening[], surface: Collider['surface'] = 'concrete') => {
    const [x0, z0, x1, z1] = R(flip, ...rect);
    const ops = openings.map((o) => (flip ? { ...o, side: FLIP_SIDE[o.side], at: -o.at } : o));
    const run = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, side: Side) => {
      const list = ops.filter((o) => o.side === side).sort((p, q) => p.at - q.at);
      const piece = (p0: number, p1: number, yb: number | undefined, yt: number) => {
        if (p1 - p0 < 0.01) return;
        if (alongX) solid(p0, c0, p1, c1, yt, mat, surface, yb);
        else solid(c0, p0, c1, p1, yt, mat, surface, yb);
      };
      let cur = a0;
      for (const o of list) {
        const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
        piece(cur, o0, undefined, fy + h);
        const y0 = o.y0 ?? 0, y1 = o.y1 ?? DOOR_H;
        if (y0 > 0) piece(o0, o1, undefined, fy + y0);
        if (y1 < h) piece(o0, o1, fy + y1, fy + h);
        cur = o1;
      }
      piece(cur, a1, undefined, fy + h);
    };
    run(true, x0, x1, z0, z0 + t, 'n');
    run(true, x0, x1, z1 - t, z1, 's');
    run(false, z0 + t, z1 - t, x0, x0 + t, 'w');
    run(false, z0 + t, z1 - t, x1 - t, x1, 'e');
  };

  const rock = (flip: boolean, x: number, z: number, r: number, h: number) => {
    const [px, pz] = P(flip, x, z);
    const y0 = Math.min(desertHeight(px - r, pz), desertHeight(px + r, pz), desertHeight(px, pz - r), desertHeight(px, pz + r)) - 0.5;
    const top = desertHeight(px, pz) + h;
    b.add(k.boulder(r, top - y0), m.rock, px, (top + y0) / 2, pz, 0, k.rnd() * Math.PI, 0);
    col.addCylinder(px, pz, r, y0, top, 'concrete');
  };
  /** Waist-high cover you can vault (sandbags, berms, jersey barriers). */
  const low1 = (flip: boolean, x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'sand') => {
    const r = R(flip, x0, z0, x1, z1);
    const fy = desertHeight((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
    const c = solid(r[0], r[1], r[2], r[3], fy + h, mat, surface);
    c.vault = true;
  };
  const tall = (flip: boolean, x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
    const r = R(flip, x0, z0, x1, z1);
    return solid(r[0], r[1], r[2], r[3], desertHeight((r[0] + r[2]) / 2, (r[1] + r[3]) / 2) + h, mat, surface);
  };

  for (const flip of [false, true]) {
    const side = flip ? 'north' : 'south';
    // ===================================================================== Base (spawn zone)
    // HESCO walls taller than any eye; three exits, each behind a blast wall (a chicane: nobody sees
    // or shoots into the yard from the lanes).
    const fy = BASE.y;
    walls(flip, [BASE.x0, BASE.z0, BASE.x1, BASE.z1], fy, BASE.wallH, 1.0, m.hesco, [
      { side: 'n', at: 0, w: 4.4, y1: 9 },
      { side: 'w', at: 60.75, w: 3.5, y1: 9 },
      { side: 'e', at: 60.75, w: 3.5, y1: 9 },
    ], 'sand');
    // Blast walls: centre (4.3 m in front of the north wall), west and east (4 m out from the sides).
    tall(flip, -4.5, 51.3, 4.5, 51.7, 2.6, m.concrete);
    tall(flip, -19.4, 56.5, -19.0, 65, 2.6, m.concrete);
    tall(flip, 19.0, 56.5, 19.4, 65, 2.6, m.concrete);
    // Inside: a command tent, supply crates, the team flag.
    {
      const [x0, z0, x1, z1] = R(flip, -10, 66, -4.5, 69.6);
      solid(x0, z0, x1, z1, fy + 2.0, m.tent, 'wood', fy);
      solid(x0, z0 + 0.6, x1, z1 - 0.6, fy + 2.5, m.tent, 'wood', fy + 2.0);
      for (const [cx, cz] of [[8.5, 67.5], [9.7, 67.5], [8.5, 68.7]]) {
        const [px, pz] = P(flip, cx, cz);
        solid(px - 0.55, pz - 0.55, px + 0.55, pz + 0.55, fy + 1.1, m.crate, 'wood', fy);
      }
      const [fx, fz] = P(flip, 0, 69.5);
      b.add(new THREE.CylinderGeometry(0.08, 0.08, 7, 8), m.darkMetal, fx, fy + 3.5, fz);
      col.addCylinder(fx, fz, 0.08, fy, fy + 7, 'metal');
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshStandardMaterial({ map: k.flag(flip ? '#8e2a22' : '#24557e'), side: THREE.DoubleSide, roughness: 0.9 }));
      flag.position.set(fx + 0.9, fy + 6.3, fz);
      flag.castShadow = true;
      k.scene.add(flag);
    }
    // Spawn points: the yard in front of the tent, clear of everything.
    for (const [x, z] of [[-9, 61.5], [-4.5, 62.5], [0, 63], [4.5, 62.5], [9, 61.5], [-1.5, 66.5], [3, 66.8], [10.5, 64.5]]) {
      const [px, pz] = P(flip, x, z);
      out.spawns[side].push(new THREE.Vector3(px, fy, pz));
    }
    // Nav: the yard, each exit inside and out, round the blast walls.
    {
      const n = (x: number, z: number) => node(...P(flip, x, z));
      const yard = [n(0, 63), n(-9, 64), n(9, 64), n(0, 68)];
      const cIn = n(0, 58.6), cOut = n(0, 53.8), cW = n(-6.8, 53.8), cE = n(6.8, 53.8), cW2 = n(-6.8, 48.8), cE2 = n(6.8, 48.8);
      const wIn = n(-12.4, 60.75), wOut = n(-17, 60.75), wN = n(-17, 54), wS = n(-17, 67.5), wFar = n(-22, 54);
      const eIn = n(12.4, 60.75), eOut = n(17, 60.75), eN = n(17, 54), eS = n(17, 67.5), eFar = n(22, 54);
      out.links.push(
        [yard[0], cIn], [cIn, cOut], [cOut, cW], [cOut, cE], [cW, cW2], [cE, cE2],
        [yard[1], wIn], [wIn, wOut], [wOut, wN], [wOut, wS], [wN, wFar], [wN, cW],
        [yard[2], eIn], [eIn, eOut], [eOut, eN], [eOut, eS], [eN, eFar], [eN, cE],
        [yard[0], yard[1]], [yard[0], yard[2]], [yard[0], yard[3]],
      );
      const [gx, gz] = P(flip, -6, 63);
      out.testGoals.push(new THREE.Vector3(gx, fy, gz));
    }
    out.zones.push({ zone: flip ? OMEGA_BASE : ALPHA_BASE, rect: R(flip, BASE.x0, BASE.z0, BASE.x1, BASE.z1) });

    // ===================================================================== Centre approach
    // A burnt-out truck, jersey barriers, a sandbag nest facing the compound, two rocks.
    {
      const [x0, z0, x1, z1] = R(flip, 3.5, 38, 5.9, 40);
      const fyT = desertHeight((x0 + x1) / 2, (z0 + z1) / 2);
      solid(x0, z0, x1, z1, fyT + 2.3, m.rust, 'metal');
      const bed = R(flip, 3.5, 40, 5.9, 44);
      solid(bed[0], bed[1], bed[2], bed[3], fyT + 1.3, m.rust, 'metal');
    }
    low1(flip, -9, 44, -5.5, 44.6, 0.9, m.concrete, 'concrete');
    low1(flip, -1, 34.4, 2.5, 35, 0.9, m.concrete, 'concrete');
    low1(flip, -12, 36, -8, 36.6, 1.05, m.sandbag);
    low1(flip, -12.6, 36, -12, 39.5, 1.05, m.sandbag);
    low1(flip, -8, 36, -7.4, 39.5, 1.05, m.sandbag);
    rock(flip, 9, 33, 1.5, 2.6);
    rock(flip, -14.5, 47, 1.7, 2.9);
    for (const [x, z] of [[4.7, 37.3], [4.7, 44.7], [-7.2, 45.2], [0.7, 35.7], [-10, 39.4], [9, 35.2], [-14.5, 44.6]]) cover(...P(flip, x, z));

    // ===================================================================== Hamlet (west in the south half)
    // R1 on the lane: in through the east door, out of the north door (the lane runs on north-west). R2
    // beside it, enterable from the east, the north and the south. R3 a broken enclosure of low walls. Loose low walls between them.
    {
      const r1: [number, number, number, number] = [-52, 44, -45, 50];
      const f1 = desertHeight(...P(flip, -48.5, 47));
      walls(flip, r1, f1, 2.7, 0.35, m.mud, [
        { side: 'e', at: 47, w: 1.4 }, { side: 'n', at: -49, w: 1.4 },
        { side: 's', at: -48.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'w', at: 46.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
      ]);
      const r2: [number, number, number, number] = [-63, 23, -55, 30];
      const f2 = desertHeight(...P(flip, -59, 26.5));
      walls(flip, r2, f2, 2.7, 0.35, m.mud, [
        { side: 'e', at: 26.5, w: 1.4 }, { side: 'n', at: -59, w: 1.4 }, { side: 's', at: -61, w: 1.4 },
        { side: 'w', at: 26.5, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'e', at: 28.8, w: 1.0, y0: WIN_Y0, y1: WIN_Y1 },
      ]);
      // R3: knee-to-waist walls, gaps on every side.
      const f3 = desertHeight(...P(flip, -57, 10.5));
      walls(flip, [-60, 8, -54, 13], f3, 1.15, 0.35, m.mud, [
        { side: 'n', at: -57, w: 1.6, y1: 9 }, { side: 's', at: -56, w: 1.6, y1: 9 }, { side: 'e', at: 10.5, w: 1.6, y1: 9 }, { side: 'w', at: 10, w: 1.4, y1: 9 },
      ]);
      low1(flip, -47, 36, -43, 36.4, 1.1, m.mud, 'concrete');
      low1(flip, -52.4, 17, -52, 21, 1.1, m.mud, 'concrete');
      // Doors (both sides) and rooms on the graph.
      const door = (ox: number, oz: number, ix: number, iz: number) => {
        const a = node(...P(flip, ox, oz)), c = node(...P(flip, ix, iz));
        out.links.push([a, c]);
        return c;
      };
      const a1 = node(...P(flip, -48.5, 47));
      out.links.push([door(-43.8, 47, -46.2, 47), a1], [door(-49, 42.8, -49, 45.2), a1]);
      const a2 = node(...P(flip, -59, 26.5));
      out.links.push([door(-53.8, 26.5, -56.2, 26.5), a2], [door(-59, 21.8, -59, 24.2), a2], [door(-61, 31.2, -61, 28.8), a2]);
      node(...P(flip, -57, 10.5));
      for (const [x, z] of [[-44.6, 45.2], [-44.6, 49], [-52.6, 45], [-50.5, 43.4], [-54.4, 24.5], [-54.4, 29.2], [-63.6, 25], [-60.6, 9.2], [-53.4, 12], [-45, 35.6], [-51.6, 19]]) cover(...P(flip, x, z));
      goal(...P(flip, -48.5, 47));
      goal(...P(flip, -59, 26.5));
      out.zones.push({ zone: flip ? HAMLET_N : HAMLET_S, rect: R(flip, -66, 6, -40, 54) });
    }

    // ===================================================================== Wadi (east in the south half)
    // A dry riverbed: sand berms (waist high), rock outcrops, a burnt APC, a sandbag nest.
    {
      const berm = (x0: number, z0: number, x1: number, z1: number) => low1(flip, x0, z0, x1, z1, 1.25, m.sandbag);
      berm(40, 52.2, 48, 53);
      berm(52, 41, 52.8, 47);
      berm(46, 33.2, 54, 34);
      berm(59, 20, 59.8, 28);
      berm(50, 15.6, 57, 16.4);
      rock(flip, 47, 44, 1.8, 3.0);
      rock(flip, 58, 37, 2.1, 3.4);
      rock(flip, 49.5, 26, 1.6, 2.6);
      rock(flip, 63.5, 31, 2.0, 3.0);
      rock(flip, 54, 9, 1.7, 2.8);
      // APC: hull, turret.
      const [x0, z0, x1, z1] = R(flip, 41.7, 36, 44.3, 42);
      const fa = desertHeight((x0 + x1) / 2, (z0 + z1) / 2);
      solid(x0, z0, x1, z1, fa + 2.0, m.rust, 'metal');
      const tr = R(flip, 42.3, 38.2, 43.7, 39.8);
      solid(tr[0], tr[1], tr[2], tr[3], fa + 2.7, m.darkMetal, 'metal', fa + 2.0);
      // Nest: a U open to the south (towards home).
      low1(flip, 54.5, 48, 58.5, 48.6, 1.05, m.sandbag);
      low1(flip, 54.5, 48.6, 55.1, 51.5, 1.05, m.sandbag);
      low1(flip, 57.9, 48.6, 58.5, 51.5, 1.05, m.sandbag);
      for (const [x, z] of [[44, 53.6], [51.4, 44], [50, 34.6], [60.4, 24], [53.5, 17], [45, 39], [56.5, 50.5]]) cover(...P(flip, x, z));
      // Into the nest by its open side.
      const ni = node(...P(flip, 56.5, 50.2)), no = node(...P(flip, 56.5, 53.4));
      out.links.push([ni, no]);
      goal(...P(flip, 56.5, 50));
      out.zones.push({ zone: flip ? WADI_N : WADI_S, rect: R(flip, 39, 6, 66, 54) });
    }
  }

  // ===================================================================== Pump houses (each flank's midpoint)
  // Point-symmetric on their own (doors at both ends), one on each flank: x = -60 and its rotation.
  for (const flip of [false, true]) {
    const f = desertHeight(...P(flip, -60, 0));
    walls(flip, [-62.5, -2.5, -57.5, 2.5], f, 2.8, 0.35, m.mud, [
      { side: 'n', at: -60, w: 1.4 }, { side: 's', at: -60, w: 1.4 },
      { side: 'w', at: 0, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 }, { side: 'e', at: 0, w: 1.2, y0: WIN_Y0, y1: WIN_Y1 },
    ]);
    // A pump inside (cover in the middle of the room).
    const [px, pz] = P(flip, -60, 0);
    solid(px - 0.6, pz - 0.5, px + 0.6, pz + 0.5, f + 1.1, m.darkMetal, 'metal');
    // Through the house: outside, inside either end, round the pump.
    const n = (x: number, z: number) => node(...P(flip, x, z));
    const oN = n(-60, -4), iN = n(-60, -1.6), side = n(-61.4, 0), iS = n(-60, 1.6), oS = n(-60, 4);
    out.links.push([oN, iN], [iN, side], [side, iS], [iS, oS]);
    for (const [x, z] of [[-60, 1.4], [-60, -1.4], [-63.1, 1.5], [-56.9, -1.5]]) cover(...P(flip, x, z));
    goal(...P(flip, -61.4, 0));
  }

  // Lanes, at floor height.
  // 12.0: waypoints may carry their floor height (the culvert, the roofs); the rest are on the ground.
  const lift = (l: (number[])[]) => l.map(([x, z, y]) => new THREE.Vector3(x, y ?? desertHeight(x, z), z));
  const rotLane = (l: (number[])[]) => l.map(([x, z, y]) => [...rot(x, z), ...(y === undefined ? [] : [y])]);
  out.lanes.south = [...LANES_SOUTH.map(lift), lift(CULVERT_LANE_SOUTH), lift(ROOF_LANE.south)];
  out.lanes.north = [...LANES_NORTH.map(lift), lift(rotLane(CULVERT_LANE_SOUTH)), lift(ROOF_LANE.north)];
  for (const l of [...out.lanes.south, ...out.lanes.north]) for (const p of l) out.nodes.push(p.clone());
  return out;
}

