/**
 * A timed sequence of lines. `update` returns the lines whose time has come, including a line at
 * t = 0 on the first update after `start`. Starting again while it runs does nothing.
 */
export class Conversation {
  private t = -1;
  private next = 0;

  constructor(readonly lines: readonly (readonly [number, string])[], readonly length: number) {}

  get running() {
    return this.t >= 0;
  }

  /** Returns false if it was already running. */
  start(): boolean {
    if (this.running) return false;
    this.t = 0;
    this.next = 0;
    return true;
  }

  stop() {
    this.t = -1;
    this.next = 0;
  }

  /** Advances; returns the new lines and whether the conversation just finished. */
  update(dt: number): { lines: string[]; done: boolean } {
    const out: string[] = [];
    if (!this.running) return { lines: out, done: false };
    while (this.next < this.lines.length && this.lines[this.next][0] <= this.t) out.push(this.lines[this.next++][1]);
    this.t += dt;
    if (this.t >= this.length) {
      while (this.next < this.lines.length) out.push(this.lines[this.next++][1]);
      this.stop();
      return { lines: out, done: true };
    }
    return { lines: out, done: false };
  }
}
