/**
 * Detection maths for security officers. Pure functions over one config, so guards, the minimap
 * cones and the unit tests all agree on what an officer can see.
 *
 * A guard accumulates `suspicion` (0..1) while it can see the player. 0.3 makes it suspicious
 * (stops, turns, investigates), 1.0 is a positive identification. Seeing needs range, the view cone
 * (horizontal and vertical) and an unobstructed 3D line to part of the body.
 */

export const VISION = {
  /** Full horizontal field of view of the forward cone, degrees. */
  fovH: 85,
  /** How far up / down a guard looks without tilting his head, degrees. */
  lookUp: 40,
  lookDown: 55,
  /** In a firefight officers look for the shooter, up as well: walkways and roofs aren't blind spots. */
  lookUpEngaged: 70,
  /** Direct sight: a drawn weapon, or security already hunting the fugitive. */
  range: 16,
  /** A holstered, not-yet-wanted fugitive is only recognised this close. */
  calmRange: 9,
  /** An officer already fighting you keeps you in sight this far (still inside his cone). */
  engagedRange: 22,
  /** Wide side vision: slow suspicion only, close up. */
  peripheralFov: 150,
  peripheral: 5,
  /** Any direction (brushing past him). */
  touch: 1.6,
  /** Inside this distance recognition runs at its fastest. */
  near: 4,
  /** Seconds of continuous full view to identify: [near, edge of range]. */
  timeDrawn: [0.7, 1.5] as const,
  timeHunting: [0.9, 2.0] as const,
  timeCalm: [1.6, 3.2] as const,
  /** Already identified this episode: a second look is enough. */
  timeRemembers: 0.5,
  /** Suspicion lost per second without sight. */
  decay: 0.3,
  /** Perception ticks per second near the player and far from him. */
  hzNear: 8,
  hzFar: 3,
  farDistance: 40,
  /** Body sample heights above the feet (head, chest, knees). */
  samples: [1.6, 1.1, 0.5] as const,
};

export const SUSPICIOUS = 0.3;
export const CONFIRMED = 1;

const DEG = Math.PI / 180;
export const FOV_COS = Math.cos((VISION.fovH / 2) * DEG);
const PERIPHERAL_COS = Math.cos((VISION.peripheralFov / 2) * DEG);

export interface RangeInput {
  weaponDrawn: boolean;
  /** Security is actively hunting the fugitive (alerted / pursuit / search, or recently). */
  hunting: boolean;
  /** This guard has positively identified the player in this episode. */
  remembers: boolean;
  /** This guard is in a firefight with the player. */
  engaged: boolean;
  /** The player fired within the last moment (muzzle flash). */
  firing: boolean;
}

/** How far this guard can recognise the player in the current situation (also the minimap cone). */
export function visionRange(i: RangeInput): number {
  if (i.engaged || i.firing) return VISION.engagedRange;
  if (i.weaponDrawn || i.hunting || i.remembers) return VISION.range;
  return VISION.calmRange;
}

export type SightZone = 'cone' | 'peripheral' | 'touch' | null;

/**
 * Where the target sits in the guard's view. `cosH`: cosine between the facing and the horizontal
 * direction to the target; `dy`: target height minus eye height; `dh`: horizontal distance.
 */
export function sightZone(cosH: number, dy: number, dh: number, range: number, engaged = false): SightZone {
  const dist = Math.hypot(dh, dy);
  if (dist <= VISION.touch) return 'touch';
  if (dist > range) return null;
  const pitch = Math.atan2(dy, Math.max(1e-3, dh)) / DEG;
  if (pitch > (engaged ? VISION.lookUpEngaged : VISION.lookUp) || pitch < -VISION.lookDown) return null;
  if (cosH >= FOV_COS) return 'cone';
  if (dist <= VISION.peripheral && cosH >= PERIPHERAL_COS) return 'peripheral';
  return null;
}

export interface SightInput extends RangeInput {
  /** Eye → body distance (3D). */
  dist: number;
  zone: SightZone;
  /** How many of the body samples have a clear 3D line (0..samples.length). */
  visible: number;
  sprinting: boolean;
  /** Light level around the player, 0 (dark) .. 1 (lit). */
  light: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Exposure factor by how many body samples are visible (one fingertip is not a sighting). */
const EXPOSURE = [0, 0.35, 0.8, 1];

/** Suspicion gained per second (0 when the player cannot be seen). */
export function suspicionRate(i: SightInput): number {
  if (!i.zone || i.visible <= 0) return 0;
  const range = visionRange(i);
  if (i.dist > range && i.zone !== 'touch') return 0;
  const k = smooth(VISION.near, range, i.dist);
  let time: number;
  if (i.remembers) time = VISION.timeRemembers;
  else {
    const [a, b] = i.weaponDrawn || i.firing ? VISION.timeDrawn : i.hunting ? VISION.timeHunting : VISION.timeCalm;
    time = a + (b - a) * k;
  }
  let rate = 1 / time;
  rate *= EXPOSURE[Math.min(3, i.visible)];
  if (i.sprinting) rate *= 1.3;
  // Darkness only helps at range, and a muzzle flash gives you away anyway.
  if (i.dist > 6 && !i.firing) rate *= 0.55 + 0.45 * Math.min(1, Math.max(0, i.light));
  if (i.zone === 'peripheral') rate *= 0.35;
  return rate;
}

/** Advances a suspicion meter by dt. */
export function stepSuspicion(current: number, rate: number, dt: number): number {
  const next = rate > 0 ? current + rate * dt : current - VISION.decay * dt;
  return Math.min(CONFIRMED, Math.max(0, next));
}

/** Seconds between perception ticks for a guard this far from the player. */
export function perceptionInterval(distance: number): number {
  return 1 / (distance > VISION.farDistance ? VISION.hzFar : VISION.hzNear);
}
