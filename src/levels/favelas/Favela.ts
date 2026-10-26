import * as THREE from 'three';
import { StaticBuilder, worldBox } from '../../world/Builder';
import type { Collider, CollisionWorld } from '../../world/Collision';
import { fitStairWidth } from '../../world/StairFit';
import { plankTexture } from '../jungle/textures';
import type { Zone } from '../Level';
import {
  BAND, CORE, CROSS_GAP, PASTELS, ROW_END, STREET, X_E, Z_END,
  alleyAt, bandX, bandY, favelaPlan, lanesOf, rowW, spawnsOf, trackOf, zoneAt, type HouseBox, type Plan, type StairPlan,
} from './FavelaLayout';
import { Dresser, militaryMats } from '../../world/Dress';
import { propKits } from '../../entities/weapons/models';
import { fitted } from '../../world/Nature';
import { blockTexture, earthTexture, lajeTexture, plasterTexture, worldUv, zincTexture } from './textures';

/*
  Builds Favelas (the plan and its reasons are in FavelaLayout.ts). The 3.3 rules hold: every solid is
  drawn and collided with the same bounds; stairs are visible steps over a smooth ramp with stepped
  fill under it, fitted clear of walls (StairFit); the boundary beats the best jump (pastel buildings
  9 m over each terrace at the ends, a 27 m earth cliff over the crest, a block of buildings along the
  street); low cover ≤ 1.35 m is flagged `vault`.

  Repeated things are instanced: the houses (painted render and bare block, a per-house colour),
  their roof slabs, windows, doors, the towers' tin roofs, the water tanks, the laundry. The terraces,
  the stairs, the bridges, the boundary and the street's cars go through the StaticBuilder (merged
  per material). Laundry, the wires and the kites are seen only (soft: no collision, no rays).
*/

