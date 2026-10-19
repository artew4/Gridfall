import * as THREE from 'three';
import type { Effects } from '../combat/Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Glow, Glows } from './Glows';
import type { SignGlow } from './Signs';
import { rand, pick } from '../core/math';

/**
 * Small ambient events that keep the district alive without getting in the way: transformer arcs,
 * steam valves venting, signs glitching when lightning strikes, things rattling under a train.
 * Everything here is short, local and never touches the camera.
 */
export class Events {
  private arcT = rand(8, 16);
  private steamT = rand(6, 12);
  private glitches: { g: Glow; mode: Glow['mode']; t: number }[] = [];
  private flash: Glow;
  private shakeBase: { o: THREE.Object3D; p: THREE.Vector3; r: THREE.Euler }[];
  /** A steam valve vented here (the cloud blocks sight for a few seconds). */
  onSteam: (at: THREE.Vector3) => void = () => {};

  constructor(
    glows: Glows,
    private fx: Effects,
    private audio: AudioEngine,
    private signs: SignGlow[],
    private transformers: THREE.Vector3[],
    private vents: THREE.Vector3[],
    trackside: THREE.Object3D[],
  ) {
    // One shared flash glow moved to wherever an arc happens (lights rain and steam briefly).
    this.flash = glows.add({ pos: new THREE.Vector3(0, -50, 0), color: new THREE.Color(0.55, 0.75, 1), radius: 7, base: 0, haloSize: 3, haloStrength: 0, mode: 'steady' });
    this.shakeBase = trackside.map((o) => ({ o, p: o.position.clone(), r: o.rotation.clone() }));
  }

  /** Lightning: a handful of signs stutter for a moment. */
  thunder() {
    const pool = this.signs.filter((s) => s.mode !== 'broken' && !this.glitches.some((g) => g.g === s));
    for (let i = 0; i < Math.min(5, pool.length); i++) {
      const s = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      this.glitches.push({ g: s, mode: s.mode, t: rand(0.3, 0.8) });
      s.mode = 'broken';
    }
  }

  update(dt: number, t: number, listener: THREE.Vector3, rumble: number) {
    // Transformer arcs on the utility poles.
    this.arcT -= dt;
    if (this.arcT <= 0 && this.transformers.length) {
      this.arcT = rand(15, 35);
      const p = pick(this.transformers);
      if (p.distanceTo(listener) < 45) {
        const end = p.clone().add(new THREE.Vector3(rand(-1.2, 1.2), rand(0.4, 1.4), rand(-1.2, 1.2)));
        this.fx.arc(p, end);
        this.fx.arc(p, end.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.3, 0.3), rand(-0.4, 0.4))));
        this.fx.sparks(p, new THREE.Vector3(0, -1, 0), 24, new THREE.Color(0.7, 0.85, 1), 4);
        this.audio.sparkCrackle(p);
        this.audio.discharge(p);
        this.flash.pos.copy(p);
        this.flash.base = 1.8;
        this.flash.haloStrength = 0.6;
      }
    }
    this.flash.base = Math.max(0, this.flash.base - dt * 9);
    this.flash.haloStrength = Math.max(0, this.flash.haloStrength - dt * 3);

    // Steam valves venting with a hiss.
    this.steamT -= dt;
    if (this.steamT <= 0 && this.vents.length) {
      this.steamT = rand(9, 20);
      const v = pick(this.vents);
      if (v.distanceTo(listener) < 30) {
        for (let i = 0; i < 18; i++) {
          this.fx.smoke.spawn({
            x: v.x, y: v.y, z: v.z,
            vx: rand(-0.6, 0.6), vy: rand(1.2, 2.6), vz: rand(-0.6, 0.6),
            r: 0.34, g: 0.34, b: 0.4, a: 0.28, size: 0.3, grow: 1.6, life: rand(1.2, 2.2), drag: 1.4,
          });
        }
        this.audio.steamHiss(v);
        this.onSteam(v);
      }
    }

    // Lightning glitches recover.
    for (let i = this.glitches.length - 1; i >= 0; i--) {
      const g = this.glitches[i];
      g.t -= dt;
      if (g.t <= 0) {
        g.g.mode = g.mode;
        this.glitches.splice(i, 1);
      }
    }

    // Signs hanging under the tracks rattle while a train is overhead (objects only, never the camera).
    for (const s of this.shakeBase) {
      const k = rumble * rumble;
      s.o.position.set(s.p.x + Math.sin(t * 41) * 0.012 * k, s.p.y + Math.sin(t * 57 + 1) * 0.015 * k, s.p.z);
      s.o.rotation.set(s.r.x + Math.sin(t * 23) * 0.02 * k, s.r.y, s.r.z + Math.sin(t * 31 + 2) * 0.03 * k);
    }
  }

  reset() {
    for (const g of this.glitches) g.g.mode = g.mode;
    this.glitches.length = 0;
  }
}
