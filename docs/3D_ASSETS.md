# Gridfall 3D Assets: the tracker

The game is moving from procedural Three.js primitives to models built in Blender. This file tracks every model the game needs, and holds the concept-art descriptions to work from. It's a living document: update an asset's status as it moves through the pipeline, and add detail map by map (Phase 1 now, Phase 2 later).

## Status
| Mark | Status | Meaning |
|---|---|---|
| `[ ]` | Needed | Listed; no concept yet |
| `[~]` | Concept Ready | Description finished; ready for concept art and modelling |
| `[-]` | Modeling | In Blender |
| `[x]` | Integrated | Exported, in the game, the procedural version retired |

Asset IDs: `CHR-` characters, `WPN-` weapons, `ENV-<MAP>-` environment pieces. Map codes: `FAV` Favelas, `TKY` Night Tokyo (the story district and Neon Block), `DOK` Neon Docks, `JNG` Deep Jungle (Firebase Viper and Crash Site), `MGL` Maglev Terminal, `DST` Desert Outpost, `OLD` Old Port.

## How a model fits the game
The game's collision, nav, cover and balance are built from simple boxes and cylinders. A model replaces what you see, not what you collide with. These rules keep it that way:

- **Units and axes:**
  - metres, Y up, facing −Z (the game's forward);
  - pivots at the base, centred on the footprint (a wall piece at its bottom-left corner on the grid);
  - export glTF 2.0 binary (`.glb`) to `public/models/<map or global>/`.
- **Bounds:** a model stays within its listed size: 3 cm proud of the collision box at most, and never hollow where the box is solid. Players read cover from what they see.
- **Modular, so it can be instanced.**
  - Environment pieces are kits on a grid (Favelas: 0.5 m, storeys 3 m; Tokyo: 0.5 m, storeys 3.6 m), placed many times as instances.
  - A building is assembled from pieces in the game, not modelled whole.
  - Colour variation comes from instance colour, not separate materials. Paint and plaster go on a near-white base map, tinted per instance.
- **Polygon budgets (triangles), first pass:**

  | Asset | Triangles |
  |---|---|
  | Characters (LOD0) | 8–12k |
  | Viewmodel guns (first person) | 6–10k |
  | Bots' guns (third person) | ≤ 1.5k |
  | Small props | 200–1,500 |
  | Modular wall pieces | 50–400 |

  A full map should stay under ~400k triangles in view (today: 30–120k), for 60 FPS on the bench machine.
- **Materials:** physically based (base colour, roughness/metal, normal). Textures 1k for props and 2k for heroes (characters, guns), trim sheets for the modular kits.
  - **Emissive only where the game glows:** team accents, neon, vending fronts, the blaster finish's strips. Emissive is the bloom's input: keep it small and over 1.0 in HDR, so it reads as a glow, not a lamp.
- **Readability (characters):** the night maps are dark, so the operators are matte and dark, with small team-colour glows (visor, shoulders, spine) about 4% of the body's area. A figure must read by its silhouette against neon and by its accents at 20–30 m. See `src/entities/enemies/operators.ts`.
- **Rig (characters):** the game's skeleton drives every pose (gunner and runner, aiming IK, deaths). The rig's pivots must keep their names and rough positions so the animations and the hitboxes (head, chest, legs) still line up. Bone list: `src/enemies/Models.ts`.

---

# Global Assets

## Characters

The two Team Deathmatch factions wear the same cut of gear: one skeleton, one set of hitboxes, so neither team is easier to hit. They differ in character: different plates, surface work and team colour, so you can tell friend from foe at a glance.

Every operator kit has two finishes, chosen by the map:
- **Night** (every map but Maglev): matte charcoal and graphite.
- **Corporate** (Maglev): off-white satin synthetics.

### `[~]` CHR-OP-BASE · Operator base body (shared)
- **What it is:** the shared under-layer both factions build on. A soldier in a fitted mid-layer combat suit: compression sleeves, articulated knee and elbow pads, low boots with thick lugged soles, gloves with hard knuckles, a slim chest rig carrying three magazine pouches, a radio on the left shoulder strap.
- **Silhouette:** athletic and slightly top-heavy. Broad squared shoulders (pauldron mounts), a narrow waist, straight legs. The head is always a helmet with a full-face visor: no faces.
- **Proportions:** 1.8 m tall standing; 0.45 m body radius at the shoulders; a crouch that keeps the helmet and shoulders readable. Gun-hand grip and support-hand IK targets.
- **Materials:** cloth at roughness ~0.9; hard plates matte, almost no metal; webbing in a slightly different value from the cloth so the gear reads in silhouette.
- **Material slots** (recoloured per faction and finish): `armor`, `cloth`, `webbing`, `boots`, `team` (the faction's colour block), `visor` (dark glass), `accent` (emissive strips).

### `[~]` CHR-OP-ALPHA · ALPHA: "Kestrel": tactical cyberpunk
- **Concept:** a corporate special-operations team, sleek and engineered. Gear that was designed, not built: every plate moulded, every edge chamfered, no visible screws.
- **Silhouette cues:**
  - a helmet like a smooth rounded shell, its visor a single wraparound band;
  - angular shoulder pauldrons that sweep back like folded wings (the kestrel);
  - a tall, narrow back plate with a spine housing;
  - a slim thigh rig.
- **Armour:** moulded composite in large clean panels. Hairline panel seams, small engraved serials, one flush hexagonal port on each shoulder. Knee and elbow caps are single shells.
- **Colour (night finish):**
  - armour graphite `#33363c`, cloth near black `#1c1d21`;
  - the team block (chest rig, shoulder pads, helmet crown) deep steel blue `#1f3a52`;
  - **accent glow ice-cyan** (HDR ≈ 0.45 / 1.6 / 3.3): a thin visor line, a strip on each pauldron's leading edge, a segmented line down the spine housing.
- **Colour (corporate finish, Maglev):** armour off-white `#d6dadd` satin, cloth pale grey; team blocks ice blue `#86c3ec`; the accents a softer cyan.
- **Small story details:** a small kestrel-wing logo printed on the left pauldron; barcoded tags on the magazine pouches; a tablet strapped to the left forearm.
- **Concept prompt:** *"Full-body concept sheet of a futuristic special-forces operator, front, side and back views, T-pose. Sleek moulded matte graphite composite armour with chamfered edges and hairline panel seams, a smooth rounded helmet with a single wraparound visor band, swept-back angular shoulder pauldrons like folded wings, a narrow back plate with a spine housing. Deep steel-blue chest rig and shoulder pads; thin glowing ice-cyan light strips on the visor, the pauldron edges and the spine. Engineered and corporate, no visible screws, clean silhouette. Neutral grey background, orthographic, game asset reference."*

### `[~]` CHR-OP-OMEGA · OMEGA: "Ferrum": raw industrial
- **Concept:** a mercenary company that builds its own kit: salvaged and welded, heavier-looking, honest about how it's made. The same body under it, with the same hitbox volumes, but every surface tells a different story.
- **Silhouette cues:**
  - a squarer helmet with a flat brow ridge, and a visor split into two slots behind a welded bar;
  - blocky, flat shoulder plates riveted on, slightly asymmetric (the right one larger, a shooter's plate);
  - a squat back plate with a bolted battery box;
  - a utility belt with a dangling tool and a cable loop.
- **Armour:**
  - cut steel and rubber in overlapping slabs, with weld seams, rivet rows, bevelled cut edges and stencilled numbers;
  - knee pads of thick ridged rubber;
  - straps with heavy buckles instead of clips.
- **Colour (night finish):**
  - armour graphite `#33363c` with a slightly lighter worn edge;
  - the team block (chest rig, shoulder plates, helmet brow) deep rust brown `#50301f`;
  - **accent glow red-orange** (HDR ≈ 3.3 / 0.7 / 0.28): a horizontal bar of light across the split visor, a stripe on each shoulder plate's face, a ladder of short bars down the battery box.
- **Colour (corporate finish, Maglev):** armour off-white with grey rubber; team blocks pale sand-orange `#e8ac72`.
- **Small story details:**
  - a hand-painted stencil "Ω" with a hash count of kills on the right shoulder;
  - a strip of hazard tape round the left forearm;
  - a cut-down respirator canister at the jaw.
- **Concept prompt:** *"Full-body concept sheet of a mercenary soldier in salvaged industrial armour, front, side and back views, T-pose. Matte graphite steel and thick rubber slabs, weld seams, rivet rows and bevelled cut edges, stencilled serial numbers. A squared helmet with a flat brow ridge and a visor split into two narrow slots behind a welded bar, blocky riveted shoulder plates (the right one larger), a squat back plate with a bolted battery box, heavy buckled straps. Rust-brown chest rig and shoulder plates; glowing red-orange light bars across the visor slots, on the shoulder plates and down the battery box. Brutal, hand-built, utilitarian. Neutral grey background, orthographic, game asset reference."*

### Shared readability rules for both factions
- The two must be told apart by silhouette alone (the helmet's top line and the shoulders), and by colour alone (cyan against orange).
- Nothing on either glows except the accents, and nothing is glossy enough to mirror neon (night finish).
- The accents sit where they matter: the visor (where the eyes go: the target), the shoulders (the body's width, front and back), the spine (seen running away).
- Accent strips at least ~5 cm wide: 2 cm strips went sub-pixel at 20 m (14.0).

### Survival enemies (Phase 2: listed only)
- `[ ]` **CHR-SYN · Neon Synths** (Tokyo): hooded blade runners and armoured gunners; neon visors; sparks and a glitch dissolve on death.
- `[ ]` **CHR-MRC · Desert Mercs:** scavengers (head wrap, goggles, machete) and contractors (plate carrier, helmet, rifle with a laser).
- `[ ]` **CHR-JGD · Jungle Guards:** breachers (helmet over a balaclava, amber goggles, black machete) and riflemen (NVG mount, headset, plate carrier); olive drab tiger stripe.

## Weapons

**One model per gun, three finishes picked by the map** (`src/entities/weapons/theme.ts`):
- **Blaster** (Tokyo, Neon Block, Neon Docks): dark gunmetal and graphite polymer with neon strips.
- **Military** (Desert, Jungle, Old Port, Favelas): parkerized steel, olive drab and coyote polymer, wood and camo furniture, nothing glowing.
- **Corporate** (Maglev): white gloss polymer, carbon fibre, satin aluminium, dim cyan LEDs.

So each gun is modelled once, with these **material slots**:
- `frame`: receiver, slide, barrel;
- `steel`: bolts, rails, pins, the muzzle device;
- `polymer`: grips, magazine bodies;
- `furniture`: stocks, handguards, fore-ends;
- `trim`: slide top, trigger, magazine plates;
- `glow`: the strips and rings (emissive on blaster, a dim LED on corporate, plain dark metal on military).

**Every gun also needs:**
- **separate moving parts** (a slide, a bolt, a pump, a magazine), each with its pivot;
- **empties (markers)** for the muzzle (flash and tracer start), the ejection port (brass), the sight's eye point (aiming down sights puts it on the screen centre), and the hand grips (the bots' IK);
- a **third-person version** (≤ 1.5k triangles) of the same shape for the bots.

### `[~]` WPN-K9 · Kitsune-9 (pistol)
- **Role and feel:** the sidearm: the fastest draw and sights, full speed while aiming, a headshot weapon. Snappy and precise. Visual weight: light and compact, about 0.21 m long.
- **Shape:**
  - a squared, slightly tall slide with angled front serrations, a short barrel with a ring at the muzzle;
  - a polymer frame with an integral trigger guard (squared front for a two-handed grip) and a short accessory rail;
  - a stippled grip with a beavertail;
  - **two ammo strips** running along the slide's sides that show the rounds left (the blaster finish lights them), and a small **digital round counter** on the back of the slide facing the shooter;
  - a notch rear sight and a post front sight (the aiming point).
- **Moving parts:** the slide (recoils ~3 cm), the trigger, the magazine (drops out of the grip).
- **Materials:** a machined steel or alloy slide with crisp edges; a textured polymer frame; the counter's window as dark glass.
- **Finishes:**
  - blaster: gunmetal slide, cyan neon strips, a plasma-blue barrel ring;
  - military: parkerized grey service pistol, plain steel strips;
  - corporate: white polymer slide, a cyan LED counter.
- **The fox:** a small fox-head mark engraved on the slide behind the serrations (*kitsune*).
- **Concept prompt:** *"Game weapon concept, a compact futuristic semi-automatic pistol, three-quarter view plus side orthographic. Squared tall slide with angled front serrations and a ring at the muzzle, a polymer frame with an integral squared trigger guard and a short rail, stippled grip with a beavertail. Two slim light-strip channels run along the slide's sides as an ammo indicator, a small digital round counter on the rear of the slide, a tiny engraved fox head on the slide. Gunmetal and graphite, glowing cyan strips. Precise, light, snappy. Clean studio lighting, neutral background."*

### `[~]` WPN-HNT · Hornet (SMG)
- **Role and feel:** the buzzsaw: the highest fire rate, tight from the hip, weak at range; it shakes in sustained fire. Visual weight: short, boxy and dense, ~0.45 m long (stock out).
- **Shape:**
  - a short boxy receiver;
  - a **shrouded barrel** (a slotted cooling shroud) ending in a stubby compensator with side ports;
  - a **vertical foregrip** under the shroud;
  - a **straight stick magazine ahead of the trigger guard** (a magazine-in-front layout: the gun's signature);
  - a stubby collapsible stock of two rods;
  - a compact holographic sight (a box frame with a glass pane: the aiming point is the reticle);
  - strips down the shroud that show the magazine, like the pistol's.
- **Moving parts:** the charging handle (a small reciprocating knob on top), the magazine, the stock (fixed for gameplay; collapsing is cosmetic).
- **Materials:** stamped steel for the receiver (pressed ribs, spot welds); polymer for the grip and foregrip; the holo glass with a faint tint.
- **Finishes:**
  - blaster: graphite with magenta-cyan shroud strips;
  - military: olive drab polymer and black steel;
  - corporate: white with carbon panels.
- **The hornet:** a yellow-black banded ring at the compensator's base; a small stencilled hornet on the magazine well.
- **Concept prompt:** *"Game weapon concept, a compact boxy submachine gun, three-quarter view plus side orthographic. Short stamped-steel receiver with pressed ribs, a slotted cooling shroud over the barrel ending in a stubby side-ported compensator, a vertical foregrip, a straight stick magazine forward of the trigger guard, a stubby two-rod collapsible stock, a compact holographic sight with a square glass pane. Slim glowing indicator strips along the shroud, a yellow-and-black banded ring at the compensator. Aggressive, dense, rapid-fire. Clean studio lighting, neutral background."*

### `[~]` WPN-JKL · Jackal (assault rifle)
- **Role and feel:** the all-rounder: steady at range, wide from the hip, a heavy even kick you pull down in a burst. Visual weight: full length, balanced, purposeful, ~0.85 m long.
- **Shape:**
  - a receiver with a long top rail;
  - a **curved 30-round magazine** with a ribbed body;
  - a **vented handguard** (long rectangular vents in rows);
  - a **muzzle brake** with three side baffles;
  - a **red-dot sight** (a short tube with a hooded lens: the aiming point);
  - an adjustable stock with a cheek riser and a rubber butt pad;
  - an angled pistol grip;
  - the blaster finish's neon rail along the handguard's top.
- **Moving parts:** the bolt carrier (visible in the ejection port, it cycles), the charging handle, the magazine.
- **Materials:** machined aluminium receiver (anodised, edge wear); polymer furniture; a steel barrel and brake.
- **Finishes:**
  - blaster: gunmetal with a cyan rail;
  - military: matte black receiver with **woodland-camo furniture** (or coyote tan);
  - corporate: white receiver with carbon-fibre furniture.
- **The jackal:** a jackal's head silhouette lasered on the magazine well; three tally notches cut into the stock.
- **Concept prompt:** *"Game weapon concept, a modern assault rifle, three-quarter view plus side orthographic. Machined aluminium receiver with a long top rail, a curved ribbed 30-round magazine, a long handguard with rows of rectangular vents, a three-baffle muzzle brake, a compact hooded red-dot sight, an adjustable stock with a cheek riser, an angled pistol grip. Matte black receiver with woodland camo furniture, worn edges. Balanced, versatile, military-grade. Clean studio lighting, neutral background."*

### `[~]` WPN-BOAR · Boar M12 (pump shotgun)
- **Role and feel:** the close-quarters monster: one shell drops a man up close; a massive, violent kick. Visual weight: the heaviest-looking gun, thick and long, ~0.95 m.
- **Shape:**
  - a **chunky boxy receiver** with a loading port underneath and a side ejection port;
  - a thick barrel over a **magazine tube** (six shells);
  - a **pump fore-end** with deep finger grooves around the tube;
  - a simple **bead front sight** on a ventilated rib (the aiming point);
  - a solid stock with a thick recoil pad;
  - shell-holder side saddle on the receiver (four shells, brass and red);
  - the blaster finish's neon rib along the barrel.
- **Moving parts:** the pump fore-end (slides back ~10 cm and returns), the shells (loaded one by one into the port under the receiver), the trigger.
- **Materials:** heavy parkerized steel; a hardwood or polymer stock and fore-end; brass shell heads.
- **Finishes:**
  - blaster: gunmetal with a neon rib;
  - military: parkerized steel with **wood or woodland-camo furniture**;
  - corporate: white with carbon fibre.
- **The boar:** two curved tusk-shaped bars as a guard over the muzzle's sides; a boar's head stamped on the receiver.
- **Concept prompt:** *"Game weapon concept, a heavy pump-action combat shotgun, three-quarter view plus side orthographic. Chunky boxy receiver with a side ejection port and a loading port underneath, a thick barrel over a magazine tube, a deep-grooved pump fore-end, a bead front sight on a ventilated rib, a solid stock with a thick recoil pad, a side saddle holding four brass-and-red shells, two curved tusk-shaped guard bars at the muzzle. Parkerized steel and worn hardwood. Massive, brutal, close quarters. Clean studio lighting, neutral background."*

---

# Map Environments

## Phase 1 (detailed)

### Favelas (`ENV-FAV`): a Rio hillside in the afternoon sun
- **The look:** a warm, dusty afternoon, faded pastels, raw concrete and brick, sun-bleached zinc, laundry, tangled wires, kites.
- **The game's dimensions** (`src/levels/favelas/FavelaLayout.ts`), which the kit must match:
  - **Terraces and storeys:** terraces 3 m apart, houses exactly one storey (3.0 m), so their roofs are level with the terrace above. Tower storeys add 2.8 m.
  - **Footprints:** houses 6–10 m deep, 3.5–6.5 m long. Alleys 4 m wide.
  - **Stairs:**
    - steps rise 0.25 m;
    - escadarias are 3 m wide;
    - roof stairs are 1.4 m wide, with a 1.2 m landing and a 1.1 m parapet along the side;
    - bridges are 4 m spans, 2 m wide, with rails 0.95 m high and 0.18 m thick.

  The kit is built on a 0.5 m grid.

| ID | Status | Piece | Size (m) | Notes |
|---|---|---|---|---|
| ENV-FAV-WALL-A | `[~]` | Plaster wall, plain | 1.0 / 2.0 × 3.0 × 0.25 | instance colour = the house's pastel |
| ENV-FAV-WALL-B | `[~]` | Plaster wall, window | 2.0 × 3.0 | barred window, sill |
| ENV-FAV-WALL-C | `[~]` | Plaster wall, door | 2.0 × 3.0 | door 0.9 × 2.0, painted |
| ENV-FAV-WALL-D | `[~]` | Bare block wall (plain / window) | 1.0 / 2.0 × 3.0 | the unfinished house, mortar squeeze-out |
| ENV-FAV-CORNER-A | `[~]` | Corner post | 0.25 × 3.0 | rebar stubs where the next storey would go |
| ENV-FAV-ROOF-A | `[~]` | Laje slab tile | 2.0 × 0.12 × 2.0 | walkable cast concrete |
| ENV-FAV-ROOF-B | `[~]` | Laje edge with rebar stubs | 2.0 × 0.3 | the roof's rim |
| ENV-FAV-PARAPET-A | `[~]` | Roof parapet | 1.0 / 2.0 × 1.1 × 0.2 | also the stairs' cheek walls |
| ENV-FAV-TOWER | `[~]` | Tower storey kit | walls as above, 2.8 high | out of reach: its roof is zinc |
| ENV-FAV-ZINC-A | `[~]` | Corrugated zinc roof sheet | 1.0 × 2.0 | flat and bent variants, a lapped edge |
| ENV-FAV-ZINC-B | `[~]` | Zinc awning on brackets | 1.2 × 0.8 | over doors |
| ENV-FAV-TANK | `[~]` | Water tank (caixa d'água) | Ø 1.5 × 1.2 | collider: a vaulted cylinder |
| ENV-FAV-BRIDGE | `[~]` | Plank bridge | 4.0 × 2.0 | rails 0.95 high, 0.18 thick |
| ENV-FAV-STAIR-A | `[~]` | Escadaria flight | 3.0 wide, 3.0 rise | steps 0.25 |
| ENV-FAV-STAIR-B | `[~]` | Roof stair, landing, cheek wall | 1.4 wide | landing 1.2 m |
| ENV-FAV-TERRACE | `[~]` | Retaining wall / terrace face | 2.0 × 3.0 | the face of each terrace |
| ENV-FAV-WIRES | `[~]` | Pole and wire bundle (gato) | 6–8 tall | seen only |
| ENV-FAV-LAUNDRY | `[~]` | Laundry line and clothes | 4.0 span | seen only, cloth sway |
| ENV-FAV-KOMBI | `[~]` | VW-style Kombi van | 4.6 × 2.0 × 2.2 | box collider |
| ENV-FAV-CAR | `[~]` | Small hatchback | 4.2 × 1.8 × 1.45 | box collider |
| ENV-FAV-STALL | `[~]` | Market stall (barraca) | 2.8 × 2.5, awning 2.3 | counter 1.0 |
| ENV-FAV-CRATE | `[~]` | Beer crates, gas cylinders | 1.1 × 1.1 × 1.0 | waist cover |
| ENV-FAV-KITE | `[~]` | Pipa (kite) | 0.8 × 1.3 | seen only |
| ENV-FAV-CLIFF | `[ ]` | Earth cliff and forest edge modules | 6–12 m | the crest's backdrop |
| ENV-FAV-BOUNDARY | `[ ]` | Boundary facade modules | 9–11 m | the street's far side, the ends |

#### Favelas concept descriptions
- **Plaster walls (WALL-A/B/C):**
  - **Surface:** hand-trowelled render over block, slightly uneven, rounded worn corners. The paint is **faded, sun-bleached pastel** (pink, butter yellow, sky blue, mint, peach, lilac) showing chalky white where it has worn, and greyish rain streaks running down from the roofline.
  - **Grime and damage:** a dado of grime and splashback at the foot; small patches where the render has fallen off to show **terracotta hollow block** beneath.
  - **Windows:** a dark frame with **wrought-iron security bars** in a simple pattern, a concrete sill with a drip stain.
  - **Doors:** a solid painted door (green, red, blue) in a plain frame, sometimes a metal gate in front, a house number hand-painted beside it.

  *Prompt: "Modular game wall pieces for a Rio favela, 3 m storey: hand-trowelled render over block, faded sun-bleached pastel paint (pink, yellow, sky blue, mint) chalking and peeling to terracotta block, rain streaks from the top, grime at the base, a barred window with a concrete sill, a painted wooden door with a hand-painted house number. Warm afternoon sun, orthographic front views, trim-sheet ready."*
- **Bare block walls (WALL-D):**
  - orange-terracotta **hollow ceramic blocks** (the eight-hole tijolo baiano) in running bond, with thick grey mortar squeezed out of the joints;
  - a few blocks broken to show their hollows;
  - a raw concrete beam along the top, rebar ends sticking up.

  *Prompt: "Unfinished favela house wall of orange hollow ceramic blocks, thick grey mortar squeezed from the joints, a few broken blocks showing their hollows, a raw concrete beam on top with rusty rebar stubs. Modular 2 m × 3 m panel."*
- **Laje roofs (ROOF-A/B):**
  - grey cast concrete with board-form marks and a few cracks;
  - rust stains from rebar;
  - patches of black waterproofing tar;
  - a ring of **rusty rebar stubs** at the edge, where the owner plans the next storey;
  - a plastic chair here and there (decor).

  *Prompt: "Flat concrete rooftop (laje) of a favela house: grey board-formed concrete, hairline cracks, black tar patches, rust stains, a row of rusty rebar stubs at the edge. Top-down and three-quarter."*
- **Zinc roofs and awnings (ZINC-A/B):**
  - corrugated galvanised sheet, sun-faded from silver to dull grey, with orange rust blooms along the laps and the nail lines;
  - a sheet or two in old blue-painted metal;
  - awnings on bent rebar brackets over the doors.

  *Prompt: "Corrugated zinc roofing sheets, sun-faded galvanised steel with orange rust along laps and nail heads, one blue-painted old sheet, lapped edges; and a small awning on bent rebar brackets. Modular pieces."*
- **Water tank (TANK):** the iconic **blue fibreglass caixa d'água** (Ø 1.5 m, 1.2 m tall): a slightly tapered drum with a domed lid, a moulded rim and a manufacturer's logo, sun-chalked on top. A grey PVC pipe runs down into the roof.

  *Prompt: "Blue fibreglass rooftop water tank (caixa d'água), a slightly tapered drum with a domed screw lid and a moulded rim, sun-chalked, a grey PVC pipe running down from its base."*
- **Plank bridge (BRIDGE):**
  - weathered **wooden planks** nailed across two steel channel beams;
  - one plank replaced with a newer, paler one;
  - handrails of welded **steel pipe** painted chipped red, with chicken-wire infill on one side;
  - wire ties and a rope lashing at one end.

  *Prompt: "Makeshift footbridge between two favela rooftops, 4 m span, 2 m wide: weathered nailed wooden planks on steel channel beams, one newer pale plank, welded steel-pipe handrails painted chipped red with chicken-wire infill, rope lashings."*
- **Stairs (STAIR-A/B):**
  - **Escadaria:** steep **poured-concrete steps** (0.25 m rises), worn round on the nosings, painted in alternating colours (yellow, green, blue risers: a mural stair), a steel-pipe handrail down the middle, a drain gutter along one side.
  - **Roof stair:** narrow concrete steps built up against a house, a top landing and a low cheek wall, sometimes tiled with leftover ceramic tiles.

  *Prompt: "Steep poured-concrete escadaria between favela houses, 3 m wide, risers painted in alternating bright colours, worn nosings, a central steel-pipe handrail, a drain gutter; and a narrow 1.4 m concrete stair against a house wall with a landing and a low cheek wall."*
- **Wires and poles (WIRES):** a leaning concrete utility pole with a crossbar, and a **bird's nest of black cables** (*gatos*, the illegal hook-ups) looping off it to every house, a junction box, a few cable ties, a sneaker hanging by its laces.
- **Laundry (LAUNDRY):** a nylon line between two rebar hooks; T-shirts, a football shirt in yellow and green, towels, jeans, pegs; light enough to sway in the breeze.
- **Street vehicles and stalls (KOMBI/CAR/STALL):**
  - a **two-tone Kombi van** (white over faded blue), its sliding door open, a roof rack with crates;
  - a dented **small hatchback** in faded red;
  - a **barraca:** a wooden counter under a green tarp awning on pipe posts, crates of fruit and a hand-lettered price board.
- **Kite (KITE):** a diamond **pipa** of coloured tissue paper on a bamboo cross, a long tail of plastic strips.

### Night Tokyo (`ENV-TKY`): the Shinjuku block in the rain
Covers the story district and the TDM block (Neon Block).
- **The look:** neon on wet asphalt, narrow alleys under fire escapes, vending machines glowing in the dark, a transit line overhead, ground fog in the streets.
- **The game's dimensions** (`src/levels/neonblock/`), which the kit must match:
  - **Floor heights:** the street (0), the mid level (4.5: fire-escape landings, catwalks, low roofs), the top (7.2: high roofs, skybridges).
  - **Rails:** 1.05 m high.
  - **Rooftop AC units:** 1.4 × 1.0 × 1.1.
  - **Vending machines:** 1.05 × 1.9 × 0.8.
  - **Facades:** the boundary facades are 14 m.

  Kit grid 0.5 m; storeys 3.6 m (the building kit).

| ID | Status | Piece | Size (m) | Notes |
|---|---|---|---|---|
| ENV-TKY-AC-A | `[~]` | Rooftop AC condenser | 1.4 × 1.0 × 1.1 | vaulted cover; stackable ×2 |
| ENV-TKY-AC-B | `[~]` | Wall-mounted AC unit with bracket | 0.8 × 0.55 × 0.3 | out of reach, seen only |
| ENV-TKY-VEND-A | `[~]` | Drinks vending machine (red) | 1.05 × 1.9 × 0.8 | emissive front |
| ENV-TKY-VEND-B | `[~]` | Drinks vending machine (white) | 1.05 × 1.9 × 0.8 | emissive front |
| ENV-TKY-SIGN-A | `[~]` | Vertical blade sign (tategaki) frame | 0.6 × 3–5 | swappable emissive panel |
| ENV-TKY-SIGN-B | `[~]` | Horizontal box sign frame | 2–4 × 0.8 | swappable panel |
| ENV-TKY-SIGN-C | `[~]` | Neon tube kit (letters, arrows, borders) | — | emissive tubes on brackets |
| ENV-TKY-SIGN-D | `[~]` | Sign brackets and conduit kit | — | mounts any sign to a facade |
| ENV-TKY-CAT-A | `[~]` | Fire-escape stair flight | 1.2–2.4 wide, 4.5 / 2.7 rise | grated treads |
| ENV-TKY-CAT-B | `[~]` | Fire-escape landing / catwalk deck | 2.0 × 2.0 modules | grating, rails 1.05 |
| ENV-TKY-CAT-C | `[~]` | Catwalk rail sections | 1.0 / 2.0 × 1.05 | with drop-gap ends |
| ENV-TKY-RAIL-A | `[~]` | Transit rail deck barrier | 2.0 × 1.1 | concrete upstand and mesh |
| ENV-TKY-RAIL-B | `[~]` | Transit rail deck and track modules | 2.0 / 4.0 | sleepers, third rail |
| ENV-TKY-RAIL-C | `[~]` | Transit car (parked) | 2.4 tall | cover on the line |
| ENV-TKY-FAC-A | `[ ]` | Facade kit (storefront, upper storey, balcony, roof parapet) | 3.6 storeys | shutters, signage mounts |
| ENV-TKY-LANT | `[ ]` | Paper lanterns on wire | Ø 0.35 | emissive |
| ENV-TKY-CART | `[ ]` | Noodle cart / yatai | 2.0 × 1.0 | Lantern Market |
| ENV-TKY-BIN | `[ ]` | Bins, crates, bike, traffic cones | small | street clutter |

#### Night Tokyo concept descriptions
- **Rooftop AC condenser (AC-A):**
  - a squat **beige-grey steel box** with a big round fan grille on top (or on the front), louvred side panels, a manufacturer's plate;
  - copper pipes wrapped in grey insulation tape snaking out of one side into a conduit;
  - **rust streaks** under the louvres, bird droppings on top, rain beading on the paint;
  - stackable two-high with a steel frame between them.

  *Prompt: "Japanese rooftop air-conditioner condenser unit, 1.4 m × 1.1 m, beige-grey painted steel box with a large round fan grille, louvred sides, a maker's plate, copper pipes in grey insulation tape snaking into a conduit, rust streaks and rain beading, night rooftop lit by neon. Game prop, three-quarter view."*
- **Wall AC unit (AC-B):** a small split-system unit on a rusty steel **L-bracket** high on a facade, a drain hose dripping, a coiled pipe run along the wall: repeated dozens of times up the side of a building.
- **Vending machines (VEND-A/B):**
  - tall slab **drinks machines**: a curved-top cabinet, a glowing front with three rows of plastic dummy cans and bottles behind glass under small price buttons;
  - a coin slot, a note reader, a pickup bay at the bottom;
  - an **emissive front** that lights the wet ground in front of it;
  - red (a cola brand style) and white (a tea brand style) variants, stickers and scuffs at kick height.

  *Prompt: "Japanese drinks vending machine at night, 1.9 m tall, red curved-top cabinet with a glowing front of three rows of dummy cans and bottles behind glass, small lit price buttons, coin slot, pickup bay, scuffs and stickers, reflection on wet asphalt. White variant too. Game prop."*
- **Neon sign frameworks (SIGN-A/B/C/D):**
  - **Blade signs:** tall narrow vertical boxes stacked off a facade on steel arms, kanji/katakana panels in white acrylic over neon, a dark steel frame with bolts, cables dangling behind.
  - **Box signs:** horizontal lightboxes over shop fronts.
  - **Tube kit:** bent glass neon tubes (pink, cyan, amber) on stand-off clips, with the dark unlit gaps between letters.
  - **Bracket kit:** galvanised arms, junction boxes and grey conduit.

  The **panels are separate** so the game can swap text and colour: the frame is the model, the glow is a material.

  *Prompt: "Kit of Tokyo neon sign frameworks: tall vertical blade-sign boxes on steel arms off a wet building facade, white acrylic panels with kanji over neon, dark bolted steel frames, dangling cables; horizontal lightboxes; bent pink and cyan neon tubes on stand-off clips; galvanised brackets and grey conduit. Night, rain, glow. Modular game assets."*
- **Fire escapes and catwalks (CAT-A/B/C):**
  - black-painted **steel fire escape**: steep stairs with open grated treads and stringers, landings of **expanded-metal grating**, handrails of flat bar at 1.05 m with vertical balusters;
  - rust at the welds, rain dripping from the treads;
  - catwalk decks bolted to the facade on triangular brackets;
  - rail sections with an open "drop gap" variant (where you can jump down).

  *Prompt: "Black steel fire escape on a Tokyo back alley at night: steep stairs with open grated treads, expanded-metal grating landings on triangular wall brackets, flat-bar handrails with vertical balusters, rust at the welds, rain dripping, neon light from the alley below. Modular pieces."*
- **Transit rail barriers and deck (RAIL-A/B/C):**
  - an elevated rail deck edge: a **concrete upstand barrier** with a yellow-and-black hazard band, a **steel mesh fence panel** above it, cable trays, a signal lamp on a short post;
  - the deck with concrete sleepers, two rails and a covered third rail;
  - the **transit car:** a short boxy commuter car in silver with a green stripe, rounded windows, a destination board glowing amber, pantograph folded.

  *Prompt: "Elevated urban rail deck edge in Tokyo at night: a concrete parapet barrier with a yellow-black hazard band, steel mesh fence panels above, cable trays, a small signal lamp; a short silver commuter train car with a green stripe and a glowing amber destination board parked on the line. Rain, neon haze. Modular game assets."*

## Phase 2 (overview: detail later)

### Neon Docks (`ENV-DOK`): a rain-soaked container harbour at night
- **Concept:** sodium-orange and cyan light over wet steel; container stacks, a roofed warehouse, the quay, gantry cranes, barges.
- `[ ]` Shipping containers (20 ft / 40 ft, doors, stack frames).
- `[ ]` Gantry crane legs and the crane cab.
- `[ ]` Warehouse kit (corrugated walls, roof trusses, roller doors).
- `[ ]` Quay edge (bollards, fenders, chain-link fence).
- `[ ]` Barges and pontoons.
- `[ ]` Reach stacker / forklift.
- `[ ]` Sodium floodlight masts.
- `[ ]` Steel stairs to the sniper stack.

### Deep Jungle (`ENV-JNG`): Firebase Viper and the Crash Site
- **Concept:** humid rainforest, mud, an abandoned research outpost on stilts, sandbagged firebase walls, a crashed aircraft.
- `[ ]` Research lab on stilts (modular).
- `[ ]` HESCO barriers and sandbag walls.
- `[ ]` Watchtower.
- `[ ]` Crashed aircraft wreck sections.
- `[ ]` Giant trees with buttress roots.
- `[ ]` Undergrowth sets (ferns, big leaves).
- `[ ]` Tunnel mouths and ravine banks.
- `[ ]` Overgrown containers.
- `[ ]` Generators and fuel drums.

### Maglev Terminal (`ENV-MGL`): a white glass-roofed transit hall
- **Concept:** corporate sci-fi, white satin panels, glass, cyan light lines, a maglev train in the hall.
- `[ ]` The maglev train (three cars, interior kit).
- `[ ]` Platform edge and gates.
- `[ ]` Glass roof truss modules.
- `[ ]` Skybridges.
- `[ ]` Ticket barriers.
- `[ ]` Benches and planters.
- `[ ]` Billboard screens.
- `[ ]` Service walkways.

### Desert Outpost (`ENV-DST`): a walled compound in open dunes
- **Concept:** harsh sun, sandstorms, mud-brick and HESCO, burnt vehicles, sandstone ruins on the flanks (38.0).
- `[ ]` Compound buildings (barracks, motor pool, clinic, trading post, watchtower).
- `[ ]` HESCO and blast walls.
- `[ ]` Burnt-out vehicles (truck, APC, bus).
- `[ ]` Sandstone ruin kit (wall blocks, columns, arches, the well-house).
- `[ ]` Rock outcrops.
- `[ ]` Sandbag nests and trenches.
- `[ ]` Palms and dry brush.
- `[ ]` Pump houses.
- `[ ]` Mesa cliffs.

### Old Port (`ENV-OLD`): a brick-and-concrete harbour on a clear morning
- **Concept:** 1890s brick warehouse, a container yard, a dry dock with a coaster raised on stands, a container crane.
- `[ ]` Brick warehouse kit (pillared hall, upper floor, skylights).
- `[ ]` Coaster ship (hull, deck, bridge).
- `[ ]` Shipwright's stands and cradles.
- `[ ]` Dry dock walls and stairs.
- `[ ]` Containers.
- `[ ]` Container crane.
- `[ ]` Jersey barriers and drums.
- `[ ]` Scaffold towers.
- `[ ]` Bulldozer and cargo stacks.
- `[ ]` Work lamps.

---

## Log
| Date | Change |
|---|---|
| 2026-10-23 | Tracker created. Phase 1 detailed (global assets, Favelas, Night Tokyo); Phase 2 listed. |
