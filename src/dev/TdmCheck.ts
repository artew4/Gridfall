import * as THREE from 'three';
import type { Game } from '../core/Game';
import { TDM } from '../levels/Tdm';
import { ANY, RANGED_ONLY } from '../enemies/Roster';
import { ARENA } from '../enemies/arena/ArenaCtx';
import { ARMORY, type WeaponId } from '../entities/weapons/armory';
import type { TacticalEnemy } from '../enemies/Enemy';
import { probe } from './PerfProbe';

/*
  DEV only. Team Deathmatch checks on the real game loop (Desert Outpost):
   - tdmSoak: a match played by the bots alone (the player spectates in god mode): kills, ranges, how
     kills happen (flank, pinned, in cover…), stuck bots, friendly fire, scheduler pressure, AI cost.
   - tdmBench: frame cost with all nine bots fighting (spectating, or with the player shooting).
   - friendlyFire: rounds, the player's shots, blades and blasts between teammates do nothing.
  7.0:
   - every check takes `ai` ('arena', the default, or 'tactical' for the 6.0 squads);
   - tdmSim: a whole match stepped headless at a fixed 1/60 s (no rendering, the real loop frozen):
     match length, kill rate, how much the bots move, crouch and stand, the arena's jumps, vaults,
     pushes and sight-to-shot times, and the AI cost per step — independent of the window's frame rate;
   - tdmAB: tdmSim for both AIs, n runs each, side by side.
*/

type Dev = { start(m: string, s?: string): void; god(on?: boolean): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; lock(): void; look(x: number, y: number, z: number): void; shoot(): void };
const dev = () => (window as unknown as { __dev: Dev }).__dev;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 11.0: hit rate (%) and rounds per range band, aimed and hip. */
function byRange(st: { aimedRange: number[]; hipRange: number[]; aimedHitRange: number[]; hipHitRange: number[] }) {
  const bands: [string, number, number][] = [['0-12', 0, 12], ['12-25', 12, 25], ['25-40', 25, 40], ['40+', 40, Infinity]];
  const rate = (shots: number[], hits: number[], lo: number, hi: number) => {
    const n = shots.filter((r) => r >= lo && r < hi).length;
    const h = hits.filter((r) => r >= lo && r < hi).length;
    return { pct: n ? +((100 * h) / n).toFixed(1) : null, n };
  };
  return Object.fromEntries(bands.map(([k, lo, hi]) => [k, { aimed: rate(st.aimedRange, st.aimedHitRange, lo, hi), hip: rate(st.hipRange, st.hipHitRange, lo, hi) }]));
}
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

type Ai = 'arena' | 'tactical';

function startMatch(game: Game, spectate: boolean, tickets?: number, ai: Ai = 'arena') {
  const before = TDM.tickets, beforeAi = TDM.ai;
  if (tickets) TDM.tickets = tickets;
  TDM.ai = ai;
  game.tdm.spectate = spectate;
  // The loaded level if it has an arena (8.0: the docks), else the desert.
  dev().start('tdm', game.level.data.tdm ? game.setting : 'desert');
  dev().god(true);
  TDM.tickets = before;
  TDM.ai = beforeAi;
  const st = game.level.data.tdm!.start;
  dev().tp(st.x, st.y, st.z + 4, 0, 0);
}

