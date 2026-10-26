import * as THREE from 'three';
import type { Combatant, TeamId } from '../../combat/Team';
import { ARENA } from './ArenaCtx';
import type { HighGround } from '../../levels/Level';
import { pickRole, type ArenaRole } from './Roles';
import type { Fronts } from './Fronts';
import type { Objective, Objectives } from './Objectives';

/**
 * 37.1: seconds a posted bot has to reach its post, plus a second for every 2 m it starts from it
 * (unopposed, Old Port's bridge took 9–24 s from the quays and the dock floor: stairs, the deck, stairs).
 */
const WATCH_TRAVEL = 20;

/** 37.1: a bot posted to the high ground (38.0: one of the team's watches). */
interface Watch {
  uid: number;
  post: number;
  until: number;
  arrived: boolean;
  lastAt?: [number, number, number];
}

/*
  The arena director (7.0), one per team. It replaces the 5.0 squad director in Team Deathmatch and
  doesn't hand out roles: the bots pick their own fights. It shapes map control instead.

   - Contact board: every hostile anyone on the team saw, heard firing or was told about (the human's
     callouts), for 4 s. The team's radar: a bot without a fight runs at the freshest contact.
   - Front: progress along the base-to-base axis (-1 our spawn … +1 theirs). Ours is the median of
     the living bots; theirs the contact nearest our spawn.
   - Momentum (-1 … +1) from who is alive, the tickets and the trades of the last 12 s, and from it a
     stance: PUSH takes the fight to their front, HOLD rolls forward a step ahead of ours, REGROUP
     gathers on our front (never back in the spawn yard). A respawn wave walks forward in any stance.
   - Lanes: left, centre, right kept occupied (the human counts on the lane he is in; he is read,
     never commanded: ADR-0028).
   - Push claims: at most two bots rush one wounded hostile.
   - 12.0, shared spotting: whatever anyone on the team (bots and the human alike) has in line of
     sight right now is "spotted": on everyone's minimap, fading out over ARENA.spot.fade s after the
     last sighting, with who saw it from where (a bot out of sight uses that to flank).
   - 12.0, flank claims: at most ARENA.flank.per bots go round one spotted hostile, on alternate sides.
   - 27.0, patrol (a map with spawn pads: no bases, so no front to walk to): a bot with nothing on the
     board searches the map's high-value areas (the pads and the lanes' waypoints). Each area keeps its
     activity (deaths, heard gunfire and heard spawns near it, halving every patrol.halfLife s) and
     when the team last had someone there; a bot claims the best area for it:
        score = heat · min(heatCap, activity) + stale · min(1, unseen / staleT) + lane · [in its own lane]
                − dist / distM − claim · claimants + U(0, jitter)
     so the team spreads over the map, goes where the noise is (capped: one hot spot doesn't take
     everyone), keeps to the lane the director balanced it into (the map's lane weights still hold),
     and looks again where nobody has been.

  Pure (no scene, no clock): the arena tests drive it.
*/

export type Stance = 'push' | 'hold' | 'regroup';

export interface ArenaContact {
  who: Combatant;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Last news; last sighting; last time it was heard firing. */
  t: number;
  seenT: number;
  firedT: number;
  src: 'sight' | 'gunfire' | 'callout';
  /** 12.0: the last sighting's spotter (uid, and where it stood), for flanks. -1: nobody (heard). */
  by: number;
  from: THREE.Vector3;
}

/** 12.0: a spotted hostile on the team's minimap: where it was last seen and how long ago (s). */
export interface Spot {
  who: Combatant;
  pos: THREE.Vector3;
  age: number;
}

/** What the director reads of a member (a bot, or the human). */
export interface ArenaMember {
  readonly uid: number;
  readonly pos: THREE.Vector3;
  readonly alive: boolean;
  readonly isPlayer: boolean;
}

/** How far gunfire carries (m) — the 5.0 open-air hearing distance. */
const HEAR = 45;

export class ArenaDirector {
  contacts = new Map<number, ArenaContact>();
  momentum = 0;
  stance: Stance = 'hold';
  /** Progress of our front and theirs (see the header). */
  ownFront = -0.8;
  enemyFront = ARENA.director.unknownFront;
  /** Waypoint index each lane is advancing to (lanes run from our spawn to theirs). */
  laneTarget: number[] = [];
  /** Bot uid → lane. */
  laneOf = new Map<number, number>();
  /** 15.0: how contested each lane is (deaths and gunfire there, decaying), and when it was decayed. */
  heat: number[] = [];
  private heatT = 0;
  private moveT = -Infinity;
  /** 15.0 (DEV): bots moved off a hot lane. */
  laneMoves = 0;
  private trades: [number, number][] = [];
  /** 65.0: when the match went live (its clock: the openings, the stats). */
  startT = 0;
  private pushes = new Map<number, { bots: number[]; until: number }>();
  private flanks = new Map<number, { bots: number[]; sides: number[]; until: number }>();
  private nextT = 0;
  private axis = new THREE.Vector2(0, -1);
  private mid = new THREE.Vector2();
  private half = 64;
  private laneProg: number[][] = [];
  /**
   * 29.0: the team's last stand (its tickets are gone; Tdm sets it each frame), the centre of its
   * living members (the bots gather on it), and the cover spots claimed round it (bot uid → spot key).
   */
  lastStand = false;
  /** 29.0: the team's sudden-death clock (s left), or null: on the clock it must attack, not hold. */
  sudden: number | null = null;
  anchor = new THREE.Vector3();
  anchorN = 0;
  private holds = new Map<number, string>();
  /** 27.0: patrol mode (TdmData.pads): the high-value areas, their activity, last visit and claims. */
  patrol = false;
  hvas: THREE.Vector3[] = [];
  private hvaHeat: number[] = [];
  private hvaSeen: number[] = [];
  private hvaClaim = new Map<number, number>();
  private hvaT = 0;
  /** 32.0, spread: the members as last updated (patrol crowding), and the bots after each contact in order. */
  private mates: readonly ArenaMember[] = [];
  private hunters = new Map<number, Map<number, number>>();
  /** 27.0 (DEV): patrol picks, and how many went to an area with activity. 38.0: and to a flank. */
  patrolStats = { picks: 0, active: 0, spawnsHeard: 0, flank: 0 };
  /** 38.0: the map's flanks (TdmData.flankOf), which areas lie on them, the centre's heat (ARENA.flankPull). */
  private flankOf: ((x: number, y: number, z: number) => number) | null = null;
  private hvaFlank: number[] = [];
  centreHeat = 0;
  private centreT = 0;
  /**
   * 38.0: a team is on its last stand (Tdm): the flanks' pull is off. With it on, the endgame's patrols
   * went on out to the flanks instead of hunting the last few: 52 → 90–110 s, most to sudden death.
   */
  endgame = false;
  /** Event log for checks: [time, what, detail]. Bounded. */
  log: [number, string, string][] = [];
  /**
   * 44.0, the fronts (Fronts.ts, shared by both teams; null: off): each of this team's lanes advances to
   * its sector's line, past it or short of it by the team's stance there; new bots go to the neediest
   * sector; a pushing sector lends a body to one falling back now and then (a rotation).
   */
  fronts: Fronts | null = null;
  /** 44.0: each lane's sector (Tdm sets it with the fronts). */
  laneSector: number[] = [];
  /** 44.0: the sector a bot about to spawn was dealt (its uid once it has one), and when the last rotation went. */
  private dealt = new Map<number, number>();
  private rotateT = -Infinity;
  /** 44.0 (DEV): rotations (a bot sent from a pushing sector to one falling back). */
  rotations = 0;

  /** 51.0: the flank objectives (Tdm sets them with the fronts; null: none). */
  objectives: Objectives | null = null;

  /**
   * 51.0: the point a frontliner of sector `k` should go to now: one its team doesn't hold (to take),
   * or its own being taken (to hold); null: its own and quiet (the lane and its line as before).
   */
  objectiveFor(k: number): Objective | null {
    const o = this.objectives?.of(k);
    if (!o) return null;
    if (o.owner !== this.team) return o;
    return o.capturing && o.capturing !== this.team ? o : null;
  }

  /** 44.0: the fronts on, with each lane's sector. */
  setFronts(fronts: Fronts | null, laneSector: number[] = []) {
    this.fronts = fronts;
    this.laneSector = laneSector;
    this.dealt.clear();
    this.rotateT = -Infinity;
    this.rotations = 0;
  }

