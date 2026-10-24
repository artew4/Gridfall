import { viewBasis } from '../player/Recoil';
import * as THREE from 'three';
// 25.0: patches three's fog chunks (ground fog) before any material compiles.
import '../world/HeightFog';
import { Renderer, type Pipeline } from './Renderer';
import { Input } from './Input';
import { InteractionController, type Interactable } from './Interaction';
import { StaticBuilder } from '../world/Builder';
import { FramePacer, PRESETS, effectiveCap } from './Performance';
import { LightPool } from './LightPool';
import { KEYS } from './Bindings';
import { clamp, damp, lerp, rand } from './math';
import { disposeScene } from './dispose';
import { AudioEngine } from '../audio/AudioEngine';
import { MusicManager } from '../audio/music/MusicManager';
import { CollisionWorld, type RayHit } from '../world/Collision';
import { Glows } from '../world/Glows';
import type { Zone } from '../world/Zones';
import { Effects } from '../combat/Effects';
import { Interactives } from '../gameplay/Interactives';
import { Player } from '../player/Player';
import { SafetyNet } from '../player/SafetyNet';
import { Weapon } from '../player/Weapon';
import { Projectiles } from '../enemies/Projectiles';
import { Nav } from '../enemies/Nav';
import { Waves } from '../enemies/Waves';
import type { Enemy, EnemyCtx, EnemyHit } from '../enemies/Enemy';
import { Hud } from '../ui/Hud';
import { fl, flWave, setBiome } from '../ui/Flavor';
import { MenuStage, STAGE_PIXEL_RATIO } from '../ui/MenuStage';
import { PauseMenu } from '../ui/PauseMenu';
import { loadSettings, saveSettings, type Settings } from '../ui/Settings';
import { StoryHud } from '../ui/StoryHud';
import { EndScreen } from '../ui/EndScreen';
import type { IntroLike, LevelRuntime, Mode, ModeRules, SettingId } from '../levels/Level';
import { LEVELS, LEVEL_ORDER, levelEntry } from '../levels/registry';
import { ArcadeRules } from '../levels/Arcade';
import { TdmRules } from '../levels/Tdm';
import { TdmHud, TdmScreen, type TdmLine } from '../ui/TdmHud';
import { Countdown } from '../ui/Countdown';
import { LoadingScreen } from '../ui/LoadingScreen';
import { warmUp } from './Warmup';
import type { TeamId } from '../combat/Team';
import { TokyoLevel } from '../levels/tokyo/TokyoLevel';
import { BarkView } from '../ui/BarkView';
import { nearMissDose } from '../enemies/tactics/Squad';
import { buildCoverSpots } from '../enemies/tactics/CoverSpots';
import { PlayerUnit, registerUnit } from '../combat/PlayerUnit';
import type { Combatant } from '../combat/Team';
import { ARMORY, armoryByKey, type WeaponId } from '../entities/weapons/armory';
import { gunThemeFor } from '../entities/weapons/theme';
import { Loadout } from '../gameplay/Loadout';
import { SpawnZone } from '../gameplay/SpawnZone';
import { LoadoutView } from '../ui/LoadoutView';
import { cleanName, loadName, saveName } from '../gameplay/PlayerName';
import { menuStep, nextMaps, type MenuEvent, type MenuState } from '../ui/MenuFlow';
import { WEIGHT, weightOf } from '../combat/Stamina';

export type { Mode };

/** 13.0: 'loading' is a map change from a result screen (the old level going, the next one building). */
type State = 'title' | 'intro' | 'play' | 'paused' | 'dead' | 'ending' | 'loading';

/** Something the player can use with E when close and facing it. */
export type { Interactable };

const SETTING_KEY = 'gridfall.setting';
const OLD_SETTING_KEY = 'neonrain.setting'; // before 10.0
const _mantleXZ = new THREE.Vector2();
/** 44.0: the next frame painted (the loading screen's step shows before the next synchronous one). */
const paint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** The menu's last chosen setting (per browser; separate from the audio/graphics settings). */
function savedSetting(): SettingId {
  const url = new URLSearchParams(location.search).get('setting');
  let id: string | null = url;
  if (!id) {
    try {
      id = localStorage.getItem(SETTING_KEY) ?? localStorage.getItem(OLD_SETTING_KEY);
    } catch {
      /* storage blocked */
    }
  }
  return id && id in LEVELS ? (id as SettingId) : 'tokyo';
}

/**
 * The engine: frame pacing, the state machine (title, intro, play, paused, dead, ending), pointer
 * lock and pause, the player, the weapon and shooting, survival waves and the enemy context, the HUD.
 * Everything about a particular place (geometry, lights, weather, its story) is the loaded level's;
 * every level gets a fresh scene and collision world, and a switch frees the previous one.
 */
