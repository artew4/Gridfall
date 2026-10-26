import * as THREE from 'three';
import { COLS, label, paintAtlas, shelves, books, type Painter } from './Interiors';
import type { FacadeTex } from './Textures';

/*
  80.0, the facades' windows as rooms (docs/TOKYO_PLAN.md, step 3). The facade tile (16 m, five floors of
  3.2 m, columns of 2 or 4 m) keeps its painted frames, sills and walls; inside each painted window's
  rectangle the facade's shader casts the view into a room behind it (interior mapping, as the
  storefronts': Interiors.ts), a room 3.6 m wide, 2.8 m high, 3.2 m deep, the window in the middle of its
  front wall, its sill 0.9 m up.

  The texture's own draws decide each window (Textures.facadeTexture records them): unlit or lit warm
  (a home: living room, kitchen, bedroom), cool (an office) or pink (a karaoke box), how bright, blinds,
  a curtain. They go to the shader as a tiny table (columns x floors). An unlit room is still there,
  barely: what the street's light shows through the glass.
*/

const HOME = ['living', 'kitchen', 'bedroom', 'office', 'karaoke', 'storage'] as const;

const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;

const PAINTERS: Record<(typeof HOME)[number], Painter> = {
  living: {
    back(g, w, h, r) {
      g.fillStyle = '#d8c8b0';
      g.fillRect(0, 0, w, h);
      // A bookcase, a framed print, the TV's glow on its stand, a sofa's back.
      shelves(g, w * 0.06, w * 0.26, h * 0.3, h * 0.92, 5, r, '#6a5038', '#3a2c20', books, 0.6);
      g.fillStyle = '#2a2420';
      g.fillRect(w * 0.42, h * 0.3, w * 0.3, h * 0.2);
      g.fillStyle = hsl(Math.floor(r() * 360), 40, 55);
      g.fillRect(w * 0.44, h * 0.32, w * 0.26, h * 0.16);
      g.fillStyle = '#4a6a9a';
      g.fillRect(w * 0.45, h * 0.56, w * 0.24, h * 0.15);
      g.fillStyle = '#5a4030';
      g.fillRect(w * 0.42, h * 0.72, w * 0.32, h * 0.2);
    },
    side(g, w, h, r) {
      g.fillStyle = '#d0bea4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = hsl(Math.floor(r() * 360), 30, 40);
      g.fillRect(0, h * 0.6, w * 0.7, h * 0.22);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, h * 0.82, w * 0.7, h * 0.04);
      // A standing lamp.
      g.fillStyle = '#ffe2a8';
      g.beginPath();
      g.ellipse(w * 0.85, h * 0.35, w * 0.06, h * 0.06, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a3028';
      g.fillRect(w * 0.845, h * 0.4, 4, h * 0.5);
    },
    floor: ['#8a6a4a', '#7c5e40'],
    ceiling: '#e8dcc8',
    lights: 'warm',
  },
  kitchen: {
    back(g, w, h, r) {
      g.fillStyle = '#e4e0d4';
      g.fillRect(0, 0, w, h);
      // Wall cupboards, the counter, the fridge, the range hood.
      g.fillStyle = '#c8c0ae';
      g.fillRect(w * 0.05, h * 0.18, w * 0.6, h * 0.2);
      g.fillStyle = '#b0a894';
      for (let i = 0; i < 4; i++) g.fillRect(w * (0.05 + i * 0.15) + 2, h * 0.18 + 2, w * 0.15 - 4, h * 0.2 - 4);
      g.fillStyle = '#9a9a96';
      g.fillRect(w * 0.05, h * 0.62, w * 0.6, h * 0.04);
      g.fillStyle = '#d0c8b4';
      g.fillRect(w * 0.05, h * 0.66, w * 0.6, h * 0.3);
      g.fillStyle = '#eef0f0';
      g.fillRect(w * 0.72, h * 0.3, w * 0.2, h * 0.66);
      g.fillStyle = '#9a9ea2';
      g.fillRect(w * 0.9, h * 0.45, 3, h * 0.1);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = hsl(Math.floor(r() * 360), 50, 50);
        g.fillRect(w * (0.1 + i * 0.1), h * 0.55, w * 0.05, h * 0.07);
      }
    },
    side(g, w, h, r) {
      g.fillStyle = '#ddd8ca';
      g.fillRect(0, 0, w, h);
      // A table and chairs, a calendar.
      g.fillStyle = '#8a6a4a';
      g.fillRect(w * 0.2, h * 0.66, w * 0.5, h * 0.04);
      g.fillRect(w * 0.25, h * 0.7, 4, h * 0.25);
      g.fillRect(w * 0.65, h * 0.7, 4, h * 0.25);
      g.fillStyle = '#f4f0e6';
      g.fillRect(w * 0.4, h * 0.25, w * 0.15, h * 0.2);
      g.fillStyle = '#c03020';
      g.fillRect(w * 0.4, h * 0.25, w * 0.15, h * 0.04);
      void r;
    },
    floor: ['#b8b0a0', '#aca494'],
    ceiling: '#f0ece4',
    lights: 'strips',
  },
  bedroom: {
    back(g, w, h, r) {
      g.fillStyle = '#c8b8c4';
      g.fillRect(0, 0, w, h);
      // The bed's headboard and quilt, a poster, a wardrobe.
      g.fillStyle = '#5a4038';
      g.fillRect(w * 0.15, h * 0.58, w * 0.45, h * 0.12);
      g.fillStyle = hsl(Math.floor(r() * 360), 35, 55);
      g.fillRect(w * 0.12, h * 0.7, w * 0.51, h * 0.26);
      g.fillStyle = '#f2eee6';
      g.fillRect(w * 0.18, h * 0.66, w * 0.15, h * 0.06);
      g.fillStyle = hsl(Math.floor(r() * 360), 60, 50);
      g.fillRect(w * 0.25, h * 0.25, w * 0.2, h * 0.26);
      g.fillStyle = '#8a7058';
      g.fillRect(w * 0.7, h * 0.22, w * 0.25, h * 0.74);
      g.fillStyle = '#6a5440';
      g.fillRect(w * 0.82, h * 0.22, 3, h * 0.74);
    },
    side(g, w, h, r) {
      g.fillStyle = '#c0b0bc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6a5848';
      g.fillRect(w * 0.1, h * 0.62, w * 0.3, h * 0.3);
      g.fillStyle = '#ffd8a0';
      g.beginPath();
      g.ellipse(w * 0.25, h * 0.56, w * 0.05, h * 0.05, 0, 0, Math.PI * 2);
      g.fill();
      shelves(g, w * 0.55, w * 0.35, h * 0.3, h * 0.55, 2, r, '#6a5038', '#b8a8b4', books, 0.7);
    },
    floor: ['#9a8068', '#8c7460'],
    ceiling: '#ece2e6',
    lights: 'warm',
  },
  office: {
    back(g, w, h, r) {
      g.fillStyle = '#dfe4e8';
      g.fillRect(0, 0, w, h);
      // Desks in a row with monitors, a whiteboard, filing cabinets.
      g.fillStyle = '#f6f8fa';
      g.fillRect(w * 0.1, h * 0.2, w * 0.4, h * 0.22);
      g.fillStyle = 'rgba(40,80,160,0.6)';
      for (let i = 0; i < 5; i++) g.fillRect(w * 0.13, h * (0.24 + i * 0.035), w * (0.15 + r() * 0.15), 2);
      g.fillStyle = '#b8bec4';
      g.fillRect(w * 0.62, h * 0.4, w * 0.3, h * 0.56);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#9aa0a6';
        g.fillRect(w * 0.62, h * (0.4 + i * 0.14), w * 0.3, 2);
      }
      g.fillStyle = '#8a8e92';
      g.fillRect(0, h * 0.68, w * 0.58, h * 0.04);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#1a1c20';
        g.fillRect(w * (0.05 + i * 0.18), h * 0.54, w * 0.12, h * 0.13);
        g.fillStyle = hsl(200 + Math.floor(r() * 40), 60, 60);
        g.fillRect(w * (0.06 + i * 0.18), h * 0.55, w * 0.1, h * 0.1);
      }
    },
    side(g, w, h, r) {
      g.fillStyle = '#d8dde2';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#8a8e92';
        g.fillRect(w * (0.05 + i * 0.32), h * 0.68, w * 0.26, h * 0.04);
        g.fillStyle = '#1a1c20';
        g.fillRect(w * (0.1 + i * 0.32), h * 0.54, w * 0.12, h * 0.13);
        g.fillStyle = hsl(200 + Math.floor(r() * 40), 60, 55);
        g.fillRect(w * (0.11 + i * 0.32), h * 0.55, w * 0.1, h * 0.1);
      }
      label(g, '営業部', w * 0.3, h * 0.2, w * 0.4, h * 0.08, '#3a4a6a');
    },
    floor: ['#7a8088', '#70767e'],
    ceiling: '#f2f4f6',
    lights: 'strips',
  },
  karaoke: {
    back(g, w, h, r) {
      g.fillStyle = '#3a1838';
      g.fillRect(0, 0, w, h);
      // The big screen, mirror-ball spots, a sofa round the walls.
      g.fillStyle = '#0a0a14';
      g.fillRect(w * 0.25, h * 0.25, w * 0.5, h * 0.3);
      const grd = g.createLinearGradient(w * 0.27, 0, w * 0.73, 0);
      grd.addColorStop(0, '#ff3a9a');
      grd.addColorStop(1, '#3ab0ff');
      g.fillStyle = grd;
      g.fillRect(w * 0.27, h * 0.27, w * 0.46, h * 0.26);
      label(g, '♪ 夜桜 ♪', w * 0.27, h * 0.44, w * 0.46, h * 0.08, '#ffffff');
      g.fillStyle = '#7a1a5a';
      g.fillRect(0, h * 0.72, w, h * 0.2);
      for (let i = 0; i < 20; i++) {
        g.fillStyle = `rgba(255,${150 + Math.floor(r() * 100)},255,0.6)`;
        g.fillRect(r() * w, r() * h * 0.6, 3, 3);
      }
    },
    side(g, w, h, r) {
      g.fillStyle = '#4a1a48';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a1a5a';
      g.fillRect(0, h * 0.72, w, h * 0.2);
      g.fillStyle = '#2a0a28';
      g.fillRect(w * 0.2, h * 0.66, w * 0.5, h * 0.06);
      for (let i = 0; i < 15; i++) {
        g.fillStyle = `rgba(${150 + Math.floor(r() * 100)},200,255,0.6)`;
        g.fillRect(r() * w, r() * h * 0.6, 3, 3);
      }
    },
    floor: ['#2a1028', '#341434'],
    ceiling: '#1a0a1a',
    lights: 'spots',
  },
  storage: {
    back(g, w, h, r) {
      g.fillStyle = '#9a968c';
      g.fillRect(0, 0, w, h);
      // Boxes stacked to the window, a bare bulb's cord.
      for (let i = 0; i < 14; i++) {
        const bw = w * (0.12 + r() * 0.12), bh = h * (0.08 + r() * 0.1);
        g.fillStyle = hsl(30, 25 + r() * 20, 40 + r() * 20);
        g.fillRect(r() * (w - bw), h * 0.96 - bh - Math.floor(r() * 3) * h * 0.1, bw, bh);
      }
      g.fillStyle = '#2a2a2a';
      g.fillRect(w * 0.5, 0, 2, h * 0.2);
    },
    side(g, w, h, r) {
      g.fillStyle = '#928e84';
      g.fillRect(0, 0, w, h);
      shelves(g, w * 0.1, w * 0.8, h * 0.35, h * 0.95, 4, r, '#5a5650', '#7a766c', (rr) => hsl(30, 20 + rr() * 20, 35 + rr() * 25), 0.8);
    },
    floor: ['#6a6660', '#625e58'],
    ceiling: '#8a867e',
    lights: 'strips',
  },
};

