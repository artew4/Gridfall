import * as THREE from 'three';
import type { TeamId } from '../combat/Team';

/*
  27.0, distributed spawns. A map has 10-15 spawn pads anywhere on it instead of two base yards; a
  respawn is scored over all of them at the moment it is asked for (nothing runs per frame):

    cheap terms (no rays), for pad p:
      enemy pressure  − W_near · Σ_h max(0, 1 − d_h / R_near)²       every hostile, 3D distance
      hard minimum    invalid if any d_h < R_hard
      facing          − W_face · #{h : d_h < R_face, h faces p within θ_face}   (it would turn and see)
      allies          + W_ally · exp(−((d_a − D_ally) / S_ally)²)    d_a: the nearest living ally
                      + W_mates · min(3, #{allies within R_mates})  (spawn as a squad)
      recent use      − W_used · (1 − age / T_used)                  someone spawned here < T_used s ago
      rotation        + W_fresh · min(1, age / T_fresh)              pads unused for a while come round
      lane balance    + W_lane · (target_l − share_l) · L            l: the pad's lane; share: of the team's
                                                                     living members in lanes; target: the
                                                                     map's lane weight share (L lanes)
      recent deaths   − W_death · Σ (1 − age / T_death)              deaths within R_death, < T_death s
      jitter          + U(0, J)                                      equal pads take turns
    sight (rays):     invalid if a hostile within R_sight sees the pad (eye 1.6 m → chest 1.2 m)

  The pads are ranked by the cheap score and the rays are cast down that list, one per hostile in
  range, until a pad has no hostile in sight: that pad wins. At most MAX_RAYS rays a request; if
  every pad is seen (or the cap is hit), the least-seen pad of those tried, furthest from its nearest
  hostile. A pad has standing slots around its centre, so a pair spawns side by side.

  The match's first spawn (`opening`) splits each team into squads of two on 3-4 pads of its own side
  of the map (spread out: farthest-point), and drops any OMEGA pad within R_open or in sight of a
  chosen ALPHA pad.

  Pure: positions and a line-of-sight callback in, a position out. The tests drive it.
*/

export interface SpawnPad {
  id: number;
  pos: THREE.Vector3;
  /** The way a spawner faces (enemy yaw convention: forward = (sin, cos)). */
  yaw: number;
  /** Whose side of the map it is on (the opening spawn); null: the contested middle. */
  side: TeamId | null;
  /** The map's lane it is in (TdmData.laneOf), or null (a yard). */
  lane?: number | null;
}

/** What the scorer reads of a combatant. */
export interface SpawnUnit {
  pos: THREE.Vector3;
  /** Its facing on the ground (unit x, z), if known. */
  face?: { x: number; y: number };
}

export const SPAWN = {
  hardMin: 18,
  near: 45,
  wNear: 140,
  face: 30,
  faceCos: Math.cos((35 * Math.PI) / 180),
  wFace: 35,
  sight: 70,
  allyAt: 12,
  allySpread: 14,
  wAlly: 30,
  mates: 25,
  wMates: 5,
  usedFor: 6,
  wUsed: 25,
  freshFor: 45,
  wFresh: 15,
  wLane: 40,
  deathR: 12,
  deathFor: 10,
  wDeath: 15,
  jitter: 6,
  maxRays: 64,
  /** The opening: squads of `squad`, at most `openPads` pads a team, OMEGA's at least `openGap` m from ALPHA's. */
  squad: 2,
  openPads: 4,
  openGap: 30,
};

/** Standing slots round a pad's centre (m): the centre, then a ring. */
const SLOTS: [number, number][] = [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]];

export interface SpawnPick {
  pad: SpawnPad;
  at: THREE.Vector3;
  score: number;
  /** The nearest hostile (m) when it was picked. */
  nearest: number;
  rays: number;
  /** Every pad was seen (or the ray cap was hit): the least bad one. */
  fallback: boolean;
}

export class SpawnManager {
  /** When each pad was last spawned on, and by which team. */
  private used = new Map<number, { t: number; team: TeamId }>();
  private deaths: { pos: THREE.Vector3; t: number }[] = [];
  /** DEV: every pick (the anti-trap report), and rays spent. */
  stats = { picks: 0, rays: 0, fallbacks: 0, maxRays: 0 };

  constructor(
    readonly pads: readonly SpawnPad[],
    /** True when nothing blocks a to b. */
    private los: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    private rand: () => number = Math.random,
  ) {}

  reset() {
    this.used.clear();
    this.deaths.length = 0;
    this.stats = { picks: 0, rays: 0, fallbacks: 0, maxRays: 0 };
  }

