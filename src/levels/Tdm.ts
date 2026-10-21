import { fl } from '../ui/Flavor';
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { ModeRules, TdmData } from './Level';
import { Gunner, Runner, type EnemyCtx, type TacticalEnemy } from '../enemies/Enemy';
import { Squad } from '../enemies/tactics/Squad';
import { ThinkScheduler } from '../enemies/tactics/Scheduler';
import { ArenaGunner, ArenaRunner, isArenaBot } from '../enemies/arena/ArenaBots';
import { ArenaDirector } from '../enemies/arena/ArenaDirector';
import { Sensing } from '../enemies/arena/Sensing';
import { ARENA, newArenaStats, type ArenaCtx, type ArenaStats } from '../enemies/arena/ArenaCtx';
import type { DeathmatchBrain } from '../enemies/arena/DeathmatchAI';
import type { Spot } from '../enemies/arena/ArenaDirector';
import { PlayerSense } from '../enemies/arena/PlayerSense';
import type { SenseAgent } from '../enemies/arena/Sensing';
import { TdmMinimap, spotAlpha, type MapDot } from '../ui/TdmMinimap';
import { ARENA_SEE, fogRange } from '../world/Visibility';
import { RANGED_ONLY, filterRoster, type RosterRequest, type Slot as RosterSlot, type UnitKind } from '../enemies/Roster';
import { otherTeam, TEAMS, type Combatant, type TeamId } from '../combat/Team';
import { DESERT_GARRISON } from '../entities/enemies/mercs';
import { OPERATORS } from '../entities/enemies/operators';
import { ARMORY, dealArm, type BotArm, type WeaponId } from '../entities/weapons/armory';
import { dealCallsigns } from '../enemies/Callsigns';
import { rand } from '../core/math';
import type { TdmLine } from '../ui/TdmHud';

/*
  Team Deathmatch, 5v5 (6.0): ALPHA (the player and four bots) against OMEGA (five bots). Each team
  has a shared pool of tickets; every death costs its team one; the dead respawn at their base after
  3–5 s while their team still has tickets; the first team to run out loses.

  Two squad directors (one per team) share one ThinkScheduler: one frame budget of decides, rays,
  cover searches and path re-plans for all nine bots, picked most-overdue-first across both teams.
  Each bot runs with its own team's context (squad, hostiles, friends, lanes): the same 5.0 brain,
  pointed at a different set of hostiles.

  7.0: by default the bots run the arena AI instead (enemies/arena: a deathmatch brain per bot, an
  arena director per team, attention-driven sensing; the same bodies). `TDM.ai = 'tactical'` brings
  back the 6.0 path exactly, for comparisons. The match rules are the same either way.

  12.0, shared team spotting: the human is a viewer in the same sensing pass as the bots, so a hostile
  in anyone's line of sight on ALPHA (his or a bot's) is spotted for all of ALPHA — a red dot on his
  minimap that fades 2.5 s after the last sighting, and a contact on the bots' board (which they push
  and flank on). OMEGA's bots share theirs the same way.
*/

export const TDM = {
  tickets: 25,
  respawn: [3, 5] as [number, number],
  /** The player's respawn delay (inside the 3–5 s window; long enough to read the killer). */
  playerRespawn: 4,
  /** Spawn protection (s). */
  protect: 2,
  /** Damage of a bot's round to another bot (survival bolts only ever meet the player: 10). */
  botDamage: 20,
  /** Bots' difficulty (speed, damage step): wave 3 of survival. */
  difficulty: 2,
  /** 7.0: which brain the bots run — the arena AI, or the 6.0 tactical squads (A/B checks). */
  ai: 'arena' as 'arena' | 'tactical',
  /**
   * 8.0: the units this mode asks for. Ranged only: in the 7.0 playtest the blades just fed tickets
   * to the other team in a firefight. Survival keeps its own compositions (runners and gunners).
   */
  roster: RANGED_ONLY as RosterRequest,
  /**
   * 8.1: no barks in TDM (text or voice), either brain: in a competitive mode a callout over an
   * enemy's head, or his shout behind a wall, gives his position away. Survival keeps them.
   */
  barks: false,
  /** 12.0: shared team spotting for the human (his eyes in the sensing pass) and the minimap. Off: the 11.0 callout rays (perf A/B). */
  spotting: true,
  /**
   * 13.0: the guns the arena bots are dealt at each spawn: 'random' (the armory, at most `armCap` of
   * one gun on a team at once, so a squad is never five shotguns), or one weapon for everyone (A/B).
   */
  arms: 'random' as 'random' | WeaponId,
  armCap: 2,
  /**
   * 14.0: what the bots wear. 'operators': matte gear with team-coloured accents (visor, shoulder
   * patches, spine) on every map; 'legacy': 6.0–13.0 (ALPHA the desert garrison, OMEGA the level's
   * survival enemies: the docks' glowing synths), for side-by-side checks.
   */
  skins: 'operators' as 'operators' | 'legacy',
  /** 13.0: the loadout picker stays up (and a pick swaps at once) this long into a match (s). */
  loadoutGrace: 3,
};

