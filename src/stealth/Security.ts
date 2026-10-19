import * as THREE from 'three';
import type { EnemyCtx } from '../enemies/Enemy';
import type { Glows } from '../world/Glows';
import { zoneAt } from '../world/Zones';
import { AlertSystem, type AlertLevel } from './AlertSystem';
import { SUSPICIOUS } from './Perception';
import { Guard } from './Guard';
import { rand } from '../core/math';

export interface PatrolSpec {
  route: THREE.Vector3[];
  post?: boolean;
}

/** Temporary sight blocker (steam burst). */
interface Blocker {
  c: THREE.Vector3;
  r: number;
  until: number;
}

const HEAR_OPEN = 42;
const HEAR_WALLED = 24;
const RESPONDERS = 4;
const MAX_GUARDS = 12;

/**
 * The Shinjuku Security Bureau: owns every guard, runs their perception on a staggered 10 Hz tick,
 * relays information over the radio (to the nearest responders only, never the player's live
 * position), and sends a limited number of reinforcements from doors the player can't see.
 */
export class Security {
  alert = new AlertSystem();
  guards: Guard[] = [];
  doors: THREE.Vector3[] = [];
  /** Reinforcements still available in the current alert episode (set by the director per act). */
  budget = 2;
  budgetPerEpisode = 2;
  private blockers: Blocker[] = [];
  private secondWaveT = -1;
  /** Radio line for the HUD feed. */
  onRadio: (text: string, tone: 'info' | 'warn' | 'alert') => void = () => {};
  onLevel: (level: AlertLevel, prev: AlertLevel) => void = () => {};
  civilianBlocks: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => false;
  stats = { guardsDown: 0, reinforcements: 0 };

  constructor(
    public ctx: EnemyCtx,
    private glows: Glows,
    private armed: () => boolean,
    private audio: {
      radio: (pos: THREE.Vector3 | null, kind: string) => void;
    },
  ) {
    this.alert.onChange = (l, prev) => this.levelChanged(l, prev);
  }

  // ------------------------------------------------------------------ queries used by guards
  playerArmed() {
    return this.armed();
  }

  /** Line of sight that also respects steam clouds. */
  sightLine(a: THREE.Vector3, b: THREE.Vector3) {
    if (!this.ctx.col.lineOfSight(a, b)) return false;
    const t = this.ctx.time;
    for (const bl of this.blockers) {
      if (bl.until < t) continue;
      if (segSphere(a, b, bl.c, bl.r)) return false;
    }
    return true;
  }

  addBlocker(c: THREE.Vector3, r: number, seconds: number) {
    this.blockers.push({ c: c.clone(), r, until: this.ctx.time + seconds });
  }

  /** How lit the player is (neon nearby), 0..1. Cheap: the glow registry, not real lighting. */
  lightAt(p: THREE.Vector3) {
    let l = 0.25;
    for (const g of this.glows.list) {
      const d2 = (g.pos.x - p.x) ** 2 + (g.pos.y - p.y - 1) ** 2 + (g.pos.z - p.z) ** 2;
      const r = g.radius * 1.2;
      if (d2 > r * r) continue;
      l += g.value * g.base * (1 - Math.sqrt(d2) / r) * 0.6;
      if (l >= 1) return 1;
    }
    return l;
  }

  civilianInLine(from: THREE.Vector3, to: THREE.Vector3) {
    return this.civilianBlocks(from, to);
  }

  /** Points to check around a last known position (nav nodes nearby, shuffled). */
  searchPoints(c: THREE.Vector3, n: number): THREE.Vector3[] {
    const nodes = this.ctx.nav.nodes
      .filter((p) => Math.abs(p.y - 1 - c.y) < 1.5 && Math.hypot(p.x - c.x, p.z - c.z) < 16)
      .map((p) => new THREE.Vector3(p.x, p.y - 1, p.z));
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    const out = [c.clone(), ...nodes.slice(0, n - 1)];
    return out;
  }