  noteDeath(pos: THREE.Vector3, now: number) {
    this.deaths.push({ pos: pos.clone(), t: now });
    while (this.deaths.length && now - this.deaths[0].t > SPAWN.deathFor) this.deaths.shift();
  }

  /** The cheap part of a pad's score (no rays); -Infinity: too close to a hostile. Also its nearest hostile. */
  cheap(pad: SpawnPad, _team: TeamId, hostiles: readonly SpawnUnit[], allies: readonly SpawnUnit[], now: number, laneNeed?: readonly number[]): { s: number; near: number } {
    const S = SPAWN;
    const p = pad.pos;
    let s = 0, near = Infinity;
    for (const h of hostiles) {
      const d = h.pos.distanceTo(p);
      near = Math.min(near, d);
      if (d < S.hardMin) return { s: -Infinity, near };
      if (d < S.near) s -= S.wNear * (1 - d / S.near) ** 2;
      if (h.face && d < S.face) {
        const dx = (p.x - h.pos.x) / d, dz = (p.z - h.pos.z) / d;
        if (dx * h.face.x + dz * h.face.y > S.faceCos) s -= S.wFace;
      }
    }
    let da = Infinity, mates = 0;
    for (const a of allies) {
      const d = a.pos.distanceTo(p);
      da = Math.min(da, d);
      if (d < S.mates) mates++;
    }
    if (da < Infinity) s += S.wAlly * Math.exp(-(((da - S.allyAt) / S.allySpread) ** 2)) + S.wMates * Math.min(3, mates);
    const u = this.used.get(pad.id);
    if (u && now - u.t < S.usedFor) s -= S.wUsed * (1 - (now - u.t) / S.usedFor);
    s += S.wFresh * Math.min(1, u ? (now - u.t) / S.freshFor : 1);
    if (laneNeed && pad.lane != null) s += S.wLane * (laneNeed[pad.lane] ?? 0);
    for (const k of this.deaths) {
      const age = now - k.t;
      if (age < S.deathFor && k.pos.distanceTo(p) < S.deathR) s -= S.wDeath * (1 - age / S.deathFor);
    }
    return { s: s + this.rand() * S.jitter, near };
  }

  /** 1 if a hostile in range sees the pad (the first one stops the rays), 0 if none, Infinity at the ray cap. */
  private seenBy(pad: SpawnPad, hostiles: readonly SpawnUnit[], spent: { n: number }) {
    let seen = 0;
    _chest.set(pad.pos.x, pad.pos.y + 1.2, pad.pos.z);
    for (const h of hostiles) {
      if (h.pos.distanceTo(pad.pos) > SPAWN.sight) continue;
      if (spent.n >= SPAWN.maxRays) return Infinity;
      spent.n++;
      _eye.set(h.pos.x, h.pos.y + 1.6, h.pos.z);
      if (this.los(_eye, _chest)) return ++seen;
    }
    return seen;
  }

  /**
   * A respawn for `team`: the best pad nobody hostile can see. `occupied(p)`: someone stands there
   * (a slot is skipped). `now`: the match clock (recency terms).
   */
  pick(team: TeamId, hostiles: readonly SpawnUnit[], allies: readonly SpawnUnit[], now: number, occupied: (p: THREE.Vector3) => boolean = () => false, laneNeed?: readonly number[]): SpawnPick {
    const ranked = this.pads
      .map((pad) => ({ pad, ...this.cheap(pad, team, hostiles, allies, now, laneNeed) }))
      .sort((a, b) => b.s - a.s);
    const spent = { n: 0 };
    let chosen: (typeof ranked)[number] | null = null;
    // The fallback: of the pads seen, the one whose nearest hostile is furthest.
    let fallback: (typeof ranked)[number] | null = null;
    for (const r of ranked) {
      if (r.s === -Infinity) continue;
      const seen = this.seenBy(r.pad, hostiles, spent);
      if (seen === 0) {
        chosen = r;
        break;
      }
      if (seen !== Infinity && r.near > (fallback?.near ?? -1)) fallback = r;
      if (spent.n >= SPAWN.maxRays) break;
    }
    const isFallback = !chosen;
    // Nothing clear: the least-seen pad tried; nothing tried (all too close): the one furthest from them.
    if (!chosen) chosen = fallback ?? ranked.reduce((a, b) => (b.near > a.near ? b : a));
    this.used.set(chosen.pad.id, { t: now, team });
    this.stats.picks++;
    this.stats.rays += spent.n;
    this.stats.maxRays = Math.max(this.stats.maxRays, spent.n);
    if (isFallback) this.stats.fallbacks++;
    return { pad: chosen.pad, at: this.slot(chosen.pad, occupied), score: chosen.s, nearest: chosen.near, rays: spent.n, fallback: isFallback };
  }