let atlas: THREE.CanvasTexture | null = null;
export function windowAtlas() {
  return (atlas ??= paintAtlas(HOME as unknown as string[], PAINTERS as Record<string, Painter>, 800));
}

/** A window's room: warm → home, cool → office, pink → karaoke, unlit → any. */
function roomOf(w: FacadeTex['windows']['at'][number], k: number) {
  const pick = (k * 2654435761) >>> 0;
  if (w.light === 'cool') return 3;
  if (w.light === 'pink') return 4;
  if (w.light === 'warm') return pick % 3;
  return [0, 1, 2, 3, 5][pick % 5];
}

/** The windows' table: columns x floors (from the tile's top), RGBA: width, flags, room, brightness. */
export function windowTable(win: FacadeTex['windows']) {
  const floors = Math.round(win.at.length / win.cols);
  const data = new Uint8Array(win.cols * floors * 4);
  win.at.forEach((w, k) => {
    const f = Math.floor(k / win.cols), c = k % win.cols;
    const i = (f * win.cols + c) * 4;
    data[i] = Math.round(w.wf * 255);
    data[i + 1] = ['off', 'warm', 'cool', 'pink'].indexOf(w.light) * 64 + (w.blinds ? 16 : 0) + (w.curtain ? 8 : 0);
    data[i + 2] = roomOf(w, k);
    data[i + 3] = Math.round(w.intensity * 255);
  });
  const t = new THREE.DataTexture(data, win.cols, floors, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Rooms behind a facade material's painted windows (`glow`: how bright a lit one shines, the facade's
 * emissive intensity for the old painted ones). Chained after the material's other patches.
 */
export function applyWindows(mat: THREE.MeshStandardMaterial, win: FacadeTex['windows'], glow: number) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const table = windowTable(win);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWinTab = { value: table };
    sh.uniforms.uWinAtlas = { value: windowAtlas() };
    // x: columns, y: the window's height in its floor, z: glow, w: atlas columns.
    sh.uniforms.uWin = { value: new THREE.Vector4(win.cols, win.hFrac, glow, COLS) };
    sh.uniforms.uWinRows = { value: Math.ceil(HOME.length / COLS) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinP;\nvarying vec3 vWinN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWinP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWinN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWinP;
        varying vec3 vWinN;
        uniform sampler2D uWinTab;
        uniform sampler2D uWinAtlas;
        uniform vec4 uWin;
        uniform float uWinRows;
        float winIn = 0.0;
        vec3 winEmit = vec3(0.0);`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (abs(vWinN.y) < 0.5) {
          // Where in the tile: its column, its floor (from the top), where in the window.
          float cx = fract(vMapUv.x), cy = 1.0 - fract(vMapUv.y);
          float cols = uWin.x;
          int col = int(floor(cx * cols)), flo = int(floor(cy * 5.0));
          vec4 tab = texelFetch(uWinTab, ivec2(col, flo), 0);
          float wf = tab.r;
          float u = (fract(cx * cols) - (1.0 - wf) * 0.5) / max(wf, 0.01);
          float v = 1.0 - (fract(cy * 5.0) - 0.22) / uWin.y;
          float winW = wf * 16.0 / cols, winH = uWin.y * 3.2;
          // Inside the glass (not its mullion).
          if (wf > 0.0 && u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0 && abs(u - 0.5) * winW > 0.032) {
            winIn = 1.0;
            float flags = tab.g * 255.0;
            float light = floor(flags / 64.0);
            bool blinds = mod(floor(flags / 16.0), 2.0) > 0.5;
            bool curtain = mod(floor(flags / 8.0), 2.0) > 0.5;
            float k = floor(tab.b * 255.0 + 0.5);
            // The room: 3.6 x 2.8 x 3.2 m, the window in its front wall.
            vec3 N = normalize(vWinN);
            vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
            vec3 V = normalize(vWinP - cameraPosition);
            vec3 R = vec3(3.6, 2.8, 3.2);
            vec3 P0 = vec3(R.x * 0.5 + (u - 0.5) * winW, 0.9 + v * winH, 0.0);
            vec3 d = vec3(dot(V, T), V.y, max(-dot(V, N), 1e-3));
            float tx = d.x > 0.0 ? (R.x - P0.x) / max(d.x, 1e-4) : -P0.x / min(d.x, -1e-4);
            float ty = d.y > 0.0 ? (R.y - P0.y) / max(d.y, 1e-4) : -P0.y / min(d.y, -1e-4);
            float tz = R.z / d.z;
            float t = min(tz, min(tx, ty));
            vec3 hit = P0 + d * t;
            vec2 f; vec2 cell; vec2 size;
            if (t == tz) { f = vec2(hit.x / R.x, hit.y / R.y); cell = vec2(0.0); size = vec2(0.5); }
            else if (t == tx) { float z = hit.z / R.z; f = vec2(d.x > 0.0 ? 1.0 - z : z, hit.y / R.y); cell = vec2(0.5, 0.0); size = vec2(0.5); }
            else { f = vec2(hit.x / R.x, hit.z / R.z); cell = d.y > 0.0 ? vec2(0.5, 0.5) : vec2(0.0, 0.5); size = vec2(0.5, 0.25); if (d.y < 0.0) f.y = 1.0 - f.y; }
            f = clamp(f, 0.004, 0.996);
            vec2 inBlock = cell + vec2(f.x, 1.0 - f.y) * size;
            vec2 blk = vec2(mod(k, uWin.w), floor(k / uWin.w));
            vec2 auv = vec2((blk.x + inBlock.x) / uWin.w, 1.0 - (blk.y + inBlock.y) / uWinRows);
            vec2 gx = dFdx(vMapUv), gy = dFdy(vMapUv);
            vec3 room = textureGrad(uWinAtlas, auv, gx, gy).rgb;
            room *= 1.0 - 0.45 * hit.z / R.z;
            vec3 tint = light < 0.5 ? vec3(0.05, 0.05, 0.08) : light < 1.5 ? vec3(1.0, 0.82, 0.6) : light < 2.5 ? vec3(0.8, 0.92, 1.05) : vec3(1.05, 0.55, 0.8);
            float bright = light < 0.5 ? 1.0 : (0.45 + 0.55 * tab.a) * uWin.z;
            winEmit = room * tint * bright;
            if (blinds) winEmit *= mix(1.0, 0.3, step(0.55, fract(v * winH / 0.075)));
            if (curtain && u < 0.3) winEmit = vec3(0.012, 0.01, 0.012);
            // The glass itself: dark, glossy (the street's reflections come from the environment).
            diffuseColor.rgb = vec3(0.025, 0.028, 0.035);
          }
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (winIn > 0.5) totalEmissiveRadiance = winEmit;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if (winIn > 0.5) roughnessFactor = 0.12;`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|windows${win.cols}`;
  mat.needsUpdate = true;
  return mat;
}
