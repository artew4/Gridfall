import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Guard } from '../stealth/Guard';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DT = 1 / 30;

/** Act 1 street patrols plus a walkway patrol: the population the scenarios run against. */
const PATROLS = [
  [v(-7, 0, -10), v(7, 0, -10), v(11, 0, 0), v(4, 0, 2.5), v(-5, 0, 2.5), v(-11, 0, 0)],
  [v(2.2, 0, 42.5)],
  [v(17, 0, -0.6), v(40, 0, -0.6)],
  [v(0, 0, -19), v(1.5, 0, -38), v(-1.5, 0, -50), v(0, 0, -30)],
  [v(-13.5, 4.5, -13.5), v(13.5, 4.5, -13.5), v(13.5, 4.5, -2.1), v(24, 4.5, -2.1)],
];

export interface PursuitResult {
  name: string;
  detectedAt: number | null;
  /** Guards hunting 3 s after detection. */
  firstResponse: number;
  maxHostile: number;
  reinforcements: number;
  /** Seconds (from detection) until search, until unnoticed. */
  toSearch: number | null;
  toUnnoticed: number | null;
  /** Re-identified after hiding. */
  found: boolean;
  /** Closest any guard's goal came to the hiding spot without having seen him since he hid. */
  blindGoalMin: number;
  /** Distance of the last known position from the hiding spot when contact was lost. */
  lkpToHide: number;
  /** Guards still hostile at the end. */
  hostileAtEnd: number;
  notes: string[];
}

/**
 * DEV only. Headless pursuit scenarios: the real Security/Guard/nav code stepped at 30 Hz with a
 * scripted player (exposed in front of a patrol, then escaping along a nav route at sprint speed
 * and hiding). Measures response size, time to search and to calm, whether he was found, and
 * whether any guard ever headed for the hiding spot without information.
 */
