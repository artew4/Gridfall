import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

export interface NavLayout {
  /** Node positions at floor level (y = surface height). */
  nodes: THREE.Vector3[];
  /** Hand-authored links, used for stairs (auto links only join nodes on the same level). */
  links: [number, number][];
}

/** Probe height above the floor for walkability rays, plus a knee-high ray for low obstacles. */
const BODY = 1;
const KNEE = 0.4;

/**
 * Hand-placed waypoint graph over both walkable levels. Nodes on the same level are linked
 * automatically when a body-wide corridor between them is clear; stairs are linked by hand.
 */
export class Nav {
  nodes: THREE.Vector3[] = [];
  edges: number[][] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(private col: CollisionWorld, layout: NavLayout) {
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
        if (Math.abs(ni.y - nj.y) > 0.5) continue;
        if (ni.distanceTo(nj) < 14 && this.clear(ni, nj) && this.walkable(ni, nj)) link(i, j);
      }
    }
    for (const [i, j] of layout.links) link(i, j);
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
   * There is floor all the way between two body-height points (no alley, stairwell or roof edge in
   * between). Line of sight alone would happily link two rooftops across a street.
   */
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
    // Rays are the expensive part: test in order of preference and stop at the first visible one.
    for (let k = 0; k < cand.length; k++) {
      const n = this.nodes[cand[k].i];
      if (this.col.lineOfSight(q, n) && this.walkable(q, n)) return cand[k].i;
    }
    return -1;
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

  /** Shortest distances from every node to `goal`, plus the next hop towards it. */
  private toward(goal: number) {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[goal] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = 1;
      for (const v of this.edges[u]) {
        const nd = dist[u] + this.nodes[u].distanceTo(this.nodes[v]);
        if (nd < dist[v]) {
          dist[v] = nd;
          next[v] = u;
        }
      }
    }
    return { dist, next };
  }

  /**
   * Route from a body-height position to a goal position: enters the graph at the reachable node with
   * the lowest (distance to it + remaining distance to the goal), so an agent never walks back to a
   * node behind it just because that node happens to be the closest.
   */
  route(from: THREE.Vector3, to: THREE.Vector3): number[] {
    const b = this.nearestVisible(to);
    if (b < 0) return [];
    const { dist, next } = this.toward(b);
    const cand: { i: number; s: number }[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (dist[i] === Infinity) continue;
      const n = this.nodes[i];
      const dy = n.y - from.y;
      const d = Math.sqrt((n.x - from.x) ** 2 + (n.z - from.z) ** 2 + dy * dy * 9);
      cand.push({ i, s: d + dist[i] });
    }
    cand.sort((x, y) => x.s - y.s);
    for (const c of cand) {
      const n = this.nodes[c.i];
      if (!this.clear(from, n) || !this.walkable(from, n)) continue;
      const out: number[] = [];
      for (let v = c.i; v >= 0 && out.length < 200; v = next[v]) out.push(v);
      return out;
    }
    return [];
  }

  /** Opens or closes hand links (e.g. a shuttered stairwell). */
  setLinks(pairs: [number, number][], open: boolean) {
    for (const [i, j] of pairs) {
      this.edges[i] = this.edges[i].filter((v) => v !== j);
      this.edges[j] = this.edges[j].filter((v) => v !== i);
      if (open) {
        this.edges[i].push(j);
        this.edges[j].push(i);
      }
    }
  }

  /** Indices reachable from a node (connectivity check for the dev route test). */
  reachable(from: number): Set<number> {
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of this.edges[u]) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return seen;
  }
}
