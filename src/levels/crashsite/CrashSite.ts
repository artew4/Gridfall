import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import { mulberry32 } from '../../core/math';
import { fitStairWidth } from '../../world/StairFit';
import * as T from '../jungle/textures';
import { Dresser, militaryMats } from '../../world/Dress';
import { propKits } from '../../entities/weapons/models';
import { hescoTexture, sandbagTexture } from '../desert/textures';
import type { TreeInfo } from '../jungle/Base';
import type { FoliageSite } from '../jungle/Foliage';
import { noise } from '../jungle/Terrain';
import {
  BASE, BRIDGES, COURT, OUTPOST, RAVINE, RIDGE, STEP, TRENCHES, TUNNEL, X_OUT, Z_END, crashHeight, crashSurface, lanesOf, ravineFloor, spawnsOf, trenchDist, tunnelRects, tunnelRoofs, tunnelWalls, zoneAt,
} from './CrashLayout';
import { CONT, addContainer, overgrownContainerTexture } from '../../world/Containers';
import type { Zone } from '../Level';

/*
  Builds Jungle: Crash Site (plan and the heightfield rules in CrashLayout.ts). The 3.3 rules hold:
  every box is drawn and collided with the same bounds; stairs are visible steps over a ramp; gaps are
  under 0.3 m or over 1 m; low cover ≤ 1.05 m is flagged `vault`; the boundary (rock cliffs, 10 m and
  up) is out of reach from the highest floor (the wreck's roof, 3.9 m).
*/

