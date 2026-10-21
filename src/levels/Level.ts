import type * as THREE from 'three';
import type { NavLayout } from '../enemies/Nav';
import type { Breakable, CabinetSpot } from '../gameplay/Interactives';
import type { IntroFrame } from '../cinematic/Intro';
import type { Weapon } from '../player/Weapon';
import type { Player } from '../player/Player';
import type { Arsenal } from '../entities/types';
import type { LookGrade } from '../core/Renderer';
import type { TeamId } from '../combat/Team';
import type { TrackId } from '../audio/music/MusicManager';

/** What Team Deathmatch needs from a level (6.0): each team's spawn zone, spawns and lanes. */
export interface TdmData {
  spawns: Record<TeamId, THREE.Vector3[]>;
  /** Waypoints from each team's base towards the other's, left, centre, right (as that team faces). */
  lanes: Record<TeamId, THREE.Vector3[][]>;
  /** Inside a team's walled spawn yard. */
  inBase(team: TeamId, p: THREE.Vector3): boolean;
  /** Where the player starts and faces (ALPHA's base). */
  start: { x: number; z: number; yaw: number; y: number };
}

export type SettingId = 'tokyo' | 'desert' | 'jungle' | 'docks';
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
  /** The player's weapon and the survival enemies of this setting. */
  arsenal: Arsenal;
  /** 9.0: the setting's music track (MusicManager). */
  music: TrackId;
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
