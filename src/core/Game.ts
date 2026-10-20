import * as THREE from 'three';
import { Renderer, type Pipeline } from './Renderer';
import { Input } from './Input';
import { InteractionController, type Interactable } from './Interaction';
import { StaticBuilder } from '../world/Builder';
import { FramePacer, PRESETS, effectiveCap } from './Performance';
import { KEYS } from './Bindings';
import { clamp, damp, rand } from './math';
import { disposeScene } from './dispose';
import { AudioEngine } from '../audio/AudioEngine';
import { MusicDirector } from '../audio/music/MusicDirector';
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
import { Hud, jpNumber } from '../ui/Hud';
import { PauseMenu } from '../ui/PauseMenu';
import { loadSettings, saveSettings, type Settings } from '../ui/Settings';
import { StoryHud } from '../ui/StoryHud';
import { EndScreen } from '../ui/EndScreen';
import type { IntroLike, LevelRuntime, Mode, ModeRules, SettingId } from '../levels/Level';
import { LEVELS, LEVEL_ORDER, levelEntry } from '../levels/registry';
import { ArcadeRules } from '../levels/Arcade';
import { TokyoLevel } from '../levels/tokyo/TokyoLevel';
import { BarkView } from '../ui/BarkView';
import { nearMissDose } from '../enemies/tactics/Squad';
import { buildCoverSpots } from '../enemies/tactics/CoverSpots';

export type { Mode };

type State = 'title' | 'intro' | 'play' | 'paused' | 'dead' | 'ending';

/** Something the player can use with E when close and facing it. */
export type { Interactable };

const SETTING_KEY = 'neonrain.setting';