export interface CrashResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number; faces: boolean };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  coverPoints: THREE.Vector3[];
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  trees: TreeInfo[];
  /** Rects the undergrowth keeps off (paths, the wreck, the yards). */
  keepClear: [number, number, number, number][];
  site: FoliageSite;
  /** The wreck's hull (rooms the mist stays out of). */
  interiors: { name: string; jp: string; x0: number; z0: number; x1: number; z1: number; y0: number; h: number }[];
  terrain: THREE.Mesh;
  laneProblems: string[];
  update(t: number): void;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildCrashSite(scene: THREE.Scene, col: CollisionWorld, glows: Glows): CrashResult {
  const b = new StaticBuilder();
  const rnd = mulberry32(1507);
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.9, metal = 0, env = 0.3) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const hdr = (r: number, g: number, bl: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bl) });
  const m = {
    rock: std(T.rockTexture(), 0xffffff, 0.95, 0, 0.15),
    moss: std(T.stoneTexture(1, '#5d6248'), 0xffffff, 0.95),
    stone: std(T.stoneTexture(0.6, '#7d786a'), 0xffffff, 0.95),
    bark: std(T.barkTexture(), 0xffffff, 0.95, 0, 0.15),
    barkPale: std(T.barkTexture('#6f6a58'), 0xffffff, 0.95, 0, 0.15),
    plank: std(T.plankTexture(), 0xffffff, 0.85),
    sandbag: std(sandbagTexture(), 0x9a9a78, 0.98),
    hesco: std(hescoTexture(), 0x8a8c70, 0.95),
    hull: std(T.steelTexture('#3a4048', 10), 0xffffff, 0.55, 0.55, 0.6),
    hullDark: std(T.steelTexture('#23272d', 6), 0xffffff, 0.6, 0.5, 0.5),
    scorch: std(null, 0x1a1816, 0.9, 0.2, 0.2),
    tarp: std(T.tarpTexture('#4f5634'), 0xffffff, 0.95),
    cyan: hdr(0.4, 2.6, 3.2),
    // 33.0: the outpost and the tunnels.
    concrete: std(T.concreteTexture('#7a7c74', 2), 0xffffff, 0.9, 0, 0.25),
    slab: std(T.concreteTexture('#5f6656', 3), 0xffffff, 0.95, 0, 0.2),
    labWall: std(T.concreteTexture('#8a8c82', 4), 0xffffff, 0.9, 0, 0.25),
    steel: std(T.steelTexture('#4a5258', 8), 0xffffff, 0.6, 0.5, 0.4),
    deck: std(T.steelTexture('#3d4448', 12), 0xffffff, 0.65, 0.45, 0.4),
    lamp: hdr(2.2, 2.7, 3.0),
    red: hdr(4, 0.3, 0.2),
    amber: hdr(4.2, 2.4, 0.6),
  };
  // 69.0: the military kit (Dress.ts): the sandbags and the HESCO. Without the kit, boxes.
  const kit = propKits();
  const dress = kit ? new Dresser(b, kit, militaryMats({ liner: 0xc8cbb0, canvas: 0xc4c4a6 })) : null;
  dress?.rule(m.sandbag, 'sandbag');
  dress?.rule(m.hesco, 'hesco');

  // ---------------------------------------------------------------- helpers
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  const solid2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => [
    solid(x0, y0, z0, x1, y1, z1, mat, surface, tile),
    solid(x0, y0, -z1, x1, y1, -z0, mat, surface, tile),
  ];
  /** Seen only (inside a collider, or out of reach). */
  const deco = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2) =>
    b.add(worldBox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const cyl = (x: number, z: number, r: number, y0: number, hh: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', seg = 14) => {
    b.add(new THREE.CylinderGeometry(r, r, hh, seg), mat, x, y0 + hh / 2, z);
    return col.addCylinder(x, z, r, y0, y0 + hh, surface);
  };
  /** Something standing on the floor: from under its lowest corner to `h` above its highest. */
  const ground2 = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', vault = true) => {
    for (const s of [1, -1]) {
      const za = s > 0 ? z0 : -z1, zb = s > 0 ? z1 : -z0;
      const ys = [crashHeight(x0, za), crashHeight(x1, za), crashHeight(x0, zb), crashHeight(x1, zb), crashHeight((x0 + x1) / 2, (za + zb) / 2)];
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const c = solid(x0, lo - 0.3, za, x1, hi + h, zb, mat, surface, 1);
      c.vault = vault && hi + h - lo <= 1.05;
    }
  };
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[crashsite stair] runs into a wall', [sx0, sz0, sx1, sz1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = top - base;
    const steps = Math.max(2, Math.round(H / 0.25));
    const run = L / steps;
    // 19.0: the side plates stand just outside the run (the steps fill it): no step drawn into a plate,
    // no sliver between them a body reads as open.
    const w0 = along ? z0 : x0;
    const w1 = along ? z1 : x1;
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
      // 19.0: standable (Crash Site's stairs stand free, unplated: a sprint-jump onto a stair's side
      // landed in non-floor fill and was pushed through it; on a floor it stands on the step). The
      // ramp above is always the higher floor where both are.
      c.floor = true;
    }
    for (const side of rails) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n;
        if (H * k1 < 0.5) continue;
        const hi = base + H * k1 + 1.0;
        const lo0 = rise > 0 ? (along ? x0 : z0) + L * k0 : (along ? x1 : z1) - L * k1;
        const lo1 = lo0 + L * (k1 - k0);
        // 19.0: thin plates (8 cm, as Old Port's and Maglev's): a 0.3 m one stood in the steps (the world check).
        const t = 0.08;
        if (along) {
          const f = side === 'lo' ? z0 - t : z1;
          solid(lo0, base, f, lo1, hi, f + t, m.rock, 'concrete', 1);
        } else {
          const f = side === 'lo' ? x0 - t : x1;
          solid(f, base, lo0, f + t, hi, lo1, m.rock, 'concrete', 1);
        }
      }
    }
  };
  const stair2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    stair(x0, z0, x1, z1, axis, rise, base, top, mat, rails);
    stair(x0, -z1, x1, -z0, axis, axis === 'z' ? (-rise as 1 | -1) : rise, base, top, mat, rails);
  };
  const keepClear: [number, number, number, number][] = [];
  const clear = (x0: number, z0: number, x1: number, z1: number) => {
    keepClear.push([x0, z0, x1, z1], [x0, -z1, x1, -z0]);
  };
  /** Tree and boulder footprints (x, z, r) so nothing is placed in another. */
  const taken: [number, number, number][] = [];

  // ---------------------------------------------------------------- the ground
  const terrain = (() => {
    const W = 2 * X_OUT + 24, D = 2 * Z_END + 24;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / 0.9), Math.round(D / 0.9));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = crashHeight(x, z);
      pos.setY(i, h);
      uv.setXY(i, x / 5, z / 5);
      // Darker, wetter mud down in the trenches and the ravine; mossier on the rises.
      const moss = noise(x * 0.09 + 50, z * 0.09);
      const wet = THREE.MathUtils.clamp(-h * 0.35, 0, 0.45);
      const k = THREE.MathUtils.clamp(0.82 + h * 0.08 - wet, 0.4, 1.05);
      colors[i * 3] = k * (0.95 - moss * 0.2);
      colors[i * 3 + 1] = k * (0.93 + moss * 0.12);
      colors[i * 3 + 2] = k * (0.86 - moss * 0.15);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: T.litterTexture(), vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
  })();

  // ---------------------------------------------------------------- boundary: rock cliffs
  // Straight inner faces (the bounds), tiers stepping back above (12–20 m): nothing reaches them.
  const cliff = (x0: number, z0: number, x1: number, z1: number) => {
    solid(x0, -6, z0, x1, 11 + rnd() * 2, z1, m.rock, 'concrete', 6);
  };
  for (let a = -Z_END - 10; a < Z_END + 10; a += 12) {
    cliff(-X_OUT - 10, a, -X_OUT, a + 12);
    cliff(X_OUT, a, X_OUT + 10, a + 12);
  }
  for (let a = -X_OUT - 10; a < X_OUT + 10; a += 12) {
    cliff(a, Z_END, a + 12, Z_END + 10);
    cliff(a, -Z_END - 10, a + 12, -Z_END);
  }

  // ---------------------------------------------------------------- the ridge (west lane)
  // One rock plateau (3.6 m) on flat ground against the west cliff; stone steps down at both ends; a
  // rock lip along its edge (0.9 m: cover for the long lines across the clearing) with gaps: the steps
  // at z ±22, the fallen tree at mid-field, and drop-downs at z ±10 and ±30.
  const RT = RIDGE.top;
  solid(RIDGE.x0, -0.3, -RIDGE.z, RIDGE.x1, RT, RIDGE.z, m.rock, 'concrete', 4);
  stair2(RIDGE.ramp.x0, RIDGE.z, RIDGE.ramp.x1, RIDGE.ramp.z1, 'z', -1, 0, RT, m.stone);
  // The plateau's ends beside the steps (face down to the approach).
  const LIP = 0.9;
  const lip = (z0: number, z1: number) => solid(RIDGE.x1 - 0.9, RT, z0, RIDGE.x1, RT + LIP, z1, m.moss, 'concrete', 1);
  const lipGaps: [number, number][] = [[-31.2, -28.8], [-23.4, -20.6], [-11.2, -8.8], [-1, 1], [8.8, 11.2], [20.6, 23.4], [28.8, 31.2]];
  {
    let cur = -RIDGE.z;
    for (const [g0, g1] of lipGaps) {
      if (g0 - cur > 0.01) lip(cur, g0);
      cur = g1;
    }
    if (RIDGE.z - cur > 0.01) lip(cur, RIDGE.z);
  }
  // Rock steps up the face at z ±22 (along x, from the clearing to the plateau).
  // 33.0: plated both sides (the pits' routes pass beside them; a body walking along an open side clipped in).
  stair2(RIDGE.x1, 20.6, RIDGE.x1 + 8.6, 23.4, 'x', -1, 0, RT, m.stone, ['lo', 'hi']);
  // The fallen tree at mid-field: a trunk leaning from the clearing onto the plateau (a ramp). 19.0:
  // steeper and shorter (6.5 m), its foot clear of the shrine.
  {
    const x0 = RIDGE.x1, x1 = RIDGE.x1 + 6.5;
    col.addRamp(x0, -0.8, x1, 0.8, 'x', RT, 0);
    const len = Math.hypot(x1 - x0, RT), ang = Math.atan2(RT, x1 - x0);
    const g = new THREE.CylinderGeometry(0.75, 0.9, len + 1.2, 12);
    g.rotateZ(Math.PI / 2);
    b.add(g, m.bark, (x0 + x1) / 2, RT / 2 - 0.55, 0, 0, 0, -ang);
    g.dispose();
  }
  // Boulders on the plateau (cover along its length).
  for (const [x, z, w, d] of [[-41, 24, 2.2, 1.6], [-36, 12, 1.8, 2], [-43, 4, 2, 1.8], [-37, 30, 1.6, 1.6]] as const) {
    solid2(x - w / 2, RT, z - d / 2, x + w / 2, RT + 1.3, z + d / 2, rnd() < 0.5 ? m.moss : m.rock, 'concrete', 1.5);
    taken.push([x, z, Math.max(w, d)], [x, -z, Math.max(w, d)]);
  }
  clear(RIDGE.x0, -RIDGE.z, RIDGE.x1 + 1, RIDGE.z);

  // ---------------------------------------------------------------- the ravine (east lane)
  // Rock rims along both edges, end to end (they cover the carved drop: see CrashLayout), their tops
  // 0.35 m (walked on and stepped off); fallen giant trees across at z 0 and ±18.
  const rimZ = RAVINE.end;
  // The rims' cut under each trunk is exactly its deck's width (no slot beside it).
  const bridgeGap = 0.8;
  for (const [rx0, rx1] of [[RAVINE.x0 - RAVINE.rim, RAVINE.x0], [RAVINE.x1, RAVINE.x1 + RAVINE.rim]] as const) {
    // In segments, broken where the trees cross (their trunks rest on the banks over the rims).
    // 33.0: and where the tunnels' east runs come out through the west rim (their lintels close it over).
    const E = TUNNEL.runs.find((r) => r.name === 'eastRun')!;
    const mouths: [number, number][] = rx1 === RAVINE.x0 ? [[E.z0, E.z1], [-E.z1, -E.z0]] : [];
    const cuts = [...BRIDGES.map((z) => [z - bridgeGap, z + bridgeGap] as [number, number]), ...mouths].sort((a, c) => a[0] - c[0]);
    let cur = -rimZ;
    const seg = (z0: number, z1: number) => {
      // Down to below the floor under this stretch (the ramps lift it near the ends).
      const lo = Math.min(ravineFloor(z0), ravineFloor(z1)) - 0.3;
      // 33.1: along the end ramps, above the corridor test's knee ray (RAVINE.rampRim): a wall, not a ledge.
      const top = Math.max(Math.abs(z0), Math.abs(z1)) > RAVINE.z + 0.01 ? RAVINE.rampRim : RAVINE.rimTop;
      solid(rx0, lo, z0, rx1, top, z1, m.rock, 'concrete', 2);
    };
    // (33.1: a segment never straddles the ramps' start, so the low rim's stretch ends exactly there.)
    const run = (a: number, b: number) => {
      for (let z = a; z < b - 0.01; ) {
        const brk = [-RAVINE.z, RAVINE.z].find((q) => q > z + 0.01 && q < Math.min(b, z + 6));
        const z1 = brk ?? Math.min(b, z + 6);
        seg(z, z1);
        z = z1;
      }
    };
    for (const [c0, c1] of cuts) {
      run(cur, c0);
      cur = c1;
    }
    run(cur, rimZ);
  }
  // The trunks: a walkable deck from bank to bank (top STEP: walked onto), the log drawn round it; under each, a
  // rock plug fills the rim's gap below the trunk (the face stays covered).
  for (const z of BRIDGES) {
    const x0 = RAVINE.x0 - RAVINE.rim - 1.5, x1 = RAVINE.x1 + RAVINE.rim + 1.5;
    col.add(x0, -0.2, z - 0.8, x1, STEP, z + 0.8, 'wood');
    const g = new THREE.CylinderGeometry(0.85, 1.0, x1 - x0 + 1.5, 14);
    g.rotateZ(Math.PI / 2);
    b.add(g, rnd() < 0.5 ? m.bark : m.barkPale, (x0 + x1) / 2 + 0.4, STEP - 0.85, z);
    g.dispose();
    for (const [rx0, rx1] of [[RAVINE.x0 - RAVINE.rim, RAVINE.x0], [RAVINE.x1, RAVINE.x1 + RAVINE.rim]] as const) {
      solid(rx0, ravineFloor(z) - 0.3, z - bridgeGap, rx1, -0.45, z + bridgeGap, m.rock, 'concrete', 2);
    }
    // The way onto each end stays clear (a giant tree landed on a trunk's west end in the first build).
    clear(x0 - 6, z - 3, x1 + 6, z + 3);
  }
  // Rocks on the ravine floor (cover down there), clear of the trunks.
  for (const [x, z, w, d] of [[26.2, 9, 1.6, 2.2], [30.8, 27, 1.8, 1.6], [27, 34, 1.4, 1.8]] as const) {
    solid2(x - w / 2, RAVINE.floor - 0.3, z - d / 2, x + w / 2, RAVINE.floor + 1.2, z + d / 2, m.moss, 'concrete', 1.5);
  }
  // (33.0: 5 m along the east bank: a path beside the rim. Trunks nearer squeezed the bank's way onto
  // the rim's top and runners fell into the ravine: levelAI.)
  clear(RAVINE.x0 - RAVINE.rim - 1, -RAVINE.end, RAVINE.x1 + RAVINE.rim + 5, RAVINE.end);

  // ---------------------------------------------------------------- 33.0: the tunnels
  // Carved into the heightfield (CrashLayout.tunnelCarve: the drop lies under the walls), walled, and
  // roofed with slabs whose tops are the jungle floor above. Lit by strips under the roof.
  const TU = TUNNEL;
  /** A pit's walls stand a parapet over the ground (the pits are open to the sky); under the roof, to its underside. */
  const PARAPET = 1.0;
  for (const [x0, z0, x1, z1] of tunnelWalls()) {
    const lo = TU.floor - 0.3;
    const split = Math.min(Math.max(TU.roofFrom, x0), x1);
    if (split > x0 + 0.01) solid(x0, lo, z0, split, PARAPET, z1, m.concrete, 'concrete', 2).vault = false;
    if (x1 > split + 0.01) solid(split, lo, z0, x1, TU.roof, z1, m.concrete, 'concrete', 2);
  }
  for (const [x0, z0, x1, z1] of tunnelRoofs()) solid(x0, TU.roof, z0, x1, 0, z1, m.slab, 'concrete', 3);
  // Where the roof starts over a pit's run: a parapet across it (the ground ends in a drop there).
  for (const s of [1, -1]) {
    const P = TU.pit;
    solid(TU.roofFrom, 0, s > 0 ? P.z0 : -P.z1, TU.roofFrom + 0.4, PARAPET, s > 0 ? P.z1 : -P.z0, m.concrete, 'concrete', 1).vault = false;
    // At the ravine: a lintel through the rim's width, level with its top.
    const E = TU.runs.find((r) => r.name === 'eastRun')!;
    solid(RAVINE.x0 - RAVINE.rim, TU.roof, s > 0 ? E.z0 : -E.z1, RAVINE.x0, RAVINE.rimTop, s > 0 ? E.z1 : -E.z0, m.rock, 'concrete', 2);
  }
  // The pits' stairs (down along x from the ground to the tunnel floor) and the hub's (up into the outpost).
  stair2(TU.pit.x0, TU.pit.z0, TU.pit.x1, TU.pit.z1, 'x', -1, TU.floor, 0, m.concrete);
  const HS = TU.hub.stair;
  stair(HS.x0, -HS.z, HS.x1, HS.z, 'x', 1, TU.floor, 0, m.concrete, ['lo', 'hi']);
  // Its well in the outpost's ground floor, railed (the stair's own plates are below ground there).
  for (const sz of [1, -1]) solid(HS.x0, 0, sz > 0 ? HS.z : -HS.z - 0.08, HS.x1, 1.05, sz > 0 ? HS.z + 0.08 : -HS.z, m.steel, 'metal', 1).vault = false;
  solid(HS.x0 - 0.08, 0, -HS.z - 0.08, HS.x0, 1.05, HS.z + 0.08, m.steel, 'metal', 1).vault = false;
  // A concrete floor drawn over the carved one (the mud stays outside), and the lights.
  for (const r of tunnelRects()) if (r.kind !== 'pit') deco(r.x0, TU.floor, r.z0, r.x1, TU.floor + 0.02, r.z1, m.concrete, 3);
  /** A fluorescent strip under a ceiling (`y`: its underside), every other one a real light (pooled). */
  const strip = (x: number, z: number, along: 'x' | 'z', real: boolean, y: number = TU.roof) => {
    const w = along === 'x' ? 1.4 : 0.12, d = along === 'x' ? 0.12 : 1.4;
    // Into the static builder: every strip one merged draw (their shared material still flickers).
    const g0 = new THREE.BoxGeometry(w, 0.05, d);
    b.add(g0, m.lamp, x, y - 0.03, z);
    g0.dispose();
    let light: THREE.PointLight | undefined;
    if (real) {
      light = new THREE.PointLight(0xcfe6ff, 18, 12, 2);
      light.position.set(x, y - 0.4, z);
      scene.add(light);
    }
    const g = glows.add({ pos: v(x, y - 0.1, z), color: new THREE.Color(0.75, 0.9, 1), radius: 4, base: 1, light, lightBase: real ? 18 : 0, haloSize: 0.8, haloStrength: 0.18, mode: real ? 'steady' : 'flicker' });
    g.materials.push({ mat: m.lamp, base: m.lamp.color.clone() });
  };
  for (const sz of [1, -1]) {
    for (const r of TU.runs) {
      const alongX = r.x1 - r.x0 > r.z1 - r.z0;
      const L = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
      const n = Math.max(1, Math.round(L / 7));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = alongX ? r.x0 + (r.x1 - r.x0) * t : (r.x0 + r.x1) / 2, z = alongX ? (r.z0 + r.z1) / 2 : r.z0 + (r.z1 - r.z0) * t;
        strip(x, sz * z, alongX ? 'x' : 'z', i % 2 === 0);
      }
    }
  }
  for (const x of [-5, 5]) for (const z of [-3, 3]) strip(x, z, 'x', true);

  // ---------------------------------------------------------------- 33.0: the outpost (centre)
  // A research lab on stilts. The ground floor under its deck: columns, the hub's stairwell. The deck:
  // a walkway round the lab, up two stairs (one a half, outside its long sides), railed. The lab:
  // doors and windows, a stair through its middle to the roof (parapets, the comms mast).
  const O = OUTPOST, D = O.deck, L = O.lab, OS = O.stair, RS = O.roofStair;
  for (const [x, z] of [[-10.4, 6.4], [-5.2, 6.4], [5.2, 6.4], [10.4, 6.4], [-10.4, 0], [10.4, 0], [-0.7, 9.4]] as const) {
    for (const sz of z === 0 ? [1] : [1, -1]) solid(x - 0.3, -0.3, sz * z - 0.3, x + 0.3, D.y - D.slab, sz * z + 0.3, m.steel, 'metal', 1);
  }
  solid(D.x0, D.y - D.slab, -D.z, D.x1, D.y, D.z, m.deck, 'metal', 2);
  // The landings at the stairs' tops, joining the deck's long sides.
  solid2(OS.landing, D.y - D.slab, D.z, OS.x0, D.y, OS.z1, m.deck, 'metal', 2);
  // The stairs: down along x from the landing to the ground at x1.
  // Plated both sides (a walker under the deck's edge beside an open side clipped into its fill: levelAI).
  stair2(OS.x0, OS.z0, OS.x1, OS.z1, 'x', -1, 0, D.y, m.steel, ['lo', 'hi']);
  // Rails round the deck (1.05 m: low cover, not vaulted: a fall), open where the landings join it.
  const RAIL = 1.05, rt = 0.08;
  const rail = (x0: number, z0: number, x1: number, z1: number, y = D.y) => (solid(x0, y, z0, x1, y + RAIL, z1, m.steel, 'metal', 1).vault = false);
  for (const sz of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (sz > 0 ? [a, c] : [-c, -a]);
    const [e0, e1] = zr(D.z - rt, D.z);
    rail(D.x0, e0, OS.landing, e1);
    rail(OS.x0, e0, D.x1, e1);
    // The landing's outer edge and its west end.
    const [o0, o1] = zr(OS.z1 - rt, OS.z1);
    rail(OS.landing, o0, OS.x0, o1);
    const [w0, w1] = zr(D.z, OS.z1 - rt);
    rail(OS.landing - rt, w0, OS.landing, w1);
  }
  rail(D.x0, -D.z, D.x0 + rt, D.z);
  rail(D.x1 - rt, -D.z, D.x1, D.z);
  // The lab's walls on the deck (doors and windows; a window: a sill and a head).
  interface Opening { at: number; w: number; y0?: number; y1: number }
  const wallAt = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, y: number, h: number, openings: Opening[]) => {
    const piece = (p0: number, p1: number, y0: number, y1: number) => {
      if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
      if (alongX) solid(p0, y + y0, c0, p1, y + y1, c1, m.labWall, 'concrete', 3);
      else solid(c0, y + y0, p0, c1, y + y1, p1, m.labWall, 'concrete', 3);
    };
    let cur = a0;
    for (const o of openings.slice().sort((p, q) => p.at - q.at)) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, 0, h);
      piece(o0, o1, 0, o.y0 ?? 0);
      piece(o0, o1, o.y1, h);
      cur = o1;
    }
    piece(cur, a1, 0, h);
  };
  for (const sz of [1, -1]) {
    const [c0, c1] = sz > 0 ? [L.z - L.t, L.z] : [-L.z, -L.z + L.t];
    wallAt(true, L.x0, L.x1, c0, c1, D.y, L.h, [{ at: -5, w: 1.8, y1: 2.4 }, { at: 4, w: 5, y0: 1.1, y1: 2.3 }]);
  }
  for (const sx of [1, -1]) {
    const [c0, c1] = sx > 0 ? [L.x1 - L.t, L.x1] : [L.x0, L.x0 + L.t];
    wallAt(false, -L.z + L.t, L.z - L.t, c0, c1, D.y, L.h, [{ at: 0, w: 2, y1: 2.4 }, { at: -3.3, w: 1.8, y0: 1.1, y1: 2.3 }, { at: 3.3, w: 1.8, y0: 1.1, y1: 2.3 }]);
  }
  // The roof (open over the stair's upper half), the stair, rails round its well, parapets, the mast.
  const R0 = D.y + L.h;
  for (const [x0, z0, x1, z1] of [[L.x0, -L.z, L.x1, -RS.z], [L.x0, RS.z, L.x1, L.z], [L.x0, -RS.z, RS.open, RS.z], [RS.x1, -RS.z, L.x1, RS.z]] as const) solid(x0, R0, z0, x1, O.roof, z1, m.slab, 'concrete', 3);
  stair(RS.x0, -RS.z, RS.x1, RS.z, 'x', 1, D.y, O.roof, m.steel, ['lo', 'hi']);
  for (const sz of [1, -1]) rail(RS.open, sz > 0 ? RS.z : -RS.z - rt, RS.x1, sz > 0 ? RS.z + rt : -RS.z, O.roof);
  rail(RS.open - rt, -RS.z - rt, RS.open, RS.z + rt, O.roof);
  const PAR = 0.9, pt = 0.25;
  for (const sz of [1, -1]) solid(L.x0, O.roof, sz > 0 ? L.z - pt : -L.z, L.x1, O.roof + PAR, sz > 0 ? L.z : -L.z + pt, m.labWall, 'concrete', 1).vault = false;
  for (const sx of [1, -1]) solid(sx > 0 ? L.x1 - pt : L.x0, O.roof, -L.z + pt, sx > 0 ? L.x1 : L.x0 + pt, O.roof + PAR, L.z - pt, m.labWall, 'concrete', 1).vault = false;
  cyl(O.mast.x, O.mast.z, O.mast.r, O.roof, O.mast.top - O.roof, m.steel, 'metal', 8);
  // The mast's lattice (seen only: inside its collider's reach or above it) and its dish.
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) {
    const g = new THREE.CylinderGeometry(0.05, 0.08, O.mast.top - O.roof - 1, 5);
    b.add(g, m.steel, O.mast.x + dx * 0.5, (O.roof + O.mast.top) / 2 + 0.5, O.mast.z + dz * 0.5, dz * 0.04, 0, -dx * 0.04);
    g.dispose();
  }
  {
    const dish = new THREE.CylinderGeometry(1.4, 0.3, 0.5, 14, 1, true);
    b.add(dish, m.steel, O.mast.x - 0.6, O.mast.top - 4, O.mast.z, 0, 0, Math.PI / 2.6);
    dish.dispose();
  }
  // Inside the lab: benches (vaulted) and server racks; on the ground floor, crates by the stairwell's top.
  for (const sz of [1, -1]) {
    solid(-3, D.y, sz > 0 ? 2.4 : -3.4, 0, D.y + 1.0, sz > 0 ? 3.4 : -2.4, m.steel, 'metal', 1).vault = true;
    solid(5.2, D.y, sz > 0 ? 2.4 : -4.4, 6.4, D.y + 2.2, sz > 0 ? 4.4 : -2.4, m.hullDark, 'metal', 1);
  }
  // (On the hub's slab: standing on y = 0, not on the carved floor below it.)
  for (const c of solid2(6.2, 0, 2.6, 7.4, 1.0, 3.8, m.plank, 'wood', 1)) c.vault = true;
  // Overgrown: vines down the lab's walls and the columns (drawn on their faces).
  for (const sz of [1, -1]) {
    for (const [x0, x1] of [[-8, -6.4], [0.6, 1.4], [6.8, 8]] as const) deco(x0, D.y + 0.3, sz * (L.z + 0.02), x1, D.y + L.h, sz * (L.z + 0.06), m.tarp, 1);
    deco(-10.72, 0.4, sz * 6.4 - 0.2, -10.68, D.y - D.slab, sz * 6.4 + 0.2, m.tarp, 1);
  }
  // Lights: a cold lamp in the lab (a real one), the mast's beacon.
  {
    const light = new THREE.PointLight(0xd8ecff, 20, 12, 2);
    light.position.set(0, R0 - 0.4, 3);
    scene.add(light);
    const g0 = new THREE.BoxGeometry(3, 0.06, 0.25);
    b.add(g0, m.lamp, 0, R0 - 0.03, 3);
    g0.dispose();
    glows.add({ pos: v(0, R0 - 0.1, 3), color: new THREE.Color(0.8, 0.92, 1), radius: 5, base: 1, light, lightBase: 20, haloSize: 1, haloStrength: 0.2, mode: 'steady' });
  }
  const beacon = (x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m.red);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const light = new THREE.PointLight(0xff3020, 6, 9, 2);
    light.position.set(x, y + 0.2, z);
    scene.add(light);
    const g = glows.add({ pos: v(x, y, z), color: new THREE.Color(1, 0.15, 0.1), radius: 4, base: 1, light, lightBase: 6, haloSize: 0.9, haloStrength: 0.4, mode: 'blink' });
    g.materials.push({ mat: m.red, base: m.red.color.clone() });
  };
  beacon(O.mast.x, O.mast.top + 0.2, O.mast.z);
  // Under the deck (its ground floor lies in the deck's static shadow): strips on the deck's underside.
  for (const x of [-6, 7]) for (const z of [-3.5, 3.5]) strip(x, z, 'x', x * z > 0, D.y - D.slab);
  // Roots over the clearing's edges (a box collider, the root drawn round it).
  const root = (x0: number, z0: number, x1: number, z1: number, r: number) => {
    for (const sz of [1, -1]) {
      const za = sz > 0 ? z0 : -z1, zb = sz > 0 ? z1 : -z0;
      const ys = [crashHeight(x0, za), crashHeight(x1, za), crashHeight(x0, zb), crashHeight(x1, zb)];
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const c = solid(x0, lo - 0.2, za, x1, hi + 2 * r - 0.1, zb, m.bark, 'wood', 1);
      c.vault = hi + 2 * r - 0.1 - lo <= 1.05;
    }
  };
  root(19, 19.5, 20, 26, 0.45);
  root(-8, 27.6, -1.5, 28.5, 0.45);
  clear(-21, -20, 18, 20);
  for (const r of tunnelRects()) clear(r.x0 - TU.wall - 1, Math.min(r.z0, r.z1) - TU.wall - 1, r.x1 + TU.wall + 1, Math.max(r.z0, r.z1) + TU.wall + 1);

  // ---------------------------------------------------------------- 33.0: overgrown containers
  // Old Port's containers (world/Containers), moss grown over the paint: solid cover by the tunnels'
  // mouths (by the west runs, above the ravine's on both banks), out on the east flank, one across the
  // middle west.
  const paints = [['#6f8f88', 1], ['#a66450', 2], ['#c4a35e', 3], ['#7a8b9c', 4]] as const;
  const contMats = paints.map(([p, sd]) => std(overgrownContainerTexture(p, sd), 0xffffff, 0.8, 0.15, 0.3));
  // 70.0: the kit's containers in their overgrown paints.
  for (const c of contMats) dress?.rule(c, 'container', { paint: c });
  const box2 = (x0: number, z0: number, along: 'x' | 'z', k: number) => {
    const w = along === 'x' ? CONT.W : CONT.L;
    const x1 = x0 + (along === 'x' ? CONT.L : CONT.W);
    // On the lowest of its corners (a little sunk: never a gap under it).
    const foot = (za: number) => Math.min(crashSurface(x0, za), crashSurface(x1, za), crashSurface(x0, za + w), crashSurface(x1, za + w)) - 0.05;
    addContainer(b, col, x0, z0, along, 1, contMats[k], foot(z0));
    addContainer(b, col, x0, -(z0 + w), along, 1, contMats[k], foot(-(z0 + w)));
    for (const sz of [1, -1]) {
      const za = sz > 0 ? z0 : -(z0 + w), zb = za + w;
      taken.push([(x0 + x1) / 2, (za + zb) / 2, Math.hypot(x1 - x0, w) / 2]);
      // Vines over its roof edge (drawn on its side).
      deco(x0 + 0.6, 1.0, zb + 0.01, x0 + 1.4, CONT.H, zb + 0.05, m.tarp, 1);
    }
  };
  box2(-16.6, 17.5, 'x', 0);
  box2(15, 7, 'x', 1);
  // (The east bank's two stand 8 m off the ravine's rim: nearer, with the trees, they squeezed the bank's
  // way onto the rim's top, and runners fell into the ravine: levelAI.)
  box2(43, 24, 'z', 2);
  box2(42.5, 13.5, 'z', 3);
  // Across the middle west, where the shrine stood (on z = 0: one, the map's mirror is itself).
  addContainer(b, col, -20, -CONT.W / 2, 'x', 1, contMats[0], -0.05);
  taken.push([-17, 0, 3.3]);

  // ---------------------------------------------------------------- trenches
  // Sandbags on the rim at each trench's bends (vault them; cover for whoever holds the bend).
  for (const L of TRENCHES) {
    for (let i = 1; i < L.length - 1; i++) {
      const [x, z] = L[i];
      const side = x < 0 ? -1 : 1;
      ground2(x + side * 4.6 - 1.2, z - 0.35, x + side * 4.6 + 1.2, z + 0.35, 0.85, m.sandbag, 'sand');
    }
  }

  // ---------------------------------------------------------------- the landing zones
  // HESCO walls (2.4 m) round each yard, open only at the sides (z 55.4–59): out of the west gap you
  // face the ridge's steps, out of the east one the ravine's ramp (the first build's exits in the front
  // wall faced the wreck, and the wreck took 46–75% of bot time). A sandbag wall outside each gap.
  const HW = 2.4;
  const EX = { z0: 55.4, z1: 59 };
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    const [w0, w1] = zr(BASE.z0, BASE.z0 + 0.9);
    solid(BASE.x0 - 0.9, 0, w0, BASE.x1 + 0.9, HW, w1, m.hesco, 'sand', 1);
    for (const [x0, x1] of [[BASE.x0 - 0.9, BASE.x0], [BASE.x1, BASE.x1 + 0.9]] as const) {
      let [a, c] = zr(BASE.z0 + 0.9, EX.z0);
      solid(x0, 0, a, x1, HW, c, m.hesco, 'sand', 1);
      [a, c] = zr(EX.z1, Z_END);
      solid(x0, 0, a, x1, HW, c, m.hesco, 'sand', 1);
    }
    for (const sx of [-1, 1]) {
      const x = sx * (BASE.x1 + 4.2);
      const [k0, k1] = zr(EX.z0 - 0.6, EX.z1 + 0.6);
      solid(x - 0.4, 0, k0, x + 0.4, 1.05, k1, m.sandbag, 'sand', 1);
    }
  }
  clear(BASE.x0 - 2, BASE.z0 - 6, BASE.x1 + 2, Z_END);
  clear(-X_OUT, COURT, X_OUT, BASE.z0 - 4);

  // 19.0: the denser forest keeps off the ridge's foot (a path: its drops land there, its side stairs
  // start there).
  clear(RIDGE.x1, 0, RIDGE.x1 + 7.5, COURT);
  clear(RIDGE.ramp.x0 - 2, RIDGE.z, RIDGE.ramp.x1 + 3, RIDGE.ramp.z1 + 2);
  // 33.0: the side steps' foot (the shrine's clearing used to keep it free).
  clear(RIDGE.x1 + 7, 19, RIDGE.x1 + 12.5, 25);

  // ---------------------------------------------------------------- trees, logs, boulders
  const forestAt = (x: number, z: number) => {
    if (keepClear.some(([a0, b0, a1, b1]) => x > a0 && x < a1 && z > b0 && z < b1)) return 0;
    const td = trenchDist(x, z);
    const trench = THREE.MathUtils.smoothstep(td, 3, 9);
    const wreck = THREE.MathUtils.smoothstep(Math.hypot(x / 1.3, z), 21, 28);
    const ravineSide = x > RAVINE.x1 + RAVINE.rim ? 1 : x > RAVINE.x0 - RAVINE.rim - 3 ? 0.4 : 0.85;
    return trench * wreck * ravineSide * (0.55 + noise(x * 0.06 + 3, Math.abs(z) * 0.06 - 7) * 0.6);
  };
  const free = (x: number, z: number, r: number, gap: number) =>
    // 33.0: 1.1 m clear of anything solid (was 0.5: a slim trunk 0.84 m off the ravine's rim made a slot
    // a body wedged in; the 3.3 rule: gaps under 0.3 m or over 1 m).
    !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + gap) && !col.blocked(v(x, crashSurface(x, z), z), r + 1.1, 1);
  const trees: TreeInfo[] = [];
  const giant = (x: number, z: number, r: number) => {
    const R = r * 1.95;
    const ys = [crashSurface(x, z), crashSurface(x + R, z), crashSurface(x - R, z), crashSurface(x, z + R), crashSurface(x, z - R)];
    const gMin = Math.min(...ys), gMax = Math.max(...ys);
    const y0 = gMin - 0.4;
    const h = 42 + rnd() * 10;
    b.add(new THREE.CylinderGeometry(r * 0.62, r, h, 12), rnd() < 0.3 ? m.barkPale : m.bark, x, y0 + h / 2, z, 0, rnd() * Math.PI, 0);
    // A flared base (the buttresses, simplified to a cone inside the flare collider).
    b.add(new THREE.CylinderGeometry(r * 1.05, R * 0.98, gMax - y0 + 1.4, 10), m.bark, x, y0 + (gMax - y0 + 1.4) / 2, z);
    col.addCylinder(x, z, R, y0, gMax + 1.1, 'wood');
    col.addCylinder(x, z, r, y0, y0 + h, 'wood');
    taken.push([x, z, R]);
    trees.push({ x, z, r, flare: R, y: gMin, h, giant: true });
  };
  const slim = (x: number, z: number, r: number) => {
    const y0 = crashSurface(x, z) - 0.3;
    const h = 16 + rnd() * 10;
    b.add(new THREE.CylinderGeometry(r * 0.7, r * 1.08, h, 8), m.barkPale, x, y0 + h / 2, z, 0, rnd() * Math.PI, 0);
    col.addCylinder(x, z, r * 1.08, y0, y0 + h, 'wood');
    taken.push([x, z, r * 1.08]);
    trees.push({ x, z, r, flare: r * 1.08, y: y0 + 0.3, h, giant: false });
  };
  // Authored in the south half and mirrored, so both teams get the same forest.
  const ext = { x0: -X_OUT + 2, x1: X_OUT - 2, z0: 1, z1: COURT - 1 };
  const place = (n: number, minForest: number, r0: number, r1: number, gap: number, make: (x: number, z: number, r: number) => void) => {
    let made = 0;
    for (let i = 0; i < n * 40 && made < n; i++) {
      const x = ext.x0 + rnd() * (ext.x1 - ext.x0), z = ext.z0 + rnd() * (ext.z1 - ext.z0), r = r0 + rnd() * (r1 - r0);
      if (forestAt(x, z) < minForest || forestAt(x, -z) < minForest) continue;
      if (!free(x, z, r * 1.95, gap) || !free(x, -z, r * 1.95, gap)) continue;
      make(x, z, r);
      make(x, -z, r);
      made++;
    }
  };
  // 19.0: a denser forest (sightline breakers): more giants and slim trunks, more boulders.
  place(13, 0.45, 0.8, 1.3, 3.2, giant);
  place(44, 0.3, 0.26, 0.45, 1.4, slim);
  // Mossy boulders (cover in the clearing's edges and the east bank).
  place(18, 0.22, 0.7, 1.1, 1.6, (x, z, r) => {
    const w = r * 2, d = r * 1.6;
    const ys = [crashSurface(x - w / 2, z - d / 2), crashSurface(x + w / 2, z - d / 2), crashSurface(x - w / 2, z + d / 2), crashSurface(x + w / 2, z + d / 2)];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    solid(x - w / 2, lo - 0.3, z - d / 2, x + w / 2, hi + 1.1 + rnd() * 0.6, z + d / 2, rnd() < 0.5 ? m.moss : m.rock, 'concrete', 1.5);
    taken.push([x, z, Math.max(w, d) * 0.75]);
  });

  dress?.finish(scene);
  if (dress) (globalThis as unknown as { __dress?: unknown }).__dress = dress.stats;
  b.build(scene);
  dress?.afterBuild(scene);
  dress?.dispose();
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  terrain.castShadow = false;

  // ---------------------------------------------------------------- navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const drops: [number, number][] = [];
  const open = (x: number, y: number, z: number) => !col.blocked(v(x, y, z), 0.6);
  /** 33.0: room for a body and a floor under it at that level (a grid over a level with a stairwell in it). */
  const stand = (x: number, y: number, z: number) => open(x, y, z) && Math.abs(col.groundHeightAt(x, z, 0.3, y + 0.1, 0.5) - y) < 0.15;
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.2 * 1.2) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  // On the jungle floor (33.0: crashSurface: over a tunnel, its slab's top).
  const G = (x: number, z: number) => N(x, crashSurface(x, z), z);
  const chain = (...ids: number[]) => {
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
  };
  for (const s of [1, -1]) {
    const Z = (z: number) => z * s;
    // Yard exits (inside, in the gap, outside) and round the sandbag walls.
    for (const sx of [-1, 1]) {
      G(sx * (BASE.x1 - 1.5), Z(57.2));
      G(sx * (BASE.x1 + 1.8), Z(57.2));
      for (const z of [53.2, 61]) G(sx * (BASE.x1 + 4.2), Z(z));
    }
    // The ridge: the end steps (foot, middle, top), the side steps, the fallen tree, the drops.
    chain(G(-39, Z(RIDGE.ramp.z1 + 1)), N(-39, RT / 2, Z((RIDGE.z + RIDGE.ramp.z1) / 2)), N(-39, RT, Z(RIDGE.z - 1)));
    chain(G(RIDGE.x1 + 9.4, Z(22)), N(RIDGE.x1 + 4.3, RT / 2, Z(22)), N(RIDGE.x1 - 1.2, RT, Z(22)));
    for (const z of [10, 30]) drops.push([N(RIDGE.x1 - 1.4, RT, Z(z)), G(RIDGE.x1 + 2.6, Z(z))]);
    // 33.0, the outpost: the deck stairs (foot, middle, landing) onto the deck's walkway; the lab's doors
    // in its long walls.
    chain(G(OS.x1 + 1.1, Z(8.5)), N((OS.x0 + OS.x1) / 2, D.y / 2, Z(8.5)), N(0.3, D.y, Z(8.5)), N(0.3, D.y, Z(6)));
    chain(N(-5, D.y, Z(6)), N(-5, D.y, Z(3.8)));
    // 33.0, the tunnels: down each pit's stair; along the runs and the connectors (their centre lines:
    // the bends' nodes in the middle, so a turn never hugs a wall); out through the ravine's rim.
    const P = TU.pit, pz = (P.z0 + P.z1) / 2;
    chain(G(P.x0 - 1.2, Z(pz)), N((P.x0 + P.x1) / 2, TU.floor / 2, Z(pz)), N(P.x1 + 0.6, TU.floor, Z(pz)));
    for (const r of TU.runs) {
      const alongX = r.x1 - r.x0 > r.z1 - r.z0;
      const L2 = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
      const n = Math.max(2, Math.round(L2 / 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = alongX ? r.x0 + 1.5 + (r.x1 - r.x0 - 3) * t : (r.x0 + r.x1) / 2, z = alongX ? (r.z0 + r.z1) / 2 : r.z0 + (r.z1 - r.z0 - 1.5) * t;
        if (open(x, TU.floor, Z(z))) N(x, TU.floor, Z(z));
      }
    }
    N(RAVINE.x0 - 0.6, TU.floor, Z(pz));
    N(RAVINE.x0 + 1.6, RAVINE.floor, Z(pz));
    // The ravine: down its end ramps; the drops off the rims.
    chain(N(28.5, 0, Z(RAVINE.end + 1.5)), N(28.5, ravineFloor(Z(45.5)), Z(45.5)), N(28.5, RAVINE.floor, Z(RAVINE.z - 1)));
    // Round the rims' ends from the ramp's top, where it comes out level with the ground (33.1: the rims
    // along the ramps are walls now: the only way out of the ravine's ends is past them).
    for (const x of [RAVINE.x0 - RAVINE.rim - 1.2, RAVINE.x1 + RAVINE.rim + 1.2]) links.push([N(28.5, 0, Z(RAVINE.end + 1.5)), G(x, Z(RAVINE.end + 1.5))]);
    // (33.0: the west rim's at z 5, clear of the tunnel's mouth and the floor's rocks.)
    // 33.0: from the bank just outside the rim (over it and down), never from its top: a node on a rim
    // made the rims' 1.5 m tops a way along the ravine, beside a 4 m drop (runners fell in: levelAI).
    for (const z of [5, 30]) drops.push([G(RAVINE.x0 - RAVINE.rim - 0.7, Z(z)), N(RAVINE.x0 + 1.6, RAVINE.floor, Z(z))]);
    for (const z of [12, 30]) drops.push([G(RAVINE.x1 + RAVINE.rim + 0.7, Z(z)), N(RAVINE.x1 - 1.6, RAVINE.floor, Z(z))]);
  }
  // The fallen tree onto the ridge, the bridges over the ravine (deck 0.45).
  chain(G(RIDGE.x1 + 7.3, 0), N(RIDGE.x1 + 3.3, RT / 2, 0), N(RIDGE.x1 - 1.2, RT, 0));
  for (const z of BRIDGES) chain(G(RAVINE.x0 - RAVINE.rim - 2.2, z), N(RAVINE.x0 + 1.5, STEP, z), N(RAVINE.x1 - 1.5, STEP, z), G(RAVINE.x1 + RAVINE.rim + 2.2, z));
  // 33.0, the hub: its stair (foot on the hub's floor, middle, top on the outpost's ground floor), a grid
  // over its floor round the stair. The outpost: the lab's end doors, its stair to the roof, the deck's
  // walkway round the lab, the lab's floor and roof, the ground floor under the deck.
  chain(N(HS.x0 - 0.9, TU.floor, 0), N((HS.x0 + HS.x1) / 2, TU.floor / 2, 0), N(HS.x1 + 0.9, 0, 0));
  for (let x = TU.hub.x0 + 1; x <= TU.hub.x1 - 1; x += 2) for (let z = TU.hub.z0 + 1; z <= TU.hub.z1 - 1; z += 2) if (stand(x, TU.floor, z)) N(x, TU.floor, z);
  for (const sx of [-1, 1]) chain(N(sx * (L.x1 + 1.25), D.y, 0), N(sx * (L.x1 - 1.1), D.y, 0));
  chain(N(RS.x0 - 0.9, D.y, 0), N((RS.x0 + RS.x1) / 2, (D.y + O.roof) / 2, 0), N(RS.x1 + 0.9, O.roof, 0));
  for (let x = D.x0 + 1; x <= D.x1 - 1; x += 2) for (const z of [-6, 6]) if (stand(x, D.y, z)) N(x, D.y, z);
  for (const x of [-(L.x1 + 1.25), L.x1 + 1.25]) for (let z = -4; z <= 4; z += 2) if (stand(x, D.y, z)) N(x, D.y, z);
  for (let x = L.x0 + 0.9; x <= L.x1 - 0.9; x += 1.6) for (let z = -L.z + 0.9; z <= L.z - 0.9; z += 1.6) if (stand(x, D.y, z)) N(x, D.y, z);
  for (let x = L.x0 + 0.9; x <= L.x1 - 0.9; x += 1.5) for (let z = -L.z + 0.9; z <= L.z - 0.9; z += 1.5) if (stand(x, O.roof, z)) N(x, O.roof, z);
  for (let x = D.x0 + 0.6; x <= D.x1 - 0.6; x += 2) for (let z = -D.z + 0.6; z <= D.z - 0.6; z += 2) {
    if (x > HS.x0 - 0.6 && x < HS.x1 + 0.4 && Math.abs(z) < HS.z + 0.6) continue;
    if (stand(x, 0, z)) N(x, 0, z);
  }
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Lattices: the ground (4 m), the ridge top (4 m), the ravine floor (3 m along it).
  for (let x = -X_OUT + 2; x <= X_OUT - 2; x += 4) {
    for (let z = -Z_END + 2; z <= Z_END - 2; z += 4) {
      if (x > RAVINE.x0 - RAVINE.rim - 0.5 && x < RAVINE.x1 + RAVINE.rim + 0.5 && Math.abs(z) < RAVINE.end + 0.5) continue;
      if (x < RIDGE.x1 + 0.5 && Math.abs(z) < RIDGE.ramp.z1 + 0.5) continue;
      // 33.0: on the jungle floor (over a tunnel: its slab), never in a pit or down the hub's stairwell.
      const P = TU.pit, HS2 = TU.hub.stair;
      if (x > P.x0 - 0.5 && x < TU.roofFrom + 0.5 && Math.abs(z) > P.z0 - 0.5 && Math.abs(z) < P.z1 + 0.5) continue;
      if (x > HS2.x0 - 0.5 && x < HS2.x1 + 0.5 && Math.abs(z) < HS2.z + 0.5) continue;
      const y = crashSurface(x, z);
      if (open(x, y, z)) N(x, y, z);
    }
  }
  for (let x = -46; x <= -32; x += 4) for (let z = -32; z <= 32; z += 4) if (open(x, RT, z)) N(x, RT, z);
  for (const x of [26, 31]) for (let z = -39; z <= 39; z += 3) if (open(x, RAVINE.floor, z)) N(x, RAVINE.floor, z);

  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!open(p.x, p.y, p.z)) laneProblems.push(`${t} ${p.x},${p.y},${p.z}`);

  const testGoals = [
    v(-39, RT, 0), v(-39, RT, 28), v(-32, RT, -22),
    // 33.0: every level of the outpost, and down every tunnel.
    v(-8.5, 0, 3), v(6, 0, -5.5), v(-9.75, D.y, 2), v(4, D.y, -6), v(-3, D.y, 4), v(6.8, D.y, -1.5), v(-6, O.roof, 3), v(2, O.roof, -3.5),
    v(-6.5, TU.floor, 3), v(6.5, TU.floor, -3), v(15, TU.floor, 13.5), v(-10, TU.floor, -13.5), v(5.5, TU.floor, -9), v(-15, TU.floor, 13.5),
    v(28.5, RAVINE.floor, 0), v(28.5, RAVINE.floor, -30), v(40, crashHeight(40, 10), 10), v(-12, crashHeight(-12, 23), 23),
    v(11, crashHeight(11, -22), -22), v(0, 0, 48), v(-26, crashHeight(-26, -10), -10),
  ];

  // ---------------------------------------------------------------- the undergrowth's site
  const site: FoliageSite = {
    // 33.0: the jungle floor, not the carved one (no plant or mist down a tunnel).
    height: crashSurface,
    forest: forestAt,
    // Firebase's plants keep `minD` m out from its wall; here: bushes and big leaves only where the
    // forest is (no undergrowth on paths), ferns and sedge creep a little further out.
    allowed: (x, z, minD) => forestAt(x, z) > (minD >= 7 ? 0.3 : minD >= 6 ? 0.18 : 0.06),
    extent: X_OUT + 2,
    canopyR: X_OUT + 20,
    vineR: X_OUT,
    mistSize: 2 * Z_END + 30,
    canopyOk: (x, z) => Math.hypot(x / 1.3, z) > 14,
    vineOk: (x, z) => forestAt(x, z) > 0.3,
    // 19.0: half again as many plants (all instanced: the same draw calls).
    density: 1.5,
    // 33.0, the visibility pass ("too tall and dense, blinding"): every plant under eye height (bushes
    // to 1.1 m, sedge to 0.6 m, big-leaf plants to 1.0 m), 40% fewer bushes, half the big-leaf plants,
    // no wall of bushes round the yards, vines ending over head height; bodies hidden only up to 1.2 m
    // (a crouch, not a standing man). The canopy and the trees stay.
    plants: { bush: [0.6, 1.05], bushN: 0.6, grass: [0.4, 0.72], bigleaf: [0.65, 1.15], bigleafN: 0.5, spawnRing: false, vineEnd: 2.6, concealTop: 1.2 },
  };

  return {
    nav: { nodes, links, drops, slope: 0.18, faces: true },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    coverPoints: [],
    testGoals,
    zoneAt,
    trees,
    keepClear,
    site,
    // 33.0: the mist stays out from under the lab (its ground floor) and the lab.
    interiors: [{ name: 'THE OUTPOST', jp: 'ฐานวิจัย', x0: D.x0, z0: -OS.z1, x1: D.x1, z1: OS.z1, y0: 0, h: O.roof }],
    terrain,
    laneProblems,
    update() {},
  };
}
