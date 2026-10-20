import * as THREE from 'three';
import type { Glow } from './Glows';

/** Shared noise used by the ground shader and the reflection streaks so puddles line up. */
export const WET_NOISE_GLSL = /* glsl */ `
  float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 wHash2(vec2 p) { float n = wHash(p); return vec2(n, wHash(p + n * 17.0)); }
  float wNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
  }
  float wFbm(vec2 p) { return wNoise(p) * 0.55 + wNoise(p * 2.13 + 3.1) * 0.3 + wNoise(p * 4.7 + 8.3) * 0.15; }
  float puddleMask(vec2 xz) {
    float n = wFbm(xz * 0.16);
    return smoothstep(0.5, 0.58, n);
  }
`;

const RIPPLE_GLSL = /* glsl */ `
  // Expanding rain-drop rings on a hashed grid; returns an xz slope for the normal.
  vec2 rainRipples(vec2 p, float t) {
    vec2 acc = vec2(0.0);
    for (int l = 0; l < 2; l++) {
      float sc = l == 0 ? 2.4 : 3.7;
      vec2 q = p * sc + float(l) * 11.7;
      vec2 cell = floor(q);
      vec2 f = fract(q);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          vec2 h = wHash2(cell + o);
          float ph = fract(t * (0.9 + h.y * 0.6) + h.x * 13.0);
          vec2 v = f - (o + h);
          float d = length(v);
          float r = ph * 0.75;
          float x = clamp((d - r) * 28.0, -3.14159, 3.14159);
          float w = sin(x) * (1.0 - ph) * (1.0 - ph) * step(-3.1415, x) * step(x, 3.1415);
          acc += v / max(d, 1e-3) * w;
        }
      }
    }
    return acc;
  }
`;

/**
 * 4.0 wet model on (1) or the 3.7 one (0), shared by every wet material (DEV comparison, F8).
 * 4.0: a noise-driven roughness field. Puddles are mirror-flat (roughness → 0.02, a touch of
 * metalness so their diffuse drops and the reflection carries them), a damp ring round each puddle
 * (~0.32), dry patches at ~0.6 with grain. The same noise as the reflection streaks, so they line up.
 */
export const WET4 = { value: 1 };

/** Reflection catchers (see ReflectionCatchers.ts): up to this many, evaluated only by wet ground. */
export const MAX_CATCHERS = 8;
/**
 * Their positions (world) and colours × intensity (0 = unused), shared by every wet material and
 * written once a frame. Range: the cutoff distance, as a PointLight's `distance`.
 */
export const CATCHERS = {
  pos: { value: Array.from({ length: MAX_CATCHERS }, () => new THREE.Vector3(0, -1e4, 0)) },
  col: { value: Array.from({ length: MAX_CATCHERS }, () => new THREE.Vector3()) },
  range: { value: 11 },
  /** Source radius (m): the lobe is widened as for a sphere light of this size (a sign, not a point). */
  radius: { value: 1.2 },
};

export interface WetOptions {
  puddles: boolean;
  /** Overall wetness for non-puddle areas. */
  wet: number;
}

