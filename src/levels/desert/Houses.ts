import * as THREE from 'three';
import { worldBox, type StaticBuilder } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';

/*
  46.0, the flank houses: multi-storey buildings on the Desert's main flanks, so a flank has rooms to
  fight through (the playtest: the flanks were open sand with a few low walls). Layout and placement in
  ArenaLayout.ts (HOUSES); this builds one house from its spec, in its own local frame:

    u across the flank (+u towards the compound on the west flank), v along it (+v south, ALPHA's way);
    the world point is (cx + su·u, cz + sv·v): su = -1 mirrors a house left to right, (su, sv) = (-1, -1)
    is the arena's 180° rotation.

  A storey is `storey` m; level k's floor is at `y0 + k·storey` (level `floors` is the roof). Stairs go
  up in two bays beside the house's west wall, switchback: run k (level k → k+1) climbs bay A towards
  +v when k is even, bay B towards -v when k is odd, from `stair[0]` to `stair[1]`; the slab of level
  k + 1 has a hole over its bay, a railing across the hole's dead end; the landing (`stair[1]` to the
  wall) is solid on every level. A `mirror` house builds the whole stairwell again at -v (a stair at
  each end: the Block, entered by both teams). Walls, floors and stairs are seen and solid; railings
  are solid but let rounds and sight through (a fight across the atrium, up and down the well).

  Every run is an invisible ramp the feet walk, treads laid over it (seen only), and a stepped fill
  under it (not a floor: nothing walks under a stair). Nav: the nodes the spec lists on each level
  (auto-linked within a level), the outer doors (outside to inside), each run's foot, middle and top.
*/

type Side = 'n' | 's' | 'e' | 'w';

/** An opening in a facade: on side `side` (n: v = -hd, s: v = +hd, w: u = -hw, e: u = +hw), centred at `at` along it, on level `level`. */
export interface HouseHole {
  side: Side;
  at: number;
  w: number;
  /** Over the floor (a door from 0). */
  y0: number;
  y1: number;
  level: number;
  /** Built once even in a mirrored house (it straddles v = 0, or a mirrored house has it on purpose). */
  mid?: boolean;
}

/** An interior wall on one or more levels: a box (u0..u1, v0..v1), doorways cut along its long axis. */
export interface HouseWall {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  levels: number[];
  doors?: { at: number; w: number }[];
  mid?: boolean;
}

/** Furniture and cover on a level: crates, counters, a sofa; `h` over the floor (≤ 1.3 vaulted). */
export interface HouseProp {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  h: number;
  level: number;
  kind: 'crate' | 'counter' | 'dark';
  mid?: boolean;
}

export interface HouseSpec {
  name: string;
  jp: string;
  hw: number;
  hd: number;
  floors: number;
  storey: number;
  /** A run up to the roof (the roof is walkable behind its parapet). */
  roofAccess: boolean;
  parapet: number;
  /** The two stair bays' u extents, and the runs' v from foot to top (bay A's way). */
  bayA: [number, number];
  bayB: [number, number];
  stair: [number, number];
  /** Build the stairwell (and every non-`mid` hole, wall, prop, node) again mirrored at -v. */
  mirror: boolean;
  /** A void through the upper floors (half sizes in u and v, centred), railed on every level over the ground. */
  atrium?: [number, number];
  holes: HouseHole[];
  walls: HouseWall[];
  props: HouseProp[];
  /** Nav nodes per level (index = level; the roof is `floors`), each [u, v]. */
  nodes: [number, number][][];
  /** Outer doors on the graph: outside [u, v] to inside [u, v] (level 0). */
  doors: [[number, number], [number, number]][];
  /** Warm lamps: [u, v, level] (a pooled point light each, under the ceiling). */
  lamps: [number, number, number][];
  /** Rooftop clutter (cover): water tanks [u, v, radius] and boxes [u0, u1, v0, v1, h]. */
  tanks: [number, number, number][];
  roofBoxes: [number, number, number, number, number][];
}

export interface HouseKit {
  b: StaticBuilder;
  col: CollisionWorld;
  scene: THREE.Scene;
  mats: {
    wall: THREE.Material;
    trim: THREE.Material;
    floor: THREE.Material;
    rail: THREE.Material;
    crate: THREE.Material;
    wood: THREE.Material;
    dark: THREE.Material;
    lamp: THREE.Material;
  };
}

export interface HousePlacement {
  cx: number;
  cz: number;
  /** The floor of level 0 (world y): the pad under the house. */
  y0: number;
  su: 1 | -1;
  sv: 1 | -1;
}

