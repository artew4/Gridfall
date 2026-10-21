import type { ArenaDirector } from './ArenaDirector';
import type { Sensing } from './Sensing';
import type { ThinkScheduler } from '../tactics/Scheduler';
import type { TeamId } from '../../combat/Team';

/*
  The arena AI (7.0): Team Deathmatch bots that play like players, not like survival enemies.

  Survival (5.0) builds a readable threat for one human: reaction windows, telegraphs, rationed
  fire, cover and suppression, an honest last-known position. A deathmatch bot is one of ten peers
  where death is cheap (a 3–5 s respawn) and the first accurate round wins: it sees and fires within
  frames, keeps moving (strafe, sprint, jump, vault), uses cover only to break line of sight for a
  reload, and rushes a wounded enemy to finish him. Its director shapes map control (where the front
  is, push or regroup) instead of handing out roles.

  Same bodies (Gunner, Runner rigs and hitboxes), a different brain: DeathmatchAI.ts. Survival never
  constructs any of it.
*/

export const ARENA = {
  /** Decide interval (s): in a fight under `closeDist`, in a fight further out, out of contact. */
  decide: { close: 0.06, far: 0.09, calm: 0.15, closeDist: 25 },
  /** Frame budget for nine bots (the survival defaults are 3 decides, 30 rays, 2 re-plans). */
  sched: { maxPerFrame: 9, rayBudget: 26, routesPerFrame: 3 },
  /** Spawn: visor up and moving after this (survival: 0.55–0.7 s). */
  emerge: 0.2,
  /** Yaw snap rate (survival aims at 8–10) and the cone it may fire within (rad). */
  yawRate: 30,
  fireCone: 0.35,
  /** Snap + spread: base spread, the bloom of a fresh target and how fast it tightens (s). */
  spread: 0.025,
  bloom: 0.09,
  bloomTime: 0.3,
  /** A target switch keeps this share of the current bloom (at least half a fresh one). */
  switchBloom: 0.5,
  strafeSpread: 0.01,
  airSpread: 0.03,
  /** A push fires on the move at most this bloom (it closes in on someone it already hit). */
  pushBloomMax: 0.05,
  /** Continuous fire: rounds per burst, between rounds, between bursts, magazine, reload (s). */
  burst: 5,
  burstGap: 0.1,
  burstRest: 0.15,
  mag: 20,
  reload: 1.5,
  /** Bolt speed (m/s; survival bolts fly at 24–29, slow enough to sidestep on purpose). */
  boltSpeed: 40,
  /** Movement: sprint and run multipliers of the body's base speed, strafe share of the run. */
  sprint: 1.5,
  run: 1.2,
  strafe: 0.8,
  /** A strafe holds a direction this long (s) before it may flip. */
  flip: [0.35, 0.8] as [number, number],
  /** A gunner's preferred fighting range (m): it closes or opens while strafing. */
  band: [9, 20] as [number, number],
  /** Jump: take-off speed, gravity, cooldown, chance on a strafe flip, chance when shot. */
  jumpV: 5,
  gravity: 15,
  jumpCooldown: 1.6,
  flipJump: 0.15,
  hitJump: 0.6,
  /** Break line of sight: longest stay (s), how far it looks for a spot, low-health trigger, cooldown. */
  breakMax: 1.6,
  breakRadius: 7,
  breakHp: 0.3,
  breakCooldown: 4,
  /** The Push: damage dealt to the target in the window, or its health, and the longest push (s). */
  pushDamage: 40,
  pushWindow: 2.5,
  pushHp: 0.4,
  runnerPushHp: 0.6,
  pushMax: 4,
  /** At most this many bots push one wounded hostile. */
  pushers: 2,
  /** Board contacts expire after this (s); a hunt aims this far ahead along the contact's velocity (s). */
  contactTtl: 4,
  huntLead: 0.6,
  /** A new target must beat the current one by this factor (no flicker between equals). */
  switchMargin: 1.15,
  /** Melee (runner): reach to start and land a swing, windup, strike, recover (s). */
  melee: { start: 1.9, land: 2.5, windup: 0.28, strike: 0.12, recover: 0.3 },
  sense: {
    range: 75,
    /** Re-check the pair it fights (s); a gunfire-hot contact; others in the front cone; behind it (heard only). */
    targetEvery: 0.05,
    hotEvery: 0.15,
    coneEvery: 0.3,
    behindEvery: 0.6,
    /** cos of the half-angles: the front cone (60°) and "behind" (110°). */
    cone: 0.5,
    behind: Math.cos((110 * Math.PI) / 180),
    /** A hit, near miss or shot heard this recently lets it check behind (s). */
    alertFor: 1,
    /** A pair's verdict serves both bots this long (s) while neither moved more than `cacheMove` (m). */
    cacheAge: 0.06,
    cacheMove: 0.5,
    /** Rays per frame for all sensing (inside the scheduler's budget). */
    rays: 18,
  },
  director: {
    every: 0.25,
    tradeWindow: 12,
    push: 0.25,
    regroup: -0.35,
    /** Where the enemy front is assumed with no contact (progress, -1 own base … +1 theirs). */
    unknownFront: 0.35,
  },
};

/** DEV counters for the soak and the report (cheap: plain numbers, filled as things happen). */
export interface ArenaStats {
  jumps: number;
  vaults: number;
  pushes: number;
  pushKills: number;
  breaks: number;
  switches: number;
  /** Why it switched: the old target died or vanished, the new one shot at it, or a bigger threat. */
  switchWhy: { lost: number; shotAt: number; threat: number };
  shots: number;
  /** Seconds from a hostile becoming visible to the first round at it (one per acquisition). */
  reactions: number[];
  /** Sim seconds alive, moving faster than 1.5 m/s, in BREAK, crouched (all bots together). */
  aliveT: number;
  movingT: number;
  breakT: number;
  crouchT: number;
  speedSum: number;
  /** Per callsign: jumps and vaults. */
  perBot: Record<string, { jumps: number; vaults: number; team: TeamId }>;
}

export function newArenaStats(): ArenaStats {
  return { jumps: 0, vaults: 0, pushes: 0, pushKills: 0, breaks: 0, switches: 0, switchWhy: { lost: 0, shotAt: 0, threat: 0 }, shots: 0, reactions: [], aliveT: 0, movingT: 0, breakT: 0, crouchT: 0, speedSum: 0, perBot: {} };
}

/** What an arena bot reads from its team's context (EnemyCtx.arena). */
export interface ArenaCtx {
  director: ArenaDirector;
  sensing: Sensing;
  sched: ThinkScheduler;
  stats: ArenaStats;
}
