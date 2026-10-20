import * as THREE from 'three';

/**
 * Dynamic cover. A level only authors candidate spots (next to a crate, a pillar, a wall end); none
 * of them is cover by itself. A spot is cover *against a threat position* when a crouched body there
 * is hidden from the threat's eyes AND there's a peek position (stand up over it, or lean out to a
 * side) from which the threat's chest is in sight. Both are real collision rays, so the answer flips
 * the moment the player walks round the obstacle: that's how an enemy learns its cover is blown.
 */

/** Heights above the spot's floor. Crouched points match the crouched hitboxes (see Enemy.hitHeight). */
export const COVER = {
  /**
   * Hunkered gunner (drop 0.78): head centre 1.08, chest 0.54. The head point is a little below the
   * head centre on purpose: behind waist-high sandbags (1.05 m) the helmet may show — a headshot over
   * the barrier is fair play — but the body must not.
   */
  crouchHead: 1.0,
  crouchChest: 0.6,
  standEye: 1.6,
  /** Sideways steps to lean out past a wall end or a pillar (a short lean, then a wider step out). */
  lean: 0.8,
  leanWide: 1.35,
  threatEye: 1.6,
  threatChest: 1.2,
  /** Cached verdicts stay valid while the threat moved less than this (m) and for this long (s). */
  cacheMove: 1.0,
  cacheAge: 0.6,
};

export type PeekKind = 'stand' | 'left' | 'right';

export interface CoverEval {
  /** A crouched body at the spot is hidden from the threat. */
  protected: boolean;
  /** Where to stand to shoot (world, floor height), if anywhere. */
  peek: THREE.Vector3 | null;
  kind: PeekKind | null;
  /** Rays this evaluation cast. */
  rays: number;
}

export type LosFn = (a: THREE.Vector3, b: THREE.Vector3) => boolean;
export type FreeFn = (p: THREE.Vector3) => boolean;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Is a crouched body at `spot` hidden from `threat` (feet positions)? 1–2 rays. */
export function isProtected(spot: THREE.Vector3, threat: THREE.Vector3, los: LosFn): { ok: boolean; rays: number } {
  const eye = _a.set(threat.x, threat.y + COVER.threatEye, threat.z);
  if (los(eye, _b.set(spot.x, spot.y + COVER.crouchHead, spot.z))) return { ok: false, rays: 1 };
  if (los(eye, _b.set(spot.x, spot.y + COVER.crouchChest, spot.z))) return { ok: false, rays: 2 };
  return { ok: true, rays: 2 };
}

/**
 * Full evaluation, 1–7 rays: protection first (most spots fail here, cheaply), then the peek
 * options in order — standing over low cover, then leaning left or right of tall cover, then a wider
 * step out.
 */
export function evaluateCover(spot: THREE.Vector3, threat: THREE.Vector3, los: LosFn, free: FreeFn, range = Infinity, sight?: LosFn): CoverEval {
  const p = isProtected(spot, threat, los);
  if (!p.ok) return { protected: false, peek: null, kind: null, rays: p.rays };
  let rays = p.rays;
  const chest = new THREE.Vector3(threat.x, threat.y + COVER.threatChest, threat.z);
  const dx = threat.x - spot.x, dz = threat.z - spot.z;
  const d = Math.hypot(dx, dz) || 1;
  if (d > range) return { protected: true, peek: null, kind: null, rays };
  // Perpendicular to the threat direction (left = +, as seen from the spot facing the threat).
  const px = -dz / d, pz = dx / d;
  const options: [PeekKind, number][] = [['stand', 0], ['left', COVER.lean], ['right', -COVER.lean], ['left', COVER.leanWide], ['right', -COVER.leanWide]];
  for (const [kind, off] of options) {
    const at = new THREE.Vector3(spot.x + px * off, spot.y, spot.z + pz * off);
    if (off !== 0 && !free(at)) continue;
    rays++;
    // Protection is hard cover only (rounds go through bushes); a peek must also *see* (`sight`
    // adds soft concealment such as undergrowth, where the level has it).
    _a.set(at.x, at.y + COVER.standEye, at.z);
    if (los(_a, chest) && (!sight || sight(_a, chest))) return { protected: true, peek: at, kind, rays };
  }
  return { protected: true, peek: null, kind: null, rays };
}

interface CacheEntry {
  x: number;
  y: number;
  z: number;
  t: number;
  ev: CoverEval;
}

/**
 * Squad-wide memo of cover verdicts per spot. Everyone evaluates against the same threat (the
 * squad's knowledge of the player), so one enemy's search answers the next one's for free.
 */
export class CoverCache {
  private map = new Map<number, CacheEntry>();
  hits = 0;
  misses = 0;

  get(id: number, threat: THREE.Vector3, now: number): CoverEval | null {
    const e = this.map.get(id);
    if (!e || now - e.t > COVER.cacheAge) return null;
    const m = COVER.cacheMove;
    if ((e.x - threat.x) ** 2 + (e.y - threat.y) ** 2 + (e.z - threat.z) ** 2 > m * m) return null;
    this.hits++;
    return e.ev;
  }

  put(id: number, threat: THREE.Vector3, now: number, ev: CoverEval) {
    this.misses++;
    this.map.set(id, { x: threat.x, y: threat.y, z: threat.z, t: now, ev });
  }

  clear() {
    this.map.clear();
  }
}

/** What a role wants from a spot (distances in m, angle relative to the squad's front axis). */
export interface CoverWish {
  idealMin: number;
  idealMax: number;
  /** -1 / +1: wants a spot on that side of the front axis (a flanker); 0: anywhere. */
  side: number;
}

/**
 * Cheap pre-score (no rays) of a candidate for a role; lower is better, Infinity = never. Used to
 * pick the few spots worth real rays. `front` is the unit XZ direction from the threat towards the
 * squad (where the fight is), so a flanker's ideal is ±90° off it.
 */
export function preScore(spot: THREE.Vector3, self: THREE.Vector3, threat: THREE.Vector3, front: THREE.Vector2, wish: CoverWish, crowd: number) {
  const dx = spot.x - threat.x, dz = spot.z - threat.z;
  const dThreat = Math.hypot(dx, dz);
  if (dThreat < 5) return Infinity;
  // Another level means a stair detour the straight line doesn't show: charge it up front.
  const dy = Math.abs(spot.y - self.y);
  const travel = Math.hypot(spot.x - self.x, spot.z - self.z) + (dy > 1 ? 12 + dy * 2 : dy * 3);
  let s = travel * 0.6 + Math.max(0, wish.idealMin - dThreat, dThreat - wish.idealMax) * 1.2 + crowd * 6;
  if (wish.side !== 0 && dThreat > 0.1) {
    // Signed angle of the spot round the threat, from the front axis: + is the left flank.
    const cross = front.x * dz - front.y * dx;
    const dot = front.x * dx + front.y * dz;
    const ang = Math.atan2(cross, dot) * wish.side;
    // Best at 70–110° on the wanted side; the far side or the front is heavily penalised.
    const off = ang < 0 ? 3 : Math.abs(ang - Math.PI / 2) / (Math.PI / 2);
    s += off * 14;
  }
  return s;
}
