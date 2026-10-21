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

  Pure: colliders in, rectangles and findings out.
*/

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
  for (const c of intruders(colliders, rect, yLo, yHi)) {
    const cLo = axis === 'x' ? c.min.z : c.min.x;
    const cHi = axis === 'x' ? c.max.z : c.max.x;
    const rLo = axis === 'x' ? c.min.x : c.min.z;
    const rHi = axis === 'x' ? c.max.x : c.max.z;
    const width = rect[hi] - rect[lo];
    // An intruder that covers the whole run end-to-end along a side, or part of it: still a side wall.
    const alongRun = Math.min(rect[runHi], rHi) - Math.max(rect[runLo], rLo) > 0;
    if (!alongRun) continue;
    if (cLo <= rect[lo] + 1e-6 && cHi - rect[lo] < width / 2) {
      clipped.push({ side: 'lo', by: +(cHi - rect[lo]).toFixed(3) });
      rect[lo] = cHi;
    } else if (cHi >= rect[hi] - 1e-6 && rect[hi] - cLo < width / 2) {
      clipped.push({ side: 'hi', by: +(rect[hi] - cLo).toFixed(3) });
      rect[hi] = cLo;
    } else blocked.push(c);
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
  for (const s of stairsOf(colliders)) for (const w of intruders(colliders, s.rect, s.yLo, s.yHi)) out.push({ stair: s.rect, yLo: s.yLo, yHi: s.yHi, wall: w });
  return out;
}
