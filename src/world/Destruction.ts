import * as THREE from 'three';
import type { Collider, CollisionWorld, RayHit, Surface } from './Collision';
import { StaticBuilder } from './Builder';

/*
  91.0, destructible walls (docs/DESTRUCTION_PLAN.md, step 2). A wall piece (a box, its thin side its
  thickness) is drawn whole until it is first hurt: then it becomes a grid of cells (~0.5 m, the full
  thickness each) with their own health.

    rounds     chip the cell they strike (and a little round it): brick and concrete need a long burst
               on one spot to open, boards a couple of rounds
    blasts     break every cell within their `breach`, hurt the ring past it to `crack`
    a cell     below half its health it crumbles (drawn smaller, a little askew: a ragged edge); at
               none it is gone (chunks and dust)
    support    a piece stands on its bottom row (and hangs from its top one: the eaves): what a hole
               cuts off from both falls, as chunks
    colliders  the piece's one box replaced by the fewest boxes over its cells still standing (greedy
               rectangles): rounds, bodies and sight pass through the holes

  Drawn: the whole pieces merged per material (a piece hidden by collapsing its 24 vertices), a broken
  piece as its own mesh of cells (a cell hidden the same way). Textures are laid in world space (a wall
  reads the same whole and broken). The chunks are `Debris` (simple physics, then rubble that sinks).
*/

export type WallKind = 'brick' | 'concrete' | 'wood';

export interface KindSpec {
  /** A cell's health. */
  hp: number;
  /** A round's damage to it × this. */
  round: number;
  /** The chunks' colour (linear-ish sRGB hex) and the sound of its breaking. */
  colour: number;
  sound: 'masonry' | 'wood';
}

export const KINDS: Record<WallKind, KindSpec> = {
  brick: { hp: 100, round: 0.45, colour: 0x8b5a43, sound: 'masonry' },
  concrete: { hp: 150, round: 0.3, colour: 0xb8b1a3, sound: 'masonry' },
  wood: { hp: 30, round: 0.9, colour: 0x8a6a48, sound: 'wood' },
};

/** A blast's bite out of a wall: every cell within `breach` m broken, `power` falling (squared) to nothing at `crack`. */
export interface BreachSpec {
  breach: number;
  crack: number;
  power: number;
}

/** What a cell takes from a blast `d` metres from it. */
export function breachDamage(d: number, s: BreachSpec): number {
  if (d <= s.breach) return Infinity;
  if (d >= s.crack) return 0;
  const t = 1 - (d - s.breach) / (s.crack - s.breach);
  return s.power * t * t;
}

/**
 * The fewest boxes (rectangles of cells, greedy: as wide as a row allows, then as tall as the rows
 * above keep that width) covering the cells set in `alive` (nu across, nv up; index u + v·nu).
 */
export function greedyRects(alive: ArrayLike<number>, nu: number, nv: number): [number, number, number, number][] {
  const used = new Uint8Array(nu * nv);
  const out: [number, number, number, number][] = [];
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const i = u + v * nu;
      if (!alive[i] || used[i]) continue;
      let u1 = u;
      while (u1 + 1 < nu && alive[u1 + 1 + v * nu] && !used[u1 + 1 + v * nu]) u1++;
      let v1 = v;
      grow: while (v1 + 1 < nv) {
        for (let k = u; k <= u1; k++) if (!alive[k + (v1 + 1) * nu] || used[k + (v1 + 1) * nu]) break grow;
        v1++;
      }
      for (let vv = v; vv <= v1; vv++) for (let k = u; k <= u1; k++) used[k + vv * nu] = 1;
      out.push([u, v, u1 + 1, v1 + 1]);
    }
  }
  return out;
}

/**
 * The cells standing that nothing holds up: not joined (side by side, or one over the other) to a
 * cell of the bottom row, or of the top row when `hangs`.
 */
