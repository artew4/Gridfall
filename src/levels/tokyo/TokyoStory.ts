import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { damp, rand } from '../../core/math';
import type { Player } from '../../player/Player';
import type { RailEvent } from '../../rail/Rail';
import { fmt } from '../../rail/Timetable';
import { CAR_CENTRES, TRACK_Z } from '../../world/Metro';
import { SEARCH_TIME } from '../../stealth/AlertSystem';
import { intelRange } from '../../stealth/PlayerIntel';
import type { ThreatMark } from '../../ui/StoryHud';
import { Ending } from '../../story/Ending';
import type { ModeRules } from '../Level';
import type { TokyoLevel } from './TokyoLevel';

/**
 * Story Escape on TokyoNight: the fugitive, security and its alert levels, civilians and witnesses,
 * the four acts of the mission, the timetable and the last express, the ending. The engine runs the
 * player, the weapon and the frame; this decides what the world does about the player.
 */
export class TokyoStory implements ModeRules {
  private ending: Ending | null = null;
  /** The story world was set up for the opening; gameplay continues with it. */
  private prepared = false;
  /** Stand-in for the player during the opening (the crowd keeps its detail around the camera). */
  private introProxy = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: true, sprinting: false };
  private chatterT = 2;
  private knowT = 0;
  private frustum = new THREE.Frustum();
  private projM = new THREE.Matrix4();

  constructor(private game: Game, private t: TokyoLevel) {}

  /** Story world for the opening (act 1): the player is parked at the start, unseen. */
  prepare() {
    const g = this.game, t = this.t;
    const st = t.district.storyStart;
    g.player.reset(st.x, st.z, st.yaw);
    g.weapon.setHolstered(true, true);
    t.crowd.setVisible(true);
    g.ctx.enemies = t.security.guards;
    t.story.clear();
    t.mission.setup(false);
    t.security.blind = true;
    t.manhunt.setMode('cycle');
    this.prepared = true;
  }

  begin(fromCheckpoint: boolean) {
    const g = this.game, t = this.t;
    const st = t.district.storyStart;
    g.player.reset(st.x, st.z, st.yaw);
    g.safety.reset(g.player.pos);
    g.weapon.raiseTarget = 1;
    g.weapon.setHolstered(true, true);
    t.crowd.setVisible(true);
    g.ctx.enemies = t.security.guards;
    g.storyHud.clear();
    g.storyHud.show(true);
    // Subtitles of the opening may still be finishing; the objective starts fresh.
    if (!this.prepared || fromCheckpoint) t.story.clear();
    t.story.show(true);
    t.minimap.show(true);
    t.intel.clear();
    t.stationKnown = false;
    t.security.blind = false;
    t.manhunt.setMode('cycle');
    if (this.prepared && !fromCheckpoint) t.mission.begin(false);
    else t.mission.start(fromCheckpoint);
    this.prepared = false;
    if (fromCheckpoint) g.storyHud.radioLine('CHECKPOINT', 'info');
  }

  update(dt: number, rawDt: number) {
    const g = this.game, t = this.t;
    t.security.update(dt);
    t.crowd.update(dt, g.elapsed, g.player, g.weapon.visible, t.security.alert.level === 'pursuit');
    t.mission.update(dt);
    this.updateStoryHud(rawDt);
    this.ambientChatter(dt);
    // A local's doors are open and we're inside: say what that means.
    const inLocal = t.rail.train.inside(g.player.pos) && t.rail.train.doorK > 0.5 && !t.rail.tt.active()?.s.escape;
    g.updateInteraction(dt, inLocal ? 'THIS LOCAL STOPS AT A SECURITY CHECKPOINT' : null);
    this.updateKnowledge(rawDt);
    t.story.update(dt, rawDt);
    g.hud.setClock(fmt(t.rail.tt.now));
  }

  /** The district is live during the opening: crowds, patrols on their beats, trains. */
  updateIntro(dt: number) {
    const g = this.game, t = this.t;
    t.security.update(dt);
    this.introProxy.pos.copy(g.camera.position).setY(Math.min(g.camera.position.y, 6));
    t.crowd.update(dt, g.elapsed, this.introProxy as unknown as Player, false, false);
    t.story.subs.update(dt);
    t.story.subs.root.classList.remove('hidden');
    t.manhunt.update(dt);
  }

  onIntroSkipped() {
    // Lines of skipped shots don't trail into the game.
    this.t.story.subs.clear();
  }

  onGunshot(origin: THREE.Vector3) {
    this.t.security.gunshot(origin, true);
  }

  /** Bystanders are in the way too. */
  bystander(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const g = this.game, t = this.t;
    const ch = t.crowd.raycast(origin, dir, maxDist);
    if (!ch) return null;
    return {
      dist: ch.dist,
      hit: (d: THREE.Vector3) => {
        const pt = origin.clone().addScaledVector(d, ch.dist);
        g.fx.enemyHit(pt, d, new THREE.Color(0.6, 0.1, 0.1));
        g.audio.hitEnemy(pt, false);
        t.crowd.hit(ch.civ, d);
      },
    };
  }

  /** How tense the moment is, from what the player is going through (never from hidden information). */
  musicIntensity(): number {
    const g = this.game, t = this.t;
    const hp = g.player.health / g.player.maxHealth;
    const a = t.security.alert;
    let x = 0.06;
    switch (a.level) {
      case 'suspicious':
        x = 0.3 + 0.18 * Math.max(0, ...t.security.guards.map((gd) => (gd.alive && !gd.hostile ? gd.suspicion : 0)));
        break;
      case 'alerted':
        x = 0.42;
        break;
      case 'search':
        x = 0.34 + 0.2 * (a.searchLeft(g.elapsed) / SEARCH_TIME);
        break;
      case 'pursuit': {
        const p = g.player.pos;
        const fighting = t.security.guards.some((gd) => gd.alive && gd.gstate === 'combat' && gd.pos.distanceTo(p) < 30);
        const close = t.security.hostiles(30);
        x = fighting ? 0.86 + Math.min(0.14, close * 0.03) : 0.64;
        break;
      }
    }
    // The last train is close: a little more urgency.
    const esc = t.rail.tt.escapeService();
    if (esc && !esc.suspended && t.rail.tt.secondsUntil(esc) < 60) x = Math.max(x, 0.42);
    if (hp < 0.3 && a.level === 'pursuit') x = Math.min(1, x + 0.08);
    return x;
  }

  updateEnding(dt: number, rawDt: number) {
    if (!this.ending) return;
    const g = this.game, t = this.t;
    const f = this.ending.update(dt, g.camera);
    t.security.update(dt);
    this.introProxy.pos.copy(g.camera.position).setY(Math.max(-6, Math.min(g.camera.position.y, 6)));
    t.crowd.update(dt, g.elapsed, this.introProxy as unknown as Player, false, false);
    t.story.subs.update(dt);
    t.manhunt.update(dt);
    const u = g.renderer.grade.uniforms;
    u.uFade.value = f.fade;
    u.uLetterbox.value = damp(u.uLetterbox.value, f.letterbox, 3, rawDt);
    if (f.done && g.endScreen.root.classList.contains('hidden')) this.showEndScreen();
  }

  reset() {
    this.t.security.clear();
    this.ending?.dispose();
    this.ending = null;
    this.t.security.blind = false;
  }

  toTitle() {
    const t = this.t;
    t.security.clear();
    t.crowd.setVisible(false);
    t.crowd.civs.length = 0;
    t.story.clear();
    t.story.show(false);
    t.manhunt.setMode('off');
    t.security.blind = false;
    this.prepared = false;
    this.ending?.dispose();
    this.ending = null;
  }

  death() {
    return { story: true, kills: this.t.security.stats.guardsDown };
  }

  // ------------------------------------------------------------------ rail, board, ending
  onRail(e: RailEvent) {
    const g = this.game, t = this.t;
    const story = g.mode === 'story' && g.state === 'play';
    if (g.mode === 'story') t.mission.onRail(e);
    const doorPos = { x: CAR_CENTRES[1], y: -4.5, z: TRACK_Z - 1.5 };
    switch (e.type) {
      case 'approach':
        if (e.s.kind === 'deadhead') {
          g.audio.announce(1.6);
          if (story && g.player.pos.y < -2) t.story.say('STATION PA', 'A train is passing through. Please stand back from the platform edge.', 3.5);
        } else {
          g.audio.announce(2.8);
          if (story && g.player.pos.y < -2) {
            t.story.say(
              'STATION PA',
              e.s.escape
                ? `Now arriving at Platform 1: the last express for Kagerō Bay. This is the final departure tonight.`
                : `Now arriving: local for ${e.s.dest}. (A local — it stops at the security checkpoint.)`,
            );
          }
        }
        break;
      case 'doorsOpen':
        g.audio.doorChime(doorPos, true);
        break;
      case 'closingSoon':
        g.audio.departureMelody();
        g.audio.doorWarning(doorPos);
        if (story && e.s.escape && !t.rail.train.inside(g.player.pos)) t.story.say('STATION PA', 'Final call: the last express to Kagerō Bay — doors are closing on Platform 1.', 3.4);
        if (story && t.rail.train.inside(g.player.pos) && !e.s.escape) t.story.say('KENJI (TEXT)', 'Wrong train! That local runs into a checkpoint — get off before the doors close!', 3.5);
        break;
      case 'obstructed':
        if (story) t.story.say('STATION PA', 'Please stand clear of the doors.', 2.5);
        break;
      case 'held':
        if (story) t.story.say('STATION PA', 'Door obstruction. The train is holding — please board quickly.', 3);
        break;
      case 'doorsClosed':
        g.audio.doorChime(doorPos, false);
        if (story && e.aboard) {
          if (e.s.escape) this.startEnding();
          else this.caught();
        }
        break;
      case 'depart':
        break;
    }
  }

  readBoard() {
    const t = this.t;
    const rows = t.rail.tt.upcoming(4).filter((s) => s.kind !== 'deadhead').slice(0, 3);
    t.story.say('BOARD', `${fmt(t.rail.tt.now)} — ` + rows.map((s) => `${fmt(s.time)} ${s.escape ? 'LAST EXPRESS' : 'LOCAL'} ${s.dest}${s.escape ? '' : ' (CHECKPOINT)'}`).join(' · '), 6);
    t.onBoardRead();
  }

  private startEnding() {
    const g = this.game, t = this.t;
    g.state = 'ending';
    this.ending = new Ending(t.rail.train, t.train, { scene: g.scene, say: (sp, text, sec) => t.story.say(sp, text, sec) });
    // The city stays alive behind the escape: people walk, security keeps searching (blind now).
    t.security.blind = true;
    g.hud.show(g.hud.root, false);
    g.storyHud.show(false);
    // The objective goes; subtitles stay for the ride out.
    t.story.hud.show(false);
    t.story.marker.set(null);
    g.weapon.raiseTarget = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private showEndScreen() {
    const g = this.game, t = this.t;
    const a = t.security.alert;
    const levels = ['UNNOTICED', 'SUSPICIOUS', 'ALERTED', 'SEARCH', 'PURSUIT'];
    g.endScreen.show({
      time: g.elapsed - g.stats.start,
      guardsDown: t.security.stats.guardsDown,
      detected: a.timesDetected,
      escapes: a.escapes,
      maxAlert: levels[a.maxRank],
      alarmed: t.crowd.stats.alarmed,
      harmed: t.crowd.stats.harmed,
      accuracy: g.stats.shots ? g.stats.hits / g.stats.shots : 0,
      interactions: t.envUses,
    });
  }

  /** Rode a local into the checkpoint. */
  private caught() {
    const g = this.game;
    g.failReason = 'CAUGHT AT THE CHECKPOINT';
    g.player.health = 0;
    g.player.alive = false;
  }

  /**
   * Minimap knowledge: guards the player can actually see (on screen, line of sight) or has just heard.
   * Old sightings fade out at their last known spot.
   */
  private updateKnowledge(dt: number) {
    const g = this.game, t = this.t;
    const time = g.elapsed;
    this.knowT -= dt;
    if (this.knowT <= 0) {
      this.knowT = 0.1;
      this.projM.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projM);
      const eye = g.camera.position;
      for (const gd of t.security.guards) {
        if (!gd.alive) continue;
        // Openly noticing or attacking him: he can tell where that one is and where he looks.
        const engaging = gd.sees && gd.suspicion > 0.05;
        const chest = gd.chest.clone();
        const inView = chest.distanceTo(eye) < 55 && this.frustum.containsPoint(chest) && g.col.lineOfSight(eye, chest);
        if (inView || engaging) t.intel.observe(gd, time);
      }
    }
    const player = { weaponDrawn: g.weapon.visible, hunting: t.security.alert.hunting(time), firing: t.security.playerFiring(time) };
    const blips = t.intel.blips(time, g.player.pos.y, (k) => intelRange(k, player));
    if (!t.stationKnown && (t.mission.act >= 2 || g.player.pos.distanceTo(new THREE.Vector3(9.1, 0, 4)) < 18)) t.stationKnown = true;
    t.minimap.draw(g.player.pos, g.player.yaw, t.story.def?.target ?? null, blips, t.stationKnown ? new THREE.Vector3(9.1, 0, 4) : null, t.story.guidance.path);
  }

  /** Snippets of conversation from calm people nearby. */
  private ambientChatter(dt: number) {
    const g = this.game, t = this.t;
    this.chatterT -= dt;
    if (this.chatterT > 0) return;
    this.chatterT = rand(1.2, 3.5);
    const near = t.crowd.civs.filter((c) => (c.state === 'chat' || c.state === 'idle' || c.state === 'walk') && c.pos.distanceTo(g.player.pos) < 14);
    if (near.length) {
      const c = near[Math.floor(Math.random() * near.length)];
      g.audio.chatter(c.pos.clone().setY(c.pos.y + 1.5));
    }
  }

  /** Wanted status and the arcs around the crosshair for guards that are noticing or attacking. */
  private updateStoryHud(dt: number) {
    const g = this.game, t = this.t;
    const a = t.security.alert;
    const time = g.elapsed;
    let meter = 0;
    const marks: ThreatMark[] = [];
    const p = g.player.pos;
    for (const gd of t.security.guards) {
      if (!gd.alive) continue;
      const d = gd.pos.distanceTo(p);
      if (d > 45) continue;
      meter = Math.max(meter, gd.suspicion);
      const attacking = gd.threat >= 3;
      const ang = Math.atan2(gd.pos.x - p.x, gd.pos.z - p.z);
      let rel = -(ang - (g.player.yaw + Math.PI));
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      // A hunter close behind you who can see you: you'd hear him (footsteps, radio).
      const behind = gd.hostile && gd.sees && d < 15 && Math.abs(rel) > 0.9;
      // Arcs only for guards that are noticing you, hunting you up close, or shooting at you (no wallhack).
      if (!(gd.suspicion > 0.05 && !gd.hostile) && !attacking && !behind) continue;
      marks.push({ angle: rel, level: attacking ? 3 : behind ? 2 : 1, k: gd.suspicion });
    }
    if (a.level === 'search') meter = a.searchLeft(time) / SEARCH_TIME;
    else if (a.level === 'pursuit') meter = 1;
    else if (a.level === 'alerted') meter = 0.5;
    g.storyHud.setWanted(a.level, meter);
    g.storyHud.drawThreats(marks);
    g.storyHud.update(dt);
  }
}
