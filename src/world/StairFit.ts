import type { Collider } from './Collision';

/*
  Stairs must fit inside their footprint and never run into a wall (8.1). A stair built against a
  wall that intrudes into its footprint draws its steps through the wall (and out of the other side
  when the wall is thinner than the intrusion). The rule, shared by every stair builder and by the
  world check:

   - an intruder is a solid box (not a ramp, not stair fill, at least 0.15 m thick both ways, at least
     1 m tall) that overlaps the footprint in XZ and the stair's own height range by more than 5 cm
     (a support block under a raised stair, or a building above an underground one, only touches);
   - an intruder that covers less than half the width from one side narrows the stair to the
     intruder's face (`fitStairWidth`), so the steps, the ramp, the fill and the rails stay out of it;
   - anything else (into the run, or most of the width) is a layout error: reported, not hidden.

  9.1: a stair never ends flush with a wall either. A side within STAIR_GAP of a wall face (touching
  it, or narrowed to it) is moved STAIR_GAP clear of it, so no face of the stair shares a plane with
  the wall's (coplanar faces z-fight). 3 cm is far below any body's radius: nothing falls into it.

  Pure: colliders in, rectangles and findings out.
*/

/** Clearance kept between a stair's side and a wall beside it (m). */
export const STAIR_GAP = 0.03;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A solid that could be a wall next to a stair. */
function wallLike(c: Collider) {
  return c.kind === 'box' && c.solid && c.floor !== false && c.max.x - c.min.x >= 0.15 && c.max.z - c.min.z >= 0.15 && c.max.y - c.min.y >= 1;
}

/** Solids intruding into a stair footprint at its own heights [yLo, yHi]. */
export function intruders(colliders: readonly Collider[], r: Rect, yLo: number, yHi: number, ignore?: ReadonlySet<Collider>) {
  const out: Collider[] = [];
  for (const c of colliders) {
    if (ignore?.has(c) || !wallLike(c)) continue;
    const ox = Math.min(r.x1, c.max.x) - Math.max(r.x0, c.min.x);
    const oz = Math.min(r.z1, c.max.z) - Math.max(r.z0, c.min.z);
    const oy = Math.min(yHi, c.max.y) - Math.max(yLo, c.min.y);
    if (ox > 0.02 && oz > 0.02 && oy > 0.05) out.push(c);
  }
  return out;
}

export interface StairFit {
  rect: Rect;
  /** Sides narrowed, and by how much (m). */
  clipped: { side: 'lo' | 'hi'; by: number }[];
  /** Intruders that couldn't be fitted by narrowing (into the run, or most of the width). */
  blocked: Collider[];
}

/**
 * Narrow a stair (run along `axis`) so no wall intrudes into its width. Only side intrusions under
 * half the width are fitted; the run is never shortened (that would change the slope).
 */
export function fitStairWidth(colliders: readonly Collider[], r: Rect, axis: 'x' | 'z', yLo: number, yHi: number): StairFit {
  const rect = { ...r };
  const clipped: StairFit['clipped'] = [];
  const blocked: Collider[] = [];
  // Width axis: z for a stair running along x, x for one running along z.
  const lo = axis === 'x' ? 'z0' : 'x0';
  const hi = axis === 'x' ? 'z1' : 'x1';
  const runLo = axis === 'x' ? 'x0' : 'z0';
  const runHi = axis === 'x' ? 'x1' : 'z1';
  // Look a little past the sides too: a wall touching a side (or within the gap) is a neighbour.
  const reach = { ...rect };
  reach[lo] -= STAIR_GAP + 0.03;
  reach[hi] += STAIR_GAP + 0.03;
  for (const c of intruders(colliders, reach, yLo, yHi)) {
    const cLo = axis === 'x' ? c.min.z : c.min.x;
    const cHi = axis === 'x' ? c.max.z : c.max.x;
    const rLo = axis === 'x' ? c.min.x : c.min.z;
    const rHi = axis === 'x' ? c.max.x : c.max.z;
    const width = rect[hi] - rect[lo];
    // An intruder that covers the whole run end-to-end along a side, or part of it: still a side wall.
    const alongRun = Math.min(rect[runHi], rHi) - Math.max(rect[runLo], rLo) > 0;
    if (!alongRun) continue;
    if (cLo <= rect[lo] + 1e-6 && cHi + STAIR_GAP - rect[lo] < width / 2) {
      const to = cHi + STAIR_GAP;
      if (to > rect[lo]) {
        clipped.push({ side: 'lo', by: +(to - rect[lo]).toFixed(3) });
        rect[lo] = to;
      }
    } else if (cHi >= rect[hi] - 1e-6 && rect[hi] - (cLo - STAIR_GAP) < width / 2) {
      const to = cLo - STAIR_GAP;
      if (to < rect[hi]) {
        clipped.push({ side: 'hi', by: +(rect[hi] - to).toFixed(3) });
        rect[hi] = to;
      }
    } else if (Math.min(rect[hi], cHi) - Math.max(rect[lo], cLo) > 0) blocked.push(c);
  }
  return { rect, clipped, blocked };
}

