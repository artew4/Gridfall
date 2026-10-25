import { fl } from '../ui/Flavor';
import * as THREE from 'three';
import { heightFogAt } from '../world/HeightFog';
import type { Game } from '../core/Game';
import type { ModeRules, TdmData } from './Level';
import { Gunner, Runner, type EnemyCtx, type TacticalEnemy } from '../enemies/Enemy';
import { Squad } from '../enemies/tactics/Squad';
import { ThinkScheduler } from '../enemies/tactics/Scheduler';
import { ArenaGunner, ArenaRunner, isArenaBot } from '../enemies/arena/ArenaBots';
import { anchorPosts, roleArm, type ArenaRole, type PostCandidate } from '../enemies/arena/Roles';
import { ArenaDirector } from '../enemies/arena/ArenaDirector';
import { Fronts, type FrontMember } from '../enemies/arena/Fronts';
import { Sensing } from '../enemies/arena/Sensing';
import { ARENA, applyProfile, newArenaStats, type ArenaCtx, type ArenaStats } from '../enemies/arena/ArenaCtx';
import type { DeathmatchBrain } from '../enemies/arena/DeathmatchAI';
import type { ArenaMember, Spot } from '../enemies/arena/ArenaDirector';
import type { ArenaState } from '../enemies/arena/DeathmatchAI';
import { PlayerSense } from '../enemies/arena/PlayerSense';
import type { SenseAgent } from '../enemies/arena/Sensing';
import { TdmMinimap, spotAlpha, type FrontMark, type MapDot } from '../ui/TdmMinimap';
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
import { SPAWN, SpawnManager, ZoneSpawner, deployZones, laneNeed, sideOf, type DeployZone, type SpawnPad, type SpawnUnit } from './SpawnManager';
import { SpawnZoneVisual } from '../world/SpawnZoneVisual';
import { MatchRules, type Outcome } from './LastStand';
import { Pressure } from '../enemies/arena/Pressure';
import { Objectives, type ObjectiveBody } from '../enemies/arena/Objectives';
import { ObjectiveVisual } from '../world/ObjectiveVisual';
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

/** 37.1: a bot sent to the high ground (TdmData.highGround) has this much health and is in none of these states. */
const WATCH_HP = 0.6;
const FIGHTING = new Set<ArenaState>(['engage', 'push', 'break', 'retreat', 'flank', 'stalk', 'recover']);

const _eye = new THREE.Vector3();
const _eye2 = new THREE.Vector3();

/** 36.0: the match's phase: the countdown with everyone held, then the match itself. */
export type MatchPhase = 'PRE_MATCH' | 'LIVE';

export const TDM = {
  /** 29.0: respawns per team (a death with none left is final): 50, whatever the team size. */
  tickets: 50,
  respawn: [3, 5] as [number, number],
  /** The player's respawn delay (inside the 3–5 s window; long enough to read the killer). */
  playerRespawn: 4,
  /** Spawn protection (s). */
  protect: 2,
  /**
   * 36.0: the pre-match countdown (s): everyone on his spot, feet and triggers held, the bots' brains
   * and directors idle; only the loadout is open. The match clock and spawn protection start after it.
   */
  preMatch: 3,
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
  /**
   * 48.0: the player's team: dealt at random every match (he plays both ends of every map), or one
   * fixed (DEV). Self-play (`spectate`) keeps ALPHA.
   */
  side: 'random' as 'random' | TeamId,
  /**
   * 50.0: a bot's rifle round to the player (the others a share of it, armory). 6.0–49.0: 10, half a
   * bot's 20: ten rifle hits to drop him against his eight on a bot's body (four to the head). 12.5:
   * eight, as his. Survival keeps 10.
   */
  // (54.0: 13.5: the playtest still carried his team.)
  playerHit: 13.5,
};