/** The 5.0 scheduler defaults (the tactical path restores them). */
const TACTICAL_SCHED = { maxPerFrame: 3, rayBudget: 30, routesPerFrame: 2 };

interface Slot {
  team: TeamId;
  name: string;
  kind: UnitKind;
  bot: TacticalEnemy | null;
  respawnAt: number;
  kills: number;
  deaths: number;
  /** 13.0: the gun it was dealt for its current (or last) life. */
  arm: BotArm | null;
}

/**
 * The kind each slot was designed as (6.0). What actually spawns is this filtered through
 * `TDM.roster` (8.0: the blades fight with rifles). 13.0: the names are no longer fixed: every match
 * deals ten different callsigns from one pool to both teams (enemies/Callsigns.ts).
 */
const ROSTER: Record<TeamId, RosterSlot[]> = {
  alpha: [['', 'gunner'], ['', 'gunner'], ['', 'gunner'], ['', 'runner']],
  omega: [['', 'gunner'], ['', 'gunner'], ['', 'gunner'], ['', 'gunner'], ['', 'runner']],
};

/** One kill, for the report and the checks. */
export interface KillRecord {
  t: number;
  killer: string;
  killerTeam: TeamId | null;
  killerKind: string;
  killerRole: string;
  victim: string;
  victimTeam: TeamId;
  victimKind: string;
  victimAction: string;
  dist: number;
  /** 14.0: the killer's feet height (which floor the kill came from). */
  killerY?: number;
  /** 15.0: where the victim died (lane reports). */
  victimPos?: [number, number, number];
  /** 13.0: the killer's gun (armory tag: SMG, AR, SG), '-' for a blade or the world. */
  weapon: string;
  /** The killer was more than 90° off where the victim faced (taken from the side or behind). */
  flank: boolean;
  /** 8.0: the level zone the victim died in (match-flow reports). */
  zone?: string;
}

export class TdmRules implements ModeRules {
  sched = new ThinkScheduler();
  squads: Record<TeamId, Squad> = { alpha: new Squad({ team: 'alpha', sched: this.sched }), omega: new Squad({ team: 'omega', sched: this.sched }) };
  ctxs!: Record<TeamId, EnemyCtx>;
  /** Every bot body in the world (both teams, the dying included). */
  bots: TacticalEnemy[] = [];
  slots: Slot[] = [];
  tickets: Record<TeamId, number> = { alpha: TDM.tickets, omega: TDM.tickets };
  player = { kills: 0, deaths: 0 };
  winner: TeamId | null = null;
  private endT = 0;
  private startT = 0;
  playerRespawnAt = Infinity;
  private killerName: string | null = null;
  private hostiles: Record<TeamId, Combatant[]> = { alpha: [], omega: [] };
  private friends: Record<TeamId, Combatant[]> = { alpha: [], omega: [] };
  private spotT = 0;
  kills: KillRecord[] = [];
  /** 13.0: the player's gun per life, for the kill feed and the record. */
  playerArm: () => BotArm = () => ARMORY.ar.bot;
  /** Damage dealt between teammates (must stay 0: friendly fire is off by construction). */
  friendlyDamage = 0;
  /**
   * DEV: the player watches (bot-vs-bot checks): nobody targets him, he isn't in ALPHA's squad, and
   * his deaths (there are none: checks run him in god mode) wouldn't count.
   */
  spectate = false;
  /** The brain this match runs (TDM.ai at its start). */
  ai: 'arena' | 'tactical' = TDM.ai;
  directors: Record<TeamId, ArenaDirector> | null = null;
  sensing: Sensing | null = null;
  arenaStats: ArenaStats = newArenaStats();
  private brains: DeathmatchBrain[] = [];
  /** 12.0: the human's eyes in the sensing pass, and everyone who looks this frame. */
  private playerSense: PlayerSense | null = null;
  private viewers: SenseAgent[] = [];
  /** 12.0: the minimap (built once per level) and its markers. */
  private minimap: TdmMinimap | null = null;
  private mapLevel: unknown = null;
  private spots: Spot[] = [];
  private allyDots: MapDot[] = [];
  private hostileDots: MapDot[] = [];
  /** DEV: time spent drawing the minimap (ms, summed) and the frames it was drawn. */
  mapMs = 0;
  mapFrames = 0;

