import * as THREE from 'three';

/** One light shaft: where it lands (the ground point) and its radius there. */
export interface Shaft {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Relative brightness. */
  k: number;
}

/**
 * 4.2 fake god rays: light shafts as geometry, not a screen-space effect. Each shaft is an
 * open-ended cone from the canopy down to the ground point, aimed away from the sun (so it lines up
 * with the sun's dapple projection, which gets a matching bright fleck there), drawn additive with
 * depthWrite off and depth test on (the world in front of a shaft hides it, nothing writes behind).
 *
 * The shader is a handful of ALU ops: the brightness of a shaft at a fragment is
 * - the edge falloff: |dot(normal, view)|, so the silhouette fades and the core reads as a volume;
 * - a fade along its length: in from the canopy, out near the ground;
 * - slow dust streaks drifting down it (two scrolling sines in the shaft's own coordinates);
 * - a near fade, so a shaft you walk through never washes over the screen;
 * - the scene fog (the far ones melt into the murk).
 *
 * No collision: the meshes are never added to the collision world, are tagged soft for the DEV
 * checks, and ignore three.js raycasts.
 */
export function buildGodRays(scene: THREE.Scene, sunPos: THREE.Vector3, shafts: Shaft[], color: THREE.Color, top = 34) {
  const group = new THREE.Group();
  group.name = 'godrays';
  group.userData.soft = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: color.clone() }, uOn: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aK;
      varying vec3 vN, vWorld;
      varying float vH, vK, vA;
      void main() {
        // uv.y: 0 at the ground end, 1 at the canopy end; uv.x around.
        vH = uv.y;
        vA = uv.x;
        vK = aK;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uTime, uOn;
      varying vec3 vN, vWorld;
      varying float vH, vK, vA;
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        float edge = pow(abs(dot(normalize(vN), v)), 2.2);
        float len = smoothstep(0.0, 0.12, vH) * (1.0 - smoothstep(0.55, 1.0, vH));
        float streak = 0.75 + 0.25 * sin(vA * 37.7 + sin(vA * 12.6 + uTime * 0.2) * 1.5)
                     * (0.6 + 0.4 * sin(vH * 40.0 + uTime * 0.7));
        float near = smoothstep(1.5, 9.0, distance(cameraPosition, vWorld));
        float a = edge * len * streak * near * vK * uOn;
        gl_FragColor = vec4(uColor * a, 1.0);
        // Additive: fog must take light away, not blend toward the fog colour (that would add it).
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
          #endif
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  const _up = new THREE.Vector3(0, 1, 0);
  for (const s of shafts) {
    const foot = new THREE.Vector3(s.x, s.y, s.z);
    const dir = new THREE.Vector3().subVectors(sunPos, foot).normalize();
    // Length up to the canopy height along the sun direction.
    const L = (top - s.y) / dir.y;
    // A slight cone: wider at the ground (the gap's light spreads a little).
    const geo = new THREE.CylinderGeometry(s.r * 0.75, s.r, L, 20, 1, true);
    geo.translate(0, L / 2, 0);
    geo.setAttribute('aK', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(s.k), 1));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(foot);
    mesh.quaternion.setFromUnitVectors(_up, dir);
    mesh.renderOrder = 3;
    mesh.frustumCulled = true;
    mesh.userData.soft = true;
    mesh.raycast = () => {};
    mesh.name = 'godray';
    group.add(mesh);
  }
  scene.add(group);
  return {
    group,
    mat,
    update(t: number) {
      mat.uniforms.uTime.value = t;
    },
    set visible(v: boolean) {
      group.visible = v;
    },
  };
}
export type GodRays = ReturnType<typeof buildGodRays>;
