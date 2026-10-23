/*
  39.0, recoil the player fights: an aim offset (pitch up, yaw either way) over the look the mouse
  sets, which each shot pushes and time brings back. The camera and the shot read the same offset, so
  where the view kicks is where the next round goes (Player.viewPitch / viewYaw).

  Per shot the kick is not applied at once but fed in over `RISE` s (the view snaps up over a few
  frames, not in one), while the offset decays to 0 at the gun's `recovery` (1/s, exponential). A gun
  that fires faster than it recovers stacks its kicks: the rifle's burst walks up unless the mouse
  pulls it down. The FOV punch is instant and falls back at `fovRecovery`.

  Per frame: a few multiplies and two exps; no allocation.
*/

import { clamp } from '../core/math';

/** A gun's recoil (WeaponSpec.recoil). Angles in radians, rates per second, the punch in degrees. */
export interface RecoilProfile {
  /** Upward kick per shot. */
  kick: number;
  /** ± share of the kick, drawn per shot (no two shots alike). */
  kickVar: number;
  /** ± sideways kick per shot (uniform). */
  yaw: number;
  /** How fast the offset returns to the look (1/s): 1/recovery s to lose 63% of it. */
  recovery: number;
  /** FOV added on the shot (deg) and how fast it falls back (1/s). */
  fov: number;
  fovRecovery: number;
}

/** Seconds over which a shot's kick is fed into the view. */
export const RISE = 0.035;
/**
 * The view never pitches past this (rad, ±; π/2 is straight up): the mouse's own limit (1.45) plus
 * the largest offset a gun can stack still stays clear of the pole, where yaw would flip.
 */
export const VIEW_PITCH_MAX = 1.5;

export class Recoil {
  /** The aim offset (rad) over the mouse's look. */
  pitch = 0;
  yaw = 0;
  /** The FOV punch now (deg). */
  fov = 0;
  /** Kick still to be fed in (rad). */
  private duePitch = 0;
  private dueYaw = 0;
  /** The current gun's rates (set by its last shot; a hit's flinch keeps them). */
  private recovery = 10;
  private fovRecovery = 12;

  /** A shot of gun `p`, its kick scaled by `k` (ADS, crouch). `rand` in [0, 1). */
  fire(p: RecoilProfile, k = 1, rand: () => number = Math.random) {
    this.duePitch += p.kick * (1 + p.kickVar * (rand() * 2 - 1)) * k;
    this.dueYaw += p.yaw * (rand() * 2 - 1) * k;
    this.recovery = p.recovery;
    this.fovRecovery = p.fovRecovery;
    this.fov = Math.max(this.fov, p.fov * k);
  }

  /** A hit's flinch: the aim punched up (and a little sideways), recovered at the current rate. */
  flinch(pitch: number, yaw: number) {
    this.duePitch += pitch;
    this.dueYaw += yaw;
  }

  update(dt: number) {
    if (dt <= 0) return;
    const feed = 1 - Math.exp(-dt / RISE);
    const fp = this.duePitch * feed, fy = this.dueYaw * feed;
    this.duePitch -= fp;
    this.dueYaw -= fy;
    const back = Math.exp(-this.recovery * dt);
    this.pitch = this.pitch * back + fp;
    this.yaw = this.yaw * back + fy;
    this.fov *= Math.exp(-this.fovRecovery * dt);
    // Settled: exact zeros (no denormals creeping along for minutes).
    if (Math.abs(this.pitch) + Math.abs(this.duePitch) < 1e-6) this.pitch = this.duePitch = 0;
    if (Math.abs(this.yaw) + Math.abs(this.dueYaw) < 1e-6) this.yaw = this.dueYaw = 0;
    if (this.fov < 1e-3) this.fov = 0;
  }

  reset() {
    this.pitch = this.yaw = this.fov = this.duePitch = this.dueYaw = 0;
  }
}

/**
 * The camera's forward, right and up for a view (YXZ order, as Player.applyCamera sets it; roll left
 * out: it turns the picture, not the aim). The shot leaves along `dir`.
 */
export function viewBasis(pitch: number, yaw: number, dir: { set(x: number, y: number, z: number): unknown }, right?: { set(x: number, y: number, z: number): unknown }, up?: { set(x: number, y: number, z: number): unknown }) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  dir.set(-sy * cp, sp, -cy * cp);
  right?.set(cy, 0, -sy);
  up?.set(sy * sp, cp, cy * sp);
}

/** The view's pitch for a look `pitch` plus an offset: never past VIEW_PITCH_MAX. */
export const viewPitch = (pitch: number, offset: number) => clamp(pitch + offset, -VIEW_PITCH_MAX, VIEW_PITCH_MAX);
