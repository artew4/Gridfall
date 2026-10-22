import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/*
  Procedural textures for Old Port (17.1): canvas, tiling, sRGB. The palette is daylight and
  weathered: warm brick, pale concrete, sun-faded paint. Nothing is saturated and nothing glows; the
  variety comes from value and texture (mortar, joints, rust runs, stains), not from hue.
*/

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A soft blob on every side of the tile (wraps without seams). */
function blob(g: CanvasRenderingContext2D, S: number, x: number, y: number, r: number, inner: string) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
    const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
}

function speckle(g: CanvasRenderingContext2D, S: number, rnd: () => number, n: number, light: string, dark: string) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? light : dark;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
}

/** Hex colour shifted in value by k (−1..1). */
function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  const f = 1 + k;
  return `rgb(${Math.round(Math.min(255, c.r * 255 * f))},${Math.round(Math.min(255, c.g * 255 * f))},${Math.round(Math.min(255, c.b * 255 * f))})`;
}

/**
 * Old common-bond brickwork (one tile = 2 m): warm bricks varying in value, recessed lime mortar,
 * a header course every sixth, soot and rain streaks, a lighter weathered band. `soot` darkens it.
 */
export function brickTexture(base = '#8b5a43', soot = 0) {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1701 + Math.round(soot * 10));
  const courses = 30;
  const ch = S / courses;
  g.fillStyle = '#b7aa94';
  g.fillRect(0, 0, S, S);
  for (let r = 0; r < courses; r++) {
    const header = r % 6 === 0;
    const bw = header ? S / 18 : S / 9.3;
    const off = header ? 0 : (r % 2) * bw * 0.5;
    for (let x = -bw + off; x < S; x += bw) {
      const k = (rnd() - 0.5) * 0.28 - (rnd() < 0.06 ? 0.22 : 0) + (rnd() < 0.04 ? 0.18 : 0);
      g.fillStyle = shade(base, k);
      g.fillRect(x + 1.5, r * ch + 1.5, bw - 3, ch - 3);
      // A darker fired end now and then.
      if (rnd() < 0.15) {
        g.fillStyle = 'rgba(40,20,12,0.25)';
        g.fillRect(x + 1.5, r * ch + 1.5, bw * 0.25, ch - 3);
      }
    }
  }
  // Rain streaks from the top, soot bands, a few lime blooms.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, w = 3 + rnd() * 10, l = S * (0.2 + rnd() * 0.6);
    const grd = g.createLinearGradient(0, 0, 0, l);
    grd.addColorStop(0, `rgba(35,28,24,${0.12 + soot * 0.2})`);
    grd.addColorStop(1, 'rgba(35,28,24,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, l);
  }
  for (let i = 0; i < 18; i++) blob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 60, rnd() < 0.6 ? `rgba(30,22,18,${0.08 + soot * 0.15})` : 'rgba(235,225,205,0.08)');
  speckle(g, S, rnd, 9000, 'rgba(240,230,210,0.08)', 'rgba(20,12,8,0.12)');
  return finish(c);
}

/**
 * The quay apron: big pale concrete slabs (one tile = 8 m: four 4 m slabs), sawn joints, tyre and
 * pallet scuffs, a few old oil stains, salt-bleached patches.
 */
