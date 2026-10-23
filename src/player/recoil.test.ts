import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMORY } from '../entities/weapons/armory';
import { CollisionWorld } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import { Player } from './Player';
import { RISE, Recoil, VIEW_PITCH_MAX, viewBasis, type RecoilProfile } from './Recoil';

const R = (id: 'pistol' | 'smg' | 'ar' | 'shotgun') => ARMORY[id].spec.recoil;
const half = () => 0.5;

/** Hold the trigger for `secs` at the gun's rate (fps frames a second), then let go for `after` s: the offset over time. */
function burst(p: RecoilProfile, interval: number, secs: number, after = 0, fps = 60) {
  const r = new Recoil();
  const dt = 1 / fps;
  let next = 0, peak = 0;
  const trace: number[] = [];
  for (let t = 0; t < secs + after; t += dt) {
    if (t < secs && t >= next) {
      r.fire(p, 1, half);
      next += interval;
    }
    r.update(dt);
    peak = Math.max(peak, r.pitch);
    trace.push(r.pitch);
  }
  return { r, peak, trace, end: r.pitch };
}

describe('39.0: recoil on the aim (Recoil.ts)', () => {
  it('a shot kicks the view up over a few frames, then it comes back at the gun\'s rate', () => {
    const p = R('ar');
    const { trace, peak } = burst(p, 1, 1 / 60, 1);
    // Most of the kick in within 3 × RISE (the way back runs from the first frame), the peak a little under the kick.
    const at = Math.round((3 * RISE) * 60);
    expect(trace[at]).toBeGreaterThan(0.7 * p.kick);
    expect(peak).toBeLessThan(p.kick);
    expect(peak).toBeGreaterThan(0.7 * p.kick);
    // 1/recovery s after the peak about e⁻¹ of it is left (a little more: the last of the kick still feeding in).
    const ip = trace.indexOf(peak);
    const left = trace[ip + Math.round(60 / p.recovery)] / peak;
    expect(left).toBeGreaterThan(0.3);
    expect(left).toBeLessThan(0.45);
    expect(trace[trace.length - 1]).toBeLessThan(0.05 * peak);
  });

  it('the same at 20, 60 and 144 FPS (time-based, not frame-based)', () => {
    const p = R('ar'), iv = ARMORY.ar.spec.fireInterval;
    const ends = [20, 60, 144].map((fps) => burst(p, iv, 1, 0, fps).peak);
    for (const e of ends) expect(e).toBeCloseTo(ends[1], 2);
  });

  it('ADS and crouch scale the kick and the punch; a flinch adds to the aim', () => {
    const a = new Recoil(), b = new Recoil();
    a.fire(R('ar'), 1, half);
    b.fire(R('ar'), 0.45, half);
    for (let i = 0; i < 6; i++) a.update(1 / 60), b.update(1 / 60);
    expect(b.pitch / a.pitch).toBeCloseTo(0.45, 2);
    expect(b.fov / a.fov).toBeCloseTo(0.45, 2);
    const f = new Recoil();
    f.flinch(0.006, 0);
    for (let i = 0; i < 4; i++) f.update(1 / 60);
    expect(f.pitch).toBeGreaterThan(0.5 * 0.006);
  });

  it('the FOV punch is there on the shot\'s own frame, and gone in a few tenths', () => {
    for (const id of ['pistol', 'smg', 'ar', 'shotgun'] as const) {
      const r = new Recoil();
      r.fire(R(id), 1, half);
      expect(r.fov).toBe(R(id).fov);
      for (let t = 0; t < 0.5; t += 1 / 60) r.update(1 / 60);
      expect(r.fov).toBeLessThan(0.05 * R(id).fov);
    }
  });
});

