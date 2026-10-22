import * as THREE from 'three';
import { worldBox, type StaticBuilder } from './Builder';
import type { Collider, CollisionWorld } from './Collision';
import { mulberry32 } from '../core/math';
import { containerTexture } from '../levels/oldport/textures';

/*
  33.0, the shipping container, shared (Old Port's since 17.1; Deep Jungle's since 33.0): a 20 ft box,
  one drawn box and one collider per tier, painted by a canvas (sun-faded paint, ribs, rust runs:
  oldport/textures.containerTexture). The overgrown variant paints moss over the same canvas: thick at
  the foot and along the roof's edge, algae runs down the ribs, lichen spots.
*/

/** A 20 ft container: long side, short side, height (m). */
export const CONT = { L: 6.06, W: 2.44, H: 2.6 };

/** A container (or `n` high) with its long side along x or z from (x0, z0), standing at `y`. */
export function addContainer(b: StaticBuilder, col: CollisionWorld, x0: number, z0: number, along: 'x' | 'z', n: number, mat: THREE.Material, y = 0): Collider[] {
  const x1 = x0 + (along === 'x' ? CONT.L : CONT.W), z1 = z0 + (along === 'x' ? CONT.W : CONT.L);
  const out: Collider[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = y + i * CONT.H, y1 = y + (i + 1) * CONT.H;
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, CONT.H), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    out.push(col.add(x0, y0, z0, x1, y1, z1, 'metal'));
  }
  return out;
}

/** Old Port's container paint, with moss and algae grown over it (the jungle's containers). */
export function overgrownContainerTexture(paint: string, seed = 0) {
  const base = containerTexture(paint, seed);
  const src = base.image as HTMLCanvasElement;
  const S = src.width;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  base.dispose();
  const rnd = mulberry32(3300 + seed);
  // A wash of green damp over the whole box, then the thick moss at the foot (the canvas's bottom: the
  // texture repeats per 2.6 m tier) and a band along the top edge.
  g.fillStyle = 'rgba(54,74,36,0.14)';
  g.fillRect(0, 0, S, S);
  const foot = g.createLinearGradient(0, S, 0, S * 0.55);
  foot.addColorStop(0, 'rgba(48,70,30,0.6)');
  foot.addColorStop(1, 'rgba(48,70,30,0)');
  g.fillStyle = foot;
  g.fillRect(0, S * 0.55, S, S * 0.45);
  const lip = g.createLinearGradient(0, 0, 0, S * 0.18);
  lip.addColorStop(0, 'rgba(62,84,38,0.7)');
  lip.addColorStop(1, 'rgba(62,84,38,0)');
  g.fillStyle = lip;
  g.fillRect(0, 0, S, S * 0.18);
  // Algae runs down from the roof edge, along the ribs.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * 12) * (S / 12) + 4 + rnd() * 6, l = 30 + rnd() * 120;
    const run = g.createLinearGradient(0, 0, 0, l);
    run.addColorStop(0, 'rgba(40,62,28,0.55)');
    run.addColorStop(1, 'rgba(40,62,28,0)');
    g.fillStyle = run;
    g.fillRect(x, 0, 2 + rnd() * 4, l);
  }
  // Lichen and moss cushions.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = S * (0.35 + rnd() * 0.65), r = 3 + rnd() * 12;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rnd() < 0.7 ? '70,96,44' : '120,128,82';
    grd.addColorStop(0, `rgba(${tone},0.75)`);
    grd.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
