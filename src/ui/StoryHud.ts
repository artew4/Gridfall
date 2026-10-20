import type { AlertLevel } from '../stealth/AlertSystem';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const LEVELS: Record<AlertLevel, { en: string; jp: string }> = {
  unnoticed: { en: 'UNNOTICED', jp: '潜伏' },
  suspicious: { en: 'SUSPICIOUS', jp: '不審' },
  alerted: { en: 'ALERTED', jp: '警戒' },
  pursuit: { en: 'PURSUIT', jp: '追跡' },
  search: { en: 'SEARCHING', jp: '捜索' },
};

export interface ThreatMark {
  /** Angle relative to view direction (0 = straight ahead, + = right), radians. */
  angle: number;
  /** 1 noticing (meter), 2 hunting, 3 attacking. */
  level: number;
  /** Suspicion fill 0..1. */
  k: number;
}

/**
 * Story-mode overlay in the HUD's language: wanted status, objective line, radio feed, contextual
 * prompt, and arcs around the crosshair for guards that are noticing or attacking you.
 */
export class StoryHud {
  root = el('div', 'layer');
  private wanted = el('div', 'wanted');
  private wIcon = el('div', 'eye');
  private wLabel = el('div', 'wl');
  private wMeter = el('div', 'meter', '<i></i>');
  private objective = el('div', 'objective');
  private dist = el('span', 'dist');
  private radio = el('div', 'radio');
  private hint = el('div', 'prompt');
  private arcs = el('canvas', 'arcs');
  private ctx: CanvasRenderingContext2D;
  private lines: { e: HTMLElement; t: number }[] = [];
  private level: AlertLevel | null = null;

  constructor(parent: HTMLElement) {
    this.root.id = 'story';
    this.wanted.append(this.wIcon, this.wLabel, this.wMeter);
    this.root.append(this.wanted, this.objective, this.radio, this.hint, this.arcs);
    this.arcs.width = this.arcs.height = 320;
    this.ctx = this.arcs.getContext('2d')!;
    parent.appendChild(this.root);
    this.setWanted('unnoticed', 0);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setWanted(level: AlertLevel, meter: number) {
    if (level !== this.level) {
      this.level = level;
      this.wanted.className = `wanted ${level}`;
      this.wLabel.innerHTML = `${LEVELS[level].en}<span class="jp">${LEVELS[level].jp}</span>`;
    }
    (this.wMeter.firstChild as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, meter)) * 100)}%`;
  }

  setObjective(text: string, jp = '') {
    this.objective.innerHTML = text ? `<span class="tag">OBJECTIVE</span>${text}${jp ? `<span class="jp">${jp}</span>` : ''}` : '';
    this.objective.querySelector('.tag')?.appendChild(this.dist);
    this.objective.classList.remove('flash');
    void this.objective.offsetWidth;
    if (text) this.objective.classList.add('flash');
  }

  /** Distance to the objective marker (hidden when there is none). */
  setDistance(d: number) {
    const t = d < 0 ? '' : ` · ${Math.round(d)} M`;
    if (this.dist.textContent !== t) this.dist.textContent = t;
  }

  radioLine(text: string, tone: 'info' | 'warn' | 'alert' | 'story' = 'info') {
    const e = el('div', `line ${tone}`, text);
    this.radio.appendChild(e);
    this.lines.push({ e, t: tone === 'story' ? 7 : 5 });
    while (this.lines.length > 4) this.lines.shift()!.e.remove();
  }

  setHint(text: string | null) {
    if (!text) {
      this.hint.classList.remove('on');
      return;
    }
    if (this.hint.innerHTML !== text) this.hint.innerHTML = text;
    this.hint.classList.add('on');
  }

  drawThreats(marks: ThreatMark[]) {
    const c = this.ctx;
    c.clearRect(0, 0, 320, 320);
    for (const m of marks) {
      const a = m.angle - Math.PI / 2;
      const r = m.level >= 3 ? 104 : 92;
      const span = m.level >= 3 ? 0.42 : 0.3;
      c.lineCap = 'round';
      // Track.
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(160, 160, r, a - span / 2, a + span / 2);
      c.stroke();
      // Fill.
      const col = m.level >= 3 ? `rgba(255,59,92,${0.65 + 0.35 * Math.sin(performance.now() / 70)})` : m.level === 2 ? 'rgba(255,120,60,0.85)' : 'rgba(255,214,90,0.85)';
      c.strokeStyle = col;
      c.lineWidth = m.level >= 3 ? 5 : 4;
      c.shadowColor = col;
      c.shadowBlur = 8;
      const k = m.level >= 2 ? 1 : Math.max(0.08, m.k);
      c.beginPath();
      c.arc(160, 160, r, a - (span / 2) * k, a + (span / 2) * k);
      c.stroke();
      c.shadowBlur = 0;
    }
  }

  update(dt: number) {
    for (const l of this.lines) {
      l.t -= dt;
      l.e.style.opacity = String(Math.min(1, Math.max(0, l.t)));
    }
    while (this.lines.length && this.lines[0].t <= 0) this.lines.shift()!.e.remove();
  }

  clear() {
    for (const l of this.lines) l.e.remove();
    this.lines.length = 0;
    this.setHint(null);
    this.drawThreats([]);
  }
}
