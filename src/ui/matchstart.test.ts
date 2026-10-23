import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../world/Collision';
import { Player } from '../player/Player';
import { Countdown } from './Countdown';
import { ThinkScheduler } from '../enemies/tactics/Scheduler';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../audio/AudioEngine';

const css: string = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const audio = { footstep() {}, land() {}, playerHurt() {}, slide() {} } as unknown as AudioEngine;

function player(floorY = 0) {
  const col = new CollisionWorld();
  col.add(-50, floorY - 1, -50, 50, floorY, 50);
  const p = new Player(col, audio);
  p.reset(0, 0, 0, floorY);
  const keys = new Set<string>();
  const input = { keys, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => keys.has(c) } as unknown as Input;
  return { p, input, keys };
}

/** A DOM just big enough for Countdown (the tests run in node): class lists, children, and a count of writes. */
function fakeDom() {
  let writes = 0;
  const make = () => {
    const cls = new Set<string>();
    return {
      className: '',
      textContent: '',
      children: [] as unknown[],
      appendChild(c: unknown) { this.children.push(c); },
      classList: {
        add: (c: string) => { writes++; cls.add(c); },
        remove: (c: string) => { writes++; cls.delete(c); },
        contains: (c: string) => cls.has(c),
      },
    };
  };
  (globalThis as unknown as { document: unknown }).document = { createElement: make };
  return { parent: make(), writes: () => writes };
}

describe('36.0: the pre-match countdown', () => {
  it('shows 3, 2, 1 by the seconds left (nothing before the last 3 s), START! for 0.9 s after, then nothing', () => {
    const dom = fakeDom();
    const c = new Countdown(dom.parent as unknown as HTMLElement);
    const at = (left: number | null) => (c.set(left), c.step);
    expect(at(4.5)).toBe(-1); // a longer countdown: nothing until the last 3 s (each number plays once)
    expect(at(3)).toBe(3);
    expect(at(2.01)).toBe(3);
    expect(at(2)).toBe(2);
    expect(at(1.5)).toBe(2);
    expect(at(0.4)).toBe(1);
    expect(at(0)).toBe(0);
    expect(at(-0.85)).toBe(0);
    expect(at(-0.95)).toBe(-1);
    expect(at(-Infinity)).toBe(-1);
    expect(at(null)).toBe(-1);
  });

  it('touches the DOM only when the step changes (a class off, a class on)', () => {
    const dom = fakeDom();
    const c = new Countdown(dom.parent as unknown as HTMLElement);
    for (let t = 3; t > -2; t -= 1 / 60) c.set(t);
    // On 3 (one write), to 2, 1 and START! (off and on: two each), off at the end (one): 8, not 300.
    expect(dom.writes()).toBe(8);
  });

  it('animates transform and opacity only, and centres without a transform', () => {
    for (const name of ['cd-tick', 'cd-go']) {
      const body = css.match(new RegExp(`@keyframes ${name} \\{\\n([\\s\\S]*?)\\n\\}`))?.[1];
      expect(body, name).toBeTruthy();
      const props = new Set([...body!.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].sort()).toEqual(['opacity', 'transform']);
    }
    const step = css.match(/\.cd-step \{([^}]*)\}/)?.[1] ?? '';
    expect(step).toMatch(/left: 0; right: 0/);
    expect(step).not.toMatch(/translate/);
  });
});

describe('36.0: held (the countdown)', () => {
  it('a held player neither walks, sprints nor jumps, but still looks round', () => {
    const { p, input, keys } = player();
    p.held = true;
    keys.add('KeyW');
    keys.add('ShiftLeft');
    const yaw0 = p.yaw;
    for (let i = 0; i < 120; i++) {
      input.pressed.add('Space');
      (input as unknown as { mouseDX: number }).mouseDX = 5;
      p.update(1 / 60, input, true, i / 60);
      input.pressed.clear();
    }
    expect(Math.hypot(p.pos.x, p.pos.z)).toBe(0);
    expect(p.pos.y).toBe(0);
    expect(p.sprinting).toBe(false);
    expect(p.yaw).not.toBe(yaw0);
    // Let go: the same keys move him.
    p.held = false;
    (input as unknown as { mouseDX: number }).mouseDX = 0;
    for (let i = 0; i < 60; i++) p.update(1 / 60, input, true, 2 + i / 60);
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeGreaterThan(2);
  });

  it('a reset puts the eyes over the feet at once (a raised spawn: no rise over the first frames)', () => {
    const { p } = player(6.5);
    expect(p.eyeY).toBeCloseTo(6.5 + 1.65, 5);
  });
});

describe('36.0: nothing of a match outlives its frames', () => {
  it('the think scheduler keeps nobody between frames (a countdown or an intro picks nobody for seconds)', () => {
    const s = new ThinkScheduler();
    const agents = Array.from({ length: 12 }, (_, i) => ({ urgent: i % 3 === 0, nextThink: i * 0.01 }));
    const out = s.pick(agents, 1);
    expect(out.length).toBeGreaterThan(0);
    expect((s as unknown as { queue: unknown[] }).queue).toHaveLength(0);
  });
});

