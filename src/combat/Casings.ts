import * as THREE from 'three';

/*
  Brass casings (8.1): ejected by kinetic weapons (the player's rifle and shotgun, the bots' rifles),
  they spin out of the port, fall, bounce on the floor they were fired over two or three times, lie
  still, and shrink away after 4 s.

  Built to cost nothing that grows with play:
   - one InstancedMesh (one draw call) for every casing in the level;
   - a fixed pool in typed arrays (struct of arrays): spawning writes into the next slot of a ring,
     overwriting the oldest when full — no objects, no arrays grown, no garbage;
   - the floor is looked up twice per casing, never per frame: where its arc will land (predicted from
     the ejection velocity: on a dune or off a catwalk's edge that isn't the floor under the port), and
     once more where it comes to rest;
   - casings at rest stop integrating; the matrices are rebuilt only while any are alive.
  Tested in casings.test.ts (pooling, physics, rest, despawn, no allocation in update).
*/

const G = 9.8;
/** Seconds a casing lives; the last FADE of them it shrinks to nothing. */
export const CASING_LIFE = 4;
const FADE = 0.8;
const MAX_BOUNCES = 3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Casings {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  /** Called on a hard bounce near the listener (sound), if set. */
  onBounce: ((x: number, y: number, z: number, strength: number) => void) | null = null;
  /**
   * The walkable floor under (x, z) at or below y (the level's collision world). Without it a casing
   * lands on the floor height given at ejection.
   */
  floorAt: ((x: number, z: number, y: number) => number) | null = null;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private rx: Float32Array;
  private ry: Float32Array;
  private rz: Float32Array;
  private wx: Float32Array;
  private wy: Float32Array;
  private wz: Float32Array;
  private floor: Float32Array;
  private life: Float32Array;
  private bounces: Uint8Array;
  /** 0 dead, 1 flying, 2 at rest; bit 4: makes a sound when it bounces. */
  private state: Uint8Array;
  private next = 0;
  private alive = 0;
  /** DEV counters. */
  stats = { spawned: 0, recycled: 0, maxAlive: 0 };

  constructor(scene: THREE.Scene, capacity = 256) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.rx = f(); this.ry = f(); this.rz = f();
    this.wx = f(); this.wy = f(); this.wz = f();
    this.floor = f(); this.life = f();
    this.bounces = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    // A 5.56-ish case: 6 mm across, 22 mm long, lying along x.
    const geo = new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6);
    geo.rotateZ(Math.PI / 2);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, metalness: 1, roughness: 0.28, envMapIntensity: 1.5 });
    this.mesh = new THREE.InstancedMesh(geo, brass, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  get count() {
    return this.alive;
  }

  /**
   * Eject one casing at (x, y, z), thrown along `right` and `up` (unit vectors, the weapon's), onto a
   * floor at height `floorY`. `loud`: its bounces make a sound (the player's own brass).
   */
  spawn(x: number, y: number, z: number, rightX: number, rightY: number, rightZ: number, upX: number, upY: number, upZ: number, floorY: number, loud = false) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.state[i]) this.stats.recycled++;
    else this.alive++;
    this.stats.spawned++;
    const out = 1.8 + Math.random() * 0.8, lift = 1.6 + Math.random() * 0.8;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = rightX * out + upX * lift;
    this.vy[i] = rightY * out + upY * lift;
    this.vz[i] = rightZ * out + upZ * lift;
    this.rx[i] = Math.random() * 6.28; this.ry[i] = Math.random() * 6.28; this.rz[i] = Math.random() * 6.28;
    this.wx[i] = (Math.random() - 0.5) * 40; this.wy[i] = (Math.random() - 0.5) * 40; this.wz[i] = (Math.random() - 0.5) * 40;
    let floor = Math.min(floorY, y);
    if (this.floorAt) {
      // Where the arc comes down (to the given floor height), and the floor there.
      const vy = this.vy[i], drop = Math.max(0, y - floor);
      const t = (vy + Math.sqrt(vy * vy + 2 * G * drop)) / G;
      const f = this.floorAt(x + this.vx[i] * t, z + this.vz[i] * t, y);
      if (Number.isFinite(f)) floor = Math.min(f, y);
    }
    this.floor[i] = floor + 0.006;
    this.life[i] = CASING_LIFE;
    this.bounces[i] = 0;
    this.state[i] = loud ? 1 | 16 : 1;
    if (this.alive > this.stats.maxAlive) this.stats.maxAlive = this.alive;
  }

  clear() {
    this.state.fill(0);
    this.alive = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    if (this.alive === 0) {
      this.mesh.count = 0;
      return;
    }
    let n = 0;
    const st = this.state;
    for (let i = 0; i < this.capacity; i++) {
      if (!st[i]) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) {
        st[i] = 0;
        this.alive--;
        continue;
      }
      if ((st[i] & 3) === 1) {
        // Flying: gravity, spin, a bounce off its floor that loses most of the energy.
        this.vy[i] -= G * dt;
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pz[i] += this.vz[i] * dt;
        this.rx[i] += this.wx[i] * dt;
        this.ry[i] += this.wy[i] * dt;
        this.rz[i] += this.wz[i] * dt;
        if (this.py[i] <= this.floor[i] && this.vy[i] < 0) {
          const strength = Math.min(1, -this.vy[i] / 3);
          this.py[i] = this.floor[i];
          this.vy[i] = -this.vy[i] * 0.35;
          this.vx[i] *= 0.55;
          this.vz[i] *= 0.55;
          this.wx[i] *= 0.5;
          this.wy[i] *= 0.5;
          this.wz[i] *= 0.5;
          if (st[i] & 16 && strength > 0.1 && this.onBounce) this.onBounce(this.px[i], this.py[i], this.pz[i], strength);
          if (++this.bounces[i] >= MAX_BOUNCES || this.vy[i] < 0.3) {
            // At rest: lying on its side, wherever it rolled to.
            st[i] = (st[i] & ~3) | 2;
            if (this.floorAt) {
              const f = this.floorAt(this.px[i], this.pz[i], this.py[i] + 0.3);
              if (Number.isFinite(f)) this.floor[i] = f + 0.006;
            }
            this.py[i] = this.floor[i];
            this.rx[i] = 0;
            this.rz[i] = 0;
          }
        }
      }
      const k = l < FADE ? l / FADE : 1;
      _p.set(this.px[i], this.py[i], this.pz[i]);
      _q.setFromEuler(_e.set(this.rx[i], this.ry[i], this.rz[i]));
      _s.set(k, k, k);
      this.mesh.setMatrixAt(n++, _m.compose(_p, _q, _s));
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
