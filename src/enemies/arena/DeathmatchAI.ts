import * as THREE from 'three';
import type { Combatant } from '../../combat/Team';
import type { EnemyCtx } from '../Enemy';
import { hostilesOf } from '../Enemy';
import type { TacState } from '../tactics/Squad';
import type { Thinker } from '../tactics/Scheduler';
import type { BarkKind, Voice } from '../tactics/Barks';
import { rand } from '../../core/math';
import { ARENA, type ArenaCtx } from './ArenaCtx';
import { STAMINA, Stamina, WEIGHT, weightOf } from '../../combat/Stamina';
import type { Seen, SenseAgent } from './Sensing';
import type { ArenaContact } from './ArenaDirector';
import { ARENA_SEE, contrastAt, densityOfSightRange, fogRange } from '../../world/Visibility';
import { ARMORY, type BotArm } from '../../entities/weapons/armory';

/*
  The deathmatch brain (7.0): one per arena bot. Two rates, like 5.0, but both fast:
   - decide (scheduled, 0.06–0.15 s; at once when a hostile comes into view or it gets shot): pick the
     target and the state, plan goals. No rays here: every sightline comes from Sensing.
   - act (every frame): aim, fire, strafe, sprint, jump, vault, swing.

  States
   ADVANCE  no contact: sprint up its lane towards the director's front.
   HUNT     a board contact, unseen: sprint to where it was plus a little of its velocity.
   ENGAGE   it sees its target: strafe while firing, keeping to its range band.
   PUSH     its target is hurt (40+ damage from it in 2.5 s, or under 40% health): drop everything and
            rush it, firing on the move, until the kill or 4 s. Runners push anything under 60%.
   BREAK    reloading, losing a trade, or two shooters on it: the nearest spot within 7 m that breaks
            the threat's line of sight, at most 1.6 s, then out the other side.

  Snap + spread: no reaction delay (it turns at rate 30 and fires as soon as the muzzle is within
  20° of the target), but a fresh target starts with a wide bloom that tightens over 0.3 s.

  11.0, the shot it chooses by range (ARENA.ads), like a player:
   - close (under ~12 m): hip fire. Full-speed strafing, jumps, a wider cone (+hipSpread), the bloom.
   - long range: it aims. It plants its feet and raises the rifle to its eye (visible: the body's
     `isAiming`), takes a moment to focus (0.24 s at 13 m, longer further out), then fires short,
     tight bursts while walking its strafe. Hysteresis (11/13 m) keeps it from flicking between the
     two; a push, a break, a jump, a reload or losing sight drops the rifle back to the hip.

  12.0, alive rather than mechanical:
   - Temperament (`persona`, drawn per bot): its own reaction time (~0.17 s, 0.09–0.32), so a squad
     never turns on the same frame; aggression (push thresholds, range band), patience (aimed focus),
     a liking for flanks and for slides. Decide intervals are jittered ±25%.
   - FLANK: a hostile a teammate is fighting right now (the shared spotting board: who saw it, from
     where) and this bot can't see is taken from the side: a point off the spotter's line, the other
     side of a second flanker (a pincer), then the hunt from there.
   - RETREAT: hurt badly by someone it can't see, or outnumbered and hurt: it stops trading, sprints
     out of sight to the nearest friend behind it, and fights again from there (or when cornered).
   - Slides (the player's model): rushing a wounded target, diving into a spot, or crossing open
     ground with a contact close.
*/

export type ArenaState = 'emerge' | 'advance' | 'patrol' | 'hold' | 'hunt' | 'engage' | 'push' | 'break' | 'flank' | 'retreat';

/** 12.0: a bot's temperament (ARENA.persona). */
export interface Persona {
  /** Reaction time (s): from a hostile coming into view, or a hit, to acting on it. */
  react: number;
  /** Push thresholds and range band (1 = the defaults; above is bolder). */
  aggro: number;
  /** Aimed focus time × this. */
  patience: number;
  /** Chance it goes round a spotted contact rather than straight at it; how readily it slides. */
  flank: number;
  slide: number;
}

/** A normal deviate (Box–Muller). */
function gauss(rng: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
}

/** 12.0: draw a temperament. */
export function drawPersona(rng: () => number = Math.random): Persona {
  const P = ARENA.persona;
  const between = (r: [number, number]) => r[0] + (r[1] - r[0]) * rng();
  return {
    react: Math.min(P.reactClamp[1], Math.max(P.reactClamp[0], P.react[0] + P.react[1] * gauss(rng))),
    aggro: between(P.aggro),
    patience: between(P.patience),
    flank: between(P.flank),
    slide: between(P.slide),
  };
}

/**
 * 12.0: where to go round a contact at `c` that a teammate at `from` is fighting: `dist` m from it,
 * `angle` off the line to the spotter, on `side` (+1 / -1). XZ only.
 */
export function flankPoint(c: { x: number; z: number }, from: { x: number; z: number }, side: number, out: THREE.Vector3) {
  const F = ARENA.flank;
  let ux = from.x - c.x, uz = from.z - c.z;
  const l = Math.hypot(ux, uz) || 1;
  ux /= l;
  uz /= l;
  const a = F.angle * side;
  const ca = Math.cos(a), sa = Math.sin(a);
  return out.set(c.x + (ux * ca - uz * sa) * F.dist, 0, c.z + (ux * sa + uz * ca) * F.dist);
}

/** What the brain drives (ArenaGunner / ArenaRunner). */
export interface ArenaBody extends Combatant {
  readonly kind: 'gunner' | 'runner';
  readonly speed: number;
  /** 13.0: the armory gun it carries this life: fire rates, magazine, and the ranges it fights at. */
  readonly arm: BotArm;
  readonly look: { voice: Voice };
  yaw: number;
  crouch: number;
  /** 11.0: rifle raised to the eye for an aimed shot (the body animates it; others can see it). */
  isAiming: boolean;
  tac: TacState;
  readonly airborne: boolean;
  /** 12.0: mid-slide (the body carries it; the brain may still fire). */
  readonly sliding: boolean;
  /** 12.0: start a slide along the way it is running (false if it can't: in the air, too slow, already). */
  slide(): boolean;
  /** Steer towards a floor point at `speed` (graph routing, vault links); returns the XZ distance left. */
  steer(goal: THREE.Vector3, speed: number, ctx: EnemyCtx, dt: number, desired: THREE.Vector3): number;
  face(p: THREE.Vector3, dt: number, rate: number): void;
  /** Take off (false if already in the air). `vault`: clearing a low wall. */
  jump(vy: number, vault: boolean): boolean;
  /** Gunner: one round at `aim` with this spread. 'friend': a teammate in the line (nothing fired). `tag`: stats (11.0). */
  fireRound(ctx: EnemyCtx, aim: THREE.Vector3, spread: number, tag?: { aimed: boolean; range: number }): 'fired' | 'friend' | 'none';
  /** Runner: the blade lands on `victim`. */
  strike(ctx: EnemyCtx, victim: Combatant): void;
  /** Height of a vaultable wall just ahead along (dx, dz), else 0. */
  wallAhead(ctx: EnemyCtx, dx: number, dz: number): number;
  /** Room for the body `dist` m along (dx, dz). */
  open(ctx: EnemyCtx, dx: number, dz: number, dist: number): boolean;
  bark(kind: BarkKind, ctx: EnemyCtx): void;
}

/**
 * 11.0: aim at this range? Over `enter` m starts an aimed shot; once aiming it holds down to `exit`
 * (hysteresis, no flicker at the border); never beyond `maxRange` (it moves up instead). 13.0: the
 * ranges are the gun's (the rifle's are 11.0's); a gun without sights (the shotgun) never aims.
 */
export function wantsAim(d: number, aiming: boolean, arm: BotArm = ARMORY.ar.bot) {
  const a = arm.aim;
  return !!a && d > (aiming ? a.exit : a.enter) && d <= arm.maxRange;
}

/** 11.0: how long an aimed shot takes to settle at range `d` (s): longer further out, capped. */
export function focusFor(d: number, arm: BotArm = ARMORY.ar.bot) {
  const a = ARENA.ads;
  return Math.min(a.focus[1], a.focus[0] + Math.max(0, d - (arm.aim?.enter ?? a.enter)) * a.focusPerM);
}

const _aim = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector2();