/** The menu's last chosen setting (per browser; separate from the audio/graphics settings). */
function savedSetting(): SettingId {
  const url = new URLSearchParams(location.search).get('setting');
  let id: string | null = url;
  if (!id) {
    try {
      id = localStorage.getItem(SETTING_KEY);
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
  music = new MusicDirector();
  col = new CollisionWorld();
  glows = new Glows();
  hud: Hud;
  menu: PauseMenu;
  settings: Settings;
  state: State = 'title';
  mode: Mode = new URLSearchParams(location.search).get('mode') === 'arcade' ? 'arcade' : 'story';
  /** The loaded setting and its runtime. */
  setting: SettingId = 'tokyo';
  level!: LevelRuntime;
  private rules!: ModeRules;
  private arcade = new ArcadeRules(this);
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
  /** The loaded level's ambience and loops are playing. */
  private levelAudio = false;
  ctx!: EnemyCtx;
  private zone: Zone | null = null;
  private zoneCandidate: Zone | null = null;
  private zoneT = 0;
  private perf = { acc: 0, frames: 0, fps: 60, lowT: 0, highT: 0 };
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
    // Callouts: the line above the speaker and its voice from where it stands.
    this.waves.squad.barks.onBark = (e) => {
      this.barkView.add(e);
      this.audio.callout(e.speaker.pos.clone().setY(e.speaker.pos.y + 1.6), e.speaker.look.voice, e.text.split(/\s+/).length, e.kind === 'go' || e.kind === 'contact');
    };
    this.storyHud.show(false);
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
    // Optional music files are fetched while the level builds (procedural score otherwise).
    try {
      this.music.preload(new OfflineAudioContext(2, 1, 44100));
    } catch {
      /* no OfflineAudioContext: procedural only */
    }
    this.hud.setLevels(LEVEL_ORDER.map((id) => levelEntry(id).info));
    const first = savedSetting();
    this.hud.selectLevel(levelEntry(first).info, true);
    // Let the title paint before the heavy procedural build.
    await new Promise((r) => setTimeout(r, 30));
    this.buildEngine();
    this.loadLevel(first);
    this.ready = true;
    this.applyGraphics();
    this.hud.setReady();
    this.hud.selectLevel(this.level.info, false);
    this.bindUi();
    this.startLoop();
    this.bindPower();
  }

  /** The display-refresh callback: draws only when the frame cap and the game state call for it. */
  private startLoop() {
    this.pacer.reset();
    this.freshClock = true;
    this.renderer.renderer.setAnimationLoop((now) => {
      const st = this.state === 'ending' && !this.endScreen.root.classList.contains('hidden') ? 'endcard' : this.state;
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
    r.renderer.setPixelRatio(r.maxPixelRatio);
    r.resize();
    r.setBloomLevels(p.bloomLevels);
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
    this.renderer.renderer.compile(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ engine and levels
  /** What lives across levels: the viewmodel and the survival callbacks. */
  private buildEngine() {
    this.weapon = new Weapon(this.weaponScene, this.weaponCamera, this.audio);
    this.waves.onWaveStart = (n) => {
      this.hud.bannerShow(`WAVE ${String(n).padStart(2, '0')}`, `第${jpNumber(n)}波`);
      this.audio.waveStart();
    };
    this.waves.onWaveClear = (n) => {
      this.hud.bannerShow('CLEAR', `第${jpNumber(n)}波 · 突破`, 2.4);
      this.audio.waveClear();
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 35);
    };
    this.waves.onSpawn = (e, at) => {
      if (e.kind === 'gunner') this.audio.clang(at.clone().setY(at.y + 1.5), 0.7);
    };
    this.waves.onSniper = () => this.music.accent();
    this.waves.onLastEnemy = () => this.music.accent();
  }

  /**
   * Builds a setting into a fresh scene and collision world: the level's world first, then the
   * engine's per-level systems on its data (player, nav, survival spawns, pickups, enemy context),
   * then the level's own systems. Frees the previous level first.
   */
  loadLevel(id: SettingId) {
    if (this.level) this.unloadLevel();
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
    this.fx.onShellBounce = (p, k) => this.audio.shellBounce(p, k);
    this.weapon.setLights(null);
    const level = levelEntry(id).create(this);
    this.level = level;
    this.setting = id;
    const d = level.data;

    this.interactives = new Interactives(s, this.glows, this.fx, this.audio, d.cabinets, d.medkits, d.breakables);
    this.interactives.onKill = () => this.waves.kills++;
    this.glows.buildHalos(s);

    this.muzzleLight = new THREE.PointLight(0xffa860, 0, 14, 2);
    s.add(this.muzzleLight);

    this.player = new Player(this.col, this.audio);
    this.player.reset(d.start.x, d.start.z, d.start.yaw, d.start.y ?? 0);
    this.safety = new SafetyNet({
      bounds: d.bounds,
      floorMin: d.floorMin,
      blocked: (p, r) => this.col.blocked(p, r),
      designed: (p) => d.zoneAt(p.x, p.y, p.z) !== null,
      aboard: (p) => level.aboard(p),
    });
    this.safety.reset(this.player.pos);
    // The setting's arsenal: the player's weapon, the enemies' look (and their rounds).
    const arsenal = level.info.arsenal;
    this.weapon.setSpec(arsenal.weapon);
    this.hud.setWeapon(arsenal.weapon.name, arsenal.weapon.jp, arsenal.weapon.mag, this.weapon.lowAmmo);
    this.waves.look = arsenal.enemies;
    this.projectiles = new Projectiles(s, this.col, this.fx, this.audio, arsenal.enemies);
    this.projectiles.onPlayerHit = (dmg, from) => {
      this.waves.squad.player.pressureT = this.elapsed;
      this.damagePlayer(dmg, from);
    };
    // A round cracking past him counts as pressure too (the rushers' opening).
    this.projectiles.onWhiz = () => (this.waves.squad.player.pressureT = this.elapsed);
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
    };
    level.attach();
    // Authored spots plus spots round every waist-high solid (dynamic cover needs all sides), once
    // the level's whole collision world exists.
    this.ctx.coverPoints = buildCoverSpots(this.col, this.nav, d.coverPoints, d.bounds);
    this.rules = this.arcade;

    document.title = level.info.windowTitle;
    this.renderer.setLook(level.look);
    level.setVisual?.(this.renderer.pipeline !== 'v37');
    this.hud.setPlace(level.info.place, level.info.clock);
    if (this.ready) this.applyGraphics();
    // Compile everything up front so the first shot doesn't hitch.
    this.renderer.renderer.compile(s, this.camera);
    this.levelAudio = false;
    this.startLevelAudio();
  }

  /** Frees the loaded level: its enemies, sounds, DOM, GPU resources. */
  private unloadLevel() {
    this.intro?.dispose();
    this.intro = null;
    this.waves.reset(this.scene);
    this.barkView.clear();
    this.projectiles.clear();
    this.fx.clear();
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
    // Let the loading note paint before the synchronous build.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
    try {
      this.loadLevel(id);
    } finally {
      this.loading = false;
    }
    this.hud.selectLevel(this.level.info, false);
    try {
      localStorage.setItem(SETTING_KEY, id);
    } catch {
      /* storage blocked: the choice lasts this session */
    }
    if (!this.level.info.modes.includes(this.mode)) this.mode = this.level.info.modes[0];
  }

  private pickRules(): ModeRules {
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
    // Main menu.
    this.hud.title.addEventListener('click', (e) => {
      if (!this.ready || this.state !== 'title') return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-mode],[data-act],[data-setting]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      this.audio.start();
      this.applySettings();
      this.startLevelAudio();
      this.audio.uiBlip();
      if (el.dataset.setting) return void this.selectSetting(el.dataset.setting as SettingId);
      const act = el.dataset.act;
      if (act === 'settings') return this.menu.show(true, 'settings');
      if (act === 'controls') return this.hud.showControls(true);
      if (act === 'back') return this.hud.showControls(false);
      if (this.loading) return;
      const mode = el.dataset.mode === 'arcade' ? 'arcade' : 'story';
      if (!this.level.info.modes.includes(mode)) return;
      this.mode = mode;
      this.music.start(this.audio);
      this.hud.show(this.hud.title, false);
      this.input.requestLock();
      this.startIntro();
    });
    this.hud.death.addEventListener('click', (e) => {
      if (this.state !== 'dead' || this.deadT <= 1.2) return;
      // Story: retry from the checkpoint (the RESTART STORY button starts over).
      const full = (e.target as HTMLElement).closest('[data-act="full"]');
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
    this.input.onAnyKey = () => this.skipIntro();
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

  private startIntro() {
    this.state = 'intro';
    this.rules = this.pickRules();
    const card = this.level.info.cine[this.mode] ?? this.level.info.cine.arcade!;
    this.hud.setCine(card);
    this.hud.show(this.hud.skip, true);
    this.hud.skip.style.opacity = '1';
    // Story: the world is live during the opening (crowds, patrols on their beats, trains).
    this.rules.prepare?.();
    this.intro = this.level.createIntro(this.mode);
  }

  private skipIntro() {
    if (this.state !== 'intro' || !this.intro || this.intro.t < 0.4) return;
    const before = this.intro.t;
    this.intro.skip();
    if (this.intro.t !== before) this.rules.onIntroSkipped?.();
  }

  private beginPlay(fromCheckpoint = false) {
    this.state = 'play';
    this.rules = this.pickRules();
    this.intro?.dispose();
    this.intro = null;
    this.hud.skip.style.opacity = '0';
    this.hud.cine.style.opacity = '0';
    this.hud.show(this.hud.root, true);
    this.hud.root.classList.toggle('story', this.mode === 'story');
    if (!fromCheckpoint) this.stats = { shots: 0, hits: 0, start: this.elapsed };
    this.zone = null;
    this.interaction.reset();
    this.rules.begin(fromCheckpoint);
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
    this.failReason = '';
    this.timeScale = 1;
    this.damageFx = 0;
    this.renderer.grade.uniforms.uFade.value = 0;
    this.input.requestLock();
    this.beginPlay(fromCheckpoint && this.mode === 'story');
  }

  private damagePlayer(dmg: number, from: THREE.Vector3) {
    if (this.state !== 'play' || !this.player.alive) return;
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
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const w = this.weapon.spec;
    const spread = w.spread + this.player.moveAmount * 0.012 + this.weapon.bloom * 0.018 + (this.player.onGround ? 0 : 0.03);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.stats.shots++;
    this.rules.onGunshot?.(origin);

    const muzzle = cam.localToWorld(new THREE.Vector3(...w.muzzle));
    const tracer = new THREE.Color(...w.tracer);
    this.fx.muzzleSmoke(muzzle, dir);
    if (w.pellets) this.fx.muzzleSmoke(muzzle, dir);
    this.fx.ejectShell(cam.localToWorld(new THREE.Vector3(...w.shell)), right, up);
    this.muzzleLight.color.set(w.flash.light);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleT = 0.06;

    // One ray per pellet (one for ordinary guns, exactly the aimed ray). Pellets on the same enemy add
    // up into a single hit (one stagger, one hitmarker, one kill); a blast counts once per prop.
    const count = w.pellets?.count ?? 1;
    const fall = w.pellets?.falloff;
    const onEnemy = new Map<Enemy, { dmg: number; point: THREE.Vector3; dir: THREE.Vector3 }>();
    const props = new Set<unknown>();
    const suppressed = new Map<Enemy, number>();
    let surfaceSounds = 0;
    const pd = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      pd.copy(dir);
      if (w.pellets) {
        const pa = Math.random() * Math.PI * 2;
        const pr = Math.sqrt(Math.random()) * w.pellets.spread;
        pd.addScaledVector(right, Math.cos(pa) * pr).addScaledVector(up, Math.sin(pa) * pr).normalize();
      }
      const wh = this.col.raycast(origin, pd, 200, this.tmpHit);
      let maxDist = wh ? wh.dist : 200;
      let target: Enemy | null = null;
      let eh: EnemyHit | null = null;
      for (const e of this.ctx.enemies) {
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
        const dmg = w.damage * eh.mult * k * rand(0.95, 1.05);
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
        const killed = e.takeHit(h.dmg, h.dir, h.point, this.ctx);
        if (killed) {
          anyKill = true;
          this.rules.onKill?.();
        }
      }
      this.hud.hitmarker(anyKill);
      this.audio.hitmarker(anyKill);
      if (anyKill) this.player.trauma = Math.min(1, this.player.trauma + 0.12);
    }

    // Camera kick: a bit of permanent climb plus a springy punch (per weapon).
    const c = w.camera;
    this.player.pitch += c.climb;
    this.player.yaw += rand(-c.yaw, c.yaw);
    this.player.kickPitch.impulse(c.pitchKick);
    this.player.kickYaw.impulse(rand(-c.yawKick, c.yawKick));
    this.player.kickRoll.impulse(rand(-c.roll, c.roll));
    this.player.fovPunch = c.fov;
    this.player.trauma = Math.min(1, this.player.trauma + c.trauma);
  }

  /**
   * Rounds that pass within 1.8 m of an enemy's chest without hitting it suppress it, more the closer
   * they pass. Collected per pull, applied once per enemy (the strongest pellet).
   */
  private nearMisses(origin: THREE.Vector3, dir: THREE.Vector3, len: number, hit: Enemy | null, out: Map<Enemy, number>) {
    for (const e of this.ctx.enemies) {
      if (!e.alive || e === hit) continue;
      const k = nearMissDose(origin, dir, len, e.chest);
      if (k > 0) out.set(e, Math.max(out.get(e) ?? 0, k));
    }
  }

  // ------------------------------------------------------------------ frame
  private frame() {
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
      this.level.titleCamera(this.camera, this.elapsed);
      this.renderer.grade.uniforms.uFade.value = damp(this.renderer.grade.uniforms.uFade.value, this.loading ? 1 : 0.25, 1.5, rawDt);
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
      this.player.update(dt, input, controls, this.elapsed);
      if (this.state === 'play' && this.player.alive) this.safety.update(dt, this.player);
      if (controls && this.player.alive) {
        if (input.pressed.has(KEYS.holster)) this.weapon.toggleHolster();
        if (input.pressed.has(KEYS.reload)) this.weapon.startReload();
        if (input.mouseDown && this.weapon.tryFire()) this.shoot();
      }
      this.player.applyCamera(this.camera, this.elapsed);
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
        this.timeScale = 0.35;
        this.weapon.raiseTarget = 0;
        document.exitPointerLock();
      }
      if (this.state === 'dead') {
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
          });
        }
      }
      if (this.state === 'play') this.updateZone(dt);
      // HUD.
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setAmmo(this.weapon.ammo, this.weapon.reloading);
      this.hud.setArmed(this.weapon.visible);
      this.hud.setWave(this.waves.wave, this.waves.remaining, this.waves.state === 'break');
      this.hud.root.classList.toggle('holstered', this.weapon.holstered);
      this.hud.setSpread(4 + this.player.moveAmount * 6 + this.weapon.bloom * 12 + (this.player.onGround ? 0 : 10));
    }

    if (!paused) this.updateWorld(dt, rawDt);
    this.updateMusic(dt);
    this.hud.update(rawDt);
    this.barkView.update(dt, this.camera, this.state === 'play' && this.mode === 'arcade');
    this.audio.updateListener(this.camera);
    if (!paused) this.audio.update(dt, this.camera.position);

    // Weapon camera mirrors the main camera's lens (without sprint FOV, to avoid gun distortion).
    this.weaponCamera.fov = 58;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.render(this.elapsed);
    this.adaptQuality(rawDt);
    input.endFrame();
  }

  private updateMusic(dt: number) {
    const s = this.state === 'paused' ? this.stateBeforePause : this.state;
    this.music.update(dt, { mode: s === 'play' ? 'play' : s === 'dead' ? 'dead' : 'menu', intensity: this.player ? this.rules.musicIntensity() : 0 });
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
    // Let the menu paint before the synchronous rebuild.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
    try {
      this.loadLevel(this.setting);
    } finally {
      this.loading = false;
    }
    this.weapon.reset();
    this.weapon.setHolstered(false, true);
    this.weapon.raiseTarget = 0;
    this.timeScale = 1;
    this.damageFx = 0;
    this.failReason = '';
    this.zone = this.zoneCandidate = null;
    this.interaction.reset();
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
      music: { state: this.music.state, backend: this.music.kind, tracks: this.music.activeTracks(), ...this.music.debug() },
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
      ...this.level.debug?.(),
    };
  }
}
