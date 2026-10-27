import * as THREE from 'three';
import type { CollisionWorld } from './Collision';

/*
  91.0: chunks of a broken wall (Destruction.ts): a fixed pool of boxes in one InstancedMesh, coloured
  per chunk (the wall's), thrown and tumbling, bouncing on the floor under them (the terrain, a deck),
  rubbing to a stop; asleep, they lie as rubble for a while, then sink out of sight. The oldest is
  taken when the pool is full. They don't collide with bodies or rounds (they are seen only).
*/

interface Chunk {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  size: THREE.Vector3;
  /** Seconds since it came to rest (-1: moving), seconds alive. */
  restT: number;
  age: number;
  floor: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

export const DEBRIS = { gravity: 14, bounce: 0.3, rest: 14, sink: 1.5 };

export class Debris {
  private pool: Chunk[] = [];
  private mesh: THREE.InstancedMesh;
  private next = 0;
  /** DEV: thrown, live now. */
  stats = { thrown: 0, live: 0 };

  constructor(scene: THREE.Scene, private col: CollisionWorld, private capacity = 360) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.mesh.setColorAt(i, _c.set(0xffffff));
      this.pool.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Quaternion(), axis: new THREE.Vector3(1, 0, 0), spin: 0, size: new THREE.Vector3(), restT: -1, age: 0, floor: 0 });
    }
    scene.add(this.mesh);
  }

  /** A chunk at `at`, thrown at `vel`, `size` m across (a little uneven), in `colour`. */
  throw(at: THREE.Vector3, vel: THREE.Vector3, size: number, colour: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const c = this.pool[i];
    if (!c.active) this.stats.live++;
    c.active = true;
    c.pos.copy(at);
    c.vel.copy(vel);
    c.rot.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    c.spin = 3 + Math.random() * 9;
    c.size.set(size * (0.7 + Math.random() * 0.5), size * (0.5 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.5));
    c.restT = -1;
    c.age = 0;
    c.floor = this.col.groundHeightAt(at.x, at.z, 0.05, at.y + 0.2, 0.6);
    // A little variety in the wall's colour (bricks are never one shade).
    const k = 0.8 + Math.random() * 0.35;
    this.mesh.setColorAt(i, _c.set(colour).multiplyScalar(k));
    this.mesh.instanceColor!.needsUpdate = true;
    this.stats.thrown++;
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const c = this.pool[i];
      if (!c.active) continue;
      any = true;
      c.age += dt;
      if (c.restT < 0) {
        c.vel.y -= DEBRIS.gravity * dt;
        c.pos.addScaledVector(c.vel, dt);
        c.rot.premultiply(_q.setFromAxisAngle(c.axis, c.spin * dt));
        // The floor under it (looked up again as it travels: off a deck onto the street).
        if (c.age < 0.05 || Math.abs(c.vel.x) + Math.abs(c.vel.z) > 0.5) c.floor = this.col.groundHeightAt(c.pos.x, c.pos.z, 0.05, c.pos.y + 0.3, 0.6);
        const bottom = c.floor + c.size.y * 0.5;
        if (c.pos.y < bottom) {
          c.pos.y = bottom;
          if (c.vel.y < -1.5) {
            c.vel.y *= -DEBRIS.bounce;
            c.vel.x *= 0.55;
            c.vel.z *= 0.55;
            c.spin *= 0.5;
          } else {
            c.restT = 0;
            c.vel.set(0, 0, 0);
          }
        }
      } else {
        c.restT += dt;
        if (c.restT > DEBRIS.rest) {
          // Sinking into the floor, then gone.
          c.pos.y -= (c.size.y / DEBRIS.sink) * dt;
          if (c.restT > DEBRIS.rest + DEBRIS.sink) {
            c.active = false;
            this.stats.live--;
            this.mesh.setMatrixAt(i, _zero);
            continue;
          }
        }
      }
      _m.compose(c.pos, c.rot, c.size);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i].active = false;
      this.mesh.setMatrixAt(i, _zero);
    }
    this.stats.live = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
