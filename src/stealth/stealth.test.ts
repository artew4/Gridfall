import { describe, expect, it } from 'vitest';
import { AlertSystem, PURSUIT_LOSS, REPORT_COOLDOWN, SEARCH_TIME } from './AlertSystem';
import { CONFIRMED, FOV_COS, SUSPICIOUS, VISION, sightZone, stepSuspicion, suspicionRate, visionRange, type SightInput } from './Perception';

const base: SightInput = { dist: 8, zone: 'cone', visible: 3, weaponDrawn: false, sprinting: false, light: 1, hunting: false, remembers: false, engaged: false, firing: false };
const deg = (d: number) => Math.cos((d * Math.PI) / 180);

/** Seconds of continuous sight needed to reach a positive ID. */
function timeToConfirm(i: SightInput) {
  let s = 0;
  for (let t = 0; t < 60; t += 0.05) {
    s = stepSuspicion(s, suspicionRate(i), 0.05);
    if (s >= CONFIRMED) return t + 0.05;
  }
  return Infinity;
}

describe('Perception: view cone (3D)', () => {
  const R = VISION.range;
  it('the cone is 85° wide: inside at 40°, outside at 45°', () => {
    expect(sightZone(deg(40), 0, 10, R)).toBe('cone');
    expect(sightZone(deg(45), 0, 10, R)).toBe(null);
    expect(FOV_COS).toBeCloseTo(Math.cos((42.5 * Math.PI) / 180));
  });

  it('nobody behind the guard is seen beyond touch range', () => {
    expect(sightZone(-1, 0, 3, R)).toBe(null);
    expect(sightZone(-1, 0, 8, R)).toBe(null);
    expect(sightZone(-1, 0, 1.2, R)).toBe('touch');
  });

  it('side vision is short-range and slow', () => {
    expect(sightZone(deg(70), 0, 4, R)).toBe('peripheral');
    expect(sightZone(deg(70), 0, 7, R)).toBe(null);
    const front = suspicionRate({ ...base, dist: 4, zone: 'cone', weaponDrawn: true });
    const side = suspicionRate({ ...base, dist: 4, zone: 'peripheral', weaponDrawn: true });
    expect(side).toBeLessThan(front * 0.5);
  });

  it('range is limited: 16 m direct, 9 m for a holstered stranger, 22 m once engaged', () => {
    expect(sightZone(1, 0, 17, R)).toBe(null);
    expect(visionRange({ ...base, weaponDrawn: true })).toBe(16);
    expect(visionRange(base)).toBe(9);
    expect(visionRange({ ...base, hunting: true })).toBe(16);
    expect(visionRange({ ...base, engaged: true })).toBe(22);
    expect(suspicionRate({ ...base, dist: 12 })).toBe(0);
    expect(suspicionRate({ ...base, dist: 30, weaponDrawn: true, remembers: true })).toBe(0);
  });

  it('a player straight above or below is outside the vertical view', () => {
    // Roof 8.5 m up, 3 m away horizontally: 63° up — out of view.
    expect(sightZone(1, 8.5 - 0.65, 3, R)).toBe(null);
    // Same roof seen from across the street (12 m): 33° up — in view.
    expect(sightZone(1, 8.5 - 0.65, 12, R)).toBe('cone');
    // Looking down steeply from a walkway is allowed further than looking up.
    expect(sightZone(1, -3.5, 3, R)).toBe('cone');
    expect(sightZone(1, -6, 2, R)).toBe(null);
  });

  it('in a firefight a guard looks up for the shooter (walkway right above him)', () => {
    expect(sightZone(1, 4.5 + 1.1 - 1.75, 2.5, R)).toBe(null);
    expect(sightZone(1, 4.5 + 1.1 - 1.75, 2.5, R, true)).toBe('cone');
  });
});