  /** A free standing slot on the pad (the centre first). */
  slot(pad: SpawnPad, occupied: (p: THREE.Vector3) => boolean = () => false) {
    const c = Math.cos(pad.yaw), s = Math.sin(pad.yaw);
    for (const [x, z] of SLOTS) {
      const p = new THREE.Vector3(pad.pos.x + x * c + z * s, pad.pos.y, pad.pos.z - x * s + z * c);
      if (!occupied(p)) return p;
    }
    return pad.pos.clone();
  }

  /**
   * The match's first spawn: per team, the pads its squads start on (one entry per squad, squads of
   * SPAWN.squad over `sizes[team]` members). ALPHA's are spread over its side; OMEGA's over its side,
   * none within openGap m of ALPHA's nor in sight of them (pad eye to pad eye).
   */
  opening(sizes: Record<TeamId, number>): Record<TeamId, SpawnPad[]> {
    const S = SPAWN;
    const squads = (n: number) => Math.min(S.openPads, Math.max(1, Math.ceil(n / S.squad)));
    const sideOf = (t: TeamId) => this.pads.filter((p) => p.side === t);
    const alpha = spread(sideOf('alpha'), squads(sizes.alpha), this.rand);
    const clear = (p: SpawnPad) =>
      alpha.every((a) => {
        if (a.pos.distanceTo(p.pos) < S.openGap) return false;
        _eye.set(a.pos.x, a.pos.y + 1.6, a.pos.z);
        _chest.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
        return !this.los(_eye, _chest);
      });
    let pool = sideOf('omega').filter(clear);
    // Too few clear pads on its side: the neutral ones that are clear too.
    if (pool.length < squads(sizes.omega)) pool = [...pool, ...this.pads.filter((p) => p.side === null && clear(p))];
    if (!pool.length) pool = sideOf('omega');
    const omega = spread(pool, squads(sizes.omega), this.rand);
    for (const p of [...alpha, ...omega]) this.used.set(p.id, { t: -Infinity, team: p.side ?? 'alpha' });
    return { alpha, omega };
  }
}

/** `k` pads spread over `pool`: a random first, then each the furthest from those taken. */
export function spread(pool: readonly SpawnPad[], k: number, rand: () => number = Math.random): SpawnPad[] {
  if (!pool.length) return [];
  const out = [pool[Math.floor(rand() * pool.length)]];
  while (out.length < Math.min(k, pool.length)) {
    let best: SpawnPad | null = null, bd = -1;
    for (const p of pool) {
      if (out.includes(p)) continue;
      const d = Math.min(...out.map((o) => o.pos.distanceTo(p.pos)));
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    out.push(best!);
  }
  return out;
}

/**
 * Which side of the map a point is on, between the two old yards' centres: progress along the
 * ALPHA → OMEGA axis in -1 … +1; under -`mid` ALPHA's, over `mid` OMEGA's, between them neither.
 */
export function sideOf(p: { x: number; z: number }, alpha: { x: number; z: number }, omega: { x: number; z: number }, mid = 0.2): TeamId | null {
  const ax = omega.x - alpha.x, az = omega.z - alpha.z;
  const half = Math.hypot(ax, az) / 2 || 1;
  const s = ((p.x - (alpha.x + omega.x) / 2) * ax + (p.z - (alpha.z + omega.z) / 2) * az) / (half * half * 2);
  return s < -mid ? 'alpha' : s > mid ? 'omega' : null;
}

const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();

/**
 * A map's pads from its ALPHA half: those, and each mirrored across z = 0 for OMEGA (the TDM maps are
 * mirror images end to end): [x, y, z, yaw] → [x, y, −z, π − yaw].
 */
export function mirrorPads(half: readonly (readonly [number, number, number, number])[]): [number, number, number, number][] {
  const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return [...half.map((p) => [...p] as [number, number, number, number]), ...half.map(([x, y, z, a]) => [x, y, -z, +wrap(Math.PI - a).toFixed(3)] as [number, number, number, number])];
}

/**
 * How short each lane is of the team (target_l − share_l) · L: `lanes` the lane each living member is
 * in (null: none), `weights` the map's lane weights. Positive: the lane wants a spawn.
 */
export function laneNeed(lanes: readonly (number | null)[], weights: readonly number[]): number[] {
  const L = weights.length;
  const count = new Array(L).fill(0);
  let n = 0;
  for (const l of lanes) if (l != null && l < L) {
    count[l]++;
    n++;
  }
  const W = weights.reduce((a, w) => a + w, 0) || 1;
  return weights.map((w, l) => (w / W - (n ? count[l] / n : w / W)) * L);
}