export async function tdmSoak(game: Game, opts: { seconds?: number; timeScale?: number; tickets?: number; ai?: Ai } = {}) {
  const seconds = opts.seconds ?? 120;
  startMatch(game, true, opts.tickets ?? 999, opts.ai);
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
    if (firstContact === null && engaged(game)) firstContact = +(now - t0).toFixed(1);
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
export async function tdmBench(game: Game, opts: { seconds?: number; settle?: number; withPlayer?: boolean; ai?: Ai; spotting?: boolean } = {}) {
  // 12.0 A/B: `spotting: false` runs the match without the human's spotting and the minimap.
  const spot0 = TDM.spotting;
  if (opts.spotting !== undefined) TDM.spotting = opts.spotting;
  startMatch(game, !opts.withPlayer, 999, opts.ai);
  const tdm = game.tdm;
  const met = meter(game);
  let shooter = 0;
  if (opts.withPlayer) {
    // The centre lane's mouth (the desert's 6.0/7.0 spot; elsewhere the centre lane's second waypoint).
    const c = game.setting === 'desert' ? { x: -3, z: 40 } : game.level.data.tdm!.lanes.alpha[1][1];
    dev().tp(c.x, 0, c.z, 0, 0);
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
  tdm.mapMs = tdm.mapFrames = 0;
  const sense0 = tdm.sensing ? { ...tdm.sensing.stats } : null;
  const alive0 = tdm.bots.filter((b) => b.alive).length;
  const engaged0 = tdm.directors ? [tdm.directors.alpha.stance, tdm.directors.omega.stance] : [tdm.squads.alpha.mode, tdm.squads.omega.mode];
  const r = (await probe(game, opts.seconds ?? 8)) as unknown as Record<string, number>;
  clearInterval(shooter);
  met.stop();
  TDM.spotting = spot0;
  const s = tdm.sched.stats;
  const sense1 = tdm.sensing?.stats;
  return {
    ai: tdm.ai,
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
    sensing: tdm.sensing ? { ...tdm.sensing.stats } : null,
    // 12.0: the spotting pass over the measured window (rays and cache hits per frame) and the minimap's draw.
    spotting: TDM.spotting && opts.spotting !== false,
    sensingWindow: sense0 && sense1 ? { checksPerFrame: +((sense1.checks - sense0.checks) / Math.max(1, sense1.frames - sense0.frames)).toFixed(2), raysPerFrame: +((sense1.rays - sense0.rays) / Math.max(1, sense1.frames - sense0.frames)).toFixed(2), cacheHitsPerFrame: +((sense1.cacheHits - sense0.cacheHits) / Math.max(1, sense1.frames - sense0.frames)).toFixed(2) } : null,
    minimapMs: +(tdm.mapMs / Math.max(1, tdm.mapFrames)).toFixed(3),
    focused: document.hasFocus() && !document.hidden,
  };
}

/** Someone is fighting: a squad engaged (6.0), or a fresh sighting on an arena board (7.0). */
function engaged(game: Game) {
  const tdm = game.tdm;
  if (tdm.directors) return [tdm.directors.alpha, tdm.directors.omega].some((d) => [...d.contacts.values()].some((c) => game.elapsed - c.seenT < 0.5));
  return tdm.squads.alpha.mode === 'engage' || tdm.squads.omega.mode === 'engage';
}

/**
 * A whole match, headless: the real loop is frozen (time scale 0, so it only redraws), and the match
 * is stepped here at a fixed `dt` — the rules (all AI), the rounds in flight, the effects — as fast as
 * the CPU allows, yielding to the browser every `chunk` steps. Bot-vs-bot (the player spectates in
 * god mode). Stops at the end of the match or after `maxSeconds` of sim time.
 */
export async function tdmSim(
  game: Game,
  opts: { ai?: Ai; tickets?: number; maxSeconds?: number; dt?: number; chunk?: number; roster?: 'ranged' | 'any'; laneLeave?: number; ads?: boolean; v12?: boolean; arms?: 'random' | WeaponId; vantage?: boolean } = {},
) {
  const ai = opts.ai ?? 'arena';
  const dt = opts.dt ?? 1 / 60;
  const maxSeconds = opts.maxSeconds ?? 1200;
  // 8.0 A/B switches (restored at the end): the roster request, lane discipline (Infinity: off).
  const roster0 = TDM.roster, lane0 = ARENA.laneLeave;
  if (opts.roster) TDM.roster = opts.roster === 'any' ? ANY : RANGED_ONLY;
  if (opts.laneLeave !== undefined) ARENA.laneLeave = opts.laneLeave;
  // 14.0 A/B: `vantage: false` keeps flank spots on the contact's level (12.0–13.0).
  const vantage0 = ARENA.vantage.on;
  if (opts.vantage !== undefined) ARENA.vantage.on = opts.vantage;
  // 13.0: who carries what ('random': the armory deal; one weapon id: everybody, for A/B).
  const arms0 = TDM.arms;
  if (opts.arms) TDM.arms = opts.arms;
  // 11.0 A/B: `ads: false` is the 10.0 shooter (never aims, no extra hip spread). 13.0: on the rifle
  // (the 10.0 bot's only gun), everybody carrying it.
  const rifle = ARMORY.ar.bot, rifle0 = { aim: rifle.aim, hip: rifle.hipSpread, max: rifle.maxRange };
  if (opts.ads === false) {
    TDM.arms = 'ar';
    rifle.aim = null;
    rifle.maxRange = Infinity;
    rifle.hipSpread = 0;
  }
  // 12.0 A/B: `v12: false` is the 11.0 bot (reacts on the frame, ±15% decide jitter, never flanks,
  // retreats or slides). Bots draw their temperament when they spawn, so this is set before.
  const P = ARENA.persona, keep12 = { react: P.react, clamp: P.reactClamp, jitter: P.jitter, per: ARENA.flank.per, retreat: ARENA.retreat.on, slide: ARENA.slide.on };
  if (opts.v12 === false) {
    P.react = [0, 0];
    P.reactClamp = [0, 0];
    P.jitter = 0.15;
    ARENA.flank.per = 0;
    ARENA.retreat.on = false;
    ARENA.slide.on = false;
  }
  startMatch(game, true, opts.tickets ?? 25, ai);
  const tdm = game.tdm;
  const g = game as unknown as { time: { value: number } };
  const met = meter(game);
  game.timeScale = 0;
  const t0 = game.elapsed;
  let steps = 0, firstContact: number | null = null;
  // Per bot-step samples: moving (> 1.5 m/s), crouched (> 0.5), standing still (< 0.5 m/s).
  const smp = { n: 0, moving: 0, crouched: 0, still: 0, speed: 0, elevated: 0, mid: 0, top: 0 };
  // 14.0: drop-downs (a bot falling fast: walked off a roof or a landing; stairs never build fall speed).
  const falling = new Set<number>();
  let drops = 0;
  const dropFrom: Record<string, number> = {};
  // 8.0: where the fight happens — bot time per zone (sampled), height above the floor.
  const zoneT: Record<string, number> = {};
  // 9.0: how often a bot came into each zone (a passage like a culvert is crossed in a second: time
  // share undersells it).
  const zoneIn: Record<string, number> = {};
  const lastZone = new Map<number, string>();
  const zoneOf = (x: number, y: number, z: number) => game.level.data.zoneAt(x, y, z)?.name ?? '-';
  const track = new Map<TacticalEnemy, { x: number; z: number; t: number }>();
  const stuck: string[] = [];
  const wall0 = performance.now();
  while (!tdm.winner && game.elapsed - t0 < maxSeconds) {
    for (let i = 0; i < (opts.chunk ?? 240) && !tdm.winner; i++) {
      game.elapsed += dt;
      g.time.value = game.elapsed;
      game.ctx.time = game.elapsed;
      tdm.update(dt);
      game.projectiles.update(dt, game.player);
      game.fx.update(dt);
      steps++;
      const now = game.elapsed;
      if (firstContact === null && engaged(game)) firstContact = +(now - t0).toFixed(1);
      for (const b of tdm.bots) {
        if (!b.alive) continue;
        const sp = Math.hypot(b.vel.x, b.vel.z);
        smp.n++;
        smp.speed += sp;
        if (sp > 1.5) smp.moving++;
        if (sp < 0.5) smp.still++;
        if (b.crouch > 0.5) smp.crouched++;
        if (b.pos.y > 1) smp.elevated++;
        // 14.0: which floor: the street, the mid level (2.5–6 m: landings, footbridge, low roofs) or the top.
        if (b.pos.y > 6) smp.top++;
        else if (b.pos.y > 2.5) smp.mid++;
        const fv = (b as unknown as { fallV: number }).fallV;
        if (fv < -5 && !falling.has(b.uid)) {
          falling.add(b.uid);
          drops++;
          const zn = zoneOf(b.pos.x, b.pos.y + 1.5, b.pos.z);
          dropFrom[zn] = (dropFrom[zn] ?? 0) + 1;
        } else if (fv > -1) falling.delete(b.uid);
        if (steps % 15 === 0) {
          const zn = zoneOf(b.pos.x, b.pos.y, b.pos.z);
          zoneT[zn] = (zoneT[zn] ?? 0) + 1;
          if (lastZone.get(b.uid) !== zn) {
            if (lastZone.has(b.uid)) zoneIn[zn] = (zoneIn[zn] ?? 0) + 1;
            lastZone.set(b.uid, zn);
          }
        }
        if (steps % 60 === 0) {
          const r = track.get(b);
          if (!r || Math.hypot(b.pos.x - r.x, b.pos.z - r.z) > 1.5) track.set(b, { x: b.pos.x, z: b.pos.z, t: now });
          else if (now - r.t > 15) {
            stuck.push(`${b.name} ${b.tac.action}/${b.tac.phase} @${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)} t${(now - t0).toFixed(0)}`);
            r.t = now;
          }
        }
      }
    }
    await wait(0);
  }
  met.stop();
  game.timeScale = 1;
  TDM.roster = roster0;
  ARENA.laneLeave = lane0;
  TDM.arms = arms0;
  ARENA.vantage.on = vantage0;
  Object.assign(rifle, { aim: rifle0.aim, hipSpread: rifle0.hip, maxRange: rifle0.max });
  Object.assign(P, { react: keep12.react, reactClamp: keep12.clamp, jitter: keep12.jitter });
  ARENA.flank.per = keep12.per;
  ARENA.retreat.on = keep12.retreat;
  ARENA.slide.on = keep12.slide;
  const simT = game.elapsed - t0;
  const k = tdm.kills;
  const st = tdm.arenaStats;
  const pct = (x: number) => +((100 * x) / Math.max(1, smp.n)).toFixed(1);
  const res = {
    ai,
    simSeconds: +simT.toFixed(1),
    wallSeconds: +((performance.now() - wall0) / 1000).toFixed(1),
    ended: tdm.winner,
    tickets: { ...tdm.tickets },
    firstContact,
    kills: k.length,
    killsPerMin: +((k.length / simT) * 60).toFixed(1),
    byKillerKind: k.reduce<Record<string, number>>((a, x) => ((a[x.killerKind] = (a[x.killerKind] ?? 0) + 1), a), {}),
    victimDoing: k.reduce<Record<string, number>>((a, x) => ((a[x.victimAction.split('/')[0]] = (a[x.victimAction.split('/')[0]] ?? 0) + 1), a), {}),
    // 13.0: each gun's kills and the range they were made at (does each fight where it should?).
    byWeapon: (() => {
      const out: Record<string, { kills: number; median: number; p10: number; p90: number }> = {};
      for (const w of new Set(k.map((x) => x.weapon))) {
        const d = k.filter((x) => x.weapon === w).map((x) => x.dist);
        out[w] = { kills: d.length, median: +q(d, 0.5).toFixed(1), p10: +q(d, 0.1).toFixed(1), p90: +q(d, 0.9).toFixed(1) };
      }
      return out;
    })(),
    flankKills: k.filter((x) => x.flank).length,
    range: { median: q(k.map((x) => x.dist), 0.5), p10: q(k.map((x) => x.dist), 0.1), p90: q(k.map((x) => x.dist), 0.9), melee: k.filter((x) => x.dist < 3).length },
    movement: { movingPct: pct(smp.moving), crouchedPct: pct(smp.crouched), stillPct: pct(smp.still), elevatedPct: pct(smp.elevated), avgSpeed: +(smp.speed / Math.max(1, smp.n)).toFixed(2) },
    // 14.0: vertical flow: bot time per floor, drop-downs taken (and where from), kills by the killer's floor.
    vertical: {
      streetPct: pct(smp.n - smp.mid - smp.top),
      midPct: pct(smp.mid),
      topPct: pct(smp.top),
      drops,
      dropsPerMin: +((drops / simT) * 60).toFixed(1),
      dropFrom,
      killsFrom: k.reduce<Record<string, number>>((a, x) => ((a[x.killerY === undefined ? '?' : x.killerY > 6 ? 'top' : x.killerY > 2.5 ? 'mid' : 'street'] = (a[x.killerY === undefined ? '?' : x.killerY > 6 ? 'top' : x.killerY > 2.5 ? 'mid' : 'street'] ?? 0) + 1), a), {}),
    },
    zoneTimePct: (() => {
      const tot = Object.values(zoneT).reduce((a, b) => a + b, 0) || 1;
      return Object.fromEntries(Object.entries(zoneT).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, +((100 * n) / tot).toFixed(1)]));
    })(),
    zoneEntries: Object.fromEntries(Object.entries(zoneIn).sort((a, b) => b[1] - a[1])),
    killsByZone: k.reduce<Record<string, number>>((a, x) => ((a[x.zone ?? '-'] = (a[x.zone ?? '-'] ?? 0) + 1), a), {}),
    arena:
      tdm.ai === 'arena'
        ? {
            jumps: st.jumps,
            vaults: st.vaults,
            pushes: st.pushes,
            pushKills: st.pushKills,
            breaks: st.breaks,
            breakPct: +((100 * st.breakT) / Math.max(1e-6, st.aliveT)).toFixed(1),
            switchesPerMin: +((st.switches / simT) * 60).toFixed(1),
            switchWhy: st.switchWhy,
            shots: st.shots,
            sightToShotMs: { median: +(q(st.reactions, 0.5) * 1000).toFixed(0), p90: +(q(st.reactions, 0.9) * 1000).toFixed(0), n: st.reactions.length },
            // 11.0: hip vs aimed (by range). Each round carries its mode and firing range; hit rates per range band.
            aim: {
              aimedShots: st.aimedShots,
              hipShots: st.hipShots,
              aimedSharePct: +((100 * st.aimedShots) / Math.max(1, st.aimedShots + st.hipShots)).toFixed(1),
              aimedHitPct: +((100 * st.aimedHitRange.length) / Math.max(1, st.aimedShots)).toFixed(1),
              hipHitPct: +((100 * st.hipHitRange.length) / Math.max(1, st.hipShots)).toFixed(1),
              aimedRange: { median: +q(st.aimedRange, 0.5).toFixed(1), p90: +q(st.aimedRange, 0.9).toFixed(1) },
              hipRange: { median: +q(st.hipRange, 0.5).toFixed(1), p90: +q(st.hipRange, 0.9).toFixed(1) },
              hitPctByRange: byRange(st),
              aimingPctOfAlive: +((100 * st.aimT) / Math.max(1e-6, st.aliveT)).toFixed(1),
            },
            perBot: st.perBot,
            // 12.0: flanks off the shared spotting, retreats, slides.
            flank: { started: st.flanks, high: st.flankHigh, arrived: st.flankArrive, engagedFromFlank: st.flankEngage, kills: st.flankKills },
            retreat: { n: st.retreats, why: st.retreatWhy, lived: st.retreatLived, diedRetreating: st.retreatDeaths },
            slides: { n: st.slides, why: st.slideWhy, perMin: +((st.slides / simT) * 60).toFixed(1) },
          }
        : null,
    stuck,
    friendly: { damage: tdm.friendlyDamage, roundsPassedThroughTeammates: game.projectiles.passedFriends },
    sched: { ...tdm.sched.stats, maxLate: +tdm.sched.stats.maxLate.toFixed(3) },
    sensing: tdm.sensing ? { ...tdm.sensing.stats } : null,
    ai_ms: { avg: +(met.m.ms.reduce((a, b) => a + b, 0) / Math.max(1, met.m.frames)).toFixed(3), p95: q(met.m.ms, 0.95), p99: q(met.m.ms, 0.99), worst: q(met.m.ms, 1), raysPerStep: +(met.m.rays / Math.max(1, met.m.frames)).toFixed(1) },
  };
  (window as unknown as { __tdm: unknown }).__tdm = res;
  return res;
}

