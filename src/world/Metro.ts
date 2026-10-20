import * as THREE from 'three';
import type { BuildCtx } from './City';
import type { Architecture } from './Architecture';
import type { PropKit } from './PropKit';
import type { Collider } from './Collision';
import { worldBox } from './Builder';
import { subtractAll, uncovered, type R } from './Rects';
import { ceilingTextures, JP_FONT, shutterTexture, stationWallTexture, terrazzoTexture } from './Textures';

/** Station platform level (B1). */
export const UG = -6;
const TRACK = -7.2;
const CEIL = -1.2;
const WALL_T = 0.4;
const WALL_BOTTOM = -7.6;

/** Where the train stops: car centres and door positions (x) along the platform side (z = 33). */
export const CAR_PITCH = 19.6;
export const CAR_COUNT = 4;
export const CAR_CENTRES = Array.from({ length: CAR_COUNT }, (_, i) => (i - (CAR_COUNT - 1) / 2) * CAR_PITCH);
export const DOOR_XS = CAR_CENTRES.flatMap((c) => [c - 6, c, c + 6]);
export const TRACK_Z = 35.25;
export const SCREEN_Z = 33;

/** Street-level openings of the three entrance stairwells. */
export const METRO_HOLES: R[] = [
  { x0: 7.6, z0: 4.6, x1: 10.6, z1: 15.3 },
  { x0: -17.7, z0: 27.2, x1: -7, z1: 29 },
  { x0: -36, z0: -2, x1: -33, z1: 8.7 },
];

interface Room extends R {
  floor: number;
  /** Stair shaft: no ceiling (open to the street / building above). */
  shaft?: boolean;
}

export interface Shutter {
  name: string;
  open: boolean;
  setOpen(open: boolean): void;
  update(dt: number): void;
}

export interface Board {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  /** Where to stand to read it. */
  readAt: THREE.Vector3;
}

export interface MetroResult {
  holes: R[];
  shelters: (R & { y: number })[];
  shutters: Shutter[];
  boards: Board[];
  /** Screen-door leaves for each of the 12 door positions: 0 closed .. 1 open. */
  setDoors(k: number): void;
  /** Nav: nodes and hand links, plus the stair links per entrance (to cut while locked). */
  nodes: THREE.Vector3[];
  links: [number, number][];
  /** Local node indices of each entrance's stair chain (bottom, mid, top). */
  entrances: { name: string; chain: number[] }[];
  pois: { pos: THREE.Vector3; yaw: number; kind: 'shop' | 'shelter' | 'wait' | 'chat' }[];
  /** Platform floor rect, for boarding logic. */
  platform: R;
  lights: THREE.PointLight[];
  doorZ: number;
  /** Floor plan (for the minimap). */
  rooms: R[];
}

/**
 * Sakura Line underground station under the plaza and Lantern Street: concourse with ticket gates,
 * an 80 m platform behind screen doors, the track pit running into dark tunnels, a maintenance room and
 * a service corridor. Three entrances: the plaza, the back alley (straight onto the platform) and a
 * staff door off the Service Passage. All locked by shutters until the story opens them.
 */
