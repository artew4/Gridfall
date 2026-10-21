import * as THREE from 'three';
import { stairWallFlush, stairWallOverlaps } from '../world/StairFit';
import type { Game } from '../core/Game';
import type { Collider } from '../world/Collision';
import { StaticBuilder, type VisualPiece } from '../world/Builder';

/** Player body used for every standability test (same as Player.ts / resolveCircle defaults). */
const R = 0.35;
/** Standing body height; `checkWorld({ bodyHeight })` scans with another (11.0: crouched, 1.2). */
const STAND_H = 1.8;
/** Highest ledge reachable by walking (ramps allow 0.5) and by jumping (apex ~0.77 m + step 0.3). */
const WALK_UP = 0.5;
const JUMP_UP = 1.0;
/** How far outside the intended extent the scan looks for escapes. */
const MARGIN = 12;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Node {
  i: number;
  ix: number;
  iz: number;
  x: number;
  z: number;
  h: number;
}

export interface Cluster {
  kind: string;
  cells: number;
  min: [number, number, number];
  max: [number, number, number];
  zone: string;
  detail?: string;
}

function isOpaqueSolidLooking(m: THREE.Material) {
  const mm = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  if (mm.transparent || mm.blending === THREE.AdditiveBlending || mm.depthWrite === false) return false;
  return true;
}

/**
 * DEV only. Systematic world validation on a 0.5 m grid with the real collision rules:
 *  - floor discovery (ground plane, box tops, ramps, cylinders) and standability (player cylinder);
 *  - reachability flood fill from the story start (walk ≤0.5 m up, jump ≤1.0 m up, any drop);
 *  - escapes (reachable cells beyond the intended extent), track-pit access, traps (reachable cells
 *    from which the start can't be reached again), long falls;
 *  - invisible walls (colliders that stop a reachable step but have no visible surface);
 *  - walk-through visuals (opaque drawn surfaces crossed by a reachable step at body height).
 * Results are clustered into regions with coordinates. Heuristics, not proofs: candidates are for review.
 */
