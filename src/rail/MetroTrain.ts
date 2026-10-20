import * as THREE from 'three';
import type { CollisionWorld, Collider } from '../world/Collision';
import { CAR_CENTRES, TRACK_Z, UG } from '../world/Metro';
import { mulberry32 } from '../core/math';

const CAR_L = 19;
const CAR_W = 2.9;
const FLOOR = UG;
const CEIL = UG + 2.45;
const DOORS = [-6, 0, 6];
const DOOR_W = 1.3;
/** Platform side of the car body (north, towards the screen doors). */
const NZ = TRACK_Z - CAR_W / 2;
const SZ = TRACK_Z + CAR_W / 2;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Car side (19 m across the texture): windows with passengers, pink line stripe, doors at -6/0/6. */
function sideTextures(seed: number) {
  const rnd = mulberry32(seed);
  const W = 1024;
  const H = 128;
  const u = (x: number) => ((x + CAR_L / 2) / CAR_L) * W;
  const a = canvas(W, H);
  const e = canvas(W, H);
  a.g.fillStyle = '#9ca2aa';
  a.g.fillRect(0, 0, W, H);
  a.g.fillStyle = '#e4508a';
  a.g.fillRect(0, 88, W, 12);
  e.g.fillStyle = '#000';
  e.g.fillRect(0, 0, W, H);
  const doorPx = (DOOR_W / CAR_L) * W;
  for (let x = u(-CAR_L / 2) + 14; x < W - 40; x += 46) {
    const xm = (x / W) * CAR_L - CAR_L / 2;
    if (DOORS.some((d) => Math.abs(xm + 0.36 - d) < DOOR_W / 2 + 0.55)) continue;
    a.g.fillStyle = '#1c2026';
    a.g.fillRect(x, 20, 38, 44);
    const warm = rnd() < 0.3;
    e.g.fillStyle = warm ? '#ffe2b8' : '#e2ecff';
    e.g.fillRect(x, 20, 38, 44);
    const n = rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const px = x + 6 + rnd() * 26;
      const py = rnd() < 0.4 ? 32 : 44;
      e.g.fillStyle = 'rgba(10,10,16,0.9)';
      e.g.beginPath();
      e.g.arc(px, py, 5, 0, Math.PI * 2);
      e.g.fill();
      e.g.fillRect(px - 8, py + 5, 16, 30);
    }
  }
  for (const d of DOORS) {
    a.g.fillStyle = '#20242a';
    a.g.fillRect(u(d) - doorPx / 2, 6, doorPx, 118);
  }
  return { map: tex(a.c), emissive: tex(e.c) };
}

/** Inside of the car walls: panels, dark windows, hanging ad cards. */
function interiorTexture() {
  const W = 1024;
  const H = 128;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#d6d2c8';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#0c0e12';
  for (let x = 14; x < W - 40; x += 46) g.fillRect(x, 22, 38, 42);
  const ads = ['#e4508a', '#3a8ad8', '#e8c21a', '#4ab87a', '#c25bff'];
  for (let x = 30; x < W; x += 90) {
    g.fillStyle = ads[Math.floor(x / 90) % ads.length];
    g.fillRect(x, 4, 60, 14);
  }
  return tex(c);
}

export interface TrainColliders {
  all: Collider[];
  doors: Collider[];
}

/**
 * The Sakura Line train: four cars with real interiors you can walk into. Moves along the track
 * (x), stops with its doors behind the platform screen doors, and owns colliders that only exist
 * while it's standing in the station.
 */
