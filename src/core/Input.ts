import { CAPTURED } from './Bindings';

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mouseClicked = false;
  /** 11.0: right button held (aim down sights). */
  aimDown = false;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};
  /** The browser refused pointer lock (e.g. re-locking too soon after Esc). */
  onLockError: () => void = () => {};
  onAnyKey: () => void = () => {};

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.onAnyKey();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.aimDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against the occasional huge spike some browsers emit on lock.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.aimDown = true;
        return;
      }
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.aimDown = false;
    });
    // The right button aims: no context menu over the game (or anywhere while the mouse is captured).
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.mouseDown = this.aimDown = false;
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.onLockError());
  }

  requestLock() {
    if (this.locked) return;
    const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => this.onLockError());
  }

  key(code: string) {
    return this.keys.has(code);
  }

  /** Call at end of frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
  }
}
