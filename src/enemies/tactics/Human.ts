import * as THREE from 'three';

/**
 * The human in an allied squad (6.0). The ALPHA director can't order the player about, so it reads
 * him instead: from what he observably does over the last few seconds (where he moves relative to the
 * fight, how much he shoots, how hurt he is) it infers the role he is playing, and fills the others
 * around it. Pure: fed positions and shot times, no three.js scene, no clock.
 *
 *   suppressing  shooting steadily from roughly one place   → fewer bot suppressors, more flankers
 *   pushing      closing on the enemy                       → an extra suppressor covers his advance
 *   flanking     working round one side of the fight        → bot flankers balance to the other side
 *   retreating   falling back, or hurt and not advancing     → bots suppress what is on him
 *   holding      neither moving much nor shooting           → bots take the initiative (default roles)
 *   down         dead, waiting to respawn                   → four bots, no human slot
 */
export type HumanStyle = 'suppressing' | 'pushing' | 'flanking' | 'retreating' | 'holding' | 'down';

export const HUMAN = {
  /** Window over which his behaviour is judged (s). */
  window: 3,
  sampleEvery: 0.25,
  /** Shots per second that count as laying down fire. */
  fireRate: 1.2,
  /** Speed (m/s over the window) below which a shooter counts as stationary. */
  still: 1.6,
  /** Closing speed towards the enemy that counts as pushing (m/s, net over the window). */
  closing: 1.2,
  /** Sideways speed across the fight that counts as flanking (m/s). */
  lateral: 1.2,
  /** Health below which he is hurt (retreating unless he is pushing anyway). */
  hurt: 0.35,
  /** A new style must hold for this many judgements in a row (0.4 s apart) before it is adopted. */
  confirm: 2,
};

interface Sample {
  t: number;
  x: number;
  z: number;
}

export class HumanObserver {
  style: HumanStyle = 'holding';
  /** Flank side while flanking: +1 left, -1 right (the squad's convention: as seen facing the enemy). */
  side = 0;
  /** When the current style was adopted. */
  since = 0;
  /** Last measured rates (for debug and the report). */
  rates = { fire: 0, speed: 0, closing: 0, lateral: 0 };
  private shots: number[] = [];
  private track: Sample[] = [];
  private pending: HumanStyle | null = null;
  private pendingN = 0;

  reset() {
    this.style = 'holding';
    this.side = 0;
    this.since = 0;
    this.shots.length = 0;
    this.track.length = 0;
    this.pending = null;
    this.pendingN = 0;
  }

  /** He fired a round. */
  shot(t: number) {
    this.shots.push(t);
    if (this.shots.length > 64) this.shots.shift();
  }

  /** Every frame: his position (sampled at a fixed rate internally). */
  sample(t: number, pos: THREE.Vector3) {
    const last = this.track[this.track.length - 1];
    if (last && t - last.t < HUMAN.sampleEvery) return;
    this.track.push({ t, x: pos.x, z: pos.z });
    while (this.track.length > 2 && t - this.track[0].t > HUMAN.window) this.track.shift();
  }

  /**
   * Judge his style now. `enemy` is where the squad believes the enemy is (null: no contact),
   * `front` the unit XZ direction from the enemy towards the squad's base of fire.
   */
  classify(t: number, alive: boolean, hpFrac: number, pos: THREE.Vector3, enemy: THREE.Vector3 | null, front: THREE.Vector2): HumanStyle {
    if (!alive) {
      this.track.length = 0;
      this.adopt('down', t, true);
      return this.style;
    }
    const w = HUMAN.window;
    const fire = this.shots.filter((s) => t - s <= w).length / w;
    const first = this.track[0];
    const span = first ? Math.max(0.5, t - first.t) : 1;
    const dx = first ? pos.x - first.x : 0, dz = first ? pos.z - first.z : 0;
    const speed = Math.hypot(dx, dz) / span;
    let closing = 0, lateral = 0;
    if (enemy && first) {
      // Closing is how fast the distance to the enemy shrank (not movement along today's bearing:
      // circling him, which is what a flank is, keeps the distance and must not read as falling back).
      // Whatever movement isn't closing or opening is lateral.
      const dThen = Math.hypot(enemy.x - first.x, enemy.z - first.z);
      const dNow = Math.hypot(enemy.x - pos.x, enemy.z - pos.z);
      closing = (dThen - dNow) / span;
      lateral = Math.sqrt(Math.max(0, speed * speed - closing * closing));
    }
    this.rates = { fire: +fire.toFixed(2), speed: +speed.toFixed(2), closing: +closing.toFixed(2), lateral: +lateral.toFixed(2) };
    let next: HumanStyle;
    if (enemy && (closing < -HUMAN.closing || (hpFrac < HUMAN.hurt && closing < 0.5))) next = 'retreating';
    else if (enemy && closing > HUMAN.closing && closing >= lateral) next = 'pushing';
    else if (enemy && lateral > HUMAN.lateral) next = 'flanking';
    else if (fire >= HUMAN.fireRate && speed < HUMAN.still) next = 'suppressing';
    else if (fire >= HUMAN.fireRate) next = closing > 0.5 ? 'pushing' : 'suppressing';
    else next = 'holding';
    if (next === 'flanking' && enemy) {
      const sx = pos.x - enemy.x, sz = pos.z - enemy.z;
      const s = front.x * sz - front.y * sx;
      this.side = s >= 0 ? 1 : -1;
    }
    // Danger is adopted at once; anything else must hold for a moment (no flicker between styles).
    this.adopt(next, t, next === 'retreating');
    return this.style;
  }

  private adopt(s: HumanStyle, t: number, now: boolean) {
    if (s === this.style) {
      this.pending = null;
      this.pendingN = 0;
      return;
    }
    if (!now) {
      if (this.pending !== s) {
        this.pending = s;
        this.pendingN = 1;
        return;
      }
      if (++this.pendingN < HUMAN.confirm) return;
    }
    this.style = s;
    this.since = t;
    this.pending = null;
    this.pendingN = 0;
  }
}
