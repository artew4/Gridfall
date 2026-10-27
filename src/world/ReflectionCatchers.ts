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

/*
  84.0: more than the shader's eight. The pool also takes the storefronts' lightboxes (no glow: their
  colour, steady; or the glow of one that flickers), and each frame the eight nearest the eye are lit,
  the furthest of them fading out as the next one comes as near (no catcher pops on or off).
*/

export interface Catcher {
  pos: THREE.Vector3;
  glow: Glow | null;
  colour: THREE.Color;
  base: number;
}

export class ReflectionCatchers {
  readonly list: Catcher[] = [];
  private on = true;

  private near: { c: Catcher; d: number }[] = [];

  /** `picks`: sign positions (matched to the nearest glow within 0.6 m); `more`: 84.0's pool beyond them. */
  constructor(
    glows: Glow[],
    picks: [number, number, number][],
    opts = { intensity: 9, distance: 11, height: 2.2 },
    more: { pos: THREE.Vector3; colour: THREE.Color; glow?: Glow; intensity: number }[] = [],
  ) {
    for (const [x, y, z] of more.length ? picks : picks.slice(0, MAX_CATCHERS)) {
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
      this.list.push({ pos: new THREE.Vector3(best.pos.x, Math.min(best.pos.y, opts.height), best.pos.z), glow: best, colour: best.color, base: opts.intensity });
    }
    for (const m of more)
      this.list.push({ pos: new THREE.Vector3(m.pos.x, Math.min(m.pos.y, opts.height), m.pos.z), glow: m.glow ?? null, colour: m.colour, base: m.intensity });
    CATCHERS.range.value = opts.distance;
    this.update();
  }

  setEnabled(on: boolean) {
    this.on = on;
    this.update();
  }

  /** After the glows update: follow each sign's flicker and breakage; with `eye`, the nearest eight. */
  update(eye?: THREE.Vector3) {
    const P = CATCHERS.pos.value, C = CATCHERS.col.value;
    // (Made once, sorted in place: no garbage a frame.)
    if (this.near.length !== this.list.length) this.near = this.list.map((c) => ({ c, d: 0 }));
    const near = this.near;
    if (eye && near.length > MAX_CATCHERS) {
      for (const n of near) n.d = n.c.pos.distanceTo(eye);
      near.sort((a, b) => a.d - b.d);
    }
    // The next one's distance: the eighth fades out over the last 3 m before it is as near.
    const next = eye && near.length > MAX_CATCHERS ? near[MAX_CATCHERS].d : Infinity;
    for (let i = 0; i < MAX_CATCHERS; i++) {
      const n = near[i];
      if (!n || !this.on) {
        C[i].set(0, 0, 0);
        continue;
      }
      P[i].copy(n.c.pos);
      const fade = next === Infinity ? 1 : Math.min(1, Math.max(0, (next - n.d) / 3));
      const k = n.c.base * (n.c.glow ? n.c.glow.value : 1) * fade;
      C[i].set(n.c.colour.r * k, n.c.colour.g * k, n.c.colour.b * k);
    }
  }

  /** Level unload: nothing left lit. */
  dispose() {
    for (const c of CATCHERS.col.value) c.set(0, 0, 0);
  }
}
