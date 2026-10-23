import * as THREE from 'three';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ArenaDirector, type ArenaMember } from './ArenaDirector';
import { ARENA } from './ArenaCtx';
import { GANGWAY_HEADS, HIGH_GROUND, SHIP, zoneAt } from '../../levels/oldport/OldPortLayout';

const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const bot = (uid: number, pos: THREE.Vector3, alive = true): ArenaMember => ({ uid, pos, alive, isPlayer: false });
const POSTS = [v(0, 0, 3.6), v(20, 0, 1)];
/** A director keeping watch on two posts: hold 8–14 s, a new watch 15 s after one ends, sent from ≤ 45 m. */
function director(extra: { rise?: number; free?: (m: ArenaMember) => boolean } = {}) {
  const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
  d.setWatch({ points: POSTS, hold: [8, 14], every: 15, reach: 45, rise: extra.rise }, extra.free);
  return d;
}
/** Director updates, as Tdm runs them (each call is one director tick). */
function tick(d: ArenaDirector, now: number, members: ArenaMember[]) {
  d.update(now, members, 7, { own: 50, theirs: 50 });
}

describe('37.1: the high-ground watch (TdmData.highGround)', () => {
  // 42.0: with roles on the anchors hold the high ground and the watches are off: these are the 41.0 team.
  const roles0 = ARENA.roles.on;
  beforeEach(() => void (ARENA.roles.on = false));
  afterEach(() => void (ARENA.roles.on = roles0));
  it('posts the nearest bot within reach to the post held least lately, and only that one', () => {
    const d = director();
    const a = bot(1, v(10, 0)), b = bot(2, v(3, 4)), far = bot(3, v(0, 50));
    tick(d, 0, [a, b, far]);
    expect(d.watchPost(2)).toEqual(POSTS[0]);
    expect(d.watchPost(1)).toBe(null);
    expect(d.watchPost(3)).toBe(null);
    expect(d.watchStats.posts).toBe(1);
  });

  it('holds once there, for `hold` s; then a gap of `every` s; then the other post', () => {
    const d = director();
    const b = bot(2, v(1, 1));
    tick(d, 0, [b]);
    expect(d.watchHeld(2)).toBe(false);
    expect(d.watchArrived(2, 5, () => 0)).toBe(true);
    expect(d.watchArrived(2, 6, () => 0)).toBe(false);
    expect(d.watchHeld(2)).toBe(true);
    tick(d, 12.9, [b]);
    expect(d.watchPost(2)).toEqual(POSTS[0]);
    tick(d, 13.5, [b]);
    expect(d.watch).toBe(null);
    tick(d, 20, [b]);
    expect(d.watch).toBe(null);
    tick(d, 28.6, [b]);
    expect(d.watchPost(2)).toEqual(POSTS[1]);
  });

  it('a posted bot that dies, or never gets there, is released', () => {
    const d = director();
    tick(d, 0, [bot(2, v(1, 1))]);
    tick(d, 1, [bot(2, v(1, 1), false)]);
    expect(d.watch).toBe(null);
    const e = director();
    tick(e, 0, [bot(4, v(30, 0))]);
    expect(e.watchPost(4)).not.toBe(null);
    // 20 s plus a second per 2 m (30 m): 35 s to get there.
    tick(e, 34.5, [bot(4, v(30, 0))]);
    expect(e.watchPost(4)).not.toBe(null);
    tick(e, 35.5, [bot(4, v(30, 0))]);
    expect(e.watch).toBe(null);
    expect(e.watchStats).toMatchObject({ posts: 1, arrivals: 0, died: 0, timedOut: 1 });
    expect(d.watchStats).toMatchObject({ posts: 1, died: 1 });
  });

  it('only a free bot is sent (Tdm: out of any fight, most of its health); `rise` keeps it near the post\'s height', () => {
    const busy = new Set([2]);
    const d = director({ free: (m) => !busy.has(m.uid) });
    tick(d, 0, [bot(2, v(1, 1)), bot(5, v(8, 8))]);
    expect(d.watchPost(2)).toBe(null);
    expect(d.watchPost(5)).toEqual(POSTS[0]);
    // The post is at 3.6: from the floor 8 m under it, not with rise 4.5; from the quay (0), yes.
    const e = director({ rise: 4.5 });
    tick(e, 0, [bot(6, v(1, 1, -4.5)), bot(7, v(12, 0, 0))]);
    expect(e.watchPost(6)).toBe(null);
    expect(e.watchPost(7)).toEqual(POSTS[0]);
  });

  it('nobody within reach: nobody is sent (and it looks again 2 s later)', () => {
    const d = director();
    tick(d, 0, [bot(1, v(0, 50))]);
    expect(d.watch).toBe(null);
    tick(d, 2.5, [bot(1, v(0, 30))]);
    expect(d.watchPost(1)).not.toBe(null);
  });

  it('without highGround nobody is ever posted (every other map)', () => {
    const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
    tick(d, 0, [bot(1, v(0, 0))]);
    expect(d.watch).toBe(null);
    expect(d.watchPost(1)).toBe(null);
  });

  it('Old Port: the bridge roof is the post (on the mirror line: fair to both); the deck at the gangway heads is patrolled, mirrored', () => {
    expect(HIGH_GROUND.points).toHaveLength(1);
    const [bridge] = HIGH_GROUND.points;
    expect(zoneAt(bridge[0], bridge[1], bridge[2])?.id).toBe('bridge');
    expect(bridge[2]).toBe(0);
    for (const p of GANGWAY_HEADS) expect(zoneAt(p[0], p[1], p[2])?.id).toBe('deck');
    expect(GANGWAY_HEADS.map((p) => p[2]).sort((a, b) => a - b)).toEqual([-SHIP.gz, SHIP.gz]);
    expect(HIGH_GROUND.hold[0]).toBeGreaterThan(ARENA.patrol.dwell[1]);
  });
});
