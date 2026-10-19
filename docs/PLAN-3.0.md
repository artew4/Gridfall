# NEON RAIN 3.0 — Cinematic Escape: implementation plan

Baseline: tag `v2.0` (= `b7226fc`, NEON RAIN 2.0). Work branch: `feature/cinematic-escape`. No remote push.

## What exists (verified in code)
- Three.js 0.186 + TS + Vite, one `Game` orchestrator (`src/core/Game.ts`), fixed states title/intro/play/paused/dead.
- Box/ramp/cylinder `CollisionWorld` with XZ grid broadphase; **assumes an infinite ground plane at y=0**.
- `Nav` waypoint graph (auto LOS links per level + hand stair links), Dijkstra.
- `Enemy` base (steering, ground following, stun) + `Runner`, `Gunner` (cover, aim telegraph, bursts, rooftop perch).
- `Waves` endless survival, `Interactives` (cabinets, medkits, breakable lamps), `Events` (ambient), `Train` (overpass), `Fountain`.
- `AudioEngine` (volume groups) + `MusicDirector` → `ProceduralBackend` (three separate songs, bar-quantised crossfades) / `FileBackend`.
- `Hud`, `PauseMenu`, `Settings` (localStorage), DEV `RouteCheck`.

## Target architecture (new modules)
| Module | Responsibility |
|---|---|
| `core/Bus.ts` | Tiny typed event bus (gunshot, sighting, report, alert change, train events, objective). |
| `stealth/Perception.ts` | Pure detection maths: FOV, range, weapon/sprint/light/wanted modifiers, suspicion gain. |
| `stealth/AlertSystem.ts` | Global wanted level (unnoticed/suspicious/alerted/pursuit/search) + last-known position. Pure, unit-tested. |
| `stealth/Guard.ts` | Security officer FSM: patrol → suspicious → investigate → combat → pursuit → search → return. Reuses Enemy steering and Gunner-style combat. |
| `stealth/Security.ts` | Owns guards: staggered perception ticks, radio propagation (nearest responders only), limited reinforcement budget from off-screen doors, despawn after search. |
| `city/Crowd.ts` | Instanced civilians (umbrellas, varied coats): wander/idle/chat/wait, weapon noticing → alarm → report, panic/flee/cower, recovery, LOD. |
| `world/Metro.ts` | Underground station geometry (carved open-rect layout → walls/floor/ceiling), gates, screen doors, boards. |
| `rail/Timetable.ts` | Game clock + schedule (pure, unit-tested). |
| `rail/MetroTrain.ts` | Approach/stop/doors/dwell/depart; boarding volume. |
| `story/Mission.ts` | Acts + objectives + checkpoints; mandatory set-pieces. |
| `story/Director.ts` | Pacing only (patrol intensity, reinforcement budget, ambient events) — never cheats. |
| `story/Ending.ts` | Escape cinematic, results, credits. |
| `audio/music/Score.ts` | Single continuous layered score (intensity 0..1 with hysteresis per layer) replacing the three-song switcher. |
| `ui/Minimap.ts`, `ui/StoryHud.ts`, `ui/MainMenu.ts` | Minimap (per-floor, heading-up), wanted indicator, objective, radio feed, threat arcs, interaction hint, main menu. |

Arcade Survival keeps `Waves` + Runner/Gunner and shares world/audio/UI.

## Key design decisions
- **Holster (H)**: weapon state on `Weapon` (lower/raise with fast draw ≈0.25 s); firing disabled while lowered; reload cancelled by holstering; crosshair dims; ammo panel hidden.
- **Perception** runs at 10 Hz per guard (staggered); LOS to head and chest; steam bursts are temporary sight blockers; local light level (from the glow registry) scales detection at range; holstering only lowers rates — a guard who identified the player remembers him (60 s).
- **No omniscience**: guards only know (a) what they see, (b) last-known position shared over radio by a guard who saw the player or a civilian report, (c) gunshots they can hear. After losing sight a guard tracks the true position for 1.5 s ("saw where he went"), then goes to the last-known position and searches.
- **Escape**: pursuit persists while anyone has recent contact; breaking line of sight + distance turns it into search (~40 s) → unnoticed. Reinforcements are budgeted per alert episode and spawn only out of sight (> 25 m, no LOS, behind the player's view), then leave after the search.
- **Map**:
  - Rooftop layer at 8.5 m (lowered blocks forming Sky Garden, Lantern Roof, Tech Roof, West Terrace), joined by bridges, reached by four new stairs, with drop-downs.
  - **Vault**: railings marked `vault` can be jumped over mid-jump; guards never vault.
  - Underground metro at y = −6 with three entrances: plaza, back alley onto the platform, service door → maintenance → platform.
  - Collision gets "holes" in the ground plane.
- **Trains**:
  - Locals every ~90 s stop at platform 1 with doors.
  - The last express (終電) is committed when Act 4 starts; if it's missed, another follows.
  - Boarding is spatial: through a screen door into the car.
  - Boarding a local is a fail with a warning ("checkpoint at next station"), then retry from the checkpoint.
- **Story**:
  - Act 1: meet the informant at the ramen stall; that triggers the ambush (mandatory pursuit).
  - Act 2: read the departure board; the station is locked down.
  - Act 3: sabotage the security relay on the Sky Garden (guarded); that triggers the manhunt.
  - Act 4: the station opens. Reach platform 1 and board the last express.
  - Finale: train leaves on the elevated line, city recedes, results, credits.
- **Music**: one tempo/key, stems as layers (pad, drone, fragments, pulse, hats, bass motif, drums, lead), intensity smoothed with per-layer hysteresis, bar-quantised gain automation, peak limiting.

## Phases (commit after each)
0. Investigation, baseline, plan, test harness (vitest).
1. Holster, perception, alert, guards, pursuit/search, wanted HUD (+ unit tests).
2. Civilians (crowd, reactions, reporting).
3. Vertical city: rooftops, vault/drop, metro, nav.
4. Rail: timetable, metro train, boarding, ending + credits.
5. Story flow, main menu & modes, checkpoints, director.
6. Music redesign, spatial awareness, minimap, radio, interaction UI.
7. Optimisation, polish, full review.

## Risks
- Underground under an assumed ground plane → explicit holes and floor boxes; route check covers it.
- Draw calls with many rigs → civilians are instanced; guard cap 12.
- AI deadlocks → per-state timeouts, unreachable-target fallback, stuck detection with nav recovery.
- Pointer lock in automation → state forced via DEV hooks; documented.
