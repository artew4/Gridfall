import * as THREE from 'three';
import { clamp, easeInOut, smoothstep } from '../../core/math';
import type { IntroFrame } from '../../cinematic/Intro';
import type { IntroLike } from '../Level';

/**
 * ~11 s opening for the jungle: above the canopy in the mist, down through a gap between the giants,
 * low over the undergrowth toward the temple, through the archway and into the player's eyes at the
 * foot of the south stair as the shotgun comes up.
 */
export class JungleIntro implements IntroLike {
  t = 0;
  readonly duration = 11;
  private path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-34, 48, 66),
    new THREE.Vector3(-22, 28, 52),
    new THREE.Vector3(-8, 9, 40),
    new THREE.Vector3(-1, 3.2, 28),
    new THREE.Vector3(0, 2.0, 21.5),
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
    // First down into the forest, then up the temple to the shrine.
    const look = new THREE.Vector3(-6, 2, 24).lerp(new THREE.Vector3(0, 5, 0), smoothstep(3.5, 8.0, t));
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
