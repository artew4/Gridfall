import * as THREE from 'three';
import { fitStairWidth } from './StairFit';
import type { BuildCtx } from './City';
import { worldBox } from './Builder';
import { perforatedTexture } from './Textures';
import { applyWet } from './Ground';

/** Height of the walkable upper level (walkways, balconies, galleries). */
export const DECK = 4.5;
const SLAB = 0.2;
const RAIL_H = 1.05;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Outward edge of a rectangle: n = -z, s = +z, w = -x, e = +x. */
export type Edge = 'n' | 's' | 'e' | 'w';

export interface StairSpec {
  /** Footprint. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  axis: 'x' | 'z';
  /** +1 if it rises towards +axis, -1 if towards -axis. */
  rise: 1 | -1;
  /** Sides that get a railing (the others sit against a wall). */
  rails: Edge[];
  top?: number;
  /** Height of the low end (default 0). */
  bottom?: number;
  /** Railings can be jumped over (default true; false over long drops). */
  vault?: boolean;
}

/**
 * Builds the walkable upper level: slab walkways with railings and support columns, solid concrete
 * stairs (visual steps over a smooth invisible ramp), and records rain shelters / surfaces.
 */
export class Architecture {
  /** Areas that keep rain off whatever is below `y`. */
  shelters: (Rect & { y: number })[] = [];
  /** Extra rain-splash surfaces above the ground. */
  surfaces: (Rect & { y: number })[] = [];
  /** Walkway rects at deck height (for zones and dev checks). */
  decks: Rect[] = [];
  stairs: StairSpec[] = [];
  deckMat: THREE.MeshStandardMaterial;
  railMat: THREE.MeshStandardMaterial;
  panelMat: THREE.MeshStandardMaterial;
  stripMat: THREE.MeshBasicMaterial;
  stairMat: THREE.MeshStandardMaterial;

