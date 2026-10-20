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
- Guards don't pick cover. In a fight they hold a spread-out ring around you and sidestep while aiming.
- Minimap cones are clipped against walls at eye height. They don't show the vertical limits of a guard's view.
- Footsteps make no noise. Only gunshots are heard.
- Civilians are simple instanced figures. They don't animate in detail.
- Mouse feel, pointer lock and the music have not been verified by a human player in this build; see the playtest checklist in the final report.

Git tags: `v1.0` is the single-street original, `v2.0` is the vertical district wave shooter, and `v3.0` is the cinematic escape before the stealth overhaul.
