import * as THREE from 'three';

/*
  23.0, the spawn weapon swap: after every spawn (the match's first, every TDM respawn) the player
  may change his gun with 1–4 while he is still in the spawn area. The area is a disc round the point
  he spawned at; it closes for the rest of the life the moment he steps out of it, or fires (the swap
  is for choosing a gun, not a free reload in a fight).

   - 'cards': the first seconds of the life: the full picker (13.0's cards);
   - 'prompt': after that, still in the area: a one-line prompt;
   - null: closed (left, fired, dead) until the next spawn.
*/
export const SPAWN_ZONE = {
  /** Radius of the area (m, horizontal). */
  radius: 12,
  /** Seconds of the full picker after a spawn. */
  cards: 3,
  /** A drop or climb of more than this from the spawn point leaves the area too (m). */
  height: 4,
};

export type SpawnPhase = 'cards' | 'prompt' | null;

export class SpawnZone {
  readonly at = new THREE.Vector3();
  open = false;
  private t0 = 0;
  private shots0 = 0;

  /** He spawned at `at` (time `now`, his shot count so far). */
  mark(at: THREE.Vector3, now: number, shots: number) {
    this.at.copy(at);
    this.open = true;
    this.t0 = now;
    this.shots0 = shots;
  }

  close() {
    this.open = false;
  }

  /** Where he stands now: the phase, closing the area for good once he is out of it or has fired. */
  update(pos: THREE.Vector3, now: number, shots: number): SpawnPhase {
    if (!this.open) return null;
    const out = Math.hypot(pos.x - this.at.x, pos.z - this.at.z) > SPAWN_ZONE.radius || Math.abs(pos.y - this.at.y) > SPAWN_ZONE.height;
    if (out || shots > this.shots0) {
      this.open = false;
      return null;
    }
    return now - this.t0 < SPAWN_ZONE.cards ? 'cards' : 'prompt';
  }
}
