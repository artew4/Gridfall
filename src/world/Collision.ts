import * as THREE from 'three';

export type Surface = 'concrete' | 'metal' | 'glass' | 'wood' | 'flesh';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  surface: Surface;
  /** Blocks movement (false for things like high cables that only stop bullets). */
  solid: boolean;
  /** Stops bullets and line of sight. */
  ray: boolean;
  /** Its top can be stood on (false for the stepped fill under a stair ramp). */
  floor: boolean;
  kind: 'box' | 'ramp' | 'cyl';
  /** Ramp: height runs linearly from h0 at min[axis] to h1 at max[axis]. */
  axis?: 'x' | 'z';
  h0?: number;
  h1?: number;
  /** Cylinder: centre and radius in XZ. */
  cx?: number;
  cz?: number;
  r?: number;
  /** A railing the player can jump over mid-jump (NPCs never vault). */
  vault?: boolean;
  /** Called when a player bullet hits this collider. */
  onHit?: (hit: RayHit) => void;
  /** Broadphase dedupe stamp. */
  stamp: number;
}

export interface RayHit {
  dist: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: Surface;
  collider?: Collider | null;
}

const CELL = 8;

/**
 * Box world with two extras for the district: invisible stair ramps (smooth walkable slopes that
 * never block sideways) and vertical cylinders (the fountain). A uniform XZ grid keeps queries cheap.
 */
export class CollisionWorld {
  colliders: Collider[] = [];
  /** XZ rects where the ground plane at y=0 is absent (stairwells down to the metro). */
  holes: { x0: number; z0: number; x1: number; z1: number }[] = [];
  private grid = new Map<number, Collider[]>();
  private dirty = true;
  private stampN = 0;
  private _list: Collider[] = [];

  private push(c: Collider) {
    this.colliders.push(c);
    this.dirty = true;
    return c;
  }

