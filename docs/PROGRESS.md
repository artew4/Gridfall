# NEON RAIN 3.0 — progress log

Branch `feature/cinematic-escape` (baseline tag `v2.0`). No remote push.

## Done
| Phase | Commit | Notes |
|---|---|---|
| 0 | (with 1) | plan in `docs/PLAN-3.0.md`, vitest added |
| 1 | 66e3e5b | holster (H), Perception/AlertSystem (unit-tested), Guard FSM, Security (radio, reinforcements, gunshots), story HUD |
| 2 | e9ae8d2 | instanced civilians: witnesses + reports, panic/recovery; DEV `window.__dev` helpers |
| 3a | 8afb8b7 | rooftop layer (8.5 m), bridges, stairs S5–S8, vaulting, nav walkability + goal-rooted routing |
| 3b | cdc04c8 | Sakura Line station (−6 m), three entrances with lockdown shutters |
| 4 | 511ef22 | timetable (tested), metro train with interior, boarding, ending + end card |
| 5 | f260638 | Mission: 4 acts, ambush/relay/station set pieces, checkpoints, director sweeps; main menu (Story/Arcade/Settings/Controls); story intro |
| 6 | 8035b71 | layered adaptive score (replaces 3-song backend), minimap (seen/heard only), rear-threat arcs |
| 7 | 4b4fa6e | enemy rigs merged per joint and material (guard 36 → 22 meshes), dead code removed, README, lifecycle checks |

## Verification commands
- `npm test`: vitest unit tests (stealth state machines, rect utilities, timetable)
- `npm run build`: type-check plus production build
- In `npm run dev`, from the browser console:
  - `await __game.checkRoutes()`: player routes, vaults/drops, nav connectivity, runner chases
  - `__dev.start('story' | 'arcade')`, `__dev.tp(x, y, z)`, `__dev.god()`, `__dev.noGuards()`, `__dev.record(fn)`

## 3.1: stealth and pursuit overhaul
Branch `feature/stealth-pursuit-overhaul`, baseline tag `v3.0`. Plan and root causes: `docs/PLAN-3.1.md`.

| Step | Commit | Notes |
|---|---|---|
| Kenji fix | 2446ff8 | one interaction controller; talk step; first line shown at once |
| Phase 2 | ba81bf5 | 3D perception, shared VISION config, ground plane blocks upward rays, guard knowledge split |
| Phase 3 | 0a5e238 | last-known-position pursuit, radio range, search roles, finite response, unreachable goals |
| Phase 4 | b920e68 | minimap view cones (wall-clipped, floor-aware, same maths as the guards) |
| Phase 6 | de36bfa | tuning: engaged guards look up |
| Phase 7 | b9a286b | relay alarm limited to 4 units within radio range, docs, QA |

## 3.2: cinematic experience and performance
Branch `feature/cinematic-performance-3.2`, baseline tag `v3.1`.

| Step | Commit | Notes |
|---|---|---|
| Phase 1 | 0332e20 | frame cap and pacer, presets, hidden-tab suspension, bloom levels |
| Phase 2 | 05db124 | objective system, nav guidance, subtitles, X holsters |
| Phase 3 | 1772dae | story opening over the live district, wanted billboard and posters |
| Phase 6 | caf56ec | ending: officers left on the platform, passengers, Kenji's last words |
| Phase 5 | 98ccf66 | HUD: ammo only when armed, responsive sizing |
| QA | 4a07009 | guidance at stairs, input after resume, door hold, radio/PA lines, story autopilot |
| Docs | (this) | README, progress |

## 3.3: world integrity and level design
Branch `feature/world-integrity-3.3`, baseline tag `v3.2`. Defects and root causes: `docs/WORLD-DEFECTS-3.3.md`. Validation tools: `docs/WORLD-VALIDATION-3.3.md`. Performance: `docs/BENCH-3.3.json` (vs `docs/BENCH-3.2.json`).

