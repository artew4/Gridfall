import * as THREE from 'three';
import type { Game } from '../core/Game';
import { probe } from './PerfProbe';
import type { Pipeline } from '../core/Renderer';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEV only. The fixed benchmark used to compare versions: the same camera placements and events in
 * the same order, at the current graphics preset. Each scenario is measured for `seconds` after a
 * short settle. Results include FPS, average/P95/P99 frame time, CPU and GPU ms and busy share,
 * draw calls, triangles, heap and collision-query cost.
 */
export async function bench(game: Game, seconds = 3, opts: { pipelines?: Pipeline[] } = {}) {
  const dev = (window as unknown as { __dev: { start(m: string): void; god(): void; noGuards(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void } }).__dev;
  const out: Record<string, unknown> = {};
  const valid = () => document.hasFocus() && !document.hidden && game.state === 'play';
  /**
   * One measurement that only counts if the window stayed focused, visible and in play the whole
   * time (an unfocused window is capped lower and a hidden one pauses: those numbers measure the
   * power policy, not rendering). Up to three tries.
   */
  const one = async () => {
    let r: Record<string, unknown> = {};
    for (let k = 0; k < 3; k++) {
      // A released pointer lock or a hidden tab pauses the game (nothing is drawn): resume it.
      if (game.state === 'paused') (dev as unknown as { lock(): void }).lock();
      await wait(700);
      const ok0 = valid();
      r = (await probe(game, seconds)) as unknown as Record<string, unknown>;
      if (ok0 && valid()) return { ...r, valid: true, tries: k + 1 };
    }
    return { ...r, valid: false, tries: 3 };
  };
  let turn = 0;
  const m = async (name: string) => {
    if (!opts.pipelines) {
      out[name] = await one();
      return;
    }
    // Every pipeline at the same placement, the order rotated per scenario so drift (heat, battery)
    // doesn't favour one of them.
    const ps = opts.pipelines;
    const res: Record<string, unknown> = {};
    for (let i = 0; i < ps.length; i++) {
      const p = ps[(i + turn) % ps.length];
      game.setPipeline(p);
      res[p] = await one();
    }
    turn++;
    game.setPipeline('v4');
    out[name] = res;
  };
  if (game.setting === 'desert') return benchDesert(game, dev, m, out);
  if (game.setting === 'jungle') return benchJungle(game, dev, m, out);
  if (game.setting === 'docks') return benchDocks(game, dev, m, out);
  if (game.setting === 'neonblock') return benchNeonBlock(game, dev, m, out);
  if (game.setting === 'crashsite') return benchCrashSite(game, dev, m, out);
  if (game.setting === 'oldport') return benchOldPort(game, dev, m, out);
  dev.start('story');
  dev.god();
  dev.noGuards();
  game.tokyo.security.alert.reset();
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  await m('plaza');
  dev.tp(30, 8.5, 9, 0, 0);
  dev.look(10, 6, -4);
  await m('rooftop');
  game.tokyo.setStationOpen(true);
  dev.tp(0, -6, 21, 0, 0);
  dev.look(0, -5, 28);
  await m('metroConcourse');
  dev.tp(-6, -6, 30.5, 0, 0);
  dev.look(6, -5, 33.5);
  await m('platform');
  // A train through the station (the real timetable, forced to run now).
  game.tokyo.rail.tt.now = (game.tokyo.rail.tt.upcoming(1)[0]?.time ?? game.tokyo.rail.tt.now) - 0.2;
  await m('platformTrain');
  dev.tp(0, 0, -19, 0, 0);
  dev.look(-20, 9, -24);
  game.tokyo.train.startNow(1, -160, 14);
  await m('overpassTrain');
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  game.weapon.setHolstered(false, true);
  game.tokyo.security.ambush(new THREE.Vector3(0, 0, 4), 4);
  await wait(1500);
  await m('pursuit');
  for (let i = 0; i < 8; i++) {
    dev.shoot();
    await wait(120);
  }
  game.tokyo.security.ambush(new THREE.Vector3(4, 0, 4), 6);
  await m('firefight');
  dev.noGuards();
  game.tokyo.security.alert.reset();
  return out;
}

type Dev = { start(m: string, s?: string): void; god(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void };

/** Desert Outpost: calm and storm, outside, inside, the long view, a fight in the dust. */
async function benchDesert(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  const desert = game.level as unknown as { storm: { clock: { set(p: string, i?: number): void } } };
  dev.start('arcade', 'desert');
  dev.god();
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  desert.storm.clock.set('calm', 0.06);
  dev.tp(-3, 0, 14, 0, 0);
  dev.look(10, 2, -12);
  await m('yardCalm');
  dev.tp(24.5, 3.25, 12.5, 0, 0);
  dev.look(-30, 0, -40);
  await m('towerView');
  desert.storm.clock.set('peak', 1);
  dev.tp(-3, 0, 14, 0, 0);
  dev.look(10, 2, -12);
  await m('yardStorm');
  dev.tp(-21, 0.12, -14.8, 0, 0);
  dev.look(-22.8, 1.2, -6);
  await m('interiorStorm');
  dev.tp(50, 2, 40, 0, 0);
  dev.look(0, 2, 0);
  await m('dunesStorm');
  // A wave in the dust: enemies spawned around and closing in.
  dev.tp(0, 0, 8, 0, 0);
  dev.look(0, 1.5, -10);
  game.waves.startNext();
  game.waves.startNext();
  game.waves.startNext();
  await new Promise((r) => setTimeout(r, 4000));
  for (let i = 0; i < 6; i++) {
    dev.shoot();
    await new Promise((r) => setTimeout(r, 120));
  }
  await m('fightStorm');
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  desert.storm.clock.set('calm', 0.06);
  return out;
}

/**
 * Deep Jungle (3.7, Firebase Viper): the road at the start looking up to the gate, deep in the
 * undergrowth looking through it (the worst case for foliage), the yard just inside the gate (the
 * new compound in view), inside the barracks, the watchtower overlooking the compound and the
 * forest (most geometry at once), and a shotgun fight in the yard with waves closing in.
 */
async function benchJungle(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('arcade', 'jungle');
  dev.god();
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  const h = (x: number, z: number) => game.col.terrain?.height(x, z) ?? 0;
  const st = game.level.data.start;
  dev.tp(st.x, 0, st.z, st.yaw, 0);
  dev.look(0, 3, 10);
  await m('roadApproach');
  dev.tp(-46, h(-46, -4), -4, 0, 0);
  dev.look(-28, 2, -14);
  await m('undergrowth');
  dev.tp(0, 0, 5.5, 0, 0);
  dev.look(-4, 1.5, -25);
  await m('yard');
  dev.tp(-17.3, 0.12, -29.2, 0, 0);
  dev.look(-23, 1.4, -33);
  await m('barracks');
  dev.tp(17.2, 4.5, 3.2, 0, 0);
  dev.look(-10, 0, -25);
  await m('watchtower');
  dev.tp(0, 0, -11, 0, 0);
  dev.look(0, 1.5, 10);
  game.waves.startNext();
  game.waves.startNext();
  game.waves.startNext();
  await new Promise((r) => setTimeout(r, 5000));
  const w = game.weapon as unknown as { tryFire(): boolean };
  const g = game as unknown as { shoot(): void };
  for (let i = 0; i < 4; i++) {
    if (w.tryFire()) g.shoot();
    await new Promise((r) => setTimeout(r, 900));
  }
  await m('fight');
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  return out;
}

/**
 * Jungle: Crash Site (15.0, a TDM arena): the match running, the three lanes at eye level (the ridge's
 * long line, the trench, the ravine floor), the wreck's roof, the densest undergrowth (the east
 * bank), the whole map from the ridge, then a firefight from the trench.
 */
async function benchCrashSite(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('tdm', 'crashsite');
  dev.god();
  const views: [string, [number, number, number], [number, number, number]][] = [
    ['alphaLZ', [0, 0, 59], [0, 2, 30]],
    ['ridge', [-39, 3.6, 30], [-38, 4, -30]],
    ['westTrench', [-12.5, -1.4, 27], [-4, 1.5, 4]],
    ['wreckRoof', [-5, 3.9, 0], [10, 2, -20]],
    ['wreckInside', [-8, 0.28, 0], [8, 1.5, 0]],
    ['ravine', [28.5, -4, 36], [28.5, -2.5, -20]],
    ['eastBank', [40, 0.2, 20], [40, 1.5, -20]],
    ['wholeMap', [-40, 3.6, 40], [20, 0, -20]],
  ];
  for (const [name, p, l] of views) {
    dev.tp(p[0], p[1], p[2], 0, 0);
    dev.look(l[0], l[1], l[2]);
    await m(name);
  }
  dev.tp(-12.5, -1.4, 27, 0, 0);
  const tdm = game.tdm;
  const shooter = window.setInterval(() => {
    let best: { x: number; y: number; z: number } | null = null, bd = 60;
    for (const b of tdm.bots) if (b.alive && b.team === 'omega' && b.pos.distanceTo(game.player.pos) < bd) {
      bd = b.pos.distanceTo(game.player.pos);
      best = b.pos;
    }
    if (!best) return;
    dev.look(best.x, best.y + 1.2, best.z);
    dev.shoot();
  }, 600);
  await new Promise((r) => setTimeout(r, 4000));
  await m('firefight');
  clearInterval(shooter);
  return out;
}

/**
 * Old Port (17.0, a daytime TDM arena): the match running; the three lanes at eye level (the
 * warehouse's hall and its upper floor in the skylight shafts, the yard, the dry dock's floor), the
 * stacks and the ship's bridge, the sea quay looking out over the water (the sky, the haze sheets,
 * the crane), the worst view (the whole port from the stacks into the sun side), then a firefight.
 */
async function benchOldPort(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('tdm', 'oldport');
  dev.god();
  const views: [string, [number, number, number], [number, number, number]][] = [
    ['alphaYard', [0, 0, 57], [0, 2, 30]],
    ['hall', [-36, 0, 30], [-36, 1.5, -30]],
    ['upperFloor', [-41.5, 4.4, 26], [-36, 5, -20]],
    ['yard', [0, 0, 28], [0, 1.5, -28]],
    ['stacks', [-14, 5.2, 20.4], [10, 1, -20]],
    ['dryDock', [25.8, -4.5, 30], [25.8, -3, -30]],
    ['bridge', [30, 3.6, 2], [0, 2, -30]],
    ['seaQuay', [40, 0, 20], [120, 4, -20]],
    ['wholePort', [-18, 5.2, 21], [36, 0, -40]],
  ];
  for (const [name, p, l] of views) {
    dev.tp(p[0], p[1], p[2], 0, 0);
    dev.look(l[0], l[1], l[2]);
    await m(name);
  }
  dev.tp(0, 0, 28, 0, 0);
  const tdm = game.tdm;
  const shooter = window.setInterval(() => {
    let best: { x: number; y: number; z: number } | null = null, bd = 60;
    for (const b of tdm.bots) if (b.alive && b.team === 'omega' && b.pos.distanceTo(game.player.pos) < bd) {
      bd = b.pos.distanceTo(game.player.pos);
      best = b.pos;
    }
    if (!best) return;
    dev.look(best.x, best.y + 1.2, best.z);
    dev.shoot();
  }, 600);
  await new Promise((r) => setTimeout(r, 4000));
  await m('firefight');
  clearInterval(shooter);
  return out;
}

/**
 * Tokyo: Neon Block (14.0, a TDM arena): the match running (nine bots, the player in god mode), the
 * three lanes at eye level, the roofs, the footbridge, the worst view (the whole block from Block W's
 * roof: every facade, sign and light in frame), then a firefight from the street.
 */
async function benchNeonBlock(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('tdm', 'neonblock');
  dev.god();
  const views: [string, [number, number, number], [number, number, number]][] = [
    ['alphaYard', [0, 0, 61], [0, 2, 30]],
    ['mainStreet', [0, 0, 44], [0, 2, -40]],
    ['lanternAlley', [-35, 0, 44], [-35, 2, -30]],
    ['fireEscape', [-32.4, 4.5, 31], [-24, 7, 10]],
    ['westRoofs', [-22, 7.2, 40], [-20, 6, -40]],
    ['footbridge', [0, 4.5, 14], [0, 3, -30]],
    ['eastRoofs', [22, 4.5, 40], [24, 4, -30]],
    ['serviceAlley', [34.5, 0, 44], [34, 2, -30]],
    ['wholeBlock', [-28, 7.2, 44], [10, 0, -30]],
  ];
  for (const [name, p, l] of views) {
    dev.tp(p[0], p[1], p[2], 0, 0);
    dev.look(l[0], l[1], l[2]);
    await m(name);
  }
  dev.tp(0, 0, 30, 0, 0);
  const tdm = game.tdm;
  const shooter = window.setInterval(() => {
    let best: { x: number; y: number; z: number } | null = null, bd = 60;
    for (const b of tdm.bots) if (b.alive && b.team === 'omega' && b.pos.distanceTo(game.player.pos) < bd) {
      bd = b.pos.distanceTo(game.player.pos);
      best = b.pos;
    }
    if (!best) return;
    dev.look(best.x, best.y + 1.2, best.z);
    dev.shoot();
  }, 600);
  await new Promise((r) => setTimeout(r, 4000));
  await m('firefight');
  clearInterval(shooter);
  return out;
}

/**
 * Neon Docks (8.0, a TDM arena): every view with the match running (nine bots, the player in god
 * mode), because that is the only way the level is played. The three lanes at eye level, the views
 * from the container tops and the catwalk, the crane, then a firefight from the forecourt.
 */
async function benchDocks(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('tdm', 'docks');
  dev.god();
  const views: [string, [number, number, number], [number, number, number]][] = [
    ['alphaYard', [0, 0, 72], [0, 2, 40]],
    ['stacks', [-37, 0, 16], [-37, 1.5, -20]],
    ['stacksTop', [-33, 2.6, 20], [-45, 1, -10]],
    ['warehouseFloor', [0, 0, 22], [0, 3, -20]],
    ['catwalk', [-12.1, 4.5, 20], [8, 2, -10]],
    ['quay', [33, 0, 48], [30, 2, -40]],
    ['crane', [30, 0, 8], [40, 12, -6]],
    // 15.0: the raised walks.
    ['quayGantry', [19.2, 6.5, 26], [0, 2, -10]],
    ['craneNest', [21.3, 6.5, 0], [-6, 1, 6]],
    ['containerGantry', [-45, 2.6, 30], [-40, 1, -20]],
  ];
  for (const [name, p, l] of views) {
    dev.tp(p[0], p[1], p[2], 0, 0);
    dev.look(l[0], l[1], l[2]);
    await m(name);
  }
  // Firefight: from the forecourt, at the nearest OMEGA bot, every 0.6 s.
  dev.tp(0, 0, 40, 0, 0);
  const tdm = game.tdm;
  const shooter = window.setInterval(() => {
    let best: { x: number; y: number; z: number } | null = null, bd = 60;
    for (const b of tdm.bots) if (b.alive && b.team === 'omega' && b.pos.distanceTo(game.player.pos) < bd) {
      bd = b.pos.distanceTo(game.player.pos);
      best = b.pos;
    }
    if (!best) return;
    dev.look(best.x, best.y + 1.2, best.z);
    dev.shoot();
  }, 600);
  await new Promise((r) => setTimeout(r, 4000));
  await m('firefight');
  clearInterval(shooter);
  return out;
}
