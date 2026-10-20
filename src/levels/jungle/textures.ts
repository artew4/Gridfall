import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/** Procedural textures for the jungle (canvas, tiling, sRGB). Each call makes a new texture. */

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

/** A soft blob drawn on every side of a tile, so the texture wraps without seams. */
function blob(g: CanvasRenderingContext2D, S: number, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)') {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
    const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
}

/** Forest floor: dark wet soil under a litter of fallen leaves, twigs and moss patches. */
export function litterTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(21);
  g.fillStyle = '#3a2f20';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) blob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 60, rnd() < 0.5 ? 'rgba(60,78,30,0.35)' : 'rgba(25,20,12,0.35)');
  const leafCols = ['#4a3a20', '#56422a', '#40321c', '#5a5230', '#36401f', '#5e4426'];
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 7, w = l * (0.35 + rnd() * 0.2), a = rnd() * Math.PI;
    g.fillStyle = leafCols[Math.floor(rnd() * leafCols.length)];
    g.globalAlpha = 0.35 + rnd() * 0.35;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -20 || x + dx > S + 20 || y + dy < -20 || y + dy > S + 20) continue;
      g.beginPath();
      g.ellipse(x + dx, y + dy, l, w, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(40,30,18,0.7)';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 10 + rnd() * 30;
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return finish(c);
}

/**
 * Ancient stone blocks: courses of cut stone with dark joints, weathering, and moss creeping in from
 * the joints and spreading over the upper faces (v runs up the wall: more moss at the bottom of each
 * block row where water collects). `moss` 0..1 scales the cover.
 */
export function stoneTexture(moss = 0.5, base = '#7d786a') {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(33 + Math.round(moss * 10));
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const rows = 4;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.6 : 0;
    while (x < S) {
      const w = rh * (1.1 + rnd() * 0.9);
      const tone = 0.85 + rnd() * 0.25;
      g.fillStyle = `rgba(${Math.round(125 * tone)},${Math.round(120 * tone)},${Math.round(104 * tone)},1)`;
      g.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
      // A wrapped copy for the seam.
      if (x + w > S) g.fillRect(x + 3 - S, r * rh + 3, w - 6, rh - 6);
      // Chips and weathering inside the block.
      for (let k = 0; k < 6; k++) blob(g, S, x + rnd() * w, r * rh + rnd() * rh, 6 + rnd() * 20, `rgba(${rnd() < 0.5 ? '60,58,48' : '170,165,148'},0.25)`);
      x += w;
    }
  }
  // Moss: many small, faint tufts that build up along the joints (where water sits) and in a few
  // broad patches, rather than a few big round spots.
  const n = Math.round(1400 * moss);
  const patches = Array.from({ length: 5 }, () => [rnd() * S, rnd() * S, 60 + rnd() * 90]);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(rnd() * rows);
    let x = rnd() * S, y = r * rh + (rnd() < 0.55 ? rh - 2 - rnd() * rnd() * 30 : rnd() * rh);
    if (rnd() < 0.35) {
      const [px, py, pr] = patches[Math.floor(rnd() * patches.length)];
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * pr;
      x = px + Math.cos(a) * d;
      y = py + Math.sin(a) * d;
    }
    blob(g, S, x, y, 2 + rnd() * rnd() * 16, `rgba(${55 + Math.floor(rnd() * 35)},${80 + Math.floor(rnd() * 45)},${26 + Math.floor(rnd() * 20)},${0.25 + rnd() * 0.35})`);
  }
  // Speckle.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(220,215,195,0.18)' : 'rgba(30,30,22,0.22)';
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return finish(c);
}

/** Bark: long vertical ridges and furrows, lichen spots (u around the trunk, v up it). */
export function barkTexture(base = '#4e4232') {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(41);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S;
    const w = 2 + rnd() * 6;
    g.fillStyle = rnd() < 0.5 ? 'rgba(25,20,14,0.5)' : 'rgba(130,115,90,0.25)';
    g.beginPath();
    g.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= S; y += 16) {
      xx += (rnd() - 0.5) * 4;
      g.lineTo(xx, y);
    }
    g.lineTo(xx + w, S);
    for (let y = S; y >= 0; y -= 16) g.lineTo(x + w + (rnd() - 0.5) * 3, y);
    g.fill();
  }
  for (let i = 0; i < 40; i++) blob(g, S, rnd() * S, rnd() * S, 4 + rnd() * 14, rnd() < 0.7 ? 'rgba(110,140,70,0.55)' : 'rgba(170,175,140,0.45)');
  return finish(c);
}

