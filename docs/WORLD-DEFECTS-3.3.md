# NEON RAIN 3.3 — world defect inventory

- **Baseline:** tag `v3.2` (commit 9aa10cf).
- **Found by:**
  - the real-controller brute force at the platform;
  - `__dev.world()` (reachability, boundaries, visual-vs-collision);
  - `__dev.stress()` (real controller from sampled cells);
  - screenshots.
- **Coordinates** are world metres (x, y, z).
- **Severity:** C = critical (release blocker), H = high, M = medium, L = low.
- **Status:** F = fixed, A = accepted (by design, explained).

## Critical and high defects

| ID | Sev | Region | Where | Description |
|---|---|---|---|---|
| WD-01 | C | Train interior | (−9.8 ± 9, −6, 34.3–36.3) | Jumping inside a car threw the player sideways through the car wall onto the platform or into the track pit. |
| WD-02 | C | Platform edge | z 33.06–33.74, all 12 doors | The player could slip off a door threshold into the gap between the screen doors and the train and fall into the track pit. From there the tunnels led off the map (x beyond ±46). |
| WD-03 | H | Train (moving) | track, x ±170 | The moving train had no collision at all. |
| WD-04 | H | Thin walls (train ends 0.08 m) | car ends | Sprinting into very thin walls at 20 FPS could tunnel through. |
| WD-05 | C | World-wide, under ceilings and on stairs | e.g. entrance C stair (−35.3, −4.2, 5.8) | A fast fall or jump sank the feet below a floor top within one frame. The floor was then treated as a wall and the player was thrown sideways through the next wall, into the rock beyond the service corridor. |
| WD-06 | C | Sky Garden roof, south-east corner | x 40–48, z 15, y 8.5 | No parapet or building edge: the player could walk off into an empty plane outside the city and leave the map. |
| WD-07 | H | West Terrace roof | (−14…−10, 8.5, 23.1–23.7) | A 0.62 m pocket between the greenhouse and the parapet, which the player could wedge into and end up partly inside geometry. |
| WD-08 | H | Concourse | (11.4–13.8, −6, 22.6–23.24) | A 0.64 m pocket between the kiosk and the fare fence: same wedging. |
| WD-09 | H | Entrance B (platform ceiling) | x −17.7…−7, z 27.2–29, y −1.2…0 | The opening in the platform ceiling had no slab edges. Looking up from the platform you saw void around the stair, which matches the reported "unfinished surfaces". The stair's south side was an unrailed 6 m ledge. |

### Root causes and fixes (critical and high)

**WD-01:**
- **Root cause (RC-1):** `resolveCircle` treated any collider overlapping the body height as a wall. The 2.45 m car ceiling overlaps the head during a jump, and its least-penetration push exits through the side.
- **Fix:** a ceiling stop. `CollisionWorld.ceilingAbove` stops the rise inside each sub-step, and colliders at or above the head are skipped.

**WD-02:**
- **Root cause (RC-3):** the gap between the screen doors and the car is 0.68 m, just under the body's 0.70 m. Thresholds are 1.8 m wide but car doors only 1.3 m, so the sides of each threshold led into the gap.
- **Fix:** door guides (visible metal jambs) from the screen-door line to the car body, exactly 1.3 m apart. The gap is no longer reachable.

**WD-03:**
- **Root cause (RC-4):** train colliders were enabled only while `|x| < 0.01`.
- **Fix:** dynamic colliders (`CollisionWorld.addDynamic` / `moveDynamic`) that follow the train while it is visible; door colliders block while doors are less than 60% open; riders are carried by the car.

**WD-04:**
- **Root cause (RC-2):** a step of 0.39 m (sprint at the 1/20 s dt clamp) against a radius of 0.35 plus half of a 0.08 m wall.
- **Fix:** movement is sub-stepped to at most 0.15 m, and the train shell walls are thicker (0.26 m).

**WD-05:**
- **Root cause (RC-5):** landing was resolved only after the whole frame's move.
- **Fix:** land inside each sub-step, on the highest floor at or below the feet before that sub-step.

**WD-06:**
- **Root cause:** a missing boundary. The two neighbouring buildings end at z = 15 and at x = 40, leaving the corner open.
- **Fix:** a parapet plus a visible security fence (2.45 m), because a sprint-jump off the rooftop table clears a bare 1.1 m parapet.

**WD-07 and WD-08:**
- **Root cause (RC-6):** two colliders closer than the body width. The push-out iterations can't separate the body from both.
- **Fix:**
  - level: the greenhouse is 0.4 m shallower and the kiosk moved 0.4 m (gaps now over 1 m);
  - engine: if a sub-step ends still overlapping, return to the last position that fitted. Re-adding the old greenhouse collider gave 9 of 12 runs inside geometry with the 3.2 controller and 0 of 12 with 3.3.

**WD-09:**
- **Root cause:** hole B was not a room, so it got no generated walls; the slab edges were never built.
- **Fix:** fascia walls on the three open edges (ceiling to street) and a south handrail on the stair.

## Medium and low defects

| ID | Sev | Region | Where | Description | Fix |
|---|---|---|---|---|---|
| WD-10 | M | Lantern Street rooftops | x ±5, z 15–24, y 8.5–9.4 | The facade cornice ran across the rooftop bridge landing (z 19–21): a solid-looking wall you walk through. | Walkable roofs no longer get the facade cornice; their real parapets already leave the opening. |
| WD-11 | M | Fountain Plaza, metro entrance A | (11.5–14.9, 1.2–2.6, 3.2) | The street departure board hung at head height with no collider; you walked through it. | A collider, plus a second post so it reads as a sign on legs. |
| WD-12 | L | Tech Roof bridge | (41, 5.4–9.6, −3.1…−2.1) | A vertical neon sign's frame passed through the rooftop bridge. | Sign moved to x 45.5. |

## Accepted (not defects)

| ID | Region | Description | Why accepted |
|---|---|---|---|
| A-01 | Lantern Roof | Hanging laundry has no collider. | Cloth you brush through. Marked `userData.soft`. |
| A-02 | Metro entrances | Shutter planes look solid for about 1 s while rolling up. | Animation; the collider is already off once open. |

## Reported but not reproduced: "invisible walls"

After fixing a false positive in my checker (glass now counts as visible), the systematic check found **no collider without a visible surface** on any reachable step. It also found **no** open-looking gap that blocks a passage without a short way round, after excluding wall corners.

**Likely explanation (not proven):** RC-1, RC-5 and RC-6 made the player bounce off things or get thrown back in places that looked open, especially under walkways, on stairs and inside the train. If an invisible wall is still found in play, record its coordinates and run `__dev.world()` plus `__dev.colliders(true)` there.
