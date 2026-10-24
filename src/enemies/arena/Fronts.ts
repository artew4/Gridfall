import { ARENA } from './ArenaCtx';
import type { TeamId } from '../../combat/Team';

/*
  44.0, the fronts: three lines of battle, one per sector (the map's lanes: a flank, the centre, a
  flank), shared by both teams (Tdm owns one a match). The playtest after 41.0-42.0: bots playing like
  players all over the map made a match a scatter of duels with no shape ("скучнее"); 20.0's bases and
  fronts had fights worth being in, but one heap of them. This puts the 20.0 front back, three times
  over, and lets them move: a lane's front is where the two teams meet in it, and the stronger side
  pushes it towards the other's spawn (a MOBA's lanes: a wave pushing a wave).

   - The line: per sector, a progress along ALPHA's base-to-base axis (-1 its spawn … +1 OMEGA's),
     eased (at most `speed` a second) towards where the teams meet: between ALPHA's forward-most and
     OMEGA's forward-most in it (each team's second most forward: one runner doesn't drag a front), or
     to the one team's lead when the other has nobody there. Kept `cap` short of the spawn zones.
   - Strength: a team's bodies sent to a sector (the directors' lanes; the human where he stands) and
     its kills there in the last `window` s, each worth `kill` of a body. The difference is a stance
     for each team in each sector: PUSH (ahead by `push`), HOLD, or FALL BACK (behind by `fallback`).
   - Need: where a team's next body should go: a sector it is outnumbered in, more as its line nears
     its own spawn (`danger`), less with a fight lost there just now.
   - A break: a team that holds a front at the cap (in the other's face) for `breakT` s has broken
     through there: the other team bleeds a ticket every `bleed` s while it lasts (the push has a
     prize; the defenders spawn right on it).

  Pure: no scene, no clock (Tdm passes the time and the members).
*/

export interface FrontMember {
  readonly team: TeamId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The sector it is sent to (a bot's lane), or null: where it stands (the human). */
  readonly sector: number | null;
}

export type FrontStance = 'push' | 'hold' | 'fallback';

export interface FrontEvent {
  t: number;
  sector: number;
  what: 'break' | 'held' | 'push';
  team: TeamId;
}

export class Fronts {
  /** Per sector: the line (ALPHA's progress) and the stance of each team. */
  line: number[];
  stance: Record<TeamId, FrontStance[]>;
  /** Per sector: each team's strength (bodies sent + kills there lately) at the last update. */
  strength: Record<TeamId, number[]>;
  /** Per sector: the team that has broken through there (null: none), since when it held the cap. */
  broken: (TeamId | null)[];
  private capT: Record<TeamId, number[]>;
  private kills: { t: number; sector: number; team: TeamId }[] = [];
  private lastT = -Infinity;
  /** Events for the HUD and the reports, bounded. */
  events: FrontEvent[] = [];
  /** DEV: per sector, the line sampled each update (for the reports), and how often it crossed the middle. */
  stats = { samples: 0, crossings: 0, breaks: 0, bleeds: { alpha: 0, omega: 0 } as Record<TeamId, number>, lineSum: [] as number[], lineAbs: [] as number[] };
  private side: number[];
  /**
   * 51.0: with the flank objectives (Objectives.ts) a break bleeds nothing (the points do), and each
   * team's need gets `extra` per sector (a point being lost, the enemy's, neutral).
   */
  bleeds = true;
  extra: Record<TeamId, number[]> | null = null;

  /**
   * `n` sectors; `progress`: ALPHA's progress of a point; `sectorOf`: a point's sector (where it
   * stands); `caps`: how far each sector's line may go (short of the spawn zones), in progress.
   */
  constructor(
    readonly n: number,
    readonly progress: (x: number, z: number) => number,
    readonly sectorOf: (x: number, y: number, z: number) => number,
    readonly caps: readonly number[] = new Array(n).fill(0.6),
    readonly names: readonly string[] = [],
  ) {
    this.line = new Array(n).fill(0);
    this.stance = { alpha: new Array(n).fill('hold'), omega: new Array(n).fill('hold') };
    this.strength = { alpha: new Array(n).fill(0), omega: new Array(n).fill(0) };
    this.broken = new Array(n).fill(null);
    this.capT = { alpha: new Array(n).fill(-1), omega: new Array(n).fill(-1) };
    this.side = new Array(n).fill(0);
    this.stats.lineSum = new Array(n).fill(0);
    this.stats.lineAbs = new Array(n).fill(0);
  }

