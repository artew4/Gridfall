import * as THREE from 'three';
import type { Combatant } from '../../combat/Team';
import type { EnemyCtx } from '../Enemy';
import { hostilesOf } from '../Enemy';
import type { TacState } from '../tactics/Squad';
import type { Thinker } from '../tactics/Scheduler';
import type { BarkKind, Voice } from '../tactics/Barks';
import { rand } from '../../core/math';
import { ARENA, type ArenaCtx } from './ArenaCtx';
import type { Seen, SenseAgent } from './Sensing';

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
*/

export type ArenaState = 'emerge' | 'advance' | 'hunt' | 'engage' | 'push' | 'break';

/** What the brain drives (ArenaGunner / ArenaRunner). */
export interface ArenaBody extends Combatant {
  readonly kind: 'gunner' | 'runner';
  readonly speed: number;
  readonly look: { voice: Voice };
  yaw: number;
  crouch: number;
  tac: TacState;
  readonly airborne: boolean;
  /** Steer towards a floor point at `speed` (graph routing, vault links); returns the XZ distance left. */
  steer(goal: THREE.Vector3, speed: number, ctx: EnemyCtx, dt: number, desired: THREE.Vector3): number;
  face(p: THREE.Vector3, dt: number, rate: number): void;
  /** Take off (false if already in the air). `vault`: clearing a low wall. */
  jump(vy: number, vault: boolean): boolean;
  /** Gunner: one round at `aim` with this spread. 'friend': a teammate in the line (nothing fired). */
  fireRound(ctx: EnemyCtx, aim: THREE.Vector3, spread: number): 'fired' | 'friend' | 'none';
  /** Runner: the blade lands on `victim`. */
  strike(ctx: EnemyCtx, victim: Combatant): void;
  /** Height of a vaultable wall just ahead along (dx, dz), else 0. */
  wallAhead(ctx: EnemyCtx, dx: number, dz: number): number;
  /** Room for the body `dist` m along (dx, dz). */
  open(ctx: EnemyCtx, dx: number, dz: number, dist: number): boolean;
  bark(kind: BarkKind, ctx: EnemyCtx): void;
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
  ammo = ARENA.mag;
  /** > 0: reloading, seconds left. */
  reloadT = 0;
  private burstLeft = ARENA.burst;
  private shotT = 0;
  private strafeDir = 1;
  private flipT = 0;
  private probeT = 0;
  private jumpCd = 0;
  private breakCd = -Infinity;
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
  private seed = Math.random() * 100;

  constructor(readonly self: ArenaBody) {}

  get reloading() {
    return this.reloadT > 0;
  }

  private visible(h: Combatant | null): boolean {
    return !!h && h.alive && !!this.seen.get(h.uid)?.vis;
  }

  // ------------------------------------------------------------------ events
  onSight(_h: Combatant, _now: number) {
    // No reaction delay: a new face in view is decided on this very frame.
    this.urgent = true;
  }

  /** Hit by `by`: look at it now, maybe jump out of the line. */
  onHit(ctx: EnemyCtx, by: Combatant | null) {
    if (by && !by.isPlayer && by.team === this.self.team) return;
    if (by) this.alert.set(by.uid, ctx.time);
    this.urgent = true;
    this.jitter = Math.max(this.jitter, 0.015);
    if ((this.state === 'engage' || this.state === 'push' || this.state === 'hunt') && Math.random() < ARENA.hitJump) this.tryJump(ctx, false);
  }

  /** A round passed close: aim shakes a little (no pinning in the arena), maybe a jump. */
  onNearMiss(ctx: EnemyCtx, by: Combatant | null) {
    if (by) this.alert.set(by.uid, ctx.time);
    this.jitter = Math.max(this.jitter, 0.02);
    if (this.state === 'engage' && Math.random() < ARENA.hitJump * 0.5) this.tryJump(ctx, false);
  }

  /** Its round hit someone. */
  onDealt(victim: Combatant, dmg: number, now: number) {
    this.dealt.push([now, victim.uid, dmg]);
    if (this.dealt.length > 24) this.dealt.shift();
  }

  died(A: ArenaCtx | undefined) {
    A?.director.releasePush(this.self.uid);
  }

  private dealtTo(uid: number, now: number) {
    let s = 0;
    for (const [t, u, d] of this.dealt) if (u === uid && now - t < ARENA.pushWindow) s += d;
    return s;
  }

