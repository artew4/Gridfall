import * as THREE from 'three';
import { mulberry32 } from '../core/math';

export const JP_FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","YuGothic","Noto Sans JP","Noto Sans CJK JP","Meiryo","MS Gothic",sans-serif';
export const JP_SERIF = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","MS Mincho",serif';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, rnd: () => number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] = base[0] + n;
    d[i + 1] = base[1] + n;
    d[i + 2] = base[2] + n;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Streaks of grime running down from window sills, the signature of old rainy concrete. */
function grime(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, count: number) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 40 + rnd() * 200;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, `rgba(0,0,0,${0.15 + rnd() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2 + rnd() * 6, len);
  }
}

export interface FacadeTex {
  map: THREE.Texture;
  emissive: THREE.Texture;
}

/** One facade tile = 16m x 16m, five floors of 3.2m. */
export function facadeTexture(variant: number): FacadeTex {
  const S = 1024;
  const rnd = mulberry32(100 + variant * 17);
  const { c, ctx } = canvas(S, S);
  const { c: ec, ctx: ectx } = canvas(S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);

  const bases: [number, number, number][] = [
    [62, 60, 64],
    [38, 40, 48],
    [70, 58, 52],
  ];
  noiseFill(ctx, S, S, bases[variant % 3], 18, rnd);

  const px = S / 16; // pixels per metre
  const floorH = 3.2 * px;
  // Panel seams / tiles.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let y = 0; y < S; y += floorH) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y + 6, S, 2);
  }
  if (variant === 1) {
    for (let x = 0; x < S; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
    }
  }

  const warm = ['#ffcf8a', '#ffd9a0', '#ffe2b8', '#f6b36b'];
  const cool = ['#9fd8ff', '#b8c8ff', '#7fe0ff'];
  const cols = variant === 1 ? 4 : 8;
  const colW = S / cols;
  for (let f = 0; f < 5; f++) {
    const y0 = f * floorH;
    for (let i = 0; i < cols; i++) {
      const winW = variant === 1 ? colW * 0.86 : colW * (0.42 + rnd() * 0.12);
      const winH = floorH * (variant === 1 ? 0.42 : 0.5);
      const x = i * colW + (colW - winW) / 2;
      const y = y0 + floorH * 0.22;
      // Frame.
      ctx.fillStyle = 'rgba(20,20,24,0.9)';
      ctx.fillRect(x - 4, y - 4, winW + 8, winH + 8);
      const r = rnd();
      let fill = '#0b0d14';
      let lit = false;
      if (r < 0.16) {
        fill = warm[Math.floor(rnd() * warm.length)];
        lit = true;
      } else if (r < 0.22) {
        fill = cool[Math.floor(rnd() * cool.length)];
        lit = true;
      } else if (r < 0.26) {
        fill = '#ff7aa8';
        lit = true;
      }
      // Glass with a subtle reflection gradient.
      const g = ctx.createLinearGradient(x, y, x + winW, y + winH);
      g.addColorStop(0, lit ? fill : '#151a26');
      g.addColorStop(1, lit ? fill : '#07080c');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, winW, winH);
      if (lit) {
        const intensity = 0.35 + rnd() * 0.65;
        ectx.globalAlpha = intensity;
        ectx.fillStyle = fill;
        ectx.fillRect(x, y, winW, winH);
        // Blinds / silhouettes inside.
        const blinds = rnd() < 0.5;
        ectx.globalAlpha = 1;
        if (blinds) {
          ectx.fillStyle = 'rgba(0,0,0,0.45)';
          for (let b = y; b < y + winH; b += 7) ectx.fillRect(x, b, winW, 3);
        } else if (rnd() < 0.4) {
          ectx.fillStyle = 'rgba(0,0,0,0.7)';
          ectx.fillRect(x + winW * rnd() * 0.6, y + winH * 0.35, winW * 0.18, winH * 0.65);
        }
      } else if (rnd() < 0.5) {
        // Curtains in dark windows.
        ctx.fillStyle = 'rgba(60,50,60,0.5)';
        ctx.fillRect(x, y, winW * 0.3, winH);
      }
      // Mullion.
      ctx.fillStyle = 'rgba(25,25,30,1)';
      ctx.fillRect(x + winW / 2 - 2, y, 4, winH);
      // Sill.
      ctx.fillStyle = 'rgba(120,120,125,0.35)';
      ctx.fillRect(x - 6, y + winH + 4, winW + 12, 5);

      // AC unit hanging under some windows (painted, cheap detail).
      if (variant !== 1 && rnd() < 0.3) {
        const ax = x + rnd() * (winW - 48);
        const ay = y + winH + 16;
        ctx.fillStyle = '#b9b7ad';
        ctx.fillRect(ax, ay, 52, 30);
        ctx.fillStyle = '#5a5a58';
        ctx.beginPath();
        ctx.arc(ax + 34, ay + 15, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  grime(ctx, S, S, rnd, 160);
  return { map: tex(c, true, true), emissive: tex(ec, true, true) };
}

export interface StorefrontTex {
  map: THREE.Texture;
  emissive: THREE.Texture | null;
}

/** Ground-floor shop fronts, 4m wide x 4m tall. */
export function storefrontTexture(kind: 'shutter' | 'shop' | 'izakaya' | 'door'): StorefrontTex {
  const W = 512;
  const H = 512;
  const rnd = mulberry32(kind.length * 991);
  const { c, ctx } = canvas(W, H);
  const { c: ec, ctx: ectx } = canvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  let emissive = false;

  // Fascia band at top.
  ctx.fillStyle = '#1b1a1f';
  ctx.fillRect(0, 0, W, H);

  if (kind === 'shutter') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5a5c62');
    g.addColorStop(1, '#3b3d42');
    ctx.fillStyle = g;
    ctx.fillRect(24, 90, W - 48, H - 90);
    for (let y = 90; y < H; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(24, y, W - 48, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(24, y + 3, W - 48, 2);
    }
    // Graffiti tags.
    ctx.font = `bold 64px ${JP_FONT}`;
    ctx.fillStyle = 'rgba(220,60,140,0.55)';
    ctx.save();
    ctx.translate(120, 330);
    ctx.rotate(-0.12);
    ctx.fillText('夜猫', 0, 0);
    ctx.restore();
    ctx.strokeStyle = 'rgba(80,220,230,0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(300, 400);
    ctx.bezierCurveTo(340, 340, 400, 460, 450, 380);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,240,240,0.5)';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('RAIN//ZERO', 260, 470);
  } else if (kind === 'shop') {
    emissive = true;
    // Lit interior seen through glass.
    const g = ctx.createLinearGradient(0, 100, 0, H);
    g.addColorStop(0, '#e9f2ff');
    g.addColorStop(1, '#a7b8d0');
    ctx.fillStyle = g;
    ctx.fillRect(30, 100, W - 60, H - 130);
    for (let sy = 140; sy < H - 60; sy += 70) {
      ctx.fillStyle = '#555c6a';
      ctx.fillRect(40, sy + 46, W - 80, 6);
      for (let sx = 44; sx < W - 50; sx += 22) {
        ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)},60%,${45 + rnd() * 25}%)`;
        ctx.fillRect(sx, sy + 10 + rnd() * 10, 16, 36);
      }
    }
    ctx.fillStyle = 'rgba(30,30,40,0.9)';
    ctx.fillRect(W / 2 - 4, 100, 8, H - 130);
    ectx.drawImage(c, 0, 0);
    ectx.fillStyle = 'rgba(0,0,0,0.35)';
    ectx.fillRect(0, 0, W, H);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, 100);
  } else if (kind === 'izakaya') {
    emissive = true;
    // Warm wooden slats and glowing shoji panels.
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(0, 80, W, H - 80);
    ctx.fillStyle = '#ffcf8f';
    ctx.fillRect(60, 170, W - 120, H - 200);
    ctx.fillStyle = '#4a2c18';
    for (let x = 60; x < W - 60; x += 40) ctx.fillRect(x, 170, 5, H - 200);
    for (let y = 170; y < H - 30; y += 50) ctx.fillRect(60, y, W - 120, 5);
    ectx.fillStyle = '#d48a3a';
    ectx.fillRect(60, 170, W - 120, H - 200);
    ectx.fillStyle = '#000';
    for (let x = 60; x < W - 60; x += 40) ectx.fillRect(x, 170, 5, H - 200);
    for (let y = 170; y < H - 30; y += 50) ectx.fillRect(60, y, W - 120, 5);
    // Noren curtain.
    const nc = ['#1d2a5a', '#1d2a5a', '#1d2a5a', '#1d2a5a'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = nc[i];
      ctx.fillRect(70 + i * 95, 90, 88, 150);
    }
    ctx.fillStyle = '#f2ead8';
    ctx.font = `bold 72px ${JP_SERIF}`;
    ctx.textAlign = 'center';
    ['居', '酒', '屋', '灯'].forEach((ch, i) => ctx.fillText(ch, 114 + i * 95, 190));
    ectx.fillStyle = '#000';
    ectx.fillRect(70, 90, 4 * 95, 150);
  } else {
    // Dark doorway with stairs lit by a cold tube.
    ctx.fillStyle = '#26262c';
    ctx.fillRect(0, 60, W, H);
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(150, 120, 210, H - 120);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(150,200,220,${0.05 + i * 0.03})`;
      ctx.fillRect(160, 160 + i * 40, 190, 10);
    }
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(170, 128, 170, 6);
    ectx.fillStyle = '#9cc8ff';
    ectx.fillRect(170, 128, 170, 6);
    for (let i = 0; i < 8; i++) {
      ectx.fillStyle = `rgba(80,130,160,${0.04 + i * 0.025})`;
      ectx.fillRect(160, 160 + i * 40, 190, 10);
    }
    emissive = true;
    // Mailboxes and stickers.
    ctx.fillStyle = '#6a6a6e';
    ctx.fillRect(400, 200, 80, 120);
    ctx.fillStyle = '#222';
    for (let i = 0; i < 4; i++) ctx.fillRect(408, 210 + i * 28, 64, 4);
  }
  // Fascia sign strip / dirt.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, 12);
  grime(ctx, W, H, rnd, 25);
  return { map: tex(c), emissive: emissive ? tex(ec) : null };
}

export type SignStyle = 'neon' | 'box';

export interface SignOpts {
  text: string;
  vertical: boolean;
  color: string;
  style: SignStyle;
  sub?: string;
  bg?: string;
  textColor?: string;
}

/** Neon tube or backlit box signs. Returns the texture and its aspect (w/h). */
export function signTexture(o: SignOpts): THREE.Texture {
  const chars = [...o.text];
  const cell = 200;
  const W = o.vertical ? 256 : Math.max(256, chars.length * cell + 120);
  const H = o.vertical ? chars.length * cell + 120 : 256;
  const { c, ctx } = canvas(W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (o.style === 'box') {
    ctx.fillStyle = o.bg ?? o.color;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, W - 14, H - 14);
    ctx.fillStyle = o.textColor ?? '#111';
    ctx.font = `bold 170px ${JP_FONT}`;
    chars.forEach((ch, i) => {
      const x = o.vertical ? W / 2 : 60 + cell * i + cell / 2;
      const y = o.vertical ? 60 + cell * i + cell / 2 : H / 2 + 6;
      ctx.fillText(ch, x, y);
    });
  } else {
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.font = `bold 160px ${JP_FONT}`;
    const draw = (blur: number, color: string, width: number, alpha: number) => {
      ctx.save();
      ctx.shadowColor = o.color;
      ctx.shadowBlur = blur;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round';
      chars.forEach((ch, i) => {
        const x = o.vertical ? W / 2 : 60 + cell * i + cell / 2;
        const y = o.vertical ? 60 + cell * i + cell / 2 : H / 2 + 6;
        ctx.strokeText(ch, x, y);
      });
      ctx.restore();
    };
    draw(40, o.color, 16, 0.6);
    draw(16, o.color, 9, 1);
    draw(4, '#ffffff', 3, 0.9);
    // Neon border tube.
    ctx.save();
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.restore();
  }
  const t = tex(c);
  t.userData.aspect = W / H;
  return t;
}

export function asphaltTexture(): THREE.Texture {
  const S = 1024;
  const rnd = mulberry32(7);
  const { c, ctx } = canvas(S, S);
  noiseFill(ctx, S, S, [38, 38, 42], 26, rnd);
  // Aggregate speckles.
  for (let i = 0; i < 9000; i++) {
    const v = 30 + rnd() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // Repair patches.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${18 + rnd() * 10},${18 + rnd() * 10},${22 + rnd() * 10},0.55)`;
    ctx.fillRect(rnd() * S, rnd() * S, 80 + rnd() * 200, 60 + rnd() * 160);
  }
  // Cracks.
  ctx.strokeStyle = 'rgba(8,8,10,0.8)';
  for (let i = 0; i < 26; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += (rnd() - 0.5) * 50;
      y += (rnd() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = tex(c, true, true);
  return t;
}

export function concreteTexture(): THREE.Texture {
  const S = 512;
  const rnd = mulberry32(31);
  const { c, ctx } = canvas(S, S);
  noiseFill(ctx, S, S, [70, 70, 74], 22, rnd);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= S; i += S / 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
  }
  grime(ctx, S, S, rnd, 30);
  return tex(c, true, true);
}

