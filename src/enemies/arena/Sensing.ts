import * as THREE from 'three';
import type { Combatant } from '../../combat/Team';
import { ARENA } from './ArenaCtx';
import { ARENA_SEE } from '../../world/Visibility';

/*
  Attention-driven line of sight for the arena bots (7.0). Nobody scans the map: every frame the
  sensing pass gathers the (bot, hostile) pairs that are due, most important first, and resolves them
  within one ray budget:
    0  the hostile it fights           every 0.05 s
    1  one that just hit it, near-missed it or was heard close (same frame, then like 0)
    2  a board contact that is firing  every 0.15 s
    3  anyone else inside the front cone every 0.3 s
    4  behind it, only if alerted      every 0.6 s
  Nothing is checked beyond range, and nothing behind (> 110°) unless it was alerted in the last
  second (35.0: or it is within ARENA.flankThreat.close, checked like a firing contact; anything within
  its radius is checked at least every closeEvery s): it can't see behind its back. Line of sight is symmetric (eye to chest either way), so one
  ray answers a pair for both bots while neither has moved half a metre. A pair that misses the
  budget stays due and is first in line next frame.

  12.0: the human is a viewer too (his team's shared spotting: the minimap and the bots' board). A
  viewer may bring its own `view`: a field of view it never sees outside (a screen, not 220° of
  awareness) and its own re-check interval. His pairs share the budget and the pair cache, so a
  hostile bot that already checked its line to him answers his check for free.

  Pure apart from the `los` callback (no three.js scene, no clocks): the arena tests drive it.
*/

/** What a bot remembers about one hostile. */
export interface Seen {
  vis: boolean;
  /** When it became visible (this stretch), last time it was seen, last check, next check due. */
  since: number;
  last: number;
  at: number;
  next: number;
  /** 34.0: the share of its contrast the ground fog left it at the last check (1: clear). */
  clarity?: number;
}

/** A viewer: the bot's body, what it fights, and when each hostile last alerted it (uid → time). */
export interface SenseAgent {
  readonly self: Combatant & { yaw: number; crouch: number };
  readonly target: Combatant | null;
  readonly alert: Map<number, number>;
  readonly seen: Map<number, Seen>;
  /** Told the moment a hostile comes into view (34.0: with what the fog left of it, 0..1). */
  onSight(h: Combatant, now: number, clarity?: number): void;
  /**
   * 12.0: a viewer with a field of view (cos of its half-angle; nothing outside it is seen, alerted
   * or not) and one re-check interval for everything inside it (the human).
   */
  readonly view?: { cos: number; every: number };
}

interface Pair {
  vis: boolean;
  t: number;
  lo: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface Due {
  a: SenseAgent;
  h: Combatant;
  s: Seen;
  pri: number;
  late: number;
  every: number;
}

export interface SensingStats {
  frames: number;
  checks: number;
  cacheHits: number;
  rays: number;
  /** Due checks pushed to the next frame by the ray budget. */
  deferred: number;
  maxRays: number;
}

const EVERY = [ARENA.sense.targetEvery, ARENA.sense.targetEvery, ARENA.sense.hotEvery, ARENA.sense.coneEvery, ARENA.sense.behindEvery];
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

export class Sensing {
  rays = ARENA.sense.rays;
  stats: SensingStats = Sensing.empty();
  private cache = new Map<number, Pair>();
  private due: Due[] = [];
  private pool: Due[] = [];

  /**
   * `los`: the collision query (the caller counts it against the frame budget). `hidden`: soft
   * concealment along a sightline (the jungle's undergrowth), if any.
   */
  /**
   * 34.0: the ground fog as the picture draws it (HeightFog.heightFogAt: the share of a target hidden
   * from an eye, along the actual line between them, any heights). A pair the fog leaves less than
   * ARENA_SEE of its contrast is not seen (25.0: a cap, 13 m with both feet under 3 m, nothing else).
   */
  fog: ((eye: THREE.Vector3, chest: THREE.Vector3) => number) | null = null;
  /** 25.0 (DEV): pairs the fog cut (in range otherwise, the fog hid them). */
  fogCut = 0;

  constructor(
    private los: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    public hidden?: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
  ) {}

  static empty(): SensingStats {
    return { frames: 0, checks: 0, cacheHits: 0, rays: 0, deferred: 0, maxRays: 0 };
  }

  reset() {
    this.cache.clear();
    this.stats = Sensing.empty();
  }

  /** The pair key (symmetric). Uids are per life and grow; this stays exact far past any match. */
  static key(a: number, b: number) {
    return a < b ? a * 1e7 + b : b * 1e7 + a;
  }

