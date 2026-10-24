import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { Fronts, type FrontMember } from './Fronts';
import { ARENA } from './ArenaCtx';
import { ArenaDirector } from './ArenaDirector';

// A 100 m map along z: ALPHA's spawn at z = +50 (progress -1), OMEGA's at -50 (+1); three sectors by x.
const progress = (_x: number, z: number) => -z / 50;
const sectorOf = (x: number) => (x < -10 ? 0 : x > 10 ? 2 : 1);
const make = () => new Fronts(3, progress, (x) => sectorOf(x), [0.6, 0.6, 0.6], ['west', 'centre', 'east']);
const at = (team: 'alpha' | 'omega', x: number, z: number, sector: number | null = null): FrontMember => ({ team, x, y: 0, z, sector });

/** Run `secs` of updates (every 0.25 s) with these members. */
function run(F: Fronts, ms: FrontMember[], secs: number, t0 = 0) {
  let t = t0;
  let bleed = { alpha: 0, omega: 0 };
  for (; t < t0 + secs; t += 0.25) {
    const b = F.update(t, ms);
    bleed = { alpha: bleed.alpha + b.alpha, omega: bleed.omega + b.omega };
  }
  return { t, bleed };
}

describe('44.0 fronts: three lines the teams push', () => {
  it('a line moves to where the two teams meet, no faster than `speed`', () => {
    const F = make();
    // In the centre ALPHA's two lead at z = -10 (progress 0.2) and -12, OMEGA's at -30 (0.6) and -28: they meet at 0.4.
    const ms = [at('alpha', 0, -10), at('alpha', 0, -12), at('omega', 0, -30), at('omega', 0, -28)];
    F.update(0, ms);
    F.update(1, ms);
    expect(F.line[1]).toBeCloseTo(ARENA.fronts.speed, 5);
    run(F, ms, 20, 1.25);
    expect(F.line[1]).toBeCloseTo((0.24 + 0.56) / 2, 2);
    // Nobody in the flanks: they stay at the middle.
    expect(F.line[0]).toBe(0);
    expect(F.line[2]).toBe(0);
  });

  it('one team alone in a sector takes it up to its lead, never into the spawn zones (the cap)', () => {
    const F = make();
    const ms = [at('alpha', -30, -45), at('alpha', -30, -40)];
    run(F, ms, 40);
    expect(F.line[0]).toBeCloseTo(0.6, 5);
  });

  it('stances: ahead by `push` pushes, behind by `fallback` falls back, with kills counted', () => {
    const F = make();
    const ms = [at('alpha', 30, 0, 2), at('alpha', 30, 2, 2), at('alpha', 30, 4, 2), at('omega', 30, -5, 2)];
    F.update(0, ms);
    expect(F.stance.alpha[2]).toBe('push');
    expect(F.stance.omega[2]).toBe('fallback');
    expect(F.stance.alpha[1]).toBe('hold');
    // Even bodies, but OMEGA won the last fights there.
    const G = make();
    const even = [at('alpha', 0, 0, 1), at('omega', 0, -5, 1)];
    for (let i = 0; i < 3; i++) G.kill('omega', 0, 0, 0, i * 0.1);
    G.update(1, even);
    expect(G.stance.omega[1]).toBe('push');
    // They are forgotten after `window` s.
    G.update(1 + ARENA.fronts.window + 1, even);
    expect(G.stance.omega[1]).toBe('hold');
  });

  it('a break: held at the cap for `breakT` s, then the other team bleeds a ticket every `bleed` s', () => {
    const F = make();
    const ms = [at('omega', 30, 45, 2), at('omega', 30, 40, 2)];
    const r1 = run(F, ms, 40);
    expect(F.broken[2]).toBe('omega');
    expect(F.events.some((e) => e.what === 'break' && e.team === 'omega' && e.sector === 2)).toBe(true);
    expect(r1.bleed.alpha).toBeGreaterThan(0);
    expect(r1.bleed.omega).toBe(0);
    // ALPHA retakes it: the break ends (held), no more bleeding.
    const back = [at('alpha', 30, -20, 2), at('alpha', 30, -22, 2), at('alpha', 30, -24, 2)];
    const r2 = run(F, back, 30, r1.t);
    expect(F.broken[2]).toBe(null);
    expect(F.events.some((e) => e.what === 'held' && e.team === 'alpha')).toBe(true);
    expect(r2.bleed.alpha).toBeLessThanOrEqual(1);
  });

  it('need: the next body goes where the team is outnumbered, more where its line is pushed back', () => {
    const F = make();
    const ms = [at('alpha', -30, 0, 0), at('alpha', -30, 0, 0), at('alpha', 0, 0, 1), at('omega', 0, -5, 1), at('omega', 0, -5, 1), at('omega', 0, -5, 1), at('omega', 30, -5, 2)];
    F.update(0, ms);
    expect(F.neediest('alpha', undefined, () => 0)).toBe(1);
    // Even numbers, but the east line is deep in ALPHA's half.
    const G = make();
    G.line[2] = -0.5;
    const even = [at('alpha', -30, 0, 0), at('alpha', 0, 0, 1), at('alpha', 30, 0, 2), at('omega', -30, -5, 0), at('omega', 0, -5, 1), at('omega', 30, -5, 2)];
    G.update(0, even);
    expect(G.neediest('alpha', undefined, () => 0)).toBe(2);
    expect(G.neediest('omega', undefined, () => 0)).not.toBe(2);
  });

  it('the director: each lane advances to its sector\'s line, past it pushing, short of it falling back', () => {
    const lane = (x: number) => Array.from({ length: 11 }, (_, i) => new THREE.Vector3(x, 0, 50 - i * 10));
    const D = new ArenaDirector('alpha', new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -50), [lane(-30), lane(0), lane(30)]);
    const F = make();
    D.setFronts(F, [0, 1, 2]);
    F.line[0] = 0.2;
    F.stance.alpha[0] = 'push';
    F.stance.alpha[2] = 'fallback';
    expect(D.frontWant(0)).toBeCloseTo(0.2 + ARENA.fronts.offset.push, 5);
    expect(D.frontWant(1)).toBeCloseTo(ARENA.fronts.offset.hold, 5);
    expect(D.frontWant(2)).toBeCloseTo(ARENA.fronts.offset.fallback, 5);
    // OMEGA reads the same line from its side.
    const O = new ArenaDirector('omega', new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, 50), [lane(30), lane(0), lane(-30)]);
    O.setFronts(F, [2, 1, 0]);
    expect(O.frontWant(2)).toBeCloseTo(-0.2 + ARENA.fronts.offset[F.stance.omega[0]], 5);
    // A spawn dealt to a sector takes that sector's lane.
    D.dealSector(7, 2);
    expect(D.laneOf.get(7)).toBe(2);
    expect(D.laneInSector(1)).toBe(1);
    // The lane's target is the first waypoint at the wanted progress.
    D.update(0, [{ uid: 7, pos: new THREE.Vector3(30, 0, 40), alive: true, isPlayer: false }], 1, { own: 50, theirs: 50 });
    expect(D.laneTarget[0]).toBe(Math.ceil(((0.2 + ARENA.fronts.offset.push + 1) / 2) * 10 - 1e-9));
  });

  it('wiring: frontliners walk the lane with the fronts on, a far contact out of their sector is left to it', () => {
    const src: string = readFileSync(new URL('./DeathmatchAI.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/A\.director\.patrol && !\(A\.director\.fronts && !wolf\) \? 'patrol' : 'advance'/);
    expect(src).toMatch(/D\.fronts!\.sectorOf\(k\.pos\.x, k\.pos\.y, k\.pos\.z\) === mine/);
    const tdm: string = readFileSync(new URL('../../levels/Tdm.ts', import.meta.url), 'utf8');
    expect(tdm).toMatch(/this\.rules\.bleed\(t, now\)/);
    expect(tdm).toMatch(/dir\.dealSector\(e\.uid, pad\.sector\)/);
  });
});
