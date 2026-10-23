import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { ArenaDirector, type ArenaMember } from './ArenaDirector';
import { ARENA } from './ArenaCtx';
import { regen } from './ArenaBots';
import { anchorPosts, pickRole, postScore, roleArm, type ArenaRole, type PostOptions } from './Roles';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync } from 'node:fs';

const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const member = (uid: number, pos: THREE.Vector3): ArenaMember => ({ uid, pos, alive: true, isPlayer: false });
const LANES = [[v(-30, 40), v(-30, -40)], [v(0, 40), v(0, -40)], [v(30, 40), v(30, -40)]];
const tick = (d: ArenaDirector, ms: ArenaMember[], now: number) => d.update(now, ms, 5, { own: 25, theirs: 25 });
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('42.0 roles: who plays what', () => {
  const share = ARENA.roles.share;
  it('dealt one by one, a team of 12 is 6 frontliners, 3 wolves, 3 anchors; of 4: 2, 1, 1', () => {
    for (const [n, want] of [[12, [6, 3, 3]], [4, [2, 1, 1]], [8, [4, 2, 2]]] as const) {
      const counts: Record<ArenaRole, number> = { frontliner: 0, wolf: 0, anchor: 0 };
      for (let i = 0; i < n; i++) counts[pickRole(counts, n, share, true)]++;
      expect([counts.frontliner, counts.wolf, counts.anchor]).toEqual(want);
    }
  });

  it('the first bot of a team is a frontliner; no anchor without a free post', () => {
    expect(pickRole({ frontliner: 0, wolf: 0, anchor: 0 }, 1, share, true)).toBe('frontliner');
    expect(pickRole({ frontliner: 2, wolf: 1, anchor: 0 }, 4, share, false)).not.toBe('anchor');
  });

  it('the guns: an anchor the rifle (cap or not), a wolf a pistol or SMG, a frontliner mostly a shotgun or rifle', () => {
    for (let i = 0; i < 20; i++) expect(roleArm('anchor', ['ar', 'ar', 'ar'], 2).id).toBe('ar');
    const wolf = new Set(Array.from({ length: 40 }, (_, i) => roleArm('wolf', [], Infinity, seq(i / 40)).id));
    expect([...wolf].sort()).toEqual(['pistol', 'smg']);
    const front = Array.from({ length: 100 }, (_, i) => roleArm('frontliner', [], Infinity, seq(i / 100)).id);
    expect(front.filter((g) => g === 'shotgun' || g === 'ar').length).toBe(80);
    // Two shotguns among the frontliners already (cap 2): another frontliner gets something else.
    for (let i = 0; i < 20; i++) expect(roleArm('frontliner', ['shotgun', 'shotgun'], 2, seq(i / 20)).id).not.toBe('shotgun');
    // Six frontliners: a gun's cap is its share of them when more (0.4 x 6: three shotguns).
    expect(roleArm('frontliner', ['shotgun', 'shotgun'], 2, () => 0, 6).id).toBe('shotgun');
    expect(roleArm('frontliner', ['shotgun', 'shotgun', 'shotgun'], 2, () => 0, 6).id).not.toBe('shotgun');
  });
});

