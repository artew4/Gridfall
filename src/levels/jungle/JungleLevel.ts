import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { BASE, buildTerrainMesh, JUNGLE_EXTENT, JUNGLE_TERRAIN, TDM_YARD, roadX } from './Terrain';
import { buildBase, type BaseResult } from './Base';
import { buildFoliage, type FoliageResult } from './Foliage';
import { JungleIntro } from './JungleIntro';
import { dappleTexture, litterTexture } from './textures';
import { applyMud } from './Mud';
import { buildGodRays, type GodRays, type Shaft } from './GodRays';
import { damp } from '../../core/math';
import { BOAR_SHOTGUN } from '../../entities/weapons/shotgun';
import { JUNGLE_GUARDS } from '../../entities/enemies/paramilitary';

export const JUNGLE_INFO: LevelInfo = {
  id: 'jungle',
  name: 'DEEP JUNGLE',
  jp: '密林基地',
  blurb: 'A walled firebase under the rainforest canopy. Survival: fight up the road and breach the gate. 5v5 TDM: LZ Alpha against LZ North, round and through the compound.',
  modes: ['arcade', 'tdm'],
  loading: 'GROWING THE JUNGLE…',
  windowTitle: 'Gridfall — Deep Jungle',
  arsenal: { weapon: BOAR_SHOTGUN, enemies: JUNGLE_GUARDS },
  music: 'jungle_theme',
  tagline: 'BREACH THE GATE · CLEAR THE COMPOUND',
  jpLine: '密林 · 午前七時四十分',
  place: 'FIREBASE VIPER',
  clock: '07:40',
  cine: {
    arcade: { t1: 'GRIDFALL', t2: '密林基地 · DEEP JUNGLE', t3: 'ARCADE SURVIVAL · FIREBASE VIPER<br/>PUSH UP THE ROAD · BREACH THE GATE · CLEAR THE COMPOUND' },
    tdm: { t1: 'GRIDFALL', t2: '密林基地 · DEEP JUNGLE', t3: 'TEAM DEATHMATCH 5v5 · LZ ALPHA vs LZ NORTH<br/>THE GATE · THE BREACHES · THE CULVERT · THE JUNGLE' },
  },
};

/** Fog: humid teal-green air (3.7). Exp² density → the distance where it is 90% opaque. */
const FOG_DENSITY = 0.026;
const FOG_COLOR = '#5b766a';
/** 4.2: thicker, murkier green-grey air. */
const FOG_DENSITY_V4 = 0.03;
const FOG_COLOR_V4 = '#485a46';
const fog90 = (density: number) => Math.sqrt(Math.log(10)) / density;

