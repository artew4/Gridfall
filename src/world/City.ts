import * as THREE from 'three';
import { StaticBuilder, worldBox } from './Builder';
import { CollisionWorld } from './Collision';
import { Glows } from './Glows';
import { applyWet } from './Ground';
import {
  asphaltTexture,
  concreteTexture,
  facadeTexture,
  roadMarkTexture,
  skylineTexture,
  storefrontTexture,
} from './Textures';
import { mulberry32 } from '../core/math';

export interface Mats {
  facade: THREE.MeshStandardMaterial[];
  concrete: THREE.MeshStandardMaterial;
  darkConcrete: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  paintedMetal: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  store: Record<'shutter' | 'shop' | 'izakaya' | 'door', THREE.MeshStandardMaterial>;
  asphalt: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
}

export interface BuildCtx {
  scene: THREE.Scene;
  builder: StaticBuilder;
  col: CollisionWorld;
  glows: Glows;
  time: { value: number };
  mats: Mats;
  fog: THREE.FogExp2;
}

/** Street layout constants (metres). Street runs along z, player faces -z (north). */
export const STREET = {
  half: 6, // building faces at x = ±6
  south: 33, // construction fence
  north: -54, // far wall under the railway
  overpassZ: -35,
  leftAlley: { z0: -4, z1: -1, end: -26 },
  rightAlley: { z0: -18, z1: -14, end: 26 },
};

function makeMats(time: { value: number }): Mats {
  const facade = [0, 1, 2].map((v) => {
    const t = facadeTexture(v);
    return new THREE.MeshStandardMaterial({
      map: t.map,
      emissiveMap: t.emissive,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 1.6,
      roughness: 0.82,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
  });
  const ct = concreteTexture();
  const concrete = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.8, envMapIntensity: 0.35 });
  const darkConcrete = new THREE.MeshStandardMaterial({ map: ct, color: 0x55555e, roughness: 0.7, envMapIntensity: 0.4 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.38, metalness: 0.75, envMapIntensity: 0.9 });
  const paintedMetal = new THREE.MeshStandardMaterial({ color: 0x6b6e76, roughness: 0.45, metalness: 0.35, envMapIntensity: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.6, metalness: 0.2 });
  const store = {} as Mats['store'];
  (['shutter', 'shop', 'izakaya', 'door'] as const).forEach((k) => {
    const t = storefrontTexture(k);
    store[k] = new THREE.MeshStandardMaterial({
      map: t.map,
      color: k === 'shop' ? 0x6a6a72 : 0xffffff,
      emissiveMap: t.emissive,
      emissive: t.emissive ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity: k === 'shop' ? 0.45 : k === 'izakaya' ? 0.9 : 1.2,
      roughness: k === 'shutter' ? 0.5 : 0.35,
      metalness: k === 'shutter' ? 0.5 : 0.1,
      envMapIntensity: 0.8,
    });
  });
  const at = asphaltTexture();
  const asphalt = new THREE.MeshStandardMaterial({ map: at, roughness: 0.62, metalness: 0.0, envMapIntensity: 1.25 });
  applyWet(asphalt, time, { puddles: true, wet: 0.9 });
  const sidewalk = new THREE.MeshStandardMaterial({ map: ct, color: 0x8a8890, roughness: 0.55, envMapIntensity: 1.0 });
  applyWet(sidewalk, time, { puddles: false, wet: 0.8 });
  return { facade, concrete, darkConcrete, darkMetal, paintedMetal, black, store, asphalt, sidewalk };
}

type StoreKind = keyof Mats['store'];

export class City {
  mats: Mats;
  ctx: BuildCtx;
  /** Gunner cover spots and nav anchors are derived from layout. */
  constructor(public scene: THREE.Scene, public col: CollisionWorld, public glows: Glows, public time: { value: number }, fog: THREE.FogExp2) {
    this.mats = makeMats(time);
    this.ctx = { scene, builder: new StaticBuilder(), col, glows, time, mats: this.mats, fog };
  }