  /** 44.0: the sector of lane `l` (the fronts' sectors; the lane itself without them). */
  sectorOfLane(l: number) {
    return this.laneSector[l] ?? l;
  }

  /** 44.0: bot `uid` (just spawned) goes to sector `k`: the lane of it with fewest of the team, by weight. */
  dealSector(uid: number, k: number) {
    this.dealt.set(uid, k);
    const lanes = this.lanes.map((_, l) => l).filter((l) => this.sectorOfLane(l) === k);
    if (!lanes.length) return;
    const count = new Array(this.lanes.length).fill(0);
    for (const [u, l] of this.laneOf) if (u !== uid) count[l]++;
    // 65.0: the least crowded give or take ARENA.plans.laneJitter (it was always the same lane).
    const J = ARENA.plans.on ? ARENA.plans.laneJitter : 0;
    let best = lanes[0], bs = Infinity;
    for (const l of lanes) {
      const sc = count[l] / this.w(l) + Math.random() * J;
      if (sc < bs) {
        bs = sc;
        best = l;
      }
    }
    this.laneOf.set(uid, best);
  }

  /** 44.0: the lane of sector `k` with fewest of the team (for a rally spawn), or -1. */
  laneInSector(k: number) {
    const count = new Array(this.lanes.length).fill(0);
    for (const l of this.laneOf.values()) count[l]++;
    let best = -1;
    for (let l = 0; l < this.lanes.length; l++) if (this.sectorOfLane(l) === k && (best < 0 || count[l] / this.w(l) < count[best] / this.w(best))) best = l;
    return best;
  }

  /** 44.0: where lane `l` should advance to with the fronts on (progress, this team's axis). */
  frontWant(l: number) {
    const F = this.fronts!;
    const k = this.sectorOfLane(l);
    const st = F.stance[this.team][k];
    return THREE.MathUtils.clamp(F.own(this.team, k) + ARENA.fronts.offset[st], -0.95, 0.95);
  }

  /**
   * `own`/`theirs`: the spawn centres; `lanes`: this team's lanes (waypoints from our spawn to theirs);
   * 18.0 `weights`: how many bots each lane is worth (absent: 1 each, the balance of 7.0–17.1);
   * `strict`: lanes whose bots close on radar contacts along the lane (absent: none).
   */
  constructor(
    readonly team: TeamId,
    own: THREE.Vector3,
    theirs: THREE.Vector3,
    readonly lanes: THREE.Vector3[][],
    readonly weights?: readonly number[],
    readonly strict?: readonly boolean[],
  ) {
    this.setBases(own, theirs);
  }

  setBases(own: THREE.Vector3, theirs: THREE.Vector3) {
    this.mid.set((own.x + theirs.x) / 2, (own.z + theirs.z) / 2);
    this.axis.set(theirs.x - own.x, theirs.z - own.z);
    this.half = Math.max(1, this.axis.length() / 2);
    this.axis.normalize();
    this.laneProg = this.lanes.map((L) => L.map((p) => this.progress(p)));
    this.laneTarget = this.lanes.map(() => 0);
    this.heat = this.lanes.map(() => 0);
  }

  /** 15.0: decay the lane heat to `now`. */
  private coolTo(now: number) {
    const dt = now - this.heatT;
    if (dt <= 0) return;
    const k = Math.pow(0.5, dt / ARENA.lanePressure.halfLife);
    for (let l = 0; l < this.heat.length; l++) this.heat[l] *= k;
    this.heatT = now;
  }

  /** 15.0: something happened at `p` (a death, a shot): its lane gets hotter. 27.0: and the areas near it. */
  addHeat(p: { x: number; z: number }, amount: number, now: number) {
    this.activity(p, amount, now);
    if (this.flankOf && this.flankOf(p.x, 0, p.z) <= 0) {
      this.coolCentre(now);
      this.centreHeat += amount;
    }
    if (!ARENA.lanePressure.on || !this.lanes.length) return;
    this.coolTo(now);
    this.heat[this.nearestLane(p)] += amount;
  }

  /** 38.0: decay the centre's heat to `now`. */
  private coolCentre(now: number) {
    const dt = now - this.centreT;
    if (dt <= 0) return;
    this.centreHeat *= Math.pow(0.5, dt / ARENA.flankPull.halfLife);
    this.centreT = now;
  }

  /** 38.0: the map's flanks (null: none, every area scored as before). Call after setPatrol. */
  setFlanks(flankOf: ((x: number, y: number, z: number) => number) | null) {
    this.flankOf = flankOf;
    this.hvaFlank = this.hvas.map((h) => flankOf?.(h.x, h.y, h.z) ?? 0);
    this.centreHeat = 0;
    this.centreT = 0;
  }

  reset() {
    this.contacts.clear();
    this.momentum = 0;
    this.stance = 'hold';
    this.ownFront = -0.8;
    this.enemyFront = ARENA.director.unknownFront;
    this.laneOf.clear();
    this.trades.length = 0;
    this.pushes.clear();
    this.flanks.clear();
    this.nextT = 0;
    this.log.length = 0;
    this.laneTarget = this.lanes.map(() => 0);
    this.heat = this.lanes.map(() => 0);
    this.heatT = 0;
    this.moveT = -Infinity;
    this.laneMoves = 0;
    this.mates = [];
    this.hunters.clear();
    this.fireteams.clear();
    this.ftOf.clear();
    this.commits.clear();
    this.repick.clear();
    this.secLoad = [];
    this.secFight = [];
    this.peelT = -Infinity;
    this.sectorStats = { peels: 0, ftSum: 0, ftN: 0 };
    this.roles.clear();
    this.seats.clear();
    this.dealt.clear();
    this.rotateT = -Infinity;
    this.rotations = 0;
  }

  private note(now: number, what: string, detail = '') {
    this.log.push([+now.toFixed(2), what, detail]);
    if (this.log.length > 200) this.log.shift();
  }

  /** -1 at our spawn, 0 mid-map, +1 at theirs. */
  progress(p: { x: number; z: number }) {
    return ((p.x - this.mid.x) * this.axis.x + (p.z - this.mid.y) * this.axis.y) / this.half;
  }

  // ------------------------------------------------------------------ the board
  private contactFor(h: Combatant, now: number): ArenaContact {
    let c = this.contacts.get(h.uid);
    if (!c) {
      c = { who: h, pos: h.pos.clone(), vel: new THREE.Vector3(), t: now, seenT: -Infinity, firedT: -Infinity, src: 'callout', by: -1, from: new THREE.Vector3() };
      this.contacts.set(h.uid, c);
    }
    return c;
  }

  /** A member (or the human) saw `h` (from where `by` stands); a callout is the human's sighting relayed to the bots. */
  sighting(h: Combatant, now: number, src: 'sight' | 'callout' = 'sight', by?: { uid: number; pos: THREE.Vector3 }) {
    if (!h.alive) return;
    const c = this.contactFor(h, now);
    c.pos.copy(h.pos);
    c.vel.copy(h.vel);
    c.t = c.seenT = now;
    c.src = src;
    if (by) {
      c.by = by.uid;
      c.from.copy(by.pos);
    }
  }

  /**
   * 12.0: the team's spotted hostiles (the minimap): seen by anyone within ARENA.spot.fade s, alive.
   * Heard gunfire is on the board but not here: a dot means someone has eyes on it (or just had).
   */
  spotted(now: number, out: Spot[] = []) {
    out.length = 0;
    for (const c of this.contacts.values()) {
      const age = now - c.seenT;
      if (age <= ARENA.spot.fade && c.who.alive) out.push({ who: c.who, pos: c.pos, age: Math.max(0, age) });
    }
    return out;
  }

  /**
   * `by` fired from `from`: plotted if a living member is within earshot. A fresh sighting is better
   * than the sound and is kept (only the firing time is noted).
   */
  heard(from: THREE.Vector3, by: Combatant, now: number, members: readonly ArenaMember[]) {
    if (by.team === this.team || !by.alive) return false;
    let near = false;
    for (const m of members) if (m.alive && Math.hypot(m.pos.x - from.x, m.pos.z - from.z) < HEAR) near = true;
    if (!near) return false;
    this.addHeat(from, ARENA.lanePressure.shot, now);
    const c = this.contactFor(by, now);
    c.firedT = now;
    if (now - c.seenT > 0.3) {
      c.pos.copy(from).setY(by.pos.y);
      c.vel.set(0, 0, 0);
      c.t = now;
      c.src = 'gunfire';
    }
    return true;
  }

