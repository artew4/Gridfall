import type { AudioEngine } from '../AudioEngine';
import { FileBackend, loadMusicFiles } from './FileBackend';
import { Score } from './Score';

export type MusicState = 'exploration' | 'combat' | 'intense';

export interface MusicInput {
  /** 'menu' covers title, intro and the ending. */
  mode: 'menu' | 'play' | 'dead';
  /** How tense the moment is, 0 (quiet city) .. 1 (full firefight). */
  intensity: number;
}

/**
 * One music instance for the whole session. By default the layered procedural Score follows the
 * intensity continuously. If `public/music/` holds a complete set of files, those are used instead,
 * picked by intensity band with hysteresis and bar-quantised crossfades.
 */
export class MusicDirector {
  private score: Score | null = null;
  private file: FileBackend | null = null;
  private files: Awaited<ReturnType<typeof loadMusicFiles>> | undefined;
  private filesPending: Promise<void> | null = null;
  state: MusicState = 'exploration';
  private inState = 0;

  preload(ctx: BaseAudioContext) {
    this.filesPending ??= loadMusicFiles(ctx).then((f) => {
      this.files = f;
    });
  }

  /** Idempotent: never creates a second score. */
  start(audio: AudioEngine) {
    if (this.score || this.file || !audio.started) return;
    const make = () => {
      if (this.score || this.file) return;
      if (this.files) {
        this.file = new FileBackend(audio.ctx, audio.musicIn, this.files);
        this.file.start('exploration');
      } else {
        this.score = new Score(audio.ctx, audio.musicIn);
        this.score.begin();
      }
    };
    if (this.files !== undefined || !this.filesPending) make();
    else {
      void this.filesPending.then(make);
      setTimeout(make, 400);
    }
  }

  get kind() {
    return this.score ? 'procedural' : this.file ? 'file' : 'none';
  }

  update(dt: number, i: MusicInput) {
    const target = i.mode === 'play' ? i.intensity : i.mode === 'dead' ? 0.05 : 0.02;
    if (this.score) {
      this.score.set(target);
      this.score.update(dt);
    }
    if (this.file) {
      this.file.update?.();
      this.inState += dt;
      const want: MusicState = target > 0.8 ? 'intense' : target > 0.5 ? 'combat' : 'exploration';
      // Up quickly, down only after a while.
      const rank = { exploration: 0, combat: 1, intense: 2 };
      if (want !== this.state && (rank[want] > rank[this.state] || this.inState > 10)) {
        this.state = want;
        this.inState = 0;
        this.file.transition(want);
      }
    }
    if (this.score) this.state = this.score.intensity > 0.75 ? 'intense' : this.score.intensity > 0.5 ? 'combat' : 'exploration';
  }

  accent() {
    /* The layered score handles peaks through intensity; nothing extra needed. */
  }

  setSuspended(on: boolean) {
    this.score?.setSuspended(on);
  }

  setPaused(p: boolean) {
    this.score?.setDuck(p);
    this.file?.setDuck(p);
  }

  /** Smoothed intensity and audible layers (debug). */
  debug() {
    return this.score ? { intensity: +this.score.intensity.toFixed(2), layers: this.score.audible() } : { state: this.state };
  }

  activeTracks() {
    return this.score ? 1 : (this.file?.activeTracks() ?? 0);
  }
}