export function checkPursuit(game: Game) {
  const sec = game.security;
  const ctx = sec.ctx;
  const nav = ctx.nav;
  const player = game.player;
  const saved = { pos: player.pos.clone(), time: ctx.time, armed: sec.playerArmed, holstered: !game.weapon.visible };

  const near = (x: number, y: number, z: number) => {
    let b = nav.nodes[0], bd = Infinity;
    for (const n of nav.nodes) {
      const d = (n.x - x) ** 2 + (n.y - 1 - y) ** 2 * 4 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        b = n;
      }
    }
    return v(b.x, b.y - 1, b.z);
  };
  const routeTo = (from: THREE.Vector3, to: THREE.Vector3) => {
    const ids = nav.route(v(from.x, from.y + 1, from.z), v(to.x, to.y + 1, to.z));
    return [...ids.map((i) => v(nav.nodes[i].x, nav.nodes[i].y - 1, nav.nodes[i].z)), to.clone()];
  };

  interface Opts {
    name: string;
    hide: THREE.Vector3;
    /** Seconds exposed after detection before running. */
    linger?: number;
    /** Fire a shot from the hiding spot this many seconds after the search starts. */
    shotInSearch?: number;
    /** After calm, walk back into view holstered (re-detection test). */
    reexpose?: boolean;
    stationOpen?: boolean;
    seconds?: number;
    /** Pick the hiding spot at run time: a street node 9–15 m away, out of sight of where he was seen. */
    nearCorner?: boolean;
  }

  const scenario = (o: Opts): PursuitResult => {
    for (const g of sec.guards) g.dispose(game.scene);
    sec.clear();
    game.setStationOpen(!!o.stationOpen);
    sec.budgetPerEpisode = sec.budget = 2;
    for (const r of PATROLS) sec.spawnPatrol({ route: r.map((p) => p.clone()), post: r.length === 1 });
    let armed = true;
    sec.playerArmed = () => armed;
    const res: PursuitResult = { name: o.name, detectedAt: null, firstResponse: 0, maxHostile: 0, reinforcements: 0, toSearch: null, toUnnoticed: null, found: false, blindGoalMin: Infinity, lkpToHide: 0, hostileAtEnd: 0, notes: [] };
    const G0 = sec.guards[0];
    let t = 0;
    let phase: 'expose' | 'linger' | 'run' | 'hide' | 'reexpose' = 'expose';
    let path: THREE.Vector3[] = [];
    let hiddenAt = -1;
    let searchAt = -1;
    let shot = false;
    const seenSinceHide = new Set<Guard>();
    const end = o.seconds ?? 90;
    player.pos.copy(G0.pos);
    for (; t < end; t += DT) {
      ctx.time += DT;
      // --- scripted player
      if (phase === 'expose') {
        // Stand 10 m in front of the plaza patrol wherever it looks (only on open ground).
        const a = G0.lookYaw;
        const p = v(G0.pos.x + Math.sin(a) * 10, G0.pos.y, G0.pos.z + Math.cos(a) * 10);
        if (Math.round(t / DT) % 15 === 0 && ctx.col.groundHeightAt(p.x, p.z, 0.3, p.y + 1) > p.y - 0.1 && ctx.col.lineOfSight(G0.eye.clone(), v(p.x, p.y + 1.1, p.z))) player.pos.copy(p);
        player.vel.set(0, 0, 0);
        if (sec.alert.level === 'pursuit') {
          res.detectedAt = +t.toFixed(2);
          phase = 'linger';
        }
      } else if (phase === 'linger') {
        if (t - res.detectedAt! > (o.linger ?? 2)) {
          phase = 'run';
          if (o.nearCorner) {
            const from = v(player.pos.x, player.pos.y + 1.6, player.pos.z);
            const cand = nav.nodes
              .map((n) => v(n.x, n.y - 1, n.z))
              .filter((n) => Math.abs(n.y - player.pos.y) < 0.5 && n.distanceTo(player.pos) > 9 && n.distanceTo(player.pos) < 15)
              .filter((n) => !ctx.col.lineOfSight(from, v(n.x, n.y + 1.1, n.z)) && sec.guards.every((g) => !ctx.col.lineOfSight(g.eye.clone(), v(n.x, n.y + 1.1, n.z))));
            if (cand.length) o.hide = cand[0];
            res.notes.push(`corner spot ${o.hide.toArray().map((x) => x.toFixed(0)).join(',')}`);
          }
          path = routeTo(player.pos, o.hide);
          armed = false;
        }
      } else if (phase === 'run') {
        const sp = 6.4 * DT;
        const tgt = path[0];
        const d = tgt.clone().sub(player.pos);
        if (d.length() <= sp) {
          player.pos.copy(tgt);
          path.shift();
          if (!path.length) {
            phase = 'hide';
            hiddenAt = t;
            player.vel.set(0, 0, 0);
            const k = sec.alert.lastKnown!;
            res.lkpToHide = +v(k.x, k.y, k.z).distanceTo(o.hide).toFixed(1);
          }
        } else {
          d.setLength(sp);
          player.pos.add(d);
          player.vel.copy(d).divideScalar(DT);
        }
      } else if (phase === 'hide' && o.reexpose && res.toUnnoticed !== null && t - res.detectedAt! - res.toUnnoticed > 5) {
        phase = 'reexpose';
        res.notes.push(`re-exposed holstered at t=${t.toFixed(1)}`);
      }
      if (phase === 'reexpose') {
        const a = G0.lookYaw;
        const p = v(G0.pos.x + Math.sin(a) * 12, G0.pos.y, G0.pos.z + Math.cos(a) * 12);
        if (Math.round(t / DT) % 15 === 0 && ctx.col.groundHeightAt(p.x, p.z, 0.3, p.y + 1) > p.y - 0.1 && ctx.col.lineOfSight(G0.eye.clone(), v(p.x, p.y + 1.1, p.z))) player.pos.copy(p);
      }
      // --- shot during the search
      if (o.shotInSearch !== undefined && searchAt >= 0 && !shot && t - searchAt > o.shotInSearch) {
        shot = true;
        sec.gunshot(v(player.pos.x, player.pos.y + 1.4, player.pos.z), true);
        res.notes.push(`shot fired from hiding at t=${t.toFixed(1)} (${sec.alert.level})`);
      }
      // --- simulate
      sec.update(DT);
      // --- measure
      const hostile = sec.guards.filter((g) => g.alive && g.hostile).length;
      res.maxHostile = Math.max(res.maxHostile, hostile);
      if (res.detectedAt !== null && Math.abs(t - res.detectedAt - 3) < DT / 2) res.firstResponse = hostile;
      if (sec.alert.level === 'search' && searchAt < 0) {
        searchAt = t;
        res.toSearch = +(t - res.detectedAt!).toFixed(1);
      }
      if (res.toSearch !== null && sec.alert.level === 'unnoticed' && res.toUnnoticed === null) res.toUnnoticed = +(t - res.detectedAt!).toFixed(1);
      if (phase === 'hide' || phase === 'reexpose') {
        for (const g of sec.guards) {
          if (!g.alive) continue;
          if (g.sees) seenSinceHide.add(g);
          if (phase === 'hide' && g.sees && g.suspicion >= 1 && !res.found) {
            res.found = true;
            res.notes.push(`found at t=${t.toFixed(1)} by a guard in ${g.gstate} ${g.pos.distanceTo(o.hide).toFixed(1)} m away`);
          }
          if (!seenSinceHide.has(g) && g.hostile && g.gstate !== 'search') {
            const gd = g.goal.distanceTo(o.hide);
            if (gd < 2 && res.blindGoalMin >= 2)
              res.notes.push(`goal ${gd.toFixed(1)} m from hide: ${g.gstate}, own sighting ${(ctx.time - g.lastSeenT).toFixed(1)} s ago, hidden for ${(t - hiddenAt).toFixed(1)} s, radio ${g.radio ? (ctx.time - g.radio.t).toFixed(1) + ' s ago' : 'none'}, alert contact ${(ctx.time - sec.alert.contactT).toFixed(1)} s ago`);
            res.blindGoalMin = Math.min(res.blindGoalMin, gd);
          }
          if (!seenSinceHide.has(g) && g.gstate === 'search') for (const sp of g.searchPts.slice(0, 1)) res.blindGoalMin = Math.min(res.blindGoalMin, sp.distanceTo(o.hide));
        }
      }
      if (phase === 'reexpose' && sec.alert.level === 'pursuit') {
        res.notes.push(`re-identified ${(t - hiddenAt).toFixed(1)} s after hiding began`);
        break;
      }
      if (res.toUnnoticed !== null && !o.reexpose && t - res.detectedAt! - res.toUnnoticed > 3) break;
    }
    res.blindGoalMin = +res.blindGoalMin.toFixed(1);
    res.reinforcements = sec.stats.reinforcements;
    res.hostileAtEnd = sec.guards.filter((g) => g.alive && g.hostile).length;
    return res;
  };

  const results = [
    scenario({ name: 'escape to the Sky Garden roof', hide: near(30, 8.5, 9) }),
    scenario({ name: 'escape down the back alley (street level, far)', hide: near(-22.5, 0, 18) }),
    scenario({ name: 'hide just around a corner (9–15 m, out of sight)', hide: near(-13, 0, -4), linger: 0.5, nearCorner: true }),
    scenario({ name: 'escape into the metro', hide: near(-20, -6, 31), stationOpen: true }),
    scenario({ name: 'shot fired from hiding during the search', hide: near(30, 8.5, 9), shotInSearch: 4 }),
    scenario({ name: 'escape, then walk back into view holstered', hide: near(30, 8.5, 9), reexpose: true, seconds: 120 }),
  ];

  // Restore the live game.
  for (const g of sec.guards) g.dispose(game.scene);
  sec.clear();
  sec.playerArmed = saved.armed;
  player.pos.copy(saved.pos);
  ctx.time = saved.time;
  return results;
}
