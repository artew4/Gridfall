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
  /**
   * 8.1: aim through fog. Extra spread × (1 − contrast left at the target's distance): nothing in
   * clear air, +0.06 at the edge of sight in a sandstorm (world/Visibility.ts).
   */
  fogSpread: 0.06,
  /**
   * 11.0, human-like shot choice by range (see DeathmatchAI `wantAim`):
   *  - close (under `exit` m, or under `enter` m if not already aiming): hip fire on the move, full
   *    speed strafing, `hipSpread` wider than before (and the bloom of a fresh target);
   *  - long range (over `enter` m): it slows to `walk` of its run speed (standing still while it
   *    focuses), raises the rifle to the eye, takes `focus` seconds to settle on the target (longer
   *    the further it is), then fires short `burst`s with `spread` (no bloom) and `burstRest` between.
   *  Hysteresis between `exit` and `enter` (12 m ± 1) stops it flicking between the two at the border.
   *  Beyond `maxRange` it closes in instead of shooting.
   */
  ads: {
    enter: 13,
    exit: 11,
    /** Focus time (s): `focus[0]` at `enter`, + `focusPerM` per metre beyond, at most `focus[1]`. */
    focus: [0.24, 0.45] as [number, number],
    focusPerM: 0.008,
    /** While focusing it all but stops; aiming, it walks (share of its run speed). */
    focusMove: 0.12,
    walk: 0.32,
    spread: 0.006,
    burst: 3,
    burstRest: 0.3,
    /**
     * Effective range (m): beyond it a rifleman doesn't plink, he moves up (at a run, not firing)
     * until he is in range, then plants and aims. Without it the desert became a 50 m standoff.
     */
    maxRange: 40,
    /** Holds an angle this long after losing sight before lowering the rifle (s). */
    hold: 0.6,
    /** Back on the same target within this long (a jump, a moment out of the cone): its focus stands (s). */
    keep: 0.5,
  },
  /** 11.0: extra spread firing from the hip at close range (rushing, strafing at full speed). */
  hipSpread: 0.012,
  /** A push fires on the move at most this bloom (it closes in on someone it already hit). */
  pushBloomMax: 0.05,
  /** Continuous fire: rounds per burst, between rounds, between bursts, magazine, reload (s). */
  burst: 5,
  burstGap: 0.1,
  burstRest: 0.15,
  mag: 20,
  reload: 1.5,
  /**
   * Round speed (m/s; survival bolts fly at 24–29, slow enough to sidestep on purpose). 8.1: 40 → 70,
   * both teams alike (kinetic rifles read as fast tracers; a per-look speed would make the docks'
   * rifles against plasma unfair). Survival keeps its dodgeable rounds.
   */
  boltSpeed: 70,
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
  /**
   * 11.0: a gunner pushes only a target within this range (m). Further out it finishes the wounded
   * with aimed fire instead of sprinting 40 m at it spraying from the hip, as a player would.
   */
  pushRange: 25,
  /** At most this many bots push one wounded hostile. */
  pushers: 2,
  /** Board contacts expire after this (s); a hunt aims this far ahead along the contact's velocity (s). */
  contactTtl: 4,
  /**
   * 8.0, lane discipline: a contact further than this is hunted along the bot's own lane, to the
   * lane waypoint level with it, before crossing over (flanks instead of everyone taking the
   * shortest path down the middle).
   */
  laneLeave: 22,
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
  /**
   * 12.0, shared team spotting: a hostile anyone on the team (a bot, or the human) has in line of
   * sight is on the team's minimap and board; the dot fades `fade` s after the last sighting. The
   * human's eyes: a field of view (cos of its half-angle: a 16:9 screen at 74° vertical is ±53°)
   * checked every `every` s through the shared sensing pass.
   */
  spot: { fade: 2.5, viewCos: Math.cos((58 * Math.PI) / 180), every: 0.12 },
  /**
   * 12.0, flanking a spotted hostile. A bot out of sight of a contact a teammate is fighting right
   * now (seen within `fresh` s, the spotter at least `spotterGap` m from the bot) and between `min`
   * and `max` m away goes round: to a point `dist` m from the contact, `angle` off the spotter's
   * line, on the side nearer to it. At most `per` flankers on one hostile; a flank gives up after
   * `maxT` s; `cooldown` before the same bot flanks again.
   */
  flank: { fresh: 1, spotterGap: 8, min: 14, max: 55, dist: 11, angle: (105 * Math.PI) / 180, per: 2, maxT: 9, cooldown: 6, arrive: 3 },
  /**
   * 15.0, lane pressure: each team keeps a heat per lane (deaths there, `death` each, and gunfire it
   * hears there, `shot` per round), halving every `halfLife` s. New bots take the lane with the
   * lowest (bots on it + `weight` × heat); and while one lane runs `hot` hotter than another with at
   * least two bots on it, one of them moves to the cooler lane (at most every `moveCd` s). Lane
   * discipline (8.0: a far contact is hunted along the bot's own lane) turns that into routes.
   */
  lanePressure: { on: true, halfLife: 10, death: 1, shot: 0.04, weight: 1.2, hot: 1.5, moveCd: 6 },
  /**
   * 14.0, high ground: a flank's spot may be a floor up to `up` m above the contact (a landing, a
   * roof's edge), each metre of height worth `perM` m of distance, within `reach` m of the flank point.
   * Off (A/B): flank spots on the contact's own level, as 12.0.
   */
  vantage: { on: true, up: 8, perM: 0.8, reach: 8 },
  /**
   * 12.0, retreat and regroup instead of fighting to the death: it took `unseenDmg` (health share)
   * within `window` s from someone it can't see, or it sees at least `outSeen` hostiles, `outnumbered`
   * more than it has friends within `friendR` m (and is under `outHp` health). It breaks line of sight and sprints to
   * the nearest friend behind it (or back down its lane); done within `joinR` m of a friend, after
   * `maxT` s, or cornered (a hostile in sight within `corner` m: it fights). `cooldown` between.
   */
  retreat: { on: true, unseenDmg: 0.3, window: 2, outnumbered: 2, outSeen: 3, friendR: 18, outHp: 0.6, joinR: 7, maxT: 6, corner: 8, cooldown: 10 },
  /**
   * 12.0, slides (the player's model, Slide.ts): rushing a wounded target `push` m out, diving into a
   * spot `dive` m ahead, or crossing open ground with a fresh contact within `exposed` m. Needs `open`
   * m clear ahead and a sprint; `cooldown` s between slides (×1/personality).
   */
  slide: { on: true, push: [6, 14] as [number, number], dive: [2.5, 7] as [number, number], exposed: 30, open: 4.5, cooldown: 3, spread: 0.02 },
  /**
   * 12.0, every bot is a little different and none reacts on the same frame as another: a reaction
   * time drawn per bot (mean, sd, clamp), stretched or shortened a little per event; decide intervals
   * jittered ±`jitter`; aggression (push thresholds, range band), patience (aimed focus) and a liking
   * for flanks and slides drawn per bot.
   */
  persona: { react: [0.17, 0.045] as [number, number], reactClamp: [0.09, 0.32] as [number, number], jitter: 0.25, aggro: [0.8, 1.25] as [number, number], patience: [0.85, 1.2] as [number, number], flank: [0.35, 1] as [number, number], slide: [0.4, 1] as [number, number] },
  /**
   * 19.0, the cover-hop push (off by default; Crash Site turns it on): a close-range gun (`arms`)
   * pushing a target it can see further than `minDist` m doesn't sprint straight down its sights. It
   * hops: every `every` s it picks a cover spot within `hop` m, at least `gain` m nearer the target and
   * out of its sight (a wall, a trunk, or the undergrowth's concealment), and sprints there; with no
   * such spot it rushes as before. Two rays at most per pick.
   */
  coverPush: { on: false, arms: ['smg', 'shotgun'] as string[], minDist: 9, hop: 9, gain: 2.5, every: 0.6 },
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
  /**
   * 11.0: rounds fired aimed (long range, rifle raised) and from the hip; seconds aiming (all bots);
   * the firing range of every round and of every round that hit (each round carries its own tag).
   */
  aimedShots: number;
  hipShots: number;
  aimT: number;
  aimedRange: number[];
  hipRange: number[];
  aimedHitRange: number[];
  hipHitRange: number[];
  /** 8.1: rounds fired at a target beyond the fog sight range (must stay 0). */
  fogShots: number;
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
  /** 12.0: flanks started, that reached their point, that ended in an engage from it, kills on the flank. */
  flanks: number;
  flankArrive: number;
  flankEngage: number;
  flankKills: number;
  /** 12.0: retreats (by why), those still alive `maxT` s on, deaths during one. */
  retreats: number;
  retreatWhy: { unseen: number; outnumbered: number };
  retreatLived: number;
  retreatDeaths: number;
  /** 15.0: bots moved off a hot lane to a cooler one. */
  laneMoves: number;
  /** 14.0: flanks whose spot was above the contact (high ground). */
  flankHigh: number;
  /** 12.0: slides (by why). */
  slides: number;
  slideWhy: { push: number; dive: number; exposed: number };
}

