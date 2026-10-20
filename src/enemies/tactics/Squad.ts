import * as THREE from 'three';
import { ThinkScheduler, thinkInterval, type Thinker } from './Scheduler';
import { CoverCache, evaluateCover, preScore, type CoverWish, type PeekKind } from './Cover';
import { BarkGate, type BarkKind, type Voice } from './Barks';
import { band } from './Utility';
import type { CollisionWorld } from '../../world/Collision';
import type { Nav } from '../Nav';

/*
  The combat director. One per level run, shared by every survival enemy through EnemyCtx.

  - Knowledge: the squad's last known position of the player (LKP). Only three things write it: an
    enemy's own sighting (a perception ray that hit), a heard gunshot (a noisy position), and the
    wave's dispatch report when it is sent in (noisy). Nothing else ever reads the live player
    position on the squad's behalf: when nobody sees him, everybody works from the LKP.
  - Flow: engage (someone saw him in the last 1.2 s) → hunt (go to the predicted LKP) → search
    (spread over points round the LKP) → idle (roam), back to engage on any sighting.
  - Roles, reassigned every 0.4 s with hysteresis: 1–2 suppressors (gunners with a line on him),
    flankers (the other gunners, balanced left and right of the squad's front), rushers (runners,
    on angular slots round him, held back until an opening, then sent together).
  - Shot tokens: only a few gunners may be aiming or firing at once.
  - Time-slicing: the director owns the ThinkScheduler and starts every enemy's heavy decide.
*/

export type Role = 'suppressor' | 'flanker' | 'rusher' | 'sniper' | 'none';
export type SquadMode = 'idle' | 'engage' | 'hunt' | 'search';

/** Per-enemy tactical state (lives on the enemy; the director reads and assigns parts of it). */
export interface TacState extends Thinker {
  owner: TacAgent;
  role: Role;
  /** Flank side: +1 left, -1 right (as seen by the squad facing the player), 0 none. */
  side: number;
  /** Own perception at the last decide. */
  sees: boolean;
  seenT: number;
  lastDecide: number;
  /** 0.. ; ≥ 1 pins the enemy down. Near misses and hits add, it decays. */
  suppression: number;
  pinnedUntil: number;
  /** After being pinned, a raised threshold for a while (fire must be sustained to pin again). */
  pinResistUntil: number;
  action: string;
  phase: string;
  actionT: number;
  phaseT: number;
  coverId: number;
  coverPos: THREE.Vector3 | null;
  peekPos: THREE.Vector3 | null;
  peekKind: PeekKind | null;
  /** Time the current cover has been seen from the player's position (compromised). */
  exposedT: number;
  /** The spot no longer gives a shot (he moved): find another, without the "blown" alarm. */
  coverStale: boolean;
  coverCheckT: number;
  noCoverUntil: number;
  /** Spots this enemy failed to reach or that betrayed it: skipped until the time stored. */
  badCover: Map<number, number>;
  goal: THREE.Vector3 | null;
  searchIdx: number;
  /** Rusher: angular slot round the player (radians) and staging. */
  slot: number;
  stagePos: THREE.Vector3 | null;
  staged: boolean;
  stagedSince: number;
  go: boolean;
  ammo: number;
  /** Progress watchdog for movement actions. */
  bestD: number;
  progressT: number;
  progressAt: THREE.Vector3;
}

/** What the director needs from an enemy (Runner and Gunner implement it). */
export interface TacAgent {
  readonly kind: 'runner' | 'gunner';
  readonly pos: THREE.Vector3;
  readonly alive: boolean;
  readonly perch: THREE.Vector3 | null;
  readonly look: { voice: Voice };
  tac: TacState;
  decide(ctx: SquadCtx): void;
}

/** The slice of EnemyCtx the director uses (kept narrow so it can be tested). */
export interface SquadCtx {
  time: number;
  col: CollisionWorld;
  nav: Nav;
  coverPoints: THREE.Vector3[];
  bounds: THREE.Box2;
  sightRange?: number;
  difficulty: number;
}

