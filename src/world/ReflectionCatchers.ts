import * as THREE from 'three';
import type { Glow } from './Glows';
import { CATCHERS, MAX_CATCHERS } from './Ground';

/*
  Reflection catchers (4.0): the light of bright neon signs that have no light of their own, put
  into the wet ground's specular, following the sign's flicker (a broken sign's reflection dies
  with it). Each sits under its sign at shopfront height (≤ 2.2 m), not at the sign itself: at 6–8 m
  up an inverse-square specular is invisible at any sane intensity (measured: 0% of pixels changed;
  ×50 only tinted the whole street), while from 2.2 m it lays a coloured smear in the puddles below
  the sign that moves with the eye (3.9% of a Lantern Street frame at intensity 5). Stylised: the
  sign's spill, not its exact mirror image (the additive streaks draw that).

  They are not THREE.PointLights. The first build used real ones (weak, short-ranged, no shadows) and
  measured +2.1 ms GPU in the metro, where none of them is even visible, and +0.8 ms at the plaza:
  forward shading evaluates every point light for every lit fragment on the map. The same light
  (GGX lobe, decay-2 falloff, cutoff) is evaluated instead inside the wet-ground shader only
  (Ground.ts, CATCHERS uniforms), specular only, so only ground pixels pay. The additive streaks
  still draw each sign's shape; the catchers add its spill on the wet street round them.
*/

export interface Catcher {
  pos: THREE.Vector3;
  glow: Glow;
  base: number;
}

export class ReflectionCatchers {
  readonly list: Catcher[] = [];
  private on = true;

  /** `picks`: sign positions (matched to the nearest glow within 0.6 m). */
  constructor(glows: Glow[], picks: [number, number, number][], opts = { intensity: 9, distance: 11, height: 2.2 }) {
    for (const [x, y, z] of picks.slice(0, MAX_CATCHERS)) {
      let best: Glow | null = null;
      let bd = 0.6;
      for (const g of glows) {
        const d = Math.hypot(g.pos.x - x, g.pos.y - y, g.pos.z - z);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (!best) continue;
      this.list.push({ pos: new THREE.Vector3(best.pos.x, Math.min(best.pos.y, opts.height), best.pos.z), glow: best, base: opts.intensity });
    }
    CATCHERS.range.value = opts.distance;
    this.update();
  }

  setEnabled(on: boolean) {
    this.on = on;
    this.update();
  }

  /** After the glows update: follow each sign's flicker and breakage. */
  update() {
    const P = CATCHERS.pos.value, C = CATCHERS.col.value;
    for (let i = 0; i < MAX_CATCHERS; i++) {
      const c = this.list[i];
      if (!c || !this.on) {
        C[i].set(0, 0, 0);
        continue;
      }
      P[i].copy(c.pos);
      const k = c.base * c.glow.value;
      C[i].set(c.glow.color.r * k, c.glow.color.g * k, c.glow.color.b * k);
    }
  }

  /** Level unload: nothing left lit. */
  dispose() {
    for (const c of CATCHERS.col.value) c.set(0, 0, 0);
  }
}
