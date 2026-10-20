import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Input } from '../core/Input';
import { Player } from '../player/Player';
import { Runner, type EnemyCtx } from '../enemies/Enemy';
import { DECK } from '../world/Architecture';

type WP = [number, number, number]; // x, expected floor y, z

/** Routes walked with W only (no jumping), steering towards each waypoint like a player would. */
const ROUTES: { name: string; pts: WP[] }[] = [
  {
    name: 'plaza loop: S1 → W2 → W1 → W3 → S2',
    pts: [[0, 0, 12], [11, 0, 14], [13.7, 0, 14.2], [13.7, DECK, 3.5], [13.5, DECK, -7], [13.5, DECK, -13.5], [0, DECK, -13.5], [-13.5, DECK, -13.5], [-13.5, DECK, -2], [-13.7, DECK, 3.5], [-13.7, 0, 14.2], [-9, 0, 13.5]],
  },
  {
    name: 'Neon Alley → S4 → tech deck → W2 → S1 down',
    pts: [[17, 0, -0.6], [30, 0, -0.6], [41.6, 0, -0.6], [41.6, 0, -2.1], [30.5, DECK, -2.1], [19, DECK, -2.1], [13.5, DECK, -2.1], [13.7, DECK, 3.5], [13.7, 0, 14.2], [8, 0, 12]],
  },
  {
    name: 'Service Passage → S3 → pipe gallery → W3',
    pts: [[-18, 0, -3.6], [-36, 0, -3.6], [-42.5, 0, -3.4], [-41.6, 0, -5.1], [-30.5, DECK, -5.1], [-17, DECK, -5.1], [-13.5, DECK, -5.1], [-13.5, DECK, -12], [-13.5, DECK, -13.5]],
  },
  {
    name: 'W1 → W3 → S3 down → Service Passage',
    pts: [[0, DECK, -13.5], [-13.5, DECK, -13.5], [-13.5, DECK, -5.1], [-24, DECK, -5.1], [-30.5, DECK, -5.1], [-41.6, 0, -5.1], [-42.5, 0, -3.3], [-30, 0, -3.3]],
  },
  {
    name: 'Lantern Street → back alley → Service Passage → plaza',
    pts: [[0, 0, 30], [0, 0, 25.5], [-8, 0, 25.5], [-22.5, 0, 25.5], [-22.5, 0, 12], [-22.5, 0, -3.6], [-18, 0, -3.2], [-12, 0, -3.5], [-6, 0, 0]],
  },
  {
    name: 'Railway Street → trackside → Neon Alley → plaza',
    pts: [[0, 0, -10], [0, 0, -20], [3, 0, -21.9], [9, 0, -21.9], [15, 0, -21.9], [20.6, 0, -21.9], [21, 0, -9], [21, 0, -0.6], [17, 0, -0.6], [10, 0, 1.5]],
  },
  {
    name: 'rooftop circuit: S6 up → Sky Garden → bridge → Tech Roof → S7 down → tech deck',
    pts: [[13, 0, 1], [15.8, 0, 1.1], [33, 8.5, 1.1], [41.2, 8.5, 3.6], [41.2, 8.5, -4.5], [33, 8.5, -4.2], [23.5, 4.5, -4.2], [23.5, 4.5, -2.1], [19, 4.5, -2.1]],
  },
  {
    name: 'W2 → S5 → Sky Garden → Lantern Roof → bridge over Lantern St → West Terrace → S8 → W3',
    pts: [[13.5, 4.5, -2], [14.2, 4.5, 3.3], [23.4, 8.5, 3.3], [26, 8.5, 7.5], [17.5, 8.5, 12], [17.5, 8.5, 18], [7, 8.5, 20], [-7, 8.5, 20], [-12, 8.5, 19.5], [-16.2, 8.5, 12.5], [-16.2, 8.5, 8.7], [-16.2, 4.5, -0.8], [-13.5, 4.5, -1]],
  },
  {
    name: 'Lantern Street → torii → plaza',
    pts: [[0, 0, 46], [0, 0, 36], [0, 0, 18], [0, 0, 12]],
  },
];

function fakeInput(): Input {
  const keys = new Set<string>(['KeyW']);
  return { keys, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, mouseDown: false, key: (c: string) => keys.has(c) } as unknown as Input;
}

/** Walks a route with the real Player controller and collision. */
function walk(game: Game, pts: WP[]) {
  const p = new Player(game.col, game.audio);
  p.reset(pts[0][0], pts[0][2], 0);
  p.pos.y = pts[0][1];
  const input = fakeInput();
  const dt = 1 / 60;
  let maxStep = 0;
  let maxAt: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [tx, ty, tz] = pts[i];
    let t = 0;
    let best = Infinity;
    let since = 0;
    for (;;) {
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) break;
      p.yaw = Math.atan2(-dx, -dz);
      const y0 = p.pos.y;
      p.update(dt, input, true, t);
      if (Math.abs(p.pos.y - y0) > maxStep) {
        maxStep = Math.abs(p.pos.y - y0);
        maxAt = p.pos.toArray().map((v) => +v.toFixed(2));
      }
      t += dt;
      if (d < best - 0.05) {
        best = d;
        since = 0;
      } else since += dt;
      if (since > 2 || t > 40) return { ok: false, at: p.pos.toArray().map((v) => +v.toFixed(2)), towards: pts[i], maxStep };
    }
    if (Math.abs(p.pos.y - ty) > 0.35) return { ok: false, at: p.pos.toArray().map((v) => +v.toFixed(2)), towards: pts[i], wrongHeight: true, maxStep };
  }
  return { ok: true, maxStep: +maxStep.toFixed(3), maxAt };
}

