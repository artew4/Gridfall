# NEON RAIN 3.0: Cinematic Escape

One night in Shinjuku. One gun you'd rather keep holstered. One last train.

A single-player stealth-action escape built with Three.js + TypeScript + Vite. Everything (geometry, textures, signage, sound and music) is generated procedurally at startup: no external assets.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # type-check + production build into dist/
```

Pick a mode on the main menu (the click also unlocks audio and captures the mouse). Any key skips the intro.

## Modes

- **Story Escape**: four acts across the street, rooftops and the Sakura Line metro, ending on the escape train.
  - Act 1: meet Kenji at the ramen stall in the Fountain Plaza.
  - Act 2: read the departure board.
  - Act 3: cut the signal relay on the rooftops.
  - Act 4: get to the platform and board the right train before its doors close.
  - Each act starts at a checkpoint. After a death you can retry from it or restart the story.
- **Arcade Survival**: the original wave mode on the same district (six designed waves, then endless escalation).
- **Settings**: master, music and SFX volume plus mute, saved in `localStorage` (`neonrain.settings`).
- **Controls**: the table below.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| LMB (hold for repeat) | Fire |
| R | Reload |
| H | Holster / draw |
| E (tap or hold) | Interact: talk, read, cut the relay |
| Shift | Sprint |
| Space | Jump. Vault low railings and parapets mid-jump. |
| Esc | Pause menu: resume, restart, volume |

## Stealth and the wanted system

- **Your weapon draws attention.** Holstered, you are just another figure in the rain. Drawn, guards and civilians notice you sooner and from further away.
- **Guards** see in a forward cone, with short peripheral range. Darkness, steam and crowds reduce what they see.
  - Suspicion builds on a meter, shown as arcs around the crosshair.
  - Guards investigate, then engage. They radio the nearest officers and call limited reinforcements from doors you can't see.
  - Before firing they show an aim laser, then fire a 3-round burst. They don't shoot through civilians.
- **Wanted levels:**
  - **Unnoticed**: you're in the clear.
  - **Suspicious**: something caught a guard's attention.
  - **Alerted**: guards know something is wrong.
  - **Pursuit**: they have eyes on you.
  - **Searching**: they lost you and are sweeping your last known area.
  - About 7 s out of sight turns a pursuit into a search. After the search, guards return to patrol.
- **Civilians** who see a drawn weapon may phone it in.
  - A report reaches security only if they finish the call. Some give up.
  - Gunshots cause panic. The panic fades once the threat is gone.
- **HUD:**
  - Red arcs around the crosshair mean someone is shooting at you.
  - Orange arcs mean a hunter close behind you.
  - The minimap shows only what you have seen or heard: guards fade out after about 9 s. It also shows the current floor, the objective and, once found, the station entrance.

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

## Dev checks

In `npm run dev`, these commands work in the browser console (they don't exist in production builds):

- `await __game.checkRoutes()` runs:
  - player routes on all three layers;
  - vaults and drops;
  - nav-graph connectivity;
  - guard chases from every door.
- `__game.debug()`: FPS, draw calls, lights, alert level, civilian states, music layers.
- `__dev.start('story' | 'arcade')`, `__dev.tp(x, y, z, yaw?, pitch?)`, `__dev.look(x, y, z)`, `__dev.god()`, `__dev.noGuards()`, `__dev.record(fn)`.

## Structure

- `src/core`: game loop and states (title, intro, play, paused, dead, ending), renderer and post chain, input
- `src/stealth`: perception and alert state machine (unit-tested), Guard AI, Security (radio, reinforcements, gunshots)
- `src/city`: instanced civilian crowd (witnesses, reports, panic)
- `src/story`: Mission (acts, checkpoints, set pieces, pacing director), ending cinematic
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
- Civilians are simple instanced figures. They don't animate in detail.
- Mouse feel, pointer lock and the music have not been verified by a human player in this build; see the playtest checklist in the final report.

Git tags: `v1.0` is the single-street original and `v2.0` is the vertical district wave shooter.