  add(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, surface: Surface = 'concrete', solid = true) {
    return this.push({
      min: new THREE.Vector3(Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ)),
      surface,
      solid,
      ray: true,
      floor: true,
      kind: 'box',
      stamp: 0,
    });
  }

  addCentered(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, surface: Surface = 'concrete') {
    return this.add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, surface);
  }

  /** Walkable slope. Only affects standing height; sides must be closed with ordinary boxes. */
  addRamp(minX: number, minZ: number, maxX: number, maxZ: number, axis: 'x' | 'z', h0: number, h1: number) {
    return this.push({
      min: new THREE.Vector3(minX, Math.min(h0, h1), minZ),
      max: new THREE.Vector3(maxX, Math.max(h0, h1), maxZ),
      surface: 'concrete',
      solid: false,
      ray: false,
      floor: true,
      kind: 'ramp',
      axis,
      h0,
      h1,
      stamp: 0,
    });
  }

  addCylinder(cx: number, cz: number, r: number, y0: number, y1: number, surface: Surface = 'concrete') {
    return this.push({
      min: new THREE.Vector3(cx - r, y0, cz - r),
      max: new THREE.Vector3(cx + r, y1, cz + r),
      surface,
      solid: true,
      ray: true,
      floor: true,
      kind: 'cyl',
      cx,
      cz,
      r,
      stamp: 0,
    });
  }

  private key(ix: number, iz: number) {
    return (ix + 512) * 1024 + (iz + 512);
  }

  private rebuild() {
    this.grid.clear();
    for (const c of this.colliders) {
      const x0 = Math.floor(c.min.x / CELL), x1 = Math.floor(c.max.x / CELL);
      const z0 = Math.floor(c.min.z / CELL), z1 = Math.floor(c.max.z / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this.key(ix, iz);
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(c);
        }
      }
    }
    this.dirty = false;
  }

  /** Colliders whose cells overlap an XZ rectangle (deduped). Falls back to everything for huge areas. */
  private query(x0: number, z0: number, x1: number, z1: number): Collider[] {
    if (this.dirty) this.rebuild();
    const ix0 = Math.floor(x0 / CELL), ix1 = Math.floor(x1 / CELL);
    const iz0 = Math.floor(z0 / CELL), iz1 = Math.floor(z1 / CELL);
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 48) return this.colliders;
    const s = ++this.stampN;
    const out = this._list;
    out.length = 0;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const l = this.grid.get(this.key(ix, iz));
        if (!l) continue;
        for (const c of l) {
          if (c.stamp === s) continue;
          c.stamp = s;
          out.push(c);
        }
      }
    }
    return out;
  }

  inHole(x: number, z: number) {
    for (const h of this.holes) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true;
    return false;
  }

  /** Ramp surface height at a point (clamped into the ramp's footprint). */
  rampHeight(c: Collider, x: number, z: number) {
    const a = c.axis === 'x' ? x : z;
    const lo = c.axis === 'x' ? c.min.x : c.min.z;
    const hi = c.axis === 'x' ? c.max.x : c.max.z;
    const t = Math.max(0, Math.min(1, (a - lo) / (hi - lo)));
    return c.h0! + (c.h1! - c.h0!) * t;
  }

  /**
   * Pushes a vertical cylinder (feet at pos.y) out of all solids it overlaps, in XZ.
   * Iterated a few times so corners resolve cleanly. Returns true if any contact happened.
   */
  resolveCircle(pos: THREE.Vector3, radius: number, height: number, step = 0.3, vaulting = false): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.solid) continue;
        // Low boxes (curbs) are stepped onto rather than blocking; high ones are walked under.
        if (pos.y + height < c.min.y || c.max.y <= pos.y + step) continue;
        // Mid-jump with the feet high enough: clear the railing.
        if (vaulting && c.vault && pos.y > c.max.y - 0.62) continue;
        if (c.kind === 'cyl') {
          const dx = pos.x - c.cx!;
          const dz = pos.z - c.cz!;
          const d = Math.hypot(dx, dz);
          const min = c.r! + radius;
          if (d >= min) continue;
          if (d > 1e-5) {
            pos.x = c.cx! + (dx / d) * min;
            pos.z = c.cz! + (dz / d) * min;
          } else pos.x = c.cx! + min;
          moved = hit = true;
          continue;
        }
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre is inside the box: push out along the axis of least penetration.
          const left = pos.x - c.min.x + radius;
          const right = c.max.x - pos.x + radius;
          const back = pos.z - c.min.z + radius;
          const front = c.max.z - pos.z + radius;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = c.min.x - radius;
          else if (m === right) pos.x = c.max.x + radius;
          else if (m === back) pos.z = c.min.z - radius;
          else pos.z = c.max.z + radius;
        }
        moved = true;
        hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Highest walkable surface under a point that is no more than `reach` above the feet. */
  groundHeightAt(x: number, z: number, radius: number, feetY: number, reach = 0.3): number {
    // The street plane only exists outside stairwells and only for things above it.
    let h = feetY < -0.6 || this.inHole(x, z) ? -Infinity : 0;
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.floor || (!c.solid && c.kind !== 'ramp')) continue;
      if (x + radius < c.min.x || x - radius > c.max.x || z + radius < c.min.z || z - radius > c.max.z) continue;
      let top: number;
      if (c.kind === 'ramp') {
        // Sampled at the uphill edge of the foot circle (clamped into the footprint): smooth along the
        // slope and flush with the deck at the top, where box floors also count from the circle's edge.
        const up = c.h1! > c.h0! ? radius : -radius;
        top = c.axis === 'x' ? this.rampHeight(c, x + up, z) : this.rampHeight(c, x, z + up);
      } else if (c.kind === 'cyl') {
        if (Math.hypot(x - c.cx!, z - c.cz!) > c.r! + radius) continue;
        top = c.max.y;
      } else top = c.max.y;
      // Ramps are continuous surfaces: a slightly bigger step onto them is never a ledge.
      if (top > feetY + (c.kind === 'ramp' ? Math.max(reach, 0.5) : reach)) continue;
      if (top > h) h = top;
    }
    return h;
  }

  /** True if a standing cylinder at pos overlaps any solid (used to validate spawns). */
  blocked(pos: THREE.Vector3, radius: number, height = 1.8): boolean {
    const p = pos.clone();
    this.resolveCircle(p, radius, height);
    return Math.hypot(p.x - pos.x, p.z - pos.z) > 0.01;
  }

  /** Slab-method ray cast against every box (plus cylinders and the ground plane). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out?: RayHit): RayHit | null {
    let best = maxDist;
    let bestC: Collider | null = null;
    let bestAxis = -1;
    let bestSign = 0;
    let cylN: [number, number, number] | null = null;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / (dir.x || 1e-9), iy = 1 / (dir.y || 1e-9), iz = 1 / (dir.z || 1e-9);
    const ex = ox + dir.x * maxDist, ez = oz + dir.z * maxDist;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.ray) continue;
      if (c.kind === 'cyl') {
        // Vertical cylinder: side wall, then the top cap.
        const px = ox - c.cx!, pz = oz - c.cz!;
        const a = dir.x * dir.x + dir.z * dir.z;
        const b = px * dir.x + pz * dir.z;
        const cc = px * px + pz * pz - c.r! * c.r!;
        if (a > 1e-9) {
          const disc = b * b - a * cc;
          if (disc >= 0) {
            const t = (-b - Math.sqrt(disc)) / a;
            const y = oy + dir.y * t;
            if (t >= 0 && t < best && y >= c.min.y && y <= c.max.y) {
              best = t;
              bestC = c;
              const hx = px + dir.x * t, hz = pz + dir.z * t;
              cylN = [hx / c.r!, 0, hz / c.r!];
            }
          }
        }
        if (dir.y < -1e-6) {
          const t = (c.max.y - oy) / dir.y;
          if (t >= 0 && t < best) {
            const hx = px + dir.x * t, hz = pz + dir.z * t;
            if (hx * hx + hz * hz <= c.r! * c.r!) {
              best = t;
              bestC = c;
              cylN = [0, 1, 0];
            }
          }
        }
        continue;
      }
      let t1 = (c.min.x - ox) * ix;
      let t2 = (c.max.x - ox) * ix;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      let axis = 0;
      let sign = t1 < t2 ? -1 : 1;
      t1 = (c.min.y - oy) * iy;
      t2 = (c.max.y - oy) * iy;
      let n = Math.min(t1, t2);
      if (n > tmin) {
        tmin = n;
        axis = 1;
        sign = t1 < t2 ? -1 : 1;
      }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (c.min.z - oz) * iz;
      t2 = (c.max.z - oz) * iz;
      n = Math.min(t1, t2);
      if (n > tmin) {
        tmin = n;
        axis = 2;
        sign = t1 < t2 ? -1 : 1;
      }
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < Math.max(tmin, 0) || tmin < 0 || tmin >= best) continue;
      best = tmin;
      bestC = c;
      bestAxis = axis;
      bestSign = sign;
      cylN = null;
    }
    // Ground plane.
    let surface: Surface = 'concrete';
    const normal = out?.normal ?? new THREE.Vector3();
    if (dir.y < -1e-6 && oy > -0.5) {
      const tg = -oy / dir.y;
      if (tg > 0 && tg < best && !this.inHole(ox + dir.x * tg, oz + dir.z * tg)) {
        best = tg;
        bestC = null;
        bestAxis = 1;
        bestSign = 1;
        cylN = null;
        surface = 'concrete';
      }
    }
    if (best >= maxDist) return null;
    if (cylN) normal.set(cylN[0], cylN[1], cylN[2]);
    else {
      normal.set(0, 0, 0);
      normal.setComponent(bestAxis, bestSign);
    }
    if (bestC) surface = bestC.surface;
    const res = out ?? { dist: 0, point: new THREE.Vector3(), normal, surface };
    res.dist = best;
    res.point.copy(origin).addScaledVector(dir, best);
    res.normal = normal;
    res.surface = surface;
    res.collider = bestC;
    return res;
  }

  private _dir = new THREE.Vector3();
  private _hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = this._dir.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return this.raycast(a, d, len - 0.05, this._hit) === null;
  }
}
