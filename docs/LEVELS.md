# Levels (settings) and modes — 3.4 architecture

Gridfall runs one engine across several **settings** (levels). The engine owns:
- the frame loop, state machine, pause and pointer lock;
- the player, the weapon and shooting;
- survival waves and the enemy context;
- rendering, the HUD and the menus.

A level owns everything about a place: geometry, collision, lights, weather, ambience, its intro, and, if it has one, its story.

| Setting | Modes | Module |
|---|---|---|
| TOKYO NIGHT | Story Escape, Arcade Survival | `src/levels/tokyo/` (`TokyoLevel`, `TokyoStory`) plus the Tokyo content modules in `src/world`, `src/story`, `src/rail`, `src/stealth`, `src/city` |
| DESERT OUTPOST | Arcade Survival | `src/levels/desert/` (`DesertLevel`, `Outpost`, `Terrain`, `Sandstorm`, `DesertIntro`, `textures`) |
| DEEP JUNGLE | Arcade Survival | `src/levels/jungle/` (`JungleLevel`, `Base`, `Foliage`, `Terrain`, `JungleIntro`, `textures`) |
| NEON DOCKS (8.0) | Team Deathmatch | `src/levels/docks/` (`DocksLevel`, `Docks`, `DocksLayout`) |

## How it fits together

```
main menu ── pick setting (card) ──> Game.loadLevel(id)
                                       ├─ unloadLevel(): waves, level.dispose(), audio.clearLevel(),
                                       │                 disposeScene() (GPU), DOM of the level
                                       ├─ fresh THREE.Scene, CollisionWorld, Glows, Effects
                                       ├─ LEVELS[id].create(game)        → the level builds its world, returns LevelData
                                       ├─ engine: Interactives, halos, Player, SafetyNet, Projectiles, Nav,
                                       │          survival spawns (validated), EnemyCtx — all from LevelData
                                       ├─ level.attach()                 → systems that need the engine (Tokyo: security, crowd, rail, mission)
                                       ├─ renderer.setLook(level.look), compile, level.startAudio()
          pick mode ──> startIntro(): rules = mode === 'story' ? level.storyRules() : ArcadeRules
                                       level.createIntro(mode) … beginPlay() → rules.begin()
per frame: player → rules.update() → projectiles, interactives → level.update() (weather, lights, props)
```

