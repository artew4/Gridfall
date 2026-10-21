import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../world/Collision';
import { BODY_H, CROUCH_H, HANDLING, Player } from './Player';
import { PlayerUnit } from '../combat/PlayerUnit';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const audio = { footstep() {}, land() {}, playerHurt() {} } as unknown as AudioEngine;

function setup(ceiling?: number) {
  const col = new CollisionWorld();
  col.add(-50, -1, -50, 50, 0, 50); // the floor
  if (ceiling !== undefined) col.add(2, ceiling, -3, 8, ceiling + 0.3, 3); // a low slab to crawl under
  const p = new Player(col, audio);
  p.reset(0, 0, 0);
  const keys = new Set<string>();
  const input = { keys, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => keys.has(c) } as unknown as Input;
  return { p, input, keys };
}

/** Run `seconds` of play at a fixed step. */
function run(p: Player, input: Input, seconds: number, dt: number) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) p.update(dt, input, true, i * dt);
}

describe('11.0 handling: ADS and crouch', () => {
  it('the ADS blend is frame-rate independent: halfway at half the time at 30, 60, 120 and 150 FPS', () => {
    for (const fps of [30, 60, 120, 150]) {
      const { p, input } = setup();
      p.aimWant = true;
      run(p, input, HANDLING.adsIn / 2, 1 / fps);
      // A linear clock eased by a smoothstep: exactly 0.5 at the midpoint, whatever the step.
      expect(p.adsT).toBeCloseTo(0.5, 9);
      expect(p.ads).toBeCloseTo(0.5, 9);
    }
  });

  it('the sights land exactly (no asymptotic tail, no overshoot) and go down in adsOut', () => {
    const { p, input } = setup();
    p.aimWant = true;
    run(p, input, HANDLING.adsIn, 1 / 60);
    expect(p.ads).toBe(1);
    run(p, input, 0.5, 1 / 60);
    expect(p.ads).toBe(1);
    p.aimWant = false;
    run(p, input, HANDLING.adsOut, 1 / 60);
    expect(p.ads).toBe(0);
  });

  it('the crouch is an exact exponential: the same height after 0.2 s at 30 and 120 FPS', () => {
    const heights = [30, 120].map((fps) => {
      const { p, input, keys } = setup();
      keys.add('KeyC');
      run(p, input, 0.2, 1 / fps);
      return p.height;
    });
    expect(heights[0]).toBeCloseTo(heights[1], 6);
    expect(heights[0]).toBeLessThan(BODY_H - 0.4);
  });

  it('a tap toggles the crouch, a hold crouches only while held', () => {
    const { p, input, keys } = setup();
    const press = () => {
      (input.pressed as Set<string>).add('KeyC');
      keys.add('KeyC');
    };
    const frame = () => {
      p.update(1 / 60, input, true, 0);
      (input.pressed as Set<string>).clear();
    };
    press();
    frame();
    keys.delete('KeyC'); // a tap
    for (let i = 0; i < 60; i++) frame();
    expect(p.height).toBeCloseTo(CROUCH_H, 2);
    press(); // a tap again: stand
    frame();
    keys.delete('KeyC');
    for (let i = 0; i < 60; i++) frame();
    expect(p.height).toBeCloseTo(BODY_H, 2);
    press(); // held for a second, then let go: stands
    for (let i = 0; i < 60; i++) frame();
    expect(p.height).toBeCloseTo(CROUCH_H, 2);
    keys.delete('KeyC');
    for (let i = 0; i < 60; i++) frame();
    expect(p.height).toBeCloseTo(BODY_H, 2);
  });

  it('under a low ceiling it cannot stand up: it rises only as far as the room allows', () => {
    const { p, input, keys } = setup(1.5);
    p.yaw = -Math.PI / 2; // facing +x, towards the slab
    keys.add('KeyC');
    run(p, input, 0.5, 1 / 60);
    keys.add('KeyW');
    run(p, input, 1.6, 1 / 60); // crawls under it
    keys.delete('KeyW');
    expect(p.pos.x).toBeGreaterThan(3);
    keys.delete('KeyC'); // tries to stand
    run(p, input, 1, 1 / 60);
    expect(p.height).toBeLessThanOrEqual(1.5);
    expect(p.pos.y).toBe(0);
    expect(p.pos.x).toBeGreaterThan(3); // not pushed out from under it
  });

  it('standing, it cannot walk under that slab (the body is taller than the gap)', () => {
    const { p, input, keys } = setup(1.5);
    p.yaw = -Math.PI / 2;
    keys.add('KeyW');
    run(p, input, 2, 1 / 60);
    expect(p.pos.x).toBeLessThan(2);
  });

  it('crouched it moves at crouchSpeed of a walk, aiming at adsSpeed', () => {
    const dist = (setupFn: (p: Player, keys: Set<string>) => void) => {
      const { p, input, keys } = setup();
      keys.add('KeyW');
      setupFn(p, keys);
      run(p, input, 0.5, 1 / 60); // settle
      const z0 = p.pos.z;
      run(p, input, 1, 1 / 60);
      return Math.abs(p.pos.z - z0);
    };
    const walk = dist(() => {});
    expect(dist((_p, k) => k.add('KeyC')) / walk).toBeCloseTo(HANDLING.crouchSpeed, 2);
    expect(dist((p) => (p.aimWant = true)) / walk).toBeCloseTo(HANDLING.adsSpeed, 2);
  });

  it('the bots see and aim at a crouched player where he is (head and chest scale with the crouch)', () => {
    const { p, input, keys } = setup();
    const u = new PlayerUnit(p);
    const head = u.headY;
    keys.add('KeyC');
    run(p, input, 1, 1 / 60);
    expect(u.headY).toBeCloseTo(head * (CROUCH_H / BODY_H), 2);
    expect(u.chestY).toBeLessThan(1);
  });
});
