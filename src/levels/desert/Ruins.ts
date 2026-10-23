import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';
import { desertHeight } from './Terrain';
import { RUINS } from './ArenaLayout';

/*
  38.0, the ruins (layout and reasoning in ArenaLayout.ts): a sandstone caravanserai on each outer
  flank's midline, authored once in the west ruin's local frame (u = x − RUINS.cx, v = z), half of it
  (v ≥ 0) mirrored about v = 0, the whole rotated 180° onto the east flank.

  Walls are laid in courses of one masonry block, columns stacked of one drum: an InstancedMesh of each
  per ruin (a few hundred instances, four draws and their shadows), every block a little off true and
  its own shade of sandstone. Each wall, column and fallen piece is one collider with the bounds of
  what is seen. Gaps between pieces are 0 or ≥ 1.3 m (no slot a body can wedge in).

        north gate (OMEGA's way in on the west flank)
     ┌──────┐▒▒┌─┐   ┌─┐┌──────┐  ┌────┐
     │gallery stair    ●col          │
     │██│  ════════       ║partition ▬drums
     │██│   ▐arch▌   (well-house) ■pier   east gate → the pump house
     │██│  ════════       ║            ▬
     │gallery stair    ●col          │
     └──────┘▒▒└─┘   └─┘└──────┘  └────┘
        south gate (the trench's mouth)        ▒ rubble you vault
*/

/** Masonry: a block's length and a course's height (m). */
const BLOCK = 1.05;
const COURSE = 0.5;
/** Column drums: about this tall. */
const DRUM = 0.6;
/** The gates' lintels (the south and north gates, the arch in the court) over the sand under their piers. */
const GATE_H = 3.2;
const ARCH_H = 3.3;
/** The well-house in the court, over the sand under it. */
const WELL_H = 3.2;
/** The gallery stairs' cheek walls: thickness (inside the stair's width). */
const CHEEK = 0.3;

export interface RuinsKit {
  col: CollisionWorld;
  scene: THREE.Scene;
  mat: THREE.Material;
  rnd(): number;
}

export interface RuinsResult {
  nodes: THREE.Vector3[];
  /** Pairs of indices into `nodes` (the gates, the gallery's stairs). */
  links: [number, number][];
  cover: THREE.Vector3[];
  goals: THREE.Vector3[];
  /** The galleries' centres, the watch posts (west, east). */
  posts: THREE.Vector3[];
  /** Places in the courts the patrols search. */
  hvas: THREE.Vector3[];
}

/** Local half-plan (v ≥ 0; `mid` pieces straddle v = 0 and are built once). u0, u1, v0, v1 and height over the sand. */
type Piece = { u0: number; u1: number; v0: number; v1: number; h: number; mid?: boolean };
/** Walls you can't see over (h ≥ 2) and rubble you vault (h ≤ 1.1). */
const WALLS: Piece[] = [
  // The south wall (and the north): the gate's piers are built with its lintel, below; a 2 m breach at u 4 … 6.
  { u0: -8, u1: -5, v0: 9.3, v1: 10, h: 2.4 },
  { u0: -5, u1: -3.4, v0: 9.3, v1: 10, h: 1.0 },
  { u0: 1.4, u1: 4, v0: 9.3, v1: 10, h: 2.8 },
  { u0: 6, u1: 8, v0: 9.3, v1: 10, h: 2.0 },
  // The east wall: the east gate (|v| < 1.6), a stretch of rubble.
  { u0: 7.3, u1: 8, v0: 1.6, v1: 3.5, h: 3.0 },
  { u0: 7.3, u1: 8, v0: 3.5, v1: 5, h: 0.9 },
  { u0: 7.3, u1: 8, v0: 5, v1: 9.3, h: 2.6 },
  // Inside: the wall closing the corner room (a 1.4 m way in beside the gallery's stair), the east partition.
  { u0: -4.2, u1: -2, v0: 4.2, v1: 4.8, h: 2.2 },
  { u0: 2.7, u1: 3.3, v0: 3, v1: 6.5, h: 2.4 },
  // A standing pier in the east court, between the breaches (waist high, their line was a clear 100 m
  // down the flank).
  { u0: 3.8, u1: 5.6, v0: -0.7, v1: 0.7, h: 3.2, mid: true },
  // Outside the south gate, a block to the west of the trench's mouth.
  { u0: -6.2, u1: -4.8, v0: 12, v1: 13, h: 1.0 },
];
/** Standing columns: u, v, radius, height (≥ 3: whole, with a capital). */
const COLUMNS: [number, number, number, number][] = [
  [-3.5, 6.8, 0.45, 2.0],
];
/** Fallen columns, lying: u, v (centre), along 'u' or 'v', length, radius. */
const FALLEN: [number, number, 'u' | 'v', number, number][] = [
  [5.4, 5.2, 'v', 2.4, 0.5],
  [4.7, 13, 'u', 2.4, 0.5],
];

