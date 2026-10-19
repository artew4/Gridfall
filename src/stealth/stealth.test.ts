import { describe, expect, it } from 'vitest';
import { AlertSystem, PURSUIT_LOSS, REPORT_COOLDOWN, SEARCH_TIME } from './AlertSystem';
import { CONFIRMED, DECAY, stepSuspicion, suspicionRate, type SightInput } from './Perception';

const base: SightInput = { dist: 8, cos: 1, los: true, weaponDrawn: false, sprinting: false, light: 1, hunting: false, remembers: false };

/** Seconds of continuous sight needed to reach a positive ID. */
function timeToConfirm(i: SightInput) {
  let s = 0;
  for (let t = 0; t < 60; t += 0.1) {
    s = stepSuspicion(s, suspicionRate(i), 0.1);
    if (s >= CONFIRMED) return t + 0.1;
  }
  return Infinity;
}

describe('Perception', () => {
  it('sees nothing through walls', () => {
    expect(suspicionRate({ ...base, los: false, weaponDrawn: true })).toBe(0);
  });

  it('does not see behind itself beyond peripheral range', () => {
    expect(suspicionRate({ ...base, cos: -1, dist: 8, weaponDrawn: true })).toBe(0);
    expect(suspicionRate({ ...base, cos: -1, dist: 2, weaponDrawn: true })).toBeGreaterThan(0);
  });

  it('a holstered stranger is anonymous beyond 10 m when nobody is hunting', () => {
    expect(suspicionRate({ ...base, dist: 12 })).toBe(0);
    expect(suspicionRate({ ...base, dist: 12, weaponDrawn: true })).toBeGreaterThan(0);
  });

  it('a drawn weapon is identified much faster than a holstered one', () => {
    const armed = timeToConfirm({ ...base, dist: 8, weaponDrawn: true });
    const holstered = timeToConfirm({ ...base, dist: 5 });
    expect(armed).toBeLessThan(1);
    expect(holstered).toBeGreaterThan(2);
  });

  it('gives the player a moment to break line of sight at range', () => {
    // Armed at 25 m: suspicious first, confirmed only after a noticeable delay.
    expect(timeToConfirm({ ...base, dist: 25, weaponDrawn: true })).toBeGreaterThan(1);
  });

  it('holstering does not erase a positive identification', () => {
    expect(timeToConfirm({ ...base, dist: 20, remembers: true })).toBeLessThan(0.5);
  });

  it('darkness slows detection at range only', () => {
    const lit = suspicionRate({ ...base, dist: 15, weaponDrawn: true, light: 1 });
    const dark = suspicionRate({ ...base, dist: 15, weaponDrawn: true, light: 0 });
    expect(dark).toBeLessThan(lit);
    expect(suspicionRate({ ...base, dist: 4, weaponDrawn: true, light: 0 })).toBe(suspicionRate({ ...base, dist: 4, weaponDrawn: true, light: 1 }));
  });

  it('suspicion decays when sight is lost', () => {
    expect(stepSuspicion(0.5, 0, 1)).toBeCloseTo(0.5 - DECAY);
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
