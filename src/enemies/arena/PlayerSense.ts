import type { Combatant } from '../../combat/Team';
import type { PlayerUnit } from '../../combat/PlayerUnit';
import { ARENA } from './ArenaCtx';
import type { Seen, SenseAgent } from './Sensing';

/**
 * 12.0: the human as a viewer in the arena's sensing pass, so what he sees is spotted for his team
 * (the minimap, the bots' board) exactly like what a bot sees. His eyes: a field of view about the
 * screen's (never behind him, however alerted), checked every ARENA.spot.every s. His pairs share the
 * ray budget and the pair cache with the bots: a hostile bot that already traced its line to him
 * answers his check for free.
 */
export class PlayerSense implements SenseAgent {
  readonly alert = new Map<number, number>();
  readonly seen = new Map<number, Seen>();
  readonly target = null;
  readonly view = { cos: ARENA.spot.viewCos, every: ARENA.spot.every };
  /** The unit, seen as a viewer: an enemy's yaw convention (forward = (sin, cos)) and its crouch. */
  readonly self: Combatant & { yaw: number; crouch: number };

  constructor(unit: PlayerUnit) {
    const p = unit.player;
    this.self = Object.create(unit, {
      yaw: { get: () => p.yaw + Math.PI },
      crouch: { get: () => p.crouch },
    });
  }

  onSight() {}

  reset() {
    this.seen.clear();
  }
}
