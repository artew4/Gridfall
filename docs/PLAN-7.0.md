# NEON RAIN 7.0: the deathmatch arena AI

Branch `feature/deathmatch-ai-core-7.0`, based on 6.0 (`e5d2989`). Scope: Team Deathmatch bots that play like players, fast and aggressive and always moving, on a brain and director of their own. Survival, the story and the 5.0 tactical brain stay as they are. The match rules (25 tickets, 3–5 s respawn, 20 damage a round) don't change, so a comparison measures the AI alone.

## Why 6.0's bots were slow (read in the code)
6.0 pointed the 5.0 survival brain at a second team. That brain is deliberately slow, because in survival it has to be a readable, fair threat to one human:
- **Reaction in layers.** A decide comes every 0.16–0.45 s. A spawn holds the bot for 0.55–0.7 s. A gunner waits 0.5–2.2 s in cover before popping up, peeks for up to 0.6 s, shows a 0.6–0.9 s laser telegraph, and an advancing gunner must have moved for 1.4 s before it aims.
- **Rationed fire.** At most 2 shooters at a time (shot tokens), 3-round bursts, 12-round magazines and 2.2 s reloads.
- **Defence.** Near misses pin a bot for 1.6–2.4 s, it holds a cover spot for 9 s after the last news, and it fights in a hide → peek → aim → fire → back cycle.
- **Movement.** There is no sprint state, strafing only happens in two narrow cases, and there is no jump or vault (NPCs never vaulted).

## Survival AI against arena AI
| | Survival (5.0, PvE) | Arena (7.0, PvP bots) |
|---|---|---|
| Goal | a readable, fair threat to one human | a convincing player among nine peers |
| Information | honest LKP; search when contact is lost | a team board of sightings, gunfire and callouts (4 s), like a radar |
| Time scale | seconds (telegraphs give the player a window) | frames (the first accurate round wins) |
| Survival tool | cover and suppression | movement: strafe, sprint, jump, vault, a brief line-of-sight break |
| Director | assigns roles (suppress, flank, rush) | shapes map control (fronts, momentum); bots pick their own fights |
| Death | permanent; the director protects members | cheap (3–5 s respawn): trading is fine, hesitating isn't |

So 7.0 doesn't tune `Squad`: the problem is the opposite one. A separate brain and director run TDM, and survival never constructs them.

## Design
- **Split (`src/enemies/arena/`).** Body and brain are separate:
  - `ArenaGunner` and `ArenaRunner` extend the survival `Gunner` and `Runner` (rig, hitboxes, looks, death) and override only `think`, `onHit`, `suppress`, `onDeath` and three movement hooks.
  - The 5.0 `decide()` never runs. `tac` is kept as a label (action and phase) for the kill log, the debug views and the rig animation.
  - `Tdm.ts` picks the brain with `TDM.ai` (`'arena'`, the default, or `'tactical'`, the exact 6.0 path for comparisons).
- **Enemy hooks** (`Enemy.ts`, default to survival behaviour):
  - `directClear` and `routeTo`: the straight-line test and the graph route.
  - `vaulting`: passed to `resolveCircle`, which already lets the player vault.
  - `ground`: arena bodies fly a jump arc here.
  - Survival calls are byte-for-byte the same.
- **Nav vault links** (`Nav.ensureVaultLinks`, `clearVault`, `route(…, { vault, tries })`):
  - Links across low walls marked vaultable: the corridor is clear at 1.5 m, and every hit on the knee and body rays is a vault wall no taller than 1.35 m.
  - They are built once at match start and used only by arena routes. Survival routes never see them.
