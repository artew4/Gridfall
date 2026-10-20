import * as THREE from 'three';
import type { Game } from '../core/Game';

/** DEV-only console helpers for automated browser checks (never bundled in production). */
export function installDevTools(game: Game) {
  const g = game as unknown as { beginPlay(): void; resume(): void; shoot(): void };
  const dev = {
    /** Skip title and intro and play immediately (pointer lock is faked: automation can't hold it). */
    start(mode: 'story' | 'arcade' = 'story') {
      game.mode = mode;
      game.hud.show(game.hud.title, false);
      g.beginPlay();
      game.input.locked = true;
      if (game.state === 'paused') g.resume();
      return game.state;
    },
    lock() {
      game.input.locked = true;
      if (game.state === 'paused') g.resume();
    },
    tp(x: number, y: number, z: number, yaw = game.player.yaw, pitch = 0) {
      const p = game.player;
      p.pos.set(x, y, z);
      p.vel.set(0, 0, 0);
      p.yaw = yaw;
      p.pitch = pitch;
      p.eyeY = y + 1.65;
    },
    /** Face a world point. */
    look(x: number, y: number, z: number) {
      const p = game.player;
      p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
      p.pitch = Math.atan2(y - (p.pos.y + 1.65), Math.hypot(x - p.pos.x, z - p.pos.z));
    },
    god(on = true) {
      const p = game.player as unknown as { damage: unknown; __damage?: unknown };
      if (on && !p.__damage) {
        p.__damage = p.damage;
        p.damage = () => {};
      } else if (!on && p.__damage) {
        p.damage = p.__damage;
        delete p.__damage;
      }
    },
    noGuards() {
      for (const x of game.security.guards) x.dispose(game.scene);
      game.security.guards.length = 0;
    },
    shoot() {
      g.shoot();
    },
    /** World overlay: cones, lines of sight, goals, search points, last known position. */
    async ai(on = true) {
      const { AIDebug } = await import('./AIDebug');
      const w = window as unknown as { __aiDebug?: InstanceType<typeof AIDebug> };
      w.__aiDebug ??= new AIDebug(game);
      w.__aiDebug.set(on);
    },
    /** Plays Story Escape end to end like a player reading the screen (logs into window.__run). */
    async story(opts: { watchIntro?: boolean; timeScale?: number } = {}) {
      const w = window as unknown as { __run: unknown };
      w.__run = 'running';
      w.__run = await (await import('./StoryRun')).runStory(game, opts);
      return w.__run;
    },
    /** Physics overlay around the camera: colliders by type, the player cylinder and ground point. */
    async colliders(on = true, radius = 25) {
      const { CollisionDebug } = await import('./CollisionDebug');
      const w = window as unknown as { __colDebug?: InstanceType<typeof CollisionDebug> };
      w.__colDebug ??= new CollisionDebug(game);
      w.__colDebug.radius = radius;
      w.__colDebug.set(on);
    },
    /** World validation: reachability, escapes, traps, invisible walls, walk-through visuals. */
    async world(opts: { cell?: number; stationOpen?: boolean } = {}) {
      return (await import('./WorldCheck')).checkWorld(game, opts);
    },
    /** Real-controller stress runs from sampled reachable cells (walls, falls, voids). */
    async stress(opts: { samples?: number; seconds?: number } = {}) {
      return (await import('./WorldCheck')).stressController(game, opts);
    },
    /** The fixed version-comparison benchmark (current preset). */
    async bench(seconds = 3) {
      return (await import('./Bench')).bench(game, seconds);
    },
    /** Frame rate, CPU and GPU milliseconds per frame, busy share (power proxy). */
    async perf(seconds = 4) {
      return (await import('./PerfProbe')).probe(game, seconds);
    },
    /** Headless pursuit scenarios (escape, hide, shots, re-detection). */
    async pursuit() {
      return (await import('./PursuitCheck')).checkPursuit(game);
    },
    /** Perception scenarios against the real map geometry. */
    async vision() {
      return (await import('./VisionCheck')).checkVision(game);
    },
    v: (x: number, y: number, z: number) => new THREE.Vector3(x, y, z),
    /** Collects `fn()` every `ms` into window.__log (for observations longer than one call). */
    record(fn: () => unknown, ms = 1000) {
      const w = window as unknown as { __log: unknown[]; __li: number };
      clearInterval(w.__li);
      w.__log = [];
      const t0 = performance.now();
      w.__li = window.setInterval(() => w.__log.push([Math.round((performance.now() - t0) / 100) / 10, fn()]), ms);
    },
    stop() {
      const w = window as unknown as { __log: unknown[]; __li: number };
      clearInterval(w.__li);
      return w.__log;
    },
  };
  (window as unknown as { __dev: typeof dev }).__dev = dev;
}