  /**
   * One frame. `hostiles(a)`: who the agent fights. `hot(h)`: the team board has h firing right now.
   * `range`: the weather's sight range, if any.
   */
  update(now: number, agents: readonly SenseAgent[], hostiles: (a: SenseAgent) => readonly Combatant[], hot: (a: SenseAgent, h: Combatant) => boolean, range = ARENA.sense.range) {
    this.stats.frames++;
    const due = this.due;
    for (const d of due) this.pool.push(d);
    due.length = 0;
    const S = ARENA.sense;
    for (const a of agents) {
      const me = a.self;
      if (!me.alive) continue;
      const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
      for (const h of hostiles(a)) {
        if (!h.alive || h.team === me.team) continue;
        let s = a.seen.get(h.uid);
        if (!s) {
          s = { vis: false, since: -Infinity, last: -Infinity, at: -Infinity, next: 0 };
          a.seen.set(h.uid, s);
        }
        const dx = h.pos.x - me.pos.x, dz = h.pos.z - me.pos.z;
        const d2 = dx * dx + dz * dz;
        const d = Math.sqrt(d2);
        // Pre-filters, no ray: out of range; behind its back and nothing drew its eye there.
        if (d > Math.min(range, S.range)) {
          s.vis = false;
          continue;
        }
        // 34.0: the ground fog along the line, eye (crouch-aware) to chest: what the player would see.
        if (this.fog) {
          _eye.set(me.pos.x, me.pos.y + 1.55 - 0.55 * me.crouch, me.pos.z);
          _to.set(h.pos.x, h.pos.y + h.chestY, h.pos.z);
          s.clarity = 1 - this.fog(_eye, _to);
          if (s.clarity < ARENA_SEE) {
            s.vis = false;
            this.fogCut++;
            continue;
          }
        }
        const alertT = a.alert.get(h.uid) ?? -Infinity;
        const alerted = now - alertT < S.alertFor;
        const cos = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
        const isTarget = h === a.target;
        const view = a.view;
        // 35.0: a hostile this close is noticed behind it too (footsteps, a shape at the edge of sight).
        const F = ARENA.flankThreat;
        const close = !view && F.on && d2 < F.close * F.close;
        const near = !view && F.on && d2 < F.radius * F.radius;
        if (view ? cos < view.cos : cos < S.behind && !alerted && !isTarget && !close) {
          s.vis = false;
          continue;
        }
        // Due on its timer, or at once when something new drew its eye (a hit, a near miss, a shot).
        if (now < s.next && !(alertT > s.at && !s.vis)) continue;
        const pri = isTarget ? 0 : alerted ? 1 : hot(a, h) || close ? 2 : cos >= S.cone ? 3 : 4;
        const e = this.pool.pop() ?? ({} as Due);
        e.a = a;
        e.h = h;
        e.s = s;
        e.pri = pri;
        e.late = now - s.next;
        e.every = view ? view.every : near ? Math.min(EVERY[pri], F.closeEvery) : EVERY[pri];
        due.push(e);
      }
    }
    if (due.length > 1) due.sort((x, y) => x.pri - y.pri || y.late - x.late);
    let rays = 0;
    for (const e of due) {
      const r = this.check(e.a, e.h, now, this.rays - rays);
      if (r < 0) {
        this.stats.deferred++;
        continue;
      }
      rays += r;
      e.s.at = now;
      e.s.next = now + e.every;
    }
    if (rays > this.stats.maxRays) this.stats.maxRays = rays;
  }

  /** Resolve one pair; returns the rays cast (0 on a cache hit), or -1 when the budget can't pay. */
  private check(a: SenseAgent, h: Combatant, now: number, left: number): number {
    const me = a.self;
    const s = a.seen.get(h.uid)!;
    this.stats.checks++;
    const key = Sensing.key(me.uid, h.uid);
    const lo = me.uid < h.uid ? me : h, hi = lo === me ? h : me;
    const c = this.cache.get(key);
    const S = ARENA.sense;
    let vis: boolean;
    let rays = 0;
    if (c && now - c.t <= S.cacheAge && Math.hypot(c.ax - lo.pos.x, c.az - lo.pos.z) < S.cacheMove && Math.hypot(c.bx - hi.pos.x, c.bz - hi.pos.z) < S.cacheMove) {
      vis = c.vis;
      this.stats.cacheHits++;
    } else {
      if (left < 1) return -1;
      // Eyes (crouch-aware) to the chest; on a miss, to the head if the budget allows.
      _eye.set(me.pos.x, me.pos.y + 1.55 - 0.55 * me.crouch, me.pos.z);
      _to.set(h.pos.x, h.pos.y + h.chestY, h.pos.z);
      vis = this.los(_eye, _to);
      rays = 1;
      if (!vis && left >= 2) {
        _to.set(h.pos.x, h.pos.y + h.headY, h.pos.z);
        vis = this.los(_eye, _to);
        rays = 2;
      }
      if (vis && this.hidden && this.hidden(_eye, _to)) vis = false;
      this.stats.rays += rays;
      const e = c ?? ({} as Pair);
      e.vis = vis;
      e.t = now;
      e.lo = lo.uid;
      e.ax = lo.pos.x;
      e.az = lo.pos.z;
      e.bx = hi.pos.x;
      e.bz = hi.pos.z;
      if (!c) this.cache.set(key, e);
    }
    if (vis) {
      if (!s.vis) {
        s.since = now;
        s.vis = true;
        s.last = now;
        a.onSight(h, now, s.clarity ?? 1);
      }
      s.last = now;
    } else s.vis = false;
    return rays;
  }

  /** Drop pairs of the dead (called on deaths; the map would otherwise grow over a long match). */
  forget(uid: number) {
    for (const [k, p] of this.cache) if (Math.floor(k / 1e7) === uid || k % 1e7 === uid || p.lo === uid) this.cache.delete(k);
  }
}
