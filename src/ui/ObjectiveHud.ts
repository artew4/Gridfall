import type { ObjectiveDef } from '../story/Objectives';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Seconds a new objective's banner stays up. */
const BANNER = 4.8;

/**
 * How the current objective is shown:
 * - a banner in the upper middle when it changes (with "objective complete" for the previous one),
 * - a persistent panel top-left: title, one-line instruction, distance and level,
 * - an overview while TAB is held: why it matters, where, the current hint, the next train,
 * - a hint line under the panel when the mission decides one is due,
 * - one-time control tips at the bottom centre.
 * It only shows what it is given; the mission state decides what that is.
 */
export class ObjectiveHud {
  root = el('div', 'layer objhud');
  private panel = el('div', 'obj-panel');
  private pTag = el('div', 'obj-tag');
  private pTitle = el('div', 'obj-title');
  private pText = el('div', 'obj-text');
  private pDist = el('div', 'obj-dist');
  private pHint = el('div', 'obj-hint');
  private banner = el('div', 'obj-banner');
  private overview = el('div', 'obj-overview');
  private tip = el('div', 'obj-tip');
  private bannerT = 0;
  private hintT = 0;
  private tipT = 0;
  private def: ObjectiveDef | null = null;
  private act = '';
  private actJp = '';

  constructor(parent: HTMLElement) {
    this.panel.append(this.pTag, this.pTitle, this.pText, this.pDist, this.pHint);
    this.root.append(this.panel, this.banner, this.overview, this.tip);
    parent.appendChild(this.root);
    this.clear();
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setAct(n: number, name: string, jp: string) {
    this.act = `ACT ${['I', 'II', 'III', 'IV'][n - 1]} · ${name}`;
    this.actJp = jp;
    this.pTag.innerHTML = `OBJECTIVE<span>${this.act}</span>`;
  }

  /** A new objective (or none). `completed`: the title of the one just finished. */
  set(def: ObjectiveDef | null, completed: string | null, announce = true) {
    this.def = def;
    this.setHint(null);
    if (!def) {
      this.panel.classList.add('empty');
      if (completed) this.flashBanner(`<div class="ob-done">OBJECTIVE COMPLETE</div><div class="ob-title small">${completed}</div>`, 2.2);
      return;
    }
    this.panel.classList.remove('empty');
    this.pTitle.innerHTML = `${def.title}<span class="jp">${def.jp}</span>`;
    this.pText.textContent = def.text;
    this.panel.classList.remove('flash');
    void this.panel.offsetWidth;
    this.panel.classList.add('flash');
    if (announce) {
      this.flashBanner(
        `${completed ? `<div class="ob-done">✓ ${completed}</div>` : `<div class="ob-act">${this.act}<span class="jp">${this.actJp}</span></div>`}` +
          `<div class="ob-label">NEW OBJECTIVE</div><div class="ob-title">${def.title}</div><div class="ob-text">${def.text}</div>`,
        BANNER,
      );
    }
  }

  /** Keeps the instruction current (train times change). */
  refreshText(def: ObjectiveDef | null) {
    if (!def || !this.def || def.step !== this.def.step) return;
    this.def = def;
    if (this.pText.textContent !== def.text) this.pText.textContent = def.text;
  }

  private flashBanner(html: string, seconds: number) {
    this.banner.innerHTML = html;
    this.banner.classList.add('on');
    this.bannerT = seconds;
  }

  /** "42 M · ▲ ROOFTOP · STAIRS UP" (empty string hides the line). */
  setDistance(text: string) {
    if (this.pDist.textContent !== text) this.pDist.textContent = text;
  }

  setHint(text: string | null) {
    this.pHint.textContent = text ? `HINT — ${text}` : '';
    this.pHint.classList.toggle('on', !!text);
    this.hintT = text ? 14 : 0;
  }

  /** One-time control tip (keys in [brackets] are drawn as key caps). */
  showTip(text: string, seconds = 7) {
    this.tip.innerHTML = text.replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
    this.tip.classList.add('on');
    this.tipT = seconds;
  }

  get tipVisible() {
    return this.tipT > 0;
  }

  /** TAB overview: everything the player needs to get going again. */
  setOverview(on: boolean, info?: { where: string; hint: string; train: string }) {
    this.overview.classList.toggle('on', on && !!this.def);
    if (!on || !this.def || !info) return;
    const d = this.def;
    this.overview.innerHTML =
      `<div class="ov-act">${this.act}<span class="jp">${this.actJp}</span></div>` +
      `<div class="ov-title">${d.title}<span class="jp">${d.jp}</span></div>` +
      `<div class="ov-text">${d.text}</div>` +
      `<div class="ov-why">${d.why}</div>` +
      (info.where ? `<div class="ov-row"><b>WHERE</b><span>${info.where}</span></div>` : '') +
      (info.train ? `<div class="ov-row"><b>TRAIN</b><span>${info.train}</span></div>` : '') +
      (info.hint ? `<div class="ov-row"><b>HINT</b><span>${info.hint}</span></div>` : '') +
      `<div class="ov-keys"><kbd>W A S D</kbd> move <kbd>X</kbd> holster / draw <kbd>E</kbd> interact <kbd>SHIFT</kbd> sprint <kbd>SPACE</kbd> jump · vault · climb <kbd>ESC</kbd> pause</div>`;
  }

  update(dt: number) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('on');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.pHint.classList.remove('on');
    }
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) this.tip.classList.remove('on');
    }
  }

  clear() {
    this.def = null;
    this.bannerT = this.hintT = this.tipT = 0;
    this.banner.classList.remove('on');
    this.tip.classList.remove('on');
    this.overview.classList.remove('on');
    this.pHint.classList.remove('on');
    this.panel.classList.add('empty');
    this.pDist.textContent = '';
  }
}
