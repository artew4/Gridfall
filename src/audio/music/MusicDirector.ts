import type { AudioEngine } from '../AudioEngine';
import type { MusicBackend } from './MusicBackend';
import type { MusicState } from './Songs';
import { ProceduralBackend } from './ProceduralBackend';
import { FileBackend, loadMusicFiles } from './FileBackend';

export interface MusicInput {
  /** 'menu' covers title, intro and death. */
  mode: 'menu' | 'play' | 'dead';
  fighting: boolean;
  wave: number;
  alive: number;
  hp: number;
}

/**
 * Decides what the music should be doing and tells the single backend. Intensity rises quickly and
 * falls slowly (hysteresis), so the score doesn't flap between states mid-fight.
 */
export class MusicDirector {
  state: MusicState = 'exploration';
  private backend: MusicBackend | null = null;
  private files: Awaited<ReturnType<typeof loadMusicFiles>> | undefined;
  private filesPending: Promise<void> | null = null;
  private wantT = 0;
  private calmT = 0;
  private inState = 0;

  /** Starts fetching optional music files early (no-op if there are none). */
  preload(ctx: BaseAudioContext) {
    this.filesPending ??= loadMusicFiles(ctx).then((f) => {
      this.files = f;
    });
  }

  /** Idempotent: the same backend is reused for the whole session, never duplicated. */
  start(audio: AudioEngine) {
    if (this.backend || !audio.started) return;
    const make = () => {
      if (this.backend) return;
      this.backend = this.files ? new FileBackend(audio.ctx, audio.musicIn, this.files) : new ProceduralBackend(audio.ctx, audio.musicIn);
      this.backend.start(this.state);
    };
    // Give a pending manifest a moment, but never hold the music back for long.
    if (this.files !== undefined || !this.filesPending) make();
    else {
      void this.filesPending.then(make);
      setTimeout(make, 400);
    }
  }

  get kind() {
    return this.backend?.kind ?? 'none';
  }

  update(dt: number, i: MusicInput) {
    this.backend?.update?.();
    this.inState += dt;
    let target: MusicState = 'exploration';
    if (i.mode === 'play' && i.fighting) {
      const hot = i.wave >= 5 || i.alive >= 7 || i.hp < 0.3;
      if (hot) {
        this.wantT += dt;
        this.calmT = 0;
      } else {
        this.calmT += dt;
        this.wantT = 0;
      }
      if (this.state === 'intense') target = this.calmT > 4 && this.inState > 8 ? 'combat' : 'intense';
      else target = this.wantT > 0.8 ? 'intense' : 'combat';
    } else {
      this.wantT = this.calmT = 0;
    }
    if (target !== this.state) {
      this.state = target;
      this.inState = 0;
      this.backend?.transition(target);
    }
  }

  /** Musical punctuation for peak moments (last enemy of a wave, a sniper taking position). */
  accent() {
    this.backend?.fill();
  }

  setPaused(p: boolean) {
    this.backend?.setDuck(p);
  }

  activeTracks() {
    return this.backend?.activeTracks() ?? 0;
  }
}
