import type { TeamId } from '../combat/Team';
import * as THREE from 'three';
import type { BarkEvent } from '../enemies/tactics/Barks';
import type { TacAgent } from '../enemies/tactics/Squad';

const _p = new THREE.Vector3();
const LIFE = 1.9;
const MAX = 4;
/** Callouts further than this aren't shown (out of earshot). */
const RANGE = 42;

interface Label {
  el: HTMLDivElement;
  speaker: TacAgent | null;
  t: number;
}

/**
 * Floating callouts above the enemy who said them. In sight they're crisp; behind a wall they're
 * dimmer — heard, not seen (the direction is what a voice would give away anyway). Off screen they
 * sit on the nearest edge. A small pool of DOM nodes, positioned with transforms.
 */
export class BarkView {
  root = document.createElement('div');
  private labels: Label[] = [];
  private w = 0;
  private h = 0;

  constructor(parent: HTMLElement) {
    this.root.className = 'barks';
    parent.appendChild(this.root);
    for (let i = 0; i < MAX; i++) {
      const el = document.createElement('div');
      el.className = 'bark';
      el.style.opacity = '0';
      this.root.appendChild(el);
      this.labels.push({ el, speaker: null, t: LIFE });
    }
  }

  /** 48.0: the player's team (TDM deals it each match; survival's player is ALPHA). */
  allyTeam: TeamId = 'alpha';

  add(e: BarkEvent<TacAgent>) {
    // Reuse the speaker's own label, else the oldest one.
    let l = this.labels.find((x) => x.speaker === e.speaker) ?? this.labels.reduce((a, b) => (a.t > b.t ? a : b));
    l.speaker = e.speaker;
    l.t = 0;
    // TDM: a squadmate's line carries his name (and the team colour).
    const ally = e.speaker.team === this.allyTeam;
    l.el.textContent = ally && e.speaker.name ? `${e.speaker.name}: ${e.text}` : e.text;
    l.el.dataset.kind = e.kind;
    l.el.classList.toggle('synth', e.speaker.look.voice === 'synth');
    l.el.classList.toggle('ally', ally);
  }

  clear() {
    for (const l of this.labels) {
      l.speaker = null;
      l.t = LIFE;
      l.el.style.opacity = '0';
    }
  }

  update(dt: number, cam: THREE.PerspectiveCamera, visible: boolean) {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const l of this.labels) {
      l.t += dt;
      const s = l.speaker;
      if (!s || l.t >= LIFE || !visible) {
        l.el.style.opacity = '0';
        if (l.t >= LIFE) l.speaker = null;
        continue;
      }
      _p.set(s.pos.x, s.pos.y + 2.25, s.pos.z);
      const dist = _p.distanceTo(cam.position);
      if (dist > RANGE) {
        l.el.style.opacity = '0';
        continue;
      }
      _p.project(cam);
      const behind = _p.z > 1;
      let x = (_p.x * 0.5 + 0.5) * this.w;
      let y = (-_p.y * 0.5 + 0.5) * this.h;
      if (behind) {
        x = this.w - x;
        y = this.h - 40;
      }
      x = Math.min(this.w - 90, Math.max(90, x));
      y = Math.min(this.h - 40, Math.max(40, y));
      const fade = Math.min(1, l.t / 0.12) * Math.min(1, (LIFE - l.t) / 0.4);
      const seen = s.alive && s.tac.sees;
      l.el.style.opacity = String(fade * (seen ? 1 : 0.5) * (dist > 25 ? 0.75 : 1));
      l.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%) scale(${Math.max(0.75, 1.1 - dist / 60).toFixed(2)})`;
    }
  }
}
