import type { MusicState } from './MusicDirector';
import { fadeCurve, RANK, type MusicBackend } from './MusicBackend';

/**
 * Manifest at public/music/manifest.json, e.g.
 * { "exploration": { "file": "exploration.ogg", "bpm": 90 },
 *   "combat":      { "file": "combat.ogg",      "bpm": 135 },
 *   "intense":     { "file": "intense.ogg",     "bpm": 150 } }
 * Files are seamless loops; `beatsPerBar` (default 4) and `offset` (seconds before beat 1) are optional.
 */
export interface MusicManifest {
  [state: string]: { file: string; bpm: number; beatsPerBar?: number; offset?: number };
}

interface Loaded {
  buffer: AudioBuffer;
  bar: number;
  offset: number;
}

interface Voice {
  state: MusicState;
  src: AudioBufferSourceNode;
  fade: GainNode;
  fader: GainNode;
  start: number;
  bar: number;
  stopAt: number;
}

const BASE = `${import.meta.env.BASE_URL}music/`;

/** Loads all three tracks or nothing (a partial set falls back to procedural music). */
export async function loadMusicFiles(ctx: BaseAudioContext): Promise<Record<MusicState, Loaded> | null> {
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null; // dev server answers unknown paths with index.html
    const man = (await res.json()) as MusicManifest;
    const states: MusicState[] = ['exploration', 'combat', 'intense'];
    const out = {} as Record<MusicState, Loaded>;
    for (const s of states) {
      const e = man[s];
      if (!e?.file || !e.bpm) return null;
      const r = await fetch(`${BASE}${e.file}`);
      if (!r.ok) return null;
      const buffer = await ctx.decodeAudioData(await r.arrayBuffer());
      out[s] = { buffer, bar: (60 / e.bpm) * (e.beatsPerBar ?? 4), offset: e.offset ?? 0 };
    }
    return out;
  } catch {
    return null;
  }
}

/** Plays user-supplied loops with the same bar-quantised crossfades as the procedural score. */
export class FileBackend implements MusicBackend {
  readonly kind = 'file' as const;
  state: MusicState = 'exploration';
  private voices: Voice[] = [];
  private duckGain: GainNode;
  private duckFilter: BiquadFilterNode;
  private started = false;
  private queued: MusicState | null = null;

  constructor(private ctx: AudioContext, out: AudioNode, private tracks: Record<MusicState, Loaded>) {
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.duckGain = ctx.createGain();
    this.duckFilter.connect(this.duckGain).connect(out);
  }

  private voice(state: MusicState, at: number): Voice {
    const tr = this.tracks[state];
    const src = this.ctx.createBufferSource();
    src.buffer = tr.buffer;
    src.loop = true;
    const fade = this.ctx.createGain();
    fade.gain.value = 0;
    const fader = this.ctx.createGain();
    src.connect(fader).connect(fade).connect(this.duckFilter);
    src.start(at, tr.offset);
    const v: Voice = { state, src, fade, fader, start: at - tr.offset, bar: tr.bar, stopAt: Infinity };
    this.voices.push(v);
    return v;
  }

  start(state: MusicState) {
    if (this.started) return;
    this.started = true;
    this.state = state;
    const t = this.ctx.currentTime + 0.1;
    this.voice(state, t).fade.gain.setValueCurveAtTime(fadeCurve(true), t, 2.5);
  }

  transition(to: MusicState) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    // A started source can't be un-stopped: while a change is pending, queue the next one.
    if (this.voices.some((v) => v.start + this.tracks[v.state].offset > now)) {
      this.queued = to;
      return;
    }
    this.queued = null;
    const live = this.voices.filter((v) => v.stopAt === Infinity);
    const cur = live[live.length - 1];
    if (!cur) return;
    for (const v of live) if (v !== cur) this.stop(v, now + 0.05);
    if (cur.state === to) {
      this.state = to;
      return;
    }
    const rising = RANK[to] > RANK[cur.state];
    let T = cur.start + Math.ceil((now + 0.05 - cur.start) / cur.bar) * cur.bar;
    if (T - now < 0.3) T += cur.bar;
    const xf = rising ? 0.4 : cur.bar * 2;
    cur.fader.gain.setValueAtTime(1, now);
    cur.fader.gain.setValueCurveAtTime(fadeCurve(false), T, xf);
    cur.stopAt = T + xf;
    cur.src.stop(T + xf + 0.05);
    const next = this.voice(to, T);
    next.fade.gain.setValueCurveAtTime(fadeCurve(true), T, rising ? 0.05 : xf);
    this.state = to;
  }

  private stop(v: Voice, at: number) {
    v.stopAt = at;
    try {
      v.src.stop(at + 0.06);
    } catch {
      /* not started yet or already stopped */
    }
    v.fade.disconnect();
  }

  fill() {
    /* Pre-rendered tracks carry their own fills. */
  }

  update() {
    if (this.queued) this.transition(this.queued);
  }

  setDuck(on: boolean) {
    const now = this.ctx.currentTime;
    this.duckGain.gain.setTargetAtTime(on ? 0.32 : 1, now, 0.12);
    this.duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, now, 0.12);
  }

  activeTracks() {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => now < v.stopAt + 1);
    return this.voices.filter((v) => v.start <= now + 0.01).length;
  }
}
