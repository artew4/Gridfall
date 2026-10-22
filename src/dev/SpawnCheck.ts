import * as THREE from 'three';
import type { Game } from '../core/Game';

/*
  27.0 (DEV), placing and checking spawn pads.

    __dev.spawnPads({ n: 13 })      proposals for the loaded map (to copy into its Layout file)
    __dev.spawnPadReport()          the map's pads: exposure, the pads each sees, nearest pad, reach
    __dev.spawnPadPlan(px)          a top-down plan (a PNG data URL): colliders by height, the nav,
                                    the pads (ALPHA side cyan, OMEGA orange, neutral white) and every
                                    pad-to-pad sightline in red

  A proposal: nav nodes with room for a pad (nothing solid within 1.7 m, 2 m up), each scored by its
  exposure (of 16 directions at eye height, how many run 25 m without a hit: an open square scores
  high, a sheltered corner low). Farthest-point sampling from a random first, each next the node
  maximising (distance to the nearest pad taken) × (1.25 − 0.5 × exposure); then 8 rounds of Lloyd
  relaxation (each pad to the candidate nearest the centre of the nodes closest to it, 6 m of distance
  per unit of exposure: an even cover, not the rim). It faces its longest free direction.
*/

const EYE = 1.6;

function exposure(game: Game, p: THREE.Vector3, reach = 25) {
  const o = new THREE.Vector3(p.x, p.y + EYE, p.z);
  let open = 0, bestA = 0, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const hit = game.col.raycast(o, dir, 60);
    const d = hit ? hit.dist : 60;
    if (d >= reach) open++;
    if (d > bestD) {
      bestD = d;
      bestA = a;
    }
  }
  return { exp: open / 16, yaw: bestA };
}

function navNodes(game: Game) {
  return game.nav.nodes;
}

