/*
  44.0, the first minute's hitches (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/hitchprobe.mjs [maps=oldport,favelas] [seconds=30]

  Headless Chrome deploys into Team Deathmatch as DEPLOY does and records, for every frame drawn over
  the first `seconds`: how long the render took, and the renderer's shader programs and textures. A
  program or texture that first appears mid-match is a hitch the loading should have paid for.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const MAPS = (process.argv[2] ?? 'oldport,favelas').split(',');
const SECS = Number(process.argv[3] ?? 30);
const URL = process.env.URL ?? 'http://localhost:5173/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9581) });

for (const map of MAPS) {
  await open(`${URL}?setting=${map}`);
  await sleep(1000);
  const r = await ev(page(`
    const g = __game, I = g.input, R = g.renderer.renderer;
    const frame = () => new Promise(requestAnimationFrame);
    const atReady = { programs: R.info.programs.length, textures: R.info.memory.textures, geometries: R.info.memory.geometries };
    const log = [];
    const render = g.renderer.render.bind(g.renderer);
    g.renderer.render = (t) => {
      const p0 = R.info.programs.length, x0 = R.info.memory.textures;
      const t0 = performance.now();
      const out = render(t);
      const ms = performance.now() - t0;
      log.push({ t: performance.now(), ms, s: g.state, newP: R.info.programs.length - p0, newT: R.info.memory.textures - x0 });
      return out;
    };
    const names = () => R.info.programs.map((q) => q.name + ':' + (q.cacheKey || '').slice(0, 60));
    const before = new Set(names());
    g.mode = 'tdm';
    g.hud.show(g.hud.title, false);
    I.locked = true;
    const t0 = performance.now();
    // 44.0: DEPLOY's own path (the match dealt and warmed up behind the loading screen); OLD=1 the 43.0 start.
    if (${!!process.env.OLD} || !g.deploy) g.startIntro(); else await g.deploy();
    const startMs = performance.now() - t0;
    while (g.intro && g.intro.t < 0.5) await frame();
    g.skipIntro();
    while (g.state === 'intro') await frame();
    const playT = performance.now();
    const introNew = names().filter((n) => !before.has(n));
    const playSet = new Set(names());
    const atPlay = { introNew, programs: R.info.programs.length, textures: R.info.memory.textures };
    // Shoot now and then, so the first shot's effects are in it.
    let k = 0;
    while (performance.now() - playT < ${SECS * 1000}) {
      if (k++ % 30 === 0) { I.mouseDown = true; await frame(); I.mouseDown = false; }
      await frame();
    }
    const lateNew = names().filter((n) => !playSet.has(n));
    const play = log.filter((f) => f.t >= playT);
    // Frame to frame (what the eye sees as a hitch, the GPU's stalls included).
    const gaps = [];
    for (let i = 1; i < play.length; i++) gaps.push({ at: +((play[i].t - playT) / 1000).toFixed(1), ms: +(play[i].t - play[i - 1].t).toFixed(0) });
    const bySec = {};
    for (const q of gaps) { const s = Math.floor(q.at / 5) * 5; (bySec[s] ??= []).push(q.ms); }
    const p95 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
    const windows = Object.fromEntries(Object.entries(bySec).map(([s, a]) => [s + 's', { fps: +(1000 / (a.reduce((x, y) => x + y, 0) / a.length)).toFixed(0), p95: p95(a), worst: Math.max(...a), over50: a.filter((x) => x > 50).length }]));
    const comp = play.filter((f) => f.newP > 0 || f.newT > 0).map((f) => ({ at: +((f.t - playT) / 1000).toFixed(1), ms: +f.ms.toFixed(0), newP: f.newP, newT: f.newT }));
    const ms = play.map((f) => f.ms).sort((a, b) => a - b);
    return { warm: g.lastWarmup, startMs: +startMs.toFixed(0), atReady, atPlay, lateNew, end: { programs: R.info.programs.length, textures: R.info.memory.textures }, frames: play.length, medianMs: +ms[ms.length >> 1].toFixed(1), p99: +ms[Math.floor(ms.length * 0.99)].toFixed(1), worst: +ms[ms.length - 1].toFixed(0), windows, introGaps: (() => { const f = log.filter((q) => q.t < playT); const out = []; for (let i = 1; i < f.length; i++) { const d = f[i].t - f[i - 1].t; if (d > 50) out.push(+d.toFixed(0)); } return out; })(), compiles: comp.slice(0, 40) };
  `));
  console.log(map, JSON.stringify(r));
}
done(0);
