import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/*
  79.0, materials (docs/TOKYO_PLAN.md, step 2): wear on the models' flat colours. No UVs are needed (the
  kits' are box-projected, the maps' merged): a standard material is patched to read a tiling noise
  texture in world space (triplanar: three fetches) and its own curvature (how fast the normal turns per
  metre: the Blender bevels' rounded edges) and to change its colour, roughness and metalness:

    paint     rust coming through in patches, chips to bare metal on the edges, dark streaks running
              down the sides, dust on the tops, grime over all
    metal     grime, a little rust, edges worn bright
    rust      its colour and roughness varied (orange to brown)
    plastic   faded and dusty, edges scuffed pale
    wood      darker and lighter boards, grime in the low parts, edges worn pale
    cloth     dirt blotches, dust
    concrete  stains, damp streaks, dust on the tops
    plaster   the Favelas' render: damp streaks from the tops, patches repainted, grey render through
              on the edges, algae low down
    rubber    dust

  The noise texture's channels: R patches (fbm), G fine (chips), B streaks (stretched up), A blotches.
  Patched once per material (chained after whatever patch it has: the ground fog, the AO, worldUv).
*/

export type Wear = 'paint' | 'metal' | 'rust' | 'plastic' | 'wood' | 'cloth' | 'concrete' | 'plaster' | 'rubber';
const PRESET: Record<Wear, number> = { paint: 0, metal: 1, rust: 2, plastic: 3, wood: 4, cloth: 5, concrete: 6, plaster: 7, rubber: 8 };

/** The role a kit names → its wear (roles not listed stay as they are: glass, chrome, lights, labels). */
export const ROLE_WEAR: Partial<Record<string, Wear>> = {
  paint: 'paint', metal: 'metal', rust: 'rust', plastic: 'plastic', wood: 'wood', canvas: 'cloth', rope: 'cloth',
  liner: 'cloth', concrete: 'concrete', rubber: 'rubber', dark: 'metal', wire: 'metal', cable: 'rubber',
  // 76.0/78.0 kits' own.
  white: 'paint', red: 'paint', tile: 'metal', sign: 'metal', wtile: 'concrete', shutter: 'paint',
};

let noise: THREE.DataTexture | null = null;

