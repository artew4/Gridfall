/*
  43.0, the ledge grab in the live game (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/mantlecheck.mjs [map=favelas] [ledges=12] [shots-dir]

  Headless Chrome plays Team Deathmatch on the map with the bots held far off and god mode (a map without
  it, its first mode: Tokyo the story, the Jungle arcade). From the
  survey's ledges (__dev.ledges: a cell, a direction, the spot on top), spread over the map, it puts the
  player on the cell facing the ledge and plays it through the real input: W held (keydown events), a
  jump 0.3 s later, W kept until 1.4 s. Per ledge: grabbed or not, where he ended (the spot's height),
  the pull-up's game time, the view's deepest dip, and whether the trigger stayed off during it. CPU:
  Player.update timed per frame, by kind (on the ground, in the air with the probe, in the pull-up), and
  the probe's rays cast on ground frames (must be 0). With a shots dir: PNGs before the jump, mid
  pull-up (the game time frozen) and on top, for the first ledge. `MANTLE=off`: the same jumps without the
  grab (an A/B of the airborne frames' cost).
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAP = process.argv[2] ?? 'favelas';
const N = Number(process.argv[3] ?? 12);
const SHOTS = process.argv[4] ?? null;
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, send, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9621) });
await open(`${URL}?setting=${MAP}`);
await sleep(1000);
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${MAP}-${name}.png`), Buffer.from(r.result.data, 'base64'));
};

const picks = JSON.parse(await ev(page(`
  const modes = __game.level.info.modes;
  __dev.start(modes.includes('tdm') ? 'tdm' : modes[0], '${MAP}'); __dev.god(); await sl(1500);
  for (const o of __game.tdm?.bots ?? []) { o.update = () => {}; o.pos.set(500 + o.uid * 3, -50, 500); }
  const L = await __dev.ledges({ samples: ${N} });
  // MANTLE=off: the same jumps without the grab (the probe's share of an airborne frame's cost).
  await __dev.mantle(${process.env.MANTLE !== 'off'});
  return JSON.stringify(L.samples);
`)));
console.log(`${MAP}: ${picks.length} ledges picked`);

// The player's update, timed by the kind of frame (installed once).
await ev(page(`
  const P = __game.player;
  const st = (window.__mc = { ground: [0, 0], air: [0, 0], pull: [0, 0], groundRays: 0 });
  const up = P.update.bind(P);
  P.update = function (...a) {
    const pull = P.mantling, ground = P.onGround;
    const r0 = __mstats.rays;
    const t = performance.now();
    up(...a);
    const us = (performance.now() - t) * 1000;
    const k = pull ? 'pull' : ground && P.onGround ? 'ground' : 'air';
    st[k][0] += us; st[k][1]++;
    if (k === 'ground') st.groundRays += __mstats.rays - r0;
  };
  window.__mstats = await __dev.mantleStatsRef();
`));

// One ledge played through the real input (see the header); `freeze`: stop the game clock 40% into the pull-up.
const play = (s, freeze) => ev(page(`
  const g = __game, P = g.player, [x, h, z] = ${JSON.stringify(s.from)};
  const frame = () => new Promise(requestAnimationFrame);
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  P.reset(x, z, ${s.yaw}, h); P.pitch = -0.15;
  for (let k = 0; k < 4; k++) await frame();
  const fire0 = g.weapon.tryFire;
  let firedInPull = 0;
  g.weapon.tryFire = function () { const f = fire0.call(this); if (f && P.mantling) firedInPull++; return f; };
  g.input.mouseDown = true;
  const t0 = g.elapsed;
  let grabbed = false, pullFrom = null, pullTo = null, dip = 0, jumped = false, endY = null;
  key('keydown', 'KeyW');
  while (g.elapsed - t0 < 1.4) {
    if (!jumped && g.elapsed - t0 >= 0.3) { key('keydown', 'Space'); await frame(); key('keyup', 'Space'); jumped = true; }
    await frame();
    // Where the pull-up put him (then W comes up: past a narrow top he would walk off it).
    if (grabbed && endY === null && !P.mantling) { endY = P.pos.y; key('keyup', 'KeyW'); }
    if (P.mantling) {
      grabbed = true;
      if (pullFrom === null) pullFrom = g.elapsed;
      pullTo = g.elapsed;
      dip = Math.max(dip, P.pitch - P.viewPitch(g.elapsed));
      if (${freeze} && P.mantleT > P.mantleDur * 0.4) { g.timeScale = 0; g.weapon.tryFire = fire0; return 'frozen'; }
    }
  }
  key('keyup', 'KeyW');
  g.input.mouseDown = false;
  g.weapon.tryFire = fire0;
  return { grabbed, y: +(endY ?? P.pos.y).toFixed(2), pullMs: pullFrom === null ? null : Math.round((pullTo - pullFrom + 1 / 60) * 1000), dip: +dip.toFixed(3), firedInPull };
`), 60000);

if (SHOTS && picks.length) {
  const s = picks[0];
  await ev(page(`const P = __game.player, [x, h, z] = ${JSON.stringify(s.from)}; P.reset(x, z, ${s.yaw}, h); P.pitch = -0.15; await sl(500);`));
  await shot('1-before');
  if ((await play(s, true)) === 'frozen') {
    await sleep(300);
    await shot('2-pull');
    await ev(page(`__game.timeScale = 1; __game.input.mouseDown = false; await sl(150); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await sl(800);`));
    await shot('3-top');
  }
  await ev(page(`for (const k of ['ground', 'air', 'pull']) window.__mc[k] = [0, 0]; window.__mc.groundRays = 0;`));
}

const rows = [];
for (const s of picks) {
  const r = await play(s, false);
  rows.push({ from: s.from.map((q) => +q.toFixed(1)).join(','), to: +s.to[1].toFixed(2), rise: +s.rise.toFixed(2), ...r, ok: r.grabbed && Math.abs(r.y - s.to[1]) < 0.05 });
}
const cpu = await ev(page(`
  const st = window.__mc, avg = (k) => +(st[k][0] / Math.max(1, st[k][1])).toFixed(1);
  return { groundUs: avg('ground'), airUs: avg('air'), pullUs: avg('pull'), frames: { ground: st.ground[1], air: st.air[1], pull: st.pull[1] }, groundRays: st.groundRays };
`));
console.table(rows);
const ok = rows.filter((r) => r.ok).length;
console.log(JSON.stringify({ map: MAP, ledges: rows.length, grabbedAndOnTop: ok, pullMs: rows.filter((r) => r.pullMs).map((r) => r.pullMs), dipMax: Math.max(...rows.map((r) => r.dip)), firedInPull: rows.reduce((a, r) => a + r.firedInPull, 0), cpu }));
done(0);
