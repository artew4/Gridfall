import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Weapon } from '../../player/Weapon';
import type { FrameInfo, IntroLike, LevelData, LevelInfo, LevelLook, LevelRuntime } from '../Level';
import { buildDocks, type DocksResult } from './Docks';
import { BARGES, BASE, DEPOT, DOCKS_AI, DOCKS_TEAM_SIZE, QUAY_X, SPAWN_PADS, SPAWN_ZONES, WEST_X, inBase, lanesOf } from './DocksLayout';
import { DesertIntro } from '../desert/DesertIntro';
import { Rain } from '../../world/Rain';
import { ReflectionCatchers } from '../../world/ReflectionCatchers';
import { WET4, createStreak, updateStreaks } from '../../world/Ground';
import { damp } from '../../core/math';
import { fogRange } from '../../world/Visibility';
import { NEON_SYNTHS } from '../../entities/enemies/neon';

export const DOCKS_INFO: LevelInfo = {
  id: 'docks',
  name: 'NEON DOCKS',
  biome: 'docks',
  jp: 'НЕОНОВЫЕ ДОКИ',
  blurb: 'A rain-soaked container harbour at night, 9v9: the stacks, the roofed warehouse, the quay, the depot and the barges.',
  // 32.0: 9v9 (was 5v5: the emptiest map, 27 walkable 8 m cells a player and 44% quiet seconds).
  // Self-play over 5–10 a side (docs/BENCH-32.0.json): 9 is the knee (quiet seconds 10%, as 10v10).
  teamSize: DOCKS_TEAM_SIZE,
  modes: ['tdm'],
  loading: 'LIGHTING THE DOCKS…',
  windowTitle: 'Gridfall — Neon Docks',
  // OMEGA are synths (neon visors, plasma bolts) on the docks; ALPHA keeps the garrison look.
  enemies: NEON_SYNTHS,
  music: 'docks_theme',
  tagline: 'THREE LANES · ONE HARBOUR',
  jpLine: 'ДОК-7 · ЗОНА ПОГРУЗКИ · 03:12',
  place: 'DOCK 7, KAWASAKI',
  clock: '03:12',
  cine: {
    tdm: { t1: 'GRIDFALL', t2: 'ДОК-7 · NEON DOCKS', t3: 'TEAM DEATHMATCH 9v9 · ALPHA vs OMEGA<br/>THE STACKS · THE WAREHOUSE · THE QUAY' },
  },
};

const FOG = 0x0b0d17;
/** 32.0: the docks' rain (Rain's defaults are Tokyo's). */
export const DOCKS_RAIN = { drops: 6000, width: 0.6, length: 0.9, alpha: 0.5, glow: 1.1, nearFade: [2, 5.5] as [number, number], splash: 0.6 };

/**
 * Neon Docks (8.0): a Team Deathmatch arena, three lanes on a wet harbour at night. Tokyo's 4.0
 * pipeline: the wet ground model (puddles, ripples, roughness field), reflection catchers and neon
 * streaks, rain lit by the glows, an environment map of the lit docks, the teal/orange grade.
 */
