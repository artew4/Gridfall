import * as THREE from 'three';
import type { City } from './City';
import { RAIL } from './City';
import { Architecture, DECK } from './Architecture';
import { PropKit } from './PropKit';
import { addSign, type SignGlow, type SignSpec } from './Signs';
import type { Glow } from './Glows';
import type { Collider } from './Collision';
import type { NavLayout } from '../enemies/Nav';
import { billboardTexture } from './Textures';
import { worldBox } from './Builder';
import { mulberry32 } from '../core/math';
import { ZONES } from './Zones';

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

export interface Breakable {
  glow: Glow;
  collider: Collider;
  pos: THREE.Vector3;
  /** Real light to kill as well, if any. */
  light?: THREE.PointLight;
  extra?: THREE.MeshBasicMaterial[];
}

export interface CabinetSpot {
  pos: THREE.Vector3;
  face: 'n' | 's' | 'e' | 'w';
  collider: Collider;
}

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
  patrols: { route: THREE.Vector3[]; post?: boolean }[];
  doors: THREE.Vector3[];
  storyStart: { x: number; z: number; yaw: number };
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
  city.block(-21, -5, 15, 24, 11, 1, [
    { face: 'n', from: -15, to: -5, stores: ['shop', 'izakaya'] },
    { face: 'e', stores: ['izakaya', 'izakaya'] },
    { face: 's', stores: ['shutter', 'door', 'shutter', 'shutter'] },
  ], rnd);
  city.block(-21, -15, -2, 15, 9, 2, [
    { face: 'e', stores: ['shop', 'door', 'shop', 'shutter'], upper: ['door'] },
    { face: 'w', stores: ['shutter', 'door', 'shutter'] },
  ], rnd);
  city.block(-45, -24, -2, 27, 12, 0, [
    { face: 'e', stores: ['door', 'shutter', 'shutter', 'door', 'shutter', 'door', 'shutter'] },
    { face: 'n', stores: ['shutter', 'door', 'shutter', 'shutter', 'door'] },
  ], rnd);
  city.block(-40, -5, 27, 50, 13, 2, [
    { face: 'e', from: 27, to: 48, stores: ['izakaya', 'shop', 'izakaya', 'door', 'izakaya'] },
    { face: 'n', from: -24, to: -5, stores: ['shutter', 'shop', 'door', 'shutter'] },
  ], rnd);
  city.block(5, 40, 15, 50, 15, 0, [
    { face: 'w', from: 15, to: 48, stores: ['shop', 'door', 'izakaya', 'shop', 'shutter', 'door', 'shop', 'izakaya'] },
    { face: 'n', from: 5, to: 15, stores: ['shop', 'shop'] },
  ], rnd);
  city.block(-40, 40, 48, 66, 16, 1, [{ face: 'n', from: -5, to: 5, stores: ['shutter', 'door'] }], rnd);
  city.block(15, 48, 2, 15, 13, 2, [
    { face: 'w', from: 2, to: 15 },
    { face: 'n', stores: ['shop', 'door', 'shop', 'izakaya', 'shutter', 'shop', 'door', 'shutter'] },
  ], rnd);
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
  city.block(23, 48, -21, -3, 17, 1, [
    { face: 's', stores: ['shop', 'izakaya', 'shutter', 'door', 'shop', 'shutter'], upper: ['shop', 'door', 'shop', 'shop'] },
    { face: 'w', stores: ['shutter', 'door', 'shutter', 'shutter'] },
  ], rnd);
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

  // Sniper perches: two rooftops with low parapets, and a maintenance catwalk on the overpass.
  col.add(-15.3, 9, -2, -15, 9.6, 15, 'concrete');
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
  b.add(worldBox(1.2, 1.1, 1.0, 1), m.darkMetal, -18.8, 9.55, 10.2);
  b.add(worldBox(1.2, 1.1, 1.0, 1), m.darkMetal, 17.8, 10.55, -12.5);
  col.addCentered(-18.8, 9.55, 10.2, 1.2, 1.1, 1.0, 'metal');
  col.addCentered(17.8, 10.55, -12.5, 1.2, 1.1, 1.0, 'metal');
  const perches = [new THREE.Vector3(-16.2, 9, 8), new THREE.Vector3(16.2, 10, -9), new THREE.Vector3(0, RAIL.deckTop, -20.4)];

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
    { text: 'BAR夜', color: '#a855ff', style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: 2, x: 24, y: 4.8, z: 1.95, size: 3.2, mode: 'flicker' },
    { text: 'パチンコ', color: '#f4f8ff', style: 'box', bg: '#e8eef8', textColor: '#d0105a', vertical: true, mount: 'perp', face: 'n', wall: 2, x: 36, y: 7.4, z: 1.6, size: 3.8, brightness: 1.5 },
    { text: 'マッサージ', color: '#ff4fa0', style: 'neon', vertical: true, mount: 'perp', face: 's', wall: -3, x: 41, y: 7.5, z: -2.6, size: 4.2, mode: 'broken' },
    { text: '電脳', color: '#9b7bff', style: 'neon', vertical: false, mount: 'wall', face: 'n', wall: 2, x: 43, y: 9.5, z: 1.95, size: 3.0 },
    { text: 'ネットカフェ', color: '#7fd8ff', style: 'box', bg: '#103a7a', textColor: '#ffffff', vertical: false, mount: 'wall', face: 's', wall: -3, x: 21, y: 8.2, z: -2.95, size: 4.6, brightness: 1.1, floorY: DECK },
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
  kit.planter(9.5, 4.5, rnd);
  kit.planter(-8.5, -7.5, rnd);
  kit.planter(8.5, -7.5, rnd);
  kit.bench(6.8, 13.6, true);
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
  kit.dumpster(22, 1.35, false);
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
    { x: -34, y: 2.4, z: -2, face: 'n' },
    { x: -41, y: 2.6, z: -2, face: 'n' },
    { x: -22, y: 6.4, z: -6, face: 's' },
    { x: 19, y: 6.2, z: -12, face: 'e' },
    { x: 44, y: 3.0, z: -3, face: 's' },
  ]);

  // AC units and gutter pipes on every street-facing facade.
  const ac: [Parameters<PropKit['acUnits']>[0], number, number, number][] = [
    ['e', -5, 27, 48], ['w', 5, 15, 48], ['e', -5, 15, 24],
    ['e', -6, -58, -26], ['w', 6, -58, -26],
    ['n', 2, 15, 48], ['s', -3, 23, 48],
    ['s', -6, -45, -15], ['n', -2, -45, -24],
    ['s', -15, -15, 15], ['n', 15, -15, 15], ['e', -15, -15, 15], ['w', 15, -15, 15],
    ['e', -24, -2, 27], ['w', -21, -2, 15],
    ['w', 23, -21, -3], ['e', 19, -21, -3],
  ];
  for (const [f, w, a0, a1] of ac) kit.acUnits(f, w, a0, a1, rnd);

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
    { pos: new THREE.Vector3(27.5, DECK, -2.75), face: 's', collider: kit.cabinet(27.5, -2.75, 's', DECK) },
  ];
  const medkits = [new THREE.Vector3(-43.8, 0, -2.6), new THREE.Vector3(30.2, DECK, -2.6)];

  // ======================================================================= Navigation
  const nodes: THREE.Vector3[] = [];
  const N = (x: number, y: number, z: number) => nodes.push(new THREE.Vector3(x, y, z)) - 1;
  // Plaza ring around the fountain, corners and the walkway undersides.
  for (let i = 0; i < 8; i++) N(Math.cos((i * Math.PI) / 4) * 7.5, 0, Math.sin((i * Math.PI) / 4) * 7.5);
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11], [0, -13.5], [-13, -4], [13, -0.5], [0, 13], [-11, 0], [11, -5]]) N(x, 0, z);
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
  for (const x of [17, 26, 33, 40, 45]) N(x, 0, 0.5);
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

  // ======================================================================= Combat layout
  const coverPoints = [
    // Plaza and under the walkways.
    [-9, 0, 6], [9, 0, 6], [0, 0, -11.2], [-11, 0, 0], [11, 0, 0], [-6, 0, -9.5], [6, 0, -9.5],
    // Upper level: snipers on the balconies keep the fight vertical.
    [0, DECK, -13.5], [-8, DECK, -13.5], [8, DECK, -13.5], [-13.5, DECK, -8], [13.5, DECK, -8], [-13.5, DECK, 1], [13.5, DECK, 1], [24, DECK, -2.1], [-24, DECK, -5.1],
    // Streets.
    [3, 0, -19], [-3, 0, -31], [3, 0, -42], [25, 0, 1], [36, 0, 1], [-25, 0, -3.2], [-35, 0, -3.2], [3, 0, 30], [-3, 0, 38], [15, 0, -22.5], [21, 0, -12], [-22.5, 0, 10],
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
    patrols: [
      // Plaza loop around the fountain.
      { route: [v(-7, 0, -10), v(7, 0, -10), v(11, 0, 0), v(5, 0, 9.5), v(-5, 0, 9.5), v(-11, 0, 0)] },
      // Upper walkway sweep.
      { route: [v(-13.5, DECK, -13.5), v(13.5, DECK, -13.5), v(13.5, DECK, -2.1), v(24, DECK, -2.1), v(13.5, DECK, -2.1), v(13.5, DECK, -13.5)] },
      // Railway Street beat.
      { route: [v(0, 0, -19), v(1.5, 0, -38), v(-1.5, 0, -50), v(0, 0, -30)] },
      // Neon Alley.
      { route: [v(17, 0, 0.5), v(40, 0, 0.5)] },
      // A post by the torii, watching Lantern Street.
      { route: [v(2.2, 0, 42.5)], post: true },
    ],
    doors: [
      new THREE.Vector3(45.5, 0, -0.4),
      new THREE.Vector3(-43, 0, -3.3),
      new THREE.Vector3(0, 0, -54),
      new THREE.Vector3(20.5, 0, -24),
      new THREE.Vector3(0, 0, 46.5),
      new THREE.Vector3(21, 0, -17),
    ],
    storyStart: { x: -11, z: 25.5, yaw: Math.PI / 2 },
    pois: [
      // Lantern Street shopfronts (west faces -x, east faces +x).
      ...[29, 33, 37.5, 41].map((z) => ({ pos: v(-3.0, 0, z), yaw: -Math.PI / 2, kind: 'shop' as const })),
      ...[18, 26.5, 31, 39].map((z) => ({ pos: v(3.0, 0, z), yaw: Math.PI / 2, kind: 'shop' as const })),
      // Neon Alley: under the tech deck, and the south shops.
      ...[21, 27, 35].map((x) => ({ pos: v(x, 0, -2.2), yaw: Math.PI, kind: 'shelter' as const })),
      ...[26, 30, 41].map((x) => ({ pos: v(x, 0, 1.2), yaw: 0, kind: 'shop' as const })),
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
      { pos: v(31, 0, 0.6), yaw: 0, kind: 'chat' as const },
      { pos: v(-1, 0, -42), yaw: 2, kind: 'chat' as const },
    ],
  };
}
