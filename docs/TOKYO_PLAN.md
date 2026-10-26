# Night Tokyo, the detail pass, and the materials

From 78.0 Night Tokyo's street is redone piece by piece the way the maps' props were (docs/ENVIRONMENT_PLAN.md):
the models from code in Blender (`tools/blender/props_*.py`), the faces painted on canvases (`src/world/*`),
each step one version with its playtest.

## What was there

The district's blocks were boxes with a facade texture; on their faces about 120 storefront slots (4 m each)
were one flat picture of four (`shop`: shelves, `izakaya`: a shoji grid, `shutter`, `door`) repeated all over
the map; the street furniture, the vending machines, the stall and the cabinets got models in 72.0.

## The rules (as for the props)

- **No false cover.** The colliders stay the map's; under head height a model keeps within 0.17 m of the
  wall it is laid on (its handles; the rest 0.12); what stands further out (signs, eaves, lanterns, awnings, canopies) is over 2.2 m.
- **No geometry in a block.** A room seen through glass is shader work (interior mapping), not a box.
- **Every repeat varied.** A slot's room, sign, curtain, cloth come from where it is: no two the same next
  to each other.
- **The frame rate holds.** Static geometry merged per material; textures painted once into atlases.

## The order

| Step | Version | What | Where |
|---|---|---|---|
| 1 ✅ | 78.0 | **Storefronts**: modelled fronts (a shop's aluminium front, an izakaya's wood, koshi, noren, eave and lanterns, roll shutters, building entrances with mailboxes and tenant directories), the rooms behind the glass (interior mapping: konbini, drugstore, electronics, boutique, cafe, bookshop, izakaya, ramen, lobby), a lightbox sign of its own for every shop, awnings | Every block face's slots |
| 2 ✅ | 79.0 | **Materials for every kit**: textures and wear by role instead of flat colours: rust and paint chips on containers and vehicles, streaks and damp on plaster (Favelas), grime on metal, worn wood, edge wear; one painted set shared by the kits | Every map with Blender props |
| 3 ✅ | 80.0 | **Facades above the street**: the windows as rooms (interior mapping, lit and dark, curtains, blinds), balconies with laundry and plants, air conditioners, external stairs, gutters and pipes, vertical signs (tate-kanban) stacks, rooftop tanks and rails | Tokyo's blocks |
| 4 ✅ | 82.0 | **Street level**: traffic lights and pedestrian signals, street signs, a phone box, newspaper boxes, the vending machines' lit fronts, manholes and drains, bicycle parking, scooters, cones, delivery boxes | Tokyo's streets and plaza |
| 5 ✅ | 83.0 | **Landmarks**: the fountain plaza, Kenji's ramen stall, the metro entrance and station, the railway overpass (girders, rivets, cables), the train | Tokyo |
| 6 | 84.0 | **Light and wet**: signs in the puddles, flicker variety, steam vents, wet decals, the shops' light spilling on the pavement | Tokyo |

Each step ends with the playtest's word before the next one starts; the order can change with it.
