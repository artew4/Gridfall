import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CollisionWorld } from '../world/Collision';
import { BODY_H, CROUCH_H, Player } from './Player';
import { findLedge, MANTLE, mantlePos, mantleStats, mantleTime } from './Mantle';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const audio = { footstep() {}, land() {}, playerHurt() {}, slide() {} } as unknown as AudioEngine;

/** A floor, and a box `h` m tall (8 m deep) whose face is 0.8 m ahead of him (he faces -z). */
function setup(h: number, extra?: (col: CollisionWorld) => void) {
  const col = new CollisionWorld();
  col.add(-50, -1, -50, 50, 0, 50);
  if (h > 0) col.add(-3, 0, -8.8, 3, h, -0.8);
  extra?.(col);
  const p = new Player(col, audio);
  p.reset(0, 0, 0);
  const keys = new Set<string>();
  const pressed = new Set<string>();
  const input = { keys, pressed, mouseDX: 0, mouseDY: 0, key: (c: string) => keys.has(c) } as unknown as Input;
  return { col, p, input, keys, pressed };
}

/** W held, a jump on the first frame; `seconds` of play at `fps`. Returns his highest feet and the pull-up's frames. */
function jumpAt(p: Player, input: Input, keys: Set<string>, pressed: Set<string>, seconds = 1.2, fps = 60, w = true) {
  if (w) keys.add('KeyW');
  pressed.add('Space');
  const dt = 1 / fps;
  let top = -Infinity, frames = 0, dur = 0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    p.update(dt, input, true, i * dt);
    pressed.clear();
    top = Math.max(top, p.pos.y);
    if (p.mantling) {
      frames++;
      dur = p.mantleDur;
    }
  }
  return { top, frames, dur };
}