/** Dark wet rock for the boundary walls: strata lines, streaks of moss and water stains. */
export function rockTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(51);
  g.fillStyle = '#4c4a40';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    const k = Math.sin(y * 0.07) * 0.5 + Math.sin(y * 0.23 + 1) * 0.3;
    g.fillStyle = k > 0 ? `rgba(120,115,98,${0.12 * k})` : `rgba(20,20,15,${-0.18 * k})`;
    g.fillRect(0, y, S, 4);
  }
  for (let i = 0; i < 80; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 50, rnd() < 0.55 ? 'rgba(58,84,30,0.55)' : 'rgba(20,22,16,0.4)');
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S;
    const grd = g.createLinearGradient(0, S, 0, S * 0.3);
    grd.addColorStop(0, 'rgba(20,24,14,0.35)');
    grd.addColorStop(1, 'rgba(20,24,14,0)');
    g.fillStyle = grd;
    g.fillRect(x, S * 0.3, 3 + rnd() * 10, S * 0.7);
  }
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(200,195,175,0.12)' : 'rgba(10,10,8,0.2)';
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return finish(c);
}

/** Weathered timber (the dig camp): grain, knots, grime. */
export function plankTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(61);
  g.fillStyle = '#6b5638';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,18' : '150,125,90'},${0.05 + rnd() * 0.1})`;
    g.fillRect(0, y, S, 2);
  }
  for (let x = 0; x < S; x += 64) {
    g.fillStyle = 'rgba(25,18,10,0.6)';
    g.fillRect(x, 0, 2, S);
  }
  for (let i = 0; i < 10; i++) blob(g, S, rnd() * S, rnd() * S, 3 + rnd() * 5, 'rgba(40,28,15,0.8)');
  for (let i = 0; i < 20; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 30, 'rgba(40,55,25,0.25)');
  return finish(c);
}

/** Olive tarp canvas (the camp). */
export function tarpTexture(color = '#4f5634') {
  const S = 128;
  const { c, g } = canvas(S);
  const rnd = mulberry32(71);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(i, 0, 1, S);
    g.fillRect(0, i, S, 1);
  }
  for (let i = 0; i < 12; i++) blob(g, S, rnd() * S, rnd() * S, 8 + rnd() * 24, 'rgba(30,25,15,0.25)');
  return finish(c);
}

/**
 * The light that gets through the canopy: a field of soft bright gaps on black, used as the sun's
 * projected texture (a light cookie). Linear, not sRGB: it is a light intensity mask.
 */
export function dappleTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(81);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  // Big glades, medium gaps, many small flecks.
  for (const [n, r0, r1, a] of [[10, 40, 90, 0.55], [70, 12, 30, 0.75], [420, 2, 7, 0.9]] as const) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
      // Leaf gaps are irregular: three overlapping blobs.
      for (let k = 0; k < 3; k++) blob(g, S, x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, r * (0.5 + rnd() * 0.5), `rgba(255,250,225,${a})`);
    }
  }
  // Projected once over the whole map by the light (not tiled).
  const t = finish(c, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Drifting mist: soft tiling noise in the alpha (greyscale; the shader tints it). */
export function mistTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(91);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) blob(g, S, rnd() * S, rnd() * S, 18 + rnd() * 50, `rgba(255,255,255,${0.12 + rnd() * 0.18})`);
  return finish(c, false);
}

/**
 * Cast concrete (the base's T-walls, bunkers and buildings): panel joints every `panel` of the tile,
 * form-tie holes, rain streaks down from the top, and green-black mould creeping up from the
 * foot (v = 0 is the bottom of a wall with world-scaled UVs, so the mould sits at the ground).
 */
