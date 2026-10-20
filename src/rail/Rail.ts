import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import type { MetroResult } from '../world/Metro';
import { MetroTrain } from './MetroTrain';
import { APPROACH_S, DEPART_S, fmt, Timetable, toReal, type Service } from './Timetable';

export type RailEvent =
  | { type: 'approach'; s: Service }
  | { type: 'arrive'; s: Service }
  | { type: 'doorsOpen'; s: Service }
  | { type: 'closingSoon'; s: Service }
  | { type: 'doorsClosed'; s: Service; aboard: boolean }
  | { type: 'held'; s: Service }
  | { type: 'obstructed'; s: Service }
  | { type: 'depart'; s: Service };

const RUN_IN = 170;
const DOOR_OPEN = [1.0, 2.6];
const HOLD_STEP = 6;
const MAX_HOLDS = 2;
/** Extra dwell per door obstruction (someone standing in a doorway as the doors close). */
const OBSTRUCTION_STEP = 3;
/** Always granted (like the conductor's holds), even if the next train has to wait a little. */
const MIN_OBSTRUCTION = 12;
/** Doors open/close no faster than this (fraction per second): a hold reopens them, never snaps. */
const DOOR_RATE = 1.25;

/**
 * Platform 1 operations: the timetable drives one physical train deterministically (position and
 * doors are a function of the game clock, so pause/resume and restarts are exact), screen doors
 * follow the train doors, boards show the next departures.
 */
export class Rail {
  tt = new Timetable();
  train: MetroTrain;
  onEvent: (e: RailEvent) => void = () => {};
  private current: Service | null = null;
  private phase = '';
  private doorWas = 0;
  private closingFired = false;
  private holds = new Map<number, number>();
  private obstructions = new Map<number, number>();
  /** Current door opening, rate-limited from the timetable's. */
  private doorK = 0;
  private boardT = 0;
  private lastX = -300;
  /** Current train speed (m/s) for audio. */
  speed = 0;

  constructor(scene: THREE.Scene, col: CollisionWorld, private metro: MetroResult) {
    this.train = new MetroTrain(scene, col);
    this.drawBoards();
  }

  /** Seconds of extra dwell granted to a service (door obstruction holds). */
  private extra(s: Service) {
    return (this.holds.get(s.id) ?? 0) + (this.obstructions.get(s.id) ?? 0);
  }

  /** Can `s` stay `more` seconds longer and still be gone before the next train's approach? */
  private roomFor(s: Service, dwell: number, more: number) {
    const next = this.tt.services.find((o) => !o.suspended && o.time > s.time);
    return !next || dwell + more + DEPART_S + 1 <= toReal(next.time - s.time) - APPROACH_S;
  }

  private dwellOf(s: Service) {
    return this.tt.dwell(s) + this.extra(s);
  }

