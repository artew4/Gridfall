import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SafetyNet, type SafetyWorld } from './SafetyNet';

function world(over: Partial<SafetyWorld> = {}): SafetyWorld {
  return {
    bounds: new THREE.Box2(new THREE.Vector2(-50, -50), new THREE.Vector2(50, 50)),
    floorMin: -6,
    blocked: () => false,
    designed: () => true,
    aboard: () => false,
    ...over,
  };
}

const body = (x = 0, y = 0, z = 0) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), radius: 0.35, onGround: true, alive: true });

describe('safety net (out-of-bounds fallback)', () => {
  it('returns a body that fell out of the world to the last safe spot, with no velocity', () => {
    const net = new SafetyNet(world());
    const b = body(0, 0, 0);
    net.reset(b.pos);
    b.pos.set(5, 0, 5);
    net.update(0.3, b); // recorded as safe
    b.pos.set(9, -12, 9);
    b.vel.set(1, -20, 1);
    expect(net.update(1 / 60, b)).toBe('fell out of the world');
    expect(b.pos.toArray()).toEqual([5, 0, 5]);
    expect(b.vel.length()).toBe(0);
  });

  it('never records an unsafe spot: airborne, outside the designed level or inside geometry', () => {
    let designed = true;
    let blocked = false;
    const net = new SafetyNet(world({ designed: () => designed, blocked: () => blocked }));
    const b = body(1, 0, 1);
    net.reset(b.pos);
    b.onGround = false;
    b.pos.set(2, 3, 2);
    net.update(0.3, b);
    b.onGround = true;
    designed = false;
    b.pos.set(3, 0, 3);
    net.update(0.3, b);
    designed = true;
    blocked = true;
    b.pos.set(4, 0, 4);
    net.update(0.3, b);
    blocked = false;
    b.pos.set(0, -20, 0);
    net.update(1 / 60, b);
    expect(b.pos.toArray()).toEqual([1, 0, 1]);
  });

  it('recovers a body stuck inside geometry only after a second, not on brief contact', () => {
    let blocked = true;
    const net = new SafetyNet(world({ blocked: () => blocked }));
    const b = body();
    net.reset(b.pos);
    b.pos.set(3, 0, 0);
    for (let i = 0; i < 30; i++) expect(net.update(1 / 60, b)).toBeNull();
    blocked = false;
    net.update(1 / 60, b);
    blocked = true;
    let why: string | null = null;
    for (let i = 0; i < 90 && !why; i++) why = net.update(1 / 60, b);
    expect(why).toBe('stuck inside geometry');
  });

  it('riding a train out of the extent is legitimate; walking out is not', () => {
    let aboard = true;
    const net = new SafetyNet(world({ aboard: () => aboard }));
    const b = body();
    net.reset(b.pos);
    b.pos.set(170, -6, 35);
    expect(net.update(1 / 60, b)).toBeNull();
    aboard = false;
    expect(net.update(1 / 60, b)).toBe('left the playable extent');
  });

  it('breaks recovery loops by falling back to the life start (level start or checkpoint)', () => {
    const net = new SafetyNet(world());
    const b = body(1, 0, 1);
    net.reset(b.pos);
    b.pos.set(8, 0, 8);
    net.update(0.3, b); // a safe spot that (in this test) keeps leading into the void
    const dest: number[][] = [];
    for (let i = 0; i < 4; i++) {
      b.pos.set(8, -20, 8);
      net.update(0.1, b);
      dest.push(b.pos.toArray());
    }
    expect(dest.slice(0, 3)).toEqual([[8, 0, 8], [8, 0, 8], [8, 0, 8]]);
    expect(dest[3]).toEqual([1, 0, 1]);
    expect(net.recoveries).toBe(4);
  });

  it('a body standing below the lowest floor (the track pit) is recovered after a moment', () => {
    const net = new SafetyNet(world());
    const b = body(0, -6, 30);
    net.reset(b.pos);
    b.pos.set(0, -7.2, 35);
    let why: string | null = null;
    let n = 0;
    for (; n < 120 && !why; n++) why = net.update(1 / 60, b);
    expect(why).toBe('below the lowest floor');
    expect(n).toBeGreaterThan(40);
    expect(b.pos.toArray()).toEqual([0, -6, 30]);
  });
});
