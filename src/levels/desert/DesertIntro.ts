import * as THREE from 'three';
import { clamp, easeInOut, smoothstep } from '../../core/math';
import type { IntroFrame } from '../../cinematic/Intro';
import type { IntroLike } from '../Level';

/**
 * ~11 s opening for the desert: high over the dune sea, a long glide in over the barrier and through
 * the south gate, settling into the player's eyes in the yard as the weapon comes up.
 */
export class DesertIntro implements IntroLike {
  t = 0;
  readonly duration = 11;
  private path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(58, 26, 80),
    new THREE.Vector3(26, 14, 58),
    new THREE.Vector3(-6, 6.5, 38),
    new THREE.Vector3(-7, 3.2, 26),
    new THREE.Vector3(-1, 2.2, 14),
  ]);
  private m = new THREE.Matrix4();
  private a = new THREE.Quaternion();
  private b = new THREE.Quaternion();

  constructor(private end: THREE.Vector3, private endLook: THREE.Vector3) {}

  skip() {
    if (this.t < 8.6) this.t = 8.6;
  }

  update(dt: number, cam: THREE.PerspectiveCamera): IntroFrame {
    this.t += dt;
    const t = this.t;
    const k = easeInOut(clamp((t - 0.3) / 8.3, 0, 1));
    const pos = this.path.getPointAt(k);
    const look = new THREE.Vector3(0, 2, 2).lerp(new THREE.Vector3(0, 2.5, -8), smoothstep(5, 8.5, t));
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
