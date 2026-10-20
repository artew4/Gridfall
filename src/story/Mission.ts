import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { PatrolSpec } from '../stealth/Security';
import type { Collider } from '../world/Collision';
import { DECK } from '../world/Architecture';
import { ROOF } from '../world/District';
import { UG } from '../world/Metro';
import { fmt, type Service } from '../rail/Timetable';
import type { AlertLevel } from '../stealth/AlertSystem';
import { Conversation } from './Conversation';
import { KENJI, objectiveFor, type Step } from './Objectives';

export type Act = 1 | 2 | 3 | 4;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);


/** Guards per act (fresh spawns at a checkpoint; at act changes only the new ones are added). */
const PATROLS: Record<Act, PatrolSpec[]> = {
  1: [
    { route: [v(-7, 0, -10), v(7, 0, -10), v(11, 0, 0), v(4, 0, 2.5), v(-5, 0, 2.5), v(-11, 0, 0)] },
    { route: [v(2.2, 0, 42.5)], post: true },
    { route: [v(17, 0, -0.6), v(40, 0, -0.6)] },
    { route: [v(0, 0, -19), v(1.5, 0, -38), v(-1.5, 0, -50), v(0, 0, -30)] },
  ],
  2: [
    { route: [v(-13.5, DECK, -13.5), v(13.5, DECK, -13.5), v(13.5, DECK, -2.1), v(24, DECK, -2.1), v(13.5, DECK, -2.1), v(13.5, DECK, -13.5)] },
    { route: [v(-18, 0, -3.6), v(-36, 0, -3.6), v(-22.5, 0, 4), v(-22.5, 0, 18)] },
  ],
  3: [
    { route: [v(39.5, ROOF, 12.2)], post: true },
    { route: [v(24, ROOF, 7.5), v(37, ROOF, 10.5), v(44, ROOF, 8.5), v(31, ROOF, 9)] },
    { route: [v(36, ROOF, -6)], post: true },
    { route: [v(16.2, 10, -9)], post: true },
  ],
  4: [
    { route: [v(0.8, UG, 20.5)], post: true },
    { route: [v(-4, UG, 25.2), v(8.2, UG, 25.2)] },
    { route: [v(-30, UG, 31.4), v(30, UG, 31.4)] },
    { route: [v(24, UG, 31.4), v(-12, UG, 31.4)] },
  ],
};

/** Kenji at the stall: who you are to them, why they want you, the way out. Then the ambush. */
const DIALOGUE: [number, string][] = [
  [0, 'You made it. Every screen in Sanchōme has your face on it.'],
  [4.4, 'Kurogane says you bombed their data vault. You didn’t — but you walked out with their ledger, so now you’re the bomber.'],
  [10.2, 'They’ve sealed the district. One way out: the last express to Kagerō Bay. That line has no checkpoint.'],
  [15.6, 'The departure board is at the metro entrance, east side of the plaza. Find out when it leaves. And keep that gun out of sight—'],
  [21.4, '…wait. They followed me. RUN!'],
];
const TALK_LENGTH = 23.2;

/**
 * The story: four acts with objectives, a few set pieces that force a fight or a chase, and
 * checkpoints. Everything it does goes through the same systems the player can see (guards, radio,
 * trains); it never hands security the player's position for free, except where the fiction says
 * they were told (the informant was followed; the relay alarm).
 */
export class Mission {
  act: Act = 1;
  step: Step = 'meet';
  private stepT = 0;
  private kenji = -1;
  private talk = new Conversation(DIALOGUE, TALK_LENGTH);
  private relayHits = 0;
  private relayCollider: Collider | null = null;
  private relayDown = false;
  private refreshT = 0;
  private calmT = 0;
  private escapeSvc: Service | null = null;
  /** Seconds since the board was read (game clock, so pause holds it); -1 if not yet. */
  private boardReadT = -1;
  private roofSquad = false;
  private stationSquad = false;
  private sweepers: { guard: { setG(s: 'return'): void; hostile: boolean; alive: boolean }; until: number }[] = [];
  private relayInteract = { pos: v(0, 0, 0), radius: 2.4, label: 'SABOTAGE RELAY · HOLD', hold: 2, enabled: () => this.step === 'relay', action: () => this.sabotage() };
  private kenjiInteract = { pos: KENJI.clone(), radius: 2.6, label: 'TALK TO KENJI', enabled: () => this.step === 'meet', action: () => this.meetKenji() };
  checkpoint: { act: Act; pos: THREE.Vector3; yaw: number; health: number } = { act: 1, pos: v(0, 0, 0), yaw: 0, health: 100 };