  // ------------------------------------------------------------------ spawning
  spawnPatrol(spec: PatrolSpec): Guard {
    const g = new Guard(spec.route[0].clone(), spec.route, this, this.ctx.scene, !!spec.post);
    g.yaw = spec.route.length > 1 ? Math.atan2(spec.route[1].x - spec.route[0].x, spec.route[1].z - spec.route[0].z) : rand(0, Math.PI * 2);
    this.guards.push(g);
    this.ctx.scene.add(g.rig.root);
    return g;
  }

  /** Reinforcement from a door the player can't see, as close to the incident as possible. */
  private reinforce(near: THREE.Vector3): Guard | null {
    if (this.budget <= 0 || this.guards.filter((g) => g.alive).length >= MAX_GUARDS) return null;
    const p = this.ctx.player.pos;
    const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const look = new THREE.Vector3(-Math.sin(this.ctx.player.yaw), 0, -Math.cos(this.ctx.player.yaw));
    const ok = this.doors.filter((d) => {
      if (d.distanceTo(p) < 24) return false;
      // Never in plain view, and never straight ahead of the player even if occluded.
      const to = new THREE.Vector3(d.x - p.x, 0, d.z - p.z).normalize();
      if (to.dot(look) > 0.85 && d.distanceTo(p) < 40) return false;
      return !this.ctx.col.lineOfSight(eye, new THREE.Vector3(d.x, d.y + 1.5, d.z));
    });
    if (!ok.length) return null;
    ok.sort((a, b) => a.distanceTo(near) - b.distanceTo(near));
    const door = ok[Math.min(ok.length - 1, Math.floor(Math.random() * Math.min(2, ok.length)))];
    const g = new Guard(door.clone(), [door.clone()], this, this.ctx.scene);
    g.reinforcement = true;
    g.exit = door.clone();
    g.yaw = Math.atan2(near.x - door.x, near.z - door.z);
    g.rememberUntil = this.ctx.time + 30;
    g.setG('emerge');
    this.guards.push(g);
    this.ctx.scene.add(g.rig.root);
    this.budget--;
    this.stats.reinforcements++;
    this.audio.radio(door, 'door');
    return g;
  }

  // ------------------------------------------------------------------ events
  /** A guard has positively identified the fugitive. */
  confirm(g: Guard) {
    const p = this.ctx.player.pos;
    const before = this.alert.level;
    this.alert.sighting(p.x, p.y, p.z, this.ctx.time);
    g.bark('contact');
    if (before !== 'pursuit') {
      this.onRadio(`CONTACT — FUGITIVE SIGHTED · ${place(p)}`, 'alert');
      this.broadcast(p);
    }
  }

  /** Ongoing visual contact (keeps the pursuit alive, refreshes the shared position). */
  contact(_g: Guard) {
    const p = this.ctx.player.pos;
    this.alert.sighting(p.x, p.y, p.z, this.ctx.time);
  }

