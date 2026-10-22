import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

/** 33.0: when the ranked entries all fail, how many of the nodes nearest the walker are tried. */
const NEAREST_TRIES = 16;

export interface NavLayout {
  /** Node positions at floor level (y = surface height). */
  nodes: THREE.Vector3[];
  /** Hand-authored links, used for stairs (auto links only join nodes on the same level). */
  links: [number, number][];
  /**
   * Open terrain: auto links may also climb this much per metre (dunes). Floor continuity is still
   * checked along the link, so a roof never links to the ground below it. Default 0 (flat levels).
   */
  slope?: number;
  /**
   * 14.0: one-way drop-downs, [from, to]: a roof or landing edge to the floor below it (walk off the
   * edge, fall). Only the arena bots' routes take them (the vault graph); survival never does.
   */
  drops?: [number, number][];
  /**
   * 18.0: a link's cost as a multiple of its length (default 1), from its two ends at body height.
   * A map makes a route it wants walked cheaper (Maglev Terminal: the train's aisle), so the graph's
   * shortest ways pass through it. Survival and arena routes alike.
   */
  cost?: (a: THREE.Vector3, b: THREE.Vector3) => number;
  /**
   * 19.0: reject automatic links that cross a vertical face (the floor jumping more than 0.45 m
   * between samples 0.75 m apart: terrain under 22° never does). Needed where `slope` lets links
   * climb and built terraces stand on the terrain (Crash Site's temple): without it a T1 node linked to
   * a stair's middle across its side. Default off (the other maps' graphs as they were).
   */
  faces?: boolean;
}

/** Probe height above the floor for walkability rays, plus a knee-high ray for low obstacles. */
const BODY = 1;
export const KNEE = 0.4;
/** 7.0: a wall an arena bot vaults is at most this tall (floor to top), and its rays fly over it here. */
export const VAULT_MAX = 1.35;
const OVER = 1.5;

/**
 * Hand-placed waypoint graph over both walkable levels. Nodes on the same level are linked
 * automatically when a body-wide corridor between them is clear; stairs are linked by hand.
 */
export class Nav {
  nodes: THREE.Vector3[] = [];
  edges: number[][] = [];
  /**
   * 7.0: the edges plus links across low walls marked vaultable (arena bots only; built on first
   * request). Survival routes never see them.
   */
  vaultEdges: number[][] | null = null;
  /** 14.0: drop-downs out of each node, and into each node (the reverse search walks these). */
  dropsOut: number[][] = [];
  dropsIn: number[][] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private d = new THREE.Vector3();

  /**
   * 19.0: nodes on hand links that climb (stairs, ramps, ladders of nodes). A walker never skips one:
   * from beside a low stair (1–1.5 m) the node beyond it looks level and clear over the steps' edge,
   * and a body heading straight for it walks into the stair's side (L-127, levelAI on Crash Site's temple).
   */
  climb = new Set<number>();
  private climbLinks: [number, number][] = [];
  private slope: number;
  private cost: ((a: THREE.Vector3, b: THREE.Vector3) => number) | null;

