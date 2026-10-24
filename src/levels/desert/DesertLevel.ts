import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildTerrainMesh, CULVERT, DESERT_EXTENT, DESERT_TERRAIN, desertHeight } from './Terrain';
import { rotatePads } from '../SpawnManager';
import { buildOutpost, type OutpostResult } from './Outpost';
import { Sandstorm } from './Sandstorm';
import { DesertIntro } from './DesertIntro';
import { detailTexture, sandTexture } from './textures';
import { damp, smoothstep } from '../../core/math';
import { DESERT_MERCS } from '../../entities/enemies/mercs';
import { DESERT_AI, DESERT_TEAM_SIZE, flankOf, inBase } from './ArenaLayout';

export const DESERT_INFO: LevelInfo = {
  id: 'desert',
  name: 'DESERT OUTPOST',
  biome: 'desert',
  jp: 'الموقع الصحراوي',
  blurb: 'An outpost in open dunes, harsh sun, sandstorms that blind you. Survival or 12v12 Team Deathmatch: the compound, the hamlet and the wadi, the ruins by the cliffs.',
  modes: ['arcade', 'tdm'],
  teamSize: DESERT_TEAM_SIZE,
  loading: 'RAISING THE OUTPOST…',
  windowTitle: 'Gridfall — Desert Outpost',
  enemies: DESERT_MERCS,
  music: 'desert_theme',
  tagline: 'HOLD THE OUTPOST · WATCH THE STORM',
  jpLine: 'الصحراء · الساعة ١٤:١٠',
  place: 'OUTPOST KESTREL',
  clock: '14:10',
  cine: {
    arcade: { t1: 'GRIDFALL', t2: 'الموقع الصحراوي · DESERT OUTPOST', t3: 'ARCADE SURVIVAL · HOLD THE OUTPOST<br/>SANDSTORM WARNING · VISIBILITY WILL DROP' },
    tdm: { t1: 'GRIDFALL', t2: 'الموقع الصحراوي · DESERT OUTPOST', t3: 'TEAM DEATHMATCH 12v12 · ALPHA vs OMEGA<br/>THE COMPOUND · THE FLANKS · THE RUINS' },
  },
};

/**
 * 28.0: the spawn pads (TdmData.pads), ALPHA's half rotated 180° for OMEGA (the arena is
 * point-symmetric), on the sand under them: [x, z, yaw]. The yard; beside the trench's north mouth;
 * beside the burnt-out bus; inside a hamlet house; beside the wrecked truck (was the wadi: self-play put
 * too little of the fight in the new outer flanks); the compound's south yard; by the west pump house. Proposed by __dev.spawnPads, placed by hand where the outer flanks needed one.
 */
const SPAWN_PADS = rotatePads(
  ([[1.5, 63.6, 3.14], [-70, 44, 1.57], [70.2, 37, 4.71], [-59, 26.5, 1.57], [71.5, 18, 4.71], [0, 18, 3.14], [-55.5, 6, 1.57]] as const).map(([x, z, a]) => [x, desertHeight(x, z), z, a] as const),
);

/**
 * 31.0: the deployment zones (TdmData.zones): ALPHA's (south), A to C from its left, on the sand under
 * them; OMEGA's rotated 180°. Open dunes: three, spread wide (the west dunes, the yard, the east dunes).
 */
const SPAWN_ZONES = {
  symmetry: 'rotate' as const,
  theme: 'desert' as const,
  half: ([['A', -50, 40, 6], ['B', 1.5, 63.6, 6], ['C', 50, 40, 6]] as const).map(([id, x, z, r]) => ({ id, x, y: desertHeight(x, z), z, r, yaw: Math.PI })),
};

/** Sun from the south-west, 40° up: long hard shadows across the yard. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.64, 0.53).normalize();

/**
 * Desert Outpost: open dunes inside sandstone mesas, a walled compound of low buildings you can enter,
 * a blazing sun with hard shadows, and a sandstorm cycle that takes the view away. Arcade Survival only.
 */
/** 4.1: the sun's intensity in clear weather (3.7: 3.4). */
const SUN_V4 = 5.4;

