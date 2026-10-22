import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildCrashSite, type CrashResult } from './CrashSite';
import { BASE, CRASH_TEAM_SIZE, CRASH_TERRAIN, JUNGLE_AI, OUTPOST, RAVINE, TUNNEL, X_OUT, Z_END, forwardOf, inBase, laneOf, lanesOf, SPAWN_PADS, SPAWN_ZONES } from './CrashLayout';
import { buildFoliage, type FoliageResult } from '../jungle/Foliage';
import { buildGodRays, type GodRays } from '../jungle/GodRays';
import { applyMud } from '../jungle/Mud';
import { dappleTexture } from '../jungle/textures';
import { DesertIntro } from '../desert/DesertIntro';
import { JUNGLE_GUARDS } from '../../entities/enemies/paramilitary';

export const CRASHSITE_INFO: LevelInfo = {
  id: 'crashsite',
  // 25.0: the TDM pool's one jungle map, "DEEP JUNGLE" (the firebase is Survival only).
  name: 'DEEP JUNGLE',
  biome: 'jungle',
  jp: 'ป่าลึก',
  blurb: 'An abandoned research outpost in the rainforest, 7v7: under the lab on its stilts, on its deck and roof, and in the tunnels beneath it to the ridge and the ravine.',
  modes: ['tdm'],
  loading: 'CLEARING THE CRASH SITE…',
  windowTitle: 'Gridfall — Deep Jungle',
  enemies: JUNGLE_GUARDS,
  music: 'jungle_theme',
  // 19.0: self-play (docs/BENCH-19.0.json): 7v7 is the knee (quiet seconds 14–18%, as 8v8; 5v5 33–53%).
  teamSize: CRASH_TEAM_SIZE,
  tagline: 'THE RIDGE · THE OUTPOST · THE RAVINE',
  jpLine: 'ป่าลึก · 47P QS 441 882 · ๐๖:๑๒',
  place: 'CRASH SITE · 47P QS 441 882',
  clock: '06:12',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: 'ป่าลึก · DEEP JUNGLE', t3: 'TEAM DEATHMATCH 7v7 · ALPHA vs OMEGA<br/>THE RIDGE · THE OUTPOST · THE TUNNELS · THE RAVINE' },
  },
};

/**
 * 15.0: a little thinner than Firebase Viper's 4.2 air (90% at ~64 m, not 51 m): the ridge's long
 * lines are a lane, and a rifle needs to see down them; the trenches and the ravine stay close.
 */
const FOG_DENSITY = 0.024;
const FOG_COLOR = '#4b5e49';
const fog90 = (density: number) => Math.sqrt(Math.log(10)) / density;

/**
 * Jungle: Crash Site (15.0): Deep Jungle's biome as a Team Deathmatch arena built from scratch. The
 * 4.2 jungle look (dappled sun through the canopy with static shadows, light shafts, mist, wet mud,
 * the oppressive green grade) over an organic, mirrored three-lane layout.
 */
export class CrashSiteLevel implements LevelRuntime {
  readonly info = CRASHSITE_INFO;
  data: LevelData;
  readonly look: LevelLook = {
    exposure: 1.05,
    bloom: { strength: 0.35, radius: 0.55, threshold: 0.95 },
    shadows: true,
    shadowTint: [0.0, 0.006, 0.004],
    grade: { split: 1, teal: [0, 0.006, 0.005], warm: [1.1, 1.14, 0.7], sat: 1.05, shadow: [0.55, 0.95, 0.74], lo: 0.07, hi: [0.08, 0.4], desat: 0.18, crush: 0.25, contrast: 0.14 },
  };
  flash = 0;
  site: CrashResult;
  foliage: FoliageResult;
  private sun: THREE.SpotLight;
  private cookie: THREE.Texture;
  private env: THREE.WebGLRenderTarget;
  private rays: GodRays;
  private mudOn = { value: 1 };

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(FOG_COLOR);
    game.col.terrain = CRASH_TERRAIN;
    game.fog.color.set(FOG_COLOR);
    game.fog.density = FOG_DENSITY;
    s.add(new THREE.HemisphereLight(0x9cbaa2, 0x3c3222, 0.85));
    // The sun through the canopy: a far, narrow spotlight with a dapple cookie and static shadows.
    this.cookie = dappleTexture();
    this.sun = new THREE.SpotLight(0xffefcf, 7.5, 0, 0.62, 0.02, 0);
    this.sun.position.set(30, 150, 40);
    this.sun.target.position.set(0, 0, 0);
    this.sun.map = this.cookie;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 90;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    s.add(this.sun, this.sun.target);

    this.site = buildCrashSite(s, game.col, game.glows);
    if (this.site.laneProblems.length) console.warn('[crashsite] nav nodes or lanes on blocked floor', this.site.laneProblems);
    const quality = { power: 0.6, balanced: 1, high: 1.25 }[game.settings.quality];
    const spawns = [...this.site.spawns.alpha, ...this.site.spawns.omega];
    this.foliage = buildFoliage(s, game.col, this.site.trees, this.site.keepClear, spawns, game.fog.color, quality, this.site.interiors, this.site.site);
    for (const m of this.foliage.leaves) Object.assign(m, { roughness: 0.45, metalness: 0.08, envMapIntensity: 0.9 });
    applyMud(this.site.terrain.material as THREE.MeshStandardMaterial, this.mudOn, 'forest');