  constructor(private ctx: BuildCtx) {
    const m = ctx.mats;
    this.deckMat = new THREE.MeshStandardMaterial({ map: m.concrete.map, color: 0x7a7a84, roughness: 0.5, envMapIntensity: 1.0 });
    applyWet(this.deckMat, ctx.time, { puddles: true, wet: 0.75 });
    this.stairMat = new THREE.MeshStandardMaterial({ map: m.concrete.map, color: 0x8a8a92, roughness: 0.6, envMapIntensity: 0.8 });
    this.railMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.1 });
    const g = perforatedTexture();
    g.repeat.set(6, 1.5);
    this.panelMat = new THREE.MeshStandardMaterial({ map: g, color: 0x7a8490, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    // Cold turquoise LED strip on walkway edges: the colour of the upper level.
    this.stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.6, 1.5) });
  }

  /** A slab walkway with railings on the given edges, minus gaps (where stairs or other walkways join). */
  walkway(r: Rect, rails: { edge: Edge; from?: number; to?: number; vault?: boolean }[], columns: [number, number][] = [], y = DECK) {
    const { builder: b, col, mats } = this.ctx;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    b.add(worldBox(w, SLAB, d, 3), this.deckMat, cx, y - SLAB / 2, cz);
    // Thicker beam under the open edges reads as structure from below.
    col.add(r.x0, y - SLAB, r.z0, r.x1, y, r.z1, 'concrete');
    this.shelters.push({ ...r, y: y - SLAB });
    this.surfaces.push({ ...r, y });
    this.decks.push(r);
    for (const rl of rails) this.rail(r, rl.edge, rl.from, rl.to, y, rl.vault ?? true);
    for (const [x, z] of columns) {
      b.add(worldBox(0.4, y - SLAB, 0.4, 2), mats.darkConcrete, x, (y - SLAB) / 2, z);
      col.addCentered(x, (y - SLAB) / 2, z, 0.4, y - SLAB, 0.4, 'concrete');
    }
  }

  /** Walkable roof: wet deck surface over a building top (the building box is the collider). */
  roofDeck(r: Rect, y: number) {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((r.x1 - r.x0) / 3), uv.getY(i) * ((r.z1 - r.z0) / 3));
    g.rotateX(-Math.PI / 2);
    this.ctx.builder.add(g, this.deckMat, (r.x0 + r.x1) / 2, y + 0.012, (r.z0 + r.z1) / 2);
    this.surfaces.push({ ...r, y });
    this.decks.push(r);
  }

  /**
   * Concrete parapet along an axis-aligned segment. Low ones (0.55 m) can be jumped over to drop to a
   * walkway or stair below; high ones (1.1 m) guard long drops and are never vaultable.
   */
  parapet(x0: number, z0: number, x1: number, z1: number, y: number, low: boolean) {
    const { builder: b, col, mats } = this.ctx;
    const h = low ? 0.55 : 1.1;
    const t = 0.28;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.add(alongX ? worldBox(len, h, t, 2) : worldBox(t, h, len, 2), mats.darkConcrete, cx, y + h / 2, cz);
    // Cap trim catches light on the edge.
    b.add(alongX ? worldBox(len, 0.05, t + 0.06, 1) : worldBox(t + 0.06, 0.05, len, 1), this.railMat, cx, y + h + 0.025, cz);
    const c = alongX ? col.add(Math.min(x0, x1), y, cz - t / 2, Math.max(x0, x1), y + h, cz + t / 2, 'concrete') : col.add(cx - t / 2, y, Math.min(z0, z1), cx + t / 2, y + h, Math.max(z0, z1), 'concrete');
    c.vault = low;
    return c;
  }

  /** Railing along one edge of a rect (from/to clip it along the edge). */
  rail(r: Rect, edge: Edge, from?: number, to?: number, y = DECK, vault = true) {
    const { builder: b, col } = this.ctx;
    const alongX = edge === 'n' || edge === 's';
    const a0 = from ?? (alongX ? r.x0 : r.z0);
    const a1 = to ?? (alongX ? r.x1 : r.z1);
    const len = a1 - a0;
    if (len <= 0.05) return;
    const fixed = edge === 'n' ? r.z0 : edge === 's' ? r.z1 : edge === 'w' ? r.x0 : r.x1;
    const inset = edge === 'n' || edge === 'w' ? 0.06 : -0.06;
    const f = fixed + inset;
    const mid = (a0 + a1) / 2;
    const at = (a: number, yy: number): [number, number, number] => (alongX ? [a, yy, f] : [f, yy, a]);
    const box = (along: number, hgt: number, thick: number) => (alongX ? worldBox(along, hgt, thick, 1) : worldBox(thick, hgt, along, 1));
    // Handrail, kick plate, grille panel and posts.
    b.add(box(len, 0.06, 0.08), this.railMat, ...at(mid, y + RAIL_H));
    b.add(box(len, 0.12, 0.05), this.railMat, ...at(mid, y + 0.06));
    const panel = alongX ? new THREE.PlaneGeometry(len, 0.8) : new THREE.PlaneGeometry(len, 0.8).rotateY(Math.PI / 2);
    b.add(panel, this.panelMat, ...at(mid, y + 0.55));
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) b.add(box(0.06, RAIL_H, 0.06), this.railMat, ...at(a0 + (len * i) / n, y + RAIL_H / 2));
    // LED strip under the outer slab edge.
    const sf = fixed + (edge === 'n' || edge === 'w' ? -0.01 : 0.01);
    b.add(box(len, 0.04, 0.02), this.stripMat, ...(alongX ? [mid, y - SLAB - 0.03, sf] : [sf, y - SLAB - 0.03, mid]) as [number, number, number]);
    const t = 0.12;
    const c = alongX ? col.add(a0, y, f - t / 2, a1, y + RAIL_H, f + t / 2, 'metal') : col.add(f - t / 2, y, a0, f + t / 2, y + RAIL_H, a1, 'metal');
    c.vault = vault;
    return c;
  }

  /**
   * Solid concrete stair: a stepped extrusion for the eye, a smooth ramp for the feet (no camera
   * bounce), stepped fill boxes underneath for bullets and to keep anyone from walking under it.
   */
  stair(spec: StairSpec) {
    const { builder: b, col } = this.ctx;
    const top = spec.top ?? DECK;
    const bot = spec.bottom ?? 0;
    // 8.1: never into a wall (StairFit): narrowed to the face of a wall intruding into its width;
    // 9.1: and never flush with one (STAIR_GAP clear of any wall beside it).
    const fit = fitStairWidth(col.colliders, spec, spec.axis, Math.min(bot, top), Math.max(bot, top));
    if (fit.blocked.length) console.warn('[stair] runs into a wall', [spec.x0, spec.z0, spec.x1, spec.z1], fit.blocked.map((c) => [c.min.toArray(), c.max.toArray()]));
    const s: StairSpec = { ...spec, ...fit.rect };
    const H = top - bot;
    const alongX = s.axis === 'x';
    const L = alongX ? s.x1 - s.x0 : s.z1 - s.z0;
    const W = alongX ? s.z1 - s.z0 : s.x1 - s.x0;
    const steps = Math.round(H / 0.25);
    const run = L / steps;
    const rise = H / steps;

    // Stepped profile in (run, height), extruded across the width.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i < steps; i++) {
      shape.lineTo(i * run, (i + 1) * rise);
      shape.lineTo((i + 1) * run, (i + 1) * rise);
    }
    shape.lineTo(L, 0);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
    // Local: x = run direction, y = up, z = across. Map onto the world with a proper rotation.
    const runDir = alongX ? new THREE.Vector3(s.rise, 0, 0) : new THREE.Vector3(0, 0, s.rise);
    const up = new THREE.Vector3(0, 1, 0);
    const across = new THREE.Vector3().crossVectors(runDir, up);
    // Half a riser down so the smooth ramp passes through the middle of every tread.
    const start = new THREE.Vector3(0, bot - rise / 2, 0);
    if (alongX) start.x = s.rise > 0 ? s.x0 : s.x1;
    else start.z = s.rise > 0 ? s.z0 : s.z1;
    // `across` points to one side; start the extrusion on the side it points away from.
    if (alongX) start.z = across.z > 0 ? s.z0 : s.z1;
    else start.x = across.x > 0 ? s.x0 : s.x1;
    const m = new THREE.Matrix4().makeBasis(runDir, up, across).setPosition(start);
    b.addMatrix(geo, this.stairMat, m);
    geo.dispose();

    // Feet: smooth ramp.
    col.addRamp(s.x0, s.z0, s.x1, s.z1, s.axis, s.rise > 0 ? bot : top, s.rise > 0 ? top : bot);
    // Bullets and walls: stepped fill boxes, tops never above the ramp, excluded from standing.
    const seg = 8;
    for (let i = 1; i < seg; i++) {
      const h = bot + (H * i) / seg;
      const a = (L * i) / seg;
      const a2 = (L * (i + 1)) / seg;
      let c;
      if (alongX) {
        const xa = s.rise > 0 ? s.x0 + a : s.x1 - a2;
        c = col.add(xa, bot, s.z0, xa + (a2 - a), h, s.z1, 'concrete');
      } else {
        const za = s.rise > 0 ? s.z0 + a : s.z1 - a2;
        c = col.add(s.x0, bot, za, s.x1, h, za + (a2 - a), 'concrete');
      }
      c.floor = false;
    }

    // Railings following the slope on the open sides.
    for (const e of s.rails) {
      const fixed = e === 'n' ? s.z0 : e === 's' ? s.z1 : e === 'w' ? s.x0 : s.x1;
      const inset = e === 'n' || e === 'w' ? 0.06 : -0.06;
      const f = fixed + inset;
      const slope = Math.atan2(H, L);
      const len = Math.hypot(H, L);
      const midA = alongX ? (s.x0 + s.x1) / 2 : (s.z0 + s.z1) / 2;
      // Handrail rotated to the slope.
      const rot = alongX ? [0, 0, s.rise * slope] : [-s.rise * slope, 0, 0];
      const rail = alongX ? worldBox(len, 0.06, 0.08, 1) : worldBox(0.08, 0.06, len, 1);
      const pos: [number, number, number] = alongX ? [midA, bot + H / 2 + RAIL_H, f] : [f, bot + H / 2 + RAIL_H, midA];
      b.add(rail, this.railMat, pos[0], pos[1], pos[2], rot[0], rot[1], rot[2]);
      const n = Math.max(2, Math.round(L / 1.4));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const h = bot + H * t;
        const a = alongX ? (s.rise > 0 ? s.x0 + L * t : s.x1 - L * t) : s.rise > 0 ? s.z0 + L * t : s.z1 - L * t;
        const p: [number, number, number] = alongX ? [a, h + RAIL_H / 2, f] : [f, h + RAIL_H / 2, a];
        b.add(worldBox(0.06, RAIL_H, 0.06, 1), this.railMat, ...p);
      }
      // Side collider: keeps walkers on the stair; leaves the bottom step open from the side.
      const t = 0.12;
      const open = 0.8;
      if (alongX) {
        const xa = s.rise > 0 ? s.x0 + open : s.x0;
        const xb = s.rise > 0 ? s.x1 : s.x1 - open;
        const c = col.add(xa, bot, f - t / 2, xb, top + RAIL_H, f + t / 2, 'metal');
        c.ray = false;
        c.vault = s.vault ?? true;
      } else {
        const za = s.rise > 0 ? s.z0 + open : s.z0;
        const zb = s.rise > 0 ? s.z1 : s.z1 - open;
        const c = col.add(f - t / 2, bot, za, f + t / 2, top + RAIL_H, zb, 'metal');
        c.ray = false;
        c.vault = s.vault ?? true;
      }
    }
    this.stairs.push(s);
  }
}
