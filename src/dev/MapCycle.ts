import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';

/*
  13.0, the map-to-map teardown check (DEV): Team Deathmatch on one map, the match forced to its end,
  then the real "choose next map" card on the result screen clicked (the same DOM button a player
  clicks), the intro skipped, the next match played a little, and so on round a loop of maps — twice,
  so the second lap can be compared with the first (a leak grows lap over lap; a cache does not).

  Per map it records what the GPU, the scene and the page hold (geometries, textures, programs,
  objects, DOM nodes, HUD rows, the JS heap), and it keeps a WeakRef to everything the outgoing level
  built (the level, its scene, collision world, nav graph, projectile pool, its bots, the minimap's
  DOM). At the end it churns memory to provoke a major GC and reports which of those are still alive:
  anything alive is held by something that outlived its level.
*/

interface Snap {
  lap: number;
  setting: SettingId;
  geometries: number;
  textures: number;
  programs: number;
  sceneObjects: number;
  domNodes: number;
  minimaps: number;
  nameTags: number;
  feedRows: number;
  loadoutViews: number;
  bots: number;
  heapMB: number | null;
  /** ms from the click to the new level built. */
  buildMs: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = (n: number) => new Promise<void>((r) => {
  let k = 0;
  const f = () => (++k >= n ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});

function heapMB() {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null;
}

export async function mapCycle(game: Game, opts: { maps?: SettingId[]; laps?: number; play?: number } = {}) {
  const maps = opts.maps ?? ['desert', 'docks', 'crashsite'];
  const laps = opts.laps ?? 2;
  const playMs = opts.play ?? 2500;
  const g = game as unknown as { skipIntro(): void; resume(): void; intro: { t: number } | null };
  const dev = (window as unknown as { __dev: { start(m: string, s?: SettingId): string; lock(): void; god(on?: boolean): void } }).__dev;
  const tdm = game.tdm as unknown as { end(w: 'alpha' | 'omega'): void; minimap: { root: HTMLElement } | null; bots: unknown[] };
  const snaps: Snap[] = [];
  const refs: { what: string; from: SettingId; ref: WeakRef<object> }[] = [];
  const errors: string[] = [];
  const onErr = (e: ErrorEvent) => errors.push(String(e.message));
  window.addEventListener('error', onErr);

  const snap = (lap: number, buildMs: number): Snap => {
    let objects = 0;
    game.scene.traverse(() => objects++);
    const mem = game.renderer.renderer.info.memory;
    return {
      lap,
      setting: game.setting,
      geometries: mem.geometries,
      textures: mem.textures,
      programs: (game.renderer.renderer.info.programs ?? []).length,
      sceneObjects: objects,
      domNodes: document.getElementsByTagName('*').length,
      minimaps: document.querySelectorAll('.tdm-map').length,
      nameTags: document.querySelectorAll('.tdm-tag').length,
      feedRows: document.querySelectorAll('.tdm-feed .row').length,
      loadoutViews: document.querySelectorAll('.loadout').length,
      bots: tdm.bots.length,
      heapMB: heapMB(),
      buildMs,
    };
  };

  /** Into play on the new map: wait out the build, skip the intro, take the (faked) mouse lock. */
  const intoPlay = async () => {
    for (let i = 0; i < 400 && game.state !== 'intro' && game.state !== 'play'; i++) await wait(10);
    for (let i = 0; i < 200 && game.state === 'intro'; i++) {
      if (g.intro && g.intro.t >= 0.4) g.skipIntro();
      await frames(1);
    }
    dev.lock();
    dev.god(true);
  };

  // Lap 0 starts with an ordinary menu deploy onto the first map.
  if (game.setting !== maps[0] || game.mode !== 'tdm' || game.state !== 'play') dev.start('tdm', maps[0]);
  dev.lock();
  dev.god(true);
  let buildMs = 0;
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < maps.length; i++) {
      await wait(playMs);
      snaps.push(snap(lap, buildMs));
      // Everything this level built, to be freed by the next map.
      const from = game.setting;
      const keep: [string, object | null | undefined][] = [
        ['level', game.level],
        ['scene', game.scene],
        ['collision', game.col],
        ['nav', game.nav],
        ['projectiles', game.projectiles],
        ['enemyCtx', game.ctx],
        ['player', game.player],
        ['bot', tdm.bots[0] as object | undefined],
        ['minimapDom', tdm.minimap?.root],
      ];
      for (const [what, o] of keep) if (o) refs.push({ what, from, ref: new WeakRef(o) });
      // The match ends (ALPHA wins): the result screen and its next-map cards.
      tdm.end('alpha');
      for (let k = 0; k < 300 && game.state !== 'ending'; k++) await wait(10);
      await frames(3);
      const next = maps[(i + 1) % maps.length];
      const card = document.querySelector<HTMLElement>(`#tdmscreen [data-map="${next}"]`);
      if (!card) throw new Error(`no next-map card for ${next} on the result screen`);
      const t0 = performance.now();
      card.click();
      for (let k = 0; k < 2000 && game.setting !== next; k++) await wait(5);
      buildMs = Math.round(performance.now() - t0);
      await intoPlay();
    }
  }
  await wait(playMs);
  snaps.push(snap(laps, buildMs));

  // Churn to provoke a major GC, then see what of the old levels is still reachable.
  // The level just left is measured to stay reachable for ~5 s after the switch (then freed with no
  // further switch: not a leak, nothing accumulates lap over lap), so the last one gets time first.
  // The churn is ordinary small objects: typed-array garbage lives off the V8 heap and need not
  // trigger a full collection.
  for (let pass = 0; pass < 2; pass++) {
    await wait(4000);
    for (let r = 0; r < 6; r++) {
      let junk: unknown[] | null = [];
      for (let k = 0; k < 300_000; k++) junk.push({ k, a: [k] });
      junk = null;
      await wait(50);
    }
  }
  // Every ref was taken on a level the loop then left (the level loaded now was never tracked), so
  // anything still alive is a leak.
  const leaked = refs.filter((r) => r.ref.deref() !== undefined).map((r) => `${r.from}:${r.what}`);
  window.removeEventListener('error', onErr);

  const lap0 = snaps.filter((s) => s.lap === 0), lap1 = snaps.filter((s) => s.lap === 1);
  const growth = lap1.map((s, i) => ({
    setting: s.setting,
    geometries: s.geometries - lap0[i].geometries,
    textures: s.textures - lap0[i].textures,
    programs: s.programs - lap0[i].programs,
    sceneObjects: s.sceneObjects - lap0[i].sceneObjects,
    domNodes: s.domNodes - lap0[i].domNodes,
    heapMB: s.heapMB !== null && lap0[i].heapMB !== null ? +(s.heapMB - lap0[i].heapMB).toFixed(1) : null,
  }));
  const res = {
    snaps,
    growthLap2vsLap1: growth,
    weakRefs: { tracked: refs.length, leaked },
    singletons: { minimapsMax: Math.max(...snaps.map((s) => s.minimaps)), loadoutViewsMax: Math.max(...snaps.map((s) => s.loadoutViews)) },
    errors,
    ok: leaked.length === 0 && errors.length === 0 && snaps.every((s) => s.minimaps <= 1 && s.loadoutViews === 1),
  };
  (window as unknown as { __cycle: unknown }).__cycle = res;
  // The refs stay reachable from the console: a level still alive here can be re-checked after more GC.
  (window as unknown as { __cycleRefs: unknown }).__cycleRefs = refs;
  return res;
}
