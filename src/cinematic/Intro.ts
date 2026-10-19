import * as THREE from 'three';
import { buildGunner, type Rig } from '../enemies/Models';
import { clamp, easeInOut, smoothstep } from '../core/math';
import type { AudioEngine } from '../audio/AudioEngine';

export interface IntroFrame {
  fade: number;
  letterbox: number;
  title: boolean;
  hud: boolean;
  raiseWeapon: boolean;
  done: boolean;
}

const END_POS = new THREE.Vector3(0, 1.65, 10);
const END_LOOK = new THREE.Vector3(0, 1.65, 0);
const SIL_POS = new THREE.Vector3(-1.2, 0, -31);

/**
 * ~13 second opening: black screen and rain, a low dolly over the wet street past the izakaya
 * and the vending machines, a metallic clang, a backlit silhouette under the railway, then the
 * camera settles into the player's eyes and the gun comes up.
 */
export class Intro {
  t = 0;
  readonly duration = 13;
  private path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.2, 0.32, 29),
    new THREE.Vector3(-2.2, 0.42, 24),
    new THREE.Vector3(-0.4, 0.6, 19),
    new THREE.Vector3(1.4, 1.0, 14.5),
    new THREE.Vector3(0.9, 1.45, 11.5),
  ]);
  private silhouette: Rig;
  private clanged = false;
  private look = new THREE.Vector3();
  private startQ = new THREE.Quaternion();
  private endQ = new THREE.Quaternion();
  private m = new THREE.Matrix4();

  private rimColor = new THREE.Color();

  /** `rim` is an idle scene light borrowed for the backlight (adding a light would recompile every shader). */
  constructor(private scene: THREE.Scene, private audio: AudioEngine, private rim: THREE.PointLight) {
    this.rimColor.copy(rim.color);
    rim.color.set(0x7fe6ff);
    rim.distance = 9;
    rim.position.set(SIL_POS.x + 0.4, 2.4, SIL_POS.z - 2.2);
    this.silhouette = buildGunner();
    this.silhouette.root.position.copy(SIL_POS);
    this.silhouette.root.rotation.y = 0.08;
    this.silhouette.glowMat.color.setScalar(0);
    scene.add(this.silhouette.root);
  }

  skip() {
    if (this.t < 11.2) this.t = 11.2;
  }

  update(dt: number, cam: THREE.PerspectiveCamera): IntroFrame {
    this.t += dt;
    const t = this.t;

    // Dolly along the street, gaze drifting from the puddles to the far end of the street.
    const k = easeInOut(clamp((t - 1.0) / 9.0, 0, 1));
    const pos = this.path.getPointAt(k);
    const ground = new THREE.Vector3(pos.x + 1.5, 0, pos.z - 8);
    const far = new THREE.Vector3(SIL_POS.x, 1.6, SIL_POS.z);
    const g = smoothstep(4, 9, t);
    this.look.copy(ground).lerp(far, g);
    // Gentle handheld drift.
    pos.x += Math.sin(t * 0.7) * 0.04;
    pos.y += Math.sin(t * 1.1) * 0.02;

    this.m.lookAt(pos, this.look, new THREE.Vector3(0, 1, 0));
    this.startQ.setFromRotationMatrix(this.m);
    // Slight dutch angle early on.
    const roll = (1 - g) * 0.05;
    this.startQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));

    // Final settle into first person.
    this.m.lookAt(END_POS, END_LOOK, new THREE.Vector3(0, 1, 0));
    this.endQ.setFromRotationMatrix(this.m);
    const b = easeInOut(clamp((t - 11.2) / 1.6, 0, 1));
    cam.position.copy(pos).lerp(END_POS, b);
    cam.quaternion.copy(this.startQ).slerp(this.endQ, b);
    // Slow punch-in on the silhouette, released as we drop into first person.
    const punch = smoothstep(7.8, 9.2, t) * (1 - smoothstep(10.3, 11.3, t));
    cam.fov = (58 - 24 * punch) * (1 - b) + 74 * b;
    cam.updateProjectionMatrix();

    // The silhouette.
    if (t > 7.6 && !this.clanged) {
      this.clanged = true;
      this.audio.clang(SIL_POS.clone().setY(1.5), 1.4);
    }
    const sil = this.silhouette;
    this.rim.intensity = t > 7.7 && t < 11.4 ? 70 * smoothstep(7.7, 8.0, t) * (1 - smoothstep(10.8, 11.4, t)) : 0;
    if (t > 8.2 && t < 10.6) {
      const flick = t < 8.5 ? (Math.random() < 0.5 ? 1 : 0) : 1;
      sil.glowMat.color.setRGB(4 * flick, 2.2 * flick, 0.3 * flick);
      sil.head.rotation.y = Math.sin((t - 8.2) * 1.4) * 0.35;
    } else sil.glowMat.color.setScalar(0);
    if (t > 10.6) {
      // Steps back into the dark.
      sil.root.position.x = SIL_POS.x - (t - 10.6) * 2.2;
      sil.root.rotation.y = -Math.PI * 0.5;
    }
    if (t > 12.5) sil.root.visible = false;

    const fade = t < 2 ? 1 : 1 - smoothstep(2, 4.2, t);
    return {
      fade,
      letterbox: 1 - smoothstep(11.2, 12.6, t),
      title: t > 3.6 && t < 7.4,
      hud: t > 12.2,
      raiseWeapon: t > 11.6,
      done: t >= this.duration,
    };
  }

  dispose() {
    this.rim.color.copy(this.rimColor);
    this.rim.intensity = 0;
    this.rim.distance = 9;
    this.scene.remove(this.silhouette.root);
  }
}
