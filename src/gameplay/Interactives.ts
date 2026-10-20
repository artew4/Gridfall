import * as THREE from 'three';
import type { Glows, Glow } from '../world/Glows';
import type { Effects } from '../combat/Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { EnemyCtx } from '../enemies/Enemy';
import type { Collider } from '../world/Collision';
import { crossTexture } from '../world/Textures';

const HITS_TO_TRIP = 3;
const CHARGE = 0.4;
const RADIUS = 6;
const COOLDOWN = 25;
const MEDKIT_HEAL = 40;
const MEDKIT_RESPAWN = 45;

const NORMAL = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;

interface Cabinet {
  spot: CabinetSpot;
  /** Point on the cabinet front where arcs start. */
  emitter: THREE.Vector3;
  hits: number;
  charge: number;
  cooldown: number;
  lampMat: THREE.MeshBasicMaterial;
  glow: Glow;
}

interface Medkit {
  pos: THREE.Vector3;
  group: THREE.Group;
  glow: Glow;
  respawn: number;
}


/** A light that goes out when shot (and comes back on restart). */
export interface Breakable {
  glow: Glow;
  collider: Collider;
  pos: THREE.Vector3;
  /** Real light to kill as well, if any. */
  light?: THREE.PointLight;
  extra?: THREE.MeshBasicMaterial[];
}

/** An electrical cabinet: shoot it to arc the enemies around it. */
export interface CabinetSpot {
  pos: THREE.Vector3;
  face: 'n' | 's' | 'e' | 'w';
  collider: Collider;
}

/**
 * Things the player can use: electrical cabinets that discharge into nearby enemies after a few
 * shots, medkits that respawn, and lamps that can be shot out (their glow, halo, reflection and
 * light all go dark together).
 */
export class Interactives {
  private cabinets: Cabinet[] = [];
  private medkits: Medkit[] = [];
  private broken = new Set<Breakable>();
  private saved = new Map<Breakable, { base: number; halo: number; light: number; mode: Glow['mode']; colors: THREE.Color[] }>();