export function glowTexture(): THREE.Texture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, false);
}

export function smokeTexture(): THREE.Texture {
  const S = 128;
  const rnd = mulberry32(5);
  const { c, ctx } = canvas(S, S);
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + (rnd() - 0.5) * S * 0.45;
    const y = S / 2 + (rnd() - 0.5) * S * 0.45;
    const r = 10 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return tex(c, false);
}

export function flashTexture(): THREE.Texture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(S * 0.5, 0);
    ctx.lineTo(0, 5);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.22, 0, Math.PI * 2);
  ctx.fill();
  return tex(c, false);
}

export function vendingTexture(theme: 'red' | 'white'): THREE.Texture {
  const W = 256;
  const H = 512;
  const rnd = mulberry32(theme === 'red' ? 3 : 4);
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = theme === 'red' ? '#c4142c' : '#e8ecf0';
  ctx.fillRect(0, 0, W, H);
  // Display window with drinks.
  ctx.fillStyle = '#f4fbff';
  ctx.fillRect(16, 20, W - 32, 290);
  for (let row = 0; row < 4; row++) {
    const y = 34 + row * 70;
    for (let i = 0; i < 6; i++) {
      const x = 26 + i * 36;
      const hue = Math.floor(rnd() * 360);
      ctx.fillStyle = `hsl(${hue},70%,50%)`;
      ctx.fillRect(x, y + 6, 26, 46);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x + 4, y + 10, 5, 36);
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 6, y, 14, 7);
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(x + 2, y + 56, 22, 6);
    }
  }
  ctx.fillStyle = theme === 'red' ? '#fff' : '#1a4fa0';
  ctx.font = `bold 34px ${JP_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(theme === 'red' ? 'つめた〜い' : 'あったか〜い', W / 2, 352);
  ctx.fillStyle = '#222';
  ctx.fillRect(30, 380, 120, 60);
  ctx.fillStyle = '#7cf';
  ctx.fillRect(170, 385, 50, 22);
  ctx.fillStyle = '#111';
  ctx.fillRect(40, 460, W - 80, 36);
  return tex(c);
}

export function lanternTexture(ch: string): THREE.Texture {
  const W = 256;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#e8261c';
  ctx.fillRect(0, 0, W, H);
  // Ribs.
  ctx.fillStyle = 'rgba(80,0,0,0.35)';
  for (let y = 0; y < H; y += 14) ctx.fillRect(0, y, W, 3);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, 22);
  ctx.fillRect(0, H - 22, W, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111';
  // The lathe wraps U around the full circumference, so squeeze glyphs to stay legible.
  ctx.font = `bold ${ch.length > 1 ? 52 : 92}px ${JP_SERIF}`;
  ctx.fillText(ch, W / 4, H / 2);
  ctx.fillText(ch, (3 * W) / 4, H / 2);
  return tex(c);
}

export function grilleTexture(): THREE.Texture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#9d9c95';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#4c4c4a';
  ctx.beginPath();
  ctx.arc(S * 0.62, S / 2, S * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(S * 0.32 + i * 8, S * 0.22);
    ctx.lineTo(S * 0.32 + i * 8, S * 0.78);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, S - 10, S, 10);
  return tex(c);
}

export function skylineTexture(seed: number, layers: number): { map: THREE.Texture } {
  const W = 2048;
  const H = 512;
  const rnd = mulberry32(seed);
  const { c, ctx } = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  for (let l = 0; l < layers; l++) {
    let x = 0;
    while (x < W) {
      const bw = 40 + rnd() * 140;
      const bh = 120 + rnd() * (H - 160) * (l === 0 ? 1 : 0.7);
      const top = H - bh;
      const shade = 10 + l * 6;
      ctx.fillStyle = `rgb(${shade},${shade},${shade + 10})`;
      ctx.fillRect(x, top, bw, bh);
      // Tiny lit windows.
      for (let wy = top + 8; wy < H - 4; wy += 9) {
        for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
          if (rnd() < 0.09) {
            const warm = rnd() < 0.6;
            ctx.fillStyle = warm ? `rgba(255,200,140,${0.4 + rnd() * 0.5})` : `rgba(160,210,255,${0.4 + rnd() * 0.5})`;
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      // Rooftop red aviation lights.
      if (rnd() < 0.3) {
        ctx.fillStyle = '#ff2020';
        ctx.fillRect(x + bw / 2 - 2, top - 4, 4, 4);
      }
      // Occasional billboard on rooftops.
      if (l === 0 && rnd() < 0.12) {
        const hue = [320, 190, 280, 20][Math.floor(rnd() * 4)];
        ctx.fillStyle = `hsl(${hue},90%,55%)`;
        ctx.fillRect(x + 6, top + 10, bw - 12, 26);
      }
      x += bw + rnd() * 10;
    }
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return { map: t };
}

export function roadMarkTexture(): THREE.Texture {
  const W = 512;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(235,235,230,0.85)';
  ctx.font = `bold 200px ${JP_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.scale(1, 1.2);
  ctx.fillText('止まれ', W / 2, H / 2 / 1.2 + 6);
  ctx.restore();
  // Worn paint.
  const rnd = mulberry32(9);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.8})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  return tex(c);
}

/** Small canvas for the gun's ammo display, redrawn on change. */
export function makeAmmoDisplay() {
  const { c, ctx } = canvas(128, 64);
  const t = tex(c);
  const draw = (ammo: number, max: number, reloading: boolean) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = ammo <= 3 ? '#ff4060' : '#5ff3ff';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reloading ? '--' : String(ammo).padStart(2, '0'), 64, 30);
    for (let i = 0; i < max; i++) {
      ctx.globalAlpha = i < ammo ? 1 : 0.15;
      ctx.fillRect(10 + i * 9.2, 54, 6, 6);
    }
    ctx.globalAlpha = 1;
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

/** Small, heavily blurred copy of a sign texture: reflections on wet asphalt should read as colour, not text. */
export function blurredCopy(t: THREE.Texture, blur = 10): THREE.Texture {
  const src = t.image as HTMLCanvasElement;
  const w = Math.max(16, Math.round(src.width / 4));
  const h = Math.max(16, Math.round(src.height / 4));
  const { c, ctx } = canvas(w, h);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.filter = 'none';
  return tex(c);
}
