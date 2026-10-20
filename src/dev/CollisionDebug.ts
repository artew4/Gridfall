import * as THREE from 'three';
import type { Game } from '../core/Game';

const MAX_LINES = 40000;

/**
 * DEV only. Draws the physics next to the visuals, around the camera:
 *  - solid colliders red, bullet/sight-only blue, walkable ramps green, vault rails orange,
 *    the stopped/moving train's colliders magenta (dynamic);
 *  - the player's collision cylinder (yellow), the ground point under him (cyan cross) and the
 *    current ground height. Rebuilt a few times a second; off by default.
 */
export class CollisionDebug {
  private pos = new Float32Array(MAX_LINES * 6);
  private colr = new Float32Array(MAX_LINES * 6);
  private geo = new THREE.BufferGeometry();
  private lines: THREE.LineSegments;
  private raf = 0;
  private n = 0;
  private t = 0;
  radius = 25;

  constructor(private game: Game) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colr, 3));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 998;
  }

  set(on: boolean) {
    cancelAnimationFrame(this.raf);
    if (!on) {
      this.game.scene.remove(this.lines);
      return;
    }
    this.game.scene.add(this.lines);
    const tick = (now: number) => {
      if (now - this.t > 200) {
        this.t = now;
        this.frame();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: [number, number, number]) {
    if (this.n >= MAX_LINES) return;
    this.pos.set([ax, ay, az, bx, by, bz], this.n * 6);
    this.colr.set([...c, ...c], this.n * 6);
    this.n++;
  }

  private box(min: THREE.Vector3, max: THREE.Vector3, c: [number, number, number]) {
    const [x0, y0, z0, x1, y1, z1] = [min.x, min.y, min.z, max.x, max.y, max.z];
    for (const y of [y0, y1]) {
      this.seg(x0, y, z0, x1, y, z0, c);
      this.seg(x1, y, z0, x1, y, z1, c);
      this.seg(x1, y, z1, x0, y, z1, c);
      this.seg(x0, y, z1, x0, y, z0, c);
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) this.seg(x, y0, z, x, y1, z, c);
  }

  private circle(x: number, y: number, z: number, r: number, c: [number, number, number]) {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
      this.seg(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r, c);
    }
  }

  private frame() {
    const g = this.game;
    const p = g.camera.position;
    const r = this.radius;
    this.n = 0;
    for (const c of g.col.near(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (Math.abs((c.min.y + c.max.y) / 2 - p.y) > 14) continue;
      const col: [number, number, number] = c.dynamic ? [1, 0.2, 1] : c.kind === 'ramp' ? [0.2, 1, 0.3] : c.vault ? [1, 0.6, 0.1] : c.solid ? [1, 0.15, 0.15] : [0.3, 0.5, 1];
      if (!c.solid && !c.ray && c.kind !== 'ramp') continue;
      if (c.kind === 'cyl') {
        this.circle(c.cx!, c.min.y, c.cz!, c.r!, col);
        this.circle(c.cx!, c.max.y, c.cz!, c.r!, col);
      } else this.box(c.min, c.max, col);
    }
    // The player's cylinder and ground contact.
    const pl = g.player;
    this.circle(pl.pos.x, pl.pos.y + 0.02, pl.pos.z, pl.radius, [1, 1, 0.2]);
    this.circle(pl.pos.x, pl.pos.y + 1.8, pl.pos.z, pl.radius, [1, 1, 0.2]);
    const gh = g.col.groundHeightAt(pl.pos.x, pl.pos.z, pl.radius * 0.6, pl.pos.y);
    this.seg(pl.pos.x - 0.3, gh, pl.pos.z, pl.pos.x + 0.3, gh, pl.pos.z, [0.2, 1, 1]);
    this.seg(pl.pos.x, gh, pl.pos.z - 0.3, pl.pos.x, gh, pl.pos.z + 0.3, [0.2, 1, 1]);
    this.geo.setDrawRange(0, this.n * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