export function unsupported(alive: ArrayLike<number>, nu: number, nv: number, hangs: boolean): number[] {
  const held = new Uint8Array(nu * nv);
  const stack: number[] = [];
  const seed = (v: number) => {
    for (let u = 0; u < nu; u++) {
      const i = u + v * nu;
      if (alive[i] && !held[i]) {
        held[i] = 1;
        stack.push(i);
      }
    }
  };
  seed(0);
  if (hangs && nv > 1) seed(nv - 1);
  while (stack.length) {
    const i = stack.pop()!;
    const u = i % nu, v = (i - u) / nu;
    for (const [du, dv] of NEIGHBOURS) {
      const a = u + du, b = v + dv;
      if (a < 0 || a >= nu || b < 0 || b >= nv) continue;
      const j = a + b * nu;
      if (alive[j] && !held[j]) {
        held[j] = 1;
        stack.push(j);
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < nu * nv; i++) if (alive[i] && !held[i]) out.push(i);
  return out;
}
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const AX = ['x', 'y', 'z'] as const;
type Ax = (typeof AX)[number];

/** A box's 24 vertices (non-indexed: 36) with its UVs laid in world space (`tile` m a texture repeat). */
function cellBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile: number) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}
/** Vertices a box takes (non-indexed). */
const BOX_V = 36;

interface Piece {
  min: THREE.Vector3;
  max: THREE.Vector3;
  mat: THREE.Material;
  kind: WallKind;
  surface: Surface;
  tile: number;
  /** The thin axis, and the two the cells run along (v: up for a wall). */
  t: Ax;
  ua: Ax;
  va: Ax;
  nu: number;
  nv: number;
  cu: number;
  cv: number;
  /** Hangs from its top row too (a wall up to the eaves). */
  hangs: boolean;
  vault: boolean;
  /** Its colliders now (one box whole). */
  cols: Collider[];
  /** Whole: where its vertices sit in its material's merged mesh. */
  whole: { mesh: THREE.Mesh; start: number };
  /** Broken: the cells' health and state (1 standing), their mesh. */
  hp: Float32Array | null;
  alive: Uint8Array | null;
  cells: THREE.Mesh | null;
  /** The cells' resting vertices (to crumble them from). */
  rest: Float32Array | null;
  crumbled: Uint8Array | null;
}

