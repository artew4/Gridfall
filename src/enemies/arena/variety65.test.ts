import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { ARENA } from './ArenaCtx';
import { ArenaDirector } from './ArenaDirector';
import { Fronts } from './Fronts';

const ai: string = readFileSync(new URL('./DeathmatchAI.ts', import.meta.url), 'utf8');
const tdm: string = readFileSync(new URL('../../levels/Tdm.ts', import.meta.url), 'utf8');

describe('65.0: the bots run as the human does', () => {
  it("a rifleman's sprint and run are within reach of his (base 3.3 m/s, the rifle's 0.97 against his 0.95)", () => {
    const bot = 3.3 * 0.97, human = 0.95;
    expect(bot * ARENA.sprint).toBeGreaterThan(7.8 * human * 0.9);
    expect(bot * ARENA.sprint).toBeLessThanOrEqual(7.8 * human);
    expect(bot * ARENA.run).toBeGreaterThan(5 * human * 0.85);
    expect(bot * ARENA.run).toBeLessThan(5 * human);
  });

  it('somewhere far to be is a reason to sprint; the opening runs down to the push floor', () => {
    const fn = ai.slice(ai.indexOf('  private sprintReason('), ai.indexOf('  // ------------------------------------------------------------------ act'));
    expect(fn).toMatch(/> R\.far\) return 'rotate'/);
    expect(ARENA.rotate.far).toBeGreaterThan(3);
    expect(ARENA.rotate.opening).toBeGreaterThan(0);
  });
});

describe('65.0: not the same match twice', () => {
  it('the plans: three sectors each, no two alike, every weight positive', () => {
    const L = ARENA.plans.list;
    expect(L.length).toBeGreaterThanOrEqual(4);
    for (const p of L) {
      expect(p.mul).toHaveLength(3);
      expect(p.w).toBeGreaterThan(0);
      for (const m of p.mul) expect(m).toBeGreaterThan(0);
    }
    expect(new Set(L.map((p) => p.mul.join())).size).toBe(L.length);
    // Drawn anew when its time is up, never the one it had.
    expect(tdm).toMatch(/P\.list\.filter\(\(x\) => x !== cur\?\.plan\)/);
    // The deathmatch's opening is dealt by the plan too (not the nearest lane).
    expect(tdm).toMatch(/else if \(dir && !respawn && this\.fronts && s\.role !== 'wolf'\)/);
  });

  it("a sector's lane is not always the same one", () => {
    const lane = (x: number) => Array.from({ length: 11 }, (_, i) => new THREE.Vector3(x, 0, 50 - i * 10));
    const D = new ArenaDirector('alpha', new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -50), [lane(-30), lane(-20), lane(0), lane(30)]);
    D.setFronts(new Fronts(3, () => 0, () => 0), [0, 0, 1, 2]);
    const first = new Set<number>();
    for (let i = 0; i < 40; i++) {
      // (Its own lane isn't counted against it: each deal is a fresh draw.)
      D.dealSector(1, 0);
      first.add(D.laneFor(1, new THREE.Vector3(0, 0, 50)));
    }
    expect([...first].sort()).toEqual([0, 1]);
  });
});

describe('65.0: the watchdog', () => {
  it('a goal with no route, or standing with one, is dropped (a patrol area counted as seen)', () => {
    const fn = ai.slice(ai.indexOf('    // ---- 65.0: the watchdog.'), ai.indexOf('    // ---- Stats.'));
    expect(fn).toMatch(/this\.noRouteT > W\.noRoute \|\| this\.stillT > W\.still/);
    expect(fn).toMatch(/A\.director\.visited\(this\.hva, now\)/);
    expect(fn).toMatch(/this\.goal = null;/);
    expect(fn).toMatch(/this\.urgent = true;/);
  });
});