  build() {
    const rnd = mulberry32(42);
    const L = -STREET.half;
    const R = STREET.half;
    const D = 26; // building depth

    // ---- Buildings lining the street: [x side, z0, z1, height, variant, storefronts...]
    const left: [number, number, number, number, StoreKind[]][] = [
      [12, 36, 13, 0, ['izakaya', 'izakaya', 'shutter', 'door', 'shop', 'shutter']],
      [-1, 12, 24, 1, ['door', 'shutter', 'shop']],
      [-20, -4, 18, 2, ['shutter', 'shop', 'door', 'shutter']],
      [-33, -20, 28, 0, ['door', 'shutter', 'shutter']],
      [-56, -37, 20, 1, ['shutter', 'door', 'shutter', 'shutter']],
    ];
    const right: [number, number, number, number, StoreKind[]][] = [
      [14, 36, 11, 2, ['shop', 'door', 'shutter', 'shutter', 'shop']],
      [-14, 14, 21, 0, ['shutter', 'shop', 'door', 'shutter', 'door', 'shop', 'shutter']],
      [-33, -18, 16, 1, ['door', 'shutter', 'shop']],
      [-56, -37, 24, 2, ['shutter', 'shutter', 'door', 'shutter']],
    ];
    for (const [z0, z1, h, v, stores] of left) this.building(L - D, L, z0, z1, h, v, -1, stores, rnd);
    for (const [z0, z1, h, v, stores] of right) this.building(R, R + D, z0, z1, h, v, 1, stores, rnd);

    // End blocks closing the street (south and north) and alley end walls.
    this.building(-34, 34, 36, 54, 16, 1, 0, [], rnd);
    this.building(-34, 34, -74, -54, 36, 0, 0, [], rnd);
    this.building(-34, STREET.leftAlley.end, STREET.leftAlley.z0, STREET.leftAlley.z1, 14, 2, 0, [], rnd);
    this.building(STREET.rightAlley.end, 34, STREET.rightAlley.z0, STREET.rightAlley.z1, 12, 1, 0, [], rnd);
    // Gap fillers between south block and street ends.
    this.col.add(-6, 0, 33.6, 6, 3, 36, 'metal'); // construction fence line (visual added in props)

    this.ground();
    this.overpass();
    this.ctx.builder.build(this.scene);
  }