describe('Perception: recognition', () => {
  it('nothing visible, nothing gained (walls, floors)', () => {
    expect(suspicionRate({ ...base, visible: 0, weaponDrawn: true })).toBe(0);
    expect(suspicionRate({ ...base, zone: null, weaponDrawn: true })).toBe(0);
  });

  it('a drawn weapon is identified in 0.7–1.5 s across the cone', () => {
    expect(timeToConfirm({ ...base, dist: 3, weaponDrawn: true })).toBeGreaterThanOrEqual(0.65);
    expect(timeToConfirm({ ...base, dist: 3, weaponDrawn: true })).toBeLessThan(0.8);
    const edge = timeToConfirm({ ...base, dist: 15.5, weaponDrawn: true });
    expect(edge).toBeGreaterThan(1.3);
    expect(edge).toBeLessThan(1.6);
  });

  it('there is always time to react: the suspicious stage comes well before identification', () => {
    const r = suspicionRate({ ...base, dist: 10, weaponDrawn: true });
    expect(SUSPICIOUS / r).toBeGreaterThan(0.25);
    expect((CONFIRMED - SUSPICIOUS) / r).toBeGreaterThan(0.6);
  });

  it('a holstered stranger takes longer than a drawn weapon', () => {
    const armed = timeToConfirm({ ...base, dist: 6, weaponDrawn: true });
    const holstered = timeToConfirm({ ...base, dist: 6 });
    expect(holstered).toBeGreaterThan(armed * 1.8);
  });

  it('holstering does not erase a positive identification', () => {
    expect(timeToConfirm({ ...base, dist: 14, remembers: true })).toBeLessThan(0.6);
  });

  it('a sliver of the body is much slower to recognise than the whole figure', () => {
    const full = suspicionRate({ ...base, weaponDrawn: true, visible: 3 });
    const one = suspicionRate({ ...base, weaponDrawn: true, visible: 1 });
    expect(one).toBeLessThan(full * 0.4);
  });

  it('darkness slows detection at range only; a muzzle flash ignores it', () => {
    const lit = suspicionRate({ ...base, dist: 12, weaponDrawn: true, light: 1 });
    const dark = suspicionRate({ ...base, dist: 12, weaponDrawn: true, light: 0 });
    expect(dark).toBeLessThan(lit);
    expect(suspicionRate({ ...base, dist: 4, weaponDrawn: true, light: 0 })).toBe(suspicionRate({ ...base, dist: 4, weaponDrawn: true, light: 1 }));
    expect(suspicionRate({ ...base, dist: 12, firing: true, light: 0 })).toBeGreaterThan(dark);
  });

  it('suspicion decays when sight is lost', () => {
    expect(stepSuspicion(0.5, 0, 1)).toBeCloseTo(0.5 - VISION.decay);
    expect(stepSuspicion(0.05, 0, 1)).toBe(0);
  });
});

describe('AlertSystem', () => {
  it('goes unnoticed → suspicious → unnoticed with guard suspicion', () => {
    const a = new AlertSystem();
    a.update(0, true);
    expect(a.level).toBe('suspicious');
    a.update(1, false);
    expect(a.level).toBe('unnoticed');
  });

  it('confirmed sighting starts a pursuit that becomes a search, then calm (an escape)', () => {
    const a = new AlertSystem();
    a.sighting(1, 0, 2, 10);
    expect(a.level).toBe('pursuit');
    expect(a.timesDetected).toBe(1);
    // Contact keeps it in pursuit.
    a.sighting(2, 0, 2, 14);
    a.update(14 + PURSUIT_LOSS - 0.1, false);
    expect(a.level).toBe('pursuit');
    a.update(14 + PURSUIT_LOSS + 0.1, false);
    expect(a.level).toBe('search');
    expect(a.lastKnown?.x).toBe(2);
    a.update(14 + PURSUIT_LOSS + SEARCH_TIME + 0.2, false);
    expect(a.level).toBe('unnoticed');
    expect(a.escapes).toBe(1);
    // Security keeps hunting for a while after the episode.
    expect(a.hunting(14 + PURSUIT_LOSS + SEARCH_TIME + 1)).toBe(true);
  });

  it('being seen again during a search resumes the same episode', () => {
    const a = new AlertSystem();
    a.sighting(0, 0, 0, 0);
    a.update(PURSUIT_LOSS + 1, false);
    expect(a.level).toBe('search');
    a.sighting(5, 0, 5, PURSUIT_LOSS + 3);
    expect(a.level).toBe('pursuit');
    expect(a.episodes).toBe(1);
    expect(a.timesDetected).toBe(2);
  });

  it('civilian reports alert security but never confirm contact', () => {
    const a = new AlertSystem();
    expect(a.report(3, 0, 3, 0, 'civilian')).toBe(true);
    expect(a.level).toBe('alerted');
    expect(a.contactT).toBe(-Infinity);
  });

  it('aggregates repeated civilian reports', () => {
    const a = new AlertSystem();
    a.report(0, 0, 0, 0, 'civilian');
    expect(a.report(4, 0, 0, REPORT_COOLDOWN / 2, 'civilian')).toBe(false);
    expect(a.lastKnown?.x).toBe(4);
    expect(a.report(8, 0, 0, REPORT_COOLDOWN + 1, 'civilian')).toBe(true);
  });

  it('an unconfirmed alert expires on its own', () => {
    const a = new AlertSystem();
    a.report(0, 0, 0, 0, 'gunshot');
    a.update(31, false);
    expect(a.level).toBe('unnoticed');
  });

  it('a stale report during pursuit does not override fresh guard contact', () => {
    const a = new AlertSystem();
    a.sighting(10, 0, 10, 5);
    a.report(0, 0, 0, 5.5, 'civilian');
    expect(a.lastKnown?.x).toBe(10);
  });
});
