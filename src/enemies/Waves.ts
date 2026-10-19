import * as THREE from 'three';
import { Enemy, Gunner, Runner, type EnemyCtx } from './Enemy';
import { pick, rand } from '../core/math';

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
  onSniper: (at: THREE.Vector3) => void = () => {};
  /** The final hostile of a wave is all that's left. */
  onLastEnemy: () => void = () => {};
  private lastCalled = false;
  private snipersThisWave = 0;
  wave = 0;
  state: WaveState = 'idle';
  enemies: Enemy[] = [];
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
    // From wave 4 some gunners take a rooftop perch instead of walking in.
    if (kind === 'gunner' && this.wave >= SNIPER_WAVE && (this.snipersThisWave === 0 || Math.random() < 0.3)) {
      const perch = this.freePerch();
      if (perch && perch.distanceTo(p) > 8) {
        this.snipersThisWave++;
        const e = new Gunner(perch.clone(), this.difficulty, ctx.scene, perch);
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
    const candidates = list.filter((s) => s.distanceTo(p) > 12);
    const hidden = candidates.filter((s) => !ctx.col.lineOfSight(eye, new THREE.Vector3(s.x, s.y + 1.5, s.z)));
    const base = pick(hidden.length ? hidden : candidates.length ? candidates : list);
    const at = base.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
    // Jitter must never push a spawn into a wall.
    if (ctx.col.blocked(at, 0.5)) at.copy(base);
    const e = kind === 'runner' ? new Runner(at, this.difficulty) : new Gunner(at, this.difficulty, ctx.scene);
    e.yaw = Math.atan2(p.x - at.x, p.z - at.z);
    this.enemies.push(e);
    ctx.scene.add(e.rig.root);
    this.onSpawn(e, at);
  }
}
