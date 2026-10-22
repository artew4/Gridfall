import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildMaglev, type MaglevResult } from './Maglev';
import { BASE, HALL_TERRAIN, LANE_STRICT, LANE_WEIGHTS, TRACK, X_HALL, Z_END, inBase, laneOf, lanesOf, navCost } from './MaglevLayout';
import { DesertIntro } from '../desert/DesertIntro';
import { damp } from '../../core/math';
import { fogRange } from '../../world/Visibility';
import { DESERT_MERCS } from '../../entities/enemies/mercs';

export const MAGLEV_INFO: LevelInfo = {
  id: 'maglev',
  name: 'MAGLEV TERMINAL',
  biome: 'tokyo',
  jp: 'リニア中央駅',
  blurb: 'A white glass-roofed transit hall, built for 5v5: close quarters in the train, rifle duels on the platforms, a mezzanine and skybridges over them.',
  modes: ['tdm'],
  loading: 'OPENING THE TERMINAL…',
  windowTitle: 'Gridfall — Maglev Terminal',
  enemies: DESERT_MERCS,
  music: 'tokyo_theme',
  tagline: 'THE TRAIN · THE PLATFORMS · THE MEZZANINE',
  jpLine: 'リニア中央駅 · 1番線 2番線 · 10:05',
  place: 'MAGLEV TERMINAL, PLATFORMS 1–2',
  clock: '10:05',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: 'リニア中央駅 · MAGLEV TERMINAL', t3: 'TEAM DEATHMATCH 5v5 · ALPHA vs OMEGA<br/>THE TRAIN · THE PLATFORMS · THE MEZZANINE' },
  },
};

/** Mid-morning sun, high and a little east of south: it falls through the roof onto the platforms. */
export const SUN_DIR = new THREE.Vector3(0.36, 0.86, 0.36).normalize();
/** A clean pale-blue haze: ~90% at 330 m (the hall is 120 m long and stays crisp; the city softens). */
const HAZE = '#d6e2ea';
const FOG_DENSITY = 0.0046;

/** A sky dome: deep zenith blue to a pale horizon, a white glow round the sun. No fog (it is the horizon). */
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uZenith: { value: new THREE.Color('#5f93c8') }, uHorizon: { value: new THREE.Color(HAZE) }, uSunTint: { value: new THREE.Color('#fffaf0') } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZenith, uHorizon, uSunTint;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.5));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c = mix(c, uSunTint, pow(s, 10.0) * 0.4);
        c += uSunTint * pow(s, 900.0) * 1.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

/**
 * Maglev Terminal (18.0): a corporate sci-fi transit hall at mid-morning. Daylight through a glass
 * roof: one sun with static shadows (the roof's steel grid, the bridges and the train draw the hall's
 * shadow pattern on the white floor), a bright sky that fills the shade, a clean cool grade with a
 * little bloom on the light strips. Three point lights (the cars' ceilings), pooled like any map's.
 * The glass is plain transparent standard material reflecting a static environment map (see Maglev.ts).
 */
export class MaglevLevel implements LevelRuntime {
  readonly info = MAGLEV_INFO;
  data: LevelData;
  readonly look: LevelLook = {
    exposure: 0.95,
    bloom: { strength: 0.26, radius: 0.45, threshold: 1.25 },
    shadows: true,
    shadowTint: [0.006, 0.01, 0.018],
    // Clean and cool: whites stay white (a touch of blue in the shade), low contrast, no crush.
    grade: { split: 1, teal: [0.004, 0.009, 0.016], warm: [1.0, 1.0, 0.99], sat: 0.95, desat: 0.05, crush: 0.02, contrast: 0.06, hi: [0.25, 1.6], shadow: [0.94, 0.98, 1.06], lo: 0.12 },
  };
  flash = 0;
  hall: MaglevResult;
  private sun: THREE.DirectionalLight;
  private env: THREE.WebGLRenderTarget;
  private indoors = 0;

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(HAZE);
    game.col.terrain = HALL_TERRAIN;
    game.fog.color.set(HAZE);
    game.fog.density = FOG_DENSITY;
    s.add(skyDome());

