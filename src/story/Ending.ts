import * as THREE from 'three';
import type { MetroTrain } from '../rail/MetroTrain';
import type { Train } from '../world/Train';
import { RAIL } from '../world/City';
import { clamp, smoothstep } from '../core/math';
import { buildGuard, disposeRig, type Rig } from '../enemies/Models';
import { CAR_CENTRES, SCREEN_Z, UG } from '../world/Metro';

export interface EndingHost {
  scene: THREE.Scene;
  say(speaker: string, text: string, seconds?: number): void;
}

/** Length of the platform shot that opens the ending. */
const PLATFORM = 3.6;

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
  /** Kurogane officers who reach the platform as the doors shut. */
  private late: { rig: Rig; x0: number; x1: number; delay: number }[] = [];
  private said = new Set<string>();
  /** Where the camera's car door is on the platform. */
  private doorX = 0;

  constructor(private metro: MetroTrain, private elevated: Train, private host?: EndingHost) {
    const doorX = (this.doorX = CAR_CENTRES[this.carriage] + metro.x - 2);
    if (!host) return;
    [
      [doorX + 11, doorX + 2.2, 0.2],
      [doorX + 14, doorX + 3.6, 0.6],
      [doorX - 10, doorX - 1.4, 0.9],
    ].forEach(([x0, x1, delay]) => {
      const rig = buildGuard();
      rig.root.position.set(x0, UG, SCREEN_Z - 1.6);
      rig.root.rotation.y = x1 > x0 ? Math.PI / 2 : -Math.PI / 2;
      host.scene.add(rig.root);
      this.late.push({ rig, x0, x1, delay });
    });
  }

  private line(key: string, at: number, speaker: string, text: string, seconds?: number) {
    if (this.t >= at && !this.said.has(key)) {
      this.said.add(key);
      this.host?.say(speaker, text, seconds);
    }
  }

  /** Officers run up to the doors, too late, and are left behind as the train pulls out. */
  private animateLate(t: number) {
    for (const g of this.late) {
      const k = clamp((t - g.delay) / 1.9, 0, 1);
      const r = g.rig;
      r.root.position.x = g.x0 + (g.x1 - g.x0) * (1 - (1 - k) * (1 - k));
      const running = k < 1;
      const ph = t * 11;
      r.legL.rotation.x = running ? Math.sin(ph) * 0.7 : 0;
      r.legR.rotation.x = running ? -Math.sin(ph) * 0.7 : 0;
      // Then turn to the train and watch it go.
      if (!running) r.root.rotation.y += (Math.PI - r.root.rotation.y) * 0.08;
      const beacon = r.root.userData.beacon as THREE.MeshBasicMaterial | undefined;
      const on = Math.floor(t * 6) % 2;
      beacon?.color.setRGB(on ? 3 : 0.2, 0.15, on ? 0.2 : 3);
      r.root.visible = t < PLATFORM;
    }
  }

  dispose() {
    for (const g of this.late) {
      this.host?.scene.remove(g.rig.root);
      disposeRig(g.rig);
      g.rig.armorMat.dispose();
      g.rig.clothMat.dispose();
      g.rig.glowMat.dispose();
    }
    this.late.length = 0;
  }

  update(dt: number, cam: THREE.PerspectiveCamera): EndingFrame {
    this.t += dt;
    const t = this.t;
    const up = new THREE.Vector3(0, 1, 0);
    this.animateLate(t);
    this.line('k1', 4.2, 'KENJI (TEXT)', 'You’re clear. Stay on the train.', 3.4);
    this.line('pa', 8.6, 'TRAIN PA', 'This is the last express to Kagerō Bay. We will not stop before Kagerō Bay.', 4.6);
    this.line('k2', 16.4, 'KENJI (TEXT)', 'The ledger is safe as long as you are. Don’t look back.', 4.4);
    if (t < PLATFORM) {
      // Shot 0: on the platform. The doors shut; Kurogane officers run up a moment too late.
      cam.position.set(this.doorX + 7.5, UG + 1.5, SCREEN_Z - 3.3);
      this.look.set(this.doorX - 1, UG + 1.35, SCREEN_Z + 0.6);
      cam.fov = 52;
    } else if (t - PLATFORM < 4.6) {
      // Shot 1: inside, among the late passengers on the far bench, as the train gets going.
      const p = this.metro.cabinPoint(this.carriage, new THREE.Vector3());
      const u = t - PLATFORM;
      cam.position.set(p.x + Math.sin(u * 0.7) * 0.03, p.y + Math.sin(u * 9) * 0.006 * clamp(u - 1, 0, 1), p.z + 0.35);
      this.look.set(p.x + 4.5, p.y - 0.7, p.z + 1.3);
      cam.fov = 60;
    } else {
      const u = t - PLATFORM;
      if (!this.started) {
        this.started = true;
        // The line comes up out of the tunnel onto the overpass: same train, elevated.
        this.elevated.startNow(1, -160, 8);
        this.elevated.cinematic = true;
      }
      if (u < 12) {
        // Shot 2: level with the deck above Railway Street; the lit cars slide across the street gap.
        const k = smoothstep(4.6, 12, u);
        cam.position.set(-0.8 + k * 1.6, RAIL.deckTop + 0.9 + k * 0.4, RAIL.z + 9.5 - k * 1.2);
        this.look.set(1 + k * 2, RAIL.deckTop + 1.8, RAIL.z);
        cam.fov = 50;
      } else {
        // Shot 3 (after a dip to black): a slow crane up and back over the fountain plaza; beyond the
        // rooftops the lit train runs out along the overpass and the district falls away into the rain.
        const k = smoothstep(12, 25, u);
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
    const u = t - PLATFORM;
    const dip = (at: number, w: number) => (Math.abs(u - at) < w ? 1 - Math.abs(u - at) / w : 0);
    const cut = Math.max(t < 0.5 ? 1 - t / 0.5 : 0, dip(0, 0.45), dip(4.6, 0.8), dip(12, 0.7));
    const out = smoothstep(21, 25, u);
    return { fade: Math.max(cut, out), letterbox: 1, done: u > 25.5 };
  }
}
