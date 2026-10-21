import type { AudioEngine } from '../AudioEngine';
import { Instruments } from './Instruments';
import { Score } from './Score';
import { PATTERN_THEMES, PatternTheme } from './Themes';

/*
  Music Manager (9.0): one per session. It plays one named track at a time and crossfades between
  them; each setting has its track and the menus have theirs.

    menu_theme   title, setting cards, loading
    tokyo_theme  Tokyo Night (the 5.x layered score)
    desert_theme Desert Outpost
    docks_theme  Neon Docks
    jungle_theme Deep Jungle

  Sources, per track, decided once per session:
   - a file, if public/audio/music/<id>.(mp3|ogg|m4a|wav) exists (or manifest.json names one):
     streamed through an <audio> element into Web Audio (MediaElementAudioSourceNode), looped. A
     streamed file never holds a decoded copy in memory (a decoded 3-minute stereo track is ~60 MB);
   - else the procedural placeholder (Themes.ts; Tokyo keeps its Score), whose layers follow the
     combat intensity.

  Every switch is an equal-power crossfade over FADE (2 s). The outgoing source is disposed when its
  fade ends: timers cleared, nodes disconnected, media element emptied — nothing it made stays
  reachable. A hidden tab pauses media elements and stops the schedulers; a game pause ducks the
  bus (quieter, muffled). Counters in `stats` and the DEV `__dev.musicSoak()` check for leaks.
*/

export const TRACKS = ['menu_theme', 'tokyo_theme', 'desert_theme', 'docks_theme', 'jungle_theme'] as const;
export type TrackId = (typeof TRACKS)[number];

/** Crossfade length (s). */
export const FADE = 2;
const DIR = `${import.meta.env.BASE_URL}audio/music/`;
const EXTENSIONS = ['mp3', 'ogg', 'm4a', 'wav'];

/** Optional public/audio/music/manifest.json: { "<id>": { "file": "name.mp3", "gain": 0.8 } }. */
export interface MusicManifest {
  [id: string]: { file: string; gain?: number };
}

/** A playing source behind a track slot. */
interface Source {
  readonly kind: 'file' | 'procedural';
  start(at: number): void;
  setIntensity(x: number): void;
  update(dt: number): void;
  setSuspended(on: boolean): void;
  dispose(): void;
  debug(): unknown;
}

interface Slot {
  id: TrackId;
  /** Null while the file probe for it is still pending. */
  source: Source | null;
  gain: GainNode;
  /** ctx time at which it has faded out and is disposed (Infinity: playing). */
  endAt: number;
}

/** Equal-power fade curve (for setValueCurveAtTime). */
export function fadeCurve(up: boolean, n = 32) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    c[i] = up ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}

/** Streams a looping file: memory stays flat whatever its length. */
class FileSource implements Source {
  readonly kind = 'file' as const;
  private el: HTMLAudioElement;
  private node: MediaElementAudioSourceNode;
  private playing = false;

  constructor(ctx: AudioContext, url: string, out: AudioNode, gain: number) {
    this.el = new Audio();
    this.el.src = url;
    this.el.loop = true;
    this.el.preload = 'auto';
    this.node = ctx.createMediaElementSource(this.el);
    const g = ctx.createGain();
    g.gain.value = gain;
    this.node.connect(g).connect(out);
  }

  start() {
    this.playing = true;
    void this.el.play().catch(() => {});
  }

  setIntensity() {}
  update() {}

  setSuspended(on: boolean) {
    if (!this.playing) return;
    if (on) this.el.pause();
    else void this.el.play().catch(() => {});
  }

  dispose() {
    this.playing = false;
    this.el.pause();
    this.node.disconnect();
    // Release the stream: an element with no source drops its buffers.
    this.el.removeAttribute('src');
    this.el.load();
  }

  debug() {
    return { file: this.el.currentSrc || '(released)', time: +this.el.currentTime.toFixed(1) };
  }
}

/** A procedural theme (Tokyo's Score or a PatternTheme). */
class ProceduralSource implements Source {
  readonly kind = 'procedural' as const;
  constructor(private p: Score | PatternTheme) {}
  start(at: number) {
    if (this.p instanceof PatternTheme) this.p.begin(at);
    else this.p.begin();
  }
  setIntensity(x: number) {
    this.p.set(x);
  }
  update(dt: number) {
    this.p.update(dt);
  }
  setSuspended(on: boolean) {
    this.p.setSuspended(on);
  }
  dispose() {
    this.p.dispose();
  }
  debug() {
    return { intensity: +this.p.intensity.toFixed(2), layers: this.p.audible() };
  }
}

export class MusicManager {
  private ctx: AudioContext | null = null;
  /** Everything music plays into: duck (pause) → the engine's music input. */
  private bus: GainNode | null = null;
  private duckFilter: BiquadFilterNode | null = null;
  private shared: { I: Instruments; reverb: AudioNode } | null = null;
  private slots: Slot[] = [];
  private files = new Map<TrackId, { url: string; gain: number } | null>();
  private probing: Promise<void> | null = null;
  private suspended = false;
  private intensity = 0;
  /** The track asked for last (null before audio runs). */
  current: TrackId | null = null;
  /** DEV counters (leak checks): sources made and disposed, by kind; live slots. */
  stats = { created: 0, disposed: 0, files: 0, procedural: 0, switches: 0 };

