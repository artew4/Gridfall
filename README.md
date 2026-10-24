<div align="center">

# GRIDFALL

**A multi-biome 3D shooter that runs in your browser: a stealth escape through rain-soaked Tokyo, survival against a squad that hunts you, and 5v5 team deathmatch against bots that play like people.**

### ▶ [Play now in your browser: artew4.github.io/Gridfall](https://artew4.github.io/Gridfall/)

[![Play now](https://img.shields.io/badge/PLAY%20NOW-in%20your%20browser-ff2a6d?style=for-the-badge)](https://artew4.github.io/Gridfall/)
[![Deploy](https://github.com/artew4/Gridfall/actions/workflows/deploy.yml/badge.svg)](https://github.com/artew4/Gridfall/actions/workflows/deploy.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r186-000000?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![WebGL](https://img.shields.io/badge/WebGL-2-990000?logo=webgl&logoColor=white)

</div>

---

Gridfall started as one rainy street in Shinjuku and grew into a full game engine for the browser: four worlds, three modes, two separate AI brains and a render pipeline tuned for each world. Everything you see and hear is generated in code when the game starts: geometry, textures, signage, sound effects and music. The game ships no models, image files or audio files.

No install and no plugin. Open the link, click, play. Desktop browser with a mouse and keyboard; headphones recommended.

## The worlds

| World | What it is | Modes |
|---|---|---|
| **Tokyo Night** | A vertical neon district in the rain: streets, walkways, rooftops 8.5 m up, and a metro station 6 m under the street with trains on a real timetable. | Story Escape, Arcade Survival |
| **Desert Outpost** | A HESCO-walled outpost in open dunes under a harsh sun, where the sandstorm is the normal state and clear air lasts seconds. The compound is in three levels: rooftops joined by bridges and a skybridge, the yard, and a culvert under it. It's mirrored into an arena for TDM. Since 46.0 each main flank has the Block (three storeys and a roof, stairwells at both ends, an atrium you can shoot across and down) and a two-storey house on each team's half; inside them the storm can't reach you. Since 50.0 their roofs can't be climbed, the upper floors have a few barred slits instead of windows all round, and huts stand in the open ground off the middle. | Arcade Survival, Team Deathmatch |
| **Firebase Viper** | A walled paramilitary compound in the rainforest, in mist and dappled light: push up the road, breach the gate, clear the compound. | Arcade Survival |
| **Tokyo: Neon Block** | Tokyo Night's neon after the rain as a 7v7 arena (5v5 until 44.0), a neon-lit smog filling its street canyon up to the landings: at street level a figure fades out by about 11 m, and from the rooftops the streets below are a violet sea (a target 15 m out is mostly hidden). Glows bloom through it, and the bots see exactly what the picture shows: the thicker the smog between them and you, the later they react and the wider they shoot. Above the smog the roofs are clear. The arena is separate from the story district: a mirrored Shinjuku block on three levels. Lantern Alley and its lantern market (a stall, a cart, AC units, a hologram), Main Street with its footbridge, and the service alley at street level; fire escapes, landings, the footbridge, the Lantern Bridge over the west end of the crossing, and the Transit Rail (an elevated track along the east wall with a parked car, bridged from Block E's roof) in the middle; rooftops joined by a skybridge and a plank bridge on top, with a machine room, ducts, billboards and stair heads to fight round. The flank alleys bend through rooms: a pachinko parlour across Lantern Alley, a konbini and a ramen-ya in the service alley. Drop down from a roof, a landing or a gap in the rails to flank, or take the stairs back up. | Team Deathmatch |
| **Deep Jungle** (Crash Site) | The Team Deathmatch jungle, played 7v7 (Firebase Viper stays as it was). Since 33.0 an abandoned research outpost stands in the middle: fight under the lab on its stilts, on its deck, inside it and on its roof by the comms mast. Under it all, tunnels 4 m down: a hub beneath the lab (its stair comes up into the ground floor) and branches out to the ravine and to sunken stair pits at the ridge's foot. A rock ridge along the west cliff with long rifle lines; a 4 m ravine in the east, crossed by fallen giant trees; mossy shipping containers for cover. The undergrowth stays under eye height: you see people standing, crouching hides you. | Team Deathmatch (7v7) |
| **Neon Docks** | A rainy harbour at night, 9v9 since 32.0: a container maze (close range), a roofed warehouse with catwalks (mid range; dry inside) and an open quay under a crane (long range), an old depot and barges on the edges. Reworked in 15.0 (the spawn exits turn out to the flanks, gantries over the containers and along the quay to a crane nest) and 32.0 (a muted palette of deep blues and soft violet, lighter rain, the warehouse roofed again). 49.0: no line runs a lane end to end: the maze laid brick-bond (the gantry over it gone), container walls zig-zag the quay, cargo weaves the barges; inside the warehouse a container at each door, pallet racks and the foreman's office; stair towers at the quay corners lead in at catwalk height and on up to the gantry, whose middle is the crane cab; the crane stair breaks at a perch over the quay. | Team Deathmatch |
| **Old Port** | A brick-and-concrete harbour on a clear morning, the opposite of the neon maps: soft sun and shade, faded containers, a haze over the sea. 7v7 on four levels: an 1890s brick warehouse with a pillared hall and an upper floor lit through its broken skylights; a container yard split by a maze of containers you go through or over, with high stacks joined by a steel walk; a dry dock 4.5 m deep under shipwright scaffolds, its coaster raised on steel stands so the whole dock floor under her hull is a low, lamp-lit room of crates, stands and a scaffold tower (UNDER THE HULL), with each team's second deployment zone at its own end of the dock. No line runs from one side's spawn to the other's. | Team Deathmatch, Arcade Survival |
| **Maglev Terminal** | A white, glass-roofed transit hall at mid-morning, played 7v7, clean and corporate after the rust and neon. A three-car maglev hovers in the middle; its aisle zig-zags through bulkheads, a close-quarters lane. On the platforms either side, holographic billboards, transit-map kiosks and art monoliths break every line from one end to the other into mid-range fights; the sunken track beds are crossed by maintenance gantries; a mezzanine and two skybridges at 5 m. The operators wear light corporate gear here: find them by their silhouette and team accents. | Team Deathmatch (7v7) |

## The modes

The main menu (redesigned in 45.0) is big type and one word a button: **PLAY**, **SETTINGS**, **CONTROLS**, your name top right, the gun in hand over its 3D model with 1–4 to switch. PLAY opens the modes as tabs and the maps as tiles over the live map, the picked map's name huge, and a PLAY slab to start. Click your name to change it (it starts as *Artem*): it shows on your HUD, under your arrow on the minimap, in the kill feed and on the scoreboard. In a match, the HUD keeps the score top centre (ALPHA kills against OMEGA kills), the kill feed top right, and a live board of your team top left (kills, deaths, score, your row in gold). After a match, the result screen lists the next maps for the same mode, so you can go straight into another map (or a rematch) without the main menu.

- **Story Escape** (Tokyo): you are Arashi Kaito, framed for a bombing, and every patrol in the district has your description. Four acts across the streets, the rooftops and the Sakura Line metro, ending on the last express out. Stealth comes first: keep your weapon holstered and stay out of view cones. If you're seen, break line of sight and lose the search.
- **Arcade Survival** (Tokyo, Desert, Jungle): wave after wave of enemies who fight as a squad.
- **Team Deathmatch** (7v7 on Neon Block, Deep Jungle, Old Port, Maglev; 9v9 on Neon Docks; 10v10 on Favelas; 12v12 on the Desert): you and your allied bots against the other team. Since 51.0 each of the map's three fronts (a flank, the centre, a flank) has a point to take by standing on it (a beacon over it in its holder's colour, on the compass and the minimap): you start from your home zone only, holding a flank opens your spawn zone on it, holding more points than the other team drains its tickets, two of the three (a double breakthrough) three times as fast, and the team that loses two goes to its last line (instant respawn from every zone). The bots fight you as hard as they fight each other (50.0): a rifle round of theirs costs you as much as yours costs them, they return fire past their gun's usual range when you shoot them or stand over them, and the better you play the harder the other team plays you (and the reverse). Each match deals you a team at random (ALPHA or OMEGA), so you play both ends of every map: the HUD is your side's, your team on the left in its own colour. Each team has 50 tickets, and a ticket is a respawn: when they run out, every death is final, the team still standing wins, and a team that's behind gets 60 s of sudden death to score a kill or lose. Out of the match yourself, you watch your teammates through their eyes. You don't command your squad: the bots read what you're doing and play around you. Every match deals the bots different callsigns (Jax, Nova, Kuro, Viper…) and each bot a gun from the armory at every spawn. They wear matte tactical gear with small glowing accents in their team colour (a visor strip, shoulder patches, a spine light): cyan for ALPHA, orange for OMEGA. Each team deploys from two or three marked zones in its own half (A, B, C: a glowing pad with its letter floating over it, dressed for the map: neon haze, vines, blowing dust, warning stripes or glass). Every respawn goes to the zone used least lately among those with no enemy near it or in sight of it, then to the safest spot inside it; a match opens with the team split into pairs across its zones. The opening flight lands in your own eyes at the spot you were dealt, then a 3, 2, 1 countdown holds everyone where they stand (nobody moves or fires; switch guns with 1–4) until START!.
  - **Three fronts (44.0):** every map is fought on three lanes (two flanks and the centre), and each lane has a front line where the two teams meet. Win the fights in a lane and its line moves towards their spawn; lose them and it comes back towards yours. The score at the top shows the three lines (your colour from the left, theirs from the right; the lane you're in is outlined, a lane your team is losing pulses red), and the minimap marks each line across its lane. Bots go where they're needed: a respawn reinforces the lane your team is outnumbered in or being pushed back in, often from a rally point just behind that lane's front, and a lane that's winning easily sends a squad to one that's falling back. Push a line all the way to their spawn and hold it, and you've broken through: the other team loses a ticket every few seconds until they push you out. When you respawn, you're sent to the lane where the fight is. Bots search the map between fights, and turn on whoever shoots them from the side or behind, fires close by, or creeps up within a few metres; on Neon Docks they also spread out over it: a crowd fighting from one spot sends one round the side, a second hunter on one enemy comes at it from another angle, and a patrol prefers the lanes its team is short of.

## Gunplay

- **The armory (13.0; four guns since 21.0):** every gun works on every map, and each wins somewhere and loses somewhere. Pick one with **1 / 2 / 3 / 4** while a match starts, after any spawn while you're still in the spawn area (23.0: within 12 m of where you spawned, until you leave it or fire), or (in TDM) while you wait to respawn, for your next life:

  | Key | Gun | How it plays |
  |---|---|---|
  | 1 | Kitsune-9 pistol | the mobility gun: full speed while aiming, sights in 0.1 s, the fastest draw, big head hits; weak body damage, falls off past 25 m |
  | 2 | Hornet SMG | the buzzsaw: highest fire rate, tight from the hip; climbs hard, weak rounds, falls off past 12 m |
  | 3 | Jackal AR | the baseline: steady at mid and long range; wide from the hip |
  | 4 | Boar M12, pump shotgun | one shell drops a man inside 8 m and shoves him back; useless past 15 m, heavy to carry |

- **Stamina (30.0):** sprinting and sliding cost breath, and what you carry decides how much: a full sprint lasts 9 s with the pistol, 5.5 s with the SMG, 3.5 s with the rifle or the shotgun, and the light guns get it back faster. Run dry and you walk until you've recovered a fifth. A thin bar under the crosshair shows it while it isn't full. Bots walk too, and sprint only to cross open ground, flank, push in with a close gun or get out of fire, keeping some in reserve for the fight.

  The bots carry the same four, and fight like them: pistol bots sprint and strafe, shotgun bots slide and hop from cover to close in, rifle bots hang back and aim. The story keeps its own gun (the Kitsune).
- **Finishes by world (21.0):** the same guns wear the map's look, in your hands and the bots'. Neon worlds get dark metal and neon strips. Desert, jungle and port get matte black, olive and camo, nothing glowing, and every round is kinetic. The Maglev hall gets white polymer, carbon fibre and small cyan LEDs.
- **Aim down sights (right mouse):** the view narrows by 15–28% (by weapon), and the gun comes up until its real sights line up with the centre of the screen: the rifle's red dot, the pistol's notch and post, the shotgun's bead.
  - **Steadier:** about half the base spread, a quarter of the movement spread, and less than half the recoil.
  - **The cost:** you move slower (62% with the rifle, 70% with the SMG, 55% with the shotgun, full speed with the pistol), and the mouse turns 30% slower.
- **Crouch (C):** a lower eye and a 1.2 m body. You fit under what a standing body can't, and enemies have less of you to see and hit.
  - **Steadier:** hip fire is about 30% tighter and steps are quiet.
  - **The cost:** you move at 55% speed.
  - **Standing up:** sprinting or jumping stands you up, if there's room overhead.
- **Slide (C while sprinting):** your sprint carries you along the ground, and friction brings you down to a crouch in about 1.2 s (about 6 m). You drop to crouch height at once and can shoot and aim down sights all the way. Jump out of it to keep the speed.
- **Ledge grab (43.0):** jump at a box, a wall or a roof edge you would land just short of, holding W, and you pull yourself up onto it. Tops up to about 1.75 m over the floor you jumped from (a plain jump reaches 1.07 m). The pull-up takes 0.2–0.3 s: up first, then over the lip. The view dips with it, the gun comes down and the trigger is off, and you come out moving forward. Under a low ceiling you arrive crouched. A railing or a tank you are already vaulting stays a vault.
- **Friend or foe (22.0):** allies carry a cyan chevron over the head under their name. On Maglev's white hall the teams wear solid colour blocks on their chest rig, shoulder pads and helmet: ice blue for your team, sand-orange for theirs.
- **The bots hold their guns (22.0):** a procedural low-poly merc rig, both hands on the grips by inverse kinematics, the arms and torso pitching with the aim.
- **Minimap (TDM):** shows your team, and every enemy anyone on your team can see right now. Each red dot fades 2.5 s after the last sighting.

## Technical highlights

### Rendering: one engine, a distinct look per world
- **Stylized PBR:** physically based materials through a custom post chain: scene → viewmodel → bloom → per-world colour grade → ACES filmic output. The HUD is HTML over the canvas, so the grade never touches it.
- **Bloom only from light sources:** an HDR threshold of 1.0, so neon, lamps, muzzle flashes and sun glints bloom; lit walls and sand never do.
- **Procedural wet materials:** Tokyo's streets carry a computed roughness field (mirror puddles, damp rims, dry asphalt), and neon spills into the puddles under the signs. The jungle has wet mud, standing water in the ruts and glossy leaves. None of it uses a texture file.
- **Geometric god rays:** light shafts through the jungle canopy are geometry, each landing on a matching sun fleck on the ground. There's no screen-space pass, so they cost almost nothing and hold up at any angle.
- **Per-world grades:** teal-and-orange neon for Tokyo, a bleach-bypass "wasteland" with heat haze for the desert, an oppressive green-teal for the jungle.
- **60 FPS target:** Power Saving, Balanced and High presets change resolution and frame rate, never the look. Resolution adapts when a frame cap can't be held. All motion is time-based, so 30, 60 and 120 FPS play the same. A hidden tab renders nothing and suspends audio. Point lights share a fixed budget per preset (8 / 16 / 20, the ones lighting the view), so a busy map costs the GPU no more than a quiet one (17.0).

### Two AI engines, one for each kind of game
Survival and deathmatch need opposite AI, so Gridfall runs two separate brains.

| | Tactical AI (PvE survival) | Deathmatch AI (5v5 PvP simulation) |
|---|---|---|
| Goal | be a readable, fair threat to one player | be a convincing player among peers |
| Decisions | utility scoring per enemy, a squad director handing out roles | a state machine per bot, an arena director per team |
| In a fight | real cover against the threat's position, pop-and-shoot after a laser warning, suppression pins | snap-targeting the moment it sees you; hip fire on the move up close, an aimed shot at range; jumps and vaults; the Push on a wounded target |
| Team play | suppressors pin you while flankers work round your sides; melee rushes are slotted and timed | three front lines the teams push back and forth (push / hold / fall back per lane, reinforcements to the lane that needs them), shared team spotting (your eyes count too), pincer flanks on whoever a teammate is fighting, push claims |
| Information | no wallhacks: last known position, then a widening search | sight plus heard gunfire, bounded by fog contrast |

- **Human reactions:** each bot has its own reaction time (about 0.1–0.3 s), aggression, patience, and taste for flanks and slides, so a squad never turns as one. Its first rounds at a new target bloom wide and tighten within 0.3 s.
- **Not a robot:** hurt by someone it can't see, or outnumbered, a bot breaks line of sight and falls back to a friend instead of trading to the death. It slides into a rush or into cover.
- **It picks its shot like a player:**
  - **Under ~12 m:** it hip-fires at full speed, strafing and jumping, with a wider cone.
  - **Further out:** it plants its feet, raises the rifle to its eye (you can see it coming), settles for a quarter to half a second, then fires short, tight bursts while it walks.
  - **Beyond 40 m:** it moves up instead of plinking.
  - **Measured:** aimed rounds hit 2–4× as often as hip fire at the same range.
- **Attention-driven sensing:** line-of-sight checks are prioritised (current target, a new attacker, contacts in front, everyone else round-robin). A shared ray budget, plus a symmetric pair cache so one ray answers for both bots.
- **Time-sliced:** every brain runs on a scheduler with per-frame budgets. Nine arena bots, plus your spotting and the minimap, cost about 0.5–0.6 ms of CPU per frame.
- **Fog is fair:** in a sandstorm or the jungle mist, bots see only as far as a player could pick a figure out of the haze, contrast exp(−(ρd)²), and their aim degrades with distance.

### A UI that belongs to the place
- **Biome flavor:** the in-game sub-text (the HUD, zone names, the world's signs) is written in the script of the map you're on; the menus keep to one clean line of English since 45.0. Japanese in Tokyo, Arabic in the desert (Arabic-Indic numerals), Russian industrial stencils on the docks, Thai with military grid references in the jungle. One dictionary drives the HUD, the menus, the zone names and the crates and neon in the world; a level load switches it in one pass.
- **A live main menu:** your loadout's gun sways side-on over a hexagonal plinth under a spotlight, its own small scene, built when the menu opens and destroyed (checked under a forced GC) before a map is shown. Rajdhani and Orbitron, scanlines, chromatic aberration on hover, glitch transitions, and UI sounds tuned to the menu theme's key.

### Ballistics without garbage
- **Object-pooled rounds:** every bot round in flight comes from a free-list pool and is drawn by one InstancedMesh: one draw call for every tracer in the air, no allocation per shot.
- **Zero-allocation shell casings:** a 256-slot ring buffer in typed arrays, drawn as one InstancedMesh. Each casing's landing point is predicted when it's ejected, then it bounces up to three times and settles. 11–17 µs per frame with 0 KB heap growth.
- **Firearms only (46.0):** every gun fires thin, fast tracers and ejects brass, on every map and for every bot; the neon finishes are only a look.
- **Multi-ray shotguns:** eight pellets per shell, aggregated per target.

### Audio
- **Dynamic Web Audio track switching:** each world and the menu has its own theme, crossfaded on an equal-power curve over 2 s. A track that fades out is disposed: timers cleared, nodes disconnected, the stream released. Memory stays flat over 60 straight switches.
- **Music that follows the fight:** the built-in themes are synthesised live, in layers that come in and out with combat intensity, on bar lines.
- **Every reload synthesised per gun:** no samples. The pistol's high click-clack, the SMG's ratchet zip and mag slap, the rifle's three heavy stages ending in a low bolt slam, the shotgun's shells and its pump. Each is a recipe of oscillators, filtered noise and metal partials, scheduled on the audio clock in one call.
- **Drop-in soundtrack:** put `jungle_theme.mp3` (or `menu_theme`, `tokyo_theme`, `desert_theme`, `docks_theme`; .mp3/.ogg/.m4a/.wav) in `public/audio/music/`, and it streams instead of the synth. No code change ([details](public/audio/music/README.md)).

### Built to be checked
- **505 unit tests** (Vitest) for the pure parts: perception maths, tactics, the arena director (spotting, flank claims), the bots' range heuristics, retreats and flanks, timetables, terrain, the storm cycle, collision, pools, stair fitting, and frame-rate independence of the ADS, crouch and slide.
- **In-browser validation tools** drive the real game:
  - a 0.5 m-grid world scan for escapes, traps and invisible walls;
  - 64,000-run stress tests of the real character controller;
  - headless whole-match bot simulations;
  - fixed-view benchmarks.

  See [docs/DEVTOOLS.md](docs/DEVTOOLS.md).
- **No warm-up stutter (44.0):** the game loads behind a loading screen with a progress bar and percentage (at start, on a map change, on PLAY), and before a match starts every texture is uploaded to the GPU, every shader compiled (with the post-processing target bound, as it will be drawn) and the whole map drawn once with shadows, so nothing compiles or uploads in the middle of a fight.
- **Continuous deployment:** every push to `main` is type-checked, tested, built and published to GitHub Pages by GitHub Actions.

## Tech stack

| | |
|---|---|
| Language | **TypeScript** 5.9 (strict) |
| 3D | **Three.js** r186 on **WebGL 2** |
| Build | **Vite** 7 |
| Audio | Web Audio API: synthesis, streaming, crossfades |
| Tests | Vitest |
| Hosting | GitHub Pages, deployed by GitHub Actions |

Runtime dependencies: `three`, plus two self-hosted typefaces (`@fontsource/rajdhani`, `@fontsource/orbitron`).

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Left mouse (hold) | Fire |
| Right mouse (hold) | Aim down sights: tighter spread, less recoil, a 15–28% zoom; you move slower |
| R | Reload |
| X | Holster / draw (a drawn weapon gets you noticed) |
| E (tap or hold) | Interact: talk, read, cut the relay |
| Shift | Sprint |
| C (tap or hold) | Crouch: a tap toggles, a hold crouches while held. Quieter steps, tighter hip fire, a smaller target; slower. While sprinting: slide |
| Space | Jump; vault low railings mid-jump. Holding W into a ledge just out of reach: pull yourself up |
| Tab (hold) | Objective overview |
| 1 / 2 / 3 / 4 | Pick your gun: as a match starts, in the spawn area after any spawn (until you leave it or fire), or while waiting to respawn (TDM) |
| Esc | Pause: resume, restart, volume, graphics, quit to menu |

`?setting=tokyo|desert|jungle|docks` in the URL opens a world directly.

## Run it locally

```bash
npm ci
npm run dev       # http://localhost:5173
npm test          # unit tests
npm run build     # type-check, then a production build into dist/ (based at /Gridfall/)
npm run preview   # serve that build at http://localhost:4173/Gridfall/
```

Node 20.19+ or 22.12+. The dev server serves from `/`; production builds are based at `/Gridfall/` for GitHub Pages. `BASE_PATH=/ npm run build` builds for a domain root.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`, and on demand:
1. `npm ci`, `npm test`, `npm run build`;
2. it uploads `dist/` as the Pages artifact;
3. it deploys it to the `github-pages` environment.

The repository's Pages source must be set to **GitHub Actions**.

## Documentation

- [docs/LEVELS.md](docs/LEVELS.md): how a world plugs into the engine, and how each was built and checked.
- [docs/DEVTOOLS.md](docs/DEVTOOLS.md): the console tools for the dev server, and the source layout.
- [docs/PROGRESS.md](docs/PROGRESS.md): the version history, with what was measured at each step. Versions 1.0–9.1 were developed as *NEON RAIN*.
- `docs/PLAN-*.md`, `docs/BENCH-*.json`: version plans and benchmark data.

## Known limitations

- The built-in music is synthesised in the browser and won't sound like a studio production. Drop in your own tracks.
- Desktop only: mouse and keyboard, pointer lock.
- Story Escape is Tokyo only. The jungle's survival plays on its assault layout, but there's no scripted assault mission yet.
- Plants in the jungle hide bodies but don't stop bullets (by design).
- Performance figures are from an Apple M5 in Chrome; weaker GPUs may need the Power Saving preset.