| Step | Commit | Notes |
|---|---|---|
| Phases 1–2 | 35303db | sub-stepped controller (ceiling stop, in-step landing, no-wedge), dynamic train colliders, door guides, boundaries, world validation tools, collision regression tests |
| Phase 3 | 0ff7f30 | metro stair finish: tread nosing, LED handrail strips, foot and head glows |
| Phase 4 | d7a7f72 | door obstruction holds and screen doors that never close on a body (WD-13); out-of-bounds safety net (fallback, logged) |
| Phase 6 | d0de1ce | `__dev.train()`, frame-rate profiles and spiky frames in `__dev.stress()`, validation docs |
| Phase 5 | 8cf990e | exit 2 blade sign: entrance B readable from Lantern Street |
| Phase 7 | 9ff0108 | same-session A/B with v3.2: GPU +0.5% (noise ±10%) |
| QA | (this) | story bot waypoint hysteresis; full regression |

## 3.4: multi-setting architecture and Desert Outpost
Branch `feature/multi-setting-3.4`, based on 3.3 (`5db9d7f`). Architecture: `docs/LEVELS.md`. Performance: `docs/BENCH-3.4.json`.

| Step | Commit | Notes |
|---|---|---|
| Phase 1 | b88109e | level contract, TokyoLevel/TokyoStory extraction, menu, per-level load/dispose, audio level bus, terrain/weather engine features |
| Phases 2–3 | 3dd4cf0 | Desert Outpost: dunes, six enterable buildings, mesas, sun with hard shadows, sandstorm, survival integration |
| Phase 4 | (this) | validation (world, stress, level AI, soak, leak check, prod build), benchmark A/B, docs, tab title per level |

## 3.5: desert polish, setting entities, quit to menu
Branch `feature/desert-polish-3.5`, based on 3.4 (`90ce917`).

| Step | Commit | Notes |
|---|---|---|
| Phases 1–2 | bcfd019 | quit to main menu (full teardown and rebuild); arsenal per setting (Jackal AR, desert mercenaries); rig leak fixes |
| Phase 3 | 17a5c12 | clutter and cover, organic dunes, transition, detail map, brush |
| Phase 4 | (this commit) | validation, docs |

## 3.6: Deep Jungle, pump shotgun, guerrilla hunters
Branch `feature/jungle-setting-3.6`, based on 3.5 (`d9dac12`). Architecture notes: `docs/LEVELS.md`. Performance: `docs/BENCH-3.6.json`.

| Step | Commit | Notes |
|---|---|---|
| Phase 3 | 8e92c83 | multi-pellet hitscan, pump cycle, tube reload (engine, setting-agnostic); BOAR shotgun; jungle hunters; shotgun and jungle audio |
| Phases 1, 2, 4 | 82152e2 | Deep Jungle: registration, temple, forest, foliage, mist, dappled sun, nav (includes the fixes from validation: log bank, stair cheeks, nav lanes, light-cookie leak) |
| Phase 5 | (this commit) | validation results, benchmark, docs |

Validation (Chrome, Apple M5, `npm run dev`):
- **World and stress:**
  - `world()`: 0 findings; 63,728 reachable cells, every zone reached;
  - `stress` (3000 samples × 8 directions × 5 rate profiles × walk and sprint-jump): 0 of 240,000 runs failed.
  - Before the fixes it caught a pocket beside a climbable log and a pinch on a stair cheek.
- **Level AI:**
  - `levelAI` at sight 25: runners 315/315, gunners 21/21, graph connected;
  - at sight 300: 314/315, then 315/315 on a second run. The one stall was a runner on the shrine's outside corner (intermittent).
- **Quit to menu:** 5 jungle rounds (waves, shotgun fired, reload). GPU geometries 87, textures 36, programs 56, DOM 214, level audio 10, scene children 57 and InstancedMeshes 9 are flat after the cookie fix (textures had grown by 1 per round).
- **Cross-setting:** jungle → desert → Tokyo → jungle → desert. Each setting keeps its own weapon, enemy look, ambience, fog and engine hooks (spawn distance, sight range, static shadows restored for Tokyo). Single-shot damage is unchanged (Kitsune 33–35, Jackal 20–22).
- **Bench (Balanced):** jungle 60 FPS in all 6 scenarios, GPU 5.7–6.4 ms, 53–92 draw calls. The desert (4.4–5.3 ms) and Tokyo (6.3–6.6 ms) match 3.5.
- **Tests and build:** 74 unit tests pass; the production build has no dev tools.

