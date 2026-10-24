/*
  16.0, the main menu's 3D stage teardown check (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173); nobody editing (HMR reloads the page)
    node scripts/stagecheck.mjs [cycles=6]

  Headless Chrome over the DevTools protocol drives the real menu with clicks: on the root screen
  (the stage up) it tags the stage (the stage, its scene, its turntable gun, a material, its
  environment render target) with objects of uniquely named classes, switches the armory's gun twice
  (each old gun tagged too), then opens a mode's maps (the stage must be destroyed) and goes BACK (a
  fresh stage), `cycles` times; then it deploys into a match. At every step it forces a full GC and
  records the heap and the renderer's live GPU objects. At the end a heap snapshot must hold none of
  the tags: every stage and every gun was collected, not only freed on the GPU.
*/
import { openChrome, page, sleep } from './lib/cdp.mjs';
import { aliveTags } from './lib/heap.mjs';

const cycles = Number(process.argv[2] ?? 6);
const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';

const { ev, gc, snapshot, open, close, done } = await openChrome();
await open(`${URL}?setting=desert`);

const counts = (step) => `(()=>{ const m=__game.renderer.renderer.info.memory; return { step: '${step}', screen: __game.menuState.screen, state: __game.state, stage: !!__game.stage, scene: __game.renderer.scene.name || __game.setting, geometries: m.geometries, textures: m.textures, programs: __game.renderer.renderer.info.programs.length }; })()`;
const click = (sel) => `{ const b=document.querySelector('${sel}'); if(!b) throw new Error('no ${sel}'); b.click(); }`;
const rows = [];
const tags = [];
const guns = ['smg', 'shotgun', 'ar'];
let n = 0;

for (let c = 0; c < cycles; c++) {
  await sleep(1200);
  const t = `S${n++}`;
  tags.push(t);
  // Tag this stage and everything it made that a leak would keep.
  const ok = await ev(`(()=>{ const s=__game.stage; if(!s) return false; const mk=(k)=>new ({['${t}_'+k]: class{}})['${t}_'+k](); s.__tag=mk('stage'); s.scene.userData.__tag=mk('scene'); s.gun.__tag=mk('gun'); s.env.__tag=mk('envTarget'); let mat=null; s.scene.traverse(o=>{ if(!mat&&o.isMesh) mat=o.material; }); mat.userData.__tag=mk('material'); return true; })()`);
  if (!ok) { console.error('no stage on the root screen at cycle', c); done(2); }
  rows.push({ ...(await ev(counts(`root ${c}`))), heapMB: await gc() });
  // Two gun swaps: each old gun model must go too.
  for (const g of [guns[c % 3], guns[(c + 1) % 3]]) {
    await ev(`(()=>{ const mk=(k)=>new ({['${t}_'+k]: class{}})['${t}_'+k](); const gun=__game.stage.gun; gun.children.forEach((ch,i)=>{ ch.__tag=mk('gunPart'+i); }); })()`);
    await ev(page(`${click(`[data-gun="${g}"]`)} await sl(300); return 1;`));
  }
  // Root → maps: the stage must be gone, the level drawn.
  await ev(page(`${click('[data-mode="tdm"]')} for(let i=0;i<500&&(__game.stage||__game.loading);i++) await sl(20); await sl(400); return 1;`));
  const m = await ev(counts(`maps ${c}`));
  if (m.stage || m.scene === 'menu-stage') { console.error('the stage outlived the maps screen', m); done(1); }
  rows.push({ ...m, heapMB: await gc() });
  // Back: a fresh stage.
  await ev(page(`${click('.mainmenu [data-screen="maps"] [data-act="back"]')} for(let i=0;i<200&&!__game.stage;i++) await sl(20); return 1;`));
}

// Into a match from the maps screen.
await ev(page(`${click('[data-mode="tdm"]')} for(let i=0;i<500&&(__game.stage||__game.loading);i++) await sl(20); await sl(300); ${click('[data-act="deploy"]')} for(let i=0;i<3000&&(__game.state==='intro'||__game.state==='title'||__game.state==='loading');i++){ if(__game.intro&&__game.intro.t>0.4) __game.skipIntro(); await sl(30);} return __game.state;`));
await sleep(2500);
const match = await ev(counts('match'));
if (match.stage || match.scene === 'menu-stage') { console.error('the stage outlived the deploy', match); done(1); }
rows.push({ ...match, heapMB: await gc() });
console.table(rows);

const alive = aliveTags(await snapshot(), /^S\d+_/);
console.log(`\nstages tagged: ${tags.length} (5 objects each, plus every swapped gun's parts); still alive after a forced GC: ${alive.length}`);
for (const a of alive.slice(0, 8)) console.log(`\n${a.tag}\n  ${a.path.join('\n  ')}`);
close();
done(alive.length ? 1 : 0);
