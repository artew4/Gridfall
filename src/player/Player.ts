import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { CollisionWorld } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp, lerp, Spring } from '../core/math';
import { KEYS } from '../core/Bindings';
import { SLIDE, slideStep } from './Slide';
import { Stamina } from '../combat/Stamina';
import { Recoil, viewPitch } from './Recoil';
import type { GunHandling } from '../entities/types';
import { findLedge, findWindow, MANTLE, mantlePos, mantleStats, mantleTime, WINDOW } from './Mantle';

const WALK = 5.0;
const SPRINT = 7.8;
const JUMP_V = 4.8;
const GRAVITY = 15;
const EYE = 1.65;
const SENS = 0.0022;
/** Collision height of the body, standing and crouched (11.0). */
export const BODY_H = 1.8;
export const CROUCH_H = 1.2;
/** Eye height crouched (standing: EYE). */
const CROUCH_EYE = 1.08;
/**
 * 11.0 handling. Speed multipliers (they stack: crouched and aiming is 0.55 × 0.62), and how long the
 * sights take to come up and go down (s): the ADS blend runs linearly over that time and is eased
 * with a smoothstep, so it is frame-rate independent and lands exactly, with no asymptotic tail.
 */
export const HANDLING = { crouchSpeed: 0.55, adsSpeed: 0.62, adsIn: 0.2, adsOut: 0.16, crouchRate: 12, crouchStepVol: 0.35, adsSens: 0.7 };
/** 21.0: the handling of no gun in particular (the 11.0 globals): what the player has until one is set. */
export const BASE_GUN: GunHandling = { move: 1, adsMove: HANDLING.adsSpeed, adsIn: HANDLING.adsIn, adsOut: HANDLING.adsOut, raise: 10 };
/** A tap of the crouch key toggles; held longer than this, it crouches only while held. */
const CROUCH_TAP = 0.25;
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
  /**
   * 36.0: feet and trigger held (TDM's pre-match countdown): no walking, sprinting, sliding or
   * jumping (Game holds the trigger); he still looks round, crouches, aims and picks his gun.
   */
  held = false;
  /** 11.0: 0 standing … 1 crouched (smoothed), and the collision height it gives. */
  crouch = 0;
  height = BODY_H;
  private crouchToggle = false;
  private crouchHeld = 0;
  /** 11.0: aim down sights. `aimWant` is set by the game each frame (RMB, weapon ready); `adsT` runs 0..1 linearly, `ads` is it eased. */
  aimWant = false;
  adsT = 0;
  /** 21.0: the handling of the gun in hand (Game sets it with the weapon). */
  gun: GunHandling = BASE_GUN;
  /** 30.0: the sprint's pool; its profile is the gun's weight class (Game sets it with the weapon). */
  stamina = new Stamina();
  ads = 0;
  /**
   * 12.0, the sprint slide (Slide.ts): crouch pressed while sprinting. `slideV` is the speed left,
   * `slideDir` the direction (x, z), `slideK` 0..1 its smoothed strength for the camera.
   */
  sliding = false;
  slideT = 0;
  slideV = 0;
  slideDir = new THREE.Vector2();
  slideK = 0;
  private slideCd = 0;
  lastDamage = -100;
  /**
   * 39.0: the recoil the shots and hits put on the aim (pitch, yaw) and the FOV punch: the camera and
   * the shot both read it (viewPitch / viewYaw). Was a permanent climb on `pitch` plus camera-only
   * springs a shot saw a frame late.
   */
  recoil = new Recoil();
  /** Roll from shots and hits: seen only (a roll doesn't move the aim). */
  kickRoll = new Spring(90, 10);
  landDip = new Spring(160, 14);
  trauma = 0;
  private sprintFov = 0;
  private lastStepIdx = 0;
  private wasOnGround = true;
  private fallSpeed = 0;
  private peakY = 0;
  /** World-space direction of the last hit, for the HUD indicator. */
  lastHitFrom = new THREE.Vector3();
  /**
   * 43.0, the ledge grab (Mantle.ts): `mantleT` s into the pull-up (-1: none), `mantleDur` long, from
   * `mantleFrom` to `mantleTo`; `mantleK` 0…1…0 over it for the view. `mantleOk`: the level's say on
   * a spot (Game: its extent).
   */
  mantleT = -1;
  mantleDur = 0;
  mantleK = 0;
  mantleOk: ((p: THREE.Vector3) => boolean) | undefined;
  private mantleFrom = new THREE.Vector3();
  private mantleTo = new THREE.Vector3();
  private mantleExit = 0;
  /** The room over the ledge: he rises into it already crouched as low as it needs. */
  private mantleRoom = BODY_H;
  private mantleSide = 1;
  private mantleCd = 0;
  /** 57.0: this one goes through a window (ends in the air); the eyes kept under its lintel meanwhile. */
  private mantleAir = false;
  private mantleCap = Infinity;

  constructor(private col: CollisionWorld, private audio: AudioEngine) {}

  reset(x: number, z: number, yaw: number, y = 0) {
    this.pos.set(x, y, z);
    this.peakY = y;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    // 36.0: the eyes at his feet's height from the first frame (EYE alone put them at 1.65 m over the
    // world's zero, and on a raised spawn the camera rose to them over the next frames).
    this.eyeY = y + EYE;
    this.crouch = 0;
    this.height = BODY_H;
    this.crouchToggle = false;
    this.crouchHeld = 0;
    this.aimWant = false;
    this.adsT = this.ads = 0;
    this.sliding = false;
    this.slideT = this.slideV = this.slideK = this.slideCd = 0;
    this.stamina.reset();
    this.trauma = 0;
    this.recoil.reset();
    this.kickRoll.reset();
    this.mantleT = -1;
    this.mantleK = this.mantleCd = 0;
  }

  /** 43.0: pulling himself up onto a ledge (no gravity, no WASD, no trigger). */
  get mantling() {
    return this.mantleT >= 0;
  }

  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Body sample heights scale with this (perception rays, hit volumes): 1 standing. */
  get heightScale() {
    return this.height / BODY_H;
  }

  /** Eye height above the feet now (standing EYE, crouched CROUCH_EYE). */
  get eyeHeight() {
    return lerp(EYE, CROUCH_EYE, this.crouch);
  }

  update(dt: number, input: Input, controls: boolean, time: number) {
    // ADS: a linear clock eased with a smoothstep (see HANDLING). Sprinting or dying drops the sights.
    const aim = this.aimWant && controls && this.alive;
    const legs = controls && !this.held;
    this.adsT = clamp(this.adsT + (aim ? dt / this.gun.adsIn : -dt / this.gun.adsOut), 0, 1);
    this.ads = this.adsT * this.adsT * (3 - 2 * this.adsT);
    if (controls) {
      // Slower look while aiming: the zoom narrows the view, so the same hand movement stays as precise.
      const sens = SENS * lerp(1, HANDLING.adsSens, this.ads);
      this.yaw -= input.mouseDX * sens;
      this.pitch = clamp(this.pitch - input.mouseDY * sens, -1.45, 1.45);
    }
    // 12.0: crouch pressed mid-sprint is a slide (read before the crouch key toggles below; `sprinting`
    // is still last frame's). The press also sets the crouch, so the slide ends in a crouch.
    this.slideCd = Math.max(0, this.slideCd - dt);
    const hs0 = Math.hypot(this.vel.x, this.vel.z);
    // 30.0: only out of an active sprint (it was sprinting last frame), and it costs stamina.
    if (legs && this.alive && !this.sliding && this.sprinting && this.onGround && this.slideCd <= 0 && input.pressed.has(KEYS.crouch) && hs0 >= SPRINT * SLIDE.minEntry && this.stamina.slide()) {
      this.startSlide(hs0);
    }
    this.updateCrouch(dt, input, controls);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let wx = 0;
    let wz = 0;
    if (legs && this.alive) {
      if (input.key('KeyW')) { wx += fx; wz += fz; }
      if (input.key('KeyS')) { wx -= fx; wz -= fz; }
      if (input.key('KeyD')) { wx -= fz; wz += fx; }
      if (input.key('KeyA')) { wx += fz; wz -= fx; }
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.sprinting = legs && (input.key('ShiftLeft') || input.key('ShiftRight'));
    this.sprinting = this.sprinting && wl > 0 && input.key('KeyW') && !aim && !this.sliding;
    // 30.0: no breath, no sprint (run dry, it walks until the pool is back to STAMINA.resume).
    if (!this.stamina.canSprint || this.mantling) this.sprinting = false;
    // Sprinting stands you up (if there's room); crouched or aiming you can't sprint.
    if (this.sprinting && this.crouch > 0.05) {
      this.crouchToggle = false;
      if (this.crouchWanted(input) || this.roomAbove() < BODY_H) this.sprinting = false;
    }
    if (this.sliding) this.steerSlide(dt, wx, wz, wl);
    else {
      // 21.0: the gun in hand sets the pace (a pistol carries faster than a shotgun) and what aiming costs.
      const speed = (this.sprinting ? SPRINT : WALK) * this.gun.move * lerp(1, HANDLING.crouchSpeed, this.crouch) * lerp(1, this.gun.adsMove, this.ads);
      const accel = this.onGround ? 16 : 3;
      this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
    }
    {
      // 30.0: the pool: drained by the sprint, refilled walking (faster standing or crouched).
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.stamina.step(dt, this.sprinting && hs > WALK * 0.8, hs < 0.5 || this.crouch > 0.5);
    }
    const x0 = this.pos.x, z0 = this.pos.z;

    // 43.0: the pull-up runs on its own clock; otherwise the body moves, and in the air (W held, near the
    // apex or falling) it may grab a ledge. On the ground nothing is cast.
    this.mantleCd = Math.max(0, this.mantleCd - dt);
    if (this.mantling) this.stepMantle(dt);
    else {
      this.move(dt, input, legs, time);
      if (MANTLE.on && legs && this.alive && !this.onGround && !this.sliding && this.mantleCd <= 0 && input.key('KeyW') && this.vel.y < MANTLE.apexVy && this.vel.y > -MANTLE.maxFall) this.tryMantle();
    }

    if (this.sliding) {
      // A wall eats the momentum: the slide keeps only the speed it actually made.
      const made = Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt;
      if (made < this.slideV * 0.6) this.slideV = made;
      if (this.slideV <= WALK * HANDLING.crouchSpeed || this.slideT >= SLIDE.maxT || !this.onGround || !this.alive || !controls) this.endSlide();
    }
    this.slideK = damp(this.slideK, this.sliding ? Math.min(1, this.slideV / SPRINT) : 0, 10, dt);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    // Sliding: no steps, and the gun reads it as moving (but not as a run).
    this.moveAmount = this.sliding ? Math.min(1, hs / WALK) * 0.6 : clamp(hs / WALK, 0, 1.6);
    if (this.onGround && hs > 0.5 && !this.sliding) {
      this.bobPhase += hs * dt * 1.75;
      const idx = Math.floor(this.bobPhase / Math.PI);
      if (idx !== this.lastStepIdx) {
        this.lastStepIdx = idx;
        // Crouched steps are quiet (11.0).
        this.audio.footstep((this.sprinting ? 1 : 0.7) * lerp(1, HANDLING.crouchStepVol, this.crouch));
      }
    }

    // Slow regen after a quiet period.
    if (this.alive && time - this.lastDamage > 5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 5 * dt);
    }

    this.recoil.update(dt);
    this.kickRoll.update(dt);
    this.landDip.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.eyeY = damp(this.eyeY, this.pos.y + this.eyeHeight, 18, dt);
    // 57.0: diving through a window, the eyes pass under its lintel.
    if (this.mantling && this.eyeY > this.mantleCap) this.eyeY = this.mantleCap;
  }

  /** The body's step: the jump, gravity, the sub-stepped collision, the landing. */
  private move(dt: number, input: Input, legs: boolean, time: number) {
    // A jump out of a slide keeps its momentum and stands up in the air.
    if (legs && this.alive && this.onGround && input.pressed.has('Space') && this.sliding) {
      this.endSlide();
      this.crouchToggle = false;
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.audio.footstep(0.6);
    } else if (legs && this.alive && this.onGround && input.pressed.has('Space') && this.crouch > 0.3) {
      // Space while crouched stands up instead of jumping (as long as there's room).
      this.crouchToggle = false;
    } else if (legs && this.alive && this.onGround && input.pressed.has('Space')) {
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
      const headBefore = this.pos.y + this.height;
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
        if (this.pos.y + this.height > ceil) {
          this.pos.y = ceil - this.height;
          this.vel.y = 0;
        }
      }
      // Airborne: railings marked as vaultable can be jumped over.
      const vaulting = !this.onGround;
      this.col.resolveCircle(this.pos, this.radius, this.height, 0.3, vaulting);
      // Never wedge into a gap narrower than the body: if the push-out couldn't separate the body from
      // every wall (two walls closer than its width), keep the last position that fitted.
      if (Player.safeguards.vertical) {
        _probe.copy(this.pos);
        this.col.resolveCircle(_probe, this.radius - 0.02, this.height, 0.3, vaulting);
        if (Math.abs(_probe.x - this.pos.x) + Math.abs(_probe.z - this.pos.z) > 0.01) {
          // Only fall back to a start that itself fitted (never freeze someone already squeezed).
          _probe.copy(stepStart);
          this.col.resolveCircle(_probe, this.radius - 0.02, this.height, 0.3, vaulting);
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
  }

  /** 43.0: a ledge ahead (Mantle.findLedge)? Then the pull-up starts. */
  private tryMantle() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // 57.0: a ledge to pull up onto, else a window to dive through.
    const l = findLedge(this.col, this.pos, fx, fz, this.radius, CROUCH_H, this.mantleOk) ?? findWindow(this.col, this.pos, fx, fz, this.radius, this.mantleOk);
    if (!l) return;
    mantleStats.grabs++;
    if (l.air) mantleStats.windows++;
    this.mantleAir = !!l.air;
    this.mantleCap = l.cap ?? Infinity;
    this.mantleFrom.copy(this.pos);
    this.mantleTo.copy(l.to);
    this.mantleDur = l.air ? WINDOW.time : mantleTime(l.rise);
    this.mantleRoom = Math.min(BODY_H, l.room);
    this.mantleT = 0;
    // Out onto the ledge at least at `exit` (a sprint's jump keeps most of its pace).
    this.mantleExit = Math.max(MANTLE.exit, Math.hypot(this.vel.x, this.vel.z) * 0.8);
    this.mantleSide = Math.random() < 0.5 ? -1 : 1;
    this.sprinting = false;
    this.audio.footstep(0.9);
  }

  /** 43.0: the pull-up (Mantle.mantlePos): up, then over the lip; he lands on it moving forward. */
  private stepMantle(dt: number) {
    if (!this.alive) {
      this.mantleT = -1;
      this.mantleK = 0;
      return;
    }
    const x = this.pos.x, y = this.pos.y, z = this.pos.z;
    this.mantleT += dt;
    mantlePos(this.mantleFrom, this.mantleTo, this.mantleT, this.mantleDur, this.pos, this.mantleAir);
    this.mantleK = Math.sin(Math.PI * Math.min(1, this.mantleT / this.mantleDur));
    if (this.mantleT < this.mantleDur) {
      // The real motion (what a bot leads its shot by).
      if (dt > 0) this.vel.set((this.pos.x - x) / dt, (this.pos.y - y) / dt, (this.pos.z - z) / dt);
      return;
    }
    this.pos.copy(this.mantleTo);
    this.mantleT = -1;
    this.mantleK = 0;
    this.mantleCd = MANTLE.cooldown;
    const dx = this.mantleTo.x - this.mantleFrom.x, dz = this.mantleTo.z - this.mantleFrom.z, d = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / d) * this.mantleExit, 0, (dz / d) * this.mantleExit);
    // 57.0: through a window he comes out in the air, and falls from there.
    this.mantleCap = Infinity;
    if (this.mantleAir) {
      this.onGround = this.wasOnGround = false;
      this.peakY = this.pos.y;
      this.fallSpeed = 0;
      this.audio.footstep(0.6);
      return;
    }
    this.onGround = this.wasOnGround = true;
    this.peakY = this.pos.y;
    this.fallSpeed = 0;
    this.landDip.impulse(-0.5);
    this.audio.footstep(0.8);
  }

  private startSlide(speed: number) {
    this.sliding = true;
    this.slideT = 0;
    this.slideV = speed * SLIDE.boost;
    this.slideDir.set(this.vel.x, this.vel.z).normalize();
    this.audio.slide(1);
  }

  private endSlide() {
    this.sliding = false;
    this.slideCd = SLIDE.cooldown;
  }

  /** Friction slows the slide (exactly, Slide.ts); the movement keys turn it a little. */
  private steerSlide(dt: number, wx: number, wz: number, wl: number) {
    this.slideT += dt;
    if (wl > 0) {
      const cur = Math.atan2(this.slideDir.x, this.slideDir.y);
      const d = Math.atan2(Math.sin(Math.atan2(wx, wz) - cur), Math.cos(Math.atan2(wx, wz) - cur));
      // Only towards a direction ahead of it (S doesn't spin the slide round).
      if (Math.abs(d) < Math.PI * 0.6) {
        const a = cur + clamp(d, -SLIDE.steer * dt, SLIDE.steer * dt);
        this.slideDir.set(Math.sin(a), Math.cos(a));
      }
    }
    this.slideV = slideStep(this.slideV, dt);
    this.vel.x = this.slideDir.x * this.slideV;
    this.vel.z = this.slideDir.y * this.slideV;
  }

  /** The crouch key: a tap toggles, a hold crouches until it's let go (see CROUCH_TAP). */
  private crouchWanted(input: Input) {
    return this.crouchToggle || input.key(KEYS.crouch);
  }

  /** Free height over the body now (a low ceiling keeps it down): up to standing. */
  private roomAbove() {
    return Math.min(BODY_H, this.col.ceilingAbove(this.pos.x, this.pos.z, this.radius, this.pos.y + this.height - 0.05) - this.pos.y - 0.02);
  }

  private updateCrouch(dt: number, input: Input, controls: boolean) {
    if (controls && this.alive) {
      if (input.pressed.has(KEYS.crouch)) {
        this.crouchToggle = !this.crouchToggle;
        this.crouchHeld = 0;
      }
      if (input.key(KEYS.crouch)) this.crouchHeld += dt;
      else {
        if (this.crouchHeld > CROUCH_TAP) this.crouchToggle = false;
        this.crouchHeld = 0;
      }
    } else if (!this.alive) this.crouchToggle = false;
    const want = this.sliding || (controls && this.alive && this.crouchWanted(input)) ? 1 : 0;
    // Standing up needs the room: under a low ceiling it rises only as far as that allows (43.0: in a
    // pull-up, the room over the ledge he is rising onto).
    const room = this.mantling ? this.mantleRoom : this.roomAbove();
    const most = clamp((BODY_H - room) / (BODY_H - CROUCH_H), 0, 1);
    const target = Math.max(want, most);
    // Going down is immediate in height terms (never taller than the room), the rest is smoothed.
    this.crouch = Math.max(damp(this.crouch, target, HANDLING.crouchRate, dt), most);
    this.height = lerp(BODY_H, CROUCH_H, this.crouch);
    // 57.0: diving through a window the body is folded into the opening (under its lintel).
    if (this.mantling && this.mantleAir) this.height = Math.min(this.height, this.mantleRoom - 0.04);
  }

  damage(amount: number, from: THREE.Vector3, time: number) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamage = time;
    this.lastHitFrom.copy(from);
    this.trauma = Math.min(1, this.trauma + 0.45);
    this.kickRoll.impulse((Math.random() - 0.5) * 1.2);
    // 39.0: a hit flinches the aim a little (up, either side), recovered as the gun's kick is.
    this.recoil.flinch(0.006, (Math.random() - 0.5) * 0.006);
    this.audio.playerHurt();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  /** 39.0: the screen shake's share of the view (rad): trauma squared, two noisy sines. */
  private shake(time: number, f: number, o: number) {
    return Math.sin(time * f + o) * Math.sin(time * f * 0.71 + o * 2.3) * 0.03 * this.trauma * this.trauma;
  }

  /**
   * 39.0: where the eyes and the gun point: the mouse's look, the recoil on it, the screen shake.
   * The camera is set from these and the shot leaves along them (Game.shoot), the same frame.
   */
  viewPitch(time: number) {
    // 43.0: the pull-up dips the view (no shot leaves during it).
    return viewPitch(this.pitch + this.shake(time, 29, 3) - MANTLE.dip * this.mantleK, this.recoil.pitch);
  }
  viewYaw(time: number) {
    return this.yaw + this.recoil.yaw + this.shake(time, 31, 4);
  }

  /** Hip-fire field of view (deg); ADS narrows it by the weapon's zoom. */
  static FOV = 74;

  applyCamera(cam: THREE.PerspectiveCamera, time: number, dt = 1 / 60, adsZoom = 1) {
    // Aiming steadies the head: bob and shake fade with the sights up.
    const steady = 1 - 0.8 * this.ads;
    const bobAmt = (this.onGround ? Math.min(this.moveAmount, 1.4) : 0) * steady * (1 - this.slideK);
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
      this.viewPitch(time),
      this.viewYaw(time),
      this.kickRoll.value * 0.05 + Math.cos(this.bobPhase) * 0.006 * bobAmt + sh(23, 5) * 0.04 * t2 + this.slideK * SLIDE.roll + this.mantleK * MANTLE.roll * this.mantleSide,
    );
    // ADS: the FOV follows the eased blend directly (no second smoothing on top, so no lag behind the
    // gun); sprint and punch are added and damped with the real frame time (3.x used a fixed 1/60 s).
    const zoomed = Player.FOV * lerp(1, adsZoom, this.ads);
    this.sprintFov = damp(this.sprintFov, (this.sprinting ? 6 : 0) + this.slideK * SLIDE.fov, 8, dt);
    // 39.0: the shot's punch on top at once (it was eased in through the sprint's smoothing).
    cam.fov = zoomed + this.sprintFov + this.recoil.fov;
    cam.updateProjectionMatrix();
  }
}
