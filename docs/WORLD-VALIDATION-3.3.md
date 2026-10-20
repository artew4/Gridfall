# World validation (3.3)

How the map is checked, what each check proves, and what it cannot prove. All the tools are DEV only: they are loaded with dynamic imports behind `import.meta.env.DEV` and are not in the production bundle.

## How to run

1. Run `npm run dev` and open the page.
2. Open the console.
3. Start a world: `__dev.start('story'); __dev.god(); __dev.noGuards();`

| Command | Takes | Pass condition |
|---|---|---|
| `await __dev.world()` | ~0.3 s | `counts` is empty: no findings. |
| `await __dev.stress({ samples: 800, fps: [20, 30, 60, 120, 'spiky'] })` | ~10 s | `failures: 0` |
| `await __dev.train()` | ~3 s | Boarding, riding and doorway all have 0 failures. |
| `npx vitest run` | <1 s | All tests pass. The collision regressions RC-1, RC-2, RC-5 and RC-6 fail on the 3.2 controller. |
| `await __dev.story()` | ~3 min | The run reaches the end card, and `__game.safety.recoveries === 0`. |

## What each check does

### `world()`: map-wide reachability

1. **Find floors.** On a 0.5 m grid over the whole map plus a margin, every standable floor at every height: the ground, boxes, ramps and dynamic colliders.
2. **Test standing.** "Standable" uses the real `CollisionWorld.blocked` for a 0.35 m body that is 1.8 m tall.
3. **Explore.** A breadth-first search from the start, with the moves the controller can make:
   - walk up to 0.5 m higher;
   - jump up to 1.0 m higher;
   - drop down onto the highest floor below;
   - long drops (up to 3 cells), checked with line-of-sight clearance.
4. **Report** reachable cells that are any of:
   - outside the playable extent;
   - in the track pit;
   - outside every designed zone;
   - with no way back to the start (a trap);
   - more than 10 m above the floor below (a fall that hurts).
5. **Report visual mismatches:**
   - **invisible walls:** a solid collider on a reachable step with no visible piece covering it (glass counts as visible);
   - **walk-through visuals:** a box or plane visual over a reachable step with no collider;
   - **narrow gaps:** a gap narrower than the body with no short detour (corners are excluded).

### `stress()`: the real controller everywhere

- **Inputs:** `Player.update` from sampled reachable cells, in 8 directions, walking and sprint-jumping.
- **Frame rates:** per frame-time profile. `'spiky'` mixes 120 FPS frames with hitches at the game's 1/20 s clamp, and is seeded so a failure reproduces.
- **Fails if** the body:
  - crosses a solid collider between two frames (a swept test);
  - falls into the pit;
  - leaves the extent;
  - after one idle settle frame, is still inside geometry or standing on nothing.

### `train()`: train and doors

- **Boarding:** 12 doors × 7 approach angles × walk/sprint × 20/60 FPS, with the doors open and with them closed.
- **Riding:** inside a car that pulls out, jumping and walking.
- **Doorway:** with the real `Rail` and timetable, someone stands in each doorway as the doors close. They stay, step back, or board. They must never be shut in, never reach the pit, and must not hold the train for long after stepping back.

## Results at the end of 3.3

| Check | Result |
|---|---|
| `world()`, station open | 14,486 reachable cells, all designed zones, **0 findings** |
| `world()`, train at the platform | doors open: 0 findings, and the car interior is reachable; doors closed: the interior is unreachable |
| `stress()` at 20/30/60/120 FPS and spiky, 800 samples | **0 failures in 64,000 runs** |
| `train()` | boarding 0/672, riding 0/36, doorway 0/36 |
| Story autoplay | end card reached, 0 safety recoveries |

## What this does not prove

- **The grid has limits.** It is 0.5 m. Gaps narrower than that between cells, and moves the controller cannot make in the BFS model (for example chained wall-jumps), are not explored. The stress test samples 800 of the 14,486 reachable cells, not all of them.
- **Screenshots show appearance only.** Collision correctness comes from the scans and tests above.
- **Hand feel needs a person.** Mouse feel, how the stairs and the train feel to play, and readability need a human playtest.
