import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glows } from '../../world/Glows';
import { mulberry32 } from '../../core/math';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import * as T from '../jungle/textures';
import { hescoTexture, sandbagTexture } from '../desert/textures';
import type { TreeInfo } from '../jungle/Base';
import type { FoliageSite } from '../jungle/Foliage';
import { noise } from '../jungle/Terrain';
import {
  BASE, BRIDGES, COURT, GATE, RAVINE, RIDGE, SHRINE, STEP, T1, T2, TRENCHES, WRECK, X_OUT, Z_END, crashHeight, lanesOf, ravineFloor, spawnsOf, trenchDist, zoneAt,
} from './CrashLayout';
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
    red: hdr(4, 0.3, 0.2),
    amber: hdr(4.2, 2.4, 0.6),
  };

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
  stair2(RIDGE.x1, 20.6, RIDGE.x1 + 8.6, 23.4, 'x', -1, 0, RT, m.stone);
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
    const cuts = BRIDGES.map((z) => [z - bridgeGap, z + bridgeGap] as [number, number]).sort((a, c) => a[0] - c[0]);
    let cur = -rimZ;
    const seg = (z0: number, z1: number) => {
      // Down to below the floor under this stretch (the ramps lift it near the ends).
      const lo = Math.min(ravineFloor(z0), ravineFloor(z1)) - 0.3;
      solid(rx0, lo, z0, rx1, RAVINE.rimTop, z1, m.rock, 'concrete', 2);
    };
    for (const [c0, c1] of cuts) {
      for (let z = cur; z < c0 - 0.01; z = Math.min(c0, z + 6)) seg(z, Math.min(c0, z + 6));
      cur = c1;
    }
    for (let z = cur; z < rimZ - 0.01; z = Math.min(rimZ, z + 6)) seg(z, Math.min(rimZ, z + 6));
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
  clear(RAVINE.x0 - RAVINE.rim - 1, -RAVINE.end, RAVINE.x1 + RAVINE.rim + 1, RAVINE.end);

  // ---------------------------------------------------------------- the temple and the wreck (centre)
  // 19.0: an overgrown stepped temple, the dropship lying across its top. Three levels to fight on:
  // the undercroft under the ship (ground level, reached by the gates through both terraces), the hull
  // (level with the upper terrace; side doors, the breach, a hole in its deck down to the undercroft),
  // and above it the wreck's roof (the wings are ramps up from the terrace) joined by a fallen lintel
  // to the shrine, the highest point (7.2 m), with stairs down both its flanks.
  const W = WRECK;
  const G2 = GATE;
  /**
   * A temple stair's cheeks: solid stone walls either side of the run (outside it), `over` m above
   * the stair's top. A low stair's open side was cut into by walkers from beside it (levelAI).
   */
  const cheeks2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', base: number, top: number, w = 0.6, over = 0.5) => {
    // 3 cm off the run (9.1: a stair is never flush with a wall).
    const g = STAIR_GAP;
    if (axis === 'z') for (const [a, c] of [[x0 - w - g, x0 - g], [x1 + g, x1 + w + g]]) solid2(a, base - 0.3, z0, c, top + over, z1, m.rock, 'concrete', 1);
    else for (const [a, c] of [[z0 - w - g, z0 - g], [z1 + g, z1 + w + g]]) solid2(x0, base - 0.3, a, x1, top + over, c, m.rock, 'concrete', 1);
  };
  // Outer terrace (1.3): two halves either side of the open gate; its front stairs, walled; carved trim.
  for (const [x0, x1] of [[T1.x0, -G2], [G2, T1.x1]] as const) solid2(x0, -0.3, T1.zIn, x1, T1.y, T1.zOut, m.stone, 'concrete', 3);
  for (const x0 of [-11, 7]) {
    stair2(x0, T1.zOut, x0 + 4, T1.zOut + 4.5, 'z', -1, 0, T1.y, m.stone);
    cheeks2(x0, T1.zOut, x0 + 4, T1.zOut + 4.5, 'z', 0, T1.y);
  }
  // Upper terrace (2.8): solid either side of the gate, a bridge slab over it.
  for (const [x0, x1] of [[T2.x0, -G2], [G2, T2.x1]] as const) solid2(x0, -0.3, T2.zIn, x1, T2.y, T2.zOut, m.moss, 'concrete', 3);
  solid2(-G2, T2.y - T2.slab, T2.zIn, G2, T2.y, T2.zOut, m.stone, 'concrete', 2);
  // Stairs from the outer terrace up to the upper one (on T1, rising to T2's face).
  stair2(-10.5, T2.zOut, -8, T2.zOut + 4.5, 'z', -1, T1.y, T2.y, m.stone);
  stair2(8, T2.zOut, 10.5, T2.zOut + 4.5, 'z', -1, T1.y, T2.y, m.stone);
  cheeks2(-10.5, T2.zOut, -8, T2.zOut + 4.5, 'z', T1.y, T2.y);
  cheeks2(8, T2.zOut, 10.5, T2.zOut + 4.5, 'z', T1.y, T2.y);
  // East: stairs up T2's end from the ground (the shrine's side is west).
  stair2(T2.x1 + 0.03, 5, T2.x1 + 5.6, 7.5, 'x', -1, 0, T2.y, m.stone);
  // Its cheeks: the south one, and on the north a wall to T1's end (no slot between them).
  solid2(T2.x1, -0.3, 4.4, T2.x1 + 5.6, T2.y + 0.5, 5 - STAIR_GAP, m.rock, 'concrete', 1);
  solid2(T2.x1, -0.3, 7.5 + STAIR_GAP, T2.x1 + 5.6, T2.y + 0.5, T1.zIn, m.rock, 'concrete', 1);
  // The gate's lintels on T1's front (seen over the open cut, out of reach), the terraces' cornices.
  for (const sz of [1, -1]) deco(-G2 - 0.3, T2.y + 0.0, sz > 0 ? T2.zOut - 0.3 : -T2.zOut, G2 + 0.3, T2.y + 0.25, sz > 0 ? T2.zOut : -T2.zOut + 0.3, m.rock, 1);

  // The hull: belly and deck (with the hole to the undercroft), walls with doors and the breach, the
  // roof (open over the breach), the cockpit propped on a stone pillar, the tail open over the passage.
  const h = W.hole;
  for (const [x0, z0, x1, z1] of [[W.x0, -W.z, -h, W.z], [h, -W.z, W.x1, W.z], [-h, -W.z, h, -h], [-h, h, h, W.z]] as const) {
    solid(x0, W.belly, z0, x1, W.floor, z1, m.hullDark, 'metal', 2);
  }
  const hullWall = (z0: number, z1: number) => {
    const piece = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 - x0 > 0.01 && y1 - y0 > 0.01) solid(x0, y0, z0, x1, y1, z1, m.hull, 'metal', 3);
    };
    const R0 = W.floor, R1 = W.roof - 0.3;
    const [d0, d1] = W.doors;
    piece(W.x0, d0 - 0.8, R0, R1);
    piece(d0 - 0.8, d0 + 0.8, R0 + 2.2, R1);
    piece(d0 + 0.8, -W.breach, R0, R1);
    piece(W.breach, d1 - 0.8, R0, R1);
    piece(d1 - 0.8, d1 + 0.8, R0 + 2.2, R1);
    piece(d1 + 0.8, W.x1, R0, R1);
  };
  hullWall(W.z - 0.3, W.z);
  hullWall(-W.z, -W.z + 0.3);
  // The ends: the cockpit bulkhead (east) closed; the tail (west) open in the middle (a drop to the passage).
  solid(W.x1 - 0.3, W.floor, -W.z + 0.3, W.x1, W.roof - 0.3, W.z - 0.3, m.hull, 'metal', 2);
  solid(W.x0, W.floor, -W.z + 0.3, W.x0 + 0.3, W.roof - 0.3, -1.2, m.hull, 'metal', 2);
  solid(W.x0, W.floor, 1.2, W.x0 + 0.3, W.roof - 0.3, W.z - 0.3, m.hull, 'metal', 2);
  solid(W.x0, W.floor + 2.2, -1.2, W.x0 + 0.3, W.roof - 0.3, 1.2, m.hull, 'metal', 2);
  solid(W.x0, W.roof - 0.3, -W.z, -W.breach, W.roof, W.z, m.hull, 'metal', 3);
  solid(W.breach, W.roof - 0.3, -W.z, W.x1, W.roof, W.z, m.hull, 'metal', 3);
  // The cockpit: a solid nose raised on the wreck's line, its canopy glowing faintly; a stone pillar
  // it came down on (cover at the undercroft's east mouth).
  solid(W.x1, W.belly, -2.4, W.x1 + 3.5, W.belly + 2.8, 2.4, m.hull, 'metal', 2);
  {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 3.6), m.cyan);
    glass.position.set(W.x1 + 1.6, W.belly + 2.83, 0);
    scene.add(glass);
  }
  cyl(W.x1 + 2.2, 0, 0.75, -0.2, W.belly + 0.2, m.stone, 'concrete');
  // Inside: cargo crates (vault) and a fallen locker; a tail fin over the roof (out of the walkway).
  solid(-6.6, W.floor, -0.6, -5.4, W.floor + 1.0, 0.6, m.plank, 'wood', 1).vault = true;
  solid(4.4, W.floor, -W.z + 0.3, 5.6, W.floor + 1.0, -W.z + 1.3, m.plank, 'wood', 1).vault = true;
  solid(4.4, W.floor, W.z - 1.3, 5.6, W.floor + 1.0, W.z - 0.3, m.plank, 'wood', 1).vault = true;
  solid(W.x0 + 0.5, W.roof, W.z - 0.3, W.x0 + 2.5, W.roof + 2.6, W.z, m.hullDark, 'metal', 1);
  // The wings: ramps from the upper terrace to the roof's edge, a tilted plate over each, filled under.
  {
    const run = W.wing.z1 - W.z, rise = W.roof - T2.y;
    const ang = Math.atan2(rise, run), len = Math.hypot(run, rise);
    for (const sz of [1, -1]) {
      const z0 = sz > 0 ? W.z : -W.wing.z1, z1 = sz > 0 ? W.wing.z1 : -W.z;
      col.addRamp(W.wing.x0, z0, W.wing.x1, z1, 'z', sz > 0 ? W.roof : T2.y, sz > 0 ? T2.y : W.roof);
      const plate = new THREE.BoxGeometry(W.wing.x1 - W.wing.x0, 0.16, len);
      b.add(plate, m.hull, (W.wing.x0 + W.wing.x1) / 2, T2.y + rise / 2 - 0.08, sz * (W.z + run / 2), sz * ang, 0, 0);
      plate.dispose();
      // Thin plates along both edges where the wing stands over a step high (a sprint-jump at its side
      // crossed the fill under it: the stress test), as a stair's.
      for (const px of [W.wing.x0, W.wing.x1 - 0.08]) {
        for (let i = 0; i < 6; i++) {
          const k0 = i / 6, k1 = (i + 1) / 6;
          // Open over the last metre or so (the foot is stepped onto from the terrace beside it).
          if (rise * (1 - k1) < 0.5) continue;
          const za = W.z + run * k0, zc = W.z + run * k1;
          const c = solid(px, T2.y, sz > 0 ? za : -zc, px + 0.08, T2.y + rise * (1 - k0) + 0.6, sz > 0 ? zc : -za, m.hullDark, 'metal', 1);
          c.vault = false;
        }
      }
      for (let i = 1; i < 8; i++) {
        const hh = T2.y + (rise * (8 - i)) / 8;
        const a = W.z + (run * (i - 1)) / 8, c = W.z + (run * i) / 8;
        const f = col.add(W.wing.x0, T2.y - 0.2, sz > 0 ? a : -c, W.wing.x1, hh, sz > 0 ? c : -a, 'metal');
        f.floor = false;
      }
    }
  }
  // The shrine: a ruined prang (stone, mossy courses), its flank stairs from the ground, the fallen
  // lintel from its top down to the wreck's roof (over the passage between them).
  const SH = SHRINE;
  solid(SH.x0, -0.3, -SH.z, SH.x1, SH.top, SH.z, m.stone, 'concrete', 3);
  // Its plinth: terrace 1 carried round the shrine's flanks to T2's west end (the pocket there was a
  // dead corner bots stalled in: levelAI), 3 cm off the shrine stairs.
  solid2(SH.stair.x1 + STAIR_GAP, -0.3, W.z, T2.x0, T1.y, T1.zIn, m.stone, 'concrete', 3);
  for (const y of [1.6, 3.6, 5.6]) deco(SH.x0 - 0.06, y, -SH.z - 0.06, SH.x1 + 0.06, y + 0.3, SH.z + 0.06, m.moss, 2);
  stair2(SH.stair.x0, SH.z, SH.stair.x1, SH.stair.foot, 'z', -1, 0, SH.top, m.stone);
  // Its crown: a broken spire (out of reach, at the west edge), low parapet blocks (cover on top).
  b.add(new THREE.CylinderGeometry(0.6, 1.9, 6, 8), m.stone, SH.x0 + 2.4, SH.top + 3, 0);
  col.addCylinder(SH.x0 + 2.4, 0, 1.9, SH.top, SH.top + 6, 'concrete');
  for (const z of [-2.6, 2.6]) solid(SH.x1 - 2.2, SH.top, z - 0.4, SH.x1 - 1.0, SH.top + 0.95, z + 0.4, m.moss, 'concrete', 1).vault = true;
  {
    const x0 = SH.x1, x1 = W.x0;
    col.addRamp(x0, -SH.lintel, x1, SH.lintel, 'x', SH.top, W.roof);
    const len = Math.hypot(x1 - x0, SH.top - W.roof), ang = Math.atan2(W.roof - SH.top, x1 - x0);
    b.add(worldBox(len + 0.3, 0.5, 2 * SH.lintel, 1), m.stone, (x0 + x1) / 2, (SH.top + W.roof) / 2 - 0.25, 0, 0, 0, ang);
  }
  // Broken columns on the terraces (cover, some to head height), fallen drums (vaulted), cargo pods
  // from the ship (upright canisters), giant roots over the outer terrace and round the plaza.
  for (const [x, z, r, hh, y] of [[14, 10.2, 0.5, 1.6, T1.y], [-4.6, 11.0, 0.45, 1.1, T1.y], [5.2, 13.8, 0.45, 2.3, T1.y], [-10.4, 6.4, 0.45, 1.0, T2.y], [9.5, 5.8, 0.45, 2.4, T2.y]] as const) {
    for (const sz of [1, -1]) {
      const c = cyl(x, sz * z, r, y - 0.05, hh, m.stone, 'concrete', 12);
      c.vault = hh <= 1.05;
      taken.push([x, sz * z, r + 0.4]);
    }
  }
  const pod = (x: number, z: number, yIn: number, tall: boolean) => {
    for (const sz of [1, -1]) {
      const y = yIn || Math.max(crashHeight(x - 0.75, sz * z), crashHeight(x + 0.75, sz * z), crashHeight(x, sz * z - 0.75), crashHeight(x, sz * z + 0.75));
      const c = cyl(x, sz * z, 0.75, y - 0.05, tall ? 1.7 : 1.0, m.hull, 'metal', 14);
      c.vault = !tall;
      deco(x - 0.78, y + (tall ? 1.2 : 0.6), sz * z - 0.06, x + 0.78, y + (tall ? 1.3 : 0.7), sz * z + 0.06, m.cyan, 1);
      taken.push([x, sz * z, 1.2]);
    }
  };
  pod(-3.5, 24.5, 0, false);
  pod(13.4, 13.9, T1.y, true);
  pod(-6.6, 22.5, 0, true);
  pod(4.2, 21.5, 0, false);
  pod(18.5, 12, 0, false);
  pod(-23, 9, 0, true);
  // Roots: long horizontal trunks lying along x or z (a box collider, the root drawn round it).
  const root = (x0: number, z0: number, x1: number, z1: number, yIn: number, r: number) => {
    for (const sz of [1, -1]) {
      const za = sz > 0 ? z0 : -z1, zb = sz > 0 ? z1 : -z0;
      // On the ground: from under its lowest corner to its height over the highest (the plaza's hummocks).
      const ys = yIn ? [yIn] : [crashHeight(x0, za), crashHeight(x1, za), crashHeight(x0, zb), crashHeight(x1, zb)];
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const c = solid(x0, lo - 0.2, za, x1, hi + 2 * r - 0.1, zb, m.bark, 'wood', 1);
      c.vault = hi + 2 * r - 0.1 - lo <= 1.05;
    }
  };
  root(-14.8, 12, -12.2, 12.8, T1.y, 0.4);
  root(12.2, 11.2, 14.8, 12, T1.y, 0.4);
  root(-27, 15.4, -21.5, 16.3, 0, 0.45);
  root(19, 19.5, 20, 26, 0, 0.45);
  root(-8, 27.6, -1.5, 28.5, 0, 0.45);
  // Vines over the shrine and the terraces' faces (drawn on them).
  for (const [x0, x1, z] of [[-15.5, -12, T1.zOut], [4, 8, T1.zOut]] as const) {
    for (const sz of [1, -1]) deco(x0, 0.2, sz > 0 ? z : -z - 0.04, x1, T1.y - 0.1, sz > 0 ? z + 0.04 : -z, m.tarp, 1);
  }
  // Warning beacons on the hull (glow and a weak red light each), the cockpit's cyan.
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
  beacon(W.x0 + 1.5, W.roof + 2.7, W.z - 0.15);
  beacon(W.x1 - 0.5, W.roof + 0.15, 0);
  clear(-21, -T1.zOut - 5, 18, T1.zOut + 5);

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
  // start there) and the shrine's stair feet (trunks boxed in nav nodes there: levelAI).
  clear(RIDGE.x1, 0, RIDGE.x1 + 7.5, COURT);
  clear(SHRINE.stair.x0 - 2, SHRINE.stair.foot - 1, SHRINE.stair.x1 + 2, SHRINE.stair.foot + 4);
  clear(RIDGE.ramp.x0 - 2, RIDGE.z, RIDGE.ramp.x1 + 3, RIDGE.ramp.z1 + 2);

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
    !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + gap) && !col.blocked(v(x, crashHeight(x, z), z), r + 0.5, 1);
  const trees: TreeInfo[] = [];
  const giant = (x: number, z: number, r: number) => {
    const R = r * 1.95;
    const ys = [crashHeight(x, z), crashHeight(x + R, z), crashHeight(x - R, z), crashHeight(x, z + R), crashHeight(x, z - R)];
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
    const y0 = crashHeight(x, z) - 0.3;
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
    const ys = [crashHeight(x - w / 2, z - d / 2), crashHeight(x + w / 2, z - d / 2), crashHeight(x - w / 2, z + d / 2), crashHeight(x + w / 2, z + d / 2)];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    solid(x - w / 2, lo - 0.3, z - d / 2, x + w / 2, hi + 1.1 + rnd() * 0.6, z + d / 2, rnd() < 0.5 ? m.moss : m.rock, 'concrete', 1.5);
    taken.push([x, z, Math.max(w, d) * 0.75]);
  });

  b.build(scene);
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
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.2 * 1.2) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  const G = (x: number, z: number) => N(x, crashHeight(x, z), z);
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
    // 19.0, the temple: the front stairs, the terrace stairs, the east stair up T2's end, the wings
    // (foot on T2, middle, roof edge), the hull's doors and breach (on T2 outside, on the deck inside),
    // the gate (open cut, under the bridge), the shrine's flank stairs, a drop off the roof onto T2.
    for (const x of [-9, 9]) chain(G(x, Z(T1.zOut + 5.2)), N(x, T1.y / 2, Z(T1.zOut + 2.25)), N(x, T1.y, Z(T1.zOut - 1)));
    for (const x of [-9.25, 9.25]) chain(N(x, T1.y, Z(T2.zOut + 5.3)), N(x, (T1.y + T2.y) / 2, Z(T2.zOut + 2.25)), N(x, T2.y, Z(T2.zOut - 0.9)));
    chain(G(T2.x1 + 6.6, Z(6.25)), N(T2.x1 + 2.8, T2.y / 2, Z(6.25)), N(T2.x1 - 0.9, T2.y, Z(6.25)));
    const wx = (W.wing.x0 + W.wing.x1) / 2;
    chain(N(wx, T2.y + 0.2, Z(W.wing.z1 - 0.6)), N(wx, (T2.y + W.roof) / 2, Z((W.z + W.wing.z1) / 2)), N(wx, W.roof, Z(W.z - 0.6)));
    for (const x of [...W.doors, 0]) chain(N(x, T2.y, Z(W.z + 1.4)), N(x, W.floor, Z(W.z - 1.2)));
    for (const z of [3.8, 6, 8.2, 10.5, 13, 15.6]) G(0, Z(z));
    chain(G(-18.8, Z(SHRINE.stair.foot + 1.2)), N(-18.8, SHRINE.top / 2, Z((SHRINE.z + SHRINE.stair.foot) / 2)), N(-18.8, SHRINE.top, Z(SHRINE.z - 0.9)));
    drops.push([N(-5.5, W.roof, Z(W.z - 0.5)), N(-5.5, T2.y, Z(W.z + 1.6))]);
    // The wings' feet from the terrace either side (their edge plates stop the automatic links).
    for (const x of [W.wing.x0 - 0.9, W.wing.x1 + 1.1]) links.push([N(x, T2.y, Z(W.wing.z1 - 0.45)), N(wx, T2.y + 0.2, Z(W.wing.z1 - 0.6))]);
    // The shrine's plinth (T1's level) from T1's west end.
    chain(N(-14.4, T1.y, Z(10.4)), N(-15, T1.y, Z(7.4)), N(-15, T1.y, Z(5)));
    drops.push([N(T1.x0 + 0.6, T1.y, Z(13.8)), G(T1.x0 - 0.8, Z(13.8))]);
    // Terrace 1's inner areas (between the terrace stairs' cheeks and the gate; the east end beyond them)
    // from the strip in front of the terrace stairs.
    chain(N(-9, T1.y, Z(14.3)), N(-6.4, T1.y, Z(14.3)), N(-4, T1.y, Z(13.2)), N(-3.2, T1.y, Z(10.2)));
    chain(N(9, T1.y, Z(14.3)), N(6.6, T1.y, Z(14.5)), N(4, T1.y, Z(12.4)), N(3.4, T1.y, Z(10)));
    chain(N(9, T1.y, Z(14.3)), N(11.8, T1.y, Z(14.2)), N(12.6, T1.y, Z(12.6)), N(15.4, T1.y, Z(12.6)), N(15.4, T1.y, Z(10.2)));
    // The ravine: down its end ramps; the drops off the rims.
    chain(N(28.5, 0, Z(RAVINE.end + 1.5)), N(28.5, ravineFloor(Z(45.5)), Z(45.5)), N(28.5, RAVINE.floor, Z(RAVINE.z - 1)));
    for (const z of [12, 30]) {
      drops.push([N(RAVINE.x0 - 0.75, RAVINE.rimTop, Z(z)), N(RAVINE.x0 + 1.6, RAVINE.floor, Z(z))]);
      drops.push([N(RAVINE.x1 + 0.75, RAVINE.rimTop, Z(z)), N(RAVINE.x1 - 1.6, RAVINE.floor, Z(z))]);
    }
  }
  // The fallen tree onto the ridge, the bridges over the ravine (deck 0.45).
  chain(G(RIDGE.x1 + 7.3, 0), N(RIDGE.x1 + 3.3, RT / 2, 0), N(RIDGE.x1 - 1.2, RT, 0));
  for (const z of BRIDGES) chain(G(RAVINE.x0 - RAVINE.rim - 2.2, z), N(RAVINE.x0 + 1.5, STEP, z), N(RAVINE.x1 - 1.5, STEP, z), G(RAVINE.x1 + RAVINE.rim + 2.2, z));
  // The hull (round the hole in its deck), its roof, the drops through the hole and off the open tail,
  // the fallen lintel up to the shrine, the undercroft under it all.
  for (const x of [-8.3, -6, -4, -2.2, 2.2, 4, 6, 8.3]) for (const z of [-1.5, 0, 1.5]) if (open(x, W.floor, z)) N(x, W.floor, z);
  for (const x of [-9, -6.5, -4, 3.5, 6, 8.5]) for (const z of [-1.6, 0, 1.6]) if (open(x, W.roof, z)) N(x, W.roof, z);
  for (const x of [-2.2, 2.2]) drops.push([N(x, W.floor, 0), N(0, 0, 0)]);
  drops.push([N(W.x0 + 0.9, W.floor, 0), N(W.x0 - 1.6, 0, 0)]);
  chain(N(SHRINE.x1 - 0.8, SHRINE.top, 0), N((SHRINE.x1 + W.x0) / 2, (SHRINE.top + W.roof) / 2, 0), N(W.x0 + 1, W.roof, 0));
  for (let x = -11.6; x <= 11.6; x += 2.4) for (const z of [-1.6, 0, 1.6]) if (open(x, 0, z)) N(x, 0, z);
  // The terraces and the shrine's top.
  for (const sz of [1, -1]) {
    for (let x = -15; x <= 15; x += 2) for (let z = T1.zIn + 0.8; z < T1.zOut - 0.4; z += 1.6) if (Math.abs(x) > GATE + 0.7 && open(x, T1.y, sz * z)) N(x, T1.y, sz * z);
    for (let x = -11; x <= 11; x += 2) for (let z = T2.zIn + 0.9; z < T2.zOut - 0.4; z += 1.6) if ((x < W.wing.x0 - 0.5 || x > W.wing.x1 + 0.5) && open(x, T2.y, sz * z)) N(x, T2.y, sz * z);
  }
  for (let x = SHRINE.x0 + 0.6; x < SHRINE.x1 - 0.4; x += 1.4) for (let z = -SHRINE.z + 0.6; z < SHRINE.z - 0.4; z += 1.4) if (open(x, SHRINE.top, z)) N(x, SHRINE.top, z);
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Lattices: the ground (4 m), the ridge top (4 m), the ravine floor (3 m along it).
  for (let x = -X_OUT + 2; x <= X_OUT - 2; x += 4) {
    for (let z = -Z_END + 2; z <= Z_END - 2; z += 4) {
      if (x > RAVINE.x0 - RAVINE.rim - 0.5 && x < RAVINE.x1 + RAVINE.rim + 0.5 && Math.abs(z) < RAVINE.end + 0.5) continue;
      if (x < RIDGE.x1 + 0.5 && Math.abs(z) < RIDGE.ramp.z1 + 0.5) continue;
      const y = crashHeight(x, z);
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
    v(-39, RT, 0), v(-39, RT, 28), v(-32, RT, -22), v(-6, W.roof, 0), v(-6, W.floor, 0), v(6, W.floor, 0),
    v(0, 0, 0), v(-8, 0, -1.5), v(0, 0, 12), v(-12.5, T1.y, 13.8), v(12, T1.y, -13.6), v(-6, T2.y, 6), v(9, T2.y, -5), v(-16, SHRINE.top, 2.5), v(4.5, W.roof, -1.5),
    v(28.5, RAVINE.floor, 0), v(28.5, RAVINE.floor, -30), v(40, crashHeight(40, 10), 10), v(-12, crashHeight(-12, 23), 23),
    v(11, crashHeight(11, -22), -22), v(0, 0, 48), v(-26, crashHeight(-26, -10), -10),
  ];

  // ---------------------------------------------------------------- the undergrowth's site
  const site: FoliageSite = {
    height: crashHeight,
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
    interiors: [{ name: 'THE WRECK', jp: 'ซากเครื่องบิน', x0: W.x0, z0: -W.z, x1: W.x1, z1: W.z, y0: 0, h: W.roof - 0.3 }],
    terrain,
    laneProblems,
    update() {},
  };
}