export function createTac(owner: TacAgent): TacState {
  return {
    owner, nextThink: 0, urgent: true, role: 'none', side: 0, sees: false, seenT: -Infinity, lastDecide: 0,
    suppression: 0, pinnedUntil: -Infinity, pinResistUntil: -Infinity,
    action: 'emerge', phase: '', actionT: 0, phaseT: 0,
    coverId: -1, coverPos: null, peekPos: null, peekKind: null, exposedT: 0, coverStale: false, coverCheckT: 0, noCoverUntil: -Infinity, badCover: new Map(),
    goal: null, searchIdx: -1, slot: 0, stagePos: null, staged: false, stagedSince: 0, go: false, ammo: GUNNER_MAG, bestD: Infinity, progressT: 0, progressAt: new THREE.Vector3(),
  };
}

export const GUNNER_MAG = 12;
export const SQUAD = {
  /**
   * Lost him (engage → hunt): no sighting for this long AND someone actually looked (standing,
   * not hunkered behind cover) and saw nothing since. Hiding in cover isn't losing him.
   */
  loseSight: 2,
  /** The failed look must come this long after the last sighting (a flickering sightline isn't a loss). */
  lookAfter: 0.8,
  /** …or nobody has seen him for this long at all, looking or not. */
  loseSightAnyway: 6,
  /** Hunting this long without reaching the LKP: search where they are. */
  huntMax: 14,
  /** Search plan duration before giving up (extended by new evidence). */
  searchTime: 22,
  searchRadius: 16,
  /** Prediction of where he went: LKP + velocity × this (capped). */
  predict: 1.0,
  predictMax: 5,
  rolesEvery: 0.4,
  stageRadius: 11,
  /** A staged rusher that waited this long goes anyway. */
  stageWaitMax: 6,
  rushFor: 7,
  hearClear: 45,
  hearWalled: 26,
  maxShooters: 2,
};

const tmpV = new THREE.Vector3();

export interface SearchPoint {
  pos: THREE.Vector3;
  by: TacAgent | null;
  done: boolean;
}

export class Squad {
  sched = new ThinkScheduler();
  cover = new CoverCache();
  barks = new BarkGate<TacAgent>();
  mode: SquadMode = 'idle';
  modeT = 0;
  /** Squad knowledge of the player (feet). */
  lkp: THREE.Vector3 | null = null;
  lkpT = -Infinity;
  lkpVel = new THREE.Vector3();
  lkpSource: 'sight' | 'sound' | 'report' = 'report';
  seenT = -Infinity;
  /** Last time a member looked (exposed, not hunkered) and did not see him. */
  missT = -Infinity;
  /** Where hunters go: the LKP pushed along his last velocity. */
  huntGoal = new THREE.Vector3();
  /** Unit XZ direction from the player towards the squad's base of fire (the front). */
  front = new THREE.Vector2(0, 1);
  searchPts: SearchPoint[] = [];
  searchUntil = 0;
  rushUntil = -Infinity;
  members: TacAgent[] = [];
  private tokens = new Set<TacAgent>();
  private claims = new Map<number, TacAgent>();
  private rolesT = 0;
  /** Observed player state, set by the game every frame (used only through visibility gates). */
  player = { reloading: false, hp: 1, facing: new THREE.Vector2(0, -1), pressureT: -Infinity, pos: new THREE.Vector3() };
  /** Event log for checks: [time, what, detail]. Bounded. */
  log: [number, string, string][] = [];
  now = 0;
  private col: CollisionWorld | null = null;

  reset() {
    this.mode = 'idle';
    this.modeT = 0;
    this.lkp = null;
    this.lkpT = this.seenT = this.rushUntil = this.missT = -Infinity;
    this.searchPts = [];
    this.members = [];
    this.tokens.clear();
    this.claims.clear();
    this.cover.clear();
    this.barks.reset();
    this.sched.resetStats();
    this.log.length = 0;
    this.player.pressureT = -Infinity;
  }