  private setState(s: ArenaState, ctx: EnemyCtx, A: ArenaCtx) {
    if (s === this.state) return;
    if (this.state === 'push') A.director.releasePush(this.self.uid);
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
      this.breakCd = ctx.time + ARENA.breakCooldown;
      if (this.reloading) this.self.bark('reload', ctx);
    }
  }

  private tryJump(ctx: EnemyCtx, vault: boolean, vy = ARENA.jumpV) {
    if (this.self.airborne || (!vault && (this.jumpCd > 0 || this.swing))) return false;
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
      // Snap + spread: a fresh target blooms; switching from one in view keeps part of the bloom.
      this.bloom = had ? Math.max(this.bloom * ARENA.switchBloom, ARENA.bloom * 0.5) : ARENA.bloom;
      // Sight-to-shot measures the decision, not the magazine: a pick made mid-reload isn't timed.
      this.reactPending = !!best && !this.reloading;
    }
    const T = this.target;
    const tv = T !== null && this.visible(T);
    const contact = T ? dir.contacts.get(T.uid) ?? null : null;
    const dT = T ? Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) : Infinity;

    // ---- State.
    const gunner = me.kind === 'gunner';
    const attackers = [...this.alert.values()].filter((t) => now - t < 1.5).length;
    let next: ArenaState;
    if (this.state === 'break' && this.stateT < ARENA.breakMax && (this.reloading || this.stateT < 0.5)) next = 'break';
    // Reloading is done on the move unless someone is shooting at it.
    else if (gunner && tv && now > this.breakCd && ((this.reloading && attackers >= 1) || (me.hpFrac < ARENA.breakHp && T.hpFrac > me.hpFrac) || attackers >= 2)) next = 'break';
    else if (T && (tv || (contact && now - contact.t < ARENA.contactTtl))) {
      const hurt = T.hpFrac <= (gunner ? ARENA.pushHp : ARENA.runnerPushHp) || this.dealtTo(T.uid, now) >= ARENA.pushDamage || (!gunner && T.reloading);
      let pushing = this.state === 'push' && now < this.pushUntil;
      // A blade has one way to fight, close in; a claimed rush on someone hurt is a push (it counts,
      // it barks, two at most). A gunner pushes only what it can see.
      if (!pushing && hurt && (tv || !gunner) && dir.claimPush(me.uid, T.uid, now, !gunner)) {
        this.pushUntil = now + ARENA.pushMax;
        pushing = true;
      }
      next = pushing ? 'push' : tv ? 'engage' : 'hunt';
    } else next = 'advance';
    this.setState(next, ctx, A);

    // ---- Goals.
    if (next === 'break' && !this.goal && T) this.goal = this.breakSpot(ctx, A, T);
    else if (next === 'hunt' && contact) {
      this.goal = this.laneGoal(ctx, A, contact.pos) ?? _v.copy(contact.pos).addScaledVector(contact.vel, ARENA.huntLead).clone();
      if (!this.laneTo) this.goal.y = contact.pos.y;
    } else if (next === 'hunt' && T && !contact) this.goal = T.pos.clone();
    else if (next === 'advance') this.planLane(ctx, A);

    // A runner closing in leaps the last metres now and then.
    if (!gunner && tv && dT > 4 && dT < 9 && Math.random() < 0.08) this.tryJump(ctx, false);

    const iv = tv && dT < ARENA.decide.closeDist ? ARENA.decide.close : T ? ARENA.decide.far : ARENA.decide.calm;
    this.nextThink = now + iv * (0.85 + 0.3 * Math.random());
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

  /** No contact: walk the lane towards the director's front, then patrol a step either side of it. */
  private planLane(ctx: EnemyCtx, A: ArenaCtx) {
    const L = ctx.lanes;
    const me = this.self;
    // The freshest contact on the board beats the lane (the team's radar).
    const c = A.director.freshest(me.pos, ctx.time);
    if (c) {
      this.goal = c.pos.clone();
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

    // ---- Movement by state.
    const run = me.speed * (gunner ? ARENA.run : 1);
    const sprint = me.speed * (gunner ? ARENA.sprint : 1.05);
    if (this.swing) {
      this.melee(dt, ctx, desired);
    } else if (this.state === 'engage' && gunner && T) {
      strafing = true;
      this.strafe(dt, ctx, T, run, desired);
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
    } else if ((this.state === 'hunt' || this.state === 'advance') && this.goal) {
      const d = me.steer(this.goal, sprint, ctx, dt, desired);
      if (d < 2 && Math.abs(this.goal.y - me.pos.y) < 1.5) {
        if (this.state === 'hunt' && T) A.director.cleared(T.uid, now);
        this.goal = null;
        this.urgent = true;
      }
    } else this.urgent = this.urgent || this.stateT > 0.3;

    // ---- Facing: the target, else where the threat was (pre-aim), else where it runs.
    if (tv) {
      const flight = Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) / ARENA.boltSpeed;
      _aim.set(T.pos.x, T.pos.y + T.chestY, T.pos.z).addScaledVector(T.vel, flight);
      this.aimPoint.copy(_aim);
      me.face(_aim, dt, ARENA.yawRate);
    } else if (T && this.state !== 'advance') {
      const c = A.director.contacts.get(T.uid);
      const p = c?.pos ?? T.pos;
      if (Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 25) me.face(_v.set(p.x, p.y + 1.3, p.z), dt, 12);
      else if (Math.hypot(me.vel.x, me.vel.z) > 0.3) me.face(_v.copy(me.pos).add(me.vel), dt, 10);
    } else if (Math.hypot(me.vel.x, me.vel.z) > 0.3) me.face(_v.copy(me.pos).add(me.vel), dt, 10);

    // ---- Fire (gunner) and reload.
    if (gunner) this.gun(dt, ctx, A, tv ? T : null, strafing);
    me.tac.phase = tv && gunner && !this.reloading ? 'fire' : this.reloading ? 'reload' : '';

    // ---- Vault what's in the way; jump now and then.
    this.probeT -= dt;
    const hs = Math.hypot(desired.x, desired.z);
    if (this.probeT <= 0 && hs > 1.5 && !me.airborne) {
      this.probeT = 0.1;
      const h = me.wallAhead(ctx, desired.x / hs, desired.z / hs);
      if (h > 0) this.tryJump(ctx, true, Math.sqrt(2 * ARENA.gravity * (h + 0.3)));
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
      if (this.strafeDir !== prev && Math.random() < ARENA.flipJump) this.tryJump(ctx, false);
    } else if (this.probeT <= 0 && !me.open(ctx, -tz * this.strafeDir, tx * this.strafeDir, 1)) {
      this.strafeDir = -this.strafeDir;
      this.flipT = rand(ARENA.flip[0], ARENA.flip[1]);
    }
    const [lo, hi] = ARENA.band;
    const radial = away ? -0.7 : me.kind === 'runner' ? 1 : d < lo ? -0.6 : d > hi ? 0.6 : Math.sin(ctx.time * 0.9 + this.seed) * 0.25;
    const k = away ? 1 : ARENA.strafe;
    desired.set((-tz * this.strafeDir * k + tx * radial) * speed, 0, (tx * this.strafeDir * k + tz * radial) * speed);
  }

  private gun(dt: number, ctx: EnemyCtx, A: ArenaCtx, T: Combatant | null, strafing: boolean) {
    const me = this.self;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = ARENA.mag;
        this.burstLeft = ARENA.burst;
        this.urgent = true;
      }
      return;
    }
    if (this.ammo <= 0) {
      this.reloadT = ARENA.reload;
      this.urgent = true;
      return;
    }
    this.shotT -= dt;
    if (!T || this.shotT > 0) return;
    // Within the fire cone of where it aims.
    const want = Math.atan2(_aim.x - me.pos.x, _aim.z - me.pos.z);
    const err = Math.abs(Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw)));
    if (err > ARENA.fireCone) return;
    let bloom = this.bloom;
    if (this.state === 'push') bloom = Math.min(bloom, ARENA.pushBloomMax);
    const spread = ARENA.spread + bloom + this.jitter + (strafing ? ARENA.strafeSpread : 0) + (me.airborne ? ARENA.airSpread : 0);
    const r = me.fireRound(ctx, _aim, spread);
    if (r === 'friend') {
      this.shotT = ARENA.burstGap;
      return;
    }
    if (r !== 'fired') return;
    A.stats.shots++;
    if (this.reactPending && T) {
      // From the moment it both saw this target and had it picked, to the first round at it.
      const s = this.seen.get(T.uid);
      if (s) A.stats.reactions.push(ctx.time - Math.max(s.since, this.switchT));
      this.reactPending = false;
    }
    this.ammo--;
    if (--this.burstLeft > 0) this.shotT = ARENA.burstGap;
    else {
      this.burstLeft = ARENA.burst;
      this.shotT = ARENA.burstRest;
    }
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
