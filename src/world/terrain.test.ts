import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld, type Terrain } from './Collision';
import { Player } from '../player/Player';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const audio = new Proxy({}, { get: () => () => {} }) as unknown as AudioEngine;

/** Rolling dunes: up to ±2 m, slopes up to about 20°. */
const dunes: Terrain = {
  height: (x, z) => Math.sin(x * 0.12) * 1.4 + Math.cos(z * 0.09) * 0.6,
  maxHeight: 2,
  surface: 'sand',
};

function world() {
  const w = new CollisionWorld();
  w.terrain = dunes;
  return w;
}

function walk(p: Player, keys: string[], seconds: number, dt: number, each?: () => void) {
  const set = new Set(keys);
  const inp = { keys: set, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => set.has(c) } as unknown as Input;
  for (let t = 0; t < seconds; t += dt) {
    p.update(dt, inp, true, t);
    each?.();
  }
}

describe('terrain heightfield (3.4)', () => {
  it('the controller walks over dunes on the surface at 20, 60 and 120 FPS (never under, never floating)', () => {
    for (const dt of [1 / 20, 1 / 60, 1 / 120]) {
      const w = world();
      const p = new Player(w, audio);
      p.reset(0, 0, -Math.PI / 2, dunes.height(0, 0)); // heading +x, across the dunes
      let worst = 0;
      walk(p, ['KeyW', 'ShiftLeft'], 6, dt, () => {
        if (p.onGround) worst = Math.max(worst, Math.abs(p.pos.y - w.groundHeightAt(p.pos.x, p.pos.z, p.radius * 0.6, p.pos.y)));
        expect(p.pos.y).toBeGreaterThanOrEqual(dunes.height(p.pos.x, p.pos.z) - 0.05);
      });
      expect(p.pos.x).toBeGreaterThan(30); // made real progress over several crests
      expect(worst).toBeLessThan(0.01);
    }
  });

  it('a jump lands back on the terrain', () => {
    const w = world();
    const p = new Player(w, audio);
    p.reset(5, 3, 0, dunes.height(5, 3));
    p.vel.y = 4.8;
    p.onGround = false;
    walk(p, [], 1.5, 1 / 60);
    expect(p.onGround).toBe(true);
    expect(p.pos.y).toBeCloseTo(w.groundHeightAt(p.pos.x, p.pos.z, p.radius * 0.6, p.pos.y), 3);
  });

  it('rays hit the terrain with an upward normal, and a dune crest blocks line of sight', () => {
    const w = world();
    const hit = w.raycast(new THREE.Vector3(3, 10, 2), new THREE.Vector3(0, -1, 0), 50);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(dunes.height(3, 2), 2);
    expect(hit!.surface).toBe('sand');
    expect(hit!.normal.y).toBeGreaterThan(0.8);
    // Crest at x = 13.1 (sin peak); troughs either side at x = -13.1 and 39.3.
    const a = new THREE.Vector3(-13.1, dunes.height(-13.1, 0) + 0.5, 0);
    const b = new THREE.Vector3(39.3, dunes.height(39.3, 0) + 0.5, 0);
    expect(w.lineOfSight(a, b)).toBe(false);
    expect(w.lineOfSight(a.clone().setY(5), b.clone().setY(5))).toBe(true);
  });

  it('without a terrain the flat street plane behaves exactly as before', () => {
    const w = new CollisionWorld();
    expect(w.groundHeightAt(1, 1, 0.2, 0.5)).toBe(0);
    expect(w.groundHeightAt(1, 1, 0.2, -3)).toBe(-Infinity);
    const hit = w.raycast(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0), 10);
    expect(hit!.dist).toBeCloseTo(2, 5);
    expect(hit!.surface).toBe('concrete');
  });
});
