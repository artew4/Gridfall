import * as THREE from 'three';
import { Enemy, Gunner, Runner, type EnemyCtx } from './Enemy';
import { pick, rand } from '../core/math';

const SPAWNS = [
  new THREE.Vector3(-23, 0, -2.5), // left alley
  new THREE.Vector3(23, 0, -16), // right alley
  new THREE.Vector3(0, 0, -50), // under the railway
  new THREE.Vector3(-3.5, 0, -47),
  new THREE.Vector3(3.5, 0, -47),
];

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

  private spawn(kind: 'runner' | 'gunner', ctx: EnemyCtx) {
    // Prefer spawns away from the player and out of their line of sight.
    const p = ctx.player.pos;
    const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const candidates = SPAWNS.filter((s) => s.distanceTo(p) > 12);
    const hidden = candidates.filter((s) => !ctx.col.lineOfSight(eye, new THREE.Vector3(s.x, 1.5, s.z)));
    const base = pick(hidden.length ? hidden : candidates.length ? candidates : SPAWNS);
    const at = base.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
    const e = kind === 'runner' ? new Runner(at, this.difficulty) : new Gunner(at, this.difficulty, ctx.scene);
    e.yaw = Math.atan2(p.x - at.x, p.z - at.z);
    this.enemies.push(e);
    ctx.scene.add(e.rig.root);
    this.onSpawn(e, at);
  }
}
