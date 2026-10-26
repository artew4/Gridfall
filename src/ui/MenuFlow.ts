import type { FlavorKey } from './Flavor';
import type { LevelInfo, Mode, SettingId } from '../levels/Level';

/*
  13.0, the main menu as a state machine: mode first, then the map.

    root ──pick mode──▶ maps(mode) ──deploy──▶ (the match: intro, play)
     ▲  ◀──back────────┘   │
     │                     └─pick map: builds it behind the menu (the card lights once it is ready)
     └─controls ⇄ back

  After a match the same rule picks what comes next without the root menu: `nextMaps(mode)` is every
  map with that mode, the one just played first (a rematch). The engine (core/Game.ts) owns the
  transitions that build or tear down levels; this file only decides which screen and which choices.

  Pure: no DOM. Tested in menu.test.ts.
*/

export type MenuScreen = 'root' | 'maps' | 'controls';

export interface MenuState {
  screen: MenuScreen;
  /** The mode picked on the root screen (null until one is). */
  mode: Mode | null;
  /** The map picked on the maps screen. */
  map: SettingId | null;
}

export type MenuEvent =
  | { type: 'mode'; mode: Mode }
  | { type: 'map'; id: SettingId }
  | { type: 'back' }
  | { type: 'controls' };

/** `fl`: the mode's flavor line (Flavor.ts, in the loaded biome's script). */
export const MODE_LABEL: Record<Mode, { name: string; fl: FlavorKey; line: string }> = {
  tdm: { name: 'TEAM DEATHMATCH', fl: 'modeTdm', line: 'Two squads, five to twelve a side. Team Deathmatch: first to the kill limit. Breakthrough: hold the points, bleed their tickets.' },
  arcade: { name: 'ARCADE SURVIVAL', fl: 'modeArcade', line: 'Endless waves. How long can you last?' },
  story: { name: 'STORY ESCAPE', fl: 'modeStory', line: 'Get out of Shinjuku before the last train.' },
};

/** 45.0: the modes as the menu's tabs name them (short; no blurb). */
export const MENU_MODE: Record<Mode, string> = { tdm: 'TEAM DEATHMATCH', arcade: 'SURVIVAL', story: 'STORY' };

/** Root menu order. */
export const MODE_ORDER: readonly Mode[] = ['tdm', 'arcade', 'story'];

/** Maps that support `mode`, in menu order. */
export function mapsFor(mode: Mode, levels: readonly LevelInfo[]): LevelInfo[] {
  return levels.filter((l) => l.modes.includes(mode));
}

/**
 * Picking a mode keeps the map already built if it supports the mode (no rebuild), else proposes the
 * first map that does.
 */
export function menuStep(s: MenuState, e: MenuEvent, levels: readonly LevelInfo[], loaded: SettingId): MenuState {
  switch (e.type) {
    case 'mode': {
      const maps = mapsFor(e.mode, levels);
      if (!maps.length) return s;
      const map = maps.some((m) => m.id === loaded) ? loaded : maps[0].id;
      return { screen: 'maps', mode: e.mode, map };
    }
    case 'map':
      if (s.screen !== 'maps' || !s.mode || !mapsFor(s.mode, levels).some((m) => m.id === e.id)) return s;
      return { ...s, map: e.id };
    case 'back':
      return { ...s, screen: 'root' };
    case 'controls':
      return { ...s, screen: 'controls' };
  }
}

/**
 * Ready to start: on the maps screen, with a mode and a map that supports it, nothing loading. 52.0:
 * the map needn't be built: PLAY builds it (a pick on the maps screen no longer does).
 */
export function canDeploy(s: MenuState, levels: readonly LevelInfo[], loading: boolean) {
  return s.screen === 'maps' && !!s.mode && !!s.map && !loading && mapsFor(s.mode, levels).some((m) => m.id === s.map);
}

/** After a match: every map with the same mode, the one just played first (the rematch). */
export function nextMaps(mode: Mode, current: SettingId, levels: readonly LevelInfo[]): { info: LevelInfo; again: boolean }[] {
  const maps = mapsFor(mode, levels);
  return [...maps.filter((m) => m.id === current), ...maps.filter((m) => m.id !== current)].map((info) => ({ info, again: info.id === current }));
}
