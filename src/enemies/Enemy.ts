import * as THREE from 'three';
import type { Grenades } from '../combat/Grenades';
import type { Rockets } from '../combat/Rockets';
import { disposeRig, type Rig } from './Models';
import type { EnemyLook } from '../entities/types';
import { NEON_SYNTHS } from '../entities/enemies/neon';
import type { Nav } from './Nav';
import type { Projectiles } from './Projectiles';
import type { Player } from '../player/Player';
import type { CollisionWorld } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Effects } from '../combat/Effects';
import { Spring, clamp, damp, easeOut, rand } from '../core/math';
import { GUNNER_MAG, coverKey, createTac, nearestNode, peekSight, type Squad, type TacAgent, type TacState } from './tactics/Squad';
import { newUid, segmentDistance, type Combatant, type TeamId } from '../combat/Team';
import { unitOf } from '../combat/PlayerUnit';
import { choose, type Option } from './tactics/Utility';
import { evaluateCover, isProtected } from './tactics/Cover';
import type { ArenaCtx } from './arena/ArenaCtx';
import { solveArm, type ArmChain } from './RigIK';
import { ARM } from '../entities/enemies/operators';
import { RIG_GUNS, gripTargets, holdPose } from '../entities/enemies/rigGuns';
import type { WeaponId } from '../entities/weapons/armory';

export interface EnemyCtx {
  scene: THREE.Scene;
  player: Player;
  col: CollisionWorld;
  audio: AudioEngine;
  fx: Effects;
  nav: Nav;
  projectiles: Projectiles;
  time: number;
  difficulty: number;
  coverPoints: THREE.Vector3[];
  occupied: Set<THREE.Vector3>;
  enemies: Enemy[];
  /** Playable XZ extent; anything outside is recovered to the nav graph. */
  bounds: THREE.Box2;
  /** Rooftop sniper spots (floor positions). */
  perches: THREE.Vector3[];
  /** The survival combat director: squad knowledge, roles, time-sliced decisions, barks. */
  squad: Squad;
  /**
   * How far anyone can see right now (fog, a sandstorm), if the level limits it. Enemies don't see
   * through what hides them from the player; they still hear and hunt.
   */
  sightRange?: number;
  /**
   * Sightline left after soft cover the rays don't see (the jungle's undergrowth): 1 clear … 0
   * hidden. Absent = nothing soft in the way.
   */
  concealment?: (a: THREE.Vector3, b: THREE.Vector3) => number;
  damagePlayer(dmg: number, from: THREE.Vector3): void;
  /**
   * 9.0: the scene's fog (live: a storm changes its density every frame). The arena AI derives its
   * sight and aim from it (world/Visibility.ts) instead of from `sightRange`, whose meaning varies
   * by level (the jungle's is already cut to 85% for the survival AI).
   */
  fog?: THREE.FogExp2;
  /**
   * 46.0: the weather's own fog density, when the picture's differs (the Desert thins its fog round a
   * player indoors: the storm is outside, not in his room); the arena AI reads this one.
   */
  weatherFog?: number;
  /** 46.0: are both points under a roof (a house, a building)? Then the weather between them is nothing. */
  sheltered?: (a: THREE.Vector3, b: THREE.Vector3) => boolean;
  /** 7.0, TDM: the arena AI (director, sensing, scheduler) when the mode runs it; absent otherwise. */
  arena?: ArenaCtx;
  /** 6.0: the team of the agents this context drives (absent: OMEGA, survival). */
  team?: TeamId;
  /** Who they fight (absent: the player alone). */
  hostiles?: readonly Combatant[];
  /** Teammates a gunner must not fire through (TDM). */
  friends?: readonly Combatant[];
  /** A combatant died: kill credit, tickets, respawns (TDM). */
  onDeath?(victim: Combatant, by: Combatant | null): void;
  /** TDM: the other team's spawn (never a goal), and the lanes from this team's base. */
  avoid?: (p: THREE.Vector3) => boolean;
  lanes?: THREE.Vector3[][];
  /** 90.0: frags in flight and on the ground (thrown, dodged). */
  grenades?: Grenades;
  /** 92.0: rockets (a bot carrying the launcher fires them). */
  rockets?: Rockets;
}

const _solo: Combatant[] = [];
/** Who the agents of `ctx` fight: its hostiles, or (survival, the checks' stand-in targets) the player. */
export function hostilesOf(ctx: EnemyCtx): readonly Combatant[] {
  if (ctx.hostiles) return ctx.hostiles;
  _solo[0] = unitOf(ctx.player, (d, f) => ctx.damagePlayer(d, f));
  return _solo;
}

interface Hitbox {
  y: number;
  r: number;
  mult: number;
  /** Forward offset, so hitboxes follow a leaning body. */
  fwd?: number;
}

