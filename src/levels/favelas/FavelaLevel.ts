import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildFavela, type FavelaResult } from './Favela';
import { BAND, FAVELA_AI, FAVELA_TEAM_SIZE, FAVELA_TERRAIN, FAVELA_TICKETS, SPAWN_ZONES, X_E, Z_END, bandOf, bandY, inBase, laneOf, lanesOf } from './FavelaLayout';
import { Dust } from './Dust';
import { DesertIntro } from '../desert/DesertIntro';
import { fogRange } from '../../world/Visibility';
import { DESERT_MERCS } from '../../entities/enemies/mercs';

export const FAVELAS_INFO: LevelInfo = {
  id: 'favelas',
  name: 'FAVELAS',
  biome: 'favela',
  jp: 'MORRO DO SOL',
  blurb: 'A Rio hillside in the afternoon sun, 10v10: alleys between pastel houses, stairs up the hill, a layer of rooftops over it all.',
  modes: ['tdm'],
  loading: 'SUBINDO O MORRO…',
  windowTitle: 'Gridfall — Favelas',
  enemies: DESERT_MERCS,
  music: 'favela_theme',
  teamSize: FAVELA_TEAM_SIZE,
  tagline: 'THE STREET · THE ALLEYS · THE ROOFTOPS',
  jpLine: 'MORRO DO SOL · RIO · 15:20',
  place: 'MORRO DO SOL, RIO',
  clock: '15:20',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: 'MORRO DO SOL · FAVELAS', t3: 'TEAM DEATHMATCH 10v10 · ALPHA vs OMEGA<br/>A RUA · OS BECOS · AS LAJES' },
  },
};

/** The afternoon sun, high and from the sea in the west: it lights the faces of the houses up the hill. */
export const SUN_DIR = new THREE.Vector3(-0.46, 0.8, 0.22).normalize();
/** A warm haze: ~90% at 330 m (the map is 116 m long: everything stays crisp, the far hills soften). */
const HAZE = '#dce4e6';
const FOG_DENSITY = 0.0046;

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uZenith: { value: new THREE.Color('#3f86d0') }, uHorizon: { value: new THREE.Color(HAZE) }, uSunTint: { value: new THREE.Color('#fff2d2') } },
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
        c = mix(c, uSunTint, pow(s, 10.0) * 0.5);
        c += uSunTint * pow(s, 700.0) * 1.4;
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
 * Favelas (40.0): a sunny, dusty hillside for Team Deathmatch (the plan in FavelaLayout.ts). Daylight
 * as on Old Port, warmer: one strong sun with crisp static shadows, a blue sky that fills the shade, a
 * light haze, a grade that keeps the pastels; dust motes in the sun, kites over the hill.
 */
