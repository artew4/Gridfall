import * as THREE from 'three';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { VAULT_MAX } from '../Nav';
import { ARENA } from './ArenaCtx';
import { SLIDE, slideStep } from '../../player/Slide';
import { mantlePos } from '../../player/Mantle';

/*
  Arena movement primitives (7.0): a jump arc, the low-wall probe that turns running into a vault,
  and the open-side probe a strafe uses to pick a direction. No rays: collider queries only.
*/

/** A body's vertical state while off the ground. */
export interface Air {
  up: boolean;
  vy: number;
  t: number;
}

/** A bot's height for the ceiling check in flight (its head with the helmet, m). */
export const AIR_HEAD = 1.9;

/**
 * One frame of flight: gravity, then a landing on whatever floor is under the feet. Returns true on
 * landing. 37.0: a rise stops under a ceiling (a ship's hull over a dock floor), as the player's does.
 */
export function stepAir(air: Air, pos: THREE.Vector3, col: CollisionWorld, radius: number, dt: number) {
  air.vy -= ARENA.gravity * dt;
  const head = pos.y + AIR_HEAD;
  const was = pos.y;
  pos.y += air.vy * dt;
  air.t += dt;
  if (air.vy > 0) {
    const ceil = col.ceilingAbove(pos.x, pos.z, radius, head - 0.05);
    if (pos.y + AIR_HEAD > ceil) {
      pos.y = ceil - AIR_HEAD;
      air.vy = 0;
    }
  }
  if (air.vy > 0 && air.t < 1.5) return false;
  // 40.0: any floor the feet passed this step (falling at over 3 m/s a step crosses more than 5 cm: off
  // the terrain, on Favelas' box floors, bots fell through the alleys and roofs into the fill under them).
  const g = col.groundHeightAt(pos.x, pos.z, radius * 0.6, pos.y, Math.max(0.05, was - pos.y + 0.05));
  if (pos.y <= g || air.t > 2.5) {
    if (g > -Infinity) pos.y = Math.max(pos.y, g);
    air.up = false;
    air.vy = 0;
    air.t = 0;
    return true;
  }
  return false;
}

/** 12.0: a body's slide: the player's model (player/Slide.ts), the speed left, the direction. */
export interface Slip {
  on: boolean;
  t: number;
  v: number;
  dx: number;
  dz: number;
  /** It ends at this speed (its crouch walk). */
  end: number;
}

export const newSlip = (): Slip => ({ on: false, t: 0, v: 0, dx: 0, dz: 0, end: 0 });

/** Start a slide along `vel` (XZ) from at least `entry` m/s; it ends at `end` m/s. */
export function startSlip(s: Slip, vel: THREE.Vector3, entry: number, end: number) {
  const hs = Math.hypot(vel.x, vel.z);
  if (s.on || hs < 0.5) return false;
  s.on = true;
  s.t = 0;
  s.v = Math.max(hs, entry) * SLIDE.boost;
  s.dx = vel.x / hs;
  s.dz = vel.z / hs;
  s.end = end;
  return true;
}

/**
 * One frame of a slide: friction (exact, as the player's), the velocity it wants in `desired`.
 * `made`: the speed the body actually made last frame (a wall eats the momentum). False once over.
 */
export function stepSlip(s: Slip, dt: number, desired: THREE.Vector3, made = Infinity) {
  if (!s.on) return false;
  if (made < s.v * 0.5) s.v = made;
  s.t += dt;
  s.v = slideStep(s.v, dt);
  if (s.v <= s.end || s.t >= SLIDE.maxT) {
    s.on = false;
    return false;
  }
  desired.set(s.dx * s.v, 0, s.dz * s.v);
  return true;
}

/** Take-off speed that clears a wall `h` above the feet with a little room. */
export function vaultSpeed(h: number) {
  return Math.sqrt(2 * ARENA.gravity * (h + 0.3));
}

