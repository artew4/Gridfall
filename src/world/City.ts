import * as THREE from 'three';
import { StaticBuilder, worldBox } from './Builder';
import { subtractAll, type R } from './Rects';
import { CollisionWorld } from './Collision';
import { Glows } from './Glows';
import { applyWet } from './Ground';
import {
  asphaltTexture,
  concreteTexture,
  facadeTexture,
  pavingTexture,
  roadMarkTexture,
  skylineTexture,
  storefrontTexture,
} from './Textures';

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
  paving: THREE.MeshStandardMaterial;
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

/** Railway overpass: deck centre line and extent (the train runs along x). */
export const RAIL = { z: -23.5, deckTop: 7.8, deckBottom: 6.4 };

export type Face = 'n' | 's' | 'e' | 'w';

export interface FaceSpec {
  face: Face;
  /** Storefronts along the ground floor, laid from the segment start. */
  stores?: StoreKind[];
  /** Upper-floor shopfronts on walkway level. */
  upper?: StoreKind[];
  /** Segment along the facade that gets details (defaults to the whole side). */
  from?: number;
  to?: number;
}

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
  const pt = pavingTexture();
  const paving = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.5, envMapIntensity: 1.2 });
  applyWet(paving, time, { puddles: true, wet: 0.85 });
  return { facade, concrete, darkConcrete, darkMetal, paintedMetal, black, store, asphalt, sidewalk, paving };
}

export type StoreKind = keyof Mats['store'];

export class City {
  mats: Mats;
  ctx: BuildCtx;
  /** Gunner cover spots and nav anchors are derived from layout. */
  constructor(public scene: THREE.Scene, public col: CollisionWorld, public glows: Glows, public time: { value: number }, fog: THREE.FogExp2) {
    this.mats = makeMats(time);
    this.ctx = { scene, builder: new StaticBuilder(), col, glows, time, mats: this.mats, fog };
  }

