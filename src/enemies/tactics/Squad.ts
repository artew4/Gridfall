import * as THREE from 'three';
import { ThinkScheduler, thinkInterval, type Thinker } from './Scheduler';
import { CoverCache, evaluateCover, preScore, type CoverWish, type PeekKind } from './Cover';
import { BarkGate, type BarkKind, type Voice } from './Barks';
import { band } from './Utility';
import type { CollisionWorld } from '../../world/Collision';
import type { Nav } from '../Nav';
import type { Combatant, TeamId } from '../../combat/Team';
import { HumanObserver, type HumanStyle } from './Human';

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

  6.0, factions: one director per team. Knowledge is kept per hostile (contacts); the LKP fields are
  the squad's *focus* contact (the hostile seen most recently, kept while it stays in sight), so all
  of the above runs unchanged against whichever hostile the squad is fighting. In Team Deathmatch the
  two directors share one ThinkScheduler (one frame budget for every bot of both teams) and the ALPHA
  director has a member it can't control, the human: it infers his role (Human.ts) and fills the
  others around it. Survival is the one-hostile case and behaves exactly as in 5.0.
*/

export type Role = 'suppressor' | 'flanker' | 'rusher' | 'sniper' | 'none';
export type SquadMode = 'idle' | 'engage' | 'hunt' | 'search';

/** Per-enemy tactical state (lives on the enemy; the director reads and assigns parts of it). */
export interface TacState extends Thinker {
  owner: TacAgent;
  role: Role;
  /** Flank side: +1 left, -1 right (as seen by the squad facing the player), 0 none. */
  side: number;
  /** Own perception at the last decide (of `target`). */
  sees: boolean;
  /** The hostile this member last perceived or is fighting (null: none yet). */
  target: Combatant | null;
  /** TDM: the lane it patrols when there is no contact (-1: unassigned), its waypoint and direction. */
  lane: number;
  laneIdx: number;
  laneDir: number;
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
  /** Consecutive cover checks that found no peek (stale after two). */
  noPeekChecks: number;
  coverCheckT: number;
  noCoverUntil: number;
  /** Spots this enemy failed to reach or that betrayed it: skipped until the time stored. */
  badCover: Map<number, number>;
  goal: THREE.Vector3 | null;
  /** Next re-plan of an open-ground advance goal while blind. */
  advanceT: number;
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
  /** Second watchdog (6.0): nearest it got to the goal, and how long since it got 0.5 m nearer. */
  goalBest: number;
  goalT: number;
}

/** What the director needs from an enemy (Runner and Gunner implement it). */
export interface TacAgent {
  readonly kind: 'runner' | 'gunner';
  readonly team: TeamId;
  readonly name: string;
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
  /** Soft concealment along a sightline (1 clear … 0 hidden), if the level has any. */
  concealment?: (a: THREE.Vector3, b: THREE.Vector3) => number;
  difficulty: number;
  /** TDM: places this squad must not plan to go (the other team's spawn). */
  avoid?: (p: THREE.Vector3) => boolean;
  /** TDM: the lanes from this team's base to the other's (waypoints, floor height). */
  lanes?: THREE.Vector3[][];
}

/** A peek must see through soft cover too (the same 0.35 the perception uses). */
export const peekSight = (ctx: SquadCtx) => (ctx.concealment ? (a: THREE.Vector3, b: THREE.Vector3) => ctx.concealment!(a, b) >= 0.35 : undefined);

