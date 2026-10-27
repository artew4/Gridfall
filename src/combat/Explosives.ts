import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';
import type { Combatant } from './Team';

/*
  90.0, explosives (docs/DESTRUCTION_PLAN.md, step 1): the pure parts, no three.js scene, no DOM.

    the blast     a share of a body's full health by its distance from the centre: everything within
                  `kill` takes `damage` (over 1: dead), falling (squared) to nothing at `radius`. A body
                  behind a wall (neither its chest nor its head in the blast's sight) takes none past
                  `wrap` metres (the blast reaches round a corner that close)
    the body      a thrown thing under gravity, bouncing off what blocks a body (restitution along the
                  normal, friction along the face), rolling to a stop on a floor; substepped at 120 Hz
    the throw     the bots' aim: the launch velocity at a fixed speed that lands at a point (the low or
                  the high arc), checked by simulating it through the map
*/

export interface BlastSpec {
  /** Full `damage` within it (m). */
  kill: number;
  /** Nothing past it (m). */
  radius: number;
  /** A share of a body's full health at `kill` (over 1: lethal). */
  damage: number;
  /** Behind cover, still hurt this close (m). */
  wrap: number;
  /** A bot's shove at the centre (m/s, flat, falling with the damage) and its stagger (s). */
  push: number;
  stagger: number;
}

/** The frag grenade's blast: dead within 2.5 m, hurt to 8 m. */
export const FRAG_BLAST: BlastSpec = { kill: 2.5, radius: 8, damage: 1.25, wrap: 1.4, push: 7, stagger: 0.9 };

/** 90.1: the rocket's blast: dead within 3 m, hurt to 9 m, a harder shove. */
export const ROCKET_BLAST: BlastSpec = { kill: 3, radius: 9, damage: 1.6, wrap: 1.6, push: 9, stagger: 1.2 };

/**
 * 90.1: the rocket in flight: its speed (m/s), the drop on it (m/s²: nearly straight), how far its
 * motor carries it (m, then it goes off in the air), a smoke puff every `puffEvery` m of its trail.
 */
export const ROCKET = { speed: 58, drop: 1.5, reach: 220, puffEvery: 0.45 };

export interface ThrowSpec {
  /** From the pin to the bang (s). */
  fuse: number;
  /** The body's radius (m). */
  r: number;
  /** m/s², a touch over the world's for a snappier arc. */
  gravity: number;
  /** Speed kept along a face's normal at a bounce (0..1). */
  restitution: number;
  /** Speed kept along the face at a bounce (0..1). */
  friction: number;
  /** A throw's speed (m/s): the player's, a bot's. */
  speed: number;
}

export const FRAG: ThrowSpec = { fuse: 3.2, r: 0.06, gravity: 12, restitution: 0.32, friction: 0.62, speed: 19 };

/** A share of full health the blast deals at `d` metres (in the open). */
export function blastShare(d: number, s: BlastSpec): number {
  if (d <= s.kill) return s.damage;
  if (d >= s.radius) return 0;
  const t = 1 - (d - s.kill) / (s.radius - s.kill);
  return s.damage * t * t;
}

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * A body's exposure to a blast at `at`: 1 if its chest or its head is in the blast's sight (or it is
 * within `wrap`), else 0. `at` is lifted a little off the face it went off on by the caller.
 */
export function exposure(col: CollisionWorld, at: THREE.Vector3, c: Combatant, s: BlastSpec): number {
  const dx = c.pos.x - at.x, dz = c.pos.z - at.z;
  for (const y of [c.chestY, c.headY]) {
    _a.set(c.pos.x, c.pos.y + y, c.pos.z);
    const d = Math.hypot(dx, _a.y - at.y, dz);
    if (d <= s.wrap) return 1;
    if (col.lineOfSight(at, _a)) return 1;
  }
  return 0;
}

export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** On a floor, rolling (or still). */
  grounded: boolean;
}

const STEP = 1 / 120;
const _hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

/**
 * Moves a thrown body `dt` seconds. Returns the hardest impact's speed into a face (m/s, 0: none) and
 * its surface in `hit` (a bounce's sound).
 */
