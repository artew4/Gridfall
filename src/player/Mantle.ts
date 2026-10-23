import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';

/*
  43.0, the ledge grab (mantle): airborne, holding forward, he reaches a ledge he jumped just short of
  and pulls himself up onto it. One probe, two rays, asked only when it can matter.

    When       in the air, W held, at or past the jump's apex (vy < `apexVy`) and not falling hard,
               not sliding or already mantling, the cooldown run out. On the ground nothing is cast.
    Ray 1      the wall: forward from the hips (`hip` over the feet), `reach` m from the body's centre,
               against what blocks a body (a fence with no `ray` counts); it must face him (within
               `faceCos` of head-on) and be upright. A vaultable rail or tank he is already clearing
               (feet over its top − 0.62) is left to the vault.
    Ray 2      the ledge: straight down onto where his body would stand, `land` m past the wall's face,
               from `maxUp` over the feet: a flat top (normal up), a floor, `minUp` … `maxUp` over the
               feet (lower is a step the collision takes anyway; higher is out of reach).
    Room       the top is above where ray 1 met the wall (a floor lower than that is past a parapet);
               the floor under the body there is that top (not a fence's edge with a drop past it), a
               crouched body fits (no wall, `ceilingAbove` ≥ CROUCH_H: low room ends it crouched), the
               column he rises in is clear to that height, the way over is clear at the shins and the
               chest (two more rays: a rail set back from the lip), and the level accepts the spot.

  The pull-up (Player): gravity and WASD off; up first (eased out: the arms snap him up), then forward
  over the lip (eased in-out), `time(rise)` s in all (200-300 ms), the view dipping and rolling with it
  (`dip`, `roll`); he comes out on the ledge with at least `exit` m/s forward.

  JUMP 4.8 m/s, g 15: the apex is 0.77 m, and the collision's 0.3 m step already puts him on 1.07 m tops;
  the mantle takes him onto tops up to 0.77 + `maxUp` = 1.77 m over the floor he jumped from.
*/

export const MANTLE = {
  on: true,
  /** Ray 1: its height over the feet, and its length from the body's centre (m). */
  hip: 0.4,
  reach: 0.8,
  /** The wall faces him within this of head-on (cos 55°). */
  faceCos: Math.cos((55 * Math.PI) / 180),
  /** Where the body lands past the wall's face (m): over the radius, so he stands clear of the lip. */
  land: 0.47,
  /** The top's height over the feet: above `minUp` (a step), up to `maxUp` (the hands' reach). */
  minUp: 0.3,
  maxUp: 1.0,
  /** Near the apex or falling (vy below this, m/s), and not falling faster than `maxFall`. */
  apexVy: 1.5,
  maxFall: 8,
  /** The pull-up's length: `base` + `perUp` × (rise / maxUp) s; the share of it going up. */
  base: 0.2,
  perUp: 0.08,
  upShare: 0.62,
  /** Speed out of it along the ledge (m/s, at least), and how long before the next grab (s). */
  exit: 3.2,
  cooldown: 0.3,
  /** The view: pitch dip (rad, down) and roll (rad) at the pull-up's peak. */
  dip: 0.09,
  roll: 0.035,
};

export interface Ledge {
  /** Where the feet end (on the top, past the lip). */
  to: THREE.Vector3;
  /** The top's height over the feet at the grab (m). */
  rise: number;
  /** The free height over the top there (m): under this he arrives crouched. */
  room: number;
  /** The wall's face (unit, xz: toward him). */
  nx: number;
  nz: number;
}

/** The probe's counts (DEV: CPU cost is only paid on the frames that cast). */
export const mantleStats = { probes: 0, rays: 0, grabs: 0 };

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _p = new THREE.Vector3();
const _hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

/** The pull-up's length (s) for a rise of `rise` m. */
export function mantleTime(rise: number) {
  return MANTLE.base + MANTLE.perUp * Math.min(1, Math.max(0, rise / MANTLE.maxUp));
}