export interface HouseResult {
  nodes: THREE.Vector3[];
  links: [number, number][];
  cover: THREE.Vector3[];
  goals: THREE.Vector3[];
  /** Places in it the patrols search (a room a level, the roof). */
  hvas: THREE.Vector3[];
  /** Its footprint inside the walls and its roof's height (the storm's mask, the zone, "indoors"). */
  interior: { name: string; jp: string; x0: number; z0: number; x1: number; z1: number; h: number };
}

/** Wall thickness, slab thickness, a door's height, the railings' height. */
const T = 0.3;
const SLAB = 0.3;
const DOOR = 2.3;
const RAIL = 1.05;
/**
 * 50.0: the ground floor (and its door sills) this far over the pad: level with the sand, the two
 * faces fought for the same pixels (the playtest: "the floor flickers in the houses in the field").
 */
const LIFT = 0.06;

/** `outer` minus `holes` (all [u0, v0, u1, v1]), as non-overlapping rects (cells merged along u). */
export function rectMinus(outer: [number, number, number, number], holes: [number, number, number, number][]): [number, number, number, number][] {
  const [U0, V0, U1, V1] = outer;
  const us = [U0, U1], vs = [V0, V1];
  for (const [a, b, c, d] of holes) {
    for (const u of [a, c]) if (u > U0 && u < U1) us.push(u);
    for (const v of [b, d]) if (v > V0 && v < V1) vs.push(v);
  }
  const su = [...new Set(us)].sort((x, y) => x - y), sv = [...new Set(vs)].sort((x, y) => x - y);
  const out: [number, number, number, number][] = [];
  for (let j = 0; j + 1 < sv.length; j++) {
    let run: [number, number, number, number] | null = null;
    for (let i = 0; i + 1 < su.length; i++) {
      const cu = (su[i] + su[i + 1]) / 2, cv = (sv[j] + sv[j + 1]) / 2;
      const hole = holes.some(([a, b, c, d]) => cu > a && cu < c && cv > b && cv < d);
      if (hole) {
        if (run) out.push(run);
        run = null;
      } else if (run) run[2] = su[i + 1];
      else run = [su[i], sv[j], su[i + 1], sv[j + 1]];
    }
    if (run) out.push(run);
  }
  return out;
}

