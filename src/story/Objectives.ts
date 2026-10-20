import * as THREE from 'three';
import { ROOF } from '../world/District';
import { UG } from '../world/Metro';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Where the informant waits: the ramen stall stools. */
export const KENJI = v(-7.2, 0, 12.4);
/** The departure board at the plaza metro entrance (east side). */
export const STREET_BOARD = v(12.2, 0, 2);
/** Platform 1, where the escape train stops. */
export const PLATFORM = v(0, UG, 31);

export type Step = 'meet' | 'talk' | 'ambush' | 'board' | 'relay' | 'manhunt' | 'train' | 'done';

export const ACT_NAMES: Record<1 | 2 | 3 | 4, { en: string; jp: string }> = {
  1: { en: 'THE FUGITIVE', jp: '逃亡者' },
  2: { en: 'THE ESCAPE ROUTE', jp: '脱出路' },
  3: { en: 'THE MANHUNT', jp: '包囲網' },
  4: { en: 'THE LAST TRAIN', jp: '終電' },
};

export interface ObjectiveDef {
  step: Step;
  title: string;
  jp: string;
  /** One line: what to do. */
  text: string;
  /** Why it matters (objective overview). */
  why: string;
  /** Destination name for the marker and overview (empty: no destination). */
  place: string;
  target: THREE.Vector3 | null;
  /** Hints, from gentle to explicit, offered when the player stops making progress. */
  hints: string[];
}

/** Values that change while playing (train times). */
export interface ObjectiveContext {
  escapeTime: string;
  relay: THREE.Vector3;
}

/**
 * Every main step of the story, in words a new player can act on. Mission owns which step is
 * current; everything that presents an objective (banner, panel, marker, minimap, overview, hints)
 * reads it from here through the mission.
 */
export function objectiveFor(step: Step, c: ObjectiveContext): ObjectiveDef | null {
  switch (step) {
    case 'meet':
      return {
        step,
        title: 'FIND KENJI',
        jp: '健二を探せ',
        text: 'Your contact is waiting at the ramen stall in the Fountain Plaza.',
        why: 'Kenji has arranged your way out of the district. Kurogane Security has your face on every screen — keep your weapon holstered and don’t run past patrols.',
        place: 'KENJI · RAMEN STALL',
        target: KENJI,
        hints: [
          'Leave the back alley east onto Lantern Street, then head north: the plaza with the big fountain is at its end.',
          'The ramen stall is on the south-west side of the Fountain Plaza. Kenji wears a yellow coat.',
        ],
      };
    case 'talk':
      return {
        step,
        title: 'LISTEN TO KENJI',
        jp: '健二の話を聞け',
        text: 'Kenji explains the way out.',
        why: 'He knows how to get you past the lockdown.',
        place: '',
        target: null,
        hints: [],
      };
    case 'ambush':
      return {
        step,
        title: 'LOSE THE SECURITY SQUAD',
        jp: '追っ手を撒け',
        text: 'Kurogane followed Kenji. Break line of sight and stay hidden until they give up.',
        why: 'They know your face now. Every unit that sees you calls in your position — get out of their view, change level, and wait out the search.',
        place: '',
        target: null,
        hints: [
          'Guards search where they last saw you. Get away from that spot — rooftops and back alleys break their line of sight.',
          'Holster your weapon (X) and keep moving away from the red cones on the minimap.',
        ],
      };
    case 'board':
      return {
        step,
        title: 'CHECK THE DEPARTURE BOARD',
        jp: '発車案内を確認せよ',
        text: 'Find the board at the plaza metro entrance and identify your train.',
        why: 'Kenji said the last express to Kagerō Bay is the only train that leaves the district without a security checkpoint. Find out when it leaves.',
        place: 'DEPARTURE BOARD · METRO ENTRANCE',
        target: STREET_BOARD,
        hints: [
          'The metro entrance is on the east side of the Fountain Plaza, next to the stairs down.',
          'Walk up to the departure board and press E to read it.',
        ],
      };
    case 'relay':
      return {
        step,
        title: 'DISABLE THE SECURITY RELAY',
        jp: '中継器を破壊せよ',
        text: 'Hold E at the relay terminal on the Sky Garden rooftop (or shoot it three times).',
        why: 'The station is in lockdown: shutters down, the last express suspended. The lockdown runs through a relay on the Sky Garden roof. Kill it and the shutters go up — and every unit will know where you are.',
        place: 'SECURITY RELAY · SKY GARDEN ROOF',
        target: c.relay.clone().setY(ROOF),
        hints: [
          'The Sky Garden is the rooftop south of Neon Alley, east of the plaza. A long stair climbs to it straight from Neon Alley.',
          'On the roof, the relay is the tall cabinet at the far east end. Hold E next to it.',
        ],
      };
    case 'manhunt':
      return {
        step,
        title: 'REACH THE STATION',
        jp: '駅へ急げ',
        text: `Shutters are up. Get down to Platform 1 — the last express leaves at ${c.escapeTime}.`,
        why: 'The relay alarm put every nearby unit on the roof. The station entrances are open now; the platform is one level below the street.',
        place: 'PLATFORM 1 · SAKURA LINE',
        target: PLATFORM,
        hints: [
          'Metro entrances: the east side of the Fountain Plaza, the south end of the back alley, and the maintenance yard off the Service Passage.',
          'Go down any metro entrance and follow the signs to Platform 1.',
        ],
      };
    case 'train':
      return {
        step,
        title: 'BOARD THE LAST EXPRESS',
        jp: `${c.escapeTime} 終電に乗れ`,
        text: `Kagerō Bay express, Platform 1, ${c.escapeTime}. Get on before the doors close.`,
        why: 'This train runs straight out of the district. Locals stop at a security checkpoint — don’t take them.',
        place: 'PLATFORM 1 · LAST EXPRESS',
        target: PLATFORM,
        hints: ['Stand on Platform 1. When the express stops, walk in through any open door.'],
      };
    case 'done':
      return null;
  }
}