/** A stair in the collision world: its ramp, and its height range. */
export function stairsOf(colliders: readonly Collider[]) {
  return colliders.filter((c) => c.kind === 'ramp').map((c) => ({ ramp: c, rect: { x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z }, yLo: Math.min(c.h0!, c.h1!), yHi: Math.max(c.h0!, c.h1!) }));
}

/** World check: every stair whose footprint a wall still intrudes into, at its own heights. */
export function stairWallOverlaps(colliders: readonly Collider[]) {
  const out: { stair: Rect; yLo: number; yHi: number; wall: Collider }[] = [];
  for (const s of stairsOf(colliders)) {
    for (const w of intruders(colliders, s.rect, s.yLo, s.yHi)) {
      // 12.0: a solid wholly under the walking surface over its own footprint (a bridge's pier under
      // a sloped deck) is under the steps, not through them.
      const r = s.ramp, alongX = r.axis === 'x';
      const a0 = Math.max(alongX ? s.rect.x0 : s.rect.z0, alongX ? w.min.x : w.min.z), a1 = Math.min(alongX ? s.rect.x1 : s.rect.z1, alongX ? w.max.x : w.max.z);
      const lo = alongX ? s.rect.x0 : s.rect.z0, hi = alongX ? s.rect.x1 : s.rect.z1;
      const h = (a: number) => r.h0! + ((r.h1! - r.h0!) * (a - lo)) / (hi - lo);
      if (w.max.y <= Math.min(h(a0), h(a1)) + 0.02) continue;
      out.push({ stair: s.rect, yLo: s.yLo, yHi: s.yHi, wall: w });
    }
  }
  return out;
}

/**
 * World check (9.1): stairs whose side is flush with a wall (closer than half the gap, at its own
 * heights, along its run). Coplanar faces z-fight; `fitStairWidth` keeps STAIR_GAP.
 */
export function stairWallFlush(colliders: readonly Collider[]) {
  const out: { stair: Rect; wall: Collider; gap: number }[] = [];
  const e = STAIR_GAP / 2;
  for (const s of stairsOf(colliders)) {
    const r = s.rect;
    const alongX = s.ramp.axis === 'x';
    for (const c of intruders(colliders, alongX ? { ...r, z0: r.z0 - e - 0.03, z1: r.z1 + e + 0.03 } : { ...r, x0: r.x0 - e - 0.03, x1: r.x1 + e + 0.03 }, s.yLo, s.yHi)) {
      if (intruders([c], r, s.yLo, s.yHi).length) continue; // inside: stairWallOverlaps reports it
      const along = alongX ? Math.min(r.x1, c.max.x) - Math.max(r.x0, c.min.x) : Math.min(r.z1, c.max.z) - Math.max(r.z0, c.min.z);
      if (along <= 0.02) continue;
      const gap = alongX ? Math.max(c.min.z - r.z1, r.z0 - c.max.z) : Math.max(c.min.x - r.x1, r.x0 - c.max.x);
      if (gap < e) out.push({ stair: r, wall: c, gap: +gap.toFixed(3) });
    }
  }
  return out;
}

