import { FPS_CAPS, type FpsCap, type QualityPreset } from '../core/Performance';

export interface Settings {
  /** 0..100 */
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  /** Graphics preset and frame cap (the cap follows the preset unless changed). */
  quality: QualityPreset;
  fps: FpsCap;
}

const KEY = 'neonrain.settings';
export const DEFAULTS: Settings = { master: 80, music: 60, sfx: 85, muted: false, quality: 'balanced', fps: 60 };

const pct = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d);

/** Volume and graphics settings persisted in localStorage (silently in-memory if storage is unavailable). */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      master: pct(o.master, DEFAULTS.master),
      music: pct(o.music, DEFAULTS.music),
      sfx: pct(o.sfx, DEFAULTS.sfx),
      muted: typeof o.muted === 'boolean' ? o.muted : DEFAULTS.muted,
      quality: o.quality === 'power' || o.quality === 'balanced' || o.quality === 'high' ? o.quality : DEFAULTS.quality,
      fps: FPS_CAPS.includes(o.fps as FpsCap) ? (o.fps as FpsCap) : DEFAULTS.fps,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or blocked storage: keep the in-memory values */
  }
}
