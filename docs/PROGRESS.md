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

## Verification commands
- `npm test`: vitest unit tests (stealth state machines, rect utilities, timetable)
- `npm run build`: type-check plus production build
- In `npm run dev`, from the browser console:
  - `await __game.checkRoutes()`: player routes, vaults/drops, nav connectivity, runner chases
  - `__dev.start('story' | 'arcade')`, `__dev.tp(x, y, z)`, `__dev.god()`, `__dev.noGuards()`, `__dev.record(fn)`

## Next
Phase 4: timetable + metro train + boarding + ending. Then:
- Phase 5: acts and checkpoints, main menu.
- Phase 6: music redesign, minimap, radio.
- Phase 7: polish and review.
