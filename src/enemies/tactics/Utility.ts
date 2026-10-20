/**
 * Utility selection: every candidate action scores itself in [0, 1] from considerations (curves of
 * the situation), the best wins. The current action gets a stickiness bonus so near ties don't
 * flip-flop between two plans every decide, and a committed action (a burst being fired, a melee
 * swing, a reload) can't be replaced except by one marked `interrupt`.
 *
 * Pure and tiny on purpose: the behaviour lives in the considerations each enemy type writes, not
 * in a framework.
 */
export interface Option<A extends string> {
  action: A;
  score: number;
  /** May replace a committed action (being pinned down, cover blown). */
  interrupt?: boolean;
}

export function choose<A extends string>(options: readonly Option<A>[], current: A | null, committed: boolean, stickiness = 0.08): A | null {
  let best: Option<A> | null = null;
  let bestScore = -Infinity;
  for (const o of options) {
    if (o.score <= 0) continue;
    if (committed && o.action !== current && !o.interrupt) continue;
    const s = o.score + (o.action === current ? stickiness : 0);
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return best ? best.action : committed ? current : null;
}

/** 1 inside [a, b], falling linearly to 0 over `soft` outside it. */
export function band(x: number, a: number, b: number, soft: number) {
  if (x >= a && x <= b) return 1;
  const d = x < a ? a - x : x - b;
  return Math.max(0, 1 - d / soft);
}

/** 0 at `a`, 1 at `b` (either order), clamped. */
export function ramp(x: number, a: number, b: number) {
  const t = (x - a) / (b - a);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
