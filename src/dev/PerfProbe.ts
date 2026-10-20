import type { Game } from '../core/Game';

/**
 * DEV only. Measures, over a window: frames rendered per second, main-thread milliseconds per
 * frame (the whole game frame), GPU milliseconds per frame (EXT_disjoint_timer_query_webgl2 around
 * the composer), and the resulting busy share of each second — the closest proxy for power use the
 * browser exposes. Nothing here runs unless called.
 */
export async function probe(game: Game, seconds = 4) {
  const r = game.renderer;
  const gl = r.renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  const g = game as unknown as { frame: () => void };
  const proto = Object.getPrototypeOf(game) as { frame: () => void };
  let frames = 0;
  let renders = 0;
  /** Intervals between drawn frames (ms), for average and P95/P99 frame time. */
  const gaps: number[] = [];
  let lastDraw = -1;
  // Collision-query cost: wall time spent inside the CollisionWorld's hot calls.
  const col = (game as unknown as { col: Record<string, (...a: unknown[]) => unknown> }).col;
  let colMs = 0;
  const wrapped: [string, (...a: unknown[]) => unknown][] = [];
  for (const name of ['resolveCircle', 'groundHeightAt', 'raycast']) {
    const orig = col[name];
    wrapped.push([name, orig]);
    col[name] = function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      const r = orig.apply(col, a);
      colMs += performance.now() - t;
      return r;
    };
  }
  let cpu = 0;
  let gpu = 0;
  let gpuN = 0;
  const pending: WebGLQuery[] = [];
  const origRender = r.render.bind(r);
  g.frame = function (this: Game) {
    const t = performance.now();
    proto.frame.call(this);
    cpu += performance.now() - t;
    frames++;
    if (lastDraw >= 0) gaps.push(t - lastDraw);
    lastDraw = t;
  };
  r.render = (time: number) => {
    renders++;
    let q: WebGLQuery | null = null;
    if (ext && pending.length < 8) {
      q = gl.createQuery();
      if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    }
    origRender(time);
    if (q && ext) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
    }
    // Collect finished queries.
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q0 = pending.shift()!;
      if (!gl.getParameter(ext!.GPU_DISJOINT_EXT)) {
        gpu += gl.getQueryParameter(q0, gl.QUERY_RESULT) / 1e6;
        gpuN++;
      }
      gl.deleteQuery(q0);
    }
  };
  const t0 = performance.now();
  await new Promise((res) => setTimeout(res, seconds * 1000));
  const wall = (performance.now() - t0) / 1000;
  delete (g as { frame?: unknown }).frame;
  for (const [name, orig] of wrapped) col[name] = orig;
  r.render = origRender;
  for (const q of pending) gl.deleteQuery(q);
  const canvas = r.renderer.domElement;
  const fps = renders / wall;
  const gpuMs = gpuN ? gpu / gpuN : NaN;
  gaps.sort((a, b) => a - b);
  const pct = (q: number) => (gaps.length ? +gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))].toFixed(2) : NaN);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    state: game.state,
    frameMsAvg: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) : NaN,
    frameMsP95: pct(0.95),
    frameMsP99: pct(0.99),
    triangles: r.renderer.info.render.triangles,
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : NaN,
    collisionMsPerFrame: +(colMs / Math.max(1, frames)).toFixed(3),
    loopHz: +(frames / wall).toFixed(1),
    fps: +fps.toFixed(1),
    cpuMsPerFrame: +(cpu / Math.max(1, frames)).toFixed(2),
    gpuMsPerFrame: +gpuMs.toFixed(2),
    /** Share of each second the main thread spent in the game frame. */
    cpuBusy: +((cpu / 1000 / wall) * 100).toFixed(1),
    /** Share of each second the GPU spent rendering the game. */
    gpuBusy: +(((gpuMs * fps) / 1000) * 100).toFixed(1),
    resolution: `${canvas.width}x${canvas.height}`,
    drawCalls: r.renderer.info.render.calls,
  };
}