- **Brain** (`DeathmatchAI.ts`, one per bot):
  - **Rates.** Decide every 0.06 s in a close fight, 0.09 s further out, 0.15 s calm. A hostile coming into view, or a hit, decides on the same frame. Act runs every frame.
  - **States.** ADVANCE, HUNT, ENGAGE, PUSH and BREAK. See the system doc in Knowledge_Gamedev.
  - **Target scoring.**
    - +1.5 in view, +3 if it hit or near-missed me in the last 1.5 s, +2 if it faces me within 25°, +12/distance, +1 under 40% health.
    - A board contact out of view loses 0.3 per second of age.
    - A visible threat replaces one out of view at once. Between two in view it takes a 15% margin, and at most one switch every 0.4 s unless the new one is shooting at me.
  - **Snap + spread.**
    - Yaw rate 30; it fires within 20° of the aim point, led by the target's velocity over the bolt's flight.
    - Spread 0.025, plus a 0.09 bloom on a fresh target that tightens over 0.3 s (a switch keeps half), +0.01 strafing, +0.03 airborne, and a little jitter from hits.
    - Continuous fire: 5-round bursts, 0.1 s between rounds and 0.15 s between bursts, a 20-round magazine and a 1.5 s reload.
    - Bolts fly at 40 m/s (survival: 24–29).
  - **Movement.**
    - Sprint ×1.5, run ×1.2, strafe 0.8 of the run.
    - Strafe flips every 0.35–0.8 s, towards open space (collider probe, no rays), keeping a 9–20 m band.
    - It jumps when shot (60%, every 1.6 s at most), on 15% of strafe flips, and as a runner closing in.
    - It vaults any vaultable wall ahead (probe every 0.1 s, take-off speed from the wall height).
  - **BREAK.**
    - Triggers: reloading under fire, below 30% health and losing the trade, or two shooters on it.
    - It takes the nearest spot within 7 m the threat can't see (one ray each, two tries), or sidesteps away.
    - Lasts at most 1.6 s; cooldown 4 s.
  - **PUSH.**
    - Trigger: 40+ damage dealt to the target in 2.5 s, or the target under 40% health (runners: 60%, or reloading).
    - It needs a claim (two per victim, a runner may be a third). It rushes, firing on the move with bloom capped at 0.05, for up to 4 s.
- **Director** (`ArenaDirector.ts`, one per team, pure). Every 0.25 s:
  - **Fronts:** progress along the base-to-base axis, ours the median of our bots, theirs the nearest contact.
  - **Momentum:** 0.3 × alive difference + 0.03 × ticket difference + 0.12 × trades in 12 s. The stance is PUSH above 0.25, REGROUP below −0.35, HOLD otherwise.
  - **Lane targets** follow the stance.
  - **Lane balance:** no empty lane; the human counts on his lane and is never commanded.
  - **The contact board:** sightings, gunfire heard within 45 m, and the human's callouts.
  - **Push claims.**
- **Sensing** (`Sensing.ts`). Attention-driven line of sight with no scans. Each frame the due (bot, hostile) pairs are resolved, most important first, within one ray budget (18):
  - **Priorities:** the target every 0.05 s; whoever alerted it at once; firing contacts every 0.15 s; the front cone every 0.3 s; behind it (> 110°) only if alerted, every 0.6 s.
  - **Pre-filters without a ray:** range, and behind its back.
  - **Pair cache:** one ray (eye to chest, with a head ray on a miss) answers a pair for both bots for 0.06 s while neither moves 0.5 m.
  - **Deferral:** a pair over budget stays due and goes first next frame.
- **Scheduler.** The same `ThinkScheduler` instance runs 9 decides, 26 rays and 3 re-plans per frame in arena mode. The tactical path restores the 5.0 defaults (3 / 30 / 2).

## Phases
1. **Split:** arena bodies, brain and director, the `TDM.ai` switch, Enemy hooks.
2. **Movement and combat:** strafe, sprint, jump, vault (nav vault links), snap + spread, the Push, BREAK.
3. **Action economy:** the high-tick scheduler profile, attention-driven sensing with the pair cache, capped route entry search, routes on the floor.
4. **Validation:**
   - `__dev.tdmSim` (a whole match stepped headless at a fixed 1/60 s, independent of the window's frame rate) and `__dev.tdmAB`
   - the 6.0 baseline on an untouched 6.0 checkout
   - `tdmBench`, `bench(3)`, the survival regression and `friendlyFire`
   - unit tests
5. **Knowledge_Gamedev** (separate commit).