/** Patches a MeshStandardMaterial into rain-soaked asphalt/concrete with puddles and animated ripples. */
export function applyWet(mat: THREE.MeshStandardMaterial, time: { value: number }, opts: WetOptions) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uWet4 = WET4;
    shader.uniforms.uCatchPos = CATCHERS.pos;
    shader.uniforms.uCatchCol = CATCHERS.col;
    shader.uniforms.uCatchRange = CATCHERS.range;
    shader.uniforms.uCatchRadius = CATCHERS.radius;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWetPos;
        uniform float uTime;
        uniform float uWet4;
        uniform vec3 uCatchPos[${MAX_CATCHERS}];
        uniform vec3 uCatchCol[${MAX_CATCHERS}];
        uniform float uCatchRange, uCatchRadius;
        ${WET_NOISE_GLSL}
        ${RIPPLE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float camDist = length(vWetPos - cameraPosition);
        float wetN = wFbm(vWetPos.xz * 0.16);
        float puddle = ${opts.puddles ? 'smoothstep(0.5, 0.58, wetN)' : '0.0'};
        float damp = smoothstep(0.36, 0.52, wetN);
        diffuseColor.rgb *= mix(${(1 - opts.wet * 0.45).toFixed(3)}, 0.22, puddle);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float rough37 = mix(roughnessFactor * ${(1 - opts.wet * 0.5).toFixed(3)}, 0.035, puddle);
        float dry4 = 0.6 + (wNoise(vWetPos.xz * 1.7) - 0.5) * 0.14;
        float rough4 = mix(mix(dry4, 0.32, damp), 0.02, puddle);
        roughnessFactor = mix(rough37, rough4, uWet4);
        // Fight specular aliasing far away.
        roughnessFactor = max(roughnessFactor, smoothstep(10.0, 60.0, camDist) * 0.25);`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Reflection catchers: point lights, specular only, on wet ground only (the same GGX lobe and
        // falloff three.js uses for a PointLight with decay 2 and this cutoff). The lobe is widened
        // as for a sphere light (Karis 2013: alpha' = alpha + radius / (2 distance)), without the
        // energy renormalisation: a sign is a large source, and a mirror puddle should show a patch
        // of its colour, not a pinpoint.
        if (uWet4 > 0.0) {
          PhysicalMaterial cm = material;
          for (int i = 0; i < ${MAX_CATCHERS}; i++) {
            vec3 lVec = (viewMatrix * vec4(uCatchPos[i], 1.0)).xyz - geometryPosition;
            float dist = length(lVec);
            if (dist > uCatchRange || dot(uCatchCol[i], uCatchCol[i]) == 0.0) continue;
            vec3 L = lVec / dist;
            float a2 = clamp(pow2(material.roughness) + uCatchRadius / (2.0 * dist), 0.0, 1.0);
            cm.roughness = sqrt(a2);
            vec3 irr = saturate(dot(geometryNormal, L)) * uCatchCol[i] * getDistanceAttenuation(dist, uCatchRange, 2.0);
            reflectedLight.directSpecular += irr * BRDF_GGX(L, geometryViewDir, geometryNormal, cm) * uWet4;
          }
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.15, puddle * uWet4);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float fade = 1.0 - smoothstep(6.0, 26.0, camDist);
          vec2 rip = rainRipples(vWetPos.xz, uTime) * fade * (0.25 + puddle * 0.9);
          float n1 = wNoise(vWetPos.xz * 3.0 + vec2(0.0, uTime * 0.35));
          float n2 = wNoise(vWetPos.xz * 3.0 + vec2(1.3, 0.0));
          vec2 grain = (vec2(n1, n2) - 0.5) * (1.0 - puddle) * 0.25;
          vec3 pert = vec3(rip.x * 0.5 + grain.x, 0.0, rip.y * 0.5 + grain.y);
          normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `wet-${opts.puddles}-${opts.wet}`;
}

/** Stretched, rippling reflection streaks: the Blade Runner smear of neon on wet asphalt. */
export function createStreak(g: Glow, time: { value: number }, fog: THREE.FogExp2): THREE.Mesh {
  const r = g.reflect!;
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 0.5); // extends along +z from the anchor
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: r.map },
      uHasMap: { value: r.map ? 1 : 0 },
      uColor: { value: g.color.clone().multiplyScalar(g.base) },
      uIntensity: { value: 1 },
      uTime: time,
      uFogColor: { value: fog.color },
      uFogDensity: { value: fog.density },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vW;
      varying float vDist;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHasMap, uIntensity, uTime, uFogDensity;
      uniform vec3 uColor, uFogColor;
      varying vec2 vUv;
      varying vec3 vW;
      varying float vDist;
      ${WET_NOISE_GLSL}
      void main() {
        float along = 1.0 - vUv.y; // 0 at anchor
        float wob = (wNoise(vec2(vW.x * 2.0, vW.z * 0.6 - uTime * 1.5)) - 0.5) * 0.25;
        float across = vUv.x + wob * (0.4 + along);
        float edge = smoothstep(0.0, 0.3, across) * (1.0 - smoothstep(0.7, 1.0, across));
        vec3 c = vec3(1.0);
        if (uHasMap > 0.5) {
          vec2 suv = vec2(clamp(across, 0.02, 0.98), clamp(1.0 - along * 1.4, 0.02, 0.98));
          c = texture2D(uMap, suv).rgb * 1.8 + 0.12;
        }
        float puddle = puddleMask(vW.xz);
        float fall = pow(1.0 - along, 1.6);
        // Broken into horizontal bands like real ripple-scattered reflections.
        float bands = 0.6 + 0.4 * wNoise(vec2(vW.x * 0.5, vW.z * 5.0 + uTime * 0.7));
        // Fade out under the viewer's feet, where the real reflection would sit far below the horizon.
        float nearFade = smoothstep(1.5, 6.0, vDist);
        float k = fall * edge * bands * mix(0.22, 1.0, puddle) * uIntensity * nearFade;
        float fogF = exp(-uFogDensity * uFogDensity * vDist * vDist);
        gl_FragColor = vec4(c * uColor * k * fogF * 0.55, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(r.anchor);
  mesh.position.y = r.anchor.y + 0.015;
  mesh.scale.set(r.width, 1, r.length);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  g.streakMat = mat;
  return mesh;
}

/** Keeps every streak pointing from its source towards the viewer (reflections follow the eye). */
export function updateStreaks(streaks: THREE.Mesh[], cam: THREE.Vector3) {
  for (const s of streaks) {
    const dx = cam.x - s.position.x;
    const dz = cam.z - s.position.z;
    s.rotation.y = Math.atan2(dx, dz);
  }
}