  constructor(private audio: AudioEngine) {}

  /** Audio can't start before a user gesture; everything is built on the first call after it. */
  private ensure() {
    if (this.ctx || !this.audio.started) return !!this.ctx;
    const ctx = (this.ctx = this.audio.ctx);
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.bus = ctx.createGain();
    this.bus.connect(this.duckFilter).connect(this.audio.musicIn);
    const I = new Instruments(ctx);
    this.shared = { I, reverb: I.makeReverb(this.bus) };
    this.probing = this.probe();
    return true;
  }

  /** Which tracks have a file: the manifest first, then <id>.<ext> by convention. */
  private async probe() {
    let manifest: MusicManifest = {};
    try {
      const r = await fetch(`${DIR}manifest.json`, { cache: 'no-cache' });
      // The dev server answers unknown paths with index.html: only real JSON counts.
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) manifest = (await r.json()) as MusicManifest;
    } catch {
      /* no manifest */
    }
    await Promise.all(
      TRACKS.map(async (id) => {
        const names = manifest[id]?.file ? [manifest[id].file] : EXTENSIONS.map((e) => `${id}.${e}`);
        for (const name of names) {
          try {
            // A 2-byte range GET, not HEAD: Vite's dev server answers HEAD for a public file with its
            // index.html fallback. Static hosts honour either; the body is dropped at once.
            const r = await fetch(`${DIR}${name}`, { headers: { Range: 'bytes=0-1' }, cache: 'no-cache' });
            const audio = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/');
            void r.body?.cancel().catch(() => {});
            if (audio) {
              this.files.set(id, { url: `${DIR}${name}`, gain: manifest[id]?.gain ?? 1 });
              return;
            }
          } catch {
            /* try the next */
          }
        }
        this.files.set(id, null);
      }),
    );
  }

  private makeSource(id: TrackId, out: AudioNode): Source {
    const ctx = this.ctx!;
    const file = this.files.get(id);
    this.stats.created++;
    if (file) {
      this.stats.files++;
      return new FileSource(ctx, file.url, out, file.gain);
    }
    this.stats.procedural++;
    const def = PATTERN_THEMES[id];
    return new ProceduralSource(def ? new PatternTheme(ctx, out, this.shared!.I, this.shared!.reverb, def) : new Score(ctx, out, this.shared!));
  }

  /**
   * Play a track (idempotent while it's current): crossfade from whatever plays over FADE seconds.
   * Before the first user gesture this only remembers the request.
   */
  play(id: TrackId) {
    if (id === this.current && this.slots.some((s) => s.id === id && s.endAt === Infinity)) return;
    this.current = id;
    if (!this.ensure()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.stats.switches++;
    // Out with everything still playing.
    for (const s of this.slots) {
      if (s.endAt !== Infinity) continue;
      const g = s.gain.gain;
      g.cancelScheduledValues(now);
      const from = g.value;
      g.setValueAtTime(from, now);
      g.linearRampToValueAtTime(0, now + FADE * Math.max(0.2, from));
      s.endAt = now + FADE * Math.max(0.2, from) + 0.1;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus!);
    const slot: Slot = { id, source: null, gain, endAt: Infinity };
    this.slots.push(slot);
    const begin = () => {
      if (slot.endAt !== Infinity || slot.source) return;
      const t = ctx.currentTime + 0.05;
      slot.source = this.makeSource(id, gain);
      slot.source.setIntensity(this.intensity);
      slot.source.start(t);
      if (this.suspended) slot.source.setSuspended(true);
      gain.gain.setValueCurveAtTime(fadeCurve(true), t, FADE);
    };
    if (this.files.has(id)) begin();
    else void this.probing!.then(begin);
  }

  /** Per frame: the track wanted now, and how tense the moment is (0..1). */
  update(dt: number, track: TrackId, intensity: number) {
    this.intensity = intensity;
    this.play(track);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (now >= s.endAt) {
        this.release(s);
        this.slots.splice(i, 1);
        continue;
      }
      if (s.source) {
        if (s.endAt === Infinity) s.source.setIntensity(intensity);
        s.source.update(dt);
      }
    }
  }

  private release(s: Slot) {
    if (s.source) {
      s.source.dispose();
      this.stats.disposed++;
      s.source = null;
    }
    s.gain.disconnect();
  }

  /** Hidden tab: media paused, schedulers stopped; back: resumed where they are. */
  setSuspended(on: boolean) {
    this.suspended = on;
    for (const s of this.slots) s.source?.setSuspended(on);
  }

  /** Game paused: the music steps back (quieter, muffled), never stops. */
  setPaused(on: boolean) {
    if (!this.ctx || !this.bus || !this.duckFilter) return;
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(on ? 0.32 : 1, t, 0.12);
    this.duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, t, 0.12);
  }

  /** Sources alive right now (playing or fading out). */
  get live() {
    return this.slots.filter((s) => s.source).length;
  }

  debug() {
    return {
      current: this.current,
      live: this.live,
      slots: this.slots.map((s) => ({ id: s.id, kind: s.source?.kind ?? 'pending', fading: s.endAt !== Infinity, ...(s.source ? { src: s.source.debug() } : {}) })),
      files: Object.fromEntries([...this.files].map(([k, v]) => [k, v?.url ?? null])),
      stats: { ...this.stats },
    };
  }
}