  /** The contact is firing right now (sensing checks it sooner). */
  isHot(uid: number, now: number) {
    const c = this.contacts.get(uid);
    return !!c && now - c.firedT < 1.5;
  }

  /** Someone went to the spot and nobody is there: drop it so the team doesn't flock to it. */
  cleared(uid: number, now: number) {
    const c = this.contacts.get(uid);
    if (c && now - c.seenT > 0.5) this.contacts.delete(uid);
  }

  /**
   * The freshest worthwhile contact for a bot at `p` (nearer and newer is better), or null. 41.0: for
   * bot `uid`, none the team already chases with as many as may (ARENA.sectors.commit).
   */
  freshest(p: THREE.Vector3, now: number, uid?: number, keep?: (c: ArenaContact) => boolean): ArenaContact | null {
    let best: ArenaContact | null = null, bs = Infinity;
    for (const c of this.contacts.values()) {
      const age = now - c.t;
      if (age > ARENA.contactTtl || !c.who.alive) continue;
      if (keep && !keep(c)) continue;
      if (uid !== undefined && this.overCommitted(c.who.uid, uid, now, c.pos)) continue;
      const s = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) + age * 8;
      if (s < bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ watch (37.1)
  /**
   * 37.1, high ground (TdmData.highGround): one bot of the team at a time is posted to it. With no watch
   * for `every` s, the post held least lately gets the nearest bot within `reach` m of it; it has
   * `travel` s to get there (released if it doesn't), then holds it `hold` s. The watch ends when that
   * runs out or the bot dies; the next is posted `every` s later. Bots only: the human is never sent.
   * 38.0: up to `count` watches at once (default 1), each on a post nobody of the team is watching; a
   * second is posted 2 s after the first (they don't leave together).
   */
  private watchCfg: HighGround | null = null;
  watches: Watch[] = [];
  /** 37.1: the first watch (37.1 had one; a check may set it). */
  get watch(): Watch | null {
    return this.watches[0] ?? null;
  }
  set watch(w: Watch | null) {
    this.watches = w ? [w] : [];
  }
  /** 37.1 (DEV): where posted bots were last seen before they died on the way. */
  watchDiedAt: [number, number, number][] = [];
  private watchNext = 0;
  private postSeen: number[] = [];
  private watchFree: (m: ArenaMember) => boolean = () => true;
  /** 37.1 (DEV): watches posted, how many got there, and how the others ended (killed, out of time). */
  watchStats = { posts: 0, arrivals: 0, died: 0, timedOut: 0 };

  /**
   * `free`: may this member be sent now (Tdm: a bot not in a fight, with most of its health). The
   * nearest member regardless was usually one already fighting by the ship: 14 of 15 died on the way.
   */
  setWatch(cfg: HighGround | null, free: (m: ArenaMember) => boolean = () => true) {
    this.watchCfg = cfg;
    this.watchFree = free;
    this.watches = [];
    this.watchNext = 0;
    this.postSeen = cfg ? cfg.points.map(() => -Infinity) : [];
    this.watchStats = { posts: 0, arrivals: 0, died: 0, timedOut: 0 };
  }

  private updateWatch(now: number, bots: readonly ArenaMember[]) {
    const W = this.watchCfg;
    // 42.0: with roles, the anchors hold the high ground (its points are their best posts).
    if (!W || !W.points.length || ARENA.roles.on) {
      this.watches = [];
      return;
    }
    for (const w of [...this.watches]) {
      const bot = bots.find((b) => b.uid === w.uid);
      if (!bot && !w.arrived && w.lastAt) this.watchDiedAt.push(w.lastAt);
      if (bot) w.lastAt = bot.pos.toArray().map((v) => +v.toFixed(1)) as [number, number, number];
      if (bot && now <= w.until) continue;
      if (!w.arrived) this.watchStats[bot ? 'timedOut' : 'died']++;
      this.watches.splice(this.watches.indexOf(w), 1);
      this.watchNext = Math.max(this.watchNext, now + W.every);
    }
    if (this.watches.length >= Math.min(W.count ?? 1, W.points.length) || now < this.watchNext) return;
    let post = -1;
    for (let i = 0; i < W.points.length; i++) if (!this.watches.some((w) => w.post === i) && (post < 0 || this.postSeen[i] < this.postSeen[post])) post = i;
    const P = W.points[post];
    // Only from the post's own lane: drafted from anywhere within reach, 9 of 20 died in the next lane
    // over (Old Port's yard), crossing to the post.
    const lane = this.lanes.length ? this.nearestLane(P) : -1;
    let best: ArenaMember | null = null, bd = W.reach;
    for (const m of bots) {
      const d = Math.hypot(m.pos.x - P.x, m.pos.z - P.z);
      if (d < bd && Math.abs(m.pos.y - P.y) <= (W.rise ?? Infinity) && (lane < 0 || this.laneFor(m.uid, m.pos) === lane) && !this.watches.some((w) => w.uid === m.uid) && this.watchFree(m)) {
        bd = d;
        best = m;
      }
    }
    // Nobody free near enough: look again shortly (the post stays first in line).
    // (38.0: the next post's turn comes round first; with one post, as 37.1.)
    if (!best) {
      this.postSeen[post] = Math.max(this.postSeen[post], now - W.every);
      this.watchNext = now + 2;
      return;
    }
    this.watches.push({ uid: best.uid, post, until: now + WATCH_TRAVEL + bd / 2, arrived: false });
    this.postSeen[post] = now;
    this.watchStats.posts++;
    this.watchNext = now + 2;
  }

  private watchOf(uid: number) {
    return this.watches.find((w) => w.uid === uid) ?? null;
  }

  /** 37.1: the post `uid` is sent to, or null. 42.0: an anchor's post. */
  watchPost(uid: number): THREE.Vector3 | null {
    const a = this.seats.get(uid);
    if (a) return this.anchorPostsList[a.post];
    const w = this.watchOf(uid);
    return w ? this.watchCfg!.points[w.post] : null;
  }

  /** 37.1: `uid` is at its post: the hold starts (once). True the first time. 42.0: an anchor's too. */
  watchArrived(uid: number, now: number, rand: () => number = Math.random) {
    const a = this.seats.get(uid);
    if (a) {
      if (a.arrived) return false;
      a.arrived = true;
      a.at = now;
      return true;
    }
    const w = this.watchOf(uid);
    if (!w || w.arrived) return false;
    const [h0, h1] = this.watchCfg!.hold;
    w.arrived = true;
    w.until = now + h0 + rand() * (h1 - h0);
    this.watchStats.arrivals++;
    return true;
  }

  /** 37.1: `uid` is posted and already there (it fights from the post). 42.0: an anchor too. */
  watchHeld(uid: number) {
    const a = this.seats.get(uid);
    if (a) return a.arrived;
    return !!this.watchOf(uid)?.arrived;
  }

  // ------------------------------------------------------------------ roles (42.0)
  /** Each living bot's role this life (ARENA.roles); the human has none. */
  roles = new Map<number, ArenaRole>();
  /** The team's anchor posts (Roles.anchorPosts, best first), and which anchor holds each. */
  anchorPostsList: THREE.Vector3[] = [];
  private seats = new Map<number, { post: number; arrived: boolean; at: number }>();
  /** The team's bot count (the shares are of it; Tdm sets it). */
  teamBots = 0;

  setAnchorPosts(posts: readonly THREE.Vector3[]) {
    this.anchorPostsList = posts.map((p) => p.clone());
    this.seats.clear();
  }

  /** A free post: the best one no anchor holds, or -1. */
  private freePost() {
    for (let i = 0; i < this.anchorPostsList.length; i++) if (![...this.seats.values()].some((a) => a.post === i)) return i;
    return -1;
  }

  /** The role for a bot about to spawn (the shares of `teamBots`, the living bots' roles). */
  pickRole(): ArenaRole {
    const counts: Record<ArenaRole, number> = { frontliner: 0, wolf: 0, anchor: 0 };
    for (const r of this.roles.values()) counts[r]++;
    return pickRole(counts, Math.max(this.teamBots, this.roles.size + 1), ARENA.roles.share, this.freePost() >= 0);
  }

  /** `uid` has `role` this life; an anchor takes the best free post (none: it fights as a frontliner). */
  setRole(uid: number, role: ArenaRole): ArenaRole {
    if (role === 'anchor') {
      const i = this.freePost();
      if (i < 0) role = 'frontliner';
      else this.seats.set(uid, { post: i, arrived: false, at: -Infinity });
    }
    this.roles.set(uid, role);
    return role;
  }

  roleOf(uid: number): ArenaRole {
    return (ARENA.roles.on && this.roles.get(uid)) || 'frontliner';
  }

  /** 54.0: when `uid` reached the post it holds (-Infinity: not there yet, or no anchor). */
  seatedAt(uid: number) {
    const a = this.seats.get(uid);
    return a?.arrived ? a.at : -Infinity;
  }

  /**
   * 54.0, an anchor moves on (ARENA.roles.anchorStay …): to a free post other than its own (one of them
   * at random), else it gives its post up and fights as a frontliner. Returns its role now.
   */
  reseat(uid: number, rand: () => number = Math.random): ArenaRole {
    const a = this.seats.get(uid);
    if (!a) return this.roleOf(uid);
    const taken = new Set([...this.seats.values()].map((x) => x.post));
    const free: number[] = [];
    for (let i = 0; i < this.anchorPostsList.length; i++) if (!taken.has(i)) free.push(i);
    if (free.length) {
      a.post = free[Math.floor(rand() * free.length)];
      a.arrived = false;
      a.at = -Infinity;
      return 'anchor';
    }
    this.seats.delete(uid);
    this.roles.set(uid, 'frontliner');
    return 'frontliner';
  }

  /** An anchor left its post (to recover): it must reach it again. */
  leftPost(uid: number) {
    const a = this.seats.get(uid);
    if (a) a.arrived = false;
  }

  /** The anchor's post, if `uid` is an anchor with one (roles on). */
  anchorPost(uid: number) {
    const a = ARENA.roles.on ? this.seats.get(uid) : undefined;
    return a ? this.anchorPostsList[a.post] : null;
  }

  // ------------------------------------------------------------------ patrol (27.0)
  /** Patrol mode on, over these areas (deduplicated: none within patrol.minGap m of another). */
  setPatrol(points: readonly THREE.Vector3[]) {
    const P = ARENA.patrol;
    this.patrol = true;
    this.hvas = [];
    for (const p of points) if (!this.hvas.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < P.minGap && Math.abs(h.y - p.y) < 2)) this.hvas.push(p.clone());
    this.hvaHeat = this.hvas.map(() => 0);
    this.hvaSeen = this.hvas.map(() => -Infinity);
    this.hvaLane = this.hvas.map((h) => (this.lanes.length ? this.nearestLane(h) : 0));
    this.hvaClaim.clear();
    this.hvaFlank = this.hvas.map((h) => this.flankOf?.(h.x, h.y, h.z) ?? 0);
    this.patrolStats = { picks: 0, active: 0, spawnsHeard: 0, flank: 0 };
  }

  private coolAreas(now: number) {
    const dt = now - this.hvaT;
    if (dt <= 0) return;
    const k = Math.pow(0.5, dt / ARENA.patrol.halfLife);
    for (let i = 0; i < this.hvaHeat.length; i++) this.hvaHeat[i] *= k;
    this.hvaT = now;
  }

  /** Activity at `p`: every area within patrol.radius m takes `amount`, less with distance. */
  activity(p: { x: number; z: number }, amount: number, now: number) {
    if (!this.patrol) return;
    this.coolAreas(now);
    const R = ARENA.patrol.radius;
    for (let i = 0; i < this.hvas.length; i++) {
      const d = Math.hypot(this.hvas[i].x - p.x, this.hvas[i].z - p.z);
      if (d < R) this.hvaHeat[i] += amount * (1 - d / R);
    }
  }

  /** A pad came alive at `p` (someone of the other team spawned): heard if a member is within earshot. */
  heardSpawn(p: THREE.Vector3, now: number, members: readonly ArenaMember[]) {
    if (!this.patrol || !members.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < HEAR)) return false;
    this.patrolStats.spawnsHeard++;
    this.activity(p, ARENA.patrol.spawn, now);
    return true;
  }