export interface EnemyHit {
  dist: number;
  mult: number;
  point: THREE.Vector3;
  head: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export abstract class Enemy implements Combatant {
  rig: Rig;
  /** 6.0: one per life (a respawn is a new enemy). */
  readonly uid = newUid();
  team: TeamId = 'omega';
  /** Callsign (TDM name tags and kill feed); survival enemies have none. */
  name = '';
  readonly isPlayer = false;
  /** Last time a hostile round hit or passed close. */
  pressureT = -Infinity;
  readonly maxHp: number;
  /** Spawn protection: hits before this sim time do nothing. */
  invulnUntil = -Infinity;
  /**
   * 36.0: held on its spot (TDM's pre-match countdown): no thinking, no moving, no firing; it stands
   * as it came in (the emerge pose played out, then held).
   */
  held = false;
  /** Who hurt it last (kill credit). */
  lastAttacker: Combatant | null = null;
  private lastCtx: EnemyCtx | null = null;
  /** The context of its last update (its own team's). */
  protected get ctxNow() {
    return this.lastCtx;
  }
  /** 92.0: its own team's context, as last seen (null before it first thought). */
  get teamCtx() {
    return this.lastCtx;
  }
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp: number;
  alive = true;
  /** Fully finished dying; can be removed. */
  dead = false;
  state = 'emerge';
  stateT = 0;
  /** 36.0: how far into its emerge pose a held bot stands (s: upright, the visor lit). */
  static HOLD_POSE = 0.6;
  protected flash = 0;
  protected stagger = 0;
  protected leanX = new Spring(140, 10);
  protected leanZ = new Spring(140, 10);
  protected walkPhase = Math.random() * 6;
  protected seed = Math.random() * 100;
  /** Electrocuted: frozen in place and twitching. */
  stun = 0;
  /** 0 standing … 1 crouched behind cover. The hitboxes go down with the pose. */
  crouch = 0;
  /** How far a full crouch lowers the head (m); the cover test uses the same numbers. */
  protected crouchDrop = 0.78;
  protected fallV = 0;
  private path: number[] = [];
  private forcePathT = 0;
  private noProgressT = 0;
  private bestGoalD = Infinity;
  private lastGoal = new THREE.Vector3(1e9, 0, 0);
  private pathT = 0;
  private directT = 0;
  private directOk = false;
  private directFrom = new THREE.Vector3(1e9, 0, 0);
  private directTo = new THREE.Vector3(1e9, 0, 0);
  private skipT = 0;
  private wedgeAt = new THREE.Vector3();
  private wedgeT = 0;
  private unwedgeT = 0;
  private unwedgeTo = new THREE.Vector3();
  /** Times it had to step out of a wedge (DEV counter). */
  unsticks = 0;
  private dieT = 0;
  private stepIdx = 0;
  private glowBase: THREE.Color;
  abstract radius: number;
  abstract speed: number;
  abstract hitboxes: Hitbox[];
  abstract accent: THREE.Color;
  abstract heavy: boolean;

  /** How this enemy looks and sounds (the setting's EnemyLook). */
  constructor(rig: Rig, maxHp: number, spawn: THREE.Vector3, public kind: 'runner' | 'gunner', public look: EnemyLook = NEON_SYNTHS) {
    this.rig = rig;
    this.hp = maxHp;
    this.maxHp = maxHp;
    this.pos.copy(spawn);
    this.glowBase = rig.glowMat.color.clone();
    rig.glowMat.color.setScalar(0);
  }

  get chest() {
    return _w.set(this.pos.x, this.pos.y + this.hitY(1.25), this.pos.z);
  }

  // ---- Combatant: what other agents perceive and aim at.
  get headY() {
    return this.hitY(this.kind === 'gunner' ? 1.7 : 1.5);
  }
  get chestY() {
    return this.hitY(this.kind === 'gunner' ? 1.32 : 1.15);
  }
  get reloading() {
    return false;
  }
  get hpFrac() {
    return Math.max(0, this.hp) / this.maxHp;
  }
  facing(out: THREE.Vector2) {
    return out.set(Math.sin(this.yaw), Math.cos(this.yaw));
  }
  /** Damage from another combatant (a bolt, a swing): the same path as the player's rounds. */
  hurt(dmg: number, from: THREE.Vector3, by: Combatant | null, dir?: THREE.Vector3, point?: THREE.Vector3) {
    const ctx = this.lastCtx;
    if (!ctx) return false;
    const c = this.chest.clone();
    return this.takeHit(dmg, dir ?? c.clone().sub(from).normalize(), point ?? c, ctx, by);
  }

  /** A standing hitbox height, lowered by the crouch (the head drops fully, the legs less). */
  hitY(y: number) {
    return y - this.crouchDrop * this.crouch * Math.min(1, y / 1.2);
  }

  /** Rounds passed close (or hit): survival enemies flinch and may be pinned down. */
  suppress(_amount: number, _ctx: EnemyCtx) {}

  /** Ray vs hitbox spheres. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3): EnemyHit | null {
    if (!this.alive) return null;
    let best: EnemyHit | null = null;
    for (const h of this.hitboxes) {
      const f = h.fwd ?? 0;
      const c = _v.set(this.pos.x + Math.sin(this.yaw) * f, this.pos.y + this.hitY(h.y), this.pos.z + Math.cos(this.yaw) * f);
      const oc = c.sub(origin);
      const tca = oc.dot(dir);
      if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > h.r * h.r) continue;
      const t = tca - Math.sqrt(h.r * h.r - d2);
      if (!best || t < best.dist) best = { dist: t, mult: h.mult, point: origin.clone().addScaledVector(dir, t), head: h.mult > 1.5 };
    }
    return best;
  }

  /** Returns true if this hit killed the enemy. */
  /** 21.0: `knock`, a hit that shoves (m/s along the shot, flat) and staggers (s) harder: the shotgun's. */
  takeHit(dmg: number, dir: THREE.Vector3, point: THREE.Vector3, ctx: EnemyCtx, by: Combatant | null = null, knock?: { push: number; stagger: number }): boolean {
    if (!this.alive) return false;
    // Its own team's context (squad, kill credit), whoever deals the damage.
    ctx = this.lastCtx ?? ctx;
    // Friendly fire is off, and a fresh spawn is protected for a moment (35.0: it still notices).
    if (by && by.team === this.team) return false;
    if (ctx.time < this.invulnUntil) {
      if (by) this.onShotProtected(ctx, by);
      return false;
    }
    if (by) this.lastAttacker = by;
    this.pressureT = ctx.time;
    this.hp -= dmg;
    this.flash = 1;
    this.stagger = Math.max(this.stagger, this.heavy ? 0.15 : 0.3);
    // Lean away from the shot in local space.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const localZ = dir.x * s + dir.z * c;
    const localX = dir.x * c - dir.z * s;
    const k = this.heavy ? 3 : 6;
    this.leanX.impulse(localZ * k);
    this.leanZ.impulse(-localX * k);
    this.vel.addScaledVector(dir, this.heavy ? 0.6 : 1.8);
    if (knock) {
      const h = Math.hypot(dir.x, dir.z) || 1, k = this.heavy ? 0.35 : 1;
      this.vel.x += (dir.x / h) * knock.push * k;
      this.vel.z += (dir.z / h) * knock.push * k;
      this.stagger = Math.max(this.stagger, knock.stagger * k);
    }
    ctx.fx.enemyHit(point, dir, this.accent, this.look.organic);
    ctx.audio.hitEnemy(point, this.heavy);
    this.onHit(ctx);
    if (this.hp <= 0) {
      this.die(ctx);
      return true;
    }
    return false;
  }

  protected onHit(_ctx: EnemyCtx) {}
  /** 35.0: a hostile's round reached it while spawn-protected (no damage). */
  protected onShotProtected(_ctx: EnemyCtx, _by: Combatant) {}

  protected onStunned() {}

  protected die(ctx: EnemyCtx) {
    this.alive = false;
    this.state = 'dying';
    this.dieT = 0;
    ctx.fx.deathBurst(this.chest.clone(), this.accent, this.look.organic);
    ctx.audio.enemyDeath(this.chest, this.look.voice);
    this.onDeath(ctx);
    ctx.onDeath?.(this, this.lastAttacker);
  }

  protected onDeath(_ctx: EnemyCtx) {}

  protected setState(s: string) {
    this.state = s;
    this.stateT = 0;
  }

  protected faceTowards(target: THREE.Vector3, dt: number, rate = 10) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  protected canSee(ctx: EnemyCtx, target: THREE.Vector3) {
    _v.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
    if (ctx.sightRange !== undefined && _v.distanceTo(target) > ctx.sightRange) return false;
    return ctx.col.lineOfSight(_v, target);
  }

  /** Returns the immediate steering target towards goal, using the waypoint graph when blocked. */
  /** The last route request for the current goal found no path (goal unreachable from here). */
  noRoute = false;

  protected steerTarget(goal: THREE.Vector3, ctx: EnemyCtx, dt: number): THREE.Vector3 {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z);
    const to = new THREE.Vector3(goal.x, goal.y + 1, goal.z);
    // Pinned against something (a boulder the graph link skirts, another body in a doorway): it
    // wants to go somewhere but hasn't moved half a metre in 1.5 s. Step back and to one side for
    // 0.6 s, then plan again (5.0; the wedge recovery below only switches to the graph).
    const far = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) > 1.5;
    if (!far || this.pos.distanceToSquared(this.wedgeAt) > 0.25) {
      this.wedgeAt.copy(this.pos);
      this.wedgeT = 0;
    } else this.wedgeT += dt;
    if (this.unwedgeT > 0) {
      this.unwedgeT -= dt;
      return this.unwedgeTo;
    }
    if (this.wedgeT > 1.5) {
      this.wedgeT = 0;
      this.unwedgeT = 0.6;
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.unwedgeTo.set(this.pos.x + (-dz / l) * side * 2 - (dx / l) * 0.6, this.pos.y, this.pos.z + (dx / l) * side * 2 - (dz / l) * 0.6);
      this.path.length = 0;
      this.pathT = 0;
      this.unsticks++;
      return this.unwedgeTo;
    }
    // Straight at the goal only on the same level; otherwise the graph knows where the stairs are.
    // If a straight approach stops making progress (wedged in a corner), use the graph for a while.
    this.forcePathT -= dt;
    const dGoal = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    if (this.lastGoal.distanceToSquared(goal) > 4) {
      this.lastGoal.copy(goal);
      this.bestGoalD = Infinity;
    }
    if (dGoal < this.bestGoalD - 0.3) {
      this.bestGoalD = dGoal;
      this.noProgressT = 0;
    } else this.noProgressT += dt;
    if (this.noProgressT > 1.2 && dGoal > 2.5) {
      this.forcePathT = 2.5;
      this.noProgressT = 0;
      this.bestGoalD = dGoal;
    }
    // The straight-line test is 4 rays: reuse its answer for 0.2 s unless either end moved 1 m (5.0;
    // it ran every frame for every enemy and was the largest single AI cost).
    if (this.forcePathT <= 0 && Math.abs(to.y - from.y) < 1) {
      this.directT -= dt;
      if (this.directT <= 0 || from.distanceToSquared(this.directFrom) > 1 || to.distanceToSquared(this.directTo) > 1) {
        this.directOk = this.directClear(ctx, from, to);
        this.directT = 0.2;
        this.directFrom.copy(from);
        this.directTo.copy(to);
      }
      if (this.directOk) {
        this.path.length = 0;
        this.noRoute = false;
        return goal;
      }
    }
    this.pathT -= dt;
    // Re-plans are budgeted per frame (5.0): a refused one keeps the current path a frame longer.
    // An empty path is re-planned at once, unless the last plan found no route (then on the timer:
    // an unreachable goal must not ask the graph every frame).
    if ((this.pathT <= 0 || (this.path.length === 0 && !this.noRoute)) && (!ctx.squad || ctx.squad.sched.tryRoute(ctx.time))) {
      this.pathT = 0.6 + Math.random() * 0.3;
      this.path = this.routeTo(ctx, from, to);
      this.noRoute = this.path.length === 0;
      this.ontoStale = true;
    }
    // Skip waypoints we can already see past (never across levels, or we'd cut under a walkway);
    // looked at five times a second, not every frame.
    const level = (n: THREE.Vector3) => Math.abs(n.y - from.y) < 1;
    this.skipT -= dt;
    if (this.skipT <= 0) {
      this.skipT = 0.2;
      // 19.0: never past a stair's node (Nav.climb): it is walked, not cut. 33.0: nor over a drop: the
      // floor runs on under the cut (runners cut from a bank onto a bridge over its side, into the ravine).
      while (this.path.length > 1 && !ctx.nav.climb.has(this.path[0]) && level(ctx.nav.nodes[this.path[1]]) && this.directClear(ctx, from, ctx.nav.nodes[this.path[1]]) && ctx.nav.walkable(from, ctx.nav.nodes[this.path[1]])) this.path.shift();
    }
    if (this.path.length) {
      const n = ctx.nav.nodes[this.path[0]];
      if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 0.8) this.path.shift();
      return n;
    }
    // 33.0: no route and no straight line (the goal is walled off from here): never run at it through
    // the wall (bots ran into a ravine's rim for whole matches). Onto the graph instead: the nearest node
    // it can walk to (looked up on the re-plan timer); from there the next plan has an entry.
    if (this.noRoute) {
      // (Once a re-plan. 38.0: it read `pathT >= 0.55`, true for every frame of the first 0.05–0.35 s
      // after each re-plan: a lookup of hundreds of rays a frame, 3–12 ms of a 12v12 Desert frame.)
      if (this.ontoStale || !this.onto) {
        this.ontoStale = false;
        const i = ctx.nav.nearestVisible(from);
        this.onto = i >= 0 ? ctx.nav.nodes[i] : null;
      }
      if (this.onto && Math.hypot(this.onto.x - this.pos.x, this.onto.z - this.pos.z) > 0.8) return this.onto;
      return this.pos;
    }
    return goal;
  }
  /** 33.0: the node it walks to when its goal has no route from here (38.0: looked up again after a re-plan). */
  private onto: THREE.Vector3 | null = null;
  private ontoStale = true;

  /** Can it walk straight from `from` to `to` (body height)? Arena bots (7.0) also count low walls they vault. */
  protected directClear(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return ctx.nav.clear(from, to);
  }

  /** A graph route (7.0: arena bots may take the links over low walls). */
  protected routeTo(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return ctx.nav.route(from, to);
  }

  /** Mid-vault or mid-jump (7.0, arena bots): low walls marked vaultable don't block. Always false in survival. */
  protected vaulting = false;

  /** Feet to the floor each frame (arena bots override it to fly a jump). */
  protected ground(ctx: EnemyCtx, dt: number) {
    this.followGround(ctx, dt);
  }

  /** Follows stairs and walkways; recovers if anything ever pushes us off the map. */
  protected followGround(ctx: EnemyCtx, dt: number) {
    const g = ctx.col.groundHeightAt(this.pos.x, this.pos.z, this.radius * 0.6, this.pos.y);
    if (this.pos.y > g && this.pos.y - g < 0.6) {
      this.pos.y = g;
      this.fallV = 0;
    } else if (this.pos.y > g) {
      this.fallV -= 15 * dt;
      this.pos.y = Math.max(g, this.pos.y + this.fallV * dt);
    } else {
      this.pos.y = g;
      this.fallV = 0;
    }
    const b = ctx.bounds;
    if (this.pos.y < -9 || this.pos.x < b.min.x || this.pos.x > b.max.x || this.pos.z < b.min.y || this.pos.z > b.max.y) {
      const i = ctx.nav.nearestVisible(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z));
      const n = ctx.nav.nodes[i >= 0 ? i : 0];
      this.pos.set(n.x, n.y - 1, n.z);
      this.vel.set(0, 0, 0);
    }
  }

  protected move(desired: THREE.Vector3, ctx: EnemyCtx, dt: number) {
    // Separation from other enemies.
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = this.radius + o.radius + 0.25;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        desired.x += (dx / d) * (min - d) * 6;
        desired.z += (dz / d) * (min - d) * 6;
      } else if (d2 <= 1e-6) {
        // Exactly on top of each other (spawned on one point): part along a per-enemy direction.
        desired.x += Math.cos(this.seed) * min * 6;
        desired.z += Math.sin(this.seed) * min * 6;
      }
    }
    const accel = this.stagger > 0 ? 2 : 10;
    this.vel.x = damp(this.vel.x, desired.x, accel, dt);
    this.vel.z = damp(this.vel.z, desired.z, accel, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    ctx.col.resolveCircle(this.pos, this.radius, 1.8, 0.3, this.vaulting);
    this.ground(ctx, dt);
    // Never overlap the player.
    const p = ctx.player.pos;
    const dx = this.pos.x - p.x;
    const dz = this.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = this.radius + ctx.player.radius;
    if (d < min && d > 1e-4 && Math.abs(this.pos.y - p.y) < 1.5) {
      this.pos.x = p.x + (dx / d) * min;
      this.pos.z = p.z + (dz / d) * min;
    }
  }

  update(dt: number, ctx: EnemyCtx) {
    this.lastCtx = ctx;
    this.stateT += dt;
    this.stagger = Math.max(0, this.stagger - dt);
    this.flash = Math.max(0, this.flash - dt * 7);
    this.leanX.update(dt);
    this.leanZ.update(dt);
    if (this.state === 'dying') {
      this.updateDeath(dt, ctx);
    } else if (this.stun > 0) {
      this.stun -= dt;
      this.flash = Math.max(this.flash, Math.random() < 0.5 ? 0.8 : 0.2);
      this.leanX.impulse((Math.random() - 0.5) * 6);
      this.leanZ.impulse((Math.random() - 0.5) * 6);
      this.move(new THREE.Vector3(), ctx, dt);
      this.onStunned();
    } else if (this.held) {
      this.stateT = Math.min(this.stateT, Enemy.HOLD_POSE);
      this.vel.set(0, 0, 0);
      this.animate(dt, ctx, 0);
    } else {
      this.think(dt, ctx);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const prev = Math.floor(this.walkPhase / Math.PI);
      this.walkPhase += hs * dt * (this.heavy ? 2.4 : 2.0);
      if (Math.floor(this.walkPhase / Math.PI) !== prev && hs > 1 && this.stepIdx++ % 1 === 0) {
        if (this.pos.distanceToSquared(ctx.player.pos) < 400) ctx.audio.enemyStep(this.pos, this.heavy, ctx.audio.stepSurface?.(ctx.col.groundSurfaceAt(this.pos.x, this.pos.z, this.pos.y)));
      }
      this.animate(dt, ctx, hs);
    }
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    r.body.rotation.x += this.leanX.value * 0.06;
    r.body.rotation.z += this.leanZ.value * 0.06;
    const f = this.flash;
    r.armorMat.emissive.setRGB(f * 2.5, f * 2.5, f * 2.5);
    r.clothMat.emissive.setRGB(f * 1.2, f * 1.2, f * 1.2);
    // Visor lights up on emergence.
    if (this.state === 'emerge') r.glowMat.color.copy(this.glowBase).multiplyScalar(Math.min(1, this.stateT * 2));
    else if (this.alive) r.glowMat.color.copy(this.glowBase).multiplyScalar(1 + f * 0.6);
  }

  private updateDeath(dt: number, ctx: EnemyCtx) {
    this.dieT += dt;
    const t = this.dieT;
    const r = this.rig;
    this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    ctx.col.resolveCircle(this.pos, this.radius, 1.8);
    this.followGround(ctx, dt);
    const fall = easeOut(clamp(t / 0.55, 0, 1));
    r.root.rotation.x = -fall * 1.45;
    r.body.rotation.set(0, 0, 0);
    r.legL.rotation.x = -fall * 0.6;
    r.legR.rotation.x = -fall * 0.2;
    r.armL.rotation.x = -fall * 1.5;
    r.armR.rotation.x = -fall * 1.1;
    if (this.look.organic) {
      // A body: it lies still, then the sand takes it (no glitch, no sparks).
      r.root.position.copy(this.pos);
      if (t > 2.6) r.root.position.y -= (t - 2.6) * 1.1;
      if (t > 3.7) {
        r.root.visible = false;
        this.dead = true;
      }
      return;
    }
    // Digital glitch dissolve.
    if (t > 0.45) {
      const k = (t - 0.45) / 0.9;
      for (const p of r.parts) p.visible = Math.random() > k * 1.1;
      r.glowMat.color.copy(this.glowBase).multiplyScalar(Math.random() < 0.5 ? 0 : 1.5);
      if (Math.random() < 0.3) ctx.fx.sparks(new THREE.Vector3(this.pos.x + rand(-0.5, 0.5), this.pos.y + 0.2, this.pos.z + rand(-0.5, 0.5)), UP, 2, this.accent, 3);
    }
    if (t > 1.4) {
      r.root.visible = false;
      this.dead = true;
    }
    r.root.position.copy(this.pos);
  }

  protected abstract think(dt: number, ctx: EnemyCtx): void;
  protected abstract animate(dt: number, ctx: EnemyCtx, speed: number): void;

  /** Shared walk cycle. */
  protected walkCycle(k: number, swing: number, kneeBend: number) {
    const r = this.rig;
    const s = Math.sin(this.walkPhase);
    r.legL.rotation.x = s * swing * k;
    r.legR.rotation.x = -s * swing * k;
    r.kneeL.rotation.x = Math.max(0, Math.sin(this.walkPhase + 1.2)) * kneeBend * k;
    r.kneeR.rotation.x = Math.max(0, Math.sin(this.walkPhase + 1.2 + Math.PI)) * kneeBend * k;
    r.body.position.y = r.body.userData.baseY + Math.abs(Math.cos(this.walkPhase)) * 0.05 * k;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig.root);
    disposeRig(this.rig);
    this.rig.armorMat.dispose();
    this.rig.clothMat.dispose();
    this.rig.glowMat.dispose();
  }
}


