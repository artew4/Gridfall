import type { Ballistic, GunSound, WeaponSpec } from '../types';
import { KITSUNE_9 } from './kitsune9';
import { JACKAL_AR } from './jackal';
import { BOAR_SHOTGUN } from './shotgun';
import { HORNET_SMG } from './hornet';

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

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun';

/** A gun in an arena bot's hands (DeathmatchAI reads every number here instead of ARENA's rifle). */
export interface BotArm {
  id: WeaponId;
  /** Feed tag and the sound and look of its rounds. */
  tag: string;
  sound: GunSound;
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
  /** 21.0: damage falloff by distance flown (the player's gun's own). */
  falloff?: { near: number; far: number; min: number };
  /** 21.0: head hits × this (on top of ×2). */
  headMul?: number;
  /** 21.0: a hit shoves and staggers (the shotgun). */
  knock?: { push: number; stagger: number };
  /**
   * 21.0, how it moves with this gun: `run` × its run and sprint; `aimMove`, while aiming, the share of
   * the run it keeps (the pistol keeps all of it: no planted feet; others walk, ARENA.ads); `slide`
   * × its liking for slides (the shotgun's dive into close range); `hop`, it pushes from cover to
   * cover on every map (ARENA.coverPush, which otherwise only a map's profile turns on).
   */
  agility: { run: number; aimMove?: number; slide: number; hop?: boolean };
}

export interface ArmoryEntry {
  id: WeaponId;
  /** Key in the loadout picker. */
  key: '1' | '2' | '3' | '4';
  /** What it is, in a word or two, and one line on how it plays. */
  kind: string;
  blurb: string;
  spec: WeaponSpec;
  bot: BotArm;
}

