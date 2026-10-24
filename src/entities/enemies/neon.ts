import { buildGunner, buildRunner, GUNNER_ACCENT, RUNNER_ACCENT } from '../../enemies/Models';
import type { EnemyLook } from '../types';

/** TokyoNight's survival enemies (the default): hooded blade runners and armoured gunners with neon visors. */
export const NEON_SYNTHS: EnemyLook = {
  id: 'neon',
  buildRunner,
  buildGunner,
  runnerAccent: RUNNER_ACCENT,
  gunnerAccent: GUNNER_ACCENT,
  organic: false,
  bolt: { core: [6, 3, 0.6], trail: [2.5, 1.0, 0.2], size: 1 },
  ballistic: 'kinetic',
  voice: 'synth',
};
