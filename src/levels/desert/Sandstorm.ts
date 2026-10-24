import * as THREE from 'three';
import { clamp, lerp, rand, smoothstep } from '../../core/math';
import { dustTexture } from './textures';
import type { Interior } from './Outpost';

/** Fog density in clear air and at the height of a storm (FogExp2). */
const CLEAR_DENSITY = 0.0045;
const STORM_DENSITY = 0.062;
/** Distance at which FogExp2 hides 90% of a surface: sqrt(ln 10) / density. */
const HIDE_90 = Math.sqrt(Math.log(10));
/** Interiors the dust shader keeps out of (12.0: eight with the culvert). */
// 46.0: 20 (the flank houses: six more).
const MAX_ROOMS = 20;

type Phase = 'calm' | 'rising' | 'peak' | 'easing';

/**
 * Phase durations (s, drawn per cycle). 12.0: the storm is the map's normal state, clear air the
 * exception: a long peak (70–100 s), quick fronts either side, and only a brief calm (8–14 s) — about
 * nine tenths of every cycle is dust. (4.0–11.0: calm 40–65 s, peak 35–55 s, fronts 16–24 s.)
 */
export const STORM_TIMING: Record<Phase, [number, number]> = {
  calm: [8, 14],
  rising: [10, 14],
  peak: [70, 100],
  easing: [8, 12],
};

/**
 * The storm cycle: calm, a rising wall of dust, the peak, easing off; durations vary every cycle.
 * Intensity 0..1 drives everything else (fog, light, wind, particles, audio, enemy sight range).
 */
export class StormClock {
  phase: Phase = 'calm';
  private t = 0;
  private dur = STORM_TIMING.calm[1];
  intensity = 0.05;
  /** Wind (m/s) on the ground plane. Prevailing from the west, veering slowly. */
  wind = new THREE.Vector3(5, 0, 0);
  private heading = 0;
  private peakLevel = 1;

  update(dt: number) {
    this.t += dt;
    if (this.t >= this.dur) {
      this.t = 0;
      const next: Record<Phase, Phase> = { calm: 'rising', rising: 'peak', peak: 'easing', easing: 'calm' };
      this.phase = next[this.phase];
      this.dur = rand(...STORM_TIMING[this.phase]);
      if (this.phase === 'rising') this.peakLevel = rand(0.88, 1);
    }
    const k = this.t / this.dur;
    const calm = 0.06;
    this.intensity =
      this.phase === 'calm' ? calm : this.phase === 'rising' ? lerp(calm, this.peakLevel, smoothstep(0, 1, k)) : this.phase === 'peak' ? this.peakLevel - 0.06 * Math.sin(k * Math.PI * 3) ** 2 : lerp(this.peakLevel, calm, smoothstep(0, 1, k));
    this.heading += dt * 0.02;
    const dir = Math.sin(this.heading) * 0.5;
    const speed = 3 + this.intensity * 15;
    this.wind.set(Math.cos(dir) * speed, 0, Math.sin(dir) * speed);
  }

  /** Jump to a moment of the cycle (dev, intro). */
  set(phase: Phase, intensity?: number) {
    this.phase = phase;
    this.t = 0;
    const [lo, hi] = STORM_TIMING[phase];
    this.dur = (lo + hi) / 2;
    if (intensity !== undefined) this.intensity = intensity;
  }
}

/** Colours (linear) for clear air and the heart of the storm. */
const HAZE = new THREE.Color('#d9c4a2');
const DUST = new THREE.Color('#9c7148');
/** Blown grains read lighter than the dust they fly through. */
const GRAIN = new THREE.Color('#f3e2c2');

/**
 * Everything you see of the weather: sky dome, fog, sand grains, dust sheets. Interiors are passed in
 * so no grain or sheet is drawn inside a building (you see the storm through doors and windows).
 */
export class Sandstorm {
  clock = new StormClock();
  /** Distance (m) beyond which a figure is hidden by the dust (90% fog). */
  visibility = 300;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private grains: THREE.Mesh;
  private grainMat: THREE.ShaderMaterial;
  private sheets: THREE.InstancedMesh;
  private sheetMat: THREE.ShaderMaterial;
  private haze = new THREE.Color();

