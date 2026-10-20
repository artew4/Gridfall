/**
 * Game clock and the Sakura Line departure schedule (platform 1). Pure logic, unit-tested.
 *
 * Time is in game minutes after midnight. One real second is CLOCK_RATE game seconds, so a local
 * every six game minutes is a train every 90 real seconds.
 */

export const CLOCK_RATE = 4;
export const START_TIME = 24; // 00:24
/** Game minutes between scheduled stops of regular trains. */
export const HEADWAY = 6;
/** Real seconds a train spends approaching, at the platform, and leaving. */
export const APPROACH_S = 11;
export const DWELL_S = 24;
export const ESCAPE_DWELL_S = 34;
export const DEPART_S = 9;

export type ServiceKind = 'local' | 'express' | 'deadhead';

export interface Service {
  id: number;
  /** Arrival at the platform (game minutes). */
  time: number;
  kind: ServiceKind;
  dest: string;
  destJp: string;
  /** Boarding this one ends the story. */
  escape: boolean;
  note: string;
}

const LOCAL_DESTS: [string, string][] = [
  ['SHINJUKU-CHUO', '新宿中央'],
  ['IKEBUKURO', '池袋'],
];

export function fmt(min: number): string {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Real seconds → game minutes. */
export const toGame = (s: number) => (s * CLOCK_RATE) / 60;
/** Game minutes → real seconds. */
export const toReal = (min: number) => (min * 60) / CLOCK_RATE;

export class Timetable {
  /** Current game time (minutes). */
  now = START_TIME;
  services: Service[] = [];
  private nextId = 1;

  constructor(start = START_TIME) {
    this.now = start;
    this.build(start, start + 180);
  }

  /** Regular service: locals every headway, every third slot a deadhead running through. */
  private build(from: number, to: number) {
    let slot = 0;
    for (let t = Math.ceil((from + 3) / HEADWAY) * HEADWAY; t < to; t += HEADWAY, slot++) {
      if (slot % 3 === 2) {
        this.services.push({ id: this.nextId++, time: t, kind: 'deadhead', dest: 'NOT IN SERVICE', destJp: '回送', escape: false, note: 'PASSING' });
      } else {
        const [d, j] = LOCAL_DESTS[slot % LOCAL_DESTS.length];
        this.services.push({ id: this.nextId++, time: t, kind: 'local', dest: d, destJp: j, escape: false, note: 'CHECKPOINT 検問' });
      }
    }
  }

  advance(realSeconds: number) {
    this.now += toGame(realSeconds);
  }

  /**
   * Commits the escape train (the last express to Kagerō Bay) for roughly `inMinutes` from now, at a
   * whole minute, keeping it clear of regular services (which are shifted rather than overlapped).
   */
  scheduleEscape(inMinutes: number, extra = false): Service {
    const t = Math.ceil(this.now + inMinutes);
    // Make room: no other train within half a headway of it.
    this.services = this.services.filter((s) => s.escape || Math.abs(s.time - t) >= HEADWAY / 2 || s.time < this.now);
    const s: Service = {
      id: this.nextId++,
      time: t,
      kind: 'express',
      dest: 'KAGERO BAY',
      destJp: '陽炎湾',
      escape: true,
      note: extra ? 'EXTRA 臨時' : 'LAST TRAIN 終電',
    };
    this.services.push(s);
    this.services.sort((a, b) => a.time - b.time);
    return s;
  }

  /** The escape service still to come (or currently at the platform), if any. */
  escapeService(): Service | null {
    return this.services.find((s) => s.escape && s.time + toGame(ESCAPE_DWELL_S) >= this.now) ?? null;
  }

  /** Next `n` services that haven't left yet (for the boards). */
  upcoming(n: number): Service[] {
    return this.services.filter((s) => s.time + toGame(this.dwell(s)) >= this.now).slice(0, n);
  }

  dwell(s: Service) {
    return s.kind === 'deadhead' ? 0 : s.escape ? ESCAPE_DWELL_S : DWELL_S;
  }

  /** The service whose train should be on the line right now, with the phase it's in. */
  active(): { s: Service; phase: 'approach' | 'stopped' | 'depart'; t: number } | null {
    for (const s of this.services) {
      const t = toReal(this.now - s.time); // seconds relative to arrival
      const dwell = this.dwell(s);
      if (t >= -APPROACH_S && t < 0) return { s, phase: 'approach', t };
      if (t >= 0 && t < dwell) return { s, phase: 'stopped', t };
      if (t >= dwell && t < dwell + DEPART_S) return { s, phase: 'depart', t: t - dwell };
    }
    return null;
  }

  /** Real seconds until a service arrives. */
  secondsUntil(s: Service) {
    return toReal(s.time - this.now);
  }

  reset(start = START_TIME) {
    this.now = start;
    this.services = [];
    this.nextId = 1;
    this.build(start, start + 180);
  }
}
