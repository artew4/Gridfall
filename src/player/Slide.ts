/*
  12.0, the sprint slide: one model shared by the player and the arena bots.

  Pressing crouch while sprinting carries the sprint forward along the ground and lets friction take
  it. The deceleration has two parts, as on a real slide over grit:
    dv/dt = -(k·v + μ)
  a speed-proportional drag k (most of the braking at the start) and a constant friction μ (which
  finishes it off). Integrated exactly over a frame (no Euler error, so the same slide at 30 or
  144 FPS): with c = μ / k,
    v(t + dt) = (v + c)·e^(−k·dt) − c
  and in closed form v(t) = (v0 + c)·e^(−k·t) − c. The slide ends when v falls to the crouch walk
  (or after `maxT`), and the body is crouched: the hand-off to the crouch walk is continuous in speed.

  From the player's sprint (7.8 m/s × 1.12 = 8.7 m/s) it lasts 1.17 s and covers 6.3 m.
*/

export const SLIDE = {
  /** The slide starts at the entry speed × this (a small kick as the hips drop). */
  boost: 1.12,
  /** Drag k (1/s) and friction μ (m/s²). */
  drag: 0.6,
  friction: 1.9,
  /** Longest slide (s), whatever the speed left. */
  maxT: 1.5,
  /** Entry needs this share of the sprint speed (a sprint just started still slides). */
  minEntry: 0.75,
  /** After a slide, the next one can't start for this long (s). */
  cooldown: 0.35,
  /** How fast the slide's direction follows the movement keys (rad/s): a little steering, no turning round. */
  steer: 1.6,
  /** Camera roll at full slide speed (rad) and the FOV kick (deg). */
  roll: 0.05,
  fov: 4,
};

/** Speed after `dt` seconds of sliding from `v` (exact; never below 0). */
export function slideStep(v: number, dt: number, k = SLIDE.drag, mu = SLIDE.friction) {
  const c = mu / k;
  return Math.max(0, (v + c) * Math.exp(-k * dt) - c);
}

/** Seconds a slide from `v0` takes to slow to `vEnd`. */
export function slideTime(v0: number, vEnd: number, k = SLIDE.drag, mu = SLIDE.friction) {
  const c = mu / k;
  return v0 <= vEnd ? 0 : Math.log((v0 + c) / (vEnd + c)) / k;
}

/** Distance covered over the first `t` seconds of a slide from `v0` (m). */
export function slideDistance(v0: number, t: number, k = SLIDE.drag, mu = SLIDE.friction) {
  const c = mu / k;
  return ((v0 + c) * (1 - Math.exp(-k * t))) / k - c * t;
}