  /**
   * `engaged`: security is fighting the player near the train (holds the escape train's doors).
   * `player` is the fugitive's position (boarding check when the doors finish closing).
   */
  update(dt: number, player: THREE.Vector3, engaged: boolean) {
    this.tt.advance(dt);
    const a = this.active();
    if (!a) {
      if (this.current) this.finish();
      this.train.set(-300, 0, false, 1);
      this.metro.setDoors(0, this.metro.doorwayAt(player));
      this.doorK = 0;
      this.speed = 0;
      this.lastX = -300;
    } else {
      const { s, phase, t } = a;
      if (s !== this.current) this.begin(s);
      const dwell = this.dwellOf(s);
      let x = 0;
      let k = 0;
      if (s.kind === 'deadhead') {
        // Runs straight through at line speed.
        x = (t + (phase === 'approach' ? 0 : 0)) * 20;
      } else if (phase === 'approach') {
        const u = (t + APPROACH_S) / APPROACH_S;
        x = -RUN_IN * (1 - u) * (1 - u);
      } else if (phase === 'stopped') {
        x = 0;
        const [o0, o1] = DOOR_OPEN;
        const c0 = dwell - 3;
        const c1 = dwell - 1.4;
        k = t < o0 ? 0 : t < o1 ? (t - o0) / (o1 - o0) : t < c0 ? 1 : t < c1 ? 1 - (t - c0) / (c1 - c0) : 0;
        if (t > dwell - 6 && !this.closingFired) {
          this.closingFired = true;
          this.onEvent({ type: 'closingSoon', s });
        }
        // Door obstruction: nobody is shut in a doorway. The doors stay open (or reopen) while someone
        // stands there: at least MIN_OBSTRUCTION s, then as long as the timetable has room. The screen
        // doors never close on them either (Metro.setDoors), so the pocket is never a trap.
        if (t > c0 - 0.5 && t < c1 && this.metro.doorwayAt(player) >= 0 && ((this.obstructions.get(s.id) ?? 0) < MIN_OBSTRUCTION || this.roomFor(s, dwell, OBSTRUCTION_STEP))) {
          this.obstructions.set(s.id, (this.obstructions.get(s.id) ?? 0) + OBSTRUCTION_STEP);
          this.closingFired = false;
          this.onEvent({ type: 'obstructed', s });
        }
        // Escape train: if security is engaged at the doors, the conductor holds them (twice at most).
        if (s.escape && engaged && t > c0 - 0.5 && t < c0 && (this.holds.get(s.id) ?? 0) < MAX_HOLDS * HOLD_STEP) {
          this.holds.set(s.id, (this.holds.get(s.id) ?? 0) + HOLD_STEP);
          this.closingFired = false;
          this.onEvent({ type: 'held', s });
        }
      } else {
        const u = t / DEPART_S;
        x = RUN_IN * u * u;
      }
      this.speed = dt > 0 ? Math.abs(x - this.lastX) / dt : this.speed;
      this.lastX = x;
      // Anyone inside rides along (the shell moves; the floor must carry them, not slide away).
      const riding = this.train.inside(player);
      const dx = x - this.train.x;
      this.doorK = k > this.doorK ? Math.min(k, this.doorK + DOOR_RATE * dt) : Math.max(k, this.doorK - DOOR_RATE * dt);
      k = this.doorK;
      this.train.set(x, k, true, 1);
      if (riding && dx !== 0) player.x += dx;
      this.metro.setDoors(k, this.metro.doorwayAt(player));
      if (phase !== this.phase) {
        if (phase === 'stopped') this.onEvent({ type: 'arrive', s });
        if (phase === 'depart') this.onEvent({ type: 'depart', s });
        this.phase = phase;
      }
      if (k > 0.05 && this.doorWas <= 0.05) this.onEvent({ type: 'doorsOpen', s });
      if (k <= 0.001 && this.doorWas > 0.001 && phase === 'stopped') this.onEvent({ type: 'doorsClosed', s, aboard: this.train.inside(player) });
      this.doorWas = k;
    }
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 1;
      this.drawBoards();
    }
  }

  /** Timetable phase with this rail's door holds applied. */
  private active() {
    for (const s of this.tt.services) {
      if (s.suspended) continue;
      const t = toReal(this.tt.now - s.time);
      const dwell = s.kind === 'deadhead' ? 0 : this.dwellOf(s);
      if (t >= -APPROACH_S && t < 0) return { s, phase: 'approach' as const, t };
      if (t >= 0 && t < dwell) return { s, phase: 'stopped' as const, t };
      if (t >= dwell && t < dwell + DEPART_S) return { s, phase: 'depart' as const, t: t - dwell };
    }
    return null;
  }

  private begin(s: Service) {
    this.current = s;
    this.phase = '';
    this.closingFired = false;
    this.doorWas = 0;
    if (s.escape) this.train.setDestination(`急行 ${s.destJp}`, `EXPRESS · ${s.dest}`, '#ffb03a');
    else if (s.kind === 'local') this.train.setDestination(`各停 ${s.destJp}`, `LOCAL · ${s.dest}`, '#7fe8b0');
    else this.train.setDestination('回送', 'NOT IN SERVICE', '#ff6060');
    this.onEvent({ type: 'approach', s });
  }

  private finish() {
    this.current = null;
    this.phase = '';
  }

  /** The departures boards (concourse, platform, street). */
  drawBoards() {
    const rows = this.tt.upcoming(4);
    const a = this.active();
    for (const b of this.metro.boards) {
      const g = b.ctx;
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, 512, 192);
      g.fillStyle = '#e4508a';
      g.fillRect(0, 0, 512, 30);
      g.fillStyle = '#ffffff';
      g.font = 'bold 18px sans-serif';
      g.textBaseline = 'middle';
      g.fillText('桜線  SAKURA LINE · PLATFORM 1', 10, 15);
      g.textAlign = 'right';
      g.fillText(fmt(this.tt.now), 502, 15);
      g.textAlign = 'left';
      rows.forEach((s, i) => {
        const y = 52 + i * 38;
        const here = a && a.s === s && a.phase === 'stopped';
        g.fillStyle = s.escape ? '#ffb03a' : s.kind === 'deadhead' ? '#7a7e86' : '#d8e4f0';
        g.font = 'bold 20px monospace';
        g.fillText(fmt(s.time), 10, y);
        g.font = 'bold 15px sans-serif';
        const kind = s.escape ? (s.note.startsWith('EXTRA') ? '臨時急行' : '終電 急行') : s.kind === 'local' ? '各停' : '回送';
        g.fillText(kind, 82, y);
        g.font = 'bold 17px sans-serif';
        g.fillText(`${s.destJp}  ${s.dest}`, 168, y);
        g.font = '12px sans-serif';
        g.fillStyle = here ? '#7fe8b0' : s.escape ? '#ffb03a' : s.kind === 'local' ? '#ff6a6a' : '#7a7e86';
        g.textAlign = 'right';
        g.fillText(here ? 'BOARDING 乗車中' : s.suspended ? 'SUSPENDED · LOCKDOWN 運休' : s.note, 502, y);
        g.textAlign = 'left';
      });
      b.texture.needsUpdate = true;
    }
  }

  reset() {
    this.tt.reset();
    this.holds.clear();
    this.obstructions.clear();
    this.doorK = 0;
    this.current = null;
    this.phase = '';
    this.doorWas = 0;
    this.train.set(-300, 0, false, 1);
    this.metro.setDoors(0);
    this.drawBoards();
  }
}