  reset() {
    this.line.fill(0);
    this.stance.alpha.fill('hold');
    this.stance.omega.fill('hold');
    this.strength.alpha.fill(0);
    this.strength.omega.fill(0);
    this.broken.fill(null);
    this.capT.alpha.fill(-1);
    this.capT.omega.fill(-1);
    this.side.fill(0);
    this.kills.length = 0;
    this.events.length = 0;
    this.lastT = -Infinity;
    this.stats = { samples: 0, crossings: 0, breaks: 0, bleeds: { alpha: 0, omega: 0 }, lineSum: new Array(this.n).fill(0), lineAbs: new Array(this.n).fill(0) };
  }

  /** A team's own progress of the line in sector `k` (its spawn -1 … the other's +1). */
  own(team: TeamId, k: number) {
    return team === 'alpha' ? this.line[k] : -this.line[k];
  }

  /** `killer` of `team` killed someone in sector `k` at `t`. */
  kill(team: TeamId, x: number, y: number, z: number, t: number) {
    this.kills.push({ t, sector: this.sectorOf(x, y, z), team });
  }

  private note(e: FrontEvent) {
    this.events.push(e);
    if (this.events.length > 64) this.events.shift();
  }

  /**
   * Every director step: the lines, strengths, stances, breaks. Returns the tickets each team bleeds
   * this step (a break held through another `bleed` s).
   */
  update(now: number, members: readonly FrontMember[]): Record<TeamId, number> {
    const F = ARENA.fronts;
    const dt = this.lastT === -Infinity ? 0 : Math.min(1, now - this.lastT);
    this.lastT = now;
    const n = this.n;
    while (this.kills.length && now - this.kills[0].t > F.window) this.kills.shift();
    // Forward-most two of each team in each sector (where they stand), and the bodies sent there.
    const aTop = new Array(n).fill(-Infinity), aSec = new Array(n).fill(-Infinity);
    const oTop = new Array(n).fill(Infinity), oSec = new Array(n).fill(Infinity);
    const sent: Record<TeamId, number[]> = { alpha: new Array(n).fill(0), omega: new Array(n).fill(0) };
    for (const m of members) {
      const here = this.sectorOf(m.x, m.y, m.z);
      sent[m.team][m.sector ?? here]++;
      const p = this.progress(m.x, m.z);
      if (m.team === 'alpha') {
        if (p > aTop[here]) {
          aSec[here] = aTop[here];
          aTop[here] = p;
        } else if (p > aSec[here]) aSec[here] = p;
      } else if (p < oTop[here]) {
        oSec[here] = oTop[here];
        oTop[here] = p;
      } else if (p < oSec[here]) oSec[here] = p;
    }
    const bleed: Record<TeamId, number> = { alpha: 0, omega: 0 };
    for (let k = 0; k < n; k++) {
      const a = aSec[k] > -Infinity ? aSec[k] : aTop[k];
      const o = oSec[k] < Infinity ? oSec[k] : oTop[k];
      let target: number | null = null;
      if (a > -Infinity && o < Infinity) target = (a + o) / 2;
      else if (a > -Infinity) target = a;
      else if (o < Infinity) target = o;
      if (target !== null) {
        target = Math.max(-this.caps[k], Math.min(this.caps[k], target));
        const d = target - this.line[k];
        const step = F.speed * dt;
        this.line[k] += Math.max(-step, Math.min(step, d));
      }
      // Strength and stance.
      let ka = 0, ko = 0;
      for (const e of this.kills) if (e.sector === k) e.team === 'alpha' ? ka++ : ko++;
      this.strength.alpha[k] = sent.alpha[k] + F.kill * ka;
      this.strength.omega[k] = sent.omega[k] + F.kill * ko;
      for (const t of ['alpha', 'omega'] as const) {
        const o2 = t === 'alpha' ? 'omega' : 'alpha';
        const adv = this.strength[t][k] - this.strength[o2][k];
        const was = this.stance[t][k];
        // (Hysteresis: a push lasts until the edge is half gone; so does a fall back.)
        const push = adv >= (was === 'push' ? F.push / 2 : F.push) && sent[t][k] > 0;
        const back = adv <= (was === 'fallback' ? F.fallback / 2 : F.fallback);
        const s: FrontStance = push ? 'push' : back ? 'fallback' : 'hold';
        if (s === 'push' && was !== 'push') this.note({ t: now, sector: k, what: 'push', team: t });
        this.stance[t][k] = s;
        // A break: the line held at the cap in the other's face.
        const atCap = (t === 'alpha' ? this.line[k] : -this.line[k]) >= this.caps[k] - 0.03;
        if (atCap) {
          if (this.capT[t][k] < 0) this.capT[t][k] = now;
          if (this.broken[k] !== t && now - this.capT[t][k] >= F.breakT) {
            this.broken[k] = t;
            this.stats.breaks++;
            this.note({ t: now, sector: k, what: 'break', team: t });
            this.capT[t][k] = now;
          }
          if (this.broken[k] === t && this.bleeds && F.bleed > 0 && now - this.capT[t][k] >= F.bleed) {
            this.capT[t][k] = now;
            bleed[o2]++;
            this.stats.bleeds[o2]++;
          }
        } else {
          this.capT[t][k] = -1;
          if (this.broken[k] === t) {
            this.broken[k] = null;
            this.note({ t: now, sector: k, what: 'held', team: o2 });
          }
        }
      }
      // The reports: where the line sits, and how often it changes sides of the middle.
      const s = Math.abs(this.line[k]) < 0.1 ? 0 : Math.sign(this.line[k]);
      if (s !== 0 && this.side[k] !== 0 && s !== this.side[k]) this.stats.crossings++;
      if (s !== 0) this.side[k] = s;
      this.stats.lineSum[k] += this.line[k];
      this.stats.lineAbs[k] += Math.abs(this.line[k]);
    }
    this.stats.samples++;
    return bleed;
  }

