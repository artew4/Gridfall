import * as THREE from 'three';
import { ARMORY, type BotArm, type WeaponId } from '../../entities/weapons/armory';

/*
  42.0, archetypes (ARENA.roles): what a bot is for this life, dealt at each spawn so the team keeps
  near its shares. Pure: the director and Tdm call these, the tests drive them.

    pickRole     the role furthest below its share of the team (a frontliner on a tie; no anchor
                 without a free post).
    roleArm      the gun a role carries: the anchor the rifle, the wolf a pistol or SMG, the
                 frontliner mostly a shotgun or rifle; each gun at most `cap` among the role's bots
                 (or its share of them, if more) while another fits (13.0's rule, per role), the
                 anchor's rifle regardless.
    anchorPosts  where anchors stand: candidates on the nav in the team's own half (up to the
                 middle), scored by the sightlines toward the enemy, height, a wall at the back and the
                 map's high ground, less for a long walk from its spawn; the best, at least `gap` m
                 apart, whose route from home is not much longer than the way there.
*/

export type ArenaRole = 'frontliner' | 'wolf' | 'anchor';
export const ROLES: readonly ArenaRole[] = ['frontliner', 'wolf', 'anchor'];

/** The role a new bot takes: the one furthest below its share of `total` bots (`counts`: the others'). */
export function pickRole(counts: Record<ArenaRole, number>, total: number, share: Record<ArenaRole, number>, anchorFree: boolean): ArenaRole {
  let best: ArenaRole = 'frontliner', bd = -Infinity;
  for (const r of ROLES) {
    if (r === 'anchor' && !anchorFree) continue;
    const d = share[r] * total - counts[r];
    // A frontliner wins a tie (it is listed first): a team of one is a frontliner.
    if (d > bd + 1e-9) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** How each role weighs the guns. */
export const ROLE_ARMS: Record<ArenaRole, Partial<Record<WeaponId, number>>> = {
  frontliner: { shotgun: 0.4, ar: 0.4, smg: 0.1, pistol: 0.1 },
  wolf: { pistol: 0.5, smg: 0.5 },
  anchor: { ar: 1 },
};

/**
 * The gun for `role` (see the header): `held`, the guns the team's bots of this role carry now; a gun's
 * cap is `cap`, or its share of the `size` bots the role has on the team when that is more (six
 * frontliners: three shotguns and three rifles may be held).
 */
export function roleArm(role: ArenaRole, held: readonly WeaponId[] = [], cap = Infinity, rng: () => number = Math.random, size = 0): BotArm {
  const w = ROLE_ARMS[role];
  const all = Object.keys(w) as WeaponId[];
  const capOf = (id: WeaponId) => Math.max(cap, Math.ceil((w[id] ?? 0) * size));
  const fits = role === 'anchor' ? all : all.filter((id) => held.filter((h) => h === id).length < capOf(id));
  const pool = fits.length ? fits : all;
  const sum = pool.reduce((a, id) => a + (w[id] ?? 0), 0);
  let x = rng() * sum;
  for (const id of pool) {
    x -= w[id] ?? 0;
    if (x < 0) return ARMORY[id].bot;
  }
  return ARMORY[pool[pool.length - 1]].bot;
}

export interface PostCandidate {
  pos: THREE.Vector3;
  /** The map's own high ground (TdmData.highGround): worth `highBonus`. */
  high?: boolean;
}

export interface PostOptions {
  /** Progress along the team's axis (-1 its spawn … +1 the enemy's), and the axis (unit, xz). */
  progress: (p: THREE.Vector3) => number;
  axis: { x: number; z: number };
  /** Open distance from `from` along the unit direction (dx, dz), at most `max` m. */
  sight: (from: THREE.Vector3, dx: number, dz: number, max: number) => number;
  /** The floor's lowest height near it (height counts above it); default 0. */
  floor?: (p: THREE.Vector3) => number;
  /** Posts wanted, and the least gap between them (m). */
  count: number;
  gap: number;
  /** Progress band the posts lie in. */
  from?: number;
  to?: number;
  maxSight?: number;
  perMetreUp?: number;
  highBonus?: number;
  backed?: number;
  /** The team's own spawn points: a post further than `homeFree` m from all of them scores `perMetreFar` less a metre. */
  home?: readonly THREE.Vector3[];
  homeFree?: number;
  perMetreFar?: number;
  /** Can a body stand there (on the nav)? Default: yes. */
  reachable?: (p: THREE.Vector3) => boolean;
  /**
   * Is the walk there from home short enough (a route, not a maze round to a stair)? Asked only of
   * the posts being taken, best first (it may cost a route search). Default: yes.
   */
  walkOk?: (p: THREE.Vector3) => boolean;
}

/**
 * A candidate's worth as a post: the mean open distance over the directions within 80° of the axis
 * (toward the enemy), plus `perMetreUp` per metre over the floor, `backed` if a wall stands within 4 m
 * behind it, `highBonus` if it is the map's high ground.
 */
export function postScore(c: PostCandidate, o: PostOptions) {
  const max = o.maxSight ?? 60;
  const base = Math.atan2(o.axis.x, o.axis.z);
  let sum = 0, n = 0;
  for (let k = -4; k <= 4; k++) {
    const a = base + (k * 20 * Math.PI) / 180;
    sum += o.sight(c.pos, Math.sin(a), Math.cos(a), max);
    n++;
  }
  const up = Math.max(0, c.pos.y - (o.floor?.(c.pos) ?? 0));
  const back = o.sight(c.pos, -o.axis.x, -o.axis.z, 4) < 4 ? o.backed ?? 6 : 0;
  const home = o.home?.length ? Math.min(...o.home.map((h) => Math.hypot(h.x - c.pos.x, h.z - c.pos.z))) : 0;
  const far = Math.max(0, home - (o.homeFree ?? 25)) * (o.perMetreFar ?? 0.6);
  return sum / n + Math.min(8, up) * (o.perMetreUp ?? 4) + back + (c.high ? o.highBonus ?? 20 : 0) - far;
}

/** The posts (see the header), best first. */
export function anchorPosts(cands: readonly PostCandidate[], o: PostOptions): THREE.Vector3[] {
  const from = o.from ?? -0.75, to = o.to ?? 0;
  const scored = cands
    .filter((c) => {
      const p = o.progress(c.pos);
      return p >= from && p <= to && (o.reachable?.(c.pos) ?? true);
    })
    .map((c) => ({ c, s: postScore(c, o) }))
    .sort((a, b) => b.s - a.s);
  const out: THREE.Vector3[] = [];
  for (const { c } of scored) {
    if (out.length >= o.count) break;
    if (out.some((p) => Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < o.gap)) continue;
    if (o.walkOk && !o.walkOk(c.pos)) continue;
    out.push(c.pos.clone());
  }
  return out;
}
