import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALLEY_W, BAND, CORE, FAVELA_TEAM_SIZE, LANDING, ROW_END, SEGMENTS, SPAWN_ZONES, SQUARES, STREET, YARD, Z_END,
  alleyAt, bandX, bandY, favelaPlan, lanesOf, trackOf, zoneAt,
} from './FavelaLayout';
import levelSrc from './FavelaLevel.ts?raw';
import registrySrc from '../registry.ts?raw';
import { CollisionWorld } from '../../world/Collision';
import { stepAir } from '../../enemies/arena/Locomotion';

const plan = favelaPlan();
type Fp = { x0: number; x1: number; z0: number; z1: number };
const gap = (a: Fp, b: Fp) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.z0 - b.z1, b.z0 - a.z1, 0));
const key = (o: Fp & { y0?: number; y?: number; base?: number }, s = 1) => [o.x0, o.x1, ...[s * o.z0, s * o.z1].sort((p, q) => p - q), o.y0 ?? o.y ?? o.base ?? 0].map((n) => n.toFixed(2)).join(',');

describe('40.0: Favelas, the plan', () => {
  it('is in the menu: TDM, 10v10, its own biome (Portuguese) and track', () => {
    // (Read as source: building the registry needs a DOM for every level's textures.)
    expect(registrySrc).toMatch(/favelas: \{ info: FAVELAS_INFO, create: \(g\) => new FavelaLevel\(g\) \}/);
    expect(registrySrc).toMatch(/'maglev', 'favelas'\] as SettingId\[\]/);
    expect(levelSrc).toMatch(/modes: \['tdm'\]/);
    expect(levelSrc).toMatch(/teamSize: FAVELA_TEAM_SIZE/);
    expect(levelSrc).toMatch(/biome: 'favela'/);
    expect(levelSrc).toMatch(/music: 'favela_theme'/);
    expect(FAVELA_TEAM_SIZE).toBe(10);
  });

  it('mirror-symmetric about z = 0: every house, tower, stair, bridge, tank and prop has its twin', () => {
    for (const list of [plan.houses, plan.towers, plan.bridges, plan.props] as Fp[][]) {
      const all = new Set(list.map((o) => key(o)));
      for (const o of list) expect(all.has(key(o, -1)), key(o)).toBe(true);
    }
    const tanks = new Set(plan.tanks.map(([x, y, z]) => `${x},${y},${z}`));
    for (const [x, y, z] of plan.tanks) expect(tanks.has(`${x},${y},${-z}`)).toBe(true);
    // A stair that climbs along z climbs the other way in the mirror (its top is towards the middle in both).
    for (const s of plan.stairs) {
      const twin = plan.stairs.find((t) => t !== s && t.x0 === s.x0 && Math.abs(t.z0 + s.z1) < 1e-9);
      if (s.z0 < 0 && s.z1 > 0) continue;
      expect(twin, `${s.x0},${s.z0}`).toBeTruthy();
      expect(twin!.rise).toBe(s.axis === 'z' ? -s.rise : s.rise);
      if (s.landing) expect(twin!.landing).toEqual([-s.landing[1], -s.landing[0]]);
    }
  });

  it('five terraces, 3 m apart; every house one storey, its roof level with the terrace above', () => {
    for (const h of plan.houses) {
      expect(h.y1 - h.y0).toBeCloseTo(BAND.rise);
      expect(h.y0).toBe(bandY(h.band));
      expect(h.y1).toBe(bandY(h.band + 1));
    }
    expect(bandY(BAND.n - 1)).toBe(12);
  });

  it('every alley is 4 m wide and changes track at the squares: no straight line down an alley past a segment', () => {
    for (let k = 1; k < BAND.n; k++) {
      for (let s = 0; s < SEGMENTS.length; s++) {
        const [a, b] = SEGMENTS[s];
        const al = alleyAt(k, (a + b) / 2)!;
        expect(al[1] - al[0]).toBe(ALLEY_W);
        if (s > 0) expect(trackOf(k, s)).not.toBe(trackOf(k, s - 1));
      }
      // Consecutive segments' alleys share no x: a line along z leaves the alley at the square.
      const x0 = alleyAt(k, 5)!, x1 = alleyAt(k, 20)!;
      expect(Math.min(x0[1], x1[1]) - Math.max(x0[0], x1[0])).toBeLessThanOrEqual(0);
      for (const [a, b] of SQUARES) expect(alleyAt(k, (a + b) / 2)![1] - alleyAt(k, (a + b) / 2)![0]).toBe(8);
    }
    expect(alleyAt(0, 20)).toEqual([STREET.x0, STREET.x1]);
  });

  it('no slot a body wedges in: what stands on one floor touches or leaves ≥ 1.3 m (houses, props, stairs, landings)', () => {
    // Footprints standing on each floor (a terrace's height): houses, props, stairs (their foot's floor), landings.
    const onFloor = new Map<number, (Fp & { what: string })[]>();
    const put = (y: number, f: Fp, what: string) => onFloor.set(y, [...(onFloor.get(y) ?? []), { ...f, what }]);
    for (const h of plan.houses) put(h.y0, h, 'house');
    for (const p of plan.props) put(bandY(Math.max(0, Math.floor((p.x0 - BAND.x0) / BAND.w))), p, p.kind);
    for (const s of plan.stairs) {
      put(s.base, s, `stair ${s.kind}`);
      if (s.landing) put(s.base, { x0: s.x0, x1: s.x1, z0: s.landing[0], z1: s.landing[1] }, 'landing');
    }
    const bad: string[] = [];
    for (const [y, list] of onFloor) {
      // Pieces that touch are one obstacle (a stair, its landing and the house it climbs): compare those.
      const root = list.map((_, i) => i);
      const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (gap(list[i], list[j]) <= 0.01) root[find(i)] = find(j);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          if (find(i) === find(j)) continue;
          const g = gap(list[i], list[j]);
          if (g < 1.3) bad.push(`y${y} ${list[i].what} [${list[i].x0},${list[i].z0}] ~ ${list[j].what} [${list[j].x0},${list[j].z0}]: ${g.toFixed(2)}`);
        }
    }
    expect(bad).toEqual([]);
  });

  it('the roofs: a tower or a tank leaves the roof walkable round it; the tanks are vault height', () => {
    const roofOf = (x: number, z: number, y: number) => plan.houses.find((h) => h.y1 === y && x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
    for (const [x, y, z] of plan.tanks) expect(roofOf(x, z, y), `tank ${x},${z}`).toBeTruthy();
    for (const t of plan.towers) expect(t.y0).toBe(plan.houses.find((h) => Math.abs(h.y1 - t.y0) < 1e-9 && h.x0 <= t.x0 + 1e-9 && h.x1 >= t.x1 - 1e-9 && h.z0 < t.z1 && h.z1 > t.z0)!.y1);
  });

  it('the roof stairs: a landing at the top, level with the roof, on the house\'s side', () => {
    const roofs = plan.stairs.filter((s) => s.kind === 'roof');
    expect(roofs.length).toBeGreaterThan(10);
    for (const s of roofs) {
      expect(s.landing![1] - s.landing![0]).toBeCloseTo(LANDING);
      // The landing at the top end: past z1 when it climbs +z, before z0 when it climbs −z.
      if (s.rise > 0) expect(s.landing![0]).toBeCloseTo(s.z1);
      else expect(s.landing![1]).toBeCloseTo(s.z0);
      expect(s.top - s.base).toBe(BAND.rise);
    }
  });

  it('the escadarias climb the whole hill: one per band boundary at z = 0, and at each team\'s end', () => {
    for (let k = 0; k < BAND.n - 1; k++) {
      expect(plan.stairs.some((s) => s.kind === 'escadaria' && s.base === bandY(k) && s.z0 === -CORE && s.z1 === CORE && s.x1 === bandX(k + 1))).toBe(true);
      for (const sgn of [1, -1]) expect(plan.stairs.some((s) => s.kind === 'escadaria' && s.base === bandY(k) && Math.sign(s.z0 + s.z1) === sgn && Math.abs(s.z0) >= ROW_END - 1e-9 - (sgn < 0 ? 3 : 0))).toBe(true);
    }
  });

  it('the deployment zones: low, middle and high for each team, the same heights (fair)', () => {
    expect(SPAWN_ZONES.symmetry).toBe('mirror');
    expect(SPAWN_ZONES.half.map((z) => z.y)).toEqual([0, bandY(2), bandY(4)]);
    for (const z of SPAWN_ZONES.half) {
      expect(z.z).toBeGreaterThan(YARD);
      expect(z.z + z.r).toBeLessThan(Z_END);
    }
  });

  it('the lanes: one a terrace, OMEGA\'s the mirror listed from its own left', () => {
    const a = lanesOf('alpha'), o = lanesOf('omega');
    expect(a).toHaveLength(BAND.n);
    o.forEach((L, i) => L.forEach((p, j) => {
      const q = a[BAND.n - 1 - i][j];
      expect([p.x, p.y, p.z]).toEqual([q.x, q.y, -q.z]);
    }));
  });

  it('the zones read the place: the yards, the escadaria, a roof, an alley', () => {
    expect(zoneAt(0, 6, 52)?.id).toBe('alphaYard');
    expect(zoneAt(0, 6, -52)?.id).toBe('omegaYard');
    expect(zoneAt(-20, 3, 0.5)?.id).toBe('escadaria');
    expect(zoneAt(-20, 6, 20)?.id).toBe('lajes');
    expect(zoneAt(-43, 0, 20)?.id).toBe('rua');
    expect(zoneAt(40, 12, 20)?.id).toBe('mirante');
  });
});

describe('40.0: a bot\'s fall lands on the box floors it passes (stepAir, swept)', () => {
  it('falling fast onto a box floor stops on it (it fell through, into the fill, at > 3 m/s)', () => {
    const col = new CollisionWorld();
    col.add(-5, -0.5, -5, 5, 3, 5);
    for (const vy of [-4, -8, -14]) {
      const pos = new THREE.Vector3(0, 3.3, 0);
      const air = { up: true, vy, t: 0.6 };
      for (let i = 0; i < 60 && air.up; i++) stepAir(air, pos, col, 0.45, 1 / 60);
      expect(air.up).toBe(false);
      expect(pos.y).toBeCloseTo(3);
    }
  });
});

