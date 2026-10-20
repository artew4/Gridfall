import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
/** Keep markers this far from the screen edges (px). */
const EDGE = 56;

/**
 * Objective marker on the screen: a diamond with a name, the distance and an up/down arrow when it
 * is on another level. Off screen it slides to the nearest edge and points the way. Behind walls it
 * dims (it still says where, never pretends there's a clear path). Waypoints (stairs, metro
 * entrances on the route) use a smaller hollow marker.
 */
export class Marker {
  target: THREE.Vector3 | null = null;
  root = document.createElement('div');
  private label = document.createElement('div');
  private dist = document.createElement('div');
  private name = '';
  private final = true;
  private climb: -1 | 0 | 1 = 0;
  private occT = 0;
  private occluded = false;

  constructor(parent: HTMLElement, private col: CollisionWorld) {
    this.root.className = 'wmarker hidden';
    this.root.innerHTML = '<i class="wm-diamond"></i><i class="wm-arrow"></i>';
    this.label.className = 'wm-label';
    this.dist.className = 'wm-dist';
    this.root.append(this.label, this.dist);
    parent.appendChild(this.root);
  }

  /** The objective or the next waypoint towards it (null hides the marker). */
  set(p: THREE.Vector3 | null, name = '', final = true, climb: -1 | 0 | 1 = 0) {
    const changed = !p || !this.target || p.distanceToSquared(this.target) > 0.01 || name !== this.name;
    this.target = p ? p.clone() : null;
    this.root.classList.toggle('hidden', !p);
    if (!changed) return;
    this.name = name;
    this.final = final;
    this.climb = climb;
    this.label.textContent = name;
    this.root.classList.toggle('waypoint', !final);
    this.occT = 0;
  }

  /** Positions the marker; returns the straight-line distance to it (or -1). */
  update(camera: THREE.PerspectiveCamera, dt: number, routeMetres: number) {
    if (!this.target) return -1;
    const anchor = _p.copy(this.target).setY(this.target.y + (this.final ? 1.9 : 1.2));
    const d = camera.position.distanceTo(this.target);
    // Occlusion check a few times a second.
    this.occT -= dt;
    if (this.occT <= 0) {
      this.occT = 0.25;
      this.occluded = !this.col.lineOfSight(camera.position, anchor);
    }
    _v.copy(anchor).project(camera);
    const w = window.innerWidth, h = window.innerHeight;
    const behind = _v.z > 1;
    let x = (_v.x * 0.5 + 0.5) * w;
    let y = (-_v.y * 0.5 + 0.5) * h;
    if (behind) {
      x = w - x;
      y = h - y;
    }
    const off = behind || x < EDGE || x > w - EDGE || y < EDGE || y > h - EDGE;
    let angle = 0;
    if (off) {
      // Slide to the edge along the direction from the centre.
      const cx = w / 2, cy = h / 2;
      let dx = x - cx, dy = y - cy;
      if (behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((cx - EDGE) / Math.max(1e-3, Math.abs(dx)), (cy - EDGE) / Math.max(1e-3, Math.abs(dy)));
      x = cx + dx * k;
      y = cy + dy * k;
      angle = Math.atan2(dy, dx);
    }
    this.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.root.classList.toggle('off', off);
    this.root.classList.toggle('occluded', this.occluded && !off);
    (this.root.firstElementChild!.nextElementSibling as HTMLElement).style.transform = `rotate(${angle}rad)`;
    // Fade out when standing on it.
    this.root.style.opacity = d < 2.2 && this.final ? String(Math.max(0, (d - 1.2) / 1)) : '';
    // Walking distance along the route when known (what the objective panel shows too).
    const arrow = this.climb > 0 ? ' ▲' : this.climb < 0 ? ' ▼' : '';
    const txt = `${Math.round(routeMetres > 0 ? routeMetres : d)} M${arrow}`;
    if (this.dist.textContent !== txt) this.dist.textContent = txt;
    return d;
  }

  clear() {
    this.set(null);
  }
}
