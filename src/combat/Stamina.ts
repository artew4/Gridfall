/*
  30.0, stamina: the sprint costs something, and what you carry decides how much.

    pool          0 … 100
    drain         100 / sprintFor      per second of sprint      (a full pool lasts sprintFor s)
    recovery      100 / recoverIn × k  per second, after `delay` s without sprinting
                  k = 1 walking, `still` standing or crouched
    exhausted     at 0: no sprint until the pool is back to `resume` (forced to walk)
    slide         needs an active sprint, and costs `slideCost`

  The weight classes (by the gun in hand), as the brief sets them:

    pistol    a 9 s sprint, full again in 4.5 s walking (3 s still)
    smg       5.5 s, 7 s
    rifle     3.5 s, 10 s
    shotgun   3.5 s, 10 s

  Pure: the player and the bots each own one and step it once a frame.
*/

export type WeightClass = 'pistol' | 'smg' | 'rifle' | 'shotgun';

export interface WeightProfile {
  /** Seconds a full pool lasts sprinting. */
  sprintFor: number;
  /** Seconds from empty to full, walking (standing or crouched: faster, STAMINA.still). */
  recoverIn: number;
}

export const WEIGHT: Record<WeightClass, WeightProfile> = {
  pistol: { sprintFor: 9, recoverIn: 4.5 },
  smg: { sprintFor: 5.5, recoverIn: 7 },
  rifle: { sprintFor: 3.5, recoverIn: 10 },
  shotgun: { sprintFor: 3.5, recoverIn: 10 },
};

export const STAMINA = {
  /** Off: infinite sprint (the 29.0 game; the A/B). */
  on: true,
  max: 100,
  /** After running dry, the sprint comes back at this much. */
  resume: 20,
  /** Recovery waits this long after the last sprint (s). */
  delay: 0.6,
  /** Standing or crouched, recovery is this much faster than walking. */
  still: 1.5,
  /** A slide's cost (it needs an active sprint). */
  slideCost: 12,
};

/** The weight class of a gun by its sound family (the player's spec) or armory id (a bot's arm). */
export function weightOf(key: string): WeightClass {
  if (key === 'pistol') return 'pistol';
  if (key === 'smg') return 'smg';
  if (key === 'shotgun') return 'shotgun';
  return 'rifle';
}

export class Stamina {
  value = STAMINA.max;
  /** Ran dry: no sprint until `resume`. */
  exhausted = false;
  private sinceSprint = Infinity;
  /** DEV: seconds sprinting, exhausted, and how often it ran dry. */
  stats = { sprintT: 0, exhaustedT: 0, emptied: 0 };

  constructor(public profile: WeightProfile = WEIGHT.rifle) {}

  /** May it sprint now (the pool isn't empty, and it isn't getting its breath back)? */
  get canSprint() {
    return !STAMINA.on || (!this.exhausted && this.value > 0);
  }

  get frac() {
    return this.value / STAMINA.max;
  }

  /**
   * One frame: `sprinting` (it did sprint this frame), `still` (standing or crouched: faster recovery).
   * Returns whether it may sprint next frame.
   */
  step(dt: number, sprinting: boolean, still: boolean) {
    if (!STAMINA.on) return true;
    const P = this.profile;
    if (sprinting && this.canSprint) {
      this.value = Math.max(0, this.value - (STAMINA.max / P.sprintFor) * dt);
      this.sinceSprint = 0;
      this.stats.sprintT += dt;
      if (this.value === 0) {
        this.exhausted = true;
        this.stats.emptied++;
      }
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= STAMINA.delay) this.value = Math.min(STAMINA.max, this.value + (STAMINA.max / P.recoverIn) * (still ? STAMINA.still : 1) * dt);
    }
    if (this.exhausted) {
      this.stats.exhaustedT += dt;
      if (this.value >= STAMINA.resume) this.exhausted = false;
    }
    return this.canSprint;
  }

  /** A slide: true (and its cost paid) if it may start one. */
  slide() {
    if (!STAMINA.on) return true;
    if (!this.canSprint || this.value < STAMINA.slideCost) return false;
    this.value -= STAMINA.slideCost;
    this.sinceSprint = 0;
    return true;
  }

  reset() {
    this.value = STAMINA.max;
    this.exhausted = false;
    this.sinceSprint = Infinity;
  }
}
