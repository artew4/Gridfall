import * as THREE from 'three';
import type { Game } from '../core/Game';

/*
  33.0, how much the undergrowth blocks sight (DEV). Plants are soft: they never stop a ray, so the
  collision world can't answer this. Every plant instance is read back from its InstancedMesh (where it
  stands, its footprint and its top, from the kind's geometry bounds × the instance's scale), hashed into
  2 m cells; then `n` sightlines between ground nav nodes 8–40 m apart that nothing solid blocks are
  marched in 0.4 m steps. A line is blocked where it passes within a plant's footprint (60% of its
  radius: leaves, not the hull) below that plant's top. Standing: eye 1.6 m to chest 1.3 m; crouched:
  eye 1.0 m to chest 0.8 m. Also the instance counts, the share of plants topping each height, and the
  triangles drawn per kind (the overdraw that matters for opaque instancing).
*/

interface Plant {
  x: number;
  z: number;
  r: number;
  top: number;
}

export function foliageSight(game: Game, opts: { n?: number; seed?: number } = {}) {
  const level = game.level as unknown as { foliage?: { group: THREE.Group } };
  if (!level.foliage) return { error: 'no foliage on this level' };
  const n = opts.n ?? 1500;
  let seed = opts.seed ?? 33;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plants: Plant[] = [];
  let vinesLow = 0;
  const terrainAt = (x: number, z: number) => game.col.terrain?.height(x, z) ?? 0;
  const kinds: Record<string, { count: number; tris: number; over1_2: number; over1_6: number; maxTop: number }> = {};
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (const o of level.foliage.group.children) {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) continue;
    const g = mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const r0 = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const k = (kinds[mesh.name] = { count: mesh.count, tris: tris * mesh.count, over1_2: 0, over1_6: 0, maxTop: 0 });
    // The canopy and the crowns hang far over head; the vines are thin: only what stands on the floor.
    const ground = mesh.name !== 'canopy' && mesh.name !== 'crowns' && mesh.name !== 'vines';
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      // Its height over the floor it grows on (an instance stands at its floor point).
      const top = bb.max.y * s.y;
      k.maxTop = Math.max(k.maxTop, top);
      if (top > 1.2) k.over1_2++;
      if (top > 1.6) k.over1_6++;
      // A vine hangs down from its point by its scale: the ones whose end comes below 2 m over the ground.
      if (mesh.name === 'vines' && p.y - s.y - terrainAt(p.x, p.z) < 2) vinesLow++;
      if (ground) plants.push({ x: p.x, z: p.z, r: r0 * Math.max(s.x, s.z) * 0.6, top: p.y + top });
    }
  }
  const cell = 2;
  const grid = new Map<string, Plant[]>();
  for (const pl of plants) {
    const key = `${Math.floor(pl.x / cell)},${Math.floor(pl.z / cell)}`;
    let l = grid.get(key);
    if (!l) grid.set(key, (l = []));
    l.push(pl);
  }
  const blockedAt = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = cx - 1; a <= cx + 1; a++)
      for (let b = cz - 1; b <= cz + 1; b++) {
        const l = grid.get(`${a},${b}`);
        if (!l) continue;
        for (const pl of l) if (y < pl.top && (pl.x - x) ** 2 + (pl.z - z) ** 2 < pl.r * pl.r) return true;
      }
    return false;
  };
  // Anywhere a body can stand on the floor (the forest too, not only the graph's paths): random points
  // on the terrain within the map's bounds, clear of solids.
  const bounds = game.level.data.bounds;
  const spots: THREE.Vector3[] = [];
  for (let i = 0; spots.length < 3000 && i < 30000; i++) {
    const x = bounds.min.x + rnd() * (bounds.max.x - bounds.min.x), z = bounds.min.y + rnd() * (bounds.max.y - bounds.min.y);
    const y = terrainAt(x, z);
    if (!game.col.blocked(new THREE.Vector3(x, y, z), 0.35)) spots.push(new THREE.Vector3(x, y, z));
  }
  const res = { standing: 0, crouched: 0, lines: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let tries = 0; res.lines < n && tries < n * 30; tries++) {
    const u = spots[Math.floor(rnd() * spots.length)], w = spots[Math.floor(rnd() * spots.length)];
    const d = Math.hypot(u.x - w.x, u.z - w.z);
    if (d < 8 || d > 40) continue;
    if (!game.col.lineOfSight(a.set(u.x, u.y + 1.6, u.z), b.set(w.x, w.y + 1.3, w.z))) continue;
    res.lines++;
    for (const [eye, chest, key] of [[1.6, 1.3, 'standing'], [1.0, 0.8, 'crouched']] as const) {
      const steps = Math.floor(d / 0.4);
      // The first and last metre are the viewer's and the target's own spot.
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (t * d < 1 || (1 - t) * d < 1) continue;
        const x = u.x + (w.x - u.x) * t, z = u.z + (w.z - u.z) * t;
        const y = u.y + eye + (w.y + chest - u.y - eye) * t;
        if (blockedAt(x, y, z)) {
          res[key]++;
          break;
        }
      }
    }
  }
  const pct = (v: number) => +((100 * v) / Math.max(1, res.lines)).toFixed(1);
  // Where people stand: nav nodes with a plant taller than the eye (1.6 m over its floor) within 2.5 m.
  let blind = 0;
  for (const nd of spots) {
    let hit = false;
    for (let a2 = Math.floor((nd.x - 2.5) / cell); a2 <= Math.floor((nd.x + 2.5) / cell) && !hit; a2++)
      for (let b2 = Math.floor((nd.z - 2.5) / cell); b2 <= Math.floor((nd.z + 2.5) / cell) && !hit; b2++)
        for (const pl of grid.get(`${a2},${b2}`) ?? []) if (pl.top - nd.y > 1.6 && (pl.x - nd.x) ** 2 + (pl.z - nd.z) ** 2 < 6.25) hit = true;
    if (hit) blind++;
  }
  return {
    lines: res.lines,
    blockedStandingPct: pct(res.standing),
    blockedCrouchedPct: pct(res.crouched),
    plants: plants.length,
    spotsWithPlantOverEyePct: +((100 * blind) / Math.max(1, spots.length)).toFixed(1),
    vinesBelow2m: vinesLow,
    kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { ...v, maxTop: +v.maxTop.toFixed(2) }])),
  };
}