export class Game {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 500);
  weaponScene = new THREE.Scene();
  weaponCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
  /** One fog for every level; the level sets its colour and density. */
  fog = new THREE.FogExp2(0x0d0b19, 0.022);
  time = { value: 0 };
  renderer: Renderer;
  input: Input;
  audio = new AudioEngine();
  /** 9.0: one named track at a time (menu, then the setting's), crossfaded; files or procedural. */
  music = new MusicManager(this.audio);
  col = new CollisionWorld();
  glows = new Glows();
  hud: Hud;
  menu: PauseMenu;
  settings: Settings;
  state: State = 'title';
  mode: Mode = ((m) => (m === 'arcade' || m === 'tdm' ? m : 'story'))(new URLSearchParams(location.search).get('mode'));
  /** The loaded setting and its runtime. */
  setting: SettingId = 'tokyo';
  level!: LevelRuntime;
  private rules!: ModeRules;
  private arcade = new ArcadeRules(this);
  /** Team Deathmatch (6.0): its rules, score HUD and result screen. */
  tdm = new TdmRules(this);
  tdmHud: TdmHud;
  /** 36.0: TDM's pre-match countdown (3, 2, 1, START!). */
  countdown: Countdown;
  /** 44.0: the loading screen (boot, a map change, a deploy's warm-up). */
  readonly loadingScreen = new LoadingScreen(document.body);
  /** 44.0: a load is building or warming up between frames: the loop draws and simulates nothing. */
  private building = false;
  /** 44.0 (DEV): the last warm-up (textures uploaded, programs compiled, ms). */
  lastWarmup: { textures: number; programs: number; ms: number } | null = null;
  tdmScreen: TdmScreen;
  /** 13.0: the weapon he carries and the one he asked for next (every mode but the story), and its picker. */
  loadout = new Loadout();
  loadoutView: LoadoutView;
  private loadoutKey = '';
  /** 23.0: the spawn area of the current life (the weapon swap). */
  readonly spawnZone = new SpawnZone();
  /** 13.0: his name (main menu), on the HUD, the minimap, the feed and the scoreboard. 17.0: a random handle until one is typed. */
  playerName = loadName();
  /** 17.0: this boot's name, what an emptied field falls back to. */
  private bootName = this.playerName;
  /** 13.0: the main menu's state (MenuFlow): root, the maps of a mode, controls. */
  private menuState: MenuState = { screen: 'root', mode: null, map: null };
  /** The player is dead and the mode will respawn him (no death screen). */
  private respawning = false;
  private stateBeforePause: State = 'play';
  endScreen: EndScreen;
  interactables: Interactable[] = [];
  private interaction = new InteractionController();
  /** Why the run ended (death screen title). */
  failReason = '';
  storyHud: StoryHud;

  fx!: Effects;
  interactives!: Interactives;
  player!: Player;
  /** The player as a combatant (his team, his damage path); what enemies perceive and target. */
  playerUnit!: PlayerUnit;
  /** Spawn protection: damage before this sim time is ignored. */
  playerInvulnUntil = -Infinity;
  /** Who hurt him last (TDM kill credit). */
  playerAttacker: Combatant | null = null;
  /** Out-of-bounds / stuck recovery; a fallback only, see SafetyNet. */
  safety!: SafetyNet;
  weapon!: Weapon;
  projectiles!: Projectiles;
  nav!: Nav;
  waves = new Waves();
  barkView!: BarkView;
  private intro: IntroLike | null = null;
  private occupied = new Set<THREE.Vector3>();
  private muzzleLight!: THREE.PointLight;
  private muzzleT = 0;
  private damageFx = 0;
  timeScale = 1;
  private deadT = 0;
  stats = { shots: 0, hits: 0, start: 0 };
  private clock = new THREE.Timer();
  private pacer = new FramePacer();
  /** The next drawn frame starts the clock afresh (after a pause, a hidden tab, a stall). */
  private freshClock = true;
  elapsed = 0;
  private ready = false;
  /** A level is being built (menu waits). */
  private loading = false;
  /** 16.0: the main menu's 3D stage, alive only on the menu's root and controls screens (syncStage). */
  private stage: MenuStage | null = null;
  /** The loaded level's ambience and loops are playing. */
  private levelAudio = false;
  ctx!: EnemyCtx;
  private zone: Zone | null = null;
  private zoneCandidate: Zone | null = null;
  private zoneT = 0;
  private perf = { acc: 0, frames: 0, fps: 60, lowT: 0, highT: 0 };
  /** 17.0: the loaded level's point lights share the preset's budget of real ones. */
  lightPool: LightPool | null = null;
  private tmpHit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

  constructor(container: HTMLElement) {
    this.scene.fog = this.fog;
    this.camera.position.set(-1.5, 0.6, 42);
    this.camera.lookAt(0, 3, 20);
    this.weaponScene.add(this.weaponCamera);
    this.renderer = new Renderer(container, this.scene, this.camera, this.weaponScene, this.weaponCamera);
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(document.body);
    this.storyHud = new StoryHud(document.body);
    this.barkView = new BarkView(document.body);
    this.tdmHud = new TdmHud(document.body);
    this.countdown = new Countdown(document.body);
    this.tdmScreen = new TdmScreen(document.body);
    // Callouts: the line above the speaker and its voice from where it stands (both TDM teams too).
    for (const sq of [this.waves.squad, this.tdm.squads.alpha, this.tdm.squads.omega])
      sq.barks.onBark = (e) => {
        this.barkView.add(e);
        this.audio.callout(e.speaker.pos.clone().setY(e.speaker.pos.y + 1.6), e.speaker.look.voice, e.text.split(/\s+/).length, e.kind === 'go' || e.kind === 'contact');
      };
    this.storyHud.show(false);
    this.loadoutView = new LoadoutView(document.body);
    this.loadoutView.onPick = (id) => this.pickWeapon(id);
    this.tdm.playerArm = () => this.loadout.entry.bot;
    this.endScreen = new EndScreen(document.body);
    this.settings = loadSettings();
    this.menu = new PauseMenu(document.body, this.settings);
    this.applySettings();
    this.renderer.grade.uniforms.uFade.value = 1;
  }

  /** The Tokyo level (story systems); only valid while TokyoNight is loaded. */
  get tokyo(): TokyoLevel {
    if (!(this.level instanceof TokyoLevel)) throw new Error('TokyoNight is not the loaded level');
    return this.level;
  }

  async init() {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts API unavailable: fall back silently */
    }
    this.hud.setLevels(LEVEL_ORDER.map((id) => levelEntry(id).info));
    this.hud.nameInput.value = this.playerName;
    const first = savedSetting();
    this.hud.selectLevel(levelEntry(first).info, true);
    // 44.0: the boot loads behind the loading screen (the level built, then warmed up).
    const info = levelEntry(first).info;
    this.loadingScreen.show('GRIDFALL', info.name);
    this.loadingScreen.set(0.03, 'ENGINE');
    await paint();
    this.buildEngine();
    await this.loadLevelShown(first, 0.05);
    this.ready = true;
    this.applyGraphics();
    this.hud.setReady();
    this.hud.selectLevel(this.level.info, false);
    this.bindUi();
    this.hud.setArmory(this.loadout.queued);
    this.syncStage();
    this.startLoop();
    this.bindPower();
  }

  /** The display-refresh callback: draws only when the frame cap and the game state call for it. */
  private startLoop() {
    this.pacer.reset();
    this.freshClock = true;
    this.renderer.renderer.setAnimationLoop((now) => {
      const st = this.state !== 'ending' ? this.state : !this.endScreen.root.classList.contains('hidden') ? 'endcard' : !this.tdmScreen.root.classList.contains('hidden') ? 'results' : this.state;
      if (!this.pacer.tick(now, effectiveCap(this.settings.fps, st, document.hasFocus()))) return;
      this.frame();
    });
  }

  /**
   * Hidden tab: no drawing, no simulation, audio suspended; a game in progress is paused and stays
   * paused (behind the menu) until the player resumes it.
   */
  private bindPower() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'play' || this.state === 'intro') this.pause();
        this.renderer.renderer.setAnimationLoop(null);
        this.audio.setSuspended(true);
        this.music.setSuspended(true);
      } else {
        this.audio.setSuspended(false);
        this.music.setSuspended(false);
        this.startLoop();
      }
    });
  }

  /** Graphics preset: resolution ceiling, bloom, decorative lights. The frame cap is its own setting. */
  private applyGraphics() {
    const p = PRESETS[this.settings.quality];
    const r = this.renderer;
    r.maxPixelRatio = Math.min(window.devicePixelRatio, p.pixelRatio);
    r.renderer.setPixelRatio(r.allowedPixelRatio);
    r.resize();
    r.setBloomLevels(p.bloomLevels);
    // A new light budget: new slots (the shaders recompile once, here rather than mid-fight).
    if (this.lightPool && this.lightPool.budget !== p.lights) {
      this.lightPool.dispose();
      this.lightPool = new LightPool(this.scene, p.lights);
      r.compile(this.scene, this.camera);
    }
    if (this.level instanceof TokyoLevel) for (const g of this.level.signs) if (g.light) g.light.visible = p.signLights;
    this.perf.lowT = this.perf.highT = 0;
  }

  /**
   * Render pipeline (DEV comparison, F8 in DevTools): 4.0 (the composer with the 4.0 look), RAW (the
   * same world and materials straight to the canvas, no composer: what the post chain costs) or 3.7
   * (the composer and materials as they were in 3.7). Recompiles once per switch.
   */
  setPipeline(p: Pipeline) {
    this.renderer.setPipeline(p);
    this.level.setVisual?.(p !== 'v37');
    this.renderer.compile(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ engine and levels
  /** What lives across levels: the viewmodel and the survival callbacks. */
  private buildEngine() {
    this.weapon = new Weapon(this.weaponScene, this.weaponCamera, this.audio);
    this.waves.onWaveStart = (n) => {
      this.hud.bannerShow(`WAVE ${String(n).padStart(2, '0')}`, flWave(n));
      this.audio.waveStart();
    };
    this.waves.onWaveClear = (n) => {
      this.hud.bannerShow('CLEAR', `${flWave(n)} · ${fl('cleared')}`, 2.4);
      this.audio.waveClear();
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 35);
    };
    this.waves.onSpawn = (e, at) => {
      if (e.kind === 'gunner') this.audio.clang(at.clone().setY(at.y + 1.5), 0.7);
    };
  }

  /**
   * Builds a setting into a fresh scene and collision world: the level's world first, then the
   * engine's per-level systems on its data (player, nav, survival spawns, pickups, enemy context),
   * then the level's own systems. Frees the previous level first.
   */
  loadLevel(id: SettingId) {
    for (const _ of this.buildLevel(id));
    // Compile everything up front so the first shot doesn't hitch.
    this.renderer.compile(this.scene, this.camera);
    this.levelUp();
  }

  /**
   * 44.0: the build in steps, each yielding how far it is (0..1), what comes next and how many seconds
   * that will take without a paint (the bar creeps on through it); `loadLevel` runs it at once.
   */
  private *buildLevel(id: SettingId): Generator<{ f: number; what: string; creep?: number }> {
    if (this.level) this.unloadLevel();
    yield { f: 0.08, what: 'BUILDING THE WORLD', creep: 2.5 };
    if (import.meta.env.DEV) StaticBuilder.registry = [];
    this.scene = new THREE.Scene();
    this.scene.fog = this.fog;
    this.renderer.setScene(this.scene);
    this.col = new CollisionWorld();
    this.glows = new Glows();
    this.interactables = [];
    this.occupied.clear();
    const s = this.scene;

    this.fx = new Effects(s, this.fog);
    // 8.1: brass lands on the real floor (terrain, catwalks, roofs), looked up twice per casing.
    this.fx.casings.floorAt = (x, z, y) => this.col.groundHeightAt(x, z, 0.02, y, 0.3);
    this.fx.onShellBounce = (p, k) => this.audio.shellBounce(p, k);
    this.weapon.setLights(null);
    const level = levelEntry(id).create(this);
    this.level = level;
    this.setting = id;
    // 16.0: the UI's flavor script follows the place (before the HUD's weapon label is set).
    setBiome(level.info.biome);
    const d = level.data;

    this.interactives = new Interactives(s, this.glows, this.fx, this.audio, d.cabinets, d.medkits, d.breakables);
    this.interactives.onKill = () => this.waves.kills++;
    this.glows.buildHalos(s);

    this.muzzleLight = new THREE.PointLight(0xffa860, 0, 14, 2);
    this.muzzleLight.userData.unpooled = true;
    s.add(this.muzzleLight);

    this.player = new Player(this.col, this.audio);
    this.player.reset(d.start.x, d.start.z, d.start.yaw, d.start.y ?? 0);
    this.playerUnit = new PlayerUnit(this.player, { name: this.playerName });
    this.playerUnit.onHurt = (dmg, from, by) => this.damagePlayer(dmg, from, by);
    this.playerUnit.isReloading = () => this.weapon.reloading;
    registerUnit(this.player, this.playerUnit);
    this.safety = new SafetyNet({
      bounds: d.bounds,
      floorMin: d.floorMin,
      blocked: (p, r) => this.col.blocked(p, r),
      designed: (p) => d.zoneAt(p.x, p.y, p.z) !== null,
      aboard: (p) => level.aboard(p),
    });
    this.safety.reset(this.player.pos);
    // 43.0: a ledge grab lands inside the playable extent only.
    this.player.mantleOk = (p) => d.bounds.containsPoint(_mantleXZ.set(p.x, p.z));
    // 13.0: the weapon is the player's (the loadout; the story's own in story mode), not the level's;
    // the level gives the survival enemies' look (and their rounds).
    this.armPlayer();
    this.waves.look = level.info.enemies;
    this.projectiles = new Projectiles(s, this.col, this.fx, this.audio, level.info.enemies);
    this.projectiles.onPlayerHit = (dmg, from, by) => {
      this.waves.squad.player.pressureT = this.playerUnit.pressureT = this.elapsed;
      this.damagePlayer(dmg, from, by);
    };
    // A round cracking past him counts as pressure too (the rushers' opening).
    this.projectiles.onWhiz = () => (this.waves.squad.player.pressureT = this.playerUnit.pressureT = this.elapsed);
    yield { f: 0.6, what: 'NAVIGATION', creep: 0.6 };
    this.nav = new Nav(this.col, d.nav);

    // Only spawn on open ground that the nav graph can reach: never inside walls or off-map.
    this.waves.spawns = d.spawns.filter((p) => {
      const ok = !this.col.blocked(p, 0.5) && Math.abs(this.col.groundHeightAt(p.x, p.z, 0.3, p.y + 0.1) - p.y) < 0.05 && this.nav.nearestVisible(new THREE.Vector3(p.x, p.y + 1, p.z)) >= 0;
      if (!ok) console.warn(`[${id}] rejected spawn`, p.toArray());
      return ok;
    });
    this.waves.perches = d.perches;

    this.ctx = {
      scene: s,
      player: this.player,
      col: this.col,
      audio: this.audio,
      fx: this.fx,
      nav: this.nav,
      projectiles: this.projectiles,
      time: 0,
      difficulty: 0,
      coverPoints: d.coverPoints,
      occupied: this.occupied,
      enemies: this.waves.enemies,
      bounds: d.bounds,
      perches: d.perches,
      squad: this.waves.squad,
      damagePlayer: (dmg, f) => this.damagePlayer(dmg, f),
      fog: this.fog,
    };
    yield { f: 0.7, what: 'COVER AND LANES', creep: 0.8 };
    level.attach();
    // Authored spots plus spots round every waist-high solid (dynamic cover needs all sides), once
    // the level's whole collision world exists.
    this.ctx.coverPoints = buildCoverSpots(this.col, this.nav, d.coverPoints, d.bounds);
    this.rules = this.arcade;

    document.title = level.info.windowTitle;
    this.renderer.setLook(level.look);
    level.setVisual?.(this.renderer.pipeline !== 'v37');
    this.hud.setPlace(level.info.place, level.info.clock);
    // 17.0: the level's point lights behind the preset's budget of real ones (before the compile).
    this.lightPool = new LightPool(s, PRESETS[this.settings.quality].lights);
    if (this.ready) this.applyGraphics();
    yield { f: 0.85, what: 'TEXTURES' };
  }

  /** The level is built (and compiled or warmed up): its sounds, the menu's stage back over it. */
  private levelUp() {
    this.levelAudio = false;
    this.startLevelAudio();
    // A level built while the menu's stage is up (the boot, back to a menu): the stage stays on screen.
    if (this.stage) this.showStage();
  }

  /**
   * 44.0: build `id` behind the loading screen (already shown, or shown now with the map's name), from
   * `from` of the bar: the steps, then the warm-up (Warmup.ts). The loop is held throughout. `hide`:
   * the screen goes when done (a deploy keeps it up for the match's warm-up).
   */
  private async loadLevelShown(id: SettingId, from = 0, hide = true, to = 1) {
    const L = this.loadingScreen;
    if (!L.active) {
      const info = levelEntry(id).info;
      L.show(info.name, info.jp);
    }
    this.building = true;
    const span = (to - from) * 0.75;
    try {
      for (const p of this.buildLevel(id)) {
        L.set(from + span * p.f, p.what, p.creep);
        await paint();
      }
      await this.warm(from + span, to);
    } finally {
      this.building = false;
      this.freshClock = true;
    }
    this.levelUp();
    if (hide) await L.hide();
  }

  /** 44.0: warm the world and the viewmodel up (Warmup.ts), the bar from `from` to `to`. */
  private async warm(from: number, to: number) {
    const L = this.loadingScreen;
    const what = { textures: 'TEXTURES', shaders: 'SHADERS', scene: 'WARMING UP' } as const;
    const was = this.building;
    this.building = true;
    try {
      this.lastWarmup = await warmUp(
        this.renderer.renderer,
        [
          { scene: this.scene, camera: this.camera },
          { scene: this.weaponScene, camera: this.weaponCamera },
        ],
        (f, w) => L.set(from + (to - from) * f, what[w]),
        this.renderer.offscreen,
      );
    } finally {
      this.building = was;
      this.freshClock = true;
    }
  }

  /** Frees the loaded level: its enemies, sounds, DOM, GPU resources. */
  private unloadLevel() {
    this.intro?.dispose();
    this.intro = null;
    // 13.0: TDM's per-level things (the minimap's plan, the team contexts on the old world).
    this.tdm.dropLevel();
    this.waves.reset(this.scene);
    this.barkView.clear();
    this.projectiles.clear();
    this.fx.clear();
    this.lightPool?.dispose();
    this.lightPool = null;
    this.level.dispose();
    this.audio.clearLevel();
    this.levelAudio = false;
    disposeScene(this.scene, this.scene);
    this.weaponScene.environment = null;
    this.renderer.renderer.renderLists.dispose();
    this.interactables = [];
  }

  private startLevelAudio() {
    if (this.levelAudio || !this.audio.started) return;
    this.levelAudio = true;
    this.level.startAudio();
  }

  /** Menu: pick a setting (builds it behind the title, keeps the choice). */
  private async selectSetting(id: SettingId) {
    if (this.loading || id === this.setting || !LEVELS[id]) return;
    this.loading = true;
    this.hud.selectLevel(levelEntry(id).info, true);
    // 44.0: built and warmed up behind the loading screen.
    try {
      await this.loadLevelShown(id);
    } finally {
      this.loading = false;
    }
    this.hud.selectLevel(this.level.info, false);
    this.rememberSetting(id);
  }

  private rememberSetting(id: SettingId) {
    try {
      localStorage.setItem(SETTING_KEY, id);
    } catch {
      /* storage blocked: the choice lasts this session */
    }
  }

  /** 13.0: a main-menu event through the state machine; builds the picked map behind the menu. */
  private menuEvent(e: MenuEvent) {
    this.menuState = menuStep(this.menuState, e, LEVEL_ORDER.map((id) => levelEntry(id).info), this.setting);
    this.hud.renderMenu(this.menuState);
    // Leaving the root for the maps destroys the stage before the map (maybe a new one) is built.
    this.syncStage();
    const want = this.menuState.map;
    if (this.menuState.screen === 'maps' && want && want !== this.setting) void this.selectSetting(want);
  }

  // ------------------------------------------------------------------ loadout (13.0)
  /** The weapon for the mode about to be played: the story's own, else the loadout's. */
  private armPlayer() {
    const story = this.mode === 'story' ? this.level.info.storyWeapon : undefined;
    if (!story) this.loadout.commit();
    const id = story ?? this.loadout.current;
    const spec = ARMORY[id].spec;
    // 21.0: the gun wears the map's finish, and handles as itself.
    this.weapon.setSpec(spec, gunThemeFor(this.setting));
    this.player.gun = spec.handling;
    // 30.0: what it weighs sets the sprint (Stamina.ts).
    this.player.stamina.profile = WEIGHT[weightOf(spec.sound)];
    this.hud.setWeapon(spec.name, fl(id), spec.mag, this.weapon.lowAmmo);
  }

  /**
   * When the picker is up: 'swap' (the match intro, the first seconds of a life: the cards; a pick
   * changes the gun at once), 'zone' (23.0: still in the spawn area: a one-line prompt, a pick still
   * swaps) or 'queue' (TDM, waiting to respawn: for the next life); else null.
   */
  private loadoutPhase(): 'swap' | 'zone' | 'queue' | null {
    if (this.mode === 'story' || this.loading) return null;
    if (this.state === 'intro') return 'swap';
    // 36.0: the countdown before a match: the full picker, whatever the spawn area's clock says.
    if (this.state === 'play' && this.player.alive && this.player.held) return 'swap';
    if (this.state === 'play' && this.player.alive) {
      const z = this.spawnZone.update(this.player.pos, this.elapsed, this.stats.shots);
      return z === 'cards' ? 'swap' : z === 'prompt' ? 'zone' : null;
    }
    // 29.0: not when he is out of the match (no respawn coming: he is spectating).
    if (this.state === 'dead' && this.respawning && this.rules === this.tdm && !this.tdm.winner && this.tdm.playerRespawnAt < Infinity) return 'queue';
    return null;
  }

  /** 23.0: he has just spawned here: the spawn area opens (the weapon swap) until he leaves it or fires. */
  markSpawn() {
    this.spawnZone.mark(this.player.pos, this.elapsed, this.stats.shots);
  }

  private pickWeapon(id: WeaponId) {
    const phase = this.loadoutPhase();
    if (!phase) return;
    const now = phase === 'swap' || phase === 'zone';
    if (this.loadout.queue(id) || now) this.audio.uiBlip();
    if (now && this.loadout.commit()) {
      this.armPlayer();
      this.weapon.reset();
      this.weapon.raiseTarget = this.state === 'play' ? 1 : this.weapon.raiseTarget;
    }
  }

  /** Keys 1–3 while the picker is up; the picker shown or hidden (DOM touched only on a change). */
  private updateLoadout() {
    const phase = this.loadoutPhase();
    if (phase) for (const code of this.input.pressed) {
      const e = armoryByKey(code);
      if (e) this.pickWeapon(e.id);
    }
    const key = phase ? `${phase}:${this.loadout.queued}:${this.loadout.current}` : '';
    if (key === this.loadoutKey) return;
    this.loadoutKey = key;
    this.loadoutView.show(phase === 'swap' || phase === 'queue', this.loadout.queued, this.loadout.current, phase === 'queue');
    this.loadoutView.prompt(phase === 'zone', this.loadout.current);
  }

  /** Switch mode rules; the outgoing mode cleans up what it set up (TDM's bots, its HUD). */
  private useRules(next: ModeRules) {
    if (this.rules && this.rules !== next) this.rules.toTitle();
    this.rules = next;
  }

  private pickRules(): ModeRules {
    if (this.mode === 'tdm' && this.level.data.tdm) return this.tdm;
    return this.mode === 'story' && this.level.storyRules ? this.level.storyRules() : this.arcade;
  }

  // ------------------------------------------------------------------ UI, pause and pointer lock
  private applySettings() {
    const s = this.settings;
    this.audio.setVolume('master', s.master / 100);
    this.audio.setVolume('music', s.music / 100);
    this.audio.setVolume('sfx', s.sfx / 100);
    this.audio.setMuted(s.muted);
    if (this.ready) this.applyGraphics();
  }

  private bindUi() {
    // 9.0: audio (and with it the menu theme) starts on the first press anywhere, not only on a menu
    // button: browsers need a gesture, any gesture.
    const unlock = () => {
      if (this.audio.started || !this.ready) return;
      this.audio.start();
      this.applySettings();
      this.startLevelAudio();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Main menu.
    // 13.0: mode first, then the map (ui/MenuFlow.ts), then DEPLOY.
    this.hud.title.addEventListener('click', (e) => {
      if (!this.ready || this.state !== 'title') return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-mode],[data-act],[data-setting],[data-gun]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      this.audio.start();
      this.applySettings();
      this.startLevelAudio();
      this.audio.uiClick();
      if (el.dataset.gun) return this.menuWeapon(el.dataset.gun as WeaponId);
      if (el.dataset.mode) return this.menuEvent({ type: 'mode', mode: el.dataset.mode as Mode });
      if (el.dataset.setting) return this.menuEvent({ type: 'map', id: el.dataset.setting as SettingId });
      const act = el.dataset.act;
      if (act === 'settings') return this.menu.show(true, 'settings');
      // 45.0: PLAY on the root opens the maps in the last mode picked (Team Deathmatch the first time).
      if (act === 'play') return this.menuEvent({ type: 'mode', mode: this.menuState.mode ?? 'tdm' });
      if (act === 'controls') return this.menuEvent({ type: 'controls' });
      if (act === 'back') return this.menuEvent({ type: 'back' });
      if (act !== 'deploy' || this.loading) return;
      const st = this.menuState;
      if (!st.mode || st.map !== this.setting || !this.level.info.modes.includes(st.mode)) return;
      this.mode = st.mode;
      this.hud.show(this.hud.title, false);
      this.input.requestLock();
      void this.deploy();
    });
    // 16.0: a tick when the pointer enters a button or card (once per element), a glitch on a screen change.
    let hovered: Element | null = null;
    const hover = (e: PointerEvent) => {
      const b = (e.target as HTMLElement).closest('button:not(:disabled)');
      if (b === hovered) return;
      hovered = b;
      if (b) this.audio.uiHover();
    };
    for (const r of [this.hud.title, this.menu.root, this.tdmScreen.root, this.hud.death]) r.addEventListener('pointerover', hover);
    this.hud.onGlitch = () => this.audio.uiGlitch();
    const name = this.hud.nameInput;
    name.addEventListener('input', () => {
      this.playerName = cleanName(name.value, this.bootName);
      saveName(name.value);
    });
    name.addEventListener('change', () => (name.value = this.playerName));
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') name.blur();
    });
    this.hud.death.addEventListener('click', (e) => {
      if (this.state !== 'dead' || this.deadT <= 1.2) return;
      const t = e.target as HTMLElement;
      // 13.0: survival's next-map block (the map just played is a restart).
      const map = t.closest<HTMLElement>('[data-map]');
      if (map) return void this.nextMap(map.dataset.map as SettingId);
      if (t.closest('.next-maps [data-act="menu"]')) return void this.toTitle();
      // Story: retry from the checkpoint (the RESTART STORY button starts over).
      const full = t.closest('[data-act="full"]');
      this.restart(this.mode === 'story' && !full);
    });
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'play' || this.state === 'intro') this.input.requestLock();
    });
    this.menu.onResume = () => {
      this.audio.start();
      this.input.requestLock();
    };
    this.menu.onQuit = () => void this.toTitle();
    this.menu.onRestart = () => {
      this.menu.show(false);
      this.music.setPaused(false);
      this.restart(false);
    };
    this.endScreen.onRestart = () => {
      this.endScreen.hide();
      this.restart(false);
    };
    this.endScreen.onMenu = () => void this.toTitle();
    this.tdmScreen.onNextMap = (id) => void this.nextMap(id);
    this.tdmScreen.onMenu = () => void this.toTitle();
    this.menu.onChange = (s) => {
      this.applySettings();
      saveSettings(s);
    };
    this.input.onLockError = () => {
      if (this.state === 'paused') this.menu.setHint('BROWSER BLOCKED THE MOUSE — CLICK RESUME AGAIN');
    };
    // Esc releases the pointer (browser behaviour): that is the pause. Resume only once the lock is back.
    this.input.onLockChange = (locked) => {
      if (!locked && (this.state === 'play' || this.state === 'intro')) this.pause();
      else if (locked && this.state === 'paused') this.resume();
    };
    // 13.0: 1–3 pick a gun over the intro; they don't skip it.
    this.input.onAnyKey = (code) => {
      if (!armoryByKey(code)) this.skipIntro();
    };
    window.addEventListener('mousedown', () => this.skipIntro());
  }

  private pause() {
    if (this.state === 'paused') return;
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.menu.show(true);
    this.music.setPaused(true);
  }

  private resume() {
    this.freshClock = true;
    // Keys pressed behind the menu (no frames ran) must not fire on the first frame back.
    this.input.endFrame();
    this.state = this.stateBeforePause;
    this.menu.show(false);
    this.music.setPaused(false);
  }

  // ------------------------------------------------------------------ the menu's stage (16.0)
  /**
   * The menu's 3D stage exists only while the title shows its root or controls screen. Everything
   * else destroys it first: the maps screen (it shows the map itself), a match, a load. Called at
   * every place the state or the menu screen changes; it is idempotent.
   */
  private syncStage() {
    const s = this.menuState.screen;
    const want = this.ready && this.state === 'title' && (s === 'root' || s === 'controls');
    if (want && !this.stage) {
      this.stage = new MenuStage(this.renderer.renderer, this.loadout.queued);
      this.showStage();
    } else if (!want && this.stage) {
      this.closeStage();
    }
  }

  /** Draw the stage in place of the level (its scene and look; the level's haze and flashes off). */
  private showStage() {
    const st = this.stage!;
    this.renderer.setScene(st.scene);
    this.renderer.setLook(st.look);
    this.renderer.haze.px = 0;
    // The viewmodel's pass is off: the player's gun is not updated behind the menu.
    this.renderer.weaponPass.enabled = false;
    this.renderer.setCeiling(STAGE_PIXEL_RATIO);
    const g = this.renderer.grade.uniforms;
    g.uFlash.value = 0;
    g.uDamage.value = 0;
    this.renderer.compile(st.scene, this.camera);
  }

  /**
   * Free the stage completely and give the screen back to the level. After this nothing holds the
   * stage: its GPU resources are freed here, its JS objects go with the last reference (checked by
   * scripts/stagecheck.mjs under forced GC).
   */
  private closeStage() {
    this.stage!.dispose();
    this.stage = null;
    this.renderer.setScene(this.scene);
    this.renderer.setLook(this.level.look);
    this.renderer.weaponPass.enabled = true;
    this.renderer.setCeiling(Infinity);
    this.renderer.renderer.renderLists.dispose();
    // Levels with static shadows (the jungle) redraw them once: the stage frames rendered no shadows.
    this.renderer.renderer.shadowMap.needsUpdate = true;
  }

  /** The root menu's armory row: the loadout's pick, shown on the stage's crate. */
  private menuWeapon(id: WeaponId) {
    this.loadout.queue(id);
    this.stage?.setWeapon(id);
    this.hud.setArmory(id);
  }

  private startIntro() {
    this.state = 'intro';
    this.syncStage();
    this.useRules(this.pickRules());
    const card = this.level.info.cine[this.mode] ?? this.level.info.cine.arcade!;
    this.hud.setCine(card);
    this.hud.show(this.hud.skip, true);
    this.hud.skip.style.opacity = '1';
    // Story: the world is live during the opening (crowds, patrols on their beats, trains).
    this.rules.prepare?.();
    this.intro = this.level.createIntro(this.mode);
    // 36.0: TDM has dealt his spawn already (prepare): the flight settles on his own eyes there, so its
    // last frame is his first (it ended on the map's start, and the first frame of play cut to the zone).
    if (this.rules === this.tdm) {
      const p = this.player;
      const eye = new THREE.Vector3(p.pos.x, p.eyeY, p.pos.z);
      this.intro.landAt?.(eye, p.forward(new THREE.Vector3()).multiplyScalar(10).add(eye));
    }
  }

  private skipIntro() {
    if (this.state !== 'intro' || !this.intro || this.intro.t < 0.4) return;
    const before = this.intro.t;
    this.intro.skip();
    if (this.intro.t !== before) this.rules.onIntroSkipped?.();
  }

  private beginPlay(fromCheckpoint = false) {
    this.state = 'play';
    this.syncStage();
    this.useRules(this.pickRules());
    this.intro?.dispose();
    this.intro = null;
    this.hud.skip.style.opacity = '0';
    this.hud.cine.style.opacity = '0';
    this.hud.show(this.hud.root, true);
    this.hud.root.classList.toggle('story', this.mode === 'story');
    if (!fromCheckpoint) this.stats = { shots: 0, hits: 0, start: this.elapsed };
    // 13.0: his name and his gun for this run (the story hands him its own).
    this.playerUnit.name = this.playerName;
    if (!fromCheckpoint) {
      this.armPlayer();
      this.weapon.reset();
    }
    this.zone = null;
    this.interaction.reset();
    this.rules.begin(fromCheckpoint);
    // 48.0: his team is dealt with the match (random): known once it is set up.
    this.hud.setCallsign(this.playerName, this.mode === 'tdm' ? this.playerUnit.team.toUpperCase() : null);
    // 36.0: the camera on his eyes now, before anything is drawn (whatever the last frame showed).
    this.player.applyCamera(this.camera, this.elapsed, 0, this.weapon.spec.ads.zoom);
    // 23.0: the first spawn opens the spawn area (the weapon swap); the story has no loadout.
    if (this.mode !== 'story') this.markSpawn();
    else this.spawnZone.close();
    if (!this.input.locked) this.pause();
  }

  private restart(fromCheckpoint = false) {
    this.hud.show(this.hud.death, false);
    this.waves.reset(this.scene);
    this.barkView.clear();
    this.occupied.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.weapon.reset();
    this.interactives.reset();
    this.level.reset();
    this.rules.reset();
    this.endScreen.hide();
    this.tdmScreen.hide();
    this.respawning = false;
    this.failReason = '';
    this.timeScale = 1;
    this.damageFx = 0;
    this.renderer.grade.uniforms.uFade.value = 0;
    this.input.requestLock();
    this.beginPlay(fromCheckpoint && this.mode === 'story');
  }

  private damagePlayer(dmg: number, from: THREE.Vector3, by: Combatant | null = null) {
    if (this.state !== 'play' || !this.player.alive) return;
    if (this.elapsed < this.playerInvulnUntil) return;
    if (by) this.playerAttacker = by;
    this.player.damage(dmg, from, this.elapsed);
    this.damageFx = Math.min(1, this.damageFx + 0.6);
    // HUD arrow: angle of the source relative to where we look.
    const ang = Math.atan2(from.x - this.player.pos.x, from.z - this.player.pos.z);
    const rel = -(ang - (this.player.yaw + Math.PI));
    this.hud.damage(rel);
  }

  // ------------------------------------------------------------------ shooting
  private shoot() {
    const cam = this.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    // 39.0: along the view as it is now (the look, the recoil on it, the shake: what the camera is set
    // from), not the camera's last drawn frame (a frame behind a kick).
    const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    viewBasis(this.player.viewPitch(this.elapsed), this.player.viewYaw(this.elapsed), dir, right, up);
    const w = this.weapon.spec;
    const spread = this.spreadNow();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.stats.shots++;
    this.rules.onGunshot?.(origin);

    // 11.0: with the sights up the gun is centred, and the muzzle and port with it.
    const muzzle = cam.localToWorld(this.weapon.camPoint(w.muzzle, this.player.ads, new THREE.Vector3()));
    const tracer = new THREE.Color(...w.tracer);
    this.fx.muzzleSmoke(muzzle, dir);
    if (w.pellets) this.fx.muzzleSmoke(muzzle, dir);
    // 8.1: brass only from kinetic guns, onto the floor under the port (a catwalk, a roof, the street).
    if (this.weapon.ballistic === 'kinetic') {
      const port = cam.localToWorld(this.weapon.camPoint(w.shell, this.player.ads, new THREE.Vector3()));
      this.fx.ejectShell(port, right, up, this.col.groundHeightAt(port.x, port.z, 0.1, this.player.pos.y + 0.3), true);
    }
    this.muzzleLight.color.set(w.flash.light);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleT = 0.06;

    // One ray per pellet (one for ordinary guns, exactly the aimed ray). Pellets on the same enemy add
    // up into a single hit (one stagger, one hitmarker, one kill); a blast counts once per prop.
    const count = w.pellets?.count ?? 1;
    // 21.0: single rounds fall off too (the pistol past 25 m, the SMG past 12, the rifle past 35).
    const fall = w.pellets?.falloff ?? w.falloff;
    const onEnemy = new Map<Enemy, { dmg: number; point: THREE.Vector3; dir: THREE.Vector3 }>();
    const props = new Set<unknown>();
    const suppressed = new Map<Enemy, number>();
    let surfaceSounds = 0;
    const pd = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      pd.copy(dir);
      if (w.pellets) {
        const pa = Math.random() * Math.PI * 2;
        const pr = Math.sqrt(Math.random()) * w.pellets.spread * (1 - 0.2 * this.player.ads);
        pd.addScaledVector(right, Math.cos(pa) * pr).addScaledVector(up, Math.sin(pa) * pr).normalize();
      }
      const wh = this.col.raycast(origin, pd, 200, this.tmpHit);
      let maxDist = wh ? wh.dist : 200;
      let target: Enemy | null = null;
      let eh: EnemyHit | null = null;
      for (const e of this.ctx.enemies) {
        // His rounds pass through his own team's bots (friendly fire is off).
        if (e.team === this.playerUnit.team) continue;
        const h = e.raycast(origin, pd);
        if (h && h.dist < maxDist) {
          maxDist = h.dist;
          target = e;
          eh = h;
        }
      }
      // Whatever else the mode puts in the line of fire (bystanders).
      const ch = this.rules.bystander?.(origin, pd, maxDist) ?? null;
      if (ch && ch.dist < maxDist) {
        maxDist = ch.dist;
        target = null;
        eh = null;
      }
      this.fx.tracer(muzzle, origin.clone().addScaledVector(pd, maxDist), tracer);
      this.nearMisses(origin, pd, maxDist, target, suppressed);
      if (target && eh) {
        const k = fall ? (eh.dist <= fall.near ? 1 : eh.dist >= fall.far ? fall.min : 1 - ((eh.dist - fall.near) / (fall.far - fall.near)) * (1 - fall.min)) : 1;
        // 21.0: the pistol's head hits are worth more than the hitbox's own ×2.
        const head = eh.head && w.headMul ? w.headMul : 1;
        const dmg = w.damage * eh.mult * head * k * rand(0.95, 1.05);
        const acc = onEnemy.get(target);
        if (acc) {
          acc.dmg += dmg;
          // Every pellet shows where it struck; the hit itself is applied once below.
          this.fx.enemyHit(eh.point, pd, target.accent, target.look.organic);
        } else onEnemy.set(target, { dmg, point: eh.point.clone(), dir: pd.clone() });
      } else if (ch && ch.dist <= maxDist) {
        ch.hit(pd);
      } else if (wh) {
        this.fx.impact(wh.point, wh.normal, wh.surface);
        if (surfaceSounds++ < 2) this.audio.hitSurface(wh.point, wh.surface);
        // Cabinets, lamps and other shootable props: once per trigger pull, however many pellets.
        if (wh.collider?.onHit && !props.has(wh.collider)) {
          props.add(wh.collider);
          wh.collider.onHit(wh);
        }
      }
    }
    // Near misses: one dose per enemy per trigger pull (a shotgun doesn't pin eight times over).
    for (const [e, k] of suppressed) if (!onEnemy.has(e)) e.suppress(k, this.ctx);
    if (onEnemy.size) {
      this.stats.hits++;
      let anyKill = false;
      for (const [e, h] of onEnemy) {
        const killed = e.takeHit(h.dmg, h.dir, h.point, this.ctx, this.playerUnit, w.knock);
        if (killed) {
          anyKill = true;
          this.rules.onKill?.();
        }
      }
      this.hud.hitmarker(anyKill);
      this.audio.hitmarker(anyKill);
      if (anyKill) this.player.trauma = Math.min(1, this.player.trauma + 0.12);
    }

    // Recoil (39.0, per weapon: Recoil.ts): the aim kicked up and sideways, coming back at the gun's
    // own rate, and the FOV punch; a roll and screen shake on top, seen only. 11.0: a shouldered gun
    // (ADS) kicks less than half as much, and a crouched stance a little less again.
    const c = w.camera;
    const k = lerp(1, 0.45, this.player.ads) * lerp(1, 0.85, this.player.crouch);
    this.player.recoil.fire(w.recoil, k);
    this.player.kickRoll.impulse(rand(-c.roll, c.roll) * k);
    this.player.trauma = Math.min(1, this.player.trauma + c.trauma * k);
  }

  /**
   * The cone a round leaves in now (radians): the weapon's own, plus movement, bloom and air. 11.0:
   * ADS halves the base and takes 75% off movement and 60% off bloom; a crouch takes 30% off movement
   * and bloom (and 15% off the base). Shared by the shot and the crosshair.
   */
  private spreadNow() {
    const p = this.player;
    const a = p.ads, c = p.crouch;
    const steady = 1 - 0.3 * c;
    // 21.0: from the hip the gun's own multiplier (the SMG's 0.55 tight, the rifle's 2 wide), gone with the sights up.
    const hip = lerp(this.weapon.spec.hip, 1, a);
    return (
      (this.weapon.spec.spread * (1 - 0.5 * a) * (1 - 0.15 * c) +
        p.moveAmount * 0.012 * (1 - 0.75 * a) * steady +
        this.weapon.bloom * 0.018 * (1 - 0.6 * a) * steady) *
        hip +
      (p.onGround ? 0 : 0.03)
    );
  }

  /**
   * Rounds that pass within 1.8 m of an enemy's chest without hitting it suppress it, more the closer
   * they pass. Collected per pull, applied once per enemy (the strongest pellet).
   */
  private nearMisses(origin: THREE.Vector3, dir: THREE.Vector3, len: number, hit: Enemy | null, out: Map<Enemy, number>) {
    for (const e of this.ctx.enemies) {
      if (!e.alive || e === hit || e.team === this.playerUnit.team) continue;
      const k = nearMissDose(origin, dir, len, e.chest);
      if (k > 0) out.set(e, Math.max(out.get(e) ?? 0, k));
    }
  }

  // ------------------------------------------------------------------ frame
  private frame() {
    // 44.0: a load between its steps: nothing runs on a half-built level (the loading screen is up).
    if (this.building) return;
    this.clock.update();
    // Time-based simulation: dt is the real time since the last drawn frame (so the frame cap never
    // changes game speed), clamped so a hitch can't tunnel anything through a wall.
    const rawDt = this.freshClock ? 0 : Math.min(this.clock.getDelta(), 1 / 20);
    this.freshClock = false;
    const paused = this.state === 'paused';
    const dt = paused ? 0 : rawDt * this.timeScale;
    this.elapsed += dt;
    this.time.value = this.elapsed;
    this.ctx.time = this.elapsed;
    const input = this.input;

    // ---- State logic
    if (this.state === 'title') {
      if (this.stage) this.stage.update(rawDt, this.camera);
      else this.level.titleCamera(this.camera, this.elapsed);
      this.renderer.grade.uniforms.uFade.value = damp(this.renderer.grade.uniforms.uFade.value, this.loading ? 1 : this.stage ? 0.04 : 0.25, 1.5, rawDt);
    } else if (this.state === 'intro' && this.intro) {
      const f = this.intro.update(dt, this.camera);
      this.rules.updateIntro?.(dt);
      const g = this.renderer.grade.uniforms;
      g.uFade.value = f.fade;
      g.uLetterbox.value = f.letterbox;
      this.hud.cine.style.opacity = f.title ? '1' : '0';
      if (f.raiseWeapon) this.weapon.raiseTarget = 1;
      if (f.hud) this.hud.show(this.hud.root, true);
      if (f.done) this.beginPlay();
    } else if (this.state === 'ending') {
      this.rules.updateEnding?.(dt, rawDt);
    } else if (this.state === 'play' || this.state === 'dead') {
      const controls = this.state === 'play' && input.locked;
      this.player.aimWant = input.aimDown && this.weapon.canAim;
      this.player.update(dt, input, controls, this.elapsed);
      if (this.state === 'play' && this.player.alive) this.safety.update(dt, this.player);
      if (controls && this.player.alive) {
        if (input.pressed.has(KEYS.holster)) this.weapon.toggleHolster();
        if (input.pressed.has(KEYS.reload)) this.weapon.startReload();
        // 36.0: the trigger is held through TDM's pre-match countdown.
        if (input.mouseDown && !this.player.held && !this.player.mantling && this.weapon.tryFire()) this.shoot();
      }
      this.player.applyCamera(this.camera, this.elapsed, rawDt, this.weapon.spec.ads.zoom);
      // What the squad can observe about him (each use is gated by its own visibility rule).
      const sp = this.waves.squad.player;
      sp.reloading = this.weapon.reloading;
      sp.hp = this.player.health / this.player.maxHealth;
      sp.facing.set(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
      this.rules.update(dt, rawDt);
      this.projectiles.update(dt, this.player);
      this.interactives.update(dt, this.elapsed, this.ctx);
      if (this.state === 'play' && !this.player.alive) {
        this.state = 'dead';
        this.deadT = 0;
        // A mode with respawns (TDM) keeps the game running and the mouse captured.
        this.respawning = this.rules.onPlayerDeath?.() ?? false;
        this.timeScale = this.respawning ? 1 : 0.35;
        this.weapon.raiseTarget = 0;
        if (!this.respawning) document.exitPointerLock();
      }
      if (this.state === 'dead' && this.respawning) {
        this.deadT += rawDt;
        this.renderer.grade.uniforms.uFade.value = clamp(this.deadT * 0.5, 0, 0.45);
      } else if (this.state === 'dead') {
        this.deadT += rawDt;
        this.renderer.grade.uniforms.uFade.value = clamp(this.deadT * 0.35, 0, 0.6);
        if (this.deadT > 1.2 && this.hud.death.classList.contains('hidden')) {
          this.timeScale = 0.15;
          this.hud.show(this.hud.root, false);
          this.storyHud.show(false);
          if (this.level instanceof TokyoLevel) this.level.story.show(false);
          const d = this.rules.death();
          this.hud.showDeath({
            title: this.failReason || undefined,
            story: d.story,
            wave: this.waves.wave,
            kills: d.kills,
            accuracy: this.stats.shots ? this.stats.hits / this.stats.shots : 0,
            time: this.elapsed - this.stats.start,
            // 13.0: survival goes on to any survival map from here.
            next: this.mode === 'arcade' ? nextMaps('arcade', this.setting, LEVEL_ORDER.map((id) => levelEntry(id).info)) : undefined,
          });
        }
      }
      if (this.state === 'play') this.updateZone(dt);
      // HUD.
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setStamina(this.player.stamina.frac, this.player.stamina.exhausted);
      this.hud.setAmmo(this.weapon.ammo, this.weapon.reloading);
      this.hud.setArmed(this.weapon.visible);
      this.hud.setWave(this.waves.wave, this.waves.remaining, this.waves.state === 'break');
      this.hud.root.classList.toggle('holstered', this.weapon.holstered);
      // The crosshair opens with the real cone (500 px per radian of spread: the 3.x scale for movement), and fades out as the
      // sights come up: with the sights up they are the reference.
      this.hud.setSpread(4 + (this.spreadNow() - this.weapon.spec.spread) * 500);
      this.hud.setAim(this.player.ads);
    }

    if (this.ready) this.updateLoadout();
    // The level is not drawn behind the menu's stage: it doesn't run either.
    if (!paused && !this.stage) this.updateWorld(dt, rawDt);
    this.updateMusic(dt);
    this.hud.update(rawDt);
    this.barkView.update(dt, this.camera, (this.state === 'play' || (this.state === 'dead' && this.respawning)) && this.mode !== 'story');
    this.audio.updateListener(this.camera);
    if (!paused) this.audio.update(dt, this.camera.position);

    // Weapon camera mirrors the main camera's lens (without sprint FOV, to avoid gun distortion).
    // 11.0: with the sights up the viewmodel lens narrows a little too (the sight reads larger).
    this.weaponCamera.fov = 58 * lerp(1, 0.88, this.player.ads);
    this.weaponCamera.updateProjectionMatrix();
    if (!this.stage) this.lightPool?.update(this.camera, rawDt);
    this.renderer.render(this.elapsed);
    this.adaptQuality(rawDt);
    input.endFrame();
  }

  /** TDM: back on his feet at `at` (feet), facing `yaw`, full health, a fresh magazine. */
  revive(at: THREE.Vector3, yaw: number) {
    this.player.reset(at.x, at.z, yaw, at.y);
    this.safety.reset(this.player.pos);
    // 13.0: the gun he queued while he was down.
    this.armPlayer();
    this.weapon.reset();
    this.weapon.raiseTarget = 1;
    this.weapon.setHolstered(false, true);
    this.playerAttacker = null;
    this.respawning = false;
    this.state = 'play';
    this.markSpawn();
    this.timeScale = 1;
    this.damageFx = 0;
    this.renderer.grade.uniforms.uFade.value = 0;
    this.hud.show(this.hud.root, true);
    // The mouse was released while he was down: back in play behind the pause menu.
    if (!this.input.locked) this.pause();
  }

  /** TDM is over: the result over the world in slow motion. */
  finishTdm(result: 'win' | 'loss' | 'draw', tickets: Record<TeamId, number>, lines: TdmLine[], time: number, why?: string) {
    this.state = 'ending';
    this.respawning = false;
    this.weapon.raiseTarget = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.show(this.hud.root, false);
    this.tdmHud.show(false);
    this.tdmScreen.show(result, tickets, lines, time, nextMaps('tdm', this.setting, LEVEL_ORDER.map((id) => levelEntry(id).info)), why);
  }

  /**
   * 13.0: straight from a result screen into another map of the same mode (the one just played is a
   * rematch: a restart, no rebuild). The outgoing mode cleans up first (its bots, HUD and per-level
   * state), then the level is freed and the new one built as a menu switch would, then the intro
   * runs (with the loadout picker). Nothing of the old map may survive: __dev.mapCycle() checks.
   */
  async nextMap(id: SettingId) {
    if (this.loading || !LEVELS[id] || !levelEntry(id).info.modes.includes(this.mode)) return;
    if (id === this.setting) {
      this.tdmScreen.hide();
      this.restart(false);
      return;
    }
    this.loading = true;
    // Its own state: nothing of the run's frame logic (the death screen, the slow motion) runs on.
    this.state = 'loading';
    this.tdmScreen.deploying(levelEntry(id).info);
    this.hud.show(this.hud.death, false);
    this.hud.show(this.hud.root, false);
    this.respawning = false;
    this.rules.toTitle();
    this.rules = this.arcade;
    this.renderer.grade.uniforms.uFade.value = 1;
    // 44.0: the build and the match's warm-up behind one loading screen (85% the map, the rest the match).
    const info = levelEntry(id).info;
    this.loadingScreen.show(info.name, info.jp);
    try {
      await this.loadLevelShown(id, 0, false, 0.85);
    } finally {
      this.loading = false;
    }
    this.rememberSetting(id);
    this.hud.selectLevel(this.level.info, false);
    this.resetRun();
    this.tdmScreen.hide();
    this.input.requestLock();
    await this.deploy(0.85);
  }

  /**
   * 44.0: into the intro behind the loading screen: the match is dealt (its bots spawned, the player on
   * his spot), then warmed up (their rigs, name tags, the effects), so the flight and the first
   * minutes don't compile or upload anything. The intro is held at its start until then.
   */
  private async deploy(from = 0) {
    const L = this.loadingScreen;
    if (!L.active) L.show(this.level.info.name, this.level.info.jp);
    L.set(from + (1 - from) * 0.15, 'DEPLOYING');
    this.building = true;
    try {
      await paint();
      this.startIntro();
      await this.warm(from + (1 - from) * 0.2, 1);
    } finally {
      this.building = false;
      this.freshClock = true;
    }
    await L.hide(250);
  }

  /** What a run leaves on the engine (shared by the menu and a map change). */
  private resetRun() {
    this.weapon.reset();
    this.weapon.setHolstered(false, true);
    this.weapon.raiseTarget = 0;
    this.timeScale = 1;
    this.damageFx = 0;
    this.failReason = '';
    this.zone = this.zoneCandidate = null;
    this.interaction.reset();
    const g = this.renderer.grade.uniforms;
    g.uLetterbox.value = 0;
    g.uDamage.value = 0;
    g.uFlash.value = 0;
  }

  private updateMusic(dt: number) {
    const s = this.state === 'paused' ? this.stateBeforePause : this.state;
    // The menu theme on the title (and while a level loads behind it); the setting's own track from
    // the intro on. Intensity drives the procedural layers: quiet when dead, flat in the menus.
    const inLevel = s === 'intro' || s === 'play' || s === 'dead' || s === 'ending' || s === 'loading';
    const intensity = s === 'play' && this.player ? this.rules.musicIntensity() : s === 'dead' ? 0.05 : 0.02;
    this.music.update(dt, inLevel && !this.loading ? this.level.info.music : 'menu_theme', intensity);
  }

  /** Location card when the player settles in a new area (debounced so corners don't spam it). */
  private updateZone(dt: number) {
    const p = this.player.pos;
    const z = this.level.data.zoneAt(p.x, p.y, p.z);
    if (z !== this.zoneCandidate) {
      this.zoneCandidate = z;
      this.zoneT = 0;
    }
    this.zoneT += dt;
    if (z && z !== this.zone && this.zoneT > 0.5) {
      this.zone = z;
      this.hud.zoneShow(z.name, z.jp);
    }
  }

  /** Nearest usable thing in front of the player, shown as a prompt; E is handled here only. */
  updateInteraction(dt: number, fallbackHint: string | null = null) {
    const p = this.player.pos;
    const fwd = this.player.forward(new THREE.Vector3());
    const live = this.input.locked && this.player.alive;
    const label = this.interaction.update(this.interactables, p, fwd, live && this.input.pressed.has(KEYS.interact), live && this.input.key(KEYS.interact), dt);
    this.storyHud.setHint(label ?? fallbackHint);
  }

  /**
   * Back to the main menu (pause menu QUIT, end card MENU). Nothing of the run survives: the mode's
   * systems clean up, then the level is torn down completely (enemies and spawners, projectiles,
   * effects, its sounds, DOM and GPU resources) and rebuilt fresh behind the title.
   */
  async toTitle() {
    if (this.loading) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.state = 'title';
    this.loading = true;
    this.input.keys.clear();
    this.input.endFrame();
    this.endScreen.hide();
    this.tdmScreen.hide();
    this.respawning = false;
    this.menu.show(false);
    this.hud.show(this.hud.death, false);
    this.hud.show(this.hud.root, false);
    this.hud.show(this.hud.skip, false);
    this.hud.cine.style.opacity = '0';
    this.storyHud.clear();
    this.storyHud.show(false);
    this.rules.toTitle();
    this.rules = this.arcade;
    this.music.setPaused(false);
    this.hud.show(this.hud.title, true);
    this.hud.selectLevel(this.level.info, true);
    const g = this.renderer.grade.uniforms;
    g.uFade.value = 1;
    g.uLetterbox.value = 0;
    g.uDamage.value = 0;
    g.uFlash.value = 0;
    // 44.0: rebuilt and warmed up behind the loading screen.
    try {
      await this.loadLevelShown(this.setting);
    } finally {
      this.loading = false;
    }
    this.resetRun();
    this.menuState = { ...this.menuState, screen: this.menuState.mode ? 'maps' : 'root', map: this.setting };
    this.syncStage();
    this.hud.selectLevel(this.level.info, false);
  }

  /** Keeps 60 fps: drops render resolution after sustained slow frames, restores it with headroom. */
  private adaptQuality(rawDt: number) {
    const p = this.perf;
    p.acc += rawDt;
    p.frames++;
    if (p.acc < 0.5) return;
    p.fps = p.frames / p.acc;
    p.acc = 0;
    p.frames = 0;
    if (this.state !== 'play' && this.state !== 'intro') return;
    const pr = this.renderer.renderer.getPixelRatio();
    const cap = this.settings.fps;
    if (p.fps < cap * 0.83) {
      p.lowT += 0.5;
      p.highT = 0;
      if (p.lowT >= 3 && pr > this.renderer.minPixelRatio) {
        this.renderer.setPixelRatio(pr - 0.25);
        p.lowT = 0;
      }
    } else if (p.fps > cap * 0.95) {
      p.highT += 0.5;
      p.lowT = 0;
      if (p.highT >= 10 && pr < this.renderer.maxPixelRatio) {
        this.renderer.setPixelRatio(pr + 0.25);
        p.highT = 0;
      }
    } else p.lowT = p.highT = 0;
  }

  /** The level's world, then what every level has: effects, the viewmodel, muzzle flash, damage grade. */
  private updateWorld(dt: number, rawDt: number) {
    const camPos = this.camera.position;
    const playing = this.state === 'play' || this.state === 'dead';
    this.level.update({ dt, rawDt, elapsed: this.elapsed, camPos, player: this.player, playing, mode: this.mode });
    this.fx.update(dt);

    this.level.lightWeapon(this.weapon, camPos);
    const md = this.state === 'play' ? this.input.mouseDX : 0;
    const my = this.state === 'play' ? this.input.mouseDY : 0;
    this.weapon.update(dt, this.player, md, my, this.elapsed);

    // Muzzle light pulse.
    this.muzzleT -= dt;
    this.muzzleLight.intensity = this.muzzleT > 0 ? 45 * (this.muzzleT / 0.06) : 0;

    const g = this.renderer.grade.uniforms;
    this.damageFx = Math.max(0, this.damageFx - rawDt * 1.2);
    const low = this.player && this.player.alive && this.player.health < 30 ? 0.25 + Math.sin(this.elapsed * 6) * 0.1 : 0;
    g.uDamage.value = Math.max(this.damageFx, low);
    g.uFlash.value = this.level.flash * 0.7;
  }

  /** DEV: simulated walk of every route plus enemy reachability (see src/dev/RouteCheck.ts). */
  async checkRoutes() {
    if (!import.meta.env.DEV) return null;
    const { runRouteCheck } = await import('../dev/RouteCheck');
    return runRouteCheck(this);
  }

  /** DEV: current debug snapshot. */
  debug() {
    return {
      setting: this.setting,
      state: this.state,
      elapsed: +this.elapsed.toFixed(2),
      wave: this.waves.wave,
      waveState: this.waves.state,
      alive: this.waves.enemies.filter((e) => e.alive).length,
      music: this.music.debug(),
      fps: +this.perf.fps.toFixed(1),
      pixelRatio: this.renderer.renderer.getPixelRatio(),
      drawCalls: this.renderer.renderer.info.render.calls,
      triangles: this.renderer.renderer.info.render.triangles,
      memory: { ...this.renderer.renderer.info.memory },
      lights: this.scene.children.filter((o) => (o as THREE.PointLight).isPointLight).length,
      player: this.player.pos.toArray().map((v) => +v.toFixed(2)),
      zone: this.zone?.id ?? null,
      mode: this.mode,
      holstered: this.weapon.holstered,
      ...(this.mode === 'tdm' ? { tdm: this.tdm.debug() } : {}),
      ...this.level.debug?.(),
    };
  }
}
