import * as THREE from 'three';
import { Gunner, Runner, type EnemyCtx } from '../Enemy';
import type { EnemyLook } from '../../entities/types';
import { ARMORY, type BotArm } from '../../entities/weapons/armory';
import type { Combatant } from '../../combat/Team';
import type { BarkKind } from '../tactics/Barks';
import { damp, lerp, rand } from '../../core/math';
import { ARENA } from './ArenaCtx';
import { DeathmatchBrain, type ArenaBody } from './DeathmatchAI';
import { newSlip, openAt, startSlip, stepAir, stepSlip, vaultAhead, type Air } from './Locomotion';

/*
  Arena bodies (7.0): the survival Gunner and Runner rigs, hitboxes, looks and death, driven by the
  deathmatch brain instead of the squad director. The 5.0 decide() never runs (no Squad schedules
  them); `tac` is kept only as a label (action/phase) for the kill log, the debug views and the rig
  animation, which reads it.

  Movement differences live behind three Enemy hooks that default to the survival behaviour: the
  straight-line test and graph routes may cross low walls, and the feet may leave the ground.
*/

const _d = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();

/** 12.0: a slide ends at this share of the body's base speed (its crouch walk). */
const SLIDE_END = 0.55;

/** The slide's pose over the crouch: leant back, the lead leg kicked out (0..1). */
function slidePose(rig: { body: THREE.Object3D; legL: THREE.Object3D; kneeL: THREE.Object3D }, k: number) {
  if (k < 0.01) return;
  rig.body.rotation.x -= 0.5 * k;
  rig.legL.rotation.x = lerp(rig.legL.rotation.x, -1.5, k);
  rig.kneeL.rotation.x = lerp(rig.kneeL.rotation.x, 0.25, k);
}
/**
 * Entry nodes a re-plan may test. Measured on Desert Outpost (7.0): a route that succeeds needs at
 * most ~116 corridor tests (p90 61); one that fails tried all ~530 nodes, 5–11 ms in one frame.
 */
const ROUTE_TRIES = 128;

/**
 * A graph route that may cross low walls. Both ends are put back on the floor first (body height): a
 * bot mid-jump, or a contact plotted mid-vault, would otherwise be a point no node can see.
 */
function arenaRoute(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
  const col = ctx.col;
  _f.set(from.x, col.groundHeightAt(from.x, from.z, 0.3, from.y - 1, 0.6) + 1, from.z);
  _t.set(to.x, col.groundHeightAt(to.x, to.z, 0.3, to.y - 1, 0.6) + 1, to.z);
  if (!Number.isFinite(_f.y)) _f.copy(from);
  if (!Number.isFinite(_t.y)) _t.copy(to);
  return ctx.nav.route(_f, _t, { vault: true, tries: ROUTE_TRIES });
}
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Shared by both bodies (same hooks, different base classes). */
function directClear(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
  const nav = ctx.nav;
  if (nav.clear(from, to)) return true;
  return !!nav.vaultEdges && from.distanceTo(to) < 14 && nav.clearVault(from, to);
}

export class ArenaGunner extends Gunner implements ArenaBody {
  brain: DeathmatchBrain;
  air: Air = { up: false, vy: 0, t: 0 };
  /** 12.0: the slide and how far into its pose the rig is. */
  slip = newSlip();
  private slipK = 0;
  private made = Infinity;

  /**
   * 13.0: `arm` is the armory gun dealt to it for this life (how it fires, how hard, at what ranges);
   * the rig's gun is stretched to read as it (a stubby SMG, a long rifle, a bulky shotgun).
   */
  constructor(spawn: THREE.Vector3, difficulty: number, scene: THREE.Scene, look: EnemyLook, readonly arm: BotArm = ARMORY.ar.bot) {
    super(spawn, difficulty, scene, null, look);
    this.brain = new DeathmatchBrain(this);
    this.tac.ammo = arm.mag;
    this.rig.weapon?.scale.set(arm.model.bulk, arm.model.bulk, arm.model.length);
  }

  get airborne() {
    return this.air.up;
  }
  get reloading() {
    return this.brain.reloading;
  }
  /** 11.0: the brain decides when it aims (by range), not the tactical phase. */
  protected get isArena() {
    return true;
  }

  /** Never called: the arena scheduler drives the brain. */
  decide() {}

  get sliding() {
    return this.slip.on;
  }

  slide() {
    if (this.air.up || this.state === 'emerge') return false;
    return startSlip(this.slip, this.vel, this.speed * ARENA.sprint, this.speed * SLIDE_END);
  }

