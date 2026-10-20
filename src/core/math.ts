import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Random-looking value in [0, 1) that depends only on time: the same for every frame inside one
 * 1/rate s step. Light flicker must use this, not Math.random() per frame: per-frame randomness
 * flickers twice as often at 120 FPS as at 60 (the 4.1 "High preset" lighting bug).
 */
export function heldNoise(t: number, seed: number, rate = 60): number {
  let h = Math.imul(Math.floor(t * rate) | 0, 0x27d4eb2d) ^ Math.imul(Math.floor(seed * 1000) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeded PRNG so the city layout is identical on every load. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-damped-ish 1D spring used for recoil and hit reactions. */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(public stiffness = 180, public damping = 18, public target = 0) {}
  impulse(v: number) {
    this.velocity += v;
  }
  update(dt: number) {
    const f = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
    this.velocity += f * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
  reset() {
    this.value = this.target;
    this.velocity = 0;
  }
}

export const tmpV1 = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpV3 = new THREE.Vector3();