describe('42.0 anchor posts', () => {
  /** An open field (sight 60 m everywhere) but for a wall 3 m south of the point (0, 20): its back. */
  const opts = (extra: Partial<PostOptions> = {}): PostOptions => ({
    progress: (p) => -p.z / 50,
    axis: { x: 0, z: -1 },
    sight: (from, _dx, dz, max) => (Math.abs(from.x) < 1 && Math.abs(from.z - 20) < 1 && dz > 0.9 ? 3 : max),
    count: 3,
    gap: 12,
    ...extra,
  });

  it('height, a wall at its back and the map high ground score; the band is the own half', () => {
    const o = opts();
    const flat = postScore({ pos: v(10, 20) }, o);
    expect(postScore({ pos: v(10, 20, 4) }, o)).toBeCloseTo(flat + 16);
    expect(postScore({ pos: v(0, 20) }, o)).toBeCloseTo(flat + 6);
    expect(postScore({ pos: v(10, 20), high: true }, o)).toBeCloseTo(flat + 20);
    // Past the middle (z < 0 is the enemy's side), never.
    expect(anchorPosts([{ pos: v(0, -10, 6) }, { pos: v(0, 10) }], o).map((p) => p.z)).toEqual([10]);
  });

  it('the best first, at least `gap` apart; only where a body can stand; a long walk from home costs', () => {
    const cands = [{ pos: v(0, 20, 5) }, { pos: v(3, 20, 5) }, { pos: v(30, 20, 2) }, { pos: v(-30, 20, 1) }];
    const posts = anchorPosts(cands, opts());
    expect(posts[0]).toEqual(v(0, 20, 5));
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) expect(Math.hypot(posts[i].x - posts[j].x, posts[i].z - posts[j].z)).toBeGreaterThanOrEqual(12);
    expect(anchorPosts(cands, opts({ reachable: (p) => p.y < 4 }))[0]).toEqual(v(30, 20, 2));
    // Home at (-30, 30): the post 60 m away loses to the one beside it.
    const far = anchorPosts([{ pos: v(30, 20, 2) }, { pos: v(-30, 20, 1) }], opts({ home: [v(-30, 30)], count: 1 }));
    expect(far[0]).toEqual(v(-30, 20, 1));
  });
});

describe('42.0 the director and the roles', () => {
  const on0 = ARENA.roles.on;
  afterEach(() => {
    ARENA.roles.on = on0;
  });
  const director = () => {
    const d = new ArenaDirector('alpha', v(0, 50), v(0, -50), LANES);
    d.setAnchorPosts([v(0, 20, 4), v(25, 25)]);
    d.teamBots = 8;
    return d;
  };

  it('an anchor takes the best free post; with none left it fights as a frontliner; the dead free theirs', () => {
    const d = director();
    expect(d.setRole(1, 'anchor')).toBe('anchor');
    expect(d.setRole(2, 'anchor')).toBe('anchor');
    expect(d.anchorPost(1)).toEqual(v(0, 20, 4));
    expect(d.anchorPost(2)).toEqual(v(25, 25));
    expect(d.setRole(3, 'anchor')).toBe('frontliner');
    d.friendDied({ uid: 1, pos: v(0, 20, 4) } as never, 1);
    expect(d.roles.has(1)).toBe(false);
    expect(d.setRole(4, 'anchor')).toBe('anchor');
    expect(d.anchorPost(4)).toEqual(v(0, 20, 4));
  });

  it("an anchor's post is its watch post: it arrives once, holds, and must arrive again after leaving it", () => {
    const d = director();
    d.setRole(1, 'anchor');
    expect(d.watchPost(1)).toEqual(v(0, 20, 4));
    expect(d.watchHeld(1)).toBe(false);
    expect(d.watchArrived(1, 0)).toBe(true);
    expect(d.watchArrived(1, 1)).toBe(false);
    expect(d.watchHeld(1)).toBe(true);
    d.leftPost(1);
    expect(d.watchHeld(1)).toBe(false);
  });

  it('pickRole keeps the shares over the living (a dead wolf is replaced by a wolf)', () => {
    const d = director();
    const roles = Array.from({ length: 8 }, (_, i) => d.setRole(i + 1, d.pickRole()));
    expect(roles.filter((r) => r === 'wolf').length).toBe(2);
    expect(roles.filter((r) => r === 'anchor').length).toBe(2);
    const wolf = roles.indexOf('wolf') + 1;
    d.friendDied({ uid: wolf, pos: v(0, 0) } as never, 1);
    expect(d.pickRole()).toBe('wolf');
  });

  it('fireteams are the frontliners only (in pairs at least); wolves and anchors play alone', () => {
    const d = director();
    const ms = [1, 2, 3, 4, 5, 6].map((u) => member(u, v(u, 50)));
    for (const [u, r] of [[1, 'frontliner'], [2, 'frontliner'], [3, 'wolf'], [4, 'anchor'], [5, 'frontliner'], [6, 'wolf']] as const) d.setRole(u, r);
    tick(d, ms, 1);
    expect(d.fireteamOf(3)).toBe(null);
    expect(d.fireteamOf(4)).toBe(null);
    expect(d.fireteamOf(1)!.length).toBeGreaterThanOrEqual(2);
    ARENA.roles.on = false;
    expect(d.roleOf(3)).toBe('frontliner');
  });

  it("a wolf's area: in their half (not their spawn), quiet, away from its team", () => {
    const d = director();
    // Areas: mid-way into their half (z -17.5), at their spawn (z -45), ours (z 20).
    d.setPatrol([v(0, -17.5), v(0, -45), v(0, 20), v(30, -17.5)]);
    tick(d, [member(1, v(0, 30)), member(2, v(29, -15)), member(3, v(31, -20))], 1);
    const s = (i: number) => d.wolfScore(i, 0, 0, 1, 1);
    expect(s(0)).toBeGreaterThan(s(1));
    expect(s(0)).toBeGreaterThan(s(2));
    // Two teammates by area 3: less than the empty one level with it.
    expect(s(0)).toBeGreaterThan(s(3));
    // Activity there makes it less of a way round.
    const quiet = s(0);
    d.addHeat(v(0, -17.5), 3, 1);
    expect(s(0)).toBeLessThan(quiet);
  });

  it('with roles on, the 37.1 watches are off (the anchors hold the high ground)', () => {
    const d = new ArenaDirector('alpha', v(0, 60), v(0, -60), []);
    d.setWatch({ points: [v(0, 0, 3.6)], hold: [8, 14], every: 15, reach: 45 });
    tick(d, [member(1, v(5, 0))], 20);
    expect(d.watches.length).toBe(0);
    ARENA.roles.on = false;
    tick(d, [member(1, v(5, 0))], 40);
    expect(d.watches.length).toBe(1);
  });
});

