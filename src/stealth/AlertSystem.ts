export type AlertLevel = 'unnoticed' | 'suspicious' | 'alerted' | 'pursuit' | 'search';

export interface Known {
  x: number;
  y: number;
  z: number;
  /** Time of the information. */
  t: number;
  /** Where it came from. */
  source: 'guard' | 'civilian' | 'gunshot';
}

/** Seconds of no confirmed contact before pursuit turns into a search. */
export const PURSUIT_LOSS = 7;
/** Search duration after contact is lost. */
export const SEARCH_TIME = 38;
/** How long an unconfirmed report keeps security alerted. */
export const ALERTED_TIME = 30;
/** Civilian reports closer together than this are merged. */
export const REPORT_COOLDOWN = 15;
/** After an episode ends, security stays "hunting" (faster recognition) for this long. */
export const HEAT_TIME = 90;

const RANK: Record<AlertLevel, number> = { unnoticed: 0, suspicious: 1, alerted: 2, search: 3, pursuit: 4 };

/**
 * District-wide wanted state. It only knows what guards and civilians have reported; the actual
 * player position never enters here directly. Guards read `lastKnown` to converge and search.
 */
export class AlertSystem {
  level: AlertLevel = 'unnoticed';
  lastKnown: Known | null = null;
  /** Last confirmed visual contact by any guard. */
  contactT = -Infinity;
  private searchUntil = 0;
  private alertedUntil = 0;
  private lastReportT = -Infinity;
  private heatUntil = -Infinity;
  /** Pursuit episodes so far (a new one starts every time the player is identified from scratch). */
  episodes = 0;
  timesDetected = 0;
  escapes = 0;
  maxRank = 0;
  onChange: (level: AlertLevel, prev: AlertLevel) => void = () => {};

  /** Security is actively looking for the fugitive: holstering no longer makes him anonymous. */
  hunting(t: number) {
    return this.level === 'alerted' || this.level === 'pursuit' || this.level === 'search' || t < this.heatUntil;
  }

  /** Seconds left in the current search (0 otherwise). */
  searchLeft(t: number) {
    return this.level === 'search' ? Math.max(0, this.searchUntil - t) : 0;
  }

  private set(level: AlertLevel) {
    if (level === this.level) return;
    const prev = this.level;
    this.level = level;
    this.maxRank = Math.max(this.maxRank, RANK[level]);
    this.onChange(level, prev);
  }

  /** A guard positively sees the player. */
  sighting(x: number, y: number, z: number, t: number) {
    this.lastKnown = { x, y, z, t, source: 'guard' };
    this.contactT = t;
    if (this.level !== 'pursuit') {
      if (this.level !== 'search') this.episodes++;
      this.timesDetected++;
      this.set('pursuit');
    }
  }

  /**
   * Second-hand information (civilian call, heard gunshot). Raises the alert but never confirms
   * contact; reports during an active pursuit only refresh the position if newer.
   */
  report(x: number, y: number, z: number, t: number, source: 'civilian' | 'gunshot'): boolean {
    if (source === 'civilian' && t - this.lastReportT < REPORT_COOLDOWN && this.level !== 'unnoticed' && this.level !== 'suspicious') {
      // Aggregate: just move the pin.
      if (this.lastKnown && this.lastKnown.source !== 'guard') this.lastKnown = { x, y, z, t, source };
      return false;
    }
    if (source === 'civilian') this.lastReportT = t;
    if (this.level === 'pursuit') {
      if (!this.lastKnown || t - this.lastKnown.t > 2) this.lastKnown = { x, y, z, t, source };
      return true;
    }
    this.lastKnown = { x, y, z, t, source };
    if (this.level === 'search') {
      this.searchUntil = Math.max(this.searchUntil, t + SEARCH_TIME * 0.6);
      return true;
    }
    this.alertedUntil = t + ALERTED_TIME;
    this.set('alerted');
    return true;
  }

  /** `anySuspicious`: some guard has a suspicion meter above the suspicious threshold. */
  update(t: number, anySuspicious: boolean) {
    if (this.level === 'pursuit' && t - this.contactT > PURSUIT_LOSS) {
      this.searchUntil = t + SEARCH_TIME;
      this.set('search');
    } else if (this.level === 'search' && t > this.searchUntil) {
      this.escapes++;
      this.heatUntil = t + HEAT_TIME;
      this.set('unnoticed');
    } else if (this.level === 'alerted' && t > this.alertedUntil) {
      this.set('unnoticed');
    }
    if (this.level === 'unnoticed' && anySuspicious) this.set('suspicious');
    else if (this.level === 'suspicious' && !anySuspicious) this.set('unnoticed');
  }

  reset() {
    this.level = 'unnoticed';
    this.lastKnown = null;
    this.contactT = -Infinity;
    this.searchUntil = this.alertedUntil = 0;
    this.lastReportT = this.heatUntil = -Infinity;
    this.episodes = this.timesDetected = this.escapes = this.maxRank = 0;
  }
}