  protected think(dt: number, ctx: EnemyCtx) {
    this.laser.visible = false;
    const desired = _d.set(0, 0, 0);
    const crouch = this.brain.act(dt, ctx, desired);
    // Sliding, the body carries itself (the brain still aims and fires).
    stepSlip(this.slip, dt, desired, this.made);
    this.crouch = damp(this.crouch, this.air.up ? 0.35 : this.slip.on ? 1 : crouch, 12, dt);
    this.slipK = damp(this.slipK, this.slip.on ? 1 : 0, 14, dt);
    this.state = this.brain.state === 'emerge' ? 'emerge' : this.brain.state;
    this.aimAt.copy(this.brain.aimPoint);
    const x0 = this.pos.x, z0 = this.pos.z;
    this.move(desired, ctx, dt);
    this.made = Math.hypot(this.pos.x - x0, this.pos.z - z0) / Math.max(dt, 1e-4);
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    super.animate(dt, ctx, speed);
    slidePose(this.rig, this.slipK);
  }

  protected onHit(ctx: EnemyCtx) {
    this.brain.onHit(ctx, this.lastAttacker);
  }

  suppress(_amount: number, ctx: EnemyCtx) {
    if (this.alive) this.brain.onNearMiss(this.ctxNow ?? ctx, null);
  }

  protected onDeath(ctx: EnemyCtx) {
    this.brain.died(ctx.arena);
    super.onDeath(ctx);
  }

  protected directClear(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return directClear(ctx, from, to);
  }

  protected routeTo(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return arenaRoute(ctx, from, to);
  }

  protected ground(ctx: EnemyCtx, dt: number) {
    if (this.air.up && stepAir(this.air, this.pos, ctx.col, this.radius, dt)) this.vaulting = false;
    if (!this.air.up) this.followGround(ctx, dt);
  }

  // ---- ArenaBody
  steer(goal: THREE.Vector3, speed: number, ctx: EnemyCtx, dt: number, desired: THREE.Vector3) {
    return this.moveTo(goal, speed, ctx, dt, desired);
  }
  face(p: THREE.Vector3, dt: number, rate: number) {
    this.faceTowards(p, dt, rate);
  }
  jump(vy: number) {
    if (this.air.up) return false;
    this.air.up = true;
    this.air.vy = vy;
    this.air.t = 0;
    this.vaulting = true;
    return true;
  }
  fireRound(ctx: EnemyCtx, aim: THREE.Vector3, spread: number, tag?: { aimed: boolean; range: number }): 'fired' | 'friend' | 'none' {
    const muzzle = this.muzzleWorld();
    if (this.friendInLine(ctx, muzzle, aim)) {
      this.heldFire++;
      return 'friend';
    }
    const arm = this.arm;
    const aimDir = _aimDir.copy(aim).sub(muzzle).normalize();
    aimDir.x += rand(-spread, spread);
    aimDir.y += rand(-spread, spread) * 0.66;
    aimDir.z += rand(-spread, spread);
    aimDir.normalize();
    // 13.0: a shell's pellets spread round the aimed line (uniform over the cone's disc); one report.
    for (let i = 0; i < arm.pellets; i++) {
      const dir = aimDir.clone();
      if (arm.pellets > 1) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * arm.pelletSpread;
        _side.set(-dir.z, 0, dir.x).normalize();
        _up.crossVectors(_side, dir);
        dir.addScaledVector(_side, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      }
      ctx.projectiles.fire(muzzle, dir, ARENA.boltSpeed, this, { tag, round: arm, quiet: i > 0 });
    }
    ctx.audio.enemyShot(muzzle, this.look.voice, arm.sound === 'plasma' && arm.ballistic === 'kinetic' ? 'pistol' : arm.sound, arm.ballistic === 'energy');
    const [cr, cg, cb] = arm.bolt.core;
    ctx.fx.add.spawn({ x: muzzle.x, y: muzzle.y, z: muzzle.z, r: cr * 1.2, g: cg * 1.2, b: cb * 1.2, size: arm.pellets > 1 ? 0.65 : 0.45, life: 0.06 });
    this.leanX.impulse(-1.2);
    this.tac.ammo = this.brain.ammo - 1;
    return 'fired';
  }
  strike() {}
  wallAhead(ctx: EnemyCtx, dx: number, dz: number) {
    return vaultAhead(ctx.col, this.pos, dx, dz, this.radius);
  }
  open(ctx: EnemyCtx, dx: number, dz: number, dist: number) {
    return openAt(ctx.col, this.pos, dx, dz, dist, this.radius);
  }
  bark(kind: BarkKind, ctx: EnemyCtx) {
    ctx.squad.barks.say(this, kind, this.look.voice, ctx.time);
  }
}

