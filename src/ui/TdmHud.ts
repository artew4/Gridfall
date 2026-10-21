import { LANG, flSpan } from './Flavor';
import * as THREE from 'three';
import type { Combatant, TeamId } from '../combat/Team';
import type { LevelInfo } from '../levels/Level';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const FEED_LIFE = 5;
const FEED_MAX = 5;

/**
 * Team Deathmatch HUD (6.0): the ticket score at the top (ALPHA vs OMEGA, with bars), a kill feed, the
 * respawn countdown, and the name tags over allied bots. Thin lines in the same style as the HUD.
 */
export class TdmHud {
  root = el('div', 'tdm-hud hidden');
  private score = el('div', 'tdm-score');
  private aNum = el('b', 'a');
  private oNum = el('b', 'o');
  private aBar = el('i', 'a');
  private oBar = el('i', 'o');
  private feed = el('div', 'tdm-feed');
  private respawn = el('div', 'tdm-respawn hidden');
  private tags = el('div', 'tdm-tags');
  private feedRows: { el: HTMLDivElement; t: number }[] = [];
  private tagEls = new Map<Combatant, { el: HTMLDivElement; hp: HTMLElement }>();
  private max = 25;

  constructor(parent: HTMLElement) {
    const aSide = el('div', 'side a', `<span>ALPHA${flSpan('ally', 'em', '')}</span>`);
    const oSide = el('div', 'side o', `<span>OMEGA${flSpan('enemy', 'em', '')}</span>`);
    const ab = el('div', 'bar a');
    ab.appendChild(this.aBar);
    const ob = el('div', 'bar o');
    ob.appendChild(this.oBar);
    aSide.append(this.aNum, ab);
    oSide.append(this.oNum, ob);
    this.score.append(aSide, el('div', 'vs', 'TICKETS'), oSide);
    this.root.append(this.tags, this.score, this.feed, this.respawn);
    parent.appendChild(this.root);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setMax(n: number) {
    this.max = n;
  }

  setTickets(a: number, o: number) {
    this.aNum.textContent = String(a);
    this.oNum.textContent = String(o);
    this.aBar.style.transform = `scaleX(${Math.max(0, a / this.max)})`;
    this.oBar.style.transform = `scaleX(${Math.max(0, o / this.max)})`;
    this.score.classList.toggle('low-a', a <= 5);
    this.score.classList.toggle('low-o', o <= 5);
  }

  /** One line of the feed. 13.0: with the killer's gun between the names (SMG, AR, SG). */
  kill(killer: Combatant | null, victim: Combatant, weapon?: string) {
    const row = el('div', 'row');
    const name = (c: Combatant) => `<span class="${c.team === 'alpha' ? 'a' : 'o'}${c.isPlayer ? ' you' : ''}">${c.name}</span>`;
    const how = weapon ? `<i class="gun">${weapon}</i>` : '<i>▸</i>';
    row.innerHTML = killer ? `${name(killer)}${how}${name(victim)}` : `${name(victim)}<i>✕</i>`;
    this.feed.prepend(row);
    this.feedRows.unshift({ el: row, t: 0 });
    while (this.feedRows.length > FEED_MAX) this.feedRows.pop()!.el.remove();
  }

  /** Respawn countdown (seconds left), or null to hide. */
  setRespawn(left: number | null, killer: string | null = null) {
    this.respawn.classList.toggle('hidden', left === null);
    if (left === null) return;
    this.respawn.innerHTML = `${killer ? `<div class="by">KILLED BY <b>${killer}</b></div>` : ''}<div class="t">RESPAWN IN <b>${Math.max(0, left).toFixed(1)}</b></div>`;
  }

  clear() {
    for (const r of this.feedRows) r.el.remove();
    this.feedRows.length = 0;
    for (const t of this.tagEls.values()) t.el.remove();
    this.tagEls.clear();
    this.setRespawn(null);
  }

  /**
   * Feed ageing and the name tags: allies get their callsign and a health line above the head,
   * through walls (you always know where your team is), smaller and fainter with distance.
   */
  update(dt: number, cam: THREE.PerspectiveCamera, allies: readonly Combatant[]) {
    for (let i = this.feedRows.length - 1; i >= 0; i--) {
      const r = this.feedRows[i];
      r.t += dt;
      r.el.style.opacity = String(Math.min(1, (FEED_LIFE - r.t) / 0.6));
      if (r.t > FEED_LIFE) {
        r.el.remove();
        this.feedRows.splice(i, 1);
      }
    }
    const seen = new Set<Combatant>();
    const w = window.innerWidth, h = window.innerHeight;
    for (const a of allies) {
      if (!a.alive || a.isPlayer) continue;
      seen.add(a);
      let t = this.tagEls.get(a);
      if (!t) {
        const e = el('div', 'tdm-tag', `<span>${a.name}</span><i><b></b></i>`);
        this.tags.appendChild(e);
        t = { el: e, hp: e.querySelector('b')! };
        this.tagEls.set(a, t);
      }
      _p.set(a.pos.x, a.pos.y + 2.25, a.pos.z);
      const d = _p.distanceTo(cam.position);
      _p.project(cam);
      if (_p.z > 1 || d > 120) {
        t.el.style.opacity = '0';
        continue;
      }
      const x = (_p.x * 0.5 + 0.5) * w, y = (-_p.y * 0.5 + 0.5) * h;
      t.el.style.opacity = String(d > 60 ? 0.55 : 0.9);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%) scale(${Math.max(0.7, 1.05 - d / 90).toFixed(2)})`;
      t.hp.style.transform = `scaleX(${a.hpFrac.toFixed(2)})`;
    }
    for (const [c, t] of this.tagEls) if (!seen.has(c)) {
      t.el.remove();
      this.tagEls.delete(c);
    }
  }
}
const _p = new THREE.Vector3();

export interface TdmLine {
  name: string;
  team: TeamId;
  you: boolean;
  kills: number;
  deaths: number;
  /** 13.0: the gun of its last life (armory tag). */
  weapon?: string;
}

/**
 * Victory or defeat: the tickets, the scoreboard, then what next. 13.0: no detour through the root
 * menu: the next map (every Team Deathmatch map, this one first as the rematch) loads straight from
 * here; MAIN MENU stays as the small way out.
 */
export class TdmScreen {
  root = el('div', 'layer screen hidden');
  onNextMap: (id: LevelInfo['id']) => void = () => {};
  onMenu: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root.id = 'tdmscreen';
    parent.appendChild(this.root);
    for (const ev of ['mousedown', 'click']) this.root.addEventListener(ev, (e) => e.stopPropagation());
  }

  show(won: boolean, tickets: Record<TeamId, number>, lines: TdmLine[], time: number, next: { info: LevelInfo; again: boolean }[]) {
    const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
    const team = (t: TeamId) =>
      lines
        .filter((l) => l.team === t)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map((l) => `<span class="${l.you ? 'you' : ''}">${l.name}${l.weapon ? `<em class="gun">${l.weapon}</em>` : ''}</span><span>${l.kills}</span><span>${l.deaths}</span>`)
        .join('');
    this.root.innerHTML = `
      <div class="end-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}${flSpan(won ? 'victory' : 'defeat')}</div>
      <div class="end-sub">ALPHA ${tickets.alpha} · ${tickets.omega} OMEGA — ${mm}:${ss}</div>
      <div class="tdm-board">
        <div class="col a"><div class="hd"><b>ALPHA</b><span>K</span><span>D</span></div>${team('alpha')}</div>
        <div class="col o"><div class="hd"><b>OMEGA</b><span>K</span><span>D</span></div>${team('omega')}</div>
      </div>
      ${nextMapsHtml(next)}`;
    bindNextMaps(this.root, (id) => this.onNextMap(id), () => this.onMenu());
    this.root.classList.remove('hidden');
  }

  /** 13.0: between the click and the new map: the board gives way to a deploy note while it builds. */
  deploying(info: LevelInfo) {
    this.root.innerHTML = `<div class="end-title">DEPLOYING${flSpan('deploying', 'span', 'jp', info.biome)}</div><div class="end-sub">${info.name} · ${info.loading}</div>`;
    // Survival comes here from the death screen, with this screen still hidden.
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }
}

/**
 * 13.0, the "choose next map" block of a result screen (TDM's board, survival's death screen): one
 * card per map of the mode, the one just played first as REMATCH, and a small MAIN MENU.
 */
export function nextMapsHtml(next: { info: LevelInfo; again: boolean }[]) {
  return `<div class="next-maps">
    <div class="mm-label">CHOOSE NEXT MAP ${flSpan('nextMap')}</div>
    <div class="settings-row">${next
      .map(
        ({ info, again }) => `<button class="set-card${again ? ' on' : ''}" data-map="${info.id}"><b>${again ? 'REMATCH · ' : ''}${info.name}</b><span class="jp" lang="${LANG[info.biome]}">${info.jp}</span><span class="blurb">${info.blurb}</span></button>`,
      )
      .join('')}</div>
    <button class="pm-btn small" data-act="menu">MAIN MENU${flSpan('mainMenu')}</button>
  </div>`;
}

export function bindNextMaps(root: HTMLElement, pick: (id: LevelInfo['id']) => void, menu: () => void) {
  for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-map]'))) b.addEventListener('click', () => pick(b.dataset.map as LevelInfo['id']));
  root.querySelector('.next-maps [data-act="menu"]')?.addEventListener('click', () => menu());
}
