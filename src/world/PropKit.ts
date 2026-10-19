import * as THREE from 'three';
import type { BuildCtx, Face } from './City';
import { worldBox } from './Builder';
import { chainLinkTexture, grilleTexture, lanternTexture, vendingTexture } from './Textures';

const NORMAL: Record<Face, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const ROT: Record<Face, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius = 0.022): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, radius, 4, false);
}

/** Per-frame animation hook for props that move (fans, swaying lanterns, vibrating signs). */
export type Updater = (t: number, dt: number) => void;

/**
 * Factory for street furniture. Static pieces are merged through the StaticBuilder (one draw call per
 * material for the whole district); repeated moving pieces use InstancedMesh.
 */
export class PropKit {
  cable = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.5, metalness: 0.3 });
  vendBody: Record<'red' | 'white', THREE.MeshStandardMaterial> = {
    red: new THREE.MeshStandardMaterial({ color: 0xb01024, roughness: 0.35, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.3 }),
  };
  vendFront: Record<'red' | 'white', THREE.MeshBasicMaterial> = {
    red: new THREE.MeshBasicMaterial({ map: vendingTexture('red'), color: new THREE.Color(1.6, 1.6, 1.6) }),
    white: new THREE.MeshBasicMaterial({ map: vendingTexture('white'), color: new THREE.Color(1.6, 1.6, 1.6) }),
  };
  grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.55, metalness: 0.2 });
  acBody = new THREE.MeshStandardMaterial({ color: 0xa8a69c, roughness: 0.6 });
  dumpMat = new THREE.MeshStandardMaterial({ color: 0x2c4a3a, roughness: 0.45, metalness: 0.5, envMapIntensity: 1 });
  crateMat = new THREE.MeshStandardMaterial({ color: 0x3a6fa8, roughness: 0.6 });
  bagMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.2, metalness: 0.1, envMapIntensity: 1.4 });
  guard = new THREE.MeshStandardMaterial({ color: 0xd6b21e, roughness: 0.5 });
  red = new THREE.MeshStandardMaterial({ color: 0xc81e14, roughness: 0.45, envMapIntensity: 0.8 });
  wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
  leaf = new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.6, envMapIntensity: 0.6 });
  bamboo = new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.4, envMapIntensity: 0.8 });
  pipe = new THREE.MeshStandardMaterial({ color: 0x5c6258, roughness: 0.4, metalness: 0.7, envMapIntensity: 1 });
  greenPipe = new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.9 });
  fence: THREE.MeshStandardMaterial;
  noren = new THREE.MeshStandardMaterial({ color: 0x1b2a5a, roughness: 0.8, side: THREE.DoubleSide });
  lanternMats: THREE.MeshStandardMaterial[];
  lanternGeo: THREE.LatheGeometry;
  private front = new THREE.PlaneGeometry(0.98, 1.8);
  private acGeo = worldBox(0.75, 0.55, 0.28, 1);
  private acFront = new THREE.PlaneGeometry(0.72, 0.52);
  updaters: Updater[] = [];

  constructor(private ctx: BuildCtx) {
    const fl = chainLinkTexture();
    fl.repeat.set(1, 1);
    this.fence = new THREE.MeshStandardMaterial({ map: fl, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7 });
    const mk = (ch: string) => {
      const t = lanternTexture(ch);
      return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 0.55, 0.35), emissiveIntensity: 1.6, roughness: 0.6 });
    };
    this.lanternMats = [mk('酒'), mk('焼鳥'), mk('祭')];
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.05 + Math.sin(t * Math.PI) * 0.26, -0.42 + t * 0.84));
    }
    this.lanternGeo = new THREE.LatheGeometry(pts, 14);
  }

  /** Drinks vending machine backed against a wall; returns its glowing front material. */
  vending(x: number, z: number, face: Face, theme: 'red' | 'white') {
    const { builder: b, col, scene } = this.ctx;
    const [nx, nz] = NORMAL[face];
    const alongX = nz !== 0;
    b.add(alongX ? worldBox(1.05, 1.9, 0.8, 1) : worldBox(0.8, 1.9, 1.05, 1), this.vendBody[theme], x, 0.95, z);
    const mesh = new THREE.Mesh(this.front, this.vendFront[theme]);
    mesh.position.set(x + nx * 0.405, 0.98, z + nz * 0.405);
    mesh.rotation.y = ROT[face];
    scene.add(mesh);
    if (alongX) col.addCentered(x, 0.95, z, 1.05, 1.9, 0.8, 'metal');
    else col.addCentered(x, 0.95, z, 0.8, 1.9, 1.05, 'metal');
    return this.vendFront[theme];
  }

  /** Air-conditioner units scattered up a facade segment (upper floors only). */
  acUnits(face: Face, wall: number, a0: number, a1: number, rnd: () => number, minY = 7.6) {
    const b = this.ctx.builder;
    const [nx, nz] = NORMAL[face];
    const alongX = nz !== 0;
    const count = Math.floor((a1 - a0) / 3.5);
    for (let i = 0; i < count; i++) {
      if (rnd() < 0.35) continue;
      const a = a0 + (i + 0.5) * ((a1 - a0) / count) + (rnd() - 0.5);
      const y = minY + Math.floor(rnd() * 3) * 3.2 + 0.4;
      const px = alongX ? a : wall + nx * 0.16;
      const pz = alongX ? wall + nz * 0.16 : a;
      b.add(this.acGeo, this.acBody, px, y, pz, 0, ROT[face], 0);
      b.add(this.acFront, this.grille, px + nx * 0.142, y, pz + nz * 0.142, 0, ROT[face], 0);
      if (rnd() < 0.3) b.add(new THREE.CylinderGeometry(0.03, 0.03, y, 5), this.ctx.mats.darkMetal, px + nx * -0.08 + (alongX ? 0.5 : 0), y / 2, pz + nz * -0.08 + (alongX ? 0 : 0.5));
    }
    for (let a = a0 + 1; a < a1; a += 9 + rnd() * 4) {
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 14, 6), this.ctx.mats.paintedMetal, alongX ? a : wall + nx * 0.1, 7, alongX ? wall + nz * 0.1 : a);
    }
  }

  /** Concrete utility pole with transformer; returns the three cable attachment points. */
  pole(x: number, z: number, h = 10): THREE.Vector3[] {
    const { builder: b, col, mats: m } = this.ctx;
    b.add(new THREE.CylinderGeometry(0.13, 0.18, h, 8), m.concrete, x, h / 2, z);
    col.addCentered(x, h / 2, z, 0.36, h, 0.36, 'concrete');
    const arm = worldBox(1.6, 0.1, 0.1, 1);
    b.add(arm, m.darkMetal, x, h - 0.8, z);
    b.add(arm, m.darkMetal, x, h - 1.5, z, 0, 0, 0, 0.8, 1, 1);
    b.add(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8), m.paintedMetal, x + 0.35, h - 2.4, z);
    b.add(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 8), this.guard, x, 0.8, z);
    return [-0.7, 0, 0.7].map((dx) => new THREE.Vector3(x + dx, h - 0.75, z));
  }

  cableLine(a: THREE.Vector3, c: THREE.Vector3, sag: number, r = 0.022) {
    this.ctx.builder.add(catenary(a, c, sag, r), this.cable);
  }

  dumpster(x: number, z: number, rotated = false) {
    const { builder: b, col, mats: m } = this.ctx;
    const sx = rotated ? 1.1 : 1.8;
    const sz = rotated ? 1.8 : 1.1;
    b.add(worldBox(sx, 1.2, sz, 1), this.dumpMat, x, 0.65, z);
    b.add(worldBox(sx + 0.1, 0.08, sz + 0.1, 1), m.darkMetal, x, 1.3, z, rotated ? 0 : 0.08, 0, rotated ? 0.08 : 0);
    col.addCentered(x, 0.65, z, sx, 1.3, sz, 'metal');
  }

  crates(x: number, z: number, y = 0) {
    const { builder: b, col } = this.ctx;
    b.add(worldBox(0.9, 0.9, 0.9, 1), this.crateMat, x, y + 0.45, z);
    b.add(worldBox(0.9, 0.9, 0.9, 1), this.crateMat, x + 0.2, y + 1.35, z + 0.1, 0, 0.3, 0);
    b.add(worldBox(0.9, 0.9, 0.9, 1), this.crateMat, x, y + 0.45, z + 0.95);
    col.addCentered(x + 0.05, y + 0.9, z + 0.47, 1.05, 1.8, 1.9, 'wood');
  }

  bags(x: number, z: number, n: number, rnd: () => number) {
    const g = new THREE.SphereGeometry(0.35, 8, 6);
    for (let i = 0; i < n; i++) {
      this.ctx.builder.add(g, this.bagMat, x + (rnd() - 0.5) * 1.2, 0.25, z + (rnd() - 0.5) * 1.2, 0, rnd() * 3, 0, 1, 0.75 + rnd() * 0.3, 1);
    }
  }

  bikes(x: number, z: number, n: number, alongZ = true) {
    const { builder: b, mats: m } = this.ctx;
    const wheel = new THREE.TorusGeometry(0.33, 0.025, 4, 16);
    for (let i = 0; i < n; i++) {
      const px = alongZ ? x : x + i * 0.7;
      const pz = alongZ ? z - i * 0.7 : z;
      const ry = alongZ ? Math.PI / 2 + 0.2 : 0.2;
      b.add(wheel, m.darkMetal, px, 0.35, pz, 0, ry, 0);
      b.add(wheel, m.darkMetal, px + (alongZ ? -0.2 : 0), 0.35, pz + (alongZ ? 0 : 0.2), 0, ry, 0);
      b.add(alongZ ? worldBox(0.04, 0.04, 1.0, 1) : worldBox(1.0, 0.04, 0.04, 1), m.darkMetal, px - 0.1, 0.62, pz, 0.3, 0.2, 0);
    }
  }

  /** Low bench (not cover, below step height so it never snags movement). */
  bench(x: number, z: number, alongX: boolean) {
    const { builder: b, mats: m } = this.ctx;
    b.add(alongX ? worldBox(1.8, 0.08, 0.5, 1) : worldBox(0.5, 0.08, 1.8, 1), this.wood, x, 0.45, z);
    for (const s of [-0.75, 0.75]) b.add(worldBox(0.08, 0.42, 0.42, 1), m.darkMetal, alongX ? x + s : x, 0.21, alongX ? z : z + s);
    this.ctx.col.add(alongX ? x - 0.9 : x - 0.25, 0, alongX ? z - 0.25 : z - 0.9, alongX ? x + 0.9 : x + 0.25, 0.49, alongX ? z + 0.25 : z + 0.9, 'wood');
  }

  /** Square concrete planter with bamboo: chest-high cover. */
  planter(x: number, z: number, rnd: () => number) {
    const { builder: b, col, mats: m } = this.ctx;
    b.add(worldBox(1.6, 0.8, 1.6, 1), m.darkConcrete, x, 0.4, z);
    b.add(worldBox(1.4, 0.05, 1.4, 1), this.wood, x, 0.78, z);
    col.addCentered(x, 0.4, z, 1.6, 0.8, 1.6, 'concrete');
    for (let i = 0; i < 9; i++) {
      const h = 2.6 + rnd() * 2.2;
      const px = x + (rnd() - 0.5) * 1.1;
      const pz = z + (rnd() - 0.5) * 1.1;
      b.add(new THREE.CylinderGeometry(0.035, 0.045, h, 5), this.bamboo, px, 0.8 + h / 2, pz, (rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
      b.add(new THREE.ConeGeometry(0.35, 0.9, 5), this.leaf, px, 0.8 + h - 0.1, pz, Math.PI, rnd() * 3, 0);
    }
  }

  bollards(points: [number, number][]) {
    const { builder: b, col, mats: m } = this.ctx;
    const g = new THREE.CylinderGeometry(0.09, 0.11, 0.85, 8);
    for (const [x, z] of points) {
      b.add(g, m.paintedMetal, x, 0.42, z);
      b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), this.guard, x, 0.7, z);
      col.addCentered(x, 0.42, z, 0.2, 0.85, 0.2, 'metal');
    }
  }

  /** Red torii gate spanning a street (pillars are solid). */
  torii(cx: number, z: number, span: number) {
    const { builder: b, col, mats: m } = this.ctx;
    const h = 5.6;
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.22, 0.26, h, 12), this.red, cx + (s * span) / 2, h / 2, z);
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), m.black, cx + (s * span) / 2, 0.2, z);
      col.addCentered(cx + (s * span) / 2, h / 2, z, 0.5, h, 0.5, 'wood');
    }
    b.add(worldBox(span + 2.4, 0.32, 0.45, 1), m.black, cx, h + 0.35, z);
    b.add(worldBox(span + 2.0, 0.34, 0.4, 1), this.red, cx, h - 0.05, z);
    b.add(worldBox(span + 0.6, 0.22, 0.3, 1), this.red, cx, h - 1.1, z);
    b.add(worldBox(0.25, 0.9, 0.2, 1), this.red, cx, h - 0.6, z);
  }

  /** Horizontal pipe run along a wall, with brackets and a valve wheel now and then. */
  pipes(face: Face, wall: number, a0: number, a1: number, heights: number[], green = false) {
    const { builder: b, mats: m } = this.ctx;
    const [nx, nz] = NORMAL[face];
    const alongX = nz !== 0;
    const len = a1 - a0;
    const mid = (a0 + a1) / 2;
    heights.forEach((y, k) => {
      const r = k === 0 ? 0.16 : 0.09;
      const out = 0.25 + k * 0.12;
      const g = new THREE.CylinderGeometry(r, r, len, 8);
      const px = alongX ? mid : wall + nx * out;
      const pz = alongX ? wall + nz * out : mid;
      b.add(g, k % 2 && green ? this.greenPipe : this.pipe, px, y, pz, alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
      for (let a = a0 + 1; a < a1; a += 3) {
        const bx = alongX ? a : wall + nx * out * 0.5;
        const bz = alongX ? wall + nz * out * 0.5 : a;
        b.add(alongX ? worldBox(0.06, 0.06, out, 1) : worldBox(out, 0.06, 0.06, 1), m.darkMetal, bx, y, bz);
      }
    });
    for (let a = a0 + 4; a < a1 - 1; a += 9) {
      const y = heights[0];
      const px = alongX ? a : wall + nx * 0.62;
      const pz = alongX ? wall + nz * 0.62 : a;
      b.add(new THREE.TorusGeometry(0.22, 0.035, 5, 12), this.red, px, y + 0.35, pz, 0, ROT[face], 0);
    }
  }

  /** Chain-link fence panel between two posts. */
  fenceRun(x0: number, z0: number, x1: number, z1: number, h = 3) {
    const { builder: b, col, mats: m } = this.ctx;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 4, uv.getY(i) * h * 4);
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    b.add(g, this.fence, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, ry, 0);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.add(new THREE.CylinderGeometry(0.04, 0.04, h, 6), m.darkMetal, x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t);
    }
    const c = col.add(Math.min(x0, x1) - 0.05, 0, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, h, Math.max(z0, z1) + 0.05, 'metal');
    // Bullets and sight go through the mesh.
    c.ray = false;
  }

  /** Wall-mounted extraction fan with a spinning rotor (instanced across the district). */
  fans(spots: { x: number; y: number; z: number; face: Face }[]) {
    const { builder: b, mats: m, scene } = this.ctx;
    const blade = new THREE.BoxGeometry(0.08, 0.5, 0.02);
    const rotor = new THREE.BufferGeometry();
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const g = blade.clone();
      g.translate(0, 0.25, 0);
      g.rotateZ((i * Math.PI) / 2 + 0.3);
      parts.push(g.toNonIndexed());
    }
    const pos: number[] = [];
    for (const p of parts) pos.push(...(p.attributes.position.array as Float32Array));
    rotor.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rotor.computeVertexNormals();
    const inst = new THREE.InstancedMesh(rotor, m.darkMetal, spots.length);
    const dummy = new THREE.Object3D();
    const speeds = spots.map(() => 4 + Math.random() * 5);
    spots.forEach((s) => {
      const [nx, nz] = NORMAL[s.face];
      const ring = new THREE.TorusGeometry(0.58, 0.05, 6, 20);
      b.add(ring, m.darkMetal, s.x + nx * 0.05, s.y, s.z + nz * 0.05, 0, ROT[s.face], 0);
      b.add(new THREE.CircleGeometry(0.56, 20), m.black, s.x + nx * 0.01, s.y, s.z + nz * 0.01, 0, ROT[s.face], 0);
    });
    scene.add(inst);
    this.updaters.push((t) => {
      spots.forEach((s, i) => {
        const [nx, nz] = NORMAL[s.face];
        dummy.position.set(s.x + nx * 0.08, s.y, s.z + nz * 0.08);
        dummy.rotation.set(0, ROT[s.face], t * speeds[i], 'YXZ');
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Strings of paper lanterns hung across a street. One InstancedMesh per lantern design,
   * swaying with the wind on the CPU (a few dozen matrices per frame).
   */
  lanternStrings(rows: { x0: number; x1: number; z: number; y: number; n: number }[], wind: () => number) {
    const { scene } = this.ctx;
    const items: { mat: number; base: THREE.Vector3; phase: number }[] = [];
    rows.forEach((r, ri) => {
      this.cableLine(new THREE.Vector3(r.x0, r.y + 0.6, r.z), new THREE.Vector3(r.x1, r.y + 0.6, r.z), 0.5, 0.012);
      for (let i = 0; i < r.n; i++) {
        const t = (i + 0.5) / r.n;
        const x = r.x0 + (r.x1 - r.x0) * t;
        const sag = 0.5 * 4 * t * (1 - t);
        items.push({ mat: (i + ri) % 3, base: new THREE.Vector3(x, r.y + 0.6 - sag - 0.55, r.z), phase: Math.random() * 6 });
      }
    });
    const meshes = this.lanternMats.map((mat, k) => {
      const count = items.filter((it) => it.mat === k).length;
      const im = new THREE.InstancedMesh(this.lanternGeo, mat, Math.max(1, count));
      im.count = count;
      im.frustumCulled = false;
      scene.add(im);
      return im;
    });
    const dummy = new THREE.Object3D();
    const update = (t: number) => {
      const w = wind();
      const idx = [0, 0, 0];
      for (const it of items) {
        const sway = Math.sin(t * 1.3 + it.phase) * 0.08 + w * 0.12;
        dummy.position.copy(it.base);
        dummy.position.z += Math.sin(sway) * 0.4;
        dummy.rotation.set(sway, it.phase, 0);
        dummy.scale.setScalar(0.85);
        dummy.updateMatrix();
        meshes[it.mat].setMatrixAt(idx[it.mat]++, dummy.matrix);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    };
    update(0);
    this.updaters.push((t) => update(t));
    return items.map((it) => it.base);
  }

  /** Street-side ramen stall: counter, stools, noren curtain and a hanging lantern. Counter is cover. */
  yatai(x: number, z: number) {
    const { builder: b, col, mats: m } = this.ctx;
    b.add(worldBox(3.2, 1.05, 1.0, 1), this.wood, x, 0.525, z);
    b.add(worldBox(3.4, 0.06, 1.2, 1), m.darkMetal, x, 1.08, z);
    col.addCentered(x, 0.55, z, 3.2, 1.1, 1.0, 'wood');
    for (const s of [-1.5, 1.5]) b.add(worldBox(0.1, 2.4, 0.1, 1), this.wood, x + s, 1.2, z - 0.45);
    b.add(worldBox(3.6, 0.08, 1.6, 1), this.red, x, 2.45, z - 0.1, -0.12, 0, 0);
    const noren = new THREE.PlaneGeometry(0.62, 0.55, 1, 1);
    for (let i = 0; i < 5; i++) b.add(noren, this.noren, x - 1.25 + i * 0.63, 2.1, z + 0.52);
    const stool = new THREE.CylinderGeometry(0.18, 0.15, 0.62, 10);
    for (let i = 0; i < 4; i++) b.add(stool, m.darkMetal, x - 1.2 + i * 0.8, 0.31, z + 0.95);
  }

  /** Electrical cabinet mesh (behaviour lives in Interactives). Faces outwards from a wall. */
  cabinet(x: number, z: number, face: Face, y = 0) {
    const { builder: b, col, mats: m } = this.ctx;
    const alongX = NORMAL[face][1] !== 0;
    const w = 1.2, d = 0.5, h = 1.9;
    b.add(alongX ? worldBox(w, h, d, 1) : worldBox(d, h, w, 1), m.paintedMetal, x, y + h / 2, z);
    b.add(alongX ? worldBox(w + 0.1, 0.08, d + 0.15, 1) : worldBox(d + 0.15, 0.08, w + 0.1, 1), m.darkMetal, x, y + h + 0.04, z);
    return alongX ? col.addCentered(x, y + h / 2, z, w, h, d, 'metal') : col.addCentered(x, y + h / 2, z, d, h, w, 'metal');
  }

  update(t: number, dt: number) {
    for (const u of this.updaters) u(t, dt);
  }
}
