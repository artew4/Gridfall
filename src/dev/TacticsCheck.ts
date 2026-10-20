import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Player } from '../player/Player';
import { Gunner, Runner, type Enemy, type EnemyCtx, type TacticalEnemy } from '../enemies/Enemy';
import { Squad, nearMissDose } from '../enemies/tactics/Squad';
import { isProtected } from '../enemies/tactics/Cover';

/*
  DEV only. Headless tactical scenarios on the loaded level's real geometry, nav graph and cover
  spots, with the real Enemy/Squad code stepped at 30 Hz in a private scene (nothing drawn, no
  sound, no damage to the real player). The player is scripted: he stands, or walks a nav route at a
  set speed (never teleports once the scenario starts — a teleport would hand the AI free info).

    roles      4 gunners + 4 runners vs a standing player: roles, sides, slots, shot tokens, rushes
    flank      one gunner in cover; he walks round it: how long until it knows and relocates
    suppress   one gunner fighting from cover; near misses: pinned, crouched, silent, then resumes
    ghost      a squad in contact; he slips away out of sight: hunt the LKP, search, never his live spot
    soak       10 enemies, he roams the map shooting; world integrity (bounds, walls, stalls) and cost
*/

const DT = 1 / 30;
const stub = () => new Proxy({}, { get: (_t, k) => (k === 'add' ? { spawn() {} } : () => {}) });
const r1 = (v: number) => +v.toFixed(1);
const r2 = (v: number) => +v.toFixed(2);
const arr = (p: THREE.Vector3) => [r1(p.x), r1(p.y), r1(p.z)];

interface World {
  ctx: EnemyCtx;
  sq: Squad;
  player: Player;
  enemies: Enemy[];
  shots: number;
  /** Rounds that would hit geometry within 3 m of the muzzle (its own cover or parapet). */
  blocked: number;
  t: number;
  /** Cost per step of the squad update plus every enemy update (ms), worst and mean. */
  costMax: number;
  costSum: number;
  steps: number;
}

function world(game: Game, sight?: number): World {
  const player = new Player(game.col, game.audio);
  const enemies: Enemy[] = [];
  const sq = new Squad();
  const w: World = { ctx: null as unknown as EnemyCtx, sq, player, enemies, shots: 0, blocked: 0, t: 0, costMax: 0, costSum: 0, steps: 0 };
  w.ctx = {
    ...game.ctx,
    scene: new THREE.Scene(),
    player,
    enemies,
    occupied: new Set(),
    squad: sq,
    fx: stub() as EnemyCtx['fx'],
    audio: stub() as EnemyCtx['audio'],
    projectiles: {
      fire: (from: THREE.Vector3, dir: THREE.Vector3) => {
        w.shots++;
        const h = game.col.raycast(from, dir, 3);
        if (h && h.dist < Math.min(3, from.distanceTo(player.pos) - 0.5)) w.blocked++;
      },
    } as unknown as EnemyCtx['projectiles'],
    damagePlayer: () => {},
    sightRange: sight ?? game.ctx.sightRange,
    time: 0,
  };
  return w;
}

function spawnAt(w: World, kind: 'runner' | 'gunner', at: THREE.Vector3, game: Game) {
  const e = kind === 'runner' ? new Runner(at.clone(), 2, game.waves.look) : new Gunner(at.clone(), 2, w.ctx.scene, null, game.waves.look);
  w.enemies.push(e);
  return e as TacticalEnemy;
}

/** Action/phase transitions of one enemy (for diagnosing a scenario). */
function tracer(e: TacticalEnemy, w: World) {
  const out: string[] = [];
  let last = '';
  return {
    tick() {
      const k = `${e.tac.action}/${e.tac.phase} c${e.tac.coverId}${e.tac.sees ? ' sees' : ''} ${w.sq.mode}`;
      if (k !== last) out.push(`${r1(w.t)} ${k}`);
      last = k;
    },
    out,
  };
}

function step(w: World) {
  w.t += DT;
  w.ctx.time = w.t;
  const t0 = performance.now();
  w.sq.update(w.ctx, w.enemies);
  for (const e of w.enemies) e.update(DT, w.ctx);
  const c = performance.now() - t0;
  w.costSum += c;
  w.steps++;
  if (c > w.costMax) w.costMax = c;
  for (let i = w.enemies.length - 1; i >= 0; i--) if (w.enemies[i].dead) w.enemies.splice(i, 1);
}

