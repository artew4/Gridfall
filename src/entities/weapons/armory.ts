import type { Ballistic, WeaponSpec } from '../types';
import { KITSUNE_9 } from './kitsune9';
import { JACKAL_AR } from './jackal';
import { BOAR_SHOTGUN } from './shotgun';

/*
  13.0, the unified armory: every weapon is available on every map. Before 13.0 a level's info
  carried its weapon (Tokyo the Kitsune, Desert and Docks the Jackal, Jungle the Boar); now the level
  says nothing about guns. The player picks one (the loadout, gameplay/Loadout.ts), the arena bots are
  each dealt one at every spawn, and only the story keeps its own (Tokyo's Kitsune, the narrative's).

  Each entry is the player's weapon (the viewmodel spec) and the same gun in a bot's hands: how it
  fires, how hard each round hits, and the ranges it fights at. The bot numbers mirror the player
  weapon's character, not its exact handling (a bot has no recoil to fight, it has spread).

  Pure data (no three.js beyond the specs' builders): tested in loadout.test.ts.
*/

export type WeaponId = 'smg' | 'ar' | 'shotgun';

/** A gun in an arena bot's hands (DeathmatchAI reads every number here instead of ARENA's rifle). */
export interface BotArm {
  id: WeaponId;
  /** Feed tag and the sound and look of its rounds. */
  tag: string;
  sound: 'plasma' | 'rifle' | 'shotgun';
  ballistic: Ballistic;
  /** Energy bolts: core (HDR), trail and size; kinetic rounds use it for the tracer colour only. */
  bolt: { core: [number, number, number]; trail: [number, number, number]; size: number };
  /** Damage of one round (or pellet) as a share of the TDM rifle round (20 to a bot, 10 to the player). */
  damage: number;
  /** Rounds per trigger pull (a shell's pellets), and their cone (rad, on top of the aim spread). */
  pellets: number;
  pelletSpread: number;
  mag: number;
  reload: number;
  /** Hip fire: rounds per burst, between rounds, between bursts (s). */
  burst: number;
  burstGap: number;
  burstRest: number;
  /** Extra hip spread (the 11.0 rifle's 0.012). */
  hipSpread: number;
  /** Fighting range it keeps while strafing (m). */
  band: [number, number];
  /** Aimed shots (11.0): starts over `enter` m, holds down to `exit`; null never aims (the shotgun). */
  aim: { enter: number; exit: number; burst: number; burstRest: number } | null;
  /** Beyond this it runs up instead of firing (m). */
  maxRange: number;
  /** It rushes a wounded target within this (m). */
  pushRange: number;
  /** Rig gun: length and bulk of the model it carries (1 = the rifle). */
  model: { length: number; bulk: number };
}

export interface ArmoryEntry {
  id: WeaponId;
  /** Key in the loadout picker. */
  key: '1' | '2' | '3';
  /** What it is, in a word or two, and one line on how it plays. */
  kind: string;
  blurb: string;
  spec: WeaponSpec;
  bot: BotArm;
}

export const ARMORY: Record<WeaponId, ArmoryEntry> = {
  smg: {
    id: 'smg',
    key: '1',
    kind: 'PLASMA SMG',
    blurb: 'Fast, hard-hitting bolts. Mid range, quick reload.',
    spec: KITSUNE_9,
    bot: {
      id: 'smg',
      tag: 'SMG',
      sound: 'plasma',
      ballistic: 'energy',
      bolt: { core: [0.6, 3.2, 4.2], trail: [0.1, 0.7, 1.0], size: 0.85 },
      damage: 1.35,
      pellets: 1,
      pelletSpread: 0,
      mag: 12,
      reload: 1.35,
      burst: 4,
      burstGap: 0.14,
      burstRest: 0.12,
      hipSpread: 0.008,
      band: [7, 15],
      aim: { enter: 17, exit: 15, burst: 3, burstRest: 0.25 },
      // 13.0 sims: at 32 m the SMG out-ranged the rifle on the desert (median kill 27 m vs 22 m).
      maxRange: 25,
      pushRange: 25,
      model: { length: 0.75, bulk: 0.9 },
    },
  },
  ar: {
    id: 'ar',
    key: '2',
    kind: 'ASSAULT RIFLE',
    blurb: 'Steady automatic fire. Holds every range.',
    spec: JACKAL_AR,
    bot: {
      id: 'ar',
      tag: 'AR',
      sound: 'rifle',
      ballistic: 'kinetic',
      bolt: { core: [4, 2.6, 1.2], trail: [1, 0.6, 0.25], size: 0.7 },
      // Exactly the 7.0–12.0 arena rifle (ARENA's numbers).
      damage: 1,
      pellets: 1,
      pelletSpread: 0,
      mag: 20,
      reload: 1.5,
      burst: 5,
      burstGap: 0.1,
      burstRest: 0.15,
      hipSpread: 0.012,
      band: [9, 20],
      aim: { enter: 13, exit: 11, burst: 3, burstRest: 0.3 },
      maxRange: 40,
      pushRange: 25,
      model: { length: 1, bulk: 1 },
    },
  },
  shotgun: {
    id: 'shotgun',
    key: '3',
    kind: 'PUMP SHOTGUN',
    blurb: 'Eight pellets a shell. Lethal up close, useless far.',
    spec: BOAR_SHOTGUN,
    bot: {
      id: 'shotgun',
      tag: 'SG',
      sound: 'shotgun',
      ballistic: 'kinetic',
      bolt: { core: [4, 2.4, 1], trail: [1, 0.55, 0.2], size: 0.6 },
      // Eight pellets of 0.6 (12 to a bot, 6 to the player): 96 / 48 with all of them on, so two
      // shells at arm's length drop a bot (150), where the rifle needs eight rounds.
      damage: 0.6,
      pellets: 8,
      pelletSpread: 0.06,
      mag: 6,
      reload: 2.6,
      burst: 1,
      burstGap: 0.82,
      burstRest: 0.82,
      hipSpread: 0.004,
      band: [2.5, 8],
      aim: null,
      // Past 12 m it runs up rather than fire (at 18 m its kills had a 13–16 m median: a sniper's
      // shotgun, with a third of the pellets landing).
      maxRange: 12,
      pushRange: 30,
      model: { length: 0.85, bulk: 1.35 },
    },
  },
};

export const ARMORY_ORDER: readonly WeaponId[] = ['smg', 'ar', 'shotgun'];

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && v in ARMORY;
}

/** The entry bound to a picker key ('1'…'3', or a KeyboardEvent code 'Digit1'…), else null. */
export function armoryByKey(key: string): ArmoryEntry | null {
  const k = key.replace(/^(Digit|Numpad)/, '');
  return ARMORY_ORDER.map((id) => ARMORY[id]).find((e) => e.key === k) ?? null;
}

/**
 * A bot's gun for this spawn: uniform over the armory, leaving out any gun `held` (its team's live
 * bots) already has `cap` of, so a squad is never all shotguns or all rifles.
 */
export function dealArm(held: readonly WeaponId[] = [], cap = Infinity, rng: () => number = Math.random): BotArm {
  const open = ARMORY_ORDER.filter((id) => held.filter((h) => h === id).length < cap);
  const pool = open.length ? open : ARMORY_ORDER;
  return ARMORY[pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]].bot;
}
