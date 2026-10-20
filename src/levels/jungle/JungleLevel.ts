import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { BASE, buildTerrainMesh, JUNGLE_EXTENT, JUNGLE_TERRAIN, roadX } from './Terrain';
import { buildBase, type BaseResult } from './Base';
import { buildFoliage, type FoliageResult } from './Foliage';
import { JungleIntro } from './JungleIntro';
import { dappleTexture, litterTexture } from './textures';
import { damp } from '../../core/math';
import { BOAR_SHOTGUN } from '../../entities/weapons/shotgun';
import { JUNGLE_GUARDS } from '../../entities/enemies/paramilitary';

export const JUNGLE_INFO: LevelInfo = {
  id: 'jungle',
  name: 'DEEP JUNGLE',
  jp: '密林基地',
  blurb: 'A walled firebase under the rainforest canopy. Fight up the road through the jungle, breach the gate, clear the compound. Survival.',
  modes: ['arcade'],
  loading: 'GROWING THE JUNGLE…',
  windowTitle: 'NEON RAIN — Deep Jungle',
  arsenal: { weapon: BOAR_SHOTGUN, enemies: JUNGLE_GUARDS },
  tagline: 'BREACH THE GATE · CLEAR THE COMPOUND',
  jpLine: '密林 · 午前七時四十分',
  place: 'FIREBASE VIPER',
  clock: '07:40',
  cine: {
    arcade: { t1: 'NEON RAIN', t2: '密林基地 · DEEP JUNGLE', t3: 'ARCADE SURVIVAL · FIREBASE VIPER<br/>PUSH UP THE ROAD · BREACH THE GATE · CLEAR THE COMPOUND' },
  },
};

/** Fog: humid teal-green air. Exp² density → the distance where it is 90% opaque. */
const FOG_DENSITY = 0.026;
const FOG_90 = Math.sqrt(Math.log(10)) / FOG_DENSITY;

/**
 * Deep Jungle: Firebase Viper, a walled paramilitary compound in the rainforest (barracks, comms
 * center, watchtower, motor pool, supply depot), giant buttressed trees, undergrowth and hanging
 * vines, low mist on the forest floor and morning sun breaking through the canopy in flecks. The map
 * is laid out for an assault (road in from the south, gate, compound); for now it runs Arcade
 * Survival, with the pump shotgun against the garrison: attackers out of the jungle, defenders out of
 * the barracks.
 */
