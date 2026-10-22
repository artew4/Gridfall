import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/*
  Procedural textures for Maglev Terminal (18.0): canvas, tiling, sRGB. The palette is clean and
  sterile: white architectural concrete, pale polished stone, brushed steel, one corporate teal for
  wayfinding. The variety is in joints, tie holes, panel seams and a little polish, never in dirt.
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

/** Faint value noise in soft blobs (cast concrete, stone): wraps without seams. */
function cloud(g: CanvasRenderingContext2D, S: number, rnd: () => number, n: number, light: string, dark: string, r0: number, r1: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, rnd() < 0.5 ? light : dark);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
}

/**
 * White architectural concrete in formwork panels (one tile = 4 m): a 2 × 1 m panel grid with fine
 * seams, a tie hole at each panel's corners, a faint cloudiness. No stains: it is cleaned nightly.
 */
export function concretePanelTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1801);
  g.fillStyle = '#e6e4df';
  g.fillRect(0, 0, S, S);
  cloud(g, S, rnd, 70, 'rgba(255,255,255,0.10)', 'rgba(150,145,138,0.07)', 20, 90);
  const pw = S / 2, ph = S / 4;
  g.strokeStyle = 'rgba(120,118,112,0.45)';
  g.lineWidth = 1.5;
  for (let y = 0; y <= S; y += ph) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(S, y);
    g.stroke();
  }
  for (let r = 0; r < 4; r++) {
    for (const x of [0, pw]) {
      g.beginPath();
      g.moveTo(x, r * ph);
      g.lineTo(x, (r + 1) * ph);
      g.stroke();
    }
  }
  // Tie holes: a small dark disc and a lighter ring, 12 cm from each panel corner.
  for (let r = 0; r < 4; r++) for (const x of [0, pw]) for (const [hx, hy] of [[0.12, 0.2], [0.88, 0.2], [0.12, 0.8], [0.88, 0.8]]) {
    const cx = x + hx * pw, cy = r * ph + hy * ph;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(90,88,84,0.55)';
    g.beginPath();
    g.arc(cx, cy, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/**
 * Polished pale stone floor in 1.2 m tiles (one tile of texture = 4.8 m): each tile a slightly
 * different value with a soft vein cloud, hairline joints. `tone` picks the stone (light / grey).
 */
export function floorTileTexture(tone: 'light' | 'grey' = 'light') {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(tone === 'light' ? 1802 : 1803);
  const base = tone === 'light' ? [226, 225, 221] : [168, 170, 170];
  const n = 4, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 1 + (rnd() - 0.5) * 0.06;
    g.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
    g.fillRect(i * t, j * t, t, t);
  }
  cloud(g, S, rnd, 90, 'rgba(255,255,255,0.08)', 'rgba(110,110,108,0.07)', 8, 40);
  g.strokeStyle = tone === 'light' ? 'rgba(150,148,142,0.7)' : 'rgba(90,92,92,0.8)';
  g.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * t + 0.5, 0);
    g.lineTo(i * t + 0.5, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * t + 0.5);
    g.lineTo(S, i * t + 0.5);
    g.stroke();
  }
  return finish(c);
}

/** The track bed: grey concrete with a gravel speckle and drainage joints (one tile = 4 m). */
export function trackBedTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1804);
  g.fillStyle = '#8d8f8e';
  g.fillRect(0, 0, S, S);
  cloud(g, S, rnd, 40, 'rgba(255,255,255,0.06)', 'rgba(40,40,40,0.08)', 10, 50);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.round(rnd() * 90);
    g.fillStyle = `rgba(${v},${v},${v - 4},0.8)`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  g.fillStyle = 'rgba(60,60,60,0.5)';
  g.fillRect(0, 0, S, 2);
  return finish(c);
}

/**
 * An escalator's treads seen from above (non-functioning: the steps are a ribbed incline): fine
 * grooves along the run, a cleat line each 0.4 m, the yellow-free grey of a corporate building.
 * One tile = 2 m along the run (v) by 1 m across (u).
 */