// ======================================================================= Tactical survival enemies
/*
  Survival enemies run a two-rate brain (5.0):
   - decide (heavy, started only by the squad's ThinkScheduler, 2–6 times a second): perception ray,
     cover upkeep and search, utility scoring of the candidate actions, goals;
   - act (every frame, cheap): the current action's executor — steering, aiming, firing timers, crouch.
  The live player position is read only where the enemy can physically know it: after its own
  perception ray hit (tac.sees), for contact (melee reach, not walking through him), and in damage.
*/
const _eye = new THREE.Vector3();
const _head = new THREE.Vector3();
const _gGrip = new THREE.Vector3();
const _gFore = new THREE.Vector3();
const _gGripQ = new THREE.Quaternion();
const _gForeQ = new THREE.Quaternion();
const _cand: { h: Combatant; s: number }[] = [];
const _fc = new THREE.Vector3();
/** A gunner with a cover picked keeps to it (and peeks from it) this long after the last news of him. */
const HOLD_COVER = 9;

export abstract class TacticalEnemy extends Enemy implements TacAgent {
  tac: TacState = createTac(this);
  perch: THREE.Vector3 | null = null;
  abstract decide(ctx: EnemyCtx): void;

  get reloading() {
    return this.tac.action === 'reload';
  }

  /** Where the squad thinks the enemy is (live only while this one sees its target). */
  protected threat(ctx: EnemyCtx): THREE.Vector3 | null {
    const g = this.tac.target;
    return this.tac.sees && g ? g.pos : ctx.squad.lkp;
  }

  /** The hostile it fights now (seen), else the squad's focus, for the cover verdict cache. */
  protected threatTag(ctx: EnemyCtx) {
    return (this.tac.sees && this.tac.target ? this.tac.target : ctx.squad.focus?.who)?.uid;
  }

  /**
   * One ray from the eyes (crouch-aware) to a hostile's head, within the weather's sight range. With
   * several hostiles (TDM) it looks first at the one it is fighting, then the squad's focus, then the
   * nearest — two rays at most, one when the frame's budget is short.
   */
  protected perceive(ctx: EnemyCtx) {
    const t = this.tac;
    const sq = ctx.squad;
    t.sees = false;
    // Hunkered, the eyes are at the cover test's head point (1.0 m): if he can see that, it sees him.
    _eye.set(this.pos.x, this.pos.y + 1.55 - 0.55 * this.crouch, this.pos.z);
    const range = Math.min(ctx.sightRange ?? 70, 70);
    const focus = sq.focus?.who ?? null;
    let any = false;
    let n = 0;
    for (const h of hostilesOf(ctx)) {
      if (!h.alive) continue;
      any = true;
      _head.set(h.pos.x, h.pos.y + h.headY, h.pos.z);
      const d = _eye.distanceTo(_head);
      if (d > range) continue;
      const c = _cand[n] ?? (_cand[n] = { h, s: 0 });
      c.h = h;
      c.s = d - (h === t.target ? 12 : 0) - (h === focus ? 6 : 0);
      n++;
    }
    if (!any) return;
    if (n > 1) _cand.slice(0, n).sort((a, b) => a.s - b.s).forEach((c, i) => (_cand[i] = c));
    const tries = n <= 1 ? n : sq.sched.canAfford(2) ? 2 : 1;
    for (let k = 0; k < tries; k++) {
      const h = _cand[k].h;
      _head.set(h.pos.x, h.pos.y + h.headY, h.pos.z);
      if (!sq.los(_eye, _head) || (ctx.concealment && ctx.concealment(_eye, _head) < 0.35)) continue;
      t.sees = true;
      t.target = h;
      t.seenT = ctx.time;
      sq.sighting(this, h.pos, h.vel, h);
      return;
    }
    // A look from hunkered behind cover proves nothing; a proper look that finds nothing does.
    if (this.crouch < 0.5) sq.missedLook();
  }

