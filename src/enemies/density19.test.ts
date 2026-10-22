import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA, applyProfile } from './arena/ArenaCtx';
import { Nav } from './Nav';
import { CollisionWorld } from '../world/Collision';
import { TDM, teamSizeOf } from '../levels/Tdm';
import { CRASH_TEAM_SIZE, JUNGLE_AI } from '../levels/crashsite/CrashLayout';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('19.0: map profiles for the arena AI', () => {
  it('a profile changes only what it names (objects one level deep) and puts it all back', () => {
    const before = JSON.stringify(ARENA);
    const undo = applyProfile({ band: [5, 13], flank: { per: 3 }, coverPush: { on: true } });
    expect(ARENA.band).toEqual([5, 13]);
    expect(ARENA.flank.per).toBe(3);
    expect(ARENA.flank.fresh).toBe(1);
    expect(ARENA.coverPush.on).toBe(true);
    undo();
    expect(JSON.stringify(ARENA)).toBe(before);
  });

  it('the cover-hop push is off unless a map turns it on (Crash Site does)', () => {
    expect(ARENA.coverPush.on).toBe(false);
    expect(JUNGLE_AI.coverPush?.on).toBe(true);
    const undo = applyProfile(JUNGLE_AI);
    expect(ARENA.coverPush.on).toBe(true);
    expect(ARENA.ads.maxRange).toBeLessThan(40);
    undo();
    expect(ARENA.coverPush.on).toBe(false);
  });
});

describe('19.0: team size per map', () => {
  it('five a side unless the map says otherwise; Crash Site is 7v7; a DEV force beats both', () => {
    expect(teamSizeOf({})).toBe(5);
    expect(teamSizeOf({ teamSize: CRASH_TEAM_SIZE })).toBe(7);
    TDM.force.size = 8;
    try {
      expect(teamSizeOf({ teamSize: CRASH_TEAM_SIZE })).toBe(8);
      expect(teamSizeOf({})).toBe(8);
    } finally {
      TDM.force.size = null;
    }
  });
});

describe('19.0: stairs are walked, not cut', () => {
  /**
   * A 1.5 m terrace (x 4..10) with a stair up its south side: a ramp along z (z 4 → 0, base 0 → top
   * 1.5) at x 4..6, its hand-linked foot, middle and top; a node beside the stair on the ground.
   */
  const world = () => {
    const col = new CollisionWorld();
    col.add(4, 0, -6, 10, 1.5, 0);
    col.addRamp(4, 0, 6, 4, 'z', 1.5, 0);
    for (let i = 1; i < 8; i++) {
      const c = col.add(4, 0, (4 * (i - 1)) / 8, 6, (1.5 * (8 - i)) / 8, (4 * i) / 8);
      c.floor = false;
    }
    const nodes = [v(5, 0, 5), v(5, 0.75, 2), v(5, 1.5, -1), v(8, 1.5, -3), v(7.2, 0, 2)];
    return { col, nodes };
  };

  it('a hand link that climbs marks its ends; the walker never skips them', () => {
    const { col, nodes } = world();
    const nav = new Nav(col, { nodes, links: [[0, 1], [1, 2]] });
    expect([...nav.climb].sort()).toEqual([0, 1, 2]);
  });

  it('`faces`: no automatic link across a vertical face, and with `slope` only terrain-to-terrain links climb', () => {
    const { col, nodes } = world();
    // The ground node beside the stair (index 4) and the stair's middle (1): 0.75 apart in height.
    const loose = new Nav(col, { nodes, links: [[0, 1], [1, 2]], slope: 0.4 });
    const strict = new Nav(col, { nodes, links: [[0, 1], [1, 2]], slope: 0.4, faces: true });
    expect(loose.edges[4].includes(1)).toBe(true);
    expect(strict.edges[4].includes(1)).toBe(false);
  });

  it('a route from beside a stair enters it at its foot, not its middle', () => {
    const { col, nodes } = world();
    const nav = new Nav(col, { nodes, links: [[0, 1], [1, 2], [2, 3]] });
    // From the ground beside the stair (x 7.2, body height 1) to the terrace.
    const path = nav.route(v(7.2, 1, 2), v(8, 2.5, -3));
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).not.toBe(1);
  });
});
