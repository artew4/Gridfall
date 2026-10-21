# NEON RAIN 6.0: 5v5 Team Deathmatch and faction AI

Branch `feature/tdm-factions-6.0`, based on 5.0 (`cb5f78f`). Scope: a new mode, Team Deathmatch, on Desert Outpost: the player and four allied bots (ALPHA) against five bots (OMEGA), 25 tickets a team. Survival, the story and the 5.0 brain stay as they are; the AI is generalised from "enemies against the player" to "teams against teams".

## What 5.0 assumed (read in the code)
- **One target:** every perception ray, aim, lead, melee contact and "don't stand on him" read `ctx.player`. Rounds (`Projectiles`) could only hit the player.
- **One LKP:** the squad knew one position (the player's), written by sightings, heard shots and wave reports.
- **One director per level run** on `Waves`, with its own `ThinkScheduler`.
- **Damage paths:** the player's hitscan reached every enemy; nothing had a team.

## Design
- **Combatants and teams** (`src/combat/Team.ts`): the player (`PlayerUnit`) and every bot (`Enemy`) are `Combatant`s with a `team`, a body to aim at (`headY`, `chestY`), what others can observe (reloading, health, facing, under fire) and `hurt(dmg, from, by)`. Friendly fire is refused at the receiving end (`takeHit`/`hurt` ignore damage from the same team) and avoided at the shooter (rounds pass through teammates; a gunner holds a burst when a teammate is in the line; the player's hitscan skips allies; a blast skips the player's team).
- **Team contexts:** each bot runs with its team's `EnemyCtx` (prototype-chained to the game's, so time, sight range and cover read through live): `squad`, `hostiles`, `friends`, `lanes`, `avoid` (the other team's spawn), `onDeath`. Damage to a bot always runs in the bot's own context, whoever deals it.
- **Perception with several hostiles:** at most two rays per decide (one when the frame's ray budget is short): the hostile it fights first, then the squad's focus, then the nearest. Survival (one hostile) casts exactly one ray, as in 5.0.
- **Contacts and focus:** the squad keeps a contact per hostile; the LKP fields are its focus (the one seen most recently, kept while in sight, moved to another hostile in sight after 1.2 s unseen). A dead hostile is dropped; with none left the squad stands down to its lanes. An anonymous report is adopted by the first named sighting, so survival keeps one contact.
- **Dual directors, one budget:** ALPHA and OMEGA each have a `Squad`; both share one `ThinkScheduler`. `Squad.updateAll` prepares both, then makes one pick across all members (most overdue first, either team) and runs each decide with its own team's context.
- **The human in ALPHA's squad:** the director can't order him, so it infers his role (`HumanObserver`, `src/enemies/tactics/Human.ts`) from the last 3 s: suppressing (steady fire, little movement) → one bot suppressor fewer; pushing (closing on the enemy) → one more; flanking (moving round the fight) → he counts on his side when the bot flankers are balanced; retreating (falling back, or hurt and not advancing) → one more suppressor covers him; holding → default roles; down → four bots. A style must hold for two judgements (0.8 s) before it is adopted, except retreating and down. A bot says how it fits in ("With you, push!", "Hold them there, flanking!", "Fall back, I've got you!", "You go right, I've got left!"). The bots also learn what he sees: every 0.4 s up to three hostiles in front of his camera are checked with a ray and reported as sightings.
- **Lanes:** with no contact, each bot pushes along one of three lanes (left, centre, right) towards the other base and then back to mid-map; a respawned bot takes the lane furthest below its share (30/40/30), counting the human on the lane nearest him.
- **Map:** Desert Outpost becomes a point-symmetric arena: bases north and south (walled yards, three exits each behind a blast wall), a centre lane through the compound, two flanks (a ruined hamlet and a wadi on each, a pump house at each midpoint). The dunes are symmetrised (mean of the field and its 180° rotation), the rocks are placed in pairs, every structure is built twice.
- **Rules (`src/levels/Tdm.ts`):** 25 tickets a team; any death costs its team one; respawn in 3–5 s at its base (the player 4 s) while tickets remain; 2 s spawn protection; the first team at 0 loses. HUD: tickets with bars, a kill feed, a respawn countdown, name tags over allies (Maxim, Anatoly, Kostya, Ilya); a Victory/Defeat screen with the scoreboard.

## Phases
1. Map: arena layout, symmetric dunes and base pads, structures, nav, zones (`ArenaLayout.ts`, `Arena.ts`, `Terrain.ts`, `Outpost.ts`).
2. Factions: combatants, team contexts, multi-hostile perception, contacts and focus, shared scheduler, the human observer, lanes, team-aware rounds.
3. TDM rules, HUD, result screen, menu entry, respawn flow in `Game`.
4. Validation: unit tests, `__dev.friendlyFire()`, `__dev.tdmSoak()`, `__dev.tdmBench()`, `__dev.bench()`, `__dev.world()`/`stress()`/`levelAI()`, survival regression (`tactical()` on the three levels), teardown loop, a scripted human for the role inference.
5. Knowledge_Gamedev (separate commit).