  suppress(amount: number, ctx: EnemyCtx) {
    const t = this.tac;
    if (!this.alive) return;
    ctx = this.ctxNow ?? ctx;
    t.suppression += amount;
    t.urgent = true;
    const now = ctx.time;
    const threshold = now < t.pinResistUntil ? 1.7 : 1.0;
    if (this.kind === 'gunner' && t.suppression >= threshold && now >= t.pinnedUntil) {
      t.pinnedUntil = now + rand(1.6, 2.4);
      t.pinResistUntil = t.pinnedUntil + 3;
      ctx.squad.bark(this, 'pinned');
    }
  }

  protected enter(action: string, ctx: EnemyCtx, phase = '') {
    const t = this.tac;
    if (t.action === action && t.phase === phase) return;
    t.action = action;
    t.phase = phase;
    t.actionT = t.phaseT = 0;
    t.bestD = Infinity;
    t.progressT = 0;
    t.goalBest = Infinity;
    t.goalT = 0;
    ctx.squad.releaseShot(this);
  }

  protected setPhase(phase: string) {
    this.tac.phase = phase;
    this.tac.phaseT = 0;
  }

  /** Steer towards a floor position at `speed`; returns the XZ distance left. */
  protected moveTo(goal: THREE.Vector3, speed: number, ctx: EnemyCtx, dt: number, desired: THREE.Vector3) {
    const tgt = this.steerTarget(goal, ctx, dt);
    desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
    const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    const l = desired.length();
    if (l > 1e-4) desired.multiplyScalar((speed * Math.min(1, d / 0.8)) / l);
    return d;
  }

  /**
   * Hardly moved for 3 s while trying to (or no route for 1.5 s): the goal is no good from here.
   * Measured as displacement, not distance to the goal: a route via stairs first leads away from it.
   */
  protected stalled(d: number, dt: number) {
    const t = this.tac;
    // Dithering in a doorway moves it more than a metre back and forth, which the displacement test
    // below takes for progress: also give up after 12 s without getting 0.5 m nearer the goal (6.0;
    // long enough for any detour round a building or up a stair).
    // (A goal that jumped further away in one step is a new goal: start counting again.)
    if (d < t.goalBest - 0.5 || t.goalBest === Infinity || d > t.goalBest + 3 + t.goalT * 6) {
      t.goalBest = d;
      t.goalT = 0;
    } else if ((t.goalT += dt) > 12) {
      t.goalBest = d;
      t.goalT = 0;
      return true;
    }
    if (t.bestD === Infinity || this.pos.distanceToSquared(t.progressAt) > 1) {
      t.progressAt.copy(this.pos);
      t.bestD = d;
      t.progressT = 0;
      return false;
    }
    t.progressT += dt;
    return t.progressT > 3 || (this.noRoute && t.progressT > 1.5);
  }

  /** Face a direction of travel, or a point. */
  protected faceMove(dt: number) {
    if (Math.hypot(this.vel.x, this.vel.z) > 0.3) this.faceTowards(this.pos.clone().add(this.vel), dt, 8);
  }

  /** Goals for the out-of-contact actions (decide side). */
  protected planCalm(ctx: EnemyCtx) {
    const t = this.tac;
    const sq = ctx.squad;
    if (t.action === 'hunt') {
      // Spread round the predicted LKP so hunters don't queue on one point.
      const g = sq.huntGoal;
      const a = this.seed;
      const off = new THREE.Vector3(g.x + Math.cos(a) * 1.8, g.y, g.z + Math.sin(a) * 1.8);
      t.goal = ctx.col.blocked(off, 0.4) ? g.clone() : off;
    } else if (t.action === 'search') {
      if (t.phase !== 'look') {
        const pt = sq.claimSearch(this);
        if (pt) t.goal = pt.pos;
        else if (!t.goal && sq.lkp) {
          // Every point taken or checked: sweep a random spot near where he was, not stand about.
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
          t.goal = nearestNode(ctx, new THREE.Vector3(sq.lkp.x + Math.cos(a) * r, sq.lkp.y, sq.lkp.z + Math.sin(a) * r), sq.lkp.y, this.pos);
        }
      }
    } else if (t.action === 'idle' && ctx.lanes && t.lane >= 0) {
      this.planLane(ctx, ctx.lanes[t.lane]);
    } else if (t.action === 'idle') {
      if (!t.goal || (t.phase === 'pause' && t.phaseT > 3)) {
        // Roam: a random node anywhere on the map (no knowledge of where he is), mostly on its own
        // level; a goal it can't reach stalls quickly and is replaced after the pause.
        const nodes = ctx.nav.nodes;
        let n = nodes[Math.floor(Math.random() * nodes.length)];
        for (let k = 0; k < 6 && n && Math.abs(n.y - 1 - this.pos.y) > 1.5 && Math.random() < 0.8; k++) n = nodes[Math.floor(Math.random() * nodes.length)];
        t.goal = n ? nearestNode(ctx, new THREE.Vector3(n.x, n.y - 1, n.z), n.y - 1) : null;
        this.setPhase('walk');
      }
    }
  }

