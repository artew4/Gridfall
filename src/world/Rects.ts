export interface R {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** `a` minus `b`: up to four non-overlapping rects. */
export function subtract(a: R, b: R): R[] {
  if (b.x1 <= a.x0 || b.x0 >= a.x1 || b.z1 <= a.z0 || b.z0 >= a.z1) return [a];
  const out: R[] = [];
  if (b.z0 > a.z0) out.push({ x0: a.x0, z0: a.z0, x1: a.x1, z1: b.z0 });
  if (b.z1 < a.z1) out.push({ x0: a.x0, z0: b.z1, x1: a.x1, z1: a.z1 });
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (b.x0 > a.x0) out.push({ x0: a.x0, z0, x1: b.x0, z1 });
  if (b.x1 < a.x1) out.push({ x0: b.x1, z0, x1: a.x1, z1 });
  return out;
}

/** Rects minus all holes. */
export function subtractAll(rects: R[], holes: R[]): R[] {
  let cur = rects;
  for (const h of holes) cur = cur.flatMap((r) => subtract(r, h));
  return cur.filter((r) => r.x1 - r.x0 > 1e-3 && r.z1 - r.z0 > 1e-3);
}

/** Parts of the segment [a0, a1] not covered by the given intervals. */
export function uncovered(a0: number, a1: number, cover: [number, number][]): [number, number][] {
  const cs = cover.map(([c0, c1]) => [Math.max(a0, c0), Math.min(a1, c1)] as [number, number]).filter(([c0, c1]) => c1 > c0).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let cur = a0;
  for (const [c0, c1] of cs) {
    if (c0 > cur + 1e-4) out.push([cur, c0]);
    cur = Math.max(cur, c1);
  }
  if (a1 > cur + 1e-4) out.push([cur, a1]);
  return out;
}