describe('42.0 regeneration and the brain', () => {
  const on0 = ARENA.regen.on;
  afterEach(() => {
    ARENA.regen.on = on0;
  });

  it("health comes back as the human's: none for `delay` s after a hit, then `rate` of it a second", () => {
    const e = { alive: true, hp: 60, maxHp: 150, pressureT: 10 };
    regen(e, 1, 14);
    expect(e.hp).toBe(60);
    regen(e, 1, 15.5);
    expect(e.hp).toBeCloseTo(60 + 0.05 * 150);
    for (let i = 0; i < 100; i++) regen(e, 1, 20 + i);
    expect(e.hp).toBe(150);
    ARENA.regen.on = false;
    const f = { alive: true, hp: 60, maxHp: 150, pressureT: 0 };
    regen(f, 1, 100);
    expect(f.hp).toBe(60);
  });

  // The brain's role behaviour is measured in self-play (tdmSim roles); its rules are pinned here.
  const ai = readFileSync(new URL('./DeathmatchAI.ts', import.meta.url), 'utf8');
  it('a wolf stalks with its gun down; an anchor never pushes, flanks or closes in; the warning shot misses', () => {
    expect(ai).toMatch(/const holdFire = this\.state === 'stalk' \|\| this\.state === 'recover'/);
    expect(ai).toMatch(/!anchor && dir\.claimPush/);
    expect(ai).toMatch(/this\.role === 'anchor'\) radial = 0/);
    expect(ai).toMatch(/R\.on && this\.role === 'wolf' && T\.isPlayer/);
    expect(ai).toMatch(/me\.fireRound\(ctx, _miss, 0,/);
  });
});
