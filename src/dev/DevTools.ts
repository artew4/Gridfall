import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';

/** DEV-only console helpers for automated browser checks (never bundled in production). */
export function installDevTools(game: Game) {
  const g = game as unknown as { beginPlay(): void; resume(): void; shoot(): void };
  const dev = {
    /**
     * Skip title and intro and play immediately (pointer lock is faked: automation can't hold it).
     * `setting` loads another level first (synchronously).
     */
    start(mode: 'story' | 'arcade' = 'story', setting?: SettingId) {
      if (setting && setting !== game.setting) game.loadLevel(setting);
      if (!game.level.info.modes.includes(mode)) throw new Error(`${game.setting} has no ${mode} mode`);
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
      game.safety.reset(p.pos);
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
      for (const x of game.tokyo.security.guards) x.dispose(game.scene);
      game.tokyo.security.guards.length = 0;
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
    async stress(opts: { samples?: number; seconds?: number; fps?: (number | 'spiky')[] } = {}) {
      return (await import('./WorldCheck')).stressController(game, opts);
    },
    /** Any level: nav graph from every spawn, runners to every test goal, gunners get a shot off. */
    async levelAI(opts: { spawns?: number; seconds?: number; sight?: number } = {}) {
      return (await import('./LevelAICheck')).checkLevelAI(game, opts);
    },
    /** Train and platform doors: boarding, closed doors, riding, doorway obstruction (real Rail). */
    async train() {
      return (await import('./TrainCheck')).checkTrain(game);
    },
    /** The fixed version-comparison benchmark (current preset). */
    async bench(seconds = 3, opts: { pipelines?: ('v4' | 'raw' | 'v37')[] } = {}) {
      return (await import('./Bench')).bench(game, seconds, opts);
    },
    /** Render pipeline for comparisons (the F8 cycle): 'v4', 'raw' (no composer) or 'v37'. */
    pipeline(p?: 'v4' | 'raw' | 'v37') {
      if (p) game.setPipeline(p);
      return game.renderer.pipeline;
    },
    /** Frozen-frame contact sheet of the level's fixed views (× pipelines for an A/B). */
    async sheet(names?: string[], pipes?: ('v4' | 'raw' | 'v37')[]) {
      const c = await (await import('./Shots')).sheet(game, names, pipes);
      return [c.width, c.height];
    },
    async hideSheet() {
      (await import('./Shots')).hideSheet();
    },
    /** Linear HDR luminance percentiles per view (optionally of what `hide()` returns, by diff). */
    async hdr(names?: string[], hide?: () => THREE.Object3D[]) {
      return (await import('./Shots')).hdr(game, names, hide);
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
  bindPipelineKey(game);
}

/**
 * F8 cycles the render pipeline for side-by-side comparison: 4.0 → RAW (no composer) → 3.7 → 4.0,
 * with a short label. Capture phase: F8 never reaches the game's input (it would skip the opening).
 */
function bindPipelineKey(game: Game) {
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:16px;top:12px;z-index:50;font:600 12px monospace;letter-spacing:2px;color:#9ff;background:rgba(0,0,0,.55);padding:4px 8px;pointer-events:none;opacity:0;transition:opacity .4s';
  document.body.appendChild(label);
  let hide = 0;
  const names = { v4: 'PIPELINE 4.0 · COMPOSER', raw: 'PIPELINE RAW · NO COMPOSER', v37: 'PIPELINE 3.7 · LEGACY LOOK' } as const;
  const order = ['v4', 'raw', 'v37'] as const;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'F8') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      game.setPipeline(order[(order.indexOf(game.renderer.pipeline) + 1) % order.length]);
      label.textContent = names[game.renderer.pipeline];
      label.style.opacity = '1';
      clearTimeout(hide);
      hide = window.setTimeout(() => (label.style.opacity = '0'), 1600);
    },
    true,
  );
}
