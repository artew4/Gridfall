import * as THREE from 'three';
import { ARENA } from './ArenaCtx';
import type { TeamId } from '../../combat/Team';

/*
  51.0, the flank objectives (ARENA.objectives). The playtest after 44.0-46.0: a breakthrough on a flank
  won nothing a player felt. Now each front (a flank, the centre, a flank) has a point on its midline
  that a team takes by standing on it, and holding them is the match's lever:

   - holding a flank opens the team's spawn zone on that flank (Tdm: only the home zone is open at the
     start): a short way back into the fight there, and the defenders want it back;
   - holding more points than the other team bleeds its tickets; two of the three (a double
     breakthrough) three times as fast, and the other team's alarm goes up;
   - the team being bled that hard fights on its last line: it respawns at once (no snowball);
   - the bots go for a point their team doesn't hold (or one being taken from it), and their respawns
     go where a point is being lost.

  The meter: per point, ALPHA's +1 … OMEGA's -1 (0 neutral). Pure: Tdm passes the time and the bodies.
*/

export interface Objective {
  /** Its front (sector) and name (the lane's). */
  k: number;
  name: string;
  pos: THREE.Vector3;
  r: number;
  meter: number;
  owner: TeamId | null;
  /** Who is moving the meter now (null: nobody, or contested). */
  capturing: TeamId | null;
  contested: boolean;
  count: Record<TeamId, number>;
}

export interface ObjectiveBody {
  readonly team: TeamId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ObjectiveEvent {
  t: number;
  k: number;
  what: 'captured' | 'neutral' | 'double' | 'doubleEnd';
  /** Who took it (captured), who knocked it out of the other's hands (neutral), who has (or lost) the two. */
  team: TeamId;
  /** neutral: whose it was. */
  from?: TeamId;
}

const other = (t: TeamId): TeamId => (t === 'alpha' ? 'omega' : 'alpha');
const sign = (t: TeamId) => (t === 'alpha' ? 1 : -1);

export class Objectives {
  list: Objective[];
  events: ObjectiveEvent[] = [];
  /** Seconds of bleeding banked per team (towards its next ticket lost), and at which rate. */
  private bank: Record<TeamId, number> = { alpha: 0, omega: 0 };
  private rate: Record<TeamId, number> = { alpha: 0, omega: 0 };
  private doubled: TeamId | null = null;
  /** DEV: captures and neutralisations per team, seconds each held each point, tickets bled. */
  stats = { captures: { alpha: 0, omega: 0 } as Record<TeamId, number>, held: [] as Record<TeamId, number>[], bled: { alpha: 0, omega: 0 } as Record<TeamId, number>, doubleT: { alpha: 0, omega: 0 } as Record<TeamId, number> };

  /** 64.0: the decisive assault takes the points faster (×, from Tdm). */
  rateMul = 1;
  constructor(points: readonly { pos: THREE.Vector3; name: string; r?: number }[]) {
    this.list = points.map((p, k) => ({ k, name: p.name, pos: p.pos.clone(), r: p.r ?? ARENA.objectives.r, meter: 0, owner: null, capturing: null, contested: false, count: { alpha: 0, omega: 0 } }));
    this.stats.held = this.list.map(() => ({ alpha: 0, omega: 0 }));
  }

  /** Points `team` holds. */
  held(team: TeamId) {
    return this.list.reduce((n, o) => n + (o.owner === team ? 1 : 0), 0);
  }

  /** `team` holds two or more and more than the other (a double breakthrough). */
  double(team: TeamId) {
    const h = this.held(team);
    return h >= 2 && h > this.held(other(team));
  }

  /** `team` is on its last line (the other has its double). */
  lastLine(team: TeamId) {
    return this.double(other(team));
  }

  /** The point of front `k` (or undefined). */
  of(k: number) {
    return this.list[k];
  }

  /** `team` is losing point `o`: its own, the other team moving the meter off it. */
  losing(o: Objective, team: TeamId) {
    return o.owner === team && o.capturing === other(team);
  }

  /** How much `team`'s next body is wanted at front `k` on the points' account (Fronts.extra). */
  need(team: TeamId, k: number) {
    const o = this.list[k];
    if (!o) return 0;
    const N = ARENA.objectives.need;
    if (this.losing(o, team)) return N.losing;
    if (o.owner === other(team)) return N.enemy;
    if (o.owner === null) return N.neutral;
    return 0;
  }

