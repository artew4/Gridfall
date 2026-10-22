import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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
    expect(src).toMatch(/next = A\.director\.patrol \? 'patrol' : 'advance'/);
    expect(src).toMatch(/dir\.patrol && d > ARENA\.patrol\.radar/);
  });
});
