import type { LevelInfo, SettingId } from '../levels/Level';
import { MODE_LABEL, MODE_ORDER, canDeploy, mapsFor, type MenuState } from './MenuFlow';
import { NAME_MAX } from '../gameplay/PlayerName';
import { ARMORY, ARMORY_ORDER, type WeaponId } from '../entities/weapons/armory';
import { nextMapsHtml } from './TdmHud';
import { mapCardHtml } from './MapCard';

import { fl, flSpan, flWave, prewarmFlavor } from './Flavor';

export { jpNumber } from './jpNumber';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface DeathStats {
  title?: string;
  /** Story mode: retry from checkpoint / restart story. */
  story?: boolean;
  wave: number;
  kills: number;
  accuracy: number;
  time: number;
  /** 13.0: survival's next-map choice (every map with the mode, this one first). */
  next?: { info: LevelInfo; again: boolean }[];
}

/** Minimal DOM HUD: thin lines, muted cyan, nothing that competes with the scene. */
export class Hud {
  root = el('div', 'layer hidden');
  private segs: HTMLElement[] = [];
  private pips: HTMLElement[] = [];
  private health = el('div', 'panel health');
  private healthVal = el('div', 'val');
  private ammo = el('div', 'panel ammo');
  private ammoCur = el('span', 'cur');
  private reloadEl = el('div', 'reload');
  private waveNum = el('span', 'num');
  private waveJp = el('span', 'jp');
  private remain = el('div', 'remain');
  private cross = el('div', 'crosshair', '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><div class="dot"></div>');
  private hit = el('div', 'hitmarker');
  private dmg = el('div', 'dmgdir');
  private feed = el('div', 'killfeed', '<span class="diamond"></span>NEUTRALIZED');
  private clockEl = el('div', 'clock');
  /** 13.0: the player's name over the vitals (and his team in TDM). */
  private callsign = el('div', 'callsign');
  /** 13.0: the name field on the main menu. */
  nameInput!: HTMLInputElement;
  private levels: LevelInfo[] = [];
  private menuState: MenuState = { screen: 'root', mode: null, map: null };
  private loaded: LevelInfo | null = null;
  private loadingLevel = true;
  banner = el('div', 'layer');
  title = el('div', 'layer screen');
  pause = el('div', 'layer screen hidden');
  death = el('div', 'layer screen hidden');
  cine = el('div', 'layer');
  skip = el('div', 'layer', 'PRESS ANY KEY TO SKIP');
  zone = el('div', 'layer');
  private zoneT = 0;
  private hitT = 0;
  private feedT = 0;
  private dmgT = 0;
  private bannerTimer = 0;

