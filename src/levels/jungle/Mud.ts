import * as THREE from 'three';
import { WET_NOISE_GLSL } from '../../world/Ground';

/**
 * Where the wheel ruts run in the compound: segments (x0, z0, x1, z1) of the vehicle track, each
 * worn as two ruts 1.7 m apart. Gate → yard, then off to the motor pool and the supply depot.
 */
export const YARD_TRACKS: [number, number, number, number][] = [
  [0, 12, 0, -2.5],
  [0, -2.5, -12, -13.5],
  [0, -2.5, 11, -13],
];

/** Which rut layout a ground material carries. */
export type MudKind = 'forest' | 'road' | 'yard';

/**
 * 4.2 "cheap wet asphalt", jungle edition: a computed roughness field on the ground materials, no
 * texture. One noise (world xz) makes muddy patches (darker, roughness ~0.45) with standing water in
 * their middles (~0.1); the ruts (along the road's texture across-coordinate, or along YARD_TRACKS in
 * the compound) are wet mud with water lying in their low stretches. Dry litter and gravel keep the
 * material's own roughness. `on` is the level's switch (1 = 4.2, 0 = the 3.7 ground; F8).
 */
export function applyMud(mat: THREE.MeshStandardMaterial, on: { value: number }, kind: MudKind) {
  const rut =
    kind === 'road'
      ? // The road texture has its ruts at u 0.17..0.36 and 0.64..0.83 (across the 6 m track).
        `float u = vMapUv.x;
        float rut = smoothstep(0.17, 0.23, u) * (1.0 - smoothstep(0.31, 0.37, u)) + smoothstep(0.63, 0.69, u) * (1.0 - smoothstep(0.77, 0.83, u));`
      : kind === 'yard'
        ? `float rut = 0.0;
        for (int i = 0; i < ${YARD_TRACKS.length}; i++) {
          vec4 s = uTracks[i];
          vec2 ab = s.zw - s.xy;
          vec2 ap = vMudPos.xz - s.xy;
          float h = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(ap - ab * h);
          rut = max(rut, 1.0 - smoothstep(0.12, 0.32, abs(d - 0.85)));
        }
        rut *= 0.55 + 0.45 * wNoise(vMudPos.xz * 0.9);`
        : `float rut = 0.0;`;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uMud4 = on;
    shader.uniforms.uTracks = { value: YARD_TRACKS.map((t) => new THREE.Vector4(...t)) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMudPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMudPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMudPos;
        uniform float uMud4;
        uniform vec4 uTracks[${YARD_TRACKS.length}];
        ${WET_NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float mudN = wFbm(vMudPos.xz * 0.11 + 7.0);
        float mud = smoothstep(0.44, 0.58, mudN);
        float pool = smoothstep(0.58, 0.64, mudN);
        ${rut}
        // Water lies in the low stretches of a rut.
        float rutPool = rut * smoothstep(0.45, 0.6, wNoise(vMudPos.xz * 0.35 + 3.0));
        float wetM = max(mud, rut) * uMud4;
        float mirror = max(pool, rutPool) * uMud4;
        diffuseColor.rgb *= mix(1.0, mix(0.6, 0.32, mirror / max(wetM, 1e-3)), wetM);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.45, 0.1, mirror / max(wetM, 1e-3)), wetM);
        // Fight specular aliasing far away.
        roughnessFactor = max(roughnessFactor, smoothstep(12.0, 60.0, length(vMudPos - cameraPosition)) * 0.3 * uMud4);`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        // The env is the misty canopy light (a flat, dim colour at the level's low intensity): wet
        // mud and standing water reflect more of it, so they read as a sheen of the fog, not as dark
        // patches.
        #if defined( RE_IndirectSpecular )
          radiance *= 1.0 + wetM * 0.5 + mirror * 1.4;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => 'mud-' + kind;
}
