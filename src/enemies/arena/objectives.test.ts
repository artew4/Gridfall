import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA } from './ArenaCtx';
import { Objectives, type ObjectiveBody } from './Objectives';
import { Fronts } from './Fronts';

const pts = () => [-40, 0, 40].map((x, k) => ({ pos: new THREE.Vector3(x, 0, 0), name: ['west', 'centre', 'east'][k] }));
const at = (team: 'alpha' | 'omega', x: number, n = 1): ObjectiveBody[] => Array.from({ length: n }, () => ({ team, x, y: 0, z: 0 }));
/** Runs `s` seconds in steps of 0.25 with `bodies` standing; the tickets bled. */
function run(O: Objectives, from: number, s: number, bodies: ObjectiveBody[]) {
  const bled = { alpha: 0, omega: 0 };
  for (let t = 0; t < s; t += 0.25) {
    const b = O.update(from + t, 0.25, bodies);
    bled.alpha += b.alpha;
    bled.omega += b.omega;
  }
  return bled;
}

describe('51.0: the flank objectives', () => {
  it('one body takes a neutral point in 1 / rate s; more go faster (capped); level numbers freeze it', () => {
    const O = new Objectives(pts());
    const solo = 1 / ARENA.objectives.rate;
    run(O, 0, solo - 0.5, at('alpha', -40));
    expect(O.list[0].owner).toBeNull();
    run(O, solo, 1, at('alpha', -40));
    expect(O.list[0].owner).toBe('alpha');
    expect(O.events.some((e) => e.what === 'captured' && e.team === 'alpha' && e.k === 0)).toBe(true);
    // Three take the centre in less than half the time.
    const O2 = new Objectives(pts());
    run(O2, 0, solo / 2, at('omega', 0, 3));
    expect(O2.list[1].owner).toBe('omega');
    // Two against two: nothing moves.
    const O3 = new Objectives(pts());
    run(O3, 0, 3, [...at('alpha', 40, 2), ...at('omega', 40, 2)]);
    expect(O3.list[2].meter).toBe(0);
    expect(O3.list[2].contested).toBe(true);
  });

  it("taking the other team's point goes through neutral (a loss event first), and takes twice as long", () => {
    const O = new Objectives(pts());
    const solo = 1 / ARENA.objectives.rate;
    run(O, 0, solo + 0.5, at('omega', -40));
    expect(O.list[0].owner).toBe('omega');
    run(O, 20, solo + 0.5, at('alpha', -40));
    expect(O.list[0].owner).toBeNull();
    expect(O.events.find((e) => e.what === 'neutral')?.from).toBe('omega');
    expect(O.losing(O.list[0], 'omega')).toBe(false);
    run(O, 40, solo, at('alpha', -40));
    expect(O.list[0].owner).toBe('alpha');
  });

  it('nobody on it: the meter drifts back to its owner (or to neutral)', () => {
    const O = new Objectives(pts());
    run(O, 0, 4, at('alpha', 0));
    const m = O.list[1].meter;
    expect(m).toBeGreaterThan(0.3);
    run(O, 10, 4, []);
    expect(O.list[1].meter).toBeLessThan(m);
    expect(O.list[1].meter).toBeGreaterThan(0);
  });

  it('the bleed: one point up bleeds the other slowly, two (a double breakthrough) three times as fast; the last line', () => {
    const B = ARENA.objectives.bleed;
    const O = new Objectives(pts());
    run(O, 0, 11, at('alpha', -40));
    const one = run(O, 20, 60, []);
    expect(one.omega).toBe(Math.floor(60 / B.lead));
    expect(one.alpha).toBe(0);
    expect(O.double('alpha')).toBe(false);
    run(O, 100, 11, at('alpha', 40));
    expect(O.double('alpha')).toBe(true);
    expect(O.lastLine('omega')).toBe(true);
    expect(O.lastLine('alpha')).toBe(false);
    expect(O.events.some((e) => e.what === 'double' && e.team === 'alpha')).toBe(true);
    const two = run(O, 200, 60, []);
    expect(two.omega).toBeGreaterThanOrEqual(Math.floor(60 / B.double) - 1);
    expect(two.omega).toBeGreaterThan(2.5 * one.omega);
  });

  it("need: a point being lost pulls a team's respawns hardest, then the enemy's, then a neutral one", () => {
    const O = new Objectives(pts());
    expect(O.need('alpha', 0)).toBe(ARENA.objectives.need.neutral);
    run(O, 0, 11, at('omega', -40));
    expect(O.need('alpha', 0)).toBe(ARENA.objectives.need.enemy);
    expect(O.need('omega', 0)).toBe(0);
    run(O, 20, 1, at('alpha', -40));
    expect(O.need('omega', 0)).toBe(ARENA.objectives.need.losing);
    // The fronts add it to their own need (and bleed nothing on a break).
    const F = new Fronts(3, (x) => x / 50, (x) => (x < -20 ? 0 : x > 20 ? 2 : 1));
    F.bleeds = false;
    F.extra = { alpha: [5, 0, 0], omega: [0, 0, 0] };
    expect(F.neediest('alpha', undefined, () => 0)).toBe(0);
  });
});
