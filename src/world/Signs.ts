import * as THREE from 'three';
import type { BuildCtx } from './City';
import type { FlickerMode, Glow } from './Glows';
import { blurredCopy, signTexture, type SignStyle } from './Textures';

export type Face = 'n' | 's' | 'e' | 'w';
const NORMALS: Record<Face, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export interface SignSpec {
  text: string;
  color: string;
  style: SignStyle;
  vertical: boolean;
  /** 'perp' projects from the wall, 'wall' is flat on the facade, 'front' is flat facing +z (legacy). */
  mount: 'perp' | 'wall' | 'front';
  x: number;
  y: number;
  z: number;
  /** Long dimension in metres. */
  size: number;
  /** Outward normal of the facade the sign hangs on (defaults to the old street layout). */
  face?: Face;
  /** Facade plane coordinate (x for e/w faces, z for n/s). */
  wall?: number;
  /** Floor height under the sign, for its wet reflection. */
  floorY?: number;
  mode?: FlickerMode;
  brightness?: number;
  light?: number;
  lightDist?: number;
  reflect?: boolean;
  bg?: string;
  textColor?: string;
  hum?: boolean;
  halo?: number;
}

export interface SignGlow extends Glow {
  hum?: boolean;
  /** Group holding the sign planes (for vibration and lightning glitches). */
  group?: THREE.Group;
}

export function addSign(ctx: BuildCtx, s: SignSpec): SignGlow {
  const map = signTexture({ text: s.text, vertical: s.vertical, color: s.color, style: s.style, bg: s.bg, textColor: s.textColor });
  const aspect = map.userData.aspect as number;
  const h = s.vertical ? s.size : s.size / aspect;
  const w = s.vertical ? s.size * aspect : s.size;
  const bright = s.brightness ?? (s.style === 'box' ? 1.35 : 3.2);
  const color = new THREE.Color(s.color);
  const mat = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(bright, bright, bright) });
  const plane = new THREE.PlaneGeometry(w, h);
  const face: Face = s.mount === 'front' ? 's' : (s.face ?? (s.x < 0 ? 'e' : 'w'));
  const [nx, nz] = NORMALS[face];
  const wall = s.wall ?? (face === 'e' ? -6 : face === 'w' ? 6 : s.z);
  // Local frame: +z = facade normal, +x = along the facade.
  const ang = Math.atan2(nx, nz);
  const group = new THREE.Group();
  group.position.set(s.x, s.y, s.z);
  group.rotation.y = ang;
  const frameMat = ctx.mats.darkMetal;
  const b = ctx.builder;
  const world = (lx: number, ly: number, lz: number) => {
    const c = Math.cos(ang), sn = Math.sin(ang);
    return [s.x + lx * c + lz * sn, s.y + ly, s.z - lx * sn + lz * c] as [number, number, number];
  };
  // Distance of the sign centre from the facade along the normal.
  const off = nx !== 0 ? (s.x - wall) * nx : (s.z - wall) * nz;
  if (s.mount === 'perp') {
    const front = new THREE.Mesh(plane, mat);
    front.rotation.y = Math.PI / 2;
    front.position.x = 0.09;
    const back = new THREE.Mesh(plane, mat);
    back.rotation.y = -Math.PI / 2;
    back.position.x = -0.09;
    group.add(front, back);
    b.add(new THREE.BoxGeometry(0.16, h + 0.12, w + 0.12), frameMat, ...world(0, 0, 0), 0, ang, 0);
    // Brackets back to the wall.
    const inner = off - w / 2;
    if (inner > 0.02) {
      for (const dy of [h * 0.35, -h * 0.35]) b.add(new THREE.BoxGeometry(0.06, 0.06, inner + 0.05), frameMat, ...world(0, dy, -w / 2 - inner / 2), 0, ang, 0);
    }
  } else {
    const m = new THREE.Mesh(plane, mat);
    group.add(m);
    b.add(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.16), frameMat, ...world(0, 0, -0.09), 0, ang, 0);
  }
  ctx.scene.add(group);

  let light: THREE.PointLight | undefined;
  const lp = new THREE.Vector3(...world(0, 0, s.mount === 'perp' ? 1.2 - off + w / 2 : s.mount === 'front' ? 1.5 : 1.0));
  if (s.mount === 'perp') lp.set(s.x + nx * 1.2, s.y, s.z + nz * 1.2);
  if (s.light) {
    light = new THREE.PointLight(color, s.light, s.lightDist ?? 16, 2);
    light.position.copy(lp);
    light.position.y = Math.min(lp.y, (s.floorY ?? 0) + 5);
    ctx.scene.add(light);
  }
  const anchor = new THREE.Vector3(s.x + nx * 0.6, s.floorY ?? 0, s.z + nz * 0.6);
  if (s.mount === 'front') anchor.set(s.x, s.floorY ?? 0, s.z + 1);
  const glow = ctx.glows.add({
    pos: lp,
    color,
    radius: 4 + s.size * 0.8,
    base: 1.2,
    mode: s.mode ?? 'steady',
    light,
    lightBase: s.light ?? 0,
    haloSize: s.halo ?? Math.max(w, h) * 1.4,
    haloStrength: s.style === 'box' ? 0.18 : 0.3,
    reflect: s.reflect === false ? undefined : { width: Math.max(w, 1.2) * 1.3, anchor, length: 5 + (s.y - (s.floorY ?? 0)) * 1.1, map: blurredCopy(map, s.style === 'box' ? 4 : 8) },
  }) as SignGlow;
  glow.materials.push({ mat, base: mat.color.clone() });
  glow.hum = s.hum;
  glow.group = group;
  return glow;
}
