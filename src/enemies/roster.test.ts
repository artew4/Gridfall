import { describe, expect, it } from 'vitest';
import { ANY, RANGED_ONLY, allows, filterRoster, type Slot } from './Roster';
import { TDM } from '../levels/Tdm';
import wavesSrc from './Waves.ts?raw';

const slots: Slot[] = [['MAXIM', 'gunner'], ['ILYA', 'runner'], ['KITE', 'runner']];

describe('Roster filtering', () => {
  it('ranged only: every slot kept, blades become gunners, names and count unchanged', () => {
    const r = filterRoster(slots, RANGED_ONLY);
    expect(r).toEqual([['MAXIM', 'gunner'], ['ILYA', 'gunner'], ['KITE', 'gunner']]);
    expect(allows(RANGED_ONLY, 'runner')).toBe(false);
  });

  it('ANY keeps the designed roster', () => {
    expect(filterRoster(slots, ANY)).toEqual(slots);
  });

  it('a substitute the request forbids is a configuration error', () => {
    expect(() => filterRoster(slots, { allow: ['melee'], substitute: 'gunner' })).toThrow();
  });

  it('Team Deathmatch asks for ranged units only; survival waves never consult a roster request', () => {
    expect(TDM.roster).toBe(RANGED_ONLY);
    // Survival composes its own waves of runners and gunners (5.0), untouched by the TDM request.
    expect(wavesSrc).not.toMatch(/Roster/);
    expect(wavesSrc).toMatch(/new Runner\(/);
  });
});
