import { describe, expect, it } from 'vitest';
import { BIOMES, FLAVOR, LANG, fl, flNumber, flSpan, flWave, getBiome, onBiome, setBiome, type Biome } from './Flavor';
import { ZONES as DOCKS_ZONES } from '../levels/docks/DocksLayout';
import { ZONES as CRASH_ZONES } from '../levels/crashsite/CrashLayout';

/** The script a line is written in (the ranges the flavor uses). */
const SCRIPT: Record<Biome, RegExp> = {
  tokyo: /[぀-ヿ一-鿿]/,
  desert: /[؀-ۿ]/,
  docks: /[Ѐ-ӿ]/,
  jungle: /[฀-๿]/,
  // 40.0: Portuguese, in capitals like the English (Latin letters, with accents).
  favela: /^[A-ZÀ-Ý0-9 .\-]+$/,
};
const JAPANESE = SCRIPT.tokyo;

describe('UI flavor (16.0)', () => {
  it('every line exists in every biome, in that biome\'s script, and no Japanese leaks outside Tokyo', () => {
    for (const [key, line] of Object.entries(FLAVOR)) {
      for (const b of BIOMES) {
        expect(line[b], `${key}.${b}`).toBeTruthy();
        expect(SCRIPT[b].test(line[b]), `${key}.${b} is in its script`).toBe(true);
        if (b !== 'tokyo') expect(JAPANESE.test(line[b]), `${key}.${b} has no Japanese`).toBe(false);
      }
    }
  });

  it('numerals follow the biome: kanji, Arabic-Indic, Western, Thai', () => {
    expect(flNumber(12, 'tokyo')).toBe('十二');
    expect(flNumber(12, 'desert')).toBe('١٢');
    expect(flNumber(12, 'docks')).toBe('12');
    expect(flNumber(12, 'jungle')).toBe('๑๒');
    expect(flWave(3, 'tokyo')).toBe('第三波');
    expect(flWave(3, 'docks')).toBe('ВОЛНА 03');
    expect(flWave(3, 'desert')).toBe('الموجة ٣');
    expect(flNumber(12, 'favela')).toBe('12');
    expect(flWave(3, 'favela')).toBe('ONDA 3');
  });

  it('setBiome switches the default and tells the listeners; a fixed span keeps its own biome', () => {
    const seen: Biome[] = [];
    const off = onBiome((b) => seen.push(b));
    setBiome('docks');
    expect(getBiome()).toBe('docks');
    expect(fl('paused')).toBe('ПАУЗА');
    expect(flSpan('paused')).toBe(`<span class="jp" data-fl="paused" lang="${LANG.docks}">ПАУЗА</span>`);
    expect(flSpan('deploying', 'span', 'jp', 'desert')).toBe(`<span class="jp" lang="ar">${FLAVOR.deploying.desert}</span>`);
    off();
    setBiome('tokyo');
    expect(seen).toEqual(['docks']);
  });

  it('the arenas\' zone names are in their biome\'s script (Neon Docks Cyrillic, Crash Site Thai)', () => {
    for (const z of Object.values(DOCKS_ZONES)) expect(SCRIPT.docks.test(z.jp), z.name).toBe(true);
    for (const z of Object.values(CRASH_ZONES)) expect(SCRIPT.jungle.test(z.jp), z.name).toBe(true);
  });
});
