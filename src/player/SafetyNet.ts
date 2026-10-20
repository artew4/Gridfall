import * as THREE from 'three';

/** What the safety net needs to know about the world. */
export interface SafetyWorld {
  bounds: THREE.Box2;
  /** Lowest height anyone can legitimately stand at (the platform floor). */
  floorMin: number;
  blocked(p: THREE.Vector3, radius: number): boolean;
  /** Part of the designed level (a zone). */
  designed(p: THREE.Vector3): boolean;
  /** Riding a train: legitimately leaves the extent (the wrong-train ending). */
  aboard(p: THREE.Vector3): boolean;
}

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  onGround: boolean;
  alive: boolean;
}

const RECORD_EVERY = 0.25;
/** Falling this far below the lowest floor means the body left the world. */
const FALL_MARGIN = 3;
/** Below the lowest floor at all (e.g. standing in the track pit) for this long. */
const BELOW_TIME = 0.75;
/** Outside the extent by more than this (and not aboard a train). */
const OUT_MARGIN = 2;
/** Stuck inside geometry for this long. */
const STUCK_TIME = 1;
/** More recoveries than this within LOOP_WINDOW → the last safe spot is itself bad; use the fallback. */
const LOOP_MAX = 3;
const LOOP_WINDOW = 6;

/**
 * Last line of defence, not a collision fix (3.3). The controller and the level are meant to make every
 * case below impossible; the world check and the stress test verify that. If one still happens in play,
 * the body goes back to the last place it stood safely instead of falling forever or staying stuck,
 * mission state untouched, and the event is counted and logged (DEV) so it can be found and fixed.
 */
export class SafetyNet {
  private safe = new THREE.Vector3();
  /** Where the current life started (level start or checkpoint): the fallback when looping. */
  private start = new THREE.Vector3();
  private t = 0;
  private stuck = 0;
  private below = 0;
  private recent: number[] = [];
  private clock = 0;
  recoveries = 0;
  lastReason = '';
  lastFrom = new THREE.Vector3();

  constructor(private world: SafetyWorld) {}

  /** New life / level start / checkpoint: forget the previous safe spot. */
  reset(p: THREE.Vector3) {
    this.start.copy(p);
    this.safe.copy(p);
    this.stuck = 0;
    this.below = 0;
    this.recent.length = 0;
  }

  /** Call after the player's movement each frame. Returns the reason if it recovered the body. */
  update(dt: number, b: Body): string | null {
    this.clock += dt;
    const w = this.world;
    const p = b.pos;
    const aboard = w.aboard(p);
    let why: string | null = null;
    if (!Number.isFinite(p.x + p.y + p.z)) why = 'invalid position';
    else if (p.y < w.floorMin - FALL_MARGIN) why = 'fell out of the world';
    else if (!aboard && (p.x < w.bounds.min.x - OUT_MARGIN || p.x > w.bounds.max.x + OUT_MARGIN || p.z < w.bounds.min.y - OUT_MARGIN || p.z > w.bounds.max.y + OUT_MARGIN)) why = 'left the playable extent';
    else {
      this.below = p.y < w.floorMin - 0.5 && !aboard ? this.below + dt : 0;
      this.stuck = w.blocked(p, b.radius - 0.05) ? this.stuck + dt : 0;
      if (this.below > BELOW_TIME) why = 'below the lowest floor';
      else if (this.stuck > STUCK_TIME) why = 'stuck inside geometry';
    }
    if (why) {
      this.recover(b, why);
      return why;
    }
    this.t += dt;
    if (this.t >= RECORD_EVERY && b.alive && b.onGround && !aboard && this.stuck === 0 && this.below === 0 && w.designed(p) && !w.blocked(p, b.radius - 0.02)) {
      this.t = 0;
      this.safe.copy(p);
    }
    return null;
  }

  private recover(b: Body, why: string) {
    this.recoveries++;
    this.lastReason = why;
    this.lastFrom.copy(b.pos);
    this.recent = this.recent.filter((t) => this.clock - t < LOOP_WINDOW);
    this.recent.push(this.clock);
    // Repeated recoveries mean the remembered spot leads straight back into trouble: break the loop.
    const loop = this.recent.length > LOOP_MAX;
    const to = loop ? this.start : this.safe;
    if (loop) this.recent.length = 0;
    b.pos.copy(to);
    b.vel.set(0, 0, 0);
    this.safe.copy(to);
    this.stuck = 0;
    this.below = 0;
    if (import.meta.env.DEV) console.warn(`[safety] ${why} at (${this.lastFrom.x.toFixed(1)}, ${this.lastFrom.y.toFixed(1)}, ${this.lastFrom.z.toFixed(1)}) → (${to.x.toFixed(1)}, ${to.y.toFixed(1)}, ${to.z.toFixed(1)})${loop ? ' [loop: fallback]' : ''}`);
  }
}
