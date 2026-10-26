import { describe, expect, it } from 'vitest';
import { DESIGNS } from './Designs';
import { Rng } from './Dsp';

describe('63.0: the sound effects (Designs)', () => {
  it('every design renders finite, peaking at its level, starting at once, its variants different; the bank fast', () => {
    const sr = 48000;
    let ms = 0;
    for (const [key, n, d] of DESIGNS) {
      const outs: Float32Array[] = [];
      for (let v = 0; v < Math.min(n, 2); v++) {
        const t0 = performance.now();
        const x = d(new Rng(100 + v), sr);
        ms += performance.now() - t0;
        let peak = 0, firstLoud = -1, finite = true;
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) finite = false;
          const a = Math.abs(x[i]);
          peak = Math.max(peak, a);
          if (firstLoud < 0 && a > 0.05) firstLoud = i;
        }
        expect(finite, key).toBe(true);
        expect(peak, key).toBeGreaterThan(0.4);
        expect(peak, key).toBeLessThanOrEqual(0.93);
        // Audible within 20 ms (no silence before the sound; the cloth rustles swell in).
        if (!['draw', 'jump', 'slide', 'mantle'].includes(key)) expect(firstLoud / sr, key).toBeLessThan(0.02);
        outs.push(x);
      }
      if (outs.length === 2) expect(outs[0].some((v, i) => Math.abs(v - (outs[1][i] ?? 0)) > 0.01), key).toBe(true);
    }
    expect(ms).toBeLessThan(3000);
    console.log('render ms (two variants each):', Math.round(ms));
  });
});
