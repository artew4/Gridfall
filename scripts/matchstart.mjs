/*
  36.0, the match start (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/matchstart.mjs [reps=2] [maps=maglev,neonblock,docks,desert,oldport,crashsite]

  Headless Chrome deploys into Team Deathmatch the way DEPLOY does (the intro, skipped as a click
  would), and every frame drawn is recorded (the camera, the state, the match phase):
    camera     the largest camera move between two drawn frames over the hand-off from the intro to
               play (the last 8 intro frames, the first 8 of play), the first play frame's distance
               from his eyes, and how far the 35.0 landing (the map's start) was from the spawn dealt;
    freeze     through the countdown W, Shift and Space held, the trigger pulled every frame, and
               the picker's keys pressed (4, then 2): how far he moved, rounds he fired, how far any
               bot moved or turned, rounds the bots fired, and the gun he holds after each key;
    live       after START!: W held for 1 s (he must move), 4 s more (the bots must move and fire);
    rematch    RESTART (no intro): the first frame drawn is on his eyes.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const REPS = Number(process.argv[2] ?? 2);
const MAPS = (process.argv[3] ?? 'maglev,neonblock,docks,desert,oldport,crashsite').split(',');
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { send, ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9561) });

const rows = [];
let fail = 0;
for (const map of MAPS) {
  await open(`${URL}?setting=${map}`);
  await sleep(1000);
  for (let rep = 0; rep < REPS; rep++) {
    const r = await ev(page(`
      const g = __game, P = g.player, I = g.input, T = g.tdm;
      if (!g.level.info.modes.includes('tdm')) return { skip: true };
      const frame = () => new Promise(requestAnimationFrame);
      // Every frame drawn: the camera as it was drawn.
      const log = [];
      const render = g.renderer.render.bind(g.renderer);
      g.renderer.render = (t) => {
        const c = g.camera.position;
        log.push({ s: g.state, ph: T.phase, x: c.x, y: c.y, z: c.z, ex: P.pos.x, ey: P.eyeY, ez: P.pos.z });
        return render(t);
      };
      // DEPLOY: the intro, skipped as soon as it allows (a click).
      g.mode = 'tdm';
      g.hud.show(g.hud.title, false);
      I.locked = true;
      g.startIntro();
      const st = g.level.data.tdm.start;
      const was = Math.hypot(P.pos.x - st.x, P.pos.z - st.z, P.pos.y - st.y);
      while (g.intro && g.intro.t < 0.5) await frame();
      g.skipIntro();
      while (g.state === 'intro') await frame();
      const hand = log.findIndex((f) => f.s === 'play');
      let jump = 0;
      for (let i = Math.max(1, hand - 8); i < Math.min(log.length, hand + 8); i++) jump = Math.max(jump, Math.hypot(log[i].x - log[i - 1].x, log[i].y - log[i - 1].y, log[i].z - log[i - 1].z));
      await frame();
      const f0 = log[hand];
      const firstOff = f0 ? Math.hypot(f0.x - f0.ex, f0.y - (f0.ey), f0.z - f0.ez) : null;
      // The countdown: everything pressed, nothing may move or fire.
      const phase0 = T.phase;
      const p0 = P.pos.clone();
      const bots0 = T.bots.map((b) => ({ b, x: b.pos.x, z: b.pos.z, yaw: b.yaw }));
      let botShots = 0, myShots0 = g.stats.shots;
      const onFire = g.projectiles.onFire;
      g.projectiles.onFire = (from, by) => { if (by && by !== g.playerUnit) botShots++; onFire(from, by); };
      I.keys.add('KeyW'); I.keys.add('ShiftLeft');
      const picks = [];
      let n = 0, steps = new Set();
      // Measured after every frame that ended still in the countdown (the frame START! comes in lets go).
      let moved = 0, myShots = 0, botMoved = 0, botTurned = 0, preBotShots = 0;
      while (T.phase === 'PRE_MATCH') {
        I.mouseDown = true;
        I.pressed.add('Space');
        if (n === 10) I.pressed.add('Digit4');
        if (n === 12) picks.push(g.loadout.current);
        if (n === 20) I.pressed.add('Digit2');
        if (n === 22) picks.push(g.loadout.current);
        steps.add(g.countdown.step);
        await frame();
        n++;
        if (T.phase !== 'PRE_MATCH') break;
        moved = Math.max(moved, Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z, P.pos.y - p0.y));
        myShots = g.stats.shots - myShots0;
        preBotShots = botShots;
        for (const o of bots0) {
          botMoved = Math.max(botMoved, Math.hypot(o.b.pos.x - o.x, o.b.pos.z - o.z));
          botTurned = Math.max(botTurned, Math.abs(o.b.yaw - o.yaw));
        }
      }
      I.mouseDown = false;
      const preFrames = n;
      // Live: he walks, the bots go.
      const t1 = g.elapsed;
      const p1 = P.pos.clone();
      steps.add(g.countdown.step);
      while (g.elapsed - t1 < 1) { steps.add(g.countdown.step); await frame(); }
      const walked = Math.hypot(P.pos.x - p1.x, P.pos.z - p1.z);
      I.keys.clear();
      while (g.elapsed - t1 < 5) await frame();
      let liveBotMoved = 0;
      for (const o of bots0) if (o.b.alive) liveBotMoved = Math.max(liveBotMoved, Math.hypot(o.b.pos.x - o.x, o.b.pos.z - o.z));
      g.projectiles.onFire = onFire;
      // RESTART (no intro): the first frame drawn.
      const n0 = log.length;
      g.restart(false);
      I.locked = true;
      if (g.state === 'paused') g.resume();
      await frame(); await frame();
      const rf = log[n0];
      const rematchOff = rf ? Math.hypot(rf.x - rf.ex, rf.y - rf.ey, rf.z - rf.ez) : null;
      const rematchPhase = T.phase;
      g.renderer.render = render;
      await g.toTitle?.();
      return {
        fps: Math.round(preFrames / 3),
        jump: +jump.toFixed(3), firstOff: +(firstOff ?? -1).toFixed(3), was35: +was.toFixed(1), spawnY: +P.pos.y.toFixed(2),
        phase0, preFrames, moved: +moved.toFixed(3), myShots, botMoved: +botMoved.toFixed(3), botTurned: +botTurned.toFixed(3), preBotShots,
        picks: picks.join('>'), steps: [...steps].filter((s) => s !== undefined).join(','),
        walked: +walked.toFixed(2), liveBotMoved: +liveBotMoved.toFixed(1), liveBotShots: botShots - preBotShots,
        rematchOff: +(rematchOff ?? -1).toFixed(3), rematchPhase,
      };
    `));
    if (r.skip) break;
    const ok =
      r.jump < 0.5 && r.firstOff < 0.05 && r.phase0 === 'PRE_MATCH' && r.moved < 0.01 && r.myShots === 0 && r.botMoved < 0.01 && r.botTurned < 1e-6 && r.preBotShots === 0 &&
      r.picks === 'shotgun>smg' && r.walked > 1 && r.liveBotMoved > 1 && r.rematchOff < 0.05 && r.rematchPhase === 'PRE_MATCH';
    if (!ok) fail++;
    rows.push({ map, rep, ok, ...r });
    await sleep(300);
  }
}
console.table(rows);

// The countdown's cost to the page (the first map): layouts and style recalcs a second, and the time in
// them, over the countdown against as long of live play straight after (Chrome's own counters).
await open(`${URL}?setting=${MAPS[0]}`);
await sleep(1000);
await send('Performance.enable');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
const window_ = async (secs) => {
  const a = await metrics();
  await sleep(secs * 1000);
  const b = await metrics();
  const d = (k) => b[k] - a[k];
  return { layouts: +(d('LayoutCount') / secs).toFixed(1), layoutMs: +((d('LayoutDuration') * 1000) / secs).toFixed(2), styles: +(d('RecalcStyleCount') / secs).toFixed(1), styleMs: +((d('RecalcStyleDuration') * 1000) / secs).toFixed(2), scriptMs: +((d('ScriptDuration') * 1000) / secs).toFixed(1) };
};
// Warmed up first (the first frames after a start compile shaders), the countdown then stretched to
// cover the whole window.
await ev(page(`__dev.start('tdm', '${MAPS[0]}', { preMatch: true }); __dev.god(); const t = __game.elapsed; while (__game.elapsed - t < 1) await sl(50); __game.tdm.liveAt = __game.elapsed + 3.5;`));
const pre = await window_(2.5);
await ev(page(`while (__game.tdm.phase !== 'LIVE') await sl(50); await sl(1500);`));
const live = await window_(2.5);
console.log('a second (layouts, ms in layout, style recalcs, ms in style, ms in script):');
console.table({ countdown: pre, live });
console.log(fail ? `FAILED ${fail} of ${rows.length}` : `all ${rows.length} passed`);
done(fail ? 1 : 0);