export interface DestructionHooks {
  /** A cell broke at `p` (chunks: `chunks` of them; dust): the debris and the sound. */
  broke(p: THREE.Vector3, kind: WallKind, size: number, falling: boolean): void;
  /** The world changed (the static shadows, the bots' maps). */
  changed(): void;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Destruction {
  readonly pieces: Piece[] = [];
  /** Each whole mesh's vertices as built (a reset puts them back). */
  private wholeRest = new Map<THREE.Mesh, Float32Array>();
  private pending: { min: THREE.Vector3; max: THREE.Vector3; mat: THREE.Material; piece: Piece }[] = [];
  /** DEV: pieces broken open, cells gone, fallen. */
  stats = { opened: 0, cells: 0, fell: 0 };

  constructor(private scene: THREE.Scene, private col: CollisionWorld, private hooks: DestructionHooks) {}

  /**
   * A destructible box (its collider added now, in the map's order; drawn at `build`). `hangs`: it
   * reaches the eaves (held from its top too). Returns the collider.
   */
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, kind: WallKind, surface: Surface = 'concrete', opts: { tile?: number; hangs?: boolean; vault?: boolean; cell?: number } = {}): Collider {
    const min = new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1));
    const max = new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
    const size = max.clone().sub(min);
    // The thin side is its thickness; of the other two, y runs up when it is one of them.
    const t: Ax = size.x <= size.z && size.x <= size.y ? 'x' : size.z <= size.y ? 'z' : 'y';
    const rest = AX.filter((a) => a !== t);
    const va: Ax = rest.includes('y') ? 'y' : rest[1];
    const ua: Ax = rest.find((a) => a !== va)!;
    const cell = opts.cell ?? (kind === 'wood' ? 0.4 : 0.5);
    const nu = Math.max(1, Math.round(size[ua] / cell)), nv = Math.max(1, Math.round(size[va] / cell));
    const c = this.col.add(min.x, min.y, min.z, max.x, max.y, max.z, surface);
    if (opts.vault !== undefined) c.vault = opts.vault;
    const piece: Piece = {
      min, max, mat, kind, surface, tile: opts.tile ?? 2, t, ua, va, nu, nv, cu: size[ua] / nu, cv: size[va] / nv,
      hangs: !!opts.hangs, vault: !!c.vault, cols: [c], whole: null as never, hp: null, alive: null, cells: null, rest: null, crumbled: null,
    };
    this.tag(c, piece);
    this.pieces.push(piece);
    this.pending.push({ min, max, mat, piece });
    StaticBuilder.registry?.push({ box: new THREE.Box3(min.clone(), max.clone()), mat, verts: 24 });
    return c;
  }

  /** The whole pieces into one mesh per material. */
  build() {
    const by = new Map<THREE.Material, typeof this.pending>();
    for (const p of this.pending) (by.get(p.mat) ?? by.set(p.mat, []).get(p.mat)!).push(p);
    for (const [mat, list] of by) {
      const pos = new Float32Array(list.length * BOX_V * 3), nor = new Float32Array(list.length * BOX_V * 3), uv = new Float32Array(list.length * BOX_V * 2);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      list.forEach((e, k) => {
        const g = cellBox(e.min.x, e.min.y, e.min.z, e.max.x, e.max.y, e.max.z, e.piece.tile);
        pos.set(g.attributes.position.array as Float32Array, k * BOX_V * 3);
        nor.set(g.attributes.normal.array as Float32Array, k * BOX_V * 3);
        uv.set(g.attributes.uv.array as Float32Array, k * BOX_V * 2);
        g.dispose();
        e.piece.whole = { mesh, start: k * BOX_V };
      });
      const geo = mesh.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.wholeRest.set(mesh, pos.slice());
    }
    this.pending.length = 0;
  }

  /** Every piece whole again (a new match on the same map): its box drawn, its one collider back. */
  reset() {
    let any = false;
    for (const piece of this.pieces) {
      if (!piece.hp) continue;
      piece.hp = piece.alive = piece.crumbled = null;
      if (!piece.cells) continue;
      any = true;
      for (const c of piece.cols) this.col.remove(c);
      const c = this.col.add(piece.min.x, piece.min.y, piece.min.z, piece.max.x, piece.max.y, piece.max.z, piece.surface);
      c.vault = piece.vault;
      this.tag(c, piece);
      piece.cols = [c];
      this.scene.remove(piece.cells);
      piece.cells.geometry.dispose();
      piece.cells = null;
      piece.hp = piece.alive = piece.crumbled = piece.rest = null;
    }
    if (!any) return;
    for (const [mesh, rest] of this.wholeRest) {
      const a = mesh.geometry.attributes.position as THREE.BufferAttribute;
      (a.array as Float32Array).set(rest);
      a.clearUpdateRanges();
      a.needsUpdate = true;
    }
    this.stats = { opened: 0, cells: 0, fell: 0 };
    this.hooks.changed();
  }

  private tag(c: Collider, piece: Piece) {
    c.wreck = (hit, _dir, dmg) => this.roundHit(piece, hit.point, dmg);
  }

  /** The cell of `piece` under world point `p` (clamped into it). */
  private cellAt(piece: Piece, p: THREE.Vector3) {
    const u = Math.min(piece.nu - 1, Math.max(0, Math.floor((p[piece.ua] - piece.min[piece.ua]) / piece.cu)));
    const v = Math.min(piece.nv - 1, Math.max(0, Math.floor((p[piece.va] - piece.min[piece.va]) / piece.cv)));
    return u + v * piece.nu;
  }

  /** A cell's centre. */
  private centre(piece: Piece, i: number, out: THREE.Vector3) {
    const u = i % piece.nu, v = (i - u) / piece.nu;
    out.set((piece.min.x + piece.max.x) / 2, (piece.min.y + piece.max.y) / 2, (piece.min.z + piece.max.z) / 2);
    out[piece.ua] = piece.min[piece.ua] + (u + 0.5) * piece.cu;
    out[piece.va] = piece.min[piece.va] + (v + 0.5) * piece.cv;
    return out;
  }

  /** A round struck `piece` at `p` with `dmg` (a gun's damage): its cell chipped, its four neighbours a third as much. */
  roundHit(piece: Piece, p: THREE.Vector3, dmg: number) {
    const k = KINDS[piece.kind].round * dmg;
    if (k <= 0) return;
    this.open(piece);
    const i = this.cellAt(piece, p);
    const u = i % piece.nu, v = (i - u) / piece.nu;
    const hits: [number, number][] = [[i, k]];
    for (const [du, dv] of NEIGHBOURS) {
      const a = u + du, b = v + dv;
      if (a >= 0 && a < piece.nu && b >= 0 && b < piece.nv) hits.push([a + b * piece.nu, k * 0.35]);
    }
    this.hurt(piece, hits);
  }

  /** A blast at `at`: every piece in reach bitten into (`s`; wood takes it 2.5× over). */
  blast(at: THREE.Vector3, s: BreachSpec) {
    for (const piece of this.pieces) {
      // Its box within reach?
      _q.set(THREE.MathUtils.clamp(at.x, piece.min.x, piece.max.x), THREE.MathUtils.clamp(at.y, piece.min.y, piece.max.y), THREE.MathUtils.clamp(at.z, piece.min.z, piece.max.z));
      if (_q.distanceTo(at) >= s.crack) continue;
      const k = piece.kind === 'wood' ? 2.5 : 1;
      const hits: [number, number][] = [];
      // (The cells near enough: from the box's own grid, every cell of a whole piece is only a few hundred.)
      for (let i = 0; i < piece.nu * piece.nv; i++) {
        if (piece.alive && !piece.alive[i]) continue;
        const d = this.centre(piece, i, _p).distanceTo(at);
        const dm = breachDamage(d, s) * k;
        if (dm > 0) hits.push([i, dm]);
      }
      if (!hits.length) continue;
      this.open(piece);
      this.hurt(piece, hits);
    }
  }

  /** The piece's cells' health (its first hurt; drawn whole still: a chip shows nothing until a cell crumbles). */
  private open(piece: Piece) {
    if (piece.hp) return;
    const n = piece.nu * piece.nv;
    piece.hp = new Float32Array(n).fill(KINDS[piece.kind].hp);
    piece.alive = new Uint8Array(n).fill(1);
    piece.crumbled = new Uint8Array(n);
  }

  /** The piece drawn as cells (its first crumble or break): its whole box hidden, its cells' mesh made. */
  private draw(piece: Piece) {
    if (piece.cells) return;
    this.stats.opened++;
    const n = piece.nu * piece.nv;
    const pos = new Float32Array(n * BOX_V * 3), nor = new Float32Array(n * BOX_V * 3), uv = new Float32Array(n * BOX_V * 2);
    const lo = new THREE.Vector3(), hi = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = i % piece.nu, v = (i - u) / piece.nu;
      lo.copy(piece.min);
      hi.copy(piece.max);
      lo[piece.ua] = piece.min[piece.ua] + u * piece.cu;
      hi[piece.ua] = lo[piece.ua] + piece.cu;
      lo[piece.va] = piece.min[piece.va] + v * piece.cv;
      hi[piece.va] = lo[piece.va] + piece.cv;
      const g = cellBox(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, piece.tile);
      pos.set(g.attributes.position.array as Float32Array, i * BOX_V * 3);
      nor.set(g.attributes.normal.array as Float32Array, i * BOX_V * 3);
      uv.set(g.attributes.uv.array as Float32Array, i * BOX_V * 2);
      g.dispose();
    }
    piece.rest = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, piece.mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    piece.cells = mesh;
    // Hide the whole box.
    const w = piece.whole;
    const wp = w.mesh.geometry.attributes.position as THREE.BufferAttribute;
    (wp.array as Float32Array).fill(0, w.start * 3, (w.start + BOX_V) * 3);
    wp.addUpdateRange(w.start * 3, BOX_V * 3);
    wp.needsUpdate = true;
  }

  /** Damage to cells ([index, amount]); then what broke, crumbled and fell; the colliders anew. */
  private hurt(piece: Piece, hits: [number, number][]) {
    const hp = piece.hp!, alive = piece.alive!;
    const full = KINDS[piece.kind].hp;
    let broke = 0;
    let lo = Infinity, hi = -Infinity;
    const touch = (i: number) => {
      lo = Math.min(lo, i);
      hi = Math.max(hi, i);
    };
    for (const [i, dm] of hits) {
      if (!alive[i]) continue;
      hp[i] -= dm;
      if (hp[i] < full * 0.5) this.draw(piece);
      if (hp[i] <= 0) {
        this.remove(piece, i, false);
        touch(i);
        broke++;
      } else if (hp[i] < full * 0.5 && !piece.crumbled![i]) {
        piece.crumbled![i] = 1;
        this.crumble(piece, i);
        touch(i);
      }
    }
    if (broke) {
      // What the hole cut loose falls.
      for (const i of unsupported(alive, piece.nu, piece.nv, piece.hangs)) {
        this.remove(piece, i, true);
        touch(i);
        this.stats.fell++;
      }
      this.recollide(piece);
      this.hooks.changed();
    }
    if (hi >= lo) {
      const pos = piece.cells!.geometry.attributes.position as THREE.BufferAttribute;
      pos.addUpdateRange(lo * BOX_V * 3, (hi - lo + 1) * BOX_V * 3);
      pos.needsUpdate = true;
    }
  }

  /** A cell gone: its vertices collapsed; chunks and dust (`falling`: it drops whole). */
  private remove(piece: Piece, i: number, falling: boolean) {
    piece.alive![i] = 0;
    this.stats.cells++;
    const a = piece.cells!.geometry.attributes.position.array as Float32Array;
    a.fill(0, i * BOX_V * 3, (i + 1) * BOX_V * 3);
    this.hooks.broke(this.centre(piece, i, _p).clone(), piece.kind, Math.min(piece.cu, piece.cv), falling);
  }

  /** A cell drawn smaller and askew about its centre (a hash of its index: the same every time). */
  private crumble(piece: Piece, i: number) {
    const a = piece.cells!.geometry.attributes.position.array as Float32Array;
    const r = piece.rest!;
    const c = this.centre(piece, i, _p);
    const h = (n: number) => {
      const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const s = [0.72 + 0.2 * h(1), 0.72 + 0.2 * h(2), 0.72 + 0.2 * h(3)];
    const o = [(h(4) - 0.5) * 0.1, (h(5) - 0.5) * 0.1, (h(6) - 0.5) * 0.1];
    // The thickness keeps more of itself (a chipped face, not a gap through).
    s[AX.indexOf(piece.t)] = 0.85 + 0.1 * h(7);
    o[AX.indexOf(piece.t)] *= 0.3;
    for (let v = i * BOX_V; v < (i + 1) * BOX_V; v++) {
      a[v * 3] = c.x + (r[v * 3] - c.x) * s[0] + o[0] * piece.cu;
      a[v * 3 + 1] = c.y + (r[v * 3 + 1] - c.y) * s[1] + o[1] * piece.cv;
      a[v * 3 + 2] = c.z + (r[v * 3 + 2] - c.z) * s[2] + o[2] * piece.cu;
    }
  }

  /** The piece's colliders: the old ones out, a box per greedy rectangle of what stands. */
  private recollide(piece: Piece) {
    for (const c of piece.cols) this.col.remove(c);
    piece.cols = [];
    for (const [u0, v0, u1, v1] of greedyRects(piece.alive!, piece.nu, piece.nv)) {
      const lo = piece.min.clone(), hi = piece.max.clone();
      lo[piece.ua] = piece.min[piece.ua] + u0 * piece.cu;
      hi[piece.ua] = piece.min[piece.ua] + u1 * piece.cu;
      lo[piece.va] = piece.min[piece.va] + v0 * piece.cv;
      hi[piece.va] = piece.min[piece.va] + v1 * piece.cv;
      const c = this.col.add(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, piece.surface);
      // 92.0: what's left of a wall below the waist can be vaulted (its foot after a hole).
      c.vault = hi.y - piece.min.y <= 1.05;
      this.tag(c, piece);
      piece.cols.push(c);
    }
  }

  /** DEV: how much of the map is broken. */
  debug() {
    return { pieces: this.pieces.length, ...this.stats };
  }
}

export type { RayHit };
