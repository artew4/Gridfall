import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';
import type { Effects } from '../combat/Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Player } from '../player/Player';
import type { EnemyLook } from '../entities/types';
import { NEON_SYNTHS } from '../entities/enemies/neon';
import type { Combatant, TeamId } from '../combat/Team';
import type { Enemy } from './Enemy';
import { nearMissDose } from './tactics/Squad';

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _Z = new THREE.Vector3(0, 0, 1);
const touch = (m: THREE.InstancedMesh) => {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
};

interface Bolt {
  /** Slot in the pool (free-list index). */
  i: number;
  /** 8.1: the shooter's look (its tracer colour unless the gun has its own). */
  look: EnemyLook;
  /** HDR colour of the core (the shooter's team look). */
  color: THREE.Color;
  /** Metres flown (a tracer's streak never reaches back past the muzzle). */
  travel: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  whizzed: boolean;
  active: boolean;
  /** Whose round it is: it passes through the shooter's own team (friendly fire is off). */
  team: TeamId;
  by: Combatant | null;
  /** Bots this round already suppressed (one dose per round per bot). */
  dosed: Set<Enemy>;
  /** 11.0 (stats): fired aimed or from the hip, at what range (m); NaN when untagged. */
  aimed: boolean;
  range: number;
  /** 13.0: how it looks in flight (the gun's, else the shooter's look's) and its damage share (1 = a rifle round). */
  bolt: EnemyLook['bolt'];
  dmg: number;
  /** 21.0: the gun's round (falloff, head bonus, knock), or null. */
  round: RoundSpec | null;
}

/** 13.0: what a gun puts on a round (armory BotArm): its look in flight and its damage share. */
export interface RoundSpec {
  ballistic: EnemyLook['ballistic'];
  bolt: EnemyLook['bolt'];
  damage: number;
  /** 21.0: full damage to `near` m flown, `min` of it from `far` (the shotgun's pellets, the pistol's rounds). */
  falloff?: { near: number; far: number; min: number };
  /** 21.0: head hits deal this × on top of the hitbox's ×2 (the pistol). */
  headMul?: number;
  /** 21.0: a hit shoves (m/s) and staggers (s) the bot it lands on (the shotgun). */
  knock?: { push: number; stagger: number };
}

/** 21.0: the share of a round's damage left after `d` m (1 inside `near`, `min` from `far`, linear between). */
export function falloffAt(f: RoundSpec['falloff'] | undefined, d: number) {
  if (!f || d <= f.near) return 1;
  if (d >= f.far) return f.min;
  return 1 - ((d - f.near) / (f.far - f.near)) * (1 - f.min);
}

export interface FireOpts {
  /** 11.0 (stats): aimed or hip, at what range. */
  tag?: { aimed: boolean; range: number };
  /** 13.0: the gun's round (else the shooter's look, damage 1). */
  round?: RoundSpec;
  /** 13.0: a shell's second and later pellets: one report per trigger pull (no onFire). */
  quiet?: boolean;
}

/**
 * TDM: the bots a round can meet. Hostile ones are hit (hitbox spheres, so head and legs count) or
 * suppressed when it passes close; teammates of the shooter are passed through.
 */
export interface BoltTargets {
  bots: readonly Enemy[];
  /** Damage of a round to a bot before the hitbox multiplier. */
  damage: number;
  hit(e: Enemy, dmg: number, dir: THREE.Vector3, point: THREE.Vector3, by: Combatant | null, knock?: RoundSpec['knock']): void;
  nearMiss(e: Enemy, dose: number, by: Combatant | null): void;
}

/**
 * Slow, visible gunner rounds: readable and dodgeable, which keeps the gunners fair. They look like
 * the setting's weapons but fly and hit the same.
 *
 * 8.1, rendering: one InstancedMesh (one draw call, whatever the number in flight): a thin additive
 * tracer streak, its length the distance flown in 1/20 s (and never back past the muzzle), and a brass
 * casing out of the shooter's gun when it's near the camera. (46.0: every round is a bullet; the
 * energy bolts of 8.1-45.0, a glowing core with a trail and a light, are gone.)
 * The rounds are a fixed pool with a free list; the per-frame loop allocates nothing.
 */
