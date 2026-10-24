import { flSpan } from './Flavor';
import { mapTileHtml, menuMapName } from './MapCard';
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

/** 26.0: one line of the live team board. */
export interface BoardLine {
  name: string;
  kills: number;
  deaths: number;
  you: boolean;
}

/** 26.0: the board's order: score, then kills, then fewer deaths, then the name (stable between equal lines). */
export function boardOrder<T extends BoardLine>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => scoreOf(b) - scoreOf(a) || b.kills - a.kills || a.deaths - b.deaths || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A board row: its element, the Text nodes its numbers live in, and what they last said. */
interface BoardRow {
  el: HTMLDivElement;
  name: Text;
  k: Text;
  d: Text;
  sc: Text;
  glow: HTMLElement;
  at: number;
  kills: number;
  deaths: number;
  you: boolean;
}

/**
 * Team Deathmatch HUD (6.0): the score, a kill feed, the respawn countdown, and the name tags over
 * allied bots. 26.0, three corners: top centre the match score (ALPHA kills - kills OMEGA, the
 * tickets left as thin bars under it), top right the kill feed (his kills gold, 24.0), top left a live
 * board of his team (name, K, D, score, by score, his row gold). The minimap stays bottom left.
 * Every number is written only when it changes, straight into its Text node; the board's rows are
 * built once and reordered by transform alone, so a kill re-lays nothing outside the board.
 */
export class TdmHud {
  root = el('div', 'tdm-hud hidden');
  private score = el('div', 'tdm-score');
  private aNum = document.createTextNode('0');
  private oNum = document.createTextNode('0');
  private aBar = el('i', 'a');
  private oBar = el('i', 'o');
  private feed = el('div', 'tdm-feed');
  private board = el('div', 'tdm-board');
  private boardRows = el('div', 'rows');
  private rows: BoardRow[] = [];
  private last = { a: -1, o: -1, respawn: '' };
  private respawn = el('div', 'tdm-respawn hidden');
  private tags = el('div', 'tdm-tags');
  private feedRows: { el: HTMLDivElement; t: number }[] = [];
  // 29.0: under each team's tickets, who is still standing; the sudden-death clock; the spectator panel.
  private aStand = document.createTextNode('');
  private oStand = document.createTextNode('');
  private sudden = el('div', 'tdm-sudden hidden');
  private suddenT = document.createTextNode('');
  private suddenWho = document.createTextNode('');
  private spec = el('div', 'tdm-spec hidden');
  private specName = document.createTextNode('');
  private specHp = el('i');
  private specMates = document.createTextNode('');
  private last29 = { aS: -1, oS: -1, lastA: false, lastO: false, sud: '', spec: '' };
  private tagEls = new Map<Combatant, { el: HTMLDivElement; hp: HTMLElement }>();
  /**
   * 44.0, the fronts (between the two sides of the score): a bar per lane, ALPHA's ground from the left
   * up to the line, OMEGA's from the right; a lane ALPHA pushes glows, one it falls back in pulses red, a
   * break flashes; the lane he stands in is lit. Off (no fronts): the 26.0 dash.
   */
  private vs = el('div', 'vs', '<i>—</i>');
  private frontRows: { row: HTMLElement; a: HTMLElement; o: HTMLElement; name: Text; key: string }[] = [];
  private notices = el('div', 'tdm-notices');
  private max = 25;

  constructor(parent: HTMLElement) {
    // Top centre: ALPHA 24 - 18 OMEGA. 29.0: the tickets (respawns) each team has left, a bar of them
    // under its name, and under that who is still standing (LAST STAND once its tickets are gone).
    const side = (t: 'a' | 'o', name: string, num: Text, bar: HTMLElement, stand: Text) => {
      const s = el('div', `side ${t}`, `<span>${name}${flSpan(t === 'a' ? 'ally' : 'enemy', 'em', '')}</span>`);
      const b = el('b');
      b.appendChild(num);
      const track = el('div', `bar ${t}`);
      track.appendChild(bar);
      const st = el('small', 'stand');
      st.appendChild(stand);
      s.append(b, track, st);
      return s;
    };
    this.score.append(side('a', 'ALPHA', this.aNum, this.aBar, this.aStand), this.vs, side('o', 'OMEGA', this.oNum, this.oBar, this.oStand));
    // 29.0: the sudden-death clock (under the score) and the spectator panel (bottom centre).
    const sl = el('div', 'lbl', 'SUDDEN DEATH');
    const st = el('b');
    st.appendChild(this.suddenT);
    const sw = el('div', 'who');
    sw.appendChild(this.suddenWho);
    this.sudden.append(sl, st, sw);
    const sn = el('div', 'nm', 'SPECTATING ');
    const snb = el('b');
    snb.appendChild(this.specName);
    sn.appendChild(snb);
    const hp = el('div', 'hp');
    hp.appendChild(this.specHp);
    const sm = el('div', 'hint');
    sm.appendChild(this.specMates);
    this.spec.append(sn, hp, sm);
    this.board.append(el('div', 'head', `<span class="nm">ALPHA${flSpan('ally', 'em', '')}</span><span>K</span><span>D</span><span class="sc">SCORE</span>`), this.boardRows);
    this.root.append(this.tags, this.board, this.score, this.sudden, this.feed, this.respawn, this.spec, this.notices);
    parent.appendChild(this.root);
  }

