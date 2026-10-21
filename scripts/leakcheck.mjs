/*
  13.0, the definitive map-transition leak check (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/leakcheck.mjs [laps=2] [maps=desert,docks,jungle]

  Headless Chrome over the DevTools protocol plays Team Deathmatch, ends each match and clicks the
  result screen's real next-map card, round the maps `laps` times. Every level it leaves is tagged
  (its level, scene, player, collision world, nav graph, enemy context, minimap DOM, a bot) with an
  object of a uniquely named class. At every map it forces a full GC (which the page itself cannot)
  and records the heap; at the end it takes a heap snapshot and prints, for any tag still alive, the
  shortest strong retainer path from the GC root. In the page, WeakRefs alone can't tell a leak from
  a collection the browser simply hasn't run yet (__dev.mapCycle reports both as "alive").
*/
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const laps = Number(process.argv[2] ?? 2);
const maps = (process.argv[3] ?? 'desert,docks,jungle').split(',');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const PORT = 9333;

const dir = mkdtempSync(join(tmpdir(), 'gridfall-leak-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(code);
};

// A tab of our own (Chrome also lists its UI surfaces, and the startup tab can be replaced).
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    if (page.webSocketDebuggerUrl) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(200);
}
if (!ws) { console.error('no Chrome'); done(2); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
let chunks = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
const gc = async () => {
  await send('HeapProfiler.collectGarbage');
  await sleep(200);
  await send('HeapProfiler.collectGarbage');
  return +((await send('Runtime.getHeapUsage')).result.usedSize / 1048576).toFixed(1);
};

await send('Page.enable');
await send('Runtime.enable');
await send('HeapProfiler.enable');
await send('Page.navigate', { url: `${URL}?setting=${maps[0]}` });
let ready = false;
for (let i = 0; i < 400 && !ready; i++) {
  ready = await ev('!!(window.__game && __game.ready)').catch(() => false);
  if (!ready) await sleep(500);
}
if (!ready) { console.error('the game never became ready at', URL); done(2); }

const page = (s) => `(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); ${s} })()`;
const intoPlay = `for(let i=0;i<3000&&(__game.state==='intro'||__game.state==='title');i++){ if(__game.intro&&__game.intro.t>0.4) __game.skipIntro(); await sl(30);} __dev.lock(); __dev.god(true);`;
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
    const r = await ev(page(`__game.tdm.end('alpha'); for(let i=0;i<3000&&__game.state!=='ending';i++) await sl(20); await sl(100); const c=document.querySelector('#tdmscreen [data-map="${next}"]'); if(!c) return 'no card'; c.click(); for(let i=0;i<3000&&__game.setting!=='${next}';i++) await sl(20); ${intoPlay} return __game.setting+' '+__game.state;`));
    if (!r.startsWith(next)) { console.error('hop failed:', r); done(2); }
  }
}
await sleep(4000);
rows.push({ lap: laps, ...(await ev(counts)), heapMB: await gc() });
console.table(rows);

// ---- Heap snapshot: any tag still alive, and what holds it.
chunks = [];
await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
const snap = JSON.parse(chunks.join(''));
const m = snap.snapshot.meta;
const NF = m.node_fields.length, EF = m.edge_fields.length;
const nT = m.node_fields.indexOf('type'), nN = m.node_fields.indexOf('name'), nE = m.node_fields.indexOf('edge_count');
const eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
const { nodes, edges, strings } = snap;
const N = nodes.length / NF;
const retainers = Array.from({ length: N }, () => []);
for (let i = 0, e = 0; i < N; i++) {
  for (let k = 0; k < nodes[i * NF + nE]; k++, e += EF) {
    const type = m.edge_types[0][edges[e + eT]];
    if (type === 'weak') continue;
    const name = type === 'element' || type === 'hidden' ? `[${edges[e + eN]}]` : strings[edges[e + eN]];
    retainers[edges[e + eTo] / NF].push([i, `${type}:${name}`]);
  }
}
const label = (i) => `${m.node_types[0][nodes[i * NF + nT]]}:${strings[nodes[i * NF + nN]]}`;
const alive = [];
for (let i = 0; i < N; i++) {
  const name = strings[nodes[i * NF + nN]];
  if (m.node_types[0][nodes[i * NF + nT]] !== 'object' || !/^T\d+_/.test(name)) continue;
  const owner = retainers[i].find(([, e]) => e.endsWith(':__tag'));
  if (!owner) continue;
  const prev = new Map([[owner[0], null]]);
  const q = [owner[0]];
  while (q.length) {
    const x = q.shift();
    if (x === 0) break;
    for (const [r, e] of retainers[x]) if (!prev.has(r)) { prev.set(r, [x, e]); q.push(r); }
  }
  const path = [];
  for (let x = 0; prev.get(x); x = prev.get(x)[0]) path.push(`${label(x)} -${prev.get(x)[1]}->`);
  alive.push({ tag: name, path: path.slice(-12) });
}
console.log(`\nleft levels tagged: ${tags.length} × 8 objects; still alive after a forced GC: ${alive.length}`);
for (const a of alive) console.log(`\n${a.tag}\n  ${a.path.join('\n  ')}`);
ws.close();
done(alive.length ? 1 : 0);
