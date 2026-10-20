import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONE_RAYS, INTEL_FADE, PlayerIntel, intelRange, type Intel } from './PlayerIntel';
import { VISION, visionRange } from './Perception';
import type { Guard } from './Guard';
import type { CollisionWorld } from '../world/Collision';

/** A wall `wallAt` metres in front of every guard (along +z), none elsewhere. */
function world(wallAt: number | null) {
  return {
    raycast: (o: THREE.Vector3, d: THREE.Vector3, max: number) => {
      if (wallAt === null || d.z <= 0) return null;
      const t = (wallAt - o.z) / d.z;
      return t > 0 && t < max ? { dist: t } : null;
    },
  } as unknown as CollisionWorld;
}

function guard(x: number, y: number, z: number, yaw = 0, state = 'patrol'): Guard {
  return {
    pos: new THREE.Vector3(x, y, z),
    lookYaw: yaw,
    get eye() {
      return new THREE.Vector3(x, y + 1.75, z);
    },
    gstate: state,
    remembers: () => false,
    threat: 0,
    sees: false,
    suspicion: 0,
    dead: false,
    gone: false,
  } as unknown as Guard;
}

const calm = { weaponDrawn: false, hunting: false, firing: false };
const armed = { weaponDrawn: true, hunting: false, firing: false };

describe('PlayerIntel (minimap knowledge)', () => {
  it('a seen guard gets a cone at his facing, as long as his real recognition range', () => {
    const intel = new PlayerIntel(world(null));
    const g = guard(0, 0, 0, 0.7);
    intel.observe(g, 0);
    const [b] = intel.blips(0, 0, (k) => intelRange(k, armed));
    expect(b.cone!.yaw).toBeCloseTo(0.7);
    expect(b.cone!.dists).toHaveLength(CONE_RAYS);
    expect(Math.max(...b.cone!.dists)).toBe(visionRange({ ...armed, remembers: false, engaged: false }));
    // Holstering shortens it to the calm range: the cone always matches what he can recognise.
    const [c] = intel.blips(0, 0, (k) => intelRange(k, calm));
    expect(Math.max(...c.cone!.dists)).toBe(VISION.calmRange);
    expect(b.color).toBe('255,214,90');
  });

  it('cones stop at walls', () => {
    const intel = new PlayerIntel(world(5));
    intel.observe(guard(0, 0, 0, 0), 0);
    const [b] = intel.blips(0, 0, (k) => intelRange(k, armed));
    const mid = b.cone!.dists[(CONE_RAYS - 1) / 2];
    expect(mid).toBeCloseTo(5, 1);
    expect(Math.max(...b.cone!.dists)).toBeLessThan(8);
  });

  it('guards on another floor show no cone (unless they could see him) and know which way', () => {
    const intel = new PlayerIntel(world(null));
    intel.observe(guard(0, 0, 0), 0);
    const roof = intel.blips(0, 8.5, (k) => intelRange(k, armed))[0];
    expect(roof.sameFloor).toBe(false);
    expect(roof.dir).toBe(-1);
    expect(roof.cone).toBeNull();
    const station = intel.blips(0, -6, (k) => intelRange(k, armed))[0];
    expect(station.dir).toBe(1);
    expect(station.cone).toBeNull();
    const seer = guard(0, 0, 0);
    (seer as unknown as { sees: boolean }).sees = true;
    intel.observe(seer, 0);
    const dashed = intel.blips(0, 4.5, (k) => intelRange(k, armed)).find((b) => b.cone);
    expect(dashed?.cone?.dashed).toBe(true);
  });

  it('heard guards have a position but no cone; information fades and is forgotten', () => {
    const intel = new PlayerIntel(world(null));
    const g = guard(3, 0, 3);
    intel.heard(g, 0);
    expect(intel.blips(0, 0, () => 16)[0].cone).toBeNull();
    expect(intel.blips(INTEL_FADE / 2, 0, () => 16)[0].fresh).toBeCloseTo(0.5);
    expect(intel.blips(INTEL_FADE + 0.1, 0, () => 16)).toHaveLength(0);
  });

  it('a stale sighting keeps the pose as observed, not the live one', () => {
    const intel = new PlayerIntel(world(null));
    const g = guard(0, 0, 0, 0);
    intel.observe(g, 0);
    g.pos.set(20, 0, 20);
    (g as unknown as { lookYaw: number }).lookYaw = 2;
    const [b] = intel.blips(3, 0, () => 16);
    expect(b.x).toBe(0);
    expect(b.cone!.yaw).toBe(0);
  });

  it('colours follow the guard state', () => {
    const intel = new PlayerIntel(world(null));
    intel.observe(guard(0, 0, 0, 0, 'investigate'), 0);
    intel.observe(guard(5, 0, 0, 0, 'pursuit'), 0);
    const cols = intel.blips(0, 0, () => 16).map((b) => b.color);
    expect(cols).toEqual(['255,154,74', '255,59,92']);
  });

  it('range input: an engaged guard reaches the engaged range', () => {
    const k = { state: 'combat', remembers: true } as Intel;
    expect(intelRange(k, calm)).toBe(VISION.engagedRange);
  });
});