/** Walks him along a nav route to `goal` at `speed` (sets velocity, so the AI's prediction sees it). Returns true on arrival. */
function walker(game: Game, w: World, goal: THREE.Vector3, speed: number) {
  const nav = game.nav;
  const from = new THREE.Vector3(w.player.pos.x, w.player.pos.y + 1, w.player.pos.z);
  const route = nav.route(from, new THREE.Vector3(goal.x, goal.y + 1, goal.z)).map((i) => nav.nodes[i].clone().setY(nav.nodes[i].y - 1));
  route.push(goal.clone());
  let k = 0;
  return () => {
    const p = w.player.pos;
    while (k < route.length && Math.hypot(route[k].x - p.x, route[k].z - p.z) < 0.3) k++;
    if (k >= route.length) {
      w.player.vel.set(0, 0, 0);
      return true;
    }
    const tgt = route[k];
    const d = new THREE.Vector3(tgt.x - p.x, 0, tgt.z - p.z);
    const l = d.length();
    const s = Math.min(l, speed * DT);
    d.multiplyScalar(1 / Math.max(l, 1e-6));
    p.x += d.x * s;
    p.z += d.z * s;
    p.y = game.col.groundHeightAt(p.x, p.z, 0.3, p.y + 0.6);
    w.player.vel.set(d.x * speed, 0, d.z * speed);
    w.player.yaw = Math.atan2(-d.x, -d.z);
    return false;
  };
}

/**
 * A firing position for the scenarios: the level's start (always open and reachable) — except in
 * the jungle, whose start is the road through the undergrowth, where no cover has a view through the
 * bushes (they fight from the undergrowth there); the compound yard inside the gate instead (the
 * bench's 'yard' placement).
 */
function stand(game: Game) {
  if (game.setting === 'jungle') return new THREE.Vector3(0, 0, 5.5);
  const s = game.level.data.start;
  return new THREE.Vector3(s.x, s.y ?? 0, s.z);
}

/** Spawn points sorted by distance from p (nearest first), at least `min` m away. */
function spawnsNear(game: Game, p: THREE.Vector3, min: number) {
  return game.waves.spawns.filter((s) => s.distanceTo(p) > min).sort((a, b) => a.distanceTo(p) - b.distanceTo(p));
}

function place(w: World, game: Game, p: THREE.Vector3) {
  w.player.reset(p.x, p.z, 0, p.y);
}

