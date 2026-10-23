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
  /**
   * 23.0: a bot never steers straight at a goal more than this far above it (m): it takes the route.
   * Infinity (the default, 7.0–22.0): line of sight alone decides. Old Port's profile sets 1 (bots
   * hunting a contact on a stack top pressed into the stair's side rail); on Crash Site, whose terraces
   * and slopes make a goal a metre up walkable, the A/B cost pace (kills/min 27–30 → 23–27).
   */
  directRise: Infinity,
  /**
   * 33.0, corridor following: a moving bot feels for walls either side of its heading (one ray a side
   * at knee height, `reach` m, every `every` s) and steers off a wall nearer than `near` m, harder the
   * nearer (`gain` of its speed at contact); between two walls it keeps to the middle, so it rounds a
   * tunnel's bend on its centre line, not along the inner corner. Off by default; a map's profile turns
   * it on (Deep Jungle, 33.0: its tunnels).
   */
  corridor: { on: false, every: 0.15, reach: 2, near: 0.95, gain: 0.7 },
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
   * 34.0: recognising a figure in the ground fog takes longer: the reaction × (1 + fogReact × the
   * contrast lost, 0 in clear air, 1 at the edge of sight ARENA_SEE): 2.5× there.
   */
  fogReact: 1.5,
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
  /**
   * 35.0, a close threat on the flank or behind (Maglev: players flanking by the spawn zones shot bots
   * in the side and back for seconds while they kept fighting the man in front). Squared distances.
   * A hostile in sight that is not what it fights is a pressing threat when:
   *  - it hit the bot in the last `hitFor` s from outside the front cone (`cos`: 60°; any range), or
   *    from nearer than what it fights: + `bonus`;
   *  - or it is outside the front cone, within `radius` and nearer than what it fights: + `bonus` ×
   *    (0.5 to 1, the nearer the more; never the farther of two, so two close hostiles don't flip it
   *    back and forth).
   * A pressing threat that outscores the target is switched to at once (no 15% margin), at most every
   * `hold` s. Also:
   *  - `hear`: a shot fired within it alerts the bot that hears it (it looks behind: Sensing).
   *  - `close`: a hostile this near is checked even behind it, alerted or not; anything within
   *    `radius` is checked at least every `closeEvery` s.
   *  - `snap`: hit, or a shot heard close, by one it can't see: it turns to the shooter for this long.
   * `on: false` is 34.0's bot (tdmSim A/B).
   */
  flankThreat: { on: true, radius: 10, cos: 0.5, bonus: 8, hitFor: 1, hold: 0.6, hear: 12, close: 8, closeEvery: 0.15, snap: 0.7 },
  /**
   * 35.0, scanning on the way out (a map's profile turns it on; Maglev): with no target in view and in
   * its own half (director.progress under `until`), a moving bot glances to one side, then the other,
   * every `every` s for `hold` s, `angle` degrees off its heading: its sight cone sweeps the side halls
   * (to 110° off its heading) and the way ahead stays inside it (60°). At 75° the way ahead fell out of
   * the cone: Maglev self-play, quiet time 21 -> 28%.
   */
  scan: { on: false, every: [1.6, 2.6] as [number, number], hold: 0.35, angle: 50, until: 0.1 },
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
   * 27.0, patrol (maps with spawn pads; ArenaDirector): areas take activity from deaths (1), heard
   * rounds (0.04 each) and heard spawns (`spawn`) within `radius` m, halving every `halfLife` s; an area
   * counts as looked at while a member is within `near` m. A pick: `heat` × min(`heatCap`, activity) +
   * `stale` × min(1, unseen / `staleT`) + `lane` if in the bot's own lane (the director's balance, by
   * the map's lane weights) − distance / `distM` − `claim` × bots already on it + U(0, `jitter`); areas
   * within `minGap` m of the bot (or of each other, at setup) are skipped. At an area it looks round
   * for `dwell` s, then picks again. The team's radar reaches `radar` m on these maps: a contact
   * further off (out of sight, not shooting at the bot) is not hunted.
   */
  /**
   * 38.0, the flanks' pull (patrol maps that mark their flanks, TdmData.flankOf; on through a map's
   * profile): an area on a flank scores `base` more, and up to `hot` more as the centre heats up (its
   * deaths and gunfire, counted as lane pressure counts them, halving every `halfLife` s, over `ref`):
   * a fight in the middle draws the patrols round it instead of into it.
   */
  flankPull: { on: false, base: 0.4, hot: 0.8, ref: 4, halfLife: 15 },
  patrol: { radar: 40, halfLife: 20, radius: 22, spawn: 0.6, near: 5, heat: 0.6, heatCap: 1.5, lane: 0.8, stale: 1.4, staleT: 40, distM: 110, claim: 0.7, jitter: 0.25, minGap: 9, dwell: [0.5, 1.4] as [number, number] },
  /**
   * 32.0, space (anti-clustering): a team uses the map's width instead of moving as one blob.
   *  - fights: a bot with a teammate within `engageR` m strafes away from it, and eases away from it
   *    (`engagePush` of its speed, more the closer it is);
   *  - patrols: an area's score loses `patrol` × crowd, the crowd being every teammate standing within
   *    `patrolR` m of it and every area a teammate has claimed within that (each 1 − d / patrolR); and
   *    gains `width` × its lane's need (ArenaDirector.laneNeed: 1 for a lane nobody is in or headed to,
   *    below 0 for one with more than its share), so the team covers the map's width;
   *  - hunts: the bots after one contact are numbered as they join (forgotten after `huntTtl` s): the
   *    first goes straight, the next ones to approach points `approach` m to either side of the line
   *    to it (alternating, further for each pair), snapped to the nav; within `direct` m of the
   *    contact (or `arrive` m of its point) a bot goes straight in;
   *  - crowds: a bot fighting a target it sees with `crowd` or more teammates within `crowdR` m, the
   *    group's highest uid, with `crowdHp` of its health or more, goes round (a flank claim, ARENA.flank's point and limits, the group's centre
   *    as the line it leaves) and keeps shooting on the way; `crowdCd` s before it does again.
   * Off by default (the 31.0 bots); a map's profile turns it on (Neon Docks, 32.0: measured there only).
   */
  space: { on: false, engageR: 10, engagePush: 0.8, patrol: 1.2, patrolR: 22, width: 0.9, huntTtl: 3, approach: 12, direct: 16, arrive: 4, crowd: 2, crowdR: 10, crowdCd: 8, crowdHp: 0.6 },
  /**
   * 41.0, fireteams and sectors (ArenaDirector): a team plays as small squads spread over the map's
   * sectors (the director's lanes), not as one crowd and not as lone runners.
   *  - Fireteams: a bot with no fireteam joins one with room (at most `team`) whose leader (its lowest
   *    uid) is within `join` × the map's density radius (TdmData.spawnTuning.densityR) on its level, or
   *    starts one; lone bots near each other merge. Members share the leader's sector; with nothing on
   *    the board the leader picks the patrol area and the others go with it: to the leader when further
   *    than `follow` × the radius (at least `followMin` m), else beside it, watching another way.
   *  - Engagement cap: a bot chasing a hostile it can't see commits to it; at most `commit` of the team
   *    (fireteam mates included) chase one hostile. A bot finds another target, else patrols (the sector
   *    terms below send it elsewhere). One it can see is still shot, `overPen` less attractive than a
   *    target nobody holds. One shooting at it is always fair game. `overFlank`: one of a group on such a
   *    target goes round it (the ARENA.space crowd flank, here without space on). `site`: the same for
   *    a fight: at most this many of the team after hostiles within the density radius of each other
   *    (two fireteams on two of a group are one fight); 0: no site cap. A shooter on such a target
   *    keeps its range (doesn't close in), and in a fight eases off teammates within space.engageR m
   *    (its own fireteam within `mateR`), as ARENA.space's fighters do.
   *  - Sectors: a sector holding the crowd line (`crowd`, or a fair share + 1 when that is more) of the
   *    team is crowded. Patrol areas there score `crowdPen` less per bot over it; an area scores
   *    `need` × its sector's need (fair share − share). New fireteams aren't sent to a sector with
   *    `crowd` or more fighting. Every `peelCd` s a crowded sector sends one fireteam out of any fight
   *    to the neediest sector.
   * `on: false` is 40.0's bot (the A/B).
   */
  sectors: { on: true, team: 3, join: 1.5, follow: 0.6, followMin: 5, commit: 3, commitTtl: 1, overPen: 3, overFlank: true, site: 4, mateR: 4, crowd: 4, crowdPen: 1.5, need: 1, peelCd: 4 },
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
  /**
   * 29.0, the last stand (the team's tickets are gone: every death is final). Its bots stop sprinting
   * (`run` instead), keep together: HOLD a cover spot within `near` m of the team's centre (claimed:
   * one bot a spot), crouched, facing the freshest threat; re-picked every `every` s or when the centre
   * moves `drift` m. They hunt only within `radar` m (or whoever shoots at them), never flank alone,
   * and rush a wounded target only under `pushHp` of its health. On the sudden-death clock (behind, or
   * tied) it holds too until `pressAt` s are left, then presses as a group (it must kill or lose): no
   * radar limit, but at a run and never flanking alone; a kill resets the clock and it holds again.
   * Off: they fight on as before (the A/B).
   */
  /**
   * 30.0, stamina (Stamina.ts; each bot's pool is its gun's weight class). A bot walks (its `run`)
   * unless it has a reason to sprint: retreating or diving for cover under fire, flanking, pushing
   * with a close gun (SMG, shotgun, pistol: a rifle walks up to its range), or crossing ground a
   * hostile can see (one in its own view, or one the team saw within `exposedFor` s and `exposedR` m).
   * The optional sprints (crossing, flanking) only start with `reserve` or more in the pool and stop
   * at `floor` (the fight they lead to starts with that much); a push stops at `pushFloor`; only a
   * retreat may run the pool dry. (First version: start at 35, run to 0: 42% of fights started under
   * 20, bots dry a quarter of their time.)
   */
  stamina: { reserve: 50, floor: 30, pushFloor: 10, exposedR: 40, exposedFor: 1.5 },
  lastStand: { on: true, near: 9, every: 8, drift: 6, radar: 25, pushHp: 0.25, pressAt: 30 },
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
  /**
   * 20.0, under long-range fire (off by default; Maglev Terminal turns it on): a round from a shooter
   * `range` m or more away (a hit; a near miss too if `nearMisses`) makes the bot break for cover from
   * that shooter within `window` s, or slide out of its line when there is no cover spot near (the
   * break's sidestep). Not when it is winning that duel: the shooter is its own target and its aimed
   * shot is `duel` of the way to ready, or the shooter is closer than `range`. Its own `cooldown` (s; the break's 4 s one let a marksman's second
   * hit land on a bot standing still); with no cover spot near it slides out of the line (`slide`: the chance).
   */
  underFire: { on: false, range: 16, nearMisses: true, window: 1.0, duel: 0.7, cooldown: 1.5, slide: 1 },
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
  switchWhy: { lost: number; shotAt: number; threat: number; flank: number };
  /** 35.0: shots heard close (alerts), hits taken under spawn protection (noticed), glances. */
  aware: { heardClose: number; protectedHits: number; snaps: number; scans: number };
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
  /** 27.0: patrols that reached their area. */
  patrolArrive: number;
  /** 37.1: watches that reached their post (TdmData.highGround), and seconds on watch there. */
  watchHolds: number;
  watchT: number;
  /** 32.0: hunts sent round to a side approach, and crowded fighters sent round (ARENA.space). */
  approaches: number;
  crowdFlanks: number;
  /** 30.0: seconds sprinting by reason, seconds run dry, times run dry; the pool when a fight starts (engage). */
  sprintWhy: { cross: number; flank: number; push: number; retreat: number };
  exhaustedT: number;
  emptied: number;
  staminaAtEngage: number[];
  /** 29.0: seconds spent in HOLD (the last stand), and holds that reached their spot. */
  holdT: number;
  holdArrive: number;
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
  slideWhy: { push: number; dive: number; exposed: number; evade: number };
  /** 20.0: breaks taken because of long-range fire (ARENA.underFire). */
  evades: number;
  /** 41.0: hostiles passed over as over-committed (left to those on them), followers sent to their leader. */
  capSkips: number;
  follows: number;
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
  return { jumps: 0, vaults: 0, pushes: 0, pushKills: 0, breaks: 0, switches: 0, switchWhy: { lost: 0, shotAt: 0, threat: 0, flank: 0 }, aware: { heardClose: 0, protectedHits: 0, snaps: 0, scans: 0 }, shots: 0, aimedShots: 0, hipShots: 0, aimT: 0, aimedRange: [], hipRange: [], aimedHitRange: [], hipHitRange: [], fogShots: 0, reactions: [], aliveT: 0, movingT: 0, breakT: 0, crouchT: 0, speedSum: 0, perBot: {}, laneMoves: 0, flanks: 0, flankHigh: 0, flankArrive: 0, patrolArrive: 0, watchHolds: 0, watchT: 0, approaches: 0, crowdFlanks: 0, sprintWhy: { cross: 0, flank: 0, push: 0, retreat: 0 }, exhaustedT: 0, emptied: 0, staminaAtEngage: [], holdT: 0, holdArrive: 0, flankEngage: 0, flankKills: 0, retreats: 0, retreatWhy: { unseen: 0, outnumbered: 0 }, retreatLived: 0, retreatDeaths: 0, slides: 0, slideWhy: { push: 0, dive: 0, exposed: 0, evade: 0 }, evades: 0, capSkips: 0, follows: 0 };
}

/** What an arena bot reads from its team's context (EnemyCtx.arena). */
export interface ArenaCtx {
  director: ArenaDirector;
  sensing: Sensing;
  sched: ThinkScheduler;
  stats: ArenaStats;
}
