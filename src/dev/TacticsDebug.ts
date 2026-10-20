import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { TacticalEnemy } from '../enemies/Enemy';
import { isProtected } from '../enemies/tactics/Cover';

const MAX = 4000;
const ROLE_COLOUR: Record<string, [number, number, number]> = {
  suppressor: [1, 0.35, 0.2],
  flanker: [0.3, 0.8, 1],
  rusher: [1, 0.2, 0.7],
  sniper: [1, 0.9, 0.3],
  none: [0.7, 0.7, 0.7],
};

/**
 * DEV only. Survival tactics overlay (`__dev.tactics(true)`): per enemy a label (role, side, action,
 * phase, suppression), a line to its cover (green while that cover still hides a crouched body from
 * him, red once it's blown) and its peek spot, rushers' staging slots, the squad's LKP and hunt goal,
 * search points (grey when checked), and a HUD line with mode, shooters and scheduler counters.
 */
export class TacticsDebug {
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
    this.game.scene.remove(this.lines);
    this.labels.remove();
    if (!on) return;
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

  private cross(p: THREE.Vector3, s: number, c: [number, number, number], y = 0.05) {
    this.seg(new THREE.Vector3(p.x - s, p.y + y, p.z), new THREE.Vector3(p.x + s, p.y + y, p.z), c);
    this.seg(new THREE.Vector3(p.x, p.y + y, p.z - s), new THREE.Vector3(p.x, p.y + y, p.z + s), c);
  }

  private frame() {
    const g = this.game;
    if (!this.lines.parent || this.lines.parent !== g.scene) g.scene.add(this.lines);
    const sq = g.waves.squad;
    const cam = g.camera;
    const pp = g.player.pos;
    const los = (a: THREE.Vector3, b: THREE.Vector3) => g.col.lineOfSight(a, b);
    this.n = 0;
    let html = '';
    for (const e of g.waves.enemies as TacticalEnemy[]) {
      if (!e.alive || !e.tac) continue;
      const t = e.tac;
      const c = ROLE_COLOUR[t.role] ?? ROLE_COLOUR.none;
      const base = new THREE.Vector3(e.pos.x, e.pos.y + 0.15, e.pos.z);
      if (t.coverPos) {
        const ok = isProtected(t.coverPos, pp, los).ok;
        this.seg(base, t.coverPos.clone().setY(t.coverPos.y + 0.15), ok ? [0.2, 1, 0.3] : [1, 0.15, 0.15]);
        this.cross(t.coverPos, 0.45, ok ? [0.2, 1, 0.3] : [1, 0.15, 0.15], 0.15);
        if (t.peekPos) this.cross(t.peekPos, 0.25, [1, 1, 1], 0.2);
      }
      if (t.stagePos) {
        this.seg(base, t.stagePos.clone().setY(t.stagePos.y + 0.15), t.go ? [1, 0.1, 0.1] : c);
        this.cross(t.stagePos, 0.6, c, 0.15);
      }
      if (t.goal && t.action !== 'takeCover') this.seg(base, t.goal.clone().setY(t.goal.y + 0.15), [0.9, 0.9, 0.3]);
      if (t.sees) this.seg(new THREE.Vector3(e.pos.x, e.pos.y + 1.5, e.pos.z), new THREE.Vector3(pp.x, pp.y + 1.4, pp.z), [0.3, 1, 0.4]);
      const sp = new THREE.Vector3(e.pos.x, e.pos.y + 2.55, e.pos.z).project(cam);
      if (sp.z < 1) {
        const x = (sp.x * 0.5 + 0.5) * innerWidth, y = (-sp.y * 0.5 + 0.5) * innerHeight;
        const side = t.side ? (t.side > 0 ? ' L' : ' R') : '';
        html += `<div style="position:absolute;left:${x | 0}px;top:${y | 0}px;transform:translate(-50%,-100%);color:rgb(${c.map((k) => (k * 255) | 0).join(',')});background:#000a;padding:1px 4px;white-space:nowrap">${t.role}${side} · ${t.action}${t.phase ? '/' + t.phase : ''}${t.sees ? ' ◉' : ''}${t.suppression > 0.05 ? ` s${t.suppression.toFixed(1)}` : ''}${t.go ? ' GO' : t.staged ? ' staged' : ''}</div>`;
      }
    }
    if (sq.lkp) this.cross(sq.lkp, 1.2, [1, 0.2, 1]);
    if (sq.mode === 'hunt') this.cross(sq.huntGoal, 0.9, [1, 0.6, 1]);
    if (sq.mode === 'search') for (const p of sq.searchPts) this.cross(p.pos, 0.5, p.done ? [0.4, 0.4, 0.4] : p.by ? [0.3, 0.8, 1] : [0.8, 0.8, 0.8]);
    const st = sq.sched.stats;
    html += `<div style="position:absolute;left:12px;top:120px;color:#fff;background:#000a;padding:2px 6px">SQUAD ${sq.mode.toUpperCase()} · LKP ${sq.lkp ? `${sq.lkpSource} ${(g.ctx.time - sq.lkpT).toFixed(1)}s` : '—'} · shooters ${sq.shooters} · decides/frame ≤${st.maxThinks} · rays/frame ≤${st.maxRays} · deferred ${st.deferred}</div>`;
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.labels.innerHTML = html;
  }
}
