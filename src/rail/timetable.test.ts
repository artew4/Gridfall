import { describe, expect, it } from 'vitest';
import { APPROACH_S, DWELL_S, DEPART_S, ESCAPE_DWELL_S, fmt, HEADWAY, Timetable, toGame } from './Timetable';

describe('Timetable', () => {
  it('formats the clock', () => {
    expect(fmt(24)).toBe('00:24');
    expect(fmt(72.9)).toBe('01:12');
    expect(fmt(1445)).toBe('00:05');
  });

  it('runs regular services on a fixed headway, with deadheads in between', () => {
    const t = new Timetable(24);
    const s = t.upcoming(6);
    expect(s.length).toBe(6);
    for (let i = 1; i < s.length; i++) expect(s[i].time - s[i - 1].time).toBe(HEADWAY);
    expect(s.some((x) => x.kind === 'deadhead')).toBe(true);
    expect(s.every((x) => !x.escape)).toBe(true);
  });

  it('walks a train through approach, stop and departure', () => {
    const t = new Timetable(24);
    const first = t.upcoming(1)[0];
    t.now = first.time - toGame(APPROACH_S / 2);
    expect(t.active()?.phase).toBe('approach');
    t.now = first.time + toGame(1);
    expect(t.active()?.phase).toBe(first.kind === 'deadhead' ? 'depart' : 'stopped');
    t.now = first.time + toGame(DWELL_S + DEPART_S + 1);
    expect(t.active()).toBeNull();
  });

  it('schedules the escape express without overlapping other trains', () => {
    const t = new Timetable(24);
    t.now = 40;
    const e = t.scheduleEscape(5);
    expect(e.escape).toBe(true);
    expect(e.time).toBe(45);
    const clash = t.services.filter((s) => !s.escape && Math.abs(s.time - e.time) < HEADWAY / 2);
    expect(clash).toEqual([]);
    expect(t.escapeService()?.id).toBe(e.id);
  });

  it('offers another escape after a missed one (no softlock)', () => {
    const t = new Timetable(24);
    t.now = 40;
    const e = t.scheduleEscape(4);
    t.now = e.time + toGame(ESCAPE_DWELL_S + 1);
    expect(t.escapeService()).toBeNull();
    const again = t.scheduleEscape(12, true);
    expect(again.time).toBeGreaterThan(t.now);
    expect(t.escapeService()?.id).toBe(again.id);
  });

  it('keeps the clock moving at the configured rate', () => {
    const t = new Timetable(24);
    t.advance(15);
    expect(t.now).toBeCloseTo(25);
  });
});
