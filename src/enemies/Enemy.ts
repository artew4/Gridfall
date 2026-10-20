import * as THREE from 'three';
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
  /**
   * How far anyone can see right now (fog, a sandstorm), if the level limits it. Enemies don't see
   * through what hides them from the player; they still hear and hunt.
   */
  sightRange?: number;
  damagePlayer(dmg: number, from: THREE.Vector3): void;
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

export abstract class Enemy {
  rig: Rig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp: number;
  alive = true;
  /** Fully finished dying; can be removed. */
  dead = false;
  state = 'emerge';
  stateT = 0;
  protected flash = 0;
  protected stagger = 0;
  protected leanX = new Spring(140, 10);
  protected leanZ = new Spring(140, 10);
  protected walkPhase = Math.random() * 6;
  protected seed = Math.random() * 100;
  /** Electrocuted: frozen in place and twitching. */
  stun = 0;
  protected fallV = 0;
  private path: number[] = [];
  private forcePathT = 0;
  private noProgressT = 0;
  private bestGoalD = Infinity;
  private lastGoal = new THREE.Vector3(1e9, 0, 0);
  private pathT = 0;
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
    this.pos.copy(spawn);
    this.glowBase = rig.glowMat.color.clone();
    rig.glowMat.color.setScalar(0);
  }

  get chest() {
    return _w.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
  }

  /** Ray vs hitbox spheres. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3): EnemyHit | null {
    if (!this.alive) return null;
    let best: EnemyHit | null = null;
    for (const h of this.hitboxes) {
      const f = h.fwd ?? 0;
      const c = _v.set(this.pos.x + Math.sin(this.yaw) * f, this.pos.y + h.y, this.pos.z + Math.cos(this.yaw) * f);
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
  takeHit(dmg: number, dir: THREE.Vector3, point: THREE.Vector3, ctx: EnemyCtx): boolean {
    if (!this.alive) return false;
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

  protected onStunned() {}

  protected die(ctx: EnemyCtx) {
    this.alive = false;
    this.state = 'dying';
    this.dieT = 0;
    ctx.fx.deathBurst(this.chest.clone(), this.accent, this.look.organic);
    ctx.audio.enemyDeath(this.chest, this.look.voice);
    this.onDeath(ctx);
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
    if (this.forcePathT <= 0 && Math.abs(to.y - from.y) < 1 && ctx.nav.clear(from, to)) {
      this.path.length = 0;
      this.noRoute = false;
      return goal;
    }
    this.pathT -= dt;
    if (this.pathT <= 0 || this.path.length === 0) {
      this.pathT = 0.6 + Math.random() * 0.3;
      this.path = ctx.nav.route(from, to);
      this.noRoute = this.path.length === 0;
    }
    // Skip waypoints we can already see past (never across levels, or we'd cut under a walkway).
    const level = (n: THREE.Vector3) => Math.abs(n.y - from.y) < 1;
    while (this.path.length > 1 && level(ctx.nav.nodes[this.path[1]]) && ctx.nav.clear(from, ctx.nav.nodes[this.path[1]])) this.path.shift();
    if (this.path.length) {
      const n = ctx.nav.nodes[this.path[0]];
      if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 0.8) this.path.shift();
      return n;
    }
    return goal;
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
      }
    }
    const accel = this.stagger > 0 ? 2 : 10;
    this.vel.x = damp(this.vel.x, desired.x, accel, dt);
    this.vel.z = damp(this.vel.z, desired.z, accel, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    ctx.col.resolveCircle(this.pos, this.radius, 1.8);
    this.followGround(ctx, dt);
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
    } else {
      this.think(dt, ctx);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const prev = Math.floor(this.walkPhase / Math.PI);
      this.walkPhase += hs * dt * (this.heavy ? 2.4 : 2.0);
      if (Math.floor(this.walkPhase / Math.PI) !== prev && hs > 1 && this.stepIdx++ % 1 === 0) {
        if (this.pos.distanceToSquared(ctx.player.pos) < 400) ctx.audio.enemyStep(this.pos, this.heavy);
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

// ======================================================================= Runner
export class Runner extends Enemy {
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

  constructor(spawn: THREE.Vector3, difficulty: number, look: EnemyLook = NEON_SYNTHS) {
    super(look.buildRunner(), 60, spawn, 'runner', look);
    this.accent = look.runnerAccent;
    this.speed = 5.6 + difficulty * 0.35 + rand(-0.3, 0.3);
    this.rig.body.userData.baseY = 0.95;
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const p = ctx.player.pos;
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const desired = new THREE.Vector3();
    switch (this.state) {
      case 'emerge':
        if (this.stateT > 0.55) {
          this.setState('chase');
          ctx.audio.runnerScreech(this.chest, this.look.voice);
        }
        this.faceTowards(p, dt, 4);
        break;
      case 'chase': {
        const tgt = this.steerTarget(p, ctx, dt);
        desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z).normalize();
        if (tgt === p && dist > 4.5) {
          // Zig-zag approach makes them harder to track.
          const side = Math.sin(ctx.time * 2.6 * this.zig + this.seed) * 0.75;
          desired.x += -desired.z * side;
          desired.z += desired.x * side;
          desired.normalize();
        }
        desired.multiplyScalar(this.speed * (this.stagger > 0 ? 0.3 : 1));
        this.faceTowards(this.pos.clone().add(this.vel), dt, 12);
        if (dist < 1.9 && Math.abs(p.y - this.pos.y) < 1.2 && ctx.player.alive) {
          this.setState('windup');
          ctx.audio.swipe(this.chest);
        }
        break;
      }
      case 'windup':
        this.faceTowards(p, dt, 14);
        desired.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().multiplyScalar(1.2);
        if (this.stateT > 0.36) {
          this.setState('strike');
          if (dist < 2.5 && Math.abs(p.y - this.pos.y) < 1.2 && ctx.player.alive) ctx.damagePlayer(14 + ctx.difficulty, this.chest.clone());
          ctx.audio.swipe(this.chest);
        }
        break;
      case 'strike':
        if (this.stateT > 0.14) this.setState('recover');
        break;
      case 'recover':
        desired.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().multiplyScalar(-1.5);
        if (this.stateT > 0.55) this.setState('chase');
        break;
    }
    this.move(desired, ctx, dt);
  }

  protected onHit() {
    if (this.state === 'windup') this.setState('recover');
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
    if (this.state === 'windup') {
      const t = Math.min(1, this.stateT / 0.3);
      armL = armR = 0.5 - t * 2.6;
      fore = -0.4;
      r.body.rotation.x = -0.15;
    } else if (this.state === 'strike') {
      armL = armR = -2.1 + (this.stateT / 0.14) * 3.0;
      fore = -0.2;
      r.body.rotation.x = 0.5;
    } else if (this.state === 'emerge') {
      armL = armR = 0.2;
      r.body.rotation.x = 0.6 - this.stateT;
    }
    r.armL.rotation.set(armL, 0, 0.25);
    r.armR.rotation.set(armR, 0, -0.25);
    r.foreL.rotation.x = fore;
    r.foreR.rotation.x = fore;
    if (r.tail) r.tail.rotation.x = 0.25 + 0.6 * k + Math.sin(ctx.time * 13 + this.seed) * 0.12 * (0.3 + k);
  }
}

// ======================================================================= Gunner
export class Gunner extends Enemy {
  radius = 0.48;
  speed: number;
  hitboxes = [
    { y: 1.86, r: 0.2, mult: 2 },
    { y: 1.32, r: 0.4, mult: 1 },
    { y: 0.62, r: 0.32, mult: 0.75 },
  ];
  accent: THREE.Color;
  heavy = true;
  private cover: THREE.Vector3 | null = null;
  private noSight = 0;
  private bursts = 0;
  private shots = 0;
  private strafe = 1;
  private laser: THREE.Mesh;
  private laserMat: THREE.MeshBasicMaterial;
  private aimPoint = new THREE.Vector3();
  /** Rooftop sniper: holds its perch, strafing a little, instead of moving between covers. */
  perch: THREE.Vector3 | null = null;

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
  }

  private pickCover(ctx: EnemyCtx) {
    if (this.perch) {
      this.setState('cooldown');
      return;
    }
    // A cover we're leaving because it gave no sight is not picked again straight away.
    const prev = this.cover;
    if (this.cover) ctx.occupied.delete(this.cover);
    // The same aim point think() uses for "sees", so a chosen cover really gives a shot.
    const head = new THREE.Vector3(ctx.player.pos.x, ctx.player.pos.y + 1.4, ctx.player.pos.z);
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const c of ctx.coverPoints) {
      if (ctx.occupied.has(c) || (c === prev && this.noSight > 1.6)) continue;
      const d = c.distanceTo(ctx.player.pos);
      if (d < 7 || d > Math.min(30, ctx.sightRange ?? 30)) continue;
      if (!ctx.col.lineOfSight(new THREE.Vector3(c.x, c.y + 1.5, c.z), head)) continue;
      const score = c.distanceTo(this.pos) + Math.abs(d - 15) * 0.5 + Math.random() * 4;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    this.cover = best;
    if (best) ctx.occupied.add(best);
    this.setState('move');
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const p = ctx.player.pos;
    const head = new THREE.Vector3(p.x, p.y + 1.4, p.z);
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const sees = this.canSee(ctx, head);
    this.noSight = sees ? 0 : this.noSight + dt;
    const desired = new THREE.Vector3();
    this.laser.visible = false;

    switch (this.state) {
      case 'emerge':
        this.faceTowards(p, dt, 3);
        if (this.stateT > 0.7) this.pickCover(ctx);
        break;
      case 'move': {
        const goal = this.cover ?? p;
        const tgt = this.steerTarget(goal, ctx, dt);
        desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
        const dl = desired.length();
        desired.normalize().multiplyScalar(this.speed * Math.min(1, dl));
        this.faceTowards(sees && dist < 25 ? p : this.pos.clone().add(this.vel), dt, 6);
        const arrived = this.cover ? Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 0.9 : sees && dist < 22;
        if (arrived || (sees && this.stateT > 4)) this.setState('cooldown');
        if (!this.cover && this.stateT > 2) this.pickCover(ctx);
        break;
      }
      case 'cooldown':
        this.faceTowards(p, dt, 6);
        if (this.stateT < 0.05) this.strafe = Math.random() < 0.5 ? -1 : 1;
        desired.set(-(p.z - this.pos.z), 0, p.x - this.pos.x).normalize().multiplyScalar(this.strafe * 1.0);
        if (this.perch) {
          // Pace along the parapet, never far from the perch.
          const off = Math.hypot(this.pos.x - this.perch.x, this.pos.z - this.perch.z);
          if (off > 1.6) desired.set(this.perch.x - this.pos.x, 0, this.perch.z - this.pos.z).normalize().multiplyScalar(1.2);
        }
        if (dist < 5) desired.add(new THREE.Vector3(this.pos.x - p.x, 0, this.pos.z - p.z).normalize().multiplyScalar(2.5));
        if (this.stateT > rand(1.2, 2.0) - ctx.difficulty * 0.05 && sees && ctx.player.alive) {
          this.setState('aim');
          ctx.audio.gunnerCharge(this.chest, this.look.voice);
        }
        if (this.noSight > 1.6 && !this.perch) this.pickCover(ctx);
        break;
      case 'aim': {
        this.faceTowards(p, dt, 8);
        const muzzle = this.rig.muzzle!.getWorldPosition(new THREE.Vector3());
        this.aimPoint.lerp(head.clone().setY(p.y + 1.25), 1 - Math.exp(-8 * dt));
        const tele = Math.min(1, this.stateT / 0.75);
        this.showLaser(muzzle, this.aimPoint, tele);
        if (!sees) this.setState('cooldown');
        else if (this.stateT > 0.8) {
          this.setState('fire');
          this.shots = 0;
        }
        break;
      }
      case 'fire': {
        this.faceTowards(p, dt, 8);
        const interval = 0.17;
        if (this.stateT > this.shots * interval && this.shots < 3) {
          this.shots++;
          const muzzle = this.rig.muzzle!.getWorldPosition(new THREE.Vector3());
          const lead = ctx.player.vel.clone().multiplyScalar(0.22);
          const target = new THREE.Vector3(p.x, p.y + 1.2, p.z).add(lead);
          const dir = target.sub(muzzle).normalize();
          dir.x += rand(-0.03, 0.03);
          dir.y += rand(-0.02, 0.02);
          dir.z += rand(-0.03, 0.03);
          dir.normalize();
          ctx.projectiles.fire(muzzle, dir, 24 + ctx.difficulty);
          ctx.audio.enemyShot(muzzle, this.look.voice);
          ctx.fx.add.spawn({ x: muzzle.x, y: muzzle.y, z: muzzle.z, r: 5, g: 2.5, b: 0.6, size: 0.45, life: 0.06 });
          this.leanX.impulse(-2);
        }
        if (this.shots >= 3 && this.stateT > 3 * interval + 0.2) {
          this.bursts++;
          if (this.bursts % 2 === 0 && Math.random() < 0.6) this.pickCover(ctx);
          else this.setState('cooldown');
        }
        break;
      }
    }
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

  protected onHit() {
    if (this.state === 'aim' && Math.random() < 0.5) this.setState('cooldown');
  }

  protected onStunned() {
    this.laser.visible = false;
    if (this.state === 'aim' || this.state === 'fire') this.setState('cooldown');
  }

  protected onDeath(ctx: EnemyCtx) {
    this.laser.visible = false;
    if (this.cover) ctx.occupied.delete(this.cover);
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    const r = this.rig;
    const k = clamp(speed / 3, 0, 1);
    this.walkCycle(k, 0.6, 0.9);
    const breathe = Math.sin(ctx.time * 2 + this.seed) * 0.02;
    const aiming = this.state === 'aim' || this.state === 'fire';
    // Pitch the torso to aim at the player.
    const p = ctx.player.pos;
    const dy = p.y + 1.2 - (this.pos.y + 1.6);
    const dd = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const pitch = aiming ? -Math.atan2(dy, dd) : 0.15;
    r.torso.rotation.x = damp(r.torso.rotation.x, pitch * 0.8 + breathe, 10, dt);
    r.body.rotation.set(0.05 * k, 0, 0);
    r.head.rotation.x = aiming ? 0.1 : Math.sin(ctx.time * 0.7 + this.seed) * 0.1;
    r.head.rotation.y = aiming ? 0 : Math.sin(ctx.time * 0.5 + this.seed) * 0.3;
    if (this.state === 'emerge') r.body.rotation.x = 0.5 - this.stateT * 0.6;
  }

  dispose(scene: THREE.Scene) {
    super.dispose(scene);
    scene.remove(this.laser);
    this.laser.geometry.dispose();
    this.laserMat.dispose();
  }
}
