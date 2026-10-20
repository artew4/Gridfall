import * as THREE from 'three';
import { Enemy, Gunner, Runner, type EnemyCtx } from './Enemy';
import { pick, rand } from '../core/math';
import type { EnemyLook } from '../entities/types';
import { NEON_SYNTHS } from '../entities/enemies/neon';
import { Squad } from './tactics/Squad';

/** Snipers start appearing on rooftops from this wave on (drawn from the same gunner count). */
const SNIPER_WAVE = 4;

const DESIGNED: [number, number][] = [
  [3, 0],
  [5, 0],
  [4, 1],
  [6, 2],
  [7, 3],
  [9, 4],
];

export type WaveState = 'idle' | 'fighting' | 'break';

/** Spawns waves with a breather in between; after the designed waves it keeps escalating. */
export class Waves {
  /** Ground spawn points (validated by the game at build time). */
  spawns: THREE.Vector3[] = [];
  /** Rooftop sniper perches. */
  perches: THREE.Vector3[] = [];
  /** What the enemies of the loaded setting look and sound like. */
  look: EnemyLook = NEON_SYNTHS;
  /**
   * Spawn no closer than this (default 12 m), per spawn point. A level with weather sets it to the
   * current visibility, so enemies appear out of the storm rather than in plain sight; a level with
   * spawns behind walls (a barracks) may let those be nearer.
   */
  minSpawnDistance: (spawn: THREE.Vector3) => number = () => 12;
  /**
   * Picks from the eligible spawns (far enough, preferably unseen). Default: uniformly. A level may
   * weight them (defenders out of a barracks, attackers from behind the player).
   */
  pickSpawn: ((pool: THREE.Vector3[], player: THREE.Vector3) => THREE.Vector3) | null = null;
  onSniper: (at: THREE.Vector3) => void = () => {};
  /** The final hostile of a wave is all that's left. */
  onLastEnemy: () => void = () => {};
  private lastCalled = false;
  private snipersThisWave = 0;
  wave = 0;
  state: WaveState = 'idle';
  enemies: Enemy[] = [];
  /** The combat director for this run's enemies (shared through EnemyCtx.squad). */
  squad = new Squad();
  private queue: ('runner' | 'gunner')[] = [];
  private spawnT = 0;
  private breakT = 0;
  kills = 0;
  onWaveStart: (n: number) => void = () => {};
  onWaveClear: (n: number) => void = () => {};
  onSpawn: (e: Enemy, at: THREE.Vector3) => void = () => {};

  get difficulty() {
    return Math.max(0, this.wave - 1);
  }

  get remaining() {
    return this.queue.length + this.enemies.filter((e) => e.alive).length;
  }

  reset(scene: THREE.Scene) {
    for (const e of this.enemies) e.dispose(scene);
    this.enemies.length = 0;
    this.queue.length = 0;
    this.wave = 0;
    this.kills = 0;
    this.state = 'idle';
    this.squad.reset();
  }

  startNext() {
    this.wave++;
    const [r, g] =
      this.wave <= DESIGNED.length
        ? DESIGNED[this.wave - 1]
        : [9 + (this.wave - DESIGNED.length) * 2, 4 + (this.wave - DESIGNED.length)];
    this.queue = [...Array(r).fill('runner'), ...Array(g).fill('gunner')];
    // Shuffle, but keep one gunner early so ranged pressure starts quickly.
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.spawnT = 1.2;
    this.snipersThisWave = 0;
    this.lastCalled = false;
    this.state = 'fighting';
    this.onWaveStart(this.wave);
  }

  update(dt: number, ctx: EnemyCtx) {
    if (this.state === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startNext();
    }
    if (this.state === 'fighting') {
      this.spawnT -= dt;
      const alive = this.enemies.filter((e) => e.alive).length;
      if (this.queue.length && this.spawnT <= 0 && alive < 10) {
        this.spawnT = rand(1.0, 2.0) * Math.max(0.5, 1 - this.difficulty * 0.06);
        this.spawn(this.queue.shift()!, ctx);
      }
      if (!this.queue.length && alive === 1 && !this.lastCalled) {
        this.lastCalled = true;
        this.onLastEnemy();
      }
      if (!this.queue.length && alive === 0) {
        this.state = 'break';
        this.breakT = 7;
        this.onWaveClear(this.wave);
      }
    }
    // The director first (knowledge, roles, the rush signal, the time-sliced decides), then every
    // enemy's cheap per-frame act.
    if (dt > 0) this.squad.update(ctx, this.enemies);
    for (const e of this.enemies) e.update(dt, ctx);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        this.enemies[i].dispose(ctx.scene);
        this.enemies.splice(i, 1);
      }
    }
  }

  private freePerch(): THREE.Vector3 | null {
    const taken = new Set(this.enemies.filter((e) => e.alive && e instanceof Gunner && e.perch).map((e) => (e as Gunner).perch));
    const free = this.perches.filter((p) => !taken.has(p));
    return free.length ? pick(free) : null;
  }

  private spawn(kind: 'runner' | 'gunner', ctx: EnemyCtx) {
    const p = ctx.player.pos;
    // The wave is sent at a reported contact (±8 m), unless the squad already knows something newer.
    this.squad.report(p, 8);
    // From wave 4 some gunners take a rooftop perch instead of walking in.
    if (kind === 'gunner' && this.wave >= SNIPER_WAVE && (this.snipersThisWave === 0 || Math.random() < 0.3)) {
      const perch = this.freePerch();
      if (perch && perch.distanceTo(p) > 8) {
        this.snipersThisWave++;
        const e = new Gunner(perch.clone(), this.difficulty, ctx.scene, perch, this.look);
        e.yaw = Math.atan2(p.x - perch.x, p.z - perch.z);
        this.enemies.push(e);
        ctx.scene.add(e.rig.root);
        this.onSpawn(e, perch);
        this.onSniper(perch);
        return;
      }
    }
    // Prefer spawns away from the player and out of their line of sight.
    const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const list = this.spawns;
    let candidates = list.filter((s) => s.distanceTo(p) > this.minSpawnDistance(s));
    // Nothing that far (clear weather on an open map): the farthest third.
    if (!candidates.length && list.some((s) => this.minSpawnDistance(s) > 12)) candidates = list.slice().sort((a, b) => b.distanceTo(p) - a.distanceTo(p)).slice(0, Math.max(1, Math.ceil(list.length / 3)));
    const hidden = candidates.filter((s) => !ctx.col.lineOfSight(eye, new THREE.Vector3(s.x, s.y + 1.5, s.z)));
    const pool = hidden.length ? hidden : candidates.length ? candidates : list;
    const base = this.pickSpawn ? this.pickSpawn(pool, p) : pick(pool);
    const at = base.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
    // Jitter must never push a spawn into a wall.
    if (ctx.col.blocked(at, 0.5)) at.copy(base);
    const e = kind === 'runner' ? new Runner(at, this.difficulty, this.look) : new Gunner(at, this.difficulty, ctx.scene, null, this.look);
    e.yaw = Math.atan2(p.x - at.x, p.z - at.z);
    this.enemies.push(e);
    ctx.scene.add(e.rig.root);
    this.onSpawn(e, at);
  }
}
