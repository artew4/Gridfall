import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';
import type { TacticalEnemy } from '../enemies/Enemy';

/**
 * DEV only. Arcade Survival played live (the real game loop, waves, weapon, rounds and damage
 * events) by a simple bot: it walks between nav nodes round the level's start, turns to the nearest
 * enemy it can see within 40 m and holds the trigger (the weapon reloads itself when empty). Damage
 * is counted but not applied (so the run lasts). Each second it samples what every enemy is doing and
 * checks the world rules (inside bounds, not inside geometry). Not a substitute for a human: it can't
 * tell whether the fight is fun or fair, only whether the systems behave.
 */
export async function survivalRun(game: Game, opts: { setting?: SettingId; seconds?: number; startWave?: number } = {}) {
  const dev = (window as unknown as { __dev: { start(m: string, s?: string): void; lock(): void } }).__dev;
  dev.start('arcade', opts.setting ?? game.setting);
  const w = game.waves;
  if (opts.startWave && opts.startWave > 1) {
    w.reset(game.scene);
    w.wave = opts.startWave - 1;
    w.startNext();
  }
  const p = game.player;
  const pd = p as unknown as { damage: (a: number, f: THREE.Vector3, t: number) => void };
  const origDamage = pd.damage;
  let damage = 0, hits = 0;
  pd.damage = (a: number) => {
    damage += a;
    hits++;
  };
  const input = game.input;
  const st = game.level.data.start;
  const home = new THREE.Vector3(st.x, st.y ?? 0, st.z);
  const nodes = game.nav.nodes.filter((n) => Math.hypot(n.x - home.x, n.z - home.z) < 30 && Math.abs(n.y - 1 - home.y) < 0.6);
  let goal = home.clone();
  let route: THREE.Vector3[] = [];
  const eye = new THREE.Vector3();
  const samples: Record<string, number> = {};
  const oob: string[] = [];
  const inside: string[] = [];
  const errors: string[] = [];
  const onErr = (e: ErrorEvent) => errors.push(String(e.message));
  window.addEventListener('error', onErr);
  const b = game.level.data.bounds;
  let fired = 0;
  const t0 = performance.now();
  const kills0 = w.kills;
  // Works on builds without the 5.0 squad too (for before/after runs).
  const squad = (w as { squad?: typeof w.squad }).squad;
  const barks: string[] = [];
  const origBark = squad?.barks.onBark;
  if (squad && origBark)
    squad.barks.onBark = (e) => {
      barks.push(`${game.ctx.time.toFixed(1)} ${e.kind}`);
      origBark(e);
    };
  // Enemy rounds fired.
  const proj = game.projectiles as unknown as { fire: (...a: unknown[]) => void };
  const origFire = proj.fire;
  let enemyShots = 0;
  proj.fire = function (this: unknown, ...a: unknown[]) {
    enemyShots++;
    return origFire.apply(game.projectiles, a);
  };
  let frames = 0;
  const raf = () => {
    if (performance.now() - t0 > (opts.seconds ?? 60) * 1000) return;
    frames++;
    if (game.state === 'paused') dev.lock();
    eye.set(p.pos.x, p.pos.y + 1.65, p.pos.z);
    // Target: the nearest live enemy in sight.
    let target: TacticalEnemy | null = null;
    let td = 40;
    for (const e of w.enemies as TacticalEnemy[]) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < td && game.col.lineOfSight(eye, e.chest.clone())) {
        td = d;
        target = e;
      }
    }
    // Move: along a route to the current goal; a new goal when there.
    if (!route.length || route[0].distanceTo(p.pos) < 0.8) {
      if (route.length) route.shift();
      if (!route.length) {
        goal = nodes.length ? nodes[Math.floor(Math.random() * nodes.length)].clone().setY(home.y) : home.clone();
        route = game.nav.route(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), new THREE.Vector3(goal.x, goal.y + 1, goal.z)).map((i) => game.nav.nodes[i].clone().setY(game.nav.nodes[i].y - 1));
        route.push(goal.clone());
      }
    }
    const next = route[0] ?? goal;
    const moveYaw = Math.atan2(-(next.x - p.pos.x), -(next.z - p.pos.z));
    input.keys.clear();
    if (target) {
      const c = target.chest;
      const want = Math.atan2(-(c.x - p.pos.x), -(c.z - p.pos.z));
      let dy = want - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += dy * 0.25;
      p.pitch = Math.atan2(c.y - (p.pos.y + 1.65), Math.hypot(c.x - p.pos.x, c.z - p.pos.z));
      input.mouseDown = Math.abs(dy) < 0.08;
      if (input.mouseDown) fired++;
      // Strafe relative to the aim towards the next waypoint.
      const rel = Math.atan2(Math.sin(moveYaw - p.yaw), Math.cos(moveYaw - p.yaw));
      if (Math.abs(rel) < 0.8) input.keys.add('KeyW');
      else if (Math.abs(rel) > 2.3) input.keys.add('KeyS');
      else input.keys.add(rel > 0 ? 'KeyA' : 'KeyD');
    } else {
      input.mouseDown = false;
      p.yaw = moveYaw;
      p.pitch = 0;
      input.keys.add('KeyW');
    }
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  const sampler = window.setInterval(() => {
    for (const e of w.enemies as TacticalEnemy[]) {
      if (!e.alive) continue;
      const k = `${e.kind[0]}:${e.tac?.action ?? e.state}`;
      samples[k] = (samples[k] ?? 0) + 1;
      const q = e.pos;
      if (q.x < b.min.x || q.x > b.max.x || q.z < b.min.y || q.z > b.max.y || q.y < game.level.data.floorMin - 0.5) oob.push(`${e.kind} ${q.toArray().map((v) => +v.toFixed(1))}`);
      if (game.col.blocked(q, 0.2)) inside.push(`${e.kind} ${q.toArray().map((v) => +v.toFixed(1))}`);
    }
  }, 1000);
  await new Promise((r) => setTimeout(r, (opts.seconds ?? 60) * 1000 + 100));
  clearInterval(sampler);
  window.removeEventListener('error', onErr);
  input.keys.clear();
  input.mouseDown = false;
  pd.damage = origDamage;
  if (squad && origBark) squad.barks.onBark = origBark;
  delete (proj as { fire?: unknown }).fire;
  if (proj.fire !== origFire) proj.fire = origFire;
  const total = Object.values(samples).reduce((a, c) => a + c, 0) || 1;
  return {
    setting: game.setting,
    seconds: opts.seconds ?? 60,
    frames,
    wave: w.wave,
    waveState: w.state,
    kills: w.kills - kills0,
    alive: w.enemies.filter((e) => e.alive).length,
    framesFiring: fired,
    damageTaken: Math.round(damage),
    playerHits: hits,
    enemyShots,
    squadMode: squad?.mode ?? null,
    share: Object.fromEntries(Object.entries(samples).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, +(v / total).toFixed(2)])),
    barks: barks.length,
    barkKinds: barks.reduce((m: Record<string, number>, s) => ((m[s.split(' ')[1]] = (m[s.split(' ')[1]] ?? 0) + 1), m), {}),
    sched: squad?.sched.stats ?? null,
    outOfBounds: oob.slice(0, 5),
    insideGeometry: inside.slice(0, 5),
    errors: errors.slice(0, 5),
  };
}