    // Light: a bright sky (the white hall would otherwise go grey in its shade), the sun with static
    // shadows over the whole hall (the frustum fits it: 2048 texels over ~150 m, 7 cm each).
    s.add(new THREE.HemisphereLight(0xdde9f4, 0xc9c6bf, 0.8));
    this.sun = new THREE.DirectionalLight(0xfffaf0, 3.4);
    this.sun.position.copy(SUN_DIR).multiplyScalar(170);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -72;
    sc.right = sc.top = 72;
    sc.near = 40;
    sc.far = 320;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 1.5;
    s.add(this.sun, this.sun.target);

    this.hall = buildMaglev(s, game.col);
    if (this.hall.laneProblems.length) console.warn('[maglev] nav nodes or lanes on blocked floor', this.hall.laneProblems);

    // Image-based light from the sky and a pale ground, once: the glass's only "reflection", and the
    // gloss of the floor, the steel and the train.
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyDome());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 24), new THREE.MeshBasicMaterial({ color: 0xc4c6c4 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    envScene.add(ground);
    this.env = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
    envScene.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.geometry.dispose();
        (mm.material as THREE.Material).dispose();
      }
    });
    s.environment = this.env.texture;
    s.environmentIntensity = 0.45;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const d = this.hall;
    const start = { x: 0, z: 55.8, yaw: 0, y: 0 };
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(-X_HALL - 0.5, -Z_END - 0.5), new THREE.Vector2(X_HALL + 0.5, Z_END + 0.5)),
      floorMin: TRACK.floor - 0.5,
      nav: { ...d.nav, cost: navCost },
      spawns: [...d.spawns.alpha, ...d.spawns.omega],
      perches: [],
      coverPoints: [],
      cabinets: [],
      medkits: [],
      breakables: [],
      zoneAt: d.zoneAt,
      testGoals: d.testGoals,
      tdm: {
        spawns: d.spawns,
        lanes: { alpha: lanesOf('alpha'), omega: lanesOf('omega') },
        inBase: (team, p) => inBase(p, team),
        start,
        laneOf,
        laneNames: ['west', 'train', 'east'],
        laneWeights: LANE_WEIGHTS,
        laneStrict: LANE_STRICT,
      },
    };
  }

  attach() {
    const game = this.game;
    game.ctx.sightRange = fogRange(FOG_DENSITY) * 0.9;
    game.weapon.setLights({ sky: 0xe0ecf6, ground: 0xc8c4bc, hemi: 1.1, key: 0xfffaf0, keyI: 2.2, rim: 0xd8e8f4, rimI: 0.5 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('terminal');
  }

  private inside(p: THREE.Vector3) {
    return this.hall.covered.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y > r.y0 && p.y < r.h);
  }

  update(f: FrameInfo) {
    this.indoors = damp(this.indoors, this.inside(f.camPos) ? 1 : 0, 6, f.rawDt);
    // Under glass: no wind; the hall's hum and announcements are the ambience.
    this.game.audio.setWind(0.04, this.indoors);
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(2.2 - this.indoors * 0.8);
    weapon.fillLight.color.setRGB(0.92, 0.96, 1.0);
    weapon.fillLight.intensity = 0.35 + this.indoors * 0.2;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    // Slowly along the hall at bridge height, looking down the train.
    const k = Math.sin(t * 0.03);
    cam.position.set(-14 + Math.sin(t * 0.05) * 3, 9 + Math.sin(t * 0.08), k * 30);
    cam.lookAt(2, 1.5, k * 30 - 24);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // Down through the glass roof over the far yard, along the train at roof height, over the aprons
    // into ALPHA's concourse.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(-20, 30, -70), new THREE.Vector3(-8, 12, -30), new THREE.Vector3(-5, 6, 0), new THREE.Vector3(-4, 4, 32), new THREE.Vector3(0, 2.8, BASE.z0 + 2)],
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, 2, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  setVisual(v4: boolean) {
    for (const g of this.hall.glass) g.visible = v4;
  }

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.dispose();
    game.renderer.renderer.shadowMap.autoUpdate = true;
    game.audio.setWind(0, 0);
  }

  debug() {
    const d = this.hall;
    return { nodes: d.nav.nodes.length, links: d.nav.links.length, drops: d.nav.drops.length, lights: d.lights.length, indoors: +this.indoors.toFixed(2), laneProblems: d.laneProblems.length };
  }
}