export interface FavelaResult {
  nav: { nodes: THREE.Vector3[]; links: [number, number][]; drops: [number, number][]; slope: number };
  spawns: { alpha: THREE.Vector3[]; omega: THREE.Vector3[] };
  survival: THREE.Vector3[];
  testGoals: THREE.Vector3[];
  zoneAt(x: number, y: number, z: number): Zone | null;
  /** Nodes or lane waypoints on blocked floor (DEV warning). */
  laneProblems: string[];
  kites: THREE.Group;
  plan: Plan;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A group of instances of one geometry and material, colours optional. */
class Batch {
  private m: THREE.Matrix4[] = [];
  private c: THREE.Color[] = [];
  private static q = new THREE.Quaternion();
  private static e = new THREE.Euler();
  constructor(readonly name: string, readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly shadows = true) {}
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: THREE.Color, rx = 0, ry = 0, rz = 0) {
    this.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Batch.q.setFromEuler(Batch.e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    this.c.push(color ?? new THREE.Color(1, 1, 1));
  }
  build(scene: THREE.Scene) {
    if (!this.m.length) {
      this.geo.dispose();
      return null;
    }
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.m.length);
    this.m.forEach((mx, i) => {
      im.setMatrixAt(i, mx);
      im.setColorAt(i, this.c[i]);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = this.shadows;
    im.receiveShadow = true;
    im.name = this.name;
    scene.add(im);
    return im;
  }
}

export function buildFavela(scene: THREE.Scene, col: CollisionWorld): FavelaResult {
  const plan = favelaPlan();
  const b = new StaticBuilder();
  const rnd = (() => {
    let s = 20240;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const std = (map: THREE.Texture | null, color: number | string, rough = 0.9, metal = 0, env = 0.4) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, envMapIntensity: env });
  const laje = lajeTexture();
  const m = {
    plaster: worldUv(std(plasterTexture(), 0xffffff, 0.93), 4),
    block: worldUv(std(blockTexture(), 0xffffff, 0.92), 2.4),
    roof: worldUv(std(laje, 0xffffff, 0.95), 4),
    zinc: worldUv(std(zincTexture(), 0xffffff, 0.55, 0.45, 0.6), 1.6),
    cement: std(laje, 0xd4cfc4, 0.95),
    // The street: sun-faded concrete (the night maps' asphalt is near black: in the shade a black hole).
    asphalt: std(laje, 0xcabfae, 0.95),
    plank: std(plankTexture(), 0xb39a76, 0.88),
    earth: std(earthTexture(), 0xffffff, 0.98, 0, 0.2),
    glass: std(null, 0x2d3236, 0.35, 0.1, 0.8),
    door: std(null, 0xffffff, 0.75),
    rail: std(null, 0x5b5f5c, 0.6, 0.4, 0.5),
    tank: std(null, 0x2f6ea6, 0.45, 0, 0.6),
    cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
    car: [std(null, 0xd8d3c6, 0.4, 0.3, 0.7), std(null, 0x3e6b8f, 0.4, 0.3, 0.7), std(null, 0xb34a3a, 0.45, 0.3, 0.7)],
    tyre: std(null, 0x1e1e1e, 0.9),
    stall: std(null, 0x2f8a5b, 0.85),
    crate: std(null, 0x8a6a48, 0.9),
    facade: PASTELS.slice(0, 6).map((p) => worldUv(std(plasterTexture(), p, 0.93), 4)),
  };
  const pastel = PASTELS.map((p) => new THREE.Color(p));
  const unit = () => new THREE.BoxGeometry(1, 1, 1);
  // 76.0: the Blender models (props_ruin.py) in the unit boxes and cylinders, if the kit is loaded.
  const model = (name: string, r = 0.5) => fitted(name, [-r, -0.5, -r], [r, 0.5, r]);
  const own = {
    grille: std(null, 0xe4e1d6, 0.5, 0.3, 0.5),
    rebar: std(null, 0x6b4430, 0.85, 0.4, 0.3),
    dish: std(null, 0xd9d7cf, 0.45, 0.1, 0.6),
  };
  const B = {
    houses: new Batch('favelaHouses', unit(), m.plaster),
    bricks: new Batch('favelaBlockHouses', unit(), m.block),
    roofs: new Batch('favelaRoofs', unit(), m.roof),
    glass: new Batch('favelaWindows', unit(), m.glass, false),
    doors: new Batch('favelaDoors', model('fdoor') ?? unit(), m.door, false),
    zinc: new Batch('favelaTinRoofs', model('zinc') ?? unit(), m.zinc),
    tanks: new Batch('favelaTanks', model('ftank', 1) ?? new THREE.CylinderGeometry(1, 1, 1, 14), m.tank),
    cloth: new Batch('favelaLaundry', new THREE.PlaneGeometry(1, 1), m.cloth, false),
    // (The kit's own: nothing to draw without it.)
    grilles: new Batch('favelaGrilles', model('fgrille') ?? unit(), own.grille, false),
    rebar: new Batch('favelaRebar', fitted('rebar') ?? unit(), own.rebar, false),
    dishes: new Batch('favelaDishes', fitted('fdish') ?? unit(), own.dish, false),
  };
  const kit = propKits();
  const dress = kit
    ? new Dresser(b, kit, militaryMats({ plastic: 0x2f6fb0, canvas: 0xffffff }, { canvas: m.stall, white: std(null, 0xe9e6dc, 0.5, 0.1, 0.6), fruit: std(null, 0xe0761c, 0.6) }))
    : null;

  // ---------------------------------------------------------------- helpers
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, surface: Collider['surface'] = 'concrete', tile = 3) => {
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return col.add(x0, y0, z0, x1, y1, z1, surface);
  };
  const deco = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 3) =>
    b.add(worldBox(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  /** Stair: steps over a ramp, stepped fill under it (Old Port's), fitted clear of the houses beside it. */
  const stair = (s: StairPlan) => {
    const fit = fitStairWidth(col.colliders, { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 }, s.axis, s.base, s.top);
    if (fit.blocked.length) console.warn('[favelas stair] runs into a wall', [s.x0, s.z0, s.x1, s.z1]);
    const { x0, z0, x1, z1 } = fit.rect;
    const along = s.axis === 'x';
    const L = along ? x1 - x0 : z1 - z0;
    const H = s.top - s.base;
    const steps = Math.max(2, Math.round(H / 0.25));
    const run = L / steps;
    for (let i = 0; i < steps; i++) {
      const hTop = ((i + 1) * H) / steps;
      const a = s.rise > 0 ? i * run : L - (i + 1) * run;
      const p0 = (along ? x0 : z0) + a;
      if (along) b.add(worldBox(run, hTop, z1 - z0, 1), m.cement, p0 + run / 2, s.base + hTop / 2, (z0 + z1) / 2);
      else b.add(worldBox(x1 - x0, hTop, run, 1), m.cement, (x0 + x1) / 2, s.base + hTop / 2, p0 + run / 2);
    }
    col.addRamp(x0, z0, x1, z1, s.axis, s.rise > 0 ? s.base : s.top, s.rise > 0 ? s.top : s.base);
    const seg = 12;
    for (let i = 1; i < seg; i++) {
      const h = (H * i) / seg;
      const a = (L * i) / seg, a2 = (L * (i + 1)) / seg;
      const c = along
        ? col.add(s.rise > 0 ? x0 + a : x1 - a2, s.base, z0, (s.rise > 0 ? x0 + a : x1 - a2) + (a2 - a), s.base + h, z1, 'concrete')
        : col.add(x0, s.base, s.rise > 0 ? z0 + a : z1 - a2, x1, s.base + h, (s.rise > 0 ? z0 + a : z1 - a2) + (a2 - a), 'concrete');
      c.floor = false;
    }
    return fit.rect;
  };

  // ---------------------------------------------------------------- the hill
  // Each terrace above the street is solid fill from the ground to its floor (its west face the
  // retaining wall), the length of the map. The street is the ground itself, paved.
  for (let k = 1; k < BAND.n; k++) solid(bandX(k), -0.5, -Z_END, bandX(k + 1), bandY(k), Z_END, m.cement, 'concrete', 3);
  deco(STREET.x0, -0.3, -Z_END, bandX(1), 0, Z_END, m.asphalt, 6);
  // A kerb line along the houses (paint).
  const kerb = new THREE.MeshStandardMaterial({ color: 0xe9e2c8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [1, -1]) deco(STREET.x1 - 0.35, 0, s > 0 ? CORE + 0.3 : -ROW_END, STREET.x1 - 0.2, 0.005, s > 0 ? ROW_END : -CORE - 0.3, kerb, 4);

  // ---------------------------------------------------------------- the houses
  const face = (h: HouseBox, side: 'x0' | 'x1') => {
    const L = h.z1 - h.z0;
    const fx = side === 'x0' ? h.x0 - 0.03 : h.x1 + 0.03;
    const sx = 0.08;
    const r = mulberryOf(h);
    let door = -1;
    if (L >= 2.6 && side === (h.row === 'W' ? 'x1' : 'x0')) {
      door = h.z0 + 0.7 + r() * (L - 2.3);
      const c = new THREE.Color().setHSL(r(), 0.45, 0.42);
      B.doors.add(fx, h.y0 + 1.0, door + 0.45, sx, 2.0, 0.9, c);
    }
    const nWin = Math.max(1, Math.floor(L / 2.4));
    for (let i = 0; i < nWin; i++) {
      const zc = h.z0 + ((i + 0.5) * L) / nWin;
      if (door >= 0 && Math.abs(zc - (door + 0.45)) < 1.1) continue;
      B.glass.add(fx, h.y0 + 1.75, zc, sx, 0.9, 0.85);
      if (kit && r() < 0.45) B.grilles.add(fx, h.y0 + 1.75, zc, 0.16, 0.9, 0.85);
    }
    // A satellite dish on one house in three, high on its face (over head height, out of reach).
    if (kit && h.y1 - h.y0 > 2.9 && r() < 0.35) B.dishes.add(side === 'x0' ? h.x0 - 0.07 : h.x1 + 0.07, h.y1 - 0.8, h.z0 + 0.5 + r() * (L - 1), 1, 1, 1, undefined, 0, side === 'x0' ? -Math.PI / 2 : Math.PI / 2, 0);
  };
  for (const h of plan.houses) {
    const w = h.x1 - h.x0, d = h.z1 - h.z0;
    const top = h.y1 - 0.12;
    (h.brick ? B.bricks : B.houses).add((h.x0 + h.x1) / 2, (h.y0 - 0.1 + top) / 2, (h.z0 + h.z1) / 2, w, top - h.y0 + 0.1, d, h.brick ? new THREE.Color(1, 1, 1) : pastel[h.tone]);
    B.roofs.add((h.x0 + h.x1) / 2, (top + h.y1) / 2, (h.z0 + h.z1) / 2, w, h.y1 - top, d);
    col.add(h.x0, h.y0 - 0.1, h.z0, h.x1, h.y1, h.z1, 'concrete');
    // Bare block: never finished, its columns' rebar still waiting for the next storey.
    if (kit && h.brick) for (const [x, z] of [[h.x0 + 0.15, h.z0 + 0.15], [h.x1 - 0.15, h.z0 + 0.15], [h.x0 + 0.15, h.z1 - 0.15], [h.x1 - 0.15, h.z1 - 0.15]]) B.rebar.add(x, h.y1, z, 1, 1, 1, undefined, 0, x + z, 0);
    face(h, h.row === 'W' ? 'x1' : 'x0');
    // The W row's back looks over the roofs below (k ≥ 1): windows there too.
    if (h.row === 'W' && h.band > 0) face(h, 'x0');
  }
  // Towers: a storey over part of a roof (out of reach: 2.8 m), a tin roof on it.
  for (const t of plan.towers) {
    const w = t.x1 - t.x0, d = t.z1 - t.z0;
    B.houses.add((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2, w, t.y1 - t.y0, d, pastel[t.tone]);
    B.zinc.add((t.x0 + t.x1) / 2, t.y1 + 0.05, (t.z0 + t.z1) / 2, w + 0.3, 0.08, d + 0.3, undefined, 0, 0, t.row === 'W' ? 0.06 : -0.06);
    col.add(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, 'concrete');
    for (const side of ['x0', 'x1'] as const) {
      const fx = side === 'x0' ? t.x0 - 0.03 : t.x1 + 0.03;
      for (let i = 0; i < Math.max(1, Math.floor(d / 2.4)); i++) B.glass.add(fx, t.y0 + 1.5, t.z0 + ((i + 0.5) * d) / Math.max(1, Math.floor(d / 2.4)), 0.08, 0.9, 0.85);
    }
  }

  // ---------------------------------------------------------------- stairs, bridges, tanks, props
  const stairRects = plan.stairs.map((s) => ({ s, r: stair(s) }));
  // A parapet (1.1 m, not vaulted) on the roof's edge along each stair's side: off a roof sideways onto
  // the stair part way down, a body overlapped the house (stress). An escadaria's is open for its last
  // 1.2 m (the roofs meet its top there); a roof stair's runs the slope's length, its landing open.
  const PARAPET = 1.1, PT = 0.2;
  for (const { s, r } of stairRects) {
    const y = s.top;
    if (s.axis === 'x') {
      // The escadarias: the E rows' houses either side (the side one only on its rows' side).
      const sides = s.z0 < 0 && s.z1 > 0 ? [s.z0, s.z1] : s.z0 > 0 ? [s.z0] : [s.z1];
      for (const z of sides) {
        const [z0, z1] = z === s.z0 ? [z - PT, z] : [z, z + PT];
        solid(r.x0, y, z0, r.x1 - 1.2, y + PARAPET, z1, m.cement, 'concrete', 1);
      }
    } else {
      // A roof stair: the house it climbs is on the far side from the alley (E rows east, W rows west).
      const [x0, x1] = s.house === 'east' ? [s.x1, s.x1 + PT] : [s.x0 - PT, s.x0];
      solid(x0, y, s.z0, x1, y + PARAPET, s.z1, m.cement, 'concrete', 1);
      // The landing: masonry from the alley's floor to the roof's level.
      if (s.landing) solid(s.x0, s.base - 0.1, s.landing[0], s.x1, s.top, s.landing[1], m.cement, 'concrete', 1);
    }
  }
  for (const br of plan.bridges) {
    solid(br.x0, br.y - 0.15, br.z0, br.x1, br.y, br.z1, m.plank, 'wood', 1.5);
    // Rails 0.18 m thick: thinner than the player's 0.15 m sub-step a sprint-jump tunnelled through (stress).
    for (const z of [br.z0, br.z1 - 0.18]) solid(br.x0, br.y, z, br.x1, br.y + 0.95, z + 0.18, m.rail, 'metal', 1);
  }
  for (const [x, y, z] of plan.tanks) {
    B.tanks.add(x, y + 0.6, z, 0.75, 1.2, 0.75);
    col.addCylinder(x, z, 0.75, y, y + 1.2, 'metal').vault = true;
  }
  for (const p of plan.props) {
    if (p.kind === 'car' || p.kind === 'van') {
      const mat = m.car[Math.floor(rnd() * m.car.length)];
      // 76.0: a Beetle, a Kombi over the boxes (they're hidden; the colliders stay).
      dress?.replace(p.kind === 'car' ? 'fusca' : 'kombi', [p.x0, 0, p.z0], [p.x1, p.h, p.z1], { over: { paint: mat }, margin: 0.1 });
      const c = solid(p.x0, 0, p.z0, p.x1, p.h * 0.6, p.z1, mat, 'metal', 2);
      c.vault = false;
      // The cabin (the van's the whole length), seen only: inside the collider's footprint, over it.
      const cz0 = p.kind === 'van' ? p.z0 : p.z0 + (p.z1 - p.z0) * 0.25, cz1 = p.kind === 'van' ? p.z1 : p.z1 - (p.z1 - p.z0) * 0.25;
      solid(p.x0 + 0.1, p.h * 0.6, cz0, p.x1 - 0.1, p.h, cz1, mat, 'metal', 2);
      for (const zz of [p.z0 + 0.8, p.z1 - 0.8]) for (const xx of [p.x0 + 0.05, p.x1 - 0.05]) b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), m.tyre, xx, 0.32, zz, 0, 0, Math.PI / 2);
    } else if (p.kind === 'stall') {
      dress?.replace('fstall', [p.x0, 0, p.z0], [p.x1, p.h, p.z1], { margin: 0.1 });
      solid(p.x0, 0, p.z0, p.x1, 1.0, p.z1, m.crate, 'wood', 1);
      // Its awning on posts (the posts in the counter's corners; the canopy over the counter only).
      deco(p.x0, p.h - 0.05, p.z0, p.x1, p.h, p.z1, m.stall, 2);
      for (const [xx, zz] of [[p.x0 + 0.1, p.z0 + 0.1], [p.x1 - 0.1, p.z1 - 0.1]]) solid(xx - 0.05, 1.0, zz - 0.05, xx + 0.05, p.h - 0.05, zz + 0.05, m.rail, 'metal', 1);
    } else {
      solid(p.x0, bandY(Math.floor((p.x0 - BAND.x0) / BAND.w)), p.z0, p.x1, bandY(Math.floor((p.x0 - BAND.x0) / BAND.w)) + p.h, p.z1, m.crate, 'wood', 1).vault = true;
    }
  }

  // ---------------------------------------------------------------- laundry and wires (seen only)
  const wires: number[] = [];
  const sag = (a: THREE.Vector3, c: THREE.Vector3, drop: number) => {
    let prev = a;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const p = a.clone().lerp(c, t);
      p.y -= Math.sin(t * Math.PI) * drop;
      wires.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  };
  for (let k = 1; k < BAND.n; k++) {
    for (const zs of [7, 12, 27.5, 37]) {
      for (const s of [1, -1]) {
        const z = zs * s;
        const a = alleyAt(k, z);
        if (!a) continue;
        const y = bandY(k) + 2.75;
        sag(v(a[0], y, z), v(a[1], y, z), 0.25);
        // Clothes pegged along it.
        for (let x = a[0] + 0.5; x < a[1] - 0.4; x += 0.75) {
          if (rnd() < 0.25) continue;
          const t = (x - a[0]) / (a[1] - a[0]);
          const c = new THREE.Color().setHSL(rnd(), 0.55, 0.62);
          const h = 0.45 + rnd() * 0.35;
          B.cloth.add(x, y - Math.sin(t * Math.PI) * 0.25 - h / 2, z, 0.55, h, 1, c, 0, 0.15 * (rnd() - 0.5), 0);
        }
      }
    }
  }
  // The gatos: wires from roof to roof over the alleys and along the street, a little over head height on the roofs.
  for (let k = 0; k < BAND.n; k++) {
    for (const zs of [4, 12.5, 21.5, 33, 42]) for (const s of [1, -1]) {
      const z = zs * s;
      const a = alleyAt(k, z);
      if (!a) continue;
      const y = bandY(k + 1) + 2.4;
      sag(v(a[0] - 0.5, y, z + 0.3), v(a[1] + 0.5, y, z - 0.4), 0.5);
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireLines = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1b1b1b }));
  wireLines.userData.soft = true;
  wireLines.raycast = () => {};
  wireLines.name = 'favelaWires';
  scene.add(wireLines);

  // ---------------------------------------------------------------- boundary
  // The street's far side: a block of pastel buildings (9–11 m: taller put the street in their shade); the ends: buildings 9 m over each
  // terrace; over the crest: the earth cliff (27 m), under the hill's forest.
  for (let z = -Z_END - 2; z < Z_END + 2; z += 7.5) {
    const h = 9 + rnd() * 2;
    solid(STREET.x0 - 10, 0, z, STREET.x0, h, z + 7.5, m.facade[Math.floor(rnd() * m.facade.length)], 'concrete', 4);
  }
  for (const s of [1, -1]) {
    for (let k = 0; k < BAND.n; k++) {
      const [z0, z1] = s > 0 ? [Z_END, Z_END + 3] : [-Z_END - 3, -Z_END];
      solid(bandX(k), bandY(k), z0, bandX(k + 1), bandY(k) + 9 + rnd() * 2, z1, m.facade[(k * 2 + (s > 0 ? 0 : 1)) % m.facade.length], 'concrete', 4);
    }
  }
  solid(X_E, -0.5, -Z_END - 3, X_E + 12, 27, Z_END + 3, m.earth, 'concrete', 8);

  // ---------------------------------------------------------------- kites (pipas) over the hill
  const kites = new THREE.Group();
  kites.name = 'kites';
  const kiteGeo = new THREE.BufferGeometry();
  kiteGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.55, 0, -0.42, 0, 0, 0, -0.75, 0, 0, 0.55, 0, 0, -0.75, 0, 0.42, 0, 0], 3));
  kiteGeo.computeVertexNormals();
  for (let i = 0; i < 7; i++) {
    const k = new THREE.Mesh(kiteGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rnd(), 0.8, 0.55), side: THREE.DoubleSide, fog: true }));
    k.position.set(-40 + rnd() * 80, 32 + rnd() * 14, -50 + rnd() * 100);
    k.userData.phase = rnd() * 10;
    k.userData.home = k.position.clone();
    k.raycast = () => {};
    kites.add(k);
  }
  kites.userData.soft = true;
  scene.add(kites);

  for (const batch of Object.values(B)) batch.build(scene);
  dress?.finish(scene);
  if (dress) (globalThis as unknown as { __dress?: unknown }).__dress = dress.stats;
  b.build(scene);
  dress?.afterBuild(scene);
  dress?.dispose();
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.staticMerged) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---------------------------------------------------------------- navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const drops: [number, number][] = [];
  const open = (x: number, y: number, z: number) => !col.blocked(v(x, y, z), 0.55);
  /** A floor at y here (a terrace, a roof, a bridge), not one above or below it. */
  const floorAt = (x: number, y: number, z: number) => Math.abs(col.groundHeightAt(x, z, 0.3, y, 0.25) - y) < 0.1;
  const ok = (x: number, y: number, z: number) => floorAt(x, y, z) && open(x, y, z);
  const N = (x: number, y: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].distanceToSquared(v(x, y, z)) < 1.1 * 1.1) return i;
    return nodes.push(v(x, y, z)) - 1;
  };
  const chain = (...ids: number[]) => {
    for (let i = 1; i < ids.length; i++) links.push([ids[i - 1], ids[i]]);
  };
  // The alleys, the squares, the street: down the middle (two or three abreast where it's wide).
  for (let k = 0; k < BAND.n; k++) {
    const y = bandY(k);
    for (let z = -ROW_END + 1; z <= ROW_END - 1 + 1e-6; z += 3) {
      const a = alleyAt(k, z)!;
      const xs = k === 0 ? [-46.5, -40.5] : a[1] - a[0] > 6 ? [a[0] + 2, a[1] - 2] : [(a[0] + a[1]) / 2];
      for (const x of xs) if (ok(x, y, z)) N(x, y, z);
    }
    // The yards and the side escadarias' feet.
    for (const s of [1, -1]) for (let x = bandX(k) + 2.5; x <= bandX(k + 1) - 2 + 1e-6; x += 5) for (const z of [46.5, 51, 55.5]) if (ok(x, y, z * s)) N(x, y, z * s);
    // The roofs of the band (a floor one storey up), and its bridges.
    const yr = bandY(k + 1);
    for (let x = bandX(k) + 1.6; x <= bandX(k + 1) - 1.4; x += 3.2) for (let z = -ROW_END + 1.5; z <= ROW_END - 1.5 + 1e-6; z += 4) if (ok(x, yr, z)) N(x, yr, z);
  }
  // Across each bridge: its middle and both roofs at its ends (the roofs' 4 m grid steps over a 2 m
  // bridge, and a diagonal link meets its rails: the W roofs were left unreachable).
  for (const br of plan.bridges) {
    const zc = (br.z0 + br.z1) / 2;
    for (const x of [br.x0 - 1.2, (br.x0 + br.x1) / 2, br.x1 + 1.2]) if (ok(x, br.y, zc)) N(x, br.y, zc);
  }
  // The central escadaria's flat runs (the W rows' gap), each band.
  for (let k = 1; k < BAND.n; k++) for (let x = bandX(k) + 1.5; x < bandX(k) + rowW(trackOf(k, 0)); x += 2.5) if (ok(x, bandY(k), 0)) N(x, bandY(k), 0);
  // The cross gaps through the W rows: in the gap, onto the roofs below.
  for (let k = 1; k < BAND.n; k++) for (const s of [1, -1]) {
    const z = ((CROSS_GAP[0] + CROSS_GAP[1]) / 2) * s;
    const w = rowW(trackOf(k, 1));
    for (const x of [bandX(k) + w / 2, bandX(k) - 1.6]) if (ok(x, bandY(k), z)) N(x, bandY(k), z);
  }
  // Every stair: in front of its foot, the middle, past its top (the roof stairs: onto the roof beside it).
  for (const { s, r } of stairRects) {
    const zc = (r.z0 + r.z1) / 2, xc = (r.x0 + r.x1) / 2, mid = (s.base + s.top) / 2;
    // (The middle a little over the ramp: on it, a node's body overlapped the step fill under the next steps.)
    if (s.axis === 'x') chain(N(r.x0 - 1.1, s.base, zc), N(xc, mid + 0.2, zc), N(r.x1 + 1.1, s.top, zc));
    else {
      const footZ = s.rise > 0 ? r.z0 - 1.1 : r.z1 + 1.1;
      const topZ = s.landing ? (s.landing[0] + s.landing[1]) / 2 : s.rise > 0 ? r.z1 - 0.6 : r.z0 + 0.6;
      // Onto the roof: the side away from the alley (an E row's stair steps east, a W row's west).
      const roofX = s.house === 'east' ? r.x1 + 1.4 : r.x0 - 1.4;
      chain(N(xc, s.base, footZ), N(xc, mid + 0.2, zc), N(xc, s.top, topZ), N(roofX, s.top, topZ));
    }
  }
  // Drops: off the roofs into the alleys either side, off the W rows' backs onto the roofs below, off
  // the yards' retaining walls, from the escadaria's flat run down the stair's side... every 6 m.
  // (Only where the way down is clear: off a roof's edge under a bridge's end, the bots stepped into its
  // rail and plank, and stood there: 6v6 self-play, an endgame of patrols stuck at z ±24.)
  const clearDown = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    for (const dz of [-0.4, 0, 0.4]) if (!col.lineOfSight(v(x0, y0 + 1, z + dz), v(x1, y0 + 1, z + dz)) || !col.lineOfSight(v(x1, y0 + 1, z + dz), v(x1, y1 + 0.5, z + dz))) return false;
    return col.ceilingAbove(x1, z, 0.45, y1 + 0.3) - y1 >= 2.2;
  };
  const drop = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    if (ok(x0, y0, z) && ok(x1, y1, z) && clearDown(x0, y0, x1, y1, z)) drops.push([N(x0, y0, z), N(x1, y1, z)]);
  };
  for (let k = 0; k < BAND.n; k++) {
    const y = bandY(k), yr = bandY(k + 1);
    for (let z = -ROW_END + 3; z <= ROW_END - 3 + 1e-6; z += 6) {
      const a = alleyAt(k, z)!;
      if (k > 0) drop(a[0] - 0.9, yr, a[0] + 1.3, y, z);
      drop(a[1] + 0.9, yr, a[1] - 1.3, y, z);
      if (k > 0) drop(bandX(k) + 0.9, yr, bandX(k) - 1.3, y, z);
    }
    if (k > 0) for (const s of [1, -1]) for (const z of [51, 55]) drop(bandX(k) + 1.0, y, bandX(k) - 1.3, bandY(k - 1), z * s);
  }
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) N(p.x, p.y, p.z);

  const laneProblems: string[] = [];
  nodes.forEach((p, i) => {
    if (col.blocked(p, 0.35)) laneProblems.push(`node ${i} @${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)} inside geometry`);
  });
  for (const t of ['alpha', 'omega'] as const) for (const L of lanesOf(t)) for (const p of L) if (!ok(p.x, p.y, p.z)) laneProblems.push(`${t} lane ${p.x.toFixed(1)},${p.y},${p.z}`);

  // ---------------------------------------------------------------- goals and spawns
  const testGoals: THREE.Vector3[] = [];
  for (let k = 0; k < BAND.n; k++) {
    for (const z of [0, 12, 26, 40, -20, -36]) {
      const a = alleyAt(k, z)!;
      testGoals.push(v((a[0] + a[1]) / 2, bandY(k), z));
    }
    const yr = bandY(k + 1);
    for (const z of [17, -33]) {
      const e = alleyAt(k, z)!;
      const x = Math.min(bandX(k + 1) - 2, e[1] + 2.5);
      if (ok(x, yr, z)) testGoals.push(v(x, yr, z));
    }
  }
  for (const br of plan.bridges.filter((_, i) => i % 3 === 0)) testGoals.push(v((br.x0 + br.x1) / 2, br.y, (br.z0 + br.z1) / 2));
  const survival = [0, 1, 2, 3, 4].flatMap((k) => [v(bandX(k) + 10, bandY(k), 30), v(bandX(k) + 10, bandY(k), -30)]);

  return {
    nav: { nodes, links, drops, slope: 0 },
    spawns: { alpha: spawnsOf('alpha'), omega: spawnsOf('omega') },
    survival,
    testGoals,
    zoneAt,
    laneProblems,
    kites,
    plan,
  };
}

/** A house's own random stream (its windows and door land the same in both halves). */
function mulberryOf(h: HouseBox) {
  let s = Math.floor(Math.abs(h.x0 * 131 + Math.abs(h.z0) * 977 + h.y0 * 17 + (h.row === 'W' ? 7 : 3))) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

