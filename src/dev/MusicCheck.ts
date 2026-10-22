import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';

/*
  DEV only (9.0). Music leak check: cycle through every level and back to the title, `cycles` times,
  staying `dwell` seconds in each (past the 2 s crossfade), and record what the MusicManager holds at
  every step: the track, live sources (playing or fading), and sources created vs disposed. A leak
  shows as `created − disposed` growing past the live count, or live staying above two.
*/

type Dev = { start(m: string, s?: string): void; god(on?: boolean): void };
const dev = () => (window as unknown as { __dev: Dev }).__dev;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const heapMB = () => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null;
};

const MODE: Record<SettingId, string> = { tokyo: 'arcade', desert: 'arcade', docks: 'tdm', jungle: 'arcade', neonblock: 'tdm', crashsite: 'tdm', oldport: 'tdm', maglev: 'tdm' };

export async function musicSoak(game: Game, opts: { cycles?: number; dwell?: number; settings?: SettingId[] } = {}) {
  const cycles = opts.cycles ?? 3;
  const dwell = (opts.dwell ?? 2.6) * 1000;
  const settings = opts.settings ?? (['tokyo', 'desert', 'docks', 'jungle'] as SettingId[]);
  const m = game.music;
  const steps: { at: string; track: string | null; live: number; kinds: string[]; created: number; disposed: number }[] = [];
  const sample = (at: string) => {
    const d = m.debug();
    steps.push({ at, track: d.current, live: d.live, kinds: d.slots.map((s) => `${s.id}:${s.kind}${s.fading ? '↓' : ''}`), created: d.stats.created, disposed: d.stats.disposed });
  };
  const heap0 = heapMB();
  for (let c = 0; c < cycles; c++) {
    for (const s of settings) {
      dev().start(MODE[s], s);
      dev().god(true);
      await wait(dwell);
      sample(`${s} (cycle ${c + 1})`);
      game.toTitle();
      await wait(dwell);
      sample(`title (cycle ${c + 1})`);
    }
  }
  await wait(3000);
  sample('settled');
  const last = steps[steps.length - 1];
  return {
    steps: steps.length,
    tracksSeen: [...new Set(steps.map((s) => s.track))],
    maxLive: Math.max(...steps.map((s) => s.live)),
    created: last.created,
    disposed: last.disposed,
    liveAtEnd: last.live,
    /** Sources neither live nor disposed (must be 0). */
    unaccounted: last.created - last.disposed - last.live,
    heapMB: { start: heap0, end: heapMB() },
    log: steps,
  };
}
