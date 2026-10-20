import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/** Procedural textures for the desert (canvas, tiling, sRGB). Each call makes a new texture. */

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Speckle of light/dark grains over a base colour. */
function grain(g: CanvasRenderingContext2D, size: number, n: number, rnd: () => number, light: string, dark: string, r = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? light : dark;
    g.fillRect(rnd() * size, rnd() * size, r, r);
  }
}

/** Wind-rippled sand: soft wavy bands plus grain. */
export function sandTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(7);
  g.fillStyle = '#c9a26b';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 4) {
      const w = Math.sin((x * 0.045 + Math.sin(y * 0.02) * 2.2 + y * 0.11) * 1.0);
      const a = 0.06 + 0.05 * w;
      g.fillStyle = w > 0 ? `rgba(255,236,196,${a})` : `rgba(120,82,40,${a * 0.9})`;
      g.fillRect(x, y, 4, 2);
    }
  }
  grain(g, S, 26000, rnd, 'rgba(255,240,210,0.35)', 'rgba(90,60,30,0.3)');
  return finish(c);
}

/** Sun-bleached plaster over mud brick: blotches, stains running down, a few cracks. */
export function plasterTexture(base = '#d8c09a') {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(11);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const r = 10 + rnd() * 60;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    const dark = rnd() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(120,90,55,0.12)' : 'rgba(255,245,225,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(rnd() * S, rnd() * S);
    g.fillStyle = grd;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
  }
  // Stains from the parapet down (texture v runs up the wall).
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const w = 3 + rnd() * 12;
    const grd = g.createLinearGradient(0, 0, 0, S * 0.5);
    grd.addColorStop(0, 'rgba(90,65,40,0.22)');
    grd.addColorStop(1, 'rgba(90,65,40,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, S * (0.2 + rnd() * 0.4));
  }
  g.strokeStyle = 'rgba(80,58,36,0.35)';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    let x = rnd() * S, y = rnd() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 30), (y += rnd() * 18));
    g.stroke();
  }
  grain(g, S, 18000, rnd, 'rgba(255,250,235,0.25)', 'rgba(70,50,30,0.22)');
  return finish(c);
}

/** Layered sandstone: horizontal strata of varying thickness and tone, with fractures. */
export function rockTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(23);
  let y = 0;
  while (y < S) {
    const h = 6 + rnd() * 28;
    const t = rnd();
    g.fillStyle = `rgb(${Math.round(170 + t * 50)},${Math.round(110 + t * 40)},${Math.round(70 + t * 30)})`;
    g.fillRect(0, y, S, h);
    g.fillStyle = 'rgba(60,35,20,0.25)';
    g.fillRect(0, y + h - 1.5, S, 1.5);
    y += h;
  }
  g.strokeStyle = 'rgba(55,32,18,0.45)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    g.beginPath();
    let x = rnd() * S, yy = rnd() * S;
    g.moveTo(x, yy);
    for (let k = 0; k < 4; k++) g.lineTo((x += (rnd() - 0.5) * 16), (yy += 10 + rnd() * 20));
    g.stroke();
  }
  grain(g, S, 30000, rnd, 'rgba(255,225,190,0.25)', 'rgba(60,35,20,0.3)');
  return finish(c);
}

/** Corrugated, sun-faded metal with rust streaks (ridges run along v). */
export function corrugatedTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(31);
  for (let x = 0; x < S; x++) {
    const k = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 16);
    const v = Math.round(118 + k * 60);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(x, 0, 1, S);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, 'rgba(140,70,30,0.35)');
    grd.addColorStop(1, 'rgba(140,70,30,0)');
    g.fillStyle = grd;
    g.fillRect(x, rnd() * S * 0.5, 2 + rnd() * 5, S * 0.5);
  }
  return finish(c);
}

/** Stacked sandbags: rows of rounded bags, offset per row. */
export function sandbagTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(41);
  g.fillStyle = '#6e6448';
  g.fillRect(0, 0, S, S);
  const rows = 4, cols = 3;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols + 1; k++) {
      const x = (k + (r % 2) * 0.5) * (S / cols);
      const y = r * (S / rows);
      const grd = g.createRadialGradient(x + S / cols / 2, y + S / rows / 2, 4, x + S / cols / 2, y + S / rows / 2, S / cols / 1.6);
      const t = 0.85 + rnd() * 0.25;
      grd.addColorStop(0, `rgb(${Math.round(196 * t)},${Math.round(178 * t)},${Math.round(128 * t)})`);
      grd.addColorStop(1, `rgb(${Math.round(120 * t)},${Math.round(106 * t)},${Math.round(72 * t)})`);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x + S / cols / 2, y + S / rows / 2, S / cols / 2 - 2, S / rows / 2 - 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  grain(g, S, 6000, rnd, 'rgba(255,240,200,0.2)', 'rgba(40,30,15,0.25)');
  return finish(c);
}

/** Weathered planks. */
export function woodTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(53);
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const t = 0.8 + rnd() * 0.3;
    g.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(112 * t)},${Math.round(72 * t)})`;
    g.fillRect(0, (p * S) / planks, S, S / planks);
    g.fillStyle = 'rgba(40,25,10,0.5)';
    g.fillRect(0, ((p + 1) * S) / planks - 2, S, 2);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(70,45,20,0.2)';
      g.fillRect(rnd() * S, (p * S) / planks + rnd() * (S / planks), 20 + rnd() * 60, 1);
    }
  }
  return finish(c);
}

/** Canvas tarp / awning: woven cloth with fold shading. */
export function canvasTexture(color = '#b9652e') {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(61);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(i, 0, 1, S);
    g.fillRect(0, i, S, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S;
    const grd = g.createLinearGradient(x - 20, 0, x + 20, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - 20, 0, 40, S);
  }
  return finish(c);
}

/** Wire-mesh gabion (HESCO) filled with sand. */
export function hescoTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(71);
  g.fillStyle = '#a99172';
  g.fillRect(0, 0, S, S);
  grain(g, S, 9000, rnd, 'rgba(240,220,180,0.3)', 'rgba(70,55,35,0.3)', 2);
  g.strokeStyle = 'rgba(70,72,70,0.85)';
  g.lineWidth = 2;
  for (let i = 0; i <= S; i += S / 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, S);
    g.moveTo(0, i);
    g.lineTo(S, i);
    g.stroke();
  }
  return finish(c);
}

/** A soft round puff for dust sheets (alpha in the red channel's luminance). */
export function dustTexture() {
  const S = 128;
  const { c, g } = canvas(S);
  const rnd = mulberry32(83);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + (rnd() - 0.5) * S * 0.5;
    const y = S / 2 + (rnd() - 0.5) * S * 0.5;
    const r = S * (0.12 + rnd() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Painted sign: red crescent on white (clinic). */
export function clinicSignTexture() {
  const { c, g } = canvas(256, 128);
  g.fillStyle = '#efe8da';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#c8222a';
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#efe8da';
  g.beginPath();
  g.arc(80, 58, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2a1a';
  g.font = 'bold 34px monospace';
  g.fillText('CLINIC', 112, 60);
  g.font = '22px monospace';
  g.fillText('診療所', 120, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Stencilled sign text on a board. */
export function stencilTexture(text: string, sub: string, bg = '#d9c9a3', fg = '#2b2418') {
  const { c, g } = canvas(256, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg;
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.fillText(text, 128, 44);
  g.font = '18px monospace';
  g.fillText(sub, 128, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
