import * as THREE from 'three';
import type { MetroTrain } from '../rail/MetroTrain';
import type { Train } from '../world/Train';
import { RAIL } from '../world/City';
import { clamp, smoothstep } from '../core/math';

export interface EndingFrame {
  fade: number;
  letterbox: number;
  /** The end card can come up. */
  done: boolean;
}

/**
 * The escape, told with the game's own renderer: inside the car as the doors shut and the platform
 * slides away; the same train out on the elevated line above the district; the neon falling away
 * behind it from the last car. Then the end card (EndScreen) takes over.
 */
export class Ending {
  t = 0;
  private started = false;
  private look = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private carriage = 1 + Math.floor(Math.random() * 2);

  constructor(private metro: MetroTrain, private elevated: Train) {}

  update(dt: number, cam: THREE.PerspectiveCamera): EndingFrame {
    this.t += dt;
    const t = this.t;
    const up = new THREE.Vector3(0, 1, 0);
    if (t < 4.6) {
      // Shot 1: inside, looking at the doors as the platform starts to slide past.
      const p = this.metro.cabinPoint(this.carriage, new THREE.Vector3());
      cam.position.set(p.x + Math.sin(t * 0.7) * 0.03, p.y + Math.sin(t * 9) * 0.006 * clamp(t - 1, 0, 1), p.z + 0.35);
      this.look.set(p.x + 1.5, p.y - 0.15, p.z - 3);
      cam.fov = 60;
    } else {
      if (!this.started) {
        this.started = true;
        // The line comes up out of the tunnel onto the overpass: same train, elevated.
        this.elevated.startNow(1, -160, 8);
        this.elevated.cinematic = true;
      }
      if (t < 12) {
        // Shot 2: level with the deck above Railway Street; the lit cars slide across the street gap.
        const k = smoothstep(4.6, 12, t);
        cam.position.set(-0.8 + k * 1.6, RAIL.deckTop + 0.9 + k * 0.4, RAIL.z + 9.5 - k * 1.2);
        this.look.set(1 + k * 2, RAIL.deckTop + 1.8, RAIL.z);
        cam.fov = 50;
      } else {
        // Shot 3 (after a dip to black): a slow crane up and back over the fountain plaza; beyond the
        // rooftops the lit train runs out along the overpass and the district falls away into the rain.
        const k = smoothstep(12, 25, t);
        cam.position.set(-5 - k * 9, 16 + k * 26, 24 + k * 16);
        this.look.set(4 + k * 8, 3 - k * 2, -8 - k * 6);
        cam.fov = 50;
      }
    }
    this.m.lookAt(cam.position, this.look, up);
    this.q.setFromRotationMatrix(this.m);
    cam.quaternion.copy(this.q);
    cam.updateProjectionMatrix();
    // Black between the shots, and a long fade at the end.
    const cut = t > 3.8 && t < 5.4 ? 1 - Math.abs(t - 4.6) / 0.8 : t > 11.3 && t < 12.7 ? 1 - Math.abs(t - 12) / 0.7 : 0;
    const out = smoothstep(21, 25, t);
    return { fade: Math.max(cut, out), letterbox: 1, done: t > 25.5 };
  }
}