    // Light shafts: onto the lab's roof (33.0: was the wreck's breach), the ridge's mid-field and the ravine's middle bridge.
    this.rays = buildGodRays(s, this.sun.position, [
      { x: -2, y: OUTPOST.roof, z: 2.5, r: 2.4, k: 1.0 },
      { x: -38, y: 3.6, z: 0, r: 2.6, k: 0.85 },
      { x: 28.5, y: 0.45, z: 0, r: 2.2, k: 0.8 },
    ], new THREE.Color(0.95, 1.0, 0.6).multiplyScalar(0.16));

    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const sky = new THREE.Scene();
    sky.background = new THREE.Color('#6b7f5e');
    this.env = pmrem.fromScene(sky, 0.04);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.3;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const d = this.site;
    const start = { x: 0, z: 59, yaw: 0, y: 0 };
    const open = (p: THREE.Vector3) => !game.col.blocked(p, 0.6);
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(-X_OUT - 0.5, -Z_END - 0.5), new THREE.Vector2(X_OUT + 0.5, Z_END + 0.5)),
      floorMin: RAVINE.floor - 0.5,
      nav: d.nav,
      spawns,
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
        // 31.0: the deployment zones (the default spawning since 31.0; the pads above are the DEV A/B).
        zones: SPAWN_ZONES,
        lanes: { alpha: lanesOf('alpha'), omega: lanesOf('omega') },
        inBase: (team, p) => inBase(p, team),
        start,
        laneOf,
        // 33.0: the tunnels are a fourth lane in the reports (the bots' lanes stay three).
        laneNames: ['ridge', 'outpost', 'ravine', 'tunnels'],
        // 33.0: the patrols' high-value areas beyond the zones and the lanes: the hub, the tunnels' bends,
        // their mouths at the ravine and at the bottom and top of each pit, the outpost's deck and roof.
        hvas: (() => {
          const F = TUNNEL.floor, pz = (TUNNEL.pit.z0 + TUNNEL.pit.z1) / 2;
          const half = [[0, F, 3], [5.5, F, pz], [-5.5, F, pz], [RAVINE.x0 - 1, F, pz], [TUNNEL.pit.x1 + 1, F, pz], [TUNNEL.pit.x0 - 1.5, 0, pz], [0.3, OUTPOST.deck.y, 6], [-5, OUTPOST.roof, 3]];
          return half.flatMap(([x, y, z]) => [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z)]);
        })(),
        // 50 tickets: about 3-minute matches at 7v7 (45 gave 2.6–2.9 min).
        tickets: 50,
        arena: JUNGLE_AI,
        forward: { points: { alpha: forwardOf('alpha').filter(open), omega: forwardOf('omega').filter(open) }, safe: 22, sight: 45 },
      },
    };
  }

  attach() {
    const game = this.game;
    game.ctx.sightRange = fog90(FOG_DENSITY) * 0.85;
    // Plants hide bodies (they don't stop rounds): the AI sees through the undergrowth as you do.
    game.ctx.concealment = (a, b) => this.foliage.concealment(a, b);
    game.weapon.setLights({ sky: 0xb4ccb4, ground: 0x4a3c28, hemi: 1.0, key: 0xffecc8, keyI: 1.6, rim: 0xa8d8c0, rimI: 0.45 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('jungle');
  }

  update(f: FrameInfo) {
    const game = this.game;
    game.glows.update(f.elapsed, f.camPos);
    this.foliage.update(f.elapsed, game.camera);
    this.rays.update(f.elapsed);
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(1.1);
    weapon.fillLight.color.setRGB(0.6, 0.85, 0.65);
    weapon.fillLight.intensity = 0.25;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.025 + 0.8;
    cam.position.set(Math.cos(a) * 34, 14 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 44);
    cam.lookAt(0, 2, 0);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // Down the ravine from the north, over the wreck, into ALPHA's landing zone.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(28, 6, -50), new THREE.Vector3(26, 3, -10), new THREE.Vector3(8, 9, 6), new THREE.Vector3(0, 6, 30), new THREE.Vector3(0, 2.8, BASE.z0 + 2)],
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(0, 2, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  setVisual(v4: boolean) {
    this.mudOn.value = v4 ? 1 : 0;
    this.rays.group.visible = v4;
  }

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.foliage.dispose();
    this.cookie.dispose();
    this.sun.map = null;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.dispose();
    game.renderer.renderer.shadowMap.autoUpdate = true;
  }

  debug() {
    return { foliage: this.foliage.counts, nodes: this.site.nav.nodes.length, drops: this.site.nav.drops.length, trees: this.site.trees.length, laneProblems: this.site.laneProblems.length };
  }
}
