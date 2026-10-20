import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { InteractionController, type Interactable } from './Interaction';
import { FramePacer, PRESETS, effectiveCap } from './Performance';
import { clamp, damp, rand } from './math';
import { AudioEngine } from '../audio/AudioEngine';
import { MusicDirector } from '../audio/music/MusicDirector';
import { CollisionWorld, type RayHit } from '../world/Collision';
import { Glows } from '../world/Glows';
import { City } from '../world/City';
import type { SignGlow } from '../world/Signs';
import { buildDistrict, type DistrictResult } from '../world/District';
import { Fountain } from '../world/Fountain';
import { Events } from '../world/Events';
import { createStreak, updateStreaks } from '../world/Ground';
import { Rain, Steam } from '../world/Rain';
import { Train } from '../world/Train';
import { smokeTexture } from '../world/Textures';
import { zoneAt, type Zone } from '../world/Zones';
import { Effects } from '../combat/Effects';
import { Interactives } from '../gameplay/Interactives';
import { Player } from '../player/Player';
import { Weapon } from '../player/Weapon';
import { Projectiles } from '../enemies/Projectiles';
import { Nav } from '../enemies/Nav';
import { Waves } from '../enemies/Waves';
import type { Enemy, EnemyCtx, EnemyHit } from '../enemies/Enemy';
import { Hud, jpNumber } from '../ui/Hud';
import { PauseMenu } from '../ui/PauseMenu';
import { loadSettings, saveSettings, type Settings } from '../ui/Settings';
import { Intro } from '../cinematic/Intro';
import { Security } from '../stealth/Security';
import { StoryHud, type ThreatMark } from '../ui/StoryHud';
import { SEARCH_TIME } from '../stealth/AlertSystem';
import { Crowd } from '../city/Crowd';
import { Rail, type RailEvent } from '../rail/Rail';
import { fmt } from '../rail/Timetable';
import { Ending } from '../story/Ending';
import { EndScreen } from '../ui/EndScreen';
import { CAR_CENTRES, TRACK_Z } from '../world/Metro';
import { Mission } from '../story/Mission';
import { Marker } from '../ui/Marker';
import { Minimap } from '../ui/Minimap';
import { PlayerIntel, intelRange } from '../stealth/PlayerIntel';

export type Mode = 'story' | 'arcade';

type State = 'title' | 'intro' | 'play' | 'paused' | 'dead' | 'ending';

/** Something the player can use with E when close and facing it. */
export type { Interactable };

const FOG_COLOR = new THREE.Color(0x0d0b19);

