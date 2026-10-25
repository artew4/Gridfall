import * as THREE from 'three';
import type { Game } from '../core/Game';
import { TDM } from '../levels/Tdm';
import { ANY, RANGED_ONLY } from '../enemies/Roster';
import { ARENA, applyProfile, type ArenaProfile } from '../enemies/arena/ArenaCtx';
import { STAMINA } from '../combat/Stamina';
import { ARMORY, type WeaponId } from '../entities/weapons/armory';
import type { TacticalEnemy } from '../enemies/Enemy';
import { probe } from './PerfProbe';
import { isArenaBot } from '../enemies/arena/ArenaBots';
import { clumps } from '../enemies/arena/Density';
import { SPAWN } from '../levels/SpawnManager';

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

function startMatch(game: Game, spectate: boolean, tickets?: number, ai: Ai = 'arena', size?: number, profile = true) {
  const before = { ...TDM.force }, beforeAi = TDM.ai, beforeSide = TDM.side;
  // 48.0: the checks were written with him on ALPHA (his side is random in play).
  TDM.side = 'alpha';
  if (tickets) TDM.force.tickets = tickets;
  // 19.0: a team size for this match (self-play density tests), the map's AI profile on or off.
  if (size) TDM.force.size = size;
  TDM.force.noProfile = !profile;
  TDM.ai = ai;
  game.tdm.spectate = spectate;
  // The loaded level if it has an arena (8.0: the docks), else the desert.
  dev().start('tdm', game.level.data.tdm ? game.setting : 'desert');
  dev().god(true);
  Object.assign(TDM.force, before);
  TDM.ai = beforeAi;
  TDM.side = beforeSide;
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
  const moving = new Set(['idle', 'hunt', 'search', 'takeCover', 'advance', 'patrol', 'stage', 'rush']);
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
export async function tdmBench(game: Game, opts: { seconds?: number; settle?: number; withPlayer?: boolean; ai?: Ai; spotting?: boolean; size?: number } = {}) {
  // 12.0 A/B: `spotting: false` runs the match without the human's spotting and the minimap.
  const spot0 = TDM.spotting;
  if (opts.spotting !== undefined) TDM.spotting = opts.spotting;
  startMatch(game, !opts.withPlayer, 999, opts.ai, opts.size);
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
  opts: { ai?: Ai; tickets?: number; maxSeconds?: number; dt?: number; chunk?: number; roster?: 'ranged' | 'any'; laneLeave?: number; ads?: boolean; v12?: boolean; arms?: 'random' | WeaponId; vantage?: boolean; pressure?: boolean; size?: number; profile?: boolean; forward?: boolean; directRise?: number; fog?: boolean; spawns?: 'zones' | 'dynamic' | 'bases'; cell?: number; sight?: number; lastStand?: boolean; stamina?: boolean; space?: boolean; corridor?: boolean; flankThreat?: boolean; scan?: boolean; flankPull?: boolean; watches?: number; tune?: ArenaProfile; spawnTune?: Partial<typeof SPAWN>; fronts?: boolean; instinct?: boolean } = {},
) {
  const ai = opts.ai ?? 'arena';
  // 23.0 A/B: `directRise: Infinity` is the 22.0 bot (steers straight at any goal in sight, however high).
  const rise0 = ARENA.directRise;
  if (opts.directRise !== undefined) ARENA.directRise = opts.directRise;
  const dt = opts.dt ?? 1 / 60;
  const maxSeconds = opts.maxSeconds ?? 1200;
  // 8.0 A/B switches (restored at the end): the roster request, lane discipline (Infinity: off).
  const roster0 = TDM.roster, lane0 = ARENA.laneLeave;
  if (opts.roster) TDM.roster = opts.roster === 'any' ? ANY : RANGED_ONLY;
  if (opts.laneLeave !== undefined) ARENA.laneLeave = opts.laneLeave;
  // 15.0 A/B: `pressure: false` assigns lanes by count alone (14.0).
  const pressure0 = ARENA.lanePressure.on;
  if (opts.pressure !== undefined) ARENA.lanePressure.on = opts.pressure;
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
  // 19.0: `size` (players a team; the match is bot-vs-bot, so all bots), `profile: false` (the map's AI tuning off).
  // 27.0/31.0 A/B: the zones (31.0), the map-wide pads (scored respawns, patrols), or the yards and the front.
  const spawns0 = TDM.spawns;
  if (opts.spawns) TDM.spawns = opts.spawns;
  // 29.0 A/B: the last-stand instincts off (the bots fight on as before, under the same rules).
  const ls0 = ARENA.lastStand.on;
  if (opts.lastStand !== undefined) ARENA.lastStand.on = opts.lastStand;
  // 55.0 A/B: `instinct: false` is 54.0's bots (no chases, grudges, punishes, cover calls, quick reacquisitions).
  const inst0 = ARENA.instinct.on;
  if (opts.instinct !== undefined) ARENA.instinct.on = opts.instinct;
  // 30.0 A/B: `stamina: false` is the endless sprint of 29.0 (the bots sprint as they did).
  const stam0 = STAMINA.on;
  if (opts.stamina !== undefined) STAMINA.on = opts.stamina;
  // 32.0 A/B: `space: false` is 31.0's bots (no spread in fights, patrols or hunts); set after the
  // map's profile (below), which may turn it on.
  const space0 = ARENA.space.on;
  // 38.0 A/B: `watches`: the high ground's watches at once (0: none kept).
  const td = game.level.data.tdm;
  const hg0 = td?.highGround;
  if (td && hg0 && opts.watches !== undefined) td.highGround = opts.watches ? { ...hg0, count: opts.watches } : undefined;
  // (Read before the match's profile turns it on, as `space`.)
  const pull0 = ARENA.flankPull.on;
  // 44.0 A/B: `fronts: false` is 43.0's patrols (read when the match is set up, so set before it).
  const fronts0 = ARENA.fronts.on;
  if (opts.fronts !== undefined) ARENA.fronts.on = opts.fronts;
  // 29.0: the map's tickets unless told (50 since 29.0; 25 forced before).
  startMatch(game, true, opts.tickets, ai, opts.size, opts.profile ?? true);
  if (td) td.highGround = hg0;
  // 38.0 A/B: `flankPull: false` (after the profile, which may turn it on); `tune`: any ARENA values on
  // top of the map's profile (put back at the end).
  if (opts.flankPull !== undefined) ARENA.flankPull.on = opts.flankPull;
  const untune = applyProfile(opts.tune);
  // 41.0 (A/B): the spawn weights (SPAWN, under the map's own spawnTuning), put back after.
  const spawn0 = { ...SPAWN };
  Object.assign(SPAWN, opts.spawnTune ?? {});
  if (opts.space !== undefined) ARENA.space.on = opts.space;
  // 33.0 A/B: `corridor: false` turns the corridor feelers off (after the profile, which may turn them on).
  const corridor0 = ARENA.corridor.on;
  if (opts.corridor !== undefined) ARENA.corridor.on = opts.corridor;
  // 35.0 A/B: `flankThreat: false` is 34.0's awareness; `scan` the glances out of the half (Maglev's profile).
  const flank0 = ARENA.flankThreat.on, scan0 = ARENA.scan.on;
  if (opts.flankThreat !== undefined) ARENA.flankThreat.on = opts.flankThreat;
  if (opts.scan !== undefined) ARENA.scan.on = opts.scan;
  // (And `directRise` again: the map's profile sets it at the match's start; L-165.)
  if (opts.directRise !== undefined) ARENA.directRise = opts.directRise;
  // 25.0 A/B: `fog: false` plays Neon Block without its ground fog's sight cap and route bias.
  if (opts.fog === false) {
    if (game.tdm.sensing) game.tdm.sensing.fog = null;
    game.nav.bias = null;
  }
  // Forward respawns are read at each respawn: held off for the whole match (A/B), restored below.
  TDM.force.noForward = opts.forward === false;
  const tdm = game.tdm;
  // 28.0: a fixed sight range for the whole match (the level's weather doesn't run in a sim: the
  // desert's storm stays where it was; `sight: 24.5` is its peak, 260 its calm).
  const sight0 = game.ctx.sightRange;
  const fog0 = (game.fog as { density?: number }).density;
  if (opts.sight !== undefined) {
    game.ctx.sightRange = opts.sight;
    // The arena bots read the scene's fog (the storm drives it): the density that sight range implies.
    if (fog0 !== undefined) (game.fog as { density: number }).density = Math.sqrt(Math.log(10)) / opts.sight;
  }
  // 19.0, downtime: each life's time from spawn to its first round (time to first engagement), lives
  // that died without firing, and the map's quiet seconds (whole seconds in which nobody fired).
  const born = new Map<number, number>();
  const firstShot: number[] = [];
  const fired = new Set<number>();
  let silentDeaths = 0;
  const shotSec = new Set<number>();
  // 20.0, difficulty: each life's first hit, first hit from 22 m or more, and its death; a long-range
  // hit "escaped" if the life lasted 3 s more.
  const firstHit = new Map<number, number>(), firstLong = new Map<number, number>(), diedAt = new Map<number, number>();
  const targets = game.projectiles.targets!;
  const hit0 = targets.hit;
  targets.hit = (e, dmg, dir, point, by) => {
    const now = game.elapsed;
    if (e.alive && by && by.team !== e.team) {
      if (!firstHit.has(e.uid)) firstHit.set(e.uid, now);
      if (!firstLong.has(e.uid) && Math.hypot(by.pos.x - e.pos.x, by.pos.z - e.pos.z) >= 22) firstLong.set(e.uid, now);
    }
    hit0(e, dmg, dir, point, by);
  };
  const onFire0 = game.projectiles.onFire;
  game.projectiles.onFire = (from, by) => {
    onFire0(from, by);
    const now = game.elapsed;
    shotSec.add(Math.floor(now));
    if (by && !by.isPlayer && !fired.has(by.uid) && born.has(by.uid)) {
      fired.add(by.uid);
      firstShot.push(now - born.get(by.uid)!);
    }
  };
  const g = game as unknown as { time: { value: number } };
  const met = meter(game);
  game.timeScale = 0;
  const t0 = game.elapsed;
  let steps = 0, firstContact: number | null = null;
  // Per bot-step samples: moving (> 1.5 m/s), crouched (> 0.5), standing still (< 0.5 m/s).
  const smp = { n: 0, moving: 0, crouched: 0, still: 0, speed: 0, elevated: 0, mid: 0, top: 0 };
  // 25.0: the map's ground fog, if any (time above it by gun).
  const fogTop = game.level.data.tdm?.groundFog?.below ?? null;
  const upT: Record<string, [number, number]> = {};
  // 14.0: drop-downs (a bot falling fast: walked off a roof or a landing; stairs never build fall speed).
  const falling = new Set<number>();
  let drops = 0;
  const dropFrom: Record<string, number> = {};
  // 8.0: where the fight happens — bot time per zone (sampled), height above the floor.
  const zoneT: Record<string, number> = {};
  // 15.0: bot time per lane (the map's laneOf), sampled with the zones.
  const tdmData = game.level.data.tdm;
  // 33.0: as many lanes as the map names (Deep Jungle's fourth: the tunnels).
  const laneT = new Array(Math.max(3, game.level.data.tdm?.laneNames?.length ?? 3)).fill(0);
  // 9.0: how often a bot came into each zone (a passage like a culvert is crossed in a second: time
  // share undersells it).
  const zoneIn: Record<string, number> = {};
  const lastZone = new Map<number, string>();
  const zoneOf = (x: number, y: number, z: number) => game.level.data.zoneAt(x, y, z)?.name ?? '-';
  const track = new Map<TacticalEnemy, { x: number; z: number; t: number }>();
  const stuck: string[] = [];
  // 27.0, map use: an occupancy grid of `cell` m over the map's walkable cells (those with a nav node).
  const flow = flowGrid(game, opts.cell ?? 8);
  // 28.0, across the map's width: bot time, combat time (engaging, pushing, breaking, flanking) and
  // kills by x band (12 bands over the bounds), so an edge's share can be read at any threshold.
  const xb = game.level.data.bounds;
  const BANDS = 12;
  const band = (x: number) => Math.max(0, Math.min(BANDS - 1, Math.floor(((x - xb.min.x) / (xb.max.x - xb.min.x)) * BANDS)));
  const xTime = new Array(BANDS).fill(0), xFight = new Array(BANDS).fill(0), xKill = new Array(BANDS).fill(0);
  // 31.0: along the base-to-base axis (z) too: where the front is.
  const zband = (z: number) => Math.max(0, Math.min(BANDS - 1, Math.floor(((z - xb.min.y) / (xb.max.y - xb.min.y)) * BANDS)));
  const zTime = new Array(BANDS).fill(0), zFight = new Array(BANDS).fill(0), zKill = new Array(BANDS).fill(0);
  const FIGHT = new Set(['engage', 'push', 'break', 'flank', 'stalk']);
  // 29.0, the endgame: bots of a team on its last stand vs everyone before (samples every 15 steps):
  // the nearest living teammate (m), crouched, moving, holding; the standing counts when the first
  // team ran out of tickets; how often a team ended 1 v 1 or 1 v many.
  const eg = { last: { n: 0, mate: 0, crouch: 0, moving: 0, hold: 0, alone: 0 }, before: { n: 0, mate: 0, crouch: 0, moving: 0, hold: 0, alone: 0 } };
  let firstLast: { t: number; team: string; standing: Record<string, number> } | null = null;
  const edgeOf = game.level.data.tdm?.edgeOf ?? null;
  // 32.0, clustering (a team with 3+ alive and tickets left, every 15 steps): bots with 2+ teammates
  // within 10 m (a group), with one within 6 m (a pair), in a convoy (moving, 2+ teammates within 15 m
  // moving the same way, within 30°); the share of the main lanes the team covers (of what its count
  // could); its width (x range over the map's).
  const spr = { bots: 0, grouped: 0, paired: 0, convoy: 0, teamN: 0, laneCover: 0, width: 0, mates: [] as number[], groupedBy: {} as Record<string, number>, convoyBy: {} as Record<string, number> };
  const nLanes = game.level.data.tdm?.laneNames?.length ?? 0;
  // 41.0, clumps (every 15 steps, a team with 2+ alive and tickets left): the team's bodies grouped by
  // single linkage within CLUMP_R m; per bot, the size of the group it is in (bot-weighted: "how many
  // stand with me"), the team's largest group, and the bot-weighted histogram 1, 2, 3, 4, 5, 6+.
  // Fight sites: every fighting bot's fight (the midpoint between it and its target), grouped within
  // SITE_R m: how many separate fights are going on at once.
  const CLUMP_R = 10, SITE_R = 20;
  const clump = { samples: 0, sum: 0, largest: 0, teamN: 0, hist: [0, 0, 0, 0, 0, 0], bigBy: {} as Record<string, number>, herd: 0, herdBy: {} as Record<string, number> };
  // A herd: a bot in a group of HERD_N or more that still has HERD_N − 1 of the same mates HERD_T s later
  // (a crowd that moves as one, not two fireteams crossing): each bot's mates at its last sample.
  const HERD_N = 5, HERD_T = 5;
  const herdHist = new Map<number, { t: number; mates: Set<number> }[]>();
  const sites = { samples: 0, sum: 0, two: 0, three: 0 };
  // 44.0, brawls and lit lanes: fighters per fight site (a site of 4+ fighters is a brawl, 6+ a big one),
  // and at every sample how many of the map's three lanes have a fight going (laneOf of the fight).
  const brawl = { sites: 0, fighters: 0, four: 0, six: 0, samples: 0, anyFour: 0 };
  const lit = { samples: 0, sum: 0, all3: 0, none: 0 };
  // 42.0, roles (every 15 steps, every living arena bot): per role, samples; alone (no teammate within
  // 15 m) and the nearest teammate; in the enemy's half (its director's progress over 0.15); moving
  // (> 1.5 m/s); an anchor within 2.5 m of its post; states. Each life's role and gun (by uid).
  type RoleAcc = { n: number; alone: number; enemyHalf: number; moving: number; atPost: number; mates: number[]; states: Record<string, number> };
  const roleAcc: Record<string, RoleAcc> = {};
  const lifeRole = new Map<number, { role: string; arm: string }>();
  // 41.0, swarms: for every hostile some bot is after (fighting or chasing), how many are after it.
  const swarm = { n: 0, sum: 0, four: 0, max: 0 };
  // 33.0, wall-running: a bot whose velocity says it runs (> 1.5 m/s) while it covers less than 40% of
  // that, for 1.5 s or more: pressing into something. Events, seconds, and where (4 m cells, by state).
  const press = new Map<number, { x: number; z: number; t: number; open: boolean }>();
  const wallPress = { events: 0, seconds: 0, spots: new Map<string, { n: number; s: number; y: number; why: Record<string, number> }>() };
  // 33.0, scraping: a moving bot (> 1.5 m/s) with its body within 8 cm of something solid (every 15 steps), by zone.
  const scrape = new Map<string, [number, number]>();
  const _sp = new THREE.Vector3();
  const edgeN = { time: 0, timeIn: 0, fight: 0, fightIn: 0 };
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
      if (!firstLast) for (const t of ['alpha', 'omega'] as const) if (tdm.tickets[t] === 0) firstLast = { t: +(now - t0).toFixed(1), team: t, standing: { ...tdm.standing() } };
      for (const b of tdm.bots) {
        if (!born.has(b.uid)) born.set(b.uid, now);
        if (!b.alive) {
          if (!diedAt.has(b.uid)) diedAt.set(b.uid, now);
          if (!fired.has(b.uid)) {
            fired.add(b.uid);
            silentDeaths++;
          }
          continue;
        }
        const sp = Math.hypot(b.vel.x, b.vel.z);
        {
          const pr = press.get(b.uid);
          if (!pr) press.set(b.uid, { x: b.pos.x, z: b.pos.z, t: 0, open: false });
          else {
            const moved = Math.hypot(b.pos.x - pr.x, b.pos.z - pr.z) / dt;
            pr.x = b.pos.x;
            pr.z = b.pos.z;
            if (sp > 1.5 && moved < 0.4 * sp) {
              pr.t += dt;
              if (pr.t >= 1.5) {
                wallPress.seconds += dt;
                if (!pr.open) {
                  pr.open = true;
                  wallPress.events++;
                }
                const key = `${Math.round(b.pos.x / 4) * 4},${Math.round(b.pos.z / 4) * 4}`;
                const e = wallPress.spots.get(key) ?? { n: 0, s: 0, y: b.pos.y, why: {} };
                if (pr.t - dt < 1.5) {
                  e.n++;
                  e.why[b.tac.action] = (e.why[b.tac.action] ?? 0) + 1;
                }
                e.s += dt;
                wallPress.spots.set(key, e);
              }
            } else {
              pr.t = 0;
              pr.open = false;
            }
          }
        }
        smp.n++;
        smp.speed += sp;
        if (sp > 1.5) smp.moving++;
        if (sp < 0.5) smp.still++;
        if (b.crouch > 0.5) smp.crouched++;
        if (b.pos.y > 1) smp.elevated++;
        // 14.0: which floor: the street, the mid level (2.5–6 m: landings, footbridge, low roofs) or the top.
        if (b.pos.y > 6) smp.top++;
        else if (b.pos.y > 2.5) smp.mid++;
        // 25.0: time over a ground fog's top, by gun.
        if (fogTop !== null && steps % 15 === 0) {
          const tag = (b as unknown as { arm?: { tag: string } }).arm?.tag ?? 'melee';
          const u = (upT[tag] ??= [0, 0]);
          u[1]++;
          if (b.pos.y >= fogTop) u[0]++;
        }
        const fv = (b as unknown as { fallV: number }).fallV;
        if (fv < -5 && !falling.has(b.uid)) {
          falling.add(b.uid);
          drops++;
          const zn = zoneOf(b.pos.x, b.pos.y + 1.5, b.pos.z);
          dropFrom[zn] = (dropFrom[zn] ?? 0) + 1;
        } else if (fv > -1) falling.delete(b.uid);
        if (steps % 15 === 0) {
          const zn = zoneOf(b.pos.x, b.pos.y, b.pos.z);
          if (sp > 1.5) {
            const e = scrape.get(zn) ?? [0, 0];
            e[1]++;
            if (game.col.blocked(_sp.set(b.pos.x, b.pos.y + 0.35, b.pos.z), b.radius + 0.08, 1.2)) e[0]++;
            scrape.set(zn, e);
          }
          zoneT[zn] = (zoneT[zn] ?? 0) + 1;
          flow.add(b.pos.x, b.pos.z, 'occ');
          {
            const onLast = tdm.tickets[b.team] === 0;
            const e = onLast ? eg.last : eg.before;
            let near = Infinity;
            for (const o of tdm.bots) if (o !== b && o.alive && o.team === b.team) near = Math.min(near, Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z));
            e.n++;
            if (near < Infinity) e.mate += Math.min(near, 80);
            else e.alone++;
            if (b.crouch > 0.5) e.crouch++;
            if (Math.hypot(b.vel.x, b.vel.z) > 1.5) e.moving++;
            if (b.tac.action === 'hold') e.hold++;
          }
          xTime[band(b.pos.x)]++;
          if (FIGHT.has(b.tac.action)) xFight[band(b.pos.x)]++;
          zTime[zband(b.pos.z)]++;
          if (FIGHT.has(b.tac.action)) zFight[zband(b.pos.z)]++;
          // 28.0: the map's outer edges (TdmData.edgeOf).
          if (edgeOf) {
            edgeN.time++;
            if (FIGHT.has(b.tac.action)) edgeN.fight++;
            if (edgeOf(b.pos.x, b.pos.y, b.pos.z)) {
              edgeN.timeIn++;
              if (FIGHT.has(b.tac.action)) edgeN.fightIn++;
            }
          }
          const ln = tdmData?.laneOf?.(b.pos.x, b.pos.y, b.pos.z);
          if (ln !== undefined && ln !== null) laneT[ln]++;
          if (lastZone.get(b.uid) !== zn) {
            if (lastZone.has(b.uid)) zoneIn[zn] = (zoneIn[zn] ?? 0) + 1;
            lastZone.set(b.uid, zn);
          }
        }
        if (steps % 60 === 0) {
          const r = track.get(b);
          // 29.0: holding a spot on the last stand is still on purpose, not stuck.
          // 42.0: and a bot recovering in cover (≤ roles.recoverMax), or an anchor fighting planted where it stands.
          const still = b.tac.action === 'hold' || b.tac.action === 'recover' || (isArenaBot(b) && b.brain.role === 'anchor' && b.tac.action === 'engage');
          if (!r || Math.hypot(b.pos.x - r.x, b.pos.z - r.z) > 1.5 || still) track.set(b, { x: b.pos.x, z: b.pos.z, t: now });
          else if (now - r.t > 15) {
            // 38.0: and where it was going (its goal, the route's next node, a vault or a jump under way).
            const br = isArenaBot(b) ? b.brain : null;
            const v3 = (p: { x: number; y: number; z: number } | null | undefined) => (p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` : '-');
            const nx = (b as unknown as { path: number[] }).path?.[0];
            stuck.push(`${b.name} ${b.tac.action}/${b.tac.phase} @${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)} t${(now - t0).toFixed(0)}` + (br ? ` y${b.pos.y.toFixed(1)} goal ${v3(br.goal)} next ${v3(nx !== undefined ? game.nav.nodes[nx] : null)}` : ''));
            r.t = now;
          }
        }
      }
      if (steps % 15 === 0) {
        for (const team of ['alpha', 'omega'] as const) {
          const mine = tdm.bots.filter((o) => o.alive && o.team === team);
          if (mine.length < 2 || tdm.tickets[team] === 0) continue;
          const c = clumps(mine.map((b) => b.pos.x), mine.map((b) => b.pos.z), CLUMP_R);
          clump.teamN++;
          clump.largest += Math.max(...c.sizes);
          for (const g of c.of) {
            const n = c.sizes[g];
            clump.samples++;
            clump.sum += n;
            clump.hist[Math.min(6, n) - 1]++;
          }
          // Herds (see HERD_N).
          mine.forEach((b, i) => {
            const g = c.of[i];
            const h = herdHist.get(b.uid) ?? [];
            const then = h.find((x) => Math.abs(game.elapsed - HERD_T - x.t) < 0.13);
            const mates = new Set<number>();
            if (c.sizes[g] >= HERD_N) mine.forEach((o, j) => j !== i && c.of[j] === g && mates.add(o.uid));
            if (then && mates.size >= HERD_N - 1) {
              let same = 0;
              for (const u of mates) if (then.mates.has(u)) same++;
              if (same >= HERD_N - 1) {
                clump.herd++;
                const nz = Math.min(Infinity, ...tdm.zoneList().filter((z) => z.team === b.team).map((z) => Math.hypot(z.centre.x - b.pos.x, z.centre.z - b.pos.z)));
                const k = b.tac.action + '@' + (nz < 25 ? 'own spawn' : nz < 45 ? 'spawn 25-45' : 'field');
                clump.herdBy[k] = (clump.herdBy[k] ?? 0) + 1;
              }
            }
            h.push({ t: game.elapsed, mates });
            while (h.length && game.elapsed - h[0].t > HERD_T + 0.5) h.shift();
            herdHist.set(b.uid, h);
          });
          // What the bots in a group of five or more are doing (by state).
          mine.forEach((b, i) => {
            if (c.sizes[c.of[i]] >= 5) {
              clump.bigBy[b.tac.action] = (clump.bigBy[b.tac.action] ?? 0) + 1;
              if (b.tac.action === 'patrol') {
                const k = 'patrol@' + zoneOf(b.pos.x, b.pos.y, b.pos.z) + (isArenaBot(b) && b.brain.goal === null ? '/still' : '');
                clump.bigBy[k] = (clump.bigBy[k] ?? 0) + 1;
              }
            }
          });
        }
        const fx: number[] = [], fz: number[] = [];
        const lanesOn = new Set<number>();
        for (const b of tdm.bots) {
          if (!b.alive || !FIGHT.has(b.tac.action) || !isArenaBot(b)) continue;
          const T = b.brain.target;
          if (!T?.alive) continue;
          fx.push((b.pos.x + T.pos.x) / 2);
          fz.push((b.pos.z + T.pos.z) / 2);
          const ln = tdm.fronts ? tdm.fronts.sectorOf(b.pos.x, b.pos.y, b.pos.z) : tdmData?.laneOf?.(b.pos.x, b.pos.y + 1, b.pos.z);
          if (ln !== null && ln !== undefined && ln < 3) lanesOn.add(ln);
        }
        lit.samples++;
        lit.sum += lanesOn.size;
        if (lanesOn.size >= 3) lit.all3++;
        if (!lanesOn.size) lit.none++;
        if (fx.length) {
          const sz = clumps(fx, fz, SITE_R).sizes;
          brawl.samples++;
          let four = false;
          for (const n of sz) {
            brawl.sites++;
            brawl.fighters += n;
            if (n >= 4) {
              brawl.four++;
              four = true;
            }
            if (n >= 6) brawl.six++;
          }
          if (four) brawl.anyFour++;
        }
        for (const team of ['alpha', 'omega'] as const) {
          const D = tdm.directors?.[team];
          const mine = tdm.bots.filter((o) => o.alive && o.team === team);
          for (const b of mine) {
            if (!isArenaBot(b) || !D) continue;
            const role = ARENA.roles.on ? b.brain.role : 'frontliner';
            if (!lifeRole.has(b.uid)) lifeRole.set(b.uid, { role, arm: b.arm.id });
            const a = (roleAcc[role] ??= { n: 0, alone: 0, enemyHalf: 0, moving: 0, atPost: 0, mates: [], states: {} });
            let near = Infinity;
            for (const o of mine) if (o !== b) near = Math.min(near, Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z));
            a.n++;
            a.mates.push(Math.min(near, 120));
            if (near > 15) a.alone++;
            if (D.progress(b.pos) > 0.15) a.enemyHalf++;
            if (Math.hypot(b.vel.x, b.vel.z) > 1.5) a.moving++;
            const post = role === 'anchor' ? D.anchorPost(b.uid) : null;
            if (post && Math.hypot(post.x - b.pos.x, post.z - b.pos.z) < 2.5 && Math.abs(post.y - b.pos.y) < 1) a.atPost++;
            a.states[b.brain.state] = (a.states[b.brain.state] ?? 0) + 1;
          }
        }
        const on = new Map<number, number>();
        for (const b of tdm.bots) {
          if (!b.alive || !isArenaBot(b)) continue;
          const T = b.brain.target;
          if (T?.alive) on.set(T.uid, (on.get(T.uid) ?? 0) + 1);
        }
        for (const n of on.values()) {
          swarm.n++;
          swarm.sum += n;
          if (n >= 4) swarm.four++;
          swarm.max = Math.max(swarm.max, n);
        }
        if (fx.length) {
          const n = clumps(fx, fz, SITE_R).sizes.length;
          sites.samples++;
          sites.sum += n;
          if (n >= 2) sites.two++;
          if (n >= 3) sites.three++;
        }
      }
      if (steps % 15 === 0)
        for (const team of ['alpha', 'omega'] as const) {
          const mine = tdm.bots.filter((o) => o.alive && o.team === team);
          if (mine.length < 3 || tdm.tickets[team] === 0) continue;
          spr.teamN++;
          let x0 = Infinity, x1 = -Infinity;
          const lanes = new Set<number>();
          for (const b of mine) {
            x0 = Math.min(x0, b.pos.x);
            x1 = Math.max(x1, b.pos.x);
            const ln = tdmData?.laneOf?.(b.pos.x, b.pos.y, b.pos.z);
            if (ln !== undefined && ln !== null && ln < 3) lanes.add(ln);
            let near = Infinity, n10 = 0, conv = 0;
            const sp = Math.hypot(b.vel.x, b.vel.z);
            for (const o of mine) {
              if (o === b) continue;
              const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
              near = Math.min(near, d);
              if (d < 10) n10++;
              const so = Math.hypot(o.vel.x, o.vel.z);
              if (d < 15 && sp > 1.5 && so > 1.5 && (b.vel.x * o.vel.x + b.vel.z * o.vel.z) / (sp * so) > 0.866) conv++;
            }
            spr.bots++;
            spr.mates.push(Math.min(near, 120));
            if (n10 >= 2) {
              spr.grouped++;
              spr.groupedBy[b.tac.action] = (spr.groupedBy[b.tac.action] ?? 0) + 1;
            }
            if (near < 6) spr.paired++;
            if (conv >= 2) {
              spr.convoy++;
              spr.convoyBy[b.tac.action] = (spr.convoyBy[b.tac.action] ?? 0) + 1;
            }
          }
          if (nLanes) spr.laneCover += lanes.size / Math.min(3, nLanes, mine.length);
          spr.width += (x1 - x0) / (xb.max.x - xb.min.x);
        }
    }
    await wait(0);
  }
  met.stop();
  game.projectiles.onFire = onFire0;
  targets.hit = hit0;
  TDM.force.noForward = false;
  TDM.spawns = spawns0;
  ARENA.lastStand.on = ls0;
  ARENA.instinct.on = inst0;
  STAMINA.on = stam0;
  ARENA.fronts.on = fronts0;
  ARENA.space.on = space0;
  ARENA.corridor.on = corridor0;
  ARENA.flankThreat.on = flank0;
  ARENA.scan.on = scan0;
  game.ctx.sightRange = sight0;
  if (fog0 !== undefined) (game.fog as { density: number }).density = fog0;
  game.timeScale = 1;
  TDM.roster = roster0;
  ARENA.laneLeave = lane0;
  TDM.arms = arms0;
  untune();
  Object.assign(SPAWN, spawn0);
  ARENA.directRise = rise0;
  ARENA.flankPull.on = pull0;
  ARENA.vantage.on = vantage0;
  ARENA.lanePressure.on = pressure0;
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
    // 19.0: the self-play density metrics.
    teamSize: tdm.slots.filter((x) => x.team === 'omega').length,
    forwardSpawns: { ...tdm.forwardStats },
    // 27.0: the respawns and how they went (anti-spawn-trap), and how evenly the map was used.
    spawnSafety: (() => {
      const log = tdm.spawnLog;
      const lives = log.filter((x) => born.has(x.uid));
      const ttd: number[] = [], hitIn: number[] = [];
      let dead = 0, in3 = 0, in5 = 0, shotIn3 = 0;
      for (const x of lives) {
        const b = born.get(x.uid)!;
        const d = diedAt.get(x.uid);
        if (d !== undefined) {
          dead++;
          ttd.push(d - b);
          if (d - b < 3) in3++;
          if (d - b < 5) in5++;
        }
        const h = firstHit.get(x.uid);
        if (h !== undefined) {
          hitIn.push(h - b);
          if (h - b < 3) shotIn3++;
        }
      }
      const n = Math.max(1, lives.length);
      return {
        mode: tdm.zoner ? 'zones' : tdm.spawner ? 'dynamic' : 'bases',
        respawns: lives.length,
        diedWithin3sPct: +((100 * in3) / n).toFixed(1),
        diedWithin5sPct: +((100 * in5) / n).toFixed(1),
        shotWithin3sPct: +((100 * shotIn3) / n).toFixed(1),
        timeToDeath: { median: q(ttd, 0.5), p10: q(ttd, 0.1), p25: q(ttd, 0.25), deaths: dead },
        timeToFirstHit: { median: q(hitIn, 0.5), p10: q(hitIn, 0.1) },
        nearestHostileAtSpawn: { median: q(log.map((x) => x.nearest).filter((x) => x < Infinity), 0.5), p10: q(log.map((x) => x.nearest).filter((x) => x < Infinity), 0.1) },
        fallbacks: log.filter((x) => x.fallback).length,
        rays: { mean: +(log.reduce((a, x) => a + x.rays, 0) / Math.max(1, log.length)).toFixed(1), max: Math.max(0, ...log.map((x) => x.rays)) },
        msPerPick: { mean: +(log.reduce((a, x) => a + x.ms, 0) / Math.max(1, log.length)).toFixed(3), max: +Math.max(0, ...log.map((x) => x.ms)).toFixed(3) },
        padUse: log.reduce<Record<number, number>>((a, x) => ((a[x.pad] = (a[x.pad] ?? 0) + 1), a), {}),
      };
    })(),
    // 30.0: the sprint's economy: seconds sprinting by reason and run dry (shares of the bots' alive
    // time), pools emptied a bot-minute, the pool when a fight starts.
    stamina: (() => {
      const alive = Math.max(1, st.aliveT);
      const w = st.sprintWhy;
      const sp = w.cross + w.flank + w.push + w.retreat;
      const at = st.staminaAtEngage;
      return {
        on: opts.stamina !== false,
        sprintPct: +((100 * sp) / alive).toFixed(1),
        sprintByWhyPct: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, +((100 * v) / Math.max(1e-9, sp)).toFixed(1)])),
        exhaustedPct: +((100 * st.exhaustedT) / alive).toFixed(1),
        emptiedPerBotMin: +((st.emptied / alive) * 60).toFixed(2),
        atEngage: { n: at.length, median: q(at, 0.5), p10: q(at, 0.1), under20Pct: +((100 * at.filter((x) => x < 20).length) / Math.max(1, at.length)).toFixed(1) },
      };
    })(),
    // 29.0: how the match ended and what its endgame looked like.
    endgame: (() => {
      const r = tdm.rules;
      const avg = (e: typeof eg.last) => ({ samples: e.n, nearestMateM: +(e.mate / Math.max(1, e.n - e.alone)).toFixed(1), alonePct: +((100 * e.alone) / Math.max(1, e.n)).toFixed(1), crouchedPct: +((100 * e.crouch) / Math.max(1, e.n)).toFixed(1), movingPct: +((100 * e.moving) / Math.max(1, e.n)).toFixed(1), holdPct: +((100 * e.hold) / Math.max(1, e.n)).toFixed(1) });
      return {
        outcome: tdm.outcome,
        firstLastStand: firstLast,
        endgameSeconds: firstLast ? +(simT - firstLast.t).toFixed(1) : null,
        // The team that ran out of tickets first won anyway: a comeback.
        comeback: !!firstLast && tdm.outcome?.winner === firstLast.team,
        finalStanding: tdm.standing(),
        sudden: { starts: r.stats.suddenStarts, resets: r.stats.suddenResets, longest: +r.stats.longestSudden.toFixed(1) },
        lastStandBots: avg(eg.last),
        beforeBots: avg(eg.before),
        holdSeconds: +tdm.arenaStats.holdT.toFixed(1),
      };
    })(),
    flow: (() => {
      for (const x of k) if (x.victimPos) flow.add(x.victimPos[0], x.victimPos[2], 'kill');
      return flow.report();
    })(),
    // 28.0: the outer edges' share of bot time, combat time and kills (null: the map defines none).
    edge: edgeOf
      ? {
          timePct: +((100 * edgeN.timeIn) / Math.max(1, edgeN.time)).toFixed(1),
          fightPct: +((100 * edgeN.fightIn) / Math.max(1, edgeN.fight)).toFixed(1),
          killPct: +((100 * k.filter((x) => x.victimPos && edgeOf(x.victimPos[0], x.victimPos[1], x.victimPos[2])).length) / Math.max(1, k.length)).toFixed(1),
        }
      : null,
    zBands: (() => {
      for (const x of k) if (x.victimPos) zKill[zband(x.victimPos[2])]++;
      const pctOf = (a: number[]) => {
        const t = a.reduce((u, v) => u + v, 0) || 1;
        return a.map((v) => +((100 * v) / t).toFixed(1));
      };
      return { from: xb.min.y, to: xb.max.y, bands: BANDS, timePct: pctOf(zTime), fightPct: pctOf(zFight), killPct: pctOf(zKill) };
    })(),
    // 33.0: wall-running (see `press`): events, seconds, a bot-minute, the worst spots.
    wallPress: {
      events: wallPress.events,
      seconds: +wallPress.seconds.toFixed(1),
      perBotMin: +(wallPress.events / Math.max(1e-9, (smp.n * dt) / 60)).toFixed(3),
      spots: [...wallPress.spots.entries()].sort((a, c) => c[1].s - a[1].s).slice(0, 12).map(([k, e]) => ({ at: k, y: +e.y.toFixed(1), events: e.n, seconds: +e.s.toFixed(1), why: e.why })),
    },
    // 33.0: scraping walls (see `scrape`): moving samples and the share touching, by zone (the busiest).
    scrape: Object.fromEntries([...scrape.entries()].filter(([, e]) => e[1] >= 50).sort((a, c) => c[1][1] - a[1][1]).map(([k, e]) => [k, { samples: e[1], touchingPct: +((100 * e[0]) / e[1]).toFixed(1) }])),
    // 32.0: how bunched the teams are (see `spr`).
    spread: (() => {
      const m = spr.mates.sort((a, c) => a - c);
      const pc = (v: number, n: number) => +((100 * v) / Math.max(1, n)).toFixed(1);
      return { samples: spr.bots, nearestMateMedian: +(m[Math.floor(m.length / 2)] ?? 0).toFixed(1), nearestMateP25: +(m[Math.floor(m.length / 4)] ?? 0).toFixed(1), groupedPct: pc(spr.grouped, spr.bots), pairedPct: pc(spr.paired, spr.bots), convoyPct: pc(spr.convoy, spr.bots), laneCoverPct: pc(spr.laneCover, spr.teamN), widthPct: pc(spr.width, spr.teamN), groupedBy: spr.groupedBy, convoyBy: spr.convoyBy, approaches: st.approaches };
    })(),
    // 41.0: clumps and fight sites (see `clump`), and the kills' spread: kills with another kill 30 m or
    // more away within 10 s (two fights at once), and how many 16 m cells hold 80% of the kills.
    clumps: (() => {
      const pc = (v: number) => +((100 * v) / Math.max(1, clump.samples)).toFixed(1);
      return { linkM: CLUMP_R, avgClump: +(clump.sum / Math.max(1, clump.samples)).toFixed(2), avgLargest: +(clump.largest / Math.max(1, clump.teamN)).toFixed(2), histPct: { 1: pc(clump.hist[0]), 2: pc(clump.hist[1]), 3: pc(clump.hist[2]), 4: pc(clump.hist[3]), 5: pc(clump.hist[4]), '6+': pc(clump.hist[5]) }, herdPct: pc(clump.herd), herdBy: clump.herdBy, bigBy: clump.bigBy };
    })(),
    // 42.0: the roles (see `roleAcc`): each role's share of bot time, lives, alone, the nearest teammate's
    // median, in the enemy's half, moving, an anchor at its post, its top states; kills and deaths, K/D,
    // kills from behind or the side (KillRecord.flank); the guns its lives carried; the role events.
    roles: (() => {
      const all = Object.values(roleAcc).reduce((x, a) => x + a.n, 0) || 1;
      const pc = (v: number, n: number) => +((100 * v) / Math.max(1, n)).toFixed(1);
      const out: Record<string, unknown> = {};
      for (const [role, a] of Object.entries(roleAcc)) {
        const m = a.mates.sort((x, y) => x - y);
        const lives = [...lifeRole.values()].filter((l) => l.role === role);
        const arms: Record<string, number> = {};
        for (const l of lives) arms[l.arm] = (arms[l.arm] ?? 0) + 1;
        const kills = k.filter((x) => x.killerArch === role), deaths = k.filter((x) => x.victimArch === role);
        out[role] = {
          timePct: pc(a.n, all),
          lives: lives.length,
          alonePct: pc(a.alone, a.n),
          nearestMateMedian: +(m[Math.floor(m.length / 2)] ?? 0).toFixed(1),
          enemyHalfPct: pc(a.enemyHalf, a.n),
          movingPct: pc(a.moving, a.n),
          atPostPct: role === 'anchor' ? pc(a.atPost, a.n) : undefined,
          states: Object.fromEntries(Object.entries(a.states).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([s2, v]) => [s2, pc(v, a.n)])),
          kills: kills.length,
          deaths: deaths.length,
          kd: +(kills.length / Math.max(1, deaths.length)).toFixed(2),
          killsFromBehindPct: pc(kills.filter((x) => x.flank).length, kills.length),
          killRangeMedian: +q(kills.map((x) => x.dist), 0.5).toFixed(1),
          arms: Object.fromEntries(Object.entries(arms).map(([g2, v]) => [g2, pc(v, lives.length)])),
        };
      }
      return { ...out, events: { stalks: st.stalks, warnShots: st.warnShots, recovers: st.recovers, recoverEnd: st.recoverEnd, anchorArrive: st.anchorArrive } };
    })(),
    // 41.0: bots after one hostile at once (mean, share of hostiles with 4+, most); allies already in
    // the local area at each respawn (0, 1, 2, 3, 4+); the fireteams (size a bot is in, sends to
    // another sector, followers sent back to their leader, contacts left to those on them).
    swarm: { avg: +(swarm.sum / Math.max(1, swarm.n)).toFixed(2), fourPlusPct: +((100 * swarm.four) / Math.max(1, swarm.n)).toFixed(1), max: swarm.max },
    spawnLocal: (() => {
      const h = [0, 0, 0, 0, 0];
      for (const x of tdm.spawnLog) if (x.mates !== undefined && x.t > 1) h[Math.min(4, x.mates)]++;
      const n = h.reduce((a, b) => a + b, 0) || 1;
      return { n, pct: { 0: +((100 * h[0]) / n).toFixed(1), 1: +((100 * h[1]) / n).toFixed(1), 2: +((100 * h[2]) / n).toFixed(1), 3: +((100 * h[3]) / n).toFixed(1), '4+': +((100 * h[4]) / n).toFixed(1) } };
    })(),
    fireteams: tdm.directors
      ? (() => {
          const a = tdm.directors.alpha.sectorStats, o = tdm.directors.omega.sectorStats;
          return { avgSize: +((a.ftSum + o.ftSum) / Math.max(1, a.ftN + o.ftN)).toFixed(2), peels: a.peels + o.peels, follows: st.follows, capSkips: st.capSkips };
        })()
      : null,
    // 44.0: the brawls, the lanes lit, the fronts (their lines' mean and distance from the middle, the
    // times a line crossed it, breaks, tickets bled, respawns at a rally point vs a zone, rotations).
    brawls: { fightersPerSite: +(brawl.fighters / Math.max(1, brawl.sites)).toFixed(2), sites4PlusPct: +((100 * brawl.four) / Math.max(1, brawl.sites)).toFixed(1), sites6PlusPct: +((100 * brawl.six) / Math.max(1, brawl.sites)).toFixed(1), timeWithBrawlPct: +((100 * brawl.anyFour) / Math.max(1, lit.samples)).toFixed(1) },
    lanesLit: { avg: +(lit.sum / Math.max(1, lit.samples)).toFixed(2), all3Pct: +((100 * lit.all3) / Math.max(1, lit.samples)).toFixed(1), nonePct: +((100 * lit.none) / Math.max(1, lit.samples)).toFixed(1) },
    fronts: tdm.fronts ? { ...tdm.fronts.report(), rally: { ...tdm.rallyStats }, rotations: (tdm.directors?.alpha.rotations ?? 0) + (tdm.directors?.omega.rotations ?? 0) } : null,
    // 51.0: the flank objectives: captures, seconds each held, tickets bled, double breakthroughs.
    objectives: tdm.objectives?.report() ?? null,
    fightSites: { linkM: SITE_R, avg: +(sites.sum / Math.max(1, sites.samples)).toFixed(2), twoPlusPct: +((100 * sites.two) / Math.max(1, sites.samples)).toFixed(1), threePlusPct: +((100 * sites.three) / Math.max(1, sites.samples)).toFixed(1) },
    killSpread: (() => {
      const at = k.filter((x) => x.victimPos);
      const apart = at.filter((x) => at.some((y) => y !== x && Math.abs(y.t - x.t) <= 10 && Math.hypot(y.victimPos![0] - x.victimPos![0], y.victimPos![2] - x.victimPos![2]) >= 30)).length;
      const cells = new Map<string, number>();
      for (const x of at) {
        const key = `${Math.floor(x.victimPos![0] / 16)},${Math.floor(x.victimPos![2] / 16)}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
      const sorted = [...cells.values()].sort((a, b) => b - a);
      let acc = 0, n80 = 0;
      while (acc < 0.8 * at.length && n80 < sorted.length) acc += sorted[n80++];
      return { kills: at.length, withFightElsewherePct: +((100 * apart) / Math.max(1, at.length)).toFixed(1), cells: sorted.length, cellsFor80Pct: n80 };
    })(),
    // 31.0: the deployment zones: picks per team and zone, picks with no safe zone, rays on zone safety.
    zones: tdm.zoner ? { stats: { ...tdm.zoner.stats }, uses: Object.fromEntries(tdm.zoner.zones.map((z) => [`${z.team}-${z.id}`, z.uses])) } : null,
    xBands: (() => {
      for (const x of k) if (x.victimPos) xKill[band(x.victimPos[0])]++;
      const pctOf = (a: number[]) => {
        const t = a.reduce((u, v) => u + v, 0) || 1;
        return a.map((v) => +((100 * v) / t).toFixed(1));
      };
      return { from: xb.min.x, to: xb.max.x, bands: BANDS, timePct: pctOf(xTime), fightPct: pctOf(xFight), killPct: pctOf(xKill) };
    })(),
    // 37.1: the high-ground watch (TdmData.highGround): posted, got there, seconds held there.
    watch: tdm.directors ? { posts: tdm.directors.alpha.watchStats.posts + tdm.directors.omega.watchStats.posts, arrivals: st.watchHolds, died: tdm.directors.alpha.watchStats.died + tdm.directors.omega.watchStats.died, timedOut: tdm.directors.alpha.watchStats.timedOut + tdm.directors.omega.watchStats.timedOut, heldSeconds: +st.watchT.toFixed(1), diedAt: [...tdm.directors.alpha.watchDiedAt, ...tdm.directors.omega.watchDiedAt] } : null,
    patrol: tdm.directors ? { picks: tdm.directors.alpha.patrolStats.picks + tdm.directors.omega.patrolStats.picks, toFlank: tdm.directors.alpha.patrolStats.flank + tdm.directors.omega.patrolStats.flank, toActive: tdm.directors.alpha.patrolStats.active + tdm.directors.omega.patrolStats.active, spawnsHeard: tdm.directors.alpha.patrolStats.spawnsHeard + tdm.directors.omega.patrolStats.spawnsHeard, arrivals: st.patrolArrive } : null,
    firstEngagement: {
      lives: firstShot.length + silentDeaths,
      median: +q(firstShot, 0.5).toFixed(1),
      p90: +q(firstShot, 0.9).toFixed(1),
      mean: +(firstShot.reduce((a, x) => a + x, 0) / Math.max(1, firstShot.length)).toFixed(1),
      diedWithoutFiring: silentDeaths,
    },
    // 20.0: how hard the bots are to kill from range, and how fast a hit becomes a kill.
    difficulty: (() => {
      const longs = [...firstLong.entries()];
      const escaped = longs.filter(([uid, t]) => !diedAt.has(uid) || diedAt.get(uid)! - t > 3).length;
      const ttk = [...diedAt.entries()].filter(([uid]) => firstHit.has(uid)).map(([uid, t]) => t - firstHit.get(uid)!);
      return {
        longHitLives: longs.length,
        escapedPct: +((100 * escaped) / Math.max(1, longs.length)).toFixed(1),
        ttkFromFirstHitMedian: +q(ttk, 0.5).toFixed(2),
        killsOver25mPct: +((100 * k.filter((x) => x.dist > 25).length) / Math.max(1, k.length)).toFixed(1),
        evades: tdm.arenaStats.evades,
        evadeSlides: tdm.arenaStats.slideWhy.evade,
      };
    })(),
    quietPct: +((100 * (1 - Math.min(shotSec.size, Math.ceil(simT)) / Math.max(1, Math.ceil(simT))))).toFixed(1),
    // 38.0: quiet seconds before the first team's last stand (the endgame's standoffs, a few
    // survivors hiding on a 180 m map, ran single matches from 6% to 51%).
    quietLivePct: (() => {
      const end = Math.ceil(firstLast ? firstLast.t : simT);
      let q = 0;
      for (let t = Math.floor(t0); t < Math.floor(t0) + end; t++) if (!shotSec.has(t)) q++;
      return +((100 * q) / Math.max(1, end)).toFixed(1);
    })(),
    longestQuiet: (() => {
      let best = 0, run = 0;
      for (let t = Math.floor(t0); t < Math.ceil(t0 + simT); t++) {
        run = shotSec.has(t) ? 0 : run + 1;
        best = Math.max(best, run);
      }
      return best;
    })(),
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
    // 25.0: a ground fog's combat (TdmData.groundFog): kills with both ends under its top (the street),
    // both above (the roofs) and across; the range of each; each gun's time above it; sight checks it cut.
    fog: fogTop === null ? null : (() => {
      const zone = (x: { killerY?: number; victimPos?: number[] }) => {
        const a = (x.killerY ?? 0) < fogTop, b = (x.victimPos?.[1] ?? 0) < fogTop;
        return a && b ? 'ground' : !a && !b ? 'roof' : 'across';
      };
      const out: Record<string, unknown> = {};
      for (const z of ['ground', 'roof', 'across']) {
        const d = k.filter((x) => x.killerTeam && zone(x) === z).map((x) => x.dist);
        out[z] = { kills: d.length, median: +q(d, 0.5).toFixed(1), p10: +q(d, 0.1).toFixed(1), p90: +q(d, 0.9).toFixed(1) };
      }
      out.upTimePctByGun = Object.fromEntries(Object.entries(upT).map(([g, [u, n]]) => [g, +((100 * u) / Math.max(1, n)).toFixed(1)]));
      out.sightCut = tdm.sensing?.fogCut ?? 0;
      return out;
    })(),
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
    // 15.0: share of lane time (in the contested middle) per lane, flank / centre / flank.
    laneTimePct: (() => {
      const tot = laneT.reduce((a: number, v: number) => a + v, 0);
      if (!tot) return null;
      const names = tdmData?.laneNames ?? ['left', 'centre', 'right'];
      return Object.fromEntries(names.map((n, i) => [n, +((100 * laneT[i]) / tot).toFixed(1)]));
    })(),
    killsByLane: (() => {
      if (!tdmData?.laneOf) return null;
      const names = tdmData.laneNames ?? ['left', 'centre', 'right'];
      const out: Record<string, number> = {};
      for (const x of k) {
        if (x.victimPos === undefined) continue;
        const lane: number | null = tdmData.laneOf!(x.victimPos[0], x.victimPos[1], x.victimPos[2]);
        const n = lane === null ? 'none' : names[lane];
        out[n] = (out[n] ?? 0) + 1;
      }
      return out;
    })(),
    zoneEntries: Object.fromEntries(Object.entries(zoneIn).sort((a, b) => b[1] - a[1])),
    killsByZone: k.reduce<Record<string, number>>((a, x) => ((a[x.zone ?? '-'] = (a[x.zone ?? '-'] ?? 0) + 1), a), {}),
    // 37.0: kills with the killer in the same zone as the victim (a fight inside it, not into it).
    killsWithinZone: k.reduce<Record<string, number>>((a, x) => (x.zone && x.zone === x.killerZone ? ((a[x.zone] = (a[x.zone] ?? 0) + 1), a) : a), {}),
    // 37.1: kills by where the killer stood (high ground shooting down counts for its own zone).
    killsFromZone: k.reduce<Record<string, number>>((a, x) => (x.killerZone ? ((a[x.killerZone] = (a[x.killerZone] ?? 0) + 1), a) : a), {}),
    arena:
      tdm.ai === 'arena'
        ? {
            // 54.0: anchors seated and moved on (time served, no sight, a kill given away).
            anchors: { arrived: st.anchorArrive, moved: st.anchorMoves },
            // 55.0: the instincts (chases and how they ended, grudges, reload punishes, cover calls, quick reacquisitions).
            instinct: st.instinct,
            jumps: st.jumps,
            vaults: st.vaults,
            pushes: st.pushes,
            pushKills: st.pushKills,
            breaks: st.breaks,
            breakPct: +((100 * st.breakT) / Math.max(1e-6, st.aliveT)).toFixed(1),
            switchesPerMin: +((st.switches / simT) * 60).toFixed(1),
            switchWhy: st.switchWhy,
            // 35.0: shots heard close, hits noticed under spawn protection, turns to an unseen shooter, glances.
            aware: st.aware,
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
            laneMoves: tdm.directors ? tdm.directors.alpha.laneMoves + tdm.directors.omega.laneMoves : 0,
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

/**
 * 27.0, how evenly a match used the map: an occupancy grid of `cell` m (bot samples, kills) over the
 * cells a nav node is in (where anyone can be). Reported: coverage (the share of those cells with any
 * time, with 1% of a fair share or more, with a kill), the normalized entropy of the time (1: every
 * cell alike, 0: one cell), the Gini of the kills over the cells (0: even, 1: one cell), and the share
 * of all kills in the busiest tenth of the cells.
 */
export function flowGrid(game: Game, cell: number) {
  const b = game.level.data.bounds;
  const nx = Math.ceil((b.max.x - b.min.x) / cell), nz = Math.ceil((b.max.y - b.min.y) / cell);
  const idx = (x: number, z: number) => {
    const i = Math.floor((x - b.min.x) / cell), j = Math.floor((z - b.min.y) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const walk = new Set<number>();
  for (const p of game.nav.nodes) {
    const i = idx(p.x, p.z);
    if (i >= 0) walk.add(i);
  }
  const occ = new Float64Array(nx * nz), kill = new Float64Array(nx * nz);
  return {
    add(x: number, z: number, what: 'occ' | 'kill') {
      const i = idx(x, z);
      if (i >= 0) (what === 'occ' ? occ : kill)[i]++;
    },
    report() {
      const cells = [...walk];
      const n = cells.length;
      const o = cells.map((i) => occ[i]), kv = cells.map((i) => kill[i]);
      const ot = o.reduce((a, x) => a + x, 0) || 1, kt = kv.reduce((a, x) => a + x, 0) || 1;
      let H = 0;
      for (const x of o) if (x > 0) H -= (x / ot) * Math.log(x / ot);
      const sorted = kv.slice().sort((a, c) => a - c);
      let g = 0;
      sorted.forEach((x, i) => (g += (2 * (i + 1) - n - 1) * x));
      const gini = g / (n * kt);
      const top = sorted.slice(n - Math.max(1, Math.round(n / 10))).reduce((a, x) => a + x, 0);
      return {
        cell,
        walkableCells: n,
        coveragePct: +((100 * o.filter((x) => x > 0).length) / n).toFixed(1),
        fairSharePct: +((100 * o.filter((x) => x >= (0.01 * ot) / n).length) / n).toFixed(1),
        killCellsPct: +((100 * kv.filter((x) => x > 0).length) / n).toFixed(1),
        timeEntropy: +(H / Math.log(n)).toFixed(3),
        killGini: +gini.toFixed(3),
        killsInTop10PctCells: +((100 * top) / kt).toFixed(1),
      };
    },
  };
}
