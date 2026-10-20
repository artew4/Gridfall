/** Default key bindings (KeyboardEvent.code) and the labels shown in prompts and menus. */
export const KEYS = {
  holster: 'KeyX',
  interact: 'KeyE',
  reload: 'KeyR',
  /** Objective overview (held). */
  objective: 'Tab',
} as const;

export type Action = keyof typeof KEYS;

export const KEY_LABEL: Record<Action, string> = {
  holster: 'X',
  interact: 'E',
  reload: 'R',
  objective: 'TAB',
};

/** Keys the browser would otherwise act on (focus change, scrolling). */
export const CAPTURED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
