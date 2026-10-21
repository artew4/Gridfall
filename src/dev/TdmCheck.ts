import * as THREE from 'three';
import type { Game } from '../core/Game';
import { TDM } from '../levels/Tdm';
import type { TacticalEnemy } from '../enemies/Enemy';
import { probe } from './PerfProbe';

/*
  DEV only. Team Deathmatch checks on the real game loop (Desert Outpost):
   - tdmSoak: a match played by the bots alone (the player spectates in god mode): kills, ranges, how
     kills happen (flank, pinned, in cover…), stuck bots, friendly fire, scheduler pressure, AI cost.
   - tdmBench: frame cost with all nine bots fighting (spectating, or with the player shooting).
   - friendlyFire: rounds, the player's shots, blades and blasts between teammates do nothing.
*/

type Dev = { start(m: string, s?: string): void; god(on?: boolean): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; lock(): void; look(x: number, y: number, z: number): void; shoot(): void };
const dev = () => (window as unknown as { __dev: Dev }).__dev;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (a: number[], k: number) => (a.length ? +a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(k * a.length))].toFixed(2) : 0);

/** Wraps the TDM frame: wall time per frame and collision rays cast inside it. */
function meter(game: Game) {
  const t = game.tdm as unknown as { update(dt: number): void };
  const orig = t.update;
  const col = game.col as unknown as Record<string, (...a: unknown[]) => unknown>;
  const names = ['raycast', 'lineOfSight'] as const;
  const origCol = names.map((n) => col[n]);
  let inside = false;
  const m = { ms: [] as number[], rays: 0, frames: 0 };
  names.forEach((n, i) => {
    col[n] = function (...a: unknown[]) {
      if (inside) m.rays++;
      return origCol[i].apply(game.col, a);
    };
  });
  t.update = function (dt: number) {
    const s = performance.now();
    inside = true;
    orig.call(game.tdm, dt);
    inside = false;
    if (dt > 0) {
      m.ms.push(performance.now() - s);
      m.frames++;
    }
  };
  return {
    m,
    reset() {
      m.ms.length = 0;
      m.rays = m.frames = 0;
    },
    stop() {
      delete (t as { update?: unknown }).update;
      names.forEach((n) => delete (col as Record<string, unknown>)[n]);
    },
  };
}

function startMatch(game: Game, spectate: boolean, tickets?: number) {
  const before = TDM.tickets;
  if (tickets) TDM.tickets = tickets;
  game.tdm.spectate = spectate;
  dev().start('tdm', 'desert');
  dev().god(true);
  TDM.tickets = before;
  const st = game.level.data.tdm!.start;
  dev().tp(st.x, st.y, st.z + 4, 0, 0);
}

export async function tdmSoak(game: Game, opts: { seconds?: number; timeScale?: number; tickets?: number } = {}) {
  const seconds = opts.seconds ?? 120;
  startMatch(game, true, opts.tickets ?? 999);
  const tdm = game.tdm;
  game.timeScale = opts.timeScale ?? 1;
  const met = meter(game);
  const t0 = game.elapsed;
  // Stuck watch: a live bot that moved < 1.5 m over 15 s of sim time while meant to be moving.
  const track = new Map<TacticalEnemy, { x: number; z: number; t: number }>();
  const stuck: string[] = [];
  const moving = new Set(['idle', 'hunt', 'search', 'takeCover', 'advance', 'stage', 'rush']);
  const held = new Map<number, number>();
  let firstContact: number | null = null;
  const barks: Record<string, number> = {};
  for (const sq of [tdm.squads.alpha, tdm.squads.omega]) {
    const prev = sq.barks.onBark;
    sq.barks.onBark = (e) => {
      barks[e.kind] = (barks[e.kind] ?? 0) + 1;
      prev(e);
    };
  }
  const tickets: [number, number, number][] = [];
  let tick = 0;
  while (game.elapsed - t0 < seconds * game.timeScale && !tdm.winner) {
    await wait(1000);
    if (game.state === 'paused') dev().lock();
    const now = game.elapsed;
    if (firstContact === null && (tdm.squads.alpha.mode === 'engage' || tdm.squads.omega.mode === 'engage')) firstContact = +(now - t0).toFixed(1);
    for (const b of tdm.bots) {
      if (!b.alive) continue;
      if ('heldFire' in b) held.set(b.uid, (b as unknown as { heldFire: number }).heldFire);
      const r = track.get(b);
      if (!r || Math.hypot(b.pos.x - r.x, b.pos.z - r.z) > 1.5) track.set(b, { x: b.pos.x, z: b.pos.z, t: now });
      else if (now - r.t > 15 && moving.has(b.tac.action)) {
        stuck.push(`${b.name} ${b.tac.action}/${b.tac.phase} @${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)} t${(now - t0).toFixed(0)}`);
        r.t = now;
      }
    }
    if (tick++ % 10 === 0) tickets.push([+(now - t0).toFixed(0), tdm.tickets.alpha, tdm.tickets.omega]);
  }
  met.stop();
  game.timeScale = 1;
  const k = tdm.kills;
  const by = (f: (x: (typeof k)[number]) => string) => k.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});
  const simT = game.elapsed - t0;
  const res = {
    simSeconds: +simT.toFixed(0),
    ended: tdm.winner,
    tickets: { ...tdm.tickets },
    timeline: tickets,
    firstContact,
    kills: k.length,
    killsPerMin: +((k.length / simT) * 60).toFixed(1),
    byTeam: by((x) => x.killerTeam ?? 'world'),
    byKillerKind: by((x) => x.killerKind),
    byKillerRole: by((x) => x.killerRole),
    victimDoing: by((x) => x.victimAction.split('/')[0] + (x.victimAction.includes('/aim') || x.victimAction.includes('/fire') ? ':shooting' : x.victimAction.includes('/hide') || x.victimAction.includes('/back') ? ':hidden' : x.victimAction.includes('/peek') ? ':peeking' : '')),
    flankKills: k.filter((x) => x.flank).length,
    range: { median: q(k.map((x) => x.dist), 0.5), p10: q(k.map((x) => x.dist), 0.1), p90: q(k.map((x) => x.dist), 0.9), melee: k.filter((x) => x.dist < 3).length },
    barks,
    stuck,
    friendly: { damage: tdm.friendlyDamage, roundsPassedThroughTeammates: game.projectiles.passedFriends, burstsHeldForTeammates: [...held.values()].reduce((a, b) => a + b, 0) },
    sched: { ...tdm.sched.stats, maxLate: +tdm.sched.stats.maxLate.toFixed(3) },
    ai: { msAvg: +(met.m.ms.reduce((a, b) => a + b, 0) / Math.max(1, met.m.frames)).toFixed(3), msP95: q(met.m.ms, 0.95), msP99: q(met.m.ms, 0.99), msWorst: q(met.m.ms, 1), raysPerFrame: +(met.m.rays / Math.max(1, met.m.frames)).toFixed(1) },
    log: k.slice(0, 40),
  };
  (window as unknown as { __tdm: unknown }).__tdm = res;
  return res;
}

