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