  constructor(scene: THREE.Scene, private fog: THREE.FogExp2, sunDir: THREE.Vector3, interiors: Interior[]) {
    // Sky: horizon haze to deep blue, a sun the dust swallows.
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color('#3f74b8') },
        uHorizon: { value: new THREE.Color('#e3d2b4') },
        uGround: { value: new THREE.Color('#bfa27a') },
        uDust: { value: new THREE.Color() },
        uSunDir: { value: sunDir.clone().normalize() },
        uSun: { value: new THREE.Color(1, 0.92, 0.78) },
        uStorm: { value: 0 },
        uGlare: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uGround, uDust, uSunDir, uSun;
        uniform float uStorm, uGlare;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, h));
          sky = mix(uGround, sky, smoothstep(-0.06, 0.03, h));
          float s = max(dot(d, uSunDir), 0.0);
          // 4.1 glare: a tight HDR corona round the disc (bloom turns it into the blinding sun).
          float sun = pow(s, 1400.0) * 30.0 + pow(s, 14.0) * 0.45 + pow(s, 220.0) * uGlare;
          sky += uSun * sun * (1.0 - uStorm * 0.9);
          float band = 1.0 - smoothstep(0.0, 0.3, abs(h));
          sky = mix(sky, uDust, clamp(uStorm * 0.95 + band * 0.18 * (1.0 - uStorm), 0.0, 1.0));
          gl_FragColor = vec4(sky, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Interiors as (min, max) pairs; y of max is the ceiling.
    const rooms = new Array(MAX_ROOMS * 2).fill(0).map(() => new THREE.Vector4(1e6, 0, 1e6, 0));
    interiors.slice(0, MAX_ROOMS).forEach((r, i) => {
      rooms[i * 2].set(r.x0, -50, r.z0, 0);
      rooms[i * 2 + 1].set(r.x1, r.h, r.z1, 0);
    });
    const roomGlsl = /* glsl */ `
      uniform vec4 uRooms[${MAX_ROOMS * 2}];
      bool indoors(vec3 p) {
        for (int i = 0; i < ${MAX_ROOMS}; i++) {
          vec4 a = uRooms[i * 2];
          vec4 b = uRooms[i * 2 + 1];
          if (p.x > a.x && p.x < b.x && p.z > a.z && p.z < b.z && p.y < b.y) return true;
        }
        return false;
      }`;

    // Sand grains: short streaks blown along the wind (stretched in view space, like the rain),
    // wrapped in a box around the camera, denser near the ground.
    const N = 7000;
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.pow(Math.random(), 1.8);
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
    }
    const streak = new THREE.PlaneGeometry(1, 1);
    streak.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = streak.index;
    g.setAttribute('position', streak.attributes.position);
    g.setAttribute('uv', streak.attributes.uv);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = N;
    this.grainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(56, 20, 56) },
        uColor: { value: new THREE.Color() },
        uRooms: { value: rooms },
        uGlint: { value: 0 },
        uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uStorm, uGlint;
        varying float vGlint;
        uniform vec3 uCam, uWind, uBox;
        varying float vA;
        varying vec2 vUv;
        varying float vTone;
        ${roomGlsl}
        void main() {
          vec3 origin = uCam - vec3(uBox.x * 0.5, 3.0, uBox.z * 0.5);
          float speed = 0.75 + aSeed.w * 0.5;
          vec3 vel = uWind * speed + vec3(0.0, sin(uTime * 1.9 + aSeed.w * 41.0) * 0.8 - 0.3, 0.0);
          vec3 p = mod(aSeed.xyz * uBox + vel * uTime - origin, uBox) + origin;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vec3 dV = (viewMatrix * vec4(normalize(vel + vec3(1e-4)), 0.0)).xyz;
          vec2 perp = vec2(-dV.y, dV.x);
          perp = dot(perp, perp) > 1e-6 ? normalize(perp) : vec2(1.0, 0.0);
          float dist = -mv.z;
          float len = (0.12 + length(uWind) * 0.035) * (0.6 + aSeed.w * 0.8);
          float width = 0.006 + dist * 0.0011;
          mv.xyz -= dV * position.y * len;
          mv.xy += perp * position.x * width;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vTone = aSeed.x;
          // 4.1: about 7% of the grains catch the sun and twinkle (time-based, frame-rate independent).
          float pick = step(0.93, fract(aSeed.w * 13.7 + aSeed.z * 5.1));
          vGlint = uGlint * pick * smoothstep(0.55, 1.0, sin(uTime * (6.0 + aSeed.z * 9.0) + aSeed.x * 60.0));
          vA = indoors(p) ? 0.0 : uStorm * smoothstep(0.5, 2.5, dist) * (1.0 - smoothstep(16.0, 27.0, dist));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uSunCol;
        varying float vA;
        varying vec2 vUv;
        varying float vTone;
        varying float vGlint;
        void main() {
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float tail = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
          float a = vA * edge * tail * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * (0.85 + vTone * 0.4) + uSunCol * vGlint, a);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.grains = new THREE.Mesh(g, this.grainMat);
    this.grains.frustumCulled = false;
    scene.add(this.grains);

    // Dust sheets: big soft billboards drifting through, the storm's volume.
    const S = 90;
    const quad = new THREE.PlaneGeometry(1, 1);
    const sseed = new Float32Array(S * 4);
    for (let i = 0; i < S; i++) {
      sseed[i * 4] = Math.random();
      sseed[i * 4 + 1] = Math.random();
      sseed[i * 4 + 2] = Math.random();
      sseed[i * 4 + 3] = Math.random();
    }
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sseed, 4));
    this.sheetMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(110, 14, 110) },
        uColor: { value: new THREE.Color() },
        uMap: { value: dustTexture() },
        uRooms: { value: rooms },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCam, uWind, uBox;
        varying vec2 vUv;
        varying float vFade;
        varying float vTone;
        ${roomGlsl}
        void main() {
          vTone = aSeed.w;
          vec3 origin = uCam - vec3(uBox.x * 0.5, 4.0, uBox.z * 0.5);
          vec3 c = mod(aSeed.xyz * uBox + uWind * uTime * (0.8 + aSeed.w * 0.4) - origin, uBox) + origin;
          float size = 9.0 + aSeed.w * 14.0;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = c + (right * position.x + up * position.y * 0.55) * size;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float d = length(c - uCam);
          vFade = indoors(c) ? 0.0 : smoothstep(3.0, 12.0, d) * (1.0 - smoothstep(40.0, 55.0, d));
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uStorm;
        varying vec2 vUv;
        varying float vFade;
        varying float vTone;
        void main() {
          float a = texture2D(uMap, vUv).r * vFade * uStorm * 0.9;
          if (a < 0.004) discard;
          // Some billows darker, some lighter than the haze: the dust visibly rolls through.
          gl_FragColor = vec4(uColor * (0.72 + vTone * 0.5), a);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.sheets = new THREE.InstancedMesh(quad, this.sheetMat, S);
    this.sheets.frustumCulled = false;
    const id = new THREE.Matrix4();
    for (let i = 0; i < S; i++) this.sheets.setMatrixAt(i, id);
    scene.add(this.sheets);
  }

  /** Advances the storm and applies it to fog, sky and particles. Returns the intensity. */
  update(dt: number, time: number, cam: THREE.PerspectiveCamera) {
    this.clock.update(dt);
    const s = this.clock.intensity;
    const density = lerp(CLEAR_DENSITY, STORM_DENSITY, Math.pow(s, 1.35));
    this.fog.density = density;
    this.visibility = Math.min(300, HIDE_90 / density);
    this.haze.copy(HAZE).lerp(DUST, smoothstep(0.05, 0.9, s));
    // The dust also darkens: less sun gets through.
    this.haze.multiplyScalar(1 - 0.35 * s);
    this.fog.color.copy(this.haze);

    this.sky.position.copy(cam.position);
    const su = this.skyMat.uniforms;
    su.uStorm.value = smoothstep(0.03, 0.85, s);
    (su.uDust.value as THREE.Color).copy(this.haze);

    const show = s > 0.08;
    this.grains.visible = show;
    this.sheets.visible = show;
    for (const u of [this.grainMat.uniforms, this.sheetMat.uniforms]) {
      u.uTime.value = time;
      u.uStorm.value = clamp((s - 0.08) / 0.92, 0, 1);
      (u.uCam.value as THREE.Vector3).copy(cam.position);
      (u.uWind.value as THREE.Vector3).copy(this.clock.wind);
    }
    (this.grainMat.uniforms.uColor.value as THREE.Color).copy(this.haze).lerp(GRAIN, 0.55).multiplyScalar(1.25);
    (this.sheetMat.uniforms.uColor.value as THREE.Color).copy(this.haze);
    return s;
  }

  /**
   * 4.1 look (true) or 3.7 (false): the sun's glare corona and the sun glints in the dust.
   * `sunVis` is how much sun gets through the dust (0..1).
   */
  setLook(v4: boolean, sunVis: number) {
    this.skyMat.uniforms.uGlare.value = v4 ? 6 : 0;
    this.grainMat.uniforms.uGlint.value = v4 ? 3.2 * sunVis : 0;
  }

  dispose() {
    (this.sheetMat.uniforms.uMap.value as THREE.Texture).dispose();
  }
}