/**
 * Frame cost with all nine bots fighting at 1x: AI wall time per frame (P95/P99/worst), rays per
 * frame, and the frame probe (FPS, CPU, GPU). `withPlayer`: he stands at the centre lane's mouth and
 * shoots the nearest OMEGA bot every 0.6 s (more targets, suppression, hits); otherwise he spectates.
 */
export async function tdmBench(game: Game, opts: { seconds?: number; settle?: number; withPlayer?: boolean } = {}) {
  startMatch(game, !opts.withPlayer, 999);
  const tdm = game.tdm;
  const met = meter(game);
  let shooter = 0;
  if (opts.withPlayer) {
    dev().tp(-3, 0, 40, 0, 0);
    shooter = window.setInterval(() => {
      const p = game.player;
      let best: THREE.Vector3 | null = null, bd = 45;
      for (const b of tdm.bots) if (b.alive && b.team === 'omega' && b.pos.distanceTo(p.pos) < bd) {
        bd = b.pos.distanceTo(p.pos);
        best = b.pos;
      }
      if (!best) return;
      dev().look(best.x, best.y + 1.2, best.z);
      dev().shoot();
    }, 600);
  }
  await wait((opts.settle ?? 30) * 1000);
  if (game.state === 'paused') dev().lock();
  met.reset();
  tdm.sched.resetStats();
  const alive0 = tdm.bots.filter((b) => b.alive).length;
  const engaged0 = [tdm.squads.alpha.mode, tdm.squads.omega.mode];
  const r = (await probe(game, opts.seconds ?? 8)) as unknown as Record<string, number>;
  clearInterval(shooter);
  met.stop();
  const s = tdm.sched.stats;
  return {
    withPlayer: !!opts.withPlayer,
    fps: r.fps,
    cpuMs: r.cpuMsPerFrame,
    gpuMs: r.gpuMsPerFrame,
    frameP99: r.frameMsP99,
    aiMsAvg: +(met.m.ms.reduce((a, b) => a + b, 0) / Math.max(1, met.m.frames)).toFixed(3),
    aiMsP95: q(met.m.ms, 0.95),
    aiMsP99: q(met.m.ms, 0.99),
    aiMsWorst: q(met.m.ms, 1),
    raysPerFrame: +(met.m.rays / Math.max(1, met.m.frames)).toFixed(1),
    decidesPerFrame: +(s.thinks / Math.max(1, s.frames)).toFixed(2),
    maxDecidesInAFrame: s.maxThinks,
    maxRaysInAFrame: s.maxRays,
    coverSearchesDeferred: s.deferred,
    rePlansDeferred: s.deferredRoutes,
    maxDecideLateS: +s.maxLate.toFixed(3),
    alive: [alive0, tdm.bots.filter((b) => b.alive).length],
    modes: engaged0,
    drawCalls: r.drawCalls,
    focused: document.hasFocus() && !document.hidden,
  };
}

