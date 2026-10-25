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

## 4.0: visual overhaul, vertical slice on Tokyo (Lantern Street, the plaza)
Branch `feature/visual-overhaul-tokyo-4.0`, based on 3.7 (`37566b6`). Numbers: `docs/BENCH-4.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | d59e6ba | bloom and grade retune, F8 comparison, wet model, reflection catchers, street AO, interleaved bench |
| Phases 4–5 | (this commit) | validation results, benchmark, docs |

**Already in place before 4.0** (not rebuilt):
- `EffectComposer` with RenderPass (world), a viewmodel pass, UnrealBloom, a grade pass and OutputPass;
- ACES filmic tone mapping;
- a DOM HUD;
- shader wet ground with puddles, ripples and additive neon streaks.

4.0 retuned and extended these.

Validation (Chrome, Apple M5, `npm run dev`, Balanced applied in memory; saved settings unchanged):
- **Bloom threshold from data:** HDR buffer, 480×270, emissives off. Lit surfaces above 1.0: ≤ 0.012% of pixels in four of five views. The fifth has a pre-existing sign-light hot spot (0.11%, unchanged with the 4.0 additions off). With everything on, the plaza goes from 1.57% above 0.92 to 0.75% above 1.0: dim window emissives stop blooming, neon (2.6–55) doesn't.
- **Reflection catchers:** real `PointLight`s first. They cost +2.1 ms GPU in the metro (none visible there) and +0.8 ms at the plaza, and at the sign's height they changed 0.07% of a frame. Moved into the wet shader (specular only, widened lobe, ≤ 2.2 m): 3.9% of a Lantern Street frame at intensity 5, cost within noise. Point lights stay at 15, as in 3.7.
- **Component cost** (GPU ms, mean of 2, interleaved):

  | View | 4.0 | 3.7 | raw | 4.0 without catchers | 4.0 without AO |
  |---|---|---|---|---|---|
  | Lantern St | 6.18 | 5.78 | 5.82 | 6.45 | 5.61 |
  | Plaza | 6.09 | 5.87 | 5.53 | 5.67 | 5.77 |
  | Metro | 5.32 | 5.16 | 4.53 | 5.16 | 5.15 |

- **Bench, 8 scenarios × 3 pipelines, interleaved, all valid:**
  - GPU: 4.0 4.76–5.99 ms, raw 4.23–5.70 ms, 3.7 4.96–5.91 ms;
  - CPU 4.1–6.9 ms;
  - draw calls 4.0 151–448, raw 139–392.
- **60 FPS: NOT VERIFIED in this session.** The laptop was on battery at 18–20%, and Chrome capped `requestAnimationFrame` at ~31 Hz (Energy Saver) in every pipeline, 3.7 included. Frame cost (GPU ≤ 6 ms, CPU ≤ 7 ms) is far inside 16.7 ms. Re-run `__dev.bench(3, { pipelines: ['v4', 'raw', 'v37'] })` plugged in.
- **World:** `world()` 0 findings and 14,486 reachable cells (as 3.3); `stress({samples: 2000})` 0 of 64,000; the `colliders()` overlay matches. No collider changed.
- **Quit to menu (Tokyo, 5 rounds with a wave):** geometries 268, textures 112, programs 126, DOM 247, all flat (the AO texture is freed through `userData`).
- **Cross-setting:** the desert and jungle keep their 3.7 bloom and grade (split 0).
- **Tests and build:** 75 unit tests pass; the production bundle has no dev code (`__dev`, F8).

## 4.1: High preset fix, Desert visual overhaul
Branch `feature/visual-overhaul-desert-4.1`, based on 4.0 (`284308f`). Numbers: `docs/BENCH-4.1.json`.

| Step | Commit | Notes |
|---|---|---|
| Phase 1 | a3fe3fa | High preset: frame-rate-independent flicker (`heldNoise`), three bloom levels for every preset |
| Phases 2–3 | 85499d7 | desert: sun ×1.6, bleach bypass and amber grade, data-picked bloom threshold, sun glare, dust glints, glossy metals, heat haze in the grade pass |
| Phases 4–5 | (this commit) | validation, benchmark, docs |

**The High bug, root causes** (High is the only preset with a 120 FPS cap and five bloom levels):
1. **Light flicker drew `Math.random()` once per frame:** sign modes `flicker` and `broken`, the train's arcs and window dips, the lightning flicker and the fountain rings. At 120 FPS signs toggled twice as often (flicker 3.12 → 6.42 jumps/s, broken 1.22 → 2.72; simulated with the real function). Each sign's light, halo, streak and 4.0 puddle catcher strobed with it.
2. **Five bloom levels at Tokyo's 4.0 radius (0.9):**
   - they laid a full-screen haze (+11% mean luminance on a frozen frame; pixel ratio alone changed nothing) from 1/32 and 1/64 buffers that pumped with the strobing signs;
   - they cost 8.4–9.4 ms GPU against 5.2–5.9 ms with three, over the 8.3 ms of a 120 FPS frame.

**Not the cause** (checked): the pixel ratio (no point sprites, bloom sized from CSS pixels), the adaptive resolution (stayed at 1.5 for 24 s at 111–120 FPS), the muzzle and viewmodel flashes (already time-based).

After the fix, a frozen frame on High vs Balanced has mean luminance 62.0 vs 61.7.

Validation (Chrome, Apple M5, charging, rAF 123 Hz; presets applied in memory, saved settings unchanged):
- **Desert bench, Balanced, 4.1 / raw / 3.7 interleaved, all valid:**
  - 4.1 holds 59.6–60.3 FPS in all 6 scenarios (clear and storm);
  - GPU: 4.1 5.4–5.9 ms, 3.7 5.3–5.7 ms (within noise), raw 3.7–4.6 ms.
- **Tokyo:**
  - High (fixed): 112–116 FPS at 2184×1423, GPU 4.3–5.1 ms, P95 14–16 ms;
  - Balanced: 59.9–60 FPS in all 8 scenarios (the check 4.0 couldn't make on battery), GPU 6.1–6.4 ms.
- **Heat haze cost:** a separate full-screen ShaderPass measured +3.5 ms GPU at a 60 cap and +2.5 ms at 120 (a plain copy pass cost the same; the extra pass, not the maths). Folded into the grade pass's existing fetches: within noise (on 5.4 vs off 5.8 ms). Verified to touch only the band just below the horizon (pixel diff by row), not the gun or the sky.
- **Desert bloom threshold from HDR data** (clear, 4 headings, plus a 32-heading sweep):
  - sunlit sand median 0.26, max 0.55–0.72;
  - sky up to ~0.6;
  - metal glints up to 2.0;
  - the sun disc 30.
  - Threshold 1.0.
- **Teardown, Tokyo → Desert → Menu → Tokyo, 4 rounds:**
  - every render parameter identical on every Tokyo arrival and every desert arrival (exposure, bloom, all grade uniforms, haze, wet model, fog, shadows);
  - a deterministic frozen frame differs after a desert round by as much as Tokyo differs from itself after a plain rebuild (2.3% vs 2.2–2.5% of pixels: per-load randomness in Tokyo's world build);
  - the jungle keeps its 3.7 grade.
- **Memory:** desert quit-to-menu flat over 5 rounds (106 geometries, 43 textures, 45 programs, 246 DOM); Tokyo flat from round 1.
- **Collisions (desert):** the `colliders()` overlay matches; `world()` 0 findings, 123,810 reachable cells, 10 zones; `stress({samples: 3000})` 0 of 96,000.
- **Tests and build:** 78 unit tests pass (2 new: flicker rate, preset bloom levels); no dev code in the bundle.

## 4.2: Jungle visual overhaul ("Oppressive jungle")
Branch `feature/visual-overhaul-jungle-4.2`, based on 4.1 (`74e3c37`). Numbers: `docs/BENCH-4.2.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | 2a1ee68 | grade (shadow hue, crush, bleach, yellow-green highlights), FogExp2 #485a46 / 0.03, wet mud, wet leaves, five geometric light shafts |
| Phases 4–5 | (this commit) | validation, benchmark, docs |

**Look, by data:** the jungle's linear HDR is dim (scene median 0.03–0.1, p95 0.11–0.26; only bulbs exceed 1). So the grade ranges were set to: darks end at 0.07, highlight push 0.08–0.4. Bloom threshold stays 0.95: the shafts add at most 0.21 and don't bloom; they are a soft glow by construction.

**Light shafts:**
- five open cones from 34 m down to the ground, aimed from the sun's own position;
- additive, depthWrite off, edge falloff `|n·v|^2.2`, faded in from the canopy and near the camera, taken away by the fog (not blended toward it);
- each lands on a fleck painted into the sun cookie, so the ground under it is lit.

**Validation** (Chrome, Apple M5, charging; Balanced applied in memory, saved settings unchanged):
- **Bench, 4.2 / 3.7 / raw interleaved, 6 scenarios, all valid:**
  - 4.2 holds 59.6–60.3 FPS;
  - GPU: 4.2 5.8–6.4 ms, 3.7 5.3–6.2 ms, raw 4.8–5.4 ms;
  - draw calls +1 to +5 (the shafts in view).
