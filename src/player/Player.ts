import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { CollisionWorld } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp, Spring } from '../core/math';

const WALK = 5.0;
const SPRINT = 7.8;
const JUMP_V = 4.8;
const GRAVITY = 15;
const EYE = 1.65;
const SENS = 0.0022;

export class Player {
  pos = new THREE.Vector3(0, 0, 10);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  radius = 0.35;
  health = 100;
  maxHealth = 100;
  alive = true;
  sprinting = false;
  moveAmount = 0; // 0..1 horizontal speed fraction
  bobPhase = 0;
  eyeY = EYE;
  lastDamage = -100;
  /** Camera kick from weapon recoil and hits. */
  kickPitch = new Spring(120, 16);
  kickYaw = new Spring(120, 16);
  kickRoll = new Spring(90, 10);
  landDip = new Spring(160, 14);
  trauma = 0;
  fovPunch = 0;
  private lastStepIdx = 0;
  private wasOnGround = true;
  private fallSpeed = 0;
  private peakY = 0;
  /** World-space direction of the last hit, for the HUD indicator. */
  lastHitFrom = new THREE.Vector3();

  constructor(private col: CollisionWorld, private audio: AudioEngine) {}

  reset(x: number, z: number, yaw: number, y = 0) {
    this.pos.set(x, y, z);
    this.peakY = y;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.eyeY = EYE;
    this.trauma = 0;
    this.kickPitch.reset();
    this.kickYaw.reset();
    this.kickRoll.reset();
  }

  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt: number, input: Input, controls: boolean, time: number) {
    if (controls) {
      this.yaw -= input.mouseDX * SENS;
      this.pitch = clamp(this.pitch - input.mouseDY * SENS, -1.45, 1.45);
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let wx = 0;
    let wz = 0;
    if (controls && this.alive) {
      if (input.key('KeyW')) { wx += fx; wz += fz; }
      if (input.key('KeyS')) { wx -= fx; wz -= fz; }
      if (input.key('KeyD')) { wx -= fz; wz += fx; }
      if (input.key('KeyA')) { wx += fz; wz -= fx; }
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.sprinting = controls && (input.key('ShiftLeft') || input.key('ShiftRight'));
    this.sprinting = this.sprinting && wl > 0 && input.key('KeyW');
    const speed = this.sprinting ? SPRINT : WALK;
    const accel = this.onGround ? 16 : 3;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);

    if (controls && this.alive && this.onGround && input.pressed.has('Space')) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.audio.footstep(0.6);
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);

    // Airborne: railings marked as vaultable can be jumped over.
    this.col.resolveCircle(this.pos, this.radius, 1.8, 0.3, !this.onGround);
    const ground = this.col.groundHeightAt(this.pos.x, this.pos.z, this.radius * 0.6, this.pos.y);
    if (!this.onGround && this.pos.y > this.peakY) this.peakY = this.pos.y;
    // Stick to stairs and kerbs when walking down instead of briefly going airborne.
    if (this.wasOnGround && this.vel.y <= 0 && this.pos.y > ground && this.pos.y - ground < 0.35) this.pos.y = ground;
    if (this.pos.y <= ground) {
      if (!this.wasOnGround && this.fallSpeed > 3) {
        this.landDip.impulse(-Math.min(this.fallSpeed, 8) * 0.25);
        this.audio.land();
        // Only genuinely long falls hurt (none of the district's drops do; high parapets guard the rest).
        const drop = this.peakY - ground;
        if (drop > 10) this.damage((drop - 10) * 12, this.pos.clone().setY(this.pos.y - 1), time);
      }
      this.peakY = ground;
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }
    this.fallSpeed = -this.vel.y;
    this.wasOnGround = this.onGround;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moveAmount = clamp(hs / WALK, 0, 1.6);
    if (this.onGround && hs > 0.5) {
      this.bobPhase += hs * dt * 1.75;
      const idx = Math.floor(this.bobPhase / Math.PI);
      if (idx !== this.lastStepIdx) {
        this.lastStepIdx = idx;
        this.audio.footstep(this.sprinting ? 1 : 0.7);
      }
    }

    // Slow regen after a quiet period.
    if (this.alive && time - this.lastDamage > 5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 5 * dt);
    }

    this.kickPitch.update(dt);
    this.kickYaw.update(dt);
    this.kickRoll.update(dt);
    this.landDip.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.fovPunch = damp(this.fovPunch, 0, 10, dt);
    this.eyeY = damp(this.eyeY, this.pos.y + EYE, 18, dt);
  }

  damage(amount: number, from: THREE.Vector3, time: number) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamage = time;
    this.lastHitFrom.copy(from);
    this.trauma = Math.min(1, this.trauma + 0.45);
    this.kickRoll.impulse((Math.random() - 0.5) * 1.2);
    this.kickPitch.impulse(0.6);
    this.audio.playerHurt();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  applyCamera(cam: THREE.PerspectiveCamera, time: number) {
    const bobAmt = this.onGround ? Math.min(this.moveAmount, 1.4) : 0;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.025 * bobAmt;
    const t2 = this.trauma * this.trauma;
    const sh = (f: number, o: number) => Math.sin(time * f + o) * Math.sin(time * f * 0.71 + o * 2.3);
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX + sh(37, 1) * 0.05 * t2,
      this.eyeY + bobY - 0.03 * bobAmt + this.landDip.value * 0.25 + sh(41, 2) * 0.05 * t2,
      this.pos.z - Math.sin(this.yaw) * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + this.kickPitch.value * 0.05 + sh(29, 3) * 0.03 * t2,
      this.yaw + this.kickYaw.value * 0.05 + sh(31, 4) * 0.03 * t2,
      this.kickRoll.value * 0.05 + Math.cos(this.bobPhase) * 0.006 * bobAmt + sh(23, 5) * 0.04 * t2,
    );
    const targetFov = 74 + (this.sprinting ? 6 : 0) + this.fovPunch;
    cam.fov = damp(cam.fov, targetFov, 8, 1 / 60);
    cam.updateProjectionMatrix();
  }
}