/**
 * Friendly fire, on real bots in the yard (frozen in place): a round fired through a teammate at a
 * hostile, for each team; the player's shot through an ally; a blade from a teammate; a teammate in
 * a gunner's line of fire; ALPHA's rounds at the player and OMEGA's.
 */
export async function friendlyFire(game: Game) {
  startMatch(game, false);
  dev().god(false);
  await wait(400);
  const tdm = game.tdm;
  const al = tdm.bots.filter((b) => b.team === 'alpha' && b.kind === 'gunner');
  const om = tdm.bots.filter((b) => b.team === 'omega' && b.kind === 'gunner');
  const [A, B] = al, [O, P] = om;
  // Freeze everyone where we put them (the update still records each bot's own-team context).
  const frozen = tdm.bots.map((b) => [b, b.update] as const);
  for (const b of tdm.bots) {
    const ctx = tdm.ctxs[b.team];
    b.update = () => void ((b as unknown as { lastCtx: unknown }).lastCtx = ctx);
    b.invulnUntil = -Infinity;
  }
  const place = (b: TacticalEnemy, x: number, z: number) => {
    b.pos.set(x, 0, z);
    b.vel.set(0, 0, 0);
    b.crouch = 0;
  };
  // Line along x at z = 4 in the yard: A (alpha) → B (alpha) → O (omega); P (omega) further on.
  place(A, -12, 4);
  place(B, -8, 4);
  place(O, -2, 4);
  place(P, 4, 4);
  dev().tp(-16, 0, 4, 0, 0);
  game.player.health = game.player.maxHealth;
  const hp = () => ({ A: A.hp, B: B.hp, O: O.hp, P: P.hp, you: +game.player.health.toFixed(0) });
  const shot = async (from: TacticalEnemy, to: THREE.Vector3) => {
    const o = from.chest.clone();
    game.projectiles.fire(o, to.clone().sub(o).normalize(), 40, from);
    await wait(700);
  };
  const out: Record<string, unknown> = {};
  const passed0 = game.projectiles.passedFriends;
  let h0 = hp();
  await shot(A, O.chest.clone());
  let h1 = hp();
  out.alphaRoundThroughTeammate = { teammateUntouched: h1.B === h0.B, hostileHit: h1.O < h0.O, passed: game.projectiles.passedFriends - passed0 };
  // OMEGA: P fires at A through O (its teammate) and B.
  h0 = hp();
  await shot(P, A.chest.clone());
  h1 = hp();
  out.omegaRoundThroughTeammate = { teammateUntouched: h1.O === h0.O, hostileHit: h1.B < h0.B };
  // The player shoots along the line: through his allies A? He stands behind A: rounds pass A and B, hit O.
  h0 = hp();
  dev().look(O.pos.x, O.pos.y + 1.3, O.pos.z);
  for (let i = 0; i < 3; i++) {
    dev().shoot();
    await wait(120);
  }
  h1 = hp();
  out.playerShotThroughAllies = { alliesUntouched: h1.A === h0.A && h1.B === h0.B, hostileHit: h1.O < h0.O };
  // A blade (or any hurt) from a teammate does nothing; from a hostile it lands.
  h0 = hp();
  const tm = B.hurt(40, A.pos, A);
  const hs = B.hurt(5, O.pos, O);
  h1 = hp();
  out.teammateBlade = { fromTeammateKilled: tm, fromTeammateNoDamage: h1.B === h0.B - 5, fromHostileLanded: h1.B < h0.B && !hs };
  // A gunner's check-fire: B stands between A's muzzle and O.
  const fil = (A as unknown as { friendInLine(c: unknown, a: THREE.Vector3, b: THREE.Vector3): boolean }).friendInLine.bind(A);
  out.checkFire = { teammateInLine: fil(tdm.ctxs.alpha, A.chest.clone(), O.chest.clone()), clearLine: fil(tdm.ctxs.alpha, P.chest.clone().setZ(9), O.chest.clone().setZ(9)) };
  // Rounds at the player: ALPHA's pass, OMEGA's hit.
  h0 = hp();
  const pc = game.player.pos.clone().setY(game.player.pos.y + 1.2);
  await shot(B, pc);
  h1 = hp();
  const allyRound = h1.you === h0.you;
  game.playerInvulnUntil = -Infinity;
  place(O, -2, 8);
  await shot(O, game.player.pos.clone().setY(game.player.pos.y + 1.2));
  const h2 = hp();
  out.roundsAtPlayer = { allyRoundNoDamage: allyRound, hostileRoundHurts: h2.you < h1.you };
  out.friendlyDamageCounter = tdm.friendlyDamage;
  for (const [b, u] of frozen) b.update = u;
  dev().god(true);
  const ok = Object.values(out).every((v) => typeof v !== 'object' || Object.entries(v as Record<string, unknown>).every(([k, x]) => (k === 'passed' ? (x as number) >= 1 : k === 'clearLine' || k === 'fromTeammateKilled' ? x === false : x === true || typeof x === 'number')));
  return { ok: ok && tdm.friendlyDamage === 0, ...out };
}
