import * as THREE from 'three';
import { Enemy, type EnemyCtx } from '../enemies/Enemy';
import { buildGuard, GUARD_ACCENT } from '../enemies/Models';
import { clamp, damp, rand } from '../core/math';
import { CONFIRMED, SUSPICIOUS, stepSuspicion, suspicionRate } from './Perception';
import type { Security } from './Security';

export type GuardState = 'patrol' | 'suspicious' | 'investigate' | 'combat' | 'pursuit' | 'search' | 'return' | 'emerge';

const WALK = 1.5;
const HURRY = 2.6;
const RUN = 4.4;
/** After losing sight a guard still "saw where he went" for this long. */
const TRACK_TIME = 1.5;
/** Without sight for this long in combat, the guard starts chasing the last known position. */
const LOSE_SIGHT = 1.1;
const MEMORY = 60;

const _eye = new THREE.Vector3();
const _head = new THREE.Vector3();
const _chest = new THREE.Vector3();

/**
 * Security Bureau officer. Patrols a route, gets suspicious, investigates, identifies, calls it in,
 * fights from cover, chases the last known position and searches around it, then returns. Knows only
 * what it has seen, heard, or been told over the radio.
 */
export class Guard extends Enemy {
  radius = 0.45;
  speed = WALK;
  hitboxes = [
    { y: 1.8, r: 0.19, mult: 2 },
    { y: 1.28, r: 0.37, mult: 1 },
    { y: 0.6, r: 0.3, mult: 0.75 },
  ];
  accent = GUARD_ACCENT;
  heavy = true;

  gstate: GuardState = 'patrol';
  gstateT = 0;
  route: THREE.Vector3[];
  private routeIdx = 0;
  private waitT = 0;
  /** Static post: stands and scans instead of walking. */
  post: boolean;
  /** Arrived by radio call; leaves the district after the search. */
  reinforcement = false;
  exit: THREE.Vector3 | null = null;
  /** Time-limited inside the district; removed once back at its exit. */
  gone = false;

  suspicion = 0;
  /** Perception tick accumulator (randomised so guards don't all look on the same frame). */
  percT = Math.random() * 0.1;
  sees = false;
  lastSeenT = -Infinity;
  lastSeenPos = new THREE.Vector3();
  rememberUntil = -Infinity;
  private trackUntil = -Infinity;
  goal = new THREE.Vector3();
  private searchPts: THREE.Vector3[] = [];
  private scanBase = 0;
  private stuckT = 0;
  private stuckRef = new THREE.Vector3();
  // Combat.
  private cs: 'move' | 'hold' | 'aim' | 'fire' = 'move';
  private csT = 0;
  private shots = 0;
  private flank = rand(-1, 1);
  private standoff = rand(9, 15);
  private laser: THREE.Mesh;
  private laserMat: THREE.MeshBasicMaterial;
  private aimPoint = new THREE.Vector3();
  private beaconMat: THREE.MeshBasicMaterial;
  /** Bark cooldown so they don't chatter. */
  private barkT = 0;
  /** Threat level towards the player for the HUD: 0 none, 1 suspicious, 2 hunting, 3 aiming. */
  threat = 0;

  constructor(spawn: THREE.Vector3, route: THREE.Vector3[], private sec: Security, scene: THREE.Scene, post = false) {
    super(buildGuard(), 100, spawn, 'gunner');
    this.route = route.length ? route : [spawn.clone()];
    this.post = post;
    this.rig.body.userData.baseY = 1.0;
    this.state = 'alive';
    this.rig.glowMat.color.copy(GUARD_ACCENT).multiplyScalar(4);
    this.beaconMat = this.rig.root.userData.beacon as THREE.MeshBasicMaterial;
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.BoxGeometry(0.01, 0.01, 1);
    g.translate(0, 0, 0.5);
    this.laser = new THREE.Mesh(g, this.laserMat);
    this.laser.visible = false;
    this.laser.frustumCulled = false;
    scene.add(this.laser);
    this.scanBase = this.yaw;
  }

  get eye() {
    return _eye.set(this.pos.x, this.pos.y + 1.75, this.pos.z);
  }

  /** Remembers the player's face (positively identified within the last minute). */
  remembers(t: number) {
    return t < this.rememberUntil;
  }

