import type { Settings } from './Settings';

type SliderKey = 'master' | 'music' | 'sfx';

/**
 * Esc menu in the HUD's visual language: resume, restart, three volume sliders and mute.
 * Clicks never leak to the game (no accidental shots, no intro skip).
 */
export class PauseMenu {
  root = document.createElement('div');
  onResume: () => void = () => {};
  onRestart: () => void = () => {};
  onChange: (s: Settings) => void = () => {};
  private hint: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private sliders = {} as Record<SliderKey, { input: HTMLInputElement; val: HTMLElement }>;
  private restartArmed = false;
  /** 'settings': opened from the main menu (no restart; RESUME reads BACK). */
  mode: 'pause' | 'settings' = 'pause';

  constructor(parent: HTMLElement, private settings: Settings) {
    this.root.id = 'pausemenu';
    this.root.className = 'layer hidden';
    this.root.innerHTML = `
      <div class="pm-panel">
        <div class="pm-title">PAUSED<span class="jp">一時停止</span></div>
        <button class="pm-btn primary" data-act="resume">RESUME<span class="jp">再開</span></button>
        <div class="pm-hint"></div>
        <button class="pm-btn" data-act="restart">RESTART<span class="jp">最初から</span></button>
        <div class="pm-sep"><span>AUDIO</span><span class="jp">音量</span></div>
        ${(['master', 'music', 'sfx'] as SliderKey[])
          .map(
            (k) => `<label class="pm-slider"><span class="name">${k.toUpperCase()}</span>
              <input type="range" min="0" max="100" step="1" data-key="${k}" />
              <span class="val"></span></label>`,
          )
          .join('')}
        <button class="pm-btn toggle" data-act="mute"></button>
        <div class="pm-foot">SETTINGS ARE SAVED · 設定は保存されます</div>
      </div>`;
    parent.appendChild(this.root);
    this.hint = this.root.querySelector('.pm-hint')!;
    this.muteBtn = this.root.querySelector('[data-act="mute"]')!;
    for (const input of Array.from(this.root.querySelectorAll<HTMLInputElement>('input[type=range]'))) {
      const k = input.dataset.key as SliderKey;
      this.sliders[k] = { input, val: input.parentElement!.querySelector('.val')! };
      input.addEventListener('input', () => {
        this.settings[k] = Number(input.value);
        this.sync();
        this.onChange(this.settings);
      });
    }
    // Keep every pointer event inside the menu.
    for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown']) this.root.addEventListener(ev, (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'resume') {
        if (this.mode === 'settings') {
          this.show(false);
          return;
        }
        this.setHint('LOCKING POINTER…');
        this.onResume();
      } else if (act === 'restart') {
        // Two-step restart avoids losing a run to a stray click.
        if (!this.restartArmed) {
          this.restartArmed = true;
          this.root.querySelector('[data-act="restart"]')!.innerHTML = 'CONFIRM RESTART<span class="jp">確認</span>';
          return;
        }
        this.onRestart();
      } else if (act === 'mute') {
        this.settings.muted = !this.settings.muted;
        this.sync();
        this.onChange(this.settings);
      }
    });
    this.sync();
  }

  private sync() {
    for (const k of ['master', 'music', 'sfx'] as SliderKey[]) {
      const s = this.sliders[k];
      s.input.value = String(this.settings[k]);
      s.val.textContent = String(this.settings[k]).padStart(3, '0');
      s.input.style.setProperty('--fill', `${this.settings[k]}%`);
    }
    this.muteBtn.innerHTML = this.settings.muted ? 'SOUND: <b>MUTED</b><span class="jp">消音</span>' : 'SOUND: <b>ON</b><span class="jp">音あり</span>';
    this.muteBtn.classList.toggle('on', this.settings.muted);
  }

  setHint(text: string) {
    this.hint.textContent = text;
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }

  show(on: boolean, mode: 'pause' | 'settings' = 'pause') {
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.mode = mode;
      const settings = mode === 'settings';
      this.root.querySelector('.pm-title')!.innerHTML = settings ? 'SETTINGS<span class="jp">設定</span>' : 'PAUSED<span class="jp">一時停止</span>';
      this.root.querySelector('[data-act="resume"]')!.innerHTML = settings ? 'BACK<span class="jp">戻る</span>' : 'RESUME<span class="jp">再開</span>';
      (this.root.querySelector('[data-act="restart"]') as HTMLElement).style.display = settings ? 'none' : '';
      this.restartArmed = false;
      this.root.querySelector('[data-act="restart"]')!.innerHTML = 'RESTART<span class="jp">最初から</span>';
      this.setHint('');
      this.sync();
    }
  }
}