  constructor(parent: HTMLElement) {
    this.root.id = 'hud';
    for (let i = 0; i < 20; i++) {
      const s = el('div', 'seg on');
      this.segs.push(s);
    }
    const bar = el('div', 'bar');
    this.segs.forEach((s) => bar.appendChild(s));
    this.health.append(el('div', 'label', `VITAL${flSpan('vital')}`), bar, this.healthVal);

    const val = el('div', 'val');
    val.append(this.ammoCur, el('span', 'max', '/ ∞'));
    this.ammo.append(val, this.pipWrap, this.reloadEl, this.weaponLabel);
    this.setWeapon('KITSUNE-9', fl('smg'), 12, 3);

    const wave = el('div', 'panel wave');
    const wl = el('div', 'label', 'WAVE');
    const row = el('div');
    row.append(this.waveNum, this.waveJp);
    wave.append(wl, row, this.remain);

    this.clockEl.innerHTML = 'SHINJUKU-KU · <b>02:47</b>';
    this.stam.appendChild(this.stamFill);
    this.root.append(this.cross, this.stam, this.hit, this.dmg, this.feed, this.callsign, this.health, this.ammo, wave, this.clockEl);

    this.banner.id = 'banner';
    this.title.id = 'title';
    this.title.innerHTML = `
      <h1>GRIDFALL</h1>
      <div class="sub"></div>
      <div class="jp"></div>
      <div class="loading">BUILDING THE CITY…</div>
      <div class="mainmenu hidden">
        <div class="mm-screen" data-screen="root">
          <div class="mm-label">CALLSIGN ${flSpan('callsign')}</div>
          <input class="mm-name" type="text" maxlength="${NAME_MAX}" spellcheck="false" autocomplete="off" aria-label="Player name" />
          <div class="mm-label">MODE ${flSpan('mode')}</div>
          <div class="mm-modes"></div>
          <div class="mm-label">ARMORY ${flSpan('armory')}</div>
          <div class="mm-armory"></div>
          <button class="pm-btn" data-act="settings">SETTINGS${flSpan('settings')}</button>
          <button class="pm-btn" data-act="controls">CONTROLS${flSpan('controls')}</button>
        </div>
        <div class="mm-screen hidden" data-screen="maps">
          <div class="mm-label mm-mode-title"></div>
          <div class="settings-row map-grid"></div>
          <div class="mm-note"></div>
          <div class="mm-actions">
            <button class="pm-btn" data-act="back">BACK${flSpan('back')}</button>
            <button class="pm-btn primary" data-act="deploy">DEPLOY${flSpan('deploy')}</button>
          </div>
        </div>
      </div>
      <div class="controlsPanel hidden">
        <div class="cp-grid">
          <b>W A S D</b><span>MOVE</span><b>MOUSE</b><span>LOOK</span>
          <b>LMB</b><span>FIRE (WEAPON DRAWN)</span><b>R</b><span>RELOAD</span>
          <b>RMB</b><span>AIM DOWN SIGHTS (HOLD)</span><b>C</b><span>CROUCH (TAP · HOLD) · SPRINTING: SLIDE</span>
          <b>X</b><span>HOLSTER / DRAW</span><b>E</b><span>INTERACT (HOLD FOR SOME)</span>
          <b>SHIFT</b><span>SPRINT</span><b>SPACE</b><span>JUMP · VAULT LOW RAILINGS</span>
          <b>TAB</b><span>OBJECTIVE OVERVIEW (HOLD)</span><b>ESC</b><span>PAUSE · SETTINGS</span>
        </div>
        <div class="cp-notes">A drawn weapon gets you noticed by security and civilians. Break line of sight to lose a pursuit; they search the last place they saw you.</div>
        <button class="pm-btn" data-act="back">BACK${flSpan('back')}</button>
      </div>
      <div class="controls">HEADPHONES RECOMMENDED</div>`;
    this.pause.id = 'pause';
    this.pause.innerHTML = '<div class="big">PAUSED</div><div class="hint">CLICK TO RESUME</div>';
    this.death.id = 'death';
    this.cine.id = 'cine';
    this.cine.innerHTML = `<div class="t1">GRIDFALL</div><div class="t2">東京 · 午前 2:47</div>
      <div class="t3">新宿区 歌舞伎町 — KABUKICHO, SHINJUKU<br/>RAINFALL 38MM/H · VISIBILITY LOW</div>`;
    this.skip.id = 'skip';
    this.zone.id = 'zone';
    parent.append(this.root, this.banner, this.cine, this.skip, this.zone, this.title, this.pause, this.death);
    prewarmFlavor(parent);
  }

