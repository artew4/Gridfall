import * as THREE from 'three';
import type { Combatant, TeamId } from '../../combat/Team';
import { ARENA } from './ArenaCtx';

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
  private trades: [number, number][] = [];
  private pushes = new Map<number, { bots: number[]; until: number }>();
  private nextT = 0;
  private axis = new THREE.Vector2(0, -1);
  private mid = new THREE.Vector2();
  private half = 64;
  private laneProg: number[][] = [];
  /** Event log for checks: [time, what, detail]. Bounded. */
  log: [number, string, string][] = [];

  /** `own`/`theirs`: the spawn centres; `lanes`: this team's lanes (waypoints from our spawn to theirs). */
  constructor(
    readonly team: TeamId,
    own: THREE.Vector3,
    theirs: THREE.Vector3,
    readonly lanes: THREE.Vector3[][],
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
    this.nextT = 0;
    this.log.length = 0;
    this.laneTarget = this.lanes.map(() => 0);
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
      c = { who: h, pos: h.pos.clone(), vel: new THREE.Vector3(), t: now, seenT: -Infinity, firedT: -Infinity, src: 'callout' };
      this.contacts.set(h.uid, c);
    }
    return c;
  }

  /** A member (or the human) saw `h`; a callout is the human's sighting relayed to the bots. */
  sighting(h: Combatant, now: number, src: 'sight' | 'callout' = 'sight') {
    if (!h.alive) return;
    const c = this.contactFor(h, now);
    c.pos.copy(h.pos);
    c.vel.copy(h.vel);
    c.t = c.seenT = now;
    c.src = src;
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

  // ------------------------------------------------------------------ deaths
  hostileDied(v: Combatant, now: number) {
    this.contacts.delete(v.uid);
    this.pushes.delete(v.uid);
    this.trades.push([now, +1]);
  }

  friendDied(v: Combatant, now: number) {
    this.laneOf.delete(v.uid);
    this.releasePush(v.uid);
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
    const alive = members.filter((m) => m.alive);
    const bots = alive.filter((m) => !m.isPlayer);
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
    this.assignLanes(alive);
    return true;
  }

  /** How far forward the team should be (progress), by stance. */
  desiredProgress() {
    const ef = this.enemyFront, of = this.ownFront;
    if (this.stance === 'push') return ef + 0.05;
    if (this.stance === 'regroup') return Math.max(-0.5, of - 0.1);
    return Math.min(ef - 0.05, of + 0.2);
  }

  /** Keep every lane manned: new bots go to the emptiest lane; an empty lane takes the newest bot of the fullest. */
  private assignLanes(alive: readonly ArenaMember[]) {
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
      let best = 0;
      for (let l = 1; l < n; l++) if (count[l] < count[best] || (count[l] === count[best] && l === 1)) best = l;
      this.laneOf.set(b.uid, best);
      count[best]++;
    }
    const empty = count.indexOf(0);
    if (empty >= 0 && count.reduce((a, c) => a + c, 0) >= n) {
      let full = 0;
      for (let l = 1; l < n; l++) if (count[l] > count[full]) full = l;
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
