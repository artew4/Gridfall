import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { damp, heldNoise, rand } from '../../core/math';
import { City } from '../../world/City';
import type { SignGlow } from '../../world/Signs';
import { buildDistrict, type DistrictResult } from '../../world/District';
import { Fountain } from '../../world/Fountain';
import { Events } from '../../world/Events';
import { createStreak, updateStreaks, WET4 } from '../../world/Ground';
import { applyAO, bakeAO, type AOBake } from '../../world/AOField';
import { ReflectionCatchers } from '../../world/ReflectionCatchers';
import { Rain, Steam } from '../../world/Rain';
import { Train } from '../../world/Train';
import { smokeTexture } from '../../world/Textures';
import { zoneAt } from '../../world/Zones';
import { UG } from '../../world/Metro';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { Weapon } from '../../player/Weapon';
import { Security } from '../../stealth/Security';
import { Crowd } from '../../city/Crowd';
import { Rail } from '../../rail/Rail';
import { Manhunt } from '../../world/Manhunt';
import { Mission } from '../../story/Mission';
import { StoryPresenter } from '../../story/StoryPresenter';
import { Minimap } from '../../ui/Minimap';
import { PlayerIntel } from '../../stealth/PlayerIntel';
import { Intro } from '../../cinematic/Intro';
import { StoryIntro } from '../../cinematic/StoryIntro';
import { TokyoStory } from './TokyoStory';
import { KITSUNE_9 } from '../../entities/weapons/kitsune9';
import { NEON_SYNTHS } from '../../entities/enemies/neon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime, Mode, ModeRules } from '../Level';

export const TOKYO_INFO: LevelInfo = {
  id: 'tokyo',
  name: 'TOKYO NIGHT',
  jp: '東京 · 夜',
  blurb: 'Rain, neon and a vertical district over a metro station. Story and survival.',
  modes: ['story', 'arcade'],
  loading: 'BUILDING THE CITY…',
  windowTitle: 'NEON RAIN — Tokyo After Midnight',
  arsenal: { weapon: KITSUNE_9, enemies: NEON_SYNTHS },
  music: 'tokyo_theme',
  tagline: 'ONE NIGHT · ONE CITY · ONE WAY OUT',
  jpLine: '東京 · 午前零時二十四分',
  place: 'SHINJUKU-KU',
  clock: '02:47',
  cine: {
    story: { t1: 'NEON RAIN', t2: 'ONE NIGHT · ONE CITY · ONE WAY OUT', t3: '新宿区 三丁目 — SANCHŌME, SHINJUKU · 00:24<br/>SECURITY LOCKDOWN IN EFFECT · YOU ARE WANTED' },
    arcade: { t1: 'NEON RAIN', t2: '東京 · 午前 2:47', t3: 'ARCADE SURVIVAL · ONE STREET. ONE GUN.<br/>RAINFALL 38MM/H · VISIBILITY LOW' },
  },
};

const FOG_COLOR = new THREE.Color(0x0d0b19);

/**
 * TokyoNight: the vertical district (plaza, walkways, rooftops, the Sakura Line station), its rain,
 * neon, trains and thunder, and the systems the story runs on (security, crowd, rail, mission).
 * Built into the engine's fresh scene and collision world; the engine owns the player, weapon,
 * survival waves and enemy context.
 */
export class TokyoLevel implements LevelRuntime {
  readonly info = TOKYO_INFO;
  data: LevelData;
  /**
   * 4.0 look: bloom only from HDR emissives (threshold above the brightest lit surface, so neon,
   * lamps, flashes and sparks glow and nothing else does), moderate strength, a wide radius; a teal
   * and orange split-tone. `legacy` is the 3.7 look for the F8 comparison.
   */
  readonly look: LevelLook = {
    exposure: 1.05,
    bloom: { strength: 0.7, radius: 0.9, threshold: 1.0 },
    shadows: false,
    shadowTint: [0.004, 0.012, 0.03],
    grade: { split: 1, teal: [0.0, 0.012, 0.02], warm: [1.12, 0.97, 0.84], sat: 1.18 },
    legacy: { exposure: 1.05, bloom: { strength: 0.85, radius: 0.65, threshold: 0.92 }, shadows: false, shadowTint: [0.012, 0.01, 0.03] },
  };
  /** 4.0: street-level AO bake and the wet-street reflection catchers. */
  private ao: AOBake;
  catchers: ReflectionCatchers;
  flash = 0;

  city: City;
  district: DistrictResult;
  private rain!: Rain;
  /** The overpass train (the metro train is `rail.train`). */
  train: Train;
  private fountain: Fountain;
  events: Events;
  private streaks: THREE.Mesh[] = [];
  signs: SignGlow[];
  private hums: { glow: SignGlow; h: ReturnType<AudioEngine['addHum']>; last: number }[] = [];
  private hemi: THREE.HemisphereLight;
  private env: THREE.WebGLRenderTarget;
  private wind = 0;
  private thunderT = 25;
  private thunderFlash = 0;
  private pendingThunder = -1;