describe('43.0 the ledge grab', () => {
  const on0 = MANTLE.on;
  afterEach(() => {
    MANTLE.on = on0;
  });

  it('a jump at a 1.5 m box (out of a jump\'s reach) ends on top of it, pulled up over 200-300 ms', () => {
    const { p, input, keys, pressed } = setup(1.5);
    const r = jumpAt(p, input, keys, pressed);
    expect(p.pos.y).toBeCloseTo(1.5, 5);
    expect(p.pos.z).toBeLessThan(-0.8 - 0.3);
    expect(p.onGround).toBe(true);
    expect(r.dur).toBeGreaterThanOrEqual(0.2);
    expect(r.dur).toBeLessThanOrEqual(0.3);
    // Never above the top (no overshoot, no snap from the air).
    expect(r.top).toBeLessThanOrEqual(1.5 + 1e-9);
    // Without it, he stays on the floor.
    MANTLE.on = false;
    const b = setup(1.5);
    jumpAt(b.p, b.input, b.keys, b.pressed);
    expect(b.p.pos.y).toBe(0);
  });

  it('the reach: a 1.7 m top is taken, a 1.9 m one is not', () => {
    for (const [h, up] of [[1.7, true], [1.9, false]] as const) {
      const { p, input, keys, pressed } = setup(h);
      jumpAt(p, input, keys, pressed);
      expect(p.pos.y > 1).toBe(up);
    }
  });

  it('only holding forward; walking into the wall on the ground casts no ray', () => {
    const a = setup(1.5);
    jumpAt(a.p, a.input, a.keys, a.pressed, 1.2, 60, false);
    expect(a.p.pos.y).toBe(0);
    const b = setup(1.5);
    b.keys.add('KeyW');
    const rays = mantleStats.rays;
    for (let i = 0; i < 120; i++) b.p.update(1 / 60, b.input, true, i / 60);
    expect(b.p.onGround).toBe(true);
    expect(mantleStats.rays).toBe(rays);
  });

  it('the same ledge at 30, 60 and 144 FPS: the same spot on top, as long a pull-up', () => {
    const ends = [30, 60, 144].map((fps) => {
      const { p, input, keys, pressed } = setup(1.5);
      keys.add('KeyW');
      pressed.add('Space');
      let was = false, end = null as THREE.Vector3 | null, t = 0;
      for (let i = 0; i < fps && !end; i++) {
        p.update(1 / fps, input, true, i / fps);
        pressed.clear();
        if (p.mantling) t += 1 / fps;
        if (was && !p.mantling) end = p.pos.clone();
        was = p.mantling;
      }
      return { end: end!, t };
    });
    for (const e of ends) {
      expect(e.end.y).toBeCloseTo(1.5, 9);
      expect(e.end.z).toBeCloseTo(ends[0].end.z, 9);
      expect(Math.abs(e.t - ends[0].t)).toBeLessThanOrEqual(1 / 30 + 1e-9);
    }
  });

  it('a fence (no ledge to stand on past it) and the top of a thin wall are not ledges', () => {
    // A 1.4 m fence, 0.1 m thick, with no `ray` (bullets pass): the floor past it is 1.4 m down.
    const f = setup(0, (col) => {
      col.add(-3, 0, -0.9, 3, 1.4, -0.8, 'metal').ray = false;
    });
    jumpAt(f.p, f.input, f.keys, f.pressed);
    expect(f.p.pos.y).toBe(0);
    expect(f.p.pos.z).toBeGreaterThan(-0.8);
  });

  it('room: under a slab 1.0 m over the top he does not fit; 1.4 m, he ends there crouched', () => {
    const low = setup(1.5, (col) => col.add(-3, 2.5, -8.8, 3, 2.8, -0.85));
    jumpAt(low.p, low.input, low.keys, low.pressed);
    expect(low.p.pos.y).toBe(0);
    const mid = setup(1.5, (col) => col.add(-3, 2.9, -8.8, 3, 3.2, -0.85));
    jumpAt(mid.p, mid.input, mid.keys, mid.pressed);
    expect(mid.p.pos.y).toBeCloseTo(1.5, 5);
    expect(mid.p.height).toBeLessThan(1.42);
    expect(mid.p.height).toBeGreaterThanOrEqual(CROUCH_H - 1e-6);
    expect(BODY_H).toBeGreaterThan(1.4);
  });

  it('never through a barrier: a deck behind its parapet, a platform behind its edge rail (Old Port, Maglev)', () => {
    // A 1 m deck whose edge carries a 0.15 m parapet 1 m tall (its top 2 m: out of reach).
    const deck = setup(0, (col) => {
      col.add(-3, 0, -8.8, 3, 1, -0.8);
      col.add(-3, 1, -0.95, 3, 2, -0.8);
    });
    jumpAt(deck.p, deck.input, deck.keys, deck.pressed);
    expect(deck.p.pos.z).toBeGreaterThan(-0.8);
    // A 1 m step up onto a floor with a 1.05 m rail 0.2 m in from its edge: the way over is barred.
    const rail = setup(0, (col) => {
      col.add(-3, 0, -8.8, 3, 1.2, -0.8);
      col.add(-3, 1.2, -1.08, 3, 2.25, -1.0);
    });
    jumpAt(rail.p, rail.input, rail.keys, rail.pressed);
    expect(rail.p.pos.z).toBeGreaterThan(-0.8);
    expect(rail.p.pos.y).toBeLessThan(1);
  });

  it('a vaultable tank he is already clearing is left to the vault (over it, at pace); one too tall to vault is grabbed', () => {
    const low = setup(0, (col) => {
      const c = col.addCylinder(0, -1.55, 0.75, 0, 1.2);
      c.vault = true;
    });
    // A sprinting jump that takes it at the apex (from a standing jump, or at a walk, he is over it only
    // part way when his feet drop under its vault height: pushed back, he grabs it).
    low.p.reset(0, 1.6, 0);
    low.p.vel.z = -7.8;
    low.keys.add('ShiftLeft');
    const g0 = mantleStats.grabs;
    jumpAt(low.p, low.input, low.keys, low.pressed);
    expect(mantleStats.grabs).toBe(g0);
    expect(low.p.pos.z).toBeLessThan(-2.3);
    expect(low.p.pos.y).toBe(0);
    // 1.5 m: the feet never get within 0.62 m of its top; he climbs onto it.
    const tall = setup(0, (col) => {
      col.addCylinder(0, -1.55, 0.75, 0, 1.5).vault = true;
    });
    tall.keys.add('KeyW');
    tall.pressed.add('Space');
    let top = 0;
    for (let i = 0; i < 50; i++) {
      tall.p.update(1 / 60, tall.input, true, i / 60);
      tall.pressed.clear();
      if (!tall.p.mantling && tall.p.onGround) top = Math.max(top, tall.p.pos.y);
    }
    expect(top).toBeCloseTo(1.5, 5);
  });

  it('the level has its say: a spot outside its extent is no ledge', () => {
    const { p, input, keys, pressed } = setup(1.5);
    p.mantleOk = (q) => q.z > -1;
    jumpAt(p, input, keys, pressed);
    expect(p.pos.y).toBe(0);
  });

  it('the view dips during the pull-up and is level again after it; the gun is down and the trigger off', () => {
    const { p, input, keys, pressed } = setup(1.5);
    keys.add('KeyW');
    pressed.add('Space');
    let dip = 0;
    for (let i = 0; i < 72; i++) {
      p.update(1 / 60, input, true, i / 60);
      pressed.clear();
      if (p.mantling) {
        dip = Math.max(dip, p.pitch - p.viewPitch(0));
        expect(p.sprinting).toBe(false);
      }
    }
    expect(dip).toBeGreaterThan(MANTLE.dip * 0.8);
    expect(p.mantleK).toBe(0);
    expect(p.viewPitch(0)).toBeCloseTo(p.pitch, 9);
  });
});

