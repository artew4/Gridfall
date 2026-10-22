/*
  35.0, how fast an engaged bot turns on a flanker (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/flankcheck.mjs [reps=4] [out.json]

  Headless Chrome plays Team Deathmatch on Maglev Terminal. An OMEGA bot (A) is put by OMEGA's spawn
  zones fighting an ALPHA bot (B) 14 m ahead, which "keeps hitting it" (its alert is refreshed every
  frame; B is frozen and A's health kept up). Then the player appears beside or behind A, at 5, 9 and
  14 m, 90°, 135° and 180° off A's line to B (the side with a clear line of sight from A's spot), and:
    silent        stands there;
    hit           fires every 0.25 s and the round lands (the game's own paths: projectiles.onFire,
                  then targets.hit, only while the player has a line of sight to A);
    miss          fires every 0.25 s and misses (onFire only: the shot heard);
    protectedHit  as hit, with A spawn-protected (no damage).
  A is kept within a metre of its spot (it strafes), so the flanker stays where it was put. Measured
  from the first shot (silent: from the placement), in game time and frames: when A's target becomes
  the player, and when A faces within 25° of the player; 4 s at most. Runs where the player had no
  line of sight to A for most of the run are left out of the table (the spot's cover moved between).
  The headless page runs at about 20 FPS: 50 ms is one frame.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { writeFileSync } from 'node:fs';

const REPS = Number(process.argv[2] ?? 4);
const OUT = process.argv[3] ?? null;
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9560) });
await open(`${URL}?setting=maglev`);
await sleep(1500);

// A spot near OMEGA's zones where B (14 m ahead, +z) and a flanker at every distance and angle (one side
// or the other) stand on the floor in clear sight of it.
const spot = await ev(page(`__dev.start('tdm', 'maglev'); __dev.god(); __game.resume?.(); await sl(3500);
  const g = __game, V = g.player.pos.constructor, col = g.col;
  const ok = (x, z) => !col.blocked(new V(x, 1, z), 0.5) && Math.abs(col.groundHeightAt(x, z, 0.3, 0.5, 5)) < 0.05;
  const los = (ax, az, bx, bz) => col.lineOfSight(new V(ax, 1.55, az), new V(bx, 1.3, bz)) && col.lineOfSight(new V(ax, 1.0, az), new V(bx, 1.0, bz));
  const zones = [[-24, -38], [28, -38]];
  const near = ([x, z]) => Math.min(...zones.map(([zx, zz]) => Math.hypot(x - zx, z - zz)));
  const cands = [];
  for (let x = -28; x <= 28; x += 1) for (let z = -48; z <= -18; z += 1) cands.push([x, z]);
  cands.sort((p, q) => near(p) - near(q));
  for (const [x, z] of cands) {
    if (!ok(x, z) || !ok(x, z + 14) || !los(x, z, x, z + 14)) continue;
    const side = {};
    let good = true;
    for (const d of [5, 9, 14]) for (const ang of [90, 135, 180]) {
      const fits = (sg) => { const a = (sg * ang * Math.PI) / 180, px = x - Math.sin(a) * d, pz = z + Math.cos(a) * d; return ok(px, pz) && los(x, z, px, pz); };
      if (fits(1)) side[d + '_' + ang] = 1;
      else if (fits(-1)) side[d + '_' + ang] = -1;
      else good = false;
    }
    if (good) return [x, z, side];
  }
  return null;`), 120000);
if (!spot) {
  console.error('no spot with clear sightlines');
  done(1);
}
console.log('spot', JSON.stringify(spot.slice(0, 2)));

const rows = [];
for (const kind of ['silent', 'hit', 'miss', 'protectedHit'])
  for (const d of [5, 9, 14])
    for (const ang of [90, 135, 180])
      for (let rep = 0; rep < REPS; rep++) {
        const r = await ev(page(`
    const g = __game, T = g.tdm, P = g.player, V = P.pos.constructor, pu = g.playerUnit;
    const now = () => T.now;
    const frame = () => new Promise(requestAnimationFrame);
    const A = T.bots.find((b) => b.team === 'omega' && b.alive), B = T.bots.find((b) => b.team === 'alpha' && b.alive);
    if (!A || !B) return { err: 'no bots' };
    for (const o of T.bots) if (o !== A && o !== B) { if (!o.__upd) { o.__upd = o.update; o.update = () => {}; } o.pos.set(400 + o.uid, 0, 400); }
    if (!B.__upd) { B.__upd = B.update; B.update = () => {}; }
    const sx = ${spot[0]}, sz = ${spot[1]};
    A.pos.set(sx, 0, sz); A.vel.set(0, 0, 0); A.yaw = 0; A.brain.target = null; A.brain.alert.clear(); A.invulnUntil = 0;
    B.pos.set(sx, 0, sz + 14); B.yaw = Math.PI;
    P.pos.set(300, 0, 300);
    const keep = () => {
      A.brain.alert.set(B.uid, now()); B.hp = B.maxHp; if (A.hp < A.maxHp * 0.4) A.hp = A.maxHp;
      const ex = A.pos.x - sx, ez = A.pos.z - sz, el = Math.hypot(ex, ez);
      if (el > 1) { A.pos.x -= ex * (1 - 1 / el); A.pos.z -= ez * (1 - 1 / el); }
    };
    let t0 = now();
    while (now() - t0 < 4 && A.brain.target !== B) { keep(); await frame(); }
    if (A.brain.target !== B) return { err: 'never engaged B' };
    for (let i = 0; i < 30; i++) { keep(); await frame(); }
    const fx = B.pos.x - A.pos.x, fz = B.pos.z - A.pos.z, fl = Math.hypot(fx, fz), ux = fx / fl, uz = fz / fl;
    const a = (${spot[2][d + '_' + ang]} * ${ang} * Math.PI) / 180;
    __dev.tp(A.pos.x + (ux * Math.cos(a) - uz * Math.sin(a)) * ${d}, 0, A.pos.z + (uz * Math.cos(a) + ux * Math.sin(a)) * ${d});
    if ('${kind}' === 'protectedHit') A.invulnUntil = now() + 2.5;
    const start = now();
    let frames = 0, sw = null, face = null, first = null, lastShot = -9, losN = 0;
    const sight = () => g.col.lineOfSight(new V(P.pos.x, 1.55, P.pos.z), new V(A.pos.x, 1.3, A.pos.z));
    while (now() - start < 4 && (sw === null || face === null)) {
      keep();
      if ('${kind}' !== 'silent' && now() - lastShot > 0.25) {
        __dev.look(A.pos.x, A.pos.y + 1.25, A.pos.z);
        g.projectiles.onFire(new V(P.pos.x, P.pos.y + 1.5, P.pos.z), pu);
        if ('${kind}' !== 'miss' && sight()) g.projectiles.targets.hit(A, 10, new V(A.pos.x - P.pos.x, 0, A.pos.z - P.pos.z).normalize(), new V(A.pos.x, A.pos.y + 1.2, A.pos.z), pu);
        lastShot = now();
        if (first === null) first = now();
      }
      await frame();
      frames++;
      if (sight()) losN++;
      const t = now() - (first ?? start);
      if (sw === null && A.brain.target === pu) sw = { ms: Math.round(t * 1000), frames };
      let dy = Math.atan2(P.pos.x - A.pos.x, P.pos.z - A.pos.z) - A.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (face === null && Math.abs(dy) < (25 * Math.PI) / 180) face = { ms: Math.round(t * 1000), frames };
    }
    P.pos.set(300, 0, 300);
    return { switchTo: sw, faced: face, losFrac: +(losN / Math.max(1, frames)).toFixed(2), fps: Math.round(frames / Math.max(0.01, now() - start)) };
  `), 120000);
        rows.push({ kind, d, ang, rep, ...r });
        await sleep(200);
      }
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);
const p90 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(0.9 * (a.length - 1))] : null);
const inSight = rows.filter((r) => !r.err && r.losFrac >= 0.6);
console.log(`left out (no line of sight most of the run, or no fight): ${rows.length - inSight.length} of ${rows.length}`);
const table = [];
const totals = {};
for (const kind of ['silent', 'hit', 'miss', 'protectedHit'])
  for (const d of [5, 9, 14])
    for (const ang of [90, 135, 180]) {
      const rs = inSight.filter((r) => r.kind === kind && r.d === d && r.ang === ang);
      const sw = rs.filter((r) => r.switchTo).map((r) => r.switchTo.ms);
      table.push({ kind, d, ang, switched: `${sw.length}/${rs.length}`, medianMs: med(sw), medianFrames: med(rs.filter((r) => r.switchTo).map((r) => r.switchTo.frames)) });
      const t = (totals[kind] ??= { switched: 0, runs: 0, ms: [] });
      t.switched += sw.length;
      t.runs += rs.length;
      t.ms.push(...sw);
    }
console.table(table);
console.table(Object.entries(totals).map(([kind, t]) => ({ kind, switched: `${t.switched}/${t.runs}`, medianMs: med(t.ms), p90Ms: p90(t.ms) })));
done(0);
