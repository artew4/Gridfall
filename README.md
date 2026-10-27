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
| **Desert Outpost** | A HESCO-walled outpost in open dunes under a harsh sun, where the sandstorm is the normal state and clear air lasts seconds. The compound is in three levels: rooftops joined by bridges and a skybridge, the yard, and a culvert under it. It's mirrored into an arena for TDM. Since 46.0 each main flank has the Block (three storeys and a roof, stairwells at both ends, an atrium you can shoot across and down) and a two-storey house on each team's half; inside them the storm can't reach you. Since 50.0 their roofs can't be climbed, the upper floors have a few barred slits instead of windows all round, and huts stand in the open ground off the middle. Since 56.0 the middle is fought on two levels: under the yard the Cistern, a pillared hall the culvert runs through, with a stair down to it right inside each team's gate, and over the hall a sinkhole where the yard fell in, two slabs of it lying as ramps under a salvage hoist. The HESCO round the compound is head-high now, the roofs have stair heads, tanks and shades to hide behind from the Blocks, and blast walls and containers break up the open dunes. | Arcade Survival, Team Deathmatch |
| **Firebase Viper** | A walled paramilitary compound in the rainforest, in mist and dappled light: push up the road, breach the gate, clear the compound. | Arcade Survival |
| **Tokyo: Neon Block** | Tokyo Night's neon after the rain as a 7v7 arena (5v5 until 44.0), a neon-lit smog filling its street canyon up to the landings: at street level a figure fades out by about 11 m, and from the rooftops the streets below are a violet sea (a target 15 m out is mostly hidden). Glows bloom through it, and the bots see exactly what the picture shows: the thicker the smog between them and you, the later they react and the wider they shoot. Above the smog the roofs are clear. The arena is separate from the story district: a mirrored Shinjuku block on three levels. Lantern Alley and its lantern market (a stall, a cart, AC units, a hologram), Main Street with its footbridge, and the service alley at street level; fire escapes, landings, the footbridge, the Lantern Bridge over the west end of the crossing, and the Transit Rail (an elevated track along the east wall with a parked car, bridged from Block E's roof) in the middle; rooftops joined by a skybridge and a plank bridge on top, with a machine room, ducts, billboards and stair heads to fight round. The flank alleys bend through rooms: a pachinko parlour across Lantern Alley, a konbini and a ramen-ya in the service alley. Since 53.0 lit ad panels break up the footbridge and booths and signs stand on the roofs. Drop down from a roof, a landing or a gap in the rails to flank, or take the stairs back up. | Team Deathmatch |
| **Deep Jungle** (Crash Site) | The Team Deathmatch jungle, played 7v7 (Firebase Viper stays as it was). Since 33.0 an abandoned research outpost stands in the middle: fight under the lab on its stilts, on its deck, inside it and on its roof by the comms mast. Under it all, tunnels 4 m down: a hub beneath the lab (its stair comes up into the ground floor) and branches out to the ravine and to sunken stair pits at the ridge's foot. A rock ridge along the west cliff with long rifle lines; a 4 m ravine in the east, crossed by fallen giant trees; mossy shipping containers for cover. The undergrowth stays under eye height: you see people standing, crouching hides you. | Team Deathmatch (7v7) |
| **Neon Docks** | A rainy harbour at night, 9v9 since 32.0: a container maze (close range), a roofed warehouse with catwalks (mid range; dry inside) and an open quay under a crane (long range), an old depot and barges on the edges. Reworked in 15.0 (the spawn exits turn out to the flanks, gantries over the containers and along the quay to a crane nest) and 32.0 (a muted palette of deep blues and soft violet, lighter rain, the warehouse roofed again). 49.0: no line runs a lane end to end: the maze laid brick-bond (the gantry over it gone), container walls zig-zag the quay, cargo weaves the barges; inside the warehouse a container at each door, pallet racks and the foreman's office; stair towers at the quay corners lead in at catwalk height and on up to the gantry, whose middle is the crane cab; the crane stair breaks at a perch over the quay. Since 54.0 rounds pass through the racks' gaps between the goods. | Team Deathmatch |
| **Old Port** | A brick-and-concrete harbour on a clear morning, the opposite of the neon maps: soft sun and shade, faded containers, a haze over the sea. 7v7 on four levels: an 1890s brick warehouse with a pillared hall and an upper floor lit through its broken skylights; a container yard split by a maze of containers you go through or over, with high stacks joined by a steel walk; a dry dock 4.5 m deep under shipwright scaffolds, its coaster raised on steel stands so the whole dock floor under her hull is a low, lamp-lit room of crates, stands and a scaffold tower (UNDER THE HULL), with each team's second deployment zone at its own end of the dock. No line runs from one side's spawn to the other's. | Team Deathmatch, Arcade Survival |
| **Maglev Terminal** | A white, glass-roofed transit hall at mid-morning, played 7v7, clean and corporate after the rust and neon. A three-car maglev hovers in the middle; its aisle zig-zags through bulkheads, a close-quarters lane. On the platforms either side, holographic billboards, transit-map kiosks and art monoliths break every line from one end to the other into mid-range fights; the sunken track beds are crossed by maintenance gantries; a mezzanine and two skybridges at 5 m. The operators wear light corporate gear here: find them by their silhouette and team accents. | Team Deathmatch (7v7) |