  constructor(private g: Game) {
    this.relayInteract.pos.copy(g.district.relay).setZ(g.district.relay.z - 0.9);
    g.interactables.push(this.kenjiInteract, this.relayInteract);
    // The relay can also be shot to pieces.
    const r = g.district.relay;
    this.relayCollider = g.col.colliders.find((c) => c.kind === 'box' && r.x > c.min.x && r.x < c.max.x && r.z > c.min.z && r.z < c.max.z && c.min.y >= ROOF - 0.01 && c.max.y > ROOF + 1.5) ?? null;
    if (this.relayCollider) {
      this.relayCollider.onHit = () => {
        if (this.step !== 'relay' && this.step !== 'meet' && this.step !== 'board') return;
        this.relayHits++;
        g.fx.sparks(r.clone().setY(ROOF + 1.6), v(0, 1, 0), 14, new THREE.Color(0.7, 0.9, 1), 5);
        if (this.relayHits >= 3) this.sabotage();
      };
    }
    g.onBoardRead = () => this.boardRead();
  }

  // ------------------------------------------------------------------ lifecycle
  /** New story or retry from the checkpoint. */
  start(fromCheckpoint: boolean) {
    const g = this.g;
    const act: Act = fromCheckpoint ? this.checkpoint.act : 1;
    this.act = act;
    this.relayHits = 0;
    this.relayDown = act >= 4;
    this.boardReadT = -1;
    this.talk.stop();
    this.sweepers = [];
    this.roofSquad = act >= 4;
    this.stationSquad = act >= 4;
    this.calmT = 0;
    g.security.clear();
    g.security.budgetPerEpisode = act === 3 ? 4 : 2;
    g.security.budget = g.security.budgetPerEpisode;
    for (const p of PATROLS[1]) g.security.spawnPatrol(p);
    if (act === 2 || act === 4) for (const p of PATROLS[act]) g.security.spawnPatrol(p);
    g.crowd.reset(fromCheckpoint ? this.checkpoint.pos : g.player.pos);
    g.rail.reset();
    // The last express is on the boards from the start, suspended by the lockdown.
    this.escapeSvc = g.rail.tt.scheduleEscape(66);
    this.escapeSvc.suspended = act < 4;
    g.setStationOpen(act >= 4);
    if (fromCheckpoint) {
      g.player.reset(this.checkpoint.pos.x, this.checkpoint.pos.z, this.checkpoint.yaw, this.checkpoint.pos.y);
      g.player.health = Math.max(60, this.checkpoint.health);
    }
    if (act >= 4) this.openStation(false);
    this.kenji = act === 1 ? g.crowd.pin(KENJI, Math.PI, 0xc8a020) : -1;
    g.story.setAct(act);
    this.setStep(act === 1 ? 'meet' : act === 2 ? 'board' : act === 3 ? 'relay' : 'train');
    if (!fromCheckpoint) this.saveCheckpoint();
  }

  private saveCheckpoint() {
    const p = this.g.player;
    this.checkpoint = { act: this.act, pos: p.pos.clone(), yaw: p.yaw, health: p.health };
  }

  private setAct(a: Act) {
    this.act = a;
    this.g.story.setAct(a);
    this.g.security.budgetPerEpisode = a >= 3 ? 3 : 2;
    if (a === 2) this.spawnAct(a);
    this.saveCheckpoint();
  }

  /** Puts an act's guards on duty, sending unaware patrols far away off duty to stay under the cap. */
  private spawnAct(a: Act) {
    const sec = this.g.security;
    const extra = PATROLS[a].length;
    const cap = 10;
    if (sec.active + extra > cap) sec.retireFar(sec.active + extra - cap, this.g.player.pos);
    for (const p of PATROLS[a]) sec.spawnPatrol(p);
  }

