import * as THREE from 'three';
import type { Room } from './Interiors';

/*
  84.0, Night Tokyo's light on the ground (docs/TOKYO_PLAN.md, step 6): what the lit shop windows and
  the lamps throw on the pavement, baked once into a light map over the map (8 texels a metre) and
  added by the street's shaders (asphalt, pavements, paving, markings): diffuse on the dry, a gloss of
  it on the wet, strongest in the puddles. No light and no draw call: one texture read a ground pixel.

    front   a shop's window: light from its glass spreading out over the pavement, the frame's
            mullions casting fans of shadow that widen with the distance
    pool    a lamp overhead: the round pool under it

  Street level only (the bake is flat): a surface over 0.6 m or not facing up takes none.
*/

export interface SpillFront {
  kind: 'front';
  /** The glass's foot on the wall (its middle), its outward turn (0: +Z, as Storefronts' `ry`). */
  x: number;
  z: number;
  ry: number;
  width: number;
  colour: THREE.Color;
  power: number;
  /** The frame's verticals (m across the glass, from its middle). */
  mullions: number[];
  /** What the side panes let through beyond `door` (an izakaya's koshi): 0..1 (default 1). */
  sides?: number;
  door?: number;
}
export interface SpillPool {
  kind: 'pool';
  x: number;
  z: number;
  /** The lamp's height over the ground. */
  h: number;
  radius: number;
  colour: THREE.Color;
  power: number;
}
export type SpillSource = SpillFront | SpillPool;

export interface SpillMap {
  /** RGBA8, sqrt(light / SPILL_SCALE) (the dim edges keep their steps fine). */
  data: Uint8Array;
  w: number;
  h: number;
  x0: number;
  z0: number;
  texel: number;
}

export const SPILL_SCALE = 3;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A front's light at `d` metres out from its glass, `s` across it (0: its middle). */
export function frontLight(f: SpillFront, d: number, s: number): number {
  if (d <= 0) return 0;
  const w = f.width / 2, a = Math.abs(s);
  // The sill keeps the first few centimetres in its shadow; then the inverse-square-ish fall.
  const fall = smooth(0, 0.35, d) / (1 + Math.pow(d / 1.3, 2.2));
  const soft = 0.2 + 0.45 * d;
  const lat = 1 - smooth(w - soft * 0.4, w + soft, a);
  let k = fall * lat;
  // Each mullion's shadow, cast from the room's light ~1.6 m behind the glass: it fans out and blurs.
  for (const m of f.mullions) {
    const c = m * (1 + d / 1.6), half = 0.04 * (1 + d / 1.6) + 0.06 * d;
    k *= 1 - 0.55 * Math.exp(-d / 2.2) * (1 - smooth(half * 0.5, half * 1.5, Math.abs(s - c)));
  }
  if (f.sides !== undefined && f.door !== undefined) {
    const door = f.door / 2 * (1 + d / 1.6);
    k *= f.sides + (1 - f.sides) * (1 - smooth(door - 0.1, door + 0.15 + 0.2 * d, a));
  }
  return k * f.power;
}

/** A pool's light `r` metres from under its lamp (1 straight under it, times its power). */
export function poolLight(p: SpillPool, r: number): number {
  const h = p.h;
  return (p.power * h * h * h) / Math.pow(r * r + h * h, 1.5) * (1 - smooth(p.radius * 0.6, p.radius, r));
}

