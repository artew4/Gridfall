/*
  41.0, density: how bunched a team is, from positions alone (pure; squared distances, no allocation
  past the output). The director's sector counts, the spawns' fireteam term and the self-play clump
  metric read it.

    clumps(xs, zs, r)   groups by single linkage: two bodies within r m (on the ground plane) are in
                        one group, and so is anyone within r of either. Returns each body's group id
                        and the groups' sizes.
    countNear(...)      bodies within r m of a point (squared distances).
*/

/** Single-linkage groups of the points (x[i], z[i]) linked within `r` m: `of[i]` the group of i, `sizes[g]`. */
export function clumps(xs: ArrayLike<number>, zs: ArrayLike<number>, r: number): { of: number[]; sizes: number[] } {
  const n = xs.length;
  const root = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  const r2 = r * r;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = xs[i] - xs[j], dz = zs[i] - zs[j];
      if (dx * dx + dz * dz <= r2) root[find(i)] = find(j);
    }
  const id = new Map<number, number>();
  const of: number[] = new Array(n);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = find(i);
    let g = id.get(k);
    if (g === undefined) {
      id.set(k, (g = sizes.length));
      sizes.push(0);
    }
    of[i] = g;
    sizes[g]++;
  }
  return { of, sizes };
}

/** How many of `pts` stand within `r` m of (x, z) on the ground plane (and within `dy` m of y when given). */
export function countNear(pts: readonly { x: number; y: number; z: number }[], x: number, z: number, r: number, y?: number, dy = Infinity): number {
  const r2 = r * r;
  let n = 0;
  for (const p of pts) {
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz <= r2 && (y === undefined || Math.abs(p.y - y) <= dy)) n++;
  }
  return n;
}
