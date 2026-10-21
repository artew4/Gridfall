import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import type { Glow, Glows } from '../../world/Glows';
import type { BuildCtx, Mats } from '../../world/City';
import { addSign, type SignSpec } from '../../world/Signs';
import { applyWet } from '../../world/Ground';
import { STAIR_GAP, fitStairWidth } from '../../world/StairFit';
import type { RainAreas } from '../../world/Rain';
import { asphaltTexture, concreteTexture, facadeTexture, grilleTexture, lanternTexture, pavingTexture, perforatedTexture, shutterTexture, storefrontTexture, vendingTexture } from '../../world/Textures';
import { BASE, BE, BW, COURT, CROSS, FOOT, MID, PLANK, SKY, TOP, X_OUT, Z_END, lanesOf, mz, spawnsOf, zoneAt } from './NeonBlockLayout';
import type { Zone } from '../Level';

/*
  Builds Tokyo: Neon Block (plan and reasoning in NeonBlockLayout.ts). The 3.3 rules hold:
   - every box is drawn and collided with the same bounds (StaticBuilder + col.add);
   - stairs are visible steps over a smooth ramp, stepped fill underneath, plated sides, fitted clear
     of walls (StairFit);
   - the boundary is 14 m buildings on every side: the highest floor a body reaches is a roof at 7.2 m
     (plus a 1 m prop and a jump), so nothing is climbed out of;
   - gaps are under 0.3 m or over 1 m; low cover that may be vaulted (≤ 1.05 m) is flagged `vault`;
   - roof parapets are 1.1 m (1.4 m over the forecourts) with gaps only where the plan says: the
     stairs' tops, the bridges, and the drop-downs.
  14.0: the street furniture that repeats (vending machines, AC units, lanterns, bins) is drawn with
  InstancedMesh, one draw call per part however many there are.
*/

export interface NeonBlockResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  coverPoints: THREE.Vector3[];
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  rain: RainAreas;
  catcherPicks: [number, number, number][];
  /** The arcades (covered, shaded viewmodel, muffled rain). */
  covered: { x0: number; z0: number; x1: number; z1: number; h: number }[];
  /** Lane waypoints or nav nodes found on blocked floor when built (must be empty). */
  laneProblems: string[];
  /** Instanced prop meshes and their instance counts (DEV report). */
  instanced: { name: string; count: number }[];
  /** Point lights placed (the GPU budget). */
  lights: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Repeated props: one InstancedMesh per (geometry, material), filled while the level is authored. */
class Instancer {
  private sets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[] }>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, s = 1) {
    let set = this.sets.get(name);
    if (!set) this.sets.set(name, (set = { geo, mat, m: [] }));
    set.m.push(new THREE.Matrix4().compose(v(x, y, z), this.q.setFromEuler(this.e.set(0, ry, 0)), v(s, s, s)));
  }
  build(scene: THREE.Scene) {
    const out: { name: string; count: number }[] = [];
    for (const [name, s] of this.sets) {
      const mesh = new THREE.InstancedMesh(s.geo, s.mat, s.m.length);
      s.m.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `instanced:${name}`;
      scene.add(mesh);
      out.push({ name, count: s.m.length });
    }
    return out;
  }
}