  /** Nearest free guards converge on the reported position; the rest keep their posts. */
  private broadcast(at: THREE.Vector3) {
    const free = this.guards
      .filter((g) => g.alive && !g.gone && g.gstate !== 'combat')
      .map((g) => ({ g, d: g.pos.distanceTo(at) }))
      .filter((x) => x.d < 70)
      .sort((a, b) => a.d - b.d)
      .slice(0, RESPONDERS);
    for (const { g } of free) g.pursue(at.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2))));
  }

  /** Something loud happened (shots). Guards in earshot react; civilians are told separately. */
  gunshot(at: THREE.Vector3, byPlayer: boolean) {
    if (!byPlayer) return;
    let heard = false;
    for (const g of this.guards) {
      if (!g.alive || g.gone || g.gstate === 'combat') continue;
      const d = g.pos.distanceTo(at);
      if (d > HEAR_OPEN) continue;
      const clear = this.ctx.col.lineOfSight(g.eye.clone(), at);
      if (!clear && d > HEAR_WALLED) continue;
      heard = true;
      // Hearing is approximate: they head for the general area.
      g.hearShot(at.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))));
    }
    if (heard) {
      const fresh = this.alert.report(at.x, at.y, at.z, this.ctx.time, 'gunshot');
      if (fresh && this.alert.level === 'alerted') this.onRadio(`SHOTS FIRED · ${place(at)}`, 'warn');
    }
  }

  /** A civilian called it in: last seen position, second hand. */
  civilianReport(at: THREE.Vector3) {
    const fresh = this.alert.report(at.x, at.y, at.z, this.ctx.time, 'civilian');
    if (!fresh) return;
    this.onRadio(`DISPATCH — ARMED MAN REPORTED · ${place(at)}`, 'warn');
    this.audio.radio(null, 'dispatch');
    const near = this.guards
      .filter((g) => g.alive && !g.gone && !g.hostile)
      .sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at))
      .slice(0, 2);
    for (const g of near) g.investigate(at.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2))), true);
  }

  bark(g: Guard, kind: string) {
    this.audio.radio(g.chest.clone(), kind);
  }

  onGuardDown(_g: Guard) {
    this.stats.guardsDown++;
  }

  private levelChanged(l: AlertLevel, prev: AlertLevel) {
    const t = this.ctx.time;
    if (l === 'pursuit' && prev !== 'search') {
      // New episode: a fresh, limited reinforcement budget.
      this.budget = this.budgetPerEpisode;
      const k = this.alert.lastKnown!;
      const at = new THREE.Vector3(k.x, k.y, k.z);
      const n = Math.min(2, this.budget);
      for (let i = 0; i < n; i++) this.reinforce(at);
      this.secondWaveT = t + 22;
    }
    if (l === 'search') this.onRadio('CONTACT LOST — SEARCH THE AREA', 'info');
    if (l === 'unnoticed' && (prev === 'search' || prev === 'alerted')) {
      this.onRadio('ALL UNITS — RESUME PATROL', 'info');
      for (const g of this.guards) if (g.alive && (g.hostile || g.gstate === 'investigate')) g.setG('return');
    }
    this.onLevel(l, prev);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const ctx = this.ctx;
    const t = ctx.time;
    // Staggered perception: each guard looks ~10 times a second, offset from the others.
    for (const g of this.guards) {
      g.percT += dt;
      if (g.percT >= 0.1) {
        g.perceive(ctx, g.percT);
        g.percT = 0;
      }
    }
    for (const g of this.guards) g.update(dt, ctx);

    // A second, smaller response if the pursuit drags on.
    if (this.secondWaveT > 0 && t > this.secondWaveT) {
      this.secondWaveT = -1;
      if (this.alert.level === 'pursuit' && this.alert.lastKnown) {
        const k = this.alert.lastKnown;
        this.reinforce(new THREE.Vector3(k.x, k.y, k.z));
      }
    }
    this.alert.update(t, this.guards.some((g) => g.alive && g.suspicion >= SUSPICIOUS * 0.6 && !g.hostile));

    for (let i = this.guards.length - 1; i >= 0; i--) {
      const g = this.guards[i];
      if (g.dead || g.gone) {
        g.dispose(ctx.scene);
        this.guards.splice(i, 1);
      }
    }
    this.blockers = this.blockers.filter((b) => b.until > t);
  }

  /** Guards actively hostile and close: used by the director and music. */
  hostiles(within = 40) {
    const p = this.ctx.player.pos;
    return this.guards.filter((g) => g.alive && g.hostile && g.pos.distanceTo(p) < within).length;
  }

  clear() {
    for (const g of this.guards) g.dispose(this.ctx.scene);
    this.guards.length = 0;
    this.blockers.length = 0;
    this.alert.reset();
    this.budget = this.budgetPerEpisode;
    this.secondWaveT = -1;
    this.stats = { guardsDown: 0, reinforcements: 0 };
  }
}

function segSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / (l2 || 1);
  t = Math.max(0, Math.min(1, t));
  const px = a.x + abx * t - c.x, py = a.y + aby * t - c.y, pz = a.z + abz * t - c.z;
  return px * px + py * py + pz * pz < r * r;
}

function place(p: THREE.Vector3) {
  return zoneAt(p.x, p.y, p.z)?.name ?? 'SECTOR 7';
}
