import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildOldPort, type OldPortResult } from './OldPort';
import { BASE, PORT_TERRAIN, QUAY_X, WH, X_W, Z_END, DOCK, OLDPORT_AI, OLDPORT_TEAM_SIZE, OLDPORT_TICKETS, LANE_STRICT, LANE_WEIGHTS, GANGWAY_HEADS, HIGH_GROUND, UNDER_HVAS, forwardOf, inBase, laneOf, lanesOf, navCost, SPAWN_PADS, SPAWN_ZONES } from './OldPortLayout';
import { hazeTexture, rippleNormalTexture } from './textures';
import { buildGodRays, type GodRays } from '../jungle/GodRays';
import { DesertIntro } from '../desert/DesertIntro';
import { damp } from '../../core/math';
import { fogRange } from '../../world/Visibility';
import { DESERT_MERCS } from '../../entities/enemies/mercs';

export const OLDPORT_INFO: LevelInfo = {
  id: 'oldport',
  name: 'OLD PORT',
  biome: 'docks',
  jp: 'СТАРЫЙ ПОРТ',
  blurb: 'A brick-and-concrete harbour on a clear morning, 7v7: the old warehouse, the container maze, the dry dock under scaffolds.',
  modes: ['tdm', 'arcade'],
  loading: 'OPENING THE OLD PORT…',
  windowTitle: 'Gridfall — Old Port',
  enemies: DESERT_MERCS,
  // 89.0: its own (a daylight track; the docks' neon one to 88.0).
  music: 'oldport_theme',
  teamSize: OLDPORT_TEAM_SIZE,
  tagline: 'THE WAREHOUSE · THE YARD · THE DRY DOCK',
  jpLine: 'СТАРЫЙ ПОРТ · ПРИЧАЛ 3 · 09:40',
  place: 'OLD PORT, BERTH 3',
  clock: '09:40',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: 'СТАРЫЙ ПОРТ · OLD PORT', t3: 'TEAM DEATHMATCH 7v7 · ALPHA vs OMEGA<br/>THE WAREHOUSE · THE YARD · THE DRY DOCK' },
    arcade: { t1: 'GRIDFALL', t2: 'СТАРЫЙ ПОРТ · OLD PORT', t3: 'ARCADE SURVIVAL · HOLD THE PORT<br/>THEY COME BY THE WAREHOUSE, THE YARD AND THE DOCK' },
  },
};

/** Late-morning sun over the sea (east, a little south): the warehouse's yard face is lit. */
export const SUN_DIR = new THREE.Vector3(0.58, 0.74, 0.34).normalize();
/** The haze: a pale, slightly warm horizon; ~90% at 245 m (the arena is 124 m long: the far end stays crisp). */
const HAZE = '#d3dbdf';
const FOG_DENSITY = 0.0062;

/** A sky dome: zenith blue to a pale horizon, a warm glow round the sun. No fog (it is the horizon). */
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uZenith: { value: new THREE.Color('#7fa6cc') }, uHorizon: { value: new THREE.Color(HAZE) }, uSunTint: { value: new THREE.Color('#fff1d6') } },
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
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c = mix(c, uSunTint, pow(s, 12.0) * 0.45);
        c += uSunTint * pow(s, 900.0) * 1.2;
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

/** A cloth flag on a pole: a small grid waved on the CPU (a few dozen vertices). */
class Flag {
  mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(scene: THREE.Scene, x: number, y: number, z: number, color: number, private phase: number, w = 1.6, h = 1.0) {
    const g = new THREE.PlaneGeometry(w, h, 8, 3);
    g.translate(w / 2, 0, 0);
    this.base = (g.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }
  update(t: number) {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.base[i * 3], by = this.base[i * 3 + 1];
      const k = bx / 1.6;
      pos.setXYZ(i, bx, by - k * k * 0.12, Math.sin(t * 3.1 + this.phase - bx * 2.2) * 0.16 * k + Math.sin(t * 5.3 + by * 3) * 0.03 * k);
    }
    pos.needsUpdate = true;
  }
}

/**
 * Old Port (17.1): a daytime harbour built for 5v5. The look is daylight done gently, the opposite of
 * the neon maps' high contrast: one sun with soft static shadows, a bright sky that fills the shade,
 * a pale haze, a neutral grade that keeps the brick warm and the concrete grey, and bloom only where
 * the sun glints. The weather is light: shafts through the warehouse's broken skylights, a haze over
 * the water, flags and the sea moving in a breeze.
 */
