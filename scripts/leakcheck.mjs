/*
  13.0, the definitive map-transition leak check (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/leakcheck.mjs [laps=2] [maps=desert,docks,neonblock]

  Headless Chrome over the DevTools protocol plays Team Deathmatch, ends each match and clicks the
  result screen's real next-map card, round the maps `laps` times. Every level it leaves is tagged
  (its level, scene, player, collision world, nav graph, enemy context, minimap DOM, a bot) with an
  object of a uniquely named class. At every map it forces a full GC (which the page itself cannot)
  and records the heap; at the end it takes a heap snapshot and prints, for any tag still alive, the
  shortest strong retainer path from the GC root. In the page, WeakRefs alone can't tell a leak from
  a collection the browser simply hasn't run yet (__dev.mapCycle reports both as "alive").
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { aliveTags } from './lib/heap.mjs';

const laps = Number(process.argv[2] ?? 2);
const maps = (process.argv[3] ?? 'desert,docks,neonblock').split(',');
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';

const { ev, gc, snapshot, open, close, done } = await openChrome();
await open(`${URL}?setting=${maps[0]}`);

const intoPlay = `for(let i=0;i<3000&&(__game.state==='intro'||__game.state==='title'||__game.state==='loading');i++){ if(__game.intro&&__game.intro.t>0.4) __game.skipIntro(); await sl(30);} __dev.lock(); __dev.god(true);`;
await ev(page(`__dev.start('tdm','${maps[0]}'); ${intoPlay} return __game.state;`));
const counts = `(()=>{ let o=0; __game.scene.traverse(()=>o++); const m=__game.renderer.renderer.info.memory; return { setting: __game.setting, geometries: m.geometries, textures: m.textures, sceneObjects: o, domNodes: document.getElementsByTagName('*').length, minimaps: document.querySelectorAll('.tdm-map').length }; })()`;
const rows = [];
const tags = [];
let n = 0;
for (let lap = 0; lap < laps; lap++) {
  for (let i = 0; i < maps.length; i++) {
    await sleep(4000);
    rows.push({ lap, ...(await ev(counts)), heapMB: await gc() });
    const t = `T${n++}_${maps[i]}`;
    // Uniquely named classes, so the snapshot can find each tagged object by name.
    await ev(`(()=>{ const G=__game, M=G.tdm.minimap, B=G.tdm.bots[0]; const mk=(k)=>new ({['${t}_'+k]: class{}})['${t}_'+k](); G.level.__tag=mk('level'); G.scene.userData.__tag=mk('scene'); G.player.__tag=mk('player'); G.col.__tag=mk('collision'); G.nav.__tag=mk('nav'); G.ctx.__tag=mk('enemyCtx'); if(M) M.root.__tag=mk('minimapDom'); if(B) B.__tag=mk('bot'); })()`);
    tags.push(t);
    const next = maps[(i + 1) % maps.length];
    const r = await ev(page(`__game.tdm.end({ winner: 'alpha', why: 'elimination' }); for(let i=0;i<3000&&__game.state!=='ending';i++) await sl(20); await sl(100); const c=document.querySelector('#tdmscreen [data-map="${next}"]'); if(!c) return 'no card'; c.click(); for(let i=0;i<3000&&__game.setting!=='${next}';i++) await sl(20); ${intoPlay} return __game.setting+' '+__game.state;`));
    if (!r.startsWith(next)) { console.error('hop failed:', r); done(2); }
  }
}
await sleep(4000);
rows.push({ lap: laps, ...(await ev(counts)), heapMB: await gc() });
console.table(rows);

// ---- Heap snapshot: any tag still alive, and what holds it.
const alive = aliveTags(await snapshot(), /^T\d+_/);
console.log(`\nleft levels tagged: ${tags.length} × 8 objects; still alive after a forced GC: ${alive.length}`);
for (const a of alive) console.log(`\n${a.tag}\n  ${a.path.join('\n  ')}`);
close();
done(alive.length ? 1 : 0);