- **`LevelRuntime`** (`src/levels/Level.ts`): `info`, `data`, `look`, `attach`, `startAudio`, `update`, `flash`, `lightWeapon`, `titleCamera`, `createIntro`, `aboard`, `storyRules?`, `enterArcade?`, `reset`, `dispose`, `debug?`.
- **`LevelData`**: start, bounds, `floorMin` (the safety net's floor), nav layout, spawns, perches, cover points, cabinets, medkits, breakables, `zoneAt`, and optional `testGoals` for the DEV AI check.
- **`ModeRules`**: `ArcadeRules` (`src/levels/Arcade.ts`) works on any level's data. Story rules belong to the level that has a story: `TokyoStory`.
- **Tokyo-only systems** are reached as `game.tokyo.*`, which throws if TokyoNight isn't loaded. Examples: `game.tokyo.security`, `.rail`, `.mission`, `.story`, `.setStationOpen()`.

## Entities per setting (3.5)

Until 12.0 each `LevelInfo` carried an `arsenal`: `{ weapon: WeaponSpec, enemies: EnemyLook }` (`src/entities/`). **13.0:** a level carries only `enemies: EnemyLook` (plus an optional `storyWeapon` for its story mode). The weapons below are now a global armory (`src/entities/weapons/armory.ts`): the player picks one with the loadout (keys 1–3 over the intro, the first seconds in spawn and the TDM respawn timer), and arena bots are dealt one at each spawn. The table records which gun each setting shipped with.

| Setting | Weapon | Enemies |
|---|---|---|
| TOKYO NIGHT | `KITSUNE_9`: the plasma pistol (12 rds, cyan ammo strips). The default, unchanged from 3.4. | `NEON_SYNTHS`: hooded blade runners and armoured gunners, neon visors, sparks and a glitch dissolve on death, plasma bolts. The default. |
| DESERT OUTPOST | `JACKAL_AR`: assault rifle (30 rds, ~650 rpm, orange flash and tracers, rifle sound) | `DESERT_MERCS`: scavengers (head wrap, goggles, machete) and contractors (plate carrier, helmet, rifle with a laser). Dust-and-blood hits, bodies sink into the sand, war cries and rifle cracks, orange rifle tracers. |
| DEEP JUNGLE (3.6, 3.7) | `BOAR_SHOTGUN`: pump shotgun (6 shells loaded one at a time, 8 pellets, 0.82 s pump, deep boom) | `JUNGLE_GUARDS` (3.7, replaces 3.6's `JUNGLE_HUNTERS`): breachers (helmet over a balaclava, amber goggles, knee pads, black machete) and riflemen (helmet with NVG mount and headset, plate carrier, radio, black rifle with optic and laser); olive-drab tiger stripe and black kit; organic; human voices. |

- **`WeaponSpec`:**
  - the model builder (fills the gun, the slide or bolt that cycles, and the magazine);
  - magazine size, fire interval, reload time, damage, base spread, bloom per shot;
  - viewmodel kick and camera recoil;
  - rest pose, muzzle and ejection points;
  - flash and tracer colours, sound, and whether ammo glows on the gun.

  Optional (3.6):
  - `pellets`: several hitscan rays per pull, with spread and damage falloff;
  - `cycle`: a pump or bolt action after each shot;
  - `perRound`: a tube magazine loaded one round at a time, which the trigger interrupts.

  `Weapon` keeps all the mechanics and `setSpec()` swaps the model, freeing the previous one (the viewmodel outlives levels).
- **`EnemyLook`:**
  - `buildRunner()` and `buildGunner()` on the shared skeleton (the pivots the animation drives), so behaviour is identical;
  - accents;
  - `organic` (dust and blood, no sparks, the body sinks) or synthetic (sparks, glitch dissolve);
  - the projectile look;
  - `voice` (synth or human sounds).

  `Waves.look` and `Projectiles.setLook()` take it from the level.
- **Rig ownership:** a rig owns every geometry and material that isn't shared. The cached box and cylinder geometries and the module-level materials are marked `userData.shared`. `disposeRig` frees the rest.

## Quit to main menu (3.5)

Pause menu → QUIT TO MAIN MENU (asks for confirmation) → `Game.toTitle()`:
1. Release pointer lock and keys; hide every gameplay layer.
2. `rules.toTitle()`: the mode cleans up (story: security, crowd, ending).
3. `loadLevel(setting)`: the same full unload as a level switch, then a fresh build behind the title.
4. Restore the weapon, grade, music and menu.

The end card's MENU button takes the same path. Verified over 4 mixed rounds (Tokyo story, desert arcade, Tokyo arcade, each with shooting and enemies):
- GPU textures, DOM nodes, level audio sources and scene children return to the same numbers;
- geometries plateau once the shared shape cache is warm.

## Adding a level

1. **Make the level module.** Create `src/levels/<id>/<Name>Level.ts`, implementing `LevelRuntime`. Give its info an `arsenal` (reuse an existing weapon and look, or add your own in `src/entities/`):
   - The constructor builds into `game.scene` and `game.col`. Set the fog colour and density, lights and sky. Build geometry with `StaticBuilder` (merged per material; the DEV registry records visual bounds for the world check). Add colliders that are **the same boxes** you draw.
   - For open ground, set `game.col.terrain = { height(x, z), maxHeight, surface }`. The controller, AI, rays and the world check all follow it, and Nav needs `slope` in its layout.
   - Return `data` from the constructor, and `look` (exposure, bloom, shadows, grade tint).
   - `attach()` runs after the engine created the player, nav and enemy context. Use it for systems that need them, and for engine hooks such as `waves.minSpawnDistance` and `ctx.sightRange`.
   - `dispose()` frees what isn't in the scene graph: render targets, the shadow map, engine hooks you changed, and textures hung on lights (`SpotLight.map`). `disposeScene` only reaches textures through materials, so a light cookie leaked one texture per load until 3.6 freed it.
2. **Register it.** Add an entry to `LEVELS` in `src/levels/registry.ts`, and the id to `SettingId` and `LEVEL_ORDER`.
3. **Follow the geometry rules from 3.3** (see `docs/WORLD-DEFECTS-3.3.md`):
   - walls at least 0.3 m thick;
   - doorways at least 1.3 m wide, with lintels;
   - gaps either under 0.3 m or over 1 m;
   - stairs as a visible stepped mesh over a smooth ramp, with stepped fill underneath;
   - visible, physical boundaries that beat the best jump (never invisible walls);
   - `floorMin` and `bounds` covering every reachable spot.
4. **Validate.**

   | Command | Pass condition |
   |---|---|
   | `__dev.start('arcade', '<id>')`, then `await __dev.world()` | 0 findings |
   | `await __dev.stress({ samples: 800, fps: [20, 30, 60, 120, 'spiky'] })` | 0 failures |
   | `await __dev.levelAI({ spawns: 24, sight: 25 })` and the same with `sight: 300` | runners and gunners all reach their goals |
   | `await __dev.bench(3)` | compare with the other settings |

   Then switch levels back and forth and check that `__game.debug().memory` (geometries, textures) returns to the same numbers each time.

## Weather and visibility (desert)

`Sandstorm` drives a `StormClock` (calm → rising → peak → easing, with random durations). Intensity 0..1 sets:
- fog density and colour;
- sun and sky light (shadows wash out in the dust);
- the sky dome, sand streaks (one draw call) and dust billows (one instanced draw call);
- wind audio (`audio.setWind`, muffled indoors);
- `visibility` (the 90% fog distance).

The engine uses `visibility` for:
- **enemy sight** (`ctx.sightRange`): enemies don't see through the dust that hides them from the player; they still hunt;
- **spawn distance** (`waves.minSpawnDistance`): enemies appear out of the storm, not in plain sight.

Interiors are passed to the particle shaders, so no sand is drawn inside a building, while the storm stays visible through doors and windows.

## Dense foliage and atmosphere (jungle, 3.6)

- **Foliage:**
  - every plant kind is one `InstancedMesh` of opaque, flat-shaded, low-poly geometry: bushes, ferns, sedge, big-leaf plants, slim-tree crowns, the high canopy and vines;
  - no alpha blending or alpha test, so no sorting, no overdraw blending, and early-z still works;
  - a vertex-shader sway (by height above the plant's base, phase from the instance position) costs no CPU;
  - plants are `userData.soft`: you walk through them and they don't block rays;
  - density scales with the graphics preset at load (Power 0.6×, Balanced 1×, High 1.25×).
- **Mist:** two terrain-following sheets (0.3 m and 1.1 m up). The alpha is two scrolling noise lookups, faded within 9 m of the camera so you never see a sheet's edge. A uniform list of room rectangles (up to 6) masks it out of the buildings (3.7).
- **Sun:**
  - a far `SpotLight` projects a dapple texture (`map`, a light cookie) with a static shadow map: `autoUpdate = false`, one render after load;
  - the level reads the cookie on the CPU through `shadow.matrix` to drive the viewmodel's key light.
- **Fog sets the engine hooks:** `ctx.sightRange` = 85% of the fog's 90% distance; `waves.minSpawnDistance` = 30 m.
- **Root flares:** one collider cylinder per giant tree, up to above jump reach, then the trunk. The pockets between buttress roots are inside it, so nothing wedges itself there.

## Assault-ready layout (jungle, 3.7)

The jungle runs Arcade Survival on a map built for a future linear assault mission: start → approach → breach → clear.

- **Flow by terrain:** the start is at the map's south edge on a road (`roadX(z)` in `Terrain.ts`, flattened by the height function). The compound (`BASE`) is flat, with a flat `STRIP` (7 m) of cleared ground round its wall, and the hills blend in over 10 m beyond that.
- **Entrances:** the gate (main, south), a postern (north) and a breach (west). No dead ends: every zone has at least two ways in, and the nav graph is connected from every spawn (`levelAI.graphOk`).
- **Funnel, not a wall:** concertina runs across the south strip (solid, 1.15 m, not vaultable) leave the road and the chicane open.
- **Engine hooks used (new in 3.7, setting-agnostic):**
  - `Waves.minSpawnDistance(spawn)`: per spawn point (the barracks 14 m, the jungle 30 m);
  - `Waves.pickSpawn(pool, player)`: the level weights eligible spawns (barracks 35% while any is eligible; jungle spawns behind the player relative to the compound 70%). Both reset in `dispose()`.
- **Collision rules applied (3.3):**
  - every prop is seen and solid with the same bounds;
  - trees stand ≥ 7 m from the wall (keep-clear rect plus gap; measured minimum 7.35 m), so no tree-to-wall slot exists;
  - talus rocks overlap the cliff or stand ≥ 0.8 m clear of every cliff box;
  - low rubble (≤ 0.7 m) is plain solid, not `vault` (the vault rule skips a rail while airborne above `top − 0.62`, which for a low slab is the whole jump);
  - long stairs (3.65 m and 4.5 m up) have a mid nav node; they're walled on both sides, so the node can't auto-link to the ground beside them;
  - a 2.2 m screen over the comms roof's parapet beside its stair, so a runner on the stair never sees (and chases straight at) a target on the roof.
- **Room-aware atmosphere:** `shade` rects (rooms, carport, depot net, watchtower roof) zero the viewmodel's sun; the mist is masked out of the rooms.

## Render look per level (4.0)

`LevelLook` (applied by `Renderer.setLook` on load) now carries, besides exposure, bloom, shadows and the shadow tint:
- `grade?`: the teal/orange split-tone (`split`, `teal`, `warm`, `sat`, and `hi`, the highlight range: default 0.22–1.6 for a night scene, 0.1–0.8 in the desert). 4.1 adds a bleach bypass (`desat`, `crush`, `contrast`), which runs before the split. Absent means off, the 3.7 grade.
- `legacy?`: the look before 4.0, used only by the DEV comparison.

`LevelRuntime.setVisual?(v4)` switches a level's own 4.0 additions (Tokyo: the AO bake, the wet model and the reflection catchers) for the comparison. `Game.setPipeline('v4' | 'raw' | 'v37')` sets both and recompiles; F8 (DevTools) cycles it.

Tokyo's 4.0 additions are module-level uniforms (`WET4`, `CATCHERS` in `Ground.ts`). `TokyoLevel.dispose()` resets them, so another level never inherits them.

### 4.1 additions
- **`Renderer.haze = { px, horizon }`:** the heat haze, applied in the grade pass. A level sets it each frame (the desert does) and resets it in `dispose()`. The grade masks out the viewmodel's projected screen box.
- **Presets never change the look:** every preset uses three bloom levels (a unit test holds this). Light flicker must use `heldNoise(t, seed)` (`core/math.ts`), never `Math.random()` per frame (a unit test holds the sign modes to the same rate at 60 and 120 FPS).

### 4.2 additions
- **Grade:** `LookGrade.shadow` (multiplicative hue of the darks, default 1,1,1) and `lo` (luminance where the darks end, default 0.14), applied inside the split-tone. The jungle uses them; Tokyo and the desert keep the defaults (`setLook` resets them on every load).
- **Geometric light shafts (`levels/jungle/GodRays.ts`):** additive cones, depthWrite off, never given to the CollisionWorld, tagged `soft`, `raycast` disabled (a unit test holds this). They live in the scene graph, so `disposeScene` frees them with the level.
- **Mud (`levels/jungle/Mud.ts`):** `applyMud(mat, on, kind)` chains onto a ground material's `onBeforeCompile`. The switch is a per-level uniform object, not a module-level one (Vite HMR can load a module twice and split module-level state).
- **Cookie flecks:** the jungle builds two sun cookies (3.7 dapple, and 4.2 with a fleck under each shaft) and two environment maps. `setVisual` swaps both, and `dispose()` frees both.

## Team Deathmatch arena (desert, 6.0)
A level supports Team Deathmatch by listing `'tdm'` in `info.modes` and filling `data.tdm` (`TdmData`): spawns per team, lanes per team (left, centre, right from that team's base, ending short of the other's spawn), `inBase(team, p)` and the player's start. The rules (`src/levels/Tdm.ts`) need nothing else from the level.

Desert Outpost's arena (`src/levels/desert/ArenaLayout.ts`, `Arena.ts`):
- **Point symmetry:** everything is authored in the south half and built again rotated 180° about the origin; the dunes are the mean of the height field and its rotation (`desertHeight`); the scattered rocks come in rotated pairs. Bases sit on flat pads (y 1.2) blending into the dunes over 18 m.
- **Bases** (ALPHA south at z ≈ 64, OMEGA north): HESCO walls 2.4 m (taller than eyes), exits north (centre) and on both sides, each behind a concrete blast wall (chicanes), eight spawn points, a command tent, crates, the team flag.
- **Lanes:** centre through the compound's gates and yard; flanks at |x| ≈ 45–60 through a ruined hamlet (two enterable ruins, a broken enclosure, low walls) on one half and a wadi (berms, rocks, a burnt APC, a sandbag nest) on the other, with a pump house (doors at both ends) at each flank's midpoint.
- **Centre approach:** a burnt truck, jersey barriers, a sandbag nest facing the compound, two rocks.
- **Nav:** hand links through every doorway, chicane and the nest; lane waypoints are nodes. Validate with `__dev.levelAI()` after any change (a wrong link is built twice).
- **Survival** on the desert plays on the same map: its 3.4 ruins and salvage dumps (where the hamlet and wadi are now) were replaced by the arena's cover.

## Neon Docks: a TDM-only 3-lane arena (8.0)
`src/levels/docks/` (`DocksLayout.ts` holds the plan, the lanes and the zones; `Docks.ts` builds it; `DocksLevel.ts` is the runtime). `info.modes = ['tdm']`: the menu makes TDM its primary mode. Plan and numbers: `docs/PLAN-8.0.md`, `docs/BENCH-8.0.json`.

Layout and fairness:
- **Mirror symmetry (z → −z):** the water stays east the whole length, so each lane keeps its identity. A 180° rotation, as on the desert, would swap the quay to the other side at mid-field.
- **Colour callouts are not symmetric:** blue stacks on ALPHA's half, yellow in the middle, red on OMEGA's.

Lanes:

| Lane | What | Range | Verticality |
|---|---|---|---|
| Stacks (x < −17) | a container maze on an 8 m grid | close | stairs onto container roofs |
| Warehouse 7 (\|x\| < 14) | the meat grinder | mid | catwalks, stairs from the doors up to a mid landing, a bridge |
| Quay (x > 14) | open, along the water, under the crane | long | a loading platform, an exterior stair to a catwalk door |

Transitions between lanes:
- the divider's gaps and the warehouse's west doors (stacks ↔ warehouse);
- the east doors and the exterior stair (warehouse ↔ quay);
- both forecourts (all three).

Rules learned building it:
- **Fill under the treads:** a stair that has floor along a side needs a side plate there. A sprint-jump into the open side landed inside the stepped fill below the treads (stress test).
- **Stair foot and nav nodes:** a stair's foot must face open floor. Check every nav node: the build warns about any node inside geometry (`laneProblems`).
- **Break the meat grinder's long axis:** two aligned doors gave an eye-level line through the whole warehouse, and the bots fought there from outside. A 2.4 m crate stack under the bridge breaks it; from the catwalks you see over it.
- **Stairs face the way people arrive:** stairs that rose away from the doors left the catwalks unused (0–1.4% of bot time). Reversed, with the foot at the door and a mid landing onto the catwalk, it rose to 6.5–7.6%.
- **The water edge:** a fence that beats every jump from what stands near it: 1.6 m, chain link, not vaultable (props within 6 m are ≤ 1 m tall), plus a drown volume behind it.
- **Survival-only data:** `data.spawns` holds both teams' spawns and the lane points, so `levelAI` has somewhere to start (the level has no survival).

## Stairs never run into walls (8.1)
`world/StairFit.ts`. Every stair builder (`Architecture.stair` in Tokyo, the jungle's and the docks' `stair`) calls `fitStairWidth` first. If a solid wall intrudes into the stair's width at its own heights, by less than half the width, the stair is narrowed to the wall's face. Steps, ramp, fill and rails all stay out of the wall.

What is never narrowed:
- an intrusion into the run (it would change the slope);
- an intrusion covering most of the width.

Those are logged (`[stair] runs into a wall`) and reported by `__dev.world()` as **stair in wall**, along with any wall built after the stair. A support under a raised stair, or a building above an underground one, only touches it and isn't counted.

### 9.1: and never flush with one
Coplanar faces that face the same way z-fight. Two rules keep a stair's faces off any other plane:
- **Plates stand in front of the treads.** A side plate (docks, jungle) or a railing plate (desert) overlaps the stair's width, so the treads stop `STAIR_GAP` (3 cm) short of it. Before 9.1 the plate's outer face shared the treads' side plane and flickered.
- **Walls keep their distance.** `fitStairWidth` moves a side `STAIR_GAP` clear of any wall touching it, or of a wall it was narrowed to. `__dev.world()` reports any stair still flush (**stair flush with wall**).
- **Build order:** the fit only sees what already exists, so solids beside a stair (columns, cabinets) are built before it.
- **Checking:** `__dev.stairGaps()` checks every gap: 3 cm, and a body pressed into it keeps its floor.

## Jungle TDM: "Firebase Viper" (9.0)
The assault map (3.7) is linear: one road, one gate, a compound to take. TDM needs a loop, so 9.0 adds a second base and two flanks without touching the Survival flow (`info.modes = ['arcade', 'tdm']`).

| | ALPHA | OMEGA |
|---|---|---|
| Base | LZ ALPHA: the original road spawn, a HESCO yard (`TDM_YARD.alpha`, z 42–58) | LZ NORTH: behind the compound (z −62…−47), with a helipad |
| Exits | front onto the road, two sides, each behind a blast wall | two sides only (the cliff is behind it) |
| Nearest way in | the gate (49 m), the drain culvert (61 m) | the postern (39 m), the west breach (60 m) |
| Flank lane | west exit, the strip, the culvert, the motor pool, out the west breach | east exit, the east breach, the watchtower, the gate, down the road |

How it fits:
- **Two flows, one map:** `data.tdm` (spawns, lanes, `inBase`) is used only in TDM. Survival keeps `data.spawns`, the road, and the objectives.
- **Terrain pads:** `jungleHeight` flattens each yard and blends to the hills over 16 m, the shortest blend that keeps the slope under 0.4.
- **New openings:**
  - `CULVERT`: a 2.4 m concrete box through the south wall, west of the gate;
  - `EAST_BREACH`: a gap with fallen slabs and a split coil.

  Both have hand nav nodes, a zone name (DRAIN CULVERT, EAST BREACH), and test goals.
- **Lane points snap to free ground** (`freeNear`), because random trees can land on them. `layoutProblems` warns about any lane point or nav node inside geometry.
- **A flank is used only when a lane goes through it.** With three lanes per team the bots never entered the culvert; with a fourth they enter it 4–5 times a match.

## Tokyo: Neon Block (14.0)

`src/levels/neonblock/`: `NeonBlockLayout.ts` (the plan, lanes and zones), `NeonBlock.ts` (the builder), `NeonBlockLevel.ts` (the runtime). TDM only. The story district (`tokyo/`) is untouched.

- **Mirrored about z = 0**, three lanes on three levels: street (0 m), mid (4.5 m: fire-escape landings, the footbridge, Block E's roofs, the plank bridge) and top (7.2 m: Block W's roofs and the skybridge).
- **Every raised floor has stairs back down.** The nav graph's one-way **drops** (`NavLayout.drops`) let arena bots walk off a roof or a landing through gaps in the parapets and rails.
- **The boundary is 14 m buildings on every side**, over twice the highest reachable floor.
- **Repeated props are `InstancedMesh`**: vending machines, AC units, lanterns and rubbish bags (`Instancer` in `NeonBlock.ts`). `__dev.world()` reads instanced meshes since 14.0.

## Jungle: Crash Site (15.0)

`src/levels/crashsite/`: `CrashLayout.ts` (the plan, the heightfield, lanes and zones), `CrashSite.ts` (the builder), `CrashSiteLevel.ts` (the runtime). TDM only; Firebase Viper (`jungle/`) is untouched.

- **Mirrored about z = 0.**
  - **The ridge** (west): a 3.6 m rock plateau.
  - **The wreck** (centre): a dropship's hull, its wings ramps to the roof, mud trenches 1.4 m deep.
  - **The ravine** (east): a 4 m-deep floor between rock rims, fallen giant trees across it.
- **Heightfield rules:** the terrain is always floor (the foot circle stands on its highest point), so no steep terrain face may be exposed.
  - The trenches' banks are gentle (≤ 22°, unit-tested).
  - The ridge is rock blocks on flat ground.
  - The ravine's drop lies under its rims, clear of every foot sample.
- **Step height:** anything walked onto is ≤ 0.3 m: rim tops, trunk decks, the hull's deck. Taller needs a jump.
- **Foliage:** `buildFoliage` takes a `FoliageSite` (height, forest density, extents). Firebase's default reproduces 14.0 exactly (plant counts and concealment checked against `main`).

## Neon Docks rework (15.0)

- **Warehouse:** roofless, walls 10 m → 7 m, main doors 8 m → 4 m, the tall crate stacks and the container removed (low cover only).
- **Spawn yards:** two exits (no centre one), each behind an L of blast wall that turns you to your flank.
- **Container gantry** (2.6 m, over the maze's x = -45 corridor): stairs at both ends, drops into the cross corridors.
- **Quay gantry** (6.5 m, 4 m out from the warehouse's east wall): a 1.1 m armoured half-wall facing the warehouse, the crane nest at mid-field, stairs at both ends and from the quay up to the nest.
- **Lanes:** containers (over the gantry), the warehouse, the waterfront (the quay and the nest).