  get hostile() {
    return this.gstate === 'combat' || this.gstate === 'pursuit' || this.gstate === 'search';
  }

  setG(s: GuardState) {
    if (s === this.gstate) return;
    this.gstate = s;
    this.gstateT = 0;
    this.stuckT = 0;
    if (s !== 'combat') this.laser.visible = false;
    if (s === 'combat') {
      this.cs = 'move';
      this.csT = 0;
    }
  }

  // ------------------------------------------------------------------ perception (≈10 Hz)
  perceive(ctx: EnemyCtx, dt: number) {
    if (!this.alive || this.gstate === 'emerge') return;
    const t = ctx.time;
    const p = ctx.player;
    const eye = this.eye;
    const head = _head.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
    const chest = _chest.set(p.pos.x, p.pos.y + 1.05, p.pos.z);
    const dx = head.x - eye.x;
    const dz = head.z - eye.z;
    const dist = Math.hypot(dx, head.y - eye.y, dz);
    // Facing: body yaw, plus the head while scanning.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hd = Math.hypot(dx, dz) || 1;
    const cos = (fx * dx + fz * dz) / hd;
    let los = false;
    if (p.alive && dist < 34) los = this.sec.sightLine(eye, head) || this.sec.sightLine(eye, chest);
    const remembers = this.remembers(t);
    const rate = suspicionRate({
      dist,
      cos,
      los,
      weaponDrawn: this.sec.playerArmed(),
      sprinting: p.sprinting,
      light: this.sec.lightAt(p.pos),
      hunting: this.sec.alert.hunting(t),
      remembers,
    });
    this.sees = rate > 0;
    // Once engaged, keep tracking him at combat range even outside the cone.
    if (!this.sees && this.hostile && los && dist < 28 && (cos > 0.2 || dist < 8)) this.sees = true;
    if (this.sees) {
      this.lastSeenT = t;
      this.lastSeenPos.copy(p.pos);
    }
    this.suspicion = stepSuspicion(this.suspicion, this.hostile && this.sees ? 4 : rate, dt);

    if (this.sees && (this.suspicion >= CONFIRMED || (remembers && this.suspicion > 0.5))) {
      if (!this.hostile) this.sec.confirm(this);
      this.rememberUntil = t + MEMORY;
      this.sec.contact(this);
      if (this.gstate !== 'combat') this.setG('combat');
    } else if (!this.hostile && this.suspicion >= SUSPICIOUS && this.gstate !== 'suspicious' && this.gstate !== 'investigate') {
      this.setG('suspicious');
      this.bark('huh');
    }
  }

  // ------------------------------------------------------------------ orders from Security
  /** Go and look at something (report, noise). */
  investigate(at: THREE.Vector3, hurry = false) {
    if (!this.alive || this.gstate === 'combat') return;
    this.goal.copy(at);
    this.setG('investigate');
    this.speed = hurry ? HURRY : WALK + 0.4;
  }

  /** Radio: fugitive's last known position — converge on it. */
  pursue(at: THREE.Vector3) {
    if (!this.alive || this.gstate === 'combat') return;
    this.goal.copy(at);
    this.setG('pursuit');
  }

  hearShot(at: THREE.Vector3) {
    if (!this.alive || this.gstate === 'combat') return;
    this.yaw = Math.atan2(at.x - this.pos.x, at.z - this.pos.z);
    if (this.sec.alert.level === 'pursuit' || this.sec.alert.level === 'search') this.pursue(at);
    else this.investigate(at, true);
  }

