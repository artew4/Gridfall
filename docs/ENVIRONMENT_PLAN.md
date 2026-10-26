# The environment in Blender: the plan

From 68.0 the maps' props and dressing are modelled in Blender (from code, as the guns, the hands and
the operators were in 66.0–67.0), one kit a version, each checked in the game before the next.

## How (the same for every kit)

- **The architecture and the collision stay.** The maps are boxes that are seen and solid at once
  (`StaticBuilder` + `CollisionWorld`); the bots' graph, the stairs, wallbangs and the tests are built
  on them. A kit only changes what a box *looks like*.
- **The dresser** (`src/world/Dress.ts`): a map tells its `StaticBuilder` which of its materials are
  props (the sandbags, the HESCO, the crates…). A box in such a material is replaced by models fitted
  to exactly its bounds: tiled along a run (HESCO cells, sandbag courses), stretched within reason
  (crates). The models are merged into the map's static meshes (no draw calls added), in materials
  built from the map's own textures. Until the models are in, the box is drawn as before.
- **One Blender script a kit** (`tools/blender/props_*.py`, on `gunlib.py`), previews while modelling,
  a GLB in `public/models/props/`, a test reading it (nodes, roles, budget), screenshots in the game,
  the frame time of a 12v12 fight.

## The order

| Step | Version | Kit | Where |
|---|---|---|---|
| 1 ✅ | 68.0 | **Military cover**: sandbag walls laid bag by bag, HESCO cells (liner, wire frame), wooden supply and ammo crates (planks, battens, rope handles, stencilled panel), medical crates, hard equipment cases, oil drums | Desert Outpost (the compound, the arena, the ruins, the houses) |
| 2 ✅ | 69.0 | The same kit on the other military maps, with pallets, tyres, cable spools | Deep Jungle base, Crash Site, Old Port |
| 3 ✅ | 70.0 | **Heavy props**: shipping containers (doors, ribs, lock bars), trucks, the convoy bus, wrecked cars, generators, fuel tanks | Neon Docks, Old Port, Jungle, Crash Site, the Desert's motor pool |
| 4 ✅ | 71.0 | **Desert architecture dressing**: door and window frames, shutters, AC units, roof water tanks, antennas and dishes, rails, tents and awnings, palms, lamps | Desert Outpost |
| 5 ✅ | 72.0 | **Neon street kit**: vending machines, AC units, lanterns, sign frames, bikes, dumpsters, utility poles and transformers, food stalls, bollards | Tokyo, Neon Block, Neon Docks |
| 6 ✅ | 73.0 | **Port industrial**: cranes, mooring bollards, pipe runs, catwalk rails, racks | Neon Docks, Old Port |
| 7 ✅ | 74.0 | **Corporate**: benches, kiosks, planters, gates, the train's details | Maglev Terminal |
| 8 | 75.0 | **Nature and ruin**: trees, bushes, palms, rocks, wreckage, shack details | Favelas, Deep Jungle, Crash Site, the Desert's mesas |

Each step ends with the playtest's word before the next one starts; the order can change with it.