// ---------------------------------------------------------------------- roles
function roles(game: Game, seconds = 40, moving = false) {
  const w = world(game);
  const p = stand(game);
  place(w, game, p);
  // Moving: he wanders between nodes within 14 m of the start at 4 m/s (a player who doesn't stand still).
  const near = game.nav.nodes.filter((n) => Math.hypot(n.x - p.x, n.z - p.z) < 14 && Math.abs(n.y - 1 - p.y) < 0.6);
  let go = moving ? walker(game, w, p, 4) : () => true;
  const phases = new Map<string, number>();
  const lastPh = new Map<Enemy, string>();
  const sp = spawnsNear(game, p, 12);
  const kinds: ('runner' | 'gunner')[] = ['gunner', 'runner', 'gunner', 'runner', 'gunner', 'runner', 'gunner', 'runner'];
  kinds.forEach((k, i) => spawnAt(w, k, sp[i % sp.length].clone().add(new THREE.Vector3((i % 3) - 1, 0, ((i + 1) % 3) - 1)), game));
  w.sq.report(p, 8);
  let maxSupp = 0, maxShooters = 0, sides = new Set<number>(), peeks = 0, coverTime = 0, gunnerTime = 0, stageTime = 0;
  const prevPhase = new Map<Enemy, string>();
  const share = new Map<string, number>();
  for (let i = 0; i < seconds / DT; i++) {
    if (go() && moving && near.length) {
      const n = near[Math.floor(Math.random() * near.length)];
      go = walker(game, w, new THREE.Vector3(n.x, n.y - 1, n.z), 4);
    }
    step(w);
    const gs = w.enemies.filter((e) => e.kind === 'gunner' && e.alive) as TacticalEnemy[];
    for (const g of gs) {
      const ph = g.tac.phase;
      const prev = lastPh.get(g) ?? '';
      if (ph !== prev && (ph === 'peek' || ph === 'fire' || (prev === 'aim' && ph !== 'fire'))) {
        const k = prev === 'aim' && ph !== 'fire' ? 'aimAborted' : ph === 'peek' ? 'peeks' : 'bursts';
        phases.set(k, (phases.get(k) ?? 0) + 1);
      }
      lastPh.set(g, ph);
    }
    maxSupp = Math.max(maxSupp, gs.filter((g) => g.tac.role === 'suppressor').length);
    for (const e of w.enemies as TacticalEnemy[]) if (e.alive) {
      const k = `${e.kind[0]}:${e.tac.action}`;
      share.set(k, (share.get(k) ?? 0) + DT);
    }
    for (const g of gs) {
      if (g.tac.role === 'flanker') sides.add(g.tac.side);
      gunnerTime += DT;
      if (g.tac.action === 'fight') coverTime += DT;
      if (g.tac.phase === 'peek' && prevPhase.get(g) !== 'peek') peeks++;
      prevPhase.set(g, g.tac.phase);
    }
    for (const r of w.enemies.filter((e) => e.kind === 'runner') as TacticalEnemy[]) if (r.tac.action === 'stage') stageTime += DT;
    maxShooters = Math.max(maxShooters, w.sq.shooters);
  }
  const attacks = w.sq.log.filter(([, k]) => k === 'attack').map(([, , a]) => +a);
  const rushes = w.sq.log.filter(([, k]) => k === 'rush');
  // Spread of attack bearings: how many 60° sectors round him were attacked from.
  const sectors = new Set(attacks.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 3))));
  return {
    maxSuppressors: maxSupp,
    flankSides: [...sides],
    maxShooters,
    tokenLimit: 3,
    gunnerTimeInCoverFight: r2(coverTime / Math.max(1e-6, gunnerTime)),
    popAndShootCycles: peeks,
    shotsFired: w.shots,
    shotsIntoOwnCover: w.blocked,
    peeks: phases.get('peeks') ?? 0,
    bursts: phases.get('bursts') ?? 0,
    aimAborted: phases.get('aimAborted') ?? 0,
    rushes: rushes.map(([t, , d]) => `${t}s ${d}`),
    attacks: attacks.length,
    attackSectors: sectors.size,
    runnerStageSeconds: r1(stageTime),
    secondsByAction: Object.fromEntries([...share].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1(v)])),
    barks: w.sq.barks.log.map((b) => `${r1(b.t)} ${b.kind}`),
    cost: { meanMs: r2(w.costSum / w.steps), maxMs: r2(w.costMax), ...w.sq.sched.stats },
  };
}

// ---------------------------------------------------------------------- flank
function flank(game: Game) {
  const w = world(game);
  const p = stand(game);
  place(w, game, p);
  const sp = spawnsNear(game, p, 14);
  const g = spawnAt(w, 'gunner', sp[0], game) as Gunner;
  w.sq.report(p, 0);
  // 1) Let it find cover and settle in.
  let t = 0;
  for (; t < 40 && !(g.tac.action === 'fight' && g.tac.coverPos); t += DT) step(w);
  if (!g.tac.coverPos) return { ok: false, why: 'never took cover', action: g.tac.action, at: arr(g.pos) };
  const c = g.tac.coverPos.clone();
  const coverId = g.tac.coverId;
  for (let k = 0; k < 2 / DT; k++) step(w);
  // 2) A spot round the side where the crouched body is in plain view, reachable, as close to him as possible.
  const los = (a: THREE.Vector3, b: THREE.Vector3) => game.col.lineOfSight(a, b);
  let best: THREE.Vector3 | null = null;
  let bd = Infinity;
  for (const n of game.nav.nodes) {
    const f = new THREE.Vector3(n.x, n.y - 1, n.z);
    const d = f.distanceTo(c);
    if (d < 6 || d > 20 || Math.abs(f.y - c.y) > 1.5) continue;
    if (isProtected(c, f, los).ok) continue;
    const walk = f.distanceTo(w.player.pos);
    if (walk < bd && walk > 4) {
      bd = walk;
      best = f;
    }
  }
  if (!best) return { ok: false, why: 'no flanking spot on the graph', cover: arr(c) };
  // 3) Walk there; time from "his eyes on the crouched body" to the gunner leaving that cover.
  const go = walker(game, w, best, 5);
  let exposedAt = -1, reactedAt = -1, how = '';
  for (let k = 0; k < 25 / DT; k++) {
    const arrived = go();
    step(w);
    const exposed = !isProtected(c, w.player.pos, los).ok;
    if (exposed && exposedAt < 0) exposedAt = w.t;
    if (exposedAt >= 0 && g.tac.coverId !== coverId) {
      reactedAt = w.t;
      how = `${g.tac.action}${g.tac.coverId >= 0 ? ` to cover ${g.tac.coverId}` : ' (no cover: open ground)'}`;
      break;
    }
    if (arrived && exposedAt < 0) break;
  }
  const newCover = g.tac.coverPos;
  return {
    ok: reactedAt > 0 && reactedAt - exposedAt < 1.5,
    cover: arr(c),
    flankSpot: arr(best),
    exposedAt: r2(exposedAt),
    reactionS: reactedAt > 0 ? r2(reactedAt - exposedAt) : null,
    how,
    newCoverProtectedFromHim: newCover ? isProtected(newCover, w.player.pos, los).ok : null,
    barks: w.sq.barks.log.map((b) => `${r1(b.t)} ${b.kind}`),
  };
}

