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
    favela_theme Favelas (40.0)

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

export const TRACKS = ['menu_theme', 'tokyo_theme', 'desert_theme', 'docks_theme', 'jungle_theme', 'favela_theme'] as const;
export type TrackId = (typeof TRACKS)[number];

/** Crossfade length (s). */
export const FADE = 2;
const DIR = `${import.meta.env.BASE_URL}audio/music/`;
const EXTENSIONS = ['mp3', 'ogg', 'm4a', 'wav'];

/**
 * Optional public/audio/music/manifest.json: { "<id>": { "file": "name.mp3", "gain": 0.8 } }. 60.0: a
 * loop window, for a file that fades out or has silence at its ends: `loopStart`/`loopEnd` (s) and a
 * crossfade `xfade` (s): it plays from the start, and from `loopEnd − xfade` the next pass, from
 * `loopStart`, fades in over it.
 */
export interface MusicManifest {
  [id: string]: { file: string; gain?: number; loopStart?: number; loopEnd?: number; xfade?: number };
}
type LoopWindow = { start: number; end: number; xfade: number };

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

/**
 * Streams a looping file: memory stays flat whatever its length. 60.0: with a loop window two elements
 * take turns, crossfaded (equal power) from `end − xfade`, the next starting at `start`.
 */
class FileSource implements Source {
  readonly kind = 'file' as const;
  private els: HTMLAudioElement[] = [];
  private nodes: MediaElementAudioSourceNode[] = [];
  private gains: GainNode[] = [];
  private cur = 0;
  /** ctx time the running crossfade ends (-1: none). */
  private xfadeEnd = -1;
  private playing = false;

  constructor(private ctx: AudioContext, url: string, out: AudioNode, gain: number, private loop: LoopWindow | null = null) {
    const master = ctx.createGain();
    master.gain.value = gain;
    master.connect(out);
    for (let i = 0; i < (loop ? 2 : 1); i++) {
      const el = new Audio();
      el.src = url;
      el.loop = !loop;
      el.preload = 'auto';
      const node = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      node.connect(g).connect(master);
      this.els.push(el);
      this.nodes.push(node);
      this.gains.push(g);
    }
  }

  start() {
    this.playing = true;
    void this.els[this.cur].play().catch(() => {});
  }

  setIntensity() {}

  update() {
    const L = this.loop;
    if (!L || !this.playing) return;
    const now = this.ctx.currentTime;
    if (this.xfadeEnd >= 0) {
      if (now >= this.xfadeEnd) {
        // The old pass has faded out: stop it, ready for the next turn.
        this.els[1 - this.cur].pause();
        this.xfadeEnd = -1;
      }
      return;
    }
    const a = this.els[this.cur];
    if (a.currentTime < L.end - L.xfade && !a.ended) return;
    const nxt = 1 - this.cur, b = this.els[nxt];
    b.currentTime = L.start;
    void b.play().catch(() => {});
    const d = Math.max(0.05, L.xfade);
    this.gains[this.cur].gain.cancelScheduledValues(now);
    this.gains[nxt].gain.cancelScheduledValues(now);
    this.gains[this.cur].gain.setValueCurveAtTime(fadeCurve(false), now, d);
    this.gains[nxt].gain.setValueCurveAtTime(fadeCurve(true), now, d);
    this.cur = nxt;
    this.xfadeEnd = now + d + 0.05;
  }

  setSuspended(on: boolean) {
    if (!this.playing) return;
    for (let i = 0; i < this.els.length; i++) {
      const live = i === this.cur || this.xfadeEnd >= 0;
      if (on) this.els[i].pause();
      else if (live) void this.els[i].play().catch(() => {});
    }
  }

  dispose() {
    this.playing = false;
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i];
      el.pause();
      this.nodes[i].disconnect();
      // Release the stream: an element with no source drops its buffers.
      el.removeAttribute('src');
      el.load();
    }
  }

  debug() {
    const el = this.els[this.cur];
    return { file: el.currentSrc || '(released)', time: +el.currentTime.toFixed(1), ...(this.loop ? { loop: this.loop, pass: this.cur, crossfading: this.xfadeEnd >= 0 } : {}) };
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
  private files = new Map<TrackId, { url: string; gain: number; loop: LoopWindow | null } | null>();
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
    // A production build knows what was in the folder (vite.config.ts): probe only those, so a
    // deploy with no music makes no requests at all. The dev server probes, so a dropped-in file
    // plays after a reload.
    const known = typeof __MUSIC_FILES__ === 'undefined' ? null : __MUSIC_FILES__;
    const has = (name: string) => !known || known.includes(name);
    let manifest: MusicManifest = {};
    if (has('manifest.json')) {
      try {
        const r = await fetch(`${DIR}manifest.json`, { cache: 'no-cache' });
        // The dev server answers unknown paths with index.html: only real JSON counts.
        if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) manifest = (await r.json()) as MusicManifest;
      } catch {
        /* no manifest */
      }
    }
    await Promise.all(
      TRACKS.map(async (id) => {
        const names = (manifest[id]?.file ? [manifest[id].file] : EXTENSIONS.map((e) => `${id}.${e}`)).filter(has);
        for (const name of names) {
          try {
            // A 2-byte range GET, not HEAD: Vite's dev server answers HEAD for a public file with its
            // index.html fallback. Static hosts honour either; the body is dropped at once.
            const r = await fetch(`${DIR}${name}`, { headers: { Range: 'bytes=0-1' }, cache: 'no-cache' });
            const audio = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/');
            void r.body?.cancel().catch(() => {});
            if (audio) {
              const m = manifest[id];
              const loop = m?.loopEnd ? { start: m.loopStart ?? 0, end: m.loopEnd, xfade: m.xfade ?? 1.5 } : null;
              this.files.set(id, { url: `${DIR}${name}`, gain: m?.gain ?? 1, loop });
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
      return new FileSource(ctx, file.url, out, file.gain, file.loop);
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
