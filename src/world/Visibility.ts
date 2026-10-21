/*
  How far anyone can see through the level's fog (8.1). three.js FogExp2 blends a surface at distance
  d towards the fog colour by f = 1 − exp(−(ρ·d)²), ρ the density: what is left of its contrast is

      contrast(d) = exp(−(ρ·d)²)

  and the distance where only a fraction c is left is

      range(c) = √(ln(1/c)) / ρ.

  `ctx.sightRange` has meant range(0.10) since 3.4 (the 90% fog distance: the desert storm, the
  jungle at 85% of it). The arena AI (TDM) is stricter: it stops seeing at range(ARENA_SEE) —
  a figure keeping less than 18% of its contrast is one a player can't pick out of the haze either —
  and its aim degrades with the fog in between (see DeathmatchAI). Pure maths, tested.
*/

/** Fraction of a target's contrast left at distance d through FogExp2 of density ρ. */
export function contrastAt(density: number, d: number) {
  const k = density * d;
  return Math.exp(-k * k);
}

/** Distance at which only `c` of a target's contrast is left (c in (0, 1)). */
export function fogRange(density: number, c = 0.1) {
  return Math.sqrt(Math.log(1 / c)) / Math.max(1e-9, density);
}

/** The density a sight range was derived from (range(0.10) = sightRange), to evaluate contrast with. */
export function densityOfSightRange(sightRange: number) {
  return Math.sqrt(Math.log(10)) / sightRange;
}

/** The arena AI's contrast threshold: below this, nobody can pick a figure out of the fog. */
export const ARENA_SEE = 0.18;
/** range(ARENA_SEE) as a share of range(0.10): the arena's sight range from `ctx.sightRange`. */
export const ARENA_SIGHT_SHARE = Math.sqrt(Math.log(1 / ARENA_SEE)) / Math.sqrt(Math.log(10));
