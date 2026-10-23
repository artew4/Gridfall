/*
  43.0, the ledge grab over every map (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/ledgecheck.mjs [maps=all] [stressSamples=150]

  Per map, headless: __dev.ledges() (the real probe from the cells a plain jump reaches, 8 directions,
  feet at the apex: the ledges, the spots they land on, the new ground, what the extent refused, the
  probe's cost; the world check's reachability with the old jump and with the grab: escapes, traps,
  ground outside the zones), then __dev.stress() (the real controller sprint-jumping W-held from sampled
  cells at 20 and 60 FPS: walls crossed, the extent left, ending inside geometry) with the grabs it made.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';

const ALL = ['tokyo', 'jungle', 'desert', 'docks', 'oldport', 'maglev', 'crashsite', 'neonblock', 'favelas'];
const MAPS = !process.argv[2] || process.argv[2] === 'all' ? ALL : process.argv[2].split(',');
const SAMPLES = Number(process.argv[3] ?? 150);
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: Number(process.env.PORT ?? 9601) });

const rows = [];
for (const map of MAPS) {
  await open(`${URL}?setting=${map}`);
  await sleep(1000);
  const r = JSON.parse(await ev(page(`
    const L = await __dev.ledges();
    const g0 = (await __dev.mantleStats()).grabs;
    const S = await __dev.stress({ samples: ${SAMPLES} });
    return JSON.stringify({ L, S: { runs: S.runs, failures: S.failures, byWhy: S.byWhy, examples: S.examples.slice(0, 4) }, grabs: (await __dev.mantleStats()).grabs - g0 });
  `)));
  const bad = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => /escape|trap|outside designed|track pit/.test(k)));
  const row = {
    map,
    ledges: r.L.ledges,
    spots: r.L.spots,
    newGround: r.L.newGround.clusters,
    newNoZone: r.L.newGround.noZone,
    refused: r.L.refusedByExtent,
    probeUs: r.L.probeUs,
    reach: `${r.L.reach.before}→${r.L.reach.after}`,
    badBefore: JSON.stringify(bad(r.L.reach.countsBefore)),
    badAfter: JSON.stringify(bad(r.L.reach.countsAfter)),
    stress: `${r.S.failures}/${r.S.runs}`,
    stressGrabs: r.grabs,
  };
  rows.push(row);
  console.log(JSON.stringify({ ...row, rise: r.L.rise, newTop: r.L.newGround.top, stressWhy: r.S.byWhy, stressEx: r.S.examples }));
}
console.table(rows);
done(0);
