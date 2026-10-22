export type QualityPreset = 'power' | 'balanced' | 'high';
export type FpsCap = 30 | 60 | 90 | 120;

export interface PresetSpec {
  label: string;
  /** Default frame cap for the preset (the player can override the cap separately). */
  fps: FpsCap;
  /** Render resolution as a multiple of CSS pixels, capped by the display's own density. */
  pixelRatio: number;
  /**
   * Bloom blur levels. Three for every preset since 4.1: a preset changes resolution and rate, never
   * the look (the level's look owns bloom strength, radius and threshold). Five levels on High added
   * a faint full-screen haze (+11% mean luminance in Tokyo at the 4.0 radius of 0.9) from 1/32 and
   * 1/64 resolution buffers that pumped with every flickering sign, and the two smallest levels cost
   * ~4 ms a frame on the GPU (Apple M5 / ANGLE Metal).
   */
  bloomLevels: 3 | 5;
  /** Decorative sign point lights (the fountain, metro, train and muzzle lights always stay). */
  signLights: boolean;
  /**
   * 17.0: real point lights the level's lights share (LightPool): the ones lighting the view, the
   * best first. Every point light is a cost in every lit pixel; on Apple M5 (Neon Block, Balanced
   * resolution) 12 to 22 cost the same (~6.2 ms of GPU a frame), then it climbs: 24 6.9 ms, 28
   * 8.9 ms, every one of the 34 14 ms.
   */
  lights: number;
}

export const PRESETS: Record<QualityPreset, PresetSpec> = {
  power: { label: 'POWER SAVING', fps: 30, pixelRatio: 0.85, bloomLevels: 3, signLights: false, lights: 8 },
  balanced: { label: 'BALANCED', fps: 60, pixelRatio: 1.25, bloomLevels: 3, signLights: true, lights: 16 },
  high: { label: 'HIGH QUALITY', fps: 120, pixelRatio: 1.5, bloomLevels: 3, signLights: true, lights: 20 },
};

export const FPS_CAPS: FpsCap[] = [30, 60, 90, 120];

export type LoopState = 'title' | 'intro' | 'play' | 'paused' | 'dead' | 'ending' | 'endcard' | 'results' | 'loading';

/**
 * How often to draw in each state. Menus and the title don't need the full rate; a paused game
 * doesn't need to draw at all (the last frame stays on screen under the menu).
 */
export function effectiveCap(cap: FpsCap, state: LoopState, focused: boolean): number {
  if (state === 'paused') return 0;
  // Behind the (nearly opaque) end card, and the death screen's slow motion.
  if (state === 'endcard') return 10;
  // 17.0: a match's result screen (TDM): the arena shows through a 50–90% dark vignette.
  if (state === 'results') return Math.min(cap, 30);
  if (state === 'dead') return Math.min(cap, 30);
  if (state === 'title') return focused ? Math.min(cap, 30) : 10;
  return cap;
}

/**
 * Frame pacing on top of the display's refresh callbacks: draws when at least one cap interval has
 * passed (with a small tolerance for vsync jitter) and carries the remainder, so 60 on a 120 Hz
 * display is every second refresh and 90 alternates evenly. Simulation time is measured between
 * drawn frames, so game speed does not depend on the cap.
 */
export class FramePacer {
  private last = -1;

  /** `now` in ms (the animation-loop timestamp). Returns true if this refresh should be drawn. */
  tick(now: number, cap: number): boolean {
    if (cap <= 0) return false;
    if (this.last < 0) {
      this.last = now;
      return true;
    }
    const interval = 1000 / cap;
    const elapsed = now - this.last;
    if (elapsed < interval - 2) return false;
    // Keep the phase (so the average rate is exact), but never build up a debt after a stall.
    // Whole intervals are counted with the same tolerance, so float error can't double a frame.
    const n = Math.max(1, Math.floor((elapsed + 2) / interval));
    this.last = elapsed > interval * 2 ? now : now - (elapsed - n * interval);
    return true;
  }

  reset() {
    this.last = -1;
  }
}
