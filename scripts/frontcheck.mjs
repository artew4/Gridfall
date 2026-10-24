/*
  44.0, the fronts (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/frontcheck.mjs [maps=desert,oldport] [matches=2] [out.jsonl] [opts JSON]

  Headless Chrome plays whole bot-only Team Deathmatch matches (__dev.tdmSim) on each map and prints
  what the fronts are for: the lanes lit (how many of the three have a fight going, all three), the
  brawls (fighters per fight site, sites of 4+), fight sites at once, kills a minute and by lane, quiet
  time, time from a spawn to its first round, the fronts (lines, crossings, breaks, bleeds, rallies,
  rotations), stuck bots. `opts`: tdmSim's options, e.g. '{"fronts":false}' (43.0's patrols).
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { appendFileSync } from 'node:fs';

const MAPS = (process.argv[2] ?? 'desert,oldport').split(',');
const N = Number(process.argv[3] ?? 2);
const OUT = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
const OPTS = process.argv[5] ?? '{}';
const URL = process.env.URL ?? 'http://localhost:5173/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9671) });

const avg = (rs, f) => +(rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(2);
for (const map of MAPS) {
  await open(`${URL}?setting=${map}`);
  await sleep(1000);
  const rs = [];
  for (let i = 0; i < N; i++) {
    const r = JSON.parse(await ev(page(`
      const r = await __dev.tdmSim(${OPTS});
      const kl = r.killsByLane ?? {};
      return JSON.stringify({ kpm: r.killsPerMin, secs: r.simSeconds, winner: r.ended, lit: r.lanesLit, brawls: r.brawls, sites: r.fightSites, quiet: r.quietLivePct, first: r.firstEngagement, killsByLane: kl, fronts: r.fronts, stuck: r.stuck.length, stuckWhy: r.stuck.slice(0, 4), clump: r.clumps?.avgClump, swarm: r.swarm?.avg, ai: r.ai_ms });
    `)));
    r.map = map;
    rs.push(r);
    if (OUT) appendFileSync(OUT, JSON.stringify({ ...r, opts: OPTS }) + '\n');
    console.log(map, i + 1, `kpm ${r.kpm} lit ${r.lit.avg} (all3 ${r.lit.all3Pct}% none ${r.lit.nonePct}%) brawl ${r.brawls.fightersPerSite}/site 4+ ${r.brawls.sites4PlusPct}% t ${r.brawls.timeWithBrawlPct}% sites ${r.sites.avg} quiet ${r.quiet}% first ${r.first.median}s/${r.first.p90}s lanes ${JSON.stringify(r.killsByLane)} fronts ${JSON.stringify(r.fronts)} stuck ${r.stuck} ${r.secs}s ${r.winner}`);
  }
  console.log(`== ${map} x${N}`, JSON.stringify({ kpm: avg(rs, (r) => r.kpm), lit: avg(rs, (r) => r.lit.avg), all3: avg(rs, (r) => r.lit.all3Pct), none: avg(rs, (r) => r.lit.nonePct), perSite: avg(rs, (r) => r.brawls.fightersPerSite), s4: avg(rs, (r) => r.brawls.sites4PlusPct), brawlT: avg(rs, (r) => r.brawls.timeWithBrawlPct), sites: avg(rs, (r) => r.sites.avg), quiet: avg(rs, (r) => r.quiet), first: avg(rs, (r) => r.first.median), firstP90: avg(rs, (r) => r.first.p90), secs: avg(rs, (r) => r.secs), stuck: rs.reduce((a, r) => a + r.stuck, 0) }));
}
done(0);
