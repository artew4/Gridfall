import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';
import type { Effects } from '../combat/Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Player } from '../player/Player';
import type { EnemyLook } from '../entities/types';
import { NEON_SYNTHS } from '../entities/enemies/neon';

interface Bolt {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  whizzed: boolean;
  active: boolean;
}

/**
 * Slow, visible gunner rounds: readable and dodgeable, which keeps the gunners fair. They look like
 * the setting's weapons (plasma bolts, or rifle tracers) but fly and hit the same.
 */
export class Projectiles {
  private bolts: Bolt[] = [];
  private tmp = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private hitTmp: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };
  onPlayerHit: (dmg: number, from: THREE.Vector3) => void = () => {};
  /** A round passed close to him without hitting. */
  onWhiz: () => void = () => {};
  light: THREE.PointLight;
  private mat: THREE.MeshBasicMaterial;
  private look: EnemyLook = NEON_SYNTHS;

  constructor(scene: THREE.Scene, private col: CollisionWorld, private fx: Effects, private audio: AudioEngine, look: EnemyLook = NEON_SYNTHS) {
    const geo = new THREE.SphereGeometry(0.06, 8, 6);
    geo.scale(1, 1, 4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3, 0.6) });
    this.mat = mat;
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, whizzed: false, active: false });
    }
    this.light = new THREE.PointLight(0xffa040, 0, 9, 2);
    scene.add(this.light);
    this.setLook(look);
  }

  setLook(look: EnemyLook) {
    this.look = look;
    this.mat.color.setRGB(...look.bolt.core);
    for (const b of this.bolts) b.mesh.scale.setScalar(look.bolt.size);
  }

  fire(from: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    const b = this.bolts.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.pos.copy(from);
    b.vel.copy(dir).multiplyScalar(speed);
    b.life = 3;
    b.whizzed = false;
    b.mesh.visible = true;
    b.mesh.position.copy(from);
    b.mesh.lookAt(this.tmp.copy(from).add(dir));
  }

  clear() {
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
  }

  update(dt: number, player: Player) {
    let lightAt: THREE.Vector3 | null = null;
    const chest = this.tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      this.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      const step = b.vel.length() * dt;
      // Trail.
      const tr = this.look.bolt.trail;
      this.fx.add.spawn({ x: b.pos.x, y: b.pos.y, z: b.pos.z, r: tr[0], g: tr[1], b: tr[2], size: 0.09 * this.look.bolt.size, life: 0.18, grow: -0.3 });

      // Player hit: closest approach of this step's segment to the chest axis.
      const seg = new THREE.Vector3().subVectors(b.pos, this.prev);
      const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(chest, this.prev).dot(seg) / Math.max(seg.lengthSq(), 1e-6)));
      const closest = this.prev.clone().addScaledVector(seg, t);
      const dxz = Math.hypot(closest.x - chest.x, closest.z - chest.z);
      const dy = Math.abs(closest.y - chest.y);
      if (player.alive && dxz < 0.45 && dy < 0.75) {
        this.onPlayerHit(10, this.prev.clone());
        this.fx.sparks(closest, seg.clone().normalize().negate(), 10, new THREE.Color(1, 0.6, 0.2), 4);
        this.deactivate(b);
        continue;
      }
      if (!b.whizzed && closest.distanceTo(chest) < 2.2) {
        b.whizzed = true;
        this.audio.plasmaWhiz(closest, this.look.voice);
        this.onWhiz();
      }
      const dir = seg.normalize();
      const hit = this.col.raycast(this.prev, dir, step, this.hitTmp);
      if (hit || b.life <= 0) {
        if (hit) {
          if (this.look.organic) {
            // A bullet: an ordinary impact on whatever it struck.
            this.fx.impact(hit.point, hit.normal, hit.surface);
            this.audio.hitSurface(hit.point, hit.surface);
          } else {
            this.fx.sparks(hit.point, hit.normal, 12, new THREE.Color(1, 0.55, 0.15), 5);
            this.fx.add.spawn({ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 4, g: 2, b: 0.5, size: 0.6, life: 0.1 });
            this.audio.plasmaImpact(hit.point);
          }
        }
        this.deactivate(b);
        continue;
      }
      if (!lightAt || b.pos.distanceToSquared(chest) < lightAt.distanceToSquared(chest)) lightAt = b.pos;
    }
    if (lightAt) {
      this.light.position.copy(lightAt);
      this.light.intensity = this.look.organic ? 2 : 6;
    } else this.light.intensity = 0;
  }

  private deactivate(b: Bolt) {
    b.active = false;
    b.mesh.visible = false;
  }
}
