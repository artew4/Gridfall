import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPAWN_ZONE, SpawnZone } from './SpawnZone';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('23.0: the spawn weapon swap', () => {
  it('cards for the first seconds, then the prompt, while he stays in the area', () => {
    const z = new SpawnZone();
    expect(z.update(v(0, 0, 0), 0, 0)).toBeNull(); // nothing before a spawn
    z.mark(v(10, 0, 10), 100, 4);
    expect(z.update(v(10, 0, 10), 100.5, 4)).toBe('cards');
    expect(z.update(v(15, 0, 14), 100 + SPAWN_ZONE.cards + 0.1, 4)).toBe('prompt');
  });

  it('closes for the life once he steps out (walking back in does not reopen it)', () => {
    const z = new SpawnZone();
    z.mark(v(0, 0, 0), 0, 0);
    expect(z.update(v(SPAWN_ZONE.radius + 0.1, 0, 0), 5, 0)).toBeNull();
    expect(z.update(v(0, 0, 0), 6, 0)).toBeNull();
    z.mark(v(0, 0, 0), 20, 0); // the next respawn opens it again
    expect(z.update(v(0, 0, 0), 21, 0)).toBe('cards');
  });

  it('closes on a shot fired, and on a big drop or climb', () => {
    const z = new SpawnZone();
    z.mark(v(0, 0, 0), 0, 7);
    expect(z.update(v(1, 0, 1), 4, 8)).toBeNull();
    z.mark(v(0, 5, 0), 0, 0);
    expect(z.update(v(0, 0.5, 0), 4, 0)).toBeNull();
  });
});
