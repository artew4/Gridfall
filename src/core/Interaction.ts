export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Interactable {
  pos: Vec3;
  radius: number;
  label: string;
  enabled: () => boolean;
  action: () => void;
  /** Seconds E must be held (default: a single press). */
  hold?: number;
}

/** Nearest enabled interactable in reach and roughly in front of the player. */
export function pickInteractable(list: readonly Interactable[], p: Vec3, fwd: { x: number; z: number }): Interactable | null {
  let best: Interactable | null = null;
  let bd = Infinity;
  for (const it of list) {
    if (!it.enabled()) continue;
    const dx = it.pos.x - p.x, dz = it.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > it.radius || Math.abs(it.pos.y - p.y) > 2) continue;
    if (d > 0.8 && (dx * fwd.x + dz * fwd.z) / d < 0.2) continue;
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  return best;
}

/**
 * The one place E is handled. A tap fires a tap interactable once per key press; a hold
 * interactable fills while E stays down and fires once when full. The focus is re-picked in the same
 * step, so an interactable that disables itself in `action` stops being offered immediately.
 */
export class InteractionController {
  focus: Interactable | null = null;
  holdT = 0;

  /**
   * `pressed`: E went down this frame. `held`: E is down. Returns the prompt text (null = none).
   */
  update(list: readonly Interactable[], p: Vec3, fwd: { x: number; z: number }, pressed: boolean, held: boolean, dt: number): string | null {
    const best = pickInteractable(list, p, fwd);
    if (best !== this.focus) this.holdT = 0;
    this.focus = best;
    if (!best) return null;
    if (!best.hold) {
      if (pressed) {
        best.action();
        this.focus = pickInteractable(list, p, fwd);
        return this.focus ? `<b>E</b>${this.focus.label}` : null;
      }
      return `<b>E</b>${best.label}`;
    }
    if (!held) {
      this.holdT = 0;
      return `<b>E</b>${best.label}`;
    }
    this.holdT += dt;
    if (this.holdT >= best.hold) {
      this.holdT = 0;
      best.action();
      this.focus = pickInteractable(list, p, fwd);
      return this.focus ? `<b>E</b>${this.focus.label}` : null;
    }
    return `<b>E</b>${best.label} ${'▮'.repeat(Math.ceil((this.holdT / best.hold) * 10)).padEnd(10, '▯')}`;
  }

  reset() {
    this.focus = null;
    this.holdT = 0;
  }
}
