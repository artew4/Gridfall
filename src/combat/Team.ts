import * as THREE from 'three';

/**
 * Factions (6.0). Survival is PvE: the player alone on ALPHA against OMEGA's waves. Team Deathmatch
 * puts allied bots on ALPHA beside the player. Everything that perceives, targets or damages works on
 * `Combatant`s and their team, never on "the player" as such.
 */
export type TeamId = 'alpha' | 'omega';

export const TEAMS: readonly TeamId[] = ['alpha', 'omega'];

export const otherTeam = (t: TeamId): TeamId => (t === 'alpha' ? 'omega' : 'alpha');

let nextUid = 1;
/** A unique id per combatant life (a respawn is a new combatant). */
export const newUid = () => nextUid++;

/**
 * Anything that fights: the player, a survival enemy, an allied or enemy bot. What a squad may
 * observe about a hostile (reloading, hurt, facing) is read only after one of its members saw it.
 */
export interface Combatant {
  readonly uid: number;
  readonly team: TeamId;
  /** Callsign (name tags, kill feed). */
  readonly name: string;
  readonly isPlayer: boolean;
  /** Feet. */
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  readonly alive: boolean;
  readonly radius: number;
  /** Where eyes aim to see it and rounds aim to hit it (above the feet; crouch-aware for bots). */
  readonly headY: number;
  readonly chestY: number;
  readonly reloading: boolean;
  /** Health 0..1. */
  readonly hpFrac: number;
  /** Unit XZ direction it faces (x, z). */
  facing(out: THREE.Vector2): THREE.Vector2;
  /** Last time a hostile round hit or passed close to it (the rushers' "under fire" opening). */
  pressureT: number;
  /**
   * Damage from `by` (null: the world). Returns true if it died of it. Implementations ignore
   * damage from their own team: friendly fire is off at the receiving end too.
   */
  hurt(dmg: number, from: THREE.Vector3, by: Combatant | null, dir?: THREE.Vector3, point?: THREE.Vector3): boolean;
}

/** Teammates never damage each other (rounds pass through; melee and blasts skip them). */
export const hostile = (a: { team: TeamId }, b: { team: TeamId }) => a.team !== b.team;

/** Closest distance from point `p` to the segment a→b (3D). */
export function segmentDistance(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2)) : 0;
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}
