import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glow, Glows } from '../../world/Glows';
import type { BuildCtx, Mats } from '../../world/City';
import { addSign, type SignSpec } from '../../world/Signs';
import { applyWet } from '../../world/Ground';
import { bakeSpill, Spill, type SpillSource } from '../../world/Spill';
import { StreetKit } from '../../world/StreetKit';
import type { SignCatch } from '../../world/Storefronts';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import type { RainAreas } from '../../world/Rain';
import { chainLinkTexture, concreteTexture as pavedTexture, perforatedTexture } from '../../world/Textures';
import { concreteTexture, steelTexture } from '../jungle/textures';
import { corrugatedTexture, crateTexture } from '../desert/textures';
import { Dresser, militaryMats } from '../../world/Dress';
import { propKits } from '../../entities/weapons/models';
import { BARGES, BASE, CAB, CONT, CRANE_STAIR, DECK, DEPOT, DRAINS, END_Z, EXITS, HALL, MAZE, QG, QUAY_WALLS, QUAY_X, TOWER, WEST_X, WH, lanesOf, mz, spawnsOf, stackColor, zoneAt } from './DocksLayout';
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
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
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
  /** 86.0: the neon's light on the apron, the signs and tubes for the puddles, the manholes' steam. */
  spill: Spill;
  signPool: SignCatch[];
  steamEmitters: THREE.Vector4[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildDocks(scene: THREE.Scene, col: CollisionWorld, glows: Glows, time: { value: number }, fog: THREE.FogExp2): DocksResult {
  const b = new StaticBuilder();
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.8, metal = 0, env = 0.6) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const hdr = (r: number, g: number, bl: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bl) });

  const ground = std(pavedTexture(), 0x8a8e94, 0.7, 0, 1.15);
  applyWet(ground, time, { puddles: true, wet: 0.88, oil: true });
  const whFloor = std(concreteTexture('#5d605c', 1), 0xffffff, 0.6, 0, 0.9);
  applyWet(whFloor, time, { puddles: false, wet: 0.3 });
  const steel = (paint: string) => std(steelTexture(paint, 14), 0xffffff, 0.55, 0.35, 0.7);
  const m = {
    // 32.0: the stacks' callout colours kept, a little greyer (were #22508f, #c49416, #922a20).
    blue: steel('#2a4f80'),
    yellow: steel('#b0903a'),
    red: steel('#83342c'),
    rust: steel('#6a4632'),
    green: steel('#2d5a43'),
    wall: std(corrugatedTexture(), 0x8c939b, 0.65, 0.5, 0.6),
    roof: std(steelTexture('#2b3036', 16), 0xffffff, 0.6, 0.5, 0.4),
    concrete: std(concreteTexture('#6c6f6c', 2), 0xffffff, 0.85, 0, 0.6),
    jersey: std(concreteTexture('#9a9a92', 1), 0xffffff, 0.8, 0, 0.6),
    darkMetal: std(null, 0x2a2d31, 0.5, 0.7, 0.7),
    paint: std(null, 0xa88c45, 0.45, 0.45, 0.7),
    deck: std(perforatedTexture(), 0x9aa0a6, 0.55, 0.6, 0.7),
    crate: std(crateTexture('DOCK 7', 'ДОК-7 · ГРУЗ', '#3b4a5a', '#d6d2c4'), 0xffffff, 0.8, 0, 0.5),
    pallet: std(crateTexture('PALLET', 'ЭКСПОРТ · EXPORT', '#5a4a36', '#d9cfae'), 0xffffff, 0.85, 0, 0.4),
    fence: new THREE.MeshStandardMaterial({ map: chainLinkTexture(), color: 0xb8c0c8, roughness: 0.5, metalness: 0.6, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    water: std(null, 0x05090f, 0.05, 0.25, 1.4),
    hull: std(steelTexture('#1d2430', 20), 0xffffff, 0.7, 0.4, 0.3),
    // 32.0: the lamp heads dimmer and less orange, the neon accents soft violet and deep blue (8.0–31.0:
    // full magenta and cyan, sodium orange: "acidic", eye strain).
    amber: hdr(4.2, 3.1, 1.8),
    white: hdr(4.2, 4.5, 5.0),
    warm: hdr(4.2, 3.6, 2.5),
    alphaLamp: hdr(1.6, 3.4, 6.0),
    omegaLamp: hdr(6.0, 1.2, 1.0),
    magenta: hdr(1.7, 1.0, 2.8),
    cyan: hdr(0.6, 1.3, 3.0),
  };
  const stacks = { blue: m.blue, yellow: m.yellow, red: m.red };
  // 70.0: the kits (Dress.ts): the containers in their paints (20 ft and the trailer's 40 ft), the
  // crates and pallets as cargo on pallets, the jersey barriers. Without them, boxes.
  const kit = propKits();
  const dress = kit ? new Dresser(b, kit, militaryMats({}, { concrete: m.jersey })) : null;
  for (const c of [m.blue, m.yellow, m.red, m.rust, m.green]) dress?.rule(c, 'container', { paint: c });
  dress?.rule(m.crate, 'stack', { label: m.crate });
  dress?.rule(m.pallet, 'stack', { label: m.pallet });
  dress?.rule(m.jersey, 'jersey', { concrete: m.jersey });
  // 73.0: the handrails (their own copy of the paint, ruled: plates with posts and a top tube) and the
  // racks' steel (Dress.ts: the port kit).
  const railMat = m.paint.clone();
  dress?.rule(railMat, 'rail_panel', { paint: m.paint, mesh: m.darkMetal });
  const port = { paint: m.paint, mesh: m.darkMetal, dark: m.darkMetal };

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
  const rail2 = (x0: number, z0: number, x1: number, z1: number, y: number) => solid2(x0, y, z0, x1, y + 1.05, z1, railMat, 'metal', 1);
  /**
   * 49.0, a pallet rack (south and mirrored): one solid box (rounds and bodies), drawn as its painted
   * uprights and three shelves with crated goods between them, inset 4 cm inside the box.
   */
  function rack2(x0: number, z0: number, x1: number, z1: number, h: number) {
    // 54.0: the box stops bodies only; rounds and sight are stopped by what is drawn (the uprights, the
    // shelves, the goods), so the gaps between the goods are gaps (the playtest: "there's an open space
    // between the boxes on the racks that should be shot through").
    const see = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const c = col.add(ax, ay, az, bx, by, bz, 'metal');
      c.solid = false;
    };
    for (const flip of [false, true]) {
      const za = flip ? -z1 : z0, zb = flip ? -z0 : z1;
      col.add(x0, 0, za, x1, h, zb, 'metal').ray = false;
      const zc = (za + zb) / 2, d = zb - za;
      const bays = Math.max(1, Math.round((x1 - x0) / 2.7));
      for (let i = 0; i <= bays; i++) {
        const x = Math.min(x1 - 0.06, Math.max(x0 + 0.06, x0 + ((x1 - x0) * i) / bays));
        if (!dress?.place('rack_frame', new THREE.Matrix4().compose(new THREE.Vector3(x, 0, zc), new THREE.Quaternion(), new THREE.Vector3(1, h, d)), port)) b.add(new THREE.BoxGeometry(0.1, h, d), m.paint, x, h / 2, zc);
        see(x - 0.05, 0, za, x + 0.05, h, zb);
      }
      for (const y of [0.12, 1.5, h - 0.06]) {
        if (!dress?.place('rack_beam', new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y - 0.05, zc), new THREE.Quaternion(), new THREE.Vector3(x1 - x0, 1, d - 0.02)), port)) b.add(new THREE.BoxGeometry(x1 - x0, 0.1, d - 0.02), m.paint, (x0 + x1) / 2, y, zc);
        see(x0, y - 0.05, za + 0.01, x1, y + 0.05, zb - 0.01);
      }
      for (let i = 0; i < bays; i++) {
        const a = x0 + ((x1 - x0) * i) / bays + 0.14, c = x0 + ((x1 - x0) * (i + 1)) / bays - 0.14;
        b.add(worldBox(c - a, 1.2, d - 0.08, 1.2), i % 2 ? m.crate : m.pallet, (a + c) / 2, 0.17 + 0.6, zc);
        see(a, 0.17, za + 0.04, c, 1.37, zb - 0.04);
        const w = (c - a) * (i % 3 ? 0.9 : 0.6);
        b.add(worldBox(w, 1.1, d - 0.08, 1.1), i % 2 ? m.pallet : m.crate, (a + c) / 2, 1.55 + 0.55, zc);
        see((a + c) / 2 - w / 2, 1.55, za + 0.04, (a + c) / 2 + w / 2, 2.65, zb - 0.04);
      }
    }
  }
  /**
   * 49.0, the foreman's office under the bridge (HALL.office): walls up to the bridge's underside
   * (between its columns), two doors on each long side at x ±3 (a line through two of them meets a
   * rack), cabinets at the ends.
   */
  function office() {
    const O = HALL.office, t = 0.2, top = DECK - 0.25, dw = 1.4;
    for (const [a, c] of [[O.z0, O.z0 + t], [O.z1 - t, O.z1]]) {
      solid(O.x0, 0, a, -3 - dw / 2, top, c, m.wall, 'metal', 3);
      solid(-3 + dw / 2, 0, a, 3 - dw / 2, top, c, m.wall, 'metal', 3);
      solid(3 + dw / 2, 0, a, O.x1, top, c, m.wall, 'metal', 3);
      for (const x of [-3, 3]) solid(x - dw / 2, 2.3, a, x + dw / 2, top, c, m.wall, 'metal', 3);
    }
    for (const [a, c] of [[O.x0, O.x0 + t], [O.x1 - t, O.x1]]) solid(a, 0, O.z0 + t, c, top, O.z1 - t, m.wall, 'metal', 3);
    // Filing cabinets along both short walls.
    for (const [a, c] of [[O.x0 + t, O.x0 + 0.7], [O.x1 - 0.7, O.x1 - t]]) solid(a, 0, O.z0 + t, c, 1.8, O.z1 - t, m.darkMetal, 'metal', 1);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), m.warm);
    lamp.position.set(0, top - 0.1, 0);
    scene.add(lamp);
  }

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
  // 49.0: the quay ends at its fence (GX1 was QUAY_X + 0.6, and the water 1.1 m out: a metre of kerb
  // outside the fence, reached from the gangways, ran the whole waterfront).
  const GX0 = WEST_X - 1, GX1 = QUAY_X + 0.15, GZ = BASE.z1 + 1;
  slab(GX0, -GZ, GX1, WH.z0, ground);
  slab(GX0, WH.z1, GX1, GZ, ground);
  slab(GX0, WH.z0, WH.x0, WH.z1, ground);
  slab(WH.x1, WH.z0, GX1, WH.z1, ground);
  slab(WH.x0, WH.z0, WH.x1, WH.z1, whFloor);
  // Quay edge face down to the water, and the harbour itself (black, glossy, never reached).
  solid(GX1 - 0.05, -1.8, -END_Z - 0.6, GX1, 0, END_Z + 0.6, m.concrete, 'concrete', 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), m.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(GX1 + 200, -1.3, 0);
  scene.add(water);
  // Water barrier: a 1.6 m chain-link fence (you see and shoot through it, you can't climb it).
  // 28.0: in pieces, open where a gangway crosses to a barge.
  const gaps = BARGES.gangways.flatMap((g) => [[g.z0, g.z1], [-g.z1, -g.z0]]).sort((a, b) => a[0] - b[0]);
  let fz = -END_Z;
  for (const [g0, g1] of [...gaps, [END_Z, END_Z]]) {
    if (g0 - fz > 0.01) solid(QUAY_X - 0.1, 0, fz, QUAY_X + 0.1, 1.6, g0, m.fence, 'metal', 1.6).ray = false;
    fz = g1;
  }
  for (let z = -END_Z; z <= END_Z + 0.01; z += 6) b.add(new THREE.BoxGeometry(0.1, 1.6, 0.1), m.darkMetal, QUAY_X, 0.8, z);
  b.add(new THREE.BoxGeometry(0.08, 0.08, 2 * END_Z), m.darkMetal, QUAY_X, 1.55, 0);
  // ---------------------------------------------------------------- 28.0: the barges
  // Hulls to the deck (seen and solid: walked on), gangways over the gap from the quay, pontoons
  // between; rails (1.05 m, never vaulted) along every edge over water but the joins.
  const BG = BARGES;
  const deckBox = (x0: number, z0: number, x1: number, z1: number, top: number, bottom: number, mat: THREE.Material) => solid2(x0, bottom, z0, x1, top, z1, mat, 'metal', 2);
  for (const h of BG.hulls) {
    deckBox(h.x0, h.z0, h.x1, h.z1, BG.deck, -1.9, m.hull);
    const rails: [number, number, number, number][] = [[h.x1 - 0.3, h.z0, h.x1, h.z1]];
    // The quay side, open at its gangway; the ends, open where a pontoon joins.
    const g = BG.gangways.find((w) => w.z0 >= h.z0 && w.z1 <= h.z1)!;
    rails.push([h.x0, h.z0, h.x0 + 0.3, g.z0], [h.x0, g.z1, h.x0 + 0.3, h.z1]);
    const joins = [...BG.pontoons, BG.middle];
    for (const zEnd of [h.z0, h.z1]) {
      const p = joins.find((q) => Math.abs(q.z0 - zEnd) < 0.01 || Math.abs(q.z1 - zEnd) < 0.01);
      const z0 = zEnd === h.z0 ? h.z0 : h.z1 - 0.3, z1 = z0 + 0.3;
      if (p) rails.push([h.x0, z0, p.x0, z1], [p.x1, z0, h.x1, z1]);
      else rails.push([h.x0, z0, h.x1, z1]);
    }
    for (const [x0, z0, x1, z1] of rails) solid2(x0, BG.deck, z0, x1, BG.deck + 1.05, z1, m.darkMetal, 'metal', 1);
  }
  for (const w of BG.gangways) solid2(QUAY_X - 0.1, -0.35, w.z0, BG.hulls[0].x0 + 0.2, -0.05, w.z1, m.deck, 'metal', 1);
  // 49.0: handrails along the gangways (stepping off one sideways was a fall into the harbour).
  for (const w of BG.gangways) for (const [z0, z1] of [[w.z0, w.z0 + 0.08], [w.z1 - 0.08, w.z1]]) solid2(QUAY_X + 0.1, -0.05, z0, BG.hulls[0].x0, 1.0, z1, m.darkMetal, 'metal', 1);
  const pontoon = (p: { x0: number; x1: number; z0: number; z1: number }, both: boolean) => {
    const build = both ? solid2 : (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, s: Collider['surface'], t: number) => [solid(x0, y0, z0, x1, y1, z1, mat, s, t)];
    build(p.x0, -1.0, p.z0, p.x1, BG.pontoon, p.z1, m.deck, 'metal', 1);
    build(p.x0 - 0.1, BG.pontoon, p.z0, p.x0, BG.pontoon + 1.05, p.z1, m.darkMetal, 'metal', 1);
    build(p.x1, BG.pontoon, p.z0, p.x1 + 0.1, BG.pontoon + 1.05, p.z1, m.darkMetal, 'metal', 1);
  };
  for (const p of BG.pontoons) pontoon(p, true);
  pontoon(BG.middle, false);
  // Cargo on the decks: a two-high stack on the second barge. 49.0: and cargo across each deck from
  // alternate rails (BARGES.cargo): the way along the water weaves from side to side.
  const onDeck = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, vault = false) => {
    for (const c of solid2(x0, BG.deck, z0, x1, BG.deck + h, z1, mat, 'metal', 1)) c.vault = vault && h <= 1.05;
  };
  onDeck(53.0, 42.97, 55.4, 49.03, CONT.H * 2, stacks.blue);
  BG.cargo.forEach(([x0, z0, x1, z1, h], i) => onDeck(x0, z0, x1, z1, h, [stacks.yellow, m.rust, m.green][i % 3]));
  // The harbour is water: no ground under it (fall in and drown, DocksLevel.drown).
  col.holes.push({ x0: GX1, z0: -400, x1: 400, z1: 400 });

  // West: the back of the next warehouse row (7 m); the forecourts' closures (4 m) either side of the yards.
  solid(WEST_X - 1, 0, -END_Z - 0.6, WEST_X, 7, END_Z + 0.6, m.wall, 'metal', 3);
  for (const s of [1, -1]) {
    const z0 = s > 0 ? END_Z : -END_Z - 0.6, z1 = z0 + 0.6;
    solid(WEST_X, 0, z0, BASE.x0, 4, z1, m.concrete, 'concrete', 2);
    solid(BASE.x1, 0, z0, QUAY_X - 0.1, 4, z1, m.concrete, 'concrete', 2);
  }

  // ---------------------------------------------------------------- spawn yards (south, mirrored)
  const BW = 3.4;
  // 15.0: two exits, not three, and each turned out to its flank by an L of blast wall (the centre
  // exit opened straight onto the warehouse door: the match started there and stayed there).
  const exits = EXITS;
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
      // Blast walls in front of each exit (no line of fire into the yard), with a wing on the inner
      // side back to the yard wall: out of the west exit you can only turn west, out of the east, east.
      for (const x of exits) {
        const [w0, w1] = zr(55, 55.6);
        solid(x - 3.5, 0, w0, x + 3.5, 2.6, w1, m.jersey, 'concrete', 1);
        const ix = x < 0 ? x + 3.5 - 0.6 : x - 3.5;
        const [g0, g1] = zr(55.6, BASE.z0);
        solid(ix, 0, g0, ix + 0.6, 2.6, g1, m.jersey, 'concrete', 1);
      }
    }
    // Yard props: a generator and crates against the side walls (cover from the exits, not traps).
    const [g0, g1] = zr(70, 72.4);
    // 70.0: the kit's gensets.
    dress?.replace('generator', [BASE.x0 + 0.6, 0, g0], [BASE.x0 + 2.4, 1.9, g1], { over: { paint: m.darkMetal }, margin: 0.05 });
    dress?.replace('generator', [BASE.x1 - 2.4, 0, g0], [BASE.x1 - 0.6, 1.9, g1], { rotY: Math.PI, over: { paint: m.darkMetal }, margin: 0.05 });
    solid(BASE.x0 + 0.6, 0, g0, BASE.x0 + 2.4, 1.9, g1, m.darkMetal, 'metal', 1);
    solid(BASE.x1 - 2.4, 0, g0, BASE.x1 - 0.6, 1.9, g1, m.darkMetal, 'metal', 1);
    // A mast against the back wall: team light.
    mast(0, Z(BASE.z1 - 0.8), 9, flip ? m.omegaLamp : m.alphaLamp, flip ? 0xff3a30 : 0x58a8ff, 220, 30);
  }

  // ---------------------------------------------------------------- lane 1: the container maze
  // An 8 m grid; each cell holds one container, along x (H) or z (V), one or two high. Corridors run
  // on every cell boundary: 1.9 m where two long sides face each other, 3.7 m elsewhere.
  // 49.0: brick-bond: rows 1 and 3 half a cell west (MAZE.shift), so each corridor along z ends at a
  // container a row on; the cells by the depot stand along z (an x one left a 0.75 m slot to its boxes).
  const PATTERN: [('x' | 'z'), 1 | 2][][] = [
    [['x', 1], ['x', 2], ['z', 1], ['x', 1]],
    [['z', 1], ['x', 2], ['z', 1], ['x', 1]],
    [['z', 2], ['x', 1], ['z', 1], ['x', 2]],
    [['z', 1], ['z', 1], ['x', 2], ['z', 1]],
  ];
  MAZE.zs.forEach((cz, j) => MAZE.xs.forEach((cx, i) => container2(cx + (j % 2 ? MAZE.shift : 0), cz, PATTERN[j][i][0], PATTERN[j][i][1])));
  // Steel stairs onto two containers (a look over the maze). R1 runs along the east side of cell
  // (2,2), foot open to the z = 24 corridor, top beside the container (step across onto its roof);
  // the corridor keeps 1.3 m beside it. R2 climbs the south end of cell (1,3) (49.0: was (0,3)).
  stair2(-31.78, 17.2, -29.38, 20.7, 'z', -1, 0, CONT.H, m.darkMetal, ['hi']);
  stair2(-46.25, 31.03, -43.75, 34.53, 'z', -1, 0, CONT.H, m.darkMetal, ['lo', 'hi']);
  // The divider between the maze and the warehouse alley: double stacks with two gaps per half
  // (z 6–16 at the warehouse's west door, and beyond z 28 into the forecourt).
  for (const cz of [3.03, 18.97, 25.03]) container2(-18.22, cz, 'z', 2);
  // 49.0: the maze's east alley closed at z ±24 (it ran beside the divider end to end), and the
  // warehouse alley (between the divider and the wall) at the middle.
  container2(-20.7, 24, 'z', 2);
  solid(-17, 0, -1, -14, CONT.H, 1, m.crate, 'wood', 1.3);
  // Forecourt side: a double stack and a single, a barrier.
  container2(-44, 46, 'x', 2);
  container2(-24, 44, 'z', 1);
  vault2(-40, 52, -36, 52.6, 0.95, m.jersey);

  // ---------------------------------------------------------------- 28.0: the old depot
  // Two broken lines of containers along the moved wall, cross pieces closing corridors into dead
  // ends; the two-high stack at z 18 is a sniper perch, up a steel stair from the z 27 gap.
  for (const [cx, cz, along, n] of DEPOT.boxes) container2(cx, cz, along, n);
  {
    const S = DEPOT.stair;
    stair2(S.x0, S.z0, S.x1, S.z1, 'z', -1, 0, DEPOT.stack.top, m.darkMetal, ['lo', 'hi']);
    // A crate on the perch's far end: a little cover up there.
    solid2(-65, DEPOT.stack.top, 15.4, -63, DEPOT.stack.top + 0.7, 16.4, m.darkMetal, 'metal', 1);
    // 49.0: the stack in front of it a third container high: the perch keeps its own half.
    const W = DEPOT.wall;
    solid2(W.cx - CONT.W / 2, 2 * CONT.H, W.cz - CONT.L / 2, W.cx + CONT.W / 2, W.top, W.cz + CONT.L / 2, stacks[stackColor(W.cz)], 'metal', CONT.H);
  }
  vault2(-62.78, 35.7, -59.22, 36.3, 0.95, m.jersey);
  // 49.0: the depot's east corridor (beside the maze) closed at z ±20, a two-high pair from the depot's
  // cross piece to the maze.
  container2(-53.5, 20, 'x', 2);

  // ---------------------------------------------------------------- lane 2: the warehouse
  const T = 0.4;
  for (const flip of [false, true]) {
    const zr = (a: number, c: number): [number, number] => (flip ? [-c, -a] : [a, c]);
    const [e0, e1] = zr(WH.z1 - T, WH.z1);
    // 15.0: the main door narrowed to 4 m (was 8 m by 6 m): a way through, not a gate to hold.
    wall(true, WH.x0, WH.x1, e0, e1, WH.h, m.wall, [{ at: 0, w: 4, y1: 4.5 }, { at: -12, w: 1.6, y1: 2.3 }, { at: 12, w: 1.6, y1: 2.3 }]);
  }
  const sideOpen = (zs: number[], w: number, y0: number, y1: number): Opening[] => zs.flatMap((z) => [{ at: z, w, y0, y1 }, { at: -z, w, y0, y1 }]);
  wall(false, WH.z0 + T, WH.z1 - T, WH.x0, WH.x0 + T, WH.h, m.wall, sideOpen([12], 3, 0, 2.6));
  // 49.0: the catwalk door at z ±24, onto the stair tower's landing (was ±20.3, its own stair's).
  wall(false, WH.z0 + T, WH.z1 - T, WH.x1 - T, WH.x1, WH.h, m.wall, [...sideOpen([6.5], 3, 0, 2.6), ...sideOpen([TOWER.door], 2, DECK, 6.6)]);
  // 15.0: no roof. Open trusses across it (out of reach: 6.8 m and up over a 4.5 m catwalk), so the
  // floor and the catwalks are seen from the quay gantry and the crane nest (until 32.0: the roof).
  for (let z = -20; z <= 20.01; z += 8) solid(WH.x0 + 0.4, WH.h - 0.2, z - 0.15, WH.x1 - 0.4, WH.h, z + 0.15, m.darkMetal, 'metal', 1);
  // 32.0: the roof back on (a steel deck on the trusses), and the walls on up round it to the parapet:
  // the rain stays outside (Rain's shelter below), and nobody stands on it (WH.parapet).
  solid(WH.x0, WH.h, WH.z0, WH.x1, WH.roof, WH.z1, m.roof, 'metal', 4);
  for (const zs of [1, -1]) solid(WH.x0, WH.h, zs > 0 ? WH.z1 - T : WH.z0, WH.x1, WH.parapet, zs > 0 ? WH.z1 : WH.z0 + T, m.wall, 'metal', 3);
  for (const [x0, x1] of [[WH.x0, WH.x0 + T], [WH.x1 - T, WH.x1]]) solid(x0, WH.h, WH.z0 + T, x1, WH.parapet, WH.z1 - T, m.wall, 'metal', 3);
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
  solid(-10.6, DECK, -1.5, 10.6, DECK + 1.05, -1.42, railMat, 'metal', 1);
  solid(-10.6, DECK, 1.42, 10.6, DECK + 1.05, 1.5, railMat, 'metal', 1);
  for (const x of [-5, 5]) solid(x - 0.15, 0, -0.15, x + 0.15, DT, 0.15, m.darkMetal, 'metal', 1);
  // Floor cover: 15.0, only low cover (a jersey line, pallets): the crate stacks, the container and
  // the stack under the bridge were the fortress that held the match (8.0–14.0: 60–75% of bot time
  // in the centre lane). Crossing the floor is now a risk, not a place to stay.
  vault2(-8, 5, -4, 5.6, 0.95, m.jersey);
  // 49.0: the floor was a 52 m hall with three low barriers (89% of pairs 20 m apart in sight). Now: a
  // two-high container 5 m inside each main door, two pallet racks (3 m, from opposite walls, under the
  // catwalks too), the foreman's office under the bridge, crates to vault.
  container2(HALL.block.cx, HALL.block.cz, 'x', 2, m.rust);
  for (const r of HALL.racks) rack2(r.x0, r.z0, r.x1, r.z1, HALL.rackH);
  vault2(4.5, 15, 5.9, 16.4, 1.0, m.crate, 'wood');
  vault2(-5.4, 14.5, -4, 15.9, 1.0, m.crate, 'wood');
  office();
  // 49.0: the stair towers (TOWER) at the quay corners, in place of the catwalk door's exterior stair
  // and the gantry's long end stairs: up from the quay to a landing at catwalk height (a door into the
  // warehouse, a drop south), on up to the gantry.
  {
    const T = TOWER, F = T.flight;
    solid2(T.x0, 0, T.z0, T.x1, DECK, T.z1, m.concrete, 'concrete', 1.5);
    stair2(F.x0, T.z1, F.x1, F.z1, 'z', -1, 0, DECK, m.darkMetal, ['lo', 'hi']);
    stair2(QG.x0, T.z0, QG.x1, T.z0 + 4, 'z', -1, DECK, QG.y, m.darkMetal, ['lo', 'hi']);
    // Rails: the north edge to the flight up, the east edge past it, the south edge east of the drop,
    // the west edge past the warehouse's corner.
    rail2(T.x0, T.z0, QG.x0, T.z0 + 0.08, DECK);
    rail2(T.x1 - 0.08, T.z0 + 4, T.x1, T.z1, DECK);
    rail2(18.5, T.z1 - 0.08, T.x1, T.z1, DECK);
    rail2(T.x0, WH.z1, T.x0 + 0.08, T.z1, DECK);
  }
  // Forecourt (centre): a truck with a container on its trailer, a forklift, pallets, a barrier.
  // 70.0: the kit's tractor and trailer (the container on it dressed as a 40 ft), its forklift.
  for (const s of [1, -1]) {
    const zs = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const [t0, t1] = zs(36, 51), [f0, f1] = zs(48, 51);
    dress?.replace('semi', [-9.4, 0, t0], [-6.6, 3.2, t1], { rotY: s > 0 ? 0 : Math.PI, over: { paint: m.blue } });
    dress?.replace('forklift', [8, 0, f0], [10, 2.2, f1], { rotY: s > 0 ? 0 : Math.PI, over: { paint: m.paint }, margin: 0.1 });
  }
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
  container2(35, 24, 'z', 1, m.green);
  // 49.0: the quay's walls (QUAY_WALLS): two-high rows across it, the first from the stair tower east
  // (open by the water), the second from the water west (open past the crane stair); a two-high stack
  // under the crane; a block under the gantry's middle (its underside ran 44 m along the wall).
  for (const w of QUAY_WALLS) for (let i = 0; i < w.n; i++) container2(w.x0 + CONT.L * (i + 0.5), w.z, 'x', 2, [m.rust, m.green, stacks.yellow, m.rust][i % 4]);
  container(29 + CONT.L / 2, 0, 'x', 2, m.green);
  solid(TOWER.x0, 0, -2, QG.x1, 3, 2, m.darkMetal, 'metal', 1.5);
  // 73.0: the kit's cable spools (their flanges the collider's 0.9 m).
  for (const s of [1, -1]) dress?.replace('spool', [28 - 0.9, 0, 26 * s - 0.9], [28 + 0.9, 1.6, 26 * s + 0.9], { margin: 0.05 });
  for (const s of [1, -1]) cyl(28, 26 * s, 0.9, 0, 1.6, m.rust, 'wood');
  vault2(38, 8, 40, 10, 1.0, m.crate, 'wood');
  // The gantry crane straddling the quay at mid-field: four legs, sill beams, girders over the water,
  // a cab, and a container hanging from the spreader. All of it collides (none of it can be reached).
  const CY = 22;
  // 73.0: the crane in the port kit's parts (its legs stacked, the bogies at their feet, box girders
  // with their walkways, the trolley), over its boxes (the colliders as they were).
  if (dress?.size('crane_leg')) {
    for (const x of [23, 42]) for (const z of [-6, 6]) {
      dress.tile('crane_leg', [x - 0.6, 0.9, z - 0.6], [x + 0.6, CY - 2, z + 0.6], 'y', 2, port);
      dress.place('bogie', new THREE.Matrix4().makeTranslation(x, 0, z), port);
    }
    for (const x of [23, 42]) dress.tile('crane_girder', [x - 0.6, CY - 2, -6.6], [x + 0.6, CY, 6.6], 'z', 4, port);
    for (const z of [-6, 6]) dress.tile('crane_girder', [18, CY, z - 0.6], [74, CY + 2, z + 0.6], 'x', 4, port);
    dress.replace('trolley', [30, CY - 3.4, -1.6], [33.4, CY, 1.6], { over: port, margin: 0.05 });
  }
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

  // (15.0-48.0: the container gantry, a 70 m walk at container-top height down the maze's x = -45
  // corridor, seen end to end. 49.0: gone; the maze is fought through.)

  // ---------------------------------------------------------------- 15.0: the quay gantry and the crane nest
  // A 6.5 m walk along the warehouse's east side (4 m out from its 7 m wall): from it you see the
  // east doors below (15.0–31.0 also over the wall into the roofless floor). At mid-field it
  // widens east into the crane nest between the crane's legs, a low wall on its warehouse side.
  // Stairs at both ends, and from the quay straight up to the nest (z ±22 → ±9: the first cut had
  // only the end stairs, and bots on the waterfront lane, already at mid-field, never turned back to
  // climb: 0.2% of their time up there).
  solid(QG.x0, QG.y - 0.25, -QG.z, QG.x1, QG.y, QG.z, m.deck, 'metal', 1);
  solid(QG.x1, QG.y - 0.25, -QG.nest.z, QG.nest.x1, QG.y, QG.nest.z, m.deck, 'metal', 1);
  // (49.0: the gantry's end stairs are the stair towers' second flights.)
  // Clear of the crane's west legs (x 22.4). 49.0: in two flights: down to a mid landing over the
  // quay (a perch), then east down to it (was one 13 m run).
  const NEST_X1 = 22.3;
  const CS = CRANE_STAIR;
  stair2(QG.x1 + 0.05, 9, NEST_X1, CS.z0, 'z', -1, CS.mid, QG.y, m.darkMetal, ['hi']);
  solid2(QG.x1 + 0.05, 0, CS.z0, CS.x1, CS.mid, CS.z1, m.concrete, 'concrete', 1.5);
  stair2(CS.x1, CS.z0, CS.foot, CS.z1, 'x', -1, 0, CS.mid, m.darkMetal, ['lo', 'hi']);
  rail2(NEST_X1, CS.z0, CS.x1, CS.z0 + 0.08, CS.mid);
  rail2(QG.x1 + 0.05, CS.z0, QG.x1 + 0.13, CS.z1, CS.mid);
  rail2(QG.x1 + 0.05, CS.z1 - 0.08, CS.x1, CS.z1, CS.mid);
  // Rails: the west rail is a 1.1 m armoured half-wall (cover facing the warehouse); the east rail
  // is broken by the nest and the drop gaps.
  solid(QG.x0, QG.y, -QG.z, QG.x0 + 0.25, QG.y + 1.1, QG.z, m.paint, 'metal', 1);
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    let [a, c] = zr(9, QG.z);
    solid(QG.x1 - 0.08, QG.y, a, QG.x1, QG.y + 1.05, c, railMat, 'metal', 1);
    // The nest's stair: a landing joining the nest and the walk (z 4–9), the flight down to the quay.
    [a, c] = zr(QG.nest.z, 9);
    solid(QG.x1, QG.y - 0.25, a, NEST_X1, QG.y, c, m.deck, 'metal', 1);
    solid(NEST_X1 - 0.08, QG.y, a, NEST_X1, QG.y + 1.05, c, railMat, 'metal', 1);
    // Posts under the walk.
    for (const z of [6, 14]) solid(QG.x0 + 0.9, 0, s * z - 0.15, QG.x0 + 1.2, QG.y - 0.25, s * z + 0.15, m.darkMetal, 'metal', 1);
  }
  // 49.0: the crane cab (CAB) over the nest: a door at each end, both by the west wall, a column
  // between them (no line down the gantry through it).
  {
    const C = CAB, y0 = QG.y, t = 0.2, dx0 = C.x0 + 0.25, dx1 = C.x0 + 1.65;
    for (const s of [1, -1]) {
      const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
      const [w0, w1] = zr(C.z - t, C.z);
      solid(C.x0, y0, w0, dx0, C.top, w1, m.wall, 'metal', 3);
      solid(dx1, y0, w0, C.x1, C.top, w1, m.wall, 'metal', 3);
      solid(dx0, y0 + 2.3, w0, dx1, C.top, w1, m.wall, 'metal', 3);
    }
    solid(C.x0, y0, -C.z + t, C.x0 + t, C.top, C.z - t, m.wall, 'metal', 3);
    // The east wall, closed (a window on the quay was one more perch over it, and a way out).
    solid(C.x1 - t, y0, -C.z + t, C.x1, C.top, C.z - t, m.wall, 'metal', 3);
    solid(C.x0 + t, y0, -0.6, 19.9, C.top, 0.6, m.darkMetal, 'metal', 1);
    solid(C.x0, C.top, -C.z, C.x1, C.top + 0.2, C.z, m.roof, 'metal', 2);
    // The crane's controls against the east wall (vault), a lamp over them.
    solid(C.x1 - 0.6, y0, -1, C.x1 - t, y0 + 0.75, 1, m.darkMetal, 'metal', 1).vault = true;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.4), m.warm);
    lamp.position.set(C.x1 - 1.2, C.top - 0.1, 0);
    scene.add(lamp);
  }

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
  // 32.0: the lamps' light keeps its strength (8.1's illuminance) but loses most of its orange.
  const SODIUM = 0xe8b88a;
  // Quay: amber sodium floods; maze: cold white LED floods against the west wall.
  // 8.1, "too dark for competitive play": warm light over every lane, measured as illuminance at
  // chest height on the floor nav nodes of each zone (I / d², the shader's own falloff) — mean and
  // the darkest 10%. The sky, the water and the distance stay dark: lights only where people fight.
  // (Intensities in candela with physical decay: a head 11–13 m up needs ~600 to light the ground.)
  for (const z of [18, 46]) for (const s of [1, -1]) lamps.push(mast(44, z * s, 13, m.amber, SODIUM, 650, 48));
  // West wall floods: warm white now (8.0: cold LED), stronger.
  for (const z of [24, 48]) for (const s of [1, -1]) lamps.push(mast(WEST_X + 0.2, z * s, 11, m.warm, 0xe6d6c0, 520, 44));
  // Quay, warehouse side: two more sodium masts (the quay's middle was lit only from the water's edge).
  // (49.0: off the quay's first wall, z 34 → 38.5.)
  for (const s of [1, -1]) mast(21.5, 38.5 * s, 12, m.amber, SODIUM, 560, 44);
  // Forecourts: one mast each (8.0: unlit, the darkest 10% at zero).
  for (const s of [1, -1]) mast(-3, 46 * s, 12, m.warm, 0xe8cba8, 600, 44);
  // Work lights strung over the maze's crossings, warm (the stacks' colours are the callouts).
  const work = (x: number, z: number) => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), m.warm);
    head.position.set(x, 7, z);
    scene.add(head);
    b.add(new THREE.BoxGeometry(0.03, 3, 0.03), m.darkMetal, x, 8.5, z);
    const light = new THREE.PointLight(0xe6cfae, 200, 26, 2);
    light.position.set(x, 6.8, z);
    scene.add(light);
    const g = glows.add({ pos: v(x, 6.8, z), color: new THREE.Color(0.95, 0.84, 0.68), radius: 10, base: 1, light, lightBase: 200, haloSize: 2.6, haloStrength: 0.35, mode: 'steady', reflect: { width: 1.4, anchor: v(x, 0, z), length: 6, map: null } });
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
    const light = new THREE.PointLight(0xe6c49a, 320, 30, 2);
    light.position.set(35, 8.5, 0);
    scene.add(light);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.6), m.warm);
    head.position.set(35, 8.9, 0);
    scene.add(head);
    const g = glows.add({ pos: v(35, 8.5, 0), color: new THREE.Color(0.95, 0.8, 0.62), radius: 12, base: 1, light, lightBase: 320, haloSize: 3, haloStrength: 0.35, reflect: { width: 2, anchor: v(35, 0, 0), length: 8, map: null } });
    g.materials.push({ mat: m.warm, base: m.warm.color.clone() });
  }
  // Warehouse: sodium lamps hung from the roof trusses (two real lights, the rest glow only).
  const hang = (x: number, z: number, real: boolean) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.35, 12), m.amber);
    lamp.position.set(x, WH.h - 0.6, z);
    scene.add(lamp);
    let light: THREE.PointLight | undefined;
    if (real) {
      light = new THREE.PointLight(0xe2b88c, 150, 28, 2);
      light.position.set(x, WH.h - 1, z);
      scene.add(light);
    }
    const g = glows.add({ pos: v(x, WH.h - 0.9, z), color: new THREE.Color(0.95, 0.75, 0.55), radius: 9, base: 1, light, lightBase: real ? 150 : 0, haloSize: 2.4, haloStrength: 0.3, mode: real ? 'steady' : 'flicker' });
    g.materials.push({ mat: m.amber, base: m.amber.color.clone() });
  };
  // Four real lamps on the floor fight (8.0: two), the rest glow only.
  // 15.0: hung from the open trusses (z = 0, ±8, ±16…).
  for (const z of [-16, 16]) hang(0, z, true);
  hang(-6, 8, true);
  hang(6, -8, true);
  hang(6, 8, false);
  hang(-6, -8, false);
  // Neon tubes on the warehouse corners and along the end walls (no lights: halos and the rain).
  // 86.0: the neon's light on the wet apron (Spill.ts: baked, no lights) and its glows for the puddles.
  const spillFrom: SpillSource[] = [];
  const neon: Glow[] = [];
  const tube = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.MeshBasicMaterial, color: THREE.Color, mode: Glow['mode'] = 'buzz') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.08, x1 - x0), Math.max(0.08, y1 - y0), Math.max(0.08, z1 - z0)), mat);
    // (86.0: a dying tube its own material: its flicker its own.)
    if (mode !== 'buzz') mesh.material = mat = mat.clone();
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    const g = glows.add({ pos: mesh.position.clone(), color, radius: 6, base: 0.8, mode, haloSize: 1.6, haloStrength: 0.25 });
    if (mode !== 'buzz') g.materials.push({ mat, base: mat.color.clone() });
    neon.push(g);
  };
  for (const s of [1, -1]) {
    const tc = s > 0 ? new THREE.Color(0.6, 0.42, 1) : new THREE.Color(0.3, 0.5, 1);
    tube(-12, WH.h - 0.4, s * (WH.z1 + 0.06), 12, WH.h - 0.32, s * (WH.z1 + 0.14), s > 0 ? m.magenta : m.cyan, tc);
    for (const x of [-9, -3, 3, 9]) spillFrom.push({ kind: 'pool', x, z: s * (WH.z1 + 0.8), h: WH.h - 0.4, radius: 6, colour: tc, power: 0.12 });
    for (const x of [WH.x0 - 0.1, WH.x1 + 0.1]) {
      // (86.0: one corner's tube dying, on OMEGA's end.)
      tube(x - 0.04, 0.4, s * (WH.z1 + 0.1) - 0.04, x + 0.04, WH.h - 0.4, s * (WH.z1 + 0.1) + 0.04, s > 0 ? m.magenta : m.cyan, tc, s < 0 && x > 0 ? 'dying' : 'buzz');
      spillFrom.push({ kind: 'pool', x: x + Math.sign(x) * 0.5, z: s * (WH.z1 + 0.6), h: 2.4, radius: 4.5, colour: tc, power: s < 0 && x > 0 ? 0.08 : 0.2 });
    }
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
    // 32.0: muted (soft violet, deep blue, old brass, sea green) and dimmer (neon 3.2 → 1.8).
    { text: 'NEON DOCKS', color: '#a27bd6', brightness: 1.8, style: 'neon', vertical: false, mount: 'wall', face: 's', wall: WH.z1, x: -7.5, y: 5.6, z: WH.z1 + 0.12, size: 7, floorY: 0, light: 40, lightDist: 18 },
    { text: 'ДОК-7', color: '#5a8de0', brightness: 1.8, style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: WH.z0, x: 7.5, y: 5.6, z: WH.z0 - 0.12, size: 6, floorY: 0, light: 40, lightDist: 18 },
    { text: 'ПОРТ', color: '#c9a06a', brightness: 1.7, style: 'neon', vertical: true, mount: 'wall', face: 'w', wall: WH.x0, x: WH.x0 - 0.12, y: 4.4, z: 19, size: 3.4, floorY: 0, mode: 'flicker' },
    { text: 'СКЛАД', color: '#c9a06a', brightness: 1.7, style: 'neon', vertical: true, mount: 'wall', face: 'w', wall: WH.x0, x: WH.x0 - 0.12, y: 4.4, z: -19, size: 3.4, floorY: 0, mode: 'flicker' },
    { text: 'CARGO', color: '#6fb59a', style: 'box', vertical: false, mount: 'wall', face: 'e', wall: WH.x1, x: WH.x1 + 0.12, y: 4.6, z: 0, size: 4, floorY: 0 },
    { text: 'ALPHA', color: '#3aa0ff', style: 'box', vertical: false, mount: 'wall', face: 'n', wall: BASE.z0, x: 0, y: 2.6, z: BASE.z0 - 0.12, size: 3.2, floorY: 0 },
    { text: 'OMEGA', color: '#ff3040', style: 'box', vertical: false, mount: 'wall', face: 's', wall: -BASE.z0, x: 0, y: 2.6, z: -BASE.z0 + 0.12, size: 3.2, floorY: 0 },
  ];
  for (const spec of signs) {
    const g = addSign(ctx, spec);
    neon.push(g);
    // Its light on the apron under it (a dim, coloured pool: Tokyo's 84.0 for the docks).
    spillFrom.push({ kind: 'pool', x: g.pos.x, z: g.pos.z, h: Math.max(2.5, g.pos.y), radius: 4 + spec.size, colour: g.color.clone(), power: spec.style === 'box' ? 0.12 : 0.22 });
  }
  // 86.0: manholes and drain grates on the apron (the street kit's: flush, no colliders), steam out of
  // a few lids; only where nothing stands (a lid under a container is no lid).
  const street = new StreetKit(ctx, []);
  const steamEmitters: THREE.Vector4[] = [];
  const clear = (x: number, z: number) => !col.blocked(v(x, 0.05, z), 0.5, 1.5);
  for (const s of [1, -1]) {
    for (const [x, z, steam] of DRAINS.manholes) {
      if (!clear(x, z * s)) continue;
      street.manhole(x, z * s);
      if (steam) steamEmitters.push(new THREE.Vector4(x, 0.1, z * s, 0.4));
    }
    for (const z of DRAINS.grates) for (const x of [WH.x1 + 0.6, WH.x0 - 0.6]) if (clear(x, z * s)) street.grate(x, z * s);
  }
  (globalThis as unknown as { __docksStreet?: unknown }).__docksStreet = street.stats;
  const spill = new Spill(bakeSpill(spillFrom, GX0, -GZ, GX1, GZ, 4));
  // (Docks' paving brighter than Tokyo's asphalt: a softer gain.)
  spill.gain.value.set(12, 5);
  for (const mat of [ground, whFloor]) spill.apply(mat);
  const signPool: SignCatch[] = neon.map((g) => ({ pos: g.pos.clone(), colour: g.color, glow: g, intensity: 10 }));
  dress?.finish(scene);
  if (dress) (globalThis as unknown as { __dress?: unknown }).__dress = dress.stats;
  b.build(scene);
  dress?.afterBuild(scene);
  dress?.dispose();

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
    // 15.0: round the blast wall's outer end.
    N2(x + Math.sign(x) * 4.4, 0, 57.4);
    N2(x + Math.sign(x) * 4.4, 0, 53.6);
  }
  const drops: [number, number][] = [];
  // 15.0: the quay gantry (its deck, the crane cab). 49.0: the stair towers (the flight from the quay,
  // the landing, the warehouse door, the flight on up, the drop) and the crane stair's two flights.
  for (let z = -18; z <= 18.01; z += 4) if (Math.abs(z) > 4) N(19.2, QG.y, z);
  for (const s of [1, -1]) {
    const T = TOWER;
    const top = N(19.2, QG.y, (QG.z - 0.8) * s);
    chain(N(15.5, 0, (T.flight.z1 + 0.7) * s), N(15.5, DECK / 2, (T.z1 + 4) * s), N(15.5, DECK, (T.z1 - 0.7) * s), N(16, DECK, T.door * s), N(19.2, DECK, (T.z0 + 5.4) * s), N(19.2, (DECK + QG.y) / 2, (T.z0 + 2) * s), top);
    chain(N(16, DECK, T.door * s), N(12.6, DECK, T.door * s));
    chain(N(19.2, QG.y, 18 * s), top);
    drops.push([N(17.7, DECK, (T.z1 - 0.8) * s), N(17.7, 0, (T.z1 + 1) * s)]);
    // (The drop lands between the landing and the quay's first wall, open east.)
    chain(N(17.7, 0, (T.z1 + 1) * s), N(21.5, 0, (T.z1 + 1) * s), N(26, 0, (T.z1 + 1) * s));
    chain(N(16, DECK, T.door * s), N(17.7, DECK, (T.z1 - 0.8) * s));
    // The cab: in by the door by its west wall, round the column, out the other end.
    chain(N(19.2, QG.y, 6 * s), N(18.95, QG.y, 5 * s), N(18.95, QG.y, 3 * s), N(20.75, QG.y, 2.5 * s), N(20.75, QG.y, 0));
    const CS = CRANE_STAIR;
    chain(N(21.4, QG.y, 8.4 * s), N(21.4, (QG.y + CS.mid) / 2, 12.2 * s), N(21.4, CS.mid, 16.75 * s), N(23, CS.mid, 16.75 * s), N(28.75, CS.mid / 2, 16.75 * s), N(32.7, 0, 16.75 * s));
    N(21.4, QG.y, 6 * s);
  }
  for (const z of [-2.5, 2.5]) N(20.75, QG.y, z);
  // The maze's corridor crossings (49.0: both bonds' corridors).
  for (const x of [-55.5, -53, -50, -45.9, -45, -41, -40.1, -37, -36.1, -33.9, -33, -29.9, -29, -25, -20.7]) for (const z of [0, 8, 16, 24, 32]) if (open(x, 0, z)) N2(x, 0, z);
  // Catwalks, bridge, landings (deck level).
  for (const x of [-12.1, 12.1]) for (const z of [0, 5, 10, 16, 22]) N2(x, DECK, z);
  for (const x of [-6, 0, 6]) N(x, DECK, 0);
  for (const x of [-11, 11]) N2(x, DECK, 24.8);
  // Interior stairs: foot by the end wall, middle, top on the mid landing, onto the catwalk.
  for (const x of [-9.4, 9.4]) for (const s of [1, -1]) chain(N(x, 0, 24.7 * s), N(x, DECK / 2, 18.8 * s), N(x, DECK, 12.4 * s), N(Math.sign(x) * 12.1, DECK, 12.4 * s));
  // 49.0: the warehouse floor round the block, the racks and the office (and into it).
  for (const s of [1, -1]) for (const [x, z] of [[-6, 21], [6, 21], [-6, 12], [6, 12], [-12, 12], [12, 12], [0, 6.5], [-8, 6.5], [8, 7], [-12, 2.5], [-8, 2.5], [8, 2.5], [12, 6]]) if (open(x, 0, z * s)) N(x, 0, z * s);
  for (const x of [-3, 3]) chain(N(x, 0, 2.5), N(x, 0, 0), N(x, 0, -2.5));
  chain(N(-3, 0, 0), N(0, 0, 0), N(3, 0, 0));
  // Container stairs and tops; the loading platform.
  for (const s of [1, -1]) {
    chain(N(-30.6, 0, 21.6 * s), N(-30.6, CONT.H / 2, 19 * s), N(-30.6, CONT.H, 17.7 * s), N(-33, CONT.H, 20 * s));
    chain(N(-45, 0, 35.2 * s), N(-45, CONT.H / 2, 32.8 * s), N(-45, CONT.H, 29.5 * s), N(-45, CONT.H, 26.5 * s));
    chain(N(33.5, 0, 52.3 * s), N(33.5, 0.6, 49.8 * s), N(33.5, 1.2, 46.8 * s));
    for (const [x, z] of [[30, 42], [38, 42], [34, 44]]) N(x, 1.2, z * s);
  }
  // 28.0: the depot's stair and perch (and a drop off it into the west alley); the barges, gangways
  // and pontoons (their decks are below the quay: nodes at deck height).
  for (const s of [1, -1]) {
    chain(N(-64, 0, 28.6 * s), N(-64, DEPOT.stack.top / 2, 24.3 * s), N(-64, DEPOT.stack.top, 20.2 * s));
    N(-64, DEPOT.stack.top, 17.8 * s);
    drops.push([N(-64, DEPOT.stack.top, 17.8 * s), N(-66.6, 0, 17.8 * s)]);
  }
  // (49.0: round the cargo: only where a body stands.)
  for (const h of BARGES.hulls) for (let z = h.z0 + 2; z <= h.z1 - 2 + 0.01; z += 2) for (const x of [50.3, 51.9, 54.7]) if (open(x, BARGES.deck + 1, z)) N2(x, BARGES.deck, z);
  for (const g of BARGES.gangways) for (const x of [45.2, 47.6, 50.4]) N2(x, x < 46 ? 0 : x < 49 ? -0.05 : BARGES.deck, (g.z0 + g.z1) / 2);
  for (const p of BARGES.pontoons) for (let z = p.z0; z <= p.z1 + 0.01; z += 3) N2(51.5, BARGES.pontoon, z);
  for (let z = BARGES.middle.z0; z <= BARGES.middle.z1 + 0.01; z += 4) N(51.5, BARGES.pontoon, z);
  // Lane waypoints are nodes too.
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Floor lattice: 4 m in the maze, 6 m elsewhere; only where a body fits.
  const inside = (x: number, z: number) => (x > WEST_X + 0.6 && x < QUAY_X - 0.6 && Math.abs(z) < END_Z - 0.6) || (Math.abs(x) < BASE.x1 - 1 && Math.abs(z) < BASE.z1 - 1);
  const lattice = (xs: number[], step: number) => {
    for (const x of xs) for (let z = -BASE.z1 + 2; z <= BASE.z1 - 2; z += step) if (inside(x, z) && open(x, 0, z)) N(x, 0, z);
  };
  lattice([-66.6, -61, -55.4, -53, -49, -45, -41, -37, -33, -29, -25, -21, -17], 4);
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
    // 49.0: the stair tower's landing, the crane stair's mid landing, the cab, the office, the barges' far side.
    v(17, DECK, -25),
    v(23, CRANE_STAIR.mid, 16.75),
    v(21, QG.y, -1.5),
    v(0, 0, 0),
    v(54.7, BARGES.deck, -23),
    v(-45, CONT.H, -28),
    v(19.2, QG.y, 14),
    v(20.75, QG.y, 0),
    v(-12.1, DECK, -10),
    v(0, DECK, 0),
    v(12.1, DECK, 16),
    v(-33, CONT.H, 20),
    v(34, 1.2, -44),
    v(-45, 0, -8),
    v(-37, 0, 24),
    v(32, 0, 4),
    v(0, 0, -12),
    v(-12, 0, 24.8),
    v(0, 0, 40),
    v(31, 0, -28),
    v(-37, 0, -24),
    v(0, 0, -40),
  ];

  const rain: RainAreas = {
    open: [
      [GX0, -GZ, GX1, WH.z0],
      [GX0, WH.z1, GX1, GZ],
      [GX0, WH.z0, WH.x0, WH.z1],
      [WH.x1, WH.z0, GX1, WH.z1],
      // 28.0: the harbour over the barges.
      [GX1, -GZ, 60, GZ],
    ],
    surfaces: [
      { x0: 28, z0: 40, x1: 40, z1: 48, y: 1.2 },
      { x0: 28, z0: -48, x1: 40, z1: -40, y: 1.2 },
      // 49.0: the stair towers' landings, the crane stair's, the cab's roof.
      { x0: TOWER.x0, z0: TOWER.z0, x1: TOWER.x1, z1: TOWER.z1, y: DECK },
      { x0: TOWER.x0, z0: -TOWER.z1, x1: TOWER.x1, z1: -TOWER.z0, y: DECK },
      { x0: QG.x1, z0: CRANE_STAIR.z0, x1: CRANE_STAIR.x1, z1: CRANE_STAIR.z1, y: CRANE_STAIR.mid },
      { x0: QG.x1, z0: -CRANE_STAIR.z1, x1: CRANE_STAIR.x1, z1: -CRANE_STAIR.z0, y: CRANE_STAIR.mid },
      { x0: QG.x0, z0: -QG.z, x1: QG.x1, z1: QG.z, y: QG.y },
      { x0: QG.x1, z0: 4, x1: QG.nest.x1, z1: 9, y: QG.y },
      { x0: QG.x1, z0: -9, x1: QG.nest.x1, z1: -4, y: QG.y },
      { x0: CAB.x0, z0: -CAB.z, x1: CAB.x1, z1: CAB.z, y: CAB.top + 0.2 },
      // 28.0: the barges, the pontoons, the sniper stack.
      ...BARGES.hulls.flatMap((h) => [{ x0: h.x0, z0: h.z0, x1: h.x1, z1: h.z1, y: BARGES.deck }, { x0: h.x0, z0: -h.z1, x1: h.x1, z1: -h.z0, y: BARGES.deck }]),
      ...BARGES.pontoons.flatMap((p) => [{ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, y: BARGES.pontoon }, { x0: p.x0, z0: -p.z1, x1: p.x1, z1: -p.z0, y: BARGES.pontoon }]),
      { ...BARGES.middle, y: BARGES.pontoon },
      { x0: DEPOT.stack.x0, z0: DEPOT.stack.z0, x1: DEPOT.stack.x1, z1: DEPOT.stack.z1, y: DEPOT.stack.top },
      { x0: DEPOT.stack.x0, z0: -DEPOT.stack.z1, x1: DEPOT.stack.x1, z1: -DEPOT.stack.z0, y: DEPOT.stack.top },
      // 32.0: the warehouse roof (the rain lands on it).
      { x0: WH.x0, z0: WH.z0, x1: WH.x1, z1: WH.z1, y: WH.roof },
    ],
    shelters: [
      // 32.0: no rain (drops, rings, crowns) under the warehouse roof.
      { x0: WH.x0, z0: WH.z0, x1: WH.x1, z1: WH.z1, y: WH.roof },
      { x0: QG.x0, z0: -QG.z, x1: QG.x1, z1: QG.z, y: QG.y - 0.25 },
      { x0: CAB.x0, z0: -CAB.z, x1: CAB.x1, z1: CAB.z, y: CAB.top },
    ],
  };

  return {
    nav: { nodes, links, drops, slope: 0 },
    spawns,
    coverPoints,
    testGoals,
    zoneAt,
    rain,
    catcherPicks: [
      ...lamps.slice(0, 4).map((g) => [g.pos.x, g.pos.y, g.pos.z] as [number, number, number]),
    ],
    spill,
    signPool,
    steamEmitters,
    // 15.0: roofless: no longer indoors (no muffled rain, no shaded viewmodel). 32.0: roofed: indoors again.
    indoor: { x0: WH.x0, z0: WH.z0, x1: WH.x1, z1: WH.z1, y0: 0, h: WH.h },
    laneProblems,
  };
}