  /** Each area's nearest lane (set with the areas). */
  private hvaLane: number[] = [];

  /** The area a patrolling bot should search next (claimed until released), or -1. */
  patrolPick(uid: number, p: THREE.Vector3, now: number, rand: () => number = Math.random) {
    if (!this.hvas.length) return -1;
    const P = ARENA.patrol;
    this.coolAreas(now);
    this.coolCentre(now);
    const prev = this.hvaClaim.get(uid);
    this.hvaClaim.delete(uid);
    const claims = this.hvas.map(() => 0);
    // 41.0: a fireteam's leader claims for all of it (its members go with it).
    for (const [b, i] of this.hvaClaim) claims[i] += this.bodies(b);
    const need = this.laneNeed(uid);
    const sec = this.sectorTerms(uid);
    const wolf = this.roleOf(uid) === 'wolf';
    let best = -1, bs = -Infinity;
    for (let i = 0; i < this.hvas.length; i++) {
      const h = this.hvas[i];
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (i === prev || d < P.minGap) continue;
      if (wolf) {
        const s = this.wolfScore(i, d, claims[i], now, uid) + rand() * P.jitter;
        if (s > bs) {
          bs = s;
          best = i;
        }
        continue;
      }
      const own = this.lanes.length ? this.hvaLane[i] === this.laneFor(uid, p) : false;
      const wide = ARENA.space.on && need.length ? ARENA.space.width * need[this.hvaLane[i]] : 0;
      // 41.0: with sectors, an area's crowd counts as with ARENA.space on (the bot's own fireteam aside).
      const crowdNear = sec && !ARENA.space.on ? ARENA.space.patrol * this.crowd(i, uid) : 0;
      const s = this.patrolScore(i, d, claims[i], now, own, this.crowd(i, uid)) + wide + (sec ? sec[this.hvaLane[i]] : 0) - crowdNear + rand() * P.jitter;
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    if (best < 0) best = prev ?? 0;
    this.hvaClaim.set(uid, best);
    this.patrolStats.picks++;
    if (this.hvaHeat[best] > 0.1) this.patrolStats.active++;
    if (this.hvaFlank[best] > 0) this.patrolStats.flank++;
    return best;
  }

  /**
   * 42.0: a wolf's worth of area `i` (ARENA.roles): past the middle toward their spawn (`rear` ×
   * progress over 0), quiet (`quiet` less as its activity reaches patrol.heatCap), away from its team
   * (`apart` per teammate within `apartR` m of it), unseen lately (patrol.stale), less for distance
   * and for bots already headed there.
   */
  wolfScore(i: number, d: number, claimants: number, now: number, uid: number) {
    const R = ARENA.roles;
    const P = ARENA.patrol;
    const h = this.hvas[i];
    let near = 0;
    for (const m of this.mates) if (m.alive && m.uid !== uid && Math.hypot(m.pos.x - h.x, m.pos.z - h.z) < R.apartR) near++;
    // (The pull peaks a third of the way into their half and is gone by their spawn: round them, not into their zones.)
    const p = this.progress(h);
    return R.rear * 2 * Math.max(0, Math.min(p, R.rearTo - p)) + R.quiet * (1 - Math.min(1, this.hvaHeat[i] / P.heatCap)) - R.apart * near + P.stale * Math.min(1, (now - this.hvaSeen[i]) / P.staleT) - d / P.distM - P.claim * claimants;
  }

  /** 42.0: the base-to-base axis (unit, xz: x, z), ours to theirs. */
  get axisXZ() {
    return { x: this.axis.x, z: this.axis.y };
  }

  /**
   * 41.0: each sector's patrol term for `uid`'s fireteam (ARENA.sectors): `need` × the sector's need
   * (fair share − the share of the rest of the team there) − `crowdPen` per bot over the crowd line,
   * the fireteam's members counted where they would go. Null: off, or one sector.
   */
  sectorTerms(uid: number): number[] | null {
    const S = ARENA.sectors;
    const n = this.lanes.length;
    if (!S.on || n < 2 || this.secLoad.length !== n) return null;
    const ft = this.fireteamOf(uid) ?? [uid];
    const others = [...this.secLoad];
    let all = 0;
    for (const m of this.mates) {
      if (!m.alive) continue;
      all++;
      if (ft.includes(m.uid)) others[this.nearestLane(m.pos)]--;
    }
    const rest = Math.max(1, all - ft.length);
    const line = this.crowdLine(all);
    return others.map((o) => S.need * (1 / n - Math.max(0, o) / rest) * n - S.crowdPen * Math.max(0, Math.max(0, o) + ft.length - (line - 1)));
  }

  /** An area's patrol score for a bot `d` m away (see the header), without the jitter. 32.0: less its crowd. */
  patrolScore(i: number, d: number, claimants: number, now: number, ownLane = false, crowd = 0) {
    const P = ARENA.patrol;
    const S = ARENA.space;
    const F = ARENA.flankPull;
    const flank = F.on && !this.endgame ? this.hvaFlank[i] * (F.base + F.hot * Math.min(1, this.centreHeat / F.ref)) : 0;
    return P.heat * Math.min(P.heatCap, this.hvaHeat[i]) + P.stale * Math.min(1, (now - this.hvaSeen[i]) / P.staleT) + (ownLane ? P.lane : 0) - d / P.distM - P.claim * claimants - (S.on ? S.patrol * crowd : 0) + flank;
  }

  /**
   * 32.0: how crowded area `i` is for bot `uid`: its living teammates near the area, and the areas its
   * teammates have claimed near it (each 1 − d / space.patrolR; the area's own claims are `claim`'s).
   */
  crowd(i: number, uid: number) {
    const R = ARENA.space.patrolR;
    const h = this.hvas[i];
    // 41.0: its fireteam goes with it: not a crowd.
    const ft = ARENA.sectors.on ? this.fireteamOf(uid) : null;
    let c = 0;
    for (const m of this.mates) {
      if (!m.alive || m.uid === uid || ft?.includes(m.uid)) continue;
      const d = Math.hypot(m.pos.x - h.x, m.pos.z - h.z);
      if (d < R) c += 1 - d / R;
    }
    for (const [b, j] of this.hvaClaim) {
      if (b === uid || j === i) continue;
      const d = Math.hypot(this.hvas[j].x - h.x, this.hvas[j].z - h.z);
      if (d < R) c += (1 - d / R) * this.bodies(b);
    }
    return c;
  }

  /**
   * 32.0, the width: how short each lane is of the team (bot `uid` left out): its fair share (1 / lanes)
   * less the share of the others in it, by where they are headed (a claimed area's lane) or else where
   * they stand, scaled so an empty lane is 1. [] with no lanes.
   */
  laneNeed(uid: number) {
    const n = this.lanes.length;
    if (!n) return [];
    const count = new Array(n).fill(0);
    let all = 0;
    for (const m of this.mates) {
      if (!m.alive || m.uid === uid) continue;
      const c = this.hvaClaim.get(m.uid);
      count[c !== undefined ? this.hvaLane[c] : this.nearestLane(m.pos)]++;
      all++;
    }
    return count.map((c) => (all ? (1 / n - c / all) * n : 0));
  }

  /**
   * 32.0: bot `bot` is hunting `victim`: its place among the bots after it (0 = the first), in the order
   * they joined; a bot not heard from for space.huntTtl s leaves the list, and a bot is on one list only.
   */
  huntSlot(bot: number, victim: number, now: number) {
    const ttl = ARENA.space.huntTtl;
    for (const [v, m] of this.hunters) {
      for (const [b, t] of m) if (now - t > ttl || (b === bot && v !== victim)) m.delete(b);
      if (!m.size) this.hunters.delete(v);
    }
    let m = this.hunters.get(victim);
    if (!m) this.hunters.set(victim, (m = new Map()));
    m.set(bot, now);
    let k = 0;
    for (const b of m.keys()) {
      if (b === bot) return k;
      k++;
    }
    return k;
  }

  patrolRelease(uid: number) {
    this.hvaClaim.delete(uid);
  }

  /** The team had someone at area `i` now. */
  visited(i: number, now: number) {
    if (i >= 0 && i < this.hvaSeen.length) this.hvaSeen[i] = now;
  }

  // ------------------------------------------------------------------ the last stand (29.0)
  /** A cover spot for `uid` within `near` m of the anchor that no teammate holds (claimed), or null. */
  holdSpot(uid: number, spots: readonly THREE.Vector3[], near: number, seed: number) {
    const taken = new Set([...this.holds].filter(([u]) => u !== uid).map(([, k]) => k));
    let best: THREE.Vector3 | null = null, bs = Infinity;
    for (const p of spots) {
      const d = Math.hypot(p.x - this.anchor.x, p.z - this.anchor.z);
      if (d > near || Math.abs(p.y - this.anchor.y) > 3) continue;
      const k = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      if (taken.has(k)) continue;
      // Near the centre, spread by each bot's own seed (two bots don't race for one spot).
      const s = d + ((p.x * 7.3 + p.z * 3.1 + seed * 11) % 3);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    if (best) this.holds.set(uid, `${best.x.toFixed(1)},${best.z.toFixed(1)}`);
    else this.holds.delete(uid);
    return best;
  }

  releaseHold(uid: number) {
    this.holds.delete(uid);
  }

  // ------------------------------------------------------------------ deaths
  hostileDied(v: Combatant, now: number) {
    this.addHeat(v.pos, ARENA.lanePressure.death, now);
    this.contacts.delete(v.uid);
    this.pushes.delete(v.uid);
    this.flanks.delete(v.uid);
    this.chases.delete(v.uid);
    this.covers.delete(v.uid);
    for (const [b, c] of this.commits) if (c.v === v.uid) this.commits.delete(b);
    this.trades.push([now, +1]);
  }

  friendDied(v: Combatant, now: number) {
    this.addHeat(v.pos, ARENA.lanePressure.death, now);
    this.laneOf.delete(v.uid);
    this.hvaClaim.delete(v.uid);
    this.releaseChase(v.uid);
    this.commits.delete(v.uid);
    this.roles.delete(v.uid);
    this.seats.delete(v.uid);
    this.releasePush(v.uid);
    this.releaseFlank(v.uid);
    this.trades.push([now, -1]);
  }

  // ------------------------------------------------------------------ push claims
  /** May bot `bot` rush wounded `victim`? Runners may make a third (it is what they are for). */
  claimPush(bot: number, victim: number, now: number, runner = false) {
    for (const [k, p] of this.pushes) if (p.until < now) this.pushes.delete(k);
    let p = this.pushes.get(victim);
    if (p?.bots.includes(bot)) return true;
    if (!p) {
      p = { bots: [], until: 0 };
      this.pushes.set(victim, p);
    }
    if (p.bots.length >= ARENA.pushers + (runner ? 1 : 0)) return false;
    p.bots.push(bot);
    p.until = now + ARENA.pushMax;
    return true;
  }

  releasePush(bot: number) {
    for (const [k, p] of this.pushes) {
      const i = p.bots.indexOf(bot);
      if (i >= 0) p.bots.splice(i, 1);
      if (!p.bots.length) this.pushes.delete(k);
    }
  }

  pushersOn(victim: number) {
    return this.pushes.get(victim)?.bots.length ?? 0;
  }

  // ------------------------------------------------------------------ 55.0: chases and cover calls
  /** Victim uid → the bots on its trail (ARENA.instinct.chase). */
  private chases = new Map<number, number[]>();
  /** Shooter uid → a teammate's call to cover it off him: until when, and where the caller was. */
  private covers = new Map<number, { until: number; x: number; z: number }>();

  /** May `bot` go after `victim` (at most `chase.per` of the team on one)? */
  claimChase(bot: number, victim: number) {
    const c = this.chases.get(victim) ?? [];
    if (c.includes(bot)) return true;
    if (c.length >= ARENA.instinct.chase.per) return false;
    c.push(bot);
    this.chases.set(victim, c);
    return true;
  }

  releaseChase(bot: number) {
    for (const [k, c] of this.chases) {
      const i = c.indexOf(bot);
      if (i >= 0) c.splice(i, 1);
      if (!c.length) this.chases.delete(k);
    }
  }

  chasersOn(victim: number) {
    return this.chases.get(victim)?.length ?? 0;
  }

  /** A teammate at `at` breaks off from `shooter`: cover me off him. */
  callCover(shooter: number, at: { x: number; z: number }, now: number) {
    this.covers.set(shooter, { until: now + ARENA.instinct.cover.time, x: at.x, z: at.z });
  }

  /** Is `shooter` called out for cover to a bot at `at`? */
  covering(shooter: number, at: { x: number; z: number }, now: number) {
    const c = this.covers.get(shooter);
    if (!c) return false;
    if (c.until < now) {
      this.covers.delete(shooter);
      return false;
    }
    return (c.x - at.x) ** 2 + (c.z - at.z) ** 2 < ARENA.instinct.cover.r ** 2;
  }

  // ------------------------------------------------------------------ flank claims (12.0)
  /**
   * May `bot` go round spotted `victim`? Returns the side to take (+1 / -1: the second flanker takes
   * the other side of the first, a pincer), or 0 if it already has its flankers.
   */
  claimFlank(bot: number, victim: number, now: number, prefer: number) {
    for (const [k, f] of this.flanks) if (f.until < now) this.flanks.delete(k);
    let f = this.flanks.get(victim);
    const i = f ? f.bots.indexOf(bot) : -1;
    if (f && i >= 0) return f.sides[i];
    if (!f) {
      f = { bots: [], sides: [], until: 0 };
      this.flanks.set(victim, f);
    }
    if (f.bots.length >= ARENA.flank.per) return 0;
    const side = f.sides.length ? -f.sides[0] : prefer >= 0 ? 1 : -1;
    f.bots.push(bot);
    f.sides.push(side);
    f.until = now + ARENA.flank.maxT;
    this.note(now, 'flank', `${bot}>${victim} ${side > 0 ? 'L' : 'R'}`);
    return side;
  }

  releaseFlank(bot: number) {
    for (const [k, f] of this.flanks) {
      const i = f.bots.indexOf(bot);
      if (i >= 0) {
        f.bots.splice(i, 1);
        f.sides.splice(i, 1);
      }
      if (!f.bots.length) this.flanks.delete(k);
    }
  }

  flankersOn(victim: number) {
    return this.flanks.get(victim)?.bots.length ?? 0;
  }

  // ------------------------------------------------------------------ fireteams and sectors (41.0)
  /**
   * 41.0: the map's density radius (m; TdmData.spawnTuning.densityR): fireteams form within
   * `sectors.join` of it and keep within `sectors.follow` of it (wide maps loose, narrow ones tight).
   */
  densityR = 12;
  /** Fireteam id → its members' uids (living bots), and each bot's fireteam. */
  fireteams = new Map<number, number[]>();
  private ftOf = new Map<number, number>();
  private nextFt = 1;
  /** Bot uid → the hostile it chases or fights, and when it said so (ARENA.sectors.commitTtl). */
  private commits = new Map<number, { v: number; t: number; at?: { x: number; z: number } }>();
  /** Per sector (lane): the team's members in it, and its bots in a fight. */
  secLoad: number[] = [];
  secFight: number[] = [];
  private peelT = -Infinity;
  /** Patrol claims the director dropped (a fireteam sent elsewhere): those bots pick again. */
  private repick = new Set<number>();
  /** (DEV) fireteams sent out of a crowded sector; members' fireteam size, summed and counted at each update. */
  sectorStats = { peels: 0, ftSum: 0, ftN: 0 };

  /** Bot `uid` chases or fights `victim` (-1: nothing), which is at `at` (a live position, for the site cap). */
  commit(uid: number, victim: number, now: number, at?: { x: number; z: number }) {
    if (victim < 0) this.commits.delete(uid);
    else this.commits.set(uid, { v: victim, t: now, at });
  }

  /**
   * How many of the team (`uid` aside) chase or fight anyone within the map's local area (densityR) of
   * `at`: the fight there, whoever each is after.
   */
  committedNear(at: { x: number; z: number }, uid: number, now: number) {
    const ttl = ARENA.sectors.commitTtl;
    const r2 = this.densityR * this.densityR;
    let n = 0;
    for (const [b, c] of this.commits) if (b !== uid && c.at && now - c.t <= ttl && (c.at.x - at.x) ** 2 + (c.at.z - at.z) ** 2 <= r2) n++;
    return n;
  }

  /** How many of the team (`uid` aside) chase or fight `victim`. */
  committedOn(victim: number, uid: number, now: number) {
    const ttl = ARENA.sectors.commitTtl;
    let n = 0;
    for (const [b, c] of this.commits) if (c.v === victim && b !== uid && now - c.t <= ttl) n++;
    return n;
  }

  /** Is `uid` chasing or fighting someone (a fresh commitment)? */
  fighting(uid: number, now: number) {
    const c = this.commits.get(uid);
    return !!c && now - c.t <= ARENA.sectors.commitTtl;
  }

  /**
   * Is `victim` chased by as many as may chase it (`sectors.commit`), or (`sectors.site` > 0) is the
   * fight round it (`at`) as big as a fight may be?
   */
  overCommitted(victim: number, uid: number, now: number, at?: { x: number; z: number }) {
    const S = ARENA.sectors;
    if (!S.on) return false;
    if (this.committedOn(victim, uid, now) >= S.commit) return true;
    return S.site > 0 && !!at && this.committedNear(at, uid, now) >= S.site;
  }

  fireteamOf(uid: number) {
    const ft = this.ftOf.get(uid);
    return ft === undefined ? null : this.fireteams.get(ft) ?? null;
  }

  /** The leader of `uid`'s fireteam (its lowest uid), or null when `uid` leads it or has none. */
  leaderOf(uid: number): ArenaMember | null {
    const ft = this.fireteamOf(uid);
    if (!ft || ft[0] === uid) return null;
    return this.mates.find((m) => m.uid === ft[0] && m.alive) ?? null;
  }

  /** 41.0: the bodies behind `uid`'s patrol claim: its fireteam (sectors on), else 1. */
  private bodies(uid: number) {
    return ARENA.sectors.on ? this.fireteamOf(uid)?.length ?? 1 : 1;
  }

  /** The patrol area `uid` has claimed, or -1. */
  claimOf(uid: number) {
    return this.hvaClaim.get(uid) ?? -1;
  }

  /** The director dropped `uid`'s patrol claim (its fireteam was sent to another sector): once, true. */
  takeRepick(uid: number) {
    return this.repick.delete(uid);
  }

  /** The crowd line: `sectors.crowd`, or a fair share of `alive` + 1 when that is more. */
  crowdLine(alive: number) {
    return Math.max(ARENA.sectors.crowd, Math.ceil(alive / Math.max(1, this.lanes.length)) + 1);
  }

  /**
   * A fireteam's size: the team over the sectors, so every sector can have one (5 bots, 3 sectors: 2;
   * 12 and 5: 3), between 1 and `sectors.team`.
   */
  fireteamSize(alive: number) {
    // 42.0: with roles, the fireteams are the frontliners' (half the team): at least pairs.
    const least = ARENA.roles.on ? 2 : 1;
    return Math.max(least, Math.min(ARENA.sectors.team, Math.ceil(alive / Math.max(1, this.lanes.length))));
  }

  /**
   * Fireteams: the dead leave; a bot with none joins one with room whose leader stands within the join
   * radius (on its level), else starts its own; two fireteams that both fit in one and whose leaders
   * stand that close merge. A fireteam's members take its leader's sector.
   */
  private formFireteams(bots: readonly ArenaMember[]) {
    const S = ARENA.sectors;
    const size = this.fireteamSize(bots.length);
    const up = new Map(bots.map((b) => [b.uid, b]));
    for (const [id, ms] of this.fireteams) {
      const keep = ms.filter((u) => up.has(u));
      if (keep.length) this.fireteams.set(id, keep);
      else this.fireteams.delete(id);
    }
    for (const u of [...this.ftOf.keys()]) if (!up.has(u)) this.ftOf.delete(u);
    const R = S.join * this.densityR;
    const near = (a: ArenaMember, b: ArenaMember) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) <= R && Math.abs(a.pos.y - b.pos.y) < 4;
    for (const b of bots) {
      if (this.ftOf.has(b.uid)) continue;
      let join = -1;
      for (const [id, ms] of this.fireteams) if (ms.length < size && near(b, up.get(ms[0])!)) join = id;
      if (join < 0) this.fireteams.set((join = this.nextFt++), []);
      const ms = this.fireteams.get(join)!;
      ms.push(b.uid);
      ms.sort((x, y) => x - y);
      this.ftOf.set(b.uid, join);
    }
    const ids = [...this.fireteams.keys()];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = this.fireteams.get(ids[i]), c = this.fireteams.get(ids[j]);
        if (!a || !c || a.length + c.length > size || !near(up.get(a[0])!, up.get(c[0])!)) continue;
        // Not mid-fight (each chases its own).
        if (this.commits.has(a[0]) || this.commits.has(c[0])) continue;
        a.push(...c);
        a.sort((x, y) => x - y);
        for (const u of c) this.ftOf.set(u, ids[i]);
        this.fireteams.delete(ids[j]);
      }
    for (const ms of this.fireteams.values()) {
      const l = this.laneOf.get(ms[0]);
      if (l !== undefined) for (const u of ms) this.laneOf.set(u, l);
      this.sectorStats.ftSum += ms.length * ms.length;
      this.sectorStats.ftN += ms.length;
    }
  }

