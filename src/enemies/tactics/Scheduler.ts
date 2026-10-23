/**
 * Time-slicing for the heavy half of the AI (perception rays, cover evaluation, decisions).
 *
 * Every tactical enemy runs two loops: a cheap `act` every frame (steering, aiming, timers, anims)
 * and an expensive `decide` that only the scheduler may start. Each frame the scheduler hands out at
 * most `maxPerFrame` decide slots, most overdue first (an urgent request, such as being shot at,
 * jumps the queue), and a shared ray budget the decisions draw from. A decision that can't afford
 * its rays (a full cover search) defers that part to its next slot; nobody ever blocks a frame.
 *
 * Pure: no three.js, no clocks. The caller passes the time and counts rays through `spend`.
 */
export interface Thinker {
  /** Sim time of the next decide this agent wants. */
  nextThink: number;
  /** Something happened (hit, near miss, squad order): think on the next frame, ahead of the queue. */
  urgent: boolean;
}

export interface SchedulerStats {
  frames: number;
  thinks: number;
  /** Most decides started in one frame. */
  maxThinks: number;
  rays: number;
  /** Most rays spent in one frame (the budget can be overshot by one decision's last ray group). */
  maxRays: number;
  /** Cover searches pushed to a later slot for lack of budget. */
  deferred: number;
  /** Largest lateness of a started decide (s): how stale a decision may get under load. */
  maxLate: number;
  /** Path re-plans pushed to a later frame. */
  deferredRoutes: number;
}

export class ThinkScheduler {
  /** Decide slots per frame. */
  maxPerFrame = 3;
  /** Collision rays per frame for all decisions together. */
  rayBudget = 30;
  /** Full cover searches per frame (the heaviest single job). */
  coverPerFrame = 1;
  /** Path re-plans per frame (graph searches), shared by every enemy's steering. */
  routesPerFrame = 2;
  private routeT = -1;
  private routes = 0;
  rays = 0;
  covers = 0;
  stats: SchedulerStats = ThinkScheduler.empty();
  private queue: Thinker[] = [];

  static empty(): SchedulerStats {
    return { frames: 0, thinks: 0, maxThinks: 0, rays: 0, maxRays: 0, deferred: 0, maxLate: 0, deferredRoutes: 0 };
  }

  resetStats() {
    this.stats = ThinkScheduler.empty();
  }

  /** Who decides this frame: urgent first, then the most overdue; never more than `maxPerFrame`. */
  pick<T extends Thinker>(agents: readonly T[], now: number): T[] {
    if (this.rays > this.stats.maxRays) this.stats.maxRays = this.rays;
    this.rays = 0;
    this.covers = 0;
    this.stats.frames++;
    const q = this.queue as T[];
    q.length = 0;
    for (const a of agents) if (a.urgent || a.nextThink <= now) q.push(a);
    if (q.length > this.maxPerFrame) q.sort((a, b) => (a.urgent === b.urgent ? a.nextThink - b.nextThink : a.urgent ? -1 : 1));
    const n = Math.min(this.maxPerFrame, q.length);
    const out = q.slice(0, n);
    // 36.0: the scratch list holds nobody between frames: a match that stops picking (the countdown,
    // a map change behind an intro) must not keep the last level's bodies alive through it.
    q.length = 0;
    for (const a of out) {
      const late = now - a.nextThink;
      if (!a.urgent && late > this.stats.maxLate) this.stats.maxLate = late;
      a.urgent = false;
    }
    this.stats.thinks += n;
    if (n > this.stats.maxThinks) this.stats.maxThinks = n;
    return out;
  }

  /** Count rays a decision cast. */
  spend(n: number) {
    this.rays += n;
    this.stats.rays += n;
  }

  /** Room for `n` more rays this frame. */
  canAfford(n: number) {
    return this.rays + n <= this.rayBudget;
  }

  /**
   * May an enemy re-plan its path this frame? Counted per sim time stamp, so it works even where the
   * director's frame never runs (story guards share the context). A refused re-plan keeps the old
   * path for another frame.
   */
  tryRoute(now: number) {
    if (now !== this.routeT) {
      this.routeT = now;
      this.routes = 0;
    }
    if (this.routes >= this.routesPerFrame) {
      this.stats.deferredRoutes++;
      return false;
    }
    this.routes++;
    return true;
  }

  /** A full cover search may start now (budget and per-frame cap); otherwise it is deferred. */
  tryCoverSearch(cost: number) {
    if (this.covers < this.coverPerFrame && this.canAfford(cost)) {
      this.covers++;
      return true;
    }
    this.stats.deferred++;
    return false;
  }
}

/** Seconds until the next decide: fast in a close fight, slow when calm or far (with jitter). */
export function thinkInterval(engaged: boolean, dist: number, jitter: number) {
  const base = !engaged ? 0.45 : dist < 14 ? 0.16 : dist < 30 ? 0.24 : 0.36;
  return base * (0.85 + 0.3 * jitter);
}
