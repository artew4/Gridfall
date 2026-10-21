# NEON RAIN 8.0: Neon Docks arena and the ranged-only TDM roster

Branch `feature/neon-docks-arena-8.0`, based on 7.0 (`08e55d1`).

Scope:
- a purpose-built Team Deathmatch map, Neon Docks (a rainy cyberpunk harbour at night, three lanes);
- no melee units in TDM;
- survival unchanged.

Prompted by the 7.0 playtest (the owner's notes):
- "snap + spread" combat felt great;
- the blades were out of place in a firefight and fed tickets to the enemy;
- TDM needed a map built for it.

## Phase 1: roster filtering
- **`src/enemies/Roster.ts`:** a mode requests unit **classes** (`ranged`, `melee`), never unit types.
  - `filterRoster(slots, request)` keeps every slot (callsign, team, count) and replaces a disallowed kind with the request's substitute.
  - `ANY` keeps everything; `RANGED_ONLY` substitutes `gunner`.
- **TDM:** `TDM.roster = RANGED_ONLY`. Ilya (ALPHA) and Kite (OMEGA) spawn as riflemen, so it is still 4 bots + the player against 5 bots.
- **Survival:** `Waves` composes its own waves and never consults a request; a unit test holds this.
- **Arena code untouched:** the runner branches in the brain and the director's runner push bonus stay; they are unreachable while TDM asks for ranged only.

## Phase 2: Neon Docks (`src/levels/docks/`)
Layout, in metres (north = −z):

| Part | Where | What |
|---|---|---|
| Spawn yards | z 60–78 (ALPHA), mirrored for OMEGA | 3.4 m walls; three exits (x −15, 0, 15), each behind a blast wall; 8 spawns |
| Lane 1, the stacks | x −54…−17 | 8 m container grid (4×4 cells per half, along x or z, 1–2 high); corridors 1.9–3.7 m; steel stairs onto two container roofs per half; jersey barriers across two corridors (vault); a divider of double stacks with gaps at the warehouse door and the forecourt |
| Lane 2, Warehouse 7 | x −14…14, z −26…26, 10 m | catwalks along both long walls at 4.5 m; stairs from just inside the end doors rising to a mid landing that joins the catwalk; end landings; a cross bridge at z 0; crate stacks, a container, a jersey line, pallets; a 2.4 m crate stack under the bridge (it breaks the eye-level line between the main doors) |
| Lane 3, the quay | x 14…46 | open concrete with long sightlines; a gantry crane straddling mid-field; a raised loading platform with steps; barriers, a container, cable reels |
| Water | x > 46 | a 1.6 m chain-link fence (see and shoot through, no climbing); behind it a drown volume |

**Symmetry:** mirror about z = 0 (z → −z), not the desert's 180° rotation. With a rotation the water lane would swap sides at mid-field. Mirrored, every lane keeps its identity the whole length.

**Colour callouts (deliberately asymmetric):** BLUE STACKS on ALPHA's half, YELLOW in the middle, RED on OMEGA's half.

**Transitions between lanes:**
- the maze divider's gaps and the warehouse's two west doors (lanes 1–2);
- two east doors, and an exterior stair from the quay to a catwalk door (lanes 2–3);
- the forecourts at both ends (all three).

**Verticality:**
- catwalks, mid and end landings, the bridge;
- container roofs (2.6 m);
- the loading platform (1.2 m);
- the exterior landing (4.5 m);
- vaultable barriers and pallets everywhere.

**Lanes for the director:**
- maze: down the corridors;
- centre: the high route, in at the main door, up the stair, along the west catwalk, down the far stair;
- quay: along the water.

OMEGA's lanes are ALPHA's mirrored; its left is the quay.

## Phase 3: look (Tokyo's 4.0 pipeline)
- **Wet ground:** `applyWet` with puddles on the apron, light damp indoors.
- **Reflections:** a PMREM environment map of the lit docks; four reflection catchers on the quay floods; streaks for every glow with a reflection.
- **Rain:** shelters under the warehouse roof; splash surfaces on the platforms.
- **Lights:**
  - floods: amber sodium on the quay, cold white LED along the west wall, three work lights strung over the maze;
  - sodium lamps in the warehouse;
  - team-coloured lights in the yards.
- **Neon:** NEON DOCKS, 第七埠頭, 港湾, 倉庫, CARGO, ALPHA and OMEGA signs; magenta and cyan tubes on the warehouse.
- **Materials:** containers in steel with ribs (red, blue, yellow, rust, green); corrugated walls; perforated decks; yellow handrails.
- **Scenery:** a container ship across the water.
- **Merging:** everything is merged per material (StaticBuilder), so the whole maze costs one draw call per container colour.

## Phase 4: validation
- **Integrity:** `__dev.world()` from ALPHA's start; `__dev.stress({ samples: 800, fps: [20, 30, 60, 120, 'spiky'] })`.
- **Pathing:** `__dev.levelAI({ spawns: 24, sight: 25 | 300 })`. The level's `data.spawns` (only used by the checks; no survival here) are both teams' spawns plus the lane waypoints. Its test goals are on the catwalks, the bridge, the exterior landing, container roofs, the platform, in the maze, the warehouse and the quay.
- **Match flow:** bot-vs-bot `__dev.tdmSim()` on the docks, with two new report fields: time per zone (`zoneTimePct`) and kills per zone (`killsByZone`).
- **Performance:** `__dev.bench(3)`, now with a docks set: seven views and a firefight, all with the match running. Plus `__dev.tdmBench()`.

## Phase 5: Knowledge_Gamedev
- the 3-lane arena level design rules;
- roster filtering;
- decisions and lessons;
- a separate commit.
