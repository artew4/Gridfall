import { ARENA, PRESSURE } from './ArenaCtx';

/**
 * 50.0, the pressure on the human (ARENA.pressure). The playtest: he carried his team every match, 20
 * kills and more. His form is read off his last `window` s, kills less 1.5 × deaths, over `scale`, and
 * clamped to -`ease` … 1; the other team's bots read it (PRESSURE.form): quicker to react to him,
 * tighter on him, more often after him, and (from `reveal` up) told where a kill of his came from.
 * Struggling, the same eased. One per match (TdmRules); 0 outside one.
 */
export class Pressure {
  private events: { t: number; v: number }[] = [];

  reset() {
    this.events.length = 0;
    PRESSURE.form = 0;
  }

  kill(now: number) {
    this.events.push({ t: now, v: 1 });
  }

  death(now: number) {
    this.events.push({ t: now, v: -1.5 });
  }

  /** His form now (also written to PRESSURE.form). */
  update(now: number) {
    const P = ARENA.pressure;
    while (this.events.length && now - this.events[0].t > P.window) this.events.shift();
    let sum = 0;
    for (const e of this.events) sum += e.v;
    PRESSURE.form = P.on ? Math.max(-P.ease, Math.min(1, sum / P.scale)) : 0;
    return PRESSURE.form;
  }
}
