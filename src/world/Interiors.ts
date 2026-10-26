import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { JP_FONT } from './Textures';

/*
  78.0, the rooms behind the storefronts' glass (docs/TOKYO_PLAN.md, step 1). No geometry goes into
  the block (its collider is solid): the glass is a plane on the wall whose shader casts the view ray
  into a box room behind it (interior mapping) and draws whichever face it meets, back wall, side
  walls, floor or ceiling, from an atlas painted here. A store's room is picked by its plane's u: the
  plane spans u in [k, k + 1] for room k.

    the room     4 m wide (the slot), 3.8 m high (v 0..1; an upper-floor slot's plane spans v up to
                 2.9 / 3.8), DEPTH m deep
    the atlas    3 x 3 cells, each a back wall and a side wall (CELL x CELL) over the floor and the
                 ceiling (CELL x CELL / 2 each)

  MeshBasicMaterial underneath: the rooms are lit from inside (unlit by the street), and the fog, the
  street's ground fog (HeightFog patches the built-in chunks) and the tone mapping come with it.
*/

export const ROOMS = ['konbini', 'drugstore', 'electronics', 'boutique', 'cafe', 'books', 'izakaya', 'ramen', 'lobby'] as const;
export type Room = (typeof ROOMS)[number];
const CELL = 384;
const CW = CELL * 2, CH = CELL * 2;
const COLS = 3;
const DEPTH = 3.0;

type Ctx = CanvasRenderingContext2D;

/** A face of a room drawn into (x, y, w, h) of the atlas. */
interface Painter {
  back(g: Ctx, w: number, h: number, r: () => number): void;
  side(g: Ctx, w: number, h: number, r: () => number): void;
  floor: [string, string];
  ceiling: string;
  /** Ceiling lights: 'strips' (fluorescent), 'spots', 'warm' (pendants). */
  lights: 'strips' | 'spots' | 'warm';
}

const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;

/** Shelves of goods: `rows` shelf boards from y0 to y1, coloured packets on each. */
function shelves(g: Ctx, x: number, w: number, y0: number, y1: number, rows: number, r: () => number, board: string, back: string, item: (r: () => number) => string, tall = 0.7) {
  g.fillStyle = back;
  g.fillRect(x, y0, w, y1 - y0);
  const rh = (y1 - y0) / rows;
  for (let i = 0; i < rows; i++) {
    const by = y0 + (i + 1) * rh;
    let px = x + 2;
    while (px < x + w - 4) {
      const pw = 4 + r() * 9, ph = rh * (0.35 + r() * tall);
      g.fillStyle = item(r);
      g.fillRect(px, by - ph - 3, pw, ph);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(px, by - ph - 3, pw, 2);
      px += pw + 1 + (r() < 0.1 ? 4 : 0);
    }
    g.fillStyle = board;
    g.fillRect(x, by - 3, w, 4);
    // Price rail.
    g.fillStyle = 'rgba(255,240,120,0.6)';
    g.fillRect(x, by + 1, w, 2);
  }
}

