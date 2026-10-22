import * as THREE from 'three';
import type { Game } from '../core/Game';

/*
  20.0, the sniper drill (DEV): how easy the bots are to pick off from range, from a human's side.
  A live match (real time); the player, in god mode, holds a vantage and is a perfect marksman: every
  `every` s it aims at the chest of the nearest OMEGA bot it can see between `minRange` and `maxRange`
  m (leading it by the round's flight) and fires. Per bot it tracks the first hit it lands, and then
  whether the bot dies or gets out of sight (alive), and how long that took.
   - killsPerMin: what a good long-range player earns;
   - escapedPct: of the bots it hit, the share that got out of its sight alive;
   - exposedMedian: from its first hit on a bot to that bot's death or escape (s).
*/

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export async function sniperDrill(game: Game, opts: { seconds?: number; at?: [number, number, number]; minRange?: number; maxRange?: number; every?: number } = {}) {
  const seconds = opts.seconds ?? 60;
  const [px, py, pz] = opts.at ?? [5.2, 0, 34];
  const minR = opts.minRange ?? 20, maxR = opts.maxRange ?? 70;
  const every = opts.every ?? 0.12;
  const dev = (window as unknown as { __dev: { tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void; god(on?: boolean): void; lock(): void } }).__dev;
  const tdm = game.tdm;
  dev.god(true);
  const hitAt = new Map<number, number>();
  const outcome = new Map<number, ['died' | 'escaped', number]>();
  const eye = () => _a.set(game.player.pos.x, game.player.pos.y + 1.65, game.player.pos.z);
  const sees = (b: { pos: THREE.Vector3 }) => game.col.lineOfSight(eye(), _b.set(b.pos.x, b.pos.y + 1.3, b.pos.z));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  let shots = 0;
  const t0 = game.elapsed;
  const end = performance.now() + seconds * 1000;
  // The player's gun is hitscan along the camera: aim, let a frame carry the aim to the camera, fire,
  // and read the hit off the target's health a frame later.
  while (performance.now() < end) {
    dev.lock();
    dev.tp(px, py, pz, game.player.yaw, game.player.pitch);
    const now = game.elapsed;
    for (const b of tdm.bots) {
      const h = hitAt.get(b.uid);
      if (h === undefined || outcome.has(b.uid)) continue;
      if (!b.alive) outcome.set(b.uid, ['died', now - h]);
      else if (!sees(b)) outcome.set(b.uid, ['escaped', now - h]);
    }
    let best: (typeof tdm.bots)[number] | null = null, bd = Infinity;
    for (const b of tdm.bots) {
      if (!b.alive || b.team !== 'omega') continue;
      const d = Math.hypot(b.pos.x - px, b.pos.z - pz);
      if (d < minR || d > maxR || d >= bd || !sees(b)) continue;
      bd = d;
      best = b;
    }
    if (!best) {
      await new Promise((r) => setTimeout(r, every * 1000));
      continue;
    }
    dev.look(best.pos.x, best.pos.y + 1.3, best.pos.z);
    await frame();
    dev.look(best.pos.x + best.vel.x * 0.016, best.pos.y + 1.3, best.pos.z + best.vel.z * 0.016);
    await frame();
    const hp = best.hpFrac;
    dev.shoot();
    shots++;
    await frame();
    if ((best.hpFrac < hp || !best.alive) && !hitAt.has(best.uid)) hitAt.set(best.uid, game.elapsed);
    await new Promise((r) => setTimeout(r, every * 1000));
  }
  const o = [...outcome.values()];
  const died = o.filter(([k]) => k === 'died'), esc = o.filter(([k]) => k === 'escaped');
  const med = (xs: number[]) => (xs.length ? +xs.sort((p, q) => p - q)[Math.floor(xs.length / 2)].toFixed(2) : null);
  const mins = (game.elapsed - t0) / 60;
  return {
    seconds: +(game.elapsed - t0).toFixed(1),
    shots,
    botsHit: hitAt.size,
    kills: died.length,
    escaped: esc.length,
    killsPerMin: +(died.length / Math.max(mins, 1e-3)).toFixed(1),
    escapedPct: +((100 * esc.length) / Math.max(1, o.length)).toFixed(1),
    exposedMedian: med(o.map(([, t]) => t)),
    timeToKillMedian: med(died.map(([, t]) => t)),
    timeToEscapeMedian: med(esc.map(([, t]) => t)),
  };
}