describe('43.0 the probe and the motion (pure)', () => {
  it('the rays: the wall, then the top, then the way over; a body-width spot on it, inside the room', () => {
    const col = new CollisionWorld();
    col.add(-3, 0, -2.8, 3, 1.5, -0.8);
    const r0 = mantleStats.rays;
    const l = findLedge(col, new THREE.Vector3(0, 0.75, -0.45), 0, -1, 0.35, CROUCH_H);
    // The wall, the top, the way over (shins, chest).
    expect(mantleStats.rays - r0).toBe(4);
    expect(l!.to.y).toBeCloseTo(1.5, 9);
    expect(l!.to.z).toBeCloseTo(-0.8 - MANTLE.land, 9);
    expect(l!.rise).toBeCloseTo(0.75, 9);
    // Facing away from it, nothing; past the reach, one ray and nothing.
    expect(findLedge(col, new THREE.Vector3(0, 0.75, -0.45), 0, 1, 0.35, CROUCH_H)).toBe(null);
    expect(findLedge(col, new THREE.Vector3(0, 0.75, 2), 0, -1, 0.35, CROUCH_H)).toBe(null);
  });

  it('up first, then over: the feet never move forward below the lip; it ends exactly on the spot', () => {
    const from = new THREE.Vector3(0, 0.7, -0.45), to = new THREE.Vector3(0, 1.5, -1.27);
    const T = mantleTime(0.8), q = new THREE.Vector3();
    for (let i = 0; i <= 100; i++) {
      mantlePos(from, to, (i / 100) * T, T, q);
      // Against the wall's face (z -0.45 for the body's edge): it moves over only as the feet near the top.
      if (q.y < to.y - 0.08) expect(q.z).toBeGreaterThan(-0.45 - 0.05);
      if (i) expect(q.y).toBeGreaterThanOrEqual(from.y);
    }
    expect(mantlePos(from, to, T, T, q)).toEqual(to);
    expect(mantleTime(0.4)).toBeLessThan(mantleTime(1));
  });
});

describe('57.0: through a window (parkour)', () => {
  /** A wall across his way (its face 0.8 m ahead, 0.3 m deep) with a window: sill `sill`, `w` wide, `h` tall; bars if asked. */
  const wall = (sill: number, w: number, h: number, bars = false) => (col: CollisionWorld) => {
    const z0 = -1.1, z1 = -0.8, hw = w / 2;
    col.add(-4, 0, z0, -hw, 3, z1);
    col.add(hw, 0, z0, 4, 3, z1);
    col.add(-hw, 0, z0, hw, sill, z1);
    col.add(-hw, sill + h, z0, hw, 3, z1);
    if (bars) col.add(-hw, sill, z0 + 0.12, hw, sill + h, z0 + 0.18).ray = false;
  };

  it('a wide window he can reach: he dives through and lands past the wall', () => {
    const { p, input, keys, pressed } = setup(0, wall(1.0, 1.2, 1.0));
    const before = mantleStats.windows;
    jumpAt(p, input, keys, pressed, 1.6);
    expect(mantleStats.windows).toBe(before + 1);
    expect(p.pos.z).toBeLessThan(-1.6);
    expect(p.pos.y).toBeCloseTo(0, 1);
  });

  it('not through bars, a narrow slit, a low hole, or a sill out of reach', () => {
    for (const [sill, w, h, bars] of [[1.0, 1.2, 1.0, true], [1.0, 0.8, 1.0, false], [1.0, 1.2, 0.6, false], [1.9, 1.2, 1.0, false]] as const) {
      const { p, input, keys, pressed } = setup(0, wall(sill, w, h, bars));
      const before = mantleStats.windows;
      jumpAt(p, input, keys, pressed, 1.6);
      expect(mantleStats.windows).toBe(before);
      expect(p.pos.z).toBeGreaterThan(-0.8);
    }
  });

  it('the eyes pass under the lintel on the way through', () => {
    const { p, input, keys, pressed } = setup(0, wall(1.0, 1.2, 0.9));
    keys.add('KeyW');
    pressed.add('Space');
    let worst = -Infinity;
    for (let i = 0; i < 90; i++) {
      p.update(1 / 60, input, true, i / 60);
      pressed.clear();
      if (p.mantling && p.pos.z < -0.75 && p.pos.z > -1.15) worst = Math.max(worst, p.eyeY - 1.9);
    }
    expect(worst).toBeLessThan(0);
  });
});
