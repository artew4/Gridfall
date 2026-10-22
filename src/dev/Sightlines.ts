import * as THREE from 'three';
import type { Game } from '../core/Game';

/*
  20.0, sightline audit (DEV): how much of a TDM map can be seen from far away, at eye height.
   - spawnToSpawn: from every walkable spot on ALPHA's side behind `front` (its yard exits and apron)
     to every one on OMEGA's: the share of pairs with a clear line, and the longest clear one.
   - long: random pairs of walkable spots anywhere, `minDist` m or more apart: the share in sight
     (a "sniper gallery" map scores high), by distance band.
  Walkable spots are the nav graph's nodes (body height, so the eye is +0.65 over them). Rays are the
  collision world's line of sight (what blocks rounds and the bots' eyes; the undergrowth doesn't).
*/

const EYE = 0.65;

export function sightlines(game: Game, opts: { front?: number; minDist?: number; pairs?: number; band?: [number, number] } = {}) {
  const front = opts.front ?? 36;
  const minDist = opts.minDist ?? 40;
  const nodes = game.nav.nodes;
  const col = game.col;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const sees = (p: THREE.Vector3, q: THREE.Vector3) => col.lineOfSight(a.set(p.x, p.y + EYE, p.z), b.set(q.x, q.y + EYE, q.z));
  const t0 = performance.now();
  // Spawn side to spawn side.
  const A = nodes.filter((n) => n.z > front), O = nodes.filter((n) => n.z < -front);
  let pairs = 0, clear = 0, longest = 0;
  const lines: [number, number, number, number, number][] = [];
  for (const p of A) for (const q of O) {
    pairs++;
    if (sees(p, q)) {
      clear++;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d > longest) longest = d;
      if (lines.length < 4000) lines.push([+p.x.toFixed(1), +p.z.toFixed(1), +q.x.toFixed(1), +q.z.toFixed(1), +d.toFixed(0)]);
    }
  }
  // Which x-bands carry the spawn-to-spawn lines (the open corridors).
  const bands: Record<string, number> = {};
  for (const [x0, , x1] of lines) {
    const k = String(Math.round((x0 + x1) / 2 / 4) * 4);
    bands[k] = (bands[k] ?? 0) + 1;
  }
  // Long sightlines anywhere.
  let rnd = 12345;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const want = opts.pairs ?? 6000;
  const byBand: Record<string, [number, number]> = { '40-60': [0, 0], '60-80': [0, 0], '80+': [0, 0] };
  for (let i = 0, n = 0; n < want && i < want * 20; i++) {
    const p = nodes[Math.floor(r() * nodes.length)], q = nodes[Math.floor(r() * nodes.length)];
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < minDist) continue;
    n++;
    const k = d < 60 ? '40-60' : d < 80 ? '60-80' : '80+';
    byBand[k][0]++;
    if (sees(p, q)) byBand[k][1]++;
  }
  const pct = ([n, c]: [number, number]) => +((100 * c) / Math.max(1, n)).toFixed(1);
  return {
    ms: Math.round(performance.now() - t0),
    spawnToSpawn: { pairs, clearPct: +((100 * clear) / Math.max(1, pairs)).toFixed(2), clear, longest: +longest.toFixed(0), bands },
    longPct: Object.fromEntries(Object.entries(byBand).map(([k, v]) => [k, pct(v)])),
    longAllPct: pct(Object.values(byBand).reduce<[number, number]>((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0])),
    // 23.0: `band` lists the clear lines whose midpoint x lies in it (else the first 12).
    sample: opts.band ? lines.filter(([x0, , x1]) => (x0 + x1) / 2 >= opts.band![0] && (x0 + x1) / 2 <= opts.band![1]).slice(0, 40) : lines.slice(0, 12),
  };
}
