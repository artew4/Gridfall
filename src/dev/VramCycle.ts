import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';

/*
  17.0, the GPU-memory lifecycle check (DEV): Neon Block → Crash Site → the main menu → Neon Docks,
  round twice, every switch through the real UI a player uses (the result screen's next-map card,
  its MAIN MENU button, the menu's mode and map cards and DEPLOY). At every stop it records what the
  renderer holds on the GPU (renderer.info.memory: geometries and textures; compiled programs) and
  what the scene holds (objects, point lights the renderer draws). JavaScript's GC never frees GPU
  memory: a geometry, material, texture or render target nobody disposed stays allocated, so a leak
  shows here as a count that grows lap over lap. A clean teardown gives the same numbers on both laps.
*/

interface Stop {
  lap: number;
  at: string;
  geometries: number;
  textures: number;
  programs: number;
  sceneObjects: number;
  /** Point lights the renderer draws (the pool's slots plus the unpooled ones). */
  drawnPointLights: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Clicks `sel` once it is in the page (the result screen's cards come in after its fade). */
const click = async (sel: string) => {
  let b: HTMLElement | null = null;
  for (let k = 0; k < 300 && !(b = document.querySelector<HTMLElement>(sel)); k++) await wait(10);
  if (!b) throw new Error(`no ${sel}`);
  b.click();
};

export async function vramCycle(game: Game, opts: { laps?: number; play?: number } = {}) {
  const laps = opts.laps ?? 2;
  const playMs = opts.play ?? 2500;
  const g = game as unknown as { skipIntro(): void; intro: { t: number } | null; stage: object | null; loading: boolean; menuState: { screen: string } };
  const dev = (window as unknown as { __dev: { start(m: string, s?: SettingId): string; lock(): void; god(on?: boolean): void } }).__dev;
  const tdm = game.tdm as unknown as { end(o: { winner: 'alpha' | 'omega' | 'draw'; why: 'elimination' }): void };
  const stops: Stop[] = [];
  const errors: string[] = [];
  const onErr = (e: ErrorEvent) => errors.push(String(e.message));
  window.addEventListener('error', onErr);

  const record = (lap: number, at: string) => {
    let objects = 0, lights = 0;
    const scene = game.renderer.scene;
    scene.traverse((o) => {
      objects++;
      if ((o as { isPointLight?: boolean }).isPointLight && o.layers.test(game.camera.layers)) lights++;
    });
    const r = game.renderer.renderer;
    stops.push({ lap, at, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: (r.info.programs ?? []).length, sceneObjects: objects, drawnPointLights: lights });
  };
  const intoPlay = async () => {
    for (let i = 0; i < 600 && game.state !== 'intro' && game.state !== 'play'; i++) await wait(10);
    for (let i = 0; i < 300 && game.state === 'intro'; i++) {
      if (g.intro && g.intro.t >= 0.4) g.skipIntro();
      await wait(16);
    }
    dev.lock();
    dev.god(true);
  };
  /** The match ends; the result screen's card for `next` (a map) or its MAIN MENU button. */
  const leave = async (next: SettingId | 'menu') => {
    tdm.end({ winner: 'alpha', why: 'elimination' });
    // The result screen comes 1.2 s of game time later: a paused game (a lost pointer lock) never gets there.
    for (let k = 0; k < 600 && game.state !== 'ending'; k++) {
      if (game.state === 'paused') dev.lock();
      await wait(10);
    }
    await wait(100);
    if (next === 'menu') await click('#tdmscreen .next-maps [data-act="menu"]');
    else await click(`#tdmscreen [data-map="${next}"]`);
    for (let k = 0; k < 2000 && (next === 'menu' ? game.state !== 'title' : game.setting !== next); k++) await wait(5);
  };

  dev.start('tdm', 'neonblock');
  await intoPlay();
  for (let lap = 0; lap < laps; lap++) {
    await wait(playMs);
    record(lap, 'neonblock');
    await leave('crashsite');
    await intoPlay();
    await wait(playMs);
    record(lap, 'crashsite');
    await leave('menu');
    // Back from a match the menu opens on the mode's maps screen (once a mode was picked): BACK to
    // the root, where the stage is built.
    // (The level is rebuilt behind the menu first; the menu takes no input while it loads.)
    for (let k = 0; k < 1000 && (game.state !== 'title' || g.loading); k++) await wait(10);
    if (g.menuState.screen === 'maps') await click('.mainmenu [data-screen="maps"] [data-act="back"]');
    // The level is rebuilt behind the menu first, then the stage comes up and is what is drawn.
    for (let k = 0; k < 1000 && (g.loading || game.renderer.scene.name !== 'menu-stage'); k++) await wait(10);
    await wait(playMs);
    record(lap, 'menu (stage)');
    // The menu as a player uses it: TDM, the docks card, DEPLOY (the stage is freed on the way).
    await click('#title [data-mode="tdm"]');
    for (let k = 0; k < 500 && (g.stage || g.loading); k++) await wait(20);
    await click('#title [data-setting="docks"]');
    for (let k = 0; k < 1500 && (game.setting !== 'docks' || g.loading); k++) await wait(20);
    await click('#title [data-act="deploy"]');
    await intoPlay();
    await wait(playMs);
    record(lap, 'docks');
    if (lap < laps - 1) await leave('neonblock');
    await intoPlay();
  }
  window.removeEventListener('error', onErr);
  // Steady state: the last lap against the one before (the first lap also compiles shader variants
  // first met in play, e.g. a bot's gun: programs settle after it).
  const last = laps - 1;
  const growth = stops
    .filter((s) => s.lap === last && last > 0)
    .map((s) => {
      const prev = stops.find((f) => f.lap === last - 1 && f.at === s.at)!;
      return { at: s.at, geometries: s.geometries - prev.geometries, textures: s.textures - prev.textures, programs: s.programs - prev.programs, sceneObjects: s.sceneObjects - prev.sceneObjects };
    });
  const res = { stops, growthLastLap: growth, errors, ok: errors.length === 0 && growth.length > 0 && growth.every((d) => d.geometries <= 0 && d.textures <= 0 && d.programs <= 0) };
  (window as unknown as { __vram: unknown }).__vram = res;
  return res;
}