export class FavelaLevel implements LevelRuntime {
  readonly info = FAVELAS_INFO;
  data: LevelData;
  readonly look: LevelLook = {
    exposure: 1.02,
    bloom: { strength: 0.2, radius: 0.5, threshold: 1.4 },
    shadows: true,
    shadowTint: [0.006, 0.007, 0.014],
    grade: { split: 1, teal: [0.002, 0.005, 0.012], warm: [1.07, 1.01, 0.92], sat: 1.06, desat: 0.02, crush: 0.04, contrast: 0.07, hi: [0.25, 1.6], shadow: [0.92, 0.96, 1.06], lo: 0.12 },
  };
  flash = 0;
  favela: FavelaResult;
  private sun: THREE.DirectionalLight;
  private env: THREE.WebGLRenderTarget;
  private dust: Dust;

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(HAZE);
    game.col.terrain = FAVELA_TERRAIN;
    game.fog.color.set(HAZE);
    game.fog.density = FOG_DENSITY;
    s.add(skyDome());
    // A strong sky light: the shade of the alleys stays readable (0.95 left it near black).
    s.add(new THREE.HemisphereLight(0xc4dcf2, 0xb08c68, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 4.3);
    this.sun.position.copy(SUN_DIR).multiplyScalar(170);
    this.sun.target.position.set(0, 6, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -82;
    sc.right = sc.top = 82;
    sc.near = 20;
    sc.far = 380;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    s.add(this.sun, this.sun.target);

    this.favela = buildFavela(s, game.col);
    if (this.favela.laneProblems.length) console.warn('[favelas] nav nodes or lanes on blocked floor', this.favela.laneProblems);
    this.dust = new Dust(s, SUN_DIR);

    // Image-based light from the sky and a warm ground, once.
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyDome());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 24), new THREE.MeshBasicMaterial({ color: 0xa08a70 }));
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
    s.environmentIntensity = 0.6;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const d = this.favela;
    // ALPHA's player starts on the middle terrace of its yard, looking up the map.
    const start = { x: 0, z: 54, yaw: 0, y: bandY(2) };
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(BAND.x0 - 0.5, -Z_END - 0.5), new THREE.Vector2(X_E + 0.5, Z_END + 0.5)),
      floorMin: -0.5,
      nav: d.nav,
      spawns: d.survival,
      perches: [],
      coverPoints: [],
      cabinets: [],
      medkits: [],
      breakables: [],
      zoneAt: d.zoneAt,
      testGoals: d.testGoals,
      tdm: {
        spawns: d.spawns,
        zones: SPAWN_ZONES,
        lanes: { alpha: lanesOf('alpha'), omega: lanesOf('omega') },
        inBase: (team, p) => inBase(p, team),
        start,
        laneOf,
        laneNames: ['low (street)', 'middle', 'high (crest)'],
        tickets: FAVELA_TICKETS,
        arena: FAVELA_AI,
        // The rooftops: the patrols search them too (each band's E roofs, both halves; clear of the tanks).
        hvas: [0, 1, 2, 3, 4].flatMap((k) => [19.5, -19.5, 39, -39].map((z) => new THREE.Vector3(BAND.x0 + 20 * k + 18.4, bandY(k + 1), z))),
      },
    };
  }

  attach() {
    const game = this.game;
    game.ctx.sightRange = fogRange(FOG_DENSITY) * 0.9;
    game.weapon.setLights({ sky: 0xd4e4f4, ground: 0xa88c6c, hemi: 1.15, key: 0xfff0d8, keyI: 2.3, rim: 0xd6e6f4, rimI: 0.5 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('city-dry');
  }

  update(f: FrameInfo) {
    const t = f.elapsed;
    this.dust.update(t, this.game.camera);
    for (const k of this.favela.kites.children) {
      const h = k.userData.home as THREE.Vector3, ph = k.userData.phase as number;
      k.position.set(h.x + Math.sin(t * 0.31 + ph) * 3, h.y + Math.sin(t * 0.53 + ph * 2) * 1.6, h.z + Math.cos(t * 0.27 + ph) * 2.5);
      k.rotation.set(0.3 * Math.sin(t * 0.8 + ph), t * 0.05 + ph, 0.25 * Math.sin(t * 1.1 + ph));
    }
    this.game.audio.setWind(0.08, 0);
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(2.3);
    weapon.fillLight.color.setRGB(0.9, 0.92, 1.0);
    weapon.fillLight.intensity = 0.35;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.02 + 2.6;
    cam.position.set(Math.cos(a) * 70 - 10, 30 + Math.sin(t * 0.07) * 2, Math.sin(a) * 66);
    cam.lookAt(6, 6, 0);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // In from the sea over the street, up the escadaria and over the rooftops, round into ALPHA's terraces.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(-90, 28, -30), new THREE.Vector3(-46, 12, -6), new THREE.Vector3(-14, 14, 6), new THREE.Vector3(14, 22, 26), new THREE.Vector3(4, 10, 46), new THREE.Vector3(0, ey + 1, 57)],
      new THREE.Vector3(10, 8, 0),
      new THREE.Vector3(0, 6, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.dispose();
    game.renderer.renderer.shadowMap.autoUpdate = true;
    game.audio.setWind(0, 0);
  }

  debug() {
    const d = this.favela;
    return { nodes: d.nav.nodes.length, drops: d.nav.drops.length, houses: d.plan.houses.length, laneProblems: d.laneProblems.length, band: bandOf(this.game.player.pos.x) };
  }
}