/**
 * The ledge in front of a body (feet `pos`, facing the unit (fx, fz)), or null (see the header).
 * `ok`: the level's say on the spot (its extent). `crouchH`: the least room a body fits in.
 */
export function findLedge(col: CollisionWorld, pos: THREE.Vector3, fx: number, fz: number, radius: number, crouchH: number, ok?: (p: THREE.Vector3) => boolean): Ledge | null {
  const M = MANTLE;
  mantleStats.probes++;
  // Ray 1: the wall.
  mantleStats.rays++;
  _o.set(pos.x, pos.y + M.hip, pos.z);
  _d.set(fx, 0, fz);
  const wall = col.raycast(_o, _d, M.reach, _hit, true);
  if (!wall || Math.abs(wall.normal.y) > 0.3 || wall.normal.x * fx + wall.normal.z * fz > -M.faceCos) return null;
  // A vaultable rail or tank he is already high enough to clear (Collision.resolveCircle's rule): the
  // vault carries him over it, keeping his pace; lower, he grabs it.
  const c = wall.collider;
  if (c?.vault && pos.y > c.max.y - 0.62) return null;
  const nx = wall.normal.x, nz = wall.normal.z;
  // Ray 2: the top, straight down where the body would stand.
  const lx = wall.point.x + fx * M.land, lz = wall.point.z + fz * M.land;
  mantleStats.rays++;
  _o.set(lx, pos.y + M.maxUp + 0.02, lz);
  const top = col.raycast(_o, _down, M.maxUp + 0.02 - M.minUp, _hit, true);
  if (!top || top.normal.y < 0.9 || top.collider?.floor === false) return null;
  const y = top.point.y;
  const rise = y - pos.y;
  // The top of the face he touched: above where ray 1 met it (a floor lower than that lies past a
  // parapet or a rail on the lip, not on this wall).
  if (rise <= M.minUp || rise > M.maxUp || y < wall.point.y) return null;
  // The floor under the body there is the top (a fence's edge has a drop past it).
  if (Math.abs(col.groundHeightAt(lx, lz, radius * 0.6, y + 0.05, 0.1) - y) > 0.06) return null;
  // Room: a crouched body fits there, and the column he rises in is clear up to it.
  const room = col.ceilingAbove(lx, lz, radius, y + 0.05) - y;
  if (room < crouchH + 0.02) return null;
  if (col.ceilingAbove(pos.x, pos.z, radius, pos.y + 0.3) < y + crouchH) return null;
  // The way over: clear at the shins and the chest above the top, from him to past the spot (a rail
  // or a barrier set back from the lip stops it: the pull-up would go through it).
  const over = Math.hypot(lx - pos.x, lz - pos.z) + radius - 0.02;
  for (const dy of [0.35, crouchH - 0.1]) {
    mantleStats.rays++;
    _o.set(pos.x, y + dy, pos.z);
    if (col.raycast(_o, _d, over, _hit, true)) return null;
  }
  _p.set(lx, y, lz);
  col.resolveCircle(_p, radius - 0.02, crouchH, 0.3);
  if (Math.abs(_p.x - lx) + Math.abs(_p.z - lz) > 0.02) return null;
  if (ok && !ok(_p)) return null;
  return { to: _p.clone(), rise, room: room - 0.02, nx, nz };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Where the feet are `t` s into a pull-up from `from` to `to` (T s long): the height eased out over the
 * first `upShare` of it, the step forward eased in-out over the rest (starting as the hands clear the lip).
 */
export function mantlePos(from: THREE.Vector3, to: THREE.Vector3, t: number, T: number, out: THREE.Vector3) {
  const k = Math.min(1, Math.max(0, t / T));
  const ku = Math.min(1, k / MANTLE.upShare);
  const up = 1 - (1 - ku) ** 3;
  const kf = Math.min(1, Math.max(0, (k - MANTLE.upShare * 0.6) / (1 - MANTLE.upShare * 0.6)));
  const f = ease(kf);
  return out.set(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * up, from.z + (to.z - from.z) * f);
}