/*
  21.0, the asymmetric arsenal. Every gun wins somewhere and loses somewhere (docs: the balance math
  in the KB, 04_GAME_DESIGN/asymmetric-weapon-balance.md). Against a bot's 150 hp, the player's:

    gun      dmg × rate        body TTK      head TTK    falloff           move / aiming   ADS in
    pistol   30  every 0.16 s  5 → 0.64 s    2 → 0.16 s  25 → 40 m (45%)   108% / 100%     0.10 s
    SMG      15  every 0.055   10 → 0.50 s   5 → 0.22 s  12 → 30 m (55%)   100% / 70%      0.15 s
    rifle    21  every 0.092   8 → 0.64 s    4 → 0.28 s  35 → 60 m (70%)   95% / 62%       0.20 s
    shotgun  8 × 22 a shell    1 inside 8 m (176), 2–3 at 10–12 m, ~0 past 15 m   85% / 55%    0.25 s

  The bots fight to the same shapes (their rounds are a share of the TDM 20): the SMG the fastest
  stream of the weakest rounds, out-trading the rifle under 12 m and falling off past it; the pistol
  a precise sidearm whose head hits drop a bot in three and whose owner never stops moving; the
  shotgun a slide into the face; the rifle the long arm.
*/
export const ARMORY: Record<WeaponId, ArmoryEntry> = {
  pistol: {
    id: 'pistol',
    key: '1',
    kind: 'SIDEARM',
    blurb: 'Fastest draw and sights. Full speed aimed. Headshots.',
    spec: KITSUNE_9,
    bot: {
      id: 'pistol',
      tag: 'PST',
      sound: 'plasma',
      ballistic: 'energy',
      bolt: { core: [0.6, 3.2, 4.2], trail: [0.1, 0.7, 1.0], size: 0.75 },
      // 15 a round to a bot, 51 to the head: three head hits, ten to the body. (The sims: at 20 a
      // round its bots, hard to hit at a full run, took 21–24% of the kills; the target is ~15%.)
      damage: 0.75,
      pellets: 1,
      pelletSpread: 0,
      mag: 12,
      reload: 1.2,
      burst: 3,
      burstGap: 0.19,
      burstRest: 0.16,
      hipSpread: 0.004,
      band: [6, 14],
      aim: { enter: 14, exit: 12, burst: 2, burstRest: 0.26 },
      maxRange: 22,
      pushRange: 22,
      model: { length: 0.42, bulk: 0.75 },
      falloff: { near: 25, far: 40, min: 0.45 },
      headMul: 1.7,
      agility: { run: 1.12, aimMove: 1, slide: 1 },
    },
  },
  smg: {
    id: 'smg',
    key: '2',
    kind: 'SMG',
    blurb: 'Highest fire rate, tight from the hip. Shakes; weak far.',
    spec: HORNET_SMG,
    bot: {
      id: 'smg',
      tag: 'SMG',
      sound: 'smg',
      ballistic: 'energy',
      bolt: { core: [3.4, 0.8, 3.6], trail: [0.8, 0.15, 0.9], size: 0.55 },
      // 14 a round: eleven to drop a bot, a stream of them.
      damage: 0.7,
      pellets: 1,
      pelletSpread: 0,
      mag: 32,
      reload: 1.6,
      burst: 8,
      burstGap: 0.062,
      burstRest: 0.12,
      hipSpread: 0.005,
      band: [5, 12],
      aim: { enter: 16, exit: 14, burst: 5, burstRest: 0.22 },
      maxRange: 26,
      pushRange: 25,
      model: { length: 0.68, bulk: 0.9 },
      falloff: { near: 12, far: 30, min: 0.55 },
      agility: { run: 1.04, slide: 1.2 },
    },
  },
  ar: {
    id: 'ar',
    key: '3',
    kind: 'ASSAULT RIFLE',
    blurb: 'The all-rounder. Steady at range; wide from the hip.',
    spec: JACKAL_AR,
    bot: {
      id: 'ar',
      tag: 'AR',
      sound: 'rifle',
      ballistic: 'kinetic',
      bolt: { core: [4, 2.6, 1.2], trail: [1, 0.6, 0.25], size: 0.7 },
      // The 7.0–12.0 arena rifle (ARENA's numbers); 21.0: a wider hip cone (0.012 → 0.02).
      damage: 1,
      pellets: 1,
      pelletSpread: 0,
      mag: 20,
      reload: 1.5,
      burst: 5,
      burstGap: 0.1,
      burstRest: 0.15,
      hipSpread: 0.02,
      band: [10, 22],
      aim: { enter: 13, exit: 11, burst: 3, burstRest: 0.3 },
      maxRange: 40,
      pushRange: 25,
      model: { length: 1, bulk: 1 },
      falloff: { near: 35, far: 60, min: 0.7 },
      agility: { run: 0.97, slide: 1 },
    },
  },
  shotgun: {
    id: 'shotgun',
    key: '4',
    kind: 'PUMP SHOTGUN',
    blurb: 'One shell drops a man up close. Useless past 15 m.',
    spec: BOAR_SHOTGUN,
    bot: {
      id: 'shotgun',
      tag: 'SG',
      sound: 'shotgun',
      ballistic: 'kinetic',
      bolt: { core: [4, 2.4, 1], trail: [1, 0.55, 0.2], size: 0.6 },
      // Eight pellets of 0.95 (19 to a bot): 152 with all of them on inside 8 m, a bot's 150; by 15 m
      // a pellet is 8% of that.
      damage: 0.95,
      pellets: 8,
      pelletSpread: 0.06,
      mag: 6,
      reload: 2.6,
      burst: 1,
      burstGap: 0.82,
      burstRest: 0.82,
      hipSpread: 0.004,
      band: [2.5, 7],
      aim: null,
      // Past 13 m it runs up rather than fire.
      maxRange: 13,
      pushRange: 30,
      model: { length: 0.85, bulk: 1.35 },
      falloff: { near: 8, far: 15, min: 0.08 },
      knock: { push: 2.5, stagger: 0.3 },
      agility: { run: 0.98, slide: 2.6, hop: true },
    },
  },
};

export const ARMORY_ORDER: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun'];

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && v in ARMORY;
}

/** The entry bound to a picker key ('1'…'4', or a KeyboardEvent code 'Digit1'…), else null. */
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
