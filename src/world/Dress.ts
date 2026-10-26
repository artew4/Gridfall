import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StaticBuilder } from './Builder';
import type { MercPart } from '../entities/weapons/models';
import { canvasTexture, hescoTexture, rubberTexture, woodTexture } from '../levels/desert/textures';

/*
  68.0, the dresser (docs/ENVIRONMENT_PLAN.md): a map's prop boxes drawn as Blender models.

  A map registers which of its materials are props (`rule`); its StaticBuilder then offers every box
  in such a material here first (Builder.dresser), and the box is drawn as models fitted to exactly
  its bounds, merged into the map's static meshes like any box (no draw calls added). The collider
  was added apart and is untouched: what the bots walk, what stops a round, what the tests measure.

    crate, case,  one model stretched to the box (turned a quarter so its long side runs the box's)
    jersey
    stack         69.0: cargo: crates on pallets in a grid over the box (columns about 1.25 x 1.05 m,
                  crates about 0.9 m tall), each a hair inside its cell so the joins show
    hesco         cells along the run, as many as fit a metre each, the height and depth the box's
    sandbag       courses of bags laid bond-wise (every other course offset by half a bag), each bag
                  a little turned and sized from a seed, so no two walls are the same

  Roles take the map's materials (`mats`); a placement may override one (a crate's `label`: its own
  stencil texture). The label panels' UVs are planar over each panel (the back one unmirrored).
*/

