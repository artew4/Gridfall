import type { RecoilProfile } from '../player/Recoil';
import type * as THREE from 'three';
import type { Rig } from '../enemies/Models';
import type { GunMats } from './weapons/theme';

/** What a weapon builder fills in: the gun, the part that cycles on each shot, the magazine. */
export interface WeaponBuild {
  gun: THREE.Group;
  /** Slide or bolt carrier: kicked back along +z on every shot. */
  slide: THREE.Group;
  /** Drops out and back during the reload (its rest position is taken from what the builder sets). */
  mag: THREE.Group;
  /** The canvas ammo counter (only some weapons show it). */
  display: THREE.Texture;
  /** 21.0: the materials by role, in the map's weapon theme (theme.ts). */
  mats: GunMats;
}

/**
 * 21.0, how a gun handles in the player's hands (the asymmetric balance; see armory.ts). Multipliers
 * of the 11.0 handling: `move` on every speed while it is held, `adsMove` while aiming (the 11.0
 * global was 0.62), the sights' times (s), how fast it comes up after a swap or a holster (the
 * raise's damping rate; 10 before 21.0).
 */
export interface GunHandling {
  move: number;
  adsMove: number;
  adsIn: number;
  adsOut: number;
  raise: number;
}

/**
 * A player weapon: model, handling and feel. The viewmodel mechanics (springs, sway, bob, raise and
 * holster, reload timeline, muzzle flash) are shared; this decides what they look and feel like.
 */
/**
 * 8.1: kinetic rounds (tracers, brass); 8.1-45.0 also energy bolts (plasma). 46.0: every round is a
 * firearm's, the player's and every bot's (the playtest: no laser guns).
 */
export type Ballistic = 'kinetic';
/** 21.0: the report: the pistol's crack, the SMG's buzz, the rifle, the shotgun (46.0: no plasma). */
export type GunSound = 'pistol' | 'smg' | 'rifle' | 'shotgun';

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
  /**
   * 39.0, the recoil on the aim per shot (player/Recoil.ts): the kick up and its spread, the kick
   * sideways, how fast the view comes back, the FOV punch and how fast it fades.
   */
  recoil: RecoilProfile;
  /** Camera per shot, seen only: roll and screen trauma (39.0: the climb, the kicks and the punch are `recoil`). */
  camera: { roll: number; trauma: number };
  /** Where the viewmodel rests in camera space. */
  rest: [number, number, number];
  /**
   * 11.0, aim down sights. `sight`: the gun-space point the eye looks through (the rear notch and
   * front post line, the bead, the reflex dot). With the sights up the viewmodel root sits at
   * (−sight.x, −sight.y, z) and unrotated, which puts that point on the camera's axis: the screen
   * centre, where rounds go. `zoom`: the world FOV factor (0.72 = 28% narrower).
   */
  ads: { sight: [number, number, number]; z: number; zoom: number };
  /** Camera-space points: muzzle (tracer start, flash light) and ejection port. */
  muzzle: [number, number, number];
  shell: [number, number, number];
  /** Muzzle flash: HDR colour, card size, and where on the gun (gun space). */
  flash: { color: [number, number, number]; size: number; at: [number, number, number]; light: number };
  /** Tracer colour (linear). */
  tracer: [number, number, number];
  /**
   * 8.1: what it fires: thin fast yellow-orange tracers and brass casings ejected (46.0: every gun).
   */
  ballistic: Ballistic;
  sound: GunSound;
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
  /** 21.0: handling (move speed held and aiming, the sights' times, the swap). */
  handling: GunHandling;
  /** 21.0: hip-fire cone multiplier (×, on the base spread, movement and bloom when not aiming): the SMG's is tight, the rifle's wide. */
  hip: number;
  /** 21.0: head hits deal this × (the hitbox's own head multiplier is 2): the pistol's precision reward. */
  headMul?: number;
  /** 21.0: damage falloff of a single round (pellets have their own): full to `near` m, `min` of it from `far` m. */
  falloff?: { near: number; far: number; min: number };
  /** 21.0: a hit shoves the target back (m/s) and staggers it (s): the shotgun's pushback. */
  knock?: { push: number; stagger: number };
  /** 90.1: it fires rockets (the Game's Rockets), not rounds: no report of a gun, no brass. */
  launcher?: boolean;
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
