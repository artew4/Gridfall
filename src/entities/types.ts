import type * as THREE from 'three';
import type { Rig } from '../enemies/Models';

/** What a weapon builder fills in: the gun, the part that cycles on each shot, the magazine. */
export interface WeaponBuild {
  gun: THREE.Group;
  /** Slide or bolt carrier: kicked back along +z on every shot. */
  slide: THREE.Group;
  /** Drops out and back during the reload (its rest position is taken from what the builder sets). */
  mag: THREE.Group;
  /** The canvas ammo counter (only some weapons show it). */
  display: THREE.Texture;
}

/**
 * A player weapon: model, handling and feel. The viewmodel mechanics (springs, sway, bob, raise and
 * holster, reload timeline, muzzle flash) are shared; this decides what they look and feel like.
 */
/** 8.1: kinetic rounds (tracers, brass) or energy bolts (plasma). */
export type Ballistic = 'kinetic' | 'energy';

export interface WeaponSpec {
  id: string;
  /** HUD name. */
  name: string;
  jp: string;
  mag: number;
  /** Seconds between rounds while the trigger is held. */
  fireInterval: number;
  reloadTime: number;
  /** Damage per hit before the hitbox multiplier. */
  damage: number;
  /** Base cone (radians) before movement, bloom and air spread. */
  spread: number;
  /** How much each shot widens the cone (bloom, 0..1 scale). */
  bloomPerShot: number;
  /** Viewmodel recoil springs per shot. */
  kick: { z: number; rot: number; rotJitter: number; side: number; slide: number };
  /** Camera per shot: permanent climb, yaw jitter, spring kicks, FOV punch, screen trauma. */
  camera: { climb: number; yaw: number; pitchKick: number; yawKick: number; roll: number; fov: number; trauma: number };
  /** Where the viewmodel rests in camera space. */
  rest: [number, number, number];
  /** Camera-space points: muzzle (tracer start, flash light) and ejection port. */
  muzzle: [number, number, number];
  shell: [number, number, number];
  /** Muzzle flash: HDR colour, card size, and where on the gun (gun space). */
  flash: { color: [number, number, number]; size: number; at: [number, number, number]; light: number };
  /** Tracer colour (linear). */
  tracer: [number, number, number];
  /**
   * 8.1: what it fires. Kinetic (rifle, shotgun): thin fast yellow-orange tracers and brass casings
   * ejected; energy (the Kitsune's plasma): the neon blaster look, no casings.
   */
  ballistic: Ballistic;
  sound: 'plasma' | 'rifle' | 'shotgun';
  /**
   * Several hitscan rays per trigger pull (a shotgun): each pellet gets its own direction inside
   * `spread` (radians, uniform over the disc) around the aimed ray, and its damage falls off from
   * `near` to `far` metres down to `min` of full. Pellets on the same enemy add up into one hit.
   */
  pellets?: { count: number; spread: number; falloff: { near: number; far: number; min: number } };
  /** Manual action after each shot (a pump): the slide group travels back, then forward (seconds, metres). */
  cycle?: { start: number; back: number; forward: number; travel: number };
  /** Tube magazine: loaded one round at a time after `open` seconds, `each` seconds per round; firing interrupts. */
  perRound?: { open: number; each: number };
  /** Emissive strips show the remaining ammo (the Kitsune's look). */
  ammoGlow: boolean;
  build(b: WeaponBuild): void;
}

/**
 * How the survival enemies of a setting look and sound. The rigs share one skeleton (the pivots the
 * animation drives), so behaviour is identical; only geometry, materials, effects and sounds differ.
 */
export interface EnemyLook {
  id: string;
  buildRunner(): Rig;
  buildGunner(): Rig;
  runnerAccent: THREE.Color;
  gunnerAccent: THREE.Color;
  /** Synthetic: sparks, coolant, flickering lights when they die. Organic: dust and blood, no sparks. */
  organic: boolean;
  /** Gunner projectiles: core colour (HDR), trail colour, size. */
  bolt: { core: [number, number, number]; trail: [number, number, number]; size: number };
  /** 8.1: their gunners' rounds: kinetic tracers and casings, or energy bolts (see WeaponSpec). */
  ballistic: Ballistic;
  /** Plasma whine and screech, or rifle crack and shouts. */
  voice: 'synth' | 'human';
}

/** A setting's entities. */
export interface Arsenal {
  weapon: WeaponSpec;
  enemies: EnemyLook;
}
