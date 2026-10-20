export interface EscapeStats {
  time: number;
  guardsDown: number;
  detected: number;
  escapes: number;
  maxAlert: string;
  alarmed: number;
  harmed: number;
  accuracy: number;
  interactions: number;
}

const CREDITS = [
  ['NEON RAIN 3.0', 'CINEMATIC ESCAPE'],
  ['DESIGN · CODE · SOUND', 'procedural, made in the browser'],
  ['ENGINE', 'three.js · Web Audio · TypeScript · Vite'],
  ['CITY', 'Shinjuku, as remembered in the rain'],
  ['MUSIC', 'synthesised live, every note'],
  ['THANKS', 'everyone who missed the last train once'],
  ['', '雨は止まない'],
];

/**
 * End card: a restrained message, the run's numbers, slow credits, then restart / menu.
 */
export class EndScreen {
  root = document.createElement('div');
  onRestart: () => void = () => {};
  onMenu: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root.id = 'endscreen';
    this.root.className = 'layer screen hidden';
    parent.appendChild(this.root);
    for (const ev of ['mousedown', 'click']) this.root.addEventListener(ev, (e) => e.stopPropagation());
  }

  show(s: EscapeStats) {
    const mm = Math.floor(s.time / 60);
    const ss = String(Math.floor(s.time % 60)).padStart(2, '0');
    this.root.innerHTML = `
      <div class="end-title">ESCAPED<span class="jp">脱出</span></div>
      <div class="end-sub">The last train carried you out of Shinjuku. Behind you, the rain kept falling.</div>
      <div class="end-stats">
        <span>TIME</span><span>${mm}:${ss}</span>
        <span>TIMES DETECTED</span><span>${s.detected}</span>
        <span>PURSUITS SHAKEN</span><span>${s.escapes}</span>
        <span>HIGHEST ALERT</span><span>${s.maxAlert}</span>
        <span>OFFICERS DOWN</span><span>${s.guardsDown}</span>
        <span>CIVILIANS ALARMED</span><span>${s.alarmed}</span>
        <span>BYSTANDERS HURT</span><span>${s.harmed}</span>
        <span>ACCURACY</span><span>${Math.round(s.accuracy * 100)}%</span>
        <span>CITY USED AGAINST THEM</span><span>${s.interactions}</span>
      </div>
      <div class="end-credits"><div class="roll">${CREDITS.map(([a, b]) => `<div class="cr"><b>${a}</b><span>${b}</span></div>`).join('')}</div></div>
      <div class="end-buttons">
        <button class="pm-btn primary" data-act="restart">PLAY AGAIN<span class="jp">もう一度</span></button>
        <button class="pm-btn" data-act="menu">MAIN MENU<span class="jp">メニュー</span></button>
      </div>`;
    this.root.querySelector('[data-act="restart"]')!.addEventListener('click', () => this.onRestart());
    this.root.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.onMenu());
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }
}
