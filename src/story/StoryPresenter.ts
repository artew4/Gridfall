import type { Game } from '../core/Game';
import { KEYS } from '../core/Bindings';
import { ObjectiveHud } from '../ui/ObjectiveHud';
import { Subtitles, type Speaker } from '../ui/Subtitles';
import { Marker } from '../ui/Marker';
import { Guidance } from './Guidance';
import { ACT_NAMES, type ObjectiveDef } from './Objectives';
import { fmt } from '../rail/Timetable';

/** Seconds without progress before the first hint, and between hints. */
const HINT_FIRST = 50;
const HINT_EVERY = 60;
/** Getting this much closer (route metres) counts as progress. */
const PROGRESS = 6;
const TIPS_KEY = 'neonrain.tips';

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Everything that tells the player what to do: the objective (banner, panel, marker, minimap
 * route, TAB overview), subtitles for dialogue and announcements, hints when progress stalls, and
 * one-time control tips. It presents the mission's state; it never changes it.
 */
export class StoryPresenter {
  hud: ObjectiveHud;
  subs: Subtitles;
  guidance: Guidance;
  marker: Marker;
  def: ObjectiveDef | null = null;
  private hintT = 0;
  private hintBest = Infinity;
  private hintI = 0;
  private playT = 0;
  private seen = loadSeen();
  private tipQueue: { key: string; text: string }[] = [];
  private overview = false;

  constructor(private g: Game) {
    this.hud = new ObjectiveHud(document.body);
    this.subs = new Subtitles(document.body);
    this.guidance = new Guidance(g.nav, g.col);
    this.marker = new Marker(document.body, g.col);
    this.show(false);
  }

  show(on: boolean) {
    this.hud.show(on);
    this.subs.root.classList.toggle('hidden', !on);
    if (!on) {
      this.marker.set(null);
      this.hud.setOverview(false);
    }
  }

  setAct(n: 1 | 2 | 3 | 4) {
    this.hud.setAct(n, ACT_NAMES[n].en, ACT_NAMES[n].jp);
  }

  /** The mission moved to a new objective. */
  setObjective(def: ObjectiveDef | null, announce = true) {
    const completed = this.def && (!def || def.step !== this.def.step) ? this.def.title : null;
    if (def && this.def && def.step === this.def.step) {
      this.hud.refreshText(def);
      this.def = def;
      return;
    }
    this.def = def;
    this.hud.set(def, announce ? completed : null, announce);
    this.guidance.setTarget(def?.target ?? null, def?.place ?? '');
    if (!def?.target) this.marker.set(null);
    this.hintT = 0;
    this.hintBest = Infinity;
    this.hintI = 0;
    if (announce) this.g.audio.objective(!!completed);
  }

  /** Text-only refresh (train times). */
  refresh(def: ObjectiveDef | null) {
    if (def && this.def && def.step === this.def.step) {
      this.def = def;
      this.hud.refreshText(def);
    }
  }

  say(speaker: Speaker, text: string, seconds?: number) {
    this.subs.say(speaker, text, seconds);
  }

  /** A one-time tip (remembered across sessions); queued so tips never overlap. */
  tip(key: string, text: string) {
    if (!this.g.settings.tips || this.seen.has(key) || this.tipQueue.some((t) => t.key === key)) return;
    this.tipQueue.push({ key, text });
  }