  constructor(
    scene: THREE.Scene,
    glows: Glows,
    private fx: Effects,
    private audio: AudioEngine,
    cabinets: CabinetSpot[],
    medkits: THREE.Vector3[],
    breakables: Breakable[],
  ) {
    const lampGeo = new THREE.BoxGeometry(0.16, 0.16, 0.04);
    for (const spot of cabinets) {
      const [nx, nz] = NORMAL[spot.face];
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.1) });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(spot.pos.x + nx * 0.27, spot.pos.y + 1.6, spot.pos.z + nz * 0.27);
      lamp.rotation.y = Math.atan2(nx, nz);
      scene.add(lamp);
      // Hazard stripe and a lightning glyph so it reads as "shoot me".
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: hazardTexture(), transparent: true }));
      plate.position.set(spot.pos.x + nx * 0.26, spot.pos.y + 1.1, spot.pos.z + nz * 0.26);
      plate.rotation.y = Math.atan2(nx, nz);
      scene.add(plate);
      const glow = glows.add({ pos: lamp.position.clone().add(new THREE.Vector3(nx * 0.2, 0, nz * 0.2)), color: new THREE.Color(1, 0.12, 0.06), radius: 3, base: 1, haloSize: 1.2, haloStrength: 0.45, mode: 'steady' });
      glow.materials.push({ mat: lampMat, base: lampMat.color.clone() });
      const c: Cabinet = { spot, emitter: new THREE.Vector3(spot.pos.x + nx * 0.3, spot.pos.y + 1.2, spot.pos.z + nz * 0.3), hits: 0, charge: 0, cooldown: 0, lampMat, glow };
      spot.collider.onHit = (hit) => this.hitCabinet(c, hit.point);
      this.cabinets.push(c);
    }

    const crossMat = new THREE.MeshBasicMaterial({ map: crossTexture(), color: new THREE.Color(0.4, 3, 1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xe8ece8, roughness: 0.4, metalness: 0.2, emissive: 0x0a3a1a });
    for (const pos of medkits) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.34), boxMat);
      box.position.y = 0.16;
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), crossMat);
      cross.position.y = 0.75;
      group.add(box, cross);
      group.position.copy(pos);
      scene.add(group);
      const glow = glows.add({ pos: pos.clone().add(new THREE.Vector3(0, 0.7, 0)), color: new THREE.Color(0.2, 1, 0.45), radius: 3, base: 0.9, haloSize: 1.6, haloStrength: 0.35, mode: 'steady' });
      this.medkits.push({ pos, group, glow, respawn: 0 });
    }

    for (const br of breakables) {
      this.saved.set(br, { base: br.glow.base, halo: br.glow.haloStrength, light: br.glow.lightBase, mode: br.glow.mode, colors: br.glow.materials.map((m) => m.base.clone()) });
      br.collider.onHit = (hit) => this.breakLamp(br, hit.point);
    }
  }

  private hitCabinet(c: Cabinet, point: THREE.Vector3) {
    this.fx.sparks(point, new THREE.Vector3(0, 1, 0), 12, new THREE.Color(0.6, 0.85, 1), 5);
    this.audio.sparkCrackle(point);
    if (c.cooldown > 0 || c.charge > 0) return;
    c.hits++;
    if (c.hits >= HITS_TO_TRIP) {
      c.charge = CHARGE;
      this.audio.electricCharge(c.emitter);
    }
  }

  private breakLamp(br: Breakable, point: THREE.Vector3) {
    if (this.broken.has(br)) return;
    this.broken.add(br);
    br.glow.base = 0;
    br.glow.haloStrength = 0;
    br.glow.lightBase = 0;
    br.glow.mode = 'steady';
    // Zero the base colours so flicker can't revive them.
    for (const m of br.glow.materials) m.base.setScalar(0.02);
    this.fx.glass(point);
    this.audio.glassBreak(point);
  }

  /** Back to pristine for a restart. */
  reset() {
    for (const br of this.broken) {
      const s = this.saved.get(br)!;
      br.glow.base = s.base;
      br.glow.haloStrength = s.halo;
      br.glow.lightBase = s.light;
      br.glow.mode = s.mode;
      br.glow.materials.forEach((m, i) => m.base.copy(s.colors[i]));
    }
    this.broken.clear();
    for (const c of this.cabinets) {
      c.hits = 0;
      c.charge = 0;
      c.cooldown = 0;
    }
    for (const m of this.medkits) {
      m.respawn = 0;
      m.group.visible = true;
      m.glow.base = 0.9;
    }
  }

  update(dt: number, t: number, ctx: EnemyCtx) {
    for (const c of this.cabinets) {
      if (c.charge > 0) {
        c.charge -= dt;
        if (Math.random() < 0.6) this.fx.sparks(c.emitter, new THREE.Vector3(0, 1, 0), 3, new THREE.Color(0.6, 0.85, 1), 4);
        c.lampMat.color.setRGB(Math.random() < 0.5 ? 5 : 0.5, 0.4, 0.2);
        if (c.charge <= 0) this.discharge(c, ctx);
      } else if (c.cooldown > 0) {
        c.cooldown -= dt;
        // Dim and slowly coming back as it recharges.
        const k = 1 - c.cooldown / COOLDOWN;
        c.glow.base = 0.2 + 0.4 * k;
        if (c.cooldown <= 0) c.glow.base = 1;
      } else {
        c.glow.base = 0.85 + 0.15 * Math.sin(t * 4);
      }
    }

    const p = ctx.player;
    for (const m of this.medkits) {
      if (m.respawn > 0) {
        m.respawn -= dt;
        if (m.respawn <= 0) {
          m.group.visible = true;
          m.glow.base = 0.9;
        }
        continue;
      }
      m.group.children[1].rotation.y = t * 1.6;
      m.group.children[1].position.y = 0.75 + Math.sin(t * 2.2) * 0.06;
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z;
      if (p.alive && p.health < p.maxHealth && dx * dx + dz * dz < 1.3 * 1.3 && Math.abs(p.pos.y - m.pos.y) < 1) {
        p.health = Math.min(p.maxHealth, p.health + MEDKIT_HEAL);
        m.respawn = MEDKIT_RESPAWN;
        m.group.visible = false;
        m.glow.base = 0;
        this.audio.pickup();
        this.fx.sparks(m.pos.clone().setY(m.pos.y + 0.5), new THREE.Vector3(0, 1, 0), 16, new THREE.Color(0.3, 1, 0.5), 3);
      }
    }
  }

  private discharge(c: Cabinet, ctx: EnemyCtx) {
    c.hits = 0;
    c.cooldown = COOLDOWN;
    this.audio.discharge(c.emitter);
    this.fx.add.spawn({ x: c.emitter.x, y: c.emitter.y, z: c.emitter.z, r: 2, g: 3, b: 5, size: 2.2, life: 0.12 });
    const dir = new THREE.Vector3();
    let struck = 0;
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const chest = e.chest.clone();
      if (chest.distanceTo(c.emitter) > RADIUS) continue;
      this.fx.arc(c.emitter, chest);
      dir.subVectors(chest, c.emitter).normalize();
      e.stun = 1.5;
      if (e.takeHit(90, dir, chest, ctx)) this.onKill();
      struck++;
    }
    // A couple of idle arcs to the ground so it reads even with nobody around.
    for (let i = 0; i < 3 - Math.min(2, struck); i++) {
      const g = c.emitter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, -1.2, (Math.random() - 0.5) * 4));
      g.y = c.spot.pos.y + 0.02;
      this.fx.arc(c.emitter, g);
    }
    const pp = ctx.player.pos;
    const d = Math.hypot(pp.x - c.emitter.x, pp.y + 1 - c.emitter.y, pp.z - c.emitter.z);
    if (d < 2.5) {
      this.fx.arc(c.emitter, new THREE.Vector3(pp.x, pp.y + 1, pp.z));
      ctx.damagePlayer(10, c.emitter.clone());
    }
  }

  /** Called when a discharge kills an enemy (wired to the wave kill counter). */
  onKill: () => void = () => {};
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2c018';
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(122, 116);
  g.lineTo(6, 116);
  g.closePath();
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.moveTo(70, 34);
  g.lineTo(46, 80);
  g.lineTo(62, 80);
  g.lineTo(54, 106);
  g.lineTo(82, 62);
  g.lineTo(66, 62);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
