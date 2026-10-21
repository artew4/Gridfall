/*
  13.0, bot callsigns: one pool for both teams, dealt at random at the start of every match. Before
  13.0 each team had a fixed roster (ALPHA's were Russian given names, OMEGA's animals). Now a match
  draws ten different mercenary handles, so the feed reads like a lobby of strangers rather than the
  same two squads every time; a name keeps its slot (and its row on the scoreboard) for the match.

  Pure: tested in roster.test.ts.
*/

export const CALLSIGNS: readonly string[] = [
  'JAX', 'NOVA', 'SILAS', 'KURO', 'ECHO', 'VIPER', 'RHEA', 'DAX', 'ORIN', 'SABLE',
  'KAI', 'ZEPHYR', 'MIRA', 'TALON', 'IKARI', 'LYRA', 'CASSIUS', 'HEX', 'ONYX', 'RIVEN',
  'SOL', 'VESPER', 'NYX', 'ARLO', 'KESTREL', 'JUNO', 'ZERO', 'TOMOE', 'RAZE', 'QUILL',
];

/**
 * `n` different callsigns in random order, none equal (ignoring case) to a name already taken (the
 * player's). If the pool runs short, numbered handles fill the rest.
 */
export function dealCallsigns(n: number, taken: readonly string[] = [], rng: () => number = Math.random): string[] {
  const used = new Set(taken.map((t) => t.trim().toUpperCase()));
  const pool = CALLSIGNS.filter((c) => !used.has(c));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, n);
  for (let k = 1; out.length < n; k++) if (!used.has(`UNIT-${k}`)) out.push(`UNIT-${k}`);
  return out;
}