export function checkWorld(game: Game, opts: { cell?: number; stationOpen?: boolean; from?: THREE.Vector3; bodyHeight?: number } = {}) {
  const t0 = performance.now();
  const H = opts.bodyHeight ?? STAND_H;
  const col = game.col;
  const cell = opts.cell ?? 0.5;
  const data = game.level.data;
  const zoneAt = data.zoneAt;
  const b = data.bounds;
  const tokyo = game.setting === 'tokyo';
  const x0 = b.min.x - MARGIN, x1 = b.max.x + MARGIN;
  const z0 = b.min.y - MARGIN, z1 = b.max.y + MARGIN;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  if (tokyo && opts.stationOpen !== false) {
    game.tokyo.setStationOpen(true);
    // Let the shutters finish rolling up (they're animated) so they don't read as open-air walls.
    for (const sh of game.tokyo.district.metro.shutters) sh.update(10);
  }

  // ------------------------------------------------------------------ visuals (static pieces + loose meshes)
  const visuals: VisualPiece[] = [];
  /** Everything drawn that a player would read as "something is there" (glass included). */
  const seenPieces: VisualPiece[] = [];
  for (const p of StaticBuilder.registry ?? []) {
    const mm = p.mat as THREE.MeshBasicMaterial;
    if (mm.blending !== THREE.AdditiveBlending) seenPieces.push(p);
    // Walk-through tests need exact bounds: only boxes (non-indexed: 36 verts) and planes (6).
    if (isOpaqueSolidLooking(p.mat) && (p.verts === 36 || p.verts === 6)) visuals.push(p);
  }
  game.scene.updateMatrixWorld(true);
  game.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.staticMerged || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (!m.visible || !m.geometry) return;
    // Skip dynamic actors (guards, crowd rigs, trains, effects) by ancestry flags.
    for (let a: THREE.Object3D | null = m; a; a = a.parent) if (a.userData.dynamic || a.userData.soft) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat) return;
    const box = new THREE.Box3().setFromObject(m);
    if (box.isEmpty()) return;
    if ((mat as THREE.MeshBasicMaterial).blending !== THREE.AdditiveBlending) seenPieces.push({ box, mat });
    const pa = (m.geometry as THREE.BufferGeometry).attributes.position;
    const exact = m.geometry.type === 'BoxGeometry' || m.geometry.type === 'PlaneGeometry' || (pa && (pa.count === 24 || pa.count === 4));
    if (isOpaqueSolidLooking(mat) && exact) visuals.push({ box, mat });
  });
  const VB = 4;
  const vgrid = new Map<string, VisualPiece[]>();
  for (const p of visuals) {
    for (let gx = Math.floor(p.box.min.x / VB); gx <= Math.floor(p.box.max.x / VB); gx++)
      for (let gz = Math.floor(p.box.min.z / VB); gz <= Math.floor(p.box.max.z / VB); gz++) {
        const k = gx + ',' + gz;
        const l = vgrid.get(k);
        if (l) l.push(p);
        else vgrid.set(k, [p]);
      }
  }
  const visNear = (x: number, z: number) => vgrid.get(Math.floor(x / VB) + ',' + Math.floor(z / VB)) ?? [];
  const sgrid = new Map<string, VisualPiece[]>();
  for (const p of seenPieces) {
    for (let gx = Math.floor(p.box.min.x / VB); gx <= Math.floor(p.box.max.x / VB); gx++)
      for (let gz = Math.floor(p.box.min.z / VB); gz <= Math.floor(p.box.max.z / VB); gz++) {
        const k = gx + ',' + gz;
        const l = sgrid.get(k);
        if (l) l.push(p);
        else sgrid.set(k, [p]);
      }
  }
  const covered = (p: THREE.Vector3, tol: number) => (sgrid.get(Math.floor(p.x / VB) + ',' + Math.floor(p.z / VB)) ?? []).some((q) => p.x > q.box.min.x - tol && p.x < q.box.max.x + tol && p.y > q.box.min.y - tol && p.y < q.box.max.y + tol && p.z > q.box.min.z - tol && p.z < q.box.max.z + tol);

  // ------------------------------------------------------------------ floors and standability
  const floorsAt = (x: number, z: number): number[] => {
    const out: number[] = [];
    if (col.terrain) out.push(col.terrain.height(x, z));
    else if (!col.inHole(x, z)) out.push(0);
    for (const c of col.near(x - 0.01, z - 0.01, x + 0.01, z + 0.01)) {
      if (!c.floor || (!c.solid && c.kind !== 'ramp')) continue;
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
      let top: number;
      if (c.kind === 'ramp') top = col.rampHeight(c, x, z);
      else if (c.kind === 'cyl') {
        if (Math.hypot(x - c.cx!, z - c.cz!) > c.r!) continue;
        top = c.max.y;
      } else top = c.max.y;
      if (!out.some((h) => Math.abs(h - top) < 0.06)) out.push(top);
    }
    return out;
  };
  const nodes: Node[] = [];
  const at = new Map<number, Node[]>();
  const idx = (ix: number, iz: number) => ix * nz + iz;
  const probe = new THREE.Vector3();
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x = x0 + (ix + 0.5) * cell, z = z0 + (iz + 0.5) * cell;
      const list: Node[] = [];
      for (const f of floorsAt(x, z)) {
        // Stand where the player would actually stand (ramps are sampled at the uphill foot edge).
        const h = col.groundHeightAt(x, z, R * 0.6, f + 0.05);
        if (h < f - 0.08 || h > f + 0.6 || list.some((o) => Math.abs(o.h - h) < 0.06)) continue;
        probe.set(x, h, z);
        if (col.blocked(probe, R, H)) continue;
        const n: Node = { i: nodes.length, ix, iz, x, z, h };
        nodes.push(n);
        list.push(n);
      }
      if (list.length) at.set(idx(ix, iz), list);
    }
  }

  // ------------------------------------------------------------------ reachability (forward and back)
  const out: number[][] = nodes.map(() => []);
  const inn: number[][] = nodes.map(() => []);
  const longFalls: Node[] = [];
  for (const n of nodes) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const l = at.get(idx(n.ix + dx, n.iz + dz)) ?? [];
      // Falling lands on the highest floor below (standable or not): you can't drop through a floor.
      const fl = floorsAt(n.x + dx * cell, n.z + dz * cell);
      const landing = Math.max(-Infinity, ...fl.filter((h) => h <= n.h + WALK_UP));
      for (const m of l) {
        const dh = m.h - n.h;
        if (dh < -WALK_UP && Math.abs(m.h - landing) > 0.08) continue;
        // Same-level neighbours only via their own floor; up to a jump; any drop (the player can fall).
        if (dh > JUMP_UP) continue;
        // A drop is taken only if this cell's floor ends here (no floor at our height next door).
        if (dh < -WALK_UP && l.some((o) => Math.abs(o.h - n.h) <= WALK_UP)) continue;
        out[n.i].push(m.i);
        inn[m.i].push(n.i);
        if (dh < -10) longFalls.push(n);
      }
      // A fall carries the body forward: if this edge drops off, the landing may be 1–2 cells out
      // (the cell right below the edge often hugs a wall and isn't standable).
      // Only off a real edge: the adjacent cell has no floor at (or just above) our level.
      if (!l.some((o) => Math.abs(o.h - n.h) <= JUMP_UP) && !fl.some((h) => h > n.h - WALK_UP && h <= n.h + JUMP_UP)) {
        // Nothing solid may stand between the edge and the landing at body height (segment test, so
        // thin walls between cell centres count).
        const clearTo = (k: number) => {
          const x = n.x + dx * k * cell, z = n.z + dz * k * cell;
          return [0.5, 1.2].every((y) => col.lineOfSight(v(n.x, n.h + y, n.z), v(x, n.h + y, z)));
        };
        for (const k of [2, 3]) {
          if (!clearTo(k)) break;
          const l2 = at.get(idx(n.ix + dx * k, n.iz + dz * k));
          const fl2 = floorsAt(n.x + dx * k * cell, n.z + dz * k * cell);
          const land2 = Math.max(-Infinity, ...fl2.filter((h) => h <= n.h + WALK_UP));
          const m2 = l2?.find((o) => Math.abs(o.h - land2) <= 0.08 && o.h < n.h - WALK_UP);
          if (m2) {
            out[n.i].push(m2.i);
            inn[m2.i].push(n.i);
            if (m2.h - n.h < -10) longFalls.push(n);
            break;
          }
        }
      }
    }
  }
  const start = opts.from ?? (tokyo ? v(game.tokyo.district.storyStart.x, 0, game.tokyo.district.storyStart.z) : v(data.start.x, data.start.y ?? 0, data.start.z));
  let s0 = -1;
  let best = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.x - start.x, n.z - start.z) + Math.abs(n.h - start.y) * 4;
    if (d < best) {
      best = d;
      s0 = n.i;
    }
  }
  const bfs = (from: number, edges: number[][]) => {
    const seen = new Uint8Array(nodes.length);
    const q = [from];
    seen[from] = 1;
    while (q.length) {
      const u = q.pop()!;
      for (const w of edges[u]) if (!seen[w]) {
        seen[w] = 1;
        q.push(w);
      }
    }
    return seen;
  };
  const reach = bfs(s0, out);
  const back = bfs(s0, inn);

  // ------------------------------------------------------------------ findings
  const inside = (n: Node) => n.x >= b.min.x && n.x <= b.max.x && n.z >= b.min.y && n.z <= b.max.y;
  const findings: { kind: string; n: Node; detail?: string }[] = [];
  for (const n of nodes) {
    if (!reach[n.i]) continue;
    if (!inside(n)) findings.push({ kind: 'escape: reachable outside the playable extent', n });
    else if (n.h < data.floorMin - 0.5) findings.push({ kind: 'below the lowest floor (track pit) reachable', n });
    else if (!zoneAt(n.x, n.h, n.z) && !game.level.aboard(new THREE.Vector3(n.x, n.h, n.z))) findings.push({ kind: 'outside designed zones: reachable but not part of the level', n });
    else if (!back[n.i]) findings.push({ kind: 'trap: no way back to the start', n });
  }
  for (const n of longFalls) if (reach[n.i]) findings.push({ kind: 'drop > 10 m (fall damage)', n });
  // Where each bad region is entered from good ground: the step a player would take.
  const bad = new Map<number, string>();
  for (const f of findings) if (!f.kind.startsWith('drop')) bad.set(f.n.i, f.kind);
  const entries: { kind: string; from: [number, number, number]; to: [number, number, number]; zone: string }[] = [];
  const seenEntry = new Set<string>();
  for (const [i, kind] of bad) {
    for (const w of inn[i]) {
      if (!reach[w] || bad.get(w) === kind) continue;
      const a = nodes[w], c = nodes[i];
      const key = kind + Math.round(a.x) + ',' + Math.round(a.z) + ',' + Math.round(a.h);
      if (seenEntry.has(key)) continue;
      seenEntry.add(key);
      entries.push({ kind, from: [+a.x.toFixed(2), +a.h.toFixed(2), +a.z.toFixed(2)], to: [+c.x.toFixed(2), +c.h.toFixed(2), +c.z.toFixed(2)], zone: zoneAt(a.x, a.h, a.z)?.name ?? '(no zone)' });
    }
  }

  // Invisible walls: a reachable cell whose neighbour has floor at the same height but is blocked;
  // the blocking colliders are checked for a visible surface on the side facing the player.
  const blockers = new Map<Collider, { n: Node; samples: number; seen: number }>();
  for (const n of nodes) {
    if (!reach[n.i] || !inside(n)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = n.x + dx * cell, z = n.z + dz * cell;
      const l = at.get(idx(n.ix + dx, n.iz + dz));
      if (l && l.some((m) => Math.abs(m.h - n.h) <= WALK_UP)) continue;
      if (!floorsAt(x, z).some((h) => Math.abs(h - n.h) <= 0.08)) continue;
      for (const c of col.near(x - R, z - R, x + R, z + R)) {
        if (!c.solid || c.kind === 'ramp') continue;
        if (c.max.y <= n.h + 0.3 || c.min.y >= n.h + H) continue;
        const cx = Math.max(c.min.x, Math.min(x, c.max.x)), cz = Math.max(c.min.z, Math.min(z, c.max.z));
        if (c.kind !== 'cyl' && Math.hypot(x - cx, z - cz) >= R) continue;
        if (c.kind === 'cyl' && Math.hypot(x - c.cx!, z - c.cz!) >= R + c.r!) continue;
        // The face point towards the player, at knee and chest height.
        let rec = blockers.get(c);
        if (!rec) blockers.set(c, (rec = { n, samples: 0, seen: 0 }));
        for (const y of [n.h + 0.5, n.h + 1.2]) {
          const p = c.kind === 'cyl' ? v(c.cx! + ((n.x - c.cx!) / Math.hypot(n.x - c.cx!, n.z - c.cz!)) * c.r!, y, c.cz! + ((n.z - c.cz!) / Math.hypot(n.x - c.cx!, n.z - c.cz!)) * c.r!) : v(Math.max(c.min.x, Math.min(n.x, c.max.x)), Math.max(c.min.y, Math.min(y, c.max.y)), Math.max(c.min.z, Math.min(n.z, c.max.z)));
          rec.samples++;
          if (covered(p, 0.2)) rec.seen++;
        }
      }
    }
  }
  for (const [c, r] of blockers) {
    if (r.seen / r.samples < 0.5) findings.push({ kind: 'invisible wall: blocks a step, nothing drawn there', n: r.n, detail: `collider ${c.kind} [${c.min.toArray().map((q) => q.toFixed(1))}]→[${c.max.toArray().map((q) => q.toFixed(1))}] ${c.surface} seen ${r.seen}/${r.samples}` });
  }

  /** True if b is reachable from a within `maxSteps` grid steps (bounded BFS). */
  const shortPath = (a: number, bIdx: number, maxSteps: number) => {
    const dist = new Map<number, number>([[a, 0]]);
    const q = [a];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      const du = dist.get(u)!;
      if (u === bIdx) return true;
      if (du >= maxSteps) continue;
      for (const w of out[u]) if (!dist.has(w)) {
        dist.set(w, du + 1);
        q.push(w);
      }
    }
    return false;
  };
  // Narrow invisible blocks: a cell with floor at a reachable neighbour's height, nothing drawn or
  // colliding at its centre (it looks open), not standable (too tight), with reachable ground on
  // both opposite sides — a gap the player sees through but can't pass.
  const looksOpen = (x: number, y: number, z: number) => !visNear(x, z).some((q) => x > q.box.min.x && x < q.box.max.x && z > q.box.min.z && z < q.box.max.z && y > q.box.min.y && y < q.box.max.y);
  for (const n of nodes) {
    if (!reach[n.i] || !inside(n)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const mid = at.get(idx(n.ix + dx, n.iz + dz));
      if (mid && mid.some((m) => Math.abs(m.h - n.h) <= WALK_UP)) continue;
      const x = n.x + dx * cell, z = n.z + dz * cell;
      if (!floorsAt(x, z).some((h) => Math.abs(h - n.h) <= 0.1)) continue;
      const far = at.get(idx(n.ix + 2 * dx, n.iz + 2 * dz));
      if (!far || !far.some((m) => Math.abs(m.h - n.h) <= WALK_UP && reach[m.i])) continue;
      const inSolid = col.near(x, z, x, z).some((c) => c.solid && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z && c.min.y < n.h + 1.2 && c.max.y > n.h + 0.3);
      if (inSolid || !looksOpen(x, n.h + 1.0, z)) continue;
      // Only a real block if the two sides aren't connected by a short walk round (a corner).
      const target = far.find((m) => Math.abs(m.h - n.h) <= WALK_UP && reach[m.i])!;
      if (shortPath(n.i, target.i, 12)) continue;
      findings.push({ kind: 'narrow gap: looks open, too tight to pass', n, detail: `gap cell (${x.toFixed(2)}, ${n.h.toFixed(1)}, ${z.toFixed(2)})` });
    }
  }

  // Walk-through visuals: reachable same-level steps that cross an opaque drawn piece at body height.
  const crossed = new Map<VisualPiece, Node>();
  for (const n of nodes) {
    if (!reach[n.i] || !inside(n)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const l = at.get(idx(n.ix + dx, n.iz + dz));
      const m = l?.find((o) => Math.abs(o.h - n.h) <= WALK_UP && reach[o.i]);
      if (!m) continue;
      for (const y of [n.h + 0.6, n.h + 1.4]) {
        for (const q of visNear((n.x + m.x) / 2, (n.z + m.z) / 2)) {
          const bx = q.box;
          if (y <= bx.min.y || y >= bx.max.y) continue;
          const sx = bx.max.x - bx.min.x, sy = bx.max.y - bx.min.y, sz = bx.max.z - bx.min.z;
          // Ignore small props, tiles, decals and pieces that are clearly overhead or underfoot.
          if (sy < 0.6 || Math.max(sx, sz) < 0.6) continue;
          const lo = dx ? Math.min(n.x, m.x) : Math.min(n.z, m.z), hi = dx ? Math.max(n.x, m.x) : Math.max(n.z, m.z);
          const a0 = dx ? bx.min.x : bx.min.z, a1 = dx ? bx.max.x : bx.max.z;
          const c0 = dx ? bx.min.z : bx.min.x, c1 = dx ? bx.max.z : bx.max.x;
          const cc = dx ? n.z : n.x;
          if (cc <= c0 + 0.02 || cc >= c1 - 0.02) continue;
          // The step crosses a face of the piece (enters it or passes through a thin plane).
          if ((a0 > lo && a0 < hi) || (a1 > lo && a1 < hi) || (a1 - a0 < 0.05 && a0 >= lo && a0 <= hi)) {
            if (!crossed.has(q)) crossed.set(q, n);
          }
        }
      }
    }
  }
  const overRamp = (q: VisualPiece) => col.near(q.box.min.x, q.box.min.z, q.box.max.x, q.box.max.z).some((c) => c.kind === 'ramp' && q.box.min.x < c.max.x && q.box.max.x > c.min.x && q.box.min.z < c.max.z && q.box.max.z > c.min.z);
  for (const [q, n] of crossed) if (!overRamp(q)) findings.push({ kind: 'walk-through visual: opaque surface without collision', n, detail: `visual [${q.box.min.toArray().map((x) => x.toFixed(1))}]→[${q.box.max.toArray().map((x) => x.toFixed(1))}] ${(q.mat as THREE.MeshStandardMaterial).color?.getHexString?.() ?? ''}` });

  // ------------------------------------------------------------------ cluster findings into regions
  const clusters: Cluster[] = [];
  const byKind = new Map<string, { kind: string; n: Node; detail?: string }[]>();
  for (const f of findings) (byKind.get(f.kind) ?? byKind.set(f.kind, []).get(f.kind)!).push(f);
  for (const [kind, list] of byKind) {
    const used = new Set<number>();
    for (let a = 0; a < list.length; a++) {
      if (used.has(a)) continue;
      const group = [a];
      used.add(a);
      for (let gi = 0; gi < group.length; gi++) {
        const p = list[group[gi]].n;
        for (let c2 = 0; c2 < list.length; c2++) {
          if (used.has(c2)) continue;
          const o = list[c2].n;
          if (Math.abs(o.x - p.x) <= cell * 1.5 && Math.abs(o.z - p.z) <= cell * 1.5 && Math.abs(o.h - p.h) < 1.5) {
            used.add(c2);
            group.push(c2);
          }
        }
      }
      const ns = group.map((k) => list[k].n);
      const mn: [number, number, number] = [Math.min(...ns.map((n) => n.x)), Math.min(...ns.map((n) => n.h)), Math.min(...ns.map((n) => n.z))];
      const mx: [number, number, number] = [Math.max(...ns.map((n) => n.x)), Math.max(...ns.map((n) => n.h)), Math.max(...ns.map((n) => n.z))];
      const mid = ns[Math.floor(ns.length / 2)];
      clusters.push({ kind, cells: ns.length, min: mn, max: mx, zone: zoneAt(mid.x, mid.h, mid.z)?.name ?? '(no zone)', detail: list[group[0]].detail });
    }
  }
  // 8.1: stairs a wall still intrudes into at their own heights (steps drawn through the wall).
  const stairHits = stairWallOverlaps(game.col.colliders);
  for (const h of stairHits) {
    const w = h.wall;
    clusters.push({ kind: 'stair in wall: steps drawn through a solid', cells: 1, min: [h.stair.x0, h.yLo, h.stair.z0], max: [h.stair.x1, h.yHi, h.stair.z1], zone: zoneAt((h.stair.x0 + h.stair.x1) / 2, h.yHi, (h.stair.z0 + h.stair.z1) / 2)?.name ?? '(no zone)', detail: `wall [${w.min.toArray().map((q) => q.toFixed(2))}]→[${w.max.toArray().map((q) => q.toFixed(2))}]` });
  }
  // 9.1: stairs flush with a wall beside them (coplanar faces z-fight).
  for (const h of stairWallFlush(game.col.colliders)) {
    const w = h.wall;
    clusters.push({ kind: 'stair flush with wall: coplanar faces', cells: 1, min: [h.stair.x0, 0, h.stair.z0], max: [h.stair.x1, 0, h.stair.z1], zone: zoneAt((h.stair.x0 + h.stair.x1) / 2, 0, (h.stair.z0 + h.stair.z1) / 2)?.name ?? '(no zone)', detail: `gap ${h.gap} m to wall [${w.min.toArray().map((q) => q.toFixed(2))}]→[${w.max.toArray().map((q) => q.toFixed(2))}]` });
  }
  clusters.sort((p, q) => q.cells - p.cells);

  // ------------------------------------------------------------------ coverage per region
  const perZone: Record<string, number> = {};
  let reachable = 0;
  for (const n of nodes) {
    if (!reach[n.i]) continue;
    reachable++;
    const z = zoneAt(n.x, n.h, n.z)?.name ?? '(no zone)';
    perZone[z] = (perZone[z] ?? 0) + 1;
  }
  return {
    ms: Math.round(performance.now() - t0),
    cell,
    sampledCells: nx * nz,
    standableNodes: nodes.length,
    reachableNodes: reachable,
    visuals: visuals.length,
    perZone,
    counts: Object.fromEntries([...[...byKind].map(([k, l]) => [k, l.length] as [string, number]), ...(stairHits.length ? [['stair in wall: steps drawn through a solid', stairHits.length] as [string, number]] : [])]),
    clusters,
    entries,
    /** Every reachable cell (x, floor height, z) for controller stress tests. */
    reachableCells: nodes.filter((n) => reach[n.i]).map((n) => [n.x, n.h, n.z] as [number, number, number]),
  };
}

