import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import type { Nav } from '../enemies/Nav';
import type { Player } from '../player/Player';
import { mulberry32, rand } from '../core/math';

export type CivState = 'walk' | 'idle' | 'chat' | 'alarmed' | 'flee' | 'cower' | 'down';

/** Spots where people linger: storefronts, shelter under walkways, waiting places, chatting groups. */
export interface Poi {
  pos: THREE.Vector3;
  yaw: number;
  kind: 'shop' | 'shelter' | 'wait' | 'chat';
}

interface Civ {
  pos: THREE.Vector3;
  yaw: number;
  vel: THREE.Vector3;
  state: CivState;
  stateT: number;
  path: number[];
  node: number;
  speed: number;
  phase: number;
  scale: number;
  umbrella: boolean;
  phone: boolean;
  lane: number;
  /** Seconds the drawn weapon has been in view. */
  sawGun: number;
  /** Countdown to the phone call reaching security (0 = not calling). */
  reportT: number;
  reportPos: THREE.Vector3;
  lostSight: number;
  fear: number;
  threat: THREE.Vector3;
  idleUntil: number;
  aiT: number;
  hidden: boolean;
  fallen: number;
  partner: number;
  /** Excluded from the recycler (scripted characters). */
  pinned: boolean;
  /** Already rolled whether to abandon the current call. */
  doubted: boolean;
  /** Final spot after the path (a shopfront etc.) and the way to face there. */
  goal: THREE.Vector3 | null;
  lingerYaw: number | null;
}

const COUNT = 36;
const WALK = 1.25;
const RUN = 4.6;
const RADIUS = 0.3;
const SEE_GUN = 16;
const HEAR = 34;

const COATS = [0x2b2d36, 0x3a3f4a, 0x1e2a3a, 0x4a3a32, 0x22262d, 0x5a4636, 0x2f3b33, 0x3d2c3f, 0x7a2b32, 0x6b6f78, 0xb8b0a0, 0x1a1a1f, 0x31415a, 0x8a5a3a];
const PANTS = [0x15161a, 0x23252b, 0x2a2c33, 0x1c2230, 0x3a3530];
const SKIN = [0xe0b090, 0xc99a74, 0xa87656, 0xf0c8a8, 0xd2a07c];
const HAIR = [0x0d0b0a, 0x1b1410, 0x2a1e18, 0x3b2a20, 0x8a8a8a, 0x5a2a1e];
const BRELLA = [0xffffff, 0xffffff, 0xffffff, 0x101014, 0x1c2a48, 0x7a1424, 0x2a4a3a];

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * The people of the district. Lightweight agents walking the nav graph between places, lingering
 * at shops and shelter, chatting. They notice a drawn gun, may phone security, panic at gunfire and
 * clear the area, then calm down. Drawn with one InstancedMesh per body part (plus umbrellas).
 */
export class Crowd {
  civs: Civ[] = [];
  private parts: Record<string, THREE.InstancedMesh> = {};
  private allowed: number[] = [];
  private rnd = mulberry32(7);
  /** A witness started phoning (HUD hint) / the call went through. */
  onCalling: (pos: THREE.Vector3) => void = () => {};
  onReport: (pos: THREE.Vector3) => void = () => {};
  onScream: (pos: THREE.Vector3) => void = () => {};
  /** The witness gave up on the call. */
  onAbandon: (pos: THREE.Vector3) => void = () => {};
  stats = { alarmed: 0, harmed: 0 };
  private nextReportOk = 0;
  private screamT = 0;
  private callIcon: THREE.Sprite;

