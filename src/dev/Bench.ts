import * as THREE from 'three';
import type { Game } from '../core/Game';
import { probe } from './PerfProbe';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEV only. The fixed benchmark used to compare versions: the same camera placements and events in
 * the same order, at the current graphics preset. Each scenario is measured for `seconds` after a
 * short settle. Results include FPS, average/P95/P99 frame time, CPU and GPU ms and busy share,
 * draw calls, triangles, heap and collision-query cost.
 */
export async function bench(game: Game, seconds = 3) {
  const dev = (window as unknown as { __dev: { start(m: string): void; god(): void; noGuards(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void } }).__dev;
  const out: Record<string, unknown> = {};
  const m = async (name: string) => {
    await wait(700);
    out[name] = await probe(game, seconds);
  };
  if (game.setting === 'desert') return benchDesert(game, dev, m, out);
  if (game.setting === 'jungle') return benchJungle(game, dev, m, out);
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
 * Deep Jungle: the temple from the approach, deep in the undergrowth looking through it (the worst
 * case for foliage), the forest from the upper terrace, inside the shrine, low in the mist, and a
 * shotgun fight with a wave closing in.
 */
async function benchJungle(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('arcade', 'jungle');
  dev.god();
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  const h = (x: number, z: number) => game.col.terrain?.height(x, z) ?? 0;
  dev.tp(0, 0, 24, 0, 0);
  dev.look(0, 4, 0);
  await m('templeApproach');
  dev.tp(-38, h(-38, 22), 22, 0, 0);
  dev.look(0, 2, 0);
  await m('undergrowth');
  dev.tp(0, 3, 6.2, 0, 0);
  dev.look(0, 2, 45);
  await m('terraceOverlook');
  dev.tp(-30, h(-30, -50), -50, 0, 0);
  dev.look(30, 2, 40);
  await m('forestLongView');
  dev.tp(0, 3, 2.5, 0, 0);
  dev.look(0, 4, -3);
  await m('shrine');
  dev.tp(0, 1.5, 9.5, 0, 0);
  dev.look(0, 1.5, 30);
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
