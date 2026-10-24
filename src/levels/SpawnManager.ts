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
                      41.0, fireteams (instead of W_mates): n = #{allies within R_density}, the map's
                      local area: + W_team for n = 1 or 2 (a fireteam to join), 0 for 3,
                      − W_crowd · (n − 3) for 4 and more (a deathball)
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
  /**
   * 41.0, fireteams (Tdm turns it on with ARENA.sectors): the local area's radius (m; the map's
   * spawnTuning: wide maps 15-20, narrow ones 5-8), and what 1-2 allies in it (a fireteam to join) and
   * each ally past 3 (a deathball) are worth: on a pad (`wTeam`, `wCrowd`) and on a deployment zone
   * (`zoneTeam`, `zoneCrowd`, in zone uses: a zone used once more than another is 1).
   */
  densityR: 12,
  wTeam: 10,
  wCrowd: 25,
  zoneTeam: 1.25,
  zoneCrowd: 2,
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

/** 41.0: what `n` allies in a spot's local area are worth: `team` for 1-2, 0 for none or 3, −`crowd` per ally past 3. */
export function fireteamScore(n: number, team: number, crowd: number) {
  return n === 0 || n === 3 ? 0 : n <= 2 ? team : -crowd * (n - 3);
}

export class SpawnManager {
  /** 28.0: the weights in use (SPAWN with the map's TdmData.spawnTuning over it). */
  readonly S: typeof SPAWN;
  /** 41.0: score the local area's allies as a fireteam (SPAWN.wTeam / wCrowd) instead of W_mates. */
  fireteam = false;
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
    tuning: Partial<typeof SPAWN> = {},
  ) {
    this.S = { ...SPAWN, ...tuning };
  }

  reset() {
    this.used.clear();
    this.deaths.length = 0;
    this.stats = { picks: 0, rays: 0, fallbacks: 0, maxRays: 0 };
  }

  noteDeath(pos: THREE.Vector3, now: number) {
    this.deaths.push({ pos: pos.clone(), t: now });
    while (this.deaths.length && now - this.deaths[0].t > this.S.deathFor) this.deaths.shift();
  }

  /** The cheap part of a pad's score (no rays); -Infinity: too close to a hostile. Also its nearest hostile. */
  cheap(pad: SpawnPad, _team: TeamId, hostiles: readonly SpawnUnit[], allies: readonly SpawnUnit[], now: number, laneNeed?: readonly number[]): { s: number; near: number } {
    const S = this.S;
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
    let da = Infinity, mates = 0, local = 0;
    for (const a of allies) {
      const d = a.pos.distanceTo(p);
      da = Math.min(da, d);
      if (d < S.mates) mates++;
      if (d < S.densityR) local++;
    }
    if (da < Infinity) s += S.wAlly * Math.exp(-(((da - S.allyAt) / S.allySpread) ** 2)) + (this.fireteam ? fireteamScore(local, S.wTeam, S.wCrowd) : S.wMates * Math.min(3, mates));
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
      if (h.pos.distanceTo(pad.pos) > this.S.sight) continue;
      if (spent.n >= this.S.maxRays) return Infinity;
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
      if (spent.n >= this.S.maxRays) break;
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
    const S = this.S;
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

/**
 * 28.0: a point-symmetric map's pads from its ALPHA half (the desert): those, and each rotated 180°
 * about the origin for OMEGA: [x, y, z, yaw] → [−x, y, −z, yaw + π].
 */
export function rotatePads(half: readonly (readonly [number, number, number, number])[]): [number, number, number, number][] {
  const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return [...half.map((p) => [...p] as [number, number, number, number]), ...half.map(([x, y, z, a]) => [-x, y, -z, +wrap(a + Math.PI).toFixed(3)] as [number, number, number, number])];
}

/*
  31.0, deployment zones. Each team has 2-3 zones in its own half of the map (A, B, C: a flank, the
  centre, the other flank), and a respawn goes to a zone first, then to a spot in it:

    1. Zone safety: a zone is unsafe if a hostile stands within (radius + hardMin) of its centre, or a
       hostile within sight range sees its centre (eye 1.6 m → chest 1.2 m; one ray each).
    2. Distribution: of the safe zones, the least used this match, then the least recently used
       (round-robin over the match: the flanks and the centre get the team evenly). 41.0, fireteams:
       the uses less than the least used's, plus fireteamScore(allies within densityR of the centre,
       zoneTeam, zoneCrowd): a zone with a mate or two near it comes first, one with 4+ last.
    3. Nothing safe: the zone whose nearest hostile is furthest.
    4. The spot: the zone's own SpawnManager (the 27.0 scorer: pressure, sight, allies, recency) over
       the zone's points only.

  The opening deals squads of two round-robin over the zones.
*/

/** 51.0: 'H', a home zone made of the base's own spawns (a map whose zones are all on its flanks). */
export type ZoneId = 'A' | 'B' | 'C' | 'H';

export interface DeployZone {
  id: ZoneId;
  team: TeamId;
  centre: THREE.Vector3;
  r: number;
  /** The standing spots in it (validated against the level at setup). */
  points: SpawnPad[];
  /** Picks this match, and the match time of the last. */
  uses: number;
  lastUse: number;
}

export interface ZonePick extends SpawnPick {
  zone: DeployZone;
  /** The zone was not safe (every one was, or none was). */
  unsafeZone: boolean;
}

export class ZoneSpawner {
  private mgrs = new Map<DeployZone, SpawnManager>();
  /** 41.0: zones and spots scored by the allies near them as fireteams (see the header). */
  fireteam = false;
  /** DEV: picks, rays spent on zone safety, picks with no safe zone. */
  stats = { picks: 0, zoneRays: 0, noSafeZone: 0 };
  /**
   * 51.0: which zones are open now (the flank objectives: home always, a flank's while the team holds
   * it); absent: all.
   */
  active: ((z: DeployZone) => boolean) | null = null;

  constructor(
    readonly zones: readonly DeployZone[],
    private los: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    private rand: () => number = Math.random,
    readonly tuning: Partial<typeof SPAWN> = {},
  ) {
    for (const z of zones) this.mgrs.set(z, new SpawnManager(z.points, los, rand, tuning));
  }

  get S() {
    return { ...SPAWN, ...this.tuning };
  }

  zonesOf(team: TeamId) {
    return this.zones.filter((z) => z.team === team);
  }

  /** 51.0: the team's open zones (every one of them if none is). */
  openOf(team: TeamId) {
    const own = this.zonesOf(team);
    const on = this.active ? own.filter(this.active) : own;
    return on.length ? on : own;
  }

  reset() {
    for (const z of this.zones) {
      z.uses = 0;
      z.lastUse = -Infinity;
    }
    for (const m of this.mgrs.values()) m.reset();
    this.stats = { picks: 0, zoneRays: 0, noSafeZone: 0 };
  }

  noteDeath(pos: THREE.Vector3, now: number) {
    for (const m of this.mgrs.values()) m.noteDeath(pos, now);
  }

  /** Is a zone safe now, and how far its nearest hostile is (rays spent counted). */
  zoneSafety(z: DeployZone, hostiles: readonly SpawnUnit[]) {
    const S = this.S;
    let near = Infinity, safe = true;
    _chest.set(z.centre.x, z.centre.y + 1.2, z.centre.z);
    for (const h of hostiles) {
      const d = h.pos.distanceTo(z.centre);
      near = Math.min(near, d);
      if (d < z.r + S.hardMin) safe = false;
    }
    if (safe)
      for (const h of hostiles) {
        if (h.pos.distanceTo(z.centre) > S.sight) continue;
        this.stats.zoneRays++;
        _eye.set(h.pos.x, h.pos.y + 1.6, h.pos.z);
        if (this.los(_eye, _chest)) {
          safe = false;
          break;
        }
      }
    return { safe, near };
  }

  /** The zone a respawn of `team` goes to now (see the header). */
  pickZone(team: TeamId, hostiles: readonly SpawnUnit[], allies: readonly SpawnUnit[] = []): { zone: DeployZone; safe: boolean } {
    const own = this.openOf(team);
    const rated = own.map((z) => ({ z, ...this.zoneSafety(z, hostiles), f: 0 }));
    if (this.fireteam) {
      const S = this.S;
      const least = Math.min(...own.map((z) => z.uses));
      for (const r of rated) {
        let n = 0;
        for (const a of allies) if (Math.hypot(a.pos.x - r.z.centre.x, a.pos.z - r.z.centre.z) < S.densityR) n++;
        r.f = least - r.z.uses + fireteamScore(n, S.zoneTeam, S.zoneCrowd);
      }
    }
    const safe = rated.filter((r) => r.safe).sort((a, b) => (this.fireteam ? b.f - a.f : a.z.uses - b.z.uses) || a.z.lastUse - b.z.lastUse || this.rand() - 0.5);
    if (safe.length) return { zone: safe[0].z, safe: true };
    this.stats.noSafeZone++;
    return { zone: rated.reduce((a, b) => (b.near > a.near ? b : a)).z, safe: false };
  }

  /** A respawn: the zone, then the spot in it (the zone's own scorer). */
  pick(team: TeamId, hostiles: readonly SpawnUnit[], allies: readonly SpawnUnit[], now: number, occupied: (p: THREE.Vector3) => boolean = () => false, prefer?: DeployZone): ZonePick {
    // 44.0: the fronts' zone (the lane the respawn is sent to) when it is safe; else the scored pick.
    const pz = prefer && (!this.active || this.active(prefer)) && this.zoneSafety(prefer, hostiles).safe ? { zone: prefer, safe: true } : null;
    const { zone, safe } = pz ?? this.pickZone(team, hostiles, allies);
    zone.uses++;
    zone.lastUse = now;
    this.stats.picks++;
    const m = this.mgrs.get(zone)!;
    m.fireteam = this.fireteam;
    const p = m.pick(team, hostiles, allies, now, occupied);
    return { ...p, zone, unsafeZone: !safe };
  }

  /** A free spot in a zone (its points in turn, each point's slots). */
  slotIn(zone: DeployZone, i: number, occupied: (p: THREE.Vector3) => boolean) {
    const m = this.mgrs.get(zone)!;
    for (let k = 0; k < zone.points.length; k++) {
      const pad = zone.points[(i + k) % zone.points.length];
      const at = m.slot(pad, occupied);
      if (!occupied(at)) return { at, yaw: pad.yaw };
    }
    return { at: zone.centre.clone(), yaw: zone.points[0]?.yaw ?? 0 };
  }

  /**
   * The match's first spawn: each team's members in squads of two, dealt round-robin over its zones
   * (member i to zone ⌊i / 2⌋ mod n).
   */
  opening(members: Record<TeamId, number>): Record<TeamId, DeployZone[]> {
    const out: Record<TeamId, DeployZone[]> = { alpha: [], omega: [] };
    for (const t of ['alpha', 'omega'] as const) {
      const own = this.openOf(t);
      for (let i = 0; i < members[t]; i++) {
        const z = own[Math.floor(i / 2) % own.length];
        z.uses++;
        out[t].push(z);
      }
    }
    return out;
  }
}

/**
 * A team's zones from their ALPHA-half definitions (listed A, B, C from ALPHA's left): ALPHA's as given,
 * OMEGA's mirrored across z = 0 or rotated 180° (the map's symmetry), lettered from its own left; each
 * zone's points from `pointsFor` (validated by the level).
 */
export function deployZones(
  half: readonly { id: ZoneId; x: number; y: number; z: number; r: number; yaw: number }[],
  symmetry: 'mirror' | 'rotate',
  pointsFor: (c: THREE.Vector3, r: number, yaw: number) => THREE.Vector3[],
): DeployZone[] {
  const out: DeployZone[] = [];
  let id = 0;
  for (const team of ['alpha', 'omega'] as const) {
    for (const h of half) {
      const o = team === 'alpha';
      const x = o || symmetry === 'mirror' ? h.x : -h.x, z = o ? h.z : -h.z;
      const yaw = o ? h.yaw : symmetry === 'mirror' ? Math.PI - h.yaw : h.yaw + Math.PI;
      const centre = new THREE.Vector3(x, h.y, z);
      const points = pointsFor(centre, h.r, yaw).map((p) => ({ id: id++, pos: p, yaw, side: team }));
      // A is each team's own left as it faces the enemy. A rotation keeps that; a mirror swaps left and
      // right, so OMEGA's letters run the other way (its A is the mirror of ALPHA's last).
      const letter = o || symmetry === 'rotate' ? h.id : (['A', 'B', 'C'] as const)[half.length - 1 - half.indexOf(h)];
      out.push({ id: letter, team, centre, r: h.r, points, uses: 0, lastUse: -Infinity });
    }
  }
  return out;
}
