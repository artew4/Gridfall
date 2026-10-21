import * as THREE from 'three';
import type { City } from './City';
import { RAIL } from './City';
import { Architecture, DECK } from './Architecture';

/** Height of the walkable rooftop layer. */
export const ROOF = 8.5;
import { PropKit } from './PropKit';
import { addSign, type SignGlow, type SignSpec } from './Signs';
import type { Glow } from './Glows';
import type { NavLayout } from '../enemies/Nav';
import { billboardTexture } from './Textures';
import { worldBox } from './Builder';
import { mulberry32 } from '../core/math';
import { ZONES } from './Zones';
import { buildMetro, METRO_HOLES, type MetroResult } from './Metro';

/*
  Tokyo Vertical District (metres, y up, player starts facing -z):

                        z=-58  RAILWAY STREET end (東京酒場 tower)        ◆ spawn
                               │x -6..6│
   z -26..-21  ═══ railway overpass (deck 6.4–7.8, sniper catwalk on its south edge) ═══
               west yard (fenced)  │      │ TRACKSIDE x 6..23 ─┐ ◆
   z -15..-12  ┌──── W1 walkway (deck 4.5), bridges Railway St ────┐ │ x 19..23
               │ W3                     PLAZA               W2   ├─┘
  ◆ SERVICE ═══╡ x-15..-12        ⛲ (0,0)   x,z ±15         x12..15╞═══ NEON ALLEY ◆
   PASSAGE     │ (pipe gallery → S3)                (tech deck → S4)│   x 15..48, z -3..2
   x -45..-15  │ S2 ↑ z 13→5                            S1 ↑ z 13→5│
   z -6..-2    └──────────── LANTERN STREET x -5..5 ───────────────┘
   BACK ALLEY x -24..-21 runs south from the passage, turns east at z 24..27 into Lantern Street.
*/

import type { Breakable, CabinetSpot } from '../gameplay/Interactives';
export type { Breakable, CabinetSpot };

