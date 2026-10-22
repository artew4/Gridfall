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
import { ARENA, applyProfile, newArenaStats, type ArenaCtx, type ArenaStats } from '../enemies/arena/ArenaCtx';
import type { DeathmatchBrain } from '../enemies/arena/DeathmatchAI';
import type { Spot } from '../enemies/arena/ArenaDirector';
import { PlayerSense } from '../enemies/arena/PlayerSense';
import type { SenseAgent } from '../enemies/arena/Sensing';
import { TdmMinimap, spotAlpha, type MapDot } from '../ui/TdmMinimap';
import { ARENA_SEE, fogRange } from '../world/Visibility';
import { RANGED_ONLY, filterRoster, type RosterRequest, type Slot as RosterSlot, type UnitKind } from '../enemies/Roster';
import { otherTeam, TEAMS, type Combatant, type TeamId } from '../combat/Team';
import { DESERT_GARRISON } from '../entities/enemies/mercs';
import { OPERATOR_KITS, type OperatorKit } from '../entities/enemies/operators';
import { gunThemeFor, themedArm, themeRigGun } from '../entities/weapons/theme';
import { ARMORY, dealArm, type BotArm, type WeaponId } from '../entities/weapons/armory';
import { dealCallsigns } from '../enemies/Callsigns';
import { rand } from '../core/math';
import type { BoardLine, TdmLine } from '../ui/TdmHud';
import { SpawnManager, ZoneSpawner, deployZones, laneNeed, sideOf, type DeployZone, type SpawnPad, type SpawnUnit } from './SpawnManager';
import { SpawnZoneVisual } from '../world/SpawnZoneVisual';
import { MatchRules, type Outcome } from './LastStand';
import { SpawnPads } from '../world/SpawnPads';

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

const _eye = new THREE.Vector3();
const _eye2 = new THREE.Vector3();

export const TDM = {
  /** 29.0: respawns per team (a death with none left is final): 50, whatever the team size. */
  tickets: 50,
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
  /** 19.0 (DEV, self-play): force the team size, the tickets, or the map's AI profile off, whatever the map says. */
  force: { size: null as number | null, tickets: null as number | null, noProfile: false, noForward: false, kit: null as OperatorKit | null },
  /**
   * 27.0: where a map with spawn pads (TdmData.pads) spawns: 'dynamic', scored over every pad at each
   * respawn (SpawnManager); 'bases' (DEV A/B), the two yards and 19.0's forward points as before.
   * 31.0: 'zones' (the default), each team's 2-3 deployment zones (TdmData.zones, ZoneSpawner); the
   * pads and the yards stay as DEV comparisons.
   */
  spawns: 'zones' as 'zones' | 'dynamic' | 'bases',
};

/** 19.0: the team size of the loaded map (the player counts on ALPHA). */
export function teamSizeOf(info: { teamSize?: number }) {
  return TDM.force.size ?? info.teamSize ?? 5;
}

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
 * The kind each slot was designed as (6.0): gunners and one runner a team. What actually spawns is
 * this filtered through `TDM.roster` (8.0: the blades fight with rifles). 13.0: the names are no
 * longer fixed: every match deals callsigns from one pool to both teams (enemies/Callsigns.ts).
 * 19.0: sized by the map (`LevelInfo.teamSize`); ALPHA's bots leave a place for the player, unless
 * he only watches (self-play: then a bot takes it, and the sides are even).
 */