export function stepBody(col: CollisionWorld, b: Body, dt: number, s: ThrowSpec, hit?: { surface: string }): number {
  let hard = 0;
  const n = Math.max(1, Math.ceil(dt / STEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    if (!b.grounded) b.vel.y -= s.gravity * h;
    const speed = b.vel.length();
    if (speed < 1e-4) {
      // At rest: it stays unless the floor went from under it.
      const g = col.groundHeightAt(b.pos.x, b.pos.z, 0.02, b.pos.y, 0.05);
      if (b.pos.y - s.r > g + 0.02) b.grounded = false;
      continue;
    }
    _d.copy(b.vel).divideScalar(speed);
    const len = speed * h;
    const w = col.raycast(b.pos, _d, len + s.r, _hit, true);
    if (w) {
      // To the face (its radius off it), then the bounce: the normal's speed reversed and cut, the rest
      // rubbed down.
      b.pos.addScaledVector(_d, Math.max(0, w.dist - s.r));
      const vn = b.vel.dot(w.normal);
      if (vn < 0) {
        hard = Math.max(hard, -vn);
        if (hit) hit.surface = w.surface;
        _a.copy(w.normal).multiplyScalar(vn);
        // A slow drop onto a floor face: it stays down (rolling), no endless little hops.
        const settle = w.normal.y > 0.7 && -vn < 1.2;
        b.vel.sub(_a).multiplyScalar(settle ? 1 : s.friction);
        if (settle) b.grounded = true;
        else b.vel.addScaledVector(w.normal, -vn * s.restitution);
      }
    } else b.pos.addScaledVector(_d, len);
    // The floor under it (the terrain, a deck): caught here even where the ray grazed past.
    const g = col.groundHeightAt(b.pos.x, b.pos.z, 0.02, b.pos.y, 0.3);
    if (b.pos.y - s.r < g) {
      b.pos.y = g + s.r;
      if (b.vel.y < 0) {
        if (!b.grounded) {
          hard = Math.max(hard, -b.vel.y);
          if (hit && !w) hit.surface = col.groundSurfaceAt(b.pos.x, b.pos.z, b.pos.y).surface;
        }
        b.vel.y = b.vel.y < -1.2 ? -b.vel.y * s.restitution : 0;
        b.vel.x *= s.friction;
        b.vel.z *= s.friction;
      }
      if (b.vel.y === 0) b.grounded = true;
    } else if (b.pos.y - s.r > g + 0.02) b.grounded = false;
    if (b.grounded) {
      // Rolling: friction down to a stop.
      const k = Math.exp(-3.5 * h);
      b.vel.x *= k;
      b.vel.z *= k;
      if (Math.hypot(b.vel.x, b.vel.z) < 0.15) b.vel.set(0, 0, 0);
    }
  }
  return hard;
}

/** Where a body thrown from `from` at `vel` is after `t` seconds (scratch body; ~t × 120 casts). */
export function simulateThrow(col: CollisionWorld, from: THREE.Vector3, vel: THREE.Vector3, t: number, s: ThrowSpec, out = new THREE.Vector3()) {
  const b: Body = { pos: out.copy(from), vel: vel.clone(), grounded: false };
  // Coarser than the game's own (1/60): it decides whether the arc is clear, not where each bounce goes.
  for (let e = 0; e < t; e += 1 / 60) stepBody(col, b, 1 / 60, s);
  return b.pos;
}

/**
 * The launch velocity at `speed` from `from` that lands on `to` (in the air, no bounce): the low arc
 * (`high` false) or the lob. Null out of reach.
 */
export function throwVelocity(from: THREE.Vector3, to: THREE.Vector3, speed: number, g: number, high: boolean, out = new THREE.Vector3()): THREE.Vector3 | null {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const x = Math.hypot(dx, dz);
  if (x < 1e-3) return null;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * x * x + 2 * dy * v2);
  if (disc < 0) return null;
  const tan = (v2 + (high ? 1 : -1) * Math.sqrt(disc)) / (g * x);
  const a = Math.atan(tan);
  const h = Math.cos(a) * speed;
  return out.set((dx / x) * h, Math.sin(a) * speed, (dz / x) * h);
}

/**
 * A bot's throw at `to`: the low arc if it lands within `slack` of it through the map, else the lob,
 * else null. `fuse` is how long the simulation runs (it lands, bounces and rolls in that time).
 */
export function planThrow(col: CollisionWorld, from: THREE.Vector3, to: THREE.Vector3, s: ThrowSpec, slack = 3, fuse = s.fuse, speed = s.speed): THREE.Vector3 | null {
  for (const high of [false, true]) {
    for (const k of [1, 0.85, 0.7]) {
      const v = throwVelocity(from, to, speed * k, s.gravity, high);
      if (!v) continue;
      const end = simulateThrow(col, from, v, fuse, s);
      if (Math.hypot(end.x - to.x, end.z - to.z) <= slack && Math.abs(end.y - to.y) < 1.5) return v;
    }
  }
  return null;
}

/** 90.0: the last blast that hurt a combatant (the kill feed's FRAG): by combatant, its weapon tag and time. */
const lastBlast = new WeakMap<Combatant, { tag: string; t: number }>();
export function markBlast(c: Combatant, tag: string, t: number) {
  lastBlast.set(c, { tag, t });
}
/** The tag of a blast that hurt `c` within the last 0.25 s (its death came of it), else undefined. */
export function recentBlast(c: Combatant, now: number): string | undefined {
  const b = lastBlast.get(c);
  return b && now - b.t < 0.25 ? b.tag : undefined;
}