/**
 * Does the segment a→b (at fixed heights) pass through the inside of a solid box collider? `bodyH`:
 * the body's height now (11.0: a crouched body passes under what a standing one would hit).
 */
function crossesSolid(game: Game, a: THREE.Vector3, b: THREE.Vector3, feetY: number, bodyH = STAND_H) {
  for (const c of game.col.near(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z))) {
    if (!c.solid || c.kind !== 'box' || c.vault) continue;
    // Only real walls at body height (not kerbs you step onto, not ceilings).
    if (c.max.y <= feetY + 0.35 || c.min.y >= feetY + bodyH - 0.2) continue;
    // Segment vs slab, shrunk a hair so grazing a face doesn't count.
    const e = 0.03;
    let t0 = 0, t1 = 1;
    for (const ax of ['x', 'z'] as const) {
      const d = b[ax] - a[ax];
      const lo = c.min[ax] + e, hi = c.max[ax] - e;
      if (hi <= lo) continue; // thinner than 2e: treated by the tunnelling check below
      if (Math.abs(d) < 1e-9) {
        if (a[ax] < lo || a[ax] > hi) { t0 = 2; break; }
      } else {
        let u = (lo - a[ax]) / d, w = (hi - a[ax]) / d;
        if (u > w) [u, w] = [w, u];
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, w);
      }
    }
    if (t0 <= t1) return c;
    // Thin walls: crossing from one side of the slab to the other in one step.
    for (const ax of ['x', 'z'] as const) {
      const other = ax === 'x' ? 'z' : 'x';
      if (c.max[ax] - c.min[ax] > 0.3) continue;
      const mid = (c.min[ax] + c.max[ax]) / 2;
      if ((a[ax] - mid) * (b[ax] - mid) < 0) {
        const t = (mid - a[ax]) / (b[ax] - a[ax]);
        const o = a[other] + (b[other] - a[other]) * t;
        if (o > c.min[other] + e && o < c.max[other] - e) return c;
      }
    }
  }
  return null;
}

