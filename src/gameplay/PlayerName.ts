/*
  13.0, the player's name: typed on the main menu, shown on the HUD, under his arrow on the minimap,
  in the kill feed and on the scoreboard (bots read it as his callsign). Remembered per browser.

  It ends up inside HTML (the feed and scoreboard rows), so it is cleaned to plain printable text:
  no markup characters, no control characters, whitespace collapsed, at most MAX characters.
*/

export const DEFAULT_NAME = 'Artem';
export const NAME_MAX = 14;
const KEY = 'gridfall.name';

export function cleanName(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s || DEFAULT_NAME;
}

export function loadName(): string {
  try {
    return cleanName(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_NAME;
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(KEY, cleanName(name));
  } catch {
    /* storage blocked: the name lasts this session */
  }
}