  private note(what: string, detail = '') {
    this.log.push([+this.now.toFixed(2), what, detail]);
    if (this.log.length > 200) this.log.shift();
  }

  private setMode(m: SquadMode, why: string) {
    if (this.mode === m) return;
    this.note('mode', `${this.mode}>${m} ${why}`);
    this.mode = m;
    this.modeT = this.now;
    if (m !== 'search') this.widened = 0;
    // Everyone re-plans on the next frames (spread by the scheduler's per-frame cap).
    for (const a of this.members) a.tac.urgent = true;
  }

  /** A line of sight query that counts against the frame's ray budget. */
  los = (a: THREE.Vector3, b: THREE.Vector3) => {
    this.sched.spend(1);
    return this.col!.lineOfSight(a, b);
  };

  bark(a: TacAgent, kind: BarkKind) {
    return this.barks.say(a, kind, a.look.voice, this.now);
  }

  // ------------------------------------------------------------------ knowledge
  /** An enemy saw him (its own ray hit): the only way the live position enters the squad. */
  sighting(a: TacAgent, pos: THREE.Vector3, vel: THREE.Vector3) {
    if (!this.lkp) this.lkp = new THREE.Vector3();
    this.lkp.copy(pos);
    this.lkpVel.copy(vel);
    this.lkpT = this.seenT = this.now;
    this.lkpSource = 'sight';
    if (this.mode !== 'engage') {
      this.setMode('engage', 'sighting');
      this.bark(a, 'contact');
    }
  }

  /** A member looked properly (not from behind its cover) and he wasn't there. */
  missedLook() {
    this.missT = this.now;
  }

  /** The wave was sent at a reported position (noisy); only used when the squad knows nothing newer. */
  report(pos: THREE.Vector3, accuracy: number) {
    if (this.lkp && this.now - this.lkpT < 20) return;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * accuracy;
    this.lkp = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
    this.lkpVel.set(0, 0, 0);
    this.lkpT = this.now;
    this.lkpSource = 'report';
    this.note('report', `${pos.x.toFixed(0)},${pos.z.toFixed(0)}±${accuracy}`);
    if (this.mode !== 'engage') this.startHunt('report');
  }

  /** The player fired. Heard by the nearest member if close enough (walls halve the radius). */
  hearShot(at: THREE.Vector3) {
    if (this.mode === 'engage') return;
    let near: TacAgent | null = null;
    let nd = Infinity;
    for (const m of this.members) {
      const d = m.pos.distanceTo(at);
      if (d < nd) {
        nd = d;
        near = m;
      }
    }
    if (!near || nd > SQUAD.hearClear || !this.col) return;
    if (nd > SQUAD.hearWalled && !this.col.lineOfSight(tmpV.set(near.pos.x, near.pos.y + 1.6, near.pos.z), new THREE.Vector3(at.x, at.y + 1.6, at.z))) return;
    const err = 1.5 + 0.08 * nd;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * err;
    this.lkp = new THREE.Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
    this.lkpVel.set(0, 0, 0);
    this.lkpT = this.now;
    this.lkpSource = 'sound';
    this.note('heard', `${nd.toFixed(0)}m ±${err.toFixed(1)}`);
    this.bark(near, 'heard');
    this.startHunt('heard');
  }

  /** A member died: free what it held, the ones nearby flinch and re-plan. */
  died(a: TacAgent) {
    this.tokens.delete(a);
    for (const [k, v] of this.claims) if (v === a) this.claims.delete(k);
    for (const p of this.searchPts) if (p.by === a) p.by = null;
    let near: TacAgent | null = null;
    let nd = 12;
    for (const m of this.members) {
      if (m === a || !m.alive) continue;
      const d = m.pos.distanceTo(a.pos);
      if (d < 10) {
        m.tac.urgent = true;
        m.tac.suppression += 0.35;
      }
      if (d < nd) {
        nd = d;
        near = m;
      }
    }
    if (near) this.bark(near, 'manDown');
  }

