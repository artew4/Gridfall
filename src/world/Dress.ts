import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StaticBuilder } from './Builder';
import type { MercPart } from '../entities/weapons/models';

/*
  68.0, the dresser (docs/ENVIRONMENT_PLAN.md): a map's prop boxes drawn as Blender models.

  A map registers which of its materials are props (`rule`); its StaticBuilder then offers every box
  in such a material here first (Builder.dresser), and the box is drawn as models fitted to exactly
  its bounds, merged into the map's static meshes like any box (no draw calls added). The collider
  was added apart and is untouched: what the bots walk, what stops a round, what the tests measure.

    crate, case   one model stretched to the box (turned a quarter so its long side runs the box's)
    hesco         cells along the run, as many as fit a metre each, the height and depth the box's
    sandbag       courses of bags laid bond-wise (every other course offset by half a bag), each bag
                  a little turned and sized from a seed, so no two walls are the same

  Roles take the map's materials (`mats`); a placement may override one (a crate's `label`: its own
  stencil texture). The label panels' UVs are planar over each panel (the back one unmirrored).
*/

export type DressKind = 'crate' | 'case' | 'hesco' | 'sandbag' | 'drum';
type Over = Partial<Record<string, THREE.Material>>;

interface Node {
  parts: { geo: THREE.BufferGeometry; role: string }[];
  size: THREE.Vector3;
  min: THREE.Vector3;
}

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _t = new THREE.Matrix4();

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Planar UVs over a label panel (x, y of its bounds; the panel facing -Z turned round). */
function labelUV(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeBoundingBox();
  const b = g.boundingBox!, p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  // (Both panels may be one geometry: each vertex by its own side.)
  const dx = b.max.x - b.min.x || 1, dy = b.max.y - b.min.y || 1, cz = (b.min.z + b.max.z) / 2;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - b.min.x) / dx;
    uv[i * 2] = p.getZ(i) < cz ? 1 - u : u;
    uv[i * 2 + 1] = (p.getY(i) - b.min.y) / dy;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class Dresser {
  /** DEV: the boxes it took and the models it laid. */
  stats = { boxes: 0, pieces: 0, byKind: {} as Record<string, number>, big: [] as number[][] };
  private nodes = new Map<string, Node>();
  private rules = new Map<THREE.Material, { kind: DressKind; over?: Over }>();
  private rnd = mulberry(68);
  /** Geometry made here (the panels' UVs): freed once the map is built. */
  private owned: THREE.BufferGeometry[] = [];
  /** The bags (thousands on a map): one instanced mesh per role, not merged geometry. */
  private bagAt: THREE.Matrix4[] = [];
  /** The walls' boxes: they cast the walls' shadows (thousands of bags in the shadow pass cost 0.5 ms). */
  private bagWalls: THREE.BufferGeometry[] = [];

  constructor(
    private b: StaticBuilder,
    kit: Readonly<Record<string, readonly MercPart[]>>,
    private mats: Record<string, THREE.Material>,
  ) {
    for (const [name, parts] of Object.entries(kit)) {
      const box = new THREE.Box3();
      const list = parts.map((p) => {
        const geo = p.role === 'label' ? labelUV(p.geo) : p.geo;
        if (geo !== p.geo) this.owned.push(geo);
        geo.computeBoundingBox();
        box.union(geo.boundingBox!);
        return { geo, role: p.role };
      });
      this.nodes.set(name, { parts: list, size: box.getSize(new THREE.Vector3()), min: box.min.clone() });
    }
    b.dresser = (geo, mat, m) => this.box(geo, mat, m);
  }

  /** Boxes in `mat` are drawn as `kind` from now on (`over`: roles it paints its own way). */
  rule(mat: THREE.Material, kind: DressKind, over?: Over) {
    this.rules.set(mat, { kind, over });
  }

  /** A model at `m` (world), scaled from its real size by (sx, sy, sz), its base centre at the origin. */
  place(kind: DressKind | 'bag', m: THREE.Matrix4, over?: Over) {
    const node = this.nodes.get(kind);
    if (!node) return false;
    // Recentre: the model's base centre to the origin.
    _t.makeTranslation(-(node.min.x + node.size.x / 2), -node.min.y, -(node.min.z + node.size.z / 2));
    const world = _m.multiplyMatrices(m, _t);
    for (const p of node.parts) {
      const mat = over?.[p.role] ?? this.mats[p.role];
      if (mat) this.b.addMatrix(p.geo, mat, world);
    }
    this.stats.pieces++;
    this.stats.byKind[kind] = (this.stats.byKind[kind] ?? 0) + 1;
    return true;
  }

  /** The instanced bags into `parent` (after the map's boxes are all in). */
  finish(parent: THREE.Object3D) {
    this.b.dresser = null;
    const node = this.nodes.get('bag');
    if (!node || !this.bagAt.length) return;
    const recentre = new THREE.Matrix4().makeTranslation(-(node.min.x + node.size.x / 2), -node.min.y, -(node.min.z + node.size.z / 2));
    for (const p of node.parts) {
      const mat = this.mats[p.role];
      if (!mat) continue;
      const geo = p.geo.clone().applyMatrix4(recentre);
      const im = new THREE.InstancedMesh(geo, mat, this.bagAt.length);
      this.bagAt.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false;
      im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      im.userData.dressed = true;
      parent.add(im);
    }
    // The shadow casters: the walls' boxes, drawn into the shadow map only (no colour, no depth).
    const walls = mergeGeometries(this.bagWalls.map((g) => g.toNonIndexed()));
    if (walls) {
      const caster = new THREE.Mesh(walls, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      caster.castShadow = true;
      caster.matrixAutoUpdate = false;
      caster.userData.shadowOnly = true;
      parent.add(caster);
    }
    this.bagWalls.forEach((g) => g.dispose());
    this.bagWalls = [];
    this.stats.byKind.bag = this.bagAt.length;
    this.stats.pieces += this.bagAt.length;
    this.bagAt = [];
  }

  /** After the map's builder has merged (it copied what it took): the geometry made here freed. */
  dispose() {
    this.owned.forEach((g) => g.dispose());
    this.owned = [];
  }

  private box(geo: THREE.BoxGeometry, mat: THREE.Material, m: THREE.Matrix4): boolean {
    const rule = this.rules.get(mat);
    if (!rule) return false;
    const { width: w, height: h, depth: d } = geo.parameters;
    // The box's own frame: its base centre, its long side along X.
    const along = w >= d;
    const L = along ? w : d, D = along ? d : w;
    const base = new THREE.Matrix4().multiplyMatrices(m, _t.makeTranslation(0, -h / 2, 0));
    if (!along) base.multiply(_r.makeRotationY(Math.PI / 2));
    const ok = rule.kind === 'sandbag' ? this.bags(base, L, h, D) : rule.kind === 'hesco' ? this.cells(base, L, h, D) : this.one(rule.kind, base, L, h, D, rule.over);
    if (ok) this.stats.boxes++;
    return ok;
  }

  /** One model stretched to the box. */
  private one(kind: DressKind, base: THREE.Matrix4, L: number, h: number, D: number, over?: Over) {
    const n = this.nodes.get(kind);
    if (!n) return false;
    const s = _s.makeScale(L / n.size.x, h / n.size.y, D / n.size.z);
    return this.place(kind, base.clone().multiply(s), over);
  }

  /** HESCO cells down the run. */
  private cells(base: THREE.Matrix4, L: number, h: number, D: number) {
    const n = this.nodes.get('hesco');
    if (!n) return false;
    const k = Math.max(1, Math.round(L / 1.0)), cl = L / k;
    for (let i = 0; i < k; i++) {
      const at = new THREE.Matrix4().makeTranslation(-L / 2 + (i + 0.5) * cl, 0, 0);
      this.place('hesco', base.clone().multiply(at).multiply(_s.makeScale(cl / n.size.x, h / n.size.y, D / n.size.z)));
    }
    return true;
  }

  /** Sandbags in courses, bond-wise. */
  private bags(base: THREE.Matrix4, L: number, h: number, D: number) {
    const n = this.nodes.get('bag');
    if (!n) return false;
    const courses = Math.max(1, Math.round(h / 0.135)), bh = h / courses;
    const nA = Math.max(1, Math.round(L / 0.48)), bl = L / nA;
    const nD = Math.max(1, Math.round(D / 0.28)), bd = D / nD;
    const r = this.rnd;
    this.bagWalls.push(new THREE.BoxGeometry(L, h, D).translate(0, h / 2, 0).applyMatrix4(base));
    if (courses * nA * nD > 150) this.stats.big.push([+L.toFixed(2), +h.toFixed(2), +D.toFixed(2), courses * nA * nD, +base.elements[12].toFixed(1), +base.elements[13].toFixed(1), +base.elements[14].toFixed(1)]);
    for (let c = 0; c < courses; c++) {
      // Every other course offset by half a bag (half bags at its ends).
      const lens = c % 2 && nA > 1 ? [bl / 2, ...new Array(nA - 1).fill(bl), bl / 2] : new Array(nA).fill(bl);
      for (let j = 0; j < nD; j++) {
        // (A thick wall's inner rows are never seen but on its top course.)
        if (j > 0 && j < nD - 1 && c < courses - 1) continue;
        let x = -L / 2;
        for (const len of lens) {
          const jitter = (r() - 0.5) * 0.012;
          const at = new THREE.Matrix4().makeTranslation(x + len / 2 + jitter, c * bh, -D / 2 + (j + 0.5) * bd + (r() - 0.5) * 0.015);
          const turn = _r.makeRotationY((r() - 0.5) * 0.09);
          // A touch over size, so neighbours press into each other with no daylight between them.
          const sc = _s.makeScale((len / n.size.x) * 1.06, (bh / n.size.y) * (1.12 + r() * 0.06), (bd / n.size.z) * 1.05);
          this.bagAt.push(base.clone().multiply(at).multiply(turn).multiply(sc));
          x += len;
        }
      }
    }
    return true;
  }
}