/**
 * 19.0: a map's tuning of the arena AI: any of ARENA's entries, objects merged one level deep
 * (`{ flank: { per: 3 } }` changes `per` and keeps the rest).
 */
export type ArenaProfile = { [K in keyof typeof ARENA]?: (typeof ARENA)[K] extends readonly unknown[] ? (typeof ARENA)[K] : (typeof ARENA)[K] extends object ? Partial<(typeof ARENA)[K]> : (typeof ARENA)[K] };

/** Applies a profile to ARENA; returns the function that puts every value it changed back. */
export function applyProfile(profile: ArenaProfile | undefined): () => void {
  const undo: (() => void)[] = [];
  const A = ARENA as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(profile ?? {})) {
    const cur = A[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      const o = cur as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        const was = o[k2];
        o[k2] = v2;
        undo.push(() => (o[k2] = was));
      }
    } else {
      A[k] = v;
      undo.push(() => (A[k] = cur));
    }
  }
  return () => {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]();
  };
}

export function newArenaStats(): ArenaStats {
  return { jumps: 0, vaults: 0, pushes: 0, pushKills: 0, breaks: 0, switches: 0, switchWhy: { lost: 0, shotAt: 0, threat: 0 }, shots: 0, aimedShots: 0, hipShots: 0, aimT: 0, aimedRange: [], hipRange: [], aimedHitRange: [], hipHitRange: [], fogShots: 0, reactions: [], aliveT: 0, movingT: 0, breakT: 0, crouchT: 0, speedSum: 0, perBot: {}, laneMoves: 0, flanks: 0, flankHigh: 0, flankArrive: 0, flankEngage: 0, flankKills: 0, retreats: 0, retreatWhy: { unseen: 0, outnumbered: 0 }, retreatLived: 0, retreatDeaths: 0, slides: 0, slideWhy: { push: 0, dive: 0, exposed: 0 } };
}

/** What an arena bot reads from its team's context (EnemyCtx.arena). */
export interface ArenaCtx {
  director: ArenaDirector;
  sensing: Sensing;
  sched: ThinkScheduler;
  stats: ArenaStats;
}
