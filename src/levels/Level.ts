import type { Biome } from '../ui/Flavor';
import type * as THREE from 'three';
import type { NavLayout } from '../enemies/Nav';
import type { Breakable, CabinetSpot } from '../gameplay/Interactives';
import type { IntroFrame } from '../cinematic/Intro';
import type { Weapon } from '../player/Weapon';
import type { Player } from '../player/Player';
import type { EnemyLook } from '../entities/types';
import type { WeaponId } from '../entities/weapons/armory';
import type { LookGrade } from '../core/Renderer';
import type { TeamId } from '../combat/Team';
import type { TrackId } from '../audio/music/MusicManager';
import type { ArenaProfile } from '../enemies/arena/ArenaCtx';

/** What Team Deathmatch needs from a level (6.0): each team's spawn zone, spawns and lanes. */
export interface TdmData {
  spawns: Record<TeamId, THREE.Vector3[]>;
  /** Waypoints from each team's base towards the other's, left, centre, right (as that team faces). */
  lanes: Record<TeamId, THREE.Vector3[][]>;
  /** Inside a team's walled spawn yard. */
  inBase(team: TeamId, p: THREE.Vector3): boolean;
  /** Where the player starts and faces (ALPHA's base). */
  start: { x: number; z: number; yaw: number; y: number };
  /**
   * 15.0: which lane a point is in, as the map defines them (the flow reports and the bots' lane
   * pressure): 0 and 2 the flanks, 1 the centre; null outside the contested middle (yards, behind them).
   */
  laneOf?(x: number, y: number, z: number): 0 | 1 | 2 | null;
  /** 15.0: the lanes' names for the reports, [flank, centre, flank]. */
  laneNames?: [string, string, string];
  /**
   * 18.0: how many bots each lane is worth to the director's balance (default 1 each): a lane worth
   * 1.6 holds two of a team's five while the others hold one or two (a map's centre of gravity).
   */
  laneWeights?: [number, number, number];
  /**
   * 18.0: lanes whose bots keep to them: a board contact (the team's radar) is closed on along the
   * lane, to its waypoint level with the contact, as a far hunt is (8.0), instead of straight at it.
   * Default: none (every lane yields to the radar, 7.0–17.1).
   */
  laneStrict?: [boolean, boolean, boolean];
  /**
   * 19.0: forward respawn points per team (absent: everyone respawns in the yard). A respawn takes
   * the most forward one no hostile is within `safe` m of, or can see from within `sight` m; with none
   * safe, the yard. The match's first spawn is always the yard.
   */
  forward?: { points: Record<TeamId, THREE.Vector3[]>; safe: number; sight: number };
  /** 19.0: tickets per team on this map (default TDM.tickets, 25: five a player at 5v5). */
  tickets?: number;
  /**
   * 19.0: the arena AI's tuning on this map (applied at the match's start, restored at its end), e.g.
   * Crash Site's: flank more, fight closer, push sooner. Absent: the global ARENA as it is.
   */
  arena?: ArenaProfile;
}

export type SettingId = 'tokyo' | 'desert' | 'jungle' | 'docks' | 'neonblock' | 'crashsite' | 'oldport' | 'maglev';
export type Mode = 'story' | 'arcade' | 'tdm';

/** A named area of a level (the zone toast reads these). Rects are x0, z0, x1, z1. */
export interface Zone {
  id: string;
  name: string;
  jp: string;
  rects: [number, number, number, number][];
}

/** What the main menu shows for a setting. */
export interface LevelInfo {
  id: SettingId;
  name: string;
  /** 16.0: the UI's flavor script (Flavor.ts); several settings share a biome. */
  biome: Biome;
  /** The name in the biome's script (the menu card, the title screen). */
  jp: string;
  /** One line for the menu card. */
  blurb: string;
  /** Modes this setting supports; the menu disables the others. */
  modes: Mode[];
  /** Shown while the level builds. */
  loading: string;
  /** Browser tab title while this setting is loaded. */
  windowTitle: string;
  /** Title screen lines under GRIDFALL. */
  tagline: string;
  jpLine: string;
  /** HUD corner: place and clock text. */
  place: string;
  clock: string;
  /** Opening title card per mode. */
  cine: Partial<Record<Mode, { t1: string; t2: string; t3: string }>>;
  /**
   * The survival enemies of this setting (their look, sound and rounds). 13.0: a level no longer
   * names the player's weapon (the armory is global, the loadout picks it), except a story's own.
   */
  enemies: EnemyLook;
  /** 13.0: the weapon the story mode hands the player (other modes use the loadout). */
  storyWeapon?: WeaponId;
  /** 9.0: the setting's music track (MusicManager). */
  music: TrackId;
  /**
   * 19.0: Team Deathmatch's team size on this map (the player counts on ALPHA). Default 5. Here, not
   * in TdmData: the menu card shows it before the level is built.
   */
  teamSize?: number;
}

