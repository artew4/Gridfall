import type { Game } from '../core/Game';
import type { LevelInfo, LevelRuntime, SettingId } from './Level';
import { TOKYO_INFO, TokyoLevel } from './tokyo/TokyoLevel';
import { DESERT_INFO, DesertLevel } from './desert/DesertLevel';
import { JUNGLE_INFO, JungleLevel } from './jungle/JungleLevel';
import { DOCKS_INFO, DocksLevel } from './docks/DocksLevel';
import { NEONBLOCK_INFO, NeonBlockLevel } from './neonblock/NeonBlockLevel';
import { CRASHSITE_INFO, CrashSiteLevel } from './crashsite/CrashSiteLevel';
import { OLDPORT_INFO, OldPortLevel } from './oldport/OldPortLevel';
import { MAGLEV_INFO, MaglevLevel } from './maglev/MaglevLevel';
import { FAVELAS_INFO, FavelaLevel } from './favelas/FavelaLevel';

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
  // 14.0: Tokyo's biome as a TDM arena (the story district above is untouched).
  neonblock: { info: NEONBLOCK_INFO, create: (g) => new NeonBlockLevel(g) },
  // 15.0: Deep Jungle's biome as a TDM arena (Firebase Viper keeps its survival and 9.0 TDM).
  crashsite: { info: CRASHSITE_INFO, create: (g) => new CrashSiteLevel(g) },
  // 17.0: a daytime harbour arena (brick warehouse, container yard, dry dock); TDM and survival.
  oldport: { info: OLDPORT_INFO, create: (g) => new OldPortLevel(g) },
  // 18.0: a corporate sci-fi transit hall (the maglev's interior is the centre lane); TDM.
  maglev: { info: MAGLEV_INFO, create: (g) => new MaglevLevel(g) },
  // 40.0: a Rio hillside in the sun: terraces of pastel houses, alleys, escadarias, a layer of rooftops; TDM.
  favelas: { info: FAVELAS_INFO, create: (g) => new FavelaLevel(g) },
};

export const LEVEL_ORDER: SettingId[] = (['tokyo', 'neonblock', 'desert', 'jungle', 'crashsite', 'docks', 'oldport', 'maglev', 'favelas'] as SettingId[]).filter((id) => LEVELS[id]);

/** The registry entry of a setting the menu offers. */
export function levelEntry(id: SettingId): LevelEntry {
  const e = LEVELS[id];
  if (!e) throw new Error(`unknown setting ${id}`);
  return e;
}