// ---------------------------------------------------------------------- suppress
function suppress(game: Game) {
  const w = world(game);
  const p = stand(game);
  place(w, game, p);
  const g = spawnAt(w, 'gunner', spawnsNear(game, p, 14)[0], game) as Gunner;
  w.sq.report(p, 0);
  let t = 0;
  const tr = tracer(g, w);
  for (; t < 40 && !(g.tac.action === 'fight' && g.tac.phase === 'aim'); t += DT) {
    step(w);
    tr.tick();
  }
  if (g.tac.action !== 'fight') return { ok: false, why: 'never got to shoot from cover', action: g.tac.action, trace: tr.out.slice(0, 60), at: arr(g.pos), cover: g.tac.coverPos ? arr(g.tac.coverPos) : null };
  // Three rounds 0.6 m past its chest, 0.25 s apart, from his eyes.
  const eye = new THREE.Vector3(p.x, p.y + 1.65, p.z);
  const shotsBefore = w.shots;
  let pinnedAt = -1, crouchedAt = -1;
  const t0 = w.t;
  for (let k = 0; k < 3; k++) {
    const chest = g.chest.clone();
    const aim = chest.clone().add(new THREE.Vector3(0, 0.6, 0));
    const dir = aim.clone().sub(eye).normalize();
    const dose = nearMissDose(eye, dir, eye.distanceTo(aim) + 5, chest);
    g.suppress(dose, w.ctx);
    for (let j = 0; j < 0.25 / DT; j++) {
      step(w);
      if (pinnedAt < 0 && (g.tac.action as string) === 'pinned') pinnedAt = w.t;
      if (crouchedAt < 0 && g.crouch > 0.8) crouchedAt = w.t;
    }
  }
  let firedWhilePinned = 0, resumedAt = -1;
  let shots = w.shots;
  for (let k = 0; k < 8 / DT; k++) {
    step(w);
    if (pinnedAt < 0 && (g.tac.action as string) === 'pinned') pinnedAt = w.t;
    if (crouchedAt < 0 && g.crouch > 0.8) crouchedAt = w.t;
    if ((g.tac.action as string) === 'pinned' && w.shots > shots) firedWhilePinned += w.shots - shots;
    shots = w.shots;
    if (pinnedAt > 0 && resumedAt < 0 && (g.tac.action as string) === 'fight' && (g.tac.phase as string) === 'aim') resumedAt = w.t;
  }
  return {
    ok: pinnedAt > 0 && firedWhilePinned === 0 && resumedAt > 0,
    pinnedAfterS: pinnedAt > 0 ? r2(pinnedAt - t0) : null,
    crouchedAfterS: crouchedAt > 0 ? r2(crouchedAt - t0) : null,
    firedWhilePinned,
    resumedAimingAfterS: resumedAt > 0 ? r2(resumedAt - t0) : null,
    shotsBefore,
    barks: w.sq.barks.log.map((b) => `${r1(b.t)} ${b.kind}`),
  };
}