  /**
   * TDM, no contact: push along its lane towards the other base, then work back to mid-map and push
   * again (it never walks into their spawn: the lane stops short of it). Each bot keeps its own
   * sideways offset so a lane isn't walked single file.
   */
  private planLane(ctx: EnemyCtx, L: THREE.Vector3[]) {
    const t = this.tac;
    if (t.laneIdx < 0 || t.laneIdx >= L.length) {
      // Join at the nearest waypoint, heading on towards the other base.
      let best = 0, bd = Infinity;
      for (let i = 0; i < L.length; i++) {
        const d = Math.hypot(L[i].x - this.pos.x, L[i].z - this.pos.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      t.laneIdx = Math.min(L.length - 1, best + (bd < 4 ? 1 : 0));
      t.laneDir = 1;
      t.goal = null;
    }
    if (t.goal && t.phase !== 'pause') return;
    if (t.goal) {
      // Arrived (or stalled): the next waypoint.
      t.laneIdx += t.laneDir;
      if (t.laneIdx >= L.length) {
        t.laneDir = -1;
        t.laneIdx = L.length - 2;
      } else if (t.laneDir < 0 && t.laneIdx <= Math.floor(L.length / 2) - 1) t.laneDir = 1;
      t.laneIdx = Math.max(0, Math.min(L.length - 1, t.laneIdx));
    }
    const w = L[t.laneIdx];
    const off = new THREE.Vector3(w.x + Math.cos(this.seed) * 1.6, w.y, w.z + Math.sin(this.seed) * 1.6);
    t.goal = ctx.col.blocked(off, 0.45) ? w.clone() : off;
    this.setPhase('walk');
  }

  /** Executors for hunt / search / idle (act side). Returns true if it handled the action. */
  protected actCalm(ctx: EnemyCtx, dt: number, desired: THREE.Vector3, speed: number) {
    const t = this.tac;
    const sq = ctx.squad;
    if (t.action === 'hunt') {
      if (t.goal) {
        const d = this.moveTo(t.goal, speed * 0.85, ctx, dt, desired);
        this.faceMove(dt);
        if (d < 0.8 || this.stalled(d, dt)) t.goal = null;
      }
      return true;
    }
    if (t.action === 'search') {
      if (t.phase === 'look') {
        // Look round the corner: a slow sweep either way, then the next point.
        this.yaw += Math.sin(t.phaseT * 2.2 + this.seed) * dt * 1.8;
        if (t.phaseT > 1.6) {
          sq.searched(this);
          this.setPhase('');
          t.goal = null;
          t.urgent = true;
        }
      } else if (t.goal) {
        const d = this.moveTo(t.goal, speed * 0.55, ctx, dt, desired);
        this.faceMove(dt);
        if (d < 1.2 || this.stalled(d, dt)) this.setPhase('look');
      } else t.urgent = true;
      return true;
    }
    if (t.action === 'idle') {
      if (t.goal && t.phase !== 'pause') {
        // TDM lanes are a purposeful advance; survival roaming is a stroll.
        const lanes = !!ctx.lanes && t.lane >= 0;
        const d = this.moveTo(t.goal, speed * (lanes ? 0.8 : 0.4), ctx, dt, desired);
        this.faceMove(dt);
        if (d < (lanes ? 2.5 : 1) || this.stalled(d, dt)) {
          this.setPhase('pause');
          if (lanes) t.urgent = true;
        }
      }
      return true;
    }
    return false;
  }

  /** Calm actions for the squad mode (both kinds). */
  protected calmOptions(ctx: EnemyCtx, opts: Option<string>[]) {
    const sq = ctx.squad;
    if (sq.mode === 'hunt' && sq.lkp) opts.push({ action: this.perch ? 'watch' : 'hunt', score: 0.6 });
    else if (sq.mode === 'search') opts.push({ action: this.perch ? 'watch' : 'search', score: 0.6 });
    else opts.push({ action: this.perch ? 'watch' : 'idle', score: 0.3 });
  }

  protected onDeath(ctx: EnemyCtx) {
    ctx.squad.releaseCover(this);
    ctx.squad.died(this);
  }

  protected onHit(ctx: EnemyCtx) {
    this.suppress(0.45, ctx);
  }
}

// ======================================================================= Runner
/**
 * Melee rusher. Engaged, it takes an angular slot round the player and holds there out of reach
 * until the director sends the rushers together (an opening, enough of them massed, or a timeout);
 * then it charges, zig-zagging, swings, and either keeps at it up close or falls back to its slot.
 * Close in (< 7 m), on another level, or without a slot it simply charges. Near misses make it juke.
 */
export class Runner extends TacticalEnemy {
  radius = 0.38;
  speed: number;
  hitboxes = [
    { y: 1.55, r: 0.19, mult: 2, fwd: 0.3 },
    { y: 1.15, r: 0.33, mult: 1, fwd: 0.15 },
    { y: 0.6, r: 0.28, mult: 0.75 },
  ];
  accent: THREE.Color;
  heavy = false;
  private zig = rand(0.8, 1.4);
  private dodgeDir = 1;

  constructor(spawn: THREE.Vector3, difficulty: number, look: EnemyLook = NEON_SYNTHS) {
    super(look.buildRunner(), 60, spawn, 'runner', look);
    this.accent = look.runnerAccent;
    this.speed = 5.6 + difficulty * 0.35 + rand(-0.3, 0.3);
    this.rig.body.userData.baseY = 0.95;
    this.crouchDrop = 0;
  }

  private get swinging() {
    const a = this.tac.action;
    return a === 'windup' || a === 'strike' || a === 'recover';
  }

  decide(ctx: EnemyCtx) {
    const t = this.tac;
    const sq = ctx.squad;
    if (t.action === 'emerge' && this.stateT < 0.55) return;
    this.perceive(ctx);
    if (this.swinging) return;
    const now = ctx.time;
    const threat = this.threat(ctx);
    const engaged = sq.mode === 'engage' && !!threat;
    const opts: Option<string>[] = [];
    if (t.suppression >= 0.8 && now > t.pinResistUntil) opts.push({ action: 'dodge', score: 0.95, interrupt: true });
    if (engaged && threat) {
      const d = Math.hypot(threat.x - this.pos.x, threat.z - this.pos.z);
      // A slot is planned once per engagement; on another level than him there's no slot to hold
      // (decided now, not re-tested every decide: halfway up a stair the height difference flips).
      if (!t.stagePos && !t.go && sq.lkp && t.action !== 'rush') {
        if (Math.abs(threat.y - this.pos.y) > 2) t.go = true;
        else {
          const a = t.slot;
          const want = new THREE.Vector3(sq.lkp.x + Math.cos(a) * 11, sq.lkp.y, sq.lkp.z + Math.sin(a) * 11);
          t.stagePos = nearestNode(ctx, want, sq.lkp.y, this.pos);
        }
      }
      // A charge in progress is kept until it lands (stage again only after a swing, from recover).
      const rushNow = t.go || d < 7 || !t.stagePos || t.action === 'rush';
      opts.push({ action: 'rush', score: rushNow ? 0.85 : 0.1 });
      opts.push({ action: 'stage', score: rushNow ? 0 : 0.7 });
    } else this.calmOptions(ctx, opts);
    const committed = t.action === 'dodge' && t.phaseT < 0.45;
    const next = choose(opts, t.action, committed);
    if (next && next !== t.action) {
      if (next === 'dodge') {
        this.dodgeDir = Math.random() < 0.5 ? -1 : 1;
        t.pinResistUntil = now + 2.5;
        t.suppression = 0;
      }
      if (next !== 'stage') t.staged = false;
      this.enter(next, ctx);
    }
    this.planCalm(ctx);
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const t = this.tac;
    t.actionT += dt;
    t.phaseT += dt;
    t.suppression = Math.max(0, t.suppression - 0.6 * dt);
    const sq = ctx.squad;
    const desired = new THREE.Vector3();
    // Contact is felt, not seen: the nearest hostile within arm's reach (else the one it fights).
    const victim = this.nearestHostile(ctx);
    const p = victim?.pos ?? ctx.player.pos;
    const reach = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const contact = !!victim && reach < 1.9 && Math.abs(p.y - this.pos.y) < 1.2 && victim.alive;
    switch (t.action) {
      case 'emerge':
        if (this.stateT > 0.55) {
          ctx.audio.runnerScreech(this.chest, this.look.voice);
          this.enter('idle', ctx);
          t.urgent = true;
        }
        break;
      case 'rush': {
        const target = t.sees && t.target ? t.target.pos : sq.lkp;
        if (target) {
          const tgt = this.steerTarget(target, ctx, dt);
          desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z).normalize();
          if (tgt === target && t.sees && reach > 4.5) {
            // Zig-zag approach makes them harder to track.
            const side = Math.sin(ctx.time * 2.6 * this.zig + this.seed) * 0.75;
            desired.x += -desired.z * side;
            desired.z += desired.x * side;
            desired.normalize();
          }
          desired.multiplyScalar(this.speed * (this.stagger > 0 ? 0.3 : 1));
          this.faceTowards(this.pos.clone().add(this.vel), dt, 12);
          // At the LKP and he isn't there: the squad's hunt takes over at the next decide.
          if (!t.sees && Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < 1.2) t.urgent = true;
        }
        if (contact) {
          this.enter('windup', ctx);
          sq.attacked(this, p);
          ctx.audio.swipe(this.chest);
        }
        break;
      }
      case 'stage': {
        if (t.stagePos) {
          const d = this.moveTo(t.stagePos, this.speed * 0.8, ctx, dt, desired);
          if (d < 1.5) {
            if (!t.staged) {
              t.staged = true;
              t.stagedSince = ctx.time;
            }
            // Hold: face him, shift weight side to side, ready to go.
            const look = this.threat(ctx);
            if (look) this.faceTowards(look, dt, 6);
            const sway = Math.sin(ctx.time * 1.7 + this.seed);
            desired.set(Math.cos(this.yaw) * sway * 0.8, 0, -Math.sin(this.yaw) * sway * 0.8);
          } else {
            this.faceMove(dt);
            if (this.stalled(d, dt)) {
              t.stagePos = null;
              t.go = true;
              t.urgent = true;
            }
          }
        }
        if (contact) {
          this.enter('windup', ctx);
          sq.attacked(this, p);
          ctx.audio.swipe(this.chest);
        }
        break;
      }
      case 'dodge': {
        // A juke sideways out of the line of fire.
        const look = this.threat(ctx) ?? p;
        const dx = look.x - this.pos.x, dz = look.z - this.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        desired.set((-dz / l) * this.dodgeDir * 6.5, 0, (dx / l) * this.dodgeDir * 6.5);
        this.faceTowards(look, dt, 10);
        if (t.phaseT > 0.45) {
          this.enter('rush', ctx);
          t.urgent = true;
        }
        break;
      }
      case 'windup':
        this.faceTowards(p, dt, 14);
        desired.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().multiplyScalar(1.2);
        if (t.actionT > 0.36) {
          this.enter('strike', ctx);
          if (victim && reach < 2.5 && Math.abs(p.y - this.pos.y) < 1.2 && victim.alive) {
            const dmg = 14 + ctx.difficulty;
            // A blade on a bot is weighed against bot health (a gunner has 150, the player 100).
            // A blade on a bot is weighed against bot health (a gunner has 150, the player 100).
            victim.hurt(victim.isPlayer ? dmg : dmg * 1.8, this.chest.clone(), this);
          }
          ctx.audio.swipe(this.chest);
        }
        break;
      case 'strike':
        if (t.actionT > 0.14) this.enter('recover', ctx);
        break;
      case 'recover':
        desired.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().multiplyScalar(-1.5);
        if (t.actionT > 0.55) {
          // Keep at it up close; otherwise fall back to a (new) slot and wait for the next signal.
          t.stagePos = null;
          t.staged = false;
          t.go = reach < 4;
          this.enter(t.go ? 'rush' : 'stage', ctx);
          t.urgent = true;
        }
        break;
      default:
        this.actCalm(ctx, dt, desired, this.speed);
    }
    this.state = t.action === 'emerge' ? 'emerge' : t.action === 'rush' ? 'chase' : t.action;
    this.move(desired, ctx, dt);
  }

  protected onHit(ctx: EnemyCtx) {
    super.onHit(ctx);
    if (this.tac.action === 'windup') this.enter('recover', ctx);
  }

  /** The hostile within reach if any, else the one it fights, else (survival) the player. */
  private nearestHostile(ctx: EnemyCtx): Combatant | null {
    let best: Combatant | null = null;
    let bd = 1.9;
    for (const h of hostilesOf(ctx)) {
      if (!h.alive) continue;
      const d = Math.hypot(h.pos.x - this.pos.x, h.pos.z - this.pos.z);
      if (d < bd && Math.abs(h.pos.y - this.pos.y) < 1.2) {
        bd = d;
        best = h;
      }
    }
    return best ?? this.tac.target ?? hostilesOf(ctx)[0] ?? null;
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    const r = this.rig;
    const k = clamp(speed / 5, 0, 1.2);
    this.walkCycle(k, 0.95, 1.4);
    r.body.rotation.set(0.38 * k, 0, 0);
    r.head.rotation.x = -0.3 * k;
    const s = Math.sin(this.walkPhase);
    let armL = 0.5 - s * 0.8 * k;
    let armR = 0.5 + s * 0.8 * k;
    let fore = -0.9;
    const a = this.tac.action;
    if (a === 'windup') {
      const t = Math.min(1, this.tac.actionT / 0.3);
      armL = armR = 0.5 - t * 2.6;
      fore = -0.4;
      r.body.rotation.x = -0.15;
    } else if (a === 'strike') {
      armL = armR = -2.1 + (this.tac.actionT / 0.14) * 3.0;
      fore = -0.2;
      r.body.rotation.x = 0.5;
    } else if (a === 'emerge') {
      armL = armR = 0.2;
      r.body.rotation.x = 0.6 - this.stateT;
    } else if (a === 'stage' && this.tac.staged) {
      // Coiled: low, arms forward, ready to spring.
      r.body.rotation.x = 0.45;
      armL = armR = -0.3;
      fore = -1.2;
    }
    r.armL.rotation.set(armL, 0, 0.25);
    r.armR.rotation.set(armR, 0, -0.25);
    r.foreL.rotation.x = fore;
    r.foreR.rotation.x = fore;
    if (r.tail) r.tail.rotation.x = 0.25 + 0.6 * k + Math.sin(ctx.time * 13 + this.seed) * 0.12 * (0.3 + k);
  }
}

// ======================================================================= Gunner
/**
 * Rifleman. Engaged, it takes cover that suits its role (suppressor: a line on him at mid range;
 * flanker: a spot on its side of the squad's front), then pops and shoots: hide crouched, peek
 * (stand up over low cover or lean out of tall cover), a laser telegraph, a burst, back down. It
 * keeps re-checking the cover against where he is: seen from his position, the cover is blown and
 * it relocates; no longer a shot from there, it quietly picks another. Pinned by near misses, it
 * ducks and stops shooting. Suppressors keep firing at the last known position for a moment after
 * losing sight. Twelve rounds, then a reload behind cover.
 */
export class Gunner extends TacticalEnemy {
  radius = 0.48;
  speed: number;
  hitboxes = [
    { y: 1.86, r: 0.2, mult: 2 },
    { y: 1.32, r: 0.4, mult: 1 },
    { y: 0.62, r: 0.32, mult: 0.75 },
  ];
  accent: THREE.Color;
  heavy = true;
  private shots = 0;
  private burst = 3;
  private popDelay = 1;
  private strafe = 1;
  protected laser: THREE.Mesh;
  private laserMat: THREE.MeshBasicMaterial;
  private aimPoint = new THREE.Vector3();
  protected aimAt = new THREE.Vector3();
  /** Bursts called off because the muzzle was behind its own cover (DEV counter). */
  blockedShots = 0;
  /** Bursts cut short because a teammate stood in the line of fire (DEV counter, TDM). */
  heldFire = 0;
  /**
   * 11.0: an aimed shot: the rifle comes up to the eye, so others can read that it is taking a
   * precise shot. Survival gunners aim in their telegraphed aim and fire phases; the arena brain sets
   * it by range. `aimRaise` is the animated blend (0 hip … 1 at the eye).
   */
  isAiming = false;
  aimRaise = 0;
  private gunPose: { hip: THREE.Vector3; eye: THREE.Vector3; armsHip: number[]; armsEye: number[] } | null = null;
  /** 22.0: the merc rig's arm chains (the hands on the gun by IK), and the gun pose last solved for. */
  private grip: { R: ArmChain; L: ArmChain; last: number[] } | null = null;
  /** 22.0: the gun's recoil back along the barrel (m); the hands ride it. */
  gunKick = 0;

