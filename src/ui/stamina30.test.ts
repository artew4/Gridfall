import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';

const css: string = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const hud: string = readFileSync(new URL('./Hud.ts', import.meta.url), 'utf8');
const ai: string = readFileSync(new URL('../enemies/arena/DeathmatchAI.ts', import.meta.url), 'utf8');
const rule = (sel: string) => [...css.matchAll(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'gm'))].pop()?.[1] ?? '';

describe('30.0: the stamina bar stays off the layout', () => {
  it('the fill is scaled by transform; only opacity is transitioned', () => {
    const set = hud.slice(hud.indexOf('  setStamina('), hud.indexOf('  setHealth('));
    expect(set).toMatch(/style\.transform = `scaleX\(/);
    expect(set).not.toMatch(/style\.(width|height|left|right)|innerHTML|textContent|offsetWidth/);
    expect(rule('.stamina')).toMatch(/transition: opacity/);
    expect(rule('.stamina')).not.toMatch(/transition:[^;]*(width|height|all)/);
    expect(rule('.stamina i')).not.toMatch(/transition/);
    expect(rule('.stamina.full')).toMatch(/opacity: 0/);
  });

  it('writes only when the value moves by 0.5% or a state flips', () => {
    const set = hud.slice(hud.indexOf('  setStamina('), hud.indexOf('  setHealth('));
    expect(set).toMatch(/Math\.round\(frac \* 200\)/);
    expect(set).toMatch(/if \(k !== L\.k\)/);
  });
});

describe('30.0: bots sprint for a reason', () => {
  it('retreat, flank, a close gun pushing, crossing ground a hostile sees; a rifle walks up to range', () => {
    const fn = ai.slice(ai.indexOf('  private sprintReason('), ai.indexOf('  // ------------------------------------------------------------------ act'));
    // (42.0: a recovering anchor or wolf runs for cover as a retreat does.)
    expect(fn).toMatch(/st === 'retreat' \|\| st === 'break'( \|\| st === 'recover')?\) return 'retreat'/);
    expect(fn).toMatch(/st === 'flank'\) return 'flank'/);
    expect(fn).toMatch(/arm\.id !== 'ar'/);
    expect(fn).toMatch(/return 'cross'/);
  });

  it('optional sprints keep a reserve; only a retreat may run the pool dry; a slide needs the sprint', () => {
    // (65.0: the floor is the push's for the opening's run for the middle.)
    expect(ai).toMatch(/why === 'retreat' \? true : why === 'push' \? v > S\.pushFloor : this\.sprintNow \? v > floor : v >= S\.reserve/);
    expect(ai).toMatch(/const floor = why === 'rotate' && now - A\.director\.startT < ARENA\.rotate\.opening \? S\.pushFloor : S\.floor;/);
    expect(ai).toMatch(/if \(!this\.sprintNow \|\| !this\.stamina\.slide\(\)\) return;/);
  });
});