export function buildHouse(k: HouseKit, s: HouseSpec, at: HousePlacement): HouseResult {
  const { b, col, mats: m } = k;
  const out: HouseResult = { nodes: [], links: [], cover: [], goals: [], hvas: [], interior: { name: s.name, jp: s.jp, x0: 0, z0: 0, x1: 0, z1: 0, h: 0 } };
  const lv = (l: number) => at.y0 + l * s.storey;
  const roofY = lv(s.floors);
  /** Local (u, v) to world x, z. */
  const X = (u: number) => at.cx + at.su * u;
  const Z = (v: number) => at.cz + at.sv * v;
  /** A local rect to a world one (min, max). */
  const W = (u0: number, v0: number, u1: number, v1: number) => {
    const xa = X(u0), xb = X(u1), za = Z(v0), zb = Z(v1);
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)] as const;
  };
  /** A seen-and-solid box over a local rect. */
  const box = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete') => {
    const [x0, z0, x1, z1] = W(u0, v0, u1, v1);
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01 || y1 - y0 < 0.01) return null;
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, 1.5), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  /** Seen only (trim, treads, sills). */
  const look = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, mat: THREE.Material) => {
    const [x0, z0, x1, z1] = W(u0, v0, u1, v1);
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, 1.5), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  };
  /** A railing: solid to bodies, open to rounds and sight (bars). */
  const rail = (u0: number, v0: number, u1: number, v1: number, y: number) => {
    const [x0, z0, x1, z1] = W(u0, v0, u1, v1);
    // (The collider at least 10 cm through: the world check's thin-wall test reads a thinner one as a crossing.)
    const tx = Math.max(0, 0.1 - (x1 - x0)) / 2, tz = Math.max(0, 0.1 - (z1 - z0)) / 2;
    const c = col.add(x0 - tx, y, z0 - tz, x1 + tx, y + RAIL, z1 + tz, 'metal');
    c.ray = false;
    // Seen: a top rail, a mid rail and posts every metre.
    const alongX = x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (const [hy, th] of [[RAIL - 0.03, 0.06], [RAIL * 0.5, 0.04]] as const) b.add(new THREE.BoxGeometry(alongX ? len : 0.05, th, alongX ? 0.05 : len), m.rail, (x0 + x1) / 2, y + hy, (z0 + z1) / 2);
    const n = Math.max(1, Math.round(len));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.add(new THREE.BoxGeometry(0.05, RAIL, 0.05), m.rail, alongX ? x0 + (x1 - x0) * t : (x0 + x1) / 2, y + RAIL / 2, alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * t);
    }
  };
  const node = (u: number, v: number, y: number) => out.nodes.push(new THREE.Vector3(X(u), y, Z(v))) - 1;
  const mirrors = (mid?: boolean) => (s.mirror && !mid ? [1, -1] : [1]);
  const hw = s.hw, hd = s.hd;

  // ---- The stair runs (v ≥ 0 half; mirrored with the stairwell).
  const runs: { level: number; bay: [number, number]; foot: number; top: number }[] = [];
  const nRuns = s.floors - 1 + (s.roofAccess ? 1 : 0);
  for (let r = 0; r < nRuns; r++) runs.push({ level: r, bay: r % 2 ? s.bayB : s.bayA, foot: r % 2 ? s.stair[1] : s.stair[0], top: r % 2 ? s.stair[0] : s.stair[1] });

  // ---- Slabs: level 0 (the ground floor, down into the sand), the upper floors and the roof, with
  // their holes (each run's well in the slab it climbs to; the atrium in the upper floors).
  for (let l = 0; l <= s.floors; l++) {
    const holes: [number, number, number, number][] = [];
    for (const r of runs)
      // 50.0: and the ground floor under its first run (the floor sits LIFT over the run's foot).
      if (r.level + 1 === l || (l === 0 && r.level === 0)) for (const mv of mirrors()) holes.push([r.bay[0], mv > 0 ? s.stair[0] : -s.stair[1], r.bay[1], mv > 0 ? s.stair[1] : -s.stair[0]]);
    if (s.atrium && l > 0 && l < s.floors) holes.push([-s.atrium[0], -s.atrium[1], s.atrium[0], s.atrium[1]]);
    const y = lv(l);
    const bottom = l === 0 ? at.y0 - 1.2 : y - SLAB;
    for (const [u0, v0, u1, v1] of rectMinus([-hw + T, -hd + T, hw - T, hd - T], holes)) {
      const c = box(u0, v0, u1, v1, bottom, l === 0 ? y + LIFT : y, m.floor);
      if (c && l === s.floors) c.surface = 'concrete';
    }
    // The atrium's railing (every upper floor), round its four sides.
    if (s.atrium && l > 0 && l < s.floors) {
      const [au, av] = s.atrium;
      rail(-au - 0.05, -av - 0.05, au + 0.05, -av, y);
      rail(-au - 0.05, av, au + 0.05, av + 0.05, y);
      rail(-au - 0.05, -av, -au, av, y);
      rail(au, -av, au + 0.05, av, y);
    }
  }

  // ---- Facades: a storey at a time, openings cut; a cornice band at every floor; the parapet.
  const facade = (side: Side, level: number) => {
    const y0 = level === 0 ? at.y0 - 1.2 : lv(level), y1 = lv(level + 1);
    const along = side === 'n' || side === 's';
    const [a0, a1] = along ? [-hw, hw] : [-hd + T, hd - T];
    const c0 = side === 'n' ? -hd : side === 's' ? hd - T : side === 'w' ? -hw : hw - T;
    const c1 = c0 + T;
    const list: HouseHole[] = [];
    for (const h of s.holes) {
      if (h.level !== level) continue;
      for (const mv of mirrors(h.mid)) {
        let sd = h.side;
        let a = h.at;
        if (mv < 0) {
          if (sd === 'n') sd = 's';
          else if (sd === 's') sd = 'n';
          else a = -a;
        }
        if (sd === side) list.push({ ...h, side: sd, at: a });
      }
    }
    list.sort((p, q) => p.at - q.at);
    const piece = (p0: number, p1: number, yb: number, yt: number) => {
      if (p1 - p0 < 0.01 || yt - yb < 0.01) return;
      if (along) box(p0, c0, p1, c1, yb, yt, m.wall);
      else box(c0, p0, c1, p1, yb, yt, m.wall);
    };
    const fl = lv(level);
    let cur = a0;
    for (const o of list) {
      const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
      piece(cur, o0, y0, y1);
      piece(o0, o1, y0, fl + (level === 0 && o.y0 === 0 ? LIFT : o.y0));
      piece(o0, o1, fl + o.y1, y1);
      // A sill under a window, a frame's head over every opening (seen only, a hand's depth proud).
      const proud = side === 'n' || side === 'w' ? -0.06 : 0.06;
      const e0 = side === 'n' || side === 'w' ? c0 + proud : c1 - 0.02, e1 = e0 + 0.08;
      if (o.y0 > 0.3) {
        if (along) look(o0 - 0.08, Math.min(e0, e1), o1 + 0.08, Math.max(e0, e1), fl + o.y0 - 0.08, fl + o.y0, m.trim);
        else look(Math.min(e0, e1), o0 - 0.08, Math.max(e0, e1), o1 + 0.08, fl + o.y0 - 0.08, fl + o.y0, m.trim);
        // 50.0: bars across every window: rounds and sight through, nobody (a jump squeezed a body out
        // through a slit); a window is a firing point, not a door.
        const [gx0, gz0, gx1, gz1] = along ? W(o0, c0, o1, c1) : W(c0, o0, c1, o1);
        col.add(gx0, fl + o.y0, gz0, gx1, fl + o.y1, gz1, 'metal').ray = false;
        const cm = (c0 + c1) / 2;
        for (const t of [1 / 3, 2 / 3]) {
          const p = o0 + (o1 - o0) * t;
          if (along) look(p - 0.02, cm - 0.02, p + 0.02, cm + 0.02, fl + o.y0, fl + o.y1, m.rail);
          else look(cm - 0.02, p - 0.02, cm + 0.02, p + 0.02, fl + o.y0, fl + o.y1, m.rail);
        }
      }
      cur = o1;
    }
    piece(cur, a1, y0, y1);
  };
  for (let l = 0; l < s.floors; l++) for (const side of ['n', 's', 'w', 'e'] as Side[]) facade(side, l);
  // Cornice bands (seen only), at every upper floor and the roof.
  for (let l = 1; l <= s.floors; l++) {
    const y = lv(l);
    look(-hw - 0.08, -hd - 0.08, hw + 0.08, -hd + 0.02, y - 0.22, y + 0.02, m.trim);
    look(-hw - 0.08, hd - 0.02, hw + 0.08, hd + 0.08, y - 0.22, y + 0.02, m.trim);
    look(-hw - 0.08, -hd, -hw + 0.02, hd, y - 0.22, y + 0.02, m.trim);
    look(hw - 0.02, -hd, hw + 0.08, hd, y - 0.22, y + 0.02, m.trim);
  }
  // The parapet round the roof (cover up there), capped.
  box(-hw, -hd, hw, -hd + T, roofY, roofY + s.parapet, m.wall);
  box(-hw, hd - T, hw, hd, roofY, roofY + s.parapet, m.wall);
  box(-hw, -hd + T, -hw + T, hd - T, roofY, roofY + s.parapet, m.wall);
  box(hw - T, -hd + T, hw, hd - T, roofY, roofY + s.parapet, m.wall);
  // Its cap: a ring over the parapet's top.
  const cy = roofY + s.parapet;
  look(-hw - 0.05, -hd - 0.05, hw + 0.05, -hd + T + 0.03, cy, cy + 0.06, m.trim);
  look(-hw - 0.05, hd - T - 0.03, hw + 0.05, hd + 0.05, cy, cy + 0.06, m.trim);
  look(-hw - 0.05, -hd + T, -hw + T + 0.03, hd - T, cy, cy + 0.06, m.trim);
  look(hw - T - 0.03, -hd + T, hw + 0.05, hd - T, cy, cy + 0.06, m.trim);

  // ---- The stairwell: the walls round its bays (full height on the floors), each run, its well's railings.
  const a1 = s.bayA[1], [b0, b1] = s.bayB;
  // (50.0: a one-storey house without a roof to climb has no stairwell.)
  for (const mv of runs.length ? mirrors() : []) {
    const V = (v: number) => v * mv;
    const lo = Math.min(V(s.stair[0]), V(s.stair[1])), hi = Math.max(V(s.stair[0]), V(s.stair[1]));
    for (let l = 0; l < s.floors; l++) {
      const y0 = lv(l), y1 = lv(l + 1) - SLAB;
      // Between the bays, and on bay B's inner side.
      box(a1, lo, b0, hi, y0, y1, m.wall);
      box(b1, lo, b1 + 0.25, hi, y0, y1, m.wall);
    }
    for (const r of runs) {
      const yf = lv(r.level), yt = lv(r.level + 1);
      const [u0, u1] = r.bay;
      const f = V(r.foot), t = V(r.top);
      const vlo = Math.min(f, t), vhi = Math.max(f, t);
      // The ramp the feet walk (h0 at the min v end).
      const [x0, z0, x1, z1] = W(u0, vlo, u1, vhi);
      const zMinIsFoot = Z(f) < Z(t);
      col.addRamp(x0, z0, x1, z1, 'z', zMinIsFoot ? yf : yt, zMinIsFoot ? yt : yf);
      // Treads (seen): steps of about 0.2 m.
      const n = Math.round((yt - yf) / 0.2);
      for (let i = 0; i < n; i++) {
        const va = f + ((t - f) * i) / n, vb = f + ((t - f) * (i + 1)) / n;
        // (Inset 2 cm from the bay's walls: coplanar faces flicker, L-088.)
        look(u0 + 0.02, Math.min(va, vb), u1 - 0.02, Math.max(va, vb), yf - 0.05, yf + ((yt - yf) * (i + 1)) / n, m.floor);
      }
      // The stepped fill under it (not a floor), in steps ≤ 0.3 m.
      const fills = Math.ceil((yt - yf) / 0.3);
      for (let i = 0; i < fills; i++) {
        const va = f + ((t - f) * i) / fills, vb = f + ((t - f) * (i + 1)) / fills;
        const hAt = (v: number) => yf + ((yt - yf) * (v - f)) / (t - f);
        const [fx0, fz0, fx1, fz1] = W(u0, Math.min(va, vb), u1, Math.max(va, vb));
        col.add(fx0, yf - 0.1, fz0, fx1, Math.min(hAt(va), hAt(vb)) - 0.05, fz1, 'concrete').floor = false;
      }
      // The well in the slab above: a railing across its dead end (the foot's end).
      rail(u0, Math.min(f, f + Math.sign(f - t) * 0.06), u1, Math.max(f, f + Math.sign(f - t) * 0.06), yt);
      // On the roof the bays' walls stop: railings along the well's sides instead.
      if (r.level + 1 === s.floors) {
        rail(u1, vlo, u1 + 0.06, vhi, yt);
        rail(u0 - 0.06, vlo, u0, vhi, yt);
      }
      // On the graph: foot (a step off the ramp), middle, top (on the landing or the floor past it).
      const fu = (u0 + u1) / 2;
      const n0 = node(fu, f + Math.sign(f - t) * 0.7, yf), n1 = node(fu, (f + t) / 2, (yf + yt) / 2), n2 = node(fu, t + Math.sign(t - f) * 0.7, yt);
      out.links.push([n0, n1], [n1, n2]);
    }
  }

  // ---- Interior walls and doorways, a storey high (to the slab over them).
  for (const w of s.walls) {
    for (const mv of mirrors(w.mid)) {
      const v0 = mv > 0 ? w.v0 : -w.v1, v1 = mv > 0 ? w.v1 : -w.v0;
      const alongU = w.u1 - w.u0 >= v1 - v0;
      for (const l of w.levels) {
        const y0 = lv(l), y1 = lv(l + 1) - SLAB;
        const ds = (w.doors ?? []).map((d) => (alongU ? d : { at: d.at * mv, w: d.w })).sort((p, q) => p.at - q.at);
        let cur = alongU ? w.u0 : v0;
        const end = alongU ? w.u1 : v1;
        const seg = (p0: number, p1: number, yb: number, yt: number) => {
          if (p1 - p0 < 0.01) return;
          if (alongU) box(p0, v0, p1, v1, yb, yt, m.wall);
          else box(w.u0, p0, w.u1, p1, yb, yt, m.wall);
        };
        for (const d of ds) {
          seg(cur, d.at - d.w / 2, y0, y1);
          seg(d.at - d.w / 2, d.at + d.w / 2, y0 + DOOR, y1);
          cur = d.at + d.w / 2;
        }
        seg(cur, end, y0, y1);
      }
    }
  }

  // ---- Props (cover), lamps, the roof's clutter.
  for (const p of s.props) {
    for (const mv of mirrors(p.mid)) {
      const v0 = mv > 0 ? p.v0 : -p.v1, v1 = mv > 0 ? p.v1 : -p.v0;
      const y = lv(p.level);
      const c = box(p.u0, v0, p.u1, v1, y, y + p.h, p.kind === 'crate' ? m.crate : p.kind === 'dark' ? m.dark : m.wood, p.kind === 'dark' ? 'metal' : 'wood');
      if (c && p.h <= 1.3) c.vault = true;
      // Cover beside it on its long sides.
      const cu = (p.u0 + p.u1) / 2, cv = (v0 + v1) / 2;
      if (p.u1 - p.u0 >= v1 - v0) for (const dv of [-1, 1]) out.cover.push(new THREE.Vector3(X(cu), y, Z(cv + dv * ((v1 - v0) / 2 + 0.55))));
      else for (const du of [-1, 1]) out.cover.push(new THREE.Vector3(X(cu + du * ((p.u1 - p.u0) / 2 + 0.55)), y, Z(cv)));
    }
  }
  for (const [u, v, l] of s.lamps) {
    for (const mv of mirrors(Math.abs(v) < 0.01)) {
      const y = lv(l + 1) - SLAB;
      look(u - 0.5, v * mv - 0.08, u + 0.5, v * mv + 0.08, y - 0.06, y, m.lamp);
      const L = new THREE.PointLight(0xffc98a, 5, 9, 2);
      L.position.set(X(u), y - 0.35, Z(v * mv));
      k.scene.add(L);
    }
  }
  for (const [u, v, r] of s.tanks) {
    const x = X(u), z = Z(v);
    b.add(new THREE.CylinderGeometry(r, r, 1.6, 14), m.dark, x, roofY + 0.25 + 0.8, z);
    b.add(new THREE.BoxGeometry(r * 2, 0.25, r * 2), m.trim, x, roofY + 0.125, z);
    col.addCylinder(x, z, r, roofY, roofY + 1.85, 'metal');
    out.cover.push(new THREE.Vector3(x + (r + 0.55) * Math.sign(-at.su * u || 1), roofY, z));
  }
  for (const [u0, u1, v0, v1, h] of s.roofBoxes) {
    const c = box(u0, v0, u1, v1, roofY, roofY + h, m.dark, 'metal');
    if (c && h <= 1.3) c.vault = true;
  }

  // ---- The graph: the spec's nodes on every level, the outer doors.
  for (let l = 0; l < s.nodes.length; l++) for (const [u, v] of s.nodes[l]) for (const mv of mirrors(Math.abs(v) < 0.01)) node(u, v * mv, lv(l));
  for (const [[ou, ov], [iu, iv]] of s.doors) {
    for (const mv of mirrors(Math.abs(ov) < 0.01)) {
      const a = out.nodes.push(new THREE.Vector3(X(ou), NaN, Z(ov * mv))) - 1;
      const c = node(iu, iv * mv, lv(0));
      out.links.push([a, c]);
    }
  }
  // Patrols: the middle of every level (and the roof), one goal a level for the world check.
  for (let l = 0; l <= (s.roofAccess ? s.floors : s.floors - 1); l++) {
    const p = new THREE.Vector3(X(s.nodes[l]?.[0]?.[0] ?? 0), lv(l), Z(s.nodes[l]?.[0]?.[1] ?? 0));
    out.hvas.push(p);
    out.goals.push(p.clone());
  }
  const [ix0, iz0, ix1, iz1] = W(-hw + T, -hd + T, hw - T, hd - T);
  out.interior = { name: s.name, jp: s.jp, x0: ix0, z0: iz0, x1: ix1, z1: iz1, h: roofY };
  return out;
}

