import { describe, expect, it } from 'vitest';
import { STORM_TIMING, StormClock } from './Sandstorm';

describe('12.0 sandstorm cycle', () => {
  it('the storm is the normal state: dust (intensity > 0.5) most of the time, calm only briefly', () => {
    const c = new StormClock();
    let dusty = 0, calm = 0, longestCalm = 0, run = 0;
    const dt = 0.1, T = 4 * 3600;
    for (let t = 0; t < T; t += dt) {
      c.update(dt);
      if (c.intensity > 0.5) dusty += dt;
      if (c.phase === 'calm') {
        calm += dt;
        run += dt;
        longestCalm = Math.max(longestCalm, run);
      } else run = 0;
    }
    expect(dusty / T).toBeGreaterThan(0.75);
    expect(calm / T).toBeLessThan(0.12);
    expect(longestCalm).toBeLessThanOrEqual(STORM_TIMING.calm[1] + dt);
  });
});