  /**
   * Where `team`'s next body is needed most: per sector, how far it is outnumbered there, plus `danger`
   * × how far its line is pushed back towards its spawn, less `lost` for each fight it lost there
   * just now; `weights` (the map's lanes: a centre worth more) scale its fair share.
   */
  need(team: TeamId, weights?: readonly number[]): number[] {
    const F = ARENA.fronts;
    const o2 = team === 'alpha' ? 'omega' : 'alpha';
    const mine = this.strength[team], theirs = this.strength[o2];
    let all = 0, wsum = 0;
    for (let k = 0; k < this.n; k++) {
      all += mine[k];
      wsum += weights?.[k] ?? 1;
    }
    return this.line.map((_, k) => {
      const fair = ((all + 1) * (weights?.[k] ?? 1)) / wsum;
      const back = Math.max(0, -this.own(team, k));
      return (theirs[k] - mine[k]) * F.outnumbered + (fair - mine[k]) + F.danger * back + (this.extra?.[team][k] ?? 0);
    });
  }

  /** A body of `team` was just sent to sector `k` (a respawn): counted now, so a wave spreads by need. */
  sent(team: TeamId, k: number) {
    this.strength[team][k]++;
  }

  /** The sector that needs `team`'s next body most (ties: the lower index… shuffled by `rand`). */
  neediest(team: TeamId, weights?: readonly number[], rand: () => number = Math.random) {
    const need = this.need(team, weights);
    let best = 0, bs = -Infinity;
    for (let k = 0; k < this.n; k++) {
      const s = need[k] + rand() * 0.3;
      if (s > bs) {
        bs = s;
        best = k;
      }
    }
    return best;
  }

  /** The DEV summary: each line's mean and mean distance from the middle, crossings, breaks, bleeds. */
  report() {
    const S = this.stats, N = Math.max(1, S.samples);
    return {
      lineMean: S.lineSum.map((v) => +(v / N).toFixed(2)),
      lineAbsMean: S.lineAbs.map((v) => +(v / N).toFixed(2)),
      crossings: S.crossings,
      breaks: S.breaks,
      bleeds: { ...S.bleeds },
    };
  }
}