/*
  The Block: three storeys and a roof on each main flank's midline (it replaces the 6.0 pump house),
  mirror-symmetric about v = 0, so each team comes at it from its own end and meets the same rooms.

        north end (OMEGA's on the west flank): the same, mirrored
     ┌────┬───────────────────────────┐   v = -12
     │stair landing   end room   ▢     │
     │A│B │══════╡door╞══════╡door╞═══│   v = ±7: the end rooms
     │ │ ║│        hall      ║  east   │
  W door  ▢counter  ┌─────┐  ║  room   E door (towards the compound)
     │       hall   │atrium│ door      │   the atrium: a void through floors 1 and 2, railed
     │ │ ║│         └─────┘  ║  ▢      │
     │A│B │══════╡door╞══════╡door╞═══│
     │stair landing   end room         │
     └──┤nook├──────┤S door├───────────┘   v = +12: ALPHA's way in on the west flank

  Stairs: bay A (F0 → F1, F2 → roof), bay B (F1 → F2), at both ends. Each level is a fight of its own:
  doors and corners at the ends, the hall round the atrium, windows over the flank and the compound,
  and the atrium and the stair wells to shoot up and down. Two lamps a floor's worth of light (pooled).
*/
// (-4.4, 11: the end room by the landing's opening; the landing's nodes can't see round the stair's wall.)
const BLOCK_HALL: [number, number][] = [[-4, 0], [-8, 0], [-4, 3.6], [0, 3.6], [2.9, 4], [5.2, 4], [7, 0], [7, 4.5], [1.25, 5.8], [1.25, 8.4], [6.7, 5.9], [6.7, 8.4], [-3.2, 9.3], [3.8, 9.3], [8, 9.3], [-4.4, 11]];
export const BLOCK_SPEC: HouseSpec = {
  name: 'THE BLOCK',
  jp: 'المبنى',
  hw: 10,
  hd: 12,
  floors: 3,
  storey: 3.4,
  // 50.0: no way onto the roof (10.2 m up over the whole flank and the compound).
  roofAccess: false,
  parapet: 1.15,
  bayA: [-9.7, -7.6],
  bayB: [-7.4, -5.3],
  stair: [4.8, 10.3],
  mirror: true,
  atrium: [2.4, 2.4],
  holes: [
    // Ground floor: a door into each end room and one into the nook under the landing, a door mid-way
    // along each long side (west: the hall; east, towards the compound: the east room).
    { side: 's', at: 2.75, w: 1.6, y0: 0, y1: 2.3, level: 0 },
    { side: 's', at: -6.35, w: 1.2, y0: 0, y1: 2.3, level: 0 },
    { side: 'w', at: 0, w: 1.6, y0: 0, y1: 2.3, level: 0, mid: true },
    { side: 'e', at: 0, w: 1.6, y0: 0, y1: 2.3, level: 0, mid: true },
    { side: 's', at: 7, w: 1.3, y0: 1.0, y1: 2.1, level: 0 },
    { side: 'e', at: 4.5, w: 1.2, y0: 1.0, y1: 2.1, level: 0 },
    { side: 'e', at: 9.3, w: 1.2, y0: 1.0, y1: 2.1, level: 0 },
    { side: 'w', at: 2.6, w: 1.2, y0: 1.0, y1: 2.1, level: 0 },
    // Upper floors. 50.0: fewer windows, the top floor's slits (46.0: eight a floor at each end, the
    // stair wells' too, and a roof over them all: from up there he shot the whole map).
    { side: 's', at: 2.75, w: 1.2, y0: 1.0, y1: 2.1, level: 1 },
    { side: 'e', at: 5.6, w: 1.1, y0: 1.0, y1: 2.1, level: 1 },
    { side: 'w', at: 2.6, w: 1.0, y0: 1.0, y1: 2.1, level: 1 },
    { side: 's', at: -2.5, w: 0.7, y0: 1.3, y1: 1.9, level: 2 },
    { side: 'e', at: 9.3, w: 0.7, y0: 1.3, y1: 1.9, level: 2 },
  ],
  walls: [
    // The end rooms' wall, from the stairwell to the east wall: a door into the hall and one into the east room.
    { u0: -5.05, u1: 9.7, v0: 6.85, v1: 7.15, levels: [0, 1, 2], doors: [{ at: 1.25, w: 1.4 }, { at: 6.7, w: 1.3 }] },
    // The east rooms' wall along the hall, a door at each end.
    { u0: 3.85, u1: 4.15, v0: -6.85, v1: 6.85, levels: [0, 1, 2], doors: [{ at: -4, w: 1.3 }, { at: 4, w: 1.3 }], mid: true },
  ],
  props: [
    { u0: -7, u1: -5.4, v0: -1.2, v1: 1.2, h: 1.05, level: 0, kind: 'counter', mid: true },
    { u0: 7.2, u1: 8.4, v0: 1.4, v1: 2.6, h: 1.3, level: 0, kind: 'crate' },
    { u0: 1.8, u1: 3.6, v0: 9.4, v1: 10.4, h: 0.95, level: 0, kind: 'counter' },
    { u0: -6.2, u1: -4.6, v0: -0.8, v1: 0.8, h: 0.85, level: 1, kind: 'dark', mid: true },
    // (50.0: against the end rooms' wall: 0.65 m short of it, it was a slot a body stuck in.)
    { u0: 6.4, u1: 7.8, v0: 5.65, v1: 6.85, h: 1.25, level: 1, kind: 'crate' },
    { u0: 2.6, u1: 3.8, v0: 9.6, v1: 10.8, h: 1.3, level: 1, kind: 'crate' },
    { u0: -4.6, u1: -3.4, v0: 1.5, v1: 2.7, h: 1.2, level: 2, kind: 'crate' },
    { u0: 6, u1: 8, v0: -0.6, v1: 0.6, h: 0.95, level: 2, kind: 'counter', mid: true },
    { u0: 7.4, u1: 8.6, v0: 8.6, v1: 9.8, h: 1.3, level: 2, kind: 'crate' },
  ],
  nodes: [
    [[0, 0], ...BLOCK_HALL, [-6.35, 7.5], [-6.35, 11]],
    [...BLOCK_HALL, [-8.65, 11], [-6.35, 11]],
    // (50.0: the top floor's stair well is bay B's alone: the landing's corner by bay A is floor now.)
    [...BLOCK_HALL, [-6.35, 11]],
  ],
  doors: [
    [[2.75, 13.6], [2.75, 10.6]],
    [[-6.35, 13.6], [-6.35, 11]],
    [[-11.6, 0], [-8, 0]],
    [[11.6, 0], [7.5, 0]],
  ],
  lamps: [[-6, 0, 0], [-6, 0, 1], [-6, 0, 2]],
  tanks: [[8, -10, 0.9], [8, 10, 0.9]],
  roofBoxes: [[-1.2, 1.2, -6.2, -5.2, 1.05], [-1.2, 1.2, 5.2, 6.2, 1.05]],
};