export class DeathmatchBrain implements Thinker, SenseAgent {
  nextThink = 0;
  urgent = true;
  state: ArenaState = 'emerge';
  stateT = 0;
  target: Combatant | null = null;
  readonly alert = new Map<number, number>();
  readonly seen = new Map<number, Seen>();
  goal: THREE.Vector3 | null = null;
  /** Where it aims (the target's chest, led by its velocity over the bolt's flight). */
  readonly aimPoint = new THREE.Vector3();
  bloom = ARENA.bloom;
  ammo: number;
  /** > 0: reloading, seconds left. */
  reloadT = 0;
  private burstLeft: number;
  private shotT = 0;
  private strafeDir = 1;
  private flipT = 0;
  private probeT = 0;
  private jumpCd = 0;
  private breakCd = -Infinity;
  /** 20.0, under long-range fire (ARENA.underFire): when it last was, and from whom. */
  private snipedT = -Infinity;
  private snipedBy: Combatant | null = null;
  /** 20.0: in a break taken because of it; its own cooldown (not the 4 s break cooldown). */
  private evading = false;
  private evadeCd = -Infinity;
  private pushUntil = 0;
  private laneIdx = -1;
  private patrol = 1;
  /** Damage it dealt: [time, victim uid, amount]. */
  private dealt: [number, number, number][] = [];
  /** A target acquired and not fired at yet (the sight-to-shot stat is taken at its first round). */
  private reactPending = false;
  private switchT = -Infinity;
  private jitter = 0;
  private swing: 'windup' | 'strike' | 'recover' | null = null;
  private swingT = 0;
  private zig = rand(0.8, 1.4);
  /** 19.0, the cover-hop push: the spot it is sprinting to (out of the target's sight), and when it picks again. */
  private hop: THREE.Vector3 | null = null;
  private hopT = 0;
  private seed = Math.random() * 100;
  /** 11.0: aiming (long range), how long it has focused on the target, and how long it needs. */
  aiming = false;
  focusT = 0;
  private focusNeed: number = ARENA.ads.focus[0];
  private lostT = 0;
  /** When it last lowered the rifle, and on whom (a short interruption keeps the focus). */
  private droppedAt = -Infinity;
  private droppedOn: Combatant | null = null;
  /** 12.0: its temperament. */
  readonly persona: Persona;
  /** 12.0: the hostile it is flanking (or came round on: kills on it count as flank kills), and the flank's side. */
  flankedOn = -1;
  private flankCd = -Infinity;
  /** The hostile it last decided whether to flank (one roll per contact, not one per decide). */
  private flankRolled = -1;
  private flankWill = false;
  /** 12.0: retreat: its health over the last seconds (time, hpFrac), when it may retreat again, why it is. */
  private hpLog: [number, number][] = [];
  private retreatCd = -Infinity;
  private slideCd = -Infinity;

  /** 30.0: its sprint's pool (its gun's weight class), and whether it is mid-sprint. */
  readonly stamina: Stamina;
  private sprintNow = false;

  constructor(readonly self: ArenaBody, persona?: Persona) {
    this.persona = persona ?? drawPersona();
    this.stamina = new Stamina(WEIGHT[weightOf(self.arm.id)]);
    this.ammo = self.arm.mag;
    this.burstLeft = self.arm.burst;
  }

  /**
   * 12.0: act on something new after this bot's own reaction time (stretched or shortened a little
   * each time: `k` scales it, a hit startles faster). Never later than a decide already due.
   */
  private react(now: number, k = 1) {
    this.nextThink = Math.min(this.nextThink, now + this.persona.react * k * rand(0.8, 1.25));
  }

  get reloading() {
    return this.reloadT > 0;
  }

  private visible(h: Combatant | null): boolean {
    return !!h && h.alive && !!this.seen.get(h.uid)?.vis;
  }

  // ------------------------------------------------------------------ events
  onSight(_h: Combatant, now: number) {
    // 12.0: a new face in view is decided after its reaction time (7.0: on the same frame, which made
    // a squad turn as one).
    this.react(now);
  }

  /** Hit by `by`: look at it now, maybe jump out of the line. */
  onHit(ctx: EnemyCtx, by: Combatant | null) {
    if (by && !by.isPlayer && by.team === this.self.team) return;
    if (by) this.alert.set(by.uid, ctx.time);
    this.notedFire(ctx, by, true);
    this.react(ctx.time, 0.6);
    this.jitter = Math.max(this.jitter, 0.015);
    // Aiming, it flinches (the jitter) and holds its shot rather than jumping out of it.
    if (!this.aiming && (this.state === 'engage' || this.state === 'push' || this.state === 'hunt') && Math.random() < ARENA.hitJump) this.tryJump(ctx, false);
  }

  /** A round passed close: aim shakes a little (no pinning in the arena), maybe a jump. */
  onNearMiss(ctx: EnemyCtx, by: Combatant | null) {
    if (by) this.alert.set(by.uid, ctx.time);
    this.notedFire(ctx, by, false);
    this.jitter = Math.max(this.jitter, 0.02);
    if (this.state === 'engage' && !this.aiming && Math.random() < ARENA.hitJump * 0.5) this.tryJump(ctx, false);
  }

  /** Its round hit someone. */
  /**
   * 20.0: a round from far off (a hit, or a near miss if `nearMisses`): remembered, and the next decide
   * breaks for cover from that shooter (or slides out of its line) instead of standing in it.
   */
  private notedFire(ctx: EnemyCtx, by: Combatant | null, hit: boolean) {
    const U = ARENA.underFire;
    if (!U.on || !by || (!hit && !U.nearMisses)) return;
    if (Math.hypot(by.pos.x - this.self.pos.x, by.pos.z - this.self.pos.z) < U.range) return;
    this.snipedT = ctx.time;
    this.snipedBy = by;
    this.urgent = true;
  }

  onDealt(victim: Combatant, dmg: number, now: number) {
    this.dealt.push([now, victim.uid, dmg]);
    if (this.dealt.length > 24) this.dealt.shift();
  }

  died(A: ArenaCtx | undefined) {
    A?.director.releasePush(this.self.uid);
    A?.director.releaseFlank(this.self.uid);
    if (A && this.state === 'retreat') A.stats.retreatDeaths++;
  }

  private dealtTo(uid: number, now: number) {
    let s = 0;
    for (const [t, u, d] of this.dealt) if (u === uid && now - t < ARENA.pushWindow) s += d;
    return s;
  }

  /** 27.0, patrol: the area it is going to (-1: none), when its look round ends, the look point. */
  private hva = -1;
  private dwellUntil = -Infinity;
  private scanA = 0;
  private scan: THREE.Vector3 | null = null;

  private setState(s: ArenaState, ctx: EnemyCtx, A: ArenaCtx) {
    if (s === this.state) return;
    if (this.state === 'push') A.director.releasePush(this.self.uid);
    if (this.state === 'flank') {
      A.director.releaseFlank(this.self.uid);
      if (s === 'engage') A.stats.flankEngage++;
      else this.flankedOn = -1;
      this.flankCd = ctx.time + ARENA.flank.cooldown;
    }
    if (this.state === 'retreat') {
      this.retreatCd = ctx.time + ARENA.retreat.cooldown;
      if (this.self.alive) A.stats.retreatLived++;
    }
    if (this.state === 'break' && s !== 'break') this.evading = false;
    if (this.state === 'patrol') {
      A.director.patrolRelease(this.self.uid);
      this.hva = -1;
    }
    if (this.state === 'hold') {
      A.director.releaseHold(this.self.uid);
      this.holdAt = null;
    }
    if (s === 'engage' && STAMINA.on) A.stats.staminaAtEngage.push(Math.round(this.stamina.value));
    this.state = s;
    this.stateT = 0;
    this.goal = null;
    const t = this.self.tac;
    t.action = s;
    t.phase = '';
    t.actionT = t.phaseT = 0;
    if (s === 'push') {
      A.stats.pushes++;
      this.self.bark('go', ctx);
    } else if (s === 'break') {
      A.stats.breaks++;
      if (this.evading) A.stats.evades++;
      this.breakCd = ctx.time + ARENA.breakCooldown;
      if (this.reloading) this.self.bark('reload', ctx);
    }
  }

