# Levels (settings) and modes — 3.4 architecture

NEON RAIN runs one engine across several **settings** (levels). The engine owns:
- the frame loop, state machine, pause and pointer lock;
- the player, the weapon and shooting;
- survival waves and the enemy context;
- rendering, the HUD and the menus.

A level owns everything about a place: geometry, collision, lights, weather, ambience, its intro, and, if it has one, its story.

| Setting | Modes | Module |
|---|---|---|
| TOKYO NIGHT | Story Escape, Arcade Survival | `src/levels/tokyo/` (`TokyoLevel`, `TokyoStory`) plus the Tokyo content modules in `src/world`, `src/story`, `src/rail`, `src/stealth`, `src/city` |
| DESERT OUTPOST | Arcade Survival | `src/levels/desert/` (`DesertLevel`, `Outpost`, `Terrain`, `Sandstorm`, `DesertIntro`, `textures`) |

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

Each `LevelInfo` carries an `arsenal`: `{ weapon: WeaponSpec, enemies: EnemyLook }` (`src/entities/`).

| Setting | Weapon | Enemies |
|---|---|---|
| TOKYO NIGHT | `KITSUNE_9`: the plasma pistol (12 rds, cyan ammo strips). The default, unchanged from 3.4. | `NEON_SYNTHS`: hooded blade runners and armoured gunners, neon visors, sparks and a glitch dissolve on death, plasma bolts. The default. |
| DESERT OUTPOST | `JACKAL_AR`: assault rifle (30 rds, ~650 rpm, orange flash and tracers, rifle sound) | `DESERT_MERCS`: scavengers (head wrap, goggles, machete) and contractors (plate carrier, helmet, rifle with a laser). Dust-and-blood hits, bodies sink into the sand, war cries and rifle cracks, orange rifle tracers. |

- **`WeaponSpec`:**
  - the model builder (fills the gun, the slide or bolt that cycles, and the magazine);
  - magazine size, fire interval, reload time, damage, base spread, bloom per shot;
  - viewmodel kick and camera recoil;
  - rest pose, muzzle and ejection points;
  - flash and tracer colours, sound, and whether ammo glows on the gun.

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
   - `dispose()` frees what isn't in the scene graph: render targets, the shadow map, and engine hooks you changed.
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