  constructor(
    private scene: THREE.Scene,
    private col: CollisionWorld,
    private nav: Nav,
    private pois: Poi[],
  ) {
    this.setUnderground(false);
    this.buildMeshes();
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffd65a';
    g.font = 'bold 54px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 32, 34);
    const tex = new THREE.CanvasTexture(c);
    this.callIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2, 1.8, 1), depthTest: true, transparent: true }));
    this.callIcon.scale.setScalar(0.45);
    this.callIcon.visible = false;
    scene.add(this.callIcon);
  }

  private buildMeshes() {
    const mk = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const im = new THREE.InstancedMesh(geo, mat, COUNT);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.scene.add(im);
      this.parts[name] = im;
      return im;
    };
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    const torso = new THREE.CylinderGeometry(0.19, 0.24, 0.66, 8);
    torso.scale(1, 1, 0.68);
    mk('torso', torso, cloth);
    const leg = new THREE.BoxGeometry(0.13, 0.84, 0.14);
    leg.translate(0, -0.42, 0);
    mk('legL', leg, cloth.clone());
    mk('legR', leg, this.parts.legL.material as THREE.Material);
    const arm = new THREE.BoxGeometry(0.095, 0.6, 0.1);
    arm.translate(0, -0.3, 0);
    mk('armL', arm, cloth);
    mk('armR', arm, cloth);
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    mk('head', new THREE.SphereGeometry(0.115, 10, 8), skin);
    const hairGeo = new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    mk('hair', hairGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }));
    const canopy = new THREE.ConeGeometry(0.58, 0.26, 10, 1, true);
    mk('canopy', canopy, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide, envMapIntensity: 1.4, depthWrite: false }));
    mk('shaft', new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.6, roughness: 0.4 }));
    mk('phone', new THREE.BoxGeometry(0.07, 0.12, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.8, 2.4) }));

    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const r = this.rnd;
      this.parts.torso.setColorAt(i, c.setHex(COATS[Math.floor(r() * COATS.length)]));
      const pants = c.setHex(PANTS[Math.floor(r() * PANTS.length)]).clone();
      this.parts.legL.setColorAt(i, pants);
      this.parts.legR.setColorAt(i, pants);
      const coat = new THREE.Color();
      this.parts.torso.getColorAt(i, coat);
      this.parts.armL.setColorAt(i, coat);
      this.parts.armR.setColorAt(i, coat);
      this.parts.head.setColorAt(i, c.setHex(SKIN[Math.floor(r() * SKIN.length)]));
      this.parts.hair.setColorAt(i, c.setHex(HAIR[Math.floor(r() * HAIR.length)]));
      this.parts.canopy.setColorAt(i, c.setHex(BRELLA[Math.floor(r() * BRELLA.length)]));
    }
    for (const im of Object.values(this.parts)) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.setVisible(false);
  }

  /** Civilians walk the street level (and the station once it's open); few go up to the walkways. */
  setUnderground(open: boolean) {
    const r = mulberry32(3);
    this.allowed = this.nav.nodes
      .map((_, i) => i)
      .filter((i) => {
        const y = this.nav.nodes[i].y - 1;
        if (y < -1) return open;
        if (y > 7) return r() < 0.08;
        return y < 3 || r() < 0.15;
      });
  }

  /** Only story mode has a population. */
  setVisible(on: boolean) {
    for (const im of Object.values(this.parts)) im.visible = on;
    if (!on) this.callIcon && (this.callIcon.visible = false);
  }

  /** Scatter everyone over the district, away from the player. */
  populate(avoid: THREE.Vector3) {
    this.civs.length = 0;
    const r = this.rnd;
    // Chat groups first: two or three people at a chat spot.
    const chats = this.pois.filter((p) => p.kind === 'chat');
    for (let i = 0; i < COUNT; i++) {
      const civ: Civ = {
        pos: new THREE.Vector3(),
        yaw: 0,
        vel: new THREE.Vector3(),
        state: 'walk',
        stateT: 0,
        path: [],
        node: 0,
        speed: WALK * (0.85 + r() * 0.3),
        phase: r() * 6,
        scale: 0.92 + r() * 0.16,
        umbrella: r() < 0.55,
        phone: r() < 0.2,
        lane: (r() - 0.5) * 1.4,
        sawGun: 0,
        reportT: 0,
        reportPos: new THREE.Vector3(),
        lostSight: 0,
        fear: 0,
        threat: new THREE.Vector3(),
        idleUntil: 0,
        aiT: r() * 0.2,
        hidden: false,
        fallen: 0,
        partner: -1,
        pinned: false,
        goal: null,
        lingerYaw: null,
        doubted: false,
      };
      this.civs.push(civ);
      const chat = chats[Math.floor(i / 3)];
      if (chat && i < chats.length * 3 && i % 3 !== 2) {
        const side = i % 3 === 0 ? -1 : 1;
        civ.pos.copy(chat.pos).add(_v.set(Math.cos(chat.yaw) * 0.55 * side, 0, -Math.sin(chat.yaw) * 0.55 * side));
        civ.yaw = chat.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        civ.state = 'chat';
        civ.umbrella = r() < 0.4;
        civ.node = this.nearestNode(civ.pos);
        continue;
      }
      this.placeAway(civ, avoid, 12);
    }
  }

  /** Puts a civilian on a random allowed node at least `min` metres from `avoid`. */
  private placeAway(civ: Civ, avoid: THREE.Vector3, min: number, max = Infinity) {
    for (let k = 0; k < 30; k++) {
      const n = this.allowed[Math.floor(Math.random() * this.allowed.length)];
      const p = this.nav.nodes[n];
      const d = Math.hypot(p.x - avoid.x, p.z - avoid.z);
      if (d < min || d > max) continue;
      civ.node = n;
      civ.pos.set(p.x + rand(-0.6, 0.6), p.y - 1, p.z + rand(-0.6, 0.6));
      this.col.resolveCircle(civ.pos, RADIUS, 1.7);
      civ.state = 'walk';
      civ.path = [];
      civ.vel.set(0, 0, 0);
      return true;
    }
    return false;
  }

  private nearestNode(p: THREE.Vector3) {
    let best = 0;
    let bd = Infinity;
    for (const i of this.allowed) {
      const n = this.nav.nodes[i];
      const d = (n.x - p.x) ** 2 + ((n.y - 1 - p.y) * 3) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private pickDestination(civ: Civ) {
    // Usually somewhere to linger, sometimes just another street.
    const r = Math.random();
    if (r < 0.45 && this.pois.length) {
      const poi = this.pois[Math.floor(Math.random() * this.pois.length)];
      if (poi.kind !== 'chat') {
        const goal = this.nearestNode(poi.pos);
        civ.path = this.nav.path(civ.node, goal);
        if (civ.path.length) {
          civ.goal = poi.pos.clone().add(_v.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)));
          civ.lingerYaw = poi.yaw;
          return;
        }
      }
    }
    const goal = this.allowed[Math.floor(Math.random() * this.allowed.length)];
    civ.path = this.nav.path(civ.node, goal);
    civ.goal = null;
    civ.lingerYaw = null;
  }

  // ------------------------------------------------------------------ reactions
  /** Gunfire: people nearby panic and clear the area; very close ones may freeze and cower. */
  onGunshot(at: THREE.Vector3, t: number) {
    for (const c of this.civs) {
      if (c.state === 'down') continue;
      const d = c.pos.distanceTo(at);
      if (d > HEAR) continue;
      c.threat.copy(at);
      c.fear = Math.max(c.fear, 1 - d / HEAR + 0.4);
      if (c.state === 'flee' || c.state === 'cower') continue;
      if (d < 7 && Math.random() < 0.45) this.setState(c, 'cower');
      else this.flee(c);
      c.idleUntil = t;
      if (d < 18) this.scream(c);
    }
  }

  /** Something frightening (armed fight, sprinting armed man) — same as a shot but local. */
  frighten(at: THREE.Vector3, radius: number) {
    for (const c of this.civs) {
      if (c.state === 'down' || c.state === 'flee' || c.state === 'cower') continue;
      if (c.pos.distanceTo(at) > radius) continue;
      c.threat.copy(at);
      c.fear = Math.max(c.fear, 0.7);
      this.flee(c);
    }
  }

  private scream(c: Civ) {
    if (this.screamT > 0) return;
    this.screamT = 1.2;
    this.onScream(c.pos.clone().setY(c.pos.y + 1.5));
  }

  private setState(c: Civ, s: CivState) {
    c.state = s;
    c.stateT = 0;
  }

  /** Run to a node far from the threat. */
  private flee(c: Civ) {
    let best = -1;
    let score = -Infinity;
    for (let k = 0; k < 14; k++) {
      const n = this.allowed[Math.floor(Math.random() * this.allowed.length)];
      const p = this.nav.nodes[n];
      if (Math.abs(p.y - 1 - c.pos.y) > 6) continue;
      const fromThreat = Math.hypot(p.x - c.threat.x, p.z - c.threat.z);
      const fromMe = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      // Don't run through the danger: the destination must be further from it than I am.
      const mine = Math.hypot(c.pos.x - c.threat.x, c.pos.z - c.threat.z);
      if (fromThreat < mine + 8) continue;
      const s = fromThreat - fromMe * 0.35;
      if (s > score) {
        score = s;
        best = n;
      }
    }
    if (best < 0) {
      // Nowhere further to run: if the danger is already far, just settle down; cower only when it's close.
      const mine = Math.hypot(c.pos.x - c.threat.x, c.pos.z - c.threat.z);
      if (mine > 20) {
        this.setState(c, 'idle');
        c.idleUntil = 0;
      } else this.setState(c, 'cower');
      return;
    }
    c.path = this.nav.path(c.node, best);
    c.goal = null;
    c.lingerYaw = null;
    this.setState(c, 'flee');
    c.idleUntil = 0;
  }

  /** Ray against civilian bodies (bullets). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { dist: number; civ: number } | null {
    let best: { dist: number; civ: number } | null = null;
    for (let i = 0; i < this.civs.length; i++) {
      const c = this.civs[i];
      if (c.hidden || c.state === 'down') continue;
      for (const [y, r] of [[1.55, 0.14], [1.15, 0.27], [0.55, 0.22]] as const) {
        const cy = c.pos.y + (c.state === 'cower' ? y * 0.55 : y * c.scale);
        _a.set(c.pos.x - origin.x, cy - origin.y, c.pos.z - origin.z);
        const tca = _a.dot(dir);
        if (tca < 0 || tca > maxDist) continue;
        const d2 = _a.lengthSq() - tca * tca;
        if (d2 > r * r) continue;
        const t = tca - Math.sqrt(r * r - d2);
        if (!best || t < best.dist) best = { dist: t, civ: i };
      }
    }
    return best;
  }

  /** A guard checks for bystanders before firing. */
  blocks(from: THREE.Vector3, to: THREE.Vector3) {
    _b.subVectors(to, from);
    const len = _b.length();
    _b.divideScalar(len);
    const h = this.raycast(from, _b, len - 0.5);
    return !!h;
  }

  hit(i: number, dir: THREE.Vector3) {
    const c = this.civs[i];
    this.setState(c, 'down');
    c.yaw = Math.atan2(dir.x, dir.z) + Math.PI;
    c.fallen = 0;
    c.reportT = 0;
    this.stats.harmed++;
    this.onGunshot(c.pos, 0);
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, t: number, player: Player, armed: boolean, pursuit: boolean) {
    this.screamT -= dt;
    let calling: Civ | null = null;
    for (let i = 0; i < this.civs.length; i++) {
      const c = this.civs[i];
      c.stateT += dt;
      const dPlayer = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      c.hidden = dPlayer > 70 || Math.abs(c.pos.y - player.pos.y) > 9;
      // Decisions at ~5 Hz (less when far away).
      c.aiT -= dt;
      if (c.aiT <= 0) {
        c.aiT = dPlayer > 40 ? 0.6 : 0.2;
        this.think(c, i, t, player, armed, pursuit, dPlayer, dPlayer > 40 ? 0.6 : 0.2);
      }
      this.steer(c, dt, player);
      if (c.reportT > 0) {
        c.reportT -= dt;
        calling = c;
        if (c.reportT <= 0) {
          this.onReport(c.reportPos.clone());
          this.nextReportOk = t + 8;
        }
      }
    }
    if (calling) {
      this.callIcon.visible = !calling.hidden;
      this.callIcon.position.set(calling.pos.x, calling.pos.y + 2.2 * calling.scale + Math.sin(t * 6) * 0.04, calling.pos.z);
    } else this.callIcon.visible = false;
    this.render(t);
  }

  private think(c: Civ, i: number, t: number, player: Player, armed: boolean, pursuit: boolean, d: number, dt: number) {
    if (c.state === 'down') return;
    // Fear fades on its own: the street goes back to normal.
    c.fear = Math.max(0, c.fear - dt * 0.06);
    // Noticing a drawn weapon: needs to be in view, in line of sight, and for a moment.
    const sees = armed && player.alive && d < SEE_GUN && this.canSee(c, player);
    if (sees) {
      c.sawGun += dt * (d < 6 ? 2 : 1);
      c.lostSight = 0;
      c.reportPos.copy(player.pos);
    } else {
      c.sawGun = Math.max(0, c.sawGun - dt * 0.4);
      c.lostSight += dt;
    }
    const calm = c.state === 'walk' || c.state === 'idle' || c.state === 'chat';
    if (calm && c.sawGun > 0.7) {
      this.setState(c, 'alarmed');
      c.threat.copy(player.pos);
      c.fear = 1;
      this.stats.alarmed++;
      this.scream(c);
      // Some of them call it in, but not during an obvious firefight, and not all at once.
      if (!pursuit && t > this.nextReportOk && !this.civs.some((o) => o.reportT > 0) && Math.random() < 0.65) {
        c.reportT = rand(3.5, 5.5);
        c.doubted = false;
        this.onCalling(c.pos.clone());
      }
    }
    // Lose the witness quickly (holster, duck out of sight) and they may not be sure enough to finish the call.
    if (c.reportT > 1 && c.lostSight > 1.5 && !c.doubted) {
      c.doubted = true;
      if (Math.random() < 0.45) {
        c.reportT = 0;
        this.onAbandon(c.pos.clone());
      }
    }
    // Armed pursuit close by: get out of the way.
    if (calm && pursuit && d < 14) {
      c.threat.copy(player.pos);
      this.flee(c);
    }

    switch (c.state) {
      case 'alarmed':
        if (c.stateT > 0.9) this.flee(c);
        break;
      case 'cower':
        if (c.stateT > rand(3, 6)) {
          if (c.fear < 0.3) {
            this.setState(c, 'idle');
            c.idleUntil = t + rand(2, 5);
          } else this.flee(c);
        }
        break;
      case 'flee':
        if (!c.path.length) {
          c.fear = Math.max(0, c.fear - 0.2);
          if (c.fear <= 0.3 || c.stateT > 20) {
            this.setState(c, 'idle');
            c.idleUntil = t + rand(4, 10);
          } else this.flee(c);
        }
        break;
      case 'idle':
        if (t > c.idleUntil) {
          // Recycle people far away so the density stays around the player.
          if (d > 55 && !c.pinned && Math.random() < 0.5) this.placeAway(c, player.pos, 28, 52);
          this.setState(c, 'walk');
          this.pickDestination(c);
        }
        break;
      case 'walk':
        if (!c.path.length && !c.goal) {
          if (c.lingerYaw !== null) {
            // Arrived at a place to linger: face the shopfront / shelter.
            c.yaw = c.lingerYaw;
            c.lingerYaw = null;
            this.setState(c, 'idle');
            c.idleUntil = t + rand(6, 18);
          } else {
            this.setState(c, 'idle');
            c.idleUntil = t + rand(0.5, 3);
          }
        }
        break;
      case 'chat':
        void i;
        break;
    }
  }

  private canSee(c: Civ, player: Player) {
    const dx = player.pos.x - c.pos.x;
    const dz = player.pos.z - c.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const cos = (Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz) / l;
    if (cos < 0.1 && l > 3) return false;
    _a.set(c.pos.x, c.pos.y + 1.6, c.pos.z);
    _b.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    return this.col.lineOfSight(_a, _b);
  }

  private steer(c: Civ, dt: number, player: Player) {
    const moving = c.state === 'walk' || c.state === 'flee';
    const want = _v.set(0, 0, 0);
    if (moving && c.path.length) {
      const n = this.nav.nodes[c.path[0]];
      // Lane offset keeps people from walking in single file down the middle.
      let tx = n.x;
      let tz = n.z;
      if (c.path.length > 1 && c.state === 'walk') {
        const m = this.nav.nodes[c.path[1]];
        const ex = m.x - n.x, ez = m.z - n.z;
        const el = Math.hypot(ex, ez) || 1;
        tx += (-ez / el) * c.lane;
        tz += (ex / el) * c.lane;
      }
      const dx = tx - c.pos.x;
      const dz = tz - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < (c.state === 'flee' ? 1.2 : 0.9)) {
        c.node = c.path.shift()!;
      } else {
        const sp = c.state === 'flee' ? RUN * (0.85 + c.fear * 0.25) : c.speed;
        want.set((dx / d) * sp, 0, (dz / d) * sp);
      }
    } else if (c.state === 'walk' && c.goal) {
      const dx = c.goal.x - c.pos.x;
      const dz = c.goal.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35 || c.stateT > 30) c.goal = null;
      else want.set((dx / d) * c.speed * 0.8, 0, (dz / d) * c.speed * 0.8);
    }
    // Personal space: other people, and the player (who always has right of way).
    for (const o of this.civs) {
      if (o === c || o.state === 'down') continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 1e-6 && Math.abs(c.pos.y - o.pos.y) < 1) {
        const d = Math.sqrt(d2);
        want.x += (dx / d) * (0.7 - d) * 5;
        want.z += (dz / d) * (0.7 - d) * 5;
      }
    }
    {
      const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-4 && Math.abs(c.pos.y - player.pos.y) < 1.2) {
        c.pos.x = player.pos.x + (dx / d) * 0.75;
        c.pos.z = player.pos.z + (dz / d) * 0.75;
      }
    }
    if (c.state === 'down' || c.state === 'cower' || c.state === 'chat' || c.state === 'idle' || c.state === 'alarmed') want.multiplyScalar(c.state === 'down' ? 0 : 0.5);
    const k = 1 - Math.exp(-8 * dt);
    c.vel.x += (want.x - c.vel.x) * k;
    c.vel.z += (want.z - c.vel.z) * k;
    c.pos.x += c.vel.x * dt;
    c.pos.z += c.vel.z * dt;
    if (!c.hidden || moving) {
      this.col.resolveCircle(c.pos, RADIUS, 1.7);
      const g = this.col.groundHeightAt(c.pos.x, c.pos.z, RADIUS * 0.6, c.pos.y);
      c.pos.y = c.pos.y - g < 0.6 ? g : c.pos.y - 9 * dt;
      if (c.pos.y < g) c.pos.y = g;
    }
    const hs = Math.hypot(c.vel.x, c.vel.z);
    if (hs > 0.2 && c.state !== 'alarmed') {
      const want2 = Math.atan2(c.vel.x, c.vel.z);
      let dy = want2 - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, 8 * dt);
    } else if (c.state === 'alarmed' || c.state === 'cower') {
      const want2 = Math.atan2(c.threat.x - c.pos.x, c.threat.z - c.pos.z);
      let dy = want2 - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, 6 * dt);
    }
    c.phase += hs * dt * 2.3;
    if (c.state === 'down') c.fallen = Math.min(1, c.fallen + dt * 2.5);
  }

  // ------------------------------------------------------------------ rendering
  private set(name: string, i: number, m: THREE.Matrix4) {
    this.parts[name].setMatrixAt(i, m);
  }

  private render(t: number) {
    const zero = _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.civs.length; i++) {
      const c = this.civs[i];
      if (c.hidden) {
        for (const k in this.parts) this.parts[k].setMatrixAt(i, zero);
        continue;
      }
      const s = c.scale;
      const hs = Math.hypot(c.vel.x, c.vel.z);
      const run = c.state === 'flee';
      const walkK = Math.min(1, hs / 1.2);
      const sw = Math.sin(c.phase) * (run ? 0.85 : 0.45) * walkK;
      const cower = c.state === 'cower' ? 1 : 0;
      const down = c.state === 'down' ? c.fallen : 0;
      const lean = (run ? 0.25 : 0.04) * walkK;
      const hipY = (0.88 - cower * 0.38) * s;
      const bob = Math.abs(Math.cos(c.phase)) * 0.04 * walkK;
      _root.compose(c.pos, _q.setFromEuler(_e.set(-down * 1.45, c.yaw, 0, 'YXZ')), _s.set(1, 1, 1));
      if (down) _root.multiply(_m.makeTranslation(0, down * 0.15, 0));
      const local = (x: number, y: number, z: number, rx: number, rz = 0, sc = 1) => {
        _q.setFromEuler(_e.set(rx, 0, rz));
        return _m.compose(_v.set(x, y, z), _q, _s.set(sc, sc, sc)).premultiply(_root);
      };
      this.set('torso', i, local(0, hipY + 0.33 * s + bob, 0, lean + cower * 0.6, 0, s));
      const torsoTop = hipY + 0.66 * s + bob;
      const fwd = Math.sin(lean + cower * 0.6) * 0.33 * s;
      this.set('head', i, local(0, torsoTop + 0.12 * s - cower * 0.08, fwd + 0.02, 0, 0, s));
      this.set('hair', i, local(0, torsoTop + 0.14 * s - cower * 0.08, fwd - 0.005, -0.25, 0, s));
      const kneel = cower * 1.3;
      this.set('legL', i, local(0.1 * s, hipY + bob, 0, sw - kneel * 0.6, 0, s));
      this.set('legR', i, local(-0.1 * s, hipY + bob, 0, -sw - kneel * 0.2, 0, s));
      const sh = torsoTop - 0.06 * s;
      const scared = c.state === 'alarmed' ? 1 : 0;
      // Left arm swings; right arm holds the umbrella (or a phone) unless running or scared.
      const holdsUp = c.umbrella && !run && !cower && !scared && !down;
      const phoneUp = (c.reportT > 0 || (c.phone && c.state === 'idle')) && !run && !cower;
      this.set('armL', i, local(0.25 * s, sh, fwd, -sw * 1.1 - scared * 1.8 - cower * 2.4, 0.08, s));
      const armRrx = holdsUp ? -1.25 : phoneUp ? -2.1 : sw * 1.1 - scared * 1.8 - cower * 2.4;
      this.set('armR', i, local(-0.25 * s, sh, fwd, armRrx, -0.08, s));
      if (holdsUp) {
        this.set('shaft', i, local(-0.2 * s, sh + 0.55 * s, fwd + 0.42 * s, 0.25, 0, s));
        this.set('canopy', i, local(-0.08 * s, sh + 0.98 * s, fwd + 0.25 * s, 0.25, 0, s));
      } else {
        this.parts.shaft.setMatrixAt(i, zero);
        this.parts.canopy.setMatrixAt(i, zero);
      }
      if (phoneUp) this.set('phone', i, local(-0.18 * s, sh + 0.08 * s, fwd + 0.42 * s, -0.3 + Math.sin(t) * 0.02, 0, s));
      else this.parts.phone.setMatrixAt(i, zero);
    }
    for (const k in this.parts) this.parts[k].instanceMatrix.needsUpdate = true;
  }

  reset(avoid: THREE.Vector3) {
    this.populate(avoid);
    this.stats = { alarmed: 0, harmed: 0 };
    this.nextReportOk = 0;
    this.callIcon.visible = false;
  }

  /** Number of calm people near a point (for crowd murmur). */
  calmNear(p: THREE.Vector3, r: number) {
    let n = 0;
    for (const c of this.civs) if ((c.state === 'walk' || c.state === 'idle' || c.state === 'chat') && c.pos.distanceTo(p) < r) n++;
    return n;
  }
}
