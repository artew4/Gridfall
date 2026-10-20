# NEON RAIN 3.1: stealth and pursuit overhaul

Branch `feature/stealth-pursuit-overhaul`. Baseline tag `v3.0` (commit 4b4fa6e).

## Root causes (confirmed by reading the code and reproducing)

### Long-range detection
- `sightRange()` allowed 30 m with a drawn weapon and 32 m once a guard "remembered" the player. Remembering also meant a 4/s recognition rate: re-identified in 0.25 s from 32 m.
- A hostile guard overrode the cone: it saw the player within 28 m whenever cos > 0.2, which is roughly a 157° arc.
- The cone was horizontal only. A guard right below the player could see straight up.

### Omniscient pursuit
- `Security.contact()` wrote the player's exact position into `alert.lastKnown` on every perception tick of any guard that saw him.
- Every pursuing guard read `lastKnown` whenever it was newer than its own sighting. So one guard's live view became every pursuer's goal, map-wide.
- `trackUntil` copied the live player position into the goal for 1.5 s after sight was lost.
- In combat, guards faced and orbited `player.pos` even without sight. When the player was on another level, they pathed straight to the live position.

### Seeing through the ground
- `CollisionWorld.raycast` tested the ground plane only for downward rays starting above y = −0.5.
- An underground guard looking up at a street-level player therefore had a clear ray through the street surface.

### Kenji
- `talk()` set `talkT = 0`. The first line is scheduled at t = 0, and the emit test `before < at && talkT >= at` is false at 0, so nothing appeared for 3.6 s.
- The step stayed `meet`, so "TALK TO KENJI" stayed on screen.
- Each further E reset `talkT` to 0 and restarted the silent conversation. Pressing E looked like it did nothing.

## Design

### Perception
- `stealth/Perception.ts` holds a single `VISION` config: 85° horizontal cone, vertical limits of 40° up and 55° down, 16 m direct range, 9 m to recognise a holstered unknown, 22 m while engaged, plus peripheral and touch radii.
- It also holds `visionRange()`, `sightZone()` and `suspicionRate()`. Guards and the minimap both use them.
- 3D line of sight samples three body points (head, chest, knees). Partial exposure slows recognition.
- Cheap checks run before any ray: range, then cone. Perception runs at 8 Hz near the player and 3 Hz beyond 40 m.

### Guard knowledge
Each guard keeps these separately:
- `sees`, suspicion and `lastSeen` (own sighting plus its velocity);
- `heard` (approximate, noisy);
- `radio` (snapshot from dispatch);
- the search plan;
- `goal` (navigation).

Nothing reads `player.pos` without current sight.

### Dispatch
- On a confirmed sighting, dispatch sends a snapshot to up to 3 guards within 60 m radio range.
- During contact it repeats the snapshot every 3 s to pursuers.
- The reinforcement budget per episode is unchanged (finite).

### Search
- When contact is lost, guards first head to the predicted spot: last seen position plus velocity × 1.2 s.
- `Security.organiseSearch` then gives each guard a role:
  - **sweep**: the last known position and its surroundings;
  - **probe**: further out, in the direction of travel, including other levels via stairs;
  - **hold**: watch a point near the last known position.
- The search radius grows over time.
- Search lasts 25 s and is extended by new evidence. Patrols resume afterwards.

### Navigation
- If a goal has no route, the guard goes to the reachable node nearest to it and searches from there.

### Minimap
- Cones come from the same `VISION` maths.
- Each cone is clipped against walls with 13 rays, refreshed only while the guard is observed.
- Colours: yellow patrol, orange suspicious, red hostile.
- Cones are drawn only for guards on the player's floor band. Guards on other floors show as hollow dots with ▲/▼, plus a dashed cone if that guard currently sees the player.
- Stale entries keep the pose last observed and fade out.

### Interactions
- `core/Interaction.ts` is a pure controller for tap and hold, so E fires once and the prompt clears.
- Kenji gets a `talk` step and a `Conversation` sequencer that emits line 0 immediately.

### Dev only
- `__dev.ai()` draws a 3D overlay: cones, LOS rays, state and suspicion labels, last known positions, search points and nav goals.
- `__game.checkVision()` runs the geometry scenarios.

## Phases
1. Diagnosis (this doc).
2. Perception.
3. Pursuit and search.
4. Minimap.
5. Kenji and interactions.
6. Tuning.
7. QA.
