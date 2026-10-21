import * as THREE from 'three';
import { Enemy, type EnemyCtx } from '../enemies/Enemy';
import { buildGuard, GUARD_ACCENT } from '../enemies/Models';
import { clamp, damp, rand } from '../core/math';
import { CONFIRMED, SUSPICIOUS, VISION, perceptionInterval, sightZone, stepSuspicion, suspicionRate, visionRange } from './Perception';
import type { Security } from './Security';

export type GuardState = 'patrol' | 'suspicious' | 'investigate' | 'combat' | 'pursuit' | 'search' | 'return' | 'emerge';

const WALK = 1.5;
const HURRY = 2.6;
const RUN = 4.4;
/** On losing sight, a guard heads for where the fugitive was going: last seen + velocity × this. */
const PREDICT = 1.2;
/** Without sight for this long in combat, the guard starts chasing the last known position. */
const LOSE_SIGHT = 1.1;
const MEMORY = 60;

const _eye = new THREE.Vector3();
const _sample = new THREE.Vector3();

export type SearchRole = 'sweep' | 'probe' | 'hold';

/** Second-hand or uncertain information: where, and when it was received. */
export interface Lead {
  pos: THREE.Vector3;
  t: number;
}

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
  /** Direct visual contact on the last perception tick. */
  sees = false;
  /** Body samples with a clear line on the last tick (debug / tests). */
  visibleSamples = 0;
  /** Recognition range on the last tick (what the minimap cone shows). */
  range: number = VISION.calmRange;
  /** Own sighting: where and when this guard last saw the fugitive, and how he was moving. */
  lastSeenT = -Infinity;
  lastSeenPos = new THREE.Vector3();
  lastSeenVel = new THREE.Vector3();
  rememberUntil = -Infinity;
  /** Approximate sound location (shots), never exact. */
  heard: Lead | null = null;
  /** Latest position received over the radio (a snapshot, not a live feed). */
  radio: Lead | null = null;
  /** Current navigation destination. */
  goal = new THREE.Vector3();
  /** Search plan: role, centre, current radius and the points still to check. */
  searchRole: SearchRole = 'sweep';
  searchCentre = new THREE.Vector3();
  searchRadius = 10;
  searchPts: THREE.Vector3[] = [];
  /** Seconds the current goal has had no route. */
  private noRouteT = 0;
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

  /** Where the guard is looking: body plus the head's scan (what perception and the minimap use). */
  get lookYaw() {
    return this.yaw + this.rig.head.rotation.y;
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

  // ------------------------------------------------------------------ perception (3–8 Hz)
  /** Seconds until the next perception tick should run. */
  perceptionInterval(ctx: EnemyCtx) {
    return perceptionInterval(this.pos.distanceTo(ctx.player.pos));
  }

  perceive(ctx: EnemyCtx, dt: number) {
    if (!this.alive || this.gstate === 'emerge') return;
    const t = ctx.time;
    const p = ctx.player;
    const eye = this.eye;
    const ri = {
      weaponDrawn: this.sec.playerArmed(),
      hunting: this.sec.alert.hunting(t),
      remembers: this.remembers(t),
      engaged: this.gstate === 'combat',
      firing: this.sec.playerFiring(t),
    };
    this.range = visionRange(ri);
    let zone: ReturnType<typeof sightZone> = null;
    let visible = 0;
    let dist = Infinity;
    if (p.alive) {
      const dx = p.pos.x - eye.x, dz = p.pos.z - eye.z;
      const dh = Math.hypot(dx, dz);
      const k = p.heightScale; // 11.0: a crouched body is a smaller, lower target
      const dy = p.pos.y + 1.1 * k - eye.y;
      dist = Math.hypot(dh, dy);
      // Cheap tests first (range, cone); rays only for a target that could be seen.
      if (dist <= this.range + 0.5) {
        const look = this.lookYaw;
        const cosH = dh > 1e-3 ? (Math.sin(look) * dx + Math.cos(look) * dz) / dh : 1;
        zone = sightZone(cosH, dy, dh, this.range, ri.engaged);
        if (zone) for (const h of VISION.samples) if (this.sec.sightLine(eye, _sample.set(p.pos.x, p.pos.y + h * k, p.pos.z))) visible++;
      }
    }
    const rate = suspicionRate({ ...ri, dist, zone, visible, sprinting: p.sprinting, light: zone && visible ? this.sec.lightAt(p.pos) : 0 });
    this.sees = rate > 0;
    this.visibleSamples = visible;
    if (this.sees) {
      this.lastSeenT = t;
      this.lastSeenPos.copy(p.pos);
      this.lastSeenVel.set(p.vel.x, 0, p.vel.z);
    }
    // Once identified, a guard keeps him identified while he stays in view.
    this.suspicion = stepSuspicion(this.suspicion, this.hostile && this.sees ? Math.max(rate, 3) : rate, dt);

    if (this.sees && (this.suspicion >= CONFIRMED || (ri.remembers && this.suspicion > 0.5))) {
      if (!this.hostile) this.sec.confirm(this);
      this.rememberUntil = t + MEMORY;
      this.sec.contact(this);
      if (this.gstate !== 'combat') this.setG('combat');
    } else if (!this.hostile && this.suspicion >= SUSPICIOUS && this.gstate !== 'suspicious' && this.gstate !== 'investigate') {
      this.setG('suspicious');
      this.bark('huh');
    }
  }

  /** Where the fugitive was heading when this guard lost him. */
  predictedPos(out = new THREE.Vector3()) {
    const v = this.lastSeenVel;
    const l = Math.min(6, v.length() * PREDICT);
    out.copy(this.lastSeenPos);
    if (l > 0.1) out.addScaledVector(v, l / v.length());
    return out;
  }

  // ------------------------------------------------------------------ orders from Security
  /** Go and look at something (report, noise). */
  investigate(at: THREE.Vector3, hurry = false) {
    if (!this.alive || this.gstate === 'combat') return;
    this.goal.copy(at);
    this.setG('investigate');
    this.speed = hurry ? HURRY : WALK + 0.4;
  }

  /** Radio: a snapshot of the fugitive's last known position — converge on it. */
  pursue(at: THREE.Vector3, t = -Infinity) {
    if (!this.alive || this.gstate === 'combat') return;
    this.radio = { pos: at.clone(), t };
    this.goal.copy(at);
    this.setG('pursuit');
  }

  /** Updated sighting from dispatch while chasing; ignored if this guard's own sighting is newer. */
  radioUpdate(at: THREE.Vector3, t: number) {
    if (!this.alive || this.gstate === 'combat' || this.lastSeenT >= t) return;
    this.pursue(at, t);
  }

  /** A shot heard: only roughly where (the caller adds distance-dependent error). */
  hearShot(at: THREE.Vector3, t: number) {
    this.heard = { pos: at.clone(), t };
    if (!this.alive || this.gstate === 'combat') return;
    this.yaw = Math.atan2(at.x - this.pos.x, at.z - this.pos.z);
    if (this.sec.alert.level === 'pursuit' || this.sec.alert.level === 'search') this.pursue(at, t);
    else this.investigate(at, true);
  }

  // ------------------------------------------------------------------ behaviour (per frame)
  protected think(dt: number, ctx: EnemyCtx) {
    const t = ctx.time;
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
          // Head for where he was going, not where he is: nobody can see that.
          this.predictedPos(this.goal);
          this.setG('pursuit');
          this.bark('lost');
        }
        break;
      }

      case 'pursuit': {
        this.threat = 2;
        // The goal only changes with new information (own sighting or a radio update).
        if (this.walkTo(this.goal, RUN, desired, ctx, dt, 1.6) || this.gstateT > 30 || this.unreachable(dt, ctx)) this.beginSearch(ctx);
        break;
      }

      case 'search': {
        this.threat = 1;
        if (this.waitT > 0) {
          this.waitT -= dt;
          this.scan(dt, 1.6);
          if (this.waitT <= 0) this.searchPts.shift();
        } else if (this.sec.alert.level !== 'search' && this.sec.alert.level !== 'pursuit' && this.gstateT > 6) {
          this.setG('return');
          this.bark('clear');
        } else if (!this.searchPts.length) {
          // Nothing here: widen the search around the same centre.
          this.searchRadius = Math.min(26, this.searchRadius + 6);
          this.searchRole = this.searchRole === 'hold' ? 'sweep' : this.searchRole;
          this.searchPts = this.sec.searchPoints(this.searchCentre, 3, this.searchRole, this.searchRadius, this);
          if (!this.searchPts.length) this.setG('return');
        } else if (this.walkTo(this.searchPts[0], HURRY, desired, ctx, dt, 1.0) || this.stuckT > 4 || this.unreachable(dt, ctx)) {
          // Holders watch their spot for a while; the others take a quick look and move on.
          this.waitT = this.searchRole === 'hold' && this.searchPts.length === 1 ? rand(8, 12) : rand(2, 3.5);
          this.scanBase = this.yaw;
          this.stuckT = 0;
          this.noRouteT = 0;
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

  /** Search around a point in a role (Security hands roles out when contact is lost). */
  beginSearchAround(c: THREE.Vector3, role: SearchRole = 'sweep', radius = 10) {
    if (!this.alive || this.gstate === 'combat') return;
    this.searchRole = role;
    this.searchCentre.copy(c);
    this.searchRadius = radius;
    this.searchPts = this.sec.searchPoints(c, role === 'hold' ? 1 : 4, role, radius, this);
    this.waitT = 0;
    this.noRouteT = 0;
    this.setG('search');
  }

  /** True once the current goal has had no route for a while (e.g. behind a closed shutter). */
  private unreachable(dt: number, ctx: EnemyCtx) {
    void ctx;
    this.noRouteT = this.noRoute ? this.noRouteT + dt : 0;
    if (this.noRouteT < 1.5) return false;
    this.noRouteT = 0;
    return true;
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
    // Without sight he works from where he last saw him.
    const tp = this.sees ? p.pos : this.lastSeenPos;
    const head = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z);
    const dist = this.pos.distanceTo(tp);
    this.csT += dt;
    this.faceTowards(tp, dt, 7);
    // Hold a standoff ring around the player, offset by a personal flank angle so the squad spreads.
    const away = new THREE.Vector3(this.pos.x - tp.x, 0, this.pos.z - tp.z).normalize();
    const ang = this.flank * 0.9;
    const ring = new THREE.Vector3(away.x * Math.cos(ang) - away.z * Math.sin(ang), 0, away.x * Math.sin(ang) + away.z * Math.cos(ang));
    const spot = tp.clone().addScaledVector(ring, this.standoff);
    spot.y = this.pos.y;
    const sees = this.sees;
    switch (this.cs) {
      case 'move': {
        if (Math.abs(dist - this.standoff) > 3 && Math.abs(tp.y - this.pos.y) < 1.5) {
          const tgt = this.steerTarget(spot, ctx, dt);
          desired.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z).normalize().multiplyScalar(dist < 5 ? RUN : 2.6);
        } else if (Math.abs(tp.y - this.pos.y) >= 1.5 && !sees) {
          // Different level and no shot: take the stairs to where he was seen.
          const tgt = this.steerTarget(tp, ctx, dt);
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
          this.sec.gunshot(muzzle, false, this);
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
    // Getting shot: with a line to the shooter he sees the muzzle flash; otherwise only roughly where.
    const p = ctx.player.pos;
    const clear = this.sec.sightLine(this.eye, _sample.set(p.x, p.y + 1.4, p.z));
    this.lastSeenT = ctx.time;
    this.lastSeenPos.copy(p);
    this.lastSeenVel.set(0, 0, 0);
    if (!clear) this.lastSeenPos.add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4)));
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
