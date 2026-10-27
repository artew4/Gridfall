import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { JP_FONT } from './Textures';
import type { Room } from './Interiors';

/*
  78.0, the storefronts' own faces (docs/TOKYO_PLAN.md, step 1): a lightbox sign for every shop (no two
  alike: a name from its trade's list in its trade's colours), the tenant directories by the building
  doors, the izakaya's noren, the shutters' graffiti. Atlases painted once; a face's UVs pick its cell.
*/

export type SignTrade = Room | 'building' | 'closed';

/** Names by trade (made up: no real chain's). */
const NAMES: Record<SignTrade, string[]> = {
  konbini: ['ヨルマート', 'ミドリマート', 'デイリー夜光', 'ホシノマート', 'ルナストア', 'まちかど24'],
  drugstore: ['さくら薬局', 'くすりの青葉', 'ドラッグ ミナト', '健康堂', 'ハート薬局'],
  electronics: ['ネオン電機', 'デンキの雷', 'カメラの光', 'ゲーム 電脳', 'スマホ修理 速'],
  boutique: ['古着 ラビット', 'ATELIER 霧', 'SELECT 月', 'ブティック 蝶', 'VINTAGE 波'],
  cafe: ['喫茶 霧', '珈琲 黒猫', 'CAFÉ 雨音', '純喫茶 星', 'TEA 月見'],
  books: ['月光書房', '古書 雨宿り', '書店 森', 'マンガ倉庫', '本の灯'],
  izakaya: ['居酒屋 赤提灯', '炉端 夜風', '鳥吉', '酒処 燈', '大衆酒場 まる', '串焼 炎', 'おでん 雪'],
  ramen: ['麺屋 雷', 'らーめん 一番星', '中華そば 灯', 'つけ麺 渦', '餃子 王'],
  lobby: ['第二星野ビル', '夜光ビル', 'ミナトハイツ', '霧ヶ丘ビル', '月見ビル'],
  building: ['第二星野ビル', '夜光ビル', 'ミナトハイツ', '霧ヶ丘ビル', '月見ビル', '東雲ビル', 'NEON PLAZA'],
  closed: ['質 金城', '不動産 東', 'クリーニング白鳥', '花 椿', '時計 秒', 'メガネの光', '麻雀 東風', 'スナック 蝶', '理容 青', 'たばこ', '酒の大黒', '米 よしだ'],
};

/** Colours by trade: [background, text, accent]. */
const STYLE: Record<SignTrade, [string, string, string][]> = {
  konbini: [['#ffffff', '#1a8f3c', '#f08a00'], ['#ffffff', '#1d4fb8', '#e8231c'], ['#f6f6f2', '#d4006a', '#2aa84a']],
  drugstore: [['#1b9a4e', '#ffffff', '#ffe600'], ['#ffe600', '#1a3f8f', '#e8231c']],
  electronics: [['#0a0a0e', '#ffe600', '#e8003c'], ['#e8003c', '#ffffff', '#ffe600']],
  boutique: [['#111111', '#f0e6d0', '#c8a060'], ['#efe6d6', '#222222', '#a07040']],
  cafe: [['#3a2416', '#f3e2c0', '#c89050'], ['#1e2a22', '#efe6d0', '#c8a060']],
  books: [['#1f3d6b', '#ffffff', '#ffd860'], ['#f2ead8', '#1a1a1a', '#b02a20']],
  izakaya: [['#2a1a10', '#ffffff', '#d4281c'], ['#f2e6c8', '#1a1410', '#c0281e'], ['#c0281e', '#ffffff', '#1a1410']],
  ramen: [['#d4281c', '#fff3c0', '#1a1410'], ['#ffd400', '#c0281e', '#1a1410']],
  lobby: [['#1c1e24', '#e6e6ea', '#8a9098']],
  building: [['#1c1e24', '#e6e6ea', '#8a9098'], ['#d8d4cc', '#2a2c30', '#6a6e74']],
  closed: [['#d8d2c4', '#4a4a4a', '#8a2a20'], ['#2a5a8a', '#e8e8e8', '#ffffff'], ['#6a1e1e', '#f0e0c0', '#ffffff'], ['#e8e2d0', '#1a3a6a', '#c02820']],
};

const COLS = 4, ROWS = 21, CW = 512, CH = 96;
let signAtlas: THREE.CanvasTexture | null = null;
const cells: { trade: SignTrade; name: string }[] = [];

