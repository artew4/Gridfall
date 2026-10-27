# Destruction plan

The ask (after 89.0): Battlefield-style destruction, "a hard fight": walls and cover that break,
explosives that break them, a map that changes over a match. Single player against bots, three.js,
no physics library; the frame budget is 16 ms and the maps run at 5–8 ms of GPU today.

What the engine had: no explosives at all (four guns, hitscan for the player, pooled rounds for the
bots); level geometry merged into one mesh per material (a wall can't be taken out of the picture);
colliders added, never removed; the bots' nav links and cover spots computed once at load. The
hooks to build on: a collider per wall piece with an `onHit`, the rounds' pierce through thin walls,
the particle pools, the procedural sound bank.

## Steps

1. **Explosives (90.0, 90.1).** Frags for everyone (G, two a life; the bots one, cooked), their
   blast (damage through what's in its sight, a bot thrown back, the thrower hurt by his own), the
   fireball, smoke, debris and scorch, the bang near and far, the shake and the ringing ears; the
   bots running from a frag they notice and throwing at targets in cover. 90.1: a rocket launcher as
   a pickup on the map (the player's; the bots take it up in step 3).
2. **The destruction core (91.0, Old Port first).** A destructible wall as a grid of ~0.5 m blocks,
   one InstancedMesh per material (a block out: its matrix zeroed); its colliders rebuilt from what
   is left (greedy merge into boxes) and swapped in the collision grid's cells (a remove/replace API).
   The hole's edges from pre-fractured pieces (tools/blender/props_destruct.py: brick, concrete,
   boards), not square. By material: glass shatters to rounds; wood splinters and is shot through;
   brick and concrete chip under rounds and hole under a blast (or long fire on one spot); container
   steel dents and tears under a rocket. Debris on simple physics (a pool of ~300, asleep after a few
   seconds, then rubble: low cover to vault).
3. **The bots in a breaking map (92.0).** Nav links re-made round a hole (`walkable()` within ~15 m,
   the path memos dropped); cover spots that are gone dropped, rubble's added; a bot leaves cover
   that is being taken apart, fires a rocket at the wall a target hides behind, goes through a fresh
   hole.
4. **Big set pieces (93.0).** Old Port's dry-dock scaffolds coming down, a span of the warehouse's
   wall falling in and closing a way: a support graph (a piece stands on the ones under it), the
   large ones as authored animations rather than simulated.
5. **The other maps (94.0+).** The docks' warehouse, containers and racks; the favelas' brick
   shacks; the desert outpost; Tokyo's glass. Perf measured on each.

Not in scope: a physics engine (Rapier, Ammo: a large cost in the frame for what simple debris
physics does), a fully destructible map (the frames, floors and decks stand, as in Battlefield).