export class MetroTrain {
  group = new THREE.Group();
  x = -300;
  /** Door opening 0..1. */
  doorK = 0;
  private leaves: { mesh: THREE.Mesh; base: number; dir: number }[] = [];
  private colliders: TrainColliders = { all: [], doors: [] };
  private colActive = false;
  private headMats: THREE.MeshBasicMaterial[] = [];
  private destMat: THREE.MeshBasicMaterial;
  private destCanvas = canvas(256, 48);
  private destTex: THREE.CanvasTexture;
  private interiorLights: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, private col: CollisionWorld) {
    const body = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.6, metalness: 0.5 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 });
    const inner = new THREE.MeshStandardMaterial({ map: interiorTexture(), roughness: 0.6, emissive: 0x24241f, emissiveIntensity: 1 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a4a9a, roughness: 0.8, emissive: 0x0a1430 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.2, metalness: 0.9 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.7 });
    this.interiorLights = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 1.0, 1.05) });
    const figMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.8 });
    const sides = [1, 2].map((k) => {
      const t = sideTextures(k * 11);
      return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, color: 0x9aa0a8, roughness: 0.35, metalness: 0.5 });
    });
    this.destTex = tex(this.destCanvas.c);
    this.destMat = new THREE.MeshBasicMaterial({ map: this.destTex, color: new THREE.Color(1.6, 1.6, 1.6) });

    // Side segments between doors, with UVs cut from the full-length texture.
    const seg = (x0: number, x1: number, z: number, mat: THREE.Material, face: 1 | -1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, CEIL - FLOOR);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const u0 = (x0 + CAR_L / 2) / CAR_L;
      const u1 = (x1 + CAR_L / 2) / CAR_L;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) === 0 ? (face > 0 ? u0 : u1) : face > 0 ? u1 : u0);
      const m = new THREE.Mesh(g, mat);
      m.position.set((x0 + x1) / 2, (FLOOR + CEIL) / 2, z);
      m.rotation.y = face > 0 ? 0 : Math.PI;
      return m;
    };
    const gaps = DOORS.map((d) => [d - DOOR_W / 2, d + DOOR_W / 2] as [number, number]);
    const solidRanges: [number, number][] = [];
    let cur = -CAR_L / 2;
    for (const [g0, g1] of gaps) {
      solidRanges.push([cur, g0]);
      cur = g1;
    }
    solidRanges.push([cur, CAR_L / 2]);

    CAR_CENTRES.forEach((cx, ci) => {
      const car = new THREE.Group();
      car.position.x = cx;
      this.group.add(car);
      const side = sides[ci % 2];
      // Shell: roof, underbody, floor, far side, ends.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR_L, 0.3, CAR_W), body);
      roof.position.set(0, CEIL + 0.15, TRACK_Z);
      const under = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 1, 0.9, CAR_W - 0.3), dark);
      under.position.set(0, FLOOR - 0.6, TRACK_Z);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(CAR_L, 0.15, CAR_W), floorMat);
      floor.position.set(0, FLOOR - 0.075, TRACK_Z);
      car.add(roof, under, floor);
      for (const [x0, x1] of solidRanges) {
        car.add(seg(x0, x1, NZ, side, -1)); // outside, facing the platform
        car.add(seg(x0, x1, NZ + 0.02, inner, 1)); // inside
      }
      car.add(seg(-CAR_L / 2, CAR_L / 2, SZ, side, 1), seg(-CAR_L / 2, CAR_L / 2, SZ - 0.02, inner, -1));
      for (const s of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W, CEIL - FLOOR), inner);
        end.position.set(s * (CAR_L / 2 - 0.02), (FLOOR + CEIL) / 2, TRACK_Z);
        end.rotation.y = -s * (Math.PI / 2);
        const endOut = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W, CEIL - FLOOR + 0.3), body);
        endOut.position.set(s * (CAR_L / 2), (FLOOR + CEIL) / 2 + 0.15, TRACK_Z);
        endOut.rotation.y = s * (Math.PI / 2);
        car.add(end, endOut);
      }
      // Ceiling and light strips.
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CAR_L, CAR_W), inner);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(0, CEIL - 0.01, TRACK_Z);
      car.add(ceil);
      for (const dz of [-0.6, 0.6]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 1, 0.03, 0.12), this.interiorLights);
        strip.position.set(0, CEIL - 0.03, TRACK_Z + dz);
        car.add(strip);
      }
      // Long bench seats (far side full length, platform side between doors), poles at the doors.
      const bench = (x0: number, x1: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.45, 0.5), seatMat);
        m.position.set((x0 + x1) / 2, FLOOR + 0.225, z);
        car.add(m);
      };
      bench(-CAR_L / 2 + 0.3, CAR_L / 2 - 0.3, SZ - 0.28);
      for (const [x0, x1] of solidRanges) if (x1 - x0 > 2) bench(x0 + 0.5, x1 - 0.5, NZ + 0.28);
      for (const d of DOORS) {
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, CEIL - FLOOR, 6), poleMat);
          p.position.set(d + s * 0.8, (FLOOR + CEIL) / 2, NZ + 0.55);
          car.add(p);
        }
        // Door leaves.
        for (const s of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, CEIL - FLOOR - 0.1, 0.05), doorMat);
          leaf.position.set(d + (s * DOOR_W) / 4, (FLOOR + CEIL) / 2 - 0.05, NZ);
          car.add(leaf);
          this.leaves.push({ mesh: leaf, base: d + (s * DOOR_W) / 4, dir: s });
        }
      }
      // A few seated passengers on the far bench (they're not getting off).
      const rnd = mulberry32(ci * 7 + 3);
      for (let k = 0; k < 3; k++) {
        const x = -7 + rnd() * 14;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.3), figMat);
        torso.position.set(x, FLOOR + 0.78, SZ - 0.32);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), figMat);
        head.position.set(x, FLOOR + 1.22, SZ - 0.3);
        car.add(torso, head);
      }
      // Destination display on the front and back cars.
      if (ci === 0 || ci === CAR_CENTRES.length - 1) {
        const s = ci === 0 ? -1 : 1;
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), this.destMat);
        disp.position.set(s * (CAR_L / 2 + 0.02), CEIL - 0.3, TRACK_Z);
        disp.rotation.y = s * (Math.PI / 2);
        car.add(disp);
        for (const dz of [-0.9, 0.9]) {
          const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 4.4) });
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), lm);
          lamp.position.set(s * (CAR_L / 2 + 0.03), FLOOR + 0.6, TRACK_Z + dz);
          lamp.rotation.y = s * (Math.PI / 2);
          car.add(lamp);
          this.headMats.push(lm);
        }
      }
    });
    this.group.position.x = this.x;
    this.group.visible = false;
    scene.add(this.group);
    this.buildColliders(solidRanges);
  }

  /** Colliders at the stopped position; switched on only while the train stands at the platform. */
  private buildColliders(solid: [number, number][]) {
    const c = this.colliders;
    const add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const k = this.col.add(x0, y0, z0, x1, y1, z1, 'metal');
      k.solid = false;
      k.ray = false;
      c.all.push(k);
      return k;
    };
    for (const cx of CAR_CENTRES) {
      add(cx - CAR_L / 2, FLOOR - 0.3, NZ, cx + CAR_L / 2, FLOOR, SZ); // floor
      add(cx - CAR_L / 2, CEIL, NZ, cx + CAR_L / 2, CEIL + 0.3, SZ); // roof
      add(cx - CAR_L / 2, FLOOR, SZ - 0.06, cx + CAR_L / 2, CEIL, SZ + 0.06); // far wall
      add(cx - CAR_L / 2 - 0.08, FLOOR, NZ, cx - CAR_L / 2, CEIL, SZ); // ends
      add(cx + CAR_L / 2, FLOOR, NZ, cx + CAR_L / 2 + 0.08, CEIL, SZ);
      add(cx - CAR_L / 2 + 0.3, FLOOR, SZ - 0.53, cx + CAR_L / 2 - 0.3, FLOOR + 0.45, SZ - 0.03); // far bench
      for (const [x0, x1] of solid) add(cx + x0, FLOOR, NZ - 0.06, cx + x1, CEIL, NZ + 0.06);
      for (const d of DOORS) c.doors.push(add(cx + d - DOOR_W / 2, FLOOR, NZ - 0.05, cx + d + DOOR_W / 2, CEIL, NZ + 0.05));
    }
  }

  setDestination(text: string, sub: string, color: string) {
    const { g } = this.destCanvas;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = color;
    g.font = 'bold 22px sans-serif';
    g.textBaseline = 'middle';
    g.fillText(text, 10, 16);
    g.fillStyle = '#cfd6e0';
    g.font = '14px sans-serif';
    g.fillText(sub, 10, 37);
    this.destTex.needsUpdate = true;
  }

  /** Places the train (x of the centre of the middle) and opens/closes its doors. */
  set(x: number, doorK: number, visible: boolean, dir: 1 | -1) {
    this.x = x;
    this.group.position.x = x;
    this.group.visible = visible;
    this.doorK = doorK;
    for (const l of this.leaves) l.mesh.position.x = l.base + l.dir * (DOOR_W / 2) * doorK * 0.95;
    // Head lamps white at the leading end, red at the back.
    this.headMats.forEach((m, i) => {
      const front = i < 2 ? dir < 0 : dir > 0;
      m.color.setRGB(front ? 5 : 3, front ? 5 : 0.15, front ? 4.4 : 0.1);
    });
    const stopped = visible && Math.abs(x) < 0.01;
    if (stopped !== this.colActive) {
      this.colActive = stopped;
      for (const k of this.colliders.all) {
        k.solid = stopped;
        k.ray = stopped;
      }
    }
    if (stopped) for (const k of this.colliders.doors) k.solid = k.ray = doorK < 0.6;
  }

  /** Is a point inside one of the cars (the stopped position)? */
  inside(p: THREE.Vector3) {
    if (p.y < FLOOR - 0.5 || p.y > CEIL) return false;
    if (p.z < NZ + 0.05 || p.z > SZ - 0.05) return false;
    return CAR_CENTRES.some((cx) => Math.abs(p.x - (cx + this.x)) < CAR_L / 2 - 0.1);
  }

  /** World position for a seat-height camera inside a given car (for the ending). */
  cabinPoint(car: number, out: THREE.Vector3) {
    return out.set(CAR_CENTRES[car] + this.x - 2, FLOOR + 1.6, TRACK_Z + 0.2);
  }
}