  private tryJump(ctx: EnemyCtx, vault: boolean, vy = ARENA.jumpV) {
    if (this.self.airborne || this.self.sliding || (!vault && (this.jumpCd > 0 || this.swing))) return false;
    if (!this.self.jump(vy, vault)) return false;
    if (!vault) this.jumpCd = ARENA.jumpCooldown;
    const A = ctx.arena;
    if (A) {
      const pb = (A.stats.perBot[this.self.name] ??= { jumps: 0, vaults: 0, team: this.self.team });
      if (vault) {
        A.stats.vaults++;
        pb.vaults++;
      } else {
        A.stats.jumps++;
        pb.jumps++;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ decide
  decide(ctx: EnemyCtx) {
    const A = ctx.arena;
    if (!A) return;
    const me = this.self;
    const now = ctx.time;
    if (this.state === 'emerge' && this.stateT < ARENA.emerge) {
      this.nextThink = now + ARENA.emerge - this.stateT;
      return;
    }
    const dir = A.director;
    // ---- Target: the highest threat among those it sees and the board's fresh contacts.
    let best: Combatant | null = null, bs = -Infinity, cur = -Infinity, bestShotMe = false, bestVis = false;
    me.facing(_f);
    for (const h of hostilesOf(ctx)) {
      if (!h.alive) continue;
      const vis = !!this.seen.get(h.uid)?.vis;
      const c = dir.contacts.get(h.uid);
      const age = c ? now - c.t : Infinity;
      if (!vis && age > ARENA.contactTtl) continue;
      const p = vis ? h.pos : c!.pos;
      const d = Math.max(3, Math.hypot(p.x - me.pos.x, p.z - me.pos.z));
      // 27.0, patrol maps: the radar reaches patrol.radar m; a fight further off is left to those near
      // it (unless it is shooting at this bot), so a team doesn't all converge on one fight.
      if (!vis && dir.patrol && d > ARENA.patrol.radar && now - (this.alert.get(h.uid) ?? -Infinity) >= 1.5) continue;
      // 29.0: on the last stand (and not on the clock) the radar shrinks: nobody wanders off alone.
      if (!vis && holding(dir) && d > ARENA.lastStand.radar && now - (this.alert.get(h.uid) ?? -Infinity) >= 1.5) continue;
      let s = 12 / d;
      if (vis) {
        s += 1.5;
        // Facing me (within 25°): it is aiming my way.
        h.facing(_f);
        if ((_f.x * (me.pos.x - h.pos.x) + _f.y * (me.pos.z - h.pos.z)) / d > 0.9) s += 2;
        if (h.hpFrac < 0.4) s += 1;
      } else s -= age * 0.3;
      const shotMe = now - (this.alert.get(h.uid) ?? -Infinity) < 1.5;
      if (shotMe) s += 3;
      if (h === this.target) cur = s;
      if (s > bs) {
        bs = s;
        best = h;
        bestShotMe = shotMe;
        bestVis = vis;
      }
    }
    // Shoot what you can see: a visible threat replaces one out of view at once. Between two in
    // view it takes a clearly bigger threat (15%), at most every 0.4 s unless the new one is
    // shooting at us — no flicker between equals.
    const lost = !this.target || !this.target.alive || cur === -Infinity || (!this.visible(this.target) && bestVis);
    if (best !== this.target && (lost || (bs > cur * ARENA.switchMargin && (bestShotMe || now - this.switchT > 0.4)))) {
      const had = this.visible(this.target);
      if (this.target && best) {
        A.stats.switches++;
        A.stats.switchWhy[lost ? 'lost' : bestShotMe ? 'shotAt' : 'threat']++;
      }
      this.target = best;
      this.switchT = now;
      // A new face to settle on: an aimed shot takes its focus again.
      this.focusT = 0;
      // Snap + spread: a fresh target blooms; switching from one in view keeps part of the bloom.
      this.bloom = had ? Math.max(this.bloom * ARENA.switchBloom, ARENA.bloom * 0.5) : ARENA.bloom;
      // Sight-to-shot measures the decision, not the magazine: a pick made mid-reload isn't timed.
      this.reactPending = !!best && !this.reloading;
    }
    if (this.target?.uid !== this.flankedOn && this.state !== 'flank') this.flankedOn = -1;
    const T = this.target;
    const tv = T !== null && this.visible(T);
    const contact = T ? dir.contacts.get(T.uid) ?? null : null;
    const dT = T ? Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) : Infinity;

    // ---- State.
    const gunner = me.kind === 'gunner';
    const attackers = [...this.alert.values()].filter((t) => now - t < 1.5).length;
    this.hpLog.push([now, me.hpFrac]);
    while (this.hpLog.length && now - this.hpLog[0][0] > ARENA.retreat.window) this.hpLog.shift();
    let next: ArenaState;
    let retreatWhy: 'unseen' | 'outnumbered' | null = null;
    if (this.state === 'retreat' && this.keepRetreating(ctx, A, T, tv, dT, contact)) next = 'retreat';
    else if ((retreatWhy = this.retreatWhy(ctx, now, T, tv, dT))) next = 'retreat';
    else if (this.state === 'break' && this.stateT < ARENA.breakMax && (this.reloading || this.stateT < 0.5)) next = 'break';
    // Reloading is done on the move unless someone is shooting at it.
    else if (gunner && tv && now > this.breakCd && ((this.reloading && attackers >= 1) || (me.hpFrac < ARENA.breakHp && T.hpFrac > me.hpFrac) || attackers >= 2)) next = 'break';
    // 20.0: shot at from far off, and not winning that duel (it isn't its target, or its own aimed
    // shot isn't nearly ready): out of the line now (ARENA.underFire), not a step later.
    else if (gunner && this.evadeNow(now, T, dT)) {
      next = 'break';
      this.evading = true;
      this.evadeCd = now + ARENA.underFire.cooldown;
    }
    else if (T && (tv || (contact && now - contact.t < ARENA.contactTtl))) {
      // 12.0: a bold bot pushes sooner (higher health, less damage dealt), a careful one later.
      const ag = this.persona.aggro;
      // 29.0: on the last stand only a nearly dead target is worth leaving the group for.
      const LS = dir.lastStand && ARENA.lastStand.on;
      const HOLD = holding(dir);
      const hurt = HOLD ? T.hpFrac <= ARENA.lastStand.pushHp : T.hpFrac <= (gunner ? ARENA.pushHp * ag : ARENA.runnerPushHp) || this.dealtTo(T.uid, now) >= ARENA.pushDamage / ag || (!gunner && T.reloading);
      let pushing = this.state === 'push' && now < this.pushUntil;
      // A blade has one way to fight, close in; a claimed rush on someone hurt is a push (it counts,
      // it barks, two at most). A gunner pushes only what it can see.
      // 11.0: a gunner rushes only what is within pushRange; further out it keeps aiming.
      const reach = !gunner || dT <= me.arm.pushRange;
      if (!pushing && hurt && reach && (tv || !gunner) && dir.claimPush(me.uid, T.uid, now, !gunner)) {
        this.pushUntil = now + ARENA.pushMax;
        pushing = true;
      }
      // 12.0: out of its sight but in a teammate's (the shared spotting): go round.
      const flanking = !pushing && !tv && !!contact && !LS && this.wantsFlank(ctx, A, T, contact, now);
      // 32.0: one of a crowd fighting from one spot goes round, shooting as it goes (ARENA.space).
      const going = !pushing && tv && !LS && this.crowdFlank(ctx, A, T, now);
      next = pushing ? 'push' : going ? 'flank' : tv ? 'engage' : flanking ? 'flank' : 'hunt';
    } else next = holding(A.director) ? 'hold' : A.director.patrol ? 'patrol' : 'advance';
    this.setState(next, ctx, A);
    if (retreatWhy) {
      A.stats.retreats++;
      A.stats.retreatWhy[retreatWhy]++;
      A.director.releasePush(me.uid);
    }

    // ---- Goals.
    if (next === 'retreat' && !this.goal) {
      // First out of its line of sight (the nearest spot that breaks it, as a BREAK finds), then to a friend.
      const cover = T && this.visible(T) ? this.breakSpot(ctx, A, T) : null;
      this.retreatLeg = cover ? 'cover' : 'regroup';
      this.goal = cover ?? this.regroupGoal(ctx, A, T, contact);
    }
    else if (next === 'flank' && this.flankGoal) {
      this.goal = this.flankGoal;
      this.flankGoal = null;
    } else if (next === 'break' && !this.goal && (this.evading && this.snipedBy ? this.snipedBy : T)) this.goal = this.breakSpot(ctx, A, (this.evading && this.snipedBy ? this.snipedBy : T)!);
    else if (next === 'hunt' && contact) {
      this.goal = this.laneGoal(ctx, A, contact.pos) ?? this.approach(ctx, A, T!, contact.pos) ?? _v.copy(contact.pos).addScaledVector(contact.vel, ARENA.huntLead).clone();
      if (!this.laneTo && !this.approaching) this.goal.y = contact.pos.y;
    } else if (next === 'hunt' && T && !contact) this.goal = T.pos.clone();
    else if (next === 'advance') this.planLane(ctx, A);
    else if (next === 'patrol') this.planPatrol(ctx, A);
    else if (next === 'hold') this.planHold(ctx, A);

    // A runner closing in leaps the last metres now and then.
    if (!gunner && tv && dT > 4 && dT < 9 && Math.random() < 0.08) this.tryJump(ctx, false);

    this.considerSlide(ctx, A, next, T, dT, now);

    const iv = tv && dT < ARENA.decide.closeDist ? ARENA.decide.close : T ? ARENA.decide.far : ARENA.decide.calm;
    // 12.0: wider jitter (7.0: ±15%), so bots that saw the same thing drift apart in time.
    const J = ARENA.persona.jitter;
    this.nextThink = now + iv * (1 - J + 2 * J * Math.random());
  }

  // ------------------------------------------------------------------ 12.0: retreat, flank, slide
  /** Why it should break off and regroup now (see ARENA.retreat), or null. */
  private retreatWhy(ctx: EnemyCtx, now: number, T: Combatant | null, tv: boolean, dT: number): 'unseen' | 'outnumbered' | null {
    const R = ARENA.retreat;
    const me = this.self;
    // (Already breaking off: keepRetreating says when that ends, and the cooldown starts then.)
    if (!R.on || now < this.retreatCd || this.state === 'emerge' || this.state === 'retreat') return null;
    // Finishing a kill beats running: its target in sight, close and nearly down.
    if (tv && T && T.hpFrac < 0.25 && dT < 15) return null;
    let peak = me.hpFrac;
    for (const [, h] of this.hpLog) if (h > peak) peak = h;
    if (peak - me.hpFrac >= R.unseenDmg) {
      let seenShooter = false;
      for (const [uid, t] of this.alert) if (now - t < R.window && this.seen.get(uid)?.vis) seenShooter = true;
      if (!seenShooter) return 'unseen';
    }
    if (me.hpFrac < R.outHp) {
      let vis = 0;
      for (const h of hostilesOf(ctx)) if (h.alive && this.seen.get(h.uid)?.vis) vis++;
      if (vis >= R.outSeen) {
        let fr = 0;
        for (const f of ctx.friends ?? []) if (f !== me && f.alive && Math.hypot(f.pos.x - me.pos.x, f.pos.z - me.pos.z) < R.friendR) fr++;
        if (vis - fr >= R.outnumbered) return 'outnumbered';
      }
    }
    return null;
  }

  /** Who it is falling back to (a friend behind it), if anyone; and which leg of the retreat it is on. */
  private regroupWith: Combatant | null = null;
  private retreatLeg: 'cover' | 'regroup' = 'regroup';

  /** Still breaking off: not cornered, not with its friend yet, not out of time. */
  private keepRetreating(ctx: EnemyCtx, A: ArenaCtx, T: Combatant | null, tv: boolean, dT: number, contact: ArenaContact | null) {
    const R = ARENA.retreat;
    const me = this.self;
    // Out of sight at the first spot: now back to a friend.
    if (!this.goal && this.retreatLeg === 'cover') {
      this.retreatLeg = 'regroup';
      this.goal = this.regroupGoal(ctx, A, T, contact);
    }
    if (this.stateT > R.maxT || !this.goal) return false;
    if (tv && T && dT < R.corner) return false;
    const w = this.retreatLeg === 'regroup' ? this.regroupWith : null;
    if (w && (!w.alive || Math.hypot(w.pos.x - me.pos.x, w.pos.z - me.pos.z) < R.joinR)) return false;
    // Follow a friend who moves.
    if (w && this.goal) this.goal.copy(w.pos);
    return true;
  }

  /**
   * Where to fall back to: the nearest friend further from the threat than it is (not one already at
   * its side), else two waypoints back down its own lane.
   */
  private regroupGoal(ctx: EnemyCtx, A: ArenaCtx, T: Combatant | null, contact: ArenaContact | null): THREE.Vector3 | null {
    const R = ARENA.retreat;
    const me = this.self;
    let threat: THREE.Vector3 | null = T ? (this.visible(T) ? T.pos : (contact?.pos ?? T.pos)) : null;
    if (!threat) {
      // Shot from nowhere: whoever alerted it last, as the board has them.
      let lt = -Infinity;
      for (const [uid, t] of this.alert) {
        const c = A.director.contacts.get(uid);
        if (c && t > lt) {
          lt = t;
          threat = c.pos;
        }
      }
    }
    const myT = threat ? Math.hypot(threat.x - me.pos.x, threat.z - me.pos.z) : 0;
    let best: Combatant | null = null, bs = Infinity;
    for (const f of ctx.friends ?? []) {
      if (f === me || !f.alive) continue;
      const d = Math.hypot(f.pos.x - me.pos.x, f.pos.z - me.pos.z);
      if (d < R.joinR) continue;
      if (threat && Math.hypot(f.pos.x - threat.x, f.pos.z - threat.z) < myT + 2) continue;
      if (d < bs) {
        bs = d;
        best = f;
      }
    }
    this.regroupWith = best;
    if (best) return best.pos.clone();
    const L = ctx.lanes;
    if (!L || !L.length) return null;
    const W = L[A.director.laneFor(me.uid, me.pos)];
    let bi = 0, bd = Infinity;
    W.forEach((w, i) => {
      const d = Math.hypot(w.x - me.pos.x, w.z - me.pos.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const w = W[Math.max(0, bi - 2)];
    return new THREE.Vector3(w.x, w.y, w.z);
  }

  /** The flank goal decided this decide (set once the state is 'flank'). */
  private flankGoal: THREE.Vector3 | null = null;

  /** Go round a contact a teammate is fighting (ARENA.flank)? Claims the flank and plans its point. */
  private wantsFlank(ctx: EnemyCtx, A: ArenaCtx, T: Combatant, c: ArenaContact, now: number) {
    const F = ARENA.flank;
    const me = this.self;
    if (this.state === 'flank') return this.stateT < F.maxT && !!this.goal && now - c.t < ARENA.contactTtl;
    if (now < this.flankCd || c.src !== 'sight' || now - c.seenT > F.fresh || c.by < 0 || c.by === me.uid) return false;
    if (Math.hypot(c.from.x - me.pos.x, c.from.z - me.pos.z) < F.spotterGap) return false;
    const d = Math.hypot(c.pos.x - me.pos.x, c.pos.z - me.pos.z);
    if (d < F.min || d > F.max) return false;
    // One roll per contact: its temperament decides whether it goes round or straight in.
    if (this.flankRolled !== T.uid) {
      this.flankRolled = T.uid;
      this.flankWill = Math.random() < this.persona.flank;
    }
    if (!this.flankWill) return false;
    const pa = flankPoint(c.pos, c.from, 1, new THREE.Vector3());
    const pb = flankPoint(c.pos, c.from, -1, new THREE.Vector3());
    const prefer = Math.hypot(pa.x - me.pos.x, pa.z - me.pos.z) <= Math.hypot(pb.x - me.pos.x, pb.z - me.pos.z) ? 1 : -1;
    const side = A.director.claimFlank(me.uid, T.uid, now, prefer);
    if (!side) return false;
    const goal = this.snapGoal(ctx, side > 0 ? pa : pb, c.pos.y, ARENA.vantage.on);
    if (!goal) {
      A.director.releaseFlank(me.uid);
      return false;
    }
    this.flankGoal = goal;
    this.flankedOn = T.uid;
    A.stats.flanks++;
    if (goal.y > c.pos.y + 2.5) A.stats.flankHigh++;
    return true;
  }

  /**
   * 32.0, the crowd flank (ARENA.space): it sees its target, `crowd`+ teammates are within `crowdR` m,
   * it is the group's highest uid and has `crowdHp` of its health or more: it claims a flank on the target and goes round to ARENA.flank's
   * point off the group's line (the group's centre as the spotter). Already going: until it gets there,
   * the claim times out, or ARENA.flank.maxT.
   */
  private crowdFlank(ctx: EnemyCtx, A: ArenaCtx, T: Combatant, now: number) {
    const S = ARENA.space;
    const F = ARENA.flank;
    if (this.state === 'flank' && this.crowdGoing) return this.stateT < F.maxT && !!this.goal;
    this.crowdGoing = false;
    const me = this.self;
    // A hurt bot stays with its friends (ARENA.retreat's company); only a healthy one leaves the group.
    if (!S.on || !ctx.friends || now < this.crowdCd || me.hpFrac < S.crowdHp) return false;
    let n = 0, cx = me.pos.x, cz = me.pos.z, top = true;
    for (const f of ctx.friends) {
      if (f === me || !f.alive || Math.hypot(f.pos.x - me.pos.x, f.pos.z - me.pos.z) >= S.crowdR) continue;
      n++;
      cx += f.pos.x;
      cz += f.pos.z;
      if (f.uid > me.uid && !f.isPlayer) top = false;
    }
    if (n < S.crowd || !top) return false;
    const d = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z);
    if (d < F.min || d > F.max) return false;
    const from = { x: cx / (n + 1), z: cz / (n + 1) };
    const pa = flankPoint(T.pos, from, 1, new THREE.Vector3());
    const pb = flankPoint(T.pos, from, -1, new THREE.Vector3());
    const prefer = Math.hypot(pa.x - me.pos.x, pa.z - me.pos.z) <= Math.hypot(pb.x - me.pos.x, pb.z - me.pos.z) ? 1 : -1;
    const side = A.director.claimFlank(me.uid, T.uid, now, prefer);
    if (!side) return false;
    const goal = this.snapGoal(ctx, side > 0 ? pa : pb, T.pos.y, ARENA.vantage.on);
    if (!goal) {
      A.director.releaseFlank(me.uid);
      return false;
    }
    this.flankGoal = goal;
    this.flankedOn = T.uid;
    this.crowdGoing = true;
    this.crowdCd = now + S.crowdCd;
    A.stats.crowdFlanks++;
    return true;
  }
  /** 32.0: on a crowd flank; when it may take another. */
  private crowdGoing = false;
  private crowdCd = -Infinity;

  /**
   * The nav node nearest `p` (XZ, within 8 m) on the level `y`. 14.0, `high`: a floor up to
   * ARENA.vantage.up above it also qualifies, each metre of height counting as `perM` m nearer (a
   * flank onto a landing or a roof edge over the contact rather than round it on the street).
   */
  private snapGoal(ctx: EnemyCtx, p: THREE.Vector3, y: number, high = false): THREE.Vector3 | null {
    const V = ARENA.vantage;
    let best: THREE.Vector3 | null = null, bs = Infinity;
    for (const n of ctx.nav.nodes) {
      const fy = n.y - 1;
      const up = fy - y;
      if (up < -2.5 || up > (high ? V.up : 2.5)) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d >= (high ? V.reach : 8)) continue;
      const s = d - (high ? Math.max(0, up) * V.perM : 0);
      if (s >= bs || ctx.avoid?.(n)) continue;
      bs = s;
      best = n;
    }
    return best ? new THREE.Vector3(best.x, best.y - 1, best.z) : null;
  }

  /** Slide (ARENA.slide): into a wounded target, into a spot, or across open ground near a contact. */
  private considerSlide(ctx: EnemyCtx, A: ArenaCtx, next: ArenaState, T: Combatant | null, dT: number, now: number) {
    const S = ARENA.slide;
    const me = this.self;
    if (!S.on || now < this.slideCd || me.airborne || me.sliding || this.aiming || this.swing) return;
    const hs = Math.hypot(me.vel.x, me.vel.z);
    if (hs < me.speed * ARENA.run) return;
    const dx = me.vel.x / hs, dz = me.vel.z / hs;
    const toward = (p: THREE.Vector3, d: number) => ((p.x - me.pos.x) * dx + (p.z - me.pos.z) * dz) / Math.max(d, 1e-3) > 0.8;
    // 21.0: the gun sets the liking too (a shotgun dives into range; it slides while engaging, not only pushing).
    const k = this.persona.slide * me.arm.agility.slide;
    const closing = next === 'push' || (next === 'engage' && me.arm.agility.slide > 1.5);
    let why: 'push' | 'dive' | 'exposed' | 'evade' | null = null;
    if (closing && T && dT >= S.push[0] && dT <= S.push[1] && toward(T.pos, dT) && Math.random() < 0.6 * k) why = 'push';
    else if (next === 'break' && this.evading && !this.goal && Math.random() < ARENA.underFire.slide) why = 'evade';
    else if ((next === 'break' || next === 'retreat') && this.goal) {
      const d = Math.hypot(this.goal.x - me.pos.x, this.goal.z - me.pos.z);
      if (d >= S.dive[0] && d <= S.dive[1] && toward(this.goal, d) && Math.random() < 0.8 * k) why = 'dive';
    } else if ((next === 'hunt' || next === 'flank' || next === 'advance' || next === 'patrol') && Math.random() < 0.06 * k) {
      for (const c of A.director.contacts.values()) {
        if (now - c.seenT < 1 && Math.hypot(c.pos.x - me.pos.x, c.pos.z - me.pos.z) < S.exposed) {
          why = 'exposed';
          break;
        }
      }
    }
    if (!why || !me.open(ctx, dx, dz, S.open)) return;
    // 30.0: a slide comes only out of a sprint, and costs breath.
    if (!this.sprintNow || !this.stamina.slide()) return;
    if (!me.slide()) return;
    A.stats.slides++;
    A.stats.slideWhy[why]++;
    this.slideCd = now + S.cooldown / k;
  }

  /** The current hunt goal is a lane waypoint (not the contact itself). */
  private laneTo = false;

  /**
   * Lane discipline (8.0): a far contact is approached along the bot's own lane, to the waypoint
   * level with it (by progress along the base-to-base axis); within ARENA.laneLeave of it, or once
   * at that waypoint, the bot crosses over to it directly. A raised waypoint (a catwalk on the lane)
   * is taken at any distance: an unseen contact is hunted from the high ground when the lane has it.
   * Null: go straight at the contact.
   */
  private laneGoal(ctx: EnemyCtx, A: ArenaCtx, at: THREE.Vector3): THREE.Vector3 | null {
    this.laneTo = false;
    const L = ctx.lanes;
    const me = this.self;
    if (!L || !L.length) return null;
    const far = Math.hypot(at.x - me.pos.x, at.z - me.pos.z) >= ARENA.laneLeave;
    const W = L[A.director.laneFor(me.uid, me.pos)];
    const pc = A.director.progress(at);
    let best = 0, bd = Infinity;
    W.forEach((w, i) => {
      const d = Math.abs(A.director.progress(w) - pc);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const w = W[best];
    if (!far && w.y <= 1) return null;
    if (Math.hypot(w.x - me.pos.x, w.z - me.pos.z) < 5 && Math.abs(w.y - me.pos.y) < 1.5) return null;
    this.laneTo = true;
    const off = w.y > 0.5 ? 0.4 : 1.2;
    return new THREE.Vector3(w.x + Math.cos(this.seed) * off, w.y, w.z + Math.sin(this.seed) * off);
  }

  /**
   * 32.0, spread: the 2nd, 3rd … bot hunting one contact comes at it from the side (ARENA.space), not in
   * its teammates' footsteps: a point `approach` m off the line to it, alternating sides, on the nav
   * (the nearest node on that level within 8 m). Null: straight in (the first, close, or nowhere to go).
   */
  private approach(ctx: EnemyCtx, A: ArenaCtx, T: Combatant, at: THREE.Vector3): THREE.Vector3 | null {
    this.approaching = false;
    const S = ARENA.space;
    if (!S.on) return null;
    const me = this.self;
    const dx = at.x - me.pos.x, dz = at.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    const k = A.director.huntSlot(me.uid, T.uid, ctx.time);
    if (k === 0 || d < S.direct) return null;
    const side = k % 2 ? 1 : -1;
    const off = S.approach * Math.ceil(k / 2);
    const px = at.x + (-dz / d) * side * off, pz = at.z + (dx / d) * side * off;
    const nodes = ctx.nav.nodes;
    let best = -1, bd = 64;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (Math.abs(n.y - at.y) > 2) continue;
      const q = (n.x - px) ** 2 + (n.z - pz) ** 2;
      if (q < bd) {
        bd = q;
        best = i;
      }
    }
    if (best < 0) return null;
    const n = nodes[best];
    if (Math.hypot(n.x - me.pos.x, n.z - me.pos.z) < S.arrive) return null;
    this.approaching = true;
    A.stats.approaches++;
    return new THREE.Vector3(n.x, n.y, n.z);
  }
  /** 32.0: the hunt's goal is a side approach (keep its own height). */
  private approaching = false;

  /**
   * 27.0, patrol/search (no bases: TdmData.pads): the team's radar first (the freshest contact, straight
   * at it); else the area the director gave it (ArenaDirector.patrolPick), looked round for a moment on
   * arrival, then the next.
   */
  /**
   * 29.0, HOLD (the team's last stand): a cover spot near the team's centre, claimed, re-picked every
   * lastStand.every s or when the centre has moved away; there, crouched, facing the freshest threat
   * (or out from the centre). With no spot near, a place on a ring round the centre.
   */
  private planHold(ctx: EnemyCtx, A: ArenaCtx) {
    const L = ARENA.lastStand;
    const me = this.self;
    const now = ctx.time;
    const dir = A.director;
    const c = dir.freshest(me.pos, now);
    const moved = this.holdAt && Math.hypot(this.holdAt.x - dir.anchor.x, this.holdAt.z - dir.anchor.z) > L.near + L.drift;
    if (!this.holdAt || moved || now - this.holdT > L.every) {
      this.holdT = now;
      const spot = dir.holdSpot(me.uid, ctx.coverPoints, L.near, this.seed);
      this.holdAt = spot
        ? spot.clone()
        : new THREE.Vector3(dir.anchor.x + Math.cos(this.seed * 3) * 3, dir.anchor.y, dir.anchor.z + Math.sin(this.seed * 3) * 3);
    }
    const there = Math.hypot(this.holdAt.x - me.pos.x, this.holdAt.z - me.pos.z) < 1.2;
    this.goal = there ? null : this.holdAt.clone();
    if (there && !this.held) A.stats.holdArrive++;
    this.held = there;
    // Watching: the freshest threat, else outward from the team's centre.
    const lookAt = c?.pos ?? _v.set(me.pos.x * 2 - dir.anchor.x, me.pos.y, me.pos.z * 2 - dir.anchor.z);
    (this.scan ??= new THREE.Vector3()).set(lookAt.x, me.pos.y + 1.5, lookAt.z);
  }

  /** 29.0: the hold spot, when it was picked, whether it is there. */
  private holdAt: THREE.Vector3 | null = null;
  private holdT = -Infinity;
  private held = false;

  private planPatrol(ctx: EnemyCtx, A: ArenaCtx) {
    const me = this.self;
    const now = ctx.time;
    const c = A.director.freshest(me.pos, now);
    if (c && Math.hypot(c.pos.x - me.pos.x, c.pos.z - me.pos.z) <= ARENA.patrol.radar) {
      this.goal = c.pos.clone();
      return;
    }
    if (now < this.dwellUntil) {
      this.goal = null;
      // Looking round: the look point swings either way at each decide (faced smoothly in the move).
      this.scanA += (this.seed > Math.PI ? 1 : -1) * 0.8;
      (this.scan ??= new THREE.Vector3()).set(me.pos.x + Math.sin(this.scanA) * 10, me.pos.y + 1.5, me.pos.z + Math.cos(this.scanA) * 10);
      return;
    }
    this.scan = null;
    let h = this.hva >= 0 ? A.director.hvas[this.hva] : null;
    // Arrived: as near as the director counts an area looked at (the move stops 2 m short of its goal).
    if (h && Math.hypot(h.x - me.pos.x, h.z - me.pos.z) < ARENA.patrol.near && Math.abs(h.y - me.pos.y) < 1.5) {
      A.director.visited(this.hva, now);
      A.stats.patrolArrive++;
      const [d0, d1] = ARENA.patrol.dwell;
      this.dwellUntil = now + d0 + Math.random() * (d1 - d0);
      this.scanA = me.yaw;
      this.hva = -1;
      this.goal = null;
      return;
    }
    if (!h) {
      this.hva = A.director.patrolPick(me.uid, me.pos, now);
      h = this.hva >= 0 ? A.director.hvas[this.hva] : null;
      if (!h) return;
    }
    this.goal = new THREE.Vector3(h.x + Math.cos(this.seed) * 0.8, h.y, h.z + Math.sin(this.seed) * 0.8);
  }

  /** No contact: walk the lane towards the director's front, then patrol a step either side of it. */
  private planLane(ctx: EnemyCtx, A: ArenaCtx) {
    const L = ctx.lanes;
    const me = this.self;
    // The freshest contact on the board beats the lane (the team's radar). 18.0: on a strict lane (the
    // map's centre of gravity: the maglev's aisle) it is closed on along the lane, as a far hunt is.
    const c = A.director.freshest(me.pos, ctx.time);
    if (c) {
      const strict = !!L && L.length > 0 && A.director.isStrict(A.director.laneFor(me.uid, me.pos));
      this.goal = (strict ? this.laneGoal(ctx, A, c.pos) : null) ?? c.pos.clone();
      return;
    }
    if (!L || !L.length) return;
    const lane = A.director.laneFor(me.uid, me.pos);
    const W = L[lane];
    const want = A.director.laneTarget[lane] ?? 0;
    if (this.laneIdx < 0 || this.laneIdx >= W.length) {
      let bi = 0, bd = Infinity;
      W.forEach((w, i) => {
        const d = Math.hypot(w.x - me.pos.x, w.z - me.pos.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      this.laneIdx = bi;
    }
    const at = W[this.laneIdx];
    // Arrived means on its level too: a catwalk waypoint isn't reached from the floor below it.
    const arrived = Math.hypot(at.x - me.pos.x, at.z - me.pos.z) < 3 && Math.abs(at.y - me.pos.y) < 1.5;
    if (arrived) {
      if (this.laneIdx < want) this.laneIdx++;
      else if (this.laneIdx > want) this.laneIdx--;
      else {
        // At the front with nobody there: keep moving, a waypoint either side of it.
        this.laneIdx = Math.max(0, Math.min(W.length - 1, want + this.patrol));
        this.patrol = -this.patrol;
      }
    }
    const w = W[this.laneIdx];
    // Spread a lane so it isn't walked single file (less on a raised deck: it's 3 m wide).
    const off = w.y > 0.5 ? 0.4 : 1.6;
    this.goal = new THREE.Vector3(w.x + Math.cos(this.seed) * off, w.y, w.z + Math.sin(this.seed) * off);
  }

  /**
   * 19.0, the cover-hop push (ARENA.coverPush, a map's profile turns it on): a close-range gun pushing
   * a target it sees more than `minDist` m away keeps a hop: a cover spot within `hop` m of it, at
   * least `gain` m nearer the target, that the target can't see (a wall or a trunk: one ray; or the
   * undergrowth: the concealment field, no ray). Re-picked every `every` s or on arrival. False: no
   * spot (or not this gun, or close enough): it rushes straight in.
   */
  private hopping(ctx: EnemyCtx, A: ArenaCtx, T: Combatant, now: number): boolean {
    const C = ARENA.coverPush;
    const me = this.self;
    // 21.0: a gun can hop on every map (the shotgun: BotArm.agility.hop).
    if (!(C.on && C.arms.includes(me.arm.id)) && !me.arm.agility.hop) return false;
    const dT = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z);
    if (dT < C.minDist) {
      this.hop = null;
      return false;
    }
    // Picked (or found nothing) a moment ago: keep that answer (the scan and its rays are rationed).
    if (now - this.hopT < C.every) return this.hop !== null;
    this.hopT = now;
    this.hop = null;
    const cands: [number, THREE.Vector3][] = [];
    for (const p of ctx.coverPoints) {
      const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
      if (d < 1.5 || d > C.hop || Math.abs(p.y - me.pos.y) > 1.2) continue;
      const toT = Math.hypot(p.x - T.pos.x, p.z - T.pos.z);
      if (toT > dT - C.gain || toT < 3) continue;
      // Nearer the target is better; a long detour sideways is worse.
      cands.push([toT + d * 0.5, p]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const eye = _v.set(T.pos.x, T.pos.y + 1.6, T.pos.z);
    for (let k = 0; k < Math.min(2, cands.length); k++) {
      const p = cands[k][1];
      const chest = new THREE.Vector3(p.x, p.y + 1.1, p.z);
      if (ctx.concealment && ctx.concealment(eye, chest) < 0.35) {
        this.hop = p.clone();
        return true;
      }
      if (!A.sched.canAfford(1)) break;
      A.sched.spend(1);
      if (!ctx.col.lineOfSight(eye, chest)) {
        this.hop = p.clone();
        return true;
      }
    }
    return false;
  }

  /** 20.0: break from a long-range shooter now? (see the decide: not while winning that duel). */
  private evadeNow(now: number, T: Combatant | null, dT: number): boolean {
    const U = ARENA.underFire;
    if (!U.on || now - this.snipedT > U.window || now < this.evadeCd || this.state === 'break' || this.state === 'push' || this.state === 'retreat') return false;
    const by = this.snipedBy;
    if (!by || !by.alive) return false;
    // Its own target, close or nearly in its sights: it fights instead.
    if (T === by && (dT < U.range || (this.aiming && this.focusT >= this.focusNeed * U.duel))) return false;
    return true;
  }

  /** The nearest spot within 7 m the threat can't see (one ray each, two tries), else null (it strafes out). */
  private breakSpot(ctx: EnemyCtx, A: ArenaCtx, T: Combatant): THREE.Vector3 | null {
    const me = this.self;
    const cands: [number, THREE.Vector3][] = [];
    for (const p of ctx.coverPoints) {
      const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
      if (d > ARENA.breakRadius || Math.abs(p.y - me.pos.y) > 1) continue;
      const dt = Math.hypot(p.x - T.pos.x, p.z - T.pos.z);
      if (dt < 5) continue;
      // Away from the threat is better than towards it.
      const away = ((me.pos.x - T.pos.x) * (p.x - me.pos.x) + (me.pos.z - T.pos.z) * (p.z - me.pos.z)) / Math.max(1, dt);
      cands.push([d - away * 0.3, p]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const eye = new THREE.Vector3(T.pos.x, T.pos.y + 1.6, T.pos.z);
    for (let k = 0; k < Math.min(2, cands.length); k++) {
      if (!A.sched.canAfford(1)) break;
      A.sched.spend(1);
      const p = cands[k][1];
      if (!ctx.col.lineOfSight(eye, _v.set(p.x, p.y + 1.0, p.z))) return p.clone();
    }
    return null;
  }

  /**
   * 30.0: why it would sprint now (or null: it walks). Retreating or diving for cover; flanking;
   * pushing with a close gun (SMG, shotgun, pistol), or closing to range with one; moving across
   * ground a hostile can see (in its own view, or seen by the team just now, near).
   */
  private sprintReason(A: ArenaCtx, T: Combatant | null, tv: boolean, gunner: boolean, now: number): 'cross' | 'flank' | 'push' | 'retreat' | null {
    const st = this.state;
    if (st === 'retreat' || st === 'break') return 'retreat';
    if (st === 'flank') return 'flank';
    const close = !gunner || this.self.arm.id !== 'ar';
    if (st === 'push') return close ? 'push' : null;
    if (st === 'engage') {
      // Only to close a gap the gun can't shoot across (its strafe is a walk anyway).
      const far = T && Math.hypot(T.pos.x - this.self.pos.x, T.pos.z - this.self.pos.z) > this.self.arm.maxRange;
      return far && close ? 'push' : null;
    }
    // Hunting, patrolling, holding, advancing: only across ground a hostile can see.
    if (tv) return 'cross';
    for (const s of this.seen.values()) if (s.vis) return 'cross';
    const S = ARENA.stamina;
    const me = this.self;
    for (const c of A.director.contacts.values()) {
      if (now - c.seenT < S.exposedFor && Math.hypot(c.pos.x - me.pos.x, c.pos.z - me.pos.z) < S.exposedR) return 'cross';
    }
    return null;
  }

  // ------------------------------------------------------------------ act
  /** Every frame: aim, fire, move. Fills `desired` (velocity) and returns the crouch it wants. */
  act(dt: number, ctx: EnemyCtx, desired: THREE.Vector3): number {
    const A = ctx.arena!;
    const me = this.self;
    const now = ctx.time;
    this.stateT += dt;
    me.tac.actionT += dt;
    me.tac.phaseT += dt;
    this.jumpCd -= dt;
    this.jitter = Math.max(0, this.jitter - dt * 0.04);
    this.bloom = Math.max(0, this.bloom - dt * (ARENA.bloom / ARENA.bloomTime));
    if (this.state === 'emerge') {
      if (this.stateT > ARENA.emerge) this.urgent = true;
      return 0;
    }
    const T = this.target;
    const tv = T !== null && this.visible(T);
    const gunner = me.kind === 'gunner';
    let crouch = 0;
    let strafing = false;
    this.updateAim(dt, now, T, tv, gunner);

    // ---- Movement by state.
    // 21.0: the gun in hand sets the pace (the pistol runs fastest, the shotgun is heaviest).
    const agile = gunner ? me.arm.agility.run : 1;
    const run = me.speed * (gunner ? ARENA.run : 1) * agile;
    // 30.0: the sprint needs a reason and the breath for it (Stamina.ts); otherwise it walks (`run`).
    const full = me.speed * (gunner ? ARENA.sprint : 1.05) * agile;
    const why = this.sprintReason(A, T, tv, gunner, now);
    const S = ARENA.stamina;
    // Optional sprints start with `reserve`, keep `floor` for the fight; a push keeps `pushFloor`.
    const v = this.stamina.value;
    const room = why === 'retreat' ? true : why === 'push' ? v > S.pushFloor : this.sprintNow ? v > S.floor : v >= S.reserve;
    const ok = !STAMINA.on || (why !== null && this.stamina.canSprint && room);
    const sprint = ok ? full : run;
    if (this.swing) {
      this.melee(dt, ctx, desired);
    } else if (this.state === 'engage' && gunner && T && Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) > me.arm.maxRange) {
      // Out of effective range: sprint up (no shots, see gun()) until it is in range.
      me.steer(T.pos, sprint, ctx, dt, desired);
    } else if (this.state === 'engage' && gunner && T) {
      strafing = true;
      // Aiming: feet planted while it focuses, then a walking strafe; from the hip, the full run.
      // 21.0: a pistol keeps its full run while aiming (no planted feet): it strafes hard the whole fight.
      const am = me.arm.agility.aimMove;
      const sp = this.aiming ? run * (am ?? (this.focusT < this.focusNeed ? ARENA.ads.focusMove : ARENA.ads.walk)) : run;
      this.strafe(dt, ctx, T, sp, desired);
    } else if (this.state === 'push' && gunner && T && tv && this.hopping(ctx, A, T, now)) {
      // 19.0: hop from cover to cover towards it (the spot is out of its sight), firing on the way.
      if (me.steer(this.hop!, sprint, ctx, dt, desired) < 1) {
        // Arrived: the next hop at once.
        this.hop = null;
        this.hopT = -Infinity;
      }
    } else if ((this.state === 'push' || this.state === 'engage') && T) {
      // Rush: straight at it (a runner zig-zags while it is being watched).
      const goal = tv ? T.pos : (A.director.contacts.get(T.uid)?.pos ?? T.pos);
      const d = me.steer(goal, sprint, ctx, dt, desired);
      if (!gunner && tv && d > 4.5) {
        const l = Math.hypot(desired.x, desired.z) || 1;
        const side = Math.sin(now * 2.6 * this.zig + this.seed) * 0.7;
        const nx = desired.x / l, nz = desired.z / l;
        desired.x += -nz * side * l;
        desired.z += nx * side * l;
      }
      if (gunner && d < 6) {
        // Close enough: circle it instead of running into it.
        strafing = true;
        this.strafe(dt, ctx, T, run, desired);
      }
      if (!gunner && tv && d < ARENA.melee.start && Math.abs(T.pos.y - me.pos.y) < 1.2) {
        this.swing = 'windup';
        this.swingT = 0;
        me.tac.action = 'windup';
        me.tac.actionT = 0;
      }
    } else if (this.state === 'break') {
      if (this.goal) {
        const d = me.steer(this.goal, sprint, ctx, dt, desired);
        if (d < 0.7) {
          desired.set(0, 0, 0);
          crouch = 1;
        }
      } else if (T) {
        // No spot: sidestep out of its line, away from it.
        this.strafe(dt, ctx, T, sprint, desired, -1);
      }
    } else if (this.state === 'hold') {
      // 29.0: no sprinting on the last stand; at the spot, down behind it.
      A.stats.holdT += dt;
      if (this.goal) me.steer(this.goal, run, ctx, dt, desired);
      else crouch = 1;
    } else if ((this.state === 'hunt' || this.state === 'advance' || this.state === 'patrol' || this.state === 'flank' || this.state === 'retreat') && this.goal) {
      // 29.0: on the last stand a hunt is walked, not sprinted (a retreat still runs flat out).
      // (Pressing on the clock it still runs, not sprints: the group moves as one.)
      const pace = A.director.lastStand && ARENA.lastStand.on && this.state !== 'retreat' ? run : sprint;
      const d = me.steer(this.goal, pace, ctx, dt, desired);
      const at = this.state === 'flank' ? ARENA.flank.arrive : 2;
      if (d < at && Math.abs(this.goal.y - me.pos.y) < 1.5) {
        if (this.state === 'hunt' && T) A.director.cleared(T.uid, now);
        if (this.state === 'flank') A.stats.flankArrive++;
        this.goal = null;
        this.urgent = true;
      }
    } else this.urgent = this.urgent || this.stateT > 0.3;

    // ---- Facing: the target, else where the threat was (pre-aim), else where it runs. Retreating it
    // runs, looking where it goes (12.0).
    const fleeing = this.state === 'retreat';
    if (tv && !fleeing) {
      const flight = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) / ARENA.boltSpeed;
      _aim.set(T.pos.x, T.pos.y + T.chestY, T.pos.z).addScaledVector(T.vel, flight);
      this.aimPoint.copy(_aim);
      me.face(_aim, dt, ARENA.yawRate);
    } else if (T && this.state !== 'advance' && this.state !== 'patrol' && !fleeing) {
      const c = A.director.contacts.get(T.uid);
      const p = c?.pos ?? T.pos;
      if (Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 25) me.face(_v.set(p.x, p.y + 1.3, p.z), dt, 12);
      else if (Math.hypot(me.vel.x, me.vel.z) > 0.3) me.face(_v.copy(me.pos).add(me.vel), dt, 10);
    } else if (Math.hypot(me.vel.x, me.vel.z) > 0.3) me.face(_v.copy(me.pos).add(me.vel), dt, 10);
    else if (this.scan && (this.state === 'patrol' || this.state === 'hold')) me.face(this.scan, dt, 5);

    // ---- Fire (gunner) and reload.
    if (gunner) this.gun(dt, ctx, A, tv && !fleeing ? T : null, strafing);
    me.tac.phase = tv && gunner && !this.reloading ? (this.aiming && this.focusT < this.focusNeed ? 'aim' : 'fire') : this.reloading ? 'reload' : '';
    if (this.aiming) A.stats.aimT += dt;

    // ---- Vault what's in the way; jump now and then.
    this.probeT -= dt;
    const hs = Math.hypot(desired.x, desired.z);
    if (this.probeT <= 0 && hs > 1.5 && !me.airborne) {
      this.probeT = 0.1;
      const h = me.wallAhead(ctx, desired.x / hs, desired.z / hs);
      if (h > 0) this.tryJump(ctx, true, Math.sqrt(2 * ARENA.gravity * (h + 0.3)));
    }

    // ---- 30.0: the pool. Sprinting means it chose to and is moving faster than its walk.
    {
      const hs = Math.hypot(desired.x, desired.z);
      this.sprintNow = ok && STAMINA.on && hs > run * 1.05;
      const emptied = this.stamina.stats.emptied;
      this.stamina.step(dt, this.sprintNow, hs < 0.5 || crouch > 0.5);
      if (STAMINA.on) {
        if (this.sprintNow && why) A.stats.sprintWhy[why] += dt;
        if (this.stamina.exhausted) A.stats.exhaustedT += dt;
        if (this.stamina.stats.emptied > emptied) A.stats.emptied++;
      }
    }

    // ---- Stats.
    const st = A.stats;
    const sp = Math.hypot(me.vel.x, me.vel.z);
    st.aliveT += dt;
    st.speedSum += sp * dt;
    if (sp > 1.5) st.movingT += dt;
    if (this.state === 'break') st.breakT += dt;
    if (crouch > 0.5) st.crouchT += dt;
    return crouch;
  }

  /** Lateral movement round the target (dir -1 also backs off), keeping to the range band. */
  private strafe(dt: number, ctx: EnemyCtx, T: Combatant, speed: number, desired: THREE.Vector3, away = 0) {
    const me = this.self;
    const dx = T.pos.x - me.pos.x, dz = T.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const tx = dx / d, tz = dz / d;
    this.flipT -= dt;
    if (this.flipT <= 0) {
      this.flipT = rand(ARENA.flip[0], ARENA.flip[1]);
      const left = me.open(ctx, -tz, tx, 1.5), right = me.open(ctx, tz, -tx, 1.5);
      const prev = this.strafeDir;
      this.strafeDir = left && right ? (Math.random() < 0.5 ? 1 : -1) : left ? 1 : right ? -1 : -this.strafeDir;
      if (this.strafeDir !== prev && !this.aiming && Math.random() < ARENA.flipJump) this.tryJump(ctx, false);
    } else if (this.probeT <= 0 && !me.open(ctx, -tz * this.strafeDir, tx * this.strafeDir, 1)) {
      this.strafeDir = -this.strafeDir;
      this.flipT = rand(ARENA.flip[0], ARENA.flip[1]);
    }
    const [lo, hi] = me.arm.band;
    // 12.0: a bold bot keeps a closer band, a careful one a longer one.
    const ag = this.persona.aggro;
    const radial = away ? -0.7 : me.kind === 'runner' ? 1 : d < lo / ag ? -0.6 : d > hi / ag ? 0.6 : Math.sin(ctx.time * 0.9 + this.seed) * 0.25;
    const k = away ? 1 : ARENA.strafe;
    desired.set((-tz * this.strafeDir * k + tx * radial) * speed, 0, (tx * this.strafeDir * k + tz * radial) * speed);
    // 32.0, spread: a teammate fighting beside it: strafe away from it and ease off it (ARENA.space).
    const S = ARENA.space;
    if (S.on && ctx.friends) {
      let fx = 0, fz = 0, fd = S.engageR;
      for (const f of ctx.friends) {
        if (f === me || !f.alive) continue;
        const ex = me.pos.x - f.pos.x, ez = me.pos.z - f.pos.z, e = Math.hypot(ex, ez);
        if (e < fd && e > 1e-3) {
          fd = e;
          fx = ex / e;
          fz = ez / e;
        }
      }
      if (fd < S.engageR) {
        // Which way along the strafe line is away from it; take that way at the next flip if it's open.
        const off = Math.sign(-tz * fx + tx * fz) || 1;
        if (this.strafeDir !== off && me.open(ctx, -tz * off, tx * off, 1.5)) this.strafeDir = off;
        const push = S.engagePush * (1 - fd / S.engageR) * speed;
        desired.x += fx * push;
        desired.z += fz * push;
      }
    }
  }

  private gun(dt: number, ctx: EnemyCtx, A: ArenaCtx, T: Combatant | null, strafing: boolean) {
    const me = this.self;
    const arm = me.arm;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = arm.mag;
        this.burstLeft = arm.burst;
        this.urgent = true;
      }
      return;
    }
    if (this.ammo <= 0) {
      this.reloadT = arm.reload;
      this.urgent = true;
      return;
    }
    this.shotT -= dt;
    if (!T || this.shotT > 0) return;
    // Within the fire cone of where it aims.
    const want = Math.atan2(_aim.x - me.pos.x, _aim.z - me.pos.z);
    const err = Math.abs(Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw)));
    if (err > ARENA.fireCone) return;
    // Aimed: nothing leaves the barrel until it has settled on the target; nothing beyond effective range.
    if (this.aiming && this.focusT < this.focusNeed) return;
    if (Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) > arm.maxRange) return;
    let bloom = this.bloom;
    if (this.state === 'push') bloom = Math.min(bloom, ARENA.pushBloomMax);
    // Fog: aim degrades with the contrast lost on the way (and nothing is fired past fog sight).
    // The scene's own fog density (9.0; 8.1 inferred it from sightRange, which the jungle scales).
    let fog = 0;
    const rho = ctx.fog?.density ?? (ctx.sightRange !== undefined ? densityOfSightRange(ctx.sightRange) : 0);
    if (rho > 0) {
      const d = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z);
      if (d > fogRange(rho, ARENA_SEE)) {
        A.stats.fogShots++;
        return;
      }
      fog = ARENA.fogSpread * (1 - contrastAt(rho, d));
    }
    // Aimed: pinpoint (no bloom; a walking strafe adds a touch). Hip: the 7.0 cone, wider by hipSpread.
    const spread = this.aiming
      ? ARENA.ads.spread + this.jitter + fog + (strafing ? ARENA.strafeSpread * 0.3 : 0)
      : ARENA.spread + arm.hipSpread + bloom + this.jitter + fog + (strafing ? ARENA.strafeSpread : 0) + (me.airborne ? ARENA.airSpread : 0) + (me.sliding ? ARENA.slide.spread : 0);
    const range = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z);
    const r = me.fireRound(ctx, _aim, spread, { aimed: this.aiming, range });
    if (r === 'friend') {
      this.shotT = Math.min(ARENA.burstGap, arm.burstGap);
      return;
    }
    if (r !== 'fired') return;
    A.stats.shots++;
    if (this.aiming) {
      A.stats.aimedShots++;
      A.stats.aimedRange.push(range);
    } else {
      A.stats.hipShots++;
      A.stats.hipRange.push(range);
    }
    if (this.reactPending && T) {
      // From the moment it both saw this target and had it picked, to the first round at it.
      const s = this.seen.get(T.uid);
      if (s) A.stats.reactions.push(ctx.time - Math.max(s.since, this.switchT));
      this.reactPending = false;
    }
    this.ammo--;
    // Aimed: short controlled bursts with a longer rest; hip: the long 7.0 bursts.
    if (--this.burstLeft > 0) this.shotT = arm.burstGap;
    else {
      this.burstLeft = this.aiming && arm.aim ? arm.aim.burst : arm.burst;
      this.shotT = this.aiming && arm.aim ? arm.aim.burstRest : arm.burstRest;
    }
  }

  /**
   * 11.0: hip or aimed, by range. Only a gunner engaging what it can see aims; anything else (a push,
   * a break, the air, a reload, a swing) is hip. Entering an aimed shot sets how long it must focus
   * (further = longer); a burst in progress is cut to the aimed burst length.
   */
  private updateAim(dt: number, now: number, T: Combatant | null, tv: boolean, gunner: boolean) {
    const a = ARENA.ads;
    const me = this.self;
    // Engaging, or a hunt or advance that just caught sight of it (the state follows at the next
    // decide, a frame or few later); never in a push, a break, the air, a reload or a swing.
    const st = this.state;
    const can = gunner && T !== null && (st === 'engage' || st === 'hunt' || st === 'advance' || st === 'patrol' || st === 'hold' || st === 'flank') && !this.reloading && !me.airborne && !me.sliding && !this.swing;
    if (can && tv) {
      this.lostT = 0;
      const d = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z);
      const far = wantsAim(d, this.aiming, me.arm);
      if (far && !this.aiming) {
        this.aiming = true;
        // Back on the same face after a moment's break: the focus it had stands.
        if (this.droppedOn !== T || now - this.droppedAt > a.keep) this.focusT = 0;
        this.focusNeed = focusFor(d, me.arm) * this.persona.patience;
        this.burstLeft = Math.min(this.burstLeft, me.arm.aim?.burst ?? a.burst);
      } else if (!far && this.aiming) this.lower(now);
    } else if (can && this.aiming && st === 'engage') {
      // It holds the angle a moment after the target ducks out of view (not while it runs a hunt).
      this.lostT += dt;
      if (this.lostT > a.hold) this.lower(now);
    } else if (this.aiming) this.lower(now);
    if (this.aiming && tv) this.focusT += dt;
    me.isAiming = this.aiming;
  }

