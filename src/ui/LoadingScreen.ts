/**
 * 44.0, the loading screen: the map's name, what is being done, a bar and the percentage, over
 * everything. Plain DOM built once; the bar is a scaleX transform with a transition, so it keeps
 * creeping on the compositor through a long synchronous step (a level's build) the page can't paint
 * in, and the percentage catches up at the step's end. Never goes backwards within one load.
 */
export class LoadingScreen {
  readonly root = document.createElement('div');
  private title = document.createElement('div');
  private sub = document.createElement('div');
  private bar = document.createElement('i');
  private pct = document.createElement('div');
  private what = document.createElement('div');
  private shownAt = 0;
  private frac = 0;
  /** On screen (a load in progress). */
  active = false;

  constructor(parent: HTMLElement) {
    this.root.className = 'loading-screen layer hidden';
    this.title.className = 'ls-title';
    this.sub.className = 'ls-sub';
    const track = document.createElement('div');
    track.className = 'ls-track';
    track.appendChild(this.bar);
    const row = document.createElement('div');
    row.className = 'ls-row';
    this.what.className = 'ls-what';
    this.pct.className = 'ls-pct';
    row.append(this.what, this.pct);
    this.root.append(this.title, this.sub, track, row);
    parent.appendChild(this.root);
  }

  /** Start a load: the name, its line in the place's script, from 0%. */
  show(title: string, sub = '') {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.frac = 0;
    this.paint(0, '', 0);
    // On at once (it covers a build); only the way out fades. (One reflow a load, so the fade is skipped.)
    this.root.style.transition = 'none';
    this.root.classList.remove('hidden');
    void this.root.offsetWidth;
    this.root.style.transition = '';
    this.active = true;
    this.shownAt = performance.now();
  }

  /**
   * Progress `f` (0..1) and what is being done. `creep`: a long step follows that can't paint, the bar
   * eases on towards `f` over that many seconds (the number shows `from` until the next call).
   */
  set(f: number, what: string, creep = 0) {
    if (!this.active) return;
    const shown = this.frac;
    this.frac = Math.max(this.frac, Math.min(1, f));
    this.paint(this.frac, what, creep, creep ? shown : this.frac);
  }

  private paint(f: number, what: string, creep: number, number = f) {
    this.bar.style.transition = creep ? `transform ${creep}s cubic-bezier(0.2, 0.6, 0.4, 1)` : 'transform 0.2s ease-out';
    this.bar.style.transform = `scaleX(${f})`;
    this.pct.textContent = `${Math.round(number * 100)}%`;
    this.what.textContent = what;
  }

  /** Done: 100%, then fades out (at least `minMs` on screen, so a quick load doesn't flash). */
  async hide(minMs = 350) {
    if (!this.active) return;
    this.set(1, this.what.textContent ?? '');
    const left = minMs - (performance.now() - this.shownAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    this.root.classList.add('hidden');
    this.active = false;
  }
}
