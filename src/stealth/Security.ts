import * as THREE from 'three';
import type { EnemyCtx } from '../enemies/Enemy';
import type { Glows } from '../world/Glows';
import { zoneAt } from '../world/Zones';
import { AlertSystem, type AlertLevel } from './AlertSystem';
import { SUSPICIOUS } from './Perception';
import { Guard, type SearchRole } from './Guard';
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
/** Guards sent by dispatch to a fresh sighting (the first response). */
const RESPONDERS = 2;
/** Seconds of continuous pursuit before the next reinforcement is sent. */
const SECOND_WAVE = 12;
/** Officers only hear dispatch about incidents within this distance. */
const RADIO_RANGE = 60;
/** While someone has eyes on him, dispatch repeats the position this often. */
const RADIO_EVERY = 3;
const MAX_GUARDS = 12;
/** Search roles handed out in order when contact is lost. */
const ROLES: SearchRole[] = ['sweep', 'probe', 'hold', 'probe', 'sweep', 'hold'];

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
  private radioT = -Infinity;
  private lastPlayerShotT = -Infinity;
  /** Movement of the fugitive at the last confirmed sighting (which way he went). */
  lastVel = new THREE.Vector3();
  /** Radio line for the HUD feed. */
  onRadio: (text: string, tone: 'info' | 'warn' | 'alert') => void = () => {};
  onLevel: (level: AlertLevel, prev: AlertLevel) => void = () => {};
  civilianBlocks: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => false;
  /** Every shot fired by anyone (civilians react to all gunfire). */
  onShot: (at: THREE.Vector3) => void = () => {};
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

  /** The player fired within the last moment (muzzle flash visible). */
  playerFiring(t: number) {
    return t - this.lastPlayerShotT < 0.6;
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

  /**
   * Nav points to check around a last known position, by role: `sweep` close around it, `probe`
   * further out and favouring the direction he was heading (including stairs to other levels),
   * `hold` a vantage point near it to watch. Points other searchers already have are avoided.
   */
  searchPoints(c: THREE.Vector3, n: number, role: SearchRole, radius: number, self?: Guard): THREE.Vector3[] {
    const dir = this.lastVel.lengthSq() > 0.25 ? this.lastVel.clone().setY(0).normalize() : null;
    const taken: THREE.Vector3[] = [];
    for (const g of this.guards) if (g !== self && g.alive && g.gstate === 'search') taken.push(...g.searchPts);
    const cand: { p: THREE.Vector3; s: number }[] = [];
    for (const nd of this.ctx.nav.nodes) {
      const x = nd.x, y = nd.y - 1, z = nd.z;
      const dh = Math.hypot(x - c.x, z - c.z);
      const dy = y - c.y;
      if (dh > radius) continue;
      const otherLevel = Math.abs(dy) > 1.5;
      if (otherLevel && (role !== 'probe' || dh > radius * 0.8 || Math.abs(dy) > 10)) continue;
      let sc = Math.random() * 0.6;
      if (role === 'sweep') sc += 1 - dh / radius;
      else if (role === 'probe') {
        if (dh < 5) continue;
        if (dir) sc += 1.2 * ((x - c.x) * dir.x + (z - c.z) * dir.z) / dh;
        if (otherLevel) sc += 0.5;
      } else if (dh < 3 || dh > 9) continue;
      if (taken.some((q) => q.distanceToSquared(new THREE.Vector3(x, y, z)) < 9)) sc -= 1;
      cand.push({ p: new THREE.Vector3(x, y, z), s: sc });
    }
    cand.sort((a, b) => b.s - a.s);
    const out = cand.slice(0, n).map((c) => c.p);
    if (role === 'sweep') out.unshift(c.clone());
    if (!out.length && role === 'hold') return this.searchPoints(c, n, 'sweep', radius, self);
    return out.slice(0, Math.max(1, n));
  }

  /** Contact lost: everyone hunting splits the area up by role around the last known position. */
  private organiseSearch() {
    const k = this.alert.lastKnown;
    if (!k) return;
    const c = new THREE.Vector3(k.x, k.y, k.z);
    const hunters = this.guards.filter((g) => g.alive && !g.gone && g.hostile && g.gstate !== 'combat').sort((a, b) => a.pos.distanceTo(c) - b.pos.distanceTo(c));
    hunters.forEach((g, i) => g.beginSearchAround(c, ROLES[i % ROLES.length], i < 3 ? 10 : 14));
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

  /**
   * A squad sent to a known position (they followed the informant): spawns out of sight near it,
   * already hunting, and puts security into pursuit. Doesn't use the reinforcement budget.
   */
  ambush(at: THREE.Vector3, n: number) {
    const p = this.ctx.player.pos;
    const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const doors = this.doors
      .filter((d) => d.distanceTo(p) > 18 && !this.ctx.col.lineOfSight(eye, new THREE.Vector3(d.x, d.y + 1.5, d.z)))
      .sort((a, b) => a.distanceTo(at) - b.distanceTo(at));
    for (let i = 0; i < n && doors.length; i++) {
      const door = doors[i % doors.length];
      const g = new Guard(door.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), [door.clone()], this, this.ctx.scene);
      g.reinforcement = true;
      g.exit = door.clone();
      g.rememberUntil = this.ctx.time + 60;
      g.yaw = Math.atan2(at.x - door.x, at.z - door.z);
      g.pursue(at);
      this.guards.push(g);
      this.ctx.scene.add(g.rig.root);
    }
    // The squad is the response: no extra reinforcements for this episode.
    const per = this.budgetPerEpisode;
    this.budgetPerEpisode = 0;
    this.alert.sighting(at.x, at.y, at.z, this.ctx.time);
    this.budgetPerEpisode = per;
    this.secondWaveT = -1;
  }

  /** District-wide alarm at a position (the relay): every free guard converges or searches. */
  alarm(at: THREE.Vector3) {
    this.alert.sighting(at.x, at.y, at.z, this.ctx.time);
    for (const g of this.guards) {
      if (!g.alive || g.gone || g.gstate === 'combat') continue;
      g.rememberUntil = this.ctx.time + 45;
      g.pursue(at.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))));
    }
  }

  /** Sends the `n` unaware guards furthest from a point off duty (they walk to a door and leave). */
  retireFar(n: number, from: THREE.Vector3) {
    const calm = this.guards
      .filter((g) => g.alive && !g.gone && !g.hostile && !g.reinforcement)
      .sort((a, b) => b.pos.distanceTo(from) - a.pos.distanceTo(from))
      .slice(0, n);
    for (const g of calm) {
      g.reinforcement = true;
      g.exit = this.doors.slice().sort((a, b) => a.distanceTo(g.pos) - b.distanceTo(g.pos))[0]?.clone() ?? g.pos.clone();
      g.setG('return');
    }
  }

  get active() {
    return this.guards.filter((g) => g.alive && !g.gone).length;
  }

  // ------------------------------------------------------------------ events
  /** A guard has positively identified the fugitive: what *he* saw goes on the radio. */
  confirm(g: Guard) {
    const p = g.lastSeenPos;
    const before = this.alert.level;
    this.alert.sighting(p.x, p.y, p.z, this.ctx.time);
    this.lastVel.copy(g.lastSeenVel);
    g.bark('contact');
    if (before !== 'pursuit') {
      this.onRadio(`CONTACT — FUGITIVE SIGHTED · ${place(p)}`, 'alert');
      this.broadcast(p.clone(), g);
      this.radioT = this.ctx.time;
    }
  }

  /** Ongoing visual contact by a guard: keeps the pursuit alive and the shared record current. */
  contact(g: Guard) {
    const p = g.lastSeenPos;
    this.alert.sighting(p.x, p.y, p.z, this.ctx.time);
    this.lastVel.copy(g.lastSeenVel);
  }

  /**
   * The nearest free guards within radio range converge on a snapshot of the reported position,
   * each to a different side of it so they don't arrive in a clump. The rest keep their posts.
   */
  private broadcast(at: THREE.Vector3, from?: Guard) {
    const free = this.guards
      .filter((g) => g !== from && g.alive && !g.gone && g.gstate !== 'combat')
      .map((g) => ({ g, d: g.pos.distanceTo(at) }))
      .filter((x) => x.d < RADIO_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, RESPONDERS);
    const t = this.ctx.time;
    free.forEach(({ g }, i) => {
      const a = (i / Math.max(1, free.length)) * Math.PI * 2 + rand(-0.4, 0.4);
      g.pursue(at.clone().add(new THREE.Vector3(Math.sin(a) * 3, 0, Math.cos(a) * 3)), t);
    });
  }

  /** Something loud happened (shots). Guards in earshot react; civilians are told separately. */
  gunshot(at: THREE.Vector3, byPlayer: boolean, by?: Guard) {
    this.onShot(at);
    if (by) this.onHeard(by);
    if (!byPlayer) return;
    this.lastPlayerShotT = this.ctx.time;
    let heard = false;
    for (const g of this.guards) {
      if (!g.alive || g.gone || g.gstate === 'combat') continue;
      const d = g.pos.distanceTo(at);
      if (d > HEAR_OPEN) continue;
      const clear = this.ctx.col.lineOfSight(g.eye.clone(), at);
      if (!clear && d > HEAR_WALLED) continue;
      heard = true;
      // Hearing is approximate, and less precise the further (or more muffled) the shot.
      const err = 1.5 + d * (clear ? 0.1 : 0.2);
      g.hearShot(at.clone().add(new THREE.Vector3(rand(-err, err), 0, rand(-err, err))), this.ctx.time);
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
    this.onHeard(g);
  }

  /** A guard made itself heard (bark, shot) — the HUD may mark roughly where. */
  onHeard: (g: Guard) => void = () => {};

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
      // One unit straight away; the rest only if the pursuit drags on.
      if (this.budget > 0) this.reinforce(at);
      this.secondWaveT = t + SECOND_WAVE;
    }
    if (l === 'search') {
      this.onRadio('CONTACT LOST — SEARCH THE AREA', 'info');
      this.organiseSearch();
    }
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
    // Staggered perception: 8 Hz near the player, 3 Hz far away, offset from each other.
    for (const g of this.guards) {
      g.percT += dt;
      if (g.percT >= g.perceptionInterval(ctx)) {
        g.perceive(ctx, g.percT);
        g.percT = 0;
      }
    }
    // While someone has eyes on him, dispatch repeats a snapshot to the hunters in range.
    if (this.alert.level === 'pursuit' && this.alert.lastKnown && t - this.alert.contactT < 0.35 && t - this.radioT > RADIO_EVERY) {
      this.radioT = t;
      const k = this.alert.lastKnown;
      const at = new THREE.Vector3(k.x, k.y, k.z);
      for (const g of this.guards) {
        if (!g.alive || g.gone || (g.gstate !== 'pursuit' && g.gstate !== 'search')) continue;
        if (g.pos.distanceTo(at) < RADIO_RANGE) g.radioUpdate(at, t);
      }
    }
    for (const g of this.guards) g.update(dt, ctx);

    // Further units, one at a time, while the pursuit drags on (until the budget runs out).
    if (this.secondWaveT > 0 && t > this.secondWaveT) {
      this.secondWaveT = this.budget > 1 ? t + SECOND_WAVE : -1;
      if (this.alert.level === 'pursuit' && this.alert.lastKnown) {
        const k = this.alert.lastKnown;
        this.reinforce(new THREE.Vector3(k.x, k.y, k.z));
      } else this.secondWaveT = -1;
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
    this.radioT = this.lastPlayerShotT = -Infinity;
    this.lastVel.set(0, 0, 0);
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
