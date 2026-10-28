import * as THREE from 'three';
import type { Collider, CollisionWorld } from './Collision';

/*
  93.0: rubble heaps (docs/DESTRUCTION_PLAN.md, step 4). What comes down off a wall or a tower lands
  on the floor under it in a grid of 0.75 m cells; each cell's heap grows with the volume poured into
  it (spread a little: a heap is never one column), up to `MAX_H`. A heap is a mound drawn in the
  colour of what fell (one InstancedMesh) and a box collider over its cell: a floor to stand on,
  waist-high or lower vaulted over, higher a wall. Heaps don't move once laid; a reset clears them.

  `flush` (after a burst of pours) makes the colliders and returns the places that changed: the bots'
  maps are brought up to date there.
*/

export const RUBBLE = { cell: 0.75, max: 1.6, min: 0.22, spread: 0.85 };

interface Heap {
  ix: number;
  iz: number;
  /** The floor it lies on, its height now and at its last collider. */
  floor: number;
  h: number;
  built: number;
  colour: THREE.Color;
  col: Collider | null;
  inst: number;
  seed: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** The volume poured into the cells round a point, by share (the point's cell most, its neighbours less). */
export function spreadShares(fx: number, fz: number): [number, number, number][] {
  // fx, fz: where in its cell the point fell (0..1). The cell itself takes half; the half left goes to
  // the two neighbours it is nearest to and their corner, by how near.
  const sx = fx < 0.5 ? -1 : 1, sz = fz < 0.5 ? -1 : 1;
  const ax = Math.abs(fx - 0.5) * 2 * RUBBLE.spread, az = Math.abs(fz - 0.5) * 2 * RUBBLE.spread;
  const rest = 0.5;
  const wx = ax * (1 - az), wz = az * (1 - ax), wc = ax * az, w0 = Math.max(0.0001, 1 - wx - wz - wc);
  const sum = w0 + wx + wz + wc;
  return [
    [0, 0, 0.5 + (rest * w0) / sum],
    [sx, 0, (rest * wx) / sum],
    [0, sz, (rest * wz) / sum],
    [sx, sz, (rest * wc) / sum],
  ];
}

export class Rubble {
  private heaps = new Map<number, Heap>();
  private mesh: THREE.InstancedMesh;
  private used = 0;
  private dirty = new Set<Heap>();
  /** DEV: heaps, the tallest, volume poured. */
  stats = { heaps: 0, tallest: 0, volume: 0 };

  constructor(scene: THREE.Scene, private col: CollisionWorld, private capacity = 900) {
    // A mound: a box with its top pulled in (a frustum), so a row of them reads as a heap, not a wall.
    const g = new THREE.CylinderGeometry(0.36, 0.5, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.5, 0);
    g.scale(1 / 0.5 / Math.SQRT2, 1, 1 / 0.5 / Math.SQRT2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05 }), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  private key(ix: number, iz: number) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  /** `volume` m³ of rubble the colour of `colour` landing at `p` (on the floor under it). */
  pour(p: THREE.Vector3, volume: number, colour: number) {
    const c = RUBBLE.cell;
    const gx = p.x / c, gz = p.z / c;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const floor = this.col.groundHeightAt(p.x, p.z, 0.1, p.y + 0.3, 1.2);
    if (!Number.isFinite(floor)) return;
    this.stats.volume += volume;
    for (const [dx, dz, share] of spreadShares(gx - ix, gz - iz)) {
      if (share <= 0) continue;
      const h = this.heap(ix + dx, iz + dz, floor, colour);
      if (!h) continue;
      h.h = Math.min(RUBBLE.max, h.h + (volume * share) / (c * c));
      this.stats.tallest = Math.max(this.stats.tallest, h.h);
      this.dirty.add(h);
    }
  }

  private heap(ix: number, iz: number, floor: number, colour: number): Heap | null {
    const k = this.key(ix, iz);
    let h = this.heaps.get(k);
    if (h) {
      // (A heap on another floor stays its own: a deck's rubble doesn't add to the street's.)
      return Math.abs(h.floor - floor) < 0.6 ? h : null;
    }
    if (this.used >= this.capacity) return null;
    // Not into a wall: its cell's middle must be open ground on this floor.
    const c = RUBBLE.cell;
    _p.set((ix + 0.5) * c, floor + 0.05, (iz + 0.5) * c);
    if (this.col.blocked(_p, 0.2, 0.3) || Math.abs(this.col.groundHeightAt(_p.x, _p.z, 0.1, floor + 0.3, 0.6) - floor) > 0.3) return null;
    h = { ix, iz, floor, h: 0, built: 0, colour: new THREE.Color(colour), col: null, inst: this.used++, seed: Math.random() };
    this.mesh.count = this.used;
    this.mesh.setColorAt(h.inst, h.colour.clone().multiplyScalar(0.85 + h.seed * 0.25));
    this.mesh.instanceColor!.needsUpdate = true;
    this.heaps.set(k, h);
    this.stats.heaps++;
    return h;
  }

  /**
   * The heaps poured into since the last flush: drawn at their height, their colliders made anew.
   * Returns where they are (the bots' maps).
   */
  flush(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const c = RUBBLE.cell;
    for (const h of this.dirty) {
      const x = (h.ix + 0.5) * c, z = (h.iz + 0.5) * c;
      _e.set((h.seed - 0.5) * 0.25, h.seed * 6, (h.seed - 0.5) * 0.2);
      _m.compose(_p.set(x, h.floor - 0.04, z), _q.setFromEuler(_e), _s.set(c * 1.25, h.h, c * 1.25));
      this.mesh.setMatrixAt(h.inst, _m);
      // A collider once it is worth one, and again when it grew by a fifth of a metre.
      if (h.h >= RUBBLE.min && h.h - h.built >= 0.2) {
        if (h.col) this.col.remove(h.col);
        // (The collider a little under the mound: its slopes are walked up, not bumped.)
        const top = h.floor + h.h * 0.85;
        h.col = this.col.add(x - c / 2, h.floor, z - c / 2, x + c / 2, top, z + c / 2, 'concrete');
        h.col.vault = top - h.floor <= 1.05;
        h.built = h.h;
        out.push(new THREE.Vector3(x, h.floor, z));
      }
    }
    if (this.dirty.size) this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    return out;
  }

  /** The heaps over 0.85 m (the bots' cover spots beside them). */
  tall(near: THREE.Vector3, r: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const c = RUBBLE.cell;
    for (const h of this.heaps.values()) {
      if (h.built * 0.85 < 0.85) continue;
      const x = (h.ix + 0.5) * c, z = (h.iz + 0.5) * c;
      if (Math.hypot(x - near.x, z - near.z) <= r) out.push(new THREE.Vector3(x, h.floor, z));
    }
    return out;
  }

  /** Every heap gone (a new match). */
  clear() {
    for (const h of this.heaps.values()) if (h.col) this.col.remove(h.col);
    this.heaps.clear();
    this.dirty.clear();
    for (let i = 0; i < this.used; i++) this.mesh.setMatrixAt(i, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.used = 0;
    this.mesh.count = 0;
    this.stats = { heaps: 0, tallest: 0, volume: 0 };
  }
}