  private startHunt(why: string) {
    if (!this.lkp) return;
    const v = tmpV.copy(this.lkpVel).setY(0).multiplyScalar(SQUAD.predict);
    if (v.length() > SQUAD.predictMax) v.setLength(SQUAD.predictMax);
    this.huntGoal.copy(this.lkp).add(v);
    // A prediction into a wall or off a ledge is no goal: fall back to the LKP itself.
    if (this.col && (this.col.blocked(this.huntGoal, 0.35) || Math.abs(this.col.groundHeightAt(this.huntGoal.x, this.huntGoal.z, 0.3, this.huntGoal.y + 0.5) - this.lkp.y) > 0.6)) this.huntGoal.copy(this.lkp);
    this.setMode('hunt', why);
  }

  private startSearch(ctx: SquadCtx, radius = SQUAD.searchRadius, until = this.now + SQUAD.searchTime) {
    if (!this.lkp) return;
    const c = this.lkp;
    const pts: { pos: THREE.Vector3; s: number }[] = [];
    // Nav nodes round the LKP (any level within reach, so stairs and decks get checked) and the
    // cover spots there (corners he could be behind).
    for (const n of ctx.nav.nodes) {
      const d = Math.hypot(n.x - c.x, n.z - c.z);
      if (d > radius || Math.abs(n.y - 1 - c.y) > 10) continue;
      pts.push({ pos: new THREE.Vector3(n.x, n.y - 1, n.z), s: d + Math.abs(n.y - 1 - c.y) * 1.5 + Math.random() * 4 });
    }
    for (const p of ctx.coverPoints) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d <= radius && Math.abs(p.y - c.y) < 10) pts.push({ pos: p.clone(), s: d + Math.random() * 4 });
    }
    pts.sort((a, b) => a.s - b.s);
    this.searchPts = [{ pos: c.clone(), by: null, done: false }, ...pts.slice(0, 11).map((p) => ({ pos: p.pos, by: null, done: false }))];
    this.searchUntil = until;
    for (const m of this.members) m.tac.searchIdx = -1;
    if (this.mode === 'search') {
      this.note('search', `wider ${radius} m, ${this.searchPts.length} pts`);
      return;
    }
    this.setMode('search', `${this.searchPts.length} pts`);
    const speaker = this.members.find((m) => m.alive);
    if (speaker) this.bark(speaker, 'search');
  }

  /** The nearest unvisited point nobody else took (the searcher's own claim first). */
  claimSearch(a: TacAgent): SearchPoint | null {
    const cur = this.searchPts[a.tac.searchIdx];
    if (cur && !cur.done && cur.by === a) return cur;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.searchPts.length; i++) {
      const p = this.searchPts[i];
      if (p.done || (p.by && p.by !== a && p.by.alive)) continue;
      const d = p.pos.distanceTo(a.pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return null;
    this.searchPts[best].by = a;
    a.tac.searchIdx = best;
    return this.searchPts[best];
  }

  /** Searcher reached its point and looked: mark it, and extend the plan when it runs out. */
  searched(a: TacAgent) {
    const p = this.searchPts[a.tac.searchIdx];
    if (p) p.done = true;
    a.tac.searchIdx = -1;
  }

  // ------------------------------------------------------------------ shooting and cover
  /** A rusher started a swing: its bearing round him (checks read the spread of attack angles). */
  attacked(a: TacAgent, at: THREE.Vector3) {
    this.note('attack', Math.atan2(a.pos.z - at.z, a.pos.x - at.x).toFixed(2));
  }

  /** Few guns at once: a gunner must hold a token to aim and fire. Suppressors may exceed by one. */
  requestShot(a: TacAgent, difficulty: number) {
    if (this.tokens.has(a)) return true;
    const max = SQUAD.maxShooters + (difficulty >= 4 ? 1 : 0) + (a.tac.role === 'suppressor' || a.tac.role === 'sniper' ? 1 : 0);
    if (this.tokens.size >= max) return false;
    this.tokens.add(a);
    return true;
  }

  releaseShot(a: TacAgent) {
    this.tokens.delete(a);
  }

  get shooters() {
    return this.tokens.size;
  }

  releaseCover(a: TacAgent) {
    const t = a.tac;
    if (t.coverId >= 0 && this.claims.get(t.coverId) === a) this.claims.delete(t.coverId);
    t.coverId = -1;
    t.coverPos = t.peekPos = null;
    t.peekKind = null;
    t.exposedT = 0;
  }

  /** What each role wants from a spot. */
  wish(a: TacAgent, ctx: SquadCtx): CoverWish {
    const far = Math.min(30, (ctx.sightRange ?? 40) - 1);
    if (a.tac.role === 'suppressor') return { idealMin: Math.min(10, far - 4), idealMax: Math.min(24, far), side: 0 };
    if (a.tac.role === 'flanker') return { idealMin: Math.min(7, far - 4), idealMax: Math.min(18, far), side: a.tac.side };
    return { idealMin: Math.min(8, far - 4), idealMax: Math.min(20, far), side: 0 };
  }

  /**
   * Best cover for this enemy against `threat`: pre-scored without rays, then up to 5 candidates
   * evaluated for real (cached squad-wide). 'deferred' = no ray budget left this frame.
   * `maxTravel` limits the search (a pinned enemy only looks for something close).
   */
  findCover(a: TacAgent, threat: THREE.Vector3, ctx: SquadCtx, opts: { maxTravel?: number; exclude?: number } = {}): { id: number; pos: THREE.Vector3; peek: THREE.Vector3; kind: PeekKind } | null | 'deferred' {
    if (!this.sched.tryCoverSearch(8)) return 'deferred';
    const wish = this.wish(a, ctx);
    const range = Math.min(34, (ctx.sightRange ?? 60) + 1);
    const b = ctx.bounds;
    const cand: { i: number; s: number }[] = [];
    for (let i = 0; i < ctx.coverPoints.length; i++) {
      const c = ctx.coverPoints[i];
      if (i === opts.exclude) continue;
      const owner = this.claims.get(i);
      if (owner && owner !== a && owner.alive) continue;
      if ((a.tac.badCover.get(i) ?? -1) > this.now) continue;
      if (c.x < b.min.x + 1.5 || c.x > b.max.x - 1.5 || c.z < b.min.y + 1.5 || c.z > b.max.y - 1.5) continue;
      const dT = Math.hypot(c.x - threat.x, c.z - threat.z);
      if (dT > range) continue;
      if (opts.maxTravel !== undefined && c.distanceTo(a.pos) > opts.maxTravel) continue;
      let crowd = 0;
      for (const m of this.members) if (m !== a && m.alive && Math.hypot(m.pos.x - c.x, m.pos.z - c.z) < 4) crowd++;
      const s = preScore(c, a.pos, threat, this.front, wish, crowd);
      if (s < Infinity) cand.push({ i, s });
    }
    cand.sort((x, y) => x.s - y.s);
    const free = (p: THREE.Vector3) => !ctx.col.blocked(p, 0.35);
    for (let k = 0; k < Math.min(5, cand.length); k++) {
      const i = cand[k].i;
      const c = ctx.coverPoints[i];
      let ev = this.cover.get(i, threat, this.now);
      if (!ev) {
        if (k > 0 && !this.sched.canAfford(7)) break;
        ev = evaluateCover(c, threat, this.los, free, range);
        this.cover.put(i, threat, this.now, ev);
      }
      if (ev.protected && ev.peek && ev.kind) {
        this.releaseCover(a);
        this.claims.set(i, a);
        return { id: i, pos: c, peek: ev.peek, kind: ev.kind };
      }
    }
    return null;
  }

  /** A point on open ground for a role with no cover: a nav node on the wanted bearing. */
  openPoint(a: TacAgent, threat: THREE.Vector3, ctx: SquadCtx, radius: number, side: number): THREE.Vector3 | null {
    const base = Math.atan2(this.front.y, this.front.x);
    const ang = base + side * (Math.PI / 2);
    const want = new THREE.Vector3(threat.x + Math.cos(ang) * radius, threat.y, threat.z + Math.sin(ang) * radius);
    return nearestNode(ctx, want, threat.y, a.pos);
  }

  // ------------------------------------------------------------------ frame
  /**
   * The director's frame: knowledge and mode, roles, the rush signal, then the time-sliced decides.
   * `agents` are the level's enemies; anything without `tac` (story guards) is ignored.
   */
  update(ctx: SquadCtx, agents: readonly unknown[]) {
    this.now = ctx.time;
    this.col = ctx.col;
    this.members.length = 0;
    for (const e of agents) {
      const a = e as TacAgent;
      if (a.alive && a.tac) this.members.push(a);
    }
    const now = this.now;
    const unseen = now - this.seenT;
    if (this.mode === 'engage' && ((unseen > SQUAD.loseSight && this.missT > this.seenT + SQUAD.lookAfter) || unseen > SQUAD.loseSightAnyway)) {
      this.startHunt('lost');
      const speaker = this.members.find((m) => now - m.tac.seenT < 4) ?? this.members[0];
      if (speaker) this.bark(speaker, 'lost');
    } else if (this.mode === 'hunt' && this.lkp) {
      const arrived = this.members.some((m) => Math.hypot(m.pos.x - this.huntGoal.x, m.pos.z - this.huntGoal.z) < 3 && Math.abs(m.pos.y - this.huntGoal.y) < 1.5);
      if (arrived || now - this.modeT > SQUAD.huntMax) this.startSearch(ctx);
    } else if (this.mode === 'search') {
      if (this.searchPts.every((p) => p.done) && now < this.searchUntil) {
        // Ran out of points: widen once round where they are.
        this.startSearchWider(ctx);
      }
      if (now > this.searchUntil) {
        this.setMode('idle', 'search over');
        const speaker = this.members[0];
        if (speaker) this.bark(speaker, 'giveup');
      }
    }
    if (now >= this.rolesT) {
      this.rolesT = now + SQUAD.rolesEvery;
      this.assignRoles(ctx);
    }
    if (this.mode === 'engage') this.rushSignal();
    else for (const m of this.members) m.tac.go = false;

    const thinkers = this.sched.pick(this.members.map((m) => m.tac), now);
    const engaged = this.mode === 'engage';
    for (const t of thinkers) {
      t.owner.decide(ctx);
      t.lastDecide = now;
      const p = t.owner.pos;
      const d = this.lkp ? Math.hypot(p.x - this.lkp.x, p.z - this.lkp.z) : 99;
      t.nextThink = now + thinkInterval(engaged, d, Math.random());
    }
  }

  private widened = 0;
  /** The plan ran out of points before the time did: one or two wider rings round the LKP. */
  private startSearchWider(ctx: SquadCtx) {
    if (this.widened >= 2 || !this.lkp) {
      this.searchUntil = this.now;
      return;
    }
    this.widened++;
    const before = new Set(this.searchPts.map((p) => `${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`));
    this.startSearch(ctx, SQUAD.searchRadius + 8 * this.widened, this.searchUntil);
    // Don't revisit what was already checked.
    for (const p of this.searchPts) if (before.has(`${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`)) p.done = true;
    if (this.searchPts.every((p) => p.done)) this.searchUntil = this.now;
  }

  /** Roles from who is alive and where (hysteresis: holders keep a role while it still fits). */
  assignRoles(ctx: SquadCtx) {
    const lkp = this.lkp;
    if (!lkp) {
      for (const m of this.members) m.tac.role = m.kind === 'runner' ? 'rusher' : m.perch ? 'sniper' : 'none';
      return;
    }
    const gunners = this.members.filter((m) => m.kind === 'gunner' && !m.perch);
    for (const m of this.members) if (m.perch) m.tac.role = 'sniper';
    const nSupp = gunners.length >= 4 ? 2 : gunners.length >= 1 ? 1 : 0;
    const now = this.now;
    const suppScore = (m: TacAgent) => {
      const d = Math.hypot(m.pos.x - lkp.x, m.pos.z - lkp.z);
      return (now - m.tac.seenT < 2 ? 2 : 0) + band(d, 10, 26, 10) + (m.tac.action === 'fight' ? 0.5 : 0) + (m.tac.role === 'suppressor' ? 1.5 : 0);
    };
    const ranked = gunners.slice().sort((a, b) => suppScore(b) - suppScore(a));
    const supp = ranked.slice(0, nSupp);
    const flank = ranked.slice(nSupp);
    for (const m of supp) {
      if (m.tac.role !== 'suppressor') this.roleChanged(m, 'suppressor', 0);
    }
    // The front: from him towards the base of fire (suppressors; else everyone; else keep).
    const base = supp.length ? supp : this.members;
    if (base.length) {
      let x = 0, z = 0;
      for (const m of base) {
        x += m.pos.x;
        z += m.pos.z;
      }
      x = x / base.length - lkp.x;
      z = z / base.length - lkp.z;
      const l = Math.hypot(x, z);
      if (l > 1) this.front.set(x / l, z / l);
    }
    // Flankers: keep a side; new ones take the side they're on; then balance the two sides.
    const sideOf = (m: TacAgent) => {
      const dx = m.pos.x - lkp.x, dz = m.pos.z - lkp.z;
      return this.front.x * dz - this.front.y * dx;
    };
    for (const m of flank) {
      if (m.tac.role !== 'flanker' || m.tac.side === 0) this.roleChanged(m, 'flanker', sideOf(m) >= 0 ? 1 : -1);
    }
    for (let guard = 0; guard < 4; guard++) {
      const L = flank.filter((m) => m.tac.side > 0), R = flank.filter((m) => m.tac.side < 0);
      if (Math.abs(L.length - R.length) <= 1) break;
      const big = L.length > R.length ? L : R;
      // Move the one nearest the axis (cheapest to send the other way).
      big.sort((a, b) => Math.abs(sideOf(a)) - Math.abs(sideOf(b)));
      this.roleChanged(big[0], 'flanker', -big[0].tac.side);
    }
    // Rushers on angular slots round him: front first, then alternating sides further round.
    const rushers = this.members.filter((m) => m.kind === 'runner');
    const baseAng = Math.atan2(this.front.y, this.front.x);
    const offsets = [0, 1.25, -1.25, 2.4, -2.4, Math.PI];
    const slots = offsets.slice(0, Math.max(1, Math.min(offsets.length, rushers.length))).map((o) => baseAng + o);
    const taken = new Set<number>();
    // Greedy: each rusher (nearest to its best slot first) takes the closest free slot to its bearing.
    const bearing = (m: TacAgent) => Math.atan2(m.pos.z - lkp.z, m.pos.x - lkp.x);
    const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    for (const m of rushers) {
      m.tac.role = 'rusher';
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (taken.has(i % slots.length) && taken.size < slots.length) continue;
        const d = angDiff(bearing(m), slots[i]) + (angDiff(m.tac.slot, slots[i]) < 0.3 ? -0.4 : 0);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        taken.add(best);
        if (angDiff(m.tac.slot, slots[best]) > 0.3) {
          m.tac.slot = slots[best];
          m.tac.stagePos = null;
          m.tac.staged = false;
        }
      }
    }
    void ctx;
  }

  private roleChanged(m: TacAgent, role: Role, side: number) {
    const t = m.tac;
    const changed = t.role !== role || t.side !== side;
    t.role = role;
    t.side = side;
    if (changed && role !== 'rusher') {
      // A different job needs a different spot: look again (keeping the current one until then).
      t.coverCheckT = 0;
      t.urgent = true;
      this.note('role', `${m.kind} ${role}${side ? (side > 0 ? 'L' : 'R') : ''}`);
    }
  }

  /** Is there an opening for the rushers? Each reason is something the squad can actually observe. */
  opening(): string | null {
    const now = this.now;
    const seen = now - this.seenT < 1.0;
    if (now - this.player.pressureT < 1.2) return 'pressure';
    if (seen && this.player.reloading) return 'reload';
    if (seen && this.player.hp < 0.35) return 'hurt';
    if (seen && this.lkp) {
      // He's looking away from where the staged rushers are.
      let x = 0, z = 0, n = 0;
      for (const m of this.members) if (m.tac.staged) {
        x += m.pos.x - this.lkp.x;
        z += m.pos.z - this.lkp.z;
        n++;
      }
      if (n) {
        const l = Math.hypot(x, z) || 1;
        if ((x / l) * this.player.facing.x + (z / l) * this.player.facing.y < -0.3) return 'back turned';
      }
    }
    return null;
  }

  private rushSignal() {
    const now = this.now;
    const rushers = this.members.filter((m) => m.kind === 'runner');
    if (!rushers.length) return;
    if (now < this.rushUntil) return;
    for (const m of rushers) if (m.tac.go) m.tac.go = false;
    const staged = rushers.filter((m) => m.tac.staged);
    if (!staged.length) return;
    const why = this.opening();
    const enough = staged.length >= Math.max(2, Math.ceil(rushers.length * 0.6));
    const waited = staged.some((m) => now - m.tac.stagedSince > SQUAD.stageWaitMax);
    if (!why && !enough && !waited) return;
    this.rushUntil = now + SQUAD.rushFor;
    for (const m of rushers) {
      if (m.tac.staged || (m.tac.stagePos && m.pos.distanceTo(m.tac.stagePos) < 4)) {
        m.tac.go = true;
        m.tac.urgent = true;
      }
    }
    this.note('rush', `${staged.length}/${rushers.length} ${why ?? (enough ? 'massed' : 'waited')}`);
    this.bark(staged[0], 'go');
  }
}

