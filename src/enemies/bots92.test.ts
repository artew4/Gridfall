import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from '../world/Collision';
import { Nav } from './Nav';
import { dropCover, hasCover } from './tactics/CoverSpots';
import { ROCKET_AI } from './arena/DeathmatchAI';
import { BARK_LINES } from './tactics/Barks';
import { Destruction } from '../world/Destruction';
import { ROCKET_BLAST } from '../combat/Explosives';

/* 92.0: the bots in a breaking map: their links through a hole, the cover it took away, their rockets. */

function yard() {
  // Two nodes 10 m apart with a wall between them (breakable), a third out to the side.
  const col = new CollisionWorld();
  const d = new Destruction(new THREE.Scene(), col, { broke() {}, changed() {} });
  d.add(-2, 0, -0.25, 2, 3, 0.25, new THREE.MeshStandardMaterial(), 'brick', 'concrete', { hangs: true });
  d.build();
  const nav = new Nav(col, { nodes: [new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5), new THREE.Vector3(6, 0, -5)], links: [] });
  return { col, d, nav };
}

describe('92.0: a hole in the bots\' map', () => {
  it('no link through the wall; after a rocket, one through the hole (the route memos dropped)', () => {
    const { d, nav } = yard();
    expect(nav.edges[0]).not.toContain(1);
    expect(nav.relinkNear(new THREE.Vector3(0, 0, 0)).walk).toBe(0);
    d.blast(new THREE.Vector3(0, 1.0, -0.3), ROCKET_BLAST.breach!);
    const r = nav.relinkNear(new THREE.Vector3(0, 0, 0));
    expect(r.walk).toBeGreaterThan(0);
    expect(nav.edges[0]).toContain(1);
    expect(nav.edges[1]).toContain(0);
  });
  it('a snapshot taken before puts the links back', () => {
    const { d, nav } = yard();
    const s = nav.snapshot();
    d.blast(new THREE.Vector3(0, 1.0, -0.3), ROCKET_BLAST.breach!);
    nav.relinkNear(new THREE.Vector3(0, 0, 0));
    nav.restore(s);
    expect(nav.edges[0]).not.toContain(1);
  });
  it('a cover spot by the wall stays while the wall does, goes with it', () => {
    const { col, d } = yard();
    const spot = new THREE.Vector3(0, 0, -0.9), open = new THREE.Vector3(8, 0, 8);
    expect(hasCover(col, spot)).toBe(true);
    const spots = [spot, open];
    expect(dropCover(col, spots, new THREE.Vector3(0, 0, 0), 4)).toBe(0);
    d.blast(new THREE.Vector3(0, 1.0, -0.3), ROCKET_BLAST.breach!);
    expect(dropCover(col, spots, new THREE.Vector3(0, 0, 0), 4)).toBe(1);
    // The open one, out of reach of the change, is not judged.
    expect(spots).toEqual([open]);
  });
});

describe("92.0: the bots' rockets", () => {
  it('never close: past a frag\'s reach and the rocket\'s own blast', () => {
    expect(ROCKET_AI.min).toBeGreaterThan(ROCKET_BLAST.radius);
    expect(ROCKET_AI.clear).toBeGreaterThanOrEqual(ROCKET_BLAST.kill * 2);
    expect(ROCKET_AI.carry).toBeGreaterThan(0);
  });
  it('the bark in both voices', () => {
    expect(BARK_LINES.human.rocket.length).toBeGreaterThan(0);
    expect(BARK_LINES.synth.rocket.length).toBeGreaterThan(0);
  });
});