  // ------------------------------------------------------------------ behaviour (per frame)
  protected think(dt: number, ctx: EnemyCtx) {
    const t = ctx.time;
    const p = ctx.player;
    this.gstateT += dt;
    this.barkT -= dt;
    const desired = new THREE.Vector3();
    this.laser.visible = false;
    this.threat = 0;

    switch (this.gstate) {
      case 'emerge':
        if (this.gstateT > 0.8) this.pursue(this.sec.alert.lastKnown ? new THREE.Vector3(this.sec.alert.lastKnown.x, this.sec.alert.lastKnown.y, this.sec.alert.lastKnown.z) : this.pos);
        break;

      case 'patrol': {
        if (this.post) {
          this.walkTo(this.route[0], WALK, desired, ctx, dt, 0.6);
          this.scan(dt, 1.1);
          break;
        }
        const target = this.route[this.routeIdx];
        if (this.waitT > 0) {
          this.waitT -= dt;
          this.scan(dt, 0.8);
        } else if (this.walkTo(target, WALK, desired, ctx, dt, 0.8)) {
          this.waitT = rand(1.5, 4);
          this.scanBase = this.yaw;
          this.routeIdx = (this.routeIdx + 1) % this.route.length;
        }
        break;
      }

      case 'suspicious': {
        this.threat = 1;
        this.faceTowards(this.lastSeenPos, dt, 5);
        if (this.suspicion < 0.08 || this.gstateT > 7) {
          // Didn't get a good look: go and check where it was.
          this.investigate(this.lastSeenPos);
        }
        break;
      }

      case 'investigate': {
        this.threat = this.suspicion > SUSPICIOUS ? 1 : 0;
        if (this.waitT > 0) {
          this.waitT -= dt;
          this.scan(dt, 1.4);
          if (this.waitT <= 0) this.afterLook();
        } else if (this.walkTo(this.goal, this.speed, desired, ctx, dt, 1.2) || this.gstateT > 25) {
          this.waitT = rand(2.5, 4);
          this.scanBase = this.yaw;
        }
        break;
      }

      case 'combat': {
        this.threat = 2;
        this.combat(dt, ctx, desired);
        if (t - this.lastSeenT > LOSE_SIGHT) {
          this.trackUntil = this.lastSeenT + TRACK_TIME;
          this.goal.copy(this.lastSeenPos);
          this.setG('pursuit');
          this.bark('lost');
        }
        break;
      }

      case 'pursuit': {
        this.threat = 2;
        // Saw which way he went: the goal follows him for a moment after he breaks sight.
        if (t < this.trackUntil) this.goal.copy(p.pos);
        else {
          const k = this.sec.alert.lastKnown;
          if (k && k.t > this.lastSeenT + 0.5 && this.gstateT > 0.5) this.goal.set(k.x, k.y, k.z);
        }
        if (this.walkTo(this.goal, RUN, desired, ctx, dt, 1.6) || this.gstateT > 30) this.beginSearch(ctx);
        break;
      }

      case 'search': {
        this.threat = 1;
        if (this.waitT > 0) {
          this.waitT -= dt;
          this.scan(dt, 1.6);
          if (this.waitT <= 0) this.searchPts.shift();
        } else if (!this.searchPts.length || (this.sec.alert.level !== 'search' && this.sec.alert.level !== 'pursuit' && this.gstateT > 6)) {
          this.setG('return');
          this.bark('clear');
        } else if (this.walkTo(this.searchPts[0], HURRY, desired, ctx, dt, 1.0) || this.stuckT > 4) {
          this.waitT = rand(2, 3.5);
          this.scanBase = this.yaw;
          this.stuckT = 0;
        }
        break;
      }

      case 'return': {
        const home = this.reinforcement && this.exit ? this.exit : this.route[0];
        if (this.walkTo(home, WALK + 0.3, desired, ctx, dt, 1.0) || this.gstateT > 60) {
          if (this.reinforcement) this.gone = true;
          else {
            this.setG('patrol');
            this.routeIdx = 0;
          }
        }
        break;
      }
    }
    this.watchdog(dt, desired, ctx);
    this.move(desired, ctx, dt);
  }

  private afterLook() {
    const lvl = this.sec.alert.level;
    if (lvl === 'pursuit' || lvl === 'search' || lvl === 'alerted') this.beginSearchAround(this.goal);
    else this.setG('return');
  }

  private beginSearch(ctx: EnemyCtx) {
    void ctx;
    this.beginSearchAround(this.goal);
    this.bark('search');
  }

  private beginSearchAround(c: THREE.Vector3) {
    this.searchPts = this.sec.searchPoints(c, 4);
    this.setG('search');
  }

  /** Head/body sweep while standing. */
  private scan(dt: number, amp: number) {
    void dt;
    this.yaw = this.scanBase + Math.sin(this.gstateT * 0.9 + this.seed) * amp * 0.6;
  }

  /** Path towards a point; returns true when within `tol`. */
  private walkTo(target: THREE.Vector3, speed: number, out: THREE.Vector3, ctx: EnemyCtx, dt: number, tol: number) {
    const dxz = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    if (dxz < tol && Math.abs(target.y - this.pos.y) < 1.2) return true;
    const tgt = this.steerTarget(target, ctx, dt);
    out.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
    const l = out.length();
    if (l > 1e-3) out.multiplyScalar(speed / l);
    this.faceTowards(this.pos.clone().add(this.vel), dt, 6);
    return false;
  }

