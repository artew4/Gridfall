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
        if (ni.distanceTo(nj) < 14 && this.clear(ni, nj)) link(i, j);
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

  /** Nearest node that can be seen from a body-height point, preferring the same level. */
  nearestVisible(q: THREE.Vector3): number {
    let best = -1;
    let bd = Infinity;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (pass === 0 && Math.abs(n.y - q.y) > 1.5) continue;
        const d = n.distanceToSquared(q);
        if (d < bd && this.col.lineOfSight(q, n)) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
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
