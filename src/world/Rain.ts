import * as THREE from 'three';
import { GLOW_GLSL, type Glows } from './Glows';

const HASH_GLSL = /* glsl */ `
  vec2 rHash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
`;

export const MAX_AREAS = 16;

/** Rain-relevant geometry: where rain is blocked, where it lands above the ground, and open ground. */
export interface RainAreas {
  open: [number, number, number, number][];
  surfaces: { x0: number; z0: number; x1: number; z1: number; y: number }[];
  shelters: { x0: number; z0: number; x1: number; z1: number; y: number }[];
}

/** Shelter and surface tests shared by rain and splashes (walkways and the overpass keep what's below dry). */
const AREA_GLSL = /* glsl */ `
  uniform vec4 uShel[${MAX_AREAS}]; // xmin, zmin, xmax, zmax
  uniform float uShelY[${MAX_AREAS}];
  uniform vec4 uSurf[${MAX_AREAS}];
  uniform float uSurfY[${MAX_AREAS}];
  uniform vec4 uOpen[${MAX_AREAS}];
  float inRect(vec2 p, vec4 r) { return step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.y) * step(p.y, r.w); }
  float sheltered(vec3 p) {
    float s = 0.0;
    for (int i = 0; i < ${MAX_AREAS}; i++) s = max(s, inRect(p.xz, uShel[i]) * step(p.y, uShelY[i]));
    return s;
  }
  // Ground plus anything raised that rain lands on (walkway decks, kerbs).
  float groundY(vec2 p) {
    float y = 0.02;
    for (int i = 0; i < ${MAX_AREAS}; i++) y = max(y, inRect(p, uSurf[i]) * (uSurfY[i] + 0.01));
    return y;
  }
  float openGround(vec2 p) {
    float o = 0.0;
    for (int i = 0; i < ${MAX_AREAS}; i++) o = max(o, inRect(p, uOpen[i]));
    for (int i = 0; i < ${MAX_AREAS}; i++) o = max(o, inRect(p, uSurf[i]));
    return o;
  }
`;

const rectArray = (list: { x0: number; z0: number; x1: number; z1: number }[] | [number, number, number, number][]) =>
  Array.from({ length: MAX_AREAS }, (_, i) => {
    const r = list[i];
    if (!r) return new THREE.Vector4(1e5, 1e5, -1e5, -1e5);
    return Array.isArray(r) ? new THREE.Vector4(r[0], r[1], r[2], r[3]) : new THREE.Vector4(r.x0, r.z0, r.x1, r.z1);
  });