describe('39.0: the four guns\' recoil, distinct', () => {
  const guns = ['pistol', 'smg', 'ar', 'shotgun'] as const;
  const iv = (id: (typeof guns)[number]) => ARMORY[id].spec.fireInterval;
  /** Where the view sits after a 1 s burst (2 s for the pump: three shells) with nobody pulling down. */
  const held = (id: (typeof guns)[number]) => burst(R(id), iv(id), id === 'shotgun' ? 2 : 1).peak;

  it('the pistol: a sharp kick, the fastest way back, the least punch; gone before the next shot', () => {
    const p = R('pistol');
    for (const id of guns) if (id !== 'pistol') {
      expect(p.recovery).toBeGreaterThan(R(id).recovery);
      expect(p.fov).toBeLessThan(R(id).fov);
    }
    expect(p.kick).toBeGreaterThan(R('smg').kick);
    expect(p.kick).toBeGreaterThan(R('ar').kick);
    // 0.16 s on, under 15% of a shot's kick is left.
    expect(Math.exp(-p.recovery * iv('pistol'))).toBeLessThan(0.15);
  });

  it('the SMG: the least kick a shot, the most sideways for its kick, the quickest FOV flutter', () => {
    const s = R('smg');
    for (const id of guns) if (id !== 'smg') {
      expect(s.kick).toBeLessThan(R(id).kick);
      expect(s.yaw / s.kick).toBeGreaterThan(R(id).yaw / R(id).kick);
      expect(s.fovRecovery).toBeGreaterThan(R(id).fovRecovery);
    }
    // The flutter: each round's punch mostly gone before the next (18 a second).
    expect(Math.exp(-s.fovRecovery * iv('smg'))).toBeLessThan(0.25);
  });

  it('the rifle: an even kick, a moderate bounce, a slow way back: a held burst climbs the most of the automatics', () => {
    const a = R('ar');
    for (const id of guns) if (id !== 'ar') expect(a.kickVar).toBeLessThan(R(id).kickVar);
    expect(a.recovery).toBeLessThan(R('pistol').recovery);
    expect(a.recovery).toBeLessThan(R('smg').recovery);
    expect(a.fov).toBeGreaterThan(R('pistol').fov);
    expect(a.fov).toBeGreaterThan(R('smg').fov);
    expect(held('ar')).toBeGreaterThan(held('smg'));
    // Without pulling down, a second's burst sits over 3° up (the target's head to its belt at 20 m is ~2.5°).
    expect(held('ar')).toBeGreaterThan((3 * Math.PI) / 180);
    // Less than half a shot's kick comes back before the next round: they stack.
    expect(Math.exp(-a.recovery * iv('ar'))).toBeGreaterThan(0.5);
  });

  it('the shotgun: the biggest kick and punch of all, the slowest way back', () => {
    const g = R('shotgun');
    for (const id of guns) if (id !== 'shotgun') {
      expect(g.kick).toBeGreaterThan(3 * R(id).kick);
      expect(g.fov).toBeGreaterThan(R(id).fov);
      expect(g.recovery).toBeLessThan(R(id).recovery);
    }
    expect(g.fov).toBeGreaterThanOrEqual(3);
  });

  it('the punches are within +0.5 … +3.5°', () => {
    for (const id of guns) {
      expect(R(id).fov).toBeGreaterThanOrEqual(0.5);
      expect(R(id).fov).toBeLessThanOrEqual(3.5);
    }
  });
});

describe('39.0: the shot goes where the view kicked', () => {
  const player = () => new Player(new CollisionWorld(), { playerHurt() {} } as unknown as AudioEngine);

  it('the camera\'s forward is the shot\'s direction, mid-kick and any way the player faces', () => {
    const cam = new THREE.PerspectiveCamera();
    const pl = player();
    const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    for (const [pitch, yaw] of [[0, 0], [0.4, 1.2], [-0.9, -2.5], [1.45, 3.0]]) {
      pl.pitch = pitch;
      pl.yaw = yaw;
      pl.recoil.reset();
      pl.recoil.fire(R('shotgun'), 1, () => 0.9);
      for (let i = 0; i < 4; i++) pl.recoil.update(1 / 60);
      pl.applyCamera(cam, 3.7, 1 / 60);
      cam.updateMatrixWorld(true);
      viewBasis(pl.viewPitch(3.7), pl.viewYaw(3.7), dir, right, up);
      // (The camera adds its roll, which turns the picture round the same forward.)
      expect(cam.getWorldDirection(new THREE.Vector3()).distanceTo(dir)).toBeLessThan(1e-6);
      expect(pl.viewPitch(3.7)).toBeGreaterThan(Math.min(pitch, 1.45) + 0.0);
      expect(Math.abs(right.dot(dir)) + Math.abs(up.dot(dir))).toBeLessThan(1e-9);
    }
  });

  it('the recoil moves the view, not the look: the mouse\'s pitch is unchanged, and the view returns to it', () => {
    const pl = player();
    pl.pitch = 0.2;
    pl.recoil.fire(R('ar'), 1, half);
    for (let i = 0; i < 5; i++) pl.recoil.update(1 / 60);
    expect(pl.pitch).toBe(0.2);
    expect(pl.viewPitch(0)).toBeGreaterThan(0.2 + 0.5 * R('ar').kick);
    for (let i = 0; i < 180; i++) pl.recoil.update(1 / 60);
    expect(pl.viewPitch(0)).toBeCloseTo(0.2, 4);
  });

  it('never past straight up: held fire looking at the sky stops short of the pole', () => {
    const pl = player();
    pl.pitch = 1.45;
    const cam = new THREE.PerspectiveCamera();
    let most = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      if (Math.floor(t / 0.82) !== Math.floor((t - 1 / 60) / 0.82)) pl.recoil.fire(R('shotgun'), 1, () => 1);
      pl.recoil.update(1 / 60);
      most = Math.max(most, pl.viewPitch(t));
      pl.applyCamera(cam, t, 1 / 60);
      cam.updateMatrixWorld(true);
      // The camera's up still points up (it never rolls over the top).
      expect(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).y).toBeGreaterThan(0);
    }
    expect(most).toBeLessThanOrEqual(VIEW_PITCH_MAX);
    expect(VIEW_PITCH_MAX).toBeLessThan(Math.PI / 2 - 0.05);
    // And down: the same floor.
    pl.pitch = -1.45;
    pl.recoil.reset();
    pl.recoil.flinch(-0.5, 0);
    for (let i = 0; i < 10; i++) pl.recoil.update(1 / 60);
    expect(pl.viewPitch(0)).toBeGreaterThanOrEqual(-VIEW_PITCH_MAX);
  });
});