/**
 * A vaultable wall right ahead (within `reach` of the body's edge along unit XZ direction d), no
 * taller than VAULT_MAX above the feet: its height above the feet, else 0. A taller solid in the way
 * first means no vault (it would only jump into a wall).
 */
export function vaultAhead(col: CollisionWorld, pos: THREE.Vector3, dx: number, dz: number, radius: number, reach = 0.7, out?: { wall: boolean }) {
  const ex = pos.x + dx * (radius + reach), ez = pos.z + dz * (radius + reach);
  const list = col.near(Math.min(pos.x, ex) - 0.2, Math.min(pos.z, ez) - 0.2, Math.max(pos.x, ex) + 0.2, Math.max(pos.z, ez) + 0.2);
  let best = 0, bt = Infinity;
  let hitC: Collider | null = null;
  for (const c of list) {
    if (!c.solid || c.kind === 'ramp') continue;
    const top = c.max.y - pos.y;
    if (top <= 0.3 || c.min.y > pos.y + 1.8) continue;
    const t = c.kind === 'cyl' ? segCircle(pos.x, pos.z, ex, ez, c.cx!, c.cz!, c.r! + radius * 0.5) : segBox(pos.x, pos.z, ex, ez, c.min.x - radius * 0.5, c.min.z - radius * 0.5, c.max.x + radius * 0.5, c.max.z + radius * 0.5);
    if (t < 0 || t >= bt) continue;
    bt = t;
    best = c.vault && top <= VAULT_MAX ? top : -1;
    hitC = c;
  }
  // 58.0: and room to come down past it (a counter in a room's corner, sandbags against a wall: the bot
  // jumped at it, landed back where it was, and jumped again, on the spot, for seconds).
  if (best > 0 && hitC) {
    const c = hitC;
    // Through the obstacle along d: from where the probe met it to its far side, then a body's width on.
    let far = 0;
    for (const [p, d, lo, hi] of [[pos.x, dx, c.min.x, c.max.x], [pos.z, dz, c.min.z, c.max.z]] as const) if (Math.abs(d) > 1e-6) far = Math.max(far, ((d > 0 ? hi : lo) - p) / d);
    if (c.kind === 'cyl') far = Math.hypot(c.cx! - pos.x, c.cz! - pos.z) + c.r!;
    _p.set(pos.x + dx * (far + radius + 0.15), pos.y + 0.35, pos.z + dz * (far + radius + 0.15));
    if (col.blocked(_p, radius, 1.4)) {
      if (out) out.wall = true;
      return 0;
    }
  }
  if (out) out.wall = best < 0;
  return best > 0 ? best : 0;
}

/** Is there room for the body `dist` metres along unit XZ direction d (no ray)? */
export function openAt(col: CollisionWorld, pos: THREE.Vector3, dx: number, dz: number, dist: number, radius: number) {
  _p.set(pos.x + dx * dist, pos.y, pos.z + dz * dist);
  return !col.blocked(_p, radius);
}

const _p = new THREE.Vector3();

/** Entry parameter (0..1) of segment a→b into an XZ box, or -1. */
function segBox(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return -1;
      continue;
    }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Entry parameter (0..1) of segment a→b into an XZ circle, or -1. */
function segCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number) {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-9) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * 58.0, a bot through a window (Mantle.findWindow's dive): up to the sill, through, out in the air past
 * the wall; t < 0: not diving.
 */
export interface Dive {
  t: number;
  T: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}
export const newDive = (): Dive => ({ t: -1, T: 0.5, from: new THREE.Vector3(), to: new THREE.Vector3() });

/** Moves `pos` along the dive; true on the frame it ends (then it falls from `to`). */
export function stepDive(d: Dive, pos: THREE.Vector3, dt: number) {
  d.t += dt;
  mantlePos(d.from, d.to, d.t, d.T, pos, true);
  if (d.t < d.T) return false;
  pos.copy(d.to);
  d.t = -1;
  return true;
}
