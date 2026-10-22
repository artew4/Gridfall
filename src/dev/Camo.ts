import type { Game } from '../core/Game';

/*
  20.0, camouflage contrast (DEV): how much an operator stands out from what is behind it, as the
  player's screen shows it (after the post chain). For each view and distance, one of OMEGA's bots is
  posed facing the camera and the frame is rendered twice in the same task, with the bot and without
  it; the pixels that differ are the bot. Over them:
   - pixels: how big it is on screen;
   - lumaContrast: Weber contrast of its mean luminance against the same pixels without it,
     |L_bot − L_bg| / L_bg (0: invisible by brightness; a black figure on a white floor is ~0.9);
   - colourDiff: mean per-channel difference (0–255): what the eye has to find, colour included.
  The kit is whatever the match was started with (`__dev.camo({ kit })` starts one).
*/

interface View {
  name: string;
  eye: [number, number, number];
  dir: [number, number];
}

// Lines kept clear of the 20.0 cover (each view's line runs between it): the platform beside the
// train (the bot in front of the billboards and the hall), the outer platform, the track bed, the
// mezzanine (the hall's white columns and glass behind).
const VIEWS: View[] = [
  { name: 'platform2', eye: [5.2, 0, 14], dir: [0, -1] },
  { name: 'platform1', eye: [-5.2, 0, 14], dir: [0, -1] },
  { name: 'trackBed', eye: [17, -1.5, 44], dir: [0, -1] },
  { name: 'mezzanine', eye: [26.5, 5, 33], dir: [0, -1] },
];

export async function camo(game: Game, opts: { distances?: number[]; threshold?: number } = {}) {
  const ds = opts.distances ?? [12, 20, 30];
  const thr = opts.threshold ?? 18;
  const dev = (window as unknown as { __dev: { tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void } }).__dev;
  const r = game.renderer.renderer;
  const gl = r.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const withBot = new Uint8Array(w * h * 4), noBot = new Uint8Array(w * h * 4);
  const out: Record<string, Record<number, { pixels: number; lumaContrast: number; colourDiff: number }>> = {};
  const bot = game.tdm.bots.find((b) => b.alive && b.team === 'omega');
  if (!bot) throw new Error('no OMEGA bot');
  const root = bot.rig.root;
  const luma = (a: Uint8Array, i: number) => (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
  for (const v of VIEWS) {
    out[v.name] = {};
    for (const d of ds) {
      const [ex, ey, ez] = v.eye;
      const tx = ex + v.dir[0] * d, tz = ez + v.dir[1] * d;
      dev.tp(ex, ey, ez);
      dev.look(tx, ey + 1.4, tz);
      // A frame for the camera to follow the player, then both renders in one task.
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      root.position.set(tx, ey, tz);
      root.rotation.set(0, Math.atan2(ex - tx, ez - tz), 0);
      root.visible = true;
      game.renderer.render(game.elapsed);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, withBot);
      root.visible = false;
      game.renderer.render(game.elapsed);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, noBot);
      root.visible = true;
      let n = 0, lb = 0, lg = 0, cd = 0;
      for (let i = 0; i < withBot.length; i += 4) {
        const diff = Math.abs(withBot[i] - noBot[i]) + Math.abs(withBot[i + 1] - noBot[i + 1]) + Math.abs(withBot[i + 2] - noBot[i + 2]);
        if (diff < thr) continue;
        n++;
        lb += luma(withBot, i);
        lg += luma(noBot, i);
        cd += diff / 3;
      }
      out[v.name][d] = n ? { pixels: n, lumaContrast: +(Math.abs(lb - lg) / Math.max(lg, 0.05 * n)).toFixed(3), colourDiff: +(cd / n).toFixed(1) } : { pixels: 0, lumaContrast: 0, colourDiff: 0 };
    }
  }
  return out;
}