export class Rain {
  uniforms: Record<string, THREE.IUniform>;
  meshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, glows: Glows, time: { value: number }, fog: THREE.FogExp2, areas: RainAreas) {
    if (areas.shelters.length > MAX_AREAS || areas.surfaces.length > MAX_AREAS || areas.open.length > MAX_AREAS) {
      console.warn('Rain: too many areas, extra ones ignored');
    }
    this.uniforms = {
      uTime: time,
      uCam: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector2(1.2, 0.4) },
      uFogDensity: { value: fog.density },
      uShel: { value: rectArray(areas.shelters) },
      uShelY: { value: Array.from({ length: MAX_AREAS }, (_, i) => areas.shelters[i]?.y ?? -1e5) },
      uSurf: { value: rectArray(areas.surfaces) },
      uSurfY: { value: Array.from({ length: MAX_AREAS }, (_, i) => areas.surfaces[i]?.y ?? 0) },
      uOpen: { value: rectArray(areas.open) },
      uIntensity: { value: 1 },
      ...glows.uniforms,
    };
    this.meshes.push(this.buildDrops(), this.buildRings(), this.buildCrowns());
    for (const m of this.meshes) scene.add(m);
  }

  private instanced(count: number, seedFn: (i: number, arr: Float32Array) => void) {
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const seeds = new Float32Array(count * 4);
    const tmp = new Float32Array(4);
    for (let i = 0; i < count; i++) {
      seedFn(i, tmp);
      seeds.set(tmp, i * 4);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    return geo;
  }

  /** ~14k streaks, wrapped around the camera entirely on the GPU: one draw call, zero CPU. */
  private buildDrops() {
    const geo = this.instanced(14000, (_i, a) => {
      a[0] = Math.random();
      a[1] = Math.random();
      a[2] = Math.random();
      a[3] = Math.random();
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uFogDensity, uIntensity;
        uniform vec3 uCam;
        uniform vec2 uWind;
        varying float vAlpha;
        varying vec3 vCol;
        varying vec2 vUv;
        ${GLOW_GLSL}
        ${AREA_GLSL}
        void main() {
          vec3 box = vec3(34.0, 22.0, 34.0);
          float speed = 0.8 + aSeed.w * 0.45;
          vec3 vel = vec3(uWind.x, -13.0, uWind.y) * speed;
          vec3 raw = aSeed.xyz * box + vel * uTime;
          vec3 p;
          p.x = uCam.x + mod(raw.x - uCam.x, box.x) - box.x * 0.5;
          p.z = uCam.z + mod(raw.z - uCam.z, box.z) - box.z * 0.5;
          p.y = mod(raw.y, box.y) - 0.5;
          vec3 dir = normalize(vel);
          float len = 0.45 + aSeed.w * 0.6;
          // Build the streak in view space: long axis along the fall direction, width across it on screen.
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vec3 dV = (viewMatrix * vec4(dir, 0.0)).xyz;
          vec2 perp = vec2(-dV.y, dV.x);
          perp = dot(perp, perp) > 1e-6 ? normalize(perp) : vec2(1.0, 0.0);
          float dist = -mv.z;
          float width = 0.008 + abs(dist) * 0.0012; // keep distant drops from vanishing to sub-pixel
          mv.xyz -= dV * position.y * len;
          mv.xy += perp * position.x * width;
          vUv = uv;
          float near = smoothstep(0.5, 2.8, dist);
          float fogF = exp(-uFogDensity * uFogDensity * dist * dist * 0.7);
          float alive = (1.0 - sheltered(p)) * step(groundY(p.xz) - 0.02, p.y);
          vAlpha = near * fogF * alive * uIntensity;
          vCol = vec3(0.16, 0.17, 0.22) + glowLight(p) * 2.2;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vCol;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
          float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
          float a = across * along * vAlpha;
          gl_FragColor = vec4(vCol * a * 1.05, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    return mesh;
  }

  /** Expanding rings where drops hit the ground. Lifecycle hashed from time, so no CPU either. */
  private buildRings() {
    const geo = this.instanced(900, (i, a) => {
      a[0] = Math.random() * 100;
      a[1] = Math.random() * 100;
      a[2] = i;
      a[3] = Math.random();
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uFogDensity, uIntensity;
        uniform vec3 uCam;
        varying float vAlpha;
        varying float vPh;
        varying vec3 vCol;
        varying vec2 vUv;
        ${GLOW_GLSL}
        ${HASH_GLSL}
        ${AREA_GLSL}
        void main() {
          float period = 0.55;
          float t = uTime / period + aSeed.w;
          float cyc = floor(t);
          float ph = fract(t);
          vec2 h = rHash2(aSeed.xy + cyc * 1.37);
          vec3 p = vec3(uCam.x + (h.x - 0.5) * 26.0, 0.0, uCam.z + (h.y - 0.5) * 26.0);
          p.y = groundY(p.xz) + 0.005;
          float size = 0.04 + ph * 0.22;
          vec2 q = (position.xy - vec2(0.0, 0.5)) * 2.0 * size;
          vec3 wp = p + vec3(q.x, 0.0, q.y);
          vUv = uv;
          vPh = ph;
          float dist = length(cameraPosition - p);
          float fogF = exp(-uFogDensity * uFogDensity * dist * dist);
          vAlpha = fogF * openGround(p.xz) * (1.0 - sheltered(p)) * uIntensity;
          vCol = vec3(0.12, 0.13, 0.17) + glowLight(p + vec3(0.0, 0.5, 0.0)) * 1.2;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vPh;
        varying vec3 vCol;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.75, 0.9, d) * (1.0 - smoothstep(0.92, 1.0, d));
          float a = ring * (1.0 - vPh) * vAlpha;
          gl_FragColor = vec4(vCol * a * 0.8, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  }

  /** Tiny upward crowns of spray at the moment of impact. */
  private buildCrowns() {
    const geo = this.instanced(700, (i, a) => {
      a[0] = Math.random() * 100;
      a[1] = Math.random() * 100;
      a[2] = i;
      a[3] = Math.random();
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uFogDensity, uIntensity;
        uniform vec3 uCam;
        varying float vAlpha;
        varying vec3 vCol;
        varying vec2 vUv;
        ${GLOW_GLSL}
        ${HASH_GLSL}
        ${AREA_GLSL}
        void main() {
          float period = 0.4;
          float t = uTime / period + aSeed.w;
          float cyc = floor(t);
          float ph = fract(t);
          vec2 h = rHash2(aSeed.xy * 1.7 + cyc * 2.11);
          vec3 p = vec3(uCam.x + (h.x - 0.5) * 18.0, 0.0, uCam.z + (h.y - 0.5) * 18.0);
          p.y = groundY(p.xz);
          float life = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.1, 0.3, ph));
          vec3 toCam = cameraPosition - p;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
          float s = 0.05 + ph * 0.14;
          vec3 wp = p + right * position.x * s * 1.6 + vec3(0.0, position.y * s, 0.0);
          vUv = uv;
          float dist = length(toCam);
          float fogF = exp(-uFogDensity * uFogDensity * dist * dist);
          vAlpha = life * fogF * openGround(p.xz) * (1.0 - sheltered(p)) * smoothstep(0.5, 2.0, dist) * uIntensity;
          vCol = vec3(0.14, 0.15, 0.2) + glowLight(p + vec3(0.0, 0.5, 0.0)) * 1.4;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vCol;
        varying vec2 vUv;
        void main() {
          // A fan of droplets.
          vec2 c = vUv - vec2(0.5, 0.0);
          float ang = atan(c.x, c.y);
          float r = length(c);
          float rays = pow(max(0.0, cos(ang * 7.0)), 8.0);
          float a = rays * (1.0 - smoothstep(0.2, 0.55, r)) * smoothstep(0.0, 0.15, r) * step(abs(ang), 1.2) * vAlpha;
          gl_FragColor = vec4(vCol * a * 1.2, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  update(t: number, camPos: THREE.Vector3) {
    this.uniforms.uCam.value.copy(camPos);
    // Gusts.
    const g = Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.53 + 1.3) * 0.4;
    this.uniforms.uWind.value.set(1.0 + g * 1.4, 0.35 + g * 0.3);
  }
}

/** GPU steam plumes rising from street vents, lit by nearby neon. */
export class Steam {
  mesh: THREE.Mesh;
  constructor(scene: THREE.Scene, glows: Glows, time: { value: number }, emitters: THREE.Vector4[], tex: THREE.Texture, fog: THREE.FogExp2) {
    const perEmitter = 26;
    const count = emitters.length * perEmitter;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const emit = new Float32Array(count * 4);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const e = emitters[Math.floor(i / perEmitter)];
      emit.set([e.x, e.y, e.z, e.w], i * 4);
      seed.set([(i % perEmitter) / perEmitter + Math.random() * 0.02, Math.random()], i * 2);
    }
    geo.setAttribute('aEmit', new THREE.InstancedBufferAttribute(emit, 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uMap: { value: tex }, uFogDensity: { value: fog.density }, ...glows.uniforms },
      vertexShader: /* glsl */ `
        attribute vec4 aEmit;
        attribute vec2 aSeed;
        uniform float uTime, uFogDensity;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vCol;
        varying float vRot;
        ${GLOW_GLSL}
        void main() {
          float life = 4.0;
          float ph = fract(uTime / life + aSeed.x);
          vec3 p = aEmit.xyz;
          float rise = ph * (2.5 + aSeed.y * 1.5) * aEmit.w;
          p.y += rise;
          p.x += sin(ph * 3.0 + aSeed.y * 6.28) * 0.4 * ph + ph * ph * 1.2;
          p.z += cos(ph * 2.0 + aSeed.y * 6.28) * 0.4 * ph + ph * 0.4;
          float size = (0.5 + ph * 2.6) * mix(0.6, 1.0, aEmit.w);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float c = cos(aSeed.y * 6.28 + ph), s = sin(aSeed.y * 6.28 + ph);
          vec2 q = mat2(c, -s, s, c) * position.xy * size;
          mv.xy += q;
          vUv = uv;
          float dist = -mv.z;
          float fogF = exp(-uFogDensity * uFogDensity * dist * dist * 0.8);
          vAlpha = sin(ph * 3.14159) * 0.55 * fogF * smoothstep(0.4, 2.5, dist);
          vCol = vec3(0.09, 0.09, 0.12) + glowLight(p) * 0.9;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vCol;
        void main() {
          float a = texture2D(uMap, vUv).a * vAlpha;
          gl_FragColor = vec4(vCol * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }
}