export class JungleLevel implements LevelRuntime {
  readonly info = JUNGLE_INFO;
  data: LevelData;
  readonly look: LevelLook = { exposure: 1.0, bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 }, shadows: true, shadowTint: [0.004, 0.009, 0.007] };
  flash = 0;
  private base: BaseResult;
  foliage: FoliageResult;
  private sun: THREE.SpotLight;
  private hemi: THREE.HemisphereLight;
  private env: THREE.WebGLRenderTarget;
  private cookie: { data: Uint8ClampedArray; w: number; h: number };
  /** How much direct sun is on the camera (0 in shade, 1 in a sun fleck), smoothed. */
  sunOnCam = 0;
  private _v = new THREE.Vector4();

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color('#5b766a');
    game.col.terrain = JUNGLE_TERRAIN;
    game.fog.color.set('#5b766a');
    game.fog.density = FOG_DENSITY;

    // Soft green light from the canopy, brown bounce off the forest floor.
    this.hemi = new THREE.HemisphereLight(0x9cbaa2, 0x3c3222, 1.1);
    s.add(this.hemi);
    // The sun, through the canopy: a far, narrow spotlight that projects a dapple pattern (a light
    // cookie) and casts static shadows (trunks, temple, logs). Nothing that casts them moves.
    const cookie = dappleTexture();
    const img = cookie.image as HTMLCanvasElement;
    this.cookie = { data: img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    this.sun = new THREE.SpotLight(0xffefcf, 6.5, 0, 0.6, 0.02, 0);
    this.sun.position.set(28, 150, 46);
    this.sun.target.position.set(0, 0, 0);
    this.sun.map = cookie;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 90;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    s.add(this.sun, this.sun.target);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    this.sun.shadow.updateMatrices(this.sun);

    s.add(buildTerrainMesh(litterTexture()));
    this.base = buildBase(s, game.col, game.glows);
    const quality = { power: 0.6, balanced: 1, high: 1.25 }[game.settings.quality];
    this.foliage = buildFoliage(s, game.col, this.base.trees, this.base.keepClear, this.base.spawns, game.fog.color, quality, this.base.interiors);

    // Image-based light from the green canopy and the misty sky.
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const sky = new THREE.Scene();
    sky.background = new THREE.Color('#6f8f7c');
    this.env = pmrem.fromScene(sky, 0.04);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.25;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const r = this.base;
    this.data = {
      start: { ...r.start, y: 0 },
      bounds: new THREE.Box2(new THREE.Vector2(-JUNGLE_EXTENT, -JUNGLE_EXTENT), new THREE.Vector2(JUNGLE_EXTENT, JUNGLE_EXTENT)),
      floorMin: -1,
      nav: r.nav,
      spawns: [...r.spawns, ...r.barracksSpawns],
      perches: r.perches,
      coverPoints: r.coverPoints,
      cabinets: r.cabinets,
      medkits: r.medkits,
      breakables: r.breakables,
      zoneAt: r.zoneAt,
      testGoals: r.testGoals,
    };
  }

  attach() {
    const game = this.game;
    // Attackers come out of the green: never closer than ~30 m (deep in the undergrowth), and they
    // can't see through the mist any better than you can. Defenders turn out of the barracks
    // (behind walls, so nearer is fine): some of each wave while you're 14 m or more from it.
    const barracks = new Set(this.base.barracksSpawns);
    game.waves.minSpawnDistance = (s) => (barracks.has(s) ? 14 : 30);
    const centre = new THREE.Vector3((BASE.x0 + BASE.x1) / 2, 0, (BASE.z0 + BASE.z1) / 2);
    const _a = new THREE.Vector3(), _b = new THREE.Vector3();
    const any = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    game.waves.pickSpawn = (pool, player) => {
      const inside = pool.filter((s) => barracks.has(s));
      const jungle = pool.filter((s) => !barracks.has(s));
      if (inside.length && (!jungle.length || Math.random() < 0.35)) return any(inside);
      // Out in the jungle, mostly behind the player (on the far side from the compound): they push
      // you toward the gate rather than wait in front of it.
      _a.subVectors(centre, player).setY(0);
      const behind = jungle.filter((s) => _b.subVectors(s, player).setY(0).dot(_a) < 0);
      return any(behind.length && Math.random() < 0.7 ? behind : jungle);
    };
    game.ctx.sightRange = FOG_90 * 0.85;
    game.weapon.setLights({ sky: 0xb4ccb4, ground: 0x4a3c28, hemi: 1.0, key: 0xffecc8, keyI: 1.6, rim: 0xa8d8c0, rimI: 0.45 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('jungle');
  }

  /** Brightness of the sun's dapple projection at a world point (0..1), read from the cookie. */
  dappleAt(p: THREE.Vector3) {
    const v = this._v.set(p.x, p.y, p.z, 1).applyMatrix4(this.sun.shadow.matrix);
    if (v.w <= 0) return 0;
    const u = v.x / v.w, t = v.y / v.w;
    if (u < 0 || u > 1 || t < 0 || t > 1) return 0;
    const c = this.cookie;
    const i = (Math.floor((1 - t) * (c.h - 1)) * c.w + Math.floor(u * (c.w - 1))) * 4;
    return c.data[i] / 255;
  }

  update(f: FrameInfo) {
    const game = this.game;
    game.glows.update(f.elapsed, f.camPos);
    this.foliage.update(f.elapsed, game.camera);
    this.base.update(f.elapsed);
    // Indoors and under the roofs and nets the sun never reaches.
    const p = f.camPos;
    const roofed = this.base.shade.some((r) => p.x > r.x0 - 0.3 && p.x < r.x1 + 0.3 && p.z > r.z0 - 0.3 && p.z < r.z1 + 0.3 && p.y > r.y0 && p.y < r.h + 0.1);
    this.sunOnCam = damp(this.sunOnCam, roofed ? 0 : this.dappleAt(p), 8, f.rawDt);
  }

  lightWeapon(weapon: Weapon) {
    // The gun walks through the sun flecks: the key light follows the dapple under the camera.
    weapon.setKey(0.55 + 2.4 * this.sunOnCam);
    weapon.fillLight.color.setRGB(0.6, 0.85, 0.65);
    weapon.fillLight.intensity = 0.25;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    // A slow orbit outside the walls, looking over them into the compound.
    const a = t * 0.025 + 1.3;
    cam.position.set(Math.cos(a) * 44, 12 + Math.sin(t * 0.1) * 1.5, -14 + Math.sin(a) * 40);
    cam.lookAt(0, 2, -14);
  }

  createIntro(): IntroLike {
    const st = this.data.start;
    return new JungleIntro(new THREE.Vector3(st.x, 1.65, st.z), new THREE.Vector3(st.x - Math.sin(st.yaw) * 10, 2.6, st.z - Math.cos(st.yaw) * 10), roadX);
  }

  aboard() {
    return false;
  }

  reset() {}

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.foliage.dispose();
    // The dapple cookie hangs off the light, not a material: disposeScene doesn't see it.
    this.sun.map?.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.dispose();
    game.renderer.renderer.shadowMap.autoUpdate = true;
    game.waves.minSpawnDistance = () => 12;
    game.waves.pickSpawn = null;
  }

  debug() {
    return { sunOnCam: +this.sunOnCam.toFixed(2), foliage: this.foliage.counts };
  }
}