/*
  A house: two storeys and a roof, one on each team's half of each main flank (the hamlet's and the
  wadi's), the Block's outposts. Doors front and back (towards home, towards the Block) and towards the
  compound; a stair up the west side to the upper room and on to the roof.
*/
export const HOUSE_SPEC: HouseSpec = {
  name: 'HOUSE',
  jp: 'البيت',
  hw: 5,
  hd: 4.5,
  floors: 2,
  storey: 3.3,
  // 50.0: no way onto the roof.
  roofAccess: false,
  parapet: 1.1,
  bayA: [-4.7, -2.6],
  bayB: [-2.4, -0.3],
  stair: [-2.6, 2.6],
  mirror: false,
  holes: [
    { side: 's', at: 2.2, w: 1.4, y0: 0, y1: 2.3, level: 0 },
    { side: 'n', at: 2.2, w: 1.4, y0: 0, y1: 2.3, level: 0 },
    { side: 'e', at: -1.5, w: 1.3, y0: 0, y1: 2.3, level: 0 },
    { side: 'e', at: 2.2, w: 1.2, y0: 1.0, y1: 2.1, level: 0 },
    // 50.0: upstairs, slits to the ends and one to the compound (46.0: five windows).
    { side: 's', at: 2.2, w: 0.8, y0: 1.2, y1: 1.9, level: 1 },
    { side: 'n', at: 2.2, w: 0.8, y0: 1.2, y1: 1.9, level: 1 },
    { side: 'e', at: 1.8, w: 0.8, y0: 1.2, y1: 1.9, level: 1 },
  ],
  walls: [],
  props: [
    { u0: 2.8, u1: 4, v0: -0.6, v1: 0.6, h: 1.2, level: 0, kind: 'crate' },
    { u0: 3, u1: 4.4, v0: -0.8, v1: 0.6, h: 0.95, level: 1, kind: 'counter' },
  ],
  nodes: [
    [[2, 0], [2, -3.2], [2, 3.2], [-1.35, 0], [-1.35, 3.5]],
    [[2, 0], [2, -3], [2, 3], [-1.35, 3.5]],
  ],
  doors: [
    [[2.2, 6], [2.2, 3.3]],
    [[2.2, -6], [2.2, -3.3]],
    [[6.2, -1.5], [3.6, -1.5]],
  ],
  lamps: [],
  tanks: [[3, -2.6, 0.7]],
  roofBoxes: [[1.2, 2.2, 1.6, 2.6, 1.0]],
};