  private lower(now: number) {
    this.aiming = false;
    this.droppedAt = now;
    this.droppedOn = this.target;
  }

  /** The runner's swing: windup, strike (lands if still in reach), recover. */
  private melee(dt: number, ctx: EnemyCtx, desired: THREE.Vector3) {
    const me = this.self;
    const T = this.target;
    const M = ARENA.melee;
    this.swingT += dt;
    if (T) me.face(T.pos, dt, 16);
    if (this.swing === 'windup') {
      if (T) desired.set(T.pos.x - me.pos.x, 0, T.pos.z - me.pos.z).setLength(2);
      if (this.swingT > M.windup) {
        this.swing = 'strike';
        this.swingT = 0;
        me.tac.action = 'strike';
        me.tac.actionT = 0;
        if (T && T.alive && Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) < M.land && Math.abs(T.pos.y - me.pos.y) < 1.2) me.strike(ctx, T);
      }
    } else if (this.swing === 'strike') {
      if (this.swingT > M.strike) {
        this.swing = 'recover';
        this.swingT = 0;
        me.tac.action = 'recover';
        me.tac.actionT = 0;
      }
    } else if (this.swingT > M.recover) {
      this.swing = null;
      me.tac.action = this.state;
      this.urgent = true;
    }
  }
}

/**
 * 29.0: a team on its last stand holds cover together, unless it is on the sudden-death clock with
 * lastStand.pressAt s or less left: then it presses (as a group: it still never flanks alone).
 */
export function holding(dir: { lastStand: boolean; sudden: number | null }) {
  return ARENA.lastStand.on && dir.lastStand && (dir.sudden === null || dir.sudden > ARENA.lastStand.pressAt);
}
