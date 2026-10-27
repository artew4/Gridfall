import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from '../world/Collision';
import { Rockets } from './Rockets';
import { ROCKET, ROCKET_BLAST, FRAG_BLAST, blastShare } from './Explosives';
import { fairPoint, launcherSpots, midpoint } from '../gameplay/Pickups';
import { RAM_LAUNCHER } from '../entities/weapons/rpg';
import type { Combatant } from './Team';

/* 90.1: the rocket launcher: its rockets in flight, its blast, where it lies on the map. */

function rig(bodies: Combatant[] = []) {
  const col = new CollisionWorld();
  const blasts: { at: THREE.Vector3; normal: THREE.Vector3; tag: string }[] = [];
  const fx = { smoke: { spawn() {} }, add: { spawn() {} } };
  const audio = { rocketLaunch() {}, rocketHiss: () => ({ move() {}, stop() {} }) };
  const b = { go: (at: THREE.Vector3, normal: THREE.Vector3, _s: unknown, _by: unknown, tag: string) => blasts.push({ at: at.clone(), normal: normal.clone(), tag }) };
  const r = new Rockets(new THREE.Scene(), col, fx as never, audio as never, b as never, { bodies: () => bodies });
  const fly = (secs: number) => {
    for (let t = 0; t < secs; t += 1 / 60) r.update(1 / 60);
  };
  return { col, blasts, r, fly };
}
const me = { team: 'alpha', alive: true, isPlayer: true, pos: new THREE.Vector3(), chestY: 1.25 } as unknown as Combatant;

describe('90.1: a rocket in flight', () => {
  it("goes off on the wall it meets, on the wall's face, the blast's tag RPG", () => {
    const { col, blasts, r, fly } = rig();
    col.add(30, 0, -5, 31, 6, 5);
    r.fire(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(1, 0, 0), me);
    fly(0.4);
    expect(blasts.length).toBe(0);
    fly(0.4);
    expect(blasts.length).toBe(1);
    expect(blasts[0].at.x).toBeCloseTo(30, 1);
    expect(blasts[0].normal.x).toBeCloseTo(-1, 3);
    expect(blasts[0].tag).toBe('RPG');
    expect(r.stats.wall).toBe(1);
  });
  it('flies nearly straight (under 1.5 m of drop over 60 m)', () => {
    const { blasts, r, fly } = rig();
    r.fire(new THREE.Vector3(0, 20, 0), new THREE.Vector3(1, 0, 0), me);
    fly(60 / ROCKET.speed - 0.05);
    expect(blasts.length).toBe(0);
    // Down to the street at 20 m below: far past 60 m.
    fly(5);
    expect(blasts.length).toBe(1);
    expect(blasts[0].at.x).toBeGreaterThan(150);
  });
  it("strikes a body of the other side in its way, passes its own side's", () => {
    const foe = { team: 'omega', alive: true, isPlayer: false, pos: new THREE.Vector3(12, 0, 0), raycast: (o: THREE.Vector3, d: THREE.Vector3) => {
      const t = 12 - o.x;
      return d.x > 0 && t >= 0 ? { dist: t / d.x, mult: 1, point: o.clone().addScaledVector(d, t), head: false } : null;
    } } as unknown as Combatant;
    const mate = { ...foe, team: 'alpha' } as unknown as Combatant;
    const a = rig([mate]);
    a.r.fire(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0), me);
    a.fly(0.5);
    expect(a.r.stats.body).toBe(0);
    const b = rig([foe]);
    b.r.fire(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0), me);
    b.fly(0.5);
    expect(b.r.stats.body).toBe(1);
    expect(b.blasts[0].at.x).toBeCloseTo(12, 1);
  });
  it('a bigger blast than the frag', () => {
    expect(ROCKET_BLAST.radius).toBeGreaterThan(FRAG_BLAST.radius);
    expect(blastShare(5, ROCKET_BLAST)).toBeGreaterThan(blastShare(5, FRAG_BLAST));
  });
});

describe('90.1: the launcher', () => {
  it('fires rockets, one in the tube, its own sight', () => {
    expect(RAM_LAUNCHER.launcher).toBe(true);
    expect(RAM_LAUNCHER.mag).toBe(1);
    expect(RAM_LAUNCHER.ads.zoom).toBeLessThan(1);
  });
  it('lies on the flank lanes, as far from either side\'s spawns', () => {
    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    expect(midpoint([v(0, 40), v(0, 0), v(0, -40)]).z).toBeCloseTo(0, 5);
    expect(midpoint([v(0, 40), v(0, 30), v(10, 30), v(10, -60)]).toArray()).toEqual([10, 0, -5]);
    const A = v(0, 50), B = v(0, -50);
    const spots = launcherSpots([[v(-20, 40), v(-20, -40)], [v(0, 40), v(0, -40)], [v(20, 40), v(20, -40)], [v(40, 40), v(40, -40)]], A, B);
    expect(spots.map((p) => p.x)).toEqual([-20, 20]);
    for (const p of spots) expect(p.z).toBeCloseTo(0, 1);
    // A lane winding more on one side: its middle by length is nearer B; the fair point is not.
    const wind = [v(10, 40), v(10, -20), v(30, -20), v(30, -40)];
    expect(midpoint(wind).z).toBeLessThan(-4);
    expect(fairPoint(wind, A, B).z).toBeCloseTo(0, 0);
    expect(launcherSpots([[v(0, 40), v(0, -40)]], A, B).length).toBe(1);
    expect(launcherSpots([], A, B)).toEqual([]);
  });
});
