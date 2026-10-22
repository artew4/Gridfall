import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildNeonBlock, type NeonBlockResult } from './NeonBlock';
import { BASE, GROUND_FOG, X_OUT, Z_END, groundFogBias, inBase, lanesOf, SPAWN_PADS } from './NeonBlockLayout';
import { DesertIntro } from '../desert/DesertIntro';
import { clearHeightFog, setHeightFog } from '../../world/HeightFog';
import { ReflectionCatchers } from '../../world/ReflectionCatchers';
import { WET4, createStreak, updateStreaks } from '../../world/Ground';
import { damp } from '../../core/math';
import { fogRange } from '../../world/Visibility';
import { NEON_SYNTHS } from '../../entities/enemies/neon';

export const NEONBLOCK_INFO: LevelInfo = {
  id: 'neonblock',
  name: 'TOKYO: NEON BLOCK',
  biome: 'tokyo',
  jp: '東京 · ネオン街区',
  blurb: 'A Shinjuku block after the rain, fog lying in its streets: close fights in the alleys, long ones across the clear rooftops. 5v5.',
  modes: ['tdm'],
  loading: 'WIRING THE NEON…',
  windowTitle: 'Gridfall — Tokyo: Neon Block',
  enemies: NEON_SYNTHS,
  music: 'tokyo_theme',
  tagline: 'THREE LEVELS · THREE LANES · ONE BLOCK',
  jpLine: '新宿 · 第四街区 · 午前一時',
  place: 'SECTOR 4, SHINJUKU',
  clock: '01:16',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: '東京 · ネオン街区 · NEON BLOCK', t3: 'TEAM DEATHMATCH 5v5 · ALPHA vs OMEGA<br/>LANTERN ALLEY · MAIN STREET · THE ROOFTOPS' },
  },
};

const FOG = 0x0d0b19;



/**
 * Tokyo: Neon Block (14.0): Tokyo Night's biome as a Team Deathmatch arena. The 4.0 pipeline (wet
 * ground with puddles and ripples, reflection catchers and neon streaks, rain lit by the glows, an
 * environment map of the lit block, the teal/orange grade) over a layout built for fair fights: three
 * lanes on three levels, mirrored, lit for reading people rather than for mood.
 */
export class NeonBlockLevel implements LevelRuntime {
  readonly info = NEONBLOCK_INFO;
  data: LevelData;
  /** Tokyo's 4.0 look, a touch brighter (exposure) and less saturated: a fight needs mid-tones. */
  readonly look: LevelLook = {
    exposure: 1.12,
    bloom: { strength: 0.65, radius: 0.85, threshold: 1.0 },
    shadows: false,
    shadowTint: [0.004, 0.012, 0.03],
    grade: { split: 1, teal: [0.0, 0.012, 0.02], warm: [1.12, 0.97, 0.84], sat: 1.12 },
    legacy: { exposure: 1.05, bloom: { strength: 0.85, radius: 0.65, threshold: 0.92 }, shadows: false, shadowTint: [0.012, 0.01, 0.03] },
  };
  flash = 0;
  block: NeonBlockResult;
  private env: THREE.WebGLRenderTarget;
  private catchers: ReflectionCatchers;
  private streaks: THREE.Mesh[] = [];
  private covered = 0;

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(FOG);
    game.fog.color.set(FOG);
    // 25.0: no rain, so a thinner haze over the roofs (~90% at 126 m: the long fights up there are clear);
    // the streets get the ground fog instead (attach).
    game.fog.density = 0.012;
    s.add(new THREE.HemisphereLight(0x4a5598, 0x221828, 0.95));
    const moon = new THREE.DirectionalLight(0x5868a8, 0.3);
    moon.position.set(-20, 60, -30);
    s.add(moon);

    this.block = buildNeonBlock(s, game.col, game.glows, game.time, game.fog);
    if (this.block.laneProblems.length) console.warn('[neonblock] nav nodes or lanes on blocked floor', this.block.laneProblems);

