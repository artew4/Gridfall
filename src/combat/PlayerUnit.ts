import * as THREE from 'three';
import { newUid, type Combatant, type TeamId } from './Team';
import type { Player } from '../player/Player';

/**
 * The player as a combatant: his body, read live, on his team. Damage goes through `onHurt` (the
 * game's damage path: HUD arrow, grade, spawn protection); damage from his own team is ignored.
 */
export class PlayerUnit implements Combatant {
  readonly uid = newUid();
  readonly isPlayer = true;
  /** 48.0: ALPHA in survival; in Team Deathmatch the team dealt to him for the match. */
  team: TeamId;
  /** 13.0: the name he typed on the menu (set at the start of each run). */
  name: string;
  /**
   * Eye of a standing player minus a little (what a perception ray aims at), and where rounds aim.
   * 11.0: they follow the crouch (the body's height scale), so bots see and shoot a crouched player
   * where he actually is.
   */
  get headY() {
    return 1.4 * this.player.heightScale;
  }
  get chestY() {
    return 1.25 * this.player.heightScale;
  }
  pressureT = -Infinity;
  onHurt: (dmg: number, from: THREE.Vector3, by: Combatant | null) => void = () => {};
  isReloading: () => boolean = () => false;

  constructor(readonly player: Player, opts: { team?: TeamId; name?: string } = {}) {
    this.team = opts.team ?? 'alpha';
    this.name = opts.name ?? 'YOU';
  }

  get pos() {
    return this.player.pos;
  }
  get vel() {
    return this.player.vel;
  }
  get alive() {
    return this.player.alive;
  }
  get radius() {
    return this.player.radius;
  }
  get reloading() {
    return this.isReloading();
  }
  get hpFrac() {
    return Math.max(0, this.player.health) / this.player.maxHealth;
  }

  facing(out: THREE.Vector2) {
    return out.set(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
  }

  hurt(dmg: number, from: THREE.Vector3, by: Combatant | null) {
    if (by && by.team === this.team) return false;
    if (!this.player.alive) return false;
    this.onHurt(dmg, from, by);
    return !this.player.alive;
  }
}

const units = new WeakMap<Player, PlayerUnit>();

/**
 * The unit of a player body. The game registers the real one (with its damage path); a check's
 * stand-in target gets a plain one on first use.
 */
export function unitOf(player: Player, damage?: (dmg: number, from: THREE.Vector3) => void): PlayerUnit {
  let u = units.get(player);
  if (!u) {
    u = new PlayerUnit(player);
    if (damage) u.onHurt = (d, f) => damage(d, f);
    units.set(player, u);
  }
  return u;
}

export function registerUnit(player: Player, unit: PlayerUnit) {
  units.set(player, unit);
}
