import * as THREE from 'three';
import type { Game } from '../core/Game';
import { FOV_COS, VISION } from '../stealth/Perception';

const MAX = 6000;

/**
 * DEV only. World-space overlay for guard AI: view cones at their real range, lines of sight to
 * the player (green clear, red blocked), navigation goals, search points, the shared last known
 * position, and a label per guard with state, suspicion and search role. Off by default.
 */
export class AIDebug {
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private geo = new THREE.BufferGeometry();
  private lines: THREE.LineSegments;
  private labels = document.createElement('div');
  private raf = 0;
  private n = 0;

  constructor(private game: Game) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:11px monospace;z-index:50';
  }

  set(on: boolean) {
    cancelAnimationFrame(this.raf);
    if (!on) {
      this.game.scene.remove(this.lines);
      this.labels.remove();
      return;
    }
    this.game.scene.add(this.lines);
    document.body.appendChild(this.labels);
    const tick = () => {
      this.frame();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private seg(a: THREE.Vector3, b: THREE.Vector3, c: [number, number, number]) {
    if (this.n >= MAX - 2) return;
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], this.n * 3);
    this.col.set([...c, ...c], this.n * 3);
    this.n += 2;
  }

  private cross(p: THREE.Vector3, s: number, c: [number, number, number]) {
    this.seg(p.clone().add(new THREE.Vector3(-s, 0.05, 0)), p.clone().add(new THREE.Vector3(s, 0.05, 0)), c);
    this.seg(p.clone().add(new THREE.Vector3(0, 0.05, -s)), p.clone().add(new THREE.Vector3(0, 0.05, s)), c);
  }

  private frame() {
    const g = this.game;
    const sec = g.tokyo.security;
    this.n = 0;
    let html = '';
    const cam = g.camera;
    const half = Math.acos(FOV_COS);
    const pp = g.player.pos;
    for (const gd of sec.guards) {
      if (!gd.alive) continue;
      const eye = gd.eye.clone();
      const look = gd.lookYaw;
      const r = gd.range;
      const colr: [number, number, number] = gd.hostile ? [1, 0.2, 0.25] : gd.suspicion > 0.3 ? [1, 0.6, 0.2] : [1, 0.85, 0.3];
      // Cone outline at eye height (arc + edges).
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= 12; i++) {
        const a = look - half + (2 * half * i) / 12;
        const q = eye.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
        if (i === 0 || i === 12) this.seg(eye, q, colr);
        if (prev) this.seg(prev, q, colr);
        prev = q;
      }
      // Lines of sight to the body samples when in range.
      if (gd.pos.distanceTo(pp) < r + 1) {
        for (const h of VISION.samples) {
          const s = new THREE.Vector3(pp.x, pp.y + h, pp.z);
          const clear = g.col.lineOfSight(eye, s);
          this.seg(eye, s, clear ? [0.2, 1, 0.4] : [0.8, 0.1, 0.1]);
        }
      }
      // Navigation goal and search plan.
      if (gd.gstate !== 'patrol') this.seg(gd.pos.clone().setY(gd.pos.y + 0.2), gd.goal.clone().setY(gd.goal.y + 0.2), [0.9, 0.9, 0.2]);
      if (gd.gstate === 'search') for (const sp of gd.searchPts) this.cross(sp, 0.5, [0.3, 0.8, 1]);
      if (gd.heard) this.cross(gd.heard.pos, 0.8, [0.6, 0.6, 0.6]);
      const sp = gd.chest.clone().setY(gd.pos.y + 2.3).project(cam);
      if (sp.z < 1) {
        const x = (sp.x * 0.5 + 0.5) * innerWidth, y = (-sp.y * 0.5 + 0.5) * innerHeight;
        html += `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-100%);color:rgb(${colr.map((c) => c * 255).join(',')});background:#0008;padding:1px 4px">${gd.gstate}${gd.gstate === 'search' ? '/' + gd.searchRole : ''} s=${gd.suspicion.toFixed(2)} r=${r}${gd.sees ? ' SEES' : ''}</div>`;
      }
    }
    const k = sec.alert.lastKnown;
    if (k) this.cross(new THREE.Vector3(k.x, k.y, k.z), 1.4, [1, 0.2, 1]);
    html += `<div style="position:absolute;left:12px;top:120px;color:#fff;background:#0008;padding:2px 6px">ALERT ${sec.alert.level} · guards ${sec.active} · budget ${sec.budget}${k ? ` · LKP ${k.source} ${(g.ctx.time - k.t).toFixed(1)}s ago` : ''}</div>`;
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.labels.innerHTML = html;
  }
}