  setReady() {
    this.title.querySelector('.loading')?.remove();
    this.title.querySelector('.mainmenu')!.classList.remove('hidden');
    // 24.0: the logo's glitch, a one-shot every 7 s while the title is shown (no endless CSS loop).
    window.setInterval(() => {
      const h = this.title.querySelector('h1');
      if (!h || this.title.classList.contains('hidden') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      h.classList.remove('logo-glitch');
      void h.offsetWidth;
      h.classList.add('logo-glitch');
    }, 7000);
  }

  /** 13.0: the levels the menu offers (registry order), and the mode buttons with their map counts. */
  setLevels(levels: LevelInfo[]) {
    this.levels = levels;
    this.nameInput = this.title.querySelector<HTMLInputElement>('.mm-name')!;
    this.title.querySelector('.mm-modes')!.innerHTML = MODE_ORDER.filter((m) => mapsFor(m, levels).length)
      .map((m) => {
        const L = MODE_LABEL[m], n = mapsFor(m, levels).length;
        return `<button class="pm-btn mm-mode${m === 'tdm' ? ' primary' : ''}" data-mode="${m}">${L.name}${flSpan(L.fl)}<span class="mm-line">${L.line} · ${n} MAP${n === 1 ? '' : 'S'}</span></button>`;
      })
      .join('');
  }

  /**
   * The level built behind the menu: its lines under the title. While `loading`, DEPLOY waits for it
   * to finish building.
   */
  selectLevel(l: LevelInfo, loading: boolean) {
    this.loaded = l;
    this.loadingLevel = loading;
    this.title.querySelector('.sub')!.textContent = l.tagline;
    this.title.querySelector('.jp')!.textContent = l.jpLine;
    this.renderMenu(this.menuState);
  }

  /**
   * 13.0: draw a menu state (MenuFlow): the root (name, modes), the maps of the picked mode (cards,
   * the picked one lit; DEPLOY once it is built), or the controls page.
   */
  renderMenu(st: MenuState) {
    if (st.screen !== this.menuState.screen) this.glitch();
    this.menuState = st;
    const t = this.title;
    t.dataset.screen = st.screen;
    t.querySelector('.mainmenu [data-screen="root"]')!.classList.toggle('hidden', st.screen !== 'root');
    t.querySelector('.mainmenu [data-screen="maps"]')!.classList.toggle('hidden', st.screen !== 'maps');
    t.querySelector('.controlsPanel')!.classList.toggle('hidden', st.screen !== 'controls');
    t.querySelector('.mainmenu')!.classList.toggle('on-controls', st.screen === 'controls');
    if (st.screen !== 'maps' || !st.mode) return;
    const L = MODE_LABEL[st.mode];
    t.querySelector('.mm-mode-title')!.innerHTML = `${L.name} · MAP ${flSpan(L.fl)}`;
    const row = t.querySelector('.settings-row')!;
    const maps = mapsFor(st.mode, this.levels);
    const key = maps.map((m) => m.id).join(',');
    if (row.getAttribute('data-for') !== key) {
      row.setAttribute('data-for', key);
      // 24.0: the map cards (MapCard.ts), a grid.
      row.innerHTML = maps.map((l) => mapCardHtml(l, { data: 'setting' })).join('');
    }
    for (const b of Array.from(row.querySelectorAll<HTMLElement>('[data-setting]'))) b.classList.toggle('on', b.dataset.setting === st.map);
    const loaded = (this.loaded?.id ?? 'tokyo') as SettingId;
    const busy = this.loadingLevel || st.map !== loaded;
    const deploy = t.querySelector<HTMLButtonElement>('[data-act="deploy"]')!;
    deploy.disabled = !canDeploy(st, this.levels, loaded, this.loadingLevel);
    const note = t.querySelector<HTMLElement>('.mm-note')!;
    const picked = this.levels.find((l) => l.id === st.map);
    note.textContent = busy ? (picked?.loading ?? '') : '';
    note.classList.toggle('busy', busy);
  }

  /** 16.0: the screen change's glitch (the stylesheet's `glitching` keyframes) and its sound. */
  onGlitch: (() => void) | null = null;
  private glitchTimer = 0;

  private glitch() {
    const m = this.title;
    m.classList.remove('glitching');
    void m.offsetWidth;
    m.classList.add('glitching');
    clearTimeout(this.glitchTimer);
    this.glitchTimer = window.setTimeout(() => m.classList.remove('glitching'), 420);
    this.onGlitch?.();
  }

  /** 16.0: the root menu's armory row (the gun on the stage's crate is the one lit). */
  setArmory(current: WeaponId) {
    const row = this.title.querySelector<HTMLElement>('.mm-armory')!;
    if (!row.childElementCount) {
      row.innerHTML = ARMORY_ORDER.map((id) => {
        const a = ARMORY[id];
        return `<button class="mm-gun" data-gun="${id}"><kbd>${a.key}</kbd><b>${a.spec.name}</b>${flSpan(id)}<em>${a.kind}</em></button>`;
      }).join('') + '<div class="mm-gun-line"></div>';
    }
    for (const b of Array.from(row.querySelectorAll<HTMLElement>('[data-gun]'))) b.classList.toggle('on', b.dataset.gun === current);
    row.querySelector('.mm-gun-line')!.textContent = ARMORY[current].blurb;
  }

  /** 13.0: the player's name on the HUD (with his team in Team Deathmatch). */
  setCallsign(name: string, team: string | null) {
    this.callsign.innerHTML = `${name}${team ? `<span>${team}</span>` : ''}`;
  }

  show(e: HTMLElement, on: boolean) {
    e.classList.toggle('hidden', !on);
  }

  /**
   * 30.0: the stamina bar under the crosshair: a fill scaled on X (composited, no layout), shown while
   * the pool isn't full, red once it ran dry. Written only when the value moves by 0.5% or a state flips.
   */
  private stam = el('div', 'stamina full');
  private stamFill = el('i');
  private stamLast = { k: -1, full: true, dry: false };
  setStamina(frac: number, exhausted: boolean) {
    const k = Math.round(frac * 200);
    const full = k >= 200 && !exhausted;
    const L = this.stamLast;
    if (k !== L.k) this.stamFill.style.transform = `scaleX(${(k / 200).toFixed(3)})`;
    if (full !== L.full) this.stam.classList.toggle('full', full);
    if (exhausted !== L.dry) this.stam.classList.toggle('dry', exhausted);
    L.k = k;
    L.full = full;
    L.dry = exhausted;
  }

  setHealth(h: number, max: number) {
    const n = Math.ceil((h / max) * this.segs.length);
    this.segs.forEach((s, i) => s.classList.toggle('on', i < n));
    this.health.classList.toggle('low', h / max < 0.3);
    this.healthVal.textContent = String(Math.ceil(h)).padStart(3, '0');
  }

  private pipWrap = el('div', 'pips');
  private weaponLabel = el('div', 'label');
  private lowAmmo = 3;

  /** The weapon of the loaded level: its name and one pip per round (smaller pips for big magazines). */
  setWeapon(name: string, jp: string, mag: number, low: number) {
    this.weaponLabel.innerHTML = `${name}<span class="jp">${jp}</span>`;
    this.lowAmmo = low;
    this.pipWrap.innerHTML = '';
    this.pips = [];
    this.pipWrap.classList.toggle('many', mag > 16);
    for (let i = 0; i < mag; i++) {
      const p = el('div', 'pip');
      this.pips.push(p);
      this.pipWrap.appendChild(p);
    }
  }

  setAmmo(a: number, reloading: boolean) {
    this.ammoCur.textContent = reloading ? '--' : String(a).padStart(2, '0');
    this.pips.forEach((p, i) => p.classList.toggle('off', i >= a));
    this.ammo.classList.toggle('low', a <= this.lowAmmo && !reloading);
    this.reloadEl.textContent = reloading ? 'RELOADING' : a === 0 ? 'PRESS R' : '';
  }

  /** The ammo panel only while the weapon is out. */
  setArmed(on: boolean) {
    this.ammo.classList.toggle('stowed', !on);
  }

  setWave(n: number, remaining: number, breakTime = false) {
    // Per frame from the modes: touch the DOM only when the text changes.
    const num = String(n).padStart(2, '0');
    const jp = flWave(n);
    const rem = breakTime ? `CLEAR · ${fl('waveBreak')}` : `${remaining} HOSTILE${remaining === 1 ? '' : 'S'}`;
    if (this.waveNum.textContent !== num) this.waveNum.textContent = num;
    if (this.waveJp.textContent !== jp) this.waveJp.textContent = jp;
    if (this.remain.textContent !== rem) this.remain.textContent = rem;
  }

  setSpread(px: number) {
    const [t, b, l, r] = Array.from(this.cross.querySelectorAll('i'));
    t.style.transform = `translateY(${-px}px)`;
    b.style.transform = `translateY(${px}px)`;
    l.style.transform = `translateX(${-px}px)`;
    r.style.transform = `translateX(${px}px)`;
  }

  /** 11.0: the crosshair fades as the sights come up (0 hip … 1 aimed). */
  setAim(ads: number) {
    // A variable on the lines, not the element's opacity: the holstered dimming (CSS) multiplies with it.
    const o = ads.toFixed(2);
    if (this.cross.style.getPropertyValue('--aim') !== o) this.cross.style.setProperty('--aim', o);
  }

  hitmarker(kill: boolean) {
    this.hit.classList.toggle('kill', kill);
    this.hitT = kill ? 0.35 : 0.18;
    if (kill) this.feedT = 1.2;
  }

  damage(angle: number) {
    this.dmg.style.transform = `rotate(${angle}rad)`;
    this.dmgT = 1;
  }

  bannerShow(big: string, jp: string, dur = 2.6) {
    this.banner.innerHTML = `<div class="big">${big}</div><div class="jp">${jp}</div><div class="line"></div>`;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = dur;
  }

  /** Opening title card (from the level, per mode). */
  setCine(card: { t1: string; t2: string; t3: string }) {
    this.cine.innerHTML = `<div class="t1">${card.t1}</div><div class="t2">${card.t2}</div>
      <div class="t3">${card.t3}</div>`;
  }

  /** HUD corner: where and when (the story replaces the time as the clock runs). */
  setPlace(place: string, clock: string) {
    this.placeClock = clock;
    this.clockEl.innerHTML = `${place} · <b>${clock}</b>`;
  }

  private placeClock = '02:47';

  setClock(t: string) {
    const b = this.clockEl.querySelector('b');
    if (b && b.textContent !== t) b.textContent = t;
  }

  /** Small location card when entering a new area. */
  zoneShow(name: string, jp: string) {
    this.zone.innerHTML = `<div class="box"><span class="en">${name}</span><span class="jp">${jp}</span></div>`;
    this.zone.classList.add('show');
    this.zoneT = 2.6;
  }

  showDeath(s: DeathStats) {
    const mm = Math.floor(s.time / 60);
    const ss = Math.floor(s.time % 60);
    this.death.innerHTML = `<div class="big">${s.title ?? 'FLATLINED'}</div>
      <div class="hint" style="animation:none;margin-top:10px;font-family:var(--jp)">${this.placeClock} · ${fl('flatline')}</div>
      <div class="stats">
        <span>WAVE</span><span>${String(s.wave).padStart(2, '0')}</span>
        <span>NEUTRALIZED</span><span>${s.kills}</span>
        <span>ACCURACY</span><span>${Math.round(s.accuracy * 100)}%</span>
        <span>SURVIVED</span><span>${mm}:${String(ss).padStart(2, '0')}</span>
      </div>
      ${s.story ? '<div class="hint">CLICK TO RETRY FROM THE CHECKPOINT</div><button class="pm-btn death-full" data-act="full">RESTART STORY</button>' : '<div class="hint">CLICK TO RISE AGAIN</div>'}
      ${s.next ? nextMapsHtml(s.next) : ''}`;
    this.show(this.death, true);
  }

  update(dt: number) {
    this.hitT = Math.max(0, this.hitT - dt);
    this.hit.style.opacity = String(Math.min(1, this.hitT * 6));
    this.hit.style.transform = `rotate(45deg) scale(${0.8 + this.hitT})`;
    this.feedT = Math.max(0, this.feedT - dt);
    this.feed.style.opacity = String(Math.min(1, this.feedT * 3));
    this.dmgT = Math.max(0, this.dmgT - dt * 0.9);
    this.dmg.style.opacity = String(this.dmgT);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.zoneT > 0) {
      this.zoneT -= dt;
      if (this.zoneT <= 0) this.zone.classList.remove('show');
    }
  }
}
