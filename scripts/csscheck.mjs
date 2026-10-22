/*
  17.0, what the menus cost when nothing in the game is drawing (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/csscheck.mjs [seconds=5]      # URL=http://localhost:5174/Gridfall/ for another build

  Headless Chrome over the DevTools protocol. The game's animation loop is stopped, so whatever the
  page still does each second is the CSS's: style recalcs, layouts and paints driven by animations
  (a `background-position` drift or a blended overlay repaints the whole screen at the display's
  rate). Measured on the title's root screen (the 16.0 stage's menu) and on the pause menu over a
  match. Main-thread task time per second, and style and layout counts.
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
await ev(`(async()=>{ __dev.start('tdm','docks'); await new Promise(r=>setTimeout(r,1500)); __game.pause(); })()`);
await sleep(800);
rows.push(await measure('pause menu over a match'));
console.table(rows);
console.log(JSON.stringify(rows));
done(0);
