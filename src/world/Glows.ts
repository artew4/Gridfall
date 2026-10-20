import * as THREE from 'three';
import { glowTexture } from './Textures';
import { heldNoise } from '../core/math';

export type FlickerMode = 'steady' | 'flicker' | 'broken' | 'blink' | 'buzz';

export interface Glow {
  pos: THREE.Vector3;
  color: THREE.Color;
  /** Influence radius for particle lighting. */
  radius: number;
  /** Base brightness multiplier. */
  base: number;
  /** Current brightness 0..1 (after flicker). */
  value: number;
  mode: FlickerMode;
  seed: number;
  materials: { mat: THREE.Material & { color: THREE.Color }; base: THREE.Color }[];
  light?: THREE.PointLight;
  lightBase: number;
  haloSize: number;
  haloStrength: number;
  /** Reflection streak on the wet street. */
  reflect?: { width: number; anchor: THREE.Vector3; length: number; map: THREE.Texture | null };
  streakMat?: THREE.ShaderMaterial;
  onChange?: (v: number) => void;
}

export const MAX_GLOWS = 12;

/** Shared GLSL for particles (rain, splashes, steam) lit by the nearest neon sources. */
export const GLOW_GLSL = /* glsl */ `
  uniform vec4 uGlowPos[${MAX_GLOWS}];
  uniform vec3 uGlowCol[${MAX_GLOWS}];
  vec3 glowLight(vec3 p) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < ${MAX_GLOWS}; i++) {
      vec3 d = p - uGlowPos[i].xyz;
      float r = uGlowPos[i].w;
      float a = max(0.0, 1.0 - dot(d, d) / (r * r));
      s += uGlowCol[i] * a * a;
    }
    return s;
  }
`;

/**
 * Registry of every emissive light source in the street. Drives flicker (sign material, real light,
 * reflection streak, halo and hum stay in sync) and feeds the nearest sources to particle shaders.
 */
export class Glows {
  list: Glow[] = [];
  uniforms = {
    uGlowPos: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, -100, 0, 1)) },
    uGlowCol: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3()) },
  };
  private halos!: THREE.Mesh;
  private haloGeo!: THREE.InstancedBufferGeometry;
  private sorted: Glow[] = [];

  add(g: Partial<Glow> & { pos: THREE.Vector3; color: THREE.Color }): Glow {
    const glow: Glow = {
      radius: 6,
      base: 1,
      value: 1,
      mode: 'steady',
      seed: Math.random() * 100,
      materials: [],
      lightBase: g.light ? g.light.intensity : 0,
      haloSize: 2.5,
      haloStrength: 0.35,
      ...g,
    };
    this.list.push(glow);
    return glow;
  }

  /** Builds one instanced draw call of soft additive halos (fake volumetric scattering in the rain). */
  buildHalos(scene: THREE.Scene) {
    const n = this.list.length;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const offs = new Float32Array(n * 4);
    const cols = new Float32Array(n * 3);
    this.list.forEach((g, i) => {
      offs.set([g.pos.x, g.pos.y, g.pos.z, g.haloSize], i * 4);
    });
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 4));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(cols, 3));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, fogDensity: { value: 0.03 } },
      vertexShader: /* glsl */ `
        attribute vec4 aOffset;
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vFade;
        uniform float fogDensity;
        void main() {
          vec4 mv = modelViewMatrix * vec4(aOffset.xyz, 1.0);
          float dist = -mv.z;
          // Shrink when very close so halos don't wash the whole screen.
          float near = smoothstep(0.5, 4.0, dist);
          mv.xy += position.xy * aOffset.w;
          vUv = uv;
          vColor = aColor;
          float f = fogDensity * dist;
          vFade = near * exp(-f * f * 0.6);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, vUv).a;
          gl_FragColor = vec4(vColor * a * vFade, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halos = new THREE.Mesh(geo, mat);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 5;
    this.haloGeo = geo;
    scene.add(this.halos);
  }

  flickerValue(g: Glow, t: number): number {
    const s = g.seed;
    switch (g.mode) {
      case 'steady':
        return 0.96 + 0.04 * Math.sin(t * 50 + s);
      case 'buzz':
        return 0.9 + 0.1 * Math.sin(t * 120 + s) * Math.sin(t * 3.1 + s);
      case 'blink':
        return Math.sin(t * 3.0 + s) > 0 ? 1 : 0.05;
      case 'flicker': {
        // Mostly on, with occasional bursts of stutter.
        const burst = Math.sin(t * 0.37 + s) * Math.sin(t * 0.13 + s * 2.0);
        if (burst > 0.55) return heldNoise(t, s) < 0.5 ? 0.15 : 1;
        return 0.95 + 0.05 * Math.sin(t * 60 + s);
      }
      case 'broken': {
        const phase = (t * 0.6 + s) % 7;
        if (phase < 0.25) return heldNoise(t, s) < 0.6 ? 0.05 : 0.8;
        if (phase < 2.5 && phase > 2.1) return 0.1;
        return 0.85 + heldNoise(t, s + 0.5) * 0.15;
      }
    }
  }

  update(t: number, camPos: THREE.Vector3) {
    const cols = this.haloGeo?.getAttribute('aColor') as THREE.InstancedBufferAttribute | undefined;
    const offs = this.haloGeo?.getAttribute('aOffset') as THREE.InstancedBufferAttribute | undefined;
    this.list.forEach((g, i) => {
      const v = this.flickerValue(g, t);
      g.value = v;
      for (const m of g.materials) m.mat.color.copy(m.base).multiplyScalar(v);
      if (g.light) g.light.intensity = g.lightBase * v;
      if (g.streakMat) g.streakMat.uniforms.uIntensity.value = v;
      g.onChange?.(v);
      if (!cols || !offs) return;
      const k = v * g.haloStrength;
      cols.setXYZ(i, g.color.r * k, g.color.g * k, g.color.b * k);
      offs.setXYZ(i, g.pos.x, g.pos.y, g.pos.z);
    });
    if (cols && offs) cols.needsUpdate = offs.needsUpdate = true;

    // Nearest sources feed the particle lighting uniforms.
    this.sorted = this.list.slice().sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    const P = this.uniforms.uGlowPos.value;
    const C = this.uniforms.uGlowCol.value;
    for (let i = 0; i < MAX_GLOWS; i++) {
      const g = this.sorted[i];
      if (!g) {
        P[i].set(0, -100, 0, 1);
        C[i].set(0, 0, 0);
        continue;
      }
      P[i].set(g.pos.x, g.pos.y, g.pos.z, g.radius);
      const k = g.value * g.base;
      C[i].set(g.color.r * k, g.color.g * k, g.color.b * k);
    }
  }
}
