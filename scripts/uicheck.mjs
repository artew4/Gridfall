/*
  24.0, the UI at real screen sizes (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/uicheck.mjs [out-dir]      # URL=… for another server; SIZES=1440x900,3840x2160

  Headless Chrome at each viewport (device scale 1): the title's root menu, the maps screen (the map
  cards), a TDM match's HUD (with a kill of the player's in the feed) and the result screen. For each:
  the smallest visible text (px), anything that spills off the screen, and (the HUD) any overlap of the
  minimap, the health, the callsign, the ammo and the live scoreboard. Screenshots go to `out-dir`.
  Exit 1 on any spill, overlap, or text under 11 px.
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openChrome, sleep, page } from './lib/cdp.mjs';

const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const OUT = process.argv[2] ?? null;
const SIZES = (process.env.SIZES ?? '1440x900,1920x1080,2560x1440,3840x2160').split(',').map((s) => s.split('x').map(Number));
const MIN_PX = 11;

const { send, ev, open, done } = await openChrome({ port: 9335 });
if (OUT) mkdirSync(OUT, { recursive: true });

/** In the page: measure what is on screen under `roots` (selectors), and overlaps among `pairs`. */
const MEASURE = (roots, pairs) => `(() => {
  const W = innerWidth, H = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; let n = e; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; n = n.parentElement; } return r; };
  let minFont = Infinity, minAt = '', spills = [];
  for (const sel of ${JSON.stringify(roots)}) for (const root of document.querySelectorAll(sel)) for (const e of [root, ...root.querySelectorAll('*')]) {
    // Ally name tags are projected anywhere (off screen for allies behind him): not layout.
    if (e.closest('.tdm-tags')) continue;
    const r = vis(e); if (!r) continue;
    const own = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (own) { const f = parseFloat(getComputedStyle(e).fontSize); if (f < minFont) { minFont = f; minAt = (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24); } }
    if (own && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1)) spills.push((e.className || e.tagName) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  const overlaps = [];
  const P = ${JSON.stringify(pairs)};
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = document.querySelector(P[i]), b = document.querySelector(P[j]);
    const ra = a && vis(a), rb = b && vis(b);
    if (ra && rb && ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom) overlaps.push(P[i] + ' × ' + P[j]);
  }
  return { rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize), minFont: +minFont.toFixed(1), minAt, spills: spills.slice(0, 6), overlaps };
})()`;

async function shot(name, w, h) {
  if (!OUT) return;
  const scale = w > 2000 ? 0.5 : 1;
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale } });
  writeFileSync(join(OUT, `${name}-${w}x${h}.png`), Buffer.from(r.result.data, 'base64'));
}

const rows = [];
let bad = 0;
for (const [w, h] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await open(`${URL}?setting=maglev`);
  await sleep(1200);
  const check = async (label, roots, pairs = []) => {
    const m = await ev(MEASURE(roots, pairs));
    const ok = !m.spills.length && !m.overlaps.length && m.minFont >= MIN_PX;
    if (!ok) bad++;
    rows.push({ size: `${w}x${h}`, screen: label, rootPx: m.rootPx, minFontPx: m.minFont, ok, ...(ok ? {} : { minAt: m.minAt, spills: m.spills.join(' | '), overlaps: m.overlaps.join(' | ') }) });
    await shot(label, w, h);
  };
  await check('menu', ['#title']);
  await ev(page(`document.querySelector('#title [data-mode="tdm"]').click(); await sl(900);`));
  await check('maps', ['#title']);
  // A match: the HUD, with a kill of his and one of a bot's in the feed, his standing set.
  await ev(page(`
    __dev.start('tdm'); __dev.god(true); await sl(2500);
    const g = __game, bots = g.tdm.bots, me = g.playerUnit;
    const foe = bots.find((b) => b.team === 'omega'), mate = bots.find((b) => b.team === 'alpha');
    g.tdmHud.kill(mate, foe, 'SMG'); g.tdmHud.kill(me, foe, 'AR'); g.tdmHud.setMe(2, 7, 12, 4);
    await sl(900);`));
  await check('hud', ['#hud', '.tdm-hud'], ['.minimap.tdm-map', '#hud .health', '#hud .callsign', '#hud .ammo', '.tdm-right']);
  // The result screen with the match's own lines.
  await ev(page(`
    const g = __game, t = g.tdm;
    const lines = [{ name: g.playerUnit.name, team: 'alpha', you: true, kills: 12, deaths: 4, weapon: 'AR' }, ...t.slots.map((s, i) => ({ name: s.name, team: s.team, you: false, kills: (i * 7) % 15, deaths: (i * 5) % 9, weapon: s.arm?.tag ?? '' }))];
    const { nextMaps } = await import('/src/ui/MenuFlow.ts');
    const { LEVEL_ORDER, levelEntry } = await import('/src/levels/registry.ts');
    g.tdmHud.show(false);
    g.tdmScreen.show(true, { alpha: 31, omega: 0 }, lines, 214, nextMaps('tdm', g.setting, LEVEL_ORDER.map((id) => levelEntry(id).info)));
    // Wait for its fade-in (at 4K the software renderer draws slowly: a fixed wait read it at opacity 0).
    for (let i = 0; i < 60 && +getComputedStyle(document.getElementById('tdmscreen')).opacity < 0.99; i++) await sl(250);`));
  await check('result', ['#tdmscreen']);
}
console.table(rows.map(({ spills, overlaps, minAt, ...r }) => r));
for (const r of rows) if (!r.ok) console.log(r.size, r.screen, '| min', r.minFontPx, r.minAt, '| spills', r.spills, '| overlaps', r.overlaps);
console.log(JSON.stringify(rows));
done(bad ? 1 : 0);