// ---------------------------------------------------------------------- ghost
function ghost(game: Game, opts: { sight?: number } = {}) {
  const w = world(game, opts.sight);
  const p = stand(game);
  place(w, game, p);
  const sp = spawnsNear(game, p, 12);
  // Riflemen only: a rusher in contact runs as fast as he does and never loses him (that's not
  // ghosting, that's being chased down — the soak covers it).
  for (let i = 0; i < 4; i++) spawnAt(w, 'gunner', sp[i % sp.length], game);
  w.sq.report(p, 0);
  // Contact first.
  let t = 0;
  for (; t < 40 && w.sq.mode !== 'engage'; t += DT) step(w);
  for (let k = 0; k < 3 / DT; k++) step(w);
  if (w.sq.mode !== 'engage') return { ok: false, why: 'no contact', mode: w.sq.mode };
  // A hiding spot: a nav node 18–45 m away that none of them can see now, nor the LKP, and that as
  // few places round them as possible can see (an interior, behind a building): what a player would pick.
  const eyeOf = (e: Enemy) => new THREE.Vector3(e.pos.x, e.pos.y + 1.55, e.pos.z);
  const sight = w.ctx.sightRange ?? Infinity;
  const watchers = game.nav.nodes.filter((n) => w.enemies.some((e) => Math.hypot(n.x - e.pos.x, n.z - e.pos.z) < 25)).filter((_, i) => i % 3 === 0).slice(0, 40);
  let hide: THREE.Vector3 | null = null;
  let hd = Infinity;
  for (const n of game.nav.nodes) {
    const f = new THREE.Vector3(n.x, n.y - 1, n.z);
    const d = f.distanceTo(p);
    if (d < 18 || d > 45) continue;
    const head = new THREE.Vector3(f.x, f.y + 1.4, f.z);
    if (w.enemies.some((e) => e.alive && eyeOf(e).distanceTo(head) < sight && game.col.lineOfSight(eyeOf(e), head))) continue;
    if (game.col.lineOfSight(new THREE.Vector3(p.x, p.y + 1.6, p.z), head) && d < sight) continue;
    const seenBy = watchers.filter((q) => q.distanceTo(head) < sight && game.col.lineOfSight(q.clone().setY(q.y + 0.55), head)).length;
    const score = seenBy * 10 + Math.abs(d - 28) * 0.3 + Math.random();
    if (score < hd) {
      hd = score;
      hide = f;
    }
  }
  if (!hide) return { ok: false, why: 'no hiding spot' };
  const go = walker(game, w, hide, 7.5);
  let lostAt = -1, searchAt = -1, idleAt = -1, foundAt = -1;
  let lkpAtLoss: THREE.Vector3 | null = null;
  let minGoalToHide = Infinity;
  let lkpCheat = false;
  const lkpSightOnly: string[] = [];
  let arrivedAt = -1;
  for (let k = 0; k < 75 / DT; k++) {
    const arrived = go();
    if (arrived && arrivedAt < 0) arrivedAt = w.t;
    step(w);
    const m: string = w.sq.mode;
    if (lostAt < 0 && m === 'hunt') {
      lostAt = w.t;
      lkpAtLoss = w.sq.lkp?.clone() ?? null;
    }
    if (lostAt > 0 && searchAt < 0 && m === 'search') searchAt = w.t;
    if (lostAt > 0 && m === 'engage' && foundAt < 0) {
      foundAt = w.t;
      const seer = (w.enemies as TacticalEnemy[]).find((e) => e.tac.sees);
      lkpSightOnly.push(seer ? `found by ${seer.kind} at ${r1(seer.pos.distanceTo(w.player.pos))} m (own ray)` : 'engage without a seer');
      break;
    }
    if (lostAt > 0 && m === 'idle' && idleAt < 0) {
      idleAt = w.t;
      break;
    }
    if (lostAt > 0) {
      // Before any new sighting: how close did anyone's goal come to where he really is?
      for (const e of w.enemies as TacticalEnemy[]) if (e.tac.goal) minGoalToHide = Math.min(minGoalToHide, e.tac.goal.distanceTo(w.player.pos));
      // The squad's LKP may only be the last sighting (it must not follow him).
      if (w.sq.lkp && lkpAtLoss && w.sq.lkpSource === 'sight' && w.sq.lkp.distanceTo(lkpAtLoss) > 0.01) lkpCheat = true;
    }
  }
  const lkpToHide = lkpAtLoss ? lkpAtLoss.distanceTo(hide) : NaN;
  return {
    // Lost him, never followed him without a sighting, and then searched — or re-found him by an own ray.
    ok: lostAt > 0 && !lkpCheat && (searchAt > 0 || (foundAt > 0 && !lkpSightOnly[0]?.startsWith('engage without'))),
    sight: w.ctx.sightRange ?? null,
    hide: arr(hide),
    lostAfterS: lostAt > 0 ? r1(lostAt - t) : null,
    lkpToHideM: r1(lkpToHide),
    minGoalToHimM: r1(minGoalToHide),
    lkpFollowedHim: lkpCheat,
    searchAfterLossS: searchAt > 0 ? r1(searchAt - lostAt) : null,
    outcome: foundAt > 0 ? `found after ${r1(foundAt - lostAt)} s: ${lkpSightOnly[0]}` : idleAt > 0 ? `gave up after ${r1(idleAt - lostAt)} s` : 'still searching at the end',
    heArrivedAfterS: arrivedAt > 0 ? r1(arrivedAt - t) : null,
    log: w.sq.log.filter(([, k]) => k === 'mode' || k === 'search').map(([tt, k, d]) => `${r1(tt)} ${k} ${d}`),
    barks: w.sq.barks.log.map((b) => `${r1(b.t)} ${b.kind}`),
  };
}