export class OldPortLevel implements LevelRuntime {
  readonly info = OLDPORT_INFO;
  data: LevelData;
  readonly look: LevelLook = {
    exposure: 1.0,
    bloom: { strength: 0.22, radius: 0.5, threshold: 1.35 },
    shadows: true,
    shadowTint: [0.004, 0.006, 0.012],
    // Neutral: a whisper of warmth in the light and of blue in the shade; no crush, low contrast.
    grade: { split: 1, teal: [0.002, 0.006, 0.012], warm: [1.04, 1.0, 0.95], sat: 0.96, desat: 0.06, crush: 0.04, contrast: 0.05, hi: [0.25, 1.6], shadow: [0.93, 0.97, 1.05], lo: 0.12 },
  };
  flash = 0;
  port: OldPortResult;
  private sun: THREE.DirectionalLight;
  private env: THREE.WebGLRenderTarget;
  private rays: GodRays;
  private ripples: THREE.Texture;
  private mist: THREE.Mesh[] = [];
  private flags: Flag[] = [];
  private indoors = 0;
  /** Bodies that went into the sea (the fence should make this 0; DEV counter). */
  drowned = 0;

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(HAZE);
    game.col.terrain = PORT_TERRAIN;
    game.fog.color.set(HAZE);
    game.fog.density = FOG_DENSITY;
    s.add(skyDome());

    // Light: a bright sky (it fills the shade: no black shadows), the sun with soft static shadows.
    s.add(new THREE.HemisphereLight(0xc2d4e8, 0x8f8070, 0.85));
    this.sun = new THREE.DirectionalLight(0xffeed6, 3.9);
    this.sun.position.copy(SUN_DIR).multiplyScalar(170);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -84;
    sc.right = sc.top = 84;
    sc.near = 20;
    sc.far = 360;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2;
    s.add(this.sun, this.sun.target);

    this.port = buildOldPort(s, game.col, SUN_DIR);
    if (this.port.laneProblems.length) console.warn('[oldport] nav nodes or lanes on blocked floor', this.port.laneProblems);

    // Sun shafts through the broken skylights onto the upper floor.
    this.rays = buildGodRays(s, SUN_DIR.clone().multiplyScalar(200), this.port.shafts, new THREE.Color(1.0, 0.94, 0.8).multiplyScalar(0.13), WH.eave + 0.4);