export function buildRuins(k: RuinsKit): RuinsResult {
  const { col, rnd } = k;
  const out: RuinsResult = { nodes: [], links: [], cover: [], goals: [], posts: [], hvas: [] };
  const R = RUINS;
  const G = R.gallery;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const drumGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sand0 = new THREE.Color('#b08655'), sand1 = new THREE.Color('#dcbb88');
  const low = (x0: number, z0: number, x1: number, z1: number) =>
    Math.min(desertHeight(x0, z0), desertHeight(x1, z0), desertHeight(x0, z1), desertHeight(x1, z1), desertHeight((x0 + x1) / 2, (z0 + z1) / 2));
  const high = (x0: number, z0: number, x1: number, z1: number) => {
    let h = -Infinity;
    for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) h = Math.max(h, desertHeight(x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz));
    return h;
  };

  for (const flip of [false, true]) {
    const blocks: THREE.Matrix4[] = [], blockC: THREE.Color[] = [];
    const drums: THREE.Matrix4[] = [], drumC: THREE.Color[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const shade = () => sand0.clone().lerp(sand1, rnd());
    const put = (list: THREE.Matrix4[], cl: THREE.Color[], x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
      list.push(new THREE.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz)));
      cl.push(shade());
    };
    /** World x, z of local (u, v). */
    const X = (u: number) => (flip ? -(R.cx + u) : R.cx + u);
    const Z = (v: number) => (flip ? -v : v);
    /** A local rect (v already mirrored) as a world rect. */
    const rect = (u0: number, v0: number, u1: number, v1: number): [number, number, number, number] => {
      const [xa, xb, za, zb] = [X(u0), X(u1), Z(v0), Z(v1)];
      return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
    };
    const node = (u: number, v: number, y?: number) => out.nodes.push(new THREE.Vector3(X(u), y ?? desertHeight(X(u), Z(v)), Z(v))) - 1;
    const at = (u: number, v: number, y?: number) => new THREE.Vector3(X(u), y ?? desertHeight(X(u), Z(v)), Z(v));

    /** Lay courses of blocks filling a box (seen only): along its longer side, running bond, a little off true. */
    const lay = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
      const alongX = x1 - x0 >= z1 - z0;
      const [a0, a1, c0, c1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
      const n = Math.max(1, Math.round((y1 - y0) / COURSE));
      const ch = (y1 - y0) / n;
      for (let i = 0; i < n; i++) {
        let a = a0 - (i % 2 ? BLOCK / 2 : 0) - rnd() * 0.2;
        while (a < a1 - 0.01) {
          const b0 = Math.max(a, a0), b1 = Math.min(a + BLOCK, a1);
          a += BLOCK;
          if (b1 - b0 < 0.05) continue;
          const m = (b0 + b1) / 2, cm = (c0 + c1) / 2 + (rnd() - 0.5) * 0.03, y = y0 + (i + 0.5) * ch;
          const yaw = (rnd() - 0.5) * 0.02;
          if (alongX) put(blocks, blockC, m, y, cm, b1 - b0, ch, c1 - c0, 0, yaw, 0);
          else put(blocks, blockC, cm, y, m, c1 - c0, ch, b1 - b0, 0, yaw, 0);
        }
      }
    };
    /** A wall (or a fallen block): laid and solid; ≤ 1.3 m high, vaulted. */
    const wall = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
      lay(x0, z0, x1, z1, y0, y1);
      const c = col.add(x0, y0, z0, x1, y1, z1, 'concrete');
      if (y1 - high(x0, z0, x1, z1) <= 1.3) c.vault = true;
      return c;
    };
    /** A standing column of drums (a capital on a whole one). */
    const column = (u: number, v: number, r: number, h: number, base?: number) => {
      const x = X(u), z = Z(v);
      const y0 = base ?? desertHeight(x, z) - 0.4, y1 = (base ?? desertHeight(x, z)) + h;
      const n = Math.max(1, Math.round((y1 - y0) / DRUM));
      for (let i = 0; i < n; i++) put(drums, drumC, x + (rnd() - 0.5) * 0.02, y0 + ((i + 0.5) * (y1 - y0)) / n, z + (rnd() - 0.5) * 0.02, r, (y1 - y0) / n, r, 0, rnd() * Math.PI, 0);
      col.addCylinder(x, z, r, y0, y1, 'concrete');
      if (h >= 3) {
        put(blocks, blockC, x, y1 + 0.14, z, r * 2.6, 0.28, r * 2.6);
        col.add(x - r * 1.3, y1, z - r * 1.3, x + r * 1.3, y1 + 0.28, z + r * 1.3, 'concrete');
      }
    };
    /** A fallen column, lying (drums end to end), vaulted. */
    const fallen = (u: number, v: number, axis: 'u' | 'v', len: number, r: number) => {
      const alongX = axis === 'u';
      const [x0, z0, x1, z1] = alongX ? rect(u - len / 2, v - r, u + len / 2, v + r) : rect(u - r, v - len / 2, u + r, v + len / 2);
      const g = low(x0, z0, x1, z1);
      const n = Math.max(1, Math.round(len / DRUM));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = alongX ? x0 + (x1 - x0) * t : (x0 + x1) / 2, z = alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
        put(drums, drumC, x, g + r - 0.08, z, r, len / n - 0.03, r, alongX ? 0 : Math.PI / 2, rnd() * 0.2, alongX ? Math.PI / 2 : 0);
      }
      col.add(x0, g - 0.3, z0, x1, g + 2 * r - 0.08, z1, 'concrete').vault = true;
    };

    for (const mirror of [1, -1]) {
      const M = (v: number) => v * mirror;
      for (const w of WALLS) {
        if (w.mid && mirror < 0) continue;
        const [x0, z0, x1, z1] = rect(w.u0, M(w.v0), w.u1, M(w.v1));
        wall(x0, z0, x1, z1, low(x0, z0, x1, z1) - 0.3, high(x0, z0, x1, z1) + w.h);
      }
      for (const [u, v, r, h] of COLUMNS) column(u, M(v), r, h);
      for (const [u, v, axis, len, r] of FALLEN) fallen(u, M(v), axis, len, r);
      // The gate (south, and north): two piers under a lintel, 2.8 m between them, over the trench's line.
      {
        const pa = rect(-3.4, M(9.25), -2.4, M(10.05)), pb = rect(0.4, M(9.25), 1.4, M(10.05));
        const top = Math.max(high(...pa), high(...pb)) + GATE_H;
        for (const pr of [pa, pb]) wall(pr[0], pr[1], pr[2], pr[3], low(...pr) - 0.3, top - 0.55);
        const [x0, z0, x1, z1] = rect(-3.4, M(9.3), 1.4, M(10));
        wall(x0, z0, x1, z1, top - 0.55, top);
      }
      // The arch's piers (its lintel spans the court's axis: built once, below).
      {
        const [x0, z0, x1, z1] = rect(-3.9, M(1.5), -3.1, M(2.3));
        wall(x0, z0, x1, z1, low(x0, z0, x1, z1) - 0.3, Math.max(high(...rect(-3.9, 1.5, -3.1, 2.3)), high(...rect(-3.9, -2.3, -3.1, -1.5))) + ARCH_H - 0.5);
      }
    }
    // The arch's lintel.
    {
      const top = Math.max(high(...rect(-3.9, 1.5, -3.1, 2.3)), high(...rect(-3.9, -2.3, -3.1, -1.5))) + ARCH_H;
      const [x0, z0, x1, z1] = rect(-3.9, -2.3, -3.1, 2.3);
      wall(x0, z0, x1, z1, top - 0.5, top);
    }
    // The well-house in the middle of the court: a drum of masonry over a head. (Waist high, the
    // gates' line ran over it: a clear 100 m sightline down the flank, trench to convoy.)
    {
      const x = X(0), z = Z(0), g = desertHeight(x, z);
      // (3.2 m: the court lies low, both ends of that line on higher sand; at 2.4 it passed 0.1 m over.)
      const H = WELL_H + 0.45;
      for (let i = 0; i < 5; i++) put(drums, drumC, x, g - 0.45 + ((i + 0.5) * H) / 5, z, 1.4 - i * 0.04, H / 5, 1.4 - i * 0.04, 0, rnd() * Math.PI, 0);
      col.addCylinder(x, z, 1.4, g - 0.45, g + WELL_H, 'concrete');
    }

    // The gallery: a masonry terrace along the west side, a stair down from either end into the
    // court's corner rooms, two broken columns on its east edge (cover up there).
    const [gx0, gz0, gx1, gz1] = rect(G.u0, -G.v, G.u1, G.v);
    const top = high(gx0, gz0, gx1, gz1) + G.up;
    wall(gx0, gz0, gx1, gz1, low(gx0, gz0, gx1, gz1) - 0.3, top);
    const um = (G.u0 + G.u1 - CHEEK) / 2;
    const edges: number[] = [];
    for (const mirror of [1, -1]) {
      const M = (v: number) => v * mirror;
      column(G.u1 - 0.4, M(1.5), 0.4, 1.1, top);
      // The stair: from the gallery's edge (v = G.v) down to the sand at v = G.ramp, steps laid in
      // masonry over a smooth ramp (what the feet walk on), filled under it (nothing walks under).
      const [rx0, rz0, rx1, rz1] = rect(G.u0, M(G.v), G.u1 - CHEEK, M(G.ramp));
      const footZ = Z(M(G.ramp)), topZ = Z(M(G.v));
      const foot = desertHeight(X(um), footZ) - 0.05;
      const STEPS = 6;
      for (let i = 0; i < STEPS; i++) {
        const va = G.ramp - ((i + 1) * (G.ramp - G.v)) / STEPS, vb = G.ramp - (i * (G.ramp - G.v)) / STEPS;
        const [sx0, sz0, sx1, sz1] = rect(G.u0, M(va), G.u1 - CHEEK, M(vb));
        // (Each step's tread at the ramp's height half way along it: the feet never sink more than half a rise.)
        lay(sx0, sz0, sx1, sz1, low(sx0, sz0, sx1, sz1) - 0.3, i === STEPS - 1 ? top : foot + ((i + 0.5) * (top - foot)) / STEPS);
      }
      col.addRamp(rx0, rz0, rx1, rz1, 'z', topZ < footZ ? top : foot, topZ < footZ ? foot : top);
      // Its cheek wall on the court side, 0.9 m over the treads, stepped with them: the stair is climbed
      // from its foot (the graph linked the corner room to its middle across the open side: bots walked
      // into the side and stuck, self-play).
      for (let i = 0; i < STEPS; i++) {
        const va = G.ramp - ((i + 1) * (G.ramp - G.v)) / STEPS, vb = G.ramp - (i * (G.ramp - G.v)) / STEPS;
        const [cx0, cz0, cx1, cz1] = rect(G.u1 - CHEEK, M(va), G.u1, M(vb));
        wall(cx0, cz0, cx1, cz1, low(cx0, cz0, cx1, cz1) - 0.3, foot + ((i + 1) * (top - foot)) / STEPS + 0.9);
      }
      // (In steps of ≤ 0.3 m: the feet are lifted onto a ramp within 0.5 m of it; with deeper steps a body
      // coming at the stair's side stood in the fill under it, stress.)
      const fills = Math.ceil((top - foot) / 0.3);
      for (let i = 0; i < fills; i++) {
        const za = rz0 + ((rz1 - rz0) * i) / fills, zb = rz0 + ((rz1 - rz0) * (i + 1)) / fills;
        const hAt = (zz: number) => foot + (top - foot) * (1 - Math.abs(zz - topZ) / Math.abs(footZ - topZ));
        col.add(rx0, foot - 0.5, za, rx1, Math.min(hAt(za), hAt(zb)) - 0.05, zb, 'concrete').floor = false;
      }
      // On the graph: the stair's foot, middle and top edge, onto the gallery's centre (shared).
      const n0 = node(um, M(G.ramp + 0.6), foot + 0.05), n1 = node(um, M((G.v + G.ramp) / 2), (top + foot) / 2), n2 = node(um, M(G.v - 0.9), top);
      out.links.push([n0, n1], [n1, n2]);
      edges.push(n2);
      // The gates, inside and out (south: the trench's mouth; the breach; east).
      const gi = node(-1, M(8)), go = node(-1, M(11.4));
      const bi = node(5, M(8.2)), bo = node(5, M(11.3));
      out.links.push([gi, go], [bi, bo]);
      // The court: the corner room, round the well-house, east of the partition.
      // (Along the wall: from the corner room's middle the column and the stair hid every other node.)
      node(-4.6, M(8.2));
      node(1.5, M(3));
      node(5.6, M(2.6));
      node(6.4, M(7.6));
      // Round the back of the stair (the gap between its foot and the south wall), out to the west.
      out.links.push([n0, node(-9.2, M(8.4))]);
      for (const [u, v] of [[-4.4, 5.9], [2.4, 1.8], [6.4, 2.4], [-2.4, 1], [1.2, 7.2], [4.2, 5.2]] as const) out.cover.push(at(u, M(v)));
      out.hvas.push(at(-4.6, M(8.2)), at(5.6, M(2.6)));
    }
    const centre = node(um, 0, top);
    for (const i of edges) out.links.push([i, centre]);
    const ei = node(6.5, 0), eo = node(9.4, 0);
    out.links.push([ei, eo]);
    node(2.6, 0);
    node(-2.3, 0);
    out.posts.push(at(um, 0, top));
    out.goals.push(at(um, 0, top), at(-4.6, 8.2), at(5.6, -2.6), at(2.6, 0));

    const inst = (name: string, geo: THREE.BufferGeometry, ms: THREE.Matrix4[], cs: THREE.Color[]) => {
      const im = new THREE.InstancedMesh(geo, k.mat, ms.length);
      ms.forEach((m, i) => {
        im.setMatrixAt(i, m);
        im.setColorAt(i, cs[i]);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = true;
      im.name = name;
      k.scene.add(im);
    };
    inst(flip ? 'ruinsBlocksE' : 'ruinsBlocksW', flip ? boxGeo.clone() : boxGeo, blocks, blockC);
    inst(flip ? 'ruinsDrumsE' : 'ruinsDrumsW', flip ? drumGeo.clone() : drumGeo, drums, drumC);
  }
  return out;
}