  constructor(spawn: THREE.Vector3, difficulty: number, scene: THREE.Scene, perch: THREE.Vector3 | null = null, look: EnemyLook = NEON_SYNTHS) {
    super(look.buildGunner(), 150, spawn, 'gunner', look);
    this.accent = look.gunnerAccent;
    this.perch = perch;
    this.speed = 3.1 + difficulty * 0.1;
    this.rig.body.userData.baseY = 1.0;
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.BoxGeometry(0.012, 0.012, 1);
    g.translate(0, 0, 0.5);
    this.laser = new THREE.Mesh(g, this.laserMat);
    this.laser.visible = false;
    this.laser.frustumCulled = false;
    scene.add(this.laser);
    // 11.0: the hip pose the builder set, and the raised one: the rifle on the right cheek, just under
    // the head (its top 3 cm below the chin), arms lifted to hold it there. Measured from this rig's
    // head, so every look's gunner gets its own.
    const r = this.rig;
    if (r.weapon) {
      const h = r.head.position;
      this.gunPose = {
        hip: r.weapon.position.clone(),
        eye: new THREE.Vector3(-0.07, h.y - 0.11, h.z + 0.34),
        armsHip: [r.armL.rotation.x, r.foreL.rotation.x, r.armR.rotation.x, r.foreR.rotation.x],
        armsEye: [r.armL.rotation.x - 0.55, r.foreL.rotation.x + 0.25, r.armR.rotation.x - 0.65, r.foreR.rotation.x + 0.15],
      };
    }
    // 22.0: a merc rig holds its gun with both hands (RigIK), elbows down and out.
    if (r.root.userData.ik && r.handL && r.handR) {
      this.grip = {
        R: { arm: r.armR, fore: r.foreR, hand: r.handR, upper: ARM.upper, lower: ARM.lower, pole: new THREE.Vector3(-0.6, -1, -0.3) },
        L: { arm: r.armL, fore: r.foreL, hand: r.handL, upper: ARM.upper, lower: ARM.lower, pole: new THREE.Vector3(0.5, -1, -0.1) },
        last: [NaN, 0, 0, 0, 0],
      };
    }
    if (perch) {
      this.tac.coverPos = perch;
      this.tac.peekPos = perch;
      this.tac.peekKind = 'stand';
      this.tac.role = 'sniper';
    }
  }

  private atCover() {
    const c = this.tac.coverPos;
    return !!c && Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 1.0 && Math.abs(c.y - this.pos.y) < 1;
  }

  decide(ctx: EnemyCtx) {
    const t = this.tac;
    const sq = ctx.squad;
    const now = ctx.time;
    if (t.action === 'emerge' && this.stateT < 0.7) return;
    const sinceLast = Math.min(0.6, now - t.lastDecide);
    this.perceive(ctx);
    const threat = this.threat(ctx);
    const tag = this.threatTag(ctx);
    // Just lost him with a cover already picked: carry on to it and look from there (the hunt is
    // for when a look from cover finds nothing, or the trail goes cold).
    const holding = sq.mode === 'hunt' && !!threat && t.coverId >= 0 && now - sq.lkpT < HOLD_COVER;
    const engaged = (sq.mode === 'engage' || holding) && !!threat;
    const pinned = now < t.pinnedUntil;

    // ---- Cover upkeep: blown (he can see the crouched body) or stale (no shot from it any more).
    if (engaged && threat && !this.perch && t.coverId >= 0 && t.coverPos) {
      if (t.sees && this.atCover() && t.action !== 'takeCover') {
        t.exposedT = isProtected(t.coverPos, threat, sq.los).ok ? 0 : t.exposedT + sinceLast;
      }
      if (now >= t.coverCheckT && sq.sched.canAfford(7)) {
        t.coverCheckT = now + 1.5;
        let ev = sq.cover.get(coverKey(t.coverId, tag), threat, now);
        if (!ev) {
          ev = evaluateCover(t.coverPos, threat, sq.los, (q) => !ctx.col.blocked(q, 0.35), Math.min(34, (ctx.sightRange ?? 60) + 1), peekSight(ctx));
          sq.cover.put(coverKey(t.coverId, tag), threat, now, ev);
        }
        if (!ev.protected) t.exposedT = Math.max(t.exposedT, 0.3);
        else if (!ev.peek) {
          // Two checks in a row without a shot (he may only be passing a pillar): then move.
          if (t.noPeekChecks++ >= 1) t.coverStale = true;
          t.coverCheckT = now + 0.75;
        } else if (t.phase !== 'peek' && t.phase !== 'aim' && t.phase !== 'fire') {
          t.noPeekChecks = 0;
          // The way out may change side as he moves.
          t.peekPos = ev.peek;
          t.peekKind = ev.kind;
        }
      }
    }
    // ---- Cover search (budgeted; a deferred search simply tries again next decide).
    if (engaged && threat && !this.perch) {
      const blown = t.exposedT >= 0.3;
      const need = t.coverId < 0 || blown || t.coverStale;
      if (need && now >= t.noCoverUntil && !(t.action === 'fight' && (t.phase === 'aim' || t.phase === 'fire'))) {
        const old = t.coverId;
        if (old >= 0) t.badCover.set(old, now + (blown ? 8 : 3));
        const res = sq.findCover(this, threat, ctx, { exclude: old >= 0 ? old : undefined, maxTravel: pinned ? 9 : undefined, tag });
        if (res && res !== 'deferred') {
          t.coverId = res.id;
          t.coverPos = res.pos;
          t.peekPos = res.peek;
          t.peekKind = res.kind;
          t.exposedT = 0;
          t.coverStale = false;
          t.noPeekChecks = 0;
          t.coverCheckT = now + 1.5;
          if (blown) sq.bark(this, 'blown');
          else if (t.role === 'flanker') sq.bark(this, t.side > 0 ? 'flankL' : 'flankR');
          if (!pinned) this.enter('takeCover', ctx);
        } else if (res === null) {
          if (blown) sq.bark(this, 'blown');
          sq.releaseCover(this);
          t.coverStale = false;
          t.noCoverUntil = now + 2.5;
          t.goal = null;
        }
      }
    }

    // ---- Utility selection.
    const opts: Option<string>[] = [];
    if (pinned) opts.push({ action: 'pinned', score: 1, interrupt: true });
    if (t.ammo <= 0) opts.push({ action: 'reload', score: 0.92, interrupt: true });
    if (engaged) {
      if (this.perch) opts.push({ action: 'fight', score: 0.8 });
      else {
        const at = this.atCover();
        opts.push({ action: 'fight', score: t.coverId >= 0 && at && t.exposedT < 0.3 ? 0.8 : 0 });
        opts.push({ action: 'takeCover', score: t.coverId >= 0 && !at ? 0.78 : 0, interrupt: t.exposedT >= 0.3 });
        opts.push({ action: 'advance', score: t.coverId < 0 ? 0.6 : 0 });
      }
    } else this.calmOptions(ctx, opts);
    const firing = t.phase === 'aim' || t.phase === 'fire';
    const committed = ((t.action === 'fight' || t.action === 'advance') && firing) || (t.action === 'reload' && t.actionT < 2.2) || (t.action === 'pinned' && pinned);
    const next = choose(opts, t.action, committed);
    if (next && next !== t.action) {
      if (next === 'reload') sq.bark(this, 'reload');
      this.enter(next, ctx, next === 'fight' ? 'hide' : next === 'advance' ? 'move' : '');
      if (next === 'fight') this.popDelay = this.nextPop();
    }

    // ---- Goals.
    // No cover: work round on open ground (flankers to their side, others to a mid-range point).
    // Unable to see him from there (undergrowth, a corner), it closes in: the point comes nearer
    // the longer it has been blind (15 m down to 5 m), re-planned every 3 s.
    // (Blind since it last saw him, or since this advance began, whichever is later.)
    const blind = Math.min(now - t.seenT, t.actionT);
    const arrived = !!t.goal && Math.hypot(t.goal.x - this.pos.x, t.goal.z - this.pos.z) < 1;
    if (t.action === 'advance' && threat && t.phase === 'move' && (!t.goal || arrived || (blind > 3 && now > t.advanceT))) {
      t.advanceT = now + 3;
      const r = blind > 3 ? Math.max(5, 15 - (blind - 3) * 2) : 15;
      const side = t.role === 'flanker' ? t.side : 0;
      // Still blind after 8 s (the nearest graph node may not be close enough): walk at the LKP itself
      // (it stops 5 m short of him, where nothing conceals him any more).
      if (blind > 8) t.goal = threat.clone();
      else t.goal = side ? sq.openPoint(this, threat, ctx, Math.min(13, r), side) : nearestNode(ctx, new THREE.Vector3().subVectors(this.pos, threat).setY(0).setLength(r).add(threat), threat.y, this.pos);
    }
    this.planCalm(ctx);
  }

