import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types; vitest returns CSS empty under ?raw)
import { readFileSync } from 'node:fs';
import { mapTileHtml, menuMapName } from './MapCard';
import { boardOrder, scoreOf } from './TdmHud';
import type { LevelInfo } from '../levels/Level';

const css: string = readFileSync(new URL('../style.css', import.meta.url), 'utf8');


describe('24.0: the stylesheet scales and stays cheap', () => {
  it('sizes text in rem off one fluid root; nothing under 0.75rem', () => {
    expect(css).toMatch(/html \{ font-size: clamp\(15px, min\(0\.42vw, 0\.75vh\) \+ 8\.6px, 28px\); \}/);
    expect(css.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    for (const m of css.matchAll(/font-size:\s*(\d*\.?\d+)rem/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(0.75);
  });

  it('every endless animation moves only transform or opacity (the 17.0 rule: nothing repaints forever)', () => {
    const infinite = new Set([...css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)].map((m) => m[1]));
    expect(infinite.size).toBeGreaterThan(0);
    for (const name of infinite) {
      // One-line keyframes first (`{ … { … } }`), then multi-line ones (closed by a `}` alone on its line).
      const body = css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*?)\\} \\}`))?.[1] ?? css.match(new RegExp(`@keyframes ${name} \\{\\n([\\s\\S]*?)\\n\\}`))?.[1];
      expect(body, name).toBeTruthy();
      const props = new Set([...body!.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      for (const p of props) expect(['transform', 'opacity'], `${name}: ${p}`).toContain(p);
    }
    // The logo's glitch is a one-shot now, and hovers never start an endless animation.
    expect(css).not.toMatch(/h1-glitch[^;]*infinite/);
    expect(css).not.toMatch(/:hover[^{]*\{[^}]*infinite/);
  });

  it('45.0: map tiles animate transform and opacity on hover, nothing else', () => {
    const rules = [...css.matchAll(/([^{}]*\.gm-tile[^{}]*:hover[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, , body] of rules) for (const p of [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])) expect(['transform', 'opacity', 'outline']).toContain(p);
  });
});

describe('45.0: the map tile', () => {
  const info = { id: 'oldport', name: 'OLD PORT', biome: 'docks', jp: 'СТАРЫЙ ПОРТ', blurb: 'A harbour.', modes: ['tdm', 'arcade'], teamSize: 7 } as unknown as LevelInfo;
  it('carries its click hook, its painted art and its name, and no small print', () => {
    const h = mapTileHtml(info);
    expect(h).toContain('data-setting="oldport"');
    expect(h).toContain('class="mc-art" data-map="oldport"');
    expect(h).toContain('<b>OLD PORT</b>');
    expect(h).not.toContain('A harbour.');
    expect(h).not.toContain('СТАРЫЙ');
  });
  it("the result screens' variant: data-map, picked, a tag", () => {
    const h = mapTileHtml(info, 'map', 'REMATCH', true);
    expect(h).toMatch(/class="gm-tile on" data-map="oldport"/);
    expect(h).toContain('<i>REMATCH</i>');
  });
  it('names a map without its city', () => {
    expect(menuMapName({ name: 'TOKYO: NEON BLOCK' } as LevelInfo)).toBe('NEON BLOCK');
    expect(menuMapName({ name: 'OLD PORT' } as LevelInfo)).toBe('OLD PORT');
  });
  it('every level in the menu has a painted thumbnail', () => {
    for (const id of ['tokyo', 'neonblock', 'desert', 'jungle', 'crashsite', 'docks', 'oldport', 'maglev', 'favelas']) expect(css).toContain(`.mc-art[data-map="${id}"]`);
  });
});

describe('24.0: the live scoreboard and the board', () => {
  it('26.0: the team board reads by score, then kills, then fewer deaths, then the name', () => {
    const l = (name: string, kills: number, deaths: number, you = false) => ({ name, kills, deaths, you });
    const lines = [l('ZED', 3, 1), l('AXE', 5, 6), l('YOU', 5, 2, true), l('BEE', 3, 1), l('CAT', 0, 9)];
    // Scores: YOU 450, AXE 350, BEE and ZED 275 (by name), CAT 0. The input is left as it was.
    expect(boardOrder(lines).map((x) => x.name)).toEqual(['YOU', 'AXE', 'BEE', 'ZED', 'CAT']);
    expect(lines.map((x) => x.name)).toEqual(['ZED', 'AXE', 'YOU', 'BEE', 'CAT']);
  });
  it('score: 100 a kill, −25 a death, never below 0', () => {
    expect(scoreOf({ kills: 12, deaths: 4 })).toBe(1100);
    expect(scoreOf({ kills: 0, deaths: 5 })).toBe(0);
  });
});