  /** Rail events: a departing escape train with the fugitive still on the platform = missed. */
  onRail(e: { type: string; s: Service }) {
    if (e.type !== 'depart' || !e.s.escape || this.step !== 'train' && this.step !== 'manhunt') return;
    if (this.g.state === 'ending') return;
    const g = this.g;
    this.escapeSvc = g.rail.tt.scheduleEscape(12, true);
    g.story.say('STATION PA', `An extra express for Kagerō Bay will depart from Platform 1 at ${fmt(this.escapeSvc.time)}.`);
    g.story.say('KENJI (TEXT)', 'You missed it?! There’s one more. Stay alive until then.');
    this.setStep('train');
  }

  /** Whether the player has read the departure board (the overview may show train times). */
  get boardKnown() {
    return this.act >= 3 || this.boardReadT >= 0;
  }

  /** The current objective, from the mission state (the only source of truth). */
  get objective() {
    return objectiveFor(this.step, { escapeTime: this.escapeSvc ? fmt(this.escapeSvc.time) : '--:--', relay: this.g.district.relay });
  }

  private setStep(s: Step, announce = true) {
    this.step = s;
    this.stepT = 0;
    this.g.story.setObjective(this.objective, announce);
  }

  // ------------------------------------------------------------------ beats
  private meetKenji() {
    if (this.step !== 'meet' || !this.talk.start()) return;
    this.setStep('talk');
  }

  private boardRead() {
    if (this.step !== 'board') return;
    const g = this.g;
    g.story.say('BOARD', `LAST EXPRESS · KAGERŌ BAY · ${fmt(this.escapeSvc!.time)} · PLATFORM 1 — SUSPENDED: SECURITY LOCKDOWN`, 5);
    this.boardReadT = 0;
  }

  private sabotage() {
    if (this.relayDown || this.step !== 'relay') return;
    this.relayDown = true;
    const g = this.g;
    const at = g.district.relay.clone();
    g.fx.glass(at.clone().setY(ROOF + 1.8));
    g.fx.sparks(at.clone().setY(ROOF + 1.8), v(0, 1, 0), 40, new THREE.Color(0.6, 0.85, 1), 7);
    g.audio.discharge(at);
    g.audio.siren();
    g.envUses++;
    g.story.say('DISPATCH', 'All units — relay sabotage on the Sky Garden roof. Fugitive on the roof. Converge.', 3.5);
    g.security.alarm(at);
    this.openStation(true);
    this.setAct(4);
    this.setStep('manhunt');
  }

