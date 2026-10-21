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

## Next
Human playtest:
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
