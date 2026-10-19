import * as THREE from 'three';

export type Surface = 'concrete' | 'metal' | 'glass' | 'wood' | 'flesh';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  surface: Surface;
  /** Blocks movement (false for things like high cables that only stop bullets). */
  solid: boolean;
}

export interface RayHit {
  dist: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: Surface;
}

/** Axis-aligned box world. Everything collidable in the street is a box; it keeps physics trivial and robust. */
export class CollisionWorld {
  colliders: Collider[] = [];

  add(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, surface: Surface = 'concrete', solid = true) {
    const c: Collider = {
      min: new THREE.Vector3(Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ)),
      surface,
      solid,
    };
    this.colliders.push(c);
    return c;
  }

  addCentered(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, surface: Surface = 'concrete') {
    return this.add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, surface);
  }

  /**
   * Pushes a vertical cylinder (feet at pos.y) out of all boxes it overlaps, in XZ.
   * Iterated a few times so corners resolve cleanly. Returns true if any contact happened.
   */
  resolveCircle(pos: THREE.Vector3, radius: number, height: number, step = 0.3): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.colliders) {
        if (!c.solid) continue;
        // Low boxes (curbs) are stepped onto rather than blocking.
        if (pos.y + height < c.min.y || c.max.y <= pos.y + step) continue;
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

  /** Highest box top under a point (for standing on low props). */
  groundHeightAt(x: number, z: number, radius: number, feetY: number): number {
    let h = 0;
    for (const c of this.colliders) {
      if (!c.solid) continue;
      if (c.max.y > feetY + 0.3) continue;
      if (x + radius < c.min.x || x - radius > c.max.x || z + radius < c.min.z || z - radius > c.max.z) continue;
      if (c.max.y > h) h = c.max.y;
    }
    return h;
  }

  /** Slab-method ray cast against every box plus the ground plane. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out?: RayHit): RayHit | null {
    let best = maxDist;
    let bestC: Collider | null = null;
    let bestAxis = -1;
    let bestSign = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / (dir.x || 1e-9), iy = 1 / (dir.y || 1e-9), iz = 1 / (dir.z || 1e-9);
    for (const c of this.colliders) {
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
    }
    // Ground plane.
    let surface: Surface = 'concrete';
    const normal = out?.normal ?? new THREE.Vector3();
    if (dir.y < -1e-6) {
      const tg = -oy / dir.y;
      if (tg > 0 && tg < best) {
        best = tg;
        bestC = null;
        bestAxis = 1;
        bestSign = 1;
        surface = 'concrete';
      }
    }
    if (best >= maxDist) return null;
    normal.set(0, 0, 0);
    normal.setComponent(bestAxis, bestSign);
    if (bestC) surface = bestC.surface;
    const res = out ?? { dist: 0, point: new THREE.Vector3(), normal, surface };
    res.dist = best;
    res.point.copy(origin).addScaledVector(dir, best);
    res.normal = normal;
    res.surface = surface;
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