export class DesertLevel implements LevelRuntime {
  readonly info = DESERT_INFO;
  data: LevelData;
  /**
   * 4.1 "Wasteland" look: a blinding sun (1.6x, sunlit ground ~59% brighter than 3.7) at the same
   * exposure, so the shade, lit only by the sky, drops away; bloom only above the brightest diffuse sand (sun glare,
   * specular glints on metal, sunlit dust); a bleach-bypass grade (drained midtones, crushed
   * shadows, silver contrast) with amber pushed into the highlights. `legacy` is the 3.7 look (F8).
   */
  readonly look: LevelLook = {
    exposure: 0.9,
    bloom: { strength: 0.5, radius: 0.55, threshold: 1.0 },
    shadows: true,
    shadowTint: [0.003, 0.0015, 0],
    // The bleach runs first (drains the sand to near-grey), then the warm push re-tints the sunlit
    // range (desert highlights start low: sunlit sand is 0.3-0.7 in linear HDR) amber-yellow.
    grade: { split: 1, teal: [0, 0, 0], warm: [1.15, 1.04, 0.76], sat: 1.0, desat: 0.35, crush: 0.5, contrast: 0.12, hi: [0.1, 0.8] },
    legacy: { exposure: 0.9, bloom: { strength: 0.32, radius: 0.5, threshold: 0.96 }, shadows: true, shadowTint: [0.008, 0.005, 0.002] },
  };
  /** 4.1 additions on (the F8 comparison switches them). */
  private v4 = true;
  private _h = new THREE.Vector3();
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
      // 12.0: the culvert's floor is the lowest (the safety net recovers anything below it).
      floorMin: CULVERT.floor - 0.5,
      nav: o.nav,
      spawns: o.spawns,
      perches: o.perches,
      coverPoints: o.coverPoints,
      cabinets: o.cabinets,
      medkits: o.medkits,
      breakables: o.breakables,
      zoneAt: o.zoneAt,
      testGoals: [
        // (12.0: the culvert's centre is on its floor.)
        // (46.0: the flank houses bring their own goals, a level each.)
        ...o.interiors.filter((r) => !o.arena.houses.interiors.includes(r)).map((r) => new THREE.Vector3((r.x0 + r.x1) / 2, r.h < 0 ? CULVERT.floor : 0.12, (r.z0 + r.z1) / 2)),
        // 12.0: the new roofs and the skybridge.
        new THREE.Vector3(-20, 3.55, -14.5),
        new THREE.Vector3(18, 5.25, -14),
        new THREE.Vector3(10, 3.35, 13.5),
        new THREE.Vector3(0, 4.4, -15.2),
        new THREE.Vector3(24.5, 3.25, 12.5),
        new THREE.Vector3(-20.5, 3.55, 20.5),
        new THREE.Vector3(-12, 3.55, 11.5),
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(-18, 0, 2),
        new THREE.Vector3(20, 0, 2),
        new THREE.Vector3(55, 0, 30).setY(DESERT_TERRAIN.height(55, 30)),
        ...o.arena.testGoals,
      ],
      tdm: {
        // ALPHA (the player's team) holds the south base, OMEGA the north.
        spawns: { alpha: o.arena.spawns.south, omega: o.arena.spawns.north },
        lanes: { alpha: o.arena.lanes.south, omega: o.arena.lanes.north },
        // 28.0: spawn pads anywhere on the map (SpawnManager); the yards stay for the 'bases' A/B.
        pads: SPAWN_PADS,
        // 31.0: the deployment zones (the default spawning since 31.0; the pads above are the DEV A/B).
        zones: SPAWN_ZONES,
        // 28.0: open dunes, long sight in calm air: pressure from further off, a larger minimum, sight
        // checked out to 80 m (past the bots' 75 m cap). Self-play: shot within 3 s of a spawn 5.2% → see BENCH-28.0.
        // 41.0: densityR, the spawns' and fireteams' local area (open dunes: wide).
        spawnTuning: { near: 60, hardMin: 24, sight: 80, densityR: 18 },
        // 28.0: the outer flanks' high-value areas for the patrols: the outcrops' tops, the bus (the trench
        // is on the outer lanes already; searching it as well jammed bots in the corner by its notch).
        hvas: [
          // 38.0: on the outcrops' tops as built (they were the sand plus the outcrop's height, 0.65 m into
          // the rock: the route's goal snapped to the node beside the Spine, and a bot stood there, stuck).
          ...o.arena.outcrops,
          new THREE.Vector3(74.8, desertHeight(74.8, 36.5), 36.5),
          new THREE.Vector3(-74.8, desertHeight(-74.8, -36.5), -36.5),
          // 38.0: the ruins' corner rooms and east courts.
          ...o.arena.ruins.hvas,
        ],
        // 38.0: the ruins' galleries, kept watch on (ArenaDirector.setWatch).
        // Both at once (one a team on each, from that flank's own lane).
        highGround: { points: o.arena.ruins.posts, hold: [10, 16], every: 10, reach: 40, count: 2 },
        // 38.0: the flanks pull the patrols (more while the centre is hot); the 23.0 climbing rule.
        flankOf: (x) => flankOf(x),
        arena: DESERT_AI,
        inBase: (team, p) => inBase(p.x, p.z, team === 'alpha' ? 'south' : 'north'),
        start: { x: 0, z: 63, yaw: 0, y: o.arena.spawns.south[0].y },
        // 28.0: three lanes for the reports and the spawn balance (the director keeps its five): the
        // west flank (the hamlet and the dunes beyond), the compound, the east flank; the yards none.
        laneOf: (x, _y, z) => (Math.abs(z) > 56 && Math.abs(x) < 23 ? null : x < -40 ? 0 : x > 40 ? 2 : 1),
        laneNames: ['west flank', 'compound', 'east flank'],
        // 28.0: the outer edges: everything past the compound's approaches (hamlet, wadi, pump houses,
        // the outer dunes).
        edgeOf: (x) => Math.abs(x) >= 44,
      },
    };
  }

  attach() {
    const game = this.game;
    // Enemies come out of the dust: no closer than what the storm still lets you see.
    game.waves.minSpawnDistance = () => Math.max(24, Math.min(70, this.storm.visibility * 1.05));
    game.ctx.sightRange = this.storm.visibility;
    // 46.0: two under a roof (the compound's buildings, the flank houses, the culvert) see each other whatever the storm.
    game.ctx.sheltered = (a, b) => this.inside(a) && this.inside(b);
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
    this.sun.intensity = (this.v4 ? SUN_V4 : 3.4) * (1 - 0.86 * s);
    this.storm.setLook(this.v4, 1 - 0.86 * s);
    this.updateHaze(s);
    this.sun.color.copy(this.sunColor).lerp(new THREE.Color(1, 0.62, 0.36), s * 0.8);
    this.hemi.intensity = 0.3 + 0.6 * s;
    this.hemi.color.set(0xbfd4f0).lerp(game.fog.color, s);
    game.glows.update(f.elapsed, f.camPos);
    game.ctx.sightRange = this.storm.visibility;
    // 46.0: no storm in the room he stands in: the picture's fog thins indoors (the weather's own is
    // kept for the AI, EnemyCtx.weatherFog), and the dust is masked there (the storm's interiors).
    game.ctx.weatherFog = game.fog.density;
    game.fog.density *= 1 - 0.8 * this.indoors;
    game.audio.setWind(s, this.indoors);
    this.outpost.update(f.elapsed, s);
  }

  /**
   * Heat haze over the hot ground in clear weather: off indoors, in the dust (that's the storm's job)
   * and in the 3.7 look. The band follows the horizon on screen (camera pitch). Drawn by the grade
   * pass (Renderer.haze): a separate full-screen pass measured +2.5-3.5 ms GPU on Apple M5 even as
   * a plain copy; folded into the grade's existing fetches it is a few ALU ops.
   */
  private updateHaze(storm: number) {
    const hz = this.game.renderer.haze;
    const k = (this.v4 ? 1 : 0) * (1 - this.indoors) * Math.pow(1 - smoothstep(0.05, 0.45, storm), 2);
    const cam = this.game.camera;
    cam.getWorldDirection(this._h);
    this._h.y = 0;
    if (k < 0.02 || this._h.lengthSq() < 1e-4) {
      hz.px = 0;
      return;
    }
    this._h.normalize().multiplyScalar(1000).add(cam.position).project(cam);
    hz.px = this._h.y > -1.3 && this._h.y < 1.3 ? 1.4 * k : 0;
    hz.horizon = (this._h.y + 1) / 2;
  }

  /** DEV comparison (F8): the 4.1 sun, glints, glare, metals and haze on, or the 3.7 desert. */
  setVisual(v4: boolean) {
    this.v4 = v4;
    for (const g of this.outpost.gloss) Object.assign(g.mat, v4 ? g.v4 : g.legacy);
    if (!v4) this.game.renderer.haze.px = 0;
  }

  lightWeapon(weapon: Weapon) {
    const s = this.storm.clock.intensity;
    weapon.setKey((1 - this.indoors * 0.75) * (2.6 - 1.6 * s) * (this.v4 ? 1.3 : 1));
    weapon.fillLight.color.setRGB(1, 0.78, 0.55);
    weapon.fillLight.intensity = 0.4 * (1 - this.indoors);
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.035 + 2.2;
    cam.position.set(Math.cos(a) * 52, 11 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 52);
    cam.lookAt(0, 3, 0);
  }

  createIntro(mode?: string): IntroLike {
    // Clear air for the opening (12.0: a brief calm); the first storm front is on its way.
    this.storm.clock.set('calm', 0.06);
    const st = mode === 'tdm' && this.data.tdm ? this.data.tdm.start : this.data.start;
    const ey = (st.y ?? 0) + 1.65;
    // TDM: over the enemy base, down the west flank and round into ours, looking north at the end.
    if (mode === 'tdm')
      return new DesertIntro(new THREE.Vector3(st.x, ey, st.z), new THREE.Vector3(st.x, ey, st.z - 10),
        [new THREE.Vector3(10, 34, -88), new THREE.Vector3(-30, 22, -40), new THREE.Vector3(-34, 14, 20), new THREE.Vector3(-12, 7, 50), new THREE.Vector3(0, 4.2, 70)],
        new THREE.Vector3(0, 2, -64), new THREE.Vector3(0, 3, 40));
    return new DesertIntro(new THREE.Vector3(st.x, ey, st.z), new THREE.Vector3(st.x - Math.sin(st.yaw) * 10, ey, st.z - Math.cos(st.yaw) * 10));
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
    game.renderer.haze.px = 0;
    game.waves.minSpawnDistance = () => 12;
  }

  debug() {
    return { storm: +this.storm.clock.intensity.toFixed(2), phase: this.storm.clock.phase, visibility: Math.round(this.storm.visibility), indoors: +this.indoors.toFixed(2) };
  }
}
