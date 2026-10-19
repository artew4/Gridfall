import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

/** A tiny hand-placed waypoint graph; enough for one street and two alleys, no navmesh needed. */
export class Nav {
  nodes: THREE.Vector3[] = [];
  edges: number[][] = [];

  constructor(private col: CollisionWorld) {
    const pts: [number, number][] = [
      [0, 30], [0, 20], [0, 10], [0, 0], [0, -9], [0, -16], [0, -25], [0, -33], [0, -42], [0, -50],
      [-3.5, -46], [3.5, -46],
      [-9, -2.5], [-16, -2.5], [-23, -2.5],
      [9, -16], [16, -16], [23, -16],
      [-3, 18], [3, -5], [-3, -20],
    ];
    this.nodes = pts.map(([x, z]) => new THREE.Vector3(x, 1, z));
    this.edges = this.nodes.map(() => []);
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.nodes[i].distanceTo(this.nodes[j]) < 13 && this.clear(this.nodes[i], this.nodes[j])) {
          this.edges[i].push(j);
          this.edges[j].push(i);
        }
      }
    }
  }

  /** LOS with a little body width so paths don't hug corners. */
  clear(a: THREE.Vector3, b: THREE.Vector3) {
    const side = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(0.35);
    return (
      this.col.lineOfSight(a, b) &&
      this.col.lineOfSight(a.clone().add(side), b.clone().add(side)) &&
      this.col.lineOfSight(a.clone().sub(side), b.clone().sub(side))
    );
  }

  nearestVisible(p: THREE.Vector3): number {
    let best = -1;
    let bd = Infinity;
    const q = new THREE.Vector3(p.x, 1, p.z);
    for (let i = 0; i < this.nodes.length; i++) {
      const d = this.nodes[i].distanceToSquared(q);
      if (d < bd && this.col.lineOfSight(q, this.nodes[i])) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Dijkstra over ~20 nodes; returns node indices from start to goal. */
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
}