  /** Detects being stuck on geometry and nudges/repaths; after long enough, gives the goal up. */
  private watchdog(dt: number, desired: THREE.Vector3, ctx: EnemyCtx) {
    if (desired.lengthSq() < 0.25) {
      this.stuckRef.copy(this.pos);
      return;
    }
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      const moved = this.pos.distanceTo(this.stuckRef);
      if (moved < 0.5) {
        // Sidestep, and if this keeps happening abandon the current goal.
        this.pos.x += rand(-0.3, 0.3);
        this.pos.z += rand(-0.3, 0.3);
        ctx.col.resolveCircle(this.pos, this.radius, 1.8);
        if (this.gstate === 'investigate' || this.gstate === 'pursuit') this.waitT = 0.01;
        if (this.gstate === 'patrol') this.routeIdx = (this.routeIdx + 1) % this.route.length;
      }
      this.stuckT = 0;
      this.stuckRef.copy(this.pos);
    }
  }

  // ------------------------------------------------------------------ combat
  private combat(dt: number, ctx: EnemyCtx, desired: THREE.Vector3) {
    const p = ctx.player;
    const head = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z);
    const dist = this.pos.distanceTo(p.pos);
    this.csT += dt;
    this.faceTowards(p.pos, dt, 7);
    // Hold a standoff ring around the player, offset by a personal flank angle so the squad spreads.
    const away = new THREE.Vector3(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z).normalize();
    const ang = this.flank * 0.9;
    const ring = new THREE.Vector3(away.x * Math.cos(ang) - away.z * Math.sin(ang), 0, away.x * Math.sin(ang) + away.z * Math.cos(ang));
    const spot = p.pos.clone().addScaledVector(ring, this.standoff);
    spot.y = this.pos.y;
    const sees = this.sees;
    switch (this.cs) {
      case 'move': {
        if (Math.abs(dist - this.standoff) > 3 && Math.abs(p.pos.y - this.pos.y) < 1.5) {
          const tgt = this.steerTarget(spot, ctx, dt);
          desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z).normalize().multiplyScalar(dist < 5 ? RUN : 2.6);
        } else if (Math.abs(p.pos.y - this.pos.y) >= 1.5 && !sees) {
          // Different level and no shot: take the stairs.
          const tgt = this.steerTarget(p.pos, ctx, dt);
          desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z).normalize().multiplyScalar(RUN);
        }
        if (this.csT > rand(0.8, 1.6) && sees && ctx.player.alive) {
          this.cs = 'aim';
          this.csT = 0;
          this.bark('freeze');
          ctx.audio.gunnerCharge(this.chest);
        }
        break;
      }
      case 'aim': {
        this.threat = 3;
        const muzzle = this.rig.muzzle!.getWorldPosition(new THREE.Vector3());
        this.aimPoint.lerp(head.clone().setY(p.pos.y + 1.2), 1 - Math.exp(-8 * dt));
        this.showLaser(muzzle, this.aimPoint, Math.min(1, this.csT / 0.7));
        // Strafe slowly while aiming.
        desired.set(-away.z, 0, away.x).multiplyScalar(Math.sin(this.seed) > 0 ? 0.8 : -0.8);
        if (!sees) {
          this.cs = 'move';
          this.csT = 0;
        } else if (this.csT > 0.75) {
          this.cs = 'fire';
          this.csT = 0;
          this.shots = 0;
        }
        break;
      }
      case 'fire': {
        this.threat = 3;
        const interval = 0.2;
        if (this.csT > this.shots * interval && this.shots < 3) {
          const muzzle = this.rig.muzzle!.getWorldPosition(new THREE.Vector3());
          const lead = p.vel.clone().multiplyScalar(0.18);
          const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z).add(lead);
          if (this.sec.civilianInLine(muzzle, target)) {
            // Don't fire through bystanders: reposition instead.
            this.cs = 'move';
            this.csT = 0;
            this.flank = -this.flank;
            break;
          }
          this.shots++;
          const dir = target.sub(muzzle).normalize();
          dir.x += rand(-0.035, 0.035);
          dir.y += rand(-0.02, 0.02);
          dir.z += rand(-0.035, 0.035);
          dir.normalize();
          ctx.projectiles.fire(muzzle, dir, 22);
          ctx.audio.enemyShot(muzzle);
          this.sec.gunshot(muzzle, false);
          ctx.fx.add.spawn({ x: muzzle.x, y: muzzle.y, z: muzzle.z, r: 2, g: 3.5, b: 5, size: 0.4, life: 0.06 });
          this.leanX.impulse(-2);
        }
        if (this.shots >= 3 && this.csT > 3 * interval + 0.2) {
          this.cs = 'move';
          this.csT = -rand(0.6, 1.4) + ctx.difficulty * 0.05;
          if (Math.random() < 0.35) this.flank = rand(-1, 1);
        }
        break;
      }
      case 'hold':
        break;
    }
  }

  private showLaser(from: THREE.Vector3, to: THREE.Vector3, k: number) {
    const len = Math.max(0.1, from.distanceTo(to) - 1.6);
    this.laser.visible = true;
    this.laser.position.copy(from);
    this.laser.lookAt(to);
    this.laser.scale.set(0.6 + k, 0.6 + k, len);
    const fl = 0.6 + Math.random() * 0.4;
    this.laserMat.color.setRGB(0.6 * k * fl, 1.6 * k * fl, 3 * k * fl);
  }

  bark(kind: 'huh' | 'freeze' | 'lost' | 'search' | 'clear' | 'contact') {
    if (this.barkT > 0 || !this.alive) return;
    this.barkT = kind === 'freeze' ? 6 : 3;
    this.sec.bark(this, kind);
  }

  protected onHit(ctx: EnemyCtx) {
    // Getting shot is a positive identification, wherever it came from.
    this.lastSeenT = ctx.time;
    this.lastSeenPos.copy(ctx.player.pos);
    this.suspicion = 1;
    if (!this.hostile) this.sec.confirm(this);
    this.rememberUntil = ctx.time + MEMORY;
    this.sec.contact(this);
    this.setG('combat');
    if (this.cs === 'aim' && Math.random() < 0.5) {
      this.cs = 'move';
      this.csT = 0;
    }
  }

  protected onStunned() {
    this.laser.visible = false;
    if (this.cs === 'aim' || this.cs === 'fire') this.cs = 'move';
  }

  protected onDeath() {
    this.laser.visible = false;
    this.sec.onGuardDown(this);
  }

  protected animate(dt: number, ctx: EnemyCtx, speed: number) {
    const r = this.rig;
    const k = clamp(speed / 3, 0, 1.3);
    this.walkCycle(k, 0.6, 0.9);
    const ready = this.gstate === 'combat' || this.gstate === 'pursuit';
    const aiming = this.cs === 'aim' || this.cs === 'fire';
    const p = ctx.player.pos;
    const dy = p.y + 1.2 - (this.pos.y + 1.6);
    const dd = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    // Weapon low on patrol, raised when hunting, levelled at the player when aiming.
    const pitch = aiming && this.gstate === 'combat' ? -Math.atan2(dy, dd) : ready ? 0.15 : 0.55;
    r.torso.rotation.x = damp(r.torso.rotation.x, pitch * 0.8 + Math.sin(ctx.time * 2 + this.seed) * 0.02, 8, dt);
    r.body.rotation.set(0.05 * k, 0, 0);
    r.head.rotation.x = ready ? 0.05 : Math.sin(ctx.time * 0.6 + this.seed) * 0.08;
    r.head.rotation.y = this.gstate === 'patrol' || this.gstate === 'search' ? Math.sin(ctx.time * 0.7 + this.seed) * 0.4 : 0;
    // Shoulder beacon flashes red/blue only when hunting.
    const hunting = this.hostile;
    const ph = Math.floor(ctx.time * 6) % 2;
    this.beaconMat.color.setRGB(hunting ? (ph ? 3 : 0.2) : 0.6, 0.15, hunting ? (ph ? 0.2 : 3) : 0.2);
  }

  dispose(scene: THREE.Scene) {
    super.dispose(scene);
    scene.remove(this.laser);
    this.laserMat.dispose();
    this.beaconMat.dispose();
    (this.rig.root.userData.white as THREE.Material | undefined)?.dispose();
  }
}
