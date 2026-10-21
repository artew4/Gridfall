import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildDocks, type DocksResult } from './Docks';
import { BASE, QUAY_X, inBase, lanesOf } from './DocksLayout';
import { DesertIntro } from '../desert/DesertIntro';
import { Rain } from '../../world/Rain';
import { ReflectionCatchers } from '../../world/ReflectionCatchers';
import { WET4, createStreak, updateStreaks } from '../../world/Ground';
import { damp } from '../../core/math';
import { fogRange } from '../../world/Visibility';
import { JACKAL_AR } from '../../entities/weapons/jackal';
import { NEON_SYNTHS } from '../../entities/enemies/neon';

export const DOCKS_INFO: LevelInfo = {
  id: 'docks',
  name: 'NEON DOCKS',
  jp: 'ネオン埠頭',
  blurb: 'A rain-soaked container harbour at night, built for 5v5: the stacks, the warehouse, the quay.',
  modes: ['tdm'],
  loading: 'LIGHTING THE DOCKS…',
  windowTitle: 'NEON RAIN — Neon Docks',
  // OMEGA are synths (neon visors, plasma bolts) on the docks; ALPHA keeps the garrison look.
  arsenal: { weapon: JACKAL_AR, enemies: NEON_SYNTHS },
  music: 'docks_theme',
  tagline: 'THREE LANES · ONE HARBOUR',
  jpLine: '第七埠頭 · 午前三時',
  place: 'DOCK 7, KAWASAKI',
  clock: '03:12',
  cine: {
    tdm: { t1: 'NEON RAIN', t2: 'ネオン埠頭 · NEON DOCKS', t3: 'TEAM DEATHMATCH 5v5 · ALPHA vs OMEGA<br/>THE STACKS · THE WAREHOUSE · THE QUAY' },
  },
};

const FOG = 0x0b0d17;

/**
 * Neon Docks (8.0): a Team Deathmatch arena, three lanes on a wet harbour at night. Tokyo's 4.0
 * pipeline: the wet ground model (puddles, ripples, roughness field), reflection catchers and neon
 * streaks, rain lit by the glows, an environment map of the lit docks, the teal/orange grade.
 */
export class DocksLevel implements LevelRuntime {
  readonly info = DOCKS_INFO;
  data: LevelData;
  readonly look: LevelLook = {
    exposure: 1.12,
    bloom: { strength: 0.7, radius: 0.85, threshold: 1.0 },
    shadows: false,
    shadowTint: [0.004, 0.01, 0.028],
    grade: { split: 1, teal: [0.0, 0.014, 0.024], warm: [1.14, 0.96, 0.8], sat: 1.15 },
    legacy: { exposure: 1.0, bloom: { strength: 0.85, radius: 0.65, threshold: 0.92 }, shadows: false, shadowTint: [0.012, 0.01, 0.03] },
  };
  flash = 0;
  private docks: DocksResult;
  private env: THREE.WebGLRenderTarget;
  private catchers: ReflectionCatchers;
  private streaks: THREE.Mesh[] = [];
  private rain!: Rain;
  private indoors = 0;
  /** Bodies that went into the water (the fence should make this 0; DEV counter). */
  drowned = 0;

