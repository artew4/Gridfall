import { CALLSIGNS } from '../enemies/Callsigns';

/*
  13.0, the player's name: typed on the main menu, shown on the HUD, under his arrow on the minimap,
  in the kill feed and on the scoreboard (bots read it as his callsign). Remembered per browser.

  17.1: no fixed default. A browser with no saved name gets a mercenary handle from the bots' pool
  (13.0's 30 callsigns, title-cased: Jax, Nova, Viper) at every boot, until a name is typed. Only a
  typed name is saved; clearing the field forgets it (the next boot deals a new handle).

  It ends up inside HTML (the feed and scoreboard rows), so it is cleaned to plain printable text:
  no markup characters, no control characters, whitespace collapsed, at most MAX characters.
*/

export const NAME_MAX = 14;
const KEY = 'gridfall.name';

/** A random handle from the callsign pool, title-cased (JAX → Jax). */
export function randomName(rng: () => number = Math.random): string {
  const c = CALLSIGNS[Math.floor(rng() * CALLSIGNS.length) % CALLSIGNS.length];
  return c.charAt(0) + c.slice(1).toLowerCase();
}

/** Plain printable text, at most NAME_MAX; nothing left becomes `fallback`. */
export function cleanName(raw: string | null | undefined, fallback = ''): string {
  const s = (raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s || fallback;
}

/** The saved name, or a fresh random handle when none is saved (or storage is blocked). */
export function loadName(rng: () => number = Math.random, storage: Pick<Storage, 'getItem'> | null = safeStorage()): string {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(KEY) ?? null;
  } catch {
    /* storage blocked */
  }
  return cleanName(saved) || randomName(rng);
}

/** Remember a typed name; an empty one forgets it. */
export function saveName(name: string, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()) {
  try {
    const n = cleanName(name);
    if (n) storage?.setItem(KEY, n);
    else storage?.removeItem(KEY);
  } catch {
    /* storage blocked: the name lasts this session */
  }
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