  /** Each sector's members and fighting bots (by where they stand). */
  private countSectors(alive: readonly ArenaMember[], now: number) {
    const n = this.lanes.length;
    this.secLoad = new Array(n).fill(0);
    this.secFight = new Array(n).fill(0);
    if (!n) return;
    const ttl = ARENA.sectors.commitTtl;
    for (const m of alive) {
      const l = this.nearestLane(m.pos);
      this.secLoad[l]++;
      const c = this.commits.get(m.uid);
      if (c && now - c.t <= ttl) this.secFight[l]++;
    }
  }

  /**
   * A crowded sector (the crowd line of the team standing in it) sends one of the fireteams sent there
   * (the newest, none of it in a fight) to the sector fewest are sent to, when that evens them out: its
   * members' lane changes and the leader's patrol claim is dropped (it picks again).
   */
  private peel(alive: readonly ArenaMember[], now: number) {
    const S = ARENA.sectors;
    const n = this.lanes.length;
    if (n < 2 || now - this.peelT < S.peelCd) return;
    const line = this.crowdLine(alive.length);
    let crowded = -1;
    for (let l = 0; l < n; l++) if (this.secLoad[l] >= line && (crowded < 0 || this.secLoad[l] > this.secLoad[crowded])) crowded = l;
    if (crowded < 0) return;
    const sent = new Array(n).fill(0);
    for (const m of alive) sent[m.isPlayer ? this.nearestLane(m.pos) : this.laneOf.get(m.uid) ?? this.nearestLane(m.pos)]++;
    let to = -1;
    for (let l = 0; l < n; l++) if (l !== crowded && (to < 0 || sent[l] / this.w(l) < sent[to] / this.w(to))) to = l;
    if (to < 0) return;
    const ttl = S.commitTtl;
    let pick: number[] | null = null;
    for (const ms of this.fireteams.values()) {
      const lead = alive.find((m) => m.uid === ms[0]);
      if (!lead || this.nearestLane(lead.pos) !== crowded || this.laneOf.get(ms[0]) !== crowded) continue;
      if (ms.some((u) => (this.commits.get(u)?.t ?? -Infinity) >= now - ttl)) continue;
      // Only when it evens them out (the sector it goes to stays below the one it leaves).
      if ((sent[to] + ms.length) / this.w(to) > (sent[crowded] - ms.length) / this.w(crowded)) continue;
      if (!pick || ms[0] > pick[0]) pick = ms;
    }
    if (!pick) return;
    for (const u of pick) {
      this.laneOf.set(u, to);
      if (this.hvaClaim.delete(u)) this.repick.add(u);
    }
    this.peelT = now;
    this.sectorStats.peels++;
    this.note(now, 'peel', `${pick.join('+')} ${crowded}>${to}`);
  }

