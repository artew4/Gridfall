import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../world/Collision';
import { BODY_H, CROUCH_H, HANDLING, Player } from './Player';
import { SLIDE, slideDistance, slideStep, slideTime } from './Slide';
import { PlayerUnit } from '../combat/PlayerUnit';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const audio = { footstep() {}, land() {}, playerHurt() {}, slide() {} } as unknown as AudioEngine;

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

/** Sprint north for `run` s, then press crouch (a tap) and keep W and Shift held. Returns the player at the press. */
function sprintThenSlide(fps: number, run = 0.6, ceiling?: number) {
  const env = setup(ceiling);
  const { p, input, keys } = env;
  const pressed = input.pressed as Set<string>;
  keys.add('KeyW').add('ShiftLeft');
  run_(p, input, run, 1 / fps);
  const zPress = p.pos.z;
  pressed.add('KeyC');
  keys.add('KeyC');
  p.update(1 / fps, input, true, 0);
  pressed.clear();
  keys.delete('KeyC');
  return { ...env, zPress };
}
const run_ = run;

describe('12.0 slide', () => {
  it('slideStep is exact: any frame rate lands on the closed form', () => {
    const v0 = 8.7;
    const c = SLIDE.friction / SLIDE.drag;
    const closed = (v0 + c) * Math.exp(-SLIDE.drag * 0.8) - c;
    for (const fps of [30, 60, 144]) {
      let v = v0;
      for (let i = 0; i < Math.round(0.8 * fps); i++) v = slideStep(v, 0.8 / Math.round(0.8 * fps));
      expect(v).toBeCloseTo(closed, 9);
    }
    // The distance formula agrees with integrating the speed.
    let v = v0, d = 0;
    const T = slideTime(v0, 2.75), n = 20000;
    for (let i = 0; i < n; i++) {
      const v1 = slideStep(v, T / n);
      d += ((v + v1) / 2) * (T / n);
      v = v1;
    }
    expect(d).toBeCloseTo(slideDistance(v0, T), 3);
    expect(T).toBeGreaterThan(1);
    expect(T).toBeLessThan(1.5);
  });

  it('crouch mid-sprint slides: faster than the sprint at first, friction brings it down to a crouch in ~1.2 s', () => {
    const { p, input, keys } = sprintThenSlide(60);
    expect(p.sliding).toBe(true);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(7.8);
    keys.delete('ShiftLeft'); // let go of the sprint: it should end crouched
    const z0 = p.pos.z;
    let t = 0;
    while (p.sliding && t < 3) {
      p.update(1 / 60, input, true, 0);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(1.0);
    expect(t).toBeLessThan(1.5);
    expect(z0 - p.pos.z).toBeGreaterThan(5);
    run(p, input, 0.6, 1 / 60);
    expect(p.height).toBeCloseTo(CROUCH_H, 2); // the tap left it crouched
    // and it walks on at the crouch speed, no jolt
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(5 * HANDLING.crouchSpeed, 1);
  });

  it('the slide is the same at 30 and 144 FPS (distance within 3%)', () => {
    const dist = (fps: number) => {
      const { p, input, keys, zPress } = sprintThenSlide(fps);
      keys.delete('ShiftLeft');
      keys.delete('KeyW');
      run(p, input, 1.5, 1 / fps);
      return zPress - p.pos.z;
    };
    const a = dist(30), b = dist(144);
    expect(Math.abs(a - b) / b).toBeLessThan(0.03);
  });

  it('the camera and hitbox drop to the crouch while sliding; it can aim, and aiming does not brake it', () => {
    const { p, input } = sprintThenSlide(60);
    p.aimWant = true;
    const v0 = p.slideV;
    run(p, input, 0.3, 1 / 60);
    expect(p.sliding).toBe(true);
    expect(p.ads).toBe(1);
    expect(p.height).toBeLessThan(BODY_H - 0.4);
    expect(p.slideV).toBeCloseTo(slideStep(v0, 0.3), 1);
  });

  it('crouch while walking is just a crouch (no slide)', () => {
    const { p, input, keys } = setup();
    keys.add('KeyW');
    run(p, input, 0.6, 1 / 60);
    (input.pressed as Set<string>).add('KeyC');
    p.update(1 / 60, input, true, 0);
    expect(p.sliding).toBe(false);
  });

  it('a wall ends the slide (momentum lost), a jump out of it keeps the speed', () => {
    const { p, input, keys } = sprintThenSlide(60, 0.6);
    // A wall 1.5 m ahead.
    const col = (p as unknown as { col: CollisionWorld }).col;
    col.add(-5, 0, p.pos.z - 2.2, 5, 3, p.pos.z - 1.5);
    run(p, input, 0.5, 1 / 60);
    expect(p.sliding).toBe(false);
    keys.delete('ShiftLeft');
    const j = sprintThenSlide(60);
    (j.input.pressed as Set<string>).add('Space');
    j.p.update(1 / 60, j.input, true, 0);
    expect(j.p.sliding).toBe(false);
    expect(j.p.vel.y).toBeGreaterThan(4);
    expect(Math.hypot(j.p.vel.x, j.p.vel.z)).toBeGreaterThan(7.5);
  });

  it('a slide under a low slab stays crouched under it when it ends', () => {
    const { p, input, keys } = sprintThenSlide(60, 0.3, 1.5);
    p.yaw = 0;
    keys.delete('ShiftLeft');
    keys.delete('KeyW');
    run(p, input, 2, 1 / 60);
    expect(p.pos.y).toBe(0);
  });
});