export function ribbedTexture() {
  const W = 128, H = 256;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#7d8286';
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 4) {
    g.fillStyle = 'rgba(30,32,34,0.55)';
    g.fillRect(x, 0, 1.6, H);
    g.fillStyle = 'rgba(230,235,240,0.25)';
    g.fillRect(x + 2, 0, 1, H);
  }
  for (let y = 0; y < H; y += H / 5) {
    g.fillStyle = 'rgba(20,22,24,0.7)';
    g.fillRect(0, y, W, 3);
    g.fillStyle = 'rgba(240,244,248,0.4)';
    g.fillRect(0, y + 3, W, 1);
  }
  return finish(c);
}

/**
 * A wayfinding sign: a dark panel, a teal block with a number, the English name and the Japanese
 * name under it. Seen on the end walls and over the platforms.
 */
export function wayfindingSign(num: string, en: string, jp: string, w = 1024, h = 256) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#20262c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f9fb0';
  g.fillRect(h * 0.12, h * 0.12, h * 0.76, h * 0.76);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.font = `700 ${Math.round(h * 0.5)}px Rajdhani, Arial, sans-serif`;
  g.fillText(num, h * 0.5, h * 0.52);
  g.textAlign = 'left';
  g.font = `600 ${Math.round(h * 0.34)}px Rajdhani, Arial, sans-serif`;
  g.fillText(en, h * 1.05, h * 0.36);
  g.fillStyle = '#c9d3da';
  g.font = `500 ${Math.round(h * 0.24)}px "Noto Sans JP", "Hiragino Sans", sans-serif`;
  g.fillText(jp, h * 1.05, h * 0.74);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * The departures board (an emissive map: it lights itself): rows of times, destinations in two
 * scripts, platform numbers, in white and teal on near black.
 */
export function departuresTexture() {
  const W = 1024, H = 512;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#0a0e12';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f9fb0';
  g.fillRect(0, 0, W, 64);
  g.fillStyle = '#ffffff';
  g.font = '700 40px Rajdhani, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('DEPARTURES  出発', 24, 33);
  const rows: [string, string, string, string][] = [
    ['10:12', 'SHIN-OSAKA', '新大阪', '1'], ['10:20', 'NAGOYA', '名古屋', '2'], ['10:24', 'KOFU', '甲府', '1'],
    ['10:31', 'SHINAGAWA', '品川', '2'], ['10:40', 'SHIN-OSAKA', '新大阪', '1'], ['10:48', 'NAGOYA', '名古屋', '2'],
  ];
  rows.forEach(([t, en, jp, p], i) => {
    const y = 108 + i * 66;
    g.fillStyle = i % 2 ? '#0f151b' : '#0c1116';
    g.fillRect(0, y - 30, W, 62);
    g.fillStyle = '#dfe9ef';
    g.font = '600 38px Rajdhani, Arial, sans-serif';
    g.fillText(t, 24, y);
    g.fillText(en, 170, y);
    g.fillStyle = '#9fb3bf';
    g.font = '500 32px "Noto Sans JP", "Hiragino Sans", sans-serif';
    g.fillText(jp, 520, y);
    g.fillStyle = '#4fd3e0';
    g.font = '700 38px Rajdhani, Arial, sans-serif';
    g.fillText(p, 900, y);
  });
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Office towers beyond the glass: a curtain wall of blue-grey glass and white spandrels, each floor
 * 3.6 m, mullions every 1.5 m (one tile = 12 m wide by 4 floors), some panes catching the sky.
 */
export function towerTexture(seed = 0) {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1810 + seed);
  g.fillStyle = '#dfe3e6';
  g.fillRect(0, 0, S, S);
  const fl = S / 4, cols = 8, cw = S / cols;
  for (let f = 0; f < 4; f++) for (let i = 0; i < cols; i++) {
    const k = rnd();
    g.fillStyle = k < 0.15 ? '#a9c2d4' : k < 0.5 ? '#7f97a8' : '#6b8292';
    g.fillRect(i * cw + 1.5, f * fl + fl * 0.22, cw - 3, fl * 0.74);
  }
  return finish(c);
}