function roster(bots: number): RosterSlot[] {
  return Array.from({ length: bots }, (_, i) => ['', i === bots - 1 ? 'runner' : 'gunner'] as RosterSlot);
}

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
  /** 29.0: the win condition (tickets are respawns; elimination; sudden death): LastStand.ts. */
  rules = new MatchRules(TDM.tickets);
  /** Each team's respawns left (the rules' own). */
  get tickets(): Record<TeamId, number> {
    return this.rules.tickets;
  }
  player = { kills: 0, deaths: 0 };
  winner: TeamId | 'draw' | null = null;
  /** 29.0: how the match was decided. */
  outcome: Outcome | null = null;
  /** 29.0: the player is out (his team had no tickets when he died): he watches a teammate. */
  spectating: TacticalEnemy | null = null;
  private specOn = false;
  private specLook = { yaw: 0, pitch: 0, init: false };
  private specDeadAt: number | null = null;
  private mousePrev = { l: false, r: false };
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
  /** 19.0: this match's tickets per team (the map's, else TDM.tickets; a DEV force beats both). */
  ticketMax = TDM.tickets;
  /** 19.0: puts back the ARENA values the map's profile changed (set while a match runs). */
  private unprofile: (() => void) | null = null;

  begin() {
    const g = this.game;
    this.clearBots();
    this.ticketMax = TDM.force.tickets ?? this.data.tickets ?? TDM.tickets;
    this.forwardStats = { forward: 0, yard: 0 };
    this.rules = new MatchRules(this.ticketMax);
    this.player = { kills: 0, deaths: 0 };
    this.winner = null;
    this.outcome = null;
    this.stopSpectate();
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
    this.unprofile?.();
    this.unprofile = this.ai === 'arena' && !TDM.force.noProfile ? applyProfile(this.data.arena) : null;
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
      hit: (e, dmg, dir, point, by, knock) => {
        if (by && by.team === e.team) this.friendlyDamage += dmg;
        if (isArenaBot(by) && e.alive) by.brain.onDealt(e, dmg, this.now);
        e.takeHit(dmg, dir, point, this.ctxs[e.team], by, knock);
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
    this.setupSpawns();
    const st = this.data.start;
    g.player.reset(st.x, st.z, st.yaw, st.y);
    g.safety.reset(g.player.pos);
    g.playerInvulnUntil = this.now + TDM.protect;
    g.playerAttacker = null;
    g.weapon.raiseTarget = 1;
    g.weapon.setHolstered(false, true);
    g.storyHud.show(false);
    g.tdmHud.clear();
    g.tdmHud.setMax(this.ticketMax);
    g.tdmHud.show(true);
    g.hud.root.classList.add('tdm');
    this.slots = [];
    const size = teamSizeOf(g.level.info);
    const rosters: Record<TeamId, RosterSlot[]> = { alpha: roster(this.spectate ? size : size - 1), omega: roster(size) };
    const n = TEAMS.reduce((k, t) => k + rosters[t].length, 0);
    const names = dealCallsigns(n, [g.playerUnit.name]);
    for (const team of TEAMS) for (const [, kind] of filterRoster(rosters[team], TDM.roster)) this.slots.push({ team, name: names.shift()!, kind, bot: null, respawnAt: 0, kills: 0, deaths: 0, arm: null });
    this.openingSpawns();
    for (const s of this.slots) this.spawn(s);
    this.showStanding();
    g.hud.bannerShow('TEAM DEATHMATCH', fl('tdmBanner'), 2.6);
  }

  /** 7.0: a director per team, the shared sensing pass, vault links on the graph (once per level). */
  private beginArena() {
    const g = this.game;
    const d = this.data;
    const centre = (ps: THREE.Vector3[]) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));
    const base = { alpha: centre(d.spawns.alpha), omega: centre(d.spawns.omega) };
    this.directors = {
      alpha: new ArenaDirector('alpha', base.alpha, base.omega, d.lanes.alpha, d.laneWeights, d.laneStrict),
      // OMEGA's lanes are listed as it faces (its left is ALPHA's right): the same lanes, reversed.
      omega: new ArenaDirector('omega', base.omega, base.alpha, d.lanes.omega, d.laneWeights?.slice().reverse(), d.laneStrict?.slice().reverse()),
    };
    const conceal = g.ctx.concealment;
    this.sensing = new Sensing(
      (a, b) => {
        this.sched.spend(1);
        return g.col.lineOfSight(a, b);
      },
      conceal ? (a, b) => conceal(a, b) < 0.35 : undefined,
    );
    // 25.0: the map's ground fog caps sight; its routing bias by gun.
    this.sensing.fog = d.groundFog ?? null;
    g.nav.bias = d.navBias ?? null;
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
      // 27.0: with pads there is no enemy yard to keep out of.
      avoid: this.spawner || this.zoner ? () => false : (p: THREE.Vector3) => this.data.inBase(other, p),
      onDeath: (v: Combatant, by: Combatant | null) => this.onDeath(v, by),
    } satisfies Partial<EnemyCtx>);
    c.arena = this.directors && this.sensing ? ({ director: this.directors[team], sensing: this.sensing, sched: this.sched, stats: this.arenaStats } satisfies ArenaCtx) : undefined;
    return c;
  }

  private spawn(s: Slot, respawn = false) {
    const g = this.game;
    // 27.0: a pad (the opening's squad pad, or the scorer's pick), else the 19.0 forward point or yard.
    const pad: SpawnAt | undefined = this.spawner || this.zoner ? (respawn ? this.pickPad(s.team) : this.openAt.get(s)) : undefined;
    const at = pad?.at ?? ((respawn && this.forwardPoint(s.team)) || this.spawnPoint(s.team));
    // 20.0: the map's kit (TdmData.kit: the corporate whites on Maglev Terminal), else the night kit.
    const look = TDM.skins === 'operators' ? OPERATOR_KITS[TDM.force.kit ?? this.data.kit ?? 'night'][s.team] : s.team === 'alpha' ? DESERT_GARRISON : g.level.info.enemies;
    const arena = this.ai === 'arena';
    // 13.0: a gun from the armory for this life (the 6.0 tactical bodies keep their own rifle).
    s.arm = arena && s.kind === 'gunner' ? this.dealArm(s.team) : null;
    const e: TacticalEnemy =
      s.kind === 'runner'
        ? arena ? new ArenaRunner(at, TDM.difficulty, look) : new Runner(at, TDM.difficulty, look)
        : arena ? new ArenaGunner(at, TDM.difficulty, g.scene, look, s.arm!) : new Gunner(at, TDM.difficulty, g.scene, null, look);
    // 21.0: its gun wears the map's finish (as the player's does).
    if (arena && s.kind === 'gunner' && e.rig.weapon) themeRigGun(e.rig.weapon, gunThemeFor(g.setting));
    e.team = s.team;
    e.name = s.name;
    e.invulnUntil = this.now + TDM.protect;
    // Facing the other base (enemy yaw: forward = (sin, cos); ALPHA's base is in the south). 27.0: the pad's way.
    e.yaw = pad ? pad.yaw : s.team === 'alpha' ? Math.PI : 0;
    if (pad?.pick) this.logSpawn(s.team, pad.pick, e.uid);
    else if (respawn && !this.spawner && !this.zoner) this.logYard(s.team, at, e.uid);
    g.scene.add(e.rig.root);
    this.bots.push(e);
    s.bot = e;
  }

  /**
   * 13.0: a gun for a bot spawning on `team`: uniform over the armory, but never a third of one gun
   * on a team at once (a squad of all shotguns, or all rifles, is no firefight to read).
   */
  private dealArm(team: TeamId): BotArm {
    // 21.0: in the map's finish (kinetic rounds on a military map, Maglev's white-cyan bolts).
    const theme = gunThemeFor(this.game.setting);
    if (TDM.arms !== 'random') return themedArm(ARMORY[TDM.arms].bot, theme);
    const held: WeaponId[] = [];
    for (const s of this.slots) if (s.team === team && s.bot && s.arm) held.push(s.arm.id);
    return themedArm(dealArm(held, TDM.armCap), theme);
  }

  /** The base spawn furthest from every hostile, not on top of a body. */
  /** 27.0: the map's spawn pads and their scorer (null: the yards), the pads on the floor. */
  spawner: SpawnManager | null = null;
  private padMesh: SpawnPads | null = null;
  /** 31.0: the deployment zones and their pads on the floor (TDM.spawns 'zones'). */
  zoner: ZoneSpawner | null = null;
  /** 31.0: the zone of the last respawn picked (his toast). */
  private lastZone: DeployZone | null = null;
  private zoneVisual: SpawnZoneVisual | null = null;
  /** 27.0: the match's first spawn: where each slot (and the player) starts. */
  private openAt = new Map<Slot | 'player', SpawnAt>();
  /** 27.0 (DEV): every spawn this match: when, whose, which pad, its nearest hostile, rays, fallback. */
  spawnLog: { t: number; team: TeamId; pad: number; nearest: number; rays: number; ms: number; fallback: boolean; uid: number }[] = [];

  /**
   * 27.0: the map's pads, if it has them and TDM.spawns is 'dynamic': each pad's side of the map (by
   * progress between the old yards' centres), the scorer, and the pads on the floor (one draw call).
   */
  private setupSpawns() {
    const g = this.game;
    this.padMesh?.dispose();
    this.padMesh = null;
    this.spawner = null;
    this.zoneVisual?.dispose();
    this.zoneVisual = null;
    this.zoner = null;
    this.openAt.clear();
    this.spawnLog = [];
    if (this.setupZones()) return;
    const raw = this.data.pads;
    if (!raw?.length || TDM.spawns !== 'dynamic') return;
    const centre = (ps: THREE.Vector3[]) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));
    const a = centre(this.data.spawns.alpha), o = centre(this.data.spawns.omega);
    const lane = this.data.laneOf;
    const pads: SpawnPad[] = raw.map(([x, y, z, yaw], id) => ({ id, pos: new THREE.Vector3(x, y, z), yaw, side: sideOf({ x, z }, a, o), lane: lane ? lane(x, y + 1, z) : null }));
    this.spawner = new SpawnManager(
      pads,
      (p, q) => {
        this.sched.spend(1);
        return g.col.lineOfSight(p, q);
      },
      Math.random,
      this.data.spawnTuning,
    );
    this.padMesh = new SpawnPads(pads);
    g.scene.add(this.padMesh.mesh);
    this.minimap?.drawPads(pads.map((p) => p.pos));
    // No bases, no front: the bots search the pads and the lanes' waypoints (ArenaDirector.setPatrol).
    if (this.directors) {
      const hvas = [...pads.map((p) => p.pos), ...(this.data.hvas ?? []), ...this.data.lanes.alpha.flat()];
      for (const t of TEAMS) this.directors[t].setPatrol(hvas);
    }
  }

  /**
   * 27.0: the opening: each team in squads of two on its own side's pads (SpawnManager.opening), the
   * player first on ALPHA's first pad. Fills openAt for spawn() and puts the player on his pad.
   */
  /**
   * 31.0: the deployment zones (TDM.spawns 'zones'): each team's zones by the map's symmetry, each
   * zone's standing points checked against the level (the floor at the zone's height, room for a body,
   * in sight of the zone's centre), the scorer, the pads on the floor, the zones on the minimap, the
   * patrols' areas. False: this map has none (or another mode is asked for).
   */
  private setupZones(): boolean {
    const Z = this.data.zones;
    if (!Z || TDM.spawns !== 'zones') return false;
    const g = this.game;
    const col = g.col;
    const pointsFor = (c: THREE.Vector3, r: number) => {
      const out: THREE.Vector3[] = [];
      const chest = new THREE.Vector3(c.x, c.y + 1.2, c.z);
      for (const rr of [0, r * 0.35, r * 0.65, r * 0.95])
        for (let k = 0; k < (rr ? 8 : 1); k++) {
          const a = (k / 8) * Math.PI * 2 + rr;
          const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
          const y = col.groundHeightAt(x, z, 0.3, c.y + 1.2);
          if (!(Math.abs(y - c.y) < 0.6)) continue;
          const p = new THREE.Vector3(x, y, z);
          if (col.blocked(new THREE.Vector3(x, y + 0.05, z), 0.5, 1.8)) continue;
          if (rr && !col.lineOfSight(chest, new THREE.Vector3(x, y + 1.2, z))) continue;
          out.push(p);
        }
      return out.slice(0, 12);
    };
    const zones = deployZones(Z.half, Z.symmetry, pointsFor);
    this.zoner = new ZoneSpawner(
      zones,
      (p, q) => {
        this.sched.spend(1);
        return g.col.lineOfSight(p, q);
      },
      Math.random,
      this.data.spawnTuning,
    );
    this.zoneVisual = new SpawnZoneVisual(zones, Z.theme);
    g.scene.add(this.zoneVisual.group);
    this.minimap?.drawZones(zones.map((z) => ({ x: z.centre.x, z: z.centre.z, id: z.id, team: z.team })));
    // The patrols search both teams' zones (where the enemy comes from) and the lanes.
    if (this.directors) {
      const hvas = [...zones.map((z) => z.centre), ...(this.data.hvas ?? []), ...this.data.lanes.alpha.flat()];
      for (const t of TEAMS) this.directors[t].setPatrol(hvas);
    }
    return true;
  }

  /** 31.0: the zones (empty unless TDM.spawns is 'zones' on a map that has them). */
  zoneList(): readonly DeployZone[] {
    return this.zoner?.zones ?? [];
  }

  private openingSpawns() {
    if (this.zoner) return this.openingZones();
    const sp = this.spawner;
    if (!sp) return;
    const g = this.game;
    const members: Record<TeamId, (Slot | 'player')[]> = { alpha: this.spectate ? [] : ['player'], omega: [] };
    for (const s of this.slots) members[s.team].push(s);
    const pads = sp.opening({ alpha: members.alpha.length, omega: members.omega.length });
    const taken: THREE.Vector3[] = [];
    for (const team of TEAMS) {
      const P = pads[team];
      if (!P.length) continue;
      members[team].forEach((m, i) => {
        const pad = P[Math.min(P.length - 1, Math.floor(i / 2))];
        const at = sp.slot(pad, (q) => taken.some((t) => t.distanceTo(q) < 1));
        taken.push(at);
        this.openAt.set(m, { at, yaw: pad.yaw });
        this.padMesh?.flash(pad.id, team);
      });
    }
    const me = this.openAt.get('player');
    if (me) {
      g.player.reset(me.at.x, me.at.z, me.yaw + Math.PI, me.at.y);
      g.safety.reset(g.player.pos);
    }
  }

  /** 31.0: the opening in zones: squads of two dealt round-robin over each team's zones. */
  private openingZones() {
    const zs = this.zoner!;
    const g = this.game;
    const members: Record<TeamId, (Slot | 'player')[]> = { alpha: this.spectate ? [] : ['player'], omega: [] };
    for (const s of this.slots) members[s.team].push(s);
    const deal = zs.opening({ alpha: members.alpha.length, omega: members.omega.length });
    const taken: THREE.Vector3[] = [];
    const occupied = (q: THREE.Vector3) => taken.some((t) => t.distanceTo(q) < 1);
    for (const team of TEAMS)
      members[team].forEach((m, i) => {
        const z = deal[team][i];
        const spot = zs.slotIn(z, i, occupied);
        taken.push(spot.at);
        this.openAt.set(m, spot);
        this.zoneVisual?.flash(z);
      });
    const me = this.openAt.get('player');
    if (me) {
      g.player.reset(me.at.x, me.at.z, me.yaw + Math.PI, me.at.y);
      g.safety.reset(g.player.pos);
    }
  }

  /** 27.0: a respawn's pad for `team`, scored now against everyone alive (rays only at this moment). */
  private pickPad(team: TeamId): SpawnAt {
    const t0 = performance.now();
    const unit = (c: Combatant): SpawnUnit => {
      const f = c.facing(_face);
      return { pos: c.pos, face: { x: f.x, y: f.y } };
    };
    const hostiles = this.hostilesNow(team).map(unit);
    const allies: SpawnUnit[] = this.bots.filter((b) => b.alive && b.team === team).map(unit);
    if (team === 'alpha' && !this.spectate && this.game.player.alive) allies.push(unit(this.game.playerUnit));
    const occupied = (q: THREE.Vector3) =>
      this.bots.some((b) => b.alive && Math.hypot(b.pos.x - q.x, b.pos.z - q.z) < 1 && Math.abs(b.pos.y - q.y) < 1.5) ||
      (this.game.player.alive && Math.hypot(this.game.player.pos.x - q.x, this.game.player.pos.z - q.z) < 1);
    // The lanes the team is short of (by the map's lane weights): a pad there scores higher.
    // 31.0: by zones: the zone (safe, least used, least recent), then the spot in it.
    if (this.zoner) {
      const zp = this.zoner.pick(team, hostiles, allies, this.now, occupied);
      this.zoneVisual?.flash(zp.zone);
      this.directors?.[otherTeam(team)].heardSpawn(zp.zone.centre, this.now, this.friends[otherTeam(team)]);
      this.lastZone = zp.zone;
      return { at: zp.at, yaw: zp.pad.yaw, pick: { ...zp, ms: performance.now() - t0 } };
    }
    const lf = this.data.laneOf;
    const need = lf ? laneNeed(allies.map((u) => lf(u.pos.x, u.pos.y + 1, u.pos.z)), this.data.laneWeights ?? [1, 1, 1]) : undefined;
    const pick = this.spawner!.pick(team, hostiles, allies, this.now, occupied, need);
    this.padMesh?.flash(pick.pad.id, team);
    // The other team hears a pad come alive near them (a lead for its patrols).
    this.directors?.[otherTeam(team)].heardSpawn(pick.pad.pos, this.now, this.friends[otherTeam(team)]);
    return { at: pick.at, yaw: pick.pad.yaw, pick: { ...pick, ms: performance.now() - t0 } };
  }

  /** 27.0 (DEV): a yard respawn (the 'bases' A/B), logged as the pads' are: pad -1, its nearest hostile. */
  private logYard(team: TeamId, at: THREE.Vector3, uid: number) {
    let near = Infinity;
    for (const h of this.hostilesNow(team)) near = Math.min(near, h.pos.distanceTo(at));
    this.spawnLog.push({ t: +(this.now - this.startT).toFixed(2), team, pad: -1, nearest: +near.toFixed(1), rays: 0, ms: 0, fallback: false, uid });
  }

  private logSpawn(team: TeamId, p: { pad: SpawnPad; nearest: number; rays: number; ms: number; fallback: boolean }, uid: number) {
    this.spawnLog.push({ t: +(this.now - this.startT).toFixed(2), team, pad: p.pad.id, nearest: +p.nearest.toFixed(1), rays: p.rays, ms: +p.ms.toFixed(3), fallback: p.fallback, uid });
  }

  /** 27.0: the map's pads (empty: none, or the yards are in use). */
  spawnPadList(): readonly SpawnPad[] {
    return this.spawner?.pads ?? [];
  }

  /** 19.0 (DEV): respawns taken at a forward point, and in the yard, this match. */
  forwardStats = { forward: 0, yard: 0 };

  /**
   * 19.0: a forward respawn point (TdmData.forward), or null: the most forward of the team's points
   * that no hostile is within `safe` m of, nor sees from within `sight` m (one ray per hostile near
   * enough; respawns are rare). Never a point someone stands on.
   */
  private forwardPoint(team: TeamId): THREE.Vector3 | null {
    const F = this.data.forward;
    if (!F || TDM.force.noForward) return null;
    const own = team === 'alpha' ? 1 : -1;
    const hostiles = this.hostilesNow(team);
    let best: THREE.Vector3 | null = null, bz = Infinity;
    for (const p of F.points[team]) {
      if (this.bots.some((b) => b.alive && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 1.4)) continue;
      let ok = true;
      for (const h of hostiles) {
        const d = h.pos.distanceTo(p);
        if (d < F.safe || (d < F.sight && this.game.col.lineOfSight(_eye.set(h.pos.x, h.pos.y + 1.6, h.pos.z), _eye2.set(p.x, p.y + 1.4, p.z)))) {
          ok = false;
          break;
        }
      }
      // The most forward safe point (towards the other base); a little noise between equals.
      const z = p.z * own + Math.random() * 2;
      if (ok && z < bz) {
        bz = z;
        best = p;
      }
    }
    if (best) this.forwardStats.forward++;
    else this.forwardStats.yard++;
    return best ? best.clone() : null;
  }

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

  /**
   * Someone died: the feed, kill credit, and (29.0) a respawn if its team has a ticket to spend, else
   * out of the match. True if a respawn was granted. The end is decided once a frame (update).
   */
  private onDeath(v: Combatant, by: Combatant | null): boolean {
    const g = this.game;
    if (this.winner) return false;
    const granted = this.rules.died(v.team, this.now);
    if (by && by.team !== v.team) this.rules.killed(by.team);
    this.spawner?.noteDeath(v.pos, this.now);
    this.zoner?.noteDeath(v.pos, this.now);
    const weapon = by ? this.armOf(by)?.tag : undefined;
    // 29.0: a final death is marked OUT in the feed.
    g.tdmHud.kill(by, v, weapon, !granted);
    const vs = this.slotOf(v);
    if (vs) {
      vs.deaths++;
      vs.bot = null;
      vs.respawnAt = granted ? this.now + rand(TDM.respawn[0], TDM.respawn[1]) : Infinity;
    }
    if (by) {
      if (by.isPlayer) this.player.kills++;
      else {
        const ks = this.slotOf(by);
        if (ks) ks.kills++;
      }
    }
    this.showStanding();
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
    return granted;
  }

  /** 26.0: his team's live board on the HUD (him and every alpha slot: name, kills, deaths). */
  private showStanding() {
    // (Spectating, he is not on the team: its bots fill it.)
    const lines: BoardLine[] = this.spectate ? [] : [{ name: this.game.playerUnit.name, kills: this.player.kills, deaths: this.player.deaths, you: true }];
    for (const s of this.slots) if (s.team === 'alpha') lines.push({ name: s.name, kills: s.kills, deaths: s.deaths, you: false });
    this.game.tdmHud.setBoard(lines);
  }

  /** The player died: the mode respawns him (Game shows the countdown instead of the death screen). */
  onPlayerDeath(): boolean {
    const g = this.game;
    this.player.deaths++;
    this.killerName = g.playerAttacker?.name ?? null;
    const granted = this.onDeath(g.playerUnit, g.playerAttacker);
    this.playerRespawnAt = granted ? this.now + TDM.playerRespawn : Infinity;
    // 29.0: out of the match: no countdown, he watches the teammates still standing.
    if (!granted && !this.winner) this.startSpectate();
    return true;
  }

  /** 29.0: who is still in it per team: alive, or dead with a respawn granted. */
  standing(): Record<TeamId, number> {
    const out: Record<TeamId, number> = { alpha: 0, omega: 0 };
    for (const b of this.bots) if (b.alive) out[b.team]++;
    for (const sl of this.slots) if (!sl.bot && sl.respawnAt < Infinity) out[sl.team]++;
    if (!this.spectate && (this.game.player.alive || this.playerRespawnAt < Infinity)) out.alpha++;
    return out;
  }

  private end(o: Outcome) {
    this.outcome = o;
    this.winner = o.winner;
    this.endT = this.now;
    this.game.timeScale = 0.4;
    const t = o.winner === 'draw' ? 'DRAW' : o.winner === 'alpha' ? 'VICTORY' : 'DEFEAT';
    const why = o.why === 'sudden death' ? (o.winner === 'alpha' ? 'OMEGA RAN OUT OF TIME' : 'OUT OF TIME') : o.why === 'sudden death draw' ? 'NOBODY BROKE THE TIE' : o.why === 'trade' ? 'THE LAST TWO TRADED' : o.winner === 'alpha' ? 'OMEGA ELIMINATED' : 'ALPHA ELIMINATED';
    this.game.hud.bannerShow(t, why, 3);
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
      // 29.0: the frame's deaths are in: who stands, the sudden-death clocks, maybe the end.
      const o = this.rules.update(now, dt, this.standing());
      if (this.directors)
        for (const t of TEAMS) {
          this.directors[t].lastStand = this.rules.tickets[t] === 0;
          this.directors[t].sudden = this.rules.sudden[t];
        }
      if (o) this.end(o);
    }
    if (!this.winner) {
      // Respawns already paid for (a slot out of the match waits for ever).
      for (const s of this.slots) if (!s.bot && now >= s.respawnAt) this.spawn(s, true);
      if (g.state === 'dead' && now >= this.playerRespawnAt) this.respawnPlayer();
      // 7.0's callouts (rays from his camera); 12.0's arena has him in the sensing pass instead.
      if (!this.spectate && (!this.directors || !TDM.spotting)) this.spot(dt);
    } else if (g.state !== 'ending' && now - this.endT > 1.2) this.finish();
    this.padMesh?.update(dt);
    this.zoneVisual?.update(dt, this.now);
    g.tdmHud.setTickets(this.tickets.alpha, this.tickets.omega);
    const st = this.standing();
    g.tdmHud.setStanding(st.alpha, st.omega);
    g.tdmHud.setSudden(this.winner ? null : this.rules.sudden.alpha, this.winner ? null : this.rules.sudden.omega);
    g.tdmHud.setRespawn(g.state === 'dead' && !this.winner && this.playerRespawnAt < Infinity ? this.playerRespawnAt - now : null, this.killerName);
    this.updateSpectate(dt);
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
    const pad = this.spawner || this.zoner ? this.pickPad('alpha') : null;
    if (pad?.pick) this.logSpawn('alpha', pad.pick, g.playerUnit.uid);
    const p = pad?.at ?? this.forwardPoint('alpha') ?? this.spawnPoint('alpha');
    // (The player's yaw looks down -z at 0: the enemy convention's yaw + π.)
    g.revive(p, pad ? pad.yaw + Math.PI : 0);
    // 31.0: where he came in.
    if (this.zoner && this.lastZone) g.hud.zoneShow(`DEPLOYED · ZONE ${this.lastZone.id}`, fl('deploying'));
    g.playerInvulnUntil = this.now + TDM.protect;
    this.playerRespawnAt = Infinity;
    this.killerName = null;
  }

  // ------------------------------------------------------------------ 29.0: spectating
  /** Out of the match: the camera goes to a teammate still standing (the nearest first). */
  private startSpectate() {
    const g = this.game;
    this.specOn = true;
    this.specLook.init = false;
    g.tdmHud.setRespawn(null);
    g.renderer.weaponPass.enabled = false;
    // His own panels (health, ammo, crosshair, callsign) are not what he is watching.
    g.hud.root.classList.add('spectating');
    this.mousePrev = { l: g.input.mouseDown, r: g.input.aimDown };
    this.spectateNext(0, g.player.pos);
  }

  private stopSpectate() {
    if (this.spectating) this.spectating.rig.root.visible = true;
    this.spectating = null;
    if (!this.specOn) return;
    this.specOn = false;
    this.game.renderer.weaponPass.enabled = true;
    this.game.hud.root.classList.remove('spectating');
    this.game.tdmHud.setSpectate(null);
    this.game.renderer.grade.uniforms.uFade.value = 0;
  }

  /** The next (dir 1) or previous (-1) living teammate; 0: the nearest to `near`. */
  private spectateNext(dir: 1 | -1 | 0, near?: THREE.Vector3) {
    const mates = this.bots.filter((b) => b.alive && b.team === 'alpha');
    if (this.spectating) this.spectating.rig.root.visible = true;
    if (!mates.length) {
      this.spectating = null;
      this.game.tdmHud.setSpectate(null);
      return;
    }
    let next: TacticalEnemy;
    if (dir === 0 || !this.spectating || !mates.includes(this.spectating)) {
      const p = near ?? this.spectating?.pos ?? this.game.player.pos;
      next = mates.reduce((a, b) => (b.pos.distanceTo(p) < a.pos.distanceTo(p) ? b : a));
    } else {
      const i = mates.indexOf(this.spectating);
      next = mates[(i + dir + mates.length) % mates.length];
    }
    if (next !== this.spectating) this.specLook.init = false;
    this.spectating = next;
    // Its own body would fill the camera (the head is round the eye): hidden while watched.
    next.rig.root.visible = false;
  }

  /**
   * Each frame while out: follow the watched teammate's eye (its facing, and its aim's pitch), damped
   * so the bot's snap turns read as a player's; left / right click for the next / previous teammate;
   * when it dies, the next one after a beat.
   */
  private updateSpectate(dt: number) {
    if (!this.specOn) return;
    const g = this.game;
    if (this.winner) return;
    const inp = g.input;
    if (inp.mouseDown && !this.mousePrev.l) this.spectateNext(1);
    if (inp.aimDown && !this.mousePrev.r) this.spectateNext(-1);
    this.mousePrev = { l: inp.mouseDown, r: inp.aimDown };
    let b = this.spectating;
    if (!b || !b.alive) {
      // A beat on the body, then the next teammate standing.
      this.specDeadAt ??= this.now;
      if (!b || this.now - this.specDeadAt > 1.2) {
        this.specDeadAt = null;
        this.spectateNext(0, b?.pos);
      }
      b = this.spectating;
      if (!b) return;
    }
    // The eye: its head's height, a little forward of the head's centre (inside nothing it renders).
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    _eye.set(b.pos.x + fx * 0.12, b.pos.y + b.headY + 0.05, b.pos.z + fz * 0.12);
    const yaw = b.yaw + Math.PI;
    let pitch = 0;
    const aim = isArenaBot(b) ? b.brain.aimPoint : null;
    if (aim && isArenaBot(b) && b.brain.target && aim.lengthSq() > 0) {
      const dx = aim.x - _eye.x, dz = aim.z - _eye.z;
      pitch = Math.max(-1, Math.min(1, Math.atan2(aim.y - _eye.y, Math.hypot(dx, dz))));
    }
    const L = this.specLook;
    if (!L.init) {
      L.yaw = yaw;
      L.pitch = pitch;
      L.init = true;
    }
    let dy = yaw - L.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-dt * 14);
    L.yaw += dy * k;
    L.pitch += (pitch - L.pitch) * (1 - Math.exp(-dt * 8));
    const cam = g.camera;
    cam.position.copy(_eye);
    cam.rotation.set(L.pitch, L.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    g.renderer.grade.uniforms.uFade.value = 0;
    g.tdmHud.setSpectate({ name: b.name, hp: b.alive ? b.hpFrac : 0, mates: this.bots.filter((m) => m.alive && m.team === 'alpha').length });
  }

  private finish() {
    const g = this.game;
    const lines: TdmLine[] = [
      { name: g.playerUnit.name, team: 'alpha', you: true, kills: this.player.kills, deaths: this.player.deaths, weapon: this.playerArm().tag },
      ...this.slots.map((s) => ({ name: s.name, team: s.team, you: false, kills: s.kills, deaths: s.deaths, weapon: s.arm?.tag ?? '' })),
    ];
    this.stopSpectate();
    g.finishTdm(this.winner === 'alpha' ? 'win' : this.winner === 'draw' ? 'draw' : 'loss', { ...this.tickets }, lines, this.endT - this.startT, this.outcome?.why);
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
    this.stopSpectate();
    this.clearBots();
    this.padMesh?.dispose();
    this.padMesh = null;
    this.spawner = null;
    this.zoneVisual?.dispose();
    this.zoneVisual = null;
    this.zoner = null;
    this.openAt.clear();
    this.unprofile?.();
    this.unprofile = null;
    for (const t of TEAMS) this.squads[t].reset();
    this.directors = null;
    this.sensing = null;
    this.game.nav.bias = null;
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
      outcome: this.outcome,
      standing: this.standing(),
      sudden: { ...this.rules.sudden },
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
const _face = new THREE.Vector2();
/** 27.0: where a spawn puts someone: the spot, the pad's facing, and (a scored respawn) how it was picked. */
interface SpawnAt {
  at: THREE.Vector3;
  yaw: number;
  pick?: { pad: SpawnPad; nearest: number; rays: number; ms: number; fallback: boolean };
}