export class ArenaRunner extends Runner implements ArenaBody {
  brain: DeathmatchBrain;
  air: Air = { up: false, vy: 0, t: 0 };
  slip = newSlip();
  private slipK = 0;
  private made = Infinity;
  /** A blade never aims. */
  isAiming = false;
  /** A blade has no gun; the brain reads the rifle's numbers for it (it never fires). */
  readonly arm: BotArm = ARMORY.ar.bot;

  constructor(spawn: THREE.Vector3, difficulty: number, look: EnemyLook) {
    super(spawn, difficulty, look);
    this.brain = new DeathmatchBrain(this);
    this.speed += 0.4;
  }

  get airborne() {
    return this.air.up;
  }

  decide() {}

  get sliding() {
    return this.slip.on;
  }

  slide() {
    if (this.air.up || this.state === 'emerge') return false;
    return startSlip(this.slip, this.vel, this.speed * 1.05, this.speed * SLIDE_END);
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const desired = _d.set(0, 0, 0);
    this.brain.act(dt, ctx, desired);
    stepSlip(this.slip, dt, desired, this.made);
    if (this.stagger > 0) desired.multiplyScalar(0.3);
    this.crouch = damp(this.crouch, this.slip.on ? 1 : 0, 12, dt);
    this.slipK = damp(this.slipK, this.slip.on ? 1 : 0, 14, dt);
    const a = this.tac.action;
    this.state = this.brain.state === 'emerge' ? 'emerge' : a === 'push' || a === 'engage' ? 'chase' : a;
    const x0 = this.pos.x, z0 = this.pos.z;
    this.move(desired, ctx, dt);
    this.made = Math.hypot(this.pos.x - x0, this.pos.z - z0) / Math.max(dt, 1e-4);
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    super.animate(dt, ctx, speed);
    slidePose(this.rig, this.slipK);
  }

  protected onHit(ctx: EnemyCtx) {
    this.brain.onHit(ctx, this.lastAttacker);
  }

  suppress(_amount: number, ctx: EnemyCtx) {
    if (this.alive) this.brain.onNearMiss(this.ctxNow ?? ctx, null);
  }

  protected onDeath(ctx: EnemyCtx) {
    this.brain.died(ctx.arena);
    super.onDeath(ctx);
  }

  protected directClear(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return directClear(ctx, from, to);
  }

  protected routeTo(ctx: EnemyCtx, from: THREE.Vector3, to: THREE.Vector3) {
    return arenaRoute(ctx, from, to);
  }

  protected ground(ctx: EnemyCtx, dt: number) {
    if (this.air.up && stepAir(this.air, this.pos, ctx.col, this.radius, dt)) this.vaulting = false;
    if (!this.air.up) this.followGround(ctx, dt);
  }

  steer(goal: THREE.Vector3, speed: number, ctx: EnemyCtx, dt: number, desired: THREE.Vector3) {
    return this.moveTo(goal, speed, ctx, dt, desired);
  }
  face(p: THREE.Vector3, dt: number, rate: number) {
    this.faceTowards(p, dt, rate);
  }
  jump(vy: number) {
    if (this.air.up) return false;
    this.air.up = true;
    this.air.vy = vy;
    this.air.t = 0;
    this.vaulting = true;
    return true;
  }
  fireRound(): 'none' {
    return 'none';
  }
  /** The blade, weighed against bot health as in 6.0 (a gunner has 150, the player 100). */
  strike(ctx: EnemyCtx, victim: Combatant) {
    const dmg = 14 + ctx.difficulty;
    victim.hurt(victim.isPlayer ? dmg : dmg * 1.8, this.chest.clone(), this);
    ctx.audio.swipe(this.chest);
  }
  wallAhead(ctx: EnemyCtx, dx: number, dz: number) {
    return vaultAhead(ctx.col, this.pos, dx, dz, this.radius);
  }
  open(ctx: EnemyCtx, dx: number, dz: number, dist: number) {
    return openAt(ctx.col, this.pos, dx, dz, dist, this.radius);
  }
  bark(kind: BarkKind, ctx: EnemyCtx) {
    ctx.squad.barks.say(this, kind, this.look.voice, ctx.time);
  }
}

export type ArenaBot = ArenaGunner | ArenaRunner;

export const isArenaBot = (e: unknown): e is ArenaBot => e instanceof ArenaGunner || e instanceof ArenaRunner;
