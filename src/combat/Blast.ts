import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';
import type { Effects } from './Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Combatant } from './Team';
import type { Enemy, EnemyCtx } from '../enemies/Enemy';
import { blastShare, exposure, markBlast, type BlastSpec } from './Explosives';

/*
  90.0: a blast in the world (Explosives.ts has its numbers): the damage to everyone in its sight (a
  share of each body's full health, a bot thrown back and staggered; friendly fire stays off, the
  thrower's own blast hurts him), the shootable props in reach (lamps, cabinets) hit, nearby bots
  flinch; the fireball, its light, the smoke and the debris, the scorch; the bang near or far; the
  player's camera shaken and his ears ringing by how close he was.
*/

export interface BlastWorld {
  /** Everyone who can be hurt (the player and every bot alive). */
  victims(): readonly Combatant[];
  ctx(): EnemyCtx;
  now(): number;
  /** Where the player's head is (the shake, the ringing, near or far). */
  ear(): THREE.Vector3;
  /** The player felt it at `d` metres. */
  felt(d: number): void;
  /** 91.0: the walls in reach bitten into. */
  breach?(at: THREE.Vector3, s: NonNullable<BlastSpec['breach']>): void;
}

const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

export class Blasts {
  /** One light for every blast (the brightest one's). */
  readonly light: THREE.PointLight;
  private flash = 0;
  /** DEV: blasts, bodies hurt, kills. */
  stats = { blasts: 0, hurt: 0, kills: 0 };

  constructor(scene: THREE.Scene, private col: CollisionWorld, private fx: Effects, private audio: AudioEngine, private w: BlastWorld) {
    this.light = new THREE.PointLight(0xff9a48, 0, 22, 2);
    this.light.userData.unpooled = true;
    scene.add(this.light);
  }

  /** A blast at `at` on a face (`normal`), set off by `by` (null: the world), its feed tag, its look's `size`. */
  go(at: THREE.Vector3, normal: THREE.Vector3, s: BlastSpec, by: Combatant | null, tag: string, size = 1) {
    this.stats.blasts++;
    const now = this.w.now();
    const ctx = this.w.ctx();
    // The centre, a little off the face (sight lines from a grenade lying on the ground clear it).
    const c = _p.copy(at).addScaledVector(normal, 0.3);
    for (const v of this.w.victims()) {
      if (!v.alive) continue;
      const self = by !== null && v === by;
      if (by && !self && v.team === by.team) continue;
      const d = Math.hypot(v.pos.x - c.x, v.pos.y + v.chestY * 0.6 - c.y, v.pos.z - c.z);
      if (d >= s.radius) {
        if (!v.isPlayer && d < s.radius * 1.6) (v as Enemy).suppress(1, ctx);
        continue;
      }
      if (!exposure(this.col, c, v, s)) continue;
      const share = blastShare(d, s);
      const full = v.isPlayer ? 100 : (v as Enemy).maxHp;
      const dmg = share * full;
      markBlast(v, tag, now);
      this.stats.hurt++;
      // Its own blast hurts the thrower (as the world: no credit, no friendly fire to bend).
      const from = self ? null : by;
      let died: boolean;
      if (v.isPlayer) died = v.hurt(dmg, c, from);
      else {
        const e = v as Enemy;
        _dir.set(e.pos.x - c.x, 0.35 * Math.max(0.1, d), e.pos.z - c.z).normalize();
        const k = Math.min(1, share / s.damage);
        died = e.takeHit(dmg, _dir.clone(), e.chest.clone(), ctx, from, { push: s.push * k, stagger: s.stagger * k });
      }
      if (died) this.stats.kills++;
    }
    // The props in reach that a round would break (lamps, cabinets), in its sight.
    for (const col of this.col.near(c.x - s.radius, c.z - s.radius, c.x + s.radius, c.z + s.radius)) {
      if (!col.onHit) continue;
      const q = _hit.point.set(THREE.MathUtils.clamp(c.x, col.min.x, col.max.x), THREE.MathUtils.clamp(c.y, col.min.y, col.max.y), THREE.MathUtils.clamp(c.z, col.min.z, col.max.z));
      if (q.distanceTo(c) > s.radius * 0.6) continue;
      _hit.normal.copy(c).sub(q).normalize();
      _hit.dist = q.distanceTo(c);
      _hit.surface = col.surface;
      _hit.collider = col;
      col.onHit({ ..._hit, point: q.clone(), normal: _hit.normal.clone() });
    }
    // 91.0: then the walls (the wall that stood between still shielded what was behind it).
    if (s.breach) this.w.breach?.(at, s.breach);
    this.fx.explosion(at, normal, size);
    this.flash = 1;
    this.light.position.copy(c).addScaledVector(normal, 0.6);
    const ear = this.w.ear();
    const d = ear.distanceTo(c);
    this.audio.explosion(c, d);
    this.w.felt(d);
  }

  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 4.5);
    // A bright first instant, then a quick fade (the fireball's glow).
    this.light.intensity = this.flash > 0 ? 260 * this.flash * this.flash * this.flash : 0;
  }

  clear() {
    this.flash = 0;
    this.light.intensity = 0;
  }
}
