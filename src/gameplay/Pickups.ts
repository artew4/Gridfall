import * as THREE from 'three';
import { launcherProp } from '../entities/weapons/rpg';

/*
  90.1: the rocket launcher as a pickup: a launcher turning slowly over a glowing ring on the ground at
  each spot; walked over, it is taken (the Game arms him) and comes back `respawn` s later. TDM only.

  Where (`launcherSpots`): on the flank lanes, at the point as far from one team's spawns as from the
  other's (a lane's middle by length was not: Old Port's and the docks' lanes wind more on one side,
  their middles 8–12 m nearer one base), so both teams have the same run to each.
*/

const RING = 0xffa040;

export interface PickupSpot {
  pos: THREE.Vector3;
  group: THREE.Group;
  /** Seconds until it is back (0: there). */
  wait: number;
}

/** The middle (by length) of a polyline. */
export function midpoint(line: readonly THREE.Vector3[]): THREE.Vector3 {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += line[i].distanceTo(line[i - 1]);
  let half = len / 2;
  for (let i = 1; i < line.length; i++) {
    const d = line[i].distanceTo(line[i - 1]);
    if (half <= d) return line[i - 1].clone().lerp(line[i], d > 0 ? half / d : 0);
    half -= d;
  }
  return line[line.length - 1].clone();
}

/** The point of a polyline (every 0.25 m) as far from `a` as from `b` (in the plan); its middle if none is nearer. */
export function fairPoint(line: readonly THREE.Vector3[], a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  let best = midpoint(line), bd = Infinity;
  const q = new THREE.Vector3();
  for (let i = 1; i < line.length; i++) {
    const d = line[i].distanceTo(line[i - 1]);
    const n = Math.max(1, Math.ceil(d / 0.25));
    for (let k = 0; k <= n; k++) {
      q.copy(line[i - 1]).lerp(line[i], k / n);
      const e = Math.abs(Math.hypot(q.x - a.x, q.z - a.z) - Math.hypot(q.x - b.x, q.z - b.z));
      if (e < bd) {
        bd = e;
        best = q.clone();
      }
    }
  }
  return best;
}

/**
 * The spots: on the first and the last of the three main lanes (or the only one), as far from the
 * one team's spawns (`a`, their middle) as from the other's (`b`).
 */
export function launcherSpots(lanes: readonly THREE.Vector3[][], a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const main = lanes.slice(0, 3).filter((l) => l.length > 1);
  if (!main.length) return [];
  if (main.length < 3) return [fairPoint(main[Math.floor(main.length / 2)], a, b)];
  return [fairPoint(main[0], a, b), fairPoint(main[2], a, b)];
}

export class LauncherPickups {
  readonly spots: PickupSpot[] = [];
  private t = 0;
  /** DEV: taken. */
  stats = { taken: 0, bots: 0 };

  constructor(scene: THREE.Scene, at: readonly THREE.Vector3[], private respawn = 40) {
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(RING).multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const p of at) {
      const group = new THREE.Group();
      group.position.copy(p);
      const prop = launcherProp();
      prop.position.y = 0.85;
      prop.rotation.z = 0.25;
      group.add(prop);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      scene.add(group);
      this.spots.push({ pos: p.clone(), group, wait: 0 });
    }
  }

  /**
   * Per frame: the props turn and bob, the taken ones count down. `take` is asked when he stands on an
   * available one (true: he took it).
   */
  update(dt: number, feet: THREE.Vector3 | null, take: () => boolean) {
    this.t += dt;
    for (const s of this.spots) {
      if (s.wait > 0) {
        s.wait -= dt;
        s.group.visible = s.wait <= 0;
        continue;
      }
      const prop = s.group.children[0];
      prop.rotation.y = this.t * 0.9;
      prop.position.y = 0.85 + Math.sin(this.t * 2.2) * 0.06;
      if (feet && Math.hypot(feet.x - s.pos.x, feet.z - s.pos.z) < 1.3 && Math.abs(feet.y - s.pos.y) < 1.2 && take()) {
        s.wait = this.respawn;
        s.group.visible = false;
        this.stats.taken++;
      }
    }
  }

  /** 92.0: a bot passing within `r` m of an available launcher takes it (true). */
  takeNear(p: THREE.Vector3, r: number): boolean {
    for (const s of this.spots) {
      if (s.wait > 0 || Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > r || Math.abs(p.y - s.pos.y) > 1.2) continue;
      s.wait = this.respawn;
      s.group.visible = false;
      this.stats.taken++;
      this.stats.bots++;
      return true;
    }
    return false;
  }

  /** All back (a new match). */
  reset() {
    for (const s of this.spots) {
      s.wait = 0;
      s.group.visible = true;
    }
  }
}
