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

describe('Team Deathmatch is silent (8.1)', () => {
  it('a disabled bark gate says, shows and logs nothing; TDM turns its gates off, survival never does', async () => {
    const { BarkGate } = await import('./tactics/Barks');
    const g = new BarkGate<string>();
    let heard = 0;
    g.onBark = () => heard++;
    g.enabled = false;
    expect(g.say('a', 'reload', 'human', 10)).toBe(null);
    expect(heard).toBe(0);
    expect(g.log.length).toBe(0);
    g.enabled = true;
    expect(g.say('a', 'reload', 'human', 20)).not.toBe(null);
    expect(TDM.barks).toBe(false);
    expect(wavesSrc).not.toMatch(/barks\.enabled/);
  });
});