  /**
   * 26.0, the live team board: one row per member of his team, in score order, his row gold. Rows are
   * made when the roster changes (a match start) and otherwise only their Text nodes change, and only
   * when the number did; a change of place moves the row by its transform (one compositor move).
   */
  setBoard(lines: readonly BoardLine[]) {
    if (lines.length !== this.rows.length || lines.some((l, i) => l.name !== this.rows[i].name.data)) this.buildBoard(lines);
    const order = boardOrder(lines);
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i], l = lines[i];
      if (l.kills !== r.kills) {
        r.k.data = String(l.kills);
        // A kill of his flashes his row (the Web Animations API: no class toggle, no forced reflow).
        if (r.you && r.kills >= 0 && l.kills > r.kills) r.glow.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
      }
      if (l.deaths !== r.deaths) r.d.data = String(l.deaths);
      if (l.kills !== r.kills || l.deaths !== r.deaths) r.sc.data = String(scoreOf(l));
      r.kills = l.kills;
      r.deaths = l.deaths;
      const at = order.indexOf(l);
      if (at !== r.at) {
        r.at = at;
        r.el.style.transform = `translateY(${at * 100}%)`;
      }
    }
  }

  /** The rows for a roster (in the order given; `setBoard` places them). */
  private buildBoard(lines: readonly BoardLine[]) {
    for (const r of this.rows) r.el.remove();
    this.rows = lines.map((l) => {
      const e = el('div', `row${l.you ? ' you' : ''}`);
      const cell = (cls: string, v: string) => {
        const c = el('span', cls);
        const t = document.createTextNode(v);
        c.appendChild(t);
        e.appendChild(c);
        return t;
      };
      const glow = el('i', 'glow');
      e.appendChild(glow);
      const row: BoardRow = { el: e, name: cell('nm', l.name), k: cell('k', '0'), d: cell('d', '0'), sc: cell('sc', '0'), glow, at: -1, kills: -1, deaths: -1, you: l.you };
      this.boardRows.appendChild(e);
      return row;
    });
    // The rows are absolutely placed: the board's height is set once per roster.
    this.boardRows.style.height = `calc(${lines.length} * var(--board-row))`;
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setMax(n: number) {
    this.max = n;
  }

  /** The tickets each team has left; the score shown is what each took off the other (its kills). */
  setTickets(a: number, o: number) {
    if (a === this.last.a && o === this.last.o) return;
    // 29.0: tickets are respawns: the numbers are what each team has left.
    if (a !== this.last.a) this.aNum.data = String(a);
    if (o !== this.last.o) this.oNum.data = String(o);
    this.last.a = a;
    this.last.o = o;
    this.aBar.style.transform = `scaleX(${Math.max(0, a / this.max)})`;
    this.oBar.style.transform = `scaleX(${Math.max(0, o / this.max)})`;
    this.score.classList.toggle('low-a', a <= 5);
    this.score.classList.toggle('low-o', o <= 5);
  }

  /**
   * 29.0: who is still in it per team (alive or about to respawn). At 0 tickets a side reads LAST
   * STAND and its number goes red.
   */
  setStanding(a: number, o: number) {
    const lastA = this.last.a === 0, lastO = this.last.o === 0;
    const L = this.last29;
    if (a === L.aS && o === L.oS && lastA === L.lastA && lastO === L.lastO) return;
    if (a !== L.aS || lastA !== L.lastA) this.aStand.data = lastA ? `LAST STAND · ${a}` : `${a} STANDING`;
    if (o !== L.oS || lastO !== L.lastO) this.oStand.data = lastO ? `LAST STAND · ${o}` : `${o} STANDING`;
    if (lastA !== L.lastA) this.score.classList.toggle('last-a', lastA);
    if (lastO !== L.lastO) this.score.classList.toggle('last-o', lastO);
    Object.assign(L, { aS: a, oS: o, lastA, lastO });
  }

  /**
   * 29.0: the sudden-death clocks (s left, null: not running): ALPHA's (his team's) pulses red, OMEGA's
   * shows as the enemy's, both together as a draw coming.
   */
  setSudden(a: number | null, o: number | null) {
    const both = a !== null && o !== null;
    const t = a ?? o;
    const key = t === null ? '' : `${both ? 'b' : a !== null ? 'a' : 'o'}${Math.ceil(t)}`;
    if (key === this.last29.sud) return;
    const was = this.last29.sud[0];
    this.last29.sud = key;
    this.sudden.classList.toggle('hidden', t === null);
    if (t === null) return;
    const s = Math.max(0, Math.ceil(t));
    this.suddenT.data = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const kind = key[0];
    if (kind !== was) {
      this.suddenWho.data = kind === 'b' ? 'BOTH TEAMS · A KILL OR A DRAW' : kind === 'a' ? 'ALPHA · KILL OR LOSE' : 'OMEGA MUST KILL';
      this.sudden.classList.toggle('ours', kind === 'a');
      this.sudden.classList.toggle('both', kind === 'b');
    }
  }

  /** 29.0: the spectator panel (the teammate watched: name, health, how many still stand), or null. */
  setSpectate(v: { name: string; hp: number; mates: number } | null) {
    const key = v ? `${v.name}|${v.hp.toFixed(2)}|${v.mates}` : '';
    if (key === this.last29.spec) return;
    this.last29.spec = key;
    this.spec.classList.toggle('hidden', !v);
    if (!v) return;
    this.specName.data = v.name;
    this.specHp.style.transform = `scaleX(${Math.max(0, Math.min(1, v.hp)).toFixed(2)})`;
    this.specMates.data = `${v.mates} STANDING · LEFT CLICK NEXT · RIGHT CLICK PREVIOUS`;
  }

  /** One line of the feed. 13.0: with the killer's gun between the names (SMG, AR, SG). 29.0: `out`: a final death. */
  kill(killer: Combatant | null, victim: Combatant, weapon?: string, out = false) {
    // 24.0: his kills pop out (gold), his deaths are tinted.
    const row = el('div', `row${killer?.isPlayer ? ' mine' : victim.isPlayer ? ' died' : ''}`);
    const name = (c: Combatant) => `<span class="${c.team === 'alpha' ? 'a' : 'o'}${c.isPlayer ? ' you' : ''}">${c.name}</span>`;
    const how = weapon ? `<i class="gun">${weapon}</i>` : '<i>▸</i>';
    row.innerHTML = (killer ? `${name(killer)}${how}${name(victim)}` : `${name(victim)}<i>✕</i>`) + (out ? '<i class="out">OUT</i>' : '');
    this.feed.prepend(row);
    this.feedRows.unshift({ el: row, t: 0 });
    while (this.feedRows.length > FEED_MAX) this.feedRows.pop()!.el.remove();
  }

  /**
   * 44.0: the fronts: each lane's line (ALPHA's progress, -1 … +1), ALPHA's stance there, who has broken
   * through, the lane he is in (-1: none). `names` once a match (setFrontNames). Writes only what changed.
   */
  setFronts(line: readonly number[], stance: readonly string[], broken: readonly (TeamId | null)[], here: number) {
    if (!this.frontRows.length) return;
    for (let k = 0; k < this.frontRows.length; k++) {
      const r = this.frontRows[k];
      const f = Math.max(0, Math.min(1, (line[k] + 1) / 2));
      const key = `${Math.round(f * 100)}|${stance[k]}|${broken[k] ?? ''}|${k === here ? 1 : 0}`;
      if (key === r.key) continue;
      const [was, st0, br0, h0] = r.key.split('|');
      r.key = key;
      if (Math.round(f * 100) !== Number(was)) {
        r.a.style.transform = `scaleX(${f.toFixed(2)})`;
        r.o.style.transform = `scaleX(${(1 - f).toFixed(2)})`;
      }
      if (stance[k] !== st0) {
        r.row.classList.toggle('push', stance[k] === 'push');
        r.row.classList.toggle('back', stance[k] === 'fallback');
      }
      if ((broken[k] ?? '') !== br0) {
        r.row.classList.toggle('broke-a', broken[k] === 'alpha');
        r.row.classList.toggle('broke-o', broken[k] === 'omega');
      }
      if (String(k === here ? 1 : 0) !== h0) r.row.classList.toggle('here', k === here);
    }
  }

  /** 44.0: the fronts' lanes by name (null: no fronts this match, the dash). */
  setFrontNames(names: readonly string[] | null) {
    this.frontRows = [];
    this.vs.textContent = '';
    this.vs.classList.toggle('fronts', !!names);
    if (!names) {
      this.vs.innerHTML = '<i>—</i>';
      return;
    }
    for (const n of names) {
      const row = el('div', 'front');
      const name = document.createTextNode(n.split(/[\s(]/)[0].toUpperCase().slice(0, 10));
      const lbl = el('span');
      lbl.appendChild(name);
      const track = el('div', 'track');
      const a = el('i', 'a'), o = el('i', 'o');
      track.append(a, o);
      row.append(lbl, track);
      this.vs.appendChild(row);
      a.style.transform = o.style.transform = 'scaleX(0.5)';
      this.frontRows.push({ row, a, o, name, key: '50|hold||0' });
    }
  }

  /** 44.0: a short line under the score (a lane held, pushed back), fading out by itself. */
  notice(text: string) {
    const n = el('div', 'n');
    n.textContent = text;
    n.addEventListener('animationend', () => n.remove());
    this.notices.appendChild(n);
    while (this.notices.children.length > 2) this.notices.firstElementChild!.remove();
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
    this.last29 = { aS: -1, oS: -1, lastA: false, lastO: false, sud: '', spec: '' };
    this.score.classList.remove('last-a', 'last-o');
    this.setSudden(null, null);
    this.setSpectate(null);
    for (const r of this.rows) r.el.remove();
    this.rows = [];
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
  show(result: 'win' | 'loss' | 'draw' | boolean, tickets: Record<TeamId, number>, lines: TdmLine[], time: number, next: { info: LevelInfo; again: boolean }[], why?: string) {
    // 29.0: a draw (the last two traded, or nobody broke a tie in sudden death); how it was decided.
    const res = result === true ? 'win' : result === false ? 'loss' : result;
    const won = res === 'win';
    const title = res === 'draw' ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const how = why === 'sudden death' ? 'SUDDEN DEATH' : why === 'sudden death draw' ? 'SUDDEN DEATH · TIED' : why === 'trade' ? 'THE LAST TWO TRADED' : why === 'elimination' ? 'ELIMINATION' : '';
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
        <div class="end-title res-title ${res === 'draw' ? 'draw' : won ? 'win' : 'lose'}">${title}</div>
        ${how ? `<div class="res-how">${how}</div>` : ''}
        <div class="res-score"><span class="a">ALPHA <b>${tickets.alpha}</b></span><span class="vs">${mm}:${ss}</span><span class="o"><b>${tickets.omega}</b> OMEGA</span></div>
        <div class="res-boards">${board('alpha', 'ALPHA')}${board('omega', 'OMEGA')}</div>
        ${nextMapsHtml(next)}
      </div>`;
    bindNextMaps(this.root, (id) => this.onNextMap(id), () => this.onMenu());
    this.root.classList.remove('hidden');
  }

  /** 13.0: between the click and the new map: the board gives way to a deploy note while it builds. */
  deploying(info: LevelInfo) {
    this.root.innerHTML = `<div class="end-title res-title">${menuMapName(info)}</div>`;
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
  // 45.0: the main menu's tiles (art and name), the rematch first and tagged; MAIN MENU as its BACK.
  return `<div class="next-maps gm-next">
    <div class="gm-next-h">NEXT MATCH</div>
    <div class="gm-row">${next.map(({ info, again }) => mapTileHtml(info, 'map', again ? 'REMATCH' : '', again)).join('')}</div>
    <button class="gm-menu" data-act="menu"><i></i>MAIN MENU</button>
  </div>`;
}

export function bindNextMaps(root: HTMLElement, pick: (id: LevelInfo['id']) => void, menu: () => void) {
  for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-map]'))) b.addEventListener('click', () => pick(b.dataset.map as LevelInfo['id']));
  root.querySelector('.next-maps [data-act="menu"]')?.addEventListener('click', () => menu());
}
