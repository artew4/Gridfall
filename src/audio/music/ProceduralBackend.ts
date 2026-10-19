import { Instruments, TrackBus } from './Instruments';
import { SONGS, type MusicState, type Song } from './Songs';
import { fadeCurve, RANK, type MusicBackend } from './MusicBackend';

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const LOOP_BARS = 32;

interface Track {
  song: Song;
  bus: TrackBus;
  /** Audio time of step 0. */
  start: number;
  stepN: number;
  /** No steps are scheduled at or after this time. */
  stopAt: number;
  fillBar: number;
}

/**
 * Synthesised adaptive score. A lookahead scheduler on the audio clock (setInterval only wakes it up;
 * timing never depends on frame rate) plays composed patterns for each state. State changes land on
 * the next bar line of the playing track with an equal-power crossfade; at most two tracks sound.
 */
export class ProceduralBackend implements MusicBackend {
  readonly kind = 'procedural' as const;
  state: MusicState = 'exploration';
  private I: Instruments;
  private mix: GainNode;
  private duckGain: GainNode;
  private duckFilter: BiquadFilterNode;
  private reverb: AudioNode;
  private tracks: Track[] = [];
  private timer = 0;
  private started = false;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.I = new Instruments(ctx);
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.9;
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.duckGain = ctx.createGain();
    this.mix.connect(this.duckFilter).connect(this.duckGain).connect(out);
    this.reverb = this.I.makeReverb(this.mix);
  }

  start(state: MusicState) {
    if (this.started) return;
    this.started = true;
    this.state = state;
    const t = this.ctx.currentTime + 0.1;
    const tr = this.addTrack(state, t);
    tr.bus.out.gain.setValueCurveAtTime(fadeCurve(true), t, 2.5);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private addTrack(state: MusicState, start: number): Track {
    const song = SONGS[state];
    const bus = new TrackBus(this.ctx, this.mix, this.reverb, song.bpm);
    const tr: Track = { song, bus, start, stepN: 0, stopAt: Infinity, fillBar: -1 };
    this.tracks.push(tr);
    return tr;
  }

  private stepDur(tr: Track) {
    return 60 / tr.song.bpm / 4;
  }

  private tick() {
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const tr of this.tracks) {
      const dt = this.stepDur(tr);
      for (;;) {
        const t = tr.start + tr.stepN * dt;
        if (t >= horizon || t >= tr.stopAt) break;
        if (t > now - 0.05) {
          const barN = Math.floor(tr.stepN / 16);
          const bar = barN % LOOP_BARS;
          tr.song.play(this.I, tr.bus, {
            t,
            dt,
            bar,
            step: tr.stepN % 16,
            pb: bar % 8,
            section: Math.floor(bar / 8),
            fill: tr.fillBar === barN,
            age: barN,
          });
        }
        tr.stepN++;
      }
    }
    // Drop tracks whose tails have rung out.
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      if (now > tr.stopAt + 3) {
        tr.bus.disconnect();
        this.tracks.splice(i, 1);
      }
    }
  }

  /** The track that defines the current bar grid (the newest one that has already started). */
  private current(): Track | null {
    const now = this.ctx.currentTime;
    for (let i = this.tracks.length - 1; i >= 0; i--) if (this.tracks[i].start <= now) return this.tracks[i];
    return this.tracks[this.tracks.length - 1] ?? null;
  }

  transition(to: MusicState) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    // A pending (not yet started) entry is simply cancelled and re-planned.
    const pending = this.tracks.filter((t) => t.start > now);
    for (const p of pending) {
      p.stopAt = p.start;
      p.bus.kill.gain.setValueAtTime(0, now);
    }
    const cur = this.current();
    if (!cur) return;
    if (pending.length) {
      // Restore the playing track that was about to fade out.
      cur.stopAt = Infinity;
      cur.fillBar = -1;
      const g = cur.bus.fader.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      cur.bus.filter.frequency.cancelScheduledValues(now);
      cur.bus.filter.frequency.setValueAtTime(20000, now);
    }
    if (to === cur.song.state) {
      this.state = to;
      return;
    }
    // Anything else still sounding (an older crossfade) is cut quickly: max two tracks.
    for (const tr of this.tracks) {
      if (tr === cur || tr.stopAt <= now) continue;
      tr.stopAt = now + 0.05;
      tr.bus.kill.gain.setTargetAtTime(0, now, 0.04);
    }

    const rising = RANK[to] > RANK[cur.song.state];
    const bar = this.stepDur(cur) * 16;
    let T = cur.start + Math.ceil((now + 0.05 - cur.start) / bar) * bar;
    if (rising && T - now < 0.5) T += bar;
    const nextBarN = Math.round((T - cur.start) / bar);

    const outG = cur.bus.fader.gain;
    outG.cancelScheduledValues(now);
    outG.setValueAtTime(1, now);
    if (rising) {
      // Fill into the boundary, a riser, then the new track lands on a kick + crash.
      cur.fillBar = nextBarN - 1;
      this.I.riser(cur.bus, Math.max(now + 0.05, T - bar), T, 0.9);
      outG.setValueCurveAtTime(fadeCurve(false), T, 0.35);
      cur.stopAt = T + 0.35;
    } else {
      // Filter closes over two bars while the calmer track rises underneath.
      const f = cur.bus.filter.frequency;
      f.cancelScheduledValues(now);
      f.setValueAtTime(20000, T);
      f.exponentialRampToValueAtTime(260, T + bar * 2);
      outG.setValueAtTime(1, T);
      outG.setValueCurveAtTime(fadeCurve(false), T + bar * 0.5, bar * 1.5);
      this.I.downlifter(cur.bus, T - Math.min(bar, T - now), Math.min(bar, T - now) + 0.1);
      cur.stopAt = T + bar * 2;
    }
    const next = this.addTrack(to, T);
    const nextBar = this.stepDur(next) * 16;
    next.bus.out.gain.setValueAtTime(0, now);
    next.bus.out.gain.setValueCurveAtTime(fadeCurve(true), T, rising ? 0.04 : nextBar * 2);
    this.state = to;
  }

  fill() {
    const cur = this.current();
    if (!cur) return;
    const now = this.ctx.currentTime;
    const bar = this.stepDur(cur) * 16;
    const pos = (now - cur.start) / bar;
    // Too late in the bar for a satisfying fill: take the next one.
    cur.fillBar = Math.floor(pos) + (pos % 1 > 0.6 ? 1 : 0);
  }

  setDuck(on: boolean) {
    const now = this.ctx.currentTime;
    this.duckGain.gain.setTargetAtTime(on ? 0.32 : 1, now, 0.12);
    this.duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, now, 0.12);
  }

  activeTracks() {
    const now = this.ctx.currentTime;
    return this.tracks.filter((t) => t.start <= now + 0.01 && now < t.stopAt + 0.5).length;
  }

  dispose() {
    clearInterval(this.timer);
  }
}
