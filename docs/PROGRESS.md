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

## Next
Human playtest:
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
