import type { Dresser } from '../../world/Dress';
import * as THREE from 'three';
import { worldBox, type StaticBuilder } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { TRENCH, desertHeight, housePadY } from './Terrain';
import { BASE, CULVERT_LANE_SOUTH, HOUSES, LANES_NORTH, LANES_SOUTH, OUTER, OUTER_LANES_NORTH, OUTER_LANES_SOUTH, ROOF_LANE, RUINS, rot } from './ArenaLayout';
import type { Zone } from '../Level';
import { buildRuins } from './Ruins';
import { BLOCK_SPEC, HOUSE_SPEC, HUT_SPEC, buildHouse, type HouseKit, type HouseResult, type HouseSpec } from './Houses';

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
  /** 70.0: the map's dresser (the convoy's vehicles are the heavy kit's). */
  dress?: Dresser | null;
  col: CollisionWorld;
  scene: THREE.Scene;
  mats: {
    /** 70.0: the convoy's burnt paint, the APC's faded tan. */
    burnt?: THREE.Material;
    tan?: THREE.Material;
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
    /** 38.0: the ruins' masonry (instanced, tinted per block). */
    sandstone: THREE.Material;
    /** 46.0: the flank houses' plaster (the Block's, the houses'), their trim, their lamps. */
    plaster: THREE.Material;
    whitewash: THREE.Material;
    roof: THREE.Material;
    bulb: THREE.Material;
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
  /** 38.0: the ruins' galleries (the watch posts, west then east) and the places in them the patrols search. */
  ruins: { posts: THREE.Vector3[]; hvas: THREE.Vector3[] };
  /** 38.0: the outcrops' tops (centres, on the rock), for the patrols. */
  outcrops: THREE.Vector3[];
  /** 46.0: the flank houses: their rooms (the storm's masks, the zones), the patrols' places in them, their roofs' centres. */
  houses: { interiors: HouseResult['interior'][]; hvas: THREE.Vector3[]; roofs: THREE.Vector3[] };
}