export class Projectiles {
  private bolts: Bolt[] = [];
  private free: number[] = [];
  private tmp = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private seg = new THREE.Vector3();
  private toChest = new THREE.Vector3();
  private closest = new THREE.Vector3();
  private dirN = new THREE.Vector3();
  /** Where the camera (the player) was last frame: bots near it eject visible brass. */
  private view = new THREE.Vector3(0, -1000, 0);
  private tracers: THREE.InstancedMesh;
  /** DEV counters: rounds fired, rounds refused for lack of a free slot. */
  stats = { fired: 0, dropped: 0, maxInFlight: 0 };
  private hitTmp: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };
  onPlayerHit: (dmg: number, from: THREE.Vector3, by: Combatant | null) => void = () => {};
  /** The player's team: those rounds never hit him (survival: every round is OMEGA's). */
  playerTeam: TeamId = 'alpha';
  /** Bots in the line of fire (TDM); null in survival, where rounds only ever meet the player. */
  targets: BoltTargets | null = null;
  /** Rounds that met a teammate of the shooter and flew on (DEV counter: friendly fire is off). */
  passedFriends = 0;
  /** A round passed close to him without hitting. */
  onWhiz: () => void = () => {};
  /** A round left a barrel (TDM: the other team hears it). */
  onFire: (from: THREE.Vector3, by: Combatant | null) => void = () => {};
  /** A spare light for the story's scripted shots (the intro's, the guards'): off unless they use it. */
  light: THREE.PointLight;
  private look: EnemyLook = NEON_SYNTHS;

  constructor(scene: THREE.Scene, private col: CollisionWorld, private fx: Effects, private audio: AudioEngine, look: EnemyLook = NEON_SYNTHS) {
    // Nine bots firing at once in TDM need more rounds in flight than a survival squad (7.0: arena
    // bots fire continuously).
    // 13.0: shotguns put eight pellets in the air per pull.
    const N = 192;
    // A unit streak from its head (the round, at the origin) back along -z.
    const streak = new THREE.BoxGeometry(1, 1, 1);
    streak.translate(0, 0, -0.5);
    this.tracers = new THREE.InstancedMesh(streak, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N);
    const m = this.tracers;
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color());
    scene.add(m);
    this.light = new THREE.PointLight(0xffa040, 0, 9, 2);
    this.light.userData.unpooled = true;
    scene.add(this.light);
    for (let i = 0; i < N; i++) {
      this.bolts.push({ i, look, color: new THREE.Color(), travel: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, whizzed: false, active: false, team: 'omega', by: null, dosed: new Set(), aimed: false, range: NaN, bolt: look.bolt, dmg: 1, round: null });
      this.free.push(N - 1 - i);
    }
    this.setLook(look);
  }

  setLook(look: EnemyLook) {
    this.look = look;
  }

  /** 11.0 (DEV stats): a tagged round hit someone (the player or a bot): how it was fired, from how far. */
  onTaggedHit: ((by: Combatant | null, aimed: boolean, range: number) => void) | null = null;

  fire(from: THREE.Vector3, dir: THREE.Vector3, speed: number, by: Combatant | null = null, opts: FireOpts = {}) {
    const slot = this.free.pop();
    if (slot === undefined) {
      this.stats.dropped++;
      return;
    }
    const b = this.bolts[slot];
    b.active = true;
    b.team = by?.team ?? 'omega';
    b.by = by;
    b.dosed.clear();
    // The shooter's own look (a bot carries its team's), else the level's (a guard, a check).
    const look = (by as { look?: EnemyLook } | null)?.look ?? this.look;
    b.look = look;
    const round = opts.round;
    b.bolt = round?.bolt ?? look.bolt;
    b.dmg = round?.damage ?? 1;
    b.round = round ?? null;
    b.color.setRGB(...b.bolt.core);
    b.travel = 0;
    if (!opts.quiet) this.onFire(from, by);
    b.pos.copy(from);
    b.vel.copy(dir).multiplyScalar(speed);
    b.life = 3;
    b.whizzed = false;
    b.aimed = opts.tag?.aimed ?? false;
    b.range = opts.tag?.range ?? NaN;
    this.stats.fired++;
    const inFlight = this.bolts.length - this.free.length;
    if (inFlight > this.stats.maxInFlight) this.stats.maxInFlight = inFlight;
    // Brass out of a rifle near the camera (right of the shot, onto the shooter's floor).
    if (!opts.quiet && by && from.distanceToSquared(this.view) < 40 * 40) {
      const l = Math.hypot(dir.x, dir.z) || 1;
      this.fx.casings.spawn(from.x, from.y - 0.05, from.z, -dir.z / l, 0, dir.x / l, 0, 1, 0, by.pos.y, false);
    }
  }

  clear() {
    this.free.length = 0;
    for (const b of this.bolts) {
      b.active = false;
      this.free.push(b.i);
    }
    this.tracers.count = 0;
  }

  update(dt: number, player: Player) {
    this.view.copy(player.pos);
    // 11.0: the hit volume shrinks with a crouch (the body's height scale).
    const k = player.heightScale;
    const chest = this.tmp.set(player.pos.x, player.pos.y + 1.2 * k, player.pos.z);
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      this.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      const step = b.vel.length() * dt;
      b.travel += step;

      // Player hit: closest approach of this step's segment to the chest axis (scratch vectors only).
      const seg = this.seg.subVectors(b.pos, this.prev);
      const t = Math.max(0, Math.min(1, this.toChest.subVectors(chest, this.prev).dot(seg) / Math.max(seg.lengthSq(), 1e-6)));
      const closest = this.closest.copy(this.prev).addScaledVector(seg, t);
      const dxz = Math.hypot(closest.x - chest.x, closest.z - chest.z);
      const dy = Math.abs(closest.y - chest.y);
      const forPlayer = b.team !== this.playerTeam;
      if (player.alive && forPlayer && dxz < 0.45 && dy < 0.75 * k) {
        this.onPlayerHit(10 * b.dmg * falloffAt(b.round?.falloff, b.travel), this.prev.clone(), b.by);
        if (!Number.isNaN(b.range)) this.onTaggedHit?.(b.by, b.aimed, b.range);
        this.fx.sparks(closest.clone(), seg.clone().normalize().negate(), 10, new THREE.Color(1, 0.6, 0.2), 4);
        this.deactivate(b);
        continue;
      }
      if (forPlayer && !b.whizzed && closest.distanceTo(chest) < 2.2) {
        b.whizzed = true;
        this.audio.roundWhiz(closest);
        this.onWhiz();
      }
      const dir = this.dirN.copy(seg).normalize();
      const hit = this.col.raycast(this.prev, dir, step, this.hitTmp);
      if (this.targets && this.botStep(b, dir, step, hit ? hit.dist : step)) continue;
      if (hit || b.life <= 0) {
        if (hit) {
          // A bullet: an ordinary impact on whatever it struck.
          this.fx.impact(hit.point, hit.normal, hit.surface);
          this.audio.hitSurface(hit.point, hit.surface);
        }
        this.deactivate(b);
        continue;
      }
    }
    this.draw();
  }

  /** The tracers from the live rounds (compacted every frame; no allocation). */
  private draw() {
    let nk = 0;
    for (const b of this.bolts) {
      if (!b.active) continue;
      const v = b.vel;
      const speed = v.length();
      _q.setFromUnitVectors(_Z, _d.copy(v).divideScalar(speed || 1));
      // 1/20 s of flight, at least 0.4 m, never back past the muzzle.
      const len = Math.min(Math.max(0.4, speed * 0.05), b.travel);
      _s.set(0.016, 0.016, Math.max(0.05, len));
      this.tracers.setMatrixAt(nk, _m.compose(b.pos, _q, _s));
      this.tracers.setColorAt(nk++, b.color);
    }
    this.tracers.count = nk;
    if (nk) touch(this.tracers);
  }

  /**
   * This step of a round against the bots (TDM): the nearest hostile hitbox before the wall ends it,
   * near misses on the rest. Returns true if the round struck a bot.
   */
  private botStep(b: Bolt, dir: THREE.Vector3, step: number, wall: number) {
    const tg = this.targets!;
    let best: Enemy | null = null;
    let bd = wall;
    let mult = 1;
    let point: THREE.Vector3 | null = null;
    const mx = this.prev.x + dir.x * step * 0.5, my = this.prev.y + dir.y * step * 0.5, mz = this.prev.z + dir.z * step * 0.5;
    const reach = step * 0.5 + 2.2;
    for (const e of tg.bots) {
      if (!e.alive) continue;
      // Cheap reject: nowhere near this step.
      const ex = e.pos.x - mx, ey = e.pos.y + 1 - my, ez = e.pos.z - mz;
      if (ex * ex + ey * ey + ez * ez > reach * reach) continue;
      if (e.team === b.team) {
        if (!b.dosed.has(e)) {
          const h = e.raycast(this.prev, dir);
          if (h && h.dist <= step) {
            b.dosed.add(e);
            this.passedFriends++;
          }
        }
        continue;
      }
      const h = e.raycast(this.prev, dir);
      if (h && h.dist <= bd) {
        bd = h.dist;
        best = e;
        mult = h.mult;
        point = h.point;
      } else if (!b.dosed.has(e)) {
        const k = nearMissDose(this.prev, dir, step, e.chest);
        if (k > 0) {
          b.dosed.add(e);
          tg.nearMiss(e, k, b.by);
        }
      }
    }
    if (!best || !point) return false;
    const r = b.round;
    const head = mult > 1.5 && r?.headMul ? r.headMul : 1;
    tg.hit(best, tg.damage * mult * head * b.dmg * falloffAt(r?.falloff, b.travel), dir.clone(), point, b.by, r?.knock);
    if (!Number.isNaN(b.range)) this.onTaggedHit?.(b.by, b.aimed, b.range);
    this.deactivate(b);
    return true;
  }

  private deactivate(b: Bolt) {
    if (!b.active) return;
    b.active = false;
    this.free.push(b.i);
  }
}
