import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Guard } from '../stealth/Guard';
import { VISION } from '../stealth/Perception';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Run {
  detected: boolean;
  /** Seconds to positive identification (or null). */
  t: number | null;
  maxSuspicion: number;
  maxVisible: number;
}

/**
 * DEV only. Runs the real guard perception against the real map geometry with a stationary test
 * guard and player: cone, range, vertical limits, walls, floors, the street surface over the
 * station, and timing. Returns a table of scenarios with pass/fail.
 */
export function checkVision(game: Game) {
  const sec = game.tokyo.security;
  const ctx = sec.ctx;
  const player = game.player;
  const saved = { pos: player.pos.clone(), yaw: player.yaw, time: ctx.time, armed: sec.playerArmed };
  for (const g of sec.guards) g.dispose(game.scene);
  sec.guards.length = 0;

  const run = (gp: THREE.Vector3, yaw: number, pp: THREE.Vector3, armed: boolean, seconds = 4): Run => {
    sec.alert.reset();
    sec.playerArmed = () => armed;
    const g: Guard = sec.spawnPatrol({ route: [gp.clone()], post: true });
    g.yaw = yaw;
    g.rig.head.rotation.y = 0;
    player.pos.copy(pp);
    player.vel.set(0, 0, 0);
    const dt = 0.125;
    const out: Run = { detected: false, t: null, maxSuspicion: 0, maxVisible: 0 };
    for (let t = 0; t < seconds; t += dt) {
      ctx.time += dt;
      g.yaw = yaw;
      g.perceive(ctx, dt);
      out.maxSuspicion = Math.max(out.maxSuspicion, g.suspicion);
      out.maxVisible = Math.max(out.maxVisible, g.visibleSamples);
      if (g.suspicion >= 1) {
        out.detected = true;
        out.t = +(t + dt).toFixed(2);
        break;
      }
    }
    g.dispose(game.scene);
    sec.guards.length = 0;
    return out;
  };
  const face = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);
  const rows: { name: string; ok: boolean; got: unknown }[] = [];
  const add = (name: string, ok: boolean, got: unknown) => rows.push({ name, ok, got });

  // Lantern Street, guard at z 30 looking north (−z).
  const G = v(0, 0, 30);
  const N = Math.PI;
  {
    const r = run(G, N, v(0, 0, 36), true);
    add('player 6 m behind the guard (weapon drawn): not seen', !r.detected && r.maxSuspicion === 0, r);
  }
  {
    const p = v(Math.sin((55 * Math.PI) / 180) * 8, 0, 30 - Math.cos((55 * Math.PI) / 180) * 8);
    const r = run(G, N, p, true);
    add('8 m away, 55° off the facing (outside the 85° cone): not seen', !r.detected && r.maxSuspicion === 0, r);
  }
  {
    const r = run(G, N, v(0, 0, 20), true);
    add('10 m straight ahead, drawn: identified in 0.7–1.6 s', r.detected && r.t! >= 0.7 && r.t! <= 1.6, r);
  }
  {
    const r = run(G, N, v(0, 0, 20), false, 6);
    add('10 m straight ahead, holstered, no alert: beyond the 9 m recognition range', !r.detected && r.maxSuspicion === 0, r);
  }
  {
    const r = run(G, N, v(0, 0, 24), false, 6);
    const armed = run(G, N, v(0, 0, 24), true, 6);
    add('6 m ahead: holstered is identified later than drawn', r.detected && armed.detected && r.t! > armed.t! * 1.5, { holstered: r.t, drawn: armed.t });
  }
  {
    const r = run(G, N, v(0, 0, 30 - VISION.range - 2), true);
    add(`${VISION.range + 2} m ahead, drawn: beyond range, not seen`, !r.detected && r.maxSuspicion === 0, r);
  }
  {
    // Rotation: the same spot, guard turned away vs turned towards.
    const away = run(G, 0, v(0, 0, 22), true);
    const toward = run(G, N, v(0, 0, 22), true);
    add('guard turns: not seen while facing away, seen once facing', !away.detected && toward.detected, { away: away.maxSuspicion, toward: toward.t });
  }

  // Geometry scenarios found on the nav graph (real walls, decks, roofs, station).
  const nodes = ctx.nav.nodes.map((n) => v(n.x, n.y - 1, n.z));
  const band = (y: number) => (y < -2 ? 'under' : y < 3 ? 'street' : y < 7 ? 'deck' : 'roof');
  const clearAll = (gp: THREE.Vector3, pp: THREE.Vector3) => VISION.samples.every((h) => ctx.col.lineOfSight(v(gp.x, gp.y + 1.75, gp.z), v(pp.x, pp.y + h, pp.z)));
  const blockedAll = (gp: THREE.Vector3, pp: THREE.Vector3) => VISION.samples.every((h) => !ctx.col.lineOfSight(v(gp.x, gp.y + 1.75, gp.z), v(pp.x, pp.y + h, pp.z)));
  const pairs = (fa: (a: THREE.Vector3) => boolean, fb: (b: THREE.Vector3) => boolean, ok: (a: THREE.Vector3, b: THREE.Vector3) => boolean, max = 6) => {
    const out: [THREE.Vector3, THREE.Vector3][] = [];
    for (const a of nodes) {
      if (!fa(a)) continue;
      for (const b of nodes) if (fb(b) && ok(a, b)) {
        out.push([a, b]);
        break;
      }
      if (out.length >= max) break;
    }
    return out;
  };
  const hd = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

  // Walls / buildings: same level, in range and facing, but every body sample blocked.
  for (const [a, b] of pairs((a) => band(a.y) === 'street', (b) => band(b.y) === 'street', (a, b) => hd(a, b) > 5 && hd(a, b) < 12 && blockedAll(a, b))) {
    const r = run(a, face(a, b), b, true);
    add(`wall/building between (${a.x.toFixed(0)},${a.z.toFixed(0)}) → (${b.x.toFixed(0)},${b.z.toFixed(0)}): not seen`, !r.detected && r.maxVisible === 0, r);
  }
  // Roof right above a street guard.
  for (const [a, b] of pairs((a) => band(a.y) === 'street', (b) => band(b.y) === 'roof', (a, b) => hd(a, b) < 4, 4)) {
    const r = run(a, face(a, b), b, true);
    add(`roof above a street guard (${hd(a, b).toFixed(1)} m across, ${(b.y - a.y).toFixed(1)} m up): not seen`, !r.detected, r);
  }
  // Station directly under a street guard (not at a stairwell).
  for (const [a, b] of pairs(
    (a) => band(a.y) === 'street' && !ctx.col.inHole(a.x, a.z),
    (b) => band(b.y) === 'under' && !ctx.col.inHole(b.x, b.z),
    (a, b) => hd(a, b) < 9 && !ctx.col.inHole((a.x + b.x) / 2, (a.z + b.z) / 2),
    4,
  )) {
    const up = run(b, face(b, a), a, true);
    const down = run(a, face(a, b), b, true);
    add(`station under the street (${hd(a, b).toFixed(1)} m across): neither sees the other`, !up.detected && !down.detected && up.maxVisible === 0 && down.maxVisible === 0, { up, down });
  }
  // Walkway with a clear view of the plaza: a cross-level sighting must work.
  for (const [a, b] of pairs((a) => band(a.y) === 'street', (b) => band(b.y) === 'deck', (a, b) => hd(a, b) > 7 && hd(a, b) < 12 && clearAll(a, b), 3)) {
    const r = run(a, face(a, b), b, true);
    add(`walkway in clear view (${hd(a, b).toFixed(1)} m across, ${(b.y - a.y).toFixed(1)} m up): seen`, r.detected, r);
  }

  // Restore.
  sec.playerArmed = saved.armed;
  sec.alert.reset();
  player.pos.copy(saved.pos);
  player.yaw = saved.yaw;
  ctx.time = saved.time;
  return { ok: rows.every((r) => r.ok), passed: rows.filter((r) => r.ok).length, total: rows.length, rows };
}