  constructor(private game: Game) {
    const s = game.scene;
    s.background = new THREE.Color(FOG);
    game.fog.color.set(FOG);
    // ~90% at 95 m: the quay's long sightlines read, the far end fades into the rain.
    game.fog.density = 0.016;
    s.add(new THREE.HemisphereLight(0x46559a, 0x24182c, 1.0));
    const moon = new THREE.DirectionalLight(0x5868a8, 0.3);
    moon.position.set(40, 60, -30);
    s.add(moon);

    this.docks = buildDocks(s, game.col, game.glows, game.time, game.fog);
    if (this.docks.laneProblems.length) console.warn('[docks] lane waypoints on blocked floor', this.docks.laneProblems);

    // Environment map of the lit docks, once: wet concrete and steel reflect the floods and the neon.
    game.glows.update(0, new THREE.Vector3());
    const pmrem = new THREE.PMREMGenerator(game.renderer.renderer);
    this.env = pmrem.fromScene(s, 0.02, 0.1, 300, { position: new THREE.Vector3(10, 4, 0) } as never);
    s.environment = this.env.texture;
    s.environmentIntensity = 0.85;
    game.weaponScene.environment = this.env.texture;
    pmrem.dispose();

    this.catchers = new ReflectionCatchers(game.glows.list, this.docks.catcherPicks, { intensity: 12, distance: 16, height: 4 });
    for (const g of game.glows.list) {
      if (!g.reflect) continue;
      const m = createStreak(g, game.time, game.fog);
      this.streaks.push(m);
      s.add(m);
    }

    const d = this.docks;
    const start = { x: 0, z: 72, yaw: 0, y: 0 };
    this.data = {
      start,
      bounds: new THREE.Box2(new THREE.Vector2(-57, -BASE.z1 - 2), new THREE.Vector2(QUAY_X + 2, BASE.z1 + 2)),
      floorMin: -1,
      nav: d.nav,
      // No survival on the docks: these are only for the DEV nav checks (spawn → every goal).
      spawns: [...d.spawns.alpha, ...d.spawns.omega, ...lanesOf('alpha').flat()],
      perches: [],
      coverPoints: d.coverPoints,
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
      },
    };
  }

  attach() {
    const game = this.game;
    // After the engine built the halos: the rain lights its drops from the same glows.
    this.rain = new Rain(game.scene, game.glows, game.time, game.fog, { ...this.docks.rain, holes: game.col.holes });
    // The rain and the floods: enemies see as far as you do (the fog's 90% distance, ~95 m).
    game.ctx.sightRange = fogRange(game.fog.density);
    game.weapon.setLights({ sky: 0x5a6aa8, ground: 0x2a1c2c, hemi: 0.9, key: 0xffc890, keyI: 1.6, rim: 0xff4ad8, rimI: 0.9 });
  }

  startAudio() {
    this.game.audio.setAmbience('city');
  }

  private inside(p: THREE.Vector3) {
    const r = this.docks.indoor;
    return p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y < r.h;
  }

  update(f: FrameInfo) {
    const game = this.game;
    game.glows.update(f.elapsed, f.camPos);
    this.catchers.update();
    updateStreaks(this.streaks, f.camPos);
    this.rain.update(f.elapsed, f.camPos);
    this.indoors = damp(this.indoors, this.inside(f.camPos) ? 1 : 0, 6, f.rawDt);
    game.audio.setUnderground(this.indoors * 0.5);
    this.drown();
  }

  /** Backstop behind the quay fence: anything in the harbour drowns. */
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
    weapon.setKey(1.5 - this.indoors * 0.3);
    weapon.fillLight.color.setRGB(1, 0.6, 0.9);
    weapon.fillLight.intensity = 0.5;
  }

  titleCamera(cam: THREE.PerspectiveCamera, t: number) {
    const a = t * 0.03 + 0.6;
    cam.position.set(18 + Math.cos(a) * 62, 22 + Math.sin(t * 0.1) * 2, Math.sin(a) * 62);
    cam.lookAt(0, 4, 0);
  }

  createIntro(): IntroLike {
    const st = this.data.tdm!.start;
    const ey = st.y + 1.65;
    // From over the water, past the crane and down the quay, over the stacks into ALPHA's yard.
    return new DesertIntro(
      new THREE.Vector3(st.x, ey, st.z),
      new THREE.Vector3(st.x, ey, st.z - 10),
      [new THREE.Vector3(86, 30, -44), new THREE.Vector3(56, 20, -6), new THREE.Vector3(30, 12, 30), new THREE.Vector3(6, 7, 56), new THREE.Vector3(0, 3.6, 76)],
      new THREE.Vector3(32, 10, 0),
      new THREE.Vector3(0, 3, 40),
    );
  }

  aboard() {
    return false;
  }

  reset() {}

  setVisual(v4: boolean) {
    WET4.value = v4 ? 1 : 0;
    this.catchers.setEnabled(v4);
  }

  dispose() {
    const game = this.game;
    WET4.value = 1;
    this.catchers.dispose();
    this.env.dispose();
    game.audio.setUnderground(0);
  }

  debug() {
    return { indoors: +this.indoors.toFixed(2), drowned: this.drowned, nodes: this.docks.nav.nodes.length, laneProblems: this.docks.laneProblems.length };
  }
}
