import { describe, expect, it } from 'vitest';
import jungleSrc from './jungle/JungleLevel.ts?raw';
import crashSrc from './crashsite/CrashSiteLevel.ts?raw';

describe('25.0: one jungle map in the TDM pool', () => {
  it('Crash Site is TDM\'s "DEEP JUNGLE"; the firebase is Survival only, named for its place', () => {
    expect(crashSrc).toMatch(/name: 'DEEP JUNGLE',/);
    expect(crashSrc).toMatch(/modes: \['tdm'\],/);
    expect(jungleSrc).toMatch(/modes: \['arcade'\],/);
    expect(jungleSrc).toMatch(/name: 'FIREBASE VIPER',/);
  });
});
