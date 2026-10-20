const JP_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function jpNumber(n: number): string {
  if (n <= 10) return JP_NUM[n];
  if (n < 20) return '十' + JP_NUM[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return JP_NUM[t] + '十' + (o ? JP_NUM[o] : '');
}

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
    this.health.append(el('div', 'label', 'VITAL<span class="jp">生命</span>'), bar, this.healthVal);

    const pipWrap = el('div', 'pips');
    for (let i = 0; i < 12; i++) {
      const p = el('div', 'pip');
      this.pips.push(p);
      pipWrap.appendChild(p);
    }
    const val = el('div', 'val');
    val.append(this.ammoCur, el('span', 'max', '/ ∞'));
    this.ammo.append(val, pipWrap, this.reloadEl, el('div', 'label', 'KITSUNE-9<span class="jp">狐</span>'));

    const wave = el('div', 'panel wave');
    const wl = el('div', 'label', 'WAVE');
    const row = el('div');
    row.append(this.waveNum, this.waveJp);
    wave.append(wl, row, this.remain);

    this.clockEl.innerHTML = 'SHINJUKU-KU · <b>02:47</b>';
    this.root.append(this.cross, this.hit, this.dmg, this.feed, this.health, this.ammo, wave, this.clockEl);

    this.banner.id = 'banner';
    this.title.id = 'title';
    this.title.innerHTML = `
      <h1>NEON RAIN</h1>
      <div class="sub">ONE NIGHT · ONE CITY · ONE WAY OUT</div>
      <div class="jp">東京 · 午前零時二十四分</div>
      <div class="loading">BUILDING THE CITY…</div>
      <div class="mainmenu hidden">
        <button class="pm-btn primary" data-mode="story">STORY ESCAPE<span class="jp">脱出</span></button>
        <button class="pm-btn" data-mode="arcade">ARCADE SURVIVAL<span class="jp">生存</span></button>
        <button class="pm-btn" data-act="settings">SETTINGS<span class="jp">設定</span></button>
        <button class="pm-btn" data-act="controls">CONTROLS<span class="jp">操作</span></button>
      </div>
      <div class="controlsPanel hidden">
        <div class="cp-grid">
          <b>W A S D</b><span>MOVE</span><b>MOUSE</b><span>LOOK</span>
          <b>LMB</b><span>FIRE (WEAPON DRAWN)</span><b>R</b><span>RELOAD</span>
          <b>X</b><span>HOLSTER / DRAW</span><b>E</b><span>INTERACT (HOLD FOR SOME)</span>
          <b>SHIFT</b><span>SPRINT</span><b>SPACE</b><span>JUMP · VAULT LOW RAILINGS</span>
          <b>TAB</b><span>OBJECTIVE OVERVIEW (HOLD)</span><b>ESC</b><span>PAUSE · SETTINGS</span>
        </div>
        <div class="cp-notes">A drawn weapon gets you noticed by security and civilians. Break line of sight to lose a pursuit; they search the last place they saw you.</div>
        <button class="pm-btn" data-act="back">BACK<span class="jp">戻る</span></button>
      </div>
      <div class="controls">HEADPHONES RECOMMENDED</div>`;
    this.pause.id = 'pause';
    this.pause.innerHTML = '<div class="big">PAUSED</div><div class="hint">CLICK TO RESUME</div>';
    this.death.id = 'death';
    this.cine.id = 'cine';
    this.cine.innerHTML = `<div class="t1">NEON RAIN</div><div class="t2">東京 · 午前 2:47</div>
      <div class="t3">新宿区 歌舞伎町 — KABUKICHO, SHINJUKU<br/>RAINFALL 38MM/H · VISIBILITY LOW</div>`;
    this.skip.id = 'skip';
    this.zone.id = 'zone';
    parent.append(this.root, this.banner, this.cine, this.skip, this.zone, this.title, this.pause, this.death);
  }

  setReady() {
    this.title.querySelector('.loading')?.remove();
    this.title.querySelector('.mainmenu')!.classList.remove('hidden');
  }

  /** Main menu: show the controls page or the buttons. */
  showControls(on: boolean) {
    this.title.querySelector('.mainmenu')!.classList.toggle('hidden', on);
    this.title.querySelector('.controlsPanel')!.classList.toggle('hidden', !on);
  }

  show(e: HTMLElement, on: boolean) {
    e.classList.toggle('hidden', !on);
  }

  setHealth(h: number, max: number) {
    const n = Math.ceil((h / max) * this.segs.length);
    this.segs.forEach((s, i) => s.classList.toggle('on', i < n));
    this.health.classList.toggle('low', h / max < 0.3);
    this.healthVal.textContent = String(Math.ceil(h)).padStart(3, '0');
  }

  setAmmo(a: number, reloading: boolean) {
    this.ammoCur.textContent = reloading ? '--' : String(a).padStart(2, '0');
    this.pips.forEach((p, i) => p.classList.toggle('off', i >= a));
    this.ammo.classList.toggle('low', a <= 3 && !reloading);
    this.reloadEl.textContent = reloading ? 'RELOADING' : a === 0 ? 'PRESS R' : '';
  }

  /** The ammo panel only while the weapon is out. */
  setArmed(on: boolean) {
    this.ammo.classList.toggle('stowed', !on);
  }

  setWave(n: number, remaining: number, breakTime = false) {
    this.waveNum.textContent = String(n).padStart(2, '0');
    this.waveJp.textContent = `第${jpNumber(n)}波`;
    this.remain.textContent = breakTime ? 'CLEAR · 小休止' : `${remaining} HOSTILE${remaining === 1 ? '' : 'S'}`;
  }

  setSpread(px: number) {
    const [t, b, l, r] = Array.from(this.cross.querySelectorAll('i'));
    t.style.transform = `translateY(${-px}px)`;
    b.style.transform = `translateY(${px}px)`;
    l.style.transform = `translateX(${-px}px)`;
    r.style.transform = `translateX(${px}px)`;
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

  /** Opening title card per mode. */
  setCine(mode: 'story' | 'arcade') {
    this.cine.innerHTML =
      mode === 'story'
        ? `<div class="t1">NEON RAIN</div><div class="t2">ONE NIGHT · ONE CITY · ONE WAY OUT</div>
      <div class="t3">新宿区 三丁目 — SANCHŌME, SHINJUKU · 00:24<br/>SECURITY LOCKDOWN IN EFFECT · YOU ARE WANTED</div>`
        : `<div class="t1">NEON RAIN</div><div class="t2">東京 · 午前 2:47</div>
      <div class="t3">ARCADE SURVIVAL · ONE STREET. ONE GUN.<br/>RAINFALL 38MM/H · VISIBILITY LOW</div>`;
  }

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
      <div class="hint" style="animation:none;margin-top:10px;font-family:var(--jp)">02:47 · 雨は止まない</div>
      <div class="stats">
        <span>WAVE</span><span>${String(s.wave).padStart(2, '0')}</span>
        <span>NEUTRALIZED</span><span>${s.kills}</span>
        <span>ACCURACY</span><span>${Math.round(s.accuracy * 100)}%</span>
        <span>SURVIVED</span><span>${mm}:${String(ss).padStart(2, '0')}</span>
      </div>
      ${s.story ? '<div class="hint">CLICK TO RETRY FROM THE CHECKPOINT</div><button class="pm-btn death-full" data-act="full">RESTART STORY</button>' : '<div class="hint">CLICK TO RISE AGAIN</div>'}`;
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
