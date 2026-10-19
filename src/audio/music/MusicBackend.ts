import type { MusicState } from './Songs';

/** What the director needs from a music source (procedural synthesis or pre-rendered files). */
export interface MusicBackend {
  readonly kind: 'procedural' | 'file';
  readonly state: MusicState;
  /** Begins playback (idempotent). */
  start(state: MusicState): void;
  /** Switches on the next bar line with an equal-power crossfade. */
  transition(to: MusicState): void;
  /** Asks for a drum fill / riser at the end of the current bar. */
  fill(): void;
  /** Pause ducking: quieter and muffled, never stopped or restarted. */
  setDuck(on: boolean): void;
  /** Number of tracks currently producing sound (never more than two). */
  activeTracks(): number;
  /** Optional per-frame housekeeping. */
  update?(): void;
}

/** Equal-power fade curves for setValueCurveAtTime. */
export function fadeCurve(up: boolean, from = up ? 0 : 1, n = 32) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    c[i] = up ? Math.sin((x * Math.PI) / 2) * (1 - from) + from : Math.cos((x * Math.PI) / 2) * from;
  }
  return c;
}

export const RANK: Record<MusicState, number> = { exploration: 0, combat: 1, intense: 2 };