const DOOR_H = 2.3;
/** 38.0: the trench's revetments over the sand beside them (over Nav's knee ray, KNEE = 0.4). */
const REVET_H = 0.5;
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
  const out: ArenaResult = { spawns: { south: [], north: [] }, coverPoints: [], nodes: [], links: [], lanes: { south: [], north: [] }, zones: [], testGoals: [], ruins: { posts: [], hvas: [] }, outcrops: [], houses: { interiors: [], hvas: [], roofs: [] } };

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

    // ===================================================================== 56.0: the field
    // The open dunes round the compound (the playtest: "a lot of empty ground without cover, a long
    // field of fire"): blast walls (T-walls, 3.2 m, a panel every 1.2 m) and shipping containers
    // (2.6 m) in the ground between the bases, the compound and the flanks, clear of every lane.
    {
      const twall = (x0: number, z0: number, x1: number, z1: number) => {
        const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(L / 1.2));
        for (let i = 0; i < n; i++) {
          const a0 = (alongX ? x0 : z0) + (L * i) / n, a1 = (alongX ? x0 : z0) + (L * (i + 1)) / n;
          if (alongX) tall(flip, a0, z0, a1, z1, 3.2, m.concrete);
          else tall(flip, x0, a0, x1, a1, 3.2, m.concrete);
        }
      };
      const box = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material) => tall(flip, x0, z0, x1, z1, 2.6, mat, 'metal');
      // South-east of the compound, the south-west, and its east side (the west side is the rotation).
      box(17, 33, 19.44, 39.06, m.rust);
      twall(24, 31.2, 28.5, 31.6);
      box(-24, 35, -17.94, 37.44, m.rust);
      twall(-27.6, 30, -27.2, 34.5);
      twall(34, 8, 34.4, 13);
      box(35, -16, 37.44, -9.94, m.rust);
      for (const [x, z] of [[18.2, 32.4], [18.2, 39.7], [26.2, 32.2], [-21, 34.4], [-21, 38], [-26.6, 32.2], [33.4, 10.5], [36.2, -16.6], [36.2, -9.3]]) cover(...P(flip, x, z));
    }

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
      // 46.0: the second hut (R2) is a house now (Houses.ts), and the knee-high enclosure (R3) went with
      // the pump house (the Block's south approach).
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
      for (const [x, z] of [[-44.6, 45.2], [-44.6, 49], [-52.6, 45], [-50.5, 43.4], [-45, 35.6], [-51.6, 19]]) cover(...P(flip, x, z));
      goal(...P(flip, -48.5, 47));
      out.zones.push({ zone: flip ? HAMLET_N : HAMLET_S, rect: R(flip, -66, 6, -40, 54) });
    }

    // ===================================================================== Wadi (east in the south half)
    // A dry riverbed: sand berms (waist high), rock outcrops, a burnt APC, a sandbag nest.
    {
      const berm = (x0: number, z0: number, x1: number, z1: number) => low1(flip, x0, z0, x1, z1, 1.25, m.sandbag);
      berm(40, 52.2, 48, 53);
      berm(52, 41, 52.8, 47);
      berm(46, 33.2, 54, 34);
      berm(50, 15.6, 57, 16.4);
      rock(flip, 47, 44, 1.8, 3.0);
      rock(flip, 58, 37, 2.1, 3.4);
      rock(flip, 49.5, 26, 1.6, 2.6);
      // 46.0: clear of the wadi's house (and the Block's north approach, rotated).
      rock(flip, 67.5, 33.5, 2.0, 3.0);
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
      for (const [x, z] of [[44, 53.6], [51.4, 44], [50, 34.6], [53.5, 17], [45, 39], [56.5, 50.5]]) cover(...P(flip, x, z));
      // Into the nest by its open side.
      const ni = node(...P(flip, 56.5, 50.2)), no = node(...P(flip, 56.5, 53.4));
      out.links.push([ni, no]);
      goal(...P(flip, 56.5, 50));
      out.zones.push({ zone: flip ? WADI_N : WADI_S, rect: R(flip, 39, 6, 66, 54) });
    }
  }

  // ===================================================================== 46.0: the flank houses
  // The Block on each main flank's midline (where the pump house stood) and a house on each team's half
  // of each main flank (Houses.ts; placements in ArenaLayout.HOUSES).
  {
    const hk: HouseKit = { b, col, scene: k.scene, mats: { wall: m.plaster, trim: m.roof, floor: m.concrete, rail: m.darkMetal, crate: m.crate, wood: m.wood, dark: m.darkMetal, lamp: m.bulb } };
    const put = (spec: HouseSpec, cx: number, cz: number, su: 1 | -1, sv: 1 | -1, wall: THREE.Material) => {
      const r = buildHouse({ ...hk, mats: { ...hk.mats, wall } }, spec, { cx, cz, y0: housePadY(cx, cz), su, sv });
      const n0 = out.nodes.length;
      // (A door's outside node stands on the sand.)
      out.nodes.push(...r.nodes.map((p) => (Number.isNaN(p.y) ? p.setY(desertHeight(p.x, p.z)) : p)));
      out.links.push(...r.links.map(([i, j]) => [n0 + i, n0 + j] as [number, number]));
      out.coverPoints.push(...r.cover);
      out.testGoals.push(...r.goals);
      out.houses.hvas.push(...r.hvas);
      out.houses.interiors.push(r.interior);
      out.houses.roofs.push(new THREE.Vector3((r.interior.x0 + r.interior.x1) / 2, r.interior.h, (r.interior.z0 + r.interior.z1) / 2));
    };
    const B = HOUSES.block;
    put(BLOCK_SPEC, B.cx, B.cz, B.su, 1, m.plaster);
    put(BLOCK_SPEC, -B.cx, -B.cz, B.su === 1 ? -1 : 1, -1, m.plaster);
    for (const h of HOUSES.houses) {
      put(HOUSE_SPEC, h.cx, h.cz, h.su, 1, m.whitewash);
      put(HOUSE_SPEC, -h.cx, -h.cz, h.su === 1 ? -1 : 1, -1, m.whitewash);
    }
    // 50.0: the huts in the open ground.
    for (const h of HOUSES.huts) {
      put(HUT_SPEC, h.cx, h.cz, h.su, 1, m.plaster);
      put(HUT_SPEC, -h.cx, -h.cz, h.su === 1 ? -1 : 1, -1, m.plaster);
    }
  }

  // ===================================================================== 28.0: the outer flanks
  // Past the hamlet and the wadi, out by the cliffs: west (south half) a trench lined with sandbag
  // revetments and broken by traverses, and the Anvil, a rock outcrop with a ramp up to a perch that
  // sees the compound's roofs; east a wrecked convoy (a truck, an APC on its side, a burnt-out bus to
  // fight through) and the Spine, a lower outcrop. Each is built again rotated: every flank gets a
  // trench half and a convoy half.
  const TRENCHES_S = zone('trenches-s', 'THE TRENCHES', 'الخنادق'), TRENCHES_N = zone('trenches-n', 'THE TRENCHES', 'الخنادق');
  const CONVOY_S = zone('convoy-s', 'THE CONVOY', 'القافلة'), CONVOY_N = zone('convoy-n', 'THE CONVOY', 'القافلة');
  /** Highest sand under a rect (its corners, edges' middles and centre). */
  const high = (x0: number, z0: number, x1: number, z1: number) => {
    let h = -Infinity;
    for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) h = Math.max(h, desertHeight(x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz));
    return h;
  };
  /** A rock outcrop: a block (rock) with boulders on its flanks, a walkable top, a ramp down to the sand at its `ramp` end. */
  const outcrop = (flip: boolean, o: { x0: number; z0: number; x1: number; z1: number; h: number; ramp: { x0: number; x1: number; z1: number } }) => {
    const [x0, z0, x1, z1] = R(flip, o.x0, o.z0, o.x1, o.z1);
    const top = high(x0, z0, x1, z1) + o.h;
    solid(x0, z0, x1, z1, top, m.rock, 'concrete');
    // Boulders against the faces (the block's corners hidden), and two on top at the far end (cover).
    for (const [fx, fz, r] of [[0, 0.25, 1.6], [1, 0.6, 1.0], [0.4, 0, 1.5], [0, 0.85, 1.4]]) {
      const [px, pz] = P(flip, o.x0 + (o.x1 - o.x0) * fx, o.z0 + (o.z1 - o.z0) * fz);
      const y0 = desertHeight(px, pz) - 0.6;
      b.add(k.boulder(r, top - 0.4 - y0), m.rock, px, (top - 0.4 + y0) / 2, pz, 0, k.rnd() * Math.PI, 0);
      col.addCylinder(px, pz, r, y0, top - 0.4, 'concrete');
    }
    const far = o.ramp.z1 > o.z1 ? o.z0 : o.z1;
    for (const fx of [0.25, 0.75]) {
      const [px, pz] = P(flip, o.x0 + (o.x1 - o.x0) * fx, far + (far === o.z0 ? 1 : -1));
      b.add(k.boulder(0.75, 1.1), m.rock, px, top + 0.55, pz, 0, k.rnd() * Math.PI, 0);
      col.addCylinder(px, pz, 0.75, top, top + 1.1, 'concrete');
    }
    // The ramp: from the block's edge (top) down to the sand `ramp.z1`, a tilted rock slab over a
    // smooth ramp collider; stepped fill under it (nobody walks under).
    const rz0 = o.ramp.z1 > o.z1 ? o.z1 : o.ramp.z1, rz1 = o.ramp.z1 > o.z1 ? o.ramp.z1 : o.z0;
    const [rx0, rzz0, rx1, rzz1] = R(flip, o.ramp.x0, rz0, o.ramp.x1, rz1);
    const footZ = flip ? -o.ramp.z1 : o.ramp.z1;
    const foot = desertHeight((rx0 + rx1) / 2, footZ) - 0.1;
    const topAtMin = footZ > (rzz0 + rzz1) / 2;
    col.addRamp(rx0, rzz0, rx1, rzz1, 'z', topAtMin ? top : foot, topAtMin ? foot : top);
    const L = rzz1 - rzz0, H = top - foot;
    const slab = new THREE.BoxGeometry(rx1 - rx0, 0.5, Math.hypot(L, H));
    b.add(slab, m.rock, (rx0 + rx1) / 2, (top + foot) / 2 - 0.25, (rzz0 + rzz1) / 2, (topAtMin ? 1 : -1) * Math.atan2(H, L), 0, 0);
    // 38.0: in steps of ≤ 0.3 m (were 4, up to 0.95 m: a body jumping at the ramp's side ended inside the
    // fill under it, stress 18 of 160,000; the feet are lifted onto a ramp within 0.5 m of it).
    const fills = Math.ceil(H / 0.3);
    for (let i = 0; i < fills; i++) {
      const a0 = rzz0 + (L * i) / fills, a1 = rzz0 + (L * (i + 1)) / fills;
      const hAt = (zz: number) => foot + H * (topAtMin ? (rzz1 - zz) / L : (zz - rzz0) / L);
      const c = col.add(rx0, foot - 0.5, a0, rx1, Math.min(hAt(a0), hAt(a1)) - 0.05, a1, 'concrete');
      c.floor = false;
    }
    // On the graph: the ramp's foot, middle and top, onto the perch.
    const n0 = out.nodes.push(new THREE.Vector3((rx0 + rx1) / 2, foot + 0.1, footZ)) - 1;
    const n1 = out.nodes.push(new THREE.Vector3((rx0 + rx1) / 2, (top + foot) / 2, (rzz0 + rzz1) / 2)) - 1;
    const edgeZ = topAtMin ? rzz0 : rzz1;
    const n2 = out.nodes.push(new THREE.Vector3((rx0 + rx1) / 2, top, edgeZ + (topAtMin ? -1.2 : 1.2))) - 1;
    const n3 = out.nodes.push(new THREE.Vector3((x0 + x1) / 2, top, (z0 + z1) / 2)) - 1;
    out.links.push([n0, n1], [n1, n2], [n2, n3]);
    out.testGoals.push(new THREE.Vector3((x0 + x1) / 2, top, (z0 + z1) / 2));
    out.outcrops.push(new THREE.Vector3((x0 + x1) / 2, top, (z0 + z1) / 2));
    return top;
  };
  for (const flip of [false, true]) {
    // ---- The trench: revetments (sandbag walls over the cut's sides, a little above the sand), the
    // traverses across it (no shot down its length), its notch to the east left open.
    const T = TRENCH;
    const STEP = 3;
    const revet = (x0: number, x1: number, za: number, zb: number) => {
      for (let z = za; z < zb - 0.01; z += STEP) {
        const z1 = Math.min(zb, z + STEP);
        const [px0, pz0, px1, pz1] = R(flip, x0, z, x1, z1);
        const rim = Math.max(high(px0 - 0.6, pz0, px0, pz1), high(px1, pz0, px1 + 0.6, pz1));
        // Down to the trench's floor beside it (its footprint is on the rim; the cut is next to it).
        // 38.0: 0.5 m over the sand (was 0.35: over a step, under the graph's knee ray, so links ran across
        // it and bots routed over it stood pressed into it; vaulting it instead made links from the
        // trench's shallow ramp a bot 0.1 m deeper couldn't climb).
        solid(px0, pz0, px1, pz1, rim + REVET_H, m.sandbag, 'sand', low(px0 - 0.6, pz0, px1 + 0.6, pz1) - 0.3);
      }
    };
    revet(T.x0 - 0.4, T.x0, T.z0, T.z1);
    revet(T.x1, T.x1 + 0.4, T.z0, T.notch.z0);
    revet(T.x1, T.x1 + 0.4, T.notch.z1, T.z1);
    revet(T.x1 + 0.4, T.notch.x1, T.notch.z0 - 0.4, T.notch.z0);
    revet(T.x1 + 0.4, T.notch.x1, T.notch.z1, T.notch.z1 + 0.4);
    for (const tr of OUTER.traverses) {
      const [px0, pz0, px1, pz1] = R(flip, tr.x0, tr.z - 0.4, tr.x1, tr.z + 0.4);
      solid(px0, pz0, px1, pz1, high(px0 - 1, pz0, px1 + 1, pz1) + 0.35, m.sandbag, 'sand');
    }
    // Its floor on the graph: the centre line, each traverse's gap, the notch.
    for (let z = T.z0 + 2; z <= T.z1 - 2; z += 4) if (!OUTER.traverses.some((t) => Math.abs(t.z - z) < 1.5)) node(...P(flip, (T.x0 + T.x1) / 2, z));
    for (const tr of OUTER.traverses) {
      const gx = tr.x0 <= T.x0 + 0.01 ? (tr.x1 + T.x1) / 2 : (T.x0 + tr.x0) / 2;
      for (const dz of [-1.6, 0, 1.6]) node(...P(flip, gx, tr.z + dz));
    }
    node(...P(flip, -71, 34));
    node(...P(flip, -67.5, 34));
    goal(...P(flip, (T.x0 + T.x1) / 2, 30));
    out.zones.push({ zone: flip ? TRENCHES_N : TRENCHES_S, rect: R(flip, -89, 10, -64, 54) });

    // ---- The outcrops.
    outcrop(flip, OUTER.anvil);
    outcrop(flip, OUTER.spine);

    // ---- The convoy: a truck (cab, bed, its load), an APC on its side, a burnt-out bus (doors at its
    // west side and its tail, windows down both sides, a roof).
    {
      const t = OUTER.truck;
      const [cx0, cz0, cx1, cz1] = R(flip, t.x0, t.cab[0], t.x1, t.cab[1]);
      const fc = desertHeight((cx0 + cx1) / 2, (cz0 + cz1) / 2);
      // 70.0: the kit's burnt truck (its cab south; its load stays the crate it is), the APC on its side
      // (the turret in the sand to the west), the burnt bus with its doors and windows where the walls'
      // openings are.
      {
        const [x0, z0, x1, z1] = R(flip, t.x0, t.cab[0], t.x1, t.bed[1]);
        k.dress?.replace('truck_open', [x0, fc, z0], [x1, fc + 2.6, z1], { rotY: flip ? 0 : Math.PI, over: { paint: m.burnt ?? m.rust, rust: m.burnt ?? m.rust } });
        const a = OUTER.apc;
        const [ax0, az0, ax1, az1] = R(flip, a.x0, a.z0, a.x1, a.z1);
        const fa = desertHeight((ax0 + ax1) / 2, (az0 + az1) / 2);
        k.dress?.replace('apc', [ax0, fa, az0], [ax1, fa + 2.6, az1], { rotY: flip ? Math.PI : 0, roll: Math.PI / 2, over: { paint: m.tan ?? m.darkMetal }, margin: 0.7 });
        const bus = OUTER.bus;
        const [bx0, bz0, bx1, bz1] = R(flip, bus.x0, bus.z0, bus.x1, bus.z1);
        const fb = desertHeight(...P(flip, (bus.x0 + bus.x1) / 2, (bus.z0 + bus.z1) / 2));
        k.dress?.replace('bus', [bx0, fb, bz0], [bx1, fb + bus.h + 0.15, bz1], { rotY: flip ? Math.PI : 0, over: { rust: m.burnt ?? m.rust }, margin: 0.3 });
      }
      solid(cx0, cz0, cx1, cz1, fc + 2.6, m.rust, 'metal');
      const [bx0, bz0, bx1, bz1] = R(flip, t.x0, t.bed[0], t.x1, t.bed[1]);
      solid(bx0, bz0, bx1, bz1, fc + 1.4, m.rust, 'metal');
      const [lx0, lz0, lx1, lz1] = R(flip, t.x0 + 0.3, t.cab[0] + 4, t.x1 - 0.3, t.cab[0] + 6.2);
      solid(lx0, lz0, lx1, lz1, fc + 2.5, m.crate, 'wood', fc + 1.4);
      // Seen only (merged into the static mesh): wheels on the truck, a smashed windscreen.
      const wheel = (x: number, y: number, z: number, r: number, w: number, alongX = true) => {
        const [px, pz] = P(flip, x, z);
        b.add(new THREE.CylinderGeometry(r, r, w, 12), m.darkMetal, px, y, pz, alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
      };
      for (const wz of [1.2, 4.4, 7.2]) for (const wx of [t.x0 - 0.15, t.x1 + 0.15]) wheel(wx, fc + 0.5, t.cab[0] + wz, 0.55, 0.35);
      {
        const [wx, wz] = P(flip, (t.x0 + t.x1) / 2, t.cab[0] - 0.02);
        b.add(new THREE.BoxGeometry(2.0, 0.8, 0.06), m.darkMetal, wx, fc + 1.9, wz);
      }
      const a = OUTER.apc;
      const [ax0, az0, ax1, az1] = R(flip, a.x0, a.z0, a.x1, a.z1);
      const fa = desertHeight((ax0 + ax1) / 2, (az0 + az1) / 2);
      solid(ax0, az0, ax1, az1, fa + 2.6, m.darkMetal, 'metal');
      // On its side: its wheels face the sky's way (east), its turret lies in the sand (west).
      for (const wz of [0.9, 2.6, 4.3, 5.6]) wheel(a.x1 + 0.2, fa + 0.9, a.z0 + wz, 0.6, 0.4);
      for (const wz of [0.9, 2.6, 4.3, 5.6]) wheel(a.x1 + 0.2, fa + 1.9, a.z0 + wz, 0.6, 0.4);
      {
        // 38.0: on the sand under it and solid (moved with the APC, it floated 0.6 m over a dip: walk-through,
        // world()), 1.3 m off the hull (touching it, a step up its side: a jump from it ended in the hull, stress).
        const [tx, tz] = P(flip, a.x0 - 2, a.z0 + 3);
        const ft = low(tx - 0.7, tz - 0.7, tx + 0.7, tz + 0.7) - 0.15;
        b.add(new THREE.BoxGeometry(1.4, 1.1, 1.4), m.rust, tx, ft + 0.55, tz);
        col.add(tx - 0.7, ft, tz - 0.7, tx + 0.7, ft + 1.1, tz + 0.7, 'metal').vault = true;
        const [gx, gz] = P(flip, a.x0 - 3.5, a.z0 + 3);
        b.add(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), m.darkMetal, gx, desertHeight(gx, gz) + 0.3, gz, 0, 0, Math.PI / 2);
      }
      const bus = OUTER.bus;
      const fb = desertHeight(...P(flip, (bus.x0 + bus.x1) / 2, (bus.z0 + bus.z1) / 2));
      walls(flip, [bus.x0, bus.z0, bus.x1, bus.z1], fb, bus.h, 0.25, m.rust, [
        { side: 'w', at: 33.5, w: 1.3 }, { side: 'n', at: 74.8, w: 1.2 },
        ...[35.5, 37.8, 40].flatMap((zz) => [{ side: 'w' as Side, at: zz, w: 1.3, y0: 1.2, y1: 2.15 }, { side: 'e' as Side, at: zz, w: 1.3, y0: 1.2, y1: 2.15 }]),
        { side: 'e', at: 33.2, w: 1.3, y0: 1.2, y1: 2.15 },
      ], 'metal');
      const [rx0, rz0, rx1, rz1] = R(flip, bus.x0, bus.z0, bus.x1, bus.z1);
      solid(rx0, rz0, rx1, rz1, fb + bus.h + 0.15, m.rust, 'metal', fb + bus.h);
      for (const wz of [32.5, 39.5]) for (const wx of [bus.x0 - 0.15, bus.x1 + 0.15]) wheel(wx, fb + 0.5, wz, 0.55, 0.3);
      // Through the bus: in at the side door, along the aisle, out at the tail.
      const n = (x: number, z: number) => node(...P(flip, x, z));
      const dOut = n(72.3, 33.5), dIn = n(74.8, 33.5), mid = n(74.8, 36.5), back = n(74.8, 32.2), tail = n(74.8, 29.4);
      out.links.push([dOut, dIn], [dIn, mid], [dIn, back], [back, tail]);
      // (38.0: moved off the ruins, clear of the cliff's talus and the nav node by the spine's pocket.)
      rock(flip, 79.5, 14, 1.4, 2.8);
      rock(flip, 67.5, 22, 1.6, 2.6);
      rock(flip, 69, 44, 1.9, 3.1);
      for (const [x, z] of [[73.4, 17], [76.9, 19], [76.6, 26.5], [80.6, 26.5], [72.9, 36.5], [76.7, 38.5], [69.2, 22]]) cover(...P(flip, x, z));
      goal(...P(flip, 74.8, 36.5));
      out.zones.push({ zone: flip ? CONVOY_N : CONVOY_S, rect: R(flip, 64, 10, 89, 56) });
    }
  }

  // ===================================================================== 38.0: the ruins
  // A sandstone caravanserai on each outer flank's midline, between the trench and the convoy (Ruins.ts).
  {
    const r = buildRuins({ col, scene: k.scene, mat: m.sandstone, rnd: k.rnd });
    const n0 = out.nodes.length;
    out.nodes.push(...r.nodes);
    out.links.push(...r.links.map(([i, j]) => [n0 + i, n0 + j] as [number, number]));
    out.coverPoints.push(...r.cover);
    out.testGoals.push(...r.goals);
    out.ruins = { posts: r.posts, hvas: r.hvas };
    const RUINS_W = zone('ruins-w', 'THE RUINS', 'الأطلال'), RUINS_E = zone('ruins-e', 'THE RUINS', 'الأطلال');
    out.zones.push({ zone: RUINS_W, rect: [RUINS.x0 - 2, -RUINS.z - 2, RUINS.x1 + 2, RUINS.z + 2] }, { zone: RUINS_E, rect: [-RUINS.x1 - 2, -RUINS.z - 2, -RUINS.x0 + 2, RUINS.z + 2] });
  }

  // Lanes, at floor height.
  // 12.0: waypoints may carry their floor height (the culvert, the roofs); the rest are on the ground.
  const lift = (l: (number[])[]) => l.map(([x, z, y]) => new THREE.Vector3(x, y ?? desertHeight(x, z), z));
  const rotLane = (l: (number[])[]) => l.map(([x, z, y]) => [...rot(x, z), ...(y === undefined ? [] : [y])]);
  // 28.0: and the outer flanks (5, 6).
  out.lanes.south = [...LANES_SOUTH.map(lift), lift(CULVERT_LANE_SOUTH), lift(ROOF_LANE.south), ...OUTER_LANES_SOUTH.map(lift)];
  out.lanes.north = [...LANES_NORTH.map(lift), lift(rotLane(CULVERT_LANE_SOUTH)), lift(ROOF_LANE.north), ...OUTER_LANES_NORTH.map(lift)];
  for (const l of [...out.lanes.south, ...out.lanes.north]) for (const p of l) out.nodes.push(p.clone());
  return out;
}

