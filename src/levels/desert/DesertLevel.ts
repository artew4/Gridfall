import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildTerrainMesh, DESERT_EXTENT, DESERT_TERRAIN } from './Terrain';
import { buildOutpost, type OutpostResult } from './Outpost';
import { Sandstorm } from './Sandstorm';
import { DesertIntro } from './DesertIntro';
import { detailTexture, sandTexture } from './textures';
import { damp } from '../../core/math';
import { JACKAL_AR } from '../../entities/weapons/jackal';
import { DESERT_MERCS } from '../../entities/enemies/mercs';

export const DESERT_INFO: LevelInfo = {
  id: 'desert',
  name: 'DESERT OUTPOST',
  jp: '砂漠の前哨基地',
  blurb: 'An outpost in open dunes, harsh sun, sandstorms that blind you. Survival.',
  modes: ['arcade'],
  loading: 'RAISING THE OUTPOST…',
  windowTitle: 'NEON RAIN — Desert Outpost',
  arsenal: { weapon: JACKAL_AR, enemies: DESERT_MERCS },
  tagline: 'HOLD THE OUTPOST · WATCH THE STORM',
  jpLine: '砂漠 · 午後二時十分',
  place: 'OUTPOST KESTREL',
  clock: '14:10',
  cine: {
    arcade: { t1: 'NEON RAIN', t2: '砂漠の前哨基地 · DESERT OUTPOST', t3: 'ARCADE SURVIVAL · HOLD THE OUTPOST<br/>SANDSTORM WARNING · VISIBILITY WILL DROP' },
  },
};

/** Sun from the south-west, 40° up: long hard shadows across the yard. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.64, 0.53).normalize();

/**
 * Desert Outpost: open dunes inside sandstone mesas, a walled compound of low buildings you can enter,
 * a blazing sun with hard shadows, and a sandstorm cycle that takes the view away. Arcade Survival only.
 */
export class DesertLevel implements LevelRuntime {
  readonly info = DESERT_INFO;
  data: LevelData;
  readonly look: LevelLook = { exposure: 0.9, bloom: { strength: 0.32, radius: 0.5, threshold: 0.96 }, shadows: true, shadowTint: [0.008, 0.005, 0.002] };
  flash = 0;
  private outpost: OutpostResult;
  storm: Sandstorm;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private env: THREE.WebGLRenderTarget;
  private indoors = 0;
  private sunColor = new THREE.Color(1, 0.9, 0.76);

  constructor(private game: Game) {
    const s = game.scene;
    s.background = null;
    game.col.terrain = DESERT_TERRAIN;
    game.fog.color.set('#d9c4a2');
    game.fog.density = 0.0045;

    this.hemi = new THREE.HemisphereLight(0xbfd4f0, 0x8a6a46, 0.3);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.sunColor, 3.4);
    this.sun.position.copy(SUN_DIR).multiplyScalar(160);
    this.sun.target.position.set(0, 0, 0);
    s.add(this.sun, this.sun.target);
    // Static hard shadows over the whole map, rendered once (nothing that casts them moves).
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -112;
    sc.right = sc.top = 112;
    sc.near = 10;
    sc.far = 340;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;

    // Tyre ruts: out of each gate into the dunes, and across the yard between the gates.
    const ruts: [number, number][][] = [
      [[16, -6], [8, -18], [6, -27], [9, -45], [18, -70], [26, -88]],
      [[0, 4], [-6, 18], [-7, 27], [-11, 48], [-16, 72]],
      [[20, -2], [30, -1], [52, 3], [78, 10]],
      [[-20, -1], [-30, -3], [-55, -7], [-82, -2]],
    ];
    s.add(buildTerrainMesh(sandTexture(), detailTexture(230, ruts)));
    this.outpost = buildOutpost(s, game.col, game.glows);
    this.storm = new Sandstorm(s, game.fog, SUN_DIR, this.outpost.interiors);