  constructor(private game: Game) {}

  private get data(): TdmData {
    const d = this.game.level.data.tdm;
    if (!d) throw new Error(`${this.game.setting} has no Team Deathmatch layout`);
    return d;
  }

  private get now() {
    return this.game.elapsed;
  }

  // ------------------------------------------------------------------ match
  begin() {
    const g = this.game;
    this.clearBots();
    this.tickets = { alpha: TDM.tickets, omega: TDM.tickets };
    this.player = { kills: 0, deaths: 0 };
    this.winner = null;
    this.kills = [];
    this.friendlyDamage = 0;
    this.playerRespawnAt = Infinity;
    this.startT = this.now;
    for (const t of TEAMS) {
      this.squads[t].reset();
      this.squads[t].barks.enabled = TDM.barks;
    }
    this.squads.alpha.human = this.spectate || TDM.ai === 'arena' ? null : g.playerUnit;
    this.ai = TDM.ai;
    Object.assign(this.sched, this.ai === 'arena' ? ARENA.sched : TACTICAL_SCHED);
    this.sched.resetStats();
    if (this.ai === 'arena') this.beginArena();
    else {
      // Back to the 6.0 path (an A/B after an arena match): nothing of the arena may linger.
      this.directors = null;
      this.sensing = null;
      this.playerSense = null;
    }
    this.minimap?.show(this.ai === 'arena' && TDM.spotting);
    g.ctx.difficulty = TDM.difficulty;
    g.ctx.enemies = this.bots;
    this.ctxs = { alpha: this.makeCtx('alpha'), omega: this.makeCtx('omega') };
    // Rounds: hostile bots are hit or suppressed (in their own team's context); teammates passed through.
    g.projectiles.targets = {
      bots: this.bots,
      damage: TDM.botDamage,
      hit: (e, dmg, dir, point, by) => {
        if (by && by.team === e.team) this.friendlyDamage += dmg;
        if (isArenaBot(by) && e.alive) by.brain.onDealt(e, dmg, this.now);
        e.takeHit(dmg, dir, point, this.ctxs[e.team], by);
      },
      nearMiss: (e, dose, by) => (isArenaBot(e) ? e.brain.onNearMiss(this.ctxs[e.team], by) : e.suppress(dose, this.ctxs[e.team])),
    };
    // 11.0 (stats): every tagged round that lands, by how it was fired and from how far.
    g.projectiles.onTaggedHit = (_by, aimed, range) => (aimed ? this.arenaStats.aimedHitRange : this.arenaStats.hipHitRange).push(range);
    // The other team hears every shot.
    g.projectiles.onFire = (from, by) => {
      if (!by) return;
      if (this.directors) this.directors[otherTeam(by.team)].heard(from, by, this.now, this.friends[otherTeam(by.team)]);
      else this.squads[otherTeam(by.team)].hearShot(from, by);
    };
    const st = this.data.start;
    g.player.reset(st.x, st.z, st.yaw, st.y);
    g.safety.reset(g.player.pos);
    g.playerInvulnUntil = this.now + TDM.protect;
    g.playerAttacker = null;
    g.weapon.raiseTarget = 1;
    g.weapon.setHolstered(false, true);
    g.storyHud.show(false);
    g.tdmHud.clear();
    g.tdmHud.setMax(TDM.tickets);
    g.tdmHud.show(true);
    g.hud.root.classList.add('tdm');
    this.slots = [];
    const n = TEAMS.reduce((k, t) => k + ROSTER[t].length, 0);
    const names = dealCallsigns(n, [g.playerUnit.name]);
    for (const team of TEAMS) for (const [, kind] of filterRoster(ROSTER[team], TDM.roster)) this.slots.push({ team, name: names.shift()!, kind, bot: null, respawnAt: 0, kills: 0, deaths: 0, arm: null });
    for (const s of this.slots) this.spawn(s);
    g.hud.bannerShow('TEAM DEATHMATCH', fl('tdmBanner'), 2.6);
  }

