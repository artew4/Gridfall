import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types; vitest returns CSS empty under ?raw)
import { readFileSync } from 'node:fs';

const css: string = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const hud: string = readFileSync(new URL('./TdmHud.ts', import.meta.url), 'utf8');
/** The last rule for exactly `sel` (the one the cascade keeps). */
const rule = (sel: string) => [...css.matchAll(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'gm'))].pop()?.[1] ?? '';

describe('26.0: the TDM HUD in three corners', () => {
  it('board top left, score top centre, feed top right, minimap bottom left', () => {
    expect(rule('.tdm-board')).toMatch(/top: 1\.1rem; left: 1\.4rem/);
    expect(rule('.tdm-score')).toMatch(/left: 50%; top: 1\.1rem; transform: translateX\(-50%\)/);
    expect(rule('.tdm-feed')).toMatch(/top: 1\.1rem; right: 1\.4rem/);
    expect(rule('.minimap.tdm-map')).toMatch(/bottom: 1\.4rem/);
  });

  it('the board is a containment root, its rows placed by transform (and animated by nothing else)', () => {
    expect(rule('.tdm-board')).toMatch(/contain: layout paint/);
    const row = rule('.tdm-board .row');
    expect(row).toMatch(/position: absolute/);
    expect(row).toMatch(/transition: transform [\d.]+s/);
    expect(row).not.toMatch(/transition:[^;]*(top|height|background|all)/);
  });

  it('a board update writes Text nodes, never innerHTML, and moves rows by translateY', () => {
    const body = hud.slice(hud.indexOf('  setBoard('), hud.indexOf('  private buildBoard('));
    expect(body).toMatch(/\.data = String/);
    expect(body).not.toMatch(/innerHTML|textContent|offsetWidth|getBoundingClientRect/);
    expect(body).toMatch(/translateY\(\$\{at \* 100\}%\)/);
    // The score, too: its numbers are Text nodes.
    const tickets = hud.slice(hud.indexOf('  setTickets('), hud.indexOf('  /** One line of the feed.'));
    expect(tickets).not.toMatch(/innerHTML|textContent/);
  });

  it('the player standing line (24.0) is gone', () => {
    expect(css).not.toMatch(/\.tdm-me|\.tdm-right/);
    expect(hud).not.toMatch(/setMe\(/);
  });
});
