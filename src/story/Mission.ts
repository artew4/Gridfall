import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { PatrolSpec } from '../stealth/Security';
import type { Collider } from '../world/Collision';
import { DECK } from '../world/Architecture';
import { ROOF } from '../world/District';
import { UG } from '../world/Metro';
import { fmt, type Service } from '../rail/Timetable';
import type { AlertLevel } from '../stealth/AlertSystem';

export type Act = 1 | 2 | 3 | 4;
type Step = 'meet' | 'ambush' | 'board' | 'relay' | 'manhunt' | 'train' | 'done';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Where the informant waits: the ramen stall stools. */
const KENJI = v(-7.2, 0, 12.4);
const STREET_BOARD = v(12.2, 0, 2);
const PLATFORM = v(0, UG, 31);

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

const DIALOGUE: [number, string][] = [
  [0, 'KENJI — You made it. They’ve sealed off the whole of Sanchōme.'],
  [3.6, 'KENJI — One way out: the last express to Kagerō Bay. Sakura Line, platform one.'],
  [7.4, 'KENJI — Check the board at the metro entrance. And keep that gun out of sight—'],
  [11, 'KENJI — …wait. They followed me. RUN!'],
];

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
  private talkT = -1;
  private relayHits = 0;
  private relayCollider: Collider | null = null;
  private relayDown = false;
  private tips = new Set<string>();
  private calmT = 0;
  private escapeSvc: Service | null = null;
  /** Seconds since the board was read (game clock, so pause holds it); -1 if not yet. */
  private boardReadT = -1;
  private roofSquad = false;
  private stationSquad = false;
  private sweepers: { guard: { setG(s: 'return'): void; hostile: boolean; alive: boolean }; until: number }[] = [];
  private relayInteract = { pos: v(0, 0, 0), radius: 2.4, label: 'SABOTAGE RELAY · HOLD', hold: 2, enabled: () => this.step === 'relay', action: () => this.sabotage() };
  private kenjiInteract = { pos: KENJI.clone(), radius: 2.6, label: 'TALK TO KENJI', enabled: () => this.step === 'meet', action: () => this.talk() };
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
    this.tips.clear();
    this.relayHits = 0;
    this.relayDown = act >= 4;
    this.boardReadT = -1;
    this.talkT = -1;
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
    this.setStep(act === 1 ? 'meet' : act === 2 ? 'board' : act === 3 ? 'relay' : 'train');
    if (!fromCheckpoint) this.saveCheckpoint();
  }

  private saveCheckpoint() {
    const p = this.g.player;
    this.checkpoint = { act: this.act, pos: p.pos.clone(), yaw: p.yaw, health: p.health };
  }

  private setAct(a: Act) {
    this.act = a;
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
    g.storyHud.radioLine(`PA — Extra express for Kagerō Bay at ${fmt(this.escapeSvc.time)}. — Missed it. Stay alive until then.`, 'story');
    this.setStep('train');
  }

  private setStep(s: Step) {
    this.step = s;
    this.stepT = 0;
    const g = this.g;
    const hud = g.storyHud;
    switch (s) {
      case 'meet':
        hud.setObjective('Meet Kenji at the ramen stall in the Fountain Plaza.', '噴水広場の屋台で健二に会え');
        g.marker.set(KENJI);
        break;
      case 'ambush':
        hud.setObjective('Lose the security squad.', '追っ手を撒け');
        g.marker.set(null);
        break;
      case 'board':
        hud.setObjective('Check the departure board at the metro entrance.', '地下鉄入口の発車案内を確認せよ');
        g.marker.set(STREET_BOARD);
        break;
      case 'relay':
        hud.setObjective('Disable the security relay on the Sky Garden rooftop.', '屋上庭園の中継器を破壊せよ');
        g.marker.set(g.district.relay);
        break;
      case 'manhunt':
        hud.setObjective(`Shake the manhunt and get to Platform 1 — last express ${fmt(this.escapeSvc!.time)}.`, '1番線へ急げ');
        g.marker.set(PLATFORM);
        break;
      case 'train':
        hud.setObjective(`Board the last express to Kagerō Bay — ${fmt(this.escapeSvc!.time)}, Platform 1.`, `${fmt(this.escapeSvc!.time)} 終電に乗れ`);
        g.marker.set(PLATFORM);
        break;
      case 'done':
        g.marker.set(null);
        break;
    }
  }

  // ------------------------------------------------------------------ beats
  private talk() {
    this.talkT = 0;
    this.g.marker.set(null);
  }

  private boardRead() {
    if (this.step !== 'board') return;
    const g = this.g;
    g.storyHud.radioLine(`BOARD — LAST EXPRESS ${fmt(this.escapeSvc!.time)} KAGERŌ BAY · SUSPENDED: SECURITY LOCKDOWN`, 'story');
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
    g.storyHud.radioLine('ALL UNITS — RELAY SABOTAGE ON THE SKY GARDEN. FUGITIVE ON THE ROOF. CONVERGE.', 'alert');
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
    if (announce) g.storyHud.radioLine(`PA — Service resumes. The last express to Kagerō Bay departs ${fmt(this.escapeSvc.time)}, Platform 1.`, 'story');
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const g = this.g;
    this.stepT += dt;
    const a = g.security.alert;

    // Kenji's conversation, then the ambush.
    if (this.talkT >= 0) {
      const before = this.talkT;
      this.talkT += dt;
      for (const [at, line] of DIALOGUE) if (before < at && this.talkT >= at) g.storyHud.radioLine(line, 'story');
      if (this.talkT >= 11.6) {
        this.talkT = -1;
        if (this.kenji >= 0) g.crowd.release(this.kenji, g.player.pos);
        g.security.ambush(KENJI, 3);
        g.audio.radio(null, 'dispatch');
        g.storyHud.radioLine('DISPATCH — SUSPECT LOCATED AT THE FOUNTAIN PLAZA STALL. MOVE IN.', 'alert');
        this.setStep('ambush');
      }
    }

    if (this.boardReadT >= 0 && this.step === 'board') {
      this.boardReadT += dt;
      if (this.boardReadT > 2.2) {
        this.boardReadT = -1;
        g.storyHud.radioLine('KENJI (text) — Lockdown runs off a relay on the Sky Garden roof. Kill it and the shutters go up.', 'story');
        this.setAct(3);
        this.setStep('relay');
      }
    }

    switch (this.step) {
      case 'ambush':
        // Done once security has lost him and given up the search (or the squad is down).
        if (this.stepT > 8 && a.level === 'unnoticed') {
          g.storyHud.radioLine('KENJI (text) — Still alive? Check the departure board by the plaza metro entrance.', 'story');
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
    this.tutorial(a.level);
    this.direct(dt, a.level);
  }

  /** One-off hints at the moment they're useful. */
  private tutorial(level: AlertLevel) {
    const tip = (k: string, text: string) => {
      if (this.tips.has(k)) return;
      this.tips.add(k);
      this.g.storyHud.radioLine(text, 'info');
    };
    if (level === 'suspicious') tip('susp', 'SOMEONE IS LOOKING AT YOU — BREAK LINE OF SIGHT, HOLSTER (H), WALK DON’T RUN');
    if (level === 'pursuit') tip('pursuit', 'YOU’RE MADE — BREAK LINE OF SIGHT AND KEEP MOVING. ROOFTOPS AND ALLEYS LOSE THEM');
    if (level === 'search') tip('search', 'THEY’RE SEARCHING WHERE THEY LAST SAW YOU — STAY OUT OF SIGHT UNTIL THEY GIVE UP');
    if (this.g.weapon.visible && this.g.player.pos.distanceTo(KENJI) < 25 && this.act === 1) tip('gun', 'A DRAWN WEAPON GETS YOU NOTICED. H TO HOLSTER');
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