  // ------------------------------------------------------------------ the front
  /**
   * Every 0.25 s. `members`: the team's living bots and the human; `enemyAlive`: how many of theirs
   * are up (the scoreboard every player can read).
   */
  update(now: number, members: readonly ArenaMember[], enemyAlive: number, tickets: { own: number; theirs: number }) {
    if (now < this.nextT) return false;
    this.nextT = now + ARENA.director.every;
    const D = ARENA.director;
    for (const [k, c] of this.contacts) if (now - c.t > ARENA.contactTtl * 2 || !c.who.alive) this.contacts.delete(k);
    while (this.trades.length && now - this.trades[0][0] > D.tradeWindow) this.trades.shift();
    this.mates = members;
    const alive = members.filter((m) => m.alive);
    const bots = alive.filter((m) => !m.isPlayer);
    // 29.0: the centre of the team still standing (the human counts: they gather on him too).
    this.anchor.set(0, 0, 0);
    for (const m of alive) this.anchor.add(m.pos);
    this.anchorN = alive.length;
    if (alive.length) this.anchor.divideScalar(alive.length);
    for (const [uid] of this.holds) if (!bots.some((b) => b.uid === uid)) this.holds.delete(uid);
    // 41.0: the fireteams, and who is where.
    if (ARENA.sectors.on) {
      // 42.0: wolves and anchors play alone.
      this.formFireteams(ARENA.roles.on ? bots.filter((b) => this.roleOf(b.uid) === 'frontliner') : bots);
      this.countSectors(alive, now);
    }
    this.updateWatch(now, bots);
    // 27.0: an area anyone of the team stands near has been looked at.
    if (this.patrol)
      for (const m of alive)
        for (let i = 0; i < this.hvas.length; i++) if (Math.hypot(this.hvas[i].x - m.pos.x, this.hvas[i].z - m.pos.z) < ARENA.patrol.near && Math.abs(this.hvas[i].y - m.pos.y) < 2) this.hvaSeen[i] = now;
    // Fronts.
    const prog = bots.map((m) => this.progress(m.pos)).sort((a, b) => a - b);
    this.ownFront = prog.length ? prog[Math.floor(prog.length / 2)] : -0.8;
    let ef = Infinity;
    for (const c of this.contacts.values()) if (now - c.t <= ARENA.contactTtl) ef = Math.min(ef, this.progress(c.pos));
    this.enemyFront = ef === Infinity ? D.unknownFront : ef;
    // Momentum and stance.
    const trade = this.trades.reduce((a, t) => a + t[1], 0);
    this.momentum = THREE.MathUtils.clamp(0.3 * (alive.length - enemyAlive) + 0.03 * (tickets.own - tickets.theirs) + 0.12 * trade, -1, 1);
    const stance: Stance = this.momentum > D.push ? 'push' : this.momentum < D.regroup ? 'regroup' : 'hold';
    if (stance !== this.stance) this.note(now, 'stance', `${this.stance}>${stance} m=${this.momentum.toFixed(2)}`);
    this.stance = stance;
    // Where each lane advances to. 44.0: with the fronts, each to its own sector's line.
    const want0 = this.desiredProgress();
    for (let l = 0; l < this.lanes.length; l++) {
      const P = this.laneProg[l];
      const want = this.fronts ? this.frontWant(l) : want0;
      let i = P.findIndex((p) => p >= want);
      if (i < 0) i = P.length - 1;
      this.laneTarget[l] = i;
    }
    this.coolTo(now);
    this.assignLanes(alive, now);
    // 44.0: the fronts send bodies where they are needed (not the 41.0 peel).
    if (ARENA.sectors.on && !this.fronts) {
      this.peel(alive, now);
      // A fireteam keeps to its leader's sector (assignLanes balances bodies, one at a time).
      for (const ms of this.fireteams.values()) {
        const l = this.laneOf.get(ms[0]);
        if (l !== undefined) for (const u of ms) this.laneOf.set(u, l);
      }
    }
    return true;
  }