/**
 * Everything the engine's generic systems need from a level: where the player starts, where enemies
 * may spawn and walk, the extent, cover, and pickups. Pure data, built by the level.
 */
export interface LevelData {
  start: { x: number; z: number; yaw: number; y?: number };
  /** Playable extent (enemies outside it are put back on the nav graph; the safety net uses it). */
  bounds: THREE.Box2;
  /** Lowest floor anyone can legitimately stand on (the safety net's "fell out" line). */
  floorMin: number;
  nav: NavLayout;
  /** Survival spawn points (validated by the engine: open ground, reachable on the nav graph). */
  spawns: THREE.Vector3[];
  /** Sniper perches for survival gunners. */
  perches: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  cabinets: CabinetSpot[];
  medkits: THREE.Vector3[];
  breakables: Breakable[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** DEV validation: places enemies must be able to reach (inside every building, on every roof). */
  testGoals?: THREE.Vector3[];
  /** Team Deathmatch layout, if the level supports the mode. */
  tdm?: TdmData;
}

/** An opening sequence over the live world. */
export interface IntroLike {
  t: number;
  update(dt: number, cam: THREE.PerspectiveCamera): IntroFrame;
  skip(): void;
  dispose(): void;
}

/** Per-frame facts the level's world update may react to. */
export interface FrameInfo {
  dt: number;
  rawDt: number;
  elapsed: number;
  camPos: THREE.Vector3;
  player: Player;
  /** The game is in a playable state (not title, not paused). */
  playing: boolean;
  mode: Mode;
}

/** Render settings a level owns (applied when it loads). */
export interface LevelLook {
  exposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  shadows: boolean;
  /** Film-grade shadow tint (r, g, b added in the darks). */
  shadowTint: [number, number, number];
  /** 4.0 teal/orange split-tone in the grade pass (absent = off, the 3.7 grade). */
  grade?: LookGrade;
  /** The look before 4.0, for the DEV comparison toggle (F8), if the level changed it. */
  legacy?: LevelLook;
}

/**
 * The game rules of a mode on the loaded level. Arcade survival works on any level's data; story
 * modes belong to the level that has the story (Tokyo).
 */
export interface ModeRules {
  /** Before the opening (story: park the player, patrols on their beats). */
  prepare?(): void;
  begin(fromCheckpoint: boolean): void;
  /** Play and dead states, after the player moved. */
  update(dt: number, rawDt: number): void;
  /** Background simulation while the opening plays. */
  updateIntro?(dt: number): void;
  onIntroSkipped?(): void;
  /** A shot was fired (listeners react before anything is hit). */
  onGunshot?(origin: THREE.Vector3): void;
  /** Something other than enemies in the line of fire (bystanders). */
  bystander?(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { dist: number; hit(dir: THREE.Vector3): void } | null;
  onKill?(): void;
  /** The player died. True: the mode respawns him (no death screen; TDM). */
  onPlayerDeath?(): boolean;
  musicIntensity(): number;
  /** Ending state (story): returns true while it runs. */
  updateEnding?(dt: number, rawDt: number): void;
  /** Restart: clean what this mode set up. */
  reset(): void;
  toTitle(): void;
  /** Numbers for the death screen. */
  death(): { story: boolean; kills: number };
}

/** A loaded setting: the world, its data, its per-frame world update, and its clean-up. */
export interface LevelRuntime {
  readonly info: LevelInfo;
  readonly data: LevelData;
  readonly look: LevelLook;
  /** Second build phase, once the engine's player, nav and enemy context exist. */
  attach(): void;
  /** Ambience and positional loops (once audio runs; again after a level switch). */
  startAudio(): void;
  /** World simulation: weather, lights, props, trains. */
  update(f: FrameInfo): void;
  /** Sky flash for the grade (lightning), 0..1. */
  readonly flash: number;
  /** Colour and strength of the fill light on the viewmodel. */
  lightWeapon(weapon: Weapon, camPos: THREE.Vector3): void;
  /** Slow camera drift behind the title. */
  titleCamera(cam: THREE.PerspectiveCamera, t: number): void;
  createIntro(mode: Mode): IntroLike;
  /** Riding something that legitimately leaves the extent (safety net). */
  aboard(p: THREE.Vector3): boolean;
  /** The story rules, if this level has a story. */
  storyRules?(): ModeRules;
  /** Arcade survival is about to start: set the world up for it (e.g. close what only the story uses). */
  enterArcade?(): void;
  /** Restart: world events back to their initial state. */
  reset(): void;
  /** Free everything the level created outside the scene graph (audio, timers, render targets). */
  dispose(): void;
  debug?(): Record<string, unknown>;
  /** DEV comparison (F8): switch the level's own 4.0 visual additions on or off (materials, lights). */
  setVisual?(v4: boolean): void;
}