export function buildNeonBlock(scene: THREE.Scene, col: CollisionWorld, glows: Glows, time: { value: number }, fog: THREE.FogExp2): NeonBlockResult {
  const b = new StaticBuilder();
  const inst = new Instancer();
  /** Point lights placed (counted by mast() and lamp()). */
  let lights = 0;
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.8, metal = 0, env = 0.6) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const hdr = (r: number, g: number, bl: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bl) });

  // ---------------------------------------------------------------- materials
  const asphalt = std(asphaltTexture(), 0xffffff, 0.62, 0, 1.25);
  applyWet(asphalt, time, { puddles: true, wet: 0.9 });
  const alleyFloor = std(concreteTexture(), 0x7c7a80, 0.6, 0, 1.0);
  applyWet(alleyFloor, time, { puddles: true, wet: 0.85 });
  const paving = std(pavingTexture(), 0xffffff, 0.5, 0, 1.2);
  applyWet(paving, time, { puddles: true, wet: 0.85 });
  const roofDeck = std(concreteTexture(), 0x55545a, 0.7, 0, 0.8);
  applyWet(roofDeck, time, { puddles: true, wet: 0.7 });
  // Facades: Tokyo's window tiles, the lit windows dimmer than the story district's (1.6): a bright
  // window wall behind a fighter is a silhouette nobody can read.
  const facade = [0, 1, 2].map((k) => {
    const t = facadeTexture(k);
    return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.85, roughness: 0.8, envMapIntensity: 0.5 });
  });
  const store = (['shop', 'izakaya', 'shutter'] as const).map((k) => {
    const t = storefrontTexture(k);
    return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: t.emissive ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: k === 'izakaya' ? 0.9 : 0.6, roughness: 0.6 });
  });
  const m = {
    concrete: std(concreteTexture(), 0x8a8a90, 0.85, 0, 0.5),
    steel: std(null, 0x2a2d33, 0.45, 0.7, 0.8),
    deck: std(perforatedTexture(), 0x8c9298, 0.55, 0.6, 0.7),
    rail: std(null, 0x3a3e46, 0.4, 0.6, 0.8),
    shutter: std(shutterTexture(), 0xffffff, 0.5, 0.5, 0.6),
    van: std(null, 0xd8dbe0, 0.35, 0.3, 1.0),
    taxi: std(null, 0x1b2a4a, 0.3, 0.4, 1.1),
    wood: std(null, 0x5a3a22, 0.75, 0, 0.4),
    planter: std(concreteTexture(), 0x6c6a66, 0.85, 0, 0.5),
    tank: std(null, 0x6b6e76, 0.45, 0.35, 0.7),
    dumpster: std(null, 0x2c4a3a, 0.45, 0.5, 1.0),
    warm: hdr(5.5, 4.2, 2.4),
    cold: hdr(3.8, 4.6, 5.4),
    alphaLamp: hdr(1.6, 3.4, 6.0),
    omegaLamp: hdr(6.0, 1.2, 1.0),
    strip: hdr(2.2, 2.6, 3.0),
  };

  // ---------------------------------------------------------------- helpers
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** South half and its mirror. */
  const solid2 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 2) => [
    solid(x0, y0, z0, x1, y1, z1, mat, surface, tile),
    solid(x0, y0, -z1, x1, y1, -z0, mat, surface, tile),
  ];
  const vault2 = (x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', y0 = 0) => {
    for (const c of solid2(x0, y0, z0, x1, y0 + h, z1, mat, surface, 1)) c.vault = h <= 1.05;
  };
  const cyl2 = (x: number, z: number, r: number, y0: number, h: number, mat: THREE.Material, surface: Collider['surface'] = 'metal') => {
    for (const s of [1, -1]) {
      b.add(new THREE.CylinderGeometry(r, r, h, 14), mat, x, y0 + h / 2, z * s);
      col.addCylinder(x, z * s, r, y0, y0 + h, surface);
    }
  };
  /** A rail or parapet plate (not vaultable: what's behind it is a fall). */
  const plate2 = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material = m.rail) => solid2(x0, y, z0, x1, y + h, z1, mat, 'metal', 1);
  /**
   * An edge of plates along x (z ∈ [c0, c1]) or along z (x ∈ [c0, c1]) from a0 to a1 at floor y,
   * `h` tall, broken by `gaps` ([from, to] along the edge). South half and mirror.
   */
  const edge2 = (alongX: boolean, a0: number, a1: number, c0: number, c1: number, y: number, h: number, gaps: [number, number][], mat: THREE.Material) => {
    let cur = a0;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      if (g0 - cur > 0.01) {
        if (alongX) plate2(cur, c0, g0, c1, y, h, mat);
        else plate2(c0, cur, c1, g0, y, h, mat);
      }
      cur = g1;
    }
    if (a1 - cur > 0.01) {
      if (alongX) plate2(cur, c0, a1, c1, y, h, mat);
      else plate2(c0, cur, c1, a1, y, h, mat);
    }
  };

  /** Stair: visible steps over a smooth ramp, fill underneath, plated sides (the docks' stair). */
  const stair = (sx0: number, sz0: number, sx1: number, sz1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    const fit = fitStairWidth(col.colliders, { x0: sx0, z0: sz0, x1: sx1, z1: sz1 }, axis, base, top);
    if (fit.blocked.length) console.warn('[neonblock stair] runs into a wall', [sx0, sz0, sx1, sz1]);
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
          solid(lo0, base, f, lo1, hi, f + t, m.rail, 'metal', 1);
        } else {
          const f = side === 'lo' ? x0 : x1 - t;
          solid(f, base, lo0, f + t, hi, lo1, m.rail, 'metal', 1);
        }
      }
    }
  };
  const stair2 = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', rise: 1 | -1, base: number, top: number, mat: THREE.Material, rails: ('lo' | 'hi')[] = []) => {
    stair(x0, z0, x1, z1, axis, rise, base, top, mat, rails);
    stair(x0, -z1, x1, -z0, axis, axis === 'z' ? (-rise as 1 | -1) : rise, base, top, mat, rails);
  };
  /** A walkable deck slab (top at `y`). */
  const deck2 = (x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material = m.deck) => solid2(x0, y - 0.25, z0, x1, y, z1, mat, 'metal', 1);
  /** A slim support post from the ground to `y`. */
  const post2 = (x: number, z: number, y: number) => solid2(x - 0.12, 0, z - 0.12, x + 0.12, y, z + 0.12, m.steel, 'metal', 1);

  // ---------------------------------------------------------------- ground
  const slab = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, tile = 4) => b.add(worldBox(x1 - x0, 0.2, z1 - z0, tile), mat, (x0 + x1) / 2, -0.1, (z0 + z1) / 2);
  slab(-X_OUT, -CROSS, X_OUT, CROSS, asphalt, 8);
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    let [z0, z1] = zr(CROSS, COURT);
    slab(BW.x1, z0, BE.x0, z1, asphalt, 8);
    slab(-X_OUT, z0, BW.x0, z1, alleyFloor);
    slab(BE.x1, z0, X_OUT, z1, alleyFloor);
    slab(BW.x0, Math.min(...zr(BW.arcade[0], BW.arcade[1])), BW.x1, Math.max(...zr(BW.arcade[0], BW.arcade[1])), paving);
    slab(BE.x0, Math.min(...zr(BE.gap[0], BE.gap[1])), BE.x1, Math.max(...zr(BE.gap[0], BE.gap[1])), alleyFloor);
    [z0, z1] = zr(COURT, Z_END);
    slab(-X_OUT, z0, X_OUT, z1, paving);
  }

  // ---------------------------------------------------------------- boundary: 14 m buildings all round
  const H_OUT = 14;
  solid(-X_OUT - 1, 0, -Z_END - 1, -X_OUT, H_OUT, Z_END + 1, facade[0], 'concrete', 16);
  solid(X_OUT, 0, -Z_END - 1, X_OUT + 1, H_OUT, Z_END + 1, facade[1], 'concrete', 16);
  solid2(-X_OUT, 0, Z_END, X_OUT, H_OUT, Z_END + 1, facade[2], 'concrete', 16);
  // The yards are flanked by buildings (no corners to hide in or climb out of).
  solid2(-X_OUT, 0, BASE.z0, BASE.x0, H_OUT, Z_END, facade[2], 'concrete', 16);
  solid2(BASE.x1, 0, BASE.z0, X_OUT, H_OUT, Z_END, facade[0], 'concrete', 16);

  // ---------------------------------------------------------------- spawn yards
  const exits = [-14, 0, 14];
  for (const s of [1, -1]) {
    const zr = (a: number, c: number): [number, number] => (s > 0 ? [a, c] : [-c, -a]);
    let cur = BASE.x0;
    const [w0, w1] = zr(BASE.z0, BASE.z0 + 0.6);
    for (const x of exits) {
      solid(cur, 0, w0, x - 2, 3.4, w1, m.concrete, 'concrete', 2);
      cur = x + 2;
    }
    solid(cur, 0, w0, BASE.x1, 3.4, w1, m.concrete, 'concrete', 2);
    // Blast walls in front of each exit: no line of fire into the yard.
    const [k0, k1] = zr(50.4, 51);
    for (const x of exits) solid(x - 3.5, 0, k0, x + 3.5, 2.6, k1, m.concrete, 'concrete', 1);
    // A shuttered shopfront on the back wall and the team mast.
    mast(0, mz(BASE.z1 - 0.8, s < 0), 9, s > 0 ? m.alphaLamp : m.omegaLamp, s > 0 ? 0x58a8ff : 0xff3a30, 260, 28);
  }

  // ---------------------------------------------------------------- Block W: two buildings, the arcade, one roof (TOP)
  const cap = TOP - 0.15;
  for (const [z0, z1] of [[CROSS, BW.arcade[0]], [BW.arcade[1], COURT]] as [number, number][]) {
    solid2(BW.x0, 0, z0, BW.x1, cap, z1, facade[z0 < 20 ? 1 : 0], 'concrete', 16);
  }
  // The arcade: open under a slab (ceiling 3.6), shops along both sides.
  solid2(BW.x0, 3.6, BW.arcade[0], BW.x1, cap, BW.arcade[1], m.concrete, 'concrete', 2);
  // The roof deck over all of it.
  solid2(BW.x0, cap, CROSS, BW.x1, TOP, COURT, roofDeck, 'concrete', 4);
  // Parapets (1.1 m; 1.4 m over the forecourt). Gaps: the skybridge (north), the fire escape's top
  // and the drop onto its landing (west), the street stair's top (east).
  const PT = 0.3;
  edge2(true, BW.x0, BW.x1, CROSS, CROSS + PT, TOP, 1.1, [[SKY.x0, SKY.x1]], m.concrete);
  edge2(true, BW.x0, BW.x1, COURT - PT, COURT, TOP, 1.4, [], m.concrete);
  edge2(false, CROSS + PT, COURT - PT, BW.x0, BW.x0 + PT, TOP, 1.1, [[19.2, 22.4], [29.6, 32.4]], m.concrete);
  edge2(false, CROSS + PT, COURT - PT, BW.x1 - PT, BW.x1, TOP, 1.1, [[22.6, 25.4]], m.concrete);
  // Roof cover: AC units, a water tank, skylights (vault them).
  for (const [x, z] of [[-17.5, 12.5], [-25, 17], [-17, 34], [-27, 26.5], [-20.5, 41]]) acBlock2(x, z, TOP);
  cyl2(-27.5, 40.5, 1.3, TOP, 2.6, m.tank);
  vault2(-23, 31, -21, 33, 0.6, m.deck, 'metal', TOP);
  vault2(-21, 20, -19, 22, 0.6, m.deck, 'metal', TOP);

  // Fire escape on the alley side (x = BW.x0): ground → landing (MID) → top landing (TOP) → roof.
  const FE = { x0: -33.6, x1: BW.x0 };
  stair2(FE.x0, 33, FE.x1 - 0.2, 42, 'z', -1, 0, MID, m.steel, ['lo']);
  deck2(FE.x0, 28.5, FE.x1, 33, MID);
  stair2(FE.x0, 22.5, FE.x1 - 0.2, 28.5, 'z', -1, MID, TOP, m.steel, ['lo']);
  deck2(FE.x0, 19.2, FE.x1, 22.5, TOP);
  // Landing rail with the drop gap (z 28.6–31.6), the top landing railed on both open sides.
  plate2(FE.x0, 31.6, FE.x0 + 0.08, 33, MID, 1.05);
  plate2(FE.x0, 19.2, FE.x0 + 0.08, 22.5, TOP, 1.05);
  plate2(FE.x0, 19.2, FE.x1, 19.28, TOP, 1.05);
  for (const z of [19.4, 22.3, 28.7, 32.8]) post2(FE.x0 + 0.15, z, z < 25 ? TOP - 0.25 : MID - 0.25);

  // Street side: a landing at MID (the footbridge's west arm lands here) and a stair up to the roof.
  const WL = { x0: BW.x1, x1: -10.4 };
  deck2(WL.x0, 12, WL.x1, 17, MID);
  stair2(WL.x0 + 0.05, 17, WL.x1, 22.5, 'z', 1, MID, TOP, m.steel, ['hi']);
  deck2(WL.x0, 22.5, WL.x1, 25.5, TOP);
  plate2(WL.x1 - 0.08, 12, WL.x1, FOOT.arm[0], MID, 1.05);
  plate2(WL.x1 - 0.08, FOOT.arm[1], WL.x1, 17, MID, 1.05);
  plate2(WL.x0, 11.92, WL.x1, 12, MID, 1.05);
  plate2(WL.x1 - 0.08, 22.5, WL.x1, 25.5, TOP, 1.05);
  plate2(WL.x0, 25.5, WL.x1, 25.58, TOP, 1.05);
  for (const z of [12.2, 16.8]) post2(WL.x1 - 0.2, z, MID - 0.25);
  post2(WL.x1 - 0.2, 25.3, TOP - 0.25);

  // ---------------------------------------------------------------- the footbridge (MID) and its stairs
  solid(FOOT.x0, MID - 0.25, -FOOT.end, FOOT.x1, MID, FOOT.end, m.deck, 'metal', 1);
  stair2(FOOT.x0, FOOT.end, FOOT.x1, 25, 'z', -1, 0, MID, m.steel, ['lo', 'hi']);
  deck2(WL.x1, FOOT.arm[0], FOOT.x0, FOOT.arm[1], MID);
  deck2(FOOT.x1, FOOT.arm[0], BE.x0, FOOT.arm[1], MID);
  // Rails: along the deck (broken at the arms), along both sides of each arm.
  for (const x of [FOOT.x0, FOOT.x1 - 0.08]) solid(x, MID, -FOOT.arm[0], x + 0.08, MID + 1.05, FOOT.arm[0], m.rail, 'metal', 1);
  plate2(WL.x1, FOOT.arm[0], FOOT.x0, FOOT.arm[0] + 0.08, MID, 1.05);
  plate2(WL.x1, FOOT.arm[1] - 0.08, FOOT.x0, FOOT.arm[1], MID, 1.05);
  plate2(FOOT.x1, FOOT.arm[0], BE.x0, FOOT.arm[0] + 0.08, MID, 1.05);
  plate2(FOOT.x1, FOOT.arm[1] - 0.08, BE.x0, FOOT.arm[1], MID, 1.05);
  for (const z of [6.5]) {
    solid(-0.25, 0, z - 0.25, 0.25, MID - 0.25, z + 0.25, m.steel, 'metal', 1);
    solid(-0.25, 0, -z - 0.25, 0.25, MID - 0.25, -z + 0.25, m.steel, 'metal', 1);
  }
  post2(-6.2, 14.3, MID - 0.25);
  post2(7.5, 14.3, MID - 0.25);

  // ---------------------------------------------------------------- Block E: E1, the gap alley, E2 (roofs MID)
  const capE = MID - 0.15;
  solid2(BE.x0, 0, CROSS, BE.x1, capE, BE.gap[0], facade[2], 'concrete', 16);
  solid2(BE.x0, 0, BE.gap[1], BE.x1, capE, COURT, facade[1], 'concrete', 16);
  solid2(BE.x0, capE, CROSS, BE.x1, MID, BE.gap[0], roofDeck, 'concrete', 4);
  solid2(BE.x0, capE, BE.gap[1], BE.x1, MID, COURT, roofDeck, 'concrete', 4);
  const EH = 1.0;
  // E1: gaps for the footbridge arm (west), the plank bridge (north), the gap bridge and a drop into
  // the gap alley (south), a drop into the service alley (east).
  edge2(false, CROSS, BE.gap[0], BE.x0, BE.x0 + PT, MID, EH, [[FOOT.arm[0], FOOT.arm[1]]], m.concrete);
  edge2(true, BE.x0 + PT, BE.x1, CROSS, CROSS + PT, MID, EH, [[PLANK.x0, PLANK.x1]], m.concrete);
  edge2(true, BE.x0 + PT, BE.x1, BE.gap[0] - PT, BE.gap[0], MID, EH, [[18, 22], [26, 28.4]], m.concrete);
  edge2(false, CROSS + PT, BE.gap[0] - PT, BE.x1 - PT, BE.x1, MID, EH, [[14, 16.4]], m.concrete);
  // E2: the gap bridge (north), the service-alley stair's top and a drop (east), a drop to the street (west).
  edge2(true, BE.x0, BE.x1, BE.gap[1], BE.gap[1] + PT, MID, EH, [[18, 22]], m.concrete);
  edge2(false, BE.gap[1] + PT, COURT, BE.x1 - PT, BE.x1, MID, EH, [[BE.gap[1] + PT, 32.4], [43, 45.4]], m.concrete);
  edge2(false, BE.gap[1] + PT, COURT, BE.x0, BE.x0 + PT, MID, EH, [[36, 38.4]], m.concrete);
  edge2(true, BE.x0 + PT, BE.x1 - PT, COURT - PT, COURT, MID, 1.4, [], m.concrete);
  // The gap bridge, roof to roof over the noodle stalls.
  deck2(18, BE.gap[0], 22, BE.gap[1], MID);
  plate2(18, BE.gap[0], 18.08, BE.gap[1], MID, 1.05);
  plate2(21.92, BE.gap[0], 22, BE.gap[1], MID, 1.05);
  // Service-alley stair up to E2 and its landing.
  stair2(BE.x1 + 0.05, 32.4, 32.65, 41.5, 'z', -1, 0, MID, m.steel, ['hi']);
  deck2(BE.x1, 30.4, 32.65, 32.4, MID, m.deck);
  plate2(32.57, 30.4, 32.65, 32.4, MID, 1.05);
  plate2(BE.x1, 30.32, 32.65, 30.4, MID, 1.05);
  post2(32.45, 30.6, MID - 0.25);
  // Roof cover on Block E.
  for (const [x, z] of [[17, 18.5], [26.5, 11.5], [16.5, 33], [16, 42], [26, 35.5]]) acBlock2(x, z, MID);
  cyl2(25.5, 42, 1.1, MID, 2.4, m.tank);
  vault2(20.5, 38, 22.5, 40, 0.6, m.deck, 'metal', MID);

  // ---------------------------------------------------------------- over the crossing: skybridge (TOP), plank (MID)
  solid(SKY.x0, TOP - 0.3, -CROSS, SKY.x1, TOP, CROSS, m.deck, 'metal', 1);
  for (const x of [SKY.x0, SKY.x1 - 0.08]) solid(x, TOP, -CROSS, x + 0.08, TOP + 1.1, CROSS, m.rail, 'metal', 1);
  solid(-22.35, 0, -0.35, -21.65, TOP - 0.3, 0.35, m.steel, 'metal', 1);
  // A glass-and-steel canopy over the skybridge (out of reach: 2.4 m over the deck on four posts).
  for (const x of [SKY.x0 + 0.2, SKY.x1 - 0.2]) for (const z of [-7.6, 7.6]) solid(x - 0.08, TOP + 1.1, z - 0.08, x + 0.08, TOP + 2.4, z + 0.08, m.steel, 'metal', 1);
  solid(SKY.x0, TOP + 2.4, -CROSS, SKY.x1, TOP + 2.55, CROSS, m.steel, 'metal', 1);
  solid(PLANK.x0, MID - 0.25, -CROSS, PLANK.x1, MID, CROSS, m.deck, 'metal', 1);
  for (const x of [PLANK.x0, PLANK.x1 - 0.08]) solid(x, MID, -CROSS, x + 0.08, MID + 1.05, CROSS, m.rail, 'metal', 1);
  solid(23.65, 0, -0.35, 24.35, MID - 0.25, 0.35, m.steel, 'metal', 1);

  // ---------------------------------------------------------------- street level cover
  // Main Street: a delivery van, planters, vending machines against Block W.
  solid2(5.5, 0, 30, 8, 2.3, 35.5, m.van, 'metal', 1);
  vault2(-6.5, 40, -3.5, 40.6, 0.9, m.planter);
  vault2(6, 22, 9, 22.6, 0.9, m.planter);
  for (const [z, theme] of [[32, 'red'], [33.1, 'white']] as const) vending2(BW.x1, z, 'e', theme);
  // Sightline breakers (14.0 bot matches: with nothing at eye height down its 92 m, Main Street took
  // 42–47% of all bot time and almost every kill; the roofs and the service alley sat empty). A box
  // truck west and a bus shelter east in each half, staggered with the van, and the police box at
  // the crossing: no standing line runs the street's length any more.
  solid2(-10, 0, 31, -7.5, 2.7, 38, m.van, 'metal', 1);
  solid2(9, 0, 18.4, 12.6, 2.6, 18.7, m.steel, 'metal', 1);
  solid2(9, 2.6, 17, 12.6, 2.75, 18.7, m.steel, 'metal', 1);
  vault2(9.2, 17.95, 12.4, 18.4, 0.45, m.wood, 'wood');
  // The koban (police box) under the footbridge: 3 m, clear of the deck's 4.25 m underside.
  solid(-6, 0, -3, 6, 3, 3, m.concrete, 'concrete', 2);
  // The crossing (authored once, it is its own mirror): a taxi, planters.
  solid(9, 0, -1.1, 13.4, 1.4, 1.1, m.taxi, 'metal', 1);
  for (const c of [solid(-10, 0, -0.4, -6, 0.9, 0.4, m.planter, 'concrete', 1), solid(-34, 0, -0.4, -31, 0.9, 0.4, m.planter, 'concrete', 1), solid(31, 0, -0.4, 34, 0.9, 0.4, m.planter, 'concrete', 1)]) c.vault = true;
  // Lantern Alley: vending machines on the boundary wall, a crate stack, a noodle cart.
  for (const [z, theme] of [[14, 'red'], [15.1, 'white'], [40, 'red']] as const) vending2(-X_OUT, z, 'e', theme);
  // Against the wall, and not vaultable: a vault over it would push a body into the wall (stress test).
  solid2(-X_OUT, 0, 25, -36.6, 1.0, 26.2, m.wood, 'wood', 1);
  solid2(-37.8, 0, 44, -36.2, 1.8, 45.6, m.wood, 'wood', 1);
  // The arcade: a vending machine, the shop fronts (decals on the walls).
  vending2(-28, BW.arcade[0], 's', 'white');
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const x = BW.x0 + 2.5 + i * 4.4;
      const g = new THREE.PlaneGeometry(4, 3.4);
      b.add(g, store[i % 3], x, 1.7, s * (BW.arcade[0] + 0.02), 0, s > 0 ? 0 : Math.PI, 0);
      b.add(g, store[(i + 1) % 3], x, 1.7, s * (BW.arcade[1] - 0.02), 0, s > 0 ? Math.PI : 0, 0);
    }
    // Light strips under the arcade ceiling.
    for (const x of [-27, -22, -17]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.2), m.strip);
      strip.position.set(x, 3.55, s * 26);
      scene.add(strip);
    }
  }
  // The koban's fronts (decals) and its red lamp.
  for (const s of [1, -1]) b.add(new THREE.PlaneGeometry(4, 2.6), store[2], 0, 1.3, s * 3.02, 0, s > 0 ? 0 : Math.PI, 0);
  {
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hdr(5, 0.4, 0.3));
    red.position.set(0, 3.2, 3.05);
    scene.add(red);
  }
  // Shutters on Block W's and Block E's street faces (decals).
  for (const s of [1, -1]) {
    for (const z of [10.5, 19.5, 30.5, 42]) b.add(new THREE.PlaneGeometry(4, 3.2), m.shutter, BW.x1 + 0.02, 1.6, s * z, 0, Math.PI / 2, 0);
    for (const z of [10.5, 19.5, 33.5, 42]) b.add(new THREE.PlaneGeometry(4, 3.2), store[z > 30 ? 0 : 1], BE.x0 - 0.02, 1.6, s * z, 0, -Math.PI / 2, 0);
  }
  // Noodle Gap: two stall counters against the buildings' walls (a 0.4–0.6 m slot behind one was
  // too narrow for a body: stepping off into it ended inside geometry), jumped onto, not vaulted.
  solid2(23, 0, 28.8, 27, 1.0, BE.gap[1], m.wood, 'wood', 1);
  solid2(14.5, 0, BE.gap[0], 17.5, 1.0, 23.2, m.wood, 'wood', 1);
  // Service Alley: dumpsters (vault), a crate stack, a planter.
  solid2(36.4, 0, 12, X_OUT, 1.0, 14.2, m.dumpster, 'metal', 1);
  solid2(36.4, 0, 36, X_OUT, 1.0, 38.2, m.dumpster, 'metal', 1);
  solid2(36, 0, 18, 37.8, 1.6, 19.8, m.wood, 'wood', 1);
  // Forecourts: planters (vault), a taxi, crates.
  vault2(-10, 48.6, -6, 49.2, 0.9, m.planter);
  vault2(6, 48.6, 10, 49.2, 0.9, m.planter);
  solid2(-30, 0, 47.8, -25.6, 1.4, 50, m.taxi, 'metal', 1);
  solid2(26, 0, 47.8, 28, 1.8, 49.8, m.wood, 'wood', 1);

  // ---------------------------------------------------------------- instanced street furniture
  // Vending machines (14.0: instanced bodies and fronts; colliders per machine).
  function vending2(x: number, z: number, face: 'e' | 'w' | 's' | 'n', theme: 'red' | 'white') {
    const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0, nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
    const along = nz !== 0;
    for (const s of [1, -1]) {
      const zz = z * s, fnz = nz * s;
      const cx = x + nx * 0.4, cz = zz + fnz * 0.4;
      const ry = face === 'e' ? Math.PI / 2 : face === 'w' ? -Math.PI / 2 : fnz > 0 ? 0 : Math.PI;
      inst.add(`vend-${theme}`, VEND_GEO, vendBody[theme], cx, 0.95, cz, along ? 0 : Math.PI / 2);
      inst.add(`vendFront-${theme}`, VEND_FRONT, vendFront[theme], x + nx * 0.81, 0.98, zz + fnz * 0.81, ry);
      if (along) col.addCentered(cx, 0.95, cz, 1.05, 1.9, 0.8, 'metal');
      else col.addCentered(cx, 0.95, cz, 0.8, 1.9, 1.05, 'metal');
    }
  }
  /** A rooftop AC block (1.4 × 1.0 × 1.1, cover you can vault). Instanced body and grille. */
  function acBlock2(x: number, z: number, y: number) {
    for (const s of [1, -1]) {
      inst.add('acRoof', AC_ROOF, acBody, x, y + 0.5, z * s);
      inst.add('acRoofGrille', AC_ROOF_FRONT, grille, x, y + 0.5, z * s + 0.56 * s, s > 0 ? 0 : Math.PI);
      const c = col.addCentered(x, y + 0.5, z * s, 1.4, 1.0, 1.1, 'metal');
      c.vault = true;
    }
  }
  // Wall AC units, high up the facades (out of reach: decoration, no collision).
  for (const s of [1, -1]) {
    for (let z = 10; z < 46; z += 3.7) {
      inst.add('acWall', AC_WALL, acBody, -X_OUT + 0.16, 5.2 + ((z * 7) % 3) * 2.4, z * s, Math.PI / 2);
      inst.add('acWall', AC_WALL, acBody, X_OUT - 0.16, 5.6 + ((z * 5) % 3) * 2.2, z * s, -Math.PI / 2);
    }
  }
  // Lanterns over Lantern Alley and Noodle Gap (instanced per paper).
  for (const s of [1, -1]) {
    for (let z = 10; z < 44; z += 2.6) inst.add(`lantern${Math.round(z) % 3}`, LANTERN, lanterns[Math.round(z) % 3], -36.4, 3.4 + Math.sin(z) * 0.15, z * s);
    for (let x = 23; x < 29.5; x += 1.6) inst.add(`lantern${Math.round(x) % 3}`, LANTERN, lanterns[Math.round(x) % 3], x, 3.0, 26 * s);
  }
  // Rubbish bags along the alleys' walls (low, decoration).
  for (const s of [1, -1]) for (const [x, z] of [[-37.5, 20], [-37.4, 33], [37.5, 26], [37.6, 41], [37.4, 9.5]]) inst.add('bag', BAG, bagMat, x, 0.28, z * s, z);

  // ---------------------------------------------------------------- light: competitive, not decorative
  // 14.0: lights go where people fight (lanes, stairs, roofs, landings), warm and even, none pointing
  // into a sightline. The neon is for identity and callouts (signs, halos, wet streaks), not for
  // seeing by. Every light is a real PointLight with physical decay (candela).
  function mast(x: number, z: number, h: number, head: THREE.MeshBasicMaterial, color: number, intensity: number, dist: number): Glow {
    b.add(new THREE.CylinderGeometry(0.16, 0.16, h, 10), m.steel, x, h / 2, z);
    col.addCylinder(x, z, 0.16, 0, h, 'metal');
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.55), head);
    lamp.position.set(x, h, z);
    scene.add(lamp);
    const pos = v(x, h - 0.3, z);
    const light = new THREE.PointLight(color, intensity, dist, 2);
    light.position.copy(pos);
    scene.add(light);
    lights++;
    const g = glows.add({ pos, color: new THREE.Color(color), radius: 12, base: 1.1, light, lightBase: intensity, haloSize: 3.5, haloStrength: 0.35, reflect: { width: 1.8, anchor: v(x, 0, z), length: 10, map: null } });
    g.materials.push({ mat: head, base: head.color.clone() });
    return g;
  }
  /**
   * A lamp (head, light, glow) at a point, held by `mount`: a pole up from its floor (`floorY`), a
   * bracket from a wall at x = wallX, or nothing (hung under a deck or a ceiling).
   */
  function lamp(x: number, y: number, z: number, head: THREE.MeshBasicMaterial, color: number, intensity: number, dist: number, floorY = 0, mount: { pole?: boolean; wallX?: number } = {}): Glow {
    if (mount.pole) {
      b.add(new THREE.CylinderGeometry(0.08, 0.08, y - floorY, 8), m.steel, x, (y + floorY) / 2, z);
      col.addCylinder(x, z, 0.08, floorY, y, 'metal');
    }
    if (mount.wallX !== undefined) {
      const x0 = Math.min(x, mount.wallX), x1 = Math.max(x, mount.wallX);
      // High over the alley: out of reach of every floor beside it (decoration, no collision).
      const arm = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 0.06), m.steel);
      arm.position.set((x0 + x1) / 2, y + 0.2, z);
      scene.add(arm);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), head);
    mesh.position.set(x, y + 0.08, z);
    scene.add(mesh);
    const light = new THREE.PointLight(color, intensity, dist, 2);
    light.position.set(x, y, z);
    scene.add(light);
    lights++;
    const g = glows.add({ pos: v(x, y, z), color: new THREE.Color(color), radius: 9, base: 1, light, lightBase: intensity, haloSize: 2.2, haloStrength: 0.3, mode: 'steady', reflect: { width: 1.2, anchor: v(x, floorY, z), length: 6, map: null } });
    g.materials.push({ mat: head, base: head.color.clone() });
    return g;
  }
  const picks: Glow[] = [];
  for (const s of [1, -1]) {
    // Main Street: four sodium-white street lamps on poles (the long lane, the stair feet).
    for (const z of [20, 42]) {
      // West poles stand clear of Block W's street landing and stair (x -13…-10.4).
      for (const x of [-8.8, 11.6]) {
        if (x > 0 && z === 42) continue;
        picks.push(mast(x, z * s, 7, m.warm, 0xffd2a0, 420, 30));
      }
    }
    // Lantern Alley: warm lamps over the alley floor under the fire escape.
    lamp(-35.8, 4.2, 18 * s, m.warm, 0xffb070, 220, 18, 0, { wallX: -X_OUT });
    lamp(-35.8, 4.2, 37 * s, m.warm, 0xffb070, 220, 18, 0, { wallX: -X_OUT });
    // Service Alley: cold work lights, three a half (two left the Noodle Gap's mouth dark: a body
    // there read as nothing at 20 m).
    for (const z of [12, 27, 42]) lamp(34.5, 5, z * s, m.cold, 0xd8e8ff, 220, 18, 0, { wallX: X_OUT });
    // The roofs: one flood each (W at TOP, E at MID), high enough not to glare.
    lamp(-22, TOP + 3.4, 37 * s, m.warm, 0xffd8b0, 380, 26, TOP, { pole: true });
    lamp(22, MID + 3.4, 44 * s, m.warm, 0xffd8b0, 320, 24, MID, { pole: true });
    // The arcades and the footbridge's arms.
    lamp(-22, 3.3, 26 * s, m.cold, 0xe0ecff, 140, 14);
    lamp(1.75, MID + 2.8, 15.3 * s, m.warm, 0xffd2a0, 200, 18, MID, { pole: true });
    // Forecourts.
    picks.push(mast(-20, 48 * s, 9, m.warm, 0xffc880, 520, 34));
  }
  // The crossing: under the skybridge and the plank bridge, and the middle of the street.
  lamp(-22, TOP - 0.6, 0, m.cold, 0xe0ecff, 260, 22);
  lamp(24, MID - 0.5, 0, m.warm, 0xffd2a0, 220, 20);
  picks.push(mast(-12, 0, 8, m.warm, 0xffd2a0, 420, 30));

  // Neon signs: identity and callouts. Colour per lane, not per team (callouts: "pink karaoke").
  const ctx: BuildCtx = { scene, builder: b, col, glows, time, mats: { darkMetal: m.steel } as unknown as Mats, fog };
  const signs: SignSpec[] = [
    { text: 'NEON BLOCK', color: '#ff2bd6', style: 'neon', vertical: false, mount: 'wall', face: 'w', wall: X_OUT, x: X_OUT - 0.12, y: 10.5, z: 0, size: 12, floorY: 0, light: 60, lightDist: 22 },
    { text: '第四街区', color: '#19e6ff', style: 'neon', vertical: false, mount: 'wall', face: 'e', wall: -X_OUT, x: -X_OUT + 0.12, y: 10.5, z: 0, size: 9, floorY: 0 },
    { text: '提灯横丁', color: '#ff7a18', style: 'neon', vertical: true, mount: 'wall', face: 'e', wall: -X_OUT, x: -X_OUT + 0.12, y: 8.5, z: 28, size: 5, floorY: 0 },
    { text: '居酒屋', color: '#ff3b3b', style: 'neon', vertical: true, mount: 'wall', face: 'e', wall: -X_OUT, x: -X_OUT + 0.12, y: 8.5, z: -28, size: 4.5, floorY: 0, mode: 'flicker' },
    { text: 'KARAOKE', color: '#ff2bd6', style: 'neon', vertical: false, mount: 'wall', face: 'e', wall: BW.x1, x: BW.x1 + 0.12, y: 5.6, z: 36, size: 6, floorY: 0 },
    { text: 'ゲーム', color: '#39ff88', style: 'neon', vertical: false, mount: 'wall', face: 'e', wall: BW.x1, x: BW.x1 + 0.12, y: 5.6, z: -36, size: 5, floorY: 0 },
    { text: 'RAMEN', color: '#ffb000', style: 'box', vertical: false, mount: 'wall', face: 'w', wall: BE.x0, x: BE.x0 - 0.12, y: 3.4, z: 26, size: 4, floorY: 0 },
    { text: 'ラーメン', color: '#ffb000', style: 'box', vertical: false, mount: 'wall', face: 'w', wall: BE.x0, x: BE.x0 - 0.12, y: 3.4, z: -26, size: 4, floorY: 0 },
    { text: 'PACHINKO', color: '#ffe14a', style: 'neon', vertical: false, mount: 'wall', face: 'w', wall: X_OUT, x: X_OUT - 0.12, y: 8, z: 30, size: 7, floorY: 0 },
    { text: 'パチンコ', color: '#3aa0ff', style: 'neon', vertical: false, mount: 'wall', face: 'w', wall: X_OUT, x: X_OUT - 0.12, y: 8, z: -30, size: 7, floorY: 0 },
    { text: 'ALPHA', color: '#3aa0ff', style: 'box', vertical: false, mount: 'wall', face: 'n', wall: BASE.z0, x: 0, y: 2.6, z: BASE.z0 - 0.12, size: 3.2, floorY: 0 },
    { text: 'OMEGA', color: '#ff3040', style: 'box', vertical: false, mount: 'wall', face: 's', wall: -BASE.z0, x: 0, y: 2.6, z: -BASE.z0 + 0.12, size: 3.2, floorY: 0 },
  ];
  for (const s of signs) addSign(ctx, s);
  b.build(scene);
  const instanced = inst.build(scene);

  // ---------------------------------------------------------------- navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const drops: [number, number][] = [];
  const open = (x: number, y: number, z: number) => !col.blocked(v(x, y, z), 0.6);
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.2 * 1.2) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  const chain = (...ids: number[]) => {
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
  };
  for (const s of [1, -1]) {
    const Z = (z: number) => z * s;
    // Yard exits (both sides of each).
    for (const x of exits) {
      N(x, 0, Z(56));
      N(x, 0, Z(52.5));
    }
    // Arcade and gap-alley mouths.
    for (const x of [BW.x0 - 1.5, BW.x0 + 1, (BW.x0 + BW.x1) / 2, BW.x1 - 1, BW.x1 + 1.5]) N(x, 0, Z(26));
    for (const x of [BE.x0 - 1.5, BE.x0 + 1.5, 20, BE.x1 - 1.5, BE.x1 + 1.5]) N(x, 0, Z(26.5));
    // Fire escape: foot, middle, landing; landing to the top landing; the top landing onto the roof.
    chain(N(-32.4, 0, Z(43)), N(-32.4, MID / 2, Z(37.5)), N(-32.4, MID, Z(32)));
    N(-32.3, MID, Z(30));
    chain(N(-32.4, MID, Z(29.2)), N(-32.4, (MID + TOP) / 2, Z(25.5)), N(-32.4, TOP, Z(21.8)));
    N(-29.8, TOP, Z(20.8));
    // Street landing (MID) and its stair to the roof (TOP).
    N(-11.7, MID, Z(14.3));
    chain(N(-11.7, MID, Z(16.4)), N(-11.7, (MID + TOP) / 2, Z(19.75)), N(-11.7, TOP, Z(23.2)));
    N(-14.4, TOP, Z(24));
    // Footbridge: stair foot, middle, top; the deck; the arms.
    chain(N(0, 0, Z(25.8)), N(0, MID / 2, Z(20.3)), N(0, MID, Z(15)));
    for (const x of [-8, -4, 4, 8, 11.8]) N(x, MID, Z(14.3));
    for (const z of [4, 10]) N(0, MID, Z(z));
    // Block E: the gap bridge, the service-alley stair (foot, middle, landing), the arm's landing.
    for (const z of [23.2, 26, 28.8]) N(20, MID, Z(z));
    chain(N(31.5, 0, Z(42.3)), N(31.5, MID / 2, Z(36.9)), N(31.4, MID, Z(31.4)));
    N(28.8, MID, Z(31.4));
    N(14.4, MID, Z(14.3));
    // Skybridge and plank bridge ends.
    for (const z of [3, 8.8]) {
      N(-22, TOP, Z(z));
      N(24, MID, Z(z));
    }
    // Drop-downs (one-way): roof → fire-escape landing → alley; Block E → service alley, gap alley, street.
    drops.push([N(-30.2, TOP, Z(31)), N(-32.3, MID, Z(30.6))]);
    drops.push([N(-32.6, MID, Z(30.1)), N(-35.8, 0, Z(30.1))]);
    drops.push([N(29.1, MID, Z(15.2)), N(32.4, 0, Z(15.2))]);
    drops.push([N(29.1, MID, Z(44.2)), N(32.6, 0, Z(44.2))]);
    drops.push([N(13.9, MID, Z(37.2)), N(11.2, 0, Z(37.2))]);
    drops.push([N(27.2, MID, Z(21.1)), N(27.2, 0, Z(24.3))]);
  }
  for (const z of [0]) {
    N(-22, TOP, z);
    N(24, MID, z);
    N(0, MID, z);
  }
  for (const L of lanesOf('alpha')) for (const p of L) N(p.x, p.y, p.z);
  // Lattices: the street level (4 m in the alleys, 6 m in the open), the roofs (4 m).
  const latt = (xs: number[], zs: number[], y: number, ok: (x: number, z: number) => boolean = () => true) => {
    for (const x of xs) for (const z of zs) if (ok(x, z) && open(x, y, z)) N(x, y, z);
  };
  const range = (a: number, c: number, step: number) => {
    const out: number[] = [];
    for (let x = a; x <= c + 1e-6; x += step) out.push(+x.toFixed(2));
    return out;
  };
  const ground = (x: number, z: number) => {
    const az = Math.abs(z);
    if (az <= CROSS || (az >= COURT && az <= BASE.z0)) return true;
    if (az > BASE.z0) return Math.abs(x) < BASE.x1 - 1;
    return x < BW.x0 || x > BE.x1 || (x > BW.x1 && x < BE.x0) || (x > BW.x0 && x < BW.x1 && az > BW.arcade[0] && az < BW.arcade[1]) || (x > BE.x0 && x < BE.x1 && az > BE.gap[0] && az < BE.gap[1]);
  };
  latt(range(-37, -32, 2.5), range(-COURT, COURT, 4), 0, ground);
  latt(range(31.5, 37, 2.75), range(-COURT, COURT, 4), 0, ground);
  latt(range(-11, 11, 5.5), range(-COURT, COURT, 5), 0, ground);
  latt(range(-36, 36, 6), range(-6, 6, 6), 0, ground);
  latt(range(-36, 36, 6), [-50, -47.5, 47.5, 50], 0, ground);
  latt(range(-18, 18, 6), [-63, -59, 59, 63], 0, ground);
  latt(range(-29.5, -14.5, 3.75), range(-COURT + 1.5, COURT - 1.5, 4), TOP, (x, z) => Math.abs(z) > CROSS + 0.5);
  latt(range(14.5, 28.5, 3.5), range(-COURT + 1.5, COURT - 1.5, 4), MID, (x, z) => Math.abs(z) > CROSS + 0.5 && (Math.abs(z) < BE.gap[0] - 0.5 || Math.abs(z) > BE.gap[1] + 0.5));

  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x},${p.y},${p.z} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!open(p.x, p.y, p.z)) laneProblems.push(`${t} ${p.x},${p.y},${p.z}`);

  const testGoals = [
    v(-22, TOP, 0), v(-22, TOP, 30), v(-22, TOP, -30), v(-32.3, MID, 30.6), v(-32.4, TOP, -21),
    v(-11.7, MID, 14.3), v(-11.7, TOP, -24), v(0, MID, 0), v(8, MID, -14.3), v(24, MID, 0),
    v(20, MID, 26), v(22, MID, -18), v(22, MID, 40), v(31.4, MID, -31.4),
    v(-35, 0, 0), v(-22, 0, 26), v(20, 0, -26), v(34, 0, 30), v(0, 0, 40), v(-30, 0, -50),
  ];

  const rain: RainAreas = {
    open: [
      [-X_OUT, -CROSS, X_OUT, CROSS],
      [BW.x1, CROSS, BE.x0, COURT],
      [BW.x1, -COURT, BE.x0, -CROSS],
      [-X_OUT, CROSS, BW.x0, COURT],
      [-X_OUT, -COURT, BW.x0, -CROSS],
      [BE.x1, CROSS, X_OUT, COURT],
      [BE.x1, -COURT, X_OUT, -CROSS],
      [BE.x0, BE.gap[0], BE.x1, BE.gap[1]],
      [BE.x0, -BE.gap[1], BE.x1, -BE.gap[0]],
      [-X_OUT, COURT, X_OUT, Z_END],
      [-X_OUT, -Z_END, X_OUT, -COURT],
    ],
    surfaces: [
      { x0: BW.x0, z0: CROSS, x1: BW.x1, z1: COURT, y: TOP },
      { x0: BW.x0, z0: -COURT, x1: BW.x1, z1: -CROSS, y: TOP },
      { x0: BE.x0, z0: CROSS, x1: BE.x1, z1: BE.gap[0], y: MID },
      { x0: BE.x0, z0: BE.gap[1], x1: BE.x1, z1: COURT, y: MID },
      { x0: BE.x0, z0: -BE.gap[0], x1: BE.x1, z1: -CROSS, y: MID },
      { x0: BE.x0, z0: -COURT, x1: BE.x1, z1: -BE.gap[1], y: MID },
      { x0: FOOT.x0, z0: -FOOT.end, x1: FOOT.x1, z1: FOOT.end, y: MID },
      { x0: PLANK.x0, z0: -CROSS, x1: PLANK.x1, z1: CROSS, y: MID },
      { x0: 18, z0: BE.gap[0], x1: 22, z1: BE.gap[1], y: MID },
      { x0: 18, z0: -BE.gap[1], x1: 22, z1: -BE.gap[0], y: MID },
    ],
    shelters: [
      { x0: BW.x0, z0: BW.arcade[0], x1: BW.x1, z1: BW.arcade[1], y: 3.6 },
      { x0: BW.x0, z0: -BW.arcade[1], x1: BW.x1, z1: -BW.arcade[0], y: 3.6 },
      { x0: SKY.x0, z0: -CROSS, x1: SKY.x1, z1: CROSS, y: TOP + 2.4 },
      { x0: FOOT.x0, z0: -FOOT.end, x1: FOOT.x1, z1: FOOT.end, y: MID - 0.25 },
      { x0: PLANK.x0, z0: -CROSS, x1: PLANK.x1, z1: CROSS, y: MID - 0.25 },
    ],
  };

  return {
    nav: { nodes, links, drops, slope: 0 },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    coverPoints: [],
    testGoals,
    zoneAt,
    rain,
    catcherPicks: picks.slice(0, 8).map((g) => [g.pos.x, g.pos.y, g.pos.z] as [number, number, number]),
    covered: [
      { x0: BW.x0, z0: BW.arcade[0], x1: BW.x1, z1: BW.arcade[1], h: 3.6 },
      { x0: BW.x0, z0: -BW.arcade[1], x1: BW.x1, z1: -BW.arcade[0], h: 3.6 },
    ],
    laneProblems,
    instanced,
    lights,
  };
}

