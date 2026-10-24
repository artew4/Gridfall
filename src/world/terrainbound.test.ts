import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld, type Terrain } from './Collision';
import { DESERT_TERRAIN } from '../levels/desert/Terrain';
import { CRASH_TERRAIN } from '../levels/crashsite/CrashLayout';
import { FAVELA_TERRAIN } from '../levels/favelas/FavelaLayout';
import { mulberry32 } from '../core/math';

/** 6.0–51.0's terrain march (every step's exact height), the reference. */
function reference(t: Terrain, o: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
  const above = (d: number) => o.y + dir.y * d - t.height(o.x + dir.x * d, o.z + dir.z * d);
  if (above(0) < 0) return Infinity;
  let s0 = 0;
  if (o.y > t.maxHeight) {
    if (dir.y >= -1e-6) return Infinity;
    s0 = (o.y - t.maxHeight) / -dir.y;
    if (s0 >= maxDist) return Infinity;
  }
  let prev = s0;
  for (let d = s0 + 0.75; ; d += 0.75) {
    const cur = Math.min(d, maxDist);
    if (above(cur) < 0) {
      let lo = prev, hi = cur;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) < 0) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    if (cur >= maxDist) return Infinity;
    prev = cur;
  }
}

describe('52.0: the terrain march over its bound', () => {
  it('finds the same first crossing as the exact march, on every terrain with steep or cut ground', () => {
    const rand = mulberry32(52);
    for (const [name, t] of [['desert', DESERT_TERRAIN], ['crash', CRASH_TERRAIN], ['favelas', FAVELA_TERRAIN]] as const) {
      const col = new CollisionWorld();
      col.terrain = t;
      let hits = 0;
      for (let i = 0; i < 1000; i++) {
        const o = new THREE.Vector3((rand() - 0.5) * 160, 0, (rand() - 0.5) * 160);
        o.y = t.height(o.x, o.z) + 0.2 + rand() * 6;
        const dir = new THREE.Vector3(rand() - 0.5, (rand() - 0.6) * 0.3, rand() - 0.5).normalize();
        const max = 5 + rand() * 90;
        const want = reference(t, o, dir, max);
        const hit = col.raycast(o, dir, max);
        const got = hit ? hit.dist : Infinity;
        if (want < Infinity) hits++;
        expect(got, `${name} ray ${i}`).toBe(want);
      }
      expect(hits, name).toBeGreaterThan(50);
    }
  });
});