export class Game {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 500);
  weaponScene = new THREE.Scene();
  weaponCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
  fog = new THREE.FogExp2(FOG_COLOR, 0.022);
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
  private stateBeforePause: State = 'play';
  security!: Security;
  crowd!: Crowd;
  rail!: Rail;
  private ending: Ending | null = null;
  endScreen: EndScreen;
  interactables: Interactable[] = [];
  private interaction = new InteractionController();
  /** Why the run ended (death screen title). */
  private failReason = '';
  storyHud: StoryHud;
  private chatterT = 2;

  private city!: City;
  district!: DistrictResult;
  private rain!: Rain;
  private train!: Train;
  private fountain!: Fountain;
  private events!: Events;
  private interactives!: Interactives;
  private streaks: THREE.Mesh[] = [];
  private signs: SignGlow[] = [];
  private hums: { glow: SignGlow; h: ReturnType<AudioEngine['addHum']>; last: number }[] = [];
  fx!: Effects;
  mission!: Mission;
  marker!: Marker;
  minimap!: Minimap;
  /** What the player knows about each guard: last seen/heard position and when. */
  /** What the player knows about security (minimap). */
  intel!: PlayerIntel;
  private knowT = 0;
  private frustum = new THREE.Frustum();
  private projM = new THREE.Matrix4();
  stationKnown = false;
  player!: Player;
  weapon!: Weapon;
  private projectiles!: Projectiles;
  nav!: Nav;
  waves = new Waves();
  private intro: Intro | null = null;
  private coverPoints: THREE.Vector3[] = [];
  private occupied = new Set<THREE.Vector3>();
  private hemi!: THREE.HemisphereLight;
  private muzzleLight!: THREE.PointLight;
  private muzzleT = 0;
  private thunderT = 25;
  private thunderFlash = 0;
  private pendingThunder = -1;
  private damageFx = 0;
  private timeScale = 1;
  private deadT = 0;
  private stats = { shots: 0, hits: 0, start: 0 };
  private clock = new THREE.Timer();
  private pacer = new FramePacer();
  /** The next drawn frame starts the clock afresh (after a pause, a hidden tab, a stall). */
  private freshClock = true;
  elapsed = 0;
  private ready = false;
  ctx!: EnemyCtx;
  private zone: Zone | null = null;
  private zoneCandidate: Zone | null = null;
  private zoneT = 0;
  private wind = 0;
  private perf = { acc: 0, frames: 0, fps: 60, lowT: 0, highT: 0 };
  private tmpHit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

  constructor(container: HTMLElement) {
    this.scene.fog = this.fog;
    this.scene.background = FOG_COLOR;
    this.camera.position.set(-1.5, 0.6, 42);
    this.camera.lookAt(0, 3, 20);
    this.weaponScene.add(this.weaponCamera);
    this.renderer = new Renderer(container, this.scene, this.camera, this.weaponScene, this.weaponCamera);
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(document.body);
    this.storyHud = new StoryHud(document.body);
    this.storyHud.show(false);
    this.endScreen = new EndScreen(document.body);
    this.settings = loadSettings();
    this.menu = new PauseMenu(document.body, this.settings);
    this.applySettings();
    this.renderer.grade.uniforms.uFade.value = 1;
  }

  async init() {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts API unavailable: fall back silently */
    }
    // Optional music files are fetched while the city builds (procedural score otherwise).
    try {
      this.music.preload(new OfflineAudioContext(2, 1, 44100));
    } catch {
      /* no OfflineAudioContext: procedural only */
    }
    // Let the title paint before the heavy procedural build.
    await new Promise((r) => setTimeout(r, 30));
    this.buildWorld();
    this.ready = true;
    this.applyGraphics();
    this.hud.setReady();
    this.bindUi();
    this.startLoop();
    this.bindPower();
  }

  /** The display-refresh callback: draws only when the frame cap and the game state call for it. */
  private startLoop() {
    this.pacer.reset();
    this.freshClock = true;
    this.renderer.renderer.setAnimationLoop((now) => {
      if (!this.pacer.tick(now, effectiveCap(this.settings.fps, this.state, document.hasFocus()))) return;
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
    for (const g of this.signs) if (g.light) g.light.visible = p.signLights;
    this.perf.lowT = this.perf.highT = 0;
  }

  private buildWorld() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x3a4280, 0x1a0e22, 0.55);
    s.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x5868a8, 0.25);
    moon.position.set(-20, 60, -30);
    s.add(moon);

    this.city = new City(s, this.col, this.glows, this.time, this.fog);
    const d = buildDistrict(this.city, () => this.wind);
    this.district = d;
    this.signs = d.signs;
    this.fountain = new Fountain(this.city.ctx, this.glows);
    this.city.ctx.builder.build(s);
    this.coverPoints = d.coverPoints;
    this.city.buildSky();

    // Bake an environment map of the lit district once: wet and metal surfaces reflect neon for free.
    this.glows.update(0, new THREE.Vector3());
    const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
    const env = pmrem.fromScene(s, 0.02, 0.1, 300, { position: new THREE.Vector3(0, 3, 4) } as never).texture;
    s.environment = env;
    s.environmentIntensity = 0.9;
    this.weaponScene.environment = env;
    pmrem.dispose();

    for (const g of this.glows.list) {
      if (g.reflect) {
        const m = createStreak(g, this.time, this.fog);
        this.streaks.push(m);
        s.add(m);
      }
    }
    this.train = new Train(s, this.glows);
    this.train.onPass = (dir) => this.audio.trainPass(dir);
    this.train.onWarn = () => this.audio.stationChime();
    this.train.onBell = () => this.audio.crossingBell({ x: 0, y: 8.5, z: -21 });

    this.fx = new Effects(s, this.fog);
    this.fx.onShellBounce = (p, k) => this.audio.shellBounce(p, k);
    this.events = new Events(this.glows, this.fx, this.audio, this.signs, d.transformers, d.vents, d.trackside);
    this.interactives = new Interactives(s, this.glows, this.fx, this.audio, d.cabinets, d.medkits, d.breakables);
    this.interactives.onKill = () => this.waves.kills++;

    this.glows.buildHalos(s);
    this.rain = new Rain(s, this.glows, this.time, this.fog, {
      open: d.open,
      holes: this.col.holes,
      surfaces: d.arch.surfaces.concat([
        { x0: -5, z0: 15, x1: -3.6, z1: 48, y: 0.12 },
        { x0: 3.6, z0: 15, x1: 5, z1: 48, y: 0.12 },
        { x0: -6, z0: -58, x1: -4.6, z1: -15, y: 0.12 },
        { x0: 4.6, z0: -58, x1: 6, z1: -15, y: 0.12 },
      ]),
      shelters: d.arch.shelters.concat([{ x0: -80, z0: -26, x1: 80, z1: -21, y: 6.4 }]),
    });
    new Steam(s, this.glows, this.time, d.steamEmitters, smokeTexture(), this.fog);

    this.muzzleLight = new THREE.PointLight(0xffa860, 0, 14, 2);
    s.add(this.muzzleLight);

    this.player = new Player(this.col, this.audio);
    this.player.reset(d.start.x, d.start.z, d.start.yaw);
    this.weapon = new Weapon(this.weaponScene, this.weaponCamera, this.audio);
    this.projectiles = new Projectiles(s, this.col, this.fx, this.audio);
    this.projectiles.onPlayerHit = (dmg, from) => this.damagePlayer(dmg, from);
    this.nav = new Nav(this.col, d.nav);

    // Only spawn on open ground that the nav graph can reach: never inside walls or off-map.
    this.waves.spawns = d.spawns.filter((p) => {
      const ok = !this.col.blocked(p, 0.5) && Math.abs(this.col.groundHeightAt(p.x, p.z, 0.3, p.y + 0.1) - p.y) < 0.05 && this.nav.nearestVisible(new THREE.Vector3(p.x, p.y + 1, p.z)) >= 0;
      if (!ok) console.warn('[district] rejected spawn', p.toArray());
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
      coverPoints: this.coverPoints,
      occupied: this.occupied,
      enemies: this.waves.enemies,
      bounds: d.bounds,
      perches: d.perches,
      damagePlayer: (dmg, f) => this.damagePlayer(dmg, f),
    };
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
    this.security = new Security(this.ctx, this.glows, () => this.weapon.visible, { radio: (pos, kind) => this.audio.radio(pos, kind) });
    this.security.doors = d.doors;
    this.security.onRadio = (text, tone) => this.storyHud.radioLine(text, tone);
    this.events.onSteam = (v) => this.security.addBlocker(v.clone().setY(v.y + 1.6), 2.4, 4.5);
    this.crowd = new Crowd(s, this.col, this.nav, d.pois);
    this.rail = new Rail(s, this.col, d.metro);
    this.rail.onEvent = (e) => this.onRail(e);
    for (const b of d.metro.boards) {
      this.interactables.push({ pos: b.readAt, radius: 3.2, label: 'READ DEPARTURES', enabled: () => this.mode === 'story', action: () => this.readBoard() });
    }
    this.security.civilianBlocks = (a, b) => this.crowd.blocks(a, b);
    this.security.onShot = (at) => this.crowd.onGunshot(at, this.elapsed);
    this.crowd.onReport = (pos) => this.security.civilianReport(pos);
    this.crowd.onCalling = () => this.storyHud.radioLine('A WITNESS IS CALLING SECURITY — GET OUT OF SIGHT', 'warn');
    this.crowd.onScream = (pos) => this.audio.scream(pos);
    this.crowd.onAbandon = () => this.storyHud.radioLine('THE WITNESS HUNG UP', 'info');
    this.waves.onSniper = () => this.music.accent();
    this.waves.onLastEnemy = () => this.music.accent();

    this.marker = new Marker(s);
    this.mission = new Mission(this);
    this.intel = new PlayerIntel(this.col);
    this.minimap = new Minimap(this.hud.root, {
      street: d.open.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 })),
      upper: d.arch.decks,
      under: d.metro.rooms,
      stairs: d.arch.stairs.map((st) => ({ x0: st.x0, z0: st.z0, x1: st.x1, z1: st.z1 })),
    });
    // Hearing counts as knowing roughly where they are.
    this.security.onHeard = (g) => {
      if (g.pos.distanceTo(this.player.pos) < 30) this.intel.heard(g, this.elapsed);
    };

    // Compile everything up front so the first shot doesn't hitch.
    this.renderer.renderer.compile(s, this.camera);
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
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-mode],[data-act]');
      if (!el) return;
      this.audio.start();
      this.applySettings();
      this.audio.uiBlip();
      const act = el.dataset.act;
      if (act === 'settings') return this.menu.show(true, 'settings');
      if (act === 'controls') return this.hud.showControls(true);
      if (act === 'back') return this.hud.showControls(false);
      this.mode = el.dataset.mode === 'arcade' ? 'arcade' : 'story';
      this.music.start(this.audio);
      this.startAudioWorld();
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
    this.menu.onRestart = () => {
      this.menu.show(false);
      this.music.setPaused(false);
      this.restart(false);
    };
    this.endScreen.onRestart = () => {
      this.endScreen.hide();
      this.restart(false);
    };
    this.endScreen.onMenu = () => this.toTitle();
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
    this.input.onAnyKey = () => {
      if (this.state === 'intro' && this.intro && this.intro.t > 0.4) this.intro.skip();
    };
    window.addEventListener('mousedown', () => {
      if (this.state === 'intro' && this.intro && this.intro.t > 0.4) this.intro.skip();
    });
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
    this.state = this.stateBeforePause;
    this.menu.show(false);
    this.music.setPaused(false);
  }

  private audioWorld = false;
  private startAudioWorld() {
    if (this.audioWorld) return;
    this.audioWorld = true;
    for (const g of this.signs) {
      if (g.hum) this.hums.push({ glow: g, h: this.audio.addHum(g.pos, 100 + Math.random() * 20), last: 1 });
    }
    this.audio.addLoop({ x: 0, y: 1, z: 0 }, 'fountain');
    this.audio.addLoop(this.district.pachinko, 'pachinko');
  }

  private startIntro() {
    this.state = 'intro';
    const st = this.district.storyStart;
    this.intro = new Intro(
      this.scene,
      this.audio,
      this.projectiles.light,
      this.mode === 'story' ? { end: new THREE.Vector3(st.x, 1.65, st.z), endLook: new THREE.Vector3(st.x - 10, 1.65, st.z) } : {},
    );
    this.hud.setCine(this.mode);
    // A train rolls over the plaza while the camera glides in.
    this.train.startNow(1, -190);
    this.hud.show(this.hud.skip, true);
    this.hud.skip.style.opacity = '1';
  }

  private beginPlay(fromCheckpoint = false) {
    this.state = 'play';
    this.intro?.dispose();
    this.intro = null;
    this.hud.skip.style.opacity = '0';
    this.hud.cine.style.opacity = '0';
    this.hud.show(this.hud.root, true);
    this.hud.root.classList.toggle('story', this.mode === 'story');
    if (!fromCheckpoint) this.stats = { shots: 0, hits: 0, start: this.elapsed };
    this.zone = null;
    this.interaction.reset();
    if (this.mode === 'story') {
      const st = this.district.storyStart;
      this.player.reset(st.x, st.z, st.yaw);
      this.weapon.raiseTarget = 1;
      this.weapon.setHolstered(true, true);
      this.crowd.setVisible(true);
      this.ctx.enemies = this.security.guards;
      this.storyHud.clear();
      this.storyHud.show(true);
      this.minimap.show(true);
      this.intel.clear();
      this.stationKnown = false;
      this.mission.start(fromCheckpoint);
      if (!fromCheckpoint) this.storyHud.radioLine('H — HOLSTER / DRAW · E — INTERACT · A DRAWN WEAPON DRAWS ATTENTION', 'info');
      else this.storyHud.radioLine('CHECKPOINT', 'info');
    } else {
      const st = this.district.start;
      this.player.reset(st.x, st.z, st.yaw);
      this.weapon.raiseTarget = 1;
      this.weapon.setHolstered(false, true);
      this.ctx.enemies = this.waves.enemies;
      this.setStationOpen(false);
      this.storyHud.show(false);
      this.minimap.show(false);
      this.marker.set(null);
      this.crowd.setVisible(false);
      this.crowd.civs.length = 0;
      this.waves.startNext();
    }
    if (!this.input.locked) this.pause();
  }

  private restart(fromCheckpoint = false) {
    this.hud.show(this.hud.death, false);
    this.waves.reset(this.scene);
    this.security.clear();
    this.occupied.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.weapon.reset();
    this.interactives.reset();
    this.events.reset();
    this.rail.reset();
    this.ending = null;
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
    const spread = 0.003 + this.player.moveAmount * 0.012 + this.weapon.bloom * 0.018 + (this.player.onGround ? 0 : 0.03);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.stats.shots++;

    const wh = this.col.raycast(origin, dir, 200, this.tmpHit);
    let maxDist = wh ? wh.dist : 200;
    let target: Enemy | null = null;
    let eh: EnemyHit | null = null;
    if (this.mode === 'story') this.security.gunshot(origin, true);
    for (const e of this.ctx.enemies) {
      const h = e.raycast(origin, dir);
      if (h && h.dist < maxDist) {
        maxDist = h.dist;
        target = e;
        eh = h;
      }
    }
    // Bystanders are in the way too.
    const ch = this.mode === 'story' ? this.crowd.raycast(origin, dir, maxDist) : null;
    if (ch && ch.dist < maxDist) {
      maxDist = ch.dist;
      target = null;
      eh = null;
    }
    const muzzle = cam.localToWorld(new THREE.Vector3(0.15, -0.1, -0.55));
    const end = origin.clone().addScaledVector(dir, maxDist);
    this.fx.tracer(muzzle, end);
    this.fx.muzzleSmoke(muzzle, dir);
    this.fx.ejectShell(cam.localToWorld(new THREE.Vector3(0.18, -0.08, -0.35)), right, up);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleT = 0.06;

    if (target && eh) {
      this.stats.hits++;
      const dmg = 34 * eh.mult * rand(0.95, 1.05);
      const killed = target.takeHit(dmg, dir, eh.point, this.ctx);
      this.hud.hitmarker(killed);
      this.audio.hitmarker(killed);
      if (killed) {
        if (this.mode === 'arcade') this.waves.kills++;
        this.player.trauma = Math.min(1, this.player.trauma + 0.12);
      }
    } else if (ch && ch.dist <= maxDist) {
      const pt = origin.clone().addScaledVector(dir, ch.dist);
      this.fx.enemyHit(pt, dir, new THREE.Color(0.6, 0.1, 0.1));
      this.audio.hitEnemy(pt, false);
      this.crowd.hit(ch.civ, dir);
    } else if (wh) {
      this.fx.impact(wh.point, wh.normal, wh.surface);
      this.audio.hitSurface(wh.point, wh.surface);
      // Cabinets, lamps and other shootable props.
      wh.collider?.onHit?.(wh);
    }

    // Camera kick: a bit of permanent climb plus a springy punch.
    this.player.pitch += 0.007;
    this.player.yaw += rand(-0.002, 0.002);
    this.player.kickPitch.impulse(5);
    this.player.kickYaw.impulse(rand(-1.5, 1.5));
    this.player.kickRoll.impulse(rand(-1, 1));
    this.player.fovPunch = 1.6;
    this.player.trauma = Math.min(1, this.player.trauma + 0.08);
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
      // Slow ambient drift behind the title, looking up Lantern Street towards the plaza.
      const t = this.elapsed;
      this.camera.position.set(-1.5 + Math.sin(t * 0.05) * 0.6, 0.6 + Math.sin(t * 0.13) * 0.1, 42 - Math.sin(t * 0.04) * 2);
      this.camera.lookAt(0.5, 3, 20);
      this.renderer.grade.uniforms.uFade.value = damp(this.renderer.grade.uniforms.uFade.value, 0.25, 1.5, rawDt);
    } else if (this.state === 'intro' && this.intro) {
      const f = this.intro.update(dt, this.camera);
      const g = this.renderer.grade.uniforms;
      g.uFade.value = f.fade;
      g.uLetterbox.value = f.letterbox;
      this.hud.cine.style.opacity = f.title ? '1' : '0';
      if (f.raiseWeapon) this.weapon.raiseTarget = 1;
      if (f.hud) this.hud.show(this.hud.root, true);
      if (f.done) this.beginPlay();
    } else if (this.state === 'ending' && this.ending) {
      const f = this.ending.update(dt, this.camera);
      const g = this.renderer.grade.uniforms;
      g.uFade.value = f.fade;
      g.uLetterbox.value = damp(g.uLetterbox.value, f.letterbox, 3, rawDt);
      if (f.done && this.endScreen.root.classList.contains('hidden')) this.showEndScreen();
    } else if (this.state === 'play' || this.state === 'dead') {
      const controls = this.state === 'play' && input.locked;
      this.player.update(dt, input, controls, this.elapsed);
      if (controls && this.player.alive) {
        if (input.pressed.has('KeyH')) this.weapon.toggleHolster();
        if (input.pressed.has('KeyR')) this.weapon.startReload();
        if (input.mouseDown && this.weapon.tryFire()) this.shoot();
      }
      this.player.applyCamera(this.camera, this.elapsed);
      if (this.mode === 'story') {
        this.security.update(dt);
        this.crowd.update(dt, this.elapsed, this.player, this.weapon.visible, this.security.alert.level === 'pursuit');
        this.mission.update(dt);
        this.updateStoryHud(rawDt);
        this.ambientChatter(dt);
        this.updateInteraction(dt);
        this.updateKnowledge(rawDt);
        const md = this.marker.update(this.camera.position, this.elapsed);
        this.storyHud.setDistance(md);
        this.hud.setClock(fmt(this.rail.tt.now));
      } else {
        this.ctx.difficulty = this.waves.difficulty;
        this.waves.update(dt, this.ctx);
      }
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
          this.hud.showDeath({
            title: this.failReason || undefined,
            story: this.mode === 'story',
            wave: this.waves.wave,
            kills: this.mode === 'story' ? this.security.stats.guardsDown : this.waves.kills,
            accuracy: this.stats.shots ? this.stats.hits / this.stats.shots : 0,
            time: this.elapsed - this.stats.start,
          });
        }
      }
      if (this.state === 'play') this.updateZone(dt);
      // HUD.
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setAmmo(this.weapon.ammo, this.weapon.reloading);
      this.hud.setWave(this.waves.wave, this.waves.remaining, this.waves.state === 'break');
      this.hud.root.classList.toggle('holstered', this.weapon.holstered);
      this.hud.setSpread(4 + this.player.moveAmount * 6 + this.weapon.bloom * 12 + (this.player.onGround ? 0 : 10));
    }

    if (!paused) this.updateWorld(dt, rawDt);
    this.updateMusic(dt);
    this.hud.update(rawDt);
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
    this.music.update(dt, { mode: s === 'play' ? 'play' : s === 'dead' ? 'dead' : 'menu', intensity: this.musicIntensity() });
  }

  /** How tense the moment is, from what the player is going through (never from hidden information). */
  private musicIntensity(): number {
    if (!this.player) return 0;
    const hp = this.player.health / this.player.maxHealth;
    if (this.mode === 'arcade') {
      if (this.waves.state !== 'fighting') return 0.15;
      const alive = this.waves.enemies.filter((e) => e.alive).length;
      return Math.min(1, 0.72 + alive * 0.03 + (hp < 0.3 ? 0.1 : 0));
    }
    const a = this.security.alert;
    let x = 0.06;
    switch (a.level) {
      case 'suspicious':
        x = 0.3 + 0.18 * Math.max(0, ...this.security.guards.map((g) => (g.alive && !g.hostile ? g.suspicion : 0)));
        break;
      case 'alerted':
        x = 0.42;
        break;
      case 'search':
        x = 0.34 + 0.2 * (a.searchLeft(this.elapsed) / SEARCH_TIME);
        break;
      case 'pursuit': {
        const p = this.player.pos;
        const fighting = this.security.guards.some((g) => g.alive && g.gstate === 'combat' && g.pos.distanceTo(p) < 30);
        const close = this.security.hostiles(30);
        x = fighting ? 0.86 + Math.min(0.14, close * 0.03) : 0.64;
        break;
      }
    }
    // The last train is close: a little more urgency.
    const esc = this.rail.tt.escapeService();
    if (esc && !esc.suspended && this.rail.tt.secondsUntil(esc) < 60) x = Math.max(x, 0.42);
    if (hp < 0.3 && a.level === 'pursuit') x = Math.min(1, x + 0.08);
    return x;
  }

  /** Location card when the player settles in a new area (debounced so corners don't spam it). */
  private updateZone(dt: number) {
    const p = this.player.pos;
    const z = zoneAt(p.x, p.y, p.z);
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

  // ------------------------------------------------------------------ rail, interaction, ending
  private onRail(e: RailEvent) {
    const story = this.mode === 'story' && this.state === 'play';
    if (this.mode === 'story') this.mission.onRail(e);
    const doorPos = { x: CAR_CENTRES[1], y: -4.5, z: TRACK_Z - 1.5 };
    switch (e.type) {
      case 'approach':
        if (e.s.kind === 'deadhead') {
          this.audio.announce(1.6);
          if (story && this.player.pos.y < -2) this.storyHud.radioLine('PA — A train is passing through. Please stand back. 通過電車にご注意ください', 'story');
        } else {
          this.audio.announce(2.8);
          if (story && this.player.pos.y < -2) {
            this.storyHud.radioLine(
              e.s.escape
                ? `PA — Now arriving: the last express for ${e.s.dest}. まもなく終電が参ります`
                : `PA — Now arriving: local for ${e.s.dest}. まもなく各駅停車が参ります`,
              'story',
            );
          }
        }
        break;
      case 'doorsOpen':
        this.audio.doorChime(doorPos, true);
        break;
      case 'closingSoon':
        this.audio.departureMelody();
        this.audio.doorWarning(doorPos);
        if (story && this.rail.train.inside(this.player.pos) && !e.s.escape) this.storyHud.radioLine('THE DOORS ARE CLOSING — THIS LOCAL RUNS INTO A CHECKPOINT. GET OFF!', 'alert');
        break;
      case 'held':
        if (story) this.storyHud.radioLine('PA — Door obstruction. The train is holding. ドアにご注意ください', 'warn');
        break;
      case 'doorsClosed':
        this.audio.doorChime(doorPos, false);
        if (story && e.aboard) {
          if (e.s.escape) this.startEnding();
          else this.caught();
        }
        break;
      case 'depart':
        break;
    }
  }

  /** Nearest usable thing in front of the player, shown as a prompt; E is handled here only. */
  private updateInteraction(dt: number) {
    const p = this.player.pos;
    const fwd = this.player.forward(new THREE.Vector3());
    const live = this.input.locked && this.player.alive;
    const label = this.interaction.update(this.interactables, p, fwd, live && this.input.pressed.has('KeyE'), live && this.input.key('KeyE'), dt);
    // A local's doors are open and we're inside: say what that means.
    const inLocal = this.rail.train.inside(p) && this.rail.train.doorK > 0.5 && !this.rail.tt.active()?.s.escape;
    this.storyHud.setHint(label ?? (inLocal ? 'THIS LOCAL STOPS AT A SECURITY CHECKPOINT' : null));
  }

  private readBoard() {
    const rows = this.rail.tt.upcoming(4).filter((s) => s.kind !== 'deadhead').slice(0, 3);
    this.storyHud.radioLine(`BOARD ${fmt(this.rail.tt.now)} — ` + rows.map((s) => `${fmt(s.time)} ${s.escape ? 'LAST EXPRESS' : 'LOCAL'} ${s.dest}${s.escape ? '' : ' (CHECKPOINT)'}`).join(' · '), 'story');
    this.onBoardRead();
  }

  /** Hook for the mission (reading the departures). */
  onBoardRead: () => void = () => {};

  private startEnding() {
    this.state = 'ending';
    this.ending = new Ending(this.rail.train, this.train);
    this.hud.show(this.hud.root, false);
    this.storyHud.show(false);
    this.weapon.raiseTarget = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private showEndScreen() {
    const a = this.security.alert;
    const levels = ['UNNOTICED', 'SUSPICIOUS', 'ALERTED', 'SEARCH', 'PURSUIT'];
    this.endScreen.show({
      time: this.elapsed - this.stats.start,
      guardsDown: this.security.stats.guardsDown,
      detected: a.timesDetected,
      escapes: a.escapes,
      maxAlert: levels[a.maxRank],
      alarmed: this.crowd.stats.alarmed,
      harmed: this.crowd.stats.harmed,
      accuracy: this.stats.shots ? this.stats.hits / this.stats.shots : 0,
      interactions: this.envUses,
    });
  }
  /** Environment used against security (cabinets, lamps, steam). */
  envUses = 0;

  /** Rode a local into the checkpoint. */
  private caught() {
    this.failReason = 'CAUGHT AT THE CHECKPOINT';
    this.player.health = 0;
    this.player.alive = false;
  }

  /** Back to the title screen with a clean world. */
  toTitle() {
    this.endScreen.hide();
    this.hud.show(this.hud.death, false);
    this.hud.show(this.hud.root, false);
    this.storyHud.show(false);
    this.menu.show(false);
    this.waves.reset(this.scene);
    this.security.clear();
    this.crowd.setVisible(false);
    this.crowd.civs.length = 0;
    this.rail.reset();
    this.marker.set(null);
    this.ending = null;
    this.timeScale = 1;
    this.renderer.grade.uniforms.uLetterbox.value = 0;
    this.state = 'title';
    this.hud.show(this.hud.title, true);
  }

  /**
   * Minimap knowledge: guards the player can actually see (on screen, line of sight) or has just heard.
   * Old sightings fade out at their last known spot.
   */
  private updateKnowledge(dt: number) {
    const t = this.elapsed;
    this.knowT -= dt;
    if (this.knowT <= 0) {
      this.knowT = 0.1;
      this.projM.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projM);
      const eye = this.camera.position;
      for (const g of this.security.guards) {
        if (!g.alive) continue;
        // Openly noticing or attacking him: he can tell where that one is and where he looks.
        const engaging = g.sees && g.suspicion > 0.05;
        const chest = g.chest.clone();
        const inView = chest.distanceTo(eye) < 55 && this.frustum.containsPoint(chest) && this.col.lineOfSight(eye, chest);
        if (inView || engaging) this.intel.observe(g, t);
      }
    }
    const player = { weaponDrawn: this.weapon.visible, hunting: this.security.alert.hunting(t), firing: this.security.playerFiring(t) };
    const blips = this.intel.blips(t, this.player.pos.y, (k) => intelRange(k, player));
    if (!this.stationKnown && (this.mission.act >= 2 || this.player.pos.distanceTo(new THREE.Vector3(9.1, 0, 4)) < 18)) this.stationKnown = true;
    this.minimap.draw(this.player.pos, this.player.yaw, this.marker.target, blips, this.stationKnown ? new THREE.Vector3(9.1, 0, 4) : null);
  }

  /** Snippets of conversation from calm people nearby. */
  /** Lockdown on/off: station shutters, the stair links in the nav graph, where civilians may walk. */
  setStationOpen(open: boolean) {
    const m = this.district.metro;
    for (const sh of m.shutters) sh.setOpen(open);
    for (const e of m.entrances) this.nav.setLinks([[e.chain[0], e.chain[1]], [e.chain[1], e.chain[2]]], open);
    this.crowd.setUnderground(open);
  }

  private ambientChatter(dt: number) {
    this.chatterT -= dt;
    if (this.chatterT > 0) return;
    this.chatterT = rand(1.2, 3.5);
    const near = this.crowd.civs.filter((c) => (c.state === 'chat' || c.state === 'idle' || c.state === 'walk') && c.pos.distanceTo(this.player.pos) < 14);
    if (near.length) {
      const c = near[Math.floor(Math.random() * near.length)];
      this.audio.chatter(c.pos.clone().setY(c.pos.y + 1.5));
    }
  }

  /** Wanted status and the arcs around the crosshair for guards that are noticing or attacking. */
  private updateStoryHud(dt: number) {
    const a = this.security.alert;
    const t = this.elapsed;
    let meter = 0;
    const marks: ThreatMark[] = [];
    const p = this.player.pos;
    for (const g of this.security.guards) {
      if (!g.alive) continue;
      const d = g.pos.distanceTo(p);
      if (d > 45) continue;
      meter = Math.max(meter, g.suspicion);
      const attacking = g.threat >= 3;
      const ang = Math.atan2(g.pos.x - p.x, g.pos.z - p.z);
      let rel = -(ang - (this.player.yaw + Math.PI));
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      // A hunter close behind you who can see you: you'd hear him (footsteps, radio).
      const behind = g.hostile && g.sees && d < 15 && Math.abs(rel) > 0.9;
      // Arcs only for guards that are noticing you, hunting you up close, or shooting at you (no wallhack).
      if (!(g.suspicion > 0.05 && !g.hostile) && !attacking && !behind) continue;
      marks.push({ angle: rel, level: attacking ? 3 : behind ? 2 : 1, k: g.suspicion });
    }
    if (a.level === 'search') meter = a.searchLeft(t) / SEARCH_TIME;
    else if (a.level === 'pursuit') meter = 1;
    else if (a.level === 'alerted') meter = 0.5;
    this.storyHud.setWanted(a.level, meter);
    this.storyHud.drawThreats(marks);
    this.storyHud.update(dt);
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

  private updateWorld(dt: number, rawDt: number) {
    const camPos = this.camera.position;
    this.glows.update(this.elapsed, camPos);
    updateStreaks(this.streaks, camPos);
    this.rain.update(this.elapsed, camPos);
    const w = this.rain.uniforms.uWind.value as THREE.Vector2;
    this.wind = (w.x - 1.0) / 1.4;
    this.train.update(dt);
    this.fx.update(dt);
    this.district.kit.update(this.elapsed, dt);
    for (const sh of this.district.metro.shutters) sh.update(dt);
    // Security fighting the fugitive right by the train holds the escape train's doors.
    const engaged = this.mode === 'story' && this.security.guards.some((g) => g.alive && g.gstate === 'combat' && g.pos.distanceTo(this.player.pos) < 14);
    this.rail.update(dt, this.player.pos, engaged);
    const under = camPos.y < -2;
    const nearWell = this.col.holes.some((h) => Math.hypot(Math.max(h.x0 - camPos.x, 0, camPos.x - h.x1), Math.max(h.z0 - camPos.z, 0, camPos.z - h.z1)) < 12);
    this.audio.metroRumble(this.rail.train.group.visible ? (under ? 1 : nearWell ? 0.25 : 0.04) : 0, this.rail.speed);
    this.audio.setUnderground(camPos.y < -2 ? 1 : 0);
    // Thinner haze underground (no rain, stale air rather than street fog).
    this.fog.density = damp(this.fog.density, camPos.y < -2 ? 0.012 : 0.022, 2, rawDt);
    this.district.billboard.offset.y = (this.elapsed * 0.035) % 1;
    this.events.update(dt, this.elapsed, camPos, this.train.rumble);

    // Neon hum follows each sign's flicker; a sudden drop throws sparks.
    for (const h of this.hums) {
      const v = h.glow.value;
      this.audio.setHum(h.h, v);
      if (h.last > 0.7 && v < 0.3 && Math.random() < 0.25) {
        this.audio.sparkCrackle(h.glow.pos);
        this.fx.sparks(h.glow.pos.clone(), new THREE.Vector3(0, -1, 0), 8, new THREE.Color(0.8, 0.9, 1), 2);
      }
      h.last = v;
    }

    // Weapon picks up the colour of nearby neon.
    if (this.weapon) {
      const P = this.glows.uniforms.uGlowPos.value;
      const C = this.glows.uniforms.uGlowCol.value;
      const col = new THREE.Color(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const dx = P[i].x - camPos.x, dy = P[i].y - camPos.y, dz = P[i].z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const k = 1 / (1 + d2 * 0.04);
        col.r += C[i].x * k;
        col.g += C[i].y * k;
        col.b += C[i].z * k;
      }
      const inten = Math.min(2.5, col.r + col.g + col.b);
      if (inten > 0.001) col.multiplyScalar(1 / (col.r + col.g + col.b));
      this.weapon.fillLight.color.copy(col);
      this.weapon.fillLight.intensity = inten * 1.2;
      const md = this.state === 'play' ? this.input.mouseDX : 0;
      const my = this.state === 'play' ? this.input.mouseDY : 0;
      this.weapon.update(dt, this.player, md, my, this.elapsed);
    }

    // Muzzle light pulse.
    this.muzzleT -= dt;
    this.muzzleLight.intensity = this.muzzleT > 0 ? 45 * (this.muzzleT / 0.06) : 0;

    // Thunder: sky flash (kept short and soft so it never hides enemies), then the roll a moment later.
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rand(40, 80);
      this.thunderFlash = 1;
      this.pendingThunder = rand(0.6, 1.6);
      this.events.thunder();
    }
    if (this.pendingThunder > 0) {
      this.pendingThunder -= dt;
      if (this.pendingThunder <= 0) this.audio.thunder();
    }
    this.thunderFlash = Math.max(0, this.thunderFlash - dt * 3);
    const flick = this.thunderFlash > 0 ? (Math.random() < 0.7 ? 1 : 0.3) : 0;
    this.hemi.intensity = 0.55 + this.thunderFlash * flick * 3.5;

    // The fountain water answers lightning and the passing train.
    this.fountain.update(this.elapsed, Math.min(1, this.thunderFlash * flick + this.train.rumble * 0.35));

    const g = this.renderer.grade.uniforms;
    this.damageFx = Math.max(0, this.damageFx - rawDt * 1.2);
    const low = this.player && this.player.alive && this.player.health < 30 ? 0.25 + Math.sin(this.elapsed * 6) * 0.1 : 0;
    g.uDamage.value = Math.max(this.damageFx, low);
    g.uFlash.value = this.thunderFlash * flick * 0.7;
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
      lights: this.scene.children.filter((o) => (o as THREE.PointLight).isPointLight).length,
      player: this.player.pos.toArray().map((v) => +v.toFixed(2)),
      zone: this.zone?.id ?? null,
      mode: this.mode,
      holstered: this.weapon.holstered,
      alert: this.security?.alert.level,
      civilians: this.crowd ? Object.entries(this.crowd.civs.reduce((m: Record<string, number>, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {})) : null,
      guards: this.security?.guards.map((g) => ({ s: g.gstate, susp: +g.suspicion.toFixed(2), p: g.pos.toArray().map((v) => +v.toFixed(1)), r: g.reinforcement })),
    };
  }
}