/**
 * DEV only. The real player controller (Player.update with the real collision) driven from sampled
 * reachable cells in 8 directions, walking and sprint-jumping, at 20 and 60 FPS steps. A run fails if
 * the body crosses a solid wall, falls into the track pit or below the world, leaves the playable
 * extent, or ends somewhere the world scan says nobody can stand (inside geometry / a void).
 * Failures carry position, velocity, input, frame step and the collider involved.
 *
 * `fps`: the frame-time profiles to run. A number is a fixed rate; 'spiky' alternates 120 FPS frames
 * with hitches (the game clamps any frame to 1/20 s), seeded so failures reproduce.
 */
/**
 * 9.1: the gap between a stair and a wall beside it. For every stair side with a wall within 10 cm
 * (along the stretch the wall covers, above the wall's foot), a body is pressed against the wall
 * over the gap and dropped into it, resolved with the real controller's circle, and must keep a floor
 * within a step of the tread. Reports each gap width seen (STAIR_GAP after the fix; 0 = flush).
 */
export function stairGapProbe(game: Game) {
  const col = game.col;
  const r0 = game.player.radius;
  const ramps = col.colliders.filter((c) => c.kind === 'ramp');
  const walls = col.colliders.filter((c) => c.kind === 'box' && c.solid && c.floor !== false && c.max.y - c.min.y >= 1 && c.max.x - c.min.x >= 0.15 && c.max.z - c.min.z >= 0.15);
  const gaps = new Set<number>();
  const bad: { x: number; z: number; tread: number; floor: number }[] = [];
  let pairs = 0, probes = 0, drops = 0;
  const pos = new THREE.Vector3();
  for (const r of ramps) {
    const along = r.axis === 'x';
    const yLo = Math.min(r.h0!, r.h1!), yHi = Math.max(r.h0!, r.h1!);
    const rl = along ? r.min.x : r.min.z, rh = along ? r.max.x : r.max.z;
    for (const side of ['lo', 'hi'] as const) {
      const face = side === 'lo' ? (along ? r.min.z : r.min.x) : along ? r.max.z : r.max.x;
      for (const c of walls) {
        const a0 = Math.max(rl, along ? c.min.x : c.min.z), a1 = Math.min(rh, along ? c.max.x : c.max.z);
        const yOv = Math.min(yHi, c.max.y) - Math.max(yLo, c.min.y);
        const gap = side === 'lo' ? face - (along ? c.max.z : c.max.x) : (along ? c.min.z : c.min.x) - face;
        if (!(a1 - a0 > 0.02 && yOv > 0.05 && gap > -0.01 && gap < 0.1)) continue;
        pairs++;
        gaps.add(+gap.toFixed(3));
        for (let k = 0; k <= 12; k++) {
          const ra = a0 + ((a1 - a0) * k) / 12;
          const h = r.h0! + ((r.h1! - r.h0!) * (ra - rl)) / (rh - rl);
          if (h < c.min.y) continue;
          for (const off of [0.015, -r0 + 0.02]) {
            const w = side === 'lo' ? face - off : face + off;
            pos.set(along ? ra : w, h, along ? w : ra);
            col.resolveCircle(pos, r0, 1.7, 0.3);
            const floor = col.groundHeightAt(pos.x, pos.z, r0 * 0.6, h + 0.05);
            probes++;
            if (floor >= h - 0.31) continue;
            if (drops++ < 10) bad.push({ x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), tread: +h.toFixed(2), floor: +floor.toFixed(2) });
          }
        }
      }
    }
  }
  return { stairs: ramps.length, wallSides: pairs, gaps: [...gaps].sort(), probes, drops, bad };
}

