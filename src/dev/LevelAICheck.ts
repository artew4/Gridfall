import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Squad, type TacAgent } from '../enemies/tactics/Squad';

const ZERO = new THREE.Vector3();
import { Player } from '../player/Player';
import { Gunner, Runner, type Enemy, type EnemyCtx } from '../enemies/Enemy';

/**
 * DEV only, any level. Can the survival enemies get everywhere the player can be?
 *  - nav graph: from every validated spawn, every node is reachable;
 *  - runners: from spawns spread around the map to each of the level's test goals (inside every
 *    building, every walkable roof, the yard, the open ground), with the real Enemy update at 30 Hz;
 *    reports how long each was stuck (no progress) and where;
 *  - gunners: from each spawn sample, against a player in the yard, must get a shot off.
 * `sight` overrides the visibility the gunners work with (a sandstorm's worst case by default).
 * Since 5.0 the squad is fed the target's position every step (an all-knowing squad): this is a
 * reachability check; whether they can *find* him is the tactical check's job.
 */
export function checkLevelAI(game: Game, opts: { spawns?: number; seconds?: number; sight?: number } = {}) {
  const t0 = performance.now();
  const nav = game.nav;
  const spawns = game.waves.spawns;
  const graph = spawns.map((s) => {
    const n = nav.nearestVisible(new THREE.Vector3(s.x, s.y + 1, s.z));
    return { spawn: s.toArray().map((v) => +v.toFixed(1)), node: n, reach: n >= 0 ? nav.reachable(n).size : 0 };
  });
  const graphOk = graph.every((g) => g.reach === nav.nodes.length);

  const k = Math.min(opts.spawns ?? 8, spawns.length);
  const sample = Array.from({ length: k }, (_, i) => spawns[Math.floor((i * spawns.length) / k)]);
  const goals = game.level.data.testGoals ?? [new THREE.Vector3(game.level.data.start.x, game.level.data.start.y ?? 0, game.level.data.start.z)];
  const seconds = opts.seconds ?? 70;

  const sim = (e: Enemy, goal: THREE.Vector3, done: (e: Enemy) => boolean) => {
    const scene = new THREE.Scene();
    const target = new Player(game.col, game.audio);
    target.reset(goal.x, goal.z, 0, goal.y);
    const enemies: Enemy[] = [e];
    const ctx: EnemyCtx = { ...game.ctx, scene, player: target, enemies, occupied: new Set(), squad: new Squad(), damagePlayer: () => {}, sightRange: opts.sight ?? game.ctx.sightRange };
    const dt = 1 / 30;
    let best = Infinity, lastGain = 0, worstStall = 0, stallAt: number[] = [];
    for (let t = 0; t < seconds; t += dt) {
      ctx.time = t;
      // A nav check, not a hunt: the squad always knows exactly where the target is (as the 4.x
      // chasers did), so this measures getting there, not finding him (that's __dev.tactical()).
      ctx.squad.sighting(e as unknown as TacAgent, goal, ZERO);
      ctx.squad.update(ctx, enemies);
      e.update(dt, ctx);
      if (done(e)) return { ok: true, t: +t.toFixed(1), worstStall: +worstStall.toFixed(1), stallAt };
      const d = Math.hypot(e.pos.x - goal.x, e.pos.z - goal.z) + Math.abs(e.pos.y - goal.y);
      if (d < best - 0.5) {
        best = d;
        lastGain = t;
      } else if (t - lastGain > worstStall) {
        worstStall = t - lastGain;
        stallAt = e.pos.toArray().map((v) => +v.toFixed(1));
      }
      if (!Number.isFinite(e.pos.x + e.pos.y + e.pos.z) || game.col.blocked(e.pos, 0.25)) {
        if (game.col.blocked(e.pos, 0.25) && t > 1) return { ok: false, why: 'inside geometry', at: e.pos.toArray().map((v) => +v.toFixed(2)) };
      }
    }
    return { ok: false, why: 'timeout', at: e.pos.toArray().map((v) => +v.toFixed(2)), worstStall: +worstStall.toFixed(1), stallAt };
  };

  const runners = [];
  for (const s of sample) {
    for (const g of goals) {
      const r = sim(new Runner(s.clone(), 0, game.waves.look), g, (e) => Math.hypot(e.pos.x - g.x, e.pos.z - g.z) < 2.6 && Math.abs(e.pos.y - g.y) < 1.2);
      runners.push({ from: s.toArray().map((v) => +v.toFixed(1)), to: g.toArray().map((v) => +v.toFixed(2)), ...r });
    }
  }
  const yard = goals[goals.length - 4] ?? goals[0];
  const gunners = sample.map((s) => {
    const r = sim(new Gunner(s.clone(), 0, new THREE.Scene(), null, game.waves.look), yard, (e) => (e as Gunner).state === 'aim' || (e as Gunner).state === 'fire');
    return { from: s.toArray().map((v) => +v.toFixed(1)), ...r };
  });
  const times = runners.filter((r) => r.ok).map((r) => r.t as number);
  return {
    ms: Math.round(performance.now() - t0),
    nodes: nav.nodes.length,
    graphOk,
    graphBad: graph.filter((g) => g.reach !== nav.nodes.length),
    runners: { runs: runners.length, ok: runners.filter((r) => r.ok).length, median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)], worstStall: Math.max(...runners.map((r) => r.worstStall ?? 0)), failures: runners.filter((r) => !r.ok),
      // The longest spells without getting closer (a detour round a wall, or a snag worth a look).
      stalls: runners.slice().sort((a, b) => (b.worstStall ?? 0) - (a.worstStall ?? 0)).slice(0, 5) },
    gunners: { runs: gunners.length, ok: gunners.filter((r) => r.ok).length, failures: gunners.filter((r) => !r.ok) },
  };
}
