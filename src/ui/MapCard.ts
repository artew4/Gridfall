import { LANG } from './Flavor';
import type { LevelInfo } from '../levels/Level';

/*
  24.0, the map card: the one component the menu's map screen and the result screens' "next map"
  share. A full-bleed thumbnail painted in CSS (no images: gradients and repeating patterns per map,
  `.mc-art[data-map]` in the stylesheet), the map's name in its own script as a large watermark, and
  the name, flavor line, blurb and modes over a dark foot.

    <button class="map-card [on] [sm]" data-setting|data-map="id">
      .mc-art      the painted thumbnail (data-map)
      .mc-wm       the flavor name, large and faint (lang: ja/ar/ru/th)
      .mc-body     .mc-tag (REMATCH, SELECTED…) · .mc-name · .mc-jp · .mc-blurb · .mc-modes
      .mc-glow     the hover/selected frame, pre-drawn: only its opacity changes

  Hover moves only transform (the card lifts) and opacity (the glow): nothing repaints while the
  pointer rests on a card (the 17.0 rule: no animated filter, shadow or background).
*/

const MODE_TEXT = (l: LevelInfo, m: LevelInfo['modes'][number]) => (m === 'story' ? 'STORY' : m === 'tdm' ? `${l.teamSize ?? 5}v${l.teamSize ?? 5} TDM` : 'SURVIVAL');

export interface MapCardOpts {
  /** The attribute the click handler reads: the menu's `data-setting`, a result screen's `data-map`. */
  data: 'setting' | 'map';
  on?: boolean;
  /** A small label over the name (REMATCH). */
  tag?: string;
  /** The compact card (result screens). */
  small?: boolean;
}

export function mapCardHtml(l: LevelInfo, o: MapCardOpts) {
  const lang = LANG[l.biome];
  const modes = l.modes.map((m) => `<i>${MODE_TEXT(l, m)}</i>`).join('');
  return `<button class="map-card${o.on ? ' on' : ''}${o.small ? ' sm' : ''}" data-${o.data}="${l.id}" data-biome="${l.biome}">
    <span class="mc-art" data-map="${l.id}" aria-hidden="true"></span>
    <span class="mc-wm jp" lang="${lang}" aria-hidden="true">${l.jp}</span>
    <span class="mc-body">
      ${o.tag ? `<span class="mc-tag">${o.tag}</span>` : ''}
      <b class="mc-name">${l.name}</b>
      <span class="mc-jp jp" lang="${lang}">${l.jp}</span>
      <span class="mc-blurb">${l.blurb}</span>
      <span class="mc-modes">${modes}</span>
    </span>
    <span class="mc-glow" aria-hidden="true"></span>
  </button>`;
}