  /** Lockdown lifted: shutters up, the escape train back on the timetable. */
  private openStation(announce: boolean) {
    const g = this.g;
    g.setStationOpen(true);
    if (this.escapeSvc) {
      g.rail.tt.services = g.rail.tt.services.filter((s) => s !== this.escapeSvc);
    }
    this.escapeSvc = g.rail.tt.scheduleEscape(announce ? 9 : 8);
    if (announce) {
      g.story.say('STATION PA', `Service on the Sakura Line resumes. The last express to Kagerō Bay departs from Platform 1 at ${fmt(this.escapeSvc.time)}.`);
      g.story.say('KENJI (TEXT)', 'Shutters are up. Get down to Platform 1 — every unit on the roof is coming for you.');
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const g = this.g;
    this.stepT += dt;
    const a = g.security.alert;

    // Kenji's conversation, then the ambush.
    const talk = this.talk.update(dt);
    for (const line of talk.lines) g.story.say('KENJI', line, 5.4);
    if (talk.done) {
      if (this.kenji >= 0) g.crowd.release(this.kenji, g.player.pos);
      g.security.ambush(KENJI, 3);
      g.audio.radio(null, 'dispatch');
      g.story.say('DISPATCH', 'Suspect located at the Fountain Plaza ramen stall. Move in.', 3.2);
      this.setStep('ambush');
    }

    if (this.boardReadT >= 0 && this.step === 'board') {
      this.boardReadT += dt;
      if (this.boardReadT > 2.2) {
        this.boardReadT = -1;
        g.story.say('KENJI (TEXT)', 'That’s your train — but the lockdown is holding it. The shutters run off a security relay on the Sky Garden roof. Kill the relay and the line opens.', 7);
        this.setAct(3);
        this.setStep('relay');
      }
    }

    switch (this.step) {
      case 'ambush':
        // Done once security has lost him and given up the search (or the squad is down).
        if (this.stepT > 8 && a.level === 'unnoticed') {
          g.story.say('KENJI (TEXT)', 'Still breathing? Good. The departure board is at the metro entrance, east side of the plaza.', 6);
          this.setAct(2);
          this.setStep('board');
        }
        break;
      case 'manhunt':
        if (g.player.pos.y < -3) this.setStep('train');
        break;
      case 'train':
        break;
    }
    // The station detail is on duty below; it takes over when the fugitive first goes underground.
    if (this.act === 4 && !this.stationSquad && g.player.pos.y < -2.5) {
      this.stationSquad = true;
      this.spawnAct(4);
    }
    switch (this.step) {
      case 'relay':
        // The rooftop detail goes on duty when you come near the Sky Garden (not across the map).
        if (!this.roofSquad && g.player.pos.distanceTo(g.district.relay) < 30) {
          this.roofSquad = true;
          this.spawnAct(3);
        }
        break;
    }

    // A suspended train never "arrives"; keep it ahead of the clock until the lockdown lifts.
    if (this.escapeSvc?.suspended && g.rail.tt.now > this.escapeSvc.time - 3) this.escapeSvc.time += 10;
    this.tutorial(a.level, dt);
    this.direct(dt, a.level);
  }

  /** One-off hints at the moment they're useful. */
  private tutorial(level: AlertLevel, dt: number) {
    const tip = (k: string, text: string) => this.g.story.momentTip(k, text);
    if (level === 'suspicious') tip('susp', 'Someone is looking at you (arc around the crosshair). Break line of sight, holster with [X], walk — don’t run.');
    if (level === 'pursuit') tip('pursuit', 'You’re made. Break line of sight and keep moving — rooftops, alleys and the metro lose them.');
    if (level === 'search') tip('search', 'They’re searching where they last saw you. Stay out of sight until they give up.');
    // Train times move while the lockdown holds the express; keep the objective text current.
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 1;
      this.g.story.refresh(this.objective);
    }
  }

  /**
   * Pacing only: after a long quiet stretch mid-story, a pair of officers sweeps through the
   * player's general area (a zone, never his exact position).
   */
  private direct(dt: number, level: AlertLevel) {
    const g = this.g;
    // Sweeps end: unaware sweepers walk back out.
    this.sweepers = this.sweepers.filter((sw) => {
      if (!sw.guard.alive) return false;
      if (g.elapsed > sw.until && !sw.guard.hostile) {
        sw.guard.setG('return');
        return false;
      }
      return true;
    });
    if (level !== 'unnoticed' || (this.step !== 'board' && this.step !== 'relay')) {
      this.calmT = 0;
      return;
    }
    this.calmT += dt;
    if (this.calmT > 140 && g.security.active < 9) {
      this.calmT = 0;
      const p = g.player.pos;
      // A nav node roughly in the player's area, offset so it isn't a bead on him.
      const near = g.nav.nodes.filter((n) => Math.abs(n.y - 1 - p.y) < 2 && n.distanceTo(p) > 10 && n.distanceTo(p) < 28);
      const pick = near[Math.floor(Math.random() * near.length)];
      if (pick) {
        const door = g.security.doors.filter((d) => d.distanceTo(p) > 30).sort(() => Math.random() - 0.5)[0];
        if (door) {
          const guard = g.security.spawnPatrol({ route: [door.clone(), pick.clone().setY(pick.y - 1)] });
          guard.reinforcement = true;
          guard.exit = door.clone();
          this.sweepers.push({ guard, until: g.elapsed + 70 });
          g.storyHud.radioLine('DISPATCH — UNIT 7, SWEEP YOUR SECTOR.', 'info');
        }
      }
    }
  }
}