  /** A teammate's body within 0.8 m of the line from the muzzle to the aim point (and nearer than it). */
  protected friendInLine(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    if (!ctx.friends) return false;
    for (const f of ctx.friends) {
      if (f === this || !f.alive) continue;
      _fc.set(f.pos.x, f.pos.y + f.chestY, f.pos.z);
      const r = segmentDistance(from, to, _fc);
      if (r.d < 0.8 && r.t > 0.02 && r.t < 0.97) return true;
    }
    return false;
  }

  /** The muzzle now (its matrices refreshed: off-screen and headless rigs aren't updated by a render). */
  protected muzzleWorld() {
    const m = this.rig.muzzle!;
    m.updateWorldMatrix(true, false);
    return m.getWorldPosition(new THREE.Vector3());
  }

  private nextPop() {
    const r = this.tac.role;
    return r === 'suppressor' ? rand(0.5, 1.0) : r === 'sniper' ? rand(1.2, 2.2) : rand(0.9, 1.8);
  }

  /** Aim, telegraph and fire (shared by the cover fight and the open-ground advance). Returns true when the burst is done or aborted. */
  private shootPhases(ctx: EnemyCtx, dt: number): boolean {
    const t = this.tac;
    const sq = ctx.squad;
    const g = t.target;
    const supp = t.role === 'suppressor' || t.role === 'sniper';
    const lkpAge = ctx.time - sq.lkpT;
    // What it aims at: its target while it sees it; a suppressor keeps hosing the last known spot briefly.
    const sees = t.sees && !!g && g.alive;
    const knows = sees || (supp && sq.lkp && lkpAge < 2.5);
    if (sees) this.aimAt.set(g.pos.x, g.pos.y + g.chestY, g.pos.z);
    else if (knows && sq.lkp) this.aimAt.set(sq.lkp.x, sq.lkp.y + 1.1, sq.lkp.z);
    this.faceTowards(this.aimAt, dt, 8);
    const muzzle = this.muzzleWorld();
    if (t.phase === 'aim') {
      this.aimPoint.lerp(this.aimAt, 1 - Math.exp(-8 * dt));
      const T = t.role === 'sniper' ? 0.9 : 0.6;
      this.showLaser(muzzle, this.aimPoint, Math.min(1, t.phaseT / T));
      if (!knows && t.phaseT > 0.25) {
        // Looked out and he isn't where the peek was planned for: re-check the spot now.
        t.coverCheckT = 0;
        t.urgent = true;
        return true;
      }
      if (t.phaseT > T) {
        // Never fire into its own cover or parapet: the eyes clear it, the muzzle may not.
        const dir = new THREE.Vector3().subVectors(this.aimAt, muzzle).normalize();
        const hit = ctx.col.raycast(muzzle, dir, 3);
        if (hit && hit.dist < Math.min(3, muzzle.distanceTo(this.aimAt) - 0.5)) {
          this.blockedShots++;
          if (this.perch && t.peekPos) {
            // Step towards the parapet edge (on the perch) and try again.
            const step = new THREE.Vector3(this.aimAt.x - this.perch.x, 0, this.aimAt.z - this.perch.z).setLength(0.6);
            const next = t.peekPos.clone().add(step);
            if (next.distanceTo(this.perch) < 1.5 && !ctx.col.blocked(next, 0.4)) t.peekPos = next;
            else t.peekPos = this.perch.clone();
          } else {
            t.coverStale = true;
            t.urgent = true;
          }
          return true;
        }
        this.setPhase('fire');
        this.shots = 0;
        this.burst = t.role === 'suppressor' ? 5 : 3;
        if (!sees && supp) sq.bark(this, 'suppress');
        else if (t.role === 'suppressor' && Math.random() < 0.5) sq.bark(this, 'suppress');
      }
      return false;
    }
    if (t.phase === 'fire') {
      const interval = t.role === 'suppressor' ? 0.13 : 0.17;
      if (t.phaseT > this.shots * interval && this.shots < this.burst && t.ammo > 0) {
        // Check fire: a teammate in the line of fire ends the burst (no round leaves the barrel).
        if (this.friendInLine(ctx, muzzle, this.aimAt)) {
          this.heldFire++;
          this.shots = this.burst;
          sq.releaseShot(this);
          return true;
        }
        this.shots++;
        t.ammo--;
        const target = this.aimAt.clone();
        if (sees) target.add(g.vel.clone().multiplyScalar(0.22));
        const dir = target.sub(muzzle).normalize();
        const spread = sees ? 0.03 : 0.07;
        dir.x += rand(-spread, spread);
        dir.y += rand(-spread, spread) * 0.66;
        dir.z += rand(-spread, spread);
        dir.normalize();
        ctx.projectiles.fire(muzzle, dir, 24 + ctx.difficulty, this);
        ctx.audio.enemyShot(muzzle);
        ctx.fx.add.spawn({ x: muzzle.x, y: muzzle.y, z: muzzle.z, r: 5, g: 2.5, b: 0.6, size: 0.45, life: 0.06 });
        this.leanX.impulse(-2);
      }
      if ((this.shots >= this.burst || t.ammo <= 0) && t.phaseT > this.shots * interval + 0.2) {
        sq.releaseShot(this);
        if (t.ammo <= 0) t.urgent = true;
        return true;
      }
    }
    return false;
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const t = this.tac;
    const sq = ctx.squad;
    t.actionT += dt;
    t.phaseT += dt;
    t.suppression = Math.max(0, t.suppression - 0.6 * dt);
    const desired = new THREE.Vector3();
    this.laser.visible = false;
    let crouch = 0;
    const lookAt = this.threat(ctx);
    switch (t.action) {
      case 'emerge':
        if (lookAt) this.faceTowards(lookAt, dt, 3);
        if (this.stateT > 0.7) {
          this.enter('idle', ctx);
          t.urgent = true;
        }
        break;
      case 'takeCover': {
        if (!t.coverPos) {
          t.urgent = true;
          break;
        }
        const d = this.moveTo(t.coverPos, this.speed * 1.3, ctx, dt, desired);
        if (t.sees && lookAt && lookAt.distanceTo(this.pos) < 25) this.faceTowards(lookAt, dt, 6);
        else this.faceMove(dt);
        crouch = 0.15;
        if (d < 0.6) {
          this.enter('fight', ctx, 'hide');
          this.popDelay = this.nextPop() * 0.6;
          t.urgent = true;
        } else if (this.stalled(d, dt)) {
          t.badCover.set(t.coverId, ctx.time + 10);
          sq.releaseCover(this);
          t.urgent = true;
        } else if (t.actionT > 6 && t.sees) {
          // Taking too long under his eyes: fight from here instead.
          t.badCover.set(t.coverId, ctx.time + 6);
          sq.releaseCover(this);
          t.noCoverUntil = ctx.time + 3;
          this.enter('advance', ctx, 'move');
          t.goal = this.pos.clone();
        }
        break;
      }
      case 'fight': {
        const c = t.coverPos;
        if (!c) {
          t.urgent = true;
          break;
        }
        if (t.phase === 'hide' || t.phase === 'back' || t.phase === '') {
          this.moveTo(c, this.speed, ctx, dt, desired);
          crouch = 1;
          if (lookAt) this.faceTowards(lookAt, dt, 5);
          if (t.phase === 'back' && t.phaseT > 0.4) {
            this.setPhase('hide');
            this.popDelay = this.nextPop();
          }
          const fresh = ctx.time - sq.lkpT < HOLD_COVER;
          if (t.phase !== 'back' && t.phaseT > this.popDelay && ctx.time >= t.pinnedUntil && fresh && sq.requestShot(this, ctx.difficulty)) this.setPhase('peek');
        } else if (t.phase === 'peek') {
          const at = t.peekPos ?? c;
          const d = this.moveTo(at, this.speed * 1.2, ctx, dt, desired);
          crouch = 0;
          if (lookAt) this.faceTowards(lookAt, dt, 8);
          if (d < 0.2 || t.phaseT > 0.6) {
            this.setPhase('aim');
            ctx.audio.gunnerCharge(this.chest, this.look.voice);
          }
        } else {
          const at = t.peekPos ?? c;
          this.moveTo(at, this.speed, ctx, dt, desired);
          crouch = 0;
          if (this.shootPhases(ctx, dt)) {
            sq.releaseShot(this);
            this.setPhase('back');
          }
        }
        break;
      }
      case 'advance': {
        if (t.phase === 'move') {
          if (t.goal) {
            const d = this.moveTo(t.goal, this.speed, ctx, dt, desired);
            if (d < 1 && lookAt) {
              // Arrived in the open: sidestep while waiting for a shot.
              if (t.phaseT < 0.05) this.strafe = Math.random() < 0.5 ? -1 : 1;
              desired.set(-(lookAt.z - this.pos.z), 0, lookAt.x - this.pos.x).normalize().multiplyScalar(this.strafe);
            }
            if (this.stalled(d, dt)) t.goal = null;
          }
          if (t.sees && lookAt && lookAt.distanceTo(this.pos) < 25) this.faceTowards(lookAt, dt, 6);
          else this.faceMove(dt);
          if (t.sees && t.phaseT > 1.4 && ctx.time >= t.pinnedUntil && sq.requestShot(this, ctx.difficulty)) {
            this.setPhase('aim');
            ctx.audio.gunnerCharge(this.chest, this.look.voice);
          }
        } else if (this.shootPhases(ctx, dt)) {
          sq.releaseShot(this);
          this.setPhase('move');
        }
        break;
      }
      case 'pinned': {
        // Duck: behind the cover if it's right there, else wherever it stands. No shooting.
        if (t.coverPos && Math.hypot(t.coverPos.x - this.pos.x, t.coverPos.z - this.pos.z) < 2.5) this.moveTo(t.coverPos, this.speed * 1.2, ctx, dt, desired);
        crouch = 1;
        if (lookAt) this.faceTowards(lookAt, dt, 4);
        if (ctx.time >= t.pinnedUntil) t.urgent = true;
        break;
      }
      case 'reload': {
        if (t.coverPos && Math.hypot(t.coverPos.x - this.pos.x, t.coverPos.z - this.pos.z) < 2.5) {
          this.moveTo(t.coverPos, this.speed, ctx, dt, desired);
          crouch = 1;
        } else crouch = 0.5;
        if (t.actionT > 2.2 && t.ammo <= 0) {
          t.ammo = GUNNER_MAG;
          t.urgent = true;
        }
        break;
      }
      case 'watch': {
        // A sniper without contact: hold the perch, scan.
        if (this.perch) this.moveTo(this.perch, this.speed * 0.5, ctx, dt, desired);
        this.yaw += Math.sin(ctx.time * 0.4 + this.seed) * dt * 0.6;
        break;
      }
      default:
        this.actCalm(ctx, dt, desired, this.speed);
    }
    // Never stand right on top of the one it fights.
    const near = t.target ?? hostilesOf(ctx)[0];
    const p = near ? near.pos : ctx.player.pos;
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 5) desired.add(new THREE.Vector3(this.pos.x - p.x, 0, this.pos.z - p.z).normalize().multiplyScalar(2.5));
    this.crouch = damp(this.crouch, crouch, 9, dt);
    const firing = t.phase === 'aim' || t.phase === 'fire';
    this.state = t.action === 'emerge' ? 'emerge' : firing ? t.phase : t.action === 'fight' ? `cover-${t.phase}` : t.action;
    this.move(desired, ctx, dt);
  }