export function buildMetro(ctx: BuildCtx, arch: Architecture, kit: PropKit): MetroResult {
  const { builder: b, col, scene, glows, mats: m } = ctx;
  const rooms: Room[] = [
    { x0: 7.6, z0: 4.6, x1: 10.6, z1: 15.3, floor: UG, shaft: true }, // entrance A stair
    { x0: 7.6, z0: 15.3, x1: 10.6, z1: 17, floor: UG }, // corridor A
    { x0: -14, z0: 17, x1: 14, z1: 27, floor: UG }, // concourse (gates at z≈23)
    { x0: -40, z0: 27, x1: 40, z1: 33, floor: UG }, // platform
    { x0: -110, z0: 33, x1: 110, z1: 37.5, floor: TRACK }, // track pit and tunnels
    { x0: -36, z0: 17, x1: -24, z1: 26.5, floor: UG }, // maintenance
    { x0: -32, z0: 26.5, x1: -29, z1: 27, floor: UG }, // maintenance door
    { x0: -36, z0: 8.7, x1: -33, z1: 17, floor: UG }, // service corridor
    { x0: -36, z0: -2, x1: -33, z1: 8.7, floor: UG, shaft: true }, // entrance C stair
  ];
  const holeB: R = { x0: -17.7, z0: 27.2, x1: -7, z1: 29 };
  const holes: R[] = [rooms[0], holeB, rooms[8]].map((r) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }));
  col.holes.push(...holes);

  // ------------------------------------------------------------------ materials
  const wallTex = stationWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x7c7f80, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.35 });
  const floorTex = terrazzoTexture();
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x8a8a90, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.45 });
  const ct = ceilingTextures();
  const ceilMat = new THREE.MeshStandardMaterial({ map: ct.map, emissiveMap: ct.emissive, emissive: 0xffffff, emissiveIntensity: 0.55, color: 0x8a8c90, roughness: 0.7, side: THREE.DoubleSide });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.3, metalness: 0.9 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8d8e0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 1.4, depthWrite: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x7c8288, roughness: 0.4, metalness: 0.6 });

  // ------------------------------------------------------------------ walls (generated from room edges)
  const touching = (r: Room, edge: 'n' | 's' | 'w' | 'e'): [number, number][] => {
    const out: [number, number][] = [];
    for (const o of rooms) {
      if (o === r) continue;
      if (edge === 'n' && Math.abs(o.z1 - r.z0) < 1e-4) out.push([o.x0, o.x1]);
      if (edge === 's' && Math.abs(o.z0 - r.z1) < 1e-4) out.push([o.x0, o.x1]);
      if (edge === 'w' && Math.abs(o.x1 - r.x0) < 1e-4) out.push([o.z0, o.z1]);
      if (edge === 'e' && Math.abs(o.x0 - r.x1) < 1e-4) out.push([o.z0, o.z1]);
    }
    return out;
  };
  const wallH = -0.02 - WALL_BOTTOM;
  const wallBox = (x0: number, z0: number, x1: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    b.add(worldBox(w, wallH, d, 7.6), wallMat, (x0 + x1) / 2, WALL_BOTTOM + wallH / 2, (z0 + z1) / 2);
    col.add(x0, WALL_BOTTOM, z0, x1, 0, z1, 'concrete');
  };
  for (const r of rooms) {
    for (const edge of ['n', 's', 'w', 'e'] as const) {
      const alongX = edge === 'n' || edge === 's';
      const a0 = alongX ? r.x0 : r.z0;
      const a1 = alongX ? r.x1 : r.z1;
      for (let [s0, s1] of uncovered(a0, a1, touching(r, edge))) {
        // Extend into the corner only where the segment ends at the room's own corner.
        if (Math.abs(s0 - a0) < 1e-4) s0 -= WALL_T;
        if (Math.abs(s1 - a1) < 1e-4) s1 += WALL_T;
        if (edge === 'n') wallBox(s0, r.z0 - WALL_T, s1, r.z0);
        if (edge === 's') wallBox(s0, r.z1, s1, r.z1 + WALL_T);
        if (edge === 'w') wallBox(r.x0 - WALL_T, s0, r.x0, s1);
        if (edge === 'e') wallBox(r.x1, s0, r.x1 + WALL_T, s1);
      }
    }
  }

  // ------------------------------------------------------------------ floors and ceilings
  const plane = (r: R, y: number, mat: THREE.Material, tile: number, down = false) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    b.add(g, mat, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  };
  const ceilings = subtractAll(rooms.filter((r) => !r.shaft), [holeB]);
  for (const r of rooms) {
    plane(r, r.floor + 0.002, r.floor === TRACK ? trackMat : floorMat, r.floor === TRACK ? 2 : 3);
    col.add(r.x0, r.floor - 0.4, r.z0, r.x1, r.floor, r.z1, 'concrete');
  }
  const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.9, side: THREE.DoubleSide });
  for (const r of ceilings) {
    plane(r, CEIL, r.z0 >= 33 ? tunnelMat : ceilMat, 2.4, true);
    col.add(r.x0, CEIL, r.z0, r.x1, 0, r.z1, 'concrete');
  }
  // Platform edge, tactile strip and the face down to the track bed.
  b.add(worldBox(80, 1.2, 0.3, 1), m.darkConcrete, 0, UG - 0.6, SCREEN_Z + 0.15);
  plane({ x0: -40, z0: 32.1, x1: 40, z1: 32.5 }, UG + 0.004, yellow, 0.4);
  // Rails and sleepers.
  for (const dz of [-0.72, 0.72]) b.add(worldBox(220, 0.16, 0.08, 1), railMat, 0, TRACK + 0.18, TRACK_Z + dz);
  for (let x = -108; x <= 108; x += 0.9) b.add(worldBox(0.24, 0.1, 2.4, 1), m.darkConcrete, x, TRACK + 0.05, TRACK_Z);
  // Tunnel mouths: dark portal frames.
  for (const s of [-1, 1]) {
    b.add(worldBox(0.6, 1.0, 4.5, 1), m.black, s * 41, CEIL - 0.5, TRACK_Z);
    for (const dz of [-2.1, 2.1]) b.add(worldBox(0.6, 6, 0.3, 1), m.black, s * 41, TRACK + 3, TRACK_Z + dz);
  }
  // Pillars down the platform and the concourse.
  const pillar = (x: number, z: number) => {
    b.add(worldBox(0.6, CEIL - UG, 0.6, 1), wallMat, x, (UG + CEIL) / 2, z);
    col.add(x - 0.3, UG, z - 0.3, x + 0.3, CEIL, z + 0.3, 'concrete');
  };
  for (const x of [-30, -18, 6, 18, 30]) pillar(x, 29.6);
  for (const x of [-8, 8]) pillar(x, 20);

  // ------------------------------------------------------------------ ticket gates (z ≈ 23)
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xa8acb2, roughness: 0.35, metalness: 0.3 });
  const greenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.8) });
  const redMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.3, 0.3) });
  for (let x = -6.4; x <= 6.41; x += 1.6) {
    b.add(worldBox(0.34, 1.0, 1.5, 1), gateMat, x, UG + 0.5, 23.3);
    b.add(worldBox(0.3, 0.03, 0.3, 1), x > 0 ? greenMat : redMat, x, UG + 1.02, 22.75);
    col.add(x - 0.17, UG, 22.55, x + 0.17, UG + 1.0, 24.05, 'metal');
  }
  // Glass fare fence either side of the gates.
  for (const [x0, x1] of [[-14, -6.6], [9.8, 14]] as const) {
    b.add(worldBox(x1 - x0, 1.1, 0.06, 1), glassMat, (x0 + x1) / 2, UG + 0.55, 23.3);
    b.add(worldBox(x1 - x0, 0.05, 0.08, 1), frameMat, (x0 + x1) / 2, UG + 1.1, 23.3);
    col.add(x0, UG, 23.24, x1, UG + 1.1, 23.36, 'glass');
  }
  // Ticket machines and a kiosk in the concourse.
  const tmMat = new THREE.MeshStandardMaterial({ color: 0x1c3a6a, roughness: 0.4, metalness: 0.4 });
  const tmScreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.2) });
  for (let i = 0; i < 4; i++) {
    const x = -12.6 + i * 1.1;
    kit.boxCover(x, UG, 17.45, 0.9, 1.7, 0.7, tmMat);
    b.add(worldBox(0.6, 0.4, 0.02, 1), tmScreen, x, UG + 1.2, 17.81);
  }
  // Kiosk 1 m clear of the fare fence (it was 0.64 m: wider-looking than a body, too narrow to pass).
  kit.boxCover(12.6, UG, 21.6, 2.4, 1.1, 1.2, kit.wood, 'wood');
  b.add(worldBox(2.6, 0.2, 1.4, 1), kit.red, 12.6, UG + 2.3, 21.6);
  for (const x of [-26.5, 12, 24]) kit.bench(x, 28.4, true, UG);
  kit.vending(-13.55, 25.5, 'e', 'white', UG);
  kit.vending(13.55, 25.5, 'w', 'red', UG);

  // ------------------------------------------------------------------ screen doors along z = 33
  const leaves: { mesh: THREE.Mesh; base: number; dir: number; col: Collider }[] = [];
  const leafGeo = new THREE.BoxGeometry(0.9, 1.3, 0.05);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xbfc8d0, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.75 });
  const gaps = DOOR_XS.map((x) => [x - 0.95, x + 0.95] as [number, number]);
  for (const [s0, s1] of uncovered(-40, 40, gaps)) {
    b.add(worldBox(s1 - s0, 1.35, 0.08, 1), frameMat, (s0 + s1) / 2, UG + 0.675, SCREEN_Z);
    col.add(s0, UG, SCREEN_Z - 0.06, s1, UG + 1.35, SCREEN_Z + 0.06, 'metal');
  }
  for (const x of DOOR_XS) {
    for (const s of [-1, 1]) {
      const mesh = new THREE.Mesh(leafGeo, leafMat);
      mesh.position.set(x + s * 0.45, UG + 0.65, SCREEN_Z);
      scene.add(mesh);
      const c = col.add(x + s * 0.9 - 0.45 * s - 0.45, UG, SCREEN_Z - 0.05, x + s * 0.9 - 0.45 * s + 0.45, UG + 1.3, SCREEN_Z + 0.05, 'glass');
      leaves.push({ mesh, base: x + s * 0.45, dir: s, col: c });
    }
    // Threshold to the train floor, and a door number panel.
    col.add(x - 0.9, UG - 0.4, SCREEN_Z, x + 0.9, UG, SCREEN_Z + 0.85, 'concrete');
    // Door guides from the screen-door line to the car body, exactly the car door's width (1.3 m):
    // the 0.68 m gap between the screen doors and the train is never reachable from the threshold.
    for (const s of [-1, 1]) {
      const gx = x + s * 0.7;
      b.add(worldBox(0.1, 2.25, 0.74, 1), frameMat, gx, UG + 1.125, SCREEN_Z + 0.43);
      col.add(gx - 0.05, UG, SCREEN_Z + 0.06, gx + 0.05, UG + 2.25, SCREEN_Z + 0.8, 'metal');
    }
    b.add(worldBox(1.5, 0.08, 0.74, 1), frameMat, x, UG + 2.29, SCREEN_Z + 0.43);
    b.add(worldBox(1.8, 0.02, 0.85, 1), m.darkConcrete, x, UG - 0.01, SCREEN_Z + 0.42);
    b.add(worldBox(0.5, 0.18, 0.02, 1), greenMat, x, UG + 1.55, SCREEN_Z - 0.05);
  }
  const setDoors = (k: number) => {
    for (const l of leaves) {
      l.mesh.position.x = l.base + l.dir * 0.86 * k;
      l.col.solid = k < 0.5;
      l.col.ray = k < 0.9;
    }
  };
  setDoors(0);

  // ------------------------------------------------------------------ entrance stairs
  // A: plaza → corridor A (descending south).
  arch.stair({ x0: 7.6, z0: 4.6, x1: 10.6, z1: 15.3, axis: 'z', rise: -1, rails: [], bottom: UG, top: 0, vault: false });
  // B: back alley (top at x=-7) → platform west (bottom at x=-17.7).
  arch.stair({ x0: holeB.x0, z0: holeB.z0, x1: holeB.x1, z1: holeB.z1, axis: 'x', rise: 1, rails: ['n', 's'], bottom: UG, top: 0, vault: false });
  // The opening in the platform ceiling needs its slab edges (ceiling at CEIL, street at 0): without
  // them the platform looked up into a void around the stair.
  const fascia = (x0: number, z0: number, x1: number, z1: number) => {
    b.add(worldBox(x1 - x0, -CEIL, z1 - z0, 7.6), wallMat, (x0 + x1) / 2, CEIL / 2, (z0 + z1) / 2);
    col.add(x0, CEIL, z0, x1, 0, z1, 'concrete');
  };
  fascia(holeB.x0, 27, holeB.x1, holeB.z0); // north strip up to the platform wall
  fascia(holeB.x0, holeB.z1, holeB.x1, holeB.z1 + 0.3); // south
  fascia(holeB.x0 - 0.3, 27, holeB.x0, holeB.z1 + 0.3); // west, over the stair foot
  // C: Service Passage staff door (top at z=-2) → service corridor (bottom at z=8.7).
  arch.stair({ x0: -36, z0: -2, x1: -33, z1: 8.7, axis: 'z', rise: -1, rails: [], bottom: UG, top: 0, vault: false });
  // Stairwell finish: yellow safety nosing on every tread and LED handrail strips on both walls, so the
  // stairs read as stairs (they were near-black wedges: no light reaches them). Static, merged,
  // no extra lights.
  const nosingMat = new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.5, emissive: 0x3a2c00 });
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.6, 1.8) });
  const _q = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4();
  const trimStair = (r: R, axis: 'x' | 'z', rise: 1 | -1, bot: number, top: number, walls: (-1 | 1)[]) => {
    const H = top - bot;
    const steps = Math.round(H / 0.25);
    const L = axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
    const W = axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0;
    const run = L / steps;
    const riseH = H / steps;
    // Along-axis coordinate of the bottom end and the direction of ascent.
    const a0 = rise > 0 ? (axis === 'x' ? r.x0 : r.z0) : axis === 'x' ? r.x1 : r.z1;
    const mid = axis === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const at = (a: number, y: number, c: number) => (axis === 'x' ? new THREE.Vector3(a, y, c) : new THREE.Vector3(c, y, a));
    for (let i = 0; i < steps; i++) {
      const a = a0 + rise * (i * run + 0.035);
      const y = bot + (i + 0.5) * riseH + 0.006;
      const p = at(a, y, mid);
      b.add(axis === 'x' ? worldBox(0.07, 0.012, W - 0.1, 1) : worldBox(W - 0.1, 0.012, 0.07, 1), nosingMat, p.x, p.y, p.z);
    }
    for (const side of walls) {
      const c = mid + side * (W / 2 - 0.04);
      const from = at(a0, bot + 0.95, c);
      const to = at(a0 + rise * L, top + 0.95, c);
      const d = to.clone().sub(from);
      const len = d.length();
      _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
      _m4.compose(from.clone().add(to).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
      b.addMatrix(worldBox(len, 0.035, 0.035, 1), ledMat, _m4);
    }
    // Soft glow at the foot and the head of the stair (bloom only, no light).
    for (const [a, y] of [[a0 + rise * 0.6, bot + 2.2], [a0 + rise * (L - 0.6), top + 1.6]] as const) {
      glows.add({ pos: at(a, y, mid), color: new THREE.Color(0.6, 0.95, 1), radius: 4, base: 0.6, haloSize: 1.6, haloStrength: 0.12, mode: 'steady' });
    }
  };
  trimStair(rooms[0], 'z', -1, UG, 0, [-1, 1]);
  trimStair(holeB, 'x', 1, UG, 0, [-1]);
  trimStair(rooms[8], 'z', -1, UG, 0, [-1, 1]);

  // Street-level guard rails round the stairwells (never vaultable: it's a long way down).
  arch.rail({ x0: 7.6, z0: 4.6, x1: 10.6, z1: 15 }, 'w', 4.6, 15, 0, false);
  arch.rail({ x0: 7.6, z0: 4.6, x1: 10.6, z1: 15 }, 'e', 4.6, 15, 0, false);
  arch.rail(holeB, 'n', holeB.x0, holeB.x1 - 0.6, 0, false);
  arch.rail(holeB, 'w', undefined, undefined, 0, false);

  // Entrance A canopy and the line sign.
  const canopyGlass = glassMat.clone();
  canopyGlass.opacity = 0.35;
  b.add(worldBox(3.6, 0.06, 10.6, 1), canopyGlass, 9.1, 2.9, 9.9);
  for (const z of [5, 9.9, 14.8]) for (const x of [7.5, 10.7]) b.add(worldBox(0.08, 2.9, 0.08, 1), frameMat, x, 1.45, z);
  const sign = metroSign('地下鉄 桜線', 'SAKURA LINE  S');
  const signMat = new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1.6, 1.6, 1.6) });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), signMat);
  signMesh.position.set(9.1, 3.4, 4.55);
  signMesh.rotation.y = Math.PI;
  scene.add(signMesh);
  const signBack = signMesh.clone();
  signBack.rotation.y = 0;
  signBack.position.z = 4.65;
  scene.add(signBack);
  const sg = glows.add({ pos: new THREE.Vector3(9.1, 3.2, 4), color: new THREE.Color(0.3, 1, 0.55), radius: 6, base: 1, haloSize: 3, haloStrength: 0.2, mode: 'steady', reflect: { width: 3, anchor: new THREE.Vector3(9.1, 0, 3.6), length: 4, map: null } });
  sg.materials.push({ mat: signMat, base: signMat.color.clone() });
  // B: small exit sign on the alley wall; C: staff-only door frame.
  const bSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: metroSign('桜線 2番出口', 'EXIT 2'), color: new THREE.Color(1.4, 1.4, 1.4) }));
  bSign.position.set(-9, 2.6, 28.97);
  bSign.rotation.y = Math.PI;
  scene.add(bSign);
  b.add(worldBox(3.4, 0.25, 0.3, 1), m.darkMetal, -34.5, 3.25, -2.05);
  for (const x of [-36.1, -32.9]) b.add(worldBox(0.2, 3.2, 0.3, 1), m.darkMetal, x, 1.6, -2.05);
  const staff = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.36), new THREE.MeshBasicMaterial({ map: metroSign('関係者以外立入禁止', 'STAFF ONLY'), color: new THREE.Color(1.2, 1.2, 1.2) }));
  staff.position.set(-34.5, 3.65, -2.22);
  staff.rotation.y = Math.PI;
  scene.add(staff);

  // ------------------------------------------------------------------ shutters (lockdown)
  const shTex = shutterTexture();
  const shutters: Shutter[] = [];
  const makeShutter = (name: string, x0: number, z0: number, x1: number, z1: number, h: number, ry: number) => {
    const w = Math.max(x1 - x0, z1 - z0);
    const mat = new THREE.MeshStandardMaterial({ map: shTex, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    mesh.rotation.y = ry;
    scene.add(mesh);
    const c = col.add(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, h, z1 + 0.06, 'metal');
    let k = 0;
    const sh: Shutter = {
      name,
      open: false,
      setOpen(open) {
        sh.open = open;
        c.solid = !open;
        c.ray = !open;
      },
      update(dt) {
        k += ((sh.open ? 1 : 0) - k) * Math.min(1, dt * 1.2);
        mesh.scale.y = Math.max(0.02, 1 - k);
        mesh.position.y = h - (h * mesh.scale.y) / 2;
        mesh.visible = k < 0.98;
      },
    };
    shutters.push(sh);
    return sh;
  };
  makeShutter('plaza', 7.6, 4.6, 10.6, 4.6, 2.8, 0);
  makeShutter('alley', -7, 27.2, -7, 29, 2.8, Math.PI / 2);
  makeShutter('staff', -36, -2, -33, -2, 3.2, 0);

  // ------------------------------------------------------------------ departure boards
  const boards: Board[] = [];
  const board = (x: number, y: number, z: number, ry: number, readAt: THREE.Vector3) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const c2 = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.4, 1.4, 1.4) }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    b.add(worldBox(3.4, 1.4, 0.12, 1), m.black, x - Math.sin(ry) * 0.07, y, z - Math.cos(ry) * 0.07, 0, ry, 0);
    boards.push({ canvas, ctx: c2, texture, mesh, readAt });
  };
  board(0, UG + 3.6, 23.0, Math.PI, new THREE.Vector3(0, UG, 21)); // over the gates, facing the concourse
  board(0, UG + 3.6, 27.3, 0, new THREE.Vector3(0, UG, 30)); // platform
  board(13.2, 1.9, 3.2, Math.PI, new THREE.Vector3(12.2, 0, 2)); // street, by the plaza entrance
  b.add(worldBox(0.1, 1.9, 0.1, 1), frameMat, 13.2, 0.95, 3.27);
  // It hangs at head height: it must stop the player (it didn't before 3.3). Two posts, so it reads
  // as a sign on legs you walk around, not a gap you can duck under.
  b.add(worldBox(0.1, 1.9, 0.1, 1), frameMat, 11.6, 0.95, 3.27);
  b.add(worldBox(0.1, 1.9, 0.1, 1), frameMat, 14.8, 0.95, 3.27);
  col.add(11.5, 0, 3.12, 14.9, 2.6, 3.34, 'metal');

  // ------------------------------------------------------------------ lighting
  const lights: THREE.PointLight[] = [];
  for (const [x, z, i] of [[0, 21, 16], [0, 30, 20]] as const) {
    const l = new THREE.PointLight(0xdce8ff, i, 30, 1.8);
    l.position.set(x, CEIL - 0.6, z);
    scene.add(l);
    lights.push(l);
  }
  for (const x of [-32, -16, 0, 16, 32]) glows.add({ pos: new THREE.Vector3(x, CEIL - 0.3, 30), color: new THREE.Color(0.85, 0.92, 1), radius: 7, base: 0.8, haloSize: 0.01, haloStrength: 0, mode: x === 16 ? 'flicker' : 'steady' });
  glows.add({ pos: new THREE.Vector3(-30, CEIL - 0.4, 22), color: new THREE.Color(1, 0.75, 0.4), radius: 6, base: 0.8, haloSize: 1.5, haloStrength: 0.15, mode: 'buzz' });
  // Maintenance room clutter.
  kit.crates(-27.5, 24.4, UG);
  kit.boxCover(-26, UG, 18.2, 2.2, 1.9, 0.6, m.paintedMetal);
  kit.boxCover(-25, UG, 24.6, 1.2, 1.1, 1.2, m.darkMetal);
  kit.pipes('e', -36, 17, 26.5, [UG + 3.4, UG + 2.9]);

  // ------------------------------------------------------------------ navigation
  const nodes: THREE.Vector3[] = [];
  const links: [number, number][] = [];
  const N = (x: number, y: number, z: number) => nodes.push(new THREE.Vector3(x, y, z)) - 1;
  // Concourse, gate lanes, paid area, platform, maintenance, corridors.
  for (const [x, z] of [[9.1, 18.2], [4, 19], [-4, 19], [-11, 20.5], [0.8, 21.4], [8.2, 21.4], [-4, 21.4], [0.8, 25.2], [8.2, 25.2], [-4, 25.2], [-11, 25.5], [11, 25.5]]) N(x, UG, z);
  for (let x = -36; x <= 36; x += 6) N(x, UG, 31.4);
  for (const [x, z] of [[-30.5, 28.3], [-30.5, 25], [-26, 21.5], [-34.5, 20], [-34.5, 13]]) N(x, UG, z);
  const chain = (bottom: [number, number, number], mid: [number, number, number], top: [number, number, number]) => {
    const a = N(...bottom);
    const c = N(...mid);
    const t = N(...top);
    links.push([a, c], [c, t]);
    return [a, c, t];
  };
  const entrances = [
    { name: 'plaza', chain: chain([9.1, UG, 16.2], [9.1, UG / 2, 10], [9.1, 0, 3.6]) },
    { name: 'alley', chain: chain([-19, UG, 28.1], [-12.3, UG / 2, 28.1], [-6.2, 0, 28.1]) },
    { name: 'staff', chain: chain([-34.5, UG, 9.6], [-34.5, UG / 2, 3.3], [-34.5, 0, -3.1]) },
  ];

  const pois: MetroResult['pois'] = [];
  for (const x of [-27, -21, -12, -3, 9, 15, 24, 33]) pois.push({ pos: new THREE.Vector3(x + 1.2, UG, 31.9), yaw: 0, kind: 'wait' });
  pois.push({ pos: new THREE.Vector3(-11.5, UG, 18.6), yaw: Math.PI, kind: 'shop' }, { pos: new THREE.Vector3(11, UG, 22), yaw: Math.PI / 2, kind: 'shop' });

  const shelters = rooms.filter((r) => !r.shaft).map((r) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y: -0.05 }));
  return { holes, shelters, shutters, boards, setDoors, nodes, links, entrances, pois, platform: rooms[3], lights, doorZ: SCREEN_Z, rooms: rooms.filter((r) => r.x1 - r.x0 < 100) };
}

/** Station-style sign: line colour bar, Japanese and English. */
function metroSign(jp: string, en: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d1a14';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#e4508a';
  g.fillRect(0, 0, 18, 128);
  g.fillStyle = '#ffffff';
  g.font = `bold 50px ${JP_FONT}`;
  g.textBaseline = 'middle';
  g.fillText(jp, 36, 46);
  g.fillStyle = '#7fe8b0';
  g.font = 'bold 28px sans-serif';
  g.fillText(en, 38, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