  /** How far forward the team should be (progress), by stance. */
  desiredProgress() {
    const ef = this.enemyFront, of = this.ownFront;
    if (this.stance === 'push') return ef + 0.05;
    if (this.stance === 'regroup') return Math.max(-0.5, of - 0.1);
    return Math.min(ef - 0.05, of + 0.2);
  }

  /** 18.0: a lane whose bots keep to it when the radar has a contact (see TdmData.laneStrict). */
  isStrict(l: number) {
    return !!this.strict?.[l];
  }

  /** A lane's weight (18.0): its share of the team; 1 unless the map says otherwise. */
  private w(l: number) {
    return this.weights?.[l] ?? 1;
  }

  /**
   * Keep every lane manned: new bots go to the emptiest lane; an empty lane takes the newest bot of
   * the fullest. 18.0: "emptiest" and "fullest" are per lane weight (bots ÷ weight).
   */
  private assignLanes(alive: readonly ArenaMember[], now = 0) {
    const n = this.lanes.length;
    if (!n) return;
    if (this.fronts) return this.assignFronts(alive, now);
    const count = new Array(n).fill(0);
    const bots = alive.filter((m) => !m.isPlayer).sort((a, b) => a.uid - b.uid);
    for (const m of alive) if (m.isPlayer) count[this.nearestLane(m.pos)]++;
    for (const [uid] of this.laneOf) if (!bots.some((b) => b.uid === uid)) this.laneOf.delete(uid);
    for (const b of bots) {
      const l = this.laneOf.get(b.uid);
      if (l !== undefined) count[l]++;
    }
    // 41.0: a fireteam's member takes its leader's sector (the leader, its lowest uid, comes first).
    const SC = ARENA.sectors;
    const leadOf = (uid: number) => (SC.on ? this.fireteamOf(uid)?.[0] ?? uid : uid);
    for (const b of bots) {
      if (this.laneOf.has(b.uid)) continue;
      const lead = leadOf(b.uid);
      if (lead !== b.uid && this.laneOf.has(lead)) {
        const l = this.laneOf.get(lead)!;
        this.laneOf.set(b.uid, l);
        count[l]++;
        continue;
      }
      // The emptiest lane; among equals the centre, else (12.0: five lanes on the desert, more than a
      // team has bots) any of them at random, so over a match every lane is walked. 15.0: a hot lane
      // counts as fuller than it is (weight × heat).
      const P = ARENA.lanePressure;
      // 41.0: never into a sector where `sectors.crowd` of the team are fighting already.
      // A fireteam's leader weighs each lane with its whole fireteam in it (a pair doesn't overfill a flank).
      const add = SC.on ? this.fireteamOf(b.uid)?.length ?? 1 : 0;
      const cost = count.map((c, l) => (c + add + (P.on ? P.weight * (this.heat[l] ?? 0) : 0)) / this.w(l) + (SC.on && (this.secFight[l] ?? 0) >= SC.crowd ? 100 : 0));
      const least = Math.min(...cost);
      const open = cost.map((c, l) => (c - least < 0.25 ? l : -1)).filter((l) => l >= 0);
      const best = !P.on && open.includes(1) ? 1 : open[Math.floor(Math.random() * open.length)];
      this.laneOf.set(b.uid, best);
      count[best]++;
    }
    // 15.0: lane pressure: off the hottest lane (two or more on it) to a cooler one, now and then.
    const P = ARENA.lanePressure;
    if (P.on && now - this.moveT >= P.moveCd) {
      let hot = -1, cool = -1;
      for (let l = 0; l < n; l++) {
        if (count[l] >= 2 && (hot < 0 || this.heat[l] / this.w(l) > this.heat[hot] / this.w(hot))) hot = l;
        if (cool < 0 || (this.heat[l] + 0.3 * count[l]) / this.w(l) < (this.heat[cool] + 0.3 * count[cool]) / this.w(cool)) cool = l;
      }
      if (hot >= 0 && cool >= 0 && hot !== cool && this.heat[hot] / this.w(hot) - this.heat[cool] / this.w(cool) >= P.hot) {
        const mover = [...bots].reverse().find((b) => this.laneOf.get(b.uid) === hot && leadOf(b.uid) === b.uid);
        if (mover) {
          const n = this.moveFireteam(mover.uid, cool);
          count[hot] -= n;
          count[cool] += n;
          this.moveT = now;
          this.laneMoves++;
          this.note(now, 'lane', `${hot}>${cool} heat ${this.heat[hot].toFixed(1)}/${this.heat[cool].toFixed(1)}`);
        }
      }
    }
    // An empty lane takes a bot back, unless (15.0) it is empty because it is hot.
    const empty = count.findIndex((c, l) => c === 0 && !(P.on && (this.heat[l] ?? 0) >= P.hot));
    if (empty >= 0 && count.reduce((a, c) => a + c, 0) >= n) {
      let full = 0;
      for (let l = 1; l < n; l++) if (count[l] / this.w(l) > count[full] / this.w(full)) full = l;
      if (count[full] >= 2) {
        // 41.0: a fireteam (the newest) that leaves the full lane at least one.
        const mover = [...bots].reverse().find((b) => this.laneOf.get(b.uid) === full && leadOf(b.uid) === b.uid && (this.fireteamOf(b.uid)?.length ?? 1) < count[full]);
        if (mover) this.moveFireteam(mover.uid, empty);
      }
    }
  }