- **Shafts alone:**
  - yard +0.1 ms;
  - worst case +0.5 ms (standing at a shaft's foot looking up it, 4 in view), still 60 FPS;
  - watchtower within noise.
- **Mud alone** (ground materials recompiled without the patch): within noise (on ≤ off in both views).
- **High** (in memory): 111–113 FPS at 2184×1423, GPU 4.1–4.3 ms.
- **Teardown, Tokyo → Desert → Jungle → Menu, 3 rounds:**
  - one render state per setting across rounds (exposure, bloom, every grade uniform, fog colour and density, background, env intensity, sight range);
  - the shafts only exist in the jungle;
  - textures 111/40/53 every round.
- **Collisions:**
  - `world()`: 0 findings;
  - `stress({samples: 3000})`: 0 of 96,000;
  - 539 colliders, none at any shaft foot;
  - `resolveCircle` doesn't move a body at a shaft, and rays through and down the shafts hit only the ground or walls beyond.
- **Tests and build:** 81 unit tests pass (3 new: shafts can't be raycast, are soft and depth-free, and lean to the sun); no dev code in the bundle.

**Gameplay note:** the thicker fog shortens the enemies' sight in the jungle from 49 m to 43 m (it has always been tied to the fog).

## 5.0: Tactical AI and combat overhaul
Branch `feature/tactical-ai-5.0`, based on 4.2 (`f8d3b19`). Plan: `docs/PLAN-5.0.md`. Numbers: `docs/BENCH-5.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–5 | e352978 | two-rate utility brains, squad director, dynamic cover and generated spots, suppression, LKP hunt/search, jungle concealment, callouts; heap Dijkstra, route budget, steering cache |
| Phase 6 | (this commit) | validation tools; fixes found by them (below) |

**Fixes found in validation (Phase 6):**
- Hunkered enemies "lost" the player every few seconds (contact/lost oscillation): lost now needs a failed *standing* look ≥ 0.8 s after the last sighting (or 6 s).
- A gunner heading to a cover dropped it as soon as the squad lost sight: it keeps to its cover and peeks from it for 9 s first.
- Progress watchdog measured distance to the goal, so stair detours looked like stalls: it measures displacement now.
- Authored cover sat on one side of each obstacle (2 of 28 Tokyo spots usable against the start): spots are generated round every waist-high box and pillar (Tokyo 488, desert 533, jungle 633).
- Waist-high cover didn't hide a 1.95 m gunner: deep hunker (0.78 m drop) with matching hitboxes; the helmet may still show.
- The per-frame straight-line steering test (4 rays, every enemy, every frame) was the largest AI cost: cached 0.2 s / 1 m.
- Unreachable goals were re-planned every frame and starved the route budget: re-planned on the timer.
- Jungle undergrowth was transparent to AI sight: concealment field (preset-independent); peeks must see through it too, else gunners fight from the undergrowth.
- Snipers fired into their own parapet (33 of 42 rounds in one run): muzzle check before each burst, step to the edge.
- Blind open-ground advance stopped at 15 m: closes in (to 5 m, then the LKP) while it can't see.
- Runners flip-flopped between slot and charge on stairs: the slot decision is made once; a charge is kept until it lands.
- Wedged against a boulder with a route: a sidestep-and-replan escape in the shared steering.
- Search points in the shuttered metro: search points must be reachable on the graph.

**Validation** (Chrome, Apple M5, on battery at 97–98% with rAF at 122 Hz; Balanced in memory, saved settings unchanged; 4.2 served from a worktree for A/B):
- **AI cost, `__dev.aiBench()`, 10 enemies, 2 rounds each, alternated with 4.2:**
  - Tokyo: 0.18–0.21 ms average, P99 0.7–0.8, worst 1.0–1.1, 4–5 rays per frame (4.2: 0.28, 0.7–0.8, 0.8–0.9, 46–51 rays).
  - Desert: 0.30–0.37, P99 0.8–1.2, worst 1.2–1.3, 5–7 rays (4.2: 0.41–0.44, 1.5–1.6, 1.7–1.8, 27–30).
  - Jungle: 0.30–0.35, P99 1.0, worst 1.7, 6–7 rays (4.2: 0.43–0.50, 1.6–1.7, 2.1–2.5, 33–43).
  - 60 FPS everywhere; frame CPU 2.3–3.0 ms in both versions.
- **`__dev.bench(3)`, every scenario of the three settings:** 60 FPS (59.9–60.3), CPU 2.0–2.9 ms per frame (4.2: 2.2–2.8), GPU 5.2–6.9 ms (4.2: 5.6–6.8). An earlier set of 5.0 runs showed 4.7–6.2 ms CPU in Tokyo for 15–25 s after a page load; it was uniform across code 5.0 didn't touch, independent of the AI (frozen `Waves.update` and hidden enemies left it unchanged) and didn't reproduce later: recorded as a machine-state effect.
- **Headless `__dev.tactical()` (all three settings):**
  - Roles: 2 suppressors, flankers on both sides, ≤ 3 shooters at once (the token limit), rushes from 3–6 of six 60° sectors.
  - Flank: the gunner leaves the blown cover 0.17–0.67 s after his eyes reach the hunkered body; new cover protected from him when it found one (else open ground).
  - Suppress: pinned after 0.3 s, hunkered after 0.47 s, 0 rounds while pinned, aiming again 3.0–3.8 s later.
  - Ghost: never followed him without a sighting (LKP unchanged, no goal near him without information); Tokyo and the desert storm searched and gave up after 27–32 s; calm desert and jungle re-found him by their own rays.
  - Soak, 120 s × 4 per setting (10 enemies, he roams and shoots, deaths replaced): 0 out of bounds, 0 inside geometry, 0 stalls, 0 cover outside the bounds; decides ≤ 3 per frame, rays ≤ 32 per frame, lateness ≤ 0.12 s.
- **Navigation regression:** `__dev.levelAI({ spawns: 12 })` with an all-knowing squad: Tokyo runners 6/6, gunners 6/6 (4.2: 6/6, 3/6); desert 168/168, 12/12; jungle 216/216 (one run 215/216: a runner held 2.8 m from a goal), 12/12. `__game.checkRoutes()`: routes, jumps, graph, 54/54 guard chases. `__dev.pursuit()` (story guards): escapes calm in 36–40 s, first response 4, peak 4–5, as in 3.1/3.2.
- **Live Arcade Survival, bot from wave 5, 60 s per setting:** no console errors, nobody out of bounds or inside geometry, 11–16 callouts per minute. Enemy rounds fired per minute varied a lot run to run (5.0: Tokyo 25–54, desert 0–44, jungle 33–108; 4.2: 9, 21, 66 in one run each); one desert run had no contact for 60 s (not reproduced in four more).
- **Tests and build:** 104 unit tests pass (23 new); no dev code in the bundle.

**Not verified (needs a human):** whether the squad reads as intelligent or as busy; whether staged rushers feel tactical or passive (they spent 17–40% of their time staged); bark frequency and voice; fairness of suppressors firing at the last known position; whether the jungle concealment feels fair from the player's side; audio (AudioContext can't start in automation).

## 6.0: 5v5 Team Deathmatch and faction AI
Branch `feature/tdm-factions-6.0`, based on 5.0 (`cb5f78f`). Plan: `docs/PLAN-6.0.md`. Numbers: `docs/BENCH-6.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | (first 6.0 commit) | symmetric desert arena, faction AI (combatants, team contexts, contacts and focus, two directors on one scheduler, the human read by ALPHA, lanes, team rounds, check-fire), TDM rules, HUD, result screen, menu |
| Phases 4–5 | (second 6.0 commit) | validation tools (`tdmSoak`, `tdmBench`, `friendlyFire`), benchmark, docs |

**Fixes found in validation (in the first commit):**
- `levelAI`: 16 of 192 runner routes timed out at the hamlet's first ruin (door and window on swapped walls, so the hand-placed door link ran through the window), the second ruin (door nodes on the wrong walls) and a sandbag nest (no node inside), in both halves: 192/192 after the fix.
- The scripted human: circling the enemy (a flank) was read as retreating; "closing" is now the change of distance.
- Bot blades were a large share of kills in the first soak (24 of 80): blade damage on bots ×2.5 → ×1.8 of the player value.
- A bot dithering 1–1.5 m in a doorway kept resetting the 5.0 stall watchdog: a second watchdog gives up after 12 s without a 0.5 m gain on the goal.
- A dev-path mode switch (TDM → survival without the menu) left nine bots in the scene (+170 draw calls in one benchmark view): switching rules always runs the outgoing mode's clean-up.

**Validation** (Chrome, Apple M5, Balanced; saved settings unchanged):
- **Friendly fire, `__dev.friendlyFire()` on frozen bots:** a round through a teammate (each team) leaves it untouched and hits the hostile; the player's shots pass through two allies and hit the hostile; a teammate's blade does nothing, a hostile's lands; check-fire sees a teammate in the line and a clear line as clear; ALPHA's rounds pass the player, OMEGA's hurt him. `ok: true`, friendly damage 0. In 41 minutes of soaks: friendly damage 0, 96 rounds passed through teammates, 172 bursts held for a teammate in the line.
- **CPU with nine bots, `__dev.tdmBench()` at 1×:** 60 FPS; whole frame CPU 2.2 ms, GPU 5.6 ms; AI 0.45 ms per frame average, P95 1.0–1.1, P99 1.6–2.1, worst 2.8–3.7; 0.55 decides per frame (≤ 3); 0 cover searches or re-plans deferred; decides ≤ 0.03 s late. Spectating and with the player shooting: the same. (5.0 survival desert, 10 enemies: 0.30–0.37 ms.)
- **Soaks, bots only, 2× speed, 8 + 12 + 16 sim minutes:** 9.1–10 kills per minute, first contact after 10–18 s; a third of victims were pinned when killed; suppressors make half the kills; median kill range 6.5–7.4 m (p90 16–20 m); 9–21 kills per soak from the victim's side or behind; scheduler ≤ 3 decides and ≤ 32 rays in any frame, lateness ≤ 0.12 s; AI average 0.44–0.49 ms, P99 1.7–1.9; one unexplained 16.1 ms AI frame in 28,782 (soak 3). Stuck ≥ 15 s: 1, 1, 2 (each freed afterwards; the 12 s watchdog came after soak 2).
- **Human roles, scripted on the live game:** steady fire → suppressing (bots 0 suppressors, 3 flankers); closing → pushing (2 suppressors, "Covering your advance!"); standing → holding (1 suppressor, flankers on both sides); circling → flanking; falling back → retreating (2 suppressors).
- **`__dev.bench(3)`, desert:** 59.3–60 FPS, CPU 2.3–2.8 ms, GPU 5.3–6.2 ms, draw calls 76–140 (5.0: 74–133), all valid.
- **World integrity on the expanded desert:** `__dev.world()` 0 findings, every zone reachable (bases 1,409 / 1,388 cells, hamlets and wadis 4,547–4,730); `__dev.stress()` 0 failures in 16,000 runs; `__dev.levelAI()` 192/192 runners, 8/8 gunners; terrain slope test (worst 0.364 < 0.4).
- **Survival regression, `__dev.tactical()`:** Tokyo and desert pass every scenario; jungle passes roles, flank, suppress and soak, and `ghost` passed 3 of 4 runs (a randomised scenario; 5.0's flake rate wasn't measured).
- **Match flow:** the player's death costs a ticket, shows "KILLED BY …" and a countdown, and he respawns at his base 4 s later with 2 s of protection; a team at 0 tickets loses (Victory screen with the scoreboard); REMATCH restarts cleanly; three Tokyo → desert TDM → jungle → menu rounds leave no bots, tags, feed rows or hooks behind.
- **Tests and build:** 118 unit tests pass (14 new); no dev code in the bundle.

**Not verified (needs a human):** whether the allies feel helpful; whether the inferred roles match what the player thinks he is doing; balance of a full 25-ticket match with a human (the soaks are bot-only, OMEGA one bot up); whether either base feels favoured; name-tag readability; audio (AudioContext can't start in automation).

## 7.0: the deathmatch arena AI
Branch `feature/deathmatch-ai-core-7.0`, based on 6.0 (`e5d2989`). Plan: `docs/PLAN-7.0.md`. Numbers: `docs/BENCH-7.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | `076462f` | arena AI for TDM: a deathmatch brain per bot, an arena director per team, attention-driven sensing, jump/vault movement with nav vault links, the `TDM.ai` switch; survival untouched |
| Phases 4–5 | (second 7.0 commit) | headless match stepper (`tdmSim`, `tdmAB`), benchmark, docs |

**Fixes found in validation:**
- **Sight-to-shot stat:** recorded every shot instead of one per acquisition (a sentinel reset by the next decide). It is now one per pick, timed from when the target was both visible and picked, and picks made mid-reload aren't timed.
- **Target flicker, 353 switches/min:** a target leaving view lost its +1.5 and the visible one won.
  - First fix (kept the current target "visible" for 1 s): bots chased ghosts past visible enemies and the kill rate halved.
  - Final rule: a visible threat replaces one out of view at once; between two in view, a 15% margin and at most one switch every 0.4 s, unless the new one is shooting at it.
- **BREAK on every reload, 14% of alive time:** it now reloads on the move unless someone is shooting at it.
- **Route entry search capped at 10:** good routes became failures, bots ran at walls, and matches went from ~135 s to ~265 s. Measured instead: successful routes need ≤ 116 corridor tests, failed ones tested all ~530 nodes (5–11 ms). The cap is now 128, and both route ends are put on the floor first (a contact plotted mid-vault is in the air).
- **Tactical after arena froze every bot:** after an arena match the arena directors stayed set, so the 6.0 path ran the arena frame with no brains. `begin()` now clears them.

**Validation** (Chrome, Apple M5, Balanced; saved settings unchanged):
- **Match pace (headless whole matches, 25 tickets, bot vs bot):**
  - 6.0 untouched checkout: 261 / 275 / 314 s, 8.6–10 kills/min.
  - Same-session A/B, 6.0 brain: 325.5 s, 8.7 kills/min (medians).
  - Same-session A/B, 7.0 arena: 153 / 138 / 135 s, median 137.6 s (50% of the untouched 6.0, 42% of the same-session 6.0); 18.4 kills/min (1.9–2.1×).
- **Feel, measured:**
  - Bots move > 1.5 m/s 95% of the time (6.0: 69%), crouch 2.7% (13%), stand still 3.2% (23%); average speed 4.7 m/s (2.8).
  - First contact after 6 s (11).
  - Per match: 120–150 jumps, 118–140 vaults (every bot ≥ 5 jumps and ≥ 6 vaults), 110–130 pushes with 25–29 push kills.
  - BREAK 11–12.1% of alive time.
  - Sight-to-first-shot median 20 ms, p90 120 ms.
  - Stuck 0 (6.0: 5); friendly damage 0.
- **CPU, `tdmBench` at 1× with nine bots:**
  - Arena spectating: 59.4 FPS, CPU 2.5 ms, GPU 5.6 ms; AI 0.44 ms average (P95 1.2, P99 1.6, worst 2.3); 12.3 rays and 1.25 decides per frame.
  - Arena with the player shooting: 60 FPS, CPU 2.63 ms; AI 0.42 ms (P99 1.8, one 11.7 ms worst); 19.5 rays per frame.
  - 6.0 brain, same session: 60 FPS; AI 0.35 ms (P99 1.3); 0.5 decides per frame.
  - So 2.5–3× the decisions for ~0.1 ms more per frame.
  - Sensing: 0.3–1.8 rays per frame on average, 42–54% pair-cache hits, ≤ 18 in a frame, 0–1 checks deferred.
- **`__dev.bench(3)`:** desert, Tokyo and the jungle at 59.7–60.3 FPS in every scenario, all valid.
- **Friendly fire (arena AI):** `ok: true`, friendly damage 0.
- **Survival regression:**
  - Tokyo and the jungle: `__dev.tactical()` passes every scenario (roles: ≤ 2 suppressors, both flank sides, 3 tokens; flank, suppress, ghost and soak all ok).
  - `__dev.survival()` on Tokyo, the jungle and the desert (after a TDM match) spawns plain `Gunner`/`Runner`, with no arena brain, no arena context and the 3/30 scheduler defaults.
  - A unit test checks that nothing on the survival path imports `arena/`.
- **Tests and build:** 133 unit tests pass (15 new); `npm run build` ok; `tdmSim`/`tdmAB` not in the bundle.

**Missed or partial:**
- Sight-to-shot p90 is 120 ms (7 frames, the yaw turn for targets well off its facing); only the median meets the "≤ 3 frames" aim.
- BREAK reached 12.1% in one run (aim ≤ 12%).
- Arena AI P99 was 2.6 ms in one headless run (aim ≤ 2.5).
- Worst single AI steps of 12–28 ms remain in both brains (graph re-plans; 6.0 had the same).
- Runners make only 1–2 kills a match.

**Not verified (needs a human):** whether the bots feel ruthless but fair against a person (snap + spread was tuned on bot-vs-bot numbers only); whether BREAK and the Push read as intent; balance of a full match with a human.

## 8.0: Neon Docks arena and the ranged-only TDM roster
Branch `feature/neon-docks-arena-8.0`, based on 7.0 (`08e55d1`). Plan: `docs/PLAN-8.0.md`. Numbers: `docs/BENCH-8.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | `b0676e1` | roster filtering (TDM ranged only), the Neon Docks arena, the arena AI's lane discipline |
| Phases 4–5 | (second 8.0 commit) | zone and height stats in `tdmSim`, a docks `bench` set, A/B switches, docs |

**Fixes found in validation:**
- **Stress:** 2 of 64,000 runs failed. A sprint-jump into the open side of an interior stair landed inside its fill. Both sides are now plated: 0 of 64,000.
- **levelAI:** 347/384 runners reached their goals. A container stair's foot faced another container (0.23 m) and its foot nav node was inside it. The stair now runs along the container's side, and the build checks every node: 384/384.
- **Lane start points:** the first lane point of each lane was 0.4 m from its blast wall; moved to the middle of the 4.4 m gap.
- **Everything through the middle:** 40% of bot time and 45 of 49 kills were in the warehouse, 1–2% in each stack zone. The arena brain hunted every contact by the shortest path. Now a far contact (> 22 m) is hunted along the bot's own lane first (lane discipline). Warehouse time fell to 22–26%; the quays and crane took 22–28% and the stacks ~16%.
- **No one on the catwalks:**
  - Two aligned main doors gave a floor-level line through the warehouse; a crate stack under the bridge breaks it.
  - The centre lane now runs over the west catwalk, and raised lane waypoints are taken at any distance.
  - The interior stairs rose away from the doors; reversed, onto a mid landing.
  - Catwalk time went from 0 to 6.5–7.6% of bot time (elevated 9–11%), with 3–7 catwalk kills a match.
- **Too dark:** the stacks were near black. The floods were raised to physical intensities (650 / 450 cd), three work lights were strung over the maze, and the sky fill was raised.

**Validation** (Chrome, Apple M5, Balanced):
- **World integrity:** `__dev.world()` 0 findings, 46,528 reachable cells; the per-zone counts are equal between mirrored halves. `__dev.stress()` 0 failures in 64,000 runs (800 samples × 8 directions × 5 frame-rate profiles × walk / sprint-jump). `__dev.colliders()` overlay inspected on the stairs and catwalks.
- **AI pathing:** `__dev.levelAI({ spawns: 24 })` at sight 25 and 300: graph connected, runners 384/384 (median 15.6 s, worst stall < 9 s) to the catwalks, bridge, exterior landing, container roofs, platform, maze, warehouse and quay; gunners 24/24. An arena bot sent to the catwalk walks in the door, vaults the pallets, climbs and walks the catwalk.
- **Bot-vs-bot on the docks (`tdmSim`, 3 matches):**
  - 182–194 s, 14.3–15.2 kills/min, every kill by a rifle;
  - 95% of bot time moving, 9–11% elevated, 6.5–7.6% on the catwalks;
  - kills spread over the warehouse, catwalks, crane, quays, stacks and forecourts;
  - stuck 0, friendly damage 0, drowned 0.
- **Performance:**
  - `__dev.bench(3)` on the docks, every view with the match running: 59.3–60 FPS, CPU 2.4–3.0 ms, GPU 5.8–6.5 ms, 98–314 draw calls, all valid.
  - `__dev.tdmBench()`: 60 FPS; AI 0.32 ms average (P99 1.1, worst 2.1) spectating, 0.36 ms (P99 1.0, worst 2.5) with the player shooting.
- **Survival keeps melee:** `Waves` never consults a roster request (unit test); the 7.0 survival regression stands, with nothing in the survival path changed.
- **Tests and build:** 141 unit tests (8 new); `npm run build` ok; DEV tools not in the bundle.

**Open:**
- **Desert TDM is slower, and it's the roster:** with the 8.0 code, desert matches run 181–207 s (median 196) at 13.9–15.2 kills/min (7.0: 135–153 s, ~18.4). The in-code A/B, 3 runs each:
  - blades back: 135–168 s (median 153), 16.8–17.6 kills/min, the blades making 0–2 kills a match;
  - lane discipline off: 180–198 s (median 198).

  So the blades shortened matches by dying, which is the "feeding tickets" of the playtest, and lane discipline is neutral there. Whether rifle-only TDM is now too long is a playtest question; tickets or respawn time are the knobs.
- **Not human-tested:** the docks, the lanes' balance with a human, whether the colour callouts read in a fight, and the lighting on other displays.

## 8.1: combat polish, ballistics, docks lighting
Branch `feature/combat-polish-8.1`, based on 8.0 (`0a72f62`). Numbers: `docs/BENCH-8.1.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | `c1ddea3` | docks lighting, stair fit, kinetic tracers and pooled casings, silent TDM, fog-bound arena AI |
| Phases 4–5 | (second 8.1 commit) | world-check finding for stairs in walls, benchmark, docs |

**Docks lighting:**
- 17 → 28 point lights, warm amber and yellow, all over the play space:
  - six work lights over the maze's crossings, with the west-wall floods turned warm;
  - two more sodium masts on the quay's warehouse side, and a light under the crane's load;
  - a mast in each forecourt;
  - four warehouse lamps lit instead of two.
- Exposure 1.0 → 1.12. The sky, the water and the far distance stay dark.
- Measured as illuminance at chest height on every floor nav node:
  - lane zones averaged 0.26–2.3 before, 3.2–4.1 now;
  - the darkest 10% went from 0–0.83 to 1.25–2.41 (the forecourts were at 0).
- Cost: GPU 5.8–6.5 → 6.5–10.2 ms, still 60 FPS.

**Stairs:** none of the stair builders drew outside their footprint. But nothing stopped a stair from being *placed* into a wall, and a wall that intrudes into a stair's width has the steps drawn through it.
- `world/StairFit.ts` narrows every stair (Tokyo, jungle, docks) to the face of a wall that intrudes into its width at its own heights.
- The world check now reports any stair a wall still runs into.
- Tokyo had one: a metro stair 0.2 m into an underground wall. 0 now on all levels.

**Ballistics:**
- `WeaponSpec.ballistic` and `EnemyLook.ballistic`: kinetic or energy.
- **Bot rounds:** two InstancedMeshes from a free-list pool, with no allocation in the per-frame loop.
  - Kinetic (mercs, jungle guards, the garrison): thin additive streaks, 1/20 s of flight long.
  - Energy (synths, Tokyo guards): the neon blaster.
- **The player's kinetic tracers:** thinner, hotter and faster (520 m/s).
- **TDM rounds:** 70 m/s for both teams (7.0: 40). A per-look speed would have been unfair on the docks (rifles against plasma). Survival keeps its dodgeable rounds.

**Casings:** `combat/Casings.ts` is a 256-slot instanced ring in typed arrays.
- **Who ejects:** kinetic weapons only, the player's and the bots' near the camera.
- **Landing:** the floor where the arc lands is predicted at ejection, with one more lookup at rest.
- **Life:** up to 3 bounces, then rest, then it shrinks away at 4 s.
- **Cost:** 11–17 µs per frame, worst frame 0.1 ms, 0 KB heap growth over 600 frames.

**TDM:** barks off (`TDM.barks = false`, `BarkGate.enabled`): no text, no voice, both brains. Survival keeps them.

**Fog and the arena AI** (`world/Visibility.ts`): FogExp2 leaves `exp(−(ρd)²)` of a target's contrast.
- **Sight:** the arena sees until 18% is left (0.866 × the level's 90% fog distance).
- **Aim:** it gets `0.06 × (1 − contrast)` more spread.
- **Docks:** the sight range now comes from the fog density.
- **Measured in a desert storm at peak** (sight 21.3 m): kills median 9.4 m (p90 15.6), 0 rounds fired past fog sight.

**Fixes found in validation:**
- **Casings under the sand:** they landed 4–5 cm under the dunes. The floor had been taken under the ejection port, and a casing lands ~2.5 m away, on higher ground. The landing floor is now predicted, and casings rest at +6 mm.
- **Allocation in the draw loop:** a two-element array was allocated every frame; removed.

**Validation:**
- **World:** `__dev.world()` 0 findings on all four levels. `__dev.stress()` 0 / 64,000 on Tokyo and the docks.
- **`bench(3)`, 60 FPS everywhere:** docks 59.9–60.2 (GPU 6.5–10.2 ms), desert 60, jungle 59.6–60.3, Tokyo 59.9–60.3. Docks `tdmBench` with the player shooting: 60.1 FPS, AI 0.39 ms.
- **Pools under load:** 1,404 rounds fired, 0 dropped (pool 128, peak 38); 465 casings ejected (peak 55 alive).
- **TDM pace at 70 m/s:** docks 172–191 s, desert 173–177 s.
- **Tests:** 149 unit tests; build ok.

**Watch:**
- Catwalk time on the docks fell to 2.2–4.2% (8.0: 6.5–7.6%). Faster rounds punish the exposed deck; two matches only.
- The GPU headroom on the docks is smaller (up to 10 ms on the warehouse views): fine on this machine, worth a look on a weaker GPU.

## 9.0: the music manager and jungle TDM ("Firebase Viper")
Branch `feature/jungle-tdm-audio-9.0`, based on 8.1 (`fd502eb`). Numbers: `docs/BENCH-9.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | (first 9.0 commit) | MusicManager, five tracks, jungle TDM: second base, culvert and breach, fog-bound arena AI |
| Phases 4–5 | (second 9.0 commit) | music soak, tests, benchmark, docs |

**Music** (`audio/music/MusicManager.ts`, `Themes.ts`): one manager, one named track at a time.
- **Tracks:** `menu_theme` (title, setting cards, loading), `tokyo_theme`, `desert_theme`, `docks_theme`, `jungle_theme`. Each level names its track in `LevelInfo.music`.
- **Crossfade:** equal-power over 2 s. The outgoing source is disposed when its fade ends: timers cleared, nodes disconnected, the media element emptied.
- **Files first:** `public/audio/music/<id>.mp3` (or .ogg, .m4a, .wav, or a `manifest.json` entry) is streamed through an `<audio>` element and looped. Nothing is decoded into memory.
- **Placeholders:** without a file, a procedural theme plays whose layers follow combat intensity. Tokyo keeps its 5.x score; the others are new pattern themes (menu: D minor pads; desert: phrygian toms and oud; docks: distorted grind bass; jungle: tribal toms in 3 against 4).
- **Focus:** a hidden tab pauses media and stops the schedulers; a game pause ducks the bus.
- **Removed:** the old MusicDirector and its file backend.

**Jungle TDM** (`levels/jungle/Base.ts`, `Terrain.ts`):
- **Bases:**
  - LZ ALPHA is the original spawn on the road, now a walled HESCO yard.
  - LZ NORTH is new, behind the compound, with a helipad.
  - Both terrain pads are flat, blended over 16 m so the slope stays walkable.
- **Flanks:**
  - a concrete drain culvert through the south wall, west of the gate;
  - a breach in the east wall.
- **Lanes:** four per team: west, centre through the compound, east, and a flank (ALPHA via the culvert, OMEGA via the east breach).
- **Survival** keeps its spawns and its road.
- **Fog:** the arena AI reads the live fog density from the scene (`ctx.fog`). On the jungle it now sees to the real fog limit; the old `sightRange` was 0.85× of it.

**Fixes found in validation:**
- **Pad slope:** the first terrain pads blended at 0.78, then 0.50 slope; widening the blend to 16 m fixed it.
- **Lane points in trees:** five lane points stood in random trees or rocks; they now snap to free ground.
- **Unused culvert:** bots used the culvert 0% of the time with only three lanes; it took a lane of its own.
- **Audio on the title:** it never started on a title click; any first pointer or key press now unlocks it.
- **File probe:** Vite answers HEAD on a public file with index.html, so the probe is a 2-byte range GET.

**Validation:**
- **Jungle:** `world` 0 findings; `stress` 0 / 64,000; `levelAI` 504/504 runners, 24/24 gunners.
- **TDM matches:** 185–215 s, 14–15.7 kills/min, winners mixed. Bot time: 39% jungle, 17–22% compound, 13–16% perimeter strip.
- **Route use per match:** gate 16–21 entries, culvert 4–5, east breach 14–17. 0 friendly fire, 0 barks, 0 rounds past fog sight.
- **Performance:** jungle `bench(3)` 60 FPS (CPU 0.7–2.2 ms, GPU 5.2–6.1 ms); `tdmBench` 60 FPS, AI 0.31–0.35 ms. Docks regression 60 FPS.
- **Music:** 60 direct switches with a flat heap (122 → 117 MB); session sources 86 created, 85 disposed, 1 live. `musicSoak` over all levels: 0 unaccounted.
- **Tests:** 152 unit tests; build ok, no DEV tools in the bundle.

**Watch:**
- OMEGA's yard is 12 m closer to the compound middle; ALPHA has more entrances. Not decisive in bot matches.
- One stuck bot in nine matches, location not captured.
- The heap grows across level reloads (`musicSoak` 100 → 198 MB over 24 loads). The music-only run is flat, so that growth comes from level loading. It was not investigated in 9.0.

## 9.1: stair z-fighting hotfix
Branch `fix/stair-z-fighting-9.1`, based on 9.0 (`e0ddef3`).

**Reported:** a flickering, jagged pattern on the side of the warehouse stairs on Neon Docks (screenshot).

**Root cause:** reproduced on the warehouse stair, seen from the floor. It was not the wall.
- Every steel side plate overlapped the treads. Its outer face lay in the same plane as each step box's side face, facing the same way, so the two fought over the depth buffer across the whole side.
- The desert's stairs had the same overlap, between their railing plate and the treads.
- A face flush against a wall faces the opposite way and is culled, so it can't flicker. Those were still made clear of the walls, since the brief asked for it and one flush wall hid a real overlap (Tokyo's weapon cabinet).

**Fix:**
- **Treads:** in every stair builder with plates (docks, jungle, desert), the treads stop `STAIR_GAP` (3 cm) short of a plated side. The plate's face is now 3 cm in front of the step faces it covers.
- **Walls:** `fitStairWidth`, shared by all four levels, keeps every stair side `STAIR_GAP` clear of a wall beside it. A wall that touches a side, or that the stair was narrowed to, moves the side 3 cm clear.
- **Desert:** its stair builder now uses `fitStairWidth`. It never had in 8.1.
- **Build order:**
  - The docks' catwalk columns are built before the stairs, so the fit sees them. They were flush against the warehouse stairs.
  - Tokyo's tech-deck weapon cabinet moved 11 cm off stair S7. Its back was flush with the stair, and its top cap overhung 7.5 cm into the steps.
- **New world-check finding**, `stair flush with wall`, with a unit test. It found the four columns and the cabinet before the fixes.

**Validation:**
- **Visual:** the warehouse stair from the floor and from under the catwalk, the quay stair and a container stair. No flicker; before the fix the side was a checkerboard.
- **`__dev.world()`:** 0 findings on all four levels.
- **`__dev.stress()`:** 0 failures in 64,000 runs on the docks, jungle, Tokyo and desert.
- **`__dev.stairGaps()` (new):** every stair side with a wall beside it has exactly 3 cm. A body pressed against the wall over the gap, or dropped into it, keeps its floor:

  | Level | Stair–wall pairs | Probes | Drops |
  |---|---|---|---|
  | Docks | 6 | 156 | 0 |
  | Jungle | 1 | 26 | 0 |
  | Tokyo | 21 | 506 | 0 |
  | Desert | 3 | 78 | 0 |

  A 3 cm gap is well under the body radius (0.35 m), so nothing can fall into it.
- **Tests and build:** 154 unit tests; build ok, no DEV tools in the bundle.

## 10.0: rebranded as Gridfall; GitHub Pages CI/CD
Branch `feature/rebranding-cicd-10.0`, based on 9.1 (`802125b`). Versions 1.0–9.1 were developed as NEON RAIN; the history below keeps that name.

**Rebrand:**
- The title screen, the intro cards of every world, the window titles, the end credits, `index.html` (title and description) and `package.json` are all renamed. The package is now `gridfall` 10.0.0.
- Storage keys are now `gridfall.*`. The old `neonrain.*` keys are still read, so a returning player keeps their settings, last world and seen tips.
- The development history (`PLAN-*`, this log, the bench files) keeps the old name.

**Build for GitHub Pages** (`vite.config.ts`):
- `base` is `/Gridfall/` for `vite build` and `vite preview`, and `/` for the dev server. `BASE_PATH` overrides it.
- `vite preview` runs with command `serve`. A base set only for `build` made the preview serve `/` and answer every `/Gridfall/assets/…` request with index.html, a blank page; it was caught in this check.
- Every runtime fetch already went through `import.meta.env.BASE_URL` (the music folder). The game has no other runtime assets.
- **Music probing:** `__MUSIC_FILES__` is the list of files in `public/audio/music/` at build time.
  - A production build probes only those, so a deploy with no music makes no requests. Before, it made 20 probe requests: 404s in every player's console on Pages.
  - The dev server still probes, so a dropped-in file plays after a reload.

**CI/CD** (`.github/workflows/deploy.yml`):
- Triggers on a push to `main`, or manually.
- **Build job:** `actions/checkout@v4`, `actions/setup-node@v4` (Node 22, npm cache), `npm ci`, `npm test`, `npm run build`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` (`dist/`).
- **Deploy job:** `actions/deploy-pages@v4` to the `github-pages` environment.
- Permissions are least-privilege (`contents: read`, `pages: write`, `id-token: write`). One deployment at a time.

**README:** rewritten for the project as it is: the play link and badges, the worlds, the modes, the technical highlights (rendering, the two AI engines, pooled ballistics, audio, testing), the tech stack, controls, local run, deployment. The console tool reference moved to `docs/DEVTOOLS.md`, with the source layout.

**Validation:**
- 154 unit tests; build ok.
- The workflow's steps (`npm ci`, `npm test`, `npm run build`) passed on a clean copy of the branch.
- `vite preview` at `/Gridfall/`:
  - the title screen shows GRIDFALL;
  - Neon Docks TDM starts;
  - with no music files, no music requests;
  - with a test track in the folder, one probe and the stream, both under `/Gridfall/audio/music/`, and nothing else.
- The workflow itself has not run: nothing is pushed.

## 11.0: aim down sights, crouch, and bots that choose their shot
Branch `feature/ads-crouch-11.0`, based on `main` (10.0, `7cb947a`). Numbers: `docs/BENCH-11.0.json`.

| Step | Commit | Notes |
|---|---|---|
| Phases 1–3 | `7e0f586` | ADS and crouch, arena aim by range, crouched perception and hit volume, crouch-aware checks |
| Phases 4–5 | (second 11.0 commit) | benchmark, docs |

**Aim down sights (hold RMB):**
- **The blend:** one clock `adsT` runs linearly, 0 → 1 in 0.2 s (down in 0.16 s). `ads = smoothstep(adsT)` drives everything: the world FOV (× the weapon's `ads.zoom`: rifle 0.72, pistol 0.8, shotgun 0.85), the viewmodel pose, sway, bob, kick, sensitivity, speed and the crosshair fade.
  - It's frame-rate independent and lands exactly, with no exponential tail. A unit test checks it at 30, 60, 120 and 150 FPS.
- **Sights on the crosshair:** each weapon names the gun-space point the eye looks through (`ads.sight`). With the sights up the viewmodel root is unrotated at (−sight.x, −sight.y, ads.z), which puts that point on the camera axis. Measured: the rifle's dot projects within 1 px of screen centre.
- **The rifle's red dot** was a solid box that would have filled the middle of the screen. It is now an open tube, with a faint lens and the dot on it.
- **Handling:**
  - base spread −50%, movement spread −75%, bloom −60%;
  - camera recoil × 0.45, viewmodel kick × 0.4;
  - speed × 0.62, sensitivity × 0.7.
- **Viewmodel lens and muzzle:** the viewmodel FOV narrows 12% with the sights up. The muzzle and ejection port follow the gun to the centre (`camPoint`).
- **Fixed on the way:** the camera FOV was damped with a fixed 1/60 s. Its speed depended on the frame rate. It now uses the real frame time.

**Crouch (C; a tap toggles, a hold crouches while held):**
- **Body:** 1.8 → 1.2 m (exponential, rate 12, exact for any step), eye 1.65 → 1.08 m.
- **Standing up needs room:** under a low ceiling the body rises only as far as it allows. Sprinting or Space stands you up if there's room.
- **Handling:**
  - speed × 0.55;
  - hip movement spread and bloom −30%, base −15%;
  - recoil × 0.85;
  - footsteps at 35%.
- **The bots see you crouched:**
  - `PlayerUnit.headY` and `chestY`, the rounds' hit volume and the stealth guards' body samples all scale with the body's height.
  - A crouched player is a lower, smaller target; the bots aim at where he is.

**Arena bots choose their shot by range (`ARENA.ads`):**
- **Under ~12 m:** hip fire as in 7.0: full-speed strafing, jumps, the bloom of a fresh target, and 0.012 more spread.
- **13–40 m:**
  - it plants its feet (12% of run speed) and raises the rifle to its eye;
  - it focuses 0.24 s at 13 m, +8 ms per metre, at most 0.45 s;
  - then it fires 3-round bursts with 0.3 s between, at spread 0.006 plus fog and jitter, no bloom, walking its strafe at 32% of run speed.
- **Hysteresis:** 13 m in, 11 m out.
- **Back to the hip:** a push, a break, a jump, a reload or losing sight (after 0.6 s) drops the rifle.
- **Keeping focus:** back on the same target within 0.5 s, the focus stands. Aiming, a hit makes it flinch rather than jump.
- **Over 40 m:** it sprints up and doesn't fire.
- **Pushes:** a gunner pushes only a target within 25 m.
- **Visible:** `isAiming` raises the rifle to the cheek (pivot and arms blended, about 0.15 s), on every gunner look. Survival gunners raise it in their aim and fire phases too, as a visual change only; their decisions are untouched.
- **Tuning, measured on the way:**
  - **No range cap:** pushes and the frames before a decide kept most long-range fire at the hip.
  - **Then aiming at any range:** the desert became a 50 m standoff.
  - **The 40 m effective range** fixed both.

**Results** (A/B in one session, 3 + 3 matches per level, aiming vs the 10.0 hip-only shooter):

| | Match (s) | Kills/min | Kill range median | Moving |
|---|---|---|---|---|
| Docks | 170–187 vs 200–220 | 14.4–15.6 vs 13.4–14.4 | 16.6–26.2 vs 12.5–13.3 m | 82–85% vs 95–96% |
| Jungle | 190–220 vs 204–207 | 13.1–14.8 vs 13.8–14.1 | 8.9–13.2 vs 10.5–13.5 m | 82–86% vs 96% |
| Desert | 155–161 vs 190–217 | 17.5–18.5 vs 13.3–13.9 | 35–36.5 vs 26 m | 77–78% vs 96% |

- **Aimed vs hip at the same range:**
  - 12–25 m: 51–57% hits aimed, 15–22% from the hip;
  - 25–40 m: 11–32% aimed (lowest in the jungle fog), 5–7% from the hip.
- **Share of rounds aimed:** 59–80%.
- **Sight to first shot:** median 0.25–0.45 s with focus (hip: 0–20 ms).
- 0 friendly fire, 0 stuck.

**Validation:**
- **`world()`:** 0 findings on all four levels, standing and crouched.
  - Crouched reach is identical, except 2 cells in Tokyo: a metro stair, 0.25 m closer to its wall, under the street railing.
- **`stress()` standing:** 0 failures in 64,000 runs on all four levels.
- **`stress({ crouch: true })`:** 0 failures in 64,000 on the docks, jungle and desert; 1 on Tokyo (see Watch).
  - **Harness fix 1:** the solid-crossing detector assumed a 1.8 m body, giving 11 false reports of a crouch-jump in the culvert.
  - **Harness fix 2:** a landing could fall on the single idle frame; there are now two.
- **ADS transition:** FOV 74° → 53.3° in 0.2 s, rising evenly. Frame pacing toggling ADS every 0.35 s matches not toggling (P99 24.8 vs 25.1 ms).
- **`bench(3)`:** 59.6–60.3 FPS on every view of all four levels.
- **`tdmBench`:** 60 FPS, AI 0.40 ms.
- **`aiBench`, survival, alternated with 10.0:** within noise (Tokyo AI 0.25 vs 0.25 ms).
- **Survival `tactical()`:** Tokyo passes, 0 rounds into its own cover.
- **Tests and build:** 165 unit tests; build ok.

**Watch:**
- **Jungle survival `tactical()`:** flank and suppress fail ("never took cover"). This also happens on 10.0 `main`: it is pre-existing, not 11.0. Not yet investigated.
- **Tokyo crouched stress:** one run in 64,000 ended overlapping a vaultable parapet while standing again. It's the standing controller's landing-frame overlap on vault colliders, and it resolves in the next frames.
- **Jungle pace:** matches are about the same length or slightly longer. In the fog aimed bursts hit only 11% at 25–40 m.
- **The desert fights at 35–40 m now.** The kill range clusters just under the 40 m cap.
- **Not felt by a human yet:** the ADS feel, the crouch, and whether a raised rifle reads at 30 m.

## 12.0: the slide, shared team spotting, Desert 2.0, bots that feel alive
Branch `feature/mobility-desert-12.0`, based on `main` (11.0, `8e697f7`, which is now deployed). Numbers: `docs/BENCH-12.0.json`.

**The slide (C while sprinting):**
- **Physics** (`src/player/Slide.ts`, shared by the player and the bots): the slide starts at the sprint speed × 1.12 and slows by `dv/dt = −(k·v + μ)`, drag k = 0.6 /s plus friction μ = 1.9 m/s². Integrated exactly per frame: `v ← (v + μ/k)·e^(−k·dt) − μ/k`.
  - From a sprint it lasts 1.17 s and covers 6.3 m. It hands off to the crouch walk with no jump in speed.
  - The same slide at 30 and 144 FPS lands within 3% (unit test).
- **Feel:** the hitbox and camera drop to the crouch (the crouch blend, rate 12). A slight camera roll and a 4° FOV kick fade with the speed, and there are no footsteps. A scrape plays as it starts.
- **Control:** you can fire and aim down sights; aiming doesn't brake the slide. A little steering (1.6 rad/s), never a turn round.
  - A wall eats the momentum.
  - Space jumps out of it with the speed kept, standing up in the air.
  - It ends crouched (tap) or as the key says (hold).
- **Bots slide too:** rushing a wounded target 6–14 m out, diving into a spot 2.5–7 m ahead, or crossing open ground with a contact within 30 m. Same model, ending at their crouch walk, with a slide pose.

**Shared team spotting and the minimap:**
- **The player is a viewer in the arena's sensing pass**, like a bot. His field of view is ±58°, never behind him, re-checked every 0.12 s.
  - His pairs share the ray budget and the symmetric pair cache. A hostile bot that already traced its line to him answers his check for free.
  - It replaces 7.0's callout rays (3 rays every 0.4 s).
- **The board:** whatever anyone on ALPHA sees goes on ALPHA's board, with who saw it and from where.
  - `ArenaDirector.spotted()` lists what was seen within 2.5 s. Heard gunfire is on the board but never a dot.
- **The minimap** (`src/ui/TdmMinimap.ts`, top left in TDM): heading-up, centred on you.
  - Its floor plan is drawn once per level from the collision world, so every arena has one and it's exactly what blocks you.
  - Allies are blue. Spotted hostiles are red, full while seen, fading over 2.5 s. A hollow dot with an arrow means another level (roofs, the culvert).
- **The bots use it:**
  - **FLANK:** a hostile a teammate is fighting right now (seen within 1 s, by a spotter at least 8 m away) that this bot can't see, 14–55 m off, is taken from the side.
    - The goal is 11 m from the contact, 105° off the spotter's line, snapped to the nav graph.
    - At most two flankers per hostile, the second on the other side (a pincer).
    - Most flanks turn into a fight before they arrive: the hostile comes into view on the way round.

**Bots that feel alive:**
- **Temperament per bot:**
  - its own reaction time (~0.17 s, sd 0.045, clamped 0.09–0.32 s), stretched 0.8–1.25× per event and shortened for a hit;
  - aggression 0.8–1.25 (push thresholds, range band);
  - patience 0.85–1.2 (aimed focus);
  - a liking for flanks and slides.
  - Decide intervals are jittered ±25%. A squad no longer turns on one frame: 7.0's "decide on the frame you see" is now "decide after your own reaction time".
- **RETREAT:** two triggers.
  - It took 30% of its health in 2 s from someone it can't see.
  - Or it sees at least 3 hostiles, 2 more than its friends within 18 m, while under 60% health.
  - It then dives to the nearest spot that breaks the threat's line of sight, and sprints to the nearest friend behind it (else back down its lane).
  - It stops when it reaches the friend, after 6 s, or when cornered (a hostile within 8 m). 10 s cooldown.
  - A nearly dead target close by is finished, not run from.

**Desert 2.0, the compound in three levels:**
- **OMEGA's side (north):**
  - a stair to the barracks roof;
  - a 10 m stair up the motor pool's north wall to its high roof (5.25 m, its parapet raised to 1 m);
  - a 20 m skybridge rising from the barracks roof to the motor pool roof over the north yard.
- **ALPHA's side (south):** the trading post roof (its own stair), a bridge to the clinic roof (now walkable; five crate steps, a jump each, climb its south wall), and a bridge on to the watchtower.
- **The culvert:** a concrete drain 3 m under the yard, from inside the west gate to inside the east gate.
  - Stairs down at each end, roofed for 42 m, three bulbs, two crate stacks.
  - The terrain is carved to its floor. The terrain mesh has a hole there that the culvert's roof and paving cover (1.45 m past the cut; the mesh's hole edge is at most 1.3 m out).
- **The HESCO opened up:** every side has a breach and a collapsed, vaultable stretch, placed point-symmetrically.
- **New lanes:** two more lanes per team, a point-symmetric culvert lane and a rooftop lane over each team's own roofs. Lane ties are now broken at random (five lanes, four or five bots).
- **Sandstorm:** the storm is the map's normal state.
  - Phases: calm 8–14 s (was 40–65), fronts 10–14 s (16–24), peak 70–100 s (35–55).
  - In a 4-hour run, intensity > 0.5 for over 75% of the time (unit test). In a peak-storm match the median kill range is 10 m.

**Results** (desert, bot vs bot, 25 tickets):

| | Match (s) | Kills/min | Kills from the side or behind | Sight to shot (median) |
|---|---|---|---|---|
| 12.0, clear | 204–217 | 13.3–14.4 | 6–7 | 380 ms |
| 11.0, clear | 180–182 | 15.5–15.6 | 0–1 | 430–470 ms |
| 12.0, peak storm | 259 | 10.7 | | |
| 11.0, peak storm | 332 | 8.5 | | |

- **Per desert match:** 80–99 flanks (most become fights on the way), 34–35 retreats (23–26 survive), 26–38 slides.
- **Docks** (A/B): kills from the side or behind 11 vs 1.
- **Jungle:** 6 per match.
- **Every match:** 0 stuck, 0 friendly fire.

**Validation:**
- **`world()` on the new desert:** 0 findings, standing and crouched. Reachable cells 122,236 (CULVERT 511, MOTOR POOL ROOF 712, SKYBRIDGE 67, …). `stairGaps()`: 7 stairs, 0 drops.
- **`stress()` on the desert:** 0 failures in 64,000 runs standing and 64,000 crouched, after four geometry fixes (see L-095…L-097 in the knowledge base and the bench notes).
- **Minimap and spotting cost** (tdmBench with the player, on vs off): AI 0.53–0.61 vs 0.46–0.50 ms, minimap draw 0.08 ms, FPS 60 either way.
- **`bench(3)`:** 59.3–60.3 FPS on every view of all four levels.
- **Survival on the desert:** 0 out of bounds, 0 inside geometry.
- **Tests and build:** 186 unit tests; build ok.

**Watch:**
- Sight-to-shot P90 on the desert is 2–3 s: aimed focus, plus bots moving up past the 40 m cap.
- The bots still spend about half their time in the dunes. The roofs (up to 7%) and the culvert (0–3%) are used, but fights mostly start outside the compound.
- Retreating bots still die in about 30% of retreats.
- **Not felt by a human yet:** the slide, the minimap, the new desert and the storm's pace.

## 13.0: the main menu, loadouts, bot identity, map to map

Branch `feature/loadouts-ui-13.0` (12.0 deployed first: `main` fast-forwarded to `da9092f` and pushed).

### Menu and post-match flow
- **Mode first, then the map** (`ui/MenuFlow.ts`, a pure state machine, rendered by `Hud.renderMenu`).
  - **Root screen:** the name field, the modes (each with its map count), settings, controls.
  - **Maps screen:** the maps that have the mode. Picking one builds it behind the menu, and DEPLOY lights once it's built. Back keeps the mode.
- **The player's name** (default *Artem*, kept per browser, cleaned to plain text, 14 characters):
  - the HUD callsign over the vitals (with ALPHA in TDM);
  - under the arrow on the minimap;
  - the kill feed, KILLED BY and the scoreboard.

  Keys typed into the field no longer reach the game.
- **Choose next map:** TDM's VICTORY/DEFEAT screen and survival's death screen list every map with the same mode. The current map comes first as REMATCH (a restart), and MAIN MENU is a small button.
  - Another map goes through `Game.nextMap`: a new `loading` state, the outgoing mode's teardown, a full unload and build, then the intro.
  - `unloadLevel` now also calls `tdm.dropLevel()`: the minimap, the team contexts (whose prototype was the old enemy context), and the match arrays.

### Bot identity
A pool of 30 mercenary callsigns (`enemies/Callsigns.ts`). Every match deals ten different ones to both teams, never the player's name. The Russian names and the fixed animal squad are gone.

### The loadout system
- **Unified armory** (`entities/weapons/armory.ts`): Kitsune-9 (plasma SMG), Jackal AR, Boar M12 shotgun, on every map.
  - `LevelInfo.arsenal` became `enemies` (the survival look) plus `storyWeapon` (Tokyo's story keeps the Kitsune).
  - Each entry is the player's `WeaponSpec` and a bot profile (`BotArm`): damage share, pellets, magazine and bursts, strafe band, aim ranges, effective range, push range, the round's look, and the rig gun's proportions.
- **The player's pick** (`gameplay/Loadout.ts`, `ui/LoadoutView.ts`, keys 1–3 or a click):
  - over the match intro (the keys don't skip it) and the first 3 s of play: swaps at once;
  - on TDM's respawn timer: queued for the next life, applied at the respawn;
  - remembered per browser.
- **Bots:** a gun dealt at every spawn, at most two of one gun on a team. The brain reads all its fire and range numbers from the gun (the rifle profile is exactly 7.0–12.0's `ARENA` rifle).
  - Shotgun shells fire eight pellets with one report and one casing.
  - The feed shows the killer's gun (SMG / AR / SG), and the scoreboard shows each player's last gun.
- **Ranges tuned from kill distances (L-103):** the shotgun's effective range is 12 m (it had been 18 m: a 13–16 m median kill), and the SMG's 25 m (32 m had it out-ranging the rifle on the desert).

### Validation
- **Tests:** 202 (16 new: armory, loadout, name, callsigns, bot aim by gun, the menu state machine). The build is OK, and the DEV tools stay out of the bundle.
- **Browser:**
  - real clicks: root → TDM → Docks → DEPLOY;
  - key 3 over the intro picks the shotgun without skipping it;
  - a death, key 1, respawn with the SMG (4.0 s);
  - the HUD, minimap and feed show the name and the guns;
  - a survival death → Jungle (the deploy note, no death screen left);
  - a TDM rematch (fresh tickets, new names, the picker).
- **Memory (`node scripts/leakcheck.mjs 2`):** desert → docks → jungle twice through the result screen's real cards, a forced full GC at every map, every left level tagged.
  - **0 of 48 tagged objects alive.**
  - Heap after GC: 13.3–16.0 MB on lap 1, 15.6–16.5 MB on lap 2, then 16.0 MB.
  - Scene objects and DOM nodes are identical lap over lap.
  - Geometries +16/+8 once (the shared shape cache warming), then flat. One minimap at all times.
  - In-page WeakRefs alone reported false leaks (L-101).
- **Weapon ranges:** `tdmSim` on three maps, three matches each. Median kill: shotgun 7–10.6 m, SMG 9–18 m, rifle 12–32 m. 0 stuck, 0 friendly damage, sight-to-shot medians 0.1–0.42 s.
- **Performance** (`docs/BENCH-13.0.json`): this session ran on battery at 16%, and Chrome's Energy Saver held every page at 30 Hz (a bare rAF loop: 30.1 Hz), so FPS reads 30 everywhere.
  - Work per frame: `bench(3)` on the docks 1.7–4.2 ms CPU + 3.5–4.8 ms GPU.
  - `tdmBench` on the desert with the player: 3.2 ms CPU + 4.2 ms GPU (random guns), 3.0 + 4.7 ms (all shotguns). That is under half the 16.7 ms budget.
  - **To do on mains power:** re-run `bench(3)` for the 60 FPS figure.

## 14.0: Tokyo: Neon Block, readable operators, vertical bots

Branch `feature/tokyo-tdm-14.0`. 13.0 was deployed first: `main` was fast-forwarded to `6a9bc08` and pushed.

### The map (`src/levels/neonblock/`, TDM only; the story district untouched)
- **Layout:** a Shinjuku block mirrored about the crossing, three lanes on three levels.
  - **West:** Lantern Alley (vending machines, lanterns), with a fire escape up Block W to a landing (4.5 m) and its roofs (7.2 m). The two halves' roofs are joined over the crossing by a skybridge.
  - **Centre:** Main Street under a footbridge (4.5 m). Its arms land on Block W's street landing (with a stair to the roof) and on Block E's roofs.
  - **East:** Block E's low roofs (4.5 m) joined across the Noodle Gap and over the crossing by bridges, with the Service Alley below.
  - **Street-level links:** the arcade through Block W, the Noodle Gap through Block E, the crossing, and the forecourts.
  - **Six drop-downs per half,** one-way, through gaps in the parapets and rails.
  - **Spawn yards** walled in, with three exits behind blast walls.
- **The 4.0 pipeline:**
  - wet asphalt with puddles, reflection catchers and neon streaks;
  - rain lit by the glows, a baked environment map, the teal/orange grade;
  - the facades' lit windows at about half the story district's brightness.
- **Lighting for reading people:** 31 warm or cold-white point lights placed over lanes, stairs, landings and roofs; the neon signs are callouts. The Service Alley got a third lamp per half after a body at the Noodle Gap's mouth read as nothing at 20 m.
- **Instanced props:** vending machines, roof and wall AC units, lanterns and rubbish bags; 152 instances in 11 InstancedMeshes.

### The operator skins (`src/entities/enemies/operators.ts`, every TDM map)
- **Gear:** matte, near-black cloth and graphite plates with a low environment response, so the wet neon doesn't mirror off them.
- **Accents:** small emissive pieces in the team colour (ALPHA cyan, OMEGA orange): a visor strip, shoulder patches and a segmented spine light.
- **Accent size:** the first cut's 2 cm strips disappeared at 20 m. They're now 3.5 cm and about 4% of the body.
- **Comparison:** `TDM.skins = 'legacy'` brings back the 6.0–13.0 looks.

### AI: vertical navigation and drop-downs
- **One-way drops:** `NavLayout.drops` are directed edges. The arena bots' route search walks them in reverse; survival routes never take them. A bot walks off the edge and falls under the existing gravity.
- **Measured drop:** sent from Block W's roof to Lantern Alley, a bot dropped roof → landing → alley and arrived in 3.8 s.
- **High ground (`ARENA.vantage`):** a flank's spot may be a floor up to 8 m above the contact, each metre counting as 0.8 m nearer. 34–51% of flanks on Neon Block now go up.

### Findings and fixes
- **Main Street drew the whole match:** 42–47% of bot time, 94% of kills from street level. It was a straight 92 m corridor with nothing at eye height. Fix: a police box at the crossing, a box truck and a bus shelter per half, and the plain street lane replaced by a Service Alley lane.
- **Stress test:** stall counters 0.4–0.6 m off a wall (stepping off into the slot ended inside geometry), and vaultable dumpsters against the boundary (a vault pushed bodies into the wall). They're now flush and not vaultable.
- **`__dev.world()` didn't see instanced meshes:** it reported 32 "invisible walls". It now reads them per instance.
- **A street-lamp pole ran up through the street stair:** caught by the nav check ("node inside geometry").

### Results
- **World:** 0 findings standing and crouched (34,418 cells); stress 0/16,000 standing and crouched; stair gaps 0 drops. Docks, Desert, Jungle and Tokyo still report 0 with the instanced-aware check.
- **Six bot matches** (25 tickets):
  - 164–207 s; first contact at 7.4–11.7 s;
  - bot time: street 64–73%, mid 21–28%, top 6–11%;
  - 2–11 drop-downs a match; about 49% of kills from above street level;
  - 0 stuck, 0 friendly fire, AI 0.06 ms per step.
  - The first cut: street 86–91%, top 1.6–2.9%, about 6% of kills from above.
- **Memory:** `node scripts/leakcheck.mjs 2 neonblock,docks,desert` left 0 of 48 tagged objects from the left levels alive after a forced GC. Geometries, textures, scene objects and DOM nodes are flat lap over lap. Neon Block's heap after GC read 14.0, 15.7 and 16.5 MB on its three visits (watch item: no level object retained).
- **Rare stuck bot:** one in 22 matches over the session (a hunter in ALPHA's yard corner), not reproduced by placing bots there.
- **Performance** (`docs/BENCH-14.0.json`): on battery at 11%, Chrome held every page at 30 Hz. Neon Block's ten views cost 4.5–5.9 ms CPU and 6.5–8.7 ms GPU per frame, inside the 16.7 ms budget. The 60 FPS figure needs a re-run on mains power.
- **Tests:** 203, including drop-down routing.

## 15.0: Jungle: Crash Site, the Neon Docks rework, lane pressure

Branch `feature/arenas-rework-15.0`. 14.0 was deployed first: `main` was fast-forwarded to `ecc0ca5` and pushed.

### Jungle: Crash Site (`src/levels/crashsite/`, TDM only; Firebase Viper untouched)
- **Mirrored, three lanes:**
  - **The ridge** (west): a 3.6 m rock plateau, stone steps at both ends and at z ±22, a fallen tree at mid-field, a rock lip with drop gaps.
  - **The wreck** (centre): a crashed dropship to walk through (doors, a breach), broken wings as ramps to its 3.9 m roof, mud trenches 1.4 m deep down from both approaches.
  - **The ravine** (east): a 4 m-deep floor between rock rims, three fallen giant trees across, the jungle bank beyond.
- **Landing zones:** HESCO yards that open only at their sides, toward the flanks.
- **Heightfield rules** (the terrain is always floor):
  - gentle relief is terrain (≤ 22°, unit-tested);
  - steep relief is colliders (the ridge's blocks, the ravine's rims over its drop);
  - steps walked onto are ≤ 0.3 m.
- **Mirrored to the noise:** heights, trees, boulders and the foliage density.
- **The jungle look:** the dappled sun with static shadows, light shafts onto the wreck, the ridge and the middle bridge, mist, mud, a slightly thinner fog (90% at ~64 m) so the ridge's rifle lines work.
- **Foliage:** `buildFoliage` takes a `FoliageSite`. Firebase's default reproduces 14.0 exactly (plant counts and concealment checked against `main` served from a worktree).

### The Neon Docks rework
- **Warehouse:** roofless, walls 10 → 7 m, the tall cover removed (crate stacks, the container, the under-bridge stack), main doors 8 → 4 m.
- **Yards:** no centre exit; two side exits, each behind an L of blast wall that turns you to your flank.
- **Container gantry** over the maze at container-top height (2.6 m): stairs at both ends, drops into the cross corridors.
- **Quay gantry** (6.5 m) 4 m out from the warehouse, with an armoured half-wall facing it and the crane nest at mid-field; stairs at both ends and from the quay to the nest.
- **Three lanes:** containers (over the gantry), the warehouse, the waterfront (the quay and the nest).

### AI: lane pressure (`ArenaDirector`, `ARENA.lanePressure`)
- **Heat:** each team keeps a heat per lane (deaths +1, gunfire it hears +0.04 a round, halving every 10 s).
- **Assignment:** new bots take the lowest (count + 1.2 × heat), with ties at random (14.0 sent ties to the centre).
- **Relief:** a hot lane with two or more bots gives one up to the coolest, at most every 6 s; a hot empty lane isn't refilled.
- **Routes:** lane discipline turns the lane into the route.
- **A/B:** `tdmSim({ pressure: false })`.

### Results (`docs/BENCH-15.0.json`)
**Docks, bot time per lane** (containers / warehouse / waterfront):

| Version | Containers | Warehouse | Waterfront |
|---|---|---|---|
| 14.0 | 13–21% | 60–75% | 11–24% |
| First rework, five lanes | 38–42% | 24–31% | 28–38% |
| Three lanes, pressure off | 26–35% | 42–55% | 19–23% |
| Final (11 matches) | 33–40% | 32–42% | 20–30% |

Target ~30 / 40 / 30: the warehouse is on target, the waterfront a few points short. Warehouse kills fell from 31–41 to 15–28 a match. The container gantry is used (4–6% of time, 10–19 drop-downs a match). The quay gantry and the nest are barely used (≤ 0.8%): bots meet the enemy before they climb.

**Crash Site, bot time per lane** (ridge / wreck / ravine):

| Version | Ridge | Wreck | Ravine |
|---|---|---|---|
| Front exits | 9–21% | 46–75% | 16–34% |
| Side exits, pressure off | 16–22% | 40–61% | 17–45% |
| Final (5 matches) | 23–32% | 43–51% | 22–33% |

7–12 drop-downs a match.

- **Every match on every map:** 0 stuck, 0 friendly fire (Desert, Firebase and Neon Block rechecked).
- **World:**
  - Crash Site: 0 findings standing and crouched (44,810 cells; each team's approach and LZ identical cell counts); stress 0 / 16,000 standing and crouched.
  - Docks: world 0 and 0, stress 0 and 0, stair gaps 0 drops.
- **Performance, on mains power (60 FPS on Balanced in every bench view of every map):**
  - Crash Site: CPU 1.9–2.3 ms, GPU 4.8–6.6 ms.
  - Docks: CPU 1.9–3.0 ms, GPU 6.4–8.3 ms.
  - Neon Block, confirmed at 60 FPS now: GPU up to 12.4 ms.
- **Memory:** `leakcheck` crashsite → docks → neonblock twice: 0 / 48 tagged objects alive after a forced GC.
- **Tests:** 211.

### Bugs found on the way (lessons L-107…L-112)
- Five lanes overshot.
- A gantry reached only from its ends stays empty.
- Steps of 0.35–0.45 m needed a jump.
- Smoothstep banks peaked at 27–31°.
- The terrain noise wasn't mirrored.
- A giant tree grew on a bridge's approach.

## 16.0: thematic UI, biome flavor, the main menu's 3D stage

Branch `feature/ui-presentation-16.0`. 15.0 was deployed first: `main` was fast-forwarded to `9904ef8` and pushed.

### Biome flavor (`src/ui/Flavor.ts`)
Every label's decorative sub-text was Japanese until 15.0, on every map. It now follows the place; the English stays the readable text everywhere.

| Biome | Maps | Script | Example |
|---|---|---|---|
| tokyo | Tokyo After Midnight, Neon Block | Japanese | PAUSED 一時停止 · 第三波 |
| desert | Desert Outpost | Arabic (Arabic-Indic numerals) | PAUSED متوقف · الموجة ٣ |
| docks | Neon Docks | Russian, industrial | PAUSED ПАУЗА · ВОЛНА 03 · СКЛАД №7 |
| jungle | Deep Jungle, Crash Site | Thai (Thai numerals), grid references | PAUSED หยุดชั่วคราว · 47P QS 441 882 |

- **One dictionary** (`FLAVOR`, 44 lines × 4 biomes). `LevelInfo.biome` names a level's biome; `Game.loadLevel` calls `setBiome`, which sets `html[data-biome]` and rewrites every element marked `data-fl` in one pass. No per-frame cost: the wave counter asks for its line only when its number changes.
- **Converted:**
  - the HUD (VITAL, the wave counter and banners, the death screen);
  - the main menu (labels, modes, BACK / DEPLOY);
  - the pause menu, the TDM HUD and result screen (ALLY / ENEMY, VICTORY / DEFEAT, DEPLOYING, CHOOSE NEXT MAP);
  - the loadout picker and the weapon label (each gun has a name per biome: 狐 / ثعلب / ЛИСА / จิ้งจอก).
- **Levels:** the names, title lines, opening cards and every zone name are in their biome's script. Jungle places carry MGRS grid references (FIREBASE VIPER · 47P QR 118 640). In-world text follows too: crate stencils, the clinic sign, the firebase signs, and the docks' neon (ДОК-7, ПОРТ, СКЛАД).
- **Unchanged:** the story's own UI (StoryHud, the end card, the minimap's labels) stays Japanese: it is Tokyo's story.
- **Typography:** `--jp` is swapped per biome (Hiragino, Geeza Pro, a monospace for the Cyrillic stencil look, Thonburi). Japanese and Cyrillic keep their wide tracking; Arabic and Thai are set solid, because tracking breaks Arabic's joins. A map card for another place carries its own `lang` and script.
- **No hitches:** every line in every script is laid out once at boot, off screen, with the menu's typefaces in each weight. `setBiome` costs 0.7–3.3 ms at a level load.

### The main menu's 3D stage (`src/ui/MenuStage.ts`, option B)
- **Root and controls screens:** the loadout's gun turns on a crate under a spotlight. It sits on a wet floor with a faint grid, with cyan and magenta rims, a cool fill, a soft halo behind the gun, a volumetric light cone with dust drifting on the GPU, and far neon through the haze.
- **Armory row:** a new row on the root picks the gun (it is the loadout) and swaps the model on the crate.
- **Maps screen:** the picked map's own title camera (option A), so both options are in.
- **Its own scene and look:** the level isn't drawn or updated behind it, and the viewmodel pass is off.
- **Lifecycle:** `Game.syncStage` runs at every state or screen change. It builds the stage on root and controls and destroys it for the maps screen, an intro, play or a load: `dispose` frees every geometry, material, texture and the environment target, then the only reference is dropped.

### Cyberpunk CSS and sound
- **Fonts:** Rajdhani for the UI, Orbitron for titles. Self-hosted through @fontsource, Latin subsets only.
- **Effects:**
  - scanlines and a vignette over the title and the pause menu;
  - clipped-corner buttons;
  - chromatic aberration on hover (the text splits magenta and cyan, jittering);
  - a glitch tear between menu screens;
  - a rare glitch on the GRIDFALL title.

  `prefers-reduced-motion` turns them off.
- **Sounds** (Web Audio, in the menu theme's D minor): a soft A on hover (rate-limited), a falling D–A over a click tick on click, and a filtered noise sweep with each screen glitch. The menu theme itself is unchanged: slow, wide D minor.
- **Fixed on the way:**
  - The title's tagline had shared its class with the story subtitles (`.sub`, opacity 0) since 3.2 and never showed.
  - The maps screen is wider (five cards a mode).

### Results (`docs/BENCH-16.0.json`)
- **Stage teardown** (`node scripts/stagecheck.mjs 6`, headless Chrome, forced GC):
  - 6 stages and 12 swapped guns, all collected: 0 tagged objects alive;
  - GPU objects on the maps screen identical every cycle (60 geometries, 44 textures, 46 programs);
  - the stage is gone before the maps screen and before deploy.
- **Map transitions** (`leakcheck.mjs 1 desert,docks,crashsite`): 0 alive.
- **Menu cost:**
  - root menu frames: p99 10.2 ms, max 10.4 ms at 120 Hz;
  - stage build 15.6 ms, teardown 0.9 ms, gun swap < 1 ms;
  - 63 draw calls, 1.7k triangles.
- **`bench(3)`, every map through the real menu path:** 60 FPS on Balanced in every view of every map.

  | Map | CPU (ms) | GPU (ms) |
  |---|---|---|
  | Tokyo | 1.9–2.2 | 6.1–6.8 |
  | Desert | 1.7–2.2 | 5.1–5.7 |
  | Docks | 0.8–1.8 (run before the CSS fix) | 6.8–8.4 (main today: 6.1–8.6) |
  | Jungle | 1.8–2.3 | 5.8–6.2 (main: 5.7–6.9) |
  | Neon Block | 1.3–2.0 | 7.0–12.5 |
  | Crash Site | 1.7–1.9 | 5.9–6.2 |

- **Regressions found and fixed:**
  - `.hidden` is opacity only, so the title's blended scanlines and endless animations kept compositing over the game: docks +1.5–2 ms GPU against `main` in a same-session A/B. They now switch off when hidden.
- **Known, not fixed:** on the jungle, a match started straight from the stage (only `__dev.start` can; DEPLOY is on the maps screen, which draws the level first) spends ~1 ms more in render submission for ~30 s. Through the menu, the bench equals `main`.
- **Tests:** 215 (+4: every line in every biome in its script, none Japanese outside Tokyo; numerals; `setBiome`; the arenas' zone names).

## 17.0: the thermal pass (cooler, same look)

Branch `fix/thermal-optimization-17.0`, from `main` @ `dfe0baa` (16.0). The brief stopped feature work: the machine ran hot and throttled after 14.0–16.0. Every suspect was measured against 16.0, served from a worktree on another port in the same session, before anything changed. Full numbers: `docs/BENCH-17.0.json`.

### What was hot, and the fixes
1. **Point lights (14.0 Neon Block, Neon Docks).** three.js shades every drawn point light in every lit pixel. Neon Block has 34 and Docks 30; on Apple M5 the cost is flat to ~22, then climbs (Neon Block's alley: 12 lights 6.2 ms, 24 6.9, 28 8.9, 34 13–14).
   - **Fix:** `src/core/LightPool.ts`. The level's lights move to a layer no camera draws. A fixed set of real lights (Power 8, Balanced 16, High 20, never more than the map has) copy the ones lighting the view: frustum-culled, ranked by intensity × apparent size of their range, faded in and out over 0.25 s.
   - **Recompiles:** the slot count never changes, so nothing recompiles.
   - **Exempt:** the muzzle flash and the rounds' glow stay real lights (`userData.unpooled`).
   - **Cost:** 0.08 ms of CPU per frame.
2. **The 16.0 menu CSS.**
   - **The cause:** the scanlines drifted by animating `background-position` under `mix-blend-mode: overlay`, and the pause overlays had a backdrop blur. Together they made a full-screen repaint and re-blend at 120 Hz.
   - **The hottest case:** the pause menu, where the game draws nothing: Chrome's GPU process used 57% of a core.
   - **Fix:** static scanlines with plain alpha, and a darker tint instead of the blur.
3. **A crashed leak check left headless Chrome rendering** (SwiftShader, ~400% CPU) for 4 h 38 min. `scripts/lib/cdp.mjs` now kills it on every exit path.
4. **The menu stage draws at 1.0×** (`Renderer.setCeiling`, lifted when it closes). It is fill-bound: 5.1 → 3.2 ms per frame.
5. **The TDM result screen draws the arena at 30 FPS** (a `results` state), not 60.
6. **Both minimaps redraw at 30 Hz** (2D canvases; there was never a second camera).

### Checked and left alone (measured)
- **Device pixel ratio:** capped per preset since 3.2 (0.85 / 1.25 / 1.5, never above the display's), with adaptive resolution. In game views, 36% fewer pixels saved ~0.2 ms: the GPU clocks down below ~40% busy.
- **Disposal:** see the VRAM cycle below.
- **Shadow maps:** one shadow-casting sun per map, all static (drawn once). 2048 vs 1024 measured the same per frame, so they stay at 2048 (VRAM only; 1024 would double the texel size over 160–220 m frustums). This is the one point where the brief's rule was not applied.
- **Post-processing:** bloom from a quarter-resolution base with 3 levels. The post chain cost ~0.1 ms in a game view.
- **Background tab:** loop stopped, match paused, audio and music timers suspended (since 3.2). Re-verified: 0 s of simulation in 1 s hidden, renderer CPU 30.6% → 4.6%.

### Results (Balanced, 60 FPS cap, Apple M5)
| | 16.0 | 17.0 |
|---|---|---|
| Neon Block, `bench(3)` GPU ms (busy) | 7.5–13.4 (45–80%) | 6.1–6.7 (36–40%) |
| Neon Block, back to back, three worst views | 12.1 / 12.4 / 11.5 | 6.6 / 6.1 / 6.1 |
| Neon Docks, GPU ms | 6.5–8.3 (another run 6.8–11.0) | 6.0–6.8 |
| Crash Site / Tokyo, GPU ms | 5.3–6.3 / 6.2–6.9 | 5.7–6.4 / 6.1–6.5 (few lights: unchanged) |
| Menu stage, GPU ms at 30 FPS | 3.8–5.1 | 3.2 |
| Pause menu: Chrome GPU process / renderer CPU | 57.3% / 13.0% | 1.9% / 3.6% |
| Title with the game's loop stopped (CSS alone) | 41.6% / 20.2% | 2.4% / 3.4% |
| Title, everything running | 47.3% / 23.9% | 12.6% / 17.3% |

- **CPU per frame:** 1.2–3.3 ms in both builds; it moves ±1 ms with the match's state and the CPU's clock. Every view held 60 FPS in both builds.
- **The ~6 ms floor:** every map now sits near 6 ms of GPU at ~37% busy, which is the clocked-down floor on this machine.
- **VRAM** (`__dev.vramCycle({ laps: 3 })`: Neon Block → Crash Site → menu → Docks through the real UI): geometries, textures and programs equal lap over lap.
  - Neon Block 230 / 62 / 73, Crash Site 121 / 28 / 53, menu stage 106 / 16 / 52, Docks 192 / 42 / 64.
  - Drawn point lights: 18 / 4 / 2 / 18 (16.0: 34 / 4 / 2 / 30).
  - 16.0 passes the same cycle: there was no GPU-memory leak; disposal has been strict since 13.0 and 16.0.
- **Forced-GC checks:**
  - `leakcheck.mjs 2 neonblock,crashsite,docks`: 0 of 48 tagged objects alive;
  - `stagecheck.mjs 3`: 0 alive.
- **Tests:** 221 (+7: the pool's ranking, fades, slot bound, layers, a small map's own count; the budgets; the result screen's cap).

### Not done
- **Old Port, the first 17.0 brief:** its branch `feature/daytime-docks-17.0` (`b30f914`) is parked, not merged. This brief replaced that work.
- **Neon Block's look:** at 16 lights, the overview from the west roofs loses a little fill on far roofs. The alleys and lanes looked the same in screenshots with every light and with 12.

## 17.1: Old Port (a daytime TDM arena), a random player name

Branch `feature/old-port-17.1`, from `main` @ `8d5c916` (17.0, the thermal pass, deployed first). The map was built on `feature/daytime-docks-17.0` from 16.0, parked for the thermal pass, then re-applied here and re-checked under 17.0's light budget (section *17.1 on the thermal base* below).

### Menu: the player's name
- **No fixed default:** a browser with no saved name is dealt a mercenary handle from the bots' pool (13.0's 30 callsigns, title-cased: Jax, Nova, Viper) at every boot.
- **What is saved:** only a typed name; clearing the field forgets it.
- **Check:** in a fresh headless profile, four boots gave Echo, Sable, Orin and Orin (repeats can happen with 30 names), and a typed name survived reloads. `cleanName` takes a fallback (this boot's handle).

### Old Port (`src/levels/oldport/`)
- **A new arena, not a copy of Neon Docks:** there the centre is a warehouse and the flanks are flat; here the warehouse is a two-storey flank, the centre an open yard with raised stacks, and the east lane has four levels.
- **The warehouse** (west):
  - a pillared brick hall, close range;
  - an upper floor (4.4 m) under broken skylights (sun patches and light shafts), with a hole to drop through and windows over the yard;
  - interior stairs at both ends, fire stairs to the alley.
- **The yard** (centre):
  - THE STACKS (5.2 m) near each side, with stairs from the apron and from mid-field and drops off their edges;
  - a steel walk across to STACK B;
  - low cover and a reach stacker at mid-field.
- **The dry dock** (east):
  - a 4.5 m basin, carved inside its walls' colliders;
  - a coaster on keel blocks: deck 1.0, reached by gangways from both quays and scaffold stairs from the dock floor; bridge roof 3.6;
  - the sea quay under a container crane, a 2.4 m fence, the sea.
- **Daylight that is pleasant, not dramatic** (`docs/LEVELS.md`, "Daylight"):
  - one sun with soft static shadows and a sky hemisphere that keeps the shade at about a quarter of sunlight;
  - bounce light inside the warehouse (a faint emissive on its materials, five weak fill lights);
  - a near-neutral grade, bloom only on sun glints;
  - a palette of warm brick, pale concrete and faded paint.
- **Weather:** a light haze, skylight shafts, haze sheets over the sea, ripples, flags, and a new `harbour` ambience (breeze, sea wash, gulls, a far horn, chains).
- **Menus:** TDM (the sixth map) and Arcade Survival (22 spawns over the whole port).
  - **Not in Story:** the brief asked for the Story menu too, but Story Escape is Tokyo's narrative (its acts, train and ending live in that district), so Old Port offers TDM and Survival instead.

### Results (`docs/BENCH-17.1.json`)
- **World integrity:**
  - `world()`: 68,540 cells, 0 findings standing and crouched.
  - `stress()`: 0 failures in 256,000 runs, standing and crouched.
  - `stairGaps()`: 22 stairs, 0 drops.
  - **Fixed on the way:**
    - the gangways' handrails and a plinth across the doors (seen but not solid);
    - a 1.6 m sea fence that a sprint-jump off a bollard cleared;
    - a slot under the hull's overhang at the scaffold's foot.
- **Navigation:**
  - 787 nodes, 18 drop-downs, one connected graph;
  - every test goal is reached from both yards, by the arena bots (with drops) and by survival (without);
  - all 22 survival spawns are valid; a 30 s survival run had no errors.
- **Flow, bot matches (`tdmSim`, 25 tickets, last four):**
  - lane time: warehouse 25–31%, yard 34–53%, dock 23–35%;
  - kills by lane: yard 15–26, warehouse 10–13, dock 8–14;
  - 3–12 drop-downs a match (off the stacks, the dock edges, the upper floor);
  - 0 stuck, 0 friendly fire;
  - matches last 2.8–3.5 min at 14–16 kills a minute.
- **High ground, honestly:**
  - the upper floor gets 1–3% of bot time, the ship 1–4%, the dock floor 6–16%;
  - the stacks get only 0.1–1%.

  Bots hunting a contact take the lane waypoint level with it, and the fights are at mid-field, while the stacks are near each team's side. A second stair from mid-field didn't change that. The AI's preferences were left alone (they serve six other maps).
- **Performance** (`bench(3)` through the menu, Balanced, on mains power):
  - 60 FPS in all 10 views;
  - CPU 1.3–2.1 ms, GPU 5.2–6.3 ms, 87–299 draw calls.
- **Leaks:** `leakcheck.mjs 1 oldport,docks,crashsite`: 0 alive after a forced GC.
- **Tests:** 224 on 16.0 (+9: Old Port's layout, the dock's carve, zones, `carve`; the random name).

### 17.1 on the thermal base
- **Re-applied, not rebuilt:** the map's commit was cherry-picked onto 17.0; only docs conflicted (the bench moved to `docs/BENCH-17.1.json`, 17.0's file is the thermal bench).
- **Inside the 17.0 limits:**
  - point lights: 5 (the warehouse's fills), all in the pool (5 sources, 5 slots, under every preset's budget);
  - one shadow-casting light, the sun, drawn once at load (`autoUpdate = false`) at 2048 like every other map (17.0 measured no per-frame difference against 1024);
  - the god rays and the haze sheets are unlit transparent quads, the haze is the scene fog.
- **`bench(3)`** (Balanced, through the TDM maps screen): 60 FPS in all 10 views; CPU 1.5–1.9 ms; GPU 5.2–6.5 ms (busy 31–39%), 89–276 draw calls. The 16.7 ms frame leaves ~10 ms of GPU headroom.
- **World:** `world()` 68,540 cells, 0 findings standing and crouched; `stairGaps()` 22 stairs, 0 drops.
- **Leaks:** `leakcheck.mjs 2 oldport,neonblock,crashsite`: lap 1 = lap 2 everywhere (Old Port 148 geometries, 36 textures; the first reading of 109 is before the bots' guns load), 0 alive after a forced GC.
- **Tests:** 230 (221 + Old Port's 9). Build clean, no DEV tools in the bundle.

## 18.0: Maglev Terminal (a corporate sci-fi TDM arena)

Branch `feature/maglev-terminal-18.0`, from `main` @ `6e5044e` (17.1, deployed first: `main` fast-forwarded and pushed). Full numbers: `docs/BENCH-18.0.json`.

### The map (`src/levels/maglev/`, `docs/LEVELS.md`)
- **A white glass-roofed transit hall**, 60 × 120 m, mirrored about z = 0: a three-car maglev hovering in the middle (its aisle the close-quarters lane; cab passages through both noses, six side doors), wide platforms either side (rifle lanes), 1.5 m track beds beside them, a mezzanine (east) and a balcony (west) at 5 m, two skybridges across the hall over the train, escalators (non-functioning: ribbed inclines) and static glass elevators.
- **Look:** daylight through the glass roof (one sun, static shadows: the roof grid on the floor), white concrete, polished stone, brushed steel, one corporate teal; the `terminal` ambience.
- **The glass:** plain transparent `MeshStandardMaterial` (no transmission, no refraction), depth-write off, the static environment map as its reflection; merged per material; no shadows. A unit test keeps physical materials out of the builder.

### The central pull (the brief: bots must fight in the train)
- **Engine, opt-in per map** (every other map unchanged; tests for the defaults):
  - `TdmData.laneWeights`: the director's lane balance per weight (Maglev: the train is worth 1.6, two of five bots);
  - `TdmData.laneStrict`: a strict lane's bots close on radar contacts along the lane (`planLane` uses the 8.0 `laneGoal`), instead of straight at them;
  - `NavLayout.cost`: a link's cost as a multiple of its length (Maglev: 0.55 inside the train).
- **How it got there** (`tdmSim`, 25 tickets):
  - first build (side doors only, no settings): the train got 0.9% of bot time and 2 of 48 kills;
  - with the settings: 13–18% and 3–7 kills, but both teams' train bots walked platform 2 to the east doors, and it became the killing field (20–23 kills a match);
  - cab passages through the noses (the centre lane a straight line from the yard's centre exit): **train interior 24–30% of bot time, 9–16 kills a match**, the shotgun 8–20 kills at a 5.6–10.5 m median;
  - the same map with the settings off: 2–8% and 0–5 kills. All lanes strict: the train 24–32%, but the track beds empty (0.3%): not shipped.
- **Flow (four matches):**
  - 2.3–2.7 min, 18–22 kills a minute, 0 stuck, 0 friendly damage;
  - lane time west / train / east: 13–19% / 41–50% / 37–46%; kills 6–14 / 14–19 / 21–23;
  - 10–13 drop-downs a match, 12–17% of bot time on the 5 m level;
  - AI 0.05 ms a step on average (P99 0.4), 21 rays a step.
- **Honestly:** the track beds get 1–2% of bot time and the west balcony none; they are routes for players (and escapes), not where bots fight.

### Validation
- **`bench(3)`** (Balanced, through the menu): 60 FPS in all 10 views; GPU 5.1–7.3 ms (the bridge the worst, 44% busy), CPU 1.2–1.7 ms; 3 point lights (pooled), one static shadow map. The glass costs 0–0.7 ms (hidden vs shown).
- **World:** `world()` 49,300 cells, 0 findings standing and crouched; `stress()` 0 in 256,000 runs (standing and crouched); `stairGaps()` 18 stairs and escalators, 0 drops; `levelAI()` 152/152 runners, 8/8 gunners. **Fixed on the way:**
  - thin fascia colliders under the bridges' and the mezzanine's edges, crossed by bodies falling through the drop gaps (one deck box, a flush downstand beam);
  - slots: a yard bench 0.6 m off a wall, carts 0.4 m off the track walls (and flush, a step out of the bed), a 10 cm sliver of slab beside an escalator's hole;
  - bots on the track beds' stairs skipping to nodes beyond the shallow wall and pushing into it; a buffer stop 0.3 m under the wall's top (railings beside the stairs, buffers removed, the bed's nav on the guideway beam);
  - the noses' sides outside every zone.
- **Leaks:** `leakcheck.mjs 2 maglev,oldport,neonblock`: lap 1 = lap 2, 0 alive after a forced GC.
- **Tests:** 242 (+12: Maglev's layout, lanes, carve, zones, the glass rule; lane weights).

## 19.0: Jungle: Crash Site 2.0 (the temple), self-play density, 7v7

Branch `feature/jungle-rework-19.0`, from `main` @ `5e10623` (18.0, deployed first). Full numbers: `docs/BENCH-19.0.json`; the map in `docs/LEVELS.md` (*Crash Site 2.0*).

### The map
- An overgrown stepped temple in the middle with the dropship lying across its top: fight under the ship (the undercroft, gates through the terraces, a hole in the deck), inside it (deck level with the upper terrace), above it (its roof, a fallen lintel, the shrine at 7.2 m). Roots, broken columns, fallen drums, cargo pods. Denser forest and undergrowth (×1.5, instanced).

### Self-play (`tdmSim`, bot vs bot, tickets 5 a player, three matches a cell)
| | kills/min | first engagement (median) | quiet seconds |
|---|---|---|---|
| 15.0 map, 5v5 | 12.7–19.9 | 13.9–14.9 s | 29–41% |
| 15.0 map, 8v8 | 24.3–29.5 | 14.4–15.9 s | 16–25% |
| temple, 5v5 | 14.2–14.3 | 16.4–17.4 s | 37–41% |
| temple, 8v8 | 23.7–27.4 | 14.8–16.3 s | 20–24% |
| temple + forward respawns, 5v5 | 10.3–19.0 | 11.1–13.7 s | 33–53% |
| temple + forward respawns, 6v6 | 22.9–29.7 | 8.9–10.8 s | 15–27% |
| **temple + forward respawns, 7v7** | **29.0–29.9** | **9.3–10.5 s** | **14–18%** |
| temple + forward respawns, 8v8 | 32.9–38.6 | 8.8–9.4 s | 13–21% |

- **More bots** cut the quiet seconds; **forward respawns** cut the walk (the first engagement was the spawn-to-temple walk at every size). 7v7 is the knee: as little downtime as 8v8, the steadiest cell. Shipped: 7v7, 50 tickets (2.6–2.9 min at 45).
- **The jungle AI profile** (7v7, 45 tickets, on vs off): 30–32 vs 26–30 kills a minute, first engagement 8.4–10 vs 9.4–12.1 s, bots dying without firing 2–4 vs 3–8 a match. SG kills at a 6.8–7.4 m median, SMG 11 m, rifles 10–12 m (the band moved in).
- **Lanes:** the temple lane 70–73% of lane time and two thirds of the kills; under, inside and above the ship together ~13% of bot time and 21 kills in a match. Balancing the flanks brought the downtime back (not shipped).

### Engine (all opt-in per map unless noted)
- `LevelInfo.teamSize`, `TdmData.tickets`, `TdmData.arena` (an ARENA profile applied at the match's start, restored at its end), `TdmData.forward` (forward respawns), `FoliageSite.density`, `NavLayout.faces`; `ARENA.coverPush` (off by default). The menu card and the briefing read the team size (`7v7 TDM`).
- **For every map:** self-play is now NvN (the spectating player's slot is filled by a bot); stairs are walked (`Nav.climb`: a walker never skips a climbing hand link's node, and a route never enters one mid-flight from beside it). `levelAI` on the other seven maps equals `main` (no regressions; Docks 145 vs 144 of 160).

### Validation
- **`bench(3)`** at 7v7 (13 bots and the player), Balanced, through the menu: 60 FPS in all 12 views; CPU 1.5–2.1 ms, GPU 4.7–5.9 ms; 288k triangles, 2 point lights.
- **`tdmBench`** with the player, 5v5 → 10v10: 60 FPS throughout, CPU 2.3–2.5 ms, AI 0.55–0.69 ms a frame (P99 ≤ 2.3), 10–19 rays a frame, nothing deferred or late. The 7.0 budgets are per frame, not per bot, so cost grows sub-linearly: no new LOS throttle was needed.
- **World:** `world()` 74,052 cells, 0 findings standing and crouched; `stress()` 0 in 256,000 runs; `stairGaps()` 20 stairs, 0 drops; `levelAI()` 176/176 runners, 8/8 gunners (twice), graph connected. Fixed on the way: a crate 0.3 m off a hull wall, narrow gaps by columns, unplated stairs' fill crossed by side jumps (standable fill), nodes linked across stair sides by the terrain slope allowance (`faces`), a pocket by the shrine (the plinth), trunks boxing in drop landings.
- **Leaks:** `leakcheck.mjs 2 crashsite,maglev,oldport`: lap 1 = lap 2, 0 alive.
- **Tests:** 249 (+6: profiles, team size, the climb and face rules).

## 20.0: Maglev Terminal overhaul, AI difficulty

Branch `feature/maglev-overhaul-20.0`, from `main` @ `acc7422` (19.0, merged and pushed by the owner). Full numbers: `docs/BENCH-20.0.json`; the map in `docs/LEVELS.md` (*Maglev Terminal overhaul*).

### What was wrong (measured first)
- **Sightlines:** 14% of eye-height pairs from one spawn side to the other in sight, the longest 116 m; the worst ran through the train (cab doors, aisle, gangways in line).
- **Skins:** the night kit's brightness contrast against the white hall 0.68–0.79.
- **Pacing** (5v5, yard respawns): quiet 20–33% of the time, first engagement 11–12 s.

### What changed
- **Map:** staggered full-height cover on the platforms (billboards, transit-map kiosks, monoliths, a signal cabinet), push cover (barriers, carts), maintenance gantries over the track beds (crossbeam at eye height, staggered low screens), billboards in the side halls, bulkheads in the cars with offset doorways. Spawn side to spawn side: 0.14%, the longest 88 m.
- **Skins:** a per-map operator kit; Maglev wears `corporate` (contrast 0.05–0.16, the team accents kept).
- **AI** (`MAGLEV_AI`): the under-fire reaction (cover or a slide when shot at from 16 m+), riflemen moving while they aim, three flankers. Sniper drill: escaped alive 38–39% → 60–61%, sniper kills a minute −32% (bridge) and −42% (platform).
- **Density:** 7v7, 50 tickets, forward respawns; lanes 1.3/1/1.3, no strict lane.

### Self-play, shipped (7v7, 50 tickets, three matches)
- 2.7–3.1 min, 31–35 kills a minute, first engagement 8.5–11 s, quiet 14.5–16.6%; kills from beyond 25 m 1–7%, median kill range 7–10 m; 87–117 evasions and 19–31 evasion slides a match; flank kills 9–14; 0 stuck, 0 friendly damage.
- Lane time west / train / east 12–17% / 37–46% / 41–46%; kills 12–28 / 21–26 / 46–58 (the east flank, the mezzanine side, takes the most). Lane weights barely moved lane time in A/B (every variant within noise); the flankers did more.

### Validation
- `bench(3)` at 7v7, Balanced, through the menu: 60 FPS in all 12 views (two new: through the platform's chicanes, a billboard up close), CPU 1.7–2.1 ms, GPU 5.5–6.2 ms. `tdmBench` 7v7 with the player: 60 FPS, CPU 2.5 ms, AI 0.71 ms (P99 2.2).
- `world()` 0 / 0; `stress()` 0 in 256,000; `stairGaps()` 18 stairs, 0 drops; `levelAI()` 152/152, 8/8. Fixed on the way: the first west-hall billboard (flush against the escalator: 24 drops beside its treads, the hall cut off from the graph).
- `leakcheck.mjs 2 maglev,crashsite,oldport`: 0 alive. Tests 254 (+5: platform cover, bulkhead stagger, forward points, the profile, the kit).
- **Not explained:** one DEV session hung (the tab unresponsive for minutes) in a long combined check script; the same script passed twice in a fresh tab.

## 21.0: the weapon epic (biome weapon finishes, the asymmetric arsenal)

Branch `feature/weapons-epic-21.0`, from `main` @ `0beea88` (20.0, merged and deployed by the owner). Full numbers: `docs/BENCH-21.0.json`.

### Weapon finishes by biome
- **One model, three finishes** (`src/entities/weapons/theme.ts`). The gun models no longer name colours: they ask for material roles (frame, steel, polymer, furniture, trim, glow, glove, sleeve, cuff), and the map's theme answers.
  - `blaster` (Tokyo, Neon Block, Neon Docks): dark gunmetal and graphite, neon strips.
  - `military` (Desert, Jungle, Crash Site, Old Port): matte black, olive drab, woodland camo furniture and sleeves, nothing glowing, every gun kinetic (tracers, brass, a plain pistol crack instead of the plasma zap).
  - `corporate` (Maglev): grey-white polymer, carbon-weave furniture, dim cyan LEDs.
- **The bots carry the finish too:** their rig gun takes the theme's shared material plus two accent strips where the theme glows. Their energy rounds turn kinetic on military maps, white-cyan on Maglev.
- **No per-build leaks:** each build gets fresh materials and the viewmodel frees them on swap, including a glow material only the ammo strips used. The camo and carbon textures are made once per theme and marked shared (`disposeScene` now skips shared textures).

### The asymmetric arsenal (four guns, keys 1–4)
- **Pistol (Kitsune-9):** 108% move speed and no speed lost while aiming, sights in 0.1 s, the fastest draw, head hits ×1.5 on top of ×2; 30 a round, falling to 45% from 25 to 40 m.
- **SMG (Hornet, new model):** about 1090 rpm of 15-damage rounds, the hip cone ×0.55, the steepest climb per shot; falls to 55% from 12 to 30 m.
- **Rifle (Jackal):** the baseline; hip cone ×2, full damage to 35 m.
- **Shotgun (Boar):** 8 × 22 pellets (one shell kills inside 8 m), 8% a pellet past 15 m, a wider cone, 85% speed, slow sights; every hit shoves and staggers.
- **Per-gun handling** (`GunHandling`, `Player.gun`): move, aiming move, sights in and out, draw speed. **Per-gun feel:** the shotgun the biggest punch, FOV kick and shake with a sub-bass drop; the SMG a quiet, short, high buzz; the pistol a sharp crack.
- **Bots:** rounds fall off by distance flown, the pistol's head bonus, the shotgun's knock. Pistol bots run fastest and keep their full run while aiming. Shotgun bots slide most, slide while engaging, and push from cover to cover on every map.

### Kill share (bot vs bot, 8 matches a map)
| | Rifle | SMG | Shotgun | Pistol |
|---|---|---|---|---|
| Target | 30 | 30 | 25 | 15 |
| Maglev (7v7, 380 kills) | 24.5 | 29.5 | 30.3 | 15.8 |
| Neon Docks (5v5, 373 kills) | 35.9 | 30.3 | 20.9 | 12.9 |
| Pooled (753 kills) | 30.1 | 29.9 | 25.6 | 14.3 |

Each map leans its own way: the close-quarters hall favours the shotgun, the open docks the rifle. The first cut gave the pistol 21–24%: its bots, hard to hit at a full run, out-lived the others. It took less body damage (three head hits still kill), a shorter range, and the shotgun's cover-hop to get there.

### Validation
- `bench(3)`, Balanced: Neon Docks and Maglev 60 FPS in every view, GPU 5.6–6.6 ms.
- `__dev.gunCycle(5)` (every gun in every finish): geometries, textures and programs flat. `leakcheck.mjs 2 desert,docks,maglev`: 0 alive. `stagecheck.mjs 4`: 0 alive.
- Tests 263 (+9: the balance arithmetic, the themes, the four-gun armory).

## 22.0: character rigs, weapon-grip IK, friend or foe on Maglev

Branch `feature/character-rigs-22.0`, from `main` @ `d8833ae` (21.0: already merged and pushed when the brief asked to deploy it). Full numbers: `docs/BENCH-22.0.json`.

### Friend or foe
- **Colour blocks:** on the corporate kit (Maglev), the chest rig, the shoulder pads and the helmet are solid pale team colour: ice blue (ALPHA), sand-orange (OMEGA). The base armour stays white. The night kit gets the same blocks, deep and muted.
- **Ally chevrons:** the ally name tags gain a chevron right over the head, cyan on a dark outline so it reads on white, drawn without a CSS filter. Allies only.
- **The look holds:** `camo()` brightness contrast against the hall 0.01–0.17 (20.0: 0.05–0.16). The teams differ by hue, not brightness.

### The Cyber-Merc rig (`operators.ts`)
- **Hierarchy:** pelvis → torso → head, upper arm → forearm → hand, thigh → shin. The armour is tapered boxes: trapezoid chest plates, angular shoulder pads, an angled helmet and visor.
- **Cheaper to draw:** one body material per bot with vertex colours (armour, cloth, team blocks, webbing, boots), plus glow, visor and gun. At most 20 draw calls a bot, against about 26 for the 14.0 operator.
- **Cheaper to spawn:** each pivot's merged geometry is built once per kit and team and shared, so a respawn merges nothing (3 of 28 rigs merged in a bench).
- **The bots' guns** (`rigGuns.ts`): one low-poly model per armory gun (replacing the stretched rifle box), with a muzzle, two grip points, the pistol grip's rake, a hip hold, an aimed hold (the sight line through the eye) and a blade angle.

### Hands on the gun (`RigIK.ts`, `Gunner.holdGun`)
- **Two-bone IK in closed form** (law of cosines plus a pole vector) puts the trigger hand on the grip and the support hand on the fore-end, and turns the fists to the gun.
- **Solved in torso space,** where the gun lives: no world matrices, and torso pitch carries gun and arms together. The torso takes 80% of the aim's pitch, the gun the rest.
- **Bladed stance:** the torso turns to its right and the gun turns back, so the support hand reaches the fore-end.
- **Recoil** pushes the gun back along the barrel and the hands ride it.
- **Cached:** the solve runs only when the gun moved relative to the torso. A bench: 4.2 solves a frame (of 26 possible), 0.8 µs for a pose plus two solves.

### CPU impact
- `tdmBench` 7v7 with the player, Maglev, A/B against 21.0 in the same tab, twice each: CPU 2.27 / 2.24 ms (21.0) → 2.13 / 2.07 ms (22.0); draw calls 454 / 401 → 335 / 376; 60 FPS. The IK costs about 0.002 ms a frame; the shared, single-material rigs save more than that.
- `bench(3)` Maglev, Balanced: 60 FPS in all 12 views, CPU 2.0–2.8 ms, GPU 5.6–6.4 ms.

### Validation
- **Tests:** 270 (+7): the IK (800 random targets to 0.1 mm, out of reach, hand orientation); every gun's grips reachable at the hip and aimed, pitched and on recoil; the hierarchy; shared geometry and the draw-call budget; the team blocks' hues.
- **Self-play on Maglev:** 31–33 kills a minute, 0 stuck. `leakcheck.mjs 2 desert,docks,maglev`: 0 alive.
- **Not fixed:** `friendlyFire()` fails on Maglev on 21.0 and 22.0 alike (its fixed positions are the desert's); it passes on the desert.
- **No third-person player body:** the player is first person and his viewmodel already has hands, so the new rig is the bots'.

## 23.0: Old Port overhaul, the spawn weapon swap

Branch `feature/old-port-overhaul-23.0`, from `main` @ `a2548ec` (22.0: already merged and pushed when the brief asked to deploy it). Full numbers: `docs/BENCH-23.0.json`; the map in `docs/LEVELS.md` (*Old Port overhaul*).

### The spawn weapon swap
- **The spawn area:** after every spawn (the match's first, every TDM respawn, a forward point included) the player may change his gun with 1–4 while he is within 12 m of where he spawned. The area closes for the rest of the life once he steps out (or drops or climbs 4 m), or fires: the swap is for choosing a gun, not a free reload in a fight. `src/gameplay/SpawnZone.ts`, unit-tested.
- **The UI:** the card picker for the first 3 s of a life (13.0), then a one-line prompt over the weapon readout ("1–4 CHANGE LOADOUT · KITSUNE-9 · IN SPAWN") while the area is open. Replaces 13.0's 3 s grace after the match start.

### Old Port (measured first)
- **17.1:**
  - **Sightlines:** 5% of spawn-side to spawn-side pairs in sight, the longest 129 m (most of them down the west quay).
  - **Pacing at 5v5:** quiet 31–47% of the time, first engagement 13–15 s.
  - **Range:** kills from beyond 25 m 7–27%; the rifle took 30–53% of the kills.
  - **The stacks:** bots on them 0.3–0.5% of their time.
- **The map:**
  - **The spine, a container maze across the yard's middle:** two baffled gates through it, its top a walk joined over the gates by plank bridges, a stair up from each side; the yard lane goes over it.
  - **Long-line blockers:** a bulldozer and a cargo stack across the west quay; shipwright scaffold towers staggered across both dry dock channels (from the floor to over the quay); cargo stacks on the sea quay; cargo in the warehouse hall across its door-to-door line; pallet stacks making a slalom of the alley.
  - **Micro-cover:** 22 Jersey barriers and 30 drums, two InstancedMesh draws for the map, vaultable.
  - **Result:** spawn-side to spawn-side 5% → 0%, long pairs 40 m+ in sight 9.1% → 6.2%.
- **The bots** (`OLDPORT_AI` and the TDM data):
  - **Density:** 7v7, 50 tickets, forward respawns at five level points (one per lane mouth).
  - **Combat:** the under-fire reaction, three flankers on a contact, cover-hop pushes.
  - **Lanes:** weights 1.15/0.8/1.4, the warehouse and dock lanes strict, the yard's high ground at 0.4 nav cost.
  - **Steering:** no straight walk at a goal more than 1 m up (`ARENA.directRise`, per map).

### Self-play, shipped (7v7, 8 matches)
- **Pacing:** 27–30.5 kills a minute, quiet 14–27%, first engagement 10.4–13.6 s; kills from beyond 25 m 4–9%.
- **Lane time:** warehouse 29.5%, yard 41.5%, dock 29.1% (means).
- **Kills by lane:** 22.5 / 53.7 / 23.8%.
- **The high ground:** stack tops 4.4% of bot time (17.1: 0.3–0.5%), the spine's top 1.4%, its gates 1.8%.
- **Kill share:** SMG 34.5%, shotgun 24.6%, rifle 23.3%, pistol 17.6%.
- **Faults:** 0 stuck, 0 friendly damage.

### Validation
- `world()` 0; `stairGaps()` 24 stairs, 0 drops; `levelAI` graph ok, runners 160/160, gunners 8/8; `stress()` 0 in 256,000 (the first run: 16 failures, micro-cover against the dock walls and beside the fire stair, moved).
- `bench(3)` on Old Port at 7v7: 60 FPS in all 10 views, CPU 2.1–2.5 ms, GPU 5.3–6.4 ms. `leakcheck.mjs 2 oldport,maglev,desert`: 0 alive. Tests 281 (+11).
- **Elsewhere:** Maglev unchanged (29–31 kills a minute, 0 stuck). The steering rule cost Crash Site pace in an A/B, so it is off there (and everywhere but Old Port).

## 24.0: UI/UX overhaul

Branch `feature/ui-ux-overhaul-24.0`, from `main` @ `03c4b8c` (23.0, merged and deployed by the owner). Full numbers: `docs/BENCH-24.0.json`.

### Scaling for big screens
- **One fluid root size:** `clamp(15px, min(0.42vw, 0.75vh) + 8.6px, 28px)`, 15 px on a 1440×900 laptop, about 17 at 1080p, 19 at 1440p, 25 at 4K. The smaller of width and height decides, so a short ultrawide doesn't blow it up.
- **rem everywhere:** the stylesheet's sizes are converted to rem (492 values; hairlines, the crosshair and the hit marker stay px), with font sizes floored at 0.75rem. The minimaps' canvases follow their CSS box (`CanvasFit`: a ResizeObserver, nothing measured per frame).
- **Measured** (`uicheck.mjs`): the smallest text is 11.3 px at 1440×900, 12.5 at 1080p, 14.5 at 1440p, 18.5 at 4K. Before, 68 of 123 font sizes were a fixed 8–11 px at any size.

### Map cards
`ui/MapCard.ts`: one component for the maps screen, the TDM result screen and the survival death screen.
- **Thumbnail:** painted in CSS per map: neon rain and a skyline for Tokyo, dunes under a sun for the Desert, brick and a grey sky for Old Port, a white glass roof for Maglev.
- **Text:** the map's name in its own script as a watermark, a large name, the flavor line, the blurb and mode chips.
- **States:** a hover lifts the card and fades in a pre-drawn frame; the selected card holds a magenta frame.

### The TDM HUD
- **Bottom left:** the minimap, with the health and callsign beside it.
- **Top right, the live scoreboard:** the tickets (ALPHA vs OMEGA, with bars), the player's rank in his team (1ST / 7, gold when first), his kills and deaths; the kill feed under it.
- **His kills** in the feed: a gold panel, bold and larger, popping in once; his deaths tinted red.
- **Numbers written only on change:** the tickets were rewritten every frame.

### The result screen
- **Layout:** a large VICTORY / DEFEAT, the tickets and time in team colours, both teams in wide tables (#, name and gun, K, D, SCORE: 100 a kill, −25 a death), his row a gold band.
- **Next map:** a row of map cards.

### Repaints
- **Hovers settle:** a hovered button or map card costs ~0 once its transition ends (0.5 recalcs/s). The 16.0 button hover ran an endless text-shadow animation.
- **The title's logo glitch** (an endless clip-path step animation, 59 style recalcs/s on an open menu, 8.3 ms of main thread a second) is now a one-shot every 7 s: 1.8 ms/s.
- **The TDM HUD in a match:** 0 recalcs, 0 layouts from CSS (`csscheck.mjs`, extended).
- **A test keeps the rule:** every endless animation may animate only transform and opacity.

### Validation
- **UI check:** `uicheck.mjs`, 16 of 16 (4 sizes × 4 screens): no text off screen, no HUD overlap.
- **CSS check:** `csscheck.mjs`, all rows idle.
- **Tests:** 289 (+8: the scaling rules, the animation rule, the card markup, the ranks and the score).
- **Real browser:** checked by eye: the maps screen, a card hovered, the survival death screen.

## 25.0: vertical fog gameplay, audio polish, the map registry

Branch `feature/atmosphere-fog-25.0`, from `main` @ `37544f8` (24.0, merged and live). Full numbers: `docs/BENCH-25.0.json`.

### The map pool
One jungle map in Team Deathmatch: Crash Site, shown as **DEEP JUNGLE**. The firebase (`jungle`) left the TDM pool and is Survival only, shown as **FIREBASE VIPER**, so the two never share a name.

### Music
- **Deep Jungle** (`jungle_theme`), drums and bass only:
  - **Removed:** the 9.0 theme's high triangle lead with glide and vibrato, its rimshots and mid toms (the "siren and beeping").
  - **In:** a heartbeat on a deep tribal drum (52 Hz), hand drums three against four (72–88 Hz), a breathing drone on the root and fifth, a low ostinato, war drums and a surdo roll at the top.
  - **Measured offline** (`musicSpectrum`): energy above 1 kHz 1.69% → 0.04%, above 2.5 kHz 0.23% → 0.01%, the same loudness (−16.8 dB RMS).
- **Desert** (`desert_theme`): maqam Hijaz on E (Phrygian dominant) over a tanpura-like drone.
  - **Percussion:** a darbuka in the maqsum rhythm.
  - **Melody:** an oud line, a ney (breathy flute) as the fight grows, and at the top a bowed string ensemble in the double harmonic (Hijaz Kar), doubled at the octave.
  - **Phrasing:** phrases walk the scale by step, end on the tonic or fifth, and slide into notes.
  - **New instruments:** `tribal`, `drone`, `flute`, `bowed`, `darbuka`.

### Neon Block: the ground fog
- **No rain:** the particles, the puddles' raindrop ripples and the rain bed are gone; the street stays wet.
- **The fog:** lies in the streets and is gone by 4.5 m (the landings, the footbridge, Block E's roofs; Block W's roofs at 7.2). The distance haze is thinner (0.018 → 0.012).
- **How it's drawn** (`world/HeightFog.ts`): three's fog chunks are patched at startup to integrate a height-dependent density along each view ray in closed form, so there's no raymarching and no extra geometry. The parameters are uniforms shared by reference by every built-in material, and are off (density 0) on every other map.
  - **In the street:** a figure is under 20% hidden at 4 m and over 80% at 13 m.
  - **From the roofs:** a street target at 15 m is under 25% veiled, and roof to roof is clear.
- **Bots see as the player does:** with both feet under 3 m, no bot sees past 13 m (`TdmData.groundFog`, in the Sensing pass; the player's spotting too).
- **Route bias** (`TdmData.navBias`, `Nav.route({ bias })`): SMG and shotgun bots find fog links cheaper, riflemen the clear ones.

### Self-play on Neon Block (5v5)
- **Kill distances:** street kills a median of about 8.3 m (90th percentile about 11 m), rooftop kills about 14.5 m (90th percentile about 31 m). Without the fog: street 11.4 m (90th percentile 22.9 m).
- **Who goes high:** rifle bots spend 48% of their time over the fog (27% without), SMG 25% (35%), shotgun 20% (29%).
- **The cost is pace:** 14–17.6 kills a minute against 15.6–18.5, as street fights now start closer.

### Validation
- `bench(3)` Neon Block: 60 FPS, CPU 2.0–2.8 ms, GPU 5.4–6.4 ms (6.1–6.7 with the rain in 17.0). Maglev with the patched chunks and the fog off: GPU unchanged.
- `leakcheck.mjs 2 neonblock,crashsite,desert`: 0 alive.
- Tests 300 (+11: the fog's numbers, the patched chunks and shared uniforms, the sight cap, the route bias, the registry, the two themes' notes and instruments).

## 26.0: the tactical HUD, procedural reload audio

Branch `feature/hud-audio-26.0`, from `main` @ `fef85fb` (25.0, merged and live). Full numbers: `docs/BENCH-26.0.json`.

### The TDM HUD in three corners
- **Top centre, the match score:** ALPHA 24 — 18 OMEGA, each team's kills (what it took off the other's tickets), with each team's tickets left as a thin bar under its name. A team down to 5 tickets: its bar pulses red.
- **Top right, the kill feed** on its own; his kills stay gold (24.0), his deaths red.
- **Top left, a live board of his team** (it replaces the 24.0 "2ND / 7" rank line): name, K, D, score (100 a kill, −25 a death), ordered by score, then kills, fewer deaths, the name. His row is a gold band and flashes on his kill.
- **How it stays cheap:** the rows are built once per roster; a kill writes only the numbers that changed, straight into their Text nodes (no innerHTML); a row changes place by `translateY(n × 100%)`, its transition on transform only; the board is a containment root (`contain: layout paint`). The flash is a Web Animations opacity run (no class toggle and forced reflow).
- **Measured:** a kill costs 0.06 ms of JS, 0.24 ms of style and 0.15 ms of layout (`scripts/boardcost.mjs`, 200 kills). With the HUD at rest: 0 recalcs and 0 layouts a second (`csscheck`). `uicheck`: 16/16 at 1440×900 to 4K, no overlap among the board, score, feed, minimap, health, callsign and ammo.
- Removed: the dead 6.0 result-board rules (`.tdm-board .col`), whose class name the new board took; a 24.0 `.tdm-feed { position: static }` that sat after the new rule (the test that reads the last rule for a selector caught it).

### Reload audio, per gun
- `src/audio/ReloadSynth.ts`: each gun's reload stages as data (layers of three voices: a gliding oscillator, filtered noise with a sweeping cutoff, inharmonic metal partials), played by `AudioEngine.reload(stage, kind)`. Everything is scheduled on the audio clock in the call; nothing runs after it.
  - **Kitsune-9 (pistol):** a button click, a click-clack of the mag (catch, then latch 45 ms later), the slide back and slammed. 47–80 ms a stage, centroid 4–13 kHz, nothing under 250 Hz.
  - **Hornet (SMG):** a ratchet zip on the way out (7 clicks closing up and rising 1.8 → 4.2 kHz), a mag slap (a low palm thump and a broad crack, 81% under 250 Hz), the charging handle's ratchet and snap.
  - **Jackal (AR):** mag out (release click, slide, the drop in the hand), mag in (scrape up the well, seated: a 120 → 58 Hz thud), bolt release (spring rasp, then the carrier slams home at 95 → 44 Hz and rings). 85–90% under 250 Hz.
  - **Boar (shotgun):** each shell thumbed into the tube (a low push, a dull click, the follower's tick); reloaded from empty, the pump racks when the tube is full (the fore-end moves too). The pump between shots is the same heavier cha-chunk: 275 ms, 86% under 250 Hz.
  - Each play is pitched ±3%, so five shells in a row never click the same.
- **A bug in every delayed noise burst, fixed:** `burst()` started its noise now and its gain envelope at `t`, and a gain sits at its default (1) until its first event, so a burst scheduled ahead played full-level noise until it began. The old reload's rack really peaked at 1.82 (written: 0.28), its mag-out 0.73 (written: 0.08). The noise now starts at `t` (13 delayed bursts: reloads, gunshot tails, impacts).
- **Cost:** 0.07–0.13 ms of main thread a call, 12–26 nodes a stage.

### Validation
- `bench(3)` Maglev, Balanced: 60 FPS in all 12 views, CPU 1.7–2.0 ms, GPU 5.9–6.4 ms.
- Tests 311 (+11: the board's order and the corners' CSS, Text-node writes, the recipes' pitch order, length, ratchet and node cap, the burst start).
- New DEV scripts: `scripts/boardcost.mjs`, `scripts/reloadcheck.mjs`.

## 27.0: dynamic spawns and map-wide flow

Branch `feature/dynamic-spawns-27.0`, from `main` @ `4916435` (26.0, merged and live). Full numbers: `docs/BENCH-27.0.json`.

### Spawn pads instead of base yards
- Maglev Terminal, Old Port, Neon Block and Deep Jungle have **14 spawn pads** each: ALPHA's half (one in the old yard, six in the lanes) mirrored for OMEGA. Placed with `__dev.spawnPads` (nav nodes in a lane with room; farthest-point, then Lloyd relaxation, sheltered spots first), checked with `spawnPadReport` (all reachable, none blocked) and `spawnPadPlan`; Old Port's fifth pad moved by hand from the container yard to the warehouse floor. Desert and Neon Docks keep their yards.
- **The marker:** a flat hex ring with six chevrons pointing in and a centre hex, 96 triangles; every pad of a map is one instance of one InstancedMesh (one draw call). A quiet neutral; a spawn flashes it in the team's colour for 1.4 s. Hexes on the minimap's plan.

### The spawn scorer (`SpawnManager`)
- **At the respawn only,** over every pad: enemy pressure (−140 · Σ(1 − d/45)², invalid under 18 m), hostiles facing it (−35 each within 30 m), the nearest ally (+30 at 12 m), allies within 25 m (+5 each, three at most), recent use (−25 fading over 6 s), rotation (+15 for a pad unused 45 s), recent deaths within 12 m (−15 fading over 10 s), lane balance (+40 × how short the team is of the lane's weighted share), a little jitter.
- **Sight:** rays down the ranked list (one per hostile within 70 m) until a pad nobody sees; 64 rays at most; else the seen pad furthest from its nearest hostile. Measured: 4-7 rays a pick on average, 30 at most; 0.02-0.05 ms a pick, 0.3 ms at most.
- **The opening:** squads of two on 3-4 pads of each side; OMEGA's pads never within 30 m of ALPHA's or in sight of them. The player starts on ALPHA's first, with a teammate.
- `TDM.spawns = 'bases'` (DEV) plays the yards again (the A/B).

### Patrol (no bases, no front)
- A new arena state, PATROL, where ADVANCE was on these maps: the team's radar within 40 m first; else an area the director gives (the pads and the lanes' waypoints), a look round on arrival, then the next. The pick: 0.6 × min(1.5, activity) + 1.4 × min(1, unseen / 40 s) + 0.8 in its own lane − distance / 110 m − 0.7 × bots already on it. Activity: deaths, heard rounds and heard spawns (a pad coming alive within 45 m of a member) near the area, halving every 20 s.
- The radar bound applies to target choice too: an unseen contact over 40 m off (not shooting at the bot) is left to those nearer. Without it the patrol never ran (every bot always had some contact) and the whole team converged on one fight.
- Lane discipline stays (the lanes are routes, not bases): without it Old Port's container yard took 70% of the kills.

### Measured (self-play, 50 tickets, bot-only; pads vs the yards)
| | Maglev | Old Port | Neon Block | Deep Jungle |
|---|---|---|---|---|
| deaths within 3 s of a respawn | 0 of 374 (yards 0 of 369) | 0 of 361 (0 of 374) | 0 of 187 (0 of 189) | 0 of 189 (0 of 184) |
| within 5 s | 2 (2) | 2 (3) | 0 (0) | 2 (4) |
| shot within 3 s (protected) | 3.8% (1.6%) | 1.4% (2.5%) | 0.6% (0%) | 1.6% (7.1%) |
| time to death, median | 19.8 s (17.0) | 18.9 s (19.5) | 23.5 s (27.2) | 19.6 s (17.1) |
| kill Gini over 8 m cells | 0.70 (0.87) | 0.81 (0.85) | 0.81 (0.85) | 0.83 (0.89) |
| kills in the busiest 10% of cells | 45% (77%) | 60% (72%) | 62% (71%) | 65% (79%) |
| cells with a kill | 43% (24%) | 26% (24%) | 30% (27%) | 25% (19%) |
| time entropy | 0.93 (0.84) | 0.89 (0.88) | 0.90 (0.91) | 0.86 (0.85) |
| lanes, time % | 32/19/49 (20/37/43) | 31/34/35 (24/45/32) | 31/38/31 (28/51/21) | 28/41/31 (12/66/22) |
| kills a minute | 29.2 (32.4) | 28.3 (29.2) | 17.6 (16.4) | 25.9 (29.8) |
| quiet seconds | 10.5% (14.2%) | 11.0% (10.9%) | 20.6% (30.4%) | 17.7% (14.0%) |

- **Flatter:** on every map the kills spread (Gini down 0.04-0.17, the busiest tenth down 9-32 points) and the lanes even out (the centre lane 51% → 38% on Neon Block, 66% → 41% on Deep Jungle).
- **Not better:** Deep Jungle is slower (kills a minute −13%, quiet 14% → 18%); Maglev −10%. Maglev's train (the 18.0 shotgun lane) went from 37% to 19% of the time. Neon Block's coverage dropped 92% → 87%. Maglev's shot-within-3 s rose 1.6% → 3.8% (no deaths: spawn protection).

### Performance
- `bench(3)`: Old Port 60 FPS in all 10 views, CPU 2.1-2.7 ms, GPU 4.9-6.4 ms; Maglev 60 FPS in all 12, CPU 2.2-2.7 ms, GPU 5.6-6.3 ms, and the same bench with the yards in the same session CPU 2.1-2.8 ms. The CPU sits at or a little over the 2.5 ms budget in **both** modes this session (26.0 read 1.7-2.0 on Maglev): the machine's state, not 27.0.
- `tdmBench` Old Port with the player: AI 0.66-0.76 ms (yards 0.66-0.69), P99 2.0-2.2 ms (one run 5.2, not repeated in two more).

### Tests and tools
- Tests 336 (+25: the scorer, the opening, lanes and mirroring; the director's patrol).
- `tdmSim` gains `spawns` (A/B), `spawnSafety`, `flow` and `patrol`; `__dev.spawnPads`, `spawnPadReport`, `spawnPadPlan`.

## 28.0: Desert and Neon Docks, flanks rebuilt, dynamic spawns

Branch `feature/docks-desert-spawns-28.0`, from `main` @ `b2f1b14` (27.0, merged and live). Full numbers: `docs/BENCH-28.0.json`.

### Desert: the outer flanks (|x| 64 … 89, by the cliffs; authored once, rotated)
- **The trench (west, south half):** 46 m long, 3.6 m wide, 1.3 m deep, cut into the heightfield (vertical sides like the culvert's) and lined with sandbag revetments a little over the sand; ramped out at both ends and through a side notch; three traverses on alternate sides (1.8 m gaps) so nobody shoots down its length.
- **The Anvil (west) and the Spine (east):** rock outcrops 3.8 and 3.4 m over the sand, a ramp up one end, boulders on the faces and on top. From their tops (eye 8.5–9.1 m) 41–50 of 50 points on the compound's roofs are in sight at 57–123 m (the hamlet ruin: 0).
- **The convoy (east):** a wrecked truck with its load, an APC on its side, a burnt-out bus you go through (side door, tail, windows).
- Two new director lanes per team (the outer flanks) and three report lanes (`laneOf`); the terrain test exempts the trench's sides and tests its floor (< 0.55).

### Neon Docks: wider at both edges
- **The old depot (x −68 … −54, the west wall moved out 14 m):** broken container lines, cross pieces closing corridors into dead ends, a two-high sniper stack up a steel stair.
- **The barges (x 49 … 56):** two per half, gangways through the fence, pontoons joining them into one route on the water from end to end, cargo for cover; the harbour is holes in the ground now (fall in and drown: below the quay, past its edge).
- Two new director lanes (the depot, the barges).

### Dynamic spawns on both maps
- 14 pads each (the Desert's rotated, the Docks' mirrored); the scorer's weights per map (`TdmData.spawnTuning`: the dunes 60 m pressure, 24 m minimum, sight to 80 m; the docks 50 / 20 / 80).
- Patrols get the new areas too (`TdmData.hvas`: the depot's alleys and perch, each barge, the outcrops' tops, the bus).

### Measured (7v7, 50 tickets, self-play; the 27.0 game in brackets)
| | Desert | Neon Docks |
|---|---|---|
| combat time on the edges (outer flanks) | 38.9% (0.85%) | 28.2% (3.5%) |
| kills on the edges | 38.4% (0.55%) | 26.9% (3.9%) |
| time in the new zones only / kills there | 16.6% / 4.8% | 15.7% / 9.5% |
| combat in the new geometry (x bands) | 11.8% | ≥ 4.4% (bands coarser than the depot) |
| kill Gini | 0.887 (0.930) | 0.828 (0.827) |
| kills in the busiest 10% of cells | 78% (98%) | 63% (64%) |
| cells visited | 62% (38%) | 84% (81%) |
| kills a minute / quiet seconds | 26.3 (25.2) / 13.4% (17.8%) | 27.1 (23.6) / 15.1% (23.1%) |
| deaths within 3 s / 5 s of a respawn | 0 / 5 of 368 (yards 0 / 0) | 0 / 1 of 370 (0 / 0) |
| shot within 3 s (spawn protection absorbs it) | 1.9% (0%) | 3.8% (0%) |

- **Met:** the edges (the outer flanks as a whole) take 39% and 28% of the combat, from almost none.
- **Not met:** only the newly built geometry is 12–17% of the time on the Desert and 16% on the Docks, and much less of the kills (5%, 10%): bots cross it more than they fight in it. The Docks' kill Gini didn't move.
- **Weather (the Desert):** at the storm's peak (sight 24.5 m) the pads stay safe (0 deaths within 3 s, shot within 3 s 1.5%) and the edges still take 31% of the combat; the yards in a storm 2.4%. The outcrops' sightlines to the roofs exist only in calm air, and the cycle is calm 8–14 s of every ~100–140 s.

### Performance
- `bench(3)` with new views (the depot, the sniper stack, the barges; the trench, the Anvil's top, the convoy): 60 FPS in every view of both maps, CPU 1.6–2.7 ms, GPU 4.8–6.4 ms.
- `leakcheck.mjs 2 docks,desert,oldport`: 0 alive. Tests 343 (+6).

## 29.0: Last Stand, sudden death, spectating

Branch `feature/last-stand-29.0`, from `main` @ `b7c00bd` (28.0, merged and live). Full numbers: `docs/BENCH-29.0.json`.

### The rules (`LastStand.ts`, pure, 12 unit tests)
- **Tickets are respawns:** 50 a team on every map. A death with tickets left spends one at once (the respawn comes 3–5 s later); at 0 a death is final: OUT in the feed.
- **Elimination wins:** a team is out when nobody of it stands (alive, or dead with a respawn granted). Decided once a frame after its deaths, with a 0.4 s trade window: if the other team is wiped out within it (a round already in flight), it is a **draw**.
- **Sudden death:** a team at 0 tickets standing fewer than the other gets 60 s; each kill it scores resets it to 60; at 0 it loses. Both at 0 tickets and level: one clock for both, a draw at 0. A tie broken by a kill: the team left behind keeps its time.
- **HUD:** the score shows tickets left; under each team, who stands (LAST STAND · n at 0 tickets, the number red); the clock under the score, pulsing (opacity and scale only), red for his team's, amber for the enemy's, white for a draw coming. The result screen can say DRAW, and how it ended (ELIMINATION, SUDDEN DEATH, THE LAST TWO TRADED).

### Spectating
- Out of the match (his team had no tickets when he died): no countdown, no loadout cards; the camera goes to the nearest teammate standing, at its eye (0.13 m from its head's centre; its body hidden while watched, so nothing clips), its facing and its aim's pitch damped so the bot's snap turns read like a player's. Left / right click: next / previous teammate. The watched one dies: 1.2 s on it, then the nearest. His own panels and the viewmodel are hidden; a panel shows the teammate's name, health and how many stand.
- Real GPU: frame times while spectating as when alive (median 7.9 / 8.0 ms, p99 11.5 / 11.2 ms).

### The last stand (AI)
- A team at 0 tickets **holds**: a cover spot within 9 m of its living members' centre (claimed: one bot a spot), crouched, watching the freshest threat; no sprinting; the radar 25 m (no lone hunts); no solo flanks; a push only on a target under 25% health.
- **On the sudden-death clock it holds until 30 s are left, then presses** as a group (no radar limit, at a run, still no solo flanks); a kill resets the clock and it holds again. The first version pressed as soon as the clock started: the last stand barely showed (a team at 0 tickets is behind at its first death).

### Measured (bot-only; Maglev and Old Port, 4 matches each; the instincts off in brackets)
| | last stand on | (off) | (v1: press at once) |
|---|---|---|---|
| endgame (first team out of tickets → end) | 69.9 s, 28–119 | 36.6 s | 38.0 s |
| ended by sudden death | 2 of 8 | 0 of 8 | 0 of 8 |
| comebacks (the team out of tickets first won) | 1 | 0 | 0 |
| last-stand bots: nearest teammate | 8.2 m | 18.5 m | 15.3 m |
| crouched / moving / holding | 38.4% / 60.5% / 61.0% | 7.2% / 92.7% / 0% | 12.3% / 88.2% / 22.6% |
| longest sudden-death clock run | 38.6 s | 13.3 s | 14.7 s |

(Before their last stand the same bots: nearest teammate 14.8 m, crouched 7.4%, moving 93.2%.) Neon Block (5v5, 4 matches) the same way: endgame 24–89 s, 1 ended by sudden death, 1 comeback. Over all 12: 2 comebacks; the winner ends with 5.1 standing on average, the loser 0.3.

- **How it feels in self-play:** the ticket race decides most matches (the team out first lost 10 of 12); the endgame is where the tension is: the team behind hides together, the clock runs down to 30, it comes out as a pack, trades or doesn't, and a kill sends it back behind cover with a minute again (4–5 resets a match). Three of 12 ended on the clock, one of those a 1 v 5 hold that ran out; the longest endgame was two minutes.
- **Edge cases (live):** the last two killed in one frame: a draw; 0.2 s apart: a draw (the trade window); 1.5 s apart: the survivor's team wins.
- `bench(3)` Maglev: 60 FPS in all 12 views, CPU 2.2–2.9 ms, GPU 5.6–6.3 ms. `uicheck` 16/16. Tests 357 (+14).

## 30.0: stamina and weight-based mobility

Branch `feature/stamina-mechanic-30.0`, from `main` @ `1125398` (29.0, merged and live). Full numbers: `docs/BENCH-30.0.json`.

### The mechanic (`Stamina.ts`, 6 unit tests)
- A pool of 0–100 for the player and every bot. Sprinting drains it (100 / `sprintFor` a second); after 0.6 s without sprinting it refills (100 / `recoverIn` a second walking, ×1.5 standing or crouched). At 0 the sprint is gone until the pool is back to 20: forced to walk.
- **A slide only out of an active sprint,** and it costs 12.
- **The gun's weight sets both** (by its sound family for the player, its armory id for a bot):

| class | a full sprint lasts | empty → full (walking) |
|---|---|---|
| pistol | 9 s | 4.5 s |
| SMG | 5.5 s | 7 s |
| rifle | 3.5 s | 10 s |
| shotgun | 3.5 s | 10 s |

### The HUD bar
- A thin bar under the crosshair: a dark track, a cyan fill scaled on X (`transform: scaleX`), faded out (opacity) while the pool is full, red once it ran dry. Written only when the value moves by 0.5% (200 steps) or a state flips; nothing else changes per frame.
- **Measured:** frame CPU on the GPU with the bar changing every frame as with it idle (2.21 / 2.19 ms, 60 FPS); style recalcs and layouts with it draining as with it idle; `csscheck`: the match HUD at rest 0 recalcs, 0 layouts.

### The bots
- They walk (their run pace) unless they have a reason to sprint: retreating or diving for cover under fire; flanking; pushing with a close gun (SMG, shotgun, pistol: a rifle walks up to range); crossing ground a hostile can see (one in view, or one the team saw within 1.5 s and 40 m).
- **Energy management:** the optional sprints (crossing, flanking) start at 50 or more and stop at 30 (the fight they lead to starts with that much); a push stops at 10; only a retreat may run the pool dry. A slide needs the sprint and pays for it.
- The first version (start at 35, run to 0) left bots dry a quarter of their time and 42% of fights started under 20.

### Measured (bot-only, 4 matches a cell; stamina off = 29.0's endless sprint)
| | Maglev off | Maglev on | Neon Block off | Neon Block on |
|---|---|---|---|---|
| kills a minute | 25.9 | 23.0 (−11%) | 17.0 | 15.0 (−11%) |
| bots' average speed (m/s) | 4.08 | 3.75 | 4.32 | 3.74 |
| first engagement, median (s) | 8.7 | 10.3 | 10.8 | 12.8 |
| quiet seconds | 19.7% | 20.1% | 31.0% | 36.8% |
| sprinting (of the time alive) | – | 31% | – | 28% |
| run dry | – | 6.2% (first version 24.8%) | – | 2.8% (23.1%) |
| fights started under 20 | – | 24% (42%) | – | 16% (42%) |
| the pool when a fight starts, median | – | 39 (26) | – | 42 (25) |

- Sprint time by reason (Maglev / Neon Block): pushing 42% / 31%, crossing 25% / 34%, retreating 20% / 15%, flanking 13% / 20%.
- `bench(3)`: Maglev 60 FPS, CPU 2.0–2.6 ms; Neon Block 60 FPS, CPU 2.0–2.8 ms; GPU 5.8–6.9 ms. Tests 367 (+10).

## 31.0: deployment zones

Branch `feature/spawn-zones-31.0`, from `main` @ `a30ed95` (30.0, merged and live). Full numbers: `docs/BENCH-31.0.json`.

### The zones
- Each team spawns from 2 or 3 zones in its own half, lettered A, B, C from its own left as it faces the enemy. Each map lists ALPHA's (`TdmData.zones`); OMEGA's are the mirror (the five mirrored maps) or the 180° rotation (the desert).

| map | zones | why |
|---|---|---|
| Neon Block | 3 | three lanes (west alley, the street, east), an entry each |
| Deep Jungle | 3 | three lanes; the flank zones 10 m forward of the old yard line |
| Neon Docks | 3 | the depot, the quay, the maze; C kept out of its mirror's sight (96 m) |
| Desert Outpost | 3 | the two cliffs' trenches (28.0's flanks) and the centre |
| Old Port | 2 | the warehouse spine splits the map in two halves |
| Maglev Terminal | 2 | the train runs down the centre; a centre zone would face it |

- **Points:** at load, rings at 0 / 0.35 / 0.65 / 0.95 of the radius × 8 angles; kept if the floor is within 0.6 m of the centre's, there's room, and the centre sees it (up to 12).

### Choosing a zone (`ZoneSpawner`, 6 unit tests)
- A zone is safe when no hostile is within its radius + the map's hard minimum (18–24 m) and no hostile in sight range sees its centre (eye to chest; rays only after the distance test).
- Each respawn goes to the least used of the safe zones (then the least recently used): round-robin that skips the unsafe ones. None safe: the zone whose nearest hostile is furthest.
- The spot inside it: the 27.0 scorer over the zone's points.
- The opening deals the team in pairs over its zones.
- `TDM.spawns = 'zones'` is the default; `'dynamic'` (27.0's map-wide pads) and `'bases'` stay as DEV A/Bs.

### The visual (`SpawnZoneVisual`, no files)
- A low platform, a rim, a glowing ring and hex inlay in the team's colour, a thin projector beam, the letter as a hologram sprite (a 128 px canvas drawn with strokes: no font) bobbing over it. The ring's opacity pulses; a spawn flashes its zone's ring.
- Themes: Neon Block glossy black with a glow skirt in the fog; Deep Jungle mossy, greenish, vines over the edge; Desert sandstone with dust swirling round the base; Old Port and Neon Docks steel with hazard stripes; Maglev glass and white light.
- Draw calls don't grow with zones: each part is one `InstancedMesh` per team, the vines one merged mesh, the dust one `Points` moved by a time uniform in its shader; only the letters are a sprite each. Everything is disposed with the level.
- The minimap shows each zone as a team-coloured hex with its letter.
- The player's respawn says `DEPLOYED · ZONE B`.

### Measured (bot-only, 3 matches a cell; 27.0/28.0's map-wide pads in brackets)
| | Neon Block | Deep Jungle | Old Port | Maglev | Neon Docks | Desert |
|---|---|---|---|---|---|---|
| deaths within 3 s of spawning | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| deaths within 5 s | 0.35% (0.36%) | 0% (0.34%) | 0% (0.34%) | 0% (0.33%) | 0.33% (0.68%) | 0.36% (1.73%) |
| shot within 3 s | 0% (1.7%) | 2.3% (0.3%) | 0.3% (2.0%) | 0.3% (2.7%) | 1.7% (1.7%) | 0% (2.8%) |
| picks with no safe zone | 0 | 5 | 13 | 20 | 0 | 4 |
| kills a minute | 15.2 (14.2) | 15.6 (24.0) | 22.3 (23.6) | 20.9 (23.7) | 11.8 (13.9) | 13.2 (15.6) |
| quiet seconds | 31.7% (36.8%) | 44.2% (16.7%) | 23.7% (25.0%) | 21.4% (19.6%) | 49.0% (41.2%) | 39.4% (35.1%) |
| kills in the middle third | 60% (65%) | 53% (55%) | 89% (80%) | 71% (62%) | 64% (67%) | 70% (83%) |

- **Safer:** 3 deaths within 5 s of 1,779 respawns against 11 of 1,766.
- **Slower:** kills a minute down on 5 of 6 maps (Deep Jungle −35%). The pads included neutral spawns near the centre; a zone at home adds a walk to every life. Moving Deep Jungle's flank zones 10 m forward changed nothing (15.8 → 15.6).
- **Zone use:** within ±10% on Neon Block, Old Port, Maglev and the docks; Deep Jungle's OMEGA (36 / 73 / 62) and the desert's ALPHA (42 / 71 / 47) lean on B when a flank zone is often unsafe.
- **Cost of a pick:** zone safety 2.8–6.0 rays on average, 0.4 ms a pick at most; nothing per frame.
- **Frame cost:** the zones are 11–15 draw objects a map (7–9 instanced parts, a sprite a letter, the vines or the dust). `bench(3)`: Maglev 60 FPS, CPU 1.8–2.4 ms, GPU 5.6–6.4 ms (30.0: 2.0–2.6, 5.9–6.4); Desert 60 FPS, CPU 1.6–2.1, GPU 5.5–6.0 (the dust included); Deep Jungle 60 FPS, CPU 1.6–2.1, GPU 5.7–6.3 (the vines included).
- **Leaks:** `leakcheck` over all six maps: 0 alive after GC. `vramCycle` (3 laps, twice): geometries, textures and programs the same lap over lap at every level stop; 0 growth. Tests 373 (+6).

## 32.0: Neon Docks overhaul

Branch `feature/neon-docks-32.0`, from `main` @ `e31cdf4` (31.0, merged). Full numbers: `docs/BENCH-32.0.json`.

### The look
- **Palette:** the neon accents soft violet and deep blue (were full magenta and cyan), the signs muted and dimmer (neon 3.2 → 1.8), the sodium lamps' light keeping its strength but losing most of its orange, the lamp heads dimmer, the stacks' callout colours a little greyer, the bridge paint brass. The sky light a greyer, deeper blue. The grade: saturation 1.15 → 0.9, the warm split nearly neutral, deeper blue shadows; bloom 0.7 over 1.0 → 0.5 over 1.15; exposure 1.12 → 1.24 (the rain's own glow is mostly gone).
- **Rain** (`Rain.ts` takes a level's `RainLook`; Tokyo's unchanged): 6,000 streaks (was 14,000), 60% as wide, at half the opacity, lit half as hard by the lamps, none within 2 m of the eye; the rings and crowns at 60%. `Rain.dispose()` (new) frees it with the level.
- **Measured** (eight fixed views, headless, before → after): colourfulness (Hasler–Süsstrunk) 39.3 → 26.3, mean chroma 30.6 → 24.7, vivid pixels (saturation > 0.7 and value > 0.7) 0–1.3% → 0–0.15%; the screen the rain covers 2.5–17% → 0.1–2.9%; brightness within ±15% of before in seven views (the forecourt +23%: zone B's glow is in it now).

### The warehouse roof
- A steel deck (`BoxGeometry` through the level's builder, seen and solid) on the trusses at 7 m, top 7.3, and the walls on up to a 9 m parapet round it: from the quay gantry's armoured rail (7.6 m) a jump reaches 8.6, so nobody stands on the roof (a test holds it).
- **No rain inside:** the roof is a rain shelter (no drops, rings or crowns under 7.3 m over it) and a surface (the rain lands and splashes on it); the warehouse floor left the open ground. Indoors again for the audio (the rain muffled) and the viewmodel's light, as before 15.0.
- 15.0 opened it so the gantries saw in; with the roof the warehouse takes 36% of bot time (31.0: 25%), the containers 39% (47%), the waterfront 25% (28%).

### 9v9
- The docks were the emptiest map: 27 walkable 8 m cells a player at 5v5 (the 7v7 maps 8–14), 39–44% quiet seconds, 8.4-minute matches.
- Self-play over 5–10 a side on the new layout (2 matches each): quiet seconds 44% (5v5), 28% (7v7), 27% (8v8), 10% (9v9), 12% (10v10); kills a minute 13 → 21 → 23 → 33 → 32. 9 is the knee: 15 cells a player (Neon Block's density), 3.4–4-minute matches on the same 50 tickets.
- The team board holds the nine rows (it reaches about 29% of the screen's height).

### Deployment zones
- The centre zone moved forward out of the yard onto the forecourt (4, 40; 14 m short of the warehouse's main door, off its axis so it can't see its mirror through both end doors); the flanks (the depot, the quay) kept. 12 points; no enemy zone sees it.
- 0 deaths within 3 s of spawning over 800 respawns; within 5 s 4 (0.5%); shot within 3 s 3.6% (spawn protection absorbs it); a respawn with no safe zone 9% (the furthest-from-enemies zone).

### Spread (anti-clustering, `ARENA.space`, 6 unit tests; on through the docks' AI profile only: measured there)
- **Fights:** a bot with a teammate within 10 m strafes away from it and eases off it.
- **Crowds:** a healthy bot fighting a target it sees with two or more teammates within 10 m, the group's highest uid, goes round: a flank claim and point off the group's line, shooting on the way.
- **Patrols:** an area loses score for teammates near it and teammates' claimed areas near it, and gains for a lane the team is short of (the width term).
- **Hunts:** the 2nd, 3rd … bot after one contact goes to a point 12 m to alternate sides of the line to it (snapped to the nav), straight in only within 16 m.
- **The docks' AI profile:** never straight up at a goal more than 1 m higher (Old Port's 23.0 rule): two self-play bots had stuck in the pocket by the catwalk landing's block; none in the 8 matches since.

### Measured (bot-only, 9v9, 8 matches a cell)
| | 9v9, spread off | 9v9, 32.0 |
|---|---|---|
| bots with 2+ teammates within 10 m | 14.0% | 10.3% (−27%) |
| with one within 6 m | 25.4% | 18.2% (−29%) |
| in a convoy (2+ within 15 m moving the same way) | 7.1% | 5.1% (−28%) |
| nearest teammate, median | 11.1 m | 13.0 m |
| main lanes covered (of what the team's count could) | 86.6% | 88.9% |
| lanes, time: containers / warehouse / waterfront | 44 / 36 / 20 | 39 / 36 / 25 |
| kills a minute | 26.3 | 28.7 |
| quiet seconds | 26.6% | 20.9% |
| AI ms a step (avg / p99) | 0.11 / 0.66 | 0.12 / 0.67 |

- Against 31.0's docks (5v5, 3 matches): kills a minute 12.5 → 28.7, matches 8.4 → 4.0 minutes, quiet seconds 39% → 21%, first engagement 16.9 → 11.1 s.
- At 5v5 the bots were not bunched (2.3% in groups); the groups came with the bigger teams (9v9 without the spread: 14%), and most of them fighting side by side (engage a third, patrol a quarter).
- Pace varies a lot between matches at 9v9 (single matches 20–34 kills a minute); the spread's effect on it is within that.
- **Frame cost at 9v9:** `bench(3)` on the docks: 60 FPS in all 14 views, CPU 2.2–3.0 ms (28.0 at 5v5: 1.9–2.6), GPU 5.4–6.6 ms (5.0–6.4); the AI 0.12 ms a step (5v5: 0.07), p99 0.67.
- **Leaks:** `leakcheck` (docks, Maglev, Neon Block): 0 alive after GC. `vramCycle` (3 laps): every level stop the same lap over lap (the docks 179 geometries, 52 textures); only the menu's known timing reading (106 or 140) differs. Tests 381 (+8).

## 33.0: Deep Jungle overhaul

Branch `feature/deep-jungle-33.0`, from `main` @ `dd27bc5` (32.0, merged). Full numbers: `docs/BENCH-33.0.json`.

### The wall-running bug (engine-wide, commit 1 of 2)
- **Symptom:** bots on the ravine's floor ran into its west rim for whole matches (and inside the landing yards into their front wall). A new `tdmSim` metric (`wallPress`: running over 1.5 m/s, covering under 40% of it, for 1.5 s+) counted 487 events in 4 matches (1,544 s).
- **Cause:** the route search tries 128 entry nodes ranked by distance plus the remaining path. From a ravine floor the best-ranked are on the bank above, over the rim, and all fail the walkable-corridor test; the ravine's own nodes rank too low to be tried. No route, so steering fell back to the goal itself: straight at the wall.
- **Fix:** after the ranked entries, the 16 nodes nearest by plain distance are tried (`Nav.stats.nearestEntries`); with no route at all a bot walks onto the graph (the nearest node it can reach), never at the goal; Deep Jungle's profile never walks straight at a goal more than 0.5 m up.
- **Measured:** 487 → 8 wall-presses (1,544 s → 2 s), kills a minute 17.5 → 20.1, stuck 1 → 0; Maglev 0.

### The map (commit 2 of 2)
- **The outpost** (replaces 19.0's temple, wreck and shrine): a research lab on stilts. The open ground floor under its deck (columns, the hub's stairwell railed in its middle); the deck at 3.6 m, a walkway round the lab, up two stairs (one a half) to landings; the lab (doors and windows, benches and racks inside); its stair to the roof at 7.2 m (parapets, the comms mast and its beacon).
- **The tunnels:** 4 m under the jungle floor. A hub under the outpost, its stair up into the ground floor; per half two L-shaped branches: east to the ravine (out through its west rim: the east depression), west to a sunken stair pit at the ridge's foot (the west depression). 3 m wide, 3.6 m high, lit by strips (every other one a pooled light).
  - **Carved, not boolean:** the heightfield is always a floor, so a tunnel is carved into it (its floor flat to half a metre into the walls, the rise under them: no foot reads it from either side) and roofed with slabs that are the ground above. Walls and roofs come from masks of the spaces on a 0.2 m grid, merged into boxes (`tunnelWalls`, `tunnelRoofs`): no corner missed.
- **Old Port's containers** (`world/Containers.ts`, shared now: Old Port builds its own with it), moss grown over the paint (`overgrownContainerTexture`): seven, by the west runs, on the east bank (8 m off the ravine's rim: nearer, they squeezed the bank's way onto the rim) and across the middle west.
- **Plants and mist** follow the surface (`crashSurface`), never down a tunnel; the forest keeps 1.1 m clear of anything solid (a slim trunk 0.84 m off the ravine's rim made a slot a runner wedged in), and 5 m along the ravine's east bank (a path beside the rim).
- **The ravine's drop-downs** start from the bank outside the rims (over and down), never from a rim's top: a node there made the 1.5 m rim tops a way along the ravine, beside a 4 m drop. The ramps' tops link round the rims' ends.

### The visibility pass
- Every plant under eye height: bushes to 1.1 m (were 2.3), sedge to 0.6 m (1.3), big-leaf plants to 1.0 m (1.6); 40% fewer bushes, half the big-leaf plants; no wall of bushes round the yards; vines end over 2.6 m. The canopy and the trees stay. The AI's concealment layer 1.9 → 1.2 m (a crouch, not a standing man). Firebase Viper's plants unchanged (`FoliageSite.plants`).
- **Measured** (`__dev.foliageSight`: 2,000 sightlines 8–40 m between random standable spots, every plant instance's footprint and top): standing sightlines blocked 38.4% → 4.2%, crouched 45.2% → 24.7%; spots with a plant over eye height within 2.5 m 22.3% → 0.3% (a plant on higher ground beside a lower spot); vines below 2 m 105 → 0; plants 6,648 → 5,070, foliage triangles 205k → 135k.

### Nav and AI
- The graph rebuilt: tunnel nodes on the passages' centre lines (a bend's node in its middle), the stairs' chains (pits, hub, deck, roof), grids over the hub, the ground floor, the deck, the lab and its roof (each node needs a floor at its level). 938 nodes.
- Patrol areas in the tunnels (the hub, the bends, the mouths, the pits) and on the outpost; the tunnels a fourth lane in the reports.
- **Corridor following** (`ARENA.corridor`, on through Deep Jungle's profile): a moving bot feels for walls either side (one ray a side, knee height, every 0.15 s) and steers off one nearer than 1.1 m; between two it keeps to the middle. Scraping a wall (a moving bot within 8 cm of something solid; `tdmSim(...).scrape`), A/B 4 matches each: the tunnels 7.0% → 4.8%, the hub 8.5% → 6.5%, everywhere 5.8% → 4.0%, the same pace.
- **Path following never cuts over a drop** (engine-wide): a waypoint is skipped only if the floor runs on under the straight line too (`Nav.walkable`), not just a clear corridor; runners cut from a bank onto a bridge over its side, into the ravine.
- `directRise` 0.5 on the new map: the same pace as Infinity (22.4 kills a minute), the tunnels used more (1.6× the time). (23.0's A/B, where it cost pace, was on the old temple's terraces.)

### Checks
- `levelAI`: every node reachable from every spawn; gunners 8 of 8; runners 189–191 of 192 over three runs (32.0's map: 176 of 176, three runs). Every failure is one goal on the east bank, (40, 0, 10), from the far spawns: survival runners out of the tunnels into the ravine stall at its end ramps, where the ramp lies up to 0.6 m under a rim's top and the corridor rays pass over it. Fixed in 33.1 (the rims along the end ramps a wall over the knee ray). (Fixed on the way: 2 nodes floating over the roof's stairwell, open stair sides runners clipped into, the rim-top waypoints, the cut-over-a-drop, the slots by the rim.)
- `world`: no traps, escapes, invisible walls or walk-through visuals. `stress`: 16,000 controller runs from 500 cells, 0 failures.

### Measured (bot-only, 7v7, 4 matches a cell)
| | 32.0's map | 33.0 (1/2: the bug fixed) | 33.0 |
|---|---|---|---|
| wall-presses (seconds) | 487 (1,544) | 8 (2) | 17 (12) |
| stuck | 1 | 0 | 0 |
| kills a minute | 17.5 | 20.1 | 24.5 |
| quiet seconds | – | 26.7% | 15.6% |
| lanes: ridge / outpost / ravine / tunnels | – | – | 11 / 58 / 21 / 9% |
| deaths within 3 s of spawning | – | – | 0 of 398 |
| AI ms a step (avg / p99) | – | – | 0.26 / 1.75 |
- **Frame cost:** `bench(3)` on Deep Jungle: 60 FPS in all 14 views (the hub, a tunnel run, a pit, the lab, its roof among them); GPU 6.0–6.6 ms (31.0: 5.7–6.2); CPU 2.4–3.1 ms (31.0: 1.6–2.1), as Maglev's in the same session (2.1–3.1; 31.0: 1.8–2.4): the machine, not the map. The tunnels' strip lights merged into one draw (the first build drew each: up to 75 more calls a view).
- **Leaks:** `leakcheck` (Deep Jungle, Old Port, Maglev): 0 alive after GC. `vramCycle` (3 laps): every stop the same lap over lap (Deep Jungle 151 geometries, 43 textures). Tests 384 (+3: the tunnels, their walls, roofs and headroom, the outpost).

## 33.1: Deep Jungle hotfix, the ravine's end ramps

Branch `feature/deep-jungle-33.1`, from `main` @ `04c55e3` (33.0, merged). Full numbers: `docs/BENCH-33.1.json`.

- **The failure:** `levelAI`, 189–191 of 192 runners (32.0's map: 176/176). Every failure was one goal on the east bank from the far spawns; the runners stalled at the ravine's end ramps (the tunnels lead into the ravine now, so runners use them).
- **The cause:** the ramps rise from the ravine's floor (-4 m) to the ground over its last 11 m, and the rock rims beside them stood a fixed 0.28 m over the bank: near the top the ramp lay 0.3–0.6 m under the rim. The corridor test's lowest ray runs 0.4 m over each end's feet (`Nav.KNEE`), so from the ramp to the bank it passed over the rim near the bank end; the body can't climb more than 0.3 m. A ledge the rays don't see.
- **Why not smooth the lip:** the ramps already climb at 20°, against the 22° walkable limit; a sideways slope out of them can be at most 10°, which would open only their last 0.7 m and leave a step where the rims stop (the slope test caught the first attempt's 0.9 m drop along that line).
- **The fix:** along the ramps (|z| > 40) the rims stand 0.6 m over the bank (`RAVINE.rampRim`): over the knee ray, over a step from the low rims beside them, over the world check's walk-up (at 0.5 m it called the rims' tops a level the bank couldn't reach). A wall from either side, never a ledge. The ramps come out level with the ground at the ravine's ends, where the routes leave round the rims' ends. A test holds the heights; `Nav.KNEE` is exported for it.
- **Measured:** `levelAI` 192/192 in three runs of three, every node reachable, gunners 8/8; `world` clean; `stress` 16,000 runs, 0 failures. Self-play 7v7 (4 matches): no stuck bots, 11 wall-presses (33.0: 17), kills a minute 25.4 (24.5), the tunnels 15% of lane time (9%). `leakcheck` 0 alive.
- **Frame cost:** `bench(3)` on Deep Jungle: 60 FPS in all 14 views, GPU 6.1–6.6 ms, CPU 2.2–3.6 ms (33.0: 6.0–6.6, 2.4–3.1); a run before it saw CPU 4–5 ms from mid-run on, transient (the rims are the same boxes, 0.32 m taller).

## 34.0: Night Tokyo overhaul (Neon Block)

Branch `feature/night-tokyo-34.0`, from `main` @ `a0f7d1c` (33.1, merged). Full numbers: `docs/BENCH-34.0.json`.

### The smog (`world/HeightFog.ts`)
- **The profile:** 25.0's fog was thickest at the ground and gone by 4.5 m. From a roof, a street target 15 m off was only 14% veiled, so the high ground saw straight into the street. Now a smog fills the street canyon:
  - density D·(1 + g·(1 − y/H0)) up to `dense` (6.2 m: the street, the landings and the footbridge at 4.5 m are in it), densest at the ground;
  - a linear fade to nothing at `top` (7.0 m: the roofs and the skybridge at 7.2 m stand clear).
  - Its optical depth along the camera–fragment segment is still integrated in closed form. `GroundFog { density, dense, top, ground, opacity, color }`, `setHeightFog(f)`.
- **What it hides** (the CPU twin, `heightFogAt`):
  - in the street a standing figure is 82% hidden at 10.5 m;
  - from a roof, a street target is 41% hidden at 5 m, 64% at 10 m, 84% at 15 m and 95% at 20 m;
  - roof to roof is clear.
- **Glows bloom in it:** HDR colour is clamped to 1 as the fog thickens (`mix(min(rgb, 1), rgb, T)` before the fog mix), so a neon sign deep in the smog diffuses into a glow instead of punching through it.

### The bots see what the picture shows (`arena/Sensing.ts`, `DeathmatchAI.ts`)
- 25.0's rule was binary: no sight past 13 m with both feet under 3 m.
- **The new rule:** Sensing's pre-filter asks the fog itself, `clarity = 1 − heightFogAt(eye, chest)`, with no ray. Under `ARENA_SEE` (0.18) the pair isn't seen.
- **Clarity scales the reaction and the aim:**
  - it rides on the sighting (`Seen.clarity`, `onSight(h, now, clarity)`);
  - the reaction time grows ×(1 + `ARENA.fogReact` 1.5 × the share lost);
  - the aim's fog spread is the larger of the distance term and `fogSpread` × (1 − clarity).
  - A half-hidden figure is seen late and shot at wide; a clear one as before.
- **Rendered vs model** (`vis34`): a light grey mannequin at each distance; counted are the pixels of its projected box that differ from the frame without fog.

  | Pair | Rendered | Model |
  |---|---|---|
  | Street 4 m | 0.79 | 0.78 |
  | Street 8 m | 0.49 | 0.37 |
  | Street 10.5 m | 0.26 | 0.18 |
  | Street 14 m | 0.06 | 0.05 |
  | Roof → street 12 m | 0.20 | 0.27 |
  | Roof → street 15 m | 0.11 | 0.16 |
  | Roof → street 20 m | 0.07 | 0.05 |
  | Roof → roof 28 m | 0.97 | 1 |

  - The two agree within about 0.15. The bots lose a street figure at about 10.4 m, the picture at about 11.9 m.
  - A mid-level target (4.5 m) seen from a roof stays mostly visible (about 15% hidden at 15 m): the smog thins towards its top.

### The flanks (`NeonBlock.ts`, flanks section; `FLANKS` in the layout)
- **Lantern Bridge** (west): a 2 m catwalk at the landings' height (4.5 m) over the crossing's west mouth, along Block W's corner. A stair climbs to it at each end, and its west rail has a drop gap.
- **Lantern Market** (beside the bridge stair's foot): the alley narrowed to 4.8 m. A stall counter, a vaultable cart, and a two-high stack of AC units that splits it into two 1.6–1.7 m ways. Warm lamps, with a CanvasTexture hologram over it (additive, flickering).
- **Transit Rail** (east): an elevated deck at 4.5 m along the boundary wall over the crossing, with a stair at each end and an inner rail with drop gaps. A transit car stands on it at the crossing (1.4 m to pass it; window strip, track decals). In each half a bridge comes from E1's roof through a gap in its parapet. The service lamp that crossed the deck hangs under it now.
- **The Junction** (by E2's stair): an AC stack, a vending machine and a hologram.
- Everything is primitives and canvas textures, built into the static batches or instanced; the holograms dispose with the level.
- **Nav:** chains up the stairs, drops through the rail gaps, the decks' nodes. 8 new `testGoals`. Patrol areas on the new places (`hvas`); on the rail deck they sit on its centre line, clear of the car.

### Fixed on the way
- **Stress:** 3 of 16,000 sprint-jumps ended inside geometry in the 0.4–0.6 m slot between the bus shelter's end and Block E's wall. The shelter's wall, roof and bench now run to the wall; the bench is a step, not a vault.
- **levelAI:** the goal (−30, 0, −50), behind the forecourt car, had failed since 14.0: there were no nodes in the strip behind the cars, so runners stalled at the alley's end. Now there is a row at |z| 52.5. 224/224.
- **Patrol goals on a raised area** (engine-wide) are offset 0.3 m, not 0.8 m, as lane waypoints already were. On the rail's 3 m deck, 0.8 m put some bots' goals in the air beside it, and they stood under it; the first build had 6 stuck reports in 4 matches.
- **Neon Block's AI profile:** `directRise` 1 (the stairs, never straight up at a goal). Pace is the same as Infinity (12.3 vs 12.1 kills a minute).

### Checks
- `levelAI` 224/224 runners, every node reachable, gunners 8/8.
- `world` clean; `stress` 16,000 runs, 0 failures.
- Tests 388: the fog model's street and roof shares, the shared uniforms, the reaction scaling.

### Measured (bot-only, 5v5, 4 matches a cell)
| | 33.1's map | 34.0 |
|---|---|---|
| kills a minute | 13.8 | 12.3 |
| quiet seconds | 37% | 46% |
| stuck / wall-presses | 0 / 2 | 0 / 1 |
| lanes west / centre / east | 32 / 38 / 30% | 34 / 34 / 32% |
| moving time in the flank zones | 21.8% | 23.4% |
| kills in the flank zones | 53 of 415 | 29 of 402 |
| kills on the roofs (West + East) | 111 | 160 |
| street kills: median / p90 | 7.9 / 11.3 m | 7.3 / 10.8 m |
| deaths within 3 s of spawning | 0 | 0 |
| AI ms a step (avg / p99) | 0.05 / 0.40 | 0.06 / 0.45 |
- **What changed in play:** the smog cost about 11% of the pace and made the street shorter. The fights it took went up: roof kills rose about 45%, because the roofs are the only clear air. The bots walk the flanks more but fight in them less: the smog hides them there, and the new decks are routes more than arenas. If the flanks should be killing grounds, the next lever is the patrols (more weight on them), not thinner smog.
- **Frame cost:** `bench(3)` on Neon Block: 60 FPS in all 14 views (4 new: the bridge, the rail, the market, the roof looking down); CPU 2.1–3.0 ms, GPU 5.9–6.6 ms (25.0: 5.4–6.4).
- **Leaks:** `leakcheck` (Neon Block, Neon Docks, Deep Jungle): 0 alive after GC, Neon Block steady lap over lap. `vramCycle` (3 laps): 0 growth at every stop.

## 35.0: Maglev AI awareness, flankers noticed

Branch `feature/maglev-ai-35.0`, from `main` @ `98dac8b` (34.0, merged). Full numbers: `docs/BENCH-35.0.json`.

### The flaw and its causes
On Maglev Terminal, players flanking by OMEGA's or ALPHA's spawn zones shot bots in the side and back while the bots kept fighting the man in front. Measured first (`scripts/flankcheck.mjs`, below), then four causes found, all engine-wide:
- **Target scoring:** a hostile's only proximity term was 12/d, and a switch needed a 15% margin. A target already shooting back (+3) held the bot against a nearer attacker beside or behind it. Pushing its target, the bot also ran away from the flanker, so the target's score kept rising.
- **Hearing:** a shot heard only put a contact on the team's board. Sensing skips anything more than 110° behind a bot unless it is alerted (a hit or a near miss), so a shooter behind it was never even looked at.
- **Spawn protection:** `Enemy.takeHit` returned before `onHit` while a bot was protected. A bot by its zone never learned it had been shot, and fought on with its back to the shooter once the protection wore off.
- **No close sense:** nothing behind was noticed, at any range, without a hit or a near miss.

### The fixes (`ARENA.flankThreat`, squared distances throughout)
- **Pressing threats** in the target scoring: a hostile in sight that isn't the target scores + `bonus` (8) when either:
  - it hit the bot in the last second from outside the 60° front cone (any range), or from nearer than the target;
  - it is outside the cone, within 10 m and nearer than the target. This scales by nearness, × 0.5–1.

  A pressing threat that outscores the target is switched to at once, with no margin, at most every 0.6 s. Only the nearer of two close hostiles gets the bonus, so the bot doesn't flip between them.
- **Heard close:** a shot within 12 m alerts the bot that hears it (`brain.onHeard`, from `Tdm`'s `onFire`), so Sensing checks that way even behind it.
- **Shot while protected:** `Enemy.onShotProtected` (a no-op for survival enemies) tells the arena brain who shot it; still no damage.
- **Snap:** hit, or shot near, by one it can't see, a bot turns to where the shot came from for 0.7 s and decides again at once, until its eyes find the shooter.
- **Sensing:** a hostile within 8 m is noticed even behind the bot. Anything within 10 m is re-checked at least every 0.15 s.
- **Maglev's glances** (`ARENA.scan`, on through Maglev's profile): in its own half with no target in view, a moving bot glances 50° to one side, then the other, every 1.6–2.6 s for 0.35 s. Its sight cone sweeps the glass side halls (to 110° off its heading) while the way ahead stays in it. At 75° the way ahead fell out of the cone: quiet time rose from 21% to 28%.

### Measured
**`flankcheck`:** an OMEGA bot by OMEGA's zones fights an ALPHA bot 14 m ahead that keeps hitting it, and the player appears beside or behind it. Setup:
- 5/9/14 m, at 90°/135°/180°, 4 runs a case;
- reaction is game time from the first shot; the headless page runs at about 20 FPS, so 50 ms is one frame;
- runs without a line of sight for most of the run are left out.

| | 34.0 | 35.0 |
|---|---|---|
| hit, 5–9 m | 14 of 20 switched, median 100 ms, p90 1.85 s | 20 of 20, median 1 frame, p90 2 frames |
| hit, 14 m | 2 of 4 | 6 of 6, 1 frame |
| hit under spawn protection, 5–14 m | 5 of 21, median 2.75 s (after it wore off) | 31 of 31, median 1 frame |
| missed shots (heard), 5–9 m | 1 of 22 | 18 of 21, median 1 frame, p90 300 ms |
| silent, 5–9 m | 3 of 23 | 15 of 21, median 400 ms |
| silent or missed, 14 m | 0 | 0 (out of hearing and the close sense, as meant) |

**Self-play** (Maglev 7v7, `tdmSim`, the new awareness off against on, the same load):

| | off (34.0's bot) | 35.0 |
|---|---|---|
| kills a minute | 20.5 | 21.2 |
| quiet seconds | 24% | 22% |
| AI ms a step (avg / p95 / p99) | 0.097 / 0.40 / 0.65 | 0.099 / 0.43 / 0.68 |
| sensing rays a frame (max) | 5.4 (18) | 5.6 (18) |
| switches a minute (pressing threats) | 346 (0) | 385 (108 in 4 matches) |
| sight to first shot (median) | 55 ms | 50 ms |
| stuck | 0 | 0 |

No CPU spike: the AI's cost per step is within noise, and sensing stays under its 18-ray cap.

**Frame cost:** `bench(3)` on Maglev: 60 FPS in all 6 views, CPU 2.1–2.7 ms, GPU 5.3–6.4 ms. `leakcheck` (Maglev, Neon Docks): 0 alive. Tests 394 (+6): the flank switch and its A/B, a hit from behind, two close hostiles without a flip-flop, the protected hit, the heard shot, the close sense.

## 36.0: match start, the camera snap and a pre-match countdown

Branch `feature/match-start-36.0`, from `main` @ `4f55c3a` (35.0, merged). Full numbers: `docs/BENCH-36.0.json`.

### The snap and its cause
At the start of a TDM match the camera showed one spot for a moment, then snapped to the spawn zone. It was not a default (0,0,0) camera:
- **The intro flew to the map's fixed start** (`data.tdm.start`), while the opening spawns (31.0's zones, dealt in pairs) were dealt only in `Tdm.begin()`, at the hand-off. The first frame of play cut 29.9 m (Maglev) to 65 m (Neon Docks).
- **`Player.reset` set the eyes at 1.65 m over the world's zero**, not over the feet: on a raised spawn (Desert, 2.26 m) the camera then rose into the eyes over the next frames.

### The fixes
- **The match is set up when the intro starts** (`Tdm.prepare`: bots on their opening spots, the player on his, everyone held; the match HUD hidden and the gun lowered for the cinematic). The intro lands on his eyes at the spot dealt (`IntroLike.landAt`, in the desert-style and jungle intros). `beginPlay` puts the camera on him before anything is drawn. A rematch (no intro) sets itself up in `begin()`.
- **`Player.reset`**: `eyeY = y + EYE`.

### PRE_MATCH (`TDM.preMatch`, 3 s)
- `Tdm.phase` is `'PRE_MATCH'` from `begin()` to `liveAt`, then `'LIVE'` (`goLive`).
- **Player (`Player.held`):** no walking, sprinting, sliding or jumping (a `legs` gate), and `Game` holds the trigger. Looking, crouching, aiming, reloading still work. The loadout picker is up the whole time (`loadoutPhase` 'swap'): 1–4 change the gun at once (Kitsune-9, Hornet, Jackal, Boar).
- **Bots (`Enemy.held`):** no think, no move, no fire; posed (the emerge pose played out to 0.6 s, upright, visor lit). `Tdm.update` runs no director, sensing pass, decides, tickets, respawns or spotting in the phase; the bodies, zone pads and HUD tags only.
- **At START!:** the match clock, every spawn protection and his spawn area (the weapon swap) start then; the TEAM DEATHMATCH banner.
- **The countdown (`ui/Countdown.ts`):** "3", "2", "1", "START!" (0.9 s), one DOM element per step built once, touched only on a step change; each centred by its box so its CSS animation owns `transform` and `opacity` alone. Nothing shows above 3 s left. A dark shadow under the glow (white on Maglev's white hall was unreadable).
- **DEV:** `__dev.start(…)` goes live at once (every earlier check and bench measures what it did); `{ preMatch: true }` keeps the countdown.

### Measured
**`scripts/matchstart.mjs`** (six TDM maps × 2, headless, the real DEPLOY path: intro skipped like a click; W, Shift, Space and the trigger held through the countdown, picks 4 then 2):

| | 35.0 | 36.0 |
|---|---|---|
| camera cut at the intro-to-play hand-off | 29.9–65 m (the map's start to the spawn dealt) | 0 m (largest move over 8 frames either side) |
| first play frame vs his eyes | (the cut) | 0 m; a rematch's first frame 0 m |
| eyes on a raised spawn (Desert, 2.26 m) | rose over the first frames | over the feet from the first frame |
| during the countdown: his movement, his rounds | (no countdown) | 0, 0 |
| during the countdown: bots' movement, turning, rounds | (no countdown) | 0, 0, 0 |
| picks during it | | Boar, then Hornet, at once |
| after START! in 1 s / 5 s | | he walks 1.7–7.9 m; bots move 18–27 m |

**The countdown's cost** (Chrome's counters, a second, Maglev): countdown 6.4 layouts (0.5 ms), 6.4 style recalcs (0.24 ms), 6.4 ms of script; live play 10.4 (0.83 ms), 12.8 (0.38 ms), 13.1 ms. No layout from the countdown's animations; the phase is cheaper than play (no AI).

**Frame cost:** `bench(3)` on Maglev: 60 FPS in all 12 views, CPU 2.2–2.7 ms, GPU 5.2–6.4 ms. Tests 400 (+6): the countdown's steps, its DOM writes, its keyframes; a held player; the reset's eyes; the scheduler's scratch list.

**A leak the countdown uncovered:** `leakcheck` (Maglev, Neon Docks, 2 laps) found 7 tags of the last level alive. `ThinkScheduler.pick` kept its last frame's picks in a scratch list between frames; the first live frame used to replace them at once, but now the next map's intro and countdown pick nobody for seconds, so the old bots (and through their context the old player and collision world) stayed reachable. The list is emptied after every pick: 0 alive.

## 37.0: Old Port shipyard, UNDER THE HULL

Branch `feature/old-port-37.0`, from `main` @ `8199b6f` (36.0, merged). Full numbers: `docs/BENCH-37.0.json`; the layout in `docs/LEVELS.md` (37.0).

### What changed
- **The room:** the coaster raised on shipwright's stands, keel at -0.9. The dock floor under her (x 24.5–35.5, |z| < 15) is a close-quarters room, 3.6 m high (3.25 m under the cradle beams).
  - **Cover** (mirrored): steel stands, a keel block, waist-high crates in the open channels, a scaffold tower and 2.2 m stacks under the hull. Gaps 0 or ≥ 1.3 m, nothing within 1.1 m of a dock wall. Instanced stands, crates and lamps.
  - **Lamps:** nine hanging work lamps, three of them real lights.
- **Deployment:** zone B moved from each team's dock apron down onto its own dock head floor (30, -4.5, ±31), where the dock opens onto the room; mirrored, 16 m from the hull's end for both.
- **Bots:**
  - the dock lane runs under the hull (it went over the bridge);
  - the patrols search the room's corners (`hvas`);
  - a 1.6 m nav lattice under the hull, only where a standing body has ≥ 2.2 m of headroom (min 3.25 m);
  - engine-wide: a bot's jump now stops under a ceiling (`stepAir`, as the player's does; the room's headroom never needs it).
- **Fixed:** the dock's end stairs pinched bodies against the dock wall's top near their heads (pre-existing: levelAI's one failure since 23.0, all 4 stuck bots of the baseline); a rail on the wall side, one 1.05 m railing over the quay. A bridge-roof nav node on the mast (since 17.1).
- **DEV:** `killerZone` on kill records, `tdmSim(...).killsWithinZone`; two bench views under the hull.

### Measured (self-play 7v7, `tdmSim`)
| | before (4 matches) | 37.0 (6 matches) |
|---|---|---|
| kills a minute | 21.4 | 26.7 |
| quiet | 29% | 12% |
| bot time under the hull | 0 | 4.7% (the room is ~3% of the walkable map) |
| kills under the hull (both fighters inside) | 0 | 30 (15) |
| kills in the whole dry dock | 26 | 73 |
| stuck bots | 4 (all on the dock's end stairs) | 0 |
| wall-presses | 1 | 0 |
| AI ms a step (avg) | 0.10–0.12 | 0.13–0.16 (more fighting) |

Without the patrol points (6 matches): 3.8% of bot time in the room, 27 kills (13 within), kills a minute 24.1.

**Level checks:** levelAI runners 399/400 → 480/480, gunners 20/20; `stress` 0 of 160,000 (main: 1), crouched 0 of 16,000; `world` clean.

**Frame cost:** `bench(3)` on Old Port: 60 FPS in all 12 views (2 new under the hull: CPU 2.8 / 2.2 ms, GPU 6.2 / 5.8 ms). `leakcheck` (Old Port, Neon Docks, 2 laps): 0 alive, geometries flat. Tests 408 (+8).

## 37.1: Old Port bridge hotfix, high ground kept watch on

Branch `feature/old-port-37.1`, from `main` @ `7f93af4` (37.0, merged). Full numbers: `docs/BENCH-37.1.json`.

### The problem
37.0 moved the dock lane under the hull, and the ship's bridge emptied: 0.0% of bot time and 0 kills from it in 6 matches.

### What was tried first (measured, dropped)
**A patrol weight:** the bridge and the gangway heads as patrol areas worth more the longer they went unvisited, held longer on arrival. Bridge time stayed at 0.1%. The patrol counters showed why: in a 7v7 a patrol rarely arrives anywhere (200+ picks, 7–18 arrivals a match), because a radar contact pulls it off.

### The fix: a watch (`TdmData.highGround`, `ArenaDirector.setWatch`)
- **Posting:** a team posts one bot at a time to the high ground. With no watch for `every` s, the director sends a bot that is:
  - the nearest one within `reach` m of the post held least lately;
  - on the post's own lane;
  - free: an arena bot not fighting, pushing, breaking, retreating or flanking, with 60%+ health.
- **On the way:** the bot has 20 s + 1 s per 2 m to get there; it sprints and fights what it sees on the way.
- **At the post:** it holds standing (a crouch hides it behind the bridge's rails) for `hold` s, watching the freshest contact or sweeping out and down. Fighting from there, it strafes within 1.2 m of the post. It counts as there within 2 m and 0.4 m of the post's height: within 1 m it stopped near the top of the roof's stair.
- **Old Port:** post the bridge roof (on the mirror line: fair to both); `hold` 10–16 s, `every` 10 s, `reach` 35 m. The deck at the head of each west gangway is patrolled (mirrored).
- **Each fix measured** (6 matches each):
  - the nearest bot regardless was usually one already fighting by the ship (14 of 15 died on the way): free bots only;
  - 9 of 20 died crossing the yard: the post's lane only;
  - deck posts drew bots out of the room under the hull: the bridge alone;
  - a bot standing on the roof was shot off it (14 deaths there to 5 kills): the leashed strafe.
- **Fixed on the way (engine-wide):** a hunt along a strict lane closed on a contact high over the lane at the waypoint under its feet. On Old Port that is a target on the deck, hunted along the lane under the hull: the hunter turned for it, back for the lane, and paced the scaffold stair. Now a contact more than 2 m over the lane's waypoint is routed to directly. Hunts from the north dock head onto the ship: 17/18 → 18/18 up, p90 16.3 → 14.7 s; the same probe on 37.0 had the same failure, so it's older than the watch.
- **DEV:**
  - `tdmSim(...)`: `watch` (posts, arrivals, died, timedOut, heldSeconds, diedAt) and `killsFromZone` (where the killer stood);
  - `scripts/bridgecheck.mjs`.

### Measured (self-play 7v7, 6 matches each)
| | 37.0 | 37.1 |
|---|---|---|
| bridge time | 0.0% | 1.1% |
| kills from the bridge (deaths there) | 0 (0) | 7 (8) |
| deck time / kills from it | 5.0% / 76 | 8.8% / 101 |
| UNDER THE HULL time / kills from it | 4.0% / 33 | 2.0% / 8 |
| watches posted / reached the bridge a match | – | 10–13 / 1–4 (most of the rest killed on the way), held 3–29 s |
| kills a minute | 24.5 | 25.9 |
| stuck bots | 0 | 0 |

**`scripts/bridgecheck.mjs`** (one bot moving, one held; 2 runs, 24/24 both):
- **Watches:** a posted bot reaches the bridge from the quays, the dock floor and both dock heads in 6.9–13.2 s, is still on the roof 5 s later, and once released is off it in 1.1–2.1 s.
- **Hunts:** from the north dock head onto the bridge or the deck, 16/18 and 18/18 got up (median 4.0–4.5 s, p90 5.4 s); the rest fought the target in sight from below.
- **Stalls:** none over 8 s.

My first versions of the check left the other bots held where they spawned. They were in sight, got shot, and came back as fresh bots: every fight in those runs was the harness's.

**The trade-off:** the deck, the bridge and the room under the hull share one lane's bots. Whatever brings the fight up onto the ship takes it out of the room below. Every variant with high ground on the ship had 4–12 kills from the room (33 before). `highGround.rise: 4.5` (send no bot from the dock floor) keeps the room at 3.4% of bot time, with the bridge at 0.5% and 2 kills from it. It is off: the brief wanted the bridge.

## 38.0: Desert flanks and density

Branch `feature/desert-38.0`, from `main` @ `b751587` (37.1, merged). Full numbers: `docs/BENCH-38.0.json`.

### The problem (measured first, the 37.1 map, self-play)
- The Desert was 5v5 (no `teamSize`): 42% of seconds with nobody firing, 12.9 kills a minute, 8-minute matches.
- More bots fought in the middle: at 12v12 the compound took 81% of the kills, the flanks 19%, the outer flanks (the trench, the convoy) 1.2%.

### The ruins (`Ruins.ts`, `RUINS`)
- A sandstone caravanserai on each outer flank's midline (west: x −82 … −66, z −10 … 10; the east one its rotation), mirror-symmetric about z = 0, so both teams come at it the same way.
- **Pieces:** walls in ruined stretches (2–3 m, rubble you vault, a 2 m breach), a south and a north gate under lintels, an east gate towards the pump house, an arch in the court, a well-house and a standing pier on the gates' and the breaches' lines, a corner room each side, a partition, fallen columns.
- **The gallery:** a 1.7 m masonry terrace along the west side with a stair at each end (cheek wall on the court side). It is the high ground (`TdmData.highGround`).
- **Built from primitives:** walls laid in courses of one block, columns stacked of one drum, each block off true and its own shade: 4 `InstancedMesh`es for both ruins, a few hundred instances. One collider per piece with the bounds of what is seen. Gaps between pieces are 0 or ≥ 1.3 m (a unit test holds it).
- **Made room:** the trench starts at the south gate (z 4 → 12, its traverses with it), the convoy's truck stands 3 m off the north gate (a blast wall), the APC moved 1.5 m, a rock moved.
- **Sightlines** (the longest clear eye-to-eye line north–south through the west flank; the east is its rotation): the trench and gate axis 90 → 58 m, x −71 120 → 48 m, x −70 102 → 58 m. The longest on the outer flank 120 → 80 m (the strip between the ruins and the pump house).

### The AI
- **The flanks' pull** (`ARENA.flankPull`, `TdmData.flankOf`, on through the Desert's profile; engine-wide, opt-in): a patrol area on a flank scores `base` (0.4) × its weight more, plus up to `hot` (0.8) × weight as the centre heats up (its deaths and gunfire, halving every 15 s). Weights: the hamlet and the wadi 0.6, the outer flanks 1.4.
  - Off once a team is on its last stand: with it on, the patrols kept going out to the flanks instead of hunting the last few, and endgames ran 52 → 90–110 s, mostly to sudden death. With the switch, 57 s (pull off: 57 s).
- **Watches at once** (`HighGround.count`): up to `count` bots of a team, each on its own post, the second posted 2 s after the first. The Desert keeps watch on both galleries (`count: 2`, hold 10–16 s, every 10 s, reach 40 m). Patrols search the ruins' corner rooms and east courts.
- **The Desert's profile:** `directRise: 1` (the last map without the 23.0 rule: bots that saw a gallery walked into its stair's side).
- **Fixed on the way:**
  - the outcrops' patrol areas were the sand plus the outcrop's height, 0.65 m inside the rock, so the route's goal snapped to the node beside the Spine and bots stood there (the stuck bots of 28.0's self-play);
  - the trench's revetments were 0.35 m over the sand, over a step but under the graph's knee ray: links ran across them and bots pressed into them (now 0.5 m);
  - the outcrops' ramp fill came in 4 steps up to 0.95 m deep: a jump at a ramp's side ended in the fill (stress 18 of 160,000 on `main`; now steps of ≤ 0.3 m, 0);
  - the APC's turret floated and could be walked through (`world()` on `main`);
  - **engine-wide:** a vault link must be vaultable from both ends (it was tested from one and linked both ways). It drops 55 one-way links over the wadi's berms on sloping sand and none on any other map.

### Team size: 12v12 (`DESERT_TEAM_SIZE`)
Self-play on the 38.0 map (6 matches each). "Live quiet" counts seconds nobody fired before the first last stand: the endgame's standoffs swung single matches' totals from 6% to 51%.

| a side | live quiet | all quiet | kills a minute | flank kills | edge kills | stuck |
|---|---|---|---|---|---|---|
| 8 | 29% | 33% | 18.7 | 45% | 35% | 0 |
| 9 | 25% | 30% | 20.2 | 41% | 33% | 0 |
| 10 | 15% | 24% | 24.1 | 33% | 25% | 0 |
| 11 | 15% | 22% | 27.5 | 31% | 23% | 0 |
| 12 | 11% | 26% | 28.2 | 30% | 23% | 0 |

10 is the knee. 12 is the only size where every match stayed at 9–14% live quiet: 15 walkable 8 m cells a player, Neon Docks' 9v9 density. The 37.1 map at 5v5 was 42% quiet (all), at 12v12 13%. The cards, the briefing and the team board read 12v12 (the board holds 12 rows, about 37% of the screen's height).

### Measured at 12v12 (self-play)
| | 37.1 map (3 matches) | 38.0, pull off (6) | 38.0 (12) |
|---|---|---|---|
| kills in the centre / on the flanks | 81% / 19% | 83% / 17% | 74% / 26% (19–46% a match) |
| kills on the edges (\|x\| ≥ 44) | 12% | 11% | 21% |
| bot time on the flanks | 34% | 31% | 46% |
| kills on the outer flanks | 1.2% | 1.3% | 2.7% |
| the ruins: bot time / deaths / kills from them | – | 3.9% / 6 / 8 | 5.2% / 24 / 19 |
| watches a match: posted / got there / held | – | 6.2 / 4.0 / 48 s | 7.4 / 5.3 / 66 s |
| kills a minute | 35.7 | 35.0 | 31.9 |
| quiet: live / all | – / 13% | 8% / 16% | 13% / 18% |
| endgame | 55 s | 57 s | 57 s |
| stuck bots | 0 | 0 | 0 |

- **Not met:** the outer flanks (the trench, the ruins, the convoy) take 2.7% of the kills at 12v12 (8% at 8v8). Bots walk them (16% of bot time in those zones) and hold the galleries, but the fights stay with the crowds nearer the middle. The flanks as a whole are where the kills moved.
- **Variance:** a match's flank share ran 19–46%; one of the twelve posted no watch at all.

### Performance
- `bench(3)` on the desert (Balanced, Apple M5; a new 12v12 TDM pass with the ruins' views): 60 FPS (59.6–60.3) in 13 of 14 views, CPU 1.6–3.6 ms, GPU 4.6–6.0 ms. The ruins are 4 instanced draws for both, a few hundred instances.
- **The firefight in the court** (12v12, the player shooting): 59 FPS and 9.0 ms CPU in the final run (p99 frame 44.5 ms), 2.6–3.2 ms in two earlier runs. The heavy frames are route planning: a re-plan tests up to 128 graph entries for a clear corridor, 3 routes a frame, and at 12v12 a fight bunches them. Not changed here: it is the 7.0 budget on every map. The court at 12v12 without shooting, 20 s: 60 FPS, CPU p50 2.8, p95 4.5, p99 7.8 ms.
- **Fixed (engine-wide, as old as 33.0):** a bot with no route looks up the nearest node it can walk to "once a re-plan", but the test was `pathT >= 0.55`, true for every frame of the first 0.05–0.35 s after each re-plan. That is a lookup of hundreds of rays a frame (3–12 ms of a 12v12 Desert frame in the court). It now looks once a re-plan.
- **The sandstorm** was already on the GPU: grains and dust sheets are static instanced buffers moved in the shader, the CPU sets uniforms, both hidden in calm air. The storm costs 0.3 ms GPU over calm in the yard.
- **Measuring:** bench views on an unfocused or hidden window report 0 frames (`valid: false`). The window went to the background 20 s into a run; a `visibilitychange` log showed it.

### Checks
- `levelAI`: runners 713/720, gunners 16/16 (`main`: 658/666 with fewer goals). The 7 misses are the same compound goals `main` misses; every ruin and outcrop goal reached.
- `world()`: no findings (`main`: 2, the APC's turret); 24 notes of the gallery stairs flush with their cheek walls.
- `stress`: 0 of 160,000 (`main`: 18), crouched 0 of 16,000.
- Self-play: 0 stuck in 48 matches with the final AI (the sweep, the 12v12 runs, pull off); 3 wall-presses. After the last fixes (the turret, the no-route lookup), 3 more on the Desert and 2 on Old Port: 0 stuck.
- `leakcheck.mjs 2 desert,docks,oldport`: 0 alive.
- Tests 429 (+14).

## 39.0: Recoil, FOV punch, aim alignment

Branch `feature/recoil-39.0`, from `main` @ `6574cd8` (38.0, merged).

### What was there
- **Each shot:** a permanent climb added to the mouse's pitch (it never came back) and camera-only springs (pitch, yaw, roll).
- **The aim:** the shot left along the camera's direction from the last drawn frame. That is a frame behind any kick and includes the screen shake: 0.04–0.22° off what the screen showed at 60 FPS.
- **The FOV punch:** fed through the sprint FOV's smoothing, so it eased in over a tenth of a second instead of hitting on the shot.
- **No limit:** nothing kept climb plus kick from going past straight up (the mouse alone was clamped at ±1.45).

### Recoil (`src/player/Recoil.ts`)
- **An aim offset over the look** (pitch up, yaw either way):
  - each shot feeds its kick in over 35 ms (a snap over a few frames, not a one-frame jump);
  - the offset returns to the look at the gun's `recovery` (exponential, per second). A gun that fires faster than it recovers stacks its kicks.
- **The view is the look plus the offset plus the screen shake** (`Player.viewPitch` / `viewYaw`). The camera is set from it, and the shot leaves along it (`viewBasis`) in the same frame. The mouse's own pitch is never touched.
- **Pitch limit:** the view never pitches past ±1.5 rad (`VIEW_PITCH_MAX`; straight up is 1.571), however much stacks.
- **The FOV punch:** set on the shot's own frame, falling back at the gun's `fovRecovery`.
- **Scaling:** ADS (×0.45) and crouch (×0.85) scale the kick and the punch, as before.
- **A hit flinches the aim** (0.006 rad up, a little sideways), recovered the same way.
- **The roll and the screen shake** stay as they were.
- **Cost:** 26 ns per update, no allocation.

### The four guns (`WeaponSpec.recoil`: kick, kickVar, yaw, recovery, fov, fovRecovery)
| | kick a shot | spread of it | sideways | recovery | FOV punch / fade |
|---|---|---|---|---|---|
| Kitsune-9 | 1.5° | ±15% | ±0.23° | 14/s (89% back by the next shot) | 0.6° / 22/s |
| Hornet SMG | 0.5° (the least) | ±30% | ±0.52° (as much as up) | 8/s | 0.7° / 30/s (gone between rounds: a flutter) |
| Jackal AR | 1.0° (even) | ±8% | ±0.4° | 3.5/s (28% back between rounds) | 1.5° / 14/s |
| Boar | 5.2° | ±12% | ±0.8° | 2.2/s (the slowest) | 3.5° / 7/s |

- **Measured in Chrome**, holding the trigger 1.5 s (60 FPS throughout; CPU 1.7–2.1 ms p50, ≤ 3.5 ms p99):

  | | Pistol | SMG | Rifle | Shotgun |
  |---|---|---|---|---|
  | Peak kick | 1.2° | 1.2° | 3.3° | 4.9° |
  | At release | 0.4° | 1.0° | 3.2° | 1.5° |
  | 1 s later | 0° | 0° | 0.1° | 0.15° |

  The rifle is the one you pull down.
- **Aim:** every shot leaves within 0.012° of the view drawn that frame. The shotgun's 0.15° is its own shake, which lands after the pellets have left. Was 0.04–0.22° behind.
- **Changed from 21.0:** the SMG had the steepest climb per shot. Per this brief it has the least kick a shot and shakes sideways instead. With the old permanent climb gone it is easier to keep on a body; its damage falloff (55% from 12 to 30 m) still limits its range.

### Checks
- Tests 441 (+12, `recoil.test.ts`):
  - kick and recovery maths, the same at 20, 60 and 144 FPS;
  - ADS and crouch scaling, the flinch;
  - the punch on the shot's frame;
  - each gun's profile against the brief;
  - the camera's forward equal to the shot's direction mid-kick;
  - the look unchanged;
  - held fire looking straight up stopping short of the pole, the camera's up staying up.
- The 21.0 balance test now holds the SMG's smallest kick (was the steepest climb).

## 40.0: Favelas (new map)

Branch `feature/favelas-40.0`, from `main` @ `19381f6` (39.0, merged). Full numbers: `docs/BENCH-40.0.json`.

### The map (`src/levels/favelas/`)
A Rio hillside in the afternoon sun, Team Deathmatch only.

**The terraces.** Five bands up the hill, each 20 m wide and 3 m above the last: the street at the bottom (A RUA), three alleys, the crest (O MIRANTE) under a 27 m earth cliff.

**The houses.** Each band has two rows of one-storey houses with an alley between them. Every roof is level with the terrace above, so the roofs and the alleys above them are one walking layer, with the alleys below as trenches cut into it.

**The alleys** are 4 m wide. Each one switches between a west and an east track at two little squares per half, so no line runs straight down an alley for more than one stretch.

**Getting around:**
- **Up:** escadarias up the whole hill (the central one at z = 0, one at each team's end), plus outside stairs onto the roofs. Each roof stair has a parapet and a top landing.
- **Across:** two plank bridges over every alley, and gaps through the rows.
- **Down:** drop off any roof edge.

**Mirror-symmetric** about z = 0. Each team's deployment zones are the street (A), mid-hill (B) and the crest (C): every team starts low, middle and high.

**Built from primitives:**
- **Instanced:** the houses (10 faded pastels plus bare terracotta block), roof slabs, windows, coloured doors, the towers' zinc roofs, water tanks and laundry.
- **World-space UVs:** a material patch maps render and brick by world position, so a stretched instanced box keeps them at real size.
- **Canvas textures:** render, hollow block, cast concrete, corrugated zinc and earth.
- **Seen only:** the gatos (wires) and the kites.

**Atmosphere:**
- one strong afternoon sun (static 2048 shadow map) and a strong sky fill;
- a warm haze;
- dust motes in the sun: 900 GPU-animated quads, one draw call, brighter towards the sun;
- seven kites over the hill;
- a procedural samba (`favela_theme`: ganzá, cavaquinho, surdo, tamborim, seven-string, agogô, apito with the fight);
- a Portuguese UI flavor (biome `favela`: MATA-MATA EM EQUIPE, MOBILIZAR…).

### Nav
- 1,011 nodes and 123 drop links, built from the plan: down the alleys, a grid on every roof, the yards, both ends and the middle of every stair as climbing chains, nodes across each bridge.
- **Drops** go off every roof edge, off the W rows' backs and off the yards' walls, but only where the way down is clear.
- **No dead ends:** every node reachable from a spawn, and every reachable node can get back (a new graph check, drops included).

### Fixed on the way
- **Engine-wide:**
  - **The swept landing.** A falling arena bot landed only on a floor within 5 cm over its feet, checked per step; at more than 3 m/s it stepped past box floors. Here every floor is a box: bots fell through alleys and roofs into the fill, were pushed metres sideways out of it, and stuck at y 0. `stepAir` now lands on any floor crossed in the step. Regression on Old Port and the Desert: 0 stuck.
- **This map:**
  - mirrored stairs that climb along z now climb the right way;
  - drops under a bridge's end removed (a 6v6 endgame of patrols stuck at z ±24);
  - parapets and landings so nobody steps off a roof onto a stair part way down (stress);
  - bridge rails 0.18 m (thinner than the player's 0.15 m sub-step, a sprint-jump tunnelled through);
  - a second bridge per alley (the cross gap had cut half the W roofs off);
  - crates 1.4 m off walls and stair feet.
- **Menu text:** "five to twelve a side" (was "five or seven"); the SMG blurb "Shakes; weak far." (39.0 made "Climbs" wrong).

### Team size: 10v10 (self-play)
| a side | matches | live quiet | all quiet | kills a minute | match | roof time / kills | stuck |
|---|---|---|---|---|---|---|---|
| 6 | 3 | 31% | 35% | 17.6 | 6.1 min | 24% / 17% | 0 |
| 8 | 3 | 22% | 41% | 21.1 | 5.2 min | 20% / 13% | 0 |
| 10 | 6 | 16% | 33% | 27.5 | 4.2 min | 22% / 18% | 0 |
| 12 | 3 | 15% | 30% | 33.1 | 3.6 min | 20% / 13% | 0 |

10 is the knee; 12 adds nothing.

**Shipped, 10v10, 15 matches:**
- **Pace:** 29.9 kills a minute; live quiet 16.1% (10–21% a match); first engagement 16 s.
- **Height:** 87% of bot time off the street; rooftops 22% of bot time and 15% of kills.
- **Kills by level:** low (street and band 1) 30%, middle 30%, high (crest side) 40%.
- **The escadaria** takes 29% of the kills on 12% of the time: the midline, where both teams meet.
- **Balance:** ALPHA 9, OMEGA 6.
- **Movement:** 0 stuck, 0 wall-presses.

### Checks
- `world()` 0 findings; `stress` 0 of 160,000; `levelAI` runners 86/86 (twice), gunners 2/2.
- `matchstart.mjs 2 favelas`: 2/2.
- `bench(3)` on Favelas (new set, 10v10): 60 FPS in all 7 views (59.6–60.3), CPU 1.8–2.8 ms, GPU 4.2–5.2 ms, under 37k triangles.
- `leakcheck.mjs 2 favelas,desert,oldport`: 0 alive.
- Tests 453 (+12).

## 41.0: smart spawns and dynamic frontlines

Branch `feature/smart-spawns-41.0`, from `main` @ `8554f3c`. Full numbers: `docs/BENCH-41.0.json`.

### What was measured first
Bot-only self-play before any change (the 40.0 bot, `scripts/clumpcheck.mjs`, 4 matches a map):
- **No 7–10 blob:** the average bot stood in a group of 1.9 (Desert 12v12) and 1.6 (Old Port 7v7), linked within 10 m. Its team's largest group averaged 3 and 2.
- **Lone runners:** 52% and 60% of the bots were alone.
- **The herd is on one target.** Every free bot within the radar (40 m) ran at the team's freshest contact, so one enemy had four or more bots after it 12% of the time on the Desert. The human is one of those targets.

So 41.0 turns lone runners into small squads and stops the convergence on one enemy, rather than spreading the bots further.

### Fireteams (`ArenaDirector`, `DeathmatchAI`)
- **Forming.** A bot with no fireteam joins one with room whose leader (its lowest uid) stands within 1.5 × the map's density radius on its level, or starts one. Lone bots near each other merge.
- **Size.** The team over the sectors, 1 to 3: 12 on the Desert's five sectors make trios, 7 on Old Port's three make pairs and trios, and 5 on Neon Block stay alone.
- **On patrol.** The leader picks the patrol area and claims it for the whole fireteam (claims and crowding count bodies). Members go to the leader when further than 0.6 × the density radius (at least 5 m), else to its area beside it, sweeping the other way. When the leader is fighting what a member can't take on, the member comes up beside it.
- **Sectors.** A fireteam keeps its leader's sector (the director's lanes). Lane balancing places and moves whole fireteams, weighing each lane with the fireteam in it.

### Engagement caps
- **Per hostile:** at most 3 of the team (fireteam mates included) chase or fight one hostile. A bot commits to its target at each decide; a commitment lapses after 1 s.
  - A hostile out of sight with its 3 already is passed over (the team's radar too); the bot picks another or patrols.
  - One in sight is still shot, scored 3 lower than a target nobody holds.
  - One shooting at the bot is always fair game.
- **Per fight site:** at most 4 of the team after hostiles within the density radius of each other. Two fireteams on two of one group are one fight.
- **An extra shooter** on a full target keeps its range (doesn't close in). One of a group on it goes round (32.0's crowd flank, now with sectors).
- **Spacing in a fight:** a bot eases off teammates within 10 m, its own fireteam within 4 m (32.0's engage spacing, now with sectors).

### Sectors
- **Counted every 0.25 s:** each sector's members and its bots in a fight.
- **Crowd line:** 4, or a fair share + 1 when that is more.
- **Patrol areas:**
  - −1.5 per bot over the crowd line in their sector;
  - + the sector's need (fair share less the rest of the team's share);
  - less for teammates standing or headed near them (the bot's fireteam aside).
- **New fireteams** are never sent to a sector with 4 fighting.
- **Peel:** every 4 s a crowded sector sends one fireteam sent there, out of any fight, to the sector fewest are sent to, when that evens them out. The leader picks a new area.

### Density-aware spawns (`SpawnManager`)
- **The local area (`spawnTuning.densityR`):** Desert 18 m, Favelas 16, Neon Docks 14, Crash Site 12, Neon Block 10, Old Port 7, Maglev 7.
- **The fireteam curve** (`fireteamScore`) for allies in it:
  - 1–2: a bonus (a fireteam to join);
  - 3: nothing;
  - 4+: a penalty growing with each ally past 3 (a deathball).
- **Deployment zones:** −(uses past the least used) + the curve (1.25 / −2 per ally past 3). Pads: the curve (10 / −25) in place of the 27.0 squad term.
- **Old Port:** respawns with an ally near rose from 21% to 40%.
- **Desert:** with three zones for twelve, respawns beside 4+ allies didn't fall (5.1 → 7.1%). The bonus at 0.5 or 0 measured the same within noise.

### Results (bot-only, the 40.0 bot is `sectors.on: false` in the same build)

| | Desert 12v12, 15 matches each: old → new | Old Port 7v7, 6 each: old → new |
|---|---|---|
| Average clump (10 m) | 1.86 → **2.24** | 1.74 → **1.99** |
| Alone / in a group of 2–3 | 53 / 36% → 36 / 47% | 54 / 39% → 40 / 52% |
| Groups of 5+ | 3.6 → 6.6% | 2.1 → 1.5% |
| Herd (5+ together 5 s) | 0.85 → 2.0% (±0.45) | 0.42 → 0.13% |
| Hostiles with 4+ bots on them | 12.3 → **8.8%** | 8.9 → **3.9%** |
| Fights at once | 2.44 → 2.28 | 1.91 → 1.76 |
| 2+ fights at once | 82 → 77% | 70 → 61% |
| Kills with another 30 m off within 10 s | 95 → 94% | 92 → 87% |
| Kills a minute | 31.3 → 31.6 | 26.4 → 25.0 |
| Stuck | 0 → 0 | 0 → 0 |

**Not met:**
- **Desert's 5+ groups and herds** rose, both small: most of the herds are 25–45 m from the team's own zones (fireteams leaving a zone together and fighting right there).
- **Fewer simultaneous fights** on both maps (twelve units became about six fireteams).
- **Desert herd measurements swing:** 1.2–3.0% between batches of one configuration, so it is pooled over 15.

**Other maps (2–3 matches, new):**
- **Favelas:** 27.3 kills/min, clump 1.96, 4+ on a hostile 5%.
- **Maglev:** 20.6, clump 2.05, 4.5%.
- **Neon Docks:** 25.0, clump 1.93, 5.2%.
- **Crash Site** (old → new):
  - clump 1.72 → 1.96;
  - herd 0.5 → 0.1%;
  - 4+ on a hostile 11.8 → 5.1%;
  - kills a minute 26.2 → 26.3;
  - quiet time 11.6 → 16.2%, to watch.
- **Neon Block:** unchanged (12 kills a minute and 37% quiet before as after; fireteams of 1). 4+ on a hostile 11.7 → 3.7%.

Stuck 0 everywhere. AI cost per step within noise (Desert 0.72 → 0.69 ms).

### Checks
- Tests 473 (+20: `sectors.test.ts`): density, the fireteam curve, zones and pads, the local area per map, fireteam size and joining by the map's radius, leaders, the per-hostile and per-site caps, the radar passing over a full contact, sector terms, peels (never out of a fight), claims by bodies; 32.0's space tests run as the 32.0 bot.
- `npm run build` clean. `bench(3)` not run (no visual change; AI cost above).

## 42.0: AI archetypes and combat personalities

Branch `feature/ai-archetypes-42.0`, from `main` @ `79c0cb4` (41.0, merged). Full numbers: `docs/BENCH-42.0.json`.

### Roles (`Roles.ts`, `ArenaDirector`, `DeathmatchAI`; `ARENA.roles`)
- **Dealing:** at each spawn, the role furthest below its share of the team: frontliner 50%, lone wolf 25%, anchor 25% (12 bots: 6/3/3; 4: 2/1/1). With no free post, an anchor fights as a frontliner. Nothing per frame.
- **Frontliner:** the 41.0 bot. The fireteams are the frontliners' alone, in pairs at least.
- **Lone wolf:** no fireteam.
  - **Patrol:** it searches areas in the enemy's half, the pull peaking a third of the way in and gone by their spawn (round them, not into their zones). It prefers quiet areas (low activity) away from teammates.
  - **Targets:** it takes on a contact out of its sight only while a teammate is fighting it (a busy one), from a point 9 m behind where the contact faces. One in sight counts only within its gun's range, or if it is shooting at the wolf. The radar's pull to the freshest contact is off for it.
  - **Stalk:** with a target in sight that faces away (more than 100° off it), further than 11 m and not shooting at it, it closes in with its gun down.
- **Anchor:** holds a post as the 37.1 watch holds one (it fights from it within a 1.2 m leash), never hunts, pushes, flanks or closes in. It fires out to 1.4 × its gun's range.
- **Anchor posts:** found once a match per team.
  - **Candidates:** nav nodes (on the floor) and the patrol areas in its own half, up to the middle, that a body can stand on.
  - **Score:** the mean open sightline toward the enemy (9 rays), +4 a metre of height, +6 for a wall at the back, +20 for the map's high ground, −0.6 a metre of walk from the nearest home zone past 25 m.
  - **Kept:** the best, at least the density radius (12 m or more) apart, and only those whose route from home is at most 1.5 × the straight line + 12 m.
  - **Results:** Favelas' rooftops, Maglev's skybridges, Neon Block's 7.2 m roofs, the Docks' crane decks, Old Port's bridge and stack tops, the Desert's ruin towers. With roles on, the 37.1 watches are off.
- **Guns (`roleArm`):**
  - **Anchor:** the rifle, always.
  - **Wolf:** pistol or SMG.
  - **Frontliner:** shotgun 40%, rifle 40%, SMG and pistol 10% each.
  - **The 13.0 cap** (at most 2 of a gun) now counts the role's own bots, sized to the gun's share (six frontliners: 3 shotguns, 3 rifles). With the team-wide cap, the anchors' rifles left the frontliners 13–18% rifles.

### Game feel
- **The warning shot:** a wolf opening fire on the human from outside his view (more than 90° off where he faces) waits 0.2–0.4 s, and its first round goes 1.4 m wide. `warncheck.mjs` on Maglev, 10 runs each:
  - **A wolf behind him:** first round 309 ms after sight (median), wide 10 of 10, passing 1.45 m off his chest.
  - **A wolf he faces:** 50 ms, wide 0 of 4.
  - **A frontliner behind him:** 50 ms, wide 2 of 7 (spread).
- **Recover:** an anchor or wolf hit under 75% of its health breaks off, unless it is about to finish a target under 30% within its push range.
  - It goes to the nearest spot out of the shooter's sight within 14 m (else 8 m straight away), crouches, and waits for its health to come back to 90%.
  - It ends after 14 s at most, or fights if a hostile it sees comes within 8 m. Then 5 s before the next.
  - Anchors and wolves skip the 20.0 long-range evade (hurt, they recover). On Old Port a sniped anchor broke in and out of one spot for 15 s and more: 2 stuck in 6 matches before, 0 after.
- **Regeneration** (`ARENA.regen`, the human's rule): 5 s after the last damage, 5% of its health a second, for every arena bot.

### Results (bot-only, 6 matches each; off is roles and regen off in the same build: the 41.0 team)

| | Desert 12v12: off → on | Old Port 7v7: off → on |
|---|---|---|
| Kills a minute | 31.6 → **24.8** | 25.4 → **21.4** |
| Quiet (no shots, before the endgame) | 10.3 → **2.7%** | 10.7 → **4.3%** |
| Herd (5+ together 5 s) | 1.1 → 0.6% | 0.4 → 0.4% |
| Hostiles with 4+ bots on them | 6.6 → 4.8% | 5.0 → 2.4% |
| Fights at once | 2.62 → 2.96 | 1.78 → 1.86 |
| Stuck | 0 → 0 | 0 → 0 |

| Role (Desert / Old Port) | Share | Alone | In the enemy's half | At its post | K/D | Kills from behind or side | Kill range |
|---|---|---|---|---|---|---|---|
| Frontliner | 50 / 44% | 25 / 29% | 10 / 8% | | 0.91 / 1.02 | 18 / 9% | 19 / 11 m |
| Lone wolf | 24 / 27% | 44 / 40% | **25 / 15%** | | 0.76 / 0.85 | 19 / 5% | 14 / 10 m |
| Anchor | 27 / 29% | 49 / 43% | 0 / 0% | **36 / 10%** | **2.04 / 1.06** | 25 / 10% | 31 / 23 m |

**Other maps** (2 matches each, before the per-role gun caps):
- **Kills a minute:** Favelas 21, Docks 21, Crash Site 18.5, Maglev 14.6, Neon Block 10.
- **Anchors at their post:** 14–46%.
- **Stuck:** 0 everywhere.

**Not met, or costs:**
- **Kills a minute fell** 15–22% on the Desert and Old Port (more on Maglev: 20.6 in 41.0, 14.4 now). At any moment a quarter of the team holds a post and a quarter is out on the flanks or recovering.
  - Regen is not the cause: off it measured the same (Desert 24.6, Maglev 14.4). It shortens the dead time between fights (Maglev quiet 9.4 → 4.2%).
  - The knobs: `ARENA.roles.share`, `roles.recoverBelow`.
- **Old Port's anchors** reach their posts 10% of their time: the bridge is the contested middle, and 7v7 lives are short. The Desert's: 36%.
- **Wolves on Old Port** rarely get behind anyone (5% of their kills from behind; 19% on the Desert): the map's lanes leave little way round.
- **Anchors may be too strong on some maps** (2 matches): K/D 9.3 on the Favelas rooftops, 4.0 on Maglev.
- **Wolves and anchors recover 15–24% of their time.**
- **The warning shot** was measured with the scripted check only (bot-only matches have no human): 0 in self-play by design.

### Checks
- Tests 486 (+13: `roles.test.ts`): the role shares, the guns, the post score and choice, anchor seats as watch posts, the shares kept over the living, fireteams of frontliners only, the wolf's area score, watches off with roles, regeneration, the brain's role rules.
- The 37.1 and 38.0 watch tests run as the 41.0 team. The 30.0 sprint test allows the recover.
- `npm run build` clean.
- AI cost per step as before (Desert 0.66 → 0.76 ms ±0.1, Old Port 0.13 → 0.16).
- `bench(3)` not run (nothing drawn changed).

## 43.0: parkour: the ledge grab

Branch `feature/parkour-43.0`, from `main` @ `6ee486c` (42.0, merged). Full numbers: `docs/BENCH-43.0.json`.

### The grab (`src/player/Mantle.ts`, `Player`; `MANTLE`)
- **When it looks:** in the air, W held, at or past the jump's apex (vertical speed under 1.5 m/s) and not falling faster than 8 m/s; not sliding, not already pulling up, 0.3 s after the last grab. On the ground nothing is cast (`mantleStats`: probes, rays, grabs).
- **Ray 1, the wall:** forward from the hips (0.4 m over the feet: a chest-height ray passes over the low ledges), 0.8 m from the body's centre, against what blocks a body, not what stops a bullet. A fence with no `ray` counts: `raycast(..., solid)`. The wall must face him (within 55° of head-on) and be upright. A vaultable rail or tank he is already high enough to clear (feet over its top − 0.62 m, the collision's own rule) is left to the vault, which keeps his pace.
- **Ray 2, the ledge:** straight down where the body would stand (0.47 m past the face), from 1.0 m over the feet. It must find a flat top that is a floor, 0.3–1.0 m over the feet. Lower is a step the collision takes anyway; higher is out of reach. The top must also lie above where ray 1 met the wall: a floor found lower than that is past a parapet.
- **Room:**
  - The floor under the body there is that top, not a fence's edge with a drop past it.
  - A crouched body fits: under 1.8 m of room he arrives crouched, under 1.2 m it is no ledge.
  - The column he rises in is clear.
  - The way over is clear at the shins and the chest (two more rays: a rail set back from the lip).
  - The level's extent takes the spot (`Player.mantleOk`, set by Game).
- **Reach:** the apex (0.74 m at 60 FPS) + 1.0 m: tops up to about 1.75 m over the floor he jumped from. A plain jump reaches 1.07 m (the apex and the collision's 0.3 m step).
- **The pull-up:**
  - Gravity and WASD are off, and the sprint drops.
  - The height eases out over the first 62% (the arms snap him up). The step over the lip eases in and out and starts as the hands clear it, so the feet never move forward below the top.
  - It lasts 0.2 + 0.08 × (rise / 1.0) s: 0.22–0.28 s.
  - He comes out on the ledge at 3.2 m/s forward at least (80% of a sprint's pace), with a small landing dip.
  - Under a low ceiling he rises already as low as the room there needs (without that, the standing body was pushed back off the ledge as it landed).
  - `vel` is the real motion meanwhile, so the bots lead him right.
- **Game feel:**
  - The view dips 0.09 rad and rolls 0.035 rad (a random side) on a sine over the pull-up, in `viewPitch` so the camera and a shot agree (none leaves: the trigger is off during it).
  - The gun drops to the sprint pose, twice as fast.
  - A footstep on the grab and on the lip.
- **Bots:** nothing of theirs changed. Their body (`Enemy.move`), their nav and its vault links are untouched; the one shared change is `raycast`'s optional `solid` flag (default as before).
  - Arena bots don't climb as the player does: they jump only to dodge and vault walls flagged `vault` up to 1.35 m on nav links. They do not "share the same jump capability", so they don't follow him onto a 1.5 m box. Their routes don't go there, and they shoot at him.
  - Self-play after the change: stuck 0 (Desert, Favelas, Old Port; 2 matches each); kills a minute as in 42.0 within the noise.

### Results
**The level, every map** (`ledgecheck.mjs`: the probe from every cell a plain jump reaches, 8 directions; the stress at 6,400 runs a map):

| Map | Ledges | New ground (3 m cells) | Outside the zones | Escapes / traps / pit, before → after | Stress failures | Grabs in the stress | Probe |
|---|---|---|---|---|---|---|---|
| Tokyo | 126 | 24 | 0 | 0 → 0 | 0 / 6,400 | 122 | 0.56 µs |
| Jungle | 159 | 74 | 0 | 0 → 0 | 0 / 6,400 | 190 | 0.50 µs |
| Desert | 67 | 45 | 0 | 0 → 0 | 0 / 6,400 | 171 | 1.06 µs |
| Docks | 16 | 1 | 0 | as before (see below) | 1,616 / 6,400 (1,620 with the grab off) | 48 | 0.39 µs |
| Old Port | 33 | 19 | 0 | 0 → 0 | 0 / 6,400 | 90 | 0.34 µs |
| Maglev | 124 | 0 | 0 | 0 → 0 | 0 / 6,400 | 287 | 0.39 µs |
| Crash Site | 107 | 58 | 0 | 0 → 0 | 0 / 6,400 | 179 | 1.67 µs |
| Neon Block | 28 | 9 | 0 | 0 → 0 | 0 / 6,400 | 62 | 0.32 µs |
| Favelas | 9 | 4 | 0 | 0 → 0 | 0 / 6,400 | 119 | 0.34 µs |

- **New ground** is the tops a plain jump didn't reach, by zone: for example Tokyo's TECH ROOF and SKY GARDEN, Old Port's BRICK WAREHOUSE and CONTAINER YARD, the Desert's OUTPOST YARD and SOUTH WADI. No ledge lands outside the extent (the extent check refused none), and no new escape or trap: the world check with the 1.74 m climb finds what it found with the jump's 1.0.
- **Docks fails as before:** with the grab off, the same 1,620 failures and the same 20,160 escape cells. Every failure starts at (-82.75, -91.75), outside the extent. It predates 43.0 (earlier versions report the docks clean) and is not fixed here.
- **Found by the stress test and fixed:**
  - The first build pulled him through a barrier on Old Port (a deck's parapet), Maglev (the platform edge rail over the track bed) and Crash Site (the lab deck's rail): 3–4 runs in 6,400 each. Ray 2 had found a floor behind a wall taller than it. The top must now be above where ray 1 met the wall, and the way over must be clear at the shins and the chest: 0 since.
  - On Favelas the probe took the 1.2 m water tanks as ledges, though the vault already carries him over them. A vaultable thing he is clearing is left to the vault.

**The live game** (`mantlecheck.mjs`: head-on, wide-faced ledges from the survey, real key events, ~20 FPS headless):
- **Grabbed and on top:** 94 of 97: Desert, Maglev, Crash Site, Neon Block, Old Port and the Jungle 12 of 12 each; Tokyo 11 of 12; Docks 8 of 10; Favelas 3 of 3 (all it has once the tanks are vaulted).
- **The 3 misses** are the tallest picks (rise 0.86–0.96 m). At 20 FPS the jump's apex is about 0.65 m instead of 0.74, so those tops are past the reach. The jump's Euler step is frame-rate dependent (pre-existing); at 60 FPS the unit test takes a 1.7 m top.
- **The pull-up:** 217–285 ms of game time (frames 50 ms apart), the view's deepest dip 0.05–0.09 rad, 0 rounds fired during one with the trigger held.

**CPU:**
- **On the ground:** 0 rays (`mantlecheck`: 0 over about 2,600 ground frames; a unit test pins it).
- **In the air:** one probe a frame, with W held, past the apex: 0.3–1.7 µs a call (the survey, about 48,000 calls a map). That is under 0.002 ms of a 16.7 ms frame. The grab itself adds 2 more rays and a resolve, once.
- `Player.update` per frame (headless): ground 23–40 µs, air 53–82, pull-up 28–46. An Old Port A/B with the grab off measured air 40 against 62 µs, but the same ground frames differed by 13 µs between the two runs (two Chromes at once): noise at this scale.

**Bots** (self-play, 2 matches each, after the change): stuck 0 on the Desert, Favelas and Old Port; kills a minute 23.0 / 28.8 / 21.1 (42.0: 24.8 Desert, 21.4 Old Port over 6), AI 0.69 / 0.17 / 0.14 ms a step.

### Checks
- Tests 498 (+12: `mantle.test.ts`):
  - a 1.5 m box is taken in 0.2–0.3 s with no overshoot; off, he stays down;
  - 1.7 m is taken and 1.9 m is not;
  - only with W held; no ray on the ground;
  - the same spot at 30, 60 and 144 FPS;
  - not a fence with a drop past it, not through a parapet or a rail set back from the lip;
  - the room: under 1.0 m no grab, under 1.4 m he arrives crouched;
  - the extent;
  - a vaultable tank cleared at a sprint is vaulted, a taller one is grabbed;
  - the view dips and comes back, and the sprint is off;
  - the probe's rays;
  - the motion goes up before over.
- `npm run build` clean.
- `bench(3)` not run: nothing drawn changed, and the CPU cost is in microseconds.
- The README (the ledge grab, the Space row) and the story's key hint (jump · vault · climb) updated.

## 44.0: the loading screen, and three fronts

Branch `feature/fronts-loading-44.0`, from `main` @ `54f1853` (43.0). Full numbers: `docs/BENCH-44.0.json`.

### The loading screen and the warm-up (`src/ui/LoadingScreen.ts`, `src/core/Warmup.ts`)
The playtest: the first minutes stutter, as if the game were still loading. It was: WebGL does work the first time something is drawn, not when it is built.
- **What stalled** (`hitchprobe.mjs`, 43.0, GPU): 12-15 shader programs compiled during the intro (the bots, their name tags, the shadows' depth programs), 1-3 more mid-match (effects), gaps of 129-238 ms in the intro and frames of 85-114 ms in the first 30 s. Textures upload the first time a material is drawn, so every part of a map turned to for the first time paid too. And `compile()` had been building the wrong programs: it ran with the canvas bound (tone mapped, sRGB), while the composer draws the world into a target (no tone mapping, linear), so its programs were still compiled at the first frame.
- **The screen:** boot, a map change from the menu or a result screen, back to the menu, and DEPLOY load behind it: the map's name, the step (BUILDING THE WORLD, NAVIGATION, COVER AND LANES, TEXTURES, SHADERS, WARMING UP, DEPLOYING), a bar and the percentage. The level's build runs in steps (`Game.buildLevel`, a generator) with a frame between them; the bar is a `scaleX` with a transition, so it creeps on through a long synchronous step. The loop draws and simulates nothing meanwhile (`Game.building`). `loadLevel` (the DEV tools) still builds at once.
- **The warm-up:** every texture of the world and the viewmodel uploaded (`initTexture`, a few ms between frames); every program compiled with a target bound as the composer's is (`compileAsync`: in parallel where the driver can; `Renderer.compile` does the same for the old synchronous calls); then the whole scene drawn once into a 64 px target with everything shown and nothing culled, shadows on (the depth programs, the buffers). Lights are never touched (their count is in every program). DEPLOY deals the match first (the bots spawned, his spot) and warms that up before the intro: 74-83 ms.
- **After:** no frame over 50 ms in the first 30 s on Old Port, Favelas, the Desert and Maglev (worst 21-38 ms); no gap over 50 ms in the intro; no program compiled after the intro (one or two sprites still compile in it).

### Three fronts (`src/enemies/arena/Fronts.ts`; `ARENA.fronts`)
The playtest: around 20.0 the fights were good but in one heap; since bots play like players all over the map (41.0-42.0) a match is a scatter of duels with no shape. The brief: two ends of the map, three lines of battle, one side pushing the other as in a MOBA, fights everywhere, wherever you spawn.
- **The lines:** one per sector (the map's `laneOf`: a flank, the centre, a flank; a director lane's sector is most of its waypoints'). A line is a progress along ALPHA's base-to-base axis, eased (0.05 a second, about a walk) to where the teams meet in it: between each team's second most forward body there; one team alone takes it to its lead. It stops `capGap` short of the nearest spawn zone in the sector.
- **Stances:** a team's strength in a sector is the bodies sent there (the directors' lanes; the human where he stands) and its kills there in the last 15 s at 0.6 a body. Ahead by 1.4: PUSH; behind by 2: FALL BACK; else HOLD (with hysteresis).
- **The bots:** a frontliner with nothing on the board walks its lane to its sector's line (`frontWant`: the line, +0.25 pushing, -0.03 holding, -0.18 falling back), and goes a waypoint either way there (the 20.0 lane walk, `planLane`, now per lane and moving). It goes after a board contact within 32 m, or in its own sector, not across the map. Wolves still prowl (10% of a team with the fronts, 25% before), anchors still hold posts (20%, 25%); the engagement cap allows fights of 6 (was 4).
- **Reinforcements:** each respawn goes to the team's neediest sector: outnumbered there, under its fair share (the lanes' weights, a sector's mean), its line pushed back towards its spawn (`danger`). It spawns in that sector's zone if safe, or at a rally point: the lane's last waypoint 0.28 behind the line, when that is ahead of the zone, safe by the zone's rule. The human goes to the lane with the most enemies, his team's need first. Every 8 s a sector falling back takes a fireteam (none of it fighting) from one pushing with a body to spare.
- **Breaks:** a line held at the cap, in the other team's face, for 6 s has broken through: the other team bleeds a ticket every 5 s until it is pushed out (`MatchRules.bleed`, never under 0). BREAKTHROUGH / LINE BROKEN on the banner; a lane held or pushed back in a small notice under the score.
- **The HUD:** between the two sides of the score, a bar per lane, ALPHA's ground from the left to the line, OMEGA's from the right; the lane he is in outlined, a lane ALPHA pushes glows, one it falls back in pulses red, a broken one flashes. The minimap marks each line across its lane in the pusher's colour. Transforms and opacity only (csscheck: the TDM HUD 0 recalcs a second at rest).
- **Neon Block 7v7** (5v5 to 43.0): three lanes need two or three a side each. With the fronts, 3 matches each: 6 a side 16.7 kills a minute and 14.8% quiet; 7 a side 20.2 and 10.1%; 8 a side 20.7 and 6.7%, but no lane lit 19% of the time.
- **Tried and dropped:** respawn waves (a team's dead back together on a 6 s beat, a MOBA's creep waves): fewer kills and more lulls on all four maps (Old Port 25.5 → 22.8 kills a minute, Maglev 21.3 → 17.2; 4 matches each), `ARENA.fronts.wave` 0. Lane discipline in the target choice (an unseen contact in another lane beyond 20 m left alone): fewer fights on six of seven maps (Old Port 27.3 → 21.5, Neon Block 18.4 → 15.4), reverted.

### Results (self-play, `frontcheck.mjs`, 3-4 matches a map; 43.0 is `{"fronts":false}` on the same build)
| map | kills a minute | all three lanes fighting | fighters a fight | first round after a spawn | match |
|---|---|---|---|---|---|
| Old Port | 20.8 → 27.3 | 36% → 50% | 2.8 → 3.0 | 8.0 → 7.7 s | 316 → 242 s |
| Maglev | 14.0 → 20.8 | 29% → 40% | 3.0 → 3.6 | 12.1 → 8.7 s | 446 → 306 s |
| Favelas | 22.6 → 30.8 | 39% → 49% | 2.7 → 3.2 | 14.8 → 10.2 s | 300 → 229 s |
| Neon Block (5v5 → 7v7) | 10.8 → 18.4 | 22% → 40% | 2.2 → 3.3 | 16.2 → 13.3 s | 575 → 345 s |
| Neon Docks | 20.4 → 29.2 | 32% → 50% | 3.0 → 3.5 | 12.3 → 8.1 s | 337 → 225 s |
| Crash Site | 18.8 → 20.0 | 16% → 27% | 3.4 → 3.7 | 12.7 → 11.6 s | 343 → 328 s |
| Desert | 23.0 → 32.9 | 28% → 40% | 3.0 → 4.3 | 13.8 → 10.6 s | 311 → 213 s |

- Fights of four or more: 17-39% of fight sites before, 30-51% after. Stuck bots: 0 in 21 matches.
- The lines cross the middle 2.7-5.7 times a minute (all three lanes); 0-2 breaks a match, 0-4 tickets bled. 17-55% of respawns at a rally point (Favelas' long lanes the most).
- Quiet seconds rose on Old Port (3.5% → 8.1%; the others within 1-2 points, Neon Block and Neon Docks fell). Kills by lane are as each map's geometry made them before (the Desert's compound 75%, Crash Site's outpost 70%): the fronts move the fights along the lanes, not between them.
- Matches are shorter with 50 tickets (the kills come faster): 3.5-5.5 minutes.

### Checks
- Tests 505 (+7: `fronts.test.ts`: the line's pace and meeting point, the cap, stances with kills and their window, a break and its bleeding and its end, the need, the director's targets per lane and side, the wiring).
- `leakcheck.mjs 1 desert,docks,neonblock`: 0 alive after a forced GC. `matchstart.mjs 1 oldport,neonblock`: passed. `csscheck.mjs`: the TDM HUD 0 recalcs a second.
- `npm run build` clean.

## 45.0: the main menu, redesigned

Branch `feature/menu-design-45.0`, from `main` @ `fbc0422` (44.0).

The playtest: the menu looked generated: small labels, a translation under every word, blurbs under every mode, map and gun, DEPLOY. The brief: a designed menu, big type, simple names (PLAY, not DEPLOY), no small descriptive text.
- **Root:** the logo (Orbitron 900, FALL in the neon gradient, a bar under it) top left; PLAY huge, SETTINGS and CONTROLS big under it, a magenta dash sliding in before the one under the pointer; the callsign top right (a badge, the name edited in place); bottom right the gun in hand, its class over its name, big, and the four guns as numbered tabs. Gone: the tagline, the place line, the flavor scripts, the mode list and its blurbs, the gun's line, HEADPHONES RECOMMENDED.
- **PLAY:** BACK and the modes as tabs along the top (TEAM DEATHMATCH, SURVIVAL, STORY; the picked one underlined); the picked map's name huge over the live map with its team size on a slab; a strip of tiles (`MapCard.mapTileHtml`: the painted art and the name, nothing else; the picked one lifted in a magenta frame); a PLAY slab the strip's height. PLAY on the root opens the last mode picked (Team Deathmatch the first time). DEPLOY is PLAY (`data-act="deploy"` kept for the scripts).
- **Controls:** the title big, the keys as caps, two pairs a row, one word or two an action.
- **Settings and pause:** two columns: the title and RESUME / RESTART / MAIN MENU (or BACK) on the left; AUDIO and GRAPHICS as label and value rows on the right (presets LOW / MEDIUM / HIGH). No flavor lines, notes or footer.
- **Result screens:** VICTORY / DEFEAT / FLATLINED in the same type; the score with the match time; NEXT MATCH as the menu's tiles (REMATCH tagged); MAIN MENU as a back link; the survival death screen's four numbers big and PLAY AGAIN. The 24.0 map card (its watermark, flavor line, blurb, modes) is gone.
- **The stage:** the gun shown side on (it turned end-on half the time: a dark stub), swaying ±30°, bigger, on a dark hexagonal plinth with a lit edge (the crate's stencils fought the type); the cyan rim's hot spot on the glossy top gone (matte plinth, the rim raised).
- Hovers move transform and opacity (and a colour once): csscheck's menus as at 44.0 (root 0.4 recalcs a second with the logo's glitch off, a hovered button 0.4, a hovered tile 0.8). uicheck at 1280×720 to 3840×2160: no spill, smallest menu text 12 px at 720p (the result screen's spill at 720p, the old MAIN MENU button, gone). stagecheck and leakcheck: 0 alive after a forced GC. Tests 506.

## 46.0: firearms only, the Desert's flank houses, the compass, a random first spawn

Branch `feature/desert-houses-46.0`, from `main` @ `8596c0a` (45.0).

### No laser guns
Every round is a bullet, the player's and every bot's, on every map: `Ballistic` is `'kinetic'` alone. Gone: the energy bolts (a glowing core with a trail and a light), the plasma pistol's zap and report, the SMG's energy zap, the plasma whiz and impact, the corporate finish's cyan bolts. The pistol and the SMG fire warm tracers (were cyan and magenta), eject brass, and sound like firearms; the neon finishes stay a look. Survival's synths fire rifles too.

### The Desert's flank houses (`src/levels/desert/Houses.ts`; `HOUSES` in ArenaLayout)
The playtest: the main flanks were open sand with a few low walls. On each main flank now:
- **The Block** (where the pump house stood): three storeys and a walkable roof behind a parapet, 20 × 24 m, mirror-symmetric (each team comes at it from its own end). A stairwell at each end (switchback: bay A to floor 1 and on to the roof, bay B to floor 2), the end rooms behind a wall with two doors, a hall round an atrium open through floors 1 and 2 (railed: rounds and sight pass), the east rooms towards the compound, windows all round, counters and crates for cover, tanks and units on the roof, a warm lamp a floor (pooled lights). Doors: each end (the end room, the nook under the landing), each long side.
- **A house** on each team's half of each main flank (the hamlet's second hut, and in the wadi): two storeys and a roof, doors towards home, towards the Block and towards the compound.
- Built by one generic builder from a spec (levels, stair bays, holes, interior walls with doorways, props, nodes, doors, lamps): slabs with their holes (`rectMinus`), facades a storey at a time with openings, cornices, the parapet; each stair run an invisible ramp with treads over it and a stepped fill under it; railings solid to bodies, open to rounds.
- Each stands on a flat pad (Terrain: a flank's pads share its Block's height; blended over 11 m). The main flank lanes run through the Block door to door. The 6.0 pump houses, the hamlet's R2 and R3, a wadi berm and rock are gone or moved.
- **No storm inside:** the houses are interiors (the dust masked in them, MAX_ROOMS 10 → 20); the picture's fog thins to 20% round a player indoors; the AI keeps the weather's own density (`EnemyCtx.weatherFog`), and two under a roof see each other whatever the storm (`EnemyCtx.sheltered`, `Sensing.shelter`; their aim isn't fogged either).
- **Self-play** (Desert, 4 matches each, 45.0 → 46.0): the Block 8% of bot time and 64 of 469 kills (13.6%), 47 of them inside it (killer and victim); the flanks' share of kills west 19%, east 16% (about 10% and 15%); kills a minute 32.7 → 30.6, quiet 3.4% → 5.6%, stuck 0. The houses: 5.5% of bot time, 3 kills (they sit behind each team's line: a flank pushed in reaches them).
- **Checks:** the graph: every house node reachable (1157 of 1158; the one left over is the compound's, as before). `stress` 32,000 runs: 0 in the houses (2 on a 6 cm collider on the barracks roof: the checker's thin-wall test, the class the houses' railings were thickened to 10 cm for). `world`: only drops over 10 m off the Block's parapet (fall damage: the roof is 10.2 m up). `stairGaps` clean (treads inset 2 cm from the bays' walls). levelAI: the survival runners stall near the top of the runs to the roofs (they make for a target in sight over the railings); the arena bots don't (0 stuck).

### The compass and the lanes on the minimap
Under the score a compass: the heading's ticks, N/E/S/W, and a marker for each lane's front (its name and distance, in the colour of the side pushing there; his own lane lit). A front behind him is pinned to the side to turn to. On the minimap each front's dash carries its lane's letter.

### A random first spawn
The opening dealt the team's members in order, him first: zone A, the same flank every match. Now in a shuffled order (zones and the 27.0 pads alike).

### Checks
- Tests 513 (+7: `houses.test.ts`).

## 47.0: Neon Block's flanks bent, its roofs filled

Branch `feature/neonblock-flanks-47.0`, from `main` @ `644aa3f` (46.0).

The playtest: the flank alleys ran straight from spawn to spawn, and the roofs were open decks shot through end to end.

### The alleys (street level)
- **Lantern Alley (west): the pachinko parlour** (パチンコ, z 26–32 each half): a lit hall across the alley, doors at both ends, a row of machines along the wall and an island in the middle; the lane goes in one door, round the island, out the other.
- **Service Alley (east): the konbini** (コンビニ, z 12.8–20) across the alley's mouth (doors at both ends and one into the yard; a shelf and an island), and **the ramen-ya** (ラーメン屋, z 32.5–39) jutting from the east wall (a counter to vault, doors north, south, west). The lane bends past one into the other.
- A crate, the crate stack, a dumpster and an AC stack moved or gone to keep the alleys 1.3 m clear round the rooms. The Transit Rail's drop and Block E's parapet gap land south of the konbini; the fire escape's landing drops onto the parlour's roof and off its north edge.
- Each room is a zone of its own (PACHINKO, KONBINI, RAMEN-YA) and a rain shelter.

### The roofs
- **Block W:** a machine room on the roof (機械室: two doors, a motor block inside), two ducts to vault, billboards across the roof and over the street parapet, stair heads at both ends of the crossing.
- **Block E:** billboards across both roofs, stair heads at the ends.
- Billboards are solid panels with a lit face each side: cover to stand behind, not walls to see through.

### Sightlines (pairs 30 m+ apart in sight of each other, 46.0 → 47.0)
West alley 23.9% → 7.5% (end to end 14.2% → 0.3%); east alley 54.4% → 8% (28% → 1.4%); Block W's roof 91% → 15.8% (end to end 87.4% → 9%); Block E's roofs 96.2% → 24.4%; roof W to roof E 45.7% → 24.9%.

### Self-play (Neon Block, 4 matches each, before the stair heads)
Kills a minute 19.2 → 18.4; quiet 11.2% → 12.9%; first engagement 13.3 → 12.1 s; the east lane's share of kills 16% → 19%; stuck 0.

### The compass
Two fronts' markers closer than 6.2 rem now sit in two rows (were on top of each other); a marker pinned to the edge stays inside the strip; a heading of NaN no longer draws every marker.

### Checks
- The graph: 630 of 630 nodes reachable. levelAI: runners 312/312, gunners 8/8. `world` 0 issues; `stairGaps` clean; `stress` 32,000 runs: 1 (a jump into the skybridge's canopy, 2.4 m over the deck: as before).
- Tests 516 (+3: `neonblock47.test.ts`: the rooms' zones on both halves, the low lanes clear of the rooms, the spawn zones clear of them).

## 48.0: a random team

Branch `feature/random-team-48.0`, from `main` @ `8c1f4e9` (47.0).

The playtest: he was always ALPHA (the same half of every map, the same spawns, the same way in). Now every match (a rematch too) deals him a team at random (`TDM.side`: 'random', or a team fixed; self-play stays ALPHA).
- **The match:** `TdmRules.side` (and `foe`) wherever ALPHA meant his team: the roster leaves the place in his team, the opening and every respawn in his team's zones (OMEGA's yard facing +z), his allies and hostiles, the fronts' member, his sector, spotting, the shot the other team hears, the board, who is standing, spectating his teammates, VICTORY / DEFEAT and the banners (`OMEGA ELIMINATED` or `ALPHA ELIMINATED`, `… BLEEDS TICKETS`, `… PUSHED BACK`). `PlayerUnit.team` and `Projectiles.playerTeam` follow it (his rounds pass his teammates, theirs pass him); survival puts him back on ALPHA.
- **The HUD is his side's:** his team on the score's left (its name, 味方), the other on the right, the board's head, the sudden-death line, the fronts' bars from his side, the compass's push marks, the kill feed. Each team keeps its colour (ALPHA blue, OMEGA red): `.tdm-hud.side-o` swaps the HUD's colour tokens. The minimap: his teammates in his team's colour, the spotted in the other's. The callsign shows his team. The result screen stays ALPHA | OMEGA, his row marked.
- **Checks:** OMEGA on Neon Block and Favelas, ALPHA on the Desert (60-75 s each, god mode): he starts in his own zone (0-1.7 m from its centre, 88-107 m from the other team's), his board only his team, no friendly damage, the match runs (7-11 kills). 12 starts on Old Port: 8 ALPHA, 4 OMEGA, each in his team's zone. The dev checks that place him (friendly fire and the rest) pin ALPHA. Tests 516.

## 49.0: Neon Docks reworked

Branch `feature/docks-rework-49.0`, from `main` @ `700b659` (48.0).

The playtest: the warehouse floor empty and dull; the long stairs beside it dull, and none of them led in; on the flanks a straight corridor from spawn to spawn, shot through at once, and raised walks that saw everything.

### The warehouse (centre)
- A two-high container 5 m inside each main door (the door-to-door axis closed); two pallet racks (3 m, uprights, shelves and goods) across the floor from opposite walls, under the catwalks too (z ±9 from the west wall, z ±3.6 from the east); the foreman's office under the bridge (between its columns, up to its underside; two doors on each long side at x ±3, cabinets); crates to vault. The floor is now a zig-zag between the doors.
- **Stair towers** at the quay corners (`TOWER`), in place of the catwalk door's exterior stair and the gantry's 13 m end stairs: a flight from the quay up to a landing at catwalk height with a **door into the warehouse** (the catwalk, z ±24), a drop off its south edge, and a flight on up to the gantry.

### The east flank
- The quay gantry cut to z ±22; at its middle the **crane cab** (`CAB`, the nest roofed): a door at each end by the west wall, a column between, closed on the quay. Under the gantry's middle a block (its underside ran 44 m along the wall).
- The crane stair in two flights (`CRANE_STAIR`): down to a mid landing over the quay (3.25 m), then east down to it (was one 13 m run).
- The quay's walls (`QUAY_WALLS`): two-high container rows across it, the first from the tower east (open by the water), the second from the water west (open past the crane stair), a two-high stack under the crane: the waterfront zig-zags. A lamp mast moved off the first wall.
- The barges: cargo across each deck from alternate rails (`BARGES.cargo`); handrails on the gangways. The quay ends at its fence (a metre of kerb outside it, reached from the gangways, ran the whole waterfront; bots walked it into stalls).

### The west flank
- The container gantry (a 70 m walk at 2.6 m down the maze) is gone. The maze is **brick-bond**: rows 1 and 3 half a cell west (`MAZE.shift`), so every corridor along z ends at a container a row on (x -45, -37 and -29 ran from forecourt to forecourt). Its stair onto a container moved with its row.
- The maze's east alley closed at z ±24, the warehouse alley at the middle; the depot's east corridor closed at z ±20 (a two-high pair from its cross piece to the maze); the stack in front of the sniper stack a third container high: the perch keeps its own half.

### Sightlines (pairs in sight of each other, 48.0 → 49.0)
Maze 30 m+ apart 3.3% → 0.4% (60 m+ 2.2% → 0); depot 8.4% → 1% (5.9% → 0); the quay 61.7% → 0.5% (53.6% → 0); the barges 79.3% → 0.8% (71.3% → 0); the warehouse floor 20 m+ 89.9% → 2.8% (40 m+ 79.6% → 0); the gantry down its length 100% → 2.3%, onto the quay 24.9% → 3.1%; the sniper stack onto the west 36.7% → 21.3%.

### Self-play (Neon Docks, 4 matches each, 48.0 → 49.0)
Kills a minute 25.2 → 23.4; quiet 6.5% → 7.7%; first engagement 9.7 → 9.2 s; kill range median 11.2 → 9.1 m, p90 28.9 → 23 m; kills by lane containers / warehouse / waterfront 22/54/24% → 32/45/23%; the old depot 9 → 44 kills, the catwalks 36 → 77, the alpha forecourt (outside its spawn) 49 → 27; the barges 0.8% → 3.1% of bot time, the gantry 17.6% → 10.1%; the sniper stack 0 → 6.6% of bot time (anchors hold it; 14 kills from it); stuck 0.

### Checks
- The graph: 811 of 811 nodes reachable, no lane waypoint blocked. levelAI: runners 176/176 (48.0: 144/160, the gantry's), gunners 8/8. `stairGaps` clean. `world`: the same report as 48.0. `stress` 32,000 runs: 51, all from the top of a barge's rail (48.0: 7,774, almost all the checker's "left the playable extent").
- Tests 521 (+5: the maze's brick bond, the quay's walls, the floor, the barges, the cab and the depot wall).

## 50.0: the Desert's houses tamed, the bots made a match for him

Branch `feature/desert-balance-50.0`, from `main` @ `5d46f06` (49.0).

The playtest: up on the houses (the roofs, the windows) he shot the whole map; the open ground off the middle; the houses' floors flickered; the bots were easy (he carried his team, 20 kills and more).

### The houses
- **No roofs to climb** (the Block's 10.2 m roof, the houses' 6.6 m): the stairs stop at the top floor.
- **Fewer windows**, the top floors' slits: the Block's upper floors 8 windows a floor at each end → 3 on the first floor, 2 slits (0.7 × 0.6 m) on the second; the houses' upper floor 5 → 3 slits. **Bars across every window** (rounds and sight through, nobody: a jump squeezed a body out through a slit).
- Field of fire (share of the field 25–100 m away in sight, the best spot / the mean): the Block's roof 59.6% / 11.4% and the houses' 49.1% / 29.9% (gone); the Block's upper floors 20.1% / 3% → 14% / 0.5%; the houses' 26.4% / 5.3% → 18.5% / 1.3%.
- **The flicker**: the ground floor lay on the pad's sand, the same plane; now 6 cm over it (and its sills), the slab cut under the first stair run.
- **Huts** (`HUT_SPEC`, `HOUSES.huts`): one storey, no roof to climb, doors at both ends off each other's line, a barred window each side; in the west field (-31, 45), by the wadi's APC (36, 44) and between the compound and the hamlet's house (-43, 30), each again rotated. Their pads blend over 7 m (`hutFall`), laid before the flank houses'; the west one on the flank's height.
- The Block's first-floor crate against the end rooms' wall (0.65 m short of it: a slot).

### The fight with the human
- **His hit**: a bot's rifle round 10 → 12.5 (`TDM.playerHit`; the other guns their share): eight hits to drop him, as his eight on a bot's body (survival keeps 10).
- **Return fire** (`ARENA.longFire`): a bot fires on, aimed, out to 1.9 × its rifle's range (pistol 1.7, SMG 1.6, never the shotgun) at a target that hit it or put a round past it in the last 3 s, or that stands 2.5 m or more over it; the cone 0.004 wider for every 10 m past the gun's range. Until now past 40 m (the SMG 26, the pistol 22) a bot only ran at him.
- **The pressure** (`ARENA.pressure`, `Pressure.ts`): his form over the last 90 s (kills less 1.5 × deaths, / 6, clamped -0.6 … 1). In form the other team reacts to him up to 30% faster, shoots him up to 35% tighter, scores him up to +2 as a target, and from 0.2 every kill of his tells the victim's team where it came from; struggling, the same eased. Self-play (he spectates) runs at 0.
- **The duel bench** (one rifleman against him standing, 12 s, calm air, 4 runs each; damage he took): on the Anvil (3.8 m up) at 45 m 0/250/0/249 → 528/579/0/532; on the sand at 30 m 256/282/511/60 → 447/388/499/522. Noisy (dunes cut some lines).

### Self-play (the Desert, 4 matches each, 49.0 → 50.0; bots alone, his pressure off)
Kills a minute 28.8 → 30.1; quiet 6.6% → 5.8%; first engagement 12.3 → 9.8 s; kill range median 13.1 → 13.1 m, p90 33.3 → 35 m; kills by lane west/compound/east 19/66/15 → 15/66/19%; the Block 7.7% → 7.9% of bot time; stuck 1 (by the east ruins' gate, away from the changes; 49.0 0).

### Checks
- The graph: 1135 of 1136 (the compound's old one). levelAI: runners 484/488 (49.0: 437/488, the roofs), gunners 8/8. `world` 0 issues (49.0: drops off the Block's roof, a stair flush with a wall). `stress` 32,000 runs: 0 (49.0: 2). `stairGaps` clean.
- Tests 524 (+3: `pressure.test.ts`; the houses' tests for four runs and the huts' pads).

## 51.0: the flank objectives

Branch `feature/flank-objectives-51.0`, from `main` @ `839f729` (50.0).

The playtest: a breakthrough on a flank won nothing a player felt; spawns everywhere from the start. Asked for: one spawn to start from, three fronts each worth taking, the team holding more of them ahead (not Battlefield's conquest: an edge), the Block as the Desert's point, a forward spawn for whoever holds a flank (near it, not on it), a double breakthrough with an alarm and a last line, and the events felt (banners, sound, "DEFEND WEST", bots reinforcing a flank being lost).

### The points (`Objectives.ts`, `ARENA.objectives`)
- One per front (the fronts' sectors: flank, centre, flank) on its midline: the map's (`TdmData.objectives`: the Desert's two Blocks, their two lower floors, and the compound's yard; the Docks' maze middle, the warehouse floor round the office, the crane cab), else where the front's first lane crosses the midline. Radius 9 m (the Blocks 11, the yard 10), 6 m up or down.
- The meter: more bodies on it move it their way, 10 s alone from neutral (+50% a body more, at most 2.5×); level numbers freeze it; nobody on it, it drifts back to its holder's (or neutral). From the other team's: through neutral, twice as long.
- **Spawns**: a team starts from its home zone only (the centre's; Maglev and Old Port, whose zones are both on the flanks, get one of the base's own spawns, 'H'); its zone on a flank opens while it holds that flank's point (dimmed on the ground and the minimap while closed). No rally points.
- **Tickets**: holding more points than the other team bleeds it one every 10 s; two or more of the three (a **double breakthrough**) every 3.3 s; all three every 2.5 s. The fronts' own breaks bleed nothing now.
- **The last line**: a team the other has its double on respawns at once (bots 0.6 s, him 1.5 s) from every one of its zones (from home alone it walked into the other's forward spawns: a match held 3-0 for five minutes).
- **The bots**: a frontliner goes for its front's point while its team doesn't hold it or is losing it (a spot of its own on it, moving between spots while it holds it), and a hunting one takes a point within 45 m first; the fronts' need pulls respawns to a point being lost (+3.5), the enemy's (+2.5), a neutral one (+1.5); the opening spreads each team over the three fronts by that need (it opened with all of them in the centre lanes).
- A spot by a lane waypoint or a point is checked for room and a floor on its level (a 1.6 m spread put spots in an alley's wall and in the air beside the crane cab: stuck bots).

### Felt
- **HUD**: a flag before each lane's bar (its holder's colour, filling with the meter; his point being taken pulses red); the alarm under the score while a double breakthrough lasts ("DOUBLE BREAKTHROUGH · THEIR TICKETS DRAIN ×3" / "TWO FLANKS LOST · LAST LINE"); the compass's front marks are the points ("DEFEND WEST" pulsing red while his is being taken); the minimap draws each point (a disc in its holder's colour, the meter round it, the lane's letter) and the zones open or closed.
- **Banners and sound**: a point taken ("WEST CAPTURED · SPAWN ZONE ONLINE", a rising arpeggio), lost ("WEST LOST · TAKE IT BACK", a falling third), the double breakthrough either way (a horn for the losing side); notices for the other team's.
- **Beacons** (`ObjectiveVisual`): a beam of light in the holder's colour (white: nobody's) from over the point's roofs, a ring on the ground its radius round, both pulsing in the colour of whoever is taking it.

### Self-play (bots alone; objectives on)
- The Desert (4): winners 3 ALPHA, 1 OMEGA; captures 5–6 a match; the double breakthrough held by both sides in 3 of 4; tickets bled 14–61 a match; kills a minute 18.8–30.4; 186–317 s.
- The Docks (4): winners 1 ALPHA, 3 OMEGA; captures 5–9; both sides' doubles in 3 of 4; kills a minute 15.6–23.6 (quiet 14–24%: the walk from home to the flanks); 188–359 s.
- One match each: Neon Block (10 captures), Favelas (6), Deep Jungle (3), Maglev (6), Old Port (10): every map's points change hands, both sides bleed.
- The first runs: ALPHA reached the Desert's yard 10–15 s first (the compound isn't symmetric) and won 5 of 6 with the whole team opening in the centre; spreading the opening fixed it. Stuck: 0–1 a match (the last, on Neon Block, one bot by its home zone on the way to the centre's point on the middle level, at 16 s).

### Checks
- Tests 529 (+5: `objectives.test.ts`: the meter, through neutral, the drift, the bleed rates and the last line, the need).

## 52.0: the menu's freezes gone, the loads cut

Branch `feature/perf-menu-52.0`, from `main` @ `7d75401` (51.0).

The playtest: freezes on the menu (each map clicked froze it), freezes in the first moments of play, slow loads.

### Measured first (`scripts/perfprobe.mjs`, headless Chrome on the GPU: the boot, the root menu idle, each map picked, PLAY to the intro, the intro, the first seconds of play with him walking, turning and firing)
- 51.0: each map picked on the maps screen built it: a main-thread task of 56–689 ms (Deep Jungle 689, the Desert 478, Neon Block 401) and 1–2.5 s of loading. The root menu idle, the intro and play clean on this machine (no frame over 33 ms), but play allocated 22–28 MB/s (50–92 collections in 20 s) and spent 15% of the main thread in script: the stalls a slower machine feels.

### The maps screen (no build on a pick)
- A pick builds nothing: the screen shows the map's **picture** (`public/maps/<id>.webp`, 1920×1080, 100–320 KB, rendered by `scripts/mapshots.mjs` from each map's own title camera); PLAY builds the map if it isn't the one loaded (behind the loading screen) and goes in. Nothing 3D runs or draws while the maps screen is up.
- The layout: the picture over the whole screen (cross-fading on a pick, every picture fetched and decoded when the screen opens), a dark panel on the left with BACK and the modes, a grid of the maps (their pictures), PLAY at its foot (big, a shine sweeping across it, the map's name under it), the map's name huge on the right. The result screens' next-map tiles show the pictures too.
- The menu draws at 60 (was 30: the stage's swaying gun at 30 on a 60–120 Hz screen read as stutter).

### Loads
- **The nav graph's links, the vault links and the cover spots cached** in the browser (IndexedDB, `core/NavCache.ts`), each under a fingerprint of everything it was computed from (every collider, the holes, the terrain on a grid, the hand graph, `ALGO` for the code): a changed map is a miss and computes fresh; no IndexedDB, a miss. Checked: the cached graph equals a fresh one on six maps.
- **The graph's build**: whether each node stands on the terrain asked once a node (it was asked for every pair of nodes: half a million terrain samples on Deep Jungle) and the distance tested before any ray or floor sample: the same links. Deep Jungle's terrain: the distance to the tunnels skipped beyond the distance its callers care about (a box round them first).
- Load times (PLAY on a map not loaded, to the intro; the first time, no cache / again): Deep Jungle 2.8 s (the pick and the deploy) → 0.76 s / ~0.4 s; the Desert 1.1 s → 0.9 s / 0.37 s; the Docks 1.1 s → 0.48 s / 0.38 s.

### Play
- **Transparent double-sided materials drawn in one pass** (`forceSinglePass`, set at every warm-up): three.js drew them twice and marked them changed every frame (their programs looked up and parameters rebuilt: the spawn zones' rings, the objectives' beacons, the halos).
- **The terrain under a ray**: a bound per 1 m cell (the highest corner + 0.6 m, built lazily 16 × 16 cells at a time): a ray over its cell's bound skips the height function (an 80 m sight line over the dunes sampled it a hundred times). The same crossings (`terrainbound.test.ts`: 3,000 rays on three terrains).
- **The bots' routes** ranked in reused typed arrays (an object a node a route before) and their search's relax made once per search (a closure a node before): the same routes (levelAI on the Desert: runners 485/488, 50.0 484).
- Play (the Desert, 20 s, him walking and firing): 27.9 → 22.9 MB/s allocated, 92 → 51 collections, script 2.92 → 2.47 s; the Docks 22.5 → 16.7 MB/s, 50 → 34.

### Checks
- `perfprobe` (the Desert, Deep Jungle, Favelas): map picks' longest task 0 ms (51.0: up to 689), PLAY to the intro 0.27–0.76 s, no frame over 25 ms in the intro or play, no program compiled in play. `uicheck` clean at 1440×900 to 3840×2160. `leakcheck` (the Desert, the Docks, Neon Block): 0 of 24 left-level objects alive.
- Tests 530 (+1: `terrainbound.test.ts`; the menu's and the frame cap's updated).

## 53.0: Neon Block's footbridge broken up, its roofs filled, the glare gone

Branch `feature/neonblock-roofs-53.0`, from `main` @ `64c1c5f` (52.0).

The playtest: the footbridge over Main Street (straight, 31 m) shot end to end; open ground left on the roofs; the roofs' puddles blinding "like the sun in my face".

### The footbridge
- Two lit ad panels across it each half (2.2 m, from alternate rails: z ±5 from the west rail to x 0.4, z ±10.6 from x -0.4 to the east rail): 1.5 m past each, and no line down its length, straight or corner to corner. Its lane's waypoints and the graph's nodes run between them. The centre's objective stands on it: the fight there is round the panels now.
- Sight lines on its deck (pairs 10 m+ / 20 m+ apart in sight): 100% / 100% → 9.4% / 0.2%.

### The roofs
- Block W: a booth (2.2 × 2.2 × 2.6, a sign on top) on each open strip along the parapets (east z ±20, west z ±30), a sign across the east strip (z ±39.5); Block E1: a booth on its east strip (z ±19). Sight lines: Block W's roof 30 m+ 16.4% → 10.3% (end to end 9.7% → 5%), Block E's 24.4% → 19%, roof to roof 24.9% → 22.2%.

### The glare
- Not a mirror's (the reflection streaks and catchers off, it stayed): the street's lamps stand 7 m up at the roofs' edges, a metre or two over Block E's roofs and level with Block W's, and their pools of light there were about ten times the street's. The roofs' deck now takes direct light under a soft ceiling (`applyWet` `lightCap`: untouched below it, rolled off above; and its puddles a little rough, `puddleRough`): a warm patch, not a blinding one.

### The bots
- A spot by a point or a lane waypoint is also inside the map and in sight of it (by the east point one fell behind the boundary's facade, on open ground no route reaches: a bot stood in its base).

### Checks
- The graph 649/649; levelAI runners 312/312, gunners 8/8; `world` 0; `stairGaps` clean; `stress` 32,000 runs: 1 (the skybridge's canopy, as before). Self-play (4): the footbridge 27–31 kills a match (the objective on it), stuck 0 after the fix (1 before).
- Tests 530.

## 54.0: the bots harder, their endgame and their snipers fixed, the racks shot through

Branch `feature/bots-endgame-54.0`, from `main` @ `876dfd6` (53.0).

The playtest: the Desert too easy, the bots in general not a fight you have to carry; a team on 0 tickets "goes dumb and moves as a crowd"; snipers that take a post and never leave it; on Neon Docks the racks' open space between the boxes doesn't take a round.

### The last stand off
- The 29.0 last stand (a team on 0 tickets gathers at its centre, crouches, holds, no flanks) is off (`ARENA.lastStand.on: false`): it was the crowd. Such a team now plays as before it ran out: roles, lanes, flanks, the points; the sudden-death clock and the elimination stay. The switch is kept (the tests still A/B it).

### The snipers move
- An anchor at its post moves on to another free post (`ArenaDirector.reseat`; none free: it turns frontliner) after 30–45 s there (`roles.anchorStay`), after 15 s with nothing in sight (`anchorIdle`), or 2.5 s after a kill from it (`anchorKillMove`: its post is known now). Self-play: 16–29 moves a match on the Docks, 2–5 on the Desert (shorter lives there).

### Harder
- All maps: reactions 0.17 → 0.15 s (±0.045 → 0.04), hip spread 0.025 → 0.022, aimed spread 0.006 → 0.0052, the time to settle the aim 0.24–0.45 → 0.2–0.4 s; a rifle round to the player 12.5 → 13.5 (`TDM.playerHit`).
- The Desert: its storm handicapped the bots more than the player (reactions ×1.5, spread +0.06 in the dust): ×0.8 / +0.035 (`DESERT_AI.fogReact`, `fogSpread`).

### Neon Docks' racks
- A rack's box stops bodies only; rounds and sight are stopped by the uprights, the shelves and each box of goods (their own colliders, as drawn), so the gaps between the goods and over the upper boxes are open. Rays across a rack at 1.3–2.5 m: 22% go through (0 before); a body still can't walk through.

### Checks
- Neon Docks: graph 811/811, levelAI runners 176/176, gunners 8/8, `world` 0, `stairGaps` clean, `stress` 51/32,000 (the barges' rail, as before).
- Self-play (3 each): Docks kpm 16.9–19.8 (51.0: 16.1–17.9), Desert 29–30.1, stuck 0 in all six.
- Tests 530.

## 54.1: the weapon swap's freeze gone

Branch `feature/docks-freezes-54.1`, from `main` @ `f19987b` (54.0).

The playtest: on Neon Docks "lots of freezes", at the spawn's weapon swap above all.

### The cause
- A swap built the gun from scratch (geometry, materials, the flash's texture): 18–27 ms of main thread a swap. And it freed the last gun first: its materials were the only users of their programs, so the programs went with them and the next swap compiled them again: a 250 ms freeze in a cold browser (the first swaps of a session; Chrome's shader cache hid it later). It hit every swap at the spawn, and every respawn with another gun queued.

### The fix
- The viewmodel keeps every gun it has built in the map's finish (`Weapon.built`): a swap puts the gun in hand aside and re-parents the next one (its magazine's rest, its flash, the strips' colour, the ammo); a new finish (another map's) frees them all.
- The loading builds all four guns of the armory and compiles their programs (`Weapon.prewarm` in `Game.warm`): no swap in a match builds or compiles anything.

### Checks
- Docks (GPU, 1728×1080 at 2x, High): a swap's frame 18–27 ms → ≤ 6 ms, no program built or freed by a swap (4 guns × 3 rounds, the same model each time: parts, magazine, flashes); 60 s of play with fast flicks across the map: no frame over 25 ms, no long task, no program compiled mid-match (`hitchprobe` docks, desert 60 s: none). Load 266 ms (52.0: 480 ms).
- `leakcheck` 2 laps: 0 alive, geometries and textures flat from the second lap (the four guns: +24 geometries on the Desert).
- Tests 530.

## Next
Human playtest:
- 54.1 items: the weapon swap at the spawn (no freeze, the first time too); any freeze left on the Docks (where, doing what).
- 54.0 items: the bots (hard enough now, everywhere, on the Desert; a team on 0 tickets: does it still fight, or fold too easily now; the snipers: do they move often enough, too often); the Docks' racks (shooting through the gaps).
- 53.0 items: Neon Block (the footbridge's panels: a better fight or just in the way; the roofs' booths and signs; the roofs' light: no glare left, still readable at night?).
- 52.0 items: the menu (any freeze left on the root menu, a pick, PLAY; the maps screen's pictures: good enough, or worth a better shot of some maps); the first seconds of play (still a hitch? on which map); loads (the first time and again: the second should be much quicker).
- 51.0 items: the points (does taking a flank feel worth it; the spawn zone opening near it; 10 s to take one: too slow, too fast; the double breakthrough and the last line: a comeback or a stalemate; the beacons, the flags by the bars, "DEFEND WEST": readable; starting from one zone: too long a walk on the Docks?).
- 50.0 items: the bots (do they feel like a match now: too hard, too easy; do you notice them shooting back from far off, and focusing you when you're on a streak); the Block and the houses (still worth going into without the roofs; the barred slits); the huts in the field; the floors (any flicker left).
- 49.0 items: Neon Docks (the warehouse: too cramped now, or a good close fight; the stair towers: do you use the door into the catwalks; the crane cab and the crane stair's perch; the quay's zig-zag and the barges' cargo: interesting or just slower; the maze without the gantry; the sniper stack: still too strong over its own half?).
- 48.0 items: playing OMEGA (does the other end of each map feel new; the HUD in red with OMEGA on the left: readable; teammates in orange accents: any shots at your own side?).
- 47.0 items: Neon Block's alleys (do the parlour, the konbini and the ramen-ya feel like places to fight through, or doors in the way; still a spawn-to-spawn line anywhere?); the roofs (enough cover now; too cluttered; does the machine room become a camp?); the compass's two rows.
- 46.0 items: the guns as firearms on the neon maps (do the pistol and the SMG feel right without the zap?); the Block (tense indoors: the atrium, the stairwells, the doors at the ends; too dark?; the roof too strong?); the houses (worth going into?); no storm indoors; the compass (does it tell you which flank is which and where the fronts are?); a different flank at the start of each match.
- 45.0 items: the menu (does it read as designed; PLAY → the map screen → PLAY: too many steps?; the map tiles without a blurb: enough to choose; the gun on its plinth).
- 44.0 items: the loading screen (does the first minute still stutter anywhere; is the wait on DEPLOY and on a map change acceptable); the three fronts (does it feel like two sides pushing along three lanes; do you notice the lines in the score and on the minimap; is a fight always near when you respawn; are breakthroughs and their ticket bleed noticeable, too punishing, too rare; do matches end too quickly now: raise `tickets` per map); Neon Block at 7v7 (crowded in the fog?). `__dev.tdmSim({ fronts: false })`, or `ARENA.fronts.on = false` before a match, for the 43.0 bots side by side.
- 43.0 items: the ledge grab. Does it fire when you mean it (jumping at a crate, a wall, a platform edge) and never when you don't (running past a wall, jumping beside a rail)? Is the 0.2–0.3 s pull-up quick enough to feel aggressive, and the dip and roll physical or nauseating (`MANTLE.dip`, `MANTLE.roll`)? Are the new crate and container tops fun perches, or too strong against bots that can't climb after you? Is 1.75 m the right reach (`MANTLE.maxUp`)? `__dev.mantle(false)` to compare.
- 42.0 items: do you notice the three kinds of enemy (squads pushing, someone alone coming round behind you, a rifle holding a roof); the warning shot (do you hear it and turn in time, or is it a free kill for you now); are the anchors fair or a wall (Favelas' roofs, Maglev's skybridges); does the slower kill pace feel tense or slow (`ARENA.roles.share` to change the mix); hurt enemies ducking out to heal: smart or annoying; `ARENA.roles.on = false` for the 41.0 bots side by side.
- 41.0 items: does the enemy team come at you in twos and threes now, or still in a crowd; do your bots move as squads (a leader and one or two beside it) or still run off alone; does a fight elsewhere on the map still pull everyone (it shouldn't: three on one enemy at most); on the Desert, do squads leaving a spawn zone together feel like a wave; `ARENA.sectors.on = false` for a side-by-side.
- 40.0 items: Favelas (does the rooftop layer read: can you tell where you can walk; the escadaria as the midline killing ground (29% of kills): too strong a funnel?; the alleys' track changes: winding or confusing; 10v10 on a dense map: chaos?; the dust motes and the kites; the samba; the Portuguese flavor; starting low on the street vs high on the crest: fair?).
- 39.0 items: the four guns' recoil (the pistol's snap; the SMG's shake: too much, too little; pulling the rifle down in a burst: does it feel like skill or a chore; the shotgun's kick and punch: too violent?); the FOV punch (felt, or nauseating at 18 a second); does the view coming back after a burst feel natural.
- 38.0 items: 12v12 on the Desert (busy or chaotic; the team board; spawning with 23 others); the ruins (do they read as ruins; the gallery as a perch: too strong, too exposed; the corner rooms and the court as close-quarters fights); do bots out on the flanks feel like flankers, or like bots wandering away from the fight; the trench now starting at the ruins.
- 37.1 items: the bridge (do bots go up and hold it now and then; is a bot on the roof a fair threat or a free kill; the room under the hull got quieter: does it still feel used); if the room matters more than the bridge, `highGround.rise: 4.5` on Old Port (measured above).
- 37.0 items: UNDER THE HULL (does it read as a place: the lamps, the dimness, the stands; too cramped or too open; does the ceiling feel low); spawning at the dock head (fair, or a pit you get shot into from the quays?); do fights happen under the ship for you as they do for the bots.
- 36.0 items: the first frame of a match (does the flight land cleanly in your eyes on every map; anything jarring in the last second of it); the countdown (3 s: long enough to pick a gun, too long?; readable on every map?); do the bots' poses during it look natural; the start itself (does everyone go at once, any unfair first shot).
- 35.0 items: flank a bot on Maglev (by their zones, through the glass halls): does it turn on you now when you shoot it in the back or side, or when you fire close; does it feel fair or psychic (a silent player within 8 m behind is noticed); do bots still feel focused in a fight (not turning to every shot); the glances on the way out of their half (natural, or twitchy?).
- 34.0 items: Neon Block's smog (does looking down from a roof feel blinding, or just murky; is about 11 m in the street too short; do the glows read as smog or as blur); do the bots feel fair in it (seen late when half hidden: does it match what you can see); the Lantern Bridge and the Transit Rail (do you find them, do the rail gaps work as drop-downs, the car as cover); the Lantern Market (does it play as a close-quarters room; the holograms: charming or noise); are the roofs now too strong (most of the long fights went up there).
- 33.1 items: the ravine's end ramps (do you walk out at the ends without catching on anything; do the taller rims along them read as walls).
- 33.0 items: Deep Jungle's outpost (does the lab on stilts read as a place; the roof: too strong a perch?), the tunnels (do you find and use them; the pits and the ravine mouths; too dark?), the plants (can you see enemies now, is it still a jungle), the overgrown containers, do bots still run into walls.
- 32.0 items: Neon Docks' new palette (easier on the eyes, or too dull now?), the rain (still atmospheric?), the roofed warehouse (a fortress again?), 9v9 (busy or chaotic; can you read the team board), the forward zone B (spawning near the fight: fair?), do the bots still bunch up where you play.
- 31.0 items: the deployment zones (can you tell your zones from theirs at a glance; do the letters help you call "they're at B"; is the walk from home too long now (bots' pace fell on most maps); does any zone feel camped); the five themes (the dust, the vines, the stripes, the glass: charming or noisy; is the beam distracting); `TDM.spawns = 'dynamic'` for the 30.0 pads side by side.
- 30.0 items: the stamina (does a 3.5 s rifle sprint feel punishing or right; the pistol as the mobile gun; the forced walk at 0: frustrating?); the bar under the crosshair (noticed? in the way?); do bots feel less frantic, or too slow?
- 29.0 items: the last stand from your side (being the last man; does the clock feel fair or cruel; is 60 s the right length; 30 s of holding before the push); spectating (does following a bot's eye make you sick: the snap turns are damped, is it enough; would a shoulder camera be better); does the ticket race decide too much (the team out first lost 10 of 12 in self-play).
- 28.0 items: the Desert's outer flanks (does the trench feel like a route or a trap; the Anvil and the Spine as perches: too strong in calm air?); the storm (is spawning in the dunes in a storm fair; should calm last longer so the outer perches matter?); Neon Docks' depot (dead ends: fun or annoying) and the barges (does anyone go out on the water; falling in).
- 27.0 items: the spawn pads (do you notice them, does the flash read as "someone just spawned there"; is spawning next to a teammate good or confusing); spawn safety in your own play (killed right after spawning? spawned looking at a wall?); do matches feel like they happen all over the map, or aimless (bots wandering); Maglev's train still a shotgun lane?
- 26.0 items: the three-corner HUD (is the team board in the way top left, is the score readable at a glance, does your gold row help); the reloads with headphones (does the pistol sound like a pistol, the SMG zip, the rifle's weight, the shotgun's shells and pump; is any too loud against the gunshots).
- 25.0 items: Neon Block's fog (does it read as fog or as darkness; is 13 m too short for the street, too long; do the roofs feel like the place to snipe from); the new jungle and desert music (listen: no more siren? does the desert sound Arabic, or like a cliché?).
- 24.0 items: is the text the right size on your monitor (too big at 4K?), do the map cards read at a glance, is the live scoreboard in the way of the kill feed, does your gold kill row feel rewarding or noisy.
- 23.0 items: Old Port (is it still sniped from end to end anywhere; does the spine read as a maze you go through or over; are the dock scaffolds in the way or good cover; is 7v7 too busy for the warehouse); the spawn swap (is 12 m the right size; is the prompt noticed; does closing on a shot feel right).
- 22.0 items: can you tell friend from foe at a glance on Maglev now (the ice-blue and sand blocks, the chevrons); do the bots look like they hold their guns (the hands, the bladed stance, the aimed hold); the new silhouettes at 20–40 m.
- 21.0 items: the four guns (does the pistol feel like a mobility gun or a peashooter; is the SMG's climb fun or annoying; does one shotgun shell feel fair to die to; is the rifle's wide hip fire too punishing), the finishes (the white Maglev guns in the bright hall, camo on the military maps), the sounds (the shotgun's cannon, the SMG's buzz).
- 20.0 items: Maglev Terminal (is it still a sniper gallery anywhere; are the white operators fair to find or too hidden; do the platforms' chicanes give mid-range fights; does the zig-zag train still play as the shotgun lane); the bots (do they really dive for cover when you snipe them, or just jitter).
- 19.0 items: Crash Site at 7v7 (is it constant action or chaos; do forward respawns feel fair or like spawning into fights; the undercroft, the hull and the shrine: do the three levels read; is the undergrowth too thick to see bots through), the jungle bots (do shotgun and SMG bots really come at you from cover).
- 18.0 items: Maglev Terminal (does the train feel like a shotgun lane or a death trap, are the cab doors too strong as the straight way, do the platforms' duels work past the kiosks and columns, is the white too bright or flat, the glass), the terminal ambience.
- 17.1 items: Old Port (is the daylight pleasant or flat, is the warehouse's inside bright enough, do the stacks and the ship's bridge pay off, is the yard too open), the random name on a first visit.
- 17.0 items: does the machine stay cool (fans, temperature) in a Neon Block match and on the pause menu; does Neon Block still look right with its lights pooled (any light popping when you turn?); is the menu stage still crisp enough at 1.0×.
- 16.0 items: the menu stage (is the gun readable, does the camera drift too much), the glitch and hover sounds (charming or tiring), Rajdhani at small sizes, the flavor scripts (do Arabic and Thai read as flavor or as noise, is the Cyrillic stencil look right for the docks).
- 15.0 items: Crash Site (does the ridge pay for its exposure, is the ravine too dark, do the trenches read, the wreck's interior); the docks rework (does the roofless warehouse feel like a risk, do the gantries and the crane nest matter, do side exits feel natural).
- 14.0 items: Neon Block in a full match: do the three levels pay off (roofs, landings, the footbridge), are the drop-downs readable and fun, is any spot too dark or too bright, is the koban too big; the operator skins: can you find a bot in the alleys at 20–40 m, do cyan and orange read as teams at a glance, do the accents feel like a giveaway.
- 13.0 items: the mode-first menu and the name field; picking a gun over the intro and on the respawn timer (is 3 s in the spawn yard enough?); do shotgun bots rushing and rifle bots hanging back read as different players; is the Kitsune too strong as an SMG (27 per bolt against bots); going straight to the next map after a match.
- 12.0 items: the slide's length and speed (1.2 s, 6 m), sliding into a firefight with ADS, the minimap (does a fading red dot feel fair or like a wallhack), do the bots' flanks and retreats read as players, is the storm-heavy desert fun or exhausting, the rooftop and culvert routes.
- 11.0 items: ADS feel (the 0.2 s raise, the zoom per weapon, the red dot, recoil with the sights up), crouch (toggle vs hold, speed), can you read a bot raising its rifle at 20–40 m and does that warning feel fair, is the desert's 35–40 m fighting fun, are the jungle fights too slow.
- 9.1: the warehouse stairs (and every stair beside a wall) from all angles: any flicker left?
- 9.0 items: the five themes (does the menu theme set the tone, is the docks bass too heavy, does the jungle groove fit), the crossfades between menu and levels, dropping in a real .mp3; jungle TDM: are LZ North and LZ Alpha fair, are the culvert and the east breach worth taking, is the fog too thick to fight in.
- 8.1 items: is the docks bright enough now (and still moody), do the kinetic tracers and brass feel right, is TDM fair without callouts, do bots in a sandstorm ever shoot you before you can see them, is 70 m/s too lethal.
- 8.0 items: Neon Docks in TDM: does each lane have a purpose (stacks close, warehouse mid, quay long), do the catwalks pay off, can you call out "red stacks", is the quay too open, is it bright enough, is a match the right length without the blades.
- 7.0 items (played: snap + spread felt great; blades fed tickets → removed from TDM in 8.0): a full TDM match against the arena bots: do they feel fast and ruthless or unfair (the first rounds go wide for a third of a second; is that enough?); do the jumps and vaults look natural; does a wounded enemy getting rushed read; do your allies help or just run off; is the match length (about 2–3 minutes bot-only) right; `TDM.ai = 'tactical'` for a side-by-side.
- 6.0 items: a full TDM match: do Maxim, Anatoly, Kostya and Ilya help, do they flank when you lay down fire and cover you when you push or fall back, is the respawn pace right, does either base feel favoured, are the name tags readable, are the blades too strong.
- 5.0 items: do the enemies read as a squad (suppress, flank, rush together), is cover-flanking satisfying, do callouts help or nag, are staged rushers too passive, is the jungle undergrowth fair, does losing them and being searched for work.
- 4.2 items: is the jungle oppressive or just dark? Are the shafts cinematic or too strong up close? Does the mud read as wet in motion? Is the fog too thick for spotting enemies?
- 4.1 items: is High now steady, the desert's harshness (too bleached?), the sun glare and glints, the heat haze in motion (too subtle or too much?), storms with the new grade.
- 4.0 items: does the teal/orange read as cinematic or as a filter, is the bloom too tight now, do the puddle reflections and the street AO read in motion, F8 side by side; and the frame rate with the charger in.
- 3.7 items: does the road pull you to the gate, is the cleared strip a fair kill zone, do defenders out of the barracks feel like a garrison, are the guards readable in the mist, the doorways and stairs by feel, the watchtower and comms roof as positions.
- 3.6 items: the shotgun's feel (kick, pump timing, the boom), whether 8 m one-shot range feels right, hunters' readability in the undergrowth and mist, the climbable logs, the dappled light, the jungle soundscape.
- 3.5 items: the rifle's feel (recoil, rate, sound), whether the mercenaries read well at a distance and in the storm, the clutter as cover, quitting to the menu and starting again.
Earlier items:
- 3.4 items: the setting menu, the desert in calm and in the storm (can you hear them coming?), the buildings' doors and stairs, whether the storm feels fair, and the performance on your machine.
Earlier items:
- 3.2 items: does the machine run cooler, is the story clear, do the objectives and markers help, is X comfortable, does the ending land;
- 3.3 items: jumping inside the train and riding it, boarding at an angle, standing in a doorway as the doors close, the rooftop edges and the fence, the metro stairs (look and feel), and any wall that seems invisible (note the coordinates from `__game.debug()`).