  // Story systems (built in attach, once the engine's player, nav and enemy context exist).
  security!: Security;
  crowd!: Crowd;
  rail!: Rail;
  manhunt!: Manhunt;
  mission!: Mission;
  /** Objectives, subtitles, guidance, hints (story mode). */
  story!: StoryPresenter;
  minimap!: Minimap;
  /** What the player knows about security (minimap). */
  intel!: PlayerIntel;
  /** The rules of Story Escape on this level. */
  rules!: TokyoStory;
  stationKnown = false;
  /** Environment used against security (cabinets, lamps, steam). */
  envUses = 0;
  /** Hook for the mission (reading the departures). */
  onBoardRead: () => void = () => {};

  constructor(private game: Game) {
    const s = game.scene;
    s.background = FOG_COLOR;
    game.fog.color.copy(FOG_COLOR);
    game.fog.density = 0.022;
    this.hemi = new THREE.HemisphereLight(0x3a4280, 0x1a0e22, 0.55);
    s.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x5868a8, 0.25);
    moon.position.set(-20, 60, -30);
    s.add(moon);

    this.city = new City(s, game.col, game.glows, game.time, game.fog);
    const d = buildDistrict(this.city, () => this.wind);
    this.district = d;
    this.signs = d.signs;
    this.fountain = new Fountain(this.city.ctx, game.glows);
    this.city.ctx.builder.build(s);
    this.city.buildSky();

    // 4.0: street-level AO from the collision world, into the facades, storefronts and the ground.
    this.ao = bakeAO(game.col, d.bounds.min, d.bounds.max);
    const m = this.city.mats;
    for (const mat of [...m.facade, m.concrete, m.darkConcrete, ...Object.values(m.store), m.asphalt, m.sidewalk, m.paving]) applyAO(mat, this.ao);

    // Bake an environment map of the lit district once: wet and metal surfaces reflect neon for free.
    game.glows.update(0, new THREE.Vector3());
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    this.env = pmrem.fromScene(s, 0.02, 0.1, 300, { position: new THREE.Vector3(0, 3, 4) } as never);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.9;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    // 4.0: reflection catchers at the brightest unlit neon in Lantern Street and round the plaza
    // (evaluated by the wet ground only; see ReflectionCatchers.ts).
    this.catchers = new ReflectionCatchers(game.glows.list, [
      [-3.1, 6.4, 31], [3.2, 5.6, 25], [3.1, 6.8, 37], // Lantern Street
      [12.9, 8.6, 9.5], [-9.5, 8, 13], [8, 6.2, 13.2], [-10, 8.4, -13.2], [13.9, 7, -9], // the plaza
    ]);

    for (const g of game.glows.list) {
      if (g.reflect) {
        const m = createStreak(g, game.time, game.fog);
        this.streaks.push(m);
        s.add(m);
      }
    }
    this.train = new Train(s, game.glows);
    this.train.onPass = (dir) => game.audio.trainPass(dir);
    this.train.onWarn = () => game.audio.stationChime();
    this.train.onBell = () => game.audio.crossingBell({ x: 0, y: 8.5, z: -21 });

    this.events = new Events(game.glows, game.fx, game.audio, this.signs, d.transformers, d.vents, d.trackside);

