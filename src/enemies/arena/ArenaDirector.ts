import * as THREE from 'three';
import type { Combatant, TeamId } from '../../combat/Team';
import { ARENA } from './ArenaCtx';
import type { HighGround } from '../../levels/Level';

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

  /** The freshest worthwhile contact for a bot at `p` (nearer and newer is better), or null. */
  freshest(p: THREE.Vector3, now: number): ArenaContact | null {
    let best: ArenaContact | null = null, bs = Infinity;
    for (const c of this.contacts.values()) {
      const age = now - c.t;
      if (age > ARENA.contactTtl || !c.who.alive) continue;
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
    if (!W || !W.points.length) return;
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

  /** 37.1: the post `uid` is sent to, or null. */
  watchPost(uid: number): THREE.Vector3 | null {
    const w = this.watchOf(uid);
    return w ? this.watchCfg!.points[w.post] : null;
  }

  /** 37.1: `uid` is at its post: the hold starts (once). True the first time. */
  watchArrived(uid: number, now: number, rand: () => number = Math.random) {
    const w = this.watchOf(uid);
    if (!w || w.arrived) return false;
    const [h0, h1] = this.watchCfg!.hold;
    w.arrived = true;
    w.until = now + h0 + rand() * (h1 - h0);
    this.watchStats.arrivals++;
    return true;
  }

  /** 37.1: `uid` is posted and already there (it fights from the post). */
  watchHeld(uid: number) {
    return !!this.watchOf(uid)?.arrived;
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
    for (const i of this.hvaClaim.values()) claims[i]++;
    const need = this.laneNeed(uid);
    let best = -1, bs = -Infinity;
    for (let i = 0; i < this.hvas.length; i++) {
      const h = this.hvas[i];
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (i === prev || d < P.minGap) continue;
      const own = this.lanes.length ? this.hvaLane[i] === this.laneFor(uid, p) : false;
      const wide = ARENA.space.on && need.length ? ARENA.space.width * need[this.hvaLane[i]] : 0;
      const s = this.patrolScore(i, d, claims[i], now, own, this.crowd(i, uid)) + wide + rand() * P.jitter;
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
    let c = 0;
    for (const m of this.mates) {
      if (!m.alive || m.uid === uid) continue;
      const d = Math.hypot(m.pos.x - h.x, m.pos.z - h.z);
      if (d < R) c += 1 - d / R;
    }
    for (const [b, j] of this.hvaClaim) {
      if (b === uid || j === i) continue;
      const d = Math.hypot(this.hvas[j].x - h.x, this.hvas[j].z - h.z);
      if (d < R) c += 1 - d / R;
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
    this.trades.push([now, +1]);
  }

  friendDied(v: Combatant, now: number) {
    this.addHeat(v.pos, ARENA.lanePressure.death, now);
    this.laneOf.delete(v.uid);
    this.hvaClaim.delete(v.uid);
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
    // Where each lane advances to.
    const want = this.desiredProgress();
    for (let l = 0; l < this.lanes.length; l++) {
      const P = this.laneProg[l];
      let i = P.findIndex((p) => p >= want);
      if (i < 0) i = P.length - 1;
      this.laneTarget[l] = i;
    }
    this.coolTo(now);
    this.assignLanes(alive, now);
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
    const count = new Array(n).fill(0);
    const bots = alive.filter((m) => !m.isPlayer).sort((a, b) => a.uid - b.uid);
    for (const m of alive) if (m.isPlayer) count[this.nearestLane(m.pos)]++;
    for (const [uid] of this.laneOf) if (!bots.some((b) => b.uid === uid)) this.laneOf.delete(uid);
    for (const b of bots) {
      const l = this.laneOf.get(b.uid);
      if (l !== undefined) count[l]++;
    }
    for (const b of bots) {
      if (this.laneOf.has(b.uid)) continue;
      // The emptiest lane; among equals the centre, else (12.0: five lanes on the desert, more than a
      // team has bots) any of them at random, so over a match every lane is walked. 15.0: a hot lane
      // counts as fuller than it is (weight × heat).
      const P = ARENA.lanePressure;
      const cost = count.map((c, l) => (c + (P.on ? P.weight * (this.heat[l] ?? 0) : 0)) / this.w(l));
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
        const mover = [...bots].reverse().find((b) => this.laneOf.get(b.uid) === hot);
        if (mover) {
          this.laneOf.set(mover.uid, cool);
          count[hot]--;
          count[cool]++;
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
        const mover = [...bots].reverse().find((b) => this.laneOf.get(b.uid) === full);
        if (mover) this.laneOf.set(mover.uid, empty);
      }
    }
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
