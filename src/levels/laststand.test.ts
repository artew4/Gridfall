import { describe, expect, it } from 'vitest';
import { LAST_STAND, MatchRules } from './LastStand';

const S = { sudden: 60, trade: 0.4 };
/** Step the rules `secs` at 60 Hz with a fixed standing. */
function run(r: MatchRules, t0: number, secs: number, standing: { alpha: number; omega: number }) {
  let t = t0;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    t += 1 / 60;
    if (r.update(t, 1 / 60, standing)) break;
  }
  return t;
}

describe('29.0 tickets are respawns', () => {
  it('a death with tickets spends one and respawns; at 0 a death is final', () => {
    const r = new MatchRules(2, S);
    expect(r.died('alpha', 1)).toBe(true);
    expect(r.died('alpha', 2)).toBe(true);
    expect(r.tickets.alpha).toBe(0);
    expect(r.stats.lastStandAt.alpha).toBe(2);
    expect(r.died('alpha', 3)).toBe(false);
    expect(r.tickets.alpha).toBe(0);
  });

  it('no end while both teams stand, however many tickets are gone', () => {
    const r = new MatchRules(0, S);
    expect(run(r, 0, 5, { alpha: 3, omega: 3 }) > 0).toBe(true);
    // Tied at 0 tickets: the sudden-death clock runs, nobody has won yet.
    expect(r.outcome).toBe(null);
  });
});

describe('29.0 elimination', () => {
  it('a team with nobody standing loses once the trade window has passed', () => {
    const r = new MatchRules(0, S);
    expect(r.update(10, 1 / 60, { alpha: 0, omega: 2 })).toBe(null);
    run(r, 10, 1, { alpha: 0, omega: 2 });
    expect(r.outcome).toEqual({ winner: 'omega', why: 'elimination' });
  });

  it('the last two kill each other in the same frame: a draw', () => {
    const r = new MatchRules(0, S);
    expect(r.update(10, 1 / 60, { alpha: 0, omega: 0 })).toEqual({ winner: 'draw', why: 'trade' });
  });

  it('a round already in flight kills the winner 0.2 s later: still a draw (the trade window)', () => {
    const r = new MatchRules(0, S);
    r.update(10, 1 / 60, { alpha: 0, omega: 1 });
    expect(r.outcome).toBe(null);
    expect(r.update(10.2, 0.2, { alpha: 0, omega: 0 })).toEqual({ winner: 'draw', why: 'trade' });
  });

  it('a respawn pending (a ticket spent) keeps a team in the match', () => {
    const r = new MatchRules(5, S);
    // Everyone dead, but each death bought a respawn: standing counts them.
    run(r, 0, 2, { alpha: 5, omega: 1 });
    expect(r.outcome).toBe(null);
  });
});

describe('29.0 sudden death', () => {
  it('the team at 0 tickets standing fewer loses at the clock', () => {
    const r = new MatchRules(0, S);
    r.tickets.omega = 10;
    run(r, 0, 59, { alpha: 1, omega: 3 });
    expect(r.outcome).toBe(null);
    expect(r.sudden.alpha!).toBeLessThan(2);
    expect(r.sudden.omega).toBe(null);
    run(r, 59, 2, { alpha: 1, omega: 3 });
    expect(r.outcome).toEqual({ winner: 'omega', why: 'sudden death' });
  });

  it('a kill resets the clock to the top', () => {
    const r = new MatchRules(0, S);
    run(r, 0, 50, { alpha: 1, omega: 3 });
    r.killed('alpha');
    expect(r.sudden.alpha).toBe(S.sudden);
    expect(r.stats.suddenResets).toBe(1);
    run(r, 50, 30, { alpha: 1, omega: 2 });
    expect(r.outcome).toBe(null);
  });

  it('a team still holding tickets never runs a clock, even when behind', () => {
    const r = new MatchRules(3, S);
    run(r, 0, 120, { alpha: 1, omega: 5 });
    expect(r.sudden.alpha).toBe(null);
    expect(r.outcome).toBe(null);
  });

  it('both at 0 tickets and level: one clock for both, a draw at 0', () => {
    const r = new MatchRules(0, S);
    run(r, 0, 30, { alpha: 2, omega: 2 });
    expect(r.sudden.alpha).toBeCloseTo(r.sudden.omega!, 6);
    run(r, 30, 31, { alpha: 2, omega: 2 });
    expect(r.outcome).toEqual({ winner: 'draw', why: 'sudden death draw' });
  });

  it('a tie broken by a kill: the killers are clear, the team left behind keeps its time', () => {
    const r = new MatchRules(0, S);
    run(r, 0, 20, { alpha: 2, omega: 2 });
    const left = r.sudden.omega!;
    r.killed('alpha');
    run(r, 20, 1 / 60, { alpha: 2, omega: 1 });
    expect(r.sudden.alpha).toBe(null);
    expect(r.sudden.omega!).toBeCloseTo(left - 1 / 60, 3);
  });

  it("the defaults are the brief's: 60 s", () => {
    expect(LAST_STAND.sudden).toBe(60);
  });
});
