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
  r.render = origRender;
  for (const q of pending) gl.deleteQuery(q);
  const canvas = r.renderer.domElement;
  const fps = renders / wall;
  const gpuMs = gpuN ? gpu / gpuN : NaN;
  return {
    state: game.state,
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
