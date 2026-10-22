/**
 * 24.0: a HUD canvas drawn in a fixed logical size (the minimaps' 184 units) but shown at its CSS box,
 * which scales with the UI (rem): the backing store follows the box's size × the device pixel ratio
 * (a ResizeObserver, so nothing is measured per frame), and `scale` maps logical units to it.
 */
export class CanvasFit {
  scale = 1;
  private ro: ResizeObserver | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly box: HTMLElement, readonly logical: number, readonly dpr = Math.min(2, window.devicePixelRatio || 1)) {
    canvas.style.width = canvas.style.height = '100%';
    this.fit(logical);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fit(this.box.clientWidth || this.logical));
      this.ro.observe(box);
    }
  }

  private fit(css: number) {
    const res = Math.max(32, Math.round(css * this.dpr));
    if (this.canvas.width !== res) this.canvas.width = this.canvas.height = res;
    this.scale = res / this.logical;
  }

  dispose() {
    this.ro?.disconnect();
    this.ro = null;
  }
}
