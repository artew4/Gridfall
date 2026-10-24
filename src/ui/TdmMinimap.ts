import type { TeamId } from '../combat/Team';
import { CanvasFit } from './canvasFit';
import type * as THREE from 'three';
import type { Collider } from '../world/Collision';

/** One marker: XZ position, its height (for the above/below arrow) and how strongly it shows (0..1). */
export interface MapDot {
  x: number;
  y: number;
  z: number;
  a: number;
}

/** Texture pixels per metre of the floor plan, and screen pixels per metre. */
const PX = 2;
const SIZE = 184;
const SCALE = 1.5;
/** Plan textures never exceed this (a level of 512 m would still fit at 2 px/m). */
const MAX_TEX = 1024;
/** A dot this far above or below the player is drawn hollow with an arrow (another floor, a tunnel). */
const LEVEL_GAP = 2.5;

/**
 * 12.0, the Team Deathmatch minimap: heading-up, centred on the player. The floor plan is drawn once
 * per level from the collision world itself (so every arena has one, and it is exactly what blocks
 * you): low cover pale, walls and tall structures bright, slabs and roofs faint, stairs amber. Each
 * frame is one rotated blit plus the team's markers: allies in blue, and the hostiles the team has
 * spotted (anyone's line of sight, the human's or a bot's) in red, fading out after it is lost.
 */
export class TdmMinimap {
  root = document.createElement('div');
  /** 48.0: his team's colour (his teammates' dots) and the other's (the spotted): ALPHA blue, OMEGA red. */
  private allyColor = '#7cc8ff';
  private hostileColor = '#ff3344';
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private plan: HTMLCanvasElement;
  private x0: number;
  private z0: number;
  private px: number;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private drawnAt = -Infinity;
  private fit: CanvasFit;

  constructor(parent: HTMLElement, colliders: readonly Collider[], bounds: THREE.Box2) {
    this.root.className = 'minimap tdm-map';
    this.g = this.canvas.getContext('2d')!;
    this.root.append(this.canvas);
    parent.appendChild(this.root);
    // 24.0: drawn in SIZE units, shown at the HUD's (rem) size.
    this.fit = new CanvasFit(this.canvas, this.root, SIZE, this.dpr);
    this.x0 = bounds.min.x;
    this.z0 = bounds.min.y;
    const w = bounds.max.x - bounds.min.x, d = bounds.max.y - bounds.min.y;
    this.px = Math.min(PX, MAX_TEX / Math.max(w, d));
    this.plan = this.drawPlan(colliders, w, d);
  }