  /** Is (x, y, z) on point `o`? */
  on(o: Objective, x: number, y: number, z: number) {
    return Math.hypot(x - o.pos.x, z - o.pos.z) <= o.r && Math.abs(y - o.pos.y) <= ARENA.objectives.dy;
  }

  private note(e: ObjectiveEvent) {
    this.events.push(e);
    if (this.events.length > 64) this.events.shift();
  }

  /**
   * A step of `dt` s: who stands on each point, the meters, owners, events, the bleed. Returns the
   * tickets each team loses this step.
   */
  update(now: number, dt: number, bodies: readonly ObjectiveBody[]): Record<TeamId, number> {
    const O = ARENA.objectives;
    for (const o of this.list) {
      o.count.alpha = o.count.omega = 0;
      for (const b of bodies) if (this.on(o, b.x, b.y, b.z)) o.count[b.team]++;
      const adv = o.count.alpha - o.count.omega;
      o.contested = o.count.alpha > 0 && o.count.omega > 0 && adv === 0;
      const was = o.meter;
      if (adv !== 0) {
        const t: TeamId = adv > 0 ? 'alpha' : 'omega';
        const n = Math.abs(adv);
        const mult = Math.min(O.maxMult, 1 + O.perExtra * (n - 1));
        o.capturing = sign(t) * o.meter < 1 ? t : null;
        o.meter = THREE.MathUtils.clamp(o.meter + sign(t) * O.rate * this.rateMul * mult * dt, -1, 1);
      } else {
        o.capturing = null;
        // Nobody (or level numbers, contested: frozen): back to its owner's, or to neutral, slowly.
        if (!o.contested) {
          const home = o.owner ? sign(o.owner) : 0;
          const d = home - o.meter;
          o.meter += Math.sign(d) * Math.min(Math.abs(d), O.decay * dt);
        }
      }
      // Owners: a full meter takes it; crossing neutral loses it.
      if (o.owner && sign(o.owner) * o.meter <= 0 && sign(o.owner) * was > 0) {
        this.note({ t: now, k: o.k, what: 'neutral', team: other(o.owner), from: o.owner });
        o.owner = null;
      }
      if (!o.owner && Math.abs(o.meter) >= 1) {
        o.owner = o.meter > 0 ? 'alpha' : 'omega';
        o.meter = sign(o.owner);
        this.stats.captures[o.owner]++;
        this.note({ t: now, k: o.k, what: 'captured', team: o.owner });
      }
      if (o.owner) this.stats.held[o.k][o.owner] += dt;
    }
    // The double breakthrough, announced as it starts and ends.
    const dbl: TeamId | null = this.double('alpha') ? 'alpha' : this.double('omega') ? 'omega' : null;
    if (dbl !== this.doubled) {
      if (this.doubled) this.note({ t: now, k: -1, what: 'doubleEnd', team: this.doubled });
      if (dbl) this.note({ t: now, k: -1, what: 'double', team: dbl });
      this.doubled = dbl;
    }
    if (dbl) this.stats.doubleT[dbl] += dt;
    // The bleed: the team holding more points bleeds the other at the rate its count sets.
    const out: Record<TeamId, number> = { alpha: 0, omega: 0 };
    for (const t of ['alpha', 'omega'] as const) {
      const mine = this.held(other(t)), theirs = this.held(t);
      const every = mine > theirs ? (mine >= 3 ? O.bleed.all : mine >= 2 ? O.bleed.double : O.bleed.lead) : 0;
      if (every !== this.rate[t]) {
        this.rate[t] = every;
        this.bank[t] = 0;
      }
      if (!every) continue;
      this.bank[t] += dt;
      while (this.bank[t] >= every) {
        this.bank[t] -= every;
        out[t]++;
        this.stats.bled[t]++;
      }
    }
    return out;
  }

  /** The DEV summary. */
  report() {
    return {
      captures: { ...this.stats.captures },
      heldS: this.stats.held.map((h) => ({ alpha: Math.round(h.alpha), omega: Math.round(h.omega) })),
      bled: { ...this.stats.bled },
      doubleS: { alpha: Math.round(this.stats.doubleT.alpha), omega: Math.round(this.stats.doubleT.omega) },
      owners: this.list.map((o) => o.owner),
    };
  }
}