function paint() {
  const c = document.createElement('canvas');
  c.width = COLS * CW;
  c.height = 2048;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(7808);
  const order: SignTrade[] = ['konbini', 'drugstore', 'electronics', 'boutique', 'cafe', 'books', 'izakaya', 'ramen', 'building', 'closed'];
  for (const trade of order) {
    NAMES[trade].forEach((name, i) => {
      const k = cells.length;
      if (k >= COLS * ROWS) return;
      cells.push({ trade, name });
      const x = (k % COLS) * CW, y = Math.floor(k / COLS) * CH;
      const [bg, fg, ac] = STYLE[trade][i % STYLE[trade].length];
      g.save();
      g.translate(x, y);
      g.fillStyle = bg;
      g.fillRect(0, 0, CW, CH);
      // Each trade's mark: stripes, a circle, a rule.
      if (trade === 'konbini') {
        g.fillStyle = ac;
        g.fillRect(0, CH - 16, CW, 8);
        g.fillStyle = fg;
        g.fillRect(0, CH - 8, CW, 8);
      } else if (trade === 'drugstore' || trade === 'ramen' || trade === 'izakaya') {
        g.fillStyle = ac;
        g.beginPath();
        g.arc(CH * 0.55, CH / 2, CH * 0.34, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = bg;
        g.font = `bold ${CH * 0.4}px ${JP_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(trade === 'drugstore' ? '薬' : trade === 'ramen' ? '麺' : '酒', CH * 0.55, CH / 2 + 2);
      } else {
        g.fillStyle = ac;
        g.fillRect(12, 10, CW - 24, 3);
        g.fillRect(12, CH - 13, CW - 24, 3);
      }
      const left = trade === 'drugstore' || trade === 'ramen' || trade === 'izakaya' ? CH * 1.0 : 16;
      let size = CH * 0.62;
      const weight = trade === 'boutique' || trade === 'cafe' ? '500' : 'bold';
      g.font = `${weight} ${size}px ${JP_FONT}`;
      const w = g.measureText(name).width;
      const room = CW - left - 16;
      if (w > room) size *= room / w;
      g.font = `${weight} ${size}px ${JP_FONT}`;
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, left + room / 2, CH / 2 + 2);
      // Weathering: a little grime at the bottom, a dead patch now and then.
      const grd = g.createLinearGradient(0, CH * 0.6, 0, CH);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = grd;
      g.fillRect(0, 0, CW, CH);
      if (rnd() < 0.2) {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(rnd() * CW * 0.7, 0, CW * 0.15, CH);
      }
      g.restore();
    });
  }
  signAtlas = new THREE.CanvasTexture(c);
  signAtlas.colorSpace = THREE.SRGBColorSpace;
  signAtlas.anisotropy = 8;
}

/** The sign atlas (made once) and its cells' rects in UV (u0, v0, u1, v1). */
export function signs() {
  if (!signAtlas) paint();
  return signAtlas!;
}

/** The next cell of a trade (round its names: `n` is how many of that trade were handed out so far). */
export function signCell(trade: SignTrade, n: number): [number, number, number, number] {
  signs();
  const t = trade === 'lobby' ? 'building' : trade;
  const of = cells.map((c, i) => ({ c, i })).filter((e) => e.c.trade === t);
  const k = of[n % of.length].i;
  const x = (k % COLS) * CW, y = Math.floor(k / COLS) * CH, H = 2048;
  return [x / (COLS * CW), 1 - (y + CH) / H, (x + CW) / (COLS * CW), 1 - y / H];
}

/**
 * 84.0: the light a trade's `n`th lightbox gives (its ground, letters and accent mixed, linear): what it
 * lays in the puddles (ReflectionCatchers). The same cell as `signCell` (no canvas needed).
 */
export function signColour(trade: SignTrade, n: number) {
  const t = trade === 'lobby' ? 'building' : trade;
  const i = n % NAMES[t].length;
  const [bg, fg, ac] = STYLE[t][i % STYLE[t].length].map((c) => new THREE.Color(c));
  return bg.multiplyScalar(0.6).add(fg.multiplyScalar(0.25)).add(ac.multiplyScalar(0.15));
}

/** Planar UVs over a part's bounds (x across, y up), into the rect (u0, v0, u1, v1). */
export function planarInto(geo: THREE.BufferGeometry, r: [number, number, number, number]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeBoundingBox();
  const b = g.boundingBox!, p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const dx = b.max.x - b.min.x || 1, dy = b.max.y - b.min.y || 1;
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = r[0] + ((p.getX(i) - b.min.x) / dx) * (r[2] - r[0]);
    uv[i * 2 + 1] = r[1] + ((p.getY(i) - b.min.y) / dy) * (r[3] - r[1]);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A canvas texture of (w, h) painted by `draw`. */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tenant directories: 2 x 2 boards of floors and their tenants. */
export function directoryTexture() {
  const rnd = mulberry32(7809);
  const tenants = ['スナック 蝶', '麻雀 東風', '整骨院', 'カラオケ 夢', '歯科', '事務所', 'BAR 蒼', '英会話', 'ネイル', '占い', '探偵社', '空室', '雀荘', '美容室', '税理士', '空室'];
  return canvasTex(512, 512, (g) => {
    for (let b = 0; b < 4; b++) {
      const ox = (b % 2) * 256, oy = Math.floor(b / 2) * 256;
      g.fillStyle = '#10141c';
      g.fillRect(ox, oy, 256, 256);
      for (let f = 0; f < 6; f++) {
        const y = oy + 12 + f * 40;
        g.fillStyle = rnd() < 0.85 ? '#f2f0e8' : '#ffd860';
        g.fillRect(ox + 10, y, 236, 32);
        g.fillStyle = '#1a1c22';
        g.font = `bold 20px ${JP_FONT}`;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillText(`${6 - f}F`, ox + 16, y + 17);
        g.fillText(tenants[Math.floor(rnd() * tenants.length)], ox + 64, y + 17);
      }
    }
  });
}

/** Noren: three cloths (indigo 酒, red らーめん, white めし) side by side, u in thirds. */
export function norenTexture() {
  return canvasTex(768, 256, (g) => {
    const cloth = [['#1a2350', '#f2f0e8', '酒'], ['#b81c18', '#fff3c0', 'らーめん'], ['#f0ece0', '#1a1410', 'めし']] as const;
    cloth.forEach(([bg, fg, t], i) => {
      g.fillStyle = bg;
      g.fillRect(i * 256, 0, 256, 256);
      g.fillStyle = fg;
      g.font = `bold ${t.length > 2 ? 64 : 120}px ${JP_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, i * 256 + 128, 120);
      // The splits between the panels.
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (const s of [85, 171]) g.fillRect(i * 256 + s - 1, 40, 2, 216);
    });
  });
}

/** Shutter curtains: three, side by side (u in thirds): grey steel, its graffiti, rust and grime. */
export function shutterTexture() {
  const rnd = mulberry32(7810);
  return canvasTex(1536, 512, (g) => {
    const tags = [['夜猫', 'RAIN//ZERO'], ['NEON', '東京'], ['GHOST', '雨']];
    for (let i = 0; i < 3; i++) {
      const ox = i * 512;
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, ['#6a6d74', '#5a6a72', '#77746c'][i]);
      grd.addColorStop(1, ['#44464c', '#3c484e', '#4e4a44'][i]);
      g.fillStyle = grd;
      g.fillRect(ox, 0, 512, 512);
      // Grime running down, rust at the foot.
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(30,24,18,${0.05 + rnd() * 0.12})`;
        g.fillRect(ox + rnd() * 512, rnd() * 200, 2 + rnd() * 6, 150 + rnd() * 300);
      }
      const rust = g.createLinearGradient(0, 400, 0, 512);
      rust.addColorStop(0, 'rgba(120,60,20,0)');
      rust.addColorStop(1, 'rgba(120,60,20,0.55)');
      g.fillStyle = rust;
      g.fillRect(ox, 400, 512, 112);
      // Tags.
      g.save();
      g.translate(ox + 60 + rnd() * 60, 300 + rnd() * 60);
      g.rotate(-0.15 + rnd() * 0.1);
      g.font = `bold ${80 + rnd() * 30}px ${JP_FONT}`;
      g.fillStyle = ['rgba(230,60,150,0.75)', 'rgba(60,220,230,0.7)', 'rgba(250,210,40,0.7)'][i];
      g.strokeStyle = 'rgba(10,10,10,0.8)';
      g.lineWidth = 6;
      g.strokeText(tags[i][0], 0, 0);
      g.fillText(tags[i][0], 0, 0);
      g.restore();
      g.font = 'bold 34px monospace';
      g.fillStyle = 'rgba(240,240,240,0.6)';
      g.fillText(tags[i][1], ox + 250 + rnd() * 100, 440);
      // A faded notice taped up.
      g.fillStyle = 'rgba(240,236,220,0.75)';
      g.fillRect(ox + 380, 180, 80, 110);
      g.fillStyle = 'rgba(40,40,40,0.6)';
      for (let k = 0; k < 6; k++) g.fillRect(ox + 388, 196 + k * 14, 60, 4);
    }
  });
}

/** Awning stripes: three canvases (red, green, blue with white), u in thirds. */
export function awningTexture() {
  return canvasTex(768, 128, (g) => {
    const cols = ['#b8241c', '#1c6a3a', '#1c3a7a'];
    for (let i = 0; i < 3; i++) {
      for (let s = 0; s < 8; s++) {
        g.fillStyle = s % 2 ? '#efe9dc' : cols[i];
        g.fillRect(i * 256 + s * 32, 0, 32, 128);
      }
    }
  });
}

// ------------------------------------------------------------------ 80.0: the facades'
const VNAMES = ['スナック', '居酒屋', '麻雀', '歯科', 'カラオケ', '整骨院', '占い', '寿司', '焼肉', '英会話', '美容室', '漫画', 'ネイル', '質', '雀荘', '中華', 'バー', '喫茶', '鍼灸', '探偵', '貸室', '麺', '酒', '湯', '薬', '眼科', '囲碁', 'ゲーム', '焼鳥', '天ぷら'];
const VCOLS = 8, VROWS = 4, VW = 128, VH = 192;
let vAtlas: THREE.CanvasTexture | null = null;

/** Vertical signs (the tate-kanban's panels): a name down a coloured panel, its border. */
export function verticalSigns() {
  if (vAtlas) return vAtlas;
  const rnd = mulberry32(8001);
  vAtlas = canvasTex(VCOLS * VW, VROWS * VH, (g) => {
    for (let k = 0; k < VCOLS * VROWS; k++) {
      const name = VNAMES[k % VNAMES.length];
      const x = (k % VCOLS) * VW, y = Math.floor(k / VCOLS) * VH;
      const pal = [['#ffffff', '#c0281e'], ['#f6e12a', '#1a1410'], ['#c0281e', '#ffffff'], ['#1a3f8f', '#ffffff'], ['#ff5fbf', '#2a0018'], ['#1b9a4e', '#ffffff'], ['#101014', '#ffd860']][Math.floor(rnd() * 7)];
      g.fillStyle = pal[0];
      g.fillRect(x, y, VW, VH);
      g.strokeStyle = pal[1];
      g.lineWidth = 4;
      g.strokeRect(x + 6, y + 6, VW - 12, VH - 12);
      const size = Math.min(VW * 0.62, (VH - 30) / name.length);
      g.font = `bold ${size}px ${JP_FONT}`;
      g.fillStyle = pal[1];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const top = y + VH / 2 - (name.length * size) / 2 + size / 2;
      for (let i = 0; i < name.length; i++) g.fillText(name[i], x + VW / 2, top + i * size);
    }
  });
  return vAtlas;
}

/** Vertical sign `n`'s cell (u0, v0, u1, v1). */
export function verticalCell(n: number): [number, number, number, number] {
  const k = ((n % (VCOLS * VROWS)) + VCOLS * VROWS) % (VCOLS * VROWS);
  const x = (k % VCOLS) * VW, y = Math.floor(k / VCOLS) * VH;
  return [x / (VCOLS * VW), 1 - (y + VH) / (VROWS * VH), (x + VW) / (VCOLS * VW), 1 - y / (VROWS * VH)];
}

/** Laundry lines (three, u in thirds: shirts, towels, a mix) and futons (three patterns). */
export function laundryTexture() {
  const rnd = mulberry32(8002);
  return canvasTex(768, 256, (g) => {
    g.fillStyle = '#2a2a30';
    g.fillRect(0, 0, 768, 256);
    for (let i = 0; i < 3; i++) {
      let x = i * 256 + 4;
      while (x < (i + 1) * 256 - 10) {
        const w = 28 + rnd() * 40;
        g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${30 + rnd() * 50}%,${45 + rnd() * 40}%)`;
        g.fillRect(x, 0, w, 256 * (0.6 + rnd() * 0.4));
        if (rnd() < 0.4) {
          g.fillStyle = 'rgba(255,255,255,0.4)';
          for (let s = 0; s < 5; s++) g.fillRect(x, s * 40 + 10, w, 6);
        }
        x += w + 6;
      }
    }
  });
}

export function futonTexture() {
  return canvasTex(384, 128, (g) => {
    const pats = [['#e8e2d4', '#3a5a9a'], ['#f0d8dc', '#b04a5a'], ['#dfe8dc', '#3a7a4a']];
    pats.forEach(([bg, fg], i) => {
      g.fillStyle = bg;
      g.fillRect(i * 128, 0, 128, 128);
      g.fillStyle = fg;
      for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) g.fillRect(i * 128 + x, y, 8, 8);
    });
  });
}