export function createTac(owner: TacAgent): TacState {
  return {
    owner, nextThink: 0, urgent: true, role: 'none', side: 0, sees: false, target: null, lane: -1, laneIdx: -1, laneDir: 1, seenT: -Infinity, lastDecide: 0,
    suppression: 0, pinnedUntil: -Infinity, pinResistUntil: -Infinity,
    action: 'emerge', phase: '', actionT: 0, phaseT: 0,
    coverId: -1, coverPos: null, peekPos: null, peekKind: null, exposedT: 0, coverStale: false, noPeekChecks: 0, coverCheckT: 0, noCoverUntil: -Infinity, badCover: new Map(),
    goal: null, advanceT: 0, searchIdx: -1, slot: 0, stagePos: null, staged: false, stagedSince: 0, go: false, ammo: GUNNER_MAG, bestD: Infinity, progressT: 0, progressAt: new THREE.Vector3(), goalBest: Infinity, goalT: 0,
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

/** What the squad knows about one hostile. `who` null: an unidentified report (merged on sight). */
export interface Contact {
  who: Combatant | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Last news of any kind. */
  t: number;
  /** Last time a member actually saw it. */
  seenT: number;
  source: 'sight' | 'sound' | 'report';
}

export interface SearchPoint {
  pos: THREE.Vector3;
  by: TacAgent | null;
  done: boolean;
}

export class Squad {
  sched: ThinkScheduler;
  cover = new CoverCache();
  barks = new BarkGate<TacAgent>();
  /** Whose director this is (survival enemies are OMEGA). */
  readonly team: TeamId;
  mode: SquadMode = 'idle';
  modeT = 0;
  /** Squad knowledge of the focus hostile (feet): mirrors `focus`. */
  lkp: THREE.Vector3 | null = null;
  lkpT = -Infinity;
  lkpVel = new THREE.Vector3();
  lkpSource: 'sight' | 'sound' | 'report' = 'report';
  /** Last time any member saw any hostile. */
  seenT = -Infinity;
  /** Last time a member looked (exposed, not hunkered) and did not see him. */
  missT = -Infinity;
  /** Every hostile the squad knows about, and the one it fights (the LKP fields mirror it). */
  contacts = new Map<Combatant | null, Contact>();
  focus: Contact | null = null;
  /** Where hunters go: the LKP pushed along his last velocity. */
  huntGoal = new THREE.Vector3();
  /** Unit XZ direction from the player towards the squad's base of fire (the front). */
  front = new THREE.Vector2(0, 1);
  searchPts: SearchPoint[] = [];
  searchUntil = 0;
  rushUntil = -Infinity;
  members: TacAgent[] = [];
  /**
   * TDM, ALPHA: the human in the squad. The director can't order him, it reads him (Human.ts) and
   * assigns the bots round what he is doing. Null in survival and for OMEGA.
   */
  human: Combatant | null = null;
  humanObs = new HumanObserver();
  /** The style last inferred for the human (debug, the report). */
  humanStyle: HumanStyle = 'down';
  private tokens = new Set<TacAgent>();
  private claims = new Map<number, TacAgent>();
  private rolesT = 0;
  /** Observed player state, set by the game every frame (used only through visibility gates). */
  player = { reloading: false, hp: 1, facing: new THREE.Vector2(0, -1), pressureT: -Infinity, pos: new THREE.Vector3() };
  /** Event log for checks: [time, what, detail]. Bounded. */
  log: [number, string, string][] = [];
  now = 0;
  private col: CollisionWorld | null = null;
  private _f = new THREE.Vector2();

  /** `sched`: pass one scheduler to several directors to give all their members one frame budget. */
  constructor(opts: { team?: TeamId; sched?: ThinkScheduler } = {}) {
    this.team = opts.team ?? 'omega';
    this.sched = opts.sched ?? new ThinkScheduler();
  }

  reset() {
    this.mode = 'idle';
    this.modeT = 0;
    this.lkp = null;
    this.lkpT = this.seenT = this.rushUntil = this.missT = -Infinity;
    this.contacts.clear();
    this.focus = null;
    this.searchPts = [];
    this.members = [];
    this.tokens.clear();
    this.claims.clear();
    this.cover.clear();
    this.barks.reset();
    this.sched.resetStats();
    this.log.length = 0;
    this.player.pressureT = -Infinity;
    this.humanObs.reset();
    this.humanStyle = 'down';
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
  /**
   * The contact for a hostile. `null` means "the one we're on" (survival's single hostile, a report
   * that doesn't say who): the focus if there is one. A first sighting of a named hostile adopts an
   * anonymous report rather than keeping two contacts for one person.
   */
  private contactFor(who: Combatant | null): Contact {
    if (!who) {
      const c = this.focus ?? this.contacts.get(null);
      if (c) return c;
    } else {
      const c = this.contacts.get(who);
      if (c) return c;
      const anon = this.contacts.get(null);
      if (anon) {
        this.contacts.delete(null);
        anon.who = who;
        this.contacts.set(who, anon);
        return anon;
      }
    }
    const c: Contact = { who, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: -Infinity, seenT: -Infinity, source: 'report' };
    this.contacts.set(who, c);
    return c;
  }

  /** Make `c` the focus: the LKP fields now describe it. */
  private setFocus(c: Contact | null, why = '') {
    if (c !== this.focus && c) this.note('focus', `${c.who?.name ?? '?'} ${why}`);
    this.focus = c;
    this.syncFocus();
  }

  private syncFocus() {
    const c = this.focus;
    if (!c) {
      this.lkp = null;
      this.lkpT = -Infinity;
      return;
    }
    if (!this.lkp) this.lkp = new THREE.Vector3();
    this.lkp.copy(c.pos);
    this.lkpVel.copy(c.vel);
    this.lkpT = c.t;
    this.lkpSource = c.source;
  }

  /**
   * A member saw a hostile (its own ray hit): the only way a live position enters the squad. The
   * focus moves to it when the current focus hasn't been seen for a moment (or there is none).
   */
  sighting(a: TacAgent | null, pos: THREE.Vector3, vel: THREE.Vector3, who: Combatant | null = null) {
    const c = this.contactFor(who);
    c.pos.copy(pos);
    c.vel.copy(vel);
    c.t = c.seenT = this.now;
    c.source = 'sight';
    this.seenT = this.now;
    if (!this.focus || this.focus === c || this.now - this.focus.seenT > 1.2) this.setFocus(c, 'sighted');
    if (this.mode !== 'engage') {
      this.setMode('engage', 'sighting');
      if (a) this.bark(a, 'contact');
    }
  }

  /** A member looked properly (not from behind its cover) and he wasn't there. */
  missedLook() {
    this.missT = this.now;
  }

  /** The wave was sent at a reported position (noisy); only used when the squad knows nothing newer. */
  report(pos: THREE.Vector3, accuracy: number, who: Combatant | null = null) {
    if (this.lkp && this.now - this.lkpT < 20) return;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * accuracy;
    const c = this.contactFor(who);
    c.pos.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
    c.vel.set(0, 0, 0);
    c.t = this.now;
    c.source = 'report';
    this.setFocus(c, 'report');
    this.note('report', `${pos.x.toFixed(0)},${pos.z.toFixed(0)}±${accuracy}`);
    if (this.mode !== 'engage') this.startHunt('report');
  }

  /**
   * A hostile fired. Heard by the nearest member if close enough (walls halve the radius). In a fight
   * a shot from someone else only updates what the squad knows about the shooter.
   */
  hearShot(at: THREE.Vector3, who: Combatant | null = null) {
    const engaged = this.mode === 'engage';
    if (engaged && (!who || who === this.focus?.who)) return;
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
    const c = this.contactFor(who);
    // A sound is never better than a sighting from a moment ago.
    if (this.now - c.seenT < 1.5) return;
    c.pos.set(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
    c.vel.set(0, 0, 0);
    c.t = this.now;
    c.source = 'sound';
    if (engaged) return;
    this.setFocus(c, 'heard');
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

  /**
   * A hostile died (TDM): forget it; fight the next one the squad knows about, else stand down to the
   * lanes (they saw it fall: there is nothing to hunt).
   */
  hostileDied(who: Combatant, by: TacAgent | null) {
    const c = this.contacts.get(who);
    if (!c) return;
    this.contacts.delete(who);
    for (const m of this.members) if (m.tac.target === who) {
      m.tac.target = null;
      m.tac.sees = false;
      m.tac.urgent = true;
    }
    if (by) this.bark(by, 'kill');
    if (this.focus !== c) return;
    let next: Contact | null = null;
    for (const k of this.contacts.values()) if (!next || k.t > next.t) next = k;
    this.setFocus(next, 'target down');
    if (!next) {
      this.setMode('idle', 'target down');
      for (const m of this.members) m.tac.goal = null;
    }
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
    // Only places one can actually walk to from where he was (a shuttered station is not a lead).
    let near = -1;
    let nd = Infinity;
    for (let i = 0; i < ctx.nav.nodes.length; i++) {
      const n = ctx.nav.nodes[i];
      const d = Math.hypot(n.x - c.x, n.z - c.z) + Math.abs(n.y - 1 - c.y) * 4;
      if (d < nd) {
        nd = d;
        near = i;
      }
    }
    const reach = near >= 0 ? ctx.nav.reachable(near) : null;
    const reachable = (p: THREE.Vector3) => {
      if (!reach) return true;
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < ctx.nav.nodes.length; i++) {
        const n = ctx.nav.nodes[i];
        const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - 1 - p.y) * 4;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return reach.has(best);
    };
    // Nav nodes round the LKP (any level within reach, so stairs and decks get checked) and the
    // cover spots there (corners he could be behind); never inside the other team's spawn.
    ctx.nav.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - c.x, n.z - c.z);
      if (d > radius || Math.abs(n.y - 1 - c.y) > 10 || (reach && !reach.has(i))) return;
      const p = new THREE.Vector3(n.x, n.y - 1, n.z);
      if (ctx.avoid?.(p)) return;
      pts.push({ pos: p, s: d + Math.abs(n.y - 1 - c.y) * 1.5 + Math.random() * 4 });
    });
    for (const p of ctx.coverPoints) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d <= radius && Math.abs(p.y - c.y) < 10 && !ctx.avoid?.(p) && reachable(p)) pts.push({ pos: p.clone(), s: d + Math.random() * 4 });
    }
    pts.sort((a, b) => a.s - b.s);
    const first = ctx.avoid?.(c) ? [] : [{ pos: c.clone(), by: null, done: false }];
    this.searchPts = [...first, ...pts.slice(0, 12 - first.length).map((p) => ({ pos: p.pos, by: null, done: false }))];
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

  /** Few guns at once: a ground gunner must hold a token to aim and fire. Suppressors may exceed by one. */
  requestShot(a: TacAgent, difficulty: number) {
    // Snipers are limited by the perches, not by the ground team's tokens.
    if (a.tac.role === 'sniper') return true;
    if (this.tokens.has(a)) return true;
    const max = SQUAD.maxShooters + (difficulty >= 4 ? 1 : 0) + (a.tac.role === 'suppressor' ? 1 : 0);
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
    // Flankers keep up with a human who is pushing (closer ideal band).
    const push = this.human && this.humanStyle === 'pushing' ? 4 : 0;
    if (a.tac.role === 'flanker') return { idealMin: Math.min(7, far - 4), idealMax: Math.min(18 - push, far), side: a.tac.side };
    return { idealMin: Math.min(8, far - 4), idealMax: Math.min(20, far), side: 0 };
  }

  /**
   * Best cover for this enemy against `threat`: pre-scored without rays, then up to 5 candidates
   * evaluated for real (cached squad-wide). 'deferred' = no ray budget left this frame.
   * `maxTravel` limits the search (a pinned enemy only looks for something close). `tag` names the
   * threat for the verdict cache (several hostiles at once: one verdict per spot per hostile).
   */
  findCover(a: TacAgent, threat: THREE.Vector3, ctx: SquadCtx, opts: { maxTravel?: number; exclude?: number; tag?: number } = {}): { id: number; pos: THREE.Vector3; peek: THREE.Vector3; kind: PeekKind } | null | 'deferred' {
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
      if (ctx.avoid?.(c)) continue;
      let crowd = 0;
      for (const m of this.members) if (m !== a && m.alive && Math.hypot(m.pos.x - c.x, m.pos.z - c.z) < 4) crowd++;
      const s = preScore(c, a.pos, threat, this.front, wish, crowd);
      if (s < Infinity) cand.push({ i, s });
    }
    cand.sort((x, y) => x.s - y.s);
    const free = (p: THREE.Vector3) => !ctx.col.blocked(p, 0.35);
    const key = (i: number) => coverKey(i, opts.tag);
    for (let k = 0; k < Math.min(5, cand.length); k++) {
      const i = cand[k].i;
      const c = ctx.coverPoints[i];
      let ev = this.cover.get(key(i), threat, this.now);
      if (!ev) {
        if (k > 0 && !this.sched.canAfford(7)) break;
        ev = evaluateCover(c, threat, this.los, free, range, peekSight(ctx));
        this.cover.put(key(i), threat, this.now, ev);
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
    this.prepare(ctx, agents);
    this.run(this.sched.pick(this.members.map((m) => m.tac), this.now), ctx);
  }

  /**
   * Several directors, one budget (TDM): each prepares its own frame, then one pick across all their
   * members — most overdue first, whichever team they're on — and each decide runs with its own
   * team's context. Fair under load: neither team's bots can starve the other's.
   */
  static updateAll(sched: ThinkScheduler, teams: readonly { squad: Squad; ctx: SquadCtx; agents: readonly unknown[] }[]) {
    const all: TacState[] = [];
    const ctxOf = new Map<TacState, { squad: Squad; ctx: SquadCtx }>();
    for (const t of teams) {
      t.squad.prepare(t.ctx, t.agents);
      for (const m of t.squad.members) {
        all.push(m.tac);
        ctxOf.set(m.tac, t);
      }
    }
    if (!teams.length) return;
    const picked = sched.pick(all, teams[0].ctx.time);
    for (const t of picked) {
      const o = ctxOf.get(t)!;
      o.squad.run([t], o.ctx);
    }
  }

  /** Knowledge, mode, roles and the rush signal for this frame (no decides). */
  prepare(ctx: SquadCtx, agents: readonly unknown[]) {
    this.now = ctx.time;
    this.col = ctx.col;
    this.members.length = 0;
    for (const e of agents) {
      const a = e as TacAgent;
      if (a.alive && a.tac) this.members.push(a);
    }
    const now = this.now;
    this.updateContacts();
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
    if (this.human) this.humanObs.sample(now, this.human.pos);
    if (now >= this.rolesT) {
      this.rolesT = now + SQUAD.rolesEvery;
      this.assignRoles(ctx);
      if (ctx.lanes) this.assignLanes(ctx.lanes);
    }
    if (this.mode === 'engage') this.rushSignal();
    else for (const m of this.members) m.tac.go = false;
  }

  /** Run these members' heavy decides now and schedule their next. */
  run(thinkers: readonly TacState[], ctx: SquadCtx) {
    const now = this.now;
    const engaged = this.mode === 'engage';
    for (const t of thinkers) {
      t.owner.decide(ctx);
      t.lastDecide = now;
      const p = t.owner.pos;
      const d = this.lkp ? Math.hypot(p.x - this.lkp.x, p.z - this.lkp.z) : 99;
      t.nextThink = now + thinkInterval(engaged, d, Math.random());
    }
  }

  /**
   * Contacts age out; a dead hostile is dropped; the focus moves to a hostile seen more recently when
   * the current one hasn't been seen for a moment (several hostiles: fight the one in sight).
   */
  private updateContacts() {
    if (this.contacts.size === 0) return;
    const now = this.now;
    for (const [k, c] of this.contacts) if ((c.who && !c.who.alive) || now - c.t > 40) {
      this.contacts.delete(k);
      if (this.focus === c) this.focus = null;
    }
    let best: Contact | null = null;
    for (const c of this.contacts.values()) if (!best || c.seenT > best.seenT) best = c;
    const f = this.focus;
    if (!f) {
      if (best) this.setFocus(best, 'refocus');
      else if (this.lkp) this.syncFocus();
    } else if (best && best !== f && now - f.seenT > 1.2 && best.seenT > f.seenT) this.setFocus(best, 'in sight');
    else this.syncFocus();
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
    // The human's part, inferred from what he is doing (TDM, ALPHA only).
    const h = this.human;
    let style: HumanStyle = 'down';
    if (h) {
      const prev = this.humanStyle;
      style = this.humanStyle = this.humanObs.classify(this.now, h.alive, h.hpFrac, h.pos, lkp, this.front);
      if (style !== prev) this.onHumanStyle(style, prev);
    }
    if (!lkp) {
      for (const m of this.members) m.tac.role = m.kind === 'runner' ? 'rusher' : m.perch ? 'sniper' : 'none';
      return;
    }
    const gunners = this.members.filter((m) => m.kind === 'gunner' && !m.perch);
    for (const m of this.members) if (m.perch) m.tac.role = 'sniper';
    let nSupp = gunners.length >= 4 ? 2 : gunners.length >= 1 ? 1 : 0;
    // He lays down the fire: the bots go round. He pushes or falls back: one more gun covers him.
    if (style === 'suppressing') nSupp = Math.max(0, nSupp - 1);
    else if (style === 'pushing' || style === 'retreating') nSupp = Math.min(gunners.length, nSupp + 1);
    const now = this.now;
    const hp = h && h.alive && (style === 'pushing' || style === 'retreating') ? h.pos : null;
    const suppScore = (m: TacAgent) => {
      const d = Math.hypot(m.pos.x - lkp.x, m.pos.z - lkp.z);
      // Covering him: the gunners near him have the angle on what he's facing.
      const near = hp ? band(Math.hypot(m.pos.x - hp.x, m.pos.z - hp.z), 0, 12, 12) * 1.5 : 0;
      return (now - m.tac.seenT < 2 ? 2 : 0) + band(d, 10, 26, 10) + (m.tac.action === 'fight' ? 0.5 : 0) + (m.tac.role === 'suppressor' ? 1.5 : 0) + near;
    };
    const ranked = gunners.slice().sort((a, b) => suppScore(b) - suppScore(a));
    const supp = ranked.slice(0, nSupp);
    const flank = ranked.slice(nSupp);
    for (const m of supp) {
      if (m.tac.role !== 'suppressor') this.roleChanged(m, 'suppressor', 0);
    }
    // The front: from him towards the base of fire (suppressors, and the human when he is the one
    // firing from cover; else everyone; else keep).
    const base: THREE.Vector3[] = (supp.length ? supp : this.members).map((m) => m.pos);
    if (h && h.alive && (style === 'suppressing' || style === 'holding')) base.push(h.pos);
    if (base.length) {
      let x = 0, z = 0;
      for (const p of base) {
        x += p.x;
        z += p.z;
      }
      x = x / base.length - lkp.x;
      z = z / base.length - lkp.z;
      const l = Math.hypot(x, z);
      if (l > 1) this.front.set(x / l, z / l);
    }
    // Flankers: keep a side; new ones take the side they're on; then balance the two sides (a
    // flanking human counts on his side, so the bots take the other).
    const sideOf = (m: TacAgent) => {
      const dx = m.pos.x - lkp.x, dz = m.pos.z - lkp.z;
      return this.front.x * dz - this.front.y * dx;
    };
    for (const m of flank) {
      if (m.tac.role !== 'flanker' || m.tac.side === 0) this.roleChanged(m, 'flanker', sideOf(m) >= 0 ? 1 : -1);
    }
    const hl = style === 'flanking' && this.humanObs.side > 0 ? 1 : 0;
    const hr = style === 'flanking' && this.humanObs.side < 0 ? 1 : 0;
    for (let guard = 0; guard < 4; guard++) {
      const L = flank.filter((m) => m.tac.side > 0), R = flank.filter((m) => m.tac.side < 0);
      const nl = L.length + hl, nr = R.length + hr;
      if (Math.abs(nl - nr) <= 1) break;
      const big = nl > nr ? L : R;
      if (!big.length) break;
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

  /** The human changed what he is doing: a bot says how it fits in (the legibility of the adaptation). */
  private onHumanStyle(style: HumanStyle, prev: HumanStyle) {
    this.note('human', `${prev}>${style}`);
    if (!this.lkp || this.mode !== 'engage') return;
    const h = this.human!;
    let near: TacAgent | null = null;
    let nd = 30;
    for (const m of this.members) {
      const d = m.pos.distanceTo(h.pos);
      if (d < nd && m.kind === 'gunner') {
        nd = d;
        near = m;
      }
    }
    if (!near) return;
    if (style === 'pushing') this.bark(near, 'withYou');
    else if (style === 'retreating') this.bark(near, 'coverYou');
    else if (style === 'suppressing') this.bark(near, 'flankWhile');
    else if (style === 'flanking') this.bark(near, this.humanObs.side > 0 ? 'otherFlankR' : 'otherFlankL');
  }

  /**
   * TDM lanes: every member patrols one (left, centre, right) while there is no contact. A member
   * without one (a fresh respawn) takes the lane furthest below its share; the human counts on the
   * lane he is nearest, so the bots spread round wherever he went.
   */
  assignLanes(lanes: THREE.Vector3[][]) {
    const share = lanes.length === 3 ? [0.3, 0.4, 0.3] : lanes.map(() => 1 / lanes.length);
    const count = lanes.map(() => 0);
    const h = this.human;
    if (h && h.alive) count[nearestLane(lanes, h.pos)]++;
    for (const m of this.members) if (m.tac.lane >= 0) count[m.tac.lane]++;
    const total = this.members.length + (h && h.alive ? 1 : 0);
    for (const m of this.members) {
      if (m.tac.lane >= 0) continue;
      let best = 0, bd = Infinity;
      for (let i = 0; i < lanes.length; i++) {
        const d = count[i] - share[i] * total;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      m.tac.lane = best;
      m.tac.laneIdx = -1;
      m.tac.laneDir = 1;
      count[best]++;
      this.note('lane', `${m.name} ${best}`);
    }
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

  /** What the squad can observe about the hostile it fights (its own sighting gates every use). */
  private observed() {
    const w = this.focus?.who;
    if (!w) return this.player;
    return { reloading: w.reloading, hp: w.hpFrac, facing: w.facing(this._f), pressureT: w.pressureT };
  }

  /** Is there an opening for the rushers? Each reason is something the squad can actually observe. */
  opening(): string | null {
    const now = this.now;
    const seen = now - this.seenT < 1.0;
    const o = this.observed();
    if (now - o.pressureT < 1.2) return 'pressure';
    if (seen && o.reloading) return 'reload';
    if (seen && o.hp < 0.35) return 'hurt';
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
        if ((x / l) * o.facing.x + (z / l) * o.facing.y < -0.3) return 'back turned';
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

/** Cache key of a cover verdict: the spot, and which hostile it was judged against (if several). */
export const coverKey = (spot: number, tag?: number) => spot * 32 + (tag === undefined ? 0 : 1 + (tag % 31));

/** Index of the lane whose polyline passes nearest `p`. */
export function nearestLane(lanes: THREE.Vector3[][], p: THREE.Vector3) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const L = lanes[i];
    for (let k = 0; k + 1 < L.length; k++) {
      const a = L[k], b = L[k + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / Math.max(1e-6, abx * abx + abz * abz)));
      const d = Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return best;
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
