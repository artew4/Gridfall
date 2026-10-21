# NEON RAIN 8.0: Four Settings, Tactical AI, 5v5 Team Deathmatch on Neon Docks

One night in Shinjuku. One gun you'd rather keep holstered. One last train. Or an outpost in the dunes, and a sandstorm coming. Or a walled firebase deep in the rainforest, and a road up to its gate.

A single-player stealth-action game built with Three.js + TypeScript + Vite. Its engine (controller, shooting, AI, collision, survival waves) now runs several settings. Everything (geometry, textures, signage, sound and music) is generated procedurally at startup: no external assets.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # type-check + production build into dist/
```

On the main menu, pick a **setting**, then a **mode**. In a run, the pause menu (Esc) has **QUIT TO MAIN MENU** (it asks for confirmation). The click also unlocks audio and captures the mouse. Any key or click skips the opening. The menu remembers the last setting; `?setting=tokyo`, `?setting=desert` or `?setting=jungle` in the URL picks one directly.

| Setting | Modes |
|---|---|
| **TOKYO NIGHT** — rain, neon, a vertical district over a metro station | Story Escape, Arcade Survival |
| **DESERT OUTPOST** — open dunes, harsh sun, sandstorms | Arcade Survival |
| **DEEP JUNGLE** — temple ruins under the canopy, mist, close quarters | Arcade Survival |

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

## Deep Jungle

- **The map (3.7, Firebase Viper):** a walled paramilitary compound in the north half of the rainforest, laid out for an assault.
  - You start on a mud road at the south edge of the map. It winds up through the jungle (boulders, an outer checkpoint with a sandbag bunker, a burnt-out jeep, a half barrier) to the gate.
  - Round the wall is a 7 m cleared strip: bare ground, the kill zone. Concertina wire across the south strip funnels a frontal attack to the gate.
  - The gate sits between two bunker towers (snipers on top). There is also a narrow postern in the north wall and a blown breach in the west wall.
  - Inside:
    - the **barracks** (bunks, lockers, a rifle rack; the defenders turn out of here);
    - the **comms center** (consoles, server racks, a map table; an outside stair to a roof with a radio mast and a dish);
    - the **watchtower** by the gate (a sandbagged platform 4.5 m up);
    - a **motor pool** carport (a six-wheel truck, a jeep, a fuel bowser);
    - a **supply depot** of shipping containers under a camo net;
    - an MG nest facing the gate, jersey-barrier and HESCO lines, the flag, a helipad.
  - Cover: outside, giant buttressed trees, fallen logs and boulders; inside, sandbags, concrete barriers, crates, containers and the parked vehicles.
  - Floodlights and bulbs can be shot out. Three electrical cabinets (the gate, the barracks, the comms center) discharge into anyone standing near.
- **The air:**
  - teal mist hangs low on the forest floor (it stays out of the rooms);
  - visibility is about 58 m;
  - morning sun breaks through the canopy in flecks, and the canopy opens over the compound (the light on your gun changes as you walk through them and goes when you're under a roof);
  - insects, birds, frogs and dripping leaves. The insects fall silent after a gunshot.
- **Your weapon:** the BOAR M12 pump shotgun.
  - Eight pellets per shell, devastating up close: one shell drops a breacher out to about 8 m. It falls off fast beyond 10 m.
  - After each shot you rack the pump.
  - Six shells, loaded one at a time. Pull the trigger to stop loading and fire.
- **The enemies:** the paramilitary garrison, in olive-drab tiger stripe with black plate carriers, helmets, gloves and boots.
  - Breachers (black balaclavas, amber goggles, knee pads, short black machetes) rush you.
  - Riflemen (helmets with night-vision mounts and headsets, radios, black rifles with optics and lasers) take cover, and snipe from the gate towers, the watchtower and the comms roof.
- **Survival:**
  - Attackers come out of the jungle, at least 30 m away and mostly from behind you (on the far side from the compound), so they push you toward the gate. They see no further through the mist than you do (50 m).
  - Defenders turn out of the barracks once you're 14 m or more from it (about a third of spawns while it's eligible).
  - Plants hide bodies but don't stop rounds.
  - Medkits are in the comms center and on the watchtower.

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
- **Team Deathmatch 5v5** (Desert Outpost, 6.0): you and four allied bots (ALPHA, blue) against five bots (OMEGA, red). Each team has 25 tickets; every death costs one; the dead respawn at their base after 3–5 s while their team has tickets; the first team to run out loses. Details below.
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
| High Quality | 120 | up to 1.5× | 3 levels | on |

- The frame cap (30/60/90/120) can also be set on its own.
- Game speed doesn't depend on the cap: everything is time-based.
- The title screen draws at most 30 FPS, and 10 FPS when the window isn't focused.
- A paused game draws nothing.
- In a hidden tab, rendering stops, audio is suspended and a running game pauses. It stays paused until you resume.
- Resolution adapts down if the frame rate can't hold the cap.
- A preset changes resolution and frame rate, never the look (4.1): bloom shape and grading belong to the setting. Light flicker is timed in seconds, not frames, so signs flicker the same at 30, 60 or 120 FPS.

### Tokyo look (4.0)
The world renders through one post chain: scene → viewmodel → UnrealBloom → grade (aberration, split-tone, vignette, grain, fades) → OutputPass (ACES filmic, sRGB). The HUD, crosshair and menus are HTML over the canvas, so bloom and grading never touch them.
- **Bloom only from emissives:** threshold 1.0 (HDR luminance), strength 0.7, radius 0.9. Neon, lamps, muzzle flashes and sparks are brighter than 1; lit walls and streets never are.
- **Teal and orange:** shadows lifted toward teal, highlights pushed warm, highlights a little more saturated.
- **Wet streets:** mirror-flat puddles (roughness 0.02, a touch of metalness), damp rims (0.32), dry asphalt (~0.6). Neon spills into the puddles below eight signs in Lantern Street and the plaza (a specular-only light evaluated by the ground shader), next to the existing reflection streaks.
- **Street AO:** alleys, wall feet and the ground under walkways are darker, from a small occlusion texture baked from the map at load (15 ms).
- **No real-time shadows in Tokyo** (none in 3.7 either): night light comes from neon, and a muzzle-flash shadow would need six extra scene renders per shot.

### Desert look (4.1)
- **Harsh sun:** 1.6× brighter (sunlit ground ~59% brighter than 3.7; the shade, lit only by the sky, stays as it was), with a glare corona round the sun disc.
- **"Wasteland" grade:** a bleach bypass (drained midtones, crushed deep shadows, a contrast push), then amber-yellow pushed into the sunlit range.
- **Bloom only above the brightest sand:** threshold 1.0. Sunlit sand never blooms; the sun, glints on the (now glossier) metal debris and vehicles, and sunlit specks in the dust do.
- **Heat haze:** a shimmer in a band just below the horizon in clear weather, outdoors only. The gun never wobbles.

### Jungle look (4.2)
- **"Oppressive jungle" grade:** the darks are re-hued deep green-teal (multiplied, so they stay dark) and slightly crushed, the mids drained a little so the greens go murky, and the highlights (sun flecks, light shafts, wet sheen) pushed toward a sickly yellow-green.
- **Murky air:** thicker green-grey fog (90% opaque at 51 m, 3.7: 58 m): the far jungle melts away, the compound stays readable. Enemies see as far as the fog lets you, as before (now 43 m).
- **Wet mud:** puddles and muddy patches in the forest floor and the yard, water standing in the ruts of the approach road and the vehicle tracks through the compound. Wet spots are darker and glossy, with no textures added.
- **Wet leaves:** foliage is glossier, so it catches the canopy light.
- **Light shafts:** five shafts of sun break through the canopy onto the watchtower, the middle of the yard, the flag and two giant trees by the cleared strip. Each lands on a matching sun fleck on the ground. They are light only: you, enemies and bullets pass straight through them.

### Team Deathmatch (6.0)
- **The arena:** Desert Outpost becomes a symmetric battlefield. ALPHA holds the south base, OMEGA the north: walled yards you can't be shot into, with three exits each behind a blast wall. Three lanes join them: the centre through the outpost (open yard, roofs and windows over it: the short, dangerous way) and two flanks out in the dunes, each running through a ruined hamlet on one half and a dry wadi (sand berms, rocks, a burnt APC) on the other, with a pump house at the midpoint. Everything is mirrored 180° about the flagpole, the dunes included, so neither side has better ground.
- **Your squad:** Maxim, Anatoly and Kostya (riflemen) and Ilya (a blade), with their names and health over their heads, blue-grey kit and cool-white tracers. Their callouts carry their names.
- **They play round you.** The squad can't order you, so it reads what you do: lay down steady fire and they flank ("Hold them there, flanking!"); push and an extra rifle covers you ("Covering your advance!"); work round one side and they take the other; fall back and they cover you. Enemies you can see are called out to them.
- **Friendly fire is off:** your rounds and theirs pass through teammates, and a rifleman won't fire with a teammate in his line.
- **HUD:** tickets at the top, a kill feed on the right, a respawn countdown with your killer's name. Spawns are protected for 2 s.

### Arena bots (7.0)
Team Deathmatch bots no longer fight like survival enemies. They play like players:
- **No hesitation.** A bot that sees you turns and fires on the spot. Its first rounds at a new target go wide and tighten within a third of a second.
- **They keep moving.** They strafe while they shoot, sprint between fights, jump when they are hit, and vault sandbags, jersey barriers and the wadi berms without stopping.
- **Cover is for reloading.** A bot ducks out of your line only to reload under fire, when it is losing a trade, or when two of you are on it, and never for more than about a second and a half.
- **They finish the job.** Hurt one badly and its attacker (and at most one more) drops everything and rushes in for the kill. The blades rush anyone wounded or reloading.
- **They know the map.** Each team keeps a board of everyone seen, heard firing or called out in the last few seconds, and runs at the freshest contact. The team pushes when it has the numbers, holds its ground when it's even, and regroups when it's down. Every lane stays covered.
- **Survival is unchanged.** Tokyo, the jungle and the desert's survival mode still run the 5.0 tactical squads (cover, suppression, flanks, searches).

### Neon Docks (8.0)
A harbour at night, in the rain, built for Team Deathmatch only. Three lanes run from base to base:
- **The stacks:** a maze of shipping containers with tight corners and corridors two metres wide. Steel stairs lead up onto a couple of roofs. They are blue on your side, yellow in the middle and red on theirs, so you can call where the enemy is.
- **Warehouse 7:** the meat grinder. Catwalks run along both walls, with stairs up from the doors, and a bridge crosses the middle.
- **The quay:** open concrete along the water, under a gantry crane, with long sightlines for riflemen.

Side doors, gaps in the stacks, an outside stair to a catwalk door, and the forecourts at both ends let you switch lanes and flank. It's wet everywhere, lit by sodium and LED floodlights, with neon reflecting in the puddles.

TDM is all rifles now: since 8.0 the two blades on each roster fight with rifles. Survival still has its melee rushers.

### Jungle Team Deathmatch and music (9.0)
- **Deep Jungle has 5v5 TDM.** ALPHA starts at LZ Alpha (the walled landing zone round the south end of the road, where the assault begins) and OMEGA at LZ North (a helipad yard behind the compound).
  - The firebase is the middle, with four ways in: the main gate, the north postern, the old west breach, and two new routes: a blown section of the east wall, and a drainage culvert through the south wall west of the gate that skips the gate's kill zone and the wire.
  - Or go round the compound through the jungle on either side.
  - Survival plays the same map with its original start and spawns.
- **Music per place.** The title screen, Tokyo, the desert, the docks and the jungle each have their own track, crossfaded over two seconds, looping, and paused when the tab is hidden.
  - The game ships synthesised placeholders that follow the fight's intensity.
  - **Your own music:** drop `menu_theme.mp3`, `tokyo_theme.mp3`, `desert_theme.mp3`, `docks_theme.mp3` or `jungle_theme.mp3` (or .ogg, .m4a, .wav) into `public/audio/music/` and reload. See `public/audio/music/README.md`.

### Combat polish (8.1)
- **Kinetic and energy weapons look different.**
  - Rifles and shotguns, yours and the enemy's, fire thin, fast, glowing yellow-orange tracers and throw brass that bounces and settles on the floor, then disappears after a few seconds.
  - The Kitsune and the neon synths keep their plasma bolts.
- **Silent TDM.** Nobody calls out in Team Deathmatch, so an enemy's callout can't give his position away. Survival squads still talk.
- **Fair fog.** In a sandstorm the TDM bots see no further than you can, and their aim gets worse with the dust between you.
- **A brighter Neon Docks.** Warm floodlights over every lane, with the sky and the water still dark.

### Survival tactics (5.0)
The survival enemies fight as a squad, in every setting:
- **They take real cover.** A rifleman hunkers where the obstacle actually hides him from where you are, then pops up or leans out, fires a burst after a short laser warning, and ducks again. Walk round his cover and he notices within a fraction of a second ("He's flanking!") and moves.
- **Roles.** One or two riflemen keep you pinned (suppressors keep shooting at where you were for a moment after you duck), the others work round your sides ("Flanking left!"). The melee units hold back on different sides and come in together when you reload in plain view, take a hit, turn your back, or once enough of them are in place ("Go, go, go!").
- **Suppression.** Rounds cracking past a rifleman pin him: he ducks and stops shooting for a couple of seconds. Melee units juke sideways.
- **No wallhacks.** Break line of sight and they go to where they last saw you, then spread out and search the area, then give up and roam. They hear your shots (roughly). In the jungle, thick undergrowth hides you from them as it hides them from you; the desert storm and the fog limit everyone's sight.
- **Callouts** appear above the enemy who said them (dimmer when you can only hear him) with a voice from where he stands.

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
  - `await __dev.bench(3)`: fixed benchmark scenarios for the loaded setting (Tokyo, the desert or the jungle). Compare the results with `docs/BENCH-3.2.json` … `docs/BENCH-4.2.json`. A measurement only counts if the window stayed focused, visible and in play (`valid`); an unfocused window or Chrome's Energy Saver caps the frame rate.
  - `await __dev.bench(3, { pipelines: ['v4', 'raw', 'v37'] })` (4.0): every scenario in each render pipeline, interleaved.
  - `await __dev.sheet(['yard', 'tower'], ['v37', 'v4'])` (4.2, jungle views): a contact sheet of frozen frames in an overlay (click to close). `await __dev.hdr(names, hide?)`: linear HDR luminance percentiles per view, or, with `hide`, of the pixels those objects add.
  - **F8** (dev server only) cycles the render pipeline: 4.0 → RAW (no composer, the same materials) → 3.7 (the old look and materials) → 4.0. In the desert it switches the 4.1 additions (sun, grade, glare, glints, metals, haze) the same way. `__dev.pipeline('v37')` does the same from the console.
  - `__game.safety.recoveries`: how often the out-of-bounds safety net fired. It should stay 0, and each recovery is logged as `[safety]`.
- Survival tactics (5.0):
  - `await __dev.tactical()`: headless scenarios on the loaded setting: roles (suppressors, flank sides, shot tokens, rushes), the same with a moving player, flanking a gunner's cover (time until it relocates), suppression (pinned, silent, resumes), losing the squad (hunt, search, never his live position), the desert storm, and a 120 s soak (bounds, inside geometry, stalls, cost).
  - `await __dev.tactics(true)`: overlay with roles, actions, cover lines (green while the cover hides the hunkered body from you, red once blown), peek spots, rush slots, the LKP and the search points.
  - `await __dev.survival({ setting, seconds, startWave })`: a bot plays Arcade Survival (moves, aims, fires); reports kills, damage events, enemy shots, action shares, callouts and integrity.
  - `await __dev.aiBench()`: 10 enemies per setting; AI milliseconds per frame (average, P95, P99, worst) and rays per frame. Compare with `docs/BENCH-5.0.json`.
- Team Deathmatch (6.0), on the desert:
  - `await __dev.tdmSoak({ seconds: 300, timeScale: 2 })`: the bots play alone (you spectate in god mode, tickets 999): kills per minute, ranges, flank kills, what victims were doing, stuck bots, friendly-fire counters, scheduler pressure, AI cost.
  - `await __dev.tdmBench({ withPlayer: true })`: frame cost at 1x with all nine bots fighting (AI ms, rays, decides per frame, FPS, CPU, GPU).
  - `await __dev.friendlyFire()`: rounds through teammates (each team), your shots through allies, a teammate's blade, check-fire, rounds at you; `ok: true` when nothing hurts a teammate. Compare with `docs/BENCH-6.0.json`.
- Stairs (9.1): `__dev.world()` also reports a stair flush with a wall (`stair flush with wall`); `await __dev.stairGaps()` lists every stair-to-wall gap (3 cm) and presses a body into each one to check it keeps its floor (`drops: 0`).
- Music (9.0): `__game.debug().music` (current track, file or procedural, live sources, files found); `await __dev.musicSoak({ cycles: 3 })` cycles every level and the title and checks that every music source is disposed (`unaccounted: 0`).
- Arena bots (7.0), on the desert. Every TDM check takes `ai: 'arena'` (the default) or `ai: 'tactical'` (the 6.0 squads):
  - `await __dev.tdmSim({ ai: 'arena', tickets: 25 })` plays a whole match headless, bot vs bot. It steps a fixed 1/60 s with no rendering, as fast as the CPU allows, so the result doesn't depend on the window's frame rate. It reports:
    - match length, kills per minute, kill ranges;
    - how much the bots move, crouch and stand still;
    - jumps, vaults, pushes and push kills, BREAK share, target switches (and why);
    - sight-to-first-shot times, stuck bots, friendly fire;
    - AI ms per step and the sensing counters.
  - `await __dev.tdmAB({ runs: 3 })`: `tdmSim` for both AIs, alternating, with the medians side by side. Compare with `docs/BENCH-7.0.json`.
  - `TDM.ai = 'tactical'` (in `src/levels/Tdm.ts`) brings back the 6.0 bots in play.
- Neon Docks (8.0): every TDM check runs on the loaded level if it has an arena (`?setting=docks`). `tdmSim` also reports time and kills per zone and the share of time off the floor, and takes `roster: 'any'` (blades back) and `laneLeave: Infinity` (lane discipline off) for A/Bs. `bench(3)` has a docks set: seven views and a firefight, with the match running.
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
- `src/levels`: the level contract and registry, arcade rules, and one folder per setting (`tokyo`, `desert`, `jungle`)
- `src/entities`: weapon specs and enemy looks per setting (`weapons/`, `enemies/`)
- `src/player`: FPS controller and the viewmodel weapon (holster, recoil, reload, pump and tube-loading mechanics)
- `src/enemies`: models (merged per joint), Runner, Gunner (two-rate tactical brains), nav and arcade waves
- `src/enemies/tactics`: the squad director, time-slicing scheduler, utility selection, dynamic cover and generated cover spots, callouts
- `src/levels/docks` (8.0): Neon Docks, the TDM arena (plan, lanes and zones in `DocksLayout`)
- `src/enemies/Roster.ts` (8.0): roster filtering (a mode requests unit classes)
- `src/enemies/arena` (7.0, Team Deathmatch only): the deathmatch brain, the arena director (fronts, momentum, contact board, push claims), attention-driven sensing, jump and vault movement, the arena bodies
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
- Jungle:
  - Plants are soft: they hide bodies but don't block bullets or enemy sight (by design: no alpha cut-outs to ray-test against).
  - The forest floor uses the sand footstep sound.
  - Survival runs on the assault layout, but there is no assault mission yet: no objectives, no scripted breach, the gate is always open.
  - Concertina and the compound's walls block sight for enemies as well as movement (the nav graph needs them to).
  - The shotgun's feel (recoil, pump timing, sound) and the base's flow (is the push to the gate natural?) have not been checked by a human player.

Git tags: `v1.0` is the single-street original, `v2.0` is the vertical district wave shooter, `v3.0` is the cinematic escape before the stealth overhaul, and `v3.1` is the stealth and pursuit overhaul.
