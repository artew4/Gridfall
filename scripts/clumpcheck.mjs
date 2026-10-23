/*
  41.0, how bunched the bots play (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/clumpcheck.mjs [maps=desert,oldport] [matches=4] [out.jsonl] [tune JSON]

  Headless Chrome plays whole Team Deathmatch matches bot against bot (__dev.tdmSim, no player) on each
  map and prints, per match and averaged: kills a minute, the clumps (the size of the group a bot stands
  in, linked within 10 m: "how many stand with me"; the team's largest group; the histogram), the fight
  sites going on at once (fights grouped within 20 m), the kills' spread (kills with another 30 m off
  within 10 s; the 16 m cells holding 80% of them), quiet time, stuck bots. `tune`: an ArenaProfile
  over the map's (A/B), e.g. '{"sectors":{"on":false}}', or tdmSim's options whole
  ('{"tune":{...},"spawnTune":{"zoneTeam":0.5}}').
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { appendFileSync } from 'node:fs';

const MAPS = (process.argv[2] ?? 'desert,oldport').split(',');
const N = Number(process.argv[3] ?? 4);
const OUT = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
const TUNE = process.argv[5] ?? 'null';
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9571) });

const avg = (rs, f) => +(rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(2);
for (const map of MAPS) {
  await open(`${URL}?setting=${map}`);
  await sleep(1500);
  const rs = [];
  for (let i = 0; i < N; i++) {
    const r = JSON.parse(await ev(page(`
      const t = ${TUNE};
      const r = await __dev.tdmSim(t ? (t.spawnTune || t.tune ? t : { tune: t }) : {});
      return JSON.stringify({ kpm: r.killsPerMin, simSeconds: r.simSeconds, winner: r.ended, clumps: r.clumps, fightSites: r.fightSites, killSpread: r.killSpread, quietLivePct: r.quietLivePct, stuck: r.stuck.length, spread: { groupedPct: r.spread.groupedPct, nearestMateMedian: r.spread.nearestMateMedian, laneCoverPct: r.spread.laneCoverPct }, laneTimePct: r.laneTimePct, killsByLane: r.killsByLane, swarm: r.swarm, spawnLocal: r.spawnLocal, fireteams: r.fireteams, ai_ms: r.ai_ms });
    `)));
    r.map = map;
    rs.push(r);
    if (OUT) appendFileSync(OUT, JSON.stringify(r) + '\n');
    console.log(map, i + 1, `kpm ${r.kpm} clump ${r.clumps.avgClump} herd ${r.clumps.herdPct}% largest ${r.clumps.avgLargest} sites ${r.fightSites.avg} (2+ ${r.fightSites.twoPlusPct}%) apart ${r.killSpread.withFightElsewherePct}% cells80 ${r.killSpread.cellsFor80Pct}/${r.killSpread.cells} swarm ${r.swarm.avg} (4+ ${r.swarm.fourPlusPct}%) ft ${r.fireteams?.avgSize} quiet ${r.quietLivePct}% stuck ${r.stuck} ${r.simSeconds}s`);
  }
  console.log(`== ${map} x${N}`, JSON.stringify({
    kpm: avg(rs, (r) => r.kpm),
    avgClump: avg(rs, (r) => r.clumps.avgClump),
    avgLargest: avg(rs, (r) => r.clumps.avgLargest),
    hist: Object.fromEntries(Object.keys(rs[0].clumps.histPct).map((k) => [k, avg(rs, (r) => r.clumps.histPct[k])])),
    sites: avg(rs, (r) => r.fightSites.avg),
    sites2: avg(rs, (r) => r.fightSites.twoPlusPct),
    sites3: avg(rs, (r) => r.fightSites.threePlusPct),
    apart: avg(rs, (r) => r.killSpread.withFightElsewherePct),
    cells80: avg(rs, (r) => r.killSpread.cellsFor80Pct),
    swarm: avg(rs, (r) => r.swarm.avg),
    swarm4: avg(rs, (r) => r.swarm.fourPlusPct),
    swarmMax: Math.max(...rs.map((r) => r.swarm.max)),
    spawnLocal: Object.fromEntries(Object.keys(rs[0].spawnLocal.pct).map((k) => [k, avg(rs, (r) => r.spawnLocal.pct[k])])),
    herd: avg(rs, (r) => r.clumps.herdPct),
    bigBy: rs.reduce((a, r) => { for (const [k, n] of Object.entries(r.clumps.bigBy ?? {})) a[k] = (a[k] ?? 0) + n; return a; }, {}),
    ftSize: avg(rs, (r) => r.fireteams?.avgSize ?? 0),
    peels: avg(rs, (r) => r.fireteams?.peels ?? 0),
    quietLive: avg(rs, (r) => r.quietLivePct),
    grouped: avg(rs, (r) => r.spread.groupedPct),
    stuck: rs.reduce((a, r) => a + r.stuck, 0),
    seconds: avg(rs, (r) => r.simSeconds),
    aiMs: avg(rs, (r) => r.ai_ms.avg),
  }));
}
done(0);