  /** side: -1 = left block (street face at maxX), 1 = right block (street face at minX), 0 = no storefronts. */
  private building(x0: number, x1: number, z0: number, z1: number, h: number, variant: number, side: number, stores: StoreKind[], rnd: () => number) {
    const b = this.ctx.builder;
    const m = this.mats;
    const w = x1 - x0;
    const d = z1 - z0;
    const geo = worldBox(w, h, d, 16, rnd() * 4, 0);
    b.add(geo, m.facade[variant], (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    this.col.add(x0, 0, z0, x1, h, z1, 'concrete');
    if (side === 0) return;

    const faceX = side < 0 ? x1 : x0;
    const out = -side; // direction pointing into the street
    // Floor ledges give the facade depth and catch neon on their edges.
    for (let y = 4.2; y < h - 1; y += 3.2) {
      b.add(worldBox(0.16, 0.14, d, 2), m.darkConcrete, faceX + out * 0.08, y, (z0 + z1) / 2);
    }
    // Parapet.
    b.add(worldBox(0.3, 0.9, d, 2), m.darkConcrete, faceX + out * 0.1, h + 0.45, (z0 + z1) / 2);
    // Ground-floor band above the storefronts.
    b.add(worldBox(0.3, 0.5, d, 2), m.darkConcrete, faceX + out * 0.15, 4.05, (z0 + z1) / 2);

    // Storefronts, 4m each, laid from the south end of the block.
    const n = Math.min(stores.length, Math.floor(d / 4));
    const plane = new THREE.PlaneGeometry(4, 3.8);
    for (let i = 0; i < n; i++) {
      const zc = z1 - 2 - i * 4;
      if (zc - 2 < z0) break;
      const kind = stores[i];
      b.add(plane, m.store[kind], faceX + out * 0.02, 1.9, zc, 0, out > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      // Pillars between shops.
      b.add(worldBox(0.3, 3.8, 0.35, 1), m.darkConcrete, faceX + out * 0.12, 1.9, zc + 2);
      // Awnings over lit shops.
      if (kind === 'shop' && rnd() < 0.8) {
        b.add(worldBox(1.1, 0.08, 3.8, 1), m.paintedMetal, faceX + out * 0.55, 3.55, zc, 0, 0, out * 0.12);
      }
    }
    // Rooftop water tanks for silhouette.
    if (h < 22 && rnd() < 0.7) {
      const tank = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10);
      b.add(tank, m.paintedMetal, faceX - out * 4, h + 2.2, z0 + d * (0.3 + rnd() * 0.4));
      b.add(worldBox(2.4, 1.2, 2.4, 1), m.darkMetal, faceX - out * 4, h + 0.6, z0 + d * 0.5);
    }
  }

  private ground() {
    const b = this.ctx.builder;
    const m = this.mats;
    // Asphalt.
    const g = new THREE.PlaneGeometry(80, 140);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (80 / 7), uv.getY(i) * (140 / 7));
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, m.asphalt);
    ground.position.set(0, 0, -10);
    this.scene.add(ground);

    // Sidewalks with curbs (solid low boxes the player steps onto).
    const len = STREET.south + 1 - STREET.north;
    const zc = (STREET.south + 1 + STREET.north) / 2;
    for (const s of [-1, 1]) {
      const x = s * (STREET.half - 0.8);
      b.add(worldBox(1.6, 0.12, len, 1.5), m.sidewalk, x, 0.06, zc);
      b.add(worldBox(0.14, 0.13, len, 1), m.darkConcrete, s * (STREET.half - 1.6), 0.065, zc);
    }

    // Road markings: edge lines, crosswalk and a worn 止まれ.
    const markMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d0,
      roughness: 0.3,
      transparent: true,
      opacity: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      envMapIntensity: 0.6,
    });
    const line = new THREE.PlaneGeometry(0.15, len - 2);
    line.rotateX(-Math.PI / 2);
    for (const s of [-1, 1]) b.add(line, markMat, s * 4.05, 0.012, zc);
    const stripe = new THREE.PlaneGeometry(0.5, 2.6);
    stripe.rotateX(-Math.PI / 2);
    stripe.rotateY(Math.PI / 2);
    for (let i = 0; i < 6; i++) b.add(stripe, markMat, 0, 0.012, -10.3 + i * -0.9 + 0.0);
    const stopMat = new THREE.MeshStandardMaterial({
      map: roadMarkTexture(),
      transparent: true,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      envMapIntensity: 0.6,
    });
    const stop = new THREE.PlaneGeometry(3.4, 1.9);
    stop.rotateX(-Math.PI / 2);
    const stopMesh = new THREE.Mesh(stop, stopMat);
    stopMesh.position.set(-1.9, 0.013, -8.0);
    this.scene.add(stopMesh);
    const stop2 = stopMesh.clone();
    stop2.position.set(1.9, 0.013, 22);
    stop2.rotation.y = Math.PI;
    this.scene.add(stop2);
  }

  private overpass() {
    const b = this.ctx.builder;
    const m = this.mats;
    const z = STREET.overpassZ;
    // Deck, side girders and rails.
    b.add(worldBox(80, 1.4, 5, 3), m.concrete, 0, 7.1, z);
    b.add(worldBox(80, 0.9, 0.3, 2), m.darkConcrete, 0, 8.25, z - 2.4);
    b.add(worldBox(80, 0.9, 0.3, 2), m.darkConcrete, 0, 8.25, z + 2.4);
    for (let x = -38; x <= 38; x += 3) {
      b.add(worldBox(0.4, 0.5, 4.6, 1), m.darkMetal, x, 6.15, z);
    }
    for (const s of [-1, 1]) {
      b.add(worldBox(80, 0.12, 0.12, 1), m.darkMetal, 0, 7.86, z + s * 0.75);
      // Catenary masts.
      for (let x = -36; x <= 36; x += 12) {
        b.add(worldBox(0.2, 3.5, 0.2, 1), m.darkMetal, x, 9.6, z + s * 2.2);
      }
    }
    b.add(worldBox(80, 0.05, 0.05, 1), m.black, 0, 11.2, z);
    // Pillars.
    for (const s of [-1, 1]) {
      b.add(worldBox(1.2, 6.4, 1.8, 2), m.concrete, s * 5.3, 3.2, z);
      this.col.addCentered(s * 5.3, 3.2, z, 1.2, 6.4, 1.8, 'concrete');
    }
    this.col.add(-40, 6.4, z - 2.5, 40, 8.6, z + 2.5, 'concrete');
  }

  /** Distant skyline cards and a sky dome, both untouched by fog. */
  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTime: this.time },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vDir;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main() {
            float y = max(vDir.y, 0.0);
            vec3 horizon = vec3(0.075, 0.045, 0.11);
            vec3 zenith = vec3(0.006, 0.007, 0.018);
            vec3 col = mix(horizon, zenith, pow(y, 0.45));
            // Low clouds lit from below by the city.
            vec2 uv = vDir.xz / (vDir.y + 0.15) * 2.0 + vec2(uTime * 0.01, 0.0);
            float c = n(uv) * 0.6 + n(uv * 2.3) * 0.3 + n(uv * 5.1) * 0.1;
            col += vec3(0.12, 0.05, 0.12) * smoothstep(0.45, 0.85, c) * (1.0 - y) * 0.6;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    sky.renderOrder = -10;
    this.scene.add(sky);

    const cards: [number, number, number, number, number][] = [
      // x, z, rotY, width, seed
      [0, -150, 0, 360, 11],
      [0, 150, Math.PI, 360, 12],
      [-150, 0, Math.PI / 2, 360, 13],
      [150, 0, -Math.PI / 2, 360, 14],
    ];
    for (const [x, z, ry, w, seed] of cards) {
      const t = skylineTexture(seed, 2);
      t.map.repeat.set(2, 1);
      const mat = new THREE.MeshBasicMaterial({ map: t.map, transparent: true, fog: false, depthWrite: false, color: new THREE.Color(0.8, 0.75, 0.9) });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 90), mat);
      mesh.position.set(x, 30, z);
      mesh.rotation.y = ry;
      mesh.renderOrder = -9;
      this.scene.add(mesh);
    }
  }
}
