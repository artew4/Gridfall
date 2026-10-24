import type { LevelInfo } from '../levels/Level';

/*
  The map tile (45.0; the 24.0 card before it): the one component the menu's PLAY screen and the result
  screens' "next match" share. The art is painted in CSS (no images: gradients and repeating patterns
  per map, `.mc-art[data-map]` in the stylesheet), the map's name over its foot; nothing else.
*/

/**
 * 45.0, the main menu's map tile: the painted art (the cards' `.mc-art`) and the map's name, nothing
 * else (the picked one is named big over the live map). Hover and the pick move transform and opacity.
 */
export function mapTileHtml(l: LevelInfo, data: 'setting' | 'map' = 'setting', tag = '', on = false) {
  // 52.0: the map's picture over the painted art (the art shows until the picture has loaded).
  return `<button class="gm-tile${on ? ' on' : ''}" data-${data}="${l.id}"><span class="mc-art" data-map="${l.id}" aria-hidden="true"><img class="mc-shot" src="${mapPicture(l.id)}" alt="" loading="lazy" decoding="async"></span>${tag ? `<i>${tag}</i>` : ''}<b>${menuMapName(l)}</b><span class="gm-tile-frame" aria-hidden="true"></span></button>`;
}

/** 52.0: a map's picture (public/maps, scripts/mapshots.mjs), under the site's base path. */
export function mapPicture(id: string) {
  return `${import.meta.env.BASE_URL}maps/${id}.webp`;
}

/** 45.0: a map's name in the menu: without its city ("TOKYO: NEON BLOCK" is NEON BLOCK). */
export function menuMapName(l: LevelInfo) {
  return l.name.replace(/^[A-Z ]+:\s*/, '');
}
