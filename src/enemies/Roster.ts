/*
  Roster filtering (8.0): a game mode says which classes of unit it wants, and the roster it spawns
  from is filtered through that request. Units are described by class (what they fight with), so a
  mode never names unit types it doesn't know about.

   - Survival (Waves) keeps its designed wave compositions (runners and gunners): it asks for ANY.
   - Team Deathmatch asks for RANGED_ONLY: a blade in a firefight only fed tickets to the other team
     (7.0 playtest). Every slot keeps its callsign and team, so it stays 5 v 5.

  Pure: no three.js, no game state. Tested in roster.test.ts.
*/

/** The unit types the engine can build (Enemy.kind). */
export type UnitKind = 'gunner' | 'runner';

/** What a unit fights with. */
export type UnitClass = 'ranged' | 'melee';

export const UNIT_CLASS: Record<UnitKind, UnitClass> = { gunner: 'ranged', runner: 'melee' };

/** What a mode asks of its roster: the classes it allows, and what a disallowed slot becomes. */
export interface RosterRequest {
  readonly allow: readonly UnitClass[];
  /** The kind a disallowed slot is filled with (must itself be allowed). */
  readonly substitute: UnitKind;
}

export const ANY: RosterRequest = { allow: ['ranged', 'melee'], substitute: 'gunner' };
export const RANGED_ONLY: RosterRequest = { allow: ['ranged'], substitute: 'gunner' };

export function allows(req: RosterRequest, kind: UnitKind) {
  return req.allow.includes(UNIT_CLASS[kind]);
}

/** One roster slot: a callsign and the kind it spawns as. */
export type Slot = readonly [name: string, kind: UnitKind];

/**
 * The roster as the mode will spawn it: every slot kept (same names, same count), disallowed kinds
 * replaced by the request's substitute.
 */
export function filterRoster(slots: readonly Slot[], req: RosterRequest): Slot[] {
  if (!allows(req, req.substitute)) throw new Error(`roster substitute ${req.substitute} is not allowed by the request`);
  return slots.map(([name, kind]) => [name, allows(req, kind) ? kind : req.substitute] as const);
}