  /**
   * 44.0, lanes with the fronts: a bot with no lane takes the one its spawn dealt it (dealSector), else
   * (the opening) the sector it stands in; a fireteam's members their leader's. Every `rotateCd` s a sector falling
   * back takes a bot (not in a fight, the newest) from a sector pushing with a body to spare.
   */
  private assignFronts(alive: readonly ArenaMember[], now: number) {
    const F = this.fronts!;
    const bots = alive.filter((m) => !m.isPlayer).sort((a, b) => a.uid - b.uid);
    for (const [uid] of this.laneOf) if (!bots.some((b) => b.uid === uid)) this.laneOf.delete(uid);
    for (const uid of [...this.dealt.keys()]) if (!bots.some((b) => b.uid === uid)) this.dealt.delete(uid);
    const SC = ARENA.sectors;
    for (const b of bots) {
      if (this.laneOf.has(b.uid)) continue;
      const lead = SC.on ? this.fireteamOf(b.uid)?.[0] ?? b.uid : b.uid;
      if (lead !== b.uid && this.laneOf.has(lead)) {
        this.laneOf.set(b.uid, this.laneOf.get(lead)!);
        continue;
      }
      // (The opening's bots: the sector of the zone they stand in; the zones were dealt round-robin.)
      this.dealSector(b.uid, this.dealt.get(b.uid) ?? F.sectorOf(b.pos.x, b.pos.y, b.pos.z));
    }
    if (now - this.rotateT < ARENA.fronts.rotateCd) return;
    const st = F.stance[this.team];
    const back = st.indexOf('fallback');
    if (back < 0) return;
    const sent = new Array(F.n).fill(0);
    for (const b of bots) sent[this.sectorOfLane(this.laneOf.get(b.uid) ?? 0)]++;
    let from = -1;
    for (let k = 0; k < F.n; k++) if (k !== back && st[k] === 'push' && sent[k] >= 3 && (from < 0 || sent[k] > sent[from])) from = k;
    if (from < 0) return;
    // A fireteam's leader, its fireteam with it (they keep to their leader's lane), none of it fighting.
    const mover = [...bots].reverse().find((b) => {
      if (this.sectorOfLane(this.laneOf.get(b.uid) ?? 0) !== from || this.leaderOf(b.uid) || this.roleOf(b.uid) !== 'frontliner') return false;
      const ft = (SC.on && this.fireteamOf(b.uid)) || [b.uid];
      return sent[from] - ft.length >= 1 && !ft.some((u) => this.fighting(u, now));
    });
    if (!mover) return;
    const to = this.laneInSector(back);
    if (to < 0) return;
    this.moveFireteam(mover.uid, to);
    this.rotateT = now;
    this.rotations++;
    this.note(now, 'rotate', `${mover.uid} ${from}>${back}`);
  }

  /** 41.0: `lead` and its fireteam (sectors on) to lane `l`; how many moved. */
  private moveFireteam(lead: number, l: number) {
    const ms = ARENA.sectors.on ? this.fireteamOf(lead) ?? [lead] : [lead];
    for (const u of ms) this.laneOf.set(u, l);
    return ms.length;
  }

  nearestLane(p: { x: number; z: number }) {
    let best = 0, bd = Infinity;
    this.lanes.forEach((L, l) => {
      for (const w of L) {
        const d = Math.hypot(w.x - p.x, w.z - p.z);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
    });
    return best;
  }

  laneFor(uid: number, p: { x: number; z: number }) {
    let l = this.laneOf.get(uid);
    if (l === undefined) {
      l = this.nearestLane(p);
      this.laneOf.set(uid, l);
    }
    return l;
  }
}