export function spawnPads(game: Game, opts: { n?: number; clear?: number; seed?: number; keep?: number[][]; zMin?: number } = {}) {
  const n = opts.n ?? 13;
  const clear = opts.clear ?? 1.7;
  // The floor under each node (nav nodes sit at body height), with room for a pad on it.
  const cands = navNodes(game)
    .filter((p) => p.z >= (opts.zMin ?? -Infinity))
    // In the contested map (a lane by the map's own laneOf), not behind the yards.
    .filter((p) => game.level.data.tdm?.laneOf?.(p.x, p.y, p.z) != null)
    .map((p) => new THREE.Vector3(p.x, game.col.groundHeightAt(p.x, p.z, 0.3, p.y), p.z))
    .filter((p) => p.y > -50 && !game.col.blocked(new THREE.Vector3(p.x, p.y + 0.05, p.z), clear, 2))
    .map((p) => ({ p, ...exposure(game, p) }));
  let r = opts.seed ?? 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const taken: typeof cands = [];
  for (const k of opts.keep ?? []) {
    const p = new THREE.Vector3(k[0], game.col.groundHeightAt(k[0], k[2], 0.3, k[1] + 1), k[2]);
    taken.push({ p, ...exposure(game, p) });
  }
  if (!taken.length && cands.length) taken.push(cands[Math.floor(rnd() * cands.length)]);
  while (taken.length < n) {
    let best: (typeof cands)[number] | null = null, bs = -1;
    for (const c of cands) {
      // Height counts double: a pad on the mezzanine over another on the floor is a different place.
      const d = Math.min(...taken.map((t) => Math.hypot(t.p.x - c.p.x, (t.p.y - c.p.y) * 2, t.p.z - c.p.z)));
      const s = d * (1.25 - 0.5 * c.exp);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    if (!best) break;
    taken.push(best);
  }
  // Lloyd relaxation: each pad (but the kept ones) moves to the candidate nearest its cluster's centre,
  // sheltered ones first (6 m of distance per unit of exposure): an even cover of the map, not its rim.
  const fixed = (opts.keep ?? []).length;
  for (let it = 0; it < 8; it++) {
    const sum = taken.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
    for (const c of cands) {
      let bi = 0, bd = Infinity;
      taken.forEach((t, i) => {
        const d = Math.hypot(t.p.x - c.p.x, (t.p.y - c.p.y) * 2, t.p.z - c.p.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const m = sum[bi];
      m.x += c.p.x;
      m.y += c.p.y;
      m.z += c.p.z;
      m.n++;
    }
    for (let i = fixed; i < taken.length; i++) {
      const m = sum[i];
      if (!m.n) continue;
      const cx = m.x / m.n, cy = m.y / m.n, cz = m.z / m.n;
      let best = taken[i], bs = Infinity;
      for (const c of cands) {
        const s = Math.hypot(c.p.x - cx, (c.p.y - cy) * 2, c.p.z - cz) + 6 * c.exp;
        if (s < bs) {
          bs = s;
          best = c;
        }
      }
      taken[i] = best;
    }
  }
  return taken.map((t) => [+t.p.x.toFixed(1), +t.p.y.toFixed(2), +t.p.z.toFixed(1), +t.yaw.toFixed(2), +t.exp.toFixed(2)]);
}

export function spawnPadReport(game: Game) {
  const pads = game.tdm.spawnPadList();
  const eye = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y + EYE, p.z);
  const nav = game.nav;
  const home = nav.nearestVisible(eye(pads[0]?.pos ?? new THREE.Vector3()));
  const reach = home >= 0 ? nav.reachable(home, true) : new Set<number>();
  return pads.map((a, i) => {
    const sees = pads.filter((b, j) => j !== i && game.col.lineOfSight(eye(a.pos), eye(b.pos))).map((b) => b.id);
    const nearest = Math.min(...pads.filter((_, j) => j !== i).map((b) => b.pos.distanceTo(a.pos)));
    const ni = nav.nearestVisible(eye(a.pos));
    return {
      id: a.id,
      at: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1), +a.pos.z.toFixed(1)],
      side: a.side ?? '-',
      exposure: exposure(game, a.pos).exp,
      sees: sees.join(','),
      nearest: +nearest.toFixed(1),
      blocked: game.col.blocked(new THREE.Vector3(a.pos.x, a.pos.y + 0.05, a.pos.z), 0.9, 1.8),
      reachable: ni >= 0 && reach.has(ni),
    };
  });
}

export function spawnPadPlan(game: Game, px = 900, extra: number[][] = []) {
  const b = game.level.data.bounds;
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
  const k = px / Math.max(w, h);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k);
  cv.height = Math.ceil(h * k);
  const c = cv.getContext('2d')!;
  // +z (ALPHA's end on every map) at the bottom, as the minimap reads.
  const X = (x: number) => (x - b.min.x) * k, Z = (z: number) => (z - b.min.y) * k;
  c.fillStyle = '#101418';
  c.fillRect(0, 0, cv.width, cv.height);
  for (const col of game.col.colliders) {
    if (!col.solid || col.max.y < 0.3) continue;
    const top = col.max.y;
    const g = Math.min(230, 60 + top * 18);
    c.fillStyle = `rgb(${g},${g},${g})`;
    c.globalAlpha = 0.55;
    c.fillRect(X(col.min.x), Z(col.min.z), (col.max.x - col.min.x) * k, (col.max.z - col.min.z) * k);
  }
  c.globalAlpha = 1;
  c.fillStyle = '#3a6';
  for (const p of game.nav.nodes) c.fillRect(X(p.x) - 1, Z(p.z) - 1, 2, 2);
  const pads = game.tdm.spawnPadList();
  const eye = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y + EYE, p.z);
  c.strokeStyle = 'rgba(255,40,40,0.7)';
  c.lineWidth = 1.5;
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
    if (!game.col.lineOfSight(eye(pads[i].pos), eye(pads[j].pos))) continue;
    c.beginPath();
    c.moveTo(X(pads[i].pos.x), Z(pads[i].pos.z));
    c.lineTo(X(pads[j].pos.x), Z(pads[j].pos.z));
    c.stroke();
  }
  const dot = (x: number, z: number, y: number, label: string, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(X(x), Z(z), 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#000';
    c.font = 'bold 10px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, X(x), Z(z) + 3.5);
    if (y > 0.5) {
      c.fillStyle = '#ff0';
      c.fillText(`${y.toFixed(0)}m`, X(x), Z(z) - 9);
    }
  };
  for (const p of pads) dot(p.pos.x, p.pos.z, p.pos.y, String(p.id), p.side === 'alpha' ? '#2ee8ff' : p.side === 'omega' ? '#ff8a2a' : '#fff');
  extra.forEach((e, i) => dot(e[0], e[2], e[1], 'p' + i, '#c6f'));
  return cv.toDataURL('image/png');
}
