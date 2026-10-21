import { describe, expect, it } from 'vitest';
import { canDeploy, mapsFor, menuStep, nextMaps, type MenuState } from './MenuFlow';
import type { LevelInfo, Mode, SettingId } from '../levels/Level';

const L = (id: SettingId, modes: Mode[]) => ({ id, modes, name: id.toUpperCase() }) as unknown as LevelInfo;
const LEVELS = [L('tokyo', ['story', 'arcade']), L('desert', ['arcade', 'tdm']), L('jungle', ['arcade', 'tdm']), L('docks', ['tdm'])];
const root: MenuState = { screen: 'root', mode: null, map: null };

describe('13.0: the main menu state machine (mode first, then the map)', () => {
  it('maps for a mode, in menu order', () => {
    expect(mapsFor('tdm', LEVELS).map((l) => l.id)).toEqual(['desert', 'jungle', 'docks']);
    expect(mapsFor('story', LEVELS).map((l) => l.id)).toEqual(['tokyo']);
    expect(mapsFor('arcade', LEVELS).map((l) => l.id)).toEqual(['tokyo', 'desert', 'jungle']);
  });

  it('picking a mode keeps the map already built if it has the mode, else the first map that does', () => {
    expect(menuStep(root, { type: 'mode', mode: 'tdm' }, LEVELS, 'jungle')).toEqual({ screen: 'maps', mode: 'tdm', map: 'jungle' });
    expect(menuStep(root, { type: 'mode', mode: 'tdm' }, LEVELS, 'tokyo')).toEqual({ screen: 'maps', mode: 'tdm', map: 'desert' });
    expect(menuStep(root, { type: 'mode', mode: 'story' }, LEVELS, 'docks').map).toBe('tokyo');
  });

  it('only a map with the picked mode can be picked; back returns to the root, keeping the mode', () => {
    const maps = menuStep(root, { type: 'mode', mode: 'tdm' }, LEVELS, 'desert');
    expect(menuStep(maps, { type: 'map', id: 'docks' }, LEVELS, 'desert').map).toBe('docks');
    expect(menuStep(maps, { type: 'map', id: 'tokyo' }, LEVELS, 'desert')).toBe(maps);
    expect(menuStep(root, { type: 'map', id: 'docks' }, LEVELS, 'desert')).toBe(root);
    const back = menuStep(maps, { type: 'back' }, LEVELS, 'desert');
    expect(back.screen).toBe('root');
    expect(back.mode).toBe('tdm');
    expect(menuStep(root, { type: 'controls' }, LEVELS, 'desert').screen).toBe('controls');
    expect(menuStep({ ...root, screen: 'controls' }, { type: 'back' }, LEVELS, 'desert').screen).toBe('root');
  });

  it('deploy waits for the picked map to be the one built, and not loading', () => {
    const s = menuStep(menuStep(root, { type: 'mode', mode: 'tdm' }, LEVELS, 'desert'), { type: 'map', id: 'docks' }, LEVELS, 'desert');
    expect(canDeploy(s, LEVELS, 'desert', false)).toBe(false);
    expect(canDeploy(s, LEVELS, 'docks', true)).toBe(false);
    expect(canDeploy(s, LEVELS, 'docks', false)).toBe(true);
    expect(canDeploy(root, LEVELS, 'docks', false)).toBe(false);
  });

  it('after a match: every map of the same mode, the one just played first as the rematch', () => {
    const n = nextMaps('tdm', 'docks', LEVELS);
    expect(n.map((x) => x.info.id)).toEqual(['docks', 'desert', 'jungle']);
    expect(n.map((x) => x.again)).toEqual([true, false, false]);
    expect(nextMaps('arcade', 'desert', LEVELS).map((x) => x.info.id)).toEqual(['desert', 'tokyo', 'jungle']);
    expect(nextMaps('tdm', 'docks', LEVELS).some((x) => x.info.id === 'tokyo')).toBe(false);
  });
});
