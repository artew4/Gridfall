import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Pipeline } from '../core/Renderer';

/*
  DEV only. Fixed camera placements per level, frozen-frame contact sheets (each cell rendered and
  copied in the same task, optionally once per pipeline for an A/B), and HDR luminance statistics of
  the linear scene buffer (before bloom, grade and ACES) for picking grade ranges and bloom
  thresholds from data.
*/

type Dev = { tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void };
type View = [string, () => void];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function views(game: Game): View[] {
  const dev = (window as unknown as { __dev: Dev }).__dev;
  const h = (x: number, z: number) => game.col.terrain?.height(x, z) ?? 0;
  if (game.setting !== 'jungle') return [];
  const st = game.level.data.start;
  return [
    ['road', () => (dev.tp(st.x, 0, st.z, st.yaw, 0), dev.look(0, 3, 10))],
    ['yard', () => (dev.tp(0, 0, 5.5, 0, 0), dev.look(-4, 1.5, -25))],
    ['tower', () => (dev.tp(17.2, 4.5, 3.2, 0, 0), dev.look(-10, 0, -25))],
    ['forest', () => (dev.tp(-46, h(-46, -4), -4, 0, 0), dev.look(-28, 2, -14))],
    ['gateOut', () => (dev.tp(2, 0, 24, 0, 0), dev.look(0, 4, -10))],
    ['motor', () => (dev.tp(-8, 0, -4, 0, 0), dev.look(-18, 1, -16))],
    ['ruts', () => (dev.tp(Math.sin(40 * 0.07) * 3, 0, 40, 0, 0), dev.look(Math.sin(31 * 0.07) * 3, 0, 31))],
    ['yardRuts', () => (dev.tp(1, 0, 8, 0, 0), dev.look(-2, 0, -2))],
  ];
}

/** A contact sheet of frozen frames (views × pipelines) shown in an overlay; returns the canvas. */
export async function sheet(game: Game, names?: string[], pipes?: Pipeline[], W = 480, H = 270) {
  const sel = views(game).filter((v) => !names || names.includes(v[0]));
  const ps: (Pipeline | null)[] = pipes ?? [null];
  const cols = ps.length > 1 ? ps.length : Math.min(3, sel.length);
  const cells: [View, Pipeline | null][] = [];
  for (const v of sel) for (const p of ps) cells.push([v, p]);
  const out = document.createElement('canvas');
  out.width = W * cols;
  out.height = H * Math.ceil(cells.length / cols);
  const x = out.getContext('2d')!;
  for (let i = 0; i < cells.length; i++) {
    const [v, p] = cells[i];
    if (p) game.setPipeline(p);
    v[1]();
    await wait(500);
    game.renderer.render(game.elapsed);
    const cx = (i % cols) * W, cy = Math.floor(i / cols) * H;
    x.drawImage(game.renderer.canvas, cx, cy, W, H);
    x.fillStyle = '#fff';
    x.font = '14px monospace';
    x.fillText(`${v[0]} ${p ?? game.renderer.pipeline}`, cx + 6, cy + 16);
  }
  if (pipes) game.setPipeline('v4');
  let ov = document.getElementById('__ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '__ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center';
    ov.onclick = () => (ov!.style.display = 'none');
    document.body.appendChild(ov);
  }
  ov.innerHTML = '';
  out.style.cssText = 'max-width:100%;max-height:100%';
  ov.appendChild(out);
  ov.style.display = 'flex';
  return out;
}

export function hideSheet() {
  const o = document.getElementById('__ov');
  if (o) o.style.display = 'none';
}

/**
 * Linear HDR luminance percentiles of the scene (no viewmodel) at each view, optionally with some
 * objects hidden (`hide` returns the objects to hide; the diff of the two renders isolates them).
 */
export async function hdr(game: Game, names?: string[], hide?: () => THREE.Object3D[]) {
  const W = 480, H = 270;
  const r = game.renderer.renderer;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const px = new Float32Array(W * H * 4);
  const lum = () => {
    const L = new Float32Array(W * H);
    for (let i = 0; i < L.length; i++) L[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return L;
  };
  const shot = () => {
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(rt);
    r.render(game.scene, game.camera);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    r.setRenderTarget(null);
    r.toneMapping = tm;
    return lum();
  };
  const stats = (L: Float32Array | number[]) => {
    const s = Array.from(L).sort((a, b) => a - b);
    if (!s.length) return { n: 0 };
    const q = (p: number) => +s[Math.floor(p * (s.length - 1))].toFixed(3);
    return { n: s.length, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), p99: q(0.99), max: q(1), over1: +((s.filter((v) => v > 1).length / s.length) * 100).toFixed(2) };
  };
  const res: Record<string, unknown> = {};
  for (const v of views(game).filter((v) => !names || names.includes(v[0]))) {
    v[1]();
    await wait(400);
    const all = shot();
    if (!hide) {
      res[v[0]] = stats(all);
      continue;
    }
    const objs = hide();
    const was = objs.map((o) => o.visible);
    objs.forEach((o) => (o.visible = false));
    const without = shot();
    objs.forEach((o, i) => (o.visible = was[i]));
    const cls: number[] = [];
    for (let i = 0; i < all.length; i++) if (Math.abs(all[i] - without[i]) > 1e-4) cls.push(all[i] - without[i]);
    res[v[0]] = { all: stats(all), added: stats(cls), share: +((cls.length / all.length) * 100).toFixed(1) };
  }
  rt.dispose();
  return res;
}
