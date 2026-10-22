import { flSpan } from './Flavor';
import { mapCardHtml } from './MapCard';
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

/** 24.0: 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number) {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH')}`;
}

/**
 * Team Deathmatch HUD (6.0): the ticket score, a kill feed, the respawn countdown, and the name tags
 * over allied bots. 24.0: the score and the player's standing are one live scoreboard in the top
 * right (ALPHA vs OMEGA tickets with bars; his rank in his team, kills and deaths), the feed under it;
 * his own kills stand out in the feed (gold); the minimap moved to the bottom left (stylesheet).
 * Every number is written only when it changes (a text write every frame re-laid and repainted it).
 */
export class TdmHud {
  root = el('div', 'tdm-hud hidden');
  private right = el('div', 'tdm-right');
  private score = el('div', 'tdm-score');
  private aNum = el('b', 'a');
  private oNum = el('b', 'o');
  private aBar = el('i', 'a');
  private oBar = el('i', 'o');
  private me = el('div', 'tdm-me');
  private feed = el('div', 'tdm-feed');
  private last = { a: -1, o: -1, me: '', respawn: '' };
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
    this.right.append(this.score, this.me, this.feed);
    this.root.append(this.tags, this.right, this.respawn);
    parent.appendChild(this.root);
    this.setMe(1, 1, 0, 0);
  }

  /** 24.0: the player's standing in his team (rank of `of`), his kills and deaths. */
  setMe(rank: number, of: number, kills: number, deaths: number) {
    const key = `${rank}/${of}/${kills}/${deaths}`;
    if (key === this.last.me) return;
    const bumped = this.last.me !== '' && kills > Number(this.last.me.split('/')[2]);
    this.last.me = key;
    this.me.innerHTML = `<span class="rank${rank === 1 ? ' top' : ''}">${ordinal(rank)}<i>/ ${of}</i></span><span class="kd"><b>${kills}</b> KILLS</span><span class="kd"><b>${deaths}</b> DEATHS</span>`;
    if (bumped) {
      this.me.classList.remove('bump');
      void this.me.offsetWidth;
      this.me.classList.add('bump');
    }
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setMax(n: number) {
    this.max = n;
  }

  setTickets(a: number, o: number) {
    if (a === this.last.a && o === this.last.o) return;
    this.last.a = a;
    this.last.o = o;
    this.aNum.textContent = String(a);
    this.oNum.textContent = String(o);
    this.aBar.style.transform = `scaleX(${Math.max(0, a / this.max)})`;
    this.oBar.style.transform = `scaleX(${Math.max(0, o / this.max)})`;
    this.score.classList.toggle('low-a', a <= 5);
    this.score.classList.toggle('low-o', o <= 5);
  }

  /** One line of the feed. 13.0: with the killer's gun between the names (SMG, AR, SG). */
  kill(killer: Combatant | null, victim: Combatant, weapon?: string) {
    // 24.0: his kills pop out (gold), his deaths are tinted.
    const row = el('div', `row${killer?.isPlayer ? ' mine' : victim.isPlayer ? ' died' : ''}`);
    const name = (c: Combatant) => `<span class="${c.team === 'alpha' ? 'a' : 'o'}${c.isPlayer ? ' you' : ''}">${c.name}</span>`;
    const how = weapon ? `<i class="gun">${weapon}</i>` : '<i>▸</i>';
    row.innerHTML = killer ? `${name(killer)}${how}${name(victim)}` : `${name(victim)}<i>✕</i>`;
    this.feed.prepend(row);
    this.feedRows.unshift({ el: row, t: 0 });
    while (this.feedRows.length > FEED_MAX) this.feedRows.pop()!.el.remove();
  }

  /** Respawn countdown (seconds left), or null to hide. */
  setRespawn(left: number | null, killer: string | null = null) {
    const html = left === null ? '' : `${killer ? `<div class="by">KILLED BY <b>${killer}</b></div>` : ''}<div class="t">RESPAWN IN <b>${Math.max(0, left).toFixed(1)}</b></div>`;
    if (html === this.last.respawn) return;
    this.last.respawn = html;
    this.respawn.classList.toggle('hidden', left === null);
    if (left !== null) this.respawn.innerHTML = html;
  }

  clear() {
    this.last.a = this.last.o = -1;
    this.last.me = '';
    this.setMe(1, 1, 0, 0);
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
        // 22.0: a chevron under the name and health, pointing down at the head (allies only).
        const e = el('div', 'tdm-tag', `<span>${a.name}</span><i><b></b></i><u></u>`);
        this.tags.appendChild(e);
        t = { el: e, hp: e.querySelector('b')! };
        this.tagEls.set(a, t);
      }
      // 22.0: the tag's foot (the chevron's tip) just over the helmet.
      _p.set(a.pos.x, a.pos.y + 2.12, a.pos.z);
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

/** 24.0: a line's score on the board: 100 a kill, −25 a death, never below 0. */
export function scoreOf(l: { kills: number; deaths: number }) {
  return Math.max(0, l.kills * 100 - l.deaths * 25);
}

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

  /**
   * 24.0: a big board. The title (VICTORY / DEFEAT), the tickets and the time in team colours, then
   * both teams side by side in wide columns (#, name and gun, K, D, SCORE), his row lit, and the next
   * map as cards.
   */
  show(won: boolean, tickets: Record<TeamId, number>, lines: TdmLine[], time: number, next: { info: LevelInfo; again: boolean }[]) {
    const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
    const team = (t: TeamId) =>
      lines
        .filter((l) => l.team === t)
        .sort((a, b) => scoreOf(b) - scoreOf(a) || b.kills - a.kills || a.deaths - b.deaths)
        .map(
          (l, i) =>
            `<tr class="${l.you ? 'you' : ''}"><td class="n">${i + 1}</td><td class="nm">${l.name}${l.you ? '<em class="me">YOU</em>' : ''}${l.weapon ? `<em class="gun">${l.weapon}</em>` : ''}</td><td>${l.kills}</td><td>${l.deaths}</td><td class="sc">${scoreOf(l)}</td></tr>`,
        )
        .join('');
    const board = (t: TeamId, name: string) =>
      `<table class="res-board ${t === 'alpha' ? 'a' : 'o'}"><thead><tr><th class="n">#</th><th class="nm">${name}</th><th>K</th><th>D</th><th class="sc">SCORE</th></tr></thead><tbody>${team(t)}</tbody></table>`;
    this.root.innerHTML = `
      <div class="res">
        <div class="end-title res-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}${flSpan(won ? 'victory' : 'defeat')}</div>
        <div class="res-score"><span class="a">ALPHA <b>${tickets.alpha}</b></span><span class="vs">TICKETS · ${mm}:${ss}</span><span class="o"><b>${tickets.omega}</b> OMEGA</span></div>
        <div class="res-boards">${board('alpha', 'ALPHA')}${board('omega', 'OMEGA')}</div>
        <div class="res-note">SCORE · 100 A KILL · −25 A DEATH</div>
        ${nextMapsHtml(next)}
      </div>`;
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
    <div class="map-grid sm">${next.map(({ info, again }) => mapCardHtml(info, { data: 'map', on: again, tag: again ? 'REMATCH' : undefined, small: true })).join('')}</div>
    <button class="pm-btn small" data-act="menu">MAIN MENU${flSpan('mainMenu')}</button>
  </div>`;
}

export function bindNextMaps(root: HTMLElement, pick: (id: LevelInfo['id']) => void, menu: () => void) {
  for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-map]'))) b.addEventListener('click', () => pick(b.dataset.map as LevelInfo['id']));
  root.querySelector('.next-maps [data-act="menu"]')?.addEventListener('click', () => menu());
}
