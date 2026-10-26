import { DESIGNS } from './Designs';
import { Rng } from './Dsp';

/*
  63.0: the sound effects rendered once, when the audio starts (Designs.ts: about 200 short buffers,
  a few tens of ms of work, done a few at a time between frames so nothing hitches), then played as
  buffers: a variant at random (never the one just played), a touch of pitch. Until a key is ready the
  engine falls back to its live synthesis.
*/
export class SfxBank {
  private bufs = new Map<string, AudioBuffer[]>();
  private last = new Map<string, number>();
  ready = false;
  /** DEV: how long the render took (ms of main-thread work, summed). */
  stats = { buffers: 0, ms: 0 };

  async build(ctx: BaseAudioContext) {
    const sr = ctx.sampleRate;
    let seed = 1;
    for (const [key, n, design] of DESIGNS) {
      const list: AudioBuffer[] = [];
      for (let v = 0; v < n; v++) {
        const t0 = performance.now();
        const x = design(new Rng(seed++ * 7919 + v), sr);
        const b = ctx.createBuffer(1, x.length, sr);
        b.getChannelData(0).set(x);
        list.push(b);
        this.stats.ms += performance.now() - t0;
        this.stats.buffers++;
      }
      this.bufs.set(key, list);
      // A key at a time, then the frame goes on.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    this.ready = true;
  }

  /** A variant of `key` (not the one played last), or null (not rendered yet, or no such key). */
  pick(key: string): AudioBuffer | null {
    const list = this.bufs.get(key);
    if (!list?.length) return null;
    const prev = this.last.get(key) ?? -1;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === prev) i = (i + 1) % list.length;
    this.last.set(key, i);
    return list[i];
  }

  has(key: string) {
    return !!this.bufs.get(key)?.length;
  }
}