/** tdmSim for both AIs, `runs` each (alternating), and the medians side by side. */
export async function tdmAB(game: Game, opts: { runs?: number; tickets?: number } = {}) {
  const runs = opts.runs ?? 3;
  const out: Record<Ai, Awaited<ReturnType<typeof tdmSim>>[]> = { arena: [], tactical: [] };
  for (let i = 0; i < runs; i++) {
    for (const ai of ['tactical', 'arena'] as const) out[ai].push(await tdmSim(game, { ai, tickets: opts.tickets }));
  }
  const med = (a: number[]) => q(a, 0.5);
  const sum = (ai: Ai) => {
    const r = out[ai];
    return {
      matchSeconds: med(r.map((x) => x.simSeconds)),
      killsPerMin: med(r.map((x) => x.killsPerMin)),
      movingPct: med(r.map((x) => x.movement.movingPct)),
      crouchedPct: med(r.map((x) => x.movement.crouchedPct)),
      stillPct: med(r.map((x) => x.movement.stillPct)),
      avgSpeed: med(r.map((x) => x.movement.avgSpeed)),
      firstContact: med(r.map((x) => x.firstContact ?? 0)),
      aiMsAvg: med(r.map((x) => x.ai_ms.avg)),
      aiMsP99: med(r.map((x) => x.ai_ms.p99)),
      raysPerStep: med(r.map((x) => x.ai_ms.raysPerStep)),
      stuck: r.reduce((a, x) => a + x.stuck.length, 0),
      friendlyDamage: r.reduce((a, x) => a + x.friendly.damage, 0),
      ended: r.map((x) => x.ended),
    };
  };
  const res = { tactical: sum('tactical'), arena: sum('arena'), runs: out };
  (window as unknown as { __ab: unknown }).__ab = res;
  return res;
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