export type DressKind = 'crate' | 'case' | 'hesco' | 'sandbag' | 'drum' | 'jersey' | 'stack' | 'tyre' | 'spool' | 'pallet';
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
  stats = { boxes: 0, pieces: 0, byKind: {} as Record<string, number>, big: [] as number[][], at: {} as Record<string, number[][]> };
  private nodes = new Map<string, Node>();
  private rules = new Map<THREE.Material, { kind: DressKind; over?: Over }>();
  private rnd = mulberry(68);
  /** Geometry made here (the panels' UVs): freed once the map is built. */
  private owned: THREE.BufferGeometry[] = [];
  /** The materials something was drawn in (the kit's own unused ones are freed). */
  private used = new Set<THREE.Material>();
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
      if (mat) {
        this.used.add(mat);
        this.b.addMatrix(p.geo, mat, world);
      }
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
      this.used.add(mat);
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
    for (const m of Object.values(this.mats))
      if (m.userData.dressOwn && !this.used.has(m)) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
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
    // DEV: where the first few of each kind are (for screenshots).
    const seen = (this.stats.at[rule.kind] ??= []);
    if (seen.length < 4) seen.push([+m.elements[12].toFixed(1), +m.elements[13].toFixed(1), +m.elements[14].toFixed(1)]);
    const ok =
      rule.kind === 'sandbag' ? this.bags(base, L, h, D) : rule.kind === 'hesco' ? this.cells(base, L, h, D) : rule.kind === 'stack' ? this.stack(base, L, h, D, rule.over) : this.one(rule.kind, base, L, h, D, rule.over);
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

  /** 69.0: crates on pallets in a grid over the box (cargo). */
  private stack(base: THREE.Matrix4, L: number, h: number, D: number, over?: Over) {
    const crate = this.nodes.get('crate'), pal = this.nodes.get('pallet');
    if (!crate || !pal) return false;
    const nx = Math.max(1, Math.round(L / 1.25)), nz = Math.max(1, Math.round(D / 1.05));
    const cx = L / nx, cz = D / nz, ph = Math.min(0.144, h * 0.2);
    const ny = Math.max(1, Math.round((h - ph) / 0.9)), cy = (h - ph) / ny;
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const x = -L / 2 + (i + 0.5) * cx, z = -D / 2 + (k + 0.5) * cz;
        const at = (y: number) => base.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
        this.place('pallet', at(0).multiply(_s.makeScale(cx / pal.size.x, ph / pal.size.y, cz / pal.size.z)));
        for (let j = 0; j < ny; j++) {
          // A hair inside the cell (the joins between crates show), a crate a little narrower up the stack.
          const k2 = 0.965 - j * 0.02;
          this.place('crate', at(ph + j * cy).multiply(_s.makeScale((cx * k2) / crate.size.x, (cy * 0.99) / crate.size.y, (cz * k2) / crate.size.z)), over);
        }
      }
    return true;
  }

  /**
   * 69.0: models into instanced meshes (one per role) for maps that place their pieces as instances:
   * each matrix puts the model's base centre (`size`: the model scaled to it first; `unit`: the matrix
   * scales a unit box centred on the origin, as the map's own instanced boxes did; the model fills it).
   */
  instances(kind: DressKind | 'bag', ms: THREE.Matrix4[], parent: THREE.Object3D, over?: Over, fit?: { unit?: boolean; size?: [number, number, number] }) {
    const node = this.nodes.get(kind);
    if (!node || !ms.length) return false;
    const recentre = new THREE.Matrix4().makeTranslation(-(node.min.x + node.size.x / 2), -node.min.y, -(node.min.z + node.size.z / 2));
    const size = fit?.unit ? [1, 1, 1] : fit?.size;
    if (size) recentre.premultiply(new THREE.Matrix4().makeScale(size[0] / node.size.x, size[1] / node.size.y, size[2] / node.size.z));
    if (fit?.unit) recentre.premultiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0));
    for (const p of node.parts) {
      const mat = over?.[p.role] ?? this.mats[p.role];
      if (!mat) continue;
      this.used.add(mat);
      const im = new THREE.InstancedMesh(p.geo.clone().applyMatrix4(recentre), mat, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = true;
      im.userData.dressed = true;
      parent.add(im);
    }
    this.stats.byKind[kind] = (this.stats.byKind[kind] ?? 0) + ms.length;
    this.stats.pieces += ms.length;
    return true;
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

/**
 * 69.0: the military kit's roles in plain materials, from the Desert's textures (a map tints them: its
 * HESCO greener, its wood darker); a map passes its own where it has them.
 */
export function militaryMats(tint: Partial<Record<string, number>> = {}, own: Partial<Record<string, THREE.Material>> = {}): Record<string, THREE.Material> {
  const std = (map: THREE.Texture | null, color: number, rough = 0.9, metal = 0, env = 0.3) => new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const liner = hescoTexture();
  liner.wrapS = liner.wrapT = THREE.RepeatWrapping;
  liner.repeat.set(1.7, 1.7);
  const t = (k: string, c: number) => tint[k] ?? c;
  const base: Record<string, THREE.Material> = {
    wood: std(woodTexture(), t('wood', 0xffffff), 0.85),
    metal: std(null, t('metal', 0x3a3b38), 0.5, 0.7, 0.5),
    rope: std(canvasTexture('#7a6646'), t('rope', 0xffffff), 0.95),
    label: std(woodTexture(), 0xffffff, 0.85),
    plastic: std(null, t('plastic', 0x3d3f34), 0.55, 0.05, 0.5),
    paint: std(null, t('paint', 0x4a5232), 0.6, 0.3, 0.5),
    canvas: std(canvasTexture('#ad9670'), t('canvas', 0xffffff), 0.97),
    liner: std(liner, t('liner', 0xffffff), 0.95),
    wire: std(null, t('wire', 0x3a3b38), 0.5, 0.6, 0.5),
    concrete: std(null, t('concrete', 0xb9b5ac), 0.92, 0, 0.25),
    rubber: std(rubberTexture(), t('rubber', 0xffffff), 0.9, 0, 0.2),
    cable: std(null, t('cable', 0x1b1c1e), 0.6, 0.1, 0.3),
  };
  // (Marked: the dresser frees those of them no prop used.)
  for (const m of Object.values(base)) m.userData.dressOwn = true;
  return { ...base, ...own } as Record<string, THREE.Material>;
}
