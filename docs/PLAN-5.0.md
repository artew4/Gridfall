# NEON RAIN 5.0: tactical AI and combat overhaul

Branch `feature/tactical-ai-5.0`, based on 4.2 (`f8d3b19`). Scope: the **survival** enemies (runners and gunners in Arcade Survival on all three settings). The story guards (`stealth/Guard.ts`) keep their own perception/pursuit AI (3.1, human-validated) and are untouched except for two shared engine changes (path re-plan budget, the heap Dijkstra).

## Root causes (read in the 4.2 code)
- **Runners** chased `player.pos` every frame through walls and fog: no perception at all, and every runner came straight in from wherever it was.
- **Gunners** picked a cover point by one ray from the point to the player's head (a spot with a shot, not a spot that hides anything), walked there and strafed; `canSee` ran a ray every frame per gunner; with no sight they still faced and orbited the live player position.
- **No squad**: nobody knew what anyone else was doing, so all gunners could aim at once, runners arrived one by one, and nothing ever lost the player.
- **Cover data**: authored cover points sit on one side of their obstacle; walk round it and there is no other side.

## Design
- **Two-rate brain.** Each enemy has a heavy `decide` (perception ray, cover upkeep and search, utility scoring, goals) and a cheap per-frame `act` (steering, aim, fire timers, crouch, animation).
- **Utility AI.** Candidate actions score themselves from considerations; the best wins, with stickiness for the current action. Committed actions (a burst, a swing, a reload) can only be replaced by an interrupt (pinned, cover blown). Gunner actions: `takeCover`, `fight` (pop-and-shoot phases), `advance` (open ground), `pinned`, `reload`, `hunt`, `search`, `idle`, `watch` (snipers). Runner actions: `stage`, `rush`, `dodge`, melee `windup/strike/recover`, `hunt`, `search`, `idle`.
- **Time-slicing.** A `ThinkScheduler` starts at most 3 decides per frame (most overdue first, urgent ones such as near misses ahead), with a shared budget of 30 rays per frame and at most one full cover search per frame. Decide intervals: 0.16 s close in a fight, 0.24–0.36 s further out, 0.45 s calm. Path re-plans are capped at 2 per frame.
- **Squad director** (`Squad`): the only owner of what the squad knows about the player, the LKP. Only an enemy's own perception ray, a heard gunshot (a noisy position) or the wave's dispatch report (±8 m) write it. Modes: `engage → hunt → search → idle`. Roles every 0.4 s: 1–2 suppressors, flankers balanced left/right of the squad's front, rushers on angular slots, snipers. Shot tokens (2, +1 for a suppressor, +1 from wave 5) cap how many aim at once. The rush signal sends staged rushers together on an opening (he reloads in view, he's under fire, he's hurt, he turned his back) or once enough are massed or waited 6 s.
- **Dynamic cover**: a spot is cover against a threat when a hunkered body there is hidden from his eyes (two rays) and a peek (stand up, lean 0.8 m, step out 1.35 m) has his chest in sight. Verdicts are cached squad-wide per spot for 0.6 s/1 m. In cover, the gunner re-checks: seen from his position for 0.3 s means blown (relocate, "cover's blown"), no shot left means stale (quietly relocate). Cover candidates are the authored spots plus spots generated round every waist-high solid box and pillar/trunk.
- **Suppression**: his rounds passing within 1.8 m of an enemy's chest dose it (0.25–0.75 per pull per enemy); ≥1 pins a gunner for 1.6–2.4 s (hunker, no shots), then a raised threshold for 3 s. Runners juke sideways instead.
- **Ghosting**: "lost" only when nobody has seen him for 2 s *and* someone looked (standing, not hunkered) and saw nothing 0.8 s after the last sighting — or 6 s of no sighting at all. Hunters go to the LKP pushed 1 s along his last velocity (≤5 m); then a search plan of up to 12 points round the LKP (nav nodes on any level within 10 m vertically, plus cover spots), claimed so searchers spread, widened twice, 22 s, then give up and roam. The jungle undergrowth now conceals (sight through ≥ a few metres of bushes fails), from the placement density field so it never depends on the preset.
- **Barks**: a squad speaks one line at a time (1.3 s gap, 0.5 s for priority lines; per-kind and per-speaker cooldowns). Text above the speaker (dimmed when only heard), a voice cadence from its position (radio squelch for humans, a chirp for synths). Lines per voice: humans shout, synths speak protocol.

## Phases
1. Architecture: scheduler, utility selection, two-rate enemies, crouch with matching hitboxes.
2. Squad director: knowledge, roles, slots, tokens, rush signal.
3. Cover and movement: dynamic cover, generated spots, pop-and-shoot, compromised/stale cover, suppression.
4. LKP: lose-sight rule, hunt prediction, search plan, concealment in the jungle.
5. Barks: gate, view, audio.
6. Validation: unit tests, `__dev.tactical()` scenarios per level, `__dev.aiBench()` before/after, `__dev.bench()`, live survival in all three settings.
7. Knowledge_Gamedev (separate commit).
