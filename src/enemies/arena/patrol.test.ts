import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArenaDirector, type ArenaMember } from './ArenaDirector';
import { ARENA } from './ArenaCtx';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';

const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const fixed = () => 0;
/** A director with no lanes (patrol alone) over four areas at the corners of a 100 m square. */
function director(lanes: THREE.Vector3[][] = []) {
  const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), lanes);
  d.setPatrol([v(-50, 50), v(50, 50), v(-50, -50), v(50, -50)]);
  return d;
}
const member = (uid: number, pos: THREE.Vector3): ArenaMember => ({ uid, pos, alive: true, isPlayer: false });

describe('27.0 patrol: searching a map without bases', () => {
  it('areas closer than minGap collapse into one', () => {
    const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
    d.setPatrol([v(0, 0), v(3, 0), v(40, 0)]);
    expect(d.hvas).toHaveLength(2);
  });

  it('with nothing known, it goes to the nearest unseen area', () => {
    const d = director();
    expect(d.patrolPick(1, v(40, 40), 0, fixed)).toBe(1);
  });

  it('activity (a death, gunfire, a heard spawn) pulls a patrol further than distance alone would', () => {
    const d = director();
    // From (10, 20): area 1 is the nearest (50 m), area 2 is 92 m off; two deaths there outweigh 42 m.
    expect(director().patrolPick(1, v(10, 20), 0, fixed)).toBe(1);
    d.addHeat(v(-48, -48), 1, 0);
    d.addHeat(v(-48, -48), 1, 0);
    expect(d.patrolPick(1, v(10, 20), 0, fixed)).toBe(2);
  });

  it('a heard spawn counts only within earshot of a living member', () => {
    const d = director();
    expect(d.heardSpawn(v(-50, -50), 0, [member(1, v(50, 50))])).toBe(false);
    expect(d.heardSpawn(v(-50, -50), 0, [member(1, v(-20, -30))])).toBe(true);
    expect(d.patrolStats.spawnsHeard).toBe(1);
  });

  it('activity is capped: one hot spot does not take every patrol', () => {
    const d = director();
    for (let i = 0; i < 50; i++) d.addHeat(v(-50, -50), 1, 0);
    const near = d.patrolScore(1, 14, 0, 0), hot = d.patrolScore(2, 141, 0, 0);
    expect(hot - near).toBeLessThan(ARENA.patrol.heat * ARENA.patrol.heatCap);
  });

  it('claims spread the team: a second bot from the same spot takes another area', () => {
    const d = director();
    const a = d.patrolPick(1, v(0, 0), 0, fixed);
    const b = d.patrolPick(2, v(0, 0), 0, fixed);
    expect(b).not.toBe(a);
  });

  it('an area someone just stood in is stale no longer; the others still are', () => {
    const d = director();
    d.update(10, [member(1, v(50, 50))], 5, { own: 25, theirs: 25 });
    expect(d.patrolScore(1, 50, 0, 10)).toBeLessThan(d.patrolScore(0, 50, 0, 10));
  });

  it('released on death: a dead bot holds no claim', () => {
    const d = director();
    const a = d.patrolPick(1, v(0, 0), 0, fixed);
    d.friendDied({ uid: 1, pos: v(0, 0) } as never, 0);
    expect(d.patrolPick(2, v(0, 0), 0, fixed)).toBe(a);
  });

  it('the brain: no contact means patrol on these maps, and the radar stops at patrol.radar m', () => {
    const src: string = readFileSync(new URL('./DeathmatchAI.ts', import.meta.url), 'utf8');
    // 29.0: on the last stand it holds instead.
    expect(src).toMatch(/next = holding\(A\.director\) \? 'hold' : A\.director\.patrol \? 'patrol' : 'advance'/);
    expect(src).toMatch(/dir\.patrol && d > ARENA\.patrol\.radar/);
  });
});

