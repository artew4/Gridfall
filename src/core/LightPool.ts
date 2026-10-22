import * as THREE from 'three';

/*
  17.0, the point-light budget. three.js shades every visible point light in every lit fragment
  (forward rendering, no culling), so a map's light count is a per-pixel cost on the whole screen:
  Neon Block's 34 lights cost 14 ms of GPU a frame at Balanced (Apple M5), the same view with 12 of
  them 6.3 ms, with none 5.8 ms. Shader cost grows faster than linearly with the count.

  The level still makes its lights where it wants them (and its glows still flicker them), but they
  are moved to a layer no camera draws, so the renderer never counts them. A fixed number of real
  lights (the slots) stand in for the ones that matter for the current view: a source whose range
  doesn't reach into the view frustum lights nothing on screen and is skipped outright; the rest are
  ranked by intensity times their range's apparent size, and the best `size` take the slots. A
  source joining or leaving the set fades over ~0.25 s (no pop). The slot count never changes, so no
  shader is ever recompiled.

  Lights marked `userData.unpooled` (the muzzle flash, the rounds' glow: brief, near the player and
  made after the level) stay real lights.
*/

/** Layer the pooled sources are moved to (cameras only see layer 0). */
export const POOLED_LAYER = 31;
/** Weight change per second as a source joins or leaves the set. */
const FADE = 4;

export interface Candidate {
  /** Ranking score (0: lights nothing on screen). */
  score: number;
}

/**
 * Marks the `size` best sources (by score, ignoring zeros; the lower index wins a tie) in `want`.
 * `order` is scratch space, reused, so a frame allocates nothing. Pure, for the tests.
 */
export function pickTop(scores: ArrayLike<number>, size: number, want: Uint8Array, order: number[]) {
  order.length = 0;
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) order.push(i);
  order.sort((a, b) => scores[b] - scores[a] || a - b);
  want.fill(0);
  for (let k = 0; k < Math.min(size, order.length); k++) want[order[k]] = 1;
  return want;
}

/**
 * Advances the weights toward the wanted set and keeps the slot assignment: a source with weight
 * above zero holds a slot; a wanted source without one takes a free slot (or waits at zero until a
 * fading source lets one go). `snap` sets the weights at once (a level load, a teleport). Pure.
 */
export function stepSlots(want: Uint8Array, weight: Float32Array, slotOf: Int16Array, slots: Int16Array, dt: number, snap: boolean) {
  const n = weight.length;
  if (snap) {
    slots.fill(-1);
    slotOf.fill(-1);
    weight.fill(0);
    for (let i = 0; i < n; i++) if (want[i] && take(i, slotOf, slots)) weight[i] = 1;
    return;
  }
  for (let i = 0; i < n; i++) {
    weight[i] = Math.max(0, Math.min(1, weight[i] + (want[i] ? FADE : -FADE) * dt));
    // A source that faded out lets its slot go.
    if (weight[i] <= 0 && slotOf[i] >= 0) {
      slots[slotOf[i]] = -1;
      slotOf[i] = -1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!want[i] || slotOf[i] >= 0) continue;
    // No slot yet: it can't brighten until one is free.
    if (!take(i, slotOf, slots)) weight[i] = 0;
  }
}

function freeSlot(slots: Int16Array) {
  for (let s = 0; s < slots.length; s++) if (slots[s] < 0) return s;
  return -1;
}

function take(i: number, slotOf: Int16Array, slots: Int16Array) {
  const s = freeSlot(slots);
  if (s < 0) return false;
  slots[s] = i;
  slotOf[i] = s;
  return true;
}

export class LightPool {
  readonly sources: THREE.PointLight[] = [];
  /** The preset's budget, and the slots actually made (no more than the sources). */
  readonly budget: number;
  readonly size: number;
  private lights: THREE.PointLight[] = [];
  private scores: Float32Array;
  private want: Uint8Array;
  private order: number[] = [];
  private weight: Float32Array;
  private slotOf: Int16Array;
  private slots: Int16Array;
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private p = new THREE.Vector3();
  private lastCam = new THREE.Vector3(Infinity, 0, 0);

  /** Adopts every point light in `scene` (except the unpooled ones) behind `budget` real lights at most. */
  constructor(
    private scene: THREE.Scene,
    budget: number,
  ) {
    this.budget = budget;
    scene.traverse((o) => {
      const l = o as THREE.PointLight;
      if (!l.isPointLight || l.castShadow || l.userData.unpooled) return;
      this.sources.push(l);
    });
    for (const l of this.sources) l.layers.set(POOLED_LAYER);
    // Never more slots than sources: a map with four lights keeps four (every slot is shaded).
    this.size = Math.min(budget, this.sources.length);
    for (let s = 0; s < this.size; s++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      l.name = `pool-${s}`;
      l.userData.unpooled = true;
      this.lights.push(l);
      scene.add(l);
    }
    const n = this.sources.length;
    this.scores = new Float32Array(n);
    this.want = new Uint8Array(n);
    this.weight = new Float32Array(n);
    this.slotOf = new Int16Array(n).fill(-1);
    this.slots = new Int16Array(this.size).fill(-1);
  }

  /** Re-ranks the sources for this camera and fills the slots. */
  update(camera: THREE.Camera, dt: number) {
    camera.updateMatrixWorld();
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    const cam = camera.getWorldPosition(this.p);
    // A jump (a level load, a teleport, a respawn) snaps the set instead of fading it in.
    const snap = cam.distanceToSquared(this.lastCam) > 100;
    this.lastCam.copy(cam);
    for (let i = 0; i < this.sources.length; i++) this.scores[i] = this.score(this.sources[i], cam);
    stepSlots(pickTop(this.scores, this.size, this.want, this.order), this.weight, this.slotOf, this.slots, dt, snap);
    for (let s = 0; s < this.size; s++) {
      const dst = this.lights[s];
      const i = this.slots[s];
      if (i < 0) {
        dst.intensity = 0;
        continue;
      }
      const src = this.sources[i];
      src.getWorldPosition(dst.position);
      dst.color.copy(src.color);
      dst.distance = src.distance;
      dst.decay = src.decay;
      dst.intensity = src.intensity * this.weight[i] * (this.visible(src) ? 1 : 0);
    }
  }

  private score(l: THREE.PointLight, cam: THREE.Vector3) {
    if (l.intensity <= 0 || !this.visible(l)) return 0;
    const r = l.distance > 0 ? l.distance : 60;
    l.getWorldPosition(this.sphere.center);
    this.sphere.radius = r;
    if (!this.frustum.intersectsSphere(this.sphere)) return 0;
    const d = Math.max(this.sphere.center.distanceTo(cam), r * 0.5);
    return l.intensity * (r / d) * (r / d);
  }

  /** The source and every parent are visible (what the renderer itself would require). */
  private visible(o: THREE.Object3D | null) {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /** DEV: what the slots hold. */
  debug() {
    let lit = 0;
    for (const l of this.lights) if (l.intensity > 0) lit++;
    return { sources: this.sources.length, slots: this.size, lit };
  }

  /** Gives the sources back to the renderer and removes the slots. */
  dispose() {
    for (const l of this.lights) this.scene.remove(l);
    for (const l of this.sources) l.layers.set(0);
    this.lights.length = 0;
  }
}
