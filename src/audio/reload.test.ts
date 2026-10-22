import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';
import { layerNodes, pumpLayers, recipeCentroid, recipeLength, reloadKind, reloadRecipe, type ReloadKind, type ReloadStage } from './ReloadSynth';

const KINDS: ReloadKind[] = ['pistol', 'smg', 'rifle', 'shotgun'];
const STAGES: ReloadStage[] = ['out', 'in', 'rack'];
/** A whole reload: the stages Weapon plays (a tube gun: one shell, then the pump). */
const whole = (k: ReloadKind) => (k === 'shotgun' ? [...reloadRecipe(k, 'in'), ...pumpLayers()] : STAGES.flatMap((s) => reloadRecipe(k, s)));

describe('26.0 reload synths', () => {
  it('every gun maps to a kind, the neon pistol to the pistol', () => {
    expect(reloadKind('plasma')).toBe('pistol');
    expect(reloadKind('pistol')).toBe('pistol');
    expect(reloadKind('smg')).toBe('smg');
    expect(reloadKind('rifle')).toBe('rifle');
    expect(reloadKind('shotgun')).toBe('shotgun');
  });

  it('each gun sounds different at every stage it plays', () => {
    const seen = new Set<string>();
    for (const k of KINDS) for (const s of STAGES) {
      const r = reloadRecipe(k, s);
      if (k === 'shotgun' && s === 'out') { expect(r).toHaveLength(0); continue; }
      expect(r.length).toBeGreaterThan(0);
      const key = JSON.stringify(r);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('pitch: the pistol highest, then the SMG, the rifle, the shotgun lowest', () => {
    const c = KINDS.map((k) => recipeCentroid(whole(k)));
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]);
    expect(c[0]).toBeGreaterThan(3000);
    expect(c[3]).toBeLessThan(1000);
  });

  it('the pistol is short; the rifle and the pump carry a low thump', () => {
    for (const s of STAGES) expect(recipeLength(reloadRecipe('pistol', s))).toBeLessThan(0.12);
    const thump = (r: readonly ReturnType<typeof pumpLayers>[number][]) => r.some((l) => l.v === 'tone' && l.wave === 'sine' && l.f1 < 80 && l.peak >= 0.4);
    expect(thump(reloadRecipe('rifle', 'in'))).toBe(true);
    expect(thump(reloadRecipe('rifle', 'rack'))).toBe(true);
    expect(thump(pumpLayers())).toBe(true);
    expect(thump(reloadRecipe('pistol', 'rack'))).toBe(false);
  });

  it('the SMG zips: clicks speeding up and rising', () => {
    const clicks = reloadRecipe('smg', 'out').filter((l) => l.v === 'noise' && l.q >= 6);
    expect(clicks.length).toBeGreaterThanOrEqual(6);
    const gaps = clicks.slice(1).map((l, i) => l.at - clicks[i].at);
    expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0]);
    const f = clicks.map((l) => (l.v === 'noise' ? l.f : 0));
    expect(f[f.length - 1]).toBeGreaterThan(f[0]);
  });

  it('cheap: under 40 nodes a stage, every layer inside the stage window', () => {
    for (const k of KINDS) for (const s of STAGES) {
      const r = reloadRecipe(k, s);
      expect(r.reduce((n, l) => n + layerNodes(l), 0)).toBeLessThan(40);
      expect(recipeLength(r)).toBeLessThan(0.5);
    }
    expect(pumpLayers().reduce((n, l) => n + layerNodes(l), 0)).toBeLessThan(40);
  });

  it('a burst scheduled ahead starts its noise when it starts (a gain is 1 until its first event)', () => {
    const src: string = readFileSync(new URL('./AudioEngine.ts', import.meta.url), 'utf8');
    const burst = src.slice(src.indexOf('  private burst('), src.indexOf('  private tone('));
    expect(burst).toMatch(/this\.noise\(buf, false, .*, t\);/);
    expect(src).toMatch(/s\.start\(at, offset\)/);
  });
});
