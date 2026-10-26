import * as THREE from 'three';
import type { StaticBuilder } from './Builder';
import { propKits, type MercPart } from '../entities/weapons/models';
import type { FacadeTex } from './Textures';
import { futonTexture, laundryTexture, planarInto, verticalCell, verticalSigns } from './StoreSigns';
import { applyWear } from './Wear';

/*
  80.0, the facades above the street (docs/TOKYO_PLAN.md, step 3), from tools/blender/props_facade.py:

    balconies   under the painted windows of a block's street faces (the tile's own: where its columns
                and floors fall on that face), from 12.8 m up only: over every roof's reach (8.5 m and
                a jump), so they stop nothing and hide nobody; one window in four or so, laundry or a
                futon, plants, the air conditioner
    roof tanks  the panel tanks on their stands where the blocks had a cylinder on a box
    tate-kanban vertical sign stacks out over a street (from 3.5 m: over the head), their panels lit

  Nothing is added to the colliders. Without the kit the city is as it was.
*/

export type Face = 'n' | 's' | 'e' | 'w';

function hash(a: number, b: number, c = 0) {
  let h = Math.imul(Math.round(a * 10) | 0, 73856093) ^ Math.imul(Math.round(b * 10) | 0, 19349663) ^ Math.imul(Math.round(c * 10) | 0, 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** The facade's turn: its front (+Z) out along the face's normal. */
const RY: Record<Face, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export class FacadeDress {
  private kit: Record<string, readonly MercPart[]> | null;
  private mats: Record<string, THREE.Material>;
  private frp: THREE.Material[];
  private laundry: THREE.Material;
  private futon: THREE.Material;
  private signs: THREE.Material;
  private nSign = 0;
  /** DEV: what was laid. */
  stats = { balconies: 0, tanks: 0, stacks: 0, lowest: Infinity, at: [] as number[][] };
  /** Balconies start at this floor height (m): over the roofs' reach. */
  static readonly MIN_Y = 12.8;

  constructor(private b: StaticBuilder) {
    const k = propKits();
    this.kit = k && k.balc_a ? (k as Record<string, readonly MercPart[]>) : null;
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.8, ...o });
    this.mats = {
      concrete: applyWear(std({ color: 0x8a8a8c, roughness: 0.85 }), 'concrete'),
      metal: applyWear(std({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 }), 'metal'),
      panel: std({ color: 0xb8c2c8, metalness: 0.2, roughness: 0.25, envMapIntensity: 1.0, emissive: 0x3a4a5a, emissiveIntensity: 0.6 }),
      plastic: applyWear(std({ color: 0xd8d6cc, roughness: 0.5 }), 'plastic'),
      leaf: std({ color: 0x2e5a26, roughness: 0.8, flatShading: true }),
      pot: applyWear(std({ color: 0x8a4a2a, roughness: 0.8 }), 'concrete'),
    };
    this.frp = [0x3d7fa8, 0xc8bfa8, 0x7a9aa8].map((c) => applyWear(std({ color: c, roughness: 0.45 }), 'plastic'));
    this.laundry = std({ map: laundryTexture(), roughness: 0.95, side: THREE.DoubleSide, emissive: 0x2a2630, emissiveIntensity: 0.6 });
    this.futon = std({ map: futonTexture(), roughness: 0.95 });
    const v = verticalSigns();
    this.signs = std({ map: v, emissiveMap: v, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3 });
  }

  get ready() {
    return !!this.kit;
  }

  private put(node: string, M: THREE.Matrix4, key: number, pick?: (p: MercPart) => [THREE.BufferGeometry, THREE.Material] | null) {
    for (const p of this.kit![node]) {
      const own = pick?.(p);
      if (own) {
        this.b.addMatrix(own[0], own[1], M);
        if (own[0] !== p.geo) own[0].dispose();
        continue;
      }
      const mat = p.role === 'frp' ? this.frp[key % this.frp.length] : this.mats[p.role];
      if (mat) this.b.addMatrix(p.geo, mat, M);
    }
  }

  /**
   * Balconies on one face of a block: the face (`face`, its wall plane `wall`, along from `a0` to `a1`),
   * the block's box (x0..z1, from y0 up to h), the facade tile's u offset and windows.
   */
  balconies(face: Face, wall: number, a0: number, a1: number, box: { x0: number; x1: number; z0: number; z1: number; y0: number; h: number }, uOff: number, win: FacadeTex['windows']) {
    if (!this.kit) return;
    const { x0, x1, z0, z1, y0, h } = box;
    // Along the face from the tile's u: n and e run backwards (BoxGeometry's -z and +x faces).
    const along = (u: number) => (face === 'n' ? x1 - (u - uOff) * 16 : face === 's' ? x0 + (u - uOff) * 16 : face === 'e' ? z1 - (u - uOff) * 16 : z0 + (u - uOff) * 16);
    const len = face === 'n' || face === 's' ? x1 - x0 : z1 - z0;
    const alongX = face === 'n' || face === 's';
    for (let m = Math.ceil((FacadeDress.MIN_Y - y0) / 3.2); y0 + (m + 1) * 3.2 <= h - 0.4; m++) {
      const floorY = y0 + m * 3.2;
      const f = 4 - (((m % 5) + 5) % 5);
      for (let n = Math.floor(uOff) - 1; n <= Math.ceil(uOff + len / 16) + 1; n++)
        for (let i = 0; i < win.cols; i++) {
          if (win.cols === 8 && i % 2) continue;
          const a = along(n + (i + 0.5) / win.cols);
          if (a < Math.max(a0, alongX ? x0 : z0) + 1.5 || a > Math.min(a1, alongX ? x1 : z1) - 1.5) continue;
          const w = win.at[f * win.cols + i];
          const key = hash(a, floorY, wall);
          if (!w || key % 100 >= 30) continue;
          const base = alongX ? new THREE.Vector3(a, floorY - 0.15, wall) : new THREE.Vector3(wall, floorY - 0.15, a);
          const M = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), RY[face]), new THREE.Vector3(1, 1, 1));
          const node = key % 3 === 0 ? 'balc_b' : 'balc_a';
          const c = (key >>> 4) % 3;
          this.put(node, M, key, (p) =>
            p.role === 'laundry' ? [planarInto(p.geo, [c / 3, 0, (c + 1) / 3, 1]), this.laundry] : p.role === 'futon' ? [planarInto(p.geo, [c / 3, 0, (c + 1) / 3, 1]), this.futon] : null,
          );
          this.stats.balconies++;
          if (this.stats.at.length < 6) this.stats.at.push([+base.x.toFixed(1), +base.y.toFixed(1), +base.z.toFixed(1), RY[face]]);
          this.stats.lowest = Math.min(this.stats.lowest, floorY - 0.15);
        }
    }
  }

  /** A roof tank on its stand at (x, roof, z); false without the kit. */
  tank(x: number, roof: number, z: number) {
    if (!this.kit) return false;
    const key = hash(x, z, roof);
    this.put('rtank', new THREE.Matrix4().compose(new THREE.Vector3(x, roof, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (key % 4) * (Math.PI / 2)), new THREE.Vector3(1, 1, 1)), key);
    this.stats.tanks++;
    return true;
  }

  /** A sign stack on a face's wall at `along`, its foot `y` up (over head height). */
  tatekan(face: Face, wall: number, along: number, y: number) {
    if (!this.kit) return false;
    const alongX = face === 'n' || face === 's';
    const base = alongX ? new THREE.Vector3(along, y, wall) : new THREE.Vector3(wall, y, along);
    const M = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), RY[face]), new THREE.Vector3(1, 1, 1));
    const first = this.nSign;
    this.nSign += 5;
    this.put('tatekan', M, 0, (p) => (p.role === 'signface' ? [panels(p.geo, first), this.signs] : null));
    this.stats.stacks++;
    return true;
  }
}

/**
 * The stack's ten panel faces (five up it, each lit both ways): each its own vertical sign, read the
 * right way round from either side (the +X face's u runs towards -Z).
 */
function panels(geo: THREE.BufferGeometry, first: number) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  g.computeBoundingBox();
  const zMin = g.boundingBox!.min.z, zMax = g.boundingBox!.max.z;
  for (let t = 0; t < p.count; t += 3) {
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const k = Math.max(0, Math.min(4, Math.floor((cy - 0.1) / 1.18)));
    const y0 = 0.1 + k * 1.18 + 0.06, y1 = y0 + 1.06;
    const r = verticalCell(first + k);
    for (let i = 0; i < 3; i++) {
      const s = (p.getZ(t + i) - zMin) / (zMax - zMin);
      const u = cx > 0 ? 1 - s : s;
      uv[(t + i) * 2] = r[0] + u * (r[2] - r[0]);
      uv[(t + i) * 2 + 1] = r[1] + ((p.getY(t + i) - y0) / (y1 - y0)) * (r[3] - r[1]);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