/** A tiling noise (256²): value-noise octaves on a wrapped lattice, one recipe per channel. */
export function wearNoise(): THREE.DataTexture {
  if (noise) return noise;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const lattice = (n: number, seed: number) => {
    const r = mulberry32(seed);
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (x: number, y: number) => {
      const fx = (x * n) / S, fy = (y * n) / S;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[((j % n) + n) % n * n + (((i % n) + n) % n)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  };
  const fbm = (octs: [number, number][], seed: number) => {
    const ls = octs.map(([n], i) => lattice(n, seed + i * 17));
    const total = octs.reduce((s, [, w]) => s + w, 0);
    return (x: number, y: number) => ls.reduce((s, l, i) => s + l(x, y) * octs[i][1], 0) / total;
  };
  const patches = fbm([[4, 1], [8, 0.5], [16, 0.25], [32, 0.125]], 790);
  const fine = fbm([[32, 1], [64, 0.6], [128, 0.3]], 791);
  // Streaks: a fine lattice across x, a coarse one along y (the texture's y runs up a wall).
  const streakX = lattice(64, 792), streakY = fbm([[4, 1], [8, 0.4]], 793);
  const blotch = fbm([[2, 1], [4, 0.6], [8, 0.3]], 794);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = Math.round(patches(x, y) * 255);
      data[i + 1] = Math.round(fine(x, y) * 255);
      data[i + 2] = Math.round(Math.min(1, streakX(x, 0) * 0.7 + streakY(x, y) * 0.5) * 255);
      data[i + 3] = Math.round(blotch(x, y) * 255);
    }
  noise = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = THREE.LinearFilter;
  noise.minFilter = THREE.LinearMipmapLinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  return noise;
}

const done = new WeakSet<THREE.Material>();

/** Wears a standard material (once; `amount` 0..1 scales it all). Other materials are left as they are. */
export function applyWear(mat: THREE.Material, wear: Wear, amount = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial) || done.has(mat)) return mat;
  done.add(mat);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWearTex = { value: wearNoise() };
    sh.uniforms.uWear = { value: new THREE.Vector2(PRESET[wear], amount) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWearP;\nvarying vec3 vWearN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          vWearP = (modelMatrix * wp).xyz;
          vWearN = normalize(mat3(modelMatrix) * wn);
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWearP;\nvarying vec3 vWearN;\nuniform sampler2D uWearTex;\nuniform vec2 uWear;\nvec4 wearN; float wearEdge; float wearUp; float wearSide;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 n = normalize(vWearN);
          vec3 b = abs(n); b = b * b * b; b /= (b.x + b.y + b.z);
          // Triplanar, 0.9 m to a repeat; the streaks' channel read stretched up the walls.
          vec3 p = vWearP / 0.9;
          vec4 tx = texture2D(uWearTex, p.zy), ty = texture2D(uWearTex, p.xz), tz = texture2D(uWearTex, p.xy);
          wearN = tx * b.x + ty * b.y + tz * b.z;
          float st = texture2D(uWearTex, vec2(p.x + p.z, p.y * 0.12)).b;
          wearN.b = mix(st, wearN.b, b.y);
          vec4 fine = texture2D(uWearTex, vWearP.xz * 2.3 + vWearP.y * 1.7);
          wearN.g = mix(wearN.g, fine.g, 0.5);
          // Curvature: the normal's turn per metre (a bevel: tens; a flat face: none).
          float curv = length(fwidth(n)) / max(length(fwidth(vWearP)), 1e-4);
          wearEdge = smoothstep(10.0, 30.0, curv) * smoothstep(0.0, 0.002, length(fwidth(vWearP)));
          wearUp = smoothstep(0.6, 0.95, n.y);
          wearSide = 1.0 - smoothstep(0.3, 0.7, abs(n.y));
          int preset = int(uWear.x + 0.5);
          float a = uWear.y;
          vec3 c = diffuseColor.rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 rustC = mix(vec3(0.30, 0.13, 0.05), vec3(0.50, 0.24, 0.09), wearN.g);
          float grime = mix(1.0, 0.8 + 0.2 * wearN.a, a);
          if (preset == 0) {
            // Paint: rust in small spots and along the edges, chips to bare metal on the edges, streaks
            // down the sides, a little dust up top.
            float spot = smoothstep(0.69, 0.79, wearN.r * 0.5 + wearN.g * 0.5);
            float edgeWear = wearEdge * smoothstep(0.42, 0.6, wearN.g);
            float rust = max(spot, edgeWear * step(0.5, wearN.a)) * a;
            float chip = edgeWear * (1.0 - step(0.5, wearN.a)) * a;
            c = mix(c, rustC, rust);
            c = mix(c, vec3(0.42, 0.42, 0.40), chip * 0.8);
            c *= 1.0 - wearSide * smoothstep(0.55, 0.85, wearN.b) * 0.35 * a;
            c = mix(c, vec3(lum) * 1.1 + 0.03, wearUp * 0.12 * smoothstep(0.4, 0.7, wearN.a) * a);
            c *= grime;
          } else if (preset == 1) {
            float rust = smoothstep(0.8, 0.88, wearN.r * 0.5 + wearN.g * 0.5) * 0.6 * a;
            c = mix(c, rustC * 0.8, rust);
            c = mix(c, c * 1.6 + 0.06, wearEdge * 0.6 * a);
            c *= 1.0 - wearSide * smoothstep(0.6, 0.9, wearN.b) * 0.3 * a;
            c *= grime;
          } else if (preset == 2) {
            c = mix(rustC * 0.7, c * 1.15, wearN.r) * mix(0.75, 1.1, wearN.g);
          } else if (preset == 3) {
            c = mix(c, vec3(lum) * 1.1 + 0.05, (0.15 + wearUp * 0.35) * a);
            c = mix(c, c * 1.5 + 0.08, wearEdge * 0.5 * a);
            c *= grime;
          } else if (preset == 4) {
            c *= mix(0.78, 1.15, wearN.r);
            c = mix(c, c * 1.4 + 0.05, wearEdge * 0.6 * a);
            c *= grime;
          } else if (preset == 5) {
            c *= mix(1.0, 0.65 + 0.35 * smoothstep(0.3, 0.7, wearN.a), a);
            c = mix(c, vec3(0.45, 0.4, 0.33), wearUp * 0.2 * a);
          } else if (preset == 6) {
            c *= mix(1.0, 0.75 + 0.3 * wearN.a, a);
            c *= 1.0 - wearSide * smoothstep(0.55, 0.9, wearN.b) * 0.3 * a;
            c = mix(c, c * 1.15 + 0.04, wearUp * 0.3 * a);
          } else if (preset == 7) {
            // Render: patches repainted, damp streaks, grey render on the edges, algae at the foot.
            c *= mix(1.0, mix(0.86, 1.1, wearN.a), a);
            c *= 1.0 - wearSide * smoothstep(0.5, 0.85, wearN.b) * 0.42 * a;
            c = mix(c, vec3(0.55, 0.53, 0.5), wearEdge * smoothstep(0.3, 0.6, wearN.g) * 0.8 * a);
            float foot = 1.0 - smoothstep(0.0, 0.9, fract(vWearP.y / 3.0) * 3.0);
            c = mix(c, c * vec3(0.7, 0.78, 0.62), foot * smoothstep(0.4, 0.7, wearN.r) * 0.6 * a * wearSide);
          } else if (preset == 8) {
            c = mix(c, vec3(0.32, 0.3, 0.27), (0.12 + wearUp * 0.35) * smoothstep(0.3, 0.8, wearN.a) * a);
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          int preset = int(uWear.x + 0.5);
          float a = uWear.y;
          if (preset == 0) {
            float spot = smoothstep(0.69, 0.79, wearN.r * 0.5 + wearN.g * 0.5);
            float edgeWear = wearEdge * smoothstep(0.42, 0.6, wearN.g);
            float rust = max(spot, edgeWear * step(0.5, wearN.a)) * a;
            roughnessFactor = mix(roughnessFactor, 0.9, rust);
            roughnessFactor = mix(roughnessFactor, 0.45, edgeWear * (1.0 - step(0.5, wearN.a)) * a);
            roughnessFactor = mix(roughnessFactor, 0.95, wearUp * 0.2 * a);
          } else if (preset == 1) {
            roughnessFactor = clamp(roughnessFactor + (wearN.a - 0.5) * 0.3 * a, 0.05, 1.0);
          } else if (preset == 2) {
            roughnessFactor = mix(0.75, 1.0, wearN.g);
          } else {
            roughnessFactor = clamp(roughnessFactor + (wearN.a - 0.5) * 0.2 * a + wearUp * 0.15 * a, 0.05, 1.0);
          }
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        {
          int preset = int(uWear.x + 0.5);
          if (preset == 0) {
            float a = uWear.y;
            float spot = smoothstep(0.69, 0.79, wearN.r * 0.5 + wearN.g * 0.5);
            float edgeWear = wearEdge * smoothstep(0.42, 0.6, wearN.g);
            metalnessFactor = mix(metalnessFactor, 0.15, max(spot, edgeWear * step(0.5, wearN.a)) * a);
            metalnessFactor = mix(metalnessFactor, 0.85, edgeWear * (1.0 - step(0.5, wearN.a)) * a);
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|wear${wear}`;
  mat.needsUpdate = true;
  return mat;
}

/** The kits' role materials worn by their roles (the rest as they are). */
export function wearRoles(mats: Record<string, THREE.Material>, amount = 1) {
  for (const [role, m] of Object.entries(mats)) {
    const w = ROLE_WEAR[role];
    if (w) applyWear(m, w, amount);
  }
  return mats;
}
