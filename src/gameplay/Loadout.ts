import { ARMORY, isWeaponId, type WeaponId } from '../entities/weapons/armory';

/*
  13.0, the player's loadout: the weapon he carries (`current`) and the one he has asked for next
  (`queued`). A pick is queued while he can't change guns (dead, waiting to respawn) and applied at
  the next spawn; while he can (the match intro, the first seconds in the spawn yard) it is applied
  at once. The last pick is remembered per browser and is what every non-story mode starts with.

  No DOM, no three.js: the Game applies `current` to the viewmodel; the picker overlay (ui/LoadoutView)
  only draws this state.
*/

const KEY = 'gridfall.loadout';

export class Loadout {
  current: WeaponId;
  queued: WeaponId;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    let saved: string | null = null;
    try {
      saved = this.storage?.getItem(KEY) ?? null;
    } catch {
      /* storage blocked */
    }
    this.current = this.queued = isWeaponId(saved) ? saved : 'ar';
  }

  get entry() {
    return ARMORY[this.current];
  }

  /** Ask for a weapon. Returns true if it changed what is queued. */
  queue(id: WeaponId) {
    if (this.queued === id) return false;
    this.queued = id;
    try {
      this.storage?.setItem(KEY, id);
    } catch {
      /* the pick lasts this session */
    }
    return true;
  }

  /** Spawn (or a pick while he still may swap): the queued weapon becomes the carried one. Returns true if it changed. */
  commit() {
    if (this.current === this.queued) return false;
    this.current = this.queued;
    return true;
  }
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
