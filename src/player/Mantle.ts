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
  /** 57.0, a window: he goes through it and comes out in the air past the wall (no ledge to stand on). */
  air?: boolean;
  /** 57.0: the eyes kept under this (world y) on the way through (the lintel). */
  cap?: number;
}

/**
 * 57.0, through a window (parkour): airborne at the grab's moment, W held, before a wall whose opening's
 * sill he can reach (`minUp`…`maxUp` over his feet, as a ledge), at least `width` m wide (a body and a
 * margin) and `height` m from the sill to the lintel, `depth` m deep at most (a wall, not a corridor);
 * past it room to come out at the sill's height, with ground no more than `drop` m below. A lintel within
 * `lintel` m of the sill (over a fence's top there is none: fences stay in the way). Bars (bodies
 * stopped, rounds not) stop it: the body rays are what decide.
 */
export const WINDOW = { on: true, width: 1.0, height: 0.75, lintel: 2.6, depth: 0.7, drop: 4.5, time: 0.42, upShare: 0.4 };

/** The probe's counts (DEV: CPU cost is only paid on the frames that cast). */
export const mantleStats = { probes: 0, rays: 0, grabs: 0, windows: 0 };

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

/**
 * 57.0: a window ahead of a body (feet `pos`, facing (fx, fz)) it can dive through, or null (see WINDOW).
 * The result's `to` is past the wall at the sill's height (in the air); `room` the opening's height.
 */
export function findWindow(col: CollisionWorld, pos: THREE.Vector3, fx: number, fz: number, radius: number, ok?: (p: THREE.Vector3) => boolean): Ledge | null {
  const M = MANTLE, W = WINDOW;
  if (!W.on) return null;
  mantleStats.probes++;
  // The wall under the sill, as for a ledge.
  mantleStats.rays++;
  _o.set(pos.x, pos.y + M.hip, pos.z);
  _d.set(fx, 0, fz);
  const wall = col.raycast(_o, _d, M.reach, _hit, true);
  if (!wall || Math.abs(wall.normal.y) > 0.3 || wall.normal.x * fx + wall.normal.z * fz > -M.faceCos) return null;
  if (wall.collider?.vault) return null;
  // Head-on through it: along the wall's normal. (The rays below reuse the hit record: copied out first.)
  const nx = wall.normal.x, nz = wall.normal.z, ax = -nx, az = -nz;
  const wx = wall.point.x, wy = wall.point.y, wz = wall.point.z, wd = wall.dist;
  // The sill: straight down just inside the face.
  mantleStats.rays++;
  _o.set(wx + ax * 0.06, pos.y + M.maxUp + 0.02, wz + az * 0.06);
  const sillHit = col.raycast(_o, _down, M.maxUp + 0.02 - M.minUp, _hit, true);
  if (!sillHit || sillHit.normal.y < 0.9) return null;
  const sill = sillHit.point.y;
  const rise = sill - pos.y;
  if (rise <= M.minUp || rise > M.maxUp || sill < wy) return null;
  // The opening's height: the lintel over the sill.
  // (A window has one: over the top of a fence or a low wall there is none, and those stay in the way.)
  const lintel = col.ceilingAbove(wx + ax * 0.06, wz + az * 0.06, 0.02, sill + 0.02);
  if (lintel - sill < W.height || lintel - sill > W.lintel) return null;
  // The wall's depth: where the sill ends (the ground drops away past its far face).
  let depth = -1;
  for (let t = 0.12; t <= W.depth + 0.01; t += 0.04) {
    if (col.groundHeightAt(wx + ax * t, wz + az * t, 0.01, sill + 0.05, 0.08) < sill - 0.05) {
      depth = t;
      break;
    }
  }
  if (depth < 0) return null;
  // Clear through, across its width (the body's edges and the middle) at the sill and below the lintel.
  const sx = -az, sz = ax, half = W.width / 2 - 0.05;
  const len = wd + depth + radius + 0.15;
  for (const off of [-half, 0, half]) {
    for (const y of [sill + 0.12, Math.min(lintel - 0.08, sill + W.height - 0.08)]) {
      mantleStats.rays++;
      _o.set(pos.x + sx * off, y, pos.z + sz * off);
      _p.set(ax, 0, az);
      if (col.raycast(_o, _p, len, _hit, true)) return null;
    }
  }
  // Out past the far face at the sill's height, clear of everything, over ground not too far down.
  const to = new THREE.Vector3(wx + ax * (depth + radius + 0.1), sill + 0.02, wz + az * (depth + radius + 0.1));
  if (col.blocked(to, radius - 0.02, CROUCH_MIN)) return null;
  const g = col.groundHeightAt(to.x, to.z, radius * 0.6, sill + 0.05, W.drop + 0.1);
  if (!(g > sill - W.drop)) return null;
  if (ok && !ok(to)) return null;
  return { to, rise, room: lintel - sill, nx, nz, air: true, cap: lintel - 0.12 };
}
/** The body's height while it dives through a window (its collision is off for the move). */
const CROUCH_MIN = 0.7;

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Where the feet are `t` s into a pull-up from `from` to `to` (T s long): the height eased out over the
 * first `upShare` of it, the step forward eased in-out over the rest (starting as the hands clear the lip).
 */
export function mantlePos(from: THREE.Vector3, to: THREE.Vector3, t: number, T: number, out: THREE.Vector3, air = false) {
  const k = Math.min(1, Math.max(0, t / T));
  // 57.0, a window: all the way up to the sill before going through (the forward move starting early
  // put the feet through the sill's lip).
  const share = air ? WINDOW.upShare : MANTLE.upShare;
  const ku = Math.min(1, k / share);
  const up = 1 - (1 - ku) ** 3;
  const kf = Math.min(1, Math.max(0, (k - share * (air ? 1 : 0.6)) / (1 - share * (air ? 1 : 0.6))));
  const f = ease(kf);
  return out.set(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * up, from.z + (to.z - from.z) * f);
}
