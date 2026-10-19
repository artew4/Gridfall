# NEON RAIN 2.0: Tokyo Vertical District

One district. One gun. Endless neon rain.

Atmospheric wave-survival FPS demo built with Three.js + TypeScript + Vite. Everything (geometry, textures, signage, sound and music) is generated procedurally at startup: no external assets.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

Click the title screen to start (this unlocks audio and captures the mouse). Any key skips the intro.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| LMB (hold for repeat) | Fire |
| R | Reload |
| Shift | Sprint |
| Space | Jump |
| Esc | Pause menu (resume, restart, volume) |

## The district

A compact multi-level arena around a fountain plaza:

- **Fountain Plaza**: the landmark. The fountain is full cover (column) and low cover (basin).
- **Lantern Street**: where you start. Lantern strings, izakaya, a torii.
- **Neon Alley**: a dense neon strip. A tech deck along the wall leads up to the walkways.
- **Service Passage**: sodium light, pipes and steam. A steel stair leads up to the pipe gallery.
- **Railway Street**: runs under the overpass. Trains cross it periodically.
- **Back Alley** and **Trackside**: side routes, so most areas have at least two exits.
- **Upper walkway** (deck at 4.5 m): wraps three sides of the plaza.
  - Four stairs lead up to it. Stairs have visual steps over a smooth invisible ramp, so the camera never bobs on them.
  - It gives height and a view, but snipers on two rooftops and the overpass catwalk can see it, and runners climb every stair.

Interactive objects:

- **Electrical cabinets**: shoot one three times and it discharges into enemies within 6 m (90 damage plus a stun). Stand clear yourself.
- **Medkits**: give +40 HP and respawn after 45 s.
- **Lamps and tubes**: can be shot out.

## Music

The adaptive score has three states: exploration (90 BPM), combat (135 BPM) and intense (150 BPM). Changes happen on bar lines with an equal-power crossfade, and at most two tracks ever sound at once. The pause menu ducks the music; it never restarts it.

To use your own tracks instead of the synthesised ones, add `public/music/manifest.json` plus seamless loop files:

```json
{
  "exploration": { "file": "exploration.ogg", "bpm": 90 },
  "combat":      { "file": "combat.ogg",      "bpm": 135 },
  "intense":     { "file": "intense.ogg",     "bpm": 150 }
}
```

Optional fields per track are `beatsPerBar` (default 4) and `offset` (seconds before beat 1). The game uses the files when all three load and falls back to the procedural score otherwise; no code changes are needed.

Volume settings (master, music, SFX, mute) are saved in `localStorage` (`neonrain.settings`).

## Dev checks

In `npm run dev`, these commands work in the browser console:

- `await __game.checkRoutes()`
  - Walks every route with the real player controller (W key only, no jumping).
  - Checks that the nav graph is connected from every spawn.
  - Sends a runner from every spawn to targets on both levels.
- `__game.debug()`: FPS, draw calls, lights, music state and number of active tracks.

## Structure

- `src/core`: game loop and states, renderer and post chain, adaptive resolution, input, math
- `src/world`:
  - `District`: layout, nav graph, spawns and cover
  - `Architecture`: walkways, stairs, railings
  - `City`: blocks, ground, overpass
  - `PropKit`: props
  - `Fountain`, `Train`, `Events`, `Zones`
  - Box/ramp/cylinder collision with a grid broadphase
  - Wet shaders, neon glows, GPU rain and steam
- `src/gameplay`: cabinets, medkits, breakable lights
- `src/audio`: Web Audio SFX and ambience with volume groups; `music/` holds the director, procedural and file backends, instruments and songs
- `src/player`: FPS controller and pistol
- `src/combat`: particle pools, shells, decals, tracers, arcs
- `src/enemies`: models, Runner and Gunner AI (including rooftop snipers), 3D waypoint navigation, bolts, waves
- `src/cinematic`: opening cutscene
- `src/ui`: HUD, pause menu, settings
- `src/dev`: route check (DEV only)

The original single-street version is tagged `v1.0` in git.