/** Text fitted into a box. */
function label(g: Ctx, text: string, x: number, y: number, w: number, h: number, color: string, weight = 'bold') {
  let size = h * 0.8;
  g.font = `${weight} ${size}px ${JP_FONT}`;
  const m = g.measureText(text).width;
  if (m > w * 0.9) size *= (w * 0.9) / m;
  g.font = `${weight} ${size}px ${JP_FONT}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2);
}

const goods = (r: () => number) => hsl(Math.floor(r() * 360), 55 + r() * 30, 40 + r() * 30);
const books = (r: () => number) => hsl(Math.floor(r() * 360), 25 + r() * 40, 22 + r() * 35);

const PAINTERS: Record<Room, Painter> = {
  konbini: {
    back(g, w, h, r) {
      g.fillStyle = '#eef2f5';
      g.fillRect(0, 0, w, h);
      // Drink fridges: glass doors, bottles in rows, the lit header.
      const top = h * 0.2, bot = h * 0.97;
      g.fillStyle = '#c9d8e6';
      g.fillRect(w * 0.04, top, w * 0.92, bot - top);
      for (let i = 0; i < 6; i++) {
        const x = w * 0.04 + (i * w * 0.92) / 6;
        shelves(g, x + 3, (w * 0.92) / 6 - 6, top + 6, bot - 6, 5, r, '#9aa8b4', '#dde8f2', (rr) => hsl([0, 30, 120, 200, 45, 330][Math.floor(rr() * 6)], 70, 50 + rr() * 15), 0.55);
        g.fillStyle = '#7c8894';
        g.fillRect(x, top, 3, bot - top);
      }
      g.fillStyle = '#1e7a3e';
      g.fillRect(0, top - h * 0.06, w, h * 0.05);
      label(g, 'DRINK  ドリンク', 0, top - h * 0.06, w, h * 0.05, '#fff');
    },
    side(g, w, h, r) {
      g.fillStyle = '#e6eaee';
      g.fillRect(0, 0, w, h);
      shelves(g, 0, w, h * 0.42, h * 0.95, 5, r, '#b8c0c8', '#f4f6f8', goods);
      // Magazine rack near the window, the copier.
      shelves(g, 0, w * 0.25, h * 0.55, h * 0.95, 3, r, '#888', '#ddd', books, 0.9);
    },
    floor: ['#d6d8d2', '#c4c7c0'],
    ceiling: '#f2f4f6',
    lights: 'strips',
  },
  drugstore: {
    back(g, w, h, r) {
      g.fillStyle = '#f4f6f2';
      g.fillRect(0, 0, w, h);
      shelves(g, w * 0.02, w * 0.96, h * 0.28, h * 0.97, 6, r, '#9bb39b', '#f8faf6', (rr) => hsl([120, 200, 50, 330, 0][Math.floor(rr() * 5)], 50, 55 + rr() * 25), 0.45);
      g.fillStyle = '#16904c';
      g.fillRect(0, h * 0.19, w, h * 0.07);
      label(g, '医薬品 · 化粧品', 0, h * 0.19, w, h * 0.07, '#fff');
    },
    side(g, w, h, r) {
      g.fillStyle = '#eef2ec';
      g.fillRect(0, 0, w, h);
      shelves(g, 0, w, h * 0.4, h * 0.95, 5, r, '#a9bfa9', '#fafcf8', (rr) => hsl(Math.floor(rr() * 360), 45, 60 + rr() * 20), 0.5);
      g.fillStyle = '#ffd400';
      for (let i = 0; i < 4; i++) g.fillRect(w * (0.1 + i * 0.22), h * 0.34, w * 0.12, h * 0.05);
    },
    floor: ['#e4e6e2', '#d6d9d4'],
    ceiling: '#f6f7f4',
    lights: 'strips',
  },
  electronics: {
    back(g, w, h, r) {
      g.fillStyle = '#15161c';
      g.fillRect(0, 0, w, h);
      // A wall of screens.
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 5; x++) {
          const sx = w * (0.05 + x * 0.18), sy = h * (0.25 + y * 0.15);
          const grd = g.createLinearGradient(sx, sy, sx + w * 0.16, sy + h * 0.13);
          const hue = Math.floor(r() * 360);
          grd.addColorStop(0, hsl(hue, 80, 55));
          grd.addColorStop(1, hsl((hue + 60) % 360, 80, 30));
          g.fillStyle = '#05050a';
          g.fillRect(sx - 2, sy - 2, w * 0.16 + 4, h * 0.13 + 4);
          g.fillStyle = grd;
          g.fillRect(sx, sy, w * 0.16, h * 0.13);
        }
      g.fillStyle = '#e8003c';
      g.fillRect(0, h * 0.14, w, h * 0.07);
      label(g, 'ポイント10倍!  SALE', 0, h * 0.14, w, h * 0.07, '#ffe600');
    },
    side(g, w, h, r) {
      g.fillStyle = '#1b1c22';
      g.fillRect(0, 0, w, h);
      shelves(g, 0, w, h * 0.42, h * 0.95, 4, r, '#333', '#24252c', (rr) => (rr() < 0.3 ? '#e8e8ea' : hsl(Math.floor(rr() * 360), 20, 25 + rr() * 30)), 0.6);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#ffe600', '#ff2d55', '#00d1ff'][i % 3];
        g.fillRect(w * (0.05 + i * 0.12), h * 0.36, w * 0.08, h * 0.04);
      }
    },
    floor: ['#2a2b30', '#222328'],
    ceiling: '#1c1d22',
    lights: 'spots',
  },
  boutique: {
    back(g, w, h, r) {
      g.fillStyle = '#d9cbb8';
      g.fillRect(0, 0, w, h);
      // A long rail of hanging clothes, a mirror, a plant.
      g.fillStyle = '#6b5a48';
      g.fillRect(w * 0.05, h * 0.42, w * 0.6, 3);
      for (let x = w * 0.06; x < w * 0.64; x += 6 + r() * 5) {
        g.fillStyle = hsl(Math.floor(r() * 360), 20 + r() * 40, 25 + r() * 45);
        g.fillRect(x, h * 0.43, 7, h * (0.2 + r() * 0.18));
      }
      g.fillStyle = '#9fb0b8';
      g.fillRect(w * 0.72, h * 0.3, w * 0.2, h * 0.6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(w * 0.74, h * 0.32, w * 0.05, h * 0.56);
      label(g, 'ATELIER', w * 0.1, h * 0.2, w * 0.5, h * 0.08, '#4a3c2e', '300');
    },
    side(g, w, h, r) {
      g.fillStyle = '#e2d6c6';
      g.fillRect(0, 0, w, h);
      // Folded clothes in cubbies.
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 6; x++) {
          const cx = w * (0.05 + x * 0.15), cy = h * (0.4 + y * 0.13);
          g.fillStyle = '#b9a58c';
          g.fillRect(cx, cy, w * 0.14, h * 0.12);
          for (let k = 0; k < 3; k++) {
            g.fillStyle = hsl(Math.floor(r() * 360), 25, 35 + r() * 40);
            g.fillRect(cx + 3, cy + h * 0.12 - (k + 1) * h * 0.03, w * 0.14 - 6, h * 0.028);
          }
        }
    },
    floor: ['#8a6a4c', '#7a5c40'],
    ceiling: '#efe6da',
    lights: 'warm',
  },
  cafe: {
    back(g, w, h, r) {
      g.fillStyle = '#4a3326';
      g.fillRect(0, 0, w, h);
      // Chalk menu boards, the counter, the machine, cups on the shelf.
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#1d211f';
        g.fillRect(w * (0.08 + i * 0.3), h * 0.22, w * 0.26, h * 0.2);
        g.fillStyle = 'rgba(240,240,230,0.7)';
        for (let k = 0; k < 5; k++) g.fillRect(w * (0.1 + i * 0.3), h * (0.25 + k * 0.03), w * (0.12 + r() * 0.08), 2);
      }
      label(g, '珈琲  COFFEE', w * 0.08, h * 0.13, w * 0.84, h * 0.07, '#f0e0c0');
      g.fillStyle = '#6a4a34';
      g.fillRect(0, h * 0.68, w, h * 0.32);
      g.fillStyle = '#c9c9c9';
      g.fillRect(w * 0.3, h * 0.55, w * 0.18, h * 0.13);
      g.fillStyle = '#d8b98a';
      g.fillRect(0, h * 0.66, w, h * 0.025);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = r() < 0.5 ? '#efe9df' : '#8d6b52';
        g.fillRect(w * (0.55 + i * 0.045), h * 0.6, w * 0.03, h * 0.05);
      }
    },
    side(g, w, h, r) {
      g.fillStyle = '#5a3f2e';
      g.fillRect(0, 0, w, h);
      // Wainscot, framed pictures, a bench.
      g.fillStyle = '#3a271c';
      g.fillRect(0, h * 0.7, w, h * 0.3);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#2a1c14';
        g.fillRect(w * (0.08 + i * 0.23), h * 0.35, w * 0.15, h * 0.18);
        g.fillStyle = hsl(Math.floor(r() * 60) + 20, 30, 40 + r() * 20);
        g.fillRect(w * (0.09 + i * 0.23), h * 0.36, w * 0.13, h * 0.16);
      }
      g.fillStyle = '#7a2e2a';
      g.fillRect(0, h * 0.75, w, h * 0.08);
    },
    floor: ['#6b4a32', '#5d3f2a'],
    ceiling: '#3a2a20',
    lights: 'warm',
  },
  books: {
    back(g, w, h, r) {
      g.fillStyle = '#d8d2c4';
      g.fillRect(0, 0, w, h);
      shelves(g, w * 0.02, w * 0.96, h * 0.22, h * 0.97, 7, r, '#6b5440', '#3a2e24', books, 0.6);
      g.fillStyle = '#1f3d6b';
      g.fillRect(0, h * 0.13, w, h * 0.07);
      label(g, '新刊 · 文庫 · コミック', 0, h * 0.13, w, h * 0.07, '#fff');
    },
    side(g, w, h, r) {
      g.fillStyle = '#d0c9ba';
      g.fillRect(0, 0, w, h);
      shelves(g, 0, w, h * 0.32, h * 0.95, 6, r, '#6b5440', '#3a2e24', books, 0.6);
    },
    floor: ['#5a6070', '#4c5262'],
    ceiling: '#ece8de',
    lights: 'strips',
  },
  izakaya: {
    back(g, w, h, r) {
      g.fillStyle = '#5a3a22';
      g.fillRect(0, 0, w, h);
      // Menu strips (tanzaku) across the wall, the bottle shelf, the counter.
      const dishes = ['焼鳥', '枝豆', '刺身', '唐揚', '冷奴', 'ビール', '日本酒', '焼酎', 'おでん', '煮込'];
      for (let i = 0; i < 10; i++) {
        const x = w * (0.04 + i * 0.095);
        g.fillStyle = '#f2e6c8';
        g.fillRect(x, h * 0.22, w * 0.07, h * 0.24);
        g.save();
        g.translate(x + w * 0.035, h * 0.24);
        g.font = `bold ${w * 0.05}px ${JP_FONT}`;
        g.fillStyle = '#1a1410';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        const t = dishes[i];
        for (let k = 0; k < t.length; k++) g.fillText(t[k], 0, k * w * 0.055);
        g.restore();
        g.fillStyle = '#c0281e';
        g.fillRect(x, h * 0.42, w * 0.07, h * 0.03);
      }
      g.fillStyle = '#3a2416';
      g.fillRect(0, h * 0.5, w, h * 0.06);
      for (let x = w * 0.03; x < w * 0.97; x += 7 + r() * 4) {
        g.fillStyle = hsl(Math.floor(r() * 60) + 20, 50, 20 + r() * 30);
        g.fillRect(x, h * 0.5 - h * (0.05 + r() * 0.04), 5, h * 0.1);
      }
      g.fillStyle = '#8a5a34';
      g.fillRect(0, h * 0.7, w, h * 0.3);
      g.fillStyle = '#b07a48';
      g.fillRect(0, h * 0.69, w, h * 0.03);
    },
    side(g, w, h, r) {
      g.fillStyle = '#6a4428';
      g.fillRect(0, 0, w, h);
      // Shoji panels glowing, a red lantern, a booth.
      g.fillStyle = '#f0d39a';
      g.fillRect(w * 0.1, h * 0.25, w * 0.8, h * 0.4);
      g.fillStyle = '#4a2c18';
      for (let x = 0; x <= 8; x++) g.fillRect(w * 0.1 + (x * w * 0.8) / 8 - 2, h * 0.25, 4, h * 0.4);
      for (let y = 0; y <= 4; y++) g.fillRect(w * 0.1, h * 0.25 + (y * h * 0.4) / 4 - 2, w * 0.8, 4);
      g.fillStyle = '#d4281c';
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.17, w * 0.06, h * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a2416';
      g.fillRect(0, h * 0.72, w, h * 0.28);
      void r;
    },
    floor: ['#3a2618', '#2f1f14'],
    ceiling: '#2a1a10',
    lights: 'warm',
  },
  ramen: {
    back(g, w, h, r) {
      g.fillStyle = '#e8e2d4';
      g.fillRect(0, 0, w, h);
      // The kitchen behind the counter: pots, steam, the menu row, a ticket machine.
      g.fillStyle = '#b8b2a4';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) g.fillRect(w * (x * 0.1), h * (0.3 + y * 0.05), w * 0.1 - 1, 1);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#d43a20';
        g.fillRect(w * (0.05 + i * 0.155), h * 0.14, w * 0.13, h * 0.12);
        label(g, ['醤油', '味噌', '塩', '豚骨', '担々', '餃子'][i], w * (0.05 + i * 0.155), h * 0.14, w * 0.13, h * 0.12, '#fff3c0');
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#8c9298';
        g.fillRect(w * (0.15 + i * 0.2), h * 0.52, w * 0.12, h * 0.1);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.ellipse(w * (0.21 + i * 0.2), h * 0.45, w * 0.05, h * 0.06, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#c8a070';
      g.fillRect(0, h * 0.66, w, h * 0.34);
      g.fillStyle = '#e6c08a';
      g.fillRect(0, h * 0.64, w, h * 0.03);
      void r;
    },
    side(g, w, h, r) {
      g.fillStyle = '#efe8da';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = hsl(Math.floor(r() * 40), 70, 50);
        g.fillRect(w * (0.12 + i * 0.28), h * 0.3, w * 0.2, h * 0.26);
        label(g, ['大盛', '替玉', '限定'][i], w * (0.12 + i * 0.28), h * 0.33, w * 0.2, h * 0.1, '#fff');
      }
      g.fillStyle = '#c8a070';
      g.fillRect(0, h * 0.7, w, h * 0.3);
    },
    floor: ['#8c8a84', '#7c7a74'],
    ceiling: '#e8e4da',
    lights: 'strips',
  },
  lobby: {
    back(g, w, h, r) {
      g.fillStyle = '#cfc9be';
      g.fillRect(0, 0, w, h);
      // Two lift doors and their lit indicators, a plant, the stair door.
      for (let i = 0; i < 2; i++) {
        const x = w * (0.22 + i * 0.32);
        g.fillStyle = '#8c939a';
        g.fillRect(x, h * 0.42, w * 0.22, h * 0.56);
        g.fillStyle = '#6c737a';
        g.fillRect(x + w * 0.108, h * 0.42, 3, h * 0.56);
        g.fillStyle = '#ff9a2a';
        g.fillRect(x + w * 0.07, h * 0.36, w * 0.08, h * 0.03);
      }
      g.fillStyle = '#2f5a2f';
      g.beginPath();
      g.ellipse(w * 0.09, h * 0.78, w * 0.06, h * 0.12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a4a3a';
      g.fillRect(w * 0.06, h * 0.86, w * 0.06, h * 0.12);
      void r;
    },
    side(g, w, h, r) {
      g.fillStyle = '#c6c0b4';
      g.fillRect(0, 0, w, h);
      // Mailboxes along the wall, a notice board.
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = '#9aa0a6';
          g.fillRect(w * (0.08 + x * 0.1), h * (0.45 + y * 0.07), w * 0.09, h * 0.06);
          g.fillStyle = '#2a2c30';
          g.fillRect(w * (0.1 + x * 0.1), h * (0.465 + y * 0.07), w * 0.05, 2);
        }
      g.fillStyle = '#7a6a50';
      g.fillRect(w * 0.1, h * 0.2, w * 0.4, h * 0.18);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = r() < 0.5 ? '#f2eee4' : '#f4e27a';
        g.fillRect(w * (0.12 + (i % 3) * 0.12), h * (0.22 + Math.floor(i / 3) * 0.08), w * 0.1, h * 0.07);
      }
    },
    floor: ['#8e8a84', '#827e78'],
    ceiling: '#e4e0d8',
    lights: 'spots',
  },
};

let atlas: THREE.CanvasTexture | null = null;

/** The rooms' atlas (made once). */
export function interiorAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = COLS * CW;
  c.height = Math.ceil(ROOMS.length / COLS) * CH;
  const g = c.getContext('2d')!;
  ROOMS.forEach((room, k) => {
    const p = PAINTERS[room];
    const ox = (k % COLS) * CW, oy = Math.floor(k / COLS) * CH;
    const r = mulberry32(780 + k);
    const face = (x: number, y: number, w: number, h: number, draw: (g: Ctx, w: number, h: number) => void) => {
      g.save();
      g.translate(ox + x, oy + y);
      g.beginPath();
      g.rect(0, 0, w, h);
      g.clip();
      draw(g, w, h);
      g.restore();
    };
    face(0, 0, CELL, CELL, (g, w, h) => p.back(g, w, h, r));
    face(CELL, 0, CELL, CELL, (g, w, h) => p.side(g, w, h, r));
    // The floor: tiles in two tones; the ceiling: its lights.
    face(0, CELL, CELL, CELL / 2, (g, w, h) => {
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 10; x++) {
          g.fillStyle = p.floor[(x + y) % 2];
          g.fillRect((x * w) / 10, (y * h) / 6, w / 10 + 1, h / 6 + 1);
        }
    });
    face(CELL, CELL, CELL, CELL / 2, (g, w, h) => {
      g.fillStyle = p.ceiling;
      g.fillRect(0, 0, w, h);
      if (p.lights === 'strips') {
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) g.fillRect(w * 0.1, h * (0.15 + i * 0.3), w * 0.8, h * 0.06);
      } else {
        for (let y = 0; y < 3; y++)
          for (let x = 0; x < 4; x++) {
            g.fillStyle = p.lights === 'warm' ? '#ffd890' : '#ffffff';
            g.beginPath();
            g.arc(w * (0.15 + x * 0.23), h * (0.2 + y * 0.3), w * 0.025, 0, Math.PI * 2);
            g.fill();
          }
      }
    });
    // Black gaps between the faces (no bleed into the next one when filtered).
    g.fillStyle = '#000';
    g.fillRect(ox + CELL - 1, oy, 2, CH);
    g.fillRect(ox, oy + CELL - 1, CW, 2);
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

/** The glass material: the room behind each storefront plane (u in [k, k + 1]: room k). */
export function interiorMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ map: interiorAtlas() });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRoom = { value: new THREE.Vector4(4.0, 3.8, DEPTH, COLS) };
    sh.uniforms.uAtlas = { value: new THREE.Vector2(COLS, Math.ceil(ROOMS.length / COLS)) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIPos;\nvarying vec3 vIN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvIPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvIN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIPos;\nvarying vec3 vIN;\nuniform vec4 uRoom;\nuniform vec2 uAtlas;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        {
          vec3 N = normalize(vIN);
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
          vec3 V = normalize(vIPos - cameraPosition);
          float k = floor(vMapUv.x);
          vec2 p = vec2(fract(vMapUv.x), vMapUv.y);
          vec3 P0 = vec3(p.x * uRoom.x, p.y * uRoom.y, 0.0);
          vec3 d = vec3(dot(V, T), V.y, -dot(V, N));
          d.z = max(d.z, 1e-3);
          float tx = d.x > 0.0 ? (uRoom.x - P0.x) / max(d.x, 1e-4) : -P0.x / min(d.x, -1e-4);
          float ty = d.y > 0.0 ? (uRoom.y - P0.y) / max(d.y, 1e-4) : -P0.y / min(d.y, -1e-4);
          float tz = uRoom.z / d.z;
          float t = min(tz, min(tx, ty));
          vec3 hit = P0 + d * t;
          // The face it meets and where on it (0..1 each way), its cell in the room's block.
          vec2 f; vec2 cell; vec2 size;
          if (t == tz) { f = vec2(hit.x / uRoom.x, hit.y / uRoom.y); cell = vec2(0.0, 0.0); size = vec2(0.5, 0.5); }
          else if (t == tx) { float z = hit.z / uRoom.z; f = vec2(d.x > 0.0 ? 1.0 - z : z, hit.y / uRoom.y); cell = vec2(0.5, 0.0); size = vec2(0.5, 0.5); }
          else { f = vec2(hit.x / uRoom.x, hit.z / uRoom.z); cell = d.y > 0.0 ? vec2(0.5, 0.5) : vec2(0.0, 0.5); size = vec2(0.5, 0.25);
                 if (d.y < 0.0) f.y = 1.0 - f.y; }
          f = clamp(f, 0.004, 0.996);
          // Canvas y runs down: the face's top row is its y = 0.
          vec2 inBlock = cell + vec2(f.x, 1.0 - f.y) * size;
          vec2 blk = vec2(mod(k, uAtlas.x), floor(k / uAtlas.x));
          vec2 auv = vec2((blk.x + inBlock.x) / uAtlas.x, 1.0 - (blk.y + inBlock.y) / uAtlas.y);
          vec2 gx = dFdx(vMapUv) * 0.5 / uAtlas, gy = dFdy(vMapUv) * 0.5 / uAtlas;
          vec3 room = textureGrad(map, auv, gx, gy).rgb;
          // Deeper is dimmer, corners darker; the glass: a cool sheen at a glancing look.
          float depth = hit.z / uRoom.z;
          room *= 1.0 - 0.38 * depth;
          float fres = pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 4.0);
          vec3 col = mix(room, vec3(0.08, 0.09, 0.14), fres * 0.7);
          diffuseColor.rgb *= col;
        }`,
      );
  };
  return mat;
}

/** A plane's UVs for room `k`: u in [k, k + 1], v 0..h/3.8 (an upper slot's room is the same 3.8 m high). */
export function roomUV(geo: THREE.BufferGeometry, k: number, h: number) {
  const g = geo.clone();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.999 + 0.0005 + k, uv.getY(i) * (h / 3.8));
  return g;
}
