import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from './Collision';
import { Player } from '../player/Player';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const audio = new Proxy({}, { get: () => () => {} }) as unknown as AudioEngine;

function input(keys: string[], jumpEvery = 0) {
  const set = new Set(keys);
  let t = 0;
  return {
    inp: { keys: set, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => set.has(c) } as unknown as Input,
    tick(dt: number) {
      const i = this.inp as unknown as { pressed: Set<string> };
      t += dt;
      i.pressed = new Set(jumpEvery && Math.floor(t / jumpEvery) !== Math.floor((t - dt) / jumpEvery) ? ['Space'] : []);
    },
  };
}

/** Runs the real controller; returns every position. */
function run(p: Player, keys: string[], seconds: number, dt: number, jumpEvery = 0) {
  const ctl = input(keys, jumpEvery);
  const out: THREE.Vector3[] = [];
  for (let t = 0; t < seconds; t += dt) {
    ctl.tick(dt);
    p.update(dt, ctl.inp, true, t);
    out.push(p.pos.clone());
  }
  return out;
}

/** A car-like box: floor, low ceiling (2.45 m), thin side walls (0.12 m). */
function car() {
  const w = new CollisionWorld();
  w.add(-10, -0.3, -1.5, 10, 0, 1.5); // floor
  w.add(-10, 2.45, -1.5, 10, 2.75, 1.5); // ceiling
  w.add(-10, 0, -1.56, 10, 2.45, -1.44); // side walls
  w.add(-10, 0, 1.44, 10, 2.45, 1.56);
  w.add(-10.12, 0, -1.5, -10, 2.45, 1.5); // ends
  w.add(10, 0, -1.5, 10.12, 2.45, 1.5);
  return w;
}

describe('collision regressions (3.3 world integrity)', () => {
  it('RC-1: jumping under a low ceiling never ejects the body sideways through a wall', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      const p = new Player(car(), audio);
      p.reset(0, 0, yaw, 0);
      const path = run(p, ['KeyW', 'ShiftLeft'], 3, 1 / 120, 0.4);
      for (const q of path) expect(Math.abs(q.z)).toBeLessThan(1.44);
    }
  });

  it('RC-2: sprinting into a very thin wall at 20 FPS never tunnels', () => {
    // Tunnelling needs a step longer than radius + half the wall: 0.39 m (sprint at the 1/20 s dt
    // clamp) beats 0.35 + 0.03 for a 0.06 m wall (the 3.2 train ends were 0.08 m).
    const w = new CollisionWorld();
    w.add(-5, 0, 2, 5, 3, 2.06); // thin wall ahead (yaw π looks along +z)
    for (const dt of [1 / 20, 1 / 30, 1 / 120]) {
      const p = new Player(w, audio);
      p.reset(0, 0, Math.PI, 0);
      const path = run(p, ['KeyW', 'ShiftLeft'], 2, dt, 0.5);
      for (const q of path) expect(q.z).toBeLessThan(2.03);
    }
  });

  it('RC-5: a fast fall onto a floor box beside a wall lands, it is not thrown through the wall', () => {
    const w = new CollisionWorld();
    w.add(-3, -6.4, -3, 3, -6, 3); // floor box (no ground plane down here)
    w.add(-3.4, -7.6, -3, -3, 0, 3); // wall on the west side
    const p = new Player(w, audio);
    p.reset(-2.4, 0, Math.PI / 2, -3.5);
    p.vel.set(-5, 0, 0);
    const path = run(p, ['KeyW', 'ShiftLeft'], 1.5, 1 / 20);
    for (const q of path) expect(q.x).toBeGreaterThan(-3);
    expect(path[path.length - 1].y).toBeCloseTo(-6, 1);
  });

  it('RC-6: pushing into a gap narrower than the body never ends inside geometry', () => {
    const w = new CollisionWorld();
    w.add(-5, 0, 0, 5, 2, 0.3); // wall
    w.add(-5, 0, 0.92, 5, 2, 1.5); // a block 0.62 m away
    const p = new Player(w, audio);
    p.reset(-6, 0.6, -Math.PI / 2, 0); // west of the gap, heading +x into it
    run(p, ['KeyW'], 3, 1 / 60);
    expect(w.blocked(p.pos, p.radius - 0.02)).toBe(false);
  });

  it('RC-4: dynamic colliders move with their owner and are found by every query', () => {
    const w = new CollisionWorld();
    const c = w.addDynamic(-1, 0, -1, 1, 2, 1);
    expect(w.blocked(new THREE.Vector3(0, 0, 0), 0.35)).toBe(true);
    w.moveDynamic(c, 10);
    expect(w.blocked(new THREE.Vector3(0, 0, 0), 0.35)).toBe(false);
    expect(w.blocked(new THREE.Vector3(10, 0, 0), 0.35)).toBe(true);
    expect(w.lineOfSight(new THREE.Vector3(8, 1, 0), new THREE.Vector3(12, 1, 0))).toBe(false);
  });

  it('frame-rate independence of the safeguards: same sprint distance at 20, 60 and 120 FPS', () => {
    const d = [1 / 20, 1 / 60, 1 / 120].map((dt) => {
      const p = new Player(new CollisionWorld(), audio);
      p.reset(0, 0, 0, 0);
      run(p, ['KeyW', 'ShiftLeft'], 2, dt);
      return -p.pos.z;
    });
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(0.35);
  });
});
