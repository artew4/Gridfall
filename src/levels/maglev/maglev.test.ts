import { describe, expect, it } from 'vitest';
import {
  BASE, BRIDGE, CAR, CARS, DOORS, GAP, LANE_WEIGHTS, MEZ, TRACK, TRAIN, UP, X_HALL, Z_END, hallHeight, inBase, inTrain, laneOf, lanesOf, spawnsOf, zoneAt,
} from './MaglevLayout';
import mapSrc from './Maglev.ts?raw';

describe('Maglev Terminal layout', () => {
  it("three lanes per team (tracks, train, mezzanine); OMEGA's are ALPHA's mirrored and reversed", () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    expect(a.length).toBe(3);
    for (let i = 0; i < 3; i++) expect(o[i].map((p) => [p.x, -p.z, p.y])).toEqual(a[2 - i].map((p) => [p.x, p.z, p.y]));
    // Mid-field (between car 3's and car 1's far doors: a door's outside step is the platform).
    const mid = (L: { x: number; y: number; z: number }[]) => L.filter((p) => Math.abs(p.z) < 22);
    for (let l = 0; l < 3; l++) expect(mid(a[l]).every((p) => laneOf(p.x, p.y, p.z) === l)).toBe(true);
  });

  it('the centre lane runs down the train\'s aisle through both gangways, in and out by the cab passages', () => {
    const [, train] = lanesOf('alpha');
    const inside = train.filter((p) => inTrain(p.x, p.y, p.z));
    expect(inside.length).toBeGreaterThanOrEqual(8);
    expect(inside.every((p) => p.y === TRAIN.floor)).toBe(true);
    // Through car 3, car 2 and car 1, by both gangways.
    for (const c of CARS) expect(inside.some((p) => Math.abs(p.z - c) < CAR / 2)).toBe(true);
    const gw = CAR / 2 + GAP / 2;
    expect(inside.some((p) => Math.abs(p.z - gw) < 0.01) && inside.some((p) => Math.abs(p.z + gw) < 0.01)).toBe(true);
    // In and out through the cab passages in the noses: the lane is a straight line down the hall.
    expect(train.every((p) => Math.abs(p.x) < 0.01)).toBe(true);
    expect(train.some((p) => p.z > TRAIN.z && p.z < TRAIN.nose && p.y === TRAIN.floor)).toBe(true);
    expect(train.some((p) => p.z < -TRAIN.z && p.z > -TRAIN.nose && p.y === TRAIN.floor)).toBe(true);
    expect(zoneAt(0, TRAIN.floor, (TRAIN.z + TRAIN.nose) / 2)?.name).toBe('CAR 3');
    expect(DOORS.length).toBe(6);
    // The train is the straightest way between the yards: its lane is the shortest.
    const len = (L: { x: number; z: number }[]) => L.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - L[i].x, p.z - L[i].z), 0);
    const [w, , e] = lanesOf('alpha');
    expect(len(train)).toBeLessThan(len(w));
    expect(len(train)).toBeLessThan(len(e));
  });

  it('every flank lane changes level: the tracks sink into the bed, the mezzanine climbs to 5 m', () => {
    const [w, , e] = lanesOf('alpha');
    expect(w.filter((p) => p.y === TRACK.floor).length).toBeGreaterThanOrEqual(3);
    expect(e.filter((p) => p.y === UP).length).toBeGreaterThanOrEqual(6);
  });

  it("lanes start at the team's own exits, end short of the other yard, and stay inside the hall", () => {
    for (const t of ['alpha', 'omega'] as const) {
      const own = t === 'alpha' ? 1 : -1;
      for (const L of lanesOf(t)) {
        expect(L[0].z * own).toBeGreaterThan(BASE.z0);
        expect(L[L.length - 1].z * own).toBeLessThan(-40);
        for (const p of L) {
          expect(inBase(p, t === 'alpha' ? 'omega' : 'alpha')).toBe(false);
          expect(Math.abs(p.x)).toBeLessThan(X_HALL);
          expect(Math.abs(p.z)).toBeLessThan(Z_END);
        }
      }
    }
  });

  it('eight spawns per team in its own yard, mirrored', () => {
    const a = spawnsOf('alpha'), o = spawnsOf('omega');
    expect(a.length).toBe(8);
    expect(a.every((p) => inBase(p, 'alpha') && !inBase(p, 'omega'))).toBe(true);
    expect(o.map((p) => [p.x, p.z])).toEqual(a.map((p) => [p.x, -p.z]));
  });

  it("the track beds are carved inside their walls' colliders (a body against a wall never reads the platform)", () => {
    for (const sx of [1, -1]) for (const z of [-30, 0, 20]) {
      expect(hallHeight(sx * (TRACK.x0 + 0.35 - 0.21), z)).toBe(TRACK.floor);
      expect(hallHeight(sx * (TRACK.x1 - 0.35 + 0.21), z)).toBe(TRACK.floor);
      expect(hallHeight(sx * (TRACK.x0 - TRACK.wall - 0.01), z)).toBe(0);
      expect(hallHeight(sx * (TRACK.x1 + TRACK.wall + 0.01), z)).toBe(0);
    }
    expect(hallHeight(17, TRACK.z - 0.35 + 0.21)).toBe(TRACK.floor);
    expect(hallHeight(17, TRACK.z + TRACK.wall + 0.01)).toBe(0);
    // Under the train: the platform's level (the train stands on its guideway, not in a trench).
    expect(hallHeight(0, 0)).toBe(0);
  });

  it('the train\'s floor is one step over the platform; the bridges clear its roof', () => {
    expect(TRAIN.floor).toBeLessThanOrEqual(0.28);
    expect(UP - 0.3 - TRAIN.roof).toBeGreaterThan(1.2);
    expect(BRIDGE.x0).toBeLessThan(-TRAIN.x);
    expect(BRIDGE.x1).toBe(MEZ.x0);
  });

  it('20.0: the flanks weigh more than the train (bots go round it), symmetric', () => {
    expect(LANE_WEIGHTS[0]).toBeGreaterThan(LANE_WEIGHTS[1]);
    expect(LANE_WEIGHTS[0]).toBe(LANE_WEIGHTS[2]);
  });

  it('zones: callouts per car, gangway, bridge, mezzanine, track beds; every lane point named', () => {
    expect(zoneAt(0, TRAIN.floor, CARS[0])?.name).toBe('CAR 1');
    expect(zoneAt(0, TRAIN.floor, CARS[1])?.name).toBe('CAR 2');
    expect(zoneAt(0, TRAIN.floor, CARS[2])?.name).toBe('CAR 3');
    expect(zoneAt(0, TRAIN.floor, CAR / 2 + GAP / 2)?.name).toBe('GANGWAY');
    expect(zoneAt(0, UP, 20)?.name).toBe('SKYBRIDGE');
    expect(zoneAt(26, UP, 0)?.name).toBe('MEZZANINE');
    expect(zoneAt(-17, TRACK.floor, 0)?.name).toBe('WEST TRACK');
    expect(zoneAt(-7, 0, 10)?.name).toBe('PLATFORM 1');
    expect(zoneAt(0, 0, 55)?.name).toBe('ALPHA CONCOURSE');
    for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) expect(zoneAt(p.x, p.y, p.z)).not.toBeNull();
  });

  it('the glass is cheap: no physical material, no transmission or refraction, never depth-written', () => {
    // The code (comments aside) never builds a physical material or sets transmission or an index of refraction.
    const code = mapSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/MeshPhysicalMaterial|transmission|refractionRatio|\bior\b/);
    expect(mapSrc).toMatch(/transparent: true, opacity, depthWrite: false/);
  });
});