  dispose() {
    this.fit.dispose();
    this.root.remove();
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  private drawPlan(colliders: readonly Collider[], w: number, d: number) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * this.px);
    c.height = Math.ceil(d * this.px);
    const g = c.getContext('2d')!;
    const k = this.px;
    const X = (x: number) => (x - this.x0) * k, Z = (z: number) => (z - this.z0) * k;
    // Low things first, so a roof's walls draw over the floor slab under them.
    const list = colliders.filter((cl) => cl.solid || cl.kind === 'ramp').slice().sort((a, b) => a.max.y - b.max.y);
    for (const cl of list) {
      const h = cl.max.y - cl.min.y;
      if (cl.kind === 'ramp') {
        g.fillStyle = 'rgba(255,214,122,0.32)';
        g.fillRect(X(cl.min.x), Z(cl.min.z), (cl.max.x - cl.min.x) * k, (cl.max.z - cl.min.z) * k);
        continue;
      }
      if (cl.kind === 'cyl') {
        g.fillStyle = h > 1.6 ? 'rgba(150,240,255,0.42)' : 'rgba(120,235,255,0.24)';
        g.beginPath();
        g.arc(X(cl.cx!), Z(cl.cz!), Math.max(0.6, cl.r! * k), 0, Math.PI * 2);
        g.fill();
        continue;
      }
      // The stepped fill under a stair is drawn by its ramp.
      if (!cl.floor && h < 4) continue;
      const slab = h < 0.5;
      g.fillStyle = slab ? 'rgba(120,235,255,0.08)' : h > 1.6 ? 'rgba(150,240,255,0.42)' : 'rgba(120,235,255,0.22)';
      g.fillRect(X(cl.min.x), Z(cl.min.z), Math.max(0.8, (cl.max.x - cl.min.x) * k), Math.max(0.8, (cl.max.z - cl.min.z) * k));
    }
    return c;
  }

  /** 27.0: the map's spawn pads on the plan, small hexagons (drawn into it once; a frame stays one blit). */
  private padsDrawn = false;
  drawPads(pads: readonly { x: number; z: number }[]) {
    if (this.padsDrawn) return;
    this.padsDrawn = true;
    const g = this.plan.getContext('2d')!;
    const k = this.px;
    g.strokeStyle = 'rgba(190,250,255,0.8)';
    g.lineWidth = Math.max(1, 0.35 * k);
    for (const p of pads) {
      const x = (p.x - this.x0) * k, z = (p.z - this.z0) * k, r = 1.6 * k;
      g.beginPath();
      for (let i = 0; i <= 6; i++) g[i ? 'lineTo' : 'moveTo'](x + Math.sin((i * Math.PI) / 3) * r, z + Math.cos((i * Math.PI) / 3) * r);
      g.stroke();
    }
  }

  /** 31.0: the deployment zones on the plan: a hexagon in the team's colour and its letter (drawn once). */
  private zonesDrawn = false;
  /** 48.0: his team this match. */
  setSide(team: TeamId) {
    this.allyColor = team === 'alpha' ? '#7cc8ff' : '#ff6a4d';
    // (Spotted hostiles in the other team's colour: red for OMEGA, blue for ALPHA.)
    this.hostileColor = team === 'alpha' ? '#ff3344' : '#5fb8ff';
  }

  drawZones(zones: readonly { x: number; z: number; id: string; team: 'alpha' | 'omega' }[]) {
    if (this.zonesDrawn) return;
    this.zonesDrawn = true;
    const g = this.plan.getContext('2d')!;
    const k = this.px;
    for (const zn of zones) {
      const x = (zn.x - this.x0) * k, z = (zn.z - this.z0) * k, r = 3.2 * k;
      g.strokeStyle = zn.team === 'alpha' ? 'rgba(95,227,255,0.95)' : 'rgba(255,138,42,0.95)';
      g.lineWidth = Math.max(1.5, 0.5 * k);
      g.beginPath();
      for (let i = 0; i <= 6; i++) g[i ? 'lineTo' : 'moveTo'](x + Math.sin((i * Math.PI) / 3) * r, z + Math.cos((i * Math.PI) / 3) * r);
      g.stroke();
      // The letter, stroked small (no fonts): A, B, C.
      const s = r * 0.5;
      g.beginPath();
      if (zn.id === 'A') {
        g.moveTo(x - s * 0.7, z + s);
        g.lineTo(x, z - s);
        g.lineTo(x + s * 0.7, z + s);
        g.moveTo(x - s * 0.4, z + s * 0.25);
        g.lineTo(x + s * 0.4, z + s * 0.25);
      } else if (zn.id === 'B') {
        g.moveTo(x - s * 0.5, z - s);
        g.lineTo(x - s * 0.5, z + s);
        g.lineTo(x + s * 0.5, z + s * 0.5);
        g.lineTo(x - s * 0.5, z);
        g.lineTo(x + s * 0.5, z - s * 0.5);
        g.lineTo(x - s * 0.5, z - s);
      } else g.arc(x, z, s, Math.PI * 0.25, Math.PI * 1.75, true);
      g.stroke();
    }
  }

  /**
   * One frame: the player at `p` looking along `yaw` (the Player's: -z at 0), allies and spotted
   * hostiles. Cheap: a blit and a few arcs.
   */
  draw(p: THREE.Vector3, yaw: number, allies: readonly MapDot[], hostiles: readonly MapDot[], name = '', fronts: readonly FrontMark[] = []) {
    // 17.0: a 2D canvas redrawn (and re-uploaded by the compositor) at most 30 times a second.
    const now = performance.now();
    if (now - this.drawnAt < 1000 / 30 - 1) return;
    this.drawnAt = now;
    const g = this.g;
    g.setTransform(this.fit.scale, 0, 0, this.fit.scale, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(4,8,16,0.72)';
    g.fillRect(0, 0, SIZE, SIZE);
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(yaw);
    g.scale(SCALE / this.px, SCALE / this.px);
    g.translate(-(p.x - this.x0) * this.px, -(p.z - this.z0) * this.px);
    g.drawImage(this.plan, 0, 0);
    g.restore();

    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = SIZE / 2 - 8;
    // 44.0: each lane's line of battle: a dash across the lane where the teams meet, in the colour of
    // whoever pushes there (white: held), under the dots.
    for (const f of fronts) {
      const dx = (f.x - p.x) * SCALE, dz = (f.z - p.z) * SCALE;
      const x = SIZE / 2 + dx * c - dz * s, y = SIZE / 2 + dx * s + dz * c;
      if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > R) continue;
      // Across the axis (ax, az), turned with the map.
      const ux = -f.az * c - f.ax * s, uy = -f.az * s + f.ax * c;
      const L = 7;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(x - ux * L, y - uy * L);
      g.lineTo(x + ux * L, y + uy * L);
      g.stroke();
      g.strokeStyle = f.push === 'alpha' ? '#7cc8ff' : f.push === 'omega' ? '#ff6a4d' : 'rgba(242,251,255,0.85)';
      g.lineWidth = 2.5;
      g.stroke();
      // 46.0: the lane's letter by its line (which flank is which, at a glance).
      if (f.label) {
        g.font = '700 9px ui-monospace, monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const lx = x + ux * (L + 6), ly = y + uy * (L + 6);
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(lx - 5.5, ly - 6, 11, 12);
        g.fillStyle = g.strokeStyle;
        g.fillText(f.label, lx, ly + 0.5);
      }
    }
    const dot = (m: MapDot, color: string, r: number) => {
      const dx = (m.x - p.x) * SCALE, dz = (m.z - p.z) * SCALE;
      const x = SIZE / 2 + dx * c - dz * s, y = SIZE / 2 + dx * s + dz * c;
      if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > R || m.a <= 0.01) return;
      g.globalAlpha = m.a;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      const dy = m.y - p.y;
      if (Math.abs(dy) < LEVEL_GAP) {
        g.fillStyle = color;
        g.fill();
      } else {
        // Another level (a roof, the tunnel): hollow, with an arrow up or down.
        g.strokeStyle = color;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = color;
        g.font = '9px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(dy > 0 ? '▲' : '▼', x + 8, y);
      }
    };
    for (const m of allies) dot(m, this.allyColor, 3.2);
    for (const m of hostiles) dot(m, this.hostileColor, 3.8);
    g.globalAlpha = 1;
    // The player.
    g.fillStyle = '#e8fbff';
    g.beginPath();
    g.moveTo(SIZE / 2, SIZE / 2 - 7);
    g.lineTo(SIZE / 2 + 5, SIZE / 2 + 5);
    g.lineTo(SIZE / 2, SIZE / 2 + 2);
    g.lineTo(SIZE / 2 - 5, SIZE / 2 + 5);
    g.closePath();
    g.fill();
    // 13.0: his name under his arrow.
    if (name) {
      g.font = '600 9px ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(name, SIZE / 2 + 0.8, SIZE / 2 + 9.8);
      g.fillStyle = '#e8fbff';
      g.fillText(name, SIZE / 2, SIZE / 2 + 9);
    }
  }
}

/** 44.0: a lane's line on the minimap: where (x, z), the base-to-base axis (unit), who pushes there. */
export interface FrontMark {
  x: number;
  z: number;
  ax: number;
  az: number;
  push: 'alpha' | 'omega' | null;
  /** 46.0: the lane's letter on the map. */
  label?: string;
}

/** A spotted hostile's dot strength: full while in someone's sight, then fading out over `fade` s. */
export function spotAlpha(age: number, fade: number) {
  const live = 0.15;
  return age <= live ? 1 : Math.max(0, 1 - (age - live) / (fade - live));
}