// ---------------------------------------------------------------------- soak
function soak(game: Game, seconds = 120) {
  const w = world(game);
  const p = stand(game);
  place(w, game, p);
  const bounds = game.level.data.bounds;
  const floorMin = game.level.data.floorMin;
  const sp = game.waves.spawns;
  let spawned = 0;
  const add = () => {
    const kind = spawned % 5 < 3 ? 'gunner' : 'runner';
    const far = sp.filter((s) => s.distanceTo(w.player.pos) > 15);
    const base = (far.length ? far : sp)[Math.floor(Math.random() * (far.length || sp.length))];
    // ±1 m like the waves (never into a wall).
    const at = base.clone().add(new THREE.Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1));
    spawnAt(w, kind, game.col.blocked(at, 0.5) ? base : at, game);
    spawned++;
  };
  for (let i = 0; i < 10; i++) add();
  w.sq.report(p, 8);
  let go = walker(game, w, p, 4);
  let nextFire = 0;
  let kills = 0;
  const oob: string[] = [];
  const inside = new Map<Enemy, number>();
  const insideBad: string[] = [];
  const last = new Map<Enemy, { at: THREE.Vector3; t: number; action: string }>();
  const stalls: string[] = [];
  const coverOob: string[] = [];
  const actions = new Map<string, number>();
  const eye = new THREE.Vector3();
  // Recent transitions per enemy, attached to a stall report.
  const hist = new Map<Enemy, string[]>();
  const histKey = new Map<Enemy, string>();
  for (let k = 0; k < seconds / DT; k++) {
    if (go()) {
      // Next leg: a random node anywhere (decks and roofs included).
      const n = game.nav.nodes[Math.floor(Math.random() * game.nav.nodes.length)];
      go = walker(game, w, new THREE.Vector3(n.x, n.y - 1, n.z), 4.5);
    }
    step(w);
    // He shoots at the nearest enemy he can see every 0.5 s: near misses on its neighbours, a hit
    // that kills one in four shots; the dead are replaced from the spawns (10 alive).
    if (w.t > nextFire) {
      nextFire = w.t + 0.5;
      eye.set(w.player.pos.x, w.player.pos.y + 1.65, w.player.pos.z);
      const vis = w.enemies.filter((e) => e.alive && game.col.lineOfSight(eye, e.chest.clone())).sort((a, b) => a.pos.distanceTo(eye) - b.pos.distanceTo(eye));
      const target = vis[0];
      if (target) {
        const dir = target.chest.clone().sub(eye).normalize();
        for (const e of w.enemies) if (e.alive && e !== target) {
          const dose = nearMissDose(eye, dir, eye.distanceTo(target.chest) + 2, e.chest.clone());
          if (dose) e.suppress(dose, w.ctx);
        }
        if (Math.random() < 0.25) {
          target.takeHit(999, dir, target.chest.clone(), w.ctx);
          kills++;
        } else target.suppress(0.5, w.ctx);
      }
    }
    while (w.enemies.filter((e) => e.alive).length < 10) add();
    for (const e of w.enemies as TacticalEnemy[]) {
      if (!e.alive) continue;
      const q = e.pos;
      actions.set(e.tac.action, (actions.get(e.tac.action) ?? 0) + DT);
      const hk = `${e.tac.action}/${e.tac.phase} nr${e.noRoute ? 1 : 0} u${e.unsticks} ${e.state}`;
      if (histKey.get(e) !== hk) {
        histKey.set(e, hk);
        const h = hist.get(e) ?? [];
        h.push(`${r1(w.t)} ${hk} ${arr(q)}`);
        if (h.length > 6) h.shift();
        hist.set(e, h);
      }
      if (q.x < bounds.min.x || q.x > bounds.max.x || q.z < bounds.min.y || q.z > bounds.max.y || q.y < floorMin - 0.5) oob.push(`${r1(w.t)} ${e.kind} ${arr(q)}`);
      if (game.col.blocked(q, 0.2)) {
        const s = (inside.get(e) ?? 0) + DT;
        inside.set(e, s);
        if (s > 0.5 && s < 0.5 + DT * 1.5) insideBad.push(`${r1(w.t)} ${e.kind} ${arr(q)}`);
      } else inside.set(e, 0);
      // Stall: a moving action, goal > 2 m away, no displacement over 8 s.
      const moving = ['takeCover', 'hunt', 'search', 'idle', 'stage', 'rush', 'advance'].includes(e.tac.action) && e.tac.phase !== 'look' && e.tac.phase !== 'pause';
      const goal = e.tac.action === 'takeCover' ? e.tac.coverPos : e.tac.action === 'stage' ? e.tac.stagePos : e.tac.goal;
      const l = last.get(e);
      if (!l || !moving || q.distanceTo(l.at) > 0.75 || l.action !== e.tac.action) last.set(e, { at: q.clone(), t: w.t, action: e.tac.action });
      else if (w.t - l.t > 8 && goal && goal.distanceTo(q) > 2) {
        stalls.push(`${r1(w.t)} ${e.kind} ${e.tac.action} at ${arr(q)} → ${arr(goal)} | ${(hist.get(e) ?? []).join(' ; ')}`);
        last.set(e, { at: q.clone(), t: w.t, action: e.tac.action });
      }
      const cp = e.tac.coverPos;
      if (cp && (cp.x < bounds.min.x || cp.x > bounds.max.x || cp.z < bounds.min.y || cp.z > bounds.max.y)) coverOob.push(arr(cp).join(','));
    }
  }
  const total = [...actions.values()].reduce((a, b) => a + b, 0);
  return {
    ok: !oob.length && !insideBad.length && stalls.length <= 2 && !coverOob.length,
    seconds,
    spawned,
    kills,
    outOfBounds: oob.slice(0, 5),
    outOfBoundsCount: oob.length,
    insideGeometry: insideBad.slice(0, 5),
    stalls: stalls.slice(0, 6),
    stallCount: stalls.length,
    coverOutOfBounds: coverOob.length,
    timeShare: Object.fromEntries([...actions].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v / total)])),
    modes: w.sq.log.filter(([, k]) => k === 'mode').length,
    rushes: w.sq.log.filter(([, k]) => k === 'rush').length,
    barks: Object.fromEntries(Object.entries(w.sq.barks.log.reduce((m: Record<string, number>, b) => ((m[b.kind] = (m[b.kind] ?? 0) + 1), m), {}))),
    cost: { meanMs: r2(w.costSum / w.steps), maxMs: r2(w.costMax), ...w.sq.sched.stats, cacheHits: w.sq.cover.hits, cacheMisses: w.sq.cover.misses },
  };
}

/** Runs the scenarios on the loaded level. */
export function checkTactics(game: Game, which: ('roles' | 'rolesMoving' | 'flank' | 'suppress' | 'ghost' | 'ghostStorm' | 'soak')[] = ['roles', 'rolesMoving', 'flank', 'suppress', 'ghost', 'soak'], opts: { soakSeconds?: number; stormSight?: number } = {}) {
  const t0 = performance.now();
  const out: Record<string, unknown> = { level: game.setting, nodes: game.nav.nodes.length, cover: game.level.data.coverPoints.length, sight: game.ctx.sightRange ?? null };
  for (const k of which) {
    if (k === 'roles') out.roles = roles(game);
    if (k === 'rolesMoving') out.rolesMoving = roles(game, 40, true);
    if (k === 'flank') out.flank = flank(game);
    if (k === 'suppress') out.suppress = suppress(game);
    if (k === 'ghost') out.ghost = ghost(game);
    if (k === 'ghostStorm') out.ghostStorm = ghost(game, { sight: opts.stormSight ?? 14 });
    if (k === 'soak') out.soak = soak(game, opts.soakSeconds ?? 120);
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}
