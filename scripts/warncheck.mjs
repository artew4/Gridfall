/*
  42.0, the wolf's warning shot (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/warncheck.mjs [reps=10] [map=maglev]

  Headless Chrome plays Team Deathmatch. Everyone is held far off but one OMEGA bot, put 10 m from the
  player (god mode, standing still) on open ground in his line of sight, as:
    wolf-behind        a wolf, the player facing away from it (the warning: a pause, the first round wide);
    wolf-facing        a wolf, the player looking at it (no warning);
    frontliner-behind  a frontliner, the player facing away (no warning: only wolves give one).
  From the moment the bot sees him to its first round (game ms), and the first round's miss: its line's
  closest pass to his chest (m; a hit passes within ~0.4). The headless page runs at ~20 FPS.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const REPS = Number(process.argv[2] ?? 10);
const MAP = process.argv[3] ?? 'maglev';
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9593) });
await open(`${URL}?setting=${MAP}`);
await sleep(1500);

// A spot with 10 m of open floor to the north of it, in clear sight both ways.
const spot = await ev(page(`__dev.start('tdm', '${MAP}'); __dev.god(); __game.resume?.(); await sl(3000);
  const g = __game, V = g.player.pos.constructor, col = g.col;
  const ok = (x, z) => !col.blocked(new V(x, 0.05, z), 0.6) && Math.abs(col.groundHeightAt(x, z, 0.3, 0.5, 5)) < 0.05;
  for (let r = 0; r < 40; r += 2) for (let a = 0; a < 12; a++) {
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    let good = ok(x, z) && ok(x, z - 10);
    for (let k = 1; good && k < 10; k++) good = ok(x, z - k);
    if (good && col.lineOfSight(new V(x, 1.6, z), new V(x, 1.3, z - 10))) return [x, z];
  }
  return null;`));
if (!spot) {
  console.error('no open spot');
  done(1);
}

const rows = [];
for (const kind of ['wolf-behind', 'wolf-facing', 'frontliner-behind'])
  for (let rep = 0; rep < REPS; rep++) {
    const r = await ev(page(`
      const g = __game, T = g.tdm, P = g.player, V = P.pos.constructor, pu = g.playerUnit;
      const frame = () => new Promise(requestAnimationFrame);
      const A = T.bots.find((b) => b.team === 'omega' && b.alive && b.kind === 'gunner');
      if (!A) return { err: 'no bot' };
      for (const o of T.bots) if (o !== A) { if (!o.__upd) { o.__upd = o.update; o.update = () => {}; } o.pos.set(400 + o.uid, 0, 400); }
      const [sx, sz] = ${JSON.stringify(spot)};
      P.pos.set(sx, 0, sz);
      // The bot 10 m north, facing him; its role for this run.
      A.pos.set(sx, 0, sz - 10); A.vel.set(0, 0, 0); A.yaw = 0; A.invulnUntil = 0; A.hp = A.maxHp;
      const role = '${kind}'.split('-')[0];
      A.brain.role = role;
      T.directors.omega.roles.set(A.uid, role);
      A.brain.target = null; A.brain.alert.clear(); A.brain.seen.clear();
      A.brain.warnFor = -1; A.brain.warnAt = -Infinity; A.brain.warnMiss = false;
      A.brain.recoverCd = Infinity;
      // He faces away (south) or toward it (north).
      const away = '${kind}'.endsWith('behind');
      __dev.look(sx, 1.6, away ? sz + 20 : sz - 20);
      const shots = [];
      const fire0 = g.projectiles.fire;
      g.projectiles.fire = function (from, dir, speed, by, opts) { if (by === A) shots.push({ t: T.now, from: from.clone(), dir: dir.clone() }); return fire0.call(this, from, dir, speed, by, opts); };
      const start = T.now;
      let seenAt = null;
      while (T.now - start < 4 && !shots.length) {
        P.pos.set(sx, 0, sz);
        A.pos.x = sx; A.pos.z = sz - 10;
        __dev.look(sx, 1.6, away ? sz + 20 : sz - 20);
        if (seenAt === null && A.brain.seen.get(pu.uid)?.vis) seenAt = T.now;
        await frame();
      }
      g.projectiles.fire = fire0;
      P.pos.set(300, 0, 300);
      if (!shots.length || seenAt === null) return { err: 'no shot', seen: seenAt !== null };
      const s = shots[0];
      // The first round's closest pass to his chest.
      const c = new V(sx, 1.2, sz), w = c.clone().sub(s.from), along = w.dot(s.dir);
      const pass = w.sub(s.dir.clone().multiplyScalar(along)).length();
      return { ms: Math.round((s.t - seenAt) * 1000), pass: +pass.toFixed(2), warnShots: T.arenaStats.warnShots };
    `), 60000);
    rows.push({ kind, rep, ...r });
    await sleep(150);
  }

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);
const table = ['wolf-behind', 'wolf-facing', 'frontliner-behind'].map((kind) => {
  const rs = rows.filter((r) => r.kind === kind && !r.err);
  return { kind, runs: `${rs.length}/${REPS}`, sightToFirstMs: med(rs.map((r) => r.ms)), firstWide: rs.filter((r) => r.pass > 0.8).length, firstPassMedianM: med(rs.map((r) => r.pass)) };
});
console.table(table);
const errs = rows.filter((r) => r.err);
if (errs.length) console.log('errors', JSON.stringify(errs));
done(0);
