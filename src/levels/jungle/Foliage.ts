import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';
import { mulberry32 } from '../../core/math';
import { JUNGLE_EXTENT, STRIP, baseDist, jungleHeight, noise } from './Terrain';
import type { Interior, TreeInfo } from './Base';
import { mistTexture } from './textures';

/*
  The undergrowth, canopy and mist. Every plant is opaque, low-poly geometry drawn with
  InstancedMesh: one draw call per plant kind however many there are, no alpha blending, no alpha
  testing, so no overdraw sorting and early-z keeps working. Plants are soft (you walk through them,
  bullets and sight pass through): they hide bodies, they don't stop rounds. A vertex-shader sway
  keeps them alive at zero CPU cost.
*/

/** Rooms the mist shader can mask out. */
const MAX_ROOMS = 6;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Merges simple non-indexed parts into one geometry with position and normal only. */
function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  for (const p of parts) {
    const n = p.index ? p.toNonIndexed() : p;
    pos.push(...(n.attributes.position.array as Float32Array));
    if (n !== p) n.dispose();
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A broadleaf shrub: a few jittered, flattened icosahedra (flat-shaded lumps of leaves). */
function bushGeometry(rnd: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(0.55 + rnd() * 0.25, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + rnd() * 0.3), p.getY(i) * (0.6 + rnd() * 0.25), p.getZ(i) * (0.85 + rnd() * 0.3));
    const a = (k / 4) * Math.PI * 2;
    g.translate(k ? Math.cos(a) * 0.45 : 0, k ? 0.35 : 0.6, k ? Math.sin(a) * 0.45 : 0);
    parts.push(g);
  }
  return merge(parts);
}

/** A fern: fronds arching out from the centre, each a bent strip of two quads (opaque, two-sided). */
function fernGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    // Frond profile: base → mid (up and out) → tip (out and drooping); width tapers.
    const pts: [number, number, number][] = [[0.0, 0.0, 0.04], [0.45, 0.42, 0.13], [1.0, 0.3, 0.0]];
    const verts: number[] = [];
    const ca = Math.cos(a), sa = Math.sin(a);
    const at = (d: number, y: number, w: number): [number, number, number] => [ca * d - sa * w, y, sa * d + ca * w];
    for (let i = 0; i < 2; i++) {
      const [d0, y0, w0] = pts[i], [d1, y1, w1] = pts[i + 1];
      const A = at(d0, y0, -w0), B = at(d0, y0, w0), C = at(d1, y1, w1), D = at(d1, y1, -w1);
      verts.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    parts.push(g);
  }
  return merge(parts);
}

