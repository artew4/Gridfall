import * as THREE from 'three';
import { clamp, easeInOut, smoothstep } from '../../core/math';
import type { IntroFrame } from '../../cinematic/Intro';
import type { IntroLike } from '../Level';

/**
 * ~11 s opening for the jungle: high over Firebase Viper through the gap in the canopy, then a long
 * pull-back out over the gate and down the approach road, the compound always in frame, into the
 * player's eyes at the south end of the road as the shotgun comes up.
 */
export class JungleIntro implements IntroLike {
  t = 0;
  readonly duration = 11;
  private path: THREE.CatmullRomCurve3;
  private m = new THREE.Matrix4();
  private a = new THREE.Quaternion();
  private b = new THREE.Quaternion();

  constructor(private end: THREE.Vector3, private endLook: THREE.Vector3, roadX: (z: number) => number) {
    this.path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(26, 38, -46),
      new THREE.Vector3(12, 22, -8),
      new THREE.Vector3(3, 10, 16),
      new THREE.Vector3(roadX(32) + 1, 3.4, 32),
      new THREE.Vector3(end.x, 2.0, end.z - 2.5),
    ]);
  }

  landAt(eye: THREE.Vector3, look: THREE.Vector3) {
    this.end.copy(eye);
    this.endLook.copy(look);
  }

  skip() {
    if (this.t < 8.6) this.t = 8.6;
  }

  update(dt: number, cam: THREE.PerspectiveCamera): IntroFrame {
    this.t += dt;
    const t = this.t;
    const k = easeInOut(clamp((t - 0.3) / 8.3, 0, 1));
    const pos = this.path.getPointAt(k);
    // The yard first, then the gate as the road opens up behind.
    const look = new THREE.Vector3(-4, 0, -20).lerp(new THREE.Vector3(0, 3, 10), smoothstep(3.0, 8.0, t));
    this.m.lookAt(pos, look, new THREE.Vector3(0, 1, 0));
    this.a.setFromRotationMatrix(this.m);
    this.m.lookAt(this.end, this.endLook, new THREE.Vector3(0, 1, 0));
    this.b.setFromRotationMatrix(this.m);
    const s = easeInOut(clamp((t - 8.6) / 1.8, 0, 1));
    cam.position.copy(pos).lerp(this.end, s);
    cam.quaternion.copy(this.a).slerp(this.b, s);
    cam.fov = 52 * (1 - s) + 74 * s;
    cam.updateProjectionMatrix();
    return {
      fade: 1 - smoothstep(0.2, 1.8, t),
      letterbox: 1 - smoothstep(8.6, 10.2, t),
      title: t > 1.6 && t < 6.2,
      hud: t > 10,
      raiseWeapon: t > 9.6,
      done: t >= this.duration,
    };
  }

  dispose() {}
}
