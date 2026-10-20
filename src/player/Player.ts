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
/** Collision height of the body. */
const BODY_H = 1.8;
/** Longest move between two collision resolutions (well under the body radius). */
const MAX_STEP = 0.15;
const _probe = new THREE.Vector3();
const stepStart = new THREE.Vector3();

export class Player {
  /**
   * Collision safeguards (3.3). Switchable only so dev tests can reproduce the 3.2 behaviour
   * (one unsubstepped move per frame, no ceiling stop, landing only after the move) for comparisons.
   */
  static safeguards = { maxStep: MAX_STEP, vertical: true };
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
    // Sub-stepped so no step moves the body more than MAX_STEP: at 20–30 FPS a sprint covers
    // 0.26–0.39 m per frame, enough to cross a thin wall's centre and be pushed out the far side.
    const travel = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
    const steps = Math.min(8, Math.max(1, Math.ceil(travel / Player.safeguards.maxStep)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const headBefore = this.pos.y + BODY_H;
      const feetBefore = this.pos.y;
      stepStart.copy(this.pos);
      this.pos.addScaledVector(this.vel, h);
      // Land within the step: a fast fall must not sink the feet more than a step into a floor box,
      // or the side push below would treat that floor as a wall and throw the body out sideways.
      if (Player.safeguards.vertical && this.vel.y <= 0) {
        const floor = this.col.groundHeightAt(this.pos.x, this.pos.z, this.radius * 0.6, feetBefore);
        if (this.pos.y < floor) {
          this.pos.y = floor;
          this.vel.y = 0;
        }
      }
      // A ceiling stops the rise (jumping under a walkway or in a train); without this the side push
      // treated the underside as a wall and ejected the body sideways, through walls.
      if (Player.safeguards.vertical && this.vel.y > 0) {
        const ceil = this.col.ceilingAbove(this.pos.x, this.pos.z, this.radius, headBefore - 0.05);
        if (this.pos.y + BODY_H > ceil) {
          this.pos.y = ceil - BODY_H;
          this.vel.y = 0;
        }
      }
      // Airborne: railings marked as vaultable can be jumped over.
      const vaulting = !this.onGround;
      this.col.resolveCircle(this.pos, this.radius, BODY_H, 0.3, vaulting);
      // Never wedge into a gap narrower than the body: if the push-out couldn't separate the body from
      // every wall (two walls closer than its width), keep the last position that fitted.
      if (Player.safeguards.vertical) {
        _probe.copy(this.pos);
        this.col.resolveCircle(_probe, this.radius - 0.02, BODY_H, 0.3, vaulting);
        if (Math.abs(_probe.x - this.pos.x) + Math.abs(_probe.z - this.pos.z) > 0.01) {
          // Only fall back to a start that itself fitted (never freeze someone already squeezed).
          _probe.copy(stepStart);
          this.col.resolveCircle(_probe, this.radius - 0.02, BODY_H, 0.3, vaulting);
          if (Math.abs(_probe.x - stepStart.x) + Math.abs(_probe.z - stepStart.z) <= 0.01) {
            this.pos.x = stepStart.x;
            this.pos.z = stepStart.z;
          }
        }
      }
    }
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