## The modes

The main menu (redesigned in 45.0) is big type and one word a button: **PLAY**, **SETTINGS**, **CONTROLS**, your name top right, the gun in hand over its 3D model with 1–4 to switch. PLAY opens the maps screen (52.0): the picked map's picture over the whole screen, a dark panel on the left with the modes as tabs, a grid of the maps and a big PLAY, the map's name huge on the right. Picking a map costs nothing; PLAY loads it behind the loading screen. Click your name to change it (it starts as *Artem*): it shows on your HUD, under your arrow on the minimap, in the kill feed and on the scoreboard. In a match, the HUD keeps the score top centre (ALPHA kills against OMEGA kills), the kill feed top right, and a live board of your team top left (kills, deaths, score, your row in gold). After a match, the result screen lists the next maps for the same mode, so you can go straight into another map (or a rematch) without the main menu.

- **Story Escape** (Tokyo): you are Arashi Kaito, framed for a bombing, and every patrol in the district has your description. Four acts across the streets, the rooftops and the Sakura Line metro, ending on the last express out. Stealth comes first: keep your weapon holstered and stay out of view cones. If you're seen, break line of sight and lose the search.
- **Arcade Survival** (Tokyo, Desert, Jungle): wave after wave of enemies who fight as a squad.
- **Team Deathmatch** (7v7 on Neon Block, Deep Jungle, Old Port, Maglev; 9v9 on Neon Docks; 10v10 on Favelas; 12v12 on the Desert): you and your allied bots against the other team. Since 51.0 each of the map's three fronts (a flank, the centre, a flank) has a point to take by standing on it (a beacon over it in its holder's colour, on the compass and the minimap): you start from your home zone only, holding a flank opens your spawn zone on it, holding more points than the other team drains its tickets, two of the three (a double breakthrough) three times as fast, and the team that loses two goes to its last line (instant respawn from every zone). The bots fight you as hard as they fight each other (50.0): a rifle round of theirs costs you as much as yours costs them, they return fire past their gun's usual range when you shoot them or stand over them, and the better you play the harder the other team plays you (and the reverse). Each match deals you a team at random (ALPHA or OMEGA), so you play both ends of every map: the HUD is your side's, your team on the left in its own colour. Each team has 50 tickets, and a ticket is a respawn: when they run out, every death is final, the team still standing wins, and a team that's behind gets 60 s of sudden death to score a kill or lose. Out of the match yourself, you watch your teammates through their eyes. You don't command your squad: the bots read what you're doing and play around you. Every match deals the bots different callsigns (Jax, Nova, Kuro, Viper…) and each bot a gun from the armory at every spawn. They wear matte tactical gear with small glowing accents in their team colour (a visor strip, shoulder patches, a spine light): cyan for ALPHA, orange for OMEGA. Each team deploys from two or three marked zones in its own half (A, B, C: a glowing pad with its letter floating over it, dressed for the map: neon haze, vines, blowing dust, warning stripes or glass). Every respawn goes to the zone used least lately among those with no enemy near it or in sight of it, then to the safest spot inside it; a match opens with the team split into pairs across its zones. The opening flight lands in your own eyes at the spot you were dealt, then a 3, 2, 1 countdown holds everyone where they stand (nobody moves or fires; switch guns with 1–4) until START!.
  - **Three fronts (44.0):** every map is fought on three lanes (two flanks and the centre), and each lane has a front line where the two teams meet. Win the fights in a lane and its line moves towards their spawn; lose them and it comes back towards yours. The score at the top shows the three lines (your colour from the left, theirs from the right; the lane you're in is outlined, a lane your team is losing pulses red), and the minimap marks each line across its lane. Bots go where they're needed: a respawn reinforces the lane your team is outnumbered in or being pushed back in, often from a rally point just behind that lane's front, and a lane that's winning easily sends a squad to one that's falling back. Push a line all the way to their spawn and hold it, and you've broken through: the other team loses a ticket every few seconds until they push you out. When you respawn, you're sent to the lane where the fight is. Bots search the map between fights, and turn on whoever shoots them from the side or behind, fires close by, or creeps up within a few metres; on Neon Docks they also spread out over it: a crowd fighting from one spot sends one round the side, a second hunter on one enemy comes at it from another angle, and a patrol prefers the lanes its team is short of.

## Gunplay

- **Neon Docks' light and wet (86.0):** the warehouse's neon and signs light the wet apron in their colours and reflect in the puddles as you pass, a dying tube on OMEGA's corner, oil films in the puddles, manholes and drain grates on the apron, steam from the lids.
- **Tokyo Night's two tracks (87.0):** Tokyo Night and Neon Block play "Violet Hour Above the Rain" or "Black Rain and Bamboo" at random, and at a track's end crossfade into the other one. A place can have any number of tracks (a list in `public/audio/music/manifest.json`).
- **Neon Docks' track and Tokyo's third (88.0):** Neon Docks plays "Black Water Harbor"; Tokyo Night and Neon Block add "Midnight at the Crossing" to their random three. The prompts that made them: `docs/MUSIC_PROMPTS.md`.
- **Old Port's own track (89.0):** "The Brass Perimeter", a daylight track (Old Port played the docks' neon one).
- **Neon Block's storefronts (85.0):** the arcade's and Main Street's shops are Tokyo's modelled fronts with their rooms behind the glass, lit signs, izakaya eaves, entrances and graffitied shutters; their light on the wet street, their signs in the puddles, oil in the road's puddles.
- **Tokyo's light and wet (84.0):** the shops' windows light the pavement in front of them (konbini white, izakaya amber), their frames casting fans of shadow; sodium lamps under the railway overpass light its girders and pool on the street; the lit signs nearest you reflect in the puddles; oil films in some puddles; wet road paint; a few signs flicker (one dying, one stuttering, one that won't start); steam from the manholes.
- **Tokyo's landmarks (83.0):** the railway overpass on riveted plate girders and capped piers with catenary masts over it, the commuter train with its cabs, roof air conditioners, single-arm pantographs on the wire and bellows between the cars, the metro's arched glass canopy.
- **Tokyo's street level (82.0):** traffic signals at the plaza's crossings (Japan's horizontal heads and walk signals, cycling), the streets' blue name plates, convex mirrors at the blind corners, cast-iron manhole lids, kerb grates and yellow tactile strips, wet in the rain.
- **The Desert's sand-khaki teams (81.0):** in your hands an FDE rifle with desert-camo furniture, coyote gloves and sleeves in your team's camo; the bots in the same cloth: ALPHA's olive-khaki rangers with blue tape, OMEGA's sand-and-rust with orange tape, their rifles coyote, shooting glasses instead of the lit visor.
- **Tokyo's facades (80.0):** every painted window is a room you look into (homes lit warm, offices cool, karaoke boxes pink, dark rooms barely there; blinds, curtains), balconies with laundry, futons, plants and air conditioners on the upper floors, panel water tanks on their stands on the roofs, vertical sign stacks down Railway Street.
- **Worn materials (79.0):** the models' flat colours weathered by role in world space: rust spots and chipped edges on paint, rain streaks down the sides, dust on the tops, faded plastic, scuffed wood; the Favelas' render streaked, patched and green at the foot, the tin and grilles rusting, the Beetles and Kombi chipped.
- **Night Tokyo's storefronts (78.0):** every shop slot a modelled front over a room you see into through the glass (konbini fridges, drugstore and bookshop shelves, a wall of screens, a boutique, a cafe, an izakaya's menu strips, a ramen kitchen, building lobbies), its own lit sign, noren and paper lanterns on the izakaya, roll shutters with graffiti, entrances with mailboxes and lit tenant directories, striped awnings.
- **Favelas and wreckage modelled (76.0):** Fortlev water tanks on the roofs, stamped steel doors, white iron window grilles with their sunbursts, corrugated tin over the towers, rebar waiting on the bare-block houses, satellite dishes, Beetles and a Kombi in the street, fruit stalls under striped awnings; a burnt car at the jungle's checkpoint, and at Crash Site a helicopter's tail caught in a crown at the forest's edge (77.0: red and white bands, its beacon blinking over the clearing), its rotor blade and torn skin on the forest floor.
- **Nature modelled (75.0):** the jungle's bushes, ferns, elephant-ear plants and tree crowns, giant trunks on winding buttress roots and slim trunks (Deep Jungle, Crash Site), and the Desert's boulders as layered sandstone, each inside the collider it dresses.
- **Maglev Terminal furnished (74.0):** gloss planters with ferns and shrubs, kiosk pods with their canopies and screens, rows of ticket machines, ticket gates on the apron lines, moulded benches, luggage trolleys stacked with cases, maintenance carts in the guideway beds, and the train's doors in steel surrounds with their status strips.
- **The ports' industry, modelled (73.0):** the ship-to-shore cranes on Neon Docks and Old Port are box-section legs on their wheel bogies, box girders with walkways and handrails, a machinery house and a trolley; the catwalks' handrails are steel panels with posts and top tubes; the warehouse racks have their upright frames and step beams; mooring bitts line Old Port's quay.
- **The neon street, modelled (72.0):** Neon Block's and Tokyo's drinks machines (a real body round their lit fronts), the air conditioners on the roofs and walls, garbage bags, wheeled bins, planters with shrubs, the paper lanterns' wooden caps, hoops and tassels, city bikes, benches, bollards, concrete utility poles with their transformers and street lamps, the ramen stall, and the electrical cabinets you shoot out (in Tokyo, the Desert and the jungle).
- **The Desert's buildings dressed (71.0):** every door and window in the compound has its moulded frame, the windows their sills and louvred shutters folded back, the doors their planked leaves open flat to the wall; air conditioners over the doors, ribbed tanks on the roofs, a riveted water tower with its walkway and braces, a radio mast and dishes, army tents, the trading post's scalloped awning, date palms, power poles with their insulators, enamel shades over the bulbs. None of it is solid and nothing stands off a wall to be mistaken for cover.
- **Containers and vehicles, modelled (70.0):** every shipping container is a corrugated box with its rails, corner castings and a door end with lock rods and hinges (Neon Docks' maze, Old Port, the Crash Site, the jungle firebase), and the vehicles are models: the Desert convoy's burnt truck, the APC on its side and the burnt bus you can walk through, the army trucks in the motor pools, a jeep with its gun, a fuel bowser, gensets, a burnt-out car, the docks' tractor with a 40 ft container on its trailer and a forklift.
- **The military maps' cover, modelled (69.0):** the same kit on Deep Jungle's firebase (its crates stencilled in Thai, jersey barriers with their rebar loops, drums), the Crash Site's HESCO and sandbags, and Old Port's cargo, crates on pallets in stacks; the Desert's tyres and cable spools too.
- **The Desert's cover, modelled (68.0):** the sandbag walls are laid bag by bag (courses offset by half a bag, each bag a little turned), the HESCO barriers are wire-framed cells with their liners bulging, the crates are wooden supply crates with battens, iron corners, rope handles and their stencils, the cases hard cases, the barrels oil drums. Where you can stand, shoot through or take cover is exactly as before. The plan for the rest of the maps: [docs/ENVIRONMENT_PLAN.md](docs/ENVIRONMENT_PLAN.md).
- **Hands and operators from Blender (67.0):** your hands are gloved (fingers wrapped round the grip, the index finger on the trigger, armoured knuckles, a wrist band that glows on the neon maps, a sleeve in the map's kit), the support hand round the SMG's foregrip or under the handguard and the pump. The bots are modelled operators: a helmet in the team's colour with a visor and its strip, a respirator, a plate carrier with MOLLE and magazine pouches, a radio, a pack with the spine lights, shoulder pads with their patches, bracers, knee pads, shin guards, boots.
- **The guns, modelled in Blender (66.0):** the four guns are hard-surface models (bevelled edges, serrations, ports, rails, vents, ribbed grips, a working slide, pump and magazine), built by Python scripts in `tools/blender/` and loaded as GLB files. Each part has a role (frame, steel, polymer, furniture, trim, glow), so they still wear each map's finish: black and camo in the desert, gunmetal with neon strips in Tokyo, white and carbon on Maglev. The bots carry the same guns, cut down to about 2,500 triangles each.
- **The armory (13.0; four guns since 21.0):** every gun works on every map, and each wins somewhere and loses somewhere. Pick one with **1 / 2 / 3 / 4** while a match starts, after any spawn while you're still in the spawn area (23.0: within 12 m of where you spawned, until you leave it or fire), or (in TDM) while you wait to respawn, for your next life:

  | Key | Gun | How it plays |
  |---|---|---|
  | 1 | Kitsune-9 pistol | the mobility gun: full speed while aiming, sights in 0.1 s, the fastest draw, big head hits; weak body damage, falls off past 25 m |
  | 2 | Hornet SMG | the buzzsaw: highest fire rate, tight from the hip; climbs hard, weak rounds, falls off past 12 m |
  | 3 | Jackal AR | the baseline: steady at mid and long range; wide from the hip |
  | 4 | Boar M12, pump shotgun | one shell drops a man inside 8 m and shoves him back; useless past 15 m, heavy to carry |

- **Two modes (64.0):** Team Deathmatch and Breakthrough are separate tabs now, on the same maps. No match ever ends by hunting the last hidden enemy, and you never sit out a match watching bots: every death respawns in 3 s (your camera turns to whoever killed you; A/D pick the zone you come back at).
  - **Team Deathmatch:** first to 6 kills per player on a team (72 at 12 a side), or the most kills after 10 minutes (level: overtime, the next kill wins). Ten kills from the end it's MATCH POINT: every enemy shows on the radar every 8 seconds, respawns are twice as fast, the music peaks.
  - **Breakthrough:** the fronts and the three points. Tickets (12 per player) pay for respawns and bleed while the other team holds more points; a team at 0 loses on the spot. Under 15% it's the DECISIVE ASSAULT: points fall twice as fast, respawns are quicker, and a team holding two points respawns for free, so the trailing side can still turn it round.
- **The match on screen (58.0):** standing on a point shows what's happening there under your crosshair (capturing, losing, contested, holding) with its meter; a point the other team takes gets a banner too. On the minimap and the HUD your side is always blue and the other red, whichever team you play. Once you're out of the match, or a team is on its last stand, the board top left lists both teams, with everyone who's out struck through. Esc opens the menu while you're dead or watching.
- **Bots with a game plan (65.0):** each team picks a plan for a minute or two (lean left, lean right, crowd the middle, both flanks, or balanced) and then another, and a bot's lane in its sector is a draw, so the crowd doesn't come the same way every match. The bots sprint as you do now (a rifleman about as fast as you with yours), on the way to their lanes too, so at the start both teams run for the middle. A bot that can't get where it's going drops it and picks something else, a sniper on a post shifts its feet, and a crouched bot keeps its eyes up.
- **Wallbangs (57.0):** thin sheet metal and boards don't stop a round: it goes through with part of its damage (60% through a thin sheet or a rail panel, 40% through a heavier plate, 65% through boards, 45% through the Desert motor pool's corrugated walls), a little bent, at most two walls a round, for you and the bots alike. Concrete, brick, floors and anything thick still stop it, and walls you can shoot through still block sight.
- **Through windows (57.0):** jump at a wide window (a metre wide, its sill within reach) holding forward and you dive through it, ducking under the top, and land on the other side. Barred windows, narrow slits and fences stay in the way. Since 58.0 the bots dive through windows too.
- **Combat instincts (55.0):** bots fight on rolls, not rules. A bot that's just put a couple of good hits into you may go after you to finish you off: it takes you over everyone else, runs you down past its usual range, and if you break line of sight it sprints towards where you were going, gun already up on that corner. It gives up if it loses you for a few seconds, gets badly hurt itself, you heal up, or you make it back to your own half. Not every bot does it: the bold ones more often, and more often again just after a kill. A bot that sees a teammate killed nearby may go after the killer. Catch one reloading close up and it may rush you. A bot falling back calls out its attacker, so the teammates near it focus on them. And one that's just lost sight of you reacts faster when you come back round the same corner. Chasing is a gamble, though: a bot running you down doesn't take cover or fall back, so you can lure it into your teammates.
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
- **Dressed boxes (68.0):** a map tells its static builder which materials are props; a box in one is drawn as Blender models fitted to its bounds (`src/world/Dress.ts`: stretched, tiled down a run, or laid in courses), merged into the map's meshes, the bags instanced with the walls' boxes casting their shadows. The collider is untouched, so the bots, the cover and the tests see the same map.
- **Hands and operators from Blender (67.0):** `tools/blender/hands.py` builds three hand poses (fingers as chains of segments bent round the grip's section), placed per gun by `src/entities/weapons/handFit.json`, which `tools/blender/viewmodel.py` also reads to render a gun in its hands without the game. `tools/blender/merc.py` models the operator one node per pivot of the bots' rig, in each pivot's own space, with the rig's layers as materials, so the animation, the IK, the hitboxes and the team colouring are unchanged (about 11k triangles a body).
- **Guns from Blender, made by code (66.0):** `tools/blender/guns.py` models each gun headless in Blender (profiles, booleans, bevels, weighted normals, box UVs for the camo and carbon textures) on the old box models' numbers, so the sights, muzzle, grip and magazine stay where the game expects them. It exports a full model for your hands (21–32k triangles) and a decimated one for the bots (about 2,400). The game swaps each part's material for the map's finish. A test reads the GLBs and checks the nodes, roles, budget and that every sight line is clear.
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
| In a fight | real cover against the threat's position, pop-and-shoot after a laser warning, suppression pins | snap-targeting the moment it sees you; hip fire on the move up close, an aimed shot at range; jumps and vaults; the Push on a wounded target; instincts on a roll: chasing the wounded down out of sight, paying back a teammate's killer, rushing a reload, covering a teammate falling back |
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
- **659 unit tests** (Vitest) for the pure parts: perception maths, tactics, the arena director (spotting, flank claims), the bots' range heuristics, retreats and flanks, timetables, terrain, the storm cycle, collision, pools, stair fitting, and frame-rate independence of the ADS, crouch and slide.
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

The guns are rebuilt with `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/guns.py` (the hands with `hands.py`, the operator with `merc.py`) (Blender 5.2; `-- --only jackal --preview /tmp/prev` renders previews). Node 20.19+ or 22.12+. The dev server serves from `/`; production builds are based at `/Gridfall/` for GitHub Pages. `BASE_PATH=/ npm run build` builds for a domain root.

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