  /**
   * A city block: one box with detailed facades on the listed sides (ledges, parapet, storefronts,
   * awnings), plus rooftop clutter. Bare sides stay plain (they face other blocks).
   */
  block(x0: number, x1: number, z0: number, z1: number, h: number, variant: number, faces: FaceSpec[], rnd: () => number, opts: { tank?: boolean; y0?: number; walk?: boolean } = {}) {
    const b = this.ctx.builder;
    const m = this.mats;
    const w = x1 - x0;
    const d = z1 - z0;
    const y0 = opts.y0 ?? 0;
    b.add(worldBox(w, h - y0, d, 16, rnd() * 4, 0), m.facade[variant], (x0 + x1) / 2, (h + y0) / 2, (z0 + z1) / 2);
    this.col.add(x0, y0, z0, x1, h, z1, 'concrete');
    for (const f of faces) this.facade(x0, x1, z0, z1, h, f, rnd);
    // Roof cap: tar and concrete, not the facade's windows (walkable roofs get their own wet deck).
    if (!opts.walk && h > 3) {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      b.add(g, m.darkConcrete, (x0 + x1) / 2, h + 0.01, (z0 + z1) / 2);
    }
    // Rooftop water tank for the silhouette (not on roofs people walk on).
    const tankRoll = rnd();
    if (opts.tank !== false && h < 24 && w > 5 && d > 5 && tankRoll < 0.6) {
      const tx = x0 + w * (0.3 + rnd() * 0.4);
      const tz = z0 + d * (0.3 + rnd() * 0.4);
      b.add(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10), m.paintedMetal, tx, h + 2.2, tz);
      b.add(worldBox(2.4, 1.2, 2.4, 1), m.darkMetal, tx, h + 0.6, tz);
    }
  }

  private facade(x0: number, x1: number, z0: number, z1: number, h: number, f: FaceSpec, rnd: () => number) {
    const b = this.ctx.builder;
    const m = this.mats;
    const alongX = f.face === 'n' || f.face === 's';
    const sign = f.face === 's' || f.face === 'e' ? 1 : -1;
    const wall = f.face === 'n' ? z0 : f.face === 's' ? z1 : f.face === 'w' ? x0 : x1;
    const a0 = f.from ?? (alongX ? x0 : z0);
    const a1 = f.to ?? (alongX ? x1 : z1);
    const len = a1 - a0;
    const mid = (a0 + a1) / 2;
    const at = (a: number, y: number, out: number): [number, number, number] => (alongX ? [a, y, wall + sign * out] : [wall + sign * out, y, a]);
    const strip = (along: number, hh: number, thick: number, tile = 2) => (alongX ? worldBox(along, hh, thick, tile) : worldBox(thick, hh, along, tile));
    // Floor ledges give depth and catch neon on their edges.
    for (let y = 7.4; y < h - 1; y += 3.2) b.add(strip(len, 0.14, 0.16), m.darkConcrete, ...at(mid, y, 0.08));
    b.add(strip(len, 0.9, 0.3), m.darkConcrete, ...at(mid, h + 0.45, 0.1));
    b.add(strip(len, 0.5, 0.3), m.darkConcrete, ...at(mid, 4.05, 0.15));
    // Shopfronts face outwards.
    const ry = alongX ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    const lay = (stores: StoreKind[] | undefined, y: number, hgt: number, plane: THREE.PlaneGeometry) => {
      if (!stores) return;
      const n = Math.min(stores.length, Math.floor(len / 4));
      for (let i = 0; i < n; i++) {
        const a = a0 + 2 + i * 4 + (len - n * 4) / 2;
        const kind = stores[i];
        b.add(plane, m.store[kind], ...at(a, y, 0.02), 0, ry, 0);
        b.add(strip(0.35, hgt, 0.3, 1), m.darkConcrete, ...at(a + 2, y, 0.12));
        if (i === 0) b.add(strip(0.35, hgt, 0.3, 1), m.darkConcrete, ...at(a - 2, y, 0.12));
        if (kind === 'shop' && y < 3 && rnd() < 0.8) {
          const aw = alongX ? worldBox(3.8, 0.08, 1.1, 1) : worldBox(1.1, 0.08, 3.8, 1);
          const tilt = 0.12;
          b.add(aw, m.paintedMetal, ...at(a, 3.55, 0.55), alongX ? -sign * tilt : 0, 0, alongX ? 0 : sign * tilt);
        }
      }
    };
    lay(f.stores, 1.9, 3.8, this.storePlane);
    lay(f.upper, 6.0, 2.9, this.upperPlane);
  }

  private storePlane = new THREE.PlaneGeometry(4, 3.8);
  private upperPlane = new THREE.PlaneGeometry(4, 2.9);

  /** Asphalt everywhere, granite paving on the plaza, raised sidewalks with kerbs along the streets. */
  ground(plaza: R, sidewalks: R[], holes: R[] = []) {
    const b = this.ctx.builder;
    const m = this.mats;
    const plane = (w: number, d: number, tile: number) => {
      const g = new THREE.PlaneGeometry(w, d);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
      g.rotateX(-Math.PI / 2);
      return g;
    };
    // Asphalt and plaza paving, both with the metro stairwells cut out.
    const lay = (r: R, mat: THREE.Material, tile: number, y: number) => {
      for (const p of subtractAll([r], holes)) {
        const mesh = new THREE.Mesh(plane(p.x1 - p.x0, p.z1 - p.z0, tile), mat);
        // Keep the texture continuous across the pieces.
        const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + (p.x0 - r.x0) / tile, uv.getY(i) + (r.z1 - p.z1) / tile);
        mesh.position.set((p.x0 + p.x1) / 2, y, (p.z0 + p.z1) / 2);
        this.scene.add(mesh);
      }
    };
    lay({ x0: -70, z0: -75, x1: 70, z1: 65 }, m.asphalt, 7, 0);
    lay(plaza, m.paving, 6, 0.006);
    for (const s of sidewalks) {
      const w = s.x1 - s.x0;
      const d = s.z1 - s.z0;
      b.add(worldBox(w, 0.12, d, 1.5), m.sidewalk, (s.x0 + s.x1) / 2, 0.06, (s.z0 + s.z1) / 2);
      this.col.add(s.x0, 0, s.z0, s.x1, 0.12, s.z1, 'concrete');
    }
  }

  /** Painted markings: lane lines, a crosswalk and the worn 止まれ. */
  markings(lines: { x: number; z0: number; z1: number }[], crosswalks: { x: number; z: number; across: 'x' | 'z'; n: number }[], stops: { x: number; z: number; ry: number }[]) {
    const b = this.ctx.builder;
    const markMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d0,
      roughness: 0.3,
      transparent: true,
      opacity: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      envMapIntensity: 0.6,
    });
    for (const l of lines) {
      const g = new THREE.PlaneGeometry(0.15, l.z1 - l.z0);
      g.rotateX(-Math.PI / 2);
      b.add(g, markMat, l.x, 0.012, (l.z0 + l.z1) / 2);
    }
    for (const c of crosswalks) {
      const stripe = new THREE.PlaneGeometry(0.5, 2.6);
      stripe.rotateX(-Math.PI / 2);
      for (let i = 0; i < c.n; i++) {
        const o = (i - (c.n - 1) / 2) * 0.9;
        if (c.across === 'x') b.add(stripe, markMat, c.x + o, 0.012, c.z);
        else b.add(stripe, markMat, c.x, 0.012, c.z + o, 0, Math.PI / 2, 0);
      }
    }
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
    for (const st of stops) {
      const mesh = new THREE.Mesh(stop, stopMat);
      mesh.position.set(st.x, 0.013, st.z);
      mesh.rotation.y = st.ry;
      this.scene.add(mesh);
    }
  }

  /** Railway overpass along x with pillars at the given x positions. */
  overpass(pillars: number[]) {
    const b = this.ctx.builder;
    const m = this.mats;
    const z = RAIL.z;
    b.add(worldBox(160, 1.4, 5, 3), m.concrete, 0, 7.1, z);
    b.add(worldBox(160, 0.9, 0.3, 2), m.darkConcrete, 0, 8.25, z - 2.4);
    b.add(worldBox(160, 0.9, 0.3, 2), m.darkConcrete, 0, 8.25, z + 2.4);
    for (let x = -78; x <= 78; x += 3) b.add(worldBox(0.4, 0.5, 4.6, 1), m.darkMetal, x, 6.15, z);
    for (const s of [-1, 1]) {
      b.add(worldBox(160, 0.12, 0.12, 1), m.darkMetal, 0, 7.86, z + s * 0.75);
      for (let x = -72; x <= 72; x += 12) b.add(worldBox(0.2, 3.5, 0.2, 1), m.darkMetal, x, 9.6, z + s * 2.2);
    }
    b.add(worldBox(160, 0.05, 0.05, 1), m.black, 0, 11.2, z);
    for (const x of pillars) {
      b.add(worldBox(1.2, 6.4, 1.8, 2), m.concrete, x, 3.2, z);
      this.col.addCentered(x, 3.2, z, 1.2, 6.4, 1.8, 'concrete');
    }
    this.col.add(-80, RAIL.deckBottom, z - 2.5, 80, 8.6, z + 2.5, 'concrete');
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
