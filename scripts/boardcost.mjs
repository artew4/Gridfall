/*
  26.0, what a kill costs the HUD (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/boardcost.mjs [kills=200]

  Headless Chrome, a TDM match with the game loop stopped. Each step is one kill on the board (a random
  ALPHA bot's kills + 1, the board re-sorted, rows moved) and a frame; style, layout and paint time are
  read off the DevTools metrics across all of them, per kill. The layout's scope is read too: the
  board is a containment root, so a relayout stays inside it.
*/
import { openChrome, sleep, page } from './lib/cdp.mjs';

const N = Number(process.argv[2] ?? 200);
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { send, ev, open, done } = await openChrome({ port: 9336 });
await send('Performance.enable');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
await open(`${URL}?setting=maglev`);
await sleep(1200);
await ev(page(`__dev.start('tdm'); __dev.god(true); await sl(2500); __game.renderer.renderer.setAnimationLoop(null); await sl(300);`));
const raf = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
// The idle frames alone, then the same frames with a kill each.
const run = async (kill) => {
  const a = await metrics();
  const t = await ev(`(async () => { const g = __game, t = g.tdm, al = t.slots.filter((s) => s.team === 'alpha'); let js = 0;
    for (let i = 0; i < ${N}; i++) { ${kill ? `const s = al[(i * 7) % al.length]; s.kills++; if (i % 3 === 0) s.deaths++; const t0 = performance.now(); t.showStanding(); js += performance.now() - t0;` : ''} await ${raf}; }
    return js; })()`);
  const b = await metrics();
  const d = (k) => b[k] - a[k];
  return { js: t, style: d('RecalcStyleDuration') * 1000, layout: d('LayoutDuration') * 1000, recalcs: d('RecalcStyleCount'), layouts: d('LayoutCount') };
};
const idle = await run(false);
const kills = await run(true);
const per = (k) => +((kills[k] - idle[k]) / N).toFixed(4);
const row = { kills: N, jsMsPerKill: +(kills.js / N).toFixed(4), styleMsPerKill: per('style'), layoutMsPerKill: per('layout'), recalcsPerKill: per('recalcs'), layoutsPerKill: per('layouts') };
// The board's order after it all (sanity: by score).
row.order = await ev(`[...document.querySelectorAll('.tdm-board .row')].map((e) => [e.style.transform, e.querySelector('.sc').textContent]).sort((a, b) => parseFloat(a[0].slice(11)) - parseFloat(b[0].slice(11))).map((x) => +x[1]).join(' ')`);
console.log(JSON.stringify(row));
done(0);