// ------------------------------------------------------------------ shared prop geometry and materials
// Module level: built once, shared by every load (and so never disposed with a level's scene).
const shared = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
  x.userData.shared = true;
  return x;
};
const VEND_GEO = shared(worldBox(1.05, 1.9, 0.8, 1));
const VEND_FRONT = shared(new THREE.PlaneGeometry(0.98, 1.8));
const AC_ROOF = shared(worldBox(1.4, 1.0, 1.1, 1));
const AC_ROOF_FRONT = shared(new THREE.PlaneGeometry(1.2, 0.8));
const AC_WALL = shared(worldBox(0.75, 0.55, 0.28, 1));
const BAG = shared(new THREE.SphereGeometry(0.32, 8, 6));
const LANTERN = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.05 + Math.sin(t * Math.PI) * 0.26, -0.42 + t * 0.84));
  }
  return shared(new THREE.LatheGeometry(pts, 14));
})();
const vendBody = {
  red: shared(new THREE.MeshStandardMaterial({ color: 0xb01024, roughness: 0.35, metalness: 0.3 })),
  white: shared(new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.3 })),
};
const vendFront = {
  red: shared(new THREE.MeshBasicMaterial({ map: vendingTexture('red'), color: new THREE.Color(1.5, 1.5, 1.5) })),
  white: shared(new THREE.MeshBasicMaterial({ map: vendingTexture('white'), color: new THREE.Color(1.5, 1.5, 1.5) })),
};
const acBody = shared(new THREE.MeshStandardMaterial({ color: 0x9a988e, roughness: 0.65 }));
const grille = shared(new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.55, metalness: 0.2 }));
const bagMat = shared(new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.25, metalness: 0.1, envMapIntensity: 1.3 }));
const lanterns = ['酒', '焼鳥', '祭'].map((ch) => {
  const t = lanternTexture(ch);
  return shared(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 0.55, 0.35), emissiveIntensity: 1.5, roughness: 0.6 }));
});
