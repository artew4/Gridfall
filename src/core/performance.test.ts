import { describe, expect, it } from 'vitest';
import { FramePacer, PRESETS, effectiveCap } from './Performance';

/** Draws over `seconds` of a display refreshing at `hz` with the given cap. */
function drawn(hz: number, cap: number, seconds = 10, jitter = 0) {
  const p = new FramePacer();
  let n = 0;
  const step = 1000 / hz;
  for (let i = 0; i < hz * seconds; i++) if (p.tick(i * step + (jitter ? (Math.sin(i * 7.1) * jitter) : 0), cap)) n++;
  return n / seconds;
}

describe('frame pacing', () => {
  it('hits the cap on a 120 Hz display', () => {
    expect(drawn(120, 30)).toBeCloseTo(30, 0);
    expect(drawn(120, 60)).toBeCloseTo(60, 0);
    expect(drawn(120, 90)).toBeGreaterThan(85);
    expect(drawn(120, 90)).toBeLessThan(95);
    expect(drawn(120, 120)).toBeCloseTo(120, 0);
  });

  it('never exceeds the display rate (60 Hz display, 120 cap)', () => {
    expect(drawn(60, 120)).toBeCloseTo(60, 0);
    expect(drawn(60, 30)).toBeCloseTo(30, 0);
  });

  it('tolerates vsync jitter without dropping to half rate', () => {
    expect(drawn(120, 60, 10, 0.8)).toBeGreaterThan(58);
    expect(drawn(144, 60, 10, 0.5)).toBeGreaterThan(55);
  });

  it('a stall does not cause a burst of catch-up frames', () => {
    const p = new FramePacer();
    p.tick(0, 60);
    expect(p.tick(500, 60)).toBe(true);
    expect(p.tick(504, 60)).toBe(false);
  });

  it('menus draw less, a paused game not at all', () => {
    expect(effectiveCap(120, 'title', true)).toBe(60);
    expect(effectiveCap(30, 'title', true)).toBe(30);
    expect(effectiveCap(60, 'title', false)).toBe(10);
    expect(effectiveCap(60, 'paused', true)).toBe(0);
    expect(effectiveCap(90, 'play', true)).toBe(90);
    expect(effectiveCap(120, 'endcard', true)).toBe(10);
    expect(effectiveCap(120, 'dead', true)).toBe(30);
    expect(effectiveCap(60, 'results', true)).toBe(30);
    expect(effectiveCap(30, 'results', true)).toBe(30);
  });
});

describe('presets change resolution and rate, not the look (4.1)', () => {
  it('every preset uses the same bloom levels', () => {
    const levels = new Set(Object.values(PRESETS).map((p) => p.bloomLevels));
    expect(levels.size).toBe(1);
  });
});