    // The sea: a ripple normal map scrolled per frame; the haze lying on the water in long sheets.
    this.ripples = rippleNormalTexture();
    this.ripples.repeat.set(140, 140);
    const wm = this.port.water.material as THREE.MeshStandardMaterial;
    wm.normalMap = this.ripples;
    wm.normalScale.set(0.35, 0.35);
    wm.needsUpdate = true;
    const haze = hazeTexture();
    for (let i = 0; i < 6; i++) {
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(520, 16),
        new THREE.MeshBasicMaterial({ map: haze, color: new THREE.Color(HAZE), transparent: true, opacity: 0.42 - i * 0.03, depthWrite: false, fog: true }),
      );
      sheet.position.set(QUAY_X + 40 + i * 45, 2.5 + i * 1.2, (i % 2 ? -1 : 1) * 30);
      sheet.rotation.y = -Math.PI / 2;
      sheet.userData.soft = true;
      sheet.raycast = () => {};
      sheet.name = 'mist';
      s.add(sheet);
      this.mist.push(sheet);
    }
    // Flags in the breeze: the harbour office, the ship's mast, the yards.
    this.flags.push(new Flag(s, 31.27, 9.0, 0, 0x8a5048, 0, 1.4, 0.8));
    for (const z of [1, -1]) this.flags.push(new Flag(s, 40.3, 6.0, 30.25 * z, 0x5d7488, z, 1.6, 1.0));

    // Image-based light from the sky and a warm-grey ground, once (for steel, glass and the sea).
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyDome());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 24), new THREE.MeshBasicMaterial({ color: 0x8e8a82 }));
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
    s.environmentIntensity = 0.4;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    const d = this.port;
    for (const pole of this.flags) pole.mesh.updateMatrixWorld();
    const start = { x: 0, z: 57.4, yaw: 0, y: 0 };
    const open = (p: THREE.Vector3) => !game.col.blocked(p, 0.6);
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(X_W - 0.5, -Z_END - 0.5), new THREE.Vector2(QUAY_X + 0.5, Z_END + 0.5)),
      floorMin: DOCK.floor - 0.5,
      nav: { ...d.nav, cost: navCost },
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
        // 27.0: spawn pads anywhere on the map (SpawnManager); the yards above stay for the 'bases' A/B.
        pads: SPAWN_PADS,
        // 31.0: the deployment zones (the default spawning since 31.0; the pads above are the DEV A/B).
        zones: SPAWN_ZONES,
        // 41.0: the spawns' and fireteams' local area (narrow: quays, an alley and a yard between container stacks).
        spawnTuning: { densityR: 7 },
        lanes: { alpha: lanesOf('alpha'), omega: lanesOf('omega') },
        inBase: (team, p) => inBase(p, team),
        start,
        laneOf,
        laneNames: ['warehouse', 'yard', 'dock'],
        // 23.0: 7v7, 50 tickets, forward respawns, the port's AI (OldPortLayout).
        tickets: OLDPORT_TICKETS,
        laneWeights: LANE_WEIGHTS,
        laneStrict: LANE_STRICT,
        arena: OLDPORT_AI,
        // 37.0: UNDER THE HULL's corners, searched by the patrols; 37.1: the deck at the gangways' heads.
        hvas: [...UNDER_HVAS, ...GANGWAY_HEADS].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        // 37.1: the ship's bridge: patrolled, and one bot of each team posted to it at a time (the gangway heads above: patrolled).
        highGround: { ...HIGH_GROUND, points: HIGH_GROUND.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)) },
        forward: { points: { alpha: forwardOf('alpha').filter(open), omega: forwardOf('omega').filter(open) }, safe: 22, sight: 45 },
      },
    };
  }

  attach() {
    const game = this.game;
    game.ctx.sightRange = fogRange(FOG_DENSITY) * 0.9;
    game.weapon.setLights({ sky: 0xd0e0f0, ground: 0x9a8a74, hemi: 1.1, key: 0xfff0dc, keyI: 2.2, rim: 0xcfe0f0, rimI: 0.5 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('harbour');
  }

  private inside(p: THREE.Vector3) {
    return this.port.covered.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y > r.y0 && p.y < r.h);
  }

  update(f: FrameInfo) {
    const game = this.game;
    const t = f.elapsed;
    this.rays.update(t);
    this.ripples.offset.set(t * 0.004, t * 0.0025);
    for (let i = 0; i < this.mist.length; i++) this.mist[i].position.z = Math.sin(t * 0.02 + i * 1.7) * 40;
    for (const fl of this.flags) fl.update(t);
    this.indoors = damp(this.indoors, this.inside(f.camPos) ? 1 : 0, 6, f.rawDt);
    game.audio.setWind(0.12, this.indoors);
    this.drown();
  }

  /** Backstop behind the sea fence: anything in the harbour drowns. */
  private drown() {
    const game = this.game;
    const edge = QUAY_X + 0.4;
    if (game.player.alive && game.player.pos.x > edge) {
      this.drowned++;
      game.ctx.damagePlayer(1000, game.player.pos.clone());
    }
    if (game.mode !== 'tdm') return;
    for (const b of game.tdm.bots) {
      if (b.alive && b.pos.x > edge) {
        this.drowned++;
        b.hurt(10000, b.pos.clone(), null);
      }
    }
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(2.2 - this.indoors * 0.9);
    weapon.fillLight.color.setRGB(0.85, 0.9, 1.0);
    weapon.fillLight.intensity = 0.35;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.022 + 0.6;
    cam.position.set(Math.cos(a) * 46 + 4, 26 + Math.sin(t * 0.08) * 2, Math.sin(a) * 58);
    cam.lookAt(-2, 3, 0);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // In from the sea over the crane, down the dry dock and over the yard into ALPHA's yard.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(80, 30, -46), new THREE.Vector3(40, 16, -14), new THREE.Vector3(24, 8, 10), new THREE.Vector3(6, 7, 34), new THREE.Vector3(0, 2.8, BASE.z0 + 2)],
      new THREE.Vector3(30, 2, 0),
      new THREE.Vector3(0, 2, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  setVisual(v4: boolean) {
    this.rays.group.visible = v4;
    for (const m of this.mist) m.visible = v4;
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
    const d = this.port;
    return { nodes: d.nav.nodes.length, drops: d.nav.drops.length, shafts: d.shafts.length, indoors: +this.indoors.toFixed(2), drowned: this.drowned, laneProblems: d.laneProblems.length };
  }
}