export interface DistrictResult {
  signs: SignGlow[];
  steamEmitters: THREE.Vector4[];
  coverPoints: THREE.Vector3[];
  perches: THREE.Vector3[];
  spawns: THREE.Vector3[];
  nav: NavLayout;
  arch: Architecture;
  kit: PropKit;
  bounds: THREE.Box2;
  start: { x: number; z: number; yaw: number };
  cabinets: CabinetSpot[];
  medkits: THREE.Vector3[];
  breakables: Breakable[];
  /** Objects that shake while the train passes overhead. */
  trackside: THREE.Object3D[];
  billboard: THREE.Texture;
  /** Open ground rects for rain splashes. */
  open: [number, number, number, number][];
  /** Pole transformers (ambient arcs) and steam valves (bursts). */
  transformers: THREE.Vector3[];
  vents: THREE.Vector3[];
  /** Loudest positional loops. */
  pachinko: THREE.Vector3;
  /** Story mode: security patrol routes, reinforcement entry doors, the fugitive's starting alley. */
  doors: THREE.Vector3[];
  storyStart: { x: number; z: number; yaw: number };
  metro: MetroResult;
  /** Act 3 objective: the security relay on the Sky Garden. */
  relay: THREE.Vector3;
  /** Where civilians linger. Yaw: direction faced (atan2 of facing x, z). */
  pois: { pos: THREE.Vector3; yaw: number; kind: 'shop' | 'shelter' | 'wait' | 'chat' }[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildDistrict(city: City, wind: () => number): DistrictResult {
  const ctx = city.ctx;
  const { col, glows, scene, builder: b, mats: m } = ctx;
  const rnd = mulberry32(42);
  const arch = new Architecture(ctx);
  const kit = new PropKit(ctx);

  // ======================================================================= Blocks
  // [x0, x1, z0, z1, height, variant, faces]
  // West Terrace (roof 8.5): the southwest block and the strip west of the plaza, with the S8 notch.
  const NT = { tank: false, walk: true };
  const LOW = { tank: false };
  city.block(-21, -5, 15, 24, ROOF, 1, [
    { face: 'n', from: -15, to: -5, stores: ['shop', 'izakaya'] },
    { face: 'e', stores: ['izakaya', 'izakaya'] },
    { face: 's', stores: ['shutter', 'door', 'shutter', 'shutter'] },
  ], rnd, NT);
  city.block(-21, -17.4, -2, 15, ROOF, 2, [{ face: 'w', stores: ['shutter', 'door', 'shutter'] }], rnd, NT);
  city.block(-17.4, -15, 7.6, 15, ROOF, 2, [{ face: 'e', stores: ['shop'] }], rnd, NT);
  city.block(-17.4, -15, -2, 0.4, DECK, 2, [{ face: 'e' }], rnd, LOW);
  city.block(-17.4, -15, 0.4, 7.6, DECK, 2, [{ face: 'e', stores: ['shop'] }], rnd, LOW);
  // Back-alley block, split by the staff passage to the metro (door on the Service Passage).
  city.block(-45, -36, -2, 27, 12, 0, [{ face: 'n', stores: ['shutter', 'door'] }], rnd);
  city.block(-33, -24, -2, 27, 12, 0, [
    { face: 'e', stores: ['door', 'shutter', 'shutter', 'door', 'shutter', 'door', 'shutter'] },
    { face: 'n', stores: ['shutter', 'door'] },
  ], rnd);
  city.block(-36, -33, 8.7, 27, 12, 0, [], rnd, LOW);
  city.block(-36, -33, -2, 8.7, 12, 0, [], rnd, { tank: false, y0: 3.2 });
  // South of the widened back-alley bend (z 24..29).
  city.block(-40, -24, 27, 50, 13, 2, [], rnd);
  city.block(-24, -5, 29, 50, 13, 2, [
    { face: 'e', from: 29, to: 48, stores: ['izakaya', 'shop', 'izakaya', 'door', 'izakaya'] },
    { face: 'n', stores: ['shutter', 'shop', 'door', 'shutter'] },
  ], rnd);
  // Lantern Roof (8.5) over the east side of Lantern Street, the rest of the block stays tall.
  city.block(5, 20, 15, 24, ROOF, 0, [
    { face: 'w', stores: ['shop', 'door'] },
    { face: 'n', from: 5, to: 15, stores: ['shop', 'shop'] },
  ], rnd, NT);
  city.block(5, 20, 24, 50, 15, 0, [{ face: 'w', from: 24, to: 48, stores: ['door', 'izakaya', 'shop', 'shutter', 'door', 'shop'] }], rnd);
  city.block(20, 40, 15, 50, 15, 0, [], rnd);
  city.block(-40, 40, 48, 66, 16, 1, [{ face: 'n', from: -5, to: 5, stores: ['shutter', 'door'] }], rnd);
  // Sky Garden (8.5) on the block south of Neon Alley; the S5 notch climbs from the W2 balcony.
  city.block(15, 48, 4.6, 15, ROOF, 2, [{ face: 'w', from: 4.6, to: 15 }], rnd, NT);
  city.block(22.2, 48, 2, 4.6, ROOF, 2, [{ face: 'n', stores: ['izakaya', 'shutter', 'shop', 'door', 'shop', 'shutter'] }], rnd, NT);
  city.block(15, 22.2, 2, 4.6, DECK, 2, [{ face: 'n', stores: ['shop'] }], rnd, LOW);
  city.block(15, 19, -21, -3, 10, 0, [
    { face: 'w', from: -15, to: -3, stores: ['shop', 'door', 'shop'], upper: ['door', 'shop'] },
    { face: 'e', stores: ['shutter', 'door', 'shutter', 'shutter'] },
    { face: 's', stores: [] },
  ], rnd);
  city.block(6, 15, -21, -15, 12, 1, [
    { face: 's', stores: ['shop', 'door'], upper: ['shop', 'door'] },
    { face: 'w', stores: ['shop'] },
    { face: 'n', stores: ['shutter', 'shutter'] },
  ], rnd);
  // Tech Roof (8.5) north of Neon Alley, the S7 notch climbs from the tech deck; the tower behind stays tall.
  city.block(31.2, 48, -9, -3, ROOF, 1, [{ face: 's', stores: ['shop', 'izakaya', 'shutter', 'door'], upper: ['shop', 'door', 'shop'] }], rnd, NT);
  city.block(23, 31.2, -9, -5.4, ROOF, 1, [{ face: 'w' }], rnd, NT);
  city.block(23, 31.2, -5.4, -3, DECK, 1, [{ face: 's', stores: ['shop', 'shutter'] }, { face: 'w' }], rnd, LOW);
  city.block(23, 48, -21, -9, 17, 1, [{ face: 'w', stores: ['shutter', 'door', 'shutter'] }], rnd);
  city.block(6, 48, -58, -26, 22, 2, [
    { face: 'w', stores: ['shutter', 'door', 'shop', 'shutter', 'door', 'shutter', 'shop'] },
    { face: 's', from: 6, to: 23, stores: ['shutter', 'door', 'shutter', 'shop'] },
  ], rnd);
  city.block(-15, -6, -21, -15, 14, 0, [
    { face: 's', stores: ['shop', 'door'], upper: ['door', 'shop'] },
    { face: 'e', stores: ['shop'] },
  ], rnd);
  city.block(-45, -15, -21, -6, 15, 1, [
    { face: 's', stores: ['shutter', 'shutter', 'door', 'shutter', 'shutter', 'door', 'shutter'] },
    { face: 'e', from: -15, to: -6, stores: ['door', 'shop'], upper: ['shop', 'door'] },
  ], rnd);
  city.block(-45, -6, -58, -26, 20, 2, [{ face: 'e', stores: ['door', 'shutter', 'shop', 'shutter', 'door', 'shutter', 'shutter'] }], rnd);
  city.block(-34, 34, -78, -58, 36, 0, [{ face: 's', from: -6, to: 6 }], rnd);
  city.block(48, 62, -21, 15, 18, 0, [{ face: 'w', from: -3, to: 2, stores: ['door'] }], rnd);
  city.block(-60, -45, -21, 50, 14, 1, [{ face: 'e', from: -6, to: -2, stores: ['shutter'] }], rnd);
  city.block(-60, -45, -78, -26, 24, 2, [], rnd);
  city.block(48, 62, -78, -26, 26, 1, [], rnd);

  // ======================================================================= Ground
  city.ground(
    { x0: -15, z0: -15, x1: 15, z1: 15 },
    [
      { x0: -5, z0: 15, x1: -3.6, z1: 48 },
      { x0: 3.6, z0: 15, x1: 5, z1: 48 },
      { x0: -6, z0: -58, x1: -4.6, z1: -15 },
      { x0: 4.6, z0: -58, x1: 6, z1: -15 },
    ],
    METRO_HOLES,
  );
  city.markings(
    [
      { x: -3.3, z0: 16, z1: 47 },
      { x: 3.3, z0: 16, z1: 47 },
      { x: -4.3, z0: -57, z1: -16 },
      { x: 4.3, z0: -57, z1: -16 },
    ],
    [
      { x: 0, z: 16.6, across: 'x', n: 7 },
      { x: 0, z: -16.6, across: 'x', n: 7 },
    ],
    [
      { x: 1.6, z: 20.5, ry: Math.PI },
      { x: -1.9, z: -19.5, ry: 0 },
    ],
  );
  city.overpass([-38, -26, -14, -5.3, 5.3, 12, 18, 30, 40]);

  // ======================================================================= Upper level
  const W1 = { x0: -15, z0: -15, x1: 15, z1: -12 };
  const W3 = { x0: -15, z0: -12, x1: -12, z1: 5 };
  const W2 = { x0: 12, z0: -12, x1: 15, z1: 5 };
  const TP = { x0: 15, z0: -3, x1: 32, z1: -1.2 };
  const PG = { x0: -32, z0: -6, x1: -15, z1: -4.2 };
  arch.walkway(W1, [{ edge: 's', from: -12, to: 12 }, { edge: 'n', from: -6, to: 6 }], [[-9, -12.25], [-3, -12.25], [3, -12.25], [9, -12.25]]);
  arch.walkway(W3, [{ edge: 'e' }, { edge: 's', from: -12.4, to: -12 }, { edge: 'w', from: -4.2, to: -2 }], [[-12.25, -8], [-12.25, 0]]);
  arch.walkway(W2, [{ edge: 'w' }, { edge: 's', from: 12, to: 12.4 }, { edge: 'e', from: -1.2, to: 2 }], [[12.25, -8], [12.25, 0]]);
  arch.walkway(TP, [{ edge: 's' }, { edge: 'n', from: 19, to: 23 }], [[18, -1.4], [25, -1.4], [30.6, -1.4]]);
  arch.walkway(PG, [{ edge: 's' }], [[-18, -4.4], [-25, -4.4], [-30.6, -4.4]]);
  arch.stair({ x0: 12.4, z0: 5, x1: 15, z1: 13, axis: 'z', rise: -1, rails: ['w'] });
  arch.stair({ x0: -15, z0: 5, x1: -12.4, z1: 13, axis: 'z', rise: -1, rails: ['e'] });
  arch.stair({ x0: -40, z0: -6, x1: -32, z1: -4.2, axis: 'x', rise: 1, rails: ['s'] });
  arch.stair({ x0: 32, z0: -3, x1: 40, z1: -1.2, axis: 'x', rise: -1, rails: ['s'] });

  // ======================================================================= Underground metro
  const metro = buildMetro(ctx, arch, kit);

  // ======================================================================= Rooftop layer (8.5)
  // Roof decks.
  const roofs = [
    { x0: 15, z0: 4.6, x1: 48, z1: 15 }, // Sky Garden
    { x0: 22.2, z0: 2, x1: 48, z1: 4.6 },
    { x0: 31.2, z0: -9, x1: 48, z1: -3 }, // Tech Roof
    { x0: 23, z0: -9, x1: 31.2, z1: -5.4 },
    { x0: 5, z0: 15, x1: 20, z1: 24 }, // Lantern Roof
    { x0: -21, z0: 15, x1: -5, z1: 24 }, // West Terrace
    { x0: -21, z0: -2, x1: -17.4, z1: 15 },
    { x0: -17.4, z0: 7.6, x1: -15, z1: 15 },
  ];
  for (const r of roofs) arch.roofDeck(r, ROOF);
  const hi = (x0: number, z0: number, x1: number, z1: number) => arch.parapet(x0, z0, x1, z1, ROOF, false);
  const lo = (x0: number, z0: number, x1: number, z1: number) => arch.parapet(x0, z0, x1, z1, ROOF, true);
  // Sky Garden: high over Neon Alley (gaps for the S6 landing and the bridge), low over the S5 stair and S1.
  hi(22.2, 2.14, 32, 2.14);
  hi(34, 2.14, 40, 2.14);
  hi(42.5, 2.14, 48, 2.14);
  lo(15, 4.74, 22.2, 4.74);
  // South-east corner over the back lots (nothing beyond: the edge of the playable city). It was open
  // until 3.3, a walk-off out of the map. A parapet with a security fence: a sprint-jump off the
  // rooftop table clears a bare 1.1 m parapet.
  hi(40, 14.86, 48, 14.86);
  for (let x = 40.1; x <= 47.95; x += 1.95) b.add(worldBox(0.07, 1.35, 0.07, 1), m.darkMetal, x, ROOF + 1.1 + 0.675, 14.86);
  for (const y of [ROOF + 1.55, ROOF + 2.0, ROOF + 2.42]) b.add(worldBox(7.9, 0.04, 0.04, 1), m.darkMetal, 44, y, 14.86);
  col.add(40, ROOF, 14.72, 48, ROOF + 2.45, 15, 'metal');
  lo(15.14, 4.6, 15.14, 11);
  hi(15.14, 11, 15.14, 15);
  // Tech Roof.
  hi(31.2, -3.14, 40, -3.14);
  hi(42.5, -3.14, 48, -3.14);
  lo(23, -5.54, 31.2, -5.54);
  hi(23.14, -9, 23.14, -5.4);
  // Lantern Roof.
  hi(5, 15.14, 15, 15.14);
  hi(5.14, 15, 5.14, 19);
  hi(5.14, 21, 5.14, 24);
  // West Terrace.
  hi(-5.14, 15, -5.14, 19);
  hi(-5.14, 21, -5.14, 24);
  hi(-15, 15.14, -5, 15.14);
  hi(-21, 23.86, -5, 23.86);
  hi(-20.86, -2, -20.86, 24);
  hi(-21, -1.86, -17.4, -1.86);
  lo(-17.54, -2, -17.54, 7.6);
  lo(-15.14, 7.6, -15.14, 11);
  hi(-15.14, 11, -15.14, 15);
  // Bridges over Neon Alley and Lantern Street, the S6 landing.
  arch.walkway({ x0: 40, z0: -3, x1: 42.5, z1: 2 }, [{ edge: 'w', vault: false }, { edge: 'e', vault: false }], [], ROOF);
  arch.walkway({ x0: -5, z0: 19, x1: 5, z1: 21 }, [{ edge: 'n', vault: false }, { edge: 's', vault: false }], [], ROOF);
  arch.walkway({ x0: 32, z0: 0.2, x1: 34, z1: 2 }, [{ edge: 'n', vault: false }, { edge: 'e', vault: false }], [[33.6, 0.45]], ROOF);
  // Stairs up to the roofs.
  arch.stair({ x0: 15, z0: 2, x1: 22.2, z1: 4.6, axis: 'x', rise: 1, rails: ['n'], bottom: DECK, top: ROOF, vault: false }); // S5 from W2
  arch.stair({ x0: 17, z0: 0.2, x1: 32, z1: 2, axis: 'x', rise: 1, rails: ['n'], bottom: 0, top: ROOF, vault: false }); // S6 from Neon Alley
  arch.stair({ x0: 24, z0: -5.4, x1: 31.2, z1: -3, axis: 'x', rise: 1, rails: ['s'], bottom: DECK, top: ROOF }); // S7 from the tech deck
  arch.stair({ x0: -17.4, z0: 0.4, x1: -15, z1: 7.6, axis: 'z', rise: 1, rails: ['e'], bottom: DECK, top: ROOF }); // S8 from W3

  // ----------------------------------------------------------------- Rooftop life and cover
  const R = ROOF;
  // Sky Garden: a rooftop bar under string lights, tables, planters, condensers, the security relay.
  kit.boxCover(36, R, 14.2, 7, 1.1, 0.9, kit.wood, 'wood');
  b.add(worldBox(7, 2.2, 0.2, 1), m.darkMetal, 36, R + 1.1, 14.9);
  const bottleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.4) });
  for (let i = 0; i < 18; i++) b.add(worldBox(0.08, 0.28, 0.08, 1), bottleMat, 33 + i * 0.34, R + 1.75, 14.75);
  for (const [x, z] of [[27.5, 8], [31, 11], [39.5, 8.2], [43, 11]] as const) kit.table(x, R, z);
  kit.planter(25.5, 13.4, rnd, R);
  kit.planter(46.5, 10.5, rnd, R);
  kit.boxCover(19.6, R, 8.2, 1.6, 1.3, 1.1, m.paintedMetal);
  kit.boxCover(19.6, R, 11.3, 1.6, 1.3, 1.1, m.paintedMetal);
  b.add(new THREE.CylinderGeometry(1.15, 1.15, 2.4, 14), m.paintedMetal, 46, R + 2.6, 13.2);
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.add(worldBox(0.12, 1.4, 0.12, 1), m.darkMetal, 46 + dx, R + 0.7, 13.2 + dz);
  col.addCylinder(46, 13.2, 1.15, R, R + 3.8, 'metal');
  // String lights across the garden: cables + warm bulbs, one real light.
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.1) });
  const bulbGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (const [z0, z1] of [[5.5, 14.5], [7.5, 14.5]] as const) {
    for (let x = 21; x < 47; x += 6.5) {
      const a = new THREE.Vector3(x, R + 3.2, z0);
      const c = new THREE.Vector3(x + 4, R + 3.2, z1);
      kit.cableLine(a, c, 0.6, 0.01);
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        b.add(bulbGeo, bulbMat, a.x + (c.x - a.x) * t, a.y - 0.6 * 4 * t * (1 - t) - 0.08, a.z + (c.z - a.z) * t);
      }
    }
  }
  for (let x = 21; x < 48; x += 6.5) b.add(worldBox(0.08, 3.4, 0.08, 1), m.darkMetal, x, R + 1.7, 5.4);
  const gardenLight = new THREE.PointLight(0xffb070, 22, 20, 2);
  gardenLight.position.set(33, R + 3.6, 10);
  scene.add(gardenLight);
  const gg = glows.add({ pos: new THREE.Vector3(33, R + 3, 10), color: new THREE.Color(1, 0.7, 0.4), radius: 12, base: 1, light: gardenLight, lightBase: 22, haloSize: 0.01, haloStrength: 0, mode: 'steady', reflect: { width: 8, anchor: new THREE.Vector3(33, R, 9), length: 6, map: null } });
  gg.materials.push({ mat: bulbMat, base: bulbMat.color.clone() });
  // Security relay mast (the Act 3 objective): cabinet, antenna, red status lamps.
  const relay = new THREE.Vector3(45.6, R, 3.6);
  kit.boxCover(relay.x, R, relay.z, 1.4, 2.2, 0.9, m.paintedMetal);
  b.add(new THREE.CylinderGeometry(0.06, 0.09, 6, 6), m.darkMetal, relay.x + 0.4, R + 5.2, relay.z);
  for (const y of [3.5, 5, 6.5]) b.add(worldBox(1.2, 0.05, 0.05, 1), m.darkMetal, relay.x + 0.4, R + y, relay.z);
  const relayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) });
  const relayLamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.04), relayMat);
  relayLamp.position.set(relay.x, R + 1.8, relay.z - 0.47);
  scene.add(relayLamp);
  const relayGlow = glows.add({ pos: new THREE.Vector3(relay.x, R + 1.8, relay.z - 0.8), color: new THREE.Color(1, 0.1, 0.06), radius: 4, base: 1.2, haloSize: 1.4, haloStrength: 0.4, mode: 'blink' });
  relayGlow.materials.push({ mat: relayMat, base: relayMat.color.clone() });

  // Tech Roof: dishes, antenna mast with a blinking aircraft light, generators.
  kit.boxCover(36, R, -8.3, 2.4, 1.5, 1.4, m.paintedMetal);
  kit.boxCover(44.5, R, -6.6, 1.8, 1.2, 1.6, m.darkMetal);
  kit.crates(25, -8.9, R);
  for (const [x, z, a] of [[39, -7.6, 0.6], [46.5, -4.2, -0.4]] as const) {
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), m.darkMetal, x, R + 0.7, z);
    const dish = new THREE.SphereGeometry(0.8, 14, 6, 0, Math.PI * 2, 0, 0.9);
    b.add(dish, m.paintedMetal, x, R + 1.5, z, -0.9, a, 0);
  }
  b.add(new THREE.CylinderGeometry(0.08, 0.14, 9, 6), m.darkMetal, 33, R + 4.5, -8.4);
  const aviMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.2, 0.1) });
  const avi = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), aviMat);
  avi.position.set(33, R + 9.1, -8.4);
  scene.add(avi);
  const aviGlow = glows.add({ pos: avi.position.clone(), color: new THREE.Color(1, 0.08, 0.05), radius: 3, base: 1, haloSize: 3, haloStrength: 0.5, mode: 'blink', seed: 2.2 });
  aviGlow.materials.push({ mat: aviMat, base: aviMat.color.clone() });

  // Lantern Roof: a tiny rooftop shrine and laundry on a line.
  kit.torii(12, 21.5, 1.6, R, 2.4, true);
  kit.boxCover(14.8, R, 21.5, 1.2, 1.4, 1.2, kit.wood, 'wood');
  b.add(worldBox(1.5, 0.12, 1.5, 1), kit.red, 14.8, R + 1.46, 21.5, 0, 0, 0.12);
  const shrineLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.5) });
  const sl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), shrineLamp);
  sl.position.set(13.9, R + 1.2, 21.5);
  scene.add(sl);
  glows.add({ pos: sl.position.clone(), color: new THREE.Color(1, 0.45, 0.2), radius: 4, base: 1, haloSize: 1.4, haloStrength: 0.35, mode: 'buzz' }).materials.push({ mat: shrineLamp, base: shrineLamp.color.clone() });
  kit.cableLine(new THREE.Vector3(7, R + 2.1, 16.5), new THREE.Vector3(18, R + 2.1, 16.5), 0.25, 0.01);
  for (const x of [7, 18]) b.add(worldBox(0.07, 2.1, 0.07, 1), m.darkMetal, x, R + 1.05, 16.5);
  const sheet = new THREE.PlaneGeometry(0.9, 1.1);
  const sheetMats = [0xd8d4c8, 0x6a8ab0, 0xc06a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const sheets: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(sheet, sheetMats[i % 3]);
    mesh.position.set(8.2 + i * 1.7, R + 1.5, 16.5);
    mesh.geometry.translate(0, 0, 0);
    scene.add(mesh);
    mesh.userData.soft = true; // hanging laundry: you brush through it
    sheets.push(mesh);
  }
  kit.updaters.push((t) => sheets.forEach((sh, i) => (sh.rotation.x = Math.sin(t * 1.7 + i) * 0.18 + wind() * 0.25)));
  kit.boxCover(18.2, R, 22.6, 1.4, 1.2, 1.4, m.paintedMetal);

  // West Terrace: a greenhouse glowing magenta, planters, benches.
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8d0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28, envMapIntensity: 1.6, depthWrite: false });
  // 2.6 m deep (was 3): the 0.62 m strip left behind it against the parapet was a body-wide trap.
  b.add(worldBox(4.2, 2.6, 2.6, 1), glass, -12, R + 1.3, 21.4);
  col.add(-14.1, R, 20.1, -9.9, R + 2.6, 22.7, 'glass');
  const grow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 2.8) });
  b.add(worldBox(3.6, 0.05, 0.1, 1), grow, -12, R + 2.4, 21.4);
  glows.add({ pos: new THREE.Vector3(-12, R + 1.8, 21.6), color: new THREE.Color(0.9, 0.2, 1), radius: 6, base: 1, haloSize: 3.5, haloStrength: 0.18, mode: 'steady' }).materials.push({ mat: grow, base: grow.color.clone() });
  kit.planter(-7.5, 22.4, rnd, R);
  kit.planter(-20.1, 3, rnd, R);
  kit.bench(-17, 16.8, true, R);
  kit.bench(-8, 16.6, true, R);
  kit.boxCover(-20.2, R, 8, 1.3, 1.2, 1.8, m.paintedMetal);

  // Sniper perches: the E1 rooftop and a maintenance catwalk on the overpass.
  col.add(15, 10, -21, 15.3, 10.6, -3, 'concrete');
  const CW = { x0: -8, z0: -21, x1: 8, z1: -19.8 };
  b.add(worldBox(16, 0.15, 1.2, 1), arch.deckMat, 0, RAIL.deckTop - 0.075, -20.4);
  col.add(CW.x0, RAIL.deckTop - 0.2, CW.z0, CW.x1, RAIL.deckTop, CW.z1, 'metal');
  arch.rail(CW, 's', undefined, undefined, RAIL.deckTop);
  arch.rail(CW, 'w', undefined, undefined, RAIL.deckTop);
  arch.rail(CW, 'e', undefined, undefined, RAIL.deckTop);
  for (const x of [-7, 0, 7]) b.add(worldBox(0.08, 1.4, 0.08, 1), m.darkMetal, x, RAIL.deckTop - 0.7, -19.9);
  arch.shelters.push({ ...CW, y: RAIL.deckTop - 0.2 });
  // Roof access hatches the snipers emerge from.
  b.add(worldBox(1.2, 1.1, 1.0, 1), m.darkMetal, -19.6, ROOF + 0.55, 12.6);
  b.add(worldBox(1.2, 1.1, 1.0, 1), m.darkMetal, 17.8, 10.55, -12.5);
  col.addCentered(-19.6, ROOF + 0.55, 12.6, 1.2, 1.1, 1.0, 'metal');
  col.addCentered(17.8, 10.55, -12.5, 1.2, 1.1, 1.0, 'metal');
  const perches = [new THREE.Vector3(-16.2, ROOF, 12.5), new THREE.Vector3(16.2, 10, -9), new THREE.Vector3(0, RAIL.deckTop, -20.4)];

  // ======================================================================= Signs
  const specs: SignSpec[] = [
    // Plaza: cyan and magenta around the fountain.
    { text: 'カラオケ', color: '#22e8ff', style: 'neon', vertical: true, mount: 'perp', face: 's', wall: -15, x: 9, y: 9.4, z: -14.1, size: 5.6, light: 28, lightDist: 22, hum: true },
    { text: 'ホテル', color: '#ff2fd0', style: 'neon', vertical: true, mount: 'perp', face: 'w', wall: 15, x: 14.1, y: 8.6, z: 9.5, size: 4.4, mode: 'broken', hum: true },
    { text: 'ゲーム', color: '#7a6bff', style: 'neon', vertical: true, mount: 'perp', face: 'n', wall: 15, x: -9.5, y: 8, z: 14.2, size: 3.4, mode: 'flicker' },
    { text: 'ラーメン', color: '#ffae2a', style: 'neon', vertical: false, mount: 'wall', face: 'e', wall: -15, x: -14.95, y: 7.4, z: 10, size: 4.2, light: 16, lightDist: 14, mode: 'buzz' },
    { text: '薬', color: '#2cff9a', style: 'box', bg: '#12b866', textColor: '#ffffff', vertical: true, mount: 'perp', face: 'n', wall: 15, x: 8, y: 6.2, z: 14.4, size: 1.4 },
    { text: '麻雀', color: '#39ffd9', style: 'neon', vertical: true, mount: 'perp', face: 's', wall: -15, x: -10, y: 8.4, z: -14.4, size: 2.6, mode: 'flicker', floorY: DECK },
    { text: 'ネオン', color: '#ff3a8a', style: 'neon', vertical: false, mount: 'wall', face: 'w', wall: 15, x: 14.95, y: 7.0, z: -9, size: 3.2, floorY: DECK, mode: 'steady' },
    // Lantern Street: warm reds.
    { text: '居酒屋', color: '#ff3a24', style: 'neon', vertical: true, mount: 'perp', face: 'e', wall: -5, x: -4.3, y: 6.4, z: 31, size: 3.4, mode: 'buzz' },
    { text: '焼鳥', color: '#ff7b30', style: 'box', bg: '#d8401a', textColor: '#fff4e0', vertical: true, mount: 'perp', face: 'w', wall: 5, x: 4.4, y: 5.6, z: 25, size: 2.2 },
    { text: 'スナック', color: '#ff69c8', style: 'box', bg: '#ff5fbf', textColor: '#2a0018', vertical: true, mount: 'perp', face: 'w', wall: 5, x: 4.3, y: 6.8, z: 37, size: 3.4, mode: 'flicker' },
    { text: '営業中', color: '#ff7b30', style: 'neon', vertical: false, mount: 'wall', face: 'e', wall: -5, x: -4.95, y: 3.65, z: 38, size: 1.6, reflect: false },
    { text: '新宿三丁目', color: '#5fd0ff', style: 'box', bg: '#0f3a8a', textColor: '#ffffff', vertical: false, mount: 'wall', face: 'w', wall: 5, x: 4.95, y: 10.5, z: 30, size: 4.5, reflect: false, brightness: 1.0 },
    // Neon Alley: dense magenta, violet and cold white.
    { text: 'ホテル', color: '#ff2fd0', style: 'neon', vertical: true, mount: 'perp', face: 's', wall: -3, x: 30, y: 9.2, z: -2.4, size: 4.6, light: 30, lightDist: 18, hum: true, mode: 'steady' },
    { text: 'BAR夜', color: '#a855ff', style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: 2, x: 39, y: 4.8, z: 1.95, size: 3.2, mode: 'flicker' },
    { text: 'パチンコ', color: '#f4f8ff', style: 'box', bg: '#e8eef8', textColor: '#d0105a', vertical: true, mount: 'perp', face: 'n', wall: 2, x: 36, y: 7.4, z: 1.6, size: 3.8, brightness: 1.5 },
    { text: 'マッサージ', color: '#ff4fa0', style: 'neon', vertical: true, mount: 'perp', face: 's', wall: -3, x: 45.5, y: 7.5, z: -2.6, size: 4.2, mode: 'broken' }, // clear of the rooftop bridge at x 40–42.5
    { text: '電脳', color: '#9b7bff', style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: 2, x: 45, y: 6.6, z: 1.95, size: 2.6 },
    { text: 'ネットカフェ', color: '#7fd8ff', style: 'box', bg: '#103a7a', textColor: '#ffffff', vertical: false, mount: 'wall', face: 's', wall: -3, x: 36.5, y: 6.9, z: -2.95, size: 4.2, brightness: 1.1, floorY: DECK },
    // Service Passage: sodium yellow and toxic green.
    { text: '非常口', color: '#3dff6a', style: 'box', bg: '#108a3a', textColor: '#ffffff', vertical: false, mount: 'wall', face: 'e', wall: -45, x: -44.95, y: 3.0, z: -4, size: 1.8, brightness: 1.6 },
    { text: '危険', color: '#ffd23a', style: 'box', bg: '#f2c018', textColor: '#1a1206', vertical: true, mount: 'perp', face: 'n', wall: -2, x: -20, y: 3.2, z: -2.4, size: 1.4, reflect: false },
    // Railway Street: the hot pink focal sign at the far end.
    { text: '東京酒場', color: '#ff2a6d', style: 'neon', vertical: false, mount: 'front', x: 0, y: 17, z: -57.85, size: 16, brightness: 3.6, halo: 22 },
    { text: 'スナック', color: '#ff69c8', style: 'neon', vertical: true, mount: 'perp', face: 'e', wall: -6, x: -5.2, y: 6.5, z: -36, size: 3.6, mode: 'flicker' },
    { text: '質屋', color: '#ffc04a', style: 'box', bg: '#f2b028', textColor: '#1a1206', vertical: true, mount: 'perp', face: 'w', wall: 6, x: 5.3, y: 5.6, z: -44, size: 2.4 },
    { text: 'BAR', color: '#a855ff', style: 'neon', vertical: false, mount: 'wall', face: 'w', wall: 6, x: 5.95, y: 4.8, z: -31, size: 2.4, mode: 'flicker' },
    // Back alley: one dim, failing sign.
    { text: '占い', color: '#c25bff', style: 'neon', vertical: true, mount: 'perp', face: 'e', wall: -24, x: -23.4, y: 4.6, z: 14, size: 1.8, mode: 'broken' },
  ];
  const signs = specs.map((s) => addSign(ctx, s));

  // Signs hanging under the overpass rattle when the train passes.
  const trackside: THREE.Object3D[] = [];
  const hang = [
    addSign(ctx, { text: '高架下', color: '#ffb02a', style: 'box', bg: '#1a1a1a', textColor: '#ffb02a', vertical: false, mount: 'wall', face: 's', wall: -21.2, x: 0, y: 5.6, z: -20.9, size: 2.8, brightness: 1.4, reflect: false }),
    addSign(ctx, { text: '駐輪禁止', color: '#ff4040', style: 'box', bg: '#f0f0f0', textColor: '#d01010', vertical: false, mount: 'wall', face: 's', wall: -21.2, x: 14.5, y: 5.4, z: -20.9, size: 2.4, brightness: 1.2, reflect: false }),
  ];
  for (const h of hang) {
    signs.push(h);
    if (h.group) trackside.push(h.group);
    b.add(worldBox(0.04, 0.9, 0.04, 1), m.darkMetal, h.pos.x - 1.0, 6.0, -21.0);
    b.add(worldBox(0.04, 0.9, 0.04, 1), m.darkMetal, h.pos.x + 1.0, 6.0, -21.0);
  }

  // Rooftop landmark: a tall scrolling billboard visible from everywhere.
  const bbTex = billboardTexture();
  bbTex.repeat.set(1, 0.5);
  const bbMat = new THREE.MeshBasicMaterial({ map: bbTex, color: new THREE.Color(1.8, 1.8, 1.8) });
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 13), bbMat);
  bb.position.set(10.5, 12 + 8, -16.4);
  scene.add(bb);
  b.add(worldBox(4.6, 13.4, 0.4, 1), m.darkMetal, 10.5, 20, -16.65);
  for (const x of [9, 12]) b.add(worldBox(0.3, 2, 0.3, 1), m.darkMetal, x, 13, -16.8);
  const bbGlow = glows.add({ pos: new THREE.Vector3(10.5, 20, -15.8), color: new THREE.Color(1.0, 0.3, 0.85), radius: 12, base: 1.0, haloSize: 14, haloStrength: 0.16, mode: 'flicker' });
  bbGlow.materials.push({ mat: bbMat, base: bbMat.color.clone() });

  // ======================================================================= Lights (real ones are budgeted)
  const breakables: Breakable[] = [];
  const tubeGeo = new THREE.BoxGeometry(1.2, 0.05, 0.08);
  /** Fluorescent tube under a walkway: fake glow only, shootable. */
  const tube = (x: number, y: number, z: number, rotY = 0, mode: Glow['mode'] = 'steady') => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.9, 2.8) });
    const mesh = new THREE.Mesh(tubeGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    const g = glows.add({ pos: new THREE.Vector3(x, y - 0.2, z), color: new THREE.Color(0.65, 0.98, 0.92), radius: 5, base: 0.9, haloSize: 3.2, haloStrength: 0.16, mode, reflect: { width: 2.2, anchor: new THREE.Vector3(x, 0, z), length: 4, map: null } });
    g.materials.push({ mat, base: mat.color.clone() });
    const c = col.add(x - 0.65, y - 0.08, z - 0.65, x + 0.65, y + 0.05, z + 0.65, 'glass', false);
    breakables.push({ glow: g, collider: c, pos: new THREE.Vector3(x, y, z) });
  };
  tube(-5, DECK - 0.27, -13.5);
  tube(5, DECK - 0.27, -13.5, 0, 'broken');
  tube(-13.5, DECK - 0.27, -8, Math.PI / 2);
  tube(13.5, DECK - 0.27, -8, Math.PI / 2, 'flicker');
  tube(-24, DECK - 0.27, -5.1, 0, 'buzz');
  tube(24, DECK - 0.27, -2.1);
  tube(0, RAIL.deckBottom - 0.1, -21.5);
  tube(15, RAIL.deckBottom - 0.1, -21.5, 0, 'broken');

  /** Wall/pole lamp with a real light. */
  const lamp = (x: number, y: number, z: number, color: THREE.Color, light: number, dist: number, mode: Glow['mode'], reflectLen = 7) => {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3) });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.25), mat);
    head.position.set(x, y, z);
    scene.add(head);
    const l = new THREE.PointLight(color, light, dist, 2);
    l.position.set(x, y - 0.4, z);
    scene.add(l);
    const g = glows.add({ pos: new THREE.Vector3(x, y - 0.1, z), color, radius: 7, base: 1.2, light: l, lightBase: light, haloSize: 5, haloStrength: 0.22, mode, reflect: { width: 1.6, anchor: new THREE.Vector3(x, 0, z), length: reflectLen, map: null } });
    g.materials.push({ mat, base: mat.color.clone() });
    const c = col.add(x - 0.35, y - 0.1, z - 0.2, x + 0.35, y + 0.1, z + 0.2, 'glass', false);
    breakables.push({ glow: g, collider: c, pos: new THREE.Vector3(x, y, z), light: l });
    return g;
  };
  // Railway Street lamp post.
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 5.6, 8), m.paintedMetal, -4.9, 2.8, -46);
  col.addCentered(-4.9, 2.8, -46, 0.22, 5.6, 0.22, 'metal');
  b.add(worldBox(1.8, 0.08, 0.08, 1), m.paintedMetal, -4.1, 5.55, -46);
  lamp(-3.3, 5.45, -46, new THREE.Color(0.6, 1.0, 0.92), 30, 14, 'flicker', 9);
  // Sodium lamp in the service passage, under the pipe gallery.
  b.add(worldBox(0.08, 0.6, 0.5, 1), m.darkMetal, -28, 3.9, -5.7);
  lamp(-28, 3.6, -5.3, new THREE.Color(1.0, 0.62, 0.22), 26, 13, 'buzz', 6);
  // Dim lamp over the back-alley corner.
  b.add(worldBox(0.5, 0.08, 0.08, 1), m.darkMetal, -23.6, 4.2, 22);
  lamp(-23.2, 4.1, 22, new THREE.Color(1.0, 0.35, 0.3), 0, 10, 'broken', 5);

  // Lantern Street: strings of lanterns across the street, one warm real light.
  const lanternPos = kit.lanternStrings(
    [16.5, 20.5, 24.5, 28.5, 32.5, 36.5, 40.5].map((z) => ({ x0: -5, x1: 5, z, y: 5.0, n: 7 })),
    wind,
  );
  const lanternLight = new THREE.PointLight(0xff4a28, 10, 14, 2);
  lanternLight.position.set(0, 3.6, 28);
  scene.add(lanternLight);
  glows.add({
    pos: new THREE.Vector3(0, 4.4, 28),
    color: new THREE.Color(1.0, 0.32, 0.16),
    radius: 9,
    base: 1.3,
    light: lanternLight,
    lightBase: 10,
    haloSize: 6,
    haloStrength: 0.08,
    mode: 'buzz',
    reflect: { width: 6, anchor: new THREE.Vector3(0, 0, 28), length: 6, map: null },
    onChange: (v) => kit.lanternMats.forEach((lm) => (lm.emissiveIntensity = 1.6 * v)),
  });
  // Fake glows further along the strings so rain and steam pick up the red.
  for (const z of [18.5, 38]) glows.add({ pos: new THREE.Vector3(0, 4.4, z), color: new THREE.Color(1.0, 0.3, 0.14), radius: 8, base: 1.1, haloSize: 0.01, haloStrength: 0, mode: 'buzz' });
  void lanternPos;

  // Plaza vending machines under W2 with the one cold light.
  const vf = kit.vending(14.55, -10.6, 'w', 'red');
  const vf2 = kit.vending(14.55, -9.5, 'w', 'white');
  const vl = new THREE.PointLight(0xdfefff, 18, 9, 2);
  vl.position.set(13.4, 1.4, -10);
  scene.add(vl);
  const vg = glows.add({ pos: new THREE.Vector3(13.6, 1.3, -10), color: new THREE.Color(0.85, 0.93, 1.0), radius: 5, base: 1.1, light: vl, lightBase: 18, haloSize: 4, haloStrength: 0.2, mode: 'buzz', reflect: { width: 2.6, anchor: new THREE.Vector3(13.9, 0, -10), length: 4, map: null } });
  vg.materials.push({ mat: vf, base: vf.color.clone() }, { mat: vf2, base: vf2.color.clone() });
  // More vending: Lantern Street and the back-alley knee (cover).
  for (const [x, z, f, t] of [
    [4.55, 21.5, 'w', 'white'],
    [4.55, 22.6, 'w', 'red'],
    [-23.55, 23.0, 'e', 'red'],
    [44.5, 1.55, 'n', 'white'],
  ] as const) {
    const mat = kit.vending(x, z, f, t);
    const [nx, nz] = f === 'w' ? [-1, 0] : f === 'e' ? [1, 0] : [0, -1];
    const g = glows.add({ pos: new THREE.Vector3(x + nx * 1.0, 1.3, z + nz * 1.0), color: new THREE.Color(0.8, 0.9, 1.0), radius: 4, base: 0.9, haloSize: 3, haloStrength: 0.16, reflect: { width: 1.6, anchor: new THREE.Vector3(x + nx * 0.7, 0, z + nz * 0.7), length: 3.5, map: null } });
    g.materials.push({ mat, base: mat.color.clone() });
  }

  // ======================================================================= Plaza furniture
  kit.yatai(-8, 11.4);
  const stallMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 1.0) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), stallMat);
  bulb.position.set(-8, 2.2, 11.6);
  scene.add(bulb);
  const stallGlow = glows.add({ pos: new THREE.Vector3(-8, 2.1, 11.8), color: new THREE.Color(1.0, 0.62, 0.3), radius: 5, base: 1.0, haloSize: 2.4, haloStrength: 0.3, mode: 'buzz', reflect: { width: 2.2, anchor: new THREE.Vector3(-8, 0, 12.2), length: 3.5, map: null } });
  stallGlow.materials.push({ mat: stallMat, base: stallMat.color.clone() });
  breakables.push({ glow: stallGlow, collider: col.add(-8.2, 2.0, 11.4, -7.8, 2.4, 11.8, 'glass', false), pos: bulb.position.clone() });
  kit.planter(-9.5, 4.5, rnd);
  kit.planter(9.6, -1.6, rnd);
  kit.planter(-8.5, -7.5, rnd);
  kit.planter(8.5, -7.5, rnd);
  kit.bench(3.6, 12.6, true);
  kit.bench(-11.6, -2.0, false);
  kit.bench(11.6, -6.0, false);
  kit.bollards([[-4, 15.5], [-2.6, 15.5], [2.6, 15.5], [4, 15.5], [-4.6, -15.5], [4.6, -15.5]]);
  kit.bikes(-14.4, 3.5, 3);
  kit.bags(14.2, 13.8, 0, rnd);

  // ======================================================================= Zone props
  // Lantern Street.
  kit.torii(0, 44, 6);
  kit.bikes(4.3, 33, 4);
  kit.crates(-4.4, 41.5);
  kit.bags(-4.4, 21.5, 4, rnd);
  kit.dumpster(-4.2, 46.6, false);
  // Railway Street.
  kit.dumpster(-4.6, -31, true);
  kit.crates(4.2, -40);
  kit.crates(-4.4, -51);
  kit.bags(4.6, -48, 5, rnd);
  kit.fenceRun(-6, -26, -6, -21);
  kit.fenceRun(23, -26, 23, -21);
  kit.crates(-10, -24.5);
  kit.crates(-15, -23);
  kit.crates(26, -24.6);
  // Trackside.
  kit.crates(8.2, -25.6);
  kit.dumpster(22.4, -12, true);
  kit.bags(20, -6, 4, rnd);
  // Neon Alley.
  kit.dumpster(35, 1.35, false);
  kit.crates(46.2, -2.6);
  kit.bags(33, 1.4, 4, rnd);
  // Service Passage.
  kit.dumpster(-26, -2.6, false);
  kit.bags(-19, -2.6, 3, rnd);
  kit.pipes('s', -6, -45, -15, [3.4, 3.85, 2.9], true);
  kit.pipes('n', -2, -45, -24, [2.6, 3.1, 5.6], true);
  // Back alley.
  kit.bags(-22.5, 4, 4, rnd);
  kit.crates(-23.6, -0.6);
  kit.dumpster(-23.3, 9, true);
  kit.pipes('w', -21, -2, 15, [3.0, 3.5]);
  kit.fans([
    { x: -24, y: 3.2, z: 6, face: 'e' },
    { x: -24, y: 2.8, z: 18, face: 'e' },
    { x: -21, y: 6.2, z: 2, face: 'w' },
    { x: -27, y: 2.6, z: -2, face: 'n' },
    { x: -41, y: 2.6, z: -2, face: 'n' },
    { x: -22, y: 6.4, z: -6, face: 's' },
    { x: 19, y: 6.2, z: -12, face: 'e' },
    { x: 44, y: 3.0, z: -3, face: 's' },
  ]);

  // AC units and gutter pipes on every street-facing facade.
  const ac: [Parameters<PropKit['acUnits']>[0], number, number, number, number?][] = [
    ['e', -5, 29, 48], ['w', 5, 24, 48], ['e', -5, 15, 24, ROOF - 0.6],
    ['e', -6, -58, -26], ['w', 6, -58, -26],
    ['n', 2, 22.2, 48, ROOF - 0.6], ['s', -3, 31.2, 48, ROOF - 0.6],
    ['s', -6, -45, -15], ['n', -2, -45, -36], ['n', -2, -33, -24],
    ['s', -15, -15, 15], ['n', 15, -15, 15, ROOF - 0.6], ['e', -15, -15, -6], ['w', 15, -15, -3],
    ['e', -24, -2, 27], ['w', -21, -2, 15, ROOF - 0.6],
    ['w', 23, -21, -9], ['e', 19, -21, -3],
  ];
  for (const [f, w, a0, a1, max] of ac) kit.acUnits(f, w, a0, a1, rnd, 7.6, max);

  // Utility poles and the cable mess overhead.
  const poles = [kit.pole(-4.6, 19), kit.pole(4.6, 27), kit.pole(-4.6, 35), kit.pole(4.6, 43), kit.pole(-5.3, -29), kit.pole(5.3, -38), kit.pole(-5.3, -49)];
  const chain = (ids: number[]) => {
    for (let i = 0; i < ids.length - 1; i++) for (let k = 0; k < 3; k++) kit.cableLine(poles[ids[i]][k], poles[ids[i + 1]][k], 0.8 + rnd() * 0.6);
  };
  chain([0, 1, 2, 3]);
  chain([4, 5, 6]);
  for (const t of poles) {
    for (let k = 0; k < 2; k++) {
      const target = new THREE.Vector3(t[0].x < 0 ? 5.5 : -5.5, 6 + rnd() * 5, t[k].z + (rnd() - 0.5) * 8);
      kit.cableLine(t[k], target, 0.6 + rnd() * 1.2);
    }
  }
  // Facade-to-facade bundles: Neon Alley is the densest.
  for (let i = 0; i < 16; i++) {
    const x = 17 + i * 2 + rnd();
    const y = 6.5 + rnd() * 8;
    kit.cableLine(new THREE.Vector3(x, y, -3), new THREE.Vector3(x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 2, 2), 0.4 + rnd() * 1.0, 0.012 + rnd() * 0.02);
  }
  for (let i = 0; i < 8; i++) {
    const z = 18 + i * 4 + rnd() * 2;
    const y = 7 + rnd() * 6;
    kit.cableLine(new THREE.Vector3(-5, y, z), new THREE.Vector3(5, y + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 5), 0.5 + rnd() * 1.4, 0.015 + rnd() * 0.02);
  }
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 10 + rnd() * 4;
    kit.cableLine(new THREE.Vector3(Math.cos(a) * 15, y, Math.sin(a) * 15), new THREE.Vector3(-Math.cos(a) * 15, y - 1, -Math.sin(a) * 15 + (rnd() - 0.5) * 6), 1.5 + rnd() * 1.5, 0.014);
  }
  for (let i = 0; i < 8; i++) {
    const z = -20 - i * 4.6 - rnd() * 2;
    const y = 6 + rnd() * 6;
    kit.cableLine(new THREE.Vector3(-6, y, z), new THREE.Vector3(6, y + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 6), 0.5 + rnd() * 1.5, 0.015 + rnd() * 0.02);
  }

  // ======================================================================= Steam (and the coloured light that tints it)
  const ventGeo = worldBox(1.2, 0.04, 0.8, 1);
  const steamEmitters = [
    new THREE.Vector4(-8, 2.3, 11.2, 0.45), // ramen stall
    new THREE.Vector4(5.2, 0.05, -4.5, 0.7),
    new THREE.Vector4(-22.5, 0.05, 6.5, 1.0),
    new THREE.Vector4(-22.5, 0.05, 19.5, 0.85),
    new THREE.Vector4(-38, 0.05, -3.2, 1.0),
    new THREE.Vector4(-30, 3.4, -5.5, 0.6), // pipe valve leak
    new THREE.Vector4(-2.4, 0.05, -34, 0.8),
    new THREE.Vector4(38, 0.05, 0.8, 0.8),
    new THREE.Vector4(21, 0.05, -16, 0.9),
    new THREE.Vector4(-4.4, 3.6, 33, 0.5), // izakaya kitchen exhaust
  ];
  for (const e of steamEmitters) if (e.y < 0.1) b.add(ventGeo, m.darkMetal, e.x, 0.02, e.z);
  b.add(worldBox(0.6, 0.4, 0.6, 1), m.paintedMetal, -4.75, 3.6, 33);
  // Red and violet steam in the back alley and service passage.
  const tint = (x: number, y: number, z: number, c: THREE.Color, mode: Glow['mode'] = 'steady') =>
    glows.add({ pos: new THREE.Vector3(x, y, z), color: c, radius: 6, base: 1.1, haloSize: 3.5, haloStrength: 0.12, mode });
  tint(-22.6, 1.4, 6.5, new THREE.Color(1.0, 0.08, 0.16), 'buzz');
  tint(-22.4, 1.6, 19.5, new THREE.Color(0.55, 0.1, 1.0));
  tint(-37.5, 1.5, -3.6, new THREE.Color(0.75, 0.15, 1.0), 'flicker');
  tint(37.5, 1.4, 0.6, new THREE.Color(1.0, 0.1, 0.5));

  // ======================================================================= Interactive spots
  const cabinets: CabinetSpot[] = [
    { pos: new THREE.Vector3(-14.75, 0, -10.2), face: 'e', collider: kit.cabinet(-14.75, -10.2, 'e') },
    { pos: new THREE.Vector3(-30, 0, -2.25), face: 'n', collider: kit.cabinet(-30, -2.25, 'n') },
    // 9.1: clear of stair S7 behind it (was flush with its side, the top cap 7.5 cm into the steps).
    { pos: new THREE.Vector3(27.5, DECK, -2.64), face: 's', collider: kit.cabinet(27.5, -2.64, 's', DECK) },
  ];
  const medkits = [new THREE.Vector3(-43.8, 0, -2.6), new THREE.Vector3(30.2, DECK, -2.6)];

  // ======================================================================= Navigation
  const nodes: THREE.Vector3[] = [];
  const N = (x: number, y: number, z: number) => nodes.push(new THREE.Vector3(x, y, z)) - 1;
  // Plaza ring around the fountain, corners and the walkway undersides.
  for (let i = 0; i < 8; i++) N(Math.cos((i * Math.PI) / 4) * 7.5, 0, Math.sin((i * Math.PI) / 4) * 7.5);
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11.5, 11], [11.5, 13.8], [0, -13.5], [-13, -4], [13, -0.5], [0, 13], [-11, 0], [11, -5]]) N(x, 0, z);
  // Lantern Street.
  for (const z of [18, 25, 32, 39, 45]) N(0, 0, z);
  // Back alley.
  for (const [x, z] of [[-8, 25.5], [-15, 25.5], [-22.5, 25.5], [-22.5, 18], [-22.5, 12], [-22.2, 4], [-22.5, -3.6]]) N(x, 0, z);
  // Service Passage.
  for (const x of [-18, -28, -36, -42.5]) N(x, 0, -3.6);
  // Railway Street.
  for (const z of [-18, -23.5, -30, -38, -46, -53]) N(0, 0, z);
  // Trackside.
  for (const [x, z] of [[3, -21.9], [8.5, -21.9], [15, -21.9], [20.6, -21.9], [21, -17], [21, -9], [21, -4]]) N(x, 0, z);
  // Neon Alley.
  for (const x of [17, 26, 33, 40, 45]) N(x, 0, -0.6);
  // Upper level.
  const up = (x: number, z: number) => N(x, DECK, z);
  for (const x of [-13.5, -7, 0, 7, 13.5]) up(x, -13.5);
  up(-13.5, -7.5);
  up(-13.5, -5.1);
  up(-13.5, -1);
  const s2top = up(-13.7, 3.8);
  up(13.5, -7.5);
  up(13.5, -2.1);
  const s1top = up(13.7, 3.8);
  for (const x of [19, 25]) up(x, -2.1);
  const s4top = up(30.5, -2.1);
  for (const x of [-17, -24]) up(x, -5.1);
  const s3top = up(-30.5, -5.1);
  // Stairs: bottom → middle → top, linked by hand.
  const links: [number, number][] = [];
  const stairChain = (bottom: [number, number], mid: [number, number], top: number) => {
    const a = N(bottom[0], 0, bottom[1]);
    const c = N(mid[0], DECK / 2, mid[1]);
    links.push([a, c], [c, top]);
  };
  stairChain([13.7, 14.2], [13.7, 9], s1top);
  stairChain([-13.7, 14.2], [-13.7, 9], s2top);
  stairChain([-41.6, -5.1], [-36, -5.1], s3top);
  stairChain([41.6, -2.1], [36, -2.1], s4top);
  // Rooftops.
  const rf = (x: number, z: number) => N(x, ROOF, z);
  const s5top = rf(23.4, 3.3);
  for (const [x, z] of [[26, 7.5], [31, 9], [37, 10.5], [44, 8.5], [41.2, 3.6], [17.5, 12], [17.5, 18], [11, 19.5], [7, 20], [0, 20], [-7, 20], [-12, 19.5], [-18.5, 19.5], [-18.5, 12], [-16.2, 12.5], [-18.5, 5], [-18.5, -0.5], [41.2, -4.5], [36, -6], [27, -7.2]]) rf(x, z);
  const s6top = rf(33, 1.1);
  const s7top = rf(32.4, -4.2);
  const s8top = rf(-16.2, 8.7);
  const chain3 = (bottom: [number, number, number], mid: [number, number, number], top: number) => {
    const a = N(...bottom);
    const c = N(...mid);
    links.push([a, c], [c, top]);
  };
  chain3([14.2, DECK, 3.3], [18.6, (DECK + ROOF) / 2, 3.3], s5top);
  chain3([15.8, 0, 1.1], [24.5, ROOF / 2, 1.1], s6top);
  chain3([23.5, DECK, -4.2], [27.6, (DECK + ROOF) / 2, -4.2], s7top);
  chain3([-16.2, DECK, -0.8], [-16.2, (DECK + ROOF) / 2, 4], s8top);
  // Station: append its graph (indices shifted).
  const base = nodes.length;
  nodes.push(...metro.nodes);
  for (const [a, c] of metro.links) links.push([a + base, c + base]);
  metro.entrances = metro.entrances.map((e) => ({ name: e.name, chain: e.chain.map((i) => i + base) }));

  // ======================================================================= Combat layout
  const coverPoints = [
    // Plaza and under the walkways.
    [-9, 0, 6], [9, 0, 6], [0, 0, -11.2], [-11, 0, 0], [11, 0, 0], [-6, 0, -9.5], [6, 0, -9.5],
    // Upper level: snipers on the balconies keep the fight vertical.
    [0, DECK, -13.5], [-8, DECK, -13.5], [8, DECK, -13.5], [-13.5, DECK, -8], [13.5, DECK, -8], [-13.5, DECK, 1], [13.5, DECK, 1], [24, DECK, -2.1], [-24, DECK, -5.1],
    // Streets.
    [3, 0, -19], [-3, 0, -31], [3, 0, -42], [25, 0, -0.6], [36, 0, -0.6], [-25, 0, -3.2], [-35, 0, -3.2], [3, 0, 30], [-3, 0, 38], [15, 0, -22.5], [21, 0, -12], [-22.5, 0, 10],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const spawns = [
    new THREE.Vector3(45.5, 0, -0.4), // Neon Alley end
    new THREE.Vector3(-43, 0, -3.3), // Service Passage end
    new THREE.Vector3(0, 0, -54), // Railway Street end
    new THREE.Vector3(-3, 0, -52),
    new THREE.Vector3(3, 0, -52),
    new THREE.Vector3(20.5, 0, -24), // trackside, behind the pillars
  ];

  const open = ZONES.flatMap((z) => z.rects);
  return {
    signs,
    steamEmitters,
    coverPoints,
    perches,
    spawns,
    nav: { nodes, links },
    arch,
    kit,
    bounds: new THREE.Box2(new THREE.Vector2(-46, -59), new THREE.Vector2(49, 49)),
    start: { x: 0, z: 24, yaw: 0 },
    cabinets,
    medkits,
    breakables,
    trackside,
    billboard: bbTex,
    open,
    transformers: poles.map((t) => new THREE.Vector3(t[1].x + 0.35, 7.6, t[1].z)),
    vents: [new THREE.Vector3(-30, 3.4, -5.5), new THREE.Vector3(-21.4, 3.2, 6), new THREE.Vector3(19.4, 2.2, -10), new THREE.Vector3(-44.4, 2.4, -5.4), new THREE.Vector3(5.2, 0.1, -4.5)],
    pachinko: new THREE.Vector3(36, 1.5, 1.8),
    doors: [
      new THREE.Vector3(45.5, 0, -0.4),
      new THREE.Vector3(-43, 0, -3.3),
      new THREE.Vector3(0, 0, -54),
      new THREE.Vector3(20.5, 0, -24),
      new THREE.Vector3(0, 0, 46.5),
      new THREE.Vector3(21, 0, -17),
    ],
    // Facing the alley mouth (east, towards Lantern Street and the plaza).
    storyStart: { x: -11, z: 25.5, yaw: -Math.PI / 2 },
    relay,
    metro,
    pois: [
      ...metro.pois,
      // Lantern Street shopfronts (west faces -x, east faces +x).
      ...[29, 33, 37.5, 41].map((z) => ({ pos: v(-3.0, 0, z), yaw: -Math.PI / 2, kind: 'shop' as const })),
      ...[18, 26.5, 31, 39].map((z) => ({ pos: v(3.0, 0, z), yaw: Math.PI / 2, kind: 'shop' as const })),
      // Neon Alley: under the tech deck, and the south shops.
      ...[21, 27, 35].map((x) => ({ pos: v(x, 0, -2.2), yaw: Math.PI, kind: 'shelter' as const })),
      ...[35.5, 41, 46].map((x) => ({ pos: v(x, 0, 0.9), yaw: 0, kind: 'shop' as const })),
      // Plaza: under the walkways out of the rain, the ramen stall, the vending machines.
      ...[-6, 0, 6].map((x) => ({ pos: v(x, 0, -13.6), yaw: Math.PI, kind: 'shelter' as const })),
      { pos: v(-13.4, 0, -6), yaw: -Math.PI / 2, kind: 'shelter' as const },
      { pos: v(13.3, 0, -3), yaw: Math.PI / 2, kind: 'shelter' as const },
      { pos: v(-8.8, 0, 12.4), yaw: Math.PI, kind: 'wait' as const },
      { pos: v(-7.2, 0, 12.4), yaw: Math.PI, kind: 'wait' as const },
      { pos: v(13.6, 0, -10), yaw: Math.PI / 2, kind: 'shop' as const },
      { pos: v(4, 0, 13.2), yaw: 0, kind: 'shop' as const },
      // Under the railway, Railway Street shops.
      { pos: v(-2, 0, -23), yaw: 0, kind: 'shelter' as const },
      ...[-33, -41].map((z) => ({ pos: v(-3.9, 0, z), yaw: -Math.PI / 2, kind: 'shop' as const })),
      ...[-36, -47].map((z) => ({ pos: v(3.9, 0, z), yaw: Math.PI / 2, kind: 'shop' as const })),
      // Chatting groups.
      { pos: v(5, 0, -5.5), yaw: 0.3, kind: 'chat' as const },
      { pos: v(0.5, 0, 35), yaw: 1.2, kind: 'chat' as const },
      { pos: v(38, 0, -0.9), yaw: 0, kind: 'chat' as const },
      { pos: v(-1, 0, -42), yaw: 2, kind: 'chat' as const },
    ],
  };
}