/**
 * `crouch` (11.0): start from every cell a crouched body reaches (1.2 m), and run two crouch modes:
 * crouch-walk (C held), and crouch then sprint-jump (a tap of C, then Shift and Space after 0.5 s:
 * standing up wherever it is, under low ceilings included).
 */
export function stressController(game: Game, opts: { samples?: number; seconds?: number; fps?: (number | 'spiky')[]; crouch?: boolean } = {}) {
  const t0 = performance.now();
  const world = checkWorld(game, { stationOpen: true, bodyHeight: opts.crouch ? 1.2 : undefined });
  const cells = world.reachableCells;
  const okKey = (x: number, h: number, z: number) => Math.round(x * 2) + ',' + Math.round(z * 2) + ',' + Math.round(h * 2);
  const ok = new Set(cells.map(([x, h, z]) => okKey(x - 0.25, h, z - 0.25)));
  const standableNear = (p: THREE.Vector3) => {
    for (const dx of [-0.5, 0, 0.5]) for (const dz of [-0.5, 0, 0.5]) for (const dh of [-0.5, 0, 0.5]) if (ok.has(okKey(p.x + dx - 0.25, p.y + dh, p.z + dz - 0.25))) return true;
    return false;
  };
  const n = Math.min(opts.samples ?? 500, cells.length);
  const stride = cells.length / n;
  const P = game.player;
  const data = game.level.data;
  const zoneAt = data.zoneAt;
  const b = data.bounds;
  const keys = new Set<string>();
  const inp = { keys, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => keys.has(c) } as unknown as Parameters<typeof P.update>[1];
  const fails: Record<string, unknown>[] = [];
  let runs = 0;
  const saved = { pos: P.pos.clone(), yaw: P.yaw, hp: P.health };
  const prev = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const [x, h, z] = cells[Math.floor(k * stride)];
    for (let dir = 0; dir < 8; dir++) {
      for (const profile of opts.fps ?? [20, 60]) {
        for (const mode of opts.crouch ? (['crouchWalk', 'crouchThenSprintJump'] as const) : (['walk', 'sprintJump'] as const)) {
          runs++;
          P.reset(x, z, (dir * Math.PI) / 4, h);
          keys.clear();
          keys.add('KeyW');
          if (mode === 'sprintJump') keys.add('ShiftLeft');
          if (mode === 'crouchWalk') keys.add('KeyC');
          const jumps = mode === 'sprintJump' || mode === 'crouchThenSprintJump';
          let fail: Record<string, unknown> | null = null;
          let seed = (k * 8 + dir) * 7919 + 1;
          const nextDt = () => {
            if (profile !== 'spiky') return 1 / profile;
            seed = (seed * 16807) % 2147483647;
            const r = seed / 2147483647;
            return r < 0.12 ? 1 / 20 : r < 0.2 ? 1 / 30 : 1 / 120;
          };
          let dt = nextDt();
          for (let t = 0; t < (opts.seconds ?? 1.2); t += dt, dt = nextDt()) {
            const pressed: string[] = [];
            if (jumps && Math.floor(t / 0.45) !== Math.floor((t - dt) / 0.45)) pressed.push('Space');
            if (mode === 'crouchThenSprintJump') {
              if (t === 0) pressed.push('KeyC');
              if (t >= 0.5) keys.add('ShiftLeft');
            }
            (inp as unknown as { pressed: Set<string> }).pressed = new Set(pressed);
            prev.copy(P.pos);
            P.update(dt, inp, true, t);
            const c = crossesSolid(game, prev, P.pos, Math.min(prev.y, P.pos.y), P.height);
            if (c) fail = { why: 'crossed a solid wall', collider: `[${c.min.toArray().map((q) => q.toFixed(2))}]→[${c.max.toArray().map((q) => q.toFixed(2))}]` };
            else if (P.pos.y < data.floorMin - 0.6) fail = { why: 'fell below the lowest floor (track pit / under the world)' };
            else if (P.pos.x < b.min.x || P.pos.x > b.max.x || P.pos.z < b.min.y || P.pos.z > b.max.y) fail = { why: 'left the playable extent' };
            if (fail) {
              Object.assign(fail, { start: [x, h, z], dir, fps: profile, dt: +dt.toFixed(4), mode, t: +t.toFixed(2), pos: P.pos.toArray().map((q) => +q.toFixed(2)), vel: P.vel.toArray().map((q) => +q.toFixed(2)), onGround: P.onGround, zone: zoneAt(P.pos.x, P.pos.y, P.pos.z)?.name ?? '' });
              break;
            }
          }
          // Ended inside geometry, or standing on nothing (grid aliasing near walls isn't a failure).
          // Two idle frames first: a run can end on the exact frame it lands from a vault, still
          // overlapping the rail it jumped over (by design while airborne); that resolves next frame.
          // 11.0: the landing itself can fall on the first idle frame (a crouch shifts the jump timing).
          if (!fail) {
            keys.clear();
            (inp as unknown as { pressed: Set<string> }).pressed = new Set();
            P.update(1 / 60, inp, true, 99);
            P.update(1 / 60, inp, true, 99);
          }
          if (!fail && P.onGround) {
            const inGeo = game.col.blocked(P.pos, P.radius - 0.02, P.height);
            const floor = game.col.groundHeightAt(P.pos.x, P.pos.z, P.radius * 0.6, P.pos.y);
            if (inGeo || Math.abs(floor - P.pos.y) > 0.05) fail = { why: inGeo ? 'ended inside geometry' : 'standing on nothing', start: [x, h, z], dir, fps: profile, mode, pos: P.pos.toArray().map((q) => +q.toFixed(2)), zone: zoneAt(P.pos.x, P.pos.y, P.pos.z)?.name ?? '', grid: standableNear(P.pos) };
          }
          if (fail) fails.push(fail);
        }
      }
    }
  }
  P.reset(saved.pos.x, saved.pos.z, saved.yaw, saved.pos.y);
  P.health = saved.hp;
  const byWhy: Record<string, number> = {};
  for (const f of fails) byWhy[f.why as string] = (byWhy[f.why as string] ?? 0) + 1;
  return { ms: Math.round(performance.now() - t0), samples: n, runs, failures: fails.length, byWhy, examples: fails.slice(0, 20) };
}