/**
 * Runs at a railing/parapet and jumps: `expect` says whether the player should end up below
 * (vaultable) or stay on top (guarded drop).
 */
function jump(game: Game, from: [number, number, number], yaw: number, expectDrop: boolean) {
  const p = new Player(game.col, game.audio);
  p.reset(from[0], from[2], yaw, from[1]);
  const input = fakeInput();
  const keys = (input as unknown as { keys: Set<string>; pressed: Set<string> });
  const dt = 1 / 60;
  let jumped = false;
  let t = 0;
  for (; t < 2.2; t += dt) {
    // Run in, jump, then let go of W once airborne so we test the drop, not a sprint across the plaza.
    if (t > 1.2) keys.keys.delete('KeyW');
    // Jump once, when about a metre from the edge (we've stopped making progress or reached speed).
    if (!jumped && t > 0.35) {
      keys.pressed.add('Space');
      jumped = true;
    }
    p.update(dt, input, true, t);
    keys.pressed.clear();
  }
  const dropped = p.pos.y < from[1] - 2;
  return { ok: dropped === expectDrop, from, end: p.pos.toArray().map((v) => +v.toFixed(2)), hp: Math.round(p.health) };
}

/** Spawns a runner at a spawn point and checks it reaches a stationary player at `goal`. */
function chase(game: Game, from: THREE.Vector3, goal: THREE.Vector3, seconds = 60) {
  const scene = new THREE.Scene();
  const target = new Player(game.col, game.audio);
  target.reset(goal.x, goal.z, 0);
  target.pos.y = goal.y;
  const enemies: Runner[] = [];
  const ctx: EnemyCtx = { ...game.ctx, scene, player: target, enemies, occupied: new Set(), damagePlayer: () => {} };
  const r = new Runner(from.clone(), 0);
  enemies.push(r);
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    ctx.time = t;
    r.update(dt, ctx);
    const dxz = Math.hypot(r.pos.x - goal.x, r.pos.z - goal.z);
    if (dxz < 2.6 && Math.abs(r.pos.y - goal.y) < 1.2) return { ok: true, t: +t.toFixed(1) };
  }
  return { ok: false, at: r.pos.toArray().map((v) => +v.toFixed(2)) };
}

export function runRouteCheck(game: Game) {
  const t0 = performance.now();
  const routes = ROUTES.map((r) => ({ name: r.name, ...walk(game, r.pts) }));
  // Vaults and drops: walkway railing to the plaza, Sky Garden low parapet onto S1, high parapets hold.
  const jumps = [
    { name: 'vault W1 railing → plaza', ...jump(game, [0, 4.5, -13.2], Math.PI, true) },
    { name: 'vault W2 railing → plaza', ...jump(game, [13.2, 4.5, -6], Math.PI / 2, true) },
    { name: 'drop Sky Garden low parapet → S1', ...jump(game, [16.3, 8.5, 7], Math.PI / 2, true) },
    { name: 'high parapet holds (Sky Garden over Neon Alley)', ...jump(game, [27, 8.5, 3.3], 0, false) },
    { name: 'high parapet holds (West Terrace over plaza)', ...jump(game, [-10, 8.5, 16.2], 0, false) },
    { name: 'bridge railing holds (over Lantern Street)', ...jump(game, [0, 8.5, 20], 0, false) },
  ];

  // Navigation graph: every node reachable from every spawn.
  const nav = game.nav;
  const spawns = game.waves.spawns;
  const graph = spawns.map((s) => {
    const n = nav.nearestVisible(new THREE.Vector3(s.x, s.y + 1, s.z));
    const reach = n >= 0 ? nav.reachable(n) : new Set<number>();
    return { spawn: s.toArray(), node: n, reach: reach.size, of: nav.nodes.length };
  });

  // Enemies actually get there: runners from each spawn to targets on both levels.
  const goals = [
    new THREE.Vector3(0, DECK, -13.5),
    new THREE.Vector3(13.5, DECK, -7),
    new THREE.Vector3(-13.5, DECK, -1),
    new THREE.Vector3(24, DECK, -2.1),
    new THREE.Vector3(-8, 0, 8),
    new THREE.Vector3(37, 8.5, 10.5),
    new THREE.Vector3(-12, 8.5, 19.5),
  ];
  const chases = [];
  for (const s of spawns) for (const g of goals) chases.push({ from: s.toArray(), to: g.toArray(), ...chase(game, s, g) });

  const result = {
    routesOk: routes.every((r) => r.ok),
    jumpsOk: jumps.every((j) => j.ok),
    jumps,
    graphOk: graph.every((g) => g.reach === g.of),
    chasesOk: chases.every((c) => c.ok),
    routes,
    graph,
    chases: chases.filter((c) => !c.ok),
    chaseCount: chases.length,
    ms: Math.round(performance.now() - t0),
  };
  console.log('[route-check]', result);
  return result;
}