/** Light, 3.7 → 4.2: less canopy fill, a harder sun, so the flecks and shafts stand out of the shade. */
const LIGHT = { legacy: { hemi: 1.1, sun: 6.5, env: 0.25 }, v4: { hemi: 0.8, sun: 7.5, env: 0.3 } };
/** 4.2 wet foliage: glossier and a touch metallic, more of the sky in them. */
const LEAF = { legacy: { roughness: 0.75, metalness: 0, envMapIntensity: 0.4 }, v4: { roughness: 0.45, metalness: 0.08, envMapIntensity: 0.9 } };

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
  /**
   * 4.2 "Oppressive jungle": the darks re-hued deep green-teal (multiplied, so they stay dark) and
   * crushed a little, a slight bleach in the mids so the greens go murky rather than lush, and a
   * sickly yellow-green push in the highlights (the sun flecks, the shafts, the wet sheen).
   * `legacy` is the 3.7 look (F8).
   */
  readonly look: LevelLook = {
    exposure: 1.0,
    bloom: { strength: 0.35, radius: 0.55, threshold: 0.95 },
    shadows: true,
    shadowTint: [0.0, 0.006, 0.004],
    grade: { split: 1, teal: [0, 0.006, 0.005], warm: [1.1, 1.14, 0.7], sat: 1.05, shadow: [0.55, 0.95, 0.74], lo: 0.07, hi: [0.08, 0.4], desat: 0.18, crush: 0.3, contrast: 0.14 },
    legacy: { exposure: 1.0, bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 }, shadows: true, shadowTint: [0.004, 0.009, 0.007] },
  };
  private mudOn = { value: 1 };
  private rays: GodRays;
  private cookies: { legacy: THREE.Texture; v4: THREE.Texture };
  flash = 0;
  private base: BaseResult;
  foliage: FoliageResult;
  private sun: THREE.SpotLight;
  private hemi: THREE.HemisphereLight;
  private env: THREE.WebGLRenderTarget;
  private envLegacy: THREE.WebGLRenderTarget;
  private cookie: { data: Uint8ClampedArray; w: number; h: number };
  /** How much direct sun is on the camera (0 in shade, 1 in a sun fleck), smoothed. */
  sunOnCam = 0;
  private _v = new THREE.Vector4();

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(FOG_COLOR_V4);
    game.col.terrain = JUNGLE_TERRAIN;
    game.fog.color.set(FOG_COLOR_V4);
    game.fog.density = FOG_DENSITY_V4;

    // Soft green light from the canopy, brown bounce off the forest floor.
    this.hemi = new THREE.HemisphereLight(0x9cbaa2, 0x3c3222, LIGHT.v4.hemi);
    s.add(this.hemi);
    // The sun, through the canopy: a far, narrow spotlight that projects a dapple pattern (a light
    // cookie) and casts static shadows (trunks, temple, logs). Nothing that casts them moves.
    const cookie = dappleTexture();
    this.cookie = { data: new Uint8ClampedArray(0), w: 1, h: 1 };
    this.readCookie(cookie);
    this.sun = new THREE.SpotLight(0xffefcf, LIGHT.v4.sun, 0, 0.6, 0.02, 0);
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

    const terrain = buildTerrainMesh(litterTexture());
    s.add(terrain);
    this.base = buildBase(s, game.col, game.glows);
    const quality = { power: 0.6, balanced: 1, high: 1.25 }[game.settings.quality];
    this.foliage = buildFoliage(s, game.col, this.base.trees, this.base.keepClear, this.base.spawns, game.fog.color, quality, this.base.interiors);
    for (const m of this.foliage.leaves) Object.assign(m, LEAF.v4);

    // 4.2 wet mud: the forest floor, the approach road (ruts) and the yard (vehicle tracks).
    applyMud(terrain.material as THREE.MeshStandardMaterial, this.mudOn, 'forest');
    applyMud((s.getObjectByName('road') as THREE.Mesh).material as THREE.MeshStandardMaterial, this.mudOn, 'road');
    applyMud((s.getObjectByName('yard') as THREE.Mesh).material as THREE.MeshStandardMaterial, this.mudOn, 'yard');

    // 4.2 light shafts: through the (invisible) canopy onto the watchtower, the yard and two giant
    // trees by the strip. The sun's dapple cookie gets a bright fleck where each one lands.
    const shafts = this.shaftSpots();
    this.rays = buildGodRays(s, this.sun.position, shafts, new THREE.Color(0.95, 1.0, 0.6).multiplyScalar(0.16));
    this.cookies = { legacy: cookie, v4: this.cookieWithSpots(cookie, shafts) };
    this.sun.map = this.cookies.v4;
    this.readCookie(this.cookies.v4);

    // Image-based light from the green canopy and the misty sky.
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    const sky = new THREE.Scene();
    sky.background = new THREE.Color('#6f8f7c');
    this.envLegacy = pmrem.fromScene(sky, 0.04);
    // 4.2: a yellower green (the wet mud and leaves reflect it; the 3.7 blue-green read as ice).
    sky.background = new THREE.Color('#6b7f5e');
    this.env = pmrem.fromScene(sky, 0.04);
    s.environment = this.env.texture;
    s.environmentIntensity = LIGHT.v4.env;
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
      // 9.0: Team Deathmatch, LZ ALPHA (south, round the assault's start) against LZ NORTH (behind the
      // compound). Survival never reads this: its spawns and flow are the 3.7 ones.
      tdm: {
        spawns: r.tdm.spawns,
        lanes: r.tdm.lanes,
        inBase: (team, p) => {
          const y = TDM_YARD[team];
          return p.x > y.x0 && p.x < y.x1 && p.z > y.z0 && p.z < y.z1;
        },
        start: { ...r.tdm.start, y: 0 },
      },
    };
    if (r.layoutProblems.length) console.warn('[jungle] layout problems', r.layoutProblems);
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
    // Enemies see as far as the fog lets you (the 4.2 fog: 51 m to 90%; 3.7 was 58 m).
    game.ctx.sightRange = fog90(FOG_DENSITY_V4) * 0.85;
    // 5.0: and not through the undergrowth (plants hide bodies; they don't stop rounds).
    game.ctx.concealment = (a, b) => this.foliage.concealment(a, b);
    game.weapon.setLights({ sky: 0xb4ccb4, ground: 0x4a3c28, hemi: 1.0, key: 0xffecc8, keyI: 1.6, rim: 0xa8d8c0, rimI: 0.45 });
    const r = game.renderer.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
  }

  startAudio() {
    this.game.audio.setAmbience('jungle');
  }

  /** Keeps the cookie's pixels for dappleAt (the sun on the camera, for the viewmodel's key light). */
  private readCookie(t: THREE.Texture) {
    const img = t.image as HTMLCanvasElement;
    this.cookie = { data: img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
  }

  /** Where the 4.2 light shafts land (ground points, radius, brightness). */
  private shaftSpots(): Shaft[] {
    const h = (x: number, z: number) => JUNGLE_TERRAIN.height(x, z);
    const out: Shaft[] = [
      { x: 13.6, y: 0, z: -0.4, r: 2.4, k: 1.0 }, // the watchtower's stair side
      { x: -4.5, y: 0, z: -4.5, r: 3.4, k: 0.9 }, // the middle of the yard, by the MG nest
      { x: 4.5, y: 0, z: -19, r: 2.6, k: 0.8 }, // the flag and the comms door
    ];
    // Two giant trees beside the cleared strip: the one nearest the road's last bend and one on the
    // west flank. The shaft lands just in front of the trunk (on the strip side).
    const giants = this.base.trees.filter((t) => t.giant);
    const used = new Set<number>();
    for (const [px, pz] of [[8, 24], [-40, -10]]) {
      let best = -1, bd = Infinity;
      giants.forEach((t, i) => {
        const d = Math.hypot(t.x - px, t.z - pz);
        if (!used.has(i) && d < bd) (best = i), (bd = d);
      });
      if (best < 0) continue;
      used.add(best);
      const t = giants[best];
      const a = Math.atan2(-14 - t.z, 0 - t.x);
      const x = t.x + Math.cos(a) * (t.flare + 2.2), z = t.z + Math.sin(a) * (t.flare + 2.2);
      out.push({ x, y: h(x, z), z, r: 2.8, k: 0.85 });
    }
    return out;
  }

  /** The dapple cookie with a soft bright fleck where each shaft lands (projected by the sun's own matrix). */
  private cookieWithSpots(base: THREE.Texture, shafts: Shaft[]) {
    const src = base.image as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    const v = new THREE.Vector4();
    const e = new THREE.Vector4();
    for (const s of shafts) {
      v.set(s.x, s.y, s.z, 1).applyMatrix4(this.sun.shadow.matrix);
      e.set(s.x + s.r, s.y, s.z, 1).applyMatrix4(this.sun.shadow.matrix);
      const u = v.x / v.w, t = v.y / v.w;
      const r = Math.max(3, Math.abs(e.x / e.w - u) * c.width);
      const x = u * c.width, y = (1 - t) * c.height;
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 1.1);
      grd.addColorStop(0, 'rgba(255,250,225,1)');
      grd.addColorStop(0.7, 'rgba(255,250,225,0.85)');
      grd.addColorStop(1, 'rgba(255,250,225,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r * 1.1, 0, Math.PI * 2);
      g.fill();
    }
    const t = base.clone();
    t.image = c;
    t.needsUpdate = true;
    return t;
  }

  /** DEV comparison (F8): the 4.2 grade's world half (fog, light, mud, wet leaves, shafts) or 3.7. */
  setVisual(v4: boolean) {

    const game = this.game;
    const fogC = v4 ? FOG_COLOR_V4 : FOG_COLOR;
    game.fog.color.set(fogC);
    (game.scene.background as THREE.Color).set(fogC);
    game.fog.density = v4 ? FOG_DENSITY_V4 : FOG_DENSITY;
    // The ground mist is tinted from the fog colour when it is built.
    this.foliage.group.traverse((o) => {
      if (o.name === 'mist') ((o as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uColor.value.set(fogC).multiplyScalar(1.15);
    });
    const L = v4 ? LIGHT.v4 : LIGHT.legacy;
    this.hemi.intensity = L.hemi;
    this.sun.intensity = L.sun;
    game.scene.environmentIntensity = L.env;
    const env = (v4 ? this.env : this.envLegacy).texture;
    game.scene.environment = env;
    game.weaponScene.environment = env;
    for (const m of this.foliage.leaves) Object.assign(m, v4 ? LEAF.v4 : LEAF.legacy);
    this.mudOn.value = v4 ? 1 : 0;
    this.rays.group.visible = v4;
    const ck = v4 ? this.cookies.v4 : this.cookies.legacy;
    this.sun.map = ck;
    this.readCookie(ck);
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
    this.rays.update(f.elapsed);
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

  createIntro(mode?: string): IntroLike {
    const st = mode === 'tdm' && this.data.tdm ? this.data.tdm.start : this.data.start;
    return new JungleIntro(new THREE.Vector3(st.x, 1.65, st.z), new THREE.Vector3(st.x - Math.sin(st.yaw) * 10, 2.6, st.z - Math.cos(st.yaw) * 10), roadX);
  }

  aboard() {
    return false;
  }

  reset() {}

  dispose() {
    const game = this.game;
    this.env.dispose();
    this.envLegacy.dispose();
    this.foliage.dispose();
    // The dapple cookie hangs off the light, not a material: disposeScene doesn't see it.
    this.cookies.legacy.dispose();
    this.cookies.v4.dispose();
    this.sun.map = null;
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
