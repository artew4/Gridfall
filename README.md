# NEON RAIN 3.5: Two Settings

One night in Shinjuku. One gun you'd rather keep holstered. One last train. Or an outpost in the dunes, and a sandstorm coming.

A single-player stealth-action game built with Three.js + TypeScript + Vite. Its engine (controller, shooting, AI, collision, survival waves) now runs several settings. Everything (geometry, textures, signage, sound and music) is generated procedurally at startup: no external assets.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # type-check + production build into dist/
```

On the main menu, pick a **setting**, then a **mode**. In a run, the pause menu (Esc) has **QUIT TO MAIN MENU** (it asks for confirmation). The click also unlocks audio and captures the mouse. Any key or click skips the opening. The menu remembers the last setting; `?setting=desert` or `?setting=tokyo` in the URL picks one directly.

| Setting | Modes |
|---|---|
| **TOKYO NIGHT** — rain, neon, a vertical district over a metro station | Story Escape, Arcade Survival |
| **DESERT OUTPOST** — open dunes, harsh sun, sandstorms | Arcade Survival |

Switching settings builds the new one behind the menu and frees the old one completely. How levels work and how to add one: `docs/LEVELS.md`.

## Desert Outpost

- **The map:**
  - Outpost Kestrel sits on a flat pad inside a HESCO barrier with four gates. Rolling dunes run out to sandstone mesas that close the map.
  - Six buildings you can walk into: the barracks (two rooms), the motor pool (a truck inside), the trading post (an L-shaped hall with a walkable roof terrace up an outside stair), the clinic, the watchtower (a ground room, with a stair to a roof platform under a canopy) and the generator shed.
- **The sun:**
  - harsh light from the south-west, with hard shadows;
  - interiors are dark, lit only by windows, doors and bare bulbs (you can shoot them out).
- **The sandstorm:** it comes in cycles (calm, rising, peak, easing).
  - At the peak you see about 25 m, and the sun goes red and the shadows wash out.
  - Sand streaks and rolling dust blow along the wind.
  - Inside a building the air is clear and the wind is muffled.
- **Your weapon:** the JACKAL AR, an assault rifle. 30 rounds, full auto, a steady climb if you hold the trigger, and an orange flash and tracers. Tokyo keeps the Kitsune-9 plasma pistol.
- **The enemies:** desert mercenaries. Scavengers with head wraps, goggles and machetes charge you; contractors in plate carriers and helmets take cover and fire rifle rounds you can see coming.
- **The compound:** cluttered with barrels, stencilled crates, cable spools, scrap and a parked pickup, all of it cover. Tyre ruts lead out of the gates into dunes banked against the barrier.
- **Survival:**
  - Enemies spawn out in the dunes, beyond what the storm lets you see, and close in through the gates.
  - They can't see through the dust either: gunners have to get within sight to shoot. Runners hunt you anyway, so listen for footsteps and screeches.
  - Snipers take the watchtower and trading-post roofs. Medkits are in the barracks and the clinic; shoot the electrical cabinets to arc enemies near them.

## The story

You are Arashi Kaito, a former Kurogane Security contractor. You walked out with Kurogane's ledger, so they bombed their own data vault and framed you for it. Your face is on every screen in the district, the district is sealed, and every patrol has your description. Your contact Kenji has a way out: the last express on the Sakura Line.

The opening (about 50 s, skippable) shows the populated city, the manhunt on the rooftop billboard, you hiding in the back alley, and Kenji's message. Then the game hands over in first person.

## Modes

- **Story Escape**: four acts across the street, rooftops and the Sakura Line metro, ending on the escape train.
  - Act I, **The Fugitive**: find Kenji at the ramen stall in the Fountain Plaza, then lose the squad that followed him.
  - Act II, **The Escape Route**: read the departure board at the plaza metro entrance.
  - Act III, **The Manhunt**: disable the security relay on the Sky Garden roof (it keeps the station locked down).
  - Act IV, **The Last Train**: get down to Platform 1 and board the last express before its doors close.
  - Each act starts at a checkpoint. After a death you can retry from it or restart the story.
- **Arcade Survival**: the original wave mode on the same district (six designed waves, then endless escalation).
- **Settings**:
  - volume (master, music, SFX, mute);
  - graphics preset and frame rate;
  - control tips on/off.
  - All are saved in `localStorage` (`neonrain.settings`).
- **Controls**: the table below.

### Finding your way

- **Objective panel (top left):** what to do, how far it is by the actual route, and which level it's on (e.g. `61 M · ▲ ROOFTOP · VIA STAIRS UP`). A banner announces each new objective and confirms the one you just completed.
- **Marker:** a diamond over the destination. If the destination is on another level, it marks the stairs or metro entrance where your route changes level. Off screen it sticks to the screen edge and points the way. Behind walls it dims.
- **Minimap:** a dotted route along real streets and stairs, plus the objective.
- **Hold TAB:** objective overview with why it matters, where it is, the current hint and (once you've read the board) the train times.
- **Hints:** if you make no progress for about 50 s, a hint appears under the objective. Never during a firefight.
- **Subtitles:** Kenji, station announcements, the departure board and dispatch appear at the bottom centre with the speaker's name. The music ducks a little under dialogue.
- **Control tips:** shown once each in the first minutes. They can be switched off in the menu.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| LMB (hold for repeat) | Fire |
| R | Reload |
| X | Holster / draw (a drawn weapon gets you noticed) |
| E (tap or hold) | Interact: talk, read, cut the relay |
| Shift | Sprint |
| Space | Jump. Vault low railings and parapets mid-jump. |
| Tab (hold) | Objective overview |
| Esc | Pause menu: resume, restart, volume, graphics |

## Stealth and the wanted system

**Vision:**
- Every officer has an 85° forward view cone. It also has vertical limits: about 40° up and 55° down.
- Officers in a firefight look further up for the shooter (70°).
- What a guard can see is decided by real 3D lines of sight to your head, chest and knees.
- Walls, buildings, floors, roofs and the street surface above the station all block it. Open stairwells and balconies don't.
- If only a sliver of you is visible, recognition is much slower.

**Range:**
- 9 m for a holstered stranger.
- 16 m with your weapon drawn, or once security is hunting you.
- 22 m for an officer already fighting you.
- Behind or beside an officer you're only noticed up close, and only slowly.

**Recognition:**
- Suspicion builds on a meter, shown as arcs around the crosshair.
- With a drawn weapon, identification takes about 0.7 s up close and 1.5 s at the edge of the cone.
- Darkness helps at range. A muzzle flash doesn't.
- Holstering after you've been identified doesn't make you a stranger again.

**Hearing:**
- Gunshots carry further than sight, but guards only learn roughly where they came from. The error grows with distance and through walls.

**Response:**
- The guard who spots you radios a snapshot of where *he* saw you.
- The 2 nearest officers within 60 m converge on it from different sides. One reinforcement comes from a door you can't see.
- More reinforcements arrive one at a time only if the pursuit drags on, within a limited budget.
- While someone keeps eyes on you, dispatch updates the hunters every 3 s.

**Losing them:**
- When a guard loses sight, he heads for where you were going: your last seen position plus your heading.
- After 7 s without contact, the pursuit turns into a search. Guards split up:
  - **sweep**: the last known position and its surroundings;
  - **probe**: further along your heading, including stairs to other levels;
  - **hold**: watch a spot near the last known position.
- The search widens over time and lasts 25 s. New evidence, such as a shot, extends it. Then patrols resume.
- Hiding right next to where you were last seen usually gets you found. Getting away from that spot — over a roof, down an alley, into the metro — works.

**Civilians:**
- Civilians who see a drawn weapon may phone it in. Security then gets a second-hand report, not your live position.
- Gunshots cause panic, which fades once the threat is gone.

**Wanted levels:** unnoticed → suspicious → alerted → pursuit → searching → unnoticed.

**HUD:**
- Red arcs around the crosshair mean someone is shooting at you. Orange arcs mean a hunter close behind you.
- The minimap shows only guards you have seen, that are openly noticing or attacking you, or that you heard (position only).
  - Each seen guard has a view cone at the facing you saw, clipped by walls. Its length is his recognition range against you right now, so drawing your weapon visibly lengthens every cone.
  - Colours: yellow patrol, orange suspicious, red hunting.
  - Guards on other floors appear as hollow dots with ▲/▼. They get a dashed cone only if they could see you.
  - Information fades over 9 s at the last observed spot.

## The map

- **Street level:**
  - Fountain Plaza, Lantern Street, Neon Alley, Service Passage, Railway Street, plus the back alleys.
  - An upper walkway (4.5 m) wraps the plaza.
- **Rooftops (8.5 m):**
  - Decks joined by bridges and stairs.
  - Low parapets and railings can be vaulted.
  - Drops of up to 10 m cause no damage.
- **Sakura Line station (−6 m):**
  - Three street entrances lead down to a concourse and platform with screen doors.
  - Shutters lock the station down until Act 3.
- **Trains:**
  - Trains follow a timetable on a game clock (1 real second = 4 game seconds).
  - Departure boards show what's next.
  - The escape train holds its doors while you're close. If you miss it, an extra express is scheduled.

## Music

There is one continuous layered score (100 BPM, D minor): pad, drone, fragments, pulse, hats, bass, drums and lead.

- Layers fade in and out with the moment's intensity. Changes land on bar lines, and hysteresis stops layers flickering on and off.
- Intensity rises quickly (τ ≈ 1.5 s) and falls slowly (τ ≈ 10 s), so after a fight the music winds down over about 20–25 s.
- A limiter on the music bus prevents clipping.
- The pause menu ducks the music; it never restarts it.

To use your own tracks instead, add `public/music/manifest.json` plus seamless loop files:

```json
{
  "exploration": { "file": "exploration.ogg", "bpm": 90 },
  "combat":      { "file": "combat.ogg",      "bpm": 135 },
  "intense":     { "file": "intense.ogg",     "bpm": 150 }
}
```

Each track can also set `beatsPerBar` (default 4) and `offset` (seconds before beat 1).

- When all three files load, the game picks a track by intensity band and crossfades on bar lines. Otherwise it falls back to the procedural score.
- No code changes are needed.

## Graphics and power

| Preset | Frame cap | Resolution | Bloom | Sign lights |
|---|---|---|---|---|
| Power Saving | 30 | 0.85× CSS pixels | 3 levels | off |
| Balanced (default) | 60 | up to 1.25× | 3 levels | on |
| High Quality | 120 | up to 1.5× | 5 levels | on |

- The frame cap (30/60/90/120) can also be set on its own.
- Game speed doesn't depend on the cap: everything is time-based.
- The title screen draws at most 30 FPS, and 10 FPS when the window isn't focused.
- A paused game draws nothing.
- In a hidden tab, rendering stops, audio is suspended and a running game pauses. It stays paused until you resume.
- Resolution adapts down if the frame rate can't hold the cap.

## Dev checks

In `npm run dev`, these commands work in the browser console (they don't exist in production builds):

- `await __game.checkRoutes()` runs:
  - player routes on all three layers;
  - vaults and drops;
  - nav-graph connectivity;
  - guard chases from every door.
- `__game.debug()`: FPS, draw calls, lights, alert level, civilian states, music layers.
- `await __dev.vision()`: 24 perception scenarios on the real map, including:
  - behind or beside a guard, out of range;
  - walls, a roof right above a guard, the station under the street, walkways in clear view;
  - the guard turning, holstered vs drawn.
- `await __dev.pursuit()`: headless pursuit scenarios with the real AI at 30 Hz.
  - Covers escapes by roof, alley and metro, hiding close by, a shot during the search, and re-detection.
  - Reports the response size, the time to calm, whether you were found, and whether any guard ever went for your hiding spot without information.
- `await __dev.ai(true)`: world overlay with view cones, lines of sight, guard states and suspicion, nav goals, search points and the last known position.
- `await __dev.perf(seconds)`: frame rate, CPU and GPU milliseconds per frame (GPU timer queries), busy share of each second.
- `await __dev.story({ watchIntro: true })`: plays Story Escape like a player who only reads the screen.
  - It steers the real controller with real keys along the route the game shows.
  - It presses E and holds E at the prompts, and fights or hides when hunted.
  - It boards the express and logs every objective and subtitle.
- Settings (3.4):
  - `__dev.start('arcade', 'desert')` loads a setting and plays immediately. `__game.loadLevel('tokyo')` switches settings.
  - `await __dev.levelAI({ spawns: 24, sight: 25 })` works on any level: the nav graph from every spawn, runners to every test goal (inside every building, every roof), and gunners must get a shot off within the given sight range.
  - `__game.debug().memory` lists GPU geometries and textures. After switching back and forth, they must return to the same numbers.
  - `__game.level.storm.clock.set('peak', 1)` (desert) forces the storm.
  - Checkpoints in Tokyo-only tools are `game.tokyo.*`; they throw if Tokyo isn't loaded.
- World integrity (3.3), which in 3.4 works on any level. The reasoning and results are in `docs/WORLD-VALIDATION-3.3.md`:
  - `await __dev.world()`: scans the whole map on a 0.5 m grid with the real collision and finds escapes, track-pit access, traps, areas outside the designed zones, invisible walls, visuals you can walk through and gaps you can't fit through.
  - `await __dev.stress({ samples, fps })`: the real controller from sampled reachable cells in 8 directions, walking and sprint-jumping. `fps` takes rates and `'spiky'`, for example `[20, 30, 60, 120, 'spiky']`.
  - `await __dev.train()`: boarding at every door, closed doors, riding a departing car, and someone standing in a doorway as the doors close (with the real rail).
  - `await __dev.colliders(true)`: the collision overlay around the camera.
  - `await __dev.bench(3)`: fixed benchmark scenarios. Compare the results with `docs/BENCH-3.2.json`.
  - `__game.safety.recoveries`: how often the out-of-bounds safety net fired. It should stay 0, and each recovery is logged as `[safety]`.
- `__dev.start('story' | 'arcade')`, `__dev.tp(x, y, z, yaw?, pitch?)`, `__dev.look(x, y, z)`, `__dev.god()`, `__dev.noGuards()`, `__dev.record(fn)`.

## Structure

- `src/core`: game loop and states (title, intro, play, paused, dead, ending), renderer and post chain, input
- `src/stealth`:
  - `Perception`: the shared `VISION` config and maths;
  - alert state machine;
  - Guard AI;
  - Security: dispatch, reinforcements, search roles, hearing;
  - `PlayerIntel`: what the player knows, for the minimap.
- `src/core/Interaction`: the single E handler (tap and hold)
- `src/city`: instanced civilian crowd (witnesses, reports, panic)
- `src/story`:
  - `Mission`: the authoritative state (acts, steps, checkpoints, set pieces);
  - `Objectives`: what each step means, where, and hints;
  - `StoryPresenter`: banner, panel, marker, TAB overview, hints, tips, subtitles;
  - `Guidance`: routes on the nav graph;
  - the ending.
- `src/cinematic`: the story opening (`StoryIntro`) and the arcade intro
- `src/core/Performance`, `Bindings`: frame pacing, presets, key bindings
- `src/world/Manhunt`: wanted billboard and posters
- `src/rail`: timetable (unit-tested), rail controller, metro train with walk-in interior
- `src/world`:
  - `District`: layout and nav
  - `Architecture`: walkways, stairs, railings, rooftops
  - `Metro`: the station
  - `City`, `PropKit`, `Fountain`, `Train`, `Events`, `Zones`
  - collision: boxes, ramps, cylinders, holes and vault flags, with a grid broadphase
- `src/gameplay`: cabinets, medkits, breakable lights
- `src/audio`: Web Audio SFX and ambience with volume groups; `music/` holds the director, layered score and file backend
- `src/player`: FPS controller and pistol (holster)
- `src/enemies`: models (merged per joint), Runner, Gunner, nav and arcade waves
- `src/ui`: HUD, story HUD, minimap, marker, pause and settings menu, end screen
- `src/dev`: route check and console helpers (DEV only)

## Known limitations

- The music is synthesised in the browser, so it won't sound like a studio production. Use the file backend for real tracks.
- Guards follow a waypoint graph, not a navmesh. In rare cases they may cut a corner awkwardly.
- Guards don't pick cover. In a fight they hold a spread-out ring around you and sidestep while aiming.
- Minimap cones are clipped against walls at eye height. They don't show the vertical limits of a guard's view.
- Footsteps make no noise. Only gunshots are heard.
- Civilians are simple instanced figures. They don't animate in detail.
- Mouse feel, pointer lock and the music have not been verified by a human player in this build; see the playtest checklist in the final report.
- There's no voice acting; dialogue is subtitles with radio and phone sound cues.
- The cinematic characters are the game's low-poly rigs, so close shots stay deliberately dark and short.
- The power figures are GPU and CPU busy time measured in the browser. Temperature and wattage were not measured.

Git tags: `v1.0` is the single-street original, `v2.0` is the vertical district wave shooter, `v3.0` is the cinematic escape before the stealth overhaul, and `v3.1` is the stealth and pursuit overhaul.
