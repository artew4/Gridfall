import { flSpan } from './Flavor';
import { ARMORY, ARMORY_ORDER, type WeaponId } from '../entities/weapons/armory';

/**
 * 13.0, the loadout picker: three cards (SMG, rifle, shotgun) with their keys. Shown over the match
 * intro and the first seconds in the spawn yard (a pick swaps the gun at once), and under the respawn
 * countdown in Team Deathmatch (a pick is queued for the next life). Keys 1–3 always work (the mouse
 * is usually captured); the cards are clickable whenever it isn't.
 *
 * Draws the Loadout's state only; the Game decides what a pick does.
 */
export class LoadoutView {
  root = document.createElement('div');
  onPick: (id: WeaponId) => void = () => {};
  private cards = new Map<WeaponId, HTMLElement>();
  private head = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'loadout hidden';
    this.head.className = 'lo-head';
    const row = document.createElement('div');
    row.className = 'lo-row';
    for (const id of ARMORY_ORDER) {
      const a = ARMORY[id];
      const c = document.createElement('button');
      c.className = 'lo-card';
      c.dataset.weapon = id;
      c.innerHTML = `<kbd>${a.key}</kbd><b>${a.spec.name}</b>${flSpan(a.id)}<em>${a.kind}</em><span class="blurb">${a.blurb}</span>`;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPick(id);
      });
      row.appendChild(c);
      this.cards.set(id, c);
    }
    this.root.append(this.head, row);
    for (const ev of ['mousedown', 'click']) this.root.addEventListener(ev, (e) => e.stopPropagation());
    parent.appendChild(this.root);
  }

  /** `queued`: the pick (highlighted); `carried`: the gun in hand; `next`: the pick waits for a respawn. */
  show(on: boolean, queued?: WeaponId, carried?: WeaponId, next = false) {
    this.root.classList.toggle('hidden', !on);
    if (!on || !queued) return;
    this.head.innerHTML = next ? `NEXT SPAWN ${flSpan('nextSpawn')} · PRESS 1 · 2 · 3` : `LOADOUT ${flSpan('loadout')} · PRESS 1 · 2 · 3`;
    for (const [id, c] of this.cards) {
      c.classList.toggle('on', id === queued);
      c.classList.toggle('held', id === carried && id !== queued);
    }
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }
}