  private showLaser(from: THREE.Vector3, to: THREE.Vector3, k: number) {
    // Stop short of the player: seen end-on from the target it would smear across the whole view.
    const len = Math.max(0.1, from.distanceTo(to) - 1.6);
    this.laser.visible = true;
    this.laser.position.copy(from);
    this.laser.lookAt(to);
    this.laser.scale.set(0.6 + k, 0.6 + k, len);
    const fl = 0.6 + Math.random() * 0.4;
    this.laserMat.color.setRGB(3 * k * fl, 1.2 * k * fl, 0.1 * k * fl);
  }

  protected onHit(ctx: EnemyCtx) {
    super.onHit(ctx);
    if (this.tac.phase === 'aim' && Math.random() < 0.5) {
      ctx.squad.releaseShot(this);
      this.setPhase('back');
    }
  }

  protected onStunned() {
    this.laser.visible = false;
  }

  protected onDeath(ctx: EnemyCtx) {
    this.laser.visible = false;
    super.onDeath(ctx);
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    const r = this.rig;
    const k = clamp(speed / 3, 0, 1);
    this.walkCycle(k, 0.6, 0.9);
    const breathe = Math.sin(ctx.time * 2 + this.seed) * 0.02;
    const aiming = this.tac.phase === 'aim' || this.tac.phase === 'fire';
    // Pitch the torso to aim at what it shoots at.
    const dy = this.aimAt.y - (this.pos.y + 1.6);
    const dd = Math.hypot(this.aimAt.x - this.pos.x, this.aimAt.z - this.pos.z);
    // 65.0: at the ready the chest stays up when it's down on its heels (0.15 leaned it over its knees).
    const pitch = aiming ? -Math.atan2(dy, dd) : 0.15 * (1 - 0.8 * this.crouch);
    r.torso.rotation.x = damp(r.torso.rotation.x, pitch * 0.8 + breathe, 10, dt);
    r.body.rotation.set(0.05 * k, 0, 0);
    r.head.rotation.y = aiming ? 0 : Math.sin(ctx.time * 0.5 + this.seed) * 0.3;
    // Crouch: thighs forward, knees bent, hips down by the same drop the hitboxes use.
    const c = this.crouch;
    if (c > 0.01) {
      // Hunkered: thighs level, shins folded under (about the 0.78 m drop of the hitboxes).
      r.legL.rotation.x = r.legL.rotation.x * (1 - c) - 1.55 * c;
      r.legR.rotation.x = r.legR.rotation.x * (1 - c) - 1.35 * c;
      r.kneeL.rotation.x = r.kneeL.rotation.x * (1 - c) + 2.75 * c;
      r.kneeR.rotation.x = r.kneeR.rotation.x * (1 - c) + 2.5 * c;
      r.body.position.y -= this.crouchDrop * c;
      r.body.rotation.x += 0.12 * c;
    }
    // 65.0: the eyes on the horizon (the head takes back the body's and the chest's lean): crouched with
    // nothing to aim at, the lean added up to 15° down and a bot behind cover stared at the floor.
    r.head.rotation.x = aiming ? 0.1 : -(r.body.rotation.x + r.torso.rotation.x) * 0.9 + Math.sin(ctx.time * 0.7 + this.seed) * 0.06;
    if (this.state === 'emerge') r.body.rotation.x = 0.5 - this.stateT * 0.6;
    // 11.0: raise or lower the rifle (≈0.15 s to 90%).
    if (!this.isArena) this.isAiming = aiming;
    this.aimRaise = damp(this.aimRaise, this.isAiming ? 1 : 0, 15, dt);
    if (this.grip && r.weapon) {
      this.holdGun(dt, aiming ? pitch : null);
      return;
    }
    const gp = this.gunPose;
    if (gp && r.weapon) {
      const e = this.aimRaise;
      r.weapon.position.lerpVectors(gp.hip, gp.eye, e);
      r.armL.rotation.x = gp.armsHip[0] + (gp.armsEye[0] - gp.armsHip[0]) * e;
      r.foreL.rotation.x = gp.armsHip[1] + (gp.armsEye[1] - gp.armsHip[1]) * e;
      r.armR.rotation.x = gp.armsHip[2] + (gp.armsEye[2] - gp.armsHip[2]) * e;
      r.foreR.rotation.x = gp.armsHip[3] + (gp.armsEye[3] - gp.armsHip[3]) * e;
    }
  }

  /**
   * 22.0: the gun held in both hands. The pose is built in torso space, where the arms live:
   *  - bladed: the torso turns `blade` to its right, the gun and the head turn back, so the gun points
   *    where the body does and the support shoulder comes forward;
   *  - the grip between the hip hold and the aimed hold (the sight line through the eye) by aimRaise,
   *    kicked back along the barrel by recoil; the torso carries 80% of the aim's pitch, the gun the
   *    rest, so the arms pitch with the gun, never through it;
   *  - both hands put on the gun's grips by two-bone IK, only when the gun moved in torso space (hip
   *    fire and a held aim are steady: most frames reuse the last solve).
   */
  private holdGun(dt: number, aimPitch: number | null) {
    const r = this.rig, w = r.weapon!, g = this.grip!;
    const id = (w.userData.gunId ?? 'ar') as WeaponId;
    const s = RIG_GUNS[id];
    r.torso.rotation.y = -s.blade;
    r.head.rotation.y += s.blade;
    this.gunKick = this.gunKick > 1e-4 ? damp(this.gunKick, 0, 18, dt) : 0;
    const resid = aimPitch === null ? 0 : (aimPitch - r.torso.rotation.x) * this.aimRaise;
    holdPose(id, r.head.position, this.aimRaise, this.gunKick, resid, w.position, w.rotation);
    // Solve only when the gun moved relative to the torso (or another gun was dealt).
    const L = g.last, p = w.position;
    if (Math.abs(L[0] - p.x) < 1e-4 && Math.abs(L[1] - p.y) < 1e-4 && Math.abs(L[2] - p.z) < 1e-4 && Math.abs(L[3] - resid) < 1e-4 && L[4] === s.rake + s.blade) return;
    L[0] = p.x;
    L[1] = p.y;
    L[2] = p.z;
    L[3] = resid;
    L[4] = s.rake + s.blade;
    gripTargets(id, p, w.quaternion, _gGrip, _gFore, _gGripQ, _gForeQ);
    solveArm(g.R, _gGrip, _gGripQ);
    solveArm(g.L, _gFore, _gForeQ);
  }

  /** False for survival gunners (they aim in their aim and fire phases); the arena body overrides it. */
  protected get isArena() {
    return false;
  }

  dispose(scene: THREE.Scene) {
    super.dispose(scene);
    scene.remove(this.laser);
    this.laser.geometry.dispose();
    this.laserMat.dispose();
  }
}