  /** 7.0: a director per team, the shared sensing pass, vault links on the graph (once per level). */
  private beginArena() {
    const g = this.game;
    const d = this.data;
    const centre = (ps: THREE.Vector3[]) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));
    const base = { alpha: centre(d.spawns.alpha), omega: centre(d.spawns.omega) };
    this.directors = {
      alpha: new ArenaDirector('alpha', base.alpha, base.omega, d.lanes.alpha),
      omega: new ArenaDirector('omega', base.omega, base.alpha, d.lanes.omega),
    };
    const conceal = g.ctx.concealment;
    this.sensing = new Sensing(
      (a, b) => {
        this.sched.spend(1);
        return g.col.lineOfSight(a, b);
      },
      conceal ? (a, b) => conceal(a, b) < 0.35 : undefined,
    );
    this.arenaStats = newArenaStats();
    this.brains = [];
    this.playerSense = TDM.spotting ? new PlayerSense(g.playerUnit) : null;
    g.nav.ensureVaultLinks();
    // The minimap's floor plan comes from the level's collision world: drawn once per level.
    if (this.mapLevel !== g.level) {
      this.minimap?.dispose();
      this.minimap = new TdmMinimap(g.tdmHud.root, g.col.colliders, g.level.data.bounds);
      this.mapLevel = g.level;
    }
  }

  /** A team context: the game's (read live through the prototype: time, sight, cover…) plus the team's own. */
  private makeCtx(team: TeamId): EnemyCtx {
    const g = this.game;
    const c = Object.create(g.ctx) as EnemyCtx;
    const other = otherTeam(team);
    Object.assign(c, {
      team,
      squad: this.squads[team],
      hostiles: this.hostiles[team],
      friends: this.friends[team],
      enemies: this.bots,
      lanes: this.data.lanes[team],
      avoid: (p: THREE.Vector3) => this.data.inBase(other, p),
      onDeath: (v: Combatant, by: Combatant | null) => this.onDeath(v, by),
    } satisfies Partial<EnemyCtx>);
    c.arena = this.directors && this.sensing ? ({ director: this.directors[team], sensing: this.sensing, sched: this.sched, stats: this.arenaStats } satisfies ArenaCtx) : undefined;
    return c;
  }

  private spawn(s: Slot) {
    const g = this.game;
    const at = this.spawnPoint(s.team);
    const look = TDM.skins === 'operators' ? OPERATORS[s.team] : s.team === 'alpha' ? DESERT_GARRISON : g.level.info.enemies;
    const arena = this.ai === 'arena';
    // 13.0: a gun from the armory for this life (the 6.0 tactical bodies keep their own rifle).
    s.arm = arena && s.kind === 'gunner' ? this.dealArm(s.team) : null;
    const e: TacticalEnemy =
      s.kind === 'runner'
        ? arena ? new ArenaRunner(at, TDM.difficulty, look) : new Runner(at, TDM.difficulty, look)
        : arena ? new ArenaGunner(at, TDM.difficulty, g.scene, look, s.arm!) : new Gunner(at, TDM.difficulty, g.scene, null, look);
    e.team = s.team;
    e.name = s.name;
    e.invulnUntil = this.now + TDM.protect;
    // Facing the other base (enemy yaw: forward = (sin, cos); ALPHA's base is in the south).
    e.yaw = s.team === 'alpha' ? Math.PI : 0;
    g.scene.add(e.rig.root);
    this.bots.push(e);
    s.bot = e;
  }

  /**
   * 13.0: a gun for a bot spawning on `team`: uniform over the armory, but never a third of one gun
   * on a team at once (a squad of all shotguns, or all rifles, is no firefight to read).
   */
  private dealArm(team: TeamId): BotArm {
    if (TDM.arms !== 'random') return ARMORY[TDM.arms].bot;
    const held: WeaponId[] = [];
    for (const s of this.slots) if (s.team === team && s.bot && s.arm) held.push(s.arm.id);
    return dealArm(held, TDM.armCap);
  }

  /** The base spawn furthest from every hostile, not on top of a body. */
  private spawnPoint(team: TeamId): THREE.Vector3 {
    const pts = this.data.spawns[team];
    let best = pts[0], bs = -Infinity;
    for (const p of pts) {
      if (this.bots.some((b) => b.alive && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 1.4)) continue;
      if (team === 'alpha' && Math.hypot(this.game.player.pos.x - p.x, this.game.player.pos.z - p.z) < 1.4) continue;
      let near = Infinity;
      for (const h of this.hostilesNow(team)) near = Math.min(near, h.pos.distanceTo(p));
      const s = Math.min(near, 80) + Math.random() * 3;
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best.clone();
  }

  private hostilesNow(team: TeamId): Combatant[] {
    const out: Combatant[] = this.bots.filter((b) => b.alive && b.team !== team);
    if (team === 'omega' && this.game.player.alive) out.push(this.game.playerUnit);
    return out;
  }

  private slotOf(c: Combatant) {
    return this.slots.find((s) => s.bot === c) ?? null;
  }

  /** 13.0: the gun a combatant fights with (the player's loadout, a bot's dealt arm), or null (a blade). */
  private armOf(c: Combatant): BotArm | null {
    if (c.isPlayer) return this.playerArm();
    return isArenaBot(c) && c.kind === 'gunner' ? c.arm : null;
  }

  /** Someone died: a ticket off their team, the feed, kill credit, their respawn, maybe the end. */
  private onDeath(v: Combatant, by: Combatant | null) {
    const g = this.game;
    if (this.winner) return;
    this.tickets[v.team] = Math.max(0, this.tickets[v.team] - 1);
    const weapon = by ? this.armOf(by)?.tag : undefined;
    g.tdmHud.kill(by, v, weapon);
    const vs = this.slotOf(v);
    if (vs) {
      vs.deaths++;
      vs.bot = null;
      vs.respawnAt = this.now + rand(TDM.respawn[0], TDM.respawn[1]);
    }
    if (by) {
      if (by.isPlayer) this.player.kills++;
      else {
        const ks = this.slotOf(by);
        if (ks) ks.kills++;
      }
    }
    // The record (for the report): who, how far, from where.
    const facing = v.facing(new THREE.Vector2());
    const flank = by ? facing.x * (by.pos.x - v.pos.x) + facing.y * (by.pos.z - v.pos.z) < 0 : false;
    const kb = by as Partial<TacticalEnemy> | null;
    const vb = v as Partial<TacticalEnemy>;
    this.kills.push({
      t: +(this.now - this.startT).toFixed(1),
      killer: by?.name ?? 'world',
      killerTeam: by?.team ?? null,
      killerKind: by ? (by.isPlayer ? 'player' : (kb?.kind ?? '?')) : '-',
      killerRole: kb?.tac?.role ?? (by?.isPlayer ? this.squads.alpha.humanStyle : '-'),
      victim: v.name,
      victimTeam: v.team,
      victimKind: v.isPlayer ? 'player' : (vb.kind ?? '?'),
      victimAction: vb.tac ? `${vb.tac.action}/${vb.tac.phase}` : '-',
      dist: by ? +by.pos.distanceTo(v.pos).toFixed(1) : 0,
      weapon: weapon ?? '-',
      killerY: by ? +by.pos.y.toFixed(1) : undefined,
      victimPos: [+v.pos.x.toFixed(1), +v.pos.y.toFixed(1), +v.pos.z.toFixed(1)],
      flank,
      zone: g.level.data.zoneAt(v.pos.x, v.pos.y, v.pos.z)?.name,
    });
    if (this.directors) {
      this.directors[otherTeam(v.team)].hostileDied(v, this.now);
      this.directors[v.team].friendDied(v, this.now);
      this.sensing?.forget(v.uid);
      if (isArenaBot(by)) {
        if (by.brain.state === 'push' && by.brain.target === v) this.arenaStats.pushKills++;
        if (by.brain.flankedOn === v.uid) this.arenaStats.flankKills++;
        by.bark('kill', this.ctxs[by.team]);
      }
    } else this.squads[otherTeam(v.team)].hostileDied(v, by && !by.isPlayer ? (by as TacticalEnemy) : null);
    if (this.tickets[v.team] <= 0) this.end(otherTeam(v.team));
  }

  /** The player died: the mode respawns him (Game shows the countdown instead of the death screen). */
  onPlayerDeath(): boolean {
    const g = this.game;
    this.player.deaths++;
    this.killerName = g.playerAttacker?.name ?? null;
    this.onDeath(g.playerUnit, g.playerAttacker);
    this.playerRespawnAt = this.now + TDM.playerRespawn;
    return true;
  }

  private end(winner: TeamId) {
    this.winner = winner;
    this.endT = this.now;
    this.game.timeScale = 0.4;
    this.game.hud.bannerShow(winner === 'alpha' ? 'VICTORY' : 'DEFEAT', fl(winner === 'alpha' ? 'victory' : 'defeat'), 3);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const g = this.game;
    if (dt <= 0) return;
    const now = this.now;
    // Who each team fights, and whom it must not shoot through.
    for (const t of TEAMS) {
      const h = this.hostiles[t], f = this.friends[t];
      h.length = f.length = 0;
      for (const b of this.bots) if (b.alive) (b.team === t ? f : h).push(b);
      if (!this.spectate) (t === 'alpha' ? f : h).push(g.playerUnit);
    }
    if (this.directors) this.arenaFrame(now);
    else
      Squad.updateAll(this.sched, [
        { squad: this.squads.alpha, ctx: this.ctxs.alpha, agents: this.bots.filter((b) => b.team === 'alpha') },
        { squad: this.squads.omega, ctx: this.ctxs.omega, agents: this.bots.filter((b) => b.team === 'omega') },
      ]);
    for (const b of this.bots) b.update(dt, this.ctxs[b.team]);
    for (let i = this.bots.length - 1; i >= 0; i--) {
      if (this.bots[i].dead) {
        this.bots[i].dispose(g.scene);
        this.bots.splice(i, 1);
      }
    }
    if (!this.winner) {
      for (const s of this.slots) if (!s.bot && now >= s.respawnAt && this.tickets[s.team] > 0) this.spawn(s);
      if (g.state === 'dead' && now >= this.playerRespawnAt && this.tickets.alpha > 0) this.respawnPlayer();
      // 7.0's callouts (rays from his camera); 12.0's arena has him in the sensing pass instead.
      if (!this.spectate && (!this.directors || !TDM.spotting)) this.spot(dt);
    } else if (g.state !== 'ending' && now - this.endT > 1.2) this.finish();
    g.tdmHud.setTickets(this.tickets.alpha, this.tickets.omega);
    g.tdmHud.setRespawn(g.state === 'dead' && !this.winner ? this.playerRespawnAt - now : null, this.killerName);
    g.tdmHud.update(dt, g.camera, this.friends.alpha);
    if (this.directors && this.minimap && TDM.spotting) {
      const t0 = performance.now();
      this.drawMap(now);
      this.mapMs += performance.now() - t0;
      this.mapFrames++;
    }
  }

  /** 12.0: the minimap: ALPHA's bots, and every hostile ALPHA has spotted (fading once lost). */
  private drawMap(now: number) {
    const g = this.game;
    const allies = this.allyDots, hostiles = this.hostileDots;
    allies.length = hostiles.length = 0;
    for (const b of this.bots) if (b.alive && b.team === 'alpha') allies.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, a: 1 });
    for (const s of this.directors!.alpha.spotted(now, this.spots)) hostiles.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, a: spotAlpha(s.age, ARENA.spot.fade) });
    this.minimap!.draw(g.player.pos, g.player.yaw, allies, hostiles, g.playerUnit.name);
  }

  /**
   * 7.0, the arena AI's heavy half: sensing (every due sightline, most important first, one ray
   * budget), the board, both directors, then the decides the scheduler hands out — urgent first (a
   * hostile just came into view, a hit), so a sighting is acted on the frame it is made.
   */
  private arenaFrame(now: number) {
    const dirs = this.directors!;
    const brains = this.brains;
    brains.length = 0;
    for (const b of this.bots) if (b.alive && isArenaBot(b)) brains.push(b.brain);
    // 12.0: the human looks too (his team's spotting), in the same pass and budget.
    const viewers = this.viewers;
    viewers.length = 0;
    for (const br of brains) viewers.push(br);
    const ps = this.playerSense;
    if (ps && !this.spectate && this.game.player.alive) viewers.push(ps);
    else ps?.reset();
    this.sensing!.update(
      now,
      viewers,
      (a) => this.hostiles[a.self.team],
      (a, h) => dirs[a.self.team].isHot(h.uid, now),
      // The arena sees only what a player could pick out of the scene's fog (world/Visibility.ts).
      this.game.fog.density > 0 ? fogRange(this.game.fog.density, ARENA_SEE) : undefined,
    );
    // What anyone sees goes on the team's board (who saw it, from where: the flankers read that).
    for (const v of viewers) {
      for (const h of this.hostiles[v.self.team]) if (h.alive && v.seen.get(h.uid)?.vis) dirs[v.self.team].sighting(h, now, 'sight', v.self);
    }
    for (const t of TEAMS) {
      const enemyAlive = this.hostiles[t].filter((h) => h.alive).length;
      dirs[t].update(now, this.friends[t], enemyAlive, { own: this.tickets[t], theirs: this.tickets[otherTeam(t)] });
    }
    for (const br of this.sched.pick(brains, now)) br.decide(this.ctxs[br.self.team]);
  }

  /**
   * What the player sees, his team knows: every 0.4 s, up to three hostile bots in front of his
   * camera (within ~55° of where he looks, in sight range) are checked with a ray and reported to
   * the ALPHA director as sightings. That's how the bots act on contacts he makes.
   */
  private spot(dt: number) {
    const g = this.game;
    this.spotT -= dt;
    if (this.spotT > 0 || !g.player.alive) return;
    this.spotT = 0.4;
    const eye = g.camera.position;
    const fwd = g.camera.getWorldDirection(new THREE.Vector3());
    const range = Math.min(g.ctx.sightRange ?? 70, 70);
    let rays = 0;
    const head = new THREE.Vector3();
    for (const b of this.hostiles.alpha) {
      if (rays >= 3 || !b.alive) continue;
      head.set(b.pos.x, b.pos.y + b.headY, b.pos.z);
      const d = head.distanceTo(eye);
      if (d > range || fwd.dot(head.clone().sub(eye).divideScalar(d)) < 0.57) continue;
      rays++;
      if (!g.col.lineOfSight(eye, head)) continue;
      if (this.directors) this.directors.alpha.sighting(b, this.now, 'callout');
      else this.squads.alpha.sighting(null, b.pos, b.vel, b);
    }
  }

  private respawnPlayer() {
    const g = this.game;
    const p = this.spawnPoint('alpha');
    g.revive(p, 0);
    g.playerInvulnUntil = this.now + TDM.protect;
    this.playerRespawnAt = Infinity;
    this.killerName = null;
  }

  private finish() {
    const g = this.game;
    const lines: TdmLine[] = [
      { name: g.playerUnit.name, team: 'alpha', you: true, kills: this.player.kills, deaths: this.player.deaths, weapon: this.playerArm().tag },
      ...this.slots.map((s) => ({ name: s.name, team: s.team, you: false, kills: s.kills, deaths: s.deaths, weapon: s.arm?.tag ?? '' })),
    ];
    g.finishTdm(this.winner === 'alpha', { ...this.tickets }, lines, this.endT - this.startT);
  }

  updateEnding(dt: number) {
    // The world carries on behind the result (slow motion), nobody respawns.
    this.update(dt);
  }

  onGunshot() {
    const g = this.game;
    if (this.spectate) return;
    if (this.directors) {
      this.directors.omega.heard(g.player.pos, g.playerUnit, this.now, this.friends.omega);
      return;
    }
    this.squads.omega.hearShot(g.player.pos, g.playerUnit);
    this.squads.alpha.humanObs.shot(this.now);
  }

  musicIntensity(): number {
    if (this.winner) return 0.2;
    if (this.directors) {
      const now = this.now;
      const hot = TEAMS.some((t) => [...this.directors![t].contacts.values()].some((c) => now - c.seenT < 2));
      return hot ? 0.8 : 0.45;
    }
    const fight = this.squads.alpha.mode === 'engage' || this.squads.omega.mode === 'engage';
    return fight ? 0.8 : 0.45;
  }

  private clearBots() {
    const g = this.game;
    for (const b of this.bots) b.dispose(g.scene);
    this.bots.length = 0;
    for (const s of this.slots) s.bot = null;
  }

  reset() {
    this.clearBots();
    for (const t of TEAMS) this.squads[t].reset();
    this.directors = null;
    this.sensing = null;
    // 13.0: nothing of the match may hold on to its bodies or the player (a map change frees the level).
    this.playerSense = null;
    this.brains.length = this.viewers.length = this.spots.length = 0;
    this.allyDots.length = this.hostileDots.length = 0;
    for (const t of TEAMS) this.hostiles[t].length = this.friends[t].length = 0;
    this.game.tdmHud.clear();
  }

  /**
   * 13.0: the level is being freed (a map change, back to the menu): drop everything built on it —
   * the minimap (its floor plan canvas and DOM), the team contexts (they inherit the old enemy
   * context: its scene, collision world and nav graph).
   */
  dropLevel() {
    this.reset();
    this.slots = [];
    this.kills = [];
    this.minimap?.dispose();
    this.minimap = null;
    this.mapLevel = null;
    this.ctxs = undefined as unknown as Record<TeamId, EnemyCtx>;
    this.arenaStats = newArenaStats();
  }

  toTitle() {
    const g = this.game;
    this.reset();
    this.minimap?.show(false);
    this.squads.alpha.human = null;
    g.tdmHud.show(false);
    g.hud.root.classList.remove('tdm');
    if (g.projectiles) {
      g.projectiles.targets = null;
      g.projectiles.onFire = () => {};
      g.projectiles.onTaggedHit = null;
    }
    g.ctx.enemies = g.waves.enemies;
  }

  death() {
    return { story: false, kills: this.player.kills };
  }

  /** DEV: a snapshot for checks and the report. */
  debug() {
    return {
      tickets: { ...this.tickets },
      winner: this.winner,
      alive: { alpha: this.bots.filter((b) => b.alive && b.team === 'alpha').length, omega: this.bots.filter((b) => b.alive && b.team === 'omega').length },
      ai: this.ai,
      modes: this.directors ? { alpha: this.directors.alpha.stance, omega: this.directors.omega.stance } : { alpha: this.squads.alpha.mode, omega: this.squads.omega.mode },
      momentum: this.directors ? { alpha: +this.directors.alpha.momentum.toFixed(2), omega: +this.directors.omega.momentum.toFixed(2) } : null,
      sensing: this.sensing ? { ...this.sensing.stats } : null,
      human: this.squads.alpha.humanStyle,
      humanRates: this.squads.alpha.humanObs.rates,
      sched: { ...this.sched.stats },
      friendlyDamage: this.friendlyDamage,
      kills: this.kills.length,
    };
  }
}