## 3.7: Deep Jungle military base (assault layout)
Branch `feature/jungle-base-3.7`, based on 3.6 (`2ac5aa3`). Architecture notes: `docs/LEVELS.md` (Assault-ready layout). Performance: `docs/BENCH-3.7.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | e06589d | Firebase Viper (`Base.ts` replaces `Ruins.ts`), terrain pad, strip and road, hybrid cover, foliage and mist rework, paramilitary guards, barracks and jungle spawns (`minSpawnDistance(spawn)`, `pickSpawn`); includes the fixes from validation |
| Phase 4 | (this commit) | validation results, benchmark, docs |

Validation (Chrome, Apple M5, `npm run dev`):
- **World and stress:**
  - `world()`: 0 findings; 62,896 reachable cells, all 12 zones reached (barracks, comms center and roof, watchtower, gate, motor pool, depot, helipad, yard, perimeter, road, forest);
  - `stress({samples: 7500})`: 0 of 240,000 runs; `stress({samples: 3000, fps: ['spiky', 30]})`: 0 of 96,000.
  - Before the fix it caught one run: a sprint-jump landing in the corner of a 0.5 m rubble slab at the breach (vault rule), now plain solid.
- **Pinch scan** (every cylinder against every solid box and cylinder, gaps 0.05–0.75 m): found a drum 0.55 m from a cabinet and cliff-foot rocks 0.13–0.73 m from neighbouring rock-wall boxes (fixed; the generator came from 3.6). Remaining: none, except a false positive (non-adjacent drums in a touching row). Closest tree to the wall: 7.35 m.
- **Doorways** (the real controller, aimed steering, 5 lateral offsets × 2 distances × walk and sprint, both directions): barracks S1, S2, E; comms W; gate; postern; breach all 20/20 each way. Comms S 20/20 in. Outward it was 0/20 (stopped against the blast wall, the test's target), which exposed a nav node inside the HESCO: the wall was moved to leave a 2 m lane.
- **Level AI** (`levelAI({spawns: 31})`, 31 spawns × 18 goals): runners 558/558 and gunners 31/31, at sight 50 and at sight 300, four runs. Before the fix, runners stalled 20–54 s (one timeout) on the comms stair: re-planning from mid-stair picked the bottom node. Now the worst stall is ~10 s (a detour round the east wall to the gate or postern).
- **Quit to menu:** 5 rounds with audio running (waves started each round). Geometries 146, textures 52, programs 57, DOM 228, level audio 10, scene children 93 and InstancedMeshes 10, all flat.
- **Cross-setting:** jungle → desert → Tokyo → jungle → desert. Each keeps its own weapon, enemy look (`guards`/`mercs`/`neon`), ambience, fog, title and hooks; `pickSpawn` is only set in the jungle; Tokyo's shadow auto-update is restored.
- **Bench (Balanced):** jungle 60 FPS in all 6 scenarios, GPU 6.07–6.35 ms, CPU 1.9–2.3 ms, 65–129 draw calls, ~374k triangles (3.6: 324k). Same session: the desert takes 5.6–6.0 ms and Tokyo 6.5–6.7 ms.
- **Tests and build:** 75 unit tests pass; the production build has no dev tools.

## Next
Human playtest:
- 3.7 items: does the road pull you to the gate, is the cleared strip a fair kill zone, do defenders out of the barracks feel like a garrison, are the guards readable in the mist, the doorways and stairs by feel, the watchtower and comms roof as positions.
- 3.6 items: the shotgun's feel (kick, pump timing, the boom), whether 8 m one-shot range feels right, hunters' readability in the undergrowth and mist, the climbable logs, the dappled light, the jungle soundscape.
- 3.5 items: the rifle's feel (recoil, rate, sound), whether the mercenaries read well at a distance and in the storm, the clutter as cover, quitting to the menu and starting again.
Earlier items:
- 3.4 items: the setting menu, the desert in calm and in the storm (can you hear them coming?), the buildings' doors and stairs, whether the storm feels fair, and the performance on your machine.
Earlier items:
- 3.2 items: does the machine run cooler, is the story clear, do the objectives and markers help, is X comfortable, does the ending land;
- 3.3 items: jumping inside the train and riding it, boarding at an angle, standing in a doorway as the doors close, the rooftop edges and the fence, the metro stairs (look and feel), and any wall that seems invisible (note the coordinates from `__game.debug()`).