export function concreteTexture(base = '#7d7f76', panels = 2) {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(101 + panels);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) blob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 70, rnd() < 0.5 ? 'rgba(255,255,240,0.07)' : 'rgba(20,22,18,0.1)');
  // Streaks from the top, mould at the foot.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, w = 2 + rnd() * 8, l = S * (0.15 + rnd() * 0.5);
    const grd = g.createLinearGradient(0, 0, 0, l);
    grd.addColorStop(0, 'rgba(30,32,26,0.28)');
    grd.addColorStop(1, 'rgba(30,32,26,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, l);
  }
  for (let i = 0; i < 160; i++) blob(g, S, rnd() * S, S - rnd() * S * 0.22, 6 + rnd() * 22, rnd() < 0.6 ? 'rgba(45,62,30,0.35)' : 'rgba(18,22,14,0.3)');
  g.fillStyle = 'rgba(15,16,13,0.65)';
  for (let k = 0; k < panels; k++) g.fillRect((k * S) / panels, 0, 3, S);
  g.fillRect(0, S - 3, S, 3);
  g.fillStyle = 'rgba(15,16,13,0.5)';
  for (let k = 0; k < panels; k++) for (const y of [0.25, 0.75]) for (const x of [0.25, 0.75]) {
    g.beginPath();
    g.arc(((k + x) * S) / panels, y * S, 4, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(230,230,215,0.1)' : 'rgba(10,10,8,0.16)';
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return finish(c);
}

/** Painted steel plate (gate leaves, vehicle bodies, containers): ribs, rust bleeding from seams. */
export function steelTexture(paint = '#4b5235', ribs = 8) {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(111 + ribs);
  g.fillStyle = paint;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < ribs; k++) {
    const x = (k * S) / ribs;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(255,255,230,0.08)';
    g.fillRect(x + 3, 0, 2, S);
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, l = 10 + rnd() * 60;
    const grd = g.createLinearGradient(0, 0, 0, l);
    grd.addColorStop(0, 'rgba(110,55,25,0.5)');
    grd.addColorStop(1, 'rgba(110,55,25,0)');
    g.fillStyle = grd;
    g.fillRect(x, rnd() * S, 2 + rnd() * 4, l);
  }
  for (let i = 0; i < 20; i++) blob(g, S, rnd() * S, rnd() * S, 8 + rnd() * 26, 'rgba(20,20,15,0.22)');
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(240,240,220,0.07)' : 'rgba(0,0,0,0.14)';
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return finish(c);
}

/** The compound's ground: compacted laterite and gravel, puddles, tyre-worn darker patches. */
export function gravelTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(121);
  g.fillStyle = '#6e5a44';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) blob(g, S, rnd() * S, rnd() * S, 20 + rnd() * 70, rnd() < 0.5 ? 'rgba(130,90,60,0.25)' : 'rgba(40,34,26,0.3)');
  for (let i = 0; i < 9000; i++) {
    const r = 1 + rnd() * 2.4;
    g.fillStyle = ['#8a8070', '#5e584c', '#9b8f7a', '#4a443a', '#7a5a40'][Math.floor(rnd() * 5)];
    g.globalAlpha = 0.5 + rnd() * 0.4;
    g.fillRect(rnd() * S, rnd() * S, r, r * (0.6 + rnd() * 0.6));
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 10; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 30, 'rgba(30,38,34,0.45)');
  return finish(c);
}

/** The approach road: two wheel ruts of red mud through a grassy, leaf-strewn crown (u across, v along). */
export function roadTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(131);
  g.fillStyle = '#5c4630';
  g.fillRect(0, 0, S, S);
  const band = (x0: number, x1: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x0 * S, 0, (x1 - x0) * S, S);
  };
  band(0, 0.12, 'rgba(45,58,28,0.8)');
  band(0.88, 1, 'rgba(45,58,28,0.8)');
  band(0.42, 0.58, 'rgba(55,66,32,0.6)');
  band(0.17, 0.36, 'rgba(70,40,24,0.45)');
  band(0.64, 0.83, 'rgba(70,40,24,0.45)');
  for (let i = 0; i < 30; i++) blob(g, S, rnd() * S, rnd() * S, 6 + rnd() * 20, rnd() < 0.5 ? 'rgba(25,30,28,0.4)' : 'rgba(110,80,50,0.25)');
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = ['#4a3a20', '#56422a', '#36401f'][Math.floor(rnd() * 3)];
    g.globalAlpha = 0.3 + rnd() * 0.3;
    const x = rnd() < 0.5 ? rnd() * 0.15 * S : S - rnd() * 0.15 * S;
    g.fillRect(rnd() < 0.7 ? x : rnd() * S, rnd() * S, 2 + rnd() * 4, 1.5 + rnd() * 2);
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** A helipad marking: white H in a circle on a dark painted square (one decal, not tiled). */
export function helipadTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  g.fillStyle = '#3b3d36';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#d8d6c8';
  g.lineWidth = 22;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#d8d6c8';
  g.fillRect(S * 0.33, S * 0.27, S * 0.07, S * 0.46);
  g.fillRect(S * 0.6, S * 0.27, S * 0.07, S * 0.46);
  g.fillRect(S * 0.33, S * 0.465, S * 0.34, S * 0.07);
  const rnd = mulberry32(141);
  for (let i = 0; i < 40; i++) blob(g, S, rnd() * S, rnd() * S, 10 + rnd() * 40, rnd() < 0.5 ? 'rgba(20,20,15,0.35)' : 'rgba(80,70,50,0.25)');
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
