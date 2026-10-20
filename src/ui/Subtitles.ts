export type Speaker = 'KENJI' | 'STATION PA' | 'DISPATCH' | 'BOARD' | 'NEWS' | 'YOU' | string;

interface Line {
  speaker: Speaker;
  text: string;
  /** Seconds on screen. */
  t: number;
  e: HTMLElement | null;
}

/** Reading time: a floor plus per-character time, so long lines stay up long enough. */
export const readTime = (text: string) => Math.min(9, 2.4 + text.length * 0.055);

const MAX_ON_SCREEN = 2;

/**
 * Subtitles near the bottom centre: speaker name and line, at most two at once, the rest queued
 * (never overlapping, never dropped). Cleared on restart.
 */
export class Subtitles {
  root = document.createElement('div');
  private shown: Line[] = [];
  private queue: Line[] = [];
  /** True while any line from these speakers is on screen or waiting (for music ducking). */
  speaking = false;

  constructor(parent: HTMLElement) {
    this.root.className = 'subtitles';
    parent.appendChild(this.root);
  }

  say(speaker: Speaker, text: string, seconds = readTime(text)) {
    this.queue.push({ speaker, text, t: seconds, e: null });
    this.pump();
  }

  private pump() {
    while (this.shown.length < MAX_ON_SCREEN && this.queue.length) {
      const l = this.queue.shift()!;
      const e = document.createElement('div');
      e.className = `sub sp-${l.speaker.toLowerCase().replace(/[^a-z]/g, '')}`;
      e.innerHTML = `<b>${l.speaker}</b><span>${l.text}</span>`;
      this.root.appendChild(e);
      requestAnimationFrame(() => e.classList.add('on'));
      l.e = e;
      this.shown.push(l);
    }
  }

  update(dt: number) {
    for (const l of this.shown) l.t -= dt;
    while (this.shown.length && this.shown[0].t <= 0) {
      const l = this.shown.shift()!;
      const e = l.e!;
      e.classList.remove('on');
      setTimeout(() => e.remove(), 300);
    }
    this.pump();
    this.speaking = this.shown.length > 0 || this.queue.length > 0;
  }

  get pending() {
    return this.shown.length + this.queue.length;
  }

  clear() {
    for (const l of this.shown) l.e?.remove();
    this.shown.length = 0;
    this.queue.length = 0;
    this.root.innerHTML = '';
    this.speaking = false;
  }
}