describe('29.0 the last stand: hold, then press on the clock', () => {
  it('holds while the team is on its last stand, until the sudden-death clock is under pressAt', async () => {
    const { holding } = await import('./DeathmatchAI');
    expect(holding({ lastStand: false, sudden: null })).toBe(false);
    expect(holding({ lastStand: true, sudden: null })).toBe(true);
    expect(holding({ lastStand: true, sudden: ARENA.lastStand.pressAt + 5 })).toBe(true);
    expect(holding({ lastStand: true, sudden: ARENA.lastStand.pressAt - 5 })).toBe(false);
  });

  it('the director gathers its last stand on the centre of the living, one bot a cover spot', () => {
    const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
    d.update(0, [member(1, v(0, 0)), member(2, v(10, 0))], 3, { own: 0, theirs: 5 });
    expect(d.anchor.x).toBeCloseTo(5);
    const spots = [v(5, 2), v(6, -2), v(40, 0)];
    const a = d.holdSpot(1, spots, 9, 0), b = d.holdSpot(2, spots, 9, 0);
    expect(a).not.toBe(null);
    expect(b).not.toBe(null);
    expect(a).not.toBe(b);
    // Too far from the centre: not a hold spot.
    expect(d.holdSpot(3, [v(40, 0)], 9, 0)).toBe(null);
  });
});

describe('32.0 space: a team spread over the map, not one blob', () => {
  // Off by default (a map's profile turns it on: the docks).
  beforeEach(() => void (ARENA.space.on = true));
  afterEach(() => void (ARENA.space.on = false));
  const update = (d: ArenaDirector, members: ArenaMember[]) => d.update(0, members, 5, { own: 50, theirs: 50 });

  it('an area with teammates standing near it scores lower, by space.patrol per crowd', () => {
    const d = director();
    update(d, [member(1, v(0, 0)), member(2, v(-45, 50)), member(3, v(-50, 45))]);
    expect(d.crowd(0, 1)).toBeGreaterThan(1.3);
    expect(d.crowd(1, 1)).toBe(0);
    // Bot 1 doesn't crowd itself.
    expect(d.crowd(0, 2)).toBeCloseTo(1 - 5 / ARENA.space.patrolR, 5);
    expect(d.patrolScore(0, 50, 0, 0, false, d.crowd(0, 1))).toBeLessThan(d.patrolScore(0, 50, 0, 0, false, 0));
    // From the middle the two top areas are as near; the crowded one loses.
    expect(d.patrolPick(1, v(0, 40), 0, fixed)).toBe(1);
  });

  it("a teammate's claim near an area crowds it too (not only the same area)", () => {
    const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
    d.setPatrol([v(-50, 50), v(-36, 50), v(50, 50)]);
    update(d, [member(1, v(0, 80)), member(2, v(0, 80))]);
    expect(d.patrolPick(2, v(-30, 70), 0, fixed)).toBe(1);
    // Area 0 is 14 m from the claimed area 1: crowded; area 2 isn't.
    expect(d.crowd(0, 1)).toBeCloseTo(1 - 14 / ARENA.space.patrolR, 5);
    expect(d.crowd(2, 1)).toBe(0);
  });

  it('the space off (A/B): crowding scores nothing', () => {
    const d = director();
    ARENA.space.on = false;
    try {
      expect(d.patrolScore(0, 50, 0, 0, false, 3)).toBe(d.patrolScore(0, 50, 0, 0, false, 0));
    } finally {
      ARENA.space.on = true;
    }
  });

  it('hunters of one contact are numbered as they join; a bot is on one list; a silent one drops off', () => {
    const d = director();
    expect(d.huntSlot(10, 99, 0)).toBe(0);
    expect(d.huntSlot(11, 99, 0.1)).toBe(1);
    expect(d.huntSlot(12, 99, 0.2)).toBe(2);
    expect(d.huntSlot(11, 99, 0.3)).toBe(1);
    // Bot 10 switches to another contact: it leaves the first list.
    expect(d.huntSlot(10, 77, 0.4)).toBe(0);
    expect(d.huntSlot(11, 99, 0.5)).toBe(0);
    // Bot 12 not heard from for more than huntTtl s: gone; a newcomer is second after 11.
    expect(d.huntSlot(13, 99, 0.3 + ARENA.space.huntTtl + 0.1)).toBe(1);
  });
});