/** A clump of sedge: thin triangular blades leaning out. */
function grassGeometry(rnd: () => number) {
  const verts: number[] = [];
  for (let k = 0; k < 7; k++) {
    const a = rnd() * Math.PI * 2, lean = 0.15 + rnd() * 0.35, h = 0.45 + rnd() * 0.4, w = 0.035;
    const ca = Math.cos(a), sa = Math.sin(a);
    verts.push(-sa * w, 0, ca * w, sa * w, 0, -ca * w, ca * lean, h, sa * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

/** Big-leaf plant (elephant ear): broad oval leaves on stalks, each leaf a fan of triangles. */
function bigLeafGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const stalk = new THREE.CylinderGeometry(0.015, 0.025, 0.9, 4);
    stalk.translate(0, 0.45, 0);
    stalk.rotateZ(-0.35);
    stalk.rotateY(-a);
    parts.push(stalk);
    // Leaf: centre line from the stalk tip outward, tilted down; a 6-triangle oval.
    const base = new THREE.Vector3(ca * 0.31, 0.85, sa * 0.31);
    const L = 0.9, W = 0.42;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      const d = (Math.cos(t) * 0.5 + 0.5) * L, w = Math.sin(t) * W;
      const droop = -0.3 * (d / L) ** 2;
      ring.push(new THREE.Vector3(base.x + ca * d - sa * w, base.y + droop + 0.12 * (d / L), base.z + sa * d + ca * w));
    }
    const mid = new THREE.Vector3(base.x + ca * L * 0.5, base.y + 0.02, base.z + sa * L * 0.5);
    const verts: number[] = [];
    for (let i = 0; i < 6; i++) verts.push(mid.x, mid.y, mid.z, ring[i].x, ring[i].y, ring[i].z, ring[i + 1].x, ring[i + 1].y, ring[i + 1].z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    parts.push(g);
  }
  return merge(parts);
}

/** Shader sway: the higher a vertex sits above the plant's base, the more it moves. */
function swaying(mat: THREE.MeshStandardMaterial, time: { value: number }, amount: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          float k = max(position.y, 0.0) * ${amount.toFixed(3)};
          transformed.x += sin(uTime * 1.3 + ph) * k;
          transformed.z += cos(uTime * 1.1 + ph * 1.7) * k * 0.7;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => 'sway' + amount;
  return mat;
}

/**
 * 15.0: what the foliage needs to know about the ground it grows on (Firebase Viper by default; the
 * TDM jungle, Crash Site, passes its own): the floor's height, how much forest a point is (0 cleared …
 * 1 deep), whether a plant may stand `minD` out from the clearings, and the extents of the scatter.
 */
export interface FoliageSite {
  height(x: number, z: number): number;
  /** 0 on cleared ground, rising to 1 in the deep forest (the undergrowth's base density). */
  forest(x: number, z: number): number;
  /** A plant may stand here: `minD` is the plant kind's distance from the clearings (Firebase: from its wall). */
  allowed(x: number, z: number, minD: number): boolean;
  /** Scatter extent (half-size), the canopy's and the vines' extents, the mist sheets' size. */
  extent: number;
  canopyR: number;
  vineR: number;
  mistSize: number;
  /** Where the canopy and the vines may hang (Firebase: never right over the compound). */
  canopyOk(x: number, z: number): boolean;
  vineOk(x: number, z: number): boolean;
}

/** Firebase Viper's site (the 3.6–14.0 behaviour exactly). */
export const FIREBASE_SITE: FoliageSite = {
  height: jungleHeight,
  forest: (x, z) => THREE.MathUtils.smoothstep(baseDist(x, z), STRIP - 1, STRIP + 8),
  allowed: (x, z, minD) => baseDist(x, z) >= minD,
  extent: JUNGLE_EXTENT,
  canopyR: 78,
  vineR: 62,
  mistSize: 150,
  canopyOk: (x, z) => baseDist(x, z) >= 4,
  vineOk: (x, z) => baseDist(x, z) >= STRIP,
};

export interface FoliageResult {
  group: THREE.Group;
  /** Total plant instances by kind (for the report and the bench). */
  counts: Record<string, number>;
  /** The leaf materials (4.2 wet gloss is switched on them). */
  leaves: THREE.MeshStandardMaterial[];
  /**
   * How much of a sightline survives the undergrowth (1 clear … 0 hidden). Rounds pass through
   * plants, eyes don't: the AI uses this so a player deep in the bushes is as hidden from them as
   * they are from him. From the placement density field, so it never depends on the graphics preset.
   */
  concealment(a: THREE.Vector3, b: THREE.Vector3): number;
  update(t: number, cam: THREE.Camera): void;
  dispose(): void;
}

/**
 * Builds the undergrowth (bushes, ferns, sedge, big-leaf plants), the slim trees' crowns, hanging
 * vines, the high canopy and two sheets of ground mist. The compound and its cleared strip stay bare
 * (keep-clear rects); the canopy opens over the base; the mist stays out of the rooms.
 */
export function buildFoliage(
  scene: THREE.Scene,
  col: CollisionWorld,
  trees: TreeInfo[],
  keepClear: [number, number, number, number][],
  spawns: THREE.Vector3[],
  fogColor: THREE.Color,
  quality: number,
  rooms: Interior[] = [],
  site: FoliageSite = FIREBASE_SITE,
): FoliageResult {
  const H = site.height;
  const rnd = mulberry32(777);
  const group = new THREE.Group();
  group.name = 'foliage';
  group.userData.soft = true;
  scene.add(group);
  const time = { value: 0 };
  const counts: Record<string, number> = {};

  const blockedSpot = (x: number, z: number, r: number) =>
    keepClear.some(([a0, b0, a1, b1]) => x > a0 - r && x < a1 + r && z > b0 - r && z < b1 + r) ||
    col.blocked(_p.set(x, H(x, z), z), r, 0.6);

  /** Density 0..1 of the undergrowth at a point: none on the cleared strip, thick in the forest and around spawns. */
  const density = (x: number, z: number) => {
    const forest = site.forest(x, z);
    const patch = noise(x * 0.08 + 3, z * 0.08 - 9);
    let d = 0.15 + forest * (0.35 + patch * 0.7);
    for (const s of spawns) if (Math.abs(s.x - x) < 9 && Math.abs(s.z - z) < 9) d = Math.max(d, 1 - Math.hypot(s.x - x, s.z - z) / 9);
    return Math.min(1, d);
  };

  /** Scatters `n` candidates of one kind over the map (at least `minD` out from the wall), keeping those the density accepts. */
  const scatter = (n: number, minD: number, accept: (x: number, z: number) => boolean) => {
    const out: THREE.Vector3[] = [];
    const ext = site.extent - 1;
    for (let i = 0; i < n * 6 && out.length < n; i++) {
      const x = (rnd() * 2 - 1) * ext, z = (rnd() * 2 - 1) * ext;
      if (!site.allowed(x, z, minD)) continue;
      if (!accept(x, z)) continue;
      out.push(new THREE.Vector3(x, H(x, z), z));
    }
    return out;
  };

  const instanced = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, pts: { p: THREE.Vector3; s: number; yaw: number; tilt?: number; color: THREE.Color }[], shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach((o, i) => {
      _q.setFromEuler(_e.set(o.tilt ?? 0, o.yaw, (o.tilt ?? 0) * 0.6));
      _m.compose(o.p, _q, _s.set(o.s, o.s, o.s));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, o.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.soft = true;
    group.add(mesh);
    counts[name] = pts.length;
    return mesh;
  };
  const leaves: THREE.MeshStandardMaterial[] = [];
  const leafMat = (amount: number, side: THREE.Side = THREE.FrontSide) => {
    const m = swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, flatShading: true, side, envMapIntensity: 0.4 }), time, amount);
    leaves.push(m);
    return m;
  };
  const tint = (h: number, s: number, l: number) => _c.clone().setHSL(h, s, l);

  const q = Math.max(0.35, quality);
  // ------------------------------------------------------------------ bushes
  const bushPts = scatter(Math.round(1100 * q), STRIP - 1, (x, z) => rnd() < density(x, z) && !blockedSpot(x, z, 0.5))
    .map((p) => ({ p, s: 0.9 + rnd() * 1.3, yaw: rnd() * 6.28, color: tint(0.22 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.17 + rnd() * 0.1) }));
  // Dense walls of undergrowth right round the spawns (where the hunters come out of).
  for (const s of spawns) {
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, d = 1.6 + rnd() * 5;
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      if (blockedSpot(x, z, 0.4)) continue;
      bushPts.push({ p: new THREE.Vector3(x, H(x, z), z), s: 1.3 + rnd() * 1.1, yaw: rnd() * 6.28, color: tint(0.24 + rnd() * 0.06, 0.5, 0.16 + rnd() * 0.08) });
    }
  }
  const bushGeo = bushGeometry(rnd);
  instanced('bushes', bushGeo, leafMat(0.05), bushPts, true);

  // ------------------------------------------------------------------ ferns
  const fernPts = scatter(Math.round(1500 * q), STRIP - 3, (x, z) => rnd() < 0.25 + density(x, z) * 0.75 && !blockedSpot(x, z, 0.2))
    .map((p) => ({ p, s: 0.7 + rnd() * 0.9, yaw: rnd() * 6.28, color: tint(0.25 + rnd() * 0.06, 0.55, 0.22 + rnd() * 0.1) }));
  instanced('ferns', fernGeometry(), leafMat(0.12, THREE.DoubleSide), fernPts, false);

  // ------------------------------------------------------------------ sedge
  const grassPts = scatter(Math.round(2600 * q), STRIP - 4, (x, z) => rnd() < 0.5 + density(x, z) * 0.5 && !blockedSpot(x, z, 0.1))
    .map((p) => ({ p, s: 0.8 + rnd() * 0.8, yaw: rnd() * 6.28, color: tint(0.2 + rnd() * 0.07, 0.4 + rnd() * 0.2, 0.2 + rnd() * 0.12) }));
  instanced('grass', grassGeometry(rnd), leafMat(0.18, THREE.DoubleSide), grassPts, false);

  // ------------------------------------------------------------------ big-leaf plants
  const bigPts = scatter(Math.round(380 * q), STRIP, (x, z) => rnd() < density(x, z) && !blockedSpot(x, z, 0.5))
    .map((p) => ({ p, s: 1.0 + rnd() * 0.9, yaw: rnd() * 6.28, color: tint(0.27 + rnd() * 0.05, 0.5, 0.2 + rnd() * 0.08) }));
  instanced('bigleaf', bigLeafGeometry(), leafMat(0.08, THREE.DoubleSide), bigPts, true);

  // ------------------------------------------------------------------ crowns of the slim trees
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = crownGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + noise(p.getX(i) * 3 + 5, p.getZ(i) * 3 + p.getY(i) * 2) * 0.4;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.65, p.getZ(i) * k);
    }
    crownGeo.computeVertexNormals();
  }
  const crownPts = trees.filter((t) => !t.giant).map((t) => ({ p: new THREE.Vector3(t.x, t.y + t.h - 0.5, t.z), s: 3 + rnd() * 2.5, yaw: rnd() * 6.28, color: tint(0.25, 0.45, 0.14 + rnd() * 0.06) }));
  instanced('crowns', crownGeo, leafMat(0.02), crownPts, false);

  // ------------------------------------------------------------------ high canopy
  // A roof of dark foliage masses high above (30–44 m), fading into the mist. Not a shadow caster:
  // the light through it is the sun's dapple projection.
  const canopyPts: { p: THREE.Vector3; s: number; yaw: number; color: THREE.Color }[] = [];
  for (const t of trees) if (t.giant) canopyPts.push({ p: new THREE.Vector3(t.x, t.y + t.h - 4, t.z), s: 9 + rnd() * 6, yaw: rnd() * 6.28, color: tint(0.26, 0.4, 0.09 + rnd() * 0.05) });
  for (let i = 0; i < Math.round(110 * q); i++) {
    const x = (rnd() * 2 - 1) * site.canopyR, z = (rnd() * 2 - 1) * site.canopyR;
    if (!site.canopyOk(x, z)) continue;
    canopyPts.push({ p: new THREE.Vector3(x, 34 + rnd() * 10, z), s: 8 + rnd() * 8, yaw: rnd() * 6.28, color: tint(0.26, 0.4, 0.08 + rnd() * 0.05) });
  }
  instanced('canopy', crownGeo, leafMat(0.006), canopyPts, false);

  // ------------------------------------------------------------------ vines
  const vineGeo = new THREE.CylinderGeometry(0.035, 0.05, 1, 5, 1, true);
  vineGeo.translate(0, -0.5, 0);
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x3e4a26, roughness: 0.9, flatShading: true });
  const vines = new THREE.InstancedMesh(vineGeo, vineMat, Math.round(260 * q));
  {
    let n = 0;
    const giants = trees.filter((t) => t.giant);
    for (let i = 0; n < vines.count && i < vines.count * 4; i++) {
      // Hanging from limbs near a giant, or from the canopy anywhere in the forest.
      const t = giants[Math.floor(rnd() * giants.length)];
      const nearTree = rnd() < 0.6 && t;
      const a = rnd() * Math.PI * 2, d = nearTree ? t.r + 0.8 + rnd() * 5 : 0;
      const x = nearTree ? t.x + Math.cos(a) * d : (rnd() * 2 - 1) * site.vineR;
      const z = nearTree ? t.z + Math.sin(a) * d : (rnd() * 2 - 1) * site.vineR;
      if (!site.vineOk(x, z)) continue;
      const g = H(x, z);
      const top = g + 16 + rnd() * 14;
      // Most end well above head height; a few trail down to the ground.
      const bottom = rnd() < 0.25 ? g + 0.3 : g + 2.4 + rnd() * 6;
      _m.compose(_p.set(x, top, z), _q.setFromEuler(_e.set((rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06)), _s.set(1, top - bottom, 1));
      vines.setMatrixAt(n++, _m);
    }
    vines.count = n;
    vines.instanceMatrix.needsUpdate = true;
    vines.computeBoundingSphere();
    vines.name = 'vines';
    vines.userData.soft = true;
    group.add(vines);
    counts.vines = n;
  }

  // ------------------------------------------------------------------ ground mist
  // Two sheets following the ground (0.3 m and 1.1 m up), drifting noise in the alpha, faded out
  // close to the camera so you never see the sheet's edge when you walk through it. Masked out of
  // the rooms (it would roll across the barracks floor otherwise).
  const mistTex = mistTexture();
  // Rooms the mist stays out of (x0, z0, x1, z1); unused slots sit far off the map.
  const roomRects = Array.from({ length: MAX_ROOMS }, (_, i) => (rooms[i] ? new THREE.Vector4(rooms[i].x0, rooms[i].z0, rooms[i].x1, rooms[i].z1) : new THREE.Vector4(1e5, 1e5, 1e5, 1e5)));
  const mists: THREE.ShaderMaterial[] = [];
  const mistMesh = (y: number, opacity: number, scale: number, drift: [number, number]) => {
    const size = site.mistSize, segs = 75;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)) + y);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { tMist: { value: mistTex }, uTime: { value: 0 }, uColor: { value: fogColor.clone().multiplyScalar(1.15) }, uOpacity: { value: opacity }, uScale: { value: scale }, uDrift: { value: new THREE.Vector2(...drift) }, uRooms: { value: roomRects } },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform sampler2D tMist;
        uniform float uTime, uOpacity, uScale;
        uniform vec2 uDrift;
        uniform vec3 uColor;
        uniform vec4 uRooms[${MAX_ROOMS}];
        varying vec3 vWorld;
        void main() {
          for (int i = 0; i < ${MAX_ROOMS}; i++) {
            vec4 r = uRooms[i];
            if (vWorld.x > r.x && vWorld.x < r.z && vWorld.z > r.y && vWorld.z < r.w) discard;
          }
          vec2 uv = vWorld.xz * uScale;
          float a = texture2D(tMist, uv + uDrift * uTime).r;
          float b = texture2D(tMist, uv * 2.3 - uDrift.yx * uTime * 1.4).r;
          float n = smoothstep(0.08, 0.7, a * 0.75 + b * 0.5);
          float near = smoothstep(1.5, 9.0, distance(cameraPosition, vWorld));
          gl_FragColor = vec4(uColor, n * uOpacity * near);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // The texture lives in a uniform: kept in userData too, so disposeScene frees it.
    mat.userData.mist = mistTex;
    mists.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.userData.soft = true;
    mesh.name = 'mist';
    group.add(mesh);
  };
  mistMesh(0.3, 0.55, 0.03, [0.006, 0.002]);
  mistMesh(1.1, 0.32, 0.022, [-0.004, 0.003]);

  /** Plants per square metre, as the scatter sees them (0 where the ground is kept clear). */
  const cover = (x: number, z: number) => (keepClear.some(([a0, b0, a1, b1]) => x > a0 && x < a1 && z > b0 && z < b1) ? 0 : !site.allowed(x, z, STRIP - 1) ? 0 : density(x, z));
  const concealment = (a: THREE.Vector3, b: THREE.Vector3) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    // Point blank (an arm's length plus a step or two) the bushes hide nothing.
    if (len < 6) return 1;
    // March in 1 m steps; only the part of the line inside the undergrowth layer (≤ 1.9 m above
    // the ground there) counts; the first and last metre are the viewer's and target's own spot.
    let tau = 0;
    const n = Math.floor(len);
    for (let i = 1; i < n; i++) {
      const t = i / len;
      const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (y - H(x, z) > 1.9) continue;
      tau += 0.3 * cover(x, z);
      if (tau > 3) return 0;
    }
    return Math.exp(-tau);
  };

  return {
    group,
    counts,
    leaves,
    concealment,
    update(t: number) {
      time.value = t;
      for (const m of mists) m.uniforms.uTime.value = t;
    },
    dispose() {
      // Everything lives in the scene graph (freed by disposeScene with the level); InstancedMesh
      // buffers are freed there too. Nothing outside it to release.
    },
  };
}
