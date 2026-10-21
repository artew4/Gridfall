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
  BASE, BRIDGES, COURT, RAVINE, RIDGE, STEP, TRENCHES, WRECK, X_OUT, Z_END, crashHeight, lanesOf, ravineFloor, spawnsOf, trenchDist, zoneAt,
} from './CrashLayout';
import type { Zone } from '../Level';

/*
  Builds Jungle: Crash Site (plan and the heightfield rules in CrashLayout.ts). The 3.3 rules hold:
  every box is drawn and collided with the same bounds; stairs are visible steps over a ramp; gaps are
  under 0.3 m or over 1 m; low cover ≤ 1.05 m is flagged `vault`; the boundary (rock cliffs, 10 m and
  up) is out of reach from the highest floor (the wreck's roof, 3.9 m).
*/

export interface CrashResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
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
    for (const side of rails) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n;
        if (H * k1 < 0.5) continue;
        const hi = base + H * k1 + 1.0;
        const lo0 = rise > 0 ? (along ? x0 : z0) + L * k0 : (along ? x1 : z1) - L * k1;
        const lo1 = lo0 + L * (k1 - k0);
        const t = 0.3;
        if (along) {
          const f = side === 'lo' ? z0 : z1 - t;
          solid(lo0, base, f, lo1, hi, f + t, m.rock, 'concrete', 1);
        } else {
          const f = side === 'lo' ? x0 : x1 - t;
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
  // The fallen tree at mid-field: a trunk leaning from the clearing onto the plateau (a ramp).
  {
    const x0 = RIDGE.x1, x1 = RIDGE.x1 + 9;
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

  // ---------------------------------------------------------------- the wreck (centre)
  // A dropship's hull lying across the middle: a deck (0.4), walls with a breach and two side doors
  // each side, a roof (3.9) broken over the breach; the cockpit east, the open tail west; a broken
  // wing each side as a ramp from the clearing up onto the roof.
  const W = WRECK;
  solid(W.x0, -0.3, -W.z, W.x1, W.floor, W.z, m.hullDark, 'metal', 2);
  const hullWall = (z0: number, z1: number) => {
    const piece = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 - x0 > 0.01 && y1 - y0 > 0.01) solid(x0, y0, z0, x1, y1, z1, m.hull, 'metal', 3);
    };
    const R0 = W.floor, R1 = W.roof - 0.3;
    // Openings: side doors at x ±7.8 (1.6 m, 2.2 m high), the breach x ±2 (full height).
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
  solid(W.x0, W.roof - 0.3, -W.z, -2, W.roof, W.z, m.hull, 'metal', 3);
  solid(2, W.roof - 0.3, -W.z, W.x1, W.roof, W.z, m.hull, 'metal', 3);
  // The cockpit: a solid nose, its canopy glowing faintly.
  solid(W.x1, 0, -2.4, W.x1 + 3.5, 2.8, 2.4, m.hull, 'metal', 2);
  {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 3.6), m.cyan);
    glass.position.set(W.x1 + 1.6, 2.83, 0);
    scene.add(glass);
  }
  // Tail fin (over the roof, out of reach).
  solid(W.x0, W.roof, -0.15, W.x0 + 2, W.roof + 2.6, 0.15, m.hullDark, 'metal', 1);
  // Inside: two cargo crates (vault) and a fallen locker.
  solid(-6.6, W.floor, -0.6, -5.4, W.floor + 1.0, 0.6, m.plank, 'wood', 1).vault = true;
  solid(4.4, W.floor, -W.z + 0.3, 5.6, W.floor + 1.0, -W.z + 1.3, m.plank, 'wood', 1).vault = true;
  solid(4.4, W.floor, W.z - 1.3, 5.6, W.floor + 1.0, W.z - 0.3, m.plank, 'wood', 1).vault = true;
  // The wings: ramps from the clearing up to the roof's edge, a tilted plate drawn over each.
  {
    const run = W.wing.z1 - W.z;
    const ang = Math.atan2(W.roof, run), len = Math.hypot(run, W.roof);
    for (const s of [1, -1]) {
      const z0 = s > 0 ? W.z : -W.wing.z1, z1 = s > 0 ? W.wing.z1 : -W.z;
      col.addRamp(W.wing.x0, z0, W.wing.x1, z1, 'z', s > 0 ? W.roof : 0, s > 0 ? 0 : W.roof);
      const plate = new THREE.BoxGeometry(W.wing.x1 - W.wing.x0, 0.16, len);
      b.add(plate, m.hull, (W.wing.x0 + W.wing.x1) / 2, W.roof / 2 - 0.08, s * (W.z + run / 2), s * ang, 0, 0);
      plate.dispose();
      // Filled underneath (nobody walks under a wing, and rounds stop at it).
      for (let i = 1; i < 8; i++) {
        const h = (W.roof * (8 - i)) / 8;
        const a = W.z + (run * (i - 1)) / 8, c = W.z + (run * i) / 8;
        const f = col.add(W.wing.x0, -0.2, s > 0 ? a : -c, W.wing.x1, h, s > 0 ? c : -a, 'metal');
        f.floor = false;
      }
    }
  }
  // The engines, torn off beside the hull (cover), scorch marks.
  for (const [x, z] of [[-12.5, 6.5], [10.5, 6.8]] as const) {
    for (const s of [1, -1]) {
      b.add(new THREE.CylinderGeometry(1.1, 1.25, 2.4, 14), m.hullDark, x, 1.2, z * s);
      col.addCylinder(x, z * s, 1.25, -0.2, 2.4, 'metal');
      taken.push([x, z * s, 1.6]);
    }
  }
  // Debris panels round the wreck (low cover).
  for (const [x0, z0, x1, z1] of [[-15, 4, -12.5, 4.6], [12.5, 7, 15, 7.6], [-3, 13, 0, 13.6], [16, 2, 16.6, 4.5]] as const) ground2(x0, z0, x1, z1, 0.9, m.hullDark, 'metal');
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
  beacon(W.x0 + 1, W.roof + 2.7, 0);
  beacon(W.x1 - 0.5, W.roof + 0.15, 0);
  clear(-16, -12, 16, 12);

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

  // ---------------------------------------------------------------- trees, logs, boulders
  const forestAt = (x: number, z: number) => {
    if (keepClear.some(([a0, b0, a1, b1]) => x > a0 && x < a1 && z > b0 && z < b1)) return 0;
    const td = trenchDist(x, z);
    const trench = THREE.MathUtils.smoothstep(td, 3, 9);
    const wreck = THREE.MathUtils.smoothstep(Math.hypot(x / 1.3, z), 16, 24);
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
  place(9, 0.5, 0.8, 1.3, 3.5, giant);
  place(26, 0.35, 0.26, 0.45, 1.6, slim);
  // Mossy boulders (cover in the clearing's edges and the east bank).
  place(12, 0.25, 0.7, 1.1, 1.8, (x, z, r) => {
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
    // The wreck: the wings (foot, middle, roof edge), the doors (both sides), inside.
    const wx = (W.wing.x0 + W.wing.x1) / 2;
    chain(G(wx, Z(W.wing.z1 + 1.2)), N(wx, W.roof / 2, Z((W.z + W.wing.z1) / 2)), N(wx, W.roof, Z(W.z - 0.6)));
    for (const x of [...W.doors, 0]) {
      G(x, Z(W.z + 1.4));
      N(x, W.floor, Z(W.z - 1.2));
    }
    // The ravine: down its end ramps; the drops off the rims.
    chain(N(28.5, 0, Z(RAVINE.end + 1.5)), N(28.5, ravineFloor(Z(45.5)), Z(45.5)), N(28.5, RAVINE.floor, Z(RAVINE.z - 1)));
    for (const z of [12, 30]) {
      drops.push([N(RAVINE.x0 - 0.75, RAVINE.rimTop, Z(z)), N(RAVINE.x0 + 1.6, RAVINE.floor, Z(z))]);
      drops.push([N(RAVINE.x1 + 0.75, RAVINE.rimTop, Z(z)), N(RAVINE.x1 - 1.6, RAVINE.floor, Z(z))]);
    }
  }
  // The fallen tree onto the ridge, the bridges over the ravine (deck 0.45).
  chain(G(RIDGE.x1 + 9.8, 0), N(RIDGE.x1 + 4.5, RT / 2, 0), N(RIDGE.x1 - 1.2, RT, 0));
  for (const z of BRIDGES) chain(G(RAVINE.x0 - RAVINE.rim - 2.2, z), N(RAVINE.x0 + 1.5, STEP, z), N(RAVINE.x1 - 1.5, STEP, z), G(RAVINE.x1 + RAVINE.rim + 2.2, z));
  for (const x of [-8, -4, 0, 4, 8]) N(x, W.floor, 0);
  for (const x of [-7, -4.5, 4.5, 8]) N(x, W.roof, 0);
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
    v(-39, RT, 0), v(-39, RT, 28), v(-32, RT, -22), v(0, W.roof, 0), v(-6, W.floor, 0), v(6, W.floor, 0),
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
  };

  return {
    nav: { nodes, links, drops, slope: 0.18 },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    coverPoints: [],
    testGoals,
    zoneAt,
    trees,
    keepClear,
    site,
    interiors: [{ name: 'THE WRECK', jp: '墜落船', x0: W.x0, z0: -W.z, x1: W.x1, z1: W.z, y0: 0, h: W.roof - 0.3 }],
    terrain,
    laneProblems,
    update() {},
  };
}