/** 19.0: the team size of the loaded map (the player counts on his team). */
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
  /** 42.0: its role this life (ARENA.roles). */
  role?: ArenaRole;
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
  /** 37.0: the zone the killer stood in (a fight inside a room: both in it). */
  killerZone?: string;
  /** 42.0: the killer's and the victim's roles (ARENA.roles; 'player' for the human). */
  killerArch?: string;
  victimArch?: string;
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
  /** 50.0: his form this match (ARENA.pressure: how hard the other team plays him). */
  pressure = new Pressure();
  /** 48.0: the player's team this match (TDM.side), and the other. */
  side: TeamId = 'alpha';
  get foe(): TeamId {
    return otherTeam(this.side);
  }
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
  /**
   * 36.0: PRE_MATCH from begin() (everyone set, held) until liveAt, then LIVE. The intro's flight runs
   * before it, with the match already set up (prepare): it lands on the spawn he was dealt.
   */
  phase: MatchPhase = 'LIVE';
  liveAt = 0;
  private prepared = false;
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

  /**
   * 36.0: the match set up before the intro's flight (everyone on his opening spot, held), so the
   * flight lands on the player's own spawn; begin() then only starts the countdown.
   */
  prepare() {
    this.setup();
    this.prepared = true;
    this.hold(true);
    // The flight is a cinematic: the match's HUD and his gun come up when it ends.
    this.game.tdmHud.show(false);
    this.minimap?.show(false);
    this.game.weapon.raiseTarget = 0;
  }

  /** The match starts: set up (unless the intro already did), then the pre-match countdown. */
  begin() {
    if (!this.prepared) this.setup();
    this.prepared = false;
    this.game.tdmHud.show(true);
    this.minimap?.show(this.ai === 'arena' && TDM.spotting);
    this.game.weapon.raiseTarget = 1;
    const pre = TDM.preMatch;
    if (pre > 0) {
      this.phase = 'PRE_MATCH';
      this.liveAt = this.now + pre;
      this.hold(true);
      this.game.countdown.set(pre);
    } else this.goLive();
  }

  /**
   * 36.0: the countdown has run out (or a DEV start skips it: `announce` false, no START!): feet,
   * triggers and brains let go.
   */
  goLive(announce = true) {
    const g = this.game;
    const now = this.now;
    this.prepared = false;
    this.phase = 'LIVE';
    this.liveAt = announce ? now : -Infinity;
    if (!announce) g.countdown.set(null);
    this.hold(false);
    // The clock and every spawn protection count from here, not from the setup.
    this.startT = now;
    g.playerInvulnUntil = now + TDM.protect;
    for (const b of this.bots) b.invulnUntil = now + TDM.protect;
    // His spawn area (the weapon swap) opens now: the countdown's seconds don't use it up.
    if (g.state === 'play') g.markSpawn();
    g.hud.bannerShow('TEAM DEATHMATCH', fl('tdmBanner'), 2.6);
  }

  /** Every body of the match held on its spot (true) or let go. */
  private hold(on: boolean) {
    this.game.player.held = on;
    for (const b of this.bots) b.held = on;
  }

  /** 36.0: under the intro's flight the bots stand on their spots (posed, held; nothing thinks). */
  updateIntro(dt: number) {
    if (!this.prepared) return;
    for (const b of this.bots) b.update(dt, this.ctxs[b.team]);
  }

  private setup() {
    const g = this.game;
    this.clearBots();
    this.ticketMax = TDM.force.tickets ?? this.data.tickets ?? TDM.tickets;
    this.forwardStats = { forward: 0, yard: 0 };
    this.rules = new MatchRules(this.ticketMax);
    this.player = { kills: 0, deaths: 0 };
    // 48.0: his team for this match; his rounds, the bots' and his HUD follow it.
    this.side = this.spectate ? 'alpha' : TDM.side === 'random' ? (Math.random() < 0.5 ? 'alpha' : 'omega') : TDM.side;
    g.playerUnit.team = this.side;
    g.projectiles.playerTeam = this.side;
    g.projectiles.playerHit = TDM.playerHit;
    g.barkView.allyTeam = this.side;
    this.pressure.reset();
    g.tdmHud.setSide(this.side);
    this.minimap?.setSide(this.side);
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
    this.squads[this.foe].human = null;
    this.squads[this.side].human = this.spectate || TDM.ai === 'arena' ? null : g.playerUnit;
    this.ai = TDM.ai;
    Object.assign(this.sched, this.ai === 'arena' ? ARENA.sched : TACTICAL_SCHED);
    this.sched.resetStats();
    this.unprofile?.();
    this.unprofile = this.ai === 'arena' && !TDM.force.noProfile ? applyProfile(this.data.arena) : null;
    // 44.0: the fronts (a map with zones) take more of the team into the lines, and let fights grow.
    if (this.frontsWanted()) {
      const F = ARENA.fronts;
      const undo = [this.unprofile, applyProfile({ roles: { share: { ...F.roles } }, sectors: { site: F.site } })];
      this.unprofile = () => undo.reverse().forEach((u) => u?.());
    }
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
      if (this.directors) {
        this.directors[otherTeam(by.team)].heard(from, by, this.now, this.friends[otherTeam(by.team)]);
        // 35.0: a shot this close is heard by the bot itself, wherever it faces (squared distances).
        const F = ARENA.flankThreat;
        if (F.on) {
          const r2 = F.hear * F.hear;
          for (const e of this.bots) {
            if (!e.alive || e.team === by.team || !isArenaBot(e)) continue;
            const dx = e.pos.x - from.x, dz = e.pos.z - from.z;
            if (dx * dx + dz * dz < r2) e.brain.onHeard(this.ctxs[e.team], by);
          }
        }
      } else this.squads[otherTeam(by.team)].hearShot(from, by);
    };
    this.setupSpawns();
    const st = this.data.start;
    g.player.reset(st.x, st.z, st.yaw, st.y);
    // 48.0: on OMEGA, its base (the opening's zones and pads put him on his spot after).
    if (this.side !== 'alpha') {
      const p = this.spawnPoint(this.side);
      g.player.reset(p.x, p.z, Math.PI, p.y);
    }
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
    const rosters = { [this.side]: roster(this.spectate ? size : size - 1), [this.foe]: roster(size) } as Record<TeamId, RosterSlot[]>;
    const n = TEAMS.reduce((k, t) => k + rosters[t].length, 0);
    const names = dealCallsigns(n, [g.playerUnit.name]);
    for (const team of TEAMS) for (const [, kind] of filterRoster(rosters[team], TDM.roster)) this.slots.push({ team, name: names.shift()!, kind, bot: null, respawnAt: 0, kills: 0, deaths: 0, arm: null });
    // 42.0: the anchors' posts (the patrol areas are set by now) and each team's size for its role shares.
    this.setupAnchors();
    this.openingSpawns();
    for (const s of this.slots) this.spawn(s);
    this.showStanding();
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
    // 41.0: the map's local area (the spawns' fireteam radius) sizes its fireteams too.
    for (const t of TEAMS) this.directors[t].densityR = d.spawnTuning?.densityR ?? SPAWN.densityR;
    const conceal = g.ctx.concealment;
    this.sensing = new Sensing(
      (a, b) => {
        this.sched.spend(1);
        return g.col.lineOfSight(a, b);
      },
      conceal ? (a, b) => conceal(a, b) < 0.35 : undefined,
    );
    // 25.0: the map's ground fog caps sight; its routing bias by gun.
    // 34.0: the bots see the ground fog as the picture draws it (HeightFog.heightFogAt, the live fog).
    this.sensing.fog = d.groundFog ? (eye, chest) => heightFogAt(eye, chest) : null;
    // 46.0: two under a roof see each other whatever the weather outside.
    this.sensing.shelter = g.ctx.sheltered ?? null;
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
    this.minimap?.setSide(this.side);
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
    // 42.0: the role first (its gun follows it): the one its team is furthest below its share of.
    const dir = arena ? this.directors?.[s.team] : undefined;
    s.role = dir && ARENA.roles.on && s.kind === 'gunner' ? dir.pickRole() : 'frontliner';
    s.arm = arena && s.kind === 'gunner' ? this.dealArm(s.team, s.role) : null;
    const e: TacticalEnemy =
      s.kind === 'runner'
        ? arena ? new ArenaRunner(at, TDM.difficulty, look) : new Runner(at, TDM.difficulty, look)
        : arena ? new ArenaGunner(at, TDM.difficulty, g.scene, look, s.arm!) : new Gunner(at, TDM.difficulty, g.scene, null, look);
    // 21.0: its gun wears the map's finish (as the player's does).
    if (arena && s.kind === 'gunner' && e.rig.weapon) themeRigGun(e.rig.weapon, gunThemeFor(g.setting));
    e.team = s.team;
    e.name = s.name;
    // (An anchor with no free post fights as a frontliner.)
    if (dir && isArenaBot(e)) e.brain.role = s.role = dir.setRole(e.uid, s.role);
    // 44.0: the fronts' sector its respawn was sent to (its lane there).
    if (dir && pad?.sector !== undefined && s.role !== 'wolf') dir.dealSector(e.uid, pad.sector);
    // 51.0: the opening too, by the fronts' need (it opened with the whole team in the centre lanes:
    // the flanks' points went untouched for a minute).
    else if (dir && !respawn && this.fronts && this.objectives && s.role !== 'wolf') {
      const k = this.fronts.neediest(s.team, this.sectorWeights(s.team));
      this.fronts.sent(s.team, k);
      dir.dealSector(e.uid, k);
    }
    e.invulnUntil = this.now + TDM.protect;
    // Facing the other base (enemy yaw: forward = (sin, cos); ALPHA's base is in the south). 27.0: the pad's way.
    e.yaw = pad ? pad.yaw : s.team === 'alpha' ? Math.PI : 0;
    if (pad?.pick) this.logSpawn(s.team, pad.pick, e.uid, at);
    else if (respawn && !this.spawner && !this.zoner) this.logYard(s.team, at, e.uid);
    g.scene.add(e.rig.root);
    this.bots.push(e);
    s.bot = e;
  }

  /**
   * 13.0: a gun for a bot spawning on `team`: uniform over the armory, but never a third of one gun
   * on a team at once (a squad of all shotguns, or all rifles, is no firefight to read).
   */
  private dealArm(team: TeamId, role: ArenaRole = 'frontliner'): BotArm {
    // 21.0: in the map's finish (kinetic rounds on a military map, Maglev's white-cyan bolts).
    const theme = gunThemeFor(this.game.setting);
    if (TDM.arms !== 'random') return themedArm(ARMORY[TDM.arms].bot, theme);
    const held: WeaponId[] = [];
    // 42.0: with roles, the cap counts the bots of its role (the anchors' rifles don't use up the frontliners').
    for (const s of this.slots) if (s.team === team && s.bot && s.arm && (!ARENA.roles.on || s.role === role)) held.push(s.arm.id);
    const size = Math.round(ARENA.roles.share[role] * this.slots.filter((s) => s.team === team).length);
    // 42.0: the role's guns (Roles.roleArm); without roles, uniform as 13.0.
    return themedArm(ARENA.roles.on ? roleArm(role, held, TDM.armCap, Math.random, size) : dealArm(held, TDM.armCap), theme);
  }

  /**
   * 42.0: each team's anchor posts (Roles.anchorPosts), once a match: candidates are the nav's nodes
   * (every few, on the floor) and the patrol areas, the map's high ground among them; sightlines by the
   * collision world's rays from eye height. As many as a quarter of the team, plus two, spread at
   * least the density radius apart (12 m at least).
   */
  private setupAnchors() {
    if (!this.directors) return;
    const g = this.game;
    const col = g.col;
    const high = this.data.highGround?.points ?? [];
    const nodes = g.nav.nodes;
    const step = Math.max(1, Math.floor(nodes.length / 500));
    const cands: PostCandidate[] = [];
    // (Nav nodes stand 1 m over the floor; a post is a floor point.)
    for (let i = 0; i < nodes.length; i += step) cands.push({ pos: new THREE.Vector3(nodes[i].x, nodes[i].y - 1, nodes[i].z) });
    for (const p of this.directors.alpha.hvas) cands.push({ pos: p });
    for (const p of high) cands.push({ pos: p, high: true });
    const eye = new THREE.Vector3(), dir = new THREE.Vector3();
    const sight = (from: THREE.Vector3, dx: number, dz: number, max: number) => {
      eye.set(from.x, from.y + 1.5, from.z);
      dir.set(dx, 0, dz);
      return col.raycast(eye, dir, max)?.dist ?? max;
    };
    const R = this.data.spawnTuning?.densityR ?? SPAWN.densityR;
    // A post a body can stand on: a nav node within 2 m of it on its level (a roof off the graph is none).
    const reachable = (p: THREE.Vector3) => nodes.some((n) => Math.abs(n.x - p.x) < 2 && Math.abs(n.z - p.z) < 2 && Math.abs(n.y - 1 - p.y) < 0.6);
    for (const t of TEAMS) {
      const d = this.directors[t];
      const home = this.zoner ? this.zoner.zonesOf(t).map((z) => z.centre) : t === 'alpha' ? this.data.spawns.alpha : this.data.spawns.omega;
      const n = this.slots.filter((s) => s.team === t).length;
      d.teamBots = n;
      d.setAnchorPosts(
        anchorPosts(cands, {
          progress: (p) => d.progress(p),
          axis: d.axisXZ,
          sight,
          floor: (p) => (col.terrain ? col.terrain.height(p.x, p.z) : 0),
          count: Math.ceil(n * ARENA.roles.share.anchor) + 2,
          gap: Math.max(12, R),
          home,
          reachable,
          // The route from the nearest home point at most 1.5 × the straight line + 12 m (Old Port's
          // stack tops, a stair away round the stack, held 14% of anchor time: they circled below).
          walkOk: (p) => {
            const h = home.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
            // (Routed as the bots route: between points at node height, over the vault links.)
            const path = g.nav.route(new THREE.Vector3(h.x, h.y + 1, h.z), new THREE.Vector3(p.x, p.y + 1, p.z), { vault: true });
            if (!path.length) return false;
            let len = 0, at = h;
            for (const i of path) {
              const n = nodes[i];
              len += Math.hypot(n.x - at.x, n.z - at.z);
              at = n;
            }
            return len <= 1.5 * Math.hypot(p.x - h.x, p.z - h.z) + 12;
          },
        }),
      );
    }
  }

  /** The base spawn furthest from every hostile, not on top of a body. */
  /** 27.0: the map's spawn pads and their scorer (null: the yards), the pads on the floor. */
  spawner: SpawnManager | null = null;
  private padMesh: SpawnPads | null = null;
  /** 31.0: the deployment zones and their pads on the floor (TDM.spawns 'zones'). */
  zoner: ZoneSpawner | null = null;
  /** 31.0: the zone of the last respawn picked (his toast). */
  private lastZone: DeployZone | null = null;
  /** 51.0: the flank objectives (ARENA.objectives; with the fronts), their beacons; null: off. */
  objectives: Objectives | null = null;
  private objVisual: ObjectiveVisual | null = null;
  /** 51.0: each zone's flank (0 or 2: open while its team holds that point), or null (a home zone: always open). */
  private zoneFlank = new Map<DeployZone, number | null>();
  private objSeen = 0;
  private objStates: { owner: TeamId | null; capturing: TeamId | null; meter: number; contested: boolean }[] = [];
  /** 44.0: the three lines of battle (ARENA.fronts; a map with zones), shared by both teams; null: off. */
  fronts: Fronts | null = null;
  /** 44.0 (DEV): respawns at a lane's rally point behind its line, and in a zone, this match. */
  rallyStats = { rally: 0, zone: 0 };
  private frontMembers: FrontMember[] = [];
  /** 44.0: the last fronts event the HUD announced. */
  private frontSeen = 0;
  private zoneVisual: SpawnZoneVisual | null = null;
  /** 27.0: the match's first spawn: where each slot (and the player) starts. */
  private openAt = new Map<Slot | 'player', SpawnAt>();
  /** 27.0 (DEV): every spawn this match: when, whose, which pad, its nearest hostile, rays, fallback. */
  spawnLog: { t: number; team: TeamId; pad: number; nearest: number; rays: number; ms: number; fallback: boolean; uid: number; mates?: number }[] = [];

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
    this.dropObjectives();
    this.openAt.clear();
    this.spawnLog = [];
    if (this.setupZones()) return;
    const raw = this.data.pads;
    if (!raw?.length || TDM.spawns !== 'dynamic') return;
    const centre = (ps: THREE.Vector3[]) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));
    const a = centre(this.data.spawns.alpha), o = centre(this.data.spawns.omega);
    const lane = this.data.laneOf;
    const pads: SpawnPad[] = raw.map(([x, y, z, yaw], id) => ({ id, pos: new THREE.Vector3(x, y, z), yaw, side: sideOf({ x, z }, a, o), lane: lane ? ((l) => (l !== null && l < 3 ? l : null))(lane(x, y + 1, z)) : null }));
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
      // 37.1: who may be sent to the high ground: an arena bot out of any fight, with most of its health.
      const watchFree = (m: ArenaMember) => {
        const c = m as unknown as Combatant;
        return isArenaBot(c) && c.hpFrac >= WATCH_HP && !FIGHTING.has(c.brain.state);
      };
      for (const t of TEAMS) {
        // 37.1: the high ground is patrolled too, and kept watch on.
        this.directors[t].setPatrol([...hvas, ...(this.data.highGround?.points ?? [])]);
        this.directors[t].setFlanks(this.data.flankOf?.bind(this.data) ?? null);
        this.directors[t].setWatch(this.data.highGround ?? null, watchFree);
      }
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
    // 51.0: with the objectives a team's zones on the flanks open only while it holds that flank; the
    // rest are home (always open). A team with none at home gets one of its base's own spawns ('H').
    this.zoneFlank.clear();
    if (this.objectivesWanted()) {
      // (A zone behind the contested middle has no lane: its flank is read nearer the midline.)
      const flankAt = (c: THREE.Vector3) => {
        for (const f of [1, 0.6, 0.3]) {
          const k = this.data.laneOf?.(c.x, c.y + 1, c.z * f);
          if (k !== null && k !== undefined) return k === 0 || k === 2 ? k : null;
        }
        return null;
      };
      for (const z of zones) this.zoneFlank.set(z, flankAt(z.centre));
      for (const team of TEAMS) {
        if (zones.some((z) => z.team === team && this.zoneFlank.get(z) === null)) continue;
        const sp = this.data.spawns[team];
        const centre = sp.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(sp.length);
        const yaw = team === 'alpha' ? Math.PI : 0;
        const r = Math.max(...sp.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z)));
        const home: DeployZone = { id: 'H', team, centre, r, points: sp.map((p, i) => ({ id: 9000 + i + (team === 'alpha' ? 0 : 100), pos: p.clone(), yaw, side: team })), uses: 0, lastUse: -Infinity };
        zones.push(home);
        this.zoneFlank.set(home, null);
      }
    }
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
      // 37.1: who may be sent to the high ground: an arena bot out of any fight, with most of its health.
      const watchFree = (m: ArenaMember) => {
        const c = m as unknown as Combatant;
        return isArenaBot(c) && c.hpFrac >= WATCH_HP && !FIGHTING.has(c.brain.state);
      };
      for (const t of TEAMS) {
        // 37.1: the high ground is patrolled too, and kept watch on.
        this.directors[t].setPatrol([...hvas, ...(this.data.highGround?.points ?? [])]);
        this.directors[t].setFlanks(this.data.flankOf?.bind(this.data) ?? null);
        this.directors[t].setWatch(this.data.highGround ?? null, watchFree);
      }
    }
    this.setupFronts(zones);
    this.setupObjectives(zones);
    return true;
  }

  /** 51.0: and on the flank objectives (ARENA.objectives on, the map's lanes split into sectors)? */
  private objectivesWanted() {
    return this.frontsWanted() && ARENA.objectives.on && !!this.data.laneOf;
  }

  /**
   * 51.0: the points (the map's TdmData.objectives, else each front's first lane where it crosses the
   * midline, its floor's height), their beacons; zones gated on them; the fronts' breaks bleed nothing.
   */
  private setupObjectives(zones: readonly DeployZone[]) {
    this.dropObjectives();
    const F = this.fronts;
    if (!F || !this.directors || !this.objectivesWanted()) return;
    const A = this.directors.alpha;
    const pts: { pos: THREE.Vector3; name: string; r?: number }[] = [];
    for (let k = 0; k < F.n; k++) {
      const given = this.data.objectives?.[k];
      let pos: THREE.Vector3 | null = given ? new THREE.Vector3(given[0], given[1], given[2]) : null;
      if (!pos) {
        const l = A.laneSector.indexOf(k);
        const W = l >= 0 ? A.lanes[l] : null;
        if (!W?.length) continue;
        let best = W[0], bp = Infinity;
        for (let i = 0; i < W.length; i++) {
          const p = A.progress(W[i]);
          if (Math.abs(p) < bp) {
            bp = Math.abs(p);
            best = W[i];
          }
          const q = i + 1 < W.length ? A.progress(W[i + 1]) : NaN;
          if (p * q <= 0 && p !== q) {
            const t = p / (p - q);
            pos = W[i].clone().lerp(W[i + 1], t);
            break;
          }
        }
        pos ??= best.clone();
      }
      pts.push({ pos, name: F.names[k] ?? `front ${k}`, r: given?.[3] });
    }
    if (pts.length !== F.n) return;
    const O = (this.objectives = new Objectives(pts));
    F.bleeds = false;
    F.extra = { alpha: new Array(F.n).fill(0), omega: new Array(F.n).fill(0) };
    if (this.zoner) this.zoner.active = (z) => this.zoneOpen(z);
    for (const t of TEAMS) this.directors[t].objectives = O;
    // Each beam from over whatever roofs stand over its point (up through the floors to open sky).
    const up = new THREE.Vector3(0, 1, 0);
    const from = O.list.map((o) => {
      const p = new THREE.Vector3(o.pos.x, o.pos.y + 0.5, o.pos.z);
      let top = o.pos.y;
      for (let i = 0; i < 6; i++) {
        const hit = this.game.col.raycast(p, up, 40);
        if (!hit) break;
        top = hit.point.y + 0.6;
        p.set(o.pos.x, top + 0.05, o.pos.z);
      }
      return top;
    });
    this.objVisual = new ObjectiveVisual(O.list, from);
    this.game.scene.add(this.objVisual.group);
    this.objSeen = 0;
    this.objStates = O.list.map(() => ({ owner: null, capturing: null, meter: 0, contested: false }));
    this.syncZones();
    this.game.tdmHud.setObjectives(this.objStates);
    void zones;
  }

  private dropObjectives() {
    this.objVisual?.dispose();
    this.objVisual = null;
    this.objectives = null;
    if (this.directors) for (const t of TEAMS) this.directors[t].objectives = null;
    if (this.fronts) {
      this.fronts.bleeds = true;
      this.fronts.extra = null;
    }
    this.game.tdmHud.setObjectives(null);
    this.game.tdmHud.setAlarm(null);
  }

  /**
   * 51.0: is this zone open (home, or on a flank its team holds)? On its last line (the other team
   * holds two of the three) every zone of a team is open: it comes back at once, and from all of
   * them (from home alone it walked into the other team's forward spawns: a match held 3-0 for 5 min).
   */
  private zoneOpen(z: DeployZone) {
    const k = this.zoneFlank.get(z);
    if (k === null || k === undefined || !this.objectives) return true;
    return this.objectives.of(k)?.owner === z.team || this.objectives.lastLine(z.team);
  }

  /** 51.0: the zones' look (on the ground and the minimap) as they open and close. */
  private syncZones() {
    const zs = this.zoner?.zones ?? [];
    for (const z of zs) this.zoneVisual?.setOpen(z, this.zoneOpen(z));
    this.minimap?.setZonesOpen(zs.map((z) => this.zoneOpen(z)));
  }

  /** 44.0: does this match play on fronts (the arena, ARENA.fronts on, the map's zones in use)? */
  private frontsWanted() {
    return this.ai === 'arena' && ARENA.fronts.on && !!this.data.zones && TDM.spawns === 'zones' && this.data.lanes.alpha.length >= 2;
  }

  /**
   * 44.0: the fronts: three sectors (the map's laneOf; a point outside it by its nearest lane), each
   * director lane's sector by most of its waypoints, each sector's cap short of the nearest zone in it
   * (either team's), the directors told.
   */
  private setupFronts(zones: readonly DeployZone[]) {
    this.fronts = null;
    this.frontMarks.length = 0;
    this.game.tdmHud.setFrontNames(null);
    this.game.tdmHud.setCompassFronts(null);
    for (const t of TEAMS) this.directors?.[t].setFronts(null);
    if (!this.directors || !this.frontsWanted()) return;
    const A = this.directors.alpha;
    const lo = this.data.laneOf?.bind(this.data);
    const n = 3;
    const sectorsOf = (lanes: THREE.Vector3[][]) =>
      lanes.map((L, i) => {
        const c = new Array(n).fill(0);
        for (const w of L) {
          const k = lo?.(w.x, w.y + 1, w.z);
          if (k !== null && k !== undefined && k < n) c[k]++;
        }
        const best = c.indexOf(Math.max(...c));
        return c[best] > 0 ? best : Math.round((i * (n - 1)) / Math.max(1, lanes.length - 1));
      });
    const secA = sectorsOf(this.data.lanes.alpha);
    const sectorOf = (x: number, y: number, z: number) => {
      const k = lo?.(x, y + 1, z);
      return k !== null && k !== undefined && k < n ? k : secA[A.nearestLane({ x, z })];
    };
    const progress = (x: number, z: number) => A.progress({ x, z });
    const caps = new Array(n).fill(Infinity);
    for (const z of zones) {
      const k = sectorOf(z.centre.x, z.centre.y, z.centre.z);
      caps[k] = Math.min(caps[k], Math.abs(progress(z.centre.x, z.centre.z)) - ARENA.fronts.capGap);
    }
    const all = Math.min(...caps.filter((c) => c < Infinity));
    const capOf = caps.map((c) => Math.max(0.3, Math.min(0.95, c < Infinity ? c : all < Infinity ? all : 0.6)));
    this.fronts = new Fronts(n, progress, sectorOf, capOf, this.data.laneNames?.slice(0, n) ?? ['left', 'centre', 'right']);
    this.directors.alpha.setFronts(this.fronts, secA);
    this.directors.omega.setFronts(this.fronts, sectorsOf(this.data.lanes.omega));
    this.rallyStats = { rally: 0, zone: 0 };
    this.frontSeen = 0;
    this.game.tdmHud.setFrontNames(this.fronts.names);
    this.game.tdmHud.setCompassFronts(this.fronts.names);
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
    const members: Record<TeamId, (Slot | 'player')[]> = { alpha: [], omega: [] };
    if (!this.spectate) members[this.side].push('player');
    for (const s of this.slots) members[s.team].push(s);
    // 46.0: shuffled (he was always first: the same pad every match).
    for (const t of TEAMS) shuffle(members[t]);
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

  /**
   * 31.0: the opening in zones: squads of two dealt round-robin over each team's zones. 46.0: in a
   * shuffled order, so he isn't always first (zone A, the same flank every match).
   */
  private openingZones() {
    const zs = this.zoner!;
    const g = this.game;
    const members: Record<TeamId, (Slot | 'player')[]> = { alpha: [], omega: [] };
    if (!this.spectate) members[this.side].push('player');
    for (const s of this.slots) members[s.team].push(s);
    for (const t of TEAMS) shuffle(members[t]);
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
  private pickPad(team: TeamId, player = false): SpawnAt {
    const t0 = performance.now();
    const unit = (c: Combatant): SpawnUnit => {
      const f = c.facing(_face);
      return { pos: c.pos, face: { x: f.x, y: f.y } };
    };
    const hostiles = this.hostilesNow(team).map(unit);
    const allies: SpawnUnit[] = this.bots.filter((b) => b.alive && b.team === team).map(unit);
    if (team === this.side && !this.spectate && this.game.player.alive) allies.push(unit(this.game.playerUnit));
    const occupied = (q: THREE.Vector3) =>
      this.bots.some((b) => b.alive && Math.hypot(b.pos.x - q.x, b.pos.z - q.z) < 1 && Math.abs(b.pos.y - q.y) < 1.5) ||
      (this.game.player.alive && Math.hypot(this.game.player.pos.x - q.x, this.game.player.pos.z - q.z) < 1);
    // The lanes the team is short of (by the map's lane weights): a pad there scores higher.
    // 31.0: by zones: the zone (safe, least used, least recent), then the spot in it.
    // 41.0: allies near a spot scored as fireteams (join 1-2, keep off 4+), with the arena's sectors.
    const fireteam = this.ai === 'arena' && ARENA.sectors.on;
    if (this.zoner) {
      this.zoner.fireteam = fireteam;
      // 44.0, the fronts: the sector that needs this body (the human: where the fight is), its rally point
      // behind the line if that is ahead of the zone and safe, else that sector's zone if safe.
      let sector: number | undefined, prefer: DeployZone | undefined;
      if (this.fronts) {
        sector = player ? this.playerSector() : this.fronts.neediest(team, this.sectorWeights(team));
        this.fronts.sent(team, sector);
        // (51.0: with the objectives only the zones a team has opened: no rally points.)
        const r = ARENA.fronts.rally && !this.objectives ? this.rallyAt(team, sector, hostiles, occupied) : null;
        if (r) {
          this.rallyStats.rally++;
          this.directors?.[otherTeam(team)].heardSpawn(r.at, this.now, this.friends[otherTeam(team)]);
          this.lastZone = null;
          return { at: r.at, yaw: r.yaw, sector, pick: { pad: { id: -2, pos: r.at, yaw: r.yaw, side: team, lane: sector }, nearest: r.nearest, rays: r.rays, ms: performance.now() - t0, fallback: false } };
        }
        this.rallyStats.zone++;
        prefer = this.zoneOfSector(team, sector);
      }
      const zp = this.zoner.pick(team, hostiles, allies, this.now, occupied, prefer);
      this.zoneVisual?.flash(zp.zone);
      this.directors?.[otherTeam(team)].heardSpawn(zp.zone.centre, this.now, this.friends[otherTeam(team)]);
      this.lastZone = zp.zone;
      return { at: zp.at, yaw: zp.pad.yaw, sector, pick: { ...zp, ms: performance.now() - t0 } };
    }
    const lf = this.data.laneOf;
    const W = this.data.laneWeights ?? [1, 1, 1];
    // 33.0: a lane past the weighted ones (Deep Jungle's tunnels: a report lane) counts as none.
    const lw = (l: number | null) => (l !== null && l < W.length ? l : null);
    const need = lf ? laneNeed(allies.map((u) => lw(lf(u.pos.x, u.pos.y + 1, u.pos.z))), W) : undefined;
    this.spawner!.fireteam = fireteam;
    const pick = this.spawner!.pick(team, hostiles, allies, this.now, occupied, need);
    this.padMesh?.flash(pick.pad.id, team);
    // The other team hears a pad come alive near them (a lead for its patrols).
    this.directors?.[otherTeam(team)].heardSpawn(pick.pad.pos, this.now, this.friends[otherTeam(team)]);
    return { at: pick.at, yaw: pick.pad.yaw, pick: { ...pick, ms: performance.now() - t0 } };
  }

  /**
   * 44.0, waves (the fronts on, ARENA.fronts.wave s): a bot's respawn waits for its team's next wave
   * (each team's on its own beat, half a period apart), so the dead come back together and walk to
   * their lanes as a group: a push. Without the fronts, `t` as it was.
   */
  private waveAt(team: TeamId, t: number) {
    const P = ARENA.fronts.wave;
    if (!this.fronts || !(P > 0)) return t;
    const off = this.startT + (team === 'alpha' ? 0 : P / 2);
    return off + Math.ceil((t - off) / P) * P;
  }

  /**
   * 44.0: the map's lane weights per sector (ALPHA's lanes; OMEGA's are the same lanes): each sector's
   * lanes' mean, so a sector with more lanes is not worth more bodies (the Desert's compound has three
   * of its seven: summed, it took 89 of a match's 111 kills).
   */
  private sectorWeights(team: TeamId) {
    const D = this.directors![team];
    const W = team === 'alpha' ? this.data.laneWeights : this.data.laneWeights?.slice().reverse();
    const n = this.fronts!.n;
    const w = new Array(n).fill(0), c = new Array(n).fill(0);
    for (let l = 0; l < D.lanes.length; l++) {
      w[D.sectorOfLane(l)] += W?.[l] ?? 1;
      c[D.sectorOfLane(l)]++;
    }
    return w.map((v, k) => (c[k] ? v / c[k] : 1));
  }

  /**
   * 44.0: the human's respawn sector: where his team is needed, and more where the enemy is (he came to
   * fight: the lane with the most of them, the one his team is losing first).
   */
  private playerSector() {
    const F = this.fronts!;
    const need = F.need(this.side, this.sectorWeights(this.side));
    let best = 0, bs = -Infinity;
    for (let k = 0; k < F.n; k++) {
      const s = need[k] + 0.5 * F.strength[this.foe][k] + Math.random() * 0.3;
      if (s > bs) {
        bs = s;
        best = k;
      }
    }
    return best;
  }

  /** 44.0: `team`'s zone in sector `k` (else the one nearest the sector's lanes' start), or undefined. */
  private zoneOfSector(team: TeamId, k: number): DeployZone | undefined {
    const F = this.fronts!;
    const own = this.zoner!.zonesOf(team);
    const inK = own.filter((z) => F.sectorOf(z.centre.x, z.centre.y, z.centre.z) === k);
    if (inK.length) return inK[Math.floor(Math.random() * inK.length)];
    const D = this.directors![team];
    const l = D.laneInSector(k);
    if (l < 0) return undefined;
    const start = D.lanes[l][0];
    return own.reduce<DeployZone | undefined>((b, z) => (!b || z.centre.distanceTo(start) < b.centre.distanceTo(start) ? z : b), undefined);
  }

  /**
   * 44.0: a rally point for `team` in sector `k`: on its lane there, the last waypoint `rallyBack` behind
   * the line (its own progress), when that is ahead of its zones there (a zone is as near otherwise);
   * safe as a zone is (no hostile within the map's hardMin, none in sight within its sight range); a
   * free spot a step off the waypoint, facing up the lane. Null: none.
   */
  private rallyAt(team: TeamId, k: number, hostiles: readonly SpawnUnit[], occupied: (p: THREE.Vector3) => boolean) {
    const F = this.fronts!;
    const D = this.directors![team];
    const l = D.laneInSector(k);
    if (l < 0) return null;
    const W = D.lanes[l];
    const want = F.own(team, k) - ARENA.fronts.rallyBack;
    // Ahead of the team's zones in this sector (or any of its zones) by a margin, else the zone will do.
    const zs = this.zoner!.zonesOf(team);
    const zk = zs.filter((z) => F.sectorOf(z.centre.x, z.centre.y, z.centre.z) === k);
    const zp = Math.max(...(zk.length ? zk : zs).map((z) => D.progress(z.centre)));
    if (want < zp + 0.15) return null;
    let i = -1;
    for (let j = 0; j < W.length; j++) if (D.progress(W[j]) <= want) i = j;
    if (i < 0) return null;
    const S = { ...SPAWN, ...this.data.spawnTuning };
    const col = this.game.col;
    let rays = 0, nearest = Infinity;
    const p = W[i];
    for (const h of hostiles) {
      const d = h.pos.distanceTo(p);
      nearest = Math.min(nearest, d);
      if (d < S.hardMin) return null;
    }
    const chest = _eye.set(p.x, p.y + 1.2, p.z);
    for (const h of hostiles) {
      if (h.pos.distanceTo(p) > S.sight) continue;
      rays++;
      this.sched.spend(1);
      if (col.lineOfSight(_eye2.set(h.pos.x, h.pos.y + 1.6, h.pos.z), chest)) return null;
    }
    // A free spot a step off it (the waypoint itself, else a ring), on its floor.
    const next = W[Math.min(W.length - 1, i + 1)];
    const yaw = next === p ? (team === 'alpha' ? Math.PI : 0) : Math.atan2(next.x - p.x, next.z - p.z);
    for (const r of [0, 1.2, 2.2])
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const x = p.x + Math.cos((a / 8) * Math.PI * 2) * r, z = p.z + Math.sin((a / 8) * Math.PI * 2) * r;
        const y = col.groundHeightAt(x, z, 0.3, p.y + 1.2);
        if (!(Math.abs(y - p.y) < 0.6)) continue;
        const q = new THREE.Vector3(x, y, z);
        if (occupied(q) || col.blocked(new THREE.Vector3(x, y + 0.05, z), 0.5, 1.8)) continue;
        return { at: q, yaw, rays, nearest };
      }
    return null;
  }

  /** 27.0 (DEV): a yard respawn (the 'bases' A/B), logged as the pads' are: pad -1, its nearest hostile. */
  private logYard(team: TeamId, at: THREE.Vector3, uid: number) {
    let near = Infinity;
    for (const h of this.hostilesNow(team)) near = Math.min(near, h.pos.distanceTo(at));
    this.spawnLog.push({ t: +(this.now - this.startT).toFixed(2), team, pad: -1, nearest: +near.toFixed(1), rays: 0, ms: 0, fallback: false, uid });
  }

  private logSpawn(team: TeamId, p: { pad: SpawnPad; nearest: number; rays: number; ms: number; fallback: boolean }, uid: number, at: THREE.Vector3) {
    // 41.0: allies already in the spot's local area (the fireteam it joins, or the crowd).
    const R = this.data.spawnTuning?.densityR ?? SPAWN.densityR;
    let mates = 0;
    for (const b of this.bots) if (b.alive && b.team === team && b.uid !== uid && Math.hypot(b.pos.x - at.x, b.pos.z - at.z) < R) mates++;
    this.spawnLog.push({ t: +(this.now - this.startT).toFixed(2), team, pad: p.pad.id, nearest: +p.nearest.toFixed(1), rays: p.rays, ms: +p.ms.toFixed(3), fallback: p.fallback, uid, mates });
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
      if (team === this.side && Math.hypot(this.game.player.pos.x - p.x, this.game.player.pos.z - p.z) < 1.4) continue;
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
    if (team === this.foe && !this.spectate && this.game.player.alive) out.push(this.game.playerUnit);
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
    if (by && by.team !== v.team) this.fronts?.kill(by.team, v.pos.x, v.pos.y, v.pos.z, this.now);
    const weapon = by ? this.armOf(by)?.tag : undefined;
    // 29.0: a final death is marked OUT in the feed.
    g.tdmHud.kill(by, v, weapon, !granted);
    const vs = this.slotOf(v);
    if (vs) {
      vs.deaths++;
      vs.bot = null;
      // 51.0: a team on its last line (two flanks lost) is back at once.
      const last = this.objectives?.lastLine(v.team);
      vs.respawnAt = !granted ? Infinity : last ? this.now + ARENA.objectives.lastLine.bot : this.waveAt(v.team, this.now + rand(TDM.respawn[0], TDM.respawn[1]));
    }
    // 50.0: his form (ARENA.pressure); in form, a kill of his tells the victim's team where it came from.
    if (by?.isPlayer && by.team !== v.team) {
      this.pressure.kill(this.now);
      if (this.pressure.update(this.now) >= ARENA.pressure.reveal) this.directors?.[v.team].sighting(by, this.now, 'callout');
    }
    if (v.isPlayer) this.pressure.death(this.now);
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
      killerRole: kb?.tac?.role ?? (by?.isPlayer ? this.squads[this.side].humanStyle : '-'),
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
      killerZone: by ? g.level.data.zoneAt(by.pos.x, by.pos.y, by.pos.z)?.name : undefined,
      // 42.0: each end's role this life (the human: 'player').
      killerArch: by ? (by.isPlayer ? 'player' : this.directors?.[by.team].roles.get(by.uid)) : undefined,
      victimArch: v.isPlayer ? 'player' : this.directors?.[v.team].roles.get(v.uid),
    });
    if (this.directors) {
      if (isArenaBot(by)) {
        // 55.0: the instincts' kills (before the director forgets the cover calls on it).
        const I = this.arenaStats.instinct;
        if (by.brain.chasing === v) by.brain.endChase(this.ctxs[by.team].arena!, 'kill');
        if (by.brain.grudge === v) I.grudgeKills++;
        if (by.brain.punishing && by.brain.target === v) I.punishKills++;
        if (this.directors[by.team].covering(v.uid, by.pos, this.now)) I.coverKills++;
      }
      // 55.0: a teammate down near: one of them may mean to pay its killer back.
      if (by && by.team !== v.team) for (const b of this.bots) if (b.alive && b !== v && b.team === v.team && isArenaBot(b)) b.brain.onMateDown(v, by, this.now, this.ctxs[b.team]);
      this.directors[otherTeam(v.team)].hostileDied(v, this.now);
      this.directors[v.team].friendDied(v, this.now);
      this.sensing?.forget(v.uid);
      if (isArenaBot(by)) {
        if (by.brain.state === 'push' && by.brain.target === v) this.arenaStats.pushKills++;
        if (by.brain.flankedOn === v.uid) this.arenaStats.flankKills++;
        by.brain.onKill(this.now);
        by.bark('kill', this.ctxs[by.team]);
      }
    } else this.squads[otherTeam(v.team)].hostileDied(v, by && !by.isPlayer ? (by as TacticalEnemy) : null);
    return granted;
  }

  /** 26.0: his team's live board on the HUD (him and every slot of his team: name, kills, deaths). */
  private showStanding() {
    // (Spectating, he is not on the team: its bots fill it.)
    const lines: BoardLine[] = this.spectate ? [] : [{ name: this.game.playerUnit.name, kills: this.player.kills, deaths: this.player.deaths, you: true }];
    for (const s of this.slots) if (s.team === this.side) lines.push({ name: s.name, kills: s.kills, deaths: s.deaths, you: false });
    this.game.tdmHud.setBoard(lines);
  }

  /** The player died: the mode respawns him (Game shows the countdown instead of the death screen). */
  onPlayerDeath(): boolean {
    const g = this.game;
    this.player.deaths++;
    this.killerName = g.playerAttacker?.name ?? null;
    const granted = this.onDeath(g.playerUnit, g.playerAttacker);
    this.playerRespawnAt = granted ? this.now + (this.objectives?.lastLine(this.side) ? ARENA.objectives.lastLine.player : TDM.playerRespawn) : Infinity;
    // 29.0: out of the match: no countdown, he watches the teammates still standing.
    if (!granted && !this.winner) this.startSpectate();
    return true;
  }

  /** 29.0: who is still in it per team: alive, or dead with a respawn granted. */
  standing(): Record<TeamId, number> {
    const out: Record<TeamId, number> = { alpha: 0, omega: 0 };
    for (const b of this.bots) if (b.alive) out[b.team]++;
    for (const sl of this.slots) if (!sl.bot && sl.respawnAt < Infinity) out[sl.team]++;
    if (!this.spectate && (this.game.player.alive || this.playerRespawnAt < Infinity)) out[this.side]++;
    return out;
  }

  private end(o: Outcome) {
    this.outcome = o;
    this.winner = o.winner;
    this.endT = this.now;
    this.game.timeScale = 0.4;
    const won = o.winner === this.side;
    const t = o.winner === 'draw' ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const FOE = this.foe.toUpperCase(), MINE = this.side.toUpperCase();
    const why = o.why === 'sudden death' ? (won ? `${FOE} RAN OUT OF TIME` : 'OUT OF TIME') : o.why === 'sudden death draw' ? 'NOBODY BROKE THE TIE' : o.why === 'trade' ? 'THE LAST TWO TRADED' : won ? `${FOE} ELIMINATED` : `${MINE} ELIMINATED`;
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
      if (!this.spectate) (t === this.side ? f : h).push(g.playerUnit);
    }
    // 36.0: the countdown: the bodies stand (posed, held), no brain, director or sensing pass runs.
    if (this.phase === 'PRE_MATCH') {
      if (now >= this.liveAt) this.goLive();
      else {
        g.countdown.set(this.liveAt - now);
        for (const b of this.bots) b.update(dt, this.ctxs[b.team]);
        this.zoneVisual?.update(dt, now);
        this.padMesh?.update(dt);
        g.tdmHud.update(dt, g.camera, this.friends[this.side]);
        return;
      }
    }
    // The countdown's last word (START!) over the first moments of the match.
    g.countdown.set(this.liveAt - now);
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
    if (!this.spectate) this.pressure.update(now);
    if (!this.winner) {
      // 29.0: the frame's deaths are in: who stands, the sudden-death clocks, maybe the end.
      const o = this.rules.update(now, dt, this.standing());
      if (this.directors) {
        const ending = TEAMS.some((t) => this.rules.tickets[t] === 0);
        for (const t of TEAMS) {
          this.directors[t].lastStand = this.rules.tickets[t] === 0;
          this.directors[t].sudden = this.rules.sudden[t];
          // 38.0: no flanks' pull once a team is down to its last lives (the hunt is on).
          this.directors[t].endgame = ending;
        }
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
    this.objVisual?.update(this.objStates, this.now);
    // 48.0: the HUD's sides are his team's and the other's.
    const me = this.side, them = this.foe;
    g.tdmHud.setTickets(this.tickets[me], this.tickets[them]);
    const st = this.standing();
    g.tdmHud.setStanding(st[me], st[them]);
    g.tdmHud.setSudden(this.winner ? null : this.rules.sudden[me], this.winner ? null : this.rules.sudden[them]);
    g.tdmHud.setRespawn(g.state === 'dead' && !this.winner && this.playerRespawnAt < Infinity ? this.playerRespawnAt - now : null, this.killerName);
    this.updateSpectate(dt);
    g.tdmHud.update(dt, g.camera, this.friends[this.side]);
    // 46.0: the compass (his heading, the fronts' marks).
    if (!this.spectate && g.player.alive) {
      const here = this.fronts ? this.fronts.sectorOf(g.player.pos.x, g.player.pos.y, g.player.pos.z) : -1;
      g.tdmHud.updateCompass(-g.player.yaw, g.player.pos.x, g.player.pos.z, this.compassMarks(), here);
    }
    if (this.directors && this.minimap && TDM.spotting) {
      const t0 = performance.now();
      this.drawMap(now);
      this.mapMs += performance.now() - t0;
      this.mapFrames++;
    }
  }

  /** 12.0: the minimap: his team's bots, and every hostile it has spotted (fading once lost). */
  private drawMap(now: number) {
    const g = this.game;
    const allies = this.allyDots, hostiles = this.hostileDots;
    allies.length = hostiles.length = 0;
    for (const b of this.bots) if (b.alive && b.team === this.side) allies.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, a: 1 });
    for (const s of this.directors![this.side].spotted(now, this.spots)) hostiles.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, a: spotAlpha(s.age, ARENA.spot.fade) });
    this.minimap!.draw(g.player.pos, g.player.yaw, allies, hostiles, g.playerUnit.name, this.frontMarks);
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
      // 46.0: the weather's own density (the picture's thins round a player indoors on the Desert).
      (this.game.ctx.weatherFog ?? this.game.fog.density) > 0 ? fogRange(this.game.ctx.weatherFog ?? this.game.fog.density, ARENA_SEE) : undefined,
    );
    // What anyone sees goes on the team's board (who saw it, from where: the flankers read that).
    for (const v of viewers) {
      for (const h of this.hostiles[v.self.team]) if (h.alive && v.seen.get(h.uid)?.vis) dirs[v.self.team].sighting(h, now, 'sight', v.self);
    }
    // 44.0: the lines first (the directors read them), each body where it stands and the sector it was sent to.
    if (this.fronts && !this.winner) this.updateFronts(now);
    for (const t of TEAMS) {
      const enemyAlive = this.hostiles[t].filter((h) => h.alive).length;
      dirs[t].update(now, this.friends[t], enemyAlive, { own: this.tickets[t], theirs: this.tickets[otherTeam(t)] });
    }
    for (const br of this.sched.pick(brains, now)) br.decide(this.ctxs[br.self.team]);
  }

  /**
   * 51.0: the points' events, announced from his side: a point his team takes (a banner; a flank's
   * spawn zone opens), one it loses, one it knocks out of the other team's hands, one the other takes,
   * the double breakthrough either way (the alarm stays up while it lasts: TdmHud.setAlarm).
   */
  private objectiveEvents() {
    const O = this.objectives!;
    const g = this.game;
    const FOE = this.foe.toUpperCase();
    const name = (k: number) => (this.fronts?.names[k] ?? '').split(/[\s(]/)[0].toUpperCase();
    while (this.objSeen < O.events.length) {
      const e = O.events[this.objSeen++];
      const ours = e.team === this.side;
      const flank = e.k >= 0 && [...this.zoneFlank.values()].includes(e.k);
      if (e.what === 'captured') {
        if (ours) {
          g.hud.bannerShow(`${name(e.k)} CAPTURED`, flank ? 'SPAWN ZONE ONLINE' : 'HOLD IT', 2.2);
          g.audio.flankCue('won');
        } else {
          g.tdmHud.notice(`${name(e.k)}: ${FOE} TOOK IT${flank ? ' · THEIR SPAWN IS UP' : ''}`);
          g.audio.flankCue('lost');
        }
      } else if (e.what === 'neutral') {
        if (e.from === this.side) {
          g.hud.bannerShow(`${name(e.k)} LOST`, flank ? 'SPAWN ZONE DOWN · TAKE IT BACK' : 'TAKE IT BACK', 2.2);
          g.audio.flankCue('lost');
        } else g.tdmHud.notice(`${name(e.k)}: ${FOE} KNOCKED OUT`);
      } else if (e.what === 'double') {
        if (ours) {
          g.hud.bannerShow('DOUBLE BREAKTHROUGH', `${FOE} BLEEDS TICKETS ×3`, 2.6);
          g.audio.flankCue('won');
        } else {
          g.hud.bannerShow('TWO FLANKS LOST', 'LAST LINE · INSTANT RESPAWN · ALL ZONES OPEN', 2.6);
          g.audio.flankCue('alarm');
        }
      } else if (e.what === 'doubleEnd') g.tdmHud.notice(ours ? 'BREAKTHROUGH LOST' : 'LINE RESTORED');
      this.syncZones();
    }
    if (O.events.length > 48) {
      O.events.splice(0, O.events.length - 16);
      this.objSeen = O.events.length;
    }
  }

  /** 51.0: the compass's marks: the fronts' (or the points', "DEFEND …" while his is being taken). */
  private compassMarks() {
    return this.frontMarks.map((f) => ({ x: f.x, z: f.z, push: f.push, label: f.compass, alert: f.alert }));
  }

  /** 44.0: the lines on the minimap (one a sector, on its first ALPHA lane), set at each fronts step. */
  private frontMarks: FrontMark[] = [];
  private markFronts() {
    const F = this.fronts!;
    const D = this.directors!.alpha;
    const ax = D.axisXZ;
    this.frontMarks.length = 0;
    // 51.0: with the objectives the marks are the points (the compass's, the minimap's): "DEFEND …"
    // while his team's is being taken.
    if (this.objectives) {
      for (const o of this.objectives.list) {
        const lbl = (F.names[o.k] ?? '?').split(/[\s(]/)[0].toUpperCase();
        const losing = this.objectives.losing(o, this.side);
        this.frontMarks.push({ x: o.pos.x, z: o.pos.z, ax: ax.x, az: ax.z, push: o.owner, label: lbl[0], obj: { owner: o.owner, meter: o.meter, r: o.r, capturing: !!o.capturing }, compass: losing ? `DEFEND ${lbl}` : undefined, alert: losing });
      }
      return;
    }
    for (let k = 0; k < F.n; k++) {
      const l = D.laneSector.indexOf(k);
      if (l < 0) continue;
      const W = D.lanes[l];
      const want = F.line[k];
      let x = W[0].x, z = W[0].z;
      for (let i = 0; i + 1 < W.length; i++) {
        const a = D.progress(W[i]), b = D.progress(W[i + 1]);
        if ((a - want) * (b - want) <= 0 && a !== b) {
          const t = (want - a) / (b - a);
          x = W[i].x + (W[i + 1].x - W[i].x) * t;
          z = W[i].z + (W[i + 1].z - W[i].z) * t;
          break;
        }
        if (i === W.length - 2) {
          const last = Math.abs(D.progress(W[W.length - 1]) - want) < Math.abs(D.progress(W[0]) - want) ? W[W.length - 1] : W[0];
          x = last.x;
          z = last.z;
        }
      }
      const pa = F.stance.alpha[k] === 'push', po = F.stance.omega[k] === 'push';
      this.frontMarks.push({ x, z, ax: ax.x, az: ax.z, push: pa && !po ? 'alpha' : po && !pa ? 'omega' : null, label: (F.names[k] ?? '?')[0].toUpperCase() });
    }
  }

  /** 44.0: the fronts' step (every director step): the lines, the stances, a break's bleeding, the HUD. */
  private frontT = -Infinity;
  private bodies: ObjectiveBody[] = [];
  private updateFronts(now: number) {
    const F = this.fronts!;
    if (now - this.frontT < ARENA.director.every) return;
    const step = this.frontT === -Infinity ? 0 : Math.min(1, now - this.frontT);
    this.frontT = now;
    const ms = this.frontMembers;
    ms.length = 0;
    const g = this.game;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const d = this.directors![b.team];
      const l = isArenaBot(b) && d.roleOf(b.uid) !== 'wolf' ? d.laneOf.get(b.uid) : undefined;
      ms.push({ team: b.team, x: b.pos.x, y: b.pos.y, z: b.pos.z, sector: l === undefined ? null : d.sectorOfLane(l) });
    }
    if (!this.spectate && g.player.alive) ms.push({ team: this.side, x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, sector: null });
    const bleed = F.update(now, ms);
    // 51.0: the points (who stands on them, the meters, the bleed) and the need they put on each front.
    const O = this.objectives;
    if (O) {
      const bodies = this.bodies;
      bodies.length = 0;
      for (const m of ms) bodies.push(m);
      const ob = O.update(now, step, bodies);
      for (const t of TEAMS) bleed[t] += ob[t];
      for (const t of TEAMS) for (let k = 0; k < F.n; k++) F.extra![t][k] = O.need(t, k);
      this.objStates = O.list.map((o) => ({ owner: o.owner, capturing: o.capturing, meter: o.meter, contested: o.contested }));
      g.tdmHud.setObjectives(this.objStates);
      g.tdmHud.setAlarm(O.double(this.side) ? 'ours' : O.double(this.foe) ? 'theirs' : null);
      this.objectiveEvents();
    }
    this.markFronts();
    for (const t of TEAMS) for (let i = 0; i < bleed[t]; i++) this.rules.bleed(t, now);
    // The HUD: the lines, and a break (or one held) announced.
    const here = !this.spectate && g.player.alive ? F.sectorOf(g.player.pos.x, g.player.pos.y, g.player.pos.z) : -1;
    g.tdmHud.setFronts(F.line, F.stance[this.side], F.broken, here);
    while (this.frontSeen < F.events.length) {
      const e = F.events[this.frontSeen++];
      // (51.0: with the objectives a front's break is no event: the points are.)
      if (e.what === 'push' || this.objectives) continue;
      const lane = (F.names[e.sector] ?? '').toUpperCase();
      const ours = e.team === this.side;
      if (e.what === 'break') g.hud.bannerShow(ours ? 'BREAKTHROUGH' : 'LINE BROKEN', `${lane} · ${ours ? `${this.foe.toUpperCase()} BLEEDS TICKETS` : 'DEFEND'}`, 2.2);
      else g.tdmHud.notice(`${lane}: ${ours ? 'LINE HELD' : `${this.foe.toUpperCase()} PUSHED BACK`}`);
    }
    if (F.events.length > 48) {
      F.events.splice(0, F.events.length - 16);
      this.frontSeen = F.events.length;
    }
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
    for (const b of this.hostiles[this.side]) {
      if (rays >= 3 || !b.alive) continue;
      head.set(b.pos.x, b.pos.y + b.headY, b.pos.z);
      const d = head.distanceTo(eye);
      if (d > range || fwd.dot(head.clone().sub(eye).divideScalar(d)) < 0.57) continue;
      rays++;
      if (!g.col.lineOfSight(eye, head)) continue;
      if (this.directors) this.directors[this.side].sighting(b, this.now, 'callout');
      else this.squads[this.side].sighting(null, b.pos, b.vel, b);
    }
  }

  private respawnPlayer() {
    const g = this.game;
    const me = this.side;
    const pad = this.spawner || this.zoner ? this.pickPad(me, true) : null;
    if (pad?.pick) this.logSpawn(me, pad.pick, g.playerUnit.uid, pad.at);
    const p = pad?.at ?? this.forwardPoint(me) ?? this.spawnPoint(me);
    // (The player's yaw looks down -z at 0: the enemy convention's yaw + π. OMEGA's yard faces +z.)
    g.revive(p, pad ? pad.yaw + Math.PI : me === 'alpha' ? 0 : Math.PI);
    // 31.0: where he came in.
    if (this.zoner && this.lastZone) g.hud.zoneShow(`DEPLOYED · ZONE ${this.lastZone.id}`, fl('deploying'));
    // 44.0: or at his lane's rally point, behind its line.
    else if (this.fronts && pad?.sector !== undefined) g.hud.zoneShow(`DEPLOYED · ${(this.fronts.names[pad.sector] ?? '').toUpperCase()} FRONT`, fl('deploying'));
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
    const mates = this.bots.filter((b) => b.alive && b.team === this.side);
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
    g.tdmHud.setSpectate({ name: b.name, hp: b.alive ? b.hpFrac : 0, mates: this.bots.filter((m) => m.alive && m.team === this.side).length });
  }

  private finish() {
    const g = this.game;
    const lines: TdmLine[] = [
      { name: g.playerUnit.name, team: this.side, you: true, kills: this.player.kills, deaths: this.player.deaths, weapon: this.playerArm().tag },
      ...this.slots.map((s) => ({ name: s.name, team: s.team, you: false, kills: s.kills, deaths: s.deaths, weapon: s.arm?.tag ?? '' })),
    ];
    this.stopSpectate();
    g.finishTdm(this.winner === this.side ? 'win' : this.winner === 'draw' ? 'draw' : 'loss', { ...this.tickets }, lines, this.endT - this.startT, this.outcome?.why);
  }

  updateEnding(dt: number) {
    // The world carries on behind the result (slow motion), nobody respawns.
    this.update(dt);
  }

  /** 55.0: a bot's round in him counts to its instincts as one in a bot does (a chase on him). */
  onPlayerHurt(dmg: number, by: Combatant | null) {
    if (isArenaBot(by)) by.brain.onDealt(this.game.playerUnit, dmg, this.now);
  }

  onGunshot() {
    const g = this.game;
    if (this.spectate) return;
    if (this.directors) {
      this.directors[this.foe].heard(g.player.pos, g.playerUnit, this.now, this.friends[this.foe]);
      return;
    }
    this.squads[this.foe].hearShot(g.player.pos, g.playerUnit);
    this.squads[this.side].humanObs.shot(this.now);
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
    this.phase = 'LIVE';
    this.prepared = false;
    this.hold(false);
    this.game.countdown.set(null);
    this.clearBots();
    this.padMesh?.dispose();
    this.padMesh = null;
    this.spawner = null;
    this.zoneVisual?.dispose();
    this.zoneVisual = null;
    this.zoner = null;
    this.dropObjectives();
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
    for (const t of TEAMS) this.squads[t].human = null;
    // 48.0: survival's player is ALPHA again (its enemies are OMEGA).
    g.playerUnit.team = 'alpha';
    g.projectiles.playerTeam = 'alpha';
    g.projectiles.playerHit = 10;
    g.barkView.allyTeam = 'alpha';
    this.pressure.reset();
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
      side: this.side,
      objectives: this.objectives?.report() ?? null,
      form: +this.pressure.update(this.now).toFixed(2),
      human: this.squads[this.side].humanStyle,
      humanRates: this.squads[this.side].humanObs.rates,
      sched: { ...this.sched.stats },
      friendlyDamage: this.friendlyDamage,
      kills: this.kills.length,
    };
  }
}
const _face = new THREE.Vector2();
/** 27.0: where a spawn puts someone: the spot, the pad's facing, and (a scored respawn) how it was picked. */
/** 46.0: Fisher-Yates in place. */
export function shuffle<T>(a: T[], rand: () => number = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SpawnAt {
  at: THREE.Vector3;
  yaw: number;
  /** 44.0: the fronts' sector it was sent to. */
  sector?: number;
  pick?: { pad: SpawnPad; nearest: number; rays: number; ms: number; fallback: boolean };
}
