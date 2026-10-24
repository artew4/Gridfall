/*
  Headless Chrome over the DevTools protocol, for the DEV memory checks (leakcheck.mjs, stagecheck.mjs):
  (44.0: GPU=1 renders on the machine's GPU, ANGLE Metal, instead of SwiftShader: real frame times.)
  a page of our own, `ev` (evaluate, awaiting promises), `gc` (a forced full GC, which the page itself
  cannot run, then the heap in MB) and `snapshot` (a parsed heap snapshot). Node 22+ (global WebSocket).
*/
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openChrome({ port = 9333, chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gridfall-cdp-'));
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, ...(process.env.GPU ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => {
    try { proc.kill(); } catch {}
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  const done = (code) => {
    cleanup();
    process.exit(code);
  };
  // 17.0: a script that throws (or is interrupted) must not leave headless Chrome behind. One left by
  // a crashed leak check rendered the game in SwiftShader on four cores for hours.
  process.on('exit', cleanup);
  process.on('uncaughtException', (e) => { console.error(e); done(2); });
  process.on('unhandledRejection', (e) => { console.error(e); done(2); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => done(130));
  // A tab of our own (Chrome also lists its UI surfaces, and the startup tab can be replaced).
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
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
  const snapshot = async () => {
    chunks = [];
    await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    return JSON.parse(chunks.join(''));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('HeapProfiler.enable');
  /** Load the game and wait until it is ready. */
  const open = async (url) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < 400; i++) {
      if (await ev('!!(window.__game && __game.ready)').catch(() => false)) return;
      await sleep(500);
    }
    console.error('the game never became ready at', url);
    done(2);
  };
  return { send, ev, gc, snapshot, open, close: () => ws.close(), done };
}

/** Wrap page code in an async IIFE with a `sl(ms)` sleep. */
export const page = (s) => `(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); ${s} })()`;