export function quayTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1702);
  g.fillStyle = '#a7a59d';
  g.fillRect(0, 0, S, S);
  for (let sx = 0; sx < 2; sx++) for (let sy = 0; sy < 2; sy++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '40,38,32'},${0.03 + rnd() * 0.05})`;
    g.fillRect((sx * S) / 2, (sy * S) / 2, S / 2, S / 2);
  }
  for (let i = 0; i < 30; i++) blob(g, S, rnd() * S, rnd() * S, 15 + rnd() * 70, rnd() < 0.5 ? 'rgba(255,252,240,0.09)' : 'rgba(50,48,40,0.09)');
  for (let i = 0; i < 6; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 26, 'rgba(30,28,24,0.22)');
  // Scuffs: long faint parallel arcs.
  g.strokeStyle = 'rgba(40,38,34,0.08)';
  for (let i = 0; i < 12; i++) {
    g.lineWidth = 3 + rnd() * 6;
    g.beginPath();
    const x = rnd() * S, y = rnd() * S;
    g.moveTo(x, y);
    g.bezierCurveTo(x + rnd() * 200 - 100, y + 120, x + rnd() * 200 - 100, y + 260, x + rnd() * 160 - 80, y + 380);
    g.stroke();
  }
  // Sawn joints with a darker line and a light arris.
  g.fillStyle = 'rgba(45,43,38,0.55)';
  for (const p of [0, S / 2]) {
    g.fillRect(p, 0, 2, S);
    g.fillRect(0, p, S, 2);
  }
  g.fillStyle = 'rgba(255,250,235,0.18)';
  for (const p of [0, S / 2]) {
    g.fillRect(p + 2, 0, 1, S);
    g.fillRect(0, p + 2, S, 1);
  }
  speckle(g, S, rnd, 16000, 'rgba(250,248,235,0.1)', 'rgba(20,20,16,0.12)');
  return finish(c);
}

/** Sun-faded corrugated container steel: ribs, chalky paint, rust runs and dents, a stencil block. */
export function containerTexture(paint: string, seed = 0) {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1710 + seed);
  g.fillStyle = paint;
  g.fillRect(0, 0, S, S);
  // Chalky fade towards the top (the sun side).
  const fade = g.createLinearGradient(0, 0, 0, S);
  fade.addColorStop(0, 'rgba(245,240,228,0.2)');
  fade.addColorStop(1, 'rgba(245,240,228,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, S, S);
  const ribs = 12;
  for (let k = 0; k < ribs; k++) {
    const x = (k * S) / ribs;
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x, 0, 3, S);
    g.fillStyle = 'rgba(255,250,235,0.12)';
    g.fillRect(x + 5, 0, 4, S);
  }
  for (let i = 0; i < 18; i++) {
    const x = rnd() * S, l = 12 + rnd() * 70;
    const grd = g.createLinearGradient(0, 0, 0, l);
    grd.addColorStop(0, 'rgba(120,64,34,0.42)');
    grd.addColorStop(1, 'rgba(120,64,34,0)');
    g.fillStyle = grd;
    g.fillRect(x, rnd() * S * 0.7, 2 + rnd() * 3, l);
  }
  for (let i = 0; i < 10; i++) blob(g, S, rnd() * S, rnd() * S, 8 + rnd() * 24, 'rgba(110,60,32,0.25)');
  speckle(g, S, rnd, 5000, 'rgba(250,245,230,0.09)', 'rgba(0,0,0,0.12)');
  return finish(c);
}

/** Dock wall concrete: grey with a darker tide band at the foot, horizontal shutter lines, weeps. */
export function dockWallTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1720);
  g.fillStyle = '#8f8d86';
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < S; y += S / 8) g.fillRect(0, y, S, 2);
  const tide = g.createLinearGradient(0, S * 0.55, 0, S);
  tide.addColorStop(0, 'rgba(60,62,55,0)');
  tide.addColorStop(0.3, 'rgba(60,62,55,0.35)');
  tide.addColorStop(1, 'rgba(48,52,44,0.55)');
  g.fillStyle = tide;
  g.fillRect(0, S * 0.55, S, S * 0.45);
  for (let i = 0; i < 50; i++) {
    const x = rnd() * S, l = S * (0.1 + rnd() * 0.4);
    const grd = g.createLinearGradient(0, 0, 0, l);
    grd.addColorStop(0, 'rgba(110,70,40,0.25)');
    grd.addColorStop(1, 'rgba(110,70,40,0)');
    g.fillStyle = grd;
    g.fillRect(x, rnd() * S * 0.4, 2 + rnd() * 4, l);
  }
  for (let i = 0; i < 24; i++) blob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 50, rnd() < 0.5 ? 'rgba(255,250,235,0.07)' : 'rgba(30,30,26,0.09)');
  speckle(g, S, rnd, 12000, 'rgba(250,250,240,0.09)', 'rgba(10,10,8,0.13)');
  return finish(c);
}

/** Old warehouse floorboards (one tile = 2 m along the boards). */
export function boardsTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1730);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const k = (rnd() - 0.5) * 0.2;
    g.fillStyle = shade('#8a6b4c', k);
    g.fillRect(0, (i * S) / n, S, S / n);
    g.fillStyle = 'rgba(30,20,12,0.5)';
    g.fillRect(0, (i * S) / n, S, 1.5);
    const cut = rnd() * S;
    g.fillRect(cut, (i * S) / n, 1.5, S / n);
    for (let j = 0; j < 6; j++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,215' : '40,26,14'},0.08)`;
      g.fillRect(0, (i * S) / n + rnd() * (S / n), S, 1);
    }
  }
  for (let i = 0; i < 10; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 30, 'rgba(40,30,20,0.2)');
  speckle(g, S, rnd, 3000, 'rgba(255,240,220,0.08)', 'rgba(0,0,0,0.1)');
  return finish(c);
}

/** A painted stencil sign on weathered board (warehouse number, dock name). */
export function stencilSign(text: string, sub: string, bg = '#d8cfbc', ink = '#4a3a2c') {
  const { c, g } = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 60px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  g.fillText(text, 256, 52);
  g.font = '24px monospace';
  g.fillText(sub, 256, 104);
  const rnd = mulberry32(text.length * 17);
  for (let i = 0; i < 40; i++) blob(g, 512, rnd() * 512, rnd() * 128, 6 + rnd() * 22, 'rgba(250,245,230,0.25)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tangent-space ripple normal map for the water (tiles; scrolled per frame). */
export function rippleNormalTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const img = g.createImageData(S, S);
  const rnd = mulberry32(1740);
  const waves: [number, number, number, number][] = [];
  for (let i = 0; i < 9; i++) waves.push([1 + Math.floor(rnd() * 5), Math.floor(rnd() * 5) - 2, rnd() * Math.PI * 2, 0.4 + rnd() * 0.6]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, ph, a] of waves) {
      const t = ((kx * x + ky * y) / S) * Math.PI * 2 + ph;
      const d = Math.cos(t) * a;
      dx += d * kx;
      dy += d * ky;
    }
    const n = new THREE.Vector3(-dx * 0.05, -dy * 0.05, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255;
    img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return finish(c, false);
}

/** A soft horizontal haze band (alpha gradient) for the mist over the water. */
export function hazeTexture() {
  const { c, g } = canvas(256, 64);
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 64);
  const side = g.createLinearGradient(0, 0, 256, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.2, 'rgba(0,0,0,0)');
  side.addColorStop(0.8, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
