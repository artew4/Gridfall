import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';
import { probe } from './PerfProbe';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEV only. The survival AI under load, per level: arcade, god mode, the late designed wave (10
 * alive at once), the player at the level's start shooting at the nearest enemy every 0.6 s (so
 * near misses, hits, cover and suppression all happen). Measured with the frame probe plus the wall
 * time inside the enemy update (`aiMs`), collision queries made by it, and its worst single frame.
 * Works on any AI version that drives enemies through `Waves.update`, so it compares before/after.
 */
export async function aiBench(game: Game, opts: { levels?: SettingId[]; seconds?: number; settle?: number } = {}) {
  const dev = (window as unknown as { __dev: { start(m: string, s?: string): void; god(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; lock(): void } }).__dev;
  const out: Record<string, unknown> = {};
  for (const id of opts.levels ?? (['tokyo', 'desert', 'jungle'] as SettingId[])) {
    dev.start('arcade', id);
    dev.god();
    const w = game.waves;
    w.reset(game.scene);
    w.wave = 5;
    w.startNext();
    const st = game.level.data.start;
    dev.tp(st.x, st.y ?? 0, st.z, st.yaw, 0);
    // Wrap the enemy update: wall time, per-frame worst, and the collision rays it casts.
    const wv = w as unknown as { update(dt: number, ctx: unknown): void };
    const orig = wv.update;
    const col = game.col as unknown as Record<string, (...a: unknown[]) => unknown>;
    const names = ['raycast', 'resolveCircle', 'groundHeightAt'] as const;
    const origCol = names.map((n) => col[n]);
    let inside = false;
    const calls = { raycast: 0, resolveCircle: 0, groundHeightAt: 0 };
    names.forEach((n, i) => {
      col[n] = function (this: unknown, ...a: unknown[]) {
        if (inside) calls[n]++;
        return origCol[i].apply(game.col, a);
      };
    });
    let ms = 0, frames = 0, worst = 0;
    const samples: number[] = [];
    wv.update = function (this: unknown, dt: number, ctx: unknown) {
      const t = performance.now();
      inside = true;
      orig.call(w, dt, ctx);
      inside = false;
      const d = performance.now() - t;
      ms += d;
      frames++;
      samples.push(d);
      if (d > worst) worst = d;
    };
    // The player keeps shooting at the nearest live enemy (aim taken from the bench, not the AI).
    const g = game as unknown as { shoot(): void };
    const shooter = window.setInterval(() => {
      const p = game.player;
      let best: THREE.Vector3 | null = null;
      let bd = Infinity;
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(p.pos);
        if (d < bd) {
          bd = d;
          best = e.pos;
        }
      }
      if (!best) return;
      p.yaw = Math.atan2(-(best.x - p.pos.x), -(best.z - p.pos.z));
      p.pitch = Math.atan2(best.y + 1.2 - (p.pos.y + 1.65), Math.hypot(best.x - p.pos.x, best.z - p.pos.z));
      g.shoot();
    }, 600);
    await wait((opts.settle ?? 14) * 1000);
    if (game.state === 'paused') dev.lock();
    ms = 0;
    frames = 0;
    worst = 0;
    samples.length = 0;
    calls.raycast = calls.resolveCircle = calls.groundHeightAt = 0;
    const alive0 = w.enemies.filter((e) => e.alive).length;
    const r = (await probe(game, opts.seconds ?? 5)) as unknown as Record<string, number>;
    const alive1 = w.enemies.filter((e) => e.alive).length;
    clearInterval(shooter);
    wv.update = orig;
    delete (wv as { update?: unknown }).update;
    names.forEach((n, i) => (col[n] = origCol[i]));
    names.forEach((n) => delete (col as Record<string, unknown>)[n]);
    samples.sort((a, b) => a - b);
    const q = (k: number) => +(samples[Math.min(samples.length - 1, Math.floor(k * samples.length))] ?? 0).toFixed(3);
    out[id] = {
      fps: r.fps,
      cpuMs: r.cpuMsPerFrame,
      gpuMs: r.gpuMsPerFrame,
      p99: r.frameMsP99,
      aiMsAvg: +(ms / Math.max(1, frames)).toFixed(3),
      aiMsP95: q(0.95),
      aiMsP99: q(0.99),
      aiMsWorst: +worst.toFixed(2),
      raysPerFrame: +(calls.raycast / Math.max(1, frames)).toFixed(1),
      resolvesPerFrame: +(calls.resolveCircle / Math.max(1, frames)).toFixed(1),
      alive: [alive0, alive1],
      focused: document.hasFocus() && !document.hidden,
    };
    w.reset(game.scene);
    w.state = 'idle';
  }
  return out;
}
