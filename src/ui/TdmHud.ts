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
  /** 58.0: on the other team (the whole board shows: he is out, or a team is on its last stand). */
  foe?: boolean;
  /** 58.0: out of the match (dead with no respawn): struck through. */
  out?: boolean;
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
  /** 58.0: struck through (out of the match). */
  out: boolean;
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
  private frontRows: { row: HTMLElement; a: HTMLElement; o: HTMLElement; name: Text; key: string; flag: HTMLElement; fill: HTMLElement; okey: string }[] = [];
  /** 51.0: the alarm under the score (a double breakthrough, either way). */
  private alarm = el('div', 'tdm-alarm hidden');
  private alarmBig = document.createTextNode('');
  private alarmSmall = document.createTextNode('');
  private alarmKey = '';
  private notices = el('div', 'tdm-notices');
  /**
   * 46.0, the compass under the score: the heading's ticks and N/E/S/W, and a marker for each lane's
   * front (its name and how far, in the pusher's colour; his own lane lit). A front behind him is
   * pinned to the compass's edge on the side to turn to. Transforms only, written when they move.
   */
  private compass = el('div', 'tdm-compass hidden');
  private compassBand = el('i', 'band');
  private compassMarks: { el: HTMLElement; x: number; o: number }[] = [];
  private frontMarks: { el: HTMLElement; name: Text; base: string; dist: Text; x: number; o: number; key: string; y?: number; want?: number }[] = [];
  private compassBandX = NaN;
  private max = 25;
  /**
   * 48.0: his team this match (random). The HUD is his side's: its `a` slots (the score's left, the
   * board, the tags, the fronts' ground from the left) are his team's, `o` the other's; the colours
   * stay each team's own (ALPHA blue, OMEGA red: `side-o` swaps the HUD's colour tokens).
   */
  mine: TeamId = 'alpha';
  private sideNames: Text[] = [];

  constructor(parent: HTMLElement) {
    // Top centre: ALPHA 24 - 18 OMEGA. 29.0: the tickets (respawns) each team has left, a bar of them
    // under its name, and under that who is still standing (LAST STAND once its tickets are gone).
    const side = (t: 'a' | 'o', name: string, num: Text, bar: HTMLElement, stand: Text) => {
      const s = el('div', `side ${t}`, `<span>${flSpan(t === 'a' ? 'ally' : 'enemy', 'em', '')}</span>`);
      const nm = document.createTextNode(name);
      s.firstElementChild!.prepend(nm);
      this.sideNames.push(nm);
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
    this.board.append(el('div', 'head', `<span class="nm">${flSpan('ally', 'em', '')}</span><span>K</span><span>D</span><span class="sc">SCORE</span>`), this.boardRows);
    this.compass.appendChild(this.compassBand);
    for (const c of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      const m = el('b', c.length === 1 ? 'card' : 'card minor', c);
      this.compass.appendChild(m);
      this.compassMarks.push({ el: m, x: NaN, o: NaN });
    }
    const bn = document.createTextNode('ALPHA');
    this.board.querySelector('.head .nm')!.prepend(bn);
    this.sideNames.push(bn);
    const ab = el('b');
    ab.appendChild(this.alarmBig);
    const as = el('small');
    as.appendChild(this.alarmSmall);
    this.alarm.append(ab, as);
    this.root.append(this.alarm);
    const ct = el('div', 'track');
    ct.appendChild(this.captureFill);
    const cl = el('div', 'lbl');
    cl.appendChild(this.captureLabel);
    this.capture.append(cl, ct);
    this.root.append(this.tags, this.board, this.score, this.compass, this.sudden, this.feed, this.respawn, this.spec, this.notices, this.capture);
    parent.appendChild(this.root);
  }

  /**
   * 26.0, the live team board: one row per member of his team, in score order, his row gold. Rows are
   * made when the roster changes (a match start) and otherwise only their Text nodes change, and only
   * when the number did; a change of place moves the row by its transform (one compositor move).
   */
  setBoard(lines: readonly BoardLine[]) {
    if (lines.length !== this.rows.length || lines.some((l, i) => l.name !== this.rows[i].name.data)) this.buildBoard(lines);
    // 58.0: his team first, then the other's (when it shows), each in score order.
    const allies = lines.filter((l) => !l.foe), foes = lines.filter((l) => l.foe);
    const order = [...boardOrder(allies), ...boardOrder(foes)];
    this.board.classList.toggle('all', foes.length > 0);
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
      if (!!l.out !== r.out) {
        r.out = !!l.out;
        r.el.classList.toggle('out', r.out);
      }
      const at = order.indexOf(l);
      r.el.classList.toggle('first-foe', !!l.foe && at === allies.length);
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
      const e = el('div', `row${l.you ? ' you' : ''}${l.foe ? ' foe' : ''}`);
      const cell = (cls: string, v: string) => {
        const c = el('span', cls);
        const t = document.createTextNode(v);
        c.appendChild(t);
        e.appendChild(c);
        return t;
      };
      const glow = el('i', 'glow');
      e.appendChild(glow);
      const row: BoardRow = { el: e, name: cell('nm', l.name), k: cell('k', '0'), d: cell('d', '0'), sc: cell('sc', '0'), glow, at: -1, kills: -1, deaths: -1, you: l.you, out: false };
      this.boardRows.appendChild(e);
      return row;
    });
    // The rows are absolutely placed: the board's height is set once per roster.
    this.boardRows.style.height = `calc(${lines.length} * var(--board-row))`;
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  /** 48.0: his team this match: the names on his side and the other, the colours swapped for OMEGA. */
  setSide(team: TeamId) {
    this.mine = team;
    const me = team.toUpperCase(), them = team === 'alpha' ? 'OMEGA' : 'ALPHA';
    [this.sideNames[0].data, this.sideNames[1].data, this.sideNames[2].data] = [me, them, me];
    this.root.classList.toggle('side-o', team === 'omega');
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
      this.suddenWho.data = kind === 'b' ? 'BOTH TEAMS · A KILL OR A DRAW' : kind === 'a' ? `${this.mine.toUpperCase()} · KILL OR LOSE` : `${this.mine === 'alpha' ? 'OMEGA' : 'ALPHA'} MUST KILL`;
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
    const name = (c: Combatant) => `<span class="${c.team === this.mine ? 'a' : 'o'}${c.isPlayer ? ' you' : ''}">${c.name}</span>`;
    const how = weapon ? `<i class="gun">${weapon}</i>` : '<i>▸</i>';
    row.innerHTML = (killer ? `${name(killer)}${how}${name(victim)}` : `${name(victim)}<i>✕</i>`) + (out ? '<i class="out">OUT</i>' : '');
    this.feed.prepend(row);
    this.feedRows.unshift({ el: row, t: 0 });
    while (this.feedRows.length > FEED_MAX) this.feedRows.pop()!.el.remove();
  }

  /**
   * 44.0: the fronts: each lane's line (ALPHA's progress, -1 … +1), his team's stance there (48.0), who has broken
   * through, the lane he is in (-1: none). `names` once a match (setFrontNames). Writes only what changed.
   */
  setFronts(line: readonly number[], stance: readonly string[], broken: readonly (TeamId | null)[], here: number) {
    if (!this.frontRows.length) return;
    for (let k = 0; k < this.frontRows.length; k++) {
      const r = this.frontRows[k];
      // (ALPHA's progress: his side's ground from the left.)
      const f = Math.max(0, Math.min(1, ((this.mine === 'alpha' ? line[k] : -line[k]) + 1) / 2));
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
        r.row.classList.toggle('broke-a', !!broken[k] && broken[k] === this.mine);
        r.row.classList.toggle('broke-o', !!broken[k] && broken[k] !== this.mine);
      }
      if (String(k === here ? 1 : 0) !== h0) r.row.classList.toggle('here', k === here);
    }
  }

  /**
   * 51.0: each lane's objective: who holds it, ALPHA's meter (-1 … 1), who is taking it. Shown from his
   * side: his team's colour or the other's, the fill his team's share; a point of his being taken
   * pulses red, one his team is taking glows. Null: no objectives (the flags hidden).
   */
  setObjectives(list: readonly { owner: TeamId | null; meter: number; capturing: TeamId | null; contested: boolean }[] | null) {
    this.vs.classList.toggle('objectives', !!list);
    if (!list) return;
    const mine = (t: TeamId | null) => (t === null ? '' : t === this.mine ? 'a' : 'o');
    for (let k = 0; k < this.frontRows.length; k++) {
      const r = this.frontRows[k], o = list[k];
      if (!o) continue;
      const m = this.mine === 'alpha' ? o.meter : -o.meter;
      const key = `${mine(o.owner)}|${Math.round(m * 20)}|${mine(o.capturing)}|${o.contested ? 1 : 0}`;
      if (key === r.okey) continue;
      r.okey = key;
      r.flag.classList.toggle('a', o.owner === this.mine);
      r.flag.classList.toggle('o', !!o.owner && o.owner !== this.mine);
      r.fill.className = m >= 0 ? 'a' : 'o';
      r.fill.style.transform = `scaleY(${Math.abs(m).toFixed(2)})`;
      r.row.classList.toggle('losing', o.owner === this.mine && !!o.capturing && o.capturing !== this.mine);
      r.row.classList.toggle('taking', o.capturing === this.mine && o.owner !== this.mine);
      r.row.classList.toggle('contested', o.contested);
    }
  }

  /**
   * 51.0: the alarm: `ours` his team has two of the three (the other bleeds three times as fast),
   * `theirs` the other has (his tickets drain; his team's last line: instant respawn), null none.
   */
  setAlarm(kind: 'ours' | 'theirs' | null) {
    if (kind === this.alarmKey) return;
    this.alarmKey = kind ?? '';
    this.alarm.classList.toggle('hidden', !kind);
    this.alarm.classList.toggle('theirs', kind === 'theirs');
    if (!kind) return;
    this.alarmBig.data = kind === 'ours' ? 'DOUBLE BREAKTHROUGH' : 'TWO FLANKS LOST';
    this.alarmSmall.data = kind === 'ours' ? 'THEIR TICKETS DRAIN ×3' : 'TICKETS DRAINING ×3 · LAST LINE: INSTANT RESPAWN, ALL ZONES';
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
      // 51.0: the lane's objective: a flag in its holder's colour, filling with the meter.
      const flag = el('b', 'flag'), fill = el('i');
      flag.appendChild(fill);
      row.append(flag, lbl, track);
      this.vs.appendChild(row);
      a.style.transform = o.style.transform = 'scaleX(0.5)';
      this.frontRows.push({ row, a, o, name, key: '50|hold||0', flag, fill, okey: '' });
    }
  }

  /** 46.0: the compass's front markers by lane name (null: no fronts this match, the compass alone). */
  setCompassFronts(names: readonly string[] | null) {
    for (const f of this.frontMarks) f.el.remove();
    this.frontMarks = [];
    this.compass.classList.remove('hidden');
    for (const n of names ?? []) {
      const m = el('div', 'front-mark');
      const base = n.split(/[\s(]/)[0].toUpperCase();
      const nm = document.createTextNode(base);
      const d = document.createTextNode('');
      const b = el('span');
      b.appendChild(nm);
      const i = el('i');
      i.appendChild(d);
      m.append(b, i);
      this.compass.appendChild(m);
      this.frontMarks.push({ el: m, name: nm, base, dist: d, x: NaN, o: NaN, key: '' });
    }
  }

  /**
   * 46.0: the compass for a player at (px, pz) facing `heading` (radians clockwise from north, -z),
   * and the fronts' marks (world x, z; who pushes there), `here` his own lane (-1: none).
   */
  updateCompass(heading: number, px: number, pz: number, marks: readonly { x: number; z: number; push: 'alpha' | 'omega' | null; label?: string; alert?: boolean }[], here: number) {
    const DEG = 180 / Math.PI, SPAN = 75, K = 0.2;
    const hd = ((heading * DEG) % 360 + 360) % 360;
    // The ticks: a band of 15° ticks under the letters, moved by the heading modulo a tick.
    const bx = -((hd * K) % 3);
    // (A first write from NaN: a comparison with NaN is false, so `!(… <= …)`.)
    if (!(Math.abs(bx - this.compassBandX) <= 0.01)) {
      this.compassBandX = bx;
      this.compassBand.style.transform = `translateX(${bx.toFixed(2)}rem)`;
    }
    const place = (m: { el: HTMLElement; x: number; o: number; y?: number; want?: number }, bearing: number, pin: boolean, row = false) => {
      let rel = bearing - hd;
      rel = ((rel + 540) % 360) - 180;
      const off = Math.abs(rel) > SPAN;
      if (off && !pin) {
        if (m.o !== 0) m.el.style.opacity = '0';
        m.o = 0;
        return;
      }
      // (Pinned a little inside the edge, clear of the compass's fade.)
      const x = (off ? Math.sign(rel) * (SPAN - 8) : rel) * K;
      const o = off ? 0.55 : 1;
      if (row) {
        // The fronts: placed after (laid out in rows below).
        m.want = x;
        if (o !== m.o) {
          m.o = o;
          m.el.style.opacity = String(o);
        }
        return;
      }
      if (!(Math.abs(x - m.x) <= 0.02)) {
        m.x = x;
        m.el.style.transform = `translateX(calc(${x.toFixed(2)}rem - 50%))`;
      }
      if (o !== m.o) {
        m.o = o;
        m.el.style.opacity = String(o);
      }
    };
    this.compassMarks.forEach((m, i) => place(m, i * 45, false));
    this.frontMarks.forEach((f, k) => {
      const mk = marks[k];
      if (!mk) return;
      const dx = mk.x - px, dz = mk.z - pz;
      place(f, Math.atan2(dx, -dz) * DEG, true, true);
      const d = Math.round(Math.hypot(dx, dz) / 5) * 5;
      const key = `${d}|${mk.push ?? ''}|${k === here ? 1 : 0}|${mk.label ?? ''}|${mk.alert ? 1 : 0}`;
      if (key === f.key) return;
      const [d0, p0, h0, l0, a0] = f.key.split('|');
      f.key = key;
      if (String(d) !== d0) f.dist.data = `${d}M`;
      // 51.0: "DEFEND WEST" while his team's point there is being taken (and back to the lane's name).
      if ((mk.label ?? '') !== (l0 ?? '')) f.name.data = mk.label ?? f.base;
      if (String(mk.alert ? 1 : 0) !== a0) f.el.classList.toggle('alert', !!mk.alert);
      if ((mk.push ?? '') !== p0) {
        f.el.classList.toggle('a', !!mk.push && mk.push === this.mine);
        f.el.classList.toggle('o', !!mk.push && mk.push !== this.mine);
      }
      if (String(k === here ? 1 : 0) !== h0) f.el.classList.toggle('here', k === here);
    });
    // Two markers closer than a label's width go on two rows (left to right), not on top of each other.
    const order = this.frontMarks.filter((f) => f.want !== undefined && f.o > 0).sort((a, b) => a.want! - b.want!);
    const rowEnd = [-Infinity, -Infinity];
    for (const f of order) {
      const row = f.want! - rowEnd[0] >= 6.2 ? 0 : f.want! - rowEnd[1] >= 6.2 ? 1 : 0;
      rowEnd[row] = f.want!;
      const y = row * 1.25;
      if (!(Math.abs(f.want! - f.x) <= 0.02) || f.y !== y) {
        f.x = f.want!;
        f.y = y;
        f.el.style.transform = `translate(calc(${f.x.toFixed(2)}rem - 50%), ${y}rem)`;
      }
    }
  }

  /**
   * 58.0: the point he stands on, on the screen (it showed on the minimap alone): its name and what is
   * happening (his team taking it, losing it, contested, held), and its meter from his side (his blue
   * filling right, theirs red filling left). Null: he is on none.
   */
  setCapture(v: { name: string; m: number; state: 'taking' | 'losing' | 'contested' | 'held' | 'theirs' | 'neutral' } | null) {
    const key = v ? `${v.name}|${v.state}|${Math.round(v.m * 40)}` : '';
    if (key === this.captureKey) return;
    this.captureKey = key;
    this.capture.classList.toggle('hidden', !v);
    if (!v) {
      this.capture.className = 'tdm-capture hidden';
      return;
    }
    const words = { taking: 'CAPTURING', losing: 'LOSING', contested: 'CONTESTED', held: 'HOLDING', theirs: 'ENEMY POINT', neutral: 'NEUTRAL' } as const;
    this.captureLabel.data = `${words[v.state]} · ${v.name}`;
    this.capture.className = `tdm-capture ${v.state}`;
    this.captureFill.className = v.m >= 0 ? '' : 'o';
    this.captureFill.style.transform = `scaleX(${Math.min(1, Math.abs(v.m)).toFixed(3)})`;
  }
  private capture = el('div', 'tdm-capture hidden');
  private captureLabel = document.createTextNode('');
  private captureFill = document.createElement('i');
  private captureKey = '';

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
    this.setAlarm(null);
    this.setCapture(null);
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
