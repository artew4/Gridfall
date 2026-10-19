/**
 * Detection maths for security officers. Pure functions so the tuning can be unit-tested.
 *
 * A guard accumulates `suspicion` (0..1) while it can see the player. 0.3 makes it suspicious
 * (stops, turns, investigates), 1.0 is a positive identification. What it sees matters more than
 * how close it is: a drawn weapon is recognised from far away, a holstered fugitive in a raincoat
 * only up close (or from further when security is actively hunting him).
 */

export const SUSPICIOUS = 0.3;
export const CONFIRMED = 1;
/** Suspicion lost per second without sight. */
export const DECAY = 0.22;
/** cos(60°): a 120° view cone. */
export const FOV_COS = 0.5;
/** Inside this radius guards notice movement in any direction (at half rate). */
export const PERIPHERAL = 4.5;
/** Inside this radius they always notice at full rate. */
export const TOUCH = 1.8;

export interface SightInput {
  /** Distance guard eye → player. */
  dist: number;
  /** Cosine between the guard's facing and the direction to the player. */
  cos: number;
  /** Unobstructed line of sight (geometry, steam). */
  los: boolean;
  weaponDrawn: boolean;
  sprinting: boolean;
  /** Light level around the player, 0 (dark) .. 1 (lit). */
  light: number;
  /** Security is actively hunting the fugitive (alerted / pursuit / search, or recently). */
  hunting: boolean;
  /** This guard has positively identified the player recently. */
  remembers: boolean;
}

/** Maximum distance at which this situation can be noticed at all. */
export function sightRange(i: Pick<SightInput, 'weaponDrawn' | 'hunting' | 'remembers'>): number {
  if (i.remembers) return 32;
  if (i.weaponDrawn) return 30;
  return i.hunting ? 20 : 10;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Suspicion gained per second (0 when the player cannot be seen). */
export function suspicionRate(i: SightInput): number {
  if (!i.los) return 0;
  const range = sightRange(i);
  if (i.dist > range) return 0;
  const inCone = i.cos >= FOV_COS;
  if (!inCone && i.dist > PERIPHERAL) return 0;
  // Closeness: 1 within 3 m, falling to 0 at the edge of range.
  const f = 1 - smooth(3, range, i.dist);
  let rate: number;
  if (i.remembers) rate = 4;
  else if (i.weaponDrawn) rate = 0.25 + 3.0 * Math.pow(f, 0.7);
  else if (i.hunting) rate = 0.3 + 1.5 * f;
  else rate = 0.6 * f;
  if (i.sprinting) rate *= 1.35;
  // Darkness only helps at range.
  if (i.dist > 6) rate *= 0.55 + 0.45 * Math.min(1, Math.max(0, i.light));
  if (!inCone && i.dist > TOUCH) rate *= 0.5;
  return rate;
}

/** Advances a suspicion meter by dt. */
export function stepSuspicion(current: number, rate: number, dt: number): number {
  const next = rate > 0 ? current + rate * dt : current - DECAY * dt;
  return Math.min(CONFIRMED, Math.max(0, next));
}
