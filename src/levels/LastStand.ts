import type { TeamId } from '../combat/Team';

/*
  29.0, the Team Deathmatch win condition: Ticket Bleed + Last Stand.

  - Tickets are respawns. A death with tickets left spends one at once (the respawn is granted, it
    happens 3-5 s later); a death at 0 tickets is final for the match.
  - A team is out when nobody of it is standing: alive, or dead with a respawn granted.
  - The match ends only by elimination (or the sudden death below). The end is decided after a frame's
    deaths, with a short trade window: rounds already in flight still land, so if the other team is
    wiped out within TRADE s of the first, the match is a draw (two last men killing each other).
  - Sudden death (anti-camping): a team at 0 tickets standing fewer than the other gets SUDDEN s to
    change that; each kill it scores resets its clock to SUDDEN; at 0 it loses. Both teams at 0
    tickets, standing equal: one clock for both; at 0 the match is a draw. When a tie breaks, the team
    left behind keeps the time it had.

  Pure (no scene, no clock): Tdm drives it once a frame; the tests drive it directly.
*/

export const LAST_STAND = { sudden: 60, trade: 0.4 };

export type MatchWhy = 'elimination' | 'sudden death' | 'trade' | 'sudden death draw';
export interface Outcome {
  winner: TeamId | 'draw';
  why: MatchWhy;
}

const OTHER: Record<TeamId, TeamId> = { alpha: 'omega', omega: 'alpha' };

export class MatchRules {
  tickets: Record<TeamId, number>;
  /** Seconds left on each team's sudden-death clock, or null (not running). */
  sudden: Record<TeamId, number | null> = { alpha: null, omega: null };
  outcome: Outcome | null = null;
  /** The first team found with nobody standing, and when (the trade window runs from there). */
  private out: { team: TeamId; at: number } | null = null;
  /** DEV: when each team's tickets ran out (match time), how often a sudden-death clock started and was reset, the longest run of one. */
  stats = { lastStandAt: { alpha: null as number | null, omega: null as number | null }, suddenStarts: 0, suddenResets: 0, longestSudden: 0 };

  constructor(tickets: number, readonly S = LAST_STAND) {
    this.tickets = { alpha: tickets, omega: tickets };
  }

  /** Someone of `team` died at `now`: true if a respawn is granted (a ticket spent), false if it's out. */
  died(team: TeamId, now: number): boolean {
    if (this.outcome) return false;
    if (this.tickets[team] > 0) {
      this.tickets[team]--;
      if (this.tickets[team] === 0) this.stats.lastStandAt[team] = now;
      return true;
    }
    return false;
  }

  /**
   * 44.0: `team` bleeds a ticket (the other has broken through one of its lines, Fronts): one less
   * respawn, never under 0 (a bleed alone never puts anyone out; its last stand starts as a death's would).
   */
  bleed(team: TeamId, now: number) {
    if (this.outcome || this.tickets[team] <= 0) return;
    this.tickets[team]--;
    if (this.tickets[team] === 0) this.stats.lastStandAt[team] = now;
  }

  /** `team` scored a kill: its sudden-death clock (if running) starts again from the top. */
  killed(team: TeamId) {
    if (this.sudden[team] !== null) {
      this.sudden[team] = this.S.sudden;
      this.stats.suddenResets++;
    }
  }

  /** A team at 0 tickets, both teams' standing counts known. */
  lastStand(team: TeamId) {
    return this.tickets[team] === 0;
  }

  /**
   * Once a frame, after its deaths: `standing` = alive + respawns pending, per team. Returns the
   * outcome once the match is decided (and every call after).
   */
  update(now: number, dt: number, standing: Record<TeamId, number>): Outcome | null {
    if (this.outcome) return this.outcome;
    // ---- Elimination, with the trade window.
    const outA = standing.alpha <= 0, outO = standing.omega <= 0;
    if (outA && outO) return this.finish('draw', 'trade');
    if (this.out) {
      if (now - this.out.at >= this.S.trade) return this.finish(OTHER[this.out.team], 'elimination');
      return null;
    }
    if (outA || outO) {
      this.out = { team: outA ? 'alpha' : 'omega', at: now };
      if (this.S.trade <= 0) return this.finish(OTHER[this.out.team], 'elimination');
      return null;
    }
    // ---- Sudden death.
    const zeroA = this.tickets.alpha === 0, zeroO = this.tickets.omega === 0;
    if (zeroA && zeroO && standing.alpha === standing.omega) {
      // One clock for both: whichever was running carries on (the lower), else a fresh one.
      const run = Math.min(this.sudden.alpha ?? Infinity, this.sudden.omega ?? Infinity);
      if (run === Infinity) this.stats.suddenStarts++;
      const left = (run === Infinity ? this.S.sudden : run) - dt;
      this.sudden.alpha = this.sudden.omega = left;
      if (left <= 0) return this.finish('draw', 'sudden death draw');
      return null;
    }
    for (const t of ['alpha', 'omega'] as const) {
      const behind = this.tickets[t] === 0 && standing[t] < standing[OTHER[t]];
      if (!behind) {
        this.sudden[t] = null;
        continue;
      }
      if (this.sudden[t] === null) {
        this.sudden[t] = this.S.sudden;
        this.stats.suddenStarts++;
      }
      this.sudden[t]! -= dt;
      this.stats.longestSudden = Math.max(this.stats.longestSudden, this.S.sudden - this.sudden[t]!);
      if (this.sudden[t]! <= 0) return this.finish(OTHER[t], 'sudden death');
    }
    return null;
  }

  private finish(winner: TeamId | 'draw', why: MatchWhy) {
    this.outcome = { winner, why };
    return this.outcome;
  }
}
