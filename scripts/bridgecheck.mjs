/*
  37.1, Old Port's high ground (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/bridgecheck.mjs

  Headless Chrome, Old Port, one ALPHA bot moving and one OMEGA bot held (unkillable); nobody else, no respawns:
    watch   the bot posted to the bridge (ArenaDirector.watch) from the quays, the dock floor and the
            dock head: does it get there (s), does it hold it (on the roof 5 s later), and released with
            nothing to fight, does it come back down off the roof on patrol (s);
    hunt    an OMEGA bot on the bridge or the deck, reported on ALPHA's board every 0.2 s (out of the
            hunter's sight or not), the hunter at the north dock head: does it get up onto the ship (s),
            the share of the run it spent fighting the target in sight from below, and its longest
            stretch within 1.5 m not fighting (a stall).
  Fails if a watch doesn't get there, hold it and come down, if a hunt neither gets up nor fights for
  most of the run, or if a stall reaches 8 s.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9562) });
await open(`${URL}?setting=oldport`);
await sleep(1000);

const setup = `
  window.__errs = []; window.onerror = (m, s, l, c, e) => { window.__errs.push(String(e?.stack ?? m).slice(0, 300)); };
  __dev.start('tdm', 'oldport'); __dev.god(); __game.tdm.spectate = true;
  const g = __game, T = g.tdm;
  g.player.pos.set(300, 0, 300);
  const A = T.bots.find((b) => b.team === 'alpha' && b.alive);
  const E = T.bots.find((b) => b.team === 'omega' && b.alive);
  // Nobody else in the match: the rest removed (their slots emptied, no respawns), the hunt's target
  // held and unkillable. (Held where they spawned, the others were in sight, shot, and back as fresh bots.)
  for (const s of T.slots) {
    if (s.bot && s.bot !== A && s.bot !== E) { s.bot.dispose(g.scene); s.bot = null; }
    s.respawnAt = Infinity;
  }
  T.bots.length = 0;
  T.bots.push(A, E);
  E.held = true;
  E.invulnUntil = Infinity;
  const dir = T.directors.alpha;
  // A stall: within 1.5 m, not fighting (strafing at a target in sight is a fight, not a stall).
  let ref = A.pos.clone(), refT = g.elapsed, maxStill = 0, fightT = 0, lastT = g.elapsed;
  const still = () => {
    const fighting = A.brain.state === 'engage' && A.brain.target && A.brain.visible?.(A.brain.target);
    if (fighting) fightT += g.elapsed - lastT;
    lastT = g.elapsed;
    if (fighting || A.pos.distanceTo(ref) > 1.5) { ref.copy(A.pos); refT = g.elapsed; }
    maxStill = Math.max(maxStill, g.elapsed - refT);
  };
`;
const rows = [];
let fail = 0;

// Posted to the bridge: up, held, down.
for (const [x, y, z] of (process.env.ONLY_WATCH ? [[21, 0, 20], [21, 0, -20], [40, 0, 0]] : [[21, 0, 20], [21, 0, -20], [40, 0, 0], [26, -4.5, 0], [30, -4.5, 30], [30, -4.5, -30]])) {
  const r = await ev(page(`${setup}
    for (const t of ['alpha', 'omega']) T.directors[t].setWatch(null);
    E.pos.set(400, 0, 400);
    A.pos.set(${x}, ${y}, ${z});
    const P = g.level.data.tdm.highGround.points[0];
    dir.setWatch(g.level.data.tdm.highGround);
    dir.watch = { uid: A.uid, post: 0, until: g.elapsed + 60, arrived: false };
    const t0 = g.elapsed;
    let up = null, held = null, down = null;
    const trail = [];
    while (g.elapsed - t0 < 40 && up === null) { await sl(200); still(); if (dir.watch?.arrived) up = +(g.elapsed - t0).toFixed(1); trail.push(A.brain.state + '@' + [A.pos.x, A.pos.y, A.pos.z].map((v) => v.toFixed(1)).join(',') + (dir.watchPost(A.uid) ? '' : ' unposted')); }
    if (up !== null) {
      const t1 = g.elapsed;
      while (g.elapsed - t1 < 5) await sl(200);
      held = A.pos.y > P.y - 0.5;
      dir.watch.until = g.elapsed;
      // Released, nothing on the board (one in sight would be fought from up there): off on patrol.
      const t2 = g.elapsed;
      while (g.elapsed - t2 < 25 && down === null) { await sl(200); if (A.pos.y < P.y - 1) down = +(g.elapsed - t2).toFixed(1); }
    }
    return { kind: 'watch', from: [${x}, ${y}, ${z}], up, held, down, maxStill: +maxStill.toFixed(1), errs: window.__errs.length, trail: up === null ? trail.filter((_, i) => i % 20 === 0).join(' | ') : '' };
  `), 180000);
  const ok = r.up !== null && r.held && r.down !== null && r.errs === 0;
  if (!ok) fail++;
  rows.push({ ok, ...r, from: r.from.join(',') });
}

// Hunting someone up on the ship from the north dock head.
for (const [tx, ty, tz] of (process.env.ONLY_WATCH ? [] : [[30, 3.6, 0], [31.6, 1, -4], [30, 3.6, 1.5]]))
  for (const [sx, sz] of [[30, -27], [28.5, -27.5], [31.5, -27.5], [30, -29.5], [27, -24], [33, -24]]) {
    const r = await ev(page(`${setup}
      for (const t of ['alpha', 'omega']) T.directors[t].setWatch(null);
      A.pos.set(${sx}, -4.5, ${sz});
      E.pos.set(${tx}, ${ty}, ${tz});
      const t0 = g.elapsed;
      let up = null;
      while (g.elapsed - t0 < 25 && up === null) { dir.sighting(E, g.elapsed); await sl(200); still(); if (A.pos.y > 0.5) up = +(g.elapsed - t0).toFixed(1); }
      return { kind: 'hunt', from: [${sx}, -4.5, ${sz}], target: [${tx}, ${ty}, ${tz}], up, fought: +(fightT / (g.elapsed - t0)).toFixed(2), maxStill: +maxStill.toFixed(1), errs: window.__errs.length };
    `), 180000);
    // Up onto the ship, or fighting it from below most of the run (the target is held and unkillable).
    const ok = (r.up !== null || r.fought > 0.5) && r.maxStill < 8 && r.errs === 0;
    if (!ok) fail++;
    rows.push({ ok, ...r, from: r.from.join(','), target: r.target.join(',') });
  }

console.table(rows);
const ups = rows.filter((r) => r.kind === 'hunt' && r.up !== null).map((r) => r.up).sort((a, b) => a - b);
if (ups.length) console.log(`hunts up: ${ups.length} of ${rows.filter((r) => r.kind === 'hunt').length}, median ${ups[Math.floor((ups.length - 1) / 2)]} s, p90 ${ups[Math.floor(0.9 * (ups.length - 1))]} s`);
console.log(fail ? `FAILED ${fail} of ${rows.length}` : `all ${rows.length} passed`);
done(fail ? 1 : 0);
