import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';
import type { Nav } from '../Nav';

/**
 * Cover candidates for a level: the level's authored spots plus spots generated from its colliders
 * — beside the middle of every face and off every corner of each solid, ray-blocking box at least
 * waist high (crates, barriers, vehicles, wall ends), and round every pillar or trunk. Authored spots sit on one side of
 * their obstacle; dynamic cover needs the other sides too, or a player who walks round has nothing
 * to be hidden from. Every spot is free for a gunner's body, on a floor, inside the bounds and on
 * the nav graph. Built once per level load (a few hundred ms of rays at most).
 */
export function buildCoverSpots(col: CollisionWorld, nav: Nav, authored: THREE.Vector3[], bounds: THREE.Box2, opts: { max?: number } = {}) {
  const out: THREE.Vector3[] = authored.map((p) => p.clone());
  const keys = new Set(out.map((p) => key(p)));
  const OFF = 0.62;
  const cand: THREE.Vector3[] = [];
  for (const c of col.colliders) {
    if (!c.solid || !c.ray || c.dynamic) continue;
    if (c.kind === 'cyl') {
      // Pillars, tanks, tree trunks: six spots round it (lean out either side of the trunk).
      const r = c.r!;
      if (r < 0.2 || r > 3 || c.max.y - c.min.y < 1.6) continue;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cand.push(new THREE.Vector3(c.cx! + Math.cos(a) * (r + OFF), c.min.y, c.cz! + Math.sin(a) * (r + OFF)));
      }
      continue;
    }
    if (c.kind !== 'box') continue;
    const h = c.max.y - c.min.y;
    const sx = c.max.x - c.min.x, sz = c.max.z - c.min.z;
    if (h < 0.85 || sx < 0.25 || sz < 0.25) continue;
    // Only things standing on something walkable (not roof parapets' tops, not hanging signs).
    const y = c.min.y;
    const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
    // Faces: middle (short faces) or two points along long ones.
    const along = (a0: number, a1: number) => (a1 - a0 <= 4 ? [(a0 + a1) / 2] : a1 - a0 <= 14 ? [a0 + (a1 - a0) * 0.25, a0 + (a1 - a0) * 0.75] : []);
    for (const x of along(c.min.x, c.max.x)) {
      cand.push(new THREE.Vector3(x, y, c.min.z - OFF), new THREE.Vector3(x, y, c.max.z + OFF));
    }
    for (const z of along(c.min.z, c.max.z)) {
      cand.push(new THREE.Vector3(c.min.x - OFF, y, z), new THREE.Vector3(c.max.x + OFF, y, z));
    }
    // Corners (lean spots), set back along both faces.
    if (h >= 1.6) {
      for (const [x, z] of [[c.min.x, c.min.z], [c.max.x, c.min.z], [c.min.x, c.max.z], [c.max.x, c.max.z]]) {
        const dx = x < cx ? -1 : 1, dz = z < cz ? -1 : 1;
        cand.push(new THREE.Vector3(x - dx * 0.35, y, z + dz * OFF), new THREE.Vector3(x + dx * OFF, y, z - dz * 0.35));
      }
    }
  }
  const b = bounds;
  for (const p of cand) {
    if (p.x < b.min.x + 1.5 || p.x > b.max.x - 1.5 || p.z < b.min.y + 1.5 || p.z > b.max.y - 1.5) continue;
    const k = key(p);
    if (keys.has(k)) continue;
    const g = col.groundHeightAt(p.x, p.z, 0.3, p.y + 0.4);
    if (Math.abs(g - p.y) > 0.25) continue;
    p.y = g;
    if (col.blocked(p, 0.5)) continue;
    keys.add(k);
    out.push(p);
  }
  // On the graph: some node in sight within a short walk (cheap filter before the ray test).
  const reach = out.filter((p, i) => {
    if (i < authored.length) return true;
    const q = new THREE.Vector3(p.x, p.y + 1, p.z);
    let near = false;
    for (const n of nav.nodes) {
      if (Math.abs(n.y - q.y) < 1.2 && Math.hypot(n.x - q.x, n.z - q.z) < 14) {
        near = true;
        break;
      }
    }
    return near && nav.nearestVisible(q) >= 0;
  });
  const max = opts.max ?? 900;
  if (reach.length <= max) return reach;
  // Too many: keep the authored ones and an even subset of the rest.
  const rest = reach.slice(authored.length);
  const step = rest.length / (max - authored.length);
  return [...reach.slice(0, authored.length), ...Array.from({ length: max - authored.length }, (_, i) => rest[Math.floor(i * step)])];
}

/** 1.2 m grid key (de-duplication). */
function key(p: THREE.Vector3) {
  return `${Math.round(p.x / 1.2)},${Math.round(p.y)},${Math.round(p.z / 1.2)}`;
}
