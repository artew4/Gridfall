import { CanvasFit } from './canvasFit';
import type * as THREE from 'three';
import type { R } from '../world/Rects';
import type { ConeBlip } from '../stealth/PlayerIntel';

export type Floor = 'under' | 'street' | 'upper';

export interface MapData {
  street: R[];
  upper: R[];
  under: R[];
  stairs: R[];
}

export type Blip = ConeBlip;

const PX = 4; // texture pixels per metre
const X0 = -50;
const Z0 = -62;
const W = 104;
const D = 114;
const SIZE = 184;
const SCALE = 2.6; // screen pixels per metre

/**
 * Heading-up minimap. Floor plans are drawn once per level into offscreen canvases; each frame is a
 * rotated blit plus a handful of markers. Guards appear only where the player has seen or heard them,
 * and the information ages out.
 */
export class Minimap {
  root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private floors: Record<Floor, HTMLCanvasElement>;
  private label = document.createElement('div');
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private drawnAt = -Infinity;
  private fit!: CanvasFit;

  /** Level unloaded: remove the map from the HUD. */
  dispose() {
    this.fit.dispose();
    this.root.remove();
  }

  constructor(parent: HTMLElement, data: MapData) {
    this.root.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.label.className = 'floor';
    this.root.append(this.canvas, this.label);
    parent.appendChild(this.root);
    // 24.0: drawn in SIZE units, shown at the HUD's (rem) size.
    this.fit = new CanvasFit(this.canvas, this.root, SIZE, this.dpr);
    const plan = (rects: R[], fill: string, stroke: string, extra?: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = W * PX;
      c.height = D * PX;
      const g = c.getContext('2d')!;
      g.fillStyle = fill;
      g.strokeStyle = stroke;
      g.lineWidth = 2;
      for (const r of rects) {
        const x = (r.x0 - X0) * PX, z = (r.z0 - Z0) * PX, w = (r.x1 - r.x0) * PX, h = (r.z1 - r.z0) * PX;
        g.fillRect(x, z, w, h);
      }
      for (const r of rects) g.strokeRect((r.x0 - X0) * PX + 1, (r.z0 - Z0) * PX + 1, (r.x1 - r.x0) * PX - 2, (r.z1 - r.z0) * PX - 2);
      extra?.(g);
      return c;
    };
    const stairs = (g: CanvasRenderingContext2D) => {
      g.strokeStyle = 'rgba(255,214,122,0.55)';
      g.lineWidth = 1.5;
      for (const r of data.stairs) {
        const x0 = (r.x0 - X0) * PX, z0 = (r.z0 - Z0) * PX, x1 = (r.x1 - X0) * PX, z1 = (r.z1 - Z0) * PX;
        const along = x1 - x0 > z1 - z0;
        g.beginPath();
        for (let k = 0; k <= 1; k += 0.125) {
          if (along) {
            g.moveTo(x0 + (x1 - x0) * k, z0);
            g.lineTo(x0 + (x1 - x0) * k, z1);
          } else {
            g.moveTo(x0, z0 + (z1 - z0) * k);
            g.lineTo(x1, z0 + (z1 - z0) * k);
          }
        }
        g.stroke();
      }
    };
    this.floors = {
      street: plan(data.street, 'rgba(120,235,255,0.16)', 'rgba(120,235,255,0.35)', stairs),
      upper: plan(data.upper, 'rgba(160,240,255,0.22)', 'rgba(170,245,255,0.55)', stairs),
      under: plan(data.under, 'rgba(228,80,138,0.18)', 'rgba(228,80,138,0.5)', stairs),
    };
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  draw(player: THREE.Vector3, yaw: number, objective: THREE.Vector3 | null, blips: Blip[], station: THREE.Vector3 | null, route: THREE.Vector3[] = []) {
    // 17.0: a 2D canvas redrawn (and re-uploaded by the compositor) at most 30 times a second.
    const now = performance.now();
    if (now - this.drawnAt < 1000 / 30 - 1) return;
    this.drawnAt = now;
    const g = this.ctx;
    const s = this.fit.scale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    const floor: Floor = player.y < -2 ? 'under' : player.y > 3 ? 'upper' : 'street';
    this.label.textContent = floor === 'under' ? 'B1 · 地下' : floor === 'upper' ? (player.y > 7 ? 'RF · 屋上' : '2F · 回廊') : '1F · 地上';
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(4,8,16,0.72)';
    g.fillRect(0, 0, SIZE, SIZE);
    // World → map: centre on the player, heading up (the player looks along -z when yaw=0).
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(yaw);
    g.scale(SCALE / PX, SCALE / PX);
    g.translate(-(player.x - X0) * PX, -(player.z - Z0) * PX);
    // Other floors faint for context, current floor on top.
    const order: Floor[] = floor === 'street' ? ['under', 'upper', 'street'] : floor === 'upper' ? ['under', 'street', 'upper'] : ['street', 'upper', 'under'];
    order.forEach((f, i) => {
      g.globalAlpha = i === 2 ? 1 : 0.25;
      g.drawImage(this.floors[f], 0, 0);
    });
    g.globalAlpha = 1;
    g.restore();

    const toScreen = (x: number, z: number) => {
      const dx = (x - player.x) * SCALE;
      const dz = (z - player.z) * SCALE;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      return [SIZE / 2 + dx * c - dz * sn, SIZE / 2 + dx * sn + dz * c] as [number, number];
    };
    const R = SIZE / 2 - 10;
    const clampEdge = (p: [number, number]) => {
      const dx = p[0] - SIZE / 2, dy = p[1] - SIZE / 2;
      const d = Math.hypot(dx, dy);
      return d > R ? ([SIZE / 2 + (dx / d) * R, SIZE / 2 + (dy / d) * R] as [number, number]) : p;
    };
    // Station marker.
    if (station) {
      const [x, y] = clampEdge(toScreen(station.x, station.z));
      g.fillStyle = '#e4508a';
      g.font = 'bold 11px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('S', x, y);
      g.strokeStyle = 'rgba(228,80,138,0.8)';
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.stroke();
    }
    // Known guards: view cones first (under everything), then the dots.
    for (const b of blips) {
      if (!b.cone) continue;
      const [x0, y0] = toScreen(b.x, b.z);
      if (Math.hypot(x0 - SIZE / 2, y0 - SIZE / 2) > R + 70) continue;
      const { yaw: cy, half, dists, dashed } = b.cone;
      g.beginPath();
      g.moveTo(x0, y0);
      dists.forEach((d, i) => {
        const a = cy - half + (2 * half * i) / (dists.length - 1);
        const [x, y] = toScreen(b.x + Math.sin(a) * d, b.z + Math.cos(a) * d);
        g.lineTo(x, y);
      });
      g.closePath();
      const k = 0.35 + 0.65 * b.fresh;
      g.fillStyle = `rgba(${b.color},${(dashed ? 0.08 : 0.2) * k})`;
      g.fill();
      g.setLineDash(dashed ? [3, 3] : []);
      g.strokeStyle = `rgba(${b.color},${0.55 * k})`;
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }
    for (const b of blips) {
      const [x, y] = toScreen(b.x, b.z);
      if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > R + 4) continue;
      g.globalAlpha = 0.25 + 0.75 * b.fresh;
      const col = b.hot ? '#ff3b5c' : `rgb(${b.color})`;
      g.beginPath();
      g.arc(x, y, b.hot ? 4 : 3.2, 0, Math.PI * 2);
      if (b.sameFloor) {
        g.fillStyle = col;
        g.fill();
      } else {
        // Another floor: hollow, with an arrow up or down.
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = col;
        g.font = '9px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.dir > 0 ? '▲' : '▼', x + 8, y);
      }
    }
    g.globalAlpha = 1;
    // Route to the objective along streets and stairs (dotted; brighter on the player's level).
    if (route.length > 1) {
      g.lineWidth = 2;
      g.setLineDash([2, 4]);
      g.lineCap = 'round';
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        const same = Math.abs(a.y - player.y) < 2 && Math.abs(b.y - player.y) < 2;
        g.strokeStyle = same ? 'rgba(255,210,122,0.85)' : 'rgba(255,210,122,0.35)';
        const [x0, y0] = toScreen(a.x, a.z);
        const [x1, y1] = toScreen(b.x, b.z);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      g.setLineDash([]);
    }
    // Objective.
    if (objective) {
      const [x, y] = clampEdge(toScreen(objective.x, objective.z));
      g.fillStyle = 'rgba(255,210,122,0.95)';
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 5, y);
      g.closePath();
      g.fill();
      const dy = objective.y - player.y;
      if (Math.abs(dy) > 2.5) {
        g.font = '9px sans-serif';
        g.fillText(dy > 0 ? '▲' : '▼', x + 8, y);
      }
    }
    // The player.
    g.fillStyle = '#e8fbff';
    g.beginPath();
    g.moveTo(SIZE / 2, SIZE / 2 - 7);
    g.lineTo(SIZE / 2 + 5, SIZE / 2 + 5);
    g.lineTo(SIZE / 2, SIZE / 2 + 2);
    g.lineTo(SIZE / 2 - 5, SIZE / 2 + 5);
    g.closePath();
    g.fill();
  }
}
