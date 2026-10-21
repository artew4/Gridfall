import type { Game } from '../core/Game';
import type { LevelInfo, LevelRuntime, SettingId } from './Level';
import { TOKYO_INFO, TokyoLevel } from './tokyo/TokyoLevel';
import { DESERT_INFO, DesertLevel } from './desert/DesertLevel';
import { JUNGLE_INFO, JungleLevel } from './jungle/JungleLevel';
import { DOCKS_INFO, DocksLevel } from './docks/DocksLevel';

export interface LevelEntry {
  info: LevelInfo;
  /** Builds the level into the engine's fresh scene and collision world. */
  create(game: Game): LevelRuntime;
}

/** Every setting the menu offers, in menu order. Adding a level = one entry here (see docs/LEVELS.md). */
export const LEVELS: Partial<Record<SettingId, LevelEntry>> & { tokyo: LevelEntry } = {
  tokyo: { info: TOKYO_INFO, create: (g) => new TokyoLevel(g) },
  desert: { info: DESERT_INFO, create: (g) => new DesertLevel(g) },
  jungle: { info: JUNGLE_INFO, create: (g) => new JungleLevel(g) },
  docks: { info: DOCKS_INFO, create: (g) => new DocksLevel(g) },
};

export const LEVEL_ORDER: SettingId[] = (['tokyo', 'desert', 'jungle', 'docks'] as SettingId[]).filter((id) => LEVELS[id]);

/** The registry entry of a setting the menu offers. */
export function levelEntry(id: SettingId): LevelEntry {
  const e = LEVELS[id];
  if (!e) throw new Error(`unknown setting ${id}`);
  return e;
}