export class DocksLevel implements LevelRuntime {
  readonly info = DOCKS_INFO;
  data: LevelData;
  // 32.0: muted (was bloom 0.7 over 1.0, warm 1.14 / 0.96 / 0.8, saturation 1.15): a softer bloom from
  // brighter sources only, the warm split nearly neutral, deeper blues in the shadows, saturation below 1.
  // Exposure 1.12 → 1.24: the rain's own glow is mostly gone, and 8.1's lesson was "too dark to play".
  readonly look: LevelLook = {
    exposure: 1.24,
    bloom: { strength: 0.5, radius: 0.85, threshold: 1.15 },
    shadows: false,
    shadowTint: [0.004, 0.01, 0.03],
    grade: { split: 1, teal: [0.0, 0.012, 0.03], warm: [1.05, 0.98, 0.93], sat: 0.9 },
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
    // 32.0: the sky's light a greyer, deeper blue (was 0x46559a / 0x24182c, moon 0x5868a8).
    s.add(new THREE.HemisphereLight(0x3f4a6c, 0x1e1a26, 1.0));
    const moon = new THREE.DirectionalLight(0x56628c, 0.3);
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
      bounds: new THREE.Box2(new THREE.Vector2(WEST_X - 3, -BASE.z1 - 2), new THREE.Vector2(BARGES.hulls[0].x1 + 3, BASE.z1 + 2)),
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
        // 28.0: spawn pads anywhere on the map (SpawnManager); the yards stay for the 'bases' A/B.
        pads: SPAWN_PADS,
        // 31.0: the deployment zones (the default spawning since 31.0; the pads above are the DEV A/B).
        zones: SPAWN_ZONES,
        // 28.0: the quay and the barges are long open lines: pressure from a little further off.
        // 41.0: densityR, the spawns' and fireteams' local area (container lanes).
        spawnTuning: { near: 50, hardMin: 20, sight: 80, densityR: 14 },
        arena: DOCKS_AI,
        inBase: (team, p) => inBase(p, team),
        start,
        // 15.0: the containers (west), the warehouse and its alley (centre), the quay (east); the
        // yards and the walls in front of them are no lane.
        laneOf: (x, _y, z) => (Math.abs(z) > 52 ? null : x < -16 ? 0 : x > 16 ? 2 : 1),
        laneNames: ['containers', 'warehouse', 'waterfront'],
        // 28.0: the outer edges: the outer container rows (west of the maze's last column) and the
        // waterfront's outer strip (the quay edge and, past it, the barges).
        edgeOf: (x, _y, z) => Math.abs(z) <= 58 && (x < -46 || x > 38),
        // 28.0: the edges' high-value areas for the patrols (the pads and lanes are added to these):
        // the depot's alleys and its perch, each barge, the middle pontoon.
        hvas: [
          ...[[-66.6, 0, 12], [-61, 0, 24], [-64, DEPOT.stack.top, 17.8], [-55.4, 0, 40], [51.9, BARGES.deck, 14], [51.9, BARGES.deck, 40], [51.5, BARGES.pontoon, 31]].flatMap(([x, y, z]) => [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z)]),
          new THREE.Vector3(51.5, BARGES.pontoon, 0),
        ],
      },
    };
  }

  attach() {
    const game = this.game;
    // After the engine built the halos: the rain lights its drops from the same glows.
    // 32.0: lighter rain ("unplayable"): 6,000 streaks (was 14,000), 60% as wide, at half the opacity,
    // lit half as hard by the lamps, and none within 2 m of the eye (they crossed the screen).
    this.rain = new Rain(game.scene, game.glows, game.time, game.fog, { ...this.docks.rain, holes: game.col.holes }, DOCKS_RAIN);
    // The rain and the floods: enemies see as far as you do (the fog's 90% distance, ~95 m).
    game.ctx.sightRange = fogRange(game.fog.density);
    game.weapon.setLights({ sky: 0x56628c, ground: 0x241e2a, hemi: 0.9, key: 0xe8cfb0, keyI: 1.6, rim: 0x8a78d0, rimI: 0.8 });
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

  /**
   * Anything in the harbour drowns. 28.0: in it means below the quay past its edge (the barges and
   * pontoons are past the edge too, above the water).
   */
  private drown() {
    const game = this.game;
    const edge = QUAY_X + 0.4;
    const wet = (p: THREE.Vector3) => p.x > edge && p.y < -0.8;
    if (game.player.alive && wet(game.player.pos)) {
      this.drowned++;
      game.ctx.damagePlayer(1000, game.player.pos.clone());
    }
    if (game.mode !== 'tdm') return;
    for (const b of game.tdm.bots) {
      if (b.alive && wet(b.pos)) {
        this.drowned++;
        b.hurt(10000, b.pos.clone(), null);
      }
    }
  }

  lightWeapon(weapon: Weapon) {
    weapon.setKey(1.5 - this.indoors * 0.3);
    weapon.fillLight.color.setRGB(0.75, 0.7, 0.95);
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
    this.rain?.dispose();
    game.audio.setUnderground(0);
  }

  debug() {
    return { indoors: +this.indoors.toFixed(2), drowned: this.drowned, nodes: this.docks.nav.nodes.length, laneProblems: this.docks.laneProblems.length };
  }
}