  private markSeen(key: string) {
    this.seen.add(key);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* storage blocked: tips may repeat next session */
    }
  }

  update(dt: number, rawDt: number) {
    const g = this.g;
    const p = g.player.pos;
    this.playT += dt;
    this.subs.update(dt);
    this.hud.update(rawDt);
    g.audio.duckMusic(this.subs.speaking);

    // Guidance and marker.
    const def = this.def;
    if (def?.target) {
      this.guidance.update(p, dt);
      const gd = this.guidance.guide;
      if (gd) this.marker.set(gd.pos, gd.label, gd.final, gd.climb);
      const route = this.guidance.routeLength;
      const dist = route > 0 ? route : p.distanceTo(def.target);
      this.marker.update(g.camera, rawDt, dist);
      const level = Guidance.floorHint(p, def.target);
      const via = gd && !gd.final ? ` · VIA ${gd.via}` : '';
      this.hud.setDistance(`${Math.round(dist)} M${level ? ` · ${level}` : ''}${via}`);
    } else {
      this.marker.set(null);
      this.hud.setDistance('');
    }

    // TAB overview.
    const tab = g.input.key(KEYS.objective) && g.state === 'play';
    if (tab !== this.overview || tab) {
      this.overview = tab;
      const esc = g.rail.tt.escapeService();
      this.hud.setOverview(tab, {
        where: def?.place ? `${def.place}${def.target ? ` — ${Math.round(this.guidance.routeLength > 0 ? this.guidance.routeLength : p.distanceTo(def.target))} m away${Guidance.floorHint(p, def.target) ? `, ${Guidance.floorHint(p, def.target)}` : ''}` : ''}` : '',
        hint: def?.hints[Math.max(0, this.hintI - 1)] ?? def?.hints[0] ?? '',
        train: g.mission.boardKnown && esc ? `Last express to Kagerō Bay — ${fmt(esc.time)}, Platform 1${esc.suspended ? ' (suspended: lockdown)' : ''}. Now ${fmt(g.rail.tt.now)}.` : '',
      });
    }

    this.hints(dt);
    this.onboarding();
    // Tips wait while someone is talking.
    if (!this.hud.tipVisible && !this.subs.speaking && this.tipQueue.length) {
      const t = this.tipQueue.shift()!;
      this.markSeen(t.key);
      this.hud.showTip(t.text, 7);
    }
  }

  /** A hint when progress stalls — never in a firefight, never twice in a row too soon. */
  private hints(dt: number) {
    const g = this.g;
    const def = this.def;
    if (!def || !def.hints.length) return;
    const level = g.security.alert.level;
    const fighting = level === 'pursuit' || g.security.hostiles(30) > 0;
    if (fighting) return;
    if (def.target) {
      const d = this.guidance.routeLength > 0 ? this.guidance.routeLength : g.player.pos.distanceTo(def.target);
      if (d < this.hintBest - PROGRESS) {
        this.hintBest = d;
        this.hintT = 0;
        return;
      }
    } else if (level !== 'search') return;
    this.hintT += dt;
    const due = this.hintI === 0 ? HINT_FIRST : HINT_EVERY;
    if (this.hintT > due && this.hintI < def.hints.length) {
      this.hud.setHint(def.hints[this.hintI++]);
      this.hintT = 0;
    }
  }

  /** First minutes: one control at a time, when it matters. */
  private onboarding() {
    const g = this.g;
    if (g.mode !== 'story' || g.mission.act !== 1) return;
    if (this.playT > 1) this.tip('move', '[W][A][S][D] move · mouse to look · [SHIFT] sprint · [SPACE] jump');
    if (this.playT > 9) this.tip('holster', 'Your gun is holstered. [X] draws it — but a drawn weapon makes guards and civilians notice you.');
    if (this.playT > 17) this.tip('objective', 'Your objective is top-left; the ◆ marker shows the way. Hold [TAB] for details.');
    if (g.weapon.visible) this.tip('drawn', 'Weapon drawn. [X] holsters it again — do that before you walk past patrols.');
    for (const k of g.intel.map.values()) {
      if (k.yaw !== null) {
        this.tip('cones', 'Minimap: the coloured cone is where a guard is looking. Yellow = patrol, orange = suspicious, red = hunting you.');
        break;
      }
    }
  }

  /** A tip that belongs to a moment (wanted levels); shown once ever. */
  momentTip(key: string, text: string) {
    this.tip(key, text);
  }

  clear() {
    this.subs.clear();
    this.hud.clear();
    this.def = null;
    this.guidance.setTarget(null, '');
    this.marker.set(null);
    this.tipQueue.length = 0;
    this.playT = 0;
    this.hintT = 0;
    this.hintI = 0;
    this.hintBest = Infinity;
  }
}