/** Bakes the sources over [x0, x1] x [z0, z1] (`perMetre` texels a metre). */
export function bakeSpill(sources: SpillSource[], x0: number, z0: number, x1: number, z1: number, perMetre = 8): SpillMap {
  const texel = 1 / perMetre;
  const w = Math.ceil((x1 - x0) * perMetre), h = Math.ceil((z1 - z0) * perMetre);
  const acc = new Float32Array(w * h * 3);
  const add = (minX: number, maxX: number, minZ: number, maxZ: number, f: (x: number, z: number) => number, c: THREE.Color) => {
    const i0 = Math.max(0, Math.floor((minX - x0) * perMetre)), i1 = Math.min(w - 1, Math.ceil((maxX - x0) * perMetre));
    const j0 = Math.max(0, Math.floor((minZ - z0) * perMetre)), j1 = Math.min(h - 1, Math.ceil((maxZ - z0) * perMetre));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const v = f(x0 + (i + 0.5) * texel, z0 + (j + 0.5) * texel);
        if (v <= 0) continue;
        const o = (j * w + i) * 3;
        acc[o] += c.r * v;
        acc[o + 1] += c.g * v;
        acc[o + 2] += c.b * v;
      }
  };
  for (const s of sources) {
    if (s.kind === 'pool') {
      add(s.x - s.radius, s.x + s.radius, s.z - s.radius, s.z + s.radius, (x, z) => poolLight(s, Math.hypot(x - s.x, z - s.z)), s.colour);
      continue;
    }
    const ox = Math.sin(s.ry), oz = Math.cos(s.ry);
    const reach = 5.5, span = s.width / 2 + 3;
    // The rect's corners (0..reach out, ±span across): its bounds.
    const cx = [0, reach].flatMap((d) => [-span, span].map((a) => s.x + d * ox + a * oz));
    const cz = [0, reach].flatMap((d) => [-span, span].map((a) => s.z + d * oz - a * ox));
    add(
      Math.min(...cx), Math.max(...cx), Math.min(...cz), Math.max(...cz),
      (x, z) => {
        const dx = x - s.x, dz = z - s.z;
        const d = dx * ox + dz * oz, across = dx * oz - dz * ox;
        return d > reach || Math.abs(across) > span ? 0 : frontLight(s, d, across);
      },
      s.colour,
    );
  }
  const data = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(Math.sqrt(Math.min(1, acc[p * 3 + c] / SPILL_SCALE)) * 255);
    data[p * 4 + 3] = 255;
  }
  return { data, w, h, x0, z0, texel };
}

/** A shop room's light through its glass: colour (linear) and power. */
export const ROOM_LIGHT: Record<Room, [number, number]> = {
  konbini: [0xe8f2ff, 1.25],
  drugstore: [0xeaf6ff, 1.1],
  electronics: [0xd8e8ff, 1.05],
  boutique: [0xffd8a8, 0.75],
  cafe: [0xffb870, 0.7],
  books: [0xfff0d0, 0.8],
  izakaya: [0xff9a50, 0.85],
  ramen: [0xffb060, 0.9],
  lobby: [0xd8ffe8, 0.45],
};

/** The light map as a texture and the ground's patch over it. */
export class Spill {
  readonly tex: THREE.DataTexture;
  readonly rect: THREE.Vector4;
  /**
   * Diffuse and gloss gains (DEV: 0 turns it off). Tuned on screenshots: the wet street's albedo is low
   * (a puddle's diffuse a fifth of the dry's), so a window's light shows at about 25x the bake's.
   */
  readonly gain = { value: new THREE.Vector2(30, 9) };

  constructor(map: SpillMap) {
    this.tex = new THREE.DataTexture(map.data, map.w, map.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.rect = new THREE.Vector4(map.x0, map.z0, 1 / (map.w * map.texel), 1 / (map.h * map.texel));
  }

  /**
   * Patches a street material to take the light (chains after any existing onBeforeCompile); `scale`
   * for a bright one (the white road paint would glow like a tube at the street's gain).
   */
  apply(mat: THREE.MeshStandardMaterial, scale = 1) {
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uSpillTex = { value: this.tex };
      sh.uniforms.uSpillRect = { value: this.rect };
      sh.uniforms.uSpillGain = this.gain;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSpillP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSpillP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSpillP;\nuniform sampler2D uSpillTex;\nuniform vec4 uSpillRect;\nuniform vec2 uSpillGain;')
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          {
            vec2 suv = (vSpillP.xz - uSpillRect.xy) * uSpillRect.zw;
            vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            float on = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0)
              * smoothstep(0.7, 0.9, dot(geometryNormal, upV)) * (1.0 - smoothstep(0.4, 0.6, vSpillP.y));
            vec3 sp = texture2D(uSpillTex, clamp(suv, 0.0, 1.0)).rgb;
            sp = sp * sp * ${(SPILL_SCALE * scale).toFixed(2)} * on;
            // A soft ceiling: right at the glass the light would white the pavement out (the edges keep theirs).
            vec3 sd = sp * uSpillGain.x;
            sd = sd / (1.0 + sd / 3.5);
            reflectedLight.directDiffuse += sd * diffuseColor.rgb;
            // The wet's gloss of it: the smoother, the more (the puddles mirror it), more at grazing angles.
            float gloss = pow(1.0 - clamp(material.roughness, 0.0, 1.0), 3.0);
            float fres = 0.04 + 0.96 * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 5.0);
            vec3 ss = sp * uSpillGain.y;
            reflectedLight.directSpecular += ss / (1.0 + ss / 3.0) * gloss * mix(0.12, 1.0, fres);
          }`,
        );
    };
    mat.customProgramCacheKey = () => `${prevKey()}|spill${scale}`;
    return mat;
  }
}
