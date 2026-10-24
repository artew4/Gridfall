/*
  17.0, what the menus cost when nothing in the game is drawing (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/csscheck.mjs [seconds=5]      # URL=http://localhost:5174/Gridfall/ for another build

  Headless Chrome over the DevTools protocol. The game's animation loop is stopped, so whatever the
  page still does each second is the CSS's: style recalcs, layouts and paints driven by animations
  (a `background-position` drift or a blended overlay repaints the whole screen at the display's
  rate). Measured on the title's root screen (the 16.0 stage's menu) and on the pause menu over a
  match. Main-thread task time per second, and style and layout counts. 24.0: also with a menu button
  and a map card hovered (a hover must settle: no endless animation while the pointer rests), and the
  TDM HUD after a kill of the player's.
*/
import { openChrome, sleep } from './lib/cdp.mjs';

const seconds = Number(process.argv[2] ?? 5);
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';

const { send, ev, open, done } = await openChrome({ port: 9334 });
await send('Performance.enable');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));

async function measure(label) {
  await ev('__game.renderer.renderer.setAnimationLoop(null)');
  await sleep(500);
  const a = await metrics();
  await sleep(seconds * 1000);
  const b = await metrics();
  const per = (k) => +((b[k] - a[k]) / seconds).toFixed(k.endsWith('Duration') ? 4 : 1);
  return { label, taskMsPerS: +(per('TaskDuration') * 1000).toFixed(1), styleMsPerS: +(per('RecalcStyleDuration') * 1000).toFixed(1), layoutMsPerS: +(per('LayoutDuration') * 1000).toFixed(1), recalcsPerS: per('RecalcStyleCount'), layoutsPerS: per('LayoutCount') };
}

await open(`${URL}?setting=docks`);
await sleep(1500);
const rows = [];
rows.push(await measure('title (root, stage)'));
// 24.0: hovers must settle (transform and opacity transitions, then nothing): a menu button, then a
// map card on the maps screen. The pointer rests on it for the whole measurement.
const hover = async (sel) => {
  const r = await ev(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
};
// The title's logo glitch (an endless clip-path animation) recalculates style every frame by itself:
// stop it for the hover rows, so they show what the hover alone costs.
await ev(`(() => { const st = document.createElement('style'); st.id = 'csscheck-quiet'; st.textContent = '#title h1, #title .gm-logo { animation: none !important; }'; document.head.appendChild(st); })()`);
rows.push(await measure('title, logo glitch off'));
await hover('#title [data-act="settings"]');
rows.push(await measure('title, a button hovered'));
await ev(`document.querySelector('#title [data-mode="tdm"]').click()`);
await sleep(800);
await ev(`__game.renderer.renderer.setAnimationLoop(null)`);
if (await ev(`!!document.querySelector('#title [data-setting]')`)) {
  await hover('#title [data-setting]');
  rows.push(await measure(await ev(`document.querySelector('#title .map-card') ? 'maps, a map card hovered' : 'maps, a map hovered'`)));
}
await ev(`document.getElementById('csscheck-quiet')?.remove()`);
await ev(`(async()=>{ __dev.start('tdm','docks'); await new Promise(r=>setTimeout(r,1500)); __game.pause(); })()`);
await sleep(800);
rows.push(await measure('pause menu over a match'));
// 24.0: the match's HUD (the loop stopped: only what CSS itself keeps doing), after a kill of his.
await ev(`(async()=>{ const g = __game; g.resume?.(); await new Promise(r=>setTimeout(r,600)); const b = g.tdm.bots; g.tdmHud.kill(g.playerUnit, b.find((x) => x.team === 'omega'), 'AR'); g.tdm.player.kills++; g.tdm.showStanding?.(); })()`);
await sleep(1200);
rows.push(await measure('the TDM HUD (a kill of his in the feed)'));
console.table(rows);
console.log(JSON.stringify(rows));
done(0);
