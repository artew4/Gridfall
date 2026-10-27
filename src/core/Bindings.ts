/** Default key bindings (KeyboardEvent.code) and the labels shown in prompts and menus. */
export const KEYS = {
  holster: 'KeyX',
  interact: 'KeyE',
  reload: 'KeyR',
  /** 11.0: tap to toggle, hold to crouch while held. */
  crouch: 'KeyC',
  /** Objective overview (held). */
  objective: 'Tab',
  /** 90.0: a frag. */
  grenade: 'KeyG',
} as const;

export type Action = keyof typeof KEYS;

export const KEY_LABEL: Record<Action, string> = {
  holster: 'X',
  interact: 'E',
  reload: 'R',
  crouch: 'C',
  objective: 'TAB',
  grenade: 'G',
};

/** Keys the browser would otherwise act on (focus change, scrolling). */
export const CAPTURED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
