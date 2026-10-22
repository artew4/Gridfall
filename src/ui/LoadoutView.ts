import { flSpan } from './Flavor';
import { ARMORY, ARMORY_ORDER, type WeaponId } from '../entities/weapons/armory';

/**
 * 13.0, the loadout picker: a card per gun (21.0: pistol, SMG, rifle, shotgun) with its key. Shown over the match
 * intro and the first seconds of every life (a pick swaps the gun at once; 23.0: after that a one-line
 * prompt while he is still in the spawn area, where a pick still swaps), and under the respawn
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
  /** 23.0: the spawn area's one-line prompt (shown after the cards, while a swap is still allowed). */
  private line = document.createElement('div');

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
    this.line.className = 'lo-prompt hidden';
    parent.appendChild(this.line);
  }

  /** 23.0: in the spawn area, past the cards: "1–4 to change loadout", and the gun in hand. */
  prompt(on: boolean, carried?: WeaponId) {
    this.line.classList.toggle('hidden', !on);
    if (on && carried) this.line.innerHTML = `<kbd>1–4</kbd> CHANGE LOADOUT ${flSpan('loadout')} <span>${ARMORY[carried].spec.name} · IN SPAWN</span>`;
  }

  /** `queued`: the pick (highlighted); `carried`: the gun in hand; `next`: the pick waits for a respawn. */
  show(on: boolean, queued?: WeaponId, carried?: WeaponId, next = false) {
    this.root.classList.toggle('hidden', !on);
    if (!on || !queued) return;
    this.head.innerHTML = next ? `NEXT SPAWN ${flSpan('nextSpawn')} · PRESS 1 · 2 · 3 · 4` : `LOADOUT ${flSpan('loadout')} · PRESS 1 · 2 · 3 · 4`;
    for (const [id, c] of this.cards) {
      c.classList.toggle('on', id === queued);
      c.classList.toggle('held', id === carried && id !== queued);
    }
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }
}
