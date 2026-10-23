import * as THREE from 'three';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CollisionWorld, type Collider } from '../../world/Collision';
import { Nav } from '../../enemies/Nav';
import { ArenaDirector, type ArenaMember } from '../../enemies/arena/ArenaDirector';
import { ARENA, applyProfile } from '../../enemies/arena/ArenaCtx';
import { mulberry32 } from '../../core/math';
import { buildRuins } from './Ruins';
import { DESERT_AI, FLANK_PULL, OUTER, OUTER_LANES_SOUTH, RUINS, flankOf, inRuins } from './ArenaLayout';
import { TRENCH, desertHeight } from './Terrain';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function ruins() {
  const col = new CollisionWorld();
  const scene = new THREE.Scene();
  const r = buildRuins({ col, scene, mat: new THREE.MeshStandardMaterial(), rnd: mulberry32(1) });
  return { col, scene, r };
}

/** Horizontal gap between two colliders' footprints (0 when they touch or overlap). */
function gap(a: Collider, b: Collider) {
  if (a.kind === 'cyl' && b.kind === 'cyl') return Math.max(0, Math.hypot(a.cx! - b.cx!, a.cz! - b.cz!) - a.r! - b.r!);
  if (a.kind === 'cyl' || b.kind === 'cyl') {
    const [c, x] = a.kind === 'cyl' ? [a, b] : [b, a];
    const dx = Math.max(x.min.x - c.cx!, 0, c.cx! - x.max.x), dz = Math.max(x.min.z - c.cz!, 0, c.cz! - x.max.z);
    return Math.max(0, Math.hypot(dx, dz) - c.r!);
  }
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0), dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
  return Math.hypot(dx, dz);
}

