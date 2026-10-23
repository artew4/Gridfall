/**
 * 36.0, the pre-match countdown: "3", "2", "1", then "START!" over the middle of the screen. Plain DOM,
 * built once: one element per step, each animated by CSS on transform and opacity alone (a step plays
 * when its class goes on; nothing is measured or re-laid out). `set` is called every frame and touches
 * the DOM only when the step changes.
 */
export class Countdown {
  readonly root = document.createElement('div');
  private steps: HTMLDivElement[] = [];
  /** The step on screen: 3, 2, 1, 0 (START!), or -1 (none). */
  private shown = -1;

  constructor(parent: HTMLElement, labels = ['START!', '1', '2', '3']) {
    this.root.className = 'countdown';
    labels.forEach((text, i) => {
      const s = document.createElement('div');
      s.className = i === 0 ? 'cd-step go' : 'cd-step';
      s.textContent = text;
      this.steps.push(s);
      this.root.appendChild(s);
    });
    parent.appendChild(this.root);
  }

  /**
   * Seconds left to the start (> 0: the number, ceil'd, from 3 down), or the seconds since it (≤ 0:
   * START! for `goFor` s), or null: nothing.
   */
  set(left: number | null, goFor = 0.9) {
    // Each number plays once (a 1 s animation): above the top one (a longer countdown) nothing shows yet.
    const top = this.steps.length - 1;
    const step = left === null ? -1 : left > top ? -1 : left > 0 ? Math.ceil(left) : -left < goFor ? 0 : -1;
    if (step === this.shown) return;
    if (this.shown >= 0) this.steps[this.shown].classList.remove('on');
    if (step >= 0) this.steps[step].classList.add('on');
    this.shown = step;
  }

  get step() {
    return this.shown;
  }
}
