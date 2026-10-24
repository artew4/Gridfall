import type { Settings } from './Settings';
import { FPS_CAPS, PRESETS, type QualityPreset } from '../core/Performance';

type SliderKey = 'master' | 'music' | 'sfx';

/** 45.0: the presets as the settings name them (one word each). */
const QUALITY_NAME: Record<QualityPreset, string> = { power: 'LOW', balanced: 'MEDIUM', high: 'HIGH' };

/**
 * Esc menu in the HUD's visual language: resume, restart, three volume sliders and mute.
 * Clicks never leak to the game (no accidental shots, no intro skip).
 */
export class PauseMenu {
  root = document.createElement('div');
  onResume: () => void = () => {};
  onRestart: () => void = () => {};
  onQuit: () => void = () => {};
  onChange: (s: Settings) => void = () => {};
  private hint: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private sliders = {} as Record<SliderKey, { input: HTMLInputElement; val: HTMLElement }>;
  private restartArmed = false;
  private quitArmed = false;
  /** 'settings': opened from the main menu (no restart; RESUME reads BACK). */
  mode: 'pause' | 'settings' = 'pause';

  constructor(parent: HTMLElement, private settings: Settings) {
    this.root.id = 'pausemenu';
    this.root.className = 'layer hidden';
    // 45.0: two columns in the main menu's type: the title and the big actions on the left, the
    // settings on the right as label / value rows. No flavor lines, no notes.
    this.root.innerHTML = `
      <div class="pm-wrap">
        <div class="pm-side">
          <div class="pm-title">PAUSED</div>
          <nav class="pm-nav">
            <button class="gm-item pm-item" data-act="resume"><span>RESUME</span></button>
            <div class="pm-hint"></div>
            <button class="gm-item pm-item" data-act="restart"><span>RESTART</span></button>
            <button class="gm-item pm-item" data-act="quit"><span>QUIT</span></button>
          </nav>
        </div>
        <div class="pm-panel">
          <div class="pm-sec">AUDIO</div>
          ${(['master', 'music', 'sfx'] as SliderKey[])
            .map(
              (k) => `<label class="pm-slider"><span class="name">${k === 'sfx' ? 'EFFECTS' : k.toUpperCase()}</span>
                <input type="range" min="0" max="100" step="1" data-key="${k}" />
                <span class="val"></span></label>`,
            )
            .join('')}
          <button class="pm-opt toggle" data-act="mute"></button>
          <div class="pm-sec">GRAPHICS</div>
          <div class="pm-row">${(Object.keys(PRESETS) as QualityPreset[])
            .map((q) => `<button class="pm-chip" data-quality="${q}">${QUALITY_NAME[q]}</button>`)
            .join('')}</div>
          <button class="pm-opt toggle" data-act="fps"></button>
          <button class="pm-opt toggle" data-act="tips"></button>
        </div>
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
      const q = (e.target as HTMLElement).closest<HTMLElement>('[data-quality]')?.dataset.quality as QualityPreset | undefined;
      if (q) {
        // A preset brings its own frame cap; the cap can still be changed afterwards.
        this.settings.quality = q;
        this.settings.fps = PRESETS[q].fps;
        this.sync();
        this.onChange(this.settings);
        return;
      }
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
          this.root.querySelector('[data-act="restart"]')!.innerHTML = '<span>CONFIRM?</span>';
          return;
        }
        this.onRestart();
      } else if (act === 'quit') {
        // Two-step as well: the run is lost.
        if (!this.quitArmed) {
          this.quitArmed = true;
          this.root.querySelector('[data-act="quit"]')!.innerHTML = '<span>CONFIRM?</span>';
          return;
        }
        this.onQuit();
      } else if (act === 'fps') {
        const i = FPS_CAPS.indexOf(this.settings.fps);
        this.settings.fps = FPS_CAPS[(i + 1) % FPS_CAPS.length];
        this.sync();
        this.onChange(this.settings);
      } else if (act === 'tips') {
        this.settings.tips = !this.settings.tips;
        this.sync();
        this.onChange(this.settings);
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
    this.muteBtn.innerHTML = `<span>SOUND</span><b>${this.settings.muted ? 'OFF' : 'ON'}</b>`;
    this.muteBtn.classList.toggle('on', this.settings.muted);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-quality]'))) b.classList.toggle('on', b.dataset.quality === this.settings.quality);
    this.root.querySelector('[data-act="fps"]')!.innerHTML = `<span>FRAME RATE</span><b>${this.settings.fps} FPS</b>`;
    this.root.querySelector('[data-act="tips"]')!.innerHTML = `<span>CONTROL TIPS</span><b>${this.settings.tips ? 'ON' : 'OFF'}</b>`;
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
      this.root.classList.toggle('from-menu', settings);
      this.root.querySelector('.pm-title')!.textContent = settings ? 'SETTINGS' : 'PAUSED';
      this.root.querySelector('[data-act="resume"]')!.innerHTML = settings ? '<span>BACK</span>' : '<span>RESUME</span>';
      (this.root.querySelector('[data-act="restart"]') as HTMLElement).style.display = settings ? 'none' : '';
      (this.root.querySelector('[data-act="quit"]') as HTMLElement).style.display = settings ? 'none' : '';
      this.restartArmed = false;
      this.quitArmed = false;
      this.root.querySelector('[data-act="restart"]')!.innerHTML = '<span>RESTART</span>';
      this.root.querySelector('[data-act="quit"]')!.innerHTML = '<span>MAIN MENU</span>';
      this.setHint('');
      this.sync();
    }
  }
}
