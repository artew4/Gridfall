/*
  52.0, the main menu's map pictures (DEV, Node 22+ and Google Chrome on the machine's GPU):

    npm run dev            # in another terminal (port 5173)
    node scripts/mapshots.mjs [maps=all] [t=seconds into the title camera's drift]

  For each map: builds it as the menu does, drops the menu and the HUD, puts the camera where the
  map's own title camera is `t` s into its drift, lets the picture settle (bloom, rain, the storm's
  calm) and writes public/maps/<id>.webp at 1920×1080. The menu shows these instead of a live map.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

process.env.GPU = '1';
const BASE = process.env.URL ?? 'http://localhost:5173/';
const ALL = ['tokyo', 'neonblock', 'desert', 'jungle', 'crashsite', 'docks', 'oldport', 'maglev', 'favelas'];
const MAPS = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : ALL;
const T = Number(process.argv[3] ?? 6);
const OUT = new URL('../public/maps/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const { send, ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9585) });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
for (const id of MAPS) {
  await open(`${BASE}?setting=${id}`);
  await ev(`new Promise((r) => { const i = setInterval(() => { if (window.__game?.ready) { clearInterval(i); r(1); } }, 20); })`);
  await sleep(500);
  const t = Number(process.env[`T_${id}`] ?? T);
  await ev(page(`
    const g = __game;
    // Into the maps screen in a mode the map has (the story's Tokyo has no Team Deathmatch).
    g['menuEvent']({ type: 'mode', mode: g.level.info.modes.includes('tdm') ? 'tdm' : g.level.info.modes[0] });
    await sl(400);
    if (g.setting !== '${id}') throw new Error('built ' + g.setting + ', not ${id}');
    g.level.storm?.clock.set('calm', 0);
    for (const el of document.querySelectorAll('#title, #hud, .hud, .tdm-hud, .layer, #banner, #cine, #skip, #zone')) el.style.visibility = 'hidden';
    document.body.style.cursor = 'none';
    // The title camera held at its moment t (the frame loop sets it from elapsed: hold elapsed there).
    const lv = g.level, cam = g.camera;
    lv.titleCamera = ((f) => (c) => f.call(lv, c, ${t}))(lv.titleCamera);
    await sl(2500);
    return 1;
  `));
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 82 });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(new URL(`${id}.webp`, OUT), buf);
  console.log(id, (buf.length / 1024).toFixed(0) + ' KB');
}
done(0);