/*
  50.0, a hut: one storey, no roof to climb, doors at both ends (off each other's line) and a window
  each side. Placed in the open ground between the bases and the flanks (ArenaLayout.HOUSES.huts): a
  room to fight through and a wall to stand behind where there was sand, and the upper windows' lines
  across the field cut.
*/
export const HUT_SPEC: HouseSpec = {
  name: 'HUT',
  jp: 'كوخ',
  hw: 3.5,
  hd: 3,
  floors: 1,
  storey: 3,
  roofAccess: false,
  parapet: 0.35,
  bayA: [0, 0],
  bayB: [0, 0],
  stair: [0, 0],
  mirror: false,
  holes: [
    { side: 's', at: -1.5, w: 1.3, y0: 0, y1: 2.3, level: 0 },
    { side: 'n', at: 1.5, w: 1.3, y0: 0, y1: 2.3, level: 0 },
    { side: 'e', at: 0, w: 1.2, y0: 1.0, y1: 2.0, level: 0 },
    { side: 'w', at: 0, w: 1.2, y0: 1.0, y1: 2.0, level: 0 },
  ],
  walls: [],
  props: [{ u0: 1.4, u1: 2.6, v0: 0.6, v1: 1.8, h: 1.1, level: 0, kind: 'crate' }],
  nodes: [[[0, 0], [-1.5, 1.6], [1.5, -1.6], [-2, -1.2]]],
  doors: [
    [[-1.5, 4.6], [-1.5, 1.6]],
    [[1.5, -4.6], [1.5, -1.6]],
  ],
  lamps: [],
  tanks: [],
  roofBoxes: [],
};
