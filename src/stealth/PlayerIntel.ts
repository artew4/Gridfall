import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import type { Guard, GuardState } from './Guard';
import { FOV_COS, VISION, visionRange, type RangeInput } from './Perception';

/** Rays across the cone when clipping it against walls. */
export const CONE_RAYS = 13;
/** Seconds before information about a guard is forgotten. */
export const INTEL_FADE = 9;
/** Minimum seconds between cone re-clips for one guard. */
const CLIP_EVERY = 0.2;
const HALF = Math.acos(FOV_COS);

export type FloorBand = 'under' | 'street' | 'deck' | 'roof';
export const floorBand = (y: number): FloorBand => (y < -2 ? 'under' : y < 3 ? 'street' : y < 7 ? 'deck' : 'roof');

/** What the player knows about one guard. */
export interface Intel {
  x: number;
  y: number;
  z: number;
  /** Facing when last observed; null if only heard. */
  yaw: number | null;
  state: GuardState;
  remembers: boolean;
  /** Distance to the first wall along each cone ray (up to the engaged range), at the observed pose. */
  clip: Float32Array | null;
  clipT: number;
  /** When this was learned. */
  t: number;
  /** He was shooting at the player. */
  hot: boolean;
  /** He could see the player at the time. */
  seesYou: boolean;
}

export interface ConeBlip {
  x: number;
  y: number;
  z: number;
  fresh: number;
  hot: boolean;
  color: string;
  sameFloor: boolean;
  /** Below (-1), same (0) or above (+1) the player's floor. */
  dir: -1 | 0 | 1;
  /** Cone polygon from the guard's eye: angle (world yaw) and length per ray. Null: no cone shown. */
  cone: { yaw: number; half: number; dists: number[]; dashed: boolean } | null;
}

const colorFor = (s: GuardState) =>
  s === 'combat' || s === 'pursuit' || s === 'search' ? '255,59,92' : s === 'suspicious' || s === 'investigate' ? '255,154,74' : '255,214,90';

/**
 * The player's knowledge of security: only guards he has seen (in view and line of sight), that are
 * openly noticing or attacking him, or that he heard. A seen guard carries its pose and a view cone
 * clipped against walls with the same view angle and range maths the guard uses; information ages
 * out and is never updated without a new observation.
 */
export class PlayerIntel {
  map = new Map<Guard, Intel>();
  private ray = new THREE.Vector3();

  constructor(private col: CollisionWorld) {}

  /** The player can see this guard (or the guard is visibly engaging him) right now. */
  observe(g: Guard, t: number) {
    const prev = this.map.get(g);
    const yaw = g.lookYaw;
    const moved = !prev || prev.yaw === null || Math.hypot(prev.x - g.pos.x, prev.z - g.pos.z) > 0.25 || Math.abs(prev.yaw - yaw) > 0.05;
    let clip = prev?.clip ?? null;
    let clipT = prev?.clipT ?? -Infinity;
    if (!clip || (moved && t - clipT >= CLIP_EVERY)) {
      clip = this.clipCone(g.eye.clone(), yaw, clip ?? new Float32Array(CONE_RAYS));
      clipT = t;
    }
    this.map.set(g, { x: g.pos.x, y: g.pos.y, z: g.pos.z, yaw, state: g.gstate, remembers: g.remembers(t), clip, clipT, t, hot: g.threat >= 3, seesYou: g.sees });
  }

  /** Heard him (bark, shot): roughly where, no facing. A fresher sighting is kept as it is. */
  heard(g: Guard, t: number) {
    const prev = this.map.get(g);
    if (prev && prev.yaw !== null && t - prev.t < 1) return;
    this.map.set(g, { x: g.pos.x, y: g.pos.y, z: g.pos.z, yaw: null, state: g.gstate, remembers: false, clip: null, clipT: -Infinity, t, hot: g.threat >= 3, seesYou: false });
  }

  private clipCone(eye: THREE.Vector3, yaw: number, out: Float32Array) {
    const max = VISION.engagedRange;
    for (let i = 0; i < CONE_RAYS; i++) {
      const a = yaw - HALF + (2 * HALF * i) / (CONE_RAYS - 1);
      this.ray.set(Math.sin(a), 0, Math.cos(a));
      const hit = this.col.raycast(eye, this.ray, max);
      out[i] = hit ? hit.dist : max;
    }
    return out;
  }

  /**
   * Minimap markers. `range` gives the recognition range for a guard in a given state against the
   * player as he is now (weapon drawn, wanted level), from the shared perception maths.
   */
  blips(t: number, playerY: number, range: (i: Intel) => number): ConeBlip[] {
    const out: ConeBlip[] = [];
    const pb = floorBand(playerY);
    const order: FloorBand[] = ['under', 'street', 'deck', 'roof'];
    for (const [g, k] of this.map) {
      const age = t - k.t;
      if (age > INTEL_FADE || g.dead || g.gone) {
        this.map.delete(g);
        continue;
      }
      const b = floorBand(k.y);
      const sameFloor = b === pb;
      const dir = sameFloor ? 0 : order.indexOf(b) > order.indexOf(pb) ? 1 : -1;
      let cone: ConeBlip['cone'] = null;
      // Cones only where they mean something: the player's floor, or a guard on another floor who
      // could see him when last observed (dashed).
      if (k.yaw !== null && k.clip && (sameFloor || k.seesYou)) {
        const r = range(k);
        cone = { yaw: k.yaw, half: HALF, dists: Array.from(k.clip, (d) => Math.min(d, r)), dashed: !sameFloor };
      }
      out.push({ x: k.x, y: k.y, z: k.z, fresh: 1 - age / INTEL_FADE, hot: k.hot && age < 2, color: colorFor(k.state), sameFloor, dir, cone });
    }
    return out;
  }

  clear() {
    this.map.clear();
  }
}

/** Range input for a remembered guard against the player's current state. */
export function intelRange(k: Intel, player: Omit<RangeInput, 'remembers' | 'engaged'>) {
  return visionRange({ ...player, remembers: k.remembers, engaged: k.state === 'combat' });
}