  constructor(private col: CollisionWorld, layout: NavLayout) {
    this.slope = layout.slope ?? 0;
    this.cost = layout.cost ?? null;
    // Stored at body height so LOS checks start from the chest of a standing enemy.
    this.nodes = layout.nodes.map((p) => new THREE.Vector3(p.x, p.y + BODY, p.z));
    this.edges = this.nodes.map(() => []);
    const link = (i: number, j: number) => {
      if (!this.edges[i].includes(j)) this.edges[i].push(j);
      if (!this.edges[j].includes(i)) this.edges[j].push(i);
    };
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const ni = this.nodes[i], nj = this.nodes[j];
        // 19.0 (`faces`): the slope allowance is for the terrain's hummocks; between built floors (a
        // terrace, a stair) a link climbs no more than anywhere else.
        const terrain = !layout.faces || (this.onTerrain(ni) && this.onTerrain(nj));
        const rise = 0.5 + (terrain ? (layout.slope ?? 0) * Math.hypot(ni.x - nj.x, ni.z - nj.z) : 0);
        if (Math.abs(ni.y - nj.y) > rise) continue;
        if (ni.distanceTo(nj) < 14 && this.clear(ni, nj) && this.walkable(ni, nj) && (!layout.faces || this.faceless(ni, nj))) link(i, j);
      }
    }
    for (const [i, j] of layout.links) {
      link(i, j);
      // 19.0: a hand link that climbs (a stair's foot, middle and top) must be walked node by node.
      if (Math.abs(this.nodes[i].y - this.nodes[j].y) > 0.3) {
        this.climb.add(i).add(j);
        this.climbLinks.push([i, j]);
      }
    }
    this.dropsOut = this.nodes.map(() => []);
    this.dropsIn = this.nodes.map(() => []);
    for (const [i, j] of layout.drops ?? []) {
      this.dropsOut[i].push(j);
      this.dropsIn[j].push(i);
    }
  }

  /** Walkable corridor between two body-height points: three parallel rays plus one at knee height. */
  clear(a: THREE.Vector3, b: THREE.Vector3) {
    const side = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(0.35);
    const drop = BODY - KNEE;
    return (
      this.col.lineOfSight(a, b) &&
      this.col.lineOfSight(this.a.copy(a).add(side), this.b.copy(b).add(side)) &&
      this.col.lineOfSight(this.a.copy(a).sub(side), this.b.copy(b).sub(side)) &&
      this.col.lineOfSight(this.a.set(a.x, a.y - drop, a.z), this.b.set(b.x, b.y - drop, b.z))
    );
  }

  /**
   * 7.0: a body can cross from a to b by vaulting: the corridor is clear above the low walls (three
   * rays at 1.5 m), and whatever stops the knee and body rays is a vaultable wall no taller than
   * VAULT_MAX. Rocks, ruins and trucks still block.
   */
  clearVault(a: THREE.Vector3, b: THREE.Vector3) {
    const side = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(0.35);
    const up = OVER - BODY;
    const ok =
      this.col.lineOfSight(this.a.set(a.x, a.y + up, a.z), this.b.set(b.x, b.y + up, b.z)) &&
      this.col.lineOfSight(this.a.set(a.x + side.x, a.y + up, a.z + side.z), this.b.set(b.x + side.x, b.y + up, b.z + side.z)) &&
      this.col.lineOfSight(this.a.set(a.x - side.x, a.y + up, a.z - side.z), this.b.set(b.x - side.x, b.y + up, b.z - side.z));
    return ok && this.onlyVaults(a, b, KNEE - BODY) && this.onlyVaults(a, b, 0);
  }

  /** Every hit along a→b (lowered by `dy`) is a vaultable wall low enough to vault. */
  private onlyVaults(a: THREE.Vector3, b: THREE.Vector3, dy: number) {
    const o = this.a.set(a.x, a.y + dy, a.z);
    const dir = this.d.set(b.x - a.x, b.y - a.y, b.z - a.z);
    let left = dir.length();
    dir.divideScalar(left || 1);
    for (let k = 0; k < 6 && left > 0.05; k++) {
      const hit = this.col.raycast(o, dir, left);
      if (!hit) return true;
      const c = hit.collider;
      if (!c || !c.vault || c.max.y - (a.y - BODY) > VAULT_MAX) return false;
      // Carry on from the far side of this wall.
      const step = hit.dist + 0.05;
      const exit = this.exitDist(c, o, dir);
      o.addScaledVector(dir, Math.max(step, exit + 0.05));
      left -= Math.max(step, exit + 0.05);
    }
    return left <= 0.05;
  }

  /** Distance along a ray to where it leaves a box collider (XZ slab test). */
  private exitDist(c: { min: THREE.Vector3; max: THREE.Vector3 }, o: THREE.Vector3, d: THREE.Vector3) {
    let t = Infinity;
    if (Math.abs(d.x) > 1e-6) t = Math.min(t, Math.max((c.min.x - o.x) / d.x, (c.max.x - o.x) / d.x));
    if (Math.abs(d.z) > 1e-6) t = Math.min(t, Math.max((c.min.z - o.z) / d.z, (c.max.z - o.z) / d.z));
    return t === Infinity ? 0 : Math.max(0, t);
  }

  /** 7.0: build the vault links once (arena levels call it at match start, outside any frame budget). */
  ensureVaultLinks(slope = this.slope) {
    if (this.vaultEdges) return this.vaultEdges;
    const ve = this.edges.map((e) => e.slice());
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (ve[i].includes(j)) continue;
        const ni = this.nodes[i], nj = this.nodes[j];
        const rise = 0.5 + slope * Math.hypot(ni.x - nj.x, ni.z - nj.z);
        if (Math.abs(ni.y - nj.y) > rise || ni.distanceTo(nj) >= 14) continue;
        if (this.clearVault(ni, nj) && this.walkable(ni, nj)) {
          ve[i].push(j);
          ve[j].push(i);
        }
      }
    }
    this.vaultEdges = ve;
    return ve;
  }

  /**
   * There is floor all the way between two body-height points (no alley, stairwell or roof edge in
   * between). Line of sight alone would happily link two rooftops across a street.
   */
  /** 19.0: a node standing on the terrain itself (not on a built floor above it). */
  private onTerrain(n: THREE.Vector3) {
    const t = this.col.terrain;
    return !!t && Math.abs(t.height(n.x, n.z) - (n.y - BODY)) < 0.08;
  }

  /** 19.0: no vertical face along a → b (the floor never jumps more than 0.45 m between samples). */
  faceless(a: THREE.Vector3, b: THREE.Vector3) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.75));
    let prev = a.y - BODY;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const feet = a.y + (b.y - a.y) * t - BODY;
      const g = this.col.groundHeightAt(x, z, 0.2, feet, 0.8);
      if (Math.abs(g - prev) > 0.45) return false;
      prev = g;
    }
    return true;
  }

  walkable(a: THREE.Vector3, b: THREE.Vector3) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.75));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const feet = a.y + (b.y - a.y) * t - BODY;
      const g = this.col.groundHeightAt(x, z, 0.2, feet, 0.7);
      if (g < feet - 0.7) return false;
    }
    return true;
  }

  /**
   * Best node to start or end a path at: visible, close, and on (or near) the same level. Height
   * differences weigh heavily, so halfway up a stair the stair's own nodes win over the street below.
   */
  nearestVisible(q: THREE.Vector3): number {
    const cand: { i: number; s: number }[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const dy = n.y - q.y;
      cand.push({ i, s: (n.x - q.x) ** 2 + (n.z - q.z) ** 2 + dy * dy * 9 });
    }
    cand.sort((a, b) => a.s - b.s);
    // Rays are the expensive part: test in order of preference. A node a body can walk straight to
    // (corridor clear down to knee height) wins over one merely visible across a low barrier — ending a
    // route there would leave the walker pressed against the barrier. Fall back to the nearest visible.
    let visible = -1;
    let tried = 0;
    for (let k = 0; k < cand.length; k++) {
      const n = this.nodes[cand[k].i];
      if (!this.col.lineOfSight(q, n) || !this.walkable(q, n)) continue;
      if (this.clear(q, n)) return cand[k].i;
      if (visible < 0) visible = cand[k].i;
      if (++tried >= 12) break;
    }
    return visible;
  }

  /** Dijkstra; returns node indices from start to goal. */
  path(from: number, to: number): number[] {
    const n = this.nodes.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    dist[from] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = true;
      if (u === to) break;
      for (const v of this.edges[u]) {
        const nd = dist[u] + this.nodes[u].distanceTo(this.nodes[v]);
        if (nd < dist[v]) {
          dist[v] = nd;
          prev[v] = u;
        }
      }
    }
    const out: number[] = [];
    for (let v = to; v >= 0; v = prev[v]) out.unshift(v);
    return out[0] === from ? out : [];
  }

  /**
   * Shortest distances from every node to `goal`, plus the next hop towards it. Dijkstra with a
   * binary heap (5.0; was an O(n²) scan), memoised per goal node: a squad hunting one spot asks
   * for the same field over and over. The memo is dropped whenever links change.
   */
  /** 25.0: a link's cost multiplier by the route's kind (TdmData.navBias), set while a match runs. */
  bias: ((a: THREE.Vector3, b: THREE.Vector3, kind: 'low' | 'high') => number) | null = null;
  private fields = new Map<number, { dist: Float64Array; next: Int32Array }>();
  private vaultFields = new Map<number, { dist: Float64Array; next: Int32Array }>();
  /** Fields computed vs served from the memo; 33.0: routes entered by the nearest-node fallback (DEV counters). */
  stats = { computed: 0, cached: 0, nearestEntries: 0 };
  private toward(goal: number, vault = false, kind: 'low' | 'high' | null = null) {
    const memo = vault ? this.vaultFields : this.fields;
    const edges = vault ? this.vaultEdges! : this.edges;
    // 25.0: one memo entry per goal and bias kind.
    if (!this.bias) kind = null;
    const key = kind === null ? goal : kind === 'low' ? -1 - goal * 2 : -2 - goal * 2;
    const hit = memo.get(key);
    if (hit) {
      // Refresh its place in the (insertion-ordered) memo.
      memo.delete(goal);
      memo.set(goal, hit);
      this.stats.cached++;
      return hit;
    }
    this.stats.computed++;
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[goal] = 0;
    // Heap of (distance, node) with lazy deletion.
    const hd: number[] = [0];
    const hn: number[] = [goal];
    const push = (d: number, v: number) => {
      let i = hd.length;
      hd.push(d);
      hn.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hd[p] <= hd[i]) break;
        [hd[p], hd[i]] = [hd[i], hd[p]];
        [hn[p], hn[i]] = [hn[i], hn[p]];
        i = p;
      }
    };
    const pop = () => {
      const v = hn[0];
      const ld = hd.pop()!, ln = hn.pop()!;
      if (hd.length) {
        hd[0] = ld;
        hn[0] = ln;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < hd.length && hd[l] < hd[m]) m = l;
          if (r < hd.length && hd[r] < hd[m]) m = r;
          if (m === i) break;
          [hd[m], hd[i]] = [hd[i], hd[m]];
          [hn[m], hn[i]] = [hn[i], hn[m]];
          i = m;
        }
      }
      return v;
    };
    while (hd.length) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      const du = dist[u];
      const nu = this.nodes[u];
      const relax = (v: number) => {
        if (done[v]) return;
        const nv = this.nodes[v];
        const nd = du + nu.distanceTo(nv) * (this.cost ? this.cost(nu, nv) : 1) * (kind ? this.bias!(nu, nv, kind) : 1);
        if (nd < dist[v]) {
          dist[v] = nd;
          next[v] = u;
          push(nd, v);
        }
      };
      for (const v of edges[u]) relax(v);
      // The field is searched backwards from the goal: a drop v → u is taken from v, so it relaxes v.
      if (vault) for (const v of this.dropsIn[u]) relax(v);
    }
    const f = { dist, next };
    memo.set(key, f);
    if (memo.size > 48) memo.delete(memo.keys().next().value!);
    return f;
  }

  /**
   * Route from a body-height position to a goal position: enters the graph at the reachable node with
   * the lowest (distance to it + remaining distance to the goal), so an agent never walks back to a
   * node behind it just because that node happens to be the closest.
   */
  route(from: THREE.Vector3, to: THREE.Vector3, opts: { vault?: boolean; tries?: number; bias?: 'low' | 'high' } = {}): number[] {
    const vault = !!opts.vault && !!this.vaultEdges;
    const b = this.nearestVisible(to);
    if (b < 0) return [];
    const { dist, next } = this.toward(b, vault, opts.bias ?? null);
    const cand: { i: number; s: number; d: number }[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (dist[i] === Infinity) continue;
      const n = this.nodes[i];
      const dy = n.y - from.y;
      const d = Math.sqrt((n.x - from.x) ** 2 + (n.z - from.z) ** 2 + dy * dy * 9);
      cand.push({ i, s: d + dist[i], d });
    }
    cand.sort((x, y) => x.s - y.s);
    // 7.0: a caller may cap the entry search (rays); the best few entries are almost always it.
    const tries = opts.tries ?? Infinity;
    const onStair = this.onClimb(from);
    const entry = (c: { i: number }) => {
      const n = this.nodes[c.i];
      // 19.0: a stair is entered at its foot or its top (level with the walker), never in its middle
      // from beside it (the corridor rays clear the steps' edge; the body walks into its side), unless
      // the walker is on the stair already.
      if (this.climb.has(c.i) && Math.abs(n.y - from.y) > 0.35 && !onStair) return false;
      return (this.clear(from, n) || (vault && from.distanceTo(n) < 14 && this.clearVault(from, n))) && this.walkable(from, n);
    };
    const walk = (i: number) => {
      const out: number[] = [];
      for (let v = i; v >= 0 && out.length < 200; v = next[v]) out.push(v);
      return out;
    };
    for (let k = 0; k < cand.length && k < tries; k++) if (entry(cand[k])) return walk(cand[k].i);
    // 33.0: the best-ranked entries all failed (walled off from the walker: a ravine floor under its rim,
    // ranked by the short way on over the wall). The nodes nearest the walker, by plain distance, are
    // the ones it can actually walk to: the best of the first few that are clear.
    if (cand.length > tries) {
      const near = cand.slice().sort((a, b) => a.d - b.d).slice(0, NEAREST_TRIES);
      let best: { i: number; s: number } | null = null;
      for (const c of near) if ((!best || c.s < best.s) && entry(c)) best = c;
      if (best) {
        this.stats.nearestEntries++;
        return walk(best.i);
      }
    }
    return [];
  }

  /** 19.0: within 0.9 m (across) of a climbing hand link, at its height there (±0.6 m): on that stair. */
  private onClimb(p: THREE.Vector3) {
    for (const [i, j] of this.climbLinks) {
      const a = this.nodes[i], b = this.nodes[j];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
      if (Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)) < 0.9 && Math.abs(p.y - (a.y + (b.y - a.y) * t)) < 0.6) return true;
    }
    return false;
  }

  /** Opens or closes hand links (e.g. a shuttered stairwell). */
  setLinks(pairs: [number, number][], open: boolean) {
    this.fields.clear();
    this.vaultFields.clear();
    this.vaultEdges = null;
    for (const [i, j] of pairs) {
      this.edges[i] = this.edges[i].filter((v) => v !== j);
      this.edges[j] = this.edges[j].filter((v) => v !== i);
      if (open) {
        this.edges[i].push(j);
        this.edges[j].push(i);
      }
    }
  }

  /** Indices reachable from a node (connectivity check for the dev route test). `drops`: count the one-way drops too. */
  reachable(from: number, drops = false): Set<number> {
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of drops ? [...this.edges[u], ...this.dropsOut[u]] : this.edges[u]) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return seen;
  }
}