    game.glows.update(0, new THREE.Vector3());
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    this.env = pmrem.fromScene(s, 0.02, 0.1, 300, { position: new THREE.Vector3(0, 4, 0) } as never);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.85;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    this.catchers = new ReflectionCatchers(game.glows.list, this.block.catcherPicks, { intensity: 12, distance: 16, height: 4 });
    for (const g of game.glows.list) {
      if (!g.reflect) continue;
      const m = createStreak(g, game.time, game.fog);
      this.streaks.push(m);
      s.add(m);
    }

    const d = this.block;
    const start = { x: 0, z: 61, yaw: 0, y: 0 };
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(-X_OUT - 0.5, -Z_END - 0.5), new THREE.Vector2(X_OUT + 0.5, Z_END + 0.5)),
      floorMin: -1,
      nav: d.nav,
      // No survival here: these are only for the DEV nav checks (spawn → every goal).
      spawns: [...d.spawns.alpha, ...d.spawns.omega],
      perches: [],
      coverPoints: d.coverPoints,
      cabinets: [],
      medkits: [],
      breakables: [],
      zoneAt: d.zoneAt,
      testGoals: d.testGoals,
      tdm: {
        spawns: d.spawns,
        // 27.0: spawn pads anywhere on the map (SpawnManager); the yards above stay for the 'bases' A/B.
        pads: SPAWN_PADS,
        lanes: { alpha: lanesOf('alpha'), omega: lanesOf('omega') },
        inBase: (team, p) => inBase(p, team),
        start,
        laneOf: (x, _y, z) => (Math.abs(z) > 50 ? null : x < -12 ? 0 : x > 12 ? 2 : 1),
        laneNames: ['west', 'centre', 'east'],
        // 25.0: the bots' sight in the ground fog (Sensing): both below `below` m, `range` at most.
        groundFog: GROUND_FOG.cap,
        // 25.0: SMG and shotgun bots route through the fog, riflemen over it (Nav bias).
        navBias: groundFogBias,
      },
    };
  }

  attach() {
    const game = this.game;
    setHeightFog(GROUND_FOG.density, GROUND_FOG.top, GROUND_FOG.color, GROUND_FOG.opacity);
    game.ctx.sightRange = fogRange(game.fog.density);
    game.weapon.setLights({ sky: 0x5a6aa8, ground: 0x2a1c2c, hemi: 0.9, key: 0xffc890, keyI: 1.6, rim: 0xff4ad8, rimI: 0.9 });
  }

  startAudio() {
    // 25.0: the city without its rain bed.
    this.game.audio.setAmbience('city-dry');
  }

  private under(p: THREE.Vector3) {
    return this.block.covered.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y < r.h);
  }

  update(f: FrameInfo) {
    const game = this.game;
    game.glows.update(f.elapsed, f.camPos);
    this.catchers.update();
    updateStreaks(this.streaks, f.camPos);
    this.covered = damp(this.covered, this.under(f.camPos) ? 1 : 0, 6, f.rawDt);
    game.audio.setUnderground(this.covered * 0.35);
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(1.5 - this.covered * 0.3);
    weapon.fillLight.color.setRGB(1, 0.55, 0.9);
    weapon.fillLight.intensity = 0.5;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.03 + 0.4;
    cam.position.set(Math.cos(a) * 30, 24 + Math.sin(t * 0.1) * 2, Math.sin(a) * 52);
    cam.lookAt(0, 3, 0);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // Down the length of the block from over OMEGA's roofs, along Main Street, into ALPHA's yard.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(-10, 26, -60), new THREE.Vector3(-4, 14, -20), new THREE.Vector3(0, 8.5, 6), new THREE.Vector3(0, 5, 34), new THREE.Vector3(0, 2.8, BASE.z0 + 4)],
      new THREE.Vector3(0, 6, 0),
      new THREE.Vector3(0, 3, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  setVisual(v4: boolean) {
    WET4.value = v4 ? 1 : 0;
    this.catchers.setEnabled(v4);
  }

  dispose() {
    const game = this.game;
    clearHeightFog();
    WET4.value = 1;
    this.catchers.dispose();
    this.env.dispose();
    game.audio.setUnderground(0);
  }

  debug() {
    const d = this.block;
    return { nodes: d.nav.nodes.length, drops: d.nav.drops.length, lights: d.lights, instanced: d.instanced, laneProblems: d.laneProblems.length };
  }
}