/** Nearest nav node (floor position) to `want` on roughly the level `y`, inside the bounds. */
export function nearestNode(ctx: SquadCtx, want: THREE.Vector3, y: number, from?: THREE.Vector3): THREE.Vector3 | null {
  const b = ctx.bounds;
  let best: THREE.Vector3 | null = null;
  let bd = Infinity;
  for (const n of ctx.nav.nodes) {
    const fy = n.y - 1;
    if (Math.abs(fy - y) > 1.5) continue;
    if (n.x < b.min.x + 1.5 || n.x > b.max.x - 1.5 || n.z < b.min.y + 1.5 || n.z > b.max.y - 1.5) continue;
    const d = Math.hypot(n.x - want.x, n.z - want.z) + (from ? Math.hypot(n.x - from.x, n.z - from.z) * 0.15 : 0);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best ? new THREE.Vector3(best.x, best.y - 1, best.z) : null;
}

/**
 * Suppression from one of his rounds passing an enemy's chest: 0 beyond 1.8 m, 0.25 at the edge up
 * to 0.75 for a round that grazes it. Two or three close rounds within a second or so pin a gunner.
 */
export function nearMissDose(origin: THREE.Vector3, dir: THREE.Vector3, len: number, chest: THREE.Vector3) {
  const t = Math.min(len, Math.max(0, (chest.x - origin.x) * dir.x + (chest.y - origin.y) * dir.y + (chest.z - origin.z) * dir.z));
  const dx = origin.x + dir.x * t - chest.x, dy = origin.y + dir.y * t - chest.y, dz = origin.z + dir.z * t - chest.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return d < 1.8 ? 0.25 + 0.5 * (1 - d / 1.8) : 0;
}