describe('38.0: the ruins on the outer flanks', () => {
  it('two ruins, one the 180° rotation of the other (every collider has its twin)', () => {
    const { col } = ruins();
    const key = (c: Collider, s: number) => [s * c.min.x, s * c.max.x].sort((p, q) => p - q).concat([s * c.min.z, s * c.max.z].sort((p, q) => p - q)).map((n) => n.toFixed(2)).join(',') + c.kind;
    const west = col.colliders.filter((c) => c.max.x < 0), east = new Set(col.colliders.filter((c) => c.min.x > 0).map((c) => key(c, 1)));
    expect(west.length).toBeGreaterThan(40);
    expect(west.length).toBe(east.size);
    for (const c of west) expect(east.has(key(c, -1))).toBe(true);
  });

  it('mirror-symmetric about the flank\'s midline (z = 0): both teams meet the same walls', () => {
    const { col } = ruins();
    // (Footprints: the dunes under the two halves differ, so the stairs' fill under their ramps does too.)
    const west = col.colliders.filter((c) => c.max.x < 0 && c.kind !== 'ramp' && c.floor);
    const fp = (c: Collider, s: number) => [c.min.x, c.max.x, ...[s * c.min.z, s * c.max.z].sort((p, q) => p - q)].map((n) => n.toFixed(2)).join(',');
    const all = new Set(west.map((c) => fp(c, 1)));
    expect(west.filter((c) => !all.has(fp(c, -1))).map((c) => fp(c, 1))).toEqual([]);
  });

  it('no slot a body wedges in: what stands in the court touches or leaves ≥ 1.3 m', () => {
    const { col } = ruins();
    // Solids a body walks among (not the lintels, the capitals or the gallery's broken columns, up out of reach).
    const low = col.colliders.filter((c) => c.solid && c.max.x < 0 && c.min.y < desertHeight((c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2) + 1.8);
    // Pieces that touch are one obstacle (a wall's stretches, a stair's fill): compare the obstacles.
    const group = low.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
    for (let i = 0; i < low.length; i++) for (let j = i + 1; j < low.length; j++) if (gap(low[i], low[j]) <= 0.01) group[root(i)] = root(j);
    const bad: string[] = [];
    for (let i = 0; i < low.length; i++)
      for (let j = i + 1; j < low.length; j++) {
        if (root(i) === root(j)) continue;
        const g = gap(low[i], low[j]);
        if (g < 1.3) bad.push(`${low[i].min.toArray().map((n) => n.toFixed(1))} ~ ${low[j].min.toArray().map((n) => n.toFixed(1))}: ${g.toFixed(2)}`);
      }
    expect(bad).toEqual([]);
  });

  it('rubble, fallen columns and blocks are vaulted; walls, piers, the well-house and the gallery are not', () => {
    const { col } = ruins();
    for (const c of col.colliders.filter((c) => c.solid && c.max.x < 0)) {
      const tall = c.max.y - Math.max(desertHeight(c.min.x, c.min.z), desertHeight(c.max.x, c.max.z));
      if (c.vault) expect(tall).toBeLessThanOrEqual(1.35);
      else if (c.floor && c.min.y < desertHeight(c.min.x, c.min.z)) expect(tall).toBeGreaterThan(1.35);
    }
  });

  it('the galleries are the watch posts, over the court, on the rotation\'s line; the stairs climb to them', () => {
    const { r } = ruins();
    const [w, e] = r.posts;
    expect(w.x).toBeCloseTo(-e.x);
    expect(w.z).toBe(0);
    expect(inRuins(w.x, w.z) && inRuins(e.x, e.z)).toBe(true);
    expect(w.y - desertHeight(RUINS.cx, 0)).toBeGreaterThan(2);
    // Each gallery's centre is linked to its two stair tops; each stair runs foot → middle → top.
    const centre = r.nodes.findIndex((n) => n.distanceTo(w) < 0.01);
    expect(r.links.filter(([i, j]) => i === centre || j === centre)).toHaveLength(2);
  });

  it('masonry and drums are instanced: four meshes for both ruins, hundreds of pieces', () => {
    const { scene } = ruins();
    const im = scene.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(im.map((m) => m.name).sort()).toEqual(['ruinsBlocksE', 'ruinsBlocksW', 'ruinsDrumsE', 'ruinsDrumsW']);
    for (const m of im) expect(m.count).toBeGreaterThan(m.name.includes('Blocks') ? 200 : 20);
  });

  it('the outer lane runs through both gates; the trench now starts at the south gate; the convoy cleared it', () => {
    const W = OUTER_LANES_SOUTH[0];
    const inside = W.filter(([x, z]) => inRuins(x, z));
    expect(inside.length).toBeGreaterThanOrEqual(4);
    expect(inside.some(([, z]) => z > 5) && inside.some(([, z]) => z < -5)).toBe(true);
    expect(TRENCH.z0).toBeGreaterThan(RUINS.z);
    expect(OUTER.traverses.every((t) => t.z > TRENCH.z0 + 3)).toBe(true);
    // The truck (east frame) 3 m off the rotated ruin's gate; the APC clear of the truck's corner.
    expect(OUTER.truck.cab[0] - RUINS.z).toBeGreaterThanOrEqual(3);
    expect(Math.hypot(OUTER.apc.x0 - OUTER.truck.x1, OUTER.apc.z0 - OUTER.truck.bed[1])).toBeGreaterThanOrEqual(1.3);
  });
});

describe('38.0: the flanks\' pull (ARENA.flankPull, TdmData.flankOf)', () => {
  const lanes = [[v(0, 0, 60), v(0, 0, -60)]];
  const centre = v(0, 0, 0), inner = v(50, 0, 0), outer = v(-75, 0, 0);
  function director() {
    const d = new ArenaDirector('alpha', v(0, 0, 60), v(0, 0, -60), lanes);
    d.setPatrol([centre, inner, outer]);
    d.setFlanks((x) => flankOf(x));
    return d;
  }

  it('the desert: none in the centre, the hamlet and the wadi a little, the cliffs\' flanks most', () => {
    expect(flankOf(0)).toBe(0);
    expect(flankOf(-39)).toBe(0);
    expect(flankOf(50)).toBe(FLANK_PULL.innerW);
    expect(flankOf(-75)).toBe(FLANK_PULL.outerW);
    expect(FLANK_PULL.outerW).toBeGreaterThan(FLANK_PULL.innerW);
    expect(DESERT_AI.flankPull?.on).toBe(true);
    expect(DESERT_AI.directRise).toBe(1);
  });

  it('off (every other map): areas score as before', () => {
    const d = director();
    expect(d.patrolScore(2, 0, 0, 0)).toBeCloseTo(d.patrolScore(0, 0, 0, 0));
  });

  it('on: a flank\'s areas gain `base` × weight; a hot centre adds up to `hot` × weight, and cools', () => {
    const undo = applyProfile({ flankPull: { on: true } });
    try {
      const F = ARENA.flankPull;
      const d = director();
      const s = (i: number, now = 0) => d.patrolScore(i, 0, 0, now) - d.patrolScore(0, 0, 0, now);
      expect(s(2)).toBeCloseTo(F.base * FLANK_PULL.outerW);
      expect(s(1)).toBeCloseTo(F.base * FLANK_PULL.innerW);
      // Deaths in the centre (the compound): the flanks draw harder. (Activity also heats the centre's area: compare the flanks.)
      for (let k = 0; k < 8; k++) d.addHeat(centre, 1, 1);
      d.patrolPick(99, v(0, 0, 30), 1, () => 0);
      const hot = d.patrolScore(2, 0, 0, 1) - d.patrolScore(1, 0, 0, 1);
      expect(hot).toBeCloseTo((F.base + F.hot) * (FLANK_PULL.outerW - FLANK_PULL.innerW));
      // A death out on a flank doesn't heat the centre.
      const before = d.centreHeat;
      d.addHeat(outer, 1, 1);
      expect(d.centreHeat).toBe(before);
      // Halved every halfLife s.
      d.patrolPick(99, v(0, 0, 30), 1 + F.halfLife, () => 0);
      expect(d.centreHeat).toBeCloseTo(before / 2);
      // The endgame (a team on its last stand): no pull.
      const t = 1 + F.halfLife;
      const pulled = d.patrolScore(2, 0, 0, t);
      d.endgame = true;
      expect(pulled - d.patrolScore(2, 0, 0, t)).toBeCloseTo(FLANK_PULL.outerW * (F.base + F.hot * Math.min(1, d.centreHeat / F.ref)));
    } finally {
      undo();
    }
  });
});

describe('38.0: high-ground watches at once (HighGround.count)', () => {
  // 42.0: with roles on the anchors hold the high ground and the watches are off: these are the 41.0 team.
  const roles0 = ARENA.roles.on;
  beforeEach(() => void (ARENA.roles.on = false));
  afterEach(() => void (ARENA.roles.on = roles0));
  const posts = [v(-80, 5, 0), v(80, 5, 0)];
  const bot = (uid: number, p: THREE.Vector3, alive = true): ArenaMember => ({ uid, pos: p, alive, isPlayer: false });
  const tick = (d: ArenaDirector, now: number, m: ArenaMember[]) => d.update(now, m, 7, { own: 50, theirs: 50 });
  function director(count?: number) {
    const d = new ArenaDirector('alpha', v(0, 0, 60), v(0, 0, -60), []);
    d.setWatch({ points: posts, hold: [10, 16], every: 10, reach: 40, count });
    return d;
  }

  it('count 2: a bot on each post, each the nearest to its own; a third stays free', () => {
    const d = director(2);
    const a = bot(1, v(-70, 0, 5)), b = bot(2, v(70, 0, -5)), c = bot(3, v(-72, 0, 8));
    tick(d, 0, [a, b, c]);
    tick(d, 2.5, [a, b, c]);
    expect(d.watches).toHaveLength(2);
    expect(d.watchPost(1)).toEqual(posts[0]);
    expect(d.watchPost(2)).toEqual(posts[1]);
    expect(d.watchPost(3)).toBe(null);
  });

  it('the second is posted 2 s after the first (they don\'t leave together); a lost one is replaced `every` s later', () => {
    const d = director(2);
    const a = bot(1, v(-70, 0, 5)), b = bot(2, v(70, 0, -5)), c = bot(3, v(-72, 0, 8));
    tick(d, 0, [a, b, c]);
    expect(d.watches).toHaveLength(1);
    tick(d, 1, [a, b, c]);
    expect(d.watches).toHaveLength(1);
    tick(d, 2.25, [a, b, c]);
    expect(d.watches).toHaveLength(2);
    const lost = d.watches[0];
    const left = [a, b, c].filter((m) => m.uid !== lost.uid);
    tick(d, 3, left);
    expect(d.watches).toHaveLength(1);
    tick(d, 12.5, left);
    expect(d.watches).toHaveLength(1);
    tick(d, 13.25, left);
    expect(d.watches).toHaveLength(2);
    expect(new Set(d.watches.map((w) => w.post)).size).toBe(2);
  });

  it('default (one post, no count): one watch at a time, as 37.1', () => {
    const d = director();
    tick(d, 0, [bot(1, v(-70, 0, 5)), bot(2, v(70, 0, -5))]);
    tick(d, 5, [bot(1, v(-70, 0, 5)), bot(2, v(70, 0, -5))]);
    expect(d.watches).toHaveLength(1);
  });
});

describe('38.0: vault links are walked both ways', () => {
  it('a wall knee-high from the sand and 1.65 m from a trench\'s floor is no link (either way)', () => {
    const col = new CollisionWorld();
    // Ground at 0 west of x = 0; a pit floor at -1.3 east of x = 0.4; a sandbag wall on the pit's rim, top 0.35.
    col.add(-20, -1, -10, 0, 0, 10);
    col.add(0.4, -2, -10, 20, -1.3, 10);
    col.add(0, -2, -10, 0.4, 0.35, 10).vault = true;
    // And a plain knee-high wall between two ground floors further north.
    col.add(-20, -1, 12, 20, 0, 30);
    col.add(-0.2, 0, 12, 0.2, 0.6, 30).vault = true;
    const nav = new Nav(col, { nodes: [v(-4, 0, 0), v(4, -1.3, 0), v(-4, 0, 20), v(4, 0, 20)], links: [] });
    const ve = nav.ensureVaultLinks(0.32);
    expect(ve[0].includes(1)).toBe(false);
    expect(ve[1].includes(0)).toBe(false);
    expect(ve[2].includes(3)).toBe(true);
  });
});