    // Image-based light from the clear sky only (bright, neutral), for metal and plaster.
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const skyOnly = new THREE.Scene();
    skyOnly.background = new THREE.Color('#c9d6e6');
    this.env = pmrem.fromScene(skyOnly, 0.04);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.2;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const o = this.outpost;
    this.data = {
      start: { ...o.start, y: 0 },
      bounds: new THREE.Box2(new THREE.Vector2(-DESERT_EXTENT, -DESERT_EXTENT), new THREE.Vector2(DESERT_EXTENT, DESERT_EXTENT)),
      floorMin: -1,
      nav: o.nav,
      spawns: o.spawns,
      perches: o.perches,
      coverPoints: o.coverPoints,
      cabinets: o.cabinets,
      medkits: o.medkits,
      breakables: o.breakables,
      zoneAt: o.zoneAt,
      testGoals: [
        ...o.interiors.map((r) => new THREE.Vector3((r.x0 + r.x1) / 2, 0.12, (r.z0 + r.z1) / 2)),
        new THREE.Vector3(24.5, 3.25, 12.5),
        new THREE.Vector3(-20.5, 3.55, 20.5),
        new THREE.Vector3(-12, 3.55, 11.5),
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(-18, 0, 2),
        new THREE.Vector3(20, 0, 2),
        new THREE.Vector3(55, 0, 30).setY(DESERT_TERRAIN.height(55, 30)),
      ],
    };
  }

  attach() {
    const game = this.game;
    // Enemies come out of the dust: no closer than what the storm still lets you see.
    game.waves.minSpawnDistance = () => Math.max(24, Math.min(70, this.storm.visibility * 1.05));
    game.ctx.sightRange = this.storm.visibility;
    game.weapon.setLights({ sky: 0xd8e4f4, ground: 0x9a7650, hemi: 1.1, key: 0xffe6c4, keyI: 2.6, rim: 0xffd2a0, rimI: 0.8 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('desert');
  }

  /** The camera is inside one of the buildings. */
  private inside(p: THREE.Vector3) {
    return this.outpost.interiors.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y < r.h);
  }

  update(f: FrameInfo) {
    const game = this.game;
    const s = this.storm.update(f.dt, f.elapsed, game.camera);
    this.indoors = damp(this.indoors, this.inside(f.camPos) ? 1 : 0, 6, f.rawDt);
    // Light through the dust: the sun dims and reddens, the sky light grows and warms.
    this.sun.intensity = 3.4 * (1 - 0.86 * s);
    this.sun.color.copy(this.sunColor).lerp(new THREE.Color(1, 0.62, 0.36), s * 0.8);
    this.hemi.intensity = 0.3 + 0.6 * s;
    this.hemi.color.set(0xbfd4f0).lerp(game.fog.color, s);
    game.glows.update(f.elapsed, f.camPos);
    game.ctx.sightRange = this.storm.visibility;
    game.audio.setWind(s, this.indoors);
    this.outpost.update(f.elapsed, s);
  }

  lightWeapon(weapon: Weapon) {
    const s = this.storm.clock.intensity;
    weapon.setKey((1 - this.indoors * 0.75) * (2.6 - 1.6 * s));
    weapon.fillLight.color.setRGB(1, 0.78, 0.55);
    weapon.fillLight.intensity = 0.4 * (1 - this.indoors);
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.035 + 2.2;
    cam.position.set(Math.cos(a) * 52, 11 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 52);
    cam.lookAt(0, 3, 0);
  }

  createIntro(): IntroLike {
    // Clear air for the opening; the first storm rolls in during the first wave.
    this.storm.clock.set('calm', 0.06);
    const st = this.data.start;
    return new DesertIntro(new THREE.Vector3(st.x, 1.65, st.z), new THREE.Vector3(st.x - Math.sin(st.yaw) * 10, 1.65, st.z - Math.cos(st.yaw) * 10));
  }

  aboard() {
    return false;
  }

  reset() {
    this.storm.clock.set('calm', 0.06);
  }

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.storm.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.dispose();
    game.renderer.renderer.shadowMap.autoUpdate = true;
    game.waves.minSpawnDistance = () => 12;
  }

  debug() {
    return { storm: +this.storm.clock.intensity.toFixed(2), phase: this.storm.clock.phase, visibility: Math.round(this.storm.visibility), indoors: +this.indoors.toFixed(2) };
  }
}
