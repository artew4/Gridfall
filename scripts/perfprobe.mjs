/*
  52.0, the menu's and the match start's hitches (DEV, Node 22+ and Google Chrome; GPU=1 for the
  machine's GPU, as a player sees it).

    npm run dev            # in another terminal (port 5173)
    GPU=1 node scripts/perfprobe.mjs [maps=desert,docks] [seconds=30]

  Measures, in a fresh page: the boot (navigation to the menu ready), the root menu idle (10 s of
  frames: over 25 ms, over 50 ms, the longest; long tasks), picking each Team Deathmatch map on the
  maps screen (the longest main-thread task after each pick), and for each map in `maps`: PLAY to
  the intro (the load), and the first `seconds` of play (frames over 25 / 50 ms, the longest, long
  tasks, programs compiled mid-play).
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const MAPS = (process.argv[2] ?? 'desert,docks').split(',');
const SECS = Number(process.argv[3] ?? 30);
const URL = process.env.URL ?? 'http://localhost:5173/';
const { send, ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9582) });
await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 900), deviceScaleFactor: Number(process.env.DPR ?? 1), mobile: false });

const out = {};
const t0 = Date.now();
await open(`${URL}?setting=${MAPS[0]}`);
await ev(`new Promise((r) => { const i = setInterval(() => { if (window.__game?.ready) { clearInterval(i); r(1); } }, 20); })`);
out.bootMs = Date.now() - t0;
// Long tasks and frame deltas, recorded from here on.
await ev(page(`
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: false });
  window.__fr = [];
  let last = performance.now();
  const tick = (now) => { window.__fr.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 1;
`));
const window_ = async (ms) => {
  await ev(`(window.__fr.length = 0, window.__lt.length = 0, 1)`);
  await sleep(ms);
  return JSON.parse(await ev(`JSON.stringify((() => { const f = window.__fr.slice(2); const lt = window.__lt.map((e) => e.d); return { frames: f.length, over25: f.filter((d) => d > 25).length, over50: f.filter((d) => d > 50).length, max: Math.round(Math.max(0, ...f)), longTasks: lt.length, longestTask: Math.round(Math.max(0, ...lt)) }; })())`));
};
out.rootIdle = await window_(10000);
// The maps screen, and each map picked in turn.
await ev(page(`__game.audio.start?.(); document.querySelector('[data-act="play"]')?.click(); return 1;`));
await sleep(1500);
out.mapsIdle = await window_(5000);
const ids = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-setting]')].map((e) => e.dataset.setting))`));
out.picks = {};
for (const id of ids) {
  await ev(`(window.__lt.length = 0, window.__fr.length = 0, 1)`);
  const a = Date.now();
  await ev(`(document.querySelector('[data-setting="${id}"]')?.click(), 1)`);
  await ev(`new Promise((r) => { const i = setInterval(() => { if (!__game.loading) { clearInterval(i); r(1); } }, 20); })`);
  await sleep(600);
  out.picks[id] = JSON.parse(await ev(`JSON.stringify({ ms: ${'Date.now()'} - ${a}, longestTask: Math.round(Math.max(0, ...window.__lt.map((e) => e.d))), maxFrame: Math.round(Math.max(0, ...window.__fr.slice(1))) })`));
}
for (const map of MAPS) {
  await ev(`(document.querySelector('[data-setting="${map}"]')?.click(), 1)`);
  await ev(`new Promise((r) => { const i = setInterval(() => { if (!__game.loading) { clearInterval(i); r(1); } }, 20); })`);
  await sleep(500);
  const a = Date.now();
  await ev(page(`
    const g = __game; g.input.requestLock = () => {}; g.input.locked = true;
    document.querySelector('[data-act="deploy"]')?.click();
    while (g.state !== 'intro' || g.loadingScreen.active) await sl(20);
    return 1;
  `));
  const loadMs = Date.now() - a;
  // The intro's flight as he sees it (not skipped), then play.
  await ev(`(window.__fr.length = 0, window.__lt.length = 0, 1)`);
  await ev(page(`const g = __game; while (g.state !== 'play') await sl(50); window.__p0 = g.renderer.renderer.info.programs.length; return 1;`));
  const intro = JSON.parse(await ev(`JSON.stringify((() => { const f = window.__fr.slice(2); const lt = window.__lt.map((e) => e.d); return { frames: f.length, over25: f.filter((d) => d > 25).length, over50: f.filter((d) => d > 50).length, max: Math.round(Math.max(0, ...f)), longestTask: Math.round(Math.max(0, ...lt)) }; })())`));
  // He plays: walks, turns, fires in bursts, aims now and then, reloads (the first shot, impact,
  // sound and effect of each kind are what a cold engine hitches on).
  await ev(page(`
    const g = __game, I = g.input; let k = 0;
    window.__drive = setInterval(() => {
      k++;
      I.keys.add('KeyW');
      if (k % 7 === 0) I.keys.add('ShiftLeft'); else I.keys.delete('ShiftLeft');
      I.mouseDown = k % 24 < 9;
      I.aimDown = k % 50 > 30;
      if (k % 45 === 0) I.pressed.add('KeyR');
      if (k % 13 === 0) I.pressed.add('Space');
      g.player.yaw += k % 30 < 15 ? 0.06 : -0.08;
    }, 100);
    return 1;
  `));
  const play = await window_(SECS * 1000);
  await ev(`(clearInterval(window.__drive), __game.input.mouseDown = false, __game.input.keys.clear(), 1)`);
  play.shots = await ev(`__game.stats?.shots ?? -1`);
  play.newPrograms = await ev(`__game.renderer.renderer.info.programs.length - window.__p0`);
  out[map] = { loadMs, intro, play };
  await ev(page(`const g = __game; g.pause?.(); g['toTitle']?.(); return 1;`)).catch(() => {});
  await sleep(1500);
  await ev(page(`document.querySelector('[data-act="play"]')?.click(); return 1;`)).catch(() => {});
  await sleep(1000);
}
console.log(JSON.stringify(out, null, 1));
done(0);