    this.data = {
      start: d.start,
      bounds: d.bounds,
      floorMin: UG,
      nav: d.nav,
      spawns: d.spawns,
      perches: d.perches,
      coverPoints: d.coverPoints,
      cabinets: d.cabinets,
      medkits: d.medkits,
      breakables: d.breakables,
      zoneAt,
    };
  }

  attach() {
    const game = this.game;
    const s = game.scene;
    const d = this.district;
    // After the engine built the halos (rain lights its drops from the same glows).
    this.rain = new Rain(s, game.glows, game.time, game.fog, {
      open: d.open,
      holes: game.col.holes,
      surfaces: d.arch.surfaces.concat([
        { x0: -5, z0: 15, x1: -3.6, z1: 48, y: 0.12 },
        { x0: 3.6, z0: 15, x1: 5, z1: 48, y: 0.12 },
        { x0: -6, z0: -58, x1: -4.6, z1: -15, y: 0.12 },
        { x0: 4.6, z0: -58, x1: 6, z1: -15, y: 0.12 },
      ]),
      shelters: d.arch.shelters.concat([{ x0: -80, z0: -26, x1: 80, z1: -21, y: 6.4 }]),
    });
    new Steam(s, game.glows, game.time, d.steamEmitters, smokeTexture(), game.fog);
    this.events.onSteam = (v) => this.security.addBlocker(v.clone().setY(v.y + 1.6), 2.4, 4.5);
    this.security = new Security(game.ctx, game.glows, () => game.weapon.visible, { radio: (pos, kind) => game.audio.radio(pos, kind) });
    this.security.doors = d.doors;
    this.security.onRadio = (text, tone) => game.storyHud.radioLine(text, tone);
    this.crowd = new Crowd(s, game.col, game.nav, d.pois);
    this.rail = new Rail(s, game.col, d.metro);
    this.rules = new TokyoStory(game, this);
    this.rail.onEvent = (e) => this.rules.onRail(e);
    for (const b of d.metro.boards) {
      game.interactables.push({ pos: b.readAt, radius: 3.2, label: 'READ DEPARTURES', enabled: () => game.mode === 'story', action: () => this.rules.readBoard() });
    }
    this.security.civilianBlocks = (a, b) => this.crowd.blocks(a, b);
    this.security.onShot = (at) => this.crowd.onGunshot(at, game.elapsed);
    this.crowd.onReport = (pos) => this.security.civilianReport(pos);
    this.crowd.onCalling = () => game.storyHud.radioLine('A WITNESS IS CALLING SECURITY — GET OUT OF SIGHT', 'warn');
    this.crowd.onScream = (pos) => game.audio.scream(pos);
    this.crowd.onAbandon = () => game.storyHud.radioLine('THE WITNESS HUNG UP', 'info');

    this.story = new StoryPresenter(game);
    this.manhunt = new Manhunt(s, game.col, d.billboard);
    this.mission = new Mission(game);
    this.intel = new PlayerIntel(game.col);
    this.minimap = new Minimap(game.hud.root, {
      street: d.open.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 })),
      upper: d.arch.decks,
      under: d.metro.rooms,
      stairs: d.arch.stairs.map((st) => ({ x0: st.x0, z0: st.z0, x1: st.x1, z1: st.z1 })),
    });
    // Hearing counts as knowing roughly where they are.
    this.security.onHeard = (g) => {
      if (g.pos.distanceTo(game.player.pos) < 30) this.intel.heard(g, game.elapsed);
    };
  }

  storyRules(): ModeRules {
    return this.rules;
  }

  startAudio() {
    const audio = this.game.audio;
    audio.setAmbience('city');
    this.hums = [];
    for (const g of this.signs) {
      if (g.hum) this.hums.push({ glow: g, h: audio.addHum(g.pos, 100 + Math.random() * 20), last: 1 });
    }
    audio.addLoop({ x: 0, y: 1, z: 0 }, 'fountain');
    audio.addLoop(this.district.pachinko, 'pachinko');
  }

  /** Arcade on this level: the station shut, nobody on the streets, no wanted screens. */
  enterArcade() {
    this.setStationOpen(false);
    this.minimap.show(false);
    this.story.clear();
    this.story.show(false);
    this.manhunt.setMode('off');
    this.crowd.setVisible(false);
    this.crowd.civs.length = 0;
  }

  /** Lockdown on/off: station shutters, the stair links in the nav graph, where civilians may walk. */
  setStationOpen(open: boolean) {
    const m = this.district.metro;
    for (const sh of m.shutters) sh.setOpen(open);
    for (const e of m.entrances) this.game.nav.setLinks([[e.chain[0], e.chain[1]], [e.chain[1], e.chain[2]]], open);
    this.crowd.setUnderground(open);
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    // Slow ambient drift behind the title, looking up Lantern Street towards the plaza.
    cam.position.set(-1.5 + Math.sin(t * 0.05) * 0.6, 0.6 + Math.sin(t * 0.13) * 0.1, 42 - Math.sin(t * 0.04) * 2);
    cam.lookAt(0.5, 3, 20);
  }

  createIntro(mode: Mode): IntroLike {
    const game = this.game;
    if (mode === 'story') {
      const st = this.district.storyStart;
      const look = new THREE.Vector3(st.x - Math.sin(st.yaw) * 10, 1.65, st.z - Math.cos(st.yaw) * 10);
      return new StoryIntro(
        {
          scene: game.scene,
          say: (sp, text, sec) => this.story.say(sp, text, sec),
          sfx: (k) => {
            if (k === 'radio') game.audio.radio(null, 'dispatch');
            else if (k === 'siren') game.audio.siren();
            else if (k === 'phone') game.audio.uiBlip();
            else this.train.startNow(1, -190);
          },
          wanted: (on) => this.manhunt.setMode(on ? 'on' : 'cycle'),
          light: game.projectiles.light,
        },
        new THREE.Vector3(st.x, 1.65, st.z),
        look,
      );
    }
    const intro = new Intro(game.scene, game.audio, game.projectiles.light, {});
    // A train rolls over the plaza while the camera glides in.
    this.train.startNow(1, -190);
    return intro;
  }

  aboard(p: THREE.Vector3) {
    return this.rail.train.inside(p);
  }

  update(f: FrameInfo) {
    const game = this.game;
    const { dt, rawDt, camPos } = f;
    game.glows.update(f.elapsed, camPos);
    this.catchers.update();
    updateStreaks(this.streaks, camPos);
    this.rain.update(f.elapsed, camPos);
    const w = this.rain.uniforms.uWind.value as THREE.Vector2;
    this.wind = (w.x - 1.0) / 1.4;
    this.train.update(dt);
    this.district.kit.update(f.elapsed, dt);
    for (const sh of this.district.metro.shutters) sh.update(dt);
    // Security fighting the fugitive right by the train holds the escape train's doors.
    // The conductor holds the doors for a fugitive fighting his way to them — not once he's aboard.
    const engaged =
      f.mode === 'story' &&
      !this.rail.train.inside(f.player.pos) &&
      this.security.guards.some((g) => g.alive && g.gstate === 'combat' && g.pos.distanceTo(f.player.pos) < 14);
    this.rail.update(dt, f.player.pos, engaged);
    const under = camPos.y < -2;
    const nearWell = game.col.holes.some((h) => Math.hypot(Math.max(h.x0 - camPos.x, 0, camPos.x - h.x1), Math.max(h.z0 - camPos.z, 0, camPos.z - h.z1)) < 12);
    game.audio.metroRumble(this.rail.train.group.visible ? (under ? 1 : nearWell ? 0.25 : 0.04) : 0, this.rail.speed);
    game.audio.setUnderground(camPos.y < -2 ? 1 : 0);
    // Thinner haze underground (no rain, stale air rather than street fog).
    game.fog.density = damp(game.fog.density, camPos.y < -2 ? 0.012 : 0.022, 2, rawDt);
    this.district.billboard.offset.y = (f.elapsed * 0.035) % 1;
    this.events.update(dt, f.elapsed, camPos, this.train.rumble);

    // Neon hum follows each sign's flicker; a sudden drop throws sparks.
    for (const h of this.hums) {
      const v = h.glow.value;
      game.audio.setHum(h.h, v);
      if (h.last > 0.7 && v < 0.3 && Math.random() < 0.25) {
        game.audio.sparkCrackle(h.glow.pos);
        game.fx.sparks(h.glow.pos.clone(), new THREE.Vector3(0, -1, 0), 8, new THREE.Color(0.8, 0.9, 1), 2);
      }
      h.last = v;
    }

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
      if (this.pendingThunder <= 0) game.audio.thunder();
    }
    this.thunderFlash = Math.max(0, this.thunderFlash - dt * 3);
    const flick = this.thunderFlash > 0 ? (heldNoise(f.elapsed, 4.1) < 0.7 ? 1 : 0.3) : 0;
    this.hemi.intensity = 0.55 + this.thunderFlash * flick * 3.5;
    this.flash = this.thunderFlash * flick;

    // The fountain water answers lightning and the passing train.
    this.fountain.update(f.elapsed, Math.min(1, this.flash + this.train.rumble * 0.35));
  }

  /** Weapon picks up the colour of nearby neon. */
  lightWeapon(weapon: Weapon, camPos: THREE.Vector3) {
    const P = this.game.glows.uniforms.uGlowPos.value;
    const C = this.game.glows.uniforms.uGlowCol.value;
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
    weapon.fillLight.color.copy(col);
    weapon.fillLight.intensity = inten * 1.2;
  }

  reset() {
    this.events.reset();
    this.rail.reset();
  }

  /** DEV comparison (F8): the 4.0 additions on (AO, wet model, catchers) or off (the 3.7 look). */
  setVisual(v4: boolean) {
    this.ao.on.value = v4 ? 1 : 0;
    WET4.value = v4 ? 1 : 0;
    this.catchers.setEnabled(v4);
  }

  dispose() {
    WET4.value = 1;
    this.catchers.dispose();
    this.env.dispose();
    this.minimap.dispose();
    this.story.dispose();
  }

  debug() {
    return {
      aoBakeMs: +this.ao.ms.toFixed(1),
      aoGrid: [this.ao.texture.image.width, this.ao.texture.image.height],
      catchers: this.catchers.list.length,
      alert: this.security.alert.level,
      civilians: Object.entries(this.crowd.civs.reduce((m: Record<string, number>, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {})),
      guards: this.security.guards.map((g) => ({ s: g.gstate, susp: +g.suspicion.toFixed(2), p: g.pos.toArray().map((v) => +v.toFixed(1)), r: g.reinforcement })),
    };
  }
}
