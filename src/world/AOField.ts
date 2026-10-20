import * as THREE from 'three';
import type { CollisionWorld } from './Collision';

/*
  Baked street-level ambient occlusion (4.0), instead of per-vertex AO. The district's facades are
  long boxes with four vertices a side: AO in vertex colours would be interpolated linearly over a
  20 m wall (dark at the foot, light at the roof line, no contact shadow). So the bake goes into a
  small world-space texture over the streets instead, computed once at load from the collision world:

    - every solid, ray-blocking collider that stands on the street (or hangs over it, like the
      walkways and the overpass) is rasterised into a 0.5 m height grid;
    - per cell, 8 directions are marched out to 12 m and the highest elevation angle found is the
      sky lost that way (an alley between 20 m buildings sees only two slivers of sky);
    - a contact term darkens the first 1.5 m from a wall foot.

  Materials sample it in the fragment shader at their world position (walls a little outward along
  their normal, so they read the street cell in front of them), only near street level: the
  rooftops (8.5 m) and the metro (-6 m) are untouched. It dims indirect light fully and direct light
  partly (a stylised AO: neon still reaches the alley floor). One texture fetch per fragment.
*/

export interface AOBake {
  texture: THREE.DataTexture;
  min: THREE.Vector2;
  size: THREE.Vector2;
  /** 0 = off (the 3.7 look), 1 = on. Shared by every patched material. */
  on: { value: number };
  ms: number;
}

const CELL = 0.5;
const DIRS = 8;
const REACH = 12;

export function bakeAO(col: CollisionWorld, min: THREE.Vector2, max: THREE.Vector2): AOBake {
  const t0 = performance.now();
  const w = Math.ceil((max.x - min.x) / CELL), h = Math.ceil((max.y - min.y) / CELL);
  const H = new Float32Array(w * h);
  // Overhead: a ray-blocking slab whose underside is above head height (walkways, the overpass deck).
  const over = new Uint8Array(w * h);
  for (const c of col.colliders) {
    if (!c.solid || !c.ray || c.kind === 'ramp' || c.dynamic) continue;
    if (c.max.y < 1.5 || c.min.y > 10 || c.max.y - c.min.y < 0.3) continue;
    const overhead = c.min.y > 2.6;
    const x0 = Math.max(0, Math.floor((c.min.x - min.x) / CELL)), x1 = Math.min(w - 1, Math.floor((c.max.x - min.x) / CELL));
    const z0 = Math.max(0, Math.floor((c.min.z - min.y) / CELL)), z1 = Math.min(h - 1, Math.floor((c.max.z - min.y) / CELL));
    const top = Math.min(c.max.y, 30);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = z * w + x;
        if (c.kind === 'cyl') {
          const cx = min.x + (x + 0.5) * CELL, cz = min.y + (z + 0.5) * CELL;
          if (Math.hypot(cx - c.cx!, cz - c.cz!) > c.r! + CELL * 0.5) continue;
        }
        if (overhead) over[i] = 1;
        else if (top > H[i]) H[i] = top;
      }
    }
  }
  const dx = Array.from({ length: DIRS }, (_, k) => Math.cos((k / DIRS) * Math.PI * 2));
  const dz = Array.from({ length: DIRS }, (_, k) => Math.sin((k / DIRS) * Math.PI * 2));
  const steps = REACH / CELL;
  const out = new Uint8Array(w * h);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (H[i] > 0) {
        out[i] = 255; // inside a solid: never seen from the street (walls sample the cell in front)
        continue;
      }
      let open = 0;
      let wall = REACH;
      for (let k = 0; k < DIRS; k++) {
        let s = 0;
        for (let st = 1; st <= steps; st++) {
          const px = Math.round(x + dx[k] * st), pz = Math.round(z + dz[k] * st);
          if (px < 0 || pz < 0 || px >= w || pz >= h) break;
          const hh = H[pz * w + px];
          if (hh <= 0) continue;
          const d = st * CELL;
          if (d < wall) wall = d;
          const sin = hh / Math.hypot(hh, d);
          if (sin > s) s = sin;
        }
        open += 1 - s;
      }
      open /= DIRS;
      let ao = 0.5 + 0.5 * Math.pow(open, 0.7);
      ao *= 0.72 + 0.28 * Math.min(1, wall / 1.5);
      if (over[i]) ao *= 0.72;
      out[i] = Math.round(Math.max(0.35, Math.min(1, ao)) * 255);
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, min: min.clone(), size: new THREE.Vector2(w * CELL, h * CELL), on: { value: 1 }, ms: performance.now() - t0 };
}

/** Patches a standard material to sample the bake (chains after any existing onBeforeCompile). */
export function applyAO(mat: THREE.MeshStandardMaterial, ao: AOBake) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uAOTex = { value: ao.texture };
    sh.uniforms.uAOMin = { value: ao.min };
    sh.uniforms.uAOSize = { value: ao.size };
    sh.uniforms.uAOOn = ao.on;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAOW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvAOW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAOW;\nuniform sampler2D uAOTex;\nuniform vec2 uAOMin, uAOSize;\nuniform float uAOOn;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          vec3 wN = inverseTransformDirection(normal, viewMatrix);
          vec2 q = (vAOW.xz + wN.xz * 0.55 - uAOMin) / uAOSize;
          float field = texture2D(uAOTex, q).r;
          // Street level only: full at the foot of a wall, gone by 7 m up; nothing under the street.
          float band = smoothstep(-1.0, -0.4, vAOW.y) * (1.0 - smoothstep(0.6, 7.0, vAOW.y));
          float aoS = mix(1.0, field, band * uAOOn);
          reflectedLight.indirectDiffuse *= aoS;
          reflectedLight.indirectSpecular *= mix(1.0, aoS, 0.7);
          reflectedLight.directDiffuse *= mix(1.0, aoS, 0.45);
          reflectedLight.directSpecular *= mix(1.0, aoS, 0.3);
        }`,
      );
  };
  mat.customProgramCacheKey = () => prevKey.call(mat) + '|ao';
  // disposeScene frees textures it finds in userData (they live only in compiled uniforms otherwise).
  mat.userData.aoTex = ao.texture;
}
