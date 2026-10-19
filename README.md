# NEON RAIN: Tokyo After Midnight

One street. One gun. Endless neon rain.

Atmospheric wave-survival FPS demo built with Three.js + TypeScript + Vite. Everything (geometry, textures, signage, sound) is generated procedurally at startup: no external assets.

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
| Esc | Release cursor / pause |

## Structure

- `src/core`: game loop and states, renderer + post chain (bloom, grade, aberration, grain, letterbox), input, math
- `src/world`: city layout and AABB collision, wet asphalt shader and reflection streaks, neon signs and flicker, props, GPU rain/splashes/steam, train
- `src/audio`: Web Audio synthesis (rain beds, hum, sirens, thunder, train, layered gunshot through a procedural alley reverb)
- `src/player`: FPS controller, pistol (springs, reload timeline, muzzle flash)
- `src/combat`: instanced particle pools, shells, decals, tracers
- `src/enemies`: procedural models, Runner and Gunner AI, waypoint navigation, plasma bolts, wave director
- `src/cinematic`: opening cutscene
- `src/ui`: DOM HUD
