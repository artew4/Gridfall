/**
 * Barks: enemies say what they are about to do. The point is legibility — the player hears "flanking
 * left!" and then sees it happen, so simple rules read as intent. Two rules keep it from becoming
 * noise: a squad speaks one line at a time (global gap, per-kind and per-speaker cooldowns), and
 * higher priority lines may cut the global gap short. Pure (no DOM, no audio): the view and the
 * audio engine subscribe to what this lets through.
 */
export type BarkKind =
  | 'contact'
  | 'lost'
  | 'search'
  | 'giveup'
  | 'heard'
  | 'flankL'
  | 'flankR'
  | 'suppress'
  | 'reload'
  | 'pinned'
  | 'blown'
  | 'go'
  | 'manDown'
  | 'moving'
  // 6.0, Team Deathmatch: a hostile down, and the ALPHA bots fitting round what the human does.
  | 'kill'
  | 'withYou'
  | 'coverYou'
  | 'flankWhile'
  | 'otherFlankL'
  | 'otherFlankR';

export type Voice = 'synth' | 'human';

/** Lines per voice. Synths speak in clipped protocol; humans shout. */
export const BARK_LINES: Record<Voice, Record<BarkKind, string[]>> = {
  human: {
    contact: ['Contact!', 'There he is!', 'Eyes on!'],
    lost: ['I lost him!', 'Where did he go?', 'Lost visual!'],
    search: ['Spread out, find him!', 'Check the corners!', 'Search the area!'],
    giveup: ['He’s gone. Hold here.', 'Nothing. Stay sharp.'],
    heard: ['Shots! Over there!', 'Gunfire, move!'],
    flankL: ['Flanking left!', 'Going left!'],
    flankR: ['Flanking right!', 'Going right!'],
    suppress: ['Suppressing!', 'Keep his head down!', 'Covering fire!'],
    reload: ['Reloading!', 'Changing mags!'],
    pinned: ['Taking fire!', 'I’m pinned!', 'Get down!'],
    blown: ['He’s flanking!', 'Cover’s blown!', 'Moving, moving!'],
    go: ['Go, go, go!', 'Rush him!', 'Now! Get him!'],
    manDown: ['Man down!', 'We lost one!'],
    moving: ['Moving up!', 'Pushing!'],
    kill: ['Got one!', 'Tango down!', 'He’s down!'],
    withYou: ['Right behind you!', 'With you, push!', 'Covering your advance!'],
    coverYou: ['Fall back, I’ve got you!', 'Covering you, move!'],
    flankWhile: ['Keep firing, I’m going round!', 'Hold them there, flanking!'],
    otherFlankL: ['You go right, I’ve got left!', 'Taking the left!'],
    otherFlankR: ['You go left, I’ve got right!', 'Taking the right!'],
  },
  synth: {
    contact: ['TARGET ACQUIRED', 'CONTACT'],
    lost: ['TARGET LOST', 'VISUAL LOST'],
    search: ['SWEEP PATTERN', 'SEARCHING SECTOR'],
    giveup: ['TRACE COLD. HOLDING', 'NO SIGNAL. HOLDING'],
    heard: ['GUNFIRE VECTOR', 'AUDIO CONTACT'],
    flankL: ['FLANK VECTOR LEFT'],
    flankR: ['FLANK VECTOR RIGHT'],
    suppress: ['SUPPRESSING', 'AREA DENIAL'],
    reload: ['RELOADING', 'CELL SWAP'],
    pinned: ['UNDER FIRE', 'TAKING DAMAGE'],
    blown: ['COVER COMPROMISED', 'REPOSITIONING'],
    go: ['ENGAGE ENGAGE', 'SWARM'],
    manDown: ['UNIT LOST', 'SIGNAL DROPPED'],
    moving: ['ADVANCING'],
    kill: ['HOSTILE ELIMINATED'],
    withYou: ['ESCORTING'],
    coverYou: ['COVERING RETREAT'],
    flankWhile: ['FLANKING UNDER COVER'],
    otherFlankL: ['LEFT VECTOR'],
    otherFlankR: ['RIGHT VECTOR'],
  },
};

/** Higher wins the floor (and may cut the global gap). */
export const BARK_PRIORITY: Record<BarkKind, number> = {
  contact: 3, lost: 3, go: 3, blown: 2, flankL: 2, flankR: 2, reload: 2, pinned: 2, suppress: 1, heard: 2, search: 1, giveup: 1, manDown: 1, moving: 0,
  kill: 2, withYou: 3, coverYou: 3, flankWhile: 3, otherFlankL: 3, otherFlankR: 3,
};

/** Seconds before the same kind may be heard again from anyone. */
export const BARK_KIND_COOLDOWN: Record<BarkKind, number> = {
  contact: 6, lost: 6, go: 5, blown: 3, flankL: 5, flankR: 5, reload: 4, pinned: 4, suppress: 7, heard: 6, search: 10, giveup: 20, manDown: 6, moving: 8,
  kill: 4, withYou: 8, coverYou: 6, flankWhile: 8, otherFlankL: 8, otherFlankR: 8,
};

export const BARK_GAP = 1.3;
export const BARK_GAP_PRIORITY = 0.5;
export const BARK_SPEAKER_COOLDOWN = 2.5;

export interface BarkEvent<S> {
  speaker: S;
  kind: BarkKind;
  text: string;
  t: number;
}

export class BarkGate<S> {
  private last = -Infinity;
  private kindT = new Map<BarkKind, number>();
  private speakerT = new Map<S, number>();
  private lineIdx = 0;
  /** Everything said, most recent last (bounded); the view and tests read it. */
  log: BarkEvent<S>[] = [];
  onBark: (e: BarkEvent<S>) => void = () => {};
  /**
   * 8.1: a mode may silence a squad completely (Team Deathmatch: a callout floating over a bot, or
   * its voice, gives its position away). Nothing is said, shown or logged while off.
   */
  enabled = true;

  reset() {
    this.last = -Infinity;
    this.kindT.clear();
    this.speakerT.clear();
    this.log.length = 0;
  }

  /** Returns the line if it was let through. */
  say(speaker: S, kind: BarkKind, voice: Voice, now: number): string | null {
    if (!this.enabled) return null;
    const pri = BARK_PRIORITY[kind];
    const gap = pri >= 3 ? BARK_GAP_PRIORITY : BARK_GAP;
    if (now - this.last < gap) return null;
    if (now - (this.kindT.get(kind) ?? -Infinity) < BARK_KIND_COOLDOWN[kind]) return null;
    if (now - (this.speakerT.get(speaker) ?? -Infinity) < BARK_SPEAKER_COOLDOWN && pri < 3) return null;
    const lines = BARK_LINES[voice][kind];
    const text = lines[this.lineIdx++ % lines.length];
    this.last = now;
    this.kindT.set(kind, now);
    this.speakerT.set(speaker, now);
    const e = { speaker, kind, text, t: now };
    this.log.push(e);
    if (this.log.length > 64) this.log.shift();
    this.onBark(e);
    return text;
  }
}
